import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { ChatSummary } from '../../../core/types/common';
import { formatChatListTime } from '../../../shared/utils/format';

interface ChatDetailDrawerProps {
  visible: boolean;
  theme: AppTheme;
  activeAgentName: string;
  chats: ChatSummary[];
  activeChatId: string;
  onClose: () => void;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
}

export function ChatDetailDrawer({
  visible,
  theme,
  activeAgentName,
  chats,
  activeChatId,
  onClose,
  onCreateChat,
  onSelectChat
}: ChatDetailDrawerProps) {
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const drawerAnim = useRef(new Animated.Value(0)).current;

  const drawerTranslateX = useMemo(
    () =>
      drawerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [88, 0]
      }),
    [drawerAnim]
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(overlayAnim, {
        toValue: visible ? 1 : 0,
        duration: visible ? 180 : 140,
        useNativeDriver: true
      }),
      Animated.timing(drawerAnim, {
        toValue: visible ? 1 : 0,
        duration: visible ? 220 : 150,
        useNativeDriver: true
      })
    ]).start();
  }, [drawerAnim, overlayAnim, visible]);

  const drawerBackground = theme.surface;
  const cardBackground = theme.mode === 'dark' ? '#182740' : '#f4f7fc';
  const cardActiveBackground = theme.mode === 'dark' ? '#264673' : '#e4eeff';
  const normalizedAgentName = String(activeAgentName || '').trim() || '当前智能体';

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={StyleSheet.absoluteFill} testID="chat-detail-drawer-layer">
      <Animated.View style={[styles.overlay, { opacity: overlayAnim, backgroundColor: theme.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="chat-detail-overlay-mask" />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor: drawerBackground,
            borderColor: theme.border,
            opacity: drawerAnim,
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
            onPress={onClose}
            testID="chat-detail-drawer-close-btn"
          >
            <Text style={[styles.closeBtnText, { color: theme.textSoft }]}>关闭</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          <TouchableOpacity
            activeOpacity={0.74}
            style={[styles.createItem, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
            onPress={onCreateChat}
            testID="chat-detail-drawer-create-chat-btn"
          >
            <Text style={[styles.createItemTitle, { color: theme.text }]}>新建对话</Text>
            <Text style={[styles.createItemSubTitle, { color: theme.textMute }]}>详情页左滑</Text>
          </TouchableOpacity>

          {chats.length ? (
            chats.map((chat, index) => {
              const active = chat.chatId === activeChatId;
              const title = String(chat.chatName || '').trim() || '未命名会话';
              const last = String((chat as Record<string, unknown>).last || '').trim() || '暂无 last';
              const chatTime = formatChatListTime(chat);
              const itemKey = chat.chatId || `${title}:${index}`;
              // mock read status by odd-even index until backend returns per-chat read state
              const isRead = index % 2 === 0;
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
                    if (!chat.chatId) {
                      return;
                    }
                    onSelectChat(chat.chatId);
                  }}
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
  overlay: {
    ...StyleSheet.absoluteFillObject
  },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '76%',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 0 },
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
  createItemSubTitle: {
    marginTop: 2,
    fontSize: 11
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
