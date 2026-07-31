// The message-id union.
//
// It is derived from the English catalogue rather than hand-maintained, so the
// catalogue is the single list and every other locale is checked against it by
// the compiler. This replaces the three retired check-i18n-* CI scripts
// (research.md R5): a missing or misspelled key in de/es/fr/pl/ru/zh is a
// compile error, not something a grep has to catch.

import { en } from './en';

export type MessageId = keyof typeof en;

/** What every non-English catalogue must satisfy, exhaustively. */
export type Catalog = Record<MessageId, string>;

export const LOCALES = ['en', 'de', 'es', 'fr', 'pl', 'ru', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}
