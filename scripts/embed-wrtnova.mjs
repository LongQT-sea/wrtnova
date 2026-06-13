#!/usr/bin/env node
// Regenerate build artifacts from wrtnova.sh:
//   public/wrtnova.sh  -- full script served to the browser
//
// wrtnova.sh is the canonical, tracked source at the repo root (CLAUDE.md
// invariant). This step copies it verbatim into public/ (git-ignored) so the
// browser can fetch it. It writes exactly one file and does not slice on the
// marker - the browser does that itself.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const localPath = resolve(root, 'wrtnova.sh');
if (!existsSync(localPath)) {
  console.error('Missing canonical wrtnova.sh at repo root: ' + localPath);
  process.exit(1);
}
const sh = readFileSync(localPath, 'utf8');
writeFileSync(resolve(root, 'public/wrtnova.sh'), sh);
console.log('Wrote public/wrtnova.sh  (' + sh.length + ' bytes)');
