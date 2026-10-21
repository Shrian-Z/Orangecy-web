import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
for (const width of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('orangecy.wordbook', 'cet4');
    localStorage.setItem('orangecy.cardsAutoplay', '0');
    localStorage.setItem('orangecy.cardsSpeak', '0');
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  console.log(width, await page.evaluate(() => ({iw:innerWidth,ih:innerHeight,vw:visualViewport?.width,vh:visualViewport?.height,screenH:screen.height})));
  await page.screenshot({ path: `/tmp/player2-${width}.png` });
  const target = page.locator('.lyric-word.is-target').nth(0);
  if (await target.count()) { await target.click({ force: true }); await page.waitForTimeout(600); }
  await page.screenshot({ path: `/tmp/peek2-${width}.png` });
  const peekBox = await page.locator('.word-peek').boundingBox().catch(()=>null);
  console.log(width, 'peek box', peekBox);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.locator('.cards-trigger').first().click({ force: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `/tmp/cards2-${width}.png` });
  const barBox = await page.locator('.mobile-rate-bar').boundingBox().catch(()=>null);
  console.log(width, 'rate bar', barBox);
  await ctx.close();
}
await browser.close();
