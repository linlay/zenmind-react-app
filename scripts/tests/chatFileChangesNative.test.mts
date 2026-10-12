import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create } from 'react-test-renderer';
import * as projection from '../../src/features/chatPersistence/chatFileChanges.ts';
import * as links from '../../src/features/chatPersistence/markdownLinks/conversationMarkdownLinks.ts';
import { deriveChatTimelineState } from '../../src/features/chatTimeline/timelineReducer.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
test('production file panel virtualizes call rows, opens existing authenticated workspace preview with call owner, and reports unsafe/missing scope explicitly', async () => {
  const url = new URL('../../src/features/chatPersistence/components/ChatFileChanges.tsx', import.meta.url);
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
  const previews: any[] = [],
    order: string[] = [];
  const deps: Record<string, unknown> = {
    'react-native': { FlatList: 'List', Modal: 'Modal', Pressable: 'Button', Text: 'Text', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 23 }) },
    '../../../shared/i18n': { useT: () => defaultT },
    '../chatFileChanges.ts': projection,
    '../markdownLinks/conversationMarkdownLinks.ts': links,
    './resource/AuthenticatedResourcePreviewProvider.tsx': {
      useAuthenticatedResourcePreview: () => ({
        openPreview: (...args: any[]) => {
          order.push('preview');
          previews.push(args);
        }
      })
    }
  };
  const require = createRequire(import.meta.url),
    module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  const Component = module.exports.ChatFileChanges,
    now = 1_791_450_000_000;
  const state = deriveChatTimelineState('chat', [
    {
      type: 'tool.snapshot',
      runId: 'run',
      toolId: 'one',
      toolName: 'file_write',
      agentKey: 'call-agent',
      timestamp: now
    },
    {
      type: 'tool.result',
      runId: 'run',
      toolId: 'one',
      result: {
        status: 'written',
        filePath: '/workspace/src/a.ts',
        lineStats: { addedLines: 1, deletedLines: 0, editedLines: 0 }
      },
      timestamp: now + 1
    }
  ]);
  let renderer: ReturnType<typeof create> | undefined, rowRenderer: ReturnType<typeof create> | undefined;
  const props = { timeline: state, agentKey: 'parent-agent', onClose: () => order.push('close') };
  try {
    await act(async () => {
      renderer = create(React.createElement(Component, props));
    });
    const list = renderer!.root.findByType('List');
    assert.equal(list.props.data.length, 2);
    assert.equal(list.props.initialNumToRender, 12);
    assert.equal(list.props.windowSize, 5);
    await act(async () => {
      rowRenderer = create(list.props.renderItem({ item: list.props.data[1] }));
    });
    await act(async () => {
      rowRenderer!.root.findByType('Button').props.onPress();
    });
    assert.deepEqual(order, ['close', 'preview']);
    assert.equal(previews[0][1], '');
    assert.match(previews[0][0].resourceUrl, /agentKey=call-agent/);
    assert.equal(previews[0][0].sourcePath, '/workspace/src/a.ts');
    assert.equal(previews[0][0].previewKind, 'text');
    const tool = Object.values(state.nodesById).find((node) => node.kind === 'tool')!;
    const missing = { ...state, nodesById: { ...state.nodesById, [tool.id]: { ...tool, agentKey: '' } } };
    await act(async () => {
      renderer!.update(React.createElement(Component, { ...props, timeline: missing, agentKey: '' }));
    });
    const missingList = renderer!.root.findByType('List');
    await act(async () => {
      rowRenderer!.update(missingList.props.renderItem({ item: missingList.props.data[1] }));
    });
    await act(async () => {
      rowRenderer!.root.findByType('Button').props.onPress();
    });
    assert.equal(previews[1][0].resourceUrl, '');
    assert.equal(previews[1][1], defaultT('markdownLink.workspaceScopeMissing'));
    const unsafe = {
      ...state,
      nodesById: {
        ...state.nodesById,
        [tool.id]: { ...tool, resultText: JSON.stringify({ status: 'written', filePath: '/workspace/../private.ts' }) }
      }
    };
    await act(async () => {
      renderer!.update(React.createElement(Component, { ...props, timeline: unsafe }));
    });
    const unsafeList = renderer!.root.findByType('List');
    await act(async () => {
      rowRenderer!.update(unsafeList.props.renderItem({ item: unsafeList.props.data[1] }));
    });
    await act(async () => {
      rowRenderer!.root.findByType('Button').props.onPress();
    });
    assert.equal(previews[2][0].resourceUrl, '');
    assert.equal(previews[2][1], defaultT('markdownLink.invalid'));
    const listSource = readFileSync(
      new URL('../../src/features/chatPersistence/components/ChatTimelineList.tsx', import.meta.url),
      'utf8'
    );
    assert.match(listSource, /fileChangesOpen \? \(/);
    assert.match(listSource, /<ChatFileChanges\s+key=\{`file-changes:\$\{timelineState.conversationId\}`\}/);
    assert.match(listSource, /<ChatTimelineTextSearch\s+key=\{`search:\$\{timelineState.conversationId\}`\}/);
  } finally {
    await act(async () => {
      rowRenderer?.unmount();
      renderer?.unmount();
    });
  }
});
