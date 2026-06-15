import { memo, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { formatChatDetailDuration, formatChatDetailTimestamp } from '../chatDetailFormatters';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';
import { ChatTimelineRail } from './ChatTimelineRail';
import { RuntimeTimelineRow } from './RuntimeTimelineRow';

type ChatTimelineListProps = {
  timelineState: ChatTimelineState;
  onCopyText: (text: string) => void;
  onReaskMessage?: (target: ChatTimelineReaskTarget, node: ChatTimelineMessageNode) => void;
  reaskCurrentDisabled?: boolean;
  reaskNewConversationDisabled?: boolean;
};

const SCROLL_TO_END_BUTTON_THRESHOLD = 96;
const REASK_MENU_WIDTH = 188;
const REASK_MENU_HEIGHT = 100;
const REASK_MENU_MARGIN = 8;
const REASK_MENU_GAP = 6;

type ChatTimelineReaskTarget = 'current' | 'new';

type ReaskAnchorMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

type ReaskMenuState = {
  node: ChatTimelineMessageNode;
  anchor: ReaskAnchorMetrics;
};

type ReaskAnchorRef = RefObject<View | null>;

type OpenReaskMenu = (node: ChatTimelineMessageNode, anchorRef: ReaskAnchorRef) => void;

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

function getReaskMenuPosition(anchor: ReaskAnchorMetrics) {
  const maxLeft = Math.max(REASK_MENU_MARGIN, anchor.viewportWidth - REASK_MENU_WIDTH - REASK_MENU_MARGIN);
  const left = Math.min(Math.max(REASK_MENU_MARGIN, anchor.x + anchor.width - REASK_MENU_WIDTH), maxLeft);
  const belowTop = anchor.y + anchor.height + REASK_MENU_GAP;
  const maxTop = Math.max(REASK_MENU_MARGIN, anchor.viewportHeight - REASK_MENU_HEIGHT - REASK_MENU_MARGIN);
  const aboveTop = anchor.y - REASK_MENU_HEIGHT - REASK_MENU_GAP;
  const top = belowTop <= maxTop ? belowTop : Math.max(REASK_MENU_MARGIN, Math.min(aboveTop, maxTop));

  return { left, top };
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

const MessageReaskButton = memo(function MessageReaskButton({
  node,
  onOpenMenu
}: {
  node: ChatTimelineMessageNode;
  onOpenMenu?: OpenReaskMenu;
}) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const buttonRef = useRef<View | null>(null);
  const disabled =
    !onOpenMenu ||
    node.deliveryStatus === 'pending' ||
    (!String(node.content || '').trim() && (node.attachments || []).length === 0);
  const handlePress = useCallback(() => {
    if (!disabled && onOpenMenu) {
      onOpenMenu(node, buttonRef);
    }
  }, [disabled, node, onOpenMenu]);

  return (
    <Pressable
      ref={buttonRef}
      accessibilityLabel={t('timeline.reask')}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.copyButton,
        disabled && styles.copyButtonDisabled,
        pressed && styles.copyButtonPressed
      ]}
    >
      <AppIcon
        usage="timeline.reask"
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
  onCopyText,
  reaskNode,
  onOpenReaskMenu
}: {
  text: string;
  timestamp: string;
  errorReason?: string | null;
  align?: 'end' | 'spread';
  onCopyText: (text: string) => void;
  reaskNode?: ChatTimelineMessageNode;
  onOpenReaskMenu?: OpenReaskMenu;
}) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={[styles.messageFooter, align === 'end' && styles.messageFooterEnd]}>
      <View style={styles.footerActions}>
        <MessageCopyButton text={text} onCopyText={onCopyText} />
        {reaskNode ? <MessageReaskButton node={reaskNode} onOpenMenu={onOpenReaskMenu} /> : null}
      </View>
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
  onCopyText,
  onOpenReaskMenu
}: {
  node: ChatTimelineMessageNode;
  onCopyText: (text: string) => void;
  onOpenReaskMenu?: OpenReaskMenu;
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
        <MessageFooter
          text={node.content}
          timestamp={timestamp}
          align="end"
          onCopyText={onCopyText}
          reaskNode={node}
          onOpenReaskMenu={onOpenReaskMenu}
        />
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
  const duration = footer ? formatChatDetailDuration(footer.durationMs) : '';
  const footerMeta = timestamp && duration ? `${timestamp} · ${duration}` : timestamp || duration;

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
            timestamp={footerMeta}
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

const ReaskMenuOption = memo(function ReaskMenuOption({
  label,
  iconUsage,
  disabled,
  onPress
}: {
  label: string;
  iconUsage: 'timeline.reask' | 'timeline.reaskNewConversation';
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.reaskMenuOption,
        disabled ? styles.reaskMenuOptionDisabled : null,
        pressed && !disabled ? styles.reaskMenuOptionPressed : null
      ]}
    >
      <AppIcon usage={iconUsage} color={disabled ? theme.colors.textTertiary : theme.colors.textPrimary} />
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.reaskMenuOptionText, disabled ? styles.reaskMenuOptionTextDisabled : null]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const ReaskMenuOverlay = memo(function ReaskMenuOverlay({
  menu,
  currentDisabled,
  newConversationDisabled,
  onClose,
  onCurrent,
  onNewConversation
}: {
  menu: ReaskMenuState;
  currentDisabled: boolean;
  newConversationDisabled: boolean;
  onClose: () => void;
  onCurrent: () => void;
  onNewConversation: () => void;
}) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const position = getReaskMenuPosition(menu.anchor);

  return (
    <View pointerEvents="box-none" style={styles.reaskMenuOverlay}>
      <Pressable accessibilityLabel={t('timeline.closeReaskMenu')} style={styles.reaskMenuBackdrop} onPress={onClose} />
      <View style={[styles.reaskMenu, position]}>
        <ReaskMenuOption
          label={t('timeline.reaskCurrent')}
          iconUsage="timeline.reask"
          disabled={currentDisabled}
          onPress={onCurrent}
        />
        <ReaskMenuOption
          label={t('timeline.reaskNewConversation')}
          iconUsage="timeline.reaskNewConversation"
          disabled={newConversationDisabled}
          onPress={onNewConversation}
        />
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
    previousFooter?.durationMs === nextFooter?.durationMs &&
    previousFooter?.errorReason === nextFooter?.errorReason
  );
}

const TimelineRow = memo(
  function TimelineRow({
    item,
    onCopyText,
    onOpenReaskMenu,
    getInitialRuntimeExpanded,
    onRuntimeExpandedChange
  }: {
    item: ChatTimelineDisplayItem;
    onCopyText: (text: string) => void;
    onOpenReaskMenu?: OpenReaskMenu;
    getInitialRuntimeExpanded: (nodeId: string, fallback: boolean) => boolean;
    onRuntimeExpandedChange: (nodeId: string, expanded: boolean) => void;
  }) {
    const node = item.node;
    if (item.kind === 'user-query' && node.kind === 'message') {
      return <UserQueryRow node={node} onCopyText={onCopyText} onOpenReaskMenu={onOpenReaskMenu} />;
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
    prev.onOpenReaskMenu === next.onOpenReaskMenu &&
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

export const ChatTimelineList = memo(function ChatTimelineList({
  timelineState,
  onCopyText,
  onReaskMessage,
  reaskCurrentDisabled = false,
  reaskNewConversationDisabled = false
}: ChatTimelineListProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const threadRef = useRef<View | null>(null);
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
  const reaskMenuRef = useRef<ReaskMenuState | null>(null);
  const [showScrollToEnd, setShowScrollToEnd] = useState(false);
  const [reaskMenu, setReaskMenuState] = useState<ReaskMenuState | null>(null);
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
  const closeReaskMenu = useCallback(() => {
    if (!reaskMenuRef.current) {
      return;
    }
    reaskMenuRef.current = null;
    setReaskMenuState(null);
  }, []);
  const handleOpenReaskMenu = useCallback(
    (node: ChatTimelineMessageNode, anchorRef: ReaskAnchorRef) => {
      if (!onReaskMessage || !anchorRef.current || !threadRef.current) {
        return;
      }

      const root = threadRef.current;
      const anchor = anchorRef.current;
      root.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
        if (rootWidth <= 0 || rootHeight <= 0) {
          return;
        }

        anchor.measureInWindow((x, y, width, height) => {
          if (width <= 0 || height <= 0) {
            return;
          }

          const nextMenu = {
            node,
            anchor: {
              x: x - rootX,
              y: y - rootY,
              width,
              height,
              viewportWidth: rootWidth,
              viewportHeight: rootHeight
            }
          };
          reaskMenuRef.current = nextMenu;
          setReaskMenuState(nextMenu);
        });
      });
    },
    [onReaskMessage]
  );
  const handleCurrentReask = useCallback(() => {
    const node = reaskMenu?.node;
    closeReaskMenu();
    if (node && onReaskMessage && !reaskCurrentDisabled) {
      onReaskMessage('current', node);
    }
  }, [closeReaskMenu, onReaskMessage, reaskCurrentDisabled, reaskMenu]);
  const handleNewConversationReask = useCallback(() => {
    const node = reaskMenu?.node;
    closeReaskMenu();
    if (node && onReaskMessage && !reaskNewConversationDisabled) {
      onReaskMessage('new', node);
    }
  }, [closeReaskMenu, onReaskMessage, reaskMenu, reaskNewConversationDisabled]);
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
        onOpenReaskMenu={onReaskMessage ? handleOpenReaskMenu : undefined}
        getInitialRuntimeExpanded={getInitialRuntimeExpanded}
        onRuntimeExpandedChange={handleRuntimeExpandedChange}
      />
    ),
    [getInitialRuntimeExpanded, handleOpenReaskMenu, handleRuntimeExpandedChange, onCopyText, onReaskMessage]
  );
  const handleScrollToEnd = useCallback(() => {
    closeReaskMenu();
    pendingAutoFollowRef.current = true;
    followTimelineEnd(true);
  }, [closeReaskMenu, followTimelineEnd]);
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
      closeReaskMenu();
      hasUserScrolledRef.current = true;
      updateMetricsFromScrollEvent(event);
    },
    [closeReaskMenu, updateMetricsFromScrollEvent]
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
    <View ref={threadRef} style={styles.thread}>
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

      {reaskMenu && onReaskMessage ? (
        <ReaskMenuOverlay
          menu={reaskMenu}
          currentDisabled={reaskCurrentDisabled}
          newConversationDisabled={reaskNewConversationDisabled}
          onClose={closeReaskMenu}
          onCurrent={handleCurrentReask}
          onNewConversation={handleNewConversationReask}
        />
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
      alignItems: 'flex-end'
    },
    userBubble: {
      maxWidth: '100%',
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
      alignSelf: 'flex-end',
      justifyContent: 'flex-end'
    },
    footerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2
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
    reaskMenuOverlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 60
    },
    reaskMenuBackdrop: {
      ...StyleSheet.absoluteFill
    },
    reaskMenu: {
      position: 'absolute',
      width: REASK_MENU_WIDTH,
      minHeight: REASK_MENU_HEIGHT,
      paddingVertical: 6,
      borderRadius: appVisualTokens.radii.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.line,
      shadowColor: theme.colors.shadow,
      shadowOffset: {
        width: 0,
        height: 10
      },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 4
    },
    reaskMenuOption: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14
    },
    reaskMenuOptionDisabled: {
      opacity: 0.45
    },
    reaskMenuOptionPressed: {
      backgroundColor: theme.colors.surfaceMuted
    },
    reaskMenuOptionText: {
      flex: 1,
      minWidth: 0,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    reaskMenuOptionTextDisabled: {
      color: theme.colors.textTertiary
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
