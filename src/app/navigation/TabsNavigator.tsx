import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { Pressable, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens } from '../../shared/visual/foundation';
import { getAppTabBarMetrics } from '../../shared/visual/tabBarMetrics';
import { WebAppsScreen } from '../../features/webApps/WebAppsScreen';
import { ChatScreen, MeScreen } from '../screens/TabScreens';
import { AppTabIcon, TAB_LABEL_KEYS } from './TabIcon';
import { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
type PressableProps = ComponentProps<typeof Pressable>;
type WebBackdropStyle = ViewStyle & { backdropFilter: string };
const SCENE_STYLE = { backgroundColor: 'transparent' } satisfies ViewStyle;
const TAB_BAR_BASE_STYLE = {
  position: 'absolute',
  left: 0,
  right: 0,
  paddingHorizontal: appVisualTokens.spacing.md
} satisfies ViewStyle;
const TAB_ITEM_STYLE = {
  paddingTop: 2,
  paddingBottom: 0
} satisfies ViewStyle;
const TAB_ICON_STYLE = {
  marginBottom: 1
} satisfies ViewStyle;
const TAB_LABEL_STYLE = {
  fontSize: 12,
  fontWeight: '500'
} satisfies TextStyle;
const TAB_BAR_BACKGROUND_STYLE = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backdropFilter: 'blur(28px)'
} satisfies WebBackdropStyle;
const TAB_BAR_DIVIDER_STYLE = {
  position: 'absolute',
  top: 0,
  right: 0,
  left: 0,
  height: 1
} satisfies ViewStyle;

function TabBarBackground({ backgroundColor, dividerColor }: { backgroundColor: string; dividerColor: string }) {
  return (
    <View pointerEvents="none" style={[TAB_BAR_BACKGROUND_STYLE, { backgroundColor }]}>
      <View style={[TAB_BAR_DIVIDER_STYLE, { backgroundColor: dividerColor }]} />
    </View>
  );
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

export function TabsNavigator() {
  const insets = useSafeAreaInsets();
  const t = useT();
  const { theme } = useAppTheme();
  const tabBarMetrics = getAppTabBarMetrics(insets.bottom);

  return (
    <Tab.Navigator
      initialRouteName="Chat"
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        lazy: true,
        freezeOnBlur: true,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarLabel: t(TAB_LABEL_KEYS[route.name]),
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: theme.colors.brandBlue,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: [
          TAB_BAR_BASE_STYLE,
          {
            bottom: 0,
            height: tabBarMetrics.height,
            paddingTop: tabBarMetrics.paddingTop,
            paddingBottom: tabBarMetrics.paddingBottom,
            backgroundColor: 'transparent'
          }
        ],
        tabBarBackground: () => (
          <TabBarBackground backgroundColor={theme.colors.tabBarSurface} dividerColor={theme.colors.tabBarBorder} />
        ),
        tabBarItemStyle: TAB_ITEM_STYLE,
        tabBarIconStyle: TAB_ICON_STYLE,
        tabBarLabelStyle: TAB_LABEL_STYLE,
        sceneStyle: { ...SCENE_STYLE, backgroundColor: theme.colors.background },
        tabBarButton: TabBarButtonWithoutRipple,
        tabBarIcon: ({ color }) => <AppTabIcon routeName={route.name} color={color} />
      })}
    >
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="WebApps" component={WebAppsScreen} />
      {/* Drive tab is temporarily hidden until the module ships. */}
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}
