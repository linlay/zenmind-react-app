import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DefaultTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { AppState, StatusBar, View } from 'react-native';

import { getApiBaseUrl } from '../core/api/apiClient';
import { bootstrapAuth, configureAuthCacheRuntime, ensureFreshAccessToken } from '../core/auth/appAuth';
import { isAuthRequired } from '../core/auth/authConfig';
import { useAuthSession } from '../core/auth/useAuthSession';
import { deleteChatDatabaseScope, switchChatDatabaseScope } from '../features/chatPersistence/database';
import { clearChatDirectorySnapshotForScope } from '../features/chatPersistence/homeSnapshot';
import { ChatNotificationPayload, notificationService } from '../features/notifications/notificationService';
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
const PREFRESH_MIN_VALIDITY_MS = 120_000;
const PREFRESH_JITTER_MS = 8_000;
const ACTIVE_REFRESH_DEBOUNCE_MS = 20_000;
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;
const APP_ROOT_CLASS = 'flex-1 bg-app-background';

configureAuthCacheRuntime({
  switchScope: switchChatDatabaseScope,
  clearDirectorySnapshotForScope: clearChatDirectorySnapshotForScope,
  deleteScope: deleteChatDatabaseScope
});

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
  const authRequired = isAuthRequired();
  const { isBootstrapping, session } = useAuthSession();
  const apiBaseUrl = getApiBaseUrl();
  const hasSession = Boolean(session);
  const sessionUsername = session?.username || '';
  const sessionDeviceId = session?.deviceId || '';
  const sessionIdentityKey = sessionDeviceId ? JSON.stringify([apiBaseUrl, sessionUsername, sessionDeviceId]) : '';
  const sessionAccessToken = session?.accessToken || '';
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  const pendingNotificationPayloadRef = useRef<ChatNotificationPayload | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastActiveRefreshAtRef = useRef(0);

  const routeNotificationPayload = useCallback(
    (payload: ChatNotificationPayload) => {
      if (!navigationRef.isReady() || (authRequired && !hasSession)) {
        pendingNotificationPayloadRef.current = payload;
        return;
      }

      navigationRef.navigate('ChatDetail', {
        conversationId: payload.conversationId,
        serverMessageId: payload.serverMessageId,
        fromNotification: true
      });
    },
    [authRequired, hasSession]
  );

  const handleNavigationRouteChange = useCallback(() => {
    syncActiveConversationForNotifications();
    setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? null);
  }, []);

  const runForegroundProactiveRefresh = useCallback(async () => {
    if (!authRequired || isBootstrapping || !hasSession) {
      return null;
    }

    return ensureFreshAccessToken(apiBaseUrl, {
      minValidityMs: PREFRESH_MIN_VALIDITY_MS,
      jitterMs: PREFRESH_JITTER_MS,
      failureMode: 'soft'
    });
  }, [apiBaseUrl, authRequired, hasSession, isBootstrapping]);

  useEffect(() => {
    if (!authRequired) {
      return;
    }

    bootstrapAuth(apiBaseUrl).catch(() => {
      // Fail closed to the login route if bootstrap refresh cannot complete.
    });
  }, [apiBaseUrl, authRequired]);

  useEffect(() => {
    if (!authRequired) {
      return;
    }

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
  }, [authRequired, runForegroundProactiveRefresh]);

  useEffect(() => {
    if (!authRequired || isBootstrapping || !hasSession) {
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
  }, [authRequired, hasSession, isBootstrapping, runForegroundProactiveRefresh]);

  useEffect(() => {
    return notificationService.subscribe(routeNotificationPayload);
  }, [routeNotificationPayload]);

  useEffect(() => {
    if (authRequired && (isBootstrapping || !sessionIdentityKey)) {
      return;
    }

    chatSyncService.prewarmHome().catch(() => {});
  }, [authRequired, isBootstrapping, sessionIdentityKey]);

  useEffect(() => {
    if (!sessionIdentityKey || isBootstrapping) {
      chatSyncService.stop();
      return;
    }

    notificationService
      .registerForSession({
        username: sessionUsername,
        deviceId: sessionDeviceId
      })
      .catch(() => {
        // Push token registration is best-effort and must not block app startup.
      });
    chatSyncService.start().catch(() => {
      // Real-time bootstrap is best-effort; SQLite still serves the current UI.
    });

    return () => {
      chatSyncService.stop();
    };
  }, [isBootstrapping, sessionDeviceId, sessionIdentityKey, sessionUsername]);

  useEffect(() => {
    if (!authRequired || isBootstrapping || !sessionIdentityKey || !sessionAccessToken) {
      return;
    }

    chatSyncService.refreshAuth().catch(() => {});
  }, [authRequired, isBootstrapping, sessionAccessToken, sessionIdentityKey]);

  useEffect(() => {
    const canRouteNotification = isNavigationReady && (!authRequired || (!isBootstrapping && hasSession));
    if (!canRouteNotification || !pendingNotificationPayloadRef.current) {
      return;
    }

    const payload = pendingNotificationPayloadRef.current;
    pendingNotificationPayloadRef.current = null;
    routeNotificationPayload(payload);
  }, [authRequired, hasSession, isBootstrapping, isNavigationReady, routeNotificationPayload]);

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
