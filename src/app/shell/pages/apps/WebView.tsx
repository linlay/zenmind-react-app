import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildWebViewPostMessageScript,
  createWebViewAuthRefreshResultMessage,
  createWebViewAuthTokenMessage,
  parseWebViewAuthRefreshRequest,
  WebViewAuthRefreshOutcome
} from '../../../../core/auth/webViewAuthBridge';
import { THEMES } from '../../../../core/constants/theme';
import { useAppSelector } from '../../../store/hooks';
import { getAppByKey } from './config';
import { AppsRouteBridgeProps, AppsRouteScreenProps } from './types';

const APPS_WEBVIEW_BRIDGE_SCRIPT = `
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

export function AppsWebViewRouteScreen({
  navigation,
  route,
  onBindNavigation,
  onRouteFocus,
  runtime
}: AppsRouteScreenProps<'AppsWebView'> & AppsRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const app = useMemo(() => getAppByKey(route.params?.appKey), [route.params?.appKey]);
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const postToWebView = useCallback((payload: Record<string, unknown>) => {
    if (!webViewRef.current) {
      return;
    }
    webViewRef.current.injectJavaScript(buildWebViewPostMessageScript(payload));
  }, []);

  const pushLatestToken = useCallback(() => {
    const message = createWebViewAuthTokenMessage(
      runtime?.authAccessToken || '',
      runtime?.authAccessExpireAtMs
    );
    if (!message) {
      return;
    }
    postToWebView(message as unknown as Record<string, unknown>);
  }, [postToWebView, runtime?.authAccessExpireAtMs, runtime?.authAccessToken]);

  useEffect(() => {
    onBindNavigation?.(navigation);
  }, [navigation, onBindNavigation]);

  useEffect(() => {
    const notifyFocus = () => {
      onRouteFocus?.('AppsWebView', app?.key);
    };

    notifyFocus();
    const unsubscribe = navigation.addListener('focus', notifyFocus);
    return unsubscribe;
  }, [app?.key, navigation, onRouteFocus]);

  useEffect(() => {
    if (!runtime?.authTokenSignal) {
      return;
    }
    pushLatestToken();
  }, [pushLatestToken, runtime?.authTokenSignal]);

  if (!app) {
    return (
      <View style={[styles.stateWrap, { backgroundColor: theme.surface }]} testID="apps-webview-missing-page">
        <Text style={[styles.stateTitle, { color: theme.text }]}>小应用不存在</Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.surfaceStrong }]} testID="apps-webview-page">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ uri: app.url }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        injectedJavaScript={APPS_WEBVIEW_BRIDGE_SCRIPT}
        onLoadStart={() => {
          setLoading(true);
          setError('');
        }}
        onLoadEnd={() => {
          setLoading(false);
          pushLatestToken();
        }}
        onError={(event) => {
          setLoading(false);
          setError(String(event?.nativeEvent?.description || '加载失败'));
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
          const refreshTask = runtime?.onWebViewAuthRefreshRequest
            ? runtime.onWebViewAuthRefreshRequest(request.requestId, request.source)
            : fallback;
          refreshTask
            .then((outcome) => {
              const result = createWebViewAuthRefreshResultMessage(request.requestId, outcome);
              postToWebView(result as unknown as Record<string, unknown>);
            })
            .catch((refreshError) => {
              const result = createWebViewAuthRefreshResultMessage(request.requestId, {
                ok: false,
                error: String((refreshError as Error)?.message || 'refresh failed')
              });
              postToWebView(result as unknown as Record<string, unknown>);
            });
        }}
      />

      {loading ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.overlayText, { color: theme.textSoft }]}>正在加载小应用...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.overlay}>
          <Text style={[styles.overlayText, { color: theme.danger }]}>小应用加载失败：{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1
  },
  webView: {
    flex: 1
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18
  },
  overlayText: {
    fontSize: 12,
    textAlign: 'center'
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600'
  }
});
