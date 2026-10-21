import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
for (const width of [390, 320]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem('orangecy.wordbook','cet4'); localStorage.setItem('orangecy.cardsAutoplay','0'); localStorage.setItem('orangecy.cardsSpeak','0'); });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/', { waitUntil:'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('.cards-trigger').first().click({ force:true });
  await page.waitForTimeout(1000);
  const info = await page.evaluate(() => {
    const el = document.querySelector('.mobile-rate-bar');
    if (!el) return { exists:false };
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return { exists:true, display:cs.display, position:cs.position, bottom:cs.bottom, z:cs.zIndex, rect:{x:r.x,y:r.y,w:r.width,h:r.height}, innerHeight, scrollY, bodyOverflow:getComputedStyle(document.body).overflow };
  });
  console.log(width, info);
  await ctx.close();
}
await browser.close();
