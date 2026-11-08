import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_CUTOFF_HOUR,
  estimateFinish,
  extraSessionSize,
  isAllLearned,
  isPlanDone,
  nextNewSession,
  planProgress,
  quotaForBook,
  reviewQuota,
  splitSessions,
  studyDayOf,
} from '../src/lib/everyday.ts';

test('Orangecy 默认按日历日切天', () => {
  assert.equal(DAY_CUTOFF_HOUR, 0);
  assert.equal(studyDayOf(new Date(2026, 10, 6, 0, 0)), '2026-11-06');
  assert.equal(studyDayOf(new Date(2026, 10, 6, 23, 59)), '2026-11-06');
});

test('引擎保留不背单词的 04:00 学习日', () => {
  assert.equal(studyDayOf(new Date(2026, 10, 6, 3, 59), 4), '2026-11-05');
  assert.equal(studyDayOf(new Date(2026, 10, 6, 4, 0), 4), '2026-11-06');
  assert.equal(studyDayOf(new Date(2026, 10, 7, 0, 30), 4), '2026-11-06');
});

test('今日额度：先减后夹，剩余是硬上限', () => {
  assert.equal(quotaForBook(10, 0, 100), 10);
  assert.equal(quotaForBook(10, 4, 100), 6);
  assert.equal(quotaForBook(10, 4, 3), 3);
  assert.equal(quotaForBook(10, 10, 100), 0);
  assert.equal(quotaForBook(10, 12, 100), 0);
  assert.equal(quotaForBook(100, 0, 3), 3);
  assert.equal(quotaForBook(0, 0, 50), 0);
});

test('复习额度：0 = 不限，否则先扣今天已复习', () => {
  assert.equal(reviewQuota(50, 0, 0), 50);
  assert.equal(reviewQuota(50, 200, 0), 50);
  assert.equal(reviewQuota(300, 200, 0), 200);
  assert.equal(reviewQuota(300, 200, 80), 120);
  assert.equal(reviewQuota(300, 200, 250), 0);
  assert.equal(reviewQuota(0, 200, 0), 0);
});

test('今日进度分母：min(max(D,L), L+R)', () => {
  assert.deepEqual(planProgress(10, 0, 100), { learned: 0, total: 10, ratio: 0 });
  assert.deepEqual(planProgress(10, 4, 100), { learned: 4, total: 10, ratio: 0.4 });
  assert.equal(planProgress(10, 4, 3).total, 7);
  assert.deepEqual(planProgress(10, 12, 100), { learned: 12, total: 12, ratio: 1 });
  assert.equal(planProgress(10, 12, 0).total, 12);
});

test('完成判定：配额完成或剩余为零', () => {
  assert.equal(isPlanDone(10, 9, 5), false);
  assert.equal(isPlanDone(10, 10, 5), true);
  assert.equal(isPlanDone(10, 3, 0), true);
  assert.equal(isPlanDone(0, 0, 5), true);
  assert.equal(isAllLearned(0), true);
  assert.equal(isAllLearned(1), false);
});

test('预计完成：ceil(R/D)，以学习日为基准', () => {
  assert.equal(estimateFinish(30, 300, new Date(2026, 10, 6, 9, 0))?.days, 10);
  assert.equal(estimateFinish(30, 301, new Date(2026, 10, 6, 9, 0))?.days, 11);
  assert.equal(estimateFinish(30, 300, new Date(2026, 10, 6, 9, 0))?.date, '2026-11-16');
  assert.deepEqual(estimateFinish(30, 0, new Date(2026, 10, 6, 9, 0)), {
    days: 0,
    date: null,
    finished: true,
  });
  assert.equal(
    estimateFinish(30, 300, new Date(2026, 10, 6, 2, 0), 4)?.date,
    '2026-11-15',
  );
});

test('分组与超额只受学习节奏限制', () => {
  assert.deepEqual(splitSessions(25, 10), [10, 10, 5]);
  assert.deepEqual(splitSessions(6, 10), [6]);
  assert.deepEqual(splitSessions(0, 10), []);
  assert.deepEqual(nextNewSession(0, 10), { kind: 'none', size: 0 });
  assert.deepEqual(nextNewSession(25, 10), { kind: 'new', size: 10 });
  assert.equal(extraSessionSize(90, 10), 10);
  assert.equal(extraSessionSize(3, 10), 3);
  assert.equal(extraSessionSize(0, 10), 0);
});
