// The translation runtime.
//
// English is statically imported so it is always available as the fallback and
// the only locale in the initial payload; the other six are dynamic imports
// resolved once, on demand. Subscribers are notified when a locale lands, which
// is what re-renders the tree.

import { en } from './en';
import { isLocale, type Catalog, type Locale, type MessageId } from './ids';
import { KEYS } from '@core/storage';

export type { Locale, MessageId } from './ids';
export { LOCALES, isLocale } from './ids';

/** Mutated in place, never reassigned, so captured references stay valid. */
const active: Record<string, string> = { ...en };

let current: Locale = 'en';
const listeners = new Set<() => void>();

export function t(id: MessageId, vars?: Record<string, string | number>): string {
  const s = active[id];
  if (s === undefined) return id;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined ? '{' + k + '}' : String(v);
  });
}

export function locale(): Locale {
  return current;
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function detect(): Locale {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEYS.lang);
  } catch {
    /* storage disabled: fall through to the browser's preference */
  }
  const want = (stored || navigator.language || 'en').slice(0, 2).toLowerCase();
  return isLocale(want) ? want : 'en';
}

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: Catalog }>> = {
  de: () => import('./de'),
  es: () => import('./es'),
  fr: () => import('./fr'),
  pl: () => import('./pl'),
  ru: () => import('./ru'),
  zh: () => import('./zh'),
};

/**
 * Switch locale. English needs no fetch, so it applies synchronously; a failed
 * import leaves the English strings in place rather than blanking the interface.
 */
export async function setLocale(next: Locale, persist = true): Promise<void> {
  if (persist) {
    try {
      localStorage.setItem(KEYS.lang, next);
    } catch {
      /* the choice just does not survive a reload */
    }
  }
  if (next === current) return;

  if (next === 'en') {
    Object.assign(active, en);
    current = 'en';
  } else {
    try {
      const mod = await loaders[next]();
      Object.assign(active, en, mod.default);
      current = next;
    } catch {
      return;
    }
  }
  applyLangAttribute();
  for (const fn of listeners) fn();
}

/** Called once per page, before first paint of the localized tree. */
export function initI18n(): Promise<void> {
  const want = detect();
  if (want === 'en') return Promise.resolve();
  return setLocale(want, false);
}

/** Documents the language to assistive technology and to CSS. */
export function applyLangAttribute(): void {
  document.documentElement.lang = current;
}
