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
      const p = qualityProfile({ width: 1440, height: 1440, dpr: 2, reducedMotion: false });
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
