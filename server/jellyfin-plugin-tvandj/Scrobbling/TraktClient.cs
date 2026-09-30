using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>A Trakt device code: the person enters UserCode at VerificationUrl.</summary>
public record TraktDeviceCode(string DeviceCode, string UserCode, string VerificationUrl, int ExpiresIn, int Interval);

public record TraktTokens(string AccessToken, string RefreshToken, long ExpiresAt);

public enum TraktPoll
{
    Pending,
    Approved,
    Expired,
    Denied,
}

/// <summary>Trakt's API (trakt.docs.apiary.io): device sign-in, token refresh, and scrobbling.</summary>
public class TraktClient(IHttpClientFactory httpClientFactory)
{
    private const string Api = "https://api.trakt.tv/";

    public async Task<TraktDeviceCode> StartDeviceSignIn(string clientId, CancellationToken ct)
    {
        var json = await Send(HttpMethod.Post, "oauth/device/code", clientId, null, new JsonObject { ["client_id"] = clientId }, ct).ConfigureAwait(false);
        return new TraktDeviceCode(
            json.GetProperty("device_code").GetString()!,
            json.GetProperty("user_code").GetString()!,
            json.GetProperty("verification_url").GetString()!,
            json.GetProperty("expires_in").GetInt32(),
            json.GetProperty("interval").GetInt32());
    }

    /// <summary>Whether the person has approved the device code yet, and the tokens once they have.</summary>
    public async Task<(TraktPoll Status, TraktTokens? Tokens)> PollDeviceSignIn(string clientId, string secret, string deviceCode, CancellationToken ct)
    {
        var body = new JsonObject { ["code"] = deviceCode, ["client_id"] = clientId, ["client_secret"] = secret };
        using var response = await Request(HttpMethod.Post, "oauth/device/token", clientId, null, body, ct).ConfigureAwait(false);
        return (int)response.StatusCode switch
        {
            200 => (TraktPoll.Approved, ReadTokens(await response.Content.ReadFromJsonAsync<JsonElement>(ct).ConfigureAwait(false))),
            400 or 429 => (TraktPoll.Pending, null), // 400: not yet; 429: polling too fast
            410 or 404 or 409 => (TraktPoll.Expired, null),
            418 => (TraktPoll.Denied, null),
            var code => throw new ScrobbleException($"Trakt answered {code}."),
        };
    }

    public async Task<TraktTokens> Refresh(string clientId, string secret, string refreshToken, CancellationToken ct)
    {
        var body = new JsonObject
        {
            ["refresh_token"] = refreshToken,
            ["client_id"] = clientId,
            ["client_secret"] = secret,
            ["redirect_uri"] = "urn:ietf:wg:oauth:2.0:oob",
            ["grant_type"] = "refresh_token",
        };
        return ReadTokens(await Send(HttpMethod.Post, "oauth/token", clientId, null, body, ct).ConfigureAwait(false));
    }

    public async Task<string> Username(string clientId, string accessToken, CancellationToken ct)
    {
        var json = await Send(HttpMethod.Get, "users/settings", clientId, accessToken, null, ct).ConfigureAwait(false);
        return json.GetProperty("user").GetProperty("username").GetString()!;
    }

    public async Task Revoke(string clientId, string secret, string accessToken, CancellationToken ct)
    {
        var body = new JsonObject { ["token"] = accessToken, ["client_id"] = clientId, ["client_secret"] = secret };
        using var _ = await Request(HttpMethod.Post, "oauth/revoke", clientId, null, body, ct).ConfigureAwait(false);
    }

    /// <summary>
    /// Scrobble a movie or episode: <paramref name="action"/> is start, pause or stop. `item` is
    /// {"movie": …} or {"show": …, "episode": …}; progress is 0–100.
    /// </summary>
    public async Task Scrobble(string clientId, string accessToken, string action, JsonObject item, double progress, CancellationToken ct)
    {
        item["progress"] = Math.Round(progress, 2);
        using var response = await Request(HttpMethod.Post, $"scrobble/{action}", clientId, accessToken, item, ct).ConfigureAwait(false);
        // 409: Trakt already has this scrobble (e.g. a stop right after another); nothing to do.
        if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.Conflict)
        {
            throw new ScrobbleException($"Trakt answered {(int)response.StatusCode} to scrobble/{action}.");
        }
    }

    private static TraktTokens ReadTokens(JsonElement json) => new(
        json.GetProperty("access_token").GetString()!,
        json.GetProperty("refresh_token").GetString()!,
        json.GetProperty("created_at").GetInt64() + json.GetProperty("expires_in").GetInt64());

    private async Task<JsonElement> Send(HttpMethod method, string path, string clientId, string? accessToken, JsonObject? body, CancellationToken ct)
    {
        using var response = await Request(method, path, clientId, accessToken, body, ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new ScrobbleException($"Trakt answered {(int)response.StatusCode}.");
        }

        return await response.Content.ReadFromJsonAsync<JsonElement>(ct).ConfigureAwait(false);
    }

    private async Task<HttpResponseMessage> Request(HttpMethod method, string path, string clientId, string? accessToken, JsonObject? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, Api + path);
        request.Headers.Add("trakt-api-version", "2");
        request.Headers.Add("trakt-api-key", clientId);
        // Trakt turns away requests without a user agent.
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("TVandJ", Plugin.Instance?.Version.ToString() ?? "1"));
        if (accessToken is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        if (body is not null) request.Content = JsonContent.Create(body);
        return await httpClientFactory.CreateClient().SendAsync(request, ct).ConfigureAwait(false);
    }
}
