import { readTimelineViewBindings } from '../chatTimeline/timelineView';
import { readChatDirectory, classifyCloudFailure } from '../../core/api/services/chatDirectoryApi';
import { getCloudAuthSnapshot, reportCloudFailure } from '../../core/auth/cloudAuth';
import { verifyDefaultCloud } from '../chatPersistence/cloudAccess';
import { applyChatTimelineRunDerivation } from '../chatTimeline/timelineRunDerivation.ts';
import {
  CHAT_DERIVE_TRANSPORT_TYPE,
  validateChatDerivationResponse,
  isDefinitiveChatDerivationRejection,
  type ChatDerivation
} from '../../core/api/services/chatDerivationProtocol.ts';
import { applyChatTimelineRunFeedback } from '../chatTimeline/timelineRunFeedback.ts';
import {
  CHAT_FEEDBACK_TRANSPORT_TYPE,
  MAX_FEEDBACK_COMMENT_CHARS,
  validateChatFeedbackResponse,
  type ChatFeedbackType
} from '../../core/api/services/chatFeedbackProtocol.ts';
import { assertChatReferenceScope, type ChatReferenceOption } from '../chatPersistence/chatContextReference.ts';
import {
  applyChatTimelineRunAccess,
  getChatTimelineRun,
  readRunAccessLevel
} from '../chatTimeline/timelineRunAccess.ts';
import {
  CHAT_SKILLS_TRANSPORT_TYPE,
  normalizeChatSkills,
  normalizeSkillIds,
  resolveSkillIds,
  type ChatSkillsCatalog
} from '../../core/api/services/chatSkillsProtocol.ts';
import {
  readChatViewReference,
  type ChatViewDocument,
  type ChatViewRequest
} from '../../core/api/services/chatViewProtocol.ts';
import { canContinueChatTimeline, hasEstablishedChatQuery } from '../chatPersistence/chatDetailViewModel';
import { hasValidAgentInteraction, resolveAgentInteraction } from '../chatPersistence/agentInteraction';
import { assertRemoteChatDetailTimes } from '../../core/api/services/chatRemoteTimeProtocol';
import {
  isChatTimelineContentEventClosed,
  reconcileChatTimelineAwaitingSnapshot,
  clearChatTimelineToolTransientState
} from '../chatTimeline/timelineReducer';
import { buildChatRunOwnerPayload } from '../../core/api/services/chatRunOwner';
import { Platform } from 'react-native';
import { encodeChatSourceId } from '../chatPersistence/chatSource.ts';

import { ApiError } from '../../core/api/apiClient';
import { resolveActiveWsTransportConfig, resolveDefaultWsTransportConfig } from '../../core/api/activeWsTransport';
import { APP_VERSION } from '../../shared/generated/brand';
import {
  CHAT_DETAIL_TRANSPORT_TYPE,
  CHAT_ACCESS_LEVEL_TRANSPORT_TYPE,
  type ChatAccessLevelResponse,
  CHAT_AGENT_DETAIL_TRANSPORT_TYPE,
  CHAT_READ_TRANSPORT_TYPE,
  CHAT_SUBMIT_TRANSPORT_TYPE,
  CHAT_STEER_TRANSPORT_TYPE,
  type ChatSteerResponse,
  CHAT_SUMMARIES_TRANSPORT_TYPE,
  REMOTE_CHAT_PAGE_SIZE,
  buildAgentDetailPayload,
  buildChatDetailPayload,
  buildChatSummariesPayload,
  buildMarkChatReadPayload,
  buildSubmitFrontendToolPayload,
  buildSubmitAwaitingPayload,
  readAwaitingSubmitParam,
  projectRemoteAgentDetail,
  type AgentDetailSnapshot,
  type AwaitingSubmitPayloadData,
  type ChatApiEnvelope,
  type FrontendToolSubmitPayloadData,
  type MarkChatReadRequest,
  type MarkChatReadResponse,
  type RemoteAgentDetail,
  type RemoteChatDetail,
  type RemoteChatSummary,
  type SubmitAwaitingResponse,
  type SubmitFrontendToolResponse,
  unwrapChatApiEnvelope
} from '../../core/api/services/chatApi';
import {
  buildAgentModelConfigPayload,
  readAgentModelOverride,
  normalizeModelOptionsAgentKey,
  type ModelOptionsSnapshot,
  type QueryModelOverride
} from '../../core/api/services/modelOptionsProtocol';
import { getModelOptionsApi, updateAgentModelConfigApi } from '../../core/api/services/modelOptionsApi';
import {
  appendAssistantDelta,
  clearChatLocalCacheForScope,
  clearChatConversationForScope,
  createOutgoingMessage,
  retryOutgoingMessage,
  getConversationDetail,
  getConversationHistoryScope,
  getConversationInitialTimelineState,
  getConversationMessagesDiagnosticSnapshot,
  getConversationSyncState,
  getConversationTarget,
  getConversationTimelineDiagnosticSnapshot,
  hasChatLocalConversations,
  inspectChatLocalCacheScope,
  getMessageByClientMessageId,
  getMessageByServerMessageId,
  markConversationDirty,
  markConversationReadScopeLocal,
  markConversationSynced,
  patchConversationSummary,
  patchMessageByClientMessageId,
  persistConversationTimelineState,
  prewarmChatHomeDirectory,
  reconcileConversationDetail,
  refreshChatDirectoryProjectionForConversation,
  markConversationSourceDeleted,
  replaceChatHomeProjection,
  setConversationActiveRunId,
  setConversationReadStateLocal,
  upsertProjectedMessage
} from '../chatPersistence/chatRepository';
import { getChatCacheScopeId, normalizeChatCacheScopeId } from '../chatPersistence/cacheScope';
import type { ChatConversationDiagnosticSource } from '../chatPersistence/chatConversationDiagnostic';
import { hasChatReadStateInput, normalizeChatReadState } from '../chatPersistence/chatReadState';
import { projectRemoteHomeDirectory, type RemoteAgent } from '../chatPersistence/chatDirectoryProjector';
import { projectRemoteChatDetail, projectRemoteChatSummary } from '../chatPersistence/chatProjector';
import {
  createMessageAttachmentsFromReferences,
  formatChatAttachmentsMessageText,
  normalizeChatAttachmentReferences
} from '../chatPersistence/chatAttachmentModels';
import type {
  ChatComposerAttachment,
  ChatHomeItem,
  ChatMessageAttachment,
  ChatMessageItem
} from '../chatPersistence/types';
import {
  buildAssistantMessageId,
  buildFallbackAssistantMessageId,
  classifyChatProtocolEvent,
  extractAgentKey,
  extractConversationId,
  extractEventText,
  extractMessageRole,
  extractTitle,
  normalizeEventType,
  toFiniteNumber,
  toText
} from './routing';
import {
  attachChatRun,
  requestChatTransport,
  startChatPushTransport,
  stopChatPushTransport,
  streamChatQuery,
  updateChatTransportAuth,
  type ChatQueryAccessLevel,
  type ChatQueryModelOverride,
  type ChatTransportConfig
} from './chatWsTransport';
import {
  type ChatDirectorySyncSnapshot,
  ChatHomeItemPatch,
  ChatPendingSteer,
  ChatSocketStatus,
  ChatSyncEvent,
  ChatSyncReason
} from './types';
import { WsClientDisconnectedError, WsClientRequestTimeoutError } from '../../core/ws/wsClient';
import { getChatSourceFromId, getRemoteChatSourceId, type ChatSource } from '../chatPersistence/chatSource';
import {
  getDefaultChatSource,
  getActiveChatSource,
  isAccountDesktopChatSource
} from '../chatPersistence/chatSourceRuntime';
import { scopeChatPayload, scopeRemoteHomePayload, unscopeChatPayload } from './chatSourcePayload';
import {
  applyChatTimelineEvent,
  applyChatTimelineMessage,
  applyChatTimelineRunUnavailable,
  applyChatTimelineStreamDelta,
  createChatTimelineActionNodeId,
  createChatTimelineState,
  getActiveChatTimelineFrontendTool,
  getChatTimelineActiveRunId,
  mergeChatTimelineState,
  patchChatTimelineMessage,
  projectTimelineMessages,
  projectTimelineRuntimeState,
  resolveChatTimelineFrontendTool,
  type ChatTimelineFrontendToolResolution
} from '../chatTimeline/index.ts';
import type { ChatTimelineState } from '../chatTimeline/index.ts';
import { getLatestFailedChatSubmission, getRecoverableChatSubmission } from './chatSubmissionRecovery.ts';
import { formatChatTimelinePlatformErrorForDisplay } from '../chatTimeline/timelinePlatformError.ts';

type SyncListener = (event: ChatSyncEvent) => void;
type ChatTransportResolver = () => ChatTransportConfig | null | Promise<ChatTransportConfig | null>;

type ChatSendMessageOptions = {
  accessLevel?: ChatQueryAccessLevel;
  dispatchErrorMode?: 'throw' | 'return';
  model?: ChatQueryModelOverride;
  planningMode?: boolean;
  editingMode?: boolean;
  skillIds?: readonly string[];
  continuation?: boolean;
};

type ChatSendMessageResult = Omit<Awaited<ReturnType<typeof createOutgoingMessage>>, 'message'> & {
  message: ChatMessageItem;
  dispatchError: Error | null;
};

export type ChatHomeRefreshFailure = {
  source: ChatSource;
  message: string;
};

export type ChatCacheScopeClearResult = {
  scopeId: string;
  currentScope: boolean;
  status: 'success' | 'error';
  databaseStatus: 'cleared' | 'deleted' | 'missing' | null;
  errorMessage: string | null;
};

type TimelineRunContextOptions = NonNullable<Parameters<typeof applyChatTimelineMessage>[2]>;

function describeConversationDiagnosticError(error: unknown) {
  if (error instanceof ApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      payload: error.payload
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return {
    name: 'UnknownError',
    message: String(error)
  };
}

type StreamBuffer = {
  key: string;
  conversationId: string;
  messageId: string;
  runId: string;
  createdAt: number;
  content: string;
  serverMessageId: string | null;
  title: string;
  reason: ChatSyncReason;
  pendingUiDelta: string;
  pendingUiSnapshotText?: string;
  pendingDbDelta: string;
  pendingDbSnapshotText?: string;
  publishedToTimeline: boolean;
  publishedStreamStatus?: ChatMessageItem['streamStatus'];
  uiTimer: ReturnType<typeof setTimeout> | null;
  dbTimer: ReturnType<typeof setTimeout> | null;
};

type ReconcileState = {
  inFlight: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
  trailingReason: ChatSyncReason | null;
};

type ActiveAttachState = {
  token: number;
  runId: string;
  agentKey?: string;
  lastSeq: number;
  phase: 'pending' | 'active';
  promise: Promise<void>;
  abort: () => void;
};

type DuplicateAttachState = {
  runId: string;
  agentKey?: string;
  observedAt: number;
};

type ActiveOutgoingStreamState = {
  conversationId: string;
  clientMessageId: string;
  abort: () => void;
};

type ReadMarkState = {
  markedAt: number;
  marker: string;
};

type StoppingConversationState = {
  runId: string;
  startedAt: number;
};

type UnavailableAttachRunState = {
  runId: string;
  markedAt: number;
};

type InterruptChatResponse = {
  accepted?: boolean;
  status?: string;
  detail?: string;
  [key: string]: unknown;
};

const STREAM_UI_FLUSH_MS = 64;
const STREAM_DB_FLUSH_MS = 320;
const RUNTIME_EMIT_FLUSH_MS = 48;
const TIMELINE_PERSIST_DEBOUNCE_MS = 420;
const RECONCILE_DEBOUNCE_MS = 180;
const READ_MARK_DEBOUNCE_MS = 1_500;
const STOPPING_CONVERSATION_TTL_MS = 8_000;
const DUPLICATE_ATTACH_COOLDOWN_MS = 8_000;
const UNAVAILABLE_ATTACH_RUN_TTL_MS = 30 * 60_000;
const CHAT_INTERRUPT_TRANSPORT_TYPE = '/api/interrupt';

function buildFallbackSummary(summary: ChatHomeItem | null) {
  if (!summary) {
    return null;
  }

  return {
    chatId: summary.conversationId,
    chatName: summary.title,
    title: summary.title,
    lastRunContent: summary.lastMessageText,
    updatedAt: summary.lastMessageAt,
    read: summary.read,
    unreadRunCount: summary.unreadCount
  };
}

function findSingleStreamBufferByRun(
  buffers: Iterable<StreamBuffer>,
  conversationId: string,
  runId: string
): StreamBuffer | undefined {
  let candidate: StreamBuffer | undefined;

  for (const buffer of buffers) {
    if (buffer.conversationId !== conversationId || buffer.runId !== runId) {
      continue;
    }
    if (candidate) {
      return undefined;
    }
    candidate = buffer;
  }

  return candidate;
}

function createAwaitingSubmitId(): string {
  return `submit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createRunControlRequestId(kind: string): string {
  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildInterruptChatPayload(input: { requestId: string; chatId: string; runId: string; agentKey?: string }) {
  return {
    requestId: toText(input.requestId),
    chatId: toText(input.chatId),
    runId: toText(input.runId),
    ...buildChatRunOwnerPayload(input),
    message: ''
  };
}

function isMissingAgentKeyError(error: Error): boolean {
  return /agentKey\s+is\s+required/i.test(error.message);
}

function isApiStatusError(error: unknown, status: number): boolean {
  if (error instanceof ApiError) {
    return error.status === status;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as { status?: unknown; code?: unknown };
  const candidateStatus = Number(record.status);
  if (Number.isFinite(candidateStatus) && candidateStatus === status) {
    return true;
  }
  const candidateCode = Number(record.code);
  return Number.isFinite(candidateCode) && candidateCode === status;
}

function isRecoverableReconcileError(error: unknown): boolean {
  return (
    error instanceof WsClientDisconnectedError ||
    error instanceof WsClientRequestTimeoutError ||
    isApiStatusError(error, 401) ||
    isApiStatusError(error, 404)
  );
}

function getUnknownErrorText(error: unknown): string {
  if (error instanceof Error) {
    const record = error as Error & {
      code?: unknown;
      data?: unknown;
      payload?: unknown;
      status?: unknown;
    };
    return [error.message, record.status, record.code, record.data, record.payload]
      .map((value) => {
        if (typeof value === 'string') {
          return value;
        }
        if (value == null) {
          return '';
        }
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(' ');
  }
  if (!error || typeof error !== 'object') {
    return String(error || '');
  }

  const record = error as { code?: unknown; data?: unknown; payload?: unknown; status?: unknown };
  return [record.status, record.code, record.data, record.payload]
    .map((value) => {
      if (typeof value === 'string') {
        return value;
      }
      if (value == null) {
        return '';
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(' ');
}

function isInactiveRunError(error: unknown): boolean {
  const text = getUnknownErrorText(error).toLowerCase();
  return (
    isApiStatusError(error, 404) ||
    text.includes('run_not_found') ||
    text.includes('run not found') ||
    text.includes('no longer active') ||
    text.includes('not active') ||
    text.includes('inactive')
  );
}

function isDuplicateObserveError(error: Error): boolean {
  const text = getUnknownErrorText(error).toLowerCase();
  return text.includes('duplicate_observe') || text.includes('already observing');
}

function normalizeAttachLastSeq(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function findTimelineRunAgentKey(state: ChatTimelineState, runId: string): string {
  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (node?.kind === 'run' && node.runId === runId && node.agentKey) {
      return node.agentKey;
    }
  }
  return '';
}

function findTimelineAwaitingAgentKey(state: ChatTimelineState, runId: string): string {
  const awaiting = state.awaiting;
  if (awaiting?.runId === runId && awaiting.interactive) {
    return toText(awaiting.interactive.agentKey);
  }

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (node?.kind === 'awaiting' && node.runId === runId && node.interactive) {
      return toText(node.interactive.agentKey);
    }
  }
  return '';
}

const CHAT_DIRECTORY_READ_TIMEOUT_MS = 15_000;
const EMPTY_DIRECTORY_SYNC_SNAPSHOT: ChatDirectorySyncSnapshot = {
  sourceKey: '',
  scopeId: 'signed_out',
  status: 'idle',
  error: ''
};

class ChatSyncService {
  private readonly listeners = new Set<SyncListener>();
  private status: ChatSocketStatus = 'idle';
  private started = false;
  private startPromise: Promise<void> | null = null;
  private homeRefreshPromise: Promise<void> | null = null;
  private homeRefreshController: AbortController | null = null;
  private directorySyncSnapshot: ChatDirectorySyncSnapshot;
  private activeConversationId: string | null = null;
  private visibleConversationId: string | null = null;
  private readonly inFlightOutgoingIds = new Set<string>();
  private readonly streamBuffers = new Map<string, StreamBuffer>();
  private readonly reconcileStates = new Map<string, ReconcileState>();
  private readonly activeAttaches = new Map<string, ActiveAttachState>();
  private readonly attachRecoveryFailures = new Map<string, { runId: string; count: number }>();
  private readonly streamSequences = new Map<string, number>();
  private readonly recentDuplicateAttaches = new Map<string, DuplicateAttachState>();
  private readonly activeOutgoingStreams = new Map<string, ActiveOutgoingStreamState>();
  private readonly lastReadMarks = new Map<string, ReadMarkState>();
  private readonly readConfirmations = new Map<string, Promise<void>>();
  private readonly derivationRequests = new Set<string>();
  private readonly feedbackRequests = new Map<string, symbol>();
  private readonly runtimeAccessRequests = new Map<string, symbol>();
  private readonly pendingSteers = new Map<string, ChatPendingSteer>();
  private readonly conversationSendRequests = new Map<string, symbol>();
  private readonly awaitingSubmitRequests = new Map<string, Promise<SubmitAwaitingResponse>>();
  private readonly frontendToolSubmitRequests = new Map<string, Promise<SubmitFrontendToolResponse>>();
  private readonly timelineStates = new Map<string, ChatTimelineState>();
  private readonly agentSkills = new Map<string, ChatSkillsCatalog>();
  private readonly agentSkillRequests = new Map<string, Promise<ChatSkillsCatalog | null>>();
  private readonly agentDetails = new Map<string, AgentDetailSnapshot | null>();
  private readonly agentDetailRequests = new Map<string, Promise<AgentDetailSnapshot | null>>();
  private readonly agentModelConfigRequests = new Map<string, Promise<QueryModelOverride | null>>();
  private readonly agentModelOptions = new Map<string, ModelOptionsSnapshot>();
  private readonly agentModelOptionRequests = new Map<string, Promise<ModelOptionsSnapshot | null>>();
  private readonly stoppingConversations = new Map<string, StoppingConversationState>();
  private readonly unavailableAttachRuns = new Map<string, UnavailableAttachRunState>();
  private readonly remoteHistoryCursors = new Map<string, number | null>();
  private readonly runtimeEmitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timelinePersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingRuntimeEmitReasons = new Map<string, ChatSyncReason>();
  private lifecycleVersion = 0;
  private attachTokenSeq = 0;
  private hasConnectedOnce = false;
  private agentDetailCacheVersion = 0;
  private activeTransportConfig: ChatTransportConfig | null = null;

  constructor(
    readonly source: ChatSource,
    private readonly transportResolver: ChatTransportResolver
  ) {
    this.directorySyncSnapshot = {
      sourceKey: source.key,
      scopeId: getChatCacheScopeId(),
      status: 'idle',
      error: ''
    };
  }

  getDirectorySyncSnapshot(): ChatDirectorySyncSnapshot {
    return this.directorySyncSnapshot;
  }

  private setDirectorySyncStatus(status: ChatDirectorySyncSnapshot['status'], error = '') {
    this.directorySyncSnapshot = { ...this.directorySyncSnapshot, status, error };
    this.emit({ type: 'home.directory.sync' });
  }

  async getViewDocument(request: ChatViewRequest): Promise<ChatViewDocument> {
    const reference = readChatViewReference(request);
    if (
      !reference ||
      !request.chatId ||
      !['display', 'form'].includes(request.usage) ||
      (reference.source === 'connector' && !reference.hash)
    )
      throw new Error('Invalid VIEW request or missing snapshot hash');
    if (getChatSourceFromId(request.chatId).key !== this.source.key) throw new Error('VIEW belongs to another source');
    const lifecycleVersion = this.lifecycleVersion;
    const document = await this.requestChatApi<ChatViewDocument>('/api/view', request);
    const view = readChatViewReference(document?.view);
    if (!this.isLifecycleCurrent(lifecycleVersion)) throw new Error('VIEW source changed');
    if (
      !view ||
      view.source !== reference.source ||
      view.connectorId !== request.connectorId ||
      view.key !== request.key ||
      (request.hash && view.hash !== request.hash)
    )
      throw new Error('VIEW snapshot identity mismatch');
    return { ...document, view };
  }

  getStatus() {
    return this.status;
  }

  stopStreaming(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    const timelineState = this.getConversationTimelineState(normalizedConversationId);
    const attachedRunId = this.activeAttaches.get(normalizedConversationId)?.runId ?? '';
    const interruptRunId = getChatTimelineActiveRunId(timelineState) || attachedRunId;
    if (!interruptRunId || this.isStoppingConversation(normalizedConversationId, interruptRunId)) return;
    this.rememberStoppingConversation(normalizedConversationId, interruptRunId);
    // Keep observing until the server confirms a terminal run. Rejection and
    // timeout must not manufacture a cancelled run or clear its persisted owner.
    void this.requestConversationInterrupt(normalizedConversationId, interruptRunId).catch(() => {
      void markConversationDirty(normalizedConversationId, 'interrupt');
    });
  }

  async resumeStreaming(conversationId: string) {
    const id = toText(conversationId);
    if (!id) return;
    await this.scheduleConversationReconcile(id, 'reconcile', true);
    if (!canContinueChatTimeline(this.getConversationTimelineState(id))) throw new Error('Chat cannot continue');
    return this.sendMessage(id, '', [], { continuation: true });
  }

  getConversationRuntimeState(conversationId: string) {
    return projectTimelineRuntimeState(this.getConversationTimelineState(conversationId));
  }

  getConversationTimelineState(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return createChatTimelineState('');
    }

    return this.timelineStates.get(normalizedConversationId) ?? createChatTimelineState(normalizedConversationId);
  }

  getAgentDetailSnapshot(agentKey: string): AgentDetailSnapshot | null {
    const normalizedAgentKey = toText(agentKey);
    if (!normalizedAgentKey) {
      return null;
    }
    return this.agentDetails.get(normalizedAgentKey) ?? null;
  }

  async ensureAgentDetail(
    agentKey: string,
    options: { refresh?: boolean; throwOnError?: boolean } = {}
  ): Promise<AgentDetailSnapshot | null> {
    const normalizedAgentKey = toText(agentKey);
    if (!normalizedAgentKey) {
      return null;
    }

    const cached = this.agentDetails.get(normalizedAgentKey);
    if (!options.refresh && cached && Date.now() - cached.fetchedAt < 30_000) return cached;

    const inFlight = this.agentDetailRequests.get(normalizedAgentKey);
    if (inFlight) return options.throwOnError ? inFlight : inFlight.catch(() => null);

    const cacheVersion = this.agentDetailCacheVersion;
    const request = this.fetchAgentDetail(normalizedAgentKey, cacheVersion).finally(() => {
      if (this.agentDetailRequests.get(normalizedAgentKey) === request) {
        this.agentDetailRequests.delete(normalizedAgentKey);
      }
    });
    this.agentDetailRequests.set(normalizedAgentKey, request);
    return options.throwOnError ? request : request.catch(() => null);
  }

  async ensureAgentSkills(agentKey: string): Promise<ChatSkillsCatalog | null> {
    const key = toText(agentKey);
    if (!key) return null;
    const cached = this.agentSkills.get(key);
    if (cached && Date.now() - cached.fetchedAt < 30_000) return cached;
    const pending = this.agentSkillRequests.get(key);
    if (pending) return pending;
    const version = this.agentDetailCacheVersion;
    const request = (async () => {
      const [response, detail] = await Promise.all([
        this.requestChatApi<unknown>(CHAT_SKILLS_TRANSPORT_TYPE, { agentKey: key }),
        this.ensureAgentDetail(key, { throwOnError: true })
      ]);
      if (version !== this.agentDetailCacheVersion) return null;
      if (!detail || !resolveAgentInteraction(detail.raw.interactionConfig).attachment.skills)
        throw new Error('Agent does not support required skills');
      const catalog = normalizeChatSkills(response, detail.raw.skills);
      if (!this.agentSkills.has(key) && this.agentSkills.size >= 32)
        this.agentSkills.delete(this.agentSkills.keys().next().value!);
      this.agentSkills.set(key, catalog);
      return catalog;
    })().finally(() => {
      if (this.agentSkillRequests.get(key) === request) this.agentSkillRequests.delete(key);
    });
    this.agentSkillRequests.set(key, request);
    return request;
  }

  getAgentModelOptionsSnapshot(agentKey: string): ModelOptionsSnapshot | null {
    const normalizedAgentKey = normalizeModelOptionsAgentKey(agentKey);
    if (!normalizedAgentKey) {
      return null;
    }
    return this.agentModelOptions.get(normalizedAgentKey) ?? null;
  }

  async ensureAgentModelOptions(
    agentKey: string,
    options: { refresh?: boolean } = {}
  ): Promise<ModelOptionsSnapshot | null> {
    const normalizedAgentKey = normalizeModelOptionsAgentKey(agentKey);
    if (!normalizedAgentKey) {
      return null;
    }

    if (!options.refresh && this.agentModelOptions.has(normalizedAgentKey)) {
      return this.agentModelOptions.get(normalizedAgentKey) ?? null;
    }

    const inFlight = this.agentModelOptionRequests.get(normalizedAgentKey);
    if (inFlight) {
      return inFlight;
    }

    const cacheVersion = this.agentDetailCacheVersion;
    const request = this.fetchAgentModelOptions(normalizedAgentKey, cacheVersion).finally(() => {
      if (this.agentModelOptionRequests.get(normalizedAgentKey) === request) {
        this.agentModelOptionRequests.delete(normalizedAgentKey);
      }
    });
    this.agentModelOptionRequests.set(normalizedAgentKey, request);
    return request;
  }

  updateAgentModelConfig(agentKey: string, modelOverride: QueryModelOverride): Promise<QueryModelOverride | null> {
    const normalizedAgentKey = normalizeModelOptionsAgentKey(agentKey);
    const normalizedPayload = buildAgentModelConfigPayload(normalizedAgentKey, modelOverride);
    const nextModelKey = String(normalizedPayload.modelKey || '').trim();
    if (!normalizedAgentKey || !nextModelKey) {
      return Promise.resolve(null);
    }

    const cacheVersion = this.agentDetailCacheVersion;
    const previous = this.agentModelConfigRequests.get(normalizedAgentKey);
    const request = (previous ? previous.catch(() => null) : Promise.resolve(null))
      .then(async () => {
        if (this.agentDetailCacheVersion !== cacheVersion) {
          return null;
        }
        const transport = await this.resolveTransportConfig();
        if (!transport || this.agentDetailCacheVersion !== cacheVersion) {
          return null;
        }
        const response = await updateAgentModelConfigApi(
          getRemoteChatSourceId(normalizedAgentKey),
          modelOverride,
          undefined,
          transport
        );
        if (this.agentDetailCacheVersion !== cacheVersion) {
          return null;
        }
        const saved = readAgentModelOverride(response);
        if (!saved.key) throw new Error('Invalid Agent model configuration response');
        const detail = this.agentDetails.get(normalizedAgentKey);
        if (detail) {
          this.agentDetails.set(normalizedAgentKey, {
            ...detail,
            raw: {
              ...detail.raw,
              modelKey: saved.key,
              reasoningEffort: saved.reasoningEffort,
              serviceTier: saved.serviceTier
            },
            fetchedAt: Date.now()
          });
        }
        return saved;
      })
      .finally(() => {
        if (this.agentModelConfigRequests.get(normalizedAgentKey) === request) {
          this.agentModelConfigRequests.delete(normalizedAgentKey);
        }
      });
    this.agentModelConfigRequests.set(normalizedAgentKey, request);
    return request;
  }

  private rememberStoppingConversation(conversationId: string, runId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    this.stoppingConversations.set(normalizedConversationId, {
      runId: toText(runId),
      startedAt: Date.now()
    });
  }

  private isStoppingConversation(conversationId: string, runId: string): boolean {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return false;
    }

    const state = this.stoppingConversations.get(normalizedConversationId);
    if (!state) {
      return false;
    }
    if (Date.now() - state.startedAt > STOPPING_CONVERSATION_TTL_MS) {
      this.stoppingConversations.delete(normalizedConversationId);
      return false;
    }

    const normalizedRunId = toText(runId);
    return !normalizedRunId || !state.runId || state.runId === normalizedRunId;
  }

  private clearStoppingConversation(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (normalizedConversationId) {
      this.stoppingConversations.delete(normalizedConversationId);
    }
  }

  private getUnavailableAttachRun(conversationId: string): UnavailableAttachRunState | null {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return null;
    }

    const state = this.unavailableAttachRuns.get(normalizedConversationId);
    if (!state) {
      return null;
    }
    if (Date.now() - state.markedAt > UNAVAILABLE_ATTACH_RUN_TTL_MS) {
      this.unavailableAttachRuns.delete(normalizedConversationId);
      return null;
    }
    return state;
  }

  private isUnavailableAttachRun(conversationId: string, runId: string): boolean {
    const normalizedRunId = toText(runId);
    const state = this.getUnavailableAttachRun(conversationId);
    return Boolean(normalizedRunId && state?.runId === normalizedRunId);
  }

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    listener({
      type: 'connection.status',
      status: this.status
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  async start() {
    if (this.started) {
      return;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    const lifecycleVersion = this.lifecycleVersion + 1;
    this.lifecycleVersion = lifecycleVersion;
    this.startPromise = this.startInternal(lifecycleVersion).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async refreshAuth() {
    if (!this.started && !this.startPromise) {
      return;
    }

    const config = await this.resolveTransportConfig();
    if (config) {
      updateChatTransportAuth(config);
    }
  }

  private async refreshDesktopTransportAuth() {
    const config = this.activeTransportConfig;
    if (!config || config.kind !== 'desktop-ws') {
      await this.refreshAuth();
      return;
    }

    try {
      if (config.accessTokenProvider) {
        const token = await config.accessTokenProvider(true);
        await requestChatTransport<unknown>({
          ...config,
          namespace: 'd',
          type: 'auth.refresh',
          payload: { token }
        });
        this.activeTransportConfig = { ...config, accessToken: token };
        updateChatTransportAuth(this.activeTransportConfig);
        return;
      }
      await this.refreshAuth();
    } catch {
      await this.refreshAuth();
    }
  }

  async prewarmHome() {
    await prewarmChatHomeDirectory();
  }

  stop(releaseConnection = false) {
    this.timelineStates.forEach((state, id) =>
      this.timelineStates.set(id, { ...clearChatTimelineToolTransientState(state), modelRetry: undefined })
    );
    this.lifecycleVersion += 1;
    this.homeRefreshController?.abort();
    this.homeRefreshController = null;
    this.homeRefreshPromise = null;
    this.setDirectorySyncStatus('idle');
    this.agentDetailCacheVersion += 1;
    this.started = false;
    this.hasConnectedOnce = false;
    const activeTransportConfig = this.activeTransportConfig;
    this.activeTransportConfig = null;
    this.clearTransientWork();
    stopChatPushTransport(activeTransportConfig ?? undefined, releaseConnection);
    this.setStatus('disconnected');
  }

  async resetLocalCacheForDevelopment() {
    const result = await this.clearLocalCacheScope(getChatCacheScopeId());
    if (result.status === 'error') {
      throw new Error(result.errorMessage || 'Failed to clear local cache');
    }
  }

  async hasActiveLocalConversations() {
    return hasChatLocalConversations();
  }

  async inspectLocalCacheScope(scopeId: string) {
    return inspectChatLocalCacheScope(scopeId);
  }

  async clearLocalCacheScope(scopeId: string): Promise<ChatCacheScopeClearResult> {
    const rawScopeId = String(scopeId || '').trim();
    const normalizedScopeId = normalizeChatCacheScopeId(rawScopeId);
    const active = rawScopeId === normalizedScopeId && normalizedScopeId === getChatCacheScopeId();
    if (!rawScopeId || normalizedScopeId !== rawScopeId) {
      return {
        scopeId: rawScopeId,
        currentScope: false,
        status: 'error',
        databaseStatus: null,
        errorMessage: 'Invalid chat cache scope id'
      };
    }
    if (active) {
      this.stop();
      this.startPromise = null;
      this.homeRefreshPromise = null;
      this.activeConversationId = null;
      this.hasConnectedOnce = false;
      this.inFlightOutgoingIds.clear();
      this.lastReadMarks.clear();
      this.readConfirmations.clear();
      this.frontendToolSubmitRequests.clear();
      this.awaitingSubmitRequests.clear();
      this.conversationSendRequests.clear();
      this.timelineStates.clear();
      this.pendingRuntimeEmitReasons.clear();
    }
    try {
      const result = await clearChatLocalCacheForScope(normalizedScopeId);
      return {
        scopeId: result.scopeId,
        currentScope: result.active,
        status: 'success',
        databaseStatus: result.database,
        errorMessage: null
      };
    } catch (error) {
      return {
        scopeId: normalizedScopeId,
        currentScope: active,
        status: 'error',
        databaseStatus: null,
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async clearLocalConversationCache(scopeId: string, conversationId: string): Promise<boolean> {
    const rawScopeId = String(scopeId || '').trim();
    const normalizedScopeId = normalizeChatCacheScopeId(rawScopeId);
    if (!rawScopeId || normalizedScopeId !== rawScopeId) {
      throw new Error('Invalid chat cache scope id');
    }
    if (normalizedScopeId === getChatCacheScopeId()) {
      this.stop();
      this.timelineStates.delete(conversationId);
      this.remoteHistoryCursors.delete(conversationId);
    }
    return clearChatConversationForScope(normalizedScopeId, conversationId);
  }

  async collectConversationDiagnosticData(conversationId: string): Promise<ChatConversationDiagnosticSource> {
    if (!__DEV__) {
      throw new Error('Conversation diagnostics are only available in development builds');
    }
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      throw new Error('Conversation id is required');
    }

    const generatedAt = Date.now();
    const transport = this.activeTransportConfig;
    const request = buildChatDetailPayload({
      chatId: normalizedConversationId,
      includeRawMessages: true
    });
    const remotePromise = this.requestRawChatApi(CHAT_DETAIL_TRANSPORT_TYPE, request)
      .then((response) => ({ response, error: null }))
      .catch((error) => ({
        response: null,
        error: describeConversationDiagnosticError(error)
      }));
    const [remote, summary, target, messages, syncState, persistedTimelineState] = await Promise.all([
      remotePromise,
      getConversationDetail(normalizedConversationId),
      getConversationTarget(normalizedConversationId),
      getConversationMessagesDiagnosticSnapshot(normalizedConversationId, 500),
      getConversationSyncState(normalizedConversationId),
      getConversationTimelineDiagnosticSnapshot(normalizedConversationId, 500)
    ]);

    return {
      generatedAt,
      environment: {
        platform: Platform.OS,
        appVersion: APP_VERSION,
        generatedAt,
        generatedAtIso: new Date(generatedAt).toISOString(),
        profile: {
          desktopDeviceId: this.source.kind === 'paired' ? this.source.sourceId : '',
          displayName: this.source.displayName,
          transportKind: transport?.kind === 'desktop-ws' ? 'desktop-ws' : 'http',
          endpoint: transport?.kind === 'desktop-ws' ? transport.wsUrl : transport?.backendUrl || '',
          cacheScopeId: getChatCacheScopeId(),
          needsRelink: false
        }
      },
      remote: {
        transportType: CHAT_DETAIL_TRANSPORT_TYPE,
        request,
        response: remote.response,
        error: remote.error
      },
      local: {
        summary,
        target,
        messages,
        syncState,
        persistedTimelineState
      }
    };
  }

  private clearTransientWork() {
    this.activeAttaches.forEach((attach) => attach.abort());
    this.activeAttaches.clear();
    this.attachRecoveryFailures.clear();
    this.streamSequences.clear();
    this.recentDuplicateAttaches.clear();
    this.activeOutgoingStreams.forEach((stream) => stream.abort());
    this.activeOutgoingStreams.clear();

    this.streamBuffers.forEach((buffer) => {
      if (buffer.uiTimer) {
        clearTimeout(buffer.uiTimer);
      }
      if (buffer.dbTimer) {
        clearTimeout(buffer.dbTimer);
      }
    });
    this.streamBuffers.clear();

    this.reconcileStates.forEach((state) => {
      if (state.timer) {
        clearTimeout(state.timer);
      }
    });
    this.reconcileStates.clear();
    this.runtimeEmitTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.runtimeEmitTimers.clear();
    this.timelinePersistTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.timelinePersistTimers.clear();
    this.readConfirmations.clear();
    this.frontendToolSubmitRequests.clear();
    this.awaitingSubmitRequests.clear();
    this.pendingSteers.forEach((_, conversationId) =>
      this.emit({ type: 'conversation.steer.changed', conversationId, pending: null })
    );
    this.pendingSteers.clear();
    this.runtimeAccessRequests.clear();
    this.conversationSendRequests.clear();
    this.inFlightOutgoingIds.clear();
    this.agentSkills.clear();
    this.agentSkillRequests.clear();
    this.agentDetails.clear();
    this.agentDetailRequests.clear();
    this.agentModelOptions.clear();
    this.agentModelConfigRequests.clear();
    this.agentModelOptionRequests.clear();
    this.stoppingConversations.clear();
    this.unavailableAttachRuns.clear();
    this.remoteHistoryCursors.clear();
  }

  setActiveConversationId(conversationId: string | null) {
    const normalizedConversationId = toText(conversationId) || null;
    if (this.activeConversationId === normalizedConversationId) {
      return;
    }

    const previousConversationId = this.activeConversationId;
    this.activeConversationId = normalizedConversationId;
    if (this.visibleConversationId !== normalizedConversationId) this.visibleConversationId = null;

    if (previousConversationId) {
      const state = this.timelineStates.get(previousConversationId);
      if (state)
        this.timelineStates.set(previousConversationId, {
          ...clearChatTimelineToolTransientState(state),
          modelRetry: undefined
        });
      this.attachRecoveryFailures.delete(previousConversationId);
      this.stopAttachedRun(previousConversationId);
    }

    if (!normalizedConversationId) {
      return;
    }

    void this.requestConversationReadConfirmation(normalizedConversationId, {
      onlyIfUnread: true
    });
    void this.attachActiveConversationRun(normalizedConversationId, 'attach');
  }

  setConversationVisible(conversationId: string, visible: boolean) {
    if (!visible) {
      if (this.visibleConversationId === conversationId) this.visibleConversationId = null;
      return;
    }
    if (this.activeConversationId !== conversationId) return;
    this.visibleConversationId = conversationId;
    void this.requestConversationReadConfirmation(conversationId, { onlyIfUnread: true });
  }

  async refreshHome(_reason: ChatSyncReason = 'manual_refresh') {
    if (this.homeRefreshPromise) return this.homeRefreshPromise;

    const lifecycleVersion = this.lifecycleVersion;
    const controller = new AbortController();
    this.homeRefreshController = controller;
    const isCurrent = () => this.isLifecycleCurrent(lifecycleVersion) && this.homeRefreshController === controller;
    const timer = setTimeout(() => controller.abort(), CHAT_DIRECTORY_READ_TIMEOUT_MS);
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new WsClientRequestTimeoutError('Chat directory read timed out')),
        { once: true }
      );
    });
    // Publish the single flight before notifying subscribers or resolving credentials.
    const task = Promise.resolve().then(async () => {
      try {
        const directory = await Promise.race([
          (async () => {
            if (!isCurrent() || controller.signal.aborted) return null;
            const config = await this.resolveTransportConfig();
            if (!isCurrent() || controller.signal.aborted) return null;
            if (!config) throw new ApiError('Not authenticated', 401, null);
            return readChatDirectory<RemoteAgent>(config, controller.signal);
          })(),
          cancelled
        ]);
        clearTimeout(timer);
        if (!directory || !isCurrent() || controller.signal.aborted) return;
        const scopedHome = scopeRemoteHomePayload(this.source, directory);
        await replaceChatHomeProjection(projectRemoteHomeDirectory(scopedHome), this.source);
        if (!isCurrent()) return;
        this.emit({ type: 'home.directory.replace' });
        this.setDirectorySyncStatus('ready');
      } catch (error) {
        if (!isCurrent()) return;
        this.setDirectorySyncStatus('error', error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        clearTimeout(timer);
        controller.abort(); // Also cancel a sibling directory read after either request fails.
        if (this.homeRefreshController === controller) {
          this.homeRefreshController = null;
          this.homeRefreshPromise = null;
        }
      }
    });
    this.homeRefreshPromise = task;
    this.setDirectorySyncStatus('loading');
    return task;
  }

  async markScopeRead(scope: { agentKey?: string | null }) {
    const agentKey = toText(scope.agentKey);
    if (!agentKey) {
      return;
    }

    const result = await markConversationReadScopeLocal({
      agentKey: agentKey || null,
      activeConversationId: this.activeConversationId
    });
    if (result.directoryChanged) {
      this.emit({
        type: 'home.directory.replace'
      });
    }

    try {
      await this.markChatReadViaTransport({
        ...(agentKey ? { agentKey } : {})
      });
    } catch {
      await this.refreshHome('manual_refresh');
    }
  }

  async reconcileConversation(conversationId: string, reason: ChatSyncReason = 'reconcile') {
    if (reason === 'manual_refresh' || reason === 'detail_open') this.attachRecoveryFailures.delete(conversationId);
    return this.scheduleConversationReconcile(conversationId, reason, true);
  }

  private async assertConversationWritable(conversationId: string) {
    if (this.source.kind === 'default' && getCloudAuthSnapshot().status !== 'available')
      throw new ApiError('Cloud is read-only while unavailable', 503, null);
    const summary = await getConversationDetail(conversationId);
    if (summary?.sourceDeleted) {
      throw new ApiError('Source conversation was deleted; cached content is read-only', 409, {
        code: 'SOURCE_DELETED'
      });
    }
    return summary;
  }

  resolveFrontendTool(conversationId: string, toolKey: string, reason: ChatTimelineFrontendToolResolution): boolean {
    const normalizedConversationId = toText(conversationId);
    const normalizedToolKey = toText(toolKey);
    if (!normalizedConversationId || !normalizedToolKey) {
      return false;
    }

    const currentState = this.getConversationTimelineState(normalizedConversationId);
    if (getActiveChatTimelineFrontendTool(currentState)?.key !== normalizedToolKey) {
      return false;
    }
    const nextState = resolveChatTimelineFrontendTool(currentState, normalizedToolKey, reason);
    if (nextState === currentState) {
      return false;
    }
    this.publishTimelineState(normalizedConversationId, 'frontend_tool', nextState);
    return true;
  }

  recordActionExecution(
    conversationId: string,
    outcome: {
      actionId: string;
      actionName: string;
      status: 'executed' | 'failed';
      result: Record<string, unknown> | null;
      reason: string;
    }
  ): boolean {
    const normalizedConversationId = toText(conversationId);
    const actionId = toText(outcome.actionId);
    const actionName = toText(outcome.actionName).toLowerCase();
    if (!normalizedConversationId || !actionId || !actionName) {
      return false;
    }
    const currentState = this.getConversationTimelineState(normalizedConversationId);
    const node = currentState.nodesById[createChatTimelineActionNodeId(normalizedConversationId, actionId)];
    if (
      node?.kind !== 'action' ||
      node.actionName !== actionName ||
      node.policy !== 'allowed' ||
      node.status === 'completed'
    ) {
      return false;
    }
    const nextState = applyChatTimelineEvent(currentState, normalizedConversationId, {
      type: outcome.status === 'executed' ? 'action.result' : 'action.fail',
      actionId,
      actionName,
      runId: node.runId,
      ...(outcome.status === 'executed'
        ? { result: outcome.result ?? {} }
        : { error: outcome.reason || 'Action execution failed' }),
      executionSource: 'mobile',
      timestamp: Math.max(Date.now(), node.updatedAt + 1)
    });
    if (nextState === currentState) {
      return false;
    }
    this.publishTimelineState(normalizedConversationId, 'action', nextState, { emitRuntime: true });
    return true;
  }

  submitFrontendTool(
    conversationId: string,
    payload: FrontendToolSubmitPayloadData
  ): Promise<SubmitFrontendToolResponse> {
    const normalizedConversationId = toText(conversationId);
    const toolKey = toText(payload.toolKey);
    const runId = toText(payload.runId);
    const toolId = toText(payload.toolId);
    if (!normalizedConversationId || !toolKey || !runId || !toolId || !isPlainRecord(payload.params)) {
      return Promise.reject(new Error('Conversation id, tool key, run id, tool id and params are required'));
    }

    const activeTool = getActiveChatTimelineFrontendTool(this.getConversationTimelineState(normalizedConversationId));
    if (!activeTool || activeTool.key !== toolKey || activeTool.runId !== runId || activeTool.toolId !== toolId) {
      return Promise.reject(new Error('Frontend tool is no longer active'));
    }

    const requestKey = JSON.stringify([normalizedConversationId, toolKey]);
    const pendingRequest = this.frontendToolSubmitRequests.get(requestKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    const lifecycleVersion = this.lifecycleVersion;
    const request: Promise<SubmitFrontendToolResponse> = (async () => {
      await this.assertConversationWritable(normalizedConversationId);
      const scope = await this.resolveRunControlScope(normalizedConversationId, runId);
      const currentTool = getActiveChatTimelineFrontendTool(
        this.getConversationTimelineState(normalizedConversationId)
      );
      if (
        !this.isLifecycleCurrent(lifecycleVersion) ||
        !currentTool ||
        currentTool.key !== toolKey ||
        currentTool.runId !== runId ||
        currentTool.toolId !== toolId
      ) {
        throw new Error('Frontend tool is no longer active');
      }

      const agentKey = toText(scope.agentKey);
      if (!agentKey) {
        throw new Error('agentKey is required for frontend tool submit');
      }

      const response =
        (await this.requestChatApi<SubmitFrontendToolResponse>(
          CHAT_SUBMIT_TRANSPORT_TYPE,
          buildSubmitFrontendToolPayload({
            chatId: normalizedConversationId,
            runId,
            agentKey,
            toolId,
            params: payload.params
          })
        )) || {};
      if (!this.isLifecycleCurrent(lifecycleVersion)) return response;
      const latestTool = getActiveChatTimelineFrontendTool(this.getConversationTimelineState(normalizedConversationId));
      if (latestTool?.key !== toolKey || latestTool.runId !== runId || latestTool.toolId !== toolId) return response;
      const accepted = response.accepted === true;
      const detail = toText(response.detail) || (accepted ? 'accepted' : 'unmatched');
      if (!accepted) {
        await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
        throw new Error(detail);
      }

      this.resolveFrontendTool(normalizedConversationId, toolKey, 'submitted');
      await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
      return response;
    })()
      .catch(async (error) => {
        if (this.isLifecycleCurrent(lifecycleVersion))
          await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
        throw error;
      })
      .finally(() => {
        if (this.frontendToolSubmitRequests.get(requestKey) === request) {
          this.frontendToolSubmitRequests.delete(requestKey);
        }
      });
    this.frontendToolSubmitRequests.set(requestKey, request);
    return request;
  }

  submitAwaiting(conversationId: string, payload: AwaitingSubmitPayloadData): Promise<SubmitAwaitingResponse> {
    const key = JSON.stringify([conversationId, payload.runId]);
    const pending = this.awaitingSubmitRequests.get(key);
    if (pending) return pending;
    const request = this.submitCurrentAwaiting(conversationId, payload).finally(() => {
      if (this.awaitingSubmitRequests.get(key) === request) this.awaitingSubmitRequests.delete(key);
    });
    this.awaitingSubmitRequests.set(key, request);
    return request;
  }

  private async submitCurrentAwaiting(conversationId: string, payload: AwaitingSubmitPayloadData) {
    const normalizedConversationId = toText(conversationId);
    const runId = toText(payload.runId);
    const awaitingId = toText(payload.awaitingId);
    if (!normalizedConversationId || !runId || !awaitingId) {
      throw new Error('Conversation id, run id and awaiting id are required');
    }
    const lifecycleVersion = this.lifecycleVersion;
    await this.assertConversationWritable(normalizedConversationId);

    const currentAwaiting = this.getConversationTimelineState(normalizedConversationId).awaiting;
    if (
      !currentAwaiting ||
      currentAwaiting.runId !== runId ||
      (currentAwaiting.awaitingId !== awaitingId && currentAwaiting.id !== awaitingId)
    ) {
      throw new Error('Awaiting interaction is no longer active');
    }
    if (!currentAwaiting.interactive || currentAwaiting.status !== 'ask') throw new Error('Awaiting is read-only');
    const singleAnswer = currentAwaiting.mode === 'form' || currentAwaiting.mode === 'plan';
    if (
      singleAnswer
        ? payload.params !== undefined ||
          !readAwaitingSubmitParam(payload.param, currentAwaiting.mode as 'form' | 'plan')
        : payload.param !== undefined || !Array.isArray(payload.params)
    )
      throw new Error('Invalid awaiting answer for the current mode');
    const owner = await this.resolveRunControlScope(normalizedConversationId, runId);
    if (!owner.agentKey) {
      throw new Error('agentKey is required for awaiting submit');
    }

    const latestAwaiting = this.getConversationTimelineState(normalizedConversationId).awaiting;
    if (
      !this.isLifecycleCurrent(lifecycleVersion) ||
      latestAwaiting?.id !== currentAwaiting.id ||
      latestAwaiting.status !== 'ask' ||
      !latestAwaiting.interactive ||
      latestAwaiting.runId !== runId
    )
      throw new Error('Awaiting interaction changed');
    const response =
      (await this.requestChatApi<SubmitAwaitingResponse>(
        CHAT_SUBMIT_TRANSPORT_TYPE,
        buildSubmitAwaitingPayload({
          chatId: normalizedConversationId,
          runId,
          ...owner,
          awaitingId,
          submitId: createAwaitingSubmitId(),
          ...(payload.param ? { param: payload.param } : { params: payload.params! })
        })
      ).catch(async (error) => {
        if (this.isLifecycleCurrent(lifecycleVersion))
          await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
        throw error;
      })) || {};
    if (!this.isLifecycleCurrent(lifecycleVersion)) return response;
    const responseAwaiting = this.getConversationTimelineState(normalizedConversationId).awaiting;
    if (responseAwaiting?.id !== currentAwaiting.id || responseAwaiting.runId !== runId) return response;
    const accepted = response.accepted === true;
    const status = toText(response.status);
    const detail = toText(response.detail) || (accepted ? 'accepted' : 'unmatched');

    if (!accepted) {
      await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
      if (['already_resolved', 'expired', 'completed', 'cancelled'].includes(status)) {
        const state = this.getConversationTimelineState(normalizedConversationId);
        if (
          this.isLifecycleCurrent(lifecycleVersion) &&
          state.awaiting?.id === currentAwaiting.id &&
          state.awaiting.runId === runId
        ) {
          this.publishTimelineState(
            normalizedConversationId,
            'awaiting_submit',
            reconcileChatTimelineAwaitingSnapshot(state, null),
            { emitRuntime: true }
          );
        }
        return response;
      }
      throw new Error(detail);
    }

    await this.applyRuntimeConversationEvent(
      normalizedConversationId,
      {
        type: 'awaiting.answer',
        chatId: normalizedConversationId,
        awaitingId,
        runId,
        ...(payload.param ? { param: payload.param } : { params: payload.params! }),
        timestamp: Date.now()
      },
      'awaiting_submit',
      true
    );

    if (!this.isLifecycleCurrent(lifecycleVersion)) return response;
    const continuedRunId = toText(response.continuationRunId) || toText(response.runId) || runId;
    if (
      response.continued &&
      continuedRunId &&
      !this.isUnavailableAttachRun(normalizedConversationId, continuedRunId)
    ) {
      await setConversationActiveRunId(normalizedConversationId, continuedRunId);
      if (!this.isLifecycleCurrent(lifecycleVersion)) return response;
      await this.attachActiveConversationRun(normalizedConversationId, 'attach');
    }

    await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
    return response;
  }

  async listReferenceChats(
    conversationId: string,
    lastRunId?: string
  ): Promise<{ items: ChatReferenceOption[]; nextCursor: string | null }> {
    const lifecycle = this.lifecycleVersion;
    const owner = buildChatRunOwnerPayload(await this.resolveRunControlScope(conversationId, ''));
    await this.assertChatReferenceCapability(owner);
    if (!this.isLifecycleCurrent(lifecycle)) throw new Error('Chat source changed');
    const response = await this.requestChatApi<RemoteChatSummary[]>(CHAT_SUMMARIES_TRANSPORT_TYPE, {
      ...buildChatSummariesPayload(lastRunId),
      ...(owner.agentKey ? { agentKey: owner.agentKey } : {})
    });
    if (!this.isLifecycleCurrent(lifecycle)) throw new Error('Chat source changed');
    if (!Array.isArray(response)) throw new Error('Invalid reference chat list');
    const seen = new Set<string>();
    const items = response.flatMap((chat) => {
      const id = toText(chat.chatId);
      if (!id || id === conversationId || seen.has(id)) return [];
      seen.add(id);
      return [{ id, name: toText(chat.chatName || chat.title) || getRemoteChatSourceId(id) }];
    });
    const cursor = response.length >= REMOTE_CHAT_PAGE_SIZE ? toText(response.at(-1)?.lastRunId) : '';
    if (cursor && cursor === lastRunId) throw new Error('Reference chat cursor did not advance');
    return { items, nextCursor: cursor || null };
  }

  private async assertChatReferenceCapability(owner: { agentKey?: string }) {
    if (!owner.agentKey) throw new Error('Chat reference owner is unavailable. Remove the reference and retry.');
    const detail = await this.ensureAgentDetail(owner.agentKey, { throwOnError: true });
    if (!detail || !resolveAgentInteraction(detail.raw.interactionConfig).attachment.chatRecords)
      throw new Error('Chat references are disabled. Remove the reference or choose another Agent.');
  }

  private async validateContextReferences(
    conversationId: string,
    owner: { agentKey?: string },
    references: readonly import('../chatPersistence/types').ChatAttachmentReference[]
  ) {
    assertChatReferenceScope(conversationId, references);
    if (references.some((ref) => ref.type === 'chat')) await this.assertChatReferenceCapability(owner);
  }

  async deriveConversation(conversationId: string, runId: string) {
    const id = toText(conversationId),
      run = toText(runId),
      key = JSON.stringify([id, run]);
    const state = this.getConversationTimelineState(id),
      node = getChatTimelineRun(state, run);
    if (!id || !run || !node || node.lifecycle === 'active' || node.completedAt === null)
      throw new Error('Derivation requires a completed run');
    if (this.derivationRequests.has(key)) throw new Error('Derivation is already in progress');
    if (!node.derivation && (state.activeRunId || state.awaiting))
      throw new Error('Finish the current run before deriving');
    this.derivationRequests.add(key);
    const lifecycle = this.lifecycleVersion;
    let target = node.derivation,
      rejected = false;
    const current = () => {
      if (!this.isLifecycleCurrent(lifecycle)) throw new Error('Chat source changed');
    };
    try {
      await this.assertConversationWritable(id);
      const owner = buildChatRunOwnerPayload(await this.resolveRunControlScope(id, run));
      current();
      if (!owner.agentKey) throw new Error('Run owner is unavailable');
      if (!target) {
        // Persist the exact destination before sending. Recovery only queries this ID, never retries creation.
        target = {
          chatId: encodeChatSourceId(this.source, createRunControlRequestId('derived-chat')),
          phase: 'unknown',
          ...owner
        };
        await this.setRunDerivation(id, run, target);
        current();
        const response = await this.requestChatApi(CHAT_DERIVE_TRANSPORT_TYPE, {
          sourceChatId: id,
          sourceRunId: run,
          chatId: target.chatId
        }).catch((error) => {
          rejected = isDefinitiveChatDerivationRejection(error);
          throw error;
        });
        current();
        validateChatDerivationResponse(response, id, run, target);
      }
      const targetBeforeRequest = this.timelineStates.get(target.chatId);
      const detail = await this.getChatDetailViaTransport(target.chatId);
      current();
      if (detail.chatId !== target.chatId || detail.agentKey !== target.agentKey)
        throw new Error('Derived conversation owner or identity could not be verified');
      const projection = projectRemoteChatDetail(detail);
      if (!projection || !projection.messages.length) throw new Error('Derived conversation history is unavailable');
      const targetCurrent = this.timelineStates.get(target.chatId);
      const changedDuringRequest = targetCurrent !== targetBeforeRequest;
      let timeline = mergeChatTimelineState(
        targetCurrent,
        projection.timelineState,
        isAccountDesktopChatSource(this.source),
        { baseline: targetBeforeRequest, historicalPage: false }
      );
      if (changedDuringRequest && targetCurrent)
        timeline = { ...timeline, awaiting: targetCurrent.awaiting, canContinue: targetCurrent.canContinue };
      this.timelineStates.set(target.chatId, timeline);
      await reconcileConversationDetail({
        conversationId: target.chatId,
        title: projection.title,
        ...(projection.hasExplicitReadState && !changedDuringRequest ? { read: projection.read } : {}),
        activeRunId: timeline.activeRunId,
        summary: projection.summary,
        messages: projectTimelineMessages(timeline),
        timelineState: timeline
      });
      current();
      if (this.timelineStates.get(target.chatId) !== timeline) this.scheduleTimelinePersist(target.chatId);
      const patch = await patchConversationSummary({
        conversationId: target.chatId,
        agentKey: target.agentKey || null,
        shouldMoveToTop: true
      });
      current();
      if (patch) this.emitHomePatch(patch.summary, { shouldMoveToTop: true }, patch.directoryChanged);
      await this.setRunDerivation(id, run, { ...target, phase: 'ready' });
      current();
      const summary = await getConversationDetail(target.chatId);
      current();
      if (!summary) throw new Error('Derived conversation could not be loaded');
      return {
        conversation: summary,
        historyScope: { agentKey: target.agentKey || null }
      };
    } catch (error) {
      if (this.isLifecycleCurrent(lifecycle) && rejected) await this.setRunDerivation(id, run, undefined);
      throw error;
    } finally {
      this.derivationRequests.delete(key);
    }
  }

  private async setRunDerivation(conversationId: string, runId: string, derivation: ChatDerivation | undefined) {
    const previous = this.getConversationTimelineState(conversationId),
      next = applyChatTimelineRunDerivation(previous, runId, derivation),
      lifecycle = this.lifecycleVersion;
    if (previous === next) return;
    this.timelineStates.set(conversationId, next);
    this.emitConversationTimelineState(conversationId, 'reconcile', next);
    try {
      await persistConversationTimelineState(next);
    } catch (error) {
      if (this.isLifecycleCurrent(lifecycle)) {
        const latest = this.getConversationTimelineState(conversationId);
        if (getChatTimelineRun(latest, runId)?.derivation === derivation) {
          const restored = applyChatTimelineRunDerivation(
            latest,
            runId,
            getChatTimelineRun(previous, runId)?.derivation
          );
          this.timelineStates.set(conversationId, restored);
          this.emitConversationTimelineState(conversationId, 'reconcile', restored);
        }
      }
      throw error;
    }
    if (this.isLifecycleCurrent(lifecycle) && this.timelineStates.get(conversationId) !== next)
      this.scheduleTimelinePersist(conversationId);
  }

  async submitRunFeedback(conversationId: string, runId: string, type: ChatFeedbackType, comment = '') {
    const id = toText(conversationId),
      run = toText(runId),
      text = type === 'clear' ? '' : comment.trim();
    const node = getChatTimelineRun(this.getConversationTimelineState(id), run);
    if (!id || !run || !node || node.lifecycle === 'active' || node.completedAt === null)
      throw new Error('Feedback requires a completed run');
    if (!['thumbs_down', 'clear'].includes(type) || text.length > MAX_FEEDBACK_COMMENT_CHARS)
      throw new Error('Invalid feedback or comment is too long');
    const key = JSON.stringify([id, run]),
      token = Symbol(),
      requestId = createRunControlRequestId('feedback');
    if (this.feedbackRequests.has(key) || node.feedbackPending) throw new Error('Feedback is already being submitted');
    const lifecycle = this.lifecycleVersion;
    this.feedbackRequests.set(key, token);
    this.setRunFeedback(id, run, {
      pending: { requestId, feedback: type === 'clear' ? null : { type, comment: text } }
    });
    const current = () =>
      this.isLifecycleCurrent(lifecycle) &&
      getChatTimelineRun(this.getConversationTimelineState(id), run)?.feedbackPending?.requestId === requestId;
    try {
      await this.assertConversationWritable(id);
      const owner = buildChatRunOwnerPayload(await this.resolveRunControlScope(id, run));
      if (!owner.agentKey) throw new Error('Run owner is unavailable');
      if (!current()) return;
      const response = await this.requestChatApi(CHAT_FEEDBACK_TRANSPORT_TYPE, {
        chatId: id,
        runId: run,
        type,
        ...owner,
        ...(text ? { comment: text } : {})
      });
      if (!current()) return;
      const confirmed = validateChatFeedbackResponse(response, id, run, type);
      this.setRunFeedback(id, run, {
        feedback: type === 'clear' ? null : { type: 'thumbs_down', comment: text, at: confirmed.setAt! },
        pending: null
      });
    } catch (error) {
      if (current()) {
        this.setRunFeedback(id, run, { pending: null });
        throw error;
      }
    } finally {
      if (this.feedbackRequests.get(key) === token) this.feedbackRequests.delete(key);
    }
  }

  private setRunFeedback(
    conversationId: string,
    runId: string,
    input: Parameters<typeof applyChatTimelineRunFeedback>[2]
  ) {
    const previous = this.getConversationTimelineState(conversationId),
      next = applyChatTimelineRunFeedback(previous, runId, input);
    if (next === previous) return;
    this.timelineStates.set(conversationId, next);
    this.emitConversationTimelineState(conversationId, 'reconcile', next);
    if (getChatTimelineRun(previous, runId)?.feedback !== getChatTimelineRun(next, runId)?.feedback)
      this.scheduleTimelinePersist(conversationId);
  }

  async updateRuntimeAccessLevel(conversationId: string, runId: string, nextLevel: ChatQueryAccessLevel) {
    const id = toText(conversationId),
      run = toText(runId);
    const level = readRunAccessLevel(nextLevel);
    const state = this.getConversationTimelineState(id),
      node = getChatTimelineRun(state, run);
    if (!id || !run || !level || state.activeRunId !== run || node?.lifecycle !== 'active')
      throw new Error('Run is no longer active');
    const key = JSON.stringify([id, run]);
    if (this.runtimeAccessRequests.has(key) || node.accessUpdate)
      throw new Error('Run access change is awaiting confirmation');
    if (node.accessLevel === level) return { status: 'confirmed' as const, detail: '' };
    const token = Symbol(),
      requestId = createRunControlRequestId('access');
    const lifecycle = this.lifecycleVersion,
      baselineVersion = Math.max(1, node.accessLevelVersion ?? 1);
    this.runtimeAccessRequests.set(key, token);
    this.setRunAccessUpdate(id, run, { update: { phase: 'sending', requestId, baselineVersion } });
    const current = () =>
      this.isLifecycleCurrent(lifecycle) &&
      this.getConversationTimelineState(id).activeRunId === run &&
      getChatTimelineRun(this.getConversationTimelineState(id), run)?.accessUpdate?.requestId === requestId;
    let dispatched = false;
    try {
      await this.assertConversationWritable(id);
      const owner = buildChatRunOwnerPayload(await this.resolveRunControlScope(id, run));
      if (owner.agentKey) {
        const detail = await this.ensureAgentDetail(owner.agentKey, { throwOnError: true });
        if (!detail || !resolveAgentInteraction(detail.raw.interactionConfig).accessLevel)
          throw new Error('Agent does not support access changes');
      }
      if (!current()) return { status: 'rejected' as const, detail: 'Run changed' };
      dispatched = true;
      const response = await this.requestChatApi<ChatAccessLevelResponse>(CHAT_ACCESS_LEVEL_TRANSPORT_TYPE, {
        requestId,
        runId: run,
        ...owner,
        accessLevel: level,
        reason: 'user toggled permission'
      });
      if (!current()) return { status: 'rejected' as const, detail: 'Run changed' };
      if (response.accepted === false && (!response.runId || toText(response.runId) === run)) {
        this.setRunAccessUpdate(id, run, { update: null });
        return { status: 'rejected' as const, detail: toText(response.detail) };
      }
      if (
        response.accepted === true &&
        toText(response.runId) === run &&
        readRunAccessLevel(response.accessLevel) &&
        typeof response.version === 'number' &&
        Number.isSafeInteger(response.version) &&
        response.version >= 1
      ) {
        this.setRunAccessUpdate(id, run, {
          accessLevel: response.accessLevel,
          version: response.version,
          update: null
        });
        return { status: 'confirmed' as const, detail: '' };
      }
    } catch (error) {
      if (!current()) return { status: 'rejected' as const, detail: 'Run changed' };
      if (!dispatched || (error instanceof ApiError && [400, 401, 403, 404, 409].includes(error.status))) {
        this.setRunAccessUpdate(id, run, { update: null });
        return { status: 'rejected' as const, detail: error instanceof Error ? error.message : String(error) };
      }
    } finally {
      if (this.runtimeAccessRequests.get(key) === token) this.runtimeAccessRequests.delete(key);
    }
    if (current()) {
      this.setRunAccessUpdate(id, run, { update: { phase: 'unknown', requestId, baselineVersion } });
      if (getChatTimelineRun(this.getConversationTimelineState(id), run)?.accessUpdate?.phase === 'unknown')
        await this.scheduleConversationReconcile(id, 'reconcile', true).catch(() => {});
    }
    const latest = getChatTimelineRun(this.getConversationTimelineState(id), run);
    return {
      status:
        latest && !latest.accessUpdate && (latest.accessLevelVersion ?? 0) > baselineVersion
          ? ('confirmed' as const)
          : ('unknown' as const),
      detail: ''
    };
  }

  private setRunAccessUpdate(
    conversationId: string,
    runId: string,
    input: Parameters<typeof applyChatTimelineRunAccess>[2]
  ) {
    const previous = this.getConversationTimelineState(conversationId);
    const next = applyChatTimelineRunAccess(previous, runId, input);
    if (next === previous) return;
    this.timelineStates.set(conversationId, next);
    this.emitConversationTimelineState(conversationId, 'reconcile', next);
    const previousRun = getChatTimelineRun(previous, runId),
      nextRun = getChatTimelineRun(next, runId);
    if (
      previousRun?.accessLevel !== nextRun?.accessLevel ||
      previousRun?.accessLevelVersion !== nextRun?.accessLevelVersion
    )
      this.scheduleTimelinePersist(conversationId);
  }

  getPendingSteer(conversationId: string): ChatPendingSteer | null {
    return this.pendingSteers.get(toText(conversationId)) || null;
  }

  restorePendingSteer(conversationId: string): ChatPendingSteer | null {
    const id = toText(conversationId);
    const pending = this.pendingSteers.get(id);
    if (!pending || pending.phase === 'sending') return null;
    this.pendingSteers.delete(id);
    this.emit({ type: 'conversation.steer.changed', conversationId: id, pending: null });
    return pending;
  }

  continueWait(conversationId: string, toolId: string) {
    return this.steerConversation(conversationId, '', [], toolId);
  }

  private assertRootWait(conversationId: string, toolId: string) {
    const state = this.getConversationTimelineState(conversationId);
    const node = Object.values(state.nodesById).find((value) => value.kind === 'tool' && value.toolId === toolId);
    if (
      !node ||
      node.kind !== 'tool' ||
      !node.toolWait ||
      node.lifecycle !== 'active' ||
      !state.activeRunId ||
      node.runId !== state.activeRunId ||
      (node.taskId && node.toolId.startsWith(`${node.taskId}:`))
    )
      throw new Error('This wait is no longer active');
  }

  async steerConversation(
    conversationId: string,
    message: string,
    attachments: readonly ChatComposerAttachment[] = [],
    waitToolId = ''
  ): Promise<ChatSteerResponse> {
    const id = toText(conversationId);
    const state = this.getConversationTimelineState(id);
    const runId = state.activeRunId;
    const references = normalizeChatAttachmentReferences(attachments.flatMap((item) => item.references));
    if (references.some((ref) => ref.type === 'chat' || ref.type === 'site'))
      throw new Error('Chat and Site references cannot be used for steering. Remove them or wait for the run to end.');
    if (waitToolId) this.assertRootWait(id, waitToolId);
    if (!id || !runId || state.awaiting?.status === 'ask' || (!waitToolId && !message.trim() && !references.length))
      throw new Error('An active run and steering input are required');
    if (attachments.some((item) => item.status !== 'ready') || (attachments.length && !references.length))
      throw new Error('Steering attachments are not ready');
    if (this.pendingSteers.has(id)) throw new Error('A steering request is awaiting confirmation');
    if (this.pendingSteers.size >= 16) throw new Error('Resolve existing steering requests before sending another');
    const lifecycleVersion = this.lifecycleVersion;
    const pending: ChatPendingSteer = {
      steerId: createRunControlRequestId('steer'),
      runId,
      message,
      attachments: [...attachments],
      phase: 'sending',
      runEnded: false
    };
    this.pendingSteers.set(id, pending);
    this.emit({ type: 'conversation.steer.changed', conversationId: id, pending });
    let sent = false;
    try {
      await this.assertConversationWritable(id);
      if (waitToolId) this.assertRootWait(id, waitToolId);
      const owner = await this.resolveRunControlScope(id, runId);
      const latest = this.getConversationTimelineState(id);
      if (
        !this.isLifecycleCurrent(lifecycleVersion) ||
        latest.activeRunId !== runId ||
        latest.awaiting?.status === 'ask'
      )
        throw new Error('Steering run changed');
      if (!owner.agentKey || this.status !== 'connected') throw new Error('Steering target is unavailable');
      if (owner.agentKey) {
        const detail = await this.ensureAgentDetail(owner.agentKey, { throwOnError: true });
        if (
          !detail ||
          !hasValidAgentInteraction(detail.raw.interactionConfig) ||
          (attachments.some((item) => item.kind === 'image' || item.kind === 'file') &&
            !resolveAgentInteraction(detail.raw.interactionConfig).attachment.localFiles)
        )
          throw new Error('Agent execution or attachments are unavailable');
      }
      if (
        !this.isLifecycleCurrent(lifecycleVersion) ||
        this.getConversationTimelineState(id).activeRunId !== runId ||
        this.getConversationTimelineState(id).awaiting?.status === 'ask'
      )
        throw new Error('Steering run changed');
      if (waitToolId) this.assertRootWait(id, waitToolId);
      this.pendingSteers.set(id, { ...pending, ...owner });
      sent = true;
      const response = await this.requestChatApi<Record<string, unknown>>(CHAT_STEER_TRANSPORT_TYPE, {
        chatId: id,
        runId,
        requestId: pending.steerId,
        steerId: pending.steerId,
        ...owner,
        message,
        ...(references.length ? { references } : {})
      });
      if (!this.isLifecycleCurrent(lifecycleVersion)) return { accepted: null, status: 'source_changed', detail: '' };
      this.syncPendingSteerFromTimeline(id, this.getConversationTimelineState(id), true);
      const current = this.pendingSteers.get(id);
      if (current?.steerId !== pending.steerId) return { accepted: true, status: 'confirmed', detail: '' };
      const accepted = typeof response?.accepted === 'boolean' ? response.accepted : null;
      const result = {
        accepted,
        status:
          toText(response?.status) || (accepted === true ? 'accepted' : accepted === false ? 'rejected' : 'unknown'),
        detail: toText(response?.detail)
      };
      if (accepted === false) {
        this.pendingSteers.delete(id);
        this.emit({ type: 'conversation.steer.changed', conversationId: id, pending: null });
      } else {
        const next = { ...current, phase: accepted === true ? ('accepted' as const) : ('unknown' as const) };
        this.pendingSteers.set(id, next);
        this.emit({ type: 'conversation.steer.changed', conversationId: id, pending: next });
      }
      await this.scheduleConversationReconcile(id, 'reconcile', false).catch(() => {});
      return result;
    } catch (error) {
      if (!this.isLifecycleCurrent(lifecycleVersion)) throw error;
      this.syncPendingSteerFromTimeline(id, this.getConversationTimelineState(id), true);
      const current = this.pendingSteers.get(id);
      if (current?.steerId !== pending.steerId) return { accepted: true, status: 'confirmed', detail: '' };
      if (sent) {
        const next = { ...current, phase: 'unknown' as const };
        this.pendingSteers.set(id, next);
        this.emit({ type: 'conversation.steer.changed', conversationId: id, pending: next });
        void this.scheduleConversationReconcile(id, 'reconcile', false).catch(() => {});
      } else {
        this.pendingSteers.delete(id);
        this.emit({ type: 'conversation.steer.changed', conversationId: id, pending: null });
      }
      throw error;
    }
  }

  async listReferenceKbases(conversationId: string) {
    const version = this.lifecycleVersion;
    const owner = await this.resolveRunControlScope(conversationId, '');
    const detail = owner.agentKey ? await this.ensureAgentDetail(owner.agentKey, { throwOnError: true }) : null;
    if (!detail || !resolveAgentInteraction(detail.raw.interactionConfig).attachment.kbases)
      throw new Error('Knowledge references are unavailable');
    const response = await this.requestChatApi<{
      capability?: { available?: boolean };
      libraries?: { id: string; name: string; readable: boolean }[];
    }>('/api/kbases', owner);
    if (!this.isLifecycleCurrent(version)) throw new Error('Conversation source changed');
    if (!response.capability?.available || !Array.isArray(response.libraries))
      throw new Error('Knowledge references are unavailable');
    return {
      items: response.libraries
        .filter((item) => item.readable && item.id)
        .map((item) => ({ id: item.id, name: item.name || item.id })),
      nextCursor: null
    };
  }

  async getWorkspaceFile(resourceUrl: string): Promise<{ contentKind: 'text' | 'binary'; content?: string }> {
    const url = new URL(resourceUrl, 'https://resource.invalid');
    if (url.origin !== 'https://resource.invalid' || url.pathname !== '/api/file')
      throw new Error('Invalid file request');
    const agentKey = toText(url.searchParams.get('agentKey'));
    const path = toText(url.searchParams.get('path'));
    if (!agentKey || !path) throw new Error('Missing file owner or path');
    const version = this.lifecycleVersion;
    const file = await this.requestChatApi<{
      agentKey: string;
      requestedPath: string;
      contentKind: 'text' | 'binary';
      content?: string;
      truncated?: boolean;
    }>('/api/file', { agentKey, path });
    if (
      !this.isLifecycleCurrent(version) ||
      file.agentKey !== getRemoteChatSourceId(agentKey) ||
      file.requestedPath !== path ||
      !['text', 'binary'].includes(file.contentKind)
    )
      throw new Error('Invalid file response');
    if (file.truncated) throw new Error('File preview exceeds the limit');
    return file;
  }

  async recoverSubmission(conversationId: string, clientMessageId: string): Promise<boolean> {
    const version = this.lifecycleVersion;
    let detail: RemoteChatDetail;
    try {
      detail = await this.getChatDetailViaTransport(conversationId);
    } catch (error) {
      if (isApiStatusError(error, 404)) return false;
      throw error;
    }
    if (!this.isLifecycleCurrent(version)) throw new Error('Conversation source changed');
    const matched =
      (detail.runs || []).some((run) => run.requestId === clientMessageId && !!run.runId) ||
      (detail.events || []).some((event) => event.requestId === clientMessageId && !!event.runId);
    if (!matched) return false;
    await this.markOutgoingSentIfPending({ conversationId, clientMessageId });
    if (!this.isLifecycleCurrent(version)) return true;
    await this.reconcileConversation(conversationId, 'manual_refresh');
    return true;
  }

  sendMessage(
    conversationId: string,
    content: string,
    attachments: readonly ChatComposerAttachment[] = [],
    options: ChatSendMessageOptions = {}
  ): Promise<ChatSendMessageResult> {
    const state = this.getConversationTimelineState(conversationId);
    const failed = getLatestFailedChatSubmission(state);
    const recovery = options.continuation
      ? null
      : (getRecoverableChatSubmission(state) ?? (failed?.errorReason === 'submission_unconfirmed' ? failed : null));
    return this.submitMessage(conversationId, content, attachments, options, recovery?.clientMessageId ?? undefined);
  }

  retryMessage(
    conversationId: string,
    clientMessageId: string,
    options: ChatSendMessageOptions = {},
    allowUnconfirmedResubmission = false
  ): Promise<ChatSendMessageResult> {
    return this.submitMessage(conversationId, '', [], options, clientMessageId, allowUnconfirmedResubmission);
  }

  private submitMessage(
    conversationId: string,
    content: string,
    attachments: readonly ChatComposerAttachment[],
    options: ChatSendMessageOptions,
    retryClientMessageId?: string,
    allowUnconfirmedResubmission = false
  ): Promise<ChatSendMessageResult> {
    const id = toText(conversationId);
    if (this.conversationSendRequests.has(id)) return Promise.reject(new Error('Query is already being sent'));
    const token = Symbol();
    this.conversationSendRequests.set(id, token);
    return this.sendConversationMessage(
      id,
      content,
      attachments,
      options,
      retryClientMessageId,
      allowUnconfirmedResubmission
    ).finally(() => {
      if (this.conversationSendRequests.get(id) === token) this.conversationSendRequests.delete(id);
    });
  }

  private async sendConversationMessage(
    conversationId: string,
    content: string,
    attachments: readonly ChatComposerAttachment[] = [],
    options: ChatSendMessageOptions = {},
    retryClientMessageId?: string,
    allowUnconfirmedResubmission = false
  ): Promise<ChatSendMessageResult> {
    const normalizedConversationId = toText(conversationId);
    const lifecycleVersion = this.lifecycleVersion;
    let normalizedContent = String(content || '').trim();
    const currentState = this.getConversationTimelineState(normalizedConversationId);
    const previousRequest = retryClientMessageId ? getLatestFailedChatSubmission(currentState) : null;
    const retryOriginal = !!retryClientMessageId && !normalizedContent && attachments.length === 0;
    if (retryClientMessageId) {
      const original = await getMessageByClientMessageId(retryClientMessageId);
      if (!this.isLifecycleCurrent(lifecycleVersion)) throw new Error('Conversation source changed');
      if (
        !original ||
        original.conversationId !== normalizedConversationId ||
        original.role !== 'user' ||
        original.deliveryStatus !== 'failed'
      )
        throw new Error('Failed request is no longer available for recovery');
      const recoverable = getRecoverableChatSubmission(currentState);
      if (recoverable?.clientMessageId !== retryClientMessageId) {
        if (original.errorReason !== 'submission_unconfirmed') throw new Error('Request is not eligible for recovery');
        if (await this.recoverSubmission(normalizedConversationId, retryClientMessageId)) {
          return {
            clientMessageId: retryClientMessageId,
            conversationId: normalizedConversationId,
            createdAt: original.createdAt,
            message: { ...original, deliveryStatus: 'sent' },
            dispatchError: null
          };
        }
        if (!allowUnconfirmedResubmission) throw new Error('submission_unconfirmed');
      }
      if (retryOriginal) {
        normalizedContent = original.content;
        attachments = previousRequest?.attachments || [];
      } else {
        // A new input stays a new message; the rejected task is ordinary quoted context.
        attachments = createMessageAttachmentsFromReferences({
          conversationId: normalizedConversationId,
          messageId: retryClientMessageId,
          createdAt: Date.now(),
          references: [
            ...normalizeChatAttachmentReferences(previousRequest?.references).filter((ref) => ref.type !== 'skill'),
            ...(previousRequest?.attachments || []).flatMap((item) => item.references),
            { type: 'selection', id: retryClientMessageId, text: original.content },
            ...attachments.flatMap((item) => item.references)
          ]
        });
      }
    }
    if (!normalizedConversationId || (!normalizedContent && attachments.length === 0 && !options.continuation)) {
      throw new Error('Conversation id and message content or attachments are required');
    }
    if (currentState.activeRunId || currentState.awaiting?.status === 'ask')
      throw new Error('Chat is running or awaiting a response');
    if (options.continuation && (!canContinueChatTimeline(currentState) || normalizedContent || attachments.length))
      throw new Error('Empty continuation is not permitted');
    if (!normalizedContent && attachments.length && !hasEstablishedChatQuery(currentState))
      throw new Error('The first query requires text');
    const contextReferences = normalizeChatAttachmentReferences(attachments.flatMap((item) => item.references));
    if (
      !normalizedContent &&
      contextReferences.length &&
      contextReferences.every((ref) => ref.type === 'chat' || ref.type === 'site')
    )
      throw new Error('Context references require a question. Enter text before sending.');
    const previousReferences =
      previousRequest?.clientMessageId === retryClientMessageId
        ? normalizeChatAttachmentReferences(previousRequest?.references)
        : [];
    let skillIds = normalizeSkillIds([
      ...(options.skillIds || []),
      ...previousReferences.filter((ref) => ref.type === 'skill').map((ref) => ref.id || '')
    ]);
    let editingMode: boolean | undefined;
    let planningMode = false;
    const currentSummary = await this.assertConversationWritable(normalizedConversationId);
    const owner = buildChatRunOwnerPayload(await this.resolveRunControlScope(normalizedConversationId, ''));
    if (!owner.agentKey) throw new Error('Agent owner is unavailable');
    await this.validateContextReferences(normalizedConversationId, owner, contextReferences);
    if (owner.agentKey) {
      const detail = await this.ensureAgentDetail(owner.agentKey, { throwOnError: true });
      if (!detail) throw new Error('Agent is unavailable for execution');
      if (!hasValidAgentInteraction(detail.raw.interactionConfig))
        throw new Error('Agent input configuration is invalid');
      const interaction = resolveAgentInteraction(detail.raw.interactionConfig);
      editingMode = interaction.showEditingMode ? options.editingMode === true : undefined;
      planningMode = interaction.showPlanningMode && options.planningMode === true;
      if (
        (!interaction.showEditingMode && options.editingMode === true) ||
        (!interaction.showPlanningMode && options.planningMode === true) ||
        (!interaction.model && options.model && Object.keys(options.model).length) ||
        (!interaction.accessLevel && options.accessLevel && options.accessLevel !== 'default') ||
        (!interaction.attachment.skills &&
          (skillIds.length || contextReferences.some((ref) => ref.type === 'skill'))) ||
        (!interaction.attachment.kbases && contextReferences.some((ref) => ref.type === 'kbase')) ||
        (!interaction.attachment.localFiles &&
          contextReferences.some((ref) => !['selection', 'chat', 'site', 'skill', 'kbase'].includes(ref.type || '')))
      ) {
        throw new Error('Agent input capabilities changed; refresh the conversation');
      }
    }

    if (skillIds.length) {
      const catalog = await this.ensureAgentSkills(owner.agentKey!);
      if (!catalog) throw new Error('Skills catalog is unavailable');
      skillIds = resolveSkillIds(skillIds, catalog);
    }

    if (
      this.status !== 'connected' ||
      (this.source.kind === 'default' && getCloudAuthSnapshot().status !== 'available')
    ) {
      throw new ApiError('Target Desktop is offline; remote operations are not queued', 503, {
        code: 'TARGET_OFFLINE'
      });
    }

    const latestState = this.getConversationTimelineState(normalizedConversationId);
    if (
      !this.isLifecycleCurrent(lifecycleVersion) ||
      latestState.activeRunId ||
      latestState.awaiting?.status === 'ask' ||
      (retryClientMessageId && getLatestFailedChatSubmission(latestState)?.clientMessageId !== retryClientMessageId) ||
      (options.continuation && !canContinueChatTimeline(latestState))
    )
      throw new Error('Conversation execution state changed');
    this.clearStoppingConversation(normalizedConversationId);

    const created = retryOriginal
      ? await retryOutgoingMessage(normalizedConversationId, retryClientMessageId!)
      : await createOutgoingMessage(normalizedConversationId, normalizedContent, attachments, {
          continuation: options.continuation === true
        });
    if (!this.isLifecycleCurrent(lifecycleVersion)) throw new Error('Conversation source changed');
    this.timelineStates.set(normalizedConversationId, {
      ...this.getConversationTimelineState(normalizedConversationId),
      canContinue: false
    });
    if (!options.continuation)
      this.emit({
        type: 'conversation.message.insert',
        conversationId: normalizedConversationId,
        reason: 'local_send',
        message: created.message
      });
    if (!options.continuation)
      this.publishTimelineMessage(created.message, 'local_send', {
        references: normalizeChatAttachmentReferences([
          ...contextReferences,
          ...skillIds.map((id) => ({ type: 'skill', id }))
        ])
      });
    if (!options.continuation)
      await this.emitHomePatchFromSummary(
        {
          source: currentSummary?.source ?? getChatSourceFromId(normalizedConversationId),
          conversationId: normalizedConversationId,
          title: currentSummary?.title || normalizedConversationId,
          lastMessageText: created.message.content,
          lastMessageAt: created.createdAt,
          unreadCount: 0,
          read: normalizeChatReadState({ read: { isRead: true } }),
          lastMessageStatus: 'pending',
          pinnedAt: currentSummary?.pinnedAt || 0
        },
        {
          shouldMoveToTop: true
        }
      );

    try {
      await this.dispatchOutgoingMessage({
        clientMessageId: created.clientMessageId,
        conversationId: normalizedConversationId,
        content: created.message.content,
        attachments: created.message.attachments,
        accessLevel: options.accessLevel,
        model: options.model,
        planningMode,
        editingMode,
        skillIds
      });
      return {
        ...created,
        dispatchError: null
      };
    } catch (error) {
      const dispatchError = error instanceof Error ? error : new Error(String(error));
      if (!this.isLifecycleCurrent(lifecycleVersion)) throw dispatchError;
      await this.handleOutgoingStreamError(
        { clientMessageId: created.clientMessageId, conversationId: normalizedConversationId },
        dispatchError
      );
      if (options.dispatchErrorMode === 'return') {
        return {
          ...created,
          dispatchError
        };
      }
      throw error;
    }
  }

  private emit(event: ChatSyncEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private scheduleTimelinePersist(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    const persist = () => {
      const state = this.timelineStates.get(normalizedConversationId);
      if (!state) {
        return;
      }
      void persistConversationTimelineState(state).catch(() => {});
    };

    const currentTimer = this.timelinePersistTimers.get(normalizedConversationId);
    if (currentTimer) {
      return;
    }

    const timer = setTimeout(() => {
      this.timelinePersistTimers.delete(normalizedConversationId);
      persist();
    }, TIMELINE_PERSIST_DEBOUNCE_MS);
    this.timelinePersistTimers.set(normalizedConversationId, timer);
  }

  private publishTimelineState(
    conversationId: string,
    reason: ChatSyncReason,
    state: ChatTimelineState,
    options?: { emitRuntime?: boolean }
  ) {
    this.timelineStates.set(conversationId, state);
    this.emitConversationTimelineState(conversationId, reason, state);
    this.scheduleTimelinePersist(conversationId);
    if (options?.emitRuntime) {
      this.emit({
        type: 'conversation.runtime.replace',
        conversationId,
        reason,
        state: projectTimelineRuntimeState(state)
      });
    }
  }

  private publishTimelineMessage(
    message: ChatMessageItem,
    reason: ChatSyncReason,
    options: TimelineRunContextOptions = {}
  ) {
    const currentState = this.getConversationTimelineState(message.conversationId);
    const nextState = applyChatTimelineMessage(currentState, message, options);
    if (nextState !== currentState) {
      this.publishTimelineState(message.conversationId, reason, nextState);
    }
  }

  private publishTimelineMessagePatch(
    conversationId: string,
    reason: ChatSyncReason,
    messageId: string,
    patch: Parameters<typeof patchChatTimelineMessage>[2],
    options: TimelineRunContextOptions = {}
  ) {
    const currentState = this.getConversationTimelineState(conversationId);
    const nextState = patchChatTimelineMessage(currentState, messageId, patch, options);
    if (nextState !== currentState) {
      this.publishTimelineState(conversationId, reason, nextState);
    }
  }

  private publishTimelineStreamDelta(
    conversationId: string,
    reason: ChatSyncReason,
    input: Parameters<typeof applyChatTimelineStreamDelta>[1]
  ) {
    const currentState = this.getConversationTimelineState(conversationId);
    const nextState = applyChatTimelineStreamDelta(currentState, input);
    if (nextState !== currentState) {
      this.publishTimelineState(conversationId, reason, nextState);
    }
  }

  private setStatus(status: ChatSocketStatus) {
    if (this.status === status) {
      return;
    }

    this.status = status;
    this.emit({
      type: 'connection.status',
      status
    });
  }

  private isLifecycleCurrent(lifecycleVersion: number) {
    return this.lifecycleVersion === lifecycleVersion && this.source.key === getActiveChatSource()?.key;
  }

  private async startInternal(lifecycleVersion: number) {
    await Promise.all([this.refreshHome('bootstrap'), this.connectPushTransport(lifecycleVersion)]);
  }

  private async connectPushTransport(lifecycleVersion: number) {
    const config = await this.resolveTransportConfig();
    if (!this.isLifecycleCurrent(lifecycleVersion)) {
      return;
    }
    if (!config) {
      this.setStatus('disconnected');
      return;
    }

    this.started = true;
    await startChatPushTransport(config, {
      onPush: (event) => {
        if (!this.isLifecycleCurrent(lifecycleVersion)) {
          return;
        }
        void this.handlePushEvent(scopeChatPayload(this.source, event), 'push');
      },
      onProtocolError: (event, error) => {
        if (!this.isLifecycleCurrent(lifecycleVersion)) return;
        const conversationId = extractConversationId(scopeChatPayload(this.source, event));
        if (conversationId) void this.handleStreamSideError(conversationId, error);
      },
      onStatusChange: (status) => {
        if (!this.isLifecycleCurrent(lifecycleVersion)) {
          return;
        }
        void this.handleTransportStatusChange(status);
      }
    });

    if (!this.isLifecycleCurrent(lifecycleVersion)) {
      if (!this.started) {
        stopChatPushTransport(config);
      }
      return;
    }
  }

  private async resolveTransportConfig() {
    if (this.source.key !== getActiveChatSource()?.key) return null;
    const lifecycleVersion = this.lifecycleVersion;
    const config = await this.transportResolver();
    if (!this.isLifecycleCurrent(lifecycleVersion)) return null;
    this.activeTransportConfig = config;
    return config;
  }

  private async requestChatApi<T>(type: string, payload?: unknown): Promise<T> {
    const lifecycleVersion = this.lifecycleVersion;
    const config = await this.resolveTransportConfig();
    if (!this.isLifecycleCurrent(lifecycleVersion)) throw new Error('Chat source changed');
    if (!config) {
      throw new ApiError('Not authenticated', 401, null);
    }

    const cloudGeneration = getCloudAuthSnapshot().generation;
    const response = await requestChatTransport<T | ChatApiEnvelope<T>>({
      ...config,
      type,
      payload: unscopeChatPayload(payload)
    })
      .then(unwrapChatApiEnvelope<T>)
      .catch((error: unknown) => {
        if (this.source.kind === 'default' && this.isLifecycleCurrent(lifecycleVersion))
          reportCloudFailure(classifyCloudFailure(error), cloudGeneration);
        throw error;
      });
    if (!this.isLifecycleCurrent(lifecycleVersion)) throw new Error('Chat source changed');
    const unwrapped = response;
    if (type === CHAT_DETAIL_TRANSPORT_TYPE && isPlainRecord(unwrapped)) {
      assertRemoteChatDetailTimes(unwrapped);
    }
    return scopeChatPayload(this.source, unwrapped);
  }

  private async requestRawChatApi(type: string, payload?: unknown): Promise<unknown> {
    const config = await this.resolveTransportConfig();
    if (!config) {
      throw new ApiError('Not authenticated', 401, null);
    }
    return requestChatTransport<unknown>({
      ...config,
      type,
      payload: unscopeChatPayload(payload)
    });
  }

  private async getChatDetailViaTransport(chatId: string, beforeEventSeq?: number): Promise<RemoteChatDetail> {
    const paginated = isAccountDesktopChatSource(this.source);
    const response = await this.requestChatApi<RemoteChatDetail>(
      CHAT_DETAIL_TRANSPORT_TYPE,
      buildChatDetailPayload({
        chatId,
        paginateEvents: paginated,
        beforeEventSeq
      })
    );
    if (paginated) {
      const nextCursor = Number(response?.eventPage?.nextBeforeSeq);
      this.remoteHistoryCursors.set(
        chatId,
        response?.eventPage?.hasMore === true && Number.isInteger(nextCursor) && nextCursor > 0 ? nextCursor : null
      );
    }
    return response || {};
  }

  async loadOlderConversationHistory(conversationId: string): Promise<boolean> {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId || !isAccountDesktopChatSource(this.source)) {
      return false;
    }
    if (!this.remoteHistoryCursors.has(normalizedConversationId)) {
      await this.runConversationReconcile(normalizedConversationId, 'reconcile');
    }
    const cursor = this.remoteHistoryCursors.get(normalizedConversationId);
    if (!cursor) {
      return false;
    }
    await this.runConversationReconcile(normalizedConversationId, 'reconcile', cursor);
    return Boolean(this.remoteHistoryCursors.get(normalizedConversationId));
  }

  private async fetchAgentDetail(agentKey: string, cacheVersion: number): Promise<AgentDetailSnapshot | null> {
    try {
      const response = await this.requestChatApi<RemoteAgentDetail>(
        CHAT_AGENT_DETAIL_TRANSPORT_TYPE,
        buildAgentDetailPayload(agentKey)
      );
      const detail = projectRemoteAgentDetail(response, agentKey);
      if (this.agentDetailCacheVersion !== cacheVersion) {
        return null;
      }
      this.agentDetails.set(agentKey, detail);
      return detail;
    } catch (error) {
      if (this.agentDetailCacheVersion === cacheVersion) this.agentDetails.delete(agentKey);
      throw error;
    }
  }

  private async fetchAgentModelOptions(agentKey: string, cacheVersion: number): Promise<ModelOptionsSnapshot | null> {
    const transport = await this.resolveTransportConfig();
    if (!transport || this.agentDetailCacheVersion !== cacheVersion) {
      throw new Error('Chat source is unavailable');
    }
    const options = await getModelOptionsApi(getRemoteChatSourceId(agentKey), undefined, transport);
    if (this.agentDetailCacheVersion !== cacheVersion) return null;
    this.agentModelOptions.set(agentKey, options);
    return options;
  }

  private async markChatReadViaTransport(request: MarkChatReadRequest, runId?: string): Promise<MarkChatReadResponse> {
    return this.requestChatApi<MarkChatReadResponse>(
      CHAT_READ_TRANSPORT_TYPE,
      buildMarkChatReadPayload(request, runId)
    );
  }

  private async handleTransportStatusChange(status: ChatSocketStatus) {
    const previousStatus = this.status;
    const lifecycleVersion = this.lifecycleVersion;
    if (this.source.kind === 'default') {
      if (status === 'connected' && getCloudAuthSnapshot().status !== 'available') {
        if ((await verifyDefaultCloud()) !== 'available' || !this.isLifecycleCurrent(lifecycleVersion)) {
          this.setStatus('disconnected');
          return;
        }
      } else if (
        ['error', 'disconnected', 'reconnecting'].includes(status) &&
        getCloudAuthSnapshot().status === 'available'
      ) {
        reportCloudFailure('network_error', getCloudAuthSnapshot().generation);
      }
    }
    this.setStatus(status);

    if (status !== 'connected') {
      return;
    }

    if (this.activeConversationId) {
      await this.attachActiveConversationRun(this.activeConversationId, 'attach');
      if (this.hasConnectedOnce || previousStatus === 'reconnecting') {
        await this.scheduleConversationReconcile(this.activeConversationId, 'reconcile', true);
      }
    }
    if (this.source.kind === 'default' && this.hasConnectedOnce) await this.refreshHome('bootstrap');
    this.hasConnectedOnce = true;
  }

  private async dispatchOutgoingMessage(input: {
    clientMessageId: string;
    conversationId: string;
    content: string;
    attachments?: readonly ChatMessageAttachment[];
    accessLevel?: ChatQueryAccessLevel;
    model?: ChatQueryModelOverride;
    planningMode?: boolean;
    editingMode?: boolean;
    skillIds?: readonly string[];
  }) {
    if (this.inFlightOutgoingIds.has(input.clientMessageId)) {
      return;
    }
    this.inFlightOutgoingIds.add(input.clientMessageId);

    const lifecycleVersion = this.lifecycleVersion;
    try {
      const config = await this.resolveTransportConfig();
      if (!config) {
        throw new Error('Not authenticated');
      }
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        this.inFlightOutgoingIds.delete(input.clientMessageId);
        return;
      }

      const historyScope = await getConversationHistoryScope(input.conversationId);
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        this.inFlightOutgoingIds.delete(input.clientMessageId);
        return;
      }

      const references = normalizeChatAttachmentReferences([
        ...(input.attachments || []).flatMap((attachment) => attachment.references),
        ...normalizeSkillIds(input.skillIds).map((id) => ({ type: 'skill', id }))
      ]);
      await this.validateContextReferences(
        input.conversationId,
        buildChatRunOwnerPayload(historyScope || {}),
        references
      );
      if (!this.isLifecycleCurrent(lifecycleVersion)) return;
      if ((input.attachments || []).length > 0 && references.length === 0) {
        throw new Error('Message attachments are not ready');
      }

      let accepted = false;
      let acceptedRunId = '';
      let ended = false;
      let events = Promise.resolve();
      const handle = await streamChatQuery({
        ...config,
        payload: unscopeChatPayload({
          requestId: input.clientMessageId,
          chatId: input.conversationId,
          message: input.content,
          ...(references.length > 0 ? { references } : {}),
          ...buildChatRunOwnerPayload(historyScope || {}),
          accessLevel: input.accessLevel,
          model: input.model,
          planningMode: input.planningMode === true,
          editingMode: input.editingMode
        }),
        onEvent: (event) => {
          if (!this.isLifecycleCurrent(lifecycleVersion) || ended) return;
          const streamEvent = scopeChatPayload(this.source, event as Record<string, unknown>);
          if (!accepted) {
            const owner = buildChatRunOwnerPayload(historyScope || {});
            if (
              toText(streamEvent.requestId) !== input.clientMessageId ||
              extractConversationId(streamEvent) !== input.conversationId ||
              !toText(streamEvent.runId) ||
              toText(streamEvent.agentKey) !== owner.agentKey
            )
              return;
            accepted = true;
            acceptedRunId = toText(streamEvent.runId);
            events = events.then(() => this.markOutgoingSentIfPending(input));
          }
          if (
            (streamEvent.type === 'request.query' &&
              toText(streamEvent.requestId) &&
              toText(streamEvent.requestId) !== input.clientMessageId) ||
            (toText(streamEvent.runId) && toText(streamEvent.runId) !== acceptedRunId)
          )
            return;
          events = events.then(async () => {
            if (!this.isLifecycleCurrent(lifecycleVersion)) return;
            await this.handlePushEvent(
              {
                ...streamEvent,
                chatId: input.conversationId,
                runId: toText(streamEvent.runId) || acceptedRunId,
                agentKey: toText(streamEvent.agentKey) || historyScope?.agentKey,
                clientMessageId: input.clientMessageId
              },
              'stream'
            );
          });
        },
        onDone: () => {
          if (ended) return;
          ended = true;
          events = events
            .then(async () => {
              if (!this.isLifecycleCurrent(lifecycleVersion)) return;
              if (accepted) await this.handleOutgoingStreamDone(input);
              else await this.handleOutgoingStreamError(input, new Error('submission_unconfirmed'));
            })
            .catch(() => {})
            .finally(() => {
              this.inFlightOutgoingIds.delete(input.clientMessageId);
              this.activeOutgoingStreams.delete(input.clientMessageId);
            });
        },
        onError: (error) => {
          if (ended) return;
          ended = true;
          events = events
            .then(async () => {
              if (!this.isLifecycleCurrent(lifecycleVersion)) return;
              if (accepted) {
                await this.flushConversationStreamBuffers(input.conversationId);
                await this.handleStreamSideError(input.conversationId, error);
              } else await this.handleOutgoingStreamError(input, error);
            })
            .catch(() => {})
            .finally(() => {
              this.inFlightOutgoingIds.delete(input.clientMessageId);
              this.activeOutgoingStreams.delete(input.clientMessageId);
            });
        }
      });
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        handle.abort();
        this.inFlightOutgoingIds.delete(input.clientMessageId);
        return;
      }
      if (!ended)
        this.activeOutgoingStreams.set(input.clientMessageId, {
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
          abort: handle.abort
        });
    } catch (error) {
      this.inFlightOutgoingIds.delete(input.clientMessageId);
      this.activeOutgoingStreams.delete(input.clientMessageId);
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        return;
      }
      throw error;
    }
  }

  private async markOutgoingSentIfPending(input: { clientMessageId: string; conversationId: string }) {
    const lifecycleVersion = this.lifecycleVersion;
    const current = await getMessageByClientMessageId(input.clientMessageId);
    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    if (!current || current.conversationId !== input.conversationId || current.deliveryStatus === 'sent') {
      return;
    }

    const patched = await patchMessageByClientMessageId(input.clientMessageId, {
      deliveryStatus: 'sent',
      errorReason: null
    });

    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    if (patched) {
      const patch = {
        deliveryStatus: patched.deliveryStatus,
        errorReason: patched.errorReason,
        errorDetail: null
      };
      this.emit({
        type: 'conversation.message.patch',
        conversationId: input.conversationId,
        reason: 'local_send',
        messageId: patched.messageId,
        patch
      });
      this.publishTimelineMessagePatch(input.conversationId, 'local_send', patched.messageId, patch);
    }
    await this.emitHomePatchFromConversation(input.conversationId, {
      shouldMoveToTop: true
    });
  }

  private async markOutgoingFailedIfPending(
    input: {
      clientMessageId: string;
      conversationId: string;
    },
    error: Error
  ) {
    const lifecycleVersion = this.lifecycleVersion;
    const current = await getMessageByClientMessageId(input.clientMessageId);
    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    if (!current || current.conversationId !== input.conversationId || current.deliveryStatus !== 'pending') {
      return;
    }

    const patched = await patchMessageByClientMessageId(input.clientMessageId, {
      deliveryStatus: 'failed',
      errorReason: error.message || 'Stream failed'
    });

    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    if (patched) {
      const patch = {
        deliveryStatus: patched.deliveryStatus,
        errorReason: patched.errorReason,
        errorDetail: formatChatTimelinePlatformErrorForDisplay({
          status:
            Number(
              (error as Error & { status?: number; code?: number }).status || (error as Error & { code?: number }).code
            ) || null,
          error: (error as Error & { payload?: unknown }).payload,
          message: error.message
        }).error
      };
      this.emit({
        type: 'conversation.message.patch',
        conversationId: input.conversationId,
        reason: 'local_send',
        messageId: patched.messageId,
        patch
      });
      this.publishTimelineMessagePatch(input.conversationId, 'local_send', patched.messageId, patch);
      await persistConversationTimelineState(this.getConversationTimelineState(input.conversationId));
      if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    }
    await this.emitHomePatchFromConversation(input.conversationId, {
      shouldMoveToTop: true
    });
  }

  private async handleOutgoingStreamDone(input: { clientMessageId: string; conversationId: string }) {
    try {
      await this.flushConversationStreamBuffers(input.conversationId);
    } finally {
      this.inFlightOutgoingIds.delete(input.clientMessageId);
      this.activeOutgoingStreams.delete(input.clientMessageId);
    }
  }

  private async handleOutgoingStreamError(
    input: {
      clientMessageId: string;
      conversationId: string;
    },
    error: Error
  ) {
    try {
      const transportError = error as Error & { status?: number; code?: number | string };
      const status = Number(transportError.status || transportError.code);
      const rejected = status >= 400 && status < 500 && status !== 408;
      await this.markOutgoingFailedIfPending(input, rejected ? error : new Error('submission_unconfirmed'));
    } finally {
      this.inFlightOutgoingIds.delete(input.clientMessageId);
      this.activeOutgoingStreams.delete(input.clientMessageId);
    }
  }

  private async handlePushEvent(
    rawEvent: Record<string, unknown>,
    source: Extract<ChatSyncReason, 'push' | 'stream'> = 'push'
  ) {
    const event: Record<string, unknown> = {
      ...rawEvent,
      type: normalizeEventType(rawEvent.type)
    };
    const type = toText(event.type);
    if (type === 'auth.expiring' && toText(event.ns) === 'd') {
      void this.refreshDesktopTransportAuth();
      return;
    }

    const conversationId = extractConversationId(event);
    const pendingSteer = this.pendingSteers.get(conversationId);
    if (
      type === 'request.steer' &&
      pendingSteer?.steerId === toText(event.steerId) &&
      pendingSteer.agentKey &&
      toText(event.agentKey) &&
      pendingSteer.agentKey !== toText(event.agentKey)
    )
      return;
    const family = classifyChatProtocolEvent(event);
    const eventRunId = toText(event.runId);
    if (source === 'stream' && conversationId && eventRunId && Number.isSafeInteger(event.seq)) {
      const key = JSON.stringify([conversationId, eventRunId]);
      const sequence = Number(event.seq);
      if (sequence > 0 && sequence <= (this.streamSequences.get(key) ?? -1)) return;
      if (sequence > 0) {
        this.streamSequences.delete(key);
        this.streamSequences.set(key, sequence);
      }
      if (this.streamSequences.size > 128) this.streamSequences.delete(this.streamSequences.keys().next().value!);
    }
    if (
      type === 'request.steer' &&
      pendingSteer?.steerId === toText(event.steerId) &&
      pendingSteer.runId === eventRunId &&
      pendingSteer.agentKey &&
      pendingSteer.agentKey === toText(event.agentKey)
    ) {
      this.pendingSteers.delete(conversationId);
      this.emit({ type: 'conversation.steer.changed', conversationId, pending: null, confirmed: pendingSteer });
    }
    if (type === 'tool.output' && (source !== 'stream' || conversationId !== this.activeConversationId)) return;
    if (type === 'run.activity' && conversationId) {
      if (conversationId === this.activeConversationId)
        await this.applyRuntimeConversationEvent(conversationId, event, source, true);
      return;
    }

    if (family === 'heartbeat' || family === 'live') {
      return;
    }

    if (family === 'ack') {
      await this.handleAckEvent(event);
      return;
    }

    if (family === 'incoming') {
      await this.handleIncomingMessageEvent(event, source);
      return;
    }

    if (family === 'read_all') {
      await this.handleReadAllEvent(event);
      return;
    }

    if (family === 'read') {
      await this.handleConversationUnreadStateEvent(event, 0);
      return;
    }

    if (family === 'unread') {
      await this.handleConversationUnreadStateEvent(event, 1);
      return;
    }

    if (family === 'conversation_remove') {
      await this.handleConversationRemovedEvent(event, source);
      return;
    }

    if (family === 'run' && conversationId) {
      await this.applyRuntimeConversationEvent(conversationId, event, source, true);
      if (type === 'run.access_level.changed') return;
      this.syncPendingSteerFromTimeline(conversationId, this.getConversationTimelineState(conversationId), true);
      if (type === 'run.start') {
        this.unavailableAttachRuns.delete(conversationId);
        await setConversationActiveRunId(conversationId, this.getConversationTimelineState(conversationId).activeRunId);
        if (source !== 'stream' && this.activeConversationId === conversationId) {
          await this.attachActiveConversationRun(conversationId, 'attach');
        }
        return;
      }

      await setConversationActiveRunId(conversationId, this.getConversationTimelineState(conversationId).activeRunId);
      await this.flushConversationStreamBuffers(conversationId);
      await this.scheduleConversationReconcile(conversationId, 'reconcile', true);
      if (this.activeConversationId === conversationId) {
        await this.requestConversationReadConfirmation(conversationId, {
          confirmMarker: `run:${toText(event.runId) || conversationId}`
        });
      }
      return;
    }

    if (type === 'content.view' && conversationId) {
      await this.applyRuntimeConversationEvent(conversationId, event, source, true);
      return;
    }

    if (family === 'assistant_content' && conversationId) {
      await this.handleAssistantContentEvent(event, source);
      return;
    }

    if (family === 'action' && conversationId) {
      await this.applyRuntimeConversationEvent(conversationId, event, source, !type.endsWith('.args'));
      this.emit({
        type: 'conversation.action.protocol',
        conversationId,
        reason: source,
        event
      });
      return;
    }

    if (family === 'summary') {
      const projected = projectRemoteChatSummary(event);
      if (projected) {
        const hasLatestMessage = projected.lastMessageText !== undefined && projected.lastMessageAt !== undefined;
        const projectedRead =
          projected.read !== undefined
            ? projected.read
            : this.activeConversationId !== projected.conversationId && hasLatestMessage
              ? normalizeChatReadState({ read: { isRead: false } })
              : undefined;
        const patchResult = await patchConversationSummary({
          conversationId: projected.conversationId,
          title: projected.title,
          ...(hasLatestMessage
            ? {
                lastMessageText: projected.lastMessageText,
                lastMessageAt: projected.lastMessageAt,
                lastMessageStatus: projected.lastMessageStatus
              }
            : {}),
          ...(projectedRead !== undefined ? { read: { ...event, read: projectedRead } } : {}),
          shouldMoveToTop: hasLatestMessage,
          agentKey: projected.agentKey
        });

        if (patchResult?.changed || patchResult?.directoryChanged) {
          this.emitHomePatch(
            patchResult.summary,
            {
              shouldMoveToTop: true
            },
            patchResult.directoryChanged
          );
        }
        if (this.activeConversationId === projected.conversationId && hasLatestMessage) {
          await this.requestConversationReadConfirmation(projected.conversationId, {
            confirmMarker: `summary:${projected.lastMessageAt}`
          });
        }
        return;
      }
    }

    if (
      conversationId &&
      (family === 'awaiting' ||
        family === 'reasoning' ||
        family === 'planning' ||
        family === 'tool' ||
        family === 'source' ||
        family === 'artifact' ||
        family === 'plan' ||
        family === 'task' ||
        family === 'usage' ||
        family === 'context' ||
        family === 'request')
    ) {
      await this.applyRuntimeConversationEvent(
        conversationId,
        event,
        source,
        !type.endsWith('.delta') && !type.endsWith('.args') && type !== 'tool.output'
      );
      return;
    }

    if (conversationId) {
      await markConversationDirty(conversationId, type || 'push');
      if (this.activeConversationId === conversationId) {
        await this.scheduleConversationReconcile(conversationId, 'reconcile', false);
      }
    }
  }

  private async handleConversationRemovedEvent(
    event: Record<string, unknown>,
    reason: Extract<ChatSyncReason, 'push' | 'stream'>
  ) {
    const conversationId = extractConversationId(event);
    if (!conversationId) {
      return;
    }

    this.stopAttachedRun(conversationId);
    await this.flushConversationStreamBuffers(conversationId);
    const cached = await markConversationSourceDeleted(conversationId);
    this.resetConversationRuntimeState(conversationId, reason);
    if (cached) {
      this.emit({
        type: 'home.item.patch',
        patch: {
          conversationId,
          unreadCount: 0,
          sourceDeleted: true,
          directoryProjectionChanged: true
        }
      });
    }
    this.emit({
      type: 'home.directory.replace'
    });
  }

  private async handleConversationUnreadStateEvent(event: Record<string, unknown>, unreadCount: number) {
    const conversationId = extractConversationId(event);
    if (!conversationId) {
      if (unreadCount <= 0) {
        await this.handleReadAllEvent(event);
      }
      return;
    }

    const serverRead = normalizeChatReadState({
      ...event,
      read: {
        isRead: unreadCount <= 0,
        readAt: event.readAt,
        readRunId: event.readRunId || event.runId
      }
    });
    const result = await setConversationReadStateLocal(
      conversationId,
      { ...event, read: serverRead },
      {
        agentKey: extractAgentKey(event) || null
      }
    );
    if (result?.changed) {
      this.emitHomePatch(
        result.summary,
        {
          shouldMoveToTop: false
        },
        result.directoryChanged
      );
    }
    if (this.activeConversationId === conversationId && unreadCount > 0) {
      await this.requestConversationReadConfirmation(conversationId, {
        confirmMarker: `read-event:${toText(event.readRunId || event.runId) || conversationId}`
      });
    }
  }

  private async handleReadAllEvent(event: Record<string, unknown>) {
    const agentKey = extractAgentKey(event);
    const conversationId = extractConversationId(event);

    if (!agentKey) {
      if (conversationId) {
        await this.handleConversationUnreadStateEvent(event, 0);
      }
      return;
    }

    const result = await markConversationReadScopeLocal({
      agentKey: agentKey || null
    });

    if (result.directoryChanged) {
      this.emit({
        type: 'home.directory.replace'
      });
    }

    if (result.changedActiveConversationId) {
      const summary = await getConversationDetail(result.changedActiveConversationId);
      if (summary) {
        this.emitHomePatch(summary, { shouldMoveToTop: false }, false);
      }
    }
  }

  private async handleAckEvent(event: Record<string, unknown>) {
    const clientMessageId = toText(event.clientMessageId);
    if (!clientMessageId) {
      return;
    }

    const patched = await patchMessageByClientMessageId(clientMessageId, {
      serverMessageId: toText(event.serverMessageId) || undefined,
      createdAt: toFiniteNumber(event.createdAt ?? event.timestamp, Date.now()),
      deliveryStatus: 'sent',
      errorReason: null
    });

    if (!patched) {
      return;
    }

    const patch = {
      createdAt: patched.createdAt,
      deliveryStatus: patched.deliveryStatus,
      errorReason: patched.errorReason,
      serverMessageId: patched.serverMessageId
    };
    this.emit({
      type: 'conversation.message.patch',
      conversationId: patched.conversationId,
      reason: 'push',
      messageId: patched.messageId,
      patch
    });
    this.publishTimelineMessagePatch(patched.conversationId, 'push', patched.messageId, patch);
    await this.emitHomePatchFromConversation(patched.conversationId, {
      shouldMoveToTop: true
    });
  }

  private async handleIncomingMessageEvent(event: Record<string, unknown>, reason: ChatSyncReason) {
    const conversationId = extractConversationId(event);
    const serverMessageId = toText(event.serverMessageId || event.messageId);
    const content = extractEventText(event);
    const createdAt = toFiniteNumber(event.createdAt ?? event.timestamp, Date.now());
    const incomingAttachments = createMessageAttachmentsFromReferences({
      conversationId,
      messageId: serverMessageId,
      references: event.references,
      createdAt
    });
    const messageContent = content || formatChatAttachmentsMessageText(incomingAttachments);
    if (!conversationId || !serverMessageId || !messageContent) {
      if (conversationId) {
        await markConversationDirty(conversationId, 'push');
        await this.scheduleConversationReconcile(conversationId, 'reconcile', false);
      }
      return;
    }

    const existing = await getMessageByServerMessageId(serverMessageId);
    const active = this.activeConversationId === conversationId;
    const incomingRunId = toText(event.runId);
    const message = await upsertProjectedMessage(
      {
        messageId: existing?.messageId || serverMessageId,
        clientMessageId: existing?.clientMessageId ?? null,
        serverMessageId,
        conversationId,
        role: extractMessageRole(event),
        content: messageContent,
        createdAt,
        deliveryStatus: 'sent',
        errorReason: null,
        attachments: incomingAttachments,
        title: extractTitle(event)
      },
      {
        suppressUnread: active
      }
    );
    const timelineRunContext = message.role === 'assistant' && incomingRunId ? { runId: incomingRunId } : undefined;

    if (existing) {
      const patch = {
        content: message.content,
        createdAt: message.createdAt,
        deliveryStatus: message.deliveryStatus,
        errorReason: message.errorReason,
        serverMessageId: message.serverMessageId,
        attachments: message.attachments
      };
      this.emit({
        type: 'conversation.message.patch',
        conversationId,
        reason,
        messageId: message.messageId,
        patch
      });
      this.publishTimelineMessagePatch(conversationId, reason, message.messageId, patch, timelineRunContext);
    } else {
      this.emit({
        type: 'conversation.message.insert',
        conversationId,
        reason,
        message
      });
      this.publishTimelineMessage(message, reason, timelineRunContext);
    }

    await this.emitHomePatchFromConversation(conversationId, {
      shouldMoveToTop: true
    });

    if (active && message.role === 'assistant') {
      await this.requestConversationReadConfirmation(conversationId, {
        confirmMarker: `message:${serverMessageId}`
      });
    }
  }

  private async handleAssistantContentEvent(event: Record<string, unknown>, reason: ChatSyncReason) {
    const conversationId = extractConversationId(event);
    if (!conversationId) {
      return;
    }

    if (isChatTimelineContentEventClosed(this.getConversationTimelineState(conversationId), conversationId, event))
      return;
    const type = normalizeEventType(event.type);
    const createdAt = toFiniteNumber(
      event.timestamp || event.ts || event.time || event.createdAt || event.updatedAt,
      Date.now()
    );
    const eventMessageId = buildAssistantMessageId(conversationId, event);
    const runId = toText(event.runId);
    const text = extractEventText(event);
    const title = extractTitle(event);
    const serverMessageId = toText(event.serverMessageId) || null;
    let shouldPatchServerMessageId = false;
    let buffer = this.streamBuffers.get(eventMessageId);
    if (!buffer) {
      const fallbackMessageId = buildFallbackAssistantMessageId(conversationId, runId);
      const fallbackBuffer =
        fallbackMessageId === eventMessageId ? undefined : this.streamBuffers.get(fallbackMessageId);
      buffer =
        fallbackBuffer ||
        (runId ? findSingleStreamBufferByRun(this.streamBuffers.values(), conversationId, runId) : undefined);
    }

    if (!buffer) {
      const initialContent = type === 'content.delta' ? text : text || '';
      const messageId = eventMessageId;
      buffer = {
        key: messageId,
        conversationId,
        messageId,
        runId,
        createdAt,
        content: initialContent,
        serverMessageId,
        title,
        reason,
        pendingUiDelta: '',
        pendingUiSnapshotText: undefined,
        pendingDbDelta: type === 'content.delta' ? text : '',
        pendingDbSnapshotText: type !== 'content.delta' && initialContent ? initialContent : undefined,
        publishedToTimeline: false,
        publishedStreamStatus: undefined,
        uiTimer: null,
        dbTimer: null
      };
      this.streamBuffers.set(messageId, buffer);

      if (initialContent) {
        this.publishStreamBufferInitialMessage(
          buffer,
          type === 'content.end' && event.status !== 'failed' ? 'done' : 'streaming'
        );
      }
    } else {
      buffer.reason = reason;
      shouldPatchServerMessageId = Boolean(serverMessageId) && buffer.serverMessageId !== serverMessageId;
      if (serverMessageId) {
        buffer.serverMessageId = serverMessageId;
      }
      if (title) {
        buffer.title = title;
      }

      if (shouldPatchServerMessageId && buffer.publishedToTimeline && type !== 'content.end') {
        const patch = { serverMessageId };
        this.emit({
          type: 'conversation.message.patch',
          conversationId,
          reason,
          messageId: buffer.messageId,
          patch
        });
        this.publishTimelineMessagePatch(conversationId, reason, buffer.messageId, patch, {
          runId: buffer.runId
        });
      }

      if (type === 'content.delta') {
        buffer.content = `${buffer.content}${text}`;
        buffer.pendingUiDelta = `${buffer.pendingUiDelta}${text}`;
        buffer.pendingDbDelta = `${buffer.pendingDbDelta}${text}`;
      } else {
        buffer.content = text || buffer.content;
        buffer.pendingUiSnapshotText = buffer.content;
        buffer.pendingDbSnapshotText = buffer.content;
        buffer.pendingUiDelta = '';
        buffer.pendingDbDelta = '';
      }
    }

    if (type === 'content.delta' && !buffer.content) {
      buffer.content = text;
    }

    if (!buffer.publishedToTimeline && buffer.content) {
      this.publishStreamBufferInitialMessage(
        buffer,
        type === 'content.end' && event.status !== 'failed' ? 'done' : 'streaming'
      );
    }

    if (type === 'content.snapshot' && Array.isArray(event.views) && buffer.publishedToTimeline) {
      this.publishTimelineMessagePatch(
        conversationId,
        reason,
        buffer.messageId,
        {},
        {
          runId: buffer.runId,
          viewBindings: readTimelineViewBindings(event.views)
        }
      );
    }

    const hasPendingUiPatch = buffer.pendingUiSnapshotText !== undefined || Boolean(buffer.pendingUiDelta);
    if (hasPendingUiPatch && !buffer.uiTimer) {
      buffer.uiTimer = setTimeout(() => {
        void this.flushStreamBufferToUi(buffer!.key);
      }, STREAM_UI_FLUSH_MS);
    }

    if (type === 'content.end') {
      await this.flushStreamBufferToUi(buffer.key);
      await this.flushStreamBufferToDb(buffer.key);
      this.streamBuffers.delete(buffer.key);
      if (event.status === 'failed') {
        await this.applyRuntimeConversationEvent(
          conversationId,
          { ...event, messageId: buffer.messageId },
          reason,
          true
        );
        await this.emitHomePatchFromConversation(conversationId, { shouldMoveToTop: true });
        return;
      }
      if (buffer.publishedToTimeline) {
        const shouldPatchStreamDone = buffer.publishedStreamStatus !== 'done';
        if (shouldPatchServerMessageId || shouldPatchStreamDone) {
          const patch = {
            ...(shouldPatchServerMessageId ? { serverMessageId } : {}),
            ...(shouldPatchStreamDone ? { streamStatus: 'done' as const } : {})
          };
          this.emit({
            type: 'conversation.message.patch',
            conversationId,
            reason,
            messageId: buffer.messageId,
            patch
          });
          this.publishTimelineMessagePatch(conversationId, reason, buffer.messageId, patch, {
            runId: buffer.runId
          });
        }
        await this.emitHomePatchFromConversation(conversationId, {
          shouldMoveToTop: true
        });
        if (this.activeConversationId === conversationId) {
          await this.requestConversationReadConfirmation(conversationId, {
            confirmMarker: `stream:${buffer.messageId}`
          });
        }
      }
      return;
    }

    const hasPendingDbPatch = buffer.pendingDbSnapshotText !== undefined || Boolean(buffer.pendingDbDelta);
    if (hasPendingDbPatch && !buffer.dbTimer) {
      buffer.dbTimer = setTimeout(() => {
        void this.flushStreamBufferToDb(buffer!.key);
      }, STREAM_DB_FLUSH_MS);
    }
  }

  private publishStreamBufferInitialMessage(buffer: StreamBuffer, streamStatus: ChatMessageItem['streamStatus']) {
    if (buffer.publishedToTimeline || !buffer.content) {
      return;
    }

    const initialMessage: ChatMessageItem = {
      messageId: buffer.messageId,
      clientMessageId: null,
      serverMessageId: buffer.serverMessageId,
      conversationId: buffer.conversationId,
      role: 'assistant',
      content: buffer.content,
      createdAt: buffer.createdAt,
      deliveryStatus: 'sent',
      streamStatus,
      errorReason: null,
      attachments: []
    };
    buffer.publishedToTimeline = true;
    buffer.publishedStreamStatus = streamStatus;
    buffer.pendingUiDelta = '';
    buffer.pendingUiSnapshotText = undefined;
    this.emit({
      type: 'conversation.message.insert',
      conversationId: buffer.conversationId,
      reason: buffer.reason,
      message: initialMessage
    });
    this.publishTimelineMessage(initialMessage, buffer.reason, { runId: buffer.runId });
  }

  private async flushStreamBufferToUi(bufferKey: string) {
    const buffer = this.streamBuffers.get(bufferKey);
    if (!buffer) {
      return;
    }

    if (buffer.uiTimer) {
      clearTimeout(buffer.uiTimer);
      buffer.uiTimer = null;
    }

    const hasSnapshot = buffer.pendingUiSnapshotText !== undefined;
    const hasDelta = Boolean(buffer.pendingUiDelta);
    if (!hasSnapshot && !hasDelta) {
      return;
    }

    this.emit({
      type: 'conversation.stream.delta',
      conversationId: buffer.conversationId,
      reason: buffer.reason,
      messageId: buffer.messageId,
      createdAt: buffer.createdAt,
      delta: buffer.pendingUiDelta,
      snapshotText: buffer.pendingUiSnapshotText
    });
    this.publishTimelineStreamDelta(buffer.conversationId, buffer.reason, {
      messageId: buffer.messageId,
      createdAt: buffer.createdAt,
      delta: buffer.pendingUiDelta,
      snapshotText: buffer.pendingUiSnapshotText,
      runId: buffer.runId
    });

    buffer.pendingUiDelta = '';
    buffer.pendingUiSnapshotText = undefined;
  }

  private async flushStreamBufferToDb(bufferKey: string) {
    const buffer = this.streamBuffers.get(bufferKey);
    if (!buffer) {
      return;
    }

    if (buffer.dbTimer) {
      clearTimeout(buffer.dbTimer);
      buffer.dbTimer = null;
    }

    const hasSnapshot = buffer.pendingDbSnapshotText !== undefined;
    const hasDelta = Boolean(buffer.pendingDbDelta);
    if (!hasSnapshot && !hasDelta) {
      return;
    }

    await appendAssistantDelta(
      {
        conversationId: buffer.conversationId,
        messageId: buffer.messageId,
        delta: buffer.pendingDbDelta,
        snapshotText: buffer.pendingDbSnapshotText,
        createdAt: buffer.createdAt,
        serverMessageId: buffer.serverMessageId,
        title: buffer.title
      },
      {
        suppressUnread: this.activeConversationId === buffer.conversationId
      }
    );

    await markConversationSynced(buffer.conversationId);
    buffer.pendingDbDelta = '';
    buffer.pendingDbSnapshotText = undefined;
  }

  private async flushConversationStreamBuffers(conversationId: string) {
    const pendingKeys = [...this.streamBuffers.values()]
      .filter((buffer) => buffer.conversationId === conversationId)
      .map((buffer) => buffer.key);

    for (const key of pendingKeys) {
      await this.flushStreamBufferToUi(key);
      await this.flushStreamBufferToDb(key);
      this.streamBuffers.delete(key);
    }
  }

  private resetConversationRuntimeState(conversationId: string, reason: ChatSyncReason) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    const timer = this.runtimeEmitTimers.get(normalizedConversationId);
    if (timer) {
      clearTimeout(timer);
      this.runtimeEmitTimers.delete(normalizedConversationId);
    }
    const persistTimer = this.timelinePersistTimers.get(normalizedConversationId);
    if (persistTimer) {
      clearTimeout(persistTimer);
      this.timelinePersistTimers.delete(normalizedConversationId);
    }
    this.pendingRuntimeEmitReasons.delete(normalizedConversationId);
    this.stoppingConversations.delete(normalizedConversationId);
    this.unavailableAttachRuns.delete(normalizedConversationId);
    const hadTimelineState = this.timelineStates.delete(normalizedConversationId);
    if (!hadTimelineState) {
      return;
    }

    this.emit({
      type: 'conversation.runtime.reset',
      conversationId: normalizedConversationId,
      reason
    });
    this.emit({
      type: 'conversation.timeline.reset',
      conversationId: normalizedConversationId,
      reason
    });
  }

  private emitConversationRuntimeState(conversationId: string, reason: ChatSyncReason) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    const timer = this.runtimeEmitTimers.get(normalizedConversationId);
    if (timer) {
      clearTimeout(timer);
      this.runtimeEmitTimers.delete(normalizedConversationId);
    }

    const timelineState = this.getConversationTimelineState(normalizedConversationId);
    const state = projectTimelineRuntimeState(timelineState);
    this.pendingRuntimeEmitReasons.delete(normalizedConversationId);
    this.emit({
      type: 'conversation.runtime.replace',
      conversationId: normalizedConversationId,
      reason,
      state
    });
    this.emitConversationTimelineState(normalizedConversationId, reason, timelineState);
  }

  private syncPendingSteerFromTimeline(conversationId: string, state: ChatTimelineState, checkRunTerminal = false) {
    const timeline = state;
    const pending = this.pendingSteers.get(conversationId);
    if (pending) {
      const confirmed = timeline.nodesById[`message:${conversationId}:request:${pending.steerId}`];
      if (confirmed?.kind === 'message' && confirmed.messageVariant === 'steer' && confirmed.runId === pending.runId) {
        this.pendingSteers.delete(conversationId);
        this.emit({
          type: 'conversation.steer.changed',
          conversationId: conversationId,
          pending: null,
          confirmed: pending
        });
      } else if (checkRunTerminal && !pending.runEnded && timeline.activeRunId !== pending.runId) {
        const ended = Object.values(timeline.nodesById).some(
          (node) => node.kind === 'run' && node.runId === pending.runId && node.lifecycle !== 'active'
        );
        if (ended) {
          const next = { ...pending, runEnded: true };
          this.pendingSteers.set(conversationId, next);
          this.emit({ type: 'conversation.steer.changed', conversationId: conversationId, pending: next });
        }
      }
    }
  }

  private emitConversationTimelineState(conversationId: string, reason: ChatSyncReason, state?: ChatTimelineState) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    this.syncPendingSteerFromTimeline(
      normalizedConversationId,
      state ?? this.getConversationTimelineState(normalizedConversationId),
      reason !== 'stream' && reason !== 'push' && reason !== 'local_send'
    );
    this.emit({
      type: 'conversation.timeline.replace',
      conversationId: normalizedConversationId,
      reason,
      state: state ?? this.getConversationTimelineState(normalizedConversationId)
    });
  }

  private scheduleConversationRuntimeEmit(conversationId: string, reason: ChatSyncReason, immediate: boolean) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    this.pendingRuntimeEmitReasons.set(normalizedConversationId, reason);
    if (immediate) {
      this.emitConversationRuntimeState(normalizedConversationId, reason);
      return;
    }

    if (this.runtimeEmitTimers.has(normalizedConversationId)) {
      return;
    }

    const timer = setTimeout(() => {
      const pendingReason = this.pendingRuntimeEmitReasons.get(normalizedConversationId) ?? reason;
      this.emitConversationRuntimeState(normalizedConversationId, pendingReason);
    }, RUNTIME_EMIT_FLUSH_MS);
    this.runtimeEmitTimers.set(normalizedConversationId, timer);
  }

  private async applyRuntimeConversationEvent(
    conversationId: string,
    event: Record<string, unknown>,
    reason: ChatSyncReason,
    immediate: boolean
  ) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    if (this.activeConversationId !== normalizedConversationId && !this.timelineStates.has(normalizedConversationId)) {
      await markConversationDirty(normalizedConversationId, toText(event.type) || reason);
      return;
    }

    const currentState = this.getConversationTimelineState(normalizedConversationId);
    const nextState = applyChatTimelineEvent(currentState, normalizedConversationId, event);
    if (nextState === currentState) {
      return;
    }

    this.timelineStates.set(normalizedConversationId, nextState);
    if (event.type !== 'tool.output' && event.type !== 'run.activity')
      this.scheduleTimelinePersist(normalizedConversationId);
    this.scheduleConversationRuntimeEmit(normalizedConversationId, reason, immediate);
  }

  private async requestConversationReadConfirmation(
    conversationId: string,
    options?: {
      confirmMarker?: string;
      onlyIfUnread?: boolean;
    }
  ) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId || this.visibleConversationId !== normalizedConversationId) {
      return;
    }

    if (this.readConfirmations.has(normalizedConversationId)) {
      return;
    }

    if (options?.onlyIfUnread) {
      const summary = await getConversationDetail(normalizedConversationId);
      if (!summary || summary.unreadCount <= 0) {
        return;
      }
    }

    const now = Date.now();
    const syncState = await getConversationSyncState(normalizedConversationId);
    const timeline = this.getConversationTimelineState(normalizedConversationId);
    let readRunId = syncState?.activeRunId || null;
    for (let index = timeline.orderedNodeIds.length - 1; !readRunId && index >= 0; index -= 1) {
      const node = timeline.nodesById[timeline.orderedNodeIds[index]];
      if (node?.kind === 'run') readRunId = node.runId || null;
    }
    const confirmMarker = String(options?.confirmMarker || '').trim() || `run:${readRunId || 'none'}`;
    const lastMark = this.lastReadMarks.get(normalizedConversationId);
    if (lastMark && lastMark.marker === confirmMarker && now - lastMark.markedAt < READ_MARK_DEBOUNCE_MS) {
      return;
    }

    if (this.visibleConversationId !== normalizedConversationId) return;
    this.lastReadMarks.set(normalizedConversationId, {
      markedAt: now,
      marker: confirmMarker
    });
    const confirmation = this.confirmConversationReadWithServer(normalizedConversationId, readRunId, now).finally(
      () => {
        if (this.readConfirmations.get(normalizedConversationId) === confirmation)
          this.readConfirmations.delete(normalizedConversationId);
      }
    );
    this.readConfirmations.set(normalizedConversationId, confirmation);
    void confirmation;
  }

  private async confirmConversationReadWithServer(conversationId: string, readRunId: string | null, readAt: number) {
    const lifecycleVersion = this.lifecycleVersion;
    try {
      if (this.visibleConversationId !== conversationId) return;
      const response = await this.markChatReadViaTransport({
        chatId: conversationId,
        ...(readRunId ? { runId: readRunId } : {})
      });
      if (!this.isLifecycleCurrent(lifecycleVersion)) return;
      const result = await setConversationReadStateLocal(
        conversationId,
        hasChatReadStateInput(response)
          ? response
          : {
              read: {
                isRead: true,
                readAt: response?.readAt ?? readAt,
                readRunId: response?.readRunId ?? readRunId
              }
            }
      );
      if (result?.changed) {
        this.emitHomePatch(
          result.summary,
          {
            shouldMoveToTop: false
          },
          result.directoryChanged
        );
      }
    } catch {
      await this.scheduleConversationReconcile(conversationId, 'reconcile', false);
    }
  }

  private emitHomePatch(
    summary: ChatHomeItem,
    extra: Partial<ChatHomeItemPatch> | undefined,
    directoryProjectionChanged: boolean
  ) {
    if (directoryProjectionChanged) {
      this.emit({
        type: 'home.directory.replace'
      });
    }

    this.emit({
      type: 'home.item.patch',
      patch: {
        conversationId: summary.conversationId,
        title: summary.title,
        lastMessageText: summary.lastMessageText,
        lastMessageAt: summary.lastMessageAt,
        unreadCount: summary.unreadCount,
        read: summary.read,
        lastMessageStatus: summary.lastMessageStatus,
        pinnedAt: summary.pinnedAt,
        shouldMoveToTop: extra?.shouldMoveToTop,
        directoryProjectionChanged
      }
    });
  }

  private async emitHomePatchFromSummary(summary: ChatHomeItem, extra?: Partial<ChatHomeItemPatch>) {
    const directoryChanged = await refreshChatDirectoryProjectionForConversation(summary.conversationId);
    this.emitHomePatch(summary, extra, directoryChanged);
  }

  private async emitHomePatchFromConversation(conversationId: string, extra?: Partial<ChatHomeItemPatch>) {
    const summary = await getConversationDetail(conversationId);
    if (!summary) {
      return;
    }

    await this.emitHomePatchFromSummary(summary, extra);
  }

  private async scheduleConversationReconcile(conversationId: string, reason: ChatSyncReason, immediate: boolean) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    const current = this.reconcileStates.get(normalizedConversationId) || {
      inFlight: null,
      timer: null,
      trailingReason: null
    };
    this.reconcileStates.set(normalizedConversationId, current);
    current.trailingReason = reason;

    const run = () => {
      if (current.timer) {
        clearTimeout(current.timer);
        current.timer = null;
      }

      const nextReason = current.trailingReason || reason;
      current.trailingReason = null;
      current.inFlight = this.runConversationReconcile(normalizedConversationId, nextReason)
        .catch((error) => {
          if (!isRecoverableReconcileError(error)) {
            throw error;
          }
        })
        .finally(() => {
          current.inFlight = null;
          if (current.trailingReason) {
            void this.scheduleConversationReconcile(normalizedConversationId, current.trailingReason, true);
          }
        });
      return current.inFlight;
    };

    if (current.inFlight) {
      return current.inFlight;
    }

    if (immediate) {
      return run();
    }

    if (current.timer) {
      clearTimeout(current.timer);
    }
    current.timer = setTimeout(() => {
      void run();
    }, RECONCILE_DEBOUNCE_MS);
  }

  private async runConversationReconcile(conversationId: string, reason: ChatSyncReason, beforeEventSeq?: number) {
    const lifecycleVersion = this.lifecycleVersion;
    await markConversationDirty(conversationId, reason);
    if (!this.isLifecycleCurrent(lifecycleVersion)) return;

    const timelineBeforeRequest = this.timelineStates.get(conversationId);
    const revisionBeforeRequest = timelineBeforeRequest?.revision;
    const remoteDetailPromise = this.getChatDetailViaTransport(conversationId, beforeEventSeq).catch((error) => {
      if (isApiStatusError(error, 404)) {
        return null;
      }
      throw error;
    });
    const [remoteDetail, localSummary] = await Promise.all([
      remoteDetailPromise,
      getConversationDetail(conversationId)
    ]);
    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    if (!remoteDetail) {
      if (localSummary) {
        await this.emitHomePatchFromConversation(conversationId, {
          shouldMoveToTop: false
        });
      }
      return;
    }
    const projection = projectRemoteChatDetail(
      remoteDetail,
      buildFallbackSummary(localSummary),
      beforeEventSeq !== undefined || this.timelineStates.get(conversationId)?.revision !== revisionBeforeRequest
    );
    if (!projection) {
      return;
    }

    const read =
      beforeEventSeq === undefined &&
      this.timelineStates.get(conversationId)?.revision === revisionBeforeRequest &&
      projection.hasExplicitReadState
        ? projection.read
        : undefined;
    const unreadCount = read ? (read.isRead ? 0 : 1) : undefined;
    const currentTimelineState =
      this.timelineStates.get(projection.conversationId) ??
      (isAccountDesktopChatSource(this.source)
        ? await getConversationInitialTimelineState(projection.conversationId, 500)
        : undefined);
    let mergedTimelineState = mergeChatTimelineState(
      currentTimelineState,
      projection.timelineState,
      beforeEventSeq !== undefined || isAccountDesktopChatSource(this.source),
      { baseline: timelineBeforeRequest, historicalPage: beforeEventSeq !== undefined }
    );
    if (beforeEventSeq === undefined && currentTimelineState?.revision === revisionBeforeRequest) {
      mergedTimelineState = reconcileChatTimelineAwaitingSnapshot(mergedTimelineState, remoteDetail.awaiting);
    } else if (currentTimelineState) {
      mergedTimelineState = { ...mergedTimelineState, awaiting: currentTimelineState.awaiting };
    }
    if (currentTimelineState && currentTimelineState.revision !== revisionBeforeRequest) {
      mergedTimelineState = { ...mergedTimelineState, canContinue: currentTimelineState.canContinue };
    }
    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    const unavailableRun = this.getUnavailableAttachRun(projection.conversationId);
    const nextTimelineState =
      unavailableRun &&
      (mergedTimelineState.activeRunId === unavailableRun.runId ||
        projection.timelineState.activeRunId === unavailableRun.runId)
        ? applyChatTimelineRunUnavailable(mergedTimelineState, projection.conversationId, {
            runId: unavailableRun.runId,
            timestamp: unavailableRun.markedAt
          })
        : mergedTimelineState;
    const nextMessages = projectTimelineMessages(nextTimelineState);
    this.timelineStates.set(projection.conversationId, nextTimelineState);

    await reconcileConversationDetail({
      conversationId: projection.conversationId,
      title: projection.title,
      ...(unreadCount !== undefined ? { unreadCount } : {}),
      ...(read ? { read } : {}),
      activeRunId: nextTimelineState.activeRunId,
      summary: {
        ...projection.summary,
        ...(unreadCount !== undefined ? { unreadCount } : {}),
        ...(read ? { read } : {})
      },
      messages: nextMessages,
      timelineState: nextTimelineState
    });
    if (!this.isLifecycleCurrent(lifecycleVersion)) return;
    if (this.timelineStates.get(projection.conversationId) !== nextTimelineState) {
      this.scheduleTimelinePersist(projection.conversationId);
    }
    this.emitConversationRuntimeState(projection.conversationId, reason);
    await markConversationSynced(conversationId, {
      activeRunId: this.getConversationTimelineState(conversationId).activeRunId
    });

    if (this.activeConversationId === conversationId) {
      if (projection.hasExplicitReadState && !projection.read.isRead) {
        await this.requestConversationReadConfirmation(conversationId, {
          confirmMarker: `reconcile:${nextTimelineState.activeRunId || projection.summary.lastMessageAt}`
        });
      }
      const attachLastSeq =
        projection.activeRun?.runId === nextTimelineState.activeRunId ? projection.activeRun.lastSeq : 0;
      if (
        nextTimelineState.activeRunId &&
        !this.isUnavailableAttachRun(conversationId, nextTimelineState.activeRunId)
      ) {
        await this.attachActiveConversationRun(conversationId, 'attach', attachLastSeq);
      }
    } else {
      await this.emitHomePatchFromConversation(conversationId, {
        shouldMoveToTop: false
      });
    }

    this.emit({
      type: 'conversation.reconcile',
      conversationId,
      reason
    });
  }

  private stopAttachedRun(conversationId: string) {
    this.recentDuplicateAttaches.delete(conversationId);
    const current = this.activeAttaches.get(conversationId);
    if (!current) {
      return;
    }

    current.abort();
    this.activeAttaches.delete(conversationId);
  }

  private nextAttachToken(): number {
    this.attachTokenSeq += 1;
    return this.attachTokenSeq;
  }

  private isActiveAttachCurrent(conversationId: string, token: number): boolean {
    return this.activeAttaches.get(conversationId)?.token === token;
  }

  private rememberDuplicateAttach(conversationId: string, runId: string, owner: { agentKey?: string }) {
    this.recentDuplicateAttaches.set(conversationId, {
      runId,
      ...owner,
      observedAt: Date.now()
    });
  }

  private shouldSkipRecentlyDuplicatedAttach(
    conversationId: string,
    runId: string,
    owner: { agentKey?: string }
  ): boolean {
    const duplicate = this.recentDuplicateAttaches.get(conversationId);
    if (!duplicate) {
      return false;
    }
    if (
      duplicate.runId !== runId ||
      duplicate.agentKey !== owner.agentKey ||
      Date.now() - duplicate.observedAt > DUPLICATE_ATTACH_COOLDOWN_MS
    ) {
      this.recentDuplicateAttaches.delete(conversationId);
      return false;
    }
    return true;
  }

  private async requestConversationInterrupt(conversationId: string, runId: string) {
    const normalizedConversationId = toText(conversationId);
    const normalizedRunId = toText(runId);
    if (!normalizedConversationId || !normalizedRunId) {
      return;
    }

    const lifecycleVersion = this.lifecycleVersion;
    try {
      const scope = await this.resolveRunControlScope(normalizedConversationId, normalizedRunId);
      if (!this.isLifecycleCurrent(lifecycleVersion)) return;
      await this.requestChatApi<InterruptChatResponse>(
        CHAT_INTERRUPT_TRANSPORT_TYPE,
        buildInterruptChatPayload({
          requestId: createRunControlRequestId('interrupt'),
          chatId: normalizedConversationId,
          runId: normalizedRunId,
          ...scope
        })
      );
    } catch {
      // Rejection, run_not_found and unknown outcomes all require authority.
    } finally {
      if (this.isLifecycleCurrent(lifecycleVersion)) {
        try {
          await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', true);
        } finally {
          if (this.stoppingConversations.get(normalizedConversationId)?.runId === normalizedRunId) {
            this.clearStoppingConversation(normalizedConversationId);
          }
        }
      }
    }
  }

  private async attachActiveConversationRun(conversationId: string, reason: ChatSyncReason, initialLastSeq = 0) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId || this.activeConversationId !== normalizedConversationId) {
      return;
    }
    if (
      this.conversationSendRequests.has(normalizedConversationId) ||
      [...this.activeOutgoingStreams.values()].some((stream) => stream.conversationId === normalizedConversationId)
    )
      return;

    const syncState = await getConversationSyncState(normalizedConversationId);
    const runId = toText(syncState?.activeRunId);
    if (!runId) {
      return;
    }
    if (this.isUnavailableAttachRun(normalizedConversationId, runId)) {
      return;
    }

    const recovery = this.attachRecoveryFailures.get(normalizedConversationId);
    if (recovery?.runId === runId && recovery.count >= 3) return;
    if (recovery && recovery.runId !== runId) this.attachRecoveryFailures.delete(normalizedConversationId);
    const owner = await this.resolveRunControlScope(normalizedConversationId, runId);
    if (!owner.agentKey) {
      return;
    }

    if (this.activeConversationId !== normalizedConversationId) return;
    if (
      this.conversationSendRequests.has(normalizedConversationId) ||
      [...this.activeOutgoingStreams.values()].some((stream) => stream.conversationId === normalizedConversationId)
    )
      return;
    if (
      this.timelineStates.has(normalizedConversationId) &&
      this.getConversationTimelineState(normalizedConversationId).activeRunId !== runId
    )
      return;
    const existing = this.activeAttaches.get(normalizedConversationId);
    if (existing?.runId === runId && existing.agentKey === owner.agentKey) {
      return existing.promise;
    }

    if (this.shouldSkipRecentlyDuplicatedAttach(normalizedConversationId, runId, owner)) {
      return;
    }

    this.stopAttachedRun(normalizedConversationId);
    const attachToken = this.nextAttachToken();
    const attachState: ActiveAttachState = {
      token: attachToken,
      runId,
      ...owner,
      lastSeq: normalizeAttachLastSeq(initialLastSeq),
      phase: 'pending',
      promise: Promise.resolve(),
      abort: () => {}
    };
    this.activeAttaches.set(normalizedConversationId, attachState);
    const attachPromise = this.startAttachActiveConversationRun(normalizedConversationId, reason, attachState);
    attachState.promise = attachPromise;

    try {
      await attachPromise;
    } finally {
      if (this.isActiveAttachCurrent(normalizedConversationId, attachToken) && attachState.phase === 'pending') {
        this.activeAttaches.delete(normalizedConversationId);
      }
    }
  }

  private recordAttachRecoveryFailure(conversationId: string, runId: string) {
    const previous = this.attachRecoveryFailures.get(conversationId);
    const count = previous?.runId === runId ? previous.count + 1 : 1;
    this.attachRecoveryFailures.set(conversationId, { runId, count });
    if (count === 3) this.emit({ type: 'conversation.recovery.error', conversationId, runId });
  }

  private async startAttachActiveConversationRun(
    normalizedConversationId: string,
    reason: ChatSyncReason,
    attachState: ActiveAttachState
  ) {
    const config = await this.resolveTransportConfig();
    if (
      !config ||
      this.activeConversationId !== normalizedConversationId ||
      !this.isActiveAttachCurrent(normalizedConversationId, attachState.token)
    ) {
      return;
    }

    const initialSeq = attachState.lastSeq;
    const handle = await attachChatRun({
      ...config,
      payload: unscopeChatPayload({
        runId: attachState.runId,
        chatId: normalizedConversationId,
        agentKey: attachState.agentKey,
        lastSeq: attachState.lastSeq
      }),
      onEvent: (event) => {
        if (!this.isActiveAttachCurrent(normalizedConversationId, attachState.token)) {
          return;
        }
        const attachEvent = scopeChatPayload(this.source, event as Record<string, unknown>);
        if (typeof attachEvent.seq === 'number') {
          attachState.lastSeq = Math.max(attachState.lastSeq, attachEvent.seq);
          if (attachState.lastSeq > initialSeq) this.attachRecoveryFailures.delete(normalizedConversationId);
        }
        void this.handlePushEvent(
          {
            ...attachEvent,
            chatId: normalizedConversationId,
            conversationId: normalizedConversationId,
            runId: attachState.runId,
            agentKey: toText(attachEvent.agentKey) || attachState.agentKey
          },
          'stream'
        );
      },
      onDone: () => {
        if (!this.isActiveAttachCurrent(normalizedConversationId, attachState.token)) {
          return;
        }
        this.activeAttaches.delete(normalizedConversationId);
        if (attachState.lastSeq <= initialSeq)
          this.recordAttachRecoveryFailure(normalizedConversationId, attachState.runId);
        void this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
      },
      onError: (error) => {
        if (!this.isActiveAttachCurrent(normalizedConversationId, attachState.token)) {
          return;
        }
        this.activeAttaches.delete(normalizedConversationId);
        if (isDuplicateObserveError(error)) {
          this.rememberDuplicateAttach(normalizedConversationId, attachState.runId, attachState);
          return;
        }
        if (isMissingAgentKeyError(error)) {
          void markConversationDirty(normalizedConversationId, error.message || 'attach');
          return;
        }
        if (isInactiveRunError(error)) {
          void this.handleUnavailableAttachRun(normalizedConversationId, attachState.runId);
          return;
        }
        this.recordAttachRecoveryFailure(normalizedConversationId, attachState.runId);
        void this.handleStreamSideError(normalizedConversationId, error);
      }
    });

    attachState.abort = handle.abort;
    if (
      this.activeConversationId !== normalizedConversationId ||
      !this.isActiveAttachCurrent(normalizedConversationId, attachState.token)
    ) {
      handle.abort();
      return;
    }
    attachState.phase = 'active';
    this.recentDuplicateAttaches.delete(normalizedConversationId);
    await markConversationDirty(normalizedConversationId, reason);
  }

  private async resolveRunControlScope(conversationId: string, runId: string) {
    const currentState = this.getConversationTimelineState(conversationId);
    const timelineAgentKey =
      findTimelineRunAgentKey(currentState, runId) || findTimelineAwaitingAgentKey(currentState, runId);
    const historyScope = await getConversationHistoryScope(conversationId);

    return buildChatRunOwnerPayload({
      agentKey: toText(historyScope?.agentKey) || timelineAgentKey
    });
  }

  private async handleUnavailableAttachRun(conversationId: string, runId: string) {
    const normalizedConversationId = toText(conversationId);
    const normalizedRunId = toText(runId);
    if (!normalizedConversationId || !normalizedRunId) {
      return;
    }

    const unavailableRun: UnavailableAttachRunState = {
      runId: normalizedRunId,
      markedAt: Date.now()
    };
    this.unavailableAttachRuns.set(normalizedConversationId, unavailableRun);
    const cachedState = this.timelineStates.get(normalizedConversationId);
    const currentState = cachedState ?? (await getConversationInitialTimelineState(normalizedConversationId, 60));
    const nextState = applyChatTimelineRunUnavailable(currentState, normalizedConversationId, {
      runId: normalizedRunId,
      timestamp: unavailableRun.markedAt
    });
    if (nextState !== currentState || !cachedState) {
      this.publishTimelineState(normalizedConversationId, 'attach', nextState, {
        emitRuntime: true
      });
    }

    try {
      await setConversationActiveRunId(normalizedConversationId, '');
    } catch {
      await markConversationDirty(normalizedConversationId, 'attach');
    }
  }

  private async handleStreamSideError(conversationId: string, error: Error) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    await markConversationDirty(normalizedConversationId, error.message || 'stream');
    await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
  }
}

class ChatSyncCoordinator {
  private readonly listeners = new Set<SyncListener>();
  private activeService: ChatSyncService | null = null;
  private unsubscribeService: (() => void) | null = null;

  private emit(event: ChatSyncEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  private ensureActiveService(): ChatSyncService | null {
    const source = getActiveChatSource();
    if (this.activeService?.source.key === source?.key) return this.activeService;
    this.unsubscribeService?.();
    this.unsubscribeService = null;
    this.activeService?.stop(true);
    this.activeService = source
      ? new ChatSyncService(source, () =>
          source.kind === 'paired' ? resolveActiveWsTransportConfig('ap') : resolveDefaultWsTransportConfig()
        )
      : null;
    const service = this.activeService;
    if (service)
      this.unsubscribeService = service.subscribe((event) => {
        if (this.activeService === service) this.emit(event);
      });
    return service;
  }

  private getLocalService(): ChatSyncService {
    return this.ensureActiveService() ?? new ChatSyncService(getDefaultChatSource(), () => null);
  }

  private getServiceForId(value: string | null | undefined): ChatSyncService | null {
    const service = this.ensureActiveService();
    return service?.source.key === getChatSourceFromId(value).key ? service : null;
  }

  private requireServiceForId(value: string | null | undefined): ChatSyncService {
    const service = this.getServiceForId(value);
    if (!service) {
      throw new Error('当前账号或来源已变更');
    }
    return service;
  }

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    listener({
      type: 'connection.status',
      status: this.getStatus()
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  getDirectorySyncSnapshot(): ChatDirectorySyncSnapshot {
    const service = this.activeService;
    const snapshot = service?.getDirectorySyncSnapshot();
    return service?.source.key === getActiveChatSource()?.key && snapshot?.scopeId === getChatCacheScopeId()
      ? snapshot
      : EMPTY_DIRECTORY_SYNC_SNAPSHOT;
  }

  getViewDocument(request: ChatViewRequest) {
    return this.requireServiceForId(request.chatId).getViewDocument(request);
  }

  getSourceStatus(source: ChatSource | null): ChatSocketStatus {
    const service = this.ensureActiveService();
    if (source?.kind === 'default' && getCloudAuthSnapshot().status !== 'available') return 'disconnected';
    return source && service?.source.key === source.key ? service.getStatus() : 'idle';
  }

  getStatus(sourceId?: string): ChatSocketStatus {
    const service = sourceId ? this.getServiceForId(sourceId) : this.ensureActiveService();
    return service?.source.kind === 'default' && getCloudAuthSnapshot().status !== 'available'
      ? 'disconnected'
      : (service?.getStatus() ?? 'idle');
  }

  notifySourceAccessChanged() {
    this.emit({ type: 'connection.status', status: this.getStatus() });
  }

  async start() {
    await this.ensureActiveService()?.start();
  }

  stop() {
    this.unsubscribeService?.();
    this.unsubscribeService = null;
    this.activeService?.stop(true);
    this.activeService = null;
  }

  async refreshAuth() {
    await this.ensureActiveService()?.refreshAuth();
  }

  async refreshActiveDesktop() {
    await this.start();
    this.emit({ type: 'home.directory.replace' });
  }

  async prewarmHome() {
    if (getActiveChatSource()) await this.ensureActiveService()?.prewarmHome();
  }

  async refreshHome(reason: ChatSyncReason = 'manual_refresh'): Promise<ChatHomeRefreshFailure[]> {
    const service = this.ensureActiveService();
    if (!service) return [];
    try {
      await service.refreshHome(reason);
      return [];
    } catch (error) {
      return [{ source: service.source, message: error instanceof Error ? error.message : String(error) }];
    }
  }

  setConversationVisible(conversationId: string, visible: boolean) {
    this.getServiceForId(conversationId)?.setConversationVisible(conversationId, visible);
  }

  setActiveConversationId(conversationId: string | null) {
    const service = this.ensureActiveService();
    service?.setActiveConversationId(conversationId && this.getServiceForId(conversationId) ? conversationId : null);
  }

  stopStreaming(conversationId: string) {
    this.requireServiceForId(conversationId).stopStreaming(conversationId);
  }

  resumeStreaming(conversationId: string) {
    return this.requireServiceForId(conversationId).resumeStreaming(conversationId);
  }

  getConversationRuntimeState(conversationId: string) {
    return this.requireServiceForId(conversationId).getConversationRuntimeState(conversationId);
  }

  getConversationTimelineState(conversationId: string) {
    return this.requireServiceForId(conversationId).getConversationTimelineState(conversationId);
  }

  getAgentDetailSnapshot(agentKey: string) {
    return this.getServiceForId(agentKey)?.getAgentDetailSnapshot(agentKey) ?? null;
  }

  ensureAgentDetail(agentKey: string, options?: { refresh?: boolean; throwOnError?: boolean }) {
    const service = this.getServiceForId(agentKey);
    return service ? service.ensureAgentDetail(agentKey, options) : Promise.resolve(null);
  }

  listReferenceChats(conversationId: string, lastRunId?: string) {
    const service = this.getServiceForId(conversationId);
    if (!service) return Promise.reject(new Error('Chat source is unavailable'));
    return service.listReferenceChats(conversationId, lastRunId);
  }

  ensureAgentSkills(agentKey: string) {
    return this.getServiceForId(agentKey)?.ensureAgentSkills(agentKey) ?? Promise.resolve(null);
  }

  getAgentModelOptionsSnapshot(agentKey: string) {
    const service = this.getServiceForId(agentKey);
    if (!service) {
      return null;
    }
    return service.getAgentModelOptionsSnapshot(agentKey);
  }

  ensureAgentModelOptions(agentKey: string, options?: { refresh?: boolean }) {
    return this.requireServiceForId(agentKey).ensureAgentModelOptions(agentKey, options);
  }

  updateAgentModelConfig(agentKey: string, modelOverride: QueryModelOverride) {
    return this.requireServiceForId(agentKey).updateAgentModelConfig(agentKey, modelOverride);
  }

  markScopeRead(scope: { agentKey?: string | null }) {
    const key = scope.agentKey || '';
    return this.requireServiceForId(key).markScopeRead(scope);
  }

  reconcileConversation(conversationId: string, reason: ChatSyncReason = 'reconcile') {
    return this.requireServiceForId(conversationId).reconcileConversation(conversationId, reason);
  }

  loadOlderConversationHistory(conversationId: string) {
    return this.requireServiceForId(conversationId).loadOlderConversationHistory(conversationId);
  }

  resolveFrontendTool(conversationId: string, toolKey: string, reason: ChatTimelineFrontendToolResolution) {
    return this.requireServiceForId(conversationId).resolveFrontendTool(conversationId, toolKey, reason);
  }

  recordActionExecution(conversationId: string, outcome: Parameters<ChatSyncService['recordActionExecution']>[1]) {
    return this.requireServiceForId(conversationId).recordActionExecution(conversationId, outcome);
  }

  submitFrontendTool(conversationId: string, payload: FrontendToolSubmitPayloadData) {
    return this.requireServiceForId(conversationId).submitFrontendTool(conversationId, payload);
  }

  submitAwaiting(conversationId: string, payload: AwaitingSubmitPayloadData) {
    return this.requireServiceForId(conversationId).submitAwaiting(conversationId, payload);
  }

  deriveConversation(conversationId: string, runId: string) {
    return this.requireServiceForId(conversationId).deriveConversation(conversationId, runId);
  }

  submitRunFeedback(conversationId: string, runId: string, type: ChatFeedbackType, comment?: string) {
    return this.requireServiceForId(conversationId).submitRunFeedback(conversationId, runId, type, comment);
  }

  updateRuntimeAccessLevel(conversationId: string, runId: string, level: ChatQueryAccessLevel) {
    return this.requireServiceForId(conversationId).updateRuntimeAccessLevel(conversationId, runId, level);
  }

  getPendingSteer(conversationId: string) {
    return this.getServiceForId(conversationId)?.getPendingSteer(conversationId) || null;
  }

  restorePendingSteer(conversationId: string) {
    return this.requireServiceForId(conversationId).restorePendingSteer(conversationId);
  }

  steerConversation(conversationId: string, message: string, attachments: readonly ChatComposerAttachment[] = []) {
    return this.requireServiceForId(conversationId).steerConversation(conversationId, message, attachments);
  }

  continueWait(conversationId: string, toolId: string) {
    return this.requireServiceForId(conversationId).continueWait(conversationId, toolId);
  }

  listReferenceKbases(conversationId: string) {
    return this.requireServiceForId(conversationId).listReferenceKbases(conversationId);
  }

  getWorkspaceFile(resourceUrl: string) {
    return this.getLocalService().getWorkspaceFile(resourceUrl);
  }

  recoverSubmission(conversationId: string, clientMessageId: string) {
    return this.requireServiceForId(conversationId).recoverSubmission(conversationId, clientMessageId);
  }

  retryMessage(
    conversationId: string,
    clientMessageId: string,
    options: ChatSendMessageOptions = {},
    allowUnconfirmedResubmission = false
  ) {
    return this.requireServiceForId(conversationId).retryMessage(
      conversationId,
      clientMessageId,
      options,
      allowUnconfirmedResubmission
    );
  }

  sendMessage(
    conversationId: string,
    content: string,
    attachments: readonly ChatComposerAttachment[] = [],
    options: ChatSendMessageOptions = {}
  ) {
    return this.requireServiceForId(conversationId).sendMessage(conversationId, content, attachments, options);
  }

  collectConversationDiagnosticData(conversationId: string) {
    return this.requireServiceForId(conversationId).collectConversationDiagnosticData(conversationId);
  }

  async resetLocalCacheForDevelopment() {
    this.stop();
    return this.getLocalService().resetLocalCacheForDevelopment();
  }

  hasActiveLocalConversations() {
    return this.getLocalService().hasActiveLocalConversations();
  }

  inspectLocalCacheScope(scopeId: string) {
    return this.getLocalService().inspectLocalCacheScope(scopeId);
  }

  async clearLocalConversationCache(scopeId: string, conversationId: string) {
    return this.getLocalService().clearLocalConversationCache(scopeId, conversationId);
  }

  async clearLocalCacheScope(scopeId: string) {
    return this.getLocalService().clearLocalCacheScope(scopeId);
  }
}

export const chatSyncService = new ChatSyncCoordinator();
