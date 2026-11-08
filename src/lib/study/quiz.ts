import { allSenses, normalizeMeaning, primarySense } from './gloss.ts';
import { randomInt, shuffle } from './random.ts';
import type { Rng } from './random.ts';
import type { Quiz, QuizOption, Sense, WordEntry } from './types.ts';

/**
 * 四选一的干扰项：只看「形」和「音」，不看「义」。
 *
 * 相似度来源
 *   - 形：编辑距离（短词收紧到 1，避免 cat / dog 这种也算形近）
 *   - 音：音标编辑距离；没有音标时退回 Soundex
 *
 * 语义只做一件事：排除「意思一样」的候选，避免两个选项都对。同义词表只用来
 * 排除，不用来挑选；不碰 embedding / 反义词 / 主题分组。
 *
 * 降级链（更像的先留，不够再向下补）：
 *   1. 编辑距离 ≤ 2 的真词（短词收得更紧）
 *   2. 发音相近的真词
 *   3. 同词性 + 长度相近
 *   4. 同词性
 *   5. 任意词（最后手段）
 * 某一级只有 1–2 个形近词时也留下来，缺的名额才向下一级借。
 * 全部加起来仍不够，就一个都不给，不硬凑。
 * 调用方应传入当前词书的全表；只给当天十几张卡时，第 1 级几乎永远凑不满。
 */

const FORM_LIMIT = 2;
const SOUND_LIMIT = 0.34;
const LENGTH_LIMIT = 2;

type Origin = 1 | 2 | 3 | 4 | 5;

export interface DistractorPick {
  /** 实际用了降级链的第几级；null 表示池子里一个合格干扰项都没有。 */
  level: Origin | null;
  entries: WordEntry[];
}

interface Ranked {
  entry: WordEntry;
  rank: number[];
}

function letters(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, '');
}

/** 带上限的编辑距离；超过上限立刻返回 max + 1。 */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  const lengthA = a.length;
  const lengthB = b.length;
  if (Math.abs(lengthA - lengthB) > max) return max + 1;
  if (!lengthA) return lengthB;
  if (!lengthB) return lengthA;

  let previous = new Array<number>(lengthB + 1);
  let current = new Array<number>(lengthB + 1);
  for (let j = 0; j <= lengthB; j += 1) previous[j] = j;

  for (let i = 1; i <= lengthA; i += 1) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lengthB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[lengthB];
}

const SOUNDEX_CODES: Record<string, string> = {
  b: '1', f: '1', p: '1', v: '1',
  c: '2', g: '2', j: '2', k: '2', q: '2', s: '2', x: '2', z: '2',
  d: '3', t: '3',
  l: '4',
  m: '5', n: '5',
  r: '6',
};

/** 英文发音粗编码；没有音标时的兜底。 */
export function soundex(word: string): string {
  const value = letters(word);
  if (!value) return '';
  const first = value[0];
  let out = first.toUpperCase();
  let previous = SOUNDEX_CODES[first] ?? '';
  for (let i = 1; i < value.length; i += 1) {
    const code = SOUNDEX_CODES[value[i]] ?? '';
    if (code && code !== previous) out += code;
    previous = code || value[i] === 'h' || value[i] === 'w' ? previous : '';
  }
  return out.slice(0, 4);
}

/** 音标归一：去掉斜杠、重音、长音、括号、空格。 */
export function phoneticForm(entry: WordEntry): string {
  const raw = entry.phoneticUS || entry.phoneticUK || '';
  return raw
    .toLowerCase()
    .replace(/[/[\]ˈˌː'’()\s.\-‐–—]/g, '');
}

/** 0 = 完全同音；越小越像；Infinity = 不像。 */
function phoneticCost(a: WordEntry, b: WordEntry): number {
  const left = phoneticForm(a);
  const right = phoneticForm(b);
  if (left && right) {
    const normalized = editDistance(left, right) / Math.max(left.length, right.length, 1);
    return normalized <= SOUND_LIMIT ? normalized : Number.POSITIVE_INFINITY;
  }
  // 只有缺音标时才退回 Soundex；两边都有音标就以音标为准，避免粗编码误判。
  // 比较尾码：首字母常常不同（philosophy / filozofy），但读音编码一致。
  const leftCode = soundex(a.word).slice(1);
  const rightCode = soundex(b.word).slice(1);
  if (leftCode.length >= 3 && leftCode === rightCode) return SOUND_LIMIT;
  return Number.POSITIVE_INFINITY;
}

/** 粗词性，用来做第 3/4 级。 */
export function posClass(pos: string): string {
  const value = String(pos ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!value) return '';
  if (value.startsWith('adj') || value === 'a') return 'adj';
  if (value.startsWith('adv')) return 'adv';
  if (value.startsWith('prep')) return 'prep';
  if (value.startsWith('pron')) return 'pron';
  if (value.startsWith('conj')) return 'conj';
  if (value.startsWith('num')) return 'num';
  if (value.startsWith('int')) return 'int';
  if (value.startsWith('aux')) return 'aux';
  if (value.startsWith('art')) return 'art';
  if (value.startsWith('v')) return 'v';
  if (value.startsWith('n')) return 'n';
  return '';
}

function meaningRuns(meaning: string): string[] {
  return meaning.match(/[\u4e00-\u9fff]+/g) ?? [];
}

/** 两条释义是否指向同一个意思（用于排除，不用于挑选）。 */
export function overlapsMeaning(left: string, right: string): boolean {
  if (normalizeMeaning(left) === normalizeMeaning(right)) return true;
  const a = meaningRuns(left);
  const b = meaningRuns(right);
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return true;
    }
  }
  return false;
}

function synonyms(a: WordEntry, b: WordEntry): boolean {
  const left = (a.confusables ?? []).map((item) => item.toLowerCase());
  const right = (b.confusables ?? []).map((item) => item.toLowerCase());
  return left.includes(b.word.toLowerCase()) || right.includes(a.word.toLowerCase());
}

function byRank(a: Ranked, b: Ranked): number {
  const length = Math.max(a.rank.length, b.rank.length);
  for (let i = 0; i < length; i += 1) {
    const left = a.rank[i] ?? 0;
    const right = b.rank[i] ?? 0;
    if (left !== right) return left - right;
  }
  return a.entry.word.localeCompare(b.entry.word);
}

function sameRank(a: Ranked, b: Ranked): boolean {
  const length = Math.max(a.rank.length, b.rank.length);
  for (let index = 0; index < length; index += 1) {
    if ((a.rank[index] ?? 0) !== (b.rank[index] ?? 0)) return false;
  }
  return true;
}

function takeFrom(
  list: Ranked[],
  need: number,
  rng: Rng,
  usedMeanings: Set<string>,
): WordEntry[] {
  // 先按形、再按音排好。只在排名完全相同的词之间打乱，避免 adapt 的
  // adopt（距离 1）被距离 2 的词换掉，也避免同音里拼得更像的词被换掉。
  const groups: Ranked[][] = [];
  for (const item of list.slice().sort(byRank)) {
    const last = groups[groups.length - 1];
    if (!last || !sameRank(last[0], item)) groups.push([item]);
    else last.push(item);
  }

  const picked: WordEntry[] = [];
  for (const group of groups) {
    if (picked.length >= need) break;
    for (const item of shuffle(group, rng)) {
      const sense = primarySense(item.entry);
      if (!sense) continue;
      const key = normalizeMeaning(sense.meaning);
      if (!key || usedMeanings.has(key)) continue;
      usedMeanings.add(key);
      picked.push(item.entry);
      if (picked.length >= need) break;
    }
  }
  return picked;
}

/**
 * 按降级链挑干扰项。`level` 是为了凑满名额而用到的最低一级。
 * 更高一级有几个留几个；全部加起来仍不够 `need` 个时返回空，不硬凑。
 */
export function pickDistractors(
  correct: WordEntry,
  pool: readonly WordEntry[],
  need: number,
  rng: Rng = Math.random,
): DistractorPick {
  const wanted = Math.max(0, Math.floor(need));
  const correctSense = primarySense(correct);
  if (!correctSense || !correctSense.meaning.trim() || wanted === 0) {
    return { level: null, entries: [] };
  }

  const correctSenses = allSenses(correct);
  if (!correctSenses.length) correctSenses.push(correctSense);
  const correctWord = correct.word.toLowerCase();
  const target = letters(correct.word);
  const maxForm = Math.min(FORM_LIMIT, Math.max(1, Math.floor(target.length / 2)));
  const correctPos = posClass(correctSense.pos);

  const eligible: WordEntry[] = [];
  const senseOf = new Map<string, Sense>();
  for (const entry of pool) {
    if (entry.id === correct.id) continue;
    if (entry.word.toLowerCase() === correctWord) continue;
    const sense = primarySense(entry);
    if (!sense || !sense.meaning.trim()) continue;
    if (synonyms(correct, entry)) continue;
    if (correctSenses.some((item) => overlapsMeaning(item.meaning, sense.meaning))) continue;
    eligible.push(entry);
    senseOf.set(entry.id, sense);
  }
  if (!eligible.length) return { level: null, entries: [] };

  const posLength = (): Ranked[] => {
    if (!correctPos) return [];
    const out: Ranked[] = [];
    for (const entry of eligible) {
      const sense = senseOf.get(entry.id);
      if (!sense || posClass(sense.pos) !== correctPos) continue;
      const diff = Math.abs(letters(entry.word).length - target.length);
      if (diff > LENGTH_LIMIT) continue;
      out.push({ entry, rank: [diff] });
    }
    // 这一级没有「更像」的排序依据，随机取样避免总挑到字母表开头。
    return shuffle(out, rng);
  };

  const posOnly = (): Ranked[] => {
    if (!correctPos) return [];
    const out: Ranked[] = [];
    for (const entry of eligible) {
      const sense = senseOf.get(entry.id);
      if (!sense || posClass(sense.pos) !== correctPos) continue;
      out.push({ entry, rank: [Math.abs(letters(entry.word).length - target.length)] });
    }
    return shuffle(out, rng);
  };

  const levels: Array<() => Ranked[]> = [
    // 1) 形近
    () => {
      const out: Ranked[] = [];
      for (const entry of eligible) {
        const distance = editDistance(letters(entry.word), target, maxForm);
        if (distance > maxForm) continue;
        out.push({ entry, rank: [distance, phoneticCost(correct, entry)] });
      }
      return out.sort(byRank);
    },
    // 2) 音近
    () => {
      const out: Ranked[] = [];
      for (const entry of eligible) {
        const cost = phoneticCost(correct, entry);
        if (!Number.isFinite(cost)) continue;
        out.push({ entry, rank: [cost, editDistance(letters(entry.word), target)] });
      }
      return out.sort(byRank);
    },
    // 3) 同词性 + 长度相近
    posLength,
    // 4) 同词性
    posOnly,
    // 5) 任意词
    () =>
      shuffle(eligible, rng).map((entry) => ({ entry, rank: [0] })),
  ];

  const usedMeanings = new Set<string>();
  const usedWords = new Set<string>();
  const picked: WordEntry[] = [];
  let deepest: Origin | null = null;

  for (let index = 0; index < levels.length; index += 1) {
    const remaining = wanted - picked.length;
    if (remaining <= 0) break;
    const list = levels[index]().filter(
      (item) => !usedWords.has(item.entry.word.toLowerCase()),
    );
    const batch = takeFrom(list, remaining, rng, usedMeanings);
    if (!batch.length) continue;
    for (const entry of batch) {
      picked.push(entry);
      usedWords.add(entry.word.toLowerCase());
    }
    deepest = (index + 1) as Origin;
    if (picked.length >= wanted) return { level: deepest, entries: picked };
  }

  return { level: null, entries: [] };
}

/**
 * Quiz distractors should come from the open book. The session queue is only
 * a fallback while that book is not loaded yet: a day's ten cards almost
 * never contain three look-alikes, so the ladder would otherwise fall
 * through to same-POS or random glosses.
 */
export function distractorSource<T>(
  book: readonly T[] | null | undefined,
  session: readonly T[],
): readonly T[] {
  return book && book.length > 0 ? book : session;
}

function optionOf(entry: WordEntry, sense: Sense): QuizOption {
  return {
    word: entry.word,
    pos: (sense.pos ?? '').trim(),
    meaning: sense.meaning.trim(),
  };
}

/**
 * Build a meaning-recognition question.
 *
 * Distractors come only from the caller's pool. Pass the open book's word
 * list (`distractorSource`); the ladder then prefers morphological look-alikes
 * and shows their Chinese glosses. Other senses of the same word are not
 * distractors: "book 书" vs "book 预订" is two right answers, not a quiz.
 * If the ladder cannot find enough options, the quiz is shorter rather than padded.
 */
export function buildQuiz(
  correct: WordEntry,
  pool: readonly WordEntry[],
  optionCount = 4,
  rng: Rng = Math.random,
): Quiz | null {
  const correctSense = primarySense(correct);
  if (!correctSense || !correctSense.meaning.trim()) return null;

  const desired = Math.max(1, Math.floor(optionCount));
  const need = Math.max(0, desired - 1);
  const picked = pickDistractors(correct, pool, need, rng);
  const options = picked.entries.map((entry) => {
    const sense = primarySense(entry);
    return sense ? optionOf(entry, sense) : null;
  }).filter((option): option is QuizOption => Boolean(option));

  const correctOption = optionOf(correct, correctSense);
  const correctIndex = randomInt(options.length + 1, rng);
  options.splice(correctIndex, 0, correctOption);

  return {
    promptWord: correct.word,
    options,
    correctIndex,
    correct: correctOption,
  };
}
