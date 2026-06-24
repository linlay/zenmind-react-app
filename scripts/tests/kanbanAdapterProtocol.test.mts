import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../../src/core/api/apiError.ts';
import {
  createKanbanIssueProtocol,
  createRequiredDesktopKanbanRequester,
  deleteKanbanIssueProtocol,
  getKanbanSnapshotProtocol,
  moveKanbanIssueProtocol,
  updateKanbanIssueProtocol,
  type KanbanDesktopRequester
} from '../../src/core/api/services/kanbanProtocol.ts';
import type { SharedWsRequestOptions } from '../../src/core/ws/sharedWsTransport.ts';
import type { WsTransportConfig, WsTransportNamespace } from '../../src/core/ws/wsTransportConfig.ts';

const desktopTransport: WsTransportConfig = {
  kind: 'desktop-ws',
  wsUrl: 'ws://127.0.0.1:7082/ws',
  tokenMode: 'query',
  accessToken: 'token-1',
  namespace: 'd'
};

function readErrorCode(error: unknown): unknown {
  return error instanceof ApiError && error.payload && typeof error.payload === 'object'
    ? (error.payload as { code?: unknown }).code
    : undefined;
}

test('desktop kanban requester sends snapshot through namespace d', async () => {
  const resolvedNamespaces: WsTransportNamespace[] = [];
  const requests: SharedWsRequestOptions[] = [];
  const controller = new AbortController();
  const requestDesktopKanban = createRequiredDesktopKanbanRequester({
    getActiveProfile: () => ({ transportKind: 'desktop-ws' }),
    resolveTransport: async (namespace) => {
      resolvedNamespaces.push(namespace);
      return desktopTransport;
    },
    request: async <T,>(options: SharedWsRequestOptions) => {
      requests.push(options);
      return {
        ok: true,
        boardId: 'default',
        projectId: 'project-1',
        revision: 9,
        issues: []
      } as T;
    }
  });

  const snapshot = await getKanbanSnapshotProtocol(requestDesktopKanban, ' project-1 ', controller.signal);

  assert.equal(snapshot.projectId, 'project-1');
  assert.deepEqual(resolvedNamespaces, ['d']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].transport, desktopTransport);
  assert.equal(requests[0].namespace, 'd');
  assert.equal(requests[0].type, 'snapshot.get');
  assert.deepEqual(requests[0].payload, { projectId: 'project-1' });
  assert.equal(requests[0].signal, controller.signal);
});

test('desktop kanban change protocols use Desktop issue request names', async () => {
  const calls: { type: string; payload: unknown }[] = [];
  const request: KanbanDesktopRequester = async (type, payload) => {
    calls.push({ type, payload });
    if (type === 'issue.delete') {
      return {
        ok: true,
        boardId: 'default',
        projectId: 'project-1',
        revision: calls.length,
        deletedIssueId: 'issue-1'
      };
    }
    return {
      ok: true,
      boardId: 'default',
      projectId: 'project-1',
      revision: calls.length,
      issue: {
        id: 'issue-1',
        boardId: 'default',
        projectId: 'project-1',
        title: 'Task',
        description: '',
        status: 'backlog',
        priority: 'medium',
        position: 0,
        createdAt: '2026-06-23T08:00:00Z',
        updatedAt: '2026-06-23T08:00:00Z',
        revision: calls.length
      }
    };
  };

  const created = await createKanbanIssueProtocol(request, { title: 'New task' }, 'project-1');
  const updated = await updateKanbanIssueProtocol(
    request,
    'issue-1',
    { status: 'in_progress', baseIssueRevision: 2 },
    'project-1'
  );
  const moved = await moveKanbanIssueProtocol(request, 'issue-1', 'completed', 2048, 3, 'project-1');
  const deleted = await deleteKanbanIssueProtocol(request, 'issue-1', 4, 'project-1');

  assert.deepEqual(
    calls.map((call) => call.type),
    ['issue.create', 'issue.update', 'issue.move', 'issue.delete']
  );
  assert.deepEqual(calls[0].payload, { title: 'New task', projectId: 'project-1' });
  assert.deepEqual(calls[1].payload, {
    id: 'issue-1',
    input: { status: 'in_progress', baseIssueRevision: 2, projectId: 'project-1' }
  });
  assert.deepEqual(calls[2].payload, {
    id: 'issue-1',
    status: 'completed',
    position: 2048,
    baseIssueRevision: 3,
    projectId: 'project-1'
  });
  assert.deepEqual(calls[3].payload, { id: 'issue-1', baseIssueRevision: 4, projectId: 'project-1' });
  assert.equal('issues' in created, false);
  assert.equal('issues' in updated, false);
  assert.equal('issues' in moved, false);
  assert.equal(deleted.deletedIssueId, 'issue-1');
});

test('desktop kanban requester rejects clearly without a Desktop profile', async () => {
  let resolveCalled = false;
  const requestDesktopKanban = createRequiredDesktopKanbanRequester({
    getActiveProfile: () => null,
    resolveTransport: async () => {
      resolveCalled = true;
      return desktopTransport;
    },
    request: async () => {
      throw new Error('request should not run');
    }
  });

  await assert.rejects(
    requestDesktopKanban('snapshot.get'),
    (error) =>
      error instanceof ApiError &&
      error.status === 503 &&
      /Desktop Kanban requires an active Desktop WS profile/u.test(error.message) &&
      readErrorCode(error) === 'desktop_ws_required'
  );
  assert.equal(resolveCalled, false);
});
