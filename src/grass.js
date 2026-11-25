// Tuft simulation (CPU, fixed 60 Hz tick) + per-tuft "look" building.
// Pure module: no DOM, so tools/verify.mjs can run it in Node.

import { ART, TW, TH, artId } from './tufts.js';
import { LUT, CLEAR } from './palette.js';

export const PARAMS = {
  feelX: 12, feelBack: 4, feelFront: 10,
  leanPx: 7, frontX: 9, frontLeanPx: 2, maxLeanPx: 8,
  springHz: 2.6, damping: 0.22,
  pressX: 7, pressBack: 10, pressTime: 0.12, recoverTime: 0.7, pressSquash: 0.67,
  coverTime: 0.35, coverSquash: 0.1,
  shakePx: 1.3, shakeSpeed: 55, shakeTime: 0.35,
  touchLean: 1.5, touchCooldown: 0.7,
  sortOffset: 1,
  // --- extension (not in the original article): ambient wind ---
  windPx: 1.0, windSpeed: 1.0,
};
export const DEFAULT_PARAMS = { ...PARAMS };

export function makeTuft(x, y, design, flip, phase) {
  return {
    x, y, design, flip, phase,
    edge: false,
    lean: 0, vel: 0, press: 0, cover: 0,
    touch: -9, side: 0, target: 0,
  };
}

// Tufts with open ground behind (above) them never flatten.
export function flagEdges(tufts) {
  for (const t of tufts) {
    t.edge = !tufts.some((o) => o !== t && o.y < t.y && o.y >= t.y - 12 && Math.abs(o.x - t.x) <= 10);
  }
}

const smooth = (p) => p * p * (3 - 2 * p);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * One fixed tick. feet = rounded {x,y} of the player's feet.
 * onRustle(tuft) fires when a tuft is pushed hard enough and its cooldown passed.
 */
export function tickGrass(tufts, dt, now, feet, enabled, onRustle) {
  const P = PARAMS;
  const w = 2 * Math.PI * P.springHz;
  for (const t of tufts) {
    const dx = t.x - feet.x;
    const dy = t.y - feet.y;
    const adx = Math.abs(dx);

    // --- lean target: push away from the feet ---
    let target = 0;
    if (enabled && adx < P.feelX && dy > -P.feelBack && dy < P.feelFront) {
      if (t.side === 0) t.side = dx > 0 ? 1 : dx < 0 ? -1 : t.phase > 0.5 ? 1 : -1;
      target = t.side * P.leanPx
        * Math.min(1, (P.feelX - adx) / 6)
        * Math.min(1, (P.feelFront - Math.abs(dy - 3)) / 5);
      // Tufts in front keep covering the legs: barely lean.
      if (dy > -1 && adx < P.frontX) target = clamp(target, -P.frontLeanPx, P.frontLeanPx);
    } else {
      t.side = 0; // cleared on exit so it never flips mid-pass
    }
    t.target = target;

    // --- damped spring (semi-implicit Euler) ---
    const acc = w * w * (target - t.lean) - 2 * P.damping * w * t.vel;
    t.vel += acc * dt;
    t.lean = clamp(t.lean + t.vel * dt, -P.maxLeanPx, P.maxLeanPx);

    // --- trample: tufts under the body flatten, then grow back ---
    const pressed = enabled && !t.edge && adx < P.pressX && dy > -P.pressBack && dy <= -1;
    t.press = clamp(t.press + (pressed ? dt / P.pressTime : -dt / P.recoverTime), 0, 1);

    // --- cover: tufts just in front of the feet squash a little ---
    const ddy = dy + 1;
    const near = enabled && ddy > 0
      ? clamp((11 - adx) / 3, 0, 1) * clamp((10 - ddy) / 3, 0, 1) * Math.min(1, ddy / 3)
      : 0;
    const step = dt / P.coverTime;
    t.cover += clamp(near - t.cover, -step, step);

    // --- rustle with cooldown ---
    if (Math.abs(target) > P.touchLean) {
      if (now - t.touch > P.touchCooldown) {
        t.touch = now;
        onRustle && onRustle(t);
      } else {
        t.touch = Math.max(t.touch, now - 0.5);
      }
    }
  }
}

// Ambient wind (extension): slow sway + gust bands travelling across the field.
export function windAt(x, y, now) {
  const P = PARAMS;
  if (P.windPx <= 0) return 0;
  const s = now * P.windSpeed;
  const sway = 0.55 * Math.sin(s * 1.4 + x * 0.045 + y * 0.021);
  const band = Math.sin(x * 0.022 + y * 0.012 - s * 0.9);
  const gust = Math.pow(Math.max(0, band), 6) * 1.9;
  return P.windPx * (sway + gust);
}

export const lookStats = { built: 0, cached: 0 };
const cache = new Map();
const MAX_CACHE = 6000;

/** Everything that changes how a tuft is drawn, reduced to integers. */
export function tuftState(t, now, wind = true) {
  const P = PARAMS;
  const ss = smooth(t.press);
  const h2 = Math.max(1, Math.round(TH * (1 - P.pressSquash * ss) * (1 - P.coverSquash * t.cover)));
  const shade = t.press > 0.6 ? 2 : t.press > 0.3 ? 1 : 0;
  const age = now - t.touch;
  const shake = P.shakePx * Math.sin(age * P.shakeSpeed + t.phase * 6) * Math.max(0, 1 - age / P.shakeTime);
  let total = t.lean + shake + (wind ? windAt(t.x, t.y, now) * (1 - ss) : 0);
  let q = Math.round(total * 4) / 4;
  if (Math.abs(q) < 0.5) q = 0;
  return { h2, shade, total: q, art: artId(t.design, t.flip, shade) };
}

/**
 * Build (or fetch) the drawn image for a tuft state. Looks are shared between
 * all tufts through a global cache keyed by (art, height, bend) — a tuft at rest
 * costs nothing, and 400 tufts in the wind hit only a few hundred unique images.
 */
export function getLook(s) {
  const key = s.art * 100000 + s.h2 * 1000 + (s.total * 4 + 500);
  let look = cache.get(key);
  if (look) { lookStats.cached++; return look; }
  lookStats.built++;
  look = buildLook(ART[s.art], s.h2, s.total);
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, look);
  return look;
}
export const lookCacheSize = () => cache.size;

export function rowShift(total, h2, r) {
  if (h2 <= 1 || total === 0) return 0;
  return Math.round(total * Math.pow((h2 - 1 - r) / (h2 - 1), 1.6));
}

export function buildLook(grid, h2, total) {
  const pad = Math.ceil(Math.abs(total)) + 1;
  const w = TW + pad * 2;
  const data = new Uint32Array(w * h2);
  for (let i = 0; i < h2; i++) {
    // Resample rows so the base row always survives the squash.
    const src = h2 === 1 ? TH - 1 : Math.round((i * (TH - 1)) / (h2 - 1));
    const sh = rowShift(total, h2, i);
    for (let x = 0; x < TW; x++) {
      const c = grid[src * TW + x];
      if (c !== CLEAR) data[i * w + pad + sh + x] = LUT[c];
    }
  }
  return { w, h: h2, pad, data };
}
