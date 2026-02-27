import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { formatChatListTime, getChatTitle } from '../../../shared/utils/format';
import { AgentLatestChatItem } from '../state/chatSelectors';
import { AgentAvatarIcon, resolveAgentAvatarBgColor, resolveAgentAvatarName } from './agentAvatarRegistry';

interface ChatListPaneProps {
  theme: AppTheme;
  loading: boolean;
  items: AgentLatestChatItem[];
  onSelectChat: (chatId: string, agentKey: string) => void;
}

export function ChatListPane({
  theme,
  loading,
  items,
  onSelectChat
}: ChatListPaneProps) {
  return (
    <View style={styles.container} testID="chat-list-pane">
      <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
        {items.length ? (
          items.map((item, index) => {
            const chat = item.latestChat;
            const latestChatName = getChatTitle(chat) || chat.chatId || '未命名会话';
            const agentName = item.agentName || '未知智能体';
            const chatTime = formatChatListTime(chat);
            const itemKey = item.agentKey || chat.chatId || `${latestChatName}:${index}`;
            const avatarName = resolveAgentAvatarName(item.agentKey, item.iconName);
            const avatarColor = resolveAgentAvatarBgColor(item.agentKey, item.iconColor);
            // mock unread count: stable pseudo-random value (1-9) until backend returns per-agent unread stats
            const unreadSeed = `${item.agentKey || ''}:${chat.chatId || ''}:${index}`;
            const unreadCount =
              ((unreadSeed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 9) + 1);

            return (
              <TouchableOpacity
                key={itemKey}
                activeOpacity={0.74}
                testID={`chat-list-item-${index}`}
                style={[styles.chatItem, { backgroundColor: theme.surfaceStrong }]}
                onPress={() => {
                  if (!chat.chatId) {
                    return;
                  }
                  onSelectChat(chat.chatId, item.agentKey);
                }}
              >
                <View style={styles.chatRow}>
                  <View style={[styles.agentAvatar, { backgroundColor: avatarColor }]}> 
                    <AgentAvatarIcon name={avatarName} size={24} color="#ffffff" />
                  </View>

                  <View style={styles.itemMain}>
                    <Text style={[styles.agentName, { color: theme.text }]} numberOfLines={1}>
                      {agentName}
                    </Text>
                    <Text style={[styles.chatName, { color: theme.textMute }]} numberOfLines={1}>
                      {latestChatName}
                    </Text>
                  </View>

                  <View style={styles.metaWrap}>
                    <Text style={[styles.metaTime, { color: theme.textMute }]} numberOfLines={1}>
                      {chatTime}
                    </Text>
                    <View style={[styles.metaUnreadBadge, { backgroundColor: theme.primaryDeep }]} testID={`chat-list-item-unread-badge-${index}`}>
                      <Text style={styles.metaUnreadText} numberOfLines={1}>
                        {unreadCount}
                      </Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.surfaceStrong }]}> 
            {loading ? (
              <ActivityIndicator size="small" color={theme.primaryDeep} />
            ) : null}
            <Text style={[styles.emptyText, { color: theme.textMute }]}>{loading ? '加载中...' : '暂无历史会话'}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 8,
    paddingTop: 8
  },
  listWrap: {
    flex: 1
  },
  listContent: {
    paddingBottom: 12,
    gap: 8
  },
  chatItem: {
    borderRadius: 10,
    minHeight: 66,
    paddingHorizontal: 11,
    paddingVertical: 11
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  agentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemMain: {
    flex: 1,
    minWidth: 0
  },
  agentName: {
    fontSize: 17,
    fontWeight: '700'
  },
  chatName: {
    marginTop: 4,
    fontSize: 14
  },
  metaTime: {
    fontSize: 12,
    textAlign: 'right'
  },
  metaWrap: {
    alignItems: 'flex-end',
    minWidth: 66
  },
  metaUnreadBadge: {
    marginTop: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  metaUnreadText: {
    color: '#ffffff',
    fontSize: 11,
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
