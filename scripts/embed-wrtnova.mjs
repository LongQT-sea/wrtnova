#!/usr/bin/env node
// Copy the canonical wrtnova.sh into the build output so the browser can fetch
// it at /wrtnova.sh.
//
// wrtnova.sh is the user's file, tracked at the repo root, and is NEVER edited
// by the build (Constitution I). This step copies it verbatim; it does not slice
// on the section marker, because the browser does that itself and the marker is
// byte-load-bearing (Constitution II).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const source = resolve(root, 'wrtnova.sh');
if (!existsSync(source)) {
  console.error('Missing canonical wrtnova.sh at repo root: ' + source);
  process.exit(1);
}

const MARKER = '# ===================\n# End config section\n# ===================\n';
const sh = readFileSync(source, 'utf8');

// Fail the build rather than ship a script the browser cannot slice.
const occurrences = sh.split(MARKER).length - 1;
if (occurrences !== 1) {
  console.error(
    'wrtnova.sh must contain the section marker exactly once, found ' + occurrences + '.',
  );
  process.exit(1);
}

const outDir = resolve(root, 'dist');
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'wrtnova.sh'), sh);
console.log('Wrote dist/wrtnova.sh  (' + sh.length + ' bytes)');
