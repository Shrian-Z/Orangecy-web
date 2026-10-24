import type { LyricWord } from '@/types';

export type WordPhase = 'waiting' | 'singing' | 'sung';

export function wordPhase(word: LyricWord | undefined, time: number): WordPhase | null {
  if (!word) return null;
  if (time < word.time - 0.12) return 'waiting';
  if (time < word.time + word.duration) return 'singing';
  return 'sung';
}
