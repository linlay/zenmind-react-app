import { colorScheme as nativeWindColorScheme } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Appearance, useColorScheme, type ColorSchemeName } from 'react-native';
import { MMKV } from 'react-native-mmkv';

import { appThemeTokens, type AppThemeTokens } from './foundation';
import {
  DEFAULT_APP_RESOLVED_THEME_PREFERENCE,
  resolveAppThemePreference,
  type AppResolvedThemePreference,
  type AppThemePreference,
} from './themePreference';

const appThemeStorage = new MMKV({ id: 'zenmind-theme' });
const THEME_PREFERENCE_KEY = 'theme_preference_v1';

type AppThemeStyleFactory<T> = (theme: AppThemeTokens) => T;

type AppThemeContextValue = {
  theme: AppThemeTokens;
  preference: AppThemePreference;
  resolvedPreference: AppResolvedThemePreference;
  setThemePreference: (nextPreference: AppThemePreference) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const themedStyleCache = new WeakMap<
  AppThemeStyleFactory<unknown>,
  Partial<Record<AppResolvedThemePreference, unknown>>
>();

function readStoredThemePreference(): AppThemePreference {
  return resolveAppThemePreference(appThemeStorage.getString(THEME_PREFERENCE_KEY));
}

function resolveSystemThemePreference(colorScheme: ColorSchemeName): AppResolvedThemePreference {
  return colorScheme === 'dark' ? 'dark' : DEFAULT_APP_RESOLVED_THEME_PREFERENCE;
}

function resolveEffectiveThemePreference(
  preference: AppThemePreference,
  colorScheme: ColorSchemeName
): AppResolvedThemePreference {
  if (preference === 'system') {
    return resolveSystemThemePreference(colorScheme);
  }

  return preference;
}

function getCachedThemedStyles<T>(factory: AppThemeStyleFactory<T>, theme: AppThemeTokens): T {
  let cachedByPreference = themedStyleCache.get(factory as AppThemeStyleFactory<unknown>);
  if (!cachedByPreference) {
    cachedByPreference = {};
    themedStyleCache.set(factory as AppThemeStyleFactory<unknown>, cachedByPreference);
  }

  const cached = cachedByPreference[theme.preference];
  if (cached) {
    return cached as T;
  }

  const styles = factory(theme);
  cachedByPreference[theme.preference] = styles;
  return styles;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<AppThemePreference>(() => readStoredThemePreference());
  const systemColorScheme = useColorScheme() ?? Appearance.getColorScheme();
  const resolvedPreference = resolveEffectiveThemePreference(preference, systemColorScheme);
  const theme = appThemeTokens[resolvedPreference];

  useEffect(() => {
    nativeWindColorScheme.set(preference);
  }, [preference]);

  const setThemePreference = useCallback(
    (nextPreference: AppThemePreference) => {
      const resolvedPreference = resolveAppThemePreference(nextPreference);
      if (resolvedPreference === preference) {
        return;
      }

      appThemeStorage.set(THEME_PREFERENCE_KEY, resolvedPreference);
      setPreference(resolvedPreference);
    },
    [preference]
  );

  const value = useMemo(
    () => ({
      theme,
      preference,
      resolvedPreference,
      setThemePreference,
    }),
    [preference, resolvedPreference, setThemePreference, theme]
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider');
  }
  return context;
}

export function useAppThemeStyles<T>(factory: AppThemeStyleFactory<T>): T {
  const { theme } = useAppTheme();
  return useMemo(() => getCachedThemedStyles(factory, theme), [factory, theme]);
}
