import { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChatListPane } from '../../../../modules/chat/components/ChatListPane';
import { selectAgentLatestChats } from '../../../../modules/chat/state/chatSelectors';
import { setChatId } from '../../../../modules/chat/state/chatSlice';
import { THEMES } from '../../../../core/constants/theme';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { ChatRootNavigation, ChatRouteName, ChatRouteScreenProps } from './types';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

interface ChatListRouteScreenExtraProps {
  onBindNavigation?: (navigation: ChatRootNavigation) => void;
  onRouteFocus?: (routeName: ChatRouteName) => void;
}

export function ChatListRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus
}: ChatRouteScreenProps<'ChatList'> & ChatListRouteScreenExtraProps) {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const loadingChats = useAppSelector((state) => state.chat.loadingChats);
  const agentLatestChats = useAppSelector(selectAgentLatestChats);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    onRouteFocus?.('ChatList');
    const unsubscribe = navigation.addListener('focus', () => onRouteFocus?.('ChatList'));
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  const openChatDetail = useCallback(
    (chatId: string, agentKey: string) => {
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

  const openAgentProfile = useCallback(
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

  return (
    <View style={styles.container}>
      <ChatListPane
        theme={theme}
        loading={loadingChats}
        items={agentLatestChats}
        onSelectChat={openChatDetail}
        onSelectAgentProfile={openAgentProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
