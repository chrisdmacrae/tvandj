using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json.Nodes;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>
/// Scrobbles what people play, from any Jellyfin app: songs to Last.fm and ListenBrainz,
/// movies and episodes to Trakt, for each person who's connected those accounts. Follows
/// Jellyfin's playback reports (start, progress, stop), so nothing is needed from the apps.
/// </summary>
public sealed class Scrobbler(
    ISessionManager sessions,
    ScrobbleAccounts accounts,
    LastfmClient lastfm,
    ListenBrainzClient listenBrainz,
    TraktClient trakt,
    ILogger<Scrobbler> logger) : IHostedService
{
    /// <summary>A Trakt access token is refreshed when it has less than this left.</summary>
    private static readonly TimeSpan RefreshAhead = TimeSpan.FromDays(1);

    private readonly ConcurrentDictionary<string, Play> _plays = new();

    /// <param name="Counted">Already scrobbled (music) or marked watched (Trakt): nothing more to send for this play.</param>
    private sealed record Play(DateTimeOffset StartedAt, bool Paused, bool Counted);

    public Task StartAsync(CancellationToken cancellationToken)
    {
        sessions.PlaybackStart += OnStart;
        sessions.PlaybackProgress += OnProgress;
        sessions.PlaybackStopped += OnStopped;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        sessions.PlaybackStart -= OnStart;
        sessions.PlaybackProgress -= OnProgress;
        sessions.PlaybackStopped -= OnStopped;
        return Task.CompletedTask;
    }

    private static string Key(PlaybackProgressEventArgs e) => $"{e.Session?.Id}:{e.Item?.Id}";

    /// <summary>Straight away: "now playing" on Last.fm and ListenBrainz, "watching" on Trakt.</summary>
    private void OnStart(object? sender, PlaybackProgressEventArgs e)
    {
        if (e.Item is null || e.Users.Count == 0) return;
        _plays[Key(e)] = new Play(DateTimeOffset.UtcNow, e.IsPaused, Counted: false);
        var position = e.PlaybackPositionTicks ?? 0;
        foreach (var user in e.Users.Select(u => u.Id))
        {
            if (AsTrack(e.Item) is { } track) NowPlaying(user, track);
            else if (AsTraktItem(e.Item) is { } item) Run("Trakt start", () => TraktScrobble(user, "start", item, ScrobbleRules.Progress(e.Item.RunTimeTicks, position, false)));
        }
    }

    /// <summary>
    /// Every progress report (about every 10 seconds): a song is scrobbled the moment it's played long
    /// enough, and a movie or episode goes into Trakt's history the moment it passes 80%, rather than
    /// when playback stops. Until then Trakt follows pauses: paused there, and watching again on resume.
    /// </summary>
    private void OnProgress(object? sender, PlaybackProgressEventArgs e)
    {
        if (e.Item is null || e.Users.Count == 0) return;
        var key = Key(e);
        if (!_plays.TryGetValue(key, out var play) || play.Counted) return;
        var position = e.PlaybackPositionTicks ?? 0;

        if (AsTrack(e.Item) is { } track)
        {
            if (!ScrobbleRules.CountsAsListen(e.Item.RunTimeTicks, position, false) || !Claim(key, play, play with { Counted = true })) return;
            foreach (var user in e.Users.Select(u => u.Id)) Listen(user, track, play.StartedAt);
            return;
        }

        if (AsTraktItem(e.Item) is not { } item) return;
        var progress = ScrobbleRules.Progress(e.Item.RunTimeTicks, position, false);
        if (progress >= ScrobbleRules.TraktWatched)
        {
            if (!Claim(key, play, play with { Counted = true })) return;
            foreach (var user in e.Users.Select(u => u.Id)) Run("Trakt watched", () => TraktScrobble(user, "stop", item, progress));
        }
        else if (play.Paused != e.IsPaused && Claim(key, play, play with { Paused = e.IsPaused }))
        {
            foreach (var user in e.Users.Select(u => u.Id)) Run("Trakt pause", () => TraktScrobble(user, e.IsPaused ? "pause" : "start", item, progress));
        }
    }

    /// <summary>Whatever the progress reports didn't already count: a song that ended before its next report, or Trakt's stop.</summary>
    private void OnStopped(object? sender, PlaybackStopEventArgs e)
    {
        if (e.Item is null || e.Users.Count == 0) return;
        _plays.TryRemove(Key(e), out var play);
        if (play?.Counted == true) return;
        var position = e.PlaybackPositionTicks ?? 0;
        foreach (var user in e.Users.Select(u => u.Id))
        {
            if (AsTrack(e.Item) is { } track)
            {
                // No start seen (e.g. the server restarted mid-song): assume it started that long ago.
                var startedAt = play?.StartedAt ?? DateTimeOffset.UtcNow - TimeSpan.FromTicks(position);
                if (ScrobbleRules.CountsAsListen(e.Item.RunTimeTicks, position, e.PlayedToCompletion)) Listen(user, track, startedAt);
            }
            else if (AsTraktItem(e.Item) is { } item)
            {
                // Under 80%, Trakt keeps it as paused, to resume later; from 80% it's watched.
                Run("Trakt stop", () => TraktScrobble(user, "stop", item, ScrobbleRules.Progress(e.Item.RunTimeTicks, position, e.PlayedToCompletion)));
            }
        }
    }

    /// <summary>Move a play on to its next state, unless another report got there first (so nothing's sent twice).</summary>
    private bool Claim(string key, Play seen, Play next) => _plays.TryUpdate(key, next, seen);

    /// <summary>Each service separately, so one failing doesn't stop the other.</summary>
    private void NowPlaying(Guid userId, Track track)
    {
        var account = accounts.Get(userId);
        var config = Plugin.Instance!.Configuration;
        if (account.ListenBrainzToken is { } token) Run("ListenBrainz now playing", () => listenBrainz.NowPlaying(token, track, CancellationToken.None));
        if (account.LastfmSessionKey is { } sk && LastfmReady(config))
        {
            Run("Last.fm now playing", () => lastfm.NowPlaying(config.LastfmApiKey, config.LastfmApiSecret, sk, track, CancellationToken.None));
        }
    }

    private void Listen(Guid userId, Track track, DateTimeOffset startedAt)
    {
        var account = accounts.Get(userId);
        var config = Plugin.Instance!.Configuration;
        if (account.ListenBrainzToken is { } token) Run("ListenBrainz listen", () => listenBrainz.Listen(token, track, startedAt, CancellationToken.None));
        if (account.LastfmSessionKey is { } sk && LastfmReady(config))
        {
            Run("Last.fm scrobble", () => lastfm.Scrobble(config.LastfmApiKey, config.LastfmApiSecret, sk, track, startedAt, CancellationToken.None));
        }
    }

    private async Task TraktScrobble(Guid userId, string action, JsonObject item, double progress)
    {
        var config = Plugin.Instance!.Configuration;
        if (!TraktReady(config) || await TraktToken(userId, CancellationToken.None).ConfigureAwait(false) is not { } token) return;
        // Each call sends its own copy: the body gets the progress added.
        await trakt.Scrobble(config.TraktClientId, token, action, (JsonObject)item.DeepClone(), progress, CancellationToken.None).ConfigureAwait(false);
    }

    /// <summary>The user's Trakt access token, refreshed first if it's about to run out; null if they haven't connected Trakt.</summary>
    public async Task<string?> TraktToken(Guid userId, CancellationToken ct)
    {
        var account = accounts.Get(userId);
        if (account.TraktAccessToken is null || account.TraktRefreshToken is null) return null;
        if (DateTimeOffset.FromUnixTimeSeconds(account.TraktExpiresAt) - DateTimeOffset.UtcNow > RefreshAhead) return account.TraktAccessToken;

        var config = Plugin.Instance!.Configuration;
        var tokens = await trakt.Refresh(config.TraktClientId, config.TraktClientSecret, account.TraktRefreshToken, ct).ConfigureAwait(false);
        accounts.Update(userId, a =>
        {
            a.TraktAccessToken = tokens.AccessToken;
            a.TraktRefreshToken = tokens.RefreshToken;
            a.TraktExpiresAt = tokens.ExpiresAt;
        });
        return tokens.AccessToken;
    }

    public static bool LastfmReady(Configuration.PluginConfiguration c) => c.LastfmApiKey.Length > 0 && c.LastfmApiSecret.Length > 0;

    public static bool TraktReady(Configuration.PluginConfiguration c) => c.TraktClientId.Length > 0 && c.TraktClientSecret.Length > 0;

    /// <summary>Network calls happen off the playback event, and a failure is logged, never thrown at Jellyfin.</summary>
    private void Run(string what, Func<Task> work) => _ = Task.Run(async () =>
    {
        try
        {
            await work().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Scrobbling ({What}) failed: {Message}", what, ex.Message);
        }
    });

    internal static Track? AsTrack(BaseItem item)
    {
        if (item is not Audio audio) return null;
        var artist = audio.Artists.FirstOrDefault() ?? audio.AlbumArtists.FirstOrDefault();
        if (string.IsNullOrEmpty(artist) || string.IsNullOrEmpty(audio.Name)) return null;
        var artistMbids = (audio.GetProviderId(MetadataProvider.MusicBrainzArtist) ?? string.Empty)
            .Split([';', '/', ','], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return new Track(
            artist,
            audio.Name,
            audio.Album,
            audio.AlbumArtists.FirstOrDefault(),
            audio.RunTimeTicks is { } t ? (int)TimeSpan.FromTicks(t).TotalSeconds : null,
            audio.IndexNumber,
            audio.GetProviderId(MetadataProvider.MusicBrainzTrack),
            audio.GetProviderId(MetadataProvider.MusicBrainzAlbum),
            artistMbids);
    }

    /// <summary>A movie or episode as Trakt identifies it: by TMDB, IMDb and TVDB ids; an episode by its show, season and number.</summary>
    private static JsonObject? AsTraktItem(BaseItem item)
    {
        switch (item)
        {
            case Movie movie:
                return new JsonObject { ["movie"] = new JsonObject { ["title"] = movie.Name, ["year"] = movie.ProductionYear, ["ids"] = Ids(movie) } };
            case Episode { Series: { } series, ParentIndexNumber: { } season, IndexNumber: { } number }:
                return new JsonObject
                {
                    ["show"] = new JsonObject { ["title"] = series.Name, ["year"] = series.ProductionYear, ["ids"] = Ids(series) },
                    ["episode"] = new JsonObject { ["season"] = season, ["number"] = number },
                };
            default:
                return null;
        }
    }

    internal static JsonObject Ids(BaseItem item)
    {
        var ids = new JsonObject();
        if (int.TryParse(item.GetProviderId(MetadataProvider.Tmdb), NumberStyles.None, CultureInfo.InvariantCulture, out var tmdb)) ids["tmdb"] = tmdb;
        if (int.TryParse(item.GetProviderId(MetadataProvider.Tvdb), NumberStyles.None, CultureInfo.InvariantCulture, out var tvdb)) ids["tvdb"] = tvdb;
        if (item.GetProviderId(MetadataProvider.Imdb) is { Length: > 0 } imdb) ids["imdb"] = imdb;
        return ids;
    }
}
