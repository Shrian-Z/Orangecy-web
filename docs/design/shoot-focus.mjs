import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(dir, 'focus-card-v3.html');
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const viewports = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1 },
  { name: 'mobile', width: 390, height: 844, dpr: 2 },
  { name: 'small', width: 320, height: 568, dpr: 2 },
];
for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  });
  const page = await context.newPage();
  for (const state of ['collapsed', 'expanded', 'playing', 'muted']) {
    await page.goto(url + '?state=' + state + '&capture=1');
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(dir, 'focus-card-' + vp.name + '-' + state + '.png') });
  }
  await context.close();
}
await browser.close();
console.log('done');
