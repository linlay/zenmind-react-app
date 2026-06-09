import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthSession } from '../../core/auth/useAuthSession';
import { isAuthRequired } from '../../core/auth/authConfig';
import { AuthBootstrapScreen, LoginScreen } from '../../features/auth/LoginScreen';
import { ChatScreen, DriveScreen, MeScreen, TerminalScreen } from '../screens/TabScreens';
import { ChatDetailScreen } from '../../features/chatPersistence/ChatDetailScreen';
import { useT } from '../../shared/i18n';
import { appVisualTokens } from '../../shared/visual/foundation';
import { AppTabIcon, TAB_LABEL_KEYS } from './TabIcon';
import { RootStackParamList, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
type PressableProps = ComponentProps<typeof Pressable>;
const TAB_BAR_CONTENT_HEIGHT = 44;
const TAB_BAR_TOP_PADDING = appVisualTokens.spacing.xs;
const TAB_BAR_MIN_BOTTOM_PADDING = appVisualTokens.spacing.sm;
const TAB_BAR_EXTRA_BOTTOM_GAP = appVisualTokens.spacing.xs;

function getTabBarMetrics(bottomInset: number) {
  const safeBottomPadding = Math.max(bottomInset, TAB_BAR_MIN_BOTTOM_PADDING);
  const paddingBottom = safeBottomPadding + TAB_BAR_EXTRA_BOTTOM_GAP;

  return {
    height: TAB_BAR_CONTENT_HEIGHT + TAB_BAR_TOP_PADDING + paddingBottom,
    paddingTop: TAB_BAR_TOP_PADDING,
    paddingBottom
  };
}

function TabBarButtonWithoutRipple({
  android_ripple: _androidRipple,
  href: _href,
  hoverEffect: _hoverEffect,
  pressOpacity: _pressOpacity,
  ref: _ref,
  ...props
}: BottomTabBarButtonProps & { ref?: unknown }) {
  return <Pressable {...(props as PressableProps)} android_ripple={null} />;
}

function TabsNavigator() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const tabBarMetrics = getTabBarMetrics(insets.bottom);

  return (
    <Tab.Navigator
      initialRouteName="Chat"
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        lazy: true,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarLabel: t(TAB_LABEL_KEYS[route.name]),
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: appVisualTokens.colors.brandBlue,
        tabBarInactiveTintColor: appVisualTokens.colors.textTertiary,
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: 0,
            height: tabBarMetrics.height,
            paddingTop: tabBarMetrics.paddingTop,
            paddingBottom: tabBarMetrics.paddingBottom
          }
        ],
        tabBarItemStyle: styles.tabItem,
        tabBarIconStyle: styles.tabIcon,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: styles.scene,
        tabBarButton: TabBarButtonWithoutRipple,
        tabBarIcon: ({ color }) => <AppTabIcon routeName={route.name} color={color} />
      })}
    >
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Terminal" component={TerminalScreen} />
      <Tab.Screen name="Drive" component={DriveScreen} />
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}

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
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  scene: {
    backgroundColor: appVisualTokens.colors.background
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: appVisualTokens.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.surface
  },
  tabItem: {
    paddingTop: 2,
    paddingBottom: 0
  },
  tabIcon: {
    marginBottom: 1
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500'
  }
});
