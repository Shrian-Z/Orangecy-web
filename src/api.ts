import type { AuthStatus, LyricPayload, PlayInfo, Playlist, Profile, Song } from '@/types';

export interface Recommendation {
  song: Song;
  coverage: { word: string; time: number; lineText: string }[];
  score: number;
}

export interface CatalogStatus {
  status: 'idle' | 'building' | 'ready' | 'error';
  progress: number;
  total: number;
  current: string;
  error: string | null;
  builtAt: string | null;
  songs: number;
}

export interface RecommendResponse {
  status: 'building' | 'ready';
  catalog: CatalogStatus;
  songs: Recommendation[];
}

export interface QQAuthStatus {
  platform: 'qq';
  platformLabel: string;
  loggedIn: boolean;
  profile: Profile | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!response.ok) {
    const message =
      (data as { error?: string; message?: string } | null)?.error ??
      (data as { message?: string } | null)?.message ??
      `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return data as T;
}

export const api = {
  authStatus: () => request<AuthStatus>('/api/auth/status'),

  qrKey: () =>
    request<{ key: string; qrurl: string; qrimg: string }>('/api/auth/qr/key', {
      method: 'POST',
    }),

  qrCheck: (key: string) =>
    request<{
      code: number;
      message: string;
      loggedIn?: boolean;
      profile?: AuthStatus['profile'];
    }>(`/api/auth/qr/check?key=${encodeURIComponent(key)}`),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  search: (query: string) =>
    request<{ songs: Song[] }>(`/api/search?q=${encodeURIComponent(query)}&limit=24`),

  song: (id: string) => request<{ song: Song }>(`/api/song/${encodeURIComponent(id)}`),

  lyric: (id: string) =>
    request<LyricPayload>(`/api/song/${encodeURIComponent(id)}/lyric`),

  play: (id: string) =>
    request<PlayInfo>(`/api/song/${encodeURIComponent(id)}/play`),

  playlists: () =>
    request<{ platform: string; loggedIn: boolean; playlists: Playlist[] }>('/api/playlists'),

  playlistTracks: (id: string, offset = 0, limit = 100) =>
    request<{ songs: Song[]; offset: number; limit: number }>(
      `/api/playlist/${encodeURIComponent(id)}/tracks?offset=${offset}&limit=${limit}`,
    ),

  recommend: (words: string[], limit = 10) =>
    request<RecommendResponse>('/api/recommend', {
      method: 'POST',
      body: JSON.stringify({ words, limit }),
    }),

  qq: {
    authStatus: () => request<QQAuthStatus>('/api/qq/auth/status'),

    qrKey: () =>
      request<{ key: string; image: string }>('/api/qq/auth/qr/key', {
        method: 'POST',
      }),

    qrCheck: (key: string) =>
      request<{
        code: number;
        message: string;
        loggedIn?: boolean;
        profile?: QQAuthStatus['profile'];
      }>(`/api/qq/auth/qr/check?key=${encodeURIComponent(key)}`),

    logout: () => request<{ ok: boolean }>('/api/qq/auth/logout', { method: 'POST' }),

    search: (query: string) =>
      request<{ songs: Song[] }>(`/api/qq/search?q=${encodeURIComponent(query)}&limit=20`),

    lyric: (id: string) =>
      request<LyricPayload>(`/api/qq/song/${encodeURIComponent(id)}/lyric`),

    play: (id: string) => request<PlayInfo>(`/api/qq/song/${encodeURIComponent(id)}/play`),
  },

  bodian: {
    authStatus: () =>
      request<{ platform: 'bodian'; platformLabel: string; loggedIn: boolean; profile: Profile | null }>(
        '/api/bodian/auth/status',
      ),

    qrKey: () =>
      request<{ key: string; image: string }>('/api/bodian/auth/qr/key', { method: 'POST' }),

    qrCheck: (key: string) =>
      request<{
        code: number;
        message: string;
        loggedIn?: boolean;
        profile?: Profile | null;
      }>(`/api/bodian/auth/qr/check?key=${encodeURIComponent(key)}`),

    logout: () => request<{ ok: boolean }>('/api/bodian/auth/logout', { method: 'POST' }),

    search: (query: string) =>
      request<{ songs: Song[] }>(`/api/bodian/search?q=${encodeURIComponent(query)}&limit=30`),

    lyric: (song: Song) =>
      request<LyricPayload>(
        `/api/bodian/song/${encodeURIComponent(song.id)}/lyric?title=${encodeURIComponent(song.title)}&duration=${Math.round(song.durationMs / 1000)}`,
      ),

    play: (song: Song) =>
      request<PlayInfo>(`/api/bodian/song/${encodeURIComponent(song.id)}/play`),
  },

  kugou: {
    authStatus: () =>
      request<{ platform: 'kugou'; platformLabel: string; loggedIn: boolean; profile: Profile | null }>(
        '/api/kugou/auth/status',
      ),

    qrKey: () =>
      request<{ key: string; image: string }>('/api/kugou/auth/qr/key', { method: 'POST' }),

    qrCheck: (key: string) =>
      request<{
        code: number;
        message: string;
        loggedIn?: boolean;
        profile?: Profile | null;
      }>(`/api/kugou/auth/qr/check?key=${encodeURIComponent(key)}`),

    logout: () => request<{ ok: boolean }>('/api/kugou/auth/logout', { method: 'POST' }),

    search: (query: string) =>
      request<{ songs: Song[] }>(`/api/kugou/search?q=${encodeURIComponent(query)}&limit=30`),

    lyric: (song: Song) =>
      request<LyricPayload>(
        `/api/kugou/song/${encodeURIComponent(song.id)}/lyric?title=${encodeURIComponent(song.title)}&duration=${Math.round(song.durationMs / 1000)}`,
      ),

    play: (song: Song) => {
      const meta = song.meta ?? {};
      const params = new URLSearchParams({
        albumId: meta.albumId ?? '',
        mixSongId: meta.mixSongId ?? '',
      });
      return request<PlayInfo>(
        `/api/kugou/song/${encodeURIComponent(song.id)}/play?${params.toString()}`,
      );
    },
  },
};
