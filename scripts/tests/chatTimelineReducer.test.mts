import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessageItem } from '../../src/features/chatPersistence/types.ts';
import type { ChatTimelineState } from '../../src/features/chatTimeline/index.ts';
import {
  applyChatTimelineEvent,
  applyChatTimelineLocalCancel,
  applyChatTimelineMessage,
  applyChatTimelineStreamDelta,
  buildChatTimelineDisplayItems,
  compactChatTimelineRequestEchoes,
  createChatTimelineState,
  deriveChatTimelineState,
  deriveChatTimelineStateFromMessages,
  getActiveChatTimelineFrontendTool,
  getAwaitingInteractiveTimeout,
  getChatTimelineActiveRunId,
  mergeChatTimelineState,
  patchChatTimelineMessage,
  projectTimelineMessages,
  projectTimelineRuntimeState,
  resolveChatTimelineFrontendTool,
} from '../../src/features/chatTimeline/index.ts';

const feedbackQuestion = {
  id: 'q1',
  options: [{ label: '主动汇报' }, { label: '按需反馈' }],
  question: '仙尊大人喜欢怎样的向上反馈节奏？',
  type: 'select',
};

const painPointQuestion = {
  id: 'q2',
  options: [{ label: '需求反馈' }, { label: '技术难题' }],
  question: '日常工作中最头疼的是什么？',
  type: 'select',
};

function questionAwaitingAsk(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'awaiting.ask',
    awaitingId: 'question-1',
    mode: 'question',
    viewportType: 'builtin',
    viewportKey: 'question',
    timeout: 180000,
    runId: 'run-question',
    agentKey: 'askUser.demo',
    questions: [feedbackQuestion],
    timestamp: 300000,
    ...overrides,
  };
}

function createActiveReasoningState(): ChatTimelineState {
  let state = createChatTimelineState('chat-1');
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: 100,
  });
  return applyChatTimelineEvent(state, 'chat-1', {
    type: 'reasoning.delta',
    runId: 'run-1',
    reasoningId: 'reason-1',
    reasoningLabel: 'Computing',
    delta: 'Need a short answer.',
    timestamp: 110,
  });
}

function assistantStreamMessage(content: string, createdAt: number): ChatMessageItem {
  return {
    messageId: 'assistant:chat-1:run-1:content',
    clientMessageId: null,
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'assistant',
    content,
    createdAt,
    deliveryStatus: 'sent',
    streamStatus: 'streaming',
    errorReason: null,
    attachments: [],
  };
}

test('timeline reducer replays mixed chat events into one flat ordered state', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      createdAt: 100,
    },
    {
      type: 'run.start',
      runId: 'run-1',
      createdAt: 105,
    },
    {
      type: 'reasoning.start',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: 'first',
      createdAt: 110,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: ' second',
      createdAt: 115,
    },
    {
      type: 'tool.args',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'search',
      args: { query: 'zenmind' },
      createdAt: 120,
    },
    {
      type: 'tool.result',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'search',
      result: { ok: true },
      createdAt: 130,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'world',
      createdAt: 140,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'approval-1',
      prompt: 'approve?',
      requiresApproval: true,
      createdAt: 150,
    },
    {
      type: 'usage.snapshot',
      runId: 'run-1',
      contextWindow: {
        currentSize: 14,
        maxSize: 100,
        estimatedNextCallSize: 18,
        modelKey: 'gpt-5-mini',
        reasoningEffort: 'MEDIUM',
      },
      usage: {
        current: {
          promptTokens: 10,
          completionTokens: 4,
          totalTokens: 14,
          promptTokensDetails: {
            cacheHitTokens: 2,
            cacheMissTokens: 8,
          },
          completionTokensDetails: {
            reasoningTokens: 1,
          },
          timing: {
            firstTokenLatencyMs: 820,
            generationDurationMs: 880,
          },
          llmChatCompletionCount: 1,
        },
        run: {
          promptTokens: 10,
          completionTokens: 4,
          totalTokens: 14,
          timing: {
            firstTokenLatencyTotalMs: 10_600,
            firstTokenLatencyCount: 1,
            generationDurationMs: 880,
          },
          llmChatCompletionCount: 1,
        },
        chat: {
          promptTokens: 10,
          completionTokens: 4,
          totalTokens: 14,
          promptTokensDetails: {
            cacheHitTokens: 2,
            cacheMissTokens: 8,
          },
          timing: {
            firstTokenLatencyTotalMs: 21_200,
            firstTokenLatencyCount: 2,
            generationDurationMs: 1_760,
          },
          llmChatCompletionCount: 1,
        },
      },
      createdAt: 160,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      createdAt: 170,
    },
  ]);

  const messages = projectTimelineMessages(state);
  const runtime = projectTimelineRuntimeState(state);
  const displayItems = buildChatTimelineDisplayItems(state);

  assert.equal(state.conversationId, 'chat-1');
  assert.equal(state.activeRunId, '');
  assert.deepEqual(
    messages.map((message) => [message.role, message.content]),
    [
      ['user', 'hello'],
      ['assistant', 'world'],
    ]
  );
  assert.equal(
    runtime.entries.some((entry) => entry.kind === 'reasoning'),
    true
  );
  assert.equal(
    runtime.entries.some((entry) => entry.kind === 'tool'),
    true
  );
  assert.equal(runtime.awaiting, null);
  assert.equal(runtime.usageLabel, '');
  assert.equal(state.usageSummary?.modelKey, 'gpt-5-mini');
  assert.equal(state.usageSummary?.contextWindow.percent, 14);
  assert.equal(state.usageSummary?.contextWindow.reasoningEffort, 'MEDIUM');
  assert.equal(state.usageSummary?.current.reasoningTokens, 1);
  assert.equal(state.usageSummary?.current.timing.firstTokenLatencyMs, 820);
  assert.equal(state.usageSummary?.run.timing.firstTokenLatencyTotalMs, 10_600);
  assert.equal(state.usageSummary?.chat.timing.generationDurationMs, 1_760);
  assert.equal(state.usageSummary?.chat.cacheHitTokens, 2);
  assert.deepEqual(
    displayItems.map((item) => item.kind),
    ['user-query', 'reasoning', 'tool', 'assistant-content', 'awaiting', 'assistant-reply-footer']
  );
});

test('timeline reducer keeps timing-only usage snapshots', () => {
  const state = deriveChatTimelineState('chat-timing-only', [
    {
      type: 'usage.snapshot',
      runId: 'run-timing-only',
      usage: {
        run: {
          timing: {
            firstTokenLatencyTotalMs: 10_600,
            firstTokenLatencyCount: 1,
            generationDurationMs: 880,
          },
        },
      },
      timestamp: 160,
    },
  ]);

  assert.equal(state.usageSummary?.run.timing.firstTokenLatencyTotalMs, 10_600);
  assert.equal(state.usageSummary?.run.timing.firstTokenLatencyCount, 1);
  assert.equal(state.usageSummary?.run.timing.generationDurationMs, 880);
});

test('timeline reducer projects run errors as system alert messages', () => {
  const state = deriveChatTimelineState('chat-error', [
    {
      type: 'run.start',
      runId: 'run-error',
      timestamp: 100,
    },
    {
      type: 'run.error',
      runId: 'run-error',
      error: {
        code: 'stream_failed',
        category: 'chat_run',
        scope: 'run',
        status: 500,
        retryable: false,
        message: 'provider deepseek has empty apiKey',
      },
      timestamp: 120,
    },
  ]);

  const systemNode = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .find((node) => node?.kind === 'message' && node.role === 'system');
  const displayItems = buildChatTimelineDisplayItems(state);
  const messages = projectTimelineMessages(state);

  assert.equal(state.activeRunId, '');
  assert.equal(systemNode?.kind, 'message');
  if (!systemNode || systemNode.kind !== 'message') {
    throw new Error('expected system message node');
  }
  assert.equal(systemNode.role, 'system');
  assert.equal(systemNode.content, 'provider deepseek has empty apiKey');
  assert.equal(systemNode.lifecycle, 'error');
  assert.equal(systemNode.errorDetail?.code, 'stream_failed');
  assert.equal(systemNode.errorDetail?.status, 500);
  assert.equal(systemNode.errorDetail?.message, 'provider deepseek has empty apiKey');
  assert.deepEqual(messages, []);
  assert.deepEqual(displayItems.map((item) => item.kind), ['system-message']);
});

test('timeline reducer keeps repeated run errors as distinct system alerts', () => {
  const state = deriveChatTimelineState('chat-error-repeat', [
    {
      type: 'run.start',
      runId: 'run-error',
      timestamp: 100,
    },
    {
      type: 'run.error',
      runId: 'run-error',
      error: {
        code: 'stream_failed',
        message: 'first provider error',
      },
      timestamp: 120,
    },
    {
      type: 'run.error',
      runId: 'run-error',
      error: {
        code: 'stream_failed',
        message: 'second provider error',
      },
      timestamp: 140,
    },
  ]);

  const systemNodes = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node?.kind === 'message' && node.role === 'system');

  assert.equal(systemNodes.length, 2);
  assert.equal(systemNodes[0]?.kind, 'message');
  assert.equal(systemNodes[1]?.kind, 'message');
  if (systemNodes[0]?.kind !== 'message' || systemNodes[1]?.kind !== 'message') {
    throw new Error('expected repeated system message nodes');
  }
  assert.notEqual(systemNodes[0].id, systemNodes[1].id);
  assert.notEqual(systemNodes[0].messageId, systemNodes[1].messageId);
  assert.equal(systemNodes[0].errorDetail?.message, 'first provider error');
  assert.equal(systemNodes[1].errorDetail?.message, 'second provider error');
});

test('timeline normalizes builtin plan awaiting into interactive confirmation', () => {
  const state = deriveChatTimelineState('chat-plan', [
    {
      type: 'run.start',
      runId: 'run-plan',
      timestamp: 100,
    },
    {
      type: 'planning.snapshot',
      runId: 'run-plan',
      planningId: 'planning-1',
      text: '# 实施计划\n\n## Summary\n\n改成红色主题。',
      timestamp: 110,
    },
    {
      type: 'awaiting.ask',
      awaitingId: 'call-plan',
      mode: 'plan',
      viewportType: 'builtin',
      viewportKey: 'plan',
      runId: 'run-plan',
      agentKey: 'coder-pomodoro-app',
      plan: {
        id: 'confirm',
        planningId: 'planning-1',
        title: '实施此计划？',
        options: [
          { decision: 'approve', label: '是，实施此计划' },
          {
            decision: 'reject',
            input: {
              placeholder: '请告知如何调整',
              required: false,
              type: 'text',
            },
            label: '否，请告知如何调整',
          },
        ],
      },
      timestamp: 120,
    },
  ]);

  const awaiting = state.awaiting;
  const planInteractive = awaiting?.interactive?.kind === 'plan' ? awaiting.interactive : null;
  const runtime = projectTimelineRuntimeState(state);
  const displayItems = buildChatTimelineDisplayItems(state);

  assert.equal(awaiting?.mode, 'plan');
  assert.equal(awaiting?.interactive?.kind, 'plan');
  assert.equal(planInteractive?.agentKey, 'coder-pomodoro-app');
  assert.equal(planInteractive?.plan.planningId, 'planning-1');
  assert.deepEqual(
    planInteractive?.plan.options?.map((option) => [option.decision, option.label]),
    [
      ['approve', '是，实施此计划'],
      ['reject', '否，请告知如何调整'],
    ]
  );
  assert.equal(runtime.awaiting?.interactive?.kind, 'plan');
  assert.equal(
    displayItems.some((item) => item.kind === 'planning' && item.node.kind === 'planning'),
    true
  );
});

test('timeline normalizes flattened direct plan interactive payloads', () => {
  const state = deriveChatTimelineState('chat-plan-direct', [
    {
      type: 'awaiting.ask',
      awaitingId: 'call-plan',
      runId: 'run-plan',
      interactive: {
        kind: 'plan',
        viewportType: 'builtin',
        viewportKey: 'plan',
        agentKey: 'coder-pomodoro-app',
        id: 'confirm',
        planningId: 'planning-direct',
        title: '实施此计划？',
        options: [{ decision: 'approve', label: '是，实施此计划' }],
      },
      timestamp: 120,
    },
  ]);

  const awaiting = state.awaiting;
  const planInteractive = awaiting?.interactive?.kind === 'plan' ? awaiting.interactive : null;

  assert.equal(awaiting?.mode, 'plan');
  assert.equal(planInteractive?.agentKey, 'coder-pomodoro-app');
  assert.equal(planInteractive?.plan.id, 'confirm');
  assert.equal(planInteractive?.plan.planningId, 'planning-direct');
  assert.deepEqual(
    planInteractive?.plan.options?.map((option) => [option.decision, option.label]),
    [['approve', '是，实施此计划']]
  );
});

test('timeline attachment ids are scoped to their message when upload references repeat', () => {
  const state = deriveChatTimelineState('chat-attachments', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'first image',
      references: [
        {
          id: 'r01',
          type: 'image',
          name: 'photo.png',
          mimeType: 'image/png',
          url: '/api/resource?file=chat-attachments%2Fphoto.png',
        },
      ],
      createdAt: 100,
    },
    {
      type: 'request.query',
      requestId: 'req-2',
      message: 'same upload echoed again',
      references: [
        {
          id: 'r01',
          type: 'image',
          name: 'photo.png',
          mimeType: 'image/png',
          url: '/api/resource?file=chat-attachments%2Fphoto.png',
        },
      ],
      createdAt: 200,
    },
  ]);

  const messages = projectTimelineMessages(state);
  const attachmentIds = messages.map((message) => message.attachments[0]?.attachmentId);

  assert.equal(messages.length, 2);
  assert.equal(new Set(attachmentIds).size, 2);
  assert.match(String(attachmentIds[0]), /^remote:user:req-1:attachment:1:r01$/);
  assert.match(String(attachmentIds[1]), /^remote:user:req-2:attachment:1:r01$/);
});

test('timeline merges request echo into the local pending attachment message', () => {
  const localMessage: ChatMessageItem = {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-attachments',
    role: 'user',
    content: '图中内容是什么',
    createdAt: 100,
    deliveryStatus: 'pending',
    errorReason: null,
    attachments: [
      {
        attachmentId: 'client-message-1:attachment:1:r01',
        messageId: 'client-message-1',
        conversationId: 'chat-attachments',
        name: 'Screenshot.jpg',
        kind: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: 261475,
        width: null,
        height: null,
        localUri: '',
        previewUri: null,
        resourceUrl: '/ap/api/resource?file=chat-attachments%2FScreenshot.jpg',
        sha256: 'hash',
        status: 'ready',
        errorReason: null,
        references: [
          {
            id: 'r01',
            type: 'file',
            name: 'Screenshot.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 261475,
            url: '/ap/api/resource?file=chat-attachments%2FScreenshot.jpg',
            sha256: 'hash',
          },
        ],
        createdAt: 100,
        updatedAt: 100,
      },
    ],
  };

  const localState = applyChatTimelineMessage(createChatTimelineState('chat-attachments'), localMessage);
  const echoedState = applyChatTimelineEvent(localState, 'chat-attachments', {
    type: 'request.query',
    requestId: 'client-message-1',
    message: '图中内容是什么',
    references: [
      {
        id: 'r01',
        type: 'file',
        name: 'Screenshot.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 261475,
        url: '/api/resource?file=chat-attachments%2FScreenshot.jpg',
        sha256: 'hash',
      },
    ],
    createdAt: 200,
  });

  const messages = projectTimelineMessages(echoedState);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].clientMessageId, 'client-message-1');
  assert.equal(messages[0].deliveryStatus, 'sent');
  assert.equal(messages[0].attachments[0]?.resourceUrl, '/api/resource?file=chat-attachments%2FScreenshot.jpg');
});

test('timeline reducer treats content snapshots as complete messages', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'final answer',
      timestamp: 100,
    },
  ]);
  const [message] = projectTimelineMessages(state);
  const node = state.nodesById[state.orderedNodeIds[0]];

  assert.equal(message?.content, 'final answer');
  assert.equal(message?.streamStatus, 'done');
  assert.equal(node?.kind, 'message');
  assert.equal(node?.lifecycle, 'complete');
});

test('timeline reducer ignores empty content starts until real assistant text arrives', () => {
  const afterStart = deriveChatTimelineState('chat-1', [
    {
      type: 'content.start',
      runId: 'run-1',
      contentId: 'answer-1',
      timestamp: 100,
    },
  ]);
  const afterDelta = applyChatTimelineEvent(afterStart, 'chat-1', {
    type: 'content.delta',
    runId: 'run-1',
    contentId: 'answer-1',
    delta: 'hello',
    timestamp: 110,
  });

  assert.equal(projectTimelineMessages(afterStart).length, 0);
  assert.equal(projectTimelineMessages(afterDelta)[0]?.content, 'hello');
});

test('timeline reducer merges assistant content when server message id arrives late', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      delta: 'hel',
      timestamp: 110,
    },
  ]);

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'content.end',
    runId: 'run-1',
    serverMessageId: 'server-assistant-1',
    text: 'hello',
    timestamp: 120,
  });

  const assistantNodes = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'assistant');
  const messages = projectTimelineMessages(state);

  assert.equal(assistantNodes.length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.content, 'hello');
  assert.equal(messages[0]?.serverMessageId, 'server-assistant-1');
  assert.equal(messages[0]?.messageId, 'assistant:chat-1:run-1:content');
  assert.equal(assistantNodes[0]?.lifecycle, 'complete');
});

test('timeline reducer merges run-scoped reasoning events with late stable ids and unstable labels', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningLabel: 'Computing',
      delta: 'Simple greeting, just respond briefly.',
      timestamp: 110,
    },
  ]);
  let runtime = projectTimelineRuntimeState(state);
  let reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  let reasoningNode = reasoningNodes[0];

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNode?.title, 'Computing');
  assert.equal(runtime.entries.find((entry) => entry.kind === 'reasoning')?.title, 'Computing');

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'reasoning.snapshot',
    runId: 'run-1',
    contentId: 'reasoning-1',
    reasoningLabel: '正在思考',
    text: 'Simple greeting, just respond briefly.',
    timestamp: 120,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: 130,
  });

  const displayItems = buildChatTimelineDisplayItems(state);
  runtime = projectTimelineRuntimeState(state);
  reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  reasoningNode = reasoningNodes[0];

  assert.equal(reasoningNodes.length, 1);
  assert.deepEqual(displayItems.map((item) => item.kind), ['reasoning']);
  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.title, '');
  assert.equal(reasoningNode?.body, 'Simple greeting, just respond briefly.');
  assert.equal(reasoningNode?.lifecycle, 'complete');
  assert.equal(runtime.entries.find((entry) => entry.kind === 'reasoning')?.title, '');
  assert.equal(state.activeRunId, '');
});

test('timeline reducer keeps reasoning in one node when run id appears after the first delta', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      reasoningId: 'reason-1',
      delta: 'first half ',
      timestamp: 110,
    },
  ]);

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'reasoning.delta',
    runId: 'run-1',
    reasoningId: 'reason-1',
    delta: 'second half',
    timestamp: 120,
  });

  const reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  const reasoningDisplayItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'reasoning'
  );

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNodes[0]?.body, 'first half second half');
  assert.equal(reasoningNodes[0]?.runId, 'run-1');
  assert.equal(reasoningDisplayItems.length, 1);
  assert.equal(reasoningDisplayItems[0]?.node.kind, 'reasoning');
  assert.equal(reasoningDisplayItems[0]?.node.body, 'first half second half');
});

test('timeline reducer keeps reasoning in one node when later deltas omit run id', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'first half ',
      timestamp: 110,
    },
  ]);

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'reasoning.delta',
    reasoningId: 'reason-1',
    delta: 'second half',
    timestamp: 120,
  });

  const reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  const reasoningDisplayItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'reasoning'
  );

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNodes[0]?.body, 'first half second half');
  assert.equal(reasoningNodes[0]?.runId, 'run-1');
  assert.equal(reasoningDisplayItems.length, 1);
  assert.equal(reasoningDisplayItems[0]?.node.kind, 'reasoning');
  assert.equal(reasoningDisplayItems[0]?.node.body, 'first half second half');
});

test('timeline reducer attaches pre-run reasoning to the run once run id arrives', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'reasoning.delta',
      reasoningId: 'reason-1',
      delta: 'first half ',
      timestamp: 90,
    },
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
  ]);

  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'reasoning.delta',
    runId: 'run-1',
    reasoningId: 'reason-1',
    delta: 'second half',
    timestamp: 110,
  });

  const reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  const reasoningDisplayItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'reasoning'
  );

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNodes[0]?.body, 'first half second half');
  assert.equal(reasoningNodes[0]?.runId, 'run-1');
  assert.equal(reasoningDisplayItems.length, 1);
  assert.equal(reasoningDisplayItems[0]?.node.kind, 'reasoning');
  assert.equal(reasoningDisplayItems[0]?.node.body, 'first half second half');
});

test('timeline reducer normalizes active reasoning titles when only the run completes', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningLabel: 'Computing',
      delta: 'Simple greeting, just respond briefly.',
      timestamp: 110,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 120,
    },
  ]);

  const runtime = projectTimelineRuntimeState(state);
  const reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  const reasoningNode = reasoningNodes[0];

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNode?.title, '');
  assert.equal(reasoningNode?.lifecycle, 'complete');
  assert.equal(runtime.entries.find((entry) => entry.kind === 'reasoning')?.title, '');
});

test('timeline reducer completes active reasoning as soon as assistant content starts', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      reasoningLabel: 'Computing',
      delta: 'Need a short answer.',
      timestamp: 110,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'Final answer begins.',
      timestamp: 120,
    },
  ]);

  const reasoningNode = Object.values(state.nodesById).find((node) => node.kind === 'reasoning');
  const assistantNode = Object.values(state.nodesById).find(
    (node) => node.kind === 'message' && node.role === 'assistant'
  );

  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.title, '');
  assert.equal(reasoningNode?.lifecycle, 'complete');
  assert.equal('streaming' in reasoningNode! ? reasoningNode.streaming : true, false);
  assert.equal(assistantNode?.kind, 'message');
  assert.equal(assistantNode?.lifecycle, 'active');
  assert.equal(assistantNode?.runId, 'run-1');
});

test('timeline reducer keeps idless reasoning deltas attached after tool display close', () => {
  const expectedBody =
    '现在我需要找到各个农历节日的公历日期。， datetime 工具会输出 lunarDate，格式为 "干支年农历月日"。';
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      reasoningLabel: 'Computing',
      delta: '现在我需要找到各个农历节日的公历日期。',
      timestamp: 110,
    },
    {
      type: 'tool.args',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'datetime',
      toolLabel: '日期时间',
      args: {},
      timestamp: 120,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      delta: '， datetime 工具会输出 lunarDate，格式为 "干支年农历月日"。',
      timestamp: 130,
    },
  ]);

  const reasoningNodes = Object.values(state.nodesById).filter((node) => node.kind === 'reasoning');
  const reasoningNode = reasoningNodes[0];
  const reasoningDisplayItems = buildChatTimelineDisplayItems(state).filter(
    (item) => item.kind === 'reasoning'
  );

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.body, expectedBody);
  assert.equal(reasoningNode?.lifecycle, 'active');
  assert.equal('streaming' in reasoningNode! ? reasoningNode.streaming : false, true);
  assert.equal(reasoningDisplayItems.length, 1);
  assert.equal(reasoningDisplayItems[0]?.node.kind, 'reasoning');
  assert.equal(reasoningDisplayItems[0]?.node.body, expectedBody);
});

test('timeline reducer starts new idless reasoning after explicit reasoning snapshot', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: 'first reasoning',
      timestamp: 120,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      delta: 'second reasoning',
      timestamp: 130,
    },
  ]);

  const reasoningNodes = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node?.kind === 'reasoning');

  assert.equal(reasoningNodes.length, 2);
  assert.equal(reasoningNodes[0]?.kind, 'reasoning');
  assert.equal(reasoningNodes[0]?.body, 'first reasoning');
  assert.equal(reasoningNodes[0]?.lifecycle, 'complete');
  assert.equal(reasoningNodes[1]?.kind, 'reasoning');
  assert.equal(reasoningNodes[1]?.id, 'reasoning:chat-1:run-1:reasoning');
  assert.equal(reasoningNodes[1]?.body, 'second reasoning');
  assert.equal(reasoningNodes[1]?.lifecycle, 'active');
});

test('timeline reducer starts new idless reasoning after terminal idless reasoning', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      text: 'first reasoning',
      timestamp: 120,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      delta: 'second reasoning',
      timestamp: 130,
    },
  ]);

  const reasoningNodes = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node?.kind === 'reasoning');

  assert.equal(reasoningNodes.length, 2);
  assert.equal(reasoningNodes[0]?.kind, 'reasoning');
  assert.equal(reasoningNodes[0]?.body, 'first reasoning');
  assert.equal(reasoningNodes[0]?.lifecycle, 'complete');
  assert.equal(reasoningNodes[1]?.kind, 'reasoning');
  assert.notEqual(reasoningNodes[1]?.id, reasoningNodes[0]?.id);
  assert.equal(reasoningNodes[1]?.body, 'second reasoning');
  assert.equal(reasoningNodes[1]?.lifecycle, 'active');
});

test('timeline reducer attaches late stable id to the active idless reasoning segment', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      text: 'first reasoning',
      timestamp: 120,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      delta: 'second reasoning',
      timestamp: 130,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      contentId: 'reasoning-2',
      text: 'second reasoning',
      timestamp: 140,
    },
  ]);

  const reasoningNodes = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node?.kind === 'reasoning');

  assert.equal(reasoningNodes.length, 2);
  assert.equal(reasoningNodes[0]?.kind, 'reasoning');
  assert.equal(reasoningNodes[0]?.body, 'first reasoning');
  assert.equal(reasoningNodes[0]?.lifecycle, 'complete');
  assert.equal(reasoningNodes[1]?.kind, 'reasoning');
  assert.equal(reasoningNodes[1]?.body, 'second reasoning');
  assert.equal(reasoningNodes[1]?.lifecycle, 'complete');
});

test('timeline merge does not revive current reasoning identity after incoming snapshot ends it', () => {
  const current = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'partial answer',
      timestamp: 125,
    },
  ]);
  const incoming = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: 'first reasoning',
      timestamp: 120,
    },
  ]);

  const merged = mergeChatTimelineState(current, incoming);
  const afterDelta = applyChatTimelineEvent(merged, 'chat-1', {
    type: 'reasoning.delta',
    runId: 'run-1',
    delta: 'second reasoning',
    timestamp: 130,
  });
  const reasoningNodes = afterDelta.orderedNodeIds
    .map((nodeId) => afterDelta.nodesById[nodeId])
    .filter((node) => node?.kind === 'reasoning');

  assert.equal(reasoningNodes.length, 2);
  assert.equal(reasoningNodes[0]?.body, 'first reasoning');
  assert.equal(reasoningNodes[0]?.lifecycle, 'complete');
  assert.equal(reasoningNodes[1]?.id, 'reasoning:chat-1:run-1:reasoning');
  assert.equal(reasoningNodes[1]?.body, 'second reasoning');
});

test('timeline merge drops stale incoming reasoning identity after local cancel closes it', () => {
  let current = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
  ]);
  current = applyChatTimelineLocalCancel(current, 'chat-1', {
    runId: 'run-1',
    timestamp: 125,
  });
  const incoming = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'first reasoning',
      timestamp: 110,
    },
  ]);

  const merged = mergeChatTimelineState(current, incoming, {
    preserveTerminalRunIds: ['run-1'],
  });
  const afterDelta = applyChatTimelineEvent(merged, 'chat-1', {
    type: 'reasoning.delta',
    runId: 'run-1',
    delta: 'second reasoning',
    timestamp: 130,
  });
  const reasoningNodes = afterDelta.orderedNodeIds
    .map((nodeId) => afterDelta.nodesById[nodeId])
    .filter((node) => node?.kind === 'reasoning');

  assert.deepEqual(merged.activeReasoningNodeIdsByRun, {});
  assert.equal(reasoningNodes.length, 2);
  assert.equal(reasoningNodes[0]?.body, 'first reasoning');
  assert.equal(reasoningNodes[0]?.lifecycle, 'cancelled');
  assert.equal(reasoningNodes[1]?.id, 'reasoning:chat-1:run-1:reasoning');
  assert.equal(reasoningNodes[1]?.body, 'second reasoning');
});

test('timeline reducer completes active reasoning when realtime assistant message carries run id', () => {
  let state = createActiveReasoningState();
  const message = assistantStreamMessage('Final answer begins.', 120);
  state = applyChatTimelineMessage(state, message, { runId: 'run-1' });

  const reasoningNode = Object.values(state.nodesById).find((node) => node.kind === 'reasoning');
  const assistantNode = Object.values(state.nodesById).find(
    (node) => node.kind === 'message' && node.role === 'assistant'
  );

  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.title, '');
  assert.equal(reasoningNode?.lifecycle, 'complete');
  assert.equal('streaming' in reasoningNode! ? reasoningNode.streaming : true, false);
  assert.equal(assistantNode?.kind, 'message');
  assert.equal(assistantNode?.runId, 'run-1');
  assert.equal(assistantNode?.lifecycle, 'active');
});

test('timeline reducer waits for first assistant stream delta before closing reasoning', () => {
  let state = createActiveReasoningState();
  const message = assistantStreamMessage('', 115);
  state = applyChatTimelineMessage(state, message, { runId: 'run-1' });

  let reasoningNode = Object.values(state.nodesById).find((node) => node.kind === 'reasoning');
  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.title, 'Computing');
  assert.equal(reasoningNode?.lifecycle, 'active');

  state = applyChatTimelineStreamDelta(state, {
    messageId: message.messageId,
    createdAt: 120,
    delta: 'Final answer begins.',
    runId: 'run-1',
  });

  reasoningNode = Object.values(state.nodesById).find((node) => node.kind === 'reasoning');
  const assistantNode = Object.values(state.nodesById).find(
    (node) => node.kind === 'message' && node.role === 'assistant'
  );

  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.title, '');
  assert.equal(reasoningNode?.lifecycle, 'complete');
  assert.equal('streaming' in reasoningNode! ? reasoningNode.streaming : true, false);
  assert.equal(assistantNode?.kind, 'message');
  assert.equal(assistantNode?.content, 'Final answer begins.');
  assert.equal(assistantNode?.runId, 'run-1');
});

test('timeline reducer closes reasoning when an assistant placeholder is patched with content', () => {
  let state = createActiveReasoningState();
  const message = assistantStreamMessage('', 115);
  state = applyChatTimelineMessage(state, message, { runId: 'run-1' });
  state = patchChatTimelineMessage(
    state,
    message.messageId,
    {
      content: 'Final answer begins.',
      createdAt: 120,
    },
    { runId: 'run-1' }
  );

  const reasoningNode = Object.values(state.nodesById).find((node) => node.kind === 'reasoning');
  const assistantNode = Object.values(state.nodesById).find(
    (node) => node.kind === 'message' && node.role === 'assistant'
  );

  assert.equal(reasoningNode?.kind, 'reasoning');
  assert.equal(reasoningNode?.title, '');
  assert.equal(reasoningNode?.lifecycle, 'complete');
  assert.equal('streaming' in reasoningNode! ? reasoningNode.streaming : true, false);
  assert.equal(assistantNode?.kind, 'message');
  assert.equal(assistantNode?.content, 'Final answer begins.');
  assert.equal(assistantNode?.runId, 'run-1');
});

test('timeline reducer closes active run children when the run reaches a terminal state', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'reasoning.delta',
      runId: 'run-1',
      reasoningId: 'reason-1',
      delta: 'thinking',
      timestamp: 110,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'partial answer',
      timestamp: 120,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'approval-1',
      prompt: 'approve?',
      requiresApproval: true,
      timestamp: 130,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 140,
    },
  ]);
  const runtime = projectTimelineRuntimeState(state);
  const [message] = projectTimelineMessages(state);
  const activeChildren = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter(
      (node) =>
        node?.kind !== 'run' &&
        node?.runId === 'run-1' &&
        (node.lifecycle === 'active' || ('streaming' in node && node.streaming))
    );

  assert.equal(state.activeRunId, '');
  assert.equal(activeChildren.length, 0);
  assert.equal(message?.streamStatus, 'done');
  assert.equal(runtime.awaiting, null);
});

test('timeline local cancel closes active run and streaming children', () => {
  let state = createChatTimelineState('chat-1');
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: 100,
  });
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'reasoning.start',
    runId: 'run-1',
    reasoningId: 'reason-1',
    text: 'thinking',
    timestamp: 105,
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

  assert.equal(state.activeRunId, '');
  assert.equal(getChatTimelineActiveRunId(state), '');
  for (const node of Object.values(state.nodesById)) {
    if (node.runId !== 'run-1') {
      continue;
    }
    assert.notEqual(node.lifecycle, 'active');
    if ('streaming' in node) {
      assert.equal(node.streaming, false);
    }
  }
  const runNode = Object.values(state.nodesById).find(
    (node) => node.kind === 'run' && node.runId === 'run-1'
  );
  assert.equal(runNode?.lifecycle, 'cancelled');
});

test('timeline local cancel handles active run events without a run id', () => {
  let state = createChatTimelineState('chat-1');
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'run.start',
    timestamp: 100,
  });

  state = applyChatTimelineLocalCancel(state, 'chat-1', {
    timestamp: 110,
  });

  assert.equal(state.activeRunId, '');
  assert.equal(getChatTimelineActiveRunId(state), '');
  const runNode = Object.values(state.nodesById).find((node) => node.kind === 'run');
  assert.equal(runNode?.lifecycle, 'cancelled');
});

test('timeline local cancel closes the visible runless scope without creating a ghost run', () => {
  let state = createChatTimelineState('chat-1');
  state = applyChatTimelineEvent(state, 'chat-1', {
    type: 'content.delta',
    contentId: 'answer-1',
    delta: 'partial',
    timestamp: 100,
  });
  state = {
    ...state,
    activeRunId: 'ghost-run',
    revision: state.revision + 1,
  };

  state = applyChatTimelineLocalCancel(state, 'chat-1', {
    runId: 'ghost-run',
    timestamp: 110,
  });

  assert.equal(state.activeRunId, '');
  assert.equal(getChatTimelineActiveRunId(state), '');
  assert.equal(
    Object.values(state.nodesById).some(
      (node) => node.kind === 'run' && node.runId === 'ghost-run'
    ),
    false
  );
  for (const node of Object.values(state.nodesById)) {
    assert.notEqual(node.lifecycle, 'active');
    if ('streaming' in node) {
      assert.equal(node.streaming, false);
    }
  }
});

test('timeline local cancel does not rewrite completed run duration', () => {
  let state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'done',
      timestamp: 120,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 180,
    },
  ]);
  const runNodeBefore = Object.values(state.nodesById).find(
    (node) => node.kind === 'run' && node.runId === 'run-1'
  );
  state = {
    ...state,
    activeRunId: 'ghost-run',
    revision: state.revision + 1,
  };

  state = applyChatTimelineLocalCancel(state, 'chat-1', {
    runId: 'ghost-run',
    timestamp: 240,
  });
  const runNodeAfter = Object.values(state.nodesById).find(
    (node) => node.kind === 'run' && node.runId === 'run-1'
  );

  assert.equal(state.activeRunId, '');
  assert.equal(runNodeBefore?.durationMs, 80);
  assert.equal(runNodeAfter?.durationMs, 80);
  assert.equal(runNodeAfter?.lifecycle, 'complete');
  assert.equal(
    Object.values(state.nodesById).some(
      (node) => node.kind === 'run' && node.runId === 'ghost-run'
    ),
    false
  );
});

test('timeline merge keeps a locally cancelled run idle when remote replay is stale active', () => {
  let current = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'partial',
      timestamp: 110,
    },
  ]);
  current = applyChatTimelineLocalCancel(current, 'chat-1', {
    runId: 'run-1',
    timestamp: 120,
  });
  const staleRemote = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 90,
    },
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'run-1',
      contentId: 'answer-1',
      delta: 'partial from stale detail',
      timestamp: 115,
    },
  ]);

  const merged = mergeChatTimelineState(current, staleRemote, {
    preserveTerminalRunIds: ['run-1'],
  });
  const activeRunNodes = Object.values(merged.nodesById).filter(
    (node) =>
      node.runId === 'run-1' &&
      (node.lifecycle === 'active' || ('streaming' in node && node.streaming))
  );
  const runNode = Object.values(merged.nodesById).find(
    (node) => node.kind === 'run' && node.runId === 'run-1'
  );

  assert.equal(merged.activeRunId, '');
  assert.equal(getChatTimelineActiveRunId(merged), '');
  assert.equal(activeRunNodes.length, 0);
  assert.equal(runNode?.lifecycle, 'cancelled');
});

test('timeline merge still accepts a different active run after a local cancel guard', () => {
  let current = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
  ]);
  current = applyChatTimelineLocalCancel(current, 'chat-1', {
    runId: 'run-1',
    timestamp: 120,
  });
  const remote = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-2',
      timestamp: 200,
    },
  ]);

  const merged = mergeChatTimelineState(current, remote, {
    preserveTerminalRunIds: ['run-1'],
  });

  assert.equal(merged.activeRunId, 'run-2');
  assert.equal(getChatTimelineActiveRunId(merged), 'run-2');
});

test('timeline merge suppresses a guarded ghost run without fabricating duration', () => {
  const current = {
    ...createChatTimelineState('chat-1'),
    activeRunId: '',
    revision: 1,
  };
  const staleRemote = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'ghost-run',
      timestamp: 100,
    },
    {
      type: 'content.delta',
      runId: 'ghost-run',
      contentId: 'answer-1',
      delta: 'partial from stale detail',
      timestamp: 110,
    },
  ]);

  const merged = mergeChatTimelineState(current, staleRemote, {
    preserveTerminalRunIds: ['ghost-run'],
  });

  assert.equal(merged.activeRunId, '');
  assert.equal(getChatTimelineActiveRunId(merged), '');
  assert.equal(
    Object.values(merged.nodesById).some(
      (node) =>
        node.runId === 'ghost-run' &&
        (node.lifecycle === 'active' || ('streaming' in node && node.streaming))
    ),
    false
  );
  const runNode = Object.values(merged.nodesById).find(
    (node) => node.kind === 'run' && node.runId === 'ghost-run'
  );
  assert.equal(runNode?.lifecycle, 'cancelled');
  assert.equal(runNode?.durationMs, null);
});

test('timeline reducer merges tool snapshot with runless string result', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'tool.snapshot',
      runId: 'run-1',
      toolId: 'tool-1',
      toolName: 'file_read',
      toolLabel: '读取文件',
      arguments: '{"file_path":"/tmp/a.ts"}',
      timestamp: 110,
    },
    {
      type: 'tool.result',
      toolId: 'tool-1',
      result: '{"content":"export const ok = true;","truncated":false}',
      timestamp: 120,
    },
  ]);

  const toolNodes = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter((node) => node?.kind === 'tool');

  assert.equal(toolNodes.length, 1);
  const tool = toolNodes[0];
  assert.equal(tool?.kind, 'tool');
  if (tool?.kind !== 'tool') {
    throw new Error('expected tool node');
  }
  assert.equal(tool.title, '读取文件');
  assert.equal(tool.runId, 'run-1');
  assert.match(tool.argsText, /file_path/);
  assert.match(tool.resultText, /export const ok/);
});

test('timeline derives one active frontend tool and incrementally parses its params', () => {
  const started = deriveChatTimelineState('chat-tool', [
    {
      type: 'run.start',
      runId: 'run-tool',
      agentKey: 'agent.demo',
      timestamp: 1_700_000_000_000,
    },
    {
      type: 'tool.start',
      runId: 'run-tool',
      toolId: 'tool-form',
      agentKey: 'agent.demo',
      toolName: 'leave_form',
      toolLabel: '请假申请',
      toolType: 'HTML',
      viewportKey: 'leave-form',
      toolTimeout: 60,
      timestamp: 1_700_000_000_100,
    },
    {
      type: 'tool.args',
      runId: 'run-tool',
      toolId: 'tool-form',
      delta: '{"days":',
      timestamp: 1_700_000_000_110,
    },
    {
      type: 'tool.args',
      runId: 'run-tool',
      toolId: 'tool-form',
      delta: '2}',
      timestamp: 1_700_000_000_120,
    },
  ]);

  const active = getActiveChatTimelineFrontendTool(started);
  assert.equal(active?.toolId, 'tool-form');
  assert.equal(active?.toolType, 'html');
  assert.equal(active?.toolTimeoutMs, 60_000);
  assert.deepEqual(active?.toolParams, { days: 2 });
  assert.equal(
    started.orderedNodeIds.filter((nodeId) => started.nodesById[nodeId]?.kind === 'tool').length,
    1
  );

  const completed = applyChatTimelineEvent(started, 'chat-tool', {
    type: 'tool.result',
    runId: 'run-tool',
    toolId: 'tool-form',
    result: { accepted: true },
    timestamp: 1_700_000_000_200,
  });
  assert.equal(getActiveChatTimelineFrontendTool(completed), null);
});

test('timeline only resolves the current frontend tool without completing its server lifecycle', () => {
  const started = deriveChatTimelineState('chat-tool', [
    {
      type: 'tool.start',
      runId: 'run-tool',
      toolId: 'tool-form',
      toolType: 'qlc',
      viewportKey: 'tool-form',
      timestamp: 1_700_000_000_000,
    },
  ]);
  const active = getActiveChatTimelineFrontendTool(started);
  assert.ok(active);

  const stale = resolveChatTimelineFrontendTool(started, 'wrong-key', 'close');
  assert.equal(stale, started);
  const resolved = resolveChatTimelineFrontendTool(
    started,
    active.key,
    'done',
    1_700_000_000_100
  );
  assert.equal(getActiveChatTimelineFrontendTool(resolved), null);
  const toolNode = resolved.nodesById[active.key];
  assert.equal(toolNode?.lifecycle, 'active');
  assert.equal(toolNode?.kind === 'tool' ? toolNode.frontendToolState?.status : '', 'resolved');
});

test('timeline does not resurrect an older frontend tool after the latest one resolves', () => {
  const state = deriveChatTimelineState('chat-tool', [
    {
      type: 'tool.start',
      runId: 'run-tool',
      toolId: 'tool-old',
      toolType: 'html',
      viewportKey: 'tool-old',
      timestamp: 1_700_000_000_000,
    },
    {
      type: 'tool.start',
      runId: 'run-tool',
      toolId: 'tool-latest',
      toolType: 'html',
      viewportKey: 'tool-latest',
      timestamp: 1_700_000_000_100,
    },
  ]);
  const latest = getActiveChatTimelineFrontendTool(state);
  assert.equal(latest?.toolId, 'tool-latest');

  const resolved = resolveChatTimelineFrontendTool(
    state,
    latest?.key || '',
    'close',
    1_700_000_000_200
  );
  assert.equal(getActiveChatTimelineFrontendTool(resolved), null);
});

test('timeline reducer renders structured plan and approval awaiting events', () => {
  const state = deriveChatTimelineState('chat-1', [
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 100,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'plan-1',
      mode: 'plan',
      plan: {
        id: 'confirm',
        title: '实施此计划？',
        options: [
          { decision: 'approve', label: '是，实施此计划' },
          { decision: 'reject', label: '否，请告知如何调整' },
        ],
      },
      timestamp: 110,
    },
    {
      type: 'awaiting.answer',
      runId: 'run-1',
      awaitingId: 'plan-1',
      mode: 'plan',
      status: 'answered',
      plan: {
        id: 'confirm',
        decision: 'approve',
      },
      timestamp: 120,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'approval-1',
      mode: 'approval',
      approvals: [
        {
          id: 'cmd-1',
          command: 'npm run dev',
          description: '启动开发服务器',
          options: [
            { decision: 'approve', label: '同意' },
            { decision: 'approve_rule_run', label: '同意本轮' },
            { decision: 'reject', label: '拒绝' },
          ],
        },
      ],
      timestamp: 130,
    },
  ]);
  const displayItems = buildChatTimelineDisplayItems(state);
  const awaitingNodes = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter((node) => node?.kind === 'awaiting');

  assert.equal(awaitingNodes.length, 2);
  const planNode = awaitingNodes[0];
  assert.equal(planNode?.kind, 'awaiting');
  if (planNode?.kind !== 'awaiting') {
    throw new Error('expected plan awaiting node');
  }
  assert.equal(planNode.mode, 'plan');
  assert.equal(planNode.prompt, '实施此计划？');
  assert.equal(planNode.interactive?.kind, 'plan');
  assert.match(planNode.payloadText, /是，实施此计划/);
  assert.match(planNode.answer, /approve/);
  assert.equal(
    displayItems.some((item) => item.kind === 'awaiting'),
    true
  );
  const runtimeAwaiting = projectTimelineRuntimeState(state).awaiting;
  assert.equal(runtimeAwaiting?.mode, 'approval');
  assert.equal(runtimeAwaiting?.interactive?.kind, 'approval');
  assert.equal(runtimeAwaiting?.interactive?.approvals[0]?.options?.[1]?.decision, 'approve_rule_run');
});

test('timeline reducer keeps absent awaiting options out of normalized payloads', () => {
  const state = deriveChatTimelineState('chat-defaults', [
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'approval-1',
      mode: 'approval',
      approvals: [{ id: 'cmd-1', command: 'npm run dev' }],
      timestamp: 100,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'plan-1',
      mode: 'plan',
      plan: { id: 'confirm', title: '实施此计划？' },
      timestamp: 110,
    },
  ]);
  const awaitingNodes = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter((node) => node?.kind === 'awaiting');
  const approvalNode = awaitingNodes[0];
  const planNode = awaitingNodes[1];

  assert.equal(approvalNode?.kind, 'awaiting');
  assert.equal(planNode?.kind, 'awaiting');
  if (approvalNode?.kind !== 'awaiting' || planNode?.kind !== 'awaiting') {
    throw new Error('expected awaiting nodes');
  }
  assert.equal(approvalNode.interactive?.kind, 'approval');
  assert.equal(planNode.interactive?.kind, 'plan');
  if (approvalNode.interactive?.kind !== 'approval' || planNode.interactive?.kind !== 'plan') {
    throw new Error('expected approval and plan interactions');
  }
  assert.equal(approvalNode.interactive.approvals[0]?.options, undefined);
  assert.equal(planNode.interactive.plan.options, undefined);
});

test('timeline reducer keeps html form awaiting payload structured and handles push aliases', () => {
  const state = deriveChatTimelineState('chat-form', [
    {
      type: 'awaiting.asking',
      runId: 'run-form',
      awaitingId: 'form-1',
      mode: 'form',
      viewportType: 'html',
      viewportKey: 'leave_form',
      forms: [
        {
          id: 'leave',
          action: 'submit_leave_request',
          title: '请假申请',
          form: {
            days: 1,
          },
        },
      ],
      timestamp: 100,
    },
    {
      type: 'awaiting.answered',
      runId: 'run-form',
      awaitingId: 'form-1',
      mode: 'form',
      status: 'answered',
      params: [
        {
          id: 'leave',
          decision: 'approve',
          form: {
            days: 2,
            reason: 'family',
          },
        },
      ],
      timestamp: 120,
    },
  ]);
  const awaiting = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .find((node) => node?.kind === 'awaiting');

  assert.equal(awaiting?.kind, 'awaiting');
  if (awaiting?.kind !== 'awaiting') {
    throw new Error('expected awaiting node');
  }
  assert.equal(awaiting.mode, 'form');
  assert.equal(awaiting.status, 'answer');
  assert.equal(awaiting.interactive?.kind, 'form');
  assert.equal(awaiting.interactive?.viewportType, 'html');
  assert.equal(awaiting.interactive?.viewportKey, 'leave_form');
  assert.equal(awaiting.interactive?.forms[0]?.title, '请假申请');
  assert.equal(awaiting.answerSummary?.itemCount, 1);
  assert.match(awaiting.answerSummary?.items[0]?.value || '', /approve/);
  assert.match(awaiting.answerSummary?.items[0]?.value || '', /family/);
});

test('timeline reducer merges request echo into the pending local user message', () => {
  const localMessage: ChatMessageItem = {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 100,
    deliveryStatus: 'pending',
    errorReason: null,
  };
  const withLocalMessage = applyChatTimelineMessage(null, localMessage);
  const withRequestEcho = applyChatTimelineEvent(withLocalMessage, 'chat-1', {
    type: 'request.query',
    requestId: 'client-message-1',
    runId: 'run-1',
    serverMessageId: 'server-user-1',
    message: 'hello',
    createdAt: 140,
  });
  const displayItems = buildChatTimelineDisplayItems(withRequestEcho);
  const messages = projectTimelineMessages(withRequestEcho);
  const userNodes = withRequestEcho.orderedNodeIds
    .map((id) => withRequestEcho.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 1);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 1);
  assert.equal(userNodes[0]?.messageId, 'client-message-1');
  assert.equal(userNodes[0]?.clientMessageId, 'client-message-1');
  assert.equal(userNodes[0]?.runId, 'run-1');
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
  assert.equal(messages[0]?.serverMessageId, 'server-user-1');
  assert.equal(messages[0]?.deliveryStatus, 'sent');
  assert.equal(userNodes[0]?.id, 'message:chat-1:local:client-message-1');
});

test('timeline reducer merges request echo when backend rewrites request id', () => {
  const localMessage: ChatMessageItem = {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 100,
    deliveryStatus: 'pending',
    errorReason: null,
  };
  const withLocalMessage = applyChatTimelineMessage(null, localMessage);
  const withRequestEcho = applyChatTimelineEvent(withLocalMessage, 'chat-1', {
    type: 'request.query',
    requestId: 'backend-request-1',
    runId: 'run-1',
    message: 'hello',
    createdAt: 140,
  });
  const displayItems = buildChatTimelineDisplayItems(withRequestEcho);
  const messages = projectTimelineMessages(withRequestEcho);
  const userNodes = withRequestEcho.orderedNodeIds
    .map((id) => withRequestEcho.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 1);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
  assert.equal(messages[0]?.deliveryStatus, 'sent');
});

test('timeline reducer merges request echo into a sent local user message without a server id', () => {
  const localMessage: ChatMessageItem = {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 140,
    deliveryStatus: 'sent',
    errorReason: null,
  };
  const withLocalMessage = applyChatTimelineMessage(null, localMessage);
  const withRequestEcho = applyChatTimelineEvent(withLocalMessage, 'chat-1', {
    type: 'request.query',
    requestId: 'backend-request-1',
    runId: 'run-1',
    message: 'hello',
    createdAt: 100,
  });
  const displayItems = buildChatTimelineDisplayItems(withRequestEcho);
  const messages = projectTimelineMessages(withRequestEcho);
  const userNodes = withRequestEcho.orderedNodeIds
    .map((id) => withRequestEcho.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 1);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
  assert.equal(messages[0]?.deliveryStatus, 'sent');
});

test('timeline merge keeps one local user message after error reconcile request replay', () => {
  const current = applyChatTimelineMessage(null, {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 100,
    deliveryStatus: 'failed',
    errorReason: 'provider_quota_exhausted',
  });
  const remoteReplay = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'backend-request-1',
      runId: 'run-1',
      message: 'hello',
      createdAt: 140,
    },
    {
      type: 'run.error',
      runId: 'run-1',
      error: {
        code: 'provider_quota_exhausted',
        status: 429,
        message: 'quota exhausted',
      },
      timestamp: 150,
    },
  ]);
  const merged = mergeChatTimelineState(current, remoteReplay);
  const displayItems = buildChatTimelineDisplayItems(merged);
  const messages = projectTimelineMessages(merged);
  const userNodes = merged.orderedNodeIds
    .map((id) => merged.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');
  const systemErrorNodes = merged.orderedNodeIds
    .map((id) => merged.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'system');

  assert.equal(userNodes.length, 1);
  assert.equal(systemErrorNodes.length, 1);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
  assert.equal(messages[0]?.deliveryStatus, 'failed');
  assert.equal(messages[0]?.errorReason, 'provider_quota_exhausted');
});

test('timeline merge keeps one sent local user message after error reconcile request replay', () => {
  const current = applyChatTimelineMessage(null, {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 140,
    deliveryStatus: 'sent',
    errorReason: null,
  });
  const remoteReplay = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'backend-request-1',
      runId: 'run-1',
      message: 'hello',
      createdAt: 100,
    },
    {
      type: 'run.error',
      runId: 'run-1',
      error: {
        code: 'provider_quota_exhausted',
        status: 429,
        message: 'quota exhausted',
      },
      timestamp: 150,
    },
  ]);
  const merged = mergeChatTimelineState(current, remoteReplay);
  const displayItems = buildChatTimelineDisplayItems(merged);
  const userNodes = merged.orderedNodeIds
    .map((id) => merged.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 1);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 1);
  assert.equal(userNodes[0]?.messageId, 'client-message-1');
  assert.equal(userNodes[0]?.clientMessageId, 'client-message-1');
  assert.equal(userNodes[0]?.runId, 'run-1');
});

test('timeline merge pairs repeated request echoes with repeated local user messages in order', () => {
  let current = applyChatTimelineMessage(
    null,
    {
      messageId: 'client-message-1',
      clientMessageId: 'client-message-1',
      serverMessageId: null,
      conversationId: 'chat-1',
      role: 'user',
      content: 'hello',
      createdAt: 100,
      deliveryStatus: 'sent',
      errorReason: null,
    },
    { runId: 'run-1' }
  );
  current = applyChatTimelineMessage(current, {
    messageId: 'client-message-2',
    clientMessageId: 'client-message-2',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 200,
    deliveryStatus: 'pending',
    errorReason: null,
  });
  const remoteReplay = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'backend-request-1',
      runId: 'run-1',
      message: 'hello',
      createdAt: 110,
    },
    {
      type: 'run.cancel',
      runId: 'run-1',
      timestamp: 150,
    },
    {
      type: 'request.query',
      requestId: 'backend-request-2',
      runId: 'run-2',
      message: 'hello',
      createdAt: 210,
    },
    {
      type: 'run.start',
      runId: 'run-2',
      timestamp: 220,
    },
  ]);

  const merged = mergeChatTimelineState(current, remoteReplay);
  const displayItems = buildChatTimelineDisplayItems(merged);
  const messages = projectTimelineMessages(merged);
  const userNodes = merged.orderedNodeIds
    .map((id) => merged.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 2);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 2);
  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
  assert.equal(userNodes[0]?.runId, 'run-1');
  assert.equal(messages[1]?.messageId, 'client-message-2');
  assert.equal(messages[1]?.clientMessageId, 'client-message-2');
  assert.equal(messages[1]?.deliveryStatus, 'pending');
  assert.equal(userNodes[1]?.runId, 'run-2');
});

test('timeline merge does not reuse an exact remote request echo for a later local repeat', () => {
  let current = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'backend-request-1',
      runId: 'run-1',
      message: 'hello',
      createdAt: 190,
    },
    {
      type: 'run.cancel',
      runId: 'run-1',
      timestamp: 195,
    },
  ]);
  current = applyChatTimelineMessage(current, {
    messageId: 'client-message-2',
    clientMessageId: 'client-message-2',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 200,
    deliveryStatus: 'pending',
    errorReason: null,
  });
  const remoteReplay = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'backend-request-1',
      runId: 'run-1',
      message: 'hello',
      createdAt: 190,
    },
    {
      type: 'run.cancel',
      runId: 'run-1',
      timestamp: 195,
    },
    {
      type: 'request.query',
      requestId: 'backend-request-2',
      runId: 'run-2',
      message: 'hello',
      createdAt: 210,
    },
    {
      type: 'run.start',
      runId: 'run-2',
      timestamp: 220,
    },
  ]);

  const merged = mergeChatTimelineState(current, remoteReplay);
  const displayItems = buildChatTimelineDisplayItems(merged);
  const messages = projectTimelineMessages(merged);
  const userNodes = merged.orderedNodeIds
    .map((id) => merged.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 2);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 2);
  assert.equal(messages.length, 2);
  assert.equal(userNodes[0]?.messageId, 'remote:user:backend-request-1');
  assert.equal(userNodes[0]?.runId, 'run-1');
  assert.equal(messages[1]?.messageId, 'client-message-2');
  assert.equal(messages[1]?.clientMessageId, 'client-message-2');
  assert.equal(userNodes[1]?.runId, 'run-2');
});

test('timeline compaction removes persisted remote request echo when local client message exists', () => {
  const remoteReplay = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'backend-request-1',
      runId: 'run-1',
      message: 'hello',
      createdAt: 100,
    },
    {
      type: 'run.error',
      runId: 'run-1',
      error: {
        code: 'provider_quota_exhausted',
        status: 429,
        message: 'quota exhausted',
      },
      timestamp: 150,
    },
  ]);
  const dirtyState = applyChatTimelineMessage(remoteReplay, {
    messageId: 'client-message-1',
    clientMessageId: 'client-message-1',
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'user',
    content: 'hello',
    createdAt: 140,
    deliveryStatus: 'sent',
    errorReason: null,
  });
  const compacted = compactChatTimelineRequestEchoes(dirtyState)!;
  const displayItems = buildChatTimelineDisplayItems(compacted);
  const messages = projectTimelineMessages(compacted);
  const userNodes = compacted.orderedNodeIds
    .map((id) => compacted.nodesById[id])
    .filter((node) => node?.kind === 'message' && node.role === 'user');

  assert.equal(userNodes.length, 1);
  assert.equal(displayItems.filter((item) => item.kind === 'user-query').length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
});

test('timeline state uses structural sharing for unchanged messages and streaming deltas', () => {
  const message: ChatMessageItem = {
    messageId: 'assistant-1',
    clientMessageId: null,
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'assistant',
    content: 'Hel',
    createdAt: 100,
    deliveryStatus: 'sent',
    streamStatus: 'streaming',
    errorReason: null,
  };
  const initial = deriveChatTimelineStateFromMessages('chat-1', [message]);
  const unchanged = applyChatTimelineMessage(initial, message);
  const appended = applyChatTimelineStreamDelta(initial, {
    messageId: 'assistant-1',
    createdAt: 110,
    delta: 'lo',
  });
  const snapshotted = applyChatTimelineStreamDelta(appended, {
    messageId: 'assistant-1',
    createdAt: 120,
    delta: '',
    snapshotText: 'Hello world',
  });
  const completed = patchChatTimelineMessage(snapshotted, 'assistant-1', {
    streamStatus: 'done',
  });
  const [projected] = projectTimelineMessages(completed);

  assert.equal(unchanged, initial);
  assert.notEqual(appended, initial);
  assert.equal(projectTimelineMessages(appended)[0]?.content, 'Hello');
  assert.equal(projected?.content, 'Hello world');
  assert.equal(projected?.streamStatus, 'done');
});

test('timeline reducer uses the same assistant node identity for stream messages and detail events', () => {
  const streamMessage: ChatMessageItem = {
    messageId: 'assistant:chat-1:run-1:answer-1',
    clientMessageId: null,
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'assistant',
    content: 'Hel',
    createdAt: 100,
    deliveryStatus: 'sent',
    streamStatus: 'streaming',
    errorReason: null,
  };
  const streamState = applyChatTimelineMessage(null, streamMessage);
  const detailState = deriveChatTimelineState('chat-1', [
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'Hello',
      timestamp: 120,
    },
  ]);

  assert.deepEqual(streamState.orderedNodeIds, detailState.orderedNodeIds);
  assert.equal(projectTimelineMessages(detailState)[0]?.messageId, streamMessage.messageId);
});

test('timeline merge preserves a local assistant tail when reconcile detail is stale', () => {
  const current = applyChatTimelineMessage(null, {
    messageId: 'assistant:chat-1:run-1:answer-1',
    clientMessageId: null,
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'assistant',
    content: 'local streamed answer',
    createdAt: 140,
    deliveryStatus: 'sent',
    streamStatus: 'done',
    errorReason: null,
  });
  const staleRemote = deriveChatTimelineState('chat-1', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 150,
    },
  ]);
  const merged = mergeChatTimelineState(current, staleRemote);

  assert.deepEqual(
    projectTimelineMessages(merged).map((message) => message.content),
    ['hello', 'local streamed answer']
  );
});

test('timeline merge accepts a complete remote assistant tail when it catches up', () => {
  const current = applyChatTimelineMessage(null, {
    messageId: 'assistant:chat-1:run-1:answer-1',
    clientMessageId: null,
    serverMessageId: null,
    conversationId: 'chat-1',
    role: 'assistant',
    content: 'local',
    createdAt: 120,
    deliveryStatus: 'sent',
    streamStatus: 'done',
    errorReason: null,
  });
  const remote = deriveChatTimelineState('chat-1', [
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'local and remote continuation',
      timestamp: 150,
    },
  ]);
  const merged = mergeChatTimelineState(current, remote);

  assert.equal(projectTimelineMessages(merged)[0]?.content, 'local and remote continuation');
});

test('timeline merge preserves active awaiting countdown source when reconcile detail is stale', () => {
  const current = deriveChatTimelineState('chat-questions', [questionAwaitingAsk()]);
  const staleRemote = deriveChatTimelineState('chat-questions', [
    questionAwaitingAsk({
      runId: '',
      timestamp: 120000,
    }),
  ]);
  const merged = mergeChatTimelineState(current, staleRemote);
  const awaitingNode = merged.awaiting ? merged.nodesById[merged.awaiting.id] : undefined;

  assert.equal(merged.awaiting?.createdAt, 300000);
  assert.equal(merged.awaiting?.runId, 'run-question');
  assert.equal(awaitingNode?.kind, 'awaiting');
  if (awaitingNode?.kind !== 'awaiting') {
    throw new Error('expected awaiting node');
  }
  assert.equal(awaitingNode.createdAt, 300000);
});

test('timeline reducer normalizes awaiting timeout seconds to milliseconds', () => {
  const state = deriveChatTimelineState('chat-questions', [
    questionAwaitingAsk({
      timeout: 180,
    }),
  ]);
  const awaitingNode = state.awaiting ? state.nodesById[state.awaiting.id] : undefined;

  assert.equal(state.awaiting?.interactive?.timeout, 180000);
  assert.equal(awaitingNode?.kind, 'awaiting');
  if (awaitingNode?.kind !== 'awaiting') {
    throw new Error('expected awaiting node');
  }
  if (!awaitingNode.interactive) {
    throw new Error('expected awaiting interactive');
  }
  assert.equal(awaitingNode.interactive?.timeout, 180000);
  assert.equal(getAwaitingInteractiveTimeout({ ...awaitingNode.interactive, timeout: 180 }), 180000);
});

test('timeline merge accepts awaiting answer over active ask', () => {
  const current = deriveChatTimelineState('chat-questions', [questionAwaitingAsk()]);
  const remoteAnswer = deriveChatTimelineState('chat-questions', [
    {
      type: 'awaiting.answer',
      awaitingId: 'question-1',
      mode: 'question',
      runId: 'run-question',
      params: [{ id: 'q1', answer: '主动汇报' }],
      timestamp: 310000,
    },
  ]);
  const merged = mergeChatTimelineState(current, remoteAnswer);
  const awaitingNode = merged.awaiting ? merged.nodesById[merged.awaiting.id] : undefined;

  assert.equal(merged.awaiting?.status, 'answer');
  assert.equal(awaitingNode?.kind, 'awaiting');
  if (awaitingNode?.kind !== 'awaiting') {
    throw new Error('expected awaiting node');
  }
  assert.equal(awaitingNode.lifecycle, 'complete');
});

test('timeline merge switches to a different awaiting question', () => {
  const current = deriveChatTimelineState('chat-questions', [questionAwaitingAsk()]);
  const nextQuestion = deriveChatTimelineState('chat-questions', [
    questionAwaitingAsk({
      awaitingId: 'question-2',
      questions: [painPointQuestion],
      timestamp: 320000,
    }),
  ]);
  const merged = mergeChatTimelineState(current, nextQuestion);

  assert.equal(merged.awaiting?.awaitingId, 'question-2');
  assert.equal(merged.awaiting?.interactive?.kind, 'question');
  assert.equal(merged.awaiting?.interactive?.questions[0]?.id, 'q2');
  assert.deepEqual(
    buildChatTimelineDisplayItems(merged)
      .filter((item) => item.kind === 'awaiting')
      .map((item) => (item.node.kind === 'awaiting' ? item.node.awaitingId : '')),
    ['question-2']
  );
});

test('timeline merge preserves newer awaiting question shape for the same awaiting id', () => {
  const updatedFeedbackQuestion = {
    ...feedbackQuestion,
    allowFreeText: true,
    freeTextPlaceholder: '请输入其他反馈节奏',
    options: [{ label: '每日同步' }, { label: '每周总结' }],
  };
  const current = deriveChatTimelineState('chat-questions', [
    questionAwaitingAsk({
      questions: [updatedFeedbackQuestion],
      timestamp: 320000,
    }),
  ]);
  const staleRemote = deriveChatTimelineState('chat-questions', [
    questionAwaitingAsk({
      timestamp: 120000,
    }),
  ]);
  const merged = mergeChatTimelineState(current, staleRemote);
  const question = merged.awaiting?.interactive?.questions[0];

  assert.equal(question?.allowFreeText, true);
  assert.equal(question?.freeTextPlaceholder, '请输入其他反馈节奏');
  assert.deepEqual(
    question?.options?.map((option) => option.label),
    ['每日同步', '每周总结']
  );
});

test('timeline reducer keeps builtin question awaiting payload structured', () => {
  const state = deriveChatTimelineState('chat-questions', [
    {
      type: 'awaiting.ask',
      awaitingId: 'call_function_ymdl7tgkp8wo_1',
      mode: 'question',
      viewportType: 'builtin',
      viewportKey: 'question',
      timeout: 120000,
      runId: 'mq0m15fy',
      agentKey: 'askUser.demo',
      questions: [
        {
          id: 'q1',
          options: [{ label: 'engineering 工程部' }, { label: 'finance 财务部' }],
          question: '请问您目前所在的岗位类型是？',
          type: 'select',
        },
        {
          id: 'q2',
          options: [{ label: '数据分析' }, { label: '项目管理' }],
          question: '您擅长哪些工作技能？（可多选）',
          type: 'multi-select',
        },
        {
          id: 'q3',
          placeholder: 'YYYY-MM-DD',
          question: '您的入职日期是哪一天？',
          type: 'date',
        },
        {
          allowFreeText: true,
          freeTextPlaceholder: '请输入其他沟通方式',
          id: 'q4',
          options: [{ label: 'email 邮件' }, { label: 'chat 即时通讯' }],
          question: '您偏好的团队沟通方式是？',
          type: 'select',
        },
        {
          id: 'q5',
          placeholder: '请输入数字',
          question: '您的工作年限是多少年？',
          type: 'number',
        },
      ],
      timestamp: 1780644966477,
    },
  ]);

  assert.equal(state.awaiting?.runId, 'mq0m15fy');
  assert.equal(state.awaiting?.awaitingId, 'call_function_ymdl7tgkp8wo_1');
  assert.notEqual(state.awaiting?.id, state.awaiting?.awaitingId);
  assert.equal(state.awaiting?.interactive?.kind, 'question');
  assert.equal(state.awaiting?.interactive?.agentKey, 'askUser.demo');
  assert.equal(state.awaiting?.interactive?.questions.length, 5);
  assert.equal(state.awaiting?.interactive?.questions[3].allowFreeText, true);
  assert.equal(state.awaiting?.interactive?.questions[4].type, 'number');
  assert.match(state.awaiting?.payloadText || '', /岗位类型/);
});

test('timeline reducer builds structured awaiting answer summaries with labels and masking', () => {
  const state = deriveChatTimelineState('chat-questions', [
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'question-1',
      mode: 'question',
      questions: [
        {
          id: 'satisfaction',
          type: 'select',
          question: '您对目前工作的整体满意度如何？',
          options: [{ label: '非常满意', value: 'very_satisfied' }],
        },
        {
          id: 'pressure',
          type: 'multi-select',
          question: '您认为工作中最大的压力来源有哪些？',
          options: [
            { label: '时间紧迫', value: 'time' },
            { label: '职业发展受限', value: 'growth' },
          ],
        },
        {
          id: 'secret',
          type: 'password',
          question: '请输入临时口令',
        },
      ],
      timestamp: 100,
    },
    {
      type: 'awaiting.answer',
      runId: 'run-1',
      awaitingId: 'question-1',
      mode: 'question',
      status: 'answered',
      answers: [
        { id: 'satisfaction', answer: 'very_satisfied' },
        { id: 'pressure', answers: ['time', 'growth'] },
        { id: 'secret', answer: 'super-secret' },
      ],
      timestamp: 120,
    },
  ]);
  const awaiting = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .find((node) => node?.kind === 'awaiting');

  assert.equal(awaiting?.kind, 'awaiting');
  if (awaiting?.kind !== 'awaiting') {
    throw new Error('expected awaiting node');
  }
  assert.equal(awaiting.answerSummary?.title, '');
  assert.deepEqual(
    awaiting.answerSummary?.items.map((item) => [item.title, item.value]),
    [
      ['您对目前工作的整体满意度如何？', '非常满意'],
      ['您认为工作中最大的压力来源有哪些？', '时间紧迫, 职业发展受限'],
      ['请输入临时口令', '••••••'],
    ]
  );
  assert.equal(awaiting.answer.includes('super-secret'), false);
});

test('timeline reducer ignores repeated equivalent awaiting question asks', () => {
  const event = {
    type: 'awaiting.ask',
    awaitingId: 'call_function_question_1',
    mode: 'question',
    viewportType: 'builtin',
    viewportKey: 'question',
    timeout: 120000,
    runId: 'run-question',
    agentKey: 'askUser.demo',
    questions: [
      {
        id: 'q1',
        options: [{ label: 'engineering 工程部' }, { label: 'finance 财务部' }],
        question: '请问您目前所在的岗位类型是？',
        type: 'select',
      },
    ],
    timestamp: 1000,
  };
  const first = applyChatTimelineEvent(null, 'chat-questions', event);
  const repeated = applyChatTimelineEvent(first, 'chat-questions', {
    ...event,
    timestamp: 4000,
  });

  assert.equal(repeated, first);
  assert.equal(repeated.revision, first.revision);
  assert.equal(repeated.awaiting?.awaitingId, 'call_function_question_1');
  assert.equal(repeated.awaiting?.interactive, first.awaiting?.interactive);
});

test('timeline reducer normalizes source publishes and updates a stable node idempotently', () => {
  const event = {
    type: 'source.publish',
    publishId: 'source-publish-1',
    runId: 'run-source',
    toolId: 'tool-search',
    kind: 'kbase',
    query: '退款流程',
    sourceCount: 1,
    chunkCount: 2,
    sources: [
      {
        id: 'kbase:/docs/refund.md',
        title: '/docs/refund.md',
        collectionId: 'handbook',
        collectionName: '员工手册',
        url: 'https://example.test/refund',
        chunks: [
          {
            chunkId: 'refund-1',
            index: 1,
            content: '退款需要先提交申请。',
            path: '/docs/refund.md',
            heading: '退款',
            startLine: 12,
            endLine: 14,
            score: 0.82,
          },
          {
            index: 2,
            content: '审批通过后进入打款流程。',
            pageStart: 3,
          },
        ],
      },
    ],
    timestamp: 100,
  };
  const first = applyChatTimelineEvent(null, 'chat-source', event);
  const repeated = applyChatTimelineEvent(first, 'chat-source', event);
  const sourceId = first.orderedNodeIds.find(
    (nodeId) => first.nodesById[nodeId]?.kind === 'source'
  );
  const source = sourceId ? first.nodesById[sourceId] : null;

  assert.equal(source?.kind, 'source');
  if (source?.kind !== 'source') {
    throw new Error('expected source node');
  }
  assert.equal(source.publishId, 'source-publish-1');
  assert.equal(source.sourceKind, 'kbase');
  assert.equal(source.query, '退款流程');
  assert.equal(source.sourceCount, 1);
  assert.equal(source.chunkCount, 2);
  assert.equal(source.sources[0].name, 'refund.md');
  assert.equal(source.sources[0].chunks[0].startLine, 12);
  assert.equal(source.sources[0].chunks[1].chunkId, '/docs/refund.md_2');
  assert.equal(repeated, first);

  const newer = applyChatTimelineEvent(first, 'chat-source', {
    ...event,
    sources: [
      {
        ...event.sources[0],
        chunks: [{ ...event.sources[0].chunks[0], content: '请先提交退款申请。' }],
      },
    ],
    sourceCount: 1,
    chunkCount: 1,
    timestamp: 120,
  });
  const ignoredOlder = applyChatTimelineEvent(newer, 'chat-source', event);
  const updated = newer.nodesById[source.id];

  assert.deepEqual(newer.orderedNodeIds, first.orderedNodeIds);
  assert.equal(updated?.kind, 'source');
  assert.equal(updated?.kind === 'source' ? updated.sources[0].chunks[0].content : '', '请先提交退款申请。');
  assert.equal(ignoredOlder, newer);
});

test('timeline reducer keeps empty, malformed and failed source publishes visible', () => {
  const state = deriveChatTimelineState('chat-source-fallback', [
    {
      type: 'source.publish',
      publishId: 'empty',
      query: '不存在的资料',
      sourceCount: 0,
      sources: [],
      timestamp: 100,
    },
    {
      type: 'source.publish',
      publishId: 'malformed',
      query: '坏数据',
      sourceCount: 1,
      sources: 'not-an-array',
      timestamp: 110,
    },
    {
      type: 'source.publish',
      publishId: 'failed',
      query: '服务失败',
      sources: [],
      error: { code: 'source_unavailable', message: '来源服务暂不可用' },
      timestamp: 120,
    },
  ]);
  const sources = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node) => node?.kind === 'source');

  assert.equal(sources.length, 3);
  assert.equal(sources[0].kind === 'source' ? sources[0].malformed : true, false);
  assert.equal(sources[1].kind === 'source' ? sources[1].malformed : false, true);
  assert.equal(
    sources[2].kind === 'source' ? sources[2].errorDetail?.message : '',
    '来源服务暂不可用'
  );
  assert.equal(sources[2].lifecycle, 'error');
});

test('timeline reducer scopes idless source sequence keys by run', () => {
  const state = deriveChatTimelineState('chat-source-runs', [
    {
      type: 'source.publish',
      runId: 'run-1',
      seq: 1,
      query: 'same query',
      sources: [],
      timestamp: 100,
    },
    {
      type: 'source.publish',
      runId: 'run-2',
      seq: 1,
      query: 'same query',
      sources: [],
      timestamp: 200,
    },
  ]);

  assert.equal(
    state.orderedNodeIds.filter((nodeId) => state.nodesById[nodeId]?.kind === 'source').length,
    2
  );
});

test('timeline merge accepts a newer source publish even when its result set shrinks', () => {
  const sourceEvent = {
    type: 'source.publish',
    publishId: 'source-reconcile',
    runId: 'run-source',
    query: '架构',
    sources: [
      {
        id: 'one',
        chunks: [{ chunkId: 'one-1', index: 1, content: 'first result' }],
      },
      {
        id: 'two',
        chunks: [{ chunkId: 'two-1', index: 1, content: 'second result' }],
      },
    ],
    timestamp: 100,
  };
  const current = deriveChatTimelineState('chat-source-merge', [sourceEvent]);
  const incoming = deriveChatTimelineState('chat-source-merge', [
    {
      ...sourceEvent,
      sources: [sourceEvent.sources[0]],
      sourceCount: 1,
      chunkCount: 1,
      timestamp: 120,
    },
  ]);
  const merged = mergeChatTimelineState(current, incoming);
  const source = merged.orderedNodeIds
    .map((nodeId) => merged.nodesById[nodeId])
    .find((node) => node?.kind === 'source');

  assert.equal(source?.kind === 'source' ? source.sources.length : 0, 1);
  assert.equal(source?.updatedAt, 120);
});
