using System.Text.Json;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>One Jellyfin user's connected scrobbling accounts. Keys and tokens never leave the server.</summary>
public class ScrobbleAccount
{
    public string? LastfmUser { get; set; }

    /// <summary>Last.fm session keys don't expire; the password is never kept.</summary>
    public string? LastfmSessionKey { get; set; }

    public string? ListenBrainzUser { get; set; }

    public string? ListenBrainzToken { get; set; }

    public string? TraktUser { get; set; }

    public string? TraktAccessToken { get; set; }

    public string? TraktRefreshToken { get; set; }

    /// <summary>When the Trakt access token runs out (Unix seconds); it's refreshed a day before.</summary>
    public long TraktExpiresAt { get; set; }

    /// <summary>Keep the Trakt watchlist in step with My List (unwatched movies and shows only). One way: Jellyfin to Trakt.</summary>
    public bool TraktWatchlistSync { get; set; }
}

/// <summary>
/// Everyone's scrobbling accounts, in a file in the plugin's data folder rather than the plugin
/// configuration: the Dashboard page saves that configuration wholesale, and these must survive it.
/// </summary>
public class ScrobbleAccounts
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly object _lock = new();
    private readonly string _path;
    private Dictionary<Guid, ScrobbleAccount> _accounts;

    public ScrobbleAccounts(string dataFolder)
    {
        Directory.CreateDirectory(dataFolder);
        _path = Path.Combine(dataFolder, "scrobbling.json");
        _accounts = Load(_path);
    }

    /// <summary>A copy of the user's accounts (empty when they've connected nothing).</summary>
    public ScrobbleAccount Get(Guid userId)
    {
        lock (_lock)
        {
            return _accounts.TryGetValue(userId, out var account) ? Clone(account) : new ScrobbleAccount();
        }
    }

    /// <summary>Change the user's accounts and save.</summary>
    public void Update(Guid userId, Action<ScrobbleAccount> change)
    {
        lock (_lock)
        {
            var account = _accounts.TryGetValue(userId, out var existing) ? existing : new ScrobbleAccount();
            change(account);
            _accounts[userId] = account;
            var temp = _path + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(_accounts, JsonOptions));
            File.Move(temp, _path, overwrite: true);
        }
    }

    private static Dictionary<Guid, ScrobbleAccount> Load(string path)
    {
        try
        {
            return File.Exists(path)
                ? JsonSerializer.Deserialize<Dictionary<Guid, ScrobbleAccount>>(File.ReadAllText(path)) ?? new()
                : new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    private static ScrobbleAccount Clone(ScrobbleAccount a) =>
        JsonSerializer.Deserialize<ScrobbleAccount>(JsonSerializer.Serialize(a))!;
}
