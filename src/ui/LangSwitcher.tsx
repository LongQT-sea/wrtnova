import { useState } from 'react';
import { LOCALES, locale, setLocale, t, type Locale } from '@i18n/index';

const NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pl: 'Polski',
  ru: 'Русский',
  zh: '中文',
};

export function LangSwitcher() {
  const [value, setValue] = useState<Locale>(() => locale());

  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{t('langLabel')}</span>
      <select
        className="input w-auto py-1 text-xs"
        value={value}
        aria-label={t('langLabel')}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setValue(next);
          void setLocale(next);
        }}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
