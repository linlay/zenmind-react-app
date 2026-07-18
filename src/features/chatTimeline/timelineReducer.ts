import {
  buildAssistantMessageId,
  buildFallbackAssistantMessageId,
  classifyChatProtocolEvent,
  extractEventText,
  normalizeEventType,
  normalizeProtocolTimeoutMs,
  normalizeProtocolTimestampMs,
  toText,
} from '../../core/api/services/chatEventProtocol.ts';
import type { ChatMessageItem } from '../chatPersistence/types.ts';
import {
  areChatAttachmentsEqual,
  createMessageAttachmentsFromReferences,
  normalizeChatAttachmentReferences,
} from '../chatPersistence/chatAttachmentModels.ts';
import type {
  ChatTimelineAwaitingInteractive,
  ChatTimelineAwaitingMode,
  ChatTimelineAwaitingNode,
  ChatTimelineAwaitingState,
  ChatTimelineArtifactNode,
  ChatTimelineDeliveryStatus,
  ChatTimelineLifecycle,
  ChatTimelineMessageNode,
  ChatTimelineNode,
  ChatTimelineNodeKind,
  ChatTimelineRuntimeStatus,
  ChatTimelineRunNode,
  ChatTimelineSourceNode,
  ChatTimelineState,
  ChatTimelineTextNode,
  ChatTimelineToolNode,
} from './types.ts';
import {
  chatTimelineArtifactNodePayloadEquals,
  getChatTimelineArtifactContentLength,
  normalizeChatTimelineArtifactEvent,
} from './timelineArtifact.ts';
import {
  getAwaitingAnswerSummarySignature,
  getAwaitingInteractiveSignature,
  getAwaitingInteractiveTimeout,
  normalizeChatTimelineAwaitingEvent,
} from './awaitingInteraction.ts';
import {
  firstTimelineEventText as firstFormattedText,
  safeTimelineJson as safeJson,
} from './timelineEventFormat.ts';
import {
  activeReasoningRunKey,
  buildActiveReasoningNodeIdsByRun,
  clearActiveReasoningNodeIdForRun,
  copyActiveReasoningNodeIdsByRun,
  copyPreservedReasoningNodeIdsByRun,
  getActiveReasoningNodeIdForRun,
  setActiveReasoningNodeIdForRun,
} from './timelineReasoningIdentity.ts';
import {
  formatChatTimelinePlatformErrorForDisplay,
  getChatTimelineErrorDetailSignature,
} from './timelinePlatformError.ts';
import {
  chatTimelineSourceNodePayloadEquals,
  getChatTimelineSourceContentLength,
  normalizeChatTimelineSourceEvent,
} from './timelineSource.ts';
import { buildChatTimelineUsageSummary, chatTimelineUsageSummaryEquals } from './usageSummary.ts';
import {
  normalizeFrontendToolParams,
  normalizeFrontendToolType,
  parseFrontendToolArgs,
} from './timelineFrontendTool.ts';

export type MergeChatTimelineStateOptions = {
  preserveTerminalRunIds?: readonly string[];
};

type ChatTimelineRunContextOptions = {
  runId?: string | null;
};

const REQUEST_ECHO_MATCH_WINDOW_MS = 5 * 60 * 1000;

function normalizeConversationId(conversationId: string): string {
  return String(conversationId || '').trim();
}

function resolveTimestamp(event: Record<string, unknown>, fallback = Date.now()): number {
  return normalizeProtocolTimestampMs(
    event.timestamp || event.ts || event.time || event.createdAt || event.updatedAt,
    fallback
  );
}

function resolveOptionalTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const timestamp = normalizeProtocolTimestampMs(value, 0);
  return timestamp > 0 ? timestamp : null;
}

function resolveEventRunId(
  event: Record<string, unknown>,
  state: ChatTimelineState,
  current?: ChatTimelineNode
): string {
  return toText(event.runId) || current?.runId || state.activeRunId;
}

function resolveLifecycle(type: string): ChatTimelineLifecycle {
  if (type.endsWith('.error') || type.endsWith('.fail') || type.endsWith('.failed')) {
    return 'error';
  }
  if (type.endsWith('.cancel')) {
    return 'cancelled';
  }
  if (
    type.endsWith('.end') ||
    type.endsWith('.snapshot') ||
    type.endsWith('.result') ||
    type.endsWith('.complete') ||
    type.endsWith('.done')
  ) {
    return 'complete';
  }
  return 'active';
}

const BODY_FALLBACK_FIELD_NAMES = [
  'summary',
  'details',
  'reason',
  'error',
  'prompt',
  'answer',
  'path',
  'url',
] as const;

const BODY_WITH_LABEL_FALLBACK_FIELD_NAMES = [
  ...BODY_FALLBACK_FIELD_NAMES,
  'name',
  'title',
  'toolName',
] as const;

function firstEventStringField(
  event: Record<string, unknown>,
  fieldNames: readonly string[]
): string {
  for (const fieldName of fieldNames) {
    const value = event[fieldName];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function fallbackBodyFromEvent(
  event: Record<string, unknown>,
  fieldNames: readonly string[]
): string {
  const payloadJson = safeJson(event.payload);
  return payloadJson || firstEventStringField(event, fieldNames);
}

function bodyFromEvent(event: Record<string, unknown>): string {
  const text = extractEventText(event);
  if (text) {
    return text;
  }

  const argsJson = firstFormattedText(event.args, event.arguments);
  if (argsJson) {
    return argsJson;
  }

  const resultJson = firstFormattedText(event.result, event.output);
  if (resultJson) {
    return resultJson;
  }

  return fallbackBodyFromEvent(event, BODY_WITH_LABEL_FALLBACK_FIELD_NAMES);
}

function reasoningLabelCandidateForEvent(event: Record<string, unknown>): string {
  return toText(event.reasoningLabel) || toText(event.title || event.name);
}

function bodyFromReasoningEvent(event: Record<string, unknown>): string {
  const text = extractEventText(event);
  const label = reasoningLabelCandidateForEvent(event);
  if (text) {
    return label && text === label ? '' : text;
  }

  return fallbackBodyFromEvent(event, BODY_FALLBACK_FIELD_NAMES);
}

function bodyFromRuntimeTextEvent(
  event: Record<string, unknown>,
  kind: ChatTimelineTextNode['kind']
): string {
  return kind === 'reasoning' ? bodyFromReasoningEvent(event) : bodyFromEvent(event);
}

function nodeKey(
  conversationId: string,
  event: Record<string, unknown>,
  kind: ChatTimelineNodeKind,
  fallback: string
): string {
  const type = normalizeEventType(event.type);
  const runId = toText(event.runId);
  const stableId =
    toText(event.contentId) ||
    toText(event.reasoningId) ||
    toText(event.toolCallId) ||
    toText(event.toolId) ||
    toText(event.planId) ||
    toText(event.taskId) ||
    toText(event.artifactId) ||
    toText(event.awaitingId) ||
    toText(event.requestId) ||
    toText(event.id) ||
    toText(event.name) ||
    toText(event.title) ||
    fallback ||
    type;
  return `${kind}:${conversationId}:${runId || 'run'}:${stableId}`;
}

function systemErrorStableId(event: Record<string, unknown>, updatedAt: number): string {
  return (
    toText(event.errorId) ||
    toText(event.requestId) ||
    toText(event.id) ||
    toText(event.timestamp || event.ts || event.time || event.updatedAt || event.createdAt) ||
    toText(event.runId) ||
    String(updatedAt)
  );
}

function systemErrorNodeKey(conversationId: string, stableId: string): string {
  return `message:${conversationId}:system-error:${stableId}`;
}

function shouldCreateSystemErrorNode(type: string, event: Record<string, unknown>): boolean {
  return type === 'run.error' && event.error !== undefined && event.error !== null && event.error !== '';
}

function reasoningStableId(event: Record<string, unknown>): string {
  return toText(event.contentId) || toText(event.reasoningId);
}

function reasoningRunNodeKeyForRun(conversationId: string, runId: string): string {
  return `reasoning:${conversationId}:${runId || 'run'}:reasoning`;
}

function reasoningNodeKeyForRun(conversationId: string, runId: string, stableId: string): string {
  return `reasoning:${conversationId}:${runId || 'run'}:${stableId || 'reasoning'}`;
}

function nextReasoningNodeKeyForRun(
  state: ChatTimelineState,
  conversationId: string,
  runId: string
): string {
  let order = Math.max(state.nextOrder, state.orderedNodeIds.length);
  let nodeId = reasoningNodeKeyForRun(conversationId, runId, `reasoning-${order}`);
  while (state.nodesById[nodeId]) {
    order += 1;
    nodeId = reasoningNodeKeyForRun(conversationId, runId, `reasoning-${order}`);
  }
  return nodeId;
}

function isActiveReasoningNode(node: ChatTimelineNode | undefined): node is ChatTimelineTextNode {
  return Boolean(
    node?.kind === 'reasoning' &&
      isActiveTimelineNode(node)
  );
}

function canUseReasoningNodeForLifecycle(
  node: ChatTimelineNode | undefined,
  lifecycle: ChatTimelineLifecycle,
  allowTerminal: boolean
): node is ChatTimelineTextNode {
  return Boolean(
    node?.kind === 'reasoning' &&
      (allowTerminal || lifecycle !== 'active' || isActiveReasoningNode(node))
  );
}

function mergeActiveReasoningNodeIdsByRun(
  orderedNodeIds: readonly string[],
  nodesById: Readonly<Record<string, ChatTimelineNode>>,
  incomingState: ChatTimelineState,
  currentState: ChatTimelineState
): Record<string, string> {
  const activeReasoningNodeIdsByRun = buildActiveReasoningNodeIdsByRun(orderedNodeIds, nodesById);
  const terminalIncomingReasoningRunKeys = getTerminalIncomingReasoningRunKeys(incomingState);
  terminalIncomingReasoningRunKeys.forEach((runKey) => {
    delete activeReasoningNodeIdsByRun[runKey];
  });
  copyActiveReasoningNodeIdsByRun(
    activeReasoningNodeIdsByRun,
    incomingState.activeReasoningNodeIdsByRun,
    nodesById
  );
  copyPreservedReasoningNodeIdsByRun(
    activeReasoningNodeIdsByRun,
    currentState.activeReasoningNodeIdsByRun,
    currentState.nodesById,
    nodesById
  );
  terminalIncomingReasoningRunKeys.forEach((runKey) => {
    delete activeReasoningNodeIdsByRun[runKey];
  });
  return activeReasoningNodeIdsByRun;
}

function getTerminalIncomingReasoningRunKeys(state: ChatTimelineState): Set<string> {
  const runKeys = new Set<string>();
  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (node?.kind !== 'reasoning' || isActiveTimelineNode(node)) {
      continue;
    }
    const runKey = activeReasoningRunKey(node.runId);
    if (state.activeReasoningNodeIdsByRun[runKey] !== nodeId) {
      runKeys.add(runKey);
    }
  }
  return runKeys;
}

function isActiveReasoningStatusOnlyNode(node: ChatTimelineNode | undefined): node is ChatTimelineTextNode {
  return Boolean(
    node?.kind === 'reasoning' &&
      isActiveTimelineNode(node) &&
      !node.body.trim() &&
      String(node.title || '').trim()
  );
}

function pushUniqueReasoningRunId(runIds: string[], value: unknown) {
  const runId = toText(value);
  if (!runIds.includes(runId)) {
    runIds.push(runId);
  }
}

function reasoningRunIdCandidates(
  state: ChatTimelineState,
  event: Record<string, unknown>
): string[] {
  const runIds: string[] = [];
  pushUniqueReasoningRunId(runIds, resolveEventRunId(event, state));
  pushUniqueReasoningRunId(runIds, event.runId);
  pushUniqueReasoningRunId(runIds, state.activeRunId);
  pushUniqueReasoningRunId(runIds, '');
  return runIds;
}

function findReasoningNodeIdByKeyCandidates(
  state: ChatTimelineState,
  conversationId: string,
  stableId: string,
  runIds: readonly string[],
  lifecycle: ChatTimelineLifecycle
): string {
  for (const runId of runIds) {
    const nodeId = reasoningNodeKeyForRun(conversationId, runId, stableId);
    if (canUseReasoningNodeForLifecycle(state.nodesById[nodeId], lifecycle, Boolean(stableId))) {
      return nodeId;
    }
  }

  if (stableId) {
    for (const runId of runIds) {
      const nodeId = getActiveReasoningNodeIdForRun(state, runId);
      if (nodeId) {
        return nodeId;
      }
    }

    for (const runId of runIds) {
      const nodeId = reasoningRunNodeKeyForRun(conversationId, runId);
      if (canUseReasoningNodeForLifecycle(state.nodesById[nodeId], lifecycle, false)) {
        return nodeId;
      }
    }
  }

  return '';
}

function findSingleActiveReasoningNodeId(state: ChatTimelineState): string {
  let activeNodeId = '';
  const seenNodeIds = new Set<string>();

  for (const nodeId of Object.values(state.activeReasoningNodeIdsByRun)) {
    if (seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);

    if (state.nodesById[nodeId]?.kind !== 'reasoning') {
      continue;
    }
    if (activeNodeId) {
      return '';
    }
    activeNodeId = nodeId;
  }

  return activeNodeId;
}

function fallbackReasoningNodeId(
  state: ChatTimelineState,
  conversationId: string,
  runId: string,
  stableId: string
): string {
  const nodeId = reasoningNodeKeyForRun(conversationId, runId, stableId);
  return !stableId && state.nodesById[nodeId]?.kind === 'reasoning'
    ? nextReasoningNodeKeyForRun(state, conversationId, runId)
    : nodeId;
}

function findReasoningNodeIdForEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>,
  eventBody: string,
  lifecycle: ChatTimelineLifecycle
): string {
  const stableId = reasoningStableId(event);
  const runIds = reasoningRunIdCandidates(state, event);
  const keyedNodeId = findReasoningNodeIdByKeyCandidates(
    state,
    conversationId,
    stableId,
    runIds,
    lifecycle
  );
  if (keyedNodeId) {
    return keyedNodeId;
  }

  const runId = runIds[0] ?? '';
  const body = eventBody.trim();
  if (!stableId) {
    const activeReasoningNodeId = getActiveReasoningNodeIdForRun(state, runId);
    if (activeReasoningNodeId) {
      return activeReasoningNodeId;
    }
    if (!runId) {
      const singleActiveReasoningNodeId = findSingleActiveReasoningNodeId(state);
      if (singleActiveReasoningNodeId) {
        return singleActiveReasoningNodeId;
      }
    }
  }

  if (!runId || !body) {
    return fallbackReasoningNodeId(state, conversationId, runId, stableId);
  }

  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const nodeId = state.orderedNodeIds[index];
    const node = state.nodesById[nodeId];
    if (node?.kind === 'reasoning' && node.runId === runId && node.body.trim() === body) {
      return nodeId;
    }
    if (isActiveReasoningStatusOnlyNode(node) && node.runId === runId) {
      return nodeId;
    }
  }

  return fallbackReasoningNodeId(state, conversationId, runId, stableId);
}

function reasoningTitleForEvent(
  event: Record<string, unknown>,
  lifecycle: ChatTimelineLifecycle,
  current?: ChatTimelineTextNode
): string {
  if (lifecycle !== 'active') {
    return '';
  }
  return (
    toText(event.reasoningLabel) ||
    toText(event.title || event.name) ||
    current?.title ||
    ''
  );
}

function contentNodeKey(conversationId: string, event: Record<string, unknown>): string {
  return `message:${conversationId}:local:${buildAssistantMessageId(conversationId, event)}`;
}

function contentNodeFallbackKey(conversationId: string, event: Record<string, unknown>): string {
  return `message:${conversationId}:local:${buildFallbackAssistantMessageId(
    conversationId,
    event.runId
  )}`;
}

function toolNodeKey(conversationId: string, event: Record<string, unknown>): string {
  const stableId =
    toText(event.toolCallId) || toText(event.toolId) || toText(event.id) || toText(event.requestId);
  if (stableId) {
    return `tool:${conversationId}:${stableId}`;
  }
  return nodeKey(conversationId, event, 'tool', 'tool');
}

function requestNodeKey(conversationId: string, event: Record<string, unknown>): string {
  const requestId = toText(event.requestId) || toText(event.messageId) || 'request';
  return `message:${conversationId}:request:${requestId}`;
}

function signaturePart(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return `${text.length}:${text}`;
}

function referencesSignature(input: unknown): string {
  const references = normalizeChatAttachmentReferences(input);
  if (references.length === 0) {
    return '';
  }

  return references
    .map((reference) =>
      [
        signaturePart(reference.sha256),
        signaturePart(reference.url),
        signaturePart(reference.id),
        signaturePart(reference.name),
        signaturePart(reference.mimeType),
        signaturePart(reference.sizeBytes),
      ].join('|')
    )
    .join('||');
}

function messageAttachmentReferencesSignature(node: ChatTimelineMessageNode): string {
  if (node.attachments.length === 0) {
    return '';
  }

  const references = node.attachments.flatMap((attachment) =>
    attachment.references.length > 0
      ? attachment.references
      : [
          {
            id: attachment.attachmentId,
            name: attachment.name,
            mimeType: attachment.mimeType ?? undefined,
            sizeBytes: attachment.sizeBytes,
            url: attachment.resourceUrl ?? undefined,
            sha256: attachment.sha256 ?? undefined,
          },
        ]
  );
  return referencesSignature(references);
}

function requestEchoSignature(content: string, attachmentSignature: string): string {
  const normalizedContent = String(content || '').trim();
  if (!normalizedContent && !attachmentSignature) {
    return '';
  }
  return `${signaturePart(normalizedContent)}#${attachmentSignature}`;
}

function messageNodeRequestEchoSignature(node: ChatTimelineMessageNode): string {
  return requestEchoSignature(node.content, messageAttachmentReferencesSignature(node));
}

function isLocalUserMessageWithoutServerId(
  node: ChatTimelineNode | undefined
): node is ChatTimelineMessageNode {
  return Boolean(
    node?.kind === 'message' &&
      node.role === 'user' &&
      node.clientMessageId &&
      !node.serverMessageId
  );
}

function isRemoteUserRequestEchoNode(
  node: ChatTimelineNode | undefined
): node is ChatTimelineMessageNode {
  return Boolean(
    node?.kind === 'message' &&
      node.role === 'user' &&
      !node.clientMessageId &&
      !node.serverMessageId &&
      (node.id.includes(':request:') || node.messageId.startsWith('remote:user:'))
  );
}

function isWithinRequestEchoWindow(left: number, right: number): boolean {
  return Math.abs(left - right) <= REQUEST_ECHO_MATCH_WINDOW_MS;
}

function findLocalUserMessageNodeByRequestId(
  state: ChatTimelineState,
  requestId: string
): ChatTimelineMessageNode | undefined {
  if (!requestId) {
    return undefined;
  }

  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (
      node?.kind === 'message' &&
      node.role === 'user' &&
      (node.clientMessageId === requestId || node.messageId === requestId)
    ) {
      return node;
    }
  }

  return undefined;
}

function findLocalUserMessageNodeByRequestEcho(
  state: ChatTimelineState,
  content: string,
  attachmentSignature: string,
  createdAt: number
): ChatTimelineMessageNode | undefined {
  const signature = requestEchoSignature(content, attachmentSignature);
  if (!signature) {
    return undefined;
  }

  let candidate: ChatTimelineMessageNode | undefined;
  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (
      !isLocalUserMessageWithoutServerId(node) ||
      !isWithinRequestEchoWindow(node.createdAt, createdAt) ||
      messageNodeRequestEchoSignature(node) !== signature
    ) {
      continue;
    }

    if (candidate) {
      return undefined;
    }
    candidate = node;
  }

  return candidate;
}

function findMessageNodeIdByIdentity(
  state: ChatTimelineState,
  identity: {
    messageId?: string | null;
    serverMessageId?: string | null;
    clientMessageId?: string | null;
  }
): string {
  const messageId = toText(identity.messageId);
  const serverMessageId = toText(identity.serverMessageId);
  const clientMessageId = toText(identity.clientMessageId);
  if (!messageId && !serverMessageId && !clientMessageId) {
    return '';
  }

  const matches = (node: ChatTimelineNode | undefined) =>
    node?.kind === 'message' &&
    ((messageId && node.messageId === messageId) ||
      (serverMessageId && node.serverMessageId === serverMessageId) ||
      (clientMessageId && node.clientMessageId === clientMessageId));

  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const nodeId = state.orderedNodeIds[index];
    if (matches(state.nodesById[nodeId])) {
      return nodeId;
    }
  }

  return '';
}

function getAwaitingInteractionNodeSignature(node: ChatTimelineAwaitingNode): string {
  return getAwaitingInteractiveSignature(node.interactive);
}

function getAwaitingTimeout(node: ChatTimelineAwaitingNode): number | null {
  return getAwaitingInteractiveTimeout(node.interactive);
}

function getAwaitingDeadline(node: ChatTimelineAwaitingNode): number | null {
  const timeout = getAwaitingTimeout(node);
  if (!timeout || !Number.isFinite(node.createdAt)) {
    return null;
  }
  return node.createdAt + timeout;
}

function getAwaitingIdentityMatch(
  current: ChatTimelineAwaitingNode,
  incoming: ChatTimelineAwaitingNode
): { matches: boolean; interactionSignatureChanged: boolean } {
  if (current.runId && incoming.runId && current.runId !== incoming.runId) {
    return { matches: false, interactionSignatureChanged: false };
  }
  if (current.awaitingId && incoming.awaitingId && current.awaitingId !== incoming.awaitingId) {
    return { matches: false, interactionSignatureChanged: false };
  }
  if (current.mode !== incoming.mode) {
    return { matches: false, interactionSignatureChanged: false };
  }

  const currentInteractionSignature = getAwaitingInteractionNodeSignature(current);
  const incomingInteractionSignature = getAwaitingInteractionNodeSignature(incoming);
  const sameInteractionSignature = Boolean(
    currentInteractionSignature &&
      incomingInteractionSignature &&
      currentInteractionSignature === incomingInteractionSignature
  );

  return {
    matches: Boolean(
      (current.awaitingId && incoming.awaitingId && current.awaitingId === incoming.awaitingId) ||
        current.id === incoming.id ||
        sameInteractionSignature
    ),
    interactionSignatureChanged: Boolean(
      currentInteractionSignature && incomingInteractionSignature && !sameInteractionSignature
    ),
  };
}

function shouldPreferCurrentAwaitingNode(
  current: ChatTimelineAwaitingNode,
  incoming: ChatTimelineAwaitingNode
): boolean {
  const identityMatch = getAwaitingIdentityMatch(current, incoming);
  if (
    current.status !== 'ask' ||
    incoming.status !== 'ask' ||
    current.lifecycle !== 'active' ||
    incoming.lifecycle !== 'active' ||
    !identityMatch.matches
  ) {
    return false;
  }

  if (identityMatch.interactionSignatureChanged) {
    return current.updatedAt > incoming.updatedAt;
  }

  const currentDeadline = getAwaitingDeadline(current);
  const incomingDeadline = getAwaitingDeadline(incoming);
  if (currentDeadline !== null || incomingDeadline !== null) {
    if (currentDeadline === null) {
      return false;
    }
    if (incomingDeadline === null) {
      return true;
    }
    if (currentDeadline !== incomingDeadline) {
      return currentDeadline > incomingDeadline;
    }
  }

  return current.updatedAt >= incoming.updatedAt;
}

function getStateAwaitingNode(state: ChatTimelineState): ChatTimelineAwaitingNode | undefined {
  const node = state.awaiting ? state.nodesById[state.awaiting.id] : undefined;
  return node?.kind === 'awaiting' ? node : undefined;
}

function awaitingStateFromNode(node: ChatTimelineAwaitingNode): ChatTimelineAwaitingState {
  return {
    id: node.id,
    awaitingId: node.awaitingId,
    runId: node.runId,
    createdAt: node.createdAt,
    prompt: node.prompt,
    answer: node.answer,
    payloadText: node.payloadText,
    mode: node.mode,
    status: node.status,
    interactive: node.interactive,
    answerSummary: node.answerSummary ?? null,
    updatedAt: node.updatedAt,
  };
}

function getTimelineNodeIdentityKeys(node: ChatTimelineNode): string[] {
  const keys = [`id:${node.id}`];
  if (node.kind === 'message') {
    if (node.messageId) {
      keys.push(`message:${node.messageId}`);
    }
    if (node.serverMessageId) {
      keys.push(`server:${node.serverMessageId}`);
    }
    if (node.clientMessageId) {
      keys.push(`client:${node.clientMessageId}`);
    }
  }
  if (node.kind === 'awaiting') {
    if (node.awaitingId) {
      keys.push(`awaiting:${node.runId || 'run'}:${node.awaitingId}`);
      keys.push(`awaiting:${node.awaitingId}`);
    }
    const interactionSignature = getAwaitingInteractionNodeSignature(node);
    if (interactionSignature) {
      keys.push(`awaiting-interaction:${node.runId || 'run'}:${interactionSignature}`);
      keys.push(`awaiting-interaction:${interactionSignature}`);
    }
  }
  return keys;
}

function buildTimelineNodeIdentityIndex(state: ChatTimelineState): Map<string, string> {
  const index = new Map<string, string>();
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (!node) {
      return;
    }
    getTimelineNodeIdentityKeys(node).forEach((key) => {
      if (!index.has(key)) {
        index.set(key, nodeId);
      }
    });
  });
  return index;
}

function buildTimelineUserRequestEchoIndex(
  state: ChatTimelineState,
  shouldIndexNode: (node: ChatTimelineMessageNode) => boolean = () => true
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (node?.kind !== 'message' || node.role !== 'user' || !shouldIndexNode(node)) {
      return;
    }
    const signature = messageNodeRequestEchoSignature(node);
    if (!signature) {
      return;
    }
    const nodeIds = index.get(signature);
    if (nodeIds) {
      nodeIds.push(nodeId);
      return;
    }
    index.set(signature, [nodeId]);
  });
  return index;
}

function findRequestEchoTimelineNodeId(
  state: ChatTimelineState,
  index: ReadonlyMap<string, readonly string[]>,
  node: ChatTimelineNode,
  consumedNodeIds?: ReadonlySet<string>
): string {
  if (node.kind !== 'message' || node.role !== 'user') {
    return '';
  }

  const signature = messageNodeRequestEchoSignature(node);
  const nodeIds = signature ? index.get(signature) : undefined;
  if (!nodeIds?.length) {
    return '';
  }

  let matchedNodeId = '';
  let matchedDistance = Number.POSITIVE_INFINITY;
  let matchedOrder = Number.POSITIVE_INFINITY;
  for (const nodeId of nodeIds) {
    if (consumedNodeIds?.has(nodeId)) {
      continue;
    }

    const candidate = state.nodesById[nodeId];
    if (
      candidate?.kind !== 'message' ||
      candidate.role !== 'user' ||
      !isWithinRequestEchoWindow(node.createdAt, candidate.createdAt)
    ) {
      continue;
    }

    const distance = Math.abs(node.createdAt - candidate.createdAt);
    if (
      !matchedNodeId ||
      distance < matchedDistance ||
      (distance === matchedDistance && candidate.order < matchedOrder)
    ) {
      matchedNodeId = nodeId;
      matchedDistance = distance;
      matchedOrder = candidate.order;
    }
  }

  return matchedNodeId;
}

function findMatchingTimelineNodeId(
  index: ReadonlyMap<string, string>,
  node: ChatTimelineNode
): string {
  for (const key of getTimelineNodeIdentityKeys(node)) {
    const nodeId = index.get(key);
    if (nodeId) {
      return nodeId;
    }
  }
  return '';
}

function findSingletonActiveAssistantContentNode(
  state: ChatTimelineState,
  runId: string
): ChatTimelineMessageNode | undefined {
  let candidate: ChatTimelineMessageNode | undefined;

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (
      node?.kind !== 'message' ||
      node.role !== 'assistant' ||
      node.runId !== runId ||
      !isActiveTimelineNode(node)
    ) {
      continue;
    }

    if (candidate) {
      return undefined;
    }
    candidate = node;
  }

  return candidate;
}

function findContentMessageNode(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineMessageNode | undefined {
  const direct = state.nodesById[contentNodeKey(conversationId, event)];
  if (direct?.kind === 'message' && direct.role === 'assistant') {
    return direct;
  }

  const identityMatchId = findMessageNodeIdByIdentity(state, {
    messageId: buildAssistantMessageId(conversationId, event),
    serverMessageId: toText(event.serverMessageId),
  });
  const identityMatch = identityMatchId ? state.nodesById[identityMatchId] : undefined;
  if (identityMatch?.kind === 'message' && identityMatch.role === 'assistant') {
    return identityMatch;
  }

  const fallback = state.nodesById[contentNodeFallbackKey(conversationId, event)];
  if (fallback?.kind === 'message' && fallback.role === 'assistant') {
    return fallback;
  }

  const runId = toText(event.runId);
  return runId ? findSingletonActiveAssistantContentNode(state, runId) : undefined;
}

function getTimelineNodeContentLength(node: ChatTimelineNode): number {
  if (node.kind === 'message') {
    const attachments = node.attachments || [];
    return (
      node.content.length +
      getChatTimelineErrorDetailSignature(node.errorDetail).length +
      attachments.reduce((total, attachment) => total + attachment.name.length, 0)
    );
  }
  if (node.kind === 'tool') {
    return (
      node.title.length +
      node.body.length +
      node.argsText.length +
      node.resultText.length +
      node.status.length
    );
  }
  if (node.kind === 'awaiting') {
    return (
      node.prompt.length +
      node.payloadText.length +
      node.answer.length +
      getAwaitingInteractiveSignature(node.interactive).length +
      getAwaitingAnswerSummarySignature(node.answerSummary).length
    );
  }
  if (node.kind === 'run') {
    return node.title.length + node.body.length + node.status.length;
  }
  if (node.kind === 'source') {
    return getChatTimelineSourceContentLength(node);
  }
  if (node.kind === 'artifact') {
    return getChatTimelineArtifactContentLength(node);
  }
  return node.title.length + node.body.length + node.status.length;
}

function isActiveTimelineNode(node: ChatTimelineNode): boolean {
  return node.lifecycle === 'active' || ('streaming' in node && Boolean(node.streaming));
}

function isTerminalRunNode(node: ChatTimelineNode | undefined, runId: string): boolean {
  return Boolean(
    runId &&
      node?.kind === 'run' &&
      node.runId === runId &&
      node.lifecycle !== 'active'
  );
}

function isTerminalTimelineNodeForRun(
  node: ChatTimelineNode | undefined,
  runId: string
): boolean {
  return Boolean(runId && node?.runId === runId && !isActiveTimelineNode(node));
}

function closeTimelineNodeForLocalStop(node: ChatTimelineNode, updatedAt: number): ChatTimelineNode {
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);
  if (node.kind === 'run') {
    return {
      ...node,
      status: 'cancelled',
      lifecycle: 'cancelled',
      updatedAt: nextUpdatedAt,
    };
  }
  return closeTimelineNodeForRun(node, 'cancelled', updatedAt);
}

function hasIncomingMessageAtOrAfter(
  incomingState: ChatTimelineState,
  current: ChatTimelineMessageNode
): boolean {
  return incomingState.orderedNodeIds.some((nodeId) => {
    const node = incomingState.nodesById[nodeId];
    return (
      node?.kind === 'message' &&
      node.role === current.role &&
      node.createdAt >= current.createdAt &&
      node.content.trim().length > 0
    );
  });
}

function shouldPreferCurrentTimelineNode(
  current: ChatTimelineNode,
  incoming: ChatTimelineNode
): boolean {
  if (current.kind !== incoming.kind) {
    return false;
  }

  if (current.kind === 'awaiting' && incoming.kind === 'awaiting') {
    return shouldPreferCurrentAwaitingNode(current, incoming);
  }
  if (current.kind === 'source' && incoming.kind === 'source') {
    return current.updatedAt > incoming.updatedAt;
  }
  if (current.kind === 'artifact' && incoming.kind === 'artifact') {
    return current.updatedAt > incoming.updatedAt;
  }

  const currentLength = getTimelineNodeContentLength(current);
  const incomingLength = getTimelineNodeContentLength(incoming);
  if (currentLength > incomingLength) {
    return true;
  }

  if (current.kind === 'message' && incoming.kind === 'message') {
    const currentIsLocalWithoutServer = isLocalUserMessageWithoutServerId(current);
    if (currentIsLocalWithoutServer && isRemoteUserRequestEchoNode(incoming)) {
      return true;
    }

    if (
      currentIsLocalWithoutServer &&
      current.deliveryStatus !== 'sent' &&
      !incoming.serverMessageId
    ) {
      return true;
    }
  }

  return (
    isActiveTimelineNode(current) &&
    isActiveTimelineNode(incoming) &&
    current.updatedAt >= incoming.updatedAt
  );
}

function shouldPreserveUnmatchedTimelineNode(
  current: ChatTimelineNode,
  incomingState: ChatTimelineState
): boolean {
  if (current.kind === 'awaiting' && isActiveTimelineNode(current)) {
    const incomingAwaiting = getStateAwaitingNode(incomingState);
    if (!incomingAwaiting) {
      return true;
    }
    return (
      current.updatedAt > incomingAwaiting.updatedAt ||
      shouldPreferCurrentAwaitingNode(current, incomingAwaiting)
    );
  }

  if (isActiveTimelineNode(current)) {
    return true;
  }

  if (current.kind !== 'message') {
    return false;
  }

  if (current.deliveryStatus !== 'sent' && current.clientMessageId && !current.serverMessageId) {
    return true;
  }

  if (!current.content.trim()) {
    return false;
  }

  if (hasIncomingMessageAtOrAfter(incomingState, current)) {
    return false;
  }

  return current.role === 'assistant' || current.updatedAt >= incomingState.updatedAt;
}

function hasActiveRunNode(
  nodeIds: readonly string[],
  nodesById: Readonly<Record<string, ChatTimelineNode>>,
  runId: string
): boolean {
  if (!runId) {
    return false;
  }
  return nodeIds.some((nodeId) => {
    const node = nodesById[nodeId];
    return node?.runId === runId && isActiveTimelineNode(node);
  });
}

function findLatestActiveTimelineRunId(state: ChatTimelineState): string {
  for (let index = state.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = state.nodesById[state.orderedNodeIds[index]];
    if (!node || !isActiveTimelineNode(node) || !node.runId) {
      continue;
    }
    return node.runId;
  }
  return '';
}

function hasTerminalRunNode(state: ChatTimelineState, runId: string): boolean {
  if (!runId) {
    return false;
  }
  return state.orderedNodeIds.some((nodeId) => isTerminalRunNode(state.nodesById[nodeId], runId));
}

function hasTerminalTimelineNodeForRun(state: ChatTimelineState, runId: string): boolean {
  if (!runId) {
    return false;
  }
  return state.orderedNodeIds.some((nodeId) =>
    isTerminalTimelineNodeForRun(state.nodesById[nodeId], runId)
  );
}

function getTerminalRunUpdatedAt(state: ChatTimelineState, runId: string): number {
  let updatedAt = 0;
  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (isTerminalTimelineNodeForRun(node, runId)) {
      updatedAt = Math.max(updatedAt, node.updatedAt);
    }
  });
  return updatedAt || state.updatedAt;
}

function buildProtectedTerminalRunIds(
  currentState: ChatTimelineState,
  incomingState: ChatTimelineState,
  options: MergeChatTimelineStateOptions | undefined
): Set<string> | null {
  const runIds = options?.preserveTerminalRunIds;
  if (!runIds?.length) {
    return null;
  }

  let protectedRunIds: Set<string> | null = null;
  runIds.forEach((runIdInput) => {
    const runId = toText(runIdInput);
    if (
      runId &&
      (hasTerminalTimelineNodeForRun(currentState, runId) ||
        !hasActiveRunNode(currentState.orderedNodeIds, currentState.nodesById, runId)) &&
      !hasTerminalRunNode(incomingState, runId)
    ) {
      protectedRunIds ??= new Set<string>();
      protectedRunIds.add(runId);
    }
  });
  return protectedRunIds;
}

function shouldPreserveProtectedTerminalNode(
  current: ChatTimelineNode,
  incoming: ChatTimelineNode | undefined,
  protectedRunIds: ReadonlySet<string> | null
): boolean {
  return Boolean(
    current.runId &&
      protectedRunIds?.has(current.runId) &&
      !isActiveTimelineNode(current) &&
      (!incoming || isActiveTimelineNode(incoming))
  );
}

function resolveMergedAwaiting(
  nodesById: Readonly<Record<string, ChatTimelineNode>>,
  incomingState: ChatTimelineState,
  currentState: ChatTimelineState
): ChatTimelineState['awaiting'] {
  const incomingNode = incomingState.awaiting
    ? nodesById[incomingState.awaiting.id]
    : undefined;
  const currentNode = currentState.awaiting ? nodesById[currentState.awaiting.id] : undefined;

  if (incomingNode?.kind === 'awaiting' && currentNode?.kind === 'awaiting') {
    return awaitingStateFromNode(
      shouldPreferCurrentAwaitingNode(currentNode, incomingNode) ? currentNode : incomingNode
    );
  }
  if (incomingNode?.kind === 'awaiting') {
    return awaitingStateFromNode(incomingNode);
  }
  if (currentNode?.kind === 'awaiting') {
    return awaitingStateFromNode(currentNode);
  }
  return null;
}

function didNodeChange(left: ChatTimelineNode | undefined, right: ChatTimelineNode): boolean {
  if (!left) {
    return true;
  }
  if (
    left.kind !== right.kind ||
    left.runId !== right.runId ||
    left.createdAt !== right.createdAt ||
    left.updatedAt !== right.updatedAt ||
    left.order !== right.order ||
    left.lifecycle !== right.lifecycle
  ) {
    return true;
  }
  if (left.kind === 'message' && right.kind === 'message') {
    return (
      left.role !== right.role ||
      left.content !== right.content ||
      left.messageId !== right.messageId ||
      left.clientMessageId !== right.clientMessageId ||
      left.serverMessageId !== right.serverMessageId ||
      left.deliveryStatus !== right.deliveryStatus ||
      left.errorReason !== right.errorReason ||
      getChatTimelineErrorDetailSignature(left.errorDetail) !==
        getChatTimelineErrorDetailSignature(right.errorDetail) ||
      left.streaming !== right.streaming ||
      !areChatAttachmentsEqual(left.attachments, right.attachments)
    );
  }
  if (left.kind === 'tool' && right.kind === 'tool') {
    return (
      left.agentKey !== right.agentKey ||
      left.toolId !== right.toolId ||
      left.toolName !== right.toolName ||
      left.toolLabel !== right.toolLabel ||
      left.toolType !== right.toolType ||
      left.viewportKey !== right.viewportKey ||
      left.toolTimeoutMs !== right.toolTimeoutMs ||
      (left.toolParams !== right.toolParams &&
        safeJson(left.toolParams) !== safeJson(right.toolParams)) ||
      (left.frontendToolState !== right.frontendToolState &&
        safeJson(left.frontendToolState) !== safeJson(right.frontendToolState)) ||
      left.description !== right.description ||
      left.title !== right.title ||
      left.status !== right.status ||
      left.argsText !== right.argsText ||
      left.resultText !== right.resultText ||
      left.body !== right.body ||
      left.streaming !== right.streaming
    );
  }
  if (left.kind === 'awaiting' && right.kind === 'awaiting') {
    return (
      left.prompt !== right.prompt ||
      left.answer !== right.answer ||
      left.payloadText !== right.payloadText ||
      left.mode !== right.mode ||
      left.status !== right.status ||
      getAwaitingInteractiveSignature(left.interactive) !==
        getAwaitingInteractiveSignature(right.interactive) ||
      getAwaitingAnswerSummarySignature(left.answerSummary) !==
        getAwaitingAnswerSummarySignature(right.answerSummary)
    );
  }
  if (left.kind === 'run' && right.kind === 'run') {
    return (
      left.title !== right.title ||
      left.body !== right.body ||
      left.status !== right.status ||
      left.agentKey !== right.agentKey ||
      left.startedAt !== right.startedAt ||
      left.completedAt !== right.completedAt ||
      left.durationMs !== right.durationMs
    );
  }
  if (left.kind === 'source' && right.kind === 'source') {
    return !chatTimelineSourceNodePayloadEquals(left, right);
  }
  if (left.kind === 'artifact' && right.kind === 'artifact') {
    return !chatTimelineArtifactNodePayloadEquals(left, right);
  }
  if (
    left.kind !== 'message' &&
    left.kind !== 'tool' &&
    left.kind !== 'awaiting' &&
    left.kind !== 'run' &&
    left.kind !== 'source' &&
    left.kind !== 'artifact' &&
    right.kind !== 'message' &&
    right.kind !== 'tool' &&
    right.kind !== 'awaiting' &&
    right.kind !== 'run' &&
    right.kind !== 'source' &&
    right.kind !== 'artifact'
  ) {
    return (
      left.title !== right.title ||
      left.body !== right.body ||
      left.status !== right.status ||
      left.streaming !== right.streaming ||
      !chatTimelineUsageSummaryEquals(left.usageSummary ?? null, right.usageSummary ?? null)
    );
  }
  return true;
}

function replaceTimelineNodes(
  state: ChatTimelineState,
  nodesById: ChatTimelineState['nodesById'],
  updatedAt: number
): ChatTimelineState {
  return {
    ...state,
    nodesById,
    updatedAt,
    revision: state.revision + 1,
  };
}

function upsertNode(state: ChatTimelineState, node: ChatTimelineNode): ChatTimelineState {
  const current = state.nodesById[node.id];
  if (!didNodeChange(current, node)) {
    return state;
  }

  const orderedNodeIds = current ? state.orderedNodeIds : [...state.orderedNodeIds, node.id];
  return {
    ...state,
    orderedNodeIds,
    nodesById: {
      ...state.nodesById,
      [node.id]: node,
    },
    updatedAt: Math.max(state.updatedAt, node.updatedAt),
    revision: state.revision + 1,
    nextOrder: current ? state.nextOrder : state.nextOrder + 1,
  };
}

function isStreamingTimelineNode(node: ChatTimelineNode): boolean {
  return 'streaming' in node && node.streaming;
}

function terminalStatusFromLifecycle(
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>
): ChatTimelineRuntimeStatus {
  switch (lifecycle) {
    case 'error':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    case 'complete':
    default:
      return 'completed';
  }
}

function closeTimelineNodeForRun(
  node: ChatTimelineNode,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineNode {
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);

  if (node.kind === 'message') {
    return {
      ...node,
      streaming: false,
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  if (node.kind === 'tool') {
    return {
      ...node,
      status: terminalStatusFromLifecycle(lifecycle),
      streaming: false,
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  if (node.kind === 'awaiting') {
    return {
      ...node,
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  if (node.kind === 'run') {
    return node;
  }

  if (node.kind === 'source') {
    return node;
  }

  if (node.kind === 'artifact') {
    return {
      ...node,
      status: lifecycle === 'complete' ? 'ready' : 'failed',
      lifecycle,
      updatedAt: nextUpdatedAt,
    };
  }

  const nextNode = {
    ...node,
    title: node.kind === 'reasoning' ? '' : node.title,
    status: terminalStatusFromLifecycle(lifecycle),
    streaming: false,
    lifecycle,
    updatedAt: nextUpdatedAt,
  };
  return nextNode;
}

function closeActiveReasoningNode(
  node: ChatTimelineTextNode,
  updatedAt: number
): ChatTimelineTextNode {
  const nextUpdatedAt = Math.max(node.updatedAt, updatedAt);
  return {
    ...node,
    title: '',
    status: terminalStatusFromLifecycle('complete'),
    streaming: false,
    lifecycle: 'complete',
    updatedAt: nextUpdatedAt,
  };
}

function closeActiveReasoningNodesForRun(
  state: ChatTimelineState,
  runIdInput: string,
  updatedAt: number
): ChatTimelineState {
  const runId = toText(runIdInput);
  let nextNodesById: ChatTimelineState['nodesById'] | null = null;
  let nextUpdatedAt = state.updatedAt;

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (
      node?.kind !== 'reasoning' ||
      (runId ? node.runId !== runId : Boolean(node.runId)) ||
      !isActiveTimelineNode(node)
    ) {
      continue;
    }

    const nextNode = closeActiveReasoningNode(node, updatedAt);
    if (!didNodeChange(node, nextNode)) {
      continue;
    }

    if (!nextNodesById) {
      nextNodesById = { ...state.nodesById };
    }
    nextNodesById[nodeId] = nextNode;
    nextUpdatedAt = Math.max(nextUpdatedAt, nextNode.updatedAt);
  }

  if (!nextNodesById) {
    return state;
  }

  return replaceTimelineNodes(state, nextNodesById, nextUpdatedAt);
}

function isDuplicateAwaitingAsk(
  state: ChatTimelineState,
  current: ChatTimelineAwaitingNode | undefined,
  awaiting: {
    id: string;
    awaitingId: string;
    runId: string;
    prompt: string;
    payloadText: string;
    mode: ChatTimelineAwaitingMode;
    status: 'ask' | 'answer';
    interactive: ChatTimelineAwaitingInteractive | null;
  }
): boolean {
  return (
    awaiting.status === 'ask' &&
    current?.status === 'ask' &&
    current.id === awaiting.id &&
    current.awaitingId === awaiting.awaitingId &&
    current.runId === awaiting.runId &&
    current.prompt === awaiting.prompt &&
    current.payloadText === awaiting.payloadText &&
    current.mode === awaiting.mode &&
    getAwaitingInteractiveSignature(current.interactive) ===
      getAwaitingInteractiveSignature(awaiting.interactive) &&
    state.awaiting?.id === awaiting.id &&
    state.awaiting.awaitingId === awaiting.awaitingId &&
    state.awaiting.runId === awaiting.runId &&
    state.awaiting.prompt === awaiting.prompt &&
    state.awaiting.payloadText === awaiting.payloadText &&
    state.awaiting.mode === awaiting.mode &&
    state.awaiting.status === awaiting.status &&
    getAwaitingInteractiveSignature(state.awaiting.interactive) ===
      getAwaitingInteractiveSignature(awaiting.interactive)
  );
}

function closeActiveNodesForRun(
  state: ChatTimelineState,
  runId: string,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineState {
  if (!runId) {
    return state;
  }

  return clearActiveReasoningNodeIdForRun(
    closeActiveTimelineNodes(state, runId, lifecycle, updatedAt),
    runId
  );
}

function closeActiveTimelineNodes(
  state: ChatTimelineState,
  runId: string,
  lifecycle: Exclude<ChatTimelineLifecycle, 'active'>,
  updatedAt: number
): ChatTimelineState {
  let nextNodesById: ChatTimelineState['nodesById'] | null = null;
  let nextUpdatedAt = state.updatedAt;

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (
      !node ||
      node.kind === 'run' ||
      (runId && node.runId !== runId) ||
      (node.lifecycle !== 'active' && !isStreamingTimelineNode(node))
    ) {
      return;
    }

    const nextNode = closeTimelineNodeForRun(node, lifecycle, updatedAt);
    if (!didNodeChange(node, nextNode)) {
      return;
    }

    if (!nextNodesById) {
      nextNodesById = { ...state.nodesById };
    }
    nextNodesById[nodeId] = nextNode;
    nextUpdatedAt = Math.max(nextUpdatedAt, nextNode.updatedAt);
  });

  if (!nextNodesById) {
    return state;
  }

  return replaceTimelineNodes(state, nextNodesById, nextUpdatedAt);
}

function closeActiveTimelineNodesForLocalStop(
  state: ChatTimelineState,
  runId: string,
  updatedAt: number
): ChatTimelineState {
  let nextNodesById: ChatTimelineState['nodesById'] | null = null;
  let nextUpdatedAt = state.updatedAt;

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (
      !node ||
      (runId ? node.runId !== runId : Boolean(node.runId)) ||
      !isActiveTimelineNode(node)
    ) {
      return;
    }

    const nextNode = closeTimelineNodeForLocalStop(node, updatedAt);
    if (!didNodeChange(node, nextNode)) {
      return;
    }

    if (!nextNodesById) {
      nextNodesById = { ...state.nodesById };
    }
    nextNodesById[nodeId] = nextNode;
    nextUpdatedAt = Math.max(nextUpdatedAt, nextNode.updatedAt);
  });

  if (!nextNodesById) {
    return state;
  }

  return replaceTimelineNodes(state, nextNodesById, nextUpdatedAt);
}

export function getChatTimelineActiveRunId(state: ChatTimelineState): string {
  return findLatestActiveTimelineRunId(state) || state.activeRunId;
}

function hasActiveTimelineNodes(state: ChatTimelineState): boolean {
  return state.orderedNodeIds.some((nodeId) => {
    const node = state.nodesById[nodeId];
    return Boolean(node && isActiveTimelineNode(node));
  });
}

function resolveLocalStopRunId(state: ChatTimelineState, requestedRunId: string): string {
  if (requestedRunId && hasActiveRunNode(state.orderedNodeIds, state.nodesById, requestedRunId)) {
    return requestedRunId;
  }
  return findLatestActiveTimelineRunId(state);
}

function clearActiveRunIdForLocalStop(
  state: ChatTimelineState,
  updatedAt: number
): ChatTimelineState {
  if (!state.activeRunId) {
    return state;
  }

  return {
    ...state,
    activeRunId: '',
    updatedAt: Math.max(state.updatedAt, updatedAt),
    revision: state.revision + 1,
  };
}

function appendText(current: string, delta: string, snapshot?: string): string {
  if (snapshot !== undefined) {
    return snapshot || current;
  }
  return delta ? `${current}${delta}` : current;
}

function createOrder(state: ChatTimelineState, current?: ChatTimelineNode): number {
  return current?.order ?? state.nextOrder;
}

function shouldCloseReasoningForAssistantContent(
  current: ChatTimelineMessageNode | undefined,
  role: ChatTimelineMessageNode['role'],
  content: string,
  runId: string
): boolean {
  return (
    role === 'assistant' &&
    Boolean(content) &&
    (!current || !current.content || (Boolean(runId) && current.runId !== runId))
  );
}

export function createChatTimelineState(conversationId: string): ChatTimelineState {
  return {
    conversationId: normalizeConversationId(conversationId),
    orderedNodeIds: [],
    nodesById: {},
    activeRunId: '',
    activeReasoningNodeIdsByRun: {},
    awaiting: null,
    usageLabel: '',
    usageSummary: null,
    updatedAt: 0,
    revision: 0,
    nextOrder: 0,
  };
}

function applyRequestEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const requestId = toText(event.requestId) || toText(event.messageId);
  const id = requestNodeKey(conversationId, event);
  const eventCreatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const content = toText(event.message || event.content || event.text);
  const attachmentSignature = referencesSignature(event.references);
  const current =
    findLocalUserMessageNodeByRequestId(state, toText(event.clientMessageId)) ??
    findLocalUserMessageNodeByRequestId(state, requestId) ??
    findLocalUserMessageNodeByRequestEcho(state, content, attachmentSignature, eventCreatedAt) ??
    (state.nodesById[id] as ChatTimelineMessageNode | undefined);
  const createdAt = current ? resolveTimestamp(event, current.updatedAt) : eventCreatedAt;
  const messageId = current?.messageId ?? `remote:user:${requestId || id}`;
  const attachments = createMessageAttachmentsFromReferences({
    conversationId,
    messageId,
    references: event.references,
    createdAt,
  });
  if (!content && attachments.length === 0) {
    return state;
  }

  return upsertNode(state, {
    id: current?.id ?? id,
    kind: 'message',
    role: 'user',
    content,
    messageId,
    clientMessageId: current?.clientMessageId ?? null,
    serverMessageId: toText(event.serverMessageId) || current?.serverMessageId || null,
    deliveryStatus: 'sent',
    errorReason: null,
    streaming: false,
    attachments: attachments.length > 0 ? attachments : current?.attachments || [],
    runId: toText(event.runId) || current?.runId || '',
    createdAt: current?.createdAt ?? createdAt,
    updatedAt: Math.max(current?.updatedAt ?? 0, createdAt),
    order: createOrder(state, current),
    lifecycle: 'complete',
  });
}

function applyContentEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const lifecycle = resolveLifecycle(type);
  const createdAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const current = findContentMessageNode(state, conversationId, event);
  const runId = resolveEventRunId(event, state, current);
  const id = current?.id ?? contentNodeKey(conversationId, event);
  const messageId = current?.messageId ?? buildAssistantMessageId(conversationId, event);
  const text = extractEventText(event);
  const snapshot =
    type === 'content.snapshot' || type === 'content.end' || type === 'content.start'
      ? text
      : undefined;
  const nextContent = current
    ? appendText(current.content, type === 'content.delta' ? text : '', snapshot)
    : type === 'content.delta'
      ? text
      : text || '';

  if (!nextContent) {
    return state;
  }

  const baseState = current
    ? state
    : closeActiveReasoningNodesForRun(state, runId, createdAt);

  return upsertNode(baseState, {
    id,
    kind: 'message',
    role: 'assistant',
    content: nextContent,
    messageId,
    clientMessageId: null,
    serverMessageId: toText(event.serverMessageId) || current?.serverMessageId || null,
    deliveryStatus: 'sent',
    errorReason: null,
    streaming: lifecycle === 'active',
    attachments: current?.attachments || [],
    runId,
    createdAt: current?.createdAt ?? createdAt,
    updatedAt: Math.max(current?.updatedAt ?? 0, createdAt),
    order: createOrder(baseState, current),
    lifecycle,
  });
}

function applyRuntimeTextEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>,
  kind: ChatTimelineTextNode['kind'],
  usageSummary: ChatTimelineTextNode['usageSummary'] = null
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const eventBody = bodyFromRuntimeTextEvent(event, kind);
  const lifecycle = resolveLifecycle(type);
  const id =
    kind === 'reasoning'
      ? findReasoningNodeIdForEvent(state, conversationId, event, eventBody, lifecycle)
      : nodeKey(conversationId, event, kind, kind);
  const current = state.nodesById[id] as ChatTimelineTextNode | undefined;
  const runId = resolveEventRunId(event, state, current);
  const baseState =
    kind !== 'reasoning' && !current
      ? closeActiveReasoningNodesForRun(state, runId, updatedAt)
      : state;
  const delta = type.endsWith('.delta') ? eventBody : '';
  const snapshot =
    type.endsWith('.snapshot') || type.endsWith('.end') || type.endsWith('.result')
      ? eventBody
      : undefined;
  const body = current ? appendText(current.body, delta, snapshot) : eventBody;
  const suffix = type.split('.').at(-1) || '';
  const title =
    kind === 'reasoning'
      ? reasoningTitleForEvent(event, lifecycle, current)
      : kind === 'planning'
        ? ''
        : kind === 'usage'
          ? ''
          : toText(event.title || event.name) || kind;

  const nextState = upsertNode(baseState, {
    id,
    kind,
    title,
    body,
    status:
      suffix === 'start'
        ? 'generating'
        : lifecycle === 'complete'
          ? 'completed'
          : lifecycle === 'error'
            ? 'error'
            : lifecycle === 'cancelled'
              ? 'cancelled'
              : 'updating',
    streaming: lifecycle === 'active',
    runId,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(baseState, current),
    lifecycle,
    ...(kind === 'usage' ? { usageSummary } : {}),
  });
  if (kind !== 'reasoning') {
    return nextState;
  }
  if (lifecycle === 'active') {
    return setActiveReasoningNodeIdForRun(nextState, runId, id);
  }
  return clearActiveReasoningNodeIdForRun(
    closeActiveReasoningNodesForRun(nextState, runId, updatedAt),
    runId
  );
}

function applyToolEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const id = toolNodeKey(conversationId, event);
  const current = state.nodesById[id] as ChatTimelineToolNode | undefined;
  const lifecycle = resolveLifecycle(type);
  const runId = resolveEventRunId(event, state, current);
  const baseState = current
    ? state
    : closeActiveReasoningNodesForRun(state, runId, updatedAt);
  const toolId = toText(event.toolCallId || event.toolId) || current?.toolId || '';
  const toolName = toText(event.toolName || event.name) || current?.toolName || '';
  const toolLabel = toText(event.toolLabel || event.title) || current?.toolLabel || '';
  const agentKey = toText(event.agentKey) || current?.agentKey || '';
  const toolType = normalizeFrontendToolType(event.toolType) || current?.toolType || '';
  const viewportKey = toText(event.viewportKey) || current?.viewportKey || '';
  const toolTimeoutMs = Object.prototype.hasOwnProperty.call(event, 'toolTimeout')
    ? normalizeProtocolTimeoutMs(event.toolTimeout)
    : current?.toolTimeoutMs ?? null;
  const description = toText(event.description) || current?.description || '';
  const directParams =
    normalizeFrontendToolParams(event.toolParams) ||
    normalizeFrontendToolParams(event.params) ||
    normalizeFrontendToolParams(event.args) ||
    normalizeFrontendToolParams(event.arguments) ||
    normalizeFrontendToolParams(event.input);
  const argsDelta = type.endsWith('.args') ? String(event.delta || '') : '';
  const argsText = directParams
    ? safeJson(directParams)
    : argsDelta
      ? `${current?.argsText || ''}${argsDelta}`
      : firstFormattedText(event.args, event.arguments, event.input, event.params, event.toolParams) ||
        (type.endsWith('.args') ? bodyFromEvent(event) : current?.argsText || '');
  const toolParams = directParams || parseFrontendToolArgs(argsText) || current?.toolParams || {};
  const frontendToolState =
    current?.frontendToolState ||
    (type === 'tool.start' && toolType && viewportKey ? { status: 'active' as const } : null);
  const resultText =
    firstFormattedText(event.result, event.output, event.error) ||
    (type.endsWith('.result') || type.endsWith('.end')
      ? bodyFromEvent(event)
      : current?.resultText || '');
  const body =
    resultText ||
    argsText ||
    description ||
    bodyFromEvent(event) ||
    current?.body ||
    toolName ||
    toolLabel;

  return upsertNode(baseState, {
    id,
    kind: 'tool',
    agentKey,
    toolId,
    toolName,
    toolLabel,
    toolType,
    viewportKey,
    toolTimeoutMs,
    toolParams,
    frontendToolState,
    description,
    title: toolLabel || toolName || current?.title || '',
    status:
      lifecycle === 'complete'
        ? type.endsWith('.result')
          ? 'tool_result'
          : 'completed'
        : lifecycle === 'error'
          ? 'error'
          : 'running',
    argsText,
    resultText,
    body,
    streaming: lifecycle === 'active',
    runId,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(baseState, current),
    lifecycle,
  });
}

function applySourceEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const normalized = normalizeChatTimelineSourceEvent(event);
  const identity = normalized.publishId
    ? normalized.stableId
    : `${toText(event.runId) || 'run'}:${normalized.stableId}`;
  const id = `source:${conversationId}:${identity}`;
  const existing = state.nodesById[id];
  const current = existing?.kind === 'source' ? existing : undefined;
  const updatedAt = resolveTimestamp(
    event,
    current?.updatedAt ?? Date.now() + state.nextOrder
  );
  if (current && updatedAt < current.updatedAt) {
    return state;
  }

  const runId = resolveEventRunId(event, state, current);
  const baseState = current
    ? state
    : closeActiveReasoningNodesForRun(state, runId, updatedAt);
  const node: ChatTimelineSourceNode = {
    id,
    kind: 'source',
    publishId: normalized.publishId,
    sourceKind: normalized.sourceKind,
    query: normalized.query,
    sourceCount: normalized.sourceCount,
    chunkCount: normalized.chunkCount,
    sources: normalized.sources,
    errorDetail: normalized.errorDetail,
    malformed: normalized.malformed,
    runId,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(baseState, current),
    lifecycle: normalized.errorDetail ? 'error' : 'complete',
  };
  return upsertNode(baseState, node);
}

function artifactLifecycle(
  status: ChatTimelineArtifactNode['status']
): ChatTimelineLifecycle {
  if (status === 'failed') {
    return 'error';
  }
  return status === 'ready' ? 'complete' : 'active';
}

function applyArtifactEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const fallbackTimestamp = resolveTimestamp(event, Date.now() + state.nextOrder);
  const artifacts = normalizeChatTimelineArtifactEvent(event, fallbackTimestamp);

  return artifacts.reduce((nextState, artifact) => {
    const id = `artifact:${conversationId}:${artifact.artifactId}`;
    const existing = nextState.nodesById[id];
    const current = existing?.kind === 'artifact' ? existing : undefined;
    if (current && artifact.timestamp < current.updatedAt) {
      return nextState;
    }

    const runId = artifact.runId || current?.runId || nextState.activeRunId;
    const baseState = current
      ? nextState
      : closeActiveReasoningNodesForRun(nextState, runId, artifact.timestamp);
    const node: ChatTimelineArtifactNode = {
      id,
      kind: 'artifact',
      artifactId: artifact.artifactId,
      name: artifact.name,
      mimeType: artifact.mimeType,
      resourceUrl: artifact.resourceUrl,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      previewKind: artifact.previewKind,
      status: artifact.status,
      summary: artifact.summary,
      errorReason: artifact.errorReason,
      runId,
      createdAt: current?.createdAt ?? artifact.timestamp,
      updatedAt: artifact.timestamp,
      order: createOrder(baseState, current),
      lifecycle: artifactLifecycle(artifact.status),
    };
    return upsertNode(baseState, node);
  }, state);
}

function applyAwaitingEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const candidateId = nodeKey(conversationId, event, 'awaiting', 'awaiting');
  const activeAwaitingNode = getStateAwaitingNode(state);
  const eventAwaitingId = toText(event.awaitingId);
  const eventRunId = toText(event.runId);
  const shouldUseActiveAwaiting =
    type === 'awaiting.answer' &&
    Boolean(activeAwaitingNode) &&
    (!eventAwaitingId ||
      eventAwaitingId === activeAwaitingNode?.awaitingId ||
      eventAwaitingId === activeAwaitingNode?.id) &&
    (!eventRunId || !activeAwaitingNode?.runId || eventRunId === activeAwaitingNode.runId);
  const id =
    shouldUseActiveAwaiting && activeAwaitingNode
      ? activeAwaitingNode.id
      : candidateId || state.awaiting?.id || `awaiting:${conversationId}`;
  const current = shouldUseActiveAwaiting && activeAwaitingNode
    ? activeAwaitingNode
    : (state.nodesById[id] as ChatTimelineAwaitingNode | undefined);
  const awaitingId =
    toText(event.awaitingId) || current?.awaitingId || state.awaiting?.awaitingId || id;
  const normalized = normalizeChatTimelineAwaitingEvent({
    event,
    current,
    fallbackAnswer: state.awaiting?.answer || '',
  });
  const runId = resolveEventRunId(event, state, current);
  const baseState =
    normalized.status === 'ask' && !current
      ? closeActiveReasoningNodesForRun(state, runId, updatedAt)
      : state;
  const nextNode: ChatTimelineAwaitingNode = {
    id,
    kind: 'awaiting',
    awaitingId,
    prompt: normalized.prompt,
    answer: normalized.answer,
    payloadText: normalized.payloadText,
    mode: normalized.mode,
    status: normalized.status,
    interactive: normalized.interactive,
    answerSummary: normalized.answerSummary,
    runId,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(baseState, current),
    lifecycle: normalized.status === 'answer' ? 'complete' : 'active',
  };
  const awaiting = awaitingStateFromNode(nextNode);
  if (isDuplicateAwaitingAsk(baseState, current, awaiting)) {
    return baseState;
  }

  const nextState = upsertNode(baseState, nextNode);

  if (
    nextState.awaiting?.id === awaiting.id &&
    nextState.awaiting?.awaitingId === awaiting.awaitingId &&
    nextState.awaiting?.runId === awaiting.runId &&
    nextState.awaiting?.prompt === awaiting.prompt &&
    nextState.awaiting?.answer === awaiting.answer &&
    nextState.awaiting?.payloadText === awaiting.payloadText &&
    nextState.awaiting?.mode === awaiting.mode &&
    nextState.awaiting?.status === awaiting.status &&
    nextState.awaiting?.createdAt === awaiting.createdAt &&
    getAwaitingInteractiveSignature(nextState.awaiting?.interactive) ===
      getAwaitingInteractiveSignature(awaiting.interactive) &&
    getAwaitingAnswerSummarySignature(nextState.awaiting?.answerSummary) ===
      getAwaitingAnswerSummarySignature(awaiting.answerSummary) &&
    nextState.awaiting?.updatedAt === awaiting.updatedAt
  ) {
    return nextState;
  }

  return {
    ...nextState,
    awaiting,
    updatedAt: Math.max(nextState.updatedAt, updatedAt),
    revision: nextState.revision + 1,
  };
}

function applySystemErrorEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>,
  runId: string,
  updatedAt: number
): ChatTimelineState {
  const display = formatChatTimelinePlatformErrorForDisplay(event);
  const stableId = systemErrorStableId(event, updatedAt);
  const id = systemErrorNodeKey(conversationId, stableId);
  const currentNode = state.nodesById[id];
  const current =
    currentNode?.kind === 'message' ? (currentNode as ChatTimelineMessageNode) : undefined;

  return upsertNode(state, {
    id,
    kind: 'message',
    role: 'system',
    content: display.message,
    messageId: `system-error:${conversationId}:${stableId}`,
    clientMessageId: null,
    serverMessageId: null,
    deliveryStatus: 'sent',
    errorReason: display.error.message || null,
    errorDetail: display.error,
    streaming: false,
    attachments: current?.attachments || [],
    runId: runId || current?.runId || '',
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt: Math.max(current?.updatedAt ?? 0, updatedAt),
    order: createOrder(state, current),
    lifecycle: 'error',
  });
}

function applyRunEvent(
  state: ChatTimelineState,
  conversationId: string,
  event: Record<string, unknown>
): ChatTimelineState {
  const type = normalizeEventType(event.type);
  const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
  const id = nodeKey(conversationId, event, 'run', 'run');
  const current = state.nodesById[id] as ChatTimelineRunNode | undefined;
  const lifecycle = resolveLifecycle(type);
  const runId = toText(event.runId);
  const startedAt =
    type === 'run.start'
      ? updatedAt
      : (current?.startedAt ?? resolveOptionalTimestamp(event.startedAt));
  const completedAt =
    type === 'run.complete' || type === 'run.cancel' || type === 'run.error'
      ? updatedAt
      : (current?.completedAt ?? resolveOptionalTimestamp(event.completedAt));
  const durationMs =
    startedAt && completedAt ? Math.max(0, completedAt - startedAt) : (current?.durationMs ?? null);
  let nextState = upsertNode(state, {
    id,
    kind: 'run',
    title: '',
    body: bodyFromEvent(event) || (runId ? `runId: ${runId}` : type),
    status:
      type === 'run.start'
        ? 'running'
        : type === 'run.complete'
          ? 'completed'
          : type === 'run.cancel'
            ? 'cancelled'
            : 'error',
    agentKey: toText(event.agentKey) || current?.agentKey || '',
    runId,
    startedAt,
    completedAt,
    durationMs,
    createdAt: current?.createdAt ?? updatedAt,
    updatedAt,
    order: createOrder(state, current),
    lifecycle,
  });
  if (shouldCreateSystemErrorNode(type, event)) {
    nextState = applySystemErrorEvent(
      nextState,
      conversationId,
      event,
      runId || state.activeRunId,
      updatedAt
    );
  }
  const activeRunId = type === 'run.start' ? runId || state.activeRunId : '';
  const stateWithActiveRunId =
    nextState.activeRunId === activeRunId
      ? nextState
      : {
          ...nextState,
          activeRunId,
          revision: nextState.revision + 1,
        };
  return lifecycle === 'active'
    ? stateWithActiveRunId
    : closeActiveNodesForRun(
        stateWithActiveRunId,
        runId || state.activeRunId,
        lifecycle,
        updatedAt
      );
}

export function applyChatTimelineLocalCancel(
  currentStateInput: ChatTimelineState | null | undefined,
  conversationIdInput: string,
  input: {
    runId?: string | null;
    reason?: string;
    timestamp?: number;
  } = {}
): ChatTimelineState {
  const conversationId = normalizeConversationId(conversationIdInput);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const updatedAt = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  const requestedRunId = toText(input.runId);
  const runId = resolveLocalStopRunId(state, requestedRunId);

  if (!runId && !requestedRunId && !hasActiveTimelineNodes(state)) {
    return state;
  }

  return clearActiveRunIdForLocalStop(
    clearActiveReasoningNodeIdForRun(
      closeActiveTimelineNodesForLocalStop(state, runId, updatedAt),
      runId
    ),
    updatedAt
  );
}

export function applyChatTimelineRunUnavailable(
  currentStateInput: ChatTimelineState | null | undefined,
  conversationIdInput: string,
  input: {
    runId?: string | null;
    timestamp?: number;
  } = {}
): ChatTimelineState {
  const conversationId = normalizeConversationId(conversationIdInput);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const runId = toText(input.runId);
  if (!runId) {
    return state;
  }

  const updatedAt = Number.isFinite(Number(input.timestamp)) ? Number(input.timestamp) : Date.now();
  let nextNodesById: ChatTimelineState['nodesById'] | null = null;
  let nextUpdatedAt = state.updatedAt;

  state.orderedNodeIds.forEach((nodeId) => {
    const node = state.nodesById[nodeId];
    if (
      !node ||
      node.runId !== runId ||
      !isActiveTimelineNode(node) ||
      node.kind === 'awaiting'
    ) {
      return;
    }

    const nodeUpdatedAt = Math.max(node.updatedAt, updatedAt);
    const nextNode: ChatTimelineNode =
      node.kind === 'run'
        ? {
            ...node,
            status: 'completed',
            lifecycle: 'complete',
            updatedAt: nodeUpdatedAt,
          }
        : closeTimelineNodeForRun(node, 'complete', updatedAt);
    if (!didNodeChange(node, nextNode)) {
      return;
    }

    if (!nextNodesById) {
      nextNodesById = { ...state.nodesById };
    }
    nextNodesById[nodeId] = nextNode;
    nextUpdatedAt = Math.max(nextUpdatedAt, nextNode.updatedAt);
  });

  let nextState = nextNodesById
    ? replaceTimelineNodes(state, nextNodesById, nextUpdatedAt)
    : state;
  nextState = clearActiveReasoningNodeIdForRun(nextState, runId);
  if (nextState.activeRunId !== runId) {
    return nextState;
  }

  return {
    ...nextState,
    activeRunId: '',
    updatedAt: Math.max(nextState.updatedAt, updatedAt),
    revision: nextState.revision + 1,
  };
}

export function applyChatTimelineEvent(
  currentStateInput: ChatTimelineState | null | undefined,
  conversationIdInput: string,
  rawEvent: Record<string, unknown>
): ChatTimelineState {
  const conversationId = normalizeConversationId(conversationIdInput);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const event: Record<string, unknown> = {
    ...rawEvent,
    type: normalizeEventType(rawEvent.type),
  };
  const type = normalizeEventType(event.type);
  const family = classifyChatProtocolEvent(event);

  if (type === 'request.query') {
    return applyRequestEvent(state, conversationId, event);
  }
  if (family === 'request') {
    return applyRuntimeTextEvent(state, conversationId, event, 'request');
  }
  if (family === 'assistant_content') {
    return applyContentEvent(state, conversationId, event);
  }
  if (family === 'run') {
    return applyRunEvent(state, conversationId, event);
  }
  if (family === 'awaiting') {
    return applyAwaitingEvent(state, conversationId, event);
  }
  if (family === 'tool') {
    return applyToolEvent(state, conversationId, event);
  }
  if (family === 'source') {
    return applySourceEvent(state, conversationId, event);
  }
  if (family === 'artifact') {
    return applyArtifactEvent(state, conversationId, event);
  }
  if (family === 'reasoning' || family === 'planning') {
    return applyRuntimeTextEvent(state, conversationId, event, family);
  }
  if (
    family === 'action' ||
    family === 'plan' ||
    family === 'task' ||
    family === 'context'
  ) {
    const kind = family === 'context' ? 'context' : family;
    return applyRuntimeTextEvent(state, conversationId, event, kind);
  }
  if (family === 'usage') {
    const updatedAt = resolveTimestamp(event, Date.now() + state.nextOrder);
    const usageSummary = buildChatTimelineUsageSummary(event, updatedAt);
    const usageLabel = usageSummary.label;
    const nextState = applyRuntimeTextEvent(
      state,
      conversationId,
      { ...event, text: usageLabel || bodyFromEvent(event) },
      'usage',
      usageSummary
    );
    return nextState.usageLabel === usageLabel &&
      chatTimelineUsageSummaryEquals(nextState.usageSummary, usageSummary)
      ? nextState
      : {
          ...nextState,
          usageLabel,
          usageSummary,
          revision: nextState.revision + 1,
        };
  }

  return state;
}

export function applyChatTimelineMessage(
  currentStateInput: ChatTimelineState | null | undefined,
  message: ChatMessageItem,
  options: ChatTimelineRunContextOptions = {}
): ChatTimelineState {
  const conversationId = normalizeConversationId(message.conversationId);
  const state =
    currentStateInput && currentStateInput.conversationId === conversationId
      ? currentStateInput
      : createChatTimelineState(conversationId);
  const id = `message:${conversationId}:local:${message.messageId}`;
  const current = state.nodesById[id] as ChatTimelineMessageNode | undefined;
  const runId =
    toText(options.runId) ||
    current?.runId ||
    (message.role === 'assistant' ? state.activeRunId : '');
  const baseState = shouldCloseReasoningForAssistantContent(
    current,
    message.role,
    message.content,
    runId
  )
    ? closeActiveReasoningNodesForRun(state, runId, message.createdAt)
    : state;
  return upsertNode(baseState, {
    id,
    kind: 'message',
    role: message.role,
    content: message.content,
    messageId: message.messageId,
    clientMessageId: message.clientMessageId,
    serverMessageId: message.serverMessageId,
    deliveryStatus: message.deliveryStatus as ChatTimelineDeliveryStatus,
    errorReason: message.errorReason,
    streaming: message.streamStatus === 'streaming',
    attachments: message.attachments || [],
    runId,
    createdAt: message.createdAt,
    updatedAt: message.createdAt,
    order: createOrder(baseState, current),
    lifecycle: message.streamStatus === 'streaming' ? 'active' : 'complete',
  });
}

export function patchChatTimelineMessage(
  currentState: ChatTimelineState,
  messageId: string,
  patch: Partial<
    Pick<
      ChatMessageItem,
      | 'content'
      | 'createdAt'
      | 'deliveryStatus'
      | 'errorReason'
      | 'serverMessageId'
      | 'streamStatus'
      | 'attachments'
    >
  >,
  options: ChatTimelineRunContextOptions = {}
): ChatTimelineState {
  const targetId = findMessageNodeIdByIdentity(currentState, {
    messageId,
    serverMessageId: patch.serverMessageId,
  });
  if (!targetId) {
    return currentState;
  }

  const current = currentState.nodesById[targetId] as ChatTimelineMessageNode;
  const runId =
    toText(options.runId) ||
    current.runId ||
    (current.role === 'assistant' ? currentState.activeRunId : '');
  const content = patch.content ?? current.content;
  const updatedAt = Math.max(current.updatedAt, patch.createdAt ?? current.updatedAt);
  const baseState = shouldCloseReasoningForAssistantContent(current, current.role, content, runId)
    ? closeActiveReasoningNodesForRun(currentState, runId, updatedAt)
    : currentState;
  return upsertNode(baseState, {
    ...current,
    content,
    createdAt: patch.createdAt ?? current.createdAt,
    updatedAt,
    deliveryStatus: (patch.deliveryStatus ?? current.deliveryStatus) as ChatTimelineDeliveryStatus,
    errorReason: patch.errorReason ?? current.errorReason,
    serverMessageId: patch.serverMessageId ?? current.serverMessageId,
    attachments: patch.attachments ?? current.attachments,
    runId,
    streaming:
      patch.streamStatus !== undefined ? patch.streamStatus === 'streaming' : current.streaming,
    lifecycle:
      patch.streamStatus === 'streaming'
        ? 'active'
        : patch.streamStatus === 'done'
          ? 'complete'
          : current.lifecycle,
  });
}

export function applyChatTimelineStreamDelta(
  currentState: ChatTimelineState,
  input: {
    messageId: string;
    createdAt: number;
    delta: string;
    snapshotText?: string;
    runId?: string | null;
  }
): ChatTimelineState {
  const targetId = findMessageNodeIdByIdentity(currentState, {
    messageId: input.messageId,
  });
  if (!targetId) {
    return currentState;
  }

  const current = currentState.nodesById[targetId] as ChatTimelineMessageNode;
  const runId =
    toText(input.runId) ||
    current.runId ||
    (current.role === 'assistant' ? currentState.activeRunId : '');
  const content =
    input.snapshotText !== undefined
      ? input.snapshotText
      : `${current.content}${String(input.delta || '')}`;
  const baseState = shouldCloseReasoningForAssistantContent(current, current.role, content, runId)
    ? closeActiveReasoningNodesForRun(currentState, runId, input.createdAt)
    : currentState;
  return upsertNode(baseState, {
    ...current,
    content,
    runId,
    updatedAt: Math.max(current.updatedAt, input.createdAt),
    streaming: true,
    lifecycle: 'active',
  });
}

export function mergeChatTimelineState(
  currentStateInput: ChatTimelineState | null | undefined,
  incomingState: ChatTimelineState,
  options?: MergeChatTimelineStateOptions
): ChatTimelineState {
  if (
    !currentStateInput ||
    currentStateInput.conversationId !== incomingState.conversationId ||
    (currentStateInput.orderedNodeIds.length <= 0 && !options?.preserveTerminalRunIds?.length)
  ) {
    return incomingState;
  }

  const protectedTerminalRunIds = buildProtectedTerminalRunIds(
    currentStateInput,
    incomingState,
    options
  );
  const incomingIndex = buildTimelineNodeIdentityIndex(incomingState);
  let incomingRequestEchoIndex: Map<string, string[]> | null = null;
  const consumedIncomingRequestEchoNodeIds = new Set<string>();
  let orderedNodeIds = incomingState.orderedNodeIds;
  let orderedNodeIdSet: Set<string> | null = null;
  let orderedNodeIndexById: Map<string, number> | null = null;
  let nodesById = incomingState.nodesById;
  let changed = false;

  const ensureWritableState = () => {
    if (!changed) {
      orderedNodeIds = [...incomingState.orderedNodeIds];
      orderedNodeIdSet = new Set(orderedNodeIds);
      orderedNodeIndexById = new Map(
        orderedNodeIds.map((orderedNodeId, index) => [orderedNodeId, index])
      );
      nodesById = { ...incomingState.nodesById };
      changed = true;
    }
  };

  const preserveNode = (node: ChatTimelineNode, matchedIncomingId: string) => {
    ensureWritableState();
    const nodeIdSet = orderedNodeIdSet!;
    const nodeIndexById = orderedNodeIndexById!;

    if (matchedIncomingId && matchedIncomingId !== node.id) {
      const matchedIndex = nodeIndexById.get(matchedIncomingId) ?? -1;
      if (matchedIndex >= 0) {
        orderedNodeIds[matchedIndex] = node.id;
        nodeIdSet.delete(matchedIncomingId);
        nodeIdSet.add(node.id);
        nodeIndexById.delete(matchedIncomingId);
        nodeIndexById.set(node.id, matchedIndex);
      }
      delete nodesById[matchedIncomingId];
    }

    if (!nodeIdSet.has(node.id)) {
      nodeIndexById.set(node.id, orderedNodeIds.length);
      orderedNodeIds.push(node.id);
      nodeIdSet.add(node.id);
    }
    nodesById[node.id] = node;
  };

  const findMatchedIncomingNodeId = (currentNode: ChatTimelineNode): string => {
    const exactMatchId = findMatchingTimelineNodeId(incomingIndex, currentNode);
    if (exactMatchId || !isLocalUserMessageWithoutServerId(currentNode)) {
      return exactMatchId;
    }

    incomingRequestEchoIndex ??= buildTimelineUserRequestEchoIndex(incomingState);
    return findRequestEchoTimelineNodeId(
      incomingState,
      incomingRequestEchoIndex,
      currentNode,
      consumedIncomingRequestEchoNodeIds
    );
  };

  currentStateInput.orderedNodeIds.forEach((nodeId) => {
    const currentNode = currentStateInput.nodesById[nodeId];
    if (!currentNode) {
      return;
    }

    const matchedIncomingId = findMatchedIncomingNodeId(currentNode);
    const incomingNode = matchedIncomingId ? incomingState.nodesById[matchedIncomingId] : undefined;
    // Claim request echoes even for exact matches so later local repeats cannot reuse them.
    if (matchedIncomingId && isRemoteUserRequestEchoNode(incomingNode)) {
      consumedIncomingRequestEchoNodeIds.add(matchedIncomingId);
    }
    const shouldPreserve =
      shouldPreserveProtectedTerminalNode(currentNode, incomingNode, protectedTerminalRunIds) ||
      (incomingNode
        ? shouldPreferCurrentTimelineNode(currentNode, incomingNode)
        : shouldPreserveUnmatchedTimelineNode(currentNode, incomingState));

    if (shouldPreserve) {
      preserveNode(
        mergeLocalUserMessageWithRequestEcho(currentNode, incomingNode),
        matchedIncomingId
      );
    }
  });

  protectedTerminalRunIds?.forEach((runId) => {
    const closedAt = getTerminalRunUpdatedAt(currentStateInput, runId);
    orderedNodeIds.forEach((nodeId) => {
      const node = nodesById[nodeId];
      if (
        !node ||
        node.runId !== runId ||
        !isActiveTimelineNode(node)
      ) {
        return;
      }

      ensureWritableState();
      const writableNode = nodesById[nodeId] ?? node;
      const nextNode = closeTimelineNodeForLocalStop(
        writableNode,
        Math.max(closedAt, writableNode.updatedAt)
      );
      if (didNodeChange(writableNode, nextNode)) {
        nodesById[nodeId] = nextNode;
      }
    });
  });

  if (!changed) {
    return incomingState;
  }

  const incomingActiveRunId = toText(incomingState.activeRunId);
  const currentActiveRunId = toText(currentStateInput.activeRunId);
  const canUseCurrentActiveRunId =
    currentActiveRunId &&
    !protectedTerminalRunIds?.has(currentActiveRunId) &&
    hasActiveRunNode(orderedNodeIds, nodesById, currentActiveRunId);
  const activeRunId =
    (incomingActiveRunId && !protectedTerminalRunIds?.has(incomingActiveRunId)
      ? incomingActiveRunId
      : '') ||
    (canUseCurrentActiveRunId ? currentActiveRunId : '');
  const usageSummary = incomingState.usageSummary ?? currentStateInput.usageSummary;
  const usageLabel = incomingState.usageSummary
    ? incomingState.usageLabel || incomingState.usageSummary.label || ''
    : incomingState.usageLabel || currentStateInput.usageLabel;

  return {
    ...incomingState,
    orderedNodeIds,
    nodesById,
    activeRunId,
    activeReasoningNodeIdsByRun: mergeActiveReasoningNodeIdsByRun(
      orderedNodeIds,
      nodesById,
      incomingState,
      currentStateInput
    ),
    awaiting: resolveMergedAwaiting(nodesById, incomingState, currentStateInput),
    usageLabel,
    usageSummary,
    updatedAt: Math.max(incomingState.updatedAt, currentStateInput.updatedAt),
    revision: Math.max(incomingState.revision, currentStateInput.revision) + 1,
    nextOrder: Math.max(
      incomingState.nextOrder,
      currentStateInput.nextOrder,
      orderedNodeIds.length
    ),
  };
}

function mergeLocalUserMessageWithRequestEcho(
  currentNode: ChatTimelineNode,
  incomingNode: ChatTimelineNode | undefined
): ChatTimelineNode {
  if (
    !isLocalUserMessageWithoutServerId(currentNode) ||
    !isRemoteUserRequestEchoNode(incomingNode)
  ) {
    return currentNode;
  }

  const runId = currentNode.runId || incomingNode.runId;
  const updatedAt = Math.max(currentNode.updatedAt, incomingNode.updatedAt);
  if (currentNode.runId === runId && currentNode.updatedAt === updatedAt) {
    return currentNode;
  }

  return {
    ...currentNode,
    runId,
    updatedAt,
  };
}

export function compactChatTimelineRequestEchoes(
  stateInput: ChatTimelineState | null | undefined
): ChatTimelineState | null | undefined {
  if (!stateInput?.orderedNodeIds.length) {
    return stateInput;
  }

  const localRequestEchoIndex = buildTimelineUserRequestEchoIndex(
    stateInput,
    isLocalUserMessageWithoutServerId
  );
  if (localRequestEchoIndex.size === 0) {
    return stateInput;
  }

  const nodeIdsToDrop = new Set<string>();
  const consumedLocalRequestEchoNodeIds = new Set<string>();
  for (const nodeId of stateInput.orderedNodeIds) {
    const node = stateInput.nodesById[nodeId];
    if (!isRemoteUserRequestEchoNode(node)) {
      continue;
    }
    const matchedLocalNodeId = findRequestEchoTimelineNodeId(
      stateInput,
      localRequestEchoIndex,
      node,
      consumedLocalRequestEchoNodeIds
    );
    if (matchedLocalNodeId) {
      consumedLocalRequestEchoNodeIds.add(matchedLocalNodeId);
      nodeIdsToDrop.add(nodeId);
    }
  }

  if (nodeIdsToDrop.size === 0) {
    return stateInput;
  }

  const orderedNodeIds = stateInput.orderedNodeIds.filter((nodeId) => !nodeIdsToDrop.has(nodeId));
  const nodesById = { ...stateInput.nodesById };
  nodeIdsToDrop.forEach((nodeId) => {
    delete nodesById[nodeId];
  });

  return {
    ...stateInput,
    orderedNodeIds,
    nodesById,
    activeReasoningNodeIdsByRun: buildActiveReasoningNodeIdsByRun(orderedNodeIds, nodesById),
    updatedAt: stateInput.updatedAt,
    revision: stateInput.revision + 1,
    nextOrder: Math.max(stateInput.nextOrder, orderedNodeIds.length),
  };
}

export function deriveChatTimelineState(
  conversationId: string,
  rawEvents: readonly unknown[]
): ChatTimelineState {
  let state = createChatTimelineState(conversationId);

  rawEvents.forEach((rawEvent) => {
    const event =
      rawEvent && typeof rawEvent === 'object' ? (rawEvent as Record<string, unknown>) : {};
    state = applyChatTimelineEvent(state, conversationId, event);
  });

  return state;
}

export function deriveChatTimelineStateFromMessages(
  conversationId: string,
  messages: readonly ChatMessageItem[]
): ChatTimelineState {
  return [...messages]
    .sort((left, right) => left.createdAt - right.createdAt)
    .reduce<ChatTimelineState>(
      (state, message) => applyChatTimelineMessage(state, message),
      createChatTimelineState(conversationId)
    );
}
