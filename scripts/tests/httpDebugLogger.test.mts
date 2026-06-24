import assert from 'node:assert/strict';
import test from 'node:test';

import { httpDebugRecorder, logHttpRequest } from '../../src/core/debug/httpDebugLogger.ts';

type DevGlobal = typeof globalThis & {
  __DEV__?: boolean;
};

function withCapturedWarnings(run: () => void): unknown[][] {
  const devGlobal = globalThis as DevGlobal;
  const previousDev = devGlobal.__DEV__;
  const previousWarn = console.warn;
  const calls: unknown[][] = [];

  devGlobal.__DEV__ = true;
  console.warn = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    run();
  } finally {
    console.warn = previousWarn;
    if (previousDev === undefined) {
      delete devGlobal.__DEV__;
    } else {
      devGlobal.__DEV__ = previousDev;
    }
  }

  return calls;
}

test('http debug logger summarizes form-data upload fields without file contents', () => {
  const formDataBody = {
    _parts: [
      ['requestId', 'upload_1'],
      ['chatId', 'chat_1'],
      ['file', { name: 'brief.pdf', type: 'application/pdf', bytes: async () => new Uint8Array([1, 2, 3]) }]
    ]
  };

  let records: ReturnType<typeof httpDebugRecorder.getSnapshot>['records'] = [];
  const calls = withCapturedWarnings(() => {
    httpDebugRecorder.setEnabled(true);
    httpDebugRecorder.clear();
    logHttpRequest({
      url: 'https://api.example.test/ap/api/upload?access_token=secret',
      method: 'POST',
      body: formDataBody
    });
    records = httpDebugRecorder.getSnapshot().records;
    httpDebugRecorder.clear();
  });

  assert.equal(calls.length, 1);
  const [record] = records;
  const [, method, url, meta] = calls[0];
  assert.equal(method, 'POST');
  assert.equal(url, 'https://api.example.test/ap/api/upload?access_token=%5Bredacted%5D');
  assert.equal(record?.direction, 'request');
  assert.equal(record?.method, 'POST');
  assert.equal(record?.url, 'https://api.example.test/ap/api/upload?access_token=%5Bredacted%5D');

  const body = (meta as { body?: { type?: string; fields?: unknown[] } }).body;
  assert.equal(body?.type, 'FormData');
  assert.deepEqual(body?.fields, [
    { field: 'requestId', value: 'upload_1' },
    { field: 'chatId', value: 'chat_1' },
    { field: 'file', file: { content: '[omitted]', name: 'brief.pdf', type: 'application/pdf' } }
  ]);

  const serializedMeta = JSON.stringify(meta);
  assert.match(record?.json || '', /"type": "FormData"/u);
  assert.equal(serializedMeta.includes('bytes'), false);
  assert.equal(serializedMeta.includes('Uint8Array'), false);
});
