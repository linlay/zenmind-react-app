import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatTimelineState, deriveChatTimelineState } from '../../src/features/chatTimeline/timelineReducer.ts';
import { projectTimelineAwaitingState } from '../../src/features/chatTimeline/messageProjection.ts';
import {
  areChatTimelineDisplayItemsEqual,
  buildChatTimelineDisplayItems
} from '../../src/features/chatTimeline/timelineDisplay.ts';
import type { ChatTimelineAwaitingNode, ChatTimelineState } from '../../src/features/chatTimeline/types.ts';

test('detail awaiting projection reads only its addressed node and preserves interaction semantics', () => {
  const awaiting = {
    id: 'ask',
    awaitingId: 'a1',
    runId: 'r1',
    createdAt: 1,
    updatedAt: 2,
    prompt: 'Choose',
    answer: '',
    payloadText: '',
    mode: 'question' as const,
    status: 'ask' as const,
    interactive: null,
    answerSummary: null
  };
  const node: ChatTimelineAwaitingNode = {
    ...awaiting,
    kind: 'awaiting',
    order: 1,
    lifecycle: 'active'
  };
  const state: ChatTimelineState = {
    ...createChatTimelineState('chat'),
    awaiting,
    nodesById: new Proxy(
      { ask: node },
      {
        get(target, id) {
          assert.equal(id, 'ask', 'must not read unrelated history');
          return target.ask;
        }
      }
    )
  };
  Object.defineProperty(state, 'orderedNodeIds', {
    get() {
      throw new Error('must not scan history');
    }
  });
  assert.equal(projectTimelineAwaitingState(state), awaiting);
  assert.equal(projectTimelineAwaitingState({ ...createChatTimelineState('empty') }), null);
  node.lifecycle = 'complete';
  assert.equal(projectTimelineAwaitingState(state), null);
  node.status = 'answer';
  node.answerSummary = { title: 'Answered', items: [], status: 'answered', itemCount: 0, copyText: '' };
  assert.deepEqual(projectTimelineAwaitingState(state), { ...awaiting, answerSummary: node.answerSummary });
});

test('shared row equality detects content, frame and footer changes while reusing unchanged items', () => {
  const state = deriveChatTimelineState('chat', [
    { type: 'run.start', runId: 'r', timestamp: 1 },
    { type: 'content.end', runId: 'r', contentId: 'c', text: 'Answer', timestamp: 2 },
    { type: 'run.complete', runId: 'r', timestamp: 3 }
  ]);
  const items = buildChatTimelineDisplayItems(state);
  const content = items.find((item) => item.kind === 'assistant-content');
  const footer = items.find((item) => item.kind === 'assistant-reply-footer');
  assert.ok(content && footer);
  assert.equal(areChatTimelineDisplayItemsEqual(content, { ...content }), true);
  assert.equal(areChatTimelineDisplayItemsEqual(content, { ...content, groupIndex: content.groupIndex + 1 }), false);
  assert.equal(areChatTimelineDisplayItemsEqual(content, { ...content, node: { ...content.node } }), false);
  assert.equal(
    areChatTimelineDisplayItemsEqual(footer, { ...footer, footer: { ...footer.footer, copyText: 'New' } }),
    false
  );
});
