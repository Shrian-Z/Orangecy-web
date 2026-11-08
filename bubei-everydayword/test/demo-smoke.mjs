#!/usr/bin/env node
/**
 * Browser smoke for the standalone daily-quota demo.
 *
 * Build first:  npm run build
 * Run:          npm run smoke:demo
 *
 * Uses the system Chrome via playwright-core. Override with CHROME_PATH.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '../../node_modules/playwright-core/index.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const failures = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.join(DIST, rel);
    if (!file.startsWith(DIST)) throw new Error('path');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(8799, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto('http://127.0.0.1:8799/', { waitUntil: 'networkidle' });

  const quota = async () => (await page.locator('#quota').textContent())?.trim();
  const sub = async () => (await page.locator('#sub').textContent())?.trim();
  const learned = async () => page.locator('#learned').inputValue();
  const due = async () => page.locator('#due').inputValue();

  check('首页额度 30', (await quota()) === '30');
  check('分组 10/10/10', JSON.stringify(await page.locator('#groups .chip').allTextContents()) === '["10","10","10"]');
  check('ETA 含年份', (await sub())?.includes('2027年'), await sub());

  await page.locator('#learn').click();
  check('学一组后额度 20', (await quota()) === '20');
  check('学一组后已学 10', (await learned()) === '10');

  await page.locator('#learned').fill('30');
  await page.locator('#learned').dispatchEvent('input');
  check('配额完成后额度 0', (await quota()) === '0');
  check('完成后出现再学一组', await page.locator('#extra').isVisible());
  check('完成提示存在', ((await page.locator('#hint').textContent()) || '').includes('再学一组'));

  await page.locator('#extra').click();
  check('超额后已学 40', (await learned()) === '40');
  check('超额后额度仍 0', (await quota()) === '0');

  const dueBefore = Number(await due());
  await page.locator('#review').click();
  check('复习扣减到期数', Number(await due()) === dueBefore - 10);

  await page.locator('#daily').selectOption('50');
  check('改配额 50 后额度 10', (await quota()) === '10');
  check('改配额不清零已学', (await learned()) === '40');

  await page.locator('#mode').click();
  check('自由学额度 = 剩余', (await quota()) === '3480');
  check('自由学无 ETA', (await sub())?.includes('自由学'));

  await page.locator('#mode').click();
  await page.locator('#clock').selectOption('03:59');
  check('03:59 属于前一天', ((await page.locator('#dayline').textContent()) || '').includes('2026-11-05'));
  check('边界前跨天归零', (await learned()) === '0');
  await page.locator('#clock').selectOption('04:00');
  check('04:00 进入新学习日', ((await page.locator('#dayline').textContent()) || '').includes('2026-11-06'));

  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(ROOT, 'demo', 'screenshot.png'), fullPage: true });

  check('无 console/page 错误', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('smoke 未抛异常', false, String(error));
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll demo checks passed.');
