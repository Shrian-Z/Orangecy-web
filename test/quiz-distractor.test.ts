import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuiz,
  editDistance,
  overlapsMeaning,
  phoneticForm,
  pickDistractors,
  posClass,
  soundex,
} from '../src/lib/study/quiz.ts';
import type { WordEntry } from '../src/lib/study/types.ts';

function entry(
  word: string,
  pos: string,
  meaning: string,
  phonetic = '',
  syn?: string[],
): WordEntry {
  return {
    id: word,
    word,
    gloss: `${pos}. ${meaning}`,
    phoneticUS: phonetic,
    confusables: syn,
  };
}

const rng = () => 0.42;

test('编辑距离是带上限的', () => {
  assert.equal(editDistance('adapt', 'adopt'), 1);
  assert.equal(editDistance('same', 'same'), 0);
  assert.equal(editDistance('cat', 'cats'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
});

test('Soundex 与音标归一可用', () => {
  assert.equal(soundex('philosophy').slice(1), soundex('filozofy').slice(1));
  assert.equal(soundex('right')[0], 'R');
  assert.equal(phoneticForm(entry('adapt', 'v', '适应', "/ə'dæpt/")), 'ədæpt');
  assert.equal(posClass('adj.'), 'adj');
  assert.equal(posClass('v.'), 'v');
});

test('第 1 级：优先用编辑距离 ≤ 2 的真词', () => {
  const correct = entry('adapt', 'v', '适应', "/ə'dæpt/");
  const pool = [
    entry('adopt', 'v', '采用', "/ə'dɒpt/"),
    entry('adept', 'adj', '熟练的', "/ə'dept/"),
    entry('adult', 'n', '成年人', "/'ædʌlt/"),
    entry('banana', 'n', '香蕉', "/bə'nɑːnə/"),
    entry('castle', 'n', '城堡', "/'kɑːsl/"),
    entry('dragon', 'n', '龙', "/'drægən/"),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.equal(pick.level, 1);
  assert.equal(pick.entries.length, 3);
  assert.deepEqual(
    new Set(pick.entries.map((item) => item.word)),
    new Set(['adopt', 'adept', 'adult']),
  );
  for (const item of pick.entries) {
    assert.ok(editDistance(item.word, 'adapt') <= 2);
  }
});

test('意思一样的不当干扰项', () => {
  const correct = entry('adapt', 'v', '适应');
  const pool = [
    entry('adopt', 'v', '适应'), // 和正确项同义，必须排除
    entry('adept', 'adj', '熟练的'),
    entry('adult', 'n', '成年人'),
    entry('admire', 'v', '钦佩'),
    entry('advise', 'v', '建议'),
    entry('borrow', 'v', '借'),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.ok(pick.entries.length >= 3);
  assert.ok(!pick.entries.some((item) => item.word === 'adopt'));

  assert.ok(overlapsMeaning('适应', '适应'));
  assert.ok(overlapsMeaning('书，书籍', '书籍'));
  assert.ok(!overlapsMeaning('反常的', '正常的'));
});

test('同义词表只用于排除，不用于挑选', () => {
  const correct = entry('big', 'adj', '大的', '', ['large']);
  const pool = [
    entry('large', 'adj', '大的'),
    entry('small', 'adj', '小的'),
    entry('tall', 'adj', '高的'),
    entry('wide', 'adj', '宽的'),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.ok(!pick.entries.some((item) => item.word === 'large'));
  assert.equal(pick.entries.length, 3);
});

test('第 2 级：拼写差得多但读音一样', () => {
  const correct = entry('right', 'adj', '正确的', '/raɪt/');
  const pool = [
    entry('write', 'v', '写', '/raɪt/'),
    entry('rite', 'n', '仪式', '/raɪt/'),
    entry('wright', 'n', '工匠', '/raɪt/'),
  ];

  // wright 只差一个字母，第 1 级只有 1 个，凑不满 3 个 → 整级跳过
  assert.ok(editDistance('right', 'wright') <= 2);
  assert.ok(editDistance('right', 'write') > 2);
  assert.ok(editDistance('right', 'rite') > 2);

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.equal(pick.level, 2);
  assert.equal(pick.entries.length, 3);
  for (const item of pick.entries) {
    assert.equal(phoneticForm(item), 'raɪt');
  }
});

test('第 3 级：同词性 + 长度相近', () => {
  const correct = entry('happy', 'adj', '快乐的', "/'hæpi/");
  const pool = [
    entry('brave', 'adj', '勇敢的', '/breɪv/'),
    entry('calm', 'adj', '平静的', '/kɑːm/'),
    entry('eager', 'adj', '渴望的', "/'iːgə/"),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.equal(pick.level, 3);
  assert.equal(pick.entries.length, 3);
  for (const item of pick.entries) {
    assert.ok(item.gloss?.startsWith('adj.'), `${item.word} 不是同词性`);
    assert.ok(Math.abs(item.word.length - 'happy'.length) <= 2);
  }
});

test('第 4 级：同词性但长度差得远', () => {
  const correct = entry('happy', 'adj', '快乐的', "/'hæpi/");
  const pool = [
    entry('beautiful', 'adj', '美丽的', "/'bjuːtɪfl/"),
    entry('important', 'adj', '重要的', '/ɪmˈpɔːtnt/'),
    entry('wonderful', 'adj', '精彩的', "/'wʌndəfl/"),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.equal(pick.level, 4);
  assert.equal(pick.entries.length, 3);
  for (const item of pick.entries) {
    assert.ok(Math.abs(item.word.length - 'happy'.length) > 2);
  }
});

test('第 5 级：前面几级都没有时，才用任意词', () => {
  const correct = entry('happy', 'adj', '快乐的', "/'hæpi/");
  const pool = [
    entry('elephant', 'n', '大象', "/'elɪfənt/"),
    entry('mountain', 'n', '山', "/'maʊntən/"),
    entry('umbrella', 'n', '雨伞', '/ʌmˈbrelə/'),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.equal(pick.level, 5);
  assert.equal(pick.entries.length, 3);
});

test('凑不满就少给，绝不硬凑', () => {
  const correct = entry('adapt', 'v', '适应');
  const pool = [entry('banana', 'n', '香蕉'), entry('castle', 'n', '城堡')];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.equal(pick.entries.length, 0);
  assert.equal(pick.level, null);
});

test('短词不拿「同首字母同长度」冒充形近', () => {
  const correct = entry('go', 'v', '去', '/gəʊ/');
  const pool = [
    entry('me', 'pron', '我', '/miː/'),
    entry('hi', 'int', '嗨', '/haɪ/'),
    entry('pa', 'n', '爸爸', '/pɑː/'),
  ];

  const pick = pickDistractors(correct, pool, 3, rng);
  assert.notEqual(pick.level, 1);
  for (const item of pick.entries) {
    assert.ok(editDistance(item.word, 'go') > 1);
  }
});

test('四选一：正确答案在正确位置，干扰项全部来自词库', () => {
  const correct = entry('adapt', 'v', '适应', "/ə'dæpt/");
  const pool = [
    entry('adopt', 'v', '采用', "/ə'dɒpt/"),
    entry('adept', 'adj', '熟练的', "/ə'dept/"),
    entry('adult', 'n', '成年人', "/'ædʌlt/"),
    entry('banana', 'n', '香蕉', "/bə'nɑːnə/"),
  ];

  const quiz = buildQuiz(correct, pool, 4, rng);
  assert.ok(quiz);
  assert.equal(quiz.options.length, 4);
  assert.equal(quiz.options[quiz.correctIndex].word, 'adapt');
  assert.equal(quiz.correct.meaning, '适应');

  const words = quiz.options.map((option) => option.word);
  assert.equal(new Set(words).size, 4);
  const known = new Set(['adapt', ...pool.map((item) => item.word)]);
  for (const word of words) assert.ok(known.has(word));
});
