import assert from 'node:assert/strict';
import test from 'node:test';

import { subscribeKanbanInvalidation } from '../../src/core/api/services/kanbanInvalidation.ts';
import { sharedWsTransport } from '../../src/core/ws/sharedWsTransport.ts';

type MessageEvent = { data?: unknown };
type CloseEvent = { code?: number; reason?: string };

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  closeCount = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols?: string | string[]
  ) {}

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  receive(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close(code?: number, reason?: string) {
    this.closeCount += 1;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function installFakeWebSocket(sockets: FakeSocket[]) {
  const originalWebSocket = globalThis.WebSocket;
  (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = class {
    private readonly socket: FakeSocket;

    constructor(url: string, protocols?: string | string[]) {
      this.socket = new FakeSocket(url, protocols);
      sockets.push(this.socket);
      queueMicrotask(() => this.socket.open());
      return this.socket;
    }
  };

  return () => {
    (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = originalWebSocket;
  };
}

test('kanban invalidation listens on existing desktop pushes and filters noise', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const invalidations: string[] = [];
  let unsubscribe = () => undefined;

  try {
    unsubscribe = subscribeKanbanInvalidation(() => invalidations.push('refresh'), 'project-1');
    assert.equal(sockets.length, 0);

    await sharedWsTransport.connect({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-1',
      namespace: 'd'
    });

    sockets[0].receive({ frame: 'push', ns: 'ap', type: 'snapshot.updated', data: { projectId: 'project-1' } });
    sockets[0].receive({ frame: 'push', ns: 'd', type: 'chat.updated', data: { projectId: 'project-1' } });
    sockets[0].receive({ frame: 'push', ns: 'd', type: 'issue.updated', data: { projectId: 'project-2' } });
    sockets[0].receive({ frame: 'push', type: 'snapshot.updated', data: { projectId: 'project-1' } });
    sockets[0].receive({ frame: 'push', ns: 'd', type: 'assistant.run.finished', payload: { projectId: 'project-1' } });

    assert.deepEqual(invalidations, ['refresh', 'refresh']);

    unsubscribe();
    sockets[0].receive({ frame: 'push', ns: 'd', type: 'issue.deleted', data: { projectId: 'project-1' } });
    assert.deepEqual(invalidations, ['refresh', 'refresh']);
  } finally {
    unsubscribe();
    sharedWsTransport.stop();
    restoreWebSocket();
  }
});
