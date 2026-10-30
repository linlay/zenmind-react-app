import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deserializeChatTimelineState } from '../../src/features/chatTimeline/timelinePersistence.ts';
import {
  CONVERSATION_PREVIEW_MAX_SOURCE_BYTES,
  CONVERSATION_PREVIEW_MAX_BRIDGE_PARAMS_BYTES,
  getConversationPreviewSourceByteLength
} from '../../src/shared/components/conversationPreview/runtimeBridge.ts';

const directory = new URL('../fixtures/chat-detail-webclient-2026-10-28/', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, directory));

test('T00 preserves the exact pinned upstream golden and real builtin template sources', () => {
  const provenance = JSON.parse(read('provenance.json').toString());
  for (const asset of provenance.upstreamAssets) {
    const bytes = read(asset.file);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
  }
  const golden = JSON.parse(read('view-markdown-cases.json').toString());
  assert.equal(golden.cases.length, 24);
  assert.equal(
    golden.cases.find((entry: { name: string }) => entry.name === 'invalid header still takes an index').blocks[1]
      .index,
    1
  );
  assert.match(read('ask_user_form.html').toString(), /frontend_awaiting_submit/);
  const declaration = JSON.parse(read('task-control-view.json').toString());
  assert.equal(declaration.views.automations.queries.list.operation, 'automation.list');
});

test('T00 keeps existing UTF-8 document and bridge budgets without inventing a recovery budget', () => {
  const { budgets, recovery, query } = JSON.parse(read('wire-cases.json').toString());
  assert.equal(budgets.documentSourceBytes, CONVERSATION_PREVIEW_MAX_SOURCE_BYTES);
  assert.equal(budgets.bridgeParamsBytes, CONVERSATION_PREVIEW_MAX_BRIDGE_PARAMS_BYTES);
  assert.equal(getConversationPreviewSourceByteLength('中'), 3);
  assert.ok(Buffer.byteLength(JSON.stringify(query.params)) < budgets.queryParamsBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(query.result)) < budgets.queryResultBytes);
  assert.equal(recovery.automaticBudget, null);
});

test('T00 v9 fixture preserves readable answered and pending Form facts through the real decoder', () => {
  const fixture = JSON.parse(read('v9-form-snapshot.json').toString());
  const state = deserializeChatTimelineState(fixture.snapshot.meta, fixture.snapshot.nodes);
  assert.ok(state);
  const prompts = state.orderedNodeIds.flatMap((id) => {
    const node = state.nodesById[id];
    return node?.kind === 'awaiting' ? [node.prompt] : [];
  });
  assert.deepEqual(prompts, fixture.expected.preservePrompts);
  assert.equal(state.awaiting?.awaitingId, 't00-current');
  assert.equal(state.awaiting?.status, 'ask');
});
