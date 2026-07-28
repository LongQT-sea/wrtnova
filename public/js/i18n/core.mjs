// English is the only statically-imported locale so it is the always-available
// fallback and the sole locale in the initial JS budget; other locales load lazily.
//
// ui.S is one stable object mutated in place (never reassigned), and English is
// seeded synchronously before any importer's body runs, so consumers that capture
// `const S = ui.S` / `const t = ui.t` at module-eval keep seeing the active locale
// after it loads and are never empty.
import { ui } from '../ui-ns.mjs';
import en from './en.mjs';

const SUPPORTED = ['zh', 'de', 'ru', 'pl', 'fr', 'es']; // non-en locales available lazily

const S = {};
Object.assign(S, en);

function t(key, vars) {
  const s = S[key];
  if (s === undefined) return key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : '{' + k + '}'));
}

ui.S = S;
ui.t = t;

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    const v = t(el.dataset.i18n);
    if (v !== el.dataset.i18n) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    const v = S[el.dataset.i18nHtml];
    if (v) el.innerHTML = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    const v = t(el.dataset.i18nPlaceholder);
    if (v !== el.dataset.i18nPlaceholder) el.placeholder = v;
  });
  // Keyed off the dataset, not the attribute: a control whose state changed
  // before the locale loaded re-translates to its current label, not the one
  // the markup shipped.
  document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    const v = t(el.dataset.i18nAria);
    if (v !== el.dataset.i18nAria) el.setAttribute('aria-label', v);
  });
}

function applyWhenReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTranslations);
  } else {
    applyTranslations();
  }
}

// English applies first so non-English users get a sub-frame text swap, not broken
// keys (the HTML defaults are already English). Falls back to English on fetch error.
async function initI18n() {
  applyWhenReady();
  const lang = (localStorage.getItem('lang') || navigator.language.slice(0, 2)).toLowerCase();
  if (!SUPPORTED.includes(lang)) return;
  try {
    const mod = await import('./' + lang + '.mjs');
    Object.assign(S, mod.default);
    applyTranslations();
  } catch {
    /* keep English fallback */
  }
}

initI18n();
