import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';
import { createTranslator } from '../../src/shared/i18n/translate.ts';
import type { AppLocale } from '../../src/shared/i18n/locales.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const require = createRequire(import.meta.url);
function load<T = Record<string, React.ComponentType>>(path: string, dependencies: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const exported: Record<string, React.ComponentType> = {};
  new Function('require', 'exports', code)((id: string) => dependencies[id] ?? require(id), exported);
  return exported as T;
}

test('bootstrap does not register Login as the root route; recovered sessions start at Tabs', async () => {
  let account: { isBootstrapping: boolean; session: { accountId: string } | null } = {
    isBootstrapping: true,
    session: null
  };
  let cloud = { cacheAllowed: false };
  let mounts = 0;
  const Navigator = (props: { initialRouteName: string; children: React.ReactNode }) => {
    React.useEffect(() => {
      mounts++;
    }, []);
    return React.createElement('Navigator', { initialRouteName: props.initialRouteName }, props.children);
  };
  const passthrough = ({ children }: { children: React.ReactNode }) => children;
  const deps: Record<string, unknown> = {
    '@react-navigation/native-stack': { createNativeStackNavigator: () => ({ Navigator, Screen: 'Screen' }) },
    '../../core/auth/cloudAuth': { getCloudAuthSnapshot: () => cloud, subscribeCloudAuth: () => () => {} },
    '../../core/auth/accountAuth': { getAccountAuthGeneration: () => 1 },
    '../../core/auth/useAccountAuth.ts': { useAccountAuth: () => account },
    '../../core/auth/activeDesktop.ts': {
      readActiveDesktopId: () => 'desktop',
      subscribeActiveDesktop: () => () => {}
    },
    '../../features/agentTaskBoard/AgentTaskBoardProvider': { AgentTaskBoardProvider: passthrough },
    '../../features/webApps/WebAppsRuntimeProvider': { WebAppsRuntimeProvider: passthrough },
    '../../features/auth/LoginScreen': { AuthBootstrapScreen: 'Bootstrap', LoginScreen: 'Login' },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) }
  };
  for (const [path, name] of [
    ['../../features/agentTaskBoard/AgentTaskBoardFlowNavigator', 'AgentTaskBoardFlowNavigator'],
    ['../../features/chatPersistence/ChatDetailScreen', 'ChatDetailScreen'],
    ['../../features/chatPersistence/ChatDirectoryPickerOverlayScreen', 'ChatDirectoryPickerOverlayScreen'],
    ['../../features/webApps/WebAppDetailScreen', 'WebAppDetailScreen'],
    ['../screens/AgentWaitingDemoScreen', 'AgentWaitingDemoScreen'],
    ['../screens/AboutScreen', 'AboutScreen'],
    ['../screens/SettingsScreen', 'SettingsScreen'],
    ['./TabsNavigator', 'TabsNavigator']
  ])
    deps[path] = { [name]: () => null };
  const Component = load('src/app/navigation/RootNavigator.tsx', deps).RootNavigator;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(Component));
  });
  try {
    assert.equal(renderer.root.findAllByType('Bootstrap').length, 1);
    assert.equal(renderer.root.findAllByType(Navigator).length, 0);
    account = { isBootstrapping: false, session: { accountId: 'account' } };
    await act(async () => renderer.update(React.createElement(Component)));
    assert.equal(renderer.root.findByType(Navigator).props.initialRouteName, 'Tabs');
    assert.equal(mounts, 1);
    cloud = { cacheAllowed: true };
    account = { ...account, isBootstrapping: true };
    await act(async () => renderer.update(React.createElement(Component)));
    assert.equal(mounts, 1);
    assert.equal(renderer.root.findAllByType('Bootstrap').length, 0);
  } finally {
    await act(async () => renderer.unmount());
  }
});

function loginFixture(
  canGoBack: boolean,
  mode: 'account' | 'cloud' = 'account',
  brandId: 'zenmind' | 'cutej' = 'zenmind',
  locale: AppLocale = 'zh-CN'
) {
  const brand = load<typeof import('../../src/shared/generated/brand')>('src/shared/generated/brand.ts', {
    '../branding/installedBrand': { resolveInstalledBrandId: () => brandId }
  });
  const t = createTranslator(locale);
  const actions: string[] = [];
  const navigation = {
    canGoBack: () => canGoBack,
    goBack: () => actions.push('back'),
    reset: (state: { index: number; routes: { name: string }[] }) => {
      assert.deepEqual(state, { index: 0, routes: [{ name: 'Tabs' }] });
      actions.push('tabs');
    }
  };
  const Component = load('src/features/auth/LoginScreen.tsx', {
    '@react-navigation/native': { useNavigation: () => navigation, useRoute: () => ({ params: { mode } }) },
    'react-native': {
      ActivityIndicator: 'Spinner',
      Image: 'Image',
      KeyboardAvoidingView: 'View',
      Platform: { OS: 'android' },
      Pressable: 'Button',
      Text: 'Text',
      TextInput: 'Input',
      View: 'View'
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '../chatPersistence/cloudAccess': { verifyDefaultCloud: async () => 'available' },
    '../chatPersistence/accountDesktopSource': {
      activateAccountDesktopSource: async () => actions.push('select-cloud')
    },
    '../../shared/components/AppKeyboardAwareScrollView': { AppKeyboardAwareScrollView: 'Scroll' },
    '../../shared/icons/brandAssets': { brandAssets: { logo: 1 } },
    '../../shared/generated/brand': brand,
    '../../shared/i18n': { useT: () => t, useI18n: () => ({ t, locale }) },
    '../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: {} } }) },
    '../../shared/visual/className': { cn: (...values: unknown[]) => values.filter(Boolean).join(' ') },
    './EmailVerificationForm': { EmailVerificationForm: 'EmailForm' },
    './EnterpriseLogin': { EnterpriseLogin: 'SsoView' },
    '../../core/auth/authConfig': {
      ACCOUNT_LOGIN_METHOD: brand.APP_BRAND.accountLoginMethod,
      readAccountApiBaseUrl: () => 'https://account.test'
    }
  }).LoginScreen;
  return { Component, actions };
}

for (const canGoBack of [false, true]) {
  test(`Login close and account success ${canGoBack ? 'return to their caller' : 'recover a root Login into Tabs'}`, async () => {
    const f = loginFixture(canGoBack);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(f.Component));
    });
    try {
      await act(async () => renderer.root.findAllByType('Button')[0].props.onPress());
      assert.deepEqual(f.actions, [canGoBack ? 'back' : 'tabs']);
      await act(async () => renderer.root.findByType('EmailForm').props.onSuccess());
      assert.deepEqual(f.actions, [canGoBack ? 'back' : 'tabs', canGoBack ? 'back' : 'tabs']);
    } finally {
      await act(async () => renderer.unmount());
    }
  });
}

test('cloud success uses the same safe close path after selecting its source', async () => {
  const f = loginFixture(false, 'cloud');
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(f.Component));
  });
  try {
    await act(async () => renderer.root.findByType('Input').props.onChangeText('test-token'));
    await act(async () => renderer.root.findAllByType('Button').at(-1)!.props.onPress());
    assert.deepEqual(f.actions, ['select-cloud', 'tabs']);
  } finally {
    await act(async () => renderer.unmount());
  }
});

for (const brand of ['zenmind', 'cutej'] as const) {
  for (const locale of ['zh-CN', 'en-US'] as const) {
    test(`Login welcomes the installed ${brand} brand in ${locale} in both sign-in modes`, async () => {
      const name = brand === 'cutej' ? 'CuteJ' : 'ZenMind';
      for (const mode of ['account', 'cloud'] as const) {
        const f = loginFixture(false, mode, brand, locale);
        let renderer!: ReactTestRenderer;
        await act(async () => {
          renderer = create(React.createElement(f.Component));
        });
        try {
          const title = locale === 'zh-CN' ? `连接你的 ${name}` : `Connect your ${name}`;
          assert.ok(renderer.root.findAllByType('Text').some((node) => node.props.children === title));
        } finally {
          await act(async () => renderer.unmount());
        }
      }
    });
  }
}

test('installed brand selects one account UI and SSO uses the existing close path', async () => {
  for (const brand of ['zenmind', 'cutej'] as const) {
    const f = loginFixture(true, 'account', brand);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(React.createElement(f.Component));
    });
    try {
      assert.equal(renderer.root.findAllByType('EmailForm').length, brand === 'zenmind' ? 1 : 0);
      assert.equal(renderer.root.findAllByType('SsoView').length, brand === 'cutej' ? 1 : 0);
      if (brand === 'cutej') await act(async () => renderer.root.findByType('SsoView').props.onSuccess());
      assert.deepEqual(f.actions, brand === 'cutej' ? ['back'] : []);
    } finally {
      await act(async () => renderer.unmount());
    }
  }
});
