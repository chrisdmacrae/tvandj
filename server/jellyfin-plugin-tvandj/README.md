# TV and J for Jellyfin

A Jellyfin plugin for the [TV and J](https://github.com/chrisdmacrae/tvandj) apps. It keeps settings that belong to the whole household, like the downloadarr address, on your Jellyfin server, so every TV and J app shares them: on every device, for every user.

Each person's own settings (request preferences, autoplay, theme music) don't need this plugin: the apps keep those in their Jellyfin account.

## Install

1. In Jellyfin, open **Dashboard → Plugins → Repositories** (**Catalog → ⚙** on some versions) and add:
   - Name: `TV and J`
   - URL: `https://raw.githubusercontent.com/chrisdmacrae/tvandj/main/server/jellyfin-plugin-tvandj/manifest.json`
2. Open **Catalog**, find **TV and J**, and install it.
3. Restart Jellyfin.

Requires Jellyfin 12.1.

## What it does

| | |
|---|---|
| `GET /TvAndJ/Household` | The household settings. Any signed-in user. |
| `POST /TvAndJ/Household` | Change them. Administrators only. Carries the time of the change; an older copy never replaces a newer one. |

The settings are a small JSON object the apps own. Its current value is shown on the plugin's page in the Dashboard.

## Build

```sh
./build.sh          # builds in the .NET 10 SDK container; writes dist/tvandj_<version>.zip
./test-plugin.sh    # runs it in a throwaway Jellyfin on :8097 and checks the API
```

Releases: push a tag like `plugin-v1.0.1`. GitHub Actions (`.github/workflows/plugin-release.yml` at the repo root) builds the plugin, attaches the zip to a release and adds it to `manifest.json`.
