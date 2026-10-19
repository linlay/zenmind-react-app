import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { transformSync } from '@babel/core';
import React, { memo, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import * as descriptors from '../../src/features/chatPersistence/components/runtimePayloadDescriptor.ts';
import * as shimmer from '../../src/features/chatPersistence/components/planningWritingShimmerConfig.ts';
import type { ChatTimelineNodeDisplayItem, ChatTimelineTextNode } from '../../src/features/chatTimeline/types.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
import { cn } from '../../src/shared/visual/className.ts';
import { createConversationPreviewVisibilityStore } from '../../src/shared/components/conversationPreview/visibilityStore.ts';

const require = createRequire(import.meta.url);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Exercise the production components and FlashList hooks. Only native surfaces
// are replaced; Node cannot load React Native's Flow/codegen entrypoints.
function load<T>(relativePath: string, dependencies: Record<string, unknown>): T {
  const filename = path.resolve(relativePath);
  const result = transformSync(readFileSync(filename, 'utf8'), {
    filename,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  });
  assert.ok(result?.code);
  const module = { exports: {} };
  const localRequire = (name: string) => (Object.hasOwn(dependencies, name) ? dependencies[name] : require(name));
  new Function('require', 'module', 'exports', result.code)(localRequire, module, module.exports);
  return module.exports as T;
}

const layoutHooks = load('node_modules/@shopify/flash-list/src/recyclerview/hooks/useLayoutState.ts', {
  '../RecyclerViewContextProvider': { useRecyclerViewContext: () => undefined }
});
const recyclingHooks = load('node_modules/@shopify/flash-list/src/recyclerview/hooks/useRecyclingState.ts', {
  './useLayoutState': layoutHooks
});
const colors = {
  brandBlue: '#1677ff',
  textPrimary: '#111',
  textSecondary: '#777',
  warning: '#fb0',
  surfaceMuted: '#eee'
};
const native = {
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  AccessibilityInfo: { isReduceMotionEnabled: async () => true, addEventListener: () => ({ remove() {} }) }
};
const common = {
  'react-native': native,
  '@shopify/flash-list': recyclingHooks,
  '../../../shared/icons/AppIcon': { AppIcon: 'AppIcon' },
  '../../../shared/i18n': { useT: () => defaultT },
  '../../../shared/visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors } }) },
  '../../../shared/visual/className': { cn },
  '../conversationViewport/ConversationViewportBlock': { ConversationViewportBlock: 'ConversationViewportBlock' },
  './ChatImageGeneration.tsx': { ChatImageGeneration: 'ChatImageGeneration' },
  './runtimePayloadDescriptor': descriptors,
  './runtimePayloadDescriptor.ts': descriptors
};

const preview = load<typeof import('../../src/shared/components/conversationPreview/ConversationPreviewProvider.tsx')>(
  'src/shared/components/conversationPreview/ConversationPreviewProvider.tsx',
  {
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../icons/AppIcon': { AppIcon: 'AppIcon' },
    '../../i18n': { useT: () => defaultT },
    '../../visual/AppThemeProvider': { useAppTheme: () => ({ theme: { colors } }) },
    '../../markdown/previewSourceHash': { hashConversationPreviewSource: () => 'hash' },
    './previewCache': { createConversationPreviewHeightCacheKey: () => 'preview' },
    './PreviewErrorPanel': { PreviewErrorPanel: 'PreviewError' },
    './PreviewSurface': { PreviewSurface: 'PreviewSurface' },
    './runtimeBridge': { CONVERSATION_PREVIEW_MAX_SOURCE_BYTES: 256 * 1024 },
    './visibilityStore': { createConversationPreviewVisibilityStore },
    './usePreviewExecutionState': { usePreviewExecutionState: () => ({}) }
  }
);
function PreviewActivityProbe() {
  return React.createElement('PreviewActivity', { active: preview.useConversationPreviewRowActive() });
}

const renders: string[] = [];
const mounts: string[] = [];
const unmounts: string[] = [];
const MarkdownProbe = memo(function MarkdownProbe({ markdown }: { markdown: string }) {
  renders.push(markdown);
  useEffect(() => {
    mounts.push(markdown);
    return () => {
      unmounts.push(markdown);
    };
  }, []);
  return React.createElement('Markdown', { markdown }, React.createElement(PreviewActivityProbe));
});
const payloadRenderers = load('src/features/chatPersistence/components/runtimePayloadRenderers.tsx', {
  ...common,
  '../markdownLinks/ChatConversationMarkdownRenderer.tsx': { ChatConversationMarkdownRenderer: MarkdownProbe },
  '../chatDetailFormatters': { formatChatDetailRunningDuration: () => '' },
  './useRunningElapsedMs.ts': { useRunningElapsedMs: () => null },
  './RuntimeStructuredPayloadBlock.tsx': { RuntimeStructuredPayloadBlock: 'StructuredPayload' },
  './runtimeToolStatusVisual': { getRuntimeToolStatusColor: () => '#1677ff' }
});
const frame = load<typeof import('../../src/features/chatPersistence/components/RuntimePayloadFrame.tsx')>(
  'src/features/chatPersistence/components/RuntimePayloadFrame.tsx',
  common
);
const rail = load<typeof import('../../src/features/chatPersistence/components/ChatTimelineRail.tsx')>(
  'src/features/chatPersistence/components/ChatTimelineRail.tsx',
  {
    ...common,
    '../../../shared/visual/foundation': { appVisualTokens: { spacing: { lg: 16, xl: 24 } } }
  }
);
const planning = load<typeof import('../../src/features/chatPersistence/components/RuntimePlanningBlock.tsx')>(
  'src/features/chatPersistence/components/RuntimePlanningBlock.tsx',
  {
    ...common,
    './ChatTimelineRail': rail,
    './runtimePayloadRenderers': payloadRenderers,
    './planningWritingShimmerConfig': shimmer,
    'react-native-svg': {
      __esModule: true,
      default: 'Svg',
      Defs: 'Defs',
      LinearGradient: 'LinearGradient',
      Rect: 'Rect',
      Stop: 'Stop',
      Text: 'SvgText'
    },
    'react-native-reanimated': {
      createAnimatedComponent: (component: unknown) => component,
      useSharedValue: (value: unknown) => ({ value }),
      useAnimatedProps: (callback: () => unknown) => callback(),
      cancelAnimation() {},
      withRepeat: (value: unknown) => value,
      withTiming: (value: unknown) => value,
      Easing: { linear: (value: number) => value }
    }
  }
);
const { RuntimeTimelineRow } = load<
  typeof import('../../src/features/chatPersistence/components/RuntimeTimelineRow.tsx')
>('src/features/chatPersistence/components/RuntimeTimelineRow.tsx', {
  ...common,
  './ChatTimelineRail': rail,
  './RuntimePayloadFrame': frame,
  './RuntimePlanningBlock': planning,
  './runtimePayloadRenderers': payloadRenderers,
  './runtimeToolStatusVisual': { getRuntimeToolStatusColor: () => '#1677ff' },
  '../../../shared/components/conversationPreview/ConversationPreviewProvider': preview
});

function item(id: string, kind: 'reasoning' | 'planning' = 'reasoning'): ChatTimelineNodeDisplayItem {
  const node: ChatTimelineTextNode = {
    id,
    kind,
    runId: 'run-1',
    createdAt: 1000,
    updatedAt: 2000,
    order: 1,
    lifecycle: 'complete',
    title: '',
    body: `# ${id}\n[链接](https://example.com)\n\n\`\`\`mermaid\ngraph TD; A-->B\n\`\`\``,
    status: 'completed',
    streaming: false
  };
  return { key: id, kind, node, nodeId: id, runId: 'run-1', groupIndex: 1, isFirstInRun: false, isLastInRun: false };
}
const props = {
  onCopyText: (_text: string) => {},
  getInitialExpanded: (_id: string, fallback: boolean) => fallback,
  onExpandedChange: (_id: string, _expanded: boolean) => {},
  getInitialPlanningMode: (_id: string) => 'preview' as const,
  onPlanningCollapseOverlayChange: () => {},
  onPlanningModeChange: () => {}
};
function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ accessibilityLabel: label });
}
function resetCounts() {
  renders.length = 0;
  mounts.length = 0;
  unmounts.length = 0;
}

test('reasoning mounts lazily, reopens without rerender/remount, and pauses hidden previews', async () => {
  resetCounts();
  const current = item('reasoning-a');
  let renderer!: ReactTestRenderer;
  const copies: string[] = [];
  await act(async () => {
    renderer = create(
      React.createElement(RuntimeTimelineRow, {
        ...props,
        item: current,
        onCopyText: (text: string) => copies.push(text)
      })
    );
  });
  assert.equal(mounts.length, 0);
  await act(async () => button(renderer, defaultT('timeline.expandContent')).props.onPress());
  assert.deepEqual(mounts, [current.node.kind === 'reasoning' ? current.node.body : '']);
  assert.equal(renderer.root.findAllByType('ScrollView').length, 0);
  await act(async () => button(renderer, defaultT('timeline.copy')).props.onPress());
  assert.deepEqual(copies, mounts);
  for (let i = 0; i < 20; i += 1) {
    await act(async () => button(renderer, defaultT('timeline.collapseContent')).props.onPress());
    assert.equal(renderer.root.findByType('PreviewActivity').props.active, false);
    const hidden = renderer.root.findByProps({ className: 'hidden' });
    assert.equal(hidden.props.importantForAccessibility, 'no-hide-descendants');
    await act(async () => button(renderer, defaultT('timeline.expandContent')).props.onPress());
    assert.equal(renderer.root.findByType('PreviewActivity').props.active, true);
  }
  assert.equal(mounts.length, 1);
  assert.equal(renders.length, 1);
  assert.equal(unmounts.length, 0);
  await act(async () => renderer.unmount());
  assert.equal(unmounts.length, 1);
});

test('collapsed preview scopes override retained visibility while unscoped previews remain active', async () => {
  const store = createConversationPreviewVisibilityStore();
  store.replaceVisibleRows(['visible-row']);
  let renderer!: ReactTestRenderer;
  const tree = (rowKey: string) =>
    React.createElement(preview.ConversationPreviewProvider, {
      store,
      onCopyText: () => {},
      children: React.createElement(preview.ConversationPreviewRowScope, {
        rowKey,
        children: React.createElement(PreviewActivityProbe)
      })
    });
  await act(async () => {
    renderer = create(tree('visible-row'));
  });
  assert.equal(renderer.root.findByType('PreviewActivity').props.active, true);
  await act(async () => renderer.update(tree('')));
  assert.equal(renderer.root.findByType('PreviewActivity').props.active, false);
  await act(async () => renderer.update(tree('offscreen-row')));
  assert.equal(renderer.root.findByType('PreviewActivity').props.active, false);
  await act(async () => renderer.update(React.createElement(PreviewActivityProbe)));
  assert.equal(renderer.root.findByType('PreviewActivity').props.active, true);
  await act(async () => renderer.unmount());
});

test('recycling an expanded reasoning cell never mounts the next collapsed body', async () => {
  resetCounts();
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(RuntimeTimelineRow, { ...props, item: item('a') }));
  });
  await act(async () => button(renderer, defaultT('timeline.expandContent')).props.onPress());
  await act(async () => renderer.update(React.createElement(RuntimeTimelineRow, { ...props, item: item('b') })));
  assert.equal(renders.length, 1, 'new collapsed body must never render, including before effects');
  assert.equal(unmounts.length, 1);
  assert.equal(renderer.root.findAllByType('Markdown').length, 0);
  await act(async () => renderer.unmount());
});

test('rail-only changes reuse the reasoning descriptor and body; changed text remains visible', async () => {
  resetCounts();
  const current = item('a');
  let renderer!: ReactTestRenderer;
  const rowProps = { ...props, getInitialExpanded: () => true };
  await act(async () => {
    renderer = create(React.createElement(RuntimeTimelineRow, { ...rowProps, item: current }));
  });
  await act(async () =>
    renderer.update(
      React.createElement(RuntimeTimelineRow, { ...rowProps, item: { ...current, groupIndex: 2, isLastInRun: true } })
    )
  );
  assert.equal(renders.length, 1);
  const node = current.node as ChatTimelineTextNode;
  await act(async () =>
    renderer.update(
      React.createElement(RuntimeTimelineRow, {
        ...rowProps,
        item: { ...current, node: { ...node, body: '更新后的正文' } }
      })
    )
  );
  assert.equal(renderer.root.findByType('Markdown').props.markdown, '更新后的正文');
  assert.equal(mounts.length, 1);
  await act(async () => renderer.unmount());
});

test('wrap state resets synchronously on recycling and keeps explicit horizontal scrolling', async () => {
  const wraps: boolean[] = [];
  const renderContent = (wrap: boolean) => {
    wraps.push(wrap);
    return null;
  };
  let renderer!: ReactTestRenderer;
  const frameProps = { copyText: '', onCopyText: props.onCopyText, defaultWrap: true, renderContent };
  await act(async () => {
    renderer = create(React.createElement(frame.RuntimePayloadFrame, { ...frameProps, descriptorId: 'a' }));
  });
  await act(async () => button(renderer, defaultT('timeline.wrapOff')).props.onPress());
  assert.equal(renderer.root.findAllByType('ScrollView').length, 1);
  wraps.length = 0;
  await act(async () =>
    renderer.update(React.createElement(frame.RuntimePayloadFrame, { ...frameProps, descriptorId: 'b' }))
  );
  assert.deepEqual(wraps, [true]);
  assert.equal(renderer.root.findAllByType('ScrollView').length, 0);
  await act(async () => renderer.unmount());
});

test('planning mode resets before rendering the next recycled node', async () => {
  resetCounts();
  let renderer!: ReactTestRenderer;
  const planningProps = {
    ...props,
    getInitialPlanningMode: (id: string) => (id === 'a' ? ('preview' as const) : ('compact' as const))
  };
  await act(async () => {
    renderer = create(React.createElement(RuntimeTimelineRow, { ...planningProps, item: item('a', 'planning') }));
  });
  assert.equal(mounts.length, 1);
  await act(async () =>
    renderer.update(React.createElement(RuntimeTimelineRow, { ...planningProps, item: item('b', 'planning') }))
  );
  assert.equal(renders.length, 1);
  assert.equal(unmounts.length, 1);
  await act(async () => renderer.unmount());
});

test('transparent rail leaves a gap around the icon and no lower line on terminal rows', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(React.createElement(rail.ChatTimelineRail));
  });
  assert.equal(renderer.root.findAllByProps({ className: 'bg-app-line-strong' }).length, 2);
  const slot = renderer.root.findByType('AppIcon').parent;
  assert.ok(slot);
  assert.doesNotMatch(slot.props.className, /bg-/);
  await act(async () => renderer.update(React.createElement(rail.ChatTimelineRail, { terminal: true })));
  assert.equal(renderer.root.findAllByProps({ className: 'bg-app-line-strong' }).length, 1);
  await act(async () => renderer.unmount());
});

test('image generation outputs remain mounted when tool payload is collapsed', async () => {
  const current = item('image-tool');
  const node = {
    ...current.node,
    kind: 'tool',
    toolId: 'image-tool',
    toolName: 'image_generate',
    toolLabel: 'Images',
    status: 'completed',
    lifecycle: 'complete',
    argsText: '{"n":2}',
    resultText: '{"ok":true,"images":[]}',
    streaming: false
  } as any;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      React.createElement(RuntimeTimelineRow, {
        ...props,
        item: { ...current, kind: 'tool', node },
        conversationId: 'chat',
        imageRunLifecycle: 'complete'
      })
    );
  });
  try {
    assert.equal(renderer.root.findAllByType('ChatImageGeneration').length, 1);
    assert.equal(renderer.root.findByType('ChatImageGeneration').props.nodes[0], node);
    assert.equal(renderer.root.findByType('ChatImageGeneration').props.runLifecycle, 'complete');
    assert.equal(renderer.root.findAllByType('StructuredPayload').length, 0);
    await act(async () => button(renderer, defaultT('timeline.expandContent')).props.onPress());
    assert.ok(renderer.root.findAllByType('StructuredPayload').length > 0);
    await act(async () => button(renderer, defaultT('timeline.collapseContent')).props.onPress());
    assert.equal(renderer.root.findAllByType('ChatImageGeneration').length, 1);
  } finally {
    await act(async () => renderer.unmount());
  }
});
