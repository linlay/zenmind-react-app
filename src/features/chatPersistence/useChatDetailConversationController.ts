import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Animated, Platform } from 'react-native';

import type { AgentDetailSnapshot } from '../../core/api/services/chatApi';
import {
  buildAgentModelConfigPayload,
  type
  ModelOptionsSnapshot,
  QueryAccessLevel,
  QueryModelOverride
} from '../../core/api/services/modelOptionsProtocol';
import { getNotificationMessageDetailApi } from '../../core/api/services/notificationApi';
import { useT } from '../../shared/i18n';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import type { ChatSocketStatus } from '../chatRealtime/types';
import {
  createChatTimelineState,
  projectTimelineRuntimeState,
  type ChatTimelineMessageNode,
  type ChatTimelineState
} from '../chatTimeline/index.ts';
import { shouldApplyChatDetailAsyncResult } from './chatDetailAsyncScope';
import { deriveChatDetailHeaderRuntimeState, deriveChatComposerPrimaryAction } from './chatDetailViewModel';
import {
  createConversationForHistoryScope,
  getConversationDetail,
  getConversationHistoryScope,
  getConversationInitialTimelineState,
  getConversationTarget,
  getMessageByServerMessageId,
  upsertServerMessageDetail
} from './chatRepository';
import { canUsePlanMode } from './agentMode.ts';
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
    ...(snapshot.defaultServiceTier && snapshot.defaultServiceTier !== 'STANDARD'
      ? { serviceTier: snapshot.defaultServiceTier }
      : {})
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
  if (
    agentMode === target.agentMode &&
    modelKey === target.modelKey &&
    reasoningEffort === target.reasoningEffort
  ) {
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
  const [accessLevel, setAccessLevel] = useState<QueryAccessLevel>('default');
  const [modelOverride, setModelOverride] = useState<QueryModelOverride>({});
  const [modelOptionsSnapshot, setModelOptionsSnapshot] = useState<ModelOptionsSnapshot | null>(null);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const [socketStatus, setSocketStatus] = useState<ChatSocketStatus>(chatSyncService.getStatus());
  const [errorText, setErrorText] = useState('');
  const [agentDetailSnapshot, setAgentDetailSnapshot] = useState<AgentDetailSnapshot | null>(null);
  const [reloadSeed, setReloadSeed] = useState(0);
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
    skipInitialReconcile &&
      summary &&
      isEmptyDraftConversation(summary) &&
      timelineState.orderedNodeIds.length === 0
  );
  const introAgentKey = useMemo(
    () =>
      isNewConversationEmpty
        ? normalizeIntroAgentKey(conversationTarget?.agentKey || historyScope?.agentKey)
        : '',
    [conversationTarget?.agentKey, historyScope?.agentKey, isNewConversationEmpty]
  );
  const composerAgentKey = useMemo(
    () => normalizeIntroAgentKey(conversationTarget?.agentKey || historyScope?.agentKey),
    [conversationTarget?.agentKey, historyScope?.agentKey]
  );
  const composerOptions = useMemo(
    () => ({
      accessLevel,
      agentKey: composerAgentKey,
      modelOverride,
      modelOptionsLoading,
      modelOptionsSnapshot
    }),
    [accessLevel, composerAgentKey, modelOptionsLoading, modelOptionsSnapshot, modelOverride]
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
      description: getDisplayTextUnlessAgentKey(
        scopedAgentDetail?.description,
        introAgentKey
      ),
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
  const planModeAvailable = useMemo(
    () => canUsePlanMode(conversationTarget?.agentMode),
    [conversationTarget?.agentMode]
  );
  const effectivePlanModeEnabled = planModeAvailable && planModeEnabled;
  const runtimeState = useMemo(() => projectTimelineRuntimeState(timelineState), [timelineState]);
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
  const {
    attachments: composerAttachments,
    readyAttachments,
    hasUploadingAttachments,
    hasFailedAttachments,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    clearAttachments
  } = useChatComposerAttachments({
    conversationId,
    disabled: sending || Boolean(composerRunAction),
    onError: setErrorText
  });
  const latestUserMessagePending = useMemo(() => getLatestUserMessagePending(timelineState), [timelineState]);
  const composerAction = useMemo(
    () =>
      deriveChatComposerPrimaryAction({
        draft,
        sending,
        runAction: composerRunAction,
        hasReadyAttachments: readyAttachments.length > 0,
        attachmentsBlocked: hasUploadingAttachments || hasFailedAttachments
      }),
    [composerRunAction, draft, hasFailedAttachments, hasUploadingAttachments, readyAttachments.length, sending]
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
    modelConfigUpdateIdRef.current += 1;
    isStartingNewConversationRef.current = false;
    hasObservedPendingSendRef.current = false;
    sendingRef.current = false;
    reaskInFlightRef.current = false;
    setDraft('');
    setSending(false);
    setAccessLevel('default');
    setModelOverride({});
  }, [conversationId]);

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
    if (conversationTarget && !planModeAvailable && planModeEnabled) {
      setPlanModeEnabled(false);
    }
  }, [conversationTarget, planModeAvailable, planModeEnabled]);

  useEffect(() => {
    if (!introAgentKey) {
      setAgentDetailSnapshot(null);
      return;
    }

    const cached = chatSyncService.getAgentDetailSnapshot(introAgentKey);
    setAgentDetailSnapshot(cached);

    let cancelled = false;
    const targetConversationId = conversationId;
    void chatSyncService.ensureAgentDetail(introAgentKey).then((nextDetail) => {
      if (
        cancelled ||
        activeConversationIdRef.current !== targetConversationId ||
        !nextDetail
      ) {
        return;
      }
      setAgentDetailSnapshot(nextDetail);
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId, introAgentKey]);

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

    if (cached) {
      setModelOverride((current) => (hasQueryModelOverride(current) ? current : getDefaultQueryModelOverride(cached)));
    }

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
          if (
            activeConversationIdRef.current !== targetConversationId ||
            modelConfigUpdateIdRef.current !== updateId
          ) {
            return;
          }
          if (snapshot) {
            setModelOptionsSnapshot(snapshot);
          }
          setModelOverride(nextOverride);
        })
        .catch((error) => {
          if (
            activeConversationIdRef.current !== targetConversationId ||
            modelConfigUpdateIdRef.current !== updateId
          ) {
            return;
          }
          setErrorText(error instanceof Error ? error.message : String(error));
        });
    },
    [composerAgentKey, conversationId, modelOverride]
  );

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
    const nextDraft = draft.trim();
    const nextAttachments = readyAttachments;
    if ((!nextDraft && nextAttachments.length === 0) || sendingRef.current || reaskInFlightRef.current) {
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
      await chatSyncService.sendMessage(targetConversationId, nextDraft, nextAttachments, {
        accessLevel,
        model: modelOverride,
        planningMode: effectivePlanModeEnabled
      });
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
  }, [accessLevel, clearAttachments, conversationId, draft, effectivePlanModeEnabled, modelOverride, readyAttachments]);

  const handleTogglePlanMode = useCallback(() => {
    if (!planModeAvailable) {
      return;
    }
    setPlanModeEnabled((current) => !current);
  }, [planModeAvailable]);

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
        if (target === 'current') {
          sendingRef.current = true;
          setSending(true);
          await chatSyncService.sendMessage(targetConversationId, nextContent, nextAttachments, {
            accessLevel,
            model: modelOverride,
            planningMode: effectivePlanModeEnabled
          });
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
          planningMode: effectivePlanModeEnabled
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
      historyScope,
      modelOverride,
      navigation,
      t
    ]
  );

  const handleStop = useCallback(() => {
    chatSyncService.stopStreaming(conversationId);
  }, [conversationId]);

  const handleResume = useCallback(() => {
    setErrorText('');
    chatSyncService.resumeStreaming(conversationId);
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
    newConversationIntro,
    runtimeState,
    headerRuntimeState,
    isInitialContentReady,
    isInitialSkeletonVisible,
    skeletonOverlayOpacity,
    socketStatus,
    errorText,
    draft,
    setDraft,
    composerAttachments,
    composerOptions,
    setAccessLevel,
    setModelOverride: handleModelOverrideChange,
    composerAction,
    planModeAvailable,
    planModeEnabled: effectivePlanModeEnabled,
    handleSend,
    handleReaskMessage,
    handleStop,
    handleResume,
    handleTogglePlanMode,
    handleStartNewConversation,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    handleRetryFromNotification,
    handleSelectWonder
  };
}
