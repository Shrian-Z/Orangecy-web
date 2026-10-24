import { browserTts } from '@/audio/pronunciation';
import { player } from '@/audio/source';
import { currentLineIndex, usePlayerStore } from '@/audio/store';
import type { FocusCardData } from '@/cards';
import type { Song } from '@/types';

export const FLIP_MS = 320;
export const INTRO_MS = 200;
export const FRAGMENT_FADE_MS = 200;
export const QUIET_MS = 500;
export const PRONOUNCE_TIMEOUT_MS = 3000;

export type SequencePhase = 'idle' | 'flip' | 'fragment' | 'quiet' | 'pronounce' | 'rest';

export interface FocusSnapshot {
  phase: SequencePhase;
  progress: number;
  activeLine: number;
  songTime: number;
}

export interface AudioTraceEvent {
  at: number;
  event: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __orangecyAudioTrace?: AudioTraceEvent[];
    __orangecyFocusPhase?: SequencePhase;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The per-card audio timeline:
 *
 *   flip 320ms -> 200ms intro -> fragment seek -> 200ms fade-in
 *   -> lyric lines -> fade-out starting 200ms before the fragment end
 *   -> pause at end -> 500ms quiet -> word pronunciation (hard start, no fade)
 *   -> rest.
 *
 * The visual clock is independent of the audio element so the timeline still
 * runs when autoplay is blocked or the user is muted. Muting only skips audio
 * commands; it never pauses the lyric/progress timeline.
 */
export class FocusSequence {
  private card: FocusCardData | null = null;
  private phase: SequencePhase = 'idle';
  private muted = false;
  private stopped = false;
  private startedAt = 0;
  private fragmentStartedAt = 0;
  private duration = 0;
  private progress = 0;
  private activeLine = -1;
  private songTime = 0;
  private autoPronounce = true;
  private pronounceSkipped = false;
  private timers = new Set<number>();
  private raf = 0;
  private lastEmit = 0;
  private volumeToken = 0;
  private requestId = 0;
  private traceEvents: AudioTraceEvent[] = [];
  private onUpdate: (snapshot: FocusSnapshot) => void;

  constructor(onUpdate: (snapshot: FocusSnapshot) => void) {
    this.onUpdate = onUpdate;
  }

  getTrace() {
    return this.traceEvents;
  }

  async start(card: FocusCardData) {
    const request = ++this.requestId;
    await this.stop({ fadeOut: false });
    if (request !== this.requestId) return;

    this.card = card;
    this.stopped = false;
    this.phase = 'flip';
    this.progress = 0;
    this.activeLine = -1;
    this.songTime = card.fragment.start;
    this.beginTrace('card');
    this.trace('flip', { flipMs: FLIP_MS, introMs: INTRO_MS });
    this.emit();

    const run = this.requestId;
    const ready = this.ensureTrack(card.track);
    this.later(() => {
      void ready.then(() => {
        if (run !== this.requestId || this.phase !== 'flip') return;
        this.runFragment(true);
      });
    }, FLIP_MS + INTRO_MS);
  }

  async replayFragment() {
    const card = this.card;
    if (!card) return;
    await this.stop({ fadeOut: true });
    this.beginTrace('replay-fragment');
    this.runFragment(false);
  }

  async speakWord() {
    const card = this.card;
    if (!card) return;
    await this.stop({ fadeOut: true });
    this.beginTrace('manual-pronounce');
    this.speakNow(card.w);
  }

  setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    this.trace('mute', { muted });
    if (!this.card) return;

    if (muted) {
      browserTts.cancel();
      if (this.phase === 'fragment') {
        void this.rampVolume(usePlayerStore.getState().volume, 0, FRAGMENT_FADE_MS).then(() => this.pauseAudio());
      } else if (this.phase === 'pronounce') {
        this.pronounceSkipped = true;
        this.phase = 'rest';
        this.emit();
      }
      return;
    }

    if (this.phase === 'fragment') {
      const time = this.currentSongTime();
      player.setVolume(0);
      this.trace('unmute-resume', { time });
      void player.seekTo(time, { play: true });
      void this.rampVolume(0, 1, FRAGMENT_FADE_MS);
    } else if (this.phase === 'pronounce' && this.pronounceSkipped) {
      this.speakNow(this.card.w);
    }
  }

  /** Called on the first pointerdown/keydown; browsers may block autoplay. */
  resumeAfterGesture() {
    if (this.muted || this.phase !== 'fragment') return;
    if (usePlayerStore.getState().playing) return;
    const time = this.currentSongTime();
    player.setVolume(0);
    this.trace('gesture-resume', { time });
    void player.seekTo(time, { play: true });
    void this.rampVolume(0, 1, FRAGMENT_FADE_MS);
  }

  async stop({ fadeOut = false }: { fadeOut?: boolean } = {}) {
    const wasFragment = this.phase === 'fragment';
    const shouldFade = fadeOut && wasFragment && !this.muted;
    this.stopped = true;
    this.clearTimers();
    this.volumeToken += 1;
    browserTts.cancel();
    this.phase = 'idle';
    this.emit();
    this.trace('stop', { fade: shouldFade ? FRAGMENT_FADE_MS : 0 });
    if (shouldFade) await this.rampVolume(usePlayerStore.getState().volume, 0, FRAGMENT_FADE_MS);
    this.pauseAudio();
    this.emit();
  }

  /** Stop timers without touching the card reference (used by start/replay). */
  async dispose() {
    await this.stop({ fadeOut: false });
    this.card = null;
  }

  private beginTrace(label: string) {
    this.startedAt = performance.now();
    this.traceEvents = [];
    window.__orangecyAudioTrace = this.traceEvents;
    this.stopped = false;
    this.trace('sequence-start', { label });
  }

  private trace(event: string, data: Record<string, unknown> = {}) {
    const at = this.startedAt ? Number((performance.now() - this.startedAt).toFixed(1)) : 0;
    const entry = { at, event, ...data };
    this.traceEvents.push(entry);
    window.__orangecyAudioTrace = this.traceEvents;
  }

  private emit() {
    window.__orangecyFocusPhase = this.phase;
    this.onUpdate({
      phase: this.phase,
      progress: this.progress,
      activeLine: this.activeLine,
      songTime: this.songTime,
    });
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, Math.max(0, ms));
    this.timers.add(id);
  }

  private clearTimers() {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private async ensureTrack(track: Song) {
    const state = usePlayerStore.getState();
    if (state.song?.id === track.id && state.audioReady) {
      this.trace('track-ready', {
        trackId: track.id,
        cached: true,
        available: state.playInfo?.available ?? null,
        lyricLines: state.lines.length,
      });
      return true;
    }

    this.trace('load-track', { trackId: track.id, title: track.title });
    void player.loadSong(track, { autoplay: false });
    const deadline = performance.now() + 8000;
    while (!this.stopped && performance.now() < deadline) {
      const next = usePlayerStore.getState();
      if (next.song?.id === track.id && next.audioReady) {
        this.trace('track-ready', {
          trackId: track.id,
          cached: false,
          available: next.playInfo?.available ?? null,
          lyricLines: next.lines.length,
        });
        return true;
      }
      await sleep(50);
    }
    this.trace('track-timeout', { trackId: track.id });
    return false;
  }

  private runFragment(autoPronounce: boolean) {
    const card = this.card;
    if (!card || this.stopped) return;
    this.autoPronounce = autoPronounce;
    this.phase = 'fragment';
    this.fragmentStartedAt = performance.now();
    this.duration = Math.max(0.5, card.fragment.end - card.fragment.start);
    this.progress = 0;
    this.songTime = card.fragment.start;
    this.activeLine = currentLineIndex(card.fragment.lines, card.fragment.start);
    this.trace('fragment-start', {
      start: card.fragment.start,
      end: card.fragment.end,
      duration: Number(this.duration.toFixed(2)),
      autoPronounce,
    });
    this.emit();

    if (this.muted) {
      this.trace('muted-skip-audio', { stage: 'fragment' });
    } else {
      player.setVolume(0);
      this.trace('volume', { value: 0, stage: 'fragment' });
      this.trace('seek', { time: card.fragment.start, play: true });
      void player.seekTo(card.fragment.start, { play: true });
      this.trace('play');
      void this.rampVolume(0, 1, FRAGMENT_FADE_MS);
      this.later(() => {
        const check = usePlayerStore.getState().seekCheck;
        this.trace('seek-check', {
          present: Boolean(check),
          requested: check?.requested ?? null,
          actual: check?.actual ?? null,
          passed: check?.passed ?? null,
          playing: check?.playing ?? null,
        });
      }, 1200);
    }

    this.startProgressLoop();
    this.later(() => this.beginFadeOut(), Math.max(0, (this.duration - FRAGMENT_FADE_MS / 1000) * 1000));
    this.later(() => this.endFragment(), this.duration * 1000);
  }

  private startProgressLoop() {
    const card = this.card;
    if (!card) return;
    const tick = () => {
      if (this.phase !== 'fragment' || this.stopped) return;
      const elapsed = Math.min(
        this.duration,
        Math.max(0, (performance.now() - this.fragmentStartedAt) / 1000),
      );
      this.songTime = card.fragment.start + elapsed;
      this.progress = this.duration > 0 ? elapsed / this.duration : 0;
      const active = currentLineIndex(card.fragment.lines, this.songTime);
      const changed = active !== this.activeLine;
      this.activeLine = active;
      const now = performance.now();
      if (changed || now - this.lastEmit >= 50) {
        this.lastEmit = now;
        this.emit();
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private currentSongTime() {
    if (this.phase !== 'fragment' || !this.card) return this.card?.fragment.start ?? 0;
    return Math.min(
      this.card.fragment.end,
      this.card.fragment.start + (performance.now() - this.fragmentStartedAt) / 1000,
    );
  }

  private beginFadeOut() {
    if (this.phase !== 'fragment') return;
    if (this.muted) {
      this.trace('muted-skip-audio', { stage: 'fade-out' });
      return;
    }
    this.trace('fade-out', { from: 1, to: 0, ms: FRAGMENT_FADE_MS });
    void this.rampVolume(usePlayerStore.getState().volume, 0, FRAGMENT_FADE_MS);
  }

  private endFragment() {
    if (this.phase !== 'fragment') return;
    this.phase = 'quiet';
    this.progress = 1;
    this.songTime = this.card?.fragment.end ?? this.songTime;
    this.activeLine = (this.card?.fragment.lines.length ?? 1) - 1;
    if (!this.muted) {
      player.setVolume(0);
      this.trace('volume', { value: 0, stage: 'fragment-end' });
      this.pauseAudio();
    } else {
      this.trace('muted-skip-audio', { stage: 'pause' });
    }
    this.emit();
    this.trace('quiet', { ms: QUIET_MS });
    this.later(() => this.beginPronounce(), QUIET_MS);
  }

  private beginPronounce() {
    if (this.phase !== 'quiet' || !this.card) return;
    if (!this.autoPronounce) {
      this.phase = 'rest';
      this.trace('rest', { reason: 'manual-replay' });
      this.emit();
      return;
    }
    if (this.muted) {
      this.pronounceSkipped = true;
      this.trace('pronounce-skip-muted', { word: this.card.w });
      this.later(() => this.rest(), 300);
      return;
    }
    this.speakNow(this.card.w);
  }

  private speakNow(word: string) {
    this.phase = 'pronounce';
    this.pronounceSkipped = false;
    this.emit();
    this.trace('pronounce', {
      word,
      fadeIn: 0,
      fadeOut: 0,
      provider: 'browserTts',
      supportsGainRamp: browserTts.supportsGainRamp,
    });
    void browserTts
      .speak(word, {
        onStart: () => this.trace('pronounce-start', { word }),
        onEnd: () => this.trace('pronounce-end', { word }),
      })
      .then(() => {
        if (this.phase === 'pronounce') this.rest();
      });
  }

  private rest() {
    this.phase = 'rest';
    this.trace('rest', {});
    this.emit();
  }

  private pauseAudio() {
    if (usePlayerStore.getState().playing) {
      this.trace('pause');
      void player.toggle();
    }
  }

  private rampVolume(from: number, to: number, ms: number): Promise<void> {
    if (this.muted && to > 0) {
      player.setVolume(0);
      this.trace('fade-skip-muted', { from, to, ms });
      return Promise.resolve();
    }
    this.volumeToken += 1;
    const token = this.volumeToken;
    const started = performance.now();
    this.trace('fade', { from, to, ms });
    const steps = Math.max(1, Math.round(ms / 20));
    return new Promise((resolve) => {
      let step = 0;
      const timer = window.setInterval(() => {
        if (token !== this.volumeToken) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        step += 1;
        const t = Math.min(1, step / steps);
        player.setVolume(from + (to - from) * t);
        if (t >= 1) {
          window.clearInterval(timer);
          this.trace('fade-end', {
            to,
            ms,
            elapsed: Number((performance.now() - started).toFixed(1)),
          });
          resolve();
        }
      }, Math.max(1, Math.round(ms / steps)));
    });
  }
}
