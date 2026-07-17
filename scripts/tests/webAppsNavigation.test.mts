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

test('WebAppDetail is registered above tabs and backed by the persistent runtime provider', () => {
  const rootTypes = read('src/app/navigation/types.ts');
  const rootNavigator = read('src/app/navigation/RootNavigator.tsx');

  assert.match(rootTypes, /WebAppDetail: \{ initialAppId: string \}/);
  assert.match(rootNavigator, /<WebAppsRuntimeProvider/);
  assert.match(rootNavigator, /name="WebAppDetail"/);
});
