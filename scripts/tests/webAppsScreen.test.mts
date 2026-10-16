import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import type { ComponentType, ReactNode } from 'react';
import type { WebAppItem } from '../../src/features/webApps/types.ts';

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

test('catalog failures stay distinct from empty results and preserve existing apps during recovery', async () => {
  const React = await import('react');
  const { act, create } = await import('react-test-renderer');
  const { transformSync } = await import('@babel/core');
  const { createRequire } = await import('node:module');
  const { defaultT } = await import('../../src/shared/i18n/translate.ts');
  const { INITIAL_WEB_APPS_RUNTIME_STATE, webAppsRuntimeReducer } =
    await import('../../src/features/webApps/webAppsRuntimeModel.ts');
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let state = INITIAL_WEB_APPS_RUNTIME_STATE;
  let refreshCount = 0;
  const refresh = () => {
    refreshCount += 1;
  };
  const mocks: Record<string, unknown> = {
    '../../core/auth/useAccountAuth': { useAccountAuth: () => ({ session: { accountId: 'account' } }) },
    '@shopify/flash-list': {
      FlashList: ({
        data,
        renderItem,
        ListHeaderComponent,
        ListEmptyComponent,
        ...props
      }: {
        data: readonly WebAppItem[];
        renderItem: (input: { item: WebAppItem }) => ReactNode;
        ListHeaderComponent: ReactNode;
        ListEmptyComponent: ReactNode;
      }) =>
        React.createElement(
          'List',
          props,
          ListHeaderComponent,
          data.length
            ? data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item })))
            : ListEmptyComponent
        )
    },
    '@react-navigation/native': { useNavigation: () => ({ navigate() {} }) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Button', ActivityIndicator: 'Spinner' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '../../shared/components/ScreenHeader': { ScreenHeader: 'Header' },
    '../../shared/icons/AppIcon': { AppIcon: 'Icon' },
    '../../shared/i18n': { useT: () => defaultT },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: { brandBlue: 'blue' } } }) },
    '../../shared/visual/className': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
    '../../shared/visual/foundation': { appVisualTokens: { spacing: { xl: 16 } } },
    '../../shared/visual/hairline': { appHairlineStyles: {} },
    '../../shared/visual/useAppTabBarHeight': { useAppTabBarHeight: () => 50 },
    './WebAppsRuntimeProvider': {
      useWebAppsRuntime: () => ({
        ...state,
        enabled: true,
        openableApps: [],
        capabilities: { activate: false, pause: false },
        refresh,
        prepareDetail: () => null
      })
    }
  };
  const code = transformSync(read('src/features/webApps/WebAppsScreen.tsx'), {
    filename: 'WebAppsScreen.tsx',
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  const exports: { WebAppsScreen?: ComponentType } = {};
  const require = createRequire(import.meta.url);
  new Function('require', 'exports', code)((id: string) => mocks[id] ?? require(id), exports);
  const Screen = exports.WebAppsScreen!;
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Screen));
  });
  const texts = () => renderer.root.findAllByType('Text').map((node) => node.props.children);
  const occurrences = (key: Parameters<typeof defaultT>[0]) => texts().filter((text) => text === defaultT(key)).length;
  const update = async (action: Parameters<typeof webAppsRuntimeReducer>[1]) => {
    state = webAppsRuntimeReducer(state, action);
    await act(async () => renderer.update(React.createElement(Screen)));
  };
  const error = { code: 'desktop-unavailable' as const, message: 'Desktop internal error' };
  const catalog = { desktopDeviceId: 'desktop', tunnelConnected: true, generatedAt: '2026-10-16T07:00:00Z', items: [] };
  try {
    assert.equal(occurrences('webApps.loading'), 1);
    assert.equal(occurrences('webApps.emptyBody'), 0);
    await update({ type: 'sync.failed', error });
    assert.equal(occurrences('webApps.loadFailed'), 1);
    assert.equal(occurrences('webApps.error.desktop-unavailable'), 1);
    assert.equal(occurrences('webApps.pullToRetry'), 1);
    assert.equal(occurrences('webApps.emptyBody'), 0);
    await act(async () => renderer.root.findByType('List').props.onRefresh());
    assert.equal(refreshCount, 1);
    await update({ type: 'sync.started' });
    assert.equal(occurrences('webApps.loading'), 1);
    assert.equal(occurrences('webApps.emptyBody'), 0);
    await update({ type: 'snapshot.received', catalog });
    assert.equal(occurrences('webApps.emptyBody'), 1);
    const item = {
      id: 'app',
      name: 'Existing app',
      order: 0,
      createdAt: 1,
      updatedAt: 2,
      runtimeStatus: 'stopped' as const,
      publishStatus: 'ready' as const,
      availability: 'webapp-stopped' as const
    };
    await update({ type: 'snapshot.received', catalog: { ...catalog, items: [item] } });
    await update({ type: 'sync.started' });
    await update({ type: 'sync.failed', error });
    assert.ok(texts().includes(item.name));
    assert.equal(occurrences('webApps.error.desktop-unavailable'), 1);
    assert.equal(occurrences('webApps.loadFailed'), 0);
    await update({ type: 'snapshot.received', catalog: { ...catalog, items: [item] } });
    assert.ok(texts().includes(item.name));
    assert.equal(occurrences('webApps.error.desktop-unavailable'), 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});
