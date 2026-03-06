import { useCallback, useEffect, useMemo } from 'react';

import { THEMES } from '../../../../core/constants/theme';
import { useAppSelector } from '../../../store/hooks';
import { TerminalSessionListPane } from '../../../../modules/terminal/components/TerminalSessionListPane';

import { TerminalRouteBridgeProps, TerminalRouteScreenProps } from './types';

export function TerminalListRouteScreen({
  navigation,
  onBindNavigation,
  onRouteFocus,
  runtime
}: TerminalRouteScreenProps<'TerminalList'> & TerminalRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('TerminalList');
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [navigation, onRouteFocus]);

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
