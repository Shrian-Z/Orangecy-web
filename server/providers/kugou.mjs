import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

process.env.platform = process.env.platform || 'lite';
const require = createRequire(import.meta.url);
const kugouApi = require('kugoumusicapi');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DEVICE_FILE = path.join(DATA_DIR, 'kugou-device.json');
const PLATFORM = 'kugou';
const PLAY_CACHE_TTL = 2 * 60 * 1000;
const playCache = new Map();

function makeDevice() {
  const guid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  const mid = BigInt(`0x${crypto.createHash('md5').update(guid).digest('hex')}`).toString(10);
  return {
    KUGOU_API_PLATFORM: 'lite',
    KUGOU_API_GUID: guid,
    KUGOU_API_MID: mid,
    KUGOU_API_DEV: crypto.randomBytes(5).toString('hex').toUpperCase(),
    KUGOU_API_MAC: '02:00:00:00:00:00',
    KUGOU_API_WEBGL: BigInt(`0x${crypto.randomBytes(8).toString('hex')}`).toString(10),
  };
}

function loadDevice() {
  try {
    const saved = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'));
    if (saved?.cookies?.dfid) return saved.cookies;
  } catch {
    // 首次运行
  }
  return null;
}

function saveDevice(cookies) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DEVICE_FILE, JSON.stringify({ cookies, at: Date.now() }, null, 0), {
      mode: 0o600,
    });
  } catch {
    // 存不下就只保留内存态
  }
}

let cookies = loadDevice();
let registering = null;

function mergeResult(result) {
  const body = result?.body ?? result ?? {};
  for (const entry of Array.isArray(result?.cookie) ? result.cookie : []) {
    const index = String(entry).indexOf('=');
    if (index > 0) cookies[String(entry).slice(0, index)] = String(entry).slice(index + 1);
  }
  const data = body?.data ?? body;
  if (data?.dfid && String(data.dfid) !== 'undefined') cookies.dfid = String(data.dfid);
  if (data?.token) cookies.token = String(data.token);
  if (data?.userid || data?.user_id) cookies.userid = String(data.userid ?? data.user_id);
  return body;
}

function isVerificationError(error) {
  const body = error?.body ?? error;
  return (
    Number(body?.errcode ?? body?.error_code) === 20028 ||
    String(body?.error ?? body?.msg ?? '').includes('需要验证')
  );
}

async function ensureSession(force = false) {
  if (registering) return registering;
  if (!force && cookies?.dfid) return cookies;

  registering = (async () => {
    if (!cookies) cookies = makeDevice();
    delete cookies.dfid;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        const result = await kugouApi.register_dev({ cookie: { ...cookies } });
        mergeResult(result);
        if (cookies.dfid) {
          saveDevice(cookies);
          return cookies;
        }
      } catch {
        // 换一个设备/重试
      }
      if (attempt >= 3) cookies = { ...makeDevice() };
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    throw new Error('酷狗设备注册失败，稍后再试');
  })().finally(() => {
    registering = null;
  });

  return registering;
}

function baseCookies() {
  if (!cookies) cookies = makeDevice();
  return cookies;
}

function mergeUser(base, userCookie) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(userCookie ?? {})) {
    if (value) merged[key] = String(value);
  }
  return merged;
}

async function invoke(fn, userCookie) {
  let session = mergeUser(await ensureSession(), userCookie);
  try {
    return mergeResult(await fn({ ...session }));
  } catch (error) {
    if (!isVerificationError(error)) throw error;
    session = mergeUser(await ensureSession(true), userCookie);
    return mergeResult(await fn({ ...session }));
  }
}

function krcClock(ms) {
  const total = Math.max(0, Number(ms) || 0);
  const minutes = Math.floor(total / 60000);
  const seconds = (total % 60000) / 1000;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}

function fromKrc(content) {
  const lines = [];
  const wordLines = [];
  for (const raw of String(content ?? '').split(/\r?\n/)) {
    const match = raw.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!match) continue;
    const start = Number(match[1]);
    const body = match[3] ?? '';
    const text = body.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    lines.push(`[${krcClock(start)}]${text}`);
    if (/<\d+,\d+,\d+>/.test(body)) {
      const words = body.replace(/<(\d+),(\d+),\d+>/g, (_tag, offset) => {
        return `<${krcClock(start + Number(offset))}>`;
      });
      wordLines.push(`[${krcClock(start)}]${words}`);
    }
  }
  return { lrc: lines.join('\n'), wordLrc: wordLines.join('\n') };
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function coverOf(item) {
  const raw = item.Image || item.AlbumImage || '';
  return raw ? String(raw).replace('{size}', '300').replace(/^http:\/\//, 'https://') : null;
}

function normalize(item) {
  const title =
    cleanText(item.SongName ?? item.OriSongName ?? item.FileName).split(' - ').slice(-1)[0] ||
    '未知曲目';
  const artists = String(item.SingerName ?? '')
    .split(/、|&|,/)
    .map((name) => cleanText(name))
    .filter(Boolean);
  return {
    id: String(item.FileHash ?? '').toUpperCase(),
    platform: PLATFORM,
    title,
    artists,
    artistText: artists.join(' / ') || '未知歌手',
    album: cleanText(item.AlbumName),
    cover: coverOf(item),
    durationMs: Number(item.Duration ?? 0) * 1000,
    fee: Number(item.PayType ?? 0) === 0 ? 0 : 1,
    meta: {
      albumId: String(item.AlbumID ?? ''),
      mixSongId: String(item.MixSongID ?? ''),
    },
  };
}

export const kugou = {
  platform: PLATFORM,
  label: '酷狗音乐',

  async search(keyword, limit = 20, userCookie = {}) {
    const body = await invoke(
      (cookie) =>
        kugouApi.search({
          keywords: keyword,
          page: 1,
          limit: Math.min(30, Math.max(1, limit)),
          cookie,
        }),
      userCookie,
    );
    const items = body?.data?.lists ?? [];
    return items.map(normalize).filter((song) => song.id);
  },

  async lyric(song, userCookie = {}) {
    const body = await invoke(
      (cookie) =>
        kugouApi.search_lyric({
          hash: song.id,
          duration: Math.round((song.durationMs ?? 0) / 1000),
          keywords: song.title ?? '',
          cookie,
        }),
      userCookie,
    );
    const candidate = body?.candidates?.[0] ?? body?.data?.candidates?.[0];
    if (!candidate) return { lrc: '', tlyric: '', romalrc: '', yrc: '', klyric: '' };
    let lyricBody = null;
    try {
      lyricBody = await invoke(
        (cookie) =>
          kugouApi.lyric({
            id: candidate.id,
            accesskey: candidate.accesskey,
            cookie,
            fmt: 'krc',
            decode: true,
          }),
        userCookie,
      );
    } catch {
      // 下面会退回普通 LRC
    }

    const decoded = String(lyricBody?.decodeContent ?? '');
    if (decoded) {
      const parsed = fromKrc(decoded);
      if (parsed.lrc) {
        return {
          lrc: parsed.lrc,
          wordLrc: parsed.wordLrc || undefined,
          tlyric: '',
          romalrc: '',
          yrc: '',
          klyric: '',
        };
      }
    }

    const fallback = await invoke(
      (cookie) =>
        kugouApi.lyric({
          id: candidate.id,
          accesskey: candidate.accesskey,
          cookie,
          fmt: 'lrc',
          decode: true,
        }),
      userCookie,
    );
    return {
      lrc: fallback?.decodeContent ?? '',
      tlyric: '',
      romalrc: '',
      yrc: '',
      klyric: '',
    };
  },

  async qrKey() {
    const device = baseCookies();
    const body = mergeResult(await kugouApi.login_qr_key({ cookie: { ...device } }));
    const key = body?.data?.qrcode;
    const image = body?.data?.qrcode_img;
    if (!key || !image) throw new Error('没有拿到酷狗二维码');
    return { key, image };
  },

  async qrCheck(key, userCookie = {}) {
    const device = mergeUser(baseCookies(), userCookie);
    const result = await kugouApi.login_qr_check({
      key,
      qrcode: key,
      cookie: { ...device },
    });
    const body = result?.body ?? result ?? {};
    const data = body?.data ?? {};
    const status = Number(data.status ?? 1);
    const code = status === 4 ? 803 : status === 2 ? 802 : status === 0 ? 800 : 801;
    const token = data.token ? String(data.token) : null;
    const userId = data.userid ?? data.user_id;
    return {
      code,
      message:
        code === 803
          ? '登录成功'
          : code === 802
            ? '已扫码，请在手机上确认'
            : code === 800
              ? '二维码已过期'
              : '等待扫码',
      token,
      userId: userId ? String(userId) : null,
    };
  },

  async loginStatus(userCookie = {}) {
    if (!userCookie.token) return { loggedIn: false, profile: null };
    const device = mergeUser(baseCookies(), userCookie);
    const result = await kugouApi.user_detail({ cookie: { ...device } });
    const body = result?.body ?? result;
    const profile = body?.data ?? body;
    if (!profile || (!profile.nickname && !profile.nick_name && !profile.username)) {
      return { loggedIn: false, profile: null };
    }
    return {
      loggedIn: true,
      profile: {
        id: String(profile.userid ?? profile.user_id ?? userCookie.userid ?? ''),
        nickname: String(profile.nickname ?? profile.nick_name ?? profile.username ?? '酷狗用户'),
        avatarUrl: profile.pic ?? profile.avatar ?? profile.user_pic ?? null,
        vipType: Number(profile.vip_type ?? profile.vipType ?? 0),
      },
    };
  },

  async playInfo(song, { force = false, userCookie = {} } = {}) {
    const meta = song.meta ?? {};
    const cacheKey = `${song.id}::${meta.albumId ?? ''}::${meta.mixSongId ?? ''}`;
    const hit = playCache.get(cacheKey);
    if (!force && hit && Date.now() - hit.at < PLAY_CACHE_TTL) return hit.info;

    let result = null;
    try {
      result = await invoke(
        (cookie) =>
          kugouApi.song_url({
            hash: song.id,
            album_id: meta.albumId ?? '',
            album_audio_id: meta.mixSongId ?? '',
            quality: 128,
            cookie,
          }),
        userCookie,
      );
    } catch (error) {
      result = error?.body ?? null;
      if (!result) throw error;
    }

    const raw = result?.url ?? result?.play_url;
    const url = Array.isArray(raw) ? raw[0] : raw;
    const info = url
      ? { available: true, url, trial: null, fee: 0, reason: null }
      : {
          available: false,
          url: null,
          trial: null,
          fee: 0,
          reason: result?.error ?? result?.msg ?? '酷狗没有给出播放地址，可能需要在酷狗登录或该曲目受限',
        };
    playCache.set(cacheKey, { at: Date.now(), info });
    return info;
  },

  invalidatePlay(song) {
    const meta = song?.meta ?? {};
    playCache.delete(`${song?.id}::${meta.albumId ?? ''}::${meta.mixSongId ?? ''}`);
  },
};
