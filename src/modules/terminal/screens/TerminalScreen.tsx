import { StyleSheet, View } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { normalizePtyUrlInput } from '../../../core/network/endpoint';
import { WebViewAuthRefreshOutcome } from '../../../core/auth/webViewAuthBridge';
import { setPtyLoadError, setPtyLoading } from '../state/terminalSlice';
import { TerminalWebView } from '../components/TerminalWebView';
import { buildPtyWebUrlWithSessionId } from '../utils/sessionUrl';

interface TerminalScreenProps {
  theme: {
    surfaceStrong: string;
    surface: string;
    text: string;
    primaryDeep: string;
  };
  authAccessToken?: string;
  authAccessExpireAtMs?: number;
  authTokenSignal?: number;
  onUrlChange?: (url: string) => void;
  onWebViewAuthRefreshRequest?: (requestId: string, source: string) => Promise<WebViewAuthRefreshOutcome>;
}

export function TerminalScreen({
  theme,
  authAccessToken = '',
  authAccessExpireAtMs,
  authTokenSignal = 0,
  onUrlChange,
  onWebViewAuthRefreshRequest
}: TerminalScreenProps) {
  const dispatch = useAppDispatch();
  const endpointInput = useAppSelector((state) => state.user.endpointInput);
  const ptyUrlInput = useAppSelector((state) => state.user.ptyUrlInput);
  const { ptyReloadKey, ptyLoading, ptyLoadError, activeSessionId, openNewSessionNonce } = useAppSelector((state) => state.terminal);

  const ptyWebUrl = buildPtyWebUrlWithSessionId(
    normalizePtyUrlInput(ptyUrlInput, endpointInput),
    activeSessionId,
    { openNewSessionNonce }
  );

  return (
    <View style={styles.container} nativeID="terminal-root" testID="terminal-root">
      <TerminalWebView
        uri={ptyWebUrl}
        reloadKey={ptyReloadKey}
        loading={ptyLoading}
        error={ptyLoadError}
        authAccessToken={authAccessToken}
        authAccessExpireAtMs={authAccessExpireAtMs}
        authTokenSignal={authTokenSignal}
        theme={{ ...theme, textSoft: '#60728f', danger: '#d65252', textMute: '#8d9bb2', primary: '#2f6cf3' }}
        onUrlChange={onUrlChange}
        onLoadStart={() => {
          dispatch(setPtyLoading(true));
          dispatch(setPtyLoadError(''));
        }}
        onLoadEnd={() => dispatch(setPtyLoading(false))}
        onError={(message) => {
          dispatch(setPtyLoadError(message));
          dispatch(setPtyLoading(false));
        }}
        onAuthRefreshRequest={onWebViewAuthRefreshRequest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
