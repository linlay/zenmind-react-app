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
test('production copy footer invokes the existing clipboard path once with current whole-run text, including late partial changes', async () => {
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
  const Footer = evaluate(`const ${declaration('MessageFooter')}; return MessageFooter;`, {
    memo: React.memo,
    useT: () => defaultT,
    View: 'View',
    Text: 'Text',
    Pressable: 'Button',
    TIMELINE_LAYOUT_STYLES: { messageFooter: {}, footerActions: {}, footerMeta: {} },
    MESSAGE_FOOTER_END_STYLE: {},
    FOOTER_META_END_STYLE: {},
    ChatRunCopyButton: ({ runId, onCopyRun }: any) =>
      React.createElement(
        'Button',
        { onPress: () => onCopyRun(runId) },
        React.createElement('Text', null, defaultT('transcript.copyRun'))
      ),
    MessageCopyButton: 'Copy',
    QuoteButton: 'Quote',
    MessageReaskButton: 'Reask'
  });
  let renderer: any;
  await act(async () => {
    renderer = create(
      React.createElement(Footer, {
        text: 'local message',
        timestamp: '',
        onCopyText: () => {},
        onCopyRun: handler,
        copyRunId: 'run'
      })
    );
  });
  try {
    const control = renderer.root.findByType('Button');
    assert.equal(control.findByType('Text').props.children, defaultT('transcript.copyRun'));
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
    assert.match(raw, /copyRunId=\{node.runId\}/);
    assert.match(raw, /copyRunId=\{item.runId\}/);
  } finally {
    await act(async () => renderer.unmount());
  }
});
