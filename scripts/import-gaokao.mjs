#!/usr/bin/env node
/**
 * End-to-end acceptance for the personal wordbook import.
 *
 * Runs the real UI against the built app + local API:
 *   book picker -> import entry -> 高考 3500 preset -> own playlists / lyrics /
 *   playability -> cards -> study 5 music cards -> reload persistence.
 *
 * Then isolates the word-only fallback with a fresh, logged-out context and
 * verifies a pasted word becomes a plain card that speaks without a fragment.
 *
 * Requirements:
 *   node server/index.mjs   (port 8787)
 *   npm run build
 *   a valid netease session cookie in data/sessions.json (or ORANGECY_SID)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { parseLrc } from '../server/lyrics.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = process.env.IMPORT_API || 'http://127.0.0.1:8787';
const APP_URL = process.env.APP_URL || API;

/** Reuse the newest persisted netease session; never print its cookies. */
function latestSessionId() {
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sessions.json'), 'utf8'));
    const withCookie = (saved.sessions ?? []).filter((session) => session.cookie);
    return withCookie.at(-1)?.id ?? '';
  } catch {
    return '';
  }
}

const SID = process.env.ORANGECY_SID || latestSessionId();
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EVIDENCE = path.join(ROOT, 'docs/evidence/gaokao-import.json');
const SHOTS = path.join(ROOT, 'docs/screenshots');
const MAIN_BOOK = '高考 3500';
const EXPECTED_WORDS = 3738;
const MIN_MATCHED = 2500;

const checks = [];
const failures = [];
const progressSamples = [];
const consoleErrors = [];
const pageErrors = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? ` · ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`);
}

async function requestJson(pathname) {
  const response = await fetch(`${API}${pathname}`, {
    headers: { Cookie: `oc_sid=${SID}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${pathname} -> HTTP ${response.status}`);
  return response.json();
}

async function pool(items, limit, fn) {
  let cursor = 0;
  const results = new Array(items.length);
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function tokens(text) {
  return new Set(String(text).toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? []);
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

async function readImportedBook(page) {
  return page.evaluate(async () => {
    const open = () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('orangecy.imports', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const getAll = (db, store) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readonly');
        const request = transaction.objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await open();
    const metas = await getAll(db, 'meta');
    const datasets = await getAll(db, 'data');
    const meta = metas.find((item) => item.id === 'import-gaokao-3500') ?? metas[0];
    const dataset = datasets.find((item) => item.id === meta?.id);
    const cards = dataset?.cards ?? [];
    const words = dataset?.words ?? [];
    const cardWords = new Set(cards.map((card) => card.w.toLowerCase()));
    const plain = words.filter((word) => !cardWords.has(word.w.toLowerCase()));
    const trackIds = [...new Set(cards.map((card) => card.track?.id).filter(Boolean))];
    let badTargets = 0;
    for (const card of cards) {
      const target = String(card.fragment?.target ?? '').toLowerCase();
      const lineHit = (card.fragment?.lines ?? []).some((line) =>
        new Set(String(line.text).toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? []).has(target),
      );
      if (!lineHit) badTargets += 1;
    }
    return {
      meta,
      words: words.length,
      uniqueWords: new Set(words.map((word) => word.w.toLowerCase())).size,
      cards: cards.length,
      uniqueCards: new Set(cards.map((card) => card.w.toLowerCase())).size,
      plain: plain.length,
      trackIds,
      badTargets,
      samples: cards.slice(0, 8).map((card) => ({
        w: card.w,
        track: card.track ? { id: card.track.id, title: card.track.title } : null,
        fragment: card.fragment,
      })),
      plainSample: plain.slice(0, 3).map((word) => ({ w: word.w, p: word.p, m: word.m })),
      summaryStats: meta?.stats ?? null,
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });

  if (!SID) throw new Error('没有已保存的网易云会话；先扫码登录，或设置 ORANGECY_SID');
  const auth = await requestJson('/api/auth/status');
  check('netease session is logged in', Boolean(auth.loggedIn), auth.profile?.nickname ?? '');
  if (!auth.loggedIn) throw new Error('先登录网易云再跑导入验收');

  const launch = {
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  };
  if (fs.existsSync(CHROME_PATH)) launch.executablePath = CHROME_PATH;
  const browser = await chromium.launch(launch);
  let mainPage = null;

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    await context.addCookies([
      { name: 'oc_sid', value: SID, url: API, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();
    mainPage = page;
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForSelector('.home');
    await page.waitForFunction(() => !document.querySelector('.home-learn')?.disabled || document.querySelector('.book-name')?.textContent === '选择词书');
    await page.locator('.book-bar').click();
    await page.waitForSelector('.picker');
    check('import entry exists in book picker', (await page.locator('.picker-import').count()) === 1);
    await page.screenshot({ path: path.join(SHOTS, 'import-entry.png') });

    await page.locator('.picker-import').click();
    await page.waitForSelector('.import-sheet');
    check('import sheet opens', (await page.locator('.import-sheet').count()) === 1);
    check('preset 高考 3500 is offered', (await page.locator('.import-preset-name').innerText()) === '高考 3500');
    await page.screenshot({ path: path.join(SHOTS, 'import-sheet.png') });

    const started = Date.now();
    await page.locator('.import-preset').click();
    await page.waitForSelector('.import-progress', { timeout: 20_000 });

    let sampledProgress = false;
    let done = false;
    while (Date.now() - started < 20 * 60 * 1000) {
      if (await page.locator('.import-done').count()) {
        done = true;
        break;
      }
      try {
        const text = (await page.locator('.import-progress-head').innerText()).replace(/\s+/g, ' ').trim();
        if (text && progressSamples.at(-1) !== text) {
          progressSamples.push(text);
          console.log(`[import] ${text}`);
        }
      } catch {
        // The phase may switch between the check and the read.
      }
      if (!sampledProgress && Date.now() - started > 12_000) {
        sampledProgress = true;
        await page.screenshot({ path: path.join(SHOTS, 'import-progress.png') });
      }
      await page.waitForTimeout(4000);
    }
    const elapsedMs = Date.now() - started;
    check('import reaches the done state', done, `${(elapsedMs / 1000).toFixed(1)}s`);
    if (!done) throw new Error('导入超时');

    const summary = (await page.locator('.import-summary').innerText()).replace(/\s+/g, ' ').trim();
    const sub = (await page.locator('.import-sub').innerText()).replace(/\s+/g, ' ').trim();
    console.log(`[import] summary: ${summary}`);
    console.log(`[import] sub: ${sub}`);
    await page.screenshot({ path: path.join(SHOTS, 'import-done.png') });

    const data = await readImportedBook(page);
    check('book id is stable', data.meta?.id === 'import-gaokao-3500', data.meta?.id ?? '');
    check('book name is 高考 3500', data.meta?.name === MAIN_BOOK, data.meta?.name ?? '');
    check('all bundled words imported', data.words === EXPECTED_WORDS, `${data.words}`);
    check('all imported words unique', data.uniqueWords === data.words, `${data.uniqueWords}`);
    check(
      'every word has a card (music or plain)',
      data.cards + data.plain === data.words,
      `${data.cards} + ${data.plain} = ${data.words}`,
    );
    check('matched cards are unique words', data.uniqueCards === data.cards, `${data.uniqueCards}`);
    check('at least 2500 words paired with songs', data.cards >= MIN_MATCHED, `${data.cards}`);
    check('every card target is in its lyric line', data.badTargets === 0, `${data.badTargets} bad`);
    check('matched cards use many tracks', data.trackIds.length >= 300, `${data.trackIds.length} tracks`);
    check('stats.matchedWords matches stored cards', data.summaryStats?.matchedWords === data.cards, `${data.summaryStats?.matchedWords}`);
    check('stats.plainWords matches computed plain', data.summaryStats?.plainWords === data.plain, `${data.summaryStats?.plainWords}/${data.plain}`);
    check('done summary shows the full word count', summary.includes(String(EXPECTED_WORDS)), summary);
    check('done summary reports paired songs', /配歌/.test(summary), summary);

    await page.locator('.import-use').click();
    await page.waitForSelector('.home');
    await page.waitForFunction(
      (name) => document.querySelector('.book-name')?.textContent === name,
      MAIN_BOOK,
      { timeout: 20_000 },
    );
    check('imported book becomes the active book', (await page.locator('.book-name').innerText()) === MAIN_BOOK);
    await page.waitForFunction(
      (expected) => (document.querySelector('.book-progress')?.textContent ?? '').replace(/\s+/g, '') === expected,
      `0/${EXPECTED_WORDS}`,
      { timeout: 20_000 },
    );
    check('home shows the full book length', true, `0 / ${EXPECTED_WORDS}`);
    await page.waitForFunction(
      () => (document.querySelector('.home-learn b')?.textContent ?? '').trim() === '10',
      null,
      { timeout: 20_000 },
    );
    check('N starts at the daily quota', true, '10');
    await page.screenshot({ path: path.join(SHOTS, 'import-home.png') });

    await page.locator('.home-learn').click();
    await page.waitForSelector('.focus-card');
    const seekChecks = [];
    for (let index = 0; index < 5; index += 1) {
      await page.waitForFunction(() => window.__orangecyFocusPhase === 'fragment', null, { timeout: 20_000 });
      await page.waitForTimeout(1300);
      const snapshot = await page.evaluate(() => {
        const trace = window.__orangecyAudioTrace ?? [];
        return {
          word: document.querySelector('.word')?.textContent ?? '',
          counter: (document.querySelector('.counter')?.textContent ?? '').replace(/\s+/g, ''),
          hasLyrics: Boolean(document.querySelector('.lyrics')),
          target: Boolean(document.querySelector('.word-token.is-target')),
          activeLines: document.querySelectorAll('.line.is-active').length,
          phase: window.__orangecyFocusPhase,
          flip: trace.find((event) => event.event === 'flip') ?? null,
          load: trace.find((event) => event.event === 'load-track') ?? null,
          ready: trace.find((event) => event.event === 'track-ready') ?? null,
          fragment: trace.find((event) => event.event === 'fragment-start') ?? null,
          seek: trace.find((event) => event.event === 'seek-check') ?? null,
        };
      });
      const cardInfo = data.samples.find((card) => card.w === snapshot.word);
      check(`card ${index + 1} is a music card`, snapshot.hasLyrics && snapshot.fragment?.start !== undefined, snapshot.word);
      check(`card ${index + 1} highlights its target`, snapshot.target, snapshot.word);
      check(`card ${index + 1} lights an active lyric line`, snapshot.activeLines >= 1, `${snapshot.activeLines}`);
      check(`card ${index + 1} seek-check passes`, snapshot.seek?.passed === true, JSON.stringify(snapshot.seek));
      check(
        `card ${index + 1} plays its stored fragment`,
        Boolean(cardInfo?.fragment) &&
          Math.abs((cardInfo?.fragment?.start ?? -1) - (snapshot.fragment?.start ?? -2)) < 0.01,
        `${cardInfo?.fragment?.start} vs ${snapshot.fragment?.start}`,
      );
      check(
        `card ${index + 1} loads its stored track`,
        Boolean(cardInfo?.track?.id) &&
          [snapshot.load?.trackId, snapshot.ready?.trackId].includes(cardInfo?.track?.id),
        `${cardInfo?.track?.id}`,
      );
      seekChecks.push({
        index: index + 1,
        word: snapshot.word,
        counter: snapshot.counter,
        target: snapshot.target,
        activeLines: snapshot.activeLines,
        flip: snapshot.flip,
        fragment: snapshot.fragment,
        seek: snapshot.seek,
        cardInfo: cardInfo ?? null,
      });

      if (index === 0) await page.screenshot({ path: path.join(SHOTS, 'import-card.png') });
      await page.locator('.focus-card').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(450);
      await page.locator('.actions .solid').click();
      await page.waitForTimeout(250);
    }

    await page.locator('.status-back').click();
    await page.waitForSelector('.home');
    await page.waitForFunction(
      (expected) => (document.querySelector('.book-progress')?.textContent ?? '').replace(/\s+/g, '') === expected,
      `5/${EXPECTED_WORDS}`,
      { timeout: 20_000 },
    );
    check('five reviews are recorded in the book progress', true, `5 / ${EXPECTED_WORDS}`);
    check('N drops by five', (await page.locator('.home-learn b').innerText()) === '5');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.home');
    await page.waitForFunction(
      (name) => document.querySelector('.book-name')?.textContent === name,
      MAIN_BOOK,
      { timeout: 20_000 },
    );
    check('imported book survives reload', true);
    check('learning progress survives reload', (await page.locator('.book-progress').innerText()).replace(/\s+/g, '') === `5/${EXPECTED_WORDS}`);
    check('N after reload is five', (await page.locator('.home-learn b').innerText()) === '5');
    await page.screenshot({ path: path.join(SHOTS, 'import-reload.png') });

    await page.locator('.book-bar').click();
    await page.waitForSelector('.picker');
    await page.waitForFunction(
      (name) => [...document.querySelectorAll('.picker-row')].some((row) => row.textContent?.includes(name)),
      MAIN_BOOK,
      { timeout: 20_000 },
    );
    check('imported book is listed in the picker', true);
    await page.screenshot({ path: path.join(SHOTS, 'import-picker.png') });
    await page.locator('.icon-action[aria-label="返回"]').click();
    await page.close();
    await context.close();

    // ── All matched tracks still playable ────────────────────────────────
    console.log(`[play] checking ${data.trackIds.length} tracks …`);
    const playResults = await pool(data.trackIds, 6, async (id) => {
      try {
        const response = await fetch(`${API}/api/song/${encodeURIComponent(id)}/play`, {
          headers: { Cookie: `oc_sid=${SID}` },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) return { id, ok: false, status: response.status };
        const info = await response.json();
        return { id, ok: Boolean(info.available), reason: info.reason ?? null, trial: info.trial ?? null };
      } catch (error) {
        return { id, ok: false, reason: error.message };
      }
    });
    const playFailures = playResults.filter((item) => !item.ok);
    check('every matched track is currently playable', playFailures.length === 0, `${playFailures.length} failed`);
    const playSummary = { checked: playResults.length, available: playResults.length - playFailures.length };

    // ── Real lyric timestamps for sampled cards ──────────────────────────
    const sampleTracks = [...new Set(data.samples.map((sample) => sample.track?.id).filter(Boolean))];
    const lyricFailures = [];
    const lyricChecked = [];
    for (const trackId of sampleTracks) {
      const payload = await requestJson(`/api/song/${encodeURIComponent(trackId)}/lyric`);
      const lines = parseLrc(payload.lrc ?? '');
      for (const sample of data.samples.filter((item) => item.track?.id === trackId)) {
        for (const line of sample.fragment?.lines ?? []) {
          const hit = lines.find(
            (item) => item.text === line.text && Math.abs(item.time - line.time) <= 0.12,
          );
          if (!hit) lyricFailures.push(`${sample.w}: missing ${line.time}s ${line.text.slice(0, 30)}`);
        }
        const target = tokens(sample.fragment?.target ?? '');
        const inFragment = (sample.fragment?.lines ?? []).some((line) =>
          [...tokens(line.text)].some((token) => target.has(token)),
        );
        if (!inFragment) lyricFailures.push(`${sample.w}: target not in fragment`);
        lyricChecked.push({ word: sample.w, trackId, start: sample.fragment?.start, lines: sample.fragment?.lines?.length });
      }
    }
    check('sampled fragments match live lyric timestamps', lyricFailures.length === 0, `${lyricChecked.length} checked`);
    const lyricSummary = { checked: lyricChecked.length, failures: lyricFailures };

    // ── Word-only fallback, isolated in a logged-out context ─────────────
    const plainContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
    });
    const plainPage = await plainContext.newPage();
    plainPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    plainPage.on('pageerror', (error) => pageErrors.push(error.message));
    await plainPage.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await plainPage.waitForSelector('.home');
    await plainPage.locator('.book-bar').click();
    await plainPage.waitForSelector('.picker');
    await plainPage.locator('.picker-import').click();
    await plainPage.waitForSelector('.import-sheet');
    await plainPage.locator('.import-input').fill('quixotic');
    await plainPage.waitForFunction(() => document.querySelector('.import-go')?.textContent?.includes('1'));
    await plainPage.locator('.import-go').click();
    await plainPage.waitForSelector('.import-done', { timeout: 30_000 });
    const plainSummary = (await plainPage.locator('.import-summary').innerText()).replace(/\s+/g, ' ').trim();
    check('pasted list creates a word-only book', plainSummary.startsWith('1 词'), plainSummary);
    await plainPage.locator('.import-use').click();
    await plainPage.waitForSelector('.home');
    await plainPage.waitForFunction(
      () => document.querySelector('.book-name')?.textContent === '导入词表 1',
      null,
      { timeout: 20_000 },
    );
    check('word-only book is active', true, await plainPage.locator('.book-name').innerText());
    await plainPage.locator('.home-learn').click();
    await plainPage.waitForSelector('.focus-card');
    await plainPage.waitForFunction(() => window.__orangecyFocusPhase === 'rest' || window.__orangecyFocusPhase === 'pronounce', null, { timeout: 10_000 });
    const plainSnapshot = await plainPage.evaluate(() => {
      const trace = window.__orangecyAudioTrace ?? [];
      return {
        word: document.querySelector('.word')?.textContent ?? '',
        plain: document.querySelector('.focus-card')?.getAttribute('data-plain') ?? null,
        hasLyrics: Boolean(document.querySelector('.lyrics')),
        hasProgress: Boolean(document.querySelector('.progress')),
        phase: window.__orangecyFocusPhase,
        flip: trace.find((event) => event.event === 'flip') ?? null,
        pronounce: trace.find((event) => event.event === 'pronounce') ?? null,
        fragment: trace.find((event) => event.event === 'fragment-start') ?? null,
        seek: trace.find((event) => event.event === 'seek-check') ?? null,
      };
    });
    check('plain card has no lyric fragment', plainSnapshot.hasLyrics === false && plainSnapshot.hasProgress === false && plainSnapshot.fragment === null && plainSnapshot.seek === null);
    check('plain card marks itself data-plain', plainSnapshot.plain === 'true');
    check('plain card speaks the word directly', Boolean(plainSnapshot.pronounce) && plainSnapshot.flip?.plain === true, plainSnapshot.word);
    await plainPage.screenshot({ path: path.join(SHOTS, 'import-plain.png') });
    await plainContext.close();

    // ── Desktop sheet evidence ───────────────────────────────────────────
    const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const deskPage = await deskContext.newPage();
    await deskPage.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await deskPage.waitForSelector('.home');
    await deskPage.locator('.book-bar').click();
    await deskPage.waitForSelector('.picker');
    await deskPage.locator('.picker-import').click();
    await deskPage.waitForSelector('.import-sheet');
    await deskPage.screenshot({ path: path.join(SHOTS, 'import-sheet-desktop.png') });
    await deskContext.close();

    check('no page errors during the import flow', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    check('no console errors during the import flow', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    const report = {
      generatedAt: new Date().toISOString(),
      api: API,
      app: APP_URL,
      session: { loggedIn: true, nickname: auth.profile?.nickname ?? null },
      elapsedMs,
      preset: { name: MAIN_BOOK, expectedWords: EXPECTED_WORDS },
      import: {
        summary,
        sub,
        stats: data.summaryStats,
        stored: {
          words: data.words,
          uniqueWords: data.uniqueWords,
          cards: data.cards,
          uniqueCards: data.uniqueCards,
          plain: data.plain,
          tracks: data.trackIds.length,
          badTargets: data.badTargets,
        },
        progressSamples,
      },
      samples: data.samples,
      plainSample: data.plainSample,
      seekChecks,
      trackAvailability: { ...playSummary, failures: playFailures.slice(0, 20) },
      lyricVerification: { checked: lyricChecked.length, failures: lyricFailures.slice(0, 20) },
      plainCard: { summary: plainSummary, snapshot: plainSnapshot },
      consoleErrors,
      pageErrors,
      checks: checks.length,
      failures,
      screenshots: [
        'docs/screenshots/import-entry.png',
        'docs/screenshots/import-sheet.png',
        'docs/screenshots/import-progress.png',
        'docs/screenshots/import-done.png',
        'docs/screenshots/import-home.png',
        'docs/screenshots/import-card.png',
        'docs/screenshots/import-reload.png',
        'docs/screenshots/import-picker.png',
        'docs/screenshots/import-plain.png',
        'docs/screenshots/import-sheet-desktop.png',
      ],
    };
    fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

    console.log(
      `\nImported ${data.words} words: ${data.cards} music cards + ${data.plain} plain cards, ${data.trackIds.length} tracks.`,
    );
    console.log(`Checks: ${checks.length - failures.length}/${checks.length}`);
    if (failures.length) {
      console.error('\nFailures:');
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
    } else {
      console.log('\nPASS: 高考 3500 imported, paired with the user’s songs, and studied end to end.');
    }
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  if (mainPage) {
    try {
      await mainPage.screenshot({ path: path.join(SHOTS, 'import-failure.png'), fullPage: true });
    } catch {
      // ignore screenshot failures
    }
  }
  console.error(`Acceptance failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
