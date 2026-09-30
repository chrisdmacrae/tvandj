using Jellyfin.Plugin.TvAndJ.Scrobbling;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.TvAndJ;

/// <summary>Scrobbling's services: the account store, the three services' clients, and the scrobbler itself.</summary>
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // Created on first use, by which point the plugin (and its data folder) exists.
        serviceCollection.AddSingleton(_ => new ScrobbleAccounts(Plugin.Instance!.DataFolderPath));
        serviceCollection.AddSingleton<LastfmClient>();
        serviceCollection.AddSingleton<ListenBrainzClient>();
        serviceCollection.AddSingleton<TraktClient>();
        serviceCollection.AddSingleton<TraktSignIns>();
        serviceCollection.AddSingleton<Scrobbler>();
        serviceCollection.AddHostedService(sp => sp.GetRequiredService<Scrobbler>());
    }
}
