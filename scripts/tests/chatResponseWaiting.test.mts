import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChatTimelineDisplayItems, deriveChatTimelineState } from '../../src/features/chatTimeline/index.ts';
import { shouldShowChatResponseWaitingIndicator } from '../../src/features/chatPersistence/chatDetailViewModel.ts';

function shouldShowFor(events: Parameters<typeof deriveChatTimelineState>[1]): boolean {
  const state = deriveChatTimelineState('chat-1', events);
  const items = buildChatTimelineDisplayItems(state);
  return shouldShowChatResponseWaitingIndicator(state.activeRunId, items);
}

test('shows the response waiting indicator while an active run has no visible agent output', () => {
  assert.equal(
    shouldShowFor([
      {
        type: 'request.query',
        requestId: 'request-1',
        runId: 'run-1',
        message: '请总结这段内容',
        timestamp: 100
      },
      {
        type: 'run.start',
        runId: 'run-1',
        timestamp: 110
      }
    ]),
    true
  );
});

test('hides the response waiting indicator after visible agent output arrives', () => {
  assert.equal(
    shouldShowFor([
      {
        type: 'request.query',
        requestId: 'request-1',
        runId: 'run-1',
        message: '请总结这段内容',
        timestamp: 100
      },
      {
        type: 'run.start',
        runId: 'run-1',
        timestamp: 110
      },
      {
        type: 'content.delta',
        runId: 'run-1',
        contentId: 'answer-1',
        delta: '好的',
        timestamp: 120
      }
    ]),
    false
  );
});

test('hides the response waiting indicator after the run finishes without output', () => {
  assert.equal(
    shouldShowFor([
      {
        type: 'run.start',
        runId: 'run-1',
        timestamp: 100
      },
      {
        type: 'run.complete',
        runId: 'run-1',
        timestamp: 110
      }
    ]),
    false
  );
});
