// Color ramps (dark -> light). All art is painted with ramp indices so a
// "darker shade" of any sprite is just "step every pixel down its ramp".

export const RAMPS = {
  grass:  ['#0a1d16', '#11301f', '#18462a', '#226032', '#337b39', '#4d983d', '#74b648', '#a5d35c', '#d8f08c'],
  dirt:   ['#24180f', '#3f2b1c', '#5e4129', '#7f5a37', '#a27a4b', '#c49d67', '#e0c28c'],
  water:  ['#0b1c36', '#11305a', '#1a4b80', '#2a6ea6', '#4b9bc8', '#86cbe3', '#d4f3f8'],
  stone:  ['#1b1d26', '#323645', '#4d5366', '#6d7488', '#9199ab', '#bcc3cf', '#e6eaf0'],
  bark:   ['#1c1010', '#38201a', '#583424', '#7a4c31', '#9c6a45'],
  leaf:   ['#08211a', '#0e3424', '#164b2c', '#1f6434', '#2e7f3a', '#46a043', '#6ebe4c', '#a3dc62', '#dcf590'],
  yellow: ['#4f3210', '#9a6219', '#dba22a', '#f6d457', '#fff2b4'],
  pink:   ['#45173a', '#8a2c5c', '#d25b8c', '#f39cc4', '#ffd8ea'],
  white:  ['#303852', '#707c9a', '#bcc6da', '#eef3ff', '#ffffff'],
  violet: ['#231a4a', '#45348a', '#7558c6', '#a68ae8', '#ddd0ff'],
  red:    ['#2e0b14', '#6a1624', '#b02a34', '#e45a4c', '#ffa08a'],
  skin:   ['#4a2418', '#8c4e36', '#cf8862', '#f1bd94', '#ffe0c4'],
  hair:   ['#1e0f0c', '#3e2015', '#673620', '#94562c', '#c27f40'],
  tunic:  ['#0b1530', '#17305e', '#26529a', '#3d7fca', '#76b4ec'],
  boots:  ['#140d0c', '#2f1f17', '#523624', '#7a5434'],
  gold:   ['#3e2a0c', '#8a6114', '#d4a52a', '#ffe27a'],
  ink:    ['#0c0810', '#1a1220'],
};

export const RAMP_NAMES = Object.keys(RAMPS);
export const RAMP_ID = Object.fromEntries(RAMP_NAMES.map((n, i) => [n, i]));

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Pack to little-endian ABGR so it can be written straight into ImageData.
export function pack(r, g, b, a = 255) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
export function packHex(hex, a = 255) {
  const [r, g, b] = hexToRgb(hex);
  return pack(r, g, b, a);
}

// Indexed pixel code = rampId * 16 + level. 255 = transparent.
export const CLEAR = 255;
export const code = (ramp, level) => RAMP_ID[ramp] * 16 + level;

export const LUT = new Uint32Array(256);
for (const name of RAMP_NAMES) {
  RAMPS[name].forEach((hex, lvl) => { LUT[RAMP_ID[name] * 16 + lvl] = packHex(hex); });
}

export const col = (ramp, level) => LUT[code(ramp, Math.max(0, Math.min(RAMPS[ramp].length - 1, level)))];

// Step a code down its ramp by `k` levels.
export function darkenCode(c, k) {
  if (c === CLEAR) return c;
  const lvl = c & 15;
  return (c & ~15) | Math.max(0, lvl - k);
}

export function scaleColor(c, f) {
  const r = Math.min(255, (c & 255) * f) | 0;
  const g = Math.min(255, ((c >>> 8) & 255) * f) | 0;
  const b = Math.min(255, ((c >>> 16) & 255) * f) | 0;
  return pack(r, g, b, c >>> 24);
}

export function mixColor(c1, c2, t) {
  const r = (c1 & 255) + ((c2 & 255) - (c1 & 255)) * t;
  const g = ((c1 >>> 8) & 255) + (((c2 >>> 8) & 255) - ((c1 >>> 8) & 255)) * t;
  const b = ((c1 >>> 16) & 255) + (((c2 >>> 16) & 255) - ((c1 >>> 16) & 255)) * t;
  return pack(r | 0, g | 0, b | 0, 255);
}

// The single flat colour under every grass patch. Gaps between tufts read as depth.
export const PATCH_GROUND = packHex('#123423');
