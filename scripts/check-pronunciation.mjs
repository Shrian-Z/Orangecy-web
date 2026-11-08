#!/usr/bin/env node
/**
 * Unit checks for Word Atlas MP3 pronunciation.
 *
 * Proves speak() requests /wordbooks/audio/us/{key}.mp3, then uk/ on a miss,
 * and calls speechSynthesis only after both fail. Manual and automatic
 * pronunciation share that provider (sequence.ts speakNow).
 *
 * Manual, with a local pack:
 *   node scripts/sync-word-audio.mjs
 *   npm run dev
 *   Open a CET card whose headword has public/wordbooks/audio/us/{word}.mp3
 *   (for example ability). The auto pronounce and a tap on the word both play
 *   that file. A headword with no file (for example abruptly) uses the browser voice.
 *   Mute or switching cards during the clip stops the MP3.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const {
  parseAudioManifest,
  resolveWordAudio,
  wordAudioKey,
  wordAudioUrl,
} = await import(pathToFileURL(path.join(ROOT, 'src/audio/wordAudio.ts')).href);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(error);
  }
}

check('headword key is lowercase and keeps hyphens', () => {
  assert.equal(wordAudioKey('Ability'), 'ability');
  assert.equal(wordAudioKey(' well-known '), 'well-known');
  assert.equal(wordAudioKey('x-ray'), 'x-ray');
  assert.equal(wordAudioKey('  ZIP code '), 'zip-code');
  assert.equal(wordAudioKey('don’t'), 'dont');
  assert.equal(wordAudioKey('!!!'), '');
});

check('audio URL prefers the wordbook us/ path', () => {
  assert.equal(wordAudioUrl('us', 'ability', '/'), '/wordbooks/audio/us/ability.mp3');
  assert.equal(wordAudioUrl('uk', 'well-known', '/'), '/wordbooks/audio/uk/well-known.mp3');
  assert.equal(wordAudioUrl('us', 'ability', './'), './wordbooks/audio/us/ability.mp3');
  assert.equal(
    wordAudioUrl('us', 'ability', '/Orangecy-web/'),
    '/Orangecy-web/wordbooks/audio/us/ability.mp3',
  );
});

check('manifest parser accepts a shared word list', () => {
  const parsed = parseAudioManifest({ words: ['ability', 'absorb'] });
  assert.equal(parsed.us.has('ability'), true);
  assert.equal(parsed.uk.has('absorb'), true);
  assert.equal(parseAudioManifest({}), null);
  assert.equal(parseAudioManifest({ us: ['ability'], uk: [] }).uk.has('ability'), false);
});

await checkAsync('resolver plays us and does not ask uk', async () => {
  const seen = [];
  const result = await resolveWordAudio('Ability', {
    probe: async (url, accent) => {
      seen.push(accent);
      assert.equal(url, '/wordbooks/audio/us/ability.mp3');
      return 'ok';
    },
  });
  assert.deepEqual(seen, ['us']);
  assert.equal(result.kind, 'file');
  assert.equal(result.accent, 'us');
});

await checkAsync('resolver falls through us 404 to uk', async () => {
  const seen = [];
  const result = await resolveWordAudio('absorb', {
    probe: async (_url, accent) => {
      seen.push(accent);
      return accent === 'uk' ? 'ok' : 'miss';
    },
  });
  assert.deepEqual(seen, ['us', 'uk']);
  assert.equal(result.kind, 'file');
  assert.equal(result.accent, 'uk');
});

await checkAsync('resolver uses TTS only after both accents miss', async () => {
  let calls = 0;
  const result = await resolveWordAudio('abruptly', {
    probe: async () => {
      calls += 1;
      return 'miss';
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.kind, 'tts');
});

await checkAsync('resolver stops on abort and does not try TTS', async () => {
  let calls = 0;
  const result = await resolveWordAudio('ability', {
    isAborted: () => calls > 0,
    probe: async () => {
      calls += 1;
      return 'miss';
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.kind, 'aborted');
});

check('manual and auto pronounce share pronunciation.speak', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/audio/sequence.ts'), 'utf8');
  assert.match(source, /this\.speakNow\(card\.w\)/);
  assert.match(source, /this\.speakNow\(this\.card\.w\)/);
  assert.equal([...source.matchAll(/\.speak\(/g)].length, 1);
  assert.match(source, /pronunciation\s*\.speak\(/);
  assert.equal(source.includes('browserTts'), false);
  assert.equal(fs.readFileSync(path.join(ROOT, 'src/audio/pronunciation.ts'), 'utf8').includes('manifest.json'), false);
});

const spoken = [];
const fetches = [];
let allow = () => false;
let hang = false;
let blockPlay = false;
let holdPlay = false;

class FakeAudio {
  constructor() {
    this._src = '';
    this.paused = false;
    this.volume = 1;
    this.preload = '';
    this.listeners = new Map();
    FakeAudio.instances.push(this);
  }

  set src(value) {
    this._src = String(value ?? '');
  }

  get src() {
    return this._src;
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== fn));
  }

  emit(type) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }

  load() {}

  pause() {
    this.paused = true;
  }

  play() {
    if (blockPlay) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    queueMicrotask(() => {
      this.emit('playing');
      if (!holdPlay) queueMicrotask(() => this.emit('ended'));
    });
    return Promise.resolve();
  }
}
FakeAudio.instances = [];

class SpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

let blobId = 0;
globalThis.URL.createObjectURL = () => `blob:word-${++blobId}`;
globalThis.URL.revokeObjectURL = () => {};
globalThis.Audio = FakeAudio;
globalThis.SpeechSynthesisUtterance = SpeechSynthesisUtterance;
globalThis.window = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  speechSynthesis: {
    cancel() {},
    speak(utterance) {
      spoken.push(utterance.text);
      queueMicrotask(() => {
        utterance.onstart?.();
        utterance.onend?.();
      });
    },
  },
};
globalThis.fetch = (url, init) => {
  const href = String(url);
  fetches.push(href);
  if (hang) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('aborted', 'AbortError'));
      if (init?.signal?.aborted) {
        abort();
        return;
      }
      init?.signal?.addEventListener('abort', abort, { once: true });
    });
  }
  if (init?.signal?.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
  if (!allow(href)) return Promise.resolve({ ok: false, status: 404, body: null });
  return Promise.resolve({
    ok: true,
    status: 200,
    blob: async () => new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/mpeg' }),
  });
};

const { pronunciation, pronunciationSource } = await import(
  pathToFileURL(path.join(ROOT, 'src/audio/pronunciation.ts')).href
);

function resetAudio() {
  spoken.length = 0;
  fetches.length = 0;
  FakeAudio.instances = [];
  blockPlay = false;
  holdPlay = false;
  hang = false;
}

await checkAsync('existing us mp3 plays and does not call speechSynthesis', async () => {
  resetAudio();
  allow = (url) => url === '/wordbooks/audio/us/ability.mp3';
  let source = null;
  await pronunciation.speak('Ability', {
    onStart: () => {
      source = pronunciationSource();
    },
  });
  assert.deepEqual(fetches, ['/wordbooks/audio/us/ability.mp3']);
  assert.deepEqual(spoken, []);
  assert.equal(source, 'us');
  assert.equal(pronunciation.supportsGainRamp, false);
});

await checkAsync('missing us mp3 plays uk and still skips TTS', async () => {
  resetAudio();
  allow = (url) => url === '/wordbooks/audio/uk/absorb.mp3';
  await pronunciation.speak('absorb');
  assert.deepEqual(fetches, [
    '/wordbooks/audio/us/absorb.mp3',
    '/wordbooks/audio/uk/absorb.mp3',
  ]);
  assert.deepEqual(spoken, []);
  assert.equal(pronunciationSource(), 'uk');
});

await checkAsync('404 on us and uk falls back to browser TTS', async () => {
  resetAudio();
  allow = () => false;
  await pronunciation.speak('abruptly');
  assert.deepEqual(fetches, [
    '/wordbooks/audio/us/abruptly.mp3',
    '/wordbooks/audio/uk/abruptly.mp3',
  ]);
  assert.deepEqual(spoken, ['abruptly']);
  assert.equal(pronunciationSource(), 'tts');
});

await checkAsync('a later word still tries its mp3 after another word used TTS', async () => {
  resetAudio();
  allow = (url) => url === '/wordbooks/audio/us/academy.mp3';
  await pronunciation.speak('academy');
  assert.deepEqual(fetches, ['/wordbooks/audio/us/academy.mp3']);
  assert.deepEqual(spoken, []);
  assert.equal(pronunciationSource(), 'us');
});

await checkAsync('cancel during fetch does not fall through to TTS', async () => {
  resetAudio();
  hang = true;
  allow = () => false;
  const pending = pronunciation.speak('library');
  pronunciation.cancel();
  await pending;
  assert.deepEqual(spoken, []);
  assert.ok(fetches.some((url) => url.includes('/us/library.mp3')));
});

await checkAsync('cancel during playback pauses the mp3', async () => {
  resetAudio();
  holdPlay = true;
  allow = (url) => url === '/wordbooks/audio/us/academic.mp3';
  const pending = pronunciation.speak('academic');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const audio = FakeAudio.instances.at(-1);
  assert.ok(audio);
  assert.equal(audio.paused, false);
  pronunciation.cancel();
  await pending;
  assert.equal(audio.paused, true);
  assert.equal(audio.src, '');
  assert.deepEqual(spoken, []);
});

await checkAsync('autoplay rejection still tried the file, then TTS, and retries next time', async () => {
  resetAudio();
  blockPlay = true;
  allow = (url) => url.includes('/us/absent.mp3') || url.includes('/uk/absent.mp3');
  await pronunciation.speak('absent');
  assert.equal(fetches.length, 2);
  assert.deepEqual(spoken, ['absent']);
  resetAudio();
  blockPlay = false;
  allow = (url) => url === '/wordbooks/audio/us/absent.mp3';
  await pronunciation.speak('absent');
  assert.deepEqual(fetches, ['/wordbooks/audio/us/absent.mp3']);
  assert.deepEqual(spoken, []);
});

check('sync script hardlinks only listed headwords and writes attribution', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-audio-'));
  const from = path.join(tmp, 'atlas');
  const out = path.join(tmp, 'out');
  fs.mkdirSync(path.join(from, 'us'), { recursive: true });
  fs.mkdirSync(path.join(from, 'uk'), { recursive: true });
  fs.mkdirSync(path.join(from, 'ex'), { recursive: true });
  fs.writeFileSync(path.join(from, 'us', 'ability.mp3'), 'US-ABILITY');
  fs.writeFileSync(path.join(from, 'uk', 'absorb.mp3'), 'UK-ABSORB');
  fs.writeFileSync(path.join(from, 'us', 'not-a-word.mp3'), 'NO');
  fs.writeFileSync(path.join(from, 'ex', 'ability.mp3'), 'EX');
  const book = path.join(tmp, 'book.json');
  fs.writeFileSync(
    book,
    JSON.stringify({ words: [['Ability', 'ipa', 'meaning'], ['absorb'], ['abruptly']] }),
  );
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/sync-word-audio.mjs'),
      '--from',
      from,
      '--out',
      out,
      '--wordbook',
      book,
      '--examples',
    ],
    { encoding: 'utf8' },
  );
  assert.match(stdout, /us 1, uk 1, ex 1/);
  const usDest = path.join(out, 'us', 'ability.mp3');
  const ukDest = path.join(out, 'uk', 'absorb.mp3');
  assert.equal(fs.readFileSync(usDest, 'utf8'), 'US-ABILITY');
  assert.equal(fs.readFileSync(ukDest, 'utf8'), 'UK-ABSORB');
  assert.equal(fs.existsSync(path.join(out, 'us', 'not-a-word.mp3')), false);
  assert.equal(fs.existsSync(path.join(out, 'us', 'abruptly.mp3')), false);
  assert.equal(fs.statSync(path.join(from, 'us', 'ability.mp3')).ino, fs.statSync(usDest).ino);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.us, ['ability']);
  assert.deepEqual(manifest.uk, ['absorb']);
  assert.deepEqual(manifest.ex, ['ability']);
  assert.match(manifest.attribution, /Word Atlas contributors/);
  assert.equal(manifest.license, 'CC BY 4.0');
});

check('mp3 binaries are gitignored and the notice is not', () => {
  execFileSync('git', ['check-ignore', '-q', '--', 'public/wordbooks/audio/us/ability.mp3'], { cwd: ROOT });
  let readmeIgnored = false;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', 'public/wordbooks/audio/README.md'], { cwd: ROOT });
    readmeIgnored = true;
  } catch {
    readmeIgnored = false;
  }
  assert.equal(readmeIgnored, false);
  const notice = fs.readFileSync(path.join(ROOT, 'public/wordbooks/audio/README.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  for (const text of [notice, readme]) {
    assert.match(text, /Word Atlas contributors/);
    assert.match(text, /CC BY 4\.0/);
  }
});

if (failed) {
  console.error(`\n${failed} pronunciation check(s) failed`);
  process.exit(1);
}
console.log('\nPASS pronunciation checks');
