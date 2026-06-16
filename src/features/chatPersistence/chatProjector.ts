import type {
  RemoteChatDetail,
  RemoteChatEvent,
  RemoteChatSummary,
} from '../../core/api/services/chatApi';
import {
  normalizeProtocolTimestampMs,
  toText,
} from '../../core/api/services/chatEventProtocol.ts';
import type { ChatConversationRuntimeState } from '../chatRealtime/types';
import {
  deriveChatTimelineState,
  projectTimelineMessages,
  projectTimelineRuntimeState,
} from '../chatTimeline/index.ts';
import type { ChatTimelineState } from '../chatTimeline/index.ts';
import type { ChatHomeItem, ChatMessageItem, ChatMessageStatus, ChatReadState } from './types';
import {
  hasChatReadStateInput,
  normalizeChatReadState,
  readStateToUnreadBit,
} from './chatReadState.ts';

type ProjectedConversationSummary = Omit<ChatHomeItem, 'read' | 'unreadCount'> & {
  read?: ChatReadState;
  unreadCount?: number;
};

export type ProjectedConversationDetail = {
  conversationId: string;
  title: string;
  unreadCount: number;
  read: ChatReadState;
  hasExplicitReadState: boolean;
  activeRunId: string;
  timelineState: ChatTimelineState;
  runtimeState: ChatConversationRuntimeState;
  summary: ProjectedConversationSummary;
  messages: ChatMessageItem[];
};

export type ProjectedChatSummaryPatch = {
  conversationId: string;
  title: string;
  lastMessageText?: string;
  lastMessageAt?: number;
  unreadCount?: number;
  read?: ChatReadState;
  lastMessageStatus?: ChatMessageStatus;
  agentKey: string | null;
  teamId: string | null;
};

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTimestamp(value: unknown, fallback: number): number {
  return normalizeProtocolTimestampMs(value, fallback);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type DetailUsageSnapshotRef = {
  event: RemoteChatEvent;
  index: number;
};

type DetailTimelineEventIndex = {
  hasAnyRequestQuery: boolean;
  hasPlanningEvent: boolean;
  latestUsageSnapshot: DetailUsageSnapshotRef | null;
  latestCompactUsage: Record<string, unknown> | null;
  latestCompactPostTokensAfterUsage: number | null;
  lastTimestamp: number;
  contentRunIds: Set<string>;
  requestQueryRunIds: Set<string>;
  runCompleteIds: Set<string>;
  runStartIds: Set<string>;
};

function createDetailTimelineEventIndex(): DetailTimelineEventIndex {
  return {
    hasAnyRequestQuery: false,
    hasPlanningEvent: false,
    latestUsageSnapshot: null,
    latestCompactUsage: null,
    latestCompactPostTokensAfterUsage: null,
    lastTimestamp: 0,
    contentRunIds: new Set(),
    requestQueryRunIds: new Set(),
    runCompleteIds: new Set(),
    runStartIds: new Set(),
  };
}

function addDetailTimelineEventIndex(
  index: DetailTimelineEventIndex,
  event: RemoteChatEvent,
  eventOrder: number
): void {
  const type = toText(event.type);
  const runId = toText(event.runId);
  const timestamp = parseTimestamp(event.timestamp, 0);

  if (timestamp > 0) {
    index.lastTimestamp = timestamp;
  }

  if (type.startsWith('planning.')) {
    index.hasPlanningEvent = true;
  }
  if (type === 'usage.snapshot') {
    index.latestUsageSnapshot = {
      event,
      index: eventOrder,
    };
    index.latestCompactPostTokensAfterUsage = null;
  }
  if (type === 'context.compact.complete') {
    if (isObjectRecord(event.compactionUsage)) {
      index.latestCompactUsage = event.compactionUsage;
    } else if (isObjectRecord(event.compactUsage)) {
      index.latestCompactUsage = event.compactUsage;
    }

    if (index.latestUsageSnapshot) {
      const postTokens = toFiniteNumber(event.postCompactEstimatedTokens);
      if (postTokens !== null && postTokens >= 0) {
        index.latestCompactPostTokensAfterUsage = postTokens;
      }
    }
  }
  if (type === 'request.query') {
    index.hasAnyRequestQuery = true;
    index.requestQueryRunIds.add(runId);
  }
  if (type === 'run.start') {
    index.runStartIds.add(runId);
  }
  if (type === 'run.complete') {
    index.runCompleteIds.add(runId);
  }
  if (type.startsWith('content.') || type.startsWith('message.')) {
    index.contentRunIds.add(runId);
  }
}

function indexDetailTimelineEvents(events: readonly RemoteChatEvent[]): DetailTimelineEventIndex {
  const index = createDetailTimelineEventIndex();
  events.forEach((event, eventOrder) => addDetailTimelineEventIndex(index, event, eventOrder));
  return index;
}

function appendDetailTimelineEvent(
  events: RemoteChatEvent[],
  index: DetailTimelineEventIndex,
  event: RemoteChatEvent
): void {
  const eventOrder = events.length;
  events.push(event);
  addDetailTimelineEventIndex(index, event, eventOrder);
}

function hasRequestQueryForRun(index: DetailTimelineEventIndex, runId: string): boolean {
  return runId ? index.requestQueryRunIds.has(runId) : index.hasAnyRequestQuery;
}

type DetailRunUsageSources = {
  latestRun: Record<string, unknown> | null;
  runWithUsage: Record<string, unknown> | null;
};

function hasNestedUsageSections(usage: Record<string, unknown>): boolean {
  return (
    isObjectRecord(usage.current) ||
    isObjectRecord(usage.run) ||
    isObjectRecord(usage.lastRun) ||
    isObjectRecord(usage.chat) ||
    isObjectRecord(usage.compact) ||
    isObjectRecord(usage.compactionUsage)
  );
}

function getRunId(value: unknown): string {
  return isObjectRecord(value) ? toText(value.runId) : '';
}

function getModelKey(value: unknown): string {
  if (!isObjectRecord(value)) {
    return '';
  }

  const model = value.model;
  if (isObjectRecord(model)) {
    const key = toText(model.key || model.modelKey);
    if (key) {
      return key;
    }
  }
  if (typeof model === 'string') {
    const key = model.trim();
    if (key) {
      return key;
    }
  }

  return toText(value.modelKey || value.model_key);
}

function getRunModelKey(run: Record<string, unknown> | null): string {
  if (!run) {
    return '';
  }
  return getModelKey(run) || getModelKey(run.usage);
}

function resolveRunUsageSources(runs: readonly Record<string, unknown>[]): DetailRunUsageSources {
  let latestRun: Record<string, unknown> | null = null;
  let runWithUsage: Record<string, unknown> | null = null;

  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    if (!latestRun && getRunId(run)) {
      latestRun = run;
    }
    if (!runWithUsage && isObjectRecord(run.usage)) {
      runWithUsage = run;
    }
    if (latestRun && runWithUsage) {
      break;
    }
  }

  return {
    latestRun,
    runWithUsage,
  };
}

function buildMergedDetailUsagePayload(
  detail: RemoteChatDetail,
  latestUsageSnapshot: DetailUsageSnapshotRef | null,
  runWithUsage: Record<string, unknown> | null,
  compactUsage: Record<string, unknown> | null
): Record<string, unknown> | null {
  const eventUsage = isObjectRecord(latestUsageSnapshot?.event.usage)
    ? latestUsageSnapshot.event.usage
    : null;
  const detailUsage = isObjectRecord(detail.usage) ? detail.usage : null;
  const runUsage = isObjectRecord(runWithUsage?.usage) ? runWithUsage.usage : null;
  const usage: Record<string, unknown> = eventUsage ? { ...eventUsage } : {};

  if (detailUsage) {
    if (hasNestedUsageSections(detailUsage)) {
      Object.assign(usage, detailUsage);
    } else {
      usage.chat = detailUsage;
    }
  }

  if (runUsage && !isObjectRecord(usage.run) && !isObjectRecord(usage.lastRun)) {
    usage.run = runUsage;
  }

  if (
    !isObjectRecord(usage.current) &&
    (isObjectRecord(usage.run) || isObjectRecord(usage.lastRun) || isObjectRecord(usage.chat))
  ) {
    usage.current = {};
  }

  if (compactUsage) {
    usage.compact = compactUsage;
  }

  return Object.keys(usage).length > 0 ? usage : null;
}

function buildDetailUsageSnapshotEvent(
  detail: RemoteChatDetail,
  eventIndex: DetailTimelineEventIndex,
  runs: readonly Record<string, unknown>[],
  conversationId: string,
  timestamp: number
): RemoteChatEvent | null {
  const latestUsageSnapshot = eventIndex.latestUsageSnapshot;
  const eventUsage = isObjectRecord(latestUsageSnapshot?.event.usage)
    ? latestUsageSnapshot.event.usage
    : null;
  const detailUsage = isObjectRecord(detail.usage) ? detail.usage : null;
  const compactUsage = eventIndex.latestCompactUsage;
  const { latestRun, runWithUsage } = resolveRunUsageSources(runs);
  const runUsage = isObjectRecord(runWithUsage?.usage) ? runWithUsage.usage : null;
  const usage = buildMergedDetailUsagePayload(
    detail,
    latestUsageSnapshot,
    runWithUsage,
    compactUsage
  );
  const compactPostTokens = eventIndex.latestCompactPostTokensAfterUsage;
  const baseContextWindow =
    (isObjectRecord(latestUsageSnapshot?.event.contextWindow)
      ? latestUsageSnapshot.event.contextWindow
      : null) ?? (isObjectRecord(detail.contextWindow) ? detail.contextWindow : null);
  const contextWindow =
    compactPostTokens === null
      ? baseContextWindow
      : {
          ...(baseContextWindow ?? {}),
          currentSize: compactPostTokens,
          estimatedNextCallSize: compactPostTokens,
        };
  const activeRun = isObjectRecord(detail.activeRun) ? detail.activeRun : null;
  const runId =
    getRunId(activeRun) ||
    getRunId(runWithUsage) ||
    getRunId(latestRun) ||
    getRunId(latestUsageSnapshot?.event);
  const modelKey =
    getModelKey(activeRun) ||
    getRunModelKey(runWithUsage) ||
    getRunModelKey(latestRun) ||
    getModelKey(latestUsageSnapshot?.event) ||
    getModelKey(detail);
  const hasContextEnrichment =
    compactPostTokens !== null ||
    (Boolean(baseContextWindow) && !isObjectRecord(latestUsageSnapshot?.event.contextWindow));
  const hasModelEnrichment =
    Boolean(modelKey) && modelKey !== getModelKey(latestUsageSnapshot?.event);
  const shouldAppend =
    Boolean(
      detailUsage || runUsage || compactUsage || hasContextEnrichment || hasModelEnrichment
    ) || !latestUsageSnapshot;

  if (!shouldAppend || (!usage && !eventUsage)) {
    return null;
  }

  return {
    type: 'usage.snapshot',
    chatId: conversationId,
    ...(runId ? { runId } : {}),
    ...(modelKey ? { model: { key: modelKey } } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(usage ? { usage } : {}),
    timestamp,
  };
}

function buildDetailTimelineEvents(
  detail: RemoteChatDetail,
  conversationId: string,
  title: string
): RemoteChatEvent[] {
  const events = Array.isArray(detail.events) ? [...detail.events] : [];
  const eventIndex = indexDetailTimelineEvents(events);
  const baseTimestamp = eventIndex.lastTimestamp || parseTimestamp(detail.updatedAt, Date.now());

  if (!eventIndex.hasPlanningEvent) {
    const planning = isObjectRecord(detail.planning) ? detail.planning : null;
    const planningText = toText(planning?.text);
    if (planningText) {
      appendDetailTimelineEvent(events, eventIndex, {
        type: 'planning.snapshot',
        chatId: conversationId,
        runId: toText(planning?.runId),
        planningId: toText(planning?.planningId) || 'planning',
        planningFile: toText(planning?.planningFile),
        text: planningText,
        timestamp: baseTimestamp + 1,
      });
    }
  }

  const runs = Array.isArray(detail.runs)
    ? detail.runs.filter((run): run is Record<string, unknown> => isObjectRecord(run))
    : [];
  runs.forEach((run, index) => {
    const runId = toText(run.runId);
    const runTimestamp = parseTimestamp(run.startedAt, baseTimestamp + index * 4 + 3);
    const runCompletedAt = parseTimestamp(run.completedAt, runTimestamp);

    if (toText(run.initialMessage) && !hasRequestQueryForRun(eventIndex, runId)) {
      appendDetailTimelineEvent(events, eventIndex, {
        type: 'request.query',
        chatId: conversationId,
        chatName: title,
        runId,
        requestId: toText(run.requestId) || `run_${runId || index}_request`,
        role: 'user',
        message: toText(run.initialMessage),
        timestamp: runTimestamp,
      });
    }

    if (runId && !eventIndex.runStartIds.has(runId)) {
      appendDetailTimelineEvent(events, eventIndex, {
        type: 'run.start',
        chatId: conversationId,
        runId,
        agentKey: toText(run.agentKey),
        timestamp: runTimestamp,
      });
    }

    if (toText(run.assistantText) && !eventIndex.contentRunIds.has(runId)) {
      appendDetailTimelineEvent(events, eventIndex, {
        type: 'content.snapshot',
        chatId: conversationId,
        runId,
        contentId: toText(run.contentId) || `run_${runId || index}_content`,
        text: toText(run.assistantText),
        timestamp: runCompletedAt,
      });
    }

    if (
      runId &&
      (toText(run.finishReason) || run.completedAt !== undefined) &&
      !eventIndex.runCompleteIds.has(runId)
    ) {
      appendDetailTimelineEvent(events, eventIndex, {
        type: 'run.complete',
        chatId: conversationId,
        runId,
        finishReason: toText(run.finishReason),
        usage: run.usage,
        timestamp: runCompletedAt,
      });
    }
  });

  const usageSnapshot = buildDetailUsageSnapshotEvent(
    detail,
    eventIndex,
    runs,
    conversationId,
    (eventIndex.lastTimestamp || baseTimestamp) + 1
  );
  if (usageSnapshot) {
    appendDetailTimelineEvent(events, eventIndex, usageSnapshot);
  }

  return events;
}

function buildSummaryFromMessage(
  conversationId: string,
  title: string,
  read: ChatReadState | undefined,
  message: Pick<ChatMessageItem, 'content' | 'createdAt' | 'deliveryStatus'> | null,
  fallbackUpdatedAt: number
): ProjectedConversationSummary {
  const lastMessageText = message?.content || '';
  const lastMessageAt = message?.createdAt || fallbackUpdatedAt || Date.now();
  return {
    conversationId,
    title: title || conversationId,
    lastMessageText,
    lastMessageAt,
    ...(read ? { unreadCount: readStateToUnreadBit(read), read } : {}),
    lastMessageStatus: message?.deliveryStatus || 'sent',
    pinnedAt: 0,
  };
}

export function projectRemoteChatSummary(
  summary: RemoteChatSummary
): ProjectedChatSummaryPatch | null {
  const conversationId = toText(summary.chatId || summary.conversationId);
  if (!conversationId) {
    return null;
  }

  const title = toText(summary.chatName || summary.title || summary.name) || conversationId;
  const lastMessageText = toText(summary.lastRunContent || summary.lastMessageText);
  const hasLastMessageText = Boolean(lastMessageText);
  const updatedAt = parseTimestamp(
    summary.updatedAt || summary.lastRunCompletedAt || summary.createdAt || summary.timestamp,
    Date.now()
  );
  const agentKey = toText(summary.firstAgentKey || summary.agentKey);
  const teamId = toText(summary.teamId);
  const hasUnreadState = hasChatReadStateInput(summary);
  const read = hasUnreadState ? normalizeChatReadState(summary) : undefined;

  return {
    conversationId,
    title,
    ...(hasLastMessageText
      ? {
          lastMessageText,
          lastMessageAt: updatedAt,
          lastMessageStatus: 'sent' as const,
        }
      : {}),
    ...(read ? { unreadCount: readStateToUnreadBit(read), read } : {}),
    agentKey: agentKey || null,
    teamId: teamId || null,
  };
}

export function projectRemoteChatDetail(
  detail: RemoteChatDetail,
  fallbackSummary?: RemoteChatSummary | null
): ProjectedConversationDetail | null {
  const conversationId = toText(detail.chatId || fallbackSummary?.chatId);
  if (!conversationId) {
    return null;
  }

  const title =
    toText(detail.chatName || fallbackSummary?.chatName || fallbackSummary?.title) ||
    conversationId;
  const hasExplicitReadState = hasChatReadStateInput(detail);
  const read = hasExplicitReadState
    ? normalizeChatReadState(detail)
    : normalizeChatReadState(fallbackSummary);
  const events = buildDetailTimelineEvents(detail, conversationId, title);
  const timelineState = deriveChatTimelineState(conversationId, events);
  const runtimeState = projectTimelineRuntimeState(timelineState);
  const messages = projectTimelineMessages(timelineState);

  const fallbackUpdatedAt = parseTimestamp(
    detail.updatedAt || fallbackSummary?.updatedAt,
    Date.now()
  );
  const summary = buildSummaryFromMessage(
    conversationId,
    title,
    hasExplicitReadState ? read : undefined,
    messages[messages.length - 1] || null,
    fallbackUpdatedAt
  );

  return {
    conversationId,
    title,
    unreadCount: readStateToUnreadBit(read),
    read,
    hasExplicitReadState,
    activeRunId: timelineState.activeRunId,
    timelineState,
    runtimeState,
    summary,
    messages,
  };
}
