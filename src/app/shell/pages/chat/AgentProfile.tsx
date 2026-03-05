import { useCallback, useEffect, useMemo } from 'react';

import { THEMES } from '../../../../core/constants/theme';
import { getAgentKey } from '../../../../shared/utils/format';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { setChatId, setStatusText } from '../../../../modules/chat/state/chatSlice';
import { AgentProfilePane } from '../../../../modules/chat/components/AgentProfilePane';

import { ChatRouteScreenProps, ChatRouteBridgeProps } from './types';

export function AgentProfileRouteScreen({
  route,
  navigation,
  onBindNavigation,
  onRouteFocus
}: ChatRouteScreenProps<'AgentProfile'> & ChatRouteBridgeProps) {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const agents = useAppSelector((state) => state.agents.agents);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const agentKey = useMemo(() => String(route.params?.agentKey || '').trim(), [route.params?.agentKey]);
  const agent = useMemo(() => agents.find((item) => getAgentKey(item) === agentKey) || null, [agents, agentKey]);

  useEffect(() => {
    if (agentKey) {
      dispatch(setSelectedAgentKey(agentKey));
    }
  }, [agentKey, dispatch]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    onRouteFocus?.('AgentProfile');
    const unsubscribe = navigation.addListener('focus', () => onRouteFocus?.('AgentProfile'));
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  const handleStartChat = useCallback(
    (nextAgentKey: string) => {
      const normalizedAgentKey = String(nextAgentKey || '').trim();
      if (!normalizedAgentKey) {
        return;
      }
      dispatch(setSelectedAgentKey(normalizedAgentKey));
      dispatch(setChatId(''));
      dispatch(setStatusText(''));
      navigation.navigate('ChatDetail', {
        chatId: '',
        agentKey: normalizedAgentKey
      });
    },
    [dispatch, navigation]
  );

  return <AgentProfilePane theme={theme} agent={agent} onStartChat={handleStartChat} />;
}
