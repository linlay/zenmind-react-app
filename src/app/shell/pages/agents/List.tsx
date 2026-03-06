import { useEffect } from 'react';

import { AgentsScreen as AgentsModuleScreen } from '../../../../modules/agents/screens/AgentsScreen';

import { AgentsRouteBridgeProps, AgentsRouteScreenProps } from './types';

export function AgentsListRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus,
  runtime
}: AgentsRouteScreenProps<'AgentsList'> & AgentsRouteBridgeProps) {
  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('AgentsList');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  return <AgentsModuleScreen theme={runtime.theme} />;
}
