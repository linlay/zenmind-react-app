import { useCallback } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import { Animated, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../shared/i18n';
import { appVisualTokens } from '../../shared/visual/foundation';
import { ChatAwaitingOverlay, ChatAwaitingResumeBar } from './components/ChatAwaitingOverlay';
import { ChatAwaitingDock } from './components/awaiting/ChatAwaitingDock';
import { ChatDetailComposerCard } from './components/ChatDetailComposerCard';
import { ChatDetailHistoryDrawer } from './components/ChatDetailDrawers';
import { ChatDetailEmptyState } from './components/ChatDetailEmptyState';
import { ChatDetailHeader } from './components/ChatDetailHeader';
import { ChatTimelineList } from './components/ChatTimelineList';
import { ChatDetailSkeleton } from './components/ChatDetailSkeleton';
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

export function ChatDetailScreen({ navigation, route }: ChatDetailScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const {
    conversationId,
    conversationSubtitle = '',
    initialConversation = null,
    historyScope: routeHistoryScope,
    serverMessageId = '',
    fromNotification = false,
    skipInitialReconcile = false
  } = route.params;
  const {
    summary,
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
    handleStop,
    handleResume,
    handleStartNewConversation,
    handleSelectAttachment,
    handleRemoveAttachment,
    handleRetryAttachment,
    handleRetryFromNotification,
    historyScope
  } = useChatDetailConversationController({
    navigation,
    conversationId,
    conversationSubtitle,
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
  const questionAwaiting = awaitingSummary?.interactive?.kind === 'question' ? awaitingSummary : null;
  const passiveAwaiting = questionAwaiting ? null : awaitingSummary;
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
        initialConversation: item,
        ...(historyScope ? { historyScope } : {})
      });
    },
    [conversationId, conversationSubtitle, handleCloseHistoryDrawer, historyScope, navigation]
  );

  return (
    <View style={styles.safeArea}>
      {isInitialContentReady ? (
        summary ? (
          <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
            <KeyboardAvoidingView
              style={styles.keyboardRoot}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
            >
              <View style={styles.screen}>
                <ChatDetailHeader
                  title={summary.title}
                  subtitle={conversationSubtitle || formatChatStatusLabel(socketStatus, t)}
                  statusLabel={
                    headerRuntimeState.statusTone === 'running'
                      ? t('chatDetail.status.running')
                      : headerRuntimeState.statusTone === 'error'
                        ? t('chatDetail.status.error')
                        : t('chatDetail.status.idle')
                  }
                  statusTone={headerRuntimeState.statusTone}
                  onBack={handleGoBack}
                  onStartNewConversation={handleStartNewConversation}
                  onOpenMenu={handleOpenHistoryDrawer}
                />

                <ChatTimelineList timelineState={timelineState} onCopyText={handleCopyMessage} />

                {questionAwaiting ? (
                  <ChatAwaitingDock awaiting={questionAwaiting} onSubmit={handleSubmitAwaiting} />
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
                      primaryAction={composerAction}
                      usageLabel={headerRuntimeState.usageLabel}
                      usageSummary={headerRuntimeState.usageSummary}
                      onChangeDraft={setDraft}
                      onSubmit={handleSend}
                      onStop={handleStop}
                      onResume={handleResume}
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
            </KeyboardAvoidingView>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.background
  },
  keyboardRoot: {
    flex: 1
  },
  screen: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.background
  },
  initialSkeletonOverlay: {
    ...StyleSheet.absoluteFill
  }
});
