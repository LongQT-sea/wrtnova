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
//   data-i18n-html        -> key-existence only (innerHTML markup is not
//                            text-comparable without a real DOM)

import { readFileSync } from 'node:fs';

const PAGES = [
  { html: 'public/index.html',          table: 'public/js/i18n-landing.js' },
  { html: 'public/builder/index.html',  table: 'public/js/i18n.js' },
  { html: 'public/networks/index.html', table: 'public/js/i18n.js' },
];

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
const stripTags = (s) => s.replace(/<[^>]*>/g, '');
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

const ATTR_RE = /data-i18n(-placeholder|-html)?="([^"]+)"/g;
const errors = [];
let checked = 0;

for (const { html: htmlPath, table } of PAGES) {
  const html = readFileSync(htmlPath, 'utf8');
  const en = extractEn(readFileSync(table, 'utf8'), table);
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
    if (kind === '-placeholder') {
      const pm = html.slice(tagStart, openEnd + 1).match(/\splaceholder="([^"]*)"/);
      if (!pm) { errors.push(`${htmlPath}: data-i18n-placeholder="${key}" but element has no placeholder attribute`); continue; }
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
