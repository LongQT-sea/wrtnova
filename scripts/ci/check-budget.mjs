#!/usr/bin/env node
// CI gate: initial byte budget (SPEC Section 0 NFR "Byte budget").
//
// CSS is enforced at the NFR ceiling (15 KB gzipped) - it passes comfortably
// today. JS is RATCHETED: the SPEC target is 30 KB gzipped initial JS, but the
// shipping app is ~2x over that, dominated by i18n.js (7 locales) and
// networks.js. Cutting it in half is a perf refactor out of scope for the
// typing/tests/CI branch, so this gate instead locks JS at a ceiling just above
// today's measured size to prevent further growth. Tighten JS_CEILING_KB toward
// 30 as i18n/networks are slimmed in a future perf branch.

import { readFileSync, existsSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const CSS_NFR_KB = 15;       // hard NFR - enforced
const JS_TARGET_KB = 30;     // SPEC NFR target - documented, not yet met
const JS_CEILING_KB = 81;    // ratchet: current worst page ~80.4 KB (/networks, after the
                             // WG Interface/Peer sections + off-notice i18n); no growth past this

const PAGES = {
  builder: 'public/builder/index.html',
  networks: 'public/networks/index.html',
};

const gz = (abs) => gzipSync(readFileSync(abs)).length;

// Resolve the transitive STATIC relative-import graph (.js + .mjs) of a module
// entry. Follows both `import ... from './x'` and side-effect `import './x'`;
// ignores dynamic import() and absolute specifiers (e.g. import('/js/history.js'),
// lazy-loaded, not initial payload).
function moduleGraph(entryAbs, seen = new Set()) {
  if (seen.has(entryAbs) || !existsSync(entryAbs)) return seen;
  seen.add(entryAbs);
  const src = readFileSync(entryAbs, 'utf8');
  const dir = dirname(entryAbs);
  const res = [
    /(?:import|export)[^'"]*\sfrom\s*['"](\.\.?\/[^'"]+\.m?js)['"]/g,  // ... from './x'
    /import\s+['"](\.\.?\/[^'"]+\.m?js)['"]/g,                          // side-effect import './x'
  ];
  for (const re of res) { let m; while ((m = re.exec(src))) moduleGraph(resolve(dir, m[1]), seen); }
  return seen;
}

// All JS files an initial page load pulls in. type="module" tags are graph roots
// (follow their static import graph); classic scripts (defer) are single files.
function pageJsFiles(htmlRel) {
  const html = readFileSync(resolve(root, htmlRel), 'utf8');
  const files = new Set();
  const re = /<script([^>]*)\ssrc="(\/js\/[^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const abs = resolve(root, 'public', m[2].replace(/^\//, ''));
    if (/\stype="module"/.test(m[1])) for (const f of moduleGraph(abs)) files.add(f);
    else files.add(abs);
  }
  return [...files];
}

let failed = false;

// --- CSS (enforced at NFR) ---
const cssPath = resolve(root, 'public/style.css');
if (!existsSync(cssPath)) {
  console.error('check-budget: public/style.css missing - run `npm run build:css` first.');
  failed = true;
} else {
  const cssKb = gz(cssPath) / 1024;
  const ok = cssKb <= CSS_NFR_KB;
  console.log(`check-budget: CSS ${cssKb.toFixed(1)} KB gz (NFR ${CSS_NFR_KB} KB) ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) failed = true;
}

// --- JS per page (ratcheted) ---
for (const [name, htmlRel] of Object.entries(PAGES)) {
  const files = pageJsFiles(htmlRel);
  const bytes = files.reduce((n, f) => n + gz(f), 0);
  const kb = bytes / 1024;
  const ok = kb <= JS_CEILING_KB;
  const note = kb > JS_TARGET_KB ? ` (over ${JS_TARGET_KB} KB SPEC target)` : '';
  console.log(`check-budget: JS ${name} ${kb.toFixed(1)} KB gz, ${files.length} files, ceiling ${JS_CEILING_KB} KB ${ok ? 'OK' : 'FAIL'}${note}`);
  if (!ok) failed = true;
}

process.exit(failed ? 1 : 0);
