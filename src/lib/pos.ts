/**
 * 词性：从词书释义里读「这本书要的是哪个词性」，再从歌词上下文猜「这一句里
 * 它当什么用」。
 *
 * 只做保守判断：只有在词书只标了一个词性、且上下文足够明确时才拒绝。
 * 词书标了 n./v. 两个词性的词（book、record）不做任何过滤——词书自己都没分清，
 * 我们没有资格替它分。
 */

export type PosClass =
  | 'noun'
  | 'verb'
  | 'adj'
  | 'adv'
  | 'prep'
  | 'pron'
  | 'num'
  | 'conj'
  | 'int'
  | 'aux'
  | 'art';

const TAG_TO_CLASSES: Record<string, PosClass[]> = {
  n: ['noun'],
  v: ['verb'],
  vt: ['verb'],
  vi: ['verb'],
  adj: ['adj'],
  adv: ['adv'],
  prep: ['prep'],
  pron: ['pron'],
  num: ['num'],
  conj: ['conj'],
  int: ['int'],
  aux: ['aux'],
  art: ['art'],
  a: ['adj'],
  // 词书里偶发的合写标签
  nv: ['noun', 'verb'],
  nvt: ['noun', 'verb'],
  nvi: ['noun', 'verb'],
  vn: ['verb', 'noun'],
  vivt: ['verb'],
  vtaux: ['verb', 'aux'],
  conjn: ['conj', 'noun'],
};

const MODALS = new Set([
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'ought', 'gonna', 'wanna', 'gotta', 'cannot', "can't", "won't", "wouldn't",
  "shouldn't", "couldn't", "mustn't", "ain't", 'let', 'lets', "let's",
]);

const DETERMINERS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
  'her', 'its', 'our', 'their', 'some', 'any', 'no', 'every', 'each',
  'another', 'either', 'neither', 'both', 'all', 'much', 'many', 'few',
  'little', 'enough', 'whose', 'which', 'what',
]);

const PREPOSITIONS = new Set([
  'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'about', 'into',
  'over', 'after', 'before', 'under', 'above', 'between', 'through',
  'during', 'without', 'within', 'across', 'along', 'around', 'against',
  'toward', 'towards', 'upon', 'onto', 'beneath', 'beside', 'beyond',
  'except', 'inside', 'outside', 'since', 'until', 'till', 'behind',
  'below', 'near', 'past', 'per', 'via', 'despite',
]);

const SUBJECTS = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'who', 'there']);

const COPULAS = new Set([
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am', 'feel', 'feels',
  'felt', 'look', 'looks', 'looked', 'seem', 'seems', 'seemed', 'become',
  'becomes', 'became', 'stay', 'stays', 'remain', 'remains', 'sound', 'sounds',
]);

const NOUN_SUFFIX = /(tion|sion|ment|ness|ity|ship|hood|ism|ist|ance|ence|ology|ography)$/;
const ADJ_SUFFIX = /(ful|ous|ive|able|ible|less|ical|ish|like)$/;

function classesOfTag(tag: string): PosClass[] {
  return TAG_TO_CLASSES[tag] ?? [];
}

/**
 * 从词书释义里收集这本书标出的词性。
 * 「n. 放任；狂热；v. 遗弃；放弃」→ {noun, verb}
 * 「adj. 能；n. (Able)人名」→ {adj}（人名义丢掉）
 */
export function posClassesOf(gloss: string): Set<PosClass> {
  const out = new Set<PosClass>();
  let current: PosClass[] = [];
  for (const chunk of String(gloss ?? '').split(/[；;]/)) {
    const segment = chunk.trim();
    if (!segment) continue;
    const head = /^([a-z]{1,5})\./.exec(segment.replace(/^\[[^\]]*\]\s*/, ''));
    if (head) current = classesOfTag(head[1]);
    // 人名 / 地名不是要背的那个义项，直接跳过，也不继承给后面的释义。
    if (/人名|地名|姓氏/.test(segment)) {
      current = [];
      continue;
    }
    for (const cls of current) out.add(cls);
  }
  return out;
}

/**
 * 猜这一句里 token 当什么词性用。只返回「有把握」的结论，其余一律 null。
 */
export function inferRole(tokens: readonly string[], index: number, span = 1): PosClass | null {
  const word = tokens[index];
  if (!word) return null;
  const prev = index > 0 ? tokens[index - 1] : '';
  const next = tokens[index + span] ?? '';

  if (MODALS.has(word)) return 'verb';
  if (MODALS.has(prev)) return 'verb';
  if (SUBJECTS.has(prev) && DETERMINERS.has(next)) return 'verb';
  if (SUBJECTS.has(prev) && (word.endsWith('ed') || word.endsWith('ing'))) return 'verb';
  if (DETERMINERS.has(prev)) return ADJ_SUFFIX.test(word) ? 'adj' : 'noun';
  if (PREPOSITIONS.has(prev)) return 'noun';
  if (next === 'of') return 'noun';
  if (COPULAS.has(prev) && ADJ_SUFFIX.test(word)) return 'adj';
  if (NOUN_SUFFIX.test(word)) return 'noun';
  return null;
}

/**
 * 词书只要一个词性、而这一句明确是另一个词性 → 这句不合格。
 * 名词和形容词之间不判（an old book / a book shop 都是常见的名词修饰）。
 */
export function posConflict(allowed: Set<PosClass>, role: PosClass | null): boolean {
  if (!role || allowed.size !== 1) return false;
  const [only] = [...allowed];
  if (only === role) return false;
  if ((only === 'noun' && role === 'adj') || (only === 'adj' && role === 'noun')) return false;
  return true;
}
