import assert from 'node:assert/strict';
import test from 'node:test';
import { projectRemoteChatDetail } from '../../src/features/chatPersistence/chatProjector.ts';
import * as feedback from '../../src/features/chatTimeline/timelineRunFeedback.ts';
import { getChatTimelineRun } from '../../src/features/chatTimeline/timelineRunAccess.ts';
import {
  mergeChatTimelineState,
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/index.ts';
import { validateChatFeedbackResponse } from '../../src/core/api/services/chatFeedbackProtocol.ts';
import { assertRemoteChatDetailTimes } from '../../src/core/api/services/chatRemoteTimeProtocol.ts';
const now = 1_791_450_000_000;
function snapshot(value: Record<string, unknown> = {}, runId = 'run') {
  return projectRemoteChatDetail({
    chatId: 'chat',
    runs: [
      { runId, startedAt: now, completedAt: now + 1000, initialMessage: 'question', assistantText: 'answer', ...value }
    ]
  })!.timelineState;
}
test('snapshot feedback recovers corresponding runs, missing fields mean cleared, comment and confirmed time survive cold state', () => {
  const s = snapshot({ feedbackType: 'thumbs_down', feedbackComment: 'not helpful', feedbackAt: now + 2000 });
  const run = getChatTimelineRun(s, 'run')!;
  assert.equal(run.feedback!.comment, 'not helpful');
  const saved = serializeChatTimelineState(s),
    restored = deserializeChatTimelineState(saved.meta, saved.nodes)!;
  assert.deepEqual(getChatTimelineRun(restored, 'run')!.feedback, run.feedback);
  assert.equal(getChatTimelineRun(snapshot(), 'run')!.feedback, null);
  assert.equal(
    getChatTimelineRun(snapshot({ feedbackType: 'thumbs_down', feedbackAt: now + 2000 }, 'other'), 'run'),
    null
  );
  assert.throws(
    () =>
      validateChatFeedbackResponse(
        { chatId: 'chat', runId: 'run', type: 'thumbs_down', setAt: now / 1000 },
        'chat',
        'run',
        'thumbs_down'
      ),
    /does not match/
  );
  assert.throws(
    () =>
      validateChatFeedbackResponse({ chatId: 'chat', runId: 'run', type: 'clear', setAt: 0 }, 'chat', 'run', 'clear'),
    /does not match/
  );
  assert.equal(feedback.readChatRunFeedback({ feedbackType: 'thumbs_down', feedbackAt: now / 1000 }), undefined);
  assert.throws(
    () => assertRemoteChatDetailTimes({ runs: [{ startedAt: now, feedbackAt: now / 1000 }] }),
    /Invalid remote chat time/
  );
});
test('optimistic pending is transient, failure drops it while preserving confirmed data, and stale pages/requests cannot undo clear', () => {
  const original = snapshot({ feedbackType: 'thumbs_down', feedbackComment: 'original', feedbackAt: now + 2000 });
  const pending = feedback.applyChatTimelineRunFeedback(original, 'run', {
    pending: { requestId: 'clear', feedback: null }
  });
  const saved = serializeChatTimelineState(pending),
    restored = deserializeChatTimelineState(saved.meta, saved.nodes)!;
  assert.equal(getChatTimelineRun(restored, 'run')!.feedbackPending, undefined);
  assert.equal(getChatTimelineRun(restored, 'run')!.feedback!.comment, 'original');
  const rejected = feedback.applyChatTimelineRunFeedback(pending, 'run', { pending: null });
  assert.equal(getChatTimelineRun(rejected, 'run')!.feedback, getChatTimelineRun(original, 'run')!.feedback);
  const cleared = feedback.applyChatTimelineRunFeedback(pending, 'run', { feedback: null, pending: null });
  assert.equal(
    getChatTimelineRun(
      mergeChatTimelineState(cleared, original, false, { baseline: original, historicalPage: false }),
      'run'
    )!.feedback,
    null
  );
  assert.equal(getChatTimelineRun(mergeChatTimelineState(cleared, original, true), 'run')!.feedback, null);
  assert.equal(
    getChatTimelineRun(
      mergeChatTimelineState(original, snapshot(), false, { baseline: original, historicalPage: false }),
      'run'
    )!.feedback,
    null
  );
  assert.equal(
    getChatTimelineRun(
      mergeChatTimelineState(original, snapshot(), true, { baseline: original, historicalPage: false }),
      'run'
    )!.feedback,
    null,
    'Desktop retention must not suppress authoritative clear'
  );
  assert.equal(
    getChatTimelineRun(mergeChatTimelineState(pending, snapshot(), false), 'run')!.feedbackPending!.requestId,
    'clear'
  );
});

test('Native feedback editor edits the existing comment, blocks repeated submit, shows failure and isolates unmounted responses', async () => {
  const { readFileSync } = await import('node:fs'),
    { createRequire } = await import('node:module'),
    { transformSync } = await import('@babel/core');
  const React = await import('react'),
    { act, create } = await import('react-test-renderer');
  const { defaultT } = await import('../../src/shared/i18n/translate.ts');
  const protocol = await import('../../src/core/api/services/chatFeedbackProtocol.ts');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const url = new URL('../../src/features/chatPersistence/components/ChatRunFeedback.tsx', import.meta.url);
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
  const calls: any[] = [];
  let reject!: (error: Error) => void;
  const deps: Record<string, unknown> = {
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Modal: 'Modal',
      Platform: { OS: 'android' },
      Pressable: 'Pressable',
      Text: 'Text',
      TextInput: 'TextInput',
      View: 'View'
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../core/api/services/chatFeedbackProtocol.ts': protocol,
    '../../../shared/components/ScreenHeader': {
      ScreenHeader: ({ leftActions, rightActions }: any) =>
        React.createElement('Header', null, ...leftActions, ...rightActions)
    },
    '../../../shared/i18n': { useT: () => defaultT },
    '../../chatRealtime/chatSyncService': {
      chatSyncService: {
        submitRunFeedback: async (...args: any[]) => {
          calls.push(args);
          return new Promise((_resolve, fail) => {
            reject = fail;
          });
        }
      }
    }
  };
  const require = createRequire(import.meta.url),
    module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  const Component = module.exports.ChatRunFeedback,
    node = getChatTimelineRun(
      snapshot({ feedbackType: 'thumbs_down', feedbackComment: 'original', feedbackAt: now }),
      'run'
    )!;
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(Component, { conversationId: 'chat', node }));
  });
  const button = (key: any) =>
    renderer.root
      .findAllByType('Pressable')
      .find((n: any) => n.findAllByType('Text').some((t: any) => t.props.children === defaultT(key)));
  try {
    await act(async () => button('runFeedback.downvoted').props.onPress());
    assert.equal(renderer.root.findByType('TextInput').props.value, 'original');
    assert.equal(renderer.root.findByType('TextInput').props.maxLength, 4000);
    await act(async () => renderer.root.findByType('TextInput').props.onChangeText('new comment'));
    await act(async () => button('runFeedback.submit').props.onPress());
    assert.deepEqual(calls[0], ['chat', 'run', 'thumbs_down', 'new comment']);
    assert.equal(renderer.root.findAllByType('Modal').length, 0);
    await act(async () => button('runFeedback.clear').props.onPress());
    assert.equal(calls.length, 1);
    const pending = {
      ...node,
      feedbackPending: { requestId: 'pending', feedback: { type: 'thumbs_down', comment: 'new comment' } }
    };
    await act(async () => renderer.update(React.createElement(Component, { conversationId: 'chat', node: pending })));
    assert.equal(button('runFeedback.downvoted').props.disabled, true);
    await act(async () => {
      reject(new Error('not allowed'));
      await Promise.resolve();
    });
    await act(async () => renderer.update(React.createElement(Component, { conversationId: 'chat', node })));
    assert.ok(renderer.root.findAllByType('Text').some((n: any) => String(n.props.children).includes('not allowed')));
    await act(async () => button('runFeedback.downvoted').props.onPress());
    assert.equal(renderer.root.findByType('TextInput').props.value, 'new comment');
    await act(async () => button('runFeedback.cancel').props.onPress());
    await act(async () => button('runFeedback.clear').props.onPress());
    assert.deepEqual(calls[1], ['chat', 'run', 'clear', undefined]);
    await act(async () => renderer.unmount());
    await act(async () => reject(new Error('stale error')));
  } finally {
    if (renderer.toJSON()) await act(async () => renderer.unmount());
  }
});
