import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseConversationMarkdownInternalLink as parse,
  resolveConversationMarkdownLinkPreview as resolve
} from '../../src/features/chatPersistence/markdownLinks/conversationMarkdownLinks.ts';
import { buildWorkspaceFileResourceUrl } from '../../src/core/api/services/workspaceResource.ts';
test('Chat aliases and relative links use the current Chat data plane', () => {
  for (const href of ['@chat/reports/a%20b.md', 'reports/a%20b.md']) {
    const link = parse(href)!;
    assert.equal(link.kind, 'resource');
    assert.equal(resolve(link, 'root', 'chat').resourceUrl, '/api/resource?file=chat%2Freports%2Fa+b.md');
  }
  assert.equal(parse('https://example.com/file.md'), null);
});
test('Workspace aliases use the current owner and the file content endpoint', () => {
  const link = parse('@workspace/src/a.ts')!;
  assert.equal(link.kind, 'workspace');
  assert.equal(
    resolve(link, 'root', 'chat').resourceUrl,
    '/api/file?agentKey=root&path=%40workspace%2Fsrc%2Fa.ts&response=content'
  );
  assert.equal(resolve(link, '', 'chat').errorCode, 'missing_agent_scope');
  const absolute = parse('/Users/demo/a.ts:12')!;
  assert.equal(resolve(absolute, 'root', 'chat').line, 12);
});
test('aliases reject malformed encoding, traversal and backslashes', () => {
  for (const href of ['@chat/../secret.txt', '@workspace/../secret.txt', '@workspace/%ZZ', '@chat/a\\b.md'])
    assert.equal(parse(href)?.kind, 'invalid');
  assert.equal(buildWorkspaceFileResourceUrl({ agentKey: '', filePath: 'src/a.ts' }), null);
});
