#!/usr/bin/env node
/**
 * 三槽导航 + 歌单世界端到端证据：学习首页、歌单漂浮层、列表播放中、歌词视图、
 * 离开歌单后 FocusCard 片段仍正常、未登录空态。
 *
 *   ORANGECY_SID=<已登录网易的 oc_sid> APP_URL=http://127.0.0.1:8787 npm run shoot:nav
 *
 * 不给 ORANGECY_SID 时从 data/sessions.json 取第一个带网易 cookie 的本机会话。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(ROOT, 'docs/screenshots');

function savedSid() {
  if (process.env.ORANGECY_SID) return process.env.ORANGECY_SID;
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sessions.json'), 'utf8'));
    return saved.sessions.find((entry) => entry.cookie)?.id ?? '';
  } catch {
    return '';
  }
}

const results = [];
let failures = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
}

const sid = savedSid();
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const errors = [];

async function open(viewport, withSession) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  if (withSession && sid) {
    await context.addCookies([{ name: 'oc_sid', value: sid, url: APP_URL }]);
  }
  await context.addInitScript(() => {
    localStorage.setItem('orangecy.muted', '0');
    localStorage.setItem('orangecy.book', 'cet4');
    const play = HTMLMediaElement.prototype.play;
    window.__media = new Set();
    HTMLMediaElement.prototype.play = function trackedPlay(...args) {
      window.__media.add(this);
      return play.apply(this, args);
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.home');
  return { context, page };
}

const evidence = { generatedAt: new Date().toISOString(), url: APP_URL, session: sid ? `${sid.slice(0, 6)}…` : null };

try {
  check('有已登录会话可用', Boolean(sid));
  const { context, page } = await open({ width: 390, height: 844 }, true);

  await page.waitForFunction(() => document.querySelector('.home-learn b')?.textContent !== '0');
  evidence.home = await page.evaluate(() => ({
    book: document.querySelector('.book-name')?.textContent,
    progress: document.querySelector('.book-progress')?.textContent,
    learn: document.querySelector('.home-learn')?.textContent,
    review: document.querySelector('.home-review')?.textContent,
  }));
  check('学习页有词书条 + 学习/复习两钮', Boolean(evidence.home.book && evidence.home.learn && evidence.home.review), JSON.stringify(evidence.home));
  await page.screenshot({ path: path.join(SHOTS, 'nav-learn-home.png') });

  await page.locator('.tab[aria-label="歌单"]').click();
  await page.waitForSelector('.shelf-card');
  const shelf = await page.locator('.shelf-card').count();
  evidence.shelf = { playlists: shelf, first: await page.locator('.shelf-card .shelf-name').first().innerText() };
  check('歌单漂浮层有真实歌单', shelf >= 1, JSON.stringify(evidence.shelf));
  const chrome = await page.evaluate(() => {
    const world = document.querySelector('.world')?.cloneNode(true);
    world?.querySelectorAll('.shelf-name, .shelf-count').forEach((node) => node.remove());
    return { text: world?.textContent?.trim() ?? '', inputs: world?.querySelectorAll('input').length ?? 0 };
  });
  check('歌单层除歌单名/曲数外无其它文字、无搜索框', chrome.text === '' && chrome.inputs === 0, JSON.stringify(chrome));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, 'nav-shelf.png') });

  await page.locator('.shelf-card').first().click({ force: true });
  await page.waitForSelector('.track-row');
  evidence.list = { rows: await page.locator('.track-row').count(), title: await page.locator('.tracks .page-title').innerText() };
  check('点进歌单列表非空', evidence.list.rows > 0, JSON.stringify(evidence.list));
  await page.locator('.track-scroll').evaluate((node) => node.scrollTo(0, node.scrollHeight));
  await page.waitForFunction((rows) => document.querySelectorAll('.track-row').length > rows, evidence.list.rows, { timeout: 15_000 }).catch(() => {});
  evidence.list.afterScroll = await page.locator('.track-row').count();
  check('滚到底自动分页', evidence.list.afterScroll > evidence.list.rows || evidence.list.rows < 100, `${evidence.list.rows} -> ${evidence.list.afterScroll}`);
  await page.locator('.track-scroll').evaluate((node) => node.scrollTo(0, 0));

  let played = null;
  for (let index = 0; index < 6 && !played; index += 1) {
    await page.locator('.track-row').nth(index).click();
    const ok = await page
      .waitForFunction(() => document.querySelector('.now-toggle')?.getAttribute('aria-label') === '暂停', null, { timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) played = { index, title: await page.locator('.now-title').innerText() };
  }
  evidence.playing = played;
  check('点播一曲可听', Boolean(played), JSON.stringify(played));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, 'nav-list-playing.png') });

  await page.locator('.now-main').click();
  await page.waitForSelector('.lyric-view');
  await page.waitForSelector('.lyric-line.is-active', { timeout: 15_000 }).catch(() => {});
  evidence.lyrics = { lines: await page.locator('.lyric-line').count() };
  check('歌词视图有文本或诚实空态', evidence.lyrics.lines > 0 || (await page.locator('.lyric-view .world-state').count()) === 1, JSON.stringify(evidence.lyrics));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SHOTS, 'nav-lyrics.png') });

  await page.locator('.tab[aria-label="学习"]').click();
  await page.waitForTimeout(400);
  const pausedAfterLeave = await page.evaluate(() => window.__media.size > 0 && [...window.__media].every((el) => el.paused));
  check('离开歌单世界即暂停整曲', pausedAfterLeave);
  await page.locator('.tab[aria-label="歌单"]').click();
  await page.waitForTimeout(200);
  check('离开歌单世界后播控收起', (await page.locator('.now').count()) === 0);
  await page.locator('.tab[aria-label="学习"]').click();
  await page.locator('.home-learn').click();
  await page.waitForSelector('.focus-card');
  await page.waitForFunction(
    () => (window.__orangecyAudioTrace ?? []).some((item) => item.event === 'seek-check'),
    null,
    { timeout: 20_000 },
  );
  const trace = await page.evaluate(() => window.__orangecyAudioTrace ?? []);
  const seek = trace.find((item) => item.event === 'seek-check');
  evidence.cardAfterWorld = {
    pausedAfterLeave,
    loadTrack: trace.find((item) => item.event === 'load-track') ?? null,
    fadeIn: trace.some((item) => item.event === 'fade' && item.to === 1 && item.ms === 200),
    seekCheck: seek,
  };
  check('回卡后重新装载卡内曲目', Boolean(evidence.cardAfterWorld.loadTrack), JSON.stringify(evidence.cardAfterWorld.loadTrack));
  check('回卡后片段 200ms 淡入 + seek 通过', evidence.cardAfterWorld.fadeIn && seek?.passed === true, JSON.stringify(seek));
  await context.close();

  const anon = await open({ width: 390, height: 844 }, false);
  await anon.page.locator('.tab[aria-label="歌单"]').click();
  await anon.page.waitForSelector('.world-connect');
  check('未登录：歌单空态 + 去连接音源', await anon.page.locator('.world-connect').isVisible());
  await anon.page.screenshot({ path: path.join(SHOTS, 'nav-shelf-empty.png') });
  await anon.page.locator('.world-connect').click();
  await anon.page.waitForSelector('.my-page');
  check('去连接音源跳到「我的」', await anon.page.locator('.my-add').isVisible());
  await anon.context.close();

  check('浏览器 console 干净', errors.length === 0, errors.slice(0, 3).join(' / '));
} catch (error) {
  check('shoot:nav 执行', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

evidence.results = results;
fs.writeFileSync(path.join(ROOT, 'docs/evidence/nav-e2e.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`\n${results.length - failures}/${results.length} 项通过 · docs/evidence/nav-e2e.json`);
if (failures) process.exitCode = 1;
