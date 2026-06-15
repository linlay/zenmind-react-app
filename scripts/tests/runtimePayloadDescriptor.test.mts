import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimePayloadDescriptor,
  buildToolPillRecords,
  formatToolArgumentsInline,
} from '../../src/features/chatPersistence/components/runtimePayloadDescriptor.ts';
import type {
  ChatTimelineAwaitingNode,
  ChatTimelineRunNode,
  ChatTimelineTextNode,
  ChatTimelineToolGroupDisplayItem,
  ChatTimelineToolNode,
} from '../../src/features/chatTimeline/index.ts';

const baseNode = {
  runId: 'run-1',
  createdAt: 1_000,
  updatedAt: 1_000,
  order: 1,
  lifecycle: 'complete' as const,
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
    streaming: false,
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'tool');
  assert.equal(descriptor.iconUsage, 'runtime.tool');
  assert.equal(descriptor.tone, 'tool');
  assert.equal(descriptor.statusTone, 'error');
  assert.equal(descriptor.defaultWrap, false);
  assert.deepEqual(
    descriptor.sections.map((section) => section.label),
    ['参数', '结果']
  );
  assert.match(descriptor.copyText, /参数/);
  assert.match(descriptor.copyText, /sub_agent_failed/);
  assert.deepEqual(
    descriptor.toolRecords.map((record) => [record.title, record.status, record.hasDetails]),
    [['第 1 次', 'error', true]]
  );
});

test('runtime descriptor keeps reasoning markdown lightweight and nowrap by default', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'reasoning-1',
    kind: 'reasoning',
    title: '思考过程',
    body: 'Let me inspect the context.',
    status: 'complete',
    streaming: false,
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'markdown');
  assert.equal(descriptor.iconUsage, 'runtime.reasoning');
  assert.equal(descriptor.tone, 'reasoning');
  assert.equal(descriptor.defaultExpanded, false);
  assert.equal(descriptor.defaultWrap, false);
  assert.equal(descriptor.copyText, 'Let me inspect the context.');
});

test('runtime descriptor normalizes generic reasoning titles for display', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'reasoning-1',
    kind: 'reasoning',
    title: 'Thinking',
    body: 'Let me inspect the context.',
    status: 'complete',
    streaming: false,
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.title, '思考过程');
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
    status: '结果返回',
    argsText: '{\n  "timezone": "Asia/Shanghai"\n}',
    resultText: '{\n  "date": "2026-06-03"\n}',
    body: '',
    streaming: false,
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
    status: '出错',
    argsText: '{"offset":"+1D"}',
    resultText: '{"error":"invalid offset"}',
    body: '',
    streaming: false,
    lifecycle: 'error',
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
    count: 2,
  };

  const descriptor = buildRuntimePayloadDescriptor(group);
  const records = buildToolPillRecords(group);

  assert.equal(descriptor.renderer, 'tool');
  assert.equal(descriptor.title, '日期时间');
  assert.equal(descriptor.canExpand, true);
  assert.deepEqual(
    records.map((record) => [record.title, record.status, record.statusLabel]),
    [
      ['第 1 次', 'success', '完成'],
      ['第 2 次', 'error', '失败'],
    ]
  );
  assert.equal(records[0].argsInlineText, '{"timezone":"Asia/Shanghai"}');
  assert.deepEqual(records[0].argsRows, [{ key: 'timezone', valueText: 'Asia/Shanghai' }]);
  assert.equal(records[0].resultText, '{"date":"2026-06-03"}');
  assert.equal(formatToolArgumentsInline('line 1\n  line 2'), 'line 1 line 2');
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
    interactive: null,
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
    title: '运行',
    body: '已完成',
    status: 'complete',
    agentKey: 'coder',
    startedAt: 1_000,
    completedAt: 3_500,
    durationMs: 2_500,
  };

  const descriptor = buildRuntimePayloadDescriptor(node);

  assert.equal(descriptor.renderer, 'plain');
  assert.equal(descriptor.defaultExpanded, true);
  assert.equal(descriptor.copyText, '已完成\n耗时 2.5s');
});
