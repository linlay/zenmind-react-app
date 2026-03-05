import { useCallback, useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { THEMES } from '../../../../core/constants/theme';
import { toBackendBaseUrl } from '../../../../core/network/endpoint';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { ChatAssistantScreen } from '../../../../modules/chat/screens/ChatAssistantScreen';
import { setChatId } from '../../../../modules/chat/state/chatSlice';

import { ChatRouteScreenProps, ChatRouteBridgeProps } from './types';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

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
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const backendUrl = useMemo(() => toBackendBaseUrl(endpointInput), [endpointInput]);
  const chatId = useMemo(() => String(route.params?.chatId || ''), [route.params?.chatId]);
  const agentKey = useMemo(() => String(route.params?.agentKey || ''), [route.params?.agentKey]);

  useEffect(() => {
    if (agentKey && agentKey !== UNKNOWN_AGENT_KEY) {
      dispatch(setSelectedAgentKey(agentKey));
    }
    dispatch(setChatId(chatId));
  }, [agentKey, chatId, dispatch]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    onRouteFocus?.('ChatDetail');
    const unsubscribe = navigation.addListener('focus', () => onRouteFocus?.('ChatDetail'));
    return unsubscribe;
  }, [navigation, onRouteFocus]);

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
