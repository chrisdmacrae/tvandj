using Jellyfin.Plugin.TvAndJ.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.TvAndJ;

/// <summary>
/// Household settings for the TV and J apps: settings that belong to the whole
/// household rather than one person (the downloadarr address, for a start), kept
/// on the Jellyfin server so every app, on every device, for every user, shares them.
/// Per-person settings don't live here; the apps keep those in each user's Jellyfin
/// display preferences.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "TV and J";

    public override Guid Id => Guid.Parse("7a1c6f2e-3b4d-4e8a-9f10-5c2d7e8b9a01");

    public override string Description => "Household settings shared by the TV and J apps on every device, and scrobbling to Last.fm, ListenBrainz and Trakt.";

    public IEnumerable<PluginPageInfo> GetPages() =>
    [
        new PluginPageInfo
        {
            Name = Name,
            EmbeddedResourcePath = $"{GetType().Namespace}.Configuration.configPage.html",
        },
    ];
}
