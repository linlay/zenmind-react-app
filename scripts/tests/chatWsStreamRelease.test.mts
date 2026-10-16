import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(new URL('../../src/features/chatRealtime/chatWsTransport.ts', import.meta.url));
function fixture() {
  const streams: any[] = [], requests: any[] = [];
  let aborted = 0;
  const source = ts.transpileModule(readFileSync(new URL('../../src/features/chatRealtime/chatWsTransport.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const exports: any = {};
  new Function('require', 'exports', source)((id: string) => id.includes('sharedWsTransport') ? {
    sharedWsTransport: {
      startStream: (options: any) => { streams.push(options); return { abort() { aborted++; } }; },
      request: async (options: any) => { requests.push(options); return {}; }
    }
  } : require(id), exports);
  return { ...exports, streams, requests, aborted: () => aborted };
}

test('mobile query release before acceptance targets its exact consumer once and preserves the socket', async () => {
  const f = fixture();
  const handle = await f.streamChatQuery({ kind: 'desktop-ws', namespace: 'ap',
    payload: { requestId: 'original', chatId: 'chat', agentKey: 'root', message: 'task' }, onEvent() {} });
  handle.abort(); handle.abort();
  assert.equal(f.aborted(), 1);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].type, '/api/detach');
  assert.equal(f.requests[0].payload.streamRequestId, f.streams[0].requestId);
  assert.equal(f.requests[0].payload.agentKey, 'root');
});

test('signal cancellation releases the subscription; terminal streams never detach again', async () => {
  const f = fixture(), controller = new AbortController();
  await f.attachChatRun({ kind: 'desktop-ws', namespace: 'ap', signal: controller.signal,
    payload: { runId: 'run', chatId: 'chat', agentKey: 'root' }, onEvent() {} });
  controller.abort();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].payload.runId, 'run');
  const finished = await f.attachChatRun({ kind: 'desktop-ws', namespace: 'ap',
    payload: { runId: 'run', chatId: 'chat', agentKey: 'root' }, onEvent() {} });
  f.streams[1].onDone('done', 4);
  finished.abort();
  assert.equal(f.requests.length, 1);
});
