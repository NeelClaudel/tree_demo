# Responsive Interactive Tree — Design

**Date:** 2026-05-07
**Scope:** Make the existing single-page canvas demo (`app/components/InteractiveTree.jsx`) feel right on phones, tablets, and ultrawide displays without changing the desktop look.

## Problem

The canvas already fills the viewport (`100vw` / `100vh`) and listens for `resize`, but everything inside it is tuned for a desktop monitor:

- Pixel-distance constants (`BEND_RADIUS=160`, `DETACH_RADIUS=55`, `BIRD_SPOOK_RADIUS=70`) cover too much screen on a phone.
- Particle counts (`FIREFLY_COUNT=28`, `STAR_COUNT=160`) and the recursive tree depth (`maxDepth=7`) plus background-tree density don't scale, hurting framerate on mobile.
- DPR is uncapped — a 3× iPhone canvas is 9× the desktop pixel work for no visible gain.
- The bend / cursor-glow effect requires hover, which doesn't exist on touch. Browsers also leave `pointer.active=true` after a finger lifts, causing a phantom bend.
- The italic caption sits at fixed `top: 28 / left: 32` with `fontSize: 15`, no `right` inset, and overflows narrow screens. Notches on iPhones aren't respected.
- iOS Safari's collapsing URL bar makes `100vh` jump.
- Reduce Motion is ignored.

## Goals

1. Adapt visual density and physics distances to canvas size.
2. Make pointer interaction feel right on touch (drag-to-bend) without changing desktop hover.
3. Keep framerate smooth on mobile via auto-tuning, not a user-facing toggle.
4. Make the caption respect viewport size and safe-area insets.
5. Honor `prefers-reduced-motion` with a calm mode that keeps the demo's character.

## Non-Goals

- No quality toggle UI or URL parameter.
- No DeviceOrientation tilt.
- No keyboard navigation (canvas demo, no actionable controls).
- No tab-visibility auto-pause (rAF already throttles in background tabs).

## Architecture

All work happens inside `app/components/InteractiveTree.jsx`, with minor edits to `app/layout.js` and `app/globals.css`. No new files; the responsive logic lives next to the existing artistic CONFIG block so the tuning stays in one place.

A pure function is added near the top of `InteractiveTree.jsx`:

```js
qualityProfile({ width, height, dpr, reducedMotion })
  -> {
    dprCap,            // 2 on small/medium, 3 on desktop
    treeMaxDepth,      // 5 on phones, 6 on tablets, 7 on desktop
    fireflyCount,
    starCount,
    bgLayerScale,      // multiplier for BG_LAYERS_CONFIG counts
    blurScale,         // multiplier for layer.blur
    bendRadius,
    detachRadius,
    birdSpookRadius,
    motionScale,       // 1.0 normal, ~0.45 reduced-motion
    birdsEnabled,      // false in reduced-motion
  }
```

`resize()` is the single integration point. It:
1. Reads viewport size, `window.devicePixelRatio`, and the reduced-motion media query.
2. Computes the profile.
3. Caps the canvas backing-store DPR at `profile.dprCap`.
4. Stores the profile on `stateRef.current.profile`.
5. Calls the existing `buildTree`, `buildBgLayers`, `seedFireflies`, `seedStars` (which now read from the profile).

The animation loop reads `s.profile.bendRadius`, `s.profile.detachRadius`, `s.profile.birdSpookRadius`, `s.profile.motionScale`, and `s.profile.birdsEnabled` each frame.

A `matchMedia('(prefers-reduced-motion: reduce)')` listener calls `resize()` so the profile rebuilds if the user toggles the OS setting mid-session.

## Quality Tiers

| Tier | Trigger | dprCap | treeMaxDepth | fireflies | stars | bgLayerScale | blurScale |
|---|---|---|---|---|---|---|---|
| small | `min(w,h) < 600` | 2 | 5 | 14 | 80 | 0.6 | 0.6 |
| medium | `min(w,h) < 1000` | 2 | 6 | 22 | 120 | 0.85 | 0.85 |
| desktop | otherwise | 3 | 7 | 28 | 160 | 1.0 | 1.0 |

`bgLayerScale` is applied to each layer's `count` via `Math.ceil(count * scale)` so even small screens get at least 2–3 background trees per layer (preserving parallax). `blurScale` is applied to `layer.blur` to reduce the per-frame blur cost on phones.

## Pixel-Distance Constants Become Relative

The current absolute constants are converted to derived values from the canvas's smaller dimension, with clamps that preserve the desktop look:

```
const m = Math.min(width, height);
bendRadius      = clamp(m * 0.18, 90, 200);
detachRadius    = clamp(m * 0.06, 32, 70);
birdSpookRadius = clamp(m * 0.08, 45, 90);
```

Initial tree length is already `Math.min(s.height * 0.18, 130)` and stays unchanged.

## Touch Interaction (drag-to-bend)

`pointer.active` is gated on pointer type plus a tracked "buttons-down" flag:

```
onPointerMove(e):
  if (e.pointerType === 'mouse')           active = true
  else if (buttonsDown)                    active = true; update x,y
  else                                     active = false

onPointerDown(e):  buttonsDown = true; active = true; update x,y
onPointerUp(e):    if (e.pointerType !== 'mouse') active = false
                   buttonsDown = false
onPointerCancel:   active = false; buttonsDown = false
onPointerLeave:    active = false                            (unchanged)
```

Result:
- Desktop hover behavior unchanged.
- On touch, bend + cursor glow show only while a finger is down. A drag through the canopy detaches leaves via the existing `DETACH_RADIUS` proximity check, which now feels like running a finger through the leaves.
- Tap still triggers the existing shake-and-detach burst (`onPointerDown` already does this).
- No phantom bend after lift.

`canvas.style.touchAction = 'none'` is already set and is preserved. The wrapper gets `user-select: none` to suppress the iOS long-press callout.

## Reduced Motion (calm mode)

When `prefers-reduced-motion: reduce` matches, the profile sets `motionScale = 0.45` and `birdsEnabled = false`. The animation loop applies these at three points:

1. **Wind & sway:** multiply `wind` and per-branch sway amplitude by `motionScale`. Gust generation probability drops from `0.005` to `0.005 * motionScale²` (squared so gusts become rare, not just smaller).
2. **Cycle periods:** multiply `SEASON_PERIOD` and `DAY_PERIOD` by `1 / motionScale` (~2.2× slower) when reduced. The user-felt change: color/sky transitions drift instead of move.
3. **Birds:** skip `spawnBirdFlock()` when `!birdsEnabled`. In-flight birds finish their pass so the screen doesn't snap.

Tree growth, leaf interaction (drag/tap detach), and falling physics are unchanged — those are responses to user action, not surprise motion.

## Overlay Text + Safe Areas

**`app/layout.js`** — add the Next.js viewport export:

```js
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
```

`viewportFit: 'cover'` is what lets `env(safe-area-inset-*)` return non-zero values on notched devices.

**`app/globals.css`**:
- Replace `height: 100%` / `100vh` with `100dvh` so iOS Safari URL-bar collapse doesn't cause jumps.
- Add `overscroll-behavior: none` on `body` to kill pull-to-refresh.
- Add `user-select: none` on `body` to suppress text-callout during drag.

**Caption overlay** in `InteractiveTree.jsx` (replaces the current fixed `top: 28 / left: 32 / fontSize: 15`):

```js
top: 'max(20px, calc(env(safe-area-inset-top) + 8px))',
left: 'max(20px, calc(env(safe-area-inset-left) + 8px))',
right: 'max(20px, calc(env(safe-area-inset-right) + 8px))',
fontSize: 'clamp(11px, 2.6vw, 15px)',
maxWidth: 'min(70ch, 100%)',
lineHeight: 1.35,
```

The `right` inset gives the caption wrap room on narrow screens. The `clamp` shrinks the font to 11px on phones and stays at 15px on desktop.

The wrapper `<div>` changes `height: '100vh'` to `height: '100dvh'`.

## Data Flow

```
mount
  → matchMedia listener (reduced-motion)
  → resize()
       → qualityProfile(viewport, dpr, reducedMotion)
       → set canvas backing store with capped DPR
       → s.profile = profile
       → buildTree(profile.treeMaxDepth)
       → buildBgLayers(profile.bgLayerScale, profile.blurScale)
       → seedFireflies(profile.fireflyCount)
       → seedStars(profile.starCount)
  → loop reads s.profile each frame for radii + motionScale + birdsEnabled
```

`window.resize` and the reduced-motion `matchMedia` change event both route through `resize()`. One code path; no drift.

## Error Handling

- `matchMedia` is universally supported in target browsers; no fallback needed.
- DeviceOrientation is not used (drag-to-bend was chosen instead), so no permission flow.
- If `pointerType` is empty (legacy synthetic events), treat as `mouse` — preserves existing behavior.

## Testing

Manual; this is a visual demo with no unit-testable logic of consequence.

- **Viewport sweep** (Chrome DevTools device mode): 320×568, 375×667, 414×896, 768×1024, 1280×800, 1920×1080. Verify the scene looks balanced and framerate stays ≥50 fps in the perf monitor.
- **Real iPhone (Safari) + Android (Chrome):** drag-to-bend works, tap shakes branches, no phantom bend after lift, caption respects notch and doesn't overflow.
- **Reduce Motion toggle:** enable in OS settings and reload. Birds absent, season/day cycles visibly slower, wind dampened, leaves still respond to taps.
- **Mid-session resize:** drag the browser between desktop and mobile widths. Profile rebuilds, scene re-seeds without visible glitch.
- **Mid-session Reduce Motion toggle:** flip the OS setting while the page is open. Animation calms within one frame.

## What This Spec Does Not Cover

This spec covers the responsive behavior of the existing demo. It does not cover:
- New features beyond responsiveness.
- Refactoring `InteractiveTree.jsx` beyond what's needed for the profile insertion.
- Changes to color, season, or animation tuning at the desktop tier.
