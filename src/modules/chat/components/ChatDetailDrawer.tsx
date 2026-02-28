import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { ChatSummary } from '../../../core/types/common';
import { formatChatListTime, getChatLastContent } from '../../../shared/utils/format';

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
  const normalizedPreview = Number.isFinite(previewProgress) ? Math.max(0, Math.min(1, previewProgress)) : 0;
  const effectiveProgress = visible ? 1 : normalizedPreview;
  const allowInteraction = visible && interactive;
  const drawerBackground = theme.surface;
  const cardBackground = theme.mode === 'dark' ? '#182740' : '#f4f7fc';
  const cardActiveBackground = theme.mode === 'dark' ? '#264673' : '#e4eeff';
  const normalizedAgentName = String(activeAgentName || '').trim() || '当前智能体';

  return (
    <View pointerEvents={allowInteraction ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, styles.layer]} testID="chat-detail-drawer-layer">
      <View style={[styles.overlay, { opacity: effectiveProgress, backgroundColor: theme.overlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={allowInteraction ? onClose : undefined} testID="chat-detail-overlay-mask" />
      </View>

      <View
        style={[
          styles.drawer,
          {
            backgroundColor: drawerBackground,
            borderColor: theme.border,
            opacity: effectiveProgress,
            transform: [
              {
                translateX: (1 - effectiveProgress) * 88
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
      </View>
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
