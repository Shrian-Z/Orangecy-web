import express from 'express';
import compression from 'compression';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { netease } from './providers/netease.mjs';
import { qq } from './providers/qq.mjs';
import { kugou } from './providers/kugou.mjs';
import { bodian } from './providers/bodian.mjs';
import { ensureQQSidecar } from './qqSidecar.mjs';
import { buildCatalog, getCatalogStatus, getRecommendations } from './catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {Map<string, {id:string, cookie:string, profile:any, qqToken:string, qqProfile:any, createdAt:number}>} */
const sessions = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  for (const entry of saved.sessions ?? []) sessions.set(entry.id, entry);
} catch {
  // 首次启动没有会话文件
}

let saveTimer = null;
function persistSessions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const payload = { sessions: [...sessions.values()] };
      const tmp = `${SESSION_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, SESSION_FILE);
    } catch (error) {
      console.warn('[session] 写入失败', error.message);
    }
  }, 250);
}

function parseCookies(header) {
  const out = {};
  for (const chunk of String(header ?? '').split(';')) {
    const idx = chunk.indexOf('=');
    if (idx <= 0) continue;
    out[chunk.slice(0, idx).trim()] = decodeURIComponent(chunk.slice(idx + 1).trim());
  }
  return out;
}

const app = express();
app.disable('x-powered-by');
app.use(
  compression({
    filter: (req, res) => {
      if (req.path.startsWith('/api/audio/')) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies.oc_sid;
  let session = sid ? sessions.get(sid) : null;
  if (!session) {
    sid = crypto.randomBytes(18).toString('hex');
    session = {
      id: sid,
      cookie: '',
      profile: null,
      qqToken: '',
      qqProfile: null,
      kugouToken: '',
      kugouUserId: '',
      kugouProfile: null,
      bodianUid: '',
      bodianToken: '',
      bodianProfile: null,
      createdAt: Date.now(),
    };
    sessions.set(sid, session);
    res.append(
      'Set-Cookie',
      `oc_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    );
    persistSessions();
  }
  session.qqToken = session.qqToken ?? '';
  session.qqProfile = session.qqProfile ?? null;
  session.kugouToken = session.kugouToken ?? '';
  session.kugouUserId = session.kugouUserId ?? '';
  session.kugouProfile = session.kugouProfile ?? null;
  session.bodianUid = session.bodianUid ?? '';
  session.bodianToken = session.bodianToken ?? '';
  session.bodianProfile = session.bodianProfile ?? null;
  req.session = session;
  next();
});

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true, platform: 'netease+qq+kugou+bodian', at: new Date().toISOString() });
});

app.get(
  '/api/qq/auth/status',
  asyncRoute(async (req, res) => {
    const status = await qq.loginStatus(req.session.qqToken);
    req.session.qqProfile = status.profile;
    persistSessions();
    res.json({
      platform: 'qq',
      platformLabel: qq.label,
      loggedIn: status.loggedIn,
      profile: status.profile,
    });
  }),
);

app.post(
  '/api/qq/auth/qr/key',
  asyncRoute(async (req, res) => {
    const key = await qq.qrKey(req.session.qqToken);
    const image = await qq.qr(key, req.session.qqToken);
    res.json({ key, ...image });
  }),
);

app.get(
  '/api/qq/auth/qr/check',
  asyncRoute(async (req, res) => {
    const key = String(req.query.key ?? '');
    if (!key) return res.status(400).json({ error: '缺少二维码 key' });
    const result = await qq.qrCheck(key, req.session.qqToken);
    if (result.code === 803) {
      req.session.qqToken = result.token ?? '';
      const status = await qq.loginStatus(req.session.qqToken);
      req.session.qqProfile = status.profile;
      persistSessions();
      return res.json({
        code: 803,
        message: '登录成功',
        loggedIn: status.loggedIn,
        profile: status.profile,
      });
    }
    res.json(result);
  }),
);

app.post(
  '/api/qq/auth/logout',
  asyncRoute(async (req, res) => {
    await qq.logout(req.session.qqToken);
    req.session.qqToken = '';
    req.session.qqProfile = null;
    persistSessions();
    res.json({ ok: true });
  }),
);

function bodianUser(req) {
  return req.session.bodianToken
    ? { uid: req.session.bodianUid, token: req.session.bodianToken }
    : {};
}

function kugouUser(req) {
  return req.session.kugouToken
    ? { token: req.session.kugouToken, userid: req.session.kugouUserId }
    : {};
}

app.get('/api/bodian/auth/status', (req, res) => {
  const loggedIn = Boolean(req.session.bodianToken && req.session.bodianProfile);
  res.json({
    platform: 'bodian',
    platformLabel: bodian.label,
    loggedIn,
    profile: loggedIn ? req.session.bodianProfile : null,
  });
});

app.post(
  '/api/bodian/auth/qr/key',
  asyncRoute(async (req, res) => {
    const { key } = await bodian.qrKey();
    const image = await bodian.qrImage(key);
    res.json({ key, image });
  }),
);

app.get(
  '/api/bodian/auth/qr/check',
  asyncRoute(async (req, res) => {
    const key = String(req.query.key ?? '');
    if (!key) return res.status(400).json({ error: '缺少二维码 key' });
    const result = await bodian.qrCheck(key, bodianUser(req));
    if (result.state === 'confirmed') {
      req.session.bodianUid = result.uid;
      req.session.bodianToken = result.token;
      req.session.bodianProfile = result.profile;
      persistSessions();
      return res.json({
        code: 803,
        message: '登录成功',
        loggedIn: true,
        profile: result.profile,
      });
    }
    res.json({
      code: result.state === 'expired' ? 800 : result.state === 'scanned' ? 802 : 801,
      message:
        result.state === 'expired'
          ? '二维码已过期'
          : result.state === 'scanned'
            ? '已扫码，请在手机上确认'
            : '等待扫码',
    });
  }),
);

app.post('/api/bodian/auth/logout', (req, res) => {
  req.session.bodianUid = '';
  req.session.bodianToken = '';
  req.session.bodianProfile = null;
  persistSessions();
  res.json({ ok: true });
});

app.get(
  '/api/bodian/search',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ songs: [] });
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
    const songs = await bodian.search(q, limit, bodianUser(req));
    res.json({ songs });
  }),
);

app.get(
  '/api/bodian/song/:id/lyric',
  asyncRoute(async (req, res) => {
    const lyric = await bodian.lyric(
      {
        id: req.params.id,
        title: String(req.query.title ?? ''),
        durationMs: Number(req.query.duration ?? 0) * 1000,
      },
      bodianUser(req),
    );
    res.json(lyric);
  }),
);

app.get(
  '/api/bodian/song/:id/play',
  asyncRoute(async (req, res) => {
    const info = await bodian.playInfo(
      { id: req.params.id },
      { user: bodianUser(req) },
    );
    res.json({
      available: info.available,
      trial: info.trial,
      fee: info.fee,
      reason: info.reason,
    });
  }),
);

app.get(
  '/api/kugou/auth/status',
  asyncRoute(async (req, res) => {
    const status = await kugou.loginStatus(kugouUser(req));
    req.session.kugouProfile = status.profile;
    persistSessions();
    res.json({
      platform: 'kugou',
      platformLabel: kugou.label,
      loggedIn: status.loggedIn,
      profile: status.profile,
    });
  }),
);

app.post(
  '/api/kugou/auth/qr/key',
  asyncRoute(async (req, res) => {
    const qr = await kugou.qrKey();
    res.json(qr);
  }),
);

app.get(
  '/api/kugou/auth/qr/check',
  asyncRoute(async (req, res) => {
    const key = String(req.query.key ?? '');
    if (!key) return res.status(400).json({ error: '缺少二维码 key' });
    const result = await kugou.qrCheck(key, kugouUser(req));
    if (result.code === 803) {
      req.session.kugouToken = result.token ?? '';
      req.session.kugouUserId = result.userId ?? '';
      const status = await kugou.loginStatus(kugouUser(req));
      req.session.kugouProfile = status.profile;
      persistSessions();
      return res.json({
        code: 803,
        message: '登录成功',
        loggedIn: status.loggedIn,
        profile: status.profile,
      });
    }
    res.json(result);
  }),
);

app.post('/api/kugou/auth/logout', (req, res) => {
  req.session.kugouToken = '';
  req.session.kugouUserId = '';
  req.session.kugouProfile = null;
  persistSessions();
  res.json({ ok: true });
});

app.get(
  '/api/kugou/search',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ songs: [] });
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
    const songs = await kugou.search(q, limit, kugouUser(req));
    res.json({ songs });
  }),
);

app.get(
  '/api/kugou/song/:id/lyric',
  asyncRoute(async (req, res) => {
    const lyric = await kugou.lyric(
      {
        id: req.params.id,
        title: String(req.query.title ?? ''),
        durationMs: Number(req.query.duration ?? 0) * 1000,
      },
      kugouUser(req),
    );
    res.json(lyric);
  }),
);

app.get(
  '/api/kugou/song/:id/play',
  asyncRoute(async (req, res) => {
    const info = await kugou.playInfo(
      {
        id: req.params.id,
        meta: {
          albumId: String(req.query.albumId ?? ''),
          mixSongId: String(req.query.mixSongId ?? ''),
        },
      },
      { userCookie: kugouUser(req) },
    );
    res.json({
      available: info.available,
      trial: info.trial,
      fee: info.fee,
      reason: info.reason,
    });
  }),
);

app.get(
  '/api/qq/search',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ songs: [] });
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 20));
    const songs = await qq.search(q, req.session.qqToken, limit);
    res.json({ songs });
  }),
);

app.get(
  '/api/qq/song/:id/lyric',
  asyncRoute(async (req, res) => {
    const lyric = await qq.lyric(req.params.id, req.session.qqToken);
    res.json(lyric);
  }),
);

app.get(
  '/api/qq/song/:id/play',
  asyncRoute(async (req, res) => {
    const info = await qq.playInfo(req.params.id, req.session.qqToken);
    res.json({
      available: info.available,
      trial: info.trial,
      fee: info.fee,
      reason: info.reason,
    });
  }),
);

app.get(
  '/api/auth/status',
  asyncRoute(async (req, res) => {
    const status = await netease.loginStatus(req.session.cookie);
    req.session.profile = status.profile;
    persistSessions();
    res.json({
      platform: 'netease',
      platformLabel: netease.label,
      loggedIn: status.loggedIn,
      profile: status.profile,
    });
  }),
);

app.post(
  '/api/auth/qr/key',
  asyncRoute(async (req, res) => {
    const key = await netease.qrKey(req.session.cookie);
    const image = await netease.qrImage(key);
    res.json({ key, ...image });
  }),
);

app.get(
  '/api/auth/qr/check',
  asyncRoute(async (req, res) => {
    const key = String(req.query.key ?? '');
    if (!key) return res.status(400).json({ error: '缺少二维码 key' });

    let result;
    try {
      result = await netease.qrCheck(key, req.session.cookie);
    } catch (error) {
      return res.json({ code: 801, message: '等待扫码', detail: error.message });
    }

    if (result.code === 803) {
      req.session.cookie = result.cookie;
      const status = await netease.loginStatus(req.session.cookie);
      req.session.profile = status.profile;
      persistSessions();
      return res.json({
        code: 803,
        message: '登录成功',
        loggedIn: status.loggedIn,
        profile: status.profile,
      });
    }
    res.json(result);
  }),
);

app.post('/api/auth/logout', (req, res) => {
  req.session.cookie = '';
  req.session.profile = null;
  persistSessions();
  res.json({ ok: true });
});

app.get('/api/recommend/status', (req, res) => {
  res.json({ catalog: getCatalogStatus() });
});

app.post(
  '/api/recommend',
  asyncRoute(async (req, res) => {
    const words = Array.isArray(req.body?.words) ? req.body.words : [];
    const limit = Math.max(1, Math.min(20, Number(req.body?.limit) || 10));
    const catalog = getCatalogStatus();

    if (catalog.status !== 'ready' || catalog.songs === 0) {
      if (catalog.status !== 'building') {
        void buildCatalog().catch((error) => {
          console.warn('[recommend] 推荐池构建失败', error.message);
        });
      }
      return res.json({ status: 'building', catalog: getCatalogStatus(), songs: [] });
    }

    const songs = getRecommendations(words, limit);
    res.json({ status: 'ready', catalog, songs });
  }),
);

app.get(
  '/api/search',
  asyncRoute(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ songs: [] });
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 20));
    const songs = await netease.search(q, req.session.cookie, limit);
    res.json({ songs });
  }),
);

app.get(
  '/api/song/:id',
  asyncRoute(async (req, res) => {
    const song = await netease.song(req.params.id, req.session.cookie);
    res.json({ song });
  }),
);

app.get(
  '/api/song/:id/lyric',
  asyncRoute(async (req, res) => {
    const lyric = await netease.lyric(req.params.id, req.session.cookie);
    res.json(lyric);
  }),
);

app.get(
  '/api/song/:id/play',
  asyncRoute(async (req, res) => {
    const info = await netease.playInfo(req.params.id, req.session.cookie);
    res.json({
      available: info.available,
      trial: info.trial,
      fee: info.fee,
      br: info.br,
      level: info.level,
      reason: info.reason,
    });
  }),
);

async function streamAudio(req, res, force = false) {
  const { id } = req.params;
  const info = await netease.playInfo(id, req.session.cookie, { force });
  if (!info.available || !info.url) {
    return res.status(404).json({ error: info.reason ?? '没有播放地址' });
  }

  const headers = {
    'User-Agent': UA,
    Referer: 'https://music.163.com/',
    Origin: 'https://music.163.com',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(info.url, { headers, redirect: 'follow' });
  } catch (error) {
    return res.status(502).json({ error: `音源连接失败：${error.message}` });
  }

  if ((upstream.status === 403 || upstream.status === 404) && !force) {
    netease.invalidatePlay(id, req.session.cookie);
    upstream.body?.cancel().catch(() => {});
    return streamAudio(req, res, true);
  }

  if (!upstream.ok && upstream.status !== 206) {
    return res.status(upstream.status).json({ error: `音源返回 ${upstream.status}` });
  }

  res.status(upstream.status);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'no-store');

  if (!upstream.body) return res.end();
  const stream = Readable.fromWeb(upstream.body);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function streamBodianAudio(req, res) {
  const { id } = req.params;
  const info = await bodian.playInfo({ id }, { user: bodianUser(req) });
  if (!info.available || !info.url) {
    return res.status(404).json({ error: info.reason ?? '波点没有播放地址' });
  }
  const headers = {
    'User-Agent': UA,
    Referer: 'https://bodian.kuwo.cn/',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(info.url, { headers, redirect: 'follow' });
  } catch (error) {
    return res.status(502).json({ error: `波点音源连接失败：${error.message}` });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return res.status(upstream.status).json({ error: `波点音源返回 ${upstream.status}` });
  }
  res.status(upstream.status);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'no-store');
  if (!upstream.body) return res.end();
  const stream = Readable.fromWeb(upstream.body);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function streamKugouAudio(req, res) {
  const { id } = req.params;
  const info = await kugou.playInfo(
    {
      id,
      meta: {
        albumId: String(req.query.albumId ?? ''),
        mixSongId: String(req.query.mixSongId ?? ''),
      },
    },
    { userCookie: kugouUser(req) },
  );
  if (!info.available || !info.url) {
    return res.status(404).json({ error: info.reason ?? '酷狗没有播放地址' });
  }
  const headers = {
    'User-Agent': UA,
    Referer: 'https://www.kugou.com/',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(info.url, { headers, redirect: 'follow' });
  } catch (error) {
    return res.status(502).json({ error: `酷狗音源连接失败：${error.message}` });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return res.status(upstream.status).json({ error: `酷狗音源返回 ${upstream.status}` });
  }
  res.status(upstream.status);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'no-store');
  if (!upstream.body) return res.end();
  const stream = Readable.fromWeb(upstream.body);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function streamQQAudio(req, res) {
  const { id } = req.params;
  const info = await qq.playInfo(id, req.session.qqToken);
  if (!info.available || !info.url) {
    return res.status(404).json({ error: info.reason ?? 'QQ 音乐没有播放地址' });
  }
  const headers = {
    'User-Agent': UA,
    Referer: 'https://y.qq.com/',
  };
  if (req.headers.range) headers.Range = req.headers.range;

  let upstream;
  try {
    upstream = await fetch(info.url, { headers, redirect: 'follow' });
  } catch (error) {
    return res.status(502).json({ error: `QQ 音源连接失败：${error.message}` });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return res.status(upstream.status).json({ error: `QQ 音源返回 ${upstream.status}` });
  }
  res.status(upstream.status);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'no-store');
  if (!upstream.body) return res.end();
  const stream = Readable.fromWeb(upstream.body);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

app.get(
  '/api/audio/bodian/:id',
  asyncRoute(async (req, res) => {
    await streamBodianAudio(req, res);
  }),
);

app.get(
  '/api/audio/kugou/:id',
  asyncRoute(async (req, res) => {
    await streamKugouAudio(req, res);
  }),
);

app.get(
  '/api/audio/qq/:id',
  asyncRoute(async (req, res) => {
    await streamQQAudio(req, res);
  }),
);

app.get(
  '/api/audio/:id',
  asyncRoute(async (req, res) => {
    await streamAudio(req, res);
  }),
);

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('[api]', req.method, req.originalUrl, error);
  res.status(error.status ?? 500).json({
    error: error.message || '服务器开小差了',
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Orangecy API · http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  ensureQQSidecar().catch((error) => console.warn('[qq] 未启动：', error.message));
});
