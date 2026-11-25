// README figures, rendered by the same modules the game uses (?fig=<name>).

import { ART, TW, TH, DESIGN_COUNT, artId } from './tufts.js';
import { LUT, CLEAR, PATCH_GROUND } from './palette.js';
import { buildLook, tuftState, makeTuft, rowShift } from './grass.js';
import { PLAYER_ART, N } from './player.js';
import { Game, W } from './game.js';
import { TIP_SHOW, MAX_HIDE } from './wade.js';

const BG = '#0d1a14', INK = '#e6f2d8', MUTED = '#9db58e', ACC = '#a5d35c';
const hex = (c) => `rgb(${c & 255},${(c >>> 8) & 255},${(c >>> 16) & 255})`;

function setup(w, h) {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:' + BG;
  const c = document.createElement('canvas');
  c.id = 'game'; c.width = w; c.height = h;
  document.body.append(c);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);
  return ctx;
}
const text = (ctx, s, x, y, size = 16, color = INK, align = 'left') => {
  ctx.font = `${size}px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y); ctx.textAlign = 'left';
};
function drawPixels(ctx, data, w, h, x, y, z) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = data[j * w + i];
    if (!(c >>> 24)) continue;
    ctx.fillStyle = hex(c); ctx.fillRect(x + i * z, y + j * z, z, z);
  }
}
function drawGrid(ctx, grid, x, y, z) {
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = grid[j * TW + i];
    if (c === CLEAR) continue;
    ctx.fillStyle = hex(LUT[c]); ctx.fillRect(x + i * z, y + j * z, z, z);
  }
}
const cell = (ctx, x, y, w, h) => { ctx.fillStyle = hex(PATCH_GROUND); ctx.fillRect(x, y, w, h); };

const FIGS = {
  tufts() {
    const z = 6, cw = TW * z + 18, ch = TH * z + 16;
    const rows = [['normal', 0, false], ['dark1', 1, false], ['dark2', 2, false], ['flipped', 0, true]];
    const ctx = setup(130 + DESIGN_COUNT * cw, 60 + rows.length * ch);
    text(ctx, 'tuft art · 16×18 px · 4 designs (+ flowered) × flip × 3 shades', 16, 30, 18, ACC);
    rows.forEach(([label, shade, flip], r) => {
      text(ctx, label, 16, 60 + r * ch + ch / 2 + 4, 15, MUTED);
      for (let d = 0; d < DESIGN_COUNT; d++) {
        const x = 120 + d * cw, y = 48 + r * ch;
        cell(ctx, x, y, cw - 8, ch - 6);
        drawGrid(ctx, ART[artId(d, flip, shade)], x + 5, y + 5, z);
      }
    });
  },

  bend() {
    const z = 7, totals = [0, 2, 4, 6, 8, -6];
    const cw = (TW + 20) * z, ch = TH * z + 90;
    const ctx = setup(totals.length * cw + 20, ch + 70);
    text(ctx, 'bend: row shift = round(total · ((h−1−r)/(h−1))^1.6) — tip moves most, base stays', 16, 30, 17, ACC);
    totals.forEach((t, k) => {
      const look = buildLook(ART[0], TH, t);
      const x = 10 + k * cw, y = 56;
      cell(ctx, x, y, cw - 14, TH * z + 20);
      const ox = x + ((cw - 14) - look.w * z) / 2;
      drawPixels(ctx, look.data, look.w, look.h, ox, y + 10, z);
      // base marker
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(ox + (look.pad + 8) * z - 1, y + 10, 2, TH * z);
      text(ctx, `total ${t > 0 ? '+' : ''}${t} px`, x + (cw - 14) / 2, y + TH * z + 48, 15, INK, 'center');
      const shifts = Array.from({ length: TH }, (_, r) => rowShift(t, TH, r));
      text(ctx, `tip ${shifts[0]} · mid ${shifts[9]} · base ${shifts[17]}`, x + (cw - 14) / 2, y + TH * z + 70, 13, MUTED, 'center');
    });
  },

  trample() {
    const z = 7, ps = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const cw = (TW + 6) * z, ch = TH * z + 90;
    const ctx = setup(ps.length * cw + 20, ch + 70);
    text(ctx, 'trample: h = max(1, round(18 · (1 − 0.67·smoothstep(press)))) + shade steps', 16, 30, 17, ACC);
    ps.forEach((p, k) => {
      const t = makeTuft(0, 0, 1, false, 0.5);
      t.press = p;
      const st = tuftState(t, 0, false);
      const look = buildLook(ART[st.art], st.h2, 0);
      const x = 10 + k * cw, y = 56;
      cell(ctx, x, y, cw - 14, TH * z + 20);
      drawPixels(ctx, look.data, look.w, look.h, x + ((cw - 14) - look.w * z) / 2, y + 10 + (TH - look.h) * z, z);
      text(ctx, `press ${p.toFixed(1)}`, x + (cw - 14) / 2, y + TH * z + 48, 15, INK, 'center');
      text(ctx, `h ${st.h2}px · ${['normal', 'dark1', 'dark2'][st.shade]}`, x + (cw - 14) / 2, y + TH * z + 70, 13, MUTED, 'center');
    });
  },

  player() {
    const z = 4, dirs = ['down', 'right', 'up', 'left'];
    const ctx = setup(130 + 8 * (N * z + 8), 50 + dirs.length * (N * z + 8));
    text(ctx, 'player · 32×32 · 8-frame walk · left = flipped right', 16, 30, 18, ACC);
    dirs.forEach((d, r) => {
      text(ctx, d, 16, 50 + r * (N * z + 8) + N * z / 2 + 6, 15, MUTED);
      for (let f = 0; f < 8; f++) {
        const x = 110 + f * (N * z + 8), y = 44 + r * (N * z + 8);
        ctx.fillStyle = '#1a3326'; ctx.fillRect(x, y, N * z, N * z);
        const s = PLAYER_ART.frames[d][f];
        drawPixels(ctx, s.data, N, N, x, y, z);
      }
    });
  },

  // The wading cut, step by step, on a real frame from the game.
  cut() {
    const game = new Game(1);
    game.flags.fx = false; game.flags.wind = false;
    game.player.x = 150; game.player.y = 100; game.player.dir = 'down';
    for (let i = 0; i < 90; i++) game.tick();
    game.flags.wade = false; game.renderFrame();
    const before = new Uint32Array(game.fb);
    game.flags.wade = true; game.renderFrame();
    const after = new Uint32Array(game.fb);
    const cut = game.lastCut;
    const frame = game.frameSprite();

    const z = 6, span = 44;
    const sx = cut.ox - 6, sy = cut.oy - 4;
    const crop = (buf) => {
      const out = new Uint32Array(span * span);
      for (let j = 0; j < span; j++) for (let i = 0; i < span; i++) out[j * span + i] = buf[(sy + j) * W + sx + i];
      return out;
    };
    const P = span * z, gap = 70;
    const ctx = setup(16 + 3 * (P + gap), 70 + 2 * (P + 70));
    text(ctx, 'wading cut · TIP_SHOW 2 · SMOOTH 5 cols · MAX_HIDE 13 · MIN_PIECE 12', 16, 32, 18, ACC);
    const panel = (k, title, sub, draw) => {
      const x = 16 + (k % 3) * (P + gap), y = 56 + Math.floor(k / 3) * (P + 70);
      ctx.fillStyle = '#050a08'; ctx.fillRect(x - 2, y - 2, P + 4, P + 4);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, P, P); ctx.clip();
      draw(x, y);
      ctx.restore();
      text(ctx, title, x, y + P + 24, 16, INK);
      text(ctx, sub, x, y + P + 46, 13, MUTED);
    };
    const fx = (x) => x + (cut.ox - sx) * z, fy = (y) => y + (cut.oy - sy) * z;
    const frameBg = (x, y) => { ctx.fillStyle = '#1a3326'; ctx.fillRect(x, y, P, P); };
    const cutLine = (x, y, arr, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
      for (let c = 0; c < N; c++) {
        const yy = fy(y) + Math.min(N, arr[c]) * z;
        if (c === 0) ctx.moveTo(fx(x), yy); else ctx.lineTo(fx(x) + c * z, yy);
        ctx.lineTo(fx(x) + (c + 1) * z, yy);
      }
      ctx.stroke();
    };

    panel(0, '1. y-sort only', 'legs leak through gaps', (x, y) => drawPixels(ctx, crop(before), span, span, x, y, z));
    panel(1, '2. cover pass', 'front tuft pixels in frame space', (x, y) => {
      frameBg(x, y);
      drawPixels(ctx, frame.data, N, N, fx(x), fy(y), z);
      ctx.fillStyle = 'rgba(120,230,110,0.55)';
      for (let i = 0; i < N * N; i++) if (cut.covered[i]) ctx.fillRect(fx(x) + (i % N) * z, fy(y) + ((i / N) | 0) * z, z, z);
    });
    panel(2, '3. top covered + TIP_SHOW', 'per column', (x, y) => {
      frameBg(x, y);
      drawPixels(ctx, frame.data, N, N, fx(x), fy(y), z);
      cutLine(x, y, cut.raw, '#ff6a6a');
    });
    panel(3, '4. smooth + depth limit', `min of 5 cols · max ${MAX_HIDE} rows`, (x, y) => {
      frameBg(x, y);
      drawPixels(ctx, frame.data, N, N, fx(x), fy(y), z);
      cutLine(x, y, cut.raw, 'rgba(255,106,106,0.45)');
      cutLine(x, y, cut.cut, '#ffe14a');
      ctx.strokeStyle = 'rgba(126,224,255,0.8)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
      const ly = fy(y) + (cut.lowest + 1 - MAX_HIDE) * z;
      ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + P, ly); ctx.stroke(); ctx.setLineDash([]);
    });
    panel(4, '5. hide + drop islands', 'magenta: cut · orange: tiny piece', (x, y) => {
      frameBg(x, y);
      drawPixels(ctx, cut.frame.data, N, N, fx(x), fy(y), z);
      for (let i = 0; i < N * N; i++) {
        if (!cut.hidden[i]) continue;
        ctx.fillStyle = cut.hidden[i] === 1 ? 'rgba(255,60,200,0.6)' : 'rgba(255,170,40,0.85)';
        ctx.fillRect(fx(x) + (i % N) * z, fy(y) + ((i / N) | 0) * z, z, z);
      }
    });
    panel(5, '6. result', 'he wades through the grass', (x, y) => drawPixels(ctx, crop(after), span, span, x, y, z));
    void TIP_SHOW;
  },
};

export function renderFigure(name) {
  (FIGS[name] || FIGS.tufts)();
  window.labReady = true;
}
