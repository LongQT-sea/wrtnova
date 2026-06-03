#!/usr/bin/env node
// Regenerate build artifacts from wrtnova.sh:
//   public/wrtnova.sh  — full script served to the browser

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
writeFileSync(resolve(root, 'public/wrtnova.sh'), sh);
console.log('Wrote public/wrtnova.sh  (' + sh.length + ' bytes)');
