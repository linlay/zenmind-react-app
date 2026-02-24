import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildWebViewPostMessageScript,
  createWebViewAuthRefreshResultMessage,
  createWebViewAuthTokenMessage,
  parseWebViewAuthRefreshRequest,
  WebViewAuthRefreshOutcome
} from '../../../core/auth/webViewAuthBridge';

const TERMINAL_WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  var origPostMessage = window.postMessage;
  window.postMessage = function(data, targetOrigin) {
    if (data && typeof data === 'object' && data.type === 'auth_refresh_request') {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
    origPostMessage.call(window, data, targetOrigin);
  };
  true;
})();
`;

interface TerminalWebViewProps {
  uri: string;
  reloadKey: number;
  loading: boolean;
  error: string;
  authAccessToken?: string;
  authAccessExpireAtMs?: number;
  authTokenSignal?: number;
  theme: {
    textSoft: string;
    danger: string;
    textMute: string;
    primary: string;
    surfaceStrong: string;
  };
  onLoadStart: () => void;
  onLoadEnd: () => void;
  onError: (message: string) => void;
  onAuthRefreshRequest?: (requestId: string, source: string) => Promise<WebViewAuthRefreshOutcome>;
}

export function TerminalWebView({
  uri,
  reloadKey,
  loading,
  error,
  authAccessToken = '',
  authAccessExpireAtMs,
  authTokenSignal = 0,
  theme,
  onLoadStart,
  onLoadEnd,
  onError,
  onAuthRefreshRequest
}: TerminalWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }, []);

  const postToTerminalWebView = useCallback((payload: Record<string, unknown>) => {
    if (!webViewRef.current) {
      return;
    }
    webViewRef.current.injectJavaScript(buildWebViewPostMessageScript(payload));
  }, []);

  const pushLatestToken = useCallback(() => {
    const message = createWebViewAuthTokenMessage(authAccessToken, authAccessExpireAtMs);
    if (!message) {
      return;
    }
    postToTerminalWebView(message as unknown as Record<string, unknown>);
  }, [authAccessExpireAtMs, authAccessToken, postToTerminalWebView]);

  useEffect(() => {
    if (!authTokenSignal) {
      return;
    }
    pushLatestToken();
  }, [authTokenSignal, pushLatestToken]);

  useEffect(() => {
    return () => clearLoadTimer();
  }, [clearLoadTimer]);

  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceStrong }]}> 
      <WebView
        ref={webViewRef}
        key={`${uri}:${reloadKey}`}
        originWhitelist={['*']}
        source={{ uri }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        injectedJavaScript={TERMINAL_WEBVIEW_BRIDGE_SCRIPT}
        onLoadStart={() => {
          console.log('[TerminalWebView] onLoadStart uri=', uri);
          clearLoadTimer();
          setLoadTimedOut(false);
          loadTimerRef.current = setTimeout(() => {
            console.warn('[TerminalWebView] load timed out after 8s, hiding overlay');
            setLoadTimedOut(true);
          }, 8000);
          onLoadStart();
        }}
        onLoadEnd={() => {
          console.log('[TerminalWebView] onLoadEnd uri=', uri);
          clearLoadTimer();
          setLoadTimedOut(false);
          onLoadEnd();
          pushLatestToken();
        }}
        onError={(event) => {
          const message = String(event?.nativeEvent?.description || '加载失败');
          console.warn('[TerminalWebView] onError:', message, 'uri=', uri);
          clearLoadTimer();
          setLoadTimedOut(false);
          onError(message);
        }}
        onMessage={(event) => {
          const request = parseWebViewAuthRefreshRequest(event?.nativeEvent?.data);
          if (!request) {
            return;
          }
          const fallback = Promise.resolve<WebViewAuthRefreshOutcome>({
            ok: false,
            error: 'Auth refresh handler unavailable'
          });
          const refreshTask = onAuthRefreshRequest
            ? onAuthRefreshRequest(request.requestId, request.source)
            : fallback;
          refreshTask
            .then((outcome) => {
              const result = createWebViewAuthRefreshResultMessage(request.requestId, outcome);
              postToTerminalWebView(result as unknown as Record<string, unknown>);
            })
            .catch((error) => {
              const result = createWebViewAuthRefreshResultMessage(request.requestId, {
                ok: false,
                error: String((error as Error)?.message || 'refresh failed')
              });
              postToTerminalWebView(result as unknown as Record<string, unknown>);
            });
        }}
      />

      {loading && !loadTimedOut ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.overlayText, { color: theme.textSoft }]}>正在加载 PTY 前端...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.overlay}>
          <Text style={[styles.overlayText, { color: theme.danger }]}>PTY 页面加载失败：{error}</Text>
          <Text style={[styles.overlayText, { color: theme.textMute }]}>地址：{uri}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    overflow: 'hidden'
  },
  webView: {
    flex: 1
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 8
  },
  overlayText: {
    fontSize: 12,
    textAlign: 'center'
  }
});
