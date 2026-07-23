import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeApiResourcePath } from '../../src/core/api/resourceUrl.ts';
import { createAuthenticatedResourceImageCacheFileName } from '../../src/core/api/services/authenticatedResourceModel.ts';
import { normalizeChatAttachmentReferences } from '../../src/features/chatPersistence/chatAttachmentModels.ts';

test('normalizes chat resource paths without the app API prefix', () => {
  assert.equal(
    normalizeApiResourcePath('/api/resource?file=conversation-1%2Fphoto.jpg'),
    '/api/resource?file=conversation-1%2Fphoto.jpg'
  );
  assert.equal(
    normalizeApiResourcePath('api/resource?file=conversation-1%2Fphoto.jpg'),
    '/api/resource?file=conversation-1%2Fphoto.jpg'
  );
  assert.equal(
    normalizeApiResourcePath('/ap/api/resource?file=conversation-1%2Fphoto.jpg'),
    '/api/resource?file=conversation-1%2Fphoto.jpg'
  );
});

test('keeps absolute and local resource URLs unchanged', () => {
  assert.equal(
    normalizeApiResourcePath('https://agent-webclient.zenmind.cc/api/resource?file=a.jpg'),
    'https://agent-webclient.zenmind.cc/api/resource?file=a.jpg'
  );
  assert.equal(
    normalizeApiResourcePath('//agent-webclient.zenmind.cc/api/resource?file=a.jpg'),
    '//agent-webclient.zenmind.cc/api/resource?file=a.jpg'
  );
  assert.equal(normalizeApiResourcePath('file:///tmp/a.jpg'), 'file:///tmp/a.jpg');
  assert.equal(normalizeApiResourcePath('content://media/external/images/1'), 'content://media/external/images/1');
  assert.equal(normalizeApiResourcePath('data:image/png;base64,abc'), 'data:image/png;base64,abc');
});

test('normalizes chat attachment reference URLs during projection', () => {
  const [reference] = normalizeChatAttachmentReferences([
    {
      id: 'r01',
      type: 'file',
      name: 'Screenshot.jpg',
      mimeType: 'image/jpeg',
      url: '/api/resource?file=conversation-1%2FScreenshot.jpg'
    }
  ]);

  assert.equal(reference.url, '/api/resource?file=conversation-1%2FScreenshot.jpg');
});

test('derives one safe image cache file from the canonical resource identity', () => {
  const resourceUrl = '/api/resource?file=conversation-1%2FScreenshot.jpg';
  const first = createAuthenticatedResourceImageCacheFileName(resourceUrl, 'Screenshot.jpg');
  const second = createAuthenticatedResourceImageCacheFileName(resourceUrl, 'Screenshot.jpg');

  assert.equal(first, second);
  assert.doesNotMatch(first, /[\\/?%*:|"<>]/u);
  assert.notEqual(
    first,
    createAuthenticatedResourceImageCacheFileName(
      '/api/resource?file=conversation-2%2FScreenshot.jpg',
      'Screenshot.jpg'
    )
  );
});
