// Re-render the tree when a lazily imported locale lands.
//
// The catalogue is a module-level object read synchronously by t(), so React has
// no way to know it changed. One subscription at the root is enough: the locale
// changes for the whole page or not at all.

import { useEffect, useState } from 'react';
import { subscribeLocale } from '@i18n/index';

export function useLocaleTick(): void {
  const [, tick] = useState(0);
  useEffect(() => subscribeLocale(() => tick((n) => n + 1)), []);
}
