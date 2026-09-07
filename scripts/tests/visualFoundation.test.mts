import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { appThemeTokens, appVisualTokens, formatConversationTimestamp } from '../../src/shared/visual/foundation.ts';
import { cn } from '../../src/shared/visual/className.ts';
import {
  DEFAULT_APP_RESOLVED_THEME_PREFERENCE,
  DEFAULT_APP_THEME_PREFERENCE,
  isAppResolvedThemePreference,
  resolveAppThemePreference
} from '../../src/shared/visual/themePreference.ts';

const require = createRequire(import.meta.url);
const tailwindConfig = require('../../tailwind.config.js');

test('formats chat list timestamps by day and year boundaries', () => {
  const now = new Date(2026, 4, 28, 12, 0).getTime();

  assert.equal(formatConversationTimestamp(new Date(2026, 4, 28, 8, 5).getTime(), now), '08:05');
  assert.equal(formatConversationTimestamp(new Date(2026, 4, 21, 8, 5).getTime(), now), '05-21');
  assert.equal(formatConversationTimestamp(new Date(2025, 11, 21, 8, 5).getTime(), now), '2025-12');
  assert.equal(formatConversationTimestamp(0, now), '');
});

test('resolves app theme preference safely', () => {
  assert.equal(DEFAULT_APP_THEME_PREFERENCE, 'light');
  assert.equal(DEFAULT_APP_RESOLVED_THEME_PREFERENCE, 'light');
  assert.equal(isAppResolvedThemePreference('system'), false);
  assert.equal(isAppResolvedThemePreference('dark'), true);
  assert.equal(resolveAppThemePreference('system'), 'system');
  assert.equal(resolveAppThemePreference('light'), 'light');
  assert.equal(resolveAppThemePreference('dark'), 'dark');
  assert.equal(resolveAppThemePreference(null), 'light');
});

test('light and dark theme tokens keep the same semantic color keys', () => {
  assert.deepEqual(Object.keys(appThemeTokens.light.colors).sort(), Object.keys(appThemeTokens.dark.colors).sort());
  assert.equal(appThemeTokens.light.preference, 'light');
  assert.equal(appThemeTokens.dark.preference, 'dark');
  assert.equal(appThemeTokens.light.isDark, false);
  assert.equal(appThemeTokens.dark.isDark, true);
  assert.notEqual(appThemeTokens.light.colors.surface, appThemeTokens.dark.colors.surface);
  assert.notEqual(appThemeTokens.light.colors.tabBarSurface, appThemeTokens.dark.colors.tabBarSurface);
  assert.notEqual(appThemeTokens.light.colors.tabBarBorder, appThemeTokens.dark.colors.tabBarBorder);
  assert.notEqual(appThemeTokens.light.colors.tabBarBorder, appThemeTokens.light.colors.lineStrong);
  assert.notEqual(appThemeTokens.dark.colors.tabBarBorder, appThemeTokens.dark.colors.lineStrong);
  assert.match(appThemeTokens.light.colors.tabBarSurface, /^rgba\(/);
  assert.match(appThemeTokens.dark.colors.tabBarSurface, /^rgba\(/);
  assert.equal(appVisualTokens.colors.surface, appThemeTokens.light.colors.surface);
  assert.equal(appThemeTokens.light.spacing, appThemeTokens.dark.spacing);
  assert.equal(appThemeTokens.light.radii, appThemeTokens.dark.radii);
  assert.equal(appThemeTokens.light.fontSizes, appThemeTokens.dark.fontSizes);
  assert.equal(appThemeTokens.light.colors.background, '#fafafb');
  assert.equal(appThemeTokens.light.colors.backgroundMuted, '#f5f6f7');
  assert.equal(appThemeTokens.light.colors.surfaceMuted, '#f1f2f4');
  assert.equal(appThemeTokens.light.colors.textPrimary, '#1b1d21');
  assert.equal(appThemeTokens.light.colors.textSecondary, '#666b73');
  assert.equal(appThemeTokens.light.colors.line, '#e7e8eb');
  assert.equal(appThemeTokens.light.colors.tabBarSurface, 'rgba(250, 250, 251, 0.94)');
  assert.equal(appThemeTokens.light.colors.tabBarBorder, '#d9dbe0');
  assert.equal(appThemeTokens.dark.colors.background, '#101114');
  assert.equal(appThemeTokens.dark.colors.backgroundMuted, '#141518');
  assert.equal(appThemeTokens.dark.colors.surfaceMuted, '#202126');
  assert.equal(appThemeTokens.dark.colors.textPrimary, '#f1f2f4');
  assert.equal(appThemeTokens.dark.colors.textSecondary, '#b5b8bf');
  assert.equal(appThemeTokens.dark.colors.line, '#2b2d31');
  assert.equal(appThemeTokens.dark.colors.tabBarSurface, 'rgba(24, 25, 28, 0.94)');
  assert.equal(appThemeTokens.dark.colors.tabBarBorder, '#34373d');
});

test('tailwind config exposes shared visual token aliases', () => {
  assert.equal(tailwindConfig.darkMode, 'class');
  assert.equal(tailwindConfig.theme.extend.colors.app.background, 'rgb(var(--color-app-background) / <alpha-value>)');
  assert.equal(
    tailwindConfig.theme.extend.colors.app.overlay,
    'rgb(var(--color-app-overlay) / var(--color-app-overlay-alpha))'
  );
  assert.equal(
    tailwindConfig.theme.extend.colors.app['tab-bar-surface'],
    'rgb(var(--color-app-tab-bar-surface) / var(--color-app-tab-bar-surface-alpha))'
  );
  assert.equal(
    tailwindConfig.theme.extend.colors.app['tab-bar-border'],
    'rgb(var(--color-app-tab-bar-border) / <alpha-value>)'
  );
  assert.equal(tailwindConfig.theme.extend.spacing['app-md'], `${appVisualTokens.spacing.md}px`);
  assert.equal(tailwindConfig.theme.extend.borderRadius['app-pill'], `${appVisualTokens.radii.pill}px`);
  assert.deepEqual(tailwindConfig.theme.extend.fontSize['app-body'], [
    `${appVisualTokens.fontSizes.body.fontSize}px`,
    { lineHeight: `${appVisualTokens.fontSizes.body.lineHeight}px` }
  ]);
  assert.ok(tailwindConfig.plugins.length > 0);
});

test('cn joins stable class name branches', () => {
  assert.equal(cn('flex-1', false, null, undefined, 'bg-app-background'), 'flex-1 bg-app-background');
  assert.equal(cn('', 'text-app-primary'), 'text-app-primary');
});
