// The landing page's whole runtime.
//
// No React and no store: `/` is static prose with two preferences on it, so it
// binds the markup that is already in index.html rather than rendering it. The
// two preferences are the shared ones (theme.ts, the `lang` key), so a visitor
// who set them here arrives on /builder with them already applied, and vice
// versa.

import '@ui/tokens.css';
import { KEYS } from '@core/storage';
import { applyTheme, currentTheme, type Theme } from '@ui/theme';
import { LANDING, type LandingCatalog, type LandingId } from '@i18n/landing';

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pl: 'Polski',
  ru: 'Русский',
  zh: '中文',
};

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function detectLang(): string {
  const want = (stored(KEYS.lang) || navigator.language || 'en').slice(0, 2).toLowerCase();
  return want in LANDING ? want : 'en';
}

function apply(lang: string): void {
  const strings: LandingCatalog = LANDING[lang] ?? LANDING['en']!;
  document.documentElement.lang = lang;

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const v = strings[el.dataset['i18n'] as LandingId];
    if (v !== undefined) el.textContent = v;
  }
  // Labels that are attributes rather than text: the two icon controls.
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) {
    const v = strings[el.dataset['i18nLabel'] as LandingId];
    if (v !== undefined) {
      el.setAttribute('aria-label', v);
      el.setAttribute('title', v);
    }
  }
}

function wireTheme(): void {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const paint = (theme: Theme) => {
    // Both icons ship in the markup; only the one for the *other* theme shows,
    // which is what the button will switch to.
    btn.querySelector('.icon-sun')?.toggleAttribute('hidden', theme === 'light');
    btn.querySelector('.icon-moon')?.toggleAttribute('hidden', theme === 'dark');
  };

  paint(currentTheme());
  btn.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    paint(next);
  });
}

function wireLang(lang: string): void {
  const select = document.getElementById('lang-select');
  if (!(select instanceof HTMLSelectElement)) return;

  for (const code of Object.keys(LANDING)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = LANG_NAMES[code] ?? code;
    select.append(opt);
  }
  select.value = lang;

  select.addEventListener('change', () => {
    const next = select.value;
    try {
      localStorage.setItem(KEYS.lang, next);
    } catch {
      /* the choice just does not survive a reload */
    }
    apply(next);
  });
}

const lang = detectLang();
apply(lang);
wireTheme();
wireLang(lang);
