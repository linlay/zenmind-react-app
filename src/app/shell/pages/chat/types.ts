import { NavigationProp, RouteProp } from '@react-navigation/native';
import type { WebViewAuthRefreshOutcome } from '../../../../core/auth/webViewAuthBridge';
import { ShellTabBindings } from '../../types';

export type ChatStackParamList = {
  ChatList: undefined;
  ChatSearch: undefined;
  ChatDetail: { chatId?: string; agentKey?: string } | undefined;
  AgentProfile: { agentKey: string };
};

export type ChatRouteName = keyof ChatStackParamList;
export type ChatRootNavigation = NavigationProp<ChatStackParamList>;

export type ChatNavigation<RouteName extends ChatRouteName> = NavigationProp<ChatStackParamList, RouteName>;

export interface ChatRouteScreenProps<RouteName extends ChatRouteName> {
  navigation: ChatNavigation<RouteName>;
  route: RouteProp<ChatStackParamList, RouteName>;
}

export interface ChatGestureOutcome {
  ok: boolean;
  message?: string;
}

export interface ChatDetailRuntimeBridge {
  onRefreshChats: (silent?: boolean) => Promise<void>;
  keyboardHeight: number;
  refreshSignal?: number;
  authAccessToken?: string;
  authAccessExpireAtMs?: number;
  authTokenSignal?: number;
  onWebViewAuthRefreshRequest?: (requestId: string, source: string) => Promise<WebViewAuthRefreshOutcome>;
  onChatViewed?: (chatId: string) => Promise<void>;
  onRequestSwitchAgentChat?: (direction: 'prev' | 'next') => ChatGestureOutcome;
  onRequestCreateAgentChatBySwipe?: () => ChatGestureOutcome;
  onRequestPreviewChatDetailDrawer?: (progress: number) => void;
  onRequestShowChatDetailDrawer?: () => void;
  chatDetailDrawerOpen?: boolean;
}

export interface ChatRouteBridgeProps {
  onBindNavigation?: (navigation: ChatRootNavigation) => void;
  onRouteFocus?: (routeName: ChatRouteName) => void;
  chatDetailRuntime?: ChatDetailRuntimeBridge;
}

export interface ShellChatTabScreenProps extends ShellTabBindings {
  onBindNavigation: (navigation: ChatRootNavigation) => void;
  onRouteFocus: (routeName: ChatRouteName) => void;
  chatDetailRuntime: ChatDetailRuntimeBridge;
}
