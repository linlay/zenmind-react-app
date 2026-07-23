import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { getApiBaseUrl } from '../../core/api/apiClient';
import { useAuthSession } from '../../core/auth/useAuthSession';
import { isAuthRequired } from '../../core/auth/authConfig';
import { AgentTaskBoardFlowNavigator } from '../../features/agentTaskBoard/AgentTaskBoardFlowNavigator';
import { AgentTaskBoardProvider } from '../../features/agentTaskBoard/AgentTaskBoardProvider';
import { AuthBootstrapScreen, LoginScreen } from '../../features/auth/LoginScreen';
import { ChatDetailScreen } from '../../features/chatPersistence/ChatDetailScreen';
import { ChatDirectoryPickerOverlayScreen } from '../../features/chatPersistence/ChatDirectoryPickerOverlayScreen';
import { WebAppDetailScreen } from '../../features/webApps/WebAppDetailScreen';
import { WebAppsRuntimeProvider } from '../../features/webApps/WebAppsRuntimeProvider';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { AgentWaitingDemoScreen } from '../screens/AgentWaitingDemoScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TabsNavigator } from './TabsNavigator';
import { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { theme } = useAppTheme();
  const { isBootstrapping, session } = useAuthSession();
  const authRequired = isAuthRequired();
  const webAppsSessionKey = session
    ? JSON.stringify([getApiBaseUrl(), session.deviceId, session.username])
    : 'anonymous';

  if (authRequired && isBootstrapping) {
    return (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Login" component={AuthBootstrapScreen} />
      </RootStack.Navigator>
    );
  }

  if (authRequired && !session) {
    return (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Login" component={LoginScreen} />
      </RootStack.Navigator>
    );
  }

  return (
    <AgentTaskBoardProvider>
      <WebAppsRuntimeProvider key={webAppsSessionKey}>
        <RootStack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
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
          <RootStack.Screen
            name="WebAppDetail"
            component={WebAppDetailScreen}
            options={{ animation: 'none', gestureEnabled: true }}
          />
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
