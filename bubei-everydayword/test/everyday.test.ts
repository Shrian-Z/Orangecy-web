import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_NEW_OPTIONS,
  DEFAULT_DAILY_NEW,
  DEFAULT_GROUP_SIZE,
  EverydayStudy,
  computeQuota,
  estimateFinish,
  extraSessionSize,
  isAllLearned,
  isPlanDone,
  msUntilNextStudyDay,
  nextNewSession,
  nextReviewSession,
  nextStudyDayStart,
  normalizeDailyNew,
  planProgress,
  quotaForBook,
  splitSessions,
  studyDayOf,
  type Plan,
} from '../src/everyday.ts';

const plan = (dailyNew: number, extra: Partial<Plan> = {}): Plan => ({
  bookId: 'book-main',
  dailyNew,
  ...extra,
});

const matchPlan = (dailyNew: number, matchDailyNew: number): Plan => ({
  bookId: 'book-main',
  dailyNew,
  combineMatch: true,
  matchBookId: 'book-match',
  matchDailyNew,
});

test('每日新学档位：25 个固定值，默认 10', () => {
  assert.equal(DAILY_NEW_OPTIONS.length, 25);
  assert.equal(DAILY_NEW_OPTIONS[0], 5);
  assert.equal(DAILY_NEW_OPTIONS.at(-1), 200);
  assert.deepEqual(DAILY_NEW_OPTIONS.slice(0, 3), [5, 10, 15]);
  assert.deepEqual(DAILY_NEW_OPTIONS.slice(-3), [160, 180, 200]);
  assert.equal(DEFAULT_DAILY_NEW, 10);
  assert.equal(normalizeDailyNew(10), 10);
  assert.equal(normalizeDailyNew(7), 10);
  assert.equal(normalizeDailyNew(200), 200);
});

test('A1-A7 今日额度：先减后夹，剩余是硬上限', () => {
  assert.equal(quotaForBook(10, 0, 100), 10);
  assert.equal(quotaForBook(10, 4, 100), 6);
  assert.equal(quotaForBook(10, 4, 3), 3);
  assert.equal(quotaForBook(10, 10, 100), 0);
  assert.equal(quotaForBook(10, 12, 100), 0);
  assert.equal(quotaForBook(100, 0, 3), 3);
  assert.equal(quotaForBook(0, 0, 50), 0);
});

test('B1-B4 今日计划完成：配额完成或剩余为零', () => {
  assert.equal(isPlanDone(plan(10), { main: 9 }, { main: 5 }), false);
  assert.equal(isPlanDone(plan(10), { main: 10 }, { main: 5 }), true);
  assert.equal(isPlanDone(plan(10), { main: 3 }, { main: 0 }), true);
  assert.equal(isPlanDone(plan(0), { main: 0 }, { main: 5 }), true);
});

test('C1-C5 今日进度分母：min(max(D,L), L+R)', () => {
  assert.deepEqual(planProgress(plan(10), { main: 0 }, { main: 100 }), { learned: 0, total: 10, ratio: 0 });
  assert.deepEqual(planProgress(plan(10), { main: 4 }, { main: 100 }), { learned: 4, total: 10, ratio: 0.4 });
  assert.deepEqual(planProgress(plan(10), { main: 4 }, { main: 3 }), { learned: 4, total: 7, ratio: 4 / 7 });
  assert.deepEqual(planProgress(plan(10), { main: 12 }, { main: 100 }), { learned: 12, total: 12, ratio: 1 });
  assert.deepEqual(planProgress(plan(10), { main: 12 }, { main: 0 }), { learned: 12, total: 12, ratio: 1 });
});

test('D1-D4 预计完成：ceil(R/D)，剩余为零时显示已完成', () => {
  assert.equal(estimateFinish(plan(30), { main: 300 }, new Date(2026, 10, 6, 9, 0))?.days, 10);
  assert.equal(estimateFinish(plan(30), { main: 301 }, new Date(2026, 10, 6, 9, 0))?.days, 11);
  assert.deepEqual(estimateFinish(plan(30), { main: 0 }, new Date(2026, 10, 6, 9, 0)), {
    days: 0,
    date: null,
    finished: true,
  });
  assert.equal(estimateFinish(plan(30), { main: 1 }, new Date(2026, 10, 6, 9, 0))?.days, 1);
  assert.equal(estimateFinish(plan(30), { main: 300 }, new Date(2026, 10, 6, 9, 0))?.date, '2026-11-16');
  assert.equal(estimateFinish(null, { main: 300 }), null);
});

test('D5 配套计划 ETA 取主/配套较大天数', () => {
  assert.equal(estimateFinish(matchPlan(30, 10), { main: 300, match: 50 }, new Date(2026, 10, 6, 9, 0))?.days, 10);
  assert.equal(estimateFinish(matchPlan(30, 10), { main: 300, match: 500 }, new Date(2026, 10, 6, 9, 0))?.days, 50);
});

test('ETA 以学习日为基准：02:00 仍算前一天', () => {
  assert.equal(estimateFinish(plan(30), { main: 300 }, new Date(2026, 10, 6, 2, 0))?.date, '2026-11-15');
  assert.equal(estimateFinish(plan(30), { main: 300 }, new Date(2026, 10, 6, 4, 0))?.date, '2026-11-16');
});

test('E1-E4 学习日边界是本地 04:00', () => {
  assert.equal(studyDayOf(new Date(2026, 10, 6, 3, 59)), '2026-11-05');
  assert.equal(studyDayOf(new Date(2026, 10, 6, 4, 0)), '2026-11-06');
  assert.equal(studyDayOf(new Date(2026, 10, 7, 0, 30)), '2026-11-06');
  assert.equal(studyDayOf(new Date(2026, 10, 7, 4, 0)), '2026-11-07');
  assert.equal(studyDayOf(new Date(2026, 10, 6, 23, 59)), '2026-11-06');
});

test('E5 03:59 距离下一个学习日 1 分钟；04:00 距离 24 小时', () => {
  assert.equal(msUntilNextStudyDay(new Date(2026, 10, 6, 3, 59)), 60_000);
  assert.equal(msUntilNextStudyDay(new Date(2026, 10, 6, 4, 0)), 24 * 3600_000);
  assert.equal(
    nextStudyDayStart(new Date(2026, 10, 6, 3, 59)).getTime(),
    new Date(2026, 10, 6, 4, 0).getTime(),
  );
});

test('F1-F4 按学习节奏切组', () => {
  assert.deepEqual(splitSessions(25, 10), [10, 10, 5]);
  assert.deepEqual(splitSessions(6, 10), [6]);
  assert.deepEqual(splitSessions(0, 10), []);
  assert.deepEqual(splitSessions(30, 15), [15, 15]);
  assert.equal(DEFAULT_GROUP_SIZE, 10);
});

test('G1-G4 配套词书各自算额度后相加', () => {
  const g1 = computeQuota(matchPlan(20, 10), { main: 5, match: 10 }, { main: 100, match: 50 });
  assert.deepEqual(g1, { main: 15, match: 0, total: 15 });
  // 两侧都有余额时分别计算再相加。
  const g1b = computeQuota(matchPlan(20, 10), { main: 5, match: 4 }, { main: 100, match: 50 });
  assert.deepEqual(g1b, { main: 15, match: 6, total: 21 });

  const g2 = computeQuota(matchPlan(20, 10), { main: 20, match: 0 }, { main: 100, match: 50 });
  assert.deepEqual(g2, { main: 0, match: 10, total: 10 });

  const g3 = computeQuota(matchPlan(20, 10), { main: 25, match: 12 }, { main: 100, match: 50 });
  assert.deepEqual(g3, { main: 0, match: 0, total: 0 });

  const g4 = computeQuota(matchPlan(20, 10), { main: 0, match: 0 }, { main: 3, match: 4 });
  assert.deepEqual(g4, { main: 3, match: 4, total: 7 });
});

test('H1-H2 自由学：今日新学等于全部剩余，没有 ETA/进度', () => {
  assert.deepEqual(computeQuota(null, { main: 0, match: 0 }, { main: 3500, match: 0 }), {
    main: 3500,
    match: 0,
    total: 3500,
  });
  assert.deepEqual(computeQuota(null, { main: 0, match: 0 }, { main: 0, match: 0 }), {
    main: 0,
    match: 0,
    total: 0,
  });
  assert.equal(isPlanDone(null, { main: 0, match: 0 }, { main: 3500, match: 0 }), false);
  assert.equal(isPlanDone(null, { main: 0, match: 0 }, { main: 0, match: 0 }), true);
  assert.equal(planProgress(null, { main: 0, match: 0 }, { main: 3500, match: 0 }), null);
  assert.equal(estimateFinish(null, { main: 3500, match: 0 }), null);
});

test('allLearned 与 planDone 不同：今天配额完成不等于全书学完', () => {
  const p = plan(10);
  assert.equal(isPlanDone(p, { main: 10 }, { main: 90 }), true);
  assert.equal(isAllLearned(p, { main: 90 }), false);
  assert.equal(isAllLearned(p, { main: 0 }), true);
  assert.equal(isAllLearned(null, { main: 0 }), true);
});

test('配套未开启时忽略 match 剩余', () => {
  const p = plan(10);
  assert.deepEqual(computeQuota(p, { main: 0, match: 0 }, { main: 50, match: 30 }), {
    main: 10,
    match: 0,
    total: 10,
  });
  assert.equal(isPlanDone(p, { main: 10, match: 0 }, { main: 50, match: 30 }), true);
  assert.equal(isAllLearned(p, { main: 0, match: 30 }), true);
  assert.equal(isAllLearned(p, { main: 50, match: 30 }), false);
});

test('默认会话：先主书后配套，不超过学习节奏', () => {
  assert.deepEqual(nextNewSession({ main: 25, match: 7, total: 32 }, 10), {
    kind: 'new',
    size: 10,
    book: 'main',
  });
  assert.deepEqual(nextNewSession({ main: 0, match: 7, total: 7 }, 10), {
    kind: 'new',
    size: 7,
    book: 'match',
  });
  assert.deepEqual(nextNewSession({ main: 0, match: 0, total: 0 }, 10), { kind: 'none', size: 0 });
});

test('复习会话：按复习节奏切组，不设每日上限', () => {
  assert.deepEqual(nextReviewSession(50, 10), { kind: 'review', size: 10 });
  assert.deepEqual(nextReviewSession(3, 10), { kind: 'review', size: 3 });
  assert.deepEqual(nextReviewSession(0, 10), { kind: 'none', size: 0 });
});

test('超额学习：只有计划完成且仍有剩余时可用', () => {
  assert.equal(extraSessionSize({ main: 90 }, plan(10), 10), 10);
  assert.equal(extraSessionSize({ main: 3 }, plan(10), 10), 3);
  assert.equal(extraSessionSize({ main: 0 }, plan(10), 10), 0);
  assert.equal(extraSessionSize({ main: 90 }, null, 10), 0);
});

test('EverydayStudy：跨天归零、单词去重、状态快照', () => {
  const study = new EverydayStudy({
    plan: plan(10),
    now: new Date(2026, 10, 6, 5, 0),
    groupSize: 5,
  });

  assert.equal(study.learnWord('abandon'), true);
  assert.equal(study.learnWord('abandon'), false);
  assert.equal(study.learnWord('ability'), true);
  assert.equal(study.learned.main, 2);

  const snap = study.snapshot({ main: 100 }, 12, new Date(2026, 10, 6, 6, 0));
  assert.equal(snap.mode, 'plan');
  assert.equal(snap.todayNew, 8);
  assert.equal(snap.todayReview, 12);
  assert.deepEqual(snap.sessions, [5, 3]);
  assert.equal(snap.nextNew.kind, 'new');
  assert.equal(snap.nextNew.size, 5);
  assert.equal(snap.planDone, false);
  assert.equal(snap.canLearnExtra, false);
  assert.equal(snap.eta?.days, 10);

  study.recordReviewed(12);
  assert.equal(study.reviewedToday, 12);

  // 04:00 之前仍是同一天。
  assert.equal(study.rollTo(new Date(2026, 10, 7, 2, 0)), false);
  assert.equal(study.learned.main, 2);
  // 04:00 起归零。
  assert.equal(study.rollTo(new Date(2026, 10, 7, 4, 0)), true);
  assert.equal(study.learned.main, 0);
  assert.equal(study.reviewedToday, 0);
  assert.equal(study.snapshot({ main: 100 }, 0, new Date(2026, 10, 7, 4, 0)).todayNew, 10);
});

test('EverydayStudy：配额完成后可超额，超额不改变配额', () => {
  const study = new EverydayStudy({
    plan: plan(3),
    now: new Date(2026, 10, 6, 9, 0),
    groupSize: 10,
  });
  study.recordLearned(3);
  let snap = study.snapshot({ main: 20 }, 0);
  assert.equal(snap.todayNew, 0);
  assert.equal(snap.planDone, true);
  assert.equal(snap.canLearnExtra, true);
  assert.equal(snap.extraSize, 10);

  const extra = study.startExtraSession({ main: 20 });
  assert.deepEqual(extra, { kind: 'extra', size: 10, book: 'main' });

  study.recordLearned(10);
  snap = study.snapshot({ main: 10 }, 0);
  assert.equal(snap.todayNew, 0);
  assert.equal(snap.progress?.total, 13);
  assert.equal(snap.progress?.ratio, 1);
  assert.equal(snap.canLearnExtra, true);
});

test('EverydayStudy：未完成时不允许超额', () => {
  const study = new EverydayStudy({ plan: plan(10), now: new Date(2026, 10, 6, 9, 0) });
  study.recordLearned(4);
  assert.equal(study.startExtraSession({ main: 100 }), null);
  assert.equal(study.snapshot({ main: 100 }).canLearnExtra, false);
});

test('EverydayStudy：自由学没有超额概念', () => {
  const study = new EverydayStudy({ plan: null, now: new Date(2026, 10, 6, 9, 0) });
  const snap = study.snapshot({ main: 50 }, 0);
  assert.equal(snap.todayNew, 50);
  assert.equal(snap.canLearnExtra, false);
  assert.equal(study.startExtraSession({ main: 50 }), null);
});

test('EverydayStudy：学习会话先主书后配套', () => {
  const study = new EverydayStudy({
    plan: matchPlan(20, 10),
    now: new Date(2026, 10, 6, 9, 0),
    groupSize: 10,
  });
  study.recordLearned(18, 'main');
  study.recordLearned(4, 'match');
  const snap = study.snapshot({ main: 100, match: 100 }, 0);
  assert.deepEqual(snap.quota, { main: 2, match: 6, total: 8 });
  assert.deepEqual(study.startNewSession({ main: 100, match: 100 }), {
    kind: 'new',
    size: 2,
    book: 'main',
  });
});

test('改配额不重置今日已学', () => {
  const study = new EverydayStudy({ plan: plan(10), now: new Date(2026, 10, 6, 9, 0) });
  study.recordLearned(4);
  assert.equal(study.snapshot({ main: 100 }).todayNew, 6);
  study.setPlan(plan(20));
  assert.equal(study.snapshot({ main: 100 }).todayNew, 16);
  study.setPlan(plan(2));
  assert.equal(study.snapshot({ main: 100 }).todayNew, 0);
  assert.equal(study.snapshot({ main: 100 }).progress?.total, 4);
});

test('配额与剩余同时为 0：完成且不可超额', () => {
  const study = new EverydayStudy({ plan: plan(10), now: new Date(2026, 10, 6, 9, 0) });
  study.recordLearned(5);
  const snap = study.snapshot({ main: 0 }, 0);
  assert.equal(snap.allLearned, true);
  assert.equal(snap.planDone, true);
  assert.equal(snap.canLearnExtra, false);
  assert.equal(snap.eta?.finished, true);
});

test('复习不占用新学额度', () => {
  const study = new EverydayStudy({ plan: plan(10), now: new Date(2026, 10, 6, 9, 0) });
  study.recordReviewed(80);
  const snap = study.snapshot({ main: 100 }, 0);
  assert.equal(snap.todayNew, 10);
  assert.equal(study.startReviewSession(80)?.size, 10);
});
