import { primarySense } from './gloss.ts';
import type { LearnAction, WordEntry } from './types.ts';

/**
 * The subset of Orangecy's `WordbookWord` that this module needs.
 * Keep this structural so the study core has no import from the Orangecy app.
 */
export interface OrangecyWordLike {
  w: string;
  p?: string;
  m: string;
  s?: string;
  syn?: string[];
  exam?: [string, string];
}

export interface FocusCardFields {
  w: string;
  p: string;
  m: string;
  k?: string;
  s?: string;
}

export function fromOrangecyWord(
  input: OrangecyWordLike,
  id = input.w,
): WordEntry {
  const example = input.s?.split('||') ?? [];
  const en = example[0]?.trim() ?? '';
  const zh = example.slice(1).join('||').trim();

  return {
    id,
    word: input.w,
    phoneticUS: input.p,
    gloss: input.m,
    examples: en ? [{ en, zh: zh || undefined }] : [],
    confusables: input.syn,
    tags: input.exam ? ['exam'] : undefined,
  };
}

export function toFocusCardFields(entry: WordEntry): FocusCardFields {
  const primary = primarySense(entry);
  const example = entry.examples?.[0];
  const knowledge = [
    ...(entry.roots ?? []).map((root) => root.root),
    ...(entry.forms ?? []),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    w: entry.word,
    p: entry.phoneticUS ?? entry.phoneticUK ?? '',
    m: primary?.meaning ?? '',
    k: knowledge || undefined,
    s: example ? `${example.en}${example.zh ? `||${example.zh}` : ''}` : undefined,
  };
}

/** Map the study action to Orangecy's three-value FSRS grade. */
export function toGrade3(action: LearnAction): 'again' | 'hard' | 'good' {
  switch (action) {
    case 'know':
      return 'good';
    case 'vague':
      return 'hard';
    case 'dontKnow':
      return 'again';
    case 'tooEasy':
      return 'good';
  }
}

export function fromGrade3(grade: 'again' | 'hard' | 'good'): LearnAction {
  if (grade === 'good') return 'know';
  if (grade === 'hard') return 'vague';
  return 'dontKnow';
}
