import { qqRequest } from '../qqSidecar.mjs';

const PLATFORM = 'qq';
const PLAY_CACHE_TTL = 2 * 60 * 1000;
const playCache = new Map();

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function coverFor(albumMid) {
  return albumMid
    ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${encodeURIComponent(albumMid)}.jpg`
    : null;
}

function normalizeSong(item) {
  const artists = (item.singer ?? []).map((singer) => cleanText(singer.name)).filter(Boolean);
  return {
    id: String(item.mid ?? item.id ?? ''),
    platform: PLATFORM,
    title: cleanText(item.name ?? item.title) || '未知曲目',
    artists,
    artistText: artists.join(' / ') || '未知歌手',
    album: cleanText(item.album?.name),
    cover: coverFor(item.album?.mid),
    durationMs: Number(item.interval ?? 0) * 1000,
    fee: Number(item.pay?.pay_play ?? 0),
  };
}

function tokenFromCookie(cookie) {
  for (const part of String(cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    if (part.slice(0, index).trim() === 'qqmusic_session') {
      return part.slice(index + 1).trim() || null;
    }
  }
  return null;
}

export const qq = {
  platform: PLATFORM,
  label: 'QQ音乐',

  async loginChannels() {
    const { data } = await qqRequest('/login/channels');
    return data?.data ?? null;
  },

  async qr(key, token) {
    const query = new URLSearchParams({ channel: 'qq' });
    if (key) query.set('key', key);
    const { data } = await qqRequest(`/login/qr/create?${query.toString()}`, { token });
    if (data?.code !== 200 && data?.code !== 0) {
      throw new Error(data?.message ?? 'QQ 二维码生成失败');
    }
    return { image: data?.data?.qrimg ?? '' };
  },

  async qrKey(token) {
    const { data } = await qqRequest('/login/qr/key', { token });
    const key = data?.data?.unikey;
    if (!key) throw new Error(data?.message ?? '没有拿到 QQ 二维码 key');
    return key;
  },

  async qrCheck(key, token) {
    const { data, setCookie } = await qqRequest(`/login/qr/check?key=${encodeURIComponent(key)}`, {
      token,
    });
    const code = Number(data?.code ?? 0);
    const message =
      data?.message ??
      ({ 800: '二维码已过期', 801: '等待扫码', 802: '已扫码，请在手机上确认', 803: '登录成功' }[code] ??
        '等待扫码');
    const nextToken =
      code === 803
        ? tokenFromCookie(data?.cookie) ?? tokenFromCookie(setCookie) ?? token ?? null
        : token ?? null;
    return { code, message, token: nextToken };
  },

  async logout(token) {
    if (!token) return;
    try {
      await qqRequest('/logout', { token });
    } catch {
      // 本地 token 照样清掉
    }
  },

  async loginStatus(token) {
    if (!token) return { loggedIn: false, profile: null };
    const { data } = await qqRequest('/login/status', { token });
    const profile = data?.data?.profile;
    if (!profile) return { loggedIn: false, profile: null };
    return {
      loggedIn: true,
      profile: {
        id: String(profile.uin ?? profile.qq ?? profile.userId ?? ''),
        nickname: cleanText(profile.nickname ?? profile.name ?? 'QQ音乐用户'),
        avatarUrl: profile.avatarUrl ?? profile.avatar ?? null,
        vipType: Number(profile.vipType ?? profile.vip ?? 0),
      },
    };
  },

  async search(keyword, token, limit = 20) {
    const query = new URLSearchParams({
      keyword,
      type: 'song',
      page: '1',
      limit: String(Math.min(20, Math.max(1, limit))),
    });
    const { data } = await qqRequest(`/search?${query.toString()}`, { token });
    if (data?.code !== 200) throw new Error(data?.message ?? 'QQ 音乐搜索失败');
    return (data.items ?? []).map(normalizeSong).filter((song) => song.id);
  },

  async lyric(id, token) {
    const { data } = await qqRequest(`/getLyric?songmid=${encodeURIComponent(id)}&format=1&trans=1`, {
      token,
    });
    const response = data?.response ?? {};
    const trans = response.trans;
    return {
      lrc: response.lyric ?? '',
      tlyric: typeof trans === 'string' ? trans : '',
      romalrc: '',
      yrc: '',
      klyric: '',
    };
  },

  async playInfo(id, token, { force = false } = {}) {
    const cacheKey = `${token ?? 'anon'}::${id}`;
    const hit = playCache.get(cacheKey);
    if (!force && hit && Date.now() - hit.at < PLAY_CACHE_TTL) return hit.info;

    const { data } = await qqRequest(`/getMusicPlay/${encodeURIComponent(id)}?quality=128`, { token });
    const item = Object.values(data?.data?.playUrl ?? {})[0] ?? {};
    const url = item?.url || '';
    const info = url
      ? { available: true, url, trial: null, fee: 0, reason: null }
      : {
          available: false,
          url: null,
          trial: null,
          fee: 0,
          reason:
            item?.error ??
            data?.data?.message ??
            'QQ 音乐没有给出播放地址：需要登录，或该曲目当前不可播',
        };
    playCache.set(cacheKey, { at: Date.now(), info });
    return info;
  },

  invalidatePlay(id, token) {
    playCache.delete(`${token ?? 'anon'}::${id}`);
  },
};
