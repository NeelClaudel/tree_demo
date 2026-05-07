'use client';

import { useEffect, useRef } from 'react';

// ============================================================================
// CONFIG — tweak freely
// ============================================================================
const BEND_RADIUS = 160;
const DETACH_RADIUS = 55;
const RESPAWN_MIN = 3.0;
const RESPAWN_MAX = 8.0;
const GROW_DURATION = 1.4;

const SEASON_PERIOD = 90;
const DAY_PERIOD = 60;

const FIREFLY_COUNT = 28;
const STAR_COUNT = 160;
const PILE_FADE_MIN = 8;
const PILE_FADE_MAX = 18;

const BRANCH_PHASE = 0.22;
const BRANCH_PHASE_JITTER = 0.30;
const LEAF_BLOOM_DELAY_MIN = 0.10;
const LEAF_BLOOM_DELAY_MAX = 0.60;

// Birds
const BIRD_INTERVAL_MIN = 20;     // seconds between flocks
const BIRD_INTERVAL_MAX = 50;
const BIRD_SPOOK_RADIUS = 70;
const BIRD_SPOOK_CHANCE = 0.05;   // per leaf per frame inside radius

// Parallax background layers — farthest first
const BG_LAYERS_CONFIG = [
  { count: 6, depth: 4, scaleMin: 0.28, scaleMax: 0.42, blur: 4.5, alpha: 0.45, parallax: 0.04, leafLightDelta: -38, leafSatDelta: -25 },
  { count: 4, depth: 5, scaleMin: 0.45, scaleMax: 0.60, blur: 2.0, alpha: 0.62, parallax: 0.11, leafLightDelta: -22, leafSatDelta: -15 },
];

// ============================================================================
// SEASONS
// ============================================================================
const SEASON_STOPS = [
  { p: 0.00, hue: 110, sat: 60, light: 48 },
  { p: 0.25, hue: 95,  sat: 70, light: 38 },
  { p: 0.50, hue: 25,  sat: 80, light: 50 },
  { p: 0.75, hue: 30,  sat: 30, light: 32 },
  { p: 1.00, hue: 110, sat: 60, light: 48 },
];

const lerp = (a, b, t) => a + (b - a) * t;

// Foliage density across the year — smooth fade through autumn, zero in winter, regrowth by spring
const FOLIAGE_STOPS = [
  { p: 0.00, v: 1.0 }, // spring full
  { p: 0.42, v: 1.0 }, // still full through summer
  { p: 0.62, v: 0.0 }, // bare by end of autumn
  { p: 0.88, v: 0.0 }, // dormant through winter
  { p: 1.00, v: 1.0 }, // back to full by spring
];

function foliageAt(phase) {
  for (let i = 0; i < FOLIAGE_STOPS.length - 1; i++) {
    const a = FOLIAGE_STOPS[i], b = FOLIAGE_STOPS[i + 1];
    if (phase >= a.p && phase < b.p) {
      return lerp(a.v, b.v, (phase - a.p) / (b.p - a.p));
    }
  }
  return 1.0;
}

function seasonAt(phase) {
  for (let i = 0; i < SEASON_STOPS.length - 1; i++) {
    const a = SEASON_STOPS[i], b = SEASON_STOPS[i + 1];
    if (phase >= a.p && phase < b.p) {
      const local = (phase - a.p) / (b.p - a.p);
      return {
        hue: lerp(a.hue, b.hue, local),
        sat: lerp(a.sat, b.sat, local),
        light: lerp(a.light, b.light, local),
        autumnShed: phase > 0.4 && phase < 0.6 ? Math.sin((phase - 0.4) / 0.2 * Math.PI) : 0,
        winterMode: phase > 0.6 && phase < 0.85,
        springBoost: phase > 0.85 || phase < 0.15,
        foliage: foliageAt(phase),
      };
    }
  }
  return SEASON_STOPS[0];
}

// ============================================================================
// DAY / NIGHT
// ============================================================================
const DAY_STOPS = [
  { p: 0.00, top: [60, 45, 35],   bot: [110, 75, 55],   isDay: 0.45 },
  { p: 0.15, top: [70, 75, 90],   bot: [150, 125, 100], isDay: 1.00 },
  { p: 0.32, top: [80, 85, 100],  bot: [165, 135, 110], isDay: 1.00 },
  { p: 0.42, top: [100, 65, 80],  bot: [185, 110, 65],  isDay: 0.65 },
  { p: 0.50, top: [80, 35, 65],   bot: [180, 75, 45],   isDay: 0.40 },
  { p: 0.60, top: [25, 22, 50],   bot: [55, 28, 45],    isDay: 0.10 },
  { p: 0.72, top: [10, 12, 28],   bot: [18, 16, 32],    isDay: 0.00 },
  { p: 0.82, top: [8, 10, 24],    bot: [14, 14, 28],    isDay: 0.00 },
  { p: 0.93, top: [40, 30, 55],   bot: [85, 55, 65],    isDay: 0.30 },
  { p: 1.00, top: [60, 45, 35],   bot: [110, 75, 55],   isDay: 0.45 },
];

function dayAt(phase) {
  for (let i = 0; i < DAY_STOPS.length - 1; i++) {
    const a = DAY_STOPS[i], b = DAY_STOPS[i + 1];
    if (phase >= a.p && phase < b.p) {
      const local = (phase - a.p) / (b.p - a.p);
      return {
        top: [
          Math.round(lerp(a.top[0], b.top[0], local)),
          Math.round(lerp(a.top[1], b.top[1], local)),
          Math.round(lerp(a.top[2], b.top[2], local)),
        ],
        bot: [
          Math.round(lerp(a.bot[0], b.bot[0], local)),
          Math.round(lerp(a.bot[1], b.bot[1], local)),
          Math.round(lerp(a.bot[2], b.bot[2], local)),
        ],
        isDay: lerp(a.isDay, b.isDay, local),
      };
    }
  }
  return DAY_STOPS[0];
}

const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

// ============================================================================
// BACKGROUND TREE GENERATION (no per-frame state, just data)
// ============================================================================
function generateBgTreeData(baseX, baseY, scale, maxDepth) {
  const branches = [];
  const leafClusters = [];
  const initLength = (95 + Math.random() * 25) * scale;
  const initThick = (7 + Math.random() * 2) * scale;

  function grow(x, y, angle, length, thick, depth) {
    const ex = x + Math.cos(angle) * length;
    const ey = y + Math.sin(angle) * length;
    branches.push({ x1: x, y1: y, x2: ex, y2: ey, thick });

    if (depth >= maxDepth || length < 5 * scale) {
      // 1-3 soft leaf blobs at tip
      const blobs = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < blobs; i++) {
        leafClusters.push({
          x: ex + (Math.random() - 0.5) * 10 * scale,
          y: ey + (Math.random() - 0.5) * 10 * scale,
          r: (5 + Math.random() * 6) * scale,
        });
      }
      return;
    }

    const branchCount = 2 + (Math.random() < 0.32 ? 1 : 0);
    const spread = 0.55 + Math.random() * 0.25;
    for (let i = 0; i < branchCount; i++) {
      const offset = (i - (branchCount - 1) / 2) * spread;
      const newAngle = angle + offset + (Math.random() - 0.5) * 0.25;
      const newLen = length * (0.72 + Math.random() * 0.13);
      grow(ex, ey, newAngle, newLen, thick * 0.72, depth + 1);
    }
  }

  grow(baseX, baseY, -Math.PI / 2, initLength, initThick, 0);
  return { branches, leafClusters };
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function InteractiveTree() {
  const canvasRef = useRef(null);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });
  const stateRef = useRef({
    branches: [],
    leaves: [],
    falling: [],
    pile: [],
    fireflies: [],
    embers: [],
    stars: [],
    birds: [],
    nextBirdAt: 18 + Math.random() * 12,
    bgLayers: [],
    tempCanvas: null,
    width: 0,
    height: 0,
    maxDepth: 7,
    baseX: 0,
    baseY: 0,
    wind: { value: 0, gustUntil: 0, gustDuration: 0, gustStrength: 0 },
    prevWinter: false,
    saplingFinishTime: 0,
    shakeStartTime: -999,
    shakeRequested: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // ------------------------------------------------------------------------
    // MAIN TREE GENERATION
    // ------------------------------------------------------------------------
    const buildTree = () => {
      const s = stateRef.current;
      s.branches = [];
      s.leaves = [];
      s.falling = [];
      s.pile = [];
      s.embers = [];
      let maxFinishTime = 0;

      const baseX = s.width / 2;
      const baseY = s.height - 10;
      const initialLength = Math.min(s.height * 0.18, 130);
      s.baseX = baseX;
      s.baseY = baseY;

      const grow = (parentIdx, x, y, angle, length, thickness, depth, parentFinishTime) => {
        const endX = x + Math.cos(angle) * length;
        const endY = y + Math.sin(angle) * length;
        const myDuration = BRANCH_PHASE * (1 - BRANCH_PHASE_JITTER + Math.random() * 2 * BRANCH_PHASE_JITTER);
        const mySpawnTime = parentFinishTime;
        const myFinishTime = mySpawnTime + myDuration;
        if (myFinishTime > maxFinishTime) maxFinishTime = myFinishTime;

        s.branches.push({
          parentIdx,
          baseAngle: angle,
          length,
          thickness,
          depth,
          swayPhase: Math.random() * Math.PI * 2,
          x1: x, y1: y, x2: endX, y2: endY,
          currentAngle: angle,
          spawnTime: mySpawnTime,
          growDuration: myDuration,
          growVisible: 0,
        });
        const myIdx = s.branches.length - 1;

        if (depth >= s.maxDepth || length < 6) {
          const leafCount = 4 + Math.floor(Math.random() * 4);
          for (let i = 0; i < leafCount; i++) {
            const ox = (Math.random() - 0.5) * 18;
            const oy = (Math.random() - 0.5) * 18;
            s.leaves.push({
              branchIdx: myIdx,
              ox, oy,
              baseX: endX + ox,
              baseY: endY + oy,
              x: endX + ox,
              y: endY + oy,
              size: 2.5 + Math.random() * 2.5,
              attached: true,
              landed: false,
              phase: Math.random() * Math.PI * 2,
              hueOffset: (Math.random() - 0.5) * 22,
              satOffset: (Math.random() - 0.5) * 15,
              lightOffset: (Math.random() - 0.5) * 12,
              respawnAt: myFinishTime + LEAF_BLOOM_DELAY_MIN + Math.random() * (LEAF_BLOOM_DELAY_MAX - LEAF_BLOOM_DELAY_MIN),
              growProgress: 0,
              alpha: 1,
              rot: 0,
              rotSpeed: 0,
              vx: 0, vy: 0,
              landedAt: 0,
              fadeDuration: 0,
            });
          }
          return;
        }

        const branchCount = 2 + (Math.random() < 0.35 ? 1 : 0);
        const spread = 0.55 + Math.random() * 0.25;
        for (let i = 0; i < branchCount; i++) {
          const offset = (i - (branchCount - 1) / 2) * spread;
          const newAngle = angle + offset + (Math.random() - 0.5) * 0.25;
          const newLen = length * (0.72 + Math.random() * 0.13);
          grow(myIdx, endX, endY, newAngle, newLen, thickness * 0.72, depth + 1, myFinishTime);
        }
      };

      grow(null, baseX, baseY, -Math.PI / 2, initialLength, 9, 0, 0);
      s.saplingFinishTime = maxFinishTime;
    };

    // ------------------------------------------------------------------------
    // BACKGROUND LAYERS — data only, rendered fresh each frame for smooth
    // color transitions across seasons
    // ------------------------------------------------------------------------
    const buildBgLayers = () => {
      const s = stateRef.current;
      s.bgLayers = [];
      for (const cfg of BG_LAYERS_CONFIG) {
        const trees = [];
        for (let i = 0; i < cfg.count; i++) {
          const slot = (i + 0.5) / cfg.count;
          const jitter = (Math.random() - 0.5) * (1 / cfg.count) * 0.6;
          // extend slightly past canvas edges so parallax shifts don't reveal gaps
          const x = lerp(-0.08, 1.08, slot + jitter) * s.width;
          const y = s.height - 4 + Math.random() * 6;
          const scale = lerp(cfg.scaleMin, cfg.scaleMax, Math.random());
          trees.push(generateBgTreeData(x, y, scale, cfg.depth));
        }
        s.bgLayers.push({
          trees,
          blur: cfg.blur,
          alpha: cfg.alpha,
          parallax: cfg.parallax,
          leafLightDelta: cfg.leafLightDelta,
          leafSatDelta: cfg.leafSatDelta,
        });
      }
      // shared temp canvas reused per layer per frame
      if (!s.tempCanvas) s.tempCanvas = document.createElement('canvas');
      s.tempCanvas.width = s.width;
      s.tempCanvas.height = s.height;
    };

    // ------------------------------------------------------------------------
    // FIREFLIES + STARS
    // ------------------------------------------------------------------------
    const seedFireflies = () => {
      const s = stateRef.current;
      s.fireflies = [];
      for (let i = 0; i < FIREFLY_COUNT; i++) {
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
      for (let i = 0; i < STAR_COUNT; i++) {
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

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const s = stateRef.current;
      s.width = canvas.offsetWidth;
      s.height = canvas.offsetHeight;
      canvas.width = s.width * dpr;
      canvas.height = s.height * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      buildTree();
      buildBgLayers();
      seedFireflies();
      seedStars();
    };

    resize();
    window.addEventListener('resize', resize);

    // ------------------------------------------------------------------------
    // POINTER
    // ------------------------------------------------------------------------
    const updatePointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current.x = e.clientX - rect.left;
      pointerRef.current.y = e.clientY - rect.top;
      pointerRef.current.active = true;
    };
    const onPointerMove = (e) => updatePointer(e);
    const onPointerLeave = () => {
      pointerRef.current.active = false;
      pointerRef.current.x = -9999;
      pointerRef.current.y = -9999;
    };
    const onPointerDown = (e) => {
      updatePointer(e);
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
      // trigger visible branch shake
      s.shakeRequested = true;
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.style.touchAction = 'none';

    const recycleLeafToRespawn = (leaf, t, fastSpring) => {
      leaf.attached = true;
      leaf.landed = false;
      leaf.alpha = 1;
      leaf.respawnAt = fastSpring
        ? t + 0.5 + Math.random() * 1.5
        : t + RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN);
      leaf.growProgress = 0;
      leaf.rot = 0;
      leaf.rotSpeed = 0;
      leaf.vx = 0;
      leaf.vy = 0;
    };

    // ------------------------------------------------------------------------
    // BIRDS
    // ------------------------------------------------------------------------
    const spawnBirdFlock = () => {
      const s = stateRef.current;
      const flockSize = 1 + Math.floor(Math.random() * 3); // 1-3
      const fromLeft = Math.random() < 0.5;
      const baseY = s.height * (0.08 + Math.random() * 0.32);
      const baseSpeed = 2.0 + Math.random() * 1.4;
      const xStart = fromLeft ? -60 : s.width + 60;
      const dir = fromLeft ? 1 : -1;

      for (let i = 0; i < flockSize; i++) {
        s.birds.push({
          x: xStart - dir * i * (32 + Math.random() * 22),
          y: baseY + (Math.random() - 0.5) * 30,
          vx: dir * (baseSpeed + (Math.random() - 0.5) * 0.4),
          flapPhase: Math.random() * Math.PI * 2,
          flapSpeed: 0.18 + Math.random() * 0.08,
          size: 7 + Math.random() * 4,
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
    };

    const drawBird = (ctx, bird, isDay) => {
      const flap = Math.sin(bird.flapPhase);
      const sz = bird.size;
      ctx.save();
      ctx.translate(bird.x, bird.y);
      // slightly brighter at night so they stay visible against dark sky
      const a = 0.85 + (1 - isDay) * 0.10;
      ctx.strokeStyle = `rgba(12, 10, 8, ${a})`;
      ctx.lineWidth = sz * 0.18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const peakY = -sz * 0.45 - flap * sz * 0.4;
      const tipY = -flap * sz * 0.15;

      // M-shape silhouette: two bezier curves meeting at body
      ctx.beginPath();
      ctx.moveTo(-sz, tipY);
      ctx.quadraticCurveTo(-sz * 0.35, peakY, 0, 0);
      ctx.quadraticCurveTo(sz * 0.35, peakY, sz, tipY);
      ctx.stroke();

      ctx.restore();
    };

    // ------------------------------------------------------------------------
    // MAIN LOOP
    // ------------------------------------------------------------------------
    let t = 0;
    let raf;

    const loop = () => {
      t += 0.016;
      const s = stateRef.current;
      const m = pointerRef.current;
      const isSapling = t < s.saplingFinishTime + 0.3;

      // ===== WIND =====
      const windDamp = isSapling ? 0 : 1;
      const baseWind = (Math.sin(t * 0.3) * 0.15 + Math.sin(t * 0.7) * 0.08) * windDamp;
      if (!isSapling && t > s.wind.gustUntil && Math.random() < 0.005) {
        s.wind.gustDuration = 1.2 + Math.random() * 2.0;
        s.wind.gustUntil = t + s.wind.gustDuration;
        s.wind.gustStrength = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6);
      }
      let gust = 0;
      if (t < s.wind.gustUntil) {
        const remaining = s.wind.gustUntil - t;
        const progress = 1 - remaining / s.wind.gustDuration;
        gust = s.wind.gustStrength * Math.sin(progress * Math.PI);
      }
      const wind = baseWind + gust;
      s.wind.value = wind;

      // ===== SEASONS =====
      const seasonPhase = (t / SEASON_PERIOD) % 1;
      const season = seasonAt(seasonPhase);
      if (s.prevWinter && !season.winterMode && season.springBoost) {
        for (const leaf of s.leaves) {
          if (leaf.attached && leaf.respawnAt !== null && leaf.respawnAt > t + 2) {
            leaf.respawnAt = t + Math.random() * 2;
          }
        }
      }
      s.prevWinter = season.winterMode;

      // ===== DAY / NIGHT =====
      const dayPhase = (t / DAY_PERIOD) % 1;
      const day = dayAt(dayPhase);
      const isDay = day.isDay;
      const nightFactor = 1 - isDay;

      // ===== SHAKE (decays exponentially after click) =====
      if (s.shakeRequested) {
        s.shakeStartTime = t;
        s.shakeRequested = false;
      }
      const shakeAge = t - s.shakeStartTime;
      const shakeDecay = shakeAge < 2 ? Math.exp(-shakeAge * 3.5) : 0;

      // ===== BRANCHES UPDATE =====
      for (let i = 0; i < s.branches.length; i++) {
        const b = s.branches[i];
        if (b.parentIdx === null) {
          b.x1 = s.baseX; b.y1 = s.baseY;
        } else {
          const p = s.branches[b.parentIdx];
          b.x1 = p.x2; b.y1 = p.y2;
        }

        let angle = b.baseAngle;
        const swayAmp = 0.005 + b.depth * 0.004;
        angle += Math.sin(t * 1.4 + b.swayPhase) * swayAmp * windDamp;
        angle += wind * 0.025 * (b.depth + 1) * 0.4;

        // shake: damped oscillation, thinner branches whip more
        if (shakeDecay > 0.005) {
          const freq = 16 + b.depth * 1.6;
          const oscil = Math.sin(shakeAge * freq + b.swayPhase * 2.5);
          const amp = 0.008 + b.depth * 0.012;
          angle += shakeDecay * oscil * amp;
        }

        if (m.active && !isSapling) {
          const tipX = b.x1 + Math.cos(angle) * b.length;
          const tipY = b.y1 + Math.sin(angle) * b.length;
          const midX = (b.x1 + tipX) * 0.5;
          const midY = (b.y1 + tipY) * 0.5;
          const dx = midX - m.x;
          const dy = midY - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < BEND_RADIUS) {
            const bdx = Math.cos(angle);
            const bdy = Math.sin(angle);
            const perp = bdx * dy - bdy * dx;
            const norm = perp / Math.max(dist, 0.001);
            const force = 1 - dist / BEND_RADIUS;
            const flex = 0.06 + b.depth * 0.05;
            angle += norm * force * flex;
          }
        }

        b.currentAngle = angle;
        b.x2 = b.x1 + Math.cos(angle) * b.length;
        b.y2 = b.y1 + Math.sin(angle) * b.length;

        const sproutAge = t - b.spawnTime;
        b.growVisible = Math.max(0, Math.min(1, sproutAge / b.growDuration));
      }

      // ===== BACKGROUND SKY =====
      const bg = ctx.createLinearGradient(0, 0, 0, s.height);
      bg.addColorStop(0, `rgb(${day.top[0]}, ${day.top[1]}, ${day.top[2]})`);
      bg.addColorStop(1, `rgb(${day.bot[0]}, ${day.bot[1]}, ${day.bot[2]})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, s.width, s.height);

      // ===== STARS =====
      if (nightFactor > 0.05) {
        for (const star of s.stars) {
          const twinkle = 0.5 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinklePhase);
          const a = star.brightness * twinkle * nightFactor;
          if (a < 0.02) continue;
          if (star.size > 1.2) {
            const haloR = star.size * 4;
            const grad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloR);
            grad.addColorStop(0, `hsla(${star.hue}, 80%, 90%, ${a * 0.4})`);
            grad.addColorStop(1, `hsla(${star.hue}, 80%, 90%, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(star.x - haloR, star.y - haloR, haloR * 2, haloR * 2);
          }
          ctx.fillStyle = `hsla(${star.hue}, 70%, 92%, ${a})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ===== MOON =====
      if (nightFactor > 0.05) {
        const moonStart = 0.5;
        const moonEnd = 1.0;
        if (dayPhase >= moonStart && dayPhase <= moonEnd) {
          const mp = (dayPhase - moonStart) / (moonEnd - moonStart);
          const moonR = 28;
          // edge-to-edge horizontal: starts at left edge, ends at right edge
          const moonX = lerp(0, s.width, mp);
          // gentle arc: low at edges, high at zenith
          const moonY = (0.62 - 0.50 * Math.sin(mp * Math.PI)) * s.height;
          const moonAlpha = nightFactor;

          // outer halo
          const halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.7, moonX, moonY, moonR * 6);
          halo.addColorStop(0, `rgba(245, 235, 205, ${0.16 * moonAlpha})`);
          halo.addColorStop(0.5, `rgba(245, 235, 205, ${0.05 * moonAlpha})`);
          halo.addColorStop(1, 'rgba(245, 235, 205, 0)');
          ctx.fillStyle = halo;
          ctx.fillRect(moonX - moonR * 6, moonY - moonR * 6, moonR * 12, moonR * 12);

          // disc
          ctx.fillStyle = `rgba(248, 242, 220, ${0.95 * moonAlpha})`;
          ctx.beginPath();
          ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
          ctx.fill();

          // subtle craters, clipped to disc
          ctx.save();
          ctx.beginPath();
          ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = `rgba(195, 185, 158, ${0.42 * moonAlpha})`;
          const craters = [
            { dx: -0.32, dy: -0.18, r: 0.20 },
            { dx: 0.22,  dy: 0.24,  r: 0.16 },
            { dx: 0.32,  dy: -0.30, r: 0.10 },
            { dx: -0.20, dy: 0.32,  r: 0.13 },
          ];
          for (const c of craters) {
            ctx.beginPath();
            ctx.arc(moonX + c.dx * moonR, moonY + c.dy * moonR, c.r * moonR, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // ===== BACKGROUND TREES — rendered fresh each frame, fixed position =====
      const bgAmbient = 0.65 + 0.35 * isDay;
      const tc = s.tempCanvas;
      const tctx = tc.getContext('2d');

      for (const layer of s.bgLayers) {
        // 1) sharp render to shared temp canvas
        tctx.clearRect(0, 0, s.width, s.height);
        tctx.lineCap = 'round';
        tctx.strokeStyle = 'hsl(22, 30%, 7%)';
        for (const tree of layer.trees) {
          for (const b of tree.branches) {
            tctx.lineWidth = b.thick;
            tctx.beginPath();
            tctx.moveTo(b.x1, b.y1);
            tctx.lineTo(b.x2, b.y2);
            tctx.stroke();
          }
        }
        if (season.foliage > 0.01) {
          const leafL = Math.max(6, season.light + layer.leafLightDelta);
          const leafS = Math.max(15, season.sat + layer.leafSatDelta);
          tctx.fillStyle = `hsl(${season.hue}, ${leafS}%, ${leafL}%)`;
          tctx.globalAlpha = season.foliage;
          for (const tree of layer.trees) {
            for (const c of tree.leafClusters) {
              tctx.beginPath();
              tctx.arc(c.x, c.y, c.r * (0.6 + 0.4 * season.foliage), 0, Math.PI * 2);
              tctx.fill();
            }
          }
          tctx.globalAlpha = 1;
        }

        // 2) composite to main with single blur pass + ambient alpha (no parallax shift)
        ctx.save();
        ctx.filter = `blur(${layer.blur}px)`;
        ctx.globalAlpha = layer.alpha * bgAmbient;
        ctx.drawImage(tc, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // ===== BIRDS — spawn, fly, spook leaves, draw =====
      if (!isSapling && t > s.nextBirdAt) {
        spawnBirdFlock();
        s.nextBirdAt = t + BIRD_INTERVAL_MIN + Math.random() * (BIRD_INTERVAL_MAX - BIRD_INTERVAL_MIN);
      }
      s.birds = s.birds.filter((bird) => {
        bird.flapPhase += bird.flapSpeed;
        bird.x += bird.vx;
        bird.y += Math.sin(bird.flapPhase * 0.5 + bird.bobPhase) * 0.35;

        // spook leaves in radius
        for (const leaf of s.leaves) {
          if (!leaf.attached || leaf.respawnAt !== null || leaf.growProgress < 0.85) continue;
          const dx = leaf.x - bird.x;
          const dy = leaf.y - bird.y;
          const dist = Math.hypot(dx, dy);
          if (dist < BIRD_SPOOK_RADIUS && Math.random() < BIRD_SPOOK_CHANCE) {
            leaf.attached = false;
            const inv = dist < 1 ? 1 : 1 / dist;
            leaf.vx = dx * inv * 1.5 + bird.vx * 0.35;
            leaf.vy = -0.3 - Math.random() * 0.6;
            leaf.rot = Math.random() * Math.PI * 2;
            leaf.rotSpeed = (Math.random() - 0.5) * 0.18;
            s.falling.push(leaf);
          }
        }
        return bird.x > -120 && bird.x < s.width + 120;
      });
      for (const bird of s.birds) drawBird(ctx, bird, isDay);

      // ===== FIREFLIES =====
      const fireflyAlpha = Math.max(0, nightFactor * 1.3 - 0.1);
      if (fireflyAlpha > 0.05) {
        for (const f of s.fireflies) {
          f.vx += (Math.random() - 0.5) * 0.04 + wind * 0.02;
          f.vy += (Math.random() - 0.5) * 0.04;
          f.vx *= 0.94;
          f.vy *= 0.94;
          f.x += f.vx;
          f.y += f.vy;
          if (f.x < -10) f.x = s.width + 10;
          if (f.x > s.width + 10) f.x = -10;
          if (f.y < 0) f.y = s.height * 0.85;
          if (f.y > s.height) f.y = 0;

          const pulse = 0.4 + 0.6 * Math.sin(t * f.speed + f.phase);
          const glowR = 10 + pulse * 8;
          const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, glowR);
          grad.addColorStop(0, `hsla(${f.hue}, 95%, 75%, ${0.5 * pulse * fireflyAlpha})`);
          grad.addColorStop(1, `hsla(${f.hue}, 95%, 75%, 0)`);
          ctx.fillStyle = grad;
          ctx.fillRect(f.x - glowR, f.y - glowR, glowR * 2, glowR * 2);
          ctx.fillStyle = `hsla(${f.hue}, 100%, 92%, ${pulse * fireflyAlpha})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (const f of s.fireflies) {
          f.vx *= 0.94; f.vy *= 0.94;
          f.x += f.vx; f.y += f.vy;
        }
      }

      // ===== CURSOR GLOW =====
      if (m.active) {
        const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 200);
        const glowAlpha = 0.08 + nightFactor * 0.10;
        glow.addColorStop(0, `rgba(255, 170, 80, ${glowAlpha})`);
        glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, s.width, s.height);
      }

      // ===== MAIN BRANCHES =====
      ctx.lineCap = 'round';
      const branchL = 8 + isDay * 8;
      ctx.strokeStyle = `hsl(28, 28%, ${branchL}%)`;
      for (const b of s.branches) {
        if (b.growVisible <= 0) continue;
        const eased = easeOutCubic(b.growVisible);
        const dx = Math.cos(b.currentAngle) * b.length * eased;
        const dy = Math.sin(b.currentAngle) * b.length * eased;
        ctx.lineWidth = b.thickness * (0.35 + eased * 0.65);
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x1 + dx, b.y1 + dy);
        ctx.stroke();
      }

      // ===== ATTACHED LEAVES =====
      for (const leaf of s.leaves) {
        if (!leaf.attached) continue;

        if (leaf.respawnAt !== null) {
          if (season.winterMode) continue;
          if (t >= leaf.respawnAt) {
            leaf.respawnAt = null;
            leaf.growProgress = 0;
          } else {
            continue;
          }
        }

        if (leaf.growProgress < 1) {
          const speed = season.springBoost ? 1.6 : 1.0;
          leaf.growProgress = Math.min(1, leaf.growProgress + (0.016 / GROW_DURATION) * speed);
        }

        const b = s.branches[leaf.branchIdx];
        const dAng = b.currentAngle - b.baseAngle;
        const c = Math.cos(dAng), si = Math.sin(dAng);
        const rx = leaf.ox * c - leaf.oy * si;
        const ry = leaf.ox * si + leaf.oy * c;
        leaf.baseX = b.x2 + rx;
        leaf.baseY = b.y2 + ry;

        leaf.x = leaf.baseX + Math.sin(t * 1.2 + leaf.phase) * 1.8 * windDamp + wind * 1.2;
        leaf.y = leaf.baseY + Math.cos(t * 0.9 + leaf.phase) * 1.4 * windDamp;

        if (m.active && !isSapling && leaf.growProgress > 0.5) {
          const dx = leaf.x - m.x;
          const dy = leaf.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist < DETACH_RADIUS) {
            leaf.attached = false;
            const inv = dist < 0.001 ? 1 : 1 / dist;
            leaf.vx = dx * inv * 1.8 + (Math.random() - 0.5) * 0.8;
            leaf.vy = -0.4 + Math.random() * 0.6;
            leaf.rot = Math.random() * Math.PI * 2;
            leaf.rotSpeed = (Math.random() - 0.5) * 0.12;
            s.falling.push(leaf);
            continue;
          }
        }

        if (!isSapling && Math.abs(gust) > 0.5 && leaf.growProgress > 0.8) {
          if (Math.random() < Math.abs(gust) * 0.0015) {
            leaf.attached = false;
            leaf.vx = gust * 3 + (Math.random() - 0.5) * 1;
            leaf.vy = -0.3 - Math.random() * 0.5;
            leaf.rot = Math.random() * Math.PI * 2;
            leaf.rotSpeed = (Math.random() - 0.5) * 0.15;
            s.falling.push(leaf);
            continue;
          }
        }

        if (!isSapling && season.autumnShed > 0 && leaf.growProgress > 0.9) {
          if (Math.random() < season.autumnShed * 0.0008) {
            leaf.attached = false;
            leaf.vx = (Math.random() - 0.5) * 0.6 + wind * 0.5;
            leaf.vy = 0.2 + Math.random() * 0.3;
            leaf.rot = Math.random() * Math.PI * 2;
            leaf.rotSpeed = (Math.random() - 0.5) * 0.08;
            s.falling.push(leaf);
          }
        }
      }

      // ===== FALLING PHYSICS =====
      const groundY = s.height - 4;
      s.falling = s.falling.filter((leaf) => {
        leaf.vy += 0.035;
        leaf.vx += Math.sin(t * 2.5 + leaf.phase) * 0.06 + wind * 0.06;
        leaf.vx *= 0.985;
        leaf.x += leaf.vx;
        leaf.y += leaf.vy;
        leaf.rot += leaf.rotSpeed;

        if (leaf.y >= groundY) {
          leaf.y = groundY - Math.random() * 3;
          leaf.vx = 0; leaf.vy = 0; leaf.rotSpeed = 0;
          leaf.landed = true;
          leaf.landedAt = t;
          leaf.fadeDuration = PILE_FADE_MIN + Math.random() * (PILE_FADE_MAX - PILE_FADE_MIN);
          leaf.alpha = 1;
          s.pile.push(leaf);
          return false;
        }
        if (leaf.x < -30 || leaf.x > s.width + 30) {
          recycleLeafToRespawn(leaf, t, season.springBoost);
          return false;
        }
        return true;
      });

      // ===== PILE =====
      s.pile = s.pile.filter((leaf) => {
        const age = t - leaf.landedAt;
        leaf.x += wind * 0.15;
        const fadeStart = leaf.fadeDuration - 3;
        if (age > fadeStart) {
          leaf.alpha = Math.max(0, 1 - (age - fadeStart) / 3);
        }
        if (age >= leaf.fadeDuration) {
          recycleLeafToRespawn(leaf, t, season.springBoost);
          return false;
        }
        return true;
      });

      // ===== DRAW LEAVES =====
      const ambientLight = 0.45 + 0.55 * isDay;
      const ambientSat = 0.65 + 0.35 * isDay;

      const drawLeaf = (leaf, scale, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(leaf.x, leaf.y);
        if (leaf.rot) ctx.rotate(leaf.rot);
        const h = season.hue + leaf.hueOffset;
        const sa = Math.max(0, Math.min(100, (season.sat + leaf.satOffset) * ambientSat));
        const li = Math.max(0, Math.min(100, (season.light + leaf.lightOffset) * ambientLight));
        ctx.fillStyle = `hsl(${h}, ${sa}%, ${li}%)`;
        const sz = leaf.size * scale;
        ctx.beginPath();
        ctx.ellipse(0, 0, sz, sz * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      for (const leaf of s.leaves) {
        if (!leaf.attached || leaf.respawnAt !== null) continue;
        drawLeaf(leaf, easeOutCubic(leaf.growProgress), 1);
      }
      for (const leaf of s.falling) drawLeaf(leaf, 1, 1);
      for (const leaf of s.pile) drawLeaf(leaf, 1, leaf.alpha);

      // ===== EMBERS =====
      if (m.active && Math.random() < 0.7) {
        s.embers.push({
          x: m.x + (Math.random() - 0.5) * 6,
          y: m.y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.3 - Math.random() * 0.5,
          life: 1,
          size: 1 + Math.random() * 1.5,
          hue: 25 + Math.random() * 25,
        });
      }
      s.embers = s.embers.filter((e) => {
        e.life -= 0.018;
        e.vy -= 0.005;
        e.vx += (Math.random() - 0.5) * 0.05 + wind * 0.05;
        e.x += e.vx;
        e.y += e.vy;
        return e.life > 0;
      });
      for (const e of s.embers) {
        ctx.fillStyle = `hsla(${e.hue}, 100%, 65%, ${e.life})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * e.life, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#060403', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
      />
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
    </div>
  );
}