import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';
import * as protocol from '../../src/core/api/services/documentPreviewProtocol.ts';

import { resolveAuthenticatedResourcePreviewKind } from '../../src/features/chatPersistence/authenticatedResourcePreview.ts';
import {
  parseConversationMarkdownInternalLink,
  resolveConversationMarkdownLinkPreview
} from '../../src/features/chatPersistence/markdownLinks/conversationMarkdownLinks.ts';

const base = 'https://ap.test';
const result = {
  previewId: 'p',
  sourceRevision: 'sha256:x',
  openMode: 'iframe',
  url: 'https://preview.test/share/bearer-ticket',
  expiresAt: Date.now() + 60000
};
function service(config: any, getConfig = () => config) {
  const url = new URL('../../src/core/api/services/documentPreview.ts', import.meta.url);
  const code = transformSync(readFileSync(url, 'utf8'), {
    filename: url.pathname,
    configFile: false,
    babelrc: false,
    presets: ['@babel/preset-typescript'],
    plugins: ['@babel/plugin-transform-modules-commonjs']
  })!.code!;
  const selection = { kind: 'cloud' };
  const logs: any[] = [];
  const deps: any = {
    '../../config/appEnvironment': { getDefaultSourceConfig: getConfig },
    '../../auth/cloudAuth': {
      getCloudAuthSnapshot: () => ({
        status: 'available',
        scopeId: 'cs_test',
        generation: JSON.stringify(getConfig())
      }),
      reportCloudFailure() {},
      getCloudAccessTokenForRequest: () => 'source-secret'
    },
    '../../auth/activeDesktop': { getSelectedSource: () => selection },
    './chatDirectoryApi': { classifyCloudFailure: () => 'network_error' },
    '../../debug/httpDebugLogger': Object.fromEntries(
      ['logHttpRequest', 'logHttpResponse', 'logHttpError'].map((key) => [key, (v: unknown) => logs.push(v)])
    ),
    './documentPreviewProtocol.ts': protocol
  };
  const module = { exports: {} as any },
    require = createRequire(import.meta.url);
  new Function('require', 'module', 'exports', code)(
    (key: string) => deps[key] ?? require(key),
    module,
    module.exports
  );
  return { prepare: module.exports.prepareAuthenticatedDocumentPreview, logs };
}
const config = { sourceId: 'configured', apiBaseUrl: base, accessToken: 'source-secret' };
const input = () => ({
  sourceKind: 'default',
  sourceId: JSON.stringify([config.sourceId, 'cs_test']),
  resourceUrl: '/api/resource?file=chat%2Fartifacts%2Freport.docx',
  name: 'report.docx',
  signal: new AbortController().signal
});
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ code: status === 200 ? 0 : status, data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });

test('Office sources preserve resource owner and Unicode/legacy percent, decode URI segments once, reject external and traversal, and honor API base prefix', () => {
  const source = protocol.resolveDocumentPreviewSource(
    '/api/resource?file=' + encodeURIComponent('owner/artifacts/%E6%8A%A5%E5%91%8A%20%23100%25.docx'),
    base
  );
  assert.deepEqual(source, { kind: 'chat-resource', chatId: 'owner', relativePath: 'artifacts/报告 #100%.docx' });
  assert.deepEqual(
    protocol.resolveDocumentPreviewSource('/api/file?agentKey=a&path=%2Fworkspace%2Fr.xlsx', base + '/ap'),
    { kind: 'workspace-file', agentKey: 'a', path: '/workspace/r.xlsx' }
  );
  assert.equal(resolveAuthenticatedResourcePreviewKind({ name: 'report.docx', mimeType: 'text/plain' }), 'unsupported');
  const workspace = parseConversationMarkdownInternalLink('@workspace/report.docx');
  assert.ok(workspace);
  assert.equal(workspace.kind, 'workspace');
  const preview = resolveConversationMarkdownLinkPreview(workspace, 'current-agent');
  assert.equal(preview.previewKind, 'unsupported');
  assert.match(preview.resourceUrl, /agentKey=current-agent/);
  assert.equal(parseConversationMarkdownInternalLink('@workspace/../report.docx')?.kind, 'invalid');
  assert.equal(protocol.isOnlineOfficeFile('unknown.doc'), false);
  assert.equal(protocol.isOnlineOfficeFile('REPORT.DOCX'), true);
  for (const file of [
    'chat/../secret.docx',
    'chat/%252e%252e/secret.docx',
    'chat//x.docx',
    'chat/%2fsecret.docx',
    'chat\\x.docx'
  ])
    assert.equal(
      protocol.resolveDocumentPreviewSource('/api/resource?file=' + encodeURIComponent(file), base),
      null,
      file
    );
  for (const url of [
    'https://other.test/api/resource?file=chat/a.docx',
    '//evil.test/a.docx',
    'data:text/plain,x',
    '/api/download?file=chat/a.docx'
  ])
    assert.equal(protocol.resolveDocumentPreviewSource(url, base), null);
  assert.equal(
    protocol.resolveDocumentPreviewSource('/api/resource?file=chat/a.docx', 'https://user:secret@ap.test'),
    null
  );
  for (const bad of [
    { ...result, expiresAt: 1 },
    { ...result, url: 'javascript:alert(1)' },
    { ...result, url: 'https://u:p@preview.test/a' },
    { ...result, previewId: '' },
    { ...result, openMode: 'unknown' }
  ])
    assert.throws(() => protocol.validateDocumentPreviewResult(bad), protocol.DocumentPreviewError);
});

test('production service uses the bound source HTTP credential, checks capability before upload, records no preview ticket, and never requests a paired/foreign source', async () => {
  const original = globalThis.fetch,
    calls: any[] = [],
    { prepare, logs } = service(config);
  globalThis.fetch = async (url, options) => {
    calls.push([url, options]);
    return response(
      calls.length === 1
        ? { enabled: true, supportedExtensions: ['docx'], maxFileBytes: 50 << 20, openMode: 'iframe' }
        : result
    );
  };
  try {
    assert.deepEqual(await prepare(input()), result);
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], base + '/api/document/preview/capabilities');
    assert.equal(calls[1][1].headers.Authorization, 'Bearer source-secret');
    assert.deepEqual(JSON.parse(calls[1][1].body).source, {
      kind: 'chat-resource',
      chatId: 'chat',
      relativePath: 'artifacts/report.docx'
    });
    assert.equal(calls[1][1].redirect, 'error');
    assert.doesNotMatch(JSON.stringify(logs), /source-secret|bearer-ticket/);
    calls.length = 0;
    await assert.rejects(prepare({ ...input(), sourceKind: 'paired' }), { code: 'unavailable' });
    await assert.rejects(prepare({ ...input(), sourceId: 'old' }), { code: 'unavailable' });
    await assert.rejects(prepare({ ...input(), resourceUrl: 'https://evil.test/api/resource?file=chat/a.docx' }), {
      code: 'invalid'
    });
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('disabled, oversized, offline, source change and cancellation cannot return a usable preview; no automatic repeated preparation', async () => {
  const original = globalThis.fetch;
  let calls = 0,
    current = config;
  const { prepare } = service(config, () => current);
  try {
    globalThis.fetch = async () => {
      calls++;
      return response({ enabled: false });
    };
    await assert.rejects(prepare(input()), { code: 'disabled' });
    assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return calls === 1
        ? response({ enabled: true, supportedExtensions: ['docx'], maxFileBytes: 1 })
        : response({ code: 'preview_file_too_large' }, 413);
    };
    await assert.rejects(prepare(input()), { code: 'too_large' });
    assert.equal(calls, 2);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(prepare(input()), { code: 'failed' });
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      current = { ...config, accessToken: 'new' };
      return response({ enabled: true, supportedExtensions: ['docx'], maxFileBytes: 1 });
    };
    await assert.rejects(prepare(input()), { code: 'unavailable' });
    assert.equal(calls, 1);
    current = config;
    const controller = new AbortController();
    controller.abort();
    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return response({});
    };
    await assert.rejects(prepare({ ...input(), signal: controller.signal }), { code: 'unavailable' });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
