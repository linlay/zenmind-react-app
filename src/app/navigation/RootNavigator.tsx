import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useSyncExternalStore } from 'react';
import { getCloudAuthSnapshot, subscribeCloudAuth } from '../../core/auth/cloudAuth';
import { getAccountAuthGeneration } from '../../core/auth/accountAuth';
import { useAccountAuth } from '../../core/auth/useAccountAuth.ts';
import { readActiveDesktopId, subscribeActiveDesktop } from '../../core/auth/activeDesktop.ts';
import { AgentTaskBoardFlowNavigator } from '../../features/agentTaskBoard/AgentTaskBoardFlowNavigator';
import { AgentTaskBoardProvider } from '../../features/agentTaskBoard/AgentTaskBoardProvider';
import { AuthBootstrapScreen, LoginScreen } from '../../features/auth/LoginScreen';
import { ChatDetailScreen } from '../../features/chatPersistence/ChatDetailScreen';
import { ChatDirectoryPickerOverlayScreen } from '../../features/chatPersistence/ChatDirectoryPickerOverlayScreen';
import { WebAppDetailScreen } from '../../features/webApps/WebAppDetailScreen';
import { WebAppsRuntimeProvider } from '../../features/webApps/WebAppsRuntimeProvider';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { AgentWaitingDemoScreen } from '../screens/AgentWaitingDemoScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TabsNavigator } from './TabsNavigator';
import { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { theme } = useAppTheme();
  const account = useAccountAuth();
  const accountId = account.session?.accountId || '';
  const readDesktopId = () => readActiveDesktopId(accountId);
  const desktopId = useSyncExternalStore(subscribeActiveDesktop, readDesktopId, readDesktopId);
  const cloud = useSyncExternalStore(subscribeCloudAuth, getCloudAuthSnapshot, getCloudAuthSnapshot);
  const webAppsEnabled = Boolean(account.session && desktopId);
  const webAppsSessionKey = account.session
    ? JSON.stringify([accountId, getAccountAuthGeneration(), desktopId])
    : 'signed-out';

  if (account.isBootstrapping && !cloud.cacheAllowed) {
    return <AuthBootstrapScreen />;
  }

  return (
    <AgentTaskBoardProvider>
      <WebAppsRuntimeProvider enabled={webAppsEnabled} sessionKey={webAppsSessionKey}>
        <RootStack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
          <RootStack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              animation: 'slide_from_bottom',
              gestureEnabled: true
            }}
          />
          <RootStack.Screen name="Tabs" component={TabsNavigator} options={{ freezeOnBlur: true }} />
          <RootStack.Screen
            name="TaskBoardFlow"
            component={AgentTaskBoardFlowNavigator}
            options={{
              animation: 'slide_from_right',
              animationDuration: 100,
              gestureEnabled: true
            }}
          />
          <RootStack.Screen
            name="ChatDetail"
            component={ChatDetailScreen}
            options={{
              animation: 'slide_from_right',
              animationDuration: 100,
              gestureEnabled: true
            }}
          />
          {webAppsEnabled ? (
            <RootStack.Screen
              name="WebAppDetail"
              component={WebAppDetailScreen}
              options={{ animation: 'none', gestureEnabled: true }}
            />
          ) : null}
          <RootStack.Screen
            name="ChatDirectoryPickerOverlay"
            component={ChatDirectoryPickerOverlayScreen}
            options={{
              animation: 'none',
              contentStyle: { backgroundColor: theme.colors.overlay },
              gestureEnabled: false,
              presentation: 'transparentModal'
            }}
          />
          <RootStack.Screen
            name="About"
            component={AboutScreen}
            options={{ animation: 'slide_from_right', gestureEnabled: true }}
          />
          <RootStack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              animation: 'slide_from_right',
              animationDuration: 100,
              gestureEnabled: true
            }}
          />
          <RootStack.Screen
            name="AgentWaitingDemo"
            component={AgentWaitingDemoScreen}
            options={{
              animation: 'slide_from_right',
              animationDuration: 100,
              gestureEnabled: true
            }}
          />
        </RootStack.Navigator>
      </WebAppsRuntimeProvider>
    </AgentTaskBoardProvider>
  );
}
