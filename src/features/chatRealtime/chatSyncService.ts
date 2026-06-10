import { ApiError, getApiBaseUrl } from '../../core/api/apiClient';
import { getAccessTokenForRequest } from '../../core/auth/appAuth';
import {
  CHAT_SUMMARIES_TRANSPORT_TYPE,
  submitAwaitingApi,
  getChatDetailApi,
  markChatReadApi,
  type AwaitingSubmitPayloadData,
  type RemoteChatSummary,
} from '../../core/api/services/chatApi';
import {
  appendAssistantDelta,
  clearChatLocalCache,
  createOutgoingMessage,
  getConversationDetail,
  getConversationHistoryScope,
  getConversationSyncState,
  getMessageByClientMessageId,
  getMessageByServerMessageId,
  getPendingOutboxMessages,
  markConversationDirty,
  markConversationReadScopeLocal,
  markConversationSynced,
  patchConversationSummary,
  patchMessageByClientMessageId,
  persistConversationTimelineState,
  reconcileConversationDetail,
  refreshChatDirectoryProjectionForConversation,
  removeConversation,
  replaceChatHomeProjection,
  setConversationActiveRunId,
  setConversationReadStateLocal,
  upsertProjectedMessage,
} from '../chatPersistence/chatRepository';
import { hasChatReadStateInput, normalizeChatReadState } from '../chatPersistence/chatReadState';
import {
  projectRemoteHomeDirectory,
  type RemoteAgent,
  type RemoteTeam,
} from '../chatPersistence/chatDirectoryProjector';
import {
  projectRemoteChatDetail,
  projectRemoteChatSummary,
} from '../chatPersistence/chatProjector';
import {
  createMessageAttachmentsFromReferences,
  formatChatAttachmentsMessageText,
  normalizeChatAttachmentReferences,
} from '../chatPersistence/chatAttachmentModels';
import type {
  ChatComposerAttachment,
  ChatHomeItem,
  ChatMessageAttachment,
  ChatMessageItem,
} from '../chatPersistence/types';
import {
  buildAssistantMessageId,
  classifyChatProtocolEvent,
  extractAgentKey,
  extractConversationId,
  extractEventText,
  extractMessageRole,
  extractTeamId,
  extractTitle,
  normalizeEventType,
  toFiniteNumber,
  toText,
} from './routing';
import {
  attachChatRun,
  getChatTransportStatus,
  requestChatTransport,
  startChatPushTransport,
  stopChatPushTransport,
  streamChatQuery,
  updateChatTransportAuth,
} from './chatWsTransport';
import { ChatHomeItemPatch, ChatSocketStatus, ChatSyncEvent, ChatSyncReason } from './types';
import {
  applyChatTimelineEvent,
  applyChatTimelineMessage,
  applyChatTimelineStreamDelta,
  createChatTimelineState,
  mergeChatTimelineState,
  patchChatTimelineMessage,
  projectTimelineMessages,
  projectTimelineRuntimeState,
} from '../chatTimeline/index.ts';
import type { ChatTimelineState } from '../chatTimeline/index.ts';

type SyncListener = (event: ChatSyncEvent) => void;

type StreamBuffer = {
  key: string;
  conversationId: string;
  messageId: string;
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
  runId: string;
  agentKey: string;
  lastSeq: number;
  abort: () => void;
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

const STREAM_UI_FLUSH_MS = 64;
const STREAM_DB_FLUSH_MS = 320;
const RUNTIME_EMIT_FLUSH_MS = 48;
const TIMELINE_PERSIST_DEBOUNCE_MS = 420;
const RECONCILE_DEBOUNCE_MS = 180;
const READ_MARK_DEBOUNCE_MS = 1_500;

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
    unreadRunCount: summary.unreadCount,
  };
}

function createAwaitingSubmitId(): string {
  return `submit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isMissingAgentKeyError(error: Error): boolean {
  return /agentKey\s+is\s+required/i.test(error.message);
}

function isApiStatusError(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

function isRecoverableReconcileError(error: unknown): boolean {
  return isApiStatusError(error, 401) || isApiStatusError(error, 404);
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
  if (awaiting?.runId === runId && awaiting.interactive?.kind === 'question') {
    return toText(awaiting.interactive.agentKey);
  }

  for (const nodeId of state.orderedNodeIds) {
    const node = state.nodesById[nodeId];
    if (
      node?.kind === 'awaiting' &&
      node.runId === runId &&
      node.interactive?.kind === 'question'
    ) {
      return toText(node.interactive.agentKey);
    }
  }
  return '';
}

class ChatSyncService {
  private readonly listeners = new Set<SyncListener>();
  private status: ChatSocketStatus = getChatTransportStatus();
  private started = false;
  private startPromise: Promise<void> | null = null;
  private homeRefreshPromise: Promise<void> | null = null;
  private activeConversationId: string | null = null;
  private readonly inFlightOutgoingIds = new Set<string>();
  private readonly streamBuffers = new Map<string, StreamBuffer>();
  private readonly reconcileStates = new Map<string, ReconcileState>();
  private readonly activeAttaches = new Map<string, ActiveAttachState>();
  private readonly activeOutgoingStreams = new Map<string, ActiveOutgoingStreamState>();
  private readonly lastReadMarks = new Map<string, ReadMarkState>();
  private readonly readConfirmations = new Map<string, Promise<void>>();
  private readonly timelineStates = new Map<string, ChatTimelineState>();
  private readonly runtimeEmitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timelinePersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingRuntimeEmitReasons = new Map<string, ChatSyncReason>();
  private lifecycleVersion = 0;
  private hasConnectedOnce = false;

  getStatus() {
    return this.status;
  }

  stopStreaming(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    const attachedRunId = this.activeAttaches.get(normalizedConversationId)?.runId ?? '';
    this.stopAttachedRun(normalizedConversationId);
    const stoppedOutgoingIds = this.stopOutgoingStreams(normalizedConversationId);
    this.publishLocalRunCancel(
      normalizedConversationId,
      attachedRunId || stoppedOutgoingIds[0] || ''
    );
    void this.finishStoppedOutgoingStreams(normalizedConversationId, stoppedOutgoingIds);
  }

  resumeStreaming(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    void this.attachActiveConversationRun(normalizedConversationId, 'attach');
    void this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', true);
  }

  getConversationRuntimeState(conversationId: string) {
    return projectTimelineRuntimeState(this.getConversationTimelineState(conversationId));
  }

  getConversationTimelineState(conversationId: string) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return createChatTimelineState('');
    }

    return (
      this.timelineStates.get(normalizedConversationId) ??
      createChatTimelineState(normalizedConversationId)
    );
  }

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    listener({
      type: 'connection.status',
      status: this.status,
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

  stop() {
    this.lifecycleVersion += 1;
    this.started = false;
    this.hasConnectedOnce = false;
    stopChatPushTransport();
    this.clearTransientWork();
    this.setStatus('disconnected');
  }

  async resetLocalCacheForDevelopment() {
    this.stop();
    this.startPromise = null;
    this.homeRefreshPromise = null;
    this.activeConversationId = null;
    this.hasConnectedOnce = false;
    this.inFlightOutgoingIds.clear();
    this.lastReadMarks.clear();
    this.readConfirmations.clear();
    this.timelineStates.clear();
    this.pendingRuntimeEmitReasons.clear();
    await clearChatLocalCache();
  }

  private clearTransientWork() {
    this.activeAttaches.forEach((attach) => attach.abort());
    this.activeAttaches.clear();
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
    this.inFlightOutgoingIds.clear();
  }

  setActiveConversationId(conversationId: string | null) {
    const normalizedConversationId = toText(conversationId) || null;
    if (this.activeConversationId === normalizedConversationId) {
      return;
    }

    const previousConversationId = this.activeConversationId;
    this.activeConversationId = normalizedConversationId;

    if (previousConversationId) {
      this.stopAttachedRun(previousConversationId);
    }

    if (!normalizedConversationId) {
      return;
    }

    void this.requestConversationReadConfirmation(normalizedConversationId, {
      onlyIfUnread: true,
    });
    void this.attachActiveConversationRun(normalizedConversationId, 'attach');
  }

  async refreshHome(_reason: ChatSyncReason = 'manual_refresh') {
    if (this.homeRefreshPromise) {
      return this.homeRefreshPromise;
    }

    const lifecycleVersion = this.lifecycleVersion;
    this.homeRefreshPromise = (async () => {
      const config = await this.resolveTransportConfig();
      if (!config || !this.isLifecycleCurrent(lifecycleVersion)) {
        return;
      }

      const [remoteAgents, remoteTeams, remoteChats] = await Promise.all([
        requestChatTransport<RemoteAgent[]>({
          ...config,
          type: '/api/agents',
        }),
        requestChatTransport<RemoteTeam[]>({
          ...config,
          type: '/api/teams',
        }),
        requestChatTransport<RemoteChatSummary[]>({
          ...config,
          type: CHAT_SUMMARIES_TRANSPORT_TYPE,
        }),
      ]);
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        return;
      }

      const projection = projectRemoteHomeDirectory({
        agents: Array.isArray(remoteAgents) ? remoteAgents : [],
        teams: Array.isArray(remoteTeams) ? remoteTeams : [],
        chats: Array.isArray(remoteChats) ? remoteChats : [],
      });
      await replaceChatHomeProjection(projection);
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        return;
      }

      this.emit({
        type: 'home.directory.replace',
      });
    })().finally(() => {
      this.homeRefreshPromise = null;
    });

    return this.homeRefreshPromise;
  }

  async markScopeRead(scope: { agentKey?: string | null; teamId?: string | null }) {
    const agentKey = toText(scope.agentKey);
    const teamId = toText(scope.teamId);
    if (!agentKey && !teamId) {
      return;
    }

    const result = await markConversationReadScopeLocal({
      agentKey: agentKey || null,
      teamId: teamId || null,
      activeConversationId: this.activeConversationId,
    });
    if (result.directoryChanged) {
      this.emit({
        type: 'home.directory.replace',
      });
    }

    try {
      await markChatReadApi({
        ...(agentKey ? { agentKey } : {}),
        ...(teamId ? { teamId } : {}),
      });
    } catch {
      await this.refreshHome('manual_refresh');
    }
  }

  async reconcileConversation(conversationId: string, reason: ChatSyncReason = 'reconcile') {
    return this.scheduleConversationReconcile(conversationId, reason, true);
  }

  async submitAwaiting(conversationId: string, payload: AwaitingSubmitPayloadData) {
    const normalizedConversationId = toText(conversationId);
    const runId = toText(payload.runId);
    const awaitingId = toText(payload.awaitingId);
    if (!normalizedConversationId || !runId || !awaitingId) {
      throw new Error('Conversation id, run id and awaiting id are required');
    }

    const currentAwaiting = this.getConversationTimelineState(normalizedConversationId).awaiting;
    const matchesCurrentAwaiting =
      currentAwaiting?.awaitingId === awaitingId || currentAwaiting?.id === awaitingId;
    const scopedAgentKey =
      matchesCurrentAwaiting && currentAwaiting?.interactive?.kind === 'question'
        ? currentAwaiting.interactive.agentKey || ''
        : '';
    const historyScope = scopedAgentKey
      ? null
      : await getConversationHistoryScope(normalizedConversationId);
    const agentKey = scopedAgentKey || historyScope?.agentKey || '';
    if (!agentKey) {
      throw new Error('agentKey is required for awaiting submit');
    }

    const response = await submitAwaitingApi({
      chatId: normalizedConversationId,
      runId,
      agentKey,
      awaitingId,
      submitId: createAwaitingSubmitId(),
      params: payload.params,
    });
    const accepted = Boolean(response.accepted ?? true);
    const status = toText(response.status);
    const detail = toText(response.detail) || (accepted ? 'accepted' : 'unmatched');

    if (!accepted) {
      await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
      if (status === 'already_resolved') {
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
        params: payload.params,
        timestamp: Date.now(),
      },
      'awaiting_submit',
      true
    );

    const continuedRunId = toText(response.runId) || runId;
    if (response.continued && continuedRunId) {
      await setConversationActiveRunId(normalizedConversationId, continuedRunId);
      await this.attachActiveConversationRun(normalizedConversationId, 'attach');
    }

    await this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', false);
    return response;
  }

  async sendMessage(
    conversationId: string,
    content: string,
    attachments: readonly ChatComposerAttachment[] = []
  ) {
    const normalizedConversationId = toText(conversationId);
    const normalizedContent = String(content || '').trim();
    if (!normalizedConversationId || (!normalizedContent && attachments.length === 0)) {
      throw new Error('Conversation id and message content or attachments are required');
    }

    const created = await createOutgoingMessage(
      normalizedConversationId,
      normalizedContent,
      attachments
    );
    const currentSummary = await getConversationDetail(normalizedConversationId);
    this.emit({
      type: 'conversation.message.insert',
      conversationId: normalizedConversationId,
      reason: 'local_send',
      message: created.message,
    });
    this.publishTimelineMessage(created.message, 'local_send');
    await this.emitHomePatchFromSummary(
      {
        conversationId: normalizedConversationId,
        title: currentSummary?.title || normalizedConversationId,
        lastMessageText: created.message.content,
        lastMessageAt: created.createdAt,
        unreadCount: 0,
        read: normalizeChatReadState({ read: { isRead: true } }),
        lastMessageStatus: 'pending',
        pinnedAt: currentSummary?.pinnedAt || 0,
      },
      {
        shouldMoveToTop: true,
      }
    );

    try {
      await this.dispatchOutgoingMessage({
        clientMessageId: created.clientMessageId,
        conversationId: normalizedConversationId,
        content: created.message.content,
        attachments: created.message.attachments,
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      const patched = await patchMessageByClientMessageId(created.clientMessageId, {
        deliveryStatus: 'failed',
        errorReason: errorText,
      });

      if (patched) {
        const patch = {
          deliveryStatus: patched.deliveryStatus,
          errorReason: patched.errorReason,
        };
        this.emit({
          type: 'conversation.message.patch',
          conversationId: normalizedConversationId,
          reason: 'local_send',
          messageId: patched.messageId,
          patch,
        });
        this.publishTimelineMessagePatch(
          normalizedConversationId,
          'local_send',
          patched.messageId,
          patch
        );
      }
      await this.emitHomePatchFromConversation(normalizedConversationId, {
        shouldMoveToTop: true,
      });
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
        state: projectTimelineRuntimeState(state),
      });
    }
  }

  private publishTimelineMessage(message: ChatMessageItem, reason: ChatSyncReason) {
    const currentState = this.getConversationTimelineState(message.conversationId);
    const nextState = applyChatTimelineMessage(currentState, message);
    if (nextState !== currentState) {
      this.publishTimelineState(message.conversationId, reason, nextState);
    }
  }

  private publishTimelineMessagePatch(
    conversationId: string,
    reason: ChatSyncReason,
    messageId: string,
    patch: Parameters<typeof patchChatTimelineMessage>[2]
  ) {
    const currentState = this.getConversationTimelineState(conversationId);
    const nextState = patchChatTimelineMessage(currentState, messageId, patch);
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
      status,
    });
  }

  private isLifecycleCurrent(lifecycleVersion: number) {
    return this.lifecycleVersion === lifecycleVersion;
  }

  private async startInternal(lifecycleVersion: number) {
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
        void this.handlePushEvent(event, 'push');
      },
      onStatusChange: (status) => {
        if (!this.isLifecycleCurrent(lifecycleVersion)) {
          return;
        }
        void this.handleTransportStatusChange(status);
      },
    });

    if (!this.isLifecycleCurrent(lifecycleVersion)) {
      if (!this.started) {
        stopChatPushTransport();
      }
      return;
    }
    await this.flushPendingOutbox();
    if (!this.isLifecycleCurrent(lifecycleVersion)) {
      return;
    }
    await this.refreshHome('bootstrap');
  }

  private async resolveTransportConfig() {
    const backendUrl = getApiBaseUrl();
    if (!backendUrl) {
      return null;
    }

    const accessToken = await getAccessTokenForRequest(backendUrl);
    if (!accessToken) {
      return null;
    }

    return {
      backendUrl,
      accessToken,
    };
  }

  private async handleTransportStatusChange(status: ChatSocketStatus) {
    const previousStatus = this.status;
    this.setStatus(status);

    if (status !== 'connected') {
      return;
    }

    await this.flushPendingOutbox();
    if (this.activeConversationId) {
      await this.attachActiveConversationRun(this.activeConversationId, 'attach');
      if (this.hasConnectedOnce || previousStatus === 'reconnecting') {
        await this.scheduleConversationReconcile(this.activeConversationId, 'reconcile', true);
      }
    }
    this.hasConnectedOnce = true;
  }

  private async dispatchOutgoingMessage(input: {
    clientMessageId: string;
    conversationId: string;
    content: string;
    attachments?: readonly ChatMessageAttachment[];
  }) {
    if (this.inFlightOutgoingIds.has(input.clientMessageId)) {
      return;
    }

    const lifecycleVersion = this.lifecycleVersion;
    const config = await this.resolveTransportConfig();
    if (!config) {
      throw new Error('Not authenticated');
    }
    if (!this.isLifecycleCurrent(lifecycleVersion)) {
      return;
    }

    this.inFlightOutgoingIds.add(input.clientMessageId);
    try {
      const historyScope = await getConversationHistoryScope(input.conversationId);
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        this.inFlightOutgoingIds.delete(input.clientMessageId);
        return;
      }

      const references = normalizeChatAttachmentReferences(
        (input.attachments || []).flatMap((attachment) => attachment.references)
      );
      if ((input.attachments || []).length > 0 && references.length === 0) {
        throw new Error('Message attachments are not ready');
      }

      const handle = await streamChatQuery({
        ...config,
        payload: {
          requestId: input.clientMessageId,
          chatId: input.conversationId,
          message: input.content,
          ...(references.length > 0 ? { references } : {}),
          agentKey: historyScope?.agentKey,
          teamId: historyScope?.teamId,
        },
        onEvent: (event) => {
          if (!this.isLifecycleCurrent(lifecycleVersion)) {
            return;
          }
          const streamEvent = event as Record<string, unknown>;
          void this.handlePushEvent(
            {
              ...streamEvent,
              chatId: input.conversationId,
              conversationId: input.conversationId,
              requestId: toText(streamEvent.requestId) || input.clientMessageId,
            },
            'stream'
          );
        },
        onDone: () => {
          if (!this.isLifecycleCurrent(lifecycleVersion)) {
            this.inFlightOutgoingIds.delete(input.clientMessageId);
            return;
          }
          void this.handleOutgoingStreamDone(input);
        },
        onError: (error) => {
          if (!this.isLifecycleCurrent(lifecycleVersion)) {
            this.inFlightOutgoingIds.delete(input.clientMessageId);
            return;
          }
          void this.handleOutgoingStreamError(input, error);
        },
      });
      if (!this.isLifecycleCurrent(lifecycleVersion)) {
        handle.abort();
        return;
      }
      this.activeOutgoingStreams.set(input.clientMessageId, {
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        abort: handle.abort,
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

  private async markOutgoingSentIfPending(input: {
    clientMessageId: string;
    conversationId: string;
  }) {
    const current = await getMessageByClientMessageId(input.clientMessageId);
    if (!current || current.deliveryStatus !== 'pending') {
      return;
    }

    const patched = await patchMessageByClientMessageId(
      input.clientMessageId,
      {
        deliveryStatus: 'sent',
        errorReason: null,
      },
      {
        removeOutbox: true,
      }
    );

    if (patched) {
      const patch = {
        deliveryStatus: patched.deliveryStatus,
        errorReason: patched.errorReason,
      };
      this.emit({
        type: 'conversation.message.patch',
        conversationId: input.conversationId,
        reason: 'local_send',
        messageId: patched.messageId,
        patch,
      });
      this.publishTimelineMessagePatch(
        input.conversationId,
        'local_send',
        patched.messageId,
        patch
      );
    }
    await this.emitHomePatchFromConversation(input.conversationId, {
      shouldMoveToTop: true,
    });
  }

  private async markOutgoingFailedIfPending(
    input: {
      clientMessageId: string;
      conversationId: string;
    },
    error: Error
  ) {
    const current = await getMessageByClientMessageId(input.clientMessageId);
    if (!current || current.deliveryStatus !== 'pending') {
      return;
    }

    const patched = await patchMessageByClientMessageId(input.clientMessageId, {
      deliveryStatus: 'failed',
      errorReason: error.message || 'Stream failed',
    });

    if (patched) {
      const patch = {
        deliveryStatus: patched.deliveryStatus,
        errorReason: patched.errorReason,
      };
      this.emit({
        type: 'conversation.message.patch',
        conversationId: input.conversationId,
        reason: 'local_send',
        messageId: patched.messageId,
        patch,
      });
      this.publishTimelineMessagePatch(
        input.conversationId,
        'local_send',
        patched.messageId,
        patch
      );
    }
    await this.emitHomePatchFromConversation(input.conversationId, {
      shouldMoveToTop: true,
    });
  }

  private async handleOutgoingStreamDone(input: {
    clientMessageId: string;
    conversationId: string;
  }) {
    try {
      await this.flushConversationStreamBuffers(input.conversationId);
      await this.markOutgoingSentIfPending(input);
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
      await this.handleStreamSideError(input.conversationId, error);
      await this.markOutgoingFailedIfPending(input, error);
    } finally {
      this.inFlightOutgoingIds.delete(input.clientMessageId);
      this.activeOutgoingStreams.delete(input.clientMessageId);
    }
  }

  private async flushPendingOutbox() {
    const pendingMessages = await getPendingOutboxMessages(50);
    for (const message of pendingMessages.reverse()) {
      if (this.inFlightOutgoingIds.has(message.clientMessageId)) {
        continue;
      }
      try {
        await this.dispatchOutgoingMessage(message);
      } catch {
        // Keep the pending item in SQLite; the next reconnect or manual retry can replay it.
      }
    }
  }

  private async handlePushEvent(
    rawEvent: Record<string, unknown>,
    source: Extract<ChatSyncReason, 'push' | 'stream'> = 'push'
  ) {
    const event: Record<string, unknown> = {
      ...rawEvent,
      type: normalizeEventType(rawEvent.type),
    };
    const type = toText(event.type);
    const conversationId = extractConversationId(event);
    const family = classifyChatProtocolEvent(event);

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
      if (type === 'run.start') {
        await setConversationActiveRunId(conversationId, toText(event.runId));
        if (this.activeConversationId === conversationId) {
          await this.attachActiveConversationRun(conversationId, 'attach');
        }
        return;
      }

      await setConversationActiveRunId(conversationId, '');
      await this.flushConversationStreamBuffers(conversationId);
      await this.scheduleConversationReconcile(conversationId, 'reconcile', true);
      if (this.activeConversationId === conversationId) {
        await this.requestConversationReadConfirmation(conversationId, {
          confirmMarker: `run:${toText(event.runId) || conversationId}`,
        });
      }
      return;
    }

    if (family === 'assistant_content' && conversationId) {
      await this.handleAssistantContentEvent(event, source);
      return;
    }

    if (family === 'summary') {
      const projected = projectRemoteChatSummary(event);
      if (projected) {
        const hasLatestMessage =
          projected.lastMessageText !== undefined && projected.lastMessageAt !== undefined;
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
                lastMessageStatus: projected.lastMessageStatus,
              }
            : {}),
          ...(projectedRead !== undefined ? { read: projectedRead } : {}),
          shouldMoveToTop: hasLatestMessage,
          agentKey: projected.agentKey,
          teamId: projected.teamId,
        });

        if (patchResult?.changed || patchResult?.directoryChanged) {
          this.emitHomePatch(
            patchResult.summary,
            {
              shouldMoveToTop: true,
            },
            patchResult.directoryChanged
          );
        }
        if (this.activeConversationId === projected.conversationId && hasLatestMessage) {
          await this.requestConversationReadConfirmation(projected.conversationId, {
            confirmMarker: `summary:${projected.lastMessageAt}`,
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
        family === 'artifact' ||
        family === 'action' ||
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
        !type.endsWith('.delta') && !type.endsWith('.args')
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
    await removeConversation(conversationId);
    this.resetConversationRuntimeState(conversationId, reason);
    this.emit({
      type: 'home.item.remove',
      conversationId,
    });
    this.emit({
      type: 'home.directory.replace',
    });
  }

  private async handleConversationUnreadStateEvent(
    event: Record<string, unknown>,
    unreadCount: number
  ) {
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
        readRunId: event.readRunId || event.runId,
      },
    });
    const result = await setConversationReadStateLocal(conversationId, serverRead, {
      agentKey: extractAgentKey(event) || null,
      teamId: extractTeamId(event) || null,
    });
    if (result?.changed) {
      this.emitHomePatch(
        result.summary,
        {
          shouldMoveToTop: false,
        },
        result.directoryChanged
      );
    }
    if (this.activeConversationId === conversationId && unreadCount > 0) {
      await this.requestConversationReadConfirmation(conversationId, {
        confirmMarker: `read-event:${toText(event.readRunId || event.runId) || conversationId}`,
      });
    }
  }

  private async handleReadAllEvent(event: Record<string, unknown>) {
    const agentKey = extractAgentKey(event);
    const teamId = extractTeamId(event);
    const conversationId = extractConversationId(event);

    if (!agentKey && !teamId) {
      if (conversationId) {
        await this.handleConversationUnreadStateEvent(event, 0);
      }
      return;
    }

    const result = await markConversationReadScopeLocal({
      agentKey: agentKey || null,
      teamId: teamId || null,
    });

    if (result.directoryChanged) {
      this.emit({
        type: 'home.directory.replace',
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

    const patched = await patchMessageByClientMessageId(
      clientMessageId,
      {
        serverMessageId: toText(event.serverMessageId) || undefined,
        createdAt: toFiniteNumber(event.createdAt, Date.now()),
        deliveryStatus: 'sent',
        errorReason: null,
      },
      {
        removeOutbox: true,
      }
    );

    if (!patched) {
      return;
    }

    const patch = {
      createdAt: patched.createdAt,
      deliveryStatus: patched.deliveryStatus,
      errorReason: patched.errorReason,
      serverMessageId: patched.serverMessageId,
    };
    this.emit({
      type: 'conversation.message.patch',
      conversationId: patched.conversationId,
      reason: 'push',
      messageId: patched.messageId,
      patch,
    });
    this.publishTimelineMessagePatch(patched.conversationId, 'push', patched.messageId, patch);
    await this.emitHomePatchFromConversation(patched.conversationId, {
      shouldMoveToTop: true,
    });
  }

  private async handleIncomingMessageEvent(event: Record<string, unknown>, reason: ChatSyncReason) {
    const conversationId = extractConversationId(event);
    const serverMessageId = toText(event.serverMessageId || event.messageId);
    const content = extractEventText(event);
    const createdAt = toFiniteNumber(event.createdAt, Date.now());
    const incomingAttachments = createMessageAttachmentsFromReferences({
      conversationId,
      messageId: serverMessageId,
      references: event.references,
      createdAt,
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
        title: extractTitle(event),
      },
      {
        suppressUnread: active,
      }
    );

    if (existing) {
      const patch = {
        content: message.content,
        createdAt: message.createdAt,
        deliveryStatus: message.deliveryStatus,
        errorReason: message.errorReason,
        serverMessageId: message.serverMessageId,
        attachments: message.attachments,
      };
      this.emit({
        type: 'conversation.message.patch',
        conversationId,
        reason,
        messageId: message.messageId,
        patch,
      });
      this.publishTimelineMessagePatch(conversationId, reason, message.messageId, patch);
    } else {
      this.emit({
        type: 'conversation.message.insert',
        conversationId,
        reason,
        message,
      });
      this.publishTimelineMessage(message, reason);
    }

    await this.emitHomePatchFromConversation(conversationId, {
      shouldMoveToTop: true,
    });

    if (active && message.role === 'assistant') {
      await this.requestConversationReadConfirmation(conversationId, {
        confirmMarker: `message:${serverMessageId}`,
      });
    }
  }

  private async handleAssistantContentEvent(
    event: Record<string, unknown>,
    reason: ChatSyncReason
  ) {
    const conversationId = extractConversationId(event);
    if (!conversationId) {
      return;
    }

    const type = normalizeEventType(event.type);
    const createdAt = toFiniteNumber(
      event.timestamp || event.ts || event.time || event.createdAt || event.updatedAt,
      Date.now()
    );
    const messageId = buildAssistantMessageId(conversationId, event);
    const text = extractEventText(event);
    const title = extractTitle(event);
    const serverMessageId = toText(event.serverMessageId) || null;
    let buffer = this.streamBuffers.get(messageId);

    if (!buffer) {
      const initialContent = type === 'content.delta' ? text : text || '';
      buffer = {
        key: messageId,
        conversationId,
        messageId,
        createdAt,
        content: initialContent,
        serverMessageId,
        title,
        reason,
        pendingUiDelta: '',
        pendingUiSnapshotText: undefined,
        pendingDbDelta: type === 'content.delta' ? text : '',
        pendingDbSnapshotText:
          type !== 'content.delta' && initialContent ? initialContent : undefined,
        publishedToTimeline: false,
        publishedStreamStatus: undefined,
        uiTimer: null,
        dbTimer: null,
      };
      this.streamBuffers.set(messageId, buffer);

      if (initialContent) {
        this.publishStreamBufferInitialMessage(
          buffer,
          type === 'content.end' ? 'done' : 'streaming'
        );
      }
    } else {
      buffer.reason = reason;
      buffer.createdAt = Math.max(buffer.createdAt, createdAt);
      if (serverMessageId) {
        buffer.serverMessageId = serverMessageId;
      }
      if (title) {
        buffer.title = title;
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
      this.publishStreamBufferInitialMessage(buffer, type === 'content.end' ? 'done' : 'streaming');
    }

    const hasPendingUiPatch =
      buffer.pendingUiSnapshotText !== undefined || Boolean(buffer.pendingUiDelta);
    if (hasPendingUiPatch && !buffer.uiTimer) {
      buffer.uiTimer = setTimeout(() => {
        void this.flushStreamBufferToUi(buffer!.key);
      }, STREAM_UI_FLUSH_MS);
    }

    if (type === 'content.end') {
      await this.flushStreamBufferToUi(buffer.key);
      await this.flushStreamBufferToDb(buffer.key);
      this.streamBuffers.delete(buffer.key);
      if (buffer.publishedToTimeline) {
        if (buffer.publishedStreamStatus !== 'done') {
          this.emit({
            type: 'conversation.message.patch',
            conversationId,
            reason,
            messageId,
            patch: {
              streamStatus: 'done',
            },
          });
          this.publishTimelineMessagePatch(conversationId, reason, messageId, {
            streamStatus: 'done',
          });
        }
        await this.emitHomePatchFromConversation(conversationId, {
          shouldMoveToTop: true,
        });
        if (this.activeConversationId === conversationId) {
          await this.requestConversationReadConfirmation(conversationId, {
            confirmMarker: `stream:${messageId}`,
          });
        }
      }
      return;
    }

    const hasPendingDbPatch =
      buffer.pendingDbSnapshotText !== undefined || Boolean(buffer.pendingDbDelta);
    if (hasPendingDbPatch && !buffer.dbTimer) {
      buffer.dbTimer = setTimeout(() => {
        void this.flushStreamBufferToDb(buffer!.key);
      }, STREAM_DB_FLUSH_MS);
    }
  }

  private publishStreamBufferInitialMessage(
    buffer: StreamBuffer,
    streamStatus: ChatMessageItem['streamStatus']
  ) {
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
      attachments: [],
    };
    buffer.publishedToTimeline = true;
    buffer.publishedStreamStatus = streamStatus;
    buffer.pendingUiDelta = '';
    buffer.pendingUiSnapshotText = undefined;
    this.emit({
      type: 'conversation.message.insert',
      conversationId: buffer.conversationId,
      reason: buffer.reason,
      message: initialMessage,
    });
    this.publishTimelineMessage(initialMessage, buffer.reason);
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
      snapshotText: buffer.pendingUiSnapshotText,
    });
    this.publishTimelineStreamDelta(buffer.conversationId, buffer.reason, {
      messageId: buffer.messageId,
      createdAt: buffer.createdAt,
      delta: buffer.pendingUiDelta,
      snapshotText: buffer.pendingUiSnapshotText,
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
        title: buffer.title,
      },
      {
        suppressUnread: this.activeConversationId === buffer.conversationId,
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
    const hadTimelineState = this.timelineStates.delete(normalizedConversationId);
    if (!hadTimelineState) {
      return;
    }

    this.emit({
      type: 'conversation.runtime.reset',
      conversationId: normalizedConversationId,
      reason,
    });
    this.emit({
      type: 'conversation.timeline.reset',
      conversationId: normalizedConversationId,
      reason,
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
      state,
    });
    this.emitConversationTimelineState(normalizedConversationId, reason, timelineState);
  }

  private emitConversationTimelineState(
    conversationId: string,
    reason: ChatSyncReason,
    state?: ChatTimelineState
  ) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId) {
      return;
    }

    this.emit({
      type: 'conversation.timeline.replace',
      conversationId: normalizedConversationId,
      reason,
      state: state ?? this.getConversationTimelineState(normalizedConversationId),
    });
  }

  private scheduleConversationRuntimeEmit(
    conversationId: string,
    reason: ChatSyncReason,
    immediate: boolean
  ) {
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

    if (
      this.activeConversationId !== normalizedConversationId &&
      !this.timelineStates.has(normalizedConversationId)
    ) {
      await markConversationDirty(normalizedConversationId, toText(event.type) || reason);
      return;
    }

    const currentState = this.getConversationTimelineState(normalizedConversationId);
    const nextState = applyChatTimelineEvent(currentState, normalizedConversationId, event);
    if (nextState === currentState) {
      return;
    }

    this.timelineStates.set(normalizedConversationId, nextState);
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
    if (!normalizedConversationId) {
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
    const readRunId = syncState?.activeRunId ? syncState.activeRunId : null;
    const confirmMarker =
      String(options?.confirmMarker || '').trim() || `run:${readRunId || 'none'}`;
    const lastMark = this.lastReadMarks.get(normalizedConversationId);
    if (
      lastMark &&
      lastMark.marker === confirmMarker &&
      now - lastMark.markedAt < READ_MARK_DEBOUNCE_MS
    ) {
      return;
    }

    this.lastReadMarks.set(normalizedConversationId, {
      markedAt: now,
      marker: confirmMarker,
    });
    const confirmation = this.confirmConversationReadWithServer(
      normalizedConversationId,
      readRunId,
      now
    ).finally(() => {
      this.readConfirmations.delete(normalizedConversationId);
    });
    this.readConfirmations.set(normalizedConversationId, confirmation);
    void confirmation;
  }

  private async confirmConversationReadWithServer(
    conversationId: string,
    readRunId: string | null,
    readAt: number
  ) {
    try {
      const response = await markChatReadApi({
        chatId: conversationId,
        ...(readRunId ? { runId: readRunId } : {}),
      });
      const result = await setConversationReadStateLocal(
        conversationId,
        hasChatReadStateInput(response)
          ? response
          : {
              read: {
                isRead: true,
                readAt: response?.readAt ?? readAt,
                readRunId: response?.readRunId ?? readRunId,
              },
            }
      );
      if (result?.changed) {
        this.emitHomePatch(
          result.summary,
          {
            shouldMoveToTop: false,
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
        type: 'home.directory.replace',
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
        directoryProjectionChanged,
      },
    });
  }

  private async emitHomePatchFromSummary(
    summary: ChatHomeItem,
    extra?: Partial<ChatHomeItemPatch>
  ) {
    const directoryChanged = await refreshChatDirectoryProjectionForConversation(
      summary.conversationId
    );
    this.emitHomePatch(summary, extra, directoryChanged);
  }

  private async emitHomePatchFromConversation(
    conversationId: string,
    extra?: Partial<ChatHomeItemPatch>
  ) {
    const summary = await getConversationDetail(conversationId);
    if (!summary) {
      return;
    }

    await this.emitHomePatchFromSummary(summary, extra);
  }

  private async scheduleConversationReconcile(
    conversationId: string,
    reason: ChatSyncReason,
    immediate: boolean
  ) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId || !getApiBaseUrl()) {
      return;
    }

    const current = this.reconcileStates.get(normalizedConversationId) || {
      inFlight: null,
      timer: null,
      trailingReason: null,
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
      current.inFlight = this.runConversationReconcile(
        normalizedConversationId,
        nextReason
      )
        .catch((error) => {
          if (!isRecoverableReconcileError(error)) {
            throw error;
          }
        })
        .finally(() => {
          current.inFlight = null;
          if (current.trailingReason) {
            void this.scheduleConversationReconcile(
              normalizedConversationId,
              current.trailingReason,
              true
            );
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

  private async runConversationReconcile(conversationId: string, reason: ChatSyncReason) {
    await markConversationDirty(conversationId, reason);

    const remoteDetailPromise = getChatDetailApi(conversationId).catch((error) => {
      if (isApiStatusError(error, 404)) {
        return null;
      }
      throw error;
    });
    const [remoteDetail, localSummary] = await Promise.all([
      remoteDetailPromise,
      getConversationDetail(conversationId),
    ]);
    if (!remoteDetail) {
      if (localSummary) {
        await this.emitHomePatchFromConversation(conversationId, {
          shouldMoveToTop: false,
        });
      }
      return;
    }
    const projection = projectRemoteChatDetail(remoteDetail, buildFallbackSummary(localSummary));
    if (!projection) {
      return;
    }

    const read = projection.hasExplicitReadState ? projection.read : undefined;
    const unreadCount = read ? (read.isRead ? 0 : 1) : undefined;
    const currentTimelineState = this.timelineStates.get(projection.conversationId);
    const nextTimelineState = mergeChatTimelineState(
      currentTimelineState,
      projection.timelineState
    );
    const nextMessages = projectTimelineMessages(nextTimelineState);

    await reconcileConversationDetail({
      conversationId: projection.conversationId,
      title: projection.title,
      ...(unreadCount !== undefined ? { unreadCount } : {}),
      ...(read ? { read } : {}),
      activeRunId: nextTimelineState.activeRunId,
      summary: {
        ...projection.summary,
        ...(unreadCount !== undefined ? { unreadCount } : {}),
        ...(read ? { read } : {}),
      },
      messages: nextMessages,
      timelineState: nextTimelineState,
    });
    this.timelineStates.set(projection.conversationId, nextTimelineState);
    this.emitConversationRuntimeState(projection.conversationId, reason);
    await markConversationSynced(conversationId, {
      activeRunId: nextTimelineState.activeRunId,
    });

    if (this.activeConversationId === conversationId) {
      if (projection.hasExplicitReadState && !projection.read.isRead) {
        await this.requestConversationReadConfirmation(conversationId, {
          confirmMarker: `reconcile:${nextTimelineState.activeRunId || projection.summary.lastMessageAt}`,
        });
      }
      await this.attachActiveConversationRun(conversationId, 'attach');
    } else {
      await this.emitHomePatchFromConversation(conversationId, {
        shouldMoveToTop: false,
      });
    }

    this.emit({
      type: 'conversation.reconcile',
      conversationId,
      reason,
    });
  }

  private stopAttachedRun(conversationId: string) {
    const current = this.activeAttaches.get(conversationId);
    if (!current) {
      return;
    }

    current.abort();
    this.activeAttaches.delete(conversationId);
  }

  private stopOutgoingStreams(conversationId: string) {
    const stoppedClientMessageIds: string[] = [];
    this.activeOutgoingStreams.forEach((stream, clientMessageId) => {
      if (stream.conversationId !== conversationId) {
        return;
      }

      stream.abort();
      this.activeOutgoingStreams.delete(clientMessageId);
      this.inFlightOutgoingIds.delete(clientMessageId);
      stoppedClientMessageIds.push(stream.clientMessageId);
    });

    return stoppedClientMessageIds;
  }

  private publishLocalRunCancel(conversationId: string, fallbackRunId: string) {
    const currentState = this.getConversationTimelineState(conversationId);
    const runId =
      currentState.activeRunId || this.activeAttaches.get(conversationId)?.runId || fallbackRunId;
    const nextState = applyChatTimelineEvent(currentState, conversationId, {
      type: 'run.cancel',
      runId,
      reason: '用户已停止生成',
      timestamp: Date.now(),
    });
    if (nextState === currentState) {
      return;
    }

    this.timelineStates.set(conversationId, nextState);
    this.scheduleTimelinePersist(conversationId);
    this.scheduleConversationRuntimeEmit(conversationId, 'stream', true);
  }

  private async finishStoppedOutgoingStreams(
    conversationId: string,
    clientMessageIds: readonly string[]
  ) {
    try {
      await this.flushConversationStreamBuffers(conversationId);
      for (const clientMessageId of clientMessageIds) {
        await this.markOutgoingSentIfPending({
          clientMessageId,
          conversationId,
        });
      }
      await markConversationDirty(conversationId, 'stop');
    } catch {
      await this.scheduleConversationReconcile(conversationId, 'reconcile', false);
    }
  }

  private async attachActiveConversationRun(conversationId: string, reason: ChatSyncReason) {
    const normalizedConversationId = toText(conversationId);
    if (!normalizedConversationId || this.activeConversationId !== normalizedConversationId) {
      return;
    }

    const syncState = await getConversationSyncState(normalizedConversationId);
    const runId = toText(syncState?.activeRunId);
    if (!runId) {
      return;
    }

    const agentKey = await this.resolveActiveRunAgentKey(normalizedConversationId, runId);
    if (!agentKey) {
      return;
    }

    const existing = this.activeAttaches.get(normalizedConversationId);
    if (existing?.runId === runId && existing.agentKey === agentKey) {
      return;
    }

    this.stopAttachedRun(normalizedConversationId);
    const config = await this.resolveTransportConfig();
    if (!config) {
      return;
    }

    const attachState: ActiveAttachState = {
      runId,
      agentKey,
      lastSeq: 0,
      abort: () => {},
    };
    const handle = await attachChatRun({
      ...config,
      payload: {
        runId,
        agentKey,
        lastSeq: attachState.lastSeq,
      },
      onEvent: (event) => {
        const attachEvent = event as Record<string, unknown>;
        if (typeof attachEvent.seq === 'number') {
          attachState.lastSeq = attachEvent.seq;
        }
        void this.handlePushEvent(
          {
            ...attachEvent,
            chatId: normalizedConversationId,
            conversationId: normalizedConversationId,
            runId,
          },
          'stream'
        );
      },
      onDone: () => {
        this.activeAttaches.delete(normalizedConversationId);
        void this.scheduleConversationReconcile(normalizedConversationId, 'reconcile', true);
      },
      onError: (error) => {
        this.activeAttaches.delete(normalizedConversationId);
        if (isMissingAgentKeyError(error)) {
          void markConversationDirty(normalizedConversationId, error.message || 'attach');
          return;
        }
        void this.handleStreamSideError(normalizedConversationId, error);
      },
    });

    attachState.abort = handle.abort;
    this.activeAttaches.set(normalizedConversationId, attachState);
    await markConversationDirty(normalizedConversationId, reason);
  }

  private async resolveActiveRunAgentKey(conversationId: string, runId: string) {
    const currentState = this.getConversationTimelineState(conversationId);
    const timelineAgentKey =
      findTimelineRunAgentKey(currentState, runId) ||
      findTimelineAwaitingAgentKey(currentState, runId);
    if (timelineAgentKey) {
      return timelineAgentKey;
    }

    const historyScope = await getConversationHistoryScope(conversationId);
    return toText(historyScope?.agentKey);
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

export const chatSyncService = new ChatSyncService();
