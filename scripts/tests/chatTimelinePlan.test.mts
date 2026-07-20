import assert from 'node:assert/strict';
import test from 'node:test';

import { projectRemoteChatDetail } from '../../src/features/chatPersistence/chatProjector.ts';
import {
  applyChatTimelineEvent,
  buildChatTimelineDisplayModel,
  deserializeChatTimelineState,
  normalizeChatTimelinePlanEvent,
  projectTimelineRuntimeState,
  serializeChatTimelineState,
  timelinePersistenceInternals,
  type ChatTimelinePlanNode,
  type ChatTimelineState,
  type SerializedTimelineMeta,
  type SerializedTimelineNode,
} from '../../src/features/chatTimeline/index.ts';

const EPOCH_MS = 1_700_000_000_000;

function getPlanNode(state: ChatTimelineState): ChatTimelinePlanNode {
  const node = state.orderedNodeIds
    .map((nodeId) => state.nodesById[nodeId])
    .find((candidate) => candidate?.kind === 'plan');
  assert.ok(node && node.kind === 'plan');
  return node;
}

test('plan normalizer supports nested detail snapshots and step aliases', () => {
  const normalized = normalizeChatTimelinePlanEvent(
    {
      type: 'plan.update',
      id: 'event-envelope-id',
      payload: {
        planId: 'plan-detail',
        title: 'Ship detail view',
        tasks: [
          { id: 'step-1', title: 'Build model', status: 'done', durationMs: 1200 },
          { taskId: 'step-2', description: 'Render panel', state: 'in_progress' },
        ],
      },
    },
    EPOCH_MS,
  );

  assert.equal(normalized.planId, 'plan-detail');
  assert.equal(normalized.title, 'Ship detail view');
  assert.equal(normalized.status, 'running');
  assert.equal(normalized.hasStepsSnapshot, true);
  assert.deepEqual(
    normalized.steps.map((step) => [step.taskId, step.description, step.status]),
    [
      ['step-1', 'Build model', 'completed'],
      ['step-2', 'Render panel', 'running'],
    ],
  );
  assert.equal(normalized.steps[0]?.durationMs, 1200);
  assert.equal(normalized.steps[1]?.startedAt, EPOCH_MS);
});

test('plan updates do not revive an empty terminal plan without an explicit status', () => {
  const completed = applyChatTimelineEvent(null, 'chat-plan-empty', {
    type: 'plan.complete',
    planId: 'plan-empty',
    timestamp: EPOCH_MS,
  });
  const replayed = applyChatTimelineEvent(completed, 'chat-plan-empty', {
    type: 'plan.update',
    planId: 'plan-empty',
    title: 'Late snapshot title',
    timestamp: EPOCH_MS + 1000,
  });

  assert.equal(getPlanNode(replayed).status, 'completed');
  assert.equal(getPlanNode(replayed).title, 'Late snapshot title');
});

test('plan reducer keeps one stable entity across create update complete and stale replay', () => {
  const created = applyChatTimelineEvent(null, 'chat-plan', {
    type: 'plan.create',
    planId: 'plan-1',
    runId: 'run-1',
    title: 'Release mobile alignment',
    startedAt: EPOCH_MS,
    durationMs: 700,
    plan: [
      { taskId: 'step-1', description: 'Model plan state' },
      { taskId: 'step-2', description: 'Render plan panel' },
    ],
    timestamp: EPOCH_MS,
  });
  const updatedEvent = {
    type: 'plan.update',
    planId: 'plan-1',
    runId: 'run-2',
    plan: [
      { taskId: 'step-1', description: 'Model plan state', status: 'completed', durationMs: 1000 },
      {
        taskId: 'step-2',
        description: 'Render plan panel',
        status: 'running',
        startedAt: EPOCH_MS + 1000,
        durationMs: 400,
      },
    ],
    timestamp: EPOCH_MS + 2000,
  };
  const updated = applyChatTimelineEvent(created, 'chat-plan', updatedEvent);
  const repeated = applyChatTimelineEvent(updated, 'chat-plan', updatedEvent);
  const stale = applyChatTimelineEvent(updated, 'chat-plan', {
    ...updatedEvent,
    title: 'Stale title',
    timestamp: EPOCH_MS + 1500,
  });
  const activePlan = getPlanNode(updated);

  assert.equal(activePlan.id, 'plan:chat-plan:plan-1');
  assert.equal(activePlan.runId, 'run-2');
  assert.equal(activePlan.status, 'running');
  assert.equal(activePlan.steps[1]?.status, 'running');
  assert.equal(
    updated.orderedNodeIds.filter((nodeId) => updated.nodesById[nodeId]?.kind === 'plan').length,
    1,
  );
  assert.equal(repeated, updated);
  assert.equal(stale, updated);

  const completed = applyChatTimelineEvent(updated, 'chat-plan', {
    type: 'plan.complete',
    planId: 'plan-1',
    summary: 'Mobile alignment shipped',
    timestamp: EPOCH_MS + 5000,
  });
  const completedPlan = getPlanNode(completed);
  assert.equal(completedPlan.id, activePlan.id);
  assert.equal(completedPlan.status, 'completed');
  assert.equal(completedPlan.lifecycle, 'complete');
  assert.equal(completedPlan.summary, 'Mobile alignment shipped');
  assert.equal(completedPlan.durationMs, 5000);
  assert.deepEqual(
    completedPlan.steps.map((step) => step.status),
    ['completed', 'completed'],
  );
  assert.equal(completedPlan.steps[1]?.durationMs, 4000);
});

test('plan failures preserve the failed step and error reason', () => {
  const active = applyChatTimelineEvent(null, 'chat-plan-failed', {
    type: 'plan.create',
    planId: 'plan-failed',
    plan: [{ taskId: 'step-1', description: 'Risky step', status: 'running' }],
    timestamp: EPOCH_MS,
  });
  const failed = applyChatTimelineEvent(active, 'chat-plan-failed', {
    type: 'plan.failed',
    planId: 'plan-failed',
    error: 'Deployment rejected',
    timestamp: EPOCH_MS + 2500,
  });
  const node = getPlanNode(failed);

  assert.equal(node.status, 'failed');
  assert.equal(node.lifecycle, 'error');
  assert.equal(node.errorReason, 'Deployment rejected');
  assert.equal(node.steps[0]?.status, 'failed');
  assert.equal(node.steps[0]?.errorReason, 'Deployment rejected');
});

test('top-level detail plan snapshots use the same structured projection', () => {
  const projected = projectRemoteChatDetail({
    chatId: 'chat-plan-detail',
    plan: {
      planId: 'plan-detail',
      title: 'Detail snapshot plan',
      status: 'completed',
      tasks: [
        { id: 'step-1', title: 'Read detail', status: 'completed' },
        { id: 'step-2', title: 'Render detail', status: 'completed' },
      ],
    },
    events: [],
  });
  assert.ok(projected);
  const plan = getPlanNode(projected.timelineState);

  assert.equal(plan.planId, 'plan-detail');
  assert.equal(plan.status, 'completed');
  assert.deepEqual(
    plan.steps.map((step) => step.description),
    ['Read detail', 'Render detail'],
  );
});

test('plan persistence roundtrips typed nodes and migrates legacy record snapshots', () => {
  const state = applyChatTimelineEvent(null, 'chat-plan-persisted', {
    type: 'plan.complete',
    planId: 'plan-typed',
    title: 'Typed plan',
    plan: [{ taskId: 'step-1', description: 'Persist it', status: 'completed' }],
    timestamp: EPOCH_MS,
  });
  const serialized = serializeChatTimelineState(state);
  const restored = deserializeChatTimelineState(serialized.meta, serialized.nodes);
  assert.ok(restored);
  assert.deepEqual(getPlanNode(restored), getPlanNode(state));

  const legacyNode = {
    id: 'plan:chat-plan-legacy:run-1:plan-old',
    kind: 'plan',
    title: 'Legacy plan',
    body: 'Legacy summary',
    status: 'completed',
    streaming: false,
    runId: 'run-1',
    createdAt: EPOCH_MS,
    updatedAt: EPOCH_MS + 1000,
    order: 0,
    lifecycle: 'complete',
  };
  const payloadJson = timelinePersistenceInternals.stableStringify(legacyNode);
  const meta: SerializedTimelineMeta = {
    conversationId: 'chat-plan-legacy',
    activeRunId: '',
    awaitingId: null,
    usageLabel: '',
    updatedAt: EPOCH_MS + 1000,
    revision: 1,
    nextOrder: 1,
  };
  const rows: SerializedTimelineNode[] = [
    {
      conversationId: 'chat-plan-legacy',
      nodeId: legacyNode.id,
      kind: 'plan',
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
  const legacyPlan = getPlanNode(migrated);
  assert.equal(legacyPlan.id, 'plan:chat-plan-legacy:plan-old');
  assert.equal(legacyPlan.planId, 'plan-old');
  assert.equal(legacyPlan.summary, 'Legacy summary');
  assert.deepEqual(legacyPlan.steps, []);
});

test('active non-tail plan updates replace only their display item', () => {
  let state = applyChatTimelineEvent(null, 'chat-plan-display', {
    type: 'plan.create',
    planId: 'plan-display',
    runId: 'run-display',
    plan: [
      { taskId: 'step-1', description: 'First step', status: 'running' },
      { taskId: 'step-2', description: 'Second step' },
    ],
    timestamp: EPOCH_MS,
  });
  state = applyChatTimelineEvent(state, 'chat-plan-display', {
    type: 'content.snapshot',
    runId: 'run-display',
    contentId: 'answer-1',
    text: 'Working on the plan.',
    timestamp: EPOCH_MS + 100,
  });
  const firstModel = buildChatTimelineDisplayModel(state);
  const nextState = applyChatTimelineEvent(state, 'chat-plan-display', {
    type: 'plan.update',
    planId: 'plan-display',
    runId: 'run-display',
    plan: [
      { taskId: 'step-1', description: 'First step', status: 'completed' },
      { taskId: 'step-2', description: 'Second step', status: 'running' },
    ],
    timestamp: EPOCH_MS + 200,
  });
  const nextModel = buildChatTimelineDisplayModel(nextState, firstModel);
  const firstPlanIndex = firstModel.items.findIndex((item) => item.kind === 'plan');
  const nextPlanIndex = nextModel.items.findIndex((item) => item.kind === 'plan');
  const firstContentIndex = firstModel.items.findIndex((item) => item.kind === 'assistant-content');
  const nextContentIndex = nextModel.items.findIndex((item) => item.kind === 'assistant-content');

  assert.equal(firstPlanIndex, nextPlanIndex);
  assert.notEqual(nextModel.items[nextPlanIndex], firstModel.items[firstPlanIndex]);
  assert.equal(nextModel.items[nextContentIndex], firstModel.items[firstContentIndex]);
  assert.equal(nextModel.items.filter((item) => item.kind === 'plan').length, 1);

  const runtimePlan = projectTimelineRuntimeState(nextState).entries.find(
    (entry) => entry.kind === 'plan',
  );
  assert.equal(runtimePlan?.title, 'plan-display');
  assert.match(runtimePlan?.body || '', /completed: First step/);
  assert.doesNotMatch(runtimePlan?.body || '', /\{"type"/);
});
