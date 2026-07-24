import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectRemoteChatDetail,
  projectRemoteChatSummary,
} from '../../src/features/chatPersistence/chatProjector.ts';

test('projects chat.updated summary push with ownership and latest reply fields', () => {
  const projected = projectRemoteChatSummary({
    chatId: 'chat-1',
    agentKey: 'zenmi',
    lastRunContent: 'latest assistant reply',
    lastRunId: 'run-1',
    updatedAt: 1_780_023_877_038,
    unreadRunCount: 2,
  });

  assert.equal(projected?.conversationId, 'chat-1');
  assert.equal(projected?.agentKey, 'zenmi');
  assert.equal(projected?.teamId, null);
  assert.equal(projected?.lastMessageText, 'latest assistant reply');
  assert.equal(projected?.lastMessageAt, 1_780_023_877_038);
  assert.equal(projected?.unreadCount, 1);
});

test('projects chat.created summary push without blanking latest message fields', () => {
  const projected = projectRemoteChatSummary({
    chatId: 'chat-2',
    chatName: '你好',
    agentKey: 'zenmi',
    timestamp: 1_780_023_872_732,
  });

  assert.equal(projected?.conversationId, 'chat-2');
  assert.equal(projected?.title, '你好');
  assert.equal(projected?.agentKey, 'zenmi');
  assert.equal(projected?.lastMessageText, undefined);
  assert.equal(projected?.lastMessageAt, undefined);
  assert.equal(projected?.unreadCount, undefined);
});

test('omits the remote default conversation title candidate', () => {
  const projected = projectRemoteChatSummary({
    chatId: 'chat-default-title',
    chatName: 'default',
  });

  assert.equal(projected?.title, undefined);
});

test('projects chat.updated without unread fields as summary-only patch', () => {
  const projected = projectRemoteChatSummary({
    chatId: 'chat-3',
    agentKey: 'zenmi',
    lastRunContent: 'reply without unread fields',
    updatedAt: 1_780_023_877_038,
  });

  assert.equal(projected?.lastMessageText, 'reply without unread fields');
  assert.equal(projected?.lastMessageAt, 1_780_023_877_038);
  assert.equal(projected?.unreadCount, undefined);
});

test('does not treat read metadata as read state in summary patches', () => {
  const projected = projectRemoteChatSummary({
    chatId: 'chat-4',
    agentKey: 'zenmi',
    lastRunContent: 'reply with metadata only',
    updatedAt: 1_780_023_877_038,
    readAt: 1_780_023_878_000,
    readRunId: 'run-old',
  });

  assert.equal(projected?.lastMessageText, 'reply with metadata only');
  assert.equal(projected?.unreadCount, undefined);
  assert.equal(projected?.read, undefined);
});

test('marks detail read state as explicit only when the detail payload contains read state', () => {
  const projected = projectRemoteChatDetail(
    {
      chatId: 'chat-5',
      events: [],
    },
    {
      chatId: 'chat-5',
      read: { isRead: false },
      unreadRunCount: 1,
    }
  );

  assert.equal(projected?.read.isRead, false);
  assert.equal(projected?.hasExplicitReadState, false);
  assert.equal(projected?.summary.read, undefined);
  assert.equal(projected?.summary.unreadCount, undefined);

  const explicit = projectRemoteChatDetail({
    chatId: 'chat-6',
    read: { isRead: false },
    events: [],
  });

  assert.equal(explicit?.read.isRead, false);
  assert.equal(explicit?.hasExplicitReadState, true);
  assert.equal(explicit?.summary.read?.isRead, false);
  assert.equal(explicit?.summary.unreadCount, 1);
});

test('projects message history and runtime state in a single remote detail pass', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-7',
    events: [
      {
        type: 'request.query',
        requestId: 'req-1',
        message: 'hello',
        createdAt: 100,
      },
      {
        type: 'reasoning.start',
        runId: 'run-1',
        contentId: 'reason-1',
        text: 'thinking',
        createdAt: 110,
      },
      {
        type: 'content.delta',
        runId: 'run-1',
        contentId: 'answer-1',
        delta: 'world',
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
        type: 'run.start',
        runId: 'run-1',
        createdAt: 140,
      },
    ],
  });

  assert.equal(projected?.messages.length, 2);
  assert.equal(projected?.messages[0].role, 'user');
  assert.equal(projected?.messages[1].content, 'world');
  assert.equal(projected?.activeRunId, 'run-1');
  assert.equal(
    projected?.runtimeState.entries.some((entry) => entry.kind === 'reasoning'),
    true
  );
  assert.equal(
    projected?.runtimeState.entries.some((entry) => entry.kind === 'tool'),
    true
  );
  assert.equal(projected?.title, 'hello');
});

test('omits the title candidate when the first user message only contains an attachment', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-attachment-title',
    chatName: 'default',
    events: [
      {
        type: 'request.query',
        requestId: 'req-attachment',
        message: '',
        references: [
          {
            id: 'image-1',
            type: 'image',
            name: 'photo.png',
            mimeType: 'image/png',
            url: '/api/resource?file=chat-attachment-title%2Fphoto.png',
          },
        ],
        createdAt: 100,
      },
    ],
  });

  assert.equal(projected?.messages[0]?.content, '');
  assert.equal(projected?.messages[0]?.attachments.length, 1);
  assert.equal(projected?.title, undefined);
});

test('uses first user text as the title when the message also contains an image', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-image-text-title',
    chatName: 'default',
    events: [
      {
        type: 'request.query',
        requestId: 'req-image-text',
        message: '识别图片内容',
        references: [
          {
            id: 'image-1',
            type: 'image',
            name: 'photo.png',
            mimeType: 'image/png',
            url: '/api/resource?file=chat-image-text-title%2Fphoto.png',
          },
        ],
        createdAt: 100,
      },
    ],
  });

  assert.equal(projected?.messages[0]?.content, '识别图片内容');
  assert.equal(projected?.messages[0]?.attachments.length, 1);
  assert.equal(projected?.title, '识别图片内容');
});

test('keeps a usable fallback title for an attachment-only remote detail', () => {
  const projected = projectRemoteChatDetail(
    {
      chatId: 'chat-existing-title',
      chatName: 'default',
      events: [
        {
          type: 'request.query',
          requestId: 'req-existing-title',
          message: '',
          references: [
            {
              id: 'image-1',
              type: 'image',
              name: 'photo.png',
              mimeType: 'image/png',
            },
          ],
          createdAt: 100,
        },
      ],
    },
    {
      chatId: 'chat-existing-title',
      chatName: '已有文字标题',
    }
  );

  assert.equal(projected?.title, '已有文字标题');
});

test('uses top-level runs planning and usage as detail timeline fallback', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-8',
    chatName: 'fallback detail',
    runs: [
      {
        runId: 'run-1',
        agentKey: 'coder',
        initialMessage: 'change the theme',
        assistantText: 'done',
        finishReason: 'complete',
        startedAt: 1_000,
        completedAt: 2_500,
      },
    ],
    planning: {
      planningId: 'planning-1',
      text: '# Plan\n\nUpdate colors.',
    },
    usage: {
      lastRun: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    },
  });

  assert.equal(projected?.messages.length, 2);
  assert.equal(projected?.messages[0].content, 'change the theme');
  assert.equal(projected?.messages[1].content, 'done');
  assert.equal(projected?.runtimeState.usageLabel, '');
  assert.equal(
    projected?.runtimeState.entries.some((entry) => entry.kind === 'planning'),
    true
  );
  assert.equal(
    projected?.runtimeState.entries.some((entry) => entry.kind === 'run'),
    true
  );
});

test('uses active run snapshot as timeline and attach cursor fallback', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-active-run',
    activeRun: {
      runId: 'run-live',
      agentKey: 'coder',
      lastSeq: 42,
      startedAt: 1_000,
    },
    events: [],
  });

  assert.equal(projected?.activeRunId, 'run-live');
  assert.deepEqual(projected?.activeRun, {
    runId: 'run-live',
    agentKey: 'coder',
    lastSeq: 42,
  });
  assert.equal(
    projected?.timelineState.orderedNodeIds.some(
      (nodeId) => projected.timelineState.nodesById[nodeId]?.runId === 'run-live'
    ),
    true
  );
});

test('uses top-level plan and artifact snapshots as timeline event fallback', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-runtime-snapshots',
    plan: {
      planId: 'plan-1',
      title: 'Implement detail contract',
      status: 'active',
      tasks: [{ id: 'task-1', title: 'type api detail' }],
    },
    artifact: {
      items: [
        {
          artifactId: 'artifact-1',
          name: 'report.md',
          mimeType: 'text/markdown',
          url: 'https://example.test/report.md',
          sizeBytes: 128,
        },
      ],
    },
    events: [],
  });

  const nodes = projected?.timelineState.orderedNodeIds.map(
    (nodeId) => projected.timelineState.nodesById[nodeId]
  );
  assert.equal(nodes?.some((node) => node?.kind === 'plan'), true);
  assert.equal(nodes?.some((node) => node?.kind === 'artifact'), true);
  assert.equal(projected?.runtimeState.entries.some((entry) => entry.kind === 'plan'), true);
  assert.equal(projected?.runtimeState.entries.some((entry) => entry.kind === 'artifact'), true);
});

test('merges current usage events with historical detail cumulative usage', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-usage',
    events: [
      {
        type: 'usage.snapshot',
        runId: 'run-1',
        chatId: 'chat-usage',
        contextWindow: {
          currentSize: 9_752,
          estimatedNextCallSize: 10_202,
          maxSize: 196_608,
        },
        usage: {
          current: {
            promptTokens: 120,
            completionTokens: 20,
            totalTokens: 140,
            promptTokensDetails: {
              cacheHitTokens: 90,
              cacheMissTokens: 30,
            },
            timing: {
              firstTokenLatencyMs: 820,
              generationDurationMs: 880,
            },
            toolCallCount: 1,
          },
        },
        timestamp: 1_000,
      },
    ],
    runs: [
      {
        runId: 'run-1',
        usage: {
          modelKey: 'minimax-m3',
          promptTokens: 53_038,
          completionTokens: 2_275,
          totalTokens: 55_313,
          promptTokensDetails: {
            cacheHitTokens: 42_535,
            cacheMissTokens: 2_574,
          },
          completionTokensDetails: {
            reasoningTokens: 1_656,
          },
          estimatedCost: {
            currency: 'CNY',
            total: 0.898,
          },
          timing: {
            firstTokenLatencyTotalMs: 10_600,
            firstTokenLatencyCount: 1,
            generationDurationMs: 42_600,
          },
          llmChatCompletionCount: 8,
          toolCallCount: 15,
        },
      },
    ],
    usage: {
      lastRun: {
        promptTokens: 53_038,
        completionTokens: 2_275,
        totalTokens: 55_313,
        promptTokensDetails: {
          cacheHitTokens: 42_535,
          cacheMissTokens: 2_574,
        },
        completionTokensDetails: {
          reasoningTokens: 1_656,
        },
        timing: {
          firstTokenLatencyTotalMs: 10_600,
          firstTokenLatencyCount: 1,
          generationDurationMs: 42_600,
        },
        llmChatCompletionCount: 8,
        toolCallCount: 15,
      },
      chat: {
        promptTokens: 53_038,
        completionTokens: 2_275,
        totalTokens: 55_313,
        promptTokensDetails: {
          cacheHitTokens: 42_535,
          cacheMissTokens: 2_574,
        },
        completionTokensDetails: {
          reasoningTokens: 1_656,
        },
        timing: {
          firstTokenLatencyTotalMs: 21_200,
          firstTokenLatencyCount: 2,
          generationDurationMs: 42_600,
        },
        estimatedCost: {
          currency: 'CNY',
          total: 0.898,
        },
        llmChatCompletionCount: 8,
        toolCallCount: 15,
      },
    },
  });

  const usage = projected?.timelineState.usageSummary;
  assert.equal(usage?.modelKey, 'minimax-m3');
  assert.equal(usage?.contextWindow.percent, 5);
  assert.equal(usage?.current.totalTokens, 140);
  assert.equal(usage?.current.timing.firstTokenLatencyMs, 820);
  assert.equal(usage?.current.toolCallCount, 1);
  assert.equal(usage?.run.promptTokens, 53_038);
  assert.equal(usage?.run.timing.firstTokenLatencyTotalMs, 10_600);
  assert.equal(usage?.run.reasoningTokens, 1_656);
  assert.equal(usage?.chat.cacheHitTokens, 42_535);
  assert.equal(usage?.chat.timing.firstTokenLatencyCount, 2);
  assert.equal(usage?.chat.estimatedCost?.currency, 'CNY');
  assert.equal(usage?.chat.estimatedCost?.total, 0.898);
  assert.equal(usage?.chat.llmChatCompletionCount, 8);
  assert.equal(usage?.chat.toolCallCount, 15);
});

test('projects usage model from detail context window metadata', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-context-model',
    contextWindow: {
      currentSize: 10_127,
      estimatedNextCallSize: 10_954,
      maxSize: 196_608,
      modelKey: 'th-minimax-m2_7-highspeed',
      reasoningEffort: 'HIGH',
    },
    usage: {
      promptTokens: 25_534,
      completionTokens: 1_353,
      totalTokens: 26_887,
    },
    updatedAt: 1_000,
  });

  const usage = projected?.timelineState.usageSummary;
  assert.equal(usage?.modelKey, 'th-minimax-m2_7-highspeed');
  assert.equal(usage?.contextWindow.percent, 5);
  assert.equal(usage?.contextWindow.reasoningEffort, 'HIGH');
  assert.equal(usage?.chat.totalTokens, 26_887);
});

test('projects context compaction usage into the usage summary', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-compact',
    events: [
      {
        type: 'usage.snapshot',
        runId: 'run-1',
        contextWindow: {
          currentSize: 2_000,
          estimatedNextCallSize: 2_500,
          maxSize: 10_000,
        },
        usage: {
          chat: {
            totalTokens: 2_500,
          },
        },
        timestamp: 1_000,
      },
      {
        type: 'context.compact.complete',
        runId: 'run-1',
        postCompactEstimatedTokens: 900,
        compactionUsage: {
          promptTokens: 500,
          completionTokens: 50,
          totalTokens: 550,
          llmChatCompletionCount: 2,
          toolCallCount: 4,
        },
        timestamp: 1_100,
      },
    ],
  });

  const usage = projected?.timelineState.usageSummary;
  assert.equal(usage?.contextWindow.currentSize, 900);
  assert.equal(usage?.contextWindow.estimatedNextCallSize, 900);
  assert.equal(usage?.contextWindow.percent, 9);
  assert.equal(usage?.compact?.totalTokens, 550);
  assert.equal(usage?.compact?.llmChatCompletionCount, 2);
  assert.equal(usage?.compact?.toolCallCount, 4);
});

test('detail fallback reuses indexed run events without duplicating nodes', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-9',
    events: [
      {
        type: 'request.query',
        runId: 'run-1',
        requestId: 'req-1',
        message: 'change the theme',
        createdAt: 1_000,
      },
      {
        type: 'run.start',
        runId: 'run-1',
        createdAt: 1_000,
      },
      {
        type: 'content.snapshot',
        runId: 'run-1',
        contentId: 'content-1',
        text: 'done',
        createdAt: 2_500,
      },
      {
        type: 'run.complete',
        runId: 'run-1',
        finishReason: 'complete',
        createdAt: 2_500,
      },
    ],
    runs: [
      {
        runId: 'run-1',
        initialMessage: 'change the theme',
        assistantText: 'done',
        finishReason: 'complete',
        startedAt: 1_000,
        completedAt: 2_500,
      },
    ],
  });

  assert.ok(projected);
  assert.deepEqual(
    projected.messages.map((message) => message.content),
    ['change the theme', 'done']
  );

  const timelineNodes = projected.timelineState.orderedNodeIds.map(
    (nodeId) => projected.timelineState.nodesById[nodeId]
  );
  assert.equal(
    timelineNodes.filter((node) => node.kind === 'run' && node.runId === 'run-1').length,
    1
  );
  assert.equal(
    timelineNodes.filter((node) => node.kind === 'message' && node.role === 'assistant').length,
    1
  );
});

test('projects source publish history into the same structured timeline node used by realtime', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-source-history',
    events: [
      {
        type: 'source.publish',
        publishId: 'source-history-1',
        runId: 'run-source',
        kind: 'kbase',
        query: '费用报销',
        sourceCount: 1,
        chunkCount: 1,
        sources: [
          {
            id: 'expense.md',
            title: '费用报销制度',
            chunks: [
              {
                chunkId: 'expense-1',
                index: 1,
                content: '报销单需在当月提交。',
                pageStart: 2,
              },
            ],
          },
        ],
        timestamp: 100,
      },
    ],
  });
  const source = projected?.timelineState.orderedNodeIds
    .map((nodeId) => projected.timelineState.nodesById[nodeId])
    .find((node) => node?.kind === 'source');

  assert.equal(source?.kind, 'source');
  assert.equal(source?.kind === 'source' ? source.query : '', '费用报销');
  assert.equal(source?.kind === 'source' ? source.sources[0].chunks[0].pageStart : null, 2);
  assert.equal(
    projected?.runtimeState.entries.some((entry) => entry.id === source?.id),
    false
  );
});

test('projects live and detail artifact resources through one typed timeline model without duplicates', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-artifact-history',
    events: [
      {
        type: 'artifact.publish',
        runId: 'run-artifact',
        timestamp: 100,
        artifacts: [
          {
            artifactId: 'artifact-live',
            name: 'live.png',
            mimeType: 'image/png',
            sizeBytes: 1024,
            url: '/api/resource?id=artifact-live',
          },
        ],
      },
    ],
    artifact: {
      items: [
        {
          artifactId: 'artifact-live',
          name: 'live.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
          url: '/api/resource?id=artifact-live',
          timestamp: 100,
        },
        {
          artifactId: 'artifact-snapshot',
          name: 'snapshot.txt',
          mimeType: 'text/plain',
          sizeBytes: 32,
          url: '/api/resource?id=artifact-snapshot',
          summary: 'Recovered from detail snapshot',
          timestamp: 110,
        },
      ],
    },
  });
  const artifacts = projected?.timelineState.orderedNodeIds
    .map((nodeId) => projected.timelineState.nodesById[nodeId])
    .filter((node) => node?.kind === 'artifact');

  assert.equal(artifacts?.length, 2);
  assert.deepEqual(
    artifacts?.map((node) => (node.kind === 'artifact' ? node.artifactId : '')),
    ['artifact-live', 'artifact-snapshot']
  );
  assert.equal(
    artifacts?.[1]?.kind === 'artifact' ? artifacts[1].summary : '',
    'Recovered from detail snapshot'
  );
});
