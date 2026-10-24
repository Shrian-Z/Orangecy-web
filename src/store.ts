// Legacy shim: the store moved to src/audio/store.ts in the ammo migration.
// Old UI keeps importing here so the shell can run unchanged during the move.
export { currentLineIndex, usePlayerStore } from '@/audio/store';
export type { AppView } from '@/audio/store';
