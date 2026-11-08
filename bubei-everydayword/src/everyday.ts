/**
 * 不背单词「每日单词量」行为模型。
 *
 * 这是根据 SPEC.everydayword.md 独立实现的干核心，不依赖 React、DOM、
 * 数据库或任何 SRS 库。所有函数都是可测试的纯逻辑；`EverydayStudy`
 * 只是把「学习日 / 今日已学 / 今日额度」串成一个有状态的小机器。
 *
 * 关键约束（来自规格）：
 *   1. 学习日从本地时间 04:00 开始。
 *   2. 今日额度 = min(max(每日配额 - 今日已学, 0), 剩余未学)。
 *   3. 主词书与配套词书各算一份，再相加。
 *   4. 配额用完后可以「再学一组」，但不改变配额。
 *   5. 复习量由 SRS 到期决定，不占新学额度。
 */

export const DAY_CUTOFF_HOUR = 4;
export const DEFAULT_DAILY_NEW = 10;
export const DEFAULT_GROUP_SIZE = 10;
export const DEFAULT_REVIEW_GROUP_SIZE = 10;

/** 计划选择器提供的固定每日新学档位。 */
export const DAILY_NEW_OPTIONS: readonly number[] = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
  55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
  120, 140, 160, 180, 200,
];

export type BookKind = 'main' | 'match';

export interface Plan {
  bookId: string;
  /** 主词书每日新学。 */
  dailyNew: number;
  /** 是否绑定配套词书。 */
  combineMatch?: boolean;
  matchBookId?: string;
  /** 配套词书每日新学；开启配套时缺省为 10。 */
  matchDailyNew?: number;
}

export interface Remaining {
  main: number;
  match?: number;
}

export interface LearnedToday {
  main: number;
  match?: number;
}

export interface Quota {
  main: number;
  match: number;
  total: number;
}

export interface PlanProgress {
  learned: number;
  total: number;
  ratio: number;
}

export interface Eta {
  days: number;
  /** 本地日期，格式 YYYY-MM-DD；null 表示没有可预计的完成日。 */
  date: string | null;
  finished: boolean;
}

export type SessionKind = 'new' | 'review' | 'extra' | 'none';

export interface Session {
  kind: SessionKind;
  /** 本次会话最多放多少张新词卡（review 时是复习词数）。 */
  size: number;
  /** 新学/超额时从哪本书取词。 */
  book?: BookKind;
}

export interface StudySnapshot {
  mode: 'plan' | 'free';
  studyDay: string;
  quota: Quota;
  /** 首页「学习 N」；自由学模式等于全部剩余。 */
  todayNew: number;
  /** 首页「复习 M」。 */
  todayReview: number;
  planDone: boolean;
  allLearned: boolean;
  progress: PlanProgress | null;
  eta: Eta | null;
  /** 按学习节奏切好的今日新学组。 */
  sessions: number[];
  /** 默认的新学按钮；额度为 0 时返回 none（超额需显式调用 extra）。 */
  nextNew: Session;
  nextReview: Session;
  /** 是否允许「再学一组」。 */
  canLearnExtra: boolean;
  /** 超额一组最多多少词。 */
  extraSize: number;
}

function nonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return Math.floor(value);
}

/** 04:00 学习日：取 now - 4h 的本地日期。 */
export function studyDayOf(now: Date | number | string = new Date(), cutoffHour = DAY_CUTOFF_HOUR): string {
  const date = now instanceof Date ? now : new Date(now);
  const shifted = new Date(date.getTime() - cutoffHour * 3600_000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 下一个学习日边界（本地 04:00）。 */
export function nextStudyDayStart(now: Date | number | string = new Date(), cutoffHour = DAY_CUTOFF_HOUR): Date {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const start = new Date(date.getTime());
  start.setHours(cutoffHour, 0, 0, 0);
  if (start.getTime() <= date.getTime()) {
    start.setDate(start.getDate() + 1);
    start.setHours(cutoffHour, 0, 0, 0);
  }
  return start;
}

/** 距离下一个学习日边界的毫秒数。 */
export function msUntilNextStudyDay(now: Date | number | string = new Date(), cutoffHour = DAY_CUTOFF_HOUR): number {
  const date = now instanceof Date ? now : new Date(now);
  return Math.max(0, nextStudyDayStart(date, cutoffHour).getTime() - date.getTime());
}

/** 把任意数字归一到合法档位；不合法时落到默认 10。 */
export function normalizeDailyNew(value: number): number {
  return DAILY_NEW_OPTIONS.includes(value) ? value : DEFAULT_DAILY_NEW;
}

/** 从今日状态推导单本书的额度。 */
export function quotaForBook(dailyNew: number, learnedToday: number, remaining: number): number {
  const daily = nonNegativeInt(dailyNew);
  const learned = nonNegativeInt(learnedToday);
  const left = nonNegativeInt(remaining);
  return Math.min(Math.max(daily - learned, 0), left);
}

/** 计划是否绑定配套词书。 */
export function hasMatch(plan: Plan | null | undefined): boolean {
  return Boolean(plan?.combineMatch && plan.matchBookId);
}

/** 计算主/配套/合计的今日额度。自由学模式返回全部剩余。 */
export function computeQuota(plan: Plan | null | undefined, learned: LearnedToday, remaining: Remaining): Quota {
  const remainingMain = nonNegativeInt(remaining.main);
  const remainingMatch = nonNegativeInt(remaining.match ?? 0);
  const learnedMain = nonNegativeInt(learned.main);
  const learnedMatch = nonNegativeInt(learned.match ?? 0);

  if (!plan) {
    return { main: remainingMain, match: remainingMatch, total: remainingMain + remainingMatch };
  }

  const main = quotaForBook(plan.dailyNew, learnedMain, remainingMain);
  const match = hasMatch(plan)
    ? quotaForBook(plan.matchDailyNew ?? DEFAULT_DAILY_NEW, learnedMatch, remainingMatch)
    : 0;

  return { main, match, total: main + match };
}

/** 今日整体计划是否完成。 */
export function isPlanDone(plan: Plan | null | undefined, learned: LearnedToday, remaining: Remaining): boolean {
  const remainingMain = nonNegativeInt(remaining.main);
  const remainingMatch = nonNegativeInt(remaining.match ?? 0);
  const learnedMain = nonNegativeInt(learned.main);
  const learnedMatch = nonNegativeInt(learned.match ?? 0);

  if (!plan) return remainingMain + remainingMatch === 0;

  const mainDone = learnedMain >= nonNegativeInt(plan.dailyNew) || remainingMain === 0;
  if (!hasMatch(plan)) return mainDone;

  const matchDone =
    learnedMatch >= nonNegativeInt(plan.matchDailyNew ?? DEFAULT_DAILY_NEW) || remainingMatch === 0;

  return mainDone && matchDone;
}

/** 是否整本书都学完（与“今天计划完成”不同）。 */
export function isAllLearned(plan: Plan | null | undefined, remaining: Remaining): boolean {
  const total = nonNegativeInt(remaining.main) + (hasMatch(plan) ? nonNegativeInt(remaining.match ?? 0) : 0);
  return total === 0;
}

/**
 * 今日进度分母：
 *   P = min(max(D, L), L + R)
 * 已超额时分母跟着 L 走；剩余不足时分母缩到 L + R。
 */
export function planProgress(plan: Plan | null | undefined, learned: LearnedToday, remaining: Remaining): PlanProgress | null {
  if (!plan) return null;

  const learnedMain = nonNegativeInt(learned.main);
  const learnedMatch = hasMatch(plan) ? nonNegativeInt(learned.match ?? 0) : 0;
  const remainingMain = nonNegativeInt(remaining.main);
  const remainingMatch = hasMatch(plan) ? nonNegativeInt(remaining.match ?? 0) : 0;

  const mainTotal = Math.min(Math.max(nonNegativeInt(plan.dailyNew), learnedMain), learnedMain + remainingMain);
  const matchTotal = hasMatch(plan)
    ? Math.min(Math.max(nonNegativeInt(plan.matchDailyNew ?? DEFAULT_DAILY_NEW), learnedMatch), learnedMatch + remainingMatch)
    : 0;

  const total = mainTotal + matchTotal;
  const learnedCount = learnedMain + learnedMatch;
  return {
    learned: learnedCount,
    total,
    ratio: total === 0 ? 0 : Math.min(learnedCount / total, 1),
  };
}

function localDateFromStudyDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** 预计完成：ceil(R/D)，配套取较大天数。 */
export function estimateFinish(
  plan: Plan | null | undefined,
  remaining: Remaining,
  now: Date | number | string = new Date(),
): Eta | null {
  if (!plan) return null;

  const remainingMain = nonNegativeInt(remaining.main);
  const remainingMatch = hasMatch(plan) ? nonNegativeInt(remaining.match ?? 0) : 0;
  if (remainingMain + remainingMatch === 0) {
    return { days: 0, date: null, finished: true };
  }

  const dailyMain = nonNegativeInt(plan.dailyNew);
  const dailyMatch = nonNegativeInt(plan.matchDailyNew ?? DEFAULT_DAILY_NEW);
  if (dailyMain === 0 && (!hasMatch(plan) || dailyMatch === 0)) {
    return { days: Number.POSITIVE_INFINITY, date: null, finished: false };
  }

  const mainDays = dailyMain > 0 ? Math.ceil(remainingMain / dailyMain) : 0;
  const matchDays = hasMatch(plan) && dailyMatch > 0 ? Math.ceil(remainingMatch / dailyMatch) : 0;
  const days = hasMatch(plan) ? Math.max(mainDays, matchDays) : mainDays;

  // ETA 相对“学习日”，而不是日历日：02:00 仍属于前一天。
  const base = localDateFromStudyDay(studyDayOf(now));
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');

  return { days, date: `${y}-${m}-${d}`, finished: false };
}

/** 把今日额度按学习节奏切成若干组。 */
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

/** 默认的新学会话：先主书，再配套；额度为 0 时没有。 */
export function nextNewSession(quota: Quota, groupSize = DEFAULT_GROUP_SIZE): Session {
  const size = Math.max(1, nonNegativeInt(groupSize));
  if (quota.main > 0) return { kind: 'new', size: Math.min(quota.main, size), book: 'main' };
  if (quota.match > 0) return { kind: 'new', size: Math.min(quota.match, size), book: 'match' };
  return { kind: 'none', size: 0 };
}

/** 复习会话：今天到期数按复习节奏切组，不设每日上限。 */
export function nextReviewSession(dueReviews: number, reviewGroupSize = DEFAULT_REVIEW_GROUP_SIZE): Session {
  const due = nonNegativeInt(dueReviews);
  const size = Math.max(1, nonNegativeInt(reviewGroupSize));
  return due > 0 ? { kind: 'review', size: Math.min(due, size) } : { kind: 'none', size: 0 };
}

/** 超额一组：只受学习节奏与剩余限制。 */
export function extraSessionSize(remaining: Remaining, plan: Plan | null | undefined, groupSize = DEFAULT_GROUP_SIZE): number {
  if (!plan) return 0;
  const totalRemaining = nonNegativeInt(remaining.main) + (hasMatch(plan) ? nonNegativeInt(remaining.match ?? 0) : 0);
  return Math.min(totalRemaining, Math.max(1, nonNegativeInt(groupSize)));
}

export interface StudyOptions {
  plan?: Plan | null;
  now?: Date | number | string;
  groupSize?: number;
  reviewGroupSize?: number;
  /** 初始今日已学（用于恢复页面状态）。 */
  learned?: LearnedToday;
  /** 初始今日已复习。 */
  reviewed?: number;
}

/**
 * 有状态的小机器：负责跨天归零、累计今日已学、生成首页快照。
 * UI 可以把 `snapshot()` 直接映射到「学习 N / 复习 M」。
 */
export class EverydayStudy {
  plan: Plan | null;
  readonly groupSize: number;
  readonly reviewGroupSize: number;
  studyDay: string;
  learned: Required<LearnedToday>;
  reviewedToday: number;
  private learnedMainIds = new Set<string>();
  private learnedMatchIds = new Set<string>();

  constructor(options: StudyOptions = {}) {
    this.plan = options.plan ?? null;
    this.groupSize = Math.max(1, options.groupSize ?? DEFAULT_GROUP_SIZE);
    this.reviewGroupSize = Math.max(1, options.reviewGroupSize ?? DEFAULT_REVIEW_GROUP_SIZE);
    this.studyDay = studyDayOf(options.now ?? new Date());
    this.learned = {
      main: nonNegativeInt(options.learned?.main ?? 0),
      match: nonNegativeInt(options.learned?.match ?? 0),
    };
    this.reviewedToday = nonNegativeInt(options.reviewed ?? 0);
  }

  /** 若跨过 04:00，则归零今日已学/已复习，返回是否发生了跨天。 */
  rollTo(now: Date | number | string = new Date()): boolean {
    const day = studyDayOf(now);
    if (day === this.studyDay) return false;
    this.studyDay = day;
    this.learned = { main: 0, match: 0 };
    this.reviewedToday = 0;
    this.learnedMainIds.clear();
    this.learnedMatchIds.clear();
    return true;
  }

  /** 记录一个词首次学会；重复记同一个词不会增加今日已学。 */
  learnWord(wordId: string, book: BookKind = 'main'): boolean {
    const set = book === 'main' ? this.learnedMainIds : this.learnedMatchIds;
    if (set.has(wordId)) return false;
    set.add(wordId);
    this.learned[book] += 1;
    return true;
  }

  /** 按数量累计；用于导入历史状态或批量模拟。 */
  recordLearned(count: number, book: BookKind = 'main'): number {
    const n = nonNegativeInt(count);
    this.learned[book] += n;
    return this.learned[book];
  }

  recordReviewed(count: number): number {
    this.reviewedToday += nonNegativeInt(count);
    return this.reviewedToday;
  }

  setPlan(plan: Plan | null): void {
    this.plan = plan;
  }

  quota(remaining: Remaining): Quota {
    return computeQuota(this.plan, this.learned, remaining);
  }

  snapshot(remaining: Remaining, dueReviews = 0, now: Date | number | string = new Date()): StudySnapshot {
    this.rollTo(now);
    const quota = this.quota(remaining);
    const done = isPlanDone(this.plan, this.learned, remaining);
    const allLearned = isAllLearned(this.plan, remaining);
    const progress = planProgress(this.plan, this.learned, remaining);
    const eta = estimateFinish(this.plan, remaining, now);
    const sessions = splitSessions(quota.total, this.groupSize);
    const nextNew = nextNewSession(quota, this.groupSize);
    const nextReview = nextReviewSession(dueReviews, this.reviewGroupSize);
    const extra = done && !allLearned ? extraSessionSize(remaining, this.plan, this.groupSize) : 0;

    return {
      mode: this.plan ? 'plan' : 'free',
      studyDay: this.studyDay,
      quota,
      todayNew: quota.total,
      todayReview: nonNegativeInt(dueReviews),
      planDone: done,
      allLearned,
      progress,
      eta,
      sessions,
      nextNew,
      nextReview,
      canLearnExtra: extra > 0,
      extraSize: extra,
    };
  }

  /** 开始一组新学；返回 null 表示今天额度已用完。 */
  startNewSession(remaining: Remaining): Session | null {
    const quota = this.quota(remaining);
    const session = nextNewSession(quota, this.groupSize);
    return session.kind === 'none' ? null : session;
  }

  /**
   * 开始一组超额学习。只有计划完成且仍有剩余时允许。
   * 不改变每日配额；返回 null 表示不可用。
   */
  startExtraSession(remaining: Remaining): Session | null {
    if (!this.plan) return null;
    if (!isPlanDone(this.plan, this.learned, remaining)) return null;
    const size = extraSessionSize(remaining, this.plan, this.groupSize);
    if (size === 0) return null;
    const book: BookKind = nonNegativeInt(remaining.main) > 0 ? 'main' : 'match';
    return { kind: 'extra', size, book };
  }

  startReviewSession(dueReviews: number): Session | null {
    const session = nextReviewSession(dueReviews, this.reviewGroupSize);
    return session.kind === 'none' ? null : session;
  }
}
