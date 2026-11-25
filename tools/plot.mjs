// docs/images/spring.svg — lean (px) per tick from src/grass.js, article scenario.
import fs from 'fs';
import { makeTuft, tickGrass } from '../src/grass.js';
const dt = 1 / 60, t = makeTuft(7, -3, 0, false, 0.3);
const data = []; let now = 0;
for (let i = 0; i < 120; i++) {
  now += dt;
  tickGrass([t], dt, now, i < 60 ? { x: 0, y: 0 } : { x: 999, y: 999 }, true);
  data.push(t.lean);
}
const Wd = 760, Ht = 300, L = 52, R = 20, T = 40, B = 46;
const x = (i) => L + (i / 119) * (Wd - L - R);
const y = (v) => T + ((8 - v) / 11) * (Ht - T - B);
const path = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
const peak = data.slice(0, 60).reduce((m, v, i) => (v > m.v ? { v, i } : m), { v: -1, i: 0 });
const low = data.slice(60).reduce((m, v, i) => (v < m.v ? { v, i: i + 60 } : m), { v: 9, i: 0 });
const grid = [-2, 0, 2, 4, 6, 8].map((v) => `<line x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}" stroke="#24392e"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${Ht}" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#9db58e">
<rect width="${Wd}" height="${Ht}" rx="10" fill="#0d1a14"/>
<text x="${L}" y="24" fill="#a5d35c" font-size="14">lean (px) per 60 Hz tick — dx = 7, dy = −3, player leaves at tick 60</text>
${grid}
<line x1="${x(0)}" x2="${x(59)}" y1="${y(4.667)}" y2="${y(4.667)}" stroke="#ffd35a" stroke-dasharray="5 4"/>
<text x="${x(30)}" y="${y(4.667) + 16}" fill="#ffd35a">target 4.67</text>
<line x1="${x(60)}" x2="${x(60)}" y1="${T}" y2="${Ht - B}" stroke="#ff7bf2" stroke-dasharray="3 4"/>
<text x="${x(60) + 6}" y="${T + 12}" fill="#ff7bf2">player leaves</text>
<path d="${path}" fill="none" stroke="#7ee0ff" stroke-width="2.5"/>
<circle cx="${x(peak.i)}" cy="${y(peak.v)}" r="4" fill="#7ee0ff"/><text x="${x(peak.i) + 8}" y="${y(peak.v) - 6}" fill="#e6f2d8">peak ${peak.v.toFixed(2)} @ tick ${peak.i + 1}</text>
<circle cx="${x(low.i)}" cy="${y(low.v)}" r="4" fill="#7ee0ff"/><text x="${x(low.i) + 8}" y="${y(low.v) + 16}" fill="#e6f2d8">${low.v.toFixed(2)} overshoot</text>
${[0, 20, 40, 60, 80, 100, 120].map((i) => `<text x="${x(Math.min(i, 119))}" y="${Ht - B + 18}" text-anchor="middle">${i}</text>`).join('')}
<text x="${(Wd + L) / 2}" y="${Ht - 8}" text-anchor="middle">tick</text>
</svg>`;
fs.writeFileSync('docs/images/spring.svg', svg);
console.log('docs/images/spring.svg', peak, low);
