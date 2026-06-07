import assert from 'node:assert/strict';
import test from 'node:test';

import type { ChatMessageItem } from '../../src/features/chatPersistence/types.ts';
import {
  applyChatTimelineEvent,
  applyChatTimelineMessage,
  applyChatTimelineStreamDelta,
  buildChatTimelineDisplayItems,
  deriveChatTimelineState,
  deriveChatTimelineStateFromMessages,
  mergeChatTimelineState,
  patchChatTimelineMessage,
  projectTimelineMessages,
  projectTimelineRuntimeState,
} from '../../src/features/chatTimeline/index.ts';

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
      model: { key: 'gpt-5-mini' },
      contextWindow: {
        currentSize: 14,
        maxSize: 100,
        estimatedNextCallSize: 18,
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
          llmChatCompletionCount: 1,
        },
        run: {
          promptTokens: 10,
          completionTokens: 4,
          totalTokens: 14,
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
  assert.equal(runtime.usageLabel, '输入 10 · 输出 4 · 总计 14');
  assert.equal(state.usageSummary?.modelKey, 'gpt-5-mini');
  assert.equal(state.usageSummary?.contextWindow.percent, 14);
  assert.equal(state.usageSummary?.current.reasoningTokens, 1);
  assert.equal(state.usageSummary?.chat.cacheHitTokens, 2);
  assert.deepEqual(
    displayItems.map((item) => item.kind),
    ['user-query', 'reasoning', 'tool', 'assistant-content', 'awaiting']
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
  assert.match(planNode.payloadText, /是，实施此计划/);
  assert.match(planNode.answer, /同意/);
  assert.equal(
    displayItems.some((item) => item.kind === 'awaiting'),
    true
  );
  assert.equal(projectTimelineRuntimeState(state).awaiting?.mode, 'approval');
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
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.messageId, 'client-message-1');
  assert.equal(messages[0]?.clientMessageId, 'client-message-1');
  assert.equal(messages[0]?.serverMessageId, 'server-user-1');
  assert.equal(messages[0]?.deliveryStatus, 'sent');
  assert.equal(userNodes[0]?.id, 'message:chat-1:local:client-message-1');
  assert.equal(userNodes[0]?.runId, 'run-1');
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
  assert.equal(awaiting.answerSummary?.title, '已提交 3 项回答');
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
