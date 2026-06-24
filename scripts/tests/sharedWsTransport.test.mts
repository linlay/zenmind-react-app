import assert from 'node:assert/strict';
import test from 'node:test';

import { createSharedWsTransport } from '../../src/core/ws/sharedWsTransport.ts';

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

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function completeLatestRequest<T>(socket: FakeSocket, data: T) {
  const frame = JSON.parse(socket.sent[socket.sent.length - 1]) as { id: string };
  socket.receive({
    frame: 'response',
    id: frame.id,
    code: 0,
    data
  });
}

test('shared transport keeps one socket when only token or namespace changes', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const transport = createSharedWsTransport();

  try {
    const first = transport.request<{ ok: true }>({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws?token=stale-token',
        tokenMode: 'query',
        accessToken: 'token-1',
        namespace: 'ap'
      },
      type: '/api/chats'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 1);
    assert.equal(new URL(sockets[0].url).searchParams.get('token'), 'token-1');
    assert.equal(JSON.parse(sockets[0].sent[0]).ns, 'ap');
    completeLatestRequest(sockets[0], { ok: true });
    assert.deepEqual(await first, { ok: true });

    const second = transport.request<{ ok: true }>({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws?token=another-stale-token',
        tokenMode: 'query',
        accessToken: 'token-2',
        namespace: 'd'
      },
      type: 'snapshot.get'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 1);
    assert.equal(JSON.parse(sockets[0].sent[1]).ns, 'd');
    completeLatestRequest(sockets[0], { ok: true });
    assert.deepEqual(await second, { ok: true });
  } finally {
    transport.stop();
    restoreWebSocket();
  }
});

test('shared transport startStream preserves stream done metadata', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const transport = createSharedWsTransport();
  const events: unknown[] = [];
  let doneReason = '';
  let doneLastSeq = 0;

  try {
    transport.startStream<Record<string, unknown>>({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws',
        tokenMode: 'query',
        accessToken: 'token-1',
        namespace: 'ap'
      },
      type: '/api/query',
      onEvent: (event) => events.push(event),
      onDone: (reason, lastSeq) => {
        doneReason = reason;
        doneLastSeq = lastSeq;
      }
    });

    await flushMicrotasks();
    const sentFrame = JSON.parse(sockets[0].sent[0]) as { id: string };
    sockets[0].receive({
      frame: 'stream',
      id: sentFrame.id,
      event: {
        type: 'content.delta',
        seq: 41,
        payload: { delta: 'hi' }
      }
    });
    sockets[0].receive({
      frame: 'stream',
      id: sentFrame.id,
      reason: 'complete',
      lastSeq: 42
    });

    assert.deepEqual(events, [{ delta: 'hi', type: 'content.delta', seq: 41 }]);
    assert.equal(doneReason, 'complete');
    assert.equal(doneLastSeq, 42);
  } finally {
    transport.stop();
    restoreWebSocket();
  }
});

test('shared transport disconnects the old socket once when endpoint changes', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const transport = createSharedWsTransport();

  try {
    const first = transport.request({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws',
        tokenMode: 'query',
        accessToken: 'token-1',
        namespace: 'ap'
      },
      type: '/api/chats'
    });
    await flushMicrotasks();
    completeLatestRequest(sockets[0], { ok: true });
    await first;

    const second = transport.request({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7083/ws',
        tokenMode: 'query',
        accessToken: 'token-2',
        namespace: 'ap'
      },
      type: '/api/chats'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 2);
    assert.equal(sockets[0].closeCount, 1);
    completeLatestRequest(sockets[1], { ok: true });
    await second;
  } finally {
    transport.stop();
    restoreWebSocket();
  }
});

test('shared transport push subscribers are additive and removable', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const transport = createSharedWsTransport();
  const eventsA: unknown[] = [];
  const eventsB: unknown[] = [];

  try {
    const unsubscribeA = transport.subscribePush((frame) => eventsA.push(frame));
    transport.subscribePush((frame) => eventsB.push(frame));
    await transport.connect({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-1',
      namespace: 'ap'
    });

    sockets[0].receive({ frame: 'push', type: 'chat.updated', payload: { chatId: 'chat-1' } });
    unsubscribeA();
    sockets[0].receive({ frame: 'push', type: 'chat.updated', payload: { chatId: 'chat-2' } });

    assert.equal(eventsA.length, 1);
    assert.equal(eventsB.length, 2);
  } finally {
    transport.stop();
    restoreWebSocket();
  }
});

test('desktop kanban request does not replace chat push listener', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const transport = createSharedWsTransport();
  const pushEvents: unknown[] = [];

  try {
    transport.subscribePush((frame) => pushEvents.push(frame));
    const chatRequest = transport.request({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws',
        tokenMode: 'query',
        accessToken: 'chat-token',
        namespace: 'ap'
      },
      type: '/api/chats'
    });
    await flushMicrotasks();
    completeLatestRequest(sockets[0], { ok: true });
    await chatRequest;

    const kanbanRequest = transport.request({
      transport: {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws',
        tokenMode: 'query',
        accessToken: 'kanban-token',
        namespace: 'ap'
      },
      namespace: 'd',
      type: 'snapshot.get'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 1);
    assert.equal(JSON.parse(sockets[0].sent[1]).ns, 'd');
    completeLatestRequest(sockets[0], { ok: true });
    await kanbanRequest;

    sockets[0].receive({ frame: 'push', type: 'chat.updated', payload: { chatId: 'chat-1' } });
    assert.equal(pushEvents.length, 1);
  } finally {
    transport.stop();
    restoreWebSocket();
  }
});

test('shared transport stop clears socket state and keeps subscribers reusable', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets);
  const transport = createSharedWsTransport();
  const pushEvents: unknown[] = [];
  const statuses: string[] = [];

  try {
    transport.subscribePush((frame) => pushEvents.push(frame));
    transport.subscribeStatus((status) => statuses.push(status));
    await transport.connect({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-1',
      namespace: 'ap'
    });
    transport.stop();
    assert.equal(sockets[0].closeCount, 1);
    assert.equal(transport.getStatus(), 'idle');

    await transport.connect({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-2',
      namespace: 'ap'
    });
    sockets[1].receive({ frame: 'push', type: 'chat.updated', payload: { chatId: 'chat-1' } });
    assert.equal(pushEvents.length, 1);
    assert.equal(statuses.includes('idle'), true);
  } finally {
    transport.stop();
    restoreWebSocket();
  }
});
