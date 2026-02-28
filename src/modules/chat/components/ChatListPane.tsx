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
  onSelectAgentProfile: (agentKey: string) => void;
}

export function ChatListPane({
  theme,
  loading,
  items,
  onSelectChat,
  onSelectAgentProfile
}: ChatListPaneProps) {
  return (
    <View style={styles.container} testID="chat-list-pane">
      <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
        {items.length ? (
          items.map((item, index) => {
            const chat = item.latestChat;
            const latestChatName = getChatTitle(chat) || chat.chatId || '未命名会话';
            const agentName = item.agentName || '未知智能体';
            const agentRole = String(item.agentRole || '').trim();
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
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={!item.agentKey}
                    testID={`chat-list-item-avatar-btn-${index}`}
                    style={[styles.agentAvatarBtn, !item.agentKey ? styles.agentAvatarBtnDisabled : null]}
                    onPress={(event) => {
                      event.stopPropagation();
                      if (!item.agentKey) {
                        return;
                      }
                      onSelectAgentProfile(item.agentKey);
                    }}
                  >
                    <View style={[styles.agentAvatar, { backgroundColor: avatarColor }]}> 
                      <AgentAvatarIcon name={avatarName} size={24} color="#ffffff" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.itemMain}>
                    <View style={styles.agentNameRow}>
                      <Text style={[styles.agentName, { color: theme.text }]} numberOfLines={1}>
                        {agentName}
                      </Text>
                      {agentRole ? (
                        <Text
                          style={[styles.agentRole, { color: theme.textMute }]}
                          numberOfLines={1}
                          testID={`chat-list-item-agent-role-${index}`}
                        >
                          {agentRole}
                        </Text>
                      ) : null}
                    </View>
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
  agentAvatarBtn: {
    borderRadius: 24
  },
  agentAvatarBtnDisabled: {
    opacity: 0.7
  },
  itemMain: {
    flex: 1,
    minWidth: 0
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6
  },
  agentName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700'
  },
  agentRole: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 1
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
