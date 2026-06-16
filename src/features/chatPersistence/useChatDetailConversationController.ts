import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Animated, Platform } from 'react-native';

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
  const [socketStatus, setSocketStatus] = useState<ChatSocketStatus>(chatSyncService.getStatus());
  const [errorText, setErrorText] = useState('');
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
  const sendingRef = useRef(false);
  const reaskInFlightRef = useRef(false);
  const isStartingNewConversationRef = useRef(false);
  const skeletonOverlayOpacity = useRef(new Animated.Value(1)).current;
  const skeletonFadeFrameRef = useRef<number | null>(null);
  const skeletonFadeCommitFrameRef = useRef<number | null>(null);
  const skeletonFadeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const summary = isConversationUnavailable ? null : (detail ?? initialConversation);
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
    isStartingNewConversationRef.current = false;
    hasObservedPendingSendRef.current = false;
    sendingRef.current = false;
    reaskInFlightRef.current = false;
    setDraft('');
    setSending(false);
  }, [conversationId]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    composerRunActionRef.current = composerRunAction;
  }, [composerRunAction]);

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

        const [nextDetail, nextTimelineState, nextHistoryScope, nextConversationTarget] = await Promise.all([
          getConversationDetail(conversationId),
          getConversationInitialTimelineState(conversationId, 60),
          normalizedRouteHistoryScope
            ? Promise.resolve(normalizedRouteHistoryScope)
            : getConversationHistoryScope(conversationId),
          normalizedRouteConversationTarget
            ? Promise.resolve(normalizedRouteConversationTarget)
            : getConversationTarget(conversationId)
        ]);

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
      void chatSyncService.reconcileConversation(conversationId, fromNotification ? 'notification' : 'detail_open');
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
    if ((!nextDraft && nextAttachments.length === 0) || sending || reaskInFlightRef.current) {
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
      await chatSyncService.sendMessage(targetConversationId, nextDraft, nextAttachments);
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
  }, [clearAttachments, conversationId, draft, readyAttachments, sending]);

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
          await chatSyncService.sendMessage(targetConversationId, nextContent, nextAttachments);
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
          dispatchErrorMode: 'return'
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
    [conversationId, conversationTargetRouteParams, historyScope, navigation, t]
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

  return {
    summary,
    conversationTarget,
    historyScope,
    timelineState,
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
    composerAction,
    handleSend,
    handleReaskMessage,
    handleStop,
    handleResume,
    handleStartNewConversation,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    handleRetryFromNotification
  };
}
