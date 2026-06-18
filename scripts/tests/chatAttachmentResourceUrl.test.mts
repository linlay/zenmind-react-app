import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeApiResourcePath } from '../../src/core/api/resourceUrl.ts';
import { normalizeChatAttachmentReferences } from '../../src/features/chatPersistence/chatAttachmentModels.ts';

test('normalizes legacy chat resource paths to the app API prefix', () => {
  assert.equal(
    normalizeApiResourcePath('/api/resource?file=conversation-1%2Fphoto.jpg'),
    '/ap/api/resource?file=conversation-1%2Fphoto.jpg'
  );
  assert.equal(
    normalizeApiResourcePath('api/resource?file=conversation-1%2Fphoto.jpg'),
    '/ap/api/resource?file=conversation-1%2Fphoto.jpg'
  );
  assert.equal(
    normalizeApiResourcePath('/ap/api/resource?file=conversation-1%2Fphoto.jpg'),
    '/ap/api/resource?file=conversation-1%2Fphoto.jpg'
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
      url: '/api/resource?file=conversation-1%2FScreenshot.jpg',
    },
  ]);

  assert.equal(reference.url, '/ap/api/resource?file=conversation-1%2FScreenshot.jpg');
});
