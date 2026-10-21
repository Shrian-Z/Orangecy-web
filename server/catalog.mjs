import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { netease } from './providers/netease.mjs';
import { lemmaCandidates } from './lemma.mjs';
import { parseLrc } from './lyrics.mjs';
import { CATALOG_SEEDS } from './seeds.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'catalog.json');
const VERSION = 1;

let catalog = null;
let buildPromise = null;
let status = {
  status: 'idle',
  progress: 0,
  total: CATALOG_SEEDS.length,
  error: null,
  builtAt: null,
  current: '',
};

function loadFromDisk() {
  if (catalog) return catalog;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw?.version === VERSION && Array.isArray(raw.songs)) {
      catalog = raw;
      status = {
        ...status,
        status: 'ready',
        progress: raw.songs.length,
        total: raw.songs.length,
        builtAt: raw.builtAt ?? null,
        error: null,
      };
    }
  } catch {
    // 没有缓存，等第一次推荐时再建
  }
  return catalog;
}

function persist() {
  if (!catalog) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(catalog), 'utf8');
  fs.renameSync(tmp, FILE);
}

export function indexLines(lines) {
  const words = Object.create(null);
  for (const line of lines) {
    for (const match of line.text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)) {
      const surface = match[0].toLowerCase();
      for (const lemma of lemmaCandidates(surface)) {
        if (lemma === '__proto__' || lemma === 'constructor') continue;
        if (!words[lemma]) {
          words[lemma] = { t: line.time, line: line.text, surface };
        }
      }
    }
  }
  return words;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(error) {
  return (
    Number(error?.status) === 405 ||
    Number(error?.body?.code) === 405 ||
    String(error?.message ?? '').includes('频繁') ||
    String(error?.body?.msg ?? '').includes('频繁')
  );
}

function timeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} 超时`)), ms);
      timer.unref?.();
    }),
  ]);
}

async function pickSongForSeed(seed, usedIds) {
  const result = await timeout(netease.search(seed, '', 6), 15000, '搜索');
  for (const candidate of result ?? []) {
    if (usedIds.has(String(candidate.id))) continue;
    try {
      const play = await timeout(netease.playInfo(candidate.id, ''), 15000, '音源');
      if (!play.available || play.trial) continue;
      const [song, lyric] = await Promise.all([
        timeout(netease.song(candidate.id, ''), 15000, '详情'),
        timeout(netease.lyric(candidate.id, ''), 15000, '歌词'),
      ]);
      const lines = parseLrc(lyric?.lrc ?? '');
      if (lines.length < 12) continue;
      const words = indexLines(lines);
      if (Object.keys(words).length < 40) continue;
      return { song, words, lines: lines.length };
    } catch (error) {
      if (isRateLimit(error)) throw error;
      // 换下一首候选
    }
  }
  return null;
}

export async function buildCatalog({
  force = false,
  merge = false,
  seeds = CATALOG_SEEDS,
  delayMs = 1100,
} = {}) {
  loadFromDisk();
  if (buildPromise) return buildPromise;
  if (!force && catalog?.songs?.length) return catalog;

  const seedList = Array.isArray(seeds) && seeds.length ? seeds : CATALOG_SEEDS;
  buildPromise = (async () => {
    status = {
      status: 'building',
      progress: 0,
      total: seedList.length,
      error: null,
      builtAt: null,
      current: '',
      songs: catalog?.songs?.length ?? 0,
    };
    const songs = merge && catalog?.songs?.length ? [...catalog.songs] : [];
    const usedIds = new Set(songs.map((entry) => String(entry.song.id)));
    const usedTitles = new Set(songs.map((entry) => entry.song.title.toLowerCase()));
    for (let i = 0; i < seedList.length; i += 1) {
      const seed = seedList[i];
      status = { ...status, current: seed, progress: i, songs: songs.length };
      if (i > 0) await sleep(delayMs);

      let picked = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          picked = await pickSongForSeed(seed, usedIds);
          break;
        } catch (error) {
          if (isRateLimit(error) && attempt < 2) {
            const wait = 6000 * (attempt + 1);
            console.warn(`[catalog] ${seed} 触发限频，${Math.round(wait / 1000)}s 后重试`);
            await sleep(wait);
            continue;
          }
          console.warn(`[catalog] ${seed} 失败：${error.message ?? '上游请求失败'}`);
          break;
        }
      }

      if (picked && !usedTitles.has(picked.song.title.toLowerCase())) {
        usedIds.add(String(picked.song.id));
        usedTitles.add(picked.song.title.toLowerCase());
        songs.push({ song: picked.song, words: picked.words });
        catalog = { version: VERSION, builtAt: new Date().toISOString(), songs };
        persist();
        console.log(`[catalog] ${songs.length}/${seedList.length} ${picked.song.title} · ${picked.lines} 行`);
      } else if (!picked) {
        console.log(`[catalog] 跳过：${seed}`);
      }
      status = { ...status, progress: i + 1, songs: songs.length };
    }

    if (songs.length) {
      catalog = { version: VERSION, builtAt: new Date().toISOString(), songs };
      persist();
      status = {
        ...status,
        status: 'ready',
        songs: songs.length,
        total: songs.length,
        builtAt: catalog.builtAt,
        current: '',
      };
      console.log(`[catalog] 完成，共 ${songs.length} 首`);
      return catalog;
    }

    status = {
      ...status,
      status: 'error',
      error: '推荐池没建起来，检查网络后重试',
      current: '',
    };
    throw new Error(status.error);
  })()
    .catch((error) => {
      status = { ...status, status: 'error', error: error.message, current: '' };
      throw error;
    })
    .finally(() => {
      buildPromise = null;
    });

  return buildPromise;
}

export function getCatalogStatus() {
  loadFromDisk();
  return {
    status: status.status,
    progress: status.progress,
    total: status.total,
    current: status.current,
    error: status.error,
    builtAt: status.builtAt,
    songs: catalog?.songs?.length ?? 0,
  };
}

export function getRecommendations(words, limit = 10) {
  loadFromDisk();
  if (!catalog?.songs?.length) return [];

  const targets = [
    ...new Set(
      (Array.isArray(words) ? words : [])
        .map((word) => String(word ?? '').toLowerCase().replace(/[^a-z'-]/g, ''))
        .filter((word) => word.length > 1),
    ),
  ].slice(0, 80);
  if (!targets.length) return [];

  const scored = [];
  for (const entry of catalog.songs) {
    const coverage = [];
    for (const word of targets) {
      const hit = entry.words[word];
      if (hit) coverage.push({ word, time: hit.t, lineText: hit.line });
    }
    if (coverage.length) scored.push({ song: entry.song, coverage, score: coverage.length });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title))
    .slice(0, Math.max(1, Math.min(20, limit)));
}
