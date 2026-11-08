/**
 * 词形还原：把一个歌词里出现的 surface 还原成词书里可能的词头。
 *
 * 只做「同一个词换了衣服」：
 *   - 时态 / 三单 / 复数 / 比较级 / 副词
 *   - 英式 ↔ 美式拼写（colour / color，realise / realize）
 *   - 连字符（hard-working 是一个整词，不拆成 hard + working）
 *
 * 故意不做词根派生，也不做同义词：profession 不能拿去配 professional。
 * 这个文件不依赖任何其它模块，浏览器、Node 测试和脚本都能直接用。
 */

const IRREGULAR: Record<string, string> = {
  // be / have / do
  was: 'be', were: 'be', been: 'be', is: 'be', are: 'be', am: 'be', being: 'be',
  has: 'have', had: 'have', having: 'have',
  does: 'do', did: 'do', done: 'do', doing: 'do',
  // irregular verbs
  arose: 'arise', arisen: 'arise',
  awoke: 'awake', awoken: 'awake',
  bore: 'bear', borne: 'bear', born: 'bear',
  beat: 'beat', beaten: 'beat',
  became: 'become', become: 'become',
  began: 'begin', begun: 'begin',
  bent: 'bend', bet: 'bet',
  bit: 'bite', bitten: 'bite',
  bled: 'bleed',
  blew: 'blow', blown: 'blow',
  broke: 'break', broken: 'break',
  bred: 'breed',
  brought: 'bring', built: 'build', burnt: 'burn', burst: 'burst',
  bought: 'buy', cast: 'cast', caught: 'catch',
  chose: 'choose', chosen: 'choose',
  clung: 'cling', came: 'come', cost: 'cost', crept: 'creep', cut: 'cut',
  dealt: 'deal', dug: 'dig', dived: 'dive', dove: 'dive',
  drew: 'draw', drawn: 'draw',
  dreamt: 'dream', dreamed: 'dream',
  drank: 'drink', drunk: 'drink',
  drove: 'drive', driven: 'drive',
  dwelt: 'dwell', ate: 'eat', eaten: 'eat',
  fell: 'fall', fallen: 'fall', fed: 'feed', felt: 'feel',
  fought: 'fight', found: 'find', fled: 'flee',
  flew: 'fly', flown: 'fly',
  forbade: 'forbid', forbidden: 'forbid',
  forgot: 'forget', forgotten: 'forget',
  forgave: 'forgive', forgiven: 'forgive',
  froze: 'freeze', frozen: 'freeze',
  got: 'get', gotten: 'get',
  gave: 'give', given: 'give',
  went: 'go', gone: 'go', goes: 'go',
  ground: 'grind', grew: 'grow', grown: 'grow',
  hung: 'hang', heard: 'hear', hid: 'hide', hidden: 'hide',
  hit: 'hit', held: 'hold', hurt: 'hurt',
  kept: 'keep', knelt: 'kneel', knew: 'know', known: 'know',
  laid: 'lay', led: 'lead', leant: 'lean', leapt: 'leap', learnt: 'learn',
  left: 'leave', lent: 'lend', let: 'let',
  lay: 'lie', lain: 'lie',
  lit: 'light', lost: 'lose',
  made: 'make', meant: 'mean', met: 'meet', paid: 'pay',
  put: 'put', read: 'read',
  rode: 'ride', ridden: 'ride',
  rang: 'ring', rung: 'ring',
  rose: 'rise', risen: 'rise',
  ran: 'run',
  said: 'say',
  saw: 'see', seen: 'see',
  sought: 'seek', sold: 'sell', sent: 'send', set: 'set',
  sewed: 'sew', sewn: 'sew',
  shook: 'shake', shaken: 'shake',
  shed: 'shed', shone: 'shine', shot: 'shoot',
  showed: 'show', shown: 'show',
  shrank: 'shrink', shrunk: 'shrink',
  shut: 'shut',
  sang: 'sing', sung: 'sing',
  sank: 'sink', sunk: 'sink',
  sat: 'sit', slept: 'sleep', slid: 'slide', slung: 'sling',
  spoke: 'speak', spoken: 'speak',
  sped: 'speed', spelt: 'spell', spent: 'spend', spilt: 'spill',
  spun: 'spin', spat: 'spit', split: 'split', spread: 'spread',
  sprang: 'spring', sprung: 'spring',
  stood: 'stand',
  stole: 'steal', stolen: 'steal',
  stuck: 'stick', stung: 'sting', stank: 'stink', stunk: 'stink',
  strode: 'stride',
  struck: 'strike', stricken: 'strike',
  strung: 'string',
  strove: 'strive', striven: 'strive',
  swore: 'swear', sworn: 'swear',
  swept: 'sweep', swelled: 'swell', swollen: 'swell',
  swam: 'swim', swum: 'swim',
  swung: 'swing',
  took: 'take', taken: 'take',
  taught: 'teach', tore: 'tear', torn: 'tear',
  told: 'tell', thought: 'think',
  threw: 'throw', thrown: 'throw',
  thrust: 'thrust', trod: 'tread', trodden: 'tread',
  underwent: 'undergo', undergone: 'undergo',
  understood: 'understand',
  undertook: 'undertake', undertaken: 'undertake',
  woke: 'wake', woken: 'wake',
  wore: 'wear', worn: 'wear',
  wove: 'weave', woven: 'weave',
  wept: 'weep', won: 'win', wound: 'wind',
  withdrew: 'withdraw', withdrawn: 'withdraw',
  wrote: 'write', written: 'write',
  wrung: 'wring',
};

const IRREGULAR_PLURAL: Record<string, string> = {
  children: 'child', men: 'man', women: 'woman', feet: 'foot', teeth: 'tooth',
  geese: 'goose', mice: 'mouse', lice: 'louse', oxen: 'ox', people: 'person',
  criteria: 'criterion', phenomena: 'phenomenon',
  analyses: 'analysis', bases: 'basis', crises: 'crisis', theses: 'thesis',
  hypotheses: 'hypothesis', data: 'datum', media: 'medium', bacteria: 'bacterium',
  curricula: 'curriculum', indices: 'index', appendices: 'appendix',
  matrices: 'matrix', vertices: 'vertex', axes: 'axis',
};

const IRREGULAR_COMPARATIVE: Record<string, string> = {
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
  further: 'far', furthest: 'far', farther: 'far', farthest: 'far',
  less: 'little', least: 'little',
};

/** 去掉引号、统一弯引号，只留下小写字母 / 撇号 / 连字符。 */
export function normalizeSurface(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^a-z'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 英式 / 美式拼写归一。只改长度足够的后缀，避免把 four → for、your → yor
 * 这类短词卷进来；两边用同一个函数，所以对称、不会单向丢词。
 */
export function spellingKey(word: string): string {
  let key = word;
  if (key.length >= 6) {
    key = key.replace(/isation(s?)$/, 'ization$1');
    key = key.replace(/ise(d|s|r|rs|ing)?$/, 'ize$1');
    key = key.replace(/yse(d|s|r|rs|ing)?$/, 'yze$1');
  }
  if (key.length >= 5) {
    key = key.replace(/our(s?)$/, 'or$1');
    key = key.replace(/ogue(s?)$/, 'og$1');
    key = key.replace(/tre(s?)$/, 'ter$1');
    key = key.replace(/mme(s?)$/, 'm$1');
  }
  return key;
}

function addDouble(stem: string, push: (value: string) => void) {
  if (stem.length > 2 && stem.at(-1) === stem.at(-2)) push(stem.slice(0, -1));
}

/**
 * surface 所有可能的词头形式，按「越像原形越靠前」排序。
 * 例如 running → [running, runn, runne, run]；
 *      gave    → [gave, give]；
 *      colour  → [colour, color]。
 */
export function lemmaForms(raw: string): string[] {
  const surface = normalizeSurface(raw);
  if (!surface) return [];

  const out: string[] = [];
  const push = (value: string) => {
    if (value.length > 1 && !out.includes(value)) out.push(value);
  };
  const add = (value: string) => {
    push(value);
    const key = spellingKey(value);
    if (key !== value) push(key);
  };

  add(surface);

  const bases = new Set<string>([surface]);
  const contraction = surface.replace(/n't$/, '').replace(/'(s|re|ve|ll|d|m)$/, '');
  if (contraction !== surface) bases.add(contraction);
  if (surface.includes('-')) {
    const joined = surface.replace(/-/g, '');
    bases.add(joined);
    add(joined);
  }

  for (const base of [...bases]) {
    const irregular =
      IRREGULAR[base] ?? IRREGULAR_PLURAL[base] ?? IRREGULAR_COMPARATIVE[base];
    if (irregular) add(irregular);

    if (base.endsWith("'s")) add(base.slice(0, -2));
    if (base.endsWith('ies')) add(`${base.slice(0, -3)}y`);
    if (base.endsWith('ves')) {
      add(`${base.slice(0, -3)}f`);
      add(`${base.slice(0, -3)}fe`);
    }
    if (base.endsWith('men')) add(`${base.slice(0, -3)}man`);
    if (base.endsWith('es')) add(base.slice(0, -2));
    if (base.endsWith('s') && !base.endsWith('ss')) add(base.slice(0, -1));

    if (base.endsWith('iest')) add(`${base.slice(0, -4)}y`);
    if (base.endsWith('ier')) add(`${base.slice(0, -3)}y`);
    if (base.endsWith('ied')) add(`${base.slice(0, -3)}y`);

    if (base.endsWith('ed')) {
      const stem = base.slice(0, -2);
      add(stem);
      add(base.slice(0, -1));
      addDouble(stem, push);
    }
    if (base.endsWith('ing')) {
      const stem = base.slice(0, -3);
      add(stem);
      add(`${stem}e`);
      addDouble(stem, push);
    }

    if (base.endsWith('ily')) add(`${base.slice(0, -3)}y`);
    if (base.endsWith('ly')) {
      add(base.slice(0, -2));
      add(`${base.slice(0, -2)}e`);
    }

    if (base.endsWith('est')) {
      add(base.slice(0, -3));
      add(base.slice(0, -2));
      addDouble(base.slice(0, -3), push);
    }
    if (base.endsWith('er')) {
      const stem = base.slice(0, -2);
      add(stem);
      add(base.slice(0, -1));
      addDouble(stem, push);
    }
  }

  return out;
}
