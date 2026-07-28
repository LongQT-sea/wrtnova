// Gate: every data-i18n* key in the HTML must exist in that page's `en` locale
// table, and the HTML default text/placeholder must match en[key] exactly.
//
// Why: the HTML default and the en string are the same English text written
// twice (the HTML default is the no-JS / pre-render fallback; the en table is
// what t() returns and the reference translators work from). They can silently
// drift apart. This gate keeps them in sync.
//
// Coverage:
//   data-i18n             -> compare element text content to en[key]  (strict)
//   data-i18n-placeholder -> compare the placeholder attribute        (strict)
//   data-i18n-aria        -> compare the aria-label attribute         (strict)
//   data-i18n-html        -> key-existence only (innerHTML markup is not
//                            text-comparable without a real DOM)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGES = [
  { html: 'public/index.html',          table: 'public/js/i18n-landing.js' },
  { html: 'public/builder/index.html',  table: 'public/js/i18n/en.mjs' },
  { html: 'public/networks/index.html', table: 'public/js/i18n/en.mjs' },
];

// Two paths because i18n-landing.js still inlines `const locales = {...}` (needs
// brace-matching) while the split locale files just export the table as a default.
async function loadEn(file) {
  if (file.endsWith('.mjs')) {
    const mod = await import(pathToFileURL(resolve(file)).href);
    if (!mod.default) throw new Error(`${file}: no default export`);
    return mod.default;
  }
  return extractEn(readFileSync(file, 'utf8'), file);
}

// ---- pull the `en` object out of a module source (no browser eval) ----
function extractEn(src, file) {
  const at = src.indexOf('const locales = {');
  if (at < 0) throw new Error(`${file}: 'const locales = {' not found`);
  const start = src.indexOf('{', at);
  let depth = 0, str = null, esc = false, line = false, block = false, end = -1;
  for (let i = start; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (esc) { esc = false; continue; }
    if (str) {
      if (c === '\\') esc = true;
      else if (c === str) str = null;
      continue;
    }
    if (line) { if (c === '\n') line = false; continue; }
    if (block) { if (c === '*' && n === '/') { block = false; i++; } continue; }
    if (c === '/' && n === '/') { line = true; i++; continue; }
    if (c === '/' && n === '*') { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { str = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error(`${file}: could not match the locales object braces`);
  let obj;
  try { obj = new Function('return (' + src.slice(start, end) + ')')(); }
  catch (e) { throw new Error(`${file}: failed to evaluate locales literal: ${e.message}`); }
  if (!obj.en) throw new Error(`${file}: no 'en' locale found`);
  return obj.en;
}

function decodeEntities(s) {
  return s
    .replace(/&rarr;/g, '→').replace(/&larr;/g, '←')
    .replace(/&hellip;/g, '…').replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ')
    .replace(/&times;/g, '×')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
// Strip tags repeatedly until stable: a single pass can leave a tag behind
// when removal of one re-forms another (e.g. "<<a>script>" -> "<script>").
const stripTags = (s) => {
  let prev;
  do { prev = s; s = s.replace(/<[^>]*>/g, ''); } while (s !== prev);
  return s;
};
const norm = (s) => decodeEntities(s).replace(/\s+/g, ' ').trim();

// index of the '>' that closes the opening tag starting at `from` (quote-aware)
function openTagEnd(html, from) {
  let q = null;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '>') return i;
  }
  return -1;
}

// inner content of element `tag` whose opening tag ends at `openEnd` (handles nesting)
function innerContent(html, tag, openEnd) {
  const re = new RegExp(`<${tag}(?=[\\s/>])|</${tag}\\s*>`, 'gi');
  re.lastIndex = openEnd + 1;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { if (--depth === 0) return html.slice(openEnd + 1, m.index); }
    else depth++;
  }
  return null;
}

const ATTR_RE = /data-i18n(-placeholder|-html|-aria)?="([^"]+)"/g;

// kind -> the HTML attribute whose value must equal en[key]
const ATTR_OF = { '-placeholder': 'placeholder', '-aria': 'aria-label' };

const errors = [];
let checked = 0;

for (const { html: htmlPath, table } of PAGES) {
  const html = readFileSync(htmlPath, 'utf8');
  const en = await loadEn(table);
  let m;
  while ((m = ATTR_RE.exec(html))) {
    const kind = m[1] || '';          // '', '-placeholder', '-html'
    const key = m[2];
    const tagStart = html.lastIndexOf('<', m.index);
    const tagName = (html.slice(tagStart + 1).match(/^[a-zA-Z][\w-]*/) || [''])[0];
    const openEnd = openTagEnd(html, tagStart);

    if (!(key in en)) {
      errors.push(`${htmlPath}: data-i18n${kind}="${key}" has no '${key}' in ${table} (en)`);
      continue;
    }
    if (kind === '-html') { checked++; continue; } // existence only

    let actual;
    const attr = ATTR_OF[kind];
    if (attr) {
      const pm = html.slice(tagStart, openEnd + 1).match(new RegExp(`\\s${attr}="([^"]*)"`));
      if (!pm) { errors.push(`${htmlPath}: data-i18n${kind}="${key}" but element has no ${attr} attribute`); continue; }
      actual = norm(pm[1]);
    } else {
      const inner = innerContent(html, tagName, openEnd);
      if (inner === null) { errors.push(`${htmlPath}: could not find closing </${tagName}> for data-i18n="${key}"`); continue; }
      actual = norm(stripTags(inner));
    }
    const expected = norm(en[key]);
    if (actual !== expected) {
      errors.push(`${htmlPath}: data-i18n${kind}="${key}" drift\n    HTML: ${JSON.stringify(actual)}\n    en:   ${JSON.stringify(expected)}`);
    }
    checked++;
  }
}

if (errors.length) {
  console.error('check-i18n-html: FAIL\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`check-i18n-html: OK (${checked} data-i18n defaults match en across ${PAGES.length} pages)`);
