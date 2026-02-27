import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AppTheme } from '../../../core/constants/theme';
import { ChatSummary } from '../../../core/types/common';
import { formatChatListTime, getChatTitle } from '../../../shared/utils/format';

export interface ChatSearchAgentItem {
  agentKey: string;
  agentName: string;
  latestChatName?: string;
}

interface ChatSearchPaneProps {
  theme: AppTheme;
  keyword: string;
  agentResults: ChatSearchAgentItem[];
  chatResults: ChatSummary[];
  onChangeKeyword: (next: string) => void;
  onSelectRecentKeyword: (keyword: string) => void;
  onSelectAgent: (agentKey: string) => void;
  onSelectChat: (chatId: string, agentKey?: string) => void;
}

const MOCK_RECENT_SEARCHES = ['发布记录', '日报', 'bug', '部署', '总结'];

export function ChatSearchPane({
  theme,
  keyword,
  agentResults,
  chatResults,
  onChangeKeyword,
  onSelectRecentKeyword,
  onSelectAgent,
  onSelectChat
}: ChatSearchPaneProps) {
  const normalizedKeyword = String(keyword || '').trim();
  const showRecent = !normalizedKeyword;

  return (
    <View style={styles.container} testID="chat-search-pane">
      <View style={[styles.searchShell, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}>
        <TextInput
          value={keyword}
          onChangeText={onChangeKeyword}
          placeholder="搜索 chat / 智能体"
          placeholderTextColor={theme.textMute}
          style={[styles.searchInput, { color: theme.text }]}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          testID="chat-search-pane-input"
        />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {showRecent ? (
          <View testID="chat-search-recent-section">
            <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>最近搜索</Text>
            <View style={styles.recentRow}>
              {MOCK_RECENT_SEARCHES.map((item, index) => (
                <TouchableOpacity
                  key={`${item}:${index}`}
                  activeOpacity={0.74}
                  style={[styles.recentChip, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]}
                  testID={`chat-search-recent-chip-${index}`}
                  onPress={() => onSelectRecentKeyword(item)}
                >
                  <Text style={[styles.recentChipText, { color: theme.textSoft }]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View>
            <View testID="chat-search-agent-section">
              <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>{`智能体 ${agentResults.length}`}</Text>
              {agentResults.length ? (
                agentResults.map((item, index) => (
                  <TouchableOpacity
                    key={`${item.agentKey}:${index}`}
                    activeOpacity={0.74}
                    style={[styles.itemCard, { backgroundColor: theme.surfaceStrong }]}
                    testID={`chat-search-agent-item-${index}`}
                    onPress={() => onSelectAgent(item.agentKey)}
                  >
                    <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.agentName}
                    </Text>
                    <Text style={[styles.itemSub, { color: theme.textMute }]} numberOfLines={1}>
                      {item.latestChatName ? `最近对话：${item.latestChatName}` : '暂无历史对话'}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={[styles.emptyText, { color: theme.textMute }]}>未找到匹配智能体</Text>
              )}
            </View>

            <View style={styles.chatSection} testID="chat-search-chat-section">
              <Text style={[styles.sectionTitle, { color: theme.textSoft }]}>{`对话 ${chatResults.length}`}</Text>
              {chatResults.length ? (
                chatResults.map((chat, index) => {
                  const chatId = String(chat.chatId || '');
                  const title = getChatTitle(chat) || chatId || '未命名会话';
                  const agentName = String(chat.firstAgentName || chat.firstAgentKey || '未知智能体');
                  const chatTime = formatChatListTime(chat);
                  return (
                    <TouchableOpacity
                      key={`${chatId || title}:${index}`}
                      activeOpacity={0.74}
                      style={[styles.itemCard, { backgroundColor: theme.surfaceStrong }]}
                      testID={`chat-search-chat-item-${index}`}
                      onPress={() => {
                        if (!chatId) {
                          return;
                        }
                        onSelectChat(chatId, String(chat.firstAgentKey || '').trim());
                      }}
                    >
                      <View style={styles.chatItemTop}>
                        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={[styles.chatMeta, { color: theme.textMute }]} numberOfLines={1}>
                          {chatTime}
                        </Text>
                      </View>
                      <Text style={[styles.itemSub, { color: theme.textMute }]} numberOfLines={1}>
                        {agentName}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={[styles.emptyText, { color: theme.textMute }]}>未找到匹配对话</Text>
              )}
            </View>
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
  searchShell: {
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center'
  },
  searchInput: {
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    textAlignVertical: 'center'
  },
  content: {
    flex: 1,
    marginTop: 10
  },
  contentInner: {
    paddingBottom: 12
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700'
  },
  recentRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  recentChip: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 11,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  recentChipText: {
    fontSize: 12,
    fontWeight: '600'
  },
  itemCard: {
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700'
  },
  itemSub: {
    marginTop: 4,
    fontSize: 12
  },
  chatSection: {
    marginTop: 14
  },
  chatItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  chatMeta: {
    fontSize: 11
  },
  emptyText: {
    marginTop: 8,
    fontSize: 12
  }
});
