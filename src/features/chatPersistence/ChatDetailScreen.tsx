import { ChatContextReferencePicker } from './components/ChatContextReferencePicker';
import { ConversationViewScope } from './conversationViewport/ConversationViewScope';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Animated, Keyboard, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../shared/i18n';
import { ConversationPreviewProvider } from '../../shared/components/conversationPreview/ConversationPreviewProvider';
import { createConversationPreviewVisibilityStore } from '../../shared/components/conversationPreview/visibilityStore';
import { ChatAwaitingOverlay, ChatAwaitingResumeBar } from './components/ChatAwaitingOverlay';
import { ChatAwaitingDock } from './components/awaiting/ChatAwaitingDock';
import { ChatArtifactDrawer } from './components/ChatArtifactDrawer.tsx';
import { ChatConversationDiagnosticCard } from './components/ChatConversationDiagnosticCard';
import { ChatDetailComposerCard } from './components/ChatDetailComposerCard';
import { ChatDetailHistoryDrawer } from './components/ChatDetailDrawers';
import { ChatDetailEmptyState } from './components/ChatDetailEmptyState';
import { ChatDetailHeader } from './components/ChatDetailHeader';
import { ChatExportMenu } from './components/ChatExportMenu';
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
  SubmitFrontendToolResponse
} from '../../core/api/services/chatApi';
import type { ChatTimelineFrontendToolResolution } from '../chatTimeline/index.ts';
import { getConversationHistorySlice } from './chatRepository';
import { selectChatTimelineArtifacts } from './chatArtifactPresentation.ts';
import type { ChatConversationHistoryScope, ChatDetailRouteParams, ChatHomeItem } from './types';
import { useChatDetailAwaitingOverlay } from './useChatDetailAwaitingOverlay';
import { useChatDetailConversationController } from './useChatDetailConversationController';
import { useChatDetailLocalUiState } from './useChatDetailLocalUiState';
import { useConversationActionRuntime } from './useConversationActionRuntime.ts';
import { getChatSourceFromId } from './chatSource.ts';
import { isAccountDesktopChatSource } from './chatSourceRuntime.ts';

type ChatDetailScreenProps = NativeStackScreenProps<{ ChatDetail: ChatDetailRouteParams }, 'ChatDetail'>;
const IS_IOS = Platform.OS === 'ios';
const SHOW_CONVERSATION_TOOLS = Platform.OS === 'web';
const KEYBOARD_SHOW_EVENT = IS_IOS ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE_EVENT = IS_IOS ? 'keyboardWillHide' : 'keyboardDidHide';
const SAFE_AREA_CLASS = 'flex-1 bg-app-background';
const KEYBOARD_ROOT_CLASS = 'flex-1';
const SCREEN_CLASS = 'flex-1 bg-app-background';
const INITIAL_SKELETON_OVERLAY_CLASS = 'absolute inset-0';
const SOURCE_DELETED_NOTICE_CLASS =
  'mx-app-lg mb-app-sm rounded-app-md border border-app-line bg-app-surface-muted px-app-lg py-app-md';
const SOURCE_DELETED_NOTICE_TEXT_CLASS = 'text-app-footnote text-app-secondary';

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
  const [isArtifactDrawerOpen, setIsArtifactDrawerOpen] = useState(false);
  const [canLoadOlderRemoteHistory, setCanLoadOlderRemoteHistory] = useState(true);
  const [isLoadingOlderRemoteHistory, setIsLoadingOlderRemoteHistory] = useState(false);
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
  const isRemoteAccountConversation = useMemo(
    () => isAccountDesktopChatSource(getChatSourceFromId(conversationId)),
    [conversationId]
  );
  useEffect(() => {
    setCanLoadOlderRemoteHistory(true);
  }, [conversationId]);
  const conversationPreviewStore = useMemo(() => createConversationPreviewVisibilityStore(), []);
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
    recoveryText,
    modelRetryText,
    agentAvailability,
    agentAvailabilityText,
    retryConfiguration,
    diagnosticState,
    draft,
    setDraft,
    composerAttachments,
    composerOptions,
    composerAction,
    pendingSteer,
    steerAvailable,
    handleSteer,
    handleRestoreSteer,
    setAccessLevel,
    setModelOverride,
    planModeAvailable,
    planModeEnabled,
    editingModeAvailable,
    editingModeEnabled,
    handleToggleEditingMode,
    handleSend,
    handleStop,
    handleResume,
    handleTogglePlanMode,
    handleDeriveRun,
    handleReaskMessage,
    handleStartNewConversation,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    addSelection,
    updateSelectionAnnotation,
    addContextReference,
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
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextPickerKind, setContextPickerKind] = useState<'chat' | 'kbase'>('chat');
  const handleOpenContextPicker = useCallback(() => {
    setContextPickerKind('chat');
    setContextPickerOpen(true);
  }, []);
  const handleCloseContextPicker = useCallback(() => setContextPickerOpen(false), []);
  const contextPickerAvailable =
    (composerOptions.interaction.attachment.chatRecords || composerOptions.interaction.attachment.kbases) &&
    !!composerOptions.agentKey &&
    agentAvailability === 'available' &&
    !summary?.sourceDeleted &&
    !pendingSteer &&
    !headerRuntimeState.runAction &&
    composerAction !== 'sending';
  useEffect(() => {
    setContextPickerOpen(false);
  }, [conversationId]);
  useEffect(() => {
    if (!contextPickerAvailable) setContextPickerOpen(false);
  }, [contextPickerAvailable]);
  const artifacts = useMemo(() => selectChatTimelineArtifacts(timelineState), [timelineState]);
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
  const handleLoadOlderRemoteHistory = useCallback(async () => {
    if (isLoadingOlderRemoteHistory) return;
    setIsLoadingOlderRemoteHistory(true);
    try {
      const hasMore = await chatSyncService.loadOlderConversationHistory(conversationId);
      setCanLoadOlderRemoteHistory(hasMore);
    } finally {
      setIsLoadingOlderRemoteHistory(false);
    }
  }, [conversationId, isLoadingOlderRemoteHistory]);
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
  const handleOpenArtifactDrawer = useCallback(() => setIsArtifactDrawerOpen(true), []);
  const handleCloseArtifactDrawer = useCallback(() => setIsArtifactDrawerOpen(false), []);
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

  useEffect(() => {
    setIsArtifactDrawerOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (artifacts.length === 0) {
      setIsArtifactDrawerOpen(false);
    }
  }, [artifacts.length]);

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
                  showConversationTools={SHOW_CONVERSATION_TOOLS}
                  conversationActions={
                    SHOW_CONVERSATION_TOOLS ? (
                      <ChatExportMenu
                        key={`export:${conversationId}`}
                        conversationId={conversationId}
                        disabled={Boolean(summary.sourceDeleted)}
                      />
                    ) : null
                  }
                  diagnosticCard={
                    diagnosticState.status === 'idle' ? null : (
                      <ChatConversationDiagnosticCard state={diagnosticState} />
                    )
                  }
                  diagnosticVersion={
                    diagnosticState.status === 'idle' ? '' : `${diagnosticState.requestId}:${diagnosticState.status}`
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
                  onAddSelection={
                    !summary.sourceDeleted &&
                    !pendingSteer &&
                    agentAvailability === 'available' &&
                    composerAction !== 'sending' &&
                    composerAction !== 'resume'
                      ? addSelection
                      : undefined
                  }
                  previewStore={conversationPreviewStore}
                  workspaceAgentKey={composerOptions.agentKey}
                  onDeriveRun={summary.sourceDeleted ? undefined : handleDeriveRun}
                  deriveDisabled={
                    composerAction === 'sending' || Boolean(timelineState.activeRunId || timelineState.awaiting)
                  }
                  onReaskMessage={handleReaskMessage}
                  reaskCurrentDisabled={
                    summary.sourceDeleted || composerAction === 'sending' || Boolean(headerRuntimeState.runAction)
                  }
                  reaskNewConversationDisabled={
                    summary.sourceDeleted ||
                    composerAction === 'sending' ||
                    Boolean(headerRuntimeState.runAction) ||
                    !historyScope
                  }
                  artifactCount={artifacts.length}
                  onOpenArtifacts={handleOpenArtifactDrawer}
                  historyHeader={
                    canLoadOlderRemoteHistory && isRemoteAccountConversation ? (
                      <Pressable
                        disabled={isLoadingOlderRemoteHistory}
                        onPress={() => handleLoadOlderRemoteHistory().catch(() => {})}
                        className="self-center rounded-app-pill px-app-md py-app-sm active:bg-app-surface-muted"
                      >
                        <Text className="text-app-caption font-bold text-app-brand">
                          {isLoadingOlderRemoteHistory
                            ? t('chatDetail.history.loadingOlder')
                            : t('chatDetail.history.loadOlder')}
                        </Text>
                      </Pressable>
                    ) : null
                  }
                />

                {contextPickerOpen && contextPickerAvailable ? (
                  <ChatContextReferencePicker
                    key={`${conversationId}:${contextPickerKind}`}
                    kind={contextPickerKind}
                    conversationId={conversationId}
                    onClose={handleCloseContextPicker}
                    onSelect={(item) =>
                      addContextReference({ type: contextPickerKind, id: item.id, name: item.name, meta: item.meta })
                    }
                  />
                ) : null}

                {!summary.sourceDeleted && activeFrontendTool ? (
                  <FrontendToolDock
                    key={activeFrontendTool.key}
                    tool={activeFrontendTool}
                    onResolve={handleResolveFrontendTool}
                    onSubmit={handleSubmitFrontendTool}
                  />
                ) : null}

                {summary.sourceDeleted ? (
                  <View className={SOURCE_DELETED_NOTICE_CLASS}>
                    <Text className={SOURCE_DELETED_NOTICE_TEXT_CLASS}>{t('chatDetail.sourceDeleted')}</Text>
                  </View>
                ) : interactiveAwaiting ? (
                  <ChatAwaitingDock awaiting={interactiveAwaiting} onSubmit={handleSubmitAwaiting} />
                ) : (
                  <>
                    <ChatAwaitingResumeBar
                      awaiting={passiveAwaiting}
                      visible={Boolean(passiveAwaiting && !passiveAwaiting.isOverlayVisible)}
                      onPress={handleOpenAwaitingOverlay}
                    />

                    {agentAvailabilityText ? (
                      <Pressable
                        disabled={agentAvailability === 'checking'}
                        onPress={retryConfiguration}
                        accessibilityRole="button"
                        className="px-app-md py-2"
                      >
                        <Text className="text-[13px] text-app-secondary">{agentAvailabilityText}</Text>
                      </Pressable>
                    ) : null}
                    {modelRetryText ? (
                      <Text className="px-app-md text-[13px] text-app-secondary">{modelRetryText}</Text>
                    ) : null}
                    <ChatDetailComposerCard
                      pendingSteer={pendingSteer}
                      steerAvailable={steerAvailable}
                      onSteer={handleSteer}
                      onRestoreSteer={handleRestoreSteer}
                      draft={draft}
                      attachments={composerAttachments}
                      errorText={errorText}
                      recoveryText={recoveryText}
                      planModeAvailable={planModeAvailable}
                      planModeEnabled={planModeEnabled}
                      editingModeAvailable={editingModeAvailable}
                      editingModeEnabled={editingModeEnabled}
                      onToggleEditingMode={handleToggleEditingMode}
                      primaryAction={composerAction}
                      onChangeDraft={setDraft}
                      onSubmit={handleSend}
                      onStop={handleStop}
                      onResume={handleResume}
                      onTogglePlanMode={handleTogglePlanMode}
                      onOpenChatReferences={
                        contextPickerAvailable && composerOptions.interaction.attachment.chatRecords
                          ? handleOpenContextPicker
                          : undefined
                      }
                      onOpenKbaseReferences={
                        contextPickerAvailable && composerOptions.interaction.attachment.kbases
                          ? () => {
                              setContextPickerKind('kbase');
                              setContextPickerOpen(true);
                            }
                          : undefined
                      }
                      onSelectAttachment={handleSelectAttachment}
                      onRemoveAttachment={handleRemoveAttachment}
                      onRetryAttachment={handleRetryAttachment}
                      onUpdateSelectionAnnotation={pendingSteer ? undefined : updateSelectionAnnotation}
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

      <ChatArtifactDrawer
        key={conversationId}
        visible={isArtifactDrawerOpen}
        artifacts={artifacts}
        onClose={handleCloseArtifactDrawer}
      />

      <CopyToast trigger={copyToastTrigger} />
      {passiveAwaiting?.isOverlayVisible && isInitialContentReady ? (
        <ChatAwaitingOverlay awaiting={passiveAwaiting} onDismiss={handleDismissAwaitingOverlay} />
      ) : null}
    </View>
  );
  return (
    <ConversationPreviewProvider
      scopeKey={conversationId}
      store={conversationPreviewStore}
      onCopyText={handleCopyMessage}
    >
      <ConversationViewScope.Provider value={conversationId}>
        <AuthenticatedResourcePreviewProvider key={conversationId} conversationId={conversationId}>
          {content}
        </AuthenticatedResourcePreviewProvider>
      </ConversationViewScope.Provider>
    </ConversationPreviewProvider>
  );
}
