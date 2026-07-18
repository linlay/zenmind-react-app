import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  deserializeChatTimelineState,
  deriveChatTimelineState,
  getActiveChatTimelineFrontendTool,
  mergeChatTimelineState,
  resolveChatTimelineFrontendTool,
  serializeChatTimelineState,
  timelinePersistenceInternals,
} from '../../src/features/chatTimeline/index.ts';

test('timeline persistence keeps frontend tool dismissal across restore and stale replay', () => {
  const toolEvent = {
    type: 'tool.start',
    runId: 'run-tool',
    toolId: 'tool-form',
    toolType: 'html',
    viewportKey: 'leave-form',
    toolParams: { days: 1 },
    timestamp: 1_700_000_000_000,
  };
  const active = deriveChatTimelineState('chat-tool', [toolEvent]);
  const tool = getActiveChatTimelineFrontendTool(active);
  assert.ok(tool);
  const dismissed = resolveChatTimelineFrontendTool(
    active,
    tool.key,
    'close',
    1_700_000_000_100
  );
  const serialized = serializeChatTimelineState(dismissed);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.ok(restored);
  assert.equal(getActiveChatTimelineFrontendTool(restored), null);

  const staleReplay = deriveChatTimelineState('chat-tool', [toolEvent]);
  const merged = mergeChatTimelineState(restored, staleReplay);
  assert.equal(getActiveChatTimelineFrontendTool(merged), null);
});
import { parseConversationMarkdownSegments } from '../../src/shared/markdown/previewSegments.ts';
import {
  CONVERSATION_VIEWPORT_FENCE_EXTENSIONS,
  type ConversationViewportFenceData
} from '../../src/features/chatPersistence/conversationViewport/conversationViewportFence.ts';

test('timeline persistence roundtrips rich runtime nodes without replaying events', () => {
  const state = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'build it',
      timestamp: 100,
    },
    {
      type: 'run.start',
      runId: 'run-1',
      timestamp: 110,
    },
    {
      type: 'reasoning.snapshot',
      runId: 'run-1',
      reasoningId: 'reason-1',
      text: 'thinking',
      timestamp: 120,
    },
    {
      type: 'tool.result',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'read_file',
      result: { ok: true },
      timestamp: 130,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'done',
      timestamp: 140,
    },
    {
      type: 'awaiting.ask',
      runId: 'run-1',
      awaitingId: 'approval-1',
      requiresApproval: true,
      prompt: 'approve?',
      timestamp: 150,
    },
    {
      type: 'usage.snapshot',
      runId: 'run-1',
      model: { key: 'gpt-5-mini' },
      contextWindow: {
        currentSize: 120,
        maxSize: 1000,
        estimatedNextCallSize: 150,
        reasoningEffort: 'LOW',
      },
      usage: {
        current: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          promptTokensDetails: {
            cacheHitTokens: 4,
            cacheMissTokens: 8,
          },
          completionTokensDetails: {
            reasoningTokens: 2,
          },
          estimatedCost: {
            total: 0.02,
          },
          llmChatCompletionCount: 1,
        },
        run: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          llmChatCompletionCount: 1,
        },
        chat: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
          promptTokensDetails: {
            cacheHitTokens: 4,
            cacheMissTokens: 8,
          },
          estimatedCost: {
            total: 0.02,
          },
          llmChatCompletionCount: 1,
        },
      },
      timestamp: 160,
    },
    {
      type: 'run.complete',
      runId: 'run-1',
      timestamp: 170,
    },
  ]);

  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);

  assert.notEqual(restored, null);
  assert.deepEqual(restored?.orderedNodeIds, state.orderedNodeIds);
  assert.equal(restored?.awaiting?.mode, 'approval');
  assert.equal(restored?.usageLabel, '');
  assert.equal(restored?.usageSummary?.current.promptTokens, 12);
  assert.equal(restored?.usageSummary?.chat.totalTokens, 15);
  assert.equal(restored?.usageSummary?.modelKey, 'gpt-5-mini');
  assert.equal(restored?.usageSummary?.contextWindow.percent, 12);
  assert.equal(restored?.usageSummary?.contextWindow.reasoningEffort, 'LOW');
  assert.equal(restored?.usageSummary?.current.reasoningTokens, 2);
  assert.equal(restored?.usageSummary?.chat.cacheHitTokens, 4);
  assert.equal(restored?.usageSummary?.chat.estimatedCost?.total, 0.02);
  assert.deepEqual(
    restored?.orderedNodeIds.map((id) => restored.nodesById[id]?.kind),
    ['message', 'run', 'reasoning', 'tool', 'message', 'awaiting', 'usage']
  );
});

test('timeline persistence roundtrips system error detail nodes', () => {
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
        diagnostics: {
          provider: 'deepseek',
        },
      },
      timestamp: 120,
    },
  ]);

  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.notEqual(restored, null);
  if (!restored) {
    throw new Error('expected restored timeline state');
  }
  const systemNode = restored.orderedNodeIds
    .map((nodeId) => restored.nodesById[nodeId])
    .find((node) => node?.kind === 'message' && node.role === 'system');
  assert.equal(systemNode?.kind, 'message');
  if (!systemNode || systemNode.kind !== 'message') {
    throw new Error('expected restored system message');
  }
  assert.equal(systemNode.content, 'provider deepseek has empty apiKey');
  assert.equal(systemNode.errorDetail?.code, 'stream_failed');
  assert.deepEqual(systemNode.errorDetail?.diagnostics, { provider: 'deepseek' });
  assert.match(systemNode.errorDetail?.technicalText || '', /stream_failed/);
});

test('timeline persistence restores reasoning continuation identity after display close', () => {
  const state = deriveChatTimelineState('chat-reasoning-continuation', [
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
      type: 'tool.args',
      runId: 'run-1',
      toolCallId: 'tool-1',
      toolName: 'datetime',
      args: {},
      timestamp: 120,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);

  assert.notEqual(restored, null);
  assert.equal(
    restored?.nodesById['reasoning:chat-reasoning-continuation:run-1:reason-1']?.kind,
    'reasoning'
  );
  assert.equal(
    restored?.activeReasoningNodeIdsByRun['run-1'],
    'reasoning:chat-reasoning-continuation:run-1:reason-1'
  );

  const afterDelta = applyChatTimelineEvent(restored, 'chat-reasoning-continuation', {
    type: 'reasoning.delta',
    runId: 'run-1',
    delta: ' continued',
    timestamp: 130,
  });
  const reasoningNodes = Object.values(afterDelta.nodesById).filter(
    (node) => node.kind === 'reasoning'
  );

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNodes[0]?.body, 'first reasoning continued');
});

test('timeline persistence keeps restored reasoning attached when run id arrives later', () => {
  const state = deriveChatTimelineState('chat-reasoning-run-drift', [
    {
      type: 'reasoning.delta',
      reasoningId: 'reason-1',
      delta: 'first reasoning ',
      timestamp: 90,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);

  assert.notEqual(restored, null);

  const afterRunStart = applyChatTimelineEvent(restored, 'chat-reasoning-run-drift', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: 100,
  });
  const afterDelta = applyChatTimelineEvent(afterRunStart, 'chat-reasoning-run-drift', {
    type: 'reasoning.delta',
    runId: 'run-1',
    reasoningId: 'reason-1',
    delta: 'continued',
    timestamp: 110,
  });
  const reasoningNodes = Object.values(afterDelta.nodesById).filter(
    (node) => node.kind === 'reasoning'
  );

  assert.equal(reasoningNodes.length, 1);
  assert.equal(reasoningNodes[0]?.body, 'first reasoning continued');
  assert.equal(reasoningNodes[0]?.runId, 'run-1');
  assert.deepEqual(Object.keys(afterDelta.activeReasoningNodeIdsByRun), ['run-1']);
});

test('timeline persistence normalizes legacy usage summaries without reasoning effort', () => {
  const state = deriveChatTimelineState('chat-legacy-usage', [
    {
      type: 'usage.snapshot',
      runId: 'run-legacy',
      model: { key: 'gpt-5-mini' },
      contextWindow: {
        currentSize: 120,
        maxSize: 1000,
        estimatedNextCallSize: 150,
        reasoningEffort: 'HIGH',
      },
      usage: {
        current: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
        },
        run: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
        },
        chat: {
          promptTokens: 12,
          completionTokens: 3,
          totalTokens: 15,
        },
      },
      timestamp: 160,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const legacyRows = serialized.nodes.map((row) => {
    if (row.kind !== 'usage') {
      return row;
    }
    const payload = JSON.parse(row.payloadJson);
    delete payload.usageSummary.contextWindow.reasoningEffort;
    const payloadJson = timelinePersistenceInternals.stableStringify(payload);
    return {
      ...row,
      payloadJson,
      payloadHash: timelinePersistenceInternals.hashText(payloadJson),
    };
  });

  const restored = deserializeChatTimelineState(serialized.meta, legacyRows);

  assert.equal(restored?.usageSummary?.modelKey, 'gpt-5-mini');
  assert.equal(restored?.usageSummary?.contextWindow.reasoningEffort, '');
});

test('timeline persistence roundtrips structured question awaiting payloads', () => {
  const state = deriveChatTimelineState('chat-questions', [
    {
      type: 'awaiting.ask',
      runId: 'run-question',
      awaitingId: 'awaiting-question',
      mode: 'question',
      viewportType: 'builtin',
      viewportKey: 'question',
      timeout: 120000,
      agentKey: 'askUser.demo',
      questions: [
        {
          id: 'q1',
          type: 'select',
          question: '岗位类型？',
          options: [{ label: 'engineering 工程部' }],
        },
      ],
      timestamp: 100,
    },
  ]);

  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);

  assert.equal(restored?.awaiting?.runId, 'run-question');
  assert.equal(restored?.awaiting?.awaitingId, 'awaiting-question');
  assert.equal(restored?.awaiting?.interactive?.kind, 'question');
  assert.equal(
    restored?.awaiting?.interactive?.questions[0].options?.[0].label,
    'engineering 工程部'
  );
});

test('timeline persistence rejects corrupted persisted node payloads', () => {
  const state = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const corrupted = serialized.nodes.map((node, index) =>
    index === 0 ? { ...node, payloadJson: '{bad json' } : node
  );

  assert.equal(deserializeChatTimelineState(serialized.meta, corrupted), null);
});

test('timeline persistence hashes are stable and isolate changed nodes', () => {
  const base = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'first',
      timestamp: 110,
    },
  ]);
  const changed = deriveChatTimelineState('chat-rich', [
    {
      type: 'request.query',
      requestId: 'req-1',
      message: 'hello',
      timestamp: 100,
    },
    {
      type: 'content.snapshot',
      runId: 'run-1',
      contentId: 'answer-1',
      text: 'second',
      timestamp: 110,
    },
  ]);

  const left = serializeChatTimelineState(base);
  const right = serializeChatTimelineState(changed);
  const leftById = new Map(left.nodes.map((node) => [node.nodeId, node]));
  const changedHashes = right.nodes.filter(
    (node) => leftById.get(node.nodeId)?.payloadHash !== node.payloadHash
  );

  assert.equal(
    timelinePersistenceInternals.hashText(left.nodes[0].payloadJson),
    left.nodes[0].payloadHash
  );
  assert.deepEqual(
    changedHashes.map((node) => node.kind),
    ['message']
  );
});

test('timeline persistence roundtrips structured source nodes without replay', () => {
  const state = deriveChatTimelineState('chat-source', [
    {
      type: 'source.publish',
      publishId: 'source-1',
      runId: 'run-1',
      kind: 'workspace',
      query: '架构说明',
      sourceCount: 1,
      sources: [
        {
          id: 'architecture.md',
          title: '/docs/architecture.md',
          url: 'https://example.test/architecture',
          chunks: [
            {
              chunkId: 'architecture-1',
              index: 1,
              content: '模块边界说明',
              startLine: 20,
              endLine: 28,
              score: 0.91,
            },
          ],
        },
      ],
      timestamp: 100,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  const source = restored?.orderedNodeIds
    .map((nodeId) => restored.nodesById[nodeId])
    .find((node) => node?.kind === 'source');

  assert.notEqual(restored, null);
  assert.deepEqual(restored, state);
  assert.equal(source?.kind, 'source');
  assert.equal(source?.kind === 'source' ? source.sources[0].chunks[0].score : null, 0.91);
});

test('timeline persistence roundtrips typed artifact resource nodes without replay', () => {
  const state = deriveChatTimelineState('chat-artifact', [
    {
      type: 'artifact.publish',
      runId: 'run-artifact',
      artifactId: 'artifact-1',
      name: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 8192,
      url: '/api/resource?id=artifact-1',
      sha256: 'abc123',
      summary: 'Quarterly report',
      timestamp: 100,
    },
  ]);
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  const artifact = restored?.orderedNodeIds
    .map((nodeId) => restored.nodesById[nodeId])
    .find((node) => node?.kind === 'artifact');

  assert.deepEqual(restored, state);
  assert.equal(artifact?.kind, 'artifact');
  assert.equal(artifact?.kind === 'artifact' ? artifact.previewKind : '', 'pdf');
  assert.equal(artifact?.kind === 'artifact' ? artifact.resourceUrl : '', '/ap/api/resource?id=artifact-1');
});

test('timeline persistence derives the same viewport segments from restored assistant content', () => {
  const content = [
    '天气如下：',
    '```viewport',
    'type=html,key=weather-card',
    '{"city":"Shanghai"}',
    '```',
    '以上为实时结果。'
  ].join('\n');
  const state = deriveChatTimelineState('chat-viewport', [
    {
      type: 'content.snapshot',
      contentId: 'content-viewport',
      runId: 'run-viewport',
      text: content,
      timestamp: 100
    }
  ]);
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  const message = restored?.orderedNodeIds
    .map((nodeId) => restored.nodesById[nodeId])
    .find((node) => node?.kind === 'message');

  assert.equal(message?.kind, 'message');
  const segments = parseConversationMarkdownSegments(
    message?.kind === 'message' ? message.content : '',
    { extensions: CONVERSATION_VIEWPORT_FENCE_EXTENSIONS }
  );
  assert.deepEqual(segments.map((segment) => segment.type), ['markdown', 'extension', 'markdown']);
  const viewport = segments[1];
  assert.equal(
    viewport?.type === 'extension'
      ? (viewport.data as ConversationViewportFenceData).viewportKey
      : '',
    'weather-card'
  );
});
