// Legacy shim: the audio source moved to src/audio/source.ts in the ammo migration.
// Old UI keeps importing here so the shell can run unchanged during the move.
export { player } from '@/audio/source';
