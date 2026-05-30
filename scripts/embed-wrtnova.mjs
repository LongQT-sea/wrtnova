#!/usr/bin/env node
// Regenerate build artifacts from wrtnova.sh:
//   functions/api/_wrtnova_template.js  — Worker import (body b64)
//   public/wrtnova.sh                   — full script served to the advanced editor

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const REMOTE_URL = 'https://raw.githubusercontent.com/LongQT-sea/wrtnova/main/wrtnova.sh';
const localPath  = resolve(root, 'wrtnova.sh');

let sh;
if (existsSync(localPath)) {
  sh = readFileSync(localPath, 'utf8');
  console.log('Using local wrtnova.sh');
} else {
  console.log('Fetching wrtnova.sh from ' + REMOTE_URL + ' ...');
  const res = await fetch(REMOTE_URL);
  if (!res.ok) { console.error('Fetch failed: ' + res.status); process.exit(1); }
  sh = await res.text();
  console.log('Fetched ' + sh.length + ' bytes');
}
const marker = '# ===================\n# End config section\n# ===================\n';
const idx = sh.indexOf(marker);
if (idx < 0) {
  console.error('Could not find end-of-config marker in wrtnova.sh');
  process.exit(1);
}
const body = sh.slice(idx + marker.length);
const b64  = Buffer.from(body, 'utf8').toString('base64');

const out = [
  '// AUTO-GENERATED from wrtnova.sh — do NOT edit by hand.',
  '// Regenerate with:  node scripts/embed-wrtnova.mjs',
  '//',
  "// Body = everything after the '# End config section' delimiter in wrtnova.sh,",
  '// base64-encoded to avoid template-literal escaping pain.',
  '',
  'export const WRTNOVA_BODY_B64 = "' + b64 + '";',
  '',
].join('\n');

writeFileSync(resolve(root, 'functions/api/_wrtnova_template.js'), out);
console.log('Wrote functions/api/_wrtnova_template.js  (' + body.length + ' bytes body)');

writeFileSync(resolve(root, 'public/wrtnova.sh'), sh);
console.log('Wrote public/wrtnova.sh                   (' + sh.length + ' bytes)');
