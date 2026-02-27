import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { formatChatListTime, getChatTitle } from '../../../shared/utils/format';
import { AgentLatestChatItem } from '../state/chatSelectors';
import { AgentAvatarIcon, resolveAgentAvatarBgColor, resolveAgentAvatarName } from './agentAvatarRegistry';

interface ChatListPaneProps {
  theme: AppTheme;
  keyword: string;
  loading: boolean;
  items: AgentLatestChatItem[];
  activeChatId: string;
  onChangeKeyword: (next: string) => void;
  onRefresh: () => void;
  onSelectChat: (chatId: string, agentKey: string) => void;
}

export function ChatListPane({
  theme,
  keyword,
  loading,
  items,
  activeChatId,
  onChangeKeyword,
  onRefresh,
  onSelectChat
}: ChatListPaneProps) {
  return (
    <View style={styles.container} testID="chat-list-pane">
      <View style={styles.searchRow}>
        <View style={[styles.chatSearchShell, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}> 
          <TextInput
            value={keyword}
            onChangeText={onChangeKeyword}
            placeholder="搜索"
            placeholderTextColor={theme.textMute}
            style={[styles.chatSearchInput, { color: theme.text }]}
            nativeID="chat-search-input"
            testID="chat-search-input"
          />
        </View>
        <TouchableOpacity activeOpacity={0.76} style={styles.refreshBtn} testID="chat-refresh-btn" onPress={onRefresh}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.primaryDeep} />
          ) : (
            <Text style={[styles.refreshText, { color: theme.primaryDeep }]}>刷新</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
        {items.length ? (
          items.map((item, index) => {
            const chat = item.latestChat;
            const active = chat.chatId === activeChatId;
            const latestChatName = getChatTitle(chat) || chat.chatId || '未命名会话';
            const agentName = item.agentName || '未知智能体';
            const chatTime = formatChatListTime(chat);
            const itemKey = item.agentKey || chat.chatId || `${latestChatName}:${index}`;
            const avatarName = resolveAgentAvatarName(item.agentKey, item.iconName);
            const avatarColor = resolveAgentAvatarBgColor(item.agentKey, item.iconColor);

            return (
              <TouchableOpacity
                key={itemKey}
                activeOpacity={0.74}
                testID={`chat-list-item-${index}`}
                style={[styles.chatItem, { backgroundColor: active ? theme.primarySoft : theme.surfaceStrong }]}
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

                  <Text style={[styles.metaTime, { color: theme.textMute }]} numberOfLines={1}>
                    {chatTime}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.surfaceStrong }]}> 
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10
  },
  chatSearchShell: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center'
  },
  chatSearchInput: {
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center'
  },
  refreshBtn: {
    minWidth: 44,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600'
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
  emptyCard: {
    borderRadius: 10,
    paddingVertical: 22,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 12
  }
});
