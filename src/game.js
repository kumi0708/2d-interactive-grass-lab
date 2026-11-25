// Game state + one full frame of rendering into a CPU framebuffer.

import { buildWorld, W, H } from './world.js';
import { tickGrass, tuftState, getLook, PARAMS } from './grass.js';
import { PLAYER_ART, N } from './player.js';
import { wadingCut } from './wade.js';
import { blit, shadowEllipse } from './raster.js';
import { Particles, Butterflies, Lighting, waterGlints, pollen } from './fx.js';
import { mulberry32 } from './rng.js';

export { W, H };
export const DT = 1 / 60;
const SPEED = 54;

export class Game {
  constructor(seed = 1) {
    this.world = buildWorld(seed);
    this.fb = new Uint32Array(W * H);
    this.image = new ImageData(new Uint8ClampedArray(this.fb.buffer), W, H);
    this.flags = { interact: true, wade: true, wind: true, fx: true, debug: false, magnify: false };
    this.player = { x: 140, y: 120, dir: 'down', walkT: 0, moving: false, dustT: 0 };
    this.input = { x: 0, y: 0 };
    this.target = null;
    this.now = 0;
    this.ticks = 0;
    this.rng = mulberry32(seed * 3 + 7);
    this.particles = new Particles(seed + 11);
    this.butterflies = new Butterflies(4, W, H, seed + 5);
    this.lighting = typeof document !== 'undefined' ? new Lighting(W, H) : null;
    this.lastCut = null;
    this.rustles = 0;
    // Static drawables (tufts + props), sorted by base y once.
    this.statics = [
      ...this.world.tufts.map((t) => ({ kind: 'tuft', key: t.y, t })),
      ...this.world.props.map((p) => ({ kind: 'prop', key: p.sortY, p })),
    ].sort((a, b) => a.key - b.key);
  }

  get feet() { return { x: Math.round(this.player.x), y: Math.round(this.player.y) }; }

  free(x, y) {
    if (x < 6 || x > W - 6 || y < 30 || y > H - 2) return false;
    for (const c of this.world.colliders) if (Math.hypot(x - c.x, (y - c.y) * 1.6) < c.r + 2) return false;
    if (this.world.pondField(x, y) > -0.02) return false;
    return true;
  }

  tick() {
    const dt = DT;
    this.now += dt;
    this.ticks++;
    const p = this.player;

    // ---- movement (keyboard wins over click-to-move) ----
    let mx = this.input.x, my = this.input.y;
    if (!mx && !my && this.target) {
      const dx = this.target.x - p.x, dy = this.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 1.5) this.target = null; else { mx = dx / d; my = dy / d; }
    }
    const len = Math.hypot(mx, my);
    p.moving = len > 0.01;
    if (p.moving) {
      mx /= len; my /= len;
      const nx = p.x + mx * SPEED * dt, ny = p.y + my * SPEED * dt;
      let moved = false;
      if (this.free(nx, p.y)) { p.x = nx; moved = true; }
      if (this.free(p.x, ny)) { p.y = ny; moved = true; }
      if (!moved) this.target = null;
      if (Math.abs(mx) > Math.abs(my) * 1.05) p.dir = mx > 0 ? 'right' : 'left';
      else p.dir = my > 0 ? 'down' : 'up';
      p.walkT += dt;
      p.dustT -= dt;
      const k = this.world.kind[Math.round(p.y) * W + Math.round(p.x)];
      if (k === 2 && p.dustT <= 0 && this.flags.fx) { this.particles.dust(p.x, p.y); p.dustT = 0.18; }
    } else {
      p.walkT = 0;
    }

    // ---- grass ----
    tickGrass(this.world.tufts, dt, this.now, this.feet, this.flags.interact, (t) => {
      this.rustles++;
      if (this.flags.fx) this.particles.rustle(t.x + t.lean, t.y - 13, t.target);
    });

    // ---- ambient life ----
    if (this.flags.fx) {
      for (const pr of this.world.props) {
        if (pr.sprite.w === 64 && this.rng() < 0.012) {
          const x = pr.x + 12 + this.rng() * 40, y = pr.y + 10 + this.rng() * 28;
          this.particles.leaf(x, y, pr.y + 48 + this.rng() * 24);
        }
      }
      this.butterflies.update(dt, p);
    }
    this.particles.update(dt);
  }

  frameSprite() {
    const p = this.player;
    if (p.moving) return PLAYER_ART.frames[p.dir][Math.floor(p.walkT * 10) % 8];
    return PLAYER_ART.idle[p.dir][Math.floor(this.now * 2) % 8];
  }

  /** Render into the framebuffer. Returns info for debug views. */
  renderFrame() {
    const fb = this.fb;
    const now = this.now;
    const { fx, fy } = { fx: Math.round(this.player.x), fy: Math.round(this.player.y) };
    fb.set(this.world.ground);
    waterGlints(fb, this.world.waterPx, W, now);
    shadowEllipse(fb, W, H, fx + 0.5, fy - 0.5, 7, 2.6, 0.58);
    if (this.flags.fx) this.butterflies.drawShadows(fb, W, H);

    // tuft looks for this frame
    for (const s of this.statics) {
      if (s.kind !== 'tuft') continue;
      const t = s.t;
      const st = tuftState(t, now, this.flags.wind);
      const look = getLook(st);
      t._st = st; t._look = look;
      t._lx = t.x - 8 - look.pad;
      t._ly = t.y - look.h + 1;
    }

    // Y-sort: the player sorts as if his feet were sortOffset px higher and wins ties.
    const pkey = fy - PARAMS.sortOffset;
    let k = 0;
    while (k < this.statics.length && this.statics[k].key <= pkey) k++;

    // Player frame + wading cut
    const frame = this.frameSprite();
    const ox = fx - N / 2, oy = fy - N;
    let drawFrame = frame;
    this.lastCut = null;
    if (this.flags.wade) {
      const front = [];
      for (let i = k; i < this.statics.length; i++) {
        const s = this.statics[i];
        if (s.kind !== 'tuft') continue;
        const t = s.t;
        if (t.y - 18 > oy + N) break; // sorted by base y, nothing further can overlap
        if (t._lx < ox + N && t._lx + t._look.w > ox && t._ly + t._look.h > oy) front.push({ look: t._look, lx: t._lx, ly: t._ly });
      }
      const res = wadingCut(frame, ox, oy, front);
      drawFrame = res.frame;
      this.lastCut = { ...res, ox, oy, front: front.length };
    }
    this.sortInfo = { index: k, pkey };

    const drawStatic = (s) => {
      if (s.kind === 'tuft') blit(fb, W, H, s.t._look, s.t._lx, s.t._ly);
      else blit(fb, W, H, s.p.sprite, s.p.x, s.p.y);
    };
    for (let i = 0; i < k; i++) drawStatic(this.statics[i]);
    blit(fb, W, H, drawFrame, ox, oy);
    for (let i = k; i < this.statics.length; i++) drawStatic(this.statics[i]);

    if (this.flags.fx) {
      this.particles.draw(fb, W, H);
      this.butterflies.draw(fb, W, H);
      pollen(fb, W, H, now);
    } else {
      this.particles.draw(fb, W, H);
    }
  }

  present(ctx) {
    ctx.putImageData(this.image, 0, 0);
    if (this.flags.fx && this.lighting) this.lighting.draw(ctx, this.now);
  }
}
