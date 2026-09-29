# TV and J

A [Jellyfin](https://jellyfin.org) client for Fire TV, built with Expo and
[React Native tvOS](https://github.com/react-native-tvos/react-native-tvos) following
Amazon's [Get Started with React Native for Fire TV](https://developer.amazon.com/docs/fire-tv/get-started-with-react-native.html) guide.

## Workspace

| Package | Path |
| --- | --- |
| `@tv-and-j/tv` — the Fire TV / Android TV app | `apps/tv` |
| `@tv-and-j/design-system` — tokens, RN components, Claude Design previews | `packages/design-system` |

## Getting started

Requires Node 20+, a JDK 17, and the Android SDK (`ANDROID_HOME`) for native builds.

```sh
npm install
npm run prebuild:tv          # generate android/ with TV (leanback) config
adb devices -l               # Fire TV with ADB debugging enabled
npm run android:tv -- -d <deviceName>
```

`npm run design:preview` serves the design-system preview cards locally.

## Local Jellyfin for development

```sh
scripts/dev-server.sh        # podman or docker; seeds 2 movies, 1 show, 1 album
scripts/dev-server.sh stop
```

The server runs at `http://localhost:8096` (from the Android emulator: `10.0.2.2:8096`).
The dev user's credentials are in the script. Sign in with Quick Connect or a password.

## Ratings

Jellyfin's metadata comes from TMDB/TVDB, which has an audience score but no IMDb
or Rotten Tomatoes ratings. To show those, set an [OMDb](https://www.omdbapi.com/apikey.aspx)
key in `apps/tv/.env`:

```sh
EXPO_PUBLIC_OMDB_API_KEY=your-key
```

## downloadarr (optional)

TV and J works with Jellyfin alone. Connecting [downloadarr](https://github.com/chrisdmacrae/downloadarr)
in **Settings** adds:

- **New for you** on Home, and discovery rows by genre on the Movies and TV tabs
- a **Request** button for titles not in Jellyfin, using the quality, codec and language chosen in Settings
- live download progress on cards and summary pages, then **Play** once Jellyfin has indexed the file

Settings finds downloadarr automatically: it listens for downloadarr's LAN broadcast (udp/7360,
downloadarr ≥ the `feat: answer LAN discovery broadcasts` commit) and falls back to checking the Jellyfin
host on ports 3001 and 3000/api.

For development without a real indexer or torrent client:

```sh
node scripts/dev-downloadarr.mjs   # mock API on :3001 (emulator: 10.0.2.2:3001); needs scripts/dev-server.sh
```

Requests to the mock "download" over ~40s, then drop a generated video into the dev Jellyfin library.
