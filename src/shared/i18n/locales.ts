export const DEFAULT_LOCALE = 'zh-CN' as const;

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = AppLocale | 'system';

const LANGUAGE_TO_LOCALE: Record<string, AppLocale> = {
  en: 'en-US',
  zh: 'zh-CN'
};

export function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(languageTag: string | null | undefined): AppLocale {
  const normalized = String(languageTag || '')
    .trim()
    .replace(/_/g, '-');
  if (!normalized) {
    return DEFAULT_LOCALE;
  }

  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  const language = normalized.split('-', 1)[0]?.toLowerCase();
  return LANGUAGE_TO_LOCALE[language] || DEFAULT_LOCALE;
}

export function resolveLocalePreference(value: string | null | undefined): LocalePreference {
  if (value === 'system' || (value && isSupportedLocale(value))) {
    return value;
  }
  return 'system';
}
