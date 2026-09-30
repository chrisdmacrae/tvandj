using System.Text.Json.Nodes;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Audio;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>What happened at one service: it took it, or why not.</summary>
public record ScrobbleOutcome(string Service, bool Sent, string? Message);

/// <summary>
/// "Scrobble this now", whatever was (or wasn't) played: a song or album to Last.fm and
/// ListenBrainz, a movie, episode, season or whole show to the person's Trakt history.
/// </summary>
public class ManualScrobbler(
    ScrobbleAccounts accounts,
    LastfmClient lastfm,
    ListenBrainzClient listenBrainz,
    TraktClient trakt,
    Scrobbler scrobbler,
    ILibraryManager library)
{
    /// <summary>Whether this kind of item can be scrobbled by hand at all.</summary>
    public static bool Supports(BaseItem item) => item is Audio or MusicAlbum or Movie or Episode or Season or Series;

    public async Task<IReadOnlyList<ScrobbleOutcome>> Scrobble(Guid userId, BaseItem item, CancellationToken ct)
    {
        if (item is Audio or MusicAlbum) return await Music(userId, item, ct).ConfigureAwait(false);
        return [await Trakt(userId, item, ct).ConfigureAwait(false)];
    }

    /// <summary>
    /// The song, or the album's songs in order, as if just listened to straight through: the last one
    /// ending now. Songs too short for the services' rules are still sent: this is on purpose.
    /// </summary>
    private async Task<IReadOnlyList<ScrobbleOutcome>> Music(Guid userId, BaseItem item, CancellationToken ct)
    {
        var songs = item is MusicAlbum album
            ? library.GetItemList(new InternalItemsQuery { ParentId = album.Id, IncludeItemTypes = [BaseItemKind.Audio], Recursive = true })
                .OrderBy(s => s.ParentIndexNumber ?? 0).ThenBy(s => s.IndexNumber ?? 0).ThenBy(s => s.SortName, StringComparer.Ordinal).ToList()
            : [item];
        var tracks = songs.Select(s => (Track: Scrobbler.AsTrack(s), Length: TimeSpan.FromTicks(s.RunTimeTicks ?? 0))).Where(t => t.Track is not null).ToList();
        if (tracks.Count == 0) return [new ScrobbleOutcome("Music", false, "Nothing here has an artist and title to scrobble.")];

        var at = DateTimeOffset.UtcNow - TimeSpan.FromTicks(tracks.Sum(t => t.Length.Ticks));
        var timed = new List<(Track Track, DateTimeOffset At)>();
        foreach (var (track, length) in tracks)
        {
            timed.Add((track!, at));
            at += length;
        }

        var account = accounts.Get(userId);
        var config = Plugin.Instance!.Configuration;
        var outcomes = new List<ScrobbleOutcome>();
        if (account.LastfmSessionKey is { } sk && Scrobbler.LastfmReady(config))
        {
            outcomes.Add(await Attempt("Last.fm", async () =>
            {
                foreach (var (track, when) in timed)
                {
                    await lastfm.Scrobble(config.LastfmApiKey, config.LastfmApiSecret, sk, track, when, ct).ConfigureAwait(false);
                }
            }).ConfigureAwait(false));
        }

        if (account.ListenBrainzToken is { } token)
        {
            outcomes.Add(await Attempt("ListenBrainz", () => timed.Count == 1
                ? listenBrainz.Listen(token, timed[0].Track, timed[0].At, ct)
                : listenBrainz.Import(token, timed, ct)).ConfigureAwait(false));
        }

        return outcomes.Count > 0 ? outcomes : [new ScrobbleOutcome("Music", false, "Connect Last.fm or ListenBrainz in Settings first.")];
    }

    /// <summary>Into the person's Trakt history, watched now. A season or show counts every episode Trakt knows of.</summary>
    private async Task<ScrobbleOutcome> Trakt(Guid userId, BaseItem item, CancellationToken ct)
    {
        var config = Plugin.Instance!.Configuration;
        if (!Scrobbler.TraktReady(config)) return new ScrobbleOutcome("Trakt", false, "Trakt isn’t set up on this server.");
        var body = HistoryBody(item);
        if (body is null) return new ScrobbleOutcome("Trakt", false, "Trakt needs this episode’s season and number.");
        return await Attempt("Trakt", async () =>
        {
            var token = await scrobbler.TraktToken(userId, ct).ConfigureAwait(false) ?? throw new ScrobbleException("Connect Trakt in Settings first.");
            if (await trakt.AddToHistory(config.TraktClientId, token, body, ct).ConfigureAwait(false) == 0)
            {
                throw new ScrobbleException("Trakt didn’t recognise it. Its TMDB, TVDB or IMDb id may be missing in Jellyfin.");
            }
        }).ConfigureAwait(false);
    }

    private static JsonObject? HistoryBody(BaseItem item)
    {
        var now = DateTimeOffset.UtcNow.ToString("o");
        JsonObject Show(Series series, JsonArray? seasons)
        {
            var show = new JsonObject { ["title"] = series.Name, ["year"] = series.ProductionYear, ["ids"] = Scrobbler.Ids(series), ["watched_at"] = now };
            if (seasons is not null) show["seasons"] = seasons;
            return new JsonObject { ["shows"] = new JsonArray(show) };
        }

        return item switch
        {
            Movie movie => new JsonObject
            {
                ["movies"] = new JsonArray(new JsonObject { ["title"] = movie.Name, ["year"] = movie.ProductionYear, ["ids"] = Scrobbler.Ids(movie), ["watched_at"] = now }),
            },
            Series series => Show(series, null),
            Season { Series: { } series, IndexNumber: { } season } =>
                Show(series, new JsonArray(new JsonObject { ["number"] = season, ["watched_at"] = now })),
            Episode { Series: { } series, ParentIndexNumber: { } season, IndexNumber: { } number } =>
                Show(series, new JsonArray(new JsonObject
                {
                    ["number"] = season,
                    ["episodes"] = new JsonArray(new JsonObject { ["number"] = number, ["watched_at"] = now }),
                })),
            _ => null,
        };
    }

    private static async Task<ScrobbleOutcome> Attempt(string service, Func<Task> work)
    {
        try
        {
            await work().ConfigureAwait(false);
            return new ScrobbleOutcome(service, true, null);
        }
        catch (ScrobbleException ex)
        {
            return new ScrobbleOutcome(service, false, ex.Message);
        }
        catch (HttpRequestException)
        {
            return new ScrobbleOutcome(service, false, $"Couldn’t reach {service}.");
        }
    }
}
