#!/usr/bin/env node
/**
 * Generate the desktop / mobile / small focus-card screenshots for the four
 * states: collapsed, expanded, playing, muted.
 *
 * Collapsed and expanded freeze the intro timer so the shots show progress 0
 * (the design's collapsed state). Playing and muted use the real timeline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = process.env.APP_URL || 'http://127.0.0.1:8787';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(ROOT, 'docs/screenshots');

const viewports = [
  { name: 'desktop', width: 1440, height: 900, dpr: 1, touch: false },
  { name: 'mobile', width: 390, height: 844, dpr: 2, touch: true },
  { name: 'small', width: 320, height: 568, dpr: 2, touch: true },
];

const errors = [];

function freezeIntro() {
  const original = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => {
    if (typeof ms === 'number' && ms >= 500 && !window.__focusRelease) return 0;
    return original(fn, ms, ...args);
  };
}

async function openPage(context, { muted = false } = {}) {
  if (muted) {
    await context.addInitScript(() => localStorage.setItem('orangecy.muted', '1'));
  } else {
    await context.addInitScript(() => localStorage.setItem('orangecy.muted', '0'));
  }
  await context.addInitScript(() => localStorage.setItem('orangecy.book', 'cet4'));
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`PAGE ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.locator('.home-learn').click();
  await page.waitForSelector('.focus-card');
  await page.evaluate(() => document.fonts?.ready);
  return page;
}

async function expandByKeyboard(page) {
  await page.locator('.focus-card').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const expanded = await page.locator('.focus-card').getAttribute('data-expanded');
  if (expanded !== 'true') throw new Error(`card did not expand (${expanded})`);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

fs.mkdirSync(OUT, { recursive: true });

try {
  for (const viewport of viewports) {
    const base = {
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dpr,
      hasTouch: viewport.touch,
      isMobile: viewport.touch,
    };

    // Collapsed + expanded: freeze the 520ms intro so progress stays at 0.
    const frozen = await browser.newContext(base);
    await frozen.addInitScript(freezeIntro);
    const collapsed = await openPage(frozen);
    await collapsed.waitForTimeout(150);
    await collapsed.screenshot({
      path: path.join(OUT, `focus-${viewport.name}-collapsed.png`),
    });
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await collapsed.screenshot({
        path: path.join(
          OUT,
          viewport.name === 'desktop' ? 'focus-first-frame.png' : 'focus-first-frame-mobile.png',
        ),
      });
    }
    await expandByKeyboard(collapsed);
    await collapsed.screenshot({
      path: path.join(OUT, `focus-${viewport.name}-expanded.png`),
    });
    await frozen.close();

    // Playing: real timeline, wait until the fragment is visibly underway.
    const playingContext = await browser.newContext(base);
    const playing = await openPage(playingContext);
    await playing.waitForFunction(() => window.__orangecyFocusPhase === 'fragment');
    await playing.waitForTimeout(2600);
    await playing.screenshot({
      path: path.join(OUT, `focus-${viewport.name}-playing.png`),
    });
    await playingContext.close();

    // Muted: real timeline, mute persisted before boot.
    const mutedContext = await browser.newContext(base);
    const muted = await openPage(mutedContext, { muted: true });
    await muted.waitForFunction(() => window.__orangecyFocusPhase === 'fragment');
    await muted.waitForTimeout(2600);
    await muted.screenshot({
      path: path.join(OUT, `focus-${viewport.name}-muted.png`),
    });
    await mutedContext.close();

    console.log(`[shoot] ${viewport.name} ${viewport.width}x${viewport.height} done`);
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.error(`Browser errors:\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('PASS: all focus-card screenshots written to docs/screenshots/.');
}
