import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../shared/i18n';
import { useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import type { AppThemeTokens } from '../../shared/visual/foundation';
import { ChatAwaitingOverlay, ChatAwaitingResumeBar } from './components/ChatAwaitingOverlay';
import { ChatAwaitingDock } from './components/awaiting/ChatAwaitingDock';
import { ChatDetailComposerCard } from './components/ChatDetailComposerCard';
import { ChatDetailHistoryDrawer } from './components/ChatDetailDrawers';
import { ChatDetailEmptyState } from './components/ChatDetailEmptyState';
import { ChatDetailHeader } from './components/ChatDetailHeader';
import { ChatTimelineList } from './components/ChatTimelineList';
import { ChatDetailSkeleton } from './components/ChatDetailSkeleton';
import { ChatNewConversationIntro } from './components/ChatNewConversationIntro';
import { CopyToast } from './components/CopyToast';
import { formatChatStatusLabel } from './chatDetailFormatters';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import type { ChatSyncEvent } from '../chatRealtime/types';
import type { AwaitingSubmitPayloadData } from '../../core/api/services/chatApi';
import { getConversationHistorySlice } from './chatRepository';
import type { ChatConversationHistoryScope, ChatDetailRouteParams, ChatHomeItem } from './types';
import { useChatDetailAwaitingOverlay } from './useChatDetailAwaitingOverlay';
import { useChatDetailConversationController } from './useChatDetailConversationController';
import { useChatDetailLocalUiState } from './useChatDetailLocalUiState';

type ChatDetailScreenProps = NativeStackScreenProps<{ ChatDetail: ChatDetailRouteParams }, 'ChatDetail'>;
const IS_IOS = Platform.OS === 'ios';
const KEYBOARD_SHOW_EVENT = IS_IOS ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE_EVENT = IS_IOS ? 'keyboardWillHide' : 'keyboardDidHide';

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
  style: StyleProp<ViewStyle>;
};

function ChatDetailKeyboardAvoider({ children, keyboardVerticalOffset, style }: ChatDetailKeyboardAvoiderProps) {
  const isKeyboardVisible = useKeyboardVisibility();

  return (
    <KeyboardAvoidingView
      style={style}
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
  const styles = useAppThemeStyles(createStyles);
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
  const {
    summary,
    conversationTarget,
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
    composerAction,
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

  return (
    <View style={styles.safeArea}>
      {isInitialContentReady ? (
        summary ? (
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <ChatDetailKeyboardAvoider style={styles.keyboardRoot} keyboardVerticalOffset={IS_IOS ? insets.top : 0}>
              <View style={styles.screen}>
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
                  onReaskMessage={handleReaskMessage}
                  reaskCurrentDisabled={composerAction === 'sending' || Boolean(headerRuntimeState.runAction)}
                  reaskNewConversationDisabled={
                    composerAction === 'sending' || Boolean(headerRuntimeState.runAction) || !historyScope
                  }
                />

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
                    />
                  </>
                )}

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
              </View>
            </ChatDetailKeyboardAvoider>
          </SafeAreaView>
        ) : (
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <ChatDetailEmptyState
              errorText={errorText}
              onBack={handleGoBack}
              onRetry={fromNotification ? handleRetryFromNotification : undefined}
            />
          </SafeAreaView>
        )
      ) : null}

      {isInitialSkeletonVisible ? (
        <Animated.View style={[styles.initialSkeletonOverlay, { opacity: skeletonOverlayOpacity }]}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <ChatDetailSkeleton />
          </SafeAreaView>
        </Animated.View>
      ) : null}

      <CopyToast trigger={copyToastTrigger} />
      {passiveAwaiting?.isOverlayVisible && isInitialContentReady ? (
        <ChatAwaitingOverlay awaiting={passiveAwaiting} onDismiss={handleDismissAwaitingOverlay} />
      ) : null}
    </View>
  );
}

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    keyboardRoot: {
      flex: 1
    },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background
    },
    initialSkeletonOverlay: {
      ...StyleSheet.absoluteFill
    }
  });
}
