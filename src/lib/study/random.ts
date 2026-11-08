export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

export function randomInt(maxExclusive: number, rng: Rng = defaultRng): number {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
  const value = Math.floor(rng() * maxExclusive);
  return Math.max(0, Math.min(maxExclusive - 1, value));
}

/** Fisher-Yates on a copy; the input is never mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1, rng);
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}
