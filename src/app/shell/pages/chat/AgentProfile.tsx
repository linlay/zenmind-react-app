import { useCallback, useEffect, useMemo } from 'react';

import { AppTheme, THEMES } from '../../../../core/constants/theme';
import { getAgentKey, getAgentName } from '../../../../shared/utils/format';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { hideToast } from '../../../ui/uiSlice';
import { setSelectedAgentKey } from '../../../../modules/user/state/userSlice';
import { setChatId } from '../../../../modules/chat/state/chatSlice';
import { AgentProfilePane } from '../../../../modules/chat/components/AgentProfilePane';

import { ChatRouteScreenProps, ChatRouteBridgeProps } from './types';
import { ShellHeaderBackButton, ShellHeaderPlaceholder, ShellHeaderTitle } from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';

interface BuildAgentProfileHeaderInput {
  theme: AppTheme;
  title: string;
  onBack: () => void;
}

export function buildAgentProfileHeader({ theme, title, onBack }: BuildAgentProfileHeaderInput): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderBackButton theme={theme} testID="chat-agent-back-btn" onPress={onBack} />,
    center: <ShellHeaderTitle theme={theme} title={title || 'Agent'} />,
    right: <ShellHeaderPlaceholder testID="chat-agent-right-placeholder" />
  };
}

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

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('AgentProfile')
  });

  const handleStartChat = useCallback(
    (nextAgentKey: string) => {
      const normalizedAgentKey = String(nextAgentKey || '').trim();
      if (!normalizedAgentKey) {
        return;
      }
      dispatch(setSelectedAgentKey(normalizedAgentKey));
      dispatch(setChatId(''));
      dispatch(hideToast());
      navigation.navigate('ChatDetail', {
        chatId: '',
        agentKey: normalizedAgentKey
      });
    },
    [dispatch, navigation]
  );

  return <AgentProfilePane theme={theme} agent={agent} onStartChat={handleStartChat} />;
}
