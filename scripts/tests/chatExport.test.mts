import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import * as protocol from '../../src/core/api/services/chatExportProtocol.ts';

const origin = 'https://assets.test';
const marker = '__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__';
const template = `<meta name="conversation-export-profile" content="conversation-snapshot-json-v2" />
<meta name="conversation-export-asset-set" content="${'a'.repeat(64)}" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src __CONVERSATION_EXPORT_ASSET_ORIGIN__" />
<meta name="conversation-export-local-brand" content="__CONVERSATION_EXPORT_LOCAL_BRAND_ID__" />
<script id="conversation-snapshot" type="application/json">${marker}</script>`;
const at = 1_791_446_000_000;
const snapshot = (text = 'Answer') => ({
  version: 1,
  title: '完整对话',
  locale: 'zh-CN',
  createdAt: at,
  capturedAt: at + 1000,
  turns: [
    {
      runId: 'r',
      queryAt: at,
      startedAt: at,
      outcome: 'completed',
      nodes: [
        { id: 'q', runId: 'r', at, kind: 'message', role: 'user', text: 'Question' },
        { id: 'a', runId: 'r', at, kind: 'message', role: 'assistant', text }
      ]
    }
  ],
  attachments: [
    {
      id: 'a'.repeat(24),
      name: '报告.pdf',
      mimeType: 'application/pdf',
      size: 0,
      sha256: 'b'.repeat(64),
      sourceRef: 'artifacts/r/%E6%8A%A5%E5%91%8A.pdf'
    }
  ]
});
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const build = (value: unknown, shell = template) =>
  new TextDecoder().decode(protocol.buildChatExportHtml(encode(value), shell, origin, 'zenmind'));

test('V1 HTML preserves every server turn and canonical attachment; script escapes and replacement syntax remain literal', () => {
  const text = '</script><script>alert(1)</script> $& ' + '__CONVERSATION_EXPORT_ASSET_ORIGIN__';
  const value = snapshot(text);
  const html = build(value);
  assert.ok(!html.includes('<script>alert'));
  const embedded = /<script id="conversation-snapshot" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1];
  assert.deepEqual(JSON.parse(embedded), value);
  assert.equal(html.match(/https:\/\/assets.test/g)?.length, 1);
});

test('snapshot validation rejects unsupported version, second timestamps, malformed nodes, credential fields and ticket refs', () => {
  for (const change of [
    { version: 2 },
    { createdAt: 1791446000 },
    { capturedAt: at - 1 },
    { title: '' },
    { accessToken: 'never-export' },
    { attachments: [{ ...snapshot().attachments[0], sourceRef: 'https://evil.test/?token=x' }] },
    { attachments: [{ ...snapshot().attachments[0], sourceRef: 'artifacts/%2e%2e/file.pdf' }] },
    { attachments: [{ ...snapshot().attachments[0], sourceRef: 'artifacts/r/%2fsecret.pdf' }] },
    { attachments: [{ ...snapshot().attachments[0], sha256: 'bad' }] },
    { turns: [{ ...snapshot().turns[0], nodes: [{ ...snapshot().turns[0].nodes[0], runId: 'other' }] }] }
  ])
    assert.throws(() => build({ ...snapshot(), ...change }), protocol.ChatExportError);
});

test('long history is not restricted to 2000 total nodes; each server turn retains the contract limit', () => {
  const value = snapshot();
  value.turns = Array.from({ length: 1001 }, (_, index) => ({
    ...value.turns[0],
    runId: `r${index}`,
    nodes: value.turns[0].nodes.map((node) => ({ ...node, id: `${node.id}${index}`, runId: `r${index}` }))
  }));
  assert.equal(JSON.parse(/type="application\/json">([\s\S]*?)<\/script>/.exec(build(value))![1]).turns.length, 1001);
});

test('template profile, asset set, marker count and byte limits are checked before HTML delivery', () => {
  for (const shell of [
    template.replace('json-v2', 'json-v3'),
    template + marker,
    template.replace('a'.repeat(64), 'unknown'),
    template + '__CONVERSATION_EXPORT_UNRESOLVED__'
  ])
    assert.throws(() => build(snapshot(), shell), protocol.ChatExportError);
  assert.throws(() => build(snapshot(), template + 'x'.repeat(protocol.CHAT_EXPORT_TEMPLATE_MAX_BYTES)), {
    code: 'too_large'
  });
  assert.throws(() => build(snapshot('<'.repeat(4 * 1024 * 1024))), { code: 'too_large' });
});

test('asset origin and filenames reject authority/path injection without altering format or Unicode title', () => {
  assert.equal(protocol.resolveChatExportAssetOrigin(''), '');
  assert.equal(protocol.resolveChatExportAssetOrigin(origin + '/'), origin);
  for (const url of ['http://assets.test', origin + '/path', 'https://u:p@assets.test', origin + '?token=x'])
    assert.throws(() => protocol.resolveChatExportAssetOrigin(url), protocol.ChatExportError);
  assert.equal(
    protocol.chatExportFileName("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.snapshot.json", 'chat', 'html'),
    '报告.html'
  );
  assert.ok(!protocol.chatExportFileName('attachment; filename="../../report.md"', 'chat', 'markdown').includes('/'));
});

function loadService(getConfig: () => unknown) {
  const url = new URL('../../src/core/api/services/chatExport.ts', import.meta.url);
  const code = transformSync(readFileSync(url, 'utf8'), {
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: ['@babel/preset-typescript'],
    plugins: ['@babel/plugin-transform-modules-commonjs']
  })!.code!;
  const selection = { kind: 'cloud' };
  const logs: unknown[] = [];
  const deps: Record<string, unknown> = {
    'expo/fetch': { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) },
    '../../config/appEnvironment': { getDefaultSourceConfig: getConfig },
    '../../auth/cloudAuth': {
      getCloudAuthSnapshot: () => ({
        status: 'available',
        scopeId: 'cs_test',
        generation: JSON.stringify(getConfig())
      }),
      reportCloudFailure() {},
      getCloudAccessTokenForRequest: () => 'private-source-token'
    },
    '../../auth/activeDesktop': { getSelectedSource: () => selection },
    './chatDirectoryApi': { classifyCloudFailure: () => 'network_error' },
    '../../../shared/generated/brand': { INSTALLED_BRAND_ID: 'zenmind' },
    '../../debug/httpDebugLogger': Object.fromEntries(
      ['logHttpError', 'logHttpRequest', 'logHttpResponse'].map((k) => [k, (v: unknown) => logs.push(v)])
    ),
    './chatExportProtocol.ts': protocol
  };
  const module = {
    exports: {} as { fetchChatExport: (input: ReturnType<typeof input>) => Promise<protocol.ChatExportFile> }
  };
  const require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  return { read: module.exports.fetchChatExport, logs };
}
const config = { sourceId: 'default', apiBaseUrl: 'https://ap.test/prefix', accessToken: 'private-source-token' };
const input = (format: protocol.ChatExportFormat = 'markdown', signal = new AbortController().signal) => ({
  sourceKind: 'default',
  sourceId: JSON.stringify([config.sourceId, 'cs_test']),
  chatId: 'remote-chat',
  format,
  signal
});
const response = (text: string, mime: string, headers: Record<string, string> = {}) =>
  new Response(text, { headers: { 'content-type': mime, ...headers } });

test('production export reads complete server history once, preserves source/base, logs no content and never attaches or marks read', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; options?: RequestInit }[] = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return response('Old unloaded history\nNew answer', 'text/markdown', {
        'content-disposition': 'attachment; filename="Full.md"'
      });
    };
    const service = loadService(() => config),
      file = await service.read(input());
    assert.equal(new TextDecoder().decode(file.bytes), 'Old unloaded history\nNew answer');
    assert.equal(file.fileName, 'Full.md');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://ap.test/prefix/api/chat/export?chatId=remote-chat&format=markdown');
    assert.equal((calls[0].options?.headers as Record<string, string>).Authorization, 'Bearer private-source-token');
    assert.equal(calls[0].options?.redirect, 'error');
    assert.ok(!JSON.stringify(service.logs).includes('private-source-token'));
    assert.ok(!JSON.stringify(service.logs).includes('Old unloaded history'));
  } finally {
    globalThis.fetch = original;
  }
});

test('paired and mismatched sources, missing HTML deployment config and pre-cancelled requests produce no network traffic', async () => {
  const original = globalThis.fetch,
    oldOrigin = process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN;
  let calls = 0;
  try {
    delete process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN;
    globalThis.fetch = async () => {
      calls++;
      throw new Error('must not run');
    };
    const service = loadService(() => config);
    await assert.rejects(service.read({ ...input(), sourceKind: 'paired' }), { code: 'unavailable' });
    await assert.rejects(service.read({ ...input(), sourceId: 'other' }), { code: 'unavailable' });
    await assert.rejects(service.read(input('html')), { code: 'unavailable' });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(service.read(input('markdown', controller.signal)), { code: 'cancelled' });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    if (oldOrigin === undefined) delete process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN;
    else process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN = oldOrigin;
  }
});

test('HTML asset fetch is credential-free, with version validated and no export token or public URL embedded', async () => {
  const original = globalThis.fetch,
    oldOrigin = process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN;
  const calls: RequestInit[] = [];
  try {
    process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN = origin;
    globalThis.fetch = async (url, options) => {
      calls.push(options!);
      return String(url).startsWith(origin)
        ? response(template, 'text/html')
        : response(JSON.stringify(snapshot()), 'application/json');
    };
    const file = await loadService(() => config).read(input('html'));
    assert.equal(file.mimeType, 'text/html');
    assert.equal(calls.length, 2);
    assert.equal((calls[1].headers as Record<string, string>).Authorization, undefined);
    assert.equal(calls[1].credentials, 'omit');
    assert.ok(!new TextDecoder().decode(file.bytes).includes('private-source-token'));
  } finally {
    globalThis.fetch = original;
    if (oldOrigin === undefined) delete process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN;
    else process.env.EXPO_PUBLIC_CONVERSATION_EXPORT_ASSET_ORIGIN = oldOrigin;
  }
});

test('stream overflow without content-length cancels consumption immediately; wrong MIME, HTTP errors and config changes fail closed', async () => {
  const original = globalThis.fetch;
  try {
    let cancelled = false;
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(protocol.CHAT_EXPORT_MAX_BYTES + 1));
          },
          cancel() {
            cancelled = true;
          }
        }),
        { headers: { 'content-type': 'text/markdown' } }
      );
    await assert.rejects(loadService(() => config).read(input()), { code: 'too_large' });
    assert.ok(cancelled);
    globalThis.fetch = async () => response('<html>app shell</html>', 'text/html');
    await assert.rejects(loadService(() => config).read(input()), { code: 'invalid' });
    globalThis.fetch = async () => new Response('Not found', { status: 404 });
    await assert.rejects(loadService(() => config).read(input()), { code: 'failed' });
    let current = config;
    globalThis.fetch = async () => {
      current = { ...config, accessToken: 'changed' };
      return response('text', 'text/markdown');
    };
    await assert.rejects(loadService(() => current).read(input()), { code: 'unavailable' });
  } finally {
    globalThis.fetch = original;
  }
});
