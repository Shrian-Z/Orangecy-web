import { addDays, dayKey, overdueDays } from './date.ts';
import type { ReviewAction, ReviewConfig, ReviewResult, WordProgress } from './types.ts';

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  minEF: 1.3,
  maxEF: 3.0,
  maxInterval: 90,
  masteryInterval: 55,
  defaultDifficulty: 50,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** round(difficulty / 10) - 1, clamped to 5..9 days. */
export function firstALevelDuration(difficulty: number): number {
  return clamp(Math.round(difficulty / 10) - 1, 5, 9);
}

/** exp(difficulty * 0.056) * 0.21, clamped to 7..54 days. */
export function speedUpDuration(difficulty: number): number {
  return clamp(Math.round(Math.exp(difficulty * 0.056) * 0.21), 7, 54);
}

/** exp(difficulty * 0.074) * 0.036, clamped to 3..54 days. */
export function firstReviewDuration(difficulty: number): number {
  return clamp(Math.round(Math.exp(difficulty * 0.074) * 0.036), 3, 54);
}

function qualityFor(action: ReviewAction, previousFailures: number): 1 | 3 | 5 | 6 {
  if (action === 'know') return 1;
  if (action === 'vague') return 3;
  return previousFailures >= 1 ? 5 : 6;
}

/**
 * Lightweight SM-2 / Leitner review scheduler.
 *
 * The numbers and branches are a normalized reading of the shipped app's
 * ReviewRatingMan. The external contract is intentionally simpler: three
 * actions in, one interval + due date out.
 */
export function scheduleReview(
  progress: WordProgress,
  action: ReviewAction,
  today: Date,
  config: Partial<ReviewConfig> = {},
  difficulty?: number,
): ReviewResult {
  const cfg = { ...DEFAULT_REVIEW_CONFIG, ...config };
  const p: WordProgress = { ...progress };
  const diff = clamp(
    Number.isFinite(difficulty) ? Number(difficulty) : cfg.defaultDifficulty,
    0,
    100,
  );
  const overdue = overdueDays(p.dueDate, today);
  const quality = qualityFor(action, p.fail);
  let interval: number;
  let mastered = false;

  if (action === 'know') {
    p.success += 1;
    p.ef = Math.min(cfg.maxEF, p.ef + 0.15);

    const base = Math.max(1, p.intervalDays) + overdue / 2;
    if (p.reps <= 1 && p.intervalDays <= 2) {
      interval = firstALevelDuration(diff);
    } else {
      interval = p.ef * base;
      if (p.reps === 2 && p.process === 1) {
        interval = Math.min(interval, speedUpDuration(diff));
      }
    }

    if (interval + overdue >= cfg.masteryInterval) {
      mastered = true;
      interval = Math.min(interval, cfg.maxInterval);
    }

    p.preReps += 1;
    p.reps += 1;
    p.process += 1;
  } else if (action === 'vague') {
    p.ef = Math.max(cfg.minEF, p.ef - 0.25);
    interval = p.preReps <= 1 ? 3 : p.preReps * 3;
    p.preReps = 0;
    p.reps += 1;
    p.process += 1;
  } else {
    p.ef = Math.max(cfg.minEF, p.ef - 0.75);
    interval = 1;
    p.process = 1;
    p.preReps = 0;
    p.reps += 1;
    p.fail += 1;
    p.cFail += 1;
  }

  interval = Math.round(clamp(interval, 1, cfg.maxInterval));
  p.intervalDays = interval;
  p.dueDate = dayKey(addDays(today, interval));
  p.state = mastered ? 'mastered' : 'reviewing';
  p.level = mastered ? 0 : p.level;
  p.totalProcess += 1;
  p.learnedAt ??= dayKey(today);
  p.canUndo = false;

  return {
    progress: p,
    intervalDays: interval,
    dueDate: p.dueDate,
    mastered,
    quality,
  };
}

/** Review cards that are due today, in due-date then insertion order. */
export function dueCards(
  progress: readonly WordProgress[],
  today: Date,
): WordProgress[] {
  const todayKey = dayKey(today);
  return progress
    .filter((p) => p.state !== 'mastered' && p.state !== 'skipped')
    .filter((p) => p.dueDate <= todayKey)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
