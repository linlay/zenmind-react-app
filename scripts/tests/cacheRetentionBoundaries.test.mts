import { createMessageAttachmentsFromReferences } from '../../src/features/chatPersistence/chatAttachmentModels.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

test('source deletion retains cached rows and marks the conversation read-only', () => {
  const repository = readSource('src/features/chatPersistence/chatRepository.ts');
  const service = readSource('src/features/chatRealtime/chatSyncService.ts');
  const screen = readSource('src/features/chatPersistence/ChatDetailScreen.tsx');

  const markerStart = repository.indexOf('export async function markConversationSourceDeleted');
  const markerEnd = repository.indexOf('export async function clearChatLocalCache', markerStart);
  const marker = repository.slice(markerStart, markerEnd);
  assert.match(marker, /set\(\{ sourceDeleted: 1/u);
  assert.doesNotMatch(marker, /\.delete\(/u);
  assert.match(service, /code: 'SOURCE_DELETED'/u);
  assert.match(service, /markConversationSourceDeleted\(conversationId\)/u);
  assert.match(screen, /summary\.sourceDeleted/u);
});

test('authenticated image previews release native temporary files when their last consumer leaves', () => {
  const nativeImage = readSource('src/core/api/services/authenticatedResourceImage.native.ts');
  const resourceHook = readSource('src/features/chatPersistence/components/resource/useAuthenticatedResourceSource.ts');
  const attachmentStrip = readSource('src/features/chatPersistence/components/ChatAttachmentStrip.tsx');

  assert.match(nativeImage, /resolvedConsumers/u);
  assert.match(nativeImage, /releaseAuthenticatedResourceImageSource/u);
  assert.match(nativeImage, /destination\.delete\(\)/u);
  assert.match(resourceHook, /releaseAuthenticatedResourceImageSource/u);
  assert.match(attachmentStrip, /releaseAuthenticatedResourceImageSource/u);
});

test('remote attachment projection persists metadata but never a local binary path', () => {
  const projected = createMessageAttachmentsFromReferences({
    conversationId: 'chat',
    messageId: 'message',
    createdAt: 1,
    references: [
      {
        type: 'file',
        id: 'file',
        name: 'report.pdf',
        url: '/api/resource/report.pdf',
        localUri: '/private/report.pdf'
      },
      { type: 'site', id: 'website:a', name: 'Site', url: 'https://example.com', meta: { kind: 'website' } }
    ]
  });
  assert.equal(projected.length, 2);
  assert.ok(projected.every((item) => item.localUri === '' && item.previewUri === null));
  assert.equal(projected[0].resourceUrl, '/api/resource/report.pdf');
  assert.equal(projected[1].resourceUrl, null);
  assert.equal(projected[1].references[0].url, 'https://example.com');
});

test('cache management contains no automatic TTL or LRU deletion path', () => {
  const actions = readSource('src/app/settings/settingsActions.ts');
  const repository = readSource('src/features/chatPersistence/chatRepository.ts');

  assert.doesNotMatch(actions, /setInterval|timeToLive|ttl|lru/iu);
  assert.match(repository, /clearChatConversationForScope/u);
  assert.match(repository, /clearChatLocalCacheForScope/u);
});
