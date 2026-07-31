#!/usr/bin/env node
// CI gate: no calls to identifiers that do not exist.
//
// jsconfig.json deliberately scopes `npm run typecheck` to the pure shared
// modules and excludes the DOM-coupled IIFE files (ui.js, build.js,
// networks.js) - see the note at the top of that file. That exclusion left a
// hole: commit e86efae deleted normalizeEndpointField() and its blur call site
// but left the call in startBuild(), so /builder threw ReferenceError on every
// Build click for five commits and the full CI chain stayed green.
//
// This gate closes only that hole. It runs the TypeScript checker over every
// JS/MJS file - including the ones jsconfig excludes - and reports a single
// diagnostic code: TS2304 "Cannot find name". Every other diagnostic is
// discarded, so the files stay untyped and the typing policy is unchanged;
// a typo'd or deleted function is all this can fail on.

import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const CANNOT_FIND_NAME = 2304;

// Vendored third-party code we do not own. bcrypt.js is a minified UMD bundle
// whose `define` / `setImmediate` probes are deliberate feature detection.
const SKIP_FILES = new Set(['public/js/bcrypt.js']);

// Globals that genuinely exist at runtime but come from outside our source:
// both are supplied by the Monaco AMD loader that advanced.js pulls from a CDN.
const EXTERNAL_GLOBALS = new Set(['monaco', 'require']);

const files = [
  ...globSync('public/js/*.js', { cwd: root }),
  ...globSync('public/js/*.mjs', { cwd: root }),
  ...globSync('public/js/i18n/*.mjs', { cwd: root }),
  ...globSync('functions/**/*.js', { cwd: root }),
]
  .filter((rel) => !SKIP_FILES.has(rel))
  .map((rel) => resolve(root, rel));

const program = ts.createProgram(files, {
  allowJs: true,
  checkJs: true,
  noEmit: true,
  strict: false,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
});

const violations = [];
for (const abs of files) {
  const sf = program.getSourceFile(abs);
  if (!sf) continue;
  for (const d of program.getSemanticDiagnostics(sf)) {
    if (d.code !== CANNOT_FIND_NAME || d.start == null) continue;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    const name = /'([^']+)'/.exec(msg)?.[1];
    if (name && EXTERNAL_GLOBALS.has(name)) continue;
    const { line } = sf.getLineAndCharacterOfPosition(d.start);
    violations.push(`${relative(root, abs)}:${line + 1}: ${msg}`);
  }
}

if (violations.length) {
  console.error('check-no-undef: references to names that do not exist:');
  for (const v of violations) console.error('  ' + v);
  console.error('  (a deleted or renamed function whose call site was left behind throws');
  console.error('   ReferenceError at runtime - fix the call, do not add it to the allowlist)');
  process.exit(1);
}
console.log(`check-no-undef: OK (${files.length} files, no undefined references)`);
