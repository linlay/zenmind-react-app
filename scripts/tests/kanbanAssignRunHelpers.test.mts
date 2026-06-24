import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../../src/core/api/apiError.ts';
import type { KanbanIssue, KanbanSnapshot } from '../../src/core/api/services/kanbanApi.ts';
import {
  KanbanIssueRunUpdateError,
  isKanbanIssueRunUpdateError,
  startKanbanIssueRunProtocol,
  type KanbanDesktopRequester
} from '../../src/core/api/services/kanbanProtocol.ts';
import { buildKanbanAssistantPrompt } from '../../src/features/agentTaskBoard/kanbanAssistantPrompt.ts';
import { buildKanbanChatDetailParams } from '../../src/features/agentTaskBoard/kanbanChatRoute.ts';
import {
  nextAppliedSnapshotRevision,
  nextIssueIdSet,
  reconcileStartedRunIssueIds,
  shouldApplySnapshotRevision
} from '../../src/features/agentTaskBoard/kanbanRunGuards.ts';

function readPayloadCode(error: unknown): unknown {
  return error instanceof ApiError && error.payload && typeof error.payload === 'object'
    ? (error.payload as { code?: unknown }).code
    : undefined;
}

const issue: KanbanIssue = {
  id: 'issue-1',
  boardId: 'default',
  projectId: 'default',
  title: 'Ship the mobile flow',
  description: 'Wire assignment to the assistant run.',
  status: 'in_progress',
  priority: 'high',
  severity: 'medium',
  assigneeAgentKey: 'planner',
  chatId: 'chat-1',
  runId: 'run-1',
  runState: 'running',
  position: 1,
  createdAt: '2026-06-23T08:00:00Z',
  updatedAt: '2026-06-23T09:30:00Z',
  revision: 7
};

const assignableIssue: KanbanIssue = {
  ...issue,
  status: 'todo',
  assigneeAgentKey: null,
  chatId: null,
  runId: null,
  runState: null,
  attachmentChatId: 'attachment-chat-1',
  attachments: [{ id: 'attachment-1', name: 'brief.md', mimeType: 'text/markdown', text: 'Brief' }]
};

test('kanban assistant prompt keeps task context in feature code', () => {
  const prompt = buildKanbanAssistantPrompt(issue);

  assert.match(prompt, /Title: Ship the mobile flow/u);
  assert.match(prompt, /Description: Wire assignment to the assistant run\./u);
  assert.match(prompt, /Priority: high/u);
  assert.match(prompt, /Severity: medium/u);
  assert.match(prompt, /Expected result:/u);
});

test('kanban chat route builds ChatDetail params only for started tasks', () => {
  const params = buildKanbanChatDetailParams(issue, 'Planner');

  assert.equal(params?.conversationId, 'chat-1');
  assert.equal(params?.conversationSubtitle, 'Planner');
  assert.equal(params?.conversationTarget?.agentKey, 'planner');
  assert.equal(params?.conversationTarget?.subtitle, 'Ship the mobile flow');
  assert.deepEqual(params?.historyScope, { agentKey: 'planner', teamId: null });
  assert.equal(params?.initialConversation?.lastMessageStatus, 'sent');
  assert.equal(params?.initialConversation?.lastMessageAt, Date.parse('2026-06-23T09:30:00Z'));

  assert.equal(buildKanbanChatDetailParams({ ...issue, chatId: '' }, 'Planner'), null);
});

test('kanban start run protocol starts assistant then updates the issue', async () => {
  const calls: { type: string; payload: unknown }[] = [];
  const request: KanbanDesktopRequester = async (type, payload) => {
    calls.push({ type, payload });
    if (type === 'assistant.startRun') {
      return { ok: true, chatId: 'chat-new', runId: 'run-new', message: 'Started' };
    }
    if (type === 'issue.update') {
      return {
        ok: true,
        boardId: 'default',
        projectId: 'project-1',
        revision: 8,
        issue: {
          ...assignableIssue,
          status: 'in_progress',
          assigneeAgentKey: 'planner',
          chatId: 'chat-new',
          runId: 'run-new',
          runState: 'running',
          revision: 8
        }
      };
    }
    throw new Error(`Unexpected Kanban request: ${type}`);
  };

  const result = await startKanbanIssueRunProtocol(request, {
    issue: assignableIssue,
    agentKey: ' planner ',
    message: ' Start this task ',
    projectId: 'project-1'
  });

  assert.equal(result.revision, 8);
  assert.equal(result.issue?.runId, 'run-new');
  assert.equal('issues' in result, false);
  assert.deepEqual(calls, [
    {
      type: 'assistant.startRun',
      payload: {
        chatId: 'attachment-chat-1',
        attachments: assignableIssue.attachments,
        agentKey: 'planner',
        message: 'Start this task',
        source: 'copilot'
      }
    },
    {
      type: 'issue.update',
      payload: {
        id: 'issue-1',
        input: {
          status: 'in_progress',
          assigneeAgentKey: 'planner',
          chatId: 'chat-new',
          runId: 'run-new',
          runState: 'running',
          baseIssueRevision: 7,
          projectId: 'project-1'
        }
      }
    }
  ]);
});

test('kanban start run protocol validates before sending requests', async () => {
  const calls: string[] = [];
  const request: KanbanDesktopRequester = async (type) => {
    calls.push(type);
    return {};
  };

  await assert.rejects(
    startKanbanIssueRunProtocol(request, {
      issue: assignableIssue,
      agentKey: ' ',
      message: 'Start',
      projectId: 'project-1'
    }),
    (error) => error instanceof ApiError && error.status === 400 && readPayloadCode(error) === 'agent_required'
  );
  await assert.rejects(
    startKanbanIssueRunProtocol(request, {
      issue: assignableIssue,
      agentKey: 'planner',
      message: ' ',
      projectId: 'project-1'
    }),
    (error) => error instanceof ApiError && error.status === 400 && readPayloadCode(error) === 'message_required'
  );
  assert.deepEqual(calls, []);
});

test('kanban start run protocol reports update failure without retrying run start', async () => {
  const calls: string[] = [];
  const request: KanbanDesktopRequester = async (type) => {
    calls.push(type);
    if (type === 'assistant.startRun') {
      return { ok: true, chatId: 'chat-new', runId: 'run-new', message: 'Started' };
    }
    throw new ApiError('Revision conflict', 409, { code: 'revision_conflict' });
  };

  await assert.rejects(
    startKanbanIssueRunProtocol(request, {
      issue: assignableIssue,
      agentKey: 'planner',
      message: 'Start this task',
      projectId: 'project-1'
    }),
    (error) => {
      assert.equal(error instanceof KanbanIssueRunUpdateError, true);
      assert.equal(isKanbanIssueRunUpdateError(error), true);
      assert.equal((error as KanbanIssueRunUpdateError).issueId, 'issue-1');
      assert.equal((error as KanbanIssueRunUpdateError).agentKey, 'planner');
      assert.equal((error as KanbanIssueRunUpdateError).chatId, 'chat-new');
      assert.equal((error as KanbanIssueRunUpdateError).runId, 'run-new');
      assert.equal((error as KanbanIssueRunUpdateError).status, 409);
      assert.match((error as KanbanIssueRunUpdateError).message, /task card did not sync/u);
      return true;
    }
  );
  assert.deepEqual(calls, ['assistant.startRun', 'issue.update']);
});

test('kanban start run protocol does not update issue when assistant start fails', async () => {
  const calls: string[] = [];
  const request: KanbanDesktopRequester = async (type) => {
    calls.push(type);
    throw new ApiError('Assistant start failed', 503, { code: 'assistant_start_failed' });
  };

  await assert.rejects(
    startKanbanIssueRunProtocol(request, {
      issue: assignableIssue,
      agentKey: 'planner',
      message: 'Start this task',
      projectId: 'project-1'
    }),
    (error) => error instanceof ApiError && error.status === 503 && readPayloadCode(error) === 'assistant_start_failed'
  );
  assert.deepEqual(calls, ['assistant.startRun']);
});

test('kanban run guards keep partial starts locked until snapshot has a run record', () => {
  const guardedIssueIds = new Set(['issue-1']);
  const unchangedSnapshot: KanbanSnapshot = {
    ok: true,
    boardId: 'default',
    projectId: 'project-1',
    revision: 8,
    issues: [assignableIssue]
  };
  const reconciledSnapshot: KanbanSnapshot = {
    ...unchangedSnapshot,
    revision: 9,
    issues: [{ ...assignableIssue, chatId: 'chat-new', runId: 'run-new' }]
  };

  assert.equal(nextIssueIdSet(guardedIssueIds, 'issue-1', true), null);
  assert.deepEqual([...(nextIssueIdSet(guardedIssueIds, 'issue-2', true) ?? [])], ['issue-1', 'issue-2']);
  assert.equal(reconcileStartedRunIssueIds(guardedIssueIds, unchangedSnapshot), null);
  assert.deepEqual([...(reconcileStartedRunIssueIds(guardedIssueIds, reconciledSnapshot) ?? [])], []);
});

test('kanban snapshot revision guard ignores stale nonzero refreshes', () => {
  assert.equal(shouldApplySnapshotRevision(12, 11), true);
  assert.equal(shouldApplySnapshotRevision(11, 11), true);
  assert.equal(shouldApplySnapshotRevision(10, 11), false);
  assert.equal(shouldApplySnapshotRevision(0, 11), true);
  assert.equal(nextAppliedSnapshotRevision(11, 12), 12);
  assert.equal(nextAppliedSnapshotRevision(11, 0), 11);
});
