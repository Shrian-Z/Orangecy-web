#!/usr/bin/env node
/**
 * Palette guard for the ammo-era focus card.
 *
 * Static: every source color must be #002FA7 / #FFFFFF (or a blue alpha tint);
 *         gradients and box/text shadows are forbidden.
 * Runtime: every visible element on the seven focus-card states is measured for
 *         painted colors, borders, outlines, shadows, backgrounds and masks.
 *         The learning state must expose blue music traces (target word,
 *         progress, mute icon).
 *
 * Run the built app first (or the dev server):
 *   npm run build
 *   APP_URL=http://127.0.0.1:8790 npm run check:palette
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:8790';
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BLUE = [0, 47, 167];
const WHITE = [255, 255, 255];

function walk(dir, predicate) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(relative, predicate));
    else if (predicate(relative)) out.push(relative);
  }
  return out;
}

const SOURCE_FILES = [
  ...walk('src', (file) => /\.(tsx?|css)$/.test(file)),
  'index.html',
  'public/favicon.svg',
];

function colorParts(value) {
  const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function sourceColorAllowed(value) {
  const source = String(value || '');
  if (source.startsWith('#')) {
    const hex = source.toLowerCase();
    return hex === '#002fa7' || hex === '#fff' || hex === '#ffffff';
  }
  if (/^rgba?\(/i.test(source)) {
    const [r, g, b, a] = colorParts(source.slice(source.indexOf('(') + 1, -1));
    if (a === 0) return true;
    const isBlue = r === BLUE[0] && g === BLUE[1] && b === BLUE[2];
    const isWhite = r === WHITE[0] && g === WHITE[1] && b === WHITE[2];
    return isBlue || isWhite;
  }
  return false;
}

function sourceAudit() {
  const violations = [];
  for (const relative of SOURCE_FILES) {
    const filename = path.join(ROOT, relative);
    if (!fs.existsSync(filename)) {
      violations.push(`${relative}: missing`);
      continue;
    }
    const text = fs.readFileSync(filename, 'utf8');
    for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) {
      const value = match[0];
      if (!sourceColorAllowed(value)) violations.push(`${relative}: ${value}`);
    }
    for (const match of text.matchAll(/gradient\(/gi)) {
      const line = text.slice(0, match.index).split('\n').length;
      violations.push(`${relative}:${line}: gradient()`);
    }
    for (const match of text.matchAll(/(?:box|text)-shadow\s*:\s*([^;}\n]+)/gi)) {
      if (!/^none\b/i.test(match[1].trim())) {
        const line = text.slice(0, match.index).split('\n').length;
        violations.push(`${relative}:${line}: shadow ${match[1].trim()}`);
      }
    }
  }
  return violations;
}

async function scanState(page, label) {
  return page.evaluate(
    ({ label, blue, white }) => {
      const paintProps = [
        'color',
        'backgroundColor',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'outlineColor',
        'boxShadow',
        'textShadow',
        'fill',
        'stroke',
      ];
      const graphics = new Set([
        'path',
        'circle',
        'rect',
        'line',
        'polyline',
        'polygon',
        'ellipse',
        'text',
        'use',
      ]);
      const isBlue = (r, g, b) => r === blue[0] && g === blue[1] && b === blue[2];
      const isWhite = (r, g, b) => r === white[0] && g === white[1] && b === white[2];
      const hasVisiblePaint = (value) => {
        for (const match of String(value).matchAll(/rgba?\(([^)]*)\)/gi)) {
          const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
          if ((parts[3] ?? 1) > 0) return true;
        }
        return !/rgba?\(/i.test(value);
      };
      const allowed = (value) => {
        const source = String(value || '');
        if (!source || source === 'none' || source === 'auto') return true;
        if (/currentcolor|transparent/i.test(source) && !/rgba?\(/i.test(source)) return true;
        let found = false;
        for (const match of source.matchAll(/rgba?\(([^)]*)\)/gi)) {
          found = true;
          const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
          const [r, g, b, a = 1] = parts;
          if (a === 0) continue;
          if (!isBlue(r, g, b) && !isWhite(r, g, b)) return false;
        }
        return found || !/rgba?\(|hsla?\(/i.test(source);
      };
      const violations = [];
      const gradients = [];
      const shadows = [];
      const values = new Set();
      let painted = 0;

      function inspect(el, pseudo) {
        if (['IMG', 'VIDEO', 'CANVAS', 'OPTION'].includes(el.tagName)) return;
        const computed = getComputedStyle(el, pseudo || undefined);
        if (computed.display === 'none' || computed.visibility === 'hidden') return;
        if (pseudo) {
          if (!computed.content || computed.content === 'none' || computed.content === 'normal') return;
        } else {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
        }
        const name = el.tagName.toLowerCase();
        const className = typeof el.className === 'string' ? el.className : '';
        const props = {};
        for (const prop of paintProps) {
          if ((prop === 'fill' || prop === 'stroke') && !graphics.has(name)) continue;
          if (prop === 'outlineColor') {
            if (parseFloat(computed.outlineWidth) === 0 || computed.outlineStyle === 'none') continue;
          }
          if (prop.startsWith('border')) {
            const widthProp = prop.replace('Color', 'Width');
            const styleProp = prop.replace('Color', 'Style');
            if (parseFloat(computed[widthProp]) === 0 || computed[styleProp] === 'none') continue;
          }
          const value = computed[prop];
          if (!value || value === 'none') continue;
          props[prop] = value;
          if (hasVisiblePaint(value)) values.add(value);
        }
        if ((computed.boxShadow && computed.boxShadow !== 'none') || (computed.textShadow && computed.textShadow !== 'none')) {
          shadows.push({ tag: name, cls: className, pseudo: pseudo || '', value: computed.boxShadow || computed.textShadow });
        }
        const backgroundImage = computed.backgroundImage;
        if (backgroundImage && backgroundImage !== 'none') {
          props.backgroundImage = backgroundImage;
          values.add(backgroundImage);
          if (/gradient\(/i.test(backgroundImage)) {
            gradients.push({ tag: name, cls: className, pseudo: pseudo || '', prop: 'backgroundImage', value: backgroundImage });
          }
        }
        const maskImage = computed.maskImage || computed.webkitMaskImage;
        if (maskImage && maskImage !== 'none') {
          props.maskImage = maskImage;
          values.add(maskImage);
          if (/gradient\(/i.test(maskImage)) {
            gradients.push({ tag: name, cls: className, pseudo: pseudo || '', prop: 'maskImage', value: maskImage });
          }
        }
        if (Object.keys(props).length) painted += 1;
        for (const [prop, value] of Object.entries(props)) {
          if (!allowed(value)) violations.push({ tag: name, cls: className, pseudo: pseudo || '', prop, value });
        }
      }

      for (const el of document.querySelectorAll('body *')) {
        inspect(el, null);
        inspect(el, '::before');
        inspect(el, '::after');
      }
      return {
        label,
        painted,
        uniquePaintValues: [...values].sort(),
        violations,
        gradients,
        shadows,
      };
    },
    { label, blue: BLUE, white: WHITE },
  );
}

async function musicTrace(page) {
  return page.evaluate(() => {
    const target = document.querySelector('.word-token.is-target');
    const progress = document.querySelector('.progress span');
    const mute = document.querySelector('.mute');
    return {
      target: Boolean(target),
      targetColor: target ? getComputedStyle(target).color : null,
      progress: Boolean(progress),
      progressColor: progress ? getComputedStyle(progress).backgroundColor : null,
      mute: Boolean(mute),
      muteColor: mute ? getComputedStyle(mute).color : null,
    };
  });
}

function freezeIntro() {
  const original = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => {
    if (typeof ms === 'number' && ms >= 500 && !window.__focusRelease) return 0;
    return original(fn, ms, ...args);
  };
}

async function openPage(context, { muted = false } = {}) {
  await context.addInitScript((mutedValue) => {
    localStorage.setItem('orangecy.muted', mutedValue ? '1' : '0');
  }, muted);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.focus-card');
  await page.evaluate(() => document.fonts?.ready);
  return page;
}

async function expandCard(page) {
  await page.locator('.focus-card').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

const browserErrors = [];
const sourceViolations = sourceAudit();
const launchOptions = { headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] };
if (fs.existsSync(CHROME_PATH)) launchOptions.executablePath = CHROME_PATH;
const browser = await chromium.launch(launchOptions).catch((error) => {
  console.error(`Could not launch a browser. Set CHROME_PATH if needed.\n${error.message}`);
  process.exit(1);
});

const viewports = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile-390' },
  { width: 320, height: 568, name: 'mobile-320' },
];

const results = [];
const musicTraces = [];

try {
  for (const viewport of viewports) {
    const base = {
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      hasTouch: viewport.name !== 'desktop',
      isMobile: viewport.name !== 'desktop',
    };

    const frozen = await browser.newContext(base);
    await frozen.addInitScript(freezeIntro);
    const frozenPage = await openPage(frozen);
    results.push(await scanState(frozenPage, `${viewport.name} / collapsed`));
    musicTraces.push({ state: `${viewport.name} / collapsed`, ...(await musicTrace(frozenPage)) });
    await expandCard(frozenPage);
    results.push(await scanState(frozenPage, `${viewport.name} / expanded`));
    musicTraces.push({ state: `${viewport.name} / expanded`, ...(await musicTrace(frozenPage)) });
    await frozen.close();

    const playingContext = await browser.newContext(base);
    const playing = await openPage(playingContext);
    await playing.waitForFunction(() => window.__orangecyFocusPhase === 'fragment', null, { timeout: 20_000 });
    await playing.waitForTimeout(700);
    results.push(await scanState(playing, `${viewport.name} / playing`));
    musicTraces.push({ state: `${viewport.name} / playing`, ...(await musicTrace(playing)) });
    await playingContext.close();

    const mutedContext = await browser.newContext(base);
    const muted = await openPage(mutedContext, { muted: true });
    await muted.waitForFunction(() => window.__orangecyFocusPhase === 'fragment', null, { timeout: 20_000 });
    await muted.waitForTimeout(700);
    results.push(await scanState(muted, `${viewport.name} / muted`));
    musicTraces.push({ state: `${viewport.name} / muted`, ...(await musicTrace(muted)) });
    await mutedContext.close();

    const placeholderContext = await browser.newContext(base);
    const placeholder = await openPage(placeholderContext);
    await placeholder.locator('.tab[aria-label="复习"]').click();
    await placeholder.waitForTimeout(300);
    results.push(await scanState(placeholder, `${viewport.name} / placeholder`));
    await placeholderContext.close();
  }
} finally {
  await browser.close();
}

const violations = results.flatMap((result) =>
  result.violations.map((violation) => ({ state: result.label, ...violation })),
);
const gradients = results.flatMap((result) =>
  result.gradients.map((gradient) => ({ state: result.label, ...gradient })),
);
const shadows = results.flatMap((result) =>
  result.shadows.map((shadow) => ({ state: result.label, ...shadow })),
);
const blueColor = (value) => /^rgba?\(0,\s*47,\s*167(?:,\s*[\d.]+)?\)$/.test(value || '');
const musicFailures = musicTraces.filter(
  (trace) =>
    !trace.target ||
    !blueColor(trace.targetColor) ||
    !trace.progress ||
    !blueColor(trace.progressColor) ||
    !trace.mute ||
    !blueColor(trace.muteColor),
);

const paletteTokensSeen = [
  ...new Set(
    results.flatMap((result) => result.uniquePaintValues.flatMap((value) => [...String(value).matchAll(/rgba?\([^)]*\)/gi)].map((match) => match[0].replace(/\s+/g, ' ').toLowerCase()))),
  ),
].sort();
const blueAlphaValues = [
  ...new Set(
    paletteTokensSeen
      .filter((token) => /^rgba?\(0, 47, 167/i.test(token))
      .map((token) => {
        const parts = token.slice(token.indexOf('(') + 1, -1).split(',').map((part) => Number.parseFloat(part.trim()));
        return parts[3] ?? 1;
      }),
  ),
].sort((a, b) => a - b);
const expectedLadder = [0.08, 0.18, 0.28, 0.34, 0.4, 0.48, 0.55, 0.7, 0.8, 1];
const ladder = {
  expected: expectedLadder,
  observed: blueAlphaValues,
  missing: expectedLadder.filter((alpha) => !blueAlphaValues.some((value) => Math.abs(value - alpha) < 0.005)),
};

const report = {
  generatedAt: new Date().toISOString(),
  url: APP_URL,
  sourceFiles: SOURCE_FILES,
  sourceViolations,
  violations,
  gradients,
  shadows,
  musicTraces,
  paletteTokensSeen,
  ladder,
  browserErrors,
  states: results.map((result) => ({
    state: result.label,
    paintedElements: result.painted,
    uniquePaintValues: result.uniquePaintValues.length,
    violations: result.violations.length,
    gradients: result.gradients.length,
    shadows: result.shadows.length,
  })),
};
fs.writeFileSync(path.join(ROOT, 'docs/palette-check.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('Orangecy palette check');
console.log(`URL: ${APP_URL}`);
console.log(`States scanned: ${results.length}`);
for (const state of report.states) {
  console.log(
    `  ${state.state}: ${state.paintedElements} painted elements, ${state.uniquePaintValues} unique values, ${state.violations} violations`,
  );
}
console.log(`Source violations: ${sourceViolations.length}`);
console.log(`Runtime violations: ${violations.length}`);
console.log(`Gradients: ${gradients.length}`);
console.log(`Shadows: ${shadows.length}`);
console.log(`Music-trace states: ${musicTraces.length - musicFailures.length}/${musicTraces.length}`);
console.log(`Palette tokens observed: ${paletteTokensSeen.join(' · ')}`);
console.log(`Ladder observed: ${ladder.observed.map((value) => `${Math.round(value * 100)}%`).join(' / ')}`);
console.log(`Ladder missing: ${ladder.missing.length ? ladder.missing.map((value) => `${Math.round(value * 100)}%`).join(' / ') : 'none'}`);
console.log('Report: docs/palette-check.json');

if (violations.length || gradients.length || shadows.length || sourceViolations.length || musicFailures.length || browserErrors.length) {
  if (sourceViolations.length) console.error('Source violations:', sourceViolations.slice(0, 20));
  if (violations.length) console.error('Runtime violations:', violations.slice(0, 20));
  if (gradients.length) console.error('Gradients:', gradients.slice(0, 20));
  if (shadows.length) console.error('Shadows:', shadows.slice(0, 20));
  if (musicFailures.length) console.error('Music traces missing:', musicFailures);
  if (browserErrors.length) console.error('Browser errors:', browserErrors.slice(0, 20));
  process.exit(1);
}

console.log('\nPASS: only #002FA7, #FFFFFF and their alpha values are painted.');
