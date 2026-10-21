import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const BASE = process.env.QQ_API_BASE || 'http://127.0.0.1:3210';
let child = null;
let starting = null;
let owned = false;

async function healthy(timeout = 1200) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(`${BASE}/login/channels`, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitHealthy(ms = 12000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await healthy()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export async function ensureQQSidecar() {
  if (await healthy()) return true;
  if (starting) return starting;

  starting = (async () => {
    if (await healthy()) return true;
    let entry;
    try {
      entry = require.resolve('@yakult-green-tea/qq-music-api');
    } catch {
      throw new Error('QQ 音乐 API 依赖没有安装');
    }

    child = spawn(process.execPath, [entry], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: new URL(BASE).port || '3210' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    owned = true;
    child.stdout?.on('data', (chunk) => process.stdout.write(`[qq] ${chunk}`));
    child.stderr?.on('data', (chunk) => process.stderr.write(`[qq] ${chunk}`));
    child.on('exit', (code) => {
      console.warn(`[qq] sidecar 退出 code=${code}`);
      child = null;
      owned = false;
    });

    const ok = await waitHealthy();
    if (!ok) {
      try {
        child?.kill('SIGTERM');
      } catch {
        // ignore
      }
      throw new Error('QQ 音乐 sidecar 启动超时');
    }
    console.log(`[qq] sidecar ready · ${BASE}`);
    return true;
  })()
    .catch((error) => {
      console.error('[qq]', error.message);
      throw error;
    })
    .finally(() => {
      starting = null;
    });

  return starting;
}

export function stopQQSidecar() {
  if (child && owned) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    child = null;
    owned = false;
  }
}

process.on('exit', stopQQSidecar);
process.on('SIGINT', () => {
  stopQQSidecar();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopQQSidecar();
  process.exit(0);
});

export async function qqRequest(pathname, { token, method = 'GET', body, timeout = 20000 } = {}) {
  await ensureQQSidecar();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = {};
    if (token) headers['x-qq-session'] = token;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${BASE}${pathname}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    return {
      status: response.status,
      data,
      setCookie: response.headers.get('set-cookie') ?? '',
    };
  } finally {
    clearTimeout(timer);
  }
}

export const QQ_API_BASE = BASE;
