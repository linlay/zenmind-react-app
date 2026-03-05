import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChatSearchAgentItem, ChatSearchPane } from '../../../../modules/chat/components/ChatSearchPane';
import { setChatId } from '../../../../modules/chat/state/chatSlice';
import { THEMES } from '../../../../core/constants/theme';
import {
  getAgentKey,
  getAgentName,
  getChatAgentKey,
  getChatAgentName,
  getChatTimestamp,
  getChatTitle
} from '../../../../shared/utils/format';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { setChatSearchQuery } from '../../shellSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { ChatRootNavigation, ChatRouteName, ChatRouteScreenProps } from './types';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

interface ChatSearchRouteScreenExtraProps {
  onBindNavigation?: (navigation: ChatRootNavigation) => void;
  onRouteFocus?: (routeName: ChatRouteName) => void;
}

export function ChatSearchRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus
}: ChatRouteScreenProps<'ChatSearch'> & ChatSearchRouteScreenExtraProps) {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  const keyword = useAppSelector((state) => state.shell.chatSearchQuery);
  const agents = useAppSelector((state) => state.agents.agents);
  const chats = useAppSelector((state) => state.chat.chats);
  const normalizedKeyword = String(keyword || '')
    .trim()
    .toLowerCase();

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    onRouteFocus?.('ChatSearch');
    const unsubscribe = navigation.addListener('focus', () => onRouteFocus?.('ChatSearch'));
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  const agentResults = useMemo<ChatSearchAgentItem[]>(() => {
    if (!normalizedKeyword) {
      return [];
    }
    return agents
      .map((agent) => {
        const agentKey = getAgentKey(agent);
        const agentName = getAgentName(agent);
        if (!agentKey || !agentName) {
          return null;
        }
        const haystack = `${agentName} ${agentKey}`.toLowerCase();
        if (!haystack.includes(normalizedKeyword)) {
          return null;
        }
        const latestChat = [...chats]
          .filter((chat) => String(getChatAgentKey(chat) || '').trim() === agentKey)
          .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a))[0];

        return {
          agentKey,
          agentName,
          latestChatName: latestChat ? getChatTitle(latestChat) : ''
        };
      })
      .filter(Boolean) as ChatSearchAgentItem[];
  }, [agents, chats, normalizedKeyword]);

  const chatResults = useMemo(() => {
    if (!normalizedKeyword) {
      return [];
    }
    return [...chats]
      .filter((chat) => {
        const haystack = `${chat.chatName || ''} ${chat.title || ''} ${chat.chatId || ''} ${getChatAgentName(
          chat
        )} ${getChatAgentKey(chat)}`.toLowerCase();
        return haystack.includes(normalizedKeyword);
      })
      .sort((a, b) => getChatTimestamp(b) - getChatTimestamp(a));
  }, [chats, normalizedKeyword]);

  const handleSelectAgent = useCallback(
    (agentKey: string) => {
      const normalizedAgentKey = String(agentKey || '').trim();
      if (!normalizedAgentKey) {
        return;
      }
      dispatch(setSelectedAgentKey(normalizedAgentKey));
      navigation.navigate('AgentProfile', { agentKey: normalizedAgentKey });
    },
    [dispatch, navigation]
  );

  const handleSelectChat = useCallback(
    (chatId: string, agentKey?: string) => {
      const normalizedAgentKey = String(agentKey || '').trim();
      if (normalizedAgentKey && normalizedAgentKey !== UNKNOWN_AGENT_KEY) {
        dispatch(setSelectedAgentKey(normalizedAgentKey));
      }
      dispatch(setChatId(chatId));
      navigation.navigate('ChatDetail', {
        chatId,
        agentKey: normalizedAgentKey
      });
    },
    [dispatch, navigation]
  );

  return (
    <View style={styles.container}>
      <ChatSearchPane
        theme={theme}
        keyword={keyword}
        agentResults={agentResults}
        chatResults={chatResults}
        onSelectRecentKeyword={(value) => dispatch(setChatSearchQuery(value))}
        onSelectAgent={handleSelectAgent}
        onSelectChat={handleSelectChat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
