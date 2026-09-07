import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('WebApps is a first-level tab while the task tab remains hidden', () => {
  const tabTypes = read('src/app/navigation/types.ts');
  const jsTabs = read('src/app/navigation/TabsNavigator.tsx');
  const nativeTabs = read('src/app/navigation/TabsNavigator.native.tsx');

  assert.match(tabTypes, /WebApps: undefined/);
  assert.doesNotMatch(tabTypes, /Terminal: undefined/);
  assert.match(jsTabs, /name="WebApps"/);
  assert.match(nativeTabs, /name="WebApps"/);
  assert.doesNotMatch(jsTabs, /name="Terminal"/);
  assert.doesNotMatch(nativeTabs, /name="Terminal"/);
});

test('bottom tabs keep a visible navigation-level boundary on web and native surfaces', () => {
  const jsTabs = read('src/app/navigation/TabsNavigator.tsx');
  const nativeTabs = read('src/app/navigation/TabsNavigator.native.tsx');

  assert.match(jsTabs, /TAB_BAR_DIVIDER_STYLE/);
  assert.match(jsTabs, /dividerColor=\{theme\.colors\.tabBarBorder\}/);
  assert.match(nativeTabs, /backgroundColor: theme\.colors\.tabBarSurface/);
  assert.match(nativeTabs, /shadowColor: theme\.colors\.tabBarBorder/);
});

test('WebAppDetail is registered above tabs and backed by the persistent runtime provider', () => {
  const rootTypes = read('src/app/navigation/types.ts');
  const rootNavigator = read('src/app/navigation/RootNavigator.tsx');

  assert.match(rootTypes, /WebAppDetail: \{ initialAppId: string \}/);
  assert.match(rootNavigator, /<WebAppsRuntimeProvider/);
  assert.match(rootNavigator, /name="WebAppDetail"/);
});

test('pairing completion preserves tab state while WebApps resets by session identity', () => {
  const rootNavigator = read('src/app/navigation/RootNavigator.tsx');
  const runtimeProvider = read('src/features/webApps/WebAppsRuntimeProvider.tsx');

  assert.match(rootNavigator, /pairingAvailable \? \(/);
  assert.match(rootNavigator, /<WebAppsRuntimeProvider enabled=\{webAppsEnabled\} sessionKey=\{webAppsSessionKey\}>/);
  assert.doesNotMatch(rootNavigator, /<WebAppsRuntimeProvider key=/);
  assert.match(runtimeProvider, /sessionKey: string/);
  assert.match(runtimeProvider, /sessionGenerationRef/);
  assert.match(runtimeProvider, /handleSessionGatewayEvent/);
  assert.match(runtimeProvider, /handleGatewayEvent, sessionKey/);
});
