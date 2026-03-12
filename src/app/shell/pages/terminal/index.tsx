import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TerminalListRouteScreen } from './ListPane';
import { TerminalDetailRouteScreen } from './Detail';
import { TerminalDriveRouteScreen } from './Drive';
import { ShellTerminalTabScreenProps, TerminalRouteBridgeProps, TerminalStackParamList } from './types';

import { styles } from './index.styles';
import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ShellTabNavigation } from '../../types';

const Stack = createNativeStackNavigator<TerminalStackParamList>();

interface TerminalScreenProps extends TerminalRouteBridgeProps {}

export function TerminalScreen({
  onBindNavigation,
  onBindDriveNavigation,
  onDriveRouteFocus,
  onRouteFocus,
  runtime
}: TerminalScreenProps) {
  return (
    <View style={styles.domainContent}>
      <Stack.Navigator id="TerminalScreen" initialRouteName="TerminalList" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TerminalList" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <TerminalListRouteScreen
              {...props}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              runtime={runtime}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="TerminalDetail" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <TerminalDetailRouteScreen
              {...props}
              onBindNavigation={onBindNavigation}
              onRouteFocus={onRouteFocus}
              runtime={runtime}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="TerminalDrive" options={{ animation: 'slide_from_right' }}>
          {(props) => (
            <TerminalDriveRouteScreen
              {...props}
              onBindNavigation={onBindNavigation}
              onBindDriveNavigation={onBindDriveNavigation}
              onDriveRouteFocus={onDriveRouteFocus}
              onRouteFocus={onRouteFocus}
              runtime={runtime}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </View>
  );
}

export function ShellTerminalTabScreen({
  onBindRootTabNavigation,
  onDomainFocus,
  onBindNavigation,
  onBindDriveNavigation,
  onDriveRouteFocus,
  onRouteFocus,
  runtime
}: ShellTerminalTabScreenProps) {
  const navigation = useNavigation<ShellTabNavigation>();

  useEffect(() => {
    onBindRootTabNavigation(navigation);
  }, [navigation, onBindRootTabNavigation]);

  useEffect(() => {
    const notifyFocus = () => onDomainFocus?.('terminal');

    if (navigation.isFocused()) {
      notifyFocus();
    }

    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onDomainFocus]);

  return (
    <View style={styles.domainContent} testID="terminal-route-stack">
      <TerminalScreen
        onBindNavigation={onBindNavigation}
        onBindDriveNavigation={onBindDriveNavigation}
        onDriveRouteFocus={onDriveRouteFocus}
        onRouteFocus={onRouteFocus}
        runtime={runtime}
      />
    </View>
  );
}
