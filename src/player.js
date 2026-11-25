// Procedural 32x32 adventurer: down / up / side (right) facing, 8 walk frames.
// Left facing = flipped right. Feet sit on the bottom row of the frame.

import { col } from './palette.js';
import { makeSprite, outline, flipSprite } from './raster.js';

export const N = 32;
export const WALK_FRAMES = 8;

function painter(spr) {
  const px = (x, y, ramp, lvl) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= spr.w || y >= spr.h) return;
    spr.data[y * spr.w + x] = col(ramp, lvl);
  };
  const rect = (x0, y0, x1, y1, ramp, lvl) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(x, y, ramp, typeof lvl === 'function' ? lvl(x, y) : lvl);
  };
  const ellipse = (cx, cy, rx, ry, fn) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) fn(x, y, nx, ny);
      }
  };
  return { px, rect, ellipse };
}

function drawFrame(dir, f, moving) {
  const spr = makeSprite(N, N);
  const { px, rect, ellipse } = painter(spr);
  const a = (f / WALK_FRAMES) * Math.PI * 2;
  const s = moving ? Math.sin(a) : 0;
  const bob = moving ? -Math.round(Math.abs(Math.sin(a))) : f % 2 ? 0 : 0;
  const breathe = !moving && f >= 4 ? 1 : 0; // idle: tiny breathing dip
  const by = bob + breathe;
  const side = dir === 'side';

  // ---- legs ----
  if (!side) {
    const liftL = Math.round(Math.max(0, s) * 2), liftR = Math.round(Math.max(0, -s) * 2);
    for (const [x0, lift] of [[12, liftL], [17, liftR]]) {
      rect(x0, 25, x0 + 2, 28 - lift, 'boots', 2);
      px(x0, 25, 'boots', 3);
      rect(x0, 29 - lift, x0 + 2, 30 - lift, 'boots', 1);
      px(x0, 29 - lift, 'boots', 2);
    }
  } else {
    const sw = Math.round(s * 3);
    for (const [off, lvl] of [[-sw, 1], [sw, 2]]) {
      const x0 = 14 + off;
      const lift = moving && Math.abs(off) < 2 ? 1 : 0;
      rect(x0, 25, x0 + 2, 28 - lift, 'boots', lvl);
      rect(x0, 29 - lift, x0 + 3, 30 - lift, 'boots', lvl - 1);
      px(x0 + 3, 29 - lift, 'boots', lvl);
    }
  }

  // ---- tunic ----
  const tx0 = side ? 11 : 10, tx1 = side ? 20 : 21;
  for (let y = 17 + by; y <= 26 + by; y++) {
    const flare = y >= 24 + by ? 1 : 0;
    for (let x = tx0 - flare; x <= tx1 + flare; x++) {
      let lvl = 2;
      if (x <= tx0) lvl = 3;
      if (x >= tx1 - 1) lvl = 1;
      if (y === 26 + by) lvl = 1;
      if (y === 17 + by && x > tx0 && x < tx1 - 1) lvl = 3;
      px(x, y, 'tunic', lvl);
    }
  }
  // belt
  rect(tx0, 23 + by, tx1, 23 + by, 'boots', 2);
  if (dir === 'down') { px(15, 23 + by, 'gold', 3); px(16, 23 + by, 'gold', 2); }
  if (side) px(tx1 - 2, 23 + by, 'gold', 3);
  // tunic trim highlight
  if (dir === 'down') { px(15, 19 + by, 'tunic', 4); px(16, 20 + by, 'tunic', 3); }

  // ---- arms ----
  const swing = Math.round(s);
  if (!side) {
    for (const [x0, dy, light] of [[8, swing, 3], [22, -swing, 1]]) {
      rect(x0, 18 + by + dy, x0 + 1, 21 + by + dy, 'tunic', light);
      rect(x0, 22 + by + dy, x0 + 1, 23 + by + dy, 'skin', light === 3 ? 3 : 2);
    }
  } else {
    const ax = 15 + Math.round(s * 2);
    rect(ax, 18 + by, ax + 2, 21 + by, 'tunic', 3);
    px(ax + 2, 21 + by, 'tunic', 2);
    rect(ax, 22 + by, ax + 2, 23 + by, 'skin', 3);
    px(ax + 2, 23 + by, 'skin', 2);
  }

  // ---- head ----
  const hcx = side ? 16.5 : 15.5, hcy = 10.5 + by;
  ellipse(hcx, hcy, 7.6, 7.1, (x, y, nx, ny) => {
    const l = -nx * 0.6 - ny * 0.7;
    px(x, y, 'skin', l > 0.45 ? 3 : l < -0.8 ? 1 : 2);
  });
  // hair
  ellipse(hcx, hcy, 7.6, 7.1, (x, y, nx, ny) => {
    let hair = false;
    if (dir === 'up') hair = true;
    else if (dir === 'down') hair = ny < -0.25 || (Math.abs(nx) > 0.8 && ny < 0.5) || (ny < -0.08 && (x % 3) !== 1);
    else hair = ny < -0.2 || nx < -0.25 || (nx < 0.2 && ny < 0.25);
    if (!hair) return;
    const l = -nx * 0.55 - ny * 0.75;
    px(x, y, 'hair', l > 0.55 ? 4 : l > 0.1 ? 3 : l < -0.4 ? 1 : 2);
  });
  // hair shine
  if (dir !== 'up') { px(hcx - 3, hcy - 5, 'hair', 4); px(hcx - 2, hcy - 5, 'hair', 4); px(hcx - 4, hcy - 4, 'hair', 4); }
  else { px(hcx - 2, hcy - 4, 'hair', 4); px(hcx - 1, hcy - 4, 'hair', 4); }
  // face
  if (dir === 'down') {
    for (const ex of [12, 19]) { px(ex, 12 + by, 'ink', 0); px(ex, 13 + by, 'ink', 0); px(ex, 11 + by, 'white', 3); }
    px(11, 14 + by, 'pink', 3); px(20, 14 + by, 'pink', 3);
    px(15, 15 + by, 'skin', 1); px(16, 15 + by, 'skin', 1);
  } else if (side) {
    px(21, 12 + by, 'ink', 0); px(21, 13 + by, 'ink', 0); px(21, 11 + by, 'white', 3);
    px(22, 14 + by, 'pink', 3);
    px(24, 12 + by, 'skin', 2);
  }

  // ---- scarf ----
  const flutter = Math.round(Math.sin(a * 2 + 1) * (moving ? 1 : 0.4));
  if (!side) {
    rect(11, 16 + by, 20, 17 + by, 'red', 2);
    rect(11, 16 + by, 14, 16 + by, 'red', 3);
    px(20, 17 + by, 'red', 1);
    const tx = dir === 'down' ? 18 : 15;
    rect(tx, 18 + by, tx + 1, 20 + by + flutter, 'red', 2);
    px(tx + 1, 20 + by + flutter, 'red', 1);
    if (dir === 'up') { rect(tx, 21 + by + flutter, tx + 1, 22 + by + flutter, 'red', 1); }
  } else {
    rect(12, 16 + by, 20, 17 + by, 'red', 2);
    rect(14, 16 + by, 19, 16 + by, 'red', 3);
    // tail streaming behind
    for (let i = 0; i < 5; i++) {
      const x = 11 - i;
      const y = 17 + by + Math.round(Math.sin(a * 2 + i * 0.9) * (moving ? 1.2 : 0.3)) + (i > 2 ? 1 : 0);
      px(x, y, 'red', i < 2 ? 2 : 1);
      px(x, y + 1, 'red', 1);
    }
  }

  outline(spr, col('ink', 0));
  return spr;
}

function build() {
  const frames = { down: [], up: [], right: [], left: [] };
  const idle = { down: [], up: [], right: [], left: [] };
  for (let f = 0; f < WALK_FRAMES; f++) {
    frames.down.push(drawFrame('down', f, true));
    frames.up.push(drawFrame('up', f, true));
    const r = drawFrame('side', f, true);
    frames.right.push(r);
    frames.left.push(flipSprite(r));
    idle.down.push(drawFrame('down', f, false));
    idle.up.push(drawFrame('up', f, false));
    const ri = drawFrame('side', f, false);
    idle.right.push(ri);
    idle.left.push(flipSprite(ri));
  }
  return { frames, idle };
}

export const PLAYER_ART = build();
