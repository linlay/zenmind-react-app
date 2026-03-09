import { useCallback, useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { AppTheme, THEMES } from '../../../../core/constants/theme';
import { toBackendBaseUrl } from '../../../../core/network/endpoint';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { ChatAssistantScreen } from '../../../../modules/chat/screens/ChatAssistantScreen';
import { setChatId } from '../../../../modules/chat/state/chatSlice';
import { getAgentKey, getAgentName, getAgentRole } from '../../../../shared/utils/format';

import { ChatRouteScreenProps, ChatRouteBridgeProps } from './types';
import { ShellHeaderBackButton, ShellHeaderIconButton, ShellHeaderTitle, ShellKebabIcon } from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

interface BuildChatDetailHeaderInput {
  theme: AppTheme;
  activeAgentName: string;
  activeAgentRole: string;
  onBack: () => void;
  onOpenMenu: () => void;
}

export function buildChatDetailHeader({
  theme,
  activeAgentName,
  activeAgentRole,
  onBack,
  onOpenMenu
}: BuildChatDetailHeaderInput): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderBackButton theme={theme} testID="chat-detail-back-btn" onPress={onBack} />,
    center: <ShellHeaderTitle theme={theme} title={activeAgentName || 'Agent'} subtitle={activeAgentRole || ''} />,
    right: (
      <ShellHeaderIconButton theme={theme} testID="chat-detail-menu-btn" onPress={onOpenMenu}>
        <ShellKebabIcon theme={theme} />
      </ShellHeaderIconButton>
    )
  };
}

export function ChatDetailRouteScreen({
  route,
  navigation,
  onBindNavigation,
  onRouteFocus,
  chatDetailRuntime
}: ChatRouteScreenProps<'ChatDetail'> & ChatRouteBridgeProps) {
  const dispatch = useAppDispatch();
  const window = useWindowDimensions();
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const endpointInput = useAppSelector((state) => state.user.endpointInput);
  const agents = useAppSelector((state) => state.agents.agents);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);
  const chatId = useMemo(() => String(route.params?.chatId || ''), [route.params?.chatId]);
  const agentKey = useMemo(() => String(route.params?.agentKey || ''), [route.params?.agentKey]);
  const agent = useMemo(
    () => agents.find((item) => String(getAgentKey(item) || '').trim() === agentKey) || null,
    [agentKey, agents]
  );

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('ChatDetail')
  });

  useEffect(() => {
    if (agentKey && agentKey !== UNKNOWN_AGENT_KEY) {
      dispatch(setSelectedAgentKey(agentKey));
    }
    dispatch(setChatId(chatId));
  }, [agentKey, chatId, dispatch]);

  const runtimeOnRefreshChats = chatDetailRuntime?.onRefreshChats;

  const onRefreshChats = useCallback(
    async (silent?: boolean) => {
      if (runtimeOnRefreshChats) {
        await runtimeOnRefreshChats(silent);
      }
    },
    [runtimeOnRefreshChats]
  );

  return (
    <ChatAssistantScreen
      theme={theme}
      backendUrl={backendUrl}
      contentWidth={window.width}
      onRefreshChats={onRefreshChats}
      keyboardHeight={chatDetailRuntime?.keyboardHeight || 0}
      refreshSignal={chatDetailRuntime?.refreshSignal}
      authAccessToken={chatDetailRuntime?.authAccessToken}
      authAccessExpireAtMs={chatDetailRuntime?.authAccessExpireAtMs}
      authTokenSignal={chatDetailRuntime?.authTokenSignal}
      onWebViewAuthRefreshRequest={chatDetailRuntime?.onWebViewAuthRefreshRequest}
      onChatViewed={chatDetailRuntime?.onChatViewed}
      onRequestSwitchAgentChat={chatDetailRuntime?.onRequestSwitchAgentChat}
      onRequestCreateAgentChatBySwipe={chatDetailRuntime?.onRequestCreateAgentChatBySwipe}
      onRequestPreviewChatDetailDrawer={chatDetailRuntime?.onRequestPreviewChatDetailDrawer}
      onRequestShowChatDetailDrawer={chatDetailRuntime?.onRequestShowChatDetailDrawer}
      chatDetailDrawerOpen={chatDetailRuntime?.chatDetailDrawerOpen}
    />
  );
}
