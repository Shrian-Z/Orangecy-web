import { chromium } from 'playwright-core';

const base = process.env.SMOKE_URL || 'http://127.0.0.1:8790';
const executablePath =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(`PAGEERROR ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`CONSOLE ${message.text()}`);
  });

  await page.addInitScript(() => localStorage.setItem('orangecy.wordbook', 'cet4'));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.splash.is-done', { state: 'attached' });
  await page.waitForTimeout(1500);

  const title = await page.locator('.track-title').innerText().catch(() => '');
  check('播放器首屏', Boolean(title), title);

  await page.locator('.search-trigger').click();
  await page.waitForTimeout(500);
  await page.locator('.search-box input').fill('Counting Stars');
  await page.waitForTimeout(6500);
  const searchRows = await page.locator('.result-row').count();
  const platforms = [...new Set(await page.locator('.result-row .platform-mini').allInnerTexts())];
  check('全平台搜索', searchRows >= 10 && platforms.length >= 3, `${searchRows} 条 / ${platforms.join('、')}`);
  await page.locator('.search-drawer .drawer-head .icon-button').click();
  await page.waitForTimeout(400);

  await page.locator('.platform-trigger').click();
  await page.waitForTimeout(1200);
  const platformRows = await page.locator('.platform-row').count();
  check('平台账号中心', platformRows === 4, `${platformRows} 行`);
  await page.locator('.platform-settings .autoplay-toggle').click();
  await page.waitForTimeout(500);
  const reduced = await page.evaluate(() => document.documentElement.classList.contains('reduce-motion'));
  check('减少动态效果', reduced);
  await page.locator('.platform-settings .autoplay-toggle').click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.locator('.nav-item').nth(1).click();
  await page.waitForTimeout(7000);
  const recCards = await page.locator('.rec-card').count();
  const recFilters = await page.locator('.rec-filter').count();
  check('每日推荐', recCards === 10, `${recCards} 张 / ${recFilters} 个平台筛选`);
  await page.locator('.rec-card').first().click();
  await page.waitForTimeout(2500);
  await page.locator('.capsule-more').click();
  await page.waitForTimeout(300);
  await page.locator('.queue-chip').click();
  await page.waitForTimeout(600);
  const queueRows = await page.locator('.queue-row').count();
  const queueSummary = await page.locator('.queue-summary').innerText().catch(() => '');
  check('播放队列', queueRows === 10, queueSummary.replace(/\n/g, ' | '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.locator('.nav-item').nth(2).click();
  await page.waitForTimeout(1800);
  const cardsVisible = await page.locator('.cards-stage').isVisible();
  const playerBarInCards = await page.locator('.playercapsule').count();
  check('词卡模式隐藏播放条', cardsVisible && playerBarInCards === 0);

  await page.locator('.nav-item').nth(3).click();
  await page.waitForTimeout(1200);
  check('复习模式', await page.locator('.cards-stage').isVisible());

  await page.locator('.nav-item').nth(0).click();
  await page.waitForTimeout(500);
  await page.locator('.cover-expand').click({ force: true });
  await page.waitForTimeout(800);
  const immersive = await page.locator('.immersive').isVisible();
  check('沉浸播放器', immersive);
  await page.locator('.immersive-close').click();
  await page.waitForTimeout(300);

  check('桌面无 console 错误', consoleErrors.length === 0, consoleErrors.join(' / ').slice(0, 300));

  for (const width of [320, 390]) {
    const mobile = await browser.newPage({ viewport: { width, height: 844 } });
    await mobile.addInitScript(() => localStorage.setItem('orangecy.wordbook', 'cet4'));
    await mobile.goto(base, { waitUntil: 'domcontentloaded' });
    await mobile.waitForSelector('.splash.is-done', { state: 'attached' });
    await mobile.waitForTimeout(1400);
    const metrics = await mobile.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      platformTrigger: Boolean(document.querySelector('.platform-trigger')),
      navItems: document.querySelectorAll('.nav-item').length,
      capsule: Boolean(document.querySelector('.playercapsule')),
    }));
    check(
      `移动端 ${width}px`,
      metrics.scrollWidth === metrics.innerWidth &&
        metrics.platformTrigger &&
        metrics.navItems === 4 &&
        metrics.capsule,
      JSON.stringify(metrics),
    );
    await mobile.close();
  }
} catch (error) {
  check('smoke 执行', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

console.log(`\n${results.length - failures}/${results.length} 项通过`);
if (failures) process.exitCode = 1;
