using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.TvAndJ.Configuration;

/// <summary>
/// What the plugin stores: the household settings, as JSON, and when they last changed; and the
/// app credentials scrobbling needs. People's own scrobbling accounts are kept apart, in
/// <see cref="Scrobbling.ScrobbleAccounts"/>, so saving this page can never touch them.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>The apps' household settings as a JSON object, e.g. {"downloadarrUrl":"http://…"}. The apps own its shape.</summary>
    public string SettingsJson { get; set; } = "{}";

    /// <summary>When they last changed (Unix milliseconds, set by the app that changed them). The newest copy wins.</summary>
    public long UpdatedAt { get; set; }

    /// <summary>Last.fm API account (last.fm/api/account/create). Without it, Last.fm scrobbling is off.</summary>
    public string LastfmApiKey { get; set; } = string.Empty;

    public string LastfmApiSecret { get; set; } = string.Empty;

    /// <summary>Trakt app (trakt.tv/oauth/applications, redirect URI urn:ietf:wg:oauth:2.0:oob). Without it, Trakt scrobbling is off.</summary>
    public string TraktClientId { get; set; } = string.Empty;

    public string TraktClientSecret { get; set; } = string.Empty;
}
