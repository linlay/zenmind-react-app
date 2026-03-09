import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChatListPane } from '../../../../modules/chat/components/ChatListPane';
import { selectAgentLatestChats } from '../../../../modules/chat/state/chatSelectors';
import { setChatId } from '../../../../modules/chat/state/chatSlice';
import { AppTheme, THEMES } from '../../../../core/constants/theme';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  ShellChatSidebarIcon,
  ShellHeaderActionRow,
  ShellHeaderIconButton,
  ShellHeaderMenuItem,
  ShellHeaderMenuPanel,
  ShellHeaderMenuPopover,
  ShellHeaderTitle,
  ShellPlusIcon,
  ShellSearchIcon
} from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';
import { ChatRootNavigation, ChatRouteName, ChatRouteScreenProps } from './types';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';
const CHAT_PLUS_MENU_ITEMS = ['扫一扫', '建立群组', '创建频道'] as const;

interface ChatListRouteScreenExtraProps {
  onBindNavigation?: (navigation: ChatRootNavigation) => void;
  onRouteFocus?: (routeName: ChatRouteName) => void;
}

interface BuildChatListHeaderInput {
  theme: AppTheme;
  chatPlusMenuOpen: boolean;
  onPressLeftAction: () => void;
  onPressSearch: () => void;
  onTogglePlusMenu: () => void;
  onPressPlusMenuItem: (label: string) => void;
}

export function buildChatListHeader({
  theme,
  chatPlusMenuOpen,
  onPressLeftAction,
  onPressSearch,
  onTogglePlusMenu,
  onPressPlusMenuItem
}: BuildChatListHeaderInput): ShellHeaderDescriptor {
  return {
    sideMode: 'wide',
    left: (
      <ShellHeaderIconButton theme={theme} testID="chat-left-action-btn" onPress={onPressLeftAction}>
        <ShellChatSidebarIcon theme={theme} />
      </ShellHeaderIconButton>
    ),
    center: <ShellHeaderTitle theme={theme} title="对话" />,
    right: (
      <ShellHeaderActionRow testID="chat-list-top-actions">
        <ShellHeaderIconButton theme={theme} testID="chat-list-search-btn" onPress={onPressSearch}>
          <ShellSearchIcon theme={theme} />
        </ShellHeaderIconButton>
        <ShellHeaderMenuPopover>
          <ShellHeaderIconButton theme={theme} testID="chat-list-plus-btn" onPress={onTogglePlusMenu}>
            <ShellPlusIcon theme={theme} />
          </ShellHeaderIconButton>
          {chatPlusMenuOpen ? (
            <ShellHeaderMenuPanel theme={theme} testID="chat-list-plus-menu">
              {CHAT_PLUS_MENU_ITEMS.map((label, index) => (
                <ShellHeaderMenuItem
                  key={label}
                  theme={theme}
                  index={index}
                  testID={`chat-list-plus-menu-item-${index}`}
                  onPress={() => onPressPlusMenuItem(label)}
                >
                  {label}
                </ShellHeaderMenuItem>
              ))}
            </ShellHeaderMenuPanel>
          ) : null}
        </ShellHeaderMenuPopover>
      </ShellHeaderActionRow>
    )
  };
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

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('ChatList')
  });

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
