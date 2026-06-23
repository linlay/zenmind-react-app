import assert from 'node:assert/strict';
import test from 'node:test';

import { WsClient } from '../../src/core/ws/wsClient.ts';
import { sharedWsTransport } from '../../src/core/ws/sharedWsTransport.ts';
import {
  requestChatTransport,
  startChatPushTransport,
  stopChatPushTransport,
  streamChatQuery
} from '../../src/features/chatRealtime/chatWsTransport.ts';

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

function createSocketFactory(instances: FakeSocket[]) {
  return (url: string, protocols?: string | string[]) => {
    const socket = new FakeSocket(url, protocols);
    instances.push(socket);
    queueMicrotask(() => socket.open());
    return socket;
  };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function completeRequest<T>(client: WsClient, sockets: readonly FakeSocket[], type: string): Promise<T> {
  const pending = client.request<T>({ type });
  await flushMicrotasks();
  const socket = sockets[0];
  assert.ok(socket);
  assert.equal(socket.sent.length, 1);
  const frame = JSON.parse(socket.sent[0]) as { id: string };
  socket.receive({
    frame: 'response',
    id: frame.id,
    code: 0,
    data: { ok: true }
  });
  return pending;
}

test('agent-platform transport keeps /ap/ws and sends no namespace', async () => {
  const sockets: FakeSocket[] = [];
  const client = new WsClient({
    transport: {
      kind: 'agent-platform',
      backendUrl: 'https://api.example.test/root',
      accessToken: 'ap-token'
    },
    createWebSocket: createSocketFactory(sockets)
  });

  const result = await completeRequest<{ ok: boolean }>(client, sockets, '/api/chats');
  assert.deepEqual(result, { ok: true });
  assert.equal(sockets[0].url, 'wss://api.example.test/ap/ws?token=ap-token');
  const sentFrame = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
  assert.equal(sentFrame.type, '/api/chats');
  assert.equal('ns' in sentFrame, false);
  client.disconnect();
});

test('desktop query transport uses exact ws url and sends namespace', async () => {
  const sockets: FakeSocket[] = [];
  const client = new WsClient({
    transport: {
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/custom?source=mobile',
      tokenMode: 'query',
      accessToken: 'desktop-token',
      namespace: 'ap'
    },
    createWebSocket: createSocketFactory(sockets)
  });

  await completeRequest(client, sockets, '/api/chats');
  const url = new URL(sockets[0].url);
  assert.equal(`${url.protocol}//${url.host}${url.pathname}`, 'ws://127.0.0.1:7082/custom');
  assert.equal(url.searchParams.get('source'), 'mobile');
  assert.equal(url.searchParams.get('token'), 'desktop-token');
  const sentFrame = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
  assert.equal(sentFrame.ns, 'ap');
  client.disconnect();
});

test('desktop subprotocol transport keeps token out of url', async () => {
  const sockets: FakeSocket[] = [];
  const client = new WsClient({
    transport: {
      kind: 'desktop-ws',
      wsUrl: 'wss://desktop.example.test/ws?token=old',
      tokenMode: 'subprotocol',
      accessToken: 'desktop-token',
      namespace: 'd'
    },
    createWebSocket: createSocketFactory(sockets)
  });

  await completeRequest(client, sockets, 'session.hello');
  const url = new URL(sockets[0].url);
  assert.equal(url.searchParams.has('token'), false);
  assert.deepEqual(sockets[0].protocols, ['bearer.desktop-token']);
  const sentFrame = JSON.parse(sockets[0].sent[0]) as Record<string, unknown>;
  assert.equal(sentFrame.ns, 'd');
  client.disconnect();
});

test('shared chat transport keeps the socket when only token or namespace changes', async () => {
  const originalWebSocket = globalThis.WebSocket;
  const sockets: FakeSocket[] = [];
  (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = class {
    private readonly socket: FakeSocket;

    constructor(url: string, protocols?: string | string[]) {
      this.socket = new FakeSocket(url, protocols);
      sockets.push(this.socket);
      queueMicrotask(() => this.socket.open());
      return this.socket;
    }
  };

  try {
    stopChatPushTransport();
    const first = requestChatTransport<{ ok: boolean }>({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-1',
      namespace: 'ap',
      type: '/api/chats'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 1);
    let sentFrame = JSON.parse(sockets[0].sent[0]) as { id: string; ns?: string };
    assert.equal(sentFrame.ns, 'ap');
    sockets[0].receive({ frame: 'response', id: sentFrame.id, code: 0, data: { ok: true } });
    assert.deepEqual(await first, { ok: true });

    const second = requestChatTransport<{ ok: boolean }>({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-2',
      namespace: 'd',
      type: 'session.hello'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 1);
    assert.equal(sockets[0].sent.length, 2);
    sentFrame = JSON.parse(sockets[0].sent[1]) as { id: string; ns?: string };
    assert.equal(sentFrame.ns, 'd');
    sockets[0].receive({ frame: 'response', id: sentFrame.id, code: 0, data: { ok: true } });
    assert.deepEqual(await second, { ok: true });
  } finally {
    stopChatPushTransport();
    sharedWsTransport.stop();
    (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = originalWebSocket;
  }
});

test('chat push stop only removes chat listeners without closing shared socket', async () => {
  const originalWebSocket = globalThis.WebSocket;
  const sockets: FakeSocket[] = [];
  const pushEvents: unknown[] = [];
  (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = class {
    private readonly socket: FakeSocket;

    constructor(url: string, protocols?: string | string[]) {
      this.socket = new FakeSocket(url, protocols);
      sockets.push(this.socket);
      queueMicrotask(() => this.socket.open());
      return this.socket;
    }
  };

  try {
    await startChatPushTransport(
      {
        kind: 'desktop-ws',
        wsUrl: 'ws://127.0.0.1:7082/ws',
        tokenMode: 'query',
        accessToken: 'token-1',
        namespace: 'ap'
      },
      {
        onPush: (event) => pushEvents.push(event)
      }
    );

    sockets[0].receive({ frame: 'push', type: 'chat.updated', payload: { chatId: 'chat-1' } });
    assert.equal(pushEvents.length, 1);

    stopChatPushTransport();
    assert.equal(sockets[0].closeCount, 0);
    sockets[0].receive({ frame: 'push', type: 'chat.updated', payload: { chatId: 'chat-2' } });
    assert.equal(pushEvents.length, 1);

    const request = requestChatTransport<{ ok: boolean }>({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-2',
      namespace: 'd',
      type: 'snapshot.get'
    });
    await flushMicrotasks();
    assert.equal(sockets.length, 1);
    const sentFrame = JSON.parse(sockets[0].sent[0]) as { id: string; ns?: string };
    assert.equal(sentFrame.ns, 'd');
    sockets[0].receive({ frame: 'response', id: sentFrame.id, code: 0, data: { ok: true } });
    assert.deepEqual(await request, { ok: true });
  } finally {
    stopChatPushTransport();
    sharedWsTransport.stop();
    (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = originalWebSocket;
  }
});

test('chat stream forwards done reason and last sequence', async () => {
  const originalWebSocket = globalThis.WebSocket;
  const sockets: FakeSocket[] = [];
  const events: unknown[] = [];
  let doneReason = '';
  let doneLastSeq = 0;
  (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = class {
    private readonly socket: FakeSocket;

    constructor(url: string, protocols?: string | string[]) {
      this.socket = new FakeSocket(url, protocols);
      sockets.push(this.socket);
      queueMicrotask(() => this.socket.open());
      return this.socket;
    }
  };

  try {
    const handle = await streamChatQuery({
      kind: 'desktop-ws',
      wsUrl: 'ws://127.0.0.1:7082/ws',
      tokenMode: 'query',
      accessToken: 'token-1',
      namespace: 'ap',
      payload: {
        requestId: 'req-1',
        message: 'hello',
        agentKey: 'agent-a'
      },
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
        seq: 7,
        payload: { delta: 'hi' }
      }
    });
    sockets[0].receive({
      frame: 'stream',
      id: sentFrame.id,
      reason: 'complete',
      lastSeq: 8
    });

    assert.deepEqual(events, [{ delta: 'hi', type: 'content.delta', seq: 7 }]);
    assert.equal(doneReason, 'complete');
    assert.equal(doneLastSeq, 8);
    handle.abort();
  } finally {
    stopChatPushTransport();
    sharedWsTransport.stop();
    (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = originalWebSocket;
  }
});
