# TV and J for Jellyfin

A Jellyfin plugin for the [TV and J](https://github.com/chrisdmacrae/tvandj) apps. It keeps settings that belong to the whole household, like the downloadarr address, on your Jellyfin server, so every TV and J app shares them: on every device, for every user.

It also scrobbles (1.1+): everyone connects their own Last.fm, ListenBrainz and Trakt accounts in TV and J's Settings, and whatever they play, in any Jellyfin app, is added to them. Songs go to Last.fm and ListenBrainz once they've played for half their length or 4 minutes; movies and episodes go to Trakt, live, with pauses (Trakt marks them watched from 80%).

From 1.2, anything can be scrobbled by hand (a Scrobble button in the apps), and each person can have their My List kept on their Trakt watchlist: one way, Jellyfin to Trakt, unwatched movies and shows only. Turning it on adds what's on My List now; after that, adding a title adds it, and removing it or finishing it (a movie, or a show's last episode) takes it off the watchlist.

Each person's own settings (request preferences, autoplay, theme music) don't need this plugin: the apps keep those in their Jellyfin account.

## Install

1. In Jellyfin, open **Dashboard → Plugins → Repositories** (**Catalog → ⚙** on some versions) and add:
   - Name: `TV and J`
   - URL: `https://raw.githubusercontent.com/chrisdmacrae/tvandj/main/server/jellyfin-plugin-tvandj/manifest.json`
2. Open **Catalog**, find **TV and J**, and install it.
3. Restart Jellyfin.

Requires Jellyfin 12.1.

## Scrobbling setup (administrators)

ListenBrainz works straight away. Last.fm and Trakt only let registered apps sign people in, so register this server with them once, then paste the credentials into **Dashboard → Plugins → TV and J**:

- **Last.fm**: create an API account at <https://www.last.fm/api/account/create> (the callback URL can stay empty). Copy the API key and shared secret.
- **Trakt**: create an app at <https://trakt.tv/oauth/applications/new> with the redirect URI `urn:ietf:wg:oauth:2.0:oob`. Copy the client ID and secret.

People's own sign-ins are stored in `scrobbling.json` in the plugin's data folder, not in the plugin configuration, and never sent back to the apps. If the separate Last.fm, ListenBrainz or Trakt plugins are installed too, turn off scrobbling in one or the other, or plays count twice.

## What it does

| | |
|---|---|
| `GET /TvAndJ/Household` | The household settings. Any signed-in user. |
| `POST /TvAndJ/Household` | Change them. Administrators only. Carries the time of the change; an older copy never replaces a newer one. |
| `GET /TvAndJ/Scrobbling` | Which services the server can scrobble to, and which the signed-in user has connected (and as whom). |
| `POST /TvAndJ/Scrobbling/Lastfm` | `{Username, Password}`: sign in to Last.fm. The password isn't kept, only the session key. |
| `POST /TvAndJ/Scrobbling/ListenBrainz` | `{Token}`: the user's ListenBrainz token, checked with ListenBrainz first. |
| `POST /TvAndJ/Scrobbling/Trakt/Code`, `…/Trakt/Poll` | Trakt's device sign-in: show the code, then poll until the person has entered it at trakt.tv/activate. |
| `DELETE /TvAndJ/Scrobbling/{lastfm\|listenbrainz\|trakt}` | Disconnect (Trakt's token is revoked too). |
| `PUT /TvAndJ/Scrobbling/Trakt/Watchlist` | `{Enabled}`: keep the Trakt watchlist in step with My List (1.2+). Turning it on adds what's on My List now and returns how many. |
| `POST /TvAndJ/Scrobbling/Items/{itemId}` | Scrobble it now, played or not (1.2+): a song or album to Last.fm and ListenBrainz, as if just listened to; a movie, episode, season or show into Trakt's history. Returns what each service did. |

The scrobbling endpoints act only on the signed-in user.

The settings are a small JSON object the apps own. Its current value is shown on the plugin's page in the Dashboard.

## Build

```sh
DOCKER=podman ./build.sh   # or plain ./build.sh with Docker; builds in the .NET 10 SDK container; writes dist/tvandj_<version>.zip
./test-plugin.sh    # runs it in a throwaway Jellyfin on :8097 and checks the API (DOCKER=podman to use Podman)
```

Releases: push a tag like `plugin-v1.0.1`. GitHub Actions (`.github/workflows/plugin-release.yml` at the repo root) builds the plugin, attaches the zip to a release and adds it to `manifest.json`.
