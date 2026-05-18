#!/usr/bin/env node
// Regenerate functions/api/_wrtnova_template.js from wrtnova.sh.
//
// We embed only the body (everything after the '# End config section' marker)
// because the config-variable block is rendered dynamically per build from
// wrtnova_config submitted by the browser.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const sh = readFileSync(resolve(root, 'wrtnova.sh'), 'utf8');
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
