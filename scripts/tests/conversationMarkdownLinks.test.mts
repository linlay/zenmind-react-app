import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkspaceFileResourceUrl } from '../../src/core/api/services/workspaceResource.ts';
import {
  resolveAuthenticatedResourcePreviewKind,
  splitAuthenticatedResourceTextAtLine
} from '../../src/features/chatPersistence/authenticatedResourcePreview.ts';
import {
  parseConversationMarkdownInternalLink,
  resolveConversationMarkdownLinkPreview
} from '../../src/features/chatPersistence/markdownLinks/conversationMarkdownLinks.ts';

test('resource links are classified without intercepting ordinary external links', () => {
  const link = parseConversationMarkdownInternalLink('/api/resource?file=chat_1%2Freports%2Fsummary.md&download=true');
  assert.deepEqual(link, {
    kind: 'resource',
    href: '/api/resource?file=chat_1%2Freports%2Fsummary.md&download=true',
    filePath: 'chat_1/reports/summary.md',
    fileName: 'summary.md'
  });
  assert.deepEqual(resolveConversationMarkdownLinkPreview(link!, ''), {
    key: 'resource:chat_1/reports/summary.md',
    name: 'summary.md',
    resourceUrl: '/api/resource?file=chat_1%2Freports%2Fsummary.md&download=true',
    previewKind: 'text',
    sourcePath: 'chat_1/reports/summary.md'
  });
  assert.equal(parseConversationMarkdownInternalLink('https://example.com/api/resource?file=a.md'), null);
  assert.equal(parseConversationMarkdownInternalLink('mailto:team@example.com'), null);
});

test('workspace paths preserve source line and build an authenticated API target from current agent scope', () => {
  const link = parseConversationMarkdownInternalLink('/Users/demo/project/src/a.ts:12:4');
  assert.deepEqual(link, {
    kind: 'workspace',
    href: '/Users/demo/project/src/a.ts:12:4',
    filePath: '/Users/demo/project/src/a.ts',
    fileName: 'a.ts',
    line: 12
  });
  assert.deepEqual(resolveConversationMarkdownLinkPreview(link!, 'coder-agent'), {
    key: 'workspace:/Users/demo/project/src/a.ts:12',
    name: 'a.ts',
    resourceUrl: '/api/workspace/file?agentKey=coder-agent&path=%2FUsers%2Fdemo%2Fproject%2Fsrc%2Fa.ts&line=12',
    previewKind: 'text',
    sourcePath: '/Users/demo/project/src/a.ts',
    line: 12
  });
});

test('explicit workspace endpoints ignore embedded agent keys and require the current conversation scope', () => {
  const link = parseConversationMarkdownInternalLink(
    '/api/workspace/file?agentKey=untrusted-agent&path=src%2Fsafe.ts&line=7'
  );
  assert.equal(link?.kind, 'workspace');
  assert.equal(
    resolveConversationMarkdownLinkPreview(link!, 'current-agent').resourceUrl,
    '/api/workspace/file?agentKey=current-agent&path=src%2Fsafe.ts&line=7'
  );
  assert.deepEqual(resolveConversationMarkdownLinkPreview(link!, ''), {
    key: 'workspace:src/safe.ts:7',
    name: 'safe.ts',
    resourceUrl: '',
    previewKind: 'text',
    sourcePath: 'src/safe.ts',
    line: 7,
    errorCode: 'missing_agent_scope'
  });
});

test('unsafe internal paths fail closed while unrelated relative links stay untouched', () => {
  assert.deepEqual(parseConversationMarkdownInternalLink('/api/resource?file=..%2Fsecret.txt'), {
    kind: 'invalid',
    href: '/api/resource?file=..%2Fsecret.txt',
    target: 'resource'
  });
  assert.deepEqual(parseConversationMarkdownInternalLink('/api/workspace/file?path=src%2F..%2Fsecret.ts'), {
    kind: 'invalid',
    href: '/api/workspace/file?path=src%2F..%2Fsecret.ts',
    target: 'workspace'
  });
  assert.deepEqual(parseConversationMarkdownInternalLink('/api/workspace/file?path=src%2Fa.ts&line=0'), {
    kind: 'invalid',
    href: '/api/workspace/file?path=src%2Fa.ts&line=0',
    target: 'workspace'
  });
  assert.equal(parseConversationMarkdownInternalLink('../outside.ts'), null);
  assert.equal(parseConversationMarkdownInternalLink('guide/getting-started'), null);
  assert.equal(parseConversationMarkdownInternalLink('javascript:alert(1)'), null);
});

test('workspace URL builder validates scope and encodes path and optional line', () => {
  assert.equal(buildWorkspaceFileResourceUrl({ agentKey: '', filePath: 'src/a.ts' }), null);
  assert.equal(buildWorkspaceFileResourceUrl({ agentKey: 'agent', filePath: '' }), null);
  assert.equal(
    buildWorkspaceFileResourceUrl({ agentKey: 'agent a', filePath: 'src/a file.ts', line: 3.9 }),
    '/api/workspace/file?agentKey=agent+a&path=src%2Fa+file.ts&line=3'
  );
});

test('resource preview kind and line split stay bounded to one semantic target line', () => {
  assert.equal(resolveAuthenticatedResourcePreviewKind({ name: 'diagram.png' }), 'image');
  assert.equal(resolveAuthenticatedResourcePreviewKind({ name: 'guide.pdf' }), 'pdf');
  assert.equal(resolveAuthenticatedResourcePreviewKind({ name: 'component.tsx' }), 'text');
  assert.equal(resolveAuthenticatedResourcePreviewKind({ name: 'archive.zip' }), 'unsupported');
  assert.deepEqual(splitAuthenticatedResourceTextAtLine('one\r\ntwo\nthree', 2), {
    before: 'one',
    target: 'two',
    after: 'three'
  });
  assert.equal(splitAuthenticatedResourceTextAtLine('one\ntwo', 3), null);
});
