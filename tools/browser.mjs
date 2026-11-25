// Shared headless-Chrome helper for the capture scripts.
import puppeteer from 'puppeteer-core';
export const BASE = process.env.LAB_URL || 'http://localhost:8765/';
export async function launch() {
  return puppeteer.launch({
    executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--hide-scrollbars'],
  });
}
export async function openLab(browser, query, viewport = { width: 400, height: 225 }) {
  const page = await browser.newPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`${BASE}?capture&${query}`, { waitUntil: 'load' });
  await page.waitForFunction('window.labReady === true', { polling: 100 });
  return page;
}
/** native-resolution PNG of the game canvas (lighting included) */
export async function canvasPng(page, sel = '#game') {
  const url = await page.$eval(sel, (c) => c.toDataURL('image/png'));
  return Buffer.from(url.split(',')[1], 'base64');
}
