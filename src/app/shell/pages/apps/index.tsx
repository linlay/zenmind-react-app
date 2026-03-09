import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ShellTabNavigation } from '../../types';
import { styles } from '../terminal/index.styles';
import { AppsListRouteScreen } from './List';
import { AppsRouteBridgeProps, AppsStackParamList, ShellAppsTabScreenProps } from './types';

const Stack = createNativeStackNavigator<AppsStackParamList>();

interface AppsScreenProps extends AppsRouteBridgeProps {}

export function AppsScreen({ onBindNavigation, onRouteFocus, runtime }: AppsScreenProps) {
  return (
    <View style={styles.domainContent}>
      <Stack.Navigator id="AppsScreen" initialRouteName="AppsList" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AppsList" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <AppsListRouteScreen {...props} onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
          )}
        </Stack.Screen>
        <Stack.Screen name="AppsWebView" options={{ animation: 'slide_from_right' }}>
          {(props) => {
            const { AppsWebViewRouteScreen } = require('./WebView');
            return (
              <AppsWebViewRouteScreen
                {...props}
                onBindNavigation={onBindNavigation}
                onRouteFocus={onRouteFocus}
                runtime={runtime}
              />
            );
          }}
        </Stack.Screen>
      </Stack.Navigator>
    </View>
  );
}

export function ShellAppsTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  onBindNavigation,
  onRouteFocus,
  runtime
}: ShellAppsTabScreenProps) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('apps');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <View style={styles.domainContent} testID="apps-route-stack">
      <AppsScreen onBindNavigation={onBindNavigation} onRouteFocus={onRouteFocus} runtime={runtime} />
    </View>
  );
}
