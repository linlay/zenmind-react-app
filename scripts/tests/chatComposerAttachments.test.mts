import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import ts from 'typescript';
import * as attachmentModels from '../../src/features/chatPersistence/chatAttachmentModels.ts';
import * as selection from '../../src/features/chatPersistence/chatSelectionReference.ts';
import * as context from '../../src/features/chatPersistence/chatContextReference.ts';
import * as source from '../../src/features/chatPersistence/chatSource.ts';
import { defaultT } from '../../src/shared/i18n/translate.ts';
const require = createRequire(import.meta.url);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function deferred() {
  let resolve!: (value: any) => void, reject!: (error: Error) => void;
  const promise = new Promise<any>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const asset = { uri: 'file:///image.png', fileName: 'image.png', mimeType: 'image/png', fileSize: 100 };
async function fixture() {
  let picker = async () => ({ canceled: false, assets: [asset] });
  let upload = async (_input: any) => [{ type: 'image', name: 'image.png', url: '/image.png' }];
  const code = ts.transpileModule(
    readFileSync(new URL('../../src/features/chatPersistence/useChatComposerAttachments.ts', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }
  ).outputText;
  const deps: Record<string, any> = {
    'expo-image-picker': { launchImageLibraryAsync: () => picker() },
    'expo-document-picker': { getDocumentAsync: () => picker() },
    '../../core/api/services/uploadApi': {
      ChatUploadError: class extends Error {},
      extractUploadReferences: (response: any) => response,
      uploadChatAttachmentApi: (input: any) => upload(input)
    },
    '../../core/api/resourceUrl': { buildChatResourceUrl: (url: string) => url },
    './chatSource': source,
    './chatAttachmentModels': attachmentModels,
    './chatSelectionReference.ts': selection,
    './chatContextReference.ts': context,
    './cacheScope': { getChatCacheScopeId: () => 'scope' },
    '../../shared/i18n': { useT: () => defaultT }
  };
  const exports: any = {};
  new Function('require', 'exports', code)((id: string) => deps[id] ?? require(id), exports);
  let props = { conversationId: 'chat', disabled: false, localFilesAllowed: true };
  let value: any;
  function Harness() {
    value = exports.useChatComposerAttachments(props);
    return null;
  }
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  return {
    get value() {
      return value;
    },
    setPicker(value: typeof picker) {
      picker = value;
    },
    setUpload(value: typeof upload) {
      upload = value;
    },
    async update(patch: Partial<typeof props>) {
      props = { ...props, ...patch };
      await act(async () => {
        renderer.update(React.createElement(Harness));
      });
    },
    async close() {
      await act(async () => renderer.unmount());
    }
  };
}

test('configuration closure preserves uploaded files and selection references; forbidden files cannot be added or retried', async () => {
  const f = await fixture();
  try {
    await act(async () => {
      await f.value.handleSelectAttachment('image');
    });
    assert.equal(f.value.attachments[0].status, 'ready');
    await f.update({ localFilesAllowed: false });
    assert.equal(f.value.attachments.length, 1);
    await act(async () => {
      await f.value.handleSelectAttachment('file');
    });
    assert.equal(f.value.attachments.length, 1);
    await act(async () => {
      f.value.addSelection('引用的原文', '', 'message');
    });
    assert.equal(
      f.value.attachments.some((item: any) => item.kind === 'selection'),
      true
    );
    await f.update({ localFilesAllowed: true });
    f.setUpload(async () => {
      throw new Error('network');
    });
    await act(async () => {
      await f.value.handleSelectAttachment('image');
    });
    const failed = f.value.attachments.find((item: any) => item.status === 'failed');
    assert.ok(failed);
    await f.update({ localFilesAllowed: false });
    await act(async () => {
      f.value.handleRetryAttachment(failed.attachmentId);
    });
    assert.equal(f.value.attachments.find((item: any) => item.attachmentId === failed.attachmentId).status, 'failed');
    f.setUpload(async () => [{ type: 'image', url: '/done.png' }]);
    await f.update({ localFilesAllowed: true });
    await act(async () => {
      f.value.handleRetryAttachment(failed.attachmentId);
    });
    assert.equal(f.value.attachments.find((item: any) => item.attachmentId === failed.attachmentId).status, 'ready');
  } finally {
    await f.close();
  }
});

test('picker results are discarded after target changes, capability loss or unmount', async () => {
  for (const change of ['target', 'capability', 'unmount']) {
    const f = await fixture(),
      pick = deferred();
    f.setPicker(() => pick.promise);
    let pending!: Promise<void>;
    await act(async () => {
      pending = f.value.handleSelectAttachment('image');
    });
    if (change === 'target') {
      await f.update({ conversationId: 'other' });
      await f.update({ conversationId: 'chat' });
    } else if (change === 'capability') await f.update({ localFilesAllowed: false });
    else await f.close();
    await act(async () => {
      pick.resolve({ canceled: false, assets: [asset] });
      await pending;
    });
    assert.equal(f.value.attachments.length, 0);
    if (change !== 'unmount') await f.close();
  }
});

test('switching Chat aborts uploads and late success cannot populate the replacement Chat', async () => {
  const f = await fixture(),
    upload = deferred();
  let signal!: AbortSignal;
  f.setUpload(async (input) => {
    signal = input.signal;
    return upload.promise;
  });
  try {
    await act(async () => {
      await f.value.handleSelectAttachment('image');
    });
    assert.equal(f.value.hasUploadingAttachments, true);
    await f.update({ conversationId: 'other' });
    assert.equal(signal.aborted, true);
    await act(async () => {
      upload.resolve([{ type: 'image', url: '/late.png' }]);
    });
    assert.equal(f.value.attachments.length, 0);
  } finally {
    await f.close();
  }
});
