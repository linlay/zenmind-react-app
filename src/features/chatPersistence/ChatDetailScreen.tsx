import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../shared/i18n';
import { ChatAwaitingOverlay, ChatAwaitingResumeBar } from './components/ChatAwaitingOverlay';
import { ChatAwaitingDock } from './components/awaiting/ChatAwaitingDock';
import { ChatConversationDiagnosticCard } from './components/ChatConversationDiagnosticCard';
import { ChatDetailComposerCard } from './components/ChatDetailComposerCard';
import { ChatDetailHistoryDrawer } from './components/ChatDetailDrawers';
import { ChatDetailEmptyState } from './components/ChatDetailEmptyState';
import { ChatDetailHeader } from './components/ChatDetailHeader';
import { ChatTimelineList } from './components/ChatTimelineList';
import { ChatDetailSkeleton } from './components/ChatDetailSkeleton';
import { ChatNewConversationIntro } from './components/ChatNewConversationIntro';
import { CopyToast } from './components/CopyToast';
import { AuthenticatedResourcePreviewProvider } from './components/resource/AuthenticatedResourcePreviewProvider.tsx';
import { FrontendToolDock } from './frontendTool/FrontendToolDock';
import { formatChatStatusLabel } from './chatDetailFormatters';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import type { ChatSyncEvent } from '../chatRealtime/types';
import type {
  AwaitingSubmitPayloadData,
  FrontendToolSubmitPayloadData,
  SubmitFrontendToolResponse,
} from '../../core/api/services/chatApi';
import type { ChatTimelineFrontendToolResolution } from '../chatTimeline/index.ts';
import { getConversationHistorySlice } from './chatRepository';
import type { ChatConversationHistoryScope, ChatDetailRouteParams, ChatHomeItem } from './types';
import { useChatDetailAwaitingOverlay } from './useChatDetailAwaitingOverlay';
import { useChatDetailConversationController } from './useChatDetailConversationController';
import { useChatDetailLocalUiState } from './useChatDetailLocalUiState';
import { useConversationActionRuntime } from './useConversationActionRuntime.ts';

type ChatDetailScreenProps = NativeStackScreenProps<{ ChatDetail: ChatDetailRouteParams }, 'ChatDetail'>;
const IS_IOS = Platform.OS === 'ios';
const KEYBOARD_SHOW_EVENT = IS_IOS ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE_EVENT = IS_IOS ? 'keyboardWillHide' : 'keyboardDidHide';
const SAFE_AREA_CLASS = 'flex-1 bg-app-background';
const KEYBOARD_ROOT_CLASS = 'flex-1';
const SCREEN_CLASS = 'flex-1 bg-app-background';
const INITIAL_SKELETON_OVERLAY_CLASS = 'absolute inset-0';

function useKeyboardVisibility() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const showSubscription = Keyboard.addListener(KEYBOARD_SHOW_EVENT, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(KEYBOARD_HIDE_EVENT, () => setIsKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return isKeyboardVisible;
}

type ChatDetailKeyboardAvoiderProps = {
  children: ReactNode;
  keyboardVerticalOffset: number;
  className: string;
};

function ChatDetailKeyboardAvoider({ children, keyboardVerticalOffset, className }: ChatDetailKeyboardAvoiderProps) {
  const isKeyboardVisible = useKeyboardVisibility();

  return (
    <KeyboardAvoidingView
      className={className}
      behavior="padding"
      enabled={isKeyboardVisible}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

export function ChatDetailScreen({ navigation, route }: ChatDetailScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {
    conversationId,
    conversationSubtitle = '',
    conversationTarget: routeConversationTarget = null,
    initialConversation = null,
    historyScope: routeHistoryScope,
    serverMessageId = '',
    fromNotification = false,
    skipInitialReconcile = false
  } = route.params;
  useConversationActionRuntime(conversationId);
  const {
    summary,
    conversationTarget,
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
    diagnosticState,
    draft,
    setDraft,
    composerAttachments,
    composerOptions,
    composerAction,
    setAccessLevel,
    setModelOverride,
    planModeAvailable,
    planModeEnabled,
    handleSend,
    handleStop,
    handleResume,
    handleTogglePlanMode,
    handleReaskMessage,
    handleStartNewConversation,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    handleRetryFromNotification,
    handleSelectWonder,
    historyScope
  } = useChatDetailConversationController({
    navigation,
    conversationId,
    conversationSubtitle,
    routeConversationTarget,
    initialConversation,
    routeHistoryScope,
    serverMessageId,
    fromNotification,
    skipInitialReconcile
  });
  const { awaitingSummary, handleOpenAwaitingOverlay, handleDismissAwaitingOverlay } = useChatDetailAwaitingOverlay(
    runtimeState,
    conversationId
  );
  const interactiveAwaiting = awaitingSummary?.interactive ? awaitingSummary : null;
  const passiveAwaiting = interactiveAwaiting ? null : awaitingSummary;
  const handleSubmitAwaiting = useCallback(
    (payload: AwaitingSubmitPayloadData) => chatSyncService.submitAwaiting(conversationId, payload),
    [conversationId]
  );
  const handleSubmitFrontendTool = useCallback(
    (payload: FrontendToolSubmitPayloadData): Promise<SubmitFrontendToolResponse> =>
      chatSyncService.submitFrontendTool(conversationId, payload),
    [conversationId]
  );
  const handleResolveFrontendTool = useCallback(
    (toolKey: string, reason: ChatTimelineFrontendToolResolution) => {
      chatSyncService.resolveFrontendTool(conversationId, toolKey, reason);
    },
    [conversationId]
  );
  const handleLoadHistory = useCallback(
    (scope: ChatConversationHistoryScope, limit: number) => getConversationHistorySlice(scope, limit),
    []
  );
  const handleMarkHistoryScopeRead = useCallback(
    (scope: ChatConversationHistoryScope) => chatSyncService.markScopeRead(scope),
    []
  );
  const handleSubscribeHistoryEvents = useCallback(
    (listener: (event: ChatSyncEvent) => void) => chatSyncService.subscribe(listener),
    []
  );
  const {
    isHistoryDrawerOpen,
    historyItems,
    historyTotal,
    historyUnreadTotal,
    isHistoryLoading,
    isHistoryLoadingMore,
    isHistoryMarkingRead,
    historyErrorText,
    hasMoreHistory,
    copyToastTrigger,
    handleCopyMessage,
    handleOpenHistoryDrawer,
    handleCloseHistoryDrawer,
    handleLoadMoreHistory,
    handleMarkAllHistoryRead
  } = useChatDetailLocalUiState(conversationId, historyScope, {
    copyText: Clipboard.setStringAsync,
    loadHistory: handleLoadHistory,
    markHistoryScopeRead: handleMarkHistoryScopeRead,
    subscribeHistoryEvents: handleSubscribeHistoryEvents
  });
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleSelectHistoryConversation = useCallback(
    (item: ChatHomeItem) => {
      handleCloseHistoryDrawer();
      if (item.conversationId === conversationId) {
        return;
      }

      navigation.replace('ChatDetail', {
        conversationId: item.conversationId,
        conversationSubtitle,
        ...(conversationTarget ? { conversationTarget } : {}),
        initialConversation: item,
        ...(historyScope ? { historyScope } : {})
      });
    },
    [conversationId, conversationSubtitle, conversationTarget, handleCloseHistoryDrawer, historyScope, navigation]
  );

  const content = (
    <View className={SAFE_AREA_CLASS}>
      {isInitialContentReady ? (
        summary ? (
          <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
            <ChatDetailKeyboardAvoider className={KEYBOARD_ROOT_CLASS} keyboardVerticalOffset={IS_IOS ? insets.top : 0}>
              <View className={SCREEN_CLASS}>
                <ChatDetailHeader
                  title={conversationTarget?.title || summary.title}
                  subtitle={
                    conversationTarget?.subtitle || conversationSubtitle || formatChatStatusLabel(socketStatus, t)
                  }
                  statusLabel={
                    headerRuntimeState.statusTone === 'running'
                      ? t('chatDetail.status.running')
                      : headerRuntimeState.statusTone === 'error'
                        ? t('chatDetail.status.error')
                        : t('chatDetail.status.idle')
                  }
                  statusTone={headerRuntimeState.statusTone}
                  usageSummary={headerRuntimeState.usageSummary}
                  modelKey={conversationTarget?.modelKey ?? null}
                  reasoningEffort={conversationTarget?.reasoningEffort ?? null}
                  onBack={handleGoBack}
                  onStartNewConversation={handleStartNewConversation}
                  onOpenMenu={handleOpenHistoryDrawer}
                />

                <ChatTimelineList
                  timelineState={timelineState}
                  diagnosticCard={
                    diagnosticState.status === 'idle' ? null : (
                      <ChatConversationDiagnosticCard state={diagnosticState} />
                    )
                  }
                  diagnosticVersion={
                    diagnosticState.status === 'idle'
                      ? ''
                      : `${diagnosticState.requestId}:${diagnosticState.status}`
                  }
                  emptyState={
                    newConversationIntro ? (
                      <ChatNewConversationIntro
                        agentName={newConversationIntro.agentName}
                        description={newConversationIntro.description}
                        wonders={newConversationIntro.wonders}
                        onSelectWonder={handleSelectWonder}
                      />
                    ) : null
                  }
                  onCopyText={handleCopyMessage}
                  workspaceAgentKey={composerOptions.agentKey}
                  onReaskMessage={handleReaskMessage}
                  reaskCurrentDisabled={composerAction === 'sending' || Boolean(headerRuntimeState.runAction)}
                  reaskNewConversationDisabled={
                    composerAction === 'sending' || Boolean(headerRuntimeState.runAction) || !historyScope
                  }
                />

                {activeFrontendTool ? (
                  <FrontendToolDock
                    key={activeFrontendTool.key}
                    tool={activeFrontendTool}
                    onResolve={handleResolveFrontendTool}
                    onSubmit={handleSubmitFrontendTool}
                  />
                ) : null}

                {interactiveAwaiting ? (
                  <ChatAwaitingDock awaiting={interactiveAwaiting} onSubmit={handleSubmitAwaiting} />
                ) : (
                  <>
                    <ChatAwaitingResumeBar
                      awaiting={passiveAwaiting}
                      visible={Boolean(passiveAwaiting && !passiveAwaiting.isOverlayVisible)}
                      onPress={handleOpenAwaitingOverlay}
                    />

                    <ChatDetailComposerCard
                      draft={draft}
                      attachments={composerAttachments}
                      errorText={errorText}
                      planModeAvailable={planModeAvailable}
                      planModeEnabled={planModeEnabled}
                      primaryAction={composerAction}
                      onChangeDraft={setDraft}
                      onSubmit={handleSend}
                      onStop={handleStop}
                      onResume={handleResume}
                      onTogglePlanMode={handleTogglePlanMode}
                      onSelectAttachment={handleSelectAttachment}
                      onRemoveAttachment={handleRemoveAttachment}
                      onRetryAttachment={handleRetryAttachment}
                      composerOptions={composerOptions}
                      onAccessLevelChange={setAccessLevel}
                      onModelOverrideChange={setModelOverride}
                    />
                  </>
                )}
              </View>
            </ChatDetailKeyboardAvoider>
          </SafeAreaView>
        ) : (
          <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
            <ChatDetailEmptyState
              errorText={errorText}
              onBack={handleGoBack}
              onRetry={fromNotification ? handleRetryFromNotification : undefined}
            />
          </SafeAreaView>
        )
      ) : null}

      {isInitialSkeletonVisible ? (
        <Animated.View className={INITIAL_SKELETON_OVERLAY_CLASS} style={{ opacity: skeletonOverlayOpacity }}>
          <SafeAreaView edges={['top', 'bottom']} className={SAFE_AREA_CLASS}>
            <ChatDetailSkeleton />
          </SafeAreaView>
        </Animated.View>
      ) : null}

      <ChatDetailHistoryDrawer
        visible={isHistoryDrawerOpen}
        activeConversationId={conversationId}
        historyItems={historyItems}
        total={historyTotal}
        unreadTotal={historyUnreadTotal}
        loading={isHistoryLoading}
        loadingMore={isHistoryLoadingMore}
        markingRead={isHistoryMarkingRead}
        errorText={historyErrorText}
        hasMore={hasMoreHistory}
        onClose={handleCloseHistoryDrawer}
        onLoadMore={handleLoadMoreHistory}
        onMarkAllRead={handleMarkAllHistoryRead}
        onSelectConversation={handleSelectHistoryConversation}
      />

      <CopyToast trigger={copyToastTrigger} />
      {passiveAwaiting?.isOverlayVisible && isInitialContentReady ? (
        <ChatAwaitingOverlay awaiting={passiveAwaiting} onDismiss={handleDismissAwaitingOverlay} />
      ) : null}
    </View>
  );
  return (
    <AuthenticatedResourcePreviewProvider key={conversationId}>{content}</AuthenticatedResourcePreviewProvider>
  );
}
