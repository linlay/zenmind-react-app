import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { ChatSummary } from '../../../core/types/common';
import { formatChatListTime, getChatTitle } from '../../../shared/utils/format';

interface ChatDetailDrawerProps {
  visible: boolean;
  theme: AppTheme;
  chats: ChatSummary[];
  activeChatId: string;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
}

export function ChatDetailDrawer({
  visible,
  theme,
  chats,
  activeChatId,
  onClose,
  onSelectChat
}: ChatDetailDrawerProps) {
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const drawerAnim = useRef(new Animated.Value(0)).current;
  const swipeTranslateX = useRef(new Animated.Value(0)).current;

  const drawerTranslateX = useMemo(
    () =>
      drawerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [88, 0]
      }),
    [drawerAnim]
  );

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          if (!visible) {
            return false;
          }
          const horizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
          return horizontal && gestureState.dx > 8;
        },
        onPanResponderMove: (_event, gestureState) => {
          if (!visible) {
            return;
          }
          const next = Math.max(0, Math.min(gestureState.dx, 120));
          swipeTranslateX.setValue(next);
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (!visible) {
            return;
          }
          const shouldClose = gestureState.dx > 72 || gestureState.vx > 0.6;
          if (shouldClose) {
            swipeTranslateX.setValue(0);
            onClose();
            return;
          }
          Animated.spring(swipeTranslateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(swipeTranslateX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0
          }).start();
        }
      }),
    [onClose, swipeTranslateX, visible]
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
    if (!visible) {
      swipeTranslateX.setValue(0);
    }
  }, [drawerAnim, overlayAnim, swipeTranslateX, visible]);

  const drawerBackground = theme.mode === 'dark' ? 'rgba(16, 25, 43, 0.86)' : 'rgba(255, 255, 255, 0.86)';

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
              },
              {
                translateX: swipeTranslateX
              }
            ]
          }
        ]}
        testID="chat-detail-drawer"
      >
        <View style={[styles.head, { borderBottomColor: theme.border }]}> 
          <Text style={[styles.title, { color: theme.text }]}>当前智能体对话</Text>
          <TouchableOpacity
            activeOpacity={0.78}
            style={[styles.closeBtn, { backgroundColor: theme.surfaceStrong }]}
            onPress={onClose}
            testID="chat-detail-drawer-close-btn"
          >
            <Text style={[styles.closeBtnText, { color: theme.textSoft }]}>关闭</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.swipeHintWrap} {...swipeResponder.panHandlers} testID="chat-detail-drawer-swipe-area">
          <View style={[styles.swipeHint, { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.swipeHintText, { color: theme.primaryDeep }]}>右滑关闭</Text>
          </View>
        </View>

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {chats.length ? (
            chats.map((chat, index) => {
              const active = chat.chatId === activeChatId;
              const title = getChatTitle(chat) || chat.chatId || '未命名会话';
              const chatTime = formatChatListTime(chat);
              const itemKey = chat.chatId || `${title}:${index}`;
              return (
                <TouchableOpacity
                  key={itemKey}
                  activeOpacity={0.74}
                  testID={`chat-detail-drawer-item-${index}`}
                  style={[styles.item, { backgroundColor: active ? theme.primarySoft : theme.surfaceStrong }]}
                  onPress={() => {
                    if (!chat.chatId) {
                      return;
                    }
                    onSelectChat(chat.chatId);
                  }}
                >
                  <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={[styles.itemMetaTime, { color: theme.textMute }]} numberOfLines={1}>
                    {chatTime}
                  </Text>
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
    width: '82%',
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
  swipeHintWrap: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4
  },
  swipeHint: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  swipeHintText: {
    fontSize: 10,
    fontWeight: '700'
  },
  list: {
    flex: 1
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8
  },
  item: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600'
  },
  itemMetaTime: {
    marginTop: 4,
    fontSize: 11
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
