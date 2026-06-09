import assert from 'node:assert/strict';
import test from 'node:test';

import { appThemeTokens, appVisualTokens, formatConversationTimestamp } from '../../src/shared/visual/foundation.ts';
import {
  DEFAULT_APP_RESOLVED_THEME_PREFERENCE,
  DEFAULT_APP_THEME_PREFERENCE,
  isAppResolvedThemePreference,
  resolveAppThemePreference,
} from '../../src/shared/visual/themePreference.ts';

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
  assert.equal(appVisualTokens.colors.surface, appThemeTokens.light.colors.surface);
  assert.equal(appThemeTokens.light.spacing, appThemeTokens.dark.spacing);
  assert.equal(appThemeTokens.light.radii, appThemeTokens.dark.radii);
});
