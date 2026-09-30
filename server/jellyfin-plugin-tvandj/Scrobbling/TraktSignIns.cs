using System.Collections.Concurrent;

namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>Trakt sign-ins waiting for the person to enter their code, one per user, in memory only.</summary>
public class TraktSignIns
{
    private readonly ConcurrentDictionary<Guid, (TraktDeviceCode Code, DateTimeOffset ExpiresAt)> _pending = new();

    public void Start(Guid userId, TraktDeviceCode code) =>
        _pending[userId] = (code, DateTimeOffset.UtcNow.AddSeconds(code.ExpiresIn));

    /// <summary>The user's device code, or null when there's none or it has run out.</summary>
    public TraktDeviceCode? Pending(Guid userId) =>
        _pending.TryGetValue(userId, out var p) && p.ExpiresAt > DateTimeOffset.UtcNow ? p.Code : null;

    public void End(Guid userId) => _pending.TryRemove(userId, out _);
}
