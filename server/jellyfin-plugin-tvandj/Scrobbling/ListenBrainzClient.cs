using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>ListenBrainz's listen API (listenbrainz.readthedocs.io): each person's own user token.</summary>
public class ListenBrainzClient(IHttpClientFactory httpClientFactory)
{
    private const string Api = "https://api.listenbrainz.org/1/";

    /// <summary>The token's ListenBrainz username, or null when it isn't valid.</summary>
    public async Task<string?> Validate(string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, Api + "validate-token");
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", token);
        using var response = await httpClientFactory.CreateClient().SendAsync(request, ct).ConfigureAwait(false);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(ct).ConfigureAwait(false);
        return json.TryGetProperty("valid", out var valid) && valid.GetBoolean() ? json.GetProperty("user_name").GetString() : null;
    }

    public Task NowPlaying(string token, Track track, CancellationToken ct) => Submit(token, "playing_now", track, null, ct);

    public Task Listen(string token, Track track, DateTimeOffset startedAt, CancellationToken ct) => Submit(token, "single", track, startedAt, ct);

    private async Task Submit(string token, string type, Track t, DateTimeOffset? listenedAt, CancellationToken ct)
    {
        var info = new JsonObject { ["media_player"] = "Jellyfin", ["submission_client"] = "TV and J" };
        if (t.DurationSeconds is { } d) info["duration_ms"] = d * 1000;
        if (t.TrackNumber is { } n) info["tracknumber"] = n;
        if (!string.IsNullOrEmpty(t.RecordingMbid)) info["recording_mbid"] = t.RecordingMbid;
        if (!string.IsNullOrEmpty(t.ReleaseMbid)) info["release_mbid"] = t.ReleaseMbid;
        if (t.ArtistMbids.Count > 0) info["artist_mbids"] = new JsonArray(t.ArtistMbids.Select(m => (JsonNode)m).ToArray());

        var metadata = new JsonObject { ["artist_name"] = t.Artist, ["track_name"] = t.Title, ["additional_info"] = info };
        if (!string.IsNullOrEmpty(t.Album)) metadata["release_name"] = t.Album;
        var listen = new JsonObject { ["track_metadata"] = metadata };
        if (listenedAt is { } at) listen["listened_at"] = at.ToUnixTimeSeconds();

        using var request = new HttpRequestMessage(HttpMethod.Post, Api + "submit-listens")
        {
            Content = JsonContent.Create(new JsonObject { ["listen_type"] = type, ["payload"] = new JsonArray(listen) }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Token", token);
        using var response = await httpClientFactory.CreateClient().SendAsync(request, ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new ScrobbleException($"ListenBrainz answered {(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false)}");
        }
    }
}
