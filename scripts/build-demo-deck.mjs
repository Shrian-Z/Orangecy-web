#!/usr/bin/env node
/**
 * Build the static HAA demo slice from the bundled CET4 wordbook.
 *
 * The slice is deliberately small (200 words) and only keeps entries with a
 * phonetic, a Chinese core meaning and an example sentence that contains the
 * exact target spelling. That makes the context/cloze cards honest without
 * inventing content. Source/license travel with the deck.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'public/wordbooks/cet4.json');
const TARGET = path.join(ROOT, 'src/data/demo-200.json');
const SIZE = 200;

const book = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
const good = [];

for (const entry of book.words) {
  if (!Array.isArray(entry) || entry.length < 4) continue;
  const [w, p, m, s] = entry;
  if (!w || !p || !m || !s || w.length > 18) continue;
  const english = String(s).split('||')[0];
  const re = new RegExp(`(?<![A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'i');
  if (!re.test(english)) continue;
  good.push(entry);
}

if (good.length < SIZE) throw new Error(`only ${good.length} usable words`);

const picked = Array.from({ length: SIZE }, (_, index) => {
  const at = Math.round((index * (good.length - 1)) / (SIZE - 1));
  return good[at];
});

const cards = picked.map(([w, p, m, s, syn, exam]) => {
  const card = { w, p, m, s };
  if (Array.isArray(syn) && syn.length) card.syn = syn.slice(0, 6);
  if (Array.isArray(exam) && exam.length >= 2) card.exam = [exam[0], exam[1]];
  return card;
});

const deck = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: book.source,
  license: book.license,
  name: '四级 200 词',
  tagline: 'HAA demo slice',
  count: cards.length,
  cards,
};

fs.writeFileSync(TARGET, `${JSON.stringify(deck, null, 0)}\n`);
console.log(`wrote ${cards.length} cards to ${path.relative(ROOT, TARGET)}`);
