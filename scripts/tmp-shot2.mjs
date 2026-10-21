import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('orangecy.wordbook', 'cet4');
  localStorage.setItem('orangecy.cardsAutoplay', '0');
  localStorage.setItem('orangecy.cardsSpeak', '0');
});
const page = await ctx.newPage();
const logs=[]; page.on('console',m=>{if(m.type()==='error')logs.push(m.text())}); page.on('pageerror',e=>logs.push(e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
// start playing and wait
const play = page.locator('.play-button');
await play.click().catch(()=>{});
await page.waitForTimeout(5200);
await page.screenshot({ path: '/tmp/player-playing.png' });
// click first target word to open peek
const target = page.locator('.lyric-word.is-target').nth(0);
if (await target.count()) { await target.click({ force: true }); await page.waitForTimeout(700); }
console.log('peek', await page.locator('.word-peek').count());
await page.screenshot({ path: '/tmp/player-peek.png' });
// immersive
await page.locator('.cover-expand').click({ force: true }).catch(e=>logs.push('expand '+e.message));
await page.waitForTimeout(800);
console.log('immersive', await page.locator('.immersive').count());
await page.screenshot({ path: '/tmp/player-immersive.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
// cards
await page.locator('.nav-item', { hasText: '词卡' }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/cards-new2.png' });
console.log('logs', logs);
await browser.close();
