/**
 * Pronunciation provider: prefer Word Atlas MP3 under /wordbooks/audio,
 * fall back to browser speechSynthesis when no file exists.
 *
 * Finished audio files: Word Atlas contributors — CC BY 4.0
 * (ElevenLabs Alice UK / Sarah US). Browser TTS has no gain ramp.
 */
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

let active: {
  done: () => void;
  audio?: HTMLAudioElement;
} | null = null;

function quietCancelSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function audioCandidates(word: string): string[] {
  const key = normalizeWord(word);
  if (!key) return [];
  // Prefer US, then UK. Filenames match headword lower-case from the wordbook.
  return [
    `/wordbooks/audio/us/${encodeURIComponent(key)}.mp3`,
    `/wordbooks/audio/uk/${encodeURIComponent(key)}.mp3`,
  ];
}

function playUrl(url: string, opts: PronunciationOptions): Promise<'ok' | 'miss'> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'auto';
    let settled = false;

    const finish = (result: 'ok' | 'miss') => {
      if (settled) return;
      settled = true;
      opts.signal?.removeEventListener('abort', onAbort);
      audio.oncanplaythrough = null;
      audio.onended = null;
      audio.onerror = null;
      if (active?.audio === audio) active.audio = undefined;
      resolve(result);
    };

    const onAbort = () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      finish('ok');
      opts.onEnd?.();
    };

    if (opts.signal?.aborted) {
      finish('ok');
      opts.onEnd?.();
      return;
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    let started = false;
    const startPlayback = () => {
      if (settled || started) return;
      started = true;
      if (active) active.audio = audio;
      opts.onStart?.();
      void audio.play().catch(() => {
        // Decode/autoplay failure → try next candidate / TTS.
        finish('miss');
      });
    };

    audio.onerror = () => finish('miss');
    audio.onended = () => {
      finish('ok');
      opts.onEnd?.();
    };
    audio.onloadeddata = startPlayback;
    audio.oncanplaythrough = startPlayback;

    audio.src = url;
    audio.load();
  });
}

function speakTts(word: string, opts: PronunciationOptions): Promise<void> {
  if (!('speechSynthesis' in window)) {
    opts.onEnd?.();
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      opts.signal?.removeEventListener('abort', done);
      if (active?.done === done) active = null;
    };

    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      opts.onEnd?.();
      resolve();
    };

    active = { done };

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

    timer = window.setTimeout(done, 3000);
    window.speechSynthesis.speak(utterance);
  });
}

const provider: PronunciationProvider = {
  supportsGainRamp: false,

  cancel() {
    const current = active;
    active = null;
    if (current?.audio) {
      current.audio.pause();
      current.audio.removeAttribute('src');
      current.audio.load();
    }
    quietCancelSpeech();
    current?.done();
  },

  async speak(word, opts = {}) {
    provider.cancel();
    quietCancelSpeech();

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (active?.done === done) active = null;
    };
    active = { done };

    if (opts.signal?.aborted) {
      opts.onEnd?.();
      done();
      return;
    }

    for (const url of audioCandidates(word)) {
      const result = await playUrl(url, {
        ...opts,
        onEnd: () => {
          opts.onEnd?.();
          done();
        },
      });
      if (result === 'ok') {
        // onEnd already called on success path; if aborted mid-play, done too
        done();
        return;
      }
    }

    await speakTts(word, opts);
    done();
  },
};

export const browserTts = provider;
