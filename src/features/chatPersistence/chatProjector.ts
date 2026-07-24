import type {
  RemoteChatActiveRun,
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
  normalizeChatTimelineArtifactEvent,
  projectTimelineMessages,
  projectTimelineRuntimeState,
  resolveChatTimelineUsageModelKey,
} from '../chatTimeline/index.ts';
import type { ChatTimelineState } from '../chatTimeline/index.ts';
import {
  CHAT_CONVERSATION_FALLBACK_TITLE,
  resolveChatConversationTitleCandidate,
} from './chatConversationTitle.ts';
import type { ChatHomeItem, ChatMessageItem, ChatMessageStatus, ChatReadState } from './types';
import {
  hasChatReadStateInput,
  normalizeChatReadState,
  readStateToUnreadBit,
} from './chatReadState.ts';

type ProjectedConversationSummary = Omit<ChatHomeItem, 'title' | 'read' | 'unreadCount'> & {
  title?: string;
  read?: ChatReadState;
  unreadCount?: number;
};

export type ProjectedDetailActiveRun = {
  runId: string;
  agentKey: string;
  lastSeq: number;
};

export type ProjectedConversationDetail = {
  conversationId: string;
  title?: string;
  unreadCount: number;
  read: ChatReadState;
  hasExplicitReadState: boolean;
  activeRunId: string;
  activeRun: ProjectedDetailActiveRun | null;
  timelineState: ChatTimelineState;
  runtimeState: ChatConversationRuntimeState;
  summary: ProjectedConversationSummary;
  messages: ChatMessageItem[];
};

export type ProjectedChatSummaryPatch = {
  conversationId: string;
  title?: string;
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
  hasPlanEvent: boolean;
  latestUsageSnapshot: DetailUsageSnapshotRef | null;
  latestCompactUsage: Record<string, unknown> | null;
  latestCompactPostTokensAfterUsage: number | null;
  lastTimestamp: number;
  contentRunIds: Set<string>;
  requestQueryRunIds: Set<string>;
  runCompleteIds: Set<string>;
  runStartIds: Set<string>;
  artifactKeys: Set<string>;
};

function createDetailTimelineEventIndex(): DetailTimelineEventIndex {
  return {
    hasAnyRequestQuery: false,
    hasPlanningEvent: false,
    hasPlanEvent: false,
    latestUsageSnapshot: null,
    latestCompactUsage: null,
    latestCompactPostTokensAfterUsage: null,
    lastTimestamp: 0,
    contentRunIds: new Set(),
    requestQueryRunIds: new Set(),
    runCompleteIds: new Set(),
    runStartIds: new Set(),
    artifactKeys: new Set(),
  };
}

function getPlanSnapshotKey(value: unknown): string {
  if (!isObjectRecord(value)) {
    return '';
  }
  return toText(value.planId || value.id || value.title || value.name);
}

function getArtifactSnapshotKey(value: unknown, fallbackIndex = -1): string {
  if (!isObjectRecord(value)) {
    return fallbackIndex >= 0 ? `artifact-${fallbackIndex}` : '';
  }
  return (
    toText(
      value.artifactId ||
        value.id ||
        value.sha256 ||
        value.url ||
        value.name ||
        value.path ||
        value.sandboxPath
    ) ||
    (fallbackIndex >= 0 ? `artifact-${fallbackIndex}` : '')
  );
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
  if (type.startsWith('plan.')) {
    index.hasPlanEvent = true;
  }
  if (type === 'artifact.publish') {
    normalizeChatTimelineArtifactEvent(event, timestamp || eventOrder).forEach((artifact) => {
      index.artifactKeys.add(artifact.artifactId);
    });
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

function appendDetailPlanSnapshotEvent(
  events: RemoteChatEvent[],
  index: DetailTimelineEventIndex,
  detail: RemoteChatDetail,
  conversationId: string,
  timestamp: number
): void {
  const plan = isObjectRecord(detail.plan) ? detail.plan : null;
  if (!plan || index.hasPlanEvent) {
    return;
  }

  appendDetailTimelineEvent(events, index, {
    type: 'plan.update',
    chatId: conversationId,
    runId: toText(plan.runId),
    planId: getPlanSnapshotKey(plan) || 'plan',
    title: toText(plan.title || plan.name),
    status: toText(plan.status),
    text: toText(plan.text || plan.summary || plan.title),
    payload: plan,
    timestamp,
  });
}

function appendDetailArtifactSnapshotEvents(
  events: RemoteChatEvent[],
  index: DetailTimelineEventIndex,
  detail: RemoteChatDetail,
  conversationId: string,
  timestamp: number
): void {
  const artifact = isObjectRecord(detail.artifact) ? detail.artifact : null;
  const items = Array.isArray(artifact?.items)
    ? artifact.items.filter((item): item is Record<string, unknown> => isObjectRecord(item))
    : [];
  items.forEach((item, itemIndex) => {
    const artifactKey = getArtifactSnapshotKey(item, itemIndex);
    if (index.artifactKeys.has(artifactKey)) {
      return;
    }

    appendDetailTimelineEvent(events, index, {
      type: 'artifact.publish',
      chatId: conversationId,
      runId: toText(item.runId),
      artifactId: artifactKey,
      name: toText(item.name),
      title: toText(item.name) || toText(item.title) || artifactKey,
      mimeType: toText(item.mimeType),
      url: toText(item.url),
      sha256: toText(item.sha256),
      sizeBytes: toFiniteNumber(item.sizeBytes) ?? toFiniteNumber(item.size) ?? undefined,
      payload: item,
      timestamp: parseTimestamp(
        item.timestamp || item.createdAt || item.updatedAt,
        timestamp + itemIndex
      ),
    });
  });
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

function toNonNegativeInteger(value: unknown): number {
  const numeric = toFiniteNumber(value);
  return numeric !== null && numeric > 0 ? Math.floor(numeric) : 0;
}

function isTerminalActiveRunState(value: unknown): boolean {
  const state = toText(value).toLowerCase();
  return (
    state === 'complete' ||
    state === 'completed' ||
    state === 'done' ||
    state === 'error' ||
    state === 'failed' ||
    state === 'cancelled' ||
    state === 'canceled'
  );
}

function readDetailActiveRun(
  detail: RemoteChatDetail
): (RemoteChatActiveRun & Record<string, unknown>) | null {
  return isObjectRecord(detail.activeRun) ? detail.activeRun : null;
}

function projectDetailActiveRun(detail: RemoteChatDetail): ProjectedDetailActiveRun | null {
  const activeRun = readDetailActiveRun(detail);
  const runId = getRunId(activeRun);
  if (!activeRun || !runId || isTerminalActiveRunState(activeRun.state)) {
    return null;
  }
  return {
    runId,
    agentKey: toText(activeRun.agentKey),
    lastSeq: toNonNegativeInteger(activeRun.lastSeq),
  };
}

function getRunModelKey(run: Record<string, unknown> | null): string {
  if (!run) {
    return '';
  }
  return resolveChatTimelineUsageModelKey(run) || resolveChatTimelineUsageModelKey(run.usage);
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
  const latestUsageEventModelKey = resolveChatTimelineUsageModelKey(latestUsageSnapshot?.event);
  const modelKey =
    resolveChatTimelineUsageModelKey(activeRun) ||
    getRunModelKey(runWithUsage) ||
    getRunModelKey(latestRun) ||
    latestUsageEventModelKey ||
    resolveChatTimelineUsageModelKey(detail);
  const enrichedContextWindow =
    contextWindow && modelKey && toText(contextWindow.modelKey) !== modelKey
      ? { ...contextWindow, modelKey }
      : contextWindow;
  const hasContextEnrichment =
    compactPostTokens !== null ||
    (Boolean(baseContextWindow) && !isObjectRecord(latestUsageSnapshot?.event.contextWindow));
  const hasModelEnrichment =
    Boolean(modelKey) && modelKey !== latestUsageEventModelKey;
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
    ...(enrichedContextWindow ? { contextWindow: enrichedContextWindow } : {}),
    ...(usage ? { usage } : {}),
    timestamp,
  };
}

function buildDetailTimelineEvents(
  detail: RemoteChatDetail,
  conversationId: string,
  title: string,
  activeRun: ProjectedDetailActiveRun | null
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

  if (
    activeRun &&
    !eventIndex.runStartIds.has(activeRun.runId) &&
    !eventIndex.runCompleteIds.has(activeRun.runId)
  ) {
    const activeRunRecord = readDetailActiveRun(detail);
    appendDetailTimelineEvent(events, eventIndex, {
      type: 'run.start',
      chatId: conversationId,
      runId: activeRun.runId,
      agentKey: activeRun.agentKey,
      timestamp: parseTimestamp(
        activeRunRecord?.startedAt,
        (eventIndex.lastTimestamp || baseTimestamp) + 1
      ),
    });
  }

  appendDetailPlanSnapshotEvent(
    events,
    eventIndex,
    detail,
    conversationId,
    (eventIndex.lastTimestamp || baseTimestamp) + 1
  );
  appendDetailArtifactSnapshotEvents(
    events,
    eventIndex,
    detail,
    conversationId,
    (eventIndex.lastTimestamp || baseTimestamp) + 1
  );

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
  title: string | undefined,
  read: ChatReadState | undefined,
  message: Pick<ChatMessageItem, 'content' | 'createdAt' | 'deliveryStatus'> | null,
  fallbackUpdatedAt: number
): ProjectedConversationSummary {
  const lastMessageText = message?.content || '';
  const lastMessageAt = message?.createdAt || fallbackUpdatedAt || Date.now();
  return {
    conversationId,
    ...(title ? { title } : {}),
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

  const title = resolveChatConversationTitleCandidate(
    summary.chatName,
    summary.title,
    summary.name
  );
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
    ...(title ? { title } : {}),
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

  const remoteTitle = resolveChatConversationTitleCandidate(
    detail.chatName,
    detail.title,
    detail.name,
    fallbackSummary?.chatName,
    fallbackSummary?.title
  );
  const hasExplicitReadState = hasChatReadStateInput(detail);
  const read = hasExplicitReadState
    ? normalizeChatReadState(detail)
    : normalizeChatReadState(fallbackSummary);
  const detailActiveRun = projectDetailActiveRun(detail);
  const events = buildDetailTimelineEvents(
    detail,
    conversationId,
    remoteTitle || CHAT_CONVERSATION_FALLBACK_TITLE,
    detailActiveRun
  );
  const timelineState = deriveChatTimelineState(conversationId, events);
  const activeRun = detailActiveRun?.runId === timelineState.activeRunId ? detailActiveRun : null;
  const runtimeState = projectTimelineRuntimeState(timelineState);
  const messages = projectTimelineMessages(timelineState);
  const firstUserMessage = messages.find((message) => message.role === 'user');
  const title =
    resolveChatConversationTitleCandidate(firstUserMessage?.content) || remoteTitle;

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
    ...(title ? { title } : {}),
    unreadCount: readStateToUnreadBit(read),
    read,
    hasExplicitReadState,
    activeRunId: timelineState.activeRunId,
    activeRun,
    timelineState,
    runtimeState,
    summary,
    messages,
  };
}
