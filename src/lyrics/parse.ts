import type { LyricLine, LyricPayload, LyricWord } from '@/types';

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const CREDIT =
  /^(作词|作曲|编曲|制作人|混音|母带|录音|录音工程|录音师|吉他|贝斯|鼓|弦乐|和声|合声|监制|发行|出品|出品人|词|曲|键盘|钢琴|小提琴|中提琴|大提琴|编程|人声|配唱|配唱制作人|特别支持|特别感谢|鸣谢|致谢|美术|设计|统筹|企划|宣传|经纪|版权|营销|推广|封面|摄影|插画|视觉|字体|制作助理|音乐总监|项目统筹|op|sp|produced|written|composed|arranged|mixed|mastered|lyrics|music|producer|mixing|mastering|recording|guitar|bass|drums|strings|vocals|piano|keyboard|violin|cello|choir)\s*[:：]/i;

const SHORT_LABEL = /^[\u4e00-\u9fffA-Za-z0-9·&\- ]{1,12}\s*[:：]\s*\S/;

function toSeconds(m: string, s: string, frac?: string) {
  const ms = frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0;
  return Number(m) * 60 + Number(s) + ms / 1000;
}

function stripTags(text: string) {
  return text.replace(TIME_TAG, '').replace(WORD_TAG, '').trim();
}

function parseWords(raw: string): LyricWord[] | undefined {
  if (!raw.includes('<')) return undefined;
  const words: LyricWord[] = [];
  const matches = [...raw.matchAll(WORD_TAG)];
  if (matches.length < 2) return undefined;

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = match.index ?? 0;
    const after = start + match[0].length;
    const next = matches[i + 1]?.index ?? raw.length;
    const text = raw
      .slice(after, next)
      .replace(TIME_TAG, '')
      .trim();
    if (!text) continue;
    const time = toSeconds(match[1], match[2], match[3]);
    const nextTime =
      i + 1 < matches.length
        ? toSeconds(matches[i + 1][1], matches[i + 1][2], matches[i + 1][3])
        : time + 1;
    words.push({ text, time, duration: Math.max(0.08, nextTime - time) });
  }
  return words.length ? words : undefined;
}

function parseWordTimingMap(raw: string) {
  const map = new Map<number, LyricWord[]>();
  if (!raw.trim()) return map;
  for (const row of raw.split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const tags = [...row.matchAll(TIME_TAG)];
    if (!tags.length) continue;
    const text = stripTags(row);
    if (!text || !/[A-Za-z]/.test(text)) continue;
    const words = parseWords(row);
    if (!words?.length) continue;
    for (const tag of tags) {
      const time = toSeconds(tag[1], tag[2], tag[3]);
      map.set(time, words);
    }
  }
  return map;
}

function nearestWords(map: Map<number, LyricWord[]>, time: number) {
  if (!map.size) return undefined;
  let best: LyricWord[] | undefined;
  let bestDelta = 0.35;
  for (const [at, words] of map) {
    const delta = Math.abs(at - time);
    if (delta <= bestDelta) {
      best = words;
      bestDelta = delta;
    }
  }
  return best;
}

function parseTranslationMap(raw: string) {
  const map = new Map<number, string>();
  if (!raw) return map;
  for (const line of raw.split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const tags = [...line.matchAll(TIME_TAG)];
    if (!tags.length) continue;
    const text = stripTags(line);
    if (!text) continue;
    for (const tag of tags) {
      map.set(toSeconds(tag[1], tag[2], tag[3]), text);
    }
  }
  return map;
}

function nearestTranslation(map: Map<number, string>, time: number) {
  if (!map.size) return undefined;
  let best: string | undefined;
  let bestDelta = 0.06;
  for (const [at, text] of map) {
    const delta = Math.abs(at - time);
    if (delta <= bestDelta) {
      best = text;
      bestDelta = delta;
    }
  }
  return best;
}

export function parseLyric(payload: LyricPayload): LyricLine[] {
  const raw = payload.lrc || '';
  if (!raw.trim()) return [];

  let offset = 0;
  const offsetMatch = raw.match(/\[offset:([+-]?\d+)\]/i);
  if (offsetMatch) offset = Number(offsetMatch[1]) / 1000;

  const translation = parseTranslationMap(payload.tlyric);
  const wordTimings = parseWordTimingMap(payload.wordLrc ?? '');
  const lines: LyricLine[] = [];
  const seen = new Set<string>();

  for (const row of raw.split(/\r?\n/)) {
    TIME_TAG.lastIndex = 0;
    const tags = [...row.matchAll(TIME_TAG)];
    if (!tags.length) continue;
    const text = stripTags(row);
    if (!text || CREDIT.test(text) || SHORT_LABEL.test(text)) continue;

    for (const tag of tags) {
      const time = Math.max(0, toSeconds(tag[1], tag[2], tag[3]) + offset);
      const key = `${time.toFixed(2)}::${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({
        key,
        time,
        text,
        translation: nearestTranslation(translation, time),
        words: nearestWords(wordTimings, time) ?? parseWords(row),
      });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatClock(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--';
  return formatTime(seconds);
}
