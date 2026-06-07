import {
  applyChatTimelineEvent,
  createChatTimelineState,
  deriveChatTimelineState,
  projectTimelineRuntimeState,
} from '../chatTimeline/index.ts';
import type { ChatConversationRuntimeState } from './types.ts';
import type { ChatTimelineNode, ChatTimelineState } from '../chatTimeline/index.ts';

export function getConversationRuntimeState(conversationId: string): ChatConversationRuntimeState {
  return projectTimelineRuntimeState(createChatTimelineState(conversationId));
}

export function applyConversationRuntimeEvent(
  currentStateInput: ChatConversationRuntimeState | null | undefined,
  conversationIdInput: string,
  rawEvent: Record<string, unknown>
): ChatConversationRuntimeState {
  const restoredState = restoreTimelineStateFromRuntimeState(
    conversationIdInput,
    currentStateInput
  );
  const restoredWithAwaiting = currentStateInput?.awaiting
    ? applyChatTimelineEvent(restoredState, conversationIdInput, {
        type: currentStateInput.awaiting.status === 'answer' ? 'awaiting.answer' : 'awaiting.ask',
        chatId: conversationIdInput,
        awaitingId: currentStateInput.awaiting.awaitingId || currentStateInput.awaiting.id,
        runId: currentStateInput.awaiting.runId,
        createdAt: currentStateInput.awaiting.createdAt,
        prompt: currentStateInput.awaiting.prompt,
        answer: currentStateInput.awaiting.answer,
        payload: currentStateInput.awaiting.payloadText,
        kind: currentStateInput.awaiting.mode,
        interactive: currentStateInput.awaiting.interactive,
        updatedAt: currentStateInput.awaiting.updatedAt,
      })
    : restoredState;
  return projectTimelineRuntimeState(
    applyChatTimelineEvent(restoredWithAwaiting, conversationIdInput, rawEvent)
  );
}

function restoreTimelineStateFromRuntimeState(
  conversationId: string,
  runtimeState: ChatConversationRuntimeState | null | undefined
): ChatTimelineState {
  const baseState = createChatTimelineState(conversationId);
  if (!runtimeState) {
    return baseState;
  }

  let nextOrder = 0;
  const nodesById: Record<string, ChatTimelineNode> = {};
  const orderedNodeIds: string[] = [];
  runtimeState.entries
    .slice()
    .sort((left, right) => left.updatedAt - right.updatedAt)
    .forEach((entry) => {
      const base = {
        id: entry.id,
        runId: '',
        createdAt: entry.updatedAt,
        updatedAt: entry.updatedAt,
        order: nextOrder,
        lifecycle: entry.lifecycle,
      };
      nextOrder += 1;
      orderedNodeIds.push(entry.id);
      if (entry.kind === 'tool') {
        nodesById[entry.id] = {
          ...base,
          kind: 'tool',
          toolId: '',
          toolName: '',
          toolLabel: entry.title,
          description: '',
          title: entry.title,
          status: entry.status,
          argsText: '',
          resultText: entry.body,
          body: entry.body,
          streaming: entry.streaming,
        };
        return;
      }
      if (entry.kind === 'awaiting') {
        return;
      }
      if (entry.kind === 'run') {
        nodesById[entry.id] = {
          ...base,
          kind: 'run',
          title: entry.title,
          body: entry.body,
          status: entry.status,
          agentKey: '',
          startedAt: null,
          completedAt: entry.updatedAt,
          durationMs: null,
        };
        return;
      }
      nodesById[entry.id] = {
        ...base,
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        status: entry.status,
        streaming: entry.streaming,
      } as ChatTimelineNode;
    });

  return {
    ...baseState,
    orderedNodeIds,
    nodesById,
    awaiting: runtimeState.awaiting,
    usageLabel: runtimeState.usageLabel,
    usageSummary: null,
    updatedAt: runtimeState.updatedAt,
    nextOrder,
  };
}

export function deriveConversationRuntimeState(
  conversationId: string,
  rawEvents: unknown[]
): ChatConversationRuntimeState {
  return projectTimelineRuntimeState(deriveChatTimelineState(conversationId, rawEvents));
}
