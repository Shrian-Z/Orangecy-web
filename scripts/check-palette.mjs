#!/usr/bin/env node
/**
 * Palette guard for the migrated pages.
 *
 * It has two layers:
 * 1. Static: the new theme and the migrated components may only use
 *    #002FA7 / #FFFFFF (plus alpha), never gradients.
 * 2. Runtime: every visible element (and ::before/::after) on the playback
 *    stage and the word-card page is measured for painted colors, borders,
 *    outlines, shadows, backgrounds and masks.
 *
 * Run with the dev server up:
 *   npm run check:palette
 *
 * Override the target or browser if needed:
 *   APP_URL=http://localhost:5173 CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run check:palette
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BLUE = [0, 47, 167];
const WHITE = [255, 255, 255];
const SOURCE_FILES = [
  'src/theme.css',
  'src/App.tsx',
  'src/main.tsx',
  'src/components/CoverStage.tsx',
  'src/components/LyricsStage.tsx',
  'src/components/PlayerBar.tsx',
  'src/components/ImmersivePlayer.tsx',
  'src/components/TopBar.tsx',
  'src/components/WordCards.tsx',
  'src/components/WordPeek.tsx',
  'src/components/Toasts.tsx',
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
    const filename = path.join(root, relative);
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
  }
  return violations;
}

async function scanState(page, label) {
  return page.evaluate(({ label, blue, white }) => {
    const paintProps = [
      'color', 'backgroundColor',
      'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      'outlineColor', 'boxShadow', 'textShadow', 'fill', 'stroke',
    ];
    const graphics = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'use']);
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
      const backgroundImage = computed.backgroundImage;
      if (backgroundImage && backgroundImage !== 'none') {
        props.backgroundImage = backgroundImage;
        values.add(backgroundImage);
        if (/gradient\(/i.test(backgroundImage)) gradients.push({ tag: name, cls: className, pseudo: pseudo || '', prop: 'backgroundImage', value: backgroundImage });
      }
      const maskImage = computed.maskImage || computed.webkitMaskImage;
      if (maskImage && maskImage !== 'none') {
        props.maskImage = maskImage;
        values.add(maskImage);
        if (/gradient\(/i.test(maskImage)) gradients.push({ tag: name, cls: className, pseudo: pseudo || '', prop: 'maskImage', value: maskImage });
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
    };
  }, { label, blue: BLUE, white: WHITE });
}

function flatten(results) {
  return results.flatMap((result) =>
    result.violations.map((violation) => ({ state: result.label, ...violation })),
  );
}

function summarizeColors(results) {
  const tokens = new Set();
  for (const result of results) {
    for (const value of result.uniquePaintValues) {
      for (const match of value.matchAll(/rgba?\([^)]*\)/gi)) tokens.add(match[0].replace(/\s+/g, ' ').toLowerCase());
    }
  }
  return [...tokens].sort();
}

const sourceViolations = sourceAudit();
if (sourceViolations.length) {
  console.error('Source palette violations:');
  for (const violation of sourceViolations) console.error(`  - ${violation}`);
  process.exitCode = 1;
}

const launchOptions = { headless: true };
if (fs.existsSync(CHROME_PATH)) launchOptions.executablePath = CHROME_PATH;
const browser = await chromium.launch(launchOptions).catch((error) => {
  console.error(`Could not launch a browser. Set CHROME_PATH if needed.\n${error.message}`);
  process.exit(1);
});

const viewports = [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile-390' },
  { width: 320, height: 844, name: 'mobile-320' },
];

const results = [];
for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    hasTouch: viewport.name !== 'desktop',
  });
  await context.addInitScript(() => {
    localStorage.setItem('orangecy.wordbook', 'cet4');
    localStorage.setItem('orangecy.cardsAutoplay', '0');
    localStorage.setItem('orangecy.cardsSpeak', '0');
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60_000 }).catch((error) => {
    console.error(`Could not load ${APP_URL}. Start the dev server first.\n${error.message}`);
    process.exit(1);
  });
  await page.waitForTimeout(1_500);
  results.push(await scanState(page, `${viewport.name} / player`));

  const playButton = page.locator('.play-button').first();
  if (await playButton.isVisible().catch(() => false)) {
    await playButton.click();
    await page.waitForTimeout(1_600);
    results.push(await scanState(page, `${viewport.name} / player-playing`));
  }

  const target = page.locator('.lyric-word.is-target').first();
  if (await target.count()) {
    await target.click({ force: true });
    await page.waitForTimeout(500);
    results.push(await scanState(page, `${viewport.name} / word-peek`));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  const expand = page.locator('.cover-expand').first();
  if (await expand.count()) {
    await expand.click({ force: true });
    await page.waitForTimeout(500);
    results.push(await scanState(page, `${viewport.name} / immersive`));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  const navCard = page.locator('.nav-item[aria-label="词卡"]').first();
  if (await navCard.isVisible().catch(() => false)) await navCard.click();
  await page.waitForTimeout(1_000);
  results.push(await scanState(page, `${viewport.name} / word-cards`));

  if (browserErrors.length) {
    for (const error of browserErrors) console.error(`[${viewport.name}] browser error: ${error}`);
    process.exitCode = 1;
  }
  await context.close();
}

await browser.close();

const violations = flatten(results);
const gradients = results.flatMap((result) =>
  result.gradients.map((gradient) => ({ state: result.label, ...gradient })),
);
const report = {
  generatedAt: new Date().toISOString(),
  url: APP_URL,
  sourceViolations,
  violations,
  gradients,
  states: results.map((result) => ({
    state: result.label,
    paintedElements: result.painted,
    uniquePaintValues: result.uniquePaintValues.length,
    violations: result.violations.length,
  })),
  paletteTokensSeen: summarizeColors(results),
};
fs.writeFileSync(path.join(root, 'docs/palette-check.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('Orangecy palette check');
console.log(`URL: ${APP_URL}`);
console.log(`States scanned: ${results.length} (${viewports.map((v) => v.name).join(', ')})`);
for (const state of report.states) {
  console.log(`  ${state.state}: ${state.paintedElements} painted elements, ${state.uniquePaintValues} unique values, ${state.violations} violations`);
}
console.log(`Source violations: ${sourceViolations.length}`);
console.log(`Runtime violations: ${violations.length}`);
console.log(`Gradients: ${gradients.length}`);
console.log(`Palette color tokens observed: ${report.paletteTokensSeen.join(' · ')}`);
console.log('Report: docs/palette-check.json');

if (violations.length || gradients.length || sourceViolations.length) {
  if (violations.length) {
    console.error('\nRuntime violations:');
    console.error(JSON.stringify(violations.slice(0, 30), null, 2));
  }
  if (gradients.length) {
    console.error('\nGradients:');
    console.error(JSON.stringify(gradients.slice(0, 30), null, 2));
  }
  process.exit(1);
}

console.log('\nPASS: only #002FA7, #FFFFFF and their alpha values are painted.');
