import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('WebApps screen renders the synced catalog and gates entry on connected openable apps', () => {
  const source = read('src/features/webApps/WebAppsScreen.tsx');

  assert.match(source, /data=\{items\}/);
  assert.match(source, /connectionStatus === 'connected' && openableApps\.length > 0/);
  assert.match(source, /disabled=\{!canOpenContainer\}/);
});

test('start and pause remain a single capability-gated control without action.call', () => {
  const screen = read('src/features/webApps/WebAppsScreen.tsx');
  const gateway = read('src/features/webApps/webAppsGatewayCore.ts');

  assert.match(screen, /running \? capabilities\.pause : capabilities\.activate/);
  assert.match(screen, /disabled=\{!controlEnabled \|\| processing\}/);
  assert.doesNotMatch(screen, /startApp|pauseApp|action\.call/);
  assert.doesNotMatch(gateway, /action\.call/);
});

test('WebApps provider opens Gateway for the active authenticated session and not on tab focus', () => {
  const provider = read('src/features/webApps/WebAppsRuntimeProvider.tsx');
  const screen = read('src/features/webApps/WebAppsScreen.tsx');

  assert.match(provider, /gateway\.open\(handleSessionGatewayEvent\)/);
  assert.match(provider, /sessionGenerationRef\.current === sessionGeneration/);
  assert.match(provider, /void refresh\(\)/);
  assert.doesNotMatch(screen, /useFocusEffect|activate\(\)/);
});

test('WebApps Gateway never stops or replaces the shared WebSocket', () => {
  const adapter = read('src/features/webApps/webAppsGateway.ts');
  const core = read('src/features/webApps/webAppsGatewayCore.ts');

  assert.match(adapter, /sharedWsTransport\.subscribePush/);
  assert.match(adapter, /sharedWsTransport\.subscribeStatus/);
  assert.doesNotMatch(adapter, /sharedWsTransport\.stop/);
  assert.doesNotMatch(core, /\.stop\(/);
});
