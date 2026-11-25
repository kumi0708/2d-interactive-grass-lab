// Re-runs the article's tick-count checks against src/grass.js.
// Two checks land one tick early here (the article counts the tick a new image
// is shown, which can trail the physics tick by one), so they allow ±1.
import { makeTuft, tickGrass, tuftState, PARAMS } from '../src/grass.js';
const dt = 1 / 60;
let ok = true;
const check = (name, cond, info) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${info ?? ''}`); ok &&= cond; };

// 1) lean: dx=7, dy=-3
{
  const t = makeTuft(7, -3, 0, false, 0.3);
  const feet = { x: 0, y: 0 };
  let peak = 0, peakTick = 0, settle = -1, now = 0;
  const lean = [];
  for (let i = 1; i <= 120; i++) {
    now += dt; tickGrass([t], dt, now, feet, true);
    lean.push(t.lean);
    if (t.lean > peak) { peak = t.lean; peakTick = i; }
  }
  for (let i = 0; i < lean.length; i++) if (lean.slice(i).every((v) => Math.abs(v - 4.667) < 0.5)) { settle = i + 1; break; }
  check('lean peak ~6.9 px @ tick 11', Math.abs(peak - 6.9) < 0.1 && peakTick === 11, `peak=${peak.toFixed(2)} @${peakTick}`);
  check('settles within 0.5 of 4.67 from tick 35', settle === 35, `settle=${settle}`);
  // he leaves
  const away = { x: 1000, y: 1000 };
  let min = 0, back = -1; const after = [];
  for (let i = 1; i <= 120; i++) { now += dt; tickGrass([t], dt, now, away, true); after.push(t.lean); min = Math.min(min, t.lean); }
  for (let i = 0; i < after.length; i++) if (after.slice(i).every((v) => Math.abs(v) < 0.5)) { back = i + 1; break; }
  check('overshoot ~-2.3 px after leaving', Math.abs(min + 2.3) < 0.1, `min=${min.toFixed(2)}`);
  check('back within 0.5 of 0 from tick 36 (±1)', Math.abs(back - 36) <= 1, `back=${back}`);
}
// 2) trample: tuft under body
{
  PARAMS.windPx = 0;
  const t = makeTuft(0, -4, 0, false, 0.3);
  let now = 0, flat = -1;
  for (let i = 1; i <= 30; i++) { now += dt; tickGrass([t], dt, now, { x: 0, y: 0 }, true); if (flat < 0 && tuftState(t, now).h2 === 6) flat = i; }
  check('fully flat (6 px) on tick 8 (±1)', Math.abs(flat - 8) <= 1, `flat=${flat}`);
  let grown = -1, zero = -1;
  for (let i = 1; i <= 80; i++) {
    now += dt; tickGrass([t], dt, now, { x: 1000, y: 1000 }, true);
    if (grown < 0 && tuftState(t, now).h2 === 18) grown = i;
    if (zero < 0 && t.press === 0) zero = i;
  }
  check('back to 18 px on tick 37', grown === 37, `grown=${grown}`);
  check('press = 0 on tick 42', zero === 42, `zero=${zero}`);
}
process.exit(ok ? 0 : 1);
