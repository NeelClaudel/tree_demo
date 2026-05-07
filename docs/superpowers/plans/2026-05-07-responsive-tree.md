# Responsive Interactive Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas tree demo feel right on phones, tablets, and ultrawide displays without changing the desktop look — via a single `qualityProfile()` derived from viewport size, DPR, and `prefers-reduced-motion`.

**Architecture:** All work stays in `app/components/InteractiveTree.jsx` plus minor edits to `app/layout.js` and `app/globals.css`. A pure `qualityProfile()` function returns one config object that drives DPR cap, particle counts, tree depth, blur, pixel-distance radii, and motion intensity. `resize()` is the single integration point; the animation loop reads `s.profile` each frame.

**Tech Stack:** Next.js 14 (app router), React 18, plain `<canvas>` 2D context. New: Vitest for the one pure-function test.

**Spec:** `docs/superpowers/specs/2026-05-07-responsive-tree-design.md`

---

## File Structure

**Create:**
- `app/components/__tests__/qualityProfile.test.js` — pins down the tier table

**Modify:**
- `package.json` — add `vitest` devDep + `test` script
- `app/components/InteractiveTree.jsx` — add `qualityProfile`, wire it into `resize()` + animation loop, gate pointer.active by pointer type, calm-mode motion, safe-area caption styles, `100dvh` wrapper
- `app/layout.js` — add Next.js `viewport` export with `viewportFit: 'cover'`
- `app/globals.css` — `100dvh`, `overscroll-behavior: none`, `user-select: none`

The whole responsive concern is co-located with the existing artistic CONFIG block in `InteractiveTree.jsx` so the tuning stays in one place. `qualityProfile` is exported from that file so it can be unit-tested without rendering.

---

## Task 1: Install Vitest + add test script

**Why a test runner at all when the spec said manual?** The spec is right that visual behavior gets manual verification — but `qualityProfile()` is pure branching logic with boundary thresholds (599 vs 600, 999 vs 1000). That's exactly the kind of code that benefits from a unit test. One test file, one runner, no DOM needed.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vitest as a dev dependency**

Run: `npm install -D vitest@^1.6.0`

Expected: `package.json` and `package-lock.json` updated, no other changes.

- [ ] **Step 2: Add test script to package.json**

Edit `package.json` — add `"test": "vitest run"` to the `scripts` block:

```json
{
  "name": "interactive-tree-demo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  ...
}
```

Use `vitest run` (not `vitest`) so the command exits after one pass instead of watching.

- [ ] **Step 3: Verify the runner is wired up**

Run: `npm test`

Expected: Vitest starts, finds no test files, exits with a "No test files found" message and code 0 or 1 (either is fine — we just want to confirm vitest itself is callable).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for pure-function tests"
```

---

## Task 2: TDD `qualityProfile()` — write failing test first

**Files:**
- Create: `app/components/__tests__/qualityProfile.test.js`

- [ ] **Step 1: Write the failing test**

Create `app/components/__tests__/qualityProfile.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { qualityProfile } from '../InteractiveTree.jsx';

describe('qualityProfile', () => {
  describe('tier selection by min(width, height)', () => {
    it('selects small tier below 600', () => {
      const p = qualityProfile({ width: 375, height: 667, dpr: 3, reducedMotion: false });
      expect(p.dprCap).toBe(2);
      expect(p.treeMaxDepth).toBe(5);
      expect(p.fireflyCount).toBe(14);
      expect(p.starCount).toBe(80);
      expect(p.bgLayerScale).toBe(0.6);
      expect(p.blurScale).toBe(0.6);
    });

    it('selects medium tier between 600 and 999', () => {
      const p = qualityProfile({ width: 768, height: 1024, dpr: 2, reducedMotion: false });
      expect(p.dprCap).toBe(2);
      expect(p.treeMaxDepth).toBe(6);
      expect(p.fireflyCount).toBe(22);
      expect(p.starCount).toBe(120);
      expect(p.bgLayerScale).toBe(0.85);
      expect(p.blurScale).toBe(0.85);
    });

    it('selects desktop tier at 1000 and above', () => {
      const p = qualityProfile({ width: 1440, height: 900, dpr: 2, reducedMotion: false });
      expect(p.dprCap).toBe(3);
      expect(p.treeMaxDepth).toBe(7);
      expect(p.fireflyCount).toBe(28);
      expect(p.starCount).toBe(160);
      expect(p.bgLayerScale).toBe(1);
      expect(p.blurScale).toBe(1);
    });

    it('treats min(w,h)=599 as small (boundary)', () => {
      expect(qualityProfile({ width: 599, height: 800, dpr: 1, reducedMotion: false }).treeMaxDepth).toBe(5);
    });

    it('treats min(w,h)=600 as medium (boundary)', () => {
      expect(qualityProfile({ width: 600, height: 800, dpr: 1, reducedMotion: false }).treeMaxDepth).toBe(6);
    });

    it('treats min(w,h)=999 as medium (boundary)', () => {
      expect(qualityProfile({ width: 999, height: 1200, dpr: 1, reducedMotion: false }).treeMaxDepth).toBe(6);
    });

    it('treats min(w,h)=1000 as desktop (boundary)', () => {
      expect(qualityProfile({ width: 1000, height: 1200, dpr: 1, reducedMotion: false }).treeMaxDepth).toBe(7);
    });
  });

  describe('pixel-distance radii (clamped)', () => {
    it('clamps small-screen bendRadius to floor of 90', () => {
      const p = qualityProfile({ width: 320, height: 568, dpr: 2, reducedMotion: false });
      expect(p.bendRadius).toBe(90);
    });

    it('scales bendRadius from min-dimension on medium', () => {
      const p = qualityProfile({ width: 800, height: 800, dpr: 2, reducedMotion: false });
      expect(p.bendRadius).toBe(800 * 0.18);
    });

    it('clamps large-screen bendRadius to ceiling of 200', () => {
      const p = qualityProfile({ width: 4000, height: 4000, dpr: 2, reducedMotion: false });
      expect(p.bendRadius).toBe(200);
    });

    it('clamps detachRadius between 32 and 70', () => {
      expect(qualityProfile({ width: 200, height: 200, dpr: 1, reducedMotion: false }).detachRadius).toBe(32);
      expect(qualityProfile({ width: 5000, height: 5000, dpr: 1, reducedMotion: false }).detachRadius).toBe(70);
    });

    it('clamps birdSpookRadius between 45 and 90', () => {
      expect(qualityProfile({ width: 300, height: 300, dpr: 1, reducedMotion: false }).birdSpookRadius).toBe(45);
      expect(qualityProfile({ width: 5000, height: 5000, dpr: 1, reducedMotion: false }).birdSpookRadius).toBe(90);
    });
  });

  describe('reduced motion', () => {
    it('sets motionScale to 0.45 and disables birds when reduced', () => {
      const p = qualityProfile({ width: 1440, height: 900, dpr: 2, reducedMotion: true });
      expect(p.motionScale).toBeCloseTo(0.45);
      expect(p.birdsEnabled).toBe(false);
    });

    it('keeps motionScale at 1 and birds on by default', () => {
      const p = qualityProfile({ width: 1440, height: 900, dpr: 2, reducedMotion: false });
      expect(p.motionScale).toBe(1);
      expect(p.birdsEnabled).toBe(true);
    });

    it('does not change visual tier when reduced', () => {
      const a = qualityProfile({ width: 1440, height: 900, dpr: 2, reducedMotion: false });
      const b = qualityProfile({ width: 1440, height: 900, dpr: 2, reducedMotion: true });
      expect(b.fireflyCount).toBe(a.fireflyCount);
      expect(b.starCount).toBe(a.starCount);
      expect(b.bgLayerScale).toBe(a.bgLayerScale);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL — error like `qualityProfile is not exported from InteractiveTree.jsx` or `qualityProfile is not a function`.

- [ ] **Step 3: Implement `qualityProfile` and export it**

Edit `app/components/InteractiveTree.jsx`. Just below the existing `BG_LAYERS_CONFIG` array (~line 35) and above the `// === SEASONS ===` divider, add:

```js
// ============================================================================
// RESPONSIVE QUALITY PROFILE
// ============================================================================
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function qualityProfile({ width, height, dpr, reducedMotion }) {
  const m = Math.min(width, height);

  let tier;
  if (m < 600) {
    tier = { dprCap: 2, treeMaxDepth: 5, fireflyCount: 14, starCount: 80, bgLayerScale: 0.6, blurScale: 0.6 };
  } else if (m < 1000) {
    tier = { dprCap: 2, treeMaxDepth: 6, fireflyCount: 22, starCount: 120, bgLayerScale: 0.85, blurScale: 0.85 };
  } else {
    tier = { dprCap: 3, treeMaxDepth: 7, fireflyCount: 28, starCount: 160, bgLayerScale: 1, blurScale: 1 };
  }

  return {
    ...tier,
    bendRadius: clamp(m * 0.18, 90, 200),
    detachRadius: clamp(m * 0.06, 32, 70),
    birdSpookRadius: clamp(m * 0.08, 45, 90),
    motionScale: reducedMotion ? 0.45 : 1,
    birdsEnabled: !reducedMotion,
  };
}
```

`dpr` is accepted in the input shape (matches the spec's data flow) but isn't read inside the function — the DPR cap from the tier is what `resize()` uses. Keeping the param keeps the call site honest about what determines quality.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS — all 16 cases green.

- [ ] **Step 5: Commit**

```bash
git add app/components/InteractiveTree.jsx app/components/__tests__/qualityProfile.test.js
git commit -m "feat: add qualityProfile pure function with tiered responsive thresholds"
```

---

## Task 3: Wire `qualityProfile` into `resize()`

This task hooks the profile into the existing setup pipeline: cap DPR, regenerate the world with profile-driven counts and depth, store the profile for the loop. No behavior visible yet because the loop still reads the old constants — that comes in Task 4.

**Files:**
- Modify: `app/components/InteractiveTree.jsx`

- [ ] **Step 1: Make `buildTree` accept `maxDepth` from the profile**

In `InteractiveTree.jsx`, the existing `buildTree` reads `s.maxDepth` (set as a default on `stateRef.current`). Find this in the `stateRef.current = { ... }` initializer (around the original line 190):

```js
maxDepth: 7,
```

Remove that line. Then in `buildTree`, replace the `if (depth >= s.maxDepth || length < 6)` check with:

```js
if (depth >= s.profile.treeMaxDepth || length < 6) {
```

- [ ] **Step 2: Make `buildBgLayers` use `bgLayerScale` and `blurScale`**

Inside `buildBgLayers`, change the existing `for (const cfg of BG_LAYERS_CONFIG)` block. Where it currently loops `for (let i = 0; i < cfg.count; i++)`, scale the count and the blur:

```js
for (const cfg of BG_LAYERS_CONFIG) {
  const trees = [];
  const count = Math.max(2, Math.ceil(cfg.count * s.profile.bgLayerScale));
  for (let i = 0; i < count; i++) {
    const slot = (i + 0.5) / count;
    const jitter = (Math.random() - 0.5) * (1 / count) * 0.6;
    const x = lerp(-0.08, 1.08, slot + jitter) * s.width;
    const y = s.height - 4 + Math.random() * 6;
    const scale = lerp(cfg.scaleMin, cfg.scaleMax, Math.random());
    trees.push(generateBgTreeData(x, y, scale, cfg.depth));
  }
  s.bgLayers.push({
    trees,
    blur: cfg.blur * s.profile.blurScale,
    alpha: cfg.alpha,
    parallax: cfg.parallax,
    leafLightDelta: cfg.leafLightDelta,
    leafSatDelta: cfg.leafSatDelta,
  });
}
```

The `Math.max(2, ...)` floor ensures even small phones get at least 2 trees per layer.

- [ ] **Step 3: Make `seedFireflies` and `seedStars` read from the profile**

Replace the seeding loops:

```js
const seedFireflies = () => {
  const s = stateRef.current;
  s.fireflies = [];
  for (let i = 0; i < s.profile.fireflyCount; i++) {
    s.fireflies.push({
      x: Math.random() * s.width,
      y: Math.random() * s.height * 0.85,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + Math.random() * 1.4,
      hue: 48 + Math.random() * 18,
    });
  }
};

const seedStars = () => {
  const s = stateRef.current;
  s.stars = [];
  for (let i = 0; i < s.profile.starCount; i++) {
    const big = Math.random() < 0.06;
    s.stars.push({
      x: Math.random() * s.width,
      y: Math.random() * s.height * 0.7,
      brightness: 0.35 + Math.random() * 0.65,
      twinkleSpeed: 0.6 + Math.random() * 2.5,
      twinklePhase: Math.random() * Math.PI * 2,
      size: big ? 1.4 + Math.random() * 0.6 : 0.5 + Math.random() * 0.5,
      hue: 200 + Math.random() * 30,
    });
  }
};
```

The function bodies are unchanged except the loop bound. Including the full code so the engineer doesn't have to diff carefully.

- [ ] **Step 4: Compute and store profile + cap DPR in `resize`**

Replace the existing `resize` function with:

```js
const resize = () => {
  const s = stateRef.current;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  s.width = canvas.offsetWidth;
  s.height = canvas.offsetHeight;
  s.profile = qualityProfile({
    width: s.width,
    height: s.height,
    dpr: window.devicePixelRatio || 1,
    reducedMotion,
  });
  const dpr = Math.min(window.devicePixelRatio || 1, s.profile.dprCap);
  canvas.width = s.width * dpr;
  canvas.height = s.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  buildTree();
  buildBgLayers();
  seedFireflies();
  seedStars();
};
```

The order matters: profile must be computed before any of the four `build*`/`seed*` functions, since they all read `s.profile`.

- [ ] **Step 5: Add profile field to the state initializer**

Find the `stateRef.current = { ... }` initializer and add `profile: null,` (just below where `maxDepth` used to be). This keeps the shape explicit:

```js
const stateRef = useRef({
  branches: [],
  // ... existing fields ...
  profile: null,
  // ... rest ...
});
```

- [ ] **Step 6: Add `prefers-reduced-motion` media-query listener**

In the same `useEffect` block, after the existing `window.addEventListener('resize', resize)`, add:

```js
const motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
motionMQ.addEventListener('change', resize);
```

In the cleanup return at the bottom of the effect, add:

```js
motionMQ.removeEventListener('change', resize);
```

- [ ] **Step 7: Manual verification — desktop still looks the same**

Run: `npm run dev`

Open `http://localhost:3000`. Confirm:
- Tree still grows from sapling to full canopy.
- Birds still appear after ~20s.
- Fireflies appear after dark.
- Background trees parallax visible.
- No console errors.

Then resize the browser narrower than 600px wide. Confirm: scene re-seeds with fewer fireflies/stars/bg trees; framerate stays smooth.

- [ ] **Step 8: Run unit tests to confirm nothing regressed**

Run: `npm test`

Expected: PASS — qualityProfile tests still green.

- [ ] **Step 9: Commit**

```bash
git add app/components/InteractiveTree.jsx
git commit -m "feat: drive resize() from qualityProfile (counts, depth, DPR cap, blur)"
```

---

## Task 4: Replace pixel-distance constants with profile values

The animation loop currently uses absolute `BEND_RADIUS=160`, `DETACH_RADIUS=55`, `BIRD_SPOOK_RADIUS=70` from the CONFIG block. Replace each read with `s.profile.*`. The constants stay defined as documentation but become unused — leave them in case the engineer wants to compare.

Actually no — unused constants are noise. Delete them.

**Files:**
- Modify: `app/components/InteractiveTree.jsx`

- [ ] **Step 1: Delete the now-unused absolute constants**

In the CONFIG block at the top, remove these three lines:

```js
const BEND_RADIUS = 160;
const DETACH_RADIUS = 55;
// ...
const BIRD_SPOOK_RADIUS = 70;
```

Keep `BIRD_SPOOK_CHANCE` — it's a probability, not a radius.

- [ ] **Step 2: Replace `BEND_RADIUS` reads in the branch loop**

Find this block in the animation loop (currently uses `BEND_RADIUS`):

```js
if (dist < BEND_RADIUS) {
  const bdx = Math.cos(angle);
  const bdy = Math.sin(angle);
  const perp = bdx * dy - bdy * dx;
  const norm = perp / Math.max(dist, 0.001);
  const force = 1 - dist / BEND_RADIUS;
```

Replace both reads with `s.profile.bendRadius`:

```js
if (dist < s.profile.bendRadius) {
  const bdx = Math.cos(angle);
  const bdy = Math.sin(angle);
  const perp = bdx * dy - bdy * dx;
  const norm = perp / Math.max(dist, 0.001);
  const force = 1 - dist / s.profile.bendRadius;
```

- [ ] **Step 3: Replace `DETACH_RADIUS` read in the leaf-touch detach check**

Find:

```js
if (dist < DETACH_RADIUS) {
```

Replace with:

```js
if (dist < s.profile.detachRadius) {
```

- [ ] **Step 4: Replace `BIRD_SPOOK_RADIUS` read in the bird-spook loop**

Find:

```js
if (dist < BIRD_SPOOK_RADIUS && Math.random() < BIRD_SPOOK_CHANCE) {
```

Replace with:

```js
if (dist < s.profile.birdSpookRadius && Math.random() < BIRD_SPOOK_CHANCE) {
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

- Desktop (≥1000px wide): hover near a branch — bend feels the same as before. Hover near a leaf — leaf flies off. Birds still spook leaves they pass near.
- Resize to phone width (~375px): bend radius is now smaller (clamped to 90px), so you have to hover closer to the tree to bend it. This is intentional.

- [ ] **Step 6: Commit**

```bash
git add app/components/InteractiveTree.jsx
git commit -m "feat: scale bend/detach/spook radii to canvas size"
```

---

## Task 5: Drag-to-bend on touch

Today, `pointermove` always sets `pointer.active = true`. On touch, the browser leaves the pointer at the last position after a finger lifts, so the bend persists. Fix by gating on pointer type and tracked button state.

**Files:**
- Modify: `app/components/InteractiveTree.jsx`

- [ ] **Step 1: Add `buttonsDown` to `pointerRef`**

Find the existing initializer:

```js
const pointerRef = useRef({ x: -9999, y: -9999, active: false });
```

Replace with:

```js
const pointerRef = useRef({ x: -9999, y: -9999, active: false, buttonsDown: false });
```

- [ ] **Step 2: Replace the pointer handlers**

Find the existing block defining `updatePointer`, `onPointerMove`, `onPointerLeave`, `onPointerDown`. Replace the whole block with:

```js
const updatePointerXY = (e) => {
  const rect = canvas.getBoundingClientRect();
  pointerRef.current.x = e.clientX - rect.left;
  pointerRef.current.y = e.clientY - rect.top;
};

const onPointerMove = (e) => {
  updatePointerXY(e);
  if (e.pointerType === 'mouse') {
    pointerRef.current.active = true;
  } else {
    pointerRef.current.active = pointerRef.current.buttonsDown;
  }
};

const onPointerLeave = () => {
  pointerRef.current.active = false;
  pointerRef.current.buttonsDown = false;
  pointerRef.current.x = -9999;
  pointerRef.current.y = -9999;
};

const onPointerDown = (e) => {
  updatePointerXY(e);
  pointerRef.current.buttonsDown = true;
  pointerRef.current.active = true;
  const s = stateRef.current;
  const cx = pointerRef.current.x;
  const cy = pointerRef.current.y;
  for (const leaf of s.leaves) {
    if (!leaf.attached || leaf.respawnAt !== null || leaf.growProgress < 0.9) continue;
    if (Math.random() > 0.6) continue;
    const dx = leaf.x - cx;
    const dy = leaf.y - cy;
    const dist = Math.max(Math.hypot(dx, dy), 1);
    leaf.attached = false;
    leaf.vx = (dx / dist) * 2.2 + (Math.random() - 0.5) * 1.5;
    leaf.vy = -1.2 - Math.random() * 1.0;
    leaf.rot = Math.random() * Math.PI * 2;
    leaf.rotSpeed = (Math.random() - 0.5) * 0.18;
    s.falling.push(leaf);
  }
  s.shakeRequested = true;
};

const onPointerUp = (e) => {
  pointerRef.current.buttonsDown = false;
  if (e.pointerType !== 'mouse') {
    pointerRef.current.active = false;
  }
};

const onPointerCancel = () => {
  pointerRef.current.buttonsDown = false;
  pointerRef.current.active = false;
};
```

The down-handler logic that detaches leaves and triggers shake is unchanged — same code, just bracketed by the new `buttonsDown = true` line.

- [ ] **Step 3: Register the new listeners**

Find the existing block:

```js
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerleave', onPointerLeave);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.style.touchAction = 'none';
```

Replace with:

```js
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerleave', onPointerLeave);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerCancel);
canvas.style.touchAction = 'none';
```

- [ ] **Step 4: Update cleanup**

In the effect's cleanup return, find:

```js
canvas.removeEventListener('pointermove', onPointerMove);
canvas.removeEventListener('pointerleave', onPointerLeave);
canvas.removeEventListener('pointerdown', onPointerDown);
```

Replace with:

```js
canvas.removeEventListener('pointermove', onPointerMove);
canvas.removeEventListener('pointerleave', onPointerLeave);
canvas.removeEventListener('pointerdown', onPointerDown);
canvas.removeEventListener('pointerup', onPointerUp);
canvas.removeEventListener('pointercancel', onPointerCancel);
```

- [ ] **Step 5: Manual verification — desktop**

Run: `npm run dev`. On desktop with a mouse:
- Hovering still bends branches.
- Cursor glow follows the cursor.
- Clicking still detaches leaves and shakes.

- [ ] **Step 6: Manual verification — touch (Chrome DevTools)**

Open the page, F12 → Toggle device toolbar → iPhone 12 Pro. The pointer in DevTools mode synthesizes touch.
- Click-and-drag on the canvas: bend appears under the cursor while held, disappears on release.
- Quick tap: branches shake, some leaves fly off, no lingering bend.

- [ ] **Step 7: Run unit tests (sanity)**

Run: `npm test`. Expected: PASS — qualityProfile tests untouched.

- [ ] **Step 8: Commit**

```bash
git add app/components/InteractiveTree.jsx
git commit -m "feat: drag-to-bend on touch, gate pointer.active by pointer type"
```

---

## Task 6: Reduced-motion calm mode

Apply `motionScale` to wind, sway, and gusts; slow the season/day cycles; suppress new bird flocks. The profile is already computed in `resize()`; this task threads its values through the loop.

**Files:**
- Modify: `app/components/InteractiveTree.jsx`

- [ ] **Step 1: Apply `motionScale` to base wind and sway**

In the animation loop, find the WIND section. Replace:

```js
const windDamp = isSapling ? 0 : 1;
const baseWind = (Math.sin(t * 0.3) * 0.15 + Math.sin(t * 0.7) * 0.08) * windDamp;
if (!isSapling && t > s.wind.gustUntil && Math.random() < 0.005) {
```

With:

```js
const motionScale = s.profile.motionScale;
const windDamp = isSapling ? 0 : motionScale;
const baseWind = (Math.sin(t * 0.3) * 0.15 + Math.sin(t * 0.7) * 0.08) * windDamp;
if (!isSapling && t > s.wind.gustUntil && Math.random() < 0.005 * motionScale * motionScale) {
```

`windDamp` is multiplied by `motionScale` so the existing per-branch sway code (which already uses `windDamp`) automatically dampens. Gust probability is squared so gusts become rare, not just smaller.

- [ ] **Step 2: Slow season + day cycles**

Find:

```js
const seasonPhase = (t / SEASON_PERIOD) % 1;
```

Replace with:

```js
const seasonPhase = (t * motionScale / SEASON_PERIOD) % 1;
```

Find:

```js
const dayPhase = (t / DAY_PERIOD) % 1;
```

Replace with:

```js
const dayPhase = (t * motionScale / DAY_PERIOD) % 1;
```

Multiplying `t` by `motionScale` (instead of dividing the period) means the cycle slows by the same factor — `motionScale = 0.45` → cycles take ~2.2× longer to complete.

- [ ] **Step 3: Suppress bird spawning when birds disabled**

Find:

```js
if (!isSapling && t > s.nextBirdAt) {
  spawnBirdFlock();
  s.nextBirdAt = t + BIRD_INTERVAL_MIN + Math.random() * (BIRD_INTERVAL_MAX - BIRD_INTERVAL_MIN);
}
```

Replace with:

```js
if (!isSapling && s.profile.birdsEnabled && t > s.nextBirdAt) {
  spawnBirdFlock();
  s.nextBirdAt = t + BIRD_INTERVAL_MIN + Math.random() * (BIRD_INTERVAL_MAX - BIRD_INTERVAL_MIN);
}
```

In-flight birds (the `s.birds.filter(...)` block right below) are unchanged — they finish their pass.

- [ ] **Step 4: Manual verification — normal**

Run: `npm run dev`. With Reduce Motion off (default):
- Birds still appear within ~20–50s.
- Day/night cycle visibly progresses (full cycle in ~60s).
- Wind sway clearly visible.

- [ ] **Step 5: Manual verification — reduced**

Enable OS reduced motion:
- **macOS:** System Settings → Accessibility → Display → Reduce motion.
- **Windows:** Settings → Accessibility → Visual effects → Animation effects (off).
- **Chrome DevTools fallback:** F12 → Cmd/Ctrl+Shift+P → "Show Rendering" → Emulate CSS media feature `prefers-reduced-motion: reduce`.

Reload. Confirm:
- No new bird flocks spawn (wait at least 60s).
- Wind sway is dampened (subtle but visible).
- Day/night transition is barely perceptible drift over a minute.
- Tree still grew from sapling normally.
- Tapping/clicking still detaches leaves and shakes branches.

Then disable reduced motion (or toggle the DevTools emulation off) without reloading. Within a frame or two, motion ramps back up — proves the matchMedia listener works.

- [ ] **Step 6: Run unit tests**

Run: `npm test`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/components/InteractiveTree.jsx
git commit -m "feat: respect prefers-reduced-motion (calm mode)"
```

---

## Task 7: Viewport meta + globals.css safe-area + 100dvh

**Files:**
- Modify: `app/layout.js`
- Modify: `app/globals.css`
- Modify: `app/components/InteractiveTree.jsx` (wrapper height)

- [ ] **Step 1: Add Next.js viewport export**

Edit `app/layout.js`:

```jsx
import './globals.css';

export const metadata = {
  title: 'Interactive Tree',
  description: 'A canvas tree with seasons, day/night, birds, and more.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`viewportFit: 'cover'` is required for `env(safe-area-inset-*)` to return non-zero values on notched devices.

- [ ] **Step 2: Update globals.css**

Replace the contents of `app/globals.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: #060403;
  color: #d4a574;
  font-family: Georgia, 'Times New Roman', serif;
  overscroll-behavior: none;
  user-select: none;
  -webkit-user-select: none;
}

main {
  width: 100vw;
  height: 100dvh;
}
```

`100dvh` (dynamic viewport height) tracks iOS Safari's collapsing URL bar. `overscroll-behavior: none` kills pull-to-refresh during interactions.

- [ ] **Step 3: Update InteractiveTree.jsx wrapper height**

In the JSX returned at the bottom of the component, find:

```jsx
<div style={{ width: '100%', height: '100vh', position: 'relative', background: '#060403', overflow: 'hidden' }}>
```

Replace with:

```jsx
<div style={{ width: '100%', height: '100dvh', position: 'relative', background: '#060403', overflow: 'hidden' }}>
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`.

- Desktop: page still fills the window.
- Mobile (real device or DevTools iPhone): scroll up/down on the canvas — no pull-to-refresh, no rubber-band.
- iOS Safari (real or simulator): scrolling doesn't make the canvas jump as the URL bar appears/disappears.

- [ ] **Step 5: Commit**

```bash
git add app/layout.js app/globals.css app/components/InteractiveTree.jsx
git commit -m "feat: 100dvh + viewport-fit cover + no overscroll"
```

---

## Task 8: Safe-area-aware caption

**Files:**
- Modify: `app/components/InteractiveTree.jsx`

- [ ] **Step 1: Replace caption styles**

In the JSX at the bottom of the component, find the caption `<div>`:

```jsx
<div
  style={{
    position: 'absolute',
    top: 28,
    left: 32,
    color: '#d4a574',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontStyle: 'italic',
    fontSize: 15,
    letterSpacing: 0.5,
    pointerEvents: 'none',
    textShadow: '0 0 12px rgba(0,0,0,0.8)',
    mixBlendMode: 'difference',
  }}
>
  a small world · move your cursor to see the depth
</div>
```

Replace with:

```jsx
<div
  style={{
    position: 'absolute',
    top: 'max(20px, calc(env(safe-area-inset-top) + 8px))',
    left: 'max(20px, calc(env(safe-area-inset-left) + 8px))',
    right: 'max(20px, calc(env(safe-area-inset-right) + 8px))',
    color: '#d4a574',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontStyle: 'italic',
    fontSize: 'clamp(11px, 2.6vw, 15px)',
    lineHeight: 1.35,
    maxWidth: 'min(70ch, 100%)',
    letterSpacing: 0.5,
    pointerEvents: 'none',
    textShadow: '0 0 12px rgba(0,0,0,0.8)',
    mixBlendMode: 'difference',
  }}
>
  a small world · move your cursor to see the depth
</div>
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`.

- Desktop wide: caption appears in the upper-left, font ~15px, doesn't span the full width.
- DevTools iPhone 14 Pro (notch): caption clears the notch on the left, doesn't get clipped on the right.
- Resize narrow (~320px wide): caption font shrinks to ~11px, wraps to two lines if needed.

- [ ] **Step 3: Commit**

```bash
git add app/components/InteractiveTree.jsx
git commit -m "feat: caption respects safe-area insets and scales with viewport"
```

---

## Task 9: Final sweep

**Files:** none (verification only)

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: PASS — all qualityProfile tests still green.

- [ ] **Step 2: Production build smoke test**

Run: `npm run build`

Expected: build succeeds with no errors.

- [ ] **Step 3: Viewport sweep on dev server**

Run: `npm run dev`. In Chrome DevTools device toolbar, cycle through: 320×568, 375×667, 414×896, 768×1024, 1280×800, 1920×1080. For each:
- Tree grows and looks proportional.
- Bend (drag for touch sizes, hover for desktop) feels right at that size.
- Framerate stable in Performance Monitor (≥50 fps).

- [ ] **Step 4: Touch + reduce-motion smoke**

- DevTools touch mode (any size): drag-to-bend works, no phantom bend on release.
- Toggle Reduce Motion via DevTools rendering panel: birds stop spawning within seconds; cycles slow.

- [ ] **Step 5: Final commit (only if anything moved)**

If steps 1–4 surfaced any tweaks, commit them. Otherwise, no commit needed.

```bash
git status                # check for unstaged tweaks
git diff                  # review
# if changes:
git add -p
git commit -m "fix: <whatever surfaced>"
```

---

## Self-Review Notes

Spec coverage check (each spec section → task):
- Architecture / qualityProfile signature → Task 2
- Quality tiers table → Task 2 (test) + Task 3 (wiring)
- Pixel-distance constants relative → Task 4
- Touch interaction (drag-to-bend) → Task 5
- Reduced motion (calm mode) → Task 6
- Viewport meta + globals.css + 100dvh → Task 7
- Caption safe-area → Task 8
- Testing plan → Task 9

No placeholders, no "similar to Task N" handwaving, no "add validation" filler. Every code step has the actual code. Type consistency check: `qualityProfile` returns the same field names everywhere they're read (`treeMaxDepth`, `bendRadius`, `motionScale`, `birdsEnabled`, etc.). `pointerRef.current.buttonsDown` is added in Task 5 step 1 and used in step 2.
