// Tiny software rasterizer: the whole scene is a Uint32Array framebuffer that
// is pushed to the canvas once per frame with putImageData.

import { scaleColor, mixColor } from './palette.js';
import { bayer } from './rng.js';

export function makeSprite(w, h) {
  return { w, h, data: new Uint32Array(w * h) };
}

export function blit(fb, fw, fh, spr, x, y) {
  const { w, h, data } = spr;
  const x0 = Math.max(0, -x), y0 = Math.max(0, -y);
  const x1 = Math.min(w, fw - x), y1 = Math.min(h, fh - y);
  for (let j = y0; j < y1; j++) {
    const so = j * w, fo = (y + j) * fw + x;
    for (let i = x0; i < x1; i++) {
      const c = data[so + i];
      if (c >>> 24) fb[fo + i] = c;
    }
  }
}

/** Darken pixels inside an ellipse; edge is ordered-dithered for a pixel look. */
export function shadowEllipse(fb, fw, fh, cx, cy, rx, ry, f) {
  const xa = Math.max(0, Math.floor(cx - rx)), xb = Math.min(fw - 1, Math.ceil(cx + rx));
  const ya = Math.max(0, Math.floor(cy - ry)), yb = Math.min(fh - 1, Math.ceil(cy + ry));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const edge = d > 0.6 ? (d - 0.6) / 0.4 : 0;
      if (edge > bayer(x, y)) continue;
      const i = y * fw + x;
      fb[i] = scaleColor(fb[i], f);
    }
  }
}

export function tint(fb, i, c, t) {
  fb[i] = mixColor(fb[i], c, t);
}

/** 1px exterior outline around every opaque pixel of a sprite. */
export function outline(spr, color, diagonal = false) {
  const { w, h, data } = spr;
  const out = new Uint32Array(data);
  const dirs = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >>> 24) continue;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h && data[yy * w + xx] >>> 24) { out[y * w + x] = color; break; }
      }
    }
  }
  spr.data = out;
  return spr;
}

export function flipSprite(spr) {
  const o = makeSprite(spr.w, spr.h);
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) o.data[y * spr.w + x] = spr.data[y * spr.w + spr.w - 1 - x];
  return o;
}
