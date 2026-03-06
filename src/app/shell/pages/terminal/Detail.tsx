import { useEffect, useMemo } from 'react';

import { THEMES } from '../../../../core/constants/theme';
import { TerminalScreen as TerminalModuleScreen } from '../../../../modules/terminal/screens/TerminalScreen';
import { useAppSelector } from '../../../store/hooks';

import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

export function TerminalDetailRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus,
  runtime
}: TerminalRouteScreenProps<'TerminalDetail'> & TerminalRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('TerminalDetail');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

  return (
    <TerminalModuleScreen
      theme={theme}
      authAccessToken={runtime?.authAccessToken}
      authAccessExpireAtMs={runtime?.authAccessExpireAtMs}
      authTokenSignal={runtime?.authTokenSignal}
      onUrlChange={runtime?.onTerminalUrlChange}
      onWebViewAuthRefreshRequest={runtime?.onWebViewAuthRefreshRequest}
    />
  );
}
