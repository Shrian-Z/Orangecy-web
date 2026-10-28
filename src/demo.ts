/**
 * The public GitHub demo is a static, single-book slice. It uses the same
 * learning card, FSRS store and browser TTS as the full app, but does not call
 * the music API, so GitHub Pages can host it without a backend.
 */
export const DEMO = import.meta.env.VITE_DEMO === '1';
export const DEMO_BOOK_ID = 'demo-200';
