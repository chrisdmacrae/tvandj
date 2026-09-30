namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>When a play counts, by the services' own rules.</summary>
public static class ScrobbleRules
{
    private const long TicksPerSecond = 10_000_000;

    /// <summary>
    /// Last.fm and ListenBrainz: the track is longer than 30 seconds, and it played for half its
    /// length or 4 minutes, whichever comes first.
    /// </summary>
    public static bool CountsAsListen(long? runTimeTicks, long playedTicks, bool playedToCompletion)
    {
        if (runTimeTicks is not { } length || length <= 30 * TicksPerSecond)
        {
            return false;
        }

        return playedToCompletion || playedTicks >= Math.Min(length / 2, 240 * TicksPerSecond);
    }

    /// <summary>Trakt counts a movie or episode as watched from this far in (percent).</summary>
    public const double TraktWatched = 80;

    /// <summary>Trakt's progress, 0–100. Trakt itself marks it watched from 80.</summary>
    public static double Progress(long? runTimeTicks, long positionTicks, bool playedToCompletion)
    {
        if (playedToCompletion)
        {
            return 100;
        }

        if (runTimeTicks is not { } length || length <= 0)
        {
            return 0;
        }

        return Math.Clamp(positionTicks * 100.0 / length, 0, 100);
    }
}
