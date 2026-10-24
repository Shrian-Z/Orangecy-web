/**
 * Browser speech-synthesis pronunciation provider.
 *
 * Browser TTS output cannot be routed through a Web Audio gain node, so this
 * provider cannot do true volume ramps (`supportsGainRamp = false`). The focus
 * sequence therefore calls it as a hard-started, hard-stopped event: no fade in,
 * no fade out. `fadeIn` / `fadeOut` are accepted but ignored.
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
} | null = null;

function quietCancel() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

const provider: PronunciationProvider = {
  supportsGainRamp: false,

  cancel() {
    const current = active;
    active = null;
    quietCancel();
    current?.done();
  },

  speak(word, opts = {}) {
    if (!('speechSynthesis' in window)) {
      opts.onEnd?.();
      return Promise.resolve();
    }

    // 新发音开始前先收掉旧发音：与原 speak() 的 cancel-then-speak 一致。
    provider.cancel();
    quietCancel();

    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      let utterance: SpeechSynthesisUtterance | null = null;

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

      utterance = new SpeechSynthesisUtterance(word);
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

export const browserTts = provider;
