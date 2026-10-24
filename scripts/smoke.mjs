#!/usr/bin/env node
/**
 * Focus-card smoke: startup, expansion, judgments, lyric replay, pronunciation,
 * mute persistence, four tabs, 50/50 completion, and 320/390/1440 layout.
 *
 * Run the built app first:
 *   npm run smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8790';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DECK = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/seed-50.json'), 'utf8')).cards;
const WORDS = DECK.map((card) => card.w);
const OLD_SELECTORS = [
  '.splash',
  '.topbar',
  '.nav-item',
  '.playercapsule',
  '.lyrics-panel',
  '.cards-stage',
  '.recommend-view',
  '.search-drawer',
  '.queue-drawer',
  '.platform-drawer',
  '.word-peek',
  '.cover-stage',
  '.immersive',
  '.player-bar',
  '.toasts',
  '.drawer',
];

const results = [];
const browserErrors = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function watch(page) {
  page.on('pageerror', (error) => browserErrors.push(`PAGE ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`CONSOLE ${message.text()}`);
  });
}

async function boot(context, { muted = false, freeze = false, reduce = false } = {}) {
  await context.addInitScript(
    ({ mute, hold }) => {
      localStorage.removeItem('orangecy.study.v1');
      if (!sessionStorage.getItem('orangecy.smoke.muteInit')) {
        localStorage.setItem('orangecy.muted', mute ? '1' : '0');
        sessionStorage.setItem('orangecy.smoke.muteInit', '1');
      }
      if (hold) {
        const original = window.setTimeout.bind(window);
        window.setTimeout = (fn, ms, ...args) => {
          if (typeof ms === 'number' && ms >= 500 && !window.__focusRelease) return 0;
          return original(fn, ms, ...args);
        };
      }
    },
    { mute: muted, hold: freeze },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  watch(page);
  if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.focus-card');
  return page;
}

async function counter(page) {
  return page.locator('.counter').evaluate((el) => (el.textContent ?? '').replace(/\s+/g, ''));
}

async function word(page) {
  return page.locator('.word').innerText();
}

async function progress(page) {
  return page.locator('.progress span').evaluate((el) => Number.parseFloat(el.style.width) || 0);
}

async function waitCard(page, expectedWord, expectedCounter) {
  await page.waitForFunction(
    ({ word: value, counter: count }) =>
      document.querySelector('.word')?.textContent === value &&
      (document.querySelector('.counter')?.textContent ?? '').replace(/\s+/g, '') === count,
    { word: expectedWord, counter: expectedCounter },
  );
}

async function expand(page) {
  await page.locator('.focus-card').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.focus-card')?.getAttribute('data-expanded') === 'true',
  );
}

async function tabTexts(page) {
  return page.locator('.tab').allInnerTexts();
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

try {
  // ── Functional page ────────────────────────────────────────────────────────
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await boot(context);

  check('startup is already a card', await page.locator('.focus-card').isVisible());
  check('no splash', (await page.locator('.splash').count()) === 0);
  check('title is Orangecy', (await page.title()) === 'Orangecy', await page.title());
  check('four icon tabs', (await page.locator('.tab').count()) === 4);
  const texts = await tabTexts(page);
  check('tabs have no visible text', texts.every((text) => !text.trim()), JSON.stringify(texts));
  check('counter starts at 01/50', (await counter(page)) === '01/50', await counter(page));
  check('word is lose', (await word(page)) === 'lose', await word(page));
  check('target word is highlighted', (await page.locator('.word-token.is-target').count()) > 0);

  await page.waitForFunction(() => window.__orangecyFocusPhase === 'fragment');
  const firstTrace = await page.evaluate(() => window.__orangecyAudioTrace ?? []);
  check(
    'fragment seeks and fades in',
    firstTrace.some((item) => item.event === 'seek') &&
      firstTrace.some((item) => item.event === 'fade' && item.to === 1),
  );

  await expand(page);
  check('expand shows meaning', await page.locator('.sense').isVisible());
  check('expand shows two judgments', (await page.locator('.actions button').count()) === 2);
  const actionTexts = await page.locator('.actions button').allInnerTexts();
  check('judgments are 模糊/认识', actionTexts.join('/') === '模糊/认识', actionTexts.join('/'));

  await page.locator('.actions .ghost').click();
  await waitCard(page, 'dream', '02/50');
  check('hard judgment advances to 02/50', (await counter(page)) === '02/50');

  await expand(page);
  await page.locator('.actions .solid').click();
  await waitCard(page, 'baby', '03/50');
  check('good judgment advances to 03/50', (await counter(page)) === '03/50');

  const study = await page.evaluate(() => JSON.parse(localStorage.getItem('orangecy.study.v1') ?? 'null'));
  const logs = study?.logs ?? [];
  check(
    'review() recorded hard then good',
    logs.some((item) => item.word === 'lose' && item.rating === 'hard') &&
      logs.some((item) => item.word === 'dream' && item.rating === 'good'),
    logs.map((item) => `${item.word}:${item.rating}`).join(','),
  );
  check('review() used focus-50 book', study?.cards?.lose?.bookId === 'focus-50');

  await page.waitForFunction(() => window.__orangecyFocusPhase === 'fragment');
  await page.waitForFunction(
    () => Number.parseFloat(document.querySelector('.progress span')?.style.width || '0') > 5,
  );
  const beforeReplay = await progress(page);
  await page.locator('.lyrics').click();
  await page.waitForTimeout(350);
  const afterReplay = await progress(page);
  check(
    'lyrics replay resets the fragment without expanding',
    afterReplay < beforeReplay,
    `${beforeReplay}% -> ${afterReplay}%`,
  );
  check('lyrics replay stays collapsed', (await page.locator('.focus-card').getAttribute('data-expanded')) === 'false');

  const beforeMute = await progress(page);
  await page.locator('.mute').click();
  await page.waitForTimeout(600);
  const afterMute = await progress(page);
  check('mute icon switches', (await page.locator('.mute').getAttribute('data-muted')) === 'true');
  check('mute is stored', (await page.evaluate(() => localStorage.getItem('orangecy.muted'))) === '1');
  check('mute keeps the timeline moving', afterMute > beforeMute, `${beforeMute}% -> ${afterMute}%`);
  const muteTrace = await page.evaluate(() => window.__orangecyAudioTrace ?? []);
  check('mute fades audio out and pauses', muteTrace.some((item) => item.event === 'mute' && item.muted === true));
  await page.locator('.mute').click();
  check('unmute is stored', (await page.evaluate(() => localStorage.getItem('orangecy.muted'))) === '0');

  await page.locator('.word-block').click();
  await page.waitForFunction(
    () => (window.__orangecyAudioTrace ?? []).some((item) => item.event === 'pronounce'),
    null,
    { timeout: 6_000 },
  );
  const speakTrace = await page.evaluate(() => window.__orangecyAudioTrace ?? []);
  const spoken = speakTrace.find((item) => item.event === 'pronounce');
  check('word click pronounces without expanding', spoken?.word === 'baby', spoken?.word);
  check(
    'word click stays collapsed',
    (await page.locator('.focus-card').getAttribute('data-expanded')) === 'false',
  );

  for (const label of ['复习', '词书', '我的']) {
    await page.locator(`.tab[aria-label="${label}"]`).click();
    await page.waitForTimeout(200);
    check(`${label} is an icon-only empty state`, (await page.locator('.placeholder svg').count()) === 1);
    check(`${label} hides the card`, !(await page.locator('.focus-card').isVisible().catch(() => false)));
  }
  await page.locator('.tab[aria-label="学习"]').click();
  await page.waitForTimeout(300);
  check('learning tab returns to the card', await page.locator('.focus-card').isVisible());

  const old = await page.evaluate(
    (selectors) => selectors.filter((selector) => document.querySelector(selector)),
    OLD_SELECTORS,
  );
  check('no legacy shell selectors', old.length === 0, old.join(','));
  const bodyText = await page.locator('body').innerText();
  const forbidden = ['听歌背单词', '歌单', '播放器', '推荐', '搜索', '登录', 'NOW PLAYING'];
  const found = forbidden.filter((text) => bodyText.includes(text));
  check('no legacy music copy', found.length === 0, found.join(','));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth === window.innerWidth,
  );
  check('desktop has no horizontal overflow', overflow);
  await context.close();

  // ── Mute persistence ───────────────────────────────────────────────────────
  const mutedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mutedPage = await boot(mutedContext, { muted: true });
  check('muted starts from storage', (await mutedPage.locator('.mute').getAttribute('data-muted')) === 'true');
  await mutedPage.waitForFunction(() => window.__orangecyFocusPhase === 'fragment');
  await mutedPage.waitForTimeout(700);
  const mutedProgress = await progress(mutedPage);
  const mutedTrace = await mutedPage.evaluate(() => window.__orangecyAudioTrace ?? []);
  check('muted timeline still runs', mutedProgress > 0, `${mutedProgress}%`);
  check('muted skips audio commands', mutedTrace.every((item) => item.event !== 'seek'));
  await mutedPage.reload({ waitUntil: 'domcontentloaded' });
  await mutedPage.waitForSelector('.focus-card');
  check('mute survives a reload', (await mutedPage.locator('.mute').getAttribute('data-muted')) === 'true');
  await mutedPage.locator('.mute').click();
  await mutedPage.reload({ waitUntil: 'domcontentloaded' });
  await mutedPage.waitForSelector('.focus-card');
  check('unmuted state survives a reload', (await mutedPage.locator('.mute').getAttribute('data-muted')) === 'false');
  await mutedContext.close();

  // ── Responsive layout ──────────────────────────────────────────────────────
  for (const viewport of [
    { width: 1440, height: 900, name: '1440' },
    { width: 390, height: 844, name: '390' },
    { width: 320, height: 568, name: '320' },
  ]) {
    const responsive = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width < 1000,
      isMobile: viewport.width < 1000,
    });
    const responsivePage = await boot(responsive, { freeze: true });
    const noOverflow = await responsivePage.evaluate(
      () => document.documentElement.scrollWidth === window.innerWidth,
    );
    check(`${viewport.name}px collapsed has no overflow`, noOverflow);
    await expand(responsivePage);
    await responsivePage.waitForTimeout(450);
    const metrics = await responsivePage.evaluate(() => {
      const card = document.querySelector('.focus-card')?.getBoundingClientRect();
      const tabs = document.querySelector('.tabs')?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth === window.innerWidth,
        cardBottom: card ? card.bottom : 0,
        tabsTop: tabs ? tabs.top : 0,
        actionsVisible: Boolean(document.querySelector('.actions .solid')),
      };
    });
    check(`${viewport.name}px expanded has no overflow`, metrics.overflow);
    check(
      `${viewport.name}px judgments sit above the tabs`,
      metrics.cardBottom <= metrics.tabsTop + 2,
      `${metrics.cardBottom} / ${metrics.tabsTop}`,
    );
    check(`${viewport.name}px actions exist`, metrics.actionsVisible);
    await responsive.close();
  }

  // ── 50/50 completion ───────────────────────────────────────────────────────
  const completeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const completePage = await boot(completeContext, { muted: true, reduce: true });
  for (let index = 0; index < 50; index += 1) {
    await waitCard(completePage, WORDS[index], `${pad2(index + 1)}/50`);
    await expand(completePage);
    await completePage.locator('.actions .solid').click();
    if (index === 49) {
      await completePage.waitForSelector('.study-complete .replay-all');
    }
  }
  check('completion stops at 50/50', (await counter(completePage)) === '50/50');
  check('completion has only the replay icon', (await completePage.locator('.study-complete').innerText()).trim() === '');
  check('completion shows replay', await completePage.locator('.replay-all').isVisible());
  const completeStudy = await completePage.evaluate(() =>
    JSON.parse(localStorage.getItem('orangecy.study.v1') ?? 'null'),
  );
  check('50 reviews recorded', (completeStudy?.logs?.length ?? 0) === 50, `${completeStudy?.logs?.length}`);
  await completePage.locator('.replay-all').click();
  await waitCard(completePage, WORDS[0], '01/50');
  check('replay icon restarts at 01/50', await completePage.locator('.focus-card').isVisible());
  await completeContext.close();

  check('browser console clean', browserErrors.length === 0, browserErrors.slice(0, 5).join(' / '));
} catch (error) {
  check('smoke execution', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

console.log(`\n${results.length - failures}/${results.length} 项通过`);
if (failures) process.exitCode = 1;
