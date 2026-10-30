import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { AppState, StatusBar, View } from 'react-native';

import { bootstrapAccountAuth, refreshAccountSession, getAccountAuthGeneration } from '../core/auth/accountAuth.ts';
import { getSelectedSource, subscribeActiveDesktop } from '../core/auth/activeDesktop.ts';
import { useAccountAuth } from '../core/auth/useAccountAuth.ts';
import { getChatCacheScopeId, subscribeChatCacheScope } from '../features/chatPersistence/cacheScope';
import { getCloudAuthSnapshot, subscribeCloudAuth } from '../core/auth/cloudAuth';
import { startAccountSourceLifecycle } from '../features/chatPersistence/accountDesktopSource.ts';
import { ChatNotificationPayload, notificationService } from '../features/notifications/notificationService';
import { getActiveChatSource } from '../features/chatPersistence/chatSourceRuntime';
import { parseChatSourceId } from '../features/chatPersistence/chatSource';
import { chatSyncService } from '../features/chatRealtime/chatSyncService';
import { useAppTheme } from '../shared/visual/AppThemeProvider';
import type { AppThemeTokens } from '../shared/visual/foundation';
import { DevelopmentDebugPanelHost } from './debug/DevelopmentDebugPanelHost';
import { RootNavigator } from './navigation/RootNavigator';
import { RootStackParamList } from './navigation/types';

type AppRootProps = {
  onNavigationReady?: () => void;
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();
const ACTIVE_REFRESH_DEBOUNCE_MS = 20_000;
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;
const APP_ROOT_CLASS = 'flex-1 bg-app-background';

function createNavigationTheme(theme: AppThemeTokens) {
  return {
    ...DefaultTheme,
    dark: theme.isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: theme.colors.brandBlue,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.line,
      notification: theme.colors.badge
    }
  };
}

function syncActiveConversationForNotifications() {
  const currentRoute = navigationRef.getCurrentRoute();
  if (currentRoute?.name !== 'ChatDetail') {
    notificationService.setActiveConversationId(null);
    chatSyncService.setActiveConversationId(null);
    return;
  }

  const params = currentRoute.params as RootStackParamList['ChatDetail'] | undefined;
  const conversationId = params?.conversationId ?? null;
  notificationService.setActiveConversationId(conversationId);
  chatSyncService.setActiveConversationId(conversationId);
}

export function AppRoot({ onNavigationReady }: AppRootProps) {
  const { theme } = useAppTheme();
  const accountAuth = useAccountAuth();
  const isBootstrapping = accountAuth.isBootstrapping;
  const cloud = useSyncExternalStore(subscribeCloudAuth, getCloudAuthSnapshot, getCloudAuthSnapshot);
  const isReady = !isBootstrapping || cloud.cacheAllowed;
  const session = accountAuth.session;
  const hasSession = Boolean(session);
  const sessionGenerationKey = hasSession ? String(getAccountAuthGeneration()) : '';
  const sessionIdentityKey = sessionGenerationKey ? JSON.stringify([session?.accountId, sessionGenerationKey]) : '';
  const sessionAccessToken = session?.accessToken || '';
  const selected = useSyncExternalStore(subscribeActiveDesktop, getSelectedSource, getSelectedSource);
  const scopeId = useSyncExternalStore(subscribeChatCacheScope, getChatCacheScopeId, getChatCacheScopeId);
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  const pendingNotificationPayloadRef = useRef<ChatNotificationPayload | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastActiveRefreshAtRef = useRef(0);

  const routeNotificationPayload = useCallback(
    (payload: ChatNotificationPayload) => {
      if (!navigationRef.isReady() || !isReady) {
        pendingNotificationPayloadRef.current = payload;
        return;
      }

      if (parseChatSourceId(payload.conversationId)?.source.key !== getActiveChatSource()?.key) return;
      navigationRef.navigate('ChatDetail', {
        conversationId: payload.conversationId,
        serverMessageId: payload.serverMessageId,
        fromNotification: true
      });
    },
    [isReady]
  );

  const handleNavigationRouteChange = useCallback(() => {
    syncActiveConversationForNotifications();
    setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? null);
  }, []);

  const runForegroundProactiveRefresh = useCallback(async () => {
    if (isBootstrapping || !hasSession) {
      return null;
    }

    return refreshAccountSession();
  }, [hasSession, isBootstrapping]);

  useEffect(() => {
    bootstrapAccountAuth().catch(() => {
      // The bootstrap screen remains visible if local access state cannot initialize.
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {
        const now = Date.now();
        if (now - lastActiveRefreshAtRef.current < ACTIVE_REFRESH_DEBOUNCE_MS) {
          return;
        }

        lastActiveRefreshAtRef.current = now;
        runForegroundProactiveRefresh().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runForegroundProactiveRefresh]);

  useEffect(() => {
    if (isBootstrapping || !hasSession) {
      return;
    }

    const timer = setInterval(() => {
      if (appStateRef.current !== 'active') {
        return;
      }

      runForegroundProactiveRefresh().catch(() => {});
    }, FOREGROUND_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [hasSession, isBootstrapping, runForegroundProactiveRefresh]);

  useEffect(() => {
    return notificationService.subscribe(routeNotificationPayload);
  }, [routeNotificationPayload]);

  useEffect(() => startAccountSourceLifecycle(), []);

  useEffect(() => {
    if (selected?.kind !== 'cloud' || !cloud.cacheAllowed) {
      void notificationService.clearRegistration().catch(() => {});
      return;
    }
    const sourceKey = getActiveChatSource()?.key;
    if (cloud.status === 'available' && sourceKey)
      void notificationService
        .registerForSession({ sourceKey, username: 'cloud', deviceId: cloud.scopeId })
        .catch(() => {});
  }, [cloud.status, cloud.cacheAllowed, cloud.scopeId, selected]);

  useEffect(() => {
    const route = navigationRef.getCurrentRoute();
    const params = route?.params as RootStackParamList['ChatDetail'] | undefined;
    if (
      route?.name === 'ChatDetail' &&
      parseChatSourceId(params?.conversationId)?.source.key !== getActiveChatSource()?.key
    ) {
      navigationRef.resetRoot({ index: 0, routes: [{ name: 'Tabs' }] });
    }
  }, [selected, scopeId]);

  useEffect(() => {
    if (isBootstrapping || !sessionIdentityKey || !sessionAccessToken) {
      return;
    }

    if (selected?.kind === 'desktop') chatSyncService.refreshAuth().catch(() => {});
  }, [isBootstrapping, selected, sessionAccessToken, sessionIdentityKey]);

  useEffect(() => {
    const canRouteNotification = isNavigationReady && isReady;
    if (!canRouteNotification || !pendingNotificationPayloadRef.current) {
      return;
    }

    const payload = pendingNotificationPayloadRef.current;
    pendingNotificationPayloadRef.current = null;
    routeNotificationPayload(payload);
  }, [isNavigationReady, isReady, routeNotificationPayload]);

  const isChatDetailRoute = currentRouteName === 'ChatDetail';
  const showDevelopmentDebugPanel = __DEV__ && currentRouteName !== null;
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);

  return (
    <View className={APP_ROOT_CLASS}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.surface} />
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        onReady={() => {
          setIsNavigationReady(true);
          handleNavigationRouteChange();
          onNavigationReady?.();
        }}
        onStateChange={handleNavigationRouteChange}
      >
        <RootNavigator />
      </NavigationContainer>
      {showDevelopmentDebugPanel ? <DevelopmentDebugPanelHost isChatDetailRoute={isChatDetailRoute} /> : null}
    </View>
  );
}
