#!/usr/bin/env node
// CI gate: checkbox off-state is '' never '0' (CLAUDE.md invariant).
// renderConfigBlock skips both '' and '0', but
// the source must never PRODUCE '0' for a boolean/checkbox in the first place.
//
// This flags the emission anti-patterns only - comparisons like `v === '0'`
// (reading) are legitimate and must not trip the gate. Scanned patterns:
//   ? '1' : '0'   /   ? '0' : '1'     boolean ternary emitting '0'
//   || '0'                            default-to-'0'
//   KEY: '0'                          config-key literal defaulting to '0'

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { globSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const files = [
  ...globSync('public/js/*.js', { cwd: root }),
  ...globSync('public/js/*.mjs', { cwd: root }),
  ...globSync('functions/api/**/*.js', { cwd: root }),
];

const PATTERNS = [
  /\?\s*'1'\s*:\s*'0'/,
  /\?\s*'0'\s*:\s*'1'/,
  /\|\|\s*'0'/,
  /\b[A-Z][A-Z0-9_]{2,}\s*:\s*'0'/,
];

const violations = [];
for (const rel of files) {
  const abs = resolve(root, rel);
  const lines = readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;   // skip comments / JSDoc
    for (const re of PATTERNS) {
      if (re.test(line)) {
        violations.push(`${rel}:${i + 1}: ${t}`);
        break;
      }
    }
  });
}

if (violations.length) {
  console.error('check-no-zero: checkbox off-state must be \'\' never \'0\'. Offending lines:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`check-no-zero: OK (no '0' off-state emission in ${files.length} files)`);
