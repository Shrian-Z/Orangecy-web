import { Cloud, MessageCircle, Music2, Radio } from 'lucide-react';
import { api } from '@/api';

export type PlatformId = 'netease' | 'qq' | 'kugou' | 'bodian';

export interface PlatformAuth {
  loggedIn: boolean;
}

export interface PlatformQrKey {
  key: string;
  image: string;
}

export interface PlatformQrCheck {
  code: number;
  message?: string;
  loggedIn?: boolean;
}

export interface PlatformConfig {
  id: PlatformId;
  label: string;
  Icon: typeof Cloud;
  authStatus: () => Promise<PlatformAuth>;
  qrKey: () => Promise<PlatformQrKey>;
  qrCheck: (key: string) => Promise<PlatformQrCheck>;
  logout: () => Promise<unknown>;
}

/**
 * Four existing sound-source capabilities, exposed as connection targets.
 * All requests go through the repo's own api.ts; no Folia UI or service code is
 * involved. The platform labels are aria/title only — the page stays icon-only.
 */
export const PLATFORMS: PlatformConfig[] = [
  {
    id: 'netease',
    label: '网易云音乐',
    Icon: Cloud,
    authStatus: () => api.authStatus(),
    qrKey: async () => {
      const result = await api.qrKey();
      return { key: result.key, image: result.qrimg };
    },
    qrCheck: (key) => api.qrCheck(key),
    logout: () => api.logout(),
  },
  {
    id: 'qq',
    label: 'QQ 音乐',
    Icon: MessageCircle,
    authStatus: () => api.qq.authStatus(),
    qrKey: () => api.qq.qrKey(),
    qrCheck: (key) => api.qq.qrCheck(key),
    logout: () => api.qq.logout(),
  },
  {
    id: 'kugou',
    label: '酷狗音乐',
    Icon: Music2,
    authStatus: () => api.kugou.authStatus(),
    qrKey: () => api.kugou.qrKey(),
    qrCheck: (key) => api.kugou.qrCheck(key),
    logout: () => api.kugou.logout(),
  },
  {
    id: 'bodian',
    label: '波点音乐',
    Icon: Radio,
    authStatus: () => api.bodian.authStatus(),
    qrKey: () => api.bodian.qrKey(),
    qrCheck: (key) => api.bodian.qrCheck(key),
    logout: () => api.bodian.logout(),
  },
];

export const PLATFORM_BY_ID = new Map(PLATFORMS.map((platform) => [platform.id, platform]));

export function emptyConnections(): Record<PlatformId, boolean> {
  return { netease: false, qq: false, kugou: false, bodian: false };
}
