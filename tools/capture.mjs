// Regenerates every image in docs/images from the running game.
//   python3 -m http.server 8765   (in another terminal)
//   npm run capture
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { launch, openLab, canvasPng, BASE } from './browser.mjs';

const OUT = 'docs/images';
const TMP = 'docs/.frames';
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];
const want = (n) => !only || only.split(',').includes(n);

const browser = await launch();

async function gif(name, query, script, { every = 2, scale = 2, crop } = {}) {
  if (!want(name)) return;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const page = await openLab(browser, query);
  let n = 0;
  const shot = async () => fs.writeFileSync(path.join(dir, String(n++).padStart(4, '0') + '.png'), await canvasPng(page));
  // script: list of [ticks, walkTo?]
  for (const [ticks, to] of script) {
    if (to) await page.evaluate((x, y) => lab.walkTo(x, y), to[0], to[1]);
    for (let t = 0; t < ticks; t += every) { await page.evaluate((k) => lab.step(k), every); await shot(); }
  }
  await page.close();
  const args = [path.join('tools', 'make_gif.py'), dir, path.join(OUT, name + '.gif'), String(scale), String(Math.round(every * 1000 / 60))];
  if (crop) args.push(crop.join(','));
  execFileSync('python3', args, { stdio: 'inherit' });
}

async function still(name, query, ticks, { viewport, scale = 3, to } = {}) {
  if (!want(name)) return;
  const page = await openLab(browser, query, viewport);
  if (to) await page.evaluate((x, y) => lab.walkTo(x, y), to[0], to[1]);
  await page.evaluate((k) => lab.step(k), ticks);
  const file = path.join(OUT, name + '.png');
  if (viewport) {
    await page.screenshot({ path: file });
  } else {
    fs.writeFileSync(path.join(TMP, name + '.png'), await canvasPng(page));
    execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${TMP}/${name}.png'); im.resize((im.width*${scale}, im.height*${scale}), Image.NEAREST).save('${file}')`]);
  }
  console.log(file);
  await page.close();
}

async function figure(name) {
  if (!want('fig-' + name)) return;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}?fig=${name}`, { waitUntil: 'load' });
  await page.waitForFunction('window.labReady === true', { polling: 100 });
  fs.writeFileSync(path.join(OUT, `fig-${name}.png`), await canvasPng(page));
  console.log(`${OUT}/fig-${name}.png`);
  await page.close();
}
fs.mkdirSync(TMP, { recursive: true });

// --- hero: a walk through the big patch
await gif('hero', 'px=40&py=118', [[30, null], [150, [150, 112]], [70, [175, 74]], [110, [262, 128]], [40, null]]);
// --- debug view: zones, lean vectors, magnifier (page screenshot at 3x)
if (want('debug')) {
  const page = await openLab(browser, 'px=60&py=110&debug=1&magnify=1&scale=3', { width: 1200, height: 675 });
  await page.evaluate(() => { lab.walkTo(150, 104); lab.step(150); });
  await page.screenshot({ path: path.join(OUT, 'debug.png') });
  console.log(OUT + '/debug.png');
  await page.close();
}
// --- debug close-up (page screenshot at 6x, clipped around the player)
if (want('debug-zoom')) {
  const page = await openLab(browser, 'px=60&py=110&debug=1&fx=0&scale=5', { width: 2000, height: 1125 });
  await page.evaluate(() => { lab.walkTo(150, 104); lab.step(150); });
  const f = await page.evaluate(() => lab.game.feet);
  // (clipped screenshots drop the overlay canvas in headless Chrome, so crop afterwards)
  await page.screenshot({ path: path.join(TMP, 'dz.png') });
  execFileSync('python3', ['-c', `from PIL import Image; Image.open('${TMP}/dz.png').crop((${(f.x - 52) * 5}, ${(f.y - 34) * 5}, ${(f.x + 52) * 5}, ${(f.y + 18) * 5})).save('${OUT}/debug-zoom.png')`]);
  console.log(OUT + '/debug-zoom.png');
  await page.close();
}
// --- debug gif (cropped page shots)
if (want('debug-gif')) {
  const dir = path.join(TMP, 'debug-gif');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const page = await openLab(browser, 'px=70&py=96&debug=1&fx=0&scale=4', { width: 1600, height: 900 });
  await page.evaluate(() => lab.walkTo(200, 96));
  for (let i = 0; i < 100; i++) {
    await page.evaluate(() => lab.step(2));
    await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.png') });
  }
  await page.close();
  execFileSync('python3', ['tools/make_gif.py', dir, OUT + '/debug.gif', '1', '33', '240,250,880,450'], { stdio: 'inherit' });
}
// --- trample + regrowth, close crop
await gif('trample', 'px=96&py=100&fx=0&wind=0', [[20, null], [130, [210, 100]], [80, null]], { scale: 4, crop: [80, 56, 230, 118] });
// --- wind only
await gif('wind', 'px=360&py=200&fx=0', [[240, null]], { every: 3, scale: 4, crop: [60, 50, 250, 130] });
// --- wading cut on/off side by side
if (want('wade-compare')) {
  for (const w of [0, 1]) await still(`wade-${w}`, `px=150&py=100&fx=0&wind=0&wade=${w}`, 90, { scale: 1 });
  execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
a=Image.open('${OUT}/wade-0.png').crop((122,62,178,108)); b=Image.open('${OUT}/wade-1.png').crop((122,62,178,108))
z=7; W,H=a.width*z,a.height*z
out=Image.new('RGB',(W*2+24,H),(13,26,20)); out.paste(a.resize((W,H),Image.NEAREST),(0,0)); out.paste(b.resize((W,H),Image.NEAREST),(W+24,0))
out.save('${OUT}/wade-compare.png')
import os; os.remove('${OUT}/wade-0.png'); os.remove('${OUT}/wade-1.png')
`]);
  console.log(OUT + '/wade-compare.png');
}
// --- full scene still
await still('scene', 'px=230&py=150', 60);
for (const f of ['tufts', 'bend', 'trample', 'player', 'cut']) await figure(f);

await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
