import { matchWordsToSongs } from './lyricMatch.ts';
import { lookupWord } from './wordbook.ts';
import type { FocusCardData, FocusFragment } from '@/cards';
import type { LyricLine, Song } from '@/types';
import type { WordbookWord } from '@/lib/wordbook';

/**
 * Personal wordbook import.
 *
 * The bundled 50-word deck is hand-curated from a catalog. An imported book is
 * different: the user brings the words, and every word is looked up across the
 * user's whole lyric library — word first, song second. `lyricMatch.ts` owns the
 * matching; this module turns matches into cards and orders them for listening.
 */

export const IMPORT_PREFIX = 'import-';
export const MAX_IMPORT_WORDS = 6000;

/**
 * 卡片顺序：同一首歌连续 3–5 张再换歌。只有 1–2 张歌的歌会让下一首多留一张，
 * 免得节奏被极短的歌切成一张一换。
 */
const RUN_PATTERN = [3, 4, 5] as const;

export type ImportMode = 'words' | 'music';

const WORD_RE = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;

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
  /** `words` = pure word cards; `music` = playlist lyrics matched when possible. */
  mode?: ImportMode;
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

/** A user-supplied wordbook, with any metadata the file carried. */
export interface ParsedWordbook {
  name: string;
  tagline: string;
  source: string;
  license?: string;
  words: WordbookWord[];
  format: 'json' | 'text';
}

interface WordbookRaw {
  id?: string;
  name?: string;
  tagline?: string;
  source?: string;
  license?: string;
  count?: number;
  words?: unknown[];
  data?: unknown[];
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

/** 短语动词的第二、三个词，只有这些尾词才允许「两个词算一个词条」。 */
const PHRASAL_TAIL =
  /^(up|down|off|on|in|out|away|back|over|after|for|with|through|about|at|into|to|from|of|by|around|along|across|apart|aside|forward|together|upon|against|without)$/;

function validWord(value: string) {
  if (!value || value.length > 40) return false;
  // 连字符词（hard-working）和短语动词（give up / look after）都是一个整词。
  return /^[A-Za-z][A-Za-z'’.-]*(?: [A-Za-z][A-Za-z'’.-]*){0,2}$/.test(value);
}

/** 「give up 放弃」这种空格分隔的行：只有尾词是小品词时才把前两个词当成一个词条。 */
function splitPhraseLine(raw: string) {
  const match = raw.match(/^([A-Za-z][A-Za-z'’.-]*(?: [A-Za-z][A-Za-z'’.-]*){0,2})\s+(.+)$/);
  if (!match) return null;
  const head = match[1].trim();
  const tail = match[2].trim();
  if (!tail) return null;
  const words = head.split(/\s+/);
  if (words.length > 1 && !PHRASAL_TAIL.test((words.at(-1) ?? '').toLowerCase())) {
    return { w: words[0], m: `${words.slice(1).join(' ')} ${tail}`.trim() };
  }
  return { w: head, m: tail };
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

function splitFields(line: string) {
  const fields: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (char === ',' || char === '\t' || char === '|')) {
      fields.push(value.trim());
      value = '';
      continue;
    }
    value += char;
  }
  fields.push(value.trim());
  return fields;
}

function looksLikeHeader(line: string) {
  const fields = splitFields(line);
  if (fields.length < 2) return false;
  const first = fields[0].toLowerCase();
  if (!['word', 'words', 'term', '单词', '词汇', '词条'].includes(first)) return false;
  return (
    fields.length >= 3 ||
    fields
      .slice(1)
      .some((field) =>
        /phonetic|pronunciation|meaning|definition|sense|音标|释义|翻译|example|例句/i.test(field),
      )
  );
}

function fromTextLine(line: string): RawEntry | null {
  const raw = line
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^\d+[.)、]\s*/, '');
  if (!raw || raw.startsWith('#') || raw.startsWith('//')) return null;
  const fields = splitFields(raw);
  let w = normalizeWord(fields[0] ?? '');
  if (!validWord(w)) {
    const phrase = splitPhraseLine(raw);
    if (!phrase) return null;
    w = normalizeWord(phrase.w);
    if (!validWord(w)) return null;
    return { w, p: '', m: phrase.m };
  }
  if (fields.length >= 3) {
    return { w, p: fields[1] ?? '', m: fields.slice(2).join(', ').trim() };
  }
  if (fields.length === 2) {
    const second = fields[1];
    const phonetic = /^[/[].+[/\]]$/.test(second)
      ? second.replace(/^[/[]/, '').replace(/[/\]]$/, '').trim()
      : '';
    if (phonetic) return { w, p: phonetic, m: '' };
    return { w, p: '', m: second };
  }
  return { w, p: '', m: '' };
}

function fromJsonEntry(value: unknown): RawEntry | null {
  if (typeof value === 'string') {
    if (looksLikeHeader(value)) return null;
    return fromTextLine(value);
  }
  return fromTuple(value) ?? fromObject(value);
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

/**
 * Accepts a plain word-per-line list, a CSV-ish list, or a wordbook JSON file.
 * JSON may carry its own name / tagline / source; the fallback is the file name
 * or a generic label supplied by the caller.
 */
export function parseWordbook(raw: string, fallbackName = ''): ParsedWordbook | null {
  const text = raw.replace(/^\uFEFF/, '').trim();
  if (!text) return null;
  const fallback = clean(fallbackName);
  const first = text[0];

  if (first === '[' || first === '{') {
    try {
      const parsed = JSON.parse(text) as unknown;
      let list: unknown[] = [];
      let name = '';
      let tagline = '';
      let source = '';
      let license = '';
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const record = parsed as WordbookRaw & { title?: string };
        if (Array.isArray(record.words)) list = record.words;
        else if (Array.isArray(record.data)) list = record.data;
        name = clean(record.name) || clean(record.title);
        tagline = clean(record.tagline);
        source = clean(record.source);
        license = clean(record.license);
      }
      const entries = list
        .map((item) => fromJsonEntry(item))
        .filter((item): item is RawEntry => Boolean(item));
      if (entries.length) {
        return {
          name: name || fallback || '导入词书',
          tagline: tagline || '个人词表',
          source: source || '用户导入',
          license: license || undefined,
          words: uniqueEntries(entries),
          format: 'json',
        };
      }
    } catch {
      // Not JSON after all; fall through to the line parser.
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean);
  if (lines.length && looksLikeHeader(lines[0])) lines.shift();
  const entries = lines.map(fromTextLine).filter((item): item is RawEntry => Boolean(item));
  if (!entries.length) return null;
  return {
    name: fallback || '导入词书',
    tagline: '个人词表',
    source: '用户导入',
    words: uniqueEntries(entries),
    format: 'text',
  };
}

export function parseWordList(raw: string): WordbookWord[] {
  return parseWordbook(raw)?.words ?? [];
}

function knowledgeFor(entry: WordbookWord, surface?: string) {
  const synonyms = entry.syn?.filter(Boolean).slice(0, 3) ?? [];
  if (synonyms.length) return `近义：${synonyms.join(' · ')}`;
  if (surface && surface.toLowerCase() !== entry.w.toLowerCase()) {
    return `歌词里唱的是 ${surface}，对应词条 ${entry.w}。`;
  }
  return undefined;
}

/**
 * Wordbook examples often use an inflected form ("lost" for lose, "counted"
 * for count). Find the exact surface so the prompt highlights the word that is
 * actually in the sentence; fall back to the headword when nothing matches.
 */
export function findExampleSurface(
  example: string | undefined,
  entry: WordbookWord,
  dict: Map<string, WordbookWord>,
) {
  if (!example) return undefined;
  const text = example.split('||')[0] ?? '';
  if (!text) return undefined;
  const target = entry.w.toLowerCase();
  let inflected: string | undefined;
  for (const match of text.matchAll(WORD_RE)) {
    const surface = match[0];
    const hit = lookupWord(surface, dict);
    if (!hit || hit.w.toLowerCase() !== target) continue;
    if (surface.toLowerCase() === target) return surface;
    inflected ??= surface;
  }
  return inflected;
}

function cardFor(
  song: Song,
  entry: WordbookWord,
  surface: string,
  fragment: FocusFragment,
  dict: Map<string, WordbookWord>,
): FocusCardData {
  return {
    w: entry.w,
    p: entry.p,
    m: entry.m,
    exampleSurface: findExampleSurface(entry.s, entry, dict),
    s: entry.s,
    syn: entry.syn,
    exam: entry.exam,
    k: knowledgeFor(entry, surface),
    track: song,
    fragment,
  };
}

export function plainCardFor(
  entry: WordbookWord,
  dict?: Map<string, WordbookWord>,
): FocusCardData {
  return {
    w: entry.w,
    p: entry.p,
    m: entry.m,
    exampleSurface: dict ? findExampleSurface(entry.s, entry, dict) : undefined,
    s: entry.s,
    syn: entry.syn,
    exam: entry.exam,
    rank: entry.rank,
    k: knowledgeFor(entry),
  };
}

/**
 * 配歌：每个词去全库找一句唱到它的歌词。
 *
 * 没有「每首最多 10 张」的入场限制——10 只是排卡片顺序时的节奏。只要某个词在
 * 任何一首歌里找到合格句子，它就一定有歌；找不到的词由 buildImportedDeck
 * 退回纯词卡，不会丢。
 */
export function buildImportCards(input: {
  words: WordbookWord[];
  songs: Song[];
  lyrics: Map<string, LyricLine[]>;
  playInfo?: Map<string, ImportPlayInfo>;
}): FocusCardData[] {
  const dict = new Map<string, WordbookWord>();
  for (const word of input.words) dict.set(word.w.toLowerCase(), word);

  const matches = matchWordsToSongs({
    words: input.words,
    songs: input.songs,
    lyrics: input.lyrics,
    playInfo: input.playInfo,
  });

  const cards = matches.map((match) =>
    cardFor(match.song, match.word, match.surface, match.fragment, dict),
  );
  return orderMatchedCards(cards, input.songs);
}

/**
 * 卡片顺序：同一首歌连续 3–5 张再换歌，换歌时按歌单顺序轮转。
 * 只有 1–2 张卡片的歌会让下一首多留一张，避免极短歌把节奏切碎。
 * 复习卡不走这里（复习按到期日单独排队），所以这条节奏只约束新词卡。
 */
function orderMatchedCards(cards: FocusCardData[], songs: readonly Song[]): FocusCardData[] {
  const library = new Map(songs.map((song, index) => [song.id, index]));
  const groups = new Map<string, FocusCardData[]>();
  for (const card of cards) {
    const id = card.track?.id;
    if (!id) continue;
    const group = groups.get(id) ?? [];
    group.push(card);
    groups.set(id, group);
  }

  const order = [...groups.keys()].sort(
    (a, b) => (library.get(a) ?? 0) - (library.get(b) ?? 0) || a.localeCompare(b),
  );
  for (const id of order) {
    groups.get(id)!.sort((a, b) => (a.fragment?.start ?? 0) - (b.fragment?.start ?? 0));
  }

  const out: FocusCardData[] = [];
  const orphans: FocusCardData[] = [];
  for (const card of cards) if (!card.track?.id) orphans.push(card);
  let block = 0;
  let carry = 0;
  let cursor = 0;

  while (out.length + orphans.length < cards.length) {
    const live = order.filter((id) => (groups.get(id)?.length ?? 0) > 0);
    if (!live.length) break;
    const id = live[cursor % live.length];
    const group = groups.get(id)!;
    const target = (RUN_PATTERN[block % RUN_PATTERN.length] ?? 3) + carry;
    carry = 0;

    const before = group.length;
    out.push(...group.splice(0, Math.min(before, target)));
    if (before <= 2) carry = 1;

    block += 1;
    cursor += 1;
  }

  return [...out, ...orphans];
}

/** Matched cards first, the rest of the list as word-only cards, never dropped. */
export function buildImportedDeck(words: WordbookWord[], cards: FocusCardData[]): FocusCardData[] {
  const dict = new Map(words.map((word) => [word.w.toLowerCase(), word]));
  const seen = new Set(cards.map((card) => card.w.toLowerCase()));
  const plain = words
    .filter((word) => !seen.has(word.w.toLowerCase()))
    .map((word) => plainCardFor(word, dict));
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
          .map((item) => fromJsonEntry(item))
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
