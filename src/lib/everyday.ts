/**
 * 每日额度内核（从 `bubei-everydayword` 的 SPEC 独立实现移植）。
 *
 * 纯函数，不依赖 React、DOM、zustand 或 Orangecy 的存储。Orangecy 的
 * `src/today.ts` 只负责把 StudyState / deck 映射成这里的输入，首页组件不变。
 *
 * 与不背单词规格的差异（由 Orangecy 既有产品裁定决定，详见 docs/decisions.md）：
 *   - `DAY_CUTOFF_HOUR` 默认 0：Orangecy 仍按本地日历日切天，到期窗口仍是当天 23:59:59.999。
 *     引擎保留 `cutoffHour` 参数，传 4 即可得到不背单词的 04:00 学习日。
 *   - 复习量保留 Orangecy 的每日上限（0 = 不限），不采用不背单词的“无上限”口径。
 *   - 单本书模型；不背单词的“主书 + 配套书”不在 Orangecy 的产品范围内。
 */

/** 0 = 本地日历日（Orangecy 现行口径）；4 = 不背单词的 04:00 学习日。 */
export const DAY_CUTOFF_HOUR = 0;

export const DEFAULT_GROUP_SIZE = 10;

export type SessionKind = 'new' | 'review' | 'extra' | 'none';

export interface PlanProgress {
  learned: number;
  total: number;
  ratio: number;
}

export interface Eta {
  days: number;
  /** 本地日期 YYYY-MM-DD；null 表示没有可预计的完成日。 */
  date: string | null;
  finished: boolean;
}

export interface Session {
  kind: SessionKind;
  size: number;
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 0 ? 0 : Math.floor(value);
}

/** 学习日：本地时间 `cutoffHour` 点切天。0 即日历日。 */
export function studyDayOf(now: Date | number | string = new Date(), cutoffHour = DAY_CUTOFF_HOUR): string {
  const date = now instanceof Date ? now : new Date(now);
  const shifted = new Date(date.getTime() - cutoffHour * 3600_000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 下一个学习日边界。 */
export function nextStudyDayStart(
  now: Date | number | string = new Date(),
  cutoffHour = DAY_CUTOFF_HOUR,
): Date {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const start = new Date(date.getTime());
  start.setHours(cutoffHour, 0, 0, 0);
  if (start.getTime() <= date.getTime()) {
    start.setDate(start.getDate() + 1);
    start.setHours(cutoffHour, 0, 0, 0);
  }
  return start;
}

/**
 * 今日剩余新词：
 *   min(max(每日配额 − 今日已学, 0), 剩余未学)
 */
export function quotaForBook(dailyNew: number, learnedToday: number, remaining: number): number {
  const daily = nonNegativeInt(dailyNew);
  const learned = nonNegativeInt(learnedToday);
  const left = nonNegativeInt(remaining);
  return Math.min(Math.max(daily - learned, 0), left);
}

/**
 * 今日可复习量：保留 Orangecy 的每日上限。
 * `limit = 0` 表示不限；否则先扣今天已复习，再与到期数取小。
 */
export function reviewQuota(due: number, limit: number, reviewedToday: number): number {
  const total = nonNegativeInt(due);
  const cap = nonNegativeInt(limit);
  if (cap === 0) return total;
  const reviewed = nonNegativeInt(reviewedToday);
  return Math.min(total, Math.max(0, cap - reviewed));
}

/** 今日进度分母：min(max(配额, 已学), 已学 + 剩余)。 */
export function planProgress(dailyNew: number, learnedToday: number, remaining: number): PlanProgress {
  const daily = nonNegativeInt(dailyNew);
  const learned = nonNegativeInt(learnedToday);
  const left = nonNegativeInt(remaining);
  const total = Math.min(Math.max(daily, learned), learned + left);
  return {
    learned,
    total,
    ratio: total === 0 ? 0 : Math.min(learned / total, 1),
  };
}

/** 今日计划完成：配额完成或书已学完。 */
export function isPlanDone(dailyNew: number, learnedToday: number, remaining: number): boolean {
  const daily = nonNegativeInt(dailyNew);
  const learned = nonNegativeInt(learnedToday);
  return learned >= daily || nonNegativeInt(remaining) === 0;
}

/** 全书学完。 */
export function isAllLearned(remaining: number): boolean {
  return nonNegativeInt(remaining) === 0;
}

function localDateFromKey(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/**
 * 预计完成：ceil(剩余 ÷ 每日配额) 天；日期以“当前学习日”为基准。
 * 剩余为 0 时返回 finished；配额为 0 且仍有剩余时不可预计。
 */
export function estimateFinish(
  dailyNew: number,
  remaining: number,
  now: Date | number | string = new Date(),
  cutoffHour = DAY_CUTOFF_HOUR,
): Eta {
  const left = nonNegativeInt(remaining);
  if (left === 0) return { days: 0, date: null, finished: true };

  const daily = nonNegativeInt(dailyNew);
  if (daily === 0) return { days: Number.POSITIVE_INFINITY, date: null, finished: false };

  const days = Math.ceil(left / daily);
  const base = localDateFromKey(studyDayOf(now, cutoffHour));
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return { days, date: `${y}-${m}-${d}`, finished: false };
}

/** 按学习节奏把额度切成若干组；Orangecy 目前不启用分组，保留给内部/后续使用。 */
export function splitSessions(total: number, groupSize = DEFAULT_GROUP_SIZE): number[] {
  const left = nonNegativeInt(total);
  const size = Math.max(1, nonNegativeInt(groupSize));
  const out: number[] = [];
  let rest = left;
  while (rest > 0) {
    out.push(Math.min(rest, size));
    rest -= size;
  }
  return out;
}

/** 下一组新学；额度为 0 时返回 none。 */
export function nextNewSession(quota: number, groupSize = DEFAULT_GROUP_SIZE): Session {
  const left = nonNegativeInt(quota);
  if (left === 0) return { kind: 'none', size: 0 };
  return { kind: 'new', size: Math.min(left, Math.max(1, nonNegativeInt(groupSize))) };
}

/** 超额一组大小；只受学习节奏与剩余限制。 */
export function extraSessionSize(remaining: number, groupSize = DEFAULT_GROUP_SIZE): number {
  return Math.min(nonNegativeInt(remaining), Math.max(1, nonNegativeInt(groupSize)));
}
