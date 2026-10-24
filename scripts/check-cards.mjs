#!/usr/bin/env node
/**
 * Build-time guard for the focus deck.
 *
 * Every card must point at a real playable netease track, and every lyric line
 * in a fragment must exist in the live lyric payload at exactly that timestamp.
 * The bundled copy (src/data) must be byte-identical to the public artifact.
 *
 * The local API must be running (npm run dev / npm start):
 *   node scripts/check-cards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseLrc } from '../server/lyrics.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = process.env.CARDS_API || 'http://127.0.0.1:8787';
const COOKIE = process.env.CARDS_COOKIE || '';
const SESSION_PREFIX = (COOKIE.match(/oc_sid=([^;]+)/)?.[1] ?? '').slice(0, 6);
const PUBLIC_FILE = path.join(ROOT, 'public/cards/seed-50.json');
const SRC_FILE = path.join(ROOT, 'src/data/seed-50.json');
const REPORT = path.join(ROOT, 'docs/cards-check.json');

const failures = [];
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? ` · ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: COOKIE ? { Cookie: COOKIE } : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

function tokens(text) {
  return new Set(text.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) ?? []);
}

async function main() {
  if (!fs.existsSync(PUBLIC_FILE) || !fs.existsSync(SRC_FILE)) {
    throw new Error('缺少卡片数据；先运行 node scripts/build-cards.mjs');
  }
  const publicRaw = fs.readFileSync(PUBLIC_FILE, 'utf8');
  const srcRaw = fs.readFileSync(SRC_FILE, 'utf8');
  check('bundled copy matches public artifact', publicRaw === srcRaw);

  const deck = JSON.parse(publicRaw);
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  check('50 cards', cards.length === 50, `${cards.length}`);
  check('unique words', new Set(cards.map((card) => card.w)).size === cards.length);
  check('versioned deck', deck.version === 1);

  for (const [index, card] of cards.entries()) {
    const label = `${String(index + 1).padStart(2, '0')} ${card.w}`;
    const fragment = card.fragment ?? {};
    const lines = Array.isArray(fragment.lines) ? fragment.lines : [];
    check(`${label}: word/meaning`, Boolean(card.w && card.m), card.m);
    check(`${label}: fragment lines 1-2`, lines.length >= 1 && lines.length <= 2, `${lines.length}`);
    check(`${label}: start = first lyric time`, Math.abs(fragment.start - lines[0]?.time) <= 0.01);
    check(
      `${label}: plausible duration`,
      fragment.end - fragment.start >= 2.5 && fragment.end - fragment.start <= 13,
      `${(fragment.end - fragment.start).toFixed(2)}s`,
    );
    check(
      `${label}: target in fragment lines`,
      lines.some((line) => tokens(line.text).has(String(fragment.target).toLowerCase())),
      fragment.target,
    );
    check(`${label}: track metadata`, Boolean(card.track?.id && card.track?.title));
    check(`${label}: track id matches`, card.track?.id === fragment.trackId);
  }

  const trackIds = [...new Set(cards.map((card) => card.fragment.trackId))];
  const lyrics = new Map();
  const availability = [];
  for (const trackId of trackIds) {
    const play = await requestJson(`${API}/api/song/${encodeURIComponent(trackId)}/play`);
    check(`track ${trackId}: playable`, Boolean(play.available), play.reason ?? '');
    availability.push({
      trackId,
      available: Boolean(play.available),
      trial: play.trial ?? null,
      reason: play.reason ?? null,
    });

    const payload = await requestJson(`${API}/api/song/${encodeURIComponent(trackId)}/lyric`);
    check(`track ${trackId}: lyric exists`, Boolean(payload.lrc?.trim()));
    lyrics.set(trackId, parseLrc(payload.lrc ?? ''));
    await sleep(100);
  }

  for (const [index, card] of cards.entries()) {
    const label = `${String(index + 1).padStart(2, '0')} ${card.w}`;
    const actual = lyrics.get(card.fragment.trackId) ?? [];
    for (const line of card.fragment.lines) {
      const hit = actual.find(
        (item) => item.text === line.text && Math.abs(item.time - line.time) <= 0.12,
      );
      check(`${label}: real lyric timestamp`, Boolean(hit), `${line.time}s ${line.text.slice(0, 40)}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    api: API,
    authCookie: Boolean(COOKIE),
    sessionPrefix: SESSION_PREFIX || null,
    cards: cards.length,
    tracks: trackIds.length,
    words: cards.map((card) => card.w),
    availability,
    checks: checks.length,
    failures,
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Focus deck: ${cards.length} cards / ${trackIds.length} tracks`);
  console.log(`Auth cookie: ${COOKIE ? `yes (${SESSION_PREFIX || 'set'})` : 'no'}`);
  console.log(`Checks: ${checks.length - failures.length}/${checks.length}`);
  if (failures.length) {
    console.error('\nFailures:');
    for (const failure of failures.slice(0, 40)) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('PASS: every fragment is playable and matches the live lyric timestamps.');
}

try {
  await main();
} catch (error) {
  console.error(`Card check failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
