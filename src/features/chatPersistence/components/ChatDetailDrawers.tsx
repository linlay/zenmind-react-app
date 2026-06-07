import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { appVisualTokens } from '../../../shared/visual/foundation';
import { formatChatDetailTimestamp } from '../chatDetailFormatters';
import type { ChatHomeItem } from '../types';

const HISTORY_ROW_HEIGHT = 66;
const HISTORY_DRAW_DISTANCE = HISTORY_ROW_HEIGHT * 8;
const HISTORY_DRAWER_OVERLAY_Z_INDEX = 120;
const HISTORY_DRAWER_VERTICAL_PADDING = appVisualTokens.spacing.xs;

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
  onSelect: (item: ChatHomeItem) => void;
};

function formatHistoryCountLabel(total: number, unreadTotal: number) {
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  const safeUnreadTotal = Math.max(0, Math.trunc(Number(unreadTotal) || 0));
  return safeUnreadTotal > 0
    ? `共 ${safeTotal} 条，未读 ${safeUnreadTotal} 条`
    : `共 ${safeTotal} 条`;
}

function getHistoryItemType() {
  return 'history-row';
}

const HistoryRow = memo(function HistoryRow({ item, active, onSelect }: HistoryRowProps) {
  const unread = item.unreadCount > 0;
  const handlePress = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.historyRow,
        active ? styles.historyRowActive : null,
        pressed ? styles.historyRowPressed : null,
      ]}
    >
      <View style={styles.historyUnreadSlot}>
        {unread ? <View style={styles.historyUnreadDot} /> : null}
      </View>
      <View style={styles.historyTextBlock}>
        <Text numberOfLines={1} style={styles.historyTitle}>
          {item.title || item.conversationId}
        </Text>
        <Text numberOfLines={1} style={styles.historyPreview}>
          {item.lastMessageText || '暂无消息'}
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.historyTime}>
        {formatChatDetailTimestamp(item.lastMessageAt)}
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
  onSelectConversation,
}: ChatDetailHistoryDrawerProps) {
  const translateX = useRef(new Animated.Value(48)).current;
  const countLabel = useMemo(
    () => formatHistoryCountLabel(total, unreadTotal),
    [total, unreadTotal]
  );
  const renderHistoryItem = useCallback(
    ({ item }: { item: ChatHomeItem }) => (
      <HistoryRow
        item={item}
        active={item.conversationId === activeConversationId}
        onSelect={onSelectConversation}
      />
    ),
    [activeConversationId, onSelectConversation]
  );
  const keyExtractor = useCallback((item: ChatHomeItem) => item.conversationId, []);
  const footer = useMemo(() => {
    if (loading || historyItems.length <= 0) {
      return null;
    }

    if (!hasMore) {
      return <Text style={styles.historyFooterText}>{countLabel}</Text>;
    }

    return (
      <Pressable
        accessibilityRole="button"
        disabled={loadingMore}
        onPress={onLoadMore}
        style={({ pressed }) => [
          styles.loadMoreButton,
          pressed && !loadingMore ? styles.loadMoreButtonPressed : null,
        ]}
      >
        {loadingMore ? (
          <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
        ) : (
          <Text style={styles.loadMoreText}>查看更多（{countLabel}）</Text>
        )}
      </Pressable>
    );
  }, [countLabel, hasMore, historyItems.length, loading, loadingMore, onLoadMore]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateX.setValue(48);
    Animated.spring(translateX, {
      toValue: 0,
      damping: 18,
      stiffness: 220,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [translateX, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.drawerOverlay}>
      <Pressable style={styles.drawerBackdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.drawerPanel,
          {
            paddingTop: HISTORY_DRAWER_VERTICAL_PADDING,
            paddingBottom: appVisualTokens.spacing.md,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={styles.drawerHeader}>
          <View style={styles.drawerHeaderText}>
            <Text style={styles.drawerTitle}>历史会话</Text>
            <Text style={styles.drawerSubtitle}>{countLabel}</Text>
          </View>
          {unreadTotal > 0 ? (
            <Pressable
              accessibilityLabel="一键已读"
              accessibilityRole="button"
              disabled={markingRead}
              onPress={onMarkAllRead}
              style={({ pressed }) => [
                styles.markReadButton,
                pressed && !markingRead ? styles.markReadButtonPressed : null,
              ]}
            >
              {markingRead ? (
                <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
              ) : (
                <>
                  <AppIcon usage="historyDrawer.markAllRead" />
                  <Text style={styles.markReadText}>一键已读</Text>
                </>
              )}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="关闭历史会话"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.drawerCloseButton}
          >
            <AppIcon usage="historyDrawer.close" />
          </Pressable>
        </View>

        {errorText ? <Text style={styles.drawerErrorText}>{errorText}</Text> : null}

        <View style={styles.historyListFrame}>
          {loading ? (
            <View style={styles.historyStateBlock}>
              <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
            </View>
          ) : (
            <FlashList
              data={historyItems}
              renderItem={renderHistoryItem}
              keyExtractor={keyExtractor}
              drawDistance={HISTORY_DRAW_DISTANCE}
              getItemType={getHistoryItemType}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={<Text style={styles.drawerEmptyText}>暂无历史会话</Text>}
              ListFooterComponent={footer}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  drawerOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    zIndex: HISTORY_DRAWER_OVERLAY_Z_INDEX,
    elevation: HISTORY_DRAWER_OVERLAY_Z_INDEX,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appVisualTokens.colors.overlay,
  },
  drawerPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '84%',
    maxWidth: 360,
    backgroundColor: appVisualTokens.colors.surface,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: appVisualTokens.colors.line,
  },
  drawerHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingBottom: appVisualTokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
  },
  drawerHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  drawerTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  drawerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: appVisualTokens.colors.textSecondary,
  },
  drawerCloseButton: {
    width: 34,
    height: 34,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markReadButton: {
    height: 32,
    minWidth: 86,
    borderRadius: appVisualTokens.radii.pill,
    paddingHorizontal: appVisualTokens.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
  },
  markReadButtonPressed: {
    opacity: 0.7,
  },
  markReadText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlue,
  },
  drawerErrorText: {
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingVertical: appVisualTokens.spacing.sm,
    fontSize: 12,
    lineHeight: 17,
    color: appVisualTokens.colors.danger,
  },
  historyListFrame: {
    flex: 1,
    paddingHorizontal: appVisualTokens.spacing.sm,
  },
  historyStateBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerEmptyText: {
    paddingHorizontal: appVisualTokens.spacing.sm,
    paddingVertical: appVisualTokens.spacing.lg,
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary,
  },
  historyRow: {
    height: HISTORY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appVisualTokens.colors.line,
    paddingHorizontal: appVisualTokens.spacing.sm,
  },
  historyRowActive: {
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
  },
  historyRowPressed: {
    backgroundColor: appVisualTokens.colors.surfaceMuted,
  },
  historyUnreadSlot: {
    width: 10,
    alignItems: 'center',
  },
  historyUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.badge,
  },
  historyTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  historyTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  historyPreview: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: appVisualTokens.colors.textSecondary,
  },
  historyTime: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: appVisualTokens.colors.textSecondary,
  },
  historyFooterText: {
    paddingVertical: appVisualTokens.spacing.md,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: appVisualTokens.colors.textTertiary,
  },
  loadMoreButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreButtonPressed: {
    opacity: 0.7,
  },
  loadMoreText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
  },
});
