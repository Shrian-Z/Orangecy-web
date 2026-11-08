/**
 * Behavioural types for the 不背单词 study-mechanism reconstruction.
 *
 * These are deliberately independent of React, the DOM, Orangecy's store, and
 * any scheduler package. The goal is a small, testable core that can be
 * embedded in a larger app later.
 */

export type Level = 0 | 1 | 2 | 3 | 4;

export type LearnAction = 'know' | 'vague' | 'dontKnow' | 'tooEasy';

export type ReviewAction = 'know' | 'vague' | 'dontKnow';

export type ProgressState = 'new' | 'learning' | 'reviewing' | 'mastered' | 'skipped';

export interface Sense {
  /** Part of speech such as "n." or "adj."; empty when the line has none. */
  pos: string;
  /** Chinese meaning, trimmed. */
  meaning: string;
  /** Original line, useful for debugging or advanced rendering. */
  raw?: string;
  /** Whether this sense came from an exam-oriented gloss. */
  exam?: boolean;
}

export interface Example {
  en: string;
  zh?: string;
  audio?: string;
  source?: string;
}

export interface Phrase {
  en: string;
  zh?: string;
}

export interface RootNote {
  root: string;
  note?: string;
}

export interface WordEntry {
  id: string;
  word: string;
  phoneticUK?: string;
  phoneticUS?: string;
  audioUK?: string;
  audioUS?: string;
  /** Main gloss, usually one or more lines of "pos. meaning". */
  gloss?: string;
  /** Exam-oriented gloss, when available. */
  examGloss?: string;
  /** Explicitly parsed senses; takes precedence over gloss when present. */
  senses?: Sense[];
  examples?: Example[];
  forms?: string[];
  phrases?: Phrase[];
  roots?: RootNote[];
  /** Syllable breakdown, e.g. "ab-an-don". */
  syllables?: string;
  /** Pre-computed confusable words (the original app's v2Confuses). */
  confusables?: string[];
  /** Optional 0..100 difficulty used by the review scheduler. */
  difficulty?: number;
  tags?: string[];
}

export interface WordProgress {
  wordId: string;
  level: Level;
  state: ProgressState;
  position: number;
  /** SM-2 style easiness factor. */
  ef: number;
  reps: number;
  /** Consecutive "know" answers. */
  preReps: number;
  /** Current review interval in days. */
  intervalDays: number;
  /** Local calendar date, yyyy-MM-dd. */
  dueDate: string;
  success: number;
  fail: number;
  /** Failures while the word was at level >= 2. */
  cFail: number;
  learnedAt?: string;
  totalProcess: number;
  /** Review process counter; reset to 1 on a lapse. */
  process: number;
  canUndo: boolean;
}

export interface LearnConfig {
  /** Words in one study group. Used by the caller to select the group. */
  groupSize: number;
  /** How many "know" promotions finish a word: 3 or 4. */
  groupLayer: 3 | 4;
  /** Queue quotas observed in LeitnerConstant: 3 / 3 / 4 / 5. */
  level1Count: number;
  level2Count: number;
  level3Count: number;
  level4Count: number;
  /** 4 on desktop, 3 on compact layouts. */
  optionCount: number;
  /**
   * Shuffle the new-word bucket before serving it. The shipped app does this;
   * Orangecy sets it false so the song-matched deck order survives.
   */
  shuffleNewWords: boolean;
}

export interface CardView {
  entry: WordEntry;
  progress: WordProgress;
  /** 1-based position among unfinished unique words. */
  index: number;
  /** Total unique words in the session. */
  total: number;
  level: Level;
  canUndo: boolean;
}

export interface AnswerResult {
  entry: WordEntry;
  action: LearnAction;
  levelBefore: Level;
  levelAfter: Level;
  mastered: boolean;
  terminal: boolean;
  groupComplete: boolean;
}

export interface LearnSessionState {
  levels: [number, number, number, number, number];
  /** Unique words that reached a terminal state. */
  finished: number;
  /** Unique words in the session. */
  total: number;
  current: CardView | null;
  groupComplete: boolean;
}

export interface QuizOption {
  word: string;
  pos: string;
  meaning: string;
}

export interface Quiz {
  promptWord: string;
  options: QuizOption[];
  correctIndex: number;
  correct: QuizOption;
}

export interface ReviewConfig {
  minEF: number;
  maxEF: number;
  maxInterval: number;
  masteryInterval: number;
  defaultDifficulty: number;
}

export interface ReviewResult {
  progress: WordProgress;
  intervalDays: number;
  dueDate: string;
  mastered: boolean;
  quality: 1 | 2 | 3 | 4 | 5 | 6;
}
