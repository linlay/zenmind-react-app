import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimePayloadDescriptor,
  buildToolPillRecords,
  resolveRuntimePayloadCopyText
} from '../../src/features/chatPersistence/components/runtimePayloadDescriptor.ts';
import { createTranslator } from '../../src/shared/i18n/translate.ts';
import type {
  ChatTimelineAwaitingNode,
  ChatTimelineRunNode,
  ChatTimelineTextNode,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode
} from '../../src/features/chatTimeline/index.ts';

const baseNode = {
  runId: 'run-1',
  createdAt: 1_000,
  updatedAt: 1_000,
  order: 1,
  lifecycle: 'complete' as const
};

test('runtime descriptor maps tool nodes to tool renderer with copyable sections', () => {
  const node: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-1',
    kind: 'tool',
    toolId: 'tool-1',
    toolName: 'agent_invoke',
    toolLabel: '调度智能体',
    description: '',
    title: '调度智能体',
    status: 'failed',
    argsText: '{ "task": "plan trip" }',
    resultText: '{ "error": "sub_agent_failed" }',
    body: '',
    streaming: false
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'tool');
  assert.equal(descriptor.iconUsage, 'runtime.tool');
  assert.equal(descriptor.tone, 'tool');
  assert.equal(descriptor.statusTone, 'error');
  assert.equal(descriptor.defaultWrap, false);
  assert.deepEqual(descriptor.sections, []);
  assert.equal(typeof descriptor.copyText, 'function');
  assert.match(resolveRuntimePayloadCopyText(descriptor.copyText), /参数/);
  assert.match(resolveRuntimePayloadCopyText(descriptor.copyText), /sub_agent_failed/);
  assert.deepEqual(
    descriptor.toolRecords.map((record) => [record.title, record.status, record.hasDetails, record.durationText]),
    [['第 1 次', 'error', true, '']]
  );
});

test('runtime descriptor defers tool payload parsing and redaction until copy is requested', () => {
  const node: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-lazy',
    kind: 'tool',
    toolId: 'tool-lazy',
    toolName: 'request',
    toolLabel: '请求',
    description: '',
    title: '请求',
    status: 'tool_result',
    argsText: '{"password":"secret-password","nested":{"value":1}}',
    resultText: '{"authorization":"Bearer secret-token","ok":true}',
    body: '',
    streaming: false
  };
  const originalParse = JSON.parse;
  let descriptor: ReturnType<typeof buildRuntimePayloadDescriptor>;

  JSON.parse = () => {
    throw new Error('descriptor must not parse collapsed payloads');
  };
  try {
    descriptor = buildRuntimePayloadDescriptor(node);
  } finally {
    JSON.parse = originalParse;
  }

  assert.equal(typeof descriptor.copyText, 'function');
  const copied = resolveRuntimePayloadCopyText(descriptor.copyText);
  assert.equal(copied.includes('secret-password'), false);
  assert.equal(copied.includes('secret-token'), false);
  assert.match(copied, /\[redacted\]/);
});

test('runtime descriptor keeps reasoning markdown lightweight and nowrap by default', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'reasoning-1',
    kind: 'reasoning',
    title: '思考过程',
    body: 'Let me inspect the context.',
    status: 'completed',
    streaming: false
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'markdown');
  assert.equal(descriptor.iconUsage, 'runtime.reasoning');
  assert.equal(descriptor.tone, 'reasoning');
  assert.equal(descriptor.defaultExpanded, false);
  assert.equal(descriptor.defaultWrap, false);
  assert.equal(descriptor.copyText, 'Let me inspect the context.');
});

test('runtime descriptor normalizes backend reasoning titles for display', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'reasoning-1',
    kind: 'reasoning',
    title: 'Computing',
    body: 'Let me inspect the context.',
    status: 'completed',
    streaming: false
  };

  const descriptor = buildRuntimePayloadDescriptor(node);
  const enDescriptor = buildRuntimePayloadDescriptor(node, createTranslator('en-US'));

  assert.equal(descriptor.title, '思考过程');
  assert.equal(enDescriptor.title, 'Thinking process');
});

test('runtime descriptor presents planning markdown as an expanded implementation plan', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'planning-1',
    kind: 'planning',
    title: '',
    body: '# 实施计划\n\n## Summary\n\n改成红色主题。',
    status: 'completed',
    streaming: false
  };

  const descriptor = buildRuntimePayloadDescriptor(node);
  const enDescriptor = buildRuntimePayloadDescriptor(node, createTranslator('en-US'));

  assert.equal(descriptor.title, '实施计划');
  assert.equal(enDescriptor.title, 'Implementation plan');
  assert.equal(descriptor.renderer, 'markdown');
  assert.equal(descriptor.defaultExpanded, true);
  assert.equal(descriptor.defaultWrap, false);
  assert.equal(descriptor.copyText, node.body);
});

test('runtime descriptor keeps backend reasoning title while active', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'reasoning-1',
    kind: 'reasoning',
    title: 'Computing',
    body: 'Let me inspect the context.',
    status: 'updating',
    lifecycle: 'active',
    streaming: true
  };

  const descriptor = buildRuntimePayloadDescriptor(node);
  const enDescriptor = buildRuntimePayloadDescriptor(node, createTranslator('en-US'));

  assert.equal(descriptor.title, 'Computing');
  assert.equal(enDescriptor.title, 'Computing');
});

test('runtime descriptor builds grouped tool records with per-call status', () => {
  const firstNode: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-1',
    kind: 'tool',
    toolId: 'tool-1',
    toolName: 'date_time',
    toolLabel: '日期时间',
    description: '',
    title: '日期时间',
    status: 'tool_result',
    argsText: '{\n  "timezone": "Asia/Shanghai"\n}',
    resultText: '{\n  "date": "2026-06-03"\n}',
    body: '',
    streaming: false
  };
  const secondNode: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-2',
    kind: 'tool',
    toolId: 'tool-2',
    toolName: 'date_time',
    toolLabel: '日期时间',
    description: '',
    title: '日期时间',
    status: 'error',
    argsText: '{"offset":"+1D"}',
    resultText: '{"error":"invalid offset"}',
    body: '',
    streaming: false,
    lifecycle: 'error'
  };
  const group: ChatTimelineToolGroupDisplayItem = {
    key: 'tool-group:tool-1',
    kind: 'tool-group',
    node: firstNode,
    nodes: [firstNode, secondNode],
    nodeId: firstNode.id,
    runId: firstNode.runId,
    isFirstInRun: false,
    isLastInRun: false,
    groupIndex: 1,
    toolName: firstNode.toolName,
    toolLabel: firstNode.toolLabel,
    count: 2
  };

  const descriptor = buildRuntimePayloadDescriptor(group);
  const records = buildToolPillRecords(group);

  assert.equal(descriptor.renderer, 'tool');
  assert.equal(descriptor.title, '日期时间');
  assert.equal(descriptor.canExpand, true);
  assert.deepEqual(
    records.map((record) => [record.title, record.status, record.statusLabel, record.durationText]),
    [
      ['第 1 次', 'success', '完成', ''],
      ['第 2 次', 'error', '失败', '']
    ]
  );
  assert.equal(records[0].argsText, firstNode.argsText);
  assert.equal(records[0].resultText, firstNode.resultText);
  assert.equal('argsRows' in records[0], false);
  assert.equal('argsInlineText' in records[0], false);
});

test('runtime descriptor exposes active tool start time only while running', () => {
  const runningNode: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-running',
    kind: 'tool',
    toolId: 'tool-running',
    toolName: 'search',
    toolLabel: '搜索',
    description: '',
    title: '搜索',
    status: 'running',
    argsText: '{"query":"expo"}',
    resultText: '',
    body: '',
    streaming: true,
    lifecycle: 'active',
    createdAt: 4_000,
    updatedAt: 4_000
  };
  const completedNode: ChatTimelineToolNode = {
    ...runningNode,
    id: 'tool-completed',
    toolId: 'tool-completed',
    status: 'tool_result',
    resultText: '{"ok":true}',
    streaming: false,
    lifecycle: 'complete',
    updatedAt: 5_000
  };

  const runningRecord = buildRuntimePayloadDescriptor(runningNode).toolRecords[0];
  const completedRecord = buildRuntimePayloadDescriptor(completedNode).toolRecords[0];

  assert.equal(runningRecord?.startedAt, 4_000);
  assert.equal(runningRecord?.durationText, '');
  assert.equal(completedRecord?.startedAt, null);
  assert.equal(completedRecord?.durationText, '耗时 1.0s');
});

test('runtime descriptor uses the latest running call in a tool group', () => {
  const completedNode: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-1',
    kind: 'tool',
    toolId: 'tool-1',
    toolName: 'search',
    toolLabel: '搜索',
    description: '',
    title: '搜索',
    status: 'tool_result',
    argsText: '{"query":"expo"}',
    resultText: '{"ok":true}',
    body: '',
    streaming: false
  };
  const runningNode: ChatTimelineToolNode = {
    ...completedNode,
    id: 'tool-2',
    toolId: 'tool-2',
    status: 'running',
    resultText: '',
    streaming: true,
    lifecycle: 'active',
    createdAt: 6_000,
    updatedAt: 6_000
  };
  const group: ChatTimelineToolGroupDisplayItem = {
    key: 'tool-group:tool-1',
    kind: 'tool-group',
    node: completedNode,
    nodes: [completedNode, runningNode],
    nodeId: completedNode.id,
    runId: completedNode.runId,
    isFirstInRun: false,
    isLastInRun: false,
    groupIndex: 1,
    toolName: completedNode.toolName,
    toolLabel: completedNode.toolLabel,
    count: 2
  };

  const records = buildRuntimePayloadDescriptor(group).toolRecords;

  assert.equal(records[0]?.startedAt, null);
  assert.equal(records[1]?.startedAt, 6_000);
});

test('runtime descriptor hides sub-second completed tool durations', () => {
  const node: ChatTimelineToolNode = {
    ...baseNode,
    id: 'tool-fast',
    kind: 'tool',
    toolId: 'tool-fast',
    toolName: 'search',
    toolLabel: '搜索',
    description: '',
    title: '搜索',
    status: 'tool_result',
    argsText: '',
    resultText: '{"ok":true}',
    body: '',
    streaming: false,
    lifecycle: 'complete',
    createdAt: 4_000,
    updatedAt: 4_800
  };

  const record = buildRuntimePayloadDescriptor(node).toolRecords[0];

  assert.equal(record?.durationText, '');
});

test('runtime descriptor expands awaiting plan payloads with prompt options and answer', () => {
  const node: ChatTimelineAwaitingNode = {
    ...baseNode,
    id: 'awaiting-1',
    kind: 'awaiting',
    prompt: '实施此计划？',
    payloadText: '是，实施此计划\n否，请告知如何调整',
    answer: '同意',
    mode: 'plan',
    status: 'answer',
    interactive: null
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'awaiting');
  assert.equal(descriptor.defaultExpanded, true);
  assert.equal(descriptor.defaultWrap, false);
  assert.deepEqual(
    descriptor.sections.map((section) => section.label),
    ['问题', '计划选项', '回答']
  );
  assert.match(descriptor.copyText, /计划选项/);
});

test('runtime descriptor includes run duration in plain payload', () => {
  const node: ChatTimelineRunNode = {
    ...baseNode,
    id: 'run-1',
    kind: 'run',
    title: '',
    body: '已完成',
    status: 'completed',
    agentKey: 'coder',
    startedAt: 1_000,
    completedAt: 3_500,
    durationMs: 2_500
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'plain');
  assert.equal(descriptor.defaultExpanded, true);
  assert.equal(descriptor.copyText, '已完成\n耗时 2.5s');
});
