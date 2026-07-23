import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type Insets,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { appVisualTokens } from '../../../shared/visual/foundation';
import { appHairlineStyles } from '../../../shared/visual/hairline';
import {
  CHAT_HISTORY_DRAWER_GEOMETRY,
  getChatDrawerHiddenOffset,
  getChatDrawerPanelWidth,
} from '../chatDrawerOverlayGeometry.ts';
import { resolveChatConversationDisplayTitle } from '../chatConversationTitle.ts';
import { formatChatDetailTimestamp } from '../chatDetailFormatters';
import type { ChatHomeItem } from '../types';

const HISTORY_ROW_HEIGHT = 66;
const HISTORY_DRAW_DISTANCE = HISTORY_ROW_HEIGHT * 8;
const HISTORY_DRAWER_OVERLAY_Z_INDEX = 1000;
const HISTORY_DRAWER_VERTICAL_PADDING = appVisualTokens.spacing.xs;
const HISTORY_DRAWER_BOTTOM_PADDING = appVisualTokens.spacing.md;
const HISTORY_DRAWER_EXIT_DURATION_MS = 150;
const DRAWER_OVERLAY_CLASS = 'absolute inset-0 z-[1000]';
const DRAWER_OVERLAY_ELEVATION_STYLE = { elevation: HISTORY_DRAWER_OVERLAY_Z_INDEX } satisfies ViewStyle;
const DRAWER_BACKDROP_CLASS = 'absolute inset-0 bg-app-overlay';
const DRAWER_PANEL_CLASS = 'absolute bottom-0 right-0 top-0 border-app-line bg-app-surface';
const DRAWER_HEADER_CLASS = 'min-h-[58px] flex-row items-center gap-app-sm border-app-line px-app-md pb-app-sm';
const DRAWER_HEADER_TEXT_CLASS = 'min-w-0 flex-1';
const DRAWER_TITLE_CLASS = 'text-app-title-sm font-bold text-app-primary';
const DRAWER_SUBTITLE_CLASS = 'mt-[2px] text-[12px] font-semibold leading-[17px] text-app-secondary';
const DRAWER_CLOSE_BUTTON_CLASS = 'h-[34px] w-[34px] items-center justify-center rounded-app-pill';
const MARK_READ_BUTTON_CLASS =
  'h-8 min-w-[86px] flex-row items-center justify-center gap-app-xs rounded-app-pill bg-app-brand-blue-soft px-app-sm active:opacity-[0.7]';
const MARK_READ_TEXT_CLASS = 'text-[12px] font-bold leading-[17px] text-app-brand-blue';
const DRAWER_ERROR_TEXT_CLASS = 'px-app-md py-app-sm text-[12px] leading-[17px] text-app-danger';
const HISTORY_LIST_FRAME_CLASS = 'flex-1 px-app-sm';
const HISTORY_STATE_BLOCK_CLASS = 'flex-1 items-center justify-center';
const DRAWER_EMPTY_TEXT_CLASS = 'px-app-sm py-app-lg text-[14px] leading-[21px] text-app-secondary';
const HISTORY_ROW_CLASS = 'h-[66px] flex-row items-center gap-app-sm border-app-line px-app-sm active:bg-app-surface-muted';
const HISTORY_ROW_ACTIVE_CLASS = 'bg-app-brand-blue-soft';
const HISTORY_UNREAD_SLOT_CLASS = 'w-[10px] items-center';
const HISTORY_UNREAD_DOT_CLASS = 'h-2 w-2 rounded-app-pill bg-app-badge';
const HISTORY_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 justify-center';
const HISTORY_TITLE_CLASS = 'text-app-body-sm font-bold text-app-primary';
const HISTORY_TIME_CLASS =
  'w-[112px] shrink-0 text-right text-app-caption font-semibold tabular-nums text-app-secondary';
const HISTORY_FOOTER_TEXT_CLASS = 'py-app-md text-center text-app-footnote font-semibold text-app-tertiary';
const LOAD_MORE_BUTTON_CLASS = 'min-h-[44px] items-center justify-center active:opacity-[0.7]';
const LOAD_MORE_TEXT_CLASS = 'text-app-footnote font-bold text-app-secondary';
const ROW_PRESS_RETENTION_VERTICAL_OFFSET = 20;

type ChatDetailHistoryDrawerProps = {
  visible: boolean;
  activeConversationId: string;
  historyItems: ChatHomeItem[];
  total: number;
  unreadTotal: number;
  loading: boolean;
  loadingMore: boolean;
  markingRead: boolean;
  errorText: string;
  hasMore: boolean;
  onClose: () => void;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
  onSelectConversation: (item: ChatHomeItem) => void;
};

type HistoryRowProps = {
  item: ChatHomeItem;
  active: boolean;
  pressRetentionOffset: Insets;
  onSelect: (item: ChatHomeItem) => void;
};

function formatHistoryCountLabel(total: number, unreadTotal: number, t: TFunction) {
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  const safeUnreadTotal = Math.max(0, Math.trunc(Number(unreadTotal) || 0));
  return safeUnreadTotal > 0
    ? t('history.countUnread', { count: safeTotal, unread: safeUnreadTotal })
    : t('history.count', { count: safeTotal });
}

function getHistoryItemType() {
  return 'history-row';
}

const HistoryRow = memo(function HistoryRow({ item, active, pressRetentionOffset, onSelect }: HistoryRowProps) {
  const t = useT();
  const unread = item.unreadCount > 0;
  const timestamp = formatChatDetailTimestamp(
    item.lastMessageAt,
    Date.now(),
    t('chatDetail.timestamp.today'),
    t('chatDetail.timestamp.yesterday')
  );
  const handlePress = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      pressRetentionOffset={pressRetentionOffset}
      onPress={handlePress}
      className={cn(HISTORY_ROW_CLASS, active ? HISTORY_ROW_ACTIVE_CLASS : null)}
      style={appHairlineStyles.borderBottom}
    >
      <View className={HISTORY_UNREAD_SLOT_CLASS}>{unread ? <View className={HISTORY_UNREAD_DOT_CLASS} /> : null}</View>
      <View className={HISTORY_TEXT_BLOCK_CLASS}>
        <Text numberOfLines={1} className={HISTORY_TITLE_CLASS}>
          {resolveChatConversationDisplayTitle(item.title)}
        </Text>
      </View>
      <Text allowFontScaling={false} numberOfLines={1} className={HISTORY_TIME_CLASS}>
        {timestamp}
      </Text>
    </Pressable>
  );
});

export const ChatDetailHistoryDrawer = memo(function ChatDetailHistoryDrawer({
  visible,
  activeConversationId,
  historyItems,
  total,
  unreadTotal,
  loading,
  loadingMore,
  markingRead,
  errorText,
  hasMore,
  onClose,
  onLoadMore,
  onMarkAllRead,
  onSelectConversation
}: ChatDetailHistoryDrawerProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const hiddenTranslateX = getChatDrawerHiddenOffset(windowWidth, 'right', CHAT_HISTORY_DRAWER_GEOMETRY);
  const panelWidth = getChatDrawerPanelWidth(windowWidth, CHAT_HISTORY_DRAWER_GEOMETRY);
  const translateX = useRef(new Animated.Value(hiddenTranslateX)).current;
  const [shouldRender, setShouldRender] = useState(visible);
  const countLabel = useMemo(() => formatHistoryCountLabel(total, unreadTotal, t), [total, unreadTotal, t]);
  const rowPressRetentionOffset = useMemo(
    () => ({
      bottom: ROW_PRESS_RETENTION_VERTICAL_OFFSET,
      left: panelWidth,
      right: panelWidth,
      top: ROW_PRESS_RETENTION_VERTICAL_OFFSET,
    }),
    [panelWidth]
  );
  const renderHistoryItem = useCallback(
    ({ item }: { item: ChatHomeItem }) => (
      <HistoryRow
        item={item}
        active={item.conversationId === activeConversationId}
        pressRetentionOffset={rowPressRetentionOffset}
        onSelect={onSelectConversation}
      />
    ),
    [activeConversationId, onSelectConversation, rowPressRetentionOffset]
  );
  const keyExtractor = useCallback((item: ChatHomeItem) => item.conversationId, []);
  const footer = useMemo(() => {
    if (loading || historyItems.length <= 0) {
      return null;
    }

    if (!hasMore) {
      return <Text className={HISTORY_FOOTER_TEXT_CLASS}>{countLabel}</Text>;
    }

    return (
      <Pressable
        accessibilityRole="button"
        disabled={loadingMore}
        onPress={onLoadMore}
        className={LOAD_MORE_BUTTON_CLASS}
      >
        {loadingMore ? (
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
        ) : (
          <Text className={LOAD_MORE_TEXT_CLASS}>{t('history.loadMore', { count: countLabel })}</Text>
        )}
      </Pressable>
    );
  }, [countLabel, hasMore, historyItems.length, loading, loadingMore, onLoadMore, t, theme.colors.brandBlue]);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    if (visible) {
      translateX.setValue(hiddenTranslateX);
      const animation = Animated.spring(translateX, {
        toValue: 0,
        damping: 20,
        stiffness: 230,
        mass: 0.9,
        useNativeDriver: true
      });

      animation.start();
      return () => animation.stop();
    }

    const animation = Animated.timing(translateX, {
      toValue: hiddenTranslateX,
      duration: HISTORY_DRAWER_EXIT_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    });

    animation.start(({ finished }) => {
      if (finished) {
        setShouldRender(false);
      }
    });
    return () => animation.stop();
  }, [hiddenTranslateX, shouldRender, translateX, visible]);

  if (!shouldRender) {
    return null;
  }

  return (
    <View pointerEvents="box-none" className={DRAWER_OVERLAY_CLASS} style={DRAWER_OVERLAY_ELEVATION_STYLE}>
      <Pressable className={DRAWER_BACKDROP_CLASS} onPressIn={onClose} onPress={onClose} />
      <Animated.View
        className={DRAWER_PANEL_CLASS}
        style={[
          appHairlineStyles.borderLeft,
          {
            paddingTop: Math.max(insets.top, HISTORY_DRAWER_VERTICAL_PADDING),
            paddingBottom: Math.max(insets.bottom, HISTORY_DRAWER_BOTTOM_PADDING),
            width: panelWidth,
            transform: [{ translateX }]
          }
        ]}
      >
        <View className={DRAWER_HEADER_CLASS} style={appHairlineStyles.borderBottom}>
          <View className={DRAWER_HEADER_TEXT_CLASS}>
            <Text className={DRAWER_TITLE_CLASS}>{t('history.title')}</Text>
            <Text className={DRAWER_SUBTITLE_CLASS}>{countLabel}</Text>
          </View>
          {unreadTotal > 0 ? (
            <Pressable
              accessibilityLabel={t('history.markAllRead')}
              accessibilityRole="button"
              disabled={markingRead}
              onPress={onMarkAllRead}
              className={MARK_READ_BUTTON_CLASS}
            >
              {markingRead ? (
                <ActivityIndicator size="small" color={theme.colors.brandBlue} />
              ) : (
                <>
                  <AppIcon usage="historyDrawer.markAllRead" />
                  <Text className={MARK_READ_TEXT_CLASS}>{t('history.markAllRead')}</Text>
                </>
              )}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={t('history.close')}
            accessibilityRole="button"
            onPressIn={onClose}
            onPress={onClose}
            className={DRAWER_CLOSE_BUTTON_CLASS}
          >
            <AppIcon usage="historyDrawer.close" />
          </Pressable>
        </View>

        {errorText ? <Text className={DRAWER_ERROR_TEXT_CLASS}>{errorText}</Text> : null}

        <View className={HISTORY_LIST_FRAME_CLASS}>
          {loading ? (
            <View className={HISTORY_STATE_BLOCK_CLASS}>
              <ActivityIndicator size="small" color={theme.colors.brandBlue} />
            </View>
          ) : (
            <FlashList
              data={historyItems}
              renderItem={renderHistoryItem}
              keyExtractor={keyExtractor}
              drawDistance={HISTORY_DRAW_DISTANCE}
              getItemType={getHistoryItemType}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text className={DRAWER_EMPTY_TEXT_CLASS}>{t('history.empty')}</Text>}
              ListFooterComponent={footer}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
});
