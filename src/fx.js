// Ambient life: rustle specks, falling leaves, butterflies, pollen, water glints,
// and the canvas-space light layers (cloud shadows, sun, vignette).

import { col, scaleColor, mixColor } from './palette.js';
import { mulberry32, fbm, hash2 } from './rng.js';
import { shadowEllipse } from './raster.js';

export class Particles {
  constructor(seed = 5) { this.list = []; this.rng = mulberry32(seed); }

  rustle(x, y, lean) {
    const r = this.rng;
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      this.list.push({
        x: x + (r() - 0.5) * 8, y: y + r() * 3,
        vx: (r() - 0.5) * 34 + Math.sign(lean) * 10, vy: -18 - r() * 30,
        g: 110, life: 0.35 + r() * 0.35, age: 0,
        c: col('grass', 6 + Math.floor(r() * 3)), floor: y + 8 + r() * 6,
      });
    }
  }
  dust(x, y) {
    const r = this.rng;
    for (let i = 0; i < 2; i++) this.list.push({
      x: x + (r() - 0.5) * 6, y: y - r() * 2, vx: (r() - 0.5) * 12, vy: -6 - r() * 6,
      g: 0, life: 0.3 + r() * 0.2, age: 0, c: col('dirt', 5), floor: 1e9,
    });
  }
  leaf(x, y, floor) {
    const r = this.rng;
    this.list.push({
      x, y, vx: 4 + r() * 4, vy: 6 + r() * 4, g: 0, life: 9, age: 0, sway: r() * 6,
      c: col('leaf', 5 + Math.floor(r() * 3)), floor, leaf: true,
    });
  }
  update(dt) {
    const out = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age > p.life) continue;
      if (p.leaf) {
        if (p.y < p.floor) { p.x += (p.vx + Math.sin(p.age * 3 + p.sway) * 14) * dt; p.y += p.vy * dt; }
        else if (!p.landed) { p.landed = true; p.life = p.age + 1.5; }
      } else {
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.96;
        if (p.y > p.floor) { p.y = p.floor; p.vy = 0; p.vx = 0; }
      }
      out.push(p);
    }
    this.list = out;
  }
  draw(fb, W, H) {
    for (const p of this.list) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const fade = p.age > p.life - 0.15 && ((x + y) & 1);
      if (fade) continue;
      fb[y * W + x] = p.c;
      if (p.leaf && x + 1 < W) fb[y * W + x + 1] = scaleColor(p.c, 0.7);
    }
  }
}

export class Butterflies {
  constructor(n, W, H, seed = 9) {
    this.rng = mulberry32(seed);
    this.W = W; this.H = H;
    const ramps = ['yellow', 'white', 'pink', 'tunic'];
    this.list = Array.from({ length: n }, (_, i) => ({
      x: 40 + this.rng() * (W - 80), y: 30 + this.rng() * (H - 60), z: 10,
      a: this.rng() * 6.28, t: this.rng() * 10, ramp: ramps[i % ramps.length],
    }));
  }
  update(dt, player) {
    for (const b of this.list) {
      b.t += dt;
      const dp = Math.hypot(b.x - player.x, b.y - player.y);
      if (dp < 26) b.a = Math.atan2(b.y - player.y, b.x - player.x) + (this.rng() - 0.5) * 0.5; // flee
      else b.a += (this.rng() - 0.5) * 3 * dt + Math.sin(b.t * 0.7) * 0.8 * dt;
      const sp = dp < 26 ? 46 : 16;
      b.x += Math.cos(b.a) * sp * dt; b.y += Math.sin(b.a) * sp * 0.7 * dt;
      if (b.x < 10 || b.x > this.W - 10) b.a = Math.PI - b.a;
      if (b.y < 14 || b.y > this.H - 10) b.a = -b.a;
      b.x = Math.max(8, Math.min(this.W - 8, b.x)); b.y = Math.max(12, Math.min(this.H - 8, b.y));
      b.z = 10 + Math.sin(b.t * 2.1) * 3;
    }
  }
  drawShadows(fb, W, H) {
    for (const b of this.list) shadowEllipse(fb, W, H, b.x, b.y, 2.2, 1, 0.7);
  }
  draw(fb, W, H) {
    for (const b of this.list) {
      const x = Math.round(b.x), y = Math.round(b.y - b.z);
      const open = Math.sin(b.t * 22) > 0;
      const put = (dx, dy, c) => { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) fb[yy * W + xx] = c; };
      put(0, 0, col('ink', 1)); put(0, 1, col('ink', 1));
      if (open) {
        put(-1, 0, col(b.ramp, 3)); put(-2, -1, col(b.ramp, 4)); put(-2, 0, col(b.ramp, 3)); put(-1, 1, col(b.ramp, 2));
        put(1, 0, col(b.ramp, 3)); put(2, -1, col(b.ramp, 4)); put(2, 0, col(b.ramp, 3)); put(1, 1, col(b.ramp, 2));
      } else {
        put(-1, -1, col(b.ramp, 3)); put(1, -1, col(b.ramp, 3));
      }
    }
  }
}

export function waterGlints(fb, waterPx, W, now) {
  const step = Math.floor(now * 6);
  for (let k = 0; k < waterPx.length; k += 1) {
    const i = waterPx[k];
    const h = hash2(i, step, 91);
    if (h < 0.004) {
      fb[i] = col('water', 6);
      if (i + 1 < fb.length) fb[i + 1] = col('water', 5);
      if (i - 1 >= 0) fb[i - 1] = col('water', 5);
    } else if (h < 0.02) {
      // slow ripple bands
      const x = i % W, y = (i / W) | 0;
      if (Math.sin(x * 0.25 + y * 0.9 - now * 2) > 0.92) fb[i] = mixColor(fb[i], col('water', 5), 0.6);
    }
  }
}

export function pollen(fb, W, H, now) {
  for (let k = 0; k < 26; k++) {
    const sx = hash2(k, 1, 3) * W, sy = hash2(k, 2, 3) * H;
    const x = Math.round((sx + now * (4 + hash2(k, 3, 3) * 5) + Math.sin(now * 0.7 + k) * 6) % W);
    const y = Math.round((sy + Math.sin(now * 0.9 + k * 1.7) * 5 - now * 1.5 + H * 10) % H);
    const tw = Math.sin(now * 3 + k) > -0.3;
    if (tw && x >= 0 && y >= 0) fb[y * W + x] = mixColor(fb[y * W + x], 0xffd0f6ff, 0.75);
  }
}

/** Light layers drawn with the 2D context on top of the framebuffer. */
export class Lighting {
  constructor(W, H) {
    this.W = W; this.H = H;
    // Tileable-ish cloud shadow texture, 2 alpha steps for a pixel-art feel.
    const cw = 512, ch = 320;
    this.cloud = document.createElement('canvas');
    this.cloud.width = cw; this.cloud.height = ch;
    const c = this.cloud.getContext('2d');
    const img = c.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const n = fbm(x * 0.012, y * 0.018, 55, 5);
      const a = n > 0.6 ? 70 : n > 0.55 ? (((x + y) & 1) ? 70 : 0) : 0;
      const o = (y * cw + x) * 4;
      img.data[o] = 10; img.data[o + 1] = 26; img.data[o + 2] = 44; img.data[o + 3] = a;
    }
    c.putImageData(img, 0, 0);

    this.sun = document.createElement('canvas');
    this.sun.width = W; this.sun.height = H;
    const s = this.sun.getContext('2d');
    const g = s.createRadialGradient(W * 0.15, -H * 0.2, 10, W * 0.3, H * 0.2, W * 0.9);
    g.addColorStop(0, 'rgba(255,236,170,0.26)');
    g.addColorStop(0.5, 'rgba(255,220,150,0.08)');
    g.addColorStop(1, 'rgba(255,200,140,0)');
    s.fillStyle = g; s.fillRect(0, 0, W, H);
    const v = s.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.68);
    v.addColorStop(0, 'rgba(8,16,30,0)');
    v.addColorStop(1, 'rgba(8,16,30,0.45)');
    s.fillStyle = v; s.fillRect(0, 0, W, H);
  }
  draw(ctx, now) {
    const cw = this.cloud.width, ch = this.cloud.height;
    const ox = Math.round((now * 7) % cw), oy = Math.round((now * 2.5) % ch);
    for (let y = -oy; y < this.H; y += ch) for (let x = -ox; x < this.W; x += cw) ctx.drawImage(this.cloud, x, y);
    ctx.drawImage(this.sun, 0, 0);
  }
}
