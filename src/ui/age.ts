// Plain-language age, in the terms the catalogue already has.

import { t } from '@i18n/index';

export function age(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  return t('daysAgo', { n: days });
}
