import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { transformSync } from '@babel/core';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { buildChatTimelineDisplayModel } from '../../src/features/chatTimeline/timelineDisplay.ts';
import { buildChatTimelinePresentationItems } from '../../src/features/chatTimeline/timelinePresentation.ts';
import { deriveChatTimelineState, applyChatTimelineEvent } from '../../src/features/chatTimeline/timelineReducer.ts';
import { buildChatTimelineMainDisplayItems } from '../../src/features/chatPersistence/chatArtifactPresentation.ts';
import { serializeChatRunTranscript } from '../../src/features/chatPersistence/chatRunTranscript.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
const now = 1_791_450_000_000;
const url = new URL('../../src/features/chatPersistence/components/ChatTimelineList.tsx', import.meta.url),
  raw = readFileSync(url, 'utf8');
const source = ts.createSourceFile(url.pathname, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string) {
  let result: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node;
    else ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result);
  return result.getText(source);
}
function layoutEffectContaining(text: string) {
  let result: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'useLayoutEffect' &&
      node.arguments[0]?.getText(source).includes(text)
    )
      result = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result);
  return result.getText(source);
}
function evaluate(snippet: string, scope: Record<string, unknown>) {
  const code = transformSync(snippet, {
    parserOpts: { allowReturnOutsideFunction: true },
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]],
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs'
    ]
  })!.code!;
  return new Function(...Object.keys(scope), 'require', code)(...Object.values(scope), createRequire(import.meta.url));
}
function state() {
  return deriveChatTimelineState('chat', [
    { type: 'request.query', runId: 'run', requestId: 'q', message: 'query', timestamp: now },
    { type: 'run.start', runId: 'run', timestamp: now + 1 },
    { type: 'content.snapshot', runId: 'run', contentId: 'early', text: 'needle earlier answer', timestamp: now + 2 },
    { type: 'reasoning.snapshot', runId: 'run', text: 'Thinking', timestamp: now + 3 },
    { type: 'content.snapshot', runId: 'run', contentId: 'last', text: 'final answer', timestamp: now + 4 },
    { type: 'run.finish', runId: 'run', timestamp: now + 5 }
  ]);
}
test('production search reveal expands a folded reply before scrolling; content resize/live/diagnostic effects cannot follow while searching', () => {
  const timeline = state(),
    main = buildChatTimelineMainDisplayItems(buildChatTimelineDisplayModel(timeline).items);
  let expanded = new Set<string>(),
    items = buildChatTimelinePresentationItems(timeline, main, expanded),
    follows = 0,
    schedules = 0,
    reveals = 0;
  const target = main.find(
    (item) => 'node' in item && item.node.kind === 'message' && item.node.content === 'needle earlier answer'
  )!;
  assert.ok('node' in target);
  const nodeId = target.node.id;
  assert.equal(
    items.some((item) => 'node' in item && item.node.id === nodeId),
    false
  );
  const ref = (value: any) => ({ current: value });
  const searchOpen = ref(false),
    revealNode = ref(''),
    following = ref(true),
    userScrolled = ref(false),
    pending = ref(true),
    scrollFrame = ref(77);
  const itemRef = ref(items),
    cancelled: number[] = [],
    scrolls: any[] = [];
  const scope: Record<string, unknown> = {
    useCallback: (fn: any) => fn,
    searchOpenRef: searchOpen,
    revealNodeRef: revealNode,
    isFollowingEndRef: following,
    hasUserScrolledRef: userScrolled,
    pendingAutoFollowRef: pending,
    pendingScrollFrameRef: scrollFrame,
    clearPendingAutoFollowSchedule: () => {},
    cancelAnimationFrame: (id: number) => cancelled.push(id),
    mainItemsRef: ref(main),
    itemsRef: itemRef,
    setExpandedProcessIds: (update: (value: Set<string>) => Set<string>) => {
      expanded = update(expanded);
    },
    setRevealVersion: (update: (value: number) => number) => {
      reveals = update(reveals);
    },
    listRef: ref({
      scrollToIndex: (value: any) => {
        scrolls.push(value);
        return Promise.resolve();
      }
    }),
    items,
    updateWaitingPlacement: () => {},
    availableTimelineHeightRef: ref(500),
    baseTimelineContentHeightRef: ref(1000),
    getChatResponseWaitingBaseContentHeight: (height: number) => height,
    waitingIndicatorInTimelineFooter: false,
    scrollMetricsRef: ref({ contentHeight: 1000, viewportHeight: 500, offsetY: 0 }),
    followTimelineEnd: () => {
      follows++;
    },
    updateScrollToEndVisibility: () => {},
    isNearTimelineEnd: () => true,
    schedulePendingAutoFollowReset: () => {
      schedules++;
    },
    tailSignatureRef: ref(null),
    tailSignature: {},
    didTimelineTailAdvance: () => true,
    diagnosticVersion: 'changed',
    showResponseWaitingIndicator: true
  };
  const actions = evaluate(
    `const ${declaration('handleSearchActive')}; const ${declaration('handleSearchReveal')}; const ${declaration('handleContentSizeChange')}; return {handleSearchActive,handleSearchReveal,handleContentSizeChange};`,
    scope
  );
  actions.handleSearchActive(true);
  assert.equal(pending.current, false);
  assert.equal(following.current, false);
  assert.equal(userScrolled.current, true);
  assert.deepEqual(cancelled, [77]);
  actions.handleSearchReveal(nodeId);
  assert.equal(expanded.size, 1);
  assert.equal(revealNode.current, nodeId);
  assert.equal(reveals, 1);
  let revealEffect = evaluate(`return ${layoutEffectContaining('scrollToIndex')};`, scope);
  revealEffect();
  assert.equal(scrolls.length, 0, 'folded row must not scroll to a wrong virtual index');
  items = buildChatTimelinePresentationItems(timeline, main, expanded);
  scope.items = items;
  revealEffect = evaluate(`return ${layoutEffectContaining('scrollToIndex')};`, scope);
  revealEffect();
  assert.equal(scrolls.length, 1);
  assert.equal(items[scrolls[0].index].key, target.key);
  assert.equal(revealNode.current, '');
  revealEffect();
  assert.equal(scrolls.length, 1, 'subsequent render does not re-reveal');
  pending.current = true;
  actions.handleContentSizeChange(400, 1200);
  assert.equal(follows, 0);
  for (const text of ['const previousTailSignature', 'if (!diagnosticVersion', 'showResponseWaitingIndicator &&']) {
    pending.current = false;
    evaluate(`return ${layoutEffectContaining(text)};`, scope)();
    assert.equal(pending.current, false);
    assert.equal(schedules, 0);
  }
  assert.match(raw, /onReveal=\{handleSearchReveal\}/);
  assert.match(raw, /onActiveChange=\{handleSearchActive\}/);
  assert.match(raw, /wasFollowingEnd && !searchOpenRef.current/);
});
test('dedicated whole-run copy control invokes the existing clipboard path once with current whole-run text, including late partial changes', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const clipboard: string[] = [],
    timelineRef = { current: state() };
  const handler = evaluate(`const ${declaration('handleCopyRun')}; return handleCopyRun;`, {
    useCallback: (fn: any) => fn,
    onCopyText: (value: string) => clipboard.push(value),
    serializeChatRunTranscript,
    timelineRef,
    displayModelRef: { current: buildChatTimelineDisplayModel(timelineRef.current) }
  });
  const copySource = readFileSync(
    new URL('../../src/features/chatPersistence/components/ChatRunCopyButton.tsx', import.meta.url),
    'utf8'
  );
  const CopyRun = evaluate(
    `${copySource.slice(copySource.indexOf('const ChatRunCopyButton'))}; return ChatRunCopyButton;`,
    {
      memo: React.memo,
      useT: () => defaultT,
      Pressable: 'Button',
      AppIcon: 'AppIcon'
    }
  );
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(CopyRun, { runId: 'run', onCopyRun: handler }));
  });
  try {
    const control = renderer.root.findByType('Button');
    assert.equal(control.props.accessibilityLabel, defaultT('transcript.copyRun'));
    assert.equal(control.findAllByType('Text').length, 0);
    timelineRef.current = applyChatTimelineEvent(timelineRef.current, 'chat', {
      type: 'content.snapshot',
      runId: 'next',
      contentId: 'other',
      text: 'UNRELATED',
      timestamp: now + 10
    });
    await act(async () => control.props.onPress());
    assert.equal(clipboard.length, 1);
    assert.match(clipboard[0], /^Query\nquery/);
    assert.match(clipboard[0], /needle earlier answer\n\nfinal answer/);
    assert.equal(clipboard[0].includes('UNRELATED'), false);
    assert.doesNotMatch(raw, /copyRunId|<ChatRunCopyButton/);
    assert.match(raw, /<ProcessSummaryTimelineRow[^>]*onCopyRun=\{handleCopyRun\}/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('message rows compose one body copy and icon-only actions in one row, with metadata and errors below', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const names = [
    'ICON_BUTTON_CLASS',
    'ICON_BUTTON_DISABLED_CLASS',
    'MESSAGE_FOOTER_CLASS',
    'MESSAGE_ACTIONS_CLASS',
    'META_TEXT_CLASS',
    'ERROR_TEXT_CLASS',
    'USER_BUBBLE_CLASS',
    'USER_ATTACHMENT_PANEL_CLASS',
    'USER_ATTACHMENT_PANEL_BEFORE_TEXT_CLASS',
    'MessageCopyButton',
    'MessageReaskButton',
    'QuoteButton',
    'MessageFooter',
    'UserQueryRow',
    'AssistantReplyFooterRow'
  ];
  const { User, Assistant } = evaluate(
    `${names.map((name) => `const ${declaration(name)};`).join('\n')} return { User: UserQueryRow, Assistant: AssistantReplyFooterRow };`,
    {
      memo: React.memo,
      useCallback: React.useCallback,
      useRef: React.useRef,
      useT: () => defaultT,
      useAppTheme: () => ({
        theme: { colors: { textSecondary: '#666', textTertiary: '#999', onBrandBlueAction: '#fff' } }
      }),
      View: 'View',
      Text: 'Text',
      Pressable: 'Button',
      AppIcon: 'AppIcon',
      ChatConversationMarkdownRenderer: 'Markdown',
      ChatAttachmentStrip: 'Attachments',
      TIMELINE_LAYOUT_STYLES: {},
      cn: (...values: string[]) => values.filter(Boolean).join(' '),
      formatChatDetailTimestamp: () => '今天 09:48',
      formatChatDetailRunDuration: () => '2分53秒',
      ChatRunFeedback: () =>
        React.createElement('Button', null, React.createElement('AppIcon', { usage: 'timeline.feedback' })),
      ChatRunDerivation: () =>
        React.createElement('Button', null, React.createElement('AppIcon', { usage: 'timeline.derive' }))
    }
  );
  const timeline = state(),
    model = buildChatTimelineDisplayModel(timeline);
  const userItem = model.items.find((item) => item.kind === 'user-query')!;
  assert.ok('node' in userItem && userItem.node.kind === 'message');
  const footerItem = model.items.find((item) => item.kind === 'assistant-reply-footer')!;
  assert.equal(footerItem.kind, 'assistant-reply-footer');
  const copied: string[] = [],
    quoted: string[] = [],
    reasked: unknown[] = [];
  const common = { onCopyText: (text: string) => copied.push(text), onQuoteText: (text: string) => quoted.push(text) };
  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(User, {
        ...common,
        node: { ...userItem.node, errorReason: 'A long submission error' },
        onOpenReaskMenu: (node: unknown) => reasked.push(node)
      })
    );
  });
  try {
    const usages = () => renderer.root.findAllByType('AppIcon').map((icon: any) => icon.props.usage);
    const action = (usage: string) =>
      renderer.root
        .findAllByType('Button')
        .find((button: any) => button.findAllByType('AppIcon').some((icon: any) => icon.props.usage === usage));
    const actionsContainer = () => {
      let parent = action('timeline.copy').parent;
      while (parent.type !== 'View') parent = parent.parent;
      return parent;
    };
    assert.deepEqual(usages(), ['timeline.copy', 'timeline.quote', 'timeline.reask']);
    for (const button of renderer.root.findAllByType('Button')) assert.equal(button.findAllByType('Text').length, 0);
    const actionRow = actionsContainer();
    assert.match(actionRow.props.className, /flex-row/);
    assert.equal(actionRow.findAllByType('Button').length, 3);
    assert.equal(actionRow.findAllByType('Text').length, 0);
    const error = renderer.root
      .findAllByType('Text')
      .find((text: any) => text.props.children === 'A long submission error');
    assert.equal(error.props.numberOfLines, undefined);
    assert.match(error.props.className, /text-right/);
    await act(async () => action('timeline.copy').props.onPress());
    await act(async () => action('timeline.quote').props.onPress());
    await act(async () => action('timeline.reask').props.onPress());
    assert.deepEqual(copied, ['query']);
    assert.deepEqual(quoted, ['query']);
    assert.equal(reasked.length, 1);
    await act(async () =>
      renderer.update(
        React.createElement(Assistant, {
          ...common,
          item: footerItem,
          conversationId: 'chat',
          deriveDisabled: false,
          onDeriveRun: async () => {},
          feedbackRun: { runId: 'run', derivation: { phase: 'unknown' } }
        })
      )
    );
    assert.deepEqual(usages(), ['timeline.copy', 'timeline.quote', 'timeline.feedback', 'timeline.derive']);
    assert.equal(actionsContainer().findAllByType('Button').length, 4);
    assert.equal(actionsContainer().findAllByType('Text').length, 0);
    assert.ok(
      renderer.root.findAllByType('Text').some((text: any) => text.props.children === defaultT('runDerivation.unknown'))
    );
    await act(async () => action('timeline.copy').props.onPress());
    await act(async () => action('timeline.quote').props.onPress());
    assert.deepEqual(copied, ['query', 'needle earlier answer\n\nfinal answer']);
    assert.deepEqual(quoted, copied);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('timeline surface keeps native tools unmounted through history and derivation, preserves pagination and enables tools explicitly on web', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const listDeclaration = ts.createSourceFile(
    'list.tsx',
    `const ${declaration('ChatTimelineList')}`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  let surface: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionExpression(node) && node.name?.text === 'ChatTimelineList') {
      const statement = node.body.statements.find(ts.isReturnStatement);
      surface = statement?.expression;
    } else ts.forEachChild(node, visit);
  }
  visit(listDeclaration);
  assert.ok(surface);
  const noop = () => {};
  let searchMounts = 0;
  let searchUnmounts = 0;
  function Search() {
    React.useEffect(() => {
      searchMounts++;
      return () => {
        searchUnmounts++;
      };
    }, []);
    return React.createElement('Search');
  }
  const scope = {
    ConversationMarkdownLinkProvider: 'Provider',
    View: 'View',
    FlashList: 'List',
    ChatTimelineTextSearch: Search,
    ChatFileChanges: 'Files',
    workspaceAgentKey: '',
    THREAD_CLASS: 'flex-1',
    conversationActions: React.createElement('Export'),
    handleSearchReveal: noop,
    setSearchNodeId: noop,
    handleSearchActive: noop,
    openFileChanges: noop,
    closeFileChanges: noop,
    threadRef: null,
    handleThreadLayout: noop,
    listRef: null,
    listExtraData: {},
    renderItem: noop,
    keyExtractor: noop,
    THREAD_SCROLLER_STYLE: {},
    timelineListStyle: {},
    getChatTimelinePresentationItemType: noop,
    emptyStateElement: React.createElement('Empty'),
    historyHeader: React.createElement('LoadOlder'),
    listFooter: null,
    handleScroll: noop,
    updateMetricsFromScrollEvent: noop,
    handleViewableItemsChanged: noop,
    handleLayout: noop,
    handleContentSizeChange: noop,
    TIMELINE_VIEWABILITY_CONFIG: {},
    waitingIndicatorDocked: false,
    showScrollToEnd: false,
    artifactCount: 0,
    planningCollapseOverlay: null,
    quoteSource: null,
    selectionScope: 'scope',
    reaskMenu: null
  };
  const Surface = evaluate(
    `return function Surface({items, timelineState, fileChangesOpen, showConversationTools = false}) { const ${declaration('hasContent')}; return ${surface.getText(listDeclaration)}; };`,
    scope
  );
  const props = (conversationId: string, items: unknown[], fileChangesOpen = false, showConversationTools = false) => ({
    timelineState: { conversationId },
    items,
    fileChangesOpen,
    showConversationTools
  });
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(Surface, props('empty', [])));
  });
  try {
    assert.equal(renderer.root.findAllByType('Export').length, 0);
    assert.equal(renderer.root.findAllByType('Search').length, 0);
    assert.equal(renderer.root.findByType('List').props.ListHeaderComponent, null);
    for (const conversationId of ['native-history', 'native-derived', 'native-reopened']) {
      await act(async () => renderer.update(React.createElement(Surface, props(conversationId, [{}], true))));
      assert.equal(renderer.root.findAllByType('Export').length, 0);
      assert.equal(renderer.root.findAllByType('Search').length, 0);
      assert.equal(renderer.root.findAllByType('Files').length, 0);
      assert.ok(renderer.root.findByType('List').props.ListHeaderComponent);
      assert.equal(searchMounts, 0);
    }
    await act(async () => renderer.update(React.createElement(Surface, props('web-populated', [{}], true, true))));
    assert.equal(renderer.root.findAllByType('Export').length, 1);
    assert.equal(renderer.root.findAllByType('Search').length, 1);
    assert.equal(renderer.root.findAllByType('Files').length, 1);
    assert.ok(renderer.root.findByType('List').props.ListHeaderComponent);
    await act(async () => renderer.update(React.createElement(Surface, props('web-another', [{}], true, true))));
    assert.equal(searchMounts, 2);
    assert.equal(searchUnmounts, 1);
    await act(async () => renderer.update(React.createElement(Surface, props('another-empty', [], true, true))));
    assert.equal(renderer.root.findAllByType('Export').length, 0);
    assert.equal(renderer.root.findAllByType('Search').length, 0);
    assert.equal(renderer.root.findAllByType('Files').length, 0);
    assert.equal(renderer.root.findByType('List').props.ListHeaderComponent, null);
    assert.equal(searchUnmounts, 2);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test('system alerts expose technical details without a whole-run copy action', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const alertSource = readFileSync(
    new URL('../../src/features/chatPersistence/components/ChatSystemAlert.tsx', import.meta.url),
    'utf8'
  );
  const Alert = evaluate(
    `${alertSource.slice(alertSource.indexOf('const TIMELINE_ROW_CLASS')).replace('export const ChatSystemAlert', 'const ChatSystemAlert')}; return ChatSystemAlert;`,
    {
      memo: React.memo,
      useCallback: React.useCallback,
      useMemo: React.useMemo,
      useState: React.useState,
      useT: () => defaultT,
      useAppTheme: () => ({ theme: { colors: { danger: 'red', textSecondary: 'gray' } } }),
      View: 'View',
      Text: 'Text',
      Pressable: 'Button',
      ScrollView: 'ScrollView',
      AppIcon: 'AppIcon',
      ChatTimelineRail: 'Rail'
    }
  );
  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(Alert, {
        node: {
          runId: 'failed-run',
          content: 'Request failed',
          errorDetail: { message: 'Permission denied', status: 403 }
        },
        isLastInRun: true
      })
    );
  });
  try {
    const icons = () => renderer.root.findAllByType('AppIcon').map((icon: any) => icon.props.usage);
    assert.equal(icons().includes('timeline.copy'), false);
    assert.equal(renderer.root.findAllByType('Button').length, 1);
    await act(async () => renderer.root.findByType('Button').props.onPress());
    assert.ok(renderer.root.findAllByType('Text').some((text: any) => text.props.children === 'Permission denied'));
    assert.equal(icons().includes('timeline.copy'), false);
  } finally {
    await act(async () => renderer.unmount());
  }
});
