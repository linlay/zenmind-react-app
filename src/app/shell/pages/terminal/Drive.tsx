import { useEffect } from 'react';
import { View } from 'react-native';

import { DriveContent } from '../drive/DriveContent';
import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

export function TerminalDriveRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus
}: TerminalRouteScreenProps<'TerminalDrive'> & TerminalRouteBridgeProps) {
  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('TerminalDrive');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  return (
    <View style={{ flex: 1 }}>
      <DriveContent testIDPrefix="terminal-drive" />
    </View>
  );
}
