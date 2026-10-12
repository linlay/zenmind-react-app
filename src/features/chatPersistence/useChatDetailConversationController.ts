import { toggleRequiredSkills, type ChatSkillsCatalog } from '../../core/api/services/chatSkillsProtocol';
import { resolveAgentInteraction, classifyAgentAvailabilityError, type AgentAvailability } from './agentInteraction';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { Animated, AppState, Platform } from 'react-native';

import type { AgentDetailSnapshot } from '../../core/api/services/chatApi';
import {
  buildAgentModelConfigPayload,
  type ModelOptionsSnapshot,
  QueryAccessLevel,
  QueryModelOverride
} from '../../core/api/services/modelOptionsProtocol';
import { getNotificationMessageDetailApi } from '../../core/api/services/notificationApi';
import { useT } from '../../shared/i18n';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import type { ChatPendingSteer, ChatSocketStatus } from '../chatRealtime/types';
import {
  createChatTimelineState,
  getActiveChatTimelineFrontendTool,
  projectTimelineRuntimeState,
  type ChatTimelineMessageNode,
  type ChatTimelineState
} from '../chatTimeline/index.ts';
import { shouldApplyChatDetailAsyncResult } from './chatDetailAsyncScope';
import { deriveChatDetailHeaderRuntimeState, deriveChatComposerPrimaryAction } from './chatDetailViewModel';
import {
  createConversationForHistoryScope,
  getConversationDetail,
  getOutboxMessageOptions,
  getConversationHistoryScope,
  getConversationInitialTimelineState,
  getConversationTarget,
  getMessageByServerMessageId,
  upsertServerMessageDetail
} from './chatRepository';
import { canUsePlanMode, canUseEditingMode } from './agentMode.ts';
import {
  buildChatConversationDiagnosticReport,
  isChatConversationDiagnosticCommand,
  type ChatConversationDiagnosticState
} from './chatConversationDiagnostic';
import { createChatConversationTarget } from './chatConversationTarget';
import { normalizeChatConversationHistoryScope } from './chatHistoryScope';
import { patchDetailFromHomeEvent } from './chatRealtimeUiState';
import type {
  ChatConversationHistoryScope,
  ChatConversationTarget,
  ChatDetailRouteParams,
  ChatHomeItem
} from './types';
import { useChatComposerAttachments } from './useChatComposerAttachments';

type ChatDetailNavigation = NativeStackScreenProps<{ ChatDetail: ChatDetailRouteParams }, 'ChatDetail'>['navigation'];

type UseChatDetailConversationControllerInput = {
  navigation: ChatDetailNavigation;
  conversationId: string;
  conversationSubtitle: string;
  routeConversationTarget?: ChatConversationTarget | null;
  initialConversation: ChatHomeItem | null;
  routeHistoryScope?: ChatConversationHistoryScope;
  serverMessageId: string;
  fromNotification: boolean;
  skipInitialReconcile: boolean;
};

type ConversationRenderPayload = {
  detail: ChatHomeItem | null;
  conversationTarget: ChatConversationTarget | null;
  historyScope: ChatConversationHistoryScope | null;
  timelineState: ChatTimelineState;
  errorText: string;
};

type PendingInitialPayload = {
  loadId: number;
  payload: ConversationRenderPayload;
};

export type ChatNewConversationIntroState = {
  agentName: string;
  description: string;
  wonders: AgentDetailSnapshot['wonders'];
};

function getLatestUserMessagePending(timelineState: ChatTimelineState): boolean {
  for (let index = timelineState.orderedNodeIds.length - 1; index >= 0; index -= 1) {
    const node = timelineState.nodesById[timelineState.orderedNodeIds[index]];
    if (node?.kind === 'message' && node.role === 'user') {
      return node.deliveryStatus === 'pending';
    }
  }

  return false;
}

function isEmptyDraftConversation(summary: ChatHomeItem | null): boolean {
  return Boolean(summary && !String(summary.lastMessageText || '').trim());
}

function normalizeIntroAgentKey(value: string | null | undefined): string {
  return String(value || '').trim();
}

function getDisplayTextUnlessAgentKey(value: string | null | undefined, agentKey: string): string {
  const text = String(value || '').trim();
  return text && text !== agentKey ? text : '';
}

function getIntroAgentDisplayName(
  candidates: readonly (string | null | undefined)[],
  agentKey: string,
  fallback: string
): string {
  for (const candidate of candidates) {
    const text = getDisplayTextUnlessAgentKey(candidate, agentKey);
    if (text) {
      return text;
    }
  }

  return fallback;
}

function hasQueryModelOverride(value: QueryModelOverride): boolean {
  return Boolean(value.key || value.reasoningEffort || value.serviceTier);
}

function getQueryModelOverrideSignature(value: QueryModelOverride): string {
  const payload = buildAgentModelConfigPayload('', value);
  return `${payload.modelKey || ''}\n${payload.reasoningEffort || ''}\n${payload.serviceTier || ''}`;
}

function getDefaultQueryModelOverride(snapshot: ModelOptionsSnapshot | null): QueryModelOverride {
  if (!snapshot) {
    return {};
  }
  return {
    ...(snapshot.defaultModelKey ? { key: snapshot.defaultModelKey } : {}),
    ...(snapshot.defaultReasoningEffort ? { reasoningEffort: snapshot.defaultReasoningEffort } : {}),
    serviceTier: snapshot.defaultServiceTier
  };
}

function shouldLoadStoredConversationTarget(target: ChatConversationTarget | null): boolean {
  if (!target) {
    return true;
  }
  return (target.kind === 'agent' && !target.agentMode) || !target.modelKey;
}

function mergeConversationTargetFallback(
  target: ChatConversationTarget | null,
  fallback: ChatConversationTarget | null
): ChatConversationTarget | null {
  if (!target) {
    return fallback;
  }
  if (!fallback) {
    return target;
  }

  const agentMode = target.agentMode || fallback.agentMode || null;
  const modelKey = target.modelKey || fallback.modelKey || null;
  const reasoningEffort = target.reasoningEffort || fallback.reasoningEffort || null;
  if (agentMode === target.agentMode && modelKey === target.modelKey && reasoningEffort === target.reasoningEffort) {
    return target;
  }

  return {
    ...target,
    agentMode,
    modelKey,
    reasoningEffort
  };
}

export function useChatDetailConversationController({
  navigation,
  conversationId,
  conversationSubtitle,
  routeConversationTarget,
  initialConversation,
  routeHistoryScope,
  serverMessageId,
  fromNotification,
  skipInitialReconcile
}: UseChatDetailConversationControllerInput) {
  const t = useT();
  const isFocused = useIsFocused();
  const routeHistoryAgentKey = routeHistoryScope?.agentKey ?? null;
  const routeHistoryTeamId = routeHistoryScope?.teamId ?? null;
  const normalizedRouteHistoryScope = useMemo(
    () =>
      normalizeChatConversationHistoryScope({
        agentKey: routeHistoryAgentKey,
        teamId: routeHistoryTeamId
      }),
    [routeHistoryAgentKey, routeHistoryTeamId]
  );
  const normalizedRouteConversationTarget = useMemo(
    () => createChatConversationTarget(routeConversationTarget),
    [routeConversationTarget]
  );
  const [detail, setDetail] = useState<ChatHomeItem | null>(null);
  const [conversationTarget, setConversationTarget] = useState<ChatConversationTarget | null>(
    normalizedRouteConversationTarget
  );
  const [historyScope, setHistoryScope] = useState<ChatConversationHistoryScope | null>(normalizedRouteHistoryScope);
  const [timelineState, setTimelineState] = useState<ChatTimelineState>(() => createChatTimelineState(conversationId));
  const [isConversationUnavailable, setIsConversationUnavailable] = useState(false);
  const [isInitialContentReady, setIsInitialContentReady] = useState(false);
  const [isInitialSkeletonVisible, setIsInitialSkeletonVisible] = useState(true);
  const [isTransitionSettled, setIsTransitionSettled] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [planModeEnabled, setPlanModeEnabled] = useState(false);
  const [editingModeEnabled, setEditingModeEnabled] = useState(false);
  const [skillSelection, setSkillSelection] = useState<{
    conversationId: string;
    agentKey: string;
    ids: string[];
  } | null>(null);
  const [skillsState, setSkillsState] = useState<{
    agentKey: string;
    catalog: ChatSkillsCatalog | null;
    loading: boolean;
    error: string;
  } | null>(null);
  const skillsRequestIdRef = useRef(0);
  const [accessLevel, setAccessLevel] = useState<QueryAccessLevel>('default');
  const [agentAvailability, setAgentAvailability] = useState<AgentAvailability>('checking');
  const [modelOverride, setModelOverride] = useState<QueryModelOverride>({});
  const [modelOptionsSnapshot, setModelOptionsSnapshot] = useState<ModelOptionsSnapshot | null>(null);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [socketStatus, setSocketStatus] = useState<ChatSocketStatus>(chatSyncService.getStatus());
  const [errorText, setErrorText] = useState('');
  const [pendingSteer, setPendingSteer] = useState<ChatPendingSteer | null>(null);
  const [diagnosticState, setDiagnosticState] = useState<ChatConversationDiagnosticState>({
    status: 'idle',
    requestId: 0
  });
  const [agentDetailSnapshot, setAgentDetailSnapshot] = useState<AgentDetailSnapshot | null>(null);
  const [reloadSeed, setReloadSeed] = useState(0);
  const [expiredModelRetryAt, setExpiredModelRetryAt] = useState(0);
  const modelRetryAt = timelineState.modelRetry?.retryAt ?? 0;
  useEffect(() => {
    if (!modelRetryAt || !isFocused) return;
    const timer = setTimeout(
      () => setExpiredModelRetryAt(modelRetryAt),
      Math.min(2_147_000_000, Math.max(0, modelRetryAt - Date.now()))
    );
    return () => clearTimeout(timer);
  }, [isFocused, modelRetryAt]);
  const hydratedNotificationMessageIdRef = useRef('');
  const pendingInitialPayloadRef = useRef<PendingInitialPayload | null>(null);
  const hasCompletedFirstLoadRef = useRef(false);
  const initialContentCommittedRef = useRef(false);
  const hasReceivedTimelineEventRef = useRef(false);
  const hasObservedPendingSendRef = useRef(false);
  const latestLoadIdRef = useRef(0);
  const transitionSettledRef = useRef(false);
  const activeConversationIdRef = useRef(conversationId);
  const sendRequestIdRef = useRef(0);
  const diagnosticRequestIdRef = useRef(0);
  const diagnosticConversationIdRef = useRef(conversationId);
  const modelConfigUpdateIdRef = useRef(0);
  const sendingRef = useRef(false);
  const reaskInFlightRef = useRef(false);
  const isStartingNewConversationRef = useRef(false);
  const skeletonOverlayOpacity = useRef(new Animated.Value(1)).current;
  const skeletonFadeFrameRef = useRef<number | null>(null);
  const skeletonFadeCommitFrameRef = useRef<number | null>(null);
  const skeletonFadeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const summary = isConversationUnavailable ? null : (detail ?? initialConversation);
  const isNewConversationEmpty = Boolean(
    skipInitialReconcile && summary && isEmptyDraftConversation(summary) && timelineState.orderedNodeIds.length === 0
  );
  const introAgentKey = useMemo(
    () =>
      isNewConversationEmpty ? normalizeIntroAgentKey(conversationTarget?.agentKey || historyScope?.agentKey) : '',
    [conversationTarget?.agentKey, historyScope?.agentKey, isNewConversationEmpty]
  );
  const composerAgentKey = useMemo(
    () =>
      conversationTarget?.teamId || historyScope?.teamId
        ? ''
        : normalizeIntroAgentKey(conversationTarget?.agentKey || historyScope?.agentKey),
    [conversationTarget?.agentKey, conversationTarget?.teamId, historyScope?.agentKey, historyScope?.teamId]
  );
  const interaction = useMemo(
    () =>
      resolveAgentInteraction(
        composerAgentKey
          ? agentDetailSnapshot?.agentKey === composerAgentKey
            ? String(agentDetailSnapshot.raw.mode || conversationTarget?.agentMode || '')
            : conversationTarget?.agentMode || ''
          : 'TEAM',
        agentDetailSnapshot?.agentKey === composerAgentKey ? agentDetailSnapshot.raw.interactionConfig : null
      ),
    [agentDetailSnapshot, composerAgentKey, conversationTarget?.agentMode]
  );
  const selectedSkills = useMemo(
    () =>
      interaction.mustUseSkills &&
      skillSelection?.agentKey === composerAgentKey &&
      skillSelection.conversationId === conversationId
        ? skillSelection.ids
        : [],
    [composerAgentKey, conversationId, interaction.mustUseSkills, skillSelection]
  );
  const scopedSkills = skillsState?.agentKey === composerAgentKey ? skillsState : null;
  const handleLoadSkills = useCallback(async () => {
    if (!composerAgentKey || !interaction.mustUseSkills) return;
    const requestId = ++skillsRequestIdRef.current;
    setSkillsState((current) => ({
      agentKey: composerAgentKey,
      catalog: current?.agentKey === composerAgentKey ? current.catalog : null,
      loading: true,
      error: ''
    }));
    try {
      const catalog = await chatSyncService.ensureAgentSkills(composerAgentKey);
      if (requestId !== skillsRequestIdRef.current) return;
      setSkillsState({
        agentKey: composerAgentKey,
        catalog,
        loading: false,
        error: catalog ? '' : t('composer.skills.unavailable')
      });
    } catch (error) {
      if (requestId !== skillsRequestIdRef.current) return;
      setSkillsState((current) => ({
        agentKey: composerAgentKey,
        catalog: current?.agentKey === composerAgentKey ? current.catalog : null,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [composerAgentKey, interaction.mustUseSkills, t]);
  const handleToggleSkills = useCallback(
    (ids: readonly string[]) => {
      if (
        !composerAgentKey ||
        !interaction.mustUseSkills ||
        pendingSteer ||
        sendingRef.current ||
        composerRunActionRef.current
      )
        return;
      setSkillSelection((current) => ({
        agentKey: composerAgentKey,
        conversationId,
        ids: toggleRequiredSkills(
          current?.agentKey === composerAgentKey && current.conversationId === conversationId ? current.ids : [],
          ids
        )
      }));
    },
    [composerAgentKey, conversationId, interaction.mustUseSkills, pendingSteer]
  );

  const runtimeRunIdRef = useRef(timelineState.activeRunId);
  runtimeRunIdRef.current = timelineState.activeRunId;
  const runtimeNodesRef = useRef(timelineState.nodesById);
  runtimeNodesRef.current = timelineState.nodesById;
  const runNodeOrder = timelineState.orderedNodeIds;
  const activePermissionRunId = timelineState.activeRunId;
  const runtimeRunNodeId = useMemo(() => {
    for (let index = runNodeOrder.length - 1; index >= 0; index--) {
      const node = runtimeNodesRef.current[runNodeOrder[index]];
      if (node?.kind === 'run' && node.runId === activePermissionRunId) return node.id;
    }
    return undefined;
  }, [activePermissionRunId, runNodeOrder]);
  const runtimeRunNode = runtimeRunNodeId ? timelineState.nodesById[runtimeRunNodeId] : null;
  const runtimeAccess = useMemo(
    () =>
      runtimeRunNode?.kind === 'run' && runtimeRunNode.lifecycle === 'active'
        ? { runId: runtimeRunNode.runId, level: runtimeRunNode.accessLevel, phase: runtimeRunNode.accessUpdate?.phase }
        : null,
    [runtimeRunNode]
  );
  const handleRuntimeAccessChange = useCallback(
    async (level: QueryAccessLevel) => {
      const targetId = conversationId,
        runId = timelineState.activeRunId;
      try {
        const result = await chatSyncService.updateRuntimeAccessLevel(targetId, runId, level);
        if (activeConversationIdRef.current !== targetId || runtimeRunIdRef.current !== runId) return;
        if (result.status === 'rejected')
          setErrorText(`${t('composer.runtimeAccess.rejected')}${result.detail ? ` · ${result.detail}` : ''}`);
      } catch (error) {
        if (activeConversationIdRef.current === targetId && runtimeRunIdRef.current === runId)
          setErrorText(error instanceof Error ? error.message : String(error));
      }
    },
    [conversationId, timelineState.activeRunId, t]
  );
  const handleRuntimeAccessRefresh = useCallback(() => {
    void chatSyncService.reconcileConversation(conversationId, 'manual_refresh').catch(() => {});
  }, [conversationId]);

  const composerOptions = useMemo(
    () => ({
      accessLevel,
      interaction,
      agentKey: composerAgentKey,
      modelOverride,
      modelOptionsLoading,
      modelOptionsSnapshot,
      runtimeAccess,
      onRuntimeAccessChange: handleRuntimeAccessChange,
      onRuntimeAccessRefresh: handleRuntimeAccessRefresh,
      skillsCatalog: scopedSkills?.catalog ?? null,
      selectedSkills,
      skillsLoading: scopedSkills?.loading ?? false,
      skillsError: scopedSkills?.error ?? '',
      onLoadSkills: handleLoadSkills,
      onToggleSkills: handleToggleSkills
    }),
    [
      accessLevel,
      composerAgentKey,
      interaction,
      modelOptionsLoading,
      modelOptionsSnapshot,
      modelOverride,
      scopedSkills,
      runtimeAccess,
      handleRuntimeAccessChange,
      handleRuntimeAccessRefresh,
      selectedSkills,
      handleLoadSkills,
      handleToggleSkills
    ]
  );
  const scopedAgentDetail =
    introAgentKey && agentDetailSnapshot?.agentKey === introAgentKey ? agentDetailSnapshot : null;
  const newConversationIntro = useMemo<ChatNewConversationIntroState | null>(() => {
    if (!isNewConversationEmpty) {
      return null;
    }

    const agentName = getIntroAgentDisplayName(
      [scopedAgentDetail?.name, conversationTarget?.title, summary?.title, conversationSubtitle],
      introAgentKey,
      t('chatDetail.newConversation.agentFallback')
    );

    return {
      agentName,
      description: getDisplayTextUnlessAgentKey(scopedAgentDetail?.description, introAgentKey),
      wonders: scopedAgentDetail?.wonders || []
    };
  }, [
    conversationSubtitle,
    conversationTarget?.title,
    introAgentKey,
    isNewConversationEmpty,
    scopedAgentDetail,
    summary?.title,
    t
  ]);
  const composerAgentMode = composerAgentKey
    ? agentDetailSnapshot?.agentKey === composerAgentKey
      ? String(agentDetailSnapshot.raw.mode || conversationTarget?.agentMode || '')
      : conversationTarget?.agentMode
    : 'TEAM';
  const planModeAvailable = canUsePlanMode(composerAgentMode);
  const editingModeAvailable = canUseEditingMode(composerAgentMode);
  const effectiveEditingModeEnabled = editingModeAvailable && editingModeEnabled;
  const effectivePlanModeEnabled = planModeAvailable && planModeEnabled;
  const runtimeState = useMemo(() => projectTimelineRuntimeState(timelineState), [timelineState]);
  const activeFrontendTool = useMemo(() => getActiveChatTimelineFrontendTool(timelineState), [timelineState]);
  const headerRuntimeState = useMemo(() => deriveChatDetailHeaderRuntimeState(timelineState), [timelineState]);
  const composerRunAction = headerRuntimeState.runAction;
  const composerRunActionRef = useRef(composerRunAction);
  const conversationTargetRouteParams = useMemo(
    () => ({
      conversationSubtitle: conversationTarget?.subtitle || conversationSubtitle,
      ...(conversationTarget ? { conversationTarget } : {})
    }),
    [conversationSubtitle, conversationTarget]
  );
  const selectionMessageNodeIds = useMemo(() => {
    if (!activePermissionRunId) return [];
    const ids: string[] = [];
    for (let index = runNodeOrder.length - 1; index >= 0; index--) {
      const node = runtimeNodesRef.current[runNodeOrder[index]];
      if (node?.kind === 'run' && node.runId !== activePermissionRunId) break;
      if (node?.kind === 'message' && node.runId === activePermissionRunId) ids.push(node.id);
    }
    return ids;
  }, [activePermissionRunId, runNodeOrder]);
  let selectionStartIndex = 1;
  for (const id of selectionMessageNodeIds) {
    const node = timelineState.nodesById[id];
    if (node?.kind !== 'message') continue;
    for (const attachment of node.attachments)
      for (const reference of attachment.references)
        if (reference.type === 'selection')
          selectionStartIndex = Math.max(selectionStartIndex, (reference.annotationIndex || 0) + 1);
  }
  const {
    attachments: composerAttachments,
    readyAttachments,
    hasUploadingAttachments,
    hasFailedAttachments,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    clearAttachments,
    restoreAttachments,
    addSelection,
    addContextReference,
    updateSelectionAnnotation
  } = useChatComposerAttachments({
    conversationId,
    selectionScope: timelineState.activeRunId || 'next',
    selectionStartIndex,
    disabled: sending || composerRunAction === 'resume' || Boolean(pendingSteer),
    onError: setErrorText
  });
  useEffect(() => {
    setPendingSteer(chatSyncService.getPendingSteer(conversationId));
    return chatSyncService.subscribe((event) => {
      if (event.type !== 'conversation.steer.changed' || event.conversationId !== conversationId) return;
      setPendingSteer(event.pending);
      if (event.confirmed) {
        setDraft((current) => (current === event.confirmed?.message ? '' : current));
        event.confirmed.attachments.forEach((attachment) => handleRemoveAttachment(attachment.attachmentId));
      }
    });
  }, [handleRemoveAttachment, conversationId]);

  const steerAvailable = Boolean(
    timelineState.activeRunId &&
    !timelineState.awaiting &&
    agentAvailability === 'available' &&
    !pendingSteer &&
    !sending &&
    !composerAttachments.some((item) => item.kind === 'chat' || item.kind === 'site')
  );
  const handleSteer = useCallback(async () => {
    if (!steerAvailable || hasUploadingAttachments || hasFailedAttachments) return;
    const targetConversationId = conversationId;
    const requestId = ++sendRequestIdRef.current;
    setErrorText('');
    try {
      const response = await chatSyncService.steerConversation(targetConversationId, draft, readyAttachments);
      if (
        !shouldApplyChatDetailAsyncResult({
          activeConversationId: activeConversationIdRef.current,
          targetConversationId,
          currentRequestId: sendRequestIdRef.current,
          requestId
        })
      )
        return;
      if (response.accepted === false) setErrorText(response.detail || t('chatDetail.steer.rejected'));
      else if (response.accepted === null) setErrorText(t('chatDetail.steer.unknown'));
    } catch (error) {
      if (
        shouldApplyChatDetailAsyncResult({
          activeConversationId: activeConversationIdRef.current,
          targetConversationId,
          currentRequestId: sendRequestIdRef.current,
          requestId
        })
      )
        setErrorText(error instanceof Error ? error.message : String(error));
    }
  }, [conversationId, draft, hasFailedAttachments, hasUploadingAttachments, readyAttachments, steerAvailable, t]);
  const handleRestoreSteer = useCallback(() => {
    const pending = chatSyncService.restorePendingSteer(conversationId);
    if (!pending) return;
    sendRequestIdRef.current += 1;
    setDraft((current) =>
      !current || current === pending.message ? pending.message : `${current}\n\n${pending.message}`
    );
    restoreAttachments(pending.attachments);
    setErrorText(t('chatDetail.steer.verifyBeforeResend'));
  }, [conversationId, restoreAttachments, t]);

  const latestUserMessagePending = useMemo(() => getLatestUserMessagePending(timelineState), [timelineState]);
  const composerAction = useMemo(
    () =>
      deriveChatComposerPrimaryAction({
        draft,
        sending,
        runAction: composerRunAction,
        hasReadyAttachments: readyAttachments.some((item) => item.kind !== 'chat' && item.kind !== 'site'),
        attachmentsBlocked:
          hasUploadingAttachments || hasFailedAttachments || agentAvailability !== 'available' || Boolean(pendingSteer)
      }),
    [
      agentAvailability,
      pendingSteer,
      composerRunAction,
      draft,
      hasFailedAttachments,
      hasUploadingAttachments,
      readyAttachments,
      sending
    ]
  );

  const clearSkeletonFadeSchedule = useCallback(() => {
    if (skeletonFadeFrameRef.current !== null) {
      cancelAnimationFrame(skeletonFadeFrameRef.current);
      skeletonFadeFrameRef.current = null;
    }
    if (skeletonFadeCommitFrameRef.current !== null) {
      cancelAnimationFrame(skeletonFadeCommitFrameRef.current);
      skeletonFadeCommitFrameRef.current = null;
    }
    skeletonFadeAnimationRef.current?.stop();
    skeletonFadeAnimationRef.current = null;
  }, []);

  const applyConversationPayload = useCallback(
    (payload: ConversationRenderPayload, markInitialContentReady: boolean) => {
      startTransition(() => {
        setDetail(payload.detail);
        setConversationTarget(payload.conversationTarget);
        setHistoryScope(payload.historyScope);
        if (!hasReceivedTimelineEventRef.current) {
          setTimelineState(payload.timelineState);
        }
        setErrorText(payload.errorText);
        setIsConversationUnavailable(!payload.detail);
        if (markInitialContentReady) {
          setIsInitialContentReady(true);
        }
      });
    },
    []
  );

  useEffect(() => clearSkeletonFadeSchedule, [clearSkeletonFadeSchedule]);

  useEffect(() => {
    activeConversationIdRef.current = conversationId;
    sendRequestIdRef.current += 1;
    diagnosticRequestIdRef.current += 1;
    diagnosticConversationIdRef.current = conversationId;
    modelConfigUpdateIdRef.current += 1;
    isStartingNewConversationRef.current = false;
    hasObservedPendingSendRef.current = false;
    sendingRef.current = false;
    reaskInFlightRef.current = false;
    setDraft('');
    setSkillSelection(null);
    setSkillsState(null);
    skillsRequestIdRef.current += 1;
    setEditingModeEnabled(false);
    setPlanModeEnabled(false);
    setSending(false);
    setAccessLevel('default');
    setModelOverride({});
    setDiagnosticState({ status: 'idle', requestId: diagnosticRequestIdRef.current });
  }, [conversationId]);

  useEffect(
    () => () => {
      diagnosticRequestIdRef.current += 1;
      skillsRequestIdRef.current += 1;
    },
    []
  );

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    composerRunActionRef.current = composerRunAction;
  }, [composerRunAction]);

  useEffect(() => {
    modelConfigUpdateIdRef.current += 1;
  }, [composerAgentKey]);

  useEffect(() => {
    setEditingModeEnabled(false);
    setPlanModeEnabled(false);
    setSkillSelection(null);
    setSkillsState(null);
    skillsRequestIdRef.current += 1;
  }, [composerAgentKey]);

  useEffect(() => {
    if (!editingModeAvailable) setEditingModeEnabled(false);
  }, [editingModeAvailable]);

  useEffect(() => {
    if (conversationTarget && !planModeAvailable && planModeEnabled) {
      setPlanModeEnabled(false);
    }
  }, [conversationTarget, planModeAvailable, planModeEnabled]);

  useEffect(() => {
    if (!isFocused) return;
    if (!composerAgentKey) {
      setAgentDetailSnapshot(null);
      setAgentAvailability('available');
      return;
    }
    let cancelled = false;
    setAgentAvailability('checking');
    setAgentDetailSnapshot(chatSyncService.getAgentDetailSnapshot(composerAgentKey));
    void chatSyncService
      .ensureAgentDetail(composerAgentKey, { refresh: true, throwOnError: true })
      .then((detail) => {
        if (cancelled) return;
        setAgentDetailSnapshot(detail);
        setAgentAvailability(detail ? 'available' : 'unavailable');
      })
      .catch((error) => {
        if (!cancelled) setAgentAvailability(classifyAgentAvailabilityError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [composerAgentKey, conversationId, isFocused, reloadSeed]);

  useEffect(() => {
    if (!interaction.mustUseSkills) setSkillSelection(null);
    if (!interaction.model) setModelOverride({});
    if (!interaction.accessLevel) setAccessLevel('default');
    if (!interaction.attachment.localFiles) clearAttachments();
  }, [clearAttachments, interaction]);

  useEffect(() => {
    if (!composerAgentKey) {
      setModelOptionsSnapshot(null);
      setModelOptionsLoading(false);
      setModelOverride({});
      return;
    }

    const cached = chatSyncService.getAgentModelOptionsSnapshot(composerAgentKey);
    setModelOptionsSnapshot(cached);
    setModelOptionsLoading(!cached);

    setModelOverride(getDefaultQueryModelOverride(cached));

    let cancelled = false;
    const targetConversationId = conversationId;
    void chatSyncService.ensureAgentModelOptions(composerAgentKey).then((snapshot) => {
      if (cancelled || activeConversationIdRef.current !== targetConversationId) {
        return;
      }
      setModelOptionsSnapshot(snapshot);
      setModelOptionsLoading(false);
      setModelOverride((current) =>
        hasQueryModelOverride(current) ? current : getDefaultQueryModelOverride(snapshot)
      );
    });

    return () => {
      cancelled = true;
    };
  }, [composerAgentKey, conversationId]);

  useEffect(() => {
    if (!sending) {
      hasObservedPendingSendRef.current = false;
      return;
    }

    if (latestUserMessagePending) {
      hasObservedPendingSendRef.current = true;
      return;
    }

    if (composerRunAction || hasObservedPendingSendRef.current) {
      hasObservedPendingSendRef.current = false;
      sendingRef.current = false;
      setSending(false);
    }
  }, [composerRunAction, latestUserMessagePending, sending]);

  const handleModelOverrideChange = useCallback(
    (nextOverride: QueryModelOverride) => {
      if (getQueryModelOverrideSignature(modelOverride) === getQueryModelOverrideSignature(nextOverride)) {
        return;
      }

      const targetAgentKey = composerAgentKey;
      const nextModelKey = String(nextOverride.key || '').trim();
      if (!targetAgentKey || !nextModelKey) {
        return;
      }

      const targetConversationId = conversationId;
      const updateId = modelConfigUpdateIdRef.current + 1;
      modelConfigUpdateIdRef.current = updateId;
      void chatSyncService
        .updateAgentModelConfig(targetAgentKey, nextOverride)
        .then((snapshot) => {
          if (activeConversationIdRef.current !== targetConversationId || modelConfigUpdateIdRef.current !== updateId) {
            return;
          }
          if (snapshot) {
            setModelOptionsSnapshot(snapshot);
          }
          setModelOverride(snapshot ? getDefaultQueryModelOverride(snapshot) : nextOverride);
        })
        .catch((error) => {
          if (activeConversationIdRef.current !== targetConversationId || modelConfigUpdateIdRef.current !== updateId) {
            return;
          }
          setErrorText(error instanceof Error ? error.message : String(error));
        });
    },
    [composerAgentKey, conversationId, modelOverride]
  );

  useEffect(() => {
    const updateVisibility = () =>
      chatSyncService.setConversationVisible(
        conversationId,
        isFocused && isInitialContentReady && !isInitialSkeletonVisible && AppState.currentState === 'active'
      );
    updateVisibility();
    const subscription = AppState.addEventListener('change', updateVisibility);
    return () => {
      subscription.remove();
      chatSyncService.setConversationVisible(conversationId, false);
    };
  }, [conversationId, isFocused, isInitialContentReady, isInitialSkeletonVisible]);

  useEffect(() => {
    transitionSettledRef.current = isTransitionSettled;
  }, [isTransitionSettled]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (event.data.closing) {
        return;
      }

      setIsTransitionSettled(true);
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!isTransitionSettled || !pendingInitialPayloadRef.current) {
      return;
    }

    const pendingPayload = pendingInitialPayloadRef.current;
    if (pendingPayload.loadId !== latestLoadIdRef.current || initialContentCommittedRef.current) {
      pendingInitialPayloadRef.current = null;
      return;
    }

    pendingInitialPayloadRef.current = null;
    initialContentCommittedRef.current = true;
    applyConversationPayload(pendingPayload.payload, true);
  }, [applyConversationPayload, isTransitionSettled]);

  useEffect(() => {
    if (!isInitialContentReady || !isInitialSkeletonVisible) {
      return;
    }

    clearSkeletonFadeSchedule();
    skeletonFadeFrameRef.current = requestAnimationFrame(() => {
      skeletonFadeFrameRef.current = null;
      skeletonFadeCommitFrameRef.current = requestAnimationFrame(() => {
        skeletonFadeCommitFrameRef.current = null;
        skeletonFadeAnimationRef.current = Animated.timing(skeletonOverlayOpacity, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true
        });
        skeletonFadeAnimationRef.current.start(({ finished }) => {
          skeletonFadeAnimationRef.current = null;
          if (finished) {
            setIsInitialSkeletonVisible(false);
          }
        });
      });
    });

    return clearSkeletonFadeSchedule;
  }, [clearSkeletonFadeSchedule, isInitialContentReady, isInitialSkeletonVisible, skeletonOverlayOpacity]);

  useEffect(() => {
    let mounted = true;
    const shouldDelayInitialReveal = Platform.OS !== 'web' && !hasCompletedFirstLoadRef.current;
    hasCompletedFirstLoadRef.current = true;

    hydratedNotificationMessageIdRef.current = '';
    initialContentCommittedRef.current = false;
    hasReceivedTimelineEventRef.current = false;
    pendingInitialPayloadRef.current = null;
    clearSkeletonFadeSchedule();
    setIsInitialSkeletonVisible(true);
    skeletonOverlayOpacity.setValue(1);
    setDetail(null);
    setConversationTarget(normalizedRouteConversationTarget);
    setHistoryScope(normalizedRouteHistoryScope);
    setTimelineState(createChatTimelineState(conversationId));
    setIsConversationUnavailable(false);
    setIsInitialContentReady(false);
    setErrorText('');
    setIsTransitionSettled(!shouldDelayInitialReveal);

    const hydrateNotificationMessage = async () => {
      const normalizedServerMessageId = String(serverMessageId || '').trim();
      if (!fromNotification || !normalizedServerMessageId) {
        return null;
      }
      if (hydratedNotificationMessageIdRef.current === normalizedServerMessageId) {
        return null;
      }

      const localMessage = await getMessageByServerMessageId(normalizedServerMessageId);
      if (localMessage) {
        if (localMessage.conversationId !== conversationId) {
          throw new Error('Notification message does not match the opened conversation');
        }
        hydratedNotificationMessageIdRef.current = normalizedServerMessageId;
        return null;
      }

      const remoteDetail = await getNotificationMessageDetailApi(normalizedServerMessageId);
      const remoteConversationId = remoteDetail.message.conversationId || remoteDetail.conversation.conversationId;
      if (
        remoteConversationId !== conversationId ||
        remoteDetail.message.serverMessageId !== normalizedServerMessageId
      ) {
        throw new Error('Notification message does not match the opened conversation');
      }

      await upsertServerMessageDetail(remoteDetail);
      hydratedNotificationMessageIdRef.current = normalizedServerMessageId;
      return null;
    };

    const publishConversationPayload = (payload: ConversationRenderPayload, loadId: number) => {
      if (!mounted || loadId !== latestLoadIdRef.current) {
        return;
      }

      const shouldMarkInitialContentReady = !initialContentCommittedRef.current;
      if (shouldMarkInitialContentReady && shouldDelayInitialReveal && !transitionSettledRef.current) {
        pendingInitialPayloadRef.current = {
          loadId,
          payload
        };
        return;
      }

      if (shouldMarkInitialContentReady) {
        initialContentCommittedRef.current = true;
      }
      pendingInitialPayloadRef.current = null;
      applyConversationPayload(payload, shouldMarkInitialContentReady);
    };

    const loadConversation = async () => {
      const loadId = latestLoadIdRef.current + 1;
      latestLoadIdRef.current = loadId;

      try {
        let hydrationError: unknown = null;
        try {
          await hydrateNotificationMessage();
        } catch (error) {
          hydrationError = error;
        }

        const shouldLoadTargetFromStore = shouldLoadStoredConversationTarget(normalizedRouteConversationTarget);
        const [nextDetail, nextTimelineState, nextHistoryScope, storedConversationTarget] = await Promise.all([
          getConversationDetail(conversationId),
          getConversationInitialTimelineState(conversationId, 60),
          normalizedRouteHistoryScope
            ? Promise.resolve(normalizedRouteHistoryScope)
            : getConversationHistoryScope(conversationId),
          shouldLoadTargetFromStore ? getConversationTarget(conversationId) : Promise.resolve(null)
        ]);
        const nextConversationTarget = mergeConversationTargetFallback(
          normalizedRouteConversationTarget,
          storedConversationTarget
        );

        if (!mounted) {
          return;
        }

        publishConversationPayload(
          {
            detail: nextDetail,
            conversationTarget: nextConversationTarget,
            historyScope: nextHistoryScope,
            timelineState: nextTimelineState,
            errorText: hydrationError
              ? hydrationError instanceof Error
                ? hydrationError.message
                : String(hydrationError)
              : ''
          },
          loadId
        );
      } catch (error) {
        if (!mounted || loadId !== latestLoadIdRef.current) {
          return;
        }

        const nextErrorText = error instanceof Error ? error.message : String(error);
        if (initialContentCommittedRef.current) {
          setErrorText(nextErrorText);
          return;
        }

        publishConversationPayload(
          {
            detail: null,
            conversationTarget: normalizedRouteConversationTarget,
            historyScope: normalizedRouteHistoryScope,
            timelineState: createChatTimelineState(conversationId),
            errorText: nextErrorText
          },
          loadId
        );
      }
    };

    const refreshConversationDetail = async () => {
      try {
        const nextDetail = await getConversationDetail(conversationId);
        if (!mounted || activeConversationIdRef.current !== conversationId) {
          return;
        }
        setDetail(nextDetail);
        setIsConversationUnavailable(!nextDetail);
      } catch (error) {
        if (!mounted || activeConversationIdRef.current !== conversationId) {
          return;
        }
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    };

    setSocketStatus(chatSyncService.getStatus());
    void loadConversation();
    if (!skipInitialReconcile) {
      void chatSyncService
        .reconcileConversation(conversationId, fromNotification ? 'notification' : 'detail_open')
        .catch((error) => {
          if (!mounted || activeConversationIdRef.current !== conversationId) {
            return;
          }
          setErrorText(error instanceof Error ? error.message : String(error));
        });
    }

    const unsubscribe = chatSyncService.subscribe((event) => {
      if (!mounted) {
        return;
      }

      if (event.type === 'connection.status') {
        setSocketStatus(event.status);
        return;
      }

      if (event.type === 'home.item.patch') {
        if (event.patch.conversationId === conversationId) {
          setDetail((current) => patchDetailFromHomeEvent(current, event.patch));
        }
        return;
      }

      if (event.type === 'home.directory.replace') {
        return;
      }

      if (event.type === 'home.item.remove') {
        if (event.conversationId === conversationId) {
          setDetail(null);
          setTimelineState(createChatTimelineState(conversationId));
          setIsConversationUnavailable(true);
          setErrorText(t('chatDetail.error.conversationGone'));
        }
        return;
      }

      if (event.conversationId !== conversationId) {
        return;
      }

      if (
        event.type === 'conversation.message.insert' ||
        event.type === 'conversation.message.patch' ||
        event.type === 'conversation.stream.delta' ||
        event.type === 'conversation.runtime.replace' ||
        event.type === 'conversation.runtime.reset'
      ) {
        return;
      }

      if (event.type === 'conversation.recovery.error') {
        setErrorText(t('chatDetail.recovery.failed'));
        return;
      }
      if (event.type === 'conversation.timeline.replace') {
        hasReceivedTimelineEventRef.current = true;
        if (getLatestUserMessagePending(event.state)) {
          hasObservedPendingSendRef.current = true;
        }
        setTimelineState(event.state);
        return;
      }

      if (event.type === 'conversation.timeline.reset') {
        hasReceivedTimelineEventRef.current = true;
        setTimelineState(createChatTimelineState(conversationId));
        return;
      }

      if (event.type === 'conversation.reconcile') {
        void refreshConversationDetail();
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [
    applyConversationPayload,
    clearSkeletonFadeSchedule,
    conversationId,
    fromNotification,
    normalizedRouteConversationTarget,
    normalizedRouteHistoryScope,
    reloadSeed,
    skeletonOverlayOpacity,
    serverMessageId,
    skipInitialReconcile,
    t
  ]);

  const handleSend = useCallback(async () => {
    if (agentAvailability !== 'available' || pendingSteer) return;
    const nextDraft = draft.trim();
    const nextAttachments = readyAttachments;
    if ((!nextDraft && nextAttachments.length === 0) || sendingRef.current || reaskInFlightRef.current) {
      return;
    }

    if (isChatConversationDiagnosticCommand(nextDraft, composerAttachments.length, __DEV__)) {
      const requestId = diagnosticRequestIdRef.current + 1;
      const targetConversationId = conversationId;
      const pageProjection = {
        conversationId,
        timeline: timelineState,
        runtime: runtimeState,
        header: headerRuntimeState,
        modelConfiguration: {
          selectedOverride: modelOverride,
          options: modelOptionsSnapshot,
          loading: modelOptionsLoading
        },
        accessLevel,
        planMode: {
          available: planModeAvailable,
          enabled: effectivePlanModeEnabled
        },
        composer: {
          action: composerAction,
          attachments: composerAttachments
        },
        socketStatus,
        pageError: errorText || null
      };
      diagnosticRequestIdRef.current = requestId;
      diagnosticConversationIdRef.current = targetConversationId;
      setDraft('');
      setDiagnosticState({ status: 'loading', requestId });

      try {
        const source = await chatSyncService.collectConversationDiagnosticData(targetConversationId);
        if (activeConversationIdRef.current !== targetConversationId || diagnosticRequestIdRef.current !== requestId) {
          return;
        }
        setDiagnosticState({
          status: 'ready',
          requestId,
          report: buildChatConversationDiagnosticReport(source, pageProjection)
        });
      } catch (error) {
        if (activeConversationIdRef.current !== targetConversationId || diagnosticRequestIdRef.current !== requestId) {
          return;
        }
        setDiagnosticState({
          status: 'error',
          requestId,
          errorText: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }

    const requestId = sendRequestIdRef.current + 1;
    const targetConversationId = conversationId;
    sendRequestIdRef.current = requestId;
    hasObservedPendingSendRef.current = false;
    sendingRef.current = true;
    setSending(true);
    setDraft('');
    setErrorText('');

    try {
      const result = await chatSyncService.sendMessage(targetConversationId, nextDraft, nextAttachments, {
        accessLevel,
        model: modelOverride,
        planningMode: effectivePlanModeEnabled,
        editingMode: effectiveEditingModeEnabled,
        mustUseSkills: selectedSkills,
        dispatchErrorMode: nextAttachments.some((item) => item.kind === 'chat' || item.kind === 'site')
          ? 'return'
          : undefined
      });
      if (
        !shouldApplyChatDetailAsyncResult({
          activeConversationId: activeConversationIdRef.current,
          targetConversationId,
          currentRequestId: sendRequestIdRef.current,
          requestId
        })
      )
        return;
      if (result.dispatchError && nextAttachments.some((item) => item.kind === 'chat' || item.kind === 'site')) {
        setDraft(nextDraft);
        setErrorText(`${t('contextReference.correct')} · ${result.dispatchError.message}`);
        hasObservedPendingSendRef.current = false;
        sendingRef.current = false;
        setSending(false);
        return;
      }
      setEditingModeEnabled(false);
      setSkillSelection(null);
      clearAttachments();
    } catch (error) {
      if (
        !shouldApplyChatDetailAsyncResult({
          activeConversationId: activeConversationIdRef.current,
          targetConversationId,
          currentRequestId: sendRequestIdRef.current,
          requestId
        })
      ) {
        return;
      }
      setDraft(nextDraft);
      setErrorText(error instanceof Error ? error.message : String(error));
      hasObservedPendingSendRef.current = false;
      sendingRef.current = false;
      setSending(false);
    }
  }, [
    agentAvailability,
    pendingSteer,
    accessLevel,
    clearAttachments,
    composerAction,
    composerAttachments,
    conversationId,
    draft,
    effectivePlanModeEnabled,
    effectiveEditingModeEnabled,
    selectedSkills,
    errorText,
    headerRuntimeState,
    modelOptionsLoading,
    modelOptionsSnapshot,
    modelOverride,
    planModeAvailable,
    readyAttachments,
    runtimeState,
    socketStatus,
    timelineState,
    t
  ]);

  const handleToggleEditingMode = useCallback(() => {
    if (editingModeAvailable && !pendingSteer && !sendingRef.current && !composerRunActionRef.current)
      setEditingModeEnabled((current) => !current);
  }, [editingModeAvailable, pendingSteer]);

  const handleTogglePlanMode = useCallback(() => {
    if (!planModeAvailable || pendingSteer || sendingRef.current || composerRunActionRef.current) {
      return;
    }
    setPlanModeEnabled((current) => !current);
  }, [planModeAvailable, pendingSteer]);

  const handleReaskMessage = useCallback(
    async (target: 'current' | 'new', node: ChatTimelineMessageNode) => {
      const nextContent = String(node.content || '').trim();
      const nextAttachments = node.attachments || [];
      if ((!nextContent && nextAttachments.length === 0) || node.deliveryStatus === 'pending') {
        return;
      }
      if (reaskInFlightRef.current || sendingRef.current) {
        return;
      }
      if (composerRunActionRef.current) {
        return;
      }

      const targetConversationId = conversationId;
      const requestId = sendRequestIdRef.current + 1;
      sendRequestIdRef.current = requestId;
      reaskInFlightRef.current = true;
      hasObservedPendingSendRef.current = false;
      setErrorText('');

      try {
        const storedModes =
          node.deliveryStatus === 'failed' && node.clientMessageId
            ? await getOutboxMessageOptions(node.clientMessageId)
            : null;
        if (
          !shouldApplyChatDetailAsyncResult({
            activeConversationId: activeConversationIdRef.current,
            targetConversationId,
            currentRequestId: sendRequestIdRef.current,
            requestId
          })
        )
          return;
        const queryModes = storedModes ?? {
          planningMode: effectivePlanModeEnabled,
          editingMode: effectiveEditingModeEnabled,
          mustUseSkills: selectedSkills
        };
        if (
          target === 'current' &&
          node.deliveryStatus === 'failed' &&
          nextAttachments.some((item) => item.kind === 'chat' || item.kind === 'site')
        ) {
          setDraft((current) => (!current || current === nextContent ? nextContent : `${current}\n\n${nextContent}`));
          restoreAttachments(nextAttachments);
          setPlanModeEnabled(queryModes.planningMode);
          setEditingModeEnabled(queryModes.editingMode);
          setSkillSelection({ agentKey: composerAgentKey, conversationId, ids: queryModes.mustUseSkills });
          setErrorText(t('contextReference.correct'));
          return;
        }
        if (target === 'current') {
          sendingRef.current = true;
          setSending(true);
          await chatSyncService.sendMessage(targetConversationId, nextContent, nextAttachments, {
            accessLevel,
            model: modelOverride,
            planningMode: queryModes.planningMode,
            editingMode: queryModes.editingMode,
            mustUseSkills: queryModes.mustUseSkills
          });
          if (
            shouldApplyChatDetailAsyncResult({
              activeConversationId: activeConversationIdRef.current,
              targetConversationId,
              currentRequestId: sendRequestIdRef.current,
              requestId
            })
          ) {
            setEditingModeEnabled(false);
            setSkillSelection(null);
          }
          return;
        }

        const scope = historyScope;
        if (!scope) {
          throw new Error(t('chatDetail.error.missingConversationContext'));
        }

        const created = await createConversationForHistoryScope(scope);
        if (activeConversationIdRef.current !== targetConversationId) {
          return;
        }
        if (!created) {
          throw new Error(t('chatDetail.error.missingConversationContext'));
        }

        await chatSyncService.sendMessage(created.conversation.conversationId, nextContent, nextAttachments, {
          accessLevel,
          dispatchErrorMode: 'return',
          model: modelOverride,
          planningMode: queryModes.planningMode,
          editingMode: queryModes.editingMode,
          mustUseSkills: queryModes.mustUseSkills
        });
        if (activeConversationIdRef.current !== targetConversationId) {
          return;
        }

        navigation.replace('ChatDetail', {
          conversationId: created.conversation.conversationId,
          ...conversationTargetRouteParams,
          initialConversation: created.conversation,
          ...(created.historyScope ? { historyScope: created.historyScope } : {}),
          skipInitialReconcile: created.skipInitialReconcile
        });
      } catch (error) {
        if (
          !shouldApplyChatDetailAsyncResult({
            activeConversationId: activeConversationIdRef.current,
            targetConversationId,
            currentRequestId: sendRequestIdRef.current,
            requestId
          })
        ) {
          return;
        }
        setErrorText(error instanceof Error ? error.message : String(error));
        hasObservedPendingSendRef.current = false;
        if (target === 'current') {
          sendingRef.current = false;
          setSending(false);
        }
      } finally {
        reaskInFlightRef.current = false;
      }
    },
    [
      accessLevel,
      conversationId,
      conversationTargetRouteParams,
      effectivePlanModeEnabled,
      effectiveEditingModeEnabled,
      selectedSkills,
      restoreAttachments,
      composerAgentKey,
      historyScope,
      modelOverride,
      navigation,
      t
    ]
  );

  const handleDeriveRun = useCallback(
    async (runId: string) => {
      const sourceId = conversationId;
      setErrorText('');
      try {
        const result = await chatSyncService.deriveConversation(sourceId, runId);
        if (activeConversationIdRef.current !== sourceId) return;
        navigation.replace('ChatDetail', {
          conversationId: result.conversation.conversationId,
          ...conversationTargetRouteParams,
          initialConversation: result.conversation,
          historyScope: result.historyScope,
          skipInitialReconcile: true
        });
      } catch (error) {
        if (activeConversationIdRef.current === sourceId)
          setErrorText(error instanceof Error ? error.message : String(error));
      }
    },
    [conversationId, conversationTargetRouteParams, navigation]
  );

  const handleStop = useCallback(() => {
    chatSyncService.stopStreaming(conversationId);
  }, [conversationId]);

  const handleResume = useCallback(() => {
    setErrorText('');
    void chatSyncService.resumeStreaming(conversationId).catch((error) => {
      if (activeConversationIdRef.current === conversationId)
        setErrorText(error instanceof Error ? error.message : String(error));
    });
  }, [conversationId]);

  const handleStartNewConversation = useCallback(async () => {
    if (isStartingNewConversationRef.current) {
      return;
    }

    if (isEmptyDraftConversation(summary)) {
      setErrorText('');
      return;
    }

    const scope = historyScope;
    if (!scope) {
      setErrorText(t('chatDetail.error.missingConversationContext'));
      return;
    }

    const targetConversationId = conversationId;
    let shouldReleaseStartLock = true;
    isStartingNewConversationRef.current = true;
    setErrorText('');

    try {
      const created = await createConversationForHistoryScope(scope);
      if (activeConversationIdRef.current !== targetConversationId) {
        return;
      }
      if (!created) {
        setErrorText(t('chatDetail.error.missingConversationContext'));
        return;
      }

      navigation.replace('ChatDetail', {
        conversationId: created.conversation.conversationId,
        ...conversationTargetRouteParams,
        initialConversation: created.conversation,
        ...(created.historyScope ? { historyScope: created.historyScope } : {}),
        skipInitialReconcile: created.skipInitialReconcile
      });
      shouldReleaseStartLock = false;
    } catch (error) {
      if (activeConversationIdRef.current !== targetConversationId) {
        return;
      }
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      if (shouldReleaseStartLock) {
        isStartingNewConversationRef.current = false;
      }
    }
  }, [conversationId, conversationTargetRouteParams, historyScope, navigation, summary, t]);

  const handleRetryFromNotification = useCallback(() => {
    setErrorText('');
    setReloadSeed((value) => value + 1);
  }, []);

  const handleSelectWonder = useCallback((text: string) => {
    const nextText = String(text || '').trim();
    if (!nextText) {
      return;
    }
    setDraft(nextText);
    setErrorText('');
  }, []);

  return {
    summary,
    conversationTarget,
    historyScope,
    timelineState,
    activeFrontendTool,
    newConversationIntro,
    runtimeState,
    headerRuntimeState,
    isInitialContentReady,
    isInitialSkeletonVisible,
    skeletonOverlayOpacity,
    socketStatus,
    errorText,
    agentAvailability,
    agentAvailabilityText:
      agentAvailability === 'available'
        ? ''
        : t(
            (
              {
                checking: 'chatDetail.agent.checking',
                unavailable: 'chatDetail.agent.unavailable',
                authentication_required: 'chatDetail.agent.authenticationRequired',
                forbidden: 'chatDetail.agent.forbidden',
                error: 'chatDetail.agent.error'
              } as const
            )[agentAvailability]
          ),
    modelRetryText:
      timelineState.modelRetry &&
      timelineState.modelRetry.retryAt > expiredModelRetryAt &&
      timelineState.modelRetry.retryAt > Date.now()
        ? `${timelineState.modelRetry.reason} ${t('chatDetail.modelRetry.waiting', {
            attempt: timelineState.modelRetry.attempt - 1,
            total: timelineState.modelRetry.maxAttempts - 1,
            seconds: timelineState.modelRetry.delayMs / 1000
          })}`
        : '',
    diagnosticState:
      diagnosticConversationIdRef.current === conversationId
        ? diagnosticState
        : { status: 'idle' as const, requestId: diagnosticRequestIdRef.current },
    draft: pendingSteer?.message ?? draft,
    setDraft,
    pendingSteer,
    steerAvailable,
    handleSteer,
    handleRestoreSteer,
    composerAttachments: pendingSteer?.attachments ?? composerAttachments,
    composerOptions,
    setAccessLevel,
    setModelOverride: handleModelOverrideChange,
    composerAction,
    planModeAvailable,
    planModeEnabled: effectivePlanModeEnabled,
    editingModeAvailable,
    editingModeEnabled: effectiveEditingModeEnabled,
    handleToggleEditingMode,
    handleSend,
    handleReaskMessage,
    handleDeriveRun,
    handleStop,
    handleResume,
    handleTogglePlanMode,
    handleStartNewConversation,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    addSelection,
    updateSelectionAnnotation,
    addContextReference,
    handleRetryFromNotification,
    handleSelectWonder
  };
}
