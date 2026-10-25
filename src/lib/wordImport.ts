import { api } from '@/api';
import { parseLyric } from '@/lyrics/parse';
import {
  buildImportCards,
  type ImportPlayInfo,
  type ImportStats,
  type ImportedBookMeta,
} from '@/lib/importDeck';
import { saveImportedBook } from '@/lib/importStore';
import type { WordbookWord } from '@/lib/wordbook';
import type { LyricLine, Playlist, Song } from '@/types';

/**
 * Browser-side import pipeline:
 *   playlists -> tracks -> lyrics -> playability -> cards -> IndexedDB.
 *
 * Own playlists (created + liked) are read in full. Collected playlists are
 * read up to COLLECTED_LIMIT tracks each: a 5000-track chart would otherwise
 * dominate a one-time import, while its first pages already carry most of the
 * English words the user's library can sing.
 */

const PAGE = 200;
const COLLECTED_LIMIT = 300;
const MAX_TRACKS = 4000;
const LYRIC_CONCURRENCY = 6;
const PLAY_CONCURRENCY = 5;

export type ImportPhase = 'playlists' | 'tracks' | 'lyrics' | 'playback' | 'build' | 'done';

export interface ImportProgress {
  phase: ImportPhase;
  done: number;
  total: number;
}

export interface ImportWordbookInput {
  id: string;
  name: string;
  tagline: string;
  source: string;
  words: WordbookWord[];
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError');
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: size }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function collectTracks(
  playlists: Playlist[],
  onProgress: (progress: ImportProgress) => void,
  signal?: AbortSignal,
) {
  const songs: Song[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < playlists.length; index += 1) {
    abortIfNeeded(signal);
    const playlist = playlists[index];
    const target = playlist.own
      ? playlist.trackCount
      : Math.min(playlist.trackCount, COLLECTED_LIMIT);
    let offset = 0;
    while (offset < target && songs.length < MAX_TRACKS) {
      abortIfNeeded(signal);
      try {
        const page = await api.playlistTracks(playlist.id, offset, PAGE);
        if (!page.songs.length) break;
        const room = Math.max(0, target - offset);
        for (const song of page.songs.slice(0, room)) {
          if (seen.has(song.id)) continue;
          seen.add(song.id);
          songs.push(song);
          if (songs.length >= MAX_TRACKS) break;
        }
        if (page.songs.length < PAGE) break;
        offset += PAGE;
      } catch (error) {
        console.warn('[import] 歌单曲目读取失败', playlist.id, error);
        break;
      }
    }
    onProgress({ phase: 'tracks', done: index + 1, total: playlists.length });
  }
  return songs;
}

export async function importWordbook(input: ImportWordbookInput): Promise<ImportedBookMeta> {
  const started = Date.now();
  const progress = (next: ImportProgress) => input.onProgress?.(next);
  const signal = input.signal;

  progress({ phase: 'playlists', done: 0, total: 1 });
  let playlists: Playlist[] = [];
  let loggedIn = false;
  try {
    const result = await api.playlists();
    loggedIn = result.loggedIn;
    playlists = result.playlists;
  } catch (error) {
    console.warn('[import] 歌单读取失败，只导入词表', error);
  }
  abortIfNeeded(signal);
  progress({ phase: 'playlists', done: 1, total: 1 });

  const selected = playlists;
  const songs = loggedIn
    ? await collectTracks(selected, progress, signal)
    : ([] as Song[]);

  const lyrics = new Map<string, LyricLine[]>();
  let lyricDone = 0;
  let tracksWithLyrics = 0;
  if (songs.length) {
    progress({ phase: 'lyrics', done: 0, total: songs.length });
    await mapLimit(songs, LYRIC_CONCURRENCY, async (song) => {
      if (signal?.aborted) return;
      try {
        const payload = await api.lyric(song.id);
        const lines = parseLyric(payload);
        lyrics.set(song.id, lines);
        if (lines.length) tracksWithLyrics += 1;
      } catch (error) {
        lyrics.set(song.id, []);
        console.warn('[import] 歌词读取失败', song.id, error);
      } finally {
        lyricDone += 1;
        if (lyricDone % 5 === 0 || lyricDone === songs.length) {
          progress({ phase: 'lyrics', done: lyricDone, total: songs.length });
        }
      }
    });
  }
  abortIfNeeded(signal);

  const draft = buildImportCards({ words: input.words, songs, lyrics });
  const trackIds = [...new Set(draft.map((card) => card.fragment?.trackId).filter(Boolean))] as string[];
  const playInfo = new Map<string, ImportPlayInfo>();
  let playable = 0;
  if (trackIds.length) {
    let checked = 0;
    progress({ phase: 'playback', done: 0, total: trackIds.length });
    await mapLimit(trackIds, PLAY_CONCURRENCY, async (id) => {
      if (signal?.aborted) return;
      try {
        const info = await api.play(id);
        playInfo.set(id, {
          available: info.available,
          trial: info.trial ? { start: info.trial.start, end: info.trial.end } : null,
        });
        if (info.available) playable += 1;
      } catch (error) {
        playInfo.set(id, { available: false, trial: null });
        console.warn('[import] 可播检查失败', id, error);
      } finally {
        checked += 1;
        if (checked % 3 === 0 || checked === trackIds.length) {
          progress({ phase: 'playback', done: checked, total: trackIds.length });
        }
      }
    });
  }
  abortIfNeeded(signal);

  progress({ phase: 'build', done: 0, total: 1 });
  const cards = buildImportCards({ words: input.words, songs, lyrics, playInfo });
  const stats: ImportStats = {
    words: input.words.length,
    matchedWords: cards.length,
    plainWords: input.words.length - cards.length,
    tracksScanned: songs.length,
    tracksWithLyrics,
    tracksChecked: trackIds.length,
    tracksPlayable: playable,
    trackCount: new Set(cards.map((card) => card.track?.id).filter(Boolean)).size,
    playlists: selected.length,
    durationMs: Date.now() - started,
  };
  const meta: ImportedBookMeta = {
    id: input.id,
    name: input.name,
    tagline: input.tagline,
    count: input.words.length,
    source: input.source,
    importedAt: new Date().toISOString(),
    stats,
  };
  await saveImportedBook({ ...meta, words: input.words, cards });
  progress({ phase: 'done', done: 1, total: 1 });
  return meta;
}
