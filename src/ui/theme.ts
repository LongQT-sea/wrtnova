// The resolved theme, stamped on <html> so CSS never has to guess.
//
// Applied from the inline bootstrap in each entry HTML before first paint, so
// there is no flash of the wrong theme; this module is the same logic for the
// toggle to reuse afterwards.

import { KEYS } from '@core/storage';

export type Theme = 'light' | 'dark';

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEYS.theme);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme, persist = true): void {
  document.documentElement.dataset.theme = theme;
  if (!persist) return;
  try {
    localStorage.setItem(KEYS.theme, theme);
  } catch {
    /* the choice just does not survive a reload */
  }
}
