import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { ChatSummary } from '../../../core/types/common';
import { formatChatListTime, getChatLastContent } from '../../../shared/utils/format';

const DRAWER_WIDTH_RATIO = 0.76;
const DRAWER_PREVIEW_VISIBLE_SCREEN_RATIO = 0.2;
const DRAWER_CLOSE_MS = 180;
const DRAWER_PREVIEW_RESET_MS = 140;

interface ChatDetailDrawerProps {
  visible: boolean;
  theme: AppTheme;
  activeAgentName: string;
  chats: ChatSummary[];
  activeChatId: string;
  onClose: () => void;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  previewProgress?: number;
  interactive?: boolean;
}

export function ChatDetailDrawer({
  visible,
  theme,
  activeAgentName,
  chats,
  activeChatId,
  onClose,
  onCreateChat,
  onSelectChat,
  previewProgress = 0,
  interactive = true
}: ChatDetailDrawerProps) {
  const window = useWindowDimensions();
  const openFractionAnim = useRef(new Animated.Value(0)).current;
  const previousVisibleRef = useRef(visible);
  const normalizedPreview = Number.isFinite(previewProgress) ? Math.max(0, Math.min(1, previewProgress)) : 0;
  const prevPreviewRef = useRef(0);
  const gestureActiveRef = useRef(false);
  const allowInteraction = visible && interactive;
  const drawerBackground = theme.surface;
  const cardBackground = theme.mode === 'dark' ? '#182740' : '#f4f7fc';
  const cardActiveBackground = theme.mode === 'dark' ? '#264673' : '#e4eeff';
  const normalizedAgentName = String(activeAgentName || '').trim() || '当前智能体';
  const drawerWidthPx = Math.max(Number(window.width || 0) * DRAWER_WIDTH_RATIO, 0);
  const previewVisiblePx = Math.max(Number(window.width || 0) * DRAWER_PREVIEW_VISIBLE_SCREEN_RATIO, 0);
  const previewMaxOpenFraction = drawerWidthPx > 0 ? Math.max(0, Math.min(1, previewVisiblePx / drawerWidthPx)) : 0;
  const previewOpenFraction = normalizedPreview * previewMaxOpenFraction;

  // Effect 1: gesture-driven preview — only setValue, never timing/spring
  useEffect(() => {
    const prev = prevPreviewRef.current;
    prevPreviewRef.current = normalizedPreview;
    if (visible) {
      gestureActiveRef.current = false;
      return;
    }
    if (normalizedPreview > 0) {
      gestureActiveRef.current = true;
      openFractionAnim.setValue(previewOpenFraction);
      return;
    }
    if (prev > 0 && normalizedPreview === 0) {
      gestureActiveRef.current = false;
      Animated.timing(openFractionAnim, {
        toValue: 0,
        duration: DRAWER_PREVIEW_RESET_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
    }
  }, [normalizedPreview, openFractionAnim, previewOpenFraction, visible]);

  // Effect 2: state-driven open/close — only on visible change
  useEffect(() => {
    const wasVisible = previousVisibleRef.current;
    previousVisibleRef.current = visible;
    if (visible === wasVisible) {
      return;
    }
    openFractionAnim.stopAnimation();
    if (visible) {
      gestureActiveRef.current = false;
      Animated.spring(openFractionAnim, {
        toValue: 1,
        damping: 24,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(openFractionAnim, {
        toValue: 0,
        duration: DRAWER_CLOSE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
    }
  }, [openFractionAnim, visible]);

  const overlayOpacity = useMemo(
    () =>
      openFractionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0],
        extrapolate: 'clamp'
      }),
    [openFractionAnim]
  );
  const drawerOpacity = useMemo(
    () =>
      openFractionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1]
      }),
    [openFractionAnim]
  );
  const drawerTranslateX = useMemo(
    () =>
      openFractionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [drawerWidthPx, 0]
      }),
    [drawerWidthPx, openFractionAnim]
  );

  return (
    <View pointerEvents={allowInteraction ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.layer]} testID="chat-detail-drawer-layer">
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity, backgroundColor: theme.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={allowInteraction ? onClose : undefined} testID="chat-detail-overlay-mask" />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: drawerBackground,
            borderColor: theme.border,
            opacity: drawerOpacity,
            width: `${DRAWER_WIDTH_RATIO * 100}%`,
            transform: [
              {
                translateX: drawerTranslateX
              }
            ]
          }
        ]}
        testID="chat-detail-drawer"
      >
        <View style={[styles.head, { borderBottomColor: theme.border }]}> 
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {`与${normalizedAgentName}的对话`}
          </Text>
          <TouchableOpacity
            activeOpacity={0.78}
            style={[styles.closeBtn, { backgroundColor: theme.surfaceStrong }]}
            onPress={allowInteraction ? onClose : undefined}
            testID="chat-detail-drawer-close-btn"
            disabled={!allowInteraction}
          >
            <Text style={[styles.closeBtnText, { color: theme.textSoft }]}>关闭</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          <TouchableOpacity
            activeOpacity={0.74}
            style={[styles.createItem, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
            onPress={allowInteraction ? onCreateChat : undefined}
            testID="chat-detail-drawer-create-chat-btn"
            disabled={!allowInteraction}
          >
            <Text style={[styles.createItemTitle, { color: theme.text }]}>新建对话 · 详情页左滑</Text>
          </TouchableOpacity>

          {chats.length ? (
            chats.map((chat, index) => {
              const active = chat.chatId === activeChatId;
              const title = String(chat.chatName || '').trim() || '未命名会话';
              const last = String(getChatLastContent(chat) || '').trim() || '暂无内容';
              const chatTime = formatChatListTime(chat);
              const itemKey = chat.chatId || `${title}:${index}`;
              const rawReadStatus = (chat as Record<string, unknown>).readStatus;
              const hasReadStatus = rawReadStatus !== undefined && rawReadStatus !== null && String(rawReadStatus) !== '';
              const readStatus = Number(rawReadStatus);
              const readAt = (chat as Record<string, unknown>).readAt;
              const isRead = hasReadStatus ? readStatus !== 0 : readAt != null ? true : true;
              const readIcon = isRead ? '○' : '●';
              const readLabel = isRead ? '已读' : '未读';
              const readColor = isRead ? theme.textMute : theme.primaryDeep;
              return (
                <TouchableOpacity
                  key={itemKey}
                  activeOpacity={0.74}
                  testID={`chat-detail-drawer-item-${index}`}
                  style={[styles.item, { backgroundColor: active ? cardActiveBackground : cardBackground }]}
                  onPress={() => {
                    if (!allowInteraction) {
                      return;
                    }
                    if (!chat.chatId) {
                      return;
                    }
                    onSelectChat(chat.chatId);
                  }}
                  disabled={!allowInteraction}
                >
                  <View style={styles.itemTopRow}>
                    <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={[styles.itemMetaTime, { color: theme.textMute }]} numberOfLines={1}>
                      {chatTime}
                    </Text>
                  </View>
                  <View style={styles.itemBottomRow}>
                    <Text style={[styles.itemLast, { color: theme.textSoft }]} numberOfLines={1} testID={`chat-detail-drawer-item-last-${index}`}>
                      {last}
                    </Text>
                    <View style={styles.itemReadState} testID={`chat-detail-drawer-read-state-${index}`}>
                      <Text style={[styles.itemReadIcon, { color: readColor }]} testID={`chat-detail-drawer-read-icon-${index}`}>
                        {readIcon}
                      </Text>
                      <Text style={[styles.itemReadLabel, { color: readColor }]} numberOfLines={1}>
                        {readLabel}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: theme.surfaceStrong }]}> 
              <Text style={[styles.emptyText, { color: theme.textMute }]}>暂无历史会话</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 25,
    elevation: 25
  },
  overlay: {
    ...StyleSheet.absoluteFillObject
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: -2, height: 0 },
    elevation: 5,
    overflow: 'hidden'
  },
  head: {
    minHeight: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700'
  },
  closeBtn: {
    minHeight: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9
  },
  closeBtnText: {
    fontSize: 11,
    fontWeight: '600'
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8
  },
  createItem: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  createItemTitle: {
    fontSize: 13,
    fontWeight: '700'
  },
  item: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  itemTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600'
  },
  itemMetaTime: {
    fontSize: 11
  },
  itemBottomRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  itemLast: {
    flex: 1,
    fontSize: 11
  },
  itemReadState: {
    minWidth: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4
  },
  itemReadIcon: {
    fontSize: 11,
    fontWeight: '700'
  },
  itemReadLabel: {
    fontSize: 10,
    fontWeight: '600'
  },
  emptyCard: {
    borderRadius: 10,
    paddingVertical: 22,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 12
  }
});
