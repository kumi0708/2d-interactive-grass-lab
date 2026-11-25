// Procedural meadow: ground layer, grass patches with tuft layout, props.

import { fbm, hash2, bayer, mulberry32, clamp } from './rng.js';
import { col, PATCH_GROUND, scaleColor, mixColor, packHex } from './palette.js';
import { makeSprite, outline, shadowEllipse } from './raster.js';
import { makeTuft, flagEdges } from './grass.js';
import { BASE_DESIGNS } from './tufts.js';

export const W = 400;
export const H = 225;

const PATCHES = [
  { x: 150, y: 92, rx: 100, ry: 44 },
  { x: 62, y: 186, rx: 62, ry: 30 },
  { x: 300, y: 44, rx: 72, ry: 28 },
  { x: 236, y: 162, rx: 40, ry: 24 },
];
const POND = { x: 330, y: 172, rx: 48, ry: 27 };
const pathY = (x) => 176 - x * 0.2 + 9 * Math.sin(x * 0.03 + 0.4);

function patchField(x, y) {
  let best = -1;
  for (const p of PATCHES) {
    const nx = (x - p.x) / p.rx, ny = (y - p.y) / p.ry;
    const wob = (fbm(x * 0.06, y * 0.06, 7) - 0.5) * 0.7;
    best = Math.max(best, 1 - Math.sqrt(nx * nx + ny * ny) + wob);
  }
  return best;
}
function pondField(x, y) {
  const nx = (x - POND.x) / POND.rx, ny = (y - POND.y) / POND.ry;
  return 1 - Math.sqrt(nx * nx + ny * ny) + (fbm(x * 0.08, y * 0.08, 3) - 0.5) * 0.25;
}
function pathField(x, y) {
  const d = Math.abs(y - pathY(x));
  const half = 6.5 + (fbm(x * 0.07, 1.3, 5) - 0.5) * 4;
  return half - d; // >0 inside
}

export function buildWorld(seed = 1) {
  const rng = mulberry32(seed);
  const ground = new Uint32Array(W * H);
  const kind = new Uint8Array(W * H); // 0 meadow, 1 patch, 2 path, 3 water, 4 shore
  const waterPx = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const pf = pondField(x, y);
      const path = pathField(x, y);
      const patch = patchField(x, y);
      if (pf > 0.1) {
        kind[i] = 3;
        const depth = clamp((pf - 0.1) * 3.2, 0, 1);
        let lvl = depth > 0.75 ? 1 : depth > 0.35 ? 2 : 3;
        const n = fbm(x * 0.15, y * 0.6, 21);
        if (n > 0.64 && lvl < 3) lvl += 1;
        if (pf < 0.14) lvl = 4; // bright rim
        ground[i] = col('water', lvl);
        waterPx.push(i);
      } else if (pf > 0.0) {
        kind[i] = 4;
        const t = pf / 0.1;
        ground[i] = col('dirt', t > 0.55 ? 1 : 2 + (bayer(x, y) > 0.5 ? 1 : 0));
      } else if (path > 0) {
        kind[i] = 2;
        const n = fbm(x * 0.12, y * 0.12, 9);
        let lvl = 3 + Math.round((n - 0.5) * 3 + (bayer(x, y) - 0.5));
        if (path < 1.2) lvl = 2;
        if (y < pathY(x) - 2 && path < 2.2) lvl = Math.max(lvl - 1, 1);
        ground[i] = col('dirt', clamp(lvl, 1, 5));
        const h = hash2(x, y, 33);
        if (h < 0.018 && path > 2) { ground[i] = col('stone', 5); if (y + 1 < H) ground[i + W] = col('dirt', 1); }
      } else {
        void patch;
        // meadow: dithered noise over three ramp levels + tiny blade marks
        const n = fbm(x * 0.035, y * 0.035, 1) * 0.8 + fbm(x * 0.15, y * 0.15, 2) * 0.2;
        const v = 2.6 + n * 3.2 + (bayer(x, y) - 0.5) * 0.9;
        ground[i] = col('grass', clamp(Math.round(v), 3, 6));
      }
    }
  }

  // meadow decoration: blade marks, clover, flowers; grass creeping over the path edge
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const h = hash2(x, y, 77);
      if (kind[i] === 0) {
        if (h < 0.07) {
          const base = ground[i];
          ground[i - W] = scaleColor(base, 1.25);
          ground[i] = scaleColor(base, 0.78);
        } else if (h < 0.075 && fbm(x * 0.05, y * 0.05, 40) > 0.55) {
          const ramp = ['yellow', 'white', 'pink', 'violet'][Math.floor(hash2(x, y, 5) * 4)];
          ground[i] = col(ramp, 3); ground[i - 1] = col(ramp, 2); ground[i + 1] = col(ramp, 2);
          ground[i - W] = col(ramp, 4); ground[i + W] = col('grass', 2);
        }
      } else if (kind[i] === 2 && pathField(x, y) < 1.5 && h < 0.25) {
        ground[i] = col('grass', 4 + (h < 0.1 ? 1 : 0));
      }
    }
  }
  // shoreline foam on the near (lower) edge of the pond
  for (const i of waterPx) {
    if (kind[i + W] === 4 && hash2(i, 1, 4) < 0.6) ground[i] = col('water', 5);
  }

  // ---- tufts: staggered grid ~13 x 8 px with jitter ----
  const tufts = [];
  let row = 0;
  for (let y = 4; y < H + 4; y += 8, row++) {
    for (let x = (row % 2) * 6.5 - 4; x < W + 8; x += 13) {
      const tx = Math.round(x + (rng() - 0.5) * 4);
      const ty = Math.round(y + (rng() - 0.5) * 3);
      if (patchField(tx, ty) < 0.16) continue;
      if (patchField(tx - 6, ty) < 0.05 || patchField(tx + 6, ty) < 0.05) continue;
      if (pathField(tx, ty) > -4 || pondField(tx, ty) > -0.15) continue;
      const flower = rng() < 0.13;
      const design = Math.floor(rng() * BASE_DESIGNS) + (flower ? BASE_DESIGNS : 0);
      tufts.push(makeTuft(tx, ty, design, rng() < 0.5, rng()));
    }
  }
  tufts.sort((a, b) => a.y - b.y || a.x - b.x);
  flagEdges(tufts);

  // One flat dark green under the grass, painted from the tufts themselves so
  // it sits exactly beneath their bodies (gaps between tufts read as depth).
  const under = new Float32Array(W * H);
  for (const t of tufts) {
    for (let y = t.y - 14; y <= t.y + 2; y++) for (let x = t.x - 10; x <= t.x + 10; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const nx = (x - t.x) / 9.5, ny = (y - (t.y - 5)) / 8;
      under[y * W + x] = Math.max(under[y * W + x], 1 - (nx * nx + ny * ny));
    }
  }
  for (let i = 0; i < W * H; i++) {
    const v = under[i];
    if (v <= 0 || kind[i] >= 2) continue;
    const x = i % W, y = (i / W) | 0;
    if (v > 0.22) { ground[i] = PATCH_GROUND; kind[i] = 1; }
    else if (v > 0.22 * bayer(x, y) + 0.04) ground[i] = mixColor(ground[i], PATCH_GROUND, 0.6);
  }

  // ---- props ----
  const props = [];
  const colliders = [];
  const addProp = (sprite, x, y, ax, ay, r, shadow) => {
    props.push({ sprite, x: x - ax, y: y - ay, sortY: y });
    if (r) colliders.push({ x, y: y - 1, r });
    if (shadow) shadowEllipse(ground, W, H, x + shadow[0], y + shadow[1], shadow[2], shadow[3], 0.62);
  };
  const trees = [[26, 82, 3], [378, 108, 8], [212, 222, 13], [386, 40, 21]];
  for (const [x, y, s] of trees) {
    const t = makeTree(s);
    addProp(t, x, y, t.ax, t.ay, 6, [6, -4, 26, 10]);
  }
  for (const [x, y, s] of [[196, 128, 3], [104, 146, 5], [262, 112, 6], [284, 196, 9]]) {
    const r = makeRock(s);
    addProp(r, x, y, r.ax, r.ay, 6, [2, -1, 9, 3]);
  }
  for (const [x, y, s] of [[118, 214, 1], [126, 217, 2], [384, 140, 3], [21, 120, 4]]) {
    const m = makeMushroom(s);
    addProp(m, x, y, m.ax, m.ay, 0, null);
  }
  const stump = makeStump();
  addProp(stump, 248, 132, stump.ax, stump.ay, 6, [2, -1, 9, 3]);

  // lily pads on the pond (ground decals)
  for (const [x, y, flower] of [[312, 168, true], [344, 180, false], [356, 162, false], [326, 186, true]]) {
    drawLily(ground, x, y, flower);
  }

  return { ground, kind, waterPx, tufts, props, colliders, pond: POND, pondField, pathField };
}

// ------------------------------------------------------------------ props

function makeTree(seed) {
  const rng = mulberry32(seed * 101);
  const w = 64, h = 78;
  const s = makeSprite(w, h);
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) s.data[y * w + x] = c; };
  // trunk
  for (let y = 40; y < h - 1; y++) {
    const t = (y - 40) / (h - 41);
    const half = 3.2 + t * t * 4.5;
    for (let x = Math.floor(32 - half); x <= Math.ceil(32 + half); x++) {
      const u = (x - (32 - half)) / (2 * half);
      let lvl = u < 0.3 ? 3 : u > 0.75 ? 1 : 2;
      if (hash2(x, y, seed) < 0.12) lvl = Math.max(0, lvl - 1);
      if ((x + Math.floor(y / 3)) % 5 === 0 && u > 0.2 && u < 0.8) lvl = Math.max(0, lvl - 1);
      set(x, y, col('bark', lvl));
    }
  }
  // canopy: union of shaded spheres
  const blobs = [[32, 24, 21], [17, 31, 13], [47, 31, 13], [23, 14, 12], [41, 13, 12], [32, 38, 13], [32, 8, 9]];
  for (let k = 0; k < 4; k++) blobs.push([14 + rng() * 36, 10 + rng() * 26, 7 + rng() * 5]);
  const L = [-0.5, -0.7, 0.5];
  for (let y = 0; y < 52; y++) {
    for (let x = 0; x < w; x++) {
      let best = null, bestIn = 0;
      for (const [cx, cy, r] of blobs) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d < 1 && 1 - d > bestIn - 0.05) {
          // prefer the front-most (lowest) blob where they overlap
          if (!best || cy > best[1] - 2 || 1 - d > bestIn) { best = [cx, cy, r]; bestIn = 1 - d; }
        }
      }
      if (!best) continue;
      const [cx, cy, r] = best;
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let lit = nx * L[0] + ny * L[1] + nz * L[2];
      lit = lit * 0.75 + (fbm(x * 0.25, y * 0.25, seed) - 0.5) * 0.7;
      lit -= Math.max(0, (y - 36) / 16) * 0.7; // underside in shadow
      const v = 3.4 + lit * 3.4 + (bayer(x, y) - 0.5) * 1.1;
      set(x, y, col('leaf', clamp(Math.round(v), 1, 7)));
    }
  }
  // leaf clusters / highlights
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(10 + rng() * 40), y = Math.floor(4 + rng() * 30);
    if (!(s.data[y * w + x] >>> 24)) continue;
    const lit = (x < 34 && y < 24) ? 8 : 6;
    set(x, y, col('leaf', lit)); set(x + 1, y, col('leaf', lit - 1)); set(x, y + 1, col('leaf', 3));
  }
  // apples / blossoms
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(12 + rng() * 40), y = Math.floor(14 + rng() * 22);
    if (!(s.data[y * w + x] >>> 24)) continue;
    set(x, y, col('red', 3)); set(x, y + 1, col('red', 1)); set(x - 1, y, col('red', 4));
  }
  outline(s, col('leaf', 0), false);
  s.ax = 32; s.ay = h - 2;
  return s;
}

function makeRock(seed) {
  const rng = mulberry32(seed * 7 + 1);
  const w = 22, h = 16;
  const s = makeSprite(w, h);
  const rx = 8 + rng() * 2, ry = 6 + rng();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - 11) / rx, ny = (y + 0.5 - 9) / ry;
    const d = nx * nx + ny * ny + (fbm(x * 0.4, y * 0.4, seed) - 0.5) * 0.5;
    if (d > 1 || y > 13) continue;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lit = -nx * 0.5 - ny * 0.7 + nz * 0.5;
    let v = 3 + lit * 2.6 + (bayer(x, y) - 0.5);
    let c = col('stone', clamp(Math.round(v), 1, 6));
    if (ny < -0.35 && fbm(x * 0.5, y * 0.5, seed + 3) > 0.5) c = col('leaf', clamp(Math.round(4 + lit * 2), 3, 7)); // moss
    s.data[y * w + x] = c;
  }
  outline(s, col('ink', 1));
  s.ax = 11; s.ay = 14;
  return s;
}

function makeMushroom(seed) {
  const w = 9, h = 10;
  const s = makeSprite(w, h);
  const set = (x, y, c) => { s.data[y * w + x] = c; };
  const big = seed % 2 === 1;
  for (let y = 5; y < 9; y++) for (let x = 3; x < 6; x++) set(x, y, col('white', x === 3 ? 3 : 2));
  const cy = big ? 4 : 5;
  for (let y = 1; y <= cy; y++) for (let x = 0; x < w; x++) {
    const nx = (x + 0.5 - 4.5) / 4.5, ny = (y + 0.5 - (cy + 1)) / (cy);
    if (nx * nx + ny * ny > 1) continue;
    set(x, y, col('red', nx < -0.2 && ny < -0.5 ? 4 : nx > 0.4 ? 2 : 3));
  }
  set(3, 2, col('white', 4)); set(6, 3, col('white', 3)); set(2, 4, col('white', 3));
  outline(s, col('ink', 1));
  s.ax = 4; s.ay = 8;
  return s;
}

function makeStump() {
  const w = 20, h = 16;
  const s = makeSprite(w, h);
  for (let y = 4; y < 14; y++) for (let x = 3; x < 17; x++) {
    const u = (x - 3) / 13;
    s.data[y * w + x] = col('bark', u < 0.25 ? 3 : u > 0.75 ? 1 : 2);
  }
  for (let y = 1; y < 8; y++) for (let x = 2; x < 18; x++) {
    const nx = (x + 0.5 - 10) / 7.5, ny = (y + 0.5 - 4.5) / 3.2;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const ring = Math.floor(Math.sqrt(d) * 4);
    s.data[y * w + x] = d > 0.75 ? col('bark', 3) : col('dirt', ring % 2 ? 5 : 6);
  }
  s.data[13 * w + 2] = col('bark', 2); s.data[13 * w + 17] = col('bark', 1);
  outline(s, col('ink', 1));
  s.ax = 10; s.ay = 14;
  return s;
}

function drawLily(ground, cx, cy, flower) {
  for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) {
    const d = (x * x) / 25 + (y * y) / 9;
    if (d > 1) continue;
    if (x > 0 && Math.abs(y) <= Math.max(0, x - 3)) continue; // notch
    const i = (cy + y) * W + (cx + x);
    ground[i] = col('leaf', d > 0.7 ? (y > 0 ? 3 : 5) : y < 0 && x < 0 ? 6 : 4);
  }
  if (flower) {
    const i = cy * W + cx;
    ground[i - 1] = col('pink', 4); ground[i] = col('pink', 3); ground[i + 1] = col('pink', 2);
    ground[i - W] = col('pink', 4); ground[i - W - 1] = col('pink', 3); ground[i - W + 1] = col('pink', 3);
    ground[i - 2 * W] = col('yellow', 3);
  }
}
