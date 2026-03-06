import { NavigationProp, RouteProp } from '@react-navigation/native';

import type { AppTheme } from '../../../../core/constants/theme';
import { ShellTabBindings } from '../../types';

export type AgentsStackParamList = {
  AgentsList: undefined;
  AgentsPublish: undefined;
};

export type AgentsRouteName = keyof AgentsStackParamList;
export type AgentsRootNavigation = NavigationProp<AgentsStackParamList>;
export type AgentsNavigation<RouteName extends AgentsRouteName> = NavigationProp<AgentsStackParamList, RouteName>;

export interface AgentsRouteScreenProps<RouteName extends AgentsRouteName> {
  navigation: AgentsNavigation<RouteName>;
  route: RouteProp<AgentsStackParamList, RouteName>;
}

export interface AgentsRuntimeBridge {
  theme: AppTheme;
  selectedAgentKey: string;
  onSubmitPublish: () => void;
  onClosePublish: () => void;
}

export interface AgentsRouteBridgeProps {
  onBindNavigation?: (navigation: AgentsRootNavigation) => void;
  onRouteFocus?: (routeName: AgentsRouteName) => void;
  runtime: AgentsRuntimeBridge;
}

export interface ShellAgentsTabScreenProps extends ShellTabBindings {
  onBindNavigation: (navigation: AgentsRootNavigation) => void;
  onRouteFocus: (routeName: AgentsRouteName) => void;
  runtime: AgentsRuntimeBridge;
}
