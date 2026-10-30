import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAwaitingSubmitPayload,
  findMissingApprovalIndex,
  hasAwaitingApprovalResponse,
  type AwaitingApprovalDraft
} from '../../src/features/chatPersistence/components/awaiting/awaitingSubmitState.ts';
import type {
  ChatTimelineAwaitingInteractive,
  ChatTimelineAwaitingState
} from '../../src/features/chatTimeline/index.ts';

function awaitingWithInteractive(interactive: ChatTimelineAwaitingInteractive): ChatTimelineAwaitingState {
  return {
    id: `awaiting-${interactive.kind}`,
    awaitingId: `${interactive.kind}-1`,
    runId: 'run-1',
    createdAt: 1,
    updatedAt: 1,
    prompt: '',
    answer: '',
    payloadText: '',
    mode: interactive.kind,
    status: 'ask',
    interactive
  };
}

test('awaiting submit builder creates approval and plan submit payloads', () => {
  const approvalAwaiting = awaitingWithInteractive({
    kind: 'approval',
    viewportType: 'builtin',
    viewportKey: 'approval',
    timeout: null,
    agentKey: 'shell',
    approvals: [
      {
        id: 'cmd-1',
        command: 'npm run dev',
        options: [{ label: '同意本轮', decision: 'approve_rule_run' }],
        allowFreeText: true
      }
    ]
  });

  assert.deepEqual(
    buildAwaitingSubmitPayload(approvalAwaiting, {
      kind: 'approval',
      decisions: { 'cmd-1': 'approve_rule_run' },
      reasons: { 'cmd-1': 'trusted command' }
    }),
    {
      runId: 'run-1',
      awaitingId: 'approval-1',
      params: [{ id: 'cmd-1', decision: 'approve_rule_run', reason: 'trusted command' }]
    }
  );

  const planAwaiting = awaitingWithInteractive({
    kind: 'plan',
    viewportType: 'builtin',
    viewportKey: 'plan',
    timeout: null,
    agentKey: 'planner',
    plan: {
      id: 'confirm',
      planningId: 'planning-1',
      title: '实施此计划？',
      options: [{ label: '拒绝', decision: 'reject' }]
    }
  });

  assert.deepEqual(
    buildAwaitingSubmitPayload(planAwaiting, {
      kind: 'plan',
      decision: 'reject',
      reason: 'narrow the scope'
    }),
    {
      runId: 'run-1',
      awaitingId: 'plan-1',
      param: { decision: 'reject', reason: 'narrow the scope' }
    }
  );
});

test('awaiting submit builder accepts approval reason without a decision', () => {
  const approvals = [
    {
      id: 'cmd-1',
      command: 'chmod 777 ~/a.sh',
      allowFreeText: true
    },
    {
      id: 'cmd-2',
      command: 'chmod 777 ~/b.sh',
      allowFreeText: true
    },
    {
      id: 'cmd-3',
      command: 'chmod 777 ~/c.sh',
      allowFreeText: true
    }
  ];
  const awaiting = awaitingWithInteractive({
    kind: 'approval',
    viewportType: 'builtin',
    viewportKey: 'approval',
    timeout: null,
    agentKey: 'shell',
    approvals
  });
  const draft: AwaitingApprovalDraft = {
    decisions: {
      'cmd-2': 'approve',
      'cmd-3': 'approve_rule_run'
    },
    reasons: {
      'cmd-1': '测试测试',
      'cmd-3': 'trusted rule'
    }
  };

  assert.equal(hasAwaitingApprovalResponse(approvals[0], draft), true);
  assert.equal(findMissingApprovalIndex(approvals, draft), -1);
  assert.deepEqual(buildAwaitingSubmitPayload(awaiting, { kind: 'approval', ...draft }), {
    runId: 'run-1',
    awaitingId: 'approval-1',
    params: [
      { id: 'cmd-1', reason: '测试测试' },
      { id: 'cmd-2', decision: 'approve' },
      { id: 'cmd-3', decision: 'approve_rule_run', reason: 'trusted rule' }
    ]
  });
});

test('awaiting approval response requires a decision or allowed nonblank reason', () => {
  const approvals = [
    {
      id: 'cmd-1',
      command: 'chmod 777 ~/a.sh',
      allowFreeText: true
    },
    {
      id: 'cmd-2',
      command: 'chmod 777 ~/b.sh'
    }
  ];
  const draft: AwaitingApprovalDraft = {
    decisions: {},
    reasons: {
      'cmd-1': '   ',
      'cmd-2': 'ignored'
    }
  };

  assert.equal(hasAwaitingApprovalResponse(approvals[0], draft), false);
  assert.equal(hasAwaitingApprovalResponse(approvals[1], draft), false);
  assert.equal(findMissingApprovalIndex(approvals, draft), 0);
  assert.deepEqual(
    buildAwaitingSubmitPayload(
      awaitingWithInteractive({
        kind: 'approval',
        viewportType: 'builtin',
        viewportKey: 'approval',
        timeout: null,
        agentKey: 'shell',
        approvals
      }),
      { kind: 'approval', ...draft }
    ),
    {
      runId: 'run-1',
      awaitingId: 'approval-1',
      params: []
    }
  );
});

test('single Form submits only its collected param without copying another form or awaiting identity', () => {
  const awaiting = awaitingWithInteractive({
    kind: 'form',
    timeout: null,
    agentKey: 'owner',
    view: { source: 'builtin', key: 'ask_user_form', renderer: 'html' },
    form: { title: 'Form', data: { days: 1 } }
  });
  const business = { days: 2, chatId: 'business-chat', agentKey: 'business-owner' };
  assert.deepEqual(buildAwaitingSubmitPayload(awaiting, { kind: 'form', decision: 'approve', data: business }), {
    runId: 'run-1',
    awaitingId: 'form-1',
    param: { decision: 'approve', data: business }
  });
  assert.deepEqual(buildAwaitingSubmitPayload(awaiting, { kind: 'form', decision: 'reject' }).param, {
    decision: 'reject'
  });
  assert.deepEqual(buildAwaitingSubmitPayload(awaiting, { kind: 'form', decision: 'dismiss' }).param, {
    decision: 'dismiss'
  });
});
