import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as protocol from '../../src/core/api/services/documentPreviewProtocol.ts';
import * as sources from '../../src/features/chatPersistence/chatSource.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
test('actual Office panel prepares only on tap, prevents double tap, opens top-level URL, and aborts late completion on close/source change', async () => {
  const url = new URL(
    '../../src/features/chatPersistence/components/resource/AuthenticatedOfficePreview.tsx',
    import.meta.url
  );
  const code = transformSync(readFileSync(url, 'utf8'), {
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  let calls: any[] = [];
  const opens: string[] = [];
  let resolve: any;
  let account = { scopeId: 'cs_one', generation: 1 };
  const listeners = new Set<() => void>();
  const deps: any = {
    '../../../../core/auth/cloudAuth.ts': {
      getCloudAuthSnapshot: () => account,
      subscribeCloudAuth: (callback: () => void) => {
        listeners.add(callback);
        return () => listeners.delete(callback);
      }
    },
    'react-native': {
      ActivityIndicator: 'Spinner',
      Pressable: 'Button',
      Text: 'Text',
      View: 'View',
      Linking: {
        openURL: async (url: string) => {
          opens.push(url);
        }
      }
    },
    '../../../../core/api/services/documentPreview.ts': {
      prepareAuthenticatedDocumentPreview: (input: any) => {
        calls.push(input);
        return new Promise((r) => {
          resolve = r;
        });
      }
    },
    '../../../../core/api/services/documentPreviewProtocol.ts': protocol,
    '../../chatSource.ts': sources,
    '../../../../shared/i18n/index.ts': { useT: () => defaultT }
  };
  const module = { exports: {} as any },
    require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  const Component = module.exports.AuthenticatedOfficePreview;
  const props = {
    conversationId: sources.encodeChatSourceId(sources.createChatSource('default', 'configured', 'Default'), 'chat'),
    target: { key: 'r', name: 'report.docx', resourceUrl: '/api/resource?file=chat/a.docx', previewKind: 'unsupported' }
  };
  let renderer: ReturnType<typeof create> | undefined;
  const result = {
    url: 'https://preview.test/share',
    previewId: 'p',
    sourceRevision: 'x',
    openMode: 'iframe',
    expiresAt: Date.now() + 10000
  };
  try {
    await act(async () => {
      renderer = create(React.createElement(Component, props));
    });
    assert.equal(calls.length, 0);
    await act(async () => {
      const click = renderer!.root.findByType('Button').props.onPress;
      void click();
      void click();
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].sourceId, 'configured');
    await act(async () => {
      resolve(result);
    });
    assert.deepEqual(opens, [result.url]);
    await act(async () => {
      void renderer!.root.findByType('Button').props.onPress();
    });
    assert.equal(calls.length, 2);
    await act(async () => {
      renderer!.update(React.createElement(Component, { ...props, conversationId: 'other' }));
    });
    assert.equal(calls[1].signal.aborted, true);
    await act(async () => {
      resolve(result);
    });
    assert.equal(opens.length, 1);
    await act(async () => {
      void renderer!.root.findByType('Button').props.onPress();
    });
    const accountSignal = calls[2].signal;
    await act(async () => {
      account = { scopeId: 'cs_two', generation: 2 };
      listeners.forEach((callback) => callback());
    });
    assert.equal(accountSignal.aborted, true);
    await act(async () => {
      resolve(result);
    });
    assert.equal(opens.length, 1);
    await act(async () => {
      void renderer!.root.findByType('Button').props.onPress();
    });
    const signal = calls[3].signal;
    await act(async () => {
      renderer!.unmount();
      renderer = undefined;
    });
    assert.equal(signal.aborted, true);
    await act(async () => {
      resolve(result);
    });
    assert.equal(opens.length, 1);
    assert.equal(listeners.size, 0);
    const modal = readFileSync(
      new URL(
        '../../src/features/chatPersistence/components/resource/AuthenticatedResourcePreviewModal.tsx',
        import.meta.url
      ),
      'utf8'
    );
    assert.match(modal, /isOnlineOfficeFile\(target.name\)/);
    assert.match(modal, /canDownload/);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
  }
});
