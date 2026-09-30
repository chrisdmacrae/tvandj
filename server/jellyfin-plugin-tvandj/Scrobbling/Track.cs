namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>A song as Last.fm and ListenBrainz want it.</summary>
public record Track(
    string Artist,
    string Title,
    string? Album,
    string? AlbumArtist,
    int? DurationSeconds,
    int? TrackNumber,
    string? RecordingMbid,
    string? ReleaseMbid,
    IReadOnlyList<string> ArtistMbids);
