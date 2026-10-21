import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DEVICE_FILE = path.join(DATA_DIR, 'bodian-device.json');
const API_ORIGIN = 'https://bd-api.kuwo.cn';
const LYRIC_ORIGIN = 'https://mlyric.kuwo.cn';
const PLATFORM = 'bodian';
const PLAY_CACHE_TTL = 2 * 60 * 1000;
const playCache = new Map();

const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

function loadDevice() {
  try {
    const saved = JSON.parse(fs.readFileSync(DEVICE_FILE, 'utf8'));
    if (/^[a-f0-9]{32}$/.test(saved?.deviceId ?? '')) return saved.deviceId;
  } catch {
    // 首次运行
  }
  const deviceId = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DEVICE_FILE, JSON.stringify({ deviceId, at: Date.now() }), { mode: 0o600 });
  } catch {
    // 存不下就保留本次运行
  }
  return deviceId;
}

const deviceId = loadDevice();

function signature(pathname, query, body) {
  const encoded = new URLSearchParams(query).toString();
  let material = `kuwotest${[...encoded].filter((char) => /[a-z0-9]/i.test(char)).sort().join('')}`;
  if (body) material += md5(`${body}kuwotest`);
  return md5(`${material}${pathname}`);
}

function headersFor(uid, token) {
  const headers = {
    'User-Agent': 'Dart/3.3 (dart:io)',
    plat: 'win',
    channel: 'W1',
    ver: '1.1.7',
    svrver: '13',
    'api-ver': 'application/json',
    brand: 'Windows',
    net: 'wifi',
    devid: deviceId,
    qimei36: deviceId,
    'Content-Type': 'application/json',
    'Accept-Encoding': 'identity',
  };
  if (uid && uid !== '-1') {
    headers.uid = String(uid);
    headers.token = String(token ?? '');
  }
  return headers;
}

function requestJson(url, { method = 'GET', body = '', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = https.request(
      target,
      {
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
        },
        timeout: 15000,
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) {
            request.destroy();
            reject(new Error('波点响应过大'));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`波点 HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            reject(new Error('波点返回了无法解析的响应'));
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error('波点请求超时')));
    request.on('error', (error) => reject(error));
    request.end(body || undefined);
  });
}

async function call(pathname, { query = {}, body, signed = false, anonymous = false, lyric = false, user = {} } = {}) {
  const session = anonymous ? {} : user;
  const params = { ...query, uid: String(session.uid || '-1'), token: session.token || '' };
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  if (signed) {
    params.timestamp = String(Date.now());
    params.sign = signature(pathname, params, bodyText);
  }
  const target = new URL(pathname, lyric ? LYRIC_ORIGIN : API_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }
  const response = await requestJson(target, {
    body: bodyText,
    headers: headersFor(session.uid, session.token),
  });
  if (Number(response?.code) !== 200) {
    const code = Number(response?.code);
    const message =
      code === 407
        ? response?.msg || '由于版权保护，该资源仅限中国大陆地区使用'
        : code === 11012
          ? '波点需要登录'
          : code === 20018
            ? '波点没有解锁这首歌'
            : response?.msg || `波点拒绝了请求（${code || 'unknown'}）`;
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  return response;
}

function text(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '').trim();
}

function normalize(item) {
  const artists = Array.isArray(item.artists)
    ? item.artists.map((artist) => text(artist.name)).filter(Boolean)
    : [text(item.artist)].filter(Boolean);
  const id = String(item.id ?? '');
  return {
    id,
    platform: PLATFORM,
    title: text(item.name) || '未知曲目',
    artists,
    artistText: artists.join(' / ') || '未知歌手',
    album: text(item.album),
    cover: String(item.albumPic120 || item.albumPic || '').replace(/^http:\/\//, 'https://') || null,
    durationMs: Number(item.duration ?? 0) * 1000,
    fee: Number(item.payInfo?.cannotOnlinePlay ?? 0) ? 1 : 0,
  };
}

function decodeWordTimings(raw) {
  if (!raw.includes('<')) return '';
  const factorMatch = raw.match(/\[kuwo:([0-7]+)/);
  const factors = factorMatch ? parseInt(factorMatch[1], 8) : 11;
  const startFactor = Math.trunc(factors / 10) || 1;
  const durationFactor = factors % 10 || 1;
  const clock = (seconds) => {
    const safe = Math.max(0, seconds);
    const minutes = Math.floor(safe / 60);
    const rest = safe - minutes * 60;
    return `${String(minutes).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
  };
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const timeMatch = line.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/);
      if (!timeMatch) return line;
      const fraction = timeMatch[3] ? Number(timeMatch[3].padEnd(3, '0').slice(0, 3)) : 0;
      const base = Number(timeMatch[1]) * 60 + Number(timeMatch[2]) + fraction / 1000;
      return line.replace(/<(-?\d+),(-?\d+)>/g, (_match, left, right) => {
        const a = Number(left);
        const b = Number(right);
        const start = Math.trunc(Math.abs((a + b) / (2 * startFactor)));
        return `<${clock(base + start / 1000)}>`;
      });
    })
    .join('\n');
}

function lyricText(raw) {
  return String(raw ?? '')
    .replace(/\[kuwo:[^\]]*\]/g, '')
    .replace(/<-?\d+,-?\d+>/g, '');
}

function isPlayableRight(data) {
  return Number(data?.status) !== 3 && Number(data?.status) !== 7 && data?.status !== undefined;
}

export const bodian = {
  platform: PLATFORM,
  label: '波点音乐',

  async search(keyword, limit = 20, user = {}) {
    const response = await call('/api/search/music/list', {
      query: {
        keyword,
        correct: 1,
        pn: 0,
        rn: Math.min(30, Math.max(1, limit)),
      },
      user,
    });
    return (response.data?.resultList ?? []).map(normalize).filter((song) => song.id);
  },

  async lyric(song, user = {}) {
    const raw = `type=lyric&req=2&lrcx=1&rid=${song.id}&songname=&artist=&corp=kuwo&fromchannel=bodian`;
    const response = await call('/mobi.s', {
      lyric: true,
      query: { f: 'bodian', q: Buffer.from(raw).toString('base64') },
      user,
    });
    const content = response.data?.content;
    if (!content) return { lrc: '', tlyric: '', romalrc: '', yrc: '', klyric: '' };
    const decoded = Buffer.from(content, 'base64').toString('utf8');
    return {
      lrc: lyricText(decoded),
      wordLrc: decodeWordTimings(decoded),
      tlyric: '',
      romalrc: '',
      yrc: '',
      klyric: '',
    };
  },

  async playInfo(song, { force = false, user = {} } = {}) {
    const id = String(song.id);
    const cacheKey = `${id}::${user.uid ?? ''}`;
    const hit = playCache.get(cacheKey);
    if (!force && hit && Date.now() - hit.at < PLAY_CACHE_TTL) return hit.info;

    try {
      const right = await call('/api/play/music/v2/checkRight', {
        query: { musicId: id, freeSign: '' },
        body: { musicId: Number(id), freeSign: '' },
        signed: true,
        user,
      });
      const rightData = right.data ?? {};
      if (Number(rightData.status) === 3) {
        const preview = rightData.audition;
        if (preview?.start !== undefined && preview?.end !== undefined && (preview.https || preview.url)) {
          const info = {
            available: true,
            url: String(preview.https || preview.url),
            trial: { start: Number(preview.start), end: Number(preview.end) },
            fee: 0,
            reason: null,
          };
          playCache.set(cacheKey, { at: Date.now(), info });
          return info;
        }
        throw new Error(user.uid ? '波点没有给出可播的试听片段' : '波点需要登录后才能试听或播放');
      }
      if (Number(rightData.status) === 7) {
        throw new Error(user.uid ? '波点要求额外的播放权限' : '波点需要登录');
      }
      if (!isPlayableRight(rightData)) {
        throw new Error(user.uid ? '波点没有解锁这首歌' : '波点需要登录');
      }

      const audioBody = {
        devId: deviceId,
        musicId: Number(id),
        format: 'mp3',
        br: '320kmp3',
        freeSign: '',
      };
      const audio = await call('/api/play/music/v2/audioUrl', {
        query: { ...audioBody, musicId: id },
        body: audioBody,
        signed: true,
        user,
      });
      const url = audio.data?.audioHttpsUrl || audio.data?.audioUrl;
      if (!url) throw new Error('波点没有给出播放地址');
      const info = { available: true, url: String(url), trial: null, fee: 0, reason: null };
      playCache.set(cacheKey, { at: Date.now(), info });
      return info;
    } catch (error) {
      const reason = error instanceof Error ? error.message : '波点暂时不可播';
      const info = { available: false, url: null, trial: null, fee: 0, reason };
      playCache.set(cacheKey, { at: Date.now(), info });
      return info;
    }
  },

  invalidatePlay(song, user = {}) {
    playCache.delete(`${song?.id}::${user.uid ?? ''}`);
  },

  async qrKey() {
    const response = await call('/api/ucenter/login/qrCode', { signed: true, anonymous: true });
    const key = response.data?.qrCode;
    if (!key) throw new Error('没有拿到波点二维码');
    return { key };
  },

  async qrImage(key) {
    const url = new URL('https://bodian-oia.kuwo.cn/bodian/download.html');
    url.search = new URLSearchParams({ pageName: 'login_pc', pt: '3', id: key }).toString();
    return QRCode.toDataURL(url.toString(), { width: 320, margin: 3 });
  },

  async qrCheck(key, user = {}) {
    const statusResponse = await call('/api/ucenter/login/qrCodeStatus', {
      query: { qrCode: key },
      signed: true,
      anonymous: true,
    });
    const status = Number(statusResponse.data?.status);
    if (status === 1) return { state: 'waiting' };
    if (status === 2) return { state: 'expired' };
    if (status !== 3) return { state: 'expired' };

    try {
      const login = await call('/api/ucenter/users/login', {
        body: { authType: 10, qrCode: key },
        signed: true,
        anonymous: true,
        user,
      });
      const data = login.data ?? {};
      const userInfo = data.userInfo ?? data.user ?? {};
      const uid = String(data.uid ?? data.id ?? userInfo.uid ?? userInfo.id ?? '');
      const token = typeof data.token === 'string' ? data.token : '';
      if (!uid || !token) return { state: 'scanned' };
      return {
        state: 'confirmed',
        uid,
        token,
        profile: {
          id: uid,
          nickname: text(userInfo.nickname || userInfo.name || '波点用户'),
          avatarUrl: userInfo.headImg || userInfo.avatarUrl || null,
          vipType: Number(userInfo.vipType ?? 0),
        },
      };
    } catch (error) {
      if (error?.code === 11027) return { state: 'scanned' };
      throw error;
    }
  },
};
