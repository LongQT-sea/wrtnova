#!/usr/bin/env node
// CI gate: shared logic has exactly one definition (SPEC Section 0 "Shared
// Logic: One Definition, Two Runtimes"). The collapsed functions must be
// DEFINED only in their canonical module - never re-declared in the worker or a
// UI file (which is how the two mergeNodeConfig copies diverged historically).
// Calls/references (ui.mergeNodeConfig(...), imports) are fine; only a second
// definition trips the gate.

import { readFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// fn name -> canonical module basename
const CANONICAL = {
  mergeNodeConfig: 'config-merge.mjs',
  computeAdds: 'packages.mjs',
  resolvePackages: 'packages.mjs',
  parseAdditionalPackages: 'packages.mjs',
  renderConfigBlock: 'render-config.mjs',
  shQuote: 'render-config.mjs',
  parseList: 'list-grammar.mjs',
  serializeList: 'list-grammar.mjs',
  deriveVisibility: 'visibility.mjs',
  deriveNetRows: 'visibility.mjs',
  detectVlanConflict: 'visibility.mjs',
  deriveConfig: 'builder-config.mjs',
  readForm: 'config-form.mjs',
  writeForm: 'config-form.mjs',
};

const files = [
  ...globSync('public/js/*.js', { cwd: root }),
  ...globSync('public/js/*.mjs', { cwd: root }),
  ...globSync('functions/api/**/*.js', { cwd: root }),
];

// A re-DEFINITION (a second implementation body), not a delegating alias.
// Flag: `function NAME(`, `NAME = function`, `NAME = (args) =>`, `NAME = arg =>`.
// Allow: `const NAME = ui.NAME;` (the shim binding - re-uses the one definition).
const defRe = (name) => new RegExp(
  `(\\bfunction\\s+${name}\\b)` +
  `|(\\b${name}\\s*=\\s*(?:async\\s*)?function\\b)` +
  `|(\\b${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>)` +
  `|(\\b${name}\\s*=\\s*(?:async\\s*)?[A-Za-z_$][\\w$]*\\s*=>)`
);

const violations = [];
for (const rel of files) {
  const abs = resolve(root, rel);
  const src = readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  for (const [name, canonical] of Object.entries(CANONICAL)) {
    if (basename(rel) === canonical) continue;   // the one allowed home
    const re = defRe(name);
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*')) return;
      if (re.test(line)) violations.push(`${rel}:${i + 1}: re-defines ${name} (canonical: ${canonical})`);
    });
  }
}

if (violations.length) {
  console.error('check-no-dupes: shared functions must be defined only in their canonical module:');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(`check-no-dupes: OK (${Object.keys(CANONICAL).length} shared functions, single definition each)`);
