// "Wading cut": hide the parts of the player's frame that y-sort alone would
// leak through the gaps between the tufts in front of him.

export const TIP_SHOW = 2;       // keep 2 rows under the highest covering grass pixel
export const SMOOTH_COLUMNS = 5; // min over a 5-column window
export const MAX_HIDE = 13;      // never hide more than 13 rows above the feet
export const MIN_PIECE = 12;     // drop leftover islands smaller than 12 px

/**
 * frame: {w(=n), h(=n), data} — the current animation frame, feet on the bottom row.
 * ox, oy: world position of the frame's top-left pixel.
 * front: [{look, lx, ly}] — drawn images of the tufts sorted in front of him,
 *        with the world position of each image's top-left pixel.
 * Returns the cut frame plus every intermediate for the debug views.
 */
export function wadingCut(frame, ox, oy, front) {
  const n = frame.w, H = frame.h;
  const covered = new Uint8Array(n * H);

  // 1. cover pass — every opaque pixel of every front tuft, in frame space
  for (const f of front) {
    const { w, h, data } = f.look;
    for (let j = 0; j < h; j++) {
      const fy = f.ly + j - oy;
      if (fy < 0 || fy >= H) continue;
      for (let i = 0; i < w; i++) {
        if (!(data[j * w + i] >>> 24)) continue;
        const fx = f.lx + i - ox;
        if (fx >= 0 && fx < n) covered[fy * n + fx] = 1;
      }
    }
  }

  // 2. per column: top-most covered row + TIP_SHOW
  const raw = new Int16Array(n);
  for (let c = 0; c < n; c++) {
    let top = -1;
    for (let r = 0; r < H; r++) if (covered[r * n + c]) { top = r; break; }
    raw[c] = top < 0 ? H : top + TIP_SHOW;
  }

  // 3. smoothing: min over c-2..c+2, mirror-indexed
  const half = SMOOTH_COLUMNS >> 1;
  const smooth = new Int16Array(n);
  for (let c = 0; c < n; c++) {
    let m = H;
    for (let k = -half; k <= half; k++) {
      let cc = c + k;
      if (cc < 0) cc = -cc;
      if (cc >= n) cc = 2 * (n - 1) - cc;
      m = Math.min(m, raw[cc]);
    }
    smooth[c] = m;
  }

  // 4. depth limit: never hide more than MAX_HIDE rows above the lowest opaque row
  let lowest = 0;
  for (let r = H - 1; r >= 0 && !lowest; r--) for (let c = 0; c < n; c++) if (frame.data[r * n + c] >>> 24) { lowest = r; break; }
  const cut = new Int16Array(n);
  for (let c = 0; c < n; c++) cut[c] = Math.max(smooth[c], lowest + 1 - MAX_HIDE);

  // 5. hide rows >= cut, then drop tiny 8-connected islands
  const out = new Uint32Array(frame.data);
  const hidden = new Uint8Array(n * H); // 1 = removed by the cut, 2 = removed as small piece
  for (let c = 0; c < n; c++) for (let r = cut[c]; r < H; r++) {
    const i = r * n + c;
    if (out[i] >>> 24) { out[i] = 0; hidden[i] = 1; }
  }
  const seen = new Uint8Array(n * H);
  const stack = [];
  for (let s = 0; s < n * H; s++) {
    if (seen[s] || !(out[s] >>> 24)) continue;
    const piece = [];
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      piece.push(p);
      const px = p % n, py = (p / n) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= n || y >= H) continue;
        const q = y * n + x;
        if (!seen[q] && out[q] >>> 24) { seen[q] = 1; stack.push(q); }
      }
    }
    if (piece.length < MIN_PIECE) for (const p of piece) { out[p] = 0; hidden[p] = 2; }
  }

  return { frame: { w: n, h: H, data: out }, covered, raw, smooth, cut, hidden, lowest };
}
