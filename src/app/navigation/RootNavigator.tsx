import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthSession } from '../../core/auth/useAuthSession';
import { isAuthRequired } from '../../core/auth/authConfig';
import { AuthBootstrapScreen, LoginScreen } from '../../features/auth/LoginScreen';
import { ChatDetailScreen } from '../../features/chatPersistence/ChatDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TabsNavigator } from './TabsNavigator';
import { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isBootstrapping, session } = useAuthSession();
  const authRequired = isAuthRequired();

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
    <RootStack.Navigator initialRouteName="Tabs" screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={TabsNavigator} />
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
        name="Settings"
        component={SettingsScreen}
        options={{
          animation: 'slide_from_right',
          animationDuration: 100,
          gestureEnabled: true
        }}
      />
    </RootStack.Navigator>
  );
}
