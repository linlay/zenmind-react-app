import {
  createNativeBottomTabNavigator,
  type NativeBottomTabIcon
} from '@react-navigation/bottom-tabs/unstable';
import chatIcon from '../../../assets/tabs/tab-chat.png';
import meIcon from '../../../assets/tabs/tab-me.png';
import terminalIcon from '../../../assets/tabs/tab-terminal.png';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { ChatScreen, MeScreen, TerminalScreen } from '../screens/TabScreens';
import { TAB_LABEL_KEYS } from './TabIcon';
import { RootTabParamList } from './types';

const Tab = createNativeBottomTabNavigator<RootTabParamList>();

const NATIVE_TAB_ICONS: Record<keyof RootTabParamList, NativeBottomTabIcon> = {
  Chat: {
    type: 'image',
    source: chatIcon
  },
  Terminal: {
    type: 'image',
    source: terminalIcon
  },
  Me: {
    type: 'image',
    source: meIcon
  }
};

export function TabsNavigator() {
  const t = useT();
  const { theme } = useAppTheme();

  return (
    <Tab.Navigator
      initialRouteName="Chat"
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        popToTopOnBlur: false,
        tabBarActiveTintColor: theme.colors.brandBlue,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarActiveIndicatorColor: theme.colors.brandBlueSoft,
        tabBarRippleColor: theme.colors.brandBlueSoft,
        tabBarBlurEffect: 'none',
        tabBarControllerMode: 'tabBar',
        tabBarIcon: NATIVE_TAB_ICONS[route.name],
        tabBarLabel: t(TAB_LABEL_KEYS[route.name]),
        tabBarMinimizeBehavior: 'none',
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.line
        }
      })}
    >
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Terminal" component={TerminalScreen} />
      {/* Drive tab is temporarily hidden until the module ships. */}
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}
