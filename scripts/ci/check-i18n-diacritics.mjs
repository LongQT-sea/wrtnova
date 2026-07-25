// Catches machine-translated strings that dropped their diacritics -
// "contrasena", "Schluessel", "wlacz", "systemes". Three separate batches of
// these reached the locale files, and nothing noticed: every other i18n check
// compares keys or compares a page's default against `en`, and a misspelling is
// none of those. It renders, it is just wrong in a way only a native reader
// sees.
//
// The detector needs no dictionary of its own. Each locale file already spells
// most of its words correctly, so those spellings ARE the dictionary: collect
// every word in the file that carries a diacritic, strip the accents, and flag
// any bare word elsewhere in the same file that matches. "für" appearing once
// is what makes a stray "fur" detectable.
//
// That beats a denylist of known-bad spellings, which only ever catches the
// mistakes already made - this catches transliterations nobody has seen yet, of
// any word the file happens to use correctly somewhere.
//
// The cost is minimal pairs: French "la"/"là" and Polish "nazwa"/"nazwą" are
// both real words, so the bare form is not evidence of anything. Those are
// listed per locale in ALLOW below. Add to it only for a word that genuinely
// exists unaccented too - never to silence a real misspelling.
//
// German needs a second mechanism. Its transliteration is ue/oe/ae, not a
// dropped accent, so folding "fuer" never yields "für" and the dictionary pass
// is blind to it - it missed "fuer Systeme" while catching the other three
// locales on the same line. DENY below covers that: exact words, checked
// literally. It only finds transliterations already listed, which is why it is
// the fallback and not the main event.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../../public/js/i18n/', import.meta.url);
const SKIP = new Set(['core.mjs', 'en.mjs']);   // en has no diacritics to compare against

// Bare forms that are real words in their own right, so the accented twin in
// the same file proves nothing about them.
const ALLOW = {
  // a (verb) / à, des / dès, la / là, ou / où, and verb forms whose past
  // participle is the accented one: active/activé, ajoute/ajouté, compile/compilé.
  fr: ['a', 'des', 'la', 'ou', 'active', 'ajoute', 'charge', 'compile', 'utilise', 'cote'],
  // Case inflection: nazwa/nazwą, kompilacja/kompilacją, nowa/nową are all
  // nominative-vs-instrumental pairs; ze/że are different words entirely.
  pl: ['nazwa', 'kompilacja', 'kompilacje', 'nowa', 'ze'],
  // esta (demonstrative) / está (verb).
  es: ['esta'],
  // все (all) / всё (everything) and функции / функций (case) are separate
  // words; Russian also routinely writes е for ё, so this pass is noisy there.
  ru: ['все', 'функции'],
  de: [],
  zh: [],
};

// Transliterations no amount of accent-folding can spot, because the bare form
// is not the accented form with its marks removed. German only, for now.
const DENY = {
  de: [
    'fuer', 'ueber', 'koennen', 'muessen', 'groesse', 'aendern', 'waehlen',
    'zurueck', 'loeschen', 'schluessel', 'zusaetzlich', 'vollstaendig',
    'ungueltig', 'gueltig', 'naechste', 'moeglich', 'geraete', 'geraet',
    'benoetigen', 'benoetigt', 'hinzuzufuegen', 'hinzufuegen', 'ausgefuehrt',
    'ausfuehren', 'passworter', 'passwoerter', 'affinitaets', 'verfuegbar',
    'urspruenglich', 'erhoehen', 'standardmaessig', 'schliessen', 'groesser',
  ],
};

const SPECIAL = { 'ß': 'ss', 'ł': 'l', 'ø': 'o', 'æ': 'ae', 'œ': 'oe' };

const fold = (w) =>
  [...w.toLowerCase()]
    .map((c) => SPECIAL[c] ?? c)
    .join('')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '');

const hasDiacritic = (w) => fold(w) !== w.toLowerCase();
const words = (s) => s.match(/\p{L}+/gu) ?? [];

let failed = 0;
let scanned = 0;

for (const file of readdirSync(DIR).sort()) {
  if (!file.endsWith('.mjs') || SKIP.has(file)) continue;
  const loc = file.replace(/\.mjs$/, '');
  const allow = new Set(ALLOW[loc] ?? []);
  const lines = readFileSync(join(DIR.pathname, file), 'utf8').split('\n');

  // key: 'value',  |  key: "value",
  const entries = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(\w+):\s*(['"])(.*)\2,\s*$/);
    if (m) entries.push({ line: i + 1, key: m[1], value: m[3] });
  });

  // Build this locale's own dictionary of correctly-accented forms.
  const accented = new Map();
  for (const { value } of entries) {
    for (const w of words(value)) {
      if (!hasDiacritic(w)) continue;
      const k = fold(w);
      if (!accented.has(k)) accented.set(k, new Set());
      accented.get(k).add(w);
    }
  }

  const deny = new Set(DENY[loc] ?? []);
  const hits = [];
  for (const { line, key, value } of entries) {
    for (const w of words(value)) {
      const lower = w.toLowerCase();
      if (deny.has(lower)) {
        hits.push(`    ${file}:${line} ${key}: "${w}" - transliterated, needs its umlaut`);
        continue;
      }
      if (hasDiacritic(w) || allow.has(lower)) continue;
      const correct = accented.get(lower);
      if (correct) hits.push(`    ${file}:${line} ${key}: "${w}" - this file spells it "${[...correct].sort().join('" / "')}"`);
    }
  }

  scanned++;
  if (hits.length) {
    failed += hits.length;
    console.error(`  ${loc}: ${hits.length} string(s) missing diacritics`);
    console.error(hits.join('\n'));
  }
}

if (failed) {
  console.error(`\ncheck-i18n-diacritics: FAIL (${failed} word(s))`);
  console.error('Fix the spelling. If the bare form is genuinely a separate word,');
  console.error('add it to ALLOW in scripts/ci/check-i18n-diacritics.mjs with a reason.');
  process.exit(1);
}

console.log(`check-i18n-diacritics: OK (${scanned} locales, no dropped diacritics)`);
