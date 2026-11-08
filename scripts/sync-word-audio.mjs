#!/usr/bin/env node
/**
 * Link Word Atlas MP3s into public/wordbooks/audio for local pronunciation.
 *
 * Source default: ~/Desktop/word-atlas/public/atlas/audio/{us,uk,ex}
 * Dest default:   public/wordbooks/audio/{us,uk}/{headword}.mp3
 *
 * Only headwords from the CET / shipped word lists are copied. MP3s stay
 * gitignored. The written manifest is an index of what landed on disk;
 * playback does not consult it — a missing file 404s through to TTS.
 *
 *   node scripts/sync-word-audio.mjs
 *   node scripts/sync-word-audio.mjs --from ~/Desktop/word-atlas/public/atlas/audio
 *   node scripts/sync-word-audio.mjs --copy --examples --books cet4,cet6,gaozhong
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wordAudioKey } from '../src/audio/wordAudio.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_FROM = path.join(os.homedir(), 'Desktop', 'word-atlas', 'public', 'atlas', 'audio');

const args = process.argv.slice(2);
let from = process.env.WORD_ATLAS_AUDIO || DEFAULT_FROM;
let out = path.join(ROOT, 'public', 'wordbooks', 'audio');
const wordbooks = [];
let copyOnly = false;
let examples = false;
let force = false;
let dry = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  const next = () => {
    const value = args[i + 1];
    if (!value) {
      console.error(`Missing value for ${arg}`);
      process.exit(1);
    }
    i += 1;
    return value;
  };
  if (arg === '--from') from = path.resolve(next());
  else if (arg === '--out') out = path.resolve(next());
  else if (arg === '--wordbook') wordbooks.push(path.resolve(next()));
  else if (arg === '--books') {
    for (const id of next().split(',')) {
      const name = id.trim();
      if (name) wordbooks.push(path.join(ROOT, 'public', 'wordbooks', `${name}.json`));
    }
  } else if (arg === '--copy') copyOnly = true;
  else if (arg === '--examples') examples = true;
  else if (arg === '--force') force = true;
  else if (arg === '--dry-run') dry = true;
  else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: node scripts/sync-word-audio.mjs [--from dir] [--out dir] [--books cet4,cet6] [--wordbook file] [--copy] [--examples] [--force] [--dry-run]`);
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }
}

if (wordbooks.length === 0) {
  for (const id of ['cet4', 'cet6', 'gaozhong']) {
    wordbooks.push(path.join(ROOT, 'public', 'wordbooks', `${id}.json`));
  }
}

if (!fs.existsSync(from) || !fs.statSync(from).isDirectory()) {
  console.error(`Word Atlas audio directory not found: ${from}`);
  console.error('Pass --from or set WORD_ATLAS_AUDIO. Expected {us,uk,ex}/*.mp3');
  process.exit(1);
}

function headwords(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(rows)) throw new Error(`${file} has no words array`);
  const keys = new Set();
  for (const row of rows) {
    const word = Array.isArray(row) ? row[0] : row?.w ?? row?.word ?? row;
    if (typeof word !== 'string') continue;
    const key = wordAudioKey(word);
    if (key) keys.add(key);
  }
  return keys;
}

const wanted = new Set();
for (const file of wordbooks) {
  if (!fs.existsSync(file)) {
    console.error(`Missing word list: ${file}`);
    process.exit(1);
  }
  for (const key of headwords(file)) wanted.add(key);
}

const accents = ['us', 'uk', ...(examples ? ['ex'] : [])];
const have = Object.fromEntries(accents.map((accent) => [accent, []]));
const counts = { linked: 0, copied: 0, kept: 0, skipped: 0, missing: 0 };

function sameFile(left, right) {
  try {
    const a = fs.statSync(left);
    const b = fs.statSync(right);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}

function place(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) {
    if (!force) return sameFile(src, dest) ? 'kept' : 'skipped';
    fs.unlinkSync(dest);
  }
  if (!copyOnly) {
    try {
      fs.linkSync(src, dest);
      return 'linked';
    } catch (error) {
      const code = error && typeof error === 'object' ? error.code : '';
      if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'EEXIST') throw error;
    }
  }
  fs.copyFileSync(src, dest);
  return 'copied';
}

const keys = [...wanted].sort();
for (const accent of accents) {
  for (const key of keys) {
    const src = path.join(from, accent, `${key}.mp3`);
    if (!fs.existsSync(src)) {
      counts.missing += 1;
      continue;
    }
    have[accent].push(key);
    if (dry) continue;
    const dest = path.join(out, accent, `${key}.mp3`);
    const action = place(src, dest);
    counts[action] += 1;
  }
}

const manifest = {
  attribution: 'Word Atlas contributors',
  license: 'CC BY 4.0',
  voices: { uk: 'ElevenLabs Alice', us: 'ElevenLabs Sarah' },
  us: have.us,
  uk: have.uk,
  ...(examples ? { ex: have.ex } : {}),
};

if (!dry) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const linked = accents.map((accent) => `${accent} ${have[accent].length}`).join(', ');
console.log(
  `${dry ? 'dry-run' : 'synced'} ${keys.length} headwords from ${wordbooks.length} lists · ${linked} · linked ${counts.linked}, copied ${counts.copied}, kept ${counts.kept}, skipped ${counts.skipped}, missing ${counts.missing}`,
);
console.log(`source ${from}`);
if (!dry) console.log(`manifest ${path.join(out, 'manifest.json')}`);
