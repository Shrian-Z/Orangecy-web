import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLrc } from '../server/lyrics.mjs';
import { indexLines } from '../server/catalog.mjs';
import { qq } from '../server/providers/qq.mjs';
import { kugou } from '../server/providers/kugou.mjs';
import { bodian } from '../server/providers/bodian.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'data', 'catalog.json');
const backup = path.join(root, 'data', 'catalog.netease.json');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const plans = [
  {
    platform: 'qq',
    provider: qq,
    seeds: [
      'Roar Katy Perry',
      'Firework Katy Perry',
      'Sugar Maroon 5',
      'All of Me John Legend',
      'A Thousand Years Christina Perri',
      'Wake Me Up Avicii',
      'The Nights Avicii',
      'Stay Justin Bieber',
      'Love Yourself Justin Bieber',
      'Shallow Lady Gaga',
    ],
  },
  {
    platform: 'kugou',
    provider: kugou,
    seeds: [],
  },
  {
    platform: 'bodian',
    provider: bodian,
    requireFull: true,
    seeds: [
      'Love Yourself Justin Bieber',
      'Shallow Lady Gaga',
      'The Nights Avicii',
      'Count on Me Bruno Mars',
      "I'm Yours Jason Mraz",
      'When I Was Your Man Bruno Mars',
    ],
  },
];

const base = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
const songs = [...base.songs];
const usedTitles = new Set(songs.map((entry) => entry.song.title.toLowerCase()));
const usedIds = new Set(songs.map((entry) => `${entry.song.platform}:${entry.song.id}`));
const perPlatformCap = 6;

for (const plan of plans) {
  const existing = songs.filter((entry) => entry.song.platform === plan.platform).length;
  if (existing >= perPlatformCap) {
    console.log(`[cross] ${plan.platform} 已有 ${existing} 首，跳过`);
    continue;
  }
  let added = 0;
  const target = Math.min(perPlatformCap - existing, 6);
  for (const seed of plan.seeds) {
    if (added >= target) break;
    let results = [];
    try {
      results = await plan.provider.search(seed, 8);
    } catch (error) {
      console.warn(`[cross] ${plan.platform} 搜索失败 ${seed}: ${error.message}`);
      continue;
    }

    for (const song of results) {
      if (song.fee !== 0) continue;
      const titleKey = song.title.toLowerCase();
      if (usedTitles.has(titleKey) || usedIds.has(`${song.platform}:${song.id}`)) continue;
      try {
        const lyric =
          plan.platform === 'qq' ? await qq.lyric(song.id) : await plan.provider.lyric(song);
        const lines = parseLrc(lyric.lrc ?? '');
        if (lines.length < 12) continue;
        const words = indexLines(lines);
        if (Object.keys(words).length < 40) continue;
        const info =
          plan.platform === 'qq'
            ? await qq.playInfo(song.id)
            : plan.platform === 'kugou'
              ? await kugou.playInfo(song)
              : await bodian.playInfo(song);
        if (!info.available) continue;
        if (plan.requireFull && info.trial) continue;
        songs.push({ song, words });
        usedTitles.add(titleKey);
        usedIds.add(`${song.platform}:${song.id}`);
        added += 1;
        console.log(`[cross] ${plan.platform} +${added} ${song.title} · ${song.artistText} · ${lines.length} 行`);
        break;
      } catch (error) {
        console.warn(`[cross] ${plan.platform} 候选失败 ${song.title}: ${error.message}`);
      }
    }
    await sleep(900);
  }
  console.log(`[cross] ${plan.platform} 完成，新增 ${added} 首`);
}

const payload = { ...base, builtAt: new Date().toISOString(), songs };
fs.writeFileSync(file, JSON.stringify(payload));
const counts = songs.reduce((acc, entry) => {
  acc[entry.song.platform] = (acc[entry.song.platform] ?? 0) + 1;
  return acc;
}, {});
console.log('[cross] 推荐池', songs.length, counts, `${Math.round(fs.statSync(file).size / 1024)}KB`);
console.log('[cross] NetEase 备份：data/catalog.netease.json');
