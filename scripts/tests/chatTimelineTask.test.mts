import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyChatTimelineEvent,
  buildChatTimelineDisplayModel,
  buildChatTimelineTaskView,
  deserializeChatTimelineState,
  normalizeChatTimelineTaskEvent,
  projectTimelineRuntimeState,
  serializeChatTimelineState,
  timelinePersistenceInternals,
  type ChatTimelinePlanDisplayItem,
  type ChatTimelineState,
  type ChatTimelineTaskDisplayItem,
  type ChatTimelineTaskNode,
  type SerializedTimelineMeta,
  type SerializedTimelineNode,
} from '../../src/features/chatTimeline/index.ts';

const EPOCH_MS = 1_700_000_000_000;

function getTaskNodes(state: ChatTimelineState): ChatTimelineTaskNode[] {
  return state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .filter((node): node is ChatTimelineTaskNode => node?.kind === 'task');
}

function getTaskNode(state: ChatTimelineState, taskId: string): ChatTimelineTaskNode {
  const node = getTaskNodes(state).find((candidate) => candidate.taskId === taskId);
  assert.ok(node);
  return node;
}

test('task normalizer supports nested aliases and preserves explicit ownership', () => {
  const normalized = normalizeChatTimelineTaskEvent(
    {
      type: 'task.update',
      id: 'event-envelope',
      payload: {
        planId: 'plan-nested',
        task: {
          id: 'task-nested',
          parentId: 'task-parent',
          groupId: 'parallel-1',
          title: 'Nested task',
          assigneeAgentKey: 'agent-owner',
          subAgentKey: 'agent-worker',
          state: 'in_progress',
          startedAt: EPOCH_MS,
        },
      },
    },
    EPOCH_MS + 100,
  );

  assert.equal(normalized.taskId, 'task-nested');
  assert.equal(normalized.planId, 'plan-nested');
  assert.equal(normalized.parentTaskId, 'task-parent');
  assert.equal(normalized.taskGroupId, 'parallel-1');
  assert.equal(normalized.taskName, 'Nested task');
  assert.equal(normalized.agentKey, 'agent-owner');
  assert.equal(normalized.subAgentKey, 'agent-worker');
  assert.equal(normalized.status, 'running');
  assert.equal(normalized.startedAt, EPOCH_MS);
});

test('parallel task events attach to one plan without duplicate standalone rows', () => {
  let state = applyChatTimelineEvent(null, 'chat-task-plan', {
    type: 'plan.create',
    planId: 'plan-1',
    runId: 'run-1',
    plan: [
      { taskId: 'task-1', description: 'First agent task' },
      { taskId: 'task-2', description: 'Second agent task' },
    ],
    timestamp: EPOCH_MS,
  });
  state = applyChatTimelineEvent(state, 'chat-task-plan', {
    type: 'task.start',
    taskId: 'task-1',
    runId: 'run-1',
    subAgentKey: 'agent-a',
    timestamp: EPOCH_MS + 100,
  });
  state = applyChatTimelineEvent(state, 'chat-task-plan', {
    type: 'task.start',
    taskId: 'task-2',
    runId: 'run-1',
    subAgentKey: 'agent-b',
    timestamp: EPOCH_MS + 200,
  });
  state = applyChatTimelineEvent(state, 'chat-task-plan', {
    type: 'task.complete',
    taskId: 'task-1',
    timestamp: EPOCH_MS + 1100,
  });

  const tasks = getTaskNodes(state);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.planId, 'plan-1');
  assert.equal(tasks[1]?.planId, 'plan-1');
  assert.equal(tasks[0]?.taskGroupId, tasks[1]?.taskGroupId);
  assert.equal(getTaskNode(state, 'task-1').durationMs, 1000);

  const items = buildChatTimelineDisplayModel(state).items;
  const planItem = items.find((item): item is ChatTimelinePlanDisplayItem => item.kind === 'plan');
  assert.ok(planItem);
  assert.deepEqual(
    planItem.tasks.map((task) => task.taskId),
    ['task-1', 'task-2'],
  );
  assert.equal(items.some((item) => item.kind === 'task'), false);
  const view = buildChatTimelineTaskView(planItem.node.steps, planItem.tasks);
  assert.deepEqual(
    view.map((item) => [item.taskId, item.parallelCount, item.subAgentKey, item.status]),
    [
      ['task-1', 2, 'agent-a', 'completed'],
      ['task-2', 2, 'agent-b', 'running'],
    ],
  );
});

test('task hierarchy keeps parents before children and groups parallel siblings', () => {
  let state = applyChatTimelineEvent(null, 'chat-task-tree', {
    type: 'task.start',
    taskId: 'parent',
    taskName: 'Parent task',
    runId: 'run-tree',
    timestamp: EPOCH_MS,
  });
  state = applyChatTimelineEvent(state, 'chat-task-tree', {
    type: 'task.start',
    taskId: 'child-a',
    taskName: 'Child A',
    parentId: 'parent',
    subAgentKey: 'agent-a',
    timestamp: EPOCH_MS + 100,
  });
  state = applyChatTimelineEvent(state, 'chat-task-tree', {
    type: 'content.snapshot',
    contentId: 'child-a-output',
    runId: 'run-tree',
    text: 'Interleaved child output',
    timestamp: EPOCH_MS + 150,
  });
  state = applyChatTimelineEvent(state, 'chat-task-tree', {
    type: 'task.start',
    taskId: 'child-b',
    taskName: 'Child B',
    parentTaskId: 'parent',
    subAgentKey: 'agent-b',
    timestamp: EPOCH_MS + 200,
  });

  const view = buildChatTimelineTaskView([], getTaskNodes(state));
  assert.deepEqual(view.map((item) => item.taskId), ['parent', 'child-a', 'child-b']);
  assert.equal(view[1]?.depth, 1);
  assert.equal(view[1]?.parentTaskName, 'Parent task');
  assert.equal(view[1]?.parallelCount, 2);
  assert.equal(view[2]?.parallelCount, 2);
  assert.equal(view[1]?.taskGroupId, view[2]?.taskGroupId);
  const taskItems = buildChatTimelineDisplayModel(state).items.filter(
    (item): item is ChatTimelineTaskDisplayItem => item.kind === 'task',
  );
  assert.equal(taskItems.length, 2);
  assert.deepEqual(
    taskItems.find((item) => item.nodes.some((node) => node.taskId === 'child-a'))?.nodes.map(
      (node) => node.taskId,
    ),
    ['child-a', 'child-b'],
  );
});

test('a later plan snapshot adopts earlier tasks from the same run', () => {
  let state = applyChatTimelineEvent(null, 'chat-task-before-plan', {
    type: 'run.start',
    runId: 'run-before-plan',
    timestamp: EPOCH_MS,
  });
  state = applyChatTimelineEvent(state, 'chat-task-before-plan', {
    type: 'task.start',
    taskId: 'task-before-plan',
    taskName: 'Early task',
    timestamp: EPOCH_MS + 100,
  });
  state = applyChatTimelineEvent(state, 'chat-task-before-plan', {
    type: 'plan.create',
    planId: 'plan-late',
    runId: 'run-before-plan',
    plan: [{ taskId: 'task-before-plan', description: 'Early task' }],
    timestamp: EPOCH_MS + 200,
  });

  const items = buildChatTimelineDisplayModel(state).items;
  const plan = items.find((item): item is ChatTimelinePlanDisplayItem => item.kind === 'plan');
  assert.ok(plan);
  assert.deepEqual(plan.tasks.map((task) => task.taskId), ['task-before-plan']);
  assert.equal(items.some((item) => item.kind === 'task'), false);
});

test('terminal task replay ignores stale starts and exact duplicates by identity', () => {
  const failedEvent = {
    type: 'task.fail',
    taskId: 'task-stale',
    runId: 'run-stale',
    taskName: 'Risky task',
    error: 'Worker unavailable',
    timestamp: EPOCH_MS + 300,
  };
  const failed = applyChatTimelineEvent(null, 'chat-task-stale', failedEvent);
  const repeated = applyChatTimelineEvent(failed, 'chat-task-stale', failedEvent);
  const stale = applyChatTimelineEvent(failed, 'chat-task-stale', {
    type: 'task.start',
    taskId: 'task-stale',
    runId: 'run-stale',
    timestamp: EPOCH_MS + 100,
  });

  assert.equal(repeated, failed);
  assert.equal(stale, failed);
  assert.equal(getTaskNodes(failed).length, 1);
  assert.equal(getTaskNode(failed, 'task-stale').status, 'failed');
  assert.equal(getTaskNode(failed, 'task-stale').errorReason, 'Worker unavailable');
});

test('run completion closes active tasks with final duration', () => {
  let state = applyChatTimelineEvent(null, 'chat-task-run', {
    type: 'run.start',
    runId: 'run-1',
    timestamp: EPOCH_MS,
  });
  state = applyChatTimelineEvent(state, 'chat-task-run', {
    type: 'task.start',
    taskId: 'task-run',
    durationMs: 250,
    timestamp: EPOCH_MS + 100,
  });
  state = applyChatTimelineEvent(state, 'chat-task-run', {
    type: 'run.complete',
    runId: 'run-1',
    timestamp: EPOCH_MS + 2100,
  });

  const task = getTaskNode(state, 'task-run');
  assert.equal(task.status, 'completed');
  assert.equal(task.completedAt, EPOCH_MS + 2100);
  assert.equal(task.durationMs, 2000);
});

test('task persistence roundtrips typed nodes and migrates legacy records', () => {
  const state = applyChatTimelineEvent(null, 'chat-task-persisted', {
    type: 'task.complete',
    taskId: 'task-typed',
    taskName: 'Typed task',
    planId: 'plan-typed',
    groupId: 'group-typed',
    timestamp: EPOCH_MS,
  });
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.ok(restored);
  assert.deepEqual(getTaskNode(restored, 'task-typed'), getTaskNode(state, 'task-typed'));

  const legacyNode = {
    id: 'task:chat-task-legacy:run-1:task-old',
    kind: 'task',
    title: 'Legacy task',
    body: 'Legacy failure',
    status: 'failed',
    streaming: false,
    runId: 'run-1',
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS + 1000,
    order: 0,
    lifecycle: 'error',
  };
  const payloadJson = timelinePersistenceInternals.stableStringify(legacyNode);
  const meta: SerializedTimelineMeta = {
    conversationId: 'chat-task-legacy',
    activeRunId: '',
    awaitingId: null,
    usageLabel: '',
    updatedAt: EPOCH_MS + 1000,
    revision: 1,
    nextOrder: 1,
  };
  const rows: SerializedTimelineNode[] = [
    {
      conversationId: 'chat-task-legacy',
      nodeId: legacyNode.id,
      kind: 'task',
      runId: 'run-1',
      orderIndex: 0,
      createdAt: EPOCH_MS,
      updatedAt: EPOCH_MS + 1000,
      payloadHash: timelinePersistenceInternals.hashText(payloadJson),
      payloadJson,
    },
  ];
  const migrated = deserializeChatTimelineState(meta, rows);
  assert.ok(migrated);
  const task = getTaskNode(migrated, 'task-old');
  assert.equal(task.id, 'task:chat-task-legacy:task-old');
  assert.equal(task.taskName, 'Legacy task');
  assert.equal(task.errorReason, 'Legacy failure');
});

test('standalone task updates replace only their display group', () => {
  let state = applyChatTimelineEvent(null, 'chat-task-display', {
    type: 'task.start',
    taskId: 'task-display',
    taskName: 'Standalone task',
    runId: 'run-display',
    timestamp: EPOCH_MS,
  });
  state = applyChatTimelineEvent(state, 'chat-task-display', {
    type: 'content.snapshot',
    contentId: 'answer-1',
    runId: 'run-display',
    text: 'Independent answer',
    timestamp: EPOCH_MS + 100,
  });
  const firstModel = buildChatTimelineDisplayModel(state);
  const completed = applyChatTimelineEvent(state, 'chat-task-display', {
    type: 'task.complete',
    taskId: 'task-display',
    timestamp: EPOCH_MS + 500,
  });
  const nextModel = buildChatTimelineDisplayModel(completed, firstModel);
  const firstTask = firstModel.items.find(
    (item): item is ChatTimelineTaskDisplayItem => item.kind === 'task',
  );
  const nextTask = nextModel.items.find(
    (item): item is ChatTimelineTaskDisplayItem => item.kind === 'task',
  );
  const firstContent = firstModel.items.find((item) => item.kind === 'assistant-content');
  const nextContent = nextModel.items.find((item) => item.kind === 'assistant-content');

  assert.ok(firstTask && nextTask && firstContent && nextContent);
  assert.notEqual(nextTask, firstTask);
  assert.equal(nextContent, firstContent);
  assert.equal(nextTask.nodes[0]?.status, 'completed');

  const runtimeTask = projectTimelineRuntimeState(completed).entries.find(
    (entry) => entry.kind === 'task',
  );
  assert.equal(runtimeTask?.title, 'Standalone task');
  assert.equal(runtimeTask?.body, 'completed');
  assert.doesNotMatch(runtimeTask?.body || '', /\{"type"/);
});
