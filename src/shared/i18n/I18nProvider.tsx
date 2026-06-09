import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { MMKV } from 'react-native-mmkv';

import {
  DEFAULT_LOCALE,
  resolveLocale,
  resolveLocalePreference,
  type AppLocale,
  type LocalePreference
} from './locales.ts';
import { createTranslator, type TFunction } from './translate.ts';

const i18nStorage = new MMKV({ id: 'zenmind-i18n' });
const LOCALE_PREFERENCE_KEY = 'locale_preference_v1';

type I18nContextValue = {
  locale: AppLocale;
  preference: LocalePreference;
  t: TFunction;
  setLocalePreference: (nextPreference: LocalePreference) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readDeviceLocale(): AppLocale {
  return resolveLocale(getLocales()[0]?.languageTag || null);
}

function readStoredLocalePreference(): LocalePreference {
  return resolveLocalePreference(i18nStorage.getString(LOCALE_PREFERENCE_KEY));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [systemLocale, setSystemLocale] = useState<AppLocale>(() => readDeviceLocale());
  const [preference, setPreference] = useState<LocalePreference>(() => readStoredLocalePreference());
  const locale = preference === 'system' ? systemLocale : preference || DEFAULT_LOCALE;

  useEffect(() => {
    if (preference !== 'system') {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      const nextLocale = readDeviceLocale();
      setSystemLocale((current) => (current === nextLocale ? current : nextLocale));
    });

    return () => subscription.remove();
  }, [preference]);

  const setLocalePreference = useCallback((nextPreference: LocalePreference) => {
    const resolvedPreference = resolveLocalePreference(nextPreference);
    if (resolvedPreference === 'system') {
      i18nStorage.delete(LOCALE_PREFERENCE_KEY);
      setSystemLocale(readDeviceLocale());
    } else {
      i18nStorage.set(LOCALE_PREFERENCE_KEY, resolvedPreference);
    }
    setPreference(resolvedPreference);
  }, []);

  const t = useMemo(() => createTranslator(locale), [locale]);
  const value = useMemo(
    () => ({
      locale,
      preference,
      t,
      setLocalePreference
    }),
    [locale, preference, setLocalePreference, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}

export function useT(): TFunction {
  return useI18n().t;
}
