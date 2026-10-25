export interface Profile {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  vipType: number;
}

export interface AuthStatus {
  platform: string;
  platformLabel: string;
  loggedIn: boolean;
  profile: Profile | null;
}

export interface Song {
  id: string;
  platform: string;
  title: string;
  artists: string[];
  artistText: string;
  album: string;
  cover: string | null;
  durationMs: number;
  fee: number;
  meta?: {
    albumId?: string;
    mixSongId?: string;
  };
}

export interface Playlist {
  id: string;
  platform: string;
  name: string;
  cover: string | null;
  trackCount: number;
  liked: boolean;
  own: boolean;
}

export interface LyricPayload {
  lrc: string;
  tlyric: string;
  romalrc: string;
  yrc: string;
  klyric: string;
  wordLrc?: string;
}

export interface LyricWord {
  text: string;
  time: number;
  duration: number;
}

export interface LyricLine {
  key: string;
  time: number;
  text: string;
  translation?: string;
  words?: LyricWord[];
}

export interface PlayInfo {
  available: boolean;
  trial: { start: number; end: number } | null;
  fee: number;
  br: number;
  level: string | null;
  reason: string | null;
}

export interface SeekCheck {
  requested: number;
  actual: number;
  at: number;
  passed: boolean;
  playing: boolean;
}

export type DrawerKind = 'search' | 'queue' | 'login' | 'qq-login' | 'kugou-login' | 'bodian-login' | 'platforms' | 'check' | null;

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}
