/**
 * 30 天模拟：验证「每日配额 / 今日额度 / 分组 / 漏学 / 超额 / ETA」的行为。
 *
 * 运行：node demo/everyday-demo.ts
 *
 * 这个演示不依赖 SRS 库；复习队列用一个最小模型表示：
 * 今天新学的词明天到期，到期未复习则累积到后一天。
 */
import {
  EverydayStudy,
  computeQuota,
  estimateFinish,
  isPlanDone,
  planProgress,
  quotaForBook,
  splitSessions,
  studyDayOf,
  type Plan,
} from '../src/everyday.ts';

const BOOK_SIZE = 3500;
const DAILY_NEW = 30;
const GROUP_SIZE = 10;
const START = new Date(2026, 10, 6, 9, 0);

const plan: Plan = { bookId: 'kaoyan-3500', dailyNew: DAILY_NEW };

function pad(value: string | number, width: number): string {
  return String(value).padStart(width, ' ');
}

console.log('不背单词 · 每日单词量模型（独立实现）');
console.log('书 3500 词 / 每日新学 30 / 学习节奏 10 / 学习日 04:00 开始\n');
console.log(
  ['日', '学习日', '配额', '已学', '复习', '剩余', '进度', 'ETA'].map((s) => pad(s, 8)).join(''),
);

let remaining = BOOK_SIZE;
let dueBacklog = 0;
let learnedYesterday = 0;
let learnedTotal = 0;
let reviewedTotal = 0;
let slipDay = -1;

for (let day = 0; day < 30; day += 1) {
  const now = new Date(START.getTime() + day * 86_400_000);
  const study = new EverydayStudy({ plan, now, groupSize: GROUP_SIZE });

  // 今天到期 = 昨天新学（若昨天没复习）+ 之前积压。
  const due = learnedYesterday + dueBacklog;

  // 第 10 天故意不学：演示“漏学不补额度，只推迟 ETA”。
  const skip = day === 9;
  if (skip) slipDay = day;

  const startSnap = study.snapshot({ main: remaining }, due, now);
  let learnedToday = 0;
  let reviewedToday = 0;

  if (!skip) {
    // 正常新学：一组一组走，直到今日额度为 0。
    for (;;) {
      const session = study.startNewSession({ main: remaining });
      if (!session) break;
      const take = Math.min(session.size, remaining);
      study.recordLearned(take);
      remaining -= take;
      learnedToday += take;
      learnedTotal += take;
    }

    // 今天复习：演示不占新学额度、也不设每日上限。
    for (;;) {
      const session = study.startReviewSession(due - reviewedToday);
      if (!session) break;
      const take = Math.min(session.size, due - reviewedToday);
      study.recordReviewed(take);
      reviewedToday += take;
      reviewedTotal += take;
    }

    // 第 15 天：配额完成后额外学一组。
    if (day === 14) {
      const extra = study.startExtraSession({ main: remaining });
      if (extra) {
        const take = Math.min(extra.size, remaining);
        study.recordLearned(take);
        remaining -= take;
        learnedToday += take;
        learnedTotal += take;
        console.log(`   ↳ 第 15 天触发「再学一组」：+${take}`);
      }
    }
  }

  const snap = study.snapshot({ main: remaining }, due - reviewedToday, now);
  const eta = snap.eta;
  const etaText = eta?.finished ? '已完成' : eta?.date ?? '-';
  const progress = snap.progress ? `${snap.progress.learned}/${snap.progress.total}` : '-';

  console.log(
    [
      pad(day + 1, 6),
      pad(snap.studyDay, 12),
      pad(startSnap.todayNew, 5),
      pad(learnedToday, 5),
      pad(reviewedToday, 5),
      pad(remaining, 6),
      pad(progress, 8),
      pad(etaText, 12),
    ].join(''),
  );

  // 明天的到期：今天新学的词 + 今天没复习完的积压。
  dueBacklog = Math.max(0, due - reviewedToday);
  learnedYesterday = learnedToday;
}

console.log('\n汇总');
console.log(`  30 天内新学：${learnedTotal} 词`);
console.log(`  30 天内复习：${reviewedTotal} 词`);
console.log(`  剩余：${remaining} 词`);
console.log(`  漏学日：第 ${slipDay + 1} 天（额度不补，ETA 顺延）`);

const finalPlan = plan;
const day30 = new Date(START.getTime() + 29 * 86_400_000);
const finalEta = estimateFinish(finalPlan, { main: remaining }, day30);
console.log(`  第 30 天的 ETA：${finalEta?.days} 天（${finalEta?.date}）`);
console.log(`  第 1 天额度：${JSON.stringify(computeQuota(finalPlan, { main: 0 }, { main: BOOK_SIZE }))}`);
console.log(`  第 1 天分组：${JSON.stringify(splitSessions(DAILY_NEW, GROUP_SIZE))}`);

console.log('\n边界用例');
const cases: Array<[string, number, number, number]> = [
  ['配额 10 / 已学 0 / 剩余 100', 10, 0, 100],
  ['配额 10 / 已学 4 / 剩余 100', 10, 4, 100],
  ['配额 10 / 已学 4 / 剩余 3', 10, 4, 3],
  ['配额 10 / 已学 12 / 剩余 100', 10, 12, 100],
  ['配额 100 / 剩余 3', 100, 0, 3],
];
for (const [label, daily, learned, rest] of cases) {
  const quota = quotaForBook(daily, learned, rest);
  const progress = planProgress({ ...plan, dailyNew: daily }, { main: learned }, { main: rest });
  const done = isPlanDone({ ...plan, dailyNew: daily }, { main: learned }, { main: rest });
  console.log(
    `  ${label.padEnd(30)} → 今日额度 ${String(quota).padStart(3)} / 进度 ${progress?.learned}/${progress?.total} / 完成 ${done}`,
  );
}

console.log('\n学习日边界');
for (const hour of [0, 3, 4, 23]) {
  const now = new Date(2026, 10, 6, hour, 30);
  console.log(`  11-06 ${String(hour).padStart(2, '0')}:30 → ${studyDayOf(now)}`);
}
