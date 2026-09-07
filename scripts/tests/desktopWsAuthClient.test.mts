import assert from 'node:assert/strict';
import test from 'node:test';

import { DesktopWsAuthClient } from '../../src/core/auth/desktopWsAuthClient.ts';

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

function installFakeWebSocket(sockets: FakeSocket[], autoOpen: boolean) {
  const originalWebSocket = globalThis.WebSocket;
  (globalThis as typeof globalThis & { WebSocket: unknown }).WebSocket = class {
    private readonly socket: FakeSocket;

    constructor(url: string, protocols?: string | string[]) {
      this.socket = new FakeSocket(url, protocols);
      sockets.push(this.socket);
      if (autoOpen) {
        queueMicrotask(() => this.socket.open());
      }
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

const TRANSPORT = {
  wsUrl: 'ws://127.0.0.1:7082/ws',
  tokenMode: 'query' as const,
  accessToken: 'pairing-token',
  accessExpireAtMs: Date.now() + 60_000
};

test('desktop auth client reuses WsClient framing and closes its short-lived socket', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets, true);
  const client = new DesktopWsAuthClient(TRANSPORT);

  try {
    await client.connect();
    const pending = client.request<{ deviceId: string }>('session.hello');
    await flushMicrotasks();

    assert.equal(sockets.length, 1);
    assert.equal(new URL(sockets[0].url).searchParams.get('token'), 'pairing-token');
    const requestFrame = JSON.parse(sockets[0].sent[0]) as { id: string; ns: string; type: string };
    assert.equal(requestFrame.ns, 'd');
    assert.equal(requestFrame.type, 'session.hello');

    sockets[0].receive({
      frame: 'response',
      id: requestFrame.id,
      code: 0,
      data: { deviceId: 'desktop-1' }
    });
    assert.deepEqual(await pending, { deviceId: 'desktop-1' });
  } finally {
    client.close();
    assert.equal(sockets[0].closeCount, 1);
    restoreWebSocket();
  }
});

test('desktop auth connection can be cancelled before the socket opens', async () => {
  const sockets: FakeSocket[] = [];
  const restoreWebSocket = installFakeWebSocket(sockets, false);
  const client = new DesktopWsAuthClient(TRANSPORT);
  const controller = new AbortController();

  try {
    const pending = client.connect(controller.signal);
    controller.abort();
    await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === 'AbortError');
  } finally {
    client.close();
    assert.equal(sockets[0].closeCount, 1);
    restoreWebSocket();
  }
});
