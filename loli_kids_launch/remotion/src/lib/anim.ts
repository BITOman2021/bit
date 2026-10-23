// Deterministic easing + reusable animation presets. All functions are pure
// functions of time (seconds) so every frame renders identically.
import {spring} from 'remotion';
import {FPS} from '../data/storyboard';

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (x: number) => {
  const c = clamp(x);
  return c * c * (3 - 2 * c);
};
export const easeInOut = (x: number) => {
  const c = clamp(x);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
export const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;
export const backOut = (x: number) => {
  const c = clamp(x);
  const k = 1.70158;
  return 1 + (k + 1) * (c - 1) ** 3 + k * (c - 1) ** 2;
};

/** Spring progress (0 → 1 with natural overshoot) starting at `start` seconds. */
export const springAt = (t: number, start: number, damping = 11, stiffness = 120, mass = 0.8) =>
  t < start ? 0 : spring({frame: (t - start) * FPS, fps: FPS, config: {damping, stiffness, mass}});

export type Pose = {x: number; y: number; rot: number; sx: number; sy: number; opacity: number};
export const REST: Pose = {x: 0, y: 0, rot: 0, sx: 1, sy: 1, opacity: 1};

export const combine = (...poses: Partial<Pose>[]): Pose =>
  poses.reduce<Pose>(
    (acc, p) => ({
      x: acc.x + (p.x ?? 0),
      y: acc.y + (p.y ?? 0),
      rot: acc.rot + (p.rot ?? 0),
      sx: acc.sx * (p.sx ?? 1),
      sy: acc.sy * (p.sy ?? 1),
      opacity: acc.opacity * (p.opacity ?? 1),
    }),
    {...REST},
  );

// ---------------------------------------------------------------- presets ---
export type EntranceKind = 'pop' | 'fly' | 'hop' | 'slideLeft' | 'slideRight' | 'rise';

/** Character entrance with anticipation + overshoot. */
export const entrance = (t: number, start: number, kind: EntranceKind, dist = 700): Partial<Pose> => {
  if (t < start) return {opacity: 0};
  const p = springAt(t, start);
  const lt = t - start;
  switch (kind) {
    case 'pop': {
      const s = lerp(0.2, 1, p);
      return {sx: s, sy: s, opacity: clamp(lt / 0.15)};
    }
    case 'fly': {
      // arcs in from the upper right with a swoop
      const k = easeOut(lt / 0.9);
      return {x: lerp(dist, 0, k), y: -Math.sin(Math.PI * k) * 160 - (1 - k) * 260, rot: lerp(-18, 0, k), opacity: clamp(lt / 0.1)};
    }
    case 'hop': {
      // three hops in from the left
      const k = clamp(lt / 1.0);
      const hop = Math.abs(Math.sin(k * Math.PI * 3)) * 90 * (1 - k * 0.6);
      const squash = k < 1 ? 1 - 0.08 * Math.cos(k * Math.PI * 6) : 1;
      return {x: lerp(-dist, 0, easeOut(k)), y: -hop, sx: 2 - squash, sy: squash, opacity: clamp(lt / 0.1)};
    }
    case 'slideLeft':
      return {x: lerp(dist, 0, p), rot: lerp(8, 0, p), opacity: clamp(lt / 0.15)};
    case 'slideRight':
      return {x: lerp(-dist, 0, p), rot: lerp(-8, 0, p), opacity: clamp(lt / 0.15)};
    case 'rise': {
      // anticipation squash, then spring up from below
      const s = lt < 0.12 ? 1 - lt : 1;
      return {y: lerp(dist * 0.6, 0, p), sy: s, opacity: clamp(lt / 0.15)};
    }
  }
};

/** Gentle idle bounce (breathing) — squash at the feet. */
export const idleBounce = (t: number, phase = 0, amount = 1): Partial<Pose> => {
  const s = Math.sin(t * 3.2 + phase);
  return {y: -Math.max(0, s) * 10 * amount, sy: 1 + s * 0.018 * amount, sx: 1 - s * 0.012 * amount};
};

/** Floating motion for flying characters / props. */
export const float = (t: number, phase = 0, amp = 14): Partial<Pose> => ({
  y: Math.sin(t * 2.1 + phase) * amp,
  rot: Math.sin(t * 1.3 + phase) * 2.5,
});

/** Friendly wave — the cut-out body rocks from the feet (no separate arm rig). */
export const wave = (t: number, start: number, dur = 1.6, amount = 1): Partial<Pose> => {
  const lt = t - start;
  if (lt < 0 || lt > dur) return {};
  const env = Math.sin((Math.PI * lt) / dur);
  return {rot: Math.sin(lt * 11) * 5 * env * amount, y: -Math.abs(Math.sin(lt * 11)) * 6 * env};
};

/** Celebration jump. */
export const jump = (t: number, start: number, height = 120): Partial<Pose> => {
  const lt = t - start;
  if (lt < 0 || lt > 0.75) return {};
  const k = lt / 0.75;
  const pre = k < 0.15 ? Math.sin((k / 0.15) * Math.PI) * 0.08 : 0; // anticipation squash
  return {y: -Math.sin(Math.PI * clamp((k - 0.15) / 0.85)) * height, sy: 1 - pre, sx: 1 + pre};
};

/** Name-label / title reveal progress with overshoot. */
export const reveal = (t: number, start: number) => springAt(t, start, 12, 160, 0.7);

/** Exit for scene hand-offs. */
export const fadeOutAt = (t: number, start: number, dur = 0.4) => 1 - smooth((t - start) / dur);
