import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';

import { ConversationMarkdownRenderer } from '../../../shared/components/ConversationMarkdownRenderer';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import {
  buildChatTimelineDisplayModel,
  getChatTimelineDisplayItemType,
  type ChatTimelineAssistantReplyFooter,
  type ChatTimelineAwaitingNode,
  type ChatTimelineDisplayModel,
  type ChatTimelineDisplayItem,
  type ChatTimelineDisplayTailSignature,
  type ChatTimelineMessageNode,
  type ChatTimelineTextNode,
  type ChatTimelineState
} from '../../chatTimeline/index.ts';
import { formatChatDetailTimestamp } from '../chatDetailFormatters';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';
import { ChatTimelineRail } from './ChatTimelineRail';
import { RuntimeTimelineRow } from './RuntimeTimelineRow';

type ChatTimelineListProps = {
  timelineState: ChatTimelineState;
  onCopyText: (text: string) => void;
};

const SCROLL_TO_END_BUTTON_THRESHOLD = 96;

const keyExtractor = (item: ChatTimelineDisplayItem) => item.key;

type TimelineScrollMetrics = {
  contentHeight: number;
  offsetY: number;
  viewportHeight: number;
};

function getDistanceFromEnd(metrics: TimelineScrollMetrics): number {
  return Math.max(0, metrics.contentHeight - metrics.viewportHeight - metrics.offsetY);
}

function isNearTimelineEnd(metrics: TimelineScrollMetrics): boolean {
  return (
    metrics.viewportHeight <= 0 ||
    metrics.contentHeight <= metrics.viewportHeight ||
    getDistanceFromEnd(metrics) <= SCROLL_TO_END_BUTTON_THRESHOLD
  );
}

function didTimelineTailAdvance(
  previous: ChatTimelineDisplayTailSignature | null,
  next: ChatTimelineDisplayTailSignature | null
): boolean {
  if (!next) {
    return false;
  }
  if (!previous) {
    return true;
  }
  return (
    previous.key !== next.key ||
    previous.contentLength !== next.contentLength ||
    previous.lifecycle !== next.lifecycle ||
    previous.streaming !== next.streaming ||
    previous.updatedAt !== next.updatedAt
  );
}

function isTimelineScrollable(metrics: TimelineScrollMetrics): boolean {
  return metrics.viewportHeight > 0 && metrics.contentHeight > metrics.viewportHeight;
}

function ThreadEmptyState() {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.threadEmptyState}>
      <Text allowFontScaling={false} style={styles.threadEmptyStateTitle}>
        {t('timeline.empty.title')}
      </Text>
      <Text allowFontScaling={false} style={styles.threadEmptyStateBody}>
        {t('timeline.empty.body')}
      </Text>
    </View>
  );
}

const MessageCopyButton = memo(function MessageCopyButton({
  text,
  onCopyText
}: {
  text: string;
  onCopyText: (text: string) => void;
}) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const disabled = text.length <= 0;
  const handleCopy = useCallback(() => {
    if (!disabled) {
      onCopyText(text);
    }
  }, [disabled, onCopyText, text]);

  return (
    <Pressable
      accessibilityLabel={t('timeline.copy')}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={handleCopy}
      style={({ pressed }) => [
        styles.copyButton,
        disabled && styles.copyButtonDisabled,
        pressed && styles.copyButtonPressed
      ]}
    >
      <AppIcon
        usage="timeline.copy"
        color={disabled ? theme.colors.textTertiary : theme.colors.textSecondary}
      />
    </Pressable>
  );
});

const MessageFooter = memo(function MessageFooter({
  text,
  timestamp,
  errorReason = '',
  align = 'spread',
  onCopyText
}: {
  text: string;
  timestamp: string;
  errorReason?: string | null;
  align?: 'end' | 'spread';
  onCopyText: (text: string) => void;
}) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={[styles.messageFooter, align === 'end' && styles.messageFooterEnd]}>
      <MessageCopyButton text={text} onCopyText={onCopyText} />
      <View style={[styles.footerMeta, align === 'end' && styles.footerMetaEnd]}>
        {timestamp ? (
          <Text allowFontScaling={false} style={styles.metaText}>
            {timestamp}
          </Text>
        ) : null}
        {errorReason ? (
          <Text allowFontScaling={false} numberOfLines={1} style={styles.errorText}>
            {errorReason}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const UserQueryRow = memo(function UserQueryRow({
  node,
  onCopyText
}: {
  node: ChatTimelineMessageNode;
  onCopyText: (text: string) => void;
}) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const timestamp = formatChatDetailTimestamp(node.createdAt);

  return (
    <View style={styles.userRow}>
      <View style={styles.userMessageStack}>
        <View style={styles.userBubble}>
          {node.content.trim() ? (
            <ConversationMarkdownRenderer
              markdown={node.content}
              selectable={false}
              textColor={theme.colors.onBrandBlueAction}
              linkColor={theme.colors.onBrandBlueAction}
            />
          ) : null}
          <ChatAttachmentStrip attachments={node.attachments || []} variant="message" />
        </View>
        <MessageFooter text={node.content} timestamp={timestamp} align="end" onCopyText={onCopyText} />
      </View>
    </View>
  );
});

const RequestInputRow = memo(function RequestInputRow({
  node,
  isLastInRun
}: {
  node: ChatTimelineTextNode;
  isLastInRun: boolean;
}) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const text = node.body || node.title;

  return (
    <View style={styles.timelineRow}>
      <ChatTimelineRail
        iconUsage="timeline.requestRail"
        terminal={isLastInRun}
        toneColor={theme.colors.brandBlue}
      />
      <View style={styles.timelineBody}>
        <View style={styles.requestMessageStack}>
          <View style={styles.requestBubble}>
            <ConversationMarkdownRenderer
              markdown={text}
              selectable={false}
              textColor={theme.colors.onBrandBlueAction}
              linkColor={theme.colors.onBrandBlueAction}
            />
          </View>
        </View>
      </View>
    </View>
  );
});

const AssistantContentRow = memo(function AssistantContentRow({
  node,
  footer,
  isLastInRun,
  onCopyText
}: {
  node: ChatTimelineMessageNode;
  footer?: ChatTimelineAssistantReplyFooter | null;
  isLastInRun: boolean;
  onCopyText: (text: string) => void;
}) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const timestamp = footer ? formatChatDetailTimestamp(footer.timestamp) : '';

  return (
    <View style={styles.timelineRow}>
      <ChatTimelineRail
        iconUsage="timeline.assistantContentRail"
        terminal={isLastInRun}
        toneColor={theme.colors.success}
      />
      <View style={styles.timelineBody}>
        <View style={styles.contentBlock}>
          <ConversationMarkdownRenderer markdown={node.content} streaming={node.streaming} />
        </View>
        {footer ? (
          <MessageFooter
            text={footer.copyText}
            timestamp={timestamp}
            errorReason={footer.errorReason}
            onCopyText={onCopyText}
          />
        ) : null}
      </View>
    </View>
  );
});

const AwaitingAnswerTimelineRow = memo(function AwaitingAnswerTimelineRow({
  node,
  isLastInRun,
  getInitialExpanded,
  onExpandedChange
}: {
  node: ChatTimelineAwaitingNode;
  isLastInRun: boolean;
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
}) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const summary = node.answerSummary;
  const canExpand = Boolean(summary?.items.length);
  const [expanded, setExpanded] = useState(() => getInitialExpanded(node.id, false));

  useEffect(() => {
    setExpanded(getInitialExpanded(node.id, false));
  }, [getInitialExpanded, node.id]);

  const handleToggle = useCallback(() => {
    if (!canExpand) {
      return;
    }

    setExpanded((value) => {
      const nextValue = !value;
      onExpandedChange(node.id, nextValue);
      return nextValue;
    });
  }, [canExpand, node.id, onExpandedChange]);

  const headerContent = (
    <>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.awaitingAnswerTitle}>
        {summary?.title || t('timeline.answerSubmitted')}
      </Text>
      {canExpand ? (
        <View style={styles.awaitingAnswerFoldButton}>
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.timelineRow}>
      <ChatTimelineRail
        iconUsage="runtime.awaiting"
        terminal={isLastInRun}
        toneColor={theme.colors.warning}
      />
      <View style={styles.timelineBody}>
        <View style={styles.awaitingAnswerBlock}>
          {canExpand ? (
            <Pressable
              accessibilityLabel={expanded ? t('timeline.collapseAnswer') : t('timeline.expandAnswer')}
              accessibilityRole="button"
              onPress={handleToggle}
              style={({ pressed }) => [styles.awaitingAnswerHeader, pressed && styles.rowPressed]}
            >
              {headerContent}
            </Pressable>
          ) : (
            <View style={styles.awaitingAnswerHeader}>{headerContent}</View>
          )}

          {expanded && canExpand ? (
            <View style={styles.awaitingAnswerDetails}>
              {summary?.items.map((item) => (
                <View key={item.key} style={styles.awaitingAnswerItem}>
                  <Text allowFontScaling={false} style={styles.awaitingAnswerQuestion}>
                    {item.title}
                  </Text>
                  <Text allowFontScaling={false} style={styles.awaitingAnswerValue}>
                    {item.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
});

function areToolGroupNodesEqual(previous: ChatTimelineDisplayItem, next: ChatTimelineDisplayItem): boolean {
  if (previous.kind !== 'tool-group' || next.kind !== 'tool-group') {
    return true;
  }
  if (previous.nodes.length !== next.nodes.length) {
    return false;
  }
  return previous.nodes.every((node, index) => node === next.nodes[index]);
}

function areAssistantReplyFootersEqual(previous: ChatTimelineDisplayItem, next: ChatTimelineDisplayItem): boolean {
  const previousFooter = previous.assistantReplyFooter;
  const nextFooter = next.assistantReplyFooter;
  return (
    previousFooter?.copyText === nextFooter?.copyText &&
    previousFooter?.timestamp === nextFooter?.timestamp &&
    previousFooter?.errorReason === nextFooter?.errorReason
  );
}

const TimelineRow = memo(
  function TimelineRow({
    item,
    onCopyText,
    getInitialRuntimeExpanded,
    onRuntimeExpandedChange
  }: {
    item: ChatTimelineDisplayItem;
    onCopyText: (text: string) => void;
    getInitialRuntimeExpanded: (nodeId: string, fallback: boolean) => boolean;
    onRuntimeExpandedChange: (nodeId: string, expanded: boolean) => void;
  }) {
    const node = item.node;
    if (item.kind === 'user-query' && node.kind === 'message') {
      return <UserQueryRow node={node} onCopyText={onCopyText} />;
    }
    if (item.kind === 'assistant-content' && node.kind === 'message') {
      return (
        <AssistantContentRow
          node={node}
          footer={item.assistantReplyFooter}
          isLastInRun={item.isLastInRun}
          onCopyText={onCopyText}
        />
      );
    }
    if (item.kind === 'awaiting' && node.kind === 'awaiting' && node.answerSummary) {
      return (
        <AwaitingAnswerTimelineRow
          node={node}
          isLastInRun={item.isLastInRun}
          getInitialExpanded={getInitialRuntimeExpanded}
          onExpandedChange={onRuntimeExpandedChange}
        />
      );
    }
    if (item.kind === 'request' && node.kind === 'request') {
      return <RequestInputRow node={node} isLastInRun={item.isLastInRun} />;
    }
    return (
      <RuntimeTimelineRow
        item={item}
        onCopyText={onCopyText}
        getInitialExpanded={getInitialRuntimeExpanded}
        onExpandedChange={onRuntimeExpandedChange}
      />
    );
  },
  (prev, next) =>
    prev.onCopyText === next.onCopyText &&
    prev.getInitialRuntimeExpanded === next.getInitialRuntimeExpanded &&
    prev.onRuntimeExpandedChange === next.onRuntimeExpandedChange &&
    prev.item.key === next.item.key &&
    prev.item.kind === next.item.kind &&
    prev.item.node === next.item.node &&
    areToolGroupNodesEqual(prev.item, next.item) &&
    areAssistantReplyFootersEqual(prev.item, next.item) &&
    prev.item.isFirstInRun === next.item.isFirstInRun &&
    prev.item.isLastInRun === next.item.isLastInRun &&
    prev.item.groupIndex === next.item.groupIndex
);

export const ChatTimelineList = memo(function ChatTimelineList({ timelineState, onCopyText }: ChatTimelineListProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const listRef = useRef<FlashListRef<ChatTimelineDisplayItem>>(null);
  const displayModelRef = useRef<ChatTimelineDisplayModel | null>(null);
  const expandedRuntimeNodesRef = useRef(new Map<string, boolean>());
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0
  });
  const isFollowingEndRef = useRef(true);
  const hasUserScrolledRef = useRef(false);
  const pendingAutoFollowRef = useRef(true);
  const pendingAutoFollowClearFrameRef = useRef<number | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const showScrollToEndRef = useRef(false);
  const tailSignatureRef = useRef<ChatTimelineDisplayTailSignature | null>(null);
  const [showScrollToEnd, setShowScrollToEnd] = useState(false);
  const displayModel = useMemo(() => {
    const nextModel = buildChatTimelineDisplayModel(timelineState, displayModelRef.current);
    displayModelRef.current = nextModel;
    return nextModel;
  }, [timelineState]);
  const items = displayModel.items;
  const tailSignature = displayModel.tailSignature;
  const setScrollToEndVisible = useCallback((visible: boolean) => {
    if (showScrollToEndRef.current !== visible) {
      showScrollToEndRef.current = visible;
      setShowScrollToEnd(visible);
    }
  }, []);
  const updateScrollToEndVisibility = useCallback(() => {
    const metrics = scrollMetricsRef.current;
    const distanceFromEnd = getDistanceFromEnd(scrollMetricsRef.current);
    const shouldShow = isTimelineScrollable(metrics) && distanceFromEnd > SCROLL_TO_END_BUTTON_THRESHOLD;
    setScrollToEndVisible(shouldShow);
  }, [setScrollToEndVisible]);
  const markMetricsAtEnd = useCallback(() => {
    const metrics = scrollMetricsRef.current;
    metrics.offsetY = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
    isFollowingEndRef.current = true;
    setScrollToEndVisible(false);
  }, [setScrollToEndVisible]);
  const scheduleScrollToEnd = useCallback((animated: boolean) => {
    if (pendingScrollFrameRef.current !== null) {
      return;
    }

    pendingScrollFrameRef.current = requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);
  const clearPendingAutoFollowSchedule = useCallback(() => {
    if (pendingAutoFollowClearFrameRef.current !== null) {
      cancelAnimationFrame(pendingAutoFollowClearFrameRef.current);
      pendingAutoFollowClearFrameRef.current = null;
    }
  }, []);
  const schedulePendingAutoFollowReset = useCallback(() => {
    clearPendingAutoFollowSchedule();
    pendingAutoFollowClearFrameRef.current = requestAnimationFrame(() => {
      pendingAutoFollowClearFrameRef.current = requestAnimationFrame(() => {
        pendingAutoFollowClearFrameRef.current = null;
        pendingAutoFollowRef.current = false;
      });
    });
  }, [clearPendingAutoFollowSchedule]);
  const followTimelineEnd = useCallback(
    (animated: boolean) => {
      clearPendingAutoFollowSchedule();
      pendingAutoFollowRef.current = false;
      markMetricsAtEnd();
      scheduleScrollToEnd(animated);
    },
    [clearPendingAutoFollowSchedule, markMetricsAtEnd, scheduleScrollToEnd]
  );
  const getInitialRuntimeExpanded = useCallback((nodeId: string, fallback: boolean) => {
    return expandedRuntimeNodesRef.current.get(nodeId) ?? fallback;
  }, []);
  const handleRuntimeExpandedChange = useCallback((nodeId: string, expanded: boolean) => {
    expandedRuntimeNodesRef.current.set(nodeId, expanded);
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: ChatTimelineDisplayItem }) => (
      <TimelineRow
        item={item}
        onCopyText={onCopyText}
        getInitialRuntimeExpanded={getInitialRuntimeExpanded}
        onRuntimeExpandedChange={handleRuntimeExpandedChange}
      />
    ),
    [getInitialRuntimeExpanded, handleRuntimeExpandedChange, onCopyText]
  );
  const handleScrollToEnd = useCallback(() => {
    pendingAutoFollowRef.current = true;
    followTimelineEnd(true);
  }, [followTimelineEnd]);
  const updateMetricsFromScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      scrollMetricsRef.current = {
        contentHeight: contentSize.height,
        offsetY: contentOffset.y,
        viewportHeight: layoutMeasurement.height
      };
      isFollowingEndRef.current = isNearTimelineEnd(scrollMetricsRef.current);
      updateScrollToEndVisibility();
    },
    [updateScrollToEndVisibility]
  );
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      hasUserScrolledRef.current = true;
      updateMetricsFromScrollEvent(event);
    },
    [updateMetricsFromScrollEvent]
  );
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const wasFollowingEnd = isFollowingEndRef.current || isNearTimelineEnd(scrollMetricsRef.current);
      scrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
      if (wasFollowingEnd) {
        followTimelineEnd(false);
        return;
      }
      updateScrollToEndVisibility();
    },
    [followTimelineEnd, updateScrollToEndVisibility]
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      scrollMetricsRef.current.contentHeight = height;
      const shouldAutoFollow = pendingAutoFollowRef.current;
      clearPendingAutoFollowSchedule();
      pendingAutoFollowRef.current = false;

      if (shouldAutoFollow) {
        followTimelineEnd(false);
        return;
      }
      isFollowingEndRef.current = isNearTimelineEnd(scrollMetricsRef.current);
      updateScrollToEndVisibility();
    },
    [clearPendingAutoFollowSchedule, followTimelineEnd, updateScrollToEndVisibility]
  );

  useLayoutEffect(() => {
    const previousTailSignature = tailSignatureRef.current;
    const tailAdvanced = didTimelineTailAdvance(previousTailSignature, tailSignature);
    if (
      tailAdvanced &&
      (isFollowingEndRef.current || isNearTimelineEnd(scrollMetricsRef.current) || !hasUserScrolledRef.current)
    ) {
      pendingAutoFollowRef.current = true;
      schedulePendingAutoFollowReset();
    }
    tailSignatureRef.current = tailSignature;
  }, [schedulePendingAutoFollowReset, tailSignature]);

  useEffect(() => {
    updateScrollToEndVisibility();
  }, [updateScrollToEndVisibility]);

  useEffect(() => {
    return () => {
      if (pendingScrollFrameRef.current !== null) {
        cancelAnimationFrame(pendingScrollFrameRef.current);
        pendingScrollFrameRef.current = null;
      }
      clearPendingAutoFollowSchedule();
    };
  }, [clearPendingAutoFollowSchedule]);

  return (
    <View style={styles.thread}>
      <FlashList
        ref={listRef}
        data={items}
        extraData={timelineState.revision}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.threadScroller}
        contentContainerStyle={styles.timelineList}
        showsVerticalScrollIndicator={false}
        drawDistance={620}
        getItemType={getChatTimelineDisplayItemType}
        ListEmptyComponent={ThreadEmptyState}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        onScrollEndDrag={updateMetricsFromScrollEvent}
        onMomentumScrollEnd={updateMetricsFromScrollEvent}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        scrollEventThrottle={64}
      />

      {showScrollToEnd ? (
        <Pressable
          accessibilityLabel={t('timeline.scrollToEnd')}
          accessibilityRole="button"
          onPress={handleScrollToEnd}
          style={({ pressed }) => [styles.scrollToEndButton, pressed && styles.rowPressed]}
        >
          <AppIcon usage="timeline.scrollToEnd" />
        </Pressable>
      ) : null}
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    thread: {
      flex: 1
    },
    threadScroller: {
      flex: 1
    },
    timelineList: {
      paddingHorizontal: appVisualTokens.spacing.md,
      paddingTop: appVisualTokens.spacing.sm,
      paddingBottom: appVisualTokens.spacing.lg
    },
    threadEmptyState: {
      paddingTop: 88,
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm
    },
    threadEmptyStateTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    threadEmptyStateBody: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary
    },
    userRow: {
      alignItems: 'flex-end',
      marginBottom: 20
    },
    userMessageStack: {
      maxWidth: '78%',
      alignSelf: 'flex-end',
      alignItems: 'stretch'
    },
    userBubble: {
      borderRadius: 16,
      borderBottomRightRadius: 8,
      backgroundColor: theme.colors.brandBlueAction,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      marginBottom: 16
    },
    timelineBody: {
      flex: 1,
      minWidth: 0
    },
    contentBlock: {
      alignSelf: 'stretch'
    },
    awaitingAnswerBlock: {
      alignSelf: 'stretch'
    },
    awaitingAnswerHeader: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },
    awaitingAnswerTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    awaitingAnswerFoldButton: {
      width: 28,
      height: 28,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center'
    },
    awaitingAnswerDetails: {
      marginTop: 8,
      gap: 13
    },
    awaitingAnswerItem: {
      gap: 4
    },
    awaitingAnswerQuestion: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    awaitingAnswerValue: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    requestMessageStack: {
      maxWidth: '82%',
      alignSelf: 'flex-start',
      alignItems: 'stretch'
    },
    requestBubble: {
      borderRadius: 16,
      borderTopLeftRadius: 8,
      backgroundColor: theme.colors.brandBlueAction,
      paddingHorizontal: 14,
      paddingVertical: 10,
      shadowColor: theme.colors.shadow,
      shadowOffset: {
        width: 0,
        height: 8
      },
      shadowOpacity: 0.1,
      shadowRadius: 14,
      elevation: 2
    },
    messageFooter: {
      minHeight: 28,
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.sm
    },
    messageFooterEnd: {
      justifyContent: 'flex-end'
    },
    copyButton: {
      width: 28,
      height: 28,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center'
    },
    copyButtonDisabled: {
      opacity: 0.45
    },
    copyButtonPressed: {
      opacity: 0.7
    },
    footerMeta: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: appVisualTokens.spacing.sm
    },
    footerMetaEnd: {
      flex: 0
    },
    metaText: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.textTertiary
    },
    errorText: {
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.danger
    },
    rowPressed: {
      opacity: 0.72
    },
    scrollToEndButton: {
      position: 'absolute',
      left: '50%',
      bottom: appVisualTokens.spacing.md,
      width: 44,
      height: 44,
      marginLeft: -22,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.colors.shadow,
      shadowOffset: {
        width: 0,
        height: 8
      },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 3
    }
  });
}
