using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>Last.fm's scrobbling API (last.fm/api/scrobbling): every call signed with the app's secret.</summary>
public class LastfmClient(IHttpClientFactory httpClientFactory)
{
    private const string Endpoint = "https://ws.audioscrobbler.com/2.0/";

    /// <summary>Swaps a username and password for a session key that never expires. The password isn't kept.</summary>
    public async Task<(string User, string SessionKey)> Login(string apiKey, string secret, string username, string password, CancellationToken ct)
    {
        var json = await Call(apiKey, secret, new() { ["method"] = "auth.getMobileSession", ["username"] = username, ["password"] = password }, ct)
            .ConfigureAwait(false);
        var session = json.GetProperty("session");
        return (session.GetProperty("name").GetString()!, session.GetProperty("key").GetString()!);
    }

    public Task NowPlaying(string apiKey, string secret, string sessionKey, Track track, CancellationToken ct) =>
        Call(apiKey, secret, TrackParams("track.updateNowPlaying", sessionKey, track), ct);

    public Task Scrobble(string apiKey, string secret, string sessionKey, Track track, DateTimeOffset startedAt, CancellationToken ct)
    {
        var p = TrackParams("track.scrobble", sessionKey, track);
        p["timestamp"] = startedAt.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Call(apiKey, secret, p, ct);
    }

    private static Dictionary<string, string> TrackParams(string method, string sessionKey, Track t)
    {
        var p = new Dictionary<string, string> { ["method"] = method, ["sk"] = sessionKey, ["artist"] = t.Artist, ["track"] = t.Title };
        if (!string.IsNullOrEmpty(t.Album)) p["album"] = t.Album;
        if (!string.IsNullOrEmpty(t.AlbumArtist) && t.AlbumArtist != t.Artist) p["albumArtist"] = t.AlbumArtist;
        if (t.DurationSeconds is { } d) p["duration"] = d.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (t.TrackNumber is { } n) p["trackNumber"] = n.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (!string.IsNullOrEmpty(t.RecordingMbid)) p["mbid"] = t.RecordingMbid;
        return p;
    }

    private async Task<JsonElement> Call(string apiKey, string secret, Dictionary<string, string> p, CancellationToken ct)
    {
        p["api_key"] = apiKey;
        p["api_sig"] = Sign(p, secret);
        p["format"] = "json";
        using var response = await httpClientFactory.CreateClient().PostAsync(Endpoint, new FormUrlEncodedContent(p), ct).ConfigureAwait(false);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct).ConfigureAwait(false);
        if (json.ValueKind == JsonValueKind.Object && json.TryGetProperty("error", out _))
        {
            throw new ScrobbleException(json.TryGetProperty("message", out var m) ? m.GetString() ?? "Last.fm refused." : "Last.fm refused.");
        }

        response.EnsureSuccessStatusCode();
        return json;
    }

    /// <summary>MD5 of every parameter (bar format), sorted by name, as name then value, then the secret.</summary>
    public static string Sign(IReadOnlyDictionary<string, string> p, string secret)
    {
        var text = new StringBuilder();
        foreach (var (key, value) in p.Where(kv => kv.Key != "format" && kv.Key != "callback").OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            text.Append(key).Append(value);
        }

        text.Append(secret);
        return Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(text.ToString()))).ToLowerInvariant();
    }
}
