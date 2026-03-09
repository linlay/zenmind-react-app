import { NavigationProp, RouteProp } from '@react-navigation/native';
import type { WebViewAuthRefreshOutcome } from '../../../../core/auth/webViewAuthBridge';
import { ShellTabBindings } from '../../types';
import { AppsAppKey } from './config';

export type AppsStackParamList = {
  AppsList: undefined;
  AppsWebView: { appKey: AppsAppKey };
};

export type AppsRouteName = keyof AppsStackParamList;
export type AppsRootNavigation = NavigationProp<AppsStackParamList>;
export type AppsNavigation<RouteName extends AppsRouteName> = NavigationProp<AppsStackParamList, RouteName>;

export interface AppsRouteScreenProps<RouteName extends AppsRouteName> {
  navigation: AppsNavigation<RouteName>;
  route: RouteProp<AppsStackParamList, RouteName>;
}

export interface AppsRuntimeBridge {
  authAccessToken?: string;
  authAccessExpireAtMs?: number;
  authTokenSignal?: number;
  onWebViewAuthRefreshRequest?: (requestId: string, source: string) => Promise<WebViewAuthRefreshOutcome>;
}

export interface AppsRouteBridgeProps {
  onBindNavigation?: (navigation: AppsRootNavigation) => void;
  onRouteFocus?: (routeName: AppsRouteName, appKey?: AppsAppKey) => void;
  runtime?: AppsRuntimeBridge;
}

export interface ShellAppsTabScreenProps extends ShellTabBindings {
  onBindNavigation?: (navigation: AppsRootNavigation) => void;
  onRouteFocus: (routeName: AppsRouteName, appKey?: AppsAppKey) => void;
  runtime: AppsRuntimeBridge;
}
