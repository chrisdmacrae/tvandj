using System.ComponentModel.DataAnnotations;
using System.Net.Mime;
using Jellyfin.Plugin.TvAndJ.Scrobbling;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.TvAndJ.Api;

/// <summary>One service's state for the signed-in person. Keys and tokens are never sent.</summary>
/// <param name="Available">The server can scrobble to it (Last.fm and Trakt need the admin's app credentials).</param>
/// <param name="Connected">This person has connected their account.</param>
/// <param name="Username">Their username on the service.</param>
public record ScrobbleService(bool Available, bool Connected, string? Username);

/// <param name="TraktWatchlistSync">My List (unwatched) goes to their Trakt watchlist.</param>
public record ScrobbleStatus(ScrobbleService Lastfm, ScrobbleService ListenBrainz, ScrobbleService Trakt, bool TraktWatchlistSync);

public record WatchlistSyncSetting(bool Enabled);

/// <param name="Added">Titles added to the Trakt watchlist by turning sync on.</param>
public record WatchlistSyncResult(ScrobbleStatus Status, int Added);

public record LastfmLogin([Required] string Username, [Required] string Password);

public record ListenBrainzLogin([Required] string Token);

public record TraktCode(string UserCode, string VerificationUrl, int ExpiresIn, int Interval);

/// <param name="Status">pending, connected, expired or denied.</param>
public record TraktSignIn(string Status, string? Username);

/// <summary>
/// Each person connects their own Last.fm, ListenBrainz and Trakt accounts, from any TV and J app.
/// Everything here acts on the signed-in user only, so nobody can change anyone else's accounts.
/// </summary>
[ApiController]
[Route("TvAndJ/Scrobbling")]
[Authorize]
[Produces(MediaTypeNames.Application.Json)]
public class ScrobblingController(
    ScrobbleAccounts accounts,
    LastfmClient lastfm,
    ListenBrainzClient listenBrainz,
    TraktClient trakt,
    TraktSignIns signIns,
    Scrobbler scrobbler,
    ManualScrobbler manual,
    WatchlistSync watchlist,
    ILibraryManager library,
    IUserManager users) : ControllerBase
{
    // Jellyfin's own claim for the signed-in user (Jellyfin.Api's InternalClaimTypes.UserId).
    private Guid UserId => Guid.Parse(User.FindFirst("Jellyfin-UserId")!.Value);

    private static Configuration.PluginConfiguration Config => Plugin.Instance!.Configuration;

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ScrobbleStatus Status()
    {
        var a = accounts.Get(UserId);
        return new ScrobbleStatus(
            new ScrobbleService(Scrobbler.LastfmReady(Config), a.LastfmSessionKey is not null, a.LastfmUser),
            new ScrobbleService(true, a.ListenBrainzToken is not null, a.ListenBrainzUser),
            new ScrobbleService(Scrobbler.TraktReady(Config), a.TraktAccessToken is not null, a.TraktUser),
            a.TraktWatchlistSync && a.TraktAccessToken is not null);
    }

    /// <summary>Sign in to Last.fm. The password goes to Last.fm once and isn't kept; only the session key is.</summary>
    [HttpPost("Lastfm")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ScrobbleStatus>> ConnectLastfm([FromBody] LastfmLogin login, CancellationToken ct)
    {
        if (!Scrobbler.LastfmReady(Config)) return Problem("Last.fm isn’t set up on this server.", statusCode: 400);
        try
        {
            var (user, key) = await lastfm.Login(Config.LastfmApiKey, Config.LastfmApiSecret, login.Username.Trim(), login.Password, ct).ConfigureAwait(false);
            accounts.Update(UserId, a => (a.LastfmUser, a.LastfmSessionKey) = (user, key));
        }
        catch (ScrobbleException ex)
        {
            return Problem(ex.Message, statusCode: 400);
        }

        return Status();
    }

    [HttpPost("ListenBrainz")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ScrobbleStatus>> ConnectListenBrainz([FromBody] ListenBrainzLogin login, CancellationToken ct)
    {
        var token = login.Token.Trim();
        var user = await listenBrainz.Validate(token, ct).ConfigureAwait(false);
        if (user is null) return Problem("ListenBrainz didn’t accept that token.", statusCode: 400);
        accounts.Update(UserId, a => (a.ListenBrainzUser, a.ListenBrainzToken) = (user, token));
        return Status();
    }

    /// <summary>Start a Trakt sign-in: show the person the code and where to enter it, then poll.</summary>
    [HttpPost("Trakt/Code")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<TraktCode>> StartTrakt(CancellationToken ct)
    {
        if (!Scrobbler.TraktReady(Config)) return Problem("Trakt isn’t set up on this server.", statusCode: 400);
        var code = await trakt.StartDeviceSignIn(Config.TraktClientId, ct).ConfigureAwait(false);
        signIns.Start(UserId, code);
        return new TraktCode(code.UserCode, code.VerificationUrl, code.ExpiresIn, code.Interval);
    }

    /// <summary>Whether the person has entered their code yet. Poll at the interval Trakt gave.</summary>
    [HttpPost("Trakt/Poll")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<TraktSignIn>> PollTrakt(CancellationToken ct)
    {
        var userId = UserId;
        if (signIns.Pending(userId) is not { } code) return new TraktSignIn("expired", null);
        var (status, tokens) = await trakt.PollDeviceSignIn(Config.TraktClientId, Config.TraktClientSecret, code.DeviceCode, ct).ConfigureAwait(false);
        switch (status)
        {
            case TraktPoll.Approved:
                signIns.End(userId);
                var username = await trakt.Username(Config.TraktClientId, tokens!.AccessToken, ct).ConfigureAwait(false);
                accounts.Update(userId, a =>
                {
                    a.TraktUser = username;
                    a.TraktAccessToken = tokens.AccessToken;
                    a.TraktRefreshToken = tokens.RefreshToken;
                    a.TraktExpiresAt = tokens.ExpiresAt;
                });
                return new TraktSignIn("connected", username);
            case TraktPoll.Pending:
                return new TraktSignIn("pending", null);
            default:
                signIns.End(userId);
                return new TraktSignIn(status == TraktPoll.Denied ? "denied" : "expired", null);
        }
    }

    /// <summary>
    /// Keep the Trakt watchlist in step with My List (unwatched movies and shows), or stop. Turning it
    /// on pushes what's on My List now; turning it off leaves the watchlist as it is.
    /// </summary>
    [HttpPut("Trakt/Watchlist")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<WatchlistSyncResult>> SetWatchlistSync([FromBody] WatchlistSyncSetting setting, CancellationToken ct)
    {
        var userId = UserId;
        if (setting.Enabled && accounts.Get(userId).TraktAccessToken is null) return Problem("Connect Trakt first.", statusCode: 400);
        var added = 0;
        if (setting.Enabled)
        {
            try
            {
                added = await watchlist.PushAll(userId, ct).ConfigureAwait(false);
            }
            catch (ScrobbleException ex)
            {
                return Problem(ex.Message, statusCode: 400);
            }
        }

        accounts.Update(userId, a => a.TraktWatchlistSync = setting.Enabled);
        return new WatchlistSyncResult(Status(), added);
    }

    /// <summary>
    /// Scrobble something now, played or not: a song or album to Last.fm and ListenBrainz; a movie,
    /// episode, season or show to Trakt's history. One outcome per service it went to.
    /// </summary>
    [HttpPost("Items/{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<ScrobbleOutcome>>> ScrobbleItem([FromRoute] Guid itemId, CancellationToken ct)
    {
        var userId = UserId;
        var user = users.GetUserById(userId);
        var item = library.GetItemById(itemId);
        // Only what this person can see in their own library.
        if (user is null || item is null || !item.IsVisible(user)) return NotFound();
        if (!ManualScrobbler.Supports(item)) return Problem("Only songs, albums, movies, episodes, seasons and shows can be scrobbled.", statusCode: 400);
        return Ok(await manual.Scrobble(userId, item, ct).ConfigureAwait(false));
    }

    /// <summary>Disconnect a service (lastfm, listenbrainz or trakt). Trakt's token is revoked too.</summary>
    [HttpDelete("{service}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ScrobbleStatus>> Disconnect([FromRoute] string service, CancellationToken ct)
    {
        var userId = UserId;
        switch (service.ToLowerInvariant())
        {
            case "lastfm":
                accounts.Update(userId, a => (a.LastfmUser, a.LastfmSessionKey) = (null, null));
                break;
            case "listenbrainz":
                accounts.Update(userId, a => (a.ListenBrainzUser, a.ListenBrainzToken) = (null, null));
                break;
            case "trakt":
                signIns.End(userId);
                if (Scrobbler.TraktReady(Config) && await scrobbler.TraktToken(userId, ct).ConfigureAwait(false) is { } token)
                {
                    // Best effort: forgetting it here matters more than Trakt hearing about it.
                    try { await trakt.Revoke(Config.TraktClientId, Config.TraktClientSecret, token, ct).ConfigureAwait(false); } catch (Exception) { }
                }

                accounts.Update(userId, a =>
                {
                    (a.TraktUser, a.TraktAccessToken, a.TraktRefreshToken, a.TraktExpiresAt) = (null, null, null, 0);
                    a.TraktWatchlistSync = false;
                });
                break;
            default:
                return NotFound();
        }

        return Status();
    }
}
