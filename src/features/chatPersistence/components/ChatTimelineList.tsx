import { memo, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlashList, type FlashListRef, type ViewToken } from '@shopify/flash-list';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle
} from 'react-native';

import { ConversationMarkdownRenderer } from '../../../shared/components/ConversationMarkdownRenderer';
import {
  ConversationPreviewProvider,
  ConversationPreviewRowScope,
} from '../../../shared/components/conversationPreview/ConversationPreviewProvider';
import { createConversationPreviewVisibilityStore } from '../../../shared/components/conversationPreview/visibilityStore';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { appVisualTokens } from '../../../shared/visual/foundation';
import {
  buildChatTimelineDisplayModel,
  getChatTimelineDisplayItemType,
  type ChatTimelineAssistantReplyFooterDisplayItem,
  type ChatTimelineAwaitingNode,
  type ChatTimelineDisplayModel,
  type ChatTimelineDisplayItem,
  type ChatTimelineDisplayTailSignature,
  type ChatTimelineMessageNode,
  type ChatTimelineTextNode,
  type ChatTimelineState
} from '../../chatTimeline/index.ts';
import { formatChatDetailDuration, formatChatDetailTimestamp } from '../chatDetailFormatters';
import { ArtifactTimelineRow } from './ArtifactTimelineRow.tsx';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';
import { ConversationContentRenderer } from '../conversationViewport/ConversationContentRenderer';
import { ChatSystemAlert } from './ChatSystemAlert';
import { ChatTimelineRail } from './ChatTimelineRail';
import {
  PlanningActionPill,
  type RuntimePlanningBlockMode,
  type RuntimePlanningCollapseOverlayRequest,
} from './RuntimePlanningBlock';
import { RuntimeTimelineRow } from './RuntimeTimelineRow';
import { SourceTimelineRow } from './SourceTimelineRow';

type ChatTimelineListProps = {
  timelineState: ChatTimelineState;
  emptyState?: ReactNode;
  diagnosticCard?: ReactNode;
  diagnosticVersion?: string;
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
const TIMELINE_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1, minimumViewTime: 80 };
const THREAD_CLASS = 'flex-1';
const THREAD_SCROLLER_STYLE = { flex: 1 } satisfies ViewStyle;
const TIMELINE_LIST_STYLE = {
  paddingHorizontal: appVisualTokens.spacing.md,
  paddingTop: appVisualTokens.spacing.sm,
  paddingBottom: appVisualTokens.spacing.lg,
} satisfies ViewStyle;
const THREAD_EMPTY_STATE_CLASS = 'items-center gap-app-sm pt-[88px]';
const THREAD_EMPTY_STATE_TITLE_CLASS = 'text-[18px] font-bold text-app-primary';
const THREAD_EMPTY_STATE_BODY_CLASS = 'text-[15px] leading-[22px] text-app-secondary';
const DIAGNOSTIC_FOOTER_CLASS = 'pt-app-sm';
const ICON_BUTTON_CLASS = 'h-[28px] w-[28px] items-center justify-center rounded-app-sm active:opacity-[0.7]';
const ICON_BUTTON_DISABLED_CLASS = 'opacity-[0.45]';
const META_TEXT_CLASS = 'text-[12px] font-medium text-app-tertiary';
const ERROR_TEXT_CLASS = 'shrink text-[12px] font-semibold text-app-danger';
const USER_BUBBLE_CLASS = 'max-w-full rounded-[16px] rounded-br-[8px] bg-app-action px-[14px] py-[10px]';
const USER_ATTACHMENT_PANEL_CLASS = 'max-w-full self-end';
const USER_ATTACHMENT_PANEL_AFTER_TEXT_CLASS = 'mt-[6px]';
const CONTENT_BLOCK_CLASS = 'self-stretch';
const AWAITING_ANSWER_BLOCK_CLASS = 'self-stretch';
const AWAITING_ANSWER_HEADER_CLASS = 'min-h-[28px] flex-row items-center gap-[7px]';
const AWAITING_ANSWER_HEADER_PRESSABLE_CLASS = 'min-h-[28px] flex-row items-center gap-[7px] active:opacity-[0.72]';
const AWAITING_ANSWER_TITLE_CLASS = 'min-w-0 flex-1 text-[14px] font-bold leading-5 text-app-primary';
const AWAITING_ANSWER_FOLD_BUTTON_CLASS = 'h-[28px] w-[28px] items-center justify-center rounded-app-sm';
const AWAITING_ANSWER_DETAILS_CLASS = 'mt-2 gap-[13px]';
const AWAITING_ANSWER_ITEM_CLASS = 'gap-1';
const AWAITING_ANSWER_QUESTION_CLASS = 'text-[14px] font-bold leading-5 text-app-secondary';
const AWAITING_ANSWER_VALUE_CLASS = 'text-[15px] font-extrabold leading-[22px] text-app-primary';
const REQUEST_MESSAGE_STACK_CLASS = 'max-w-[82%] items-stretch self-start';
const REQUEST_BUBBLE_CLASS = 'rounded-[16px] rounded-tl-[8px] bg-app-action px-[14px] py-[10px]';
const REASK_MENU_OVERLAY_CLASS = 'absolute inset-0 z-[60]';
const REASK_MENU_BACKDROP_CLASS = 'absolute inset-0';
const REASK_MENU_CLASS =
  'absolute min-h-[100px] w-[188px] rounded-app-md border border-app-line bg-app-surface py-[6px]';
const REASK_MENU_OPTION_CLASS =
  'min-h-[44px] flex-row items-center gap-[10px] px-[14px] active:bg-app-surface-muted';
const REASK_MENU_OPTION_DISABLED_CLASS = 'opacity-[0.45]';
const REASK_MENU_OPTION_TEXT_CLASS = 'min-w-0 flex-1 text-[16px] font-bold leading-[22px] text-app-primary';
const REASK_MENU_OPTION_TEXT_DISABLED_CLASS = 'text-app-tertiary';
const SCROLL_TO_END_BUTTON_CLASS =
  'absolute bottom-app-md left-1/2 -ml-[22px] h-11 w-11 items-center justify-center rounded-app-pill border border-app-line bg-app-surface active:opacity-[0.72]';
const PLANNING_COLLAPSE_BUTTON_CLASS = 'absolute bottom-app-md right-app-md z-40';
const REQUEST_BUBBLE_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.1,
  shadowRadius: 14,
  elevation: 2,
} satisfies ViewStyle;
const REASK_MENU_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 4,
} satisfies ViewStyle;
const SCROLL_TO_END_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
} satisfies ViewStyle;
const TIMELINE_LAYOUT_STYLES = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  userMessageStack: {
    maxWidth: '78%',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 16,
  },
  assistantFooterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: -16,
    marginBottom: 16,
  },
  assistantFooterRailSpacer: {
    width: 18,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
  },
  messageFooter: {
    minHeight: 28,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.sm,
  },
  messageFooterEnd: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  footerMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: appVisualTokens.spacing.sm,
  },
  footerMetaEnd: {
    flex: 0,
  },
});
const MESSAGE_FOOTER_END_STYLE = StyleSheet.compose(
  TIMELINE_LAYOUT_STYLES.messageFooter,
  TIMELINE_LAYOUT_STYLES.messageFooterEnd
);
const FOOTER_META_END_STYLE = StyleSheet.compose(
  TIMELINE_LAYOUT_STYLES.footerMeta,
  TIMELINE_LAYOUT_STYLES.footerMetaEnd
);

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

type PlanningCollapseOverlayState = RuntimePlanningCollapseOverlayRequest & {
  nodeId: string;
};

type ReaskAnchorRef = RefObject<View | null>;

type OpenReaskMenu = (node: ChatTimelineMessageNode, anchorRef: ReaskAnchorRef) => void;

const keyExtractor = (item: ChatTimelineDisplayItem) => item.key;

function getPlanningNodeIdFromItem(item: ChatTimelineDisplayItem | null | undefined): string | null {
  if (!item || item.kind === 'assistant-reply-footer') {
    return null;
  }
  return item.node.kind === 'planning' ? item.node.id : null;
}

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

  return (
    <View className={THREAD_EMPTY_STATE_CLASS}>
      <Text allowFontScaling={false} className={THREAD_EMPTY_STATE_TITLE_CLASS}>
        {t('timeline.empty.title')}
      </Text>
      <Text allowFontScaling={false} className={THREAD_EMPTY_STATE_BODY_CLASS}>
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
      className={cn(ICON_BUTTON_CLASS, disabled ? ICON_BUTTON_DISABLED_CLASS : null)}
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
      className={cn(ICON_BUTTON_CLASS, disabled ? ICON_BUTTON_DISABLED_CLASS : null)}
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
  const messageFooterStyle = align === 'end' ? MESSAGE_FOOTER_END_STYLE : TIMELINE_LAYOUT_STYLES.messageFooter;
  const footerMetaStyle = align === 'end' ? FOOTER_META_END_STYLE : TIMELINE_LAYOUT_STYLES.footerMeta;

  return (
    <View style={messageFooterStyle}>
      <View style={TIMELINE_LAYOUT_STYLES.footerActions}>
        <MessageCopyButton text={text} onCopyText={onCopyText} />
        {reaskNode ? <MessageReaskButton node={reaskNode} onOpenMenu={onOpenReaskMenu} /> : null}
      </View>
      <View style={footerMetaStyle}>
        {timestamp ? (
          <Text allowFontScaling={false} className={META_TEXT_CLASS} ellipsizeMode="tail" numberOfLines={1}>
            {timestamp}
          </Text>
        ) : null}
        {errorReason ? (
          <Text allowFontScaling={false} className={ERROR_TEXT_CLASS} ellipsizeMode="tail" numberOfLines={1}>
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
  const t = useT();
  const timestamp = formatChatDetailTimestamp(
    node.createdAt,
    Date.now(),
    t('chatDetail.timestamp.today'),
    t('chatDetail.timestamp.yesterday')
  );
  const text = node.content.trim();
  const attachments = node.attachments || [];

  return (
    <View style={TIMELINE_LAYOUT_STYLES.userRow}>
      <View style={TIMELINE_LAYOUT_STYLES.userMessageStack}>
        {text ? (
          <View className={USER_BUBBLE_CLASS}>
            <ConversationMarkdownRenderer
              markdown={node.content}
              selectable={false}
              textColor={theme.colors.onBrandBlueAction}
              linkColor={theme.colors.onBrandBlueAction}
            />
          </View>
        ) : null}
        {attachments.length > 0 ? (
          <View className={cn(USER_ATTACHMENT_PANEL_CLASS, text ? USER_ATTACHMENT_PANEL_AFTER_TEXT_CLASS : null)}>
            <ChatAttachmentStrip attachments={attachments} variant="message" />
          </View>
        ) : null}
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
  const text = node.body || node.title;

  return (
    <View style={TIMELINE_LAYOUT_STYLES.timelineRow}>
      <ChatTimelineRail
        iconUsage="timeline.requestRail"
        terminal={isLastInRun}
        toneColor={theme.colors.brandBlue}
      />
      <View style={TIMELINE_LAYOUT_STYLES.timelineBody}>
        <View className={REQUEST_MESSAGE_STACK_CLASS}>
          <View className={REQUEST_BUBBLE_CLASS} style={[REQUEST_BUBBLE_ELEVATION_STYLE, { shadowColor: theme.colors.shadow }]}>
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
  isLastInRun
}: {
  node: ChatTimelineMessageNode;
  isLastInRun: boolean;
}) {
  const { theme } = useAppTheme();

  return (
    <View style={TIMELINE_LAYOUT_STYLES.timelineRow}>
      <ChatTimelineRail
        iconUsage="timeline.assistantContentRail"
        terminal={isLastInRun}
        toneColor={theme.colors.success}
      />
      <View style={TIMELINE_LAYOUT_STYLES.timelineBody}>
        <View className={CONTENT_BLOCK_CLASS}>
          <ConversationContentRenderer markdown={node.content} streaming={node.streaming} />
        </View>
      </View>
    </View>
  );
});

const AssistantReplyFooterRow = memo(function AssistantReplyFooterRow({
  item,
  onCopyText
}: {
  item: ChatTimelineAssistantReplyFooterDisplayItem;
  onCopyText: (text: string) => void;
}) {
  const t = useT();
  const footer = item.footer;
  const timestamp = formatChatDetailTimestamp(
    footer.timestamp,
    Date.now(),
    t('chatDetail.timestamp.today'),
    t('chatDetail.timestamp.yesterday')
  );
  const duration = formatChatDetailDuration(footer.durationMs, t);
  const footerMeta = timestamp && duration ? `${timestamp} · ${duration}` : timestamp || duration;

  return (
    <View style={TIMELINE_LAYOUT_STYLES.assistantFooterRow}>
      <View style={TIMELINE_LAYOUT_STYLES.assistantFooterRailSpacer} />
      <View style={TIMELINE_LAYOUT_STYLES.timelineBody}>
        <MessageFooter
          text={footer.copyText}
          timestamp={footerMeta}
          errorReason={footer.errorReason}
          onCopyText={onCopyText}
        />
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
      <Text allowFontScaling={false} numberOfLines={1} className={AWAITING_ANSWER_TITLE_CLASS}>
        {summary?.title || t('timeline.answerSubmitted')}
      </Text>
      {canExpand ? (
        <View className={AWAITING_ANSWER_FOLD_BUTTON_CLASS}>
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={TIMELINE_LAYOUT_STYLES.timelineRow}>
      <ChatTimelineRail
        iconUsage="runtime.awaiting"
        terminal={isLastInRun}
        toneColor={theme.colors.warning}
      />
      <View style={TIMELINE_LAYOUT_STYLES.timelineBody}>
        <View className={AWAITING_ANSWER_BLOCK_CLASS}>
          {canExpand ? (
            <Pressable
              accessibilityLabel={expanded ? t('timeline.collapseAnswer') : t('timeline.expandAnswer')}
              accessibilityRole="button"
              onPress={handleToggle}
              className={AWAITING_ANSWER_HEADER_PRESSABLE_CLASS}
            >
              {headerContent}
            </Pressable>
          ) : (
            <View className={AWAITING_ANSWER_HEADER_CLASS}>{headerContent}</View>
          )}

          {expanded && canExpand ? (
            <View className={AWAITING_ANSWER_DETAILS_CLASS}>
              {summary?.items.map((item, index) => (
                <View key={item.key} className={AWAITING_ANSWER_ITEM_CLASS}>
                  <Text allowFontScaling={false} className={AWAITING_ANSWER_QUESTION_CLASS}>
                    {item.title || t('awaiting.answer.fallbackTitle', { count: index + 1 })}
                  </Text>
                  <Text allowFontScaling={false} className={AWAITING_ANSWER_VALUE_CLASS}>
                    {item.value || t('awaiting.answer.empty')}
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

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(REASK_MENU_OPTION_CLASS, disabled ? REASK_MENU_OPTION_DISABLED_CLASS : null)}
    >
      <AppIcon usage={iconUsage} color={disabled ? theme.colors.textTertiary : theme.colors.textPrimary} />
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        className={cn(REASK_MENU_OPTION_TEXT_CLASS, disabled ? REASK_MENU_OPTION_TEXT_DISABLED_CLASS : null)}
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
  const { theme } = useAppTheme();
  const position = getReaskMenuPosition(menu.anchor);

  return (
    <View pointerEvents="box-none" className={REASK_MENU_OVERLAY_CLASS}>
      <Pressable accessibilityLabel={t('timeline.closeReaskMenu')} className={REASK_MENU_BACKDROP_CLASS} onPress={onClose} />
      <View className={REASK_MENU_CLASS} style={[REASK_MENU_ELEVATION_STYLE, { shadowColor: theme.colors.shadow }, position]}>
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

function areDisplayItemNodesEqual(previous: ChatTimelineDisplayItem, next: ChatTimelineDisplayItem): boolean {
  if (previous.kind === 'assistant-reply-footer' || next.kind === 'assistant-reply-footer') {
    return previous.kind === next.kind;
  }
  return previous.node === next.node;
}

function areAssistantReplyFooterItemsEqual(previous: ChatTimelineDisplayItem, next: ChatTimelineDisplayItem): boolean {
  if (previous.kind !== 'assistant-reply-footer' || next.kind !== 'assistant-reply-footer') {
    return true;
  }
  const previousFooter = previous.footer;
  const nextFooter = next.footer;
  return (
    previous.runId === next.runId &&
    previousFooter.copyText === nextFooter.copyText &&
    previousFooter.timestamp === nextFooter.timestamp &&
    previousFooter.durationMs === nextFooter.durationMs &&
    previousFooter.errorReason === nextFooter.errorReason
  );
}

function areDisplayItemGroupFieldsEqual(previous: ChatTimelineDisplayItem, next: ChatTimelineDisplayItem): boolean {
  if (previous.kind === 'assistant-reply-footer' || next.kind === 'assistant-reply-footer') {
    return previous.kind === next.kind;
  }
  return (
    previous.isFirstInRun === next.isFirstInRun &&
    previous.isLastInRun === next.isLastInRun &&
    previous.groupIndex === next.groupIndex
  );
}

const TimelineRow = memo(
  function TimelineRow({
    item,
    onCopyText,
    onOpenReaskMenu,
    getInitialRuntimeExpanded,
    onRuntimeExpandedChange,
    getInitialPlanningMode,
    onPlanningCollapseOverlayChange,
    onPlanningModeChange
  }: {
    item: ChatTimelineDisplayItem;
    onCopyText: (text: string) => void;
    onOpenReaskMenu?: OpenReaskMenu;
    getInitialRuntimeExpanded: (nodeId: string, fallback: boolean) => boolean;
    onRuntimeExpandedChange: (nodeId: string, expanded: boolean) => void;
    getInitialPlanningMode: (nodeId: string) => RuntimePlanningBlockMode;
    onPlanningCollapseOverlayChange: (nodeId: string, overlay: RuntimePlanningCollapseOverlayRequest | null) => void;
    onPlanningModeChange: (nodeId: string, mode: RuntimePlanningBlockMode) => void;
  }) {
    if (item.kind === 'assistant-reply-footer') {
      return <AssistantReplyFooterRow item={item} onCopyText={onCopyText} />;
    }
    const node = item.node;
    if (item.kind === 'user-query' && node.kind === 'message') {
      return <UserQueryRow node={node} onCopyText={onCopyText} onOpenReaskMenu={onOpenReaskMenu} />;
    }
    if (item.kind === 'assistant-content' && node.kind === 'message') {
      return (
        <AssistantContentRow
          node={node}
          isLastInRun={item.isLastInRun}
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
    if (item.kind === 'source' && node.kind === 'source') {
      return (
        <SourceTimelineRow
          node={node}
          isLastInRun={item.isLastInRun}
          getInitialExpanded={getInitialRuntimeExpanded}
          onExpandedChange={onRuntimeExpandedChange}
        />
      );
    }
    if (item.kind === 'artifact' && node.kind === 'artifact') {
      return <ArtifactTimelineRow node={node} isLastInRun={item.isLastInRun} />;
    }
    if (item.kind === 'request' && node.kind === 'request') {
      return <RequestInputRow node={node} isLastInRun={item.isLastInRun} />;
    }
    if (item.kind === 'system-message' && node.kind === 'message') {
      return <ChatSystemAlert node={node} isLastInRun={item.isLastInRun} />;
    }
    return (
      <RuntimeTimelineRow
        item={item}
        onCopyText={onCopyText}
        getInitialExpanded={getInitialRuntimeExpanded}
        onExpandedChange={onRuntimeExpandedChange}
        getInitialPlanningMode={getInitialPlanningMode}
        onPlanningCollapseOverlayChange={onPlanningCollapseOverlayChange}
        onPlanningModeChange={onPlanningModeChange}
      />
    );
  },
  (prev, next) =>
    prev.onCopyText === next.onCopyText &&
    prev.onOpenReaskMenu === next.onOpenReaskMenu &&
    prev.getInitialRuntimeExpanded === next.getInitialRuntimeExpanded &&
    prev.onRuntimeExpandedChange === next.onRuntimeExpandedChange &&
    prev.getInitialPlanningMode === next.getInitialPlanningMode &&
    prev.onPlanningCollapseOverlayChange === next.onPlanningCollapseOverlayChange &&
    prev.onPlanningModeChange === next.onPlanningModeChange &&
    prev.item.key === next.item.key &&
    prev.item.kind === next.item.kind &&
    areDisplayItemNodesEqual(prev.item, next.item) &&
    areToolGroupNodesEqual(prev.item, next.item) &&
    areAssistantReplyFooterItemsEqual(prev.item, next.item) &&
    areDisplayItemGroupFieldsEqual(prev.item, next.item)
);

export const ChatTimelineList = memo(function ChatTimelineList({
  timelineState,
  emptyState = null,
  diagnosticCard = null,
  diagnosticVersion = '',
  onCopyText,
  onReaskMessage,
  reaskCurrentDisabled = false,
  reaskNewConversationDisabled = false
}: ChatTimelineListProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const threadRef = useRef<View | null>(null);
  const listRef = useRef<FlashListRef<ChatTimelineDisplayItem>>(null);
  const displayModelRef = useRef<ChatTimelineDisplayModel | null>(null);
  const previewVisibilityStore = useMemo(() => createConversationPreviewVisibilityStore(), []);
  const expandedRuntimeNodesRef = useRef(new Map<string, boolean>());
  const planningBlockModesRef = useRef(new Map<string, RuntimePlanningBlockMode>());
  const planningCollapseOverlayRef = useRef<PlanningCollapseOverlayState | null>(null);
  const viewablePlanningNodeIdsRef = useRef(new Set<string>());
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0
  });
  const viewportHeightRef = useRef(0);
  const isFollowingEndRef = useRef(true);
  const hasUserScrolledRef = useRef(false);
  const pendingAutoFollowRef = useRef(true);
  const pendingAutoFollowClearFrameRef = useRef<number | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const showScrollToEndRef = useRef(false);
  const tailSignatureRef = useRef<ChatTimelineDisplayTailSignature | null>(null);
  const reaskMenuRef = useRef<ReaskMenuState | null>(null);
  const [showScrollToEnd, setShowScrollToEnd] = useState(false);
  const [planningCollapseOverlay, setPlanningCollapseOverlay] = useState<PlanningCollapseOverlayState | null>(null);
  const [planningCollapseOverlayVisible, setPlanningCollapseOverlayVisible] = useState(false);
  const [reaskMenu, setReaskMenuState] = useState<ReaskMenuState | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const displayModel = useMemo(() => {
    const nextModel = buildChatTimelineDisplayModel(timelineState, displayModelRef.current);
    displayModelRef.current = nextModel;
    return nextModel;
  }, [timelineState]);
  const items = displayModel.items;
  const tailSignature = displayModel.tailSignature;
  const hasCustomEmptyState = Boolean(emptyState);
  const timelineListStyle = useMemo(
    () => [
      TIMELINE_LIST_STYLE,
      hasCustomEmptyState && items.length === 0 && viewportHeight > 0
        ? {
            minHeight: viewportHeight,
            justifyContent: 'center' as const,
            paddingBottom: Math.round(viewportHeight * 0.16),
          }
        : null,
    ],
    [hasCustomEmptyState, items.length, viewportHeight]
  );
  const emptyStateElement = useMemo(
    () => (emptyState ? <>{emptyState}</> : <ThreadEmptyState />),
    [emptyState]
  );
  const diagnosticFooter = useMemo(
    () => (diagnosticCard ? <View className={DIAGNOSTIC_FOOTER_CLASS}>{diagnosticCard}</View> : null),
    [diagnosticCard]
  );
  const listExtraData = useMemo(
    () => ({ revision: timelineState.revision, diagnosticVersion }),
    [diagnosticVersion, timelineState.revision]
  );
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
  const getInitialPlanningMode = useCallback((nodeId: string) => {
    return planningBlockModesRef.current.get(nodeId) ?? 'preview';
  }, []);
  const handlePlanningModeChange = useCallback((nodeId: string, mode: RuntimePlanningBlockMode) => {
    planningBlockModesRef.current.set(nodeId, mode);
  }, []);
  const applyPlanningCollapseOverlay = useCallback((nextOverlay: PlanningCollapseOverlayState | null) => {
    planningCollapseOverlayRef.current = nextOverlay;
    setPlanningCollapseOverlay(nextOverlay);
    const viewablePlanningNodeIds = viewablePlanningNodeIdsRef.current;
    setPlanningCollapseOverlayVisible(
      Boolean(
        nextOverlay &&
          (viewablePlanningNodeIds.size === 0 || viewablePlanningNodeIds.has(nextOverlay.nodeId))
      )
    );
  }, []);
  const handlePlanningCollapseOverlayChange = useCallback(
    (nodeId: string, overlay: RuntimePlanningCollapseOverlayRequest | null) => {
      const currentOverlay = planningCollapseOverlayRef.current;
      if (!overlay) {
        if (currentOverlay?.nodeId === nodeId) {
          applyPlanningCollapseOverlay(null);
        }
        return;
      }

      applyPlanningCollapseOverlay({ nodeId, ...overlay });
    },
    [applyPlanningCollapseOverlay]
  );
  const renderItem = useCallback(
    ({ item }: { item: ChatTimelineDisplayItem }) => (
      <ConversationPreviewRowScope rowKey={item.key}>
        <TimelineRow
          item={item}
          onCopyText={onCopyText}
          onOpenReaskMenu={onReaskMessage ? handleOpenReaskMenu : undefined}
          getInitialRuntimeExpanded={getInitialRuntimeExpanded}
          onRuntimeExpandedChange={handleRuntimeExpandedChange}
          getInitialPlanningMode={getInitialPlanningMode}
          onPlanningCollapseOverlayChange={handlePlanningCollapseOverlayChange}
          onPlanningModeChange={handlePlanningModeChange}
        />
      </ConversationPreviewRowScope>
    ),
    [
      getInitialPlanningMode,
      getInitialRuntimeExpanded,
      handlePlanningCollapseOverlayChange,
      handleOpenReaskMenu,
      handlePlanningModeChange,
      handleRuntimeExpandedChange,
      onCopyText,
      onReaskMessage,
    ]
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
      const nextViewportHeight = event.nativeEvent.layout.height;
      if (Math.abs(viewportHeightRef.current - nextViewportHeight) > 1) {
        viewportHeightRef.current = nextViewportHeight;
        setViewportHeight(nextViewportHeight);
      }

      const wasFollowingEnd = isFollowingEndRef.current || isNearTimelineEnd(scrollMetricsRef.current);
      scrollMetricsRef.current.viewportHeight = nextViewportHeight;
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
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatTimelineDisplayItem>[] }) => {
      const nextViewablePlanningNodeIds = new Set<string>();
      const nextViewablePreviewRowKeys = new Set<string>();
      viewableItems.forEach((token) => {
        if (token.isViewable && token.item?.key) {
          nextViewablePreviewRowKeys.add(token.item.key);
        }
        const nodeId = getPlanningNodeIdFromItem(token.item);
        if (nodeId) {
          nextViewablePlanningNodeIds.add(nodeId);
        }
      });
      previewVisibilityStore.replaceVisibleRows(nextViewablePreviewRowKeys);
      viewablePlanningNodeIdsRef.current = nextViewablePlanningNodeIds;

      const activeNodeId = planningCollapseOverlayRef.current?.nodeId;
      const nextVisible = Boolean(activeNodeId && nextViewablePlanningNodeIds.has(activeNodeId));
      setPlanningCollapseOverlayVisible((currentVisible) =>
        currentVisible === nextVisible ? currentVisible : nextVisible
      );
    },
    [previewVisibilityStore]
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

  useLayoutEffect(() => {
    if (!diagnosticVersion) {
      return;
    }
    pendingAutoFollowRef.current = true;
    schedulePendingAutoFollowReset();
  }, [diagnosticVersion, schedulePendingAutoFollowReset]);

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
    <ConversationPreviewProvider store={previewVisibilityStore} onCopyText={onCopyText}>
      <View ref={threadRef} className={THREAD_CLASS}>
      <FlashList
        ref={listRef}
        data={items}
        extraData={listExtraData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={THREAD_SCROLLER_STYLE}
        contentContainerStyle={timelineListStyle}
        showsVerticalScrollIndicator={false}
        drawDistance={620}
        getItemType={getChatTimelineDisplayItemType}
        ListEmptyComponent={emptyStateElement}
        ListFooterComponent={diagnosticFooter}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        onScrollEndDrag={updateMetricsFromScrollEvent}
        onMomentumScrollEnd={updateMetricsFromScrollEvent}
        onViewableItemsChanged={handleViewableItemsChanged}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        viewabilityConfig={TIMELINE_VIEWABILITY_CONFIG}
        scrollEventThrottle={64}
      />

      {showScrollToEnd ? (
        <Pressable
          accessibilityLabel={t('timeline.scrollToEnd')}
          accessibilityRole="button"
          onPress={handleScrollToEnd}
          className={SCROLL_TO_END_BUTTON_CLASS}
          style={[SCROLL_TO_END_ELEVATION_STYLE, { shadowColor: theme.colors.shadow }]}
        >
          <AppIcon usage="timeline.scrollToEnd" />
        </Pressable>
      ) : null}

      {planningCollapseOverlay && planningCollapseOverlayVisible ? (
        <View pointerEvents="box-none" className={PLANNING_COLLAPSE_BUTTON_CLASS}>
          <PlanningActionPill
            accessibilityLabel={planningCollapseOverlay.label}
            iconColor={theme.colors.onBrandBlueAction}
            iconUsage="runtime.planCollapse"
            label={planningCollapseOverlay.label}
            onPress={planningCollapseOverlay.onPress}
          />
        </View>
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
    </ConversationPreviewProvider>
  );
});
