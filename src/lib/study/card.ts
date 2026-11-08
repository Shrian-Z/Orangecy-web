import { allSenses, primarySense } from './gloss.ts';
import type { Example, Phrase, RootNote, Sense, WordEntry } from './types.ts';

export interface CardViewData {
  word: string;
  phonetics: Array<{ label: '英' | '美'; value: string }>;
  audio: Array<{ label: '英' | '美'; url: string }>;
  primary: Sense | null;
  senses: Sense[];
  examples: Example[];
  forms: string[];
  phrases: Phrase[];
  roots: RootNote[];
  syllables?: string;
}

/**
 * Project a WordEntry into the sections that a card can render. Empty sections
 * are kept empty so the UI can decide whether to show a divider; the order is
 * the same as the shipped card: phonetics, meaning, examples, forms, phrases,
 * roots.
 */
export function buildCardView(entry: WordEntry): CardViewData {
  const phonetics: CardViewData['phonetics'] = [];
  if (entry.phoneticUK) phonetics.push({ label: '英', value: entry.phoneticUK });
  if (entry.phoneticUS) phonetics.push({ label: '美', value: entry.phoneticUS });

  const audio: CardViewData['audio'] = [];
  if (entry.audioUK) audio.push({ label: '英', url: entry.audioUK });
  if (entry.audioUS) audio.push({ label: '美', url: entry.audioUS });

  return {
    word: entry.word,
    phonetics,
    audio,
    primary: primarySense(entry),
    senses: allSenses(entry),
    examples: entry.examples?.filter((example) => example.en.trim().length > 0) ?? [],
    forms: entry.forms?.filter(Boolean) ?? [],
    phrases: entry.phrases?.filter((phrase) => phrase.en.trim().length > 0) ?? [],
    roots: entry.roots?.filter((root) => root.root.trim().length > 0) ?? [],
    syllables: entry.syllables,
  };
}
