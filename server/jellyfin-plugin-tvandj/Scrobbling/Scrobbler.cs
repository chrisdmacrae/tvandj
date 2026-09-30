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

    private sealed record Play(DateTimeOffset StartedAt, bool Paused);

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

    private void OnStart(object? sender, PlaybackProgressEventArgs e)
    {
        if (e.Item is null || e.Users.Count == 0) return;
        _plays[Key(e)] = new Play(DateTimeOffset.UtcNow, e.IsPaused);
        var position = e.PlaybackPositionTicks ?? 0;
        foreach (var user in e.Users.Select(u => u.Id))
        {
            if (AsTrack(e.Item) is { } track) Run("now playing", () => NowPlaying(user, track));
            else if (AsTraktItem(e.Item) is { } item) Run("Trakt start", () => TraktScrobble(user, "start", item, ScrobbleRules.Progress(e.Item.RunTimeTicks, position, false)));
        }
    }

    /// <summary>Trakt follows pauses: paused shows as paused there, resuming starts it again.</summary>
    private void OnProgress(object? sender, PlaybackProgressEventArgs e)
    {
        if (e.Item is null || e.Users.Count == 0 || AsTraktItem(e.Item) is null) return;
        var key = Key(e);
        if (!_plays.TryGetValue(key, out var play) || play.Paused == e.IsPaused) return;
        _plays[key] = play with { Paused = e.IsPaused };
        var progress = ScrobbleRules.Progress(e.Item.RunTimeTicks, e.PlaybackPositionTicks ?? 0, false);
        foreach (var user in e.Users.Select(u => u.Id))
        {
            Run("Trakt pause", () => TraktScrobble(user, e.IsPaused ? "pause" : "start", AsTraktItem(e.Item)!, progress));
        }
    }

    private void OnStopped(object? sender, PlaybackStopEventArgs e)
    {
        if (e.Item is null || e.Users.Count == 0) return;
        _plays.TryRemove(Key(e), out var play);
        var position = e.PlaybackPositionTicks ?? 0;
        foreach (var user in e.Users.Select(u => u.Id))
        {
            if (AsTrack(e.Item) is { } track)
            {
                // No start seen (e.g. the server restarted mid-song): assume it started that long ago.
                var startedAt = play?.StartedAt ?? DateTimeOffset.UtcNow - TimeSpan.FromTicks(position);
                if (ScrobbleRules.CountsAsListen(e.Item.RunTimeTicks, position, e.PlayedToCompletion))
                {
                    Run("scrobble", () => Listen(user, track, startedAt));
                }
            }
            else if (AsTraktItem(e.Item) is { } item)
            {
                // Under 80%, Trakt treats a stop as a pause; from 80% it's watched.
                Run("Trakt stop", () => TraktScrobble(user, "stop", item, ScrobbleRules.Progress(e.Item.RunTimeTicks, position, e.PlayedToCompletion)));
            }
        }
    }

    private async Task NowPlaying(Guid userId, Track track)
    {
        var account = accounts.Get(userId);
        var config = Plugin.Instance!.Configuration;
        if (account.ListenBrainzToken is { } token) await listenBrainz.NowPlaying(token, track, CancellationToken.None).ConfigureAwait(false);
        if (account.LastfmSessionKey is { } sk && LastfmReady(config))
        {
            await lastfm.NowPlaying(config.LastfmApiKey, config.LastfmApiSecret, sk, track, CancellationToken.None).ConfigureAwait(false);
        }
    }

    private async Task Listen(Guid userId, Track track, DateTimeOffset startedAt)
    {
        var account = accounts.Get(userId);
        var config = Plugin.Instance!.Configuration;
        if (account.ListenBrainzToken is { } token) await listenBrainz.Listen(token, track, startedAt, CancellationToken.None).ConfigureAwait(false);
        if (account.LastfmSessionKey is { } sk && LastfmReady(config))
        {
            await lastfm.Scrobble(config.LastfmApiKey, config.LastfmApiSecret, sk, track, startedAt, CancellationToken.None).ConfigureAwait(false);
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

    private static Track? AsTrack(BaseItem item)
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

    private static JsonObject Ids(BaseItem item)
    {
        var ids = new JsonObject();
        if (int.TryParse(item.GetProviderId(MetadataProvider.Tmdb), NumberStyles.None, CultureInfo.InvariantCulture, out var tmdb)) ids["tmdb"] = tmdb;
        if (int.TryParse(item.GetProviderId(MetadataProvider.Tvdb), NumberStyles.None, CultureInfo.InvariantCulture, out var tvdb)) ids["tvdb"] = tvdb;
        if (item.GetProviderId(MetadataProvider.Imdb) is { Length: > 0 } imdb) ids["imdb"] = imdb;
        return ids;
    }
}
