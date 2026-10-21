import type { LyricLine } from '@/types';

export interface WordbookMeta {
  id: string;
  name: string;
  tagline: string;
  count: number;
  file: string;
}

export interface WordbookIndex {
  source: string;
  license: string;
  books: WordbookMeta[];
}

export interface WordbookWord {
  w: string;
  p: string;
  m: string;
  s?: string;
  syn?: string[];
  exam?: [string, string];
}

export interface Wordbook {
  id: string;
  name: string;
  tagline: string;
  count: number;
  words: WordbookWord[];
  dict: Map<string, WordbookWord>;
}

export interface WordFocus {
  surface: string;
  entry: WordbookWord;
  lineIndex: number;
  time: number;
  lineText: string;
  songTitle: string;
  songId: string;
}

export interface SongMatchIndex {
  byLine: Map<string, Map<string, WordbookWord>>;
  words: Map<string, { entry: WordbookWord; lineIndex: number; time: number; lineText: string }>;
  count: number;
}

const STOPWORDS = new Set(
  `a an the and or but if so because as than then that this these those there here
  i you he she it we they me him her us them my your his its our their mine yours
  am is are was were be been being do does did doing have has had having
  will would shall should can could may might must ought
  to of in on at for with from by about into over after before under above between
  up down out off again further once only very too also just not no yes
  what which who whom whose when where why how all any both each few more most other
  some such own same s t don now
  oh yeah ya la na huh mm hmm woah whoa`
    .split(/\s+/)
    .filter(Boolean),
);

export function isStopword(word: string) {
  return STOPWORDS.has(word.toLowerCase());
}

const IRREGULAR: Record<string, string> = {
  was: 'be',
  were: 'be',
  been: 'be',
  is: 'be',
  are: 'be',
  am: 'be',
  has: 'have',
  had: 'have',
  does: 'do',
  did: 'do',
  done: 'do',
  went: 'go',
  gone: 'go',
  saw: 'see',
  seen: 'see',
  made: 'make',
  took: 'take',
  taken: 'take',
  came: 'come',
  got: 'get',
  gotten: 'get',
  said: 'say',
  thought: 'think',
  felt: 'feel',
  left: 'leave',
  knew: 'know',
  known: 'know',
  heard: 'hear',
  held: 'hold',
  brought: 'bring',
  began: 'begin',
  begun: 'begin',
  kept: 'keep',
  wrote: 'write',
  written: 'write',
  stood: 'stand',
  ran: 'run',
  fell: 'fall',
  fallen: 'fall',
  sent: 'send',
  built: 'build',
  understood: 'understand',
  led: 'lead',
  met: 'meet',
  paid: 'pay',
  sat: 'sit',
  spoke: 'speak',
  spoken: 'speak',
  lay: 'lie',
  lain: 'lie',
  lost: 'lose',
  found: 'find',
  gave: 'give',
  given: 'give',
  told: 'tell',
  became: 'become',
  shown: 'show',
  chose: 'choose',
  chosen: 'choose',
  broke: 'break',
  broken: 'break',
  spent: 'spend',
  grew: 'grow',
  grown: 'grow',
  drew: 'draw',
  drawn: 'draw',
  drove: 'drive',
  driven: 'drive',
  ate: 'eat',
  eaten: 'eat',
  sang: 'sing',
  sung: 'sing',
  wore: 'wear',
  worn: 'wear',
  won: 'win',
  flew: 'fly',
  flown: 'fly',
  threw: 'throw',
  thrown: 'throw',
  caught: 'catch',
  taught: 'teach',
  fought: 'fight',
  bought: 'buy',
  slept: 'sleep',
  meant: 'mean',
  rose: 'rise',
  risen: 'rise',
  shook: 'shake',
  shaken: 'shake',
  stole: 'steal',
  stolen: 'steal',
  hid: 'hide',
  hidden: 'hide',
  bit: 'bite',
  bitten: 'bite',
  blew: 'blow',
  blown: 'blow',
  drank: 'drink',
  drunk: 'drink',
  swam: 'swim',
  swum: 'swim',
  rang: 'ring',
  rung: 'ring',
  torn: 'tear',
  tore: 'tear',
};

export class WordbookUnavailable extends Error {}

let indexPromise: Promise<WordbookIndex> | null = null;
const bookCache = new Map<string, Promise<Wordbook>>();
const matchCache = new Map<string, SongMatchIndex>();

export function loadWordbookIndex() {
  if (!indexPromise) {
    indexPromise = fetch('/wordbooks/index.json')
      .then((response) => {
        if (!response.ok) throw new WordbookUnavailable('词书索引没有加载出来');
        return response.json() as Promise<WordbookIndex>;
      })
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

export function loadWordbook(id: string) {
  const cached = bookCache.get(id);
  if (cached) return cached;

  const promise = fetch(`/wordbooks/${encodeURIComponent(id)}.json`)
    .then(async (response) => {
      if (!response.ok) throw new WordbookUnavailable('这本词书没有加载出来');
      const raw = (await response.json()) as {
        id: string;
        name: string;
        tagline: string;
        count: number;
        words: [
          string,
          string,
          string,
          (string | null)?,
          (string[] | null)?,
          ([string, string] | null)?,
        ][];
      };
      const words: WordbookWord[] = raw.words.map(([w, p, m, s, syn, exam]) => ({
        w,
        p,
        m,
        s: s ?? undefined,
        syn: Array.isArray(syn) ? syn : undefined,
        exam: Array.isArray(exam) ? exam : undefined,
      }));
      const dict = new Map(words.map((word) => [word.w, word]));
      return {
        id: raw.id,
        name: raw.name,
        tagline: raw.tagline,
        count: raw.count,
        words,
        dict,
      } satisfies Wordbook;
    })
    .catch((error) => {
      bookCache.delete(id);
      throw error;
    });

  bookCache.set(id, promise);
  return promise;
}

function candidates(word: string) {
  const list = [word];
  const push = (value: string) => {
    if (value.length > 1 && !list.includes(value)) list.push(value);
  };

  if (IRREGULAR[word]) push(IRREGULAR[word]);

  if (word.endsWith("'s")) push(word.slice(0, -2));
  if (word.endsWith('ies')) push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ves')) {
    push(`${word.slice(0, -3)}f`);
    push(`${word.slice(0, -3)}fe`);
  }
  if (word.endsWith('es')) push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) push(word.slice(0, -1));
  if (word.endsWith('ied')) push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed')) {
    push(word.slice(0, -2));
    push(word.slice(0, -1));
    const stem = word.slice(0, -2);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) push(stem.slice(0, -1));
  }
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    push(stem);
    push(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) push(stem.slice(0, -1));
  }
  if (word.endsWith('ly')) push(word.slice(0, -2));
  if (word.endsWith('er')) {
    push(word.slice(0, -2));
    push(word.slice(0, -1));
  }
  if (word.endsWith('est')) {
    push(word.slice(0, -3));
    push(word.slice(0, -2));
  }
  return list;
}

export function lookupWord(surface: string, dict: Map<string, WordbookWord>) {
  const lower = surface.toLowerCase();
  if (STOPWORDS.has(lower)) return undefined;
  for (const candidate of candidates(lower)) {
    const hit = dict.get(candidate);
    if (hit) return hit;
  }
  return undefined;
}

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

export function buildSongMatches(lines: LyricLine[], book: Wordbook): SongMatchIndex {
  const cacheKey = `${book.id}:${lines[0]?.key ?? 'empty'}:${lines.length}`;
  const cached = matchCache.get(cacheKey);
  if (cached) return cached;

  const byLine = new Map<string, Map<string, WordbookWord>>();
  const words = new Map<string, { entry: WordbookWord; lineIndex: number; time: number; lineText: string }>();

  lines.forEach((line, lineIndex) => {
    const lineMap = new Map<string, WordbookWord>();
    for (const match of line.text.matchAll(WORD_RE)) {
      const surface = match[0];
      const entry = lookupWord(surface, book.dict);
      if (!entry) continue;
      lineMap.set(surface.toLowerCase(), entry);
      if (!words.has(entry.w)) {
        words.set(entry.w, { entry, lineIndex, time: line.time, lineText: line.text });
      }
    }
    if (lineMap.size) byLine.set(line.key, lineMap);
  });

  const result = { byLine, words, count: words.size };
  if (matchCache.size > 80) matchCache.clear();
  matchCache.set(cacheKey, result);
  return result;
}

export function splitWordSenses(meaning: string) {
  return meaning
    .split(/；|;/)
    .map((part) => part.trim())
    .filter(Boolean);
}
