import assert from 'node:assert/strict';
import test from 'node:test';

import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ChatConversationAwaitingState,
  ChatConversationRuntimeState,
} from '../../src/features/chatRealtime/types.ts';
import {
  deriveChatComposerPrimaryAction,
  deriveChatDetailHeaderRuntimeState,
} from '../../src/features/chatPersistence/chatDetailViewModel.ts';
import { useChatDetailAwaitingOverlay } from '../../src/features/chatPersistence/useChatDetailAwaitingOverlay.ts';
import {
  applyChatTimelineEvent,
  applyChatTimelineLocalCancel,
  createChatTimelineState,
} from '../../src/features/chatTimeline/index.ts';

type AwaitingHookSnapshot = ReturnType<typeof useChatDetailAwaitingOverlay>;

const awaitingQuestion: ChatConversationAwaitingState = {
  id: 'awaiting-1',
  runId: 'run-1',
  createdAt: 90,
  prompt: 'Need reply',
  answer: '',
  payloadText: '',
  mode: 'question',
  status: 'ask',
  interactive: null,
  updatedAt: 100,
};

const baseRuntimeState: ChatConversationRuntimeState = {
  conversationId: 'chat-1',
  entries: [],
  awaiting: null,
  usageLabel: '',
  updatedAt: 0,
};

function AwaitingHookHarness({
  resetKey,
  runtimeState,
  onValue,
}: {
  resetKey: string;
  runtimeState: ChatConversationRuntimeState;
  onValue: (value: AwaitingHookSnapshot) => void;
}) {
  const value = useChatDetailAwaitingOverlay(runtimeState, resetKey);

  useEffect(() => {
    onValue(value);
  }, [onValue, value]);

  return null;
}

test('awaiting overlay auto-opens unseen awaiting ids and supports manual reopen', async () => {
  let latest: AwaitingHookSnapshot | null = null;
  const handleValue = (value: AwaitingHookSnapshot) => {
    latest = value;
  };
  const runtimeState = {
    ...baseRuntimeState,
    awaiting: awaitingQuestion,
  };

  await act(async () => {
    create(
      React.createElement(AwaitingHookHarness, {
        resetKey: 'chat-1',
        runtimeState,
        onValue: handleValue,
      })
    );
  });

  assert.equal(latest?.awaitingSummary?.id, 'awaiting-1');
  assert.equal(latest?.awaitingSummary?.isOverlayVisible, true);

  await act(async () => {
    latest?.handleDismissAwaitingOverlay();
  });
  assert.equal(latest?.awaitingSummary?.isOverlayVisible, false);

  await act(async () => {
    latest?.handleOpenAwaitingOverlay();
  });
  assert.equal(latest?.awaitingSummary?.isOverlayVisible, true);
});

test('awaiting overlay ignores runtime state from a different conversation', async () => {
  let latest: AwaitingHookSnapshot | null = null;
  const handleValue = (value: AwaitingHookSnapshot) => {
    latest = value;
  };

  await act(async () => {
    create(
      React.createElement(AwaitingHookHarness, {
        resetKey: 'chat-2',
        runtimeState: {
          ...baseRuntimeState,
          awaiting: awaitingQuestion,
        },
        onValue: handleValue,
      })
    );
  });

  assert.equal(latest?.awaitingSummary, null);
});

test('awaiting overlay ignores answered awaiting state', async () => {
  let latest: AwaitingHookSnapshot | null = null;
  const handleValue = (value: AwaitingHookSnapshot) => {
    latest = value;
  };

  await act(async () => {
    create(
      React.createElement(AwaitingHookHarness, {
        resetKey: 'chat-1',
        runtimeState: {
          ...baseRuntimeState,
          awaiting: {
            ...awaitingQuestion,
            answer: 'approved',
            status: 'answer',
          },
        },
        onValue: handleValue,
      })
    );
  });

  assert.equal(latest?.awaitingSummary, null);
});

test('detail header runtime state is derived from the timeline in one place', () => {
  let state = createChatTimelineState('chat-1');

  assert.deepEqual(deriveChatDetailHeaderRuntimeState(state), {
    statusTone: 'idle',
    statusLabel: '空闲',
    usageLabel: '',
    usageSummary: null,
    runAction: null,
  });

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: 100,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'usage.snapshot',
    runId: 'run-1',
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
    timestamp: 110,
  });

  let headerState = deriveChatDetailHeaderRuntimeState(state);
  assert.equal(headerState.statusTone, 'running');
  assert.equal(headerState.statusLabel, '运行中');
  assert.equal(headerState.usageLabel, '输入 10 · 输出 4 · 总计 14');
  assert.equal(headerState.usageSummary?.current.promptTokens, 10);
  assert.equal(headerState.runAction, 'stop');

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.error',
    runId: 'run-1',
    timestamp: 120,
  });
  headerState = deriveChatDetailHeaderRuntimeState(state);
  assert.equal(headerState.statusTone, 'error');
  assert.equal(headerState.statusLabel, '异常');
  assert.equal(headerState.usageLabel, '输入 10 · 输出 4 · 总计 14');
  assert.equal(headerState.usageSummary?.current.totalTokens, 14);
  assert.equal(headerState.runAction, 'resume');

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    runId: 'run-2',
    timestamp: 130,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.complete',
    runId: 'run-2',
    timestamp: 140,
  });
  headerState = deriveChatDetailHeaderRuntimeState(state);
  assert.equal(headerState.statusTone, 'error');
  assert.equal(headerState.statusLabel, '异常');
  assert.equal(headerState.usageLabel, '输入 10 · 输出 4 · 总计 14');
  assert.equal(headerState.runAction, null);
});

test('detail header ignores stale active child nodes after a terminal run event', () => {
  let state = createChatTimelineState('chat-1');
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: 100,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'content.delta',
    runId: 'run-1',
    contentId: 'answer-1',
    delta: 'partial',
    timestamp: 110,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 120,
  });

  const headerState = deriveChatDetailHeaderRuntimeState(state);

  assert.equal(headerState.statusTone, 'idle');
  assert.equal(headerState.statusLabel, '空闲');
  assert.equal(headerState.runAction, null);
});

test('local run cancel returns detail header and composer to idle send state', () => {
  let state = createChatTimelineState('chat-1');
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: 100,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'content.delta',
    runId: 'run-1',
    contentId: 'answer-1',
    delta: 'partial',
    timestamp: 110,
  });

  state = applyChatTimelineLocalCancel(state, 'chat-1', {
    runId: 'run-1',
    timestamp: 120,
  });
  const headerState = deriveChatDetailHeaderRuntimeState(state);

  assert.equal(headerState.statusTone, 'idle');
  assert.equal(headerState.statusLabel, '空闲');
  assert.equal(headerState.runAction, null);
  assert.equal(
    deriveChatComposerPrimaryAction({
      draft: '',
      sending: false,
      runAction: headerState.runAction,
    }),
    'send-disabled'
  );
  assert.equal(
    deriveChatComposerPrimaryAction({
      draft: '继续',
      sending: false,
      runAction: headerState.runAction,
    }),
    'send'
  );
});
