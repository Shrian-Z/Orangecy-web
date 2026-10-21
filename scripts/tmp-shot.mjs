import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('orangecy.wordbook', 'cet4');
  localStorage.setItem('orangecy.cardsAutoplay', '0');
  localStorage.setItem('orangecy.cardsSpeak', '0');
});
const page = await ctx.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 }).catch(e => logs.push('goto: '+e.message));
await page.waitForTimeout(3500);
console.log('title', await page.title());
console.log('world', await page.locator('.app').getAttribute('data-world').catch(()=>null));
console.log('html world', await page.locator('html').getAttribute('data-world').catch(()=>null));
console.log('stage count', await page.locator('.stage').count());
console.log('lyrics count', await page.locator('.lyric-line').count());
console.log('logs', logs.slice(0,20));
await page.screenshot({ path: '/tmp/player-new.png', fullPage: false });
// click cards nav
const cardsBtn = page.locator('.nav-item', { hasText: '词卡' });
console.log('cards btn count', await cardsBtn.count());
if (await cardsBtn.count()) {
  await cardsBtn.first().click();
  await page.waitForTimeout(1800);
  console.log('world after', await page.locator('.app').getAttribute('data-world').catch(()=>null));
  console.log('cards word count', await page.locator('.cards-word').count());
  console.log('word-card count', await page.locator('.word-card').count());
  console.log('cards empty count', await page.locator('.cards-empty').count());
  await page.screenshot({ path: '/tmp/cards-new.png', fullPage: false });
}
await browser.close();
