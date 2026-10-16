import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ts from 'typescript';

import * as overlayState from '../../src/features/chatPersistence/chatDirectoryPickerOverlayState.ts';
import * as listState from '../../src/features/chatPersistence/chatRealtimeUiState.ts';
import type { ChatDirectorySyncSnapshot, ChatSyncEvent } from '../../src/features/chatRealtime/types.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync('src/features/chatPersistence/ChatDirectoryPickerOverlayScreen.tsx', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
).outputText;
type Item = { id: string };
type Page = { items: Item[]; total: number; page: number };
type DrawerProps = {
  status: overlayState.DirectoryPickerStatus;
  items: Item[];
  total: number;
  loadingMore: boolean;
  onRetry(): void;
  onLoadMore(): Promise<void>;
  onClose(): void;
};

function fixture() {
  let scope = 'desktop_a';
  let offline = false;
  let snapshot: ChatDirectorySyncSnapshot = { sourceKey: scope, scopeId: scope, status: 'loading', error: '' };
  let read = async (page: number, _size: number): Promise<Page> => ({ items: [], total: 0, page });
  let refreshes = 0;
  const scopeListeners = new Set<() => void>();
  const sourceListeners = new Set<() => void>();
  const syncListeners = new Set<(event: ChatSyncEvent) => void>();
  const subscriptions = (listeners: Set<() => void>) => (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const Drawer = (props: DrawerProps) => React.createElement('Drawer', props);
  const deps: Record<string, unknown> = {
    react: React,
    'react-native': { View: 'View' },
    '../../shared/i18n': { useT: () => (key: string) => key },
    '../../core/auth/useAccountAuth': { useAccountAuth: () => ({ session: { accountId: 'account' } }) },
    '../../core/auth/activeDesktop': {
      readActiveDesktopId: () => scope,
      subscribeActiveDesktop: subscriptions(sourceListeners),
      isActiveDesktopOffline: () => offline
    },
    './cacheScope': { getChatCacheScopeId: () => scope, subscribeChatCacheScope: subscriptions(scopeListeners) },
    './chatSourceRuntime': { getActiveChatSource: () => (scope === 'signed_out' ? null : { key: scope }) },
    './chatDirectoryPickerOverlayState': overlayState,
    './chatRealtimeUiState': listState,
    './chatRepository': { getChatDirectoryCatalogPage: (page: number, size: number) => read(page, size) },
    './accountDesktopSource': { refreshAccountDesktopDirectory: async () => ({ items: [] }) },
    './chatDetailNavigation': {},
    './chatDetailPrefetch': {},
    './components/AccountSourceSheet': { AccountSourceSheet: () => null },
    './components/ChatDirectoryPickerDrawer': { ChatDirectoryPickerDrawer: Drawer },
    '../chatRealtime/chatSyncService': {
      chatSyncService: {
        getDirectorySyncSnapshot: () => snapshot,
        subscribe: (listener: (event: ChatSyncEvent) => void) => {
          syncListeners.add(listener);
          return () => syncListeners.delete(listener);
        },
        refreshHome: async () => {
          refreshes++;
        }
      }
    }
  };
  const exported: { ChatDirectoryPickerOverlayScreen?: React.ComponentType<{ navigation: object }> } = {};
  new Function('require', 'exports', compiled)((id: string) => deps[id] ?? require(id), exported);
  const emit = (type: 'home.directory.replace' | 'home.directory.sync') => {
    syncListeners.forEach((listener) => listener({ type }));
  };
  let renderer: ReactTestRenderer;
  return {
    mount: async () => {
      await act(async () => {
        renderer = create(
          React.createElement(exported.ChatDirectoryPickerOverlayScreen!, {
            navigation: { addListener: () => () => {}, goBack() {} }
          })
        );
      });
    },
    unmount: async () => {
      await act(async () => renderer.unmount());
    },
    props: () => renderer.root.findByType(Drawer).props as DrawerProps,
    setRead: (fn: typeof read) => {
      read = fn;
    },
    sync: (status: ChatDirectorySyncSnapshot['status']) => {
      snapshot = { ...snapshot, status };
      emit('home.directory.sync');
    },
    replace: () => emit('home.directory.replace'),
    switchScope: (next: string) => {
      scope = next;
      snapshot = { sourceKey: next, scopeId: next, status: 'loading', error: '' };
      scopeListeners.forEach((listener) => listener());
      sourceListeners.forEach((listener) => listener());
      emit('home.directory.sync');
    },
    setOffline: () => {
      offline = true;
      sourceListeners.forEach((listener) => listener());
    },
    refreshes: () => refreshes,
    listeners: () => scopeListeners.size + sourceListeners.size + syncListeners.size
  };
}

test('empty cache stays loading, receives the remote replacement and releases subscriptions on close', async () => {
  const f = fixture();
  await f.mount();
  try {
    assert.equal(f.props().status, 'loading');
    assert.equal(f.props().items.length, 0);
    f.setRead(async () => ({ items: [{ id: 'new-agent' }], total: 1, page: 1 }));
    await act(async () => {
      f.replace();
      f.sync('ready');
    });
    assert.equal(f.props().status, 'ready');
    assert.deepEqual(
      f.props().items.map((item) => item.id),
      ['new-agent']
    );
  } finally {
    await f.unmount();
  }
  assert.equal(f.listeners(), 0);
  await f.mount();
  assert.equal(f.props().status, 'ready');
  assert.equal(f.props().items[0].id, 'new-agent');
  await f.unmount();
  assert.equal(f.listeners(), 0);
});

test('a failed first local read after switching scopes shows retry instead of an endless loading state', async () => {
  const f = fixture();
  await f.mount();
  try {
    f.setRead(async () => {
      throw new Error('database unavailable');
    });
    await act(async () => {
      f.switchScope('desktop_b');
      f.sync('ready');
    });
    assert.equal(f.props().status, 'error');
    f.setRead(async () => ({ items: [], total: 0, page: 1 }));
    await act(async () => f.props().onRetry());
    assert.equal(f.props().status, 'ready');
    assert.equal(f.props().items.length, 0);
    assert.equal(f.refreshes(), 0);
  } finally {
    await f.unmount();
  }
});

test('cached rows survive syncing and failure; retry uses the existing refresh entry', async () => {
  const f = fixture();
  f.setRead(async () => ({ items: [{ id: 'cached' }], total: 1, page: 1 }));
  await f.mount();
  try {
    assert.equal(f.props().status, 'syncing');
    await act(async () => f.sync('error'));
    assert.equal(f.props().status, 'error');
    assert.equal(f.props().items[0].id, 'cached');
    await act(async () => f.props().onRetry());
    assert.equal(f.refreshes(), 1);
    await act(async () => f.setOffline());
    assert.equal(f.props().status, 'offline');
    assert.equal(f.props().items[0].id, 'cached');
  } finally {
    await f.unmount();
  }
});

test('replacement refreshes the loaded range and ignores an older pending pagination result', async () => {
  const f = fixture();
  f.setRead(async () => ({ items: [{ id: 'a' }], total: 40, page: 1 }));
  await f.mount();
  try {
    await act(async () => f.sync('ready'));
    f.setRead(async () => ({ items: [{ id: 'b' }], total: 40, page: 2 }));
    await act(async () => f.props().onLoadMore());
    let release!: (page: Page) => void;
    f.setRead(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = f.props().onLoadMore();
    });
    const calls: [number, number][] = [];
    f.setRead(async (page, size) => {
      calls.push([page, size]);
      return { items: [{ id: 'replacement' }], total: 1, page: 1 };
    });
    await act(async () => f.replace());
    assert.deepEqual(calls, [[1, 36]]);
    await act(async () => {
      release({ items: [{ id: 'stale' }], total: 40, page: 3 });
      await pending;
    });
    assert.deepEqual(
      f.props().items.map((item) => item.id),
      ['replacement']
    );
    assert.equal(f.props().total, 1);
    assert.equal(f.props().loadingMore, false);
  } finally {
    await f.unmount();
  }
});

test('switching sources hides prior rows and totals immediately and ignores late local results', async () => {
  const f = fixture();
  f.setRead(async () => ({ items: [{ id: 'old' }], total: 40, page: 1 }));
  await f.mount();
  try {
    let release!: (page: Page) => void;
    f.setRead(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    await act(async () => f.replace());
    f.setRead(async () => ({ items: [], total: 0, page: 1 }));
    await act(async () => f.switchScope('desktop_b'));
    assert.equal(f.props().total, 0);
    assert.equal(f.props().status, 'loading');
    await act(async () => release({ items: [{ id: 'late-old' }], total: 40, page: 1 }));
    assert.equal(f.props().items.length, 0);
    await act(async () => f.sync('ready'));
    assert.equal(f.props().status, 'ready');
    await act(async () => f.switchScope('signed_out'));
    assert.equal(f.props().status, 'unselected');
  } finally {
    await f.unmount();
  }
});

test('drawer renders a loader, retry, cache sync and offline feedback; only ready may render empty', async () => {
  const code = ts.transpileModule(
    readFileSync('src/features/chatPersistence/components/ChatDirectoryPickerDrawer.tsx', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }
  ).outputText;
  const animation = () => ({ start() {}, stop() {} });
  const deps: Record<string, unknown> = {
    react: React,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      Pressable: 'Pressable',
      Text: 'Text',
      View: 'View',
      useWindowDimensions: () => ({ width: 390 }),
      Animated: {
        Value: class {
          setValue() {}
        },
        View: 'AnimatedView',
        spring: animation,
        timing: animation
      },
      Easing: { out: (fn: unknown) => fn, cubic() {} }
    },
    '@shopify/flash-list': {
      FlashList: (props: { data: Item[]; ListEmptyComponent: React.ReactNode }) =>
        React.createElement(
          'List',
          null,
          props.data.length ? props.data.map((item) => item.id).join(',') : props.ListEmptyComponent
        )
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/icons/AppIcon': { AppIcon: 'Icon' },
    '../../../shared/i18n': { useT: () => (key: string) => key },
    '../../../shared/visual/AgentAvatar': { AgentAvatar: 'Avatar' },
    '../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors: { brandBlue: '#007aff' } } }) },
    '../../../shared/visual/className': { cn: (...values: string[]) => values.filter(Boolean).join(' ') },
    '../../../shared/visual/foundation': { appVisualTokens: { spacing: { xs: 4, md: 16 } } },
    '../../../shared/visual/hairline': { appHairlineStyles: {} },
    '../chatDirectoryPickerOverlayState': overlayState
  };
  const exported: { ChatDirectoryPickerDrawer?: React.ComponentType<object> } = {};
  new Function('require', 'exports', code)((id: string) => deps[id] ?? require(id), exported);
  let retries = 0;
  const onRetry = () => {
    retries++;
  };
  const props = { visible: true, items: [], total: 0, loadingMore: false, errorText: '', onRetry };
  let renderer!: ReactTestRenderer;
  const render = async (status: overlayState.DirectoryPickerStatus, items: Item[] = []) => {
    await act(async () => {
      const element = React.createElement(exported.ChatDirectoryPickerDrawer!, { ...props, status, items });
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
    return JSON.stringify(renderer.toJSON());
  };
  try {
    assert.match(await render('loading'), /directoryPicker.status.loading/);
    assert.equal(renderer.root.findAllByType('ActivityIndicator').length, 1);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /directoryPicker.empty/);
    assert.match(await render('error'), /directoryPicker.status.error/);
    await act(async () => renderer.root.findByProps({ onPress: onRetry }).props.onPress());
    assert.equal(retries, 1);
    assert.match(await render('syncing', [{ id: 'cached-agent' }]), /cached-agent/);
    assert.match(JSON.stringify(renderer.toJSON()), /directoryPicker.status.syncing/);
    assert.match(await render('offline'), /directoryPicker.status.offline/);
    assert.equal(renderer.root.findAllByType('ActivityIndicator').length, 0);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /directoryPicker.empty/);
    assert.match(await render('ready'), /directoryPicker.empty/);
  } finally {
    await act(async () => renderer.unmount());
  }
});
