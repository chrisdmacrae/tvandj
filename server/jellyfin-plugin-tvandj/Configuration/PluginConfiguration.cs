using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.TvAndJ.Configuration;

/// <summary>What the plugin stores: the household settings, as JSON, and when they last changed.</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>The apps' household settings as a JSON object, e.g. {"downloadarrUrl":"http://…"}. The apps own its shape.</summary>
    public string SettingsJson { get; set; } = "{}";

    /// <summary>When they last changed (Unix milliseconds, set by the app that changed them). The newest copy wins.</summary>
    public long UpdatedAt { get; set; }
}
