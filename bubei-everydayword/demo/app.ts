import {
  DAILY_NEW_OPTIONS,
  DEFAULT_GROUP_SIZE,
  computeQuota,
  estimateFinish,
  isPlanDone,
  nextNewSession,
  nextReviewSession,
  planProgress,
  splitSessions,
  studyDayOf,
  type Plan,
} from '../src/everyday.ts';

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};

const ui = {
  mode: $<HTMLButtonElement>('#mode'),
  hero: document.querySelector<HTMLElement>('.hero')!,
  kicker: $('#kicker'),
  quota: $('#quota'),
  sub: $('#sub'),
  progressText: $('#progress-text'),
  progressFill: $('#progress-fill'),
  groups: $('#groups'),
  daily: $<HTMLSelectElement>('#daily'),
  groupSize: $<HTMLSelectElement>('#group-size'),
  remaining: $<HTMLInputElement>('#remaining'),
  learned: $<HTMLInputElement>('#learned'),
  due: $<HTMLInputElement>('#due'),
  clock: $<HTMLSelectElement>('#clock'),
  learn: $<HTMLButtonElement>('#learn'),
  extra: $<HTMLButtonElement>('#extra'),
  review: $<HTMLButtonElement>('#review'),
  hint: $('#hint'),
  dayline: $('#dayline'),
};

let planMode = true;
let dailyNew = 30;
let groupSize = DEFAULT_GROUP_SIZE;
let remaining = 3500;
let learned = 0;
let due = 30;
let now = new Date(2026, 10, 6, 9, 0);
let currentDay = studyDayOf(now);
let hintOverride = '';

for (const value of DAILY_NEW_OPTIONS) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = `${value} 词`;
  if (value === dailyNew) option.selected = true;
  ui.daily.append(option);
}

function plan(): Plan | null {
  return planMode ? { bookId: 'demo-book', dailyNew } : null;
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const prefix = Number(year) === now.getFullYear() ? '' : `${year}年`;
  return `${prefix}${Number(month)}月${Number(day)}日`;
}

function clockLabel(): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function render(): void {
  const p = plan();
  const quota = computeQuota(p, { main: learned }, { main: remaining });
  const done = isPlanDone(p, { main: learned }, { main: remaining });
  const progress = planProgress(p, { main: learned }, { main: remaining });
  const eta = estimateFinish(p, { main: remaining }, now);
  const sessions = splitSessions(quota.total, groupSize);
  const reviewSize = nextReviewSession(due, groupSize).size;

  ui.hero.classList.toggle('is-done', done && remaining > 0);
  ui.kicker.textContent = done ? '今日完成' : '今天还要学';
  ui.quota.textContent = String(quota.total);
  ui.progressText.textContent = progress ? `${progress.learned} / ${progress.total}` : `已学 ${learned}`;
  ui.progressFill.style.width = `${Math.round((progress?.ratio ?? 0) * 100)}%`;

  if (!planMode) {
    ui.sub.textContent = `自由学 · 复习 ${due} 词 · 全部剩余 ${remaining}`;
  } else if (done && remaining === 0) {
    ui.sub.textContent = `全书学完 · 今日新学 ${learned} 词`;
  } else if (done) {
    ui.sub.textContent = `配额 ${dailyNew} 已完成 · 复习 ${due} 词`;
  } else {
    const etaText = eta && !eta.finished && eta.date ? `预计 ${shortDate(eta.date)} 学完` : '—';
    ui.sub.textContent = `复习 ${due} 词 · ${etaText}`;
  }

  ui.groups.replaceChildren();
  if (sessions.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'chip done';
    chip.textContent = remaining === 0 ? '全部学完' : '今日已完成';
    ui.groups.append(chip);
  } else {
    for (const size of sessions) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = String(size);
      ui.groups.append(chip);
    }
  }

  ui.daily.disabled = !planMode;
  ui.daily.value = String(dailyNew);
  ui.groupSize.value = String(groupSize);
  ui.remaining.value = String(remaining);
  ui.learned.value = String(learned);
  ui.due.value = String(due);
  ui.mode.textContent = planMode ? '计划模式' : '自由学';
  ui.mode.setAttribute('aria-pressed', String(planMode));

  ui.learn.disabled = quota.total === 0;
  ui.learn.textContent = quota.total > 0 ? `学习一组 · ${Math.min(quota.total, groupSize)}` : '今日新学已完成';
  ui.review.disabled = due === 0;
  ui.review.textContent = due > 0 ? `复习一组 · ${reviewSize}` : '今日复习已完成';
  ui.extra.hidden = !(planMode && done && remaining > 0);
  ui.extra.disabled = remaining === 0;

  if (hintOverride) {
    ui.hint.textContent = hintOverride;
    ui.hint.classList.add('warn');
  } else if (planMode && done && remaining > 0) {
    ui.hint.textContent = '今日配额已完成。可「再学一组」，但额外学习会增加复习压力。';
    ui.hint.classList.add('warn');
  } else if (planMode && remaining === 0) {
    ui.hint.textContent = '全书已学完：剩余为 0 时，即使今日未达配额也判定计划完成。';
    ui.hint.classList.remove('warn');
  } else if (!planMode) {
    ui.hint.textContent = '自由学没有每日配额：首页的「学习 N」等于全部剩余词数。';
    ui.hint.classList.remove('warn');
  } else {
    ui.hint.textContent = '一组 = min(今日额度, 学习节奏)。组走完再重算额度；漏学不补额度。';
    ui.hint.classList.remove('warn');
  }

  ui.dayline.textContent = `学习日 ${currentDay} · ${clockLabel()}`;
}

function takeNew(size: number): void {
  const take = Math.min(size, remaining);
  learned += take;
  remaining -= take;
  hintOverride = `本组学了 ${take} 词；今日已学 ${learned}，剩余 ${remaining}。`;
}

ui.learn.addEventListener('click', () => {
  const session = nextNewSession(computeQuota(plan(), { main: learned }, { main: remaining }), groupSize);
  if (session.kind === 'none') return;
  takeNew(session.size);
  render();
});

ui.extra.addEventListener('click', () => {
  if (!planMode || remaining === 0) return;
  const take = Math.min(groupSize, remaining);
  takeNew(take);
  hintOverride = `超额一组 +${take} 词；配额不变，明天仍是 ${dailyNew} 词。`;
  render();
});

ui.review.addEventListener('click', () => {
  const session = nextReviewSession(due, groupSize);
  if (session.kind === 'none') return;
  due -= session.size;
  hintOverride = `复习 ${session.size} 词；复习不占今日新学额度。`;
  render();
});

ui.mode.addEventListener('click', () => {
  planMode = !planMode;
  hintOverride = planMode ? '已切换到计划模式：按每日配额计算今日剩余。' : '已切换到自由学：没有每日配额，显示全部剩余。';
  render();
});

ui.daily.addEventListener('change', () => {
  dailyNew = Number(ui.daily.value);
  hintOverride = `每日新学改为 ${dailyNew}；已学不清零，今日额度立刻重算。`;
  render();
});

ui.groupSize.addEventListener('change', () => {
  groupSize = Number(ui.groupSize.value);
  hintOverride = `学习节奏改为 ${groupSize}；当前组不受影响，下一组按新节奏。`;
  render();
});

ui.remaining.addEventListener('input', () => {
  remaining = Math.max(0, Math.floor(Number(ui.remaining.value) || 0));
  hintOverride = '';
  render();
});

ui.learned.addEventListener('input', () => {
  learned = Math.max(0, Math.floor(Number(ui.learned.value) || 0));
  hintOverride = '';
  render();
});

ui.due.addEventListener('input', () => {
  due = Math.max(0, Math.floor(Number(ui.due.value) || 0));
  hintOverride = '';
  render();
});

ui.clock.addEventListener('change', () => {
  const [hours, minutes] = ui.clock.value.split(':').map(Number);
  const target = new Date(now.getTime());
  target.setHours(hours, minutes, 0, 0);

  const nextDay = studyDayOf(target);
  const rolled = nextDay !== currentDay;
  now = target;
  currentDay = nextDay;
  if (rolled) {
    learned = 0;
    hintOverride = '跨过 04:00：今日已学归零；每日配额不累加，剩余词数不变。';
  } else {
    hintOverride = '04:00 之前仍属于同一个学习日。';
  }
  render();
});

render();
