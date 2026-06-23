import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssistantMessageId,
  classifyChatProtocolEvent,
  extractAgentKey,
  extractConversationId,
  extractEventText,
  extractMessageRole,
  extractTeamId,
  isAssistantContentEvent,
  isChatReadAllEvent,
  isChatReadEvent,
  isChatUnreadEvent,
  isSummaryLikeEvent,
  normalizeEventType,
  toFiniteNumber
} from '../../src/features/chatRealtime/routing.ts';
import {
  normalizeAwaitingTimeoutMs,
  normalizeProtocolTimestampMs
} from '../../src/core/api/services/chatEventProtocol.ts';
import { toWsPushEvent } from '../../src/features/chatRealtime/chatWsTransport.ts';
import type { WsPushFrame } from '../../src/core/ws/wsClient.ts';

test('normalizes protocol time values without changing local monotonic stamps', () => {
  assert.equal(normalizeAwaitingTimeoutMs(180), 180_000);
  assert.equal(normalizeAwaitingTimeoutMs(180_000), 180_000);
  assert.equal(normalizeAwaitingTimeoutMs(null), null);
  assert.equal(normalizeProtocolTimestampMs(1_780_023_877, 0), 1_780_023_877_000);
  assert.equal(normalizeProtocolTimestampMs(1_780_023_877_038, 0), 1_780_023_877_038);
  assert.equal(normalizeProtocolTimestampMs(300_000, 0), 300_000);
});

test('normalizes known backend aliases into mobile stream event names', () => {
  assert.equal(normalizeEventType('message.delta'), 'content.delta');
  assert.equal(normalizeEventType('message.complete'), 'content.end');
  assert.equal(normalizeEventType('answer.end'), 'content.end');
  assert.equal(normalizeEventType('run.finished'), 'run.complete');
  assert.equal(normalizeEventType('run.completed'), 'run.complete');
  assert.equal(normalizeEventType('run.done'), 'run.complete');
  assert.equal(normalizeEventType('run.failed'), 'run.error');
  assert.equal(normalizeEventType('run.cancelled'), 'run.cancel');
  assert.equal(normalizeEventType('awaiting.asking'), 'awaiting.ask');
  assert.equal(normalizeEventType('awaiting.answered'), 'awaiting.answer');
  assert.equal(normalizeEventType('conversation.read'), 'chat.read');
  assert.equal(normalizeEventType('chat.mark_unread'), 'chat.unread');
  assert.equal(normalizeEventType('chat.readAll'), 'chat.read_all');
  assert.equal(normalizeEventType('custom.event'), 'custom.event');
});

test('extracts scoped routing fields from common backend payload shapes', () => {
  const event = {
    chatId: 'chat-1',
    delta: 'partial answer',
    role: 'assistant'
  };

  assert.equal(extractConversationId(event), 'chat-1');
  assert.equal(extractEventText(event), 'partial answer');
  assert.equal(extractMessageRole(event), 'assistant');
  assert.equal(extractAgentKey({ agentKey: 'planner' }), 'planner');
  assert.equal(extractTeamId({ teamId: 'team-alpha' }), 'team-alpha');
});

test('identifies assistant stream events and summary-like push events', () => {
  assert.equal(isAssistantContentEvent('content.delta'), true);
  assert.equal(isAssistantContentEvent('run.complete'), false);
  assert.equal(isSummaryLikeEvent({ chatId: 'chat-1', lastRunContent: 'done' }), true);
  assert.equal(isSummaryLikeEvent({ chatId: 'chat-1', read: false }), true);
  assert.equal(isSummaryLikeEvent({ chatId: 'chat-1', type: 'noop' }), false);
});

test('flattens nested push data before realtime routing', () => {
  const event = toWsPushEvent({
    frame: 'push',
    type: 'chat.updated',
    data: {
      chatId: 'chat-1',
      agentKey: 'zenmi',
      lastRunContent: 'done',
      updatedAt: 1_780_023_877_038
    }
  } as WsPushFrame);

  assert.equal(event.type, 'chat.updated');
  assert.equal(event.chatId, 'chat-1');
  assert.equal(event.agentKey, 'zenmi');
  assert.equal(event.lastRunContent, 'done');
  assert.equal(isSummaryLikeEvent(event), true);
});

test('identifies chat read state events', () => {
  assert.equal(isChatReadEvent('chat.read'), true);
  assert.equal(isChatReadEvent('chat.unread'), false);
  assert.equal(isChatUnreadEvent('chat.unread'), true);
  assert.equal(isChatUnreadEvent('chat.read'), false);
  assert.equal(isChatReadAllEvent('chat.read_all'), true);
  assert.equal(isChatReadAllEvent('chat.read'), false);
});

test('classifies removal and runtime protocol events', () => {
  assert.equal(classifyChatProtocolEvent({ type: 'chat.deleted', chatId: 'chat-1' }), 'conversation_remove');
  assert.equal(classifyChatProtocolEvent({ type: 'chat.archived', chatId: 'chat-1' }), 'conversation_remove');
  assert.equal(classifyChatProtocolEvent({ type: 'awaiting.ask', chatId: 'chat-1' }), 'awaiting');
  assert.equal(classifyChatProtocolEvent({ type: 'awaiting.asking', chatId: 'chat-1' }), 'awaiting');
  assert.equal(classifyChatProtocolEvent({ type: 'awaiting.answered', chatId: 'chat-1' }), 'awaiting');
  assert.equal(classifyChatProtocolEvent({ type: 'reasoning.delta', chatId: 'chat-1' }), 'reasoning');
  assert.equal(classifyChatProtocolEvent({ type: 'tool.result', chatId: 'chat-1' }), 'tool');
  assert.equal(classifyChatProtocolEvent({ type: 'context.compact.done', chatId: 'chat-1' }), 'context');
});

test('builds stable assistant message ids from run and content identifiers', () => {
  assert.equal(
    buildAssistantMessageId('chat-1', {
      runId: 'run-1',
      contentId: 'content-1'
    }),
    'assistant:chat-1:run-1:content-1'
  );

  assert.equal(
    buildAssistantMessageId('chat-1', {
      serverMessageId: 'server-1'
    }),
    'assistant:chat-1:run:server-1'
  );
});

test('parses numeric and ISO timestamps with a fallback', () => {
  assert.equal(toFiniteNumber(1700000000000, 1), 1700000000000);
  assert.equal(toFiniteNumber('2026-05-26T00:00:00.000Z', 1), Date.parse('2026-05-26T00:00:00.000Z'));
  assert.equal(toFiniteNumber('', 7), 7);
});
