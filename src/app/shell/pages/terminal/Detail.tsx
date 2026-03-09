import { useMemo } from 'react';

import { AppTheme, THEMES } from '../../../../core/constants/theme';
import { TerminalScreen as TerminalModuleScreen } from '../../../../modules/terminal/screens/TerminalScreen';
import { useAppSelector } from '../../../store/hooks';

import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';
import { ShellHeaderActionButton, ShellHeaderBackButton, ShellHeaderTitle } from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';

export function buildTerminalDetailHeader(theme: AppTheme, onBack: () => void, onRefresh: () => void): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderBackButton theme={theme} testID="terminal-detail-back-btn" onPress={onBack} />,
    center: <ShellHeaderTitle theme={theme} title="终端/CLI" />,
    right: <ShellHeaderActionButton theme={theme} label="刷新" testID="shell-terminal-refresh-btn" onPress={onRefresh} />
  };
}

export function TerminalDetailRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus,
  runtime
}: TerminalRouteScreenProps<'TerminalDetail'> & TerminalRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('TerminalDetail')
  });

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
