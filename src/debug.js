// Debug overlays drawn at display resolution on top of the pixel canvas.

import { PARAMS } from './grass.js';
import { N } from './player.js';

const font = (s, px) => `${Math.max(9, Math.round(px * s * 0.62))}px ui-monospace, Menlo, monospace`;

export function drawDebug(c, game, s) {
  const P = PARAMS;
  const { x: fx, y: fy } = game.feet;
  const X = (x) => x * s, Y = (y) => y * s;
  c.save();
  c.lineWidth = Math.max(1, s / 3);

  // zones are drawn in "tuft base" space: a tuft is affected when its base pixel is inside
  const zone = (x0, y0, x1, y1, stroke, fill, label) => {
    c.fillStyle = fill; c.strokeStyle = stroke;
    c.fillRect(X(x0), Y(y0), X(x1 - x0), Y(y1 - y0));
    c.setLineDash([s, s * 0.6]);
    c.strokeRect(X(x0), Y(y0), X(x1 - x0), Y(y1 - y0));
    c.setLineDash([]);
    if (label) { c.fillStyle = stroke; c.font = font(s, 5); c.fillText(label, X(x1) + s, Y(y0) + s * 3); }
  };
  zone(fx - P.feelX, fy - P.feelBack, fx + P.feelX, fy + P.feelFront, '#7ee0ff', 'rgba(126,224,255,0.08)', 'feel');
  zone(fx - P.pressX, fy - P.pressBack, fx + P.pressX, fy - 1 + 1, '#ff6a6a', 'rgba(255,106,106,0.14)', 'press');
  zone(fx - P.frontX, fy - 1 + 1, fx + P.frontX, fy + P.feelFront, '#ffd35a', 'rgba(255,211,90,0.10)', 'front ±2');

  // sort line: player sorts at feet.y - sortOffset
  c.strokeStyle = '#ff7bf2';
  c.beginPath(); c.moveTo(X(fx - 20), Y(fy - P.sortOffset + 0.5)); c.lineTo(X(fx + 20), Y(fy - P.sortOffset + 0.5)); c.stroke();
  c.fillStyle = '#ff7bf2'; c.font = font(s, 5); c.textAlign = 'right'; c.fillText('sort y', X(fx - 21), Y(fy - P.sortOffset) + s * 1.5); c.textAlign = 'left';

  // tuft bases + lean vectors
  for (const t of game.world.tufts) {
    const st = t._st; if (!st) continue;
    let color = 'rgba(255,255,255,0.55)';
    if (t.edge) color = '#ffa040';
    if (t.press > 0.01) color = `rgba(255,${Math.round(90 - 60 * t.press)},${Math.round(90 - 60 * t.press)},1)`;
    c.fillStyle = color;
    c.fillRect(X(t.x) - s * 0.5, Y(t.y), s, s);
    if (Math.abs(t.lean) > 0.3) {
      c.strokeStyle = '#7ee0ff';
      c.beginPath(); c.moveTo(X(t.x + 0.5), Y(t.y + 0.5)); c.lineTo(X(t.x + 0.5 + t.lean), Y(t.y + 0.5 - st.h2 + 1)); c.stroke();
    }
  }

  // feet
  c.fillStyle = '#ffffff';
  c.fillRect(X(fx) - s * 0.5, Y(fy) - s * 0.5, s * 1.5, s * 1.5);

  // legend
  c.font = font(s, 7);
  const items = [['#7ee0ff', 'feel zone → lean'], ['#ff6a6a', 'press zone → trample'], ['#ffd35a', 'front tufts: lean clamp ±2'], ['#ffa040', 'edge tuft (never flattens)'], ['#ff7bf2', 'player sort line (feet − 1)']];
  const lh = Math.max(12, s * 5.5);
  const lx = X(4), ly = Y(H(game) - 4) - (items.length - 1) * lh;
  c.fillStyle = 'rgba(6,14,12,0.8)';
  c.fillRect(lx - 6, ly - lh, lh * 15, items.length * lh + lh * 0.5);
  items.forEach(([col, txt], i) => {
    c.fillStyle = col; c.fillRect(lx, ly + i * lh - lh * 0.6, lh * 0.5, lh * 0.5);
    c.fillStyle = '#e6f2d8'; c.fillText(txt, lx + lh * 0.9, ly + i * lh);
  });
  c.restore();
}
const H = (game) => game.fb.length / 400;

/** 4x zoom around the player with the wading cut visualised. */
export function drawMagnifier(c, game, canvas, s, lang) {
  const cut = game.lastCut;
  const { x: fx, y: fy } = game.feet;
  const span = 40, z = Math.max(3, Math.round(s * 2));
  const sx = fx - span / 2, sy = fy - span + 2;
  const size = span * z;
  const px = c.canvas.width - size - 12 * s / 3, py = c.canvas.height - size - 12 * s / 3;
  c.save();
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#050a08';
  c.fillRect(px - 3, py - 3, size + 6, size + 6);
  c.drawImage(canvas, sx, sy, span, span, px, py, size, size);
  if (cut) {
    const ox = cut.ox - sx, oy = cut.oy - sy;
    // hidden pixels ghosted in magenta
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const h = cut.hidden[r * N + col];
      if (!h) continue;
      c.fillStyle = h === 1 ? 'rgba(255,60,200,0.55)' : 'rgba(255,170,40,0.7)';
      c.fillRect(px + (ox + col) * z, py + (oy + r) * z, z, z);
    }
    // cut line
    c.strokeStyle = '#ffe14a'; c.lineWidth = Math.max(1, z / 4);
    c.beginPath();
    for (let col = 0; col < N; col++) {
      const y = Math.min(N, cut.cut[col]);
      const x0 = px + (ox + col) * z, yy = py + (oy + y) * z;
      if (col === 0) c.moveTo(x0, yy); else c.lineTo(x0, yy);
      c.lineTo(x0 + z, yy);
    }
    c.stroke();
  }
  c.fillStyle = '#e6f2d8';
  c.font = font(s, 7);
  const lh = Math.max(11, s * 5);
  c.fillStyle = 'rgba(5,10,8,0.78)'; c.fillRect(px, py, size, lh * 2.5);
  c.fillStyle = '#e6f2d8';
  c.fillText(lang === 'ja' ? '足元カット (拡大)' : 'wading cut (zoom)', px + 6, py + lh);
  const half = lang === 'ja' ? 5.5 : 6;
  c.fillStyle = '#ffe14a'; c.fillText(lang === 'ja' ? '— カット線' : '— cut line', px + 6, py + lh * 2.1);
  c.fillStyle = 'rgb(255,90,210)'; c.fillText(lang === 'ja' ? '■ 隠した画素' : '■ hidden px', px + 6 + lh * half, py + lh * 2.1);
  c.restore();
}
