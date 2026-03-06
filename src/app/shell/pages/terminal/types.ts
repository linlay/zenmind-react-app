import { NavigationProp, RouteProp } from '@react-navigation/native';

import type { WebViewAuthRefreshOutcome } from '../../../../core/auth/webViewAuthBridge';
import type { TerminalSessionItem } from '../../../../modules/terminal/types/terminal';
import { ShellTabBindings } from '../../types';

export type TerminalStackParamList = {
  TerminalList: undefined;
  TerminalDetail: { sessionId?: string } | undefined;
  TerminalDrive: undefined;
};

export type TerminalRouteName = keyof TerminalStackParamList;
export type TerminalRootNavigation = NavigationProp<TerminalStackParamList>;
export type TerminalNavigation<RouteName extends TerminalRouteName> = NavigationProp<TerminalStackParamList, RouteName>;

export interface TerminalRouteScreenProps<RouteName extends TerminalRouteName> {
  navigation: TerminalNavigation<RouteName>;
  route: RouteProp<TerminalStackParamList, RouteName>;
}

export interface TerminalRuntimeBridge {
  sessions: TerminalSessionItem[];
  loading: boolean;
  error: string;
  activeSessionId: string;
  currentWebViewUrl?: string;
  onRefreshSessions: () => Promise<void>;
  onCreateSession: () => void;
  onOpenSession: (sessionId: string) => void;
  authAccessToken?: string;
  authAccessExpireAtMs?: number;
  authTokenSignal?: number;
  onTerminalUrlChange?: (url: string) => void;
  onWebViewAuthRefreshRequest?: (requestId: string, source: string) => Promise<WebViewAuthRefreshOutcome>;
}

export interface TerminalRouteBridgeProps {
  onBindNavigation?: (navigation: TerminalRootNavigation) => void;
  onRouteFocus?: (routeName: TerminalRouteName) => void;
  runtime?: TerminalRuntimeBridge;
}

export interface ShellTerminalTabScreenProps extends ShellTabBindings {
  onBindNavigation: (navigation: TerminalRootNavigation) => void;
  onRouteFocus: (routeName: TerminalRouteName) => void;
  runtime: TerminalRuntimeBridge;
}
