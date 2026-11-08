/**
 * Pronunciation provider.
 *
 * `pronunciation.speak` is the only path the focus sequence uses, for both
 * the automatic pronounce step and a manual word tap. It plays
 * `/wordbooks/audio/us/{key}.mp3`, then `uk/` when that request 404s or
 * errors, and only then falls back to `browserTts`.
 *
 * HTML audio and browser TTS are hard-started and hard-stopped: fadeIn /
 * fadeOut are accepted and ignored, and supportsGainRamp stays false.
 * `cancel` pauses the MP3 and aborts an in-flight fetch.
 * Finished MP3s are Word Atlas contributors, CC BY 4.0.
 */
import {
  resolveWordAudio,
  wordAudioKey,
  wordAudioUrl,
  type ProbeResult,
  type WordAccent,
} from './wordAudio.ts';

export interface PronunciationOptions {
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  fadeIn?: number;
  fadeOut?: number;
}

export interface PronunciationProvider {
  speak(word: string, opts?: PronunciationOptions): Promise<void>;
  cancel(): void;
  supportsGainRamp: boolean;
}

type Source = WordAccent | 'tts';

let ttsJob: { done: () => void } | null = null;
let fileJob: { done: () => void } | null = null;
let currentAudio: HTMLAudioElement | null = null;
let inflight: AbortController | null = null;
let lastSource: Source | null = null;
const clipCache = new Map<string, WordAccent>();

const FETCH_MS = 4000;
const CLIP_MAX_MS = 15000;

function assetBase() {
  const base = import.meta.env?.BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base : '/';
}

function isAbort(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'AbortError'
  );
}

function release(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.src = '';
  try {
    audio.load();
  } catch {
    // The element is already detached from the network.
  }
}

function quietCancel() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

const browserProvider: PronunciationProvider = {
  supportsGainRamp: false,

  cancel() {
    const current = ttsJob;
    ttsJob = null;
    quietCancel();
    current?.done();
  },

  speak(word, opts = {}) {
    if (!('speechSynthesis' in window)) {
      opts.onEnd?.();
      return Promise.resolve();
    }

    // 新发音开始前先收掉旧发音：与原 speak() 的 cancel-then-speak 一致。
    browserProvider.cancel();
    quietCancel();

    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;

      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        opts.signal?.removeEventListener('abort', done);
        if (ttsJob?.done === done) ttsJob = null;
      };

      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        opts.onEnd?.();
        resolve();
      };

      ttsJob = { done };

      if (opts.signal?.aborted) {
        done();
        return;
      }
      opts.signal?.addEventListener('abort', done, { once: true });

      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.86;
      utterance.onstart = () => opts.onStart?.();
      utterance.onend = done;
      utterance.onerror = done;

      // Chrome 的 speechSynthesis 偶尔不回调 onend，3 秒后强制收口。
      timer = window.setTimeout(done, 3000);
      window.speechSynthesis.speak(utterance);
    });
  },
};

export const browserTts = browserProvider;

function fetchSignal(parent: AbortSignal) {
  const Timeout = AbortSignal as typeof AbortSignal & {
    timeout?: (ms: number) => AbortSignal;
    any?: (signals: AbortSignal[]) => AbortSignal;
  };
  if (typeof Timeout.timeout === 'function' && typeof Timeout.any === 'function') {
    return Timeout.any([parent, Timeout.timeout(FETCH_MS)]);
  }
  return parent;
}

async function playClip(
  url: string,
  accent: WordAccent,
  hooks: {
    signal: AbortSignal;
    onStart?: () => void;
    hold: (audio: HTMLAudioElement | null) => void;
  },
): Promise<ProbeResult> {
  if (hooks.signal.aborted) return 'aborted';
  if (typeof Audio !== 'function' || typeof fetch !== 'function') return 'miss';

  let response: Response;
  try {
    response = await fetch(url, { signal: fetchSignal(hooks.signal) });
  } catch (error) {
    if (hooks.signal.aborted || isAbort(error)) return 'aborted';
    return 'miss';
  }
  if (hooks.signal.aborted) return 'aborted';
  if (!response.ok) return 'miss';

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (error) {
    if (hooks.signal.aborted || isAbort(error)) return 'aborted';
    return 'miss';
  }
  if (hooks.signal.aborted || blob.size === 0) return hooks.signal.aborted ? 'aborted' : 'miss';

  const objectUrl = URL.createObjectURL(blob);
  try {
    return await playObjectUrl(objectUrl, accent, hooks);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function playObjectUrl(
  objectUrl: string,
  accent: WordAccent,
  hooks: {
    signal: AbortSignal;
    onStart?: () => void;
    hold: (audio: HTMLAudioElement | null) => void;
  },
): Promise<ProbeResult> {
  if (hooks.signal.aborted) return Promise.resolve('aborted');
  return new Promise((resolve) => {
    const audio = new Audio();
    hooks.hold(audio);
    let settled = false;
    let started = false;
    let endTimer = 0;
    let startTimer = 0;

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimer);
      if (endTimer) window.clearTimeout(endTimer);
      hooks.signal.removeEventListener('abort', onAbort);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
      if (result !== 'ok') audio.pause();
      audio.src = '';
      try {
        audio.load();
      } catch {
        // Ignore a second load on an element that never started.
      }
      hooks.hold(null);
      resolve(result);
    };

    const onAbort = () => finish('aborted');
    const onError = () => finish('miss');
    const onEnded = () => finish('ok');
    const markStarted = () => {
      if (settled || started) return;
      started = true;
      window.clearTimeout(startTimer);
      lastSource = accent;
      hooks.onStart?.();
      endTimer = window.setTimeout(() => {
        audio.pause();
        finish('ok');
      }, CLIP_MAX_MS);
    };

    hooks.signal.addEventListener('abort', onAbort);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('playing', markStarted);
    startTimer = window.setTimeout(() => {
      if (!started) finish('miss');
    }, FETCH_MS);

    audio.preload = 'auto';
    audio.volume = 1;
    audio.src = objectUrl;
    void audio.play().then(markStarted).catch((error: unknown) => {
      const name =
        typeof error === 'object' && error !== null && 'name' in error
          ? String((error as { name: string }).name)
          : '';
      if (hooks.signal.aborted || name === 'AbortError') finish('aborted');
      else if (name === 'NotAllowedError') finish('blocked');
      else finish('miss');
    });
  });
}

export function pronunciationSource(): Source | null {
  return lastSource;
}

export const pronunciation: PronunciationProvider = {
  supportsGainRamp: false,

  cancel() {
    inflight?.abort();
    inflight = null;
    const audio = currentAudio;
    currentAudio = null;
    release(audio);
    browserTts.cancel();
    const current = fileJob;
    fileJob = null;
    current?.done();
  },

  speak(word, opts = {}) {
    pronunciation.cancel();
    const controller = new AbortController();
    inflight = controller;
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    return new Promise((resolve) => {
      let settled = false;
      let announced = false;
      const base = assetBase();
      const key = wordAudioKey(word);

      const finish = () => {
        if (settled) return;
        settled = true;
        opts.signal?.removeEventListener('abort', onAbort);
        if (inflight === controller) inflight = null;
        if (fileJob?.done === finish) fileJob = null;
        opts.onEnd?.();
        resolve();
      };

      const onAbort = () => {
        controller.abort();
        const audio = currentAudio;
        currentAudio = null;
        release(audio);
        browserTts.cancel();
        finish();
      };

      const announce = () => {
        if (announced || settled) return;
        announced = true;
        opts.onStart?.();
      };

      const hold = (audio: HTMLAudioElement | null) => {
        if (audio) currentAudio = audio;
        else if (currentAudio) currentAudio = null;
      };

      fileJob = { done: finish };

      if (controller.signal.aborted) {
        finish();
        return;
      }
      opts.signal?.addEventListener('abort', onAbort);

      const speakTts = async () => {
        lastSource = 'tts';
        await browserTts.speak(word, {
          signal: opts.signal,
          onStart: announce,
          onEnd: () => {},
        });
        if (!settled) finish();
      };

      const attempt = (url: string, accent: WordAccent) => {
        if (settled || controller.signal.aborted) return Promise.resolve('aborted' as const);
        return playClip(url, accent, { signal: controller.signal, onStart: announce, hold });
      };

      void (async () => {
        const cached = key ? clipCache.get(key) : undefined;
        if (cached) {
          const cachedResult = await attempt(wordAudioUrl(cached, key, base), cached);
          if (settled) return;
          if (cachedResult === 'ok') {
            finish();
            return;
          }
          if (cachedResult === 'aborted') {
            finish();
            return;
          }
          clipCache.delete(key);
        }

        if (settled) return;
        const outcome = await resolveWordAudio(word, {
          base,
          isAborted: () => settled || controller.signal.aborted,
          probe: attempt,
        });

        if (settled || outcome.kind === 'aborted') {
          if (!settled) finish();
          return;
        }
        if (outcome.kind === 'file') {
          if (outcome.key) clipCache.set(outcome.key, outcome.accent);
          finish();
          return;
        }
        await speakTts();
      })();
    });
  },
};
