import { lookupWord } from './wordbook.ts';
import type { FocusCardData, FocusFragment } from '@/cards';
import type { LyricLine, Song } from '@/types';
import type { WordbookWord } from '@/lib/wordbook';

/**
 * Personal wordbook import.
 *
 * The bundled 50-word deck is hand-curated from a catalog. An imported book is
 * different: the user brings the words, and the words get whatever the user's
 * own playlists can actually sing. The card builder is deliberately pure so
 * the browser and the acceptance script produce the same deck from the same
 * lyric payloads.
 */

export const IMPORT_PREFIX = 'import-';
export const MAX_IMPORT_WORDS = 6000;
export const MAX_CARDS_PER_TRACK = 10;
export const TRACK_BUCKET = 3;

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export interface ImportPlayInfo {
  available: boolean;
  trial: { start: number; end: number } | null;
}

export interface ImportStats {
  words: number;
  matchedWords: number;
  plainWords: number;
  tracksScanned: number;
  tracksWithLyrics: number;
  tracksChecked: number;
  tracksPlayable: number;
  trackCount: number;
  playlists: number;
  durationMs: number;
}

export interface ImportedBookMeta {
  id: string;
  name: string;
  tagline: string;
  count: number;
  source: string;
  importedAt: string;
  stats: ImportStats;
}

export interface ImportedBook extends ImportedBookMeta {
  words: WordbookWord[];
  cards: FocusCardData[];
}

export interface PresetWordbook {
  id: string;
  name: string;
  tagline: string;
  count: number;
  source: string;
  license: string;
  words: WordbookWord[];
}

interface WordbookRaw {
  id?: string;
  name?: string;
  tagline?: string;
  source?: string;
  license?: string;
  count?: number;
  words?: unknown[];
}

interface RawEntry {
  w: string;
  p: string;
  m: string;
  s?: string;
  syn?: string[];
  exam?: [string, string];
}

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWord(value: string) {
  return value.trim().replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, '');
}

function validWord(value: string) {
  if (!value || value.length > 40) return false;
  return /^[A-Za-z][A-Za-z'’.-]*$/.test(value);
}

function fromTuple(value: unknown): RawEntry | null {
  if (!Array.isArray(value)) return null;
  const w = normalizeWord(clean(value[0]));
  if (!validWord(w)) return null;
  const p = clean(value[1]);
  const m = clean(value[2]);
  const s = clean(value[3]);
  const syn = Array.isArray(value[4])
    ? value[4].map((item) => clean(item)).filter(Boolean).slice(0, 6)
    : undefined;
  const exam =
    Array.isArray(value[5]) && value[5].length >= 2
      ? ([clean(value[5][0]), clean(value[5][1])] as [string, string])
      : undefined;
  return { w, p, m, s: s || undefined, syn: syn?.length ? syn : undefined, exam };
}

function fromObject(value: unknown): RawEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const w = normalizeWord(
    clean(record.w) || clean(record.word) || clean(record.name) || clean(record.text),
  );
  if (!validWord(w)) return null;
  const p = clean(record.p) || clean(record.phonetic) || clean(record.pronunciation);
  const m = clean(record.m) || clean(record.meaning) || clean(record.definition) || clean(record.cn);
  const s = clean(record.s) || clean(record.example);
  const syn = Array.isArray(record.syn)
    ? record.syn.map((item) => clean(item)).filter(Boolean).slice(0, 6)
    : undefined;
  return { w, p, m, s: s || undefined, syn: syn?.length ? syn : undefined };
}

function fromTextLine(line: string): RawEntry | null {
  const raw = line.replace(/^\uFEFF/, '').trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('//')) return null;
  const fields = raw.split(/\t|\s*\|\s*|\s*,\s*/).map((part) => part.trim());
  let w = normalizeWord(fields[0] ?? '');
  if (!validWord(w)) {
    const match = raw.match(/^([A-Za-z][A-Za-z'’.-]*)\s+(.*)$/);
    if (!match) return null;
    w = normalizeWord(match[1]);
    if (!validWord(w)) return null;
    return { w, p: '', m: match[2].trim() };
  }
  if (fields.length >= 3) {
    return { w, p: fields[1] ?? '', m: fields.slice(2).join(', ').trim() };
  }
  if (fields.length === 2) {
    return { w, p: '', m: fields[1] };
  }
  return { w, p: '', m: '' };
}

function uniqueEntries(entries: RawEntry[]) {
  const seen = new Set<string>();
  const words: WordbookWord[] = [];
  for (const entry of entries) {
    const key = entry.w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({
      w: entry.w,
      p: entry.p,
      m: entry.m,
      s: entry.s,
      syn: entry.syn,
      exam: entry.exam,
    });
    if (words.length >= MAX_IMPORT_WORDS) break;
  }
  return words;
}

/** Accepts a plain word-per-line list, a CSV-ish list, or a wordbook JSON file. */
export function parseWordList(raw: string): WordbookWord[] {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  const first = text[0];

  if (first === '[' || first === '{') {
    try {
      const parsed = JSON.parse(text) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as WordbookRaw).words)
          ? ((parsed as WordbookRaw).words as unknown[])
          : [];
      const entries = list
        .map((item) => fromTuple(item) ?? fromObject(item))
        .filter((item): item is RawEntry => Boolean(item));
      if (entries.length) return uniqueEntries(entries);
    } catch {
      // Not JSON after all; fall through to the line parser.
    }
  }

  const entries = text
    .split(/\r?\n/)
    .map(fromTextLine)
    .filter((item): item is RawEntry => Boolean(item));
  return uniqueEntries(entries);
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function knowledgeFor(entry: WordbookWord, surface?: string) {
  const synonyms = entry.syn?.filter(Boolean).slice(0, 3) ?? [];
  if (synonyms.length) return `近义：${synonyms.join(' · ')}`;
  if (surface && surface.toLowerCase() !== entry.w.toLowerCase()) {
    return `歌词里唱的是 ${surface}，对应词条 ${entry.w}。`;
  }
  return undefined;
}

function fragmentFor(
  lines: LyricLine[],
  index: number,
  song: Song,
  surface: string,
  trial: { start: number; end: number } | null,
): FocusFragment | null {
  const first = lines[index];
  if (!first || !first.text) return null;

  const second = lines[index + 1];
  const after = lines[index + 2];
  const twoLines = Boolean(second) && second.time - first.time <= 12 && second.time - first.time >= 0.5;
  const picked = twoLines && second ? [first, second] : [first];
  const fallbackEnd = first.time + (twoLines ? 12 : 9);
  const rawEnd = twoLines
    ? (after?.time ?? first.time + 8)
    : (second?.time ?? first.time + 6);
  let end = Math.min(rawEnd, fallbackEnd);
  if (end - first.time < 2.5) end = first.time + 2.5;

  if (twoLines && second && second.time >= end - 0.2) {
    // The second line was cut; keep the single real line and its timestamp.
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
    trackId: song.id,
    target: surface,
    start: round2(first.time),
    end: round2(end),
    lines: picked.map((line) => ({ text: line.text, time: round2(line.time) })),
  };
}

function cardFor(song: Song, entry: WordbookWord, surface: string, fragment: FocusFragment): FocusCardData {
  return {
    w: entry.w,
    p: entry.p,
    m: entry.m,
    s: entry.s,
    syn: entry.syn,
    exam: entry.exam,
    k: knowledgeFor(entry, surface),
    track: song,
    fragment,
  };
}

export function plainCardFor(entry: WordbookWord): FocusCardData {
  return {
    w: entry.w,
    p: entry.p,
    m: entry.m,
    s: entry.s,
    syn: entry.syn,
    exam: entry.exam,
    k: knowledgeFor(entry),
  };
}

/** Matched music cards for the words that the user's own lyrics can actually sing. */
export function buildImportCards(input: {
  words: WordbookWord[];
  songs: Song[];
  lyrics: Map<string, LyricLine[]>;
  playInfo?: Map<string, ImportPlayInfo>;
}): FocusCardData[] {
  const dict = new Map<string, WordbookWord>();
  for (const word of input.words) dict.set(word.w.toLowerCase(), word);
  const remaining = new Set(dict.keys());
  const cards: FocusCardData[] = [];
  const trackOrder = new Map<string, number>();
  const rankInTrack = new Map<string, number>();
  const ordered: { card: FocusCardData; bucket: number; track: number; start: number }[] = [];

  input.songs.forEach((song, songIndex) => {
    const check = input.playInfo?.get(song.id);
    if (input.playInfo && (!check || !check.available)) return;
    const lines = input.lyrics.get(song.id);
    if (!lines?.length) return;
    if (!trackOrder.has(song.id)) trackOrder.set(song.id, songIndex);

    let picked = 0;
    let lastEnd = -1;
    for (let index = 0; index < lines.length && picked < MAX_CARDS_PER_TRACK; index += 1) {
      const line = lines[index];
      if (!line.text) continue;
      for (const match of line.text.matchAll(WORD_RE)) {
        const entry = lookupWord(match[0], dict);
        if (!entry) continue;
        const key = entry.w.toLowerCase();
        if (!remaining.has(key)) continue;
        const fragment = fragmentFor(lines, index, song, match[0], check?.trial ?? null);
        if (!fragment) continue;
        // Do not play the same seconds twice on two neighbouring cards.
        if (fragment.start < lastEnd - 0.05) continue;

        remaining.delete(key);
        lastEnd = fragment.end;
        const card = cardFor(song, entry, match[0], fragment);
        cards.push(card);
        const rank = rankInTrack.get(song.id) ?? 0;
        rankInTrack.set(song.id, rank + 1);
        ordered.push({
          card,
          bucket: Math.floor(rank / TRACK_BUCKET),
          track: trackOrder.get(song.id) ?? songIndex,
          start: fragment.start,
        });
        picked += 1;
        break;
      }
    }
  });

  // Two cards from the same track stay together; after that, rotate the whole
  // library before asking the same song again. A 10-card day hears 3–4 songs.
  ordered.sort(
    (a, b) => a.bucket - b.bucket || a.track - b.track || a.start - b.start,
  );
  return ordered.map((item) => item.card);
}

/** Matched cards first, the rest of the list as word-only cards, never dropped. */
export function buildImportedDeck(words: WordbookWord[], cards: FocusCardData[]): FocusCardData[] {
  const seen = new Set(cards.map((card) => card.w.toLowerCase()));
  const plain = words
    .filter((word) => !seen.has(word.w.toLowerCase()))
    .map((word) => plainCardFor(word));
  return [...cards, ...plain];
}

const GAOKAO_URL = '/wordbooks/gaozhong.json';
let gaokaoPromise: Promise<PresetWordbook> | null = null;

/**
 * The bundled 高中 3500 list. The source file keeps its 238 extension words
 * after the 3500 core; they complete the w–z alphabet (write, world, you …),
 * so the import keeps every entry instead of cutting at 3500 and losing them.
 */
export function loadGaokaoWordbook() {
  if (!gaokaoPromise) {
    gaokaoPromise = fetch(GAOKAO_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`词表加载失败（${response.status}）`);
        const raw = (await response.json()) as WordbookRaw;
        const entries = (raw.words ?? [])
          .map((item) => fromTuple(item) ?? fromObject(item))
          .filter((item): item is RawEntry => Boolean(item));
        const words = uniqueEntries(entries);
        if (!words.length) throw new Error('词表是空的');
        return {
          id: 'gaokao-3500',
          name: '高考 3500',
          tagline: '高中 3500 词扩展版',
          count: words.length,
          source: raw.source ?? 'KyleBing/english-vocabulary',
          license: raw.license ?? 'BSD-3-Clause',
          words,
        } satisfies PresetWordbook;
      })
      .catch((error) => {
        gaokaoPromise = null;
        throw error;
      });
  }
  return gaokaoPromise;
}

export function importedBookId(seed = Date.now()) {
  return `${IMPORT_PREFIX}${seed.toString(36)}`;
}

export function isImportedBookId(id: string | null | undefined) {
  return Boolean(id?.startsWith(IMPORT_PREFIX));
}
