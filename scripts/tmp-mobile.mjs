import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
for (const width of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('orangecy.wordbook', 'cet4');
    localStorage.setItem('orangecy.cardsAutoplay', '0');
    localStorage.setItem('orangecy.cardsSpeak', '0');
  });
  const page = await ctx.newPage();
  const logs=[]; page.on('console',m=>{if(m.type()==='error')logs.push(m.text())}); page.on('pageerror',e=>logs.push(e.message));
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `/tmp/player-${width}.png` });
  // word peek on first target
  const target = page.locator('.lyric-word.is-target').nth(0);
  if (await target.count()) { await target.click({ force: true }); await page.waitForTimeout(600); }
  await page.screenshot({ path: `/tmp/peek-${width}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // cards via topbar icon
  const cards = page.locator('.cards-trigger').first();
  console.log(width, 'cards trigger visible', await cards.isVisible().catch(()=>false));
  await cards.click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/cards-${width}.png` });
  console.log(width, 'logs', logs, 'overflowX', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await ctx.close();
}
await browser.close();
