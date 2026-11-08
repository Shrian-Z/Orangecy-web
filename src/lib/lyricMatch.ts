/**
 * 单词 → 歌曲：整条配歌流水线的匹配内核。
 *
 * 方向是「拿词书里的每个词，去全库歌词里找它」，不是「拿一首歌，去词书里挑它
 * 认识的词」。所以生僻词、术语不会因为某首歌的前十句被简单词占满而永远排不上。
 *
 * 匹配分三层：
 *   1. 词形：lemma.ts（时态 / 复数 / 比较级 / 英式拼写 / 连字符），不做词根和同义词。
 *   2. 词性：pos.ts（词书只标一个词性时，拒绝上下文明确是另一个词性的句子）。
 *   3. 垃圾：人名 / 地名（句中大写）和语气词（stopword 表）不进候选。
 *
 * 同一句歌词可以服务多个词——这是产品裁定，不做独占。
 */

import type { FocusFragment } from '@/cards';
import type { LyricLine, Song } from '@/types';
import { lemmaForms, spellingKey } from './lemma.ts';
import { inferRole, posClassesOf, posConflict, type PosClass } from './pos.ts';
import { isStopword } from './wordbook.ts';
import type { WordbookWord } from './wordbook.ts';

export interface MatchPlayInfo {
  available: boolean;
  trial: { start: number; end: number } | null;
}

export interface SongMatchInput {
  words: readonly WordbookWord[];
  songs: readonly Song[];
  lyrics: Map<string, LyricLine[]>;
  playInfo?: Map<string, MatchPlayInfo>;
}

export interface SongMatch {
  word: WordbookWord;
  /** 歌词里真实写着的形态（可能是 gave up / running / hard-working）。 */
  surface: string;
  song: Song;
  songIndex: number;
  fragment: FocusFragment;
}

interface Target {
  key: string;
  word: WordbookWord;
  pos: Set<PosClass>;
  phrase: string[] | null;
}

interface Candidate {
  song: number;
  line: number;
  token: number;
  span: number;
  surface: string;
  capMid: boolean;
  role: PosClass | null;
  quality: number;
}

interface Catalog {
  words: readonly WordbookWord[];
  songs: readonly Song[];
  targets: Map<string, Target>;
  candidates: Map<string, Candidate[]>;
}

const TOKEN_SOURCE = "[A-Za-z]+(?:['’\\-][A-Za-z]+)*";

export function tokenize(text: string): string[] {
  const re = new RegExp(TOKEN_SOURCE, 'g');
  const out: string[] = [];
  for (const match of String(text ?? '').matchAll(re)) out.push(match[0]);
  return out;
}

export function normalizeKey(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function lineQuality(tokens: readonly string[], lower: readonly string[]): number {
  let content = 0;
  for (const token of lower) if (!isStopword(token)) content += 1;
  let penalty = 0;
  if (tokens.length < 3) penalty += 8;
  if (content < 2) penalty += 8;
  else if (content < 3) penalty += 3;
  return penalty;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

interface FragmentWindow {
  start: number;
  end: number;
  lines: { text: string; time: number }[];
}

/**
 * 从一句歌词推出十秒左右的片段窗口。原实现（importDeck.fragmentFor）原样搬来，
 * 只是把 target 留给调用方填，这样同一句可以服务多个词。
 */
export function fragmentWindow(
  lines: readonly LyricLine[],
  index: number,
  song: Song,
  trial: { start: number; end: number } | null,
): FragmentWindow | null {
  const first = lines[index];
  if (!first || !first.text) return null;

  const second = lines[index + 1];
  const after = lines[index + 2];
  const twoLines =
    Boolean(second) && second.time - first.time <= 12 && second.time - first.time >= 0.5;
  const picked = twoLines && second ? [first, second] : [first];
  const fallbackEnd = first.time + (twoLines ? 12 : 9);
  const rawEnd = twoLines ? (after?.time ?? first.time + 8) : (second?.time ?? first.time + 6);
  let end = Math.min(rawEnd, fallbackEnd);
  if (end - first.time < 2.5) end = first.time + 2.5;

  if (twoLines && second && second.time >= end - 0.2) {
    // 第二句被截断了，只保留真正完整的第一句。
    picked.length = 1;
    end = Math.max(second.time, first.time + 3);
  }

  if (trial) {
    if (first.time < trial.start) return null;
    if (!(trial.end > first.time + 2.5)) return null;
    end = Math.min(end, trial.end - 0.25);
  }

  const duration = song.durationMs / 1000;
  if (Number.isFinite(duration) && duration > 0) {
    end = Math.min(end, duration - 0.5);
    if (first.time >= duration - 2.5) return null;
  }

  if (end - first.time < 2.5) return null;

  return {
    start: round2(first.time),
    end: round2(end),
    lines: picked.map((line) => ({ text: line.text, time: round2(line.time) })),
  };
}

function buildCatalog(
  words: readonly WordbookWord[],
  songs: readonly Song[],
  lyrics: Map<string, LyricLine[]>,
): Catalog {
  const targets = new Map<string, Target>();
  const single = new Map<string, Target[]>();
  const phrases = new Map<string, { target: Target; rest: string[] }[]>();
  const hyphen = new Map<string, Target>();
  const candidates = new Map<string, Candidate[]>();

  for (const word of words) {
    const key = normalizeKey(word.w);
    if (!key) continue;
    if (targets.has(key)) continue;
    const parts = key.split(' ').filter(Boolean);
    if (!parts.length || isStopword(parts[0])) continue;

    const target: Target = {
      key,
      word,
      pos: posClassesOf(word.m),
      phrase: parts.length > 1 ? parts : null,
    };
    targets.set(key, target);
    candidates.set(key, []);

    if (target.phrase) {
      const first = target.phrase[0];
      for (const form of new Set([first, spellingKey(first)])) {
        const list = phrases.get(form) ?? [];
        list.push({ target, rest: target.phrase.slice(1) });
        phrases.set(form, list);
      }
      continue;
    }

    for (const form of new Set([key, spellingKey(key), key.replace(/-/g, '')])) {
      const list = single.get(form) ?? [];
      list.push(target);
      single.set(form, list);
    }
    if (key.includes('-')) hyphen.set(key, target);
  }

  const lemmaCache = new Map<string, string[]>();
  const formsOf = (token: string) => {
    const cached = lemmaCache.get(token);
    if (cached) return cached;
    const forms = lemmaForms(token);
    lemmaCache.set(token, forms);
    return forms;
  };

  songs.forEach((song, songIndex) => {
    const lines = lyrics.get(song.id);
    if (!lines?.length) return;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const text = lines[lineIndex].text;
      if (!text) continue;
      const tokens = tokenize(text);
      if (!tokens.length) continue;
      const lower = tokens.map((token) => token.toLowerCase());
      const quality = lineQuality(tokens, lower);
      const seen = new Set<string>();

      for (let i = 0; i < tokens.length; i += 1) {
        const forms = formsOf(lower[i]);
        const capMid = i > 0 && /^[A-Z]/.test(tokens[i]);

        const record = (target: Target, span: number, surface: string) => {
          if (seen.has(target.key)) return;
          seen.add(target.key);
          const list = candidates.get(target.key);
          if (!list) return;
          list.push({
            song: songIndex,
            line: lineIndex,
            token: i,
            span,
            surface,
            capMid,
            role: inferRole(lower, i, span),
            quality,
          });
        };

        for (const form of forms) {
          for (const target of single.get(form) ?? []) record(target, 1, tokens[i]);

          for (const entry of phrases.get(form) ?? []) {
            const { rest } = entry;
            if (i + rest.length >= tokens.length) continue;
            let ok = true;
            for (let k = 0; k < rest.length; k += 1) {
              if (spellingKey(lower[i + 1 + k]) !== spellingKey(rest[k])) {
                ok = false;
                break;
              }
            }
            if (ok) {
              record(entry.target, rest.length + 1, tokens.slice(i, i + rest.length + 1).join(' '));
            }
          }
        }

        // 歌词写成空格、词书写成连字符：hard working → hard-working。
        if (i + 1 < tokens.length) {
          const pair = hyphen.get(`${lower[i]}-${lower[i + 1]}`);
          if (pair) record(pair, 2, `${tokens[i]} ${tokens[i + 1]}`);
        }
      }
    }
  });

  return { words, songs, targets, candidates };
}

const catalogCache = new WeakMap<Map<string, LyricLine[]>, Catalog>();

function getCatalog(input: SongMatchInput): Catalog {
  const cached = catalogCache.get(input.lyrics);
  if (cached && cached.words === input.words && cached.songs === input.songs) return cached;
  const catalog = buildCatalog(input.words, input.songs, input.lyrics);
  catalogCache.set(input.lyrics, catalog);
  return catalog;
}

/** 只保留「这句唱的就是词书要的那个意思」的候选。 */
function usableCandidates(target: Target, list: Candidate[]): Candidate[] {
  if (!list.length) return list;
  let caps = 0;
  for (const cand of list) if (cand.capMid) caps += 1;
  // 至少出现过两次、且几乎总是大写 → 这个词本身就是专有名词（American / Monday），
  // 句中大写是它正常的写法，不算人名过滤。
  const capAllowed = list.length >= 2 && caps / list.length >= 0.7;
  return list.filter(
    (cand) => (!cand.capMid || capAllowed) && !posConflict(target.pos, cand.role),
  );
}

/**
 * 给每个词挑一句最合适的歌词。返回顺序是「稀有的词先挑」，不是最终卡片顺序。
 * 没有合格句子的词不会出现在结果里，由调用方退回纯词卡。
 */
export function matchWordsToSongs(input: SongMatchInput): SongMatch[] {
  const catalog = getCatalog(input);
  const { targets, candidates, songs } = catalog;

  const usable = new Map<string, Candidate[]>();
  for (const [key, list] of candidates) {
    const filtered = usableCandidates(targets.get(key)!, list);
    if (filtered.length) usable.set(key, filtered);
  }

  const order = [...usable.keys()].sort((a, b) => {
    const delta = usable.get(a)!.length - usable.get(b)!.length;
    return delta !== 0 ? delta : a.localeCompare(b);
  });

  const songLoad = new Map<number, number>();
  const lineLoad = new Map<string, number>();
  const windows = new Map<number, { start: number; end: number; line: number }[]>();
  const windowCache = new Map<string, FragmentWindow | null>();
  const matches: SongMatch[] = [];

  for (const key of order) {
    const target = targets.get(key)!;
    const list = usable.get(key)!;
    let best: { cand: Candidate; fragment: FragmentWindow; score: number } | null = null;

    for (const cand of list) {
      const song = songs[cand.song];
      if (!song) continue;
      const info = input.playInfo?.get(song.id);
      if (input.playInfo && (!info || !info.available)) continue;

      const cacheKey = `${cand.song}:${cand.line}`;
      let window = windowCache.get(cacheKey);
      if (window === undefined) {
        window = fragmentWindow(
          input.lyrics.get(song.id) ?? [],
          cand.line,
          song,
          info?.trial ?? null,
        );
        windowCache.set(cacheKey, window);
      }
      if (!window) continue;

      const overlap = (windows.get(cand.song) ?? []).some(
        (used) =>
          used.line !== cand.line &&
          window!.start < used.end - 0.05 &&
          used.start < window!.end - 0.05,
      );
      const score =
        (songLoad.get(cand.song) ?? 0) * 24 +
        (lineLoad.get(`${cand.song}:${cand.line}`) ?? 0) * 3 +
        cand.quality +
        (overlap ? 10 : 0) +
        cand.token * 0.01;

      if (
        !best ||
        score < best.score ||
        (score === best.score &&
          (cand.song < best.cand.song ||
            (cand.song === best.cand.song && cand.line < best.cand.line)))
      ) {
        best = { cand, fragment: window, score };
      }
    }

    if (!best) continue;

    const song = songs[best.cand.song];
    songLoad.set(best.cand.song, (songLoad.get(best.cand.song) ?? 0) + 1);
    const lineKey = `${best.cand.song}:${best.cand.line}`;
    lineLoad.set(lineKey, (lineLoad.get(lineKey) ?? 0) + 1);
    const used = windows.get(best.cand.song) ?? [];
    used.push({ start: best.fragment.start, end: best.fragment.end, line: best.cand.line });
    windows.set(best.cand.song, used);

    matches.push({
      word: target.word,
      surface: best.cand.surface,
      song,
      songIndex: best.cand.song,
      fragment: {
        trackId: song.id,
        target: best.cand.surface,
        start: best.fragment.start,
        end: best.fragment.end,
        lines: best.fragment.lines,
      },
    });
  }

  return matches;
}
