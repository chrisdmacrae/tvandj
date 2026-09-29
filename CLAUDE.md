# TV and J

Jellyfin client for Fire TV. npm workspaces monorepo:

- `apps/tv` — Expo + react-native-tvos app. See `apps/tv/AGENTS.md` for Expo rules (use `npx expo install`, never hand-edit `android/`/`ios/`).
- `packages/design-system` — all UI primitives and tokens. See its README.

Rules:
- UI values (colors, spacing, type, focus) come from `@tv-and-j/design-system` tokens, never literals in the app.
- Every interactive element is built on `Focusable` (D-pad focus). Test navigation with the remote, not touch.
- After changing `src/tokens`, run `npm run build:css -w @tv-and-j/design-system` and update the matching `design/` preview.
- Run `npm run typecheck` before declaring work done.

Android TV gotchas (learned the hard way):
- react-native-tvos on Android delivers remote keys to `useTVEventHandler` as key-**up** (`eventKeyAction === 1`); act on those, ignore `0`.
- Expo Router hides screens it's leaving, running effect cleanups while the component can still render. Anything holding a native object (see `src/player/usePlayback.ts`) must drop its reference on cleanup and never touch it afterwards.
- `scripts/dev-server.sh` spins up a seeded Jellyfin for testing; the emulator reaches it at `10.0.2.2:8096`. `scripts/dev-downloadarr.mjs` mocks downloadarr on :3001.
- downloadarr is optional: gate its UI on `useDownloadarr()` returning a client; never require it for core browsing or playback.
