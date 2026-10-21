import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const shot = async (page, name) => page.screenshot({ path: `docs/screenshots/${name}.png`, animations: 'disabled' });

for (const vp of [
  { width: 1440, height: 900, tag: 'desktop' },
  { width: 1024, height: 768, tag: 'tablet' },
  { width: 390, height: 844, tag: 'mobile' },
  { width: 320, height: 844, tag: 'mobile-320' },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 700 });
  await ctx.addInitScript(() => {
    localStorage.setItem('orangecy.wordbook', 'cet4');
    localStorage.setItem('orangecy.cardsAutoplay', '0');
    localStorage.setItem('orangecy.cardsSpeak', '0');
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('.play-button').click();
  await page.waitForTimeout(3200);
  if (['desktop', 'mobile', 'mobile-320'].includes(vp.tag)) await shot(page, `klein-player-${vp.tag}`);
  if (vp.tag === 'desktop') {
    await page.locator('.lyric-word.is-target').first().click({ force: true });
    await page.waitForTimeout(500);
    await shot(page, 'klein-word-peek');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('.cover-expand').first().click({ force: true });
    await page.waitForTimeout(600);
    await shot(page, 'klein-immersive');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  const navCards = page.locator('.nav-item', { hasText: '词卡' }).first();
  if (await navCards.isVisible().catch(() => false)) await navCards.click();
  else await page.locator('.cards-trigger').first().click({ force: true });
  await page.waitForTimeout(1000);
  if (['desktop', 'mobile', 'mobile-320'].includes(vp.tag)) await shot(page, `klein-cards-${vp.tag}`);
  console.log(vp.tag, 'overflow', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'errors', errors);
  await ctx.close();
}
await browser.close();
