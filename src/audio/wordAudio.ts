/**
 * Word Atlas MP3 lookup. Files live at
 * `public/wordbooks/audio/{us,uk}/{key}.mp3` and are not committed.
 * Finished recordings are Word Atlas contributors, CC BY 4.0.
 */

export const WORD_AUDIO_ATTRIBUTION =
  'Word Atlas contributors — CC BY 4.0 (ElevenLabs Alice, UK; Sarah, US)';

export type WordAccent = 'us' | 'uk';

export interface AudioManifest {
  us: ReadonlySet<string>;
  uk: ReadonlySet<string>;
}

export type WordAudioResolution =
  | { kind: 'file'; accent: WordAccent; url: string; key: string }
  | { kind: 'tts'; key: string }
  | { kind: 'blocked'; key: string }
  | { kind: 'aborted'; key: string };

/**
 * Stem used on disk. Shipped CET headwords are already lowercase `[a-z-]`,
 * so they pass through unchanged. Other input is lowercased, whitespace
 * becomes a hyphen, and remaining punctuation is dropped.
 */
export function wordAudioKey(word: string): string {
  return word
    .normalize('NFKC')
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/[\u2010\u2011\u2013\u2014]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function wordAudioUrl(accent: WordAccent | 'ex', key: string, base = '/'): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}wordbooks/audio/${accent}/${encodeURIComponent(key)}.mp3`;
}

export function parseAudioManifest(raw: unknown): AudioManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as { us?: unknown; uk?: unknown; words?: unknown };
  const strings = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : null;
  const us = strings(record.us);
  const uk = strings(record.uk);
  const shared = strings(record.words);
  if (!us && !uk && !shared) return null;
  return {
    us: new Set(us ?? shared ?? []),
    uk: new Set(uk ?? shared ?? []),
  };
}

export type ProbeResult = 'ok' | 'miss' | 'blocked' | 'aborted';

/**
 * Prefer US, then UK. Every accent is requested; a miss (404, network, decode)
 * tries the next one. Abort stops the chain. `blocked` means the file was
 * fetched but playback was rejected (autoplay), which is not a missing file.
 */
export async function resolveWordAudio(
  word: string,
  options: {
    base?: string;
    isAborted?: () => boolean;
    probe: (url: string, accent: WordAccent) => Promise<ProbeResult>;
  },
): Promise<WordAudioResolution> {
  const key = wordAudioKey(word);
  const base = options.base ?? '/';
  const aborted = () => options.isAborted?.() ?? false;
  if (aborted()) return { kind: 'aborted', key };
  if (!key) return { kind: 'tts', key };

  let blocked = false;
  for (const accent of ['us', 'uk'] as const) {
    if (aborted()) return { kind: 'aborted', key };
    const url = wordAudioUrl(accent, key, base);
    const result = await options.probe(url, accent);
    if (result === 'aborted' || aborted()) return { kind: 'aborted', key };
    if (result === 'ok') return { kind: 'file', accent, url, key };
    if (result === 'blocked') blocked = true;
  }
  return blocked ? { kind: 'blocked', key } : { kind: 'tts', key };
}
