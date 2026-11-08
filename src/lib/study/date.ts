/** Local calendar-date helpers. No UTC date-string slicing. */

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDayKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Whole calendar days from a to b. Positive when b is later. */
export function calendarDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function overdueDays(dueDate: string, today: Date): number {
  const due = parseDayKey(dueDate);
  if (!due) return 0;
  return Math.max(0, calendarDaysBetween(due, today));
}

export function dueOnOrBefore(dueDate: string, today: Date): boolean {
  const due = parseDayKey(dueDate);
  if (!due) return true;
  return calendarDaysBetween(due, today) >= 0;
}
