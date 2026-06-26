import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../shared/visual/foundation';
import { getAppTabBarMetrics } from '../../shared/visual/tabBarMetrics';
import { ChatScreen, MeScreen, TerminalScreen } from '../screens/TabScreens';
import { AppTabIcon, TAB_LABEL_KEYS } from './TabIcon';
import { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
type PressableProps = ComponentProps<typeof Pressable>;

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

export function TabsNavigator() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const tabBarMetrics = getAppTabBarMetrics(insets.bottom);

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
        tabBarActiveTintColor: theme.colors.brandBlue,
        tabBarInactiveTintColor: theme.colors.textTertiary,
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
      {/* Drive tab is temporarily hidden until the module ships. */}
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    scene: {
      backgroundColor: theme.colors.background
    },
    tabBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      paddingHorizontal: appVisualTokens.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface
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
}
