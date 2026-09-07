import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const SAMPLE_SCREEN_PATHS = [
  'src/app/screens/MeScreen.tsx',
  'src/app/screens/MeScreenParts.tsx',
  'src/app/screens/SettingsScreen.tsx'
] as const;

test('user interface sample keeps static styling on shared semantic tokens', () => {
  for (const relativePath of SAMPLE_SCREEN_PATHS) {
    const source = readSource(relativePath);

    assert.doesNotMatch(source, /#[\da-f]{3,8}/iu, `${relativePath} must not hard-code colors`);
    assert.doesNotMatch(source, /StyleSheet\.create/u, `${relativePath} must keep static styles in NativeWind classes`);
    assert.doesNotMatch(
      source,
      /brandBlueSoft|brand-blue-soft/u,
      `${relativePath} must not use the soft blue token for neutral structure`
    );
  }
});

test('Me keeps business state in the screen and delegates only presentation', () => {
  const screen = readSource('src/app/screens/MeScreen.tsx');
  const parts = readSource('src/app/screens/MeScreenParts.tsx');

  assert.match(screen, /from '\.\/MeScreenParts'/u);
  assert.match(screen, /<MeAccountHeader/u);
  assert.match(screen, /updatePreferredDeviceName\(normalizedDeviceName\)/u);
  assert.match(screen, /logoutCurrentDevice\(\)/u);
  assert.doesNotMatch(parts, /appAuth|deviceProfiles|notificationService|useAppAccess/u);
  assert.doesNotMatch(screen, /PROFILE_HERO_CLASS/u);
});

test('settings and tab navigation use neutral selection surfaces', () => {
  const settings = readSource('src/app/screens/SettingsScreen.tsx');
  const nativeTabs = readSource('src/app/navigation/TabsNavigator.native.tsx');
  const webTabs = readSource('src/app/navigation/TabsNavigator.tsx');

  assert.match(settings, /ROW_SELECTED_CLASS = 'bg-app-surface-muted'/u);
  assert.match(settings, /true: theme\.colors\.brandBlueAction/u);
  assert.match(settings, /color=\{theme\.colors\.danger\}/u);
  assert.match(nativeTabs, /tabBarActiveIndicatorColor: 'transparent'/u);
  assert.match(nativeTabs, /tabBarRippleColor: theme\.colors\.surfaceRaised/u);
  assert.doesNotMatch(nativeTabs, /brandBlueSoft/u);
  assert.match(webTabs, /backdropFilter: 'blur\(28px\)'/u);
  assert.match(webTabs, /tabBarActiveTintColor: theme\.colors\.brandBlue/u);
});
