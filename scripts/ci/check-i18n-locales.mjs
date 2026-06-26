// Locales are merged onto the English baseline at runtime (Object.assign), so a
// missing key silently falls back to English and an extra key is dead weight. This
// gate catches both (every public/js/i18n/ file must match en.mjs's key set).

import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '..', '..', 'public/js/i18n');

const localeFiles = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs') && f !== 'core.mjs');

const load = async (f) => (await import(pathToFileURL(resolve(dir, f)).href)).default;

const en = await load('en.mjs');
const enKeys = Object.keys(en);
const enSet = new Set(enKeys);

const errors = [];
for (const f of localeFiles) {
  if (f === 'en.mjs') continue;
  const table = await load(f);
  const keys = Object.keys(table);
  const keySet = new Set(keys);
  const missing = enKeys.filter((k) => !keySet.has(k));
  const extra = keys.filter((k) => !enSet.has(k));
  if (missing.length) errors.push(`${f}: missing ${missing.length} key(s): ${missing.join(', ')}`);
  if (extra.length) errors.push(`${f}: has ${extra.length} extra key(s): ${extra.join(', ')}`);
}

if (errors.length) {
  console.error('check-i18n-locales: FAIL\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`check-i18n-locales: OK (${localeFiles.length} locales, ${enKeys.length} keys each)`);
