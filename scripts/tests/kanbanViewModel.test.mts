import assert from 'node:assert/strict';
import test from 'node:test';

import type { KanbanSnapshot } from '../../src/core/api/services/kanbanApi.ts';
import { normalizeKanbanChangeResult } from '../../src/core/api/services/kanbanProtocol.ts';
import {
  applyKanbanChangeResult,
  createBoardTaskIndex,
  deriveAgentOptions,
  deriveBoardSummary,
  deriveBoardTasks,
  nextIssuePosition
} from '../../src/features/agentTaskBoard/kanbanViewModel.ts';
import type { BoardViewText } from '../../src/features/agentTaskBoard/kanbanViewModel.ts';

const snapshot: KanbanSnapshot = {
  ok: true,
  boardId: 'default',
  projectId: 'default',
  revision: 3,
  issues: [
    {
      id: 'review-1',
      boardId: 'default',
      projectId: 'default',
      title: 'Review task',
      description: 'Needs human review',
      status: 'in_review',
      priority: 'high',
      assigneeAgentKey: 'reviewer',
      reviewRequired: true,
      position: 20,
      createdAt: '2026-06-12T01:00:00Z',
      updatedAt: '2026-06-12T02:00:00Z',
      revision: 2
    },
    {
      id: 'backlog-1',
      boardId: 'default',
      projectId: 'default',
      title: 'Backlog task',
      description: '',
      status: 'backlog',
      priority: 'medium',
      assigneeAgentKey: null,
      position: 10,
      createdAt: '2026-06-12T01:00:00Z',
      updatedAt: '2026-06-12T01:00:00Z',
      revision: 1
    }
  ],
  agents: [
    {
      id: 'agent-1',
      agentKey: 'reviewer',
      name: 'Reviewer',
      description: 'Reviews work',
      enabled: true
    }
  ],
  desktopStatus: {
    online: true,
    sessions: [
      {
        sessionId: 'desktop-1',
        deviceName: 'Mac',
        agents: [{ agentKey: 'planner', displayName: 'Planner', role: 'Planning' }]
      }
    ]
  }
};

const text: BoardViewText = {
  noDescription: '暂无描述',
  completedDue: '已完成',
  unscheduledDue: '未排期',
  untitledTask: '未命名任务',
  unassignedAgent: '未分配',
  actionRunFailed: '查看失败原因并重新分配',
  actionRunCancelled: '确认是否重新启动',
  actionAssignAgent: '选择执行 Agent',
  actionWaitingRun: '等待执行窗口或启动任务',
  actionTrackRun: '跟踪执行记录',
  actionReview: '通过复核或退回',
  actionArchive: '归档',
  blockerRunFailed: '执行失败',
  blockerRunCancelled: '执行已取消',
  blockerReviewRequired: '需人工确认',
  catalogAgentFallback: '可执行看板任务',
  desktopOnline: 'Desktop 在线',
  existingAssignee: '来自现有任务负责人'
};

test('kanban view model maps and summarizes backend issues', () => {
  const tasks = deriveBoardTasks(snapshot, text);
  assert.equal(tasks[0]?.id, 'backlog-1');
  assert.equal(tasks[0]?.stage, 'intake');
  assert.equal(tasks[0]?.outcome, '暂无描述');
  assert.equal(tasks[1]?.stage, 'review');
  assert.equal(tasks[1]?.blocker, '需人工确认');

  const focus = deriveBoardSummary(tasks, 'focus');
  assert.equal(focus.intakeCount, 1);
  assert.equal(focus.reviewCount, 1);
  assert.equal(focus.blockedCount, 1);
  assert.deepEqual(
    focus.visibleTasks.map((task) => task.id),
    ['backlog-1', 'review-1']
  );
});

test('kanban view model derives agents and merges change results', () => {
  const tasks = deriveBoardTasks(snapshot, text);
  const agents = deriveAgentOptions(snapshot, tasks, text);
  assert.deepEqual(
    agents.map((agent) => agent.key),
    ['planner', 'reviewer']
  );

  assert.equal(nextIssuePosition(tasks, 'completed'), 1024);

  const updated = applyKanbanChangeResult(snapshot, {
    ok: true,
    boardId: 'default',
    projectId: 'default',
    revision: 4,
    issues: [snapshot.issues[1]]
  });
  assert.equal(updated?.revision, 4);
  assert.deepEqual(
    updated?.issues.map((issue) => issue.id),
    ['backlog-1']
  );
});

test('kanban change result applies updates, inserts, deletes, and list replacements', () => {
  const updatedBacklog = {
    ...snapshot.issues[1],
    title: 'Updated backlog task',
    revision: 4
  };
  const insertedIssue = {
    ...snapshot.issues[1],
    id: 'new-1',
    title: 'Inserted task',
    position: 30,
    revision: 1
  };

  const afterUpdate = applyKanbanChangeResult(snapshot, {
    ok: true,
    boardId: 'default',
    projectId: 'default',
    revision: 4,
    issue: updatedBacklog
  });
  assert.equal(afterUpdate?.issues.find((issue) => issue.id === 'backlog-1')?.title, 'Updated backlog task');

  const afterInsert = applyKanbanChangeResult(afterUpdate, {
    ok: true,
    boardId: 'default',
    projectId: 'default',
    revision: 5,
    issue: insertedIssue
  });
  assert.deepEqual(
    afterInsert?.issues.map((issue) => issue.id),
    ['review-1', 'backlog-1', 'new-1']
  );

  const afterDelete = applyKanbanChangeResult(afterInsert, {
    ok: true,
    boardId: 'default',
    projectId: 'default',
    revision: 6,
    deletedIssueId: 'review-1'
  });
  assert.deepEqual(
    afterDelete?.issues.map((issue) => issue.id),
    ['backlog-1', 'new-1']
  );

  const afterReplace = applyKanbanChangeResult(afterDelete, {
    ok: true,
    boardId: 'default',
    projectId: 'default',
    revision: 7,
    issues: [insertedIssue]
  });
  assert.deepEqual(
    afterReplace?.issues.map((issue) => issue.id),
    ['new-1']
  );
});

test('kanban change normalization does not synthesize empty issue lists for deltas', () => {
  const updatedBacklog = {
    ...snapshot.issues[1],
    title: 'Updated by Desktop delta',
    revision: 8
  };
  const normalizedUpdate = normalizeKanbanChangeResult(
    {
      ok: true,
      boardId: 'default',
      projectId: 'default',
      revision: 8,
      issue: updatedBacklog
    },
    'default'
  );

  assert.equal('issues' in normalizedUpdate, false);
  const afterUpdate = applyKanbanChangeResult(snapshot, normalizedUpdate);
  assert.deepEqual(
    afterUpdate?.issues.map((issue) => issue.id),
    ['review-1', 'backlog-1']
  );
  assert.equal(afterUpdate?.issues.find((issue) => issue.id === 'backlog-1')?.title, 'Updated by Desktop delta');

  const normalizedDelete = normalizeKanbanChangeResult(
    {
      ok: true,
      boardId: 'default',
      projectId: 'default',
      revision: 9,
      deletedIssueId: 'review-1'
    },
    'default'
  );

  assert.equal('issues' in normalizedDelete, false);
  const afterDelete = applyKanbanChangeResult(afterUpdate, normalizedDelete);
  assert.deepEqual(
    afterDelete?.issues.map((issue) => issue.id),
    ['backlog-1']
  );
});

test('kanban view model requires an exact task id match', () => {
  const tasks = deriveBoardTasks(snapshot, text);
  const taskById = createBoardTaskIndex(tasks);

  assert.equal(taskById.get('backlog-1')?.id, 'backlog-1');
  assert.equal(taskById.get('missing'), undefined);
});
