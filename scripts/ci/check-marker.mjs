#!/usr/bin/env node
// CI gate: the config-section marker contract. The marker
//   # ===================
//   # End config section
//   # ===================
// splits the per-build config block from the embedded wrtnova.sh body. The
// browser relies on its exact bytes (ui.js _SCRIPT_MARKER) to slice the fetched
// script. This gate fails if that constant drifts, and - when a wrtnova.sh
// artifact is present - if the script no longer contains the marker.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// Canonical marker with real newlines (as it appears in wrtnova.sh).
const MARKER = '# ===================\n# End config section\n# ===================';
// The same constant as authored in ui.js source (newlines as \n escapes).
const UI_LITERAL = "'# ===================\\n# End config section\\n# ===================\\n'";

let failed = false;

const uiPath = resolve(root, 'public/js/ui.js');
const uiSrc = readFileSync(uiPath, 'utf8');
if (!uiSrc.includes('_SCRIPT_MARKER = ' + UI_LITERAL)) {
  console.error('check-marker: public/js/ui.js _SCRIPT_MARKER does not match the canonical marker literal.');
  failed = true;
} else {
  console.log('check-marker: ui.js _SCRIPT_MARKER OK');
}

// The generated/fetched script is git-ignored; check it only when present
// (CI runs `npm run embed` first, which materializes public/wrtnova.sh).
const shCandidates = [resolve(root, 'public/wrtnova.sh'), resolve(root, 'wrtnova.sh')];
const shPath = shCandidates.find(existsSync);
if (shPath) {
  const sh = readFileSync(shPath, 'utf8');
  if (!sh.includes(MARKER)) {
    console.error(`check-marker: marker not found in ${shPath}`);
    failed = true;
  } else {
    console.log('check-marker: wrtnova.sh contains the marker OK');
  }
} else {
  console.log('check-marker: no wrtnova.sh artifact present (skipped script-body check)');
}

process.exit(failed ? 1 : 0);
