#!/usr/bin/env node
/**
 * Capture and verify the per-card audio timeline from the built app.
 *
 * Checks:
 *   - flip -> 200ms intro -> fragment
 *   - 200ms fade-in, 200ms fade-out ending at the fragment end
 *   - 500ms quiet between pause and pronunciation
 *   - pronunciation starts with fadeIn 0 / fadeOut 0 (browser TTS, no ramp)
 *
 * Writes docs/audio-trace.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = process.env.APP_URL || 'http://127.0.0.1:8787';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REPORT = path.join(ROOT, 'docs/audio-trace.json');

const failures = [];
const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? ` · ${detail}` : ''}`);
}

function event(trace, name, predicate = () => true) {
  return trace.find((item) => item.event === name && predicate(item));
}

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('orangecy.muted', '0');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.focus-card');
  const word = await page.locator('.word').innerText();
  await page.waitForFunction(() => window.__orangecyFocusPhase === 'rest', null, {
    timeout: 20_000,
  });
  const trace = await page.evaluate(() => window.__orangecyAudioTrace ?? []);

  const flip = event(trace, 'flip');
  const fragment = event(trace, 'fragment-start');
  const fadeIn = event(trace, 'fade', (item) => item.from === 0 && item.to === 1);
  const fadeInEnd = event(trace, 'fade-end', (item) => item.to === 1);
  const fadeOut = event(trace, 'fade', (item) => item.from >= 0.9 && item.to === 0);
  const fadeOutEnd = event(trace, 'fade-end', (item) => item.to === 0);
  const pause = event(trace, 'pause');
  const quiet = event(trace, 'quiet');
  const pronounce = event(trace, 'pronounce');

  check('card is lose', word === 'lose', word);
  check('flip logged', Boolean(flip));
  check('fragment starts after flip + 200ms', Boolean(fragment) && fragment.at - flip.at >= 500, `${fragment?.at}ms`);
  check('fade-in 200ms', Boolean(fadeIn && fadeInEnd && fadeIn.ms === 200), `${fadeIn?.ms}ms`);
  check(
    'fade-in actually takes ~200ms',
    Boolean(fadeInEnd) && Math.abs(fadeInEnd.elapsed - 200) <= 40,
    `${fadeInEnd?.elapsed}ms`,
  );
  check('fade-out 200ms', Boolean(fadeOut && fadeOutEnd && fadeOut.ms === 200), `${fadeOut?.ms}ms`);
  check(
    'fade-out actually takes ~200ms',
    Boolean(fadeOutEnd) && Math.abs(fadeOutEnd.elapsed - 200) <= 40,
    `${fadeOutEnd?.elapsed}ms`,
  );
  check('fragment pauses at end', Boolean(pause));
  check('500ms quiet', Boolean(quiet && quiet.ms === 500), `${quiet?.ms}ms`);
  check(
    'pronunciation starts after the quiet',
    Boolean(pronounce && pause && pronounce.at - pause.at >= 500),
    `${pronounce && pause ? (pronounce.at - pause.at).toFixed(1) : '?'}ms`,
  );
  check(
    'pronunciation is direct (no fade)',
    Boolean(pronounce && pronounce.fadeIn === 0 && pronounce.fadeOut === 0),
    `fadeIn=${pronounce?.fadeIn} fadeOut=${pronounce?.fadeOut}`,
  );
  const fadeBetweenQuietAndPronounce = trace.some(
    (item) =>
      item.event === 'fade' &&
      pronounce &&
      pause &&
      item.at >= pause.at &&
      item.at <= pronounce.at,
  );
  check('no fade around pronunciation', !fadeBetweenQuietAndPronounce);
  check('browser console clean', errors.length === 0, errors.join(' / ').slice(0, 300));

  const report = {
    generatedAt: new Date().toISOString(),
    url: URL,
    card: word,
    checks,
    failures,
    trace,
  };
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Audio trace · ${word} · ${trace.length} events`);
  for (const item of trace) {
    const details = Object.entries(item)
      .filter(([key]) => key !== 'at' && key !== 'event')
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    console.log(`  ${String(item.at).padStart(8)}ms  ${item.event.padEnd(18)} ${details}`);
  }
  console.log(`\nChecks: ${checks.length - failures.length}/${checks.length}`);
  if (failures.length) {
    console.error('Failures:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('PASS: fade 0.2s / quiet 0.5s / pronounce direct.');
  }
  await context.close();
} finally {
  await browser.close();
}
