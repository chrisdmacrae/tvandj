using System.Text.Json.Nodes;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>
/// One-way watchlist sync, for people who turn it on: what's on their My List (Jellyfin favourites)
/// and not yet watched goes on their Trakt watchlist. Taking it off My List, or finishing it (a movie,
/// or a show's last episode), takes it off the watchlist. Nothing comes back from Trakt.
/// </summary>
public sealed class WatchlistSync(
    IUserDataManager userData,
    IUserManager users,
    ILibraryManager library,
    ScrobbleAccounts accounts,
    TraktClient trakt,
    Scrobbler scrobbler,
    ILogger<WatchlistSync> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        userData.UserDataSaved += OnUserDataSaved;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        userData.UserDataSaved -= OnUserDataSaved;
        return Task.CompletedTask;
    }

    /// <summary>
    /// Push everything on the person's My List that they haven't watched (when they turn sync on).
    /// Only adds: titles already on their watchlist stay, whatever Jellyfin says. Returns how many were added.
    /// </summary>
    public async Task<int> PushAll(Guid userId, CancellationToken ct)
    {
        var user = users.GetUserById(userId) ?? throw new ScrobbleException("Unknown user.");
        var listed = library.GetItemList(new InternalItemsQuery(user)
        {
            IsFavorite = true,
            IncludeItemTypes = [BaseItemKind.Movie, BaseItemKind.Series],
            Recursive = true,
        });
        var unwatched = listed.Where(item => !Watched(userId, item)).ToList();
        if (unwatched.Count == 0) return 0;
        return await Send(userId, unwatched, remove: false, ct).ConfigureAwait(false);
    }

    private void OnUserDataSaved(object? sender, UserDataSaveEventArgs e)
    {
        // Only what can change the answer: My List (saved as a rating update) and watching. Not progress.
        if (e.SaveReason is not (UserDataSaveReason.UpdateUserRating or UserDataSaveReason.TogglePlayed or UserDataSaveReason.PlaybackFinished)) return;
        var account = accounts.Get(e.UserId);
        if (!account.TraktWatchlistSync || account.TraktAccessToken is null || !Scrobbler.TraktReady(Plugin.Instance!.Configuration)) return;

        // An episode finishing can finish its show.
        var title = e.Item switch
        {
            Movie or Series => e.Item,
            Episode { Series: { } series } => series,
            _ => null,
        };
        if (title is null) return;

        var listed = title == e.Item ? e.UserData.IsFavorite : userData.GetUserData(users.GetUserById(e.UserId)!, title)?.IsFavorite == true;
        // An episode played while the show isn't on My List changes nothing on the watchlist.
        if (title != e.Item && !listed) return;
        var wanted = listed && !Watched(e.UserId, title);

        _ = Task.Run(async () =>
        {
            try
            {
                await Send(e.UserId, [title], remove: !wanted, CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                logger.LogWarning("Trakt watchlist sync for {Title} failed: {Message}", title.Name, ex.Message);
            }
        });
    }

    /// <summary>A movie the person has played; a show with no unplayed episodes left.</summary>
    private bool Watched(Guid userId, BaseItem item)
    {
        var user = users.GetUserById(userId);
        if (user is null) return false;
        if (item is not Series series) return userData.GetUserData(user, item)?.Played == true;
        var unplayed = library.GetItemList(new InternalItemsQuery(user)
        {
            AncestorIds = [series.Id],
            IncludeItemTypes = [BaseItemKind.Episode],
            IsPlayed = false,
            IsVirtualItem = false,
            Recursive = true,
            Limit = 1,
        });
        return unplayed.Count == 0;
    }

    private async Task<int> Send(Guid userId, IReadOnlyList<BaseItem> items, bool remove, CancellationToken ct)
    {
        var config = Plugin.Instance!.Configuration;
        var token = await scrobbler.TraktToken(userId, ct).ConfigureAwait(false) ?? throw new ScrobbleException("Connect Trakt in Settings first.");
        var body = new JsonObject
        {
            ["movies"] = new JsonArray(items.OfType<Movie>().Select(m => (JsonNode)Entry(m)).ToArray()),
            ["shows"] = new JsonArray(items.OfType<Series>().Select(s => (JsonNode)Entry(s)).ToArray()),
        };
        return await trakt.Watchlist(config.TraktClientId, token, body, remove, ct).ConfigureAwait(false);
    }

    private static JsonObject Entry(BaseItem item) => new() { ["title"] = item.Name, ["year"] = item.ProductionYear, ["ids"] = Scrobbler.Ids(item) };
}
