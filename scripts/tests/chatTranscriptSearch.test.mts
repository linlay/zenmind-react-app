import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeChatRunTranscript } from '../../src/features/chatPersistence/chatRunTranscript.ts';
import {
  createChatTimelineTextSearch,
  chatSearchMatchKey,
  MAX_CHAT_SEARCH_MATCHES
} from '../../src/features/chatPersistence/chatTimelineTextSearch.ts';
import { deriveChatTimelineState, applyChatTimelineEvent } from '../../src/features/chatTimeline/timelineReducer.ts';
import {
  serializeChatTimelineState,
  deserializeChatTimelineState
} from '../../src/features/chatTimeline/timelinePersistence.ts';
import { projectRemoteChatDetail } from '../../src/features/chatPersistence/chatProjector.ts';
const now = 1_791_450_000_000;
function loaded() {
  return deriveChatTimelineState('chat', [
    { type: 'request.query', runId: 'run', requestId: 'q', message: 'Find my report', timestamp: now },
    { type: 'run.start', runId: 'run', requestId: 'q', timestamp: now + 1 },
    { type: 'reasoning.snapshot', runId: 'run', text: 'Check the report source', timestamp: now + 2 },
    {
      type: 'tool.snapshot',
      runId: 'run',
      toolId: 'one',
      toolName: 'lookup',
      description: 'Read report',
      arguments: '{"Authorization":"Bearer secret","nested":{"password":"hidden","folder":"reports"}}',
      timestamp: now + 3
    },
    { type: 'tool.end', runId: 'run', toolId: 'one', timestamp: now + 4 },
    {
      type: 'tool.output',
      runId: 'run',
      toolId: 'one',
      chunkIndex: 0,
      stream: 'stdout',
      text: 'TRANSIENT-STDOUT',
      timestamp: now + 5
    },
    {
      type: 'tool.result',
      runId: 'run',
      toolId: 'one',
      result: '{"found":1,"access_token":"private"}',
      timestamp: now + 6
    },
    {
      type: 'content.snapshot',
      runId: 'run',
      contentId: 'answer',
      text: 'Report ready. report updated.',
      timestamp: now + 7
    },
    { type: 'run.finish', runId: 'run', timestamp: now + 8 }
  ]);
}
test('whole-run copy uses ordered Query/Thinking/Tools/Answer with same tool redaction and excludes transient output/metadata', () => {
  const state = loaded(),
    transcript = serializeChatRunTranscript(state, 'run');
  assert.match(transcript, /^Query\nFind my report\n\nThinking\nCheck the report source\n\nTools\n1\. lookup/);
  assert.match(transcript, /arguments:\n/);
  assert.match(transcript, /"folder": "reports"/);
  assert.match(transcript, /"Authorization": "\[redacted\]"/);
  assert.match(transcript, /"password": "\[redacted\]"/);
  assert.match(transcript, /"access_token": "\[redacted\]"/);
  assert.match(transcript, /Answer\nReport ready\. report updated\.$/);
  for (const value of [
    'Bearer secret',
    'hidden',
    'private',
    'TRANSIENT-STDOUT',
    'viewportKey',
    'toolParams',
    'feedbackPending'
  ])
    assert.equal(transcript.includes(value), false);
  assert.equal(serializeChatRunTranscript(state, 'other-run'), '');
  const stored = serializeChatTimelineState(state),
    cold = deserializeChatTimelineState(stored.meta, stored.nodes)!;
  assert.equal(serializeChatRunTranscript(cold, 'run'), transcript);
});
test('failed and active runs retain partial copy; empty sections vanish; reply-only history projects without guessing query', () => {
  const partial = deriveChatTimelineState('chat', [
    { type: 'request.query', runId: 'run', requestId: 'q', message: 'question', timestamp: now },
    { type: 'run.start', runId: 'run', timestamp: now + 1 },
    { type: 'content.delta', runId: 'run', contentId: 'answer', delta: 'partial answer', timestamp: now + 2 }
  ]);
  assert.equal(
    serializeChatRunTranscript(partial, 'run'),
    'Query\nquestion\n\nAnswer\npartial answer\n\nStatus\npartial'
  );
  const failed = applyChatTimelineEvent(partial, 'chat', {
    type: 'run.error',
    runId: 'run',
    error: { message: 'request failed' },
    timestamp: now + 3
  });
  const text = serializeChatRunTranscript(failed, 'run');
  assert.match(text, /partial answer/);
  assert.match(text, /Status\nerror/);
  assert.match(text, /request failed/);
  assert.equal(text.includes('Thinking'), false);
  assert.equal(text.includes('Tools'), false);
  const history = projectRemoteChatDetail({
    chatId: 'chat',
    runs: [{ runId: 'answer-only', startedAt: now, completedAt: now + 1, assistantText: 'history answer' }]
  })!.timelineState;
  assert.equal(serializeChatRunTranscript(history, 'answer-only'), 'Answer\nhistory answer');
});
test('search is literal/case-insensitive with original Unicode offsets; loaded body only, hidden VIEW/runtime never searchable', () => {
  const search = createChatTimelineTextSearch(),
    state = loaded();
  const result = search.search(state, 'report');
  assert.equal(result.total, 3);
  assert.equal(result.matches[0].nodeId.startsWith('message:'), true);
  assert.equal(result.matches[1].text, 'Report');
  assert.equal(result.matches[2].ordinal, 2);
  assert.equal(search.search(state, 'TRANSIENT-STDOUT').total, 0);
  assert.equal(search.search(state, 'Check the report source').total, 0);
  assert.equal(search.search(state, 'Authorization').total, 0);
  const special = deriveChatTimelineState('chat', [
    {
      type: 'content.snapshot',
      runId: 'run',
      contentId: 'm',
      text: 'İ first [a+b] 中文 🧠\n```VIEW\n{"view":{"connectorId":"demo","key":"opaque"},"payload":{"onlyHidden":"payload-secret"}}\n```\nlast [a+b]',
      timestamp: now
    }
  ]);
  assert.equal(search.search(special, '[a+b]').total, 2);
  for (const needle of ['中文', '🧠']) {
    const hit = search.search(special, needle).matches[0]!;
    assert.equal(hit.text, needle);
    assert.equal(hit.before.includes('[a+b]'), true);
  }
  assert.equal(search.search(special, 'payload-secret').total, 0);
  assert.equal(search.search(special, 'opaque').total, 0);
  search.clear();
  assert.equal(search.search(deriveChatTimelineState('next', []), 'report').total, 0);
});
test('prepend/load-more and live append preserve match identity, bound navigation memory, and cold/replay use the same body', () => {
  const search = createChatTimelineTextSearch(),
    state = loaded(),
    original = search.search(state, 'report').matches[2]!;
  const older = deriveChatTimelineState('chat', [
    { type: 'request.query', runId: 'older-run', requestId: 'older', message: 'older report', timestamp: now - 100 }
  ]);
  const paged = {
    ...state,
    orderedNodeIds: [...older.orderedNodeIds, ...state.orderedNodeIds],
    nodesById: { ...older.nodesById, ...state.nodesById }
  };
  const changed = search.search(paged, 'report');
  assert.equal(changed.total, 4);
  assert.equal(chatSearchMatchKey(changed.matches[3]!), chatSearchMatchKey(original));
  const live = deriveChatTimelineState('chat', [
    { type: 'content.snapshot', runId: 'run', contentId: 'a', text: 'x '.repeat(5000), timestamp: now }
  ]);
  const hits = search.search(live, 'x');
  assert.equal(hits.total, 5000);
  assert.equal(hits.matches.length, MAX_CHAT_SEARCH_MATCHES);
  const stored = serializeChatTimelineState(paged),
    cold = deserializeChatTimelineState(stored.meta, stored.nodes)!;
  assert.deepEqual(
    search.search(cold, 'report').matches.map(chatSearchMatchKey),
    changed.matches.map(chatSearchMatchKey)
  );
});
test('active-search refresh scans only changed message text and reuses match objects for unchanged loaded history', () => {
  const original = RegExp.prototype.exec;
  let scans = 0;
  RegExp.prototype.exec = function (input: string) {
    if (this.source === 'report' && this.flags === 'giu') scans++;
    return original.call(this, input);
  };
  try {
    const search = createChatTimelineTextSearch(),
      state = loaded(),
      first = search.search(state, 'report'),
      initial = scans;
    const metadataOnly = { ...state, revision: state.revision + 1 };
    const unchanged = search.search(metadataOnly, 'report');
    assert.equal(scans, initial);
    assert.equal(unchanged.matches[0], first.matches[0]);
    assert.equal(unchanged.matches[2], first.matches[2]);
    const nodeId = first.matches[1].nodeId,
      node = state.nodesById[nodeId];
    assert.equal(node.kind, 'message');
    if (node.kind !== 'message') throw new Error('Expected body');
    const stream = {
      ...state,
      nodesById: { ...state.nodesById, [nodeId]: { ...node, content: node.content + ' report appended' } }
    };
    const updated = search.search(stream, 'report');
    assert.equal(scans - initial, 4, 'only changed answer: three occurrences and one end check');
    assert.equal(updated.total, 4);
    assert.equal(updated.matches[0], first.matches[0]);
  } finally {
    RegExp.prototype.exec = original;
  }
});
test('copy permits error-only runs without leaking diagnostics or hidden VIEW payload', () => {
  const failed = deriveChatTimelineState('chat', [
    {
      type: 'run.error',
      runId: 'run',
      error: { message: 'failure reason', diagnostics: { unsafe: 'DO-NOT-COPY' } },
      timestamp: now
    }
  ]);
  const transcript = serializeChatRunTranscript(failed, 'run');
  assert.match(transcript, /^Status\nerror/);
  assert.match(transcript, /failure reason/);
  assert.equal(transcript.includes('DO-NOT-COPY'), false);
  const view = deriveChatTimelineState('chat', [
    {
      type: 'content.snapshot',
      runId: 'run',
      contentId: 'answer',
      text: 'before\n```VIEW\n{"view":{"connectorId":"demo","key":"opaque"},"payload":{"private":"VIEW-PAYLOAD"}}\n```\nafter',
      timestamp: now
    }
  ]);
  const answer = serializeChatRunTranscript(view, 'run');
  assert.match(answer, /before/);
  assert.match(answer, /after/);
  assert.equal(answer.includes('VIEW-PAYLOAD'), false);
  assert.equal(answer.includes('opaque'), false);
});
