namespace Jellyfin.Plugin.TvAndJ.Scrobbling;

/// <summary>A scrobbling service said no; the message is fit to show the person.</summary>
public class ScrobbleException(string message) : Exception(message);
