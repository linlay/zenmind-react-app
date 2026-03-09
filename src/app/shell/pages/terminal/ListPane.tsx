import { useCallback, useMemo } from 'react';

import { AppTheme, THEMES } from '../../../../core/constants/theme';
import { useAppSelector } from '../../../store/hooks';
import { TerminalSessionListPane } from '../../../../modules/terminal/components/TerminalSessionListPane';

import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';
import { ShellHeaderActionButton, ShellHeaderPlaceholder, ShellHeaderTitle } from '../../components/ShellTopNav';
import { ShellHeaderDescriptor } from '../../header/types';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';

export function buildTerminalListHeader(theme: AppTheme, onOpenDrive: () => void): ShellHeaderDescriptor {
  return {
    left: <ShellHeaderPlaceholder />,
    center: <ShellHeaderTitle theme={theme} title="会话" />,
    right: <ShellHeaderActionButton theme={theme} label="My PC" testID="shell-terminal-drive-btn" onPress={onOpenDrive} />
  };
}

export function TerminalListRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus,
  runtime
}: TerminalRouteScreenProps<'TerminalList'> & TerminalRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('TerminalList')
  });

  const handleCreateSession = useCallback(() => {
    runtime?.onCreateSession();
    navigation.navigate('TerminalDetail');
  }, [navigation, runtime]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      runtime?.onOpenSession(sessionId);
      navigation.navigate('TerminalDetail', { sessionId });
    },
    [navigation, runtime]
  );

  const handleRefresh = useCallback(() => {
    if (!runtime) {
      return;
    }
    runtime.onRefreshSessions().catch(() => {});
  }, [runtime]);

  return (
    <TerminalSessionListPane
      theme={theme}
      loading={runtime?.loading || false}
      error={runtime?.error || ''}
      sessions={runtime?.sessions || []}
      activeSessionId={runtime?.activeSessionId || ''}
      currentWebViewUrl={runtime?.currentWebViewUrl || ''}
      onCreateSession={handleCreateSession}
      onRefresh={handleRefresh}
      onSelectSession={handleSelectSession}
    />
  );
}
