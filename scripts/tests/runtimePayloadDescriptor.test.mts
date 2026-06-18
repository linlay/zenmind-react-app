import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimePayloadDescriptor,
  buildToolPillRecords,
  formatToolArgumentsInline,
} from '../../src/features/chatPersistence/components/runtimePayloadDescriptor.ts';
import { createTranslator } from '../../src/shared/i18n/translate.ts';
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

test('runtime descriptor normalizes backend reasoning titles for display', () => {
  const node: ChatTimelineTextNode = {
    ...baseNode,
    id: 'reasoning-1',
    kind: 'reasoning',
    title: 'Computing',
    body: 'Let me inspect the context.',
    status: 'complete',
    streaming: false,
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
    title: '规划',
    body: '# 实施计划\n\n## Summary\n\n改成红色主题。',
    status: '已完成',
    streaming: false,
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
    status: '更新中',
    lifecycle: 'active',
    streaming: true,
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
  assert.equal(descriptor.activeToolStartedAt, null);
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
    status: '运行中',
    argsText: '{"query":"expo"}',
    resultText: '',
    body: '',
    streaming: true,
    lifecycle: 'active',
    createdAt: 4_000,
    updatedAt: 4_000,
  };
  const completedNode: ChatTimelineToolNode = {
    ...runningNode,
    id: 'tool-completed',
    toolId: 'tool-completed',
    status: '结果返回',
    resultText: '{"ok":true}',
    streaming: false,
    lifecycle: 'complete',
    updatedAt: 5_000,
  };

  assert.equal(buildRuntimePayloadDescriptor(runningNode).activeToolStartedAt, 4_000);
  assert.equal(buildRuntimePayloadDescriptor(completedNode).activeToolStartedAt, null);
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
    status: '结果返回',
    argsText: '{"query":"expo"}',
    resultText: '{"ok":true}',
    body: '',
    streaming: false,
  };
  const runningNode: ChatTimelineToolNode = {
    ...completedNode,
    id: 'tool-2',
    toolId: 'tool-2',
    status: '运行中',
    resultText: '',
    streaming: true,
    lifecycle: 'active',
    createdAt: 6_000,
    updatedAt: 6_000,
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
    count: 2,
  };

  assert.equal(buildRuntimePayloadDescriptor(group).activeToolStartedAt, 6_000);
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
