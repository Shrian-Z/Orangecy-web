const IRREGULAR = {
  was: 'be', were: 'be', been: 'be', is: 'be', are: 'be', am: 'be',
  has: 'have', had: 'have', does: 'do', did: 'do', done: 'do',
  went: 'go', gone: 'go', saw: 'see', seen: 'see', made: 'make',
  took: 'take', taken: 'take', came: 'come', got: 'get', gotten: 'get',
  said: 'say', thought: 'think', felt: 'feel', left: 'leave', knew: 'know',
  known: 'know', heard: 'hear', held: 'hold', brought: 'bring', began: 'begin',
  begun: 'begin', kept: 'keep', wrote: 'write', written: 'write', stood: 'stand',
  ran: 'run', fell: 'fall', fallen: 'fall', sent: 'send', built: 'build',
  understood: 'understand', led: 'lead', met: 'meet', paid: 'pay', sat: 'sit',
  spoke: 'speak', spoken: 'speak', lay: 'lie', lain: 'lie', lost: 'lose',
  found: 'find', gave: 'give', given: 'give', told: 'tell', became: 'become',
  shown: 'show', chose: 'choose', chosen: 'choose', broke: 'break',
  broken: 'break', spent: 'spend', grew: 'grow', grown: 'grow', drew: 'draw',
  drawn: 'draw', drove: 'drive', driven: 'drive', ate: 'eat', eaten: 'eat',
  sang: 'sing', sung: 'sing', wore: 'wear', worn: 'wear', won: 'win',
  flew: 'fly', flown: 'fly', threw: 'throw', thrown: 'throw', caught: 'catch',
  taught: 'teach', fought: 'fight', bought: 'buy', slept: 'sleep', meant: 'mean',
  rose: 'rise', risen: 'rise', shook: 'shake', shaken: 'shake', stole: 'steal',
  stolen: 'steal', hid: 'hide', hidden: 'hide', bit: 'bite', bitten: 'bite',
  blew: 'blow', blown: 'blow', drank: 'drink', drunk: 'drink', swam: 'swim',
  swum: 'swim', rang: 'ring', rung: 'ring', torn: 'tear', tore: 'tear',
};

export function lemmaCandidates(surface) {
  const word = surface.toLowerCase();
  const list = new Set([word]);
  const push = (value) => {
    if (value.length > 1) list.add(value);
  };

  if (IRREGULAR[word]) push(IRREGULAR[word]);
  if (word.endsWith("'s")) push(word.slice(0, -2));
  if (word.endsWith('ies')) push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ves')) {
    push(`${word.slice(0, -3)}f`);
    push(`${word.slice(0, -3)}fe`);
  }
  if (word.endsWith('es')) push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) push(word.slice(0, -1));
  if (word.endsWith('ied')) push(`${word.slice(0, -3)}y`);
  if (word.endsWith('ed')) {
    push(word.slice(0, -2));
    push(word.slice(0, -1));
    const stem = word.slice(0, -2);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) push(stem.slice(0, -1));
  }
  if (word.endsWith('ing')) {
    const stem = word.slice(0, -3);
    push(stem);
    push(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) push(stem.slice(0, -1));
  }
  if (word.endsWith('ly')) push(word.slice(0, -2));
  if (word.endsWith('er')) {
    push(word.slice(0, -2));
    push(word.slice(0, -1));
  }
  if (word.endsWith('est')) {
    push(word.slice(0, -3));
    push(word.slice(0, -2));
  }
  return [...list];
}
