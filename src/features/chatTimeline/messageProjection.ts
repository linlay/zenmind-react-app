import type {
  ChatMessageItem,
  ChatMessageRole,
  ChatMessageStreamStatus,
} from '../chatPersistence/types.ts';
import type {
  ChatTimelineAwaitingNode,
  ChatTimelineMessageNode,
  ChatTimelineNode,
  ChatTimelineRuntimeEntry,
  ChatTimelineRuntimeState,
  ChatTimelineState,
  ChatTimelineSourceNode,
  ChatTimelineTextNode,
  ChatTimelineToolNode,
} from './types.ts';

type ProjectedRuntimeNode = Exclude<
  ChatTimelineNode,
  ChatTimelineMessageNode | ChatTimelineSourceNode
>;

function runtimeStatusForProjectedNode(node: ProjectedRuntimeNode): string {
  if (node.kind === 'awaiting') {
    return node.status === 'answer' ? 'answered' : 'waiting';
  }
  return node.status;
}

function bodyForNode(node: ProjectedRuntimeNode): string {
  if (node.kind === 'awaiting') {
    return [node.prompt, node.payloadText, node.answer].filter(Boolean).join('\n');
  }
  if (node.kind === 'tool') {
    return node.body;
  }
  if (node.kind === 'artifact') {
    return node.errorReason || node.summary || node.resourceUrl;
  }
  if (node.kind === 'plan') {
    return [
      node.summary,
      ...node.steps.map((step) => `${step.status}: ${step.description}`),
      node.errorReason,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (node.kind === 'task') {
    return [node.status, node.errorReason].filter(Boolean).join('\n');
  }
  if (node.kind === 'action') {
    return [node.target, node.argsText, node.resultText, node.errorReason].filter(Boolean).join('\n');
  }
  return node.body;
}

function titleForNode(node: ProjectedRuntimeNode): string {
  if (node.kind === 'awaiting') {
    return `awaiting.${node.mode}`;
  }
  if (node.kind === 'artifact') {
    return node.name;
  }
  if (node.kind === 'plan') {
    return node.title || node.planId;
  }
  if (node.kind === 'task') {
    return node.taskName || node.taskId;
  }
  if (node.kind === 'action') {
    return node.actionName || node.actionId;
  }
  return node.title;
}

function runtimeEntryFromNode(node: ProjectedRuntimeNode): ChatTimelineRuntimeEntry | null {
  if (node.kind === 'run' && node.lifecycle === 'active') {
    return null;
  }
  return {
    id: node.id,
    kind: node.kind,
    title: titleForNode(node),
    body: bodyForNode(node),
    status: runtimeStatusForProjectedNode(node),
    lifecycle: node.lifecycle,
    updatedAt: node.updatedAt,
    streaming:
      (node.kind === 'tool' && node.streaming) ||
      ((node.kind === 'reasoning' || node.kind === 'planning') &&
        (node as ChatTimelineTextNode | ChatTimelineToolNode).streaming),
  };
}

export function projectTimelineMessages(state: ChatTimelineState): ChatMessageItem[] {
  return state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter(
      (node): node is ChatTimelineMessageNode & { role: ChatMessageRole } =>
        Boolean(node) &&
        node.kind === 'message' &&
        (node.role === 'user' || node.role === 'assistant')
    )
    .map((node) => {
      const streamStatus: ChatMessageStreamStatus = node.streaming ? 'streaming' : 'done';
      return {
        messageId: node.messageId,
        clientMessageId: node.clientMessageId,
        serverMessageId: node.serverMessageId,
        conversationId: state.conversationId,
        role: node.role,
        content: node.content,
        createdAt: node.createdAt,
        deliveryStatus: node.deliveryStatus,
        streamStatus,
        errorReason: node.errorReason,
        attachments: node.attachments || [],
      };
    })
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function projectTimelineRuntimeState(state: ChatTimelineState): ChatTimelineRuntimeState {
  const entries = state.orderedNodeIds
    .map((id) => state.nodesById[id])
    .filter(
      (node): node is ProjectedRuntimeNode =>
        Boolean(node) && node.kind !== 'message' && node.kind !== 'source'
    )
    .map(runtimeEntryFromNode)
    .filter((entry): entry is ChatTimelineRuntimeEntry => Boolean(entry))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 18);
  const awaitingNode = state.awaiting
    ? (state.nodesById[state.awaiting.id] as ChatTimelineAwaitingNode | undefined)
    : undefined;
  const visibleAwaiting =
    state.awaiting && awaitingNode?.status === 'answer'
      ? state.awaiting
      : state.awaiting && awaitingNode?.lifecycle === 'active'
        ? state.awaiting
        : null;

  return {
    conversationId: state.conversationId,
    entries,
    awaiting:
      visibleAwaiting && awaitingNode
        ? {
            id: visibleAwaiting.id,
            awaitingId: visibleAwaiting.awaitingId,
            runId: visibleAwaiting.runId,
            createdAt: visibleAwaiting.createdAt,
            prompt: visibleAwaiting.prompt,
            answer: visibleAwaiting.answer,
            payloadText: visibleAwaiting.payloadText,
            mode: visibleAwaiting.mode,
            status: visibleAwaiting.status,
            interactive: visibleAwaiting.interactive,
            answerSummary: visibleAwaiting.answerSummary ?? awaitingNode.answerSummary ?? null,
            updatedAt: visibleAwaiting.updatedAt,
          }
        : null,
    usageLabel: state.usageLabel,
    updatedAt: state.updatedAt,
  };
}
