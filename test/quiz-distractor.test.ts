import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildQuiz,
  distractorSource,
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

  // wright 只差一个字母，第 1 级只有它。留下它，再用同音的 write / rite 补满。
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

test('干扰项池优先用当前词书，会话队列只是还没加载时的退路', () => {
  const book = ['adapt', 'adopt', 'adept', 'adult'];
  const session = ['adapt', 'banana', 'castle'];
  assert.equal(distractorSource(book, session), book);
  assert.deepEqual([...distractorSource(null, session)], session);
  assert.deepEqual([...distractorSource(undefined, session)], session);
  assert.deepEqual([...distractorSource([], session)], session);
});

function bookSizedFiller(count: number): WordEntry[] {
  return Array.from({ length: count }, (_, index) =>
    entry(
      `zz${String(index).padStart(4, '0')}qqqq`,
      index % 2 === 0 ? 'n' : 'v',
      `无关${index}`,
    ),
  );
}

test('整本词书规模的池子仍优先形近词，不拿无关词充数', () => {
  const filler = bookSizedFiller(3500);
  const lookalikes = [
    entry('adopt', 'v', '采用', "/ə'dɒpt/"),
    entry('adept', 'adj', '熟练的', "/ə'dept/"),
    entry('adult', 'n', '成年人', "/'ædʌlt/"),
    entry('accent', 'n', '口音', '/ˈæksent/'),
    entry('except', 'prep', '除了', '/ɪkˈsept/'),
    entry('access', 'n', '通道', '/ˈækses/'),
    entry('defect', 'n', '缺陷', '/ˈdiːfekt/'),
    entry('aspect', 'n', '方面', '/ˈæspekt/'),
    entry('effect', 'n', '影响', '/ɪˈfekt/'),
  ];
  const pool = [...filler.slice(0, 800), ...lookalikes, ...filler.slice(800)];

  const adapt = pickDistractors(entry('adapt', 'v', '适应', "/ə'dæpt/"), pool, 3, rng);
  assert.equal(adapt.level, 1);
  assert.deepEqual(
    new Set(adapt.entries.map((item) => item.word)),
    new Set(['adopt', 'adept', 'adult']),
  );
  for (const item of adapt.entries) assert.ok(editDistance(item.word, 'adapt') <= 2);

  const accept = pickDistractors(entry('accept', 'v', '接受', '/əkˈsept/'), pool, 3, rng);
  assert.equal(accept.level, 1);
  assert.ok(accept.entries.some((item) => item.word === 'accent'));
  assert.ok(accept.entries.some((item) => item.word === 'except' || item.word === 'access'));
  for (const item of accept.entries) {
    assert.ok(editDistance(item.word, 'accept') <= 2);
    assert.equal(item.word.startsWith('zz'), false);
  }

  // effect 和 affect 的中文都有「影响」，必须排除；剩下的形近词不够 3 个也要留下。
  const affect = pickDistractors(entry('affect', 'v', '影响', '/əˈfekt/'), pool, 3, rng);
  const affectWords = affect.entries.map((item) => item.word);
  assert.equal(affect.entries.length, 3);
  assert.equal(affectWords.includes('effect'), false);
  assert.equal(affectWords.includes('defect'), true);
  assert.equal(affectWords.includes('aspect'), true);
});

test('更近的形近词不会被同级里更远的词挤掉', () => {
  const correct = entry('adapt', 'v', '适应');
  const pool = [
    entry('adopt', 'v', '采用'),
    entry('adept', 'adj', '熟练的'),
    entry('adult', 'n', '成年人'),
    entry('admit', 'v', '承认'),
    entry('apart', 'adv', '分开'),
    entry('await', 'v', '等待'),
  ];

  for (let seed = 1; seed <= 24; seed += 1) {
    const roll = () => ((seed * 17) % 100) / 100;
    const pick = pickDistractors(correct, pool, 3, roll);
    assert.equal(pick.level, 1);
    assert.ok(pick.entries.some((item) => item.word === 'adopt'));
    for (const item of pick.entries) assert.ok(editDistance(item.word, 'adapt') <= 2);
  }
});

test('四级词书全表：adapt / accept 的干扰项是形近词的中文释义', () => {
  const file = fileURLToPath(new URL('../public/wordbooks/cet4.json', import.meta.url));
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    words: Array<
      [
        string,
        string,
        string,
        string | null,
        string[] | null,
        [string, string] | null,
      ]
    >;
  };
  const pool: WordEntry[] = raw.words.map((row) => ({
    id: row[0],
    word: row[0],
    phoneticUS: row[1],
    gloss: row[2],
    confusables: Array.isArray(row[4]) ? row[4] : undefined,
  }));
  assert.ok(pool.length > 3000);

  const byWord = new Map(pool.map((item) => [item.word.toLowerCase(), item]));
  const adapt = byWord.get('adapt');
  const accept = byWord.get('accept');
  const affect = byWord.get('affect');
  assert.ok(adapt && accept && affect);

  const adaptPick = pickDistractors(adapt, pool, 3, rng);
  assert.equal(adaptPick.level, 1);
  assert.equal(adaptPick.entries.length, 3);
  assert.ok(adaptPick.entries.some((item) => item.word.toLowerCase() === 'adopt'));
  for (const item of adaptPick.entries) {
    assert.ok(editDistance(item.word, 'adapt') <= 2);
    assert.equal(overlapsMeaning('适应', item.gloss ?? ''), false);
  }

  const acceptPick = pickDistractors(accept, pool, 3, rng);
  assert.equal(acceptPick.level, 1);
  assert.deepEqual(
    new Set(acceptPick.entries.map((item) => item.word.toLowerCase())),
    new Set(['accent', 'except', 'access']),
  );

  const affectPick = pickDistractors(affect, pool, 3, rng);
  const affectWords = affectPick.entries.map((item) => item.word.toLowerCase());
  assert.equal(affectWords.includes('effect'), false);
  assert.equal(affectWords.includes('defect'), true);
  assert.equal(affectWords.includes('aspect'), true);
  const quiz = buildQuiz(accept, pool, 4, rng);
  assert.ok(quiz);
  assert.equal(quiz.options.length, 4);
  assert.equal(quiz.promptWord, 'accept');
  assert.equal(quiz.options[quiz.correctIndex].meaning.length > 0, true);
  for (const option of quiz.options) {
    assert.equal(/[\u4e00-\u9fff]/.test(option.meaning), true);
  }
});
