import type { Sense, WordEntry } from './types.ts';

/**
 * The original app parses the leading part of speech with an anchored ASCII
 * regex. We keep the same shape on purpose: it is an approximate parser, not a
 * full dictionary tagger.
 */
const POS_RE = /^[A-Za-z &.]+\./;

const SPECIALS_RE = /[\s，。；;,、/\\|！!？?（）()【】[\]{}"'“”‘’·…—\-_.:：]/g;

export function parseGlossLine(line: string, exam = false): Sense | null {
  const trimmed = line.replace(/\r$/, '').trim();
  if (!trimmed) return null;

  const match = POS_RE.exec(trimmed);
  if (!match) {
    return { pos: '', meaning: trimmed, raw: trimmed, exam };
  }

  const pos = match[0].trim();
  const meaning = trimmed.slice(match[0].length).trim();
  return { pos, meaning, raw: trimmed, exam };
}

/** Split a multi-line gloss into senses. Empty lines and empty meanings are dropped. */
export function parseGloss(gloss: string | undefined, exam = false): Sense[] {
  if (!gloss) return [];
  return gloss
    .split(/\r?\n/)
    .map((line) => parseGlossLine(line, exam))
    .filter((sense): sense is Sense => Boolean(sense && sense.meaning));
}

/** The first non-empty line of the raw gloss, parsed. */
export function firstGlossLine(gloss: string | undefined): Sense | null {
  if (!gloss) return null;
  for (const line of gloss.split(/\r?\n/)) {
    const sense = parseGlossLine(line);
    if (sense && sense.meaning) return sense;
  }
  return null;
}

/** Correct answer / card primary sense. Explicit senses win over raw gloss. */
export function primarySense(entry: WordEntry): Sense | null {
  if (entry.senses && entry.senses.length > 0) {
    const first = entry.senses.find((sense) => sense.meaning.trim().length > 0);
    if (first) {
      return {
        pos: (first.pos ?? '').trim(),
        meaning: first.meaning.trim(),
        raw: first.raw,
        exam: first.exam,
      };
    }
  }

  const fromExam = firstGlossLine(entry.examGloss);
  if (fromExam) return fromExam;

  return firstGlossLine(entry.gloss);
}

export function allSenses(entry: WordEntry): Sense[] {
  if (entry.senses && entry.senses.length > 0) {
    return entry.senses
      .filter((sense) => sense.meaning.trim().length > 0)
      .map((sense) => ({ ...sense, pos: (sense.pos ?? '').trim(), meaning: sense.meaning.trim() }));
  }

  const senses = parseGloss(entry.gloss);
  if (entry.examGloss && entry.examGloss.trim()) {
    senses.push(...parseGloss(entry.examGloss, true));
  }
  return senses;
}

/**
 * Duplicate meanings are compared after removing punctuation and whitespace.
 * This mirrors the app's "filterSpecialChar" comparison closely enough for
 * option de-duplication; it is not a semantic similarity measure.
 */
export function normalizeMeaning(value: string): string {
  return value
    .normalize('NFKC')
    .replace(SPECIALS_RE, '')
    .toLowerCase()
    .trim();
}

/** `en||zh` is the format used by Orangecy's wordbook examples. */
export function parseExample(value: string): { en: string; zh?: string } {
  const [en, ...rest] = value.split('||');
  const zh = rest.join('||').trim();
  return {
    en: en.trim(),
    zh: zh.length > 0 ? zh : undefined,
  };
}
