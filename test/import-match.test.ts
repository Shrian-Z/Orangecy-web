import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportCards, buildImportedDeck, parseWordbook } from '../src/lib/importDeck.ts';
import { lemmaForms } from '../src/lib/lemma.ts';
import { posClassesOf } from '../src/lib/pos.ts';
import type { LyricLine, Song } from '../src/types.ts';
import type { WordbookWord } from '../src/lib/wordbook.ts';

function word(w: string, m = ''): WordbookWord {
  return { w, p: '', m };
}

function song(id: string): Song {
  return {
    id,
    platform: 'netease',
    title: id,
    artists: [],
    artistText: '',
    album: '',
    cover: null,
    durationMs: 240_000,
    fee: 0,
  };
}

function lyricLines(texts: string[], step = 6): LyricLine[] {
  return texts.map((text, index) => ({
    key: `${index}:${text}`,
    time: 1 + index * step,
    text,
  }));
}

function cardsFor(words: WordbookWord[], tracks: { song: Song; lines: string[] }[]) {
  const songs = tracks.map((track) => track.song);
  const lyrics = new Map<string, LyricLine[]>();
  for (const track of tracks) lyrics.set(track.song.id, lyricLines(track.lines));
  return buildImportCards({ words, songs, lyrics });
}

test('生僻词不会因为一首歌只取前 10 个词而配不上', () => {
  const simple = [
    'apple', 'banana', 'cherry', 'daisy', 'eagle', 'forest', 'garden', 'harbor',
    'island', 'jungle', 'kitten', 'lemon', 'meadow', 'nectar', 'orange',
  ];
  const words = [...simple.map((item) => word(item, 'n. 常见词')), word('photosynthesis', 'n. 光合作用')];
  const lines = [
    ...simple.map((item) => `${item} is here today`),
    'we study photosynthesis today',
  ];

  const cards = cardsFor(words, [{ song: song('a'), lines }]);
  const matched = cards.map((card) => card.w.toLowerCase());

  assert.ok(matched.includes('photosynthesis'), '生僻词必须配上歌');
  assert.equal(cards.length, words.length, '每个词都要有卡');
});

test('连字符词是一个整词，不拆成两个', () => {
  const words = [word('hard-working', 'adj. 勤奋的')];
  const cards = cardsFor(words, [
    { song: song('a'), lines: ['nothing here', 'she is hard-working and kind'] },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].fragment?.target, 'hard-working');
  assert.equal(cards[0].fragment?.lines[0].text, 'she is hard-working and kind');
});

test('短语动词能导入，也能匹配到变形后的歌词', () => {
  const parsed = parseWordbook('give up, 放弃');
  assert.equal(parsed?.words[0]?.w, 'give up');

  const words = [word('give up', 'v. 放弃')];
  const cards = cardsFor(words, [
    { song: song('a'), lines: ['nothing here', 'he gave up his dream'] },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].fragment?.target, 'gave up');
});

test('词书只标名词时，不拿动词义项的句子', () => {
  const nounBook = [word('book', 'n. 书；书籍')];
  const cards = cardsFor(nounBook, [
    { song: song('verb'), lines: ['nothing here', 'i book a room tonight'] },
    { song: song('noun'), lines: ['nothing here', 'i read a book alone'] },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].fragment?.lines[0].text, 'i read a book alone');

  const verbBook = [word('book', 'v. 预订')];
  const verbCards = cardsFor(verbBook, [
    { song: song('verb'), lines: ['nothing here', 'i book a room tonight'] },
    { song: song('noun'), lines: ['nothing here', 'i read a book alone'] },
  ]);

  assert.equal(verbCards.length, 1);
  assert.equal(verbCards[0].fragment?.lines[0].text, 'i book a room tonight');
});

test('句中大写的人名不当成普通词', () => {
  const words = [word('rose', 'n. 玫瑰')];
  const cards = cardsFor(words, [
    { song: song('name'), lines: ['nothing here', 'i met Rose yesterday'] },
    { song: song('flower'), lines: ['nothing here', 'i saw a rose today'] },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].fragment?.lines[0].text, 'i saw a rose today');
});

test('同一句歌词可以服务多个词', () => {
  const words = [word('silver'), word('moon'), word('ocean')];
  const cards = cardsFor(words, [
    { song: song('a'), lines: ['nothing here', 'silver moon over the ocean'] },
  ]);

  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((card) => card.fragment?.start)).size, 1);
});

test('找不到句子的词退回纯词卡，不丢', () => {
  const words = [word('apple'), word('zzzznotaword')];
  const tracks = [{ song: song('a'), lines: ['nothing here', 'apple is here today'] }];
  const songs = tracks.map((track) => track.song);
  const lyrics = new Map(tracks.map((track) => [track.song.id, lyricLines(track.lines)]));
  const cards = buildImportCards({ words, songs, lyrics });
  const deck = buildImportedDeck(words, cards);

  assert.equal(cards.length, 1);
  assert.equal(deck.length, 2);
  assert.equal(deck[1].w, 'zzzznotaword');
});

test('卡片顺序：同一首歌连续 3–5 张再换歌', () => {
  const aWords = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
  const bWords = ['karate', 'lima', 'mike', 'november', 'oscar', 'papa'];
  const words = [
    ...aWords.map((item) => word(item)),
    ...bWords.map((item) => word(item)),
  ];
  const cards = cardsFor(words, [
    { song: song('a'), lines: [...aWords.map((item) => `${item} is here today`)] },
    { song: song('b'), lines: [...bWords.map((item) => `${item} is here today`)] },
  ]);

  assert.equal(cards.length, words.length);
  const runs: string[] = [];
  for (const card of cards) {
    const id = card.track?.id ?? '';
    if (runs.at(-1) !== id) runs.push(id);
  }
  assert.deepEqual(runs, ['a', 'b', 'a', 'b', 'a']);

  const lengths: number[] = [];
  let current = '';
  for (const card of cards) {
    const id = card.track?.id ?? '';
    if (id !== current) {
      current = id;
      lengths.push(1);
    } else {
      lengths[lengths.length - 1] += 1;
    }
  }
  for (const length of lengths) assert.ok(length <= 5, `单曲连播 ${length} 张，超过 5`);
});

test('词形只做同一个词换衣服，不做词根派生', () => {
  assert.ok(lemmaForms('gave').includes('give'));
  assert.ok(lemmaForms('running').includes('run'));
  assert.ok(lemmaForms('studies').includes('study'));
  assert.ok(lemmaForms('colour').includes('color'));
  assert.ok(lemmaForms('hard-working').includes('hardworking'));

  assert.ok(!lemmaForms('professional').includes('profession'), '不做词根派生');
});

test('词性解析只收词书标出的义项，人名义丢掉', () => {
  assert.deepEqual([...posClassesOf('n. 书；v. 预订')].sort(), ['noun', 'verb']);
  assert.deepEqual([...posClassesOf('adj. 能的；n. (Able)人名')], ['adj']);
  assert.deepEqual([...posClassesOf('')], []);
});
