#!/usr/bin/env node
/**
 * Build the 50-word focus deck from the real catalog + the local lyric proxy.
 *
 * The deck is not hand-written: every fragment comes from a playable netease
 * track in data/catalog.json, uses the real lyric timestamp of the target line,
 * and carries the wordbook definition (CET4) for the studied word.
 *
 * Outputs (same JSON, one bundled copy for first-paint, one public artifact):
 *   src/data/seed-50.json
 *   public/cards/seed-50.json
 *
 * Run the local API first (port 8787):
 *   node scripts/build-cards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseLrc } from '../server/lyrics.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = process.env.CARDS_API || 'http://127.0.0.1:8787';
const CATALOG = path.join(ROOT, 'data/catalog.json');
const WORDBOOK = path.join(ROOT, 'public/wordbooks/cet4.json');
const OUT_PUBLIC = path.join(ROOT, 'public/cards/seed-50.json');
const OUT_SRC = path.join(ROOT, 'src/data/seed-50.json');
const CACHE = path.join(ROOT, '.probe/cards-lyrics.json');
const TARGET_COUNT = 50;
const MAX_PER_SONG = 4;
const PRIORITY = new Set(['lose']);
const BANNED = new Set(['damn']);

const STOPWORDS = new Set(
  `about across after again against all almost alone along already also always among and another any anyone
  anything around as at away back be because become before begin behind below beside between both but by can
  could did do does down during each either else enough even ever every few for from further get go had has
  have he her here hers herself him himself his how however i if in into is it its itself just like long
  make many may me might more most much must my myself no nor not now of off on once one only or other our
  ours ourselves out over own same said say see she should since so some still such take than that the their
  theirs them themselves then there these they this those through to too under until up us very was we well
  were what when where whether which while who whom why will with within without would you your yours
  yourself yourselves`.split(/\s+/).filter(Boolean),
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, tries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastError;
}

function loadLyricCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}

async function fetchLyrics(song) {
  const cache = loadLyricCache();
  if (cache[song.id]?.lrc) return cache[song.id].lrc;
  const payload = await requestJson(`${API}/api/song/${encodeURIComponent(song.id)}/lyric`);
  cache[song.id] = { lrc: payload.lrc ?? '', tlyric: payload.tlyric ?? '' };
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(cache), 'utf8');
  await sleep(250);
  return cache[song.id].lrc;
}

function isUsableWord(entry) {
  const word = String(entry?.[0] ?? '');
  if (word.length < 4 || word.length > 16) return false;
  if (!/^[a-z][a-z'-]*$/i.test(word)) return false;
  if (STOPWORDS.has(word.toLowerCase())) return false;
  if (BANNED.has(word.toLowerCase())) return false;
  const meaning = String(entry?.[2] ?? '');
  return Boolean(meaning) && /\p{Script=Han}/u.test(meaning);
}

function pickLines(lines, hit) {
  let index = lines.findIndex(
    (line) => Math.abs(line.time - hit.t) <= 0.12 && line.text === hit.line,
  );
  if (index < 0) {
    index = lines.findIndex(
      (line) => Math.abs(line.time - hit.t) <= 0.2 && line.text.includes(hit.surface),
    );
  }
  if (index < 0) return null;
  const first = lines[index];
  const second = lines[index + 1];
  const after = lines[index + 2];
  const twoLines = Boolean(second) && second.time - first.time <= 12;
  const picked = twoLines ? [first, second] : [first];
  const rawEnd = twoLines ? (after?.time ?? first.time + 8) : (second?.time ?? first.time + 6);
  const start = first.time;
  let end = Math.min(rawEnd, start + (twoLines ? 12 : 9));
  if (end - start < 2.5) end = start + 2.5;
  if (twoLines && second.time >= end - 0.2) {
    // 第二句被切掉了就退回单句，绝不伪造时间
    return { lines: [first], start, end: Math.max(second.time, start + 3) };
  }
  return { lines: picked, start, end };
}

const NOTES = {
  lose: 'losing 是 lose 的现在分词；lose sleep over sth. 为某事失眠',
  dream: 'dream 的现在分词是 dreaming；dream of / about sth. 梦见某事',
  give: 'gave 是 give 的过去式；give sth. to sb. 把某物给某人',
  morning: 'in the morning 在早上；Good morning 早上好',
  listen: 'listen to sth. 听某事；listen 强调听的动作，hear 强调听见',
  imagine: 'imagine doing sth. 想象做某事',
  easy: 'easy 的比较级是 easier，最高级是 easiest',
  heaven: 'heaven 天堂；Good heavens! 表示惊讶',
};

function knowledgeFor(entry, surface) {
  if (NOTES[entry[0]]) return NOTES[entry[0]];
  const synonyms = Array.isArray(entry[4]) ? entry[4].filter(Boolean).slice(0, 3) : [];
  if (synonyms.length) return `近义：${synonyms.join(' · ')}`;
  if (surface && surface.toLowerCase() !== String(entry[0]).toLowerCase()) {
    return `歌词里唱的是 ${surface}，对应词条 ${entry[0]}。`;
  }
  return undefined;
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const book = JSON.parse(fs.readFileSync(WORDBOOK, 'utf8'));
  const dict = new Map(book.words.map((entry) => [entry[0], entry]));
  const songs = catalog.songs.filter((entry) => entry.song.platform === 'netease');

  const bySong = [];
  for (const entry of songs) {
    const lyrics = parseLrc(await fetchLyrics(entry.song));
    if (lyrics.length < 8) continue;
    const candidates = [];
    for (const [word, hit] of Object.entries(entry.words)) {
      const bookEntry = dict.get(word);
      if (!bookEntry || !isUsableWord(bookEntry)) continue;
      if (!hit?.line || !hit?.surface) continue;
      if (!hit.line.toLowerCase().includes(hit.surface.toLowerCase())) continue;
      if (!lyrics.some((line) => Math.abs(line.time - hit.t) <= 0.2)) continue;
      candidates.push({ word, hit, bookEntry });
    }
    candidates.sort(
      (a, b) => Number(PRIORITY.has(b.word)) - Number(PRIORITY.has(a.word)) || a.hit.t - b.hit.t,
    );
    const picked = [];
    const seen = new Set();
    const seenSurfaces = new Set();
    for (const candidate of candidates) {
      if (seen.has(candidate.word)) continue;
      const surface = candidate.hit.surface.toLowerCase();
      if (seenSurfaces.has(surface)) continue;
      // 同一句歌词只出一张卡，避免连续几张卡听到同一段音频
      if (picked.some((item) => Math.abs(item.hit.t - candidate.hit.t) < 0.2)) continue;
      seen.add(candidate.word);
      seenSurfaces.add(surface);
      picked.push(candidate);
      if (picked.length >= MAX_PER_SONG) break;
    }
    if (picked.length) bySong.push({ song: entry.song, lyrics, picked });
    console.log(
      `[cards] ${entry.song.title}: ${picked.length} 词 · ${lyrics.length} 行`,
    );
  }

  // Round-robin across tracks so every song contributes, then group by track
  // again when writing. This keeps adjacent cards on the same audio source.
  const chosen = [];
  const seenWords = new Set();
  const seenSurfaces = new Set();
  let pass = 0;
  while (chosen.length < TARGET_COUNT) {
    let added = 0;
    for (const group of bySong) {
      const candidate = group.picked[pass];
      if (!candidate) continue;
      if (seenWords.has(candidate.word)) continue;
      const surface = candidate.hit.surface.toLowerCase();
      if (seenSurfaces.has(surface)) continue;
      const fragment = pickLines(group.lyrics, candidate.hit);
      if (!fragment) continue;
      seenWords.add(candidate.word);
      seenSurfaces.add(surface);
      chosen.push({ group, candidate, fragment });
      added += 1;
      if (chosen.length >= TARGET_COUNT) break;
    }
    if (!added) break;
    pass += 1;
  }
  if (chosen.length < TARGET_COUNT) {
    throw new Error(`只凑到 ${chosen.length} 个真实词条，拒绝用假数据补足`);
  }

  chosen.sort(
    (a, b) =>
      songs.findIndex((item) => item.song.id === a.group.song.id) -
        songs.findIndex((item) => item.song.id === b.group.song.id) ||
      a.fragment.start - b.fragment.start,
  );

  const cards = chosen.map(({ group, candidate, fragment }) => {
    const entry = candidate.bookEntry;
    const surface = candidate.hit.surface;
    return {
      w: entry[0],
      p: entry[1] ?? '',
      m: entry[2] ?? '',
      s: entry[3] ?? undefined,
      syn: Array.isArray(entry[4]) ? entry[4] : undefined,
      exam: Array.isArray(entry[5]) ? entry[5] : undefined,
      k: knowledgeFor(entry, surface),
      track: group.song,
      fragment: {
        trackId: group.song.id,
        target: surface,
        start: Number(fragment.start.toFixed(2)),
        end: Number(fragment.end.toFixed(2)),
        lines: fragment.lines.map((line) => ({
          text: line.text,
          time: Number(line.time.toFixed(2)),
        })),
      },
    };
  });

  const deck = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'data/catalog.json + http://127.0.0.1:8787/api/song/:id/lyric',
    cards,
  };
  fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_SRC), { recursive: true });
  const serialized = `${JSON.stringify(deck, null, 2)}\n`;
  fs.writeFileSync(OUT_PUBLIC, serialized, 'utf8');
  fs.writeFileSync(OUT_SRC, serialized, 'utf8');
  console.log(`\n[cards] 写入 ${cards.length} 张卡 / ${new Set(cards.map((c) => c.track.id)).size} 首曲目`);
  console.log(`  ${path.relative(ROOT, OUT_PUBLIC)}`);
  console.log(`  ${path.relative(ROOT, OUT_SRC)}`);
  for (const card of cards) {
    console.log(
      `  ${String(cards.indexOf(card) + 1).padStart(2, '0')} ${card.w.padEnd(14)} ${card.fragment.trackId.padEnd(12)} ${card.fragment.start.toFixed(2)}-${card.fragment.end.toFixed(2)}  ${card.fragment.lines.length} 句  target=${card.fragment.target}`,
    );
  }
}

await main();
