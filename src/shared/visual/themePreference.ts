export const APP_RESOLVED_THEME_PREFERENCES = ['light', 'dark'] as const;
export const APP_THEME_PREFERENCES = ['system', ...APP_RESOLVED_THEME_PREFERENCES] as const;

export type AppThemePreference = (typeof APP_THEME_PREFERENCES)[number];
export type AppResolvedThemePreference = (typeof APP_RESOLVED_THEME_PREFERENCES)[number];

export const DEFAULT_APP_RESOLVED_THEME_PREFERENCE: AppResolvedThemePreference = 'light';
export const DEFAULT_APP_THEME_PREFERENCE: AppThemePreference = DEFAULT_APP_RESOLVED_THEME_PREFERENCE;

export function isAppThemePreference(value: string): value is AppThemePreference {
  return (APP_THEME_PREFERENCES as readonly string[]).includes(value);
}

export function isAppResolvedThemePreference(value: string): value is AppResolvedThemePreference {
  return (APP_RESOLVED_THEME_PREFERENCES as readonly string[]).includes(value);
}

export function resolveAppThemePreference(value: string | null | undefined): AppThemePreference {
  return value && isAppThemePreference(value) ? value : DEFAULT_APP_THEME_PREFERENCE;
}
