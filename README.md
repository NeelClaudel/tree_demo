# Interactive Tree — Next.js Demo

A canvas-based interactive tree that lives as a background or full-page experience. Includes a sapling grow-in, seasons, day/night cycle, wind gusts, parallax background trees, fireflies, ground pile, falling leaves with regrow, click-to-shake with branch oscillation, and the occasional bird.

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Project structure

```
tree-demo/
├── app/
│   ├── components/
│   │   └── InteractiveTree.jsx   ← the component
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── package.json
├── next.config.mjs
└── jsconfig.json
```

## Use it as a background in your own app

```jsx
'use client';
import InteractiveTree from './components/InteractiveTree';

export default function Layout({ children }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: -1 }}>
        <InteractiveTree />
      </div>
      <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>
    </>
  );
}
```

The component takes `100% × 100vh` and draws a moody scene. Place it behind your content with `position: fixed; inset: 0; z-index: -1`.

## Tuning

All knobs live in the CONFIG block at the top of `InteractiveTree.jsx`:

| Constant | Effect |
| --- | --- |
| `BEND_RADIUS` | how far the cursor reaches into the canopy |
| `DETACH_RADIUS` | how close the cursor gets before a leaf falls |
| `RESPAWN_MIN/MAX` | seconds before a fallen leaf regrows |
| `GROW_DURATION` | leaf scale-in duration |
| `SEASON_PERIOD` | seconds for spring → summer → autumn → winter → spring |
| `DAY_PERIOD` | seconds for dawn → noon → dusk → night → dawn |
| `FIREFLY_COUNT` / `STAR_COUNT` | particle counts |
| `PILE_FADE_MIN/MAX` | seconds a fallen leaf rests on the ground before recycling |
| `BRANCH_PHASE` / `BRANCH_PHASE_JITTER` | sapling grow-in cascade speed |
| `BIRD_INTERVAL_MIN/MAX` | seconds between bird flocks |
| `BIRD_SPOOK_RADIUS` / `BIRD_SPOOK_CHANCE` | how disruptive birds are to leaves |
| `BG_LAYERS_CONFIG` | distant tree layers (count, scale, blur, alpha) |

## Interaction

- **Hover** — branches bend toward the cursor, nearby leaves fall.
- **Click / tap** — shakes the tree. Branches oscillate with damped sine, ~60% of leaves drop.
- **Wait** — sapling grows in on first load, then seasons cycle, day turns to night, wind gusts pass, birds fly through.

## Performance notes

- Background tree layers are rendered fresh each frame (so seasonal color shifts are smooth) and composited with a single blur pass per layer. On low-end mobile this can be throttled by skipping render every other frame.
- Pointer events are used (works for mouse + touch). `touch-action: none` on the canvas prevents page scroll while interacting on touch devices.
- Pause-when-tab-hidden is not implemented; add via `document.visibilityState` if needed for battery.

## License

Do whatever you want with this. No attribution required.
# tree_demo
