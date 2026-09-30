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

## Hosting the web app

On any Linux box with Docker (the script offers to install it), no checkout needed:

```sh
curl -fsSL https://raw.githubusercontent.com/chrisdmacrae/tvandj/main/deploy/setup.sh | bash
```

It asks for a port and an optional domain, downloads `deploy/docker-compose.yml` and the `Caddyfile`
into an install folder (`/opt/tvandj` as root, `~/tvandj` otherwise, or `--dir`), saves the answers in
`.env` there, and starts the prebuilt app (`ghcr.io/chrisdmacrae/tvandj-pwa`, amd64 and arm64). A copy
of the script goes in the folder to manage it:

```sh
~/tvandj/setup.sh update     # newest compose files and app, restart
~/tvandj/setup.sh stop | logs | status
```

- **HTTPS** (optional) runs Caddy with a Let's Encrypt certificate: a domain pointing at the box, ports
  80 and 443 open, and an email. Browsers only install the app and run its service worker over HTTPS, and
  over HTTPS the app can only reach a Jellyfin (and downloadarr) that's on HTTPS too.
- Without questions: `curl -fsSL …/setup.sh | bash -s -- --yes --port 8080 --domain tv.example.com --email me@example.com`.
  `TVANDJ_REF=<branch or tag>` takes the files from somewhere other than `main`.
- To build the image yourself (e.g. with an OMDb key baked in): `docker build -f apps/pwa/Dockerfile .`
  from a checkout, then set `PWA_IMAGE` in the install folder's `.env`.

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
(the web app asks once, right after sign-in; after that it's in **Settings**) adds:

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

## Cloudflare Access (web app)

When Jellyfin and downloadarr sit behind Cloudflare Access (Zero Trust), turn on **Behind Cloudflare Access**
when connecting, or later in Settings → Connection. The web app then sends the browser's `CF_Authorization`
cookie with its requests to both, including video streams. For that to work:

- Open the Jellyfin and downloadarr addresses in the same browser once, so Access signs you in to each.
  Do it again whenever the Access session expires.
- Each server must answer CORS with the web app's exact origin and `Access-Control-Allow-Credentials: true`.
  Jellyfin's default `*` doesn't work with cookies: list the web app's address under `CorsHosts` in
  Jellyfin's `network.xml`. For downloadarr, set `FRONTEND_URL` to the web app's address.
- In the Access application, allow CORS preflight: enable **Bypass OPTIONS requests to origin**, or set
  its CORS settings to allow the web app's origin with credentials.
- If the web app is on another domain, set the Access cookie's SameSite attribute to None.
