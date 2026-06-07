import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { AppState, StatusBar, StyleSheet, View } from 'react-native';

import { getApiBaseUrl } from '../core/api/apiClient';
import { bootstrapAuth, ensureFreshAccessToken } from '../core/auth/appAuth';
import { isAuthRequired } from '../core/auth/authConfig';
import { useAuthSession } from '../core/auth/useAuthSession';
import {
  ChatNotificationPayload,
  notificationService,
} from '../features/notifications/notificationService';
import { chatSyncService } from '../features/chatRealtime/chatSyncService';
import { appVisualTokens } from '../shared/visual/foundation';
import { DevelopmentDebugPanelHost } from './debug/DevelopmentDebugPanelHost';
import { RootNavigator } from './navigation/RootNavigator';
import { RootStackParamList } from './navigation/types';

type AppRootProps = {
  onNavigationReady?: () => void;
};

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: appVisualTokens.colors.brandBlue,
    background: appVisualTokens.colors.background,
    card: appVisualTokens.colors.surface,
    text: appVisualTokens.colors.textPrimary,
    border: appVisualTokens.colors.line,
    notification: appVisualTokens.colors.badge,
  },
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();
const PREFRESH_MIN_VALIDITY_MS = 120_000;
const PREFRESH_JITTER_MS = 8_000;
const ACTIVE_REFRESH_DEBOUNCE_MS = 20_000;
const FOREGROUND_REFRESH_INTERVAL_MS = 60_000;

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
  const authRequired = isAuthRequired();
  const { isBootstrapping, session } = useAuthSession();
  const [isNavigationReady, setIsNavigationReady] = useState(false);
  const [currentRouteName, setCurrentRouteName] = useState<string | null>(null);
  const pendingNotificationPayloadRef = useRef<ChatNotificationPayload | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastActiveRefreshAtRef = useRef(0);

  const routeNotificationPayload = useCallback(
    (payload: ChatNotificationPayload) => {
      if (!navigationRef.isReady() || (authRequired && !session)) {
        pendingNotificationPayloadRef.current = payload;
        return;
      }

      navigationRef.navigate('ChatDetail', {
        conversationId: payload.conversationId,
        serverMessageId: payload.serverMessageId,
        fromNotification: true,
      });
    },
    [authRequired, session]
  );

  const handleNavigationRouteChange = useCallback(() => {
    syncActiveConversationForNotifications();
    setCurrentRouteName(navigationRef.getCurrentRoute()?.name ?? null);
  }, []);

  const runForegroundProactiveRefresh = useCallback(async () => {
    if (!authRequired || isBootstrapping || !session) {
      return null;
    }

    return ensureFreshAccessToken(getApiBaseUrl(), {
      minValidityMs: PREFRESH_MIN_VALIDITY_MS,
      jitterMs: PREFRESH_JITTER_MS,
      failureMode: 'soft',
    });
  }, [authRequired, isBootstrapping, session]);

  useEffect(() => {
    if (!authRequired) {
      return;
    }

    bootstrapAuth(getApiBaseUrl()).catch(() => {
      // Fail closed to the login route if bootstrap refresh cannot complete.
    });
  }, [authRequired]);

  useEffect(() => {
    if (!authRequired) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (previousState === 'background' || previousState === 'inactive') &&
        nextState === 'active'
      ) {
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
    if (!authRequired || isBootstrapping || !session) {
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
  }, [authRequired, isBootstrapping, runForegroundProactiveRefresh, session]);

  useEffect(() => {
    return notificationService.subscribe(routeNotificationPayload);
  }, [routeNotificationPayload]);

  useEffect(() => {
    if (!session || isBootstrapping) {
      chatSyncService.stop();
      return;
    }

    notificationService.registerForSession(session).catch(() => {
      // Push token registration is best-effort and must not block app startup.
    });
    chatSyncService.start().catch(() => {
      // Real-time bootstrap is best-effort; SQLite still serves the current UI.
    });

    return () => {
      chatSyncService.stop();
    };
  }, [isBootstrapping, session]);

  useEffect(() => {
    const canRouteNotification =
      isNavigationReady && (!authRequired || (!isBootstrapping && Boolean(session)));
    if (!canRouteNotification || !pendingNotificationPayloadRef.current) {
      return;
    }

    const payload = pendingNotificationPayloadRef.current;
    pendingNotificationPayloadRef.current = null;
    routeNotificationPayload(payload);
  }, [authRequired, isBootstrapping, isNavigationReady, routeNotificationPayload, session]);

  const isChatDetailRoute = currentRouteName === 'ChatDetail';
  const showDevelopmentDebugPanel = __DEV__ && currentRouteName !== null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
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
      {showDevelopmentDebugPanel ? (
        <DevelopmentDebugPanelHost isChatDetailRoute={isChatDetailRoute} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
