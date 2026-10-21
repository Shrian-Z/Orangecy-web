import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ncm = require('@neteasecloudmusicapienhanced/api');

const PLATFORM = 'netease';
const PLAY_CACHE_TTL = 3 * 60 * 1000;

/** @type {Map<string, {at:number, info:any}>} */
const playCache = new Map();

function bodyOf(result) {
  return result?.body ?? {};
}

function wordClock(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(total / 60000);
  const seconds = (total % 60000) / 1000;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

function yrcToWordLrc(raw) {
  if (!raw || !raw.includes('](')) return '';
  const lines = [];
  for (const row of String(raw).split(/\r?\n/)) {
    const head = row.match(/^\[(\d+),(\d+)\]/);
    if (!head) continue;
    const lineStart = Number(head[1]);
    const body = row.slice(head[0].length);
    const words = [...body.matchAll(/\((\d+),(\d+),\d+\)([^()]*)/g)];
    if (words.length < 2) continue;
    let text = '';
    let wordText = '';
    for (const word of words) {
      const token = word[3] ?? '';
      if (!token.trim()) continue;
      text += token;
      wordText += `<${wordClock(Number(word[1]))}>${token}`;
    }
    if (!text) continue;
    lines.push(`[${wordClock(lineStart)}]${wordText}`);
  }
  return lines.join('\n');
}

function normalizeDetail(song) {
  if (!song) return null;
  const artists = (song.ar ?? song.artists ?? []).map((a) => a?.name).filter(Boolean);
  return {
    id: String(song.id),
    platform: PLATFORM,
    title: song.name ?? song.title ?? '未知曲目',
    artists,
    artistText: artists.join(' / ') || '未知歌手',
    album: song.al?.name ?? song.album?.name ?? '',
    cover: song.al?.picUrl ?? song.album?.picUrl ?? null,
    durationMs: Number(song.dt ?? song.duration ?? 0) || 0,
    fee: Number(song.fee ?? 0),
  };
}

function normalizeSearchSong(song) {
  const artists = (song.artists ?? song.ar ?? []).map((a) => a?.name).filter(Boolean);
  return {
    id: String(song.id),
    platform: PLATFORM,
    title: song.name ?? '未知曲目',
    artists,
    artistText: artists.join(' / ') || '未知歌手',
    album: song.album?.name ?? song.al?.name ?? '',
    cover: song.album?.picUrl ?? song.al?.picUrl ?? null,
    durationMs: Number(song.duration ?? song.dt ?? 0) || 0,
    fee: Number(song.fee ?? 0),
  };
}

function mergeCookie(existing, incoming) {
  const jar = new Map();
  for (const chunk of `${existing ?? ''};${[].concat(incoming ?? []).join(';')}`.split(';')) {
    const idx = chunk.indexOf('=');
    if (idx <= 0) continue;
    const key = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    if (key && value) jar.set(key, value);
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export const netease = {
  platform: PLATFORM,
  label: '网易云音乐',

  async loginStatus(cookie) {
    const body = bodyOf(await ncm.login_status({ cookie: cookie || '' }));
    const profile = body?.data?.profile ?? null;
    return {
      loggedIn: Boolean(profile),
      profile: profile
        ? {
            id: String(profile.userId ?? profile.id ?? ''),
            nickname: profile.nickname ?? '网易云用户',
            avatarUrl: profile.avatarUrl ?? null,
            vipType: Number(profile.vipType ?? 0),
          }
        : null,
    };
  },

  async qrKey(cookie) {
    const body = bodyOf(await ncm.login_qr_key({ cookie: cookie || '' }));
    const key = body?.data?.unikey;
    if (!key) throw new Error('没有拿到二维码 key');
    return key;
  },

  async qrImage(key) {
    const body = bodyOf(await ncm.login_qr_create({ key, qrimg: true }));
    return {
      qrurl: body?.data?.qrurl ?? '',
      qrimg: body?.data?.qrimg ?? '',
    };
  },

  async qrCheck(key, cookie) {
    const body = bodyOf(await ncm.login_qr_check({ key, cookie: cookie || '' }));
    const code = Number(body?.code ?? 0);
    const message =
      body?.message ??
      ({ 800: '二维码已过期', 801: '等待扫码', 802: '已扫码，请在手机上确认', 803: '登录成功' }[code] ??
        '等待扫码');
    let merged = cookie || '';
    if (code === 803) {
      merged = mergeCookie(cookie, body?.cookie);
    }
    return { code, message, cookie: merged };
  },

  async search(keywords, cookie, limit = 24) {
    const body = bodyOf(
      await ncm.search({ keywords, cookie: cookie || '', limit, offset: 0, type: 1 }),
    );
    const raw = body?.result?.songs ?? [];
    if (!raw.length) return [];

    let detailById = new Map();
    try {
      const ids = raw.map((s) => s.id).join(',');
      const detailBody = bodyOf(await ncm.song_detail({ ids, cookie: cookie || '' }));
      detailById = new Map((detailBody?.songs ?? []).map((s) => [String(s.id), s]));
    } catch {
      // 搜索接口本身已带封面临时字段，详情失败不影响结果
    }

    return raw.map((song) => {
      const base = normalizeSearchSong(song);
      const detail = detailById.get(base.id);
      return detail ? { ...base, ...normalizeDetail(detail), fee: base.fee } : base;
    });
  },

  async song(id, cookie) {
    const body = bodyOf(await ncm.song_detail({ ids: String(id), cookie: cookie || '' }));
    const song = body?.songs?.[0];
    if (!song) throw new Error('没有找到这首歌');
    return normalizeDetail(song);
  },

  async lyric(id, cookie) {
    const [oldResult, newResult] = await Promise.allSettled([
      ncm.lyric({ id, cookie: cookie || '' }),
      ncm.lyric_new({ id, cookie: cookie || '' }),
    ]);
    const body = oldResult.status === 'fulfilled' ? bodyOf(oldResult.value) : {};
    const fresh = newResult.status === 'fulfilled' ? bodyOf(newResult.value) : {};
    return {
      lrc: body?.lrc?.lyric ?? '',
      wordLrc: yrcToWordLrc(fresh?.yrc?.lyric ?? ''),
      tlyric: body?.tlyric?.lyric ?? '',
      romalrc: body?.romalrc?.lyric ?? '',
      yrc: fresh?.yrc?.lyric ?? '',
      klyric: body?.klyric?.lyric ?? '',
    };
  },

  async playInfo(id, cookie, { force = false } = {}) {
    const cacheKey = `${cookie || 'anon'}::${id}`;
    const hit = playCache.get(cacheKey);
    if (!force && hit && Date.now() - hit.at < PLAY_CACHE_TTL) return hit.info;

    let data = {};
    try {
      const body = bodyOf(await ncm.song_url_v1({ id, level: 'standard', cookie: cookie || '' }));
      data = body?.data?.[0] ?? {};
    } catch {
      data = {};
    }

    let url = data?.url ?? null;
    if (!url) {
      try {
        const body = bodyOf(await ncm.song_url({ id, br: 320000, cookie: cookie || '' }));
        const fallback = body?.data?.[0] ?? {};
        url = fallback?.url ?? null;
        if (url) data = { ...data, ...fallback, freeTrialInfo: data.freeTrialInfo };
      } catch {
        // 保持 url = null
      }
    }

    const trial = data?.freeTrialInfo
      ? {
          start: Number(data.freeTrialInfo.start ?? 0),
          end: Number(data.freeTrialInfo.end ?? 30),
        }
      : null;

    const info = {
      available: Boolean(url),
      url: url || null,
      trial,
      fee: Number(data?.fee ?? 0),
      br: Number(data?.br ?? 0),
      size: Number(data?.size ?? 0),
      level: data?.level ?? null,
      reason: url
        ? null
        : Number(data?.fee ?? 0) === 1
          ? '需要网易云会员，或这首暂不可播'
          : '这首暂时拿不到播放地址',
    };
    playCache.set(cacheKey, { at: Date.now(), info });
    return info;
  },

  invalidatePlay(id, cookie) {
    playCache.delete(`${cookie || 'anon'}::${id}`);
  },
};

export { mergeCookie };
