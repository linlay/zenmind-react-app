import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAwaitingSubmitPayload,
  mergeSubmittedParamsIntoAwaitingForms,
  normalizeAwaitingSubmitParams,
} from '../../src/features/chatPersistence/components/awaiting/awaitingSubmitState.ts';
import type { ChatTimelineAwaitingInteractive, ChatTimelineAwaitingState } from '../../src/features/chatTimeline/index.ts';

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
    interactive,
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
        allowFreeText: true,
      },
    ],
  });

  assert.deepEqual(
    buildAwaitingSubmitPayload(approvalAwaiting, {
      kind: 'approval',
      decisions: { 'cmd-1': 'approve_rule_run' },
      reasons: { 'cmd-1': 'trusted command' },
    }),
    {
      runId: 'run-1',
      awaitingId: 'approval-1',
      params: [{ id: 'cmd-1', decision: 'approve_rule_run', reason: 'trusted command' }],
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
      options: [{ label: '拒绝', decision: 'reject' }],
    },
  });

  assert.deepEqual(
    buildAwaitingSubmitPayload(planAwaiting, {
      kind: 'plan',
      decision: 'reject',
      reason: 'narrow the scope',
    }),
    {
      runId: 'run-1',
      awaitingId: 'plan-1',
      params: [
        {
          id: 'confirm',
          planningId: 'planning-1',
          decision: 'reject',
          reason: 'narrow the scope',
        },
      ],
    }
  );
});

test('awaiting submit builder aggregates html form params with existing forms', () => {
  const formAwaiting = awaitingWithInteractive({
    kind: 'form',
    viewportType: 'html',
    viewportKey: 'leave_form',
    timeout: 120000,
    agentKey: 'form.demo',
    forms: [
      {
        id: 'leave',
        action: 'submit_leave_request',
        form: { days: 1 },
      },
      {
        id: 'handoff',
        action: 'submit_handoff',
        form: { owner: 'alice' },
      },
    ],
  });

  assert.deepEqual(
    buildAwaitingSubmitPayload(formAwaiting, {
      kind: 'form',
      decision: 'approve',
      rawParams: [{ id: 'leave', decision: 'approve', form: { days: 2 } }],
    }),
    {
      runId: 'run-1',
      awaitingId: 'form-1',
      params: [
        { id: 'leave', decision: 'approve', form: { days: 2 } },
        { id: 'handoff', decision: 'approve', form: { owner: 'alice' } },
      ],
    }
  );

  assert.deepEqual(normalizeAwaitingSubmitParams([{ id: 'leave', decision: 'approve' }], 'form'), []);
});

test('awaiting submit state merges collected html form params into local forms', () => {
  const forms = [
    {
      id: 'leave',
      action: 'submit_leave_request',
      form: { days: 1 },
    },
    {
      id: 'travel',
      action: 'submit_travel_request',
      form: { city: 'Shanghai' },
    },
  ];

  const merged = mergeSubmittedParamsIntoAwaitingForms(forms, [
    { id: 'travel', decision: 'approve', form: { city: 'Beijing', days: 2 } },
  ]);

  assert.notEqual(merged, forms);
  assert.deepEqual(merged, [
    {
      id: 'leave',
      action: 'submit_leave_request',
      form: { days: 1 },
    },
    {
      id: 'travel',
      action: 'submit_travel_request',
      form: { city: 'Beijing', days: 2 },
    },
  ]);

  assert.equal(mergeSubmittedParamsIntoAwaitingForms(forms, [{ id: 'travel', decision: 'reject' }]), forms);
});

test('awaiting submit builder rejects merged html form state without reusing collected approve decisions', () => {
  const formAwaiting = awaitingWithInteractive({
    kind: 'form',
    viewportType: 'html',
    viewportKey: 'travel_form',
    timeout: 120000,
    agentKey: 'form.demo',
    forms: mergeSubmittedParamsIntoAwaitingForms(
      [
        {
          id: 'travel',
          action: 'submit_travel_request',
          form: { city: 'Shanghai' },
        },
      ],
      [{ id: 'travel', decision: 'approve', form: { city: 'Beijing', days: 2 } }]
    ),
  });

  assert.deepEqual(
    buildAwaitingSubmitPayload(formAwaiting, {
      kind: 'form',
      decision: 'reject',
    }),
    {
      runId: 'run-1',
      awaitingId: 'form-1',
      params: [
        {
          id: 'travel',
          decision: 'reject',
          form: { city: 'Beijing', days: 2 },
        },
      ],
    }
  );
});
