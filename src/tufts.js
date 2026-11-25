// Procedural tuft art. Each tuft is a 16x18 indexed sprite, origin at the base.
// 4 base designs (+ 4 flowered variants), each also flipped, each with two
// darker shades made by stepping every pixel down its colour ramp.

import { mulberry32 } from './rng.js';
import { CLEAR, code, darkenCode } from './palette.js';

export const TW = 16;
export const TH = 18;
export const SOLID_ROWS = 10; // the lower 10 rows are filled solid (no holes)
export const BASE_DESIGNS = 4;
const FLOWERS = ['yellow', 'pink', 'white', 'violet'];

function drawDesign(seed) {
  const rng = mulberry32(seed);
  const g = new Uint8Array(TW * TH).fill(CLEAR);
  const set = (x, y, lvl) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= TW || y < 0 || y >= TH) return;
    g[y * TW + x] = code('grass', Math.max(0, Math.min(8, lvl)));
  };

  // Base clump so the bottom reads as a dense mass.
  for (let y = 11; y < TH; y++) {
    for (let x = 0; x < TW; x++) {
      const nx = (x + 0.5 - 8) / 7.2, ny = (y + 0.5 - 18) / 7.5;
      if (nx * nx + ny * ny < 1) set(x, y, y >= 16 ? 1 : y >= 14 ? 2 : 3);
    }
  }

  // Blades, back (dark) to front (bright).
  const n = 10 + Math.floor(rng() * 4);
  const blades = [];
  for (let i = 0; i < n; i++) {
    const bx = 2.5 + rng() * 11;
    const center = 1 - Math.abs(bx - 7.5) / 6;
    const H = Math.min(18, 9 + rng() * 6 + center * 4);
    const curl = (bx - 7.5) * 0.5 + (rng() - 0.5) * 4;
    blades.push({ bx, H, curl, tone: rng() });
  }
  blades.sort((a, b) => a.tone - b.tone);
  for (const b of blades) {
    const depth = b.tone < 0.3 ? -1 : b.tone > 0.72 ? 1 : 0;
    const steps = Math.ceil(b.H * 3);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const y = 17 - t * (b.H - 1);
      const x = b.bx + b.curl * t * t;
      const lvl = Math.round(1.6 + t * 4.6) + depth;
      if (t < 0.55) {
        set(Math.floor(x), y, lvl + 1); // lit left edge
        set(Math.floor(x) + 1, y, lvl);
      } else {
        set(x, y, lvl);
      }
    }
    const tipX = b.bx + b.curl, tipY = 17 - (b.H - 1);
    set(tipX, tipY, b.tone > 0.6 ? 8 : 7);
    b.tip = [Math.round(tipX), Math.round(tipY)];
  }

  // Lower rows solid: fill any hole between the leftmost and rightmost pixel.
  for (let y = TH - SOLID_ROWS; y < TH; y++) {
    let lo = -1, hi = -1;
    for (let x = 0; x < TW; x++) if (g[y * TW + x] !== CLEAR) { if (lo < 0) lo = x; hi = x; }
    if (lo < 0) continue;
    for (let x = lo; x <= hi; x++) if (g[y * TW + x] === CLEAR) set(x, y, y > 14 ? 1 : 2);
  }
  // Under-shadow on the very bottom row.
  for (let x = 0; x < TW; x++) if (g[17 * TW + x] !== CLEAR) set(x, 17, 1);

  return { grid: g, blades };
}

function addFlower(design, ramp) {
  const g = new Uint8Array(design.grid);
  // Tallest blade with room for petals.
  const tip = design.blades
    .map((b) => b.tip)
    .filter(([x, y]) => x >= 2 && x <= 13 && y >= 2)
    .sort((a, b) => a[1] - b[1])[0] || [8, 4];
  const [cx, cy] = tip;
  const put = (x, y, lvl) => { if (x >= 0 && x < TW && y >= 0 && y < TH) g[y * TW + x] = code(ramp, lvl); };
  put(cx, cy - 1, 4); put(cx - 1, cy, 3); put(cx + 1, cy, 2); put(cx, cy + 1, 2);
  put(cx - 1, cy - 1, 3); put(cx + 1, cy + 1, 1);
  g[cy * TW + cx] = code('yellow', 3);
  if (ramp === 'yellow') g[cy * TW + cx] = code('dirt', 3);
  return g;
}

function flipGrid(g) {
  const out = new Uint8Array(g.length);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) out[y * TW + x] = g[y * TW + (TW - 1 - x)];
  return out;
}
function shadeGrid(g, k) {
  return g.map((c) => darkenCode(c, k));
}

// ART[artId] = indexed grid. artId = (design * 2 + flip) * 3 + shade
export const ART = [];
export const DESIGN_COUNT = BASE_DESIGNS * 2;
const SEEDS = [11, 29, 47, 83];
const base = SEEDS.map((s) => drawDesign(s));
const designs = [...base.map((d) => d.grid), ...base.map((d, i) => addFlower(d, FLOWERS[i]))];
for (const d of designs) {
  for (const flip of [false, true]) {
    const g = flip ? flipGrid(d) : d;
    ART.push(g, shadeGrid(g, 1), shadeGrid(g, 2));
  }
}
export const artId = (design, flip, shade) => (design * 2 + (flip ? 1 : 0)) * 3 + shade;
