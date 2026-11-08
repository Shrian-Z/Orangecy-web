import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaForBook, reviewQuota, studyDayOf } from '../src/lib/everyday.ts';
import {
  learnedNewToday,
  todayPlanSnapshot,
  unseenCards,
} from '../src/lib/everydayPlan.ts';
import type { FocusCardData } from '../src/cards.ts';
import type { StudyState } from '../src/lib/srs.ts';

function calendarDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Old today.ts formula: left = max(0, D + extra − L), then slice by unseen length. */
function oldLearn(daily: number, extra: number, learned: number, unseen: number): number {
  const left = Math.max(0, daily + extra - learned);
  return Math.min(left, unseen);
}

function oldReview(due: number, limit: number, reviewed: number): number {
  if (!limit) return due;
  return Math.min(due, Math.max(0, limit - reviewed));
}

function fakeState(addedAt: string): StudyState {
  return {
    version: 1,
    cards: {
      apple: {
        word: 'apple',
        bookId: 'b',
        entry: { w: 'apple', m: '苹果' },
        card: {},
        addedAt,
      },
    },
    daily: {
      date: calendarDayKey(new Date(2026, 10, 6, 9, 0)),
      bookId: 'b',
      newWords: [],
      reviewed: [],
      extraNew: 10,
      reviewCount: 0,
    },
    settings: { newPerDay: 10, reviewPerDay: 200 },
    logs: [],
  } as unknown as StudyState;
}

const deck = [
  { w: 'apple' },
  { w: 'banana' },
  { w: 'cherry' },
] as unknown as FocusCardData[];
const bookWords = new Set(['apple', 'banana', 'cherry']);

test('学习额度与旧 today.ts 公式逐值等价', () => {
  const dailies = [5, 10, 37, 100];
  const extras = [0, 10];
  const learned = [0, 3, 10, 150];
  const unseen = [0, 1, 10, 1000];
  for (const daily of dailies) {
    for (const extra of extras) {
      for (const l of learned) {
        for (const r of unseen) {
          assert.equal(
            quotaForBook(daily + extra, l, r),
            oldLearn(daily, extra, l, r),
            `D=${daily} extra=${extra} L=${l} R=${r}`,
          );
        }
      }
    }
  }
});

test('复习额度与旧 today.ts 公式逐值等价', () => {
  const due = [0, 5, 50, 300];
  const limits = [0, 20, 100, 200, 500];
  const reviewed = [0, 7, 50, 250];
  for (const d of due) {
    for (const limit of limits) {
      for (const r of reviewed) {
        assert.equal(reviewQuota(d, limit, r), oldReview(d, limit, r), `due=${d} limit=${limit} reviewed=${r}`);
      }
    }
  }
});

test('学习日与旧 dayKey 在日历日口径下逐时等价', () => {
  for (const hour of [0, 3, 4, 9, 12, 23]) {
    const date = new Date(2026, 10, 6, hour, 30);
    assert.equal(studyDayOf(date, 0), calendarDayKey(date));
  }
});

test('todayPlanSnapshot：额外新词、进度、ETA', () => {
  const addedAt = new Date(2026, 10, 6, 9, 0).toISOString();
  const state = fakeState(addedAt);
  const now = new Date(2026, 10, 6, 15, 0);

  assert.equal(learnedNewToday(state, now), 1);
  assert.deepEqual(
    unseenCards(state, deck, bookWords).map((card) => card.w),
    ['banana', 'cherry'],
  );

  const snapshot = todayPlanSnapshot(state, deck, bookWords, now);
  assert.equal(snapshot.studyDay, '2026-11-06');
  assert.equal(snapshot.baseDailyNew, 10);
  assert.equal(snapshot.extraNew, 10);
  assert.equal(snapshot.dailyNew, 20);
  assert.equal(snapshot.learnedToday, 1);
  assert.equal(snapshot.remaining, 2);
  assert.equal(snapshot.quota, 2);
  assert.equal(snapshot.planDone, false);
  assert.equal(snapshot.allLearned, false);
  assert.deepEqual(snapshot.progress, { learned: 1, total: 3, ratio: 1 / 3 });
  assert.equal(snapshot.eta.days, 1);
  assert.equal(snapshot.eta.date, '2026-11-07');
});

test('todayPlanSnapshot：剩余为零时计划完成且不可预计', () => {
  const addedAt = new Date(2026, 10, 6, 9, 0).toISOString();
  const state = fakeState(addedAt);
  const now = new Date(2026, 10, 6, 15, 0);
  const onlyApple = [{ w: 'apple' }] as unknown as FocusCardData[];

  const snapshot = todayPlanSnapshot(state, onlyApple, new Set(['apple']), now);
  assert.equal(snapshot.remaining, 0);
  assert.equal(snapshot.quota, 0);
  assert.equal(snapshot.planDone, true);
  assert.equal(snapshot.allLearned, true);
  assert.deepEqual(snapshot.eta, { days: 0, date: null, finished: true });
});
