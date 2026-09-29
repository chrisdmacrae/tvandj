# @tv-and-j/design-system

10-foot UI design system for **TV and J**, a Jellyfin client for Fire TV / Android TV
built on React Native tvOS. Dark-only, D-pad first.

## Layout

| Path | What |
| --- | --- |
| `src/tokens/index.ts` | **Source of truth** for color, spacing, type, radii, focus, motion, artwork sizes |
| `src/components/` | React Native components (`Text`, `Focusable`, `Button`, `Badge`, `ProgressBar`, `PosterCard`, `Shelf`, `Screen`, `TextField`, `ListItem`, `Chip`, `GodRays`, `ScrubBar`, `IconButton`) |
| `design/tokens.css` | Generated from `src/tokens` — `npm run build:css -w @tv-and-j/design-system` |
| `design/components.css` | HTML/CSS mirrors of each RN component (`.ds-*` classes, `.is-focused` state) |
| `design/**/*.html` | Preview cards for Claude Design, each tagged `<!-- @dsCard group="…" -->` |

## Principles

- **Canvas is 960×540dp.** Fire TV renders 1920×1080 at xhdpi. Design at 960×540; 1dp = 1 CSS px in previews.
- **Title-safe insets:** 48dp horizontal, 27dp vertical. Only horizontally scrolling rows (`Shelf`) may bleed past the side insets.
- **Focus is the cursor.** Every interactive element is built on `Focusable`: 1.08× zoom plus a 3dp white ring on artwork, or an inverted fill on buttons. Always leave room around focusable items so the zoom isn't clipped.
- **Minimum type is 12dp (caption); body copy is 16dp.**
- **Accent (`#8B7CFF`) signals action and progress**, not decoration. `highlight` (`#3CC8E8`) is reserved for live and new states.

## Working with Claude Design

`design/` is set up so it can be synced to a claude.ai design-system project with `/design-sync`.
Each preview file's first line is a `@dsCard` marker that sets its group in the Design System pane.
When a design comes back, map `.ds-*` classes onto the RN component with the same name, and `var(--…)` values onto `tokens`.

Adding a component:

1. Add tokens to `src/tokens/index.ts` if you need new values, then run `npm run build:css`.
2. Build the RN component in `src/components/` and export it from `src/index.ts`.
3. Mirror it in `design/components.css` and add a `design/components/<name>.html` preview showing the rest and focused states.
