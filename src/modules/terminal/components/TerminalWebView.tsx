import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildWebViewPostMessageScript,
  createWebViewAuthTokenMessage,
  relayWebViewAuthMessage,
  WEBVIEW_AUTH_BRIDGE_SCRIPT,
  WebViewAuthRefreshOutcome
} from '../../../core/auth/webViewAuthBridge';
import { EmbeddedWebViewState } from '../../../core/components/EmbeddedWebViewState';

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
  onUrlChange?: (url: string) => void;
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
  onUrlChange,
  onAuthRefreshRequest
}: TerminalWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const lastReportedUrlRef = useRef('');
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
        injectedJavaScript={WEBVIEW_AUTH_BRIDGE_SCRIPT}
        onNavigationStateChange={(navState) => {
          const nextUrl = String(navState?.url || '').trim();
          if (!nextUrl || nextUrl === lastReportedUrlRef.current) {
            return;
          }
          lastReportedUrlRef.current = nextUrl;
          onUrlChange?.(nextUrl);
        }}
        onLoadStart={() => {
          clearLoadTimer();
          setLoadTimedOut(false);
          loadTimerRef.current = setTimeout(() => {
            setLoadTimedOut(true);
          }, 8000);
          onLoadStart();
        }}
        onLoadEnd={() => {
          clearLoadTimer();
          setLoadTimedOut(false);
          onLoadEnd();
          pushLatestToken();
        }}
        onError={(event) => {
          const message = String(event?.nativeEvent?.description || '加载失败');
          clearLoadTimer();
          setLoadTimedOut(false);
          onError(message);
        }}
        onMessage={(event) => {
          relayWebViewAuthMessage({
            raw: event?.nativeEvent?.data,
            onAuthRefreshRequest,
            postMessage: postToTerminalWebView
          }).catch(() => {});
        }}
      />

      <EmbeddedWebViewState
        loading={loading && !loadTimedOut}
        error={error}
        loadingText="正在加载 PTY 前端..."
        errorTitle="PTY 页面加载失败"
        errorDetail={`地址：${uri}`}
        theme={theme}
      />
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
  }
});
