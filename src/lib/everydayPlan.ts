import type { FocusCardData } from '@/cards';
import type { StudyState } from '@/lib/srs';
import {
  estimateFinish,
  isAllLearned,
  isPlanDone,
  planProgress,
  quotaForBook,
  studyDayOf,
  type Eta,
  type PlanProgress,
} from './everyday.ts';

/**
 * Orangecy 的“今天”仍按本地日历日切（见 docs/decisions.md 2026-10-25 的
 * “今天首次学过 / 23:59:59.999 到期”口径）。把这里改成 4 即可切到不背单词
 * 的 04:00 学习日；`src/lib/everyday.ts` 已支持。
 */
export const ORANGECY_DAY_CUTOFF_HOUR = 0;

export function orangecyStudyDay(now: Date | number | string = new Date()): string {
  return studyDayOf(now, ORANGECY_DAY_CUTOFF_HOUR);
}

/** 今天首次学会的词数（按 StudyRecord.addedAt 的学习日统计）。 */
export function learnedNewToday(state: StudyState, now: Date | number | string = new Date()): number {
  const today = orangecyStudyDay(now);
  return Object.values(state.cards).filter(
    (record) => studyDayOf(new Date(record.addedAt), ORANGECY_DAY_CUTOFF_HOUR) === today,
  ).length;
}

/** 今天的额外新词（“再学 10 个”）；跨天自动归零。 */
export function extraNewToday(state: StudyState, now: Date | number | string = new Date()): number {
  return state.daily.date === orangecyStudyDay(now) ? state.daily.extraNew : 0;
}

/** 当前词书里还没有 SRS 记录的可放卡。 */
export function unseenCards(
  state: StudyState,
  deck: FocusCardData[],
  bookWords: Set<string> | null,
): FocusCardData[] {
  if (!bookWords) return [];
  return deck.filter(
    (card) => bookWords.has(card.w.toLowerCase()) && !state.cards[card.w],
  );
}

export interface TodayPlanSnapshot {
  studyDay: string;
  baseDailyNew: number;
  extraNew: number;
  /** 今天真正生效的配额 = 设置 + 今日额外。 */
  dailyNew: number;
  learnedToday: number;
  remaining: number;
  quota: number;
  planDone: boolean;
  allLearned: boolean;
  progress: PlanProgress;
  eta: Eta;
}

/**
 * 非前端的计划快照：今日额度 / 完成 / 进度 / ETA。
 *
 * 首页仍只消费 `src/today.ts` 的 N/M；这个快照不渲染，供测试与后续功能使用，
 * 因此不会改变现有前端可见行为。
 */
export function todayPlanSnapshot(
  state: StudyState,
  deck: FocusCardData[],
  bookWords: Set<string> | null,
  now: Date | number | string = new Date(),
): TodayPlanSnapshot {
  const studyDay = orangecyStudyDay(now);
  const baseDailyNew = state.settings.newPerDay;
  const extraNew = extraNewToday(state, now);
  const dailyNew = baseDailyNew + extraNew;
  const learnedToday = learnedNewToday(state, now);
  const remaining = unseenCards(state, deck, bookWords).length;

  return {
    studyDay,
    baseDailyNew,
    extraNew,
    dailyNew,
    learnedToday,
    remaining,
    quota: quotaForBook(dailyNew, learnedToday, remaining),
    planDone: isPlanDone(dailyNew, learnedToday, remaining),
    allLearned: isAllLearned(remaining),
    progress: planProgress(dailyNew, learnedToday, remaining),
    eta: estimateFinish(dailyNew, remaining, now, ORANGECY_DAY_CUTOFF_HOUR),
  };
}
