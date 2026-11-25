import { Game, W, H, DT } from './game.js';
import { PARAMS, DEFAULT_PARAMS, lookStats, lookCacheSize } from './grass.js';
import { drawDebug, drawMagnifier } from './debug.js';

const q = new URLSearchParams(location.search);
const capture = q.has('capture');
if (capture) document.body.classList.add('capture');
if (q.has('clean')) document.body.classList.add('clean');

if (q.has('fig')) {
  import('./figures.js').then((m) => m.renderFigure(q.get('fig')));
} else {
  start();
}

function start() {
  const game = new Game(Number(q.get('seed') || 1));
  for (const k of Object.keys(game.flags)) if (q.has(k)) game.flags[k] = q.get(k) !== '0';
  if (q.has('px')) game.player.x = Number(q.get('px'));
  if (q.has('py')) game.player.y = Number(q.get('py'));

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const octx = overlay.getContext('2d');
  let scale = 1, dpr = 1;

  function resize() {
    const forced = Number(q.get('scale'));
    const availW = innerWidth - (capture ? 0 : 24), availH = innerHeight - (capture ? 0 : 24);
    let s = Math.min(availW / W, availH / H);
    if (s >= 1) s = Math.floor(s);
    scale = forced || Math.max(0.5, s);
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
    dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(W * scale * dpr);
    overlay.height = Math.round(H * scale * dpr);
    overlay.style.width = `${W * scale}px`;
    overlay.style.height = `${H * scale}px`;
  }
  addEventListener('resize', resize);
  resize();

  // ---------------- i18n ----------------
  const STR = {
    ja: { sub: '草むらを歩いてみよう — WASD / 矢印キー / クリック・タップで移動', interact: '草の反応', wade: '足元カット',
      wind: '風', fx: '光とエフェクト', debug: 'デバッグ表示', magnify: '拡大鏡', params: 'パラメータ', reset: '初期値に戻す', close: '閉じる' },
    en: { sub: 'Walk through the grass — WASD / arrow keys / click or tap to move', interact: 'Grass reacts', wade: 'Wading cut',
      wind: 'Wind', fx: 'Light & FX', debug: 'Debug view', magnify: 'Magnifier', params: 'Params', reset: 'Reset', close: 'Close' },
  };
  let lang = q.get('lang') || (navigator.language.startsWith('ja') ? 'ja' : 'en');
  const langBtn = document.getElementById('langBtn');
  function applyLang() {
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = STR[lang][el.dataset.i18n];
    langBtn.textContent = lang === 'ja' ? 'EN' : '日本語';
    buildParams();
  }
  langBtn.onclick = () => { lang = lang === 'ja' ? 'en' : 'ja'; applyLang(); };

  // ---------------- toggles ----------------
  const buttons = [...document.querySelectorAll('[data-flag]')];
  function syncButtons() {
    for (const b of buttons) {
      const on = game.flags[b.dataset.flag];
      b.classList.toggle('on', on); b.classList.toggle('off', !on);
    }
  }
  for (const b of buttons) b.onclick = () => { game.flags[b.dataset.flag] = !game.flags[b.dataset.flag]; syncButtons(); b.blur(); };
  syncButtons();

  // ---------------- params panel ----------------
  const paramsEl = document.getElementById('params');
  const paramsBtn = document.getElementById('paramsBtn');
  const GROUPS = [
    { ja: 'ばね (Lean)', en: 'Spring (lean)', keys: [['leanPx', 0, 12, 0.5], ['springHz', 0.5, 6, 0.1], ['damping', 0.02, 1, 0.01], ['frontLeanPx', 0, 7, 0.5], ['feelX', 4, 20, 1]] },
    { ja: '踏みつけ (Trample)', en: 'Trample', keys: [['pressTime', 0.02, 0.6, 0.01], ['recoverTime', 0.1, 3, 0.05], ['pressSquash', 0, 0.9, 0.01]] },
    { ja: '揺れ (Rustle)', en: 'Rustle', keys: [['shakePx', 0, 4, 0.1], ['shakeSpeed', 10, 90, 1], ['touchCooldown', 0.1, 2, 0.05]] },
    { ja: '風 (拡張)', en: 'Wind (extension)', keys: [['windPx', 0, 3, 0.1], ['windSpeed', 0.2, 3, 0.1]] },
  ];
  function buildParams() {
    paramsEl.innerHTML = '';
    for (const g of GROUPS) {
      const h = document.createElement('h2'); h.textContent = g[lang]; paramsEl.append(h);
      for (const [key, min, max, step] of g.keys) {
        const l = document.createElement('label');
        const out = document.createElement('output');
        const inp = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: PARAMS[key] });
        out.textContent = PARAMS[key];
        inp.oninput = () => { PARAMS[key] = Number(inp.value); out.textContent = inp.value; };
        l.append(key, out, inp);
        paramsEl.append(l);
      }
    }
    const row = document.createElement('div'); row.className = 'row';
    const reset = Object.assign(document.createElement('button'), { textContent: STR[lang].reset });
    reset.onclick = () => { Object.assign(PARAMS, DEFAULT_PARAMS); buildParams(); };
    const close = Object.assign(document.createElement('button'), { textContent: STR[lang].close });
    close.onclick = () => paramsEl.classList.add('hidden');
    row.append(reset, close); paramsEl.append(row);
  }
  paramsBtn.onclick = () => { paramsEl.classList.toggle('hidden'); paramsBtn.blur(); };
  applyLang();

  // ---------------- input ----------------
  const keys = new Set();
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); game.target = null; e.preventDefault(); return; }
    const b = document.querySelector(`[data-key="${e.key.toUpperCase()}"]`);
    if (b) b.click();
  });
  addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  addEventListener('blur', () => keys.clear());
  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  let dragging = false;
  stage.addEventListener('pointerdown', (e) => { dragging = true; game.target = toWorld(e); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', (e) => { if (dragging) game.target = toWorld(e); });
  stage.addEventListener('pointerup', () => { dragging = false; });
  function readInput() {
    game.input.x = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    game.input.y = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
  }

  // ---------------- loop ----------------
  const statsEl = document.getElementById('stats');
  let acc = 0, last = performance.now(), fpsT = 0, fpsN = 0, fps = 0, renderMs = 0;
  function draw() {
    const t0 = performance.now();
    lookStats.built = 0; lookStats.cached = 0;
    game.renderFrame();
    game.present(ctx);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const s = scale * dpr;
    if (game.flags.debug) drawDebug(octx, game, s);
    if (game.flags.magnify) drawMagnifier(octx, game, canvas, s, lang);
    renderMs = renderMs * 0.9 + (performance.now() - t0) * 0.1;
  }
  function frame(t) {
    readInput();
    acc += Math.min(0.1, (t - last) / 1000);
    last = t;
    while (acc >= DT) { game.tick(); acc -= DT; }
    draw();
    fpsN++; fpsT += 1;
    if (t - (frame.t0 || 0) > 500) { fps = Math.round((fpsN * 1000) / (t - (frame.t0 || t - 500))); fpsN = 0; frame.t0 = t; }
    statsEl.textContent = `${fps} fps · render ${renderMs.toFixed(2)} ms · tufts ${game.world.tufts.length} · looks cached ${lookCacheSize()} · built this frame ${lookStats.built} · rustles ${game.rustles}`;
    requestAnimationFrame(frame);
  }

  // Deterministic stepping API used by tools/capture.mjs
  window.lab = {
    game, PARAMS,
    step(n = 1, input) { if (input) Object.assign(game.input, input); for (let i = 0; i < n; i++) game.tick(); draw(); },
    walkTo(x, y) { game.target = { x, y }; },
    set(flags) { Object.assign(game.flags, flags); syncButtons(); draw(); },
    draw,
  };

  if (capture) { draw(); window.labReady = true; }
  else requestAnimationFrame((t) => { last = t; frame(t); });
}
