#!/usr/bin/env node
// Regenerate build artifacts from wrtnova.sh:
//   functions/api/_wrtnova_template.js  — Worker import (body b64)
//   public/config-template.sh           — advanced editor pre-fill (config section)
//   public/wrtnova-body.b64             — advanced page client-side script assembly

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

const configSection = sh.slice(0, idx);
writeFileSync(resolve(root, 'public/config-template.sh'), configSection);
console.log('Wrote public/config-template.sh           (' + configSection.length + ' bytes)');

writeFileSync(resolve(root, 'public/wrtnova-body.b64'), b64);
console.log('Wrote public/wrtnova-body.b64             (' + b64.length + ' bytes)');
