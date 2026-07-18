import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  resolveChatAttachmentImageUri,
  resolveChatAttachmentPreview
} from '../../src/features/chatPersistence/chatAttachmentPreview.ts';
import type { ChatAttachmentBase } from '../../src/features/chatPersistence/types.ts';

function readProjectFile(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

function createAttachment(overrides: Partial<ChatAttachmentBase> = {}): ChatAttachmentBase {
  return {
    attachmentId: 'attachment-1',
    conversationId: 'conversation-1',
    name: 'notes.md',
    kind: 'file',
    mimeType: 'text/markdown',
    sizeBytes: 128,
    width: null,
    height: null,
    localUri: 'file:///cache/notes.md',
    previewUri: null,
    resourceUrl: '/ap/api/resource?file=notes.md',
    sha256: null,
    status: 'ready',
    errorReason: null,
    references: [],
    createdAt: 1,
    updatedAt: 2,
    ...overrides
  };
}

test('ready attachments resolve one deterministic authenticated preview target', () => {
  assert.deepEqual(resolveChatAttachmentPreview(createAttachment()), {
    kind: 'preview',
    target: {
      key: 'attachment-1:2:/ap/api/resource?file=notes.md',
      name: 'notes.md',
      resourceUrl: '/ap/api/resource?file=notes.md',
      previewKind: 'text'
    }
  });
  assert.equal(
    resolveChatAttachmentPreview(createAttachment({ name: 'photo.png', kind: 'image', mimeType: 'image/png' })).kind,
    'preview'
  );
});

test('uploading, failed, and missing-resource attachments keep distinct feedback states', () => {
  assert.deepEqual(resolveChatAttachmentPreview(createAttachment({ status: 'uploading' })), {
    kind: 'blocked',
    reason: 'uploading'
  });

  const failed = resolveChatAttachmentPreview(
    createAttachment({ status: 'failed', errorReason: 'Upload rejected', resourceUrl: null })
  );
  assert.equal(failed.kind, 'error');
  if (failed.kind === 'error') {
    assert.equal(failed.reason, 'failed');
    assert.equal(failed.detail, 'Upload rejected');
    assert.equal(failed.target.resourceUrl, '');
  }

  const missing = resolveChatAttachmentPreview(createAttachment({ resourceUrl: null }));
  assert.equal(missing.kind, 'error');
  if (missing.kind === 'error') {
    assert.equal(missing.reason, 'missing_resource');
  }
});

test('unsupported attachments retain a downloadable target instead of disappearing', () => {
  const result = resolveChatAttachmentPreview(createAttachment({ name: 'archive.zip', mimeType: 'application/zip' }));
  assert.equal(result.kind, 'preview');
  if (result.kind === 'preview') {
    assert.equal(result.target.previewKind, 'unsupported');
    assert.equal(result.target.resourceUrl, '/ap/api/resource?file=notes.md');
  }
});

test('composer images prefer local previews while persisted messages prefer server resources', () => {
  const attachment = createAttachment({
    kind: 'image',
    localUri: 'file:///cache/full.png',
    previewUri: 'file:///cache/preview.png',
    resourceUrl: '/ap/api/resource?file=photo.png'
  });
  assert.equal(resolveChatAttachmentImageUri(attachment, 'composer'), 'file:///cache/preview.png');
  assert.equal(resolveChatAttachmentImageUri(attachment, 'message'), '/ap/api/resource?file=photo.png');
});

test('conversation detail keeps one preview host while rows only dispatch preview requests', () => {
  const screenSource = readProjectFile('src/features/chatPersistence/ChatDetailScreen.tsx');
  const attachmentSource = readProjectFile(
    'src/features/chatPersistence/components/ChatAttachmentStrip.tsx'
  );
  const artifactSource = readProjectFile('src/features/chatPersistence/components/ArtifactTimelineRow.tsx');
  const markdownLinkSource = readProjectFile(
    'src/features/chatPersistence/markdownLinks/ConversationMarkdownLinkProvider.tsx'
  );

  assert.match(screenSource, /<AuthenticatedResourcePreviewProvider key=\{conversationId\}>/);
  assert.match(attachmentSource, /useConversationPreviewRowActive\(\)/);
  assert.match(attachmentSource, /useAuthenticatedResourcePreview\(\)/);
  assert.doesNotMatch(artifactSource, /AuthenticatedResourcePreviewModal/);
  assert.doesNotMatch(markdownLinkSource, /AuthenticatedResourcePreviewModal/);
});
