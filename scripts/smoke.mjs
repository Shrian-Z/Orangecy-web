#!/usr/bin/env node
/**
 * Smoke: learn home (学习 N / 复习 M, book bar, picker), focus card expansion,
 * judgments, lyric replay, pronunciation, mute persistence, three tabs, the
 * playlist empty state, M due-today fixture, queue completion, and
 * 320/390/1440 layout.
 *
 * Run the built app first:
 *   npm run smoke
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:8787';
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

function localDay(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** M 口径 fixture：昨天到期 / 今晚到期 / 明天到期 / 今天已判过，只有前两个算复习。 */
function dueFixture() {
  const now = new Date();
  const DAY = 86_400_000;
  const record = (index, due) => {
    const card = DECK[index];
    return {
      word: card.w,
      bookId: 'cet4',
      entry: { w: card.w, p: card.p, m: card.m },
      card: {
        due: due.toISOString(),
        stability: 3,
        difficulty: 5,
        elapsed_days: 3,
        scheduled_days: 3,
        learning_steps: 0,
        reps: 2,
        lapses: 0,
        state: 2,
        last_review: new Date(now.getTime() - 3 * DAY).toISOString(),
      },
      addedAt: new Date(now.getTime() - 5 * DAY).toISOString(),
    };
  };
  return {
    version: 1,
    cards: {
      [WORDS[0]]: record(0, new Date(now.getTime() - DAY)),
      [WORDS[1]]: record(1, new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)),
      [WORDS[2]]: record(2, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12)),
      [WORDS[3]]: record(3, new Date(now.getTime() - 2 * DAY)),
    },
    daily: { date: localDay(now), bookId: '', newWords: [], reviewed: [WORDS[3]] },
    settings: { newPerDay: 10 },
    logs: [],
  };
}

async function homeCounts(page) {
  return page.evaluate(() => ({
    book: document.querySelector('.book-name')?.textContent ?? '',
    learn: document.querySelector('.home-learn b')?.textContent ?? '',
    review: document.querySelector('.home-review b')?.textContent ?? '',
  }));
}

async function enterLearn(page, selector = '.home-learn') {
  await page.waitForSelector('.home');
  await page.locator(selector).click();
  await page.waitForSelector('.focus-card');
}

async function boot(
  context,
  { muted = false, freeze = false, reduce = false, book = 'cet4', study = null, enter = true } = {},
) {
  await context.addInitScript(
    ({ mute, hold, bookId, seed }) => {
      localStorage.removeItem('orangecy.study.v1');
      if (seed) localStorage.setItem('orangecy.study.v1', JSON.stringify(seed));
      if (bookId) localStorage.setItem('orangecy.book', bookId);
      else localStorage.removeItem('orangecy.book');
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
    { mute: muted, hold: freeze, bookId: book, seed: study },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  watch(page);
  if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  if (enter) await enterLearn(page);
  else await page.waitForSelector('.home');
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
  const page = await boot(context, { enter: false });

  check('startup is the learn home', await page.locator('.home').isVisible());
  check('no splash', (await page.locator('.splash').count()) === 0);
  check('title is Orangecy', (await page.title()) === 'Orangecy', await page.title());
  check('three icon tabs', (await page.locator('.tab').count()) === 3);
  const texts = await tabTexts(page);
  check('tabs have no visible text', texts.every((text) => !text.trim()), JSON.stringify(texts));
  await page.waitForFunction(() => !document.querySelector('.home-learn')?.disabled);
  const fresh = await homeCounts(page);
  check('home shows book identity', fresh.book === '大学英语四级', fresh.book);
  check('home 学习 N = daily quota 10', fresh.learn === '10', fresh.learn);
  check('home 复习 M = 0 on a fresh profile', fresh.review === '0', fresh.review);
  const labels = await page.locator('.home-action span').allInnerTexts();
  check('home buttons are 学习/复习', labels.join('/') === '学习/复习', labels.join('/'));
  await enterLearn(page);
  check('counter starts at 01/10', (await counter(page)) === '01/10', await counter(page));
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
  await waitCard(page, 'dream', '02/10');
  check('hard judgment advances to 02/10', (await counter(page)) === '02/10');

  await expand(page);
  await page.locator('.actions .solid').click();
  await waitCard(page, 'baby', '03/10');
  check('good judgment advances to 03/10', (await counter(page)) === '03/10');

  const study = await page.evaluate(() => JSON.parse(localStorage.getItem('orangecy.study.v1') ?? 'null'));
  const logs = study?.logs ?? [];
  check(
    'review() recorded hard then good',
    logs.some((item) => item.word === 'lose' && item.rating === 'hard') &&
      logs.some((item) => item.word === 'dream' && item.rating === 'good'),
    logs.map((item) => `${item.word}:${item.rating}`).join(','),
  );
  check('review() used the chosen book', study?.cards?.lose?.bookId === 'cet4', study?.cards?.lose?.bookId);

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

  await page.locator('.tab[aria-label="歌单"]').click();
  await page.waitForSelector('.world-connect');
  check('歌单 without a session shows the connect empty state', await page.locator('.world-connect').isVisible());
  check('歌单 has no search box', (await page.locator('.world input').count()) === 0);
  check('歌单 hides the card', !(await page.locator('.focus-card').isVisible().catch(() => false)));

  await page.locator('.tab[aria-label="我的"]').click();
  await page.waitForSelector('.my-page');
  await page.waitForTimeout(600);
  check('my page has a settings row', (await page.locator('.my-settings').innerText()).trim() === '设置');
  await page.locator('.my-settings').click();
  await page.waitForSelector('.settings-page');
  check('settings opens 学习设置', (await page.locator('.settings-heading').innerText()) === '学习设置');
  check(
    'daily new words starts at 10',
    (await page.locator('.settings-stepper[aria-label="每日新词"] b').innerText()) === '10',
  );
  check(
    'daily review limit starts at 200',
    (await page.locator('.settings-stepper[aria-label="每日复习上限"] b').innerText()) === '200',
  );
  await page.locator('.settings-stepper[aria-label="每日新词"] [aria-label="增加每日新词"]').click();
  check(
    'quota steps to 15 inside settings',
    (await page.locator('.settings-stepper[aria-label="每日新词"] b').innerText()) === '15',
  );
  await page.locator('.settings-page .page-head .icon-action[aria-label="返回"]').click();
  await page.waitForSelector('.my-page');
  check('settings back returns to my', await page.locator('.my-settings').isVisible());
  check('my add button exists', await page.locator('.my-add').isVisible());
  check('my tab hides the card', !(await page.locator('.focus-card').isVisible().catch(() => false)));
  await page.locator('.my-add').click();
  await page.waitForSelector('.platform-sheet');
  check('four platform choices', (await page.locator('.platform-choice').count()) === 4);
  check('add sheet is icon-only', (await page.locator('.platform-sheet').innerText()).trim() === '');
  await page.locator('.platform-choice[aria-label="连接网易云音乐"]').click();
  await page.waitForSelector('.qr-image');
  check('netease qr renders', (await page.locator('.qr-image').count()) === 1);
  await page.locator('.platform-sheet .icon-action[aria-label="关闭"]').click();
  await page.waitForTimeout(200);
  check('connect sheet closes', (await page.locator('.platform-sheet').count()) === 0);

  await page.locator('.tab[aria-label="学习"]').click();
  await page.waitForTimeout(300);
  check('learning tab returns to the card', await page.locator('.focus-card').isVisible());
  check('card keeps its place across tabs', (await counter(page)) === '03/10', await counter(page));

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

  await page.locator('.status-back').click();
  await page.waitForSelector('.home');
  const afterTwo = await homeCounts(page);
  check('back returns to the learn home', await page.locator('.home').isVisible());
  check('N = quota 15 − 2 learned today', afterTwo.learn === '13', afterTwo.learn);
  check('just-learned words are not due today', afterTwo.review === '0', afterTwo.review);
  await context.close();

  // ── 复习 M 口径 ────────────────────────────────────────────────────────────
  const dueContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const duePage = await boot(dueContext, { enter: false, study: dueFixture(), muted: true });
  await duePage.waitForFunction(() => !document.querySelector('.home-learn')?.disabled);
  const due = await homeCounts(duePage);
  check('M counts overdue + due tonight only', due.review === '2', `M=${due.review}`);
  check('N ignores the 4 known words', due.learn === '10', `N=${due.learn}`);
  await enterLearn(duePage, '.home-review');
  check('复习 queue is 01/02', (await counter(duePage)) === '01/02', await counter(duePage));
  check('复习 starts with the oldest due word', (await word(duePage)) === WORDS[0], await word(duePage));
  for (const [index, value] of [WORDS[0], WORDS[1]].entries()) {
    await waitCard(duePage, value, `${pad2(index + 1)}/02`);
    await expand(duePage);
    await duePage.locator('.actions .solid').click();
  }
  await duePage.waitForSelector('.home');
  check('复习 queue ends on the home with M = 0', (await homeCounts(duePage)).review === '0');
  await dueContext.close();

  // ── 背完新词自动接复习 ─────────────────────────────────────────────────────
  const dailyContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dailyPage = await boot(dailyContext, { enter: false, study: dueFixture(), muted: true });
  await dailyPage.waitForFunction(() => !document.querySelector('.home-learn')?.disabled);
  await enterLearn(dailyPage, '.home-learn');
  for (let index = 0; index < 10; index += 1) {
    const word = WORDS[4 + index];
    await waitCard(dailyPage, word, `${pad2(index + 1)}/10`);
    await expand(dailyPage);
    await dailyPage.locator('.actions .solid').click();
  }
  await waitCard(dailyPage, WORDS[0], '01/02');
  check('new words flow into due reviews', (await counter(dailyPage)) === '01/02', await counter(dailyPage));
  for (const [index, value] of [WORDS[0], WORDS[1]].entries()) {
    await waitCard(dailyPage, value, `${pad2(index + 1)}/02`);
    await expand(dailyPage);
    await dailyPage.locator('.actions .solid').click();
  }
  await dailyPage.waitForSelector('.home-done');
  check('daily plan ends in completion', await dailyPage.locator('.home-done').isVisible());
  check(
    'completion stats count new + review',
    (await dailyPage.locator('.home-done-stats').innerText()).replace(/\s+/g, ' ').trim() === '10 新词 · 2 复习',
    (await dailyPage.locator('.home-done-stats').innerText()).trim(),
  );
  await dailyContext.close();

  // ── 无词书 → 选书 ─────────────────────────────────────────────────────────
  const bookContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const bookPage = await boot(bookContext, { enter: false, book: null });
  check('no book shows 选择词书', (await homeCounts(bookPage)).book === '选择词书');
  await bookPage.locator('.home-learn').click();
  await bookPage.waitForSelector('.picker');
  check('学习 without a book opens the picker, not a card', (await bookPage.locator('.focus-card').count()) === 0);
  await bookPage.locator('.picker-row', { hasText: '大学英语六级' }).click();
  await bookPage.waitForSelector('.home');
  await bookPage.waitForFunction(() => !document.querySelector('.home-learn')?.disabled);
  const cet6 = await homeCounts(bookPage);
  check('picked book updates the identity bar', cet6.book === '大学英语六级', cet6.book);
  check('N is capped by playable cards in the book (9)', cet6.learn === '9', cet6.learn);
  await bookContext.close();

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
  await enterLearn(mutedPage);
  check('mute survives a reload', (await mutedPage.locator('.mute').getAttribute('data-muted')) === 'true');
  await mutedPage.locator('.mute').click();
  await mutedPage.reload({ waitUntil: 'domcontentloaded' });
  await enterLearn(mutedPage);
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

  // ── 今日新学走完 ───────────────────────────────────────────────────────────
  const completeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const completePage = await boot(completeContext, { muted: true, reduce: true });
  for (let index = 0; index < 10; index += 1) {
    await waitCard(completePage, WORDS[index], `${pad2(index + 1)}/10`);
    await expand(completePage);
    await completePage.locator('.actions .solid').click();
  }
  await completePage.waitForSelector('.home');
  check('finished queue returns to the learn home', (await completePage.locator('.focus-card').count()) === 0);
  check('completion card is shown', await completePage.locator('.home-done').isVisible());
  check(
    'completion card says 今日完成',
    (await completePage.locator('.home-done-title').innerText()) === '今日完成',
  );
  check('home actions are hidden at completion', (await completePage.locator('.home-actions').count()) === 0);
  const completeStudy = await completePage.evaluate(() =>
    JSON.parse(localStorage.getItem('orangecy.study.v1') ?? 'null'),
  );
  check('10 reviews recorded', (completeStudy?.logs?.length ?? 0) === 10, `${completeStudy?.logs?.length}`);
  await completePage.locator('.home-done-more').click();
  await completePage.waitForSelector('.focus-card');
  check('再学 10 个 starts a fresh batch', (await counter(completePage)) === '01/10', await counter(completePage));
  await completeContext.close();

  // ── 每日复习上限 ───────────────────────────────────────────────────────────
  const limitContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const limitFixture = dueFixture();
  limitFixture.settings.reviewPerDay = 20;
  limitFixture.daily.reviewCount = 19;
  const limitPage = await boot(limitContext, { enter: false, study: limitFixture, muted: true });
  await limitPage.waitForFunction(() => !document.querySelector('.home-learn')?.disabled);
  check('M is capped by 每日复习上限', (await homeCounts(limitPage)).review === '1', (await homeCounts(limitPage)).review);
  await limitContext.close();

  check('browser console clean', browserErrors.length === 0, browserErrors.slice(0, 5).join(' / '));
} catch (error) {
  check('smoke execution', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

console.log(`\n${results.length - failures}/${results.length} 项通过`);
if (failures) process.exitCode = 1;
