import { NavigationProp, RouteProp } from '@react-navigation/native';
import type { WebViewAuthRefreshOutcome } from '../../../../core/auth/webViewAuthBridge';
import { ShellTabBindings } from '../../types';

export interface AppsAppDefinition {
  key: string;
  name: string;
  description: string;
  effectiveMode: string;
  mountPath: string;
  apiBase: string;
  publicMountPath: string;
  publicApiBase: string;
  frontendStatus: string;
  backendStatus: string;
  status: string;
  lastFrontendLoadAt: string;
  lastBackendLoadAt: string;
  lastFrontendError: string | null;
  lastBackendError: string | null;
}

export interface AppsCatalogPayload {
  generatedAt?: string;
  apps?: unknown[];
}

export interface AppsCatalog {
  generatedAt: string;
  apps: AppsAppDefinition[];
}

export type AppsCatalogResponse = AppsCatalogPayload | null;

export type AppsStackParamList = {
  AppsList: undefined;
  AppsWebView: { appKey: string };
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

export type AppsRouteFocusHandler = (routeName: AppsRouteName, appKey?: string, appName?: string) => void;

export interface AppsRouteBridgeProps {
  onBindNavigation?: (navigation: AppsRootNavigation) => void;
  onRouteFocus?: AppsRouteFocusHandler;
  runtime?: AppsRuntimeBridge;
}

export interface ShellAppsTabScreenProps extends ShellTabBindings {
  onBindNavigation?: (navigation: AppsRootNavigation) => void;
  onRouteFocus: AppsRouteFocusHandler;
  runtime: AppsRuntimeBridge;
}
