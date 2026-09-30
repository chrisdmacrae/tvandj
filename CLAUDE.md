# TV and J

Jellyfin client for Fire TV. npm workspaces monorepo:

- `apps/tv` — Expo + react-native-tvos app. See `apps/tv/AGENTS.md` for Expo rules (use `npx expo install`, never hand-edit `android/`/`ios/`).
- `apps/pwa` — the same app for phones, tablets and desktop browsers: Expo Router on react-native-web, installable (manifest, service worker, iOS home-screen tags in `public/`). `npm run pwa` / `npm run build:pwa`.
- `packages/core` — everything the apps share that isn't UI: Jellyfin/downloadarr data, sign-in, profiles, settings. Imported by path (`@tv-and-j/core/jellyfin/library`). Device capabilities come in through `platform.ts` (`configurePlatform`), never native imports.
- `packages/design-system` — all UI primitives and tokens, shared by both apps. See its README.

Rules:
- UI values (colors, spacing, type, focus) come from `@tv-and-j/design-system` tokens, never literals in the app.
- Every interactive element is built on `Focusable` (D-pad focus). Test navigation with the remote, not touch.
- Layout follows `useLayout()` (tv / phone / tablet / desktop): use its `gutter`, not `safeArea`, for side margins in shared components. A TV is always `tv`; the rest go by width.
- The root `react-native` must stay `npm:react-native-tvos@0.86-stable`: a plain `react-native` there replaces the TV fork for the TV app too (the PWA doesn't care: on web it's react-native-web).
- After changing `src/tokens`, run `npm run build:css -w @tv-and-j/design-system` and update the matching `design/` preview.
- Run `npm run typecheck` before declaring work done.

Android TV gotchas (learned the hard way):
- react-native-tvos on Android delivers remote keys to `useTVEventHandler` as key-**up** (`eventKeyAction === 1`); act on those, ignore `0`.
- Expo Router hides screens it's leaving, running effect cleanups while the component can still render. Anything holding a native object (see `src/player/usePlayback.ts`) must drop its reference on cleanup and never touch it afterwards.
- `scripts/dev-server.sh` spins up a seeded Jellyfin for testing; the emulator reaches it at `10.0.2.2:8096`. `scripts/dev-downloadarr.mjs` mocks downloadarr on :3001.
- downloadarr is optional: gate its UI on `useDownloadarr()` returning a client; never require it for core browsing or playback.
- Home-screen rows and system search are Android TV / Google TV only (`AndroidTvHomeModule`, `SearchProvider` in `modules/jellyfin-discovery`). Fire TV reserves both for Amazon catalog partners, so they're no-ops there by design.
- The Android TV emulator's WebView can't start its GPU renderer (`gl_version_info … VERSION = ''`) and takes the whole app down. Trailers (`YouTubeTrailer`) are skipped on emulators (`Device.isDevice`), and a crash while one loads turns the trailer setting off at next launch. Test trailers on a real Fire TV.
