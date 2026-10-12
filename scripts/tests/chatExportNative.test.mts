import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as protocol from '../../src/core/api/services/chatExportProtocol.ts';
import * as sources from '../../src/features/chatPersistence/chatSource.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function load(path: string, dependencies: Record<string, unknown>) {
  const url = new URL(path, import.meta.url);
  let code = transformSync(readFileSync(url, 'utf8'), {
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  // Substitute module resolution only, including the lazy native dependency.
  code = code.replace(/import\(['"]expo-sharing['"]\)/g, "Promise.resolve().then(() => require('expo-sharing'))");
  const module = { exports: {} as any },
    require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', code)(
    (key: string) => dependencies[key] ?? require(key),
    module,
    module.exports
  );
  return module.exports;
}
const file = {
  bytes: new TextEncoder().encode('完整服务器历史'),
  fileName: 'conversation.md',
  mimeType: 'text/markdown'
};

function nativeDelivery() {
  const files = new Map<string, Uint8Array>(),
    directories = new Set<string>(['file:///cache', 'content://selected']);
  let sharing: (uri: string) => Promise<void> = async () => {};
  let picker: () => Promise<Directory> = async () => new Directory('content://selected');
  let failWrite = false;
  class File {
    uri: string;
    constructor(parent: Directory, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      if (this.exists) throw new Error('already exists');
      files.set(this.uri, new Uint8Array());
    }
    write(bytes: Uint8Array) {
      files.set(this.uri, bytes);
      if (failWrite) throw new Error('disk full');
    }
    delete() {
      files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(parent: Directory | string, name?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name ? '/' + name : ''}`;
    }
    static pickDirectoryAsync() {
      return picker();
    }
    get exists() {
      return directories.has(this.uri);
    }
    create() {
      if (this.exists) throw new Error('already exists');
      directories.add(this.uri);
    }
    createFile(name: string) {
      const value = new File(this, name);
      value.create();
      return value;
    }
    delete() {
      directories.delete(this.uri);
      for (const path of files.keys()) if (path.startsWith(this.uri + '/')) files.delete(path);
    }
  }
  const service = load('../../src/core/api/services/chatExportDelivery.native.ts', {
    'expo-file-system': { Directory, File, Paths: { cache: new Directory('file:///cache') } },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: (uri: string) => sharing(uri) },
    './chatExportProtocol.ts': protocol
  });
  return {
    deliver: service.deliverChatExport,
    files,
    directories,
    setShare: (next: typeof sharing) => {
      sharing = next;
    },
    setPicker: (next: typeof picker) => {
      picker = next;
    },
    setFailWrite: () => {
      failWrite = true;
    },
    Directory
  };
}

test('native sharing holds the file until completion, then cleans only its owned directory on success and failure', async () => {
  const service = nativeDelivery();
  service.files.set('file:///cache/pre-existing.txt', new Uint8Array([42]));
  let finish!: () => void;
  service.setShare(async (uri) => {
    assert.deepEqual(service.files.get(uri), file.bytes);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const pending = service.deliver(file, 'share', new AbortController().signal);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.files.size, 2);
  finish();
  await pending;
  assert.equal(service.files.size, 1);
  assert.equal(service.directories.size, 2);
  service.setShare(async () => {
    throw new Error('share rejected');
  });
  await assert.rejects(service.deliver(file, 'share', new AbortController().signal));
  assert.equal(service.files.size, 1);
  assert.equal(service.directories.size, 2);
});

test('save never overwrites user files, cleans failed writes, creates nothing after picker cancellation', async () => {
  const service = nativeDelivery(),
    existing = new Uint8Array([42]);
  service.files.set('content://selected/conversation.md', existing);
  await service.deliver(file, 'save', new AbortController().signal);
  assert.deepEqual(service.files.get('content://selected/conversation.md'), existing);
  assert.equal(service.files.size, 2);
  service.setFailWrite();
  await assert.rejects(service.deliver(file, 'save', new AbortController().signal));
  assert.equal(service.files.size, 2);
  const controller = new AbortController();
  service.setPicker(async () => {
    controller.abort();
    return new service.Directory('content://selected');
  });
  await assert.rejects(service.deliver(file, 'save', controller.signal), { code: 'cancelled' });
  assert.equal(service.files.size, 2);
});

test('closing during system sharing does not revoke its readable file before dismissal', async () => {
  const service = nativeDelivery(),
    controller = new AbortController();
  let finish!: () => void;
  service.setShare(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const pending = service.deliver(file, 'share', controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.equal(service.files.size, 1);
  finish();
  await pending;
  assert.equal(service.files.size, 0);
});

test('actual menu fetches only on action, rejects duplicate taps and cancels late delivery on close/account change/unmount', async () => {
  const calls: any[] = [],
    delivered: unknown[] = [];
  let resolve!: (value: typeof file) => void;
  let account = { scopeId: 'cs_account', generation: 1 };
  const listeners = new Set<() => void>();
  const Component = load('../../src/features/chatPersistence/components/ChatExportMenu.tsx', {
    'react-native': { ActivityIndicator: 'Spinner', Modal: 'Modal', Pressable: 'Button', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 7 }) },
    '../../../core/auth/cloudAuth.ts': {
      getCloudAuthSnapshot: () => account,
      subscribeCloudAuth: (cb: () => void) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      }
    },
    '../../../core/api/services/chatExport.ts': {
      getChatExportAssetOrigin: () => '',
      fetchChatExport: (input: unknown) => {
        calls.push(input);
        return new Promise((r) => {
          resolve = r;
        });
      }
    },
    '../../../core/api/services/chatExportDelivery': {
      deliverChatExport: async (...args: unknown[]) => {
        delivered.push(args);
      }
    },
    '../../../core/api/services/chatExportProtocol.ts': protocol,
    '../../../shared/i18n': { useT: () => defaultT },
    '../chatSource.ts': sources
  }).ChatExportMenu;
  const id = sources.encodeChatSourceId(sources.createChatSource('default', 'default', 'AP'), 'chat');
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(Component, { conversationId: id, disabled: false }));
  });
  const button = (text: string) =>
    renderer!.root
      .findAllByType('Button')
      .find((v) => v.findAllByType('Text').some((t) => t.children.join('') === text))!;
  assert.equal(calls.length, 0);
  await act(async () => {
    button('导出与分享').props.onPress();
  });
  assert.equal(calls.length, 0);
  await act(async () => {
    button('分享 Markdown').props.onPress();
    button('分享 Markdown').props.onPress();
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].chatId, 'chat');
  await act(async () => {
    button('取消等待').props.onPress();
    resolve(file);
  });
  assert.ok(calls[0].signal.aborted);
  assert.equal(delivered.length, 0);
  await act(async () => {
    button('导出与分享').props.onPress();
  });
  await act(async () => {
    button('分享 Markdown').props.onPress();
  });
  await act(async () => {
    account = { scopeId: 'cs_other', generation: 2 };
    listeners.forEach((cb) => cb());
  });
  await act(async () => {
    resolve(file);
  });
  assert.ok(calls[1].signal.aborted);
  assert.equal(delivered.length, 0);
  await act(async () => {
    button('导出与分享').props.onPress();
  });
  await act(async () => {
    button('保存 Markdown').props.onPress();
  });
  await act(async () => {
    resolve(file);
  });
  assert.equal(delivered.length, 1);
  await act(async () => {
    button('导出与分享').props.onPress();
  });
  await act(async () => {
    button('分享 Markdown').props.onPress();
  });
  await act(async () => {
    renderer!.unmount();
  });
  await act(async () => {
    resolve(file);
  });
  assert.ok(calls[3].signal.aborted);
  assert.equal(delivered.length, 1);
  assert.equal(listeners.size, 0);
});
