import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearnSession } from '../src/lib/study/queue.ts';
import type { WordEntry } from '../src/lib/study/types.ts';

function entry(word: string): WordEntry {
  return { id: word, word, gloss: `n. ${word}` };
}

test('学习队列可关闭新词洗牌，保留歌曲卡优先的 deck 顺序', () => {
  const words = ['original', 'ahead', 'baby', 'believe', 'blue', 'cause'];
  const session = createLearnSession(words.map(entry), undefined, {
    groupSize: 6,
    groupLayer: 4,
    level1Count: 3,
    level2Count: 3,
    level3Count: 4,
    level4Count: 5,
    optionCount: 4,
    shuffleNewWords: false,
  });

  const served: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const card = session.next();
    assert.ok(card);
    served.push(card.entry.word);
    session.answer('know');
  }
  assert.deepEqual(served, ['original', 'ahead', 'baby']);
});
