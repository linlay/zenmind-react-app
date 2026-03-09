import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildWebViewPostMessageScript,
  createWebViewAuthTokenMessage,
  relayWebViewAuthMessage,
  WEBVIEW_AUTH_BRIDGE_SCRIPT,
  WebViewAuthRefreshOutcome
} from '../../../../core/auth/webViewAuthBridge';
import { EmbeddedWebViewState } from '../../../../core/components/EmbeddedWebViewState';
import { THEMES } from '../../../../core/constants/theme';
import { formatError } from '../../../../core/network/apiClient';
import { useAppSelector } from '../../../store/hooks';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';
import { useGetAppsQuery } from './appsApi';
import { getAppByKey, resolveAppWebViewUrl } from './helpers';
import { AppsRouteBridgeProps, AppsRouteScreenProps } from './types';

export function AppsWebViewRouteScreen({
  navigation,
  route,
  onBindNavigation,
  onRouteFocus,
  runtime
}: AppsRouteScreenProps<'AppsWebView'> & AppsRouteBridgeProps) {
  const themeMode = useAppSelector((state) => state.user.themeMode);
  const endpointInput = useAppSelector((state) => state.user.endpointInput);
  const theme = useMemo(() => THEMES[themeMode] || THEMES.light, [themeMode]);
  const { data, isLoading: appsLoading, isError: appsError, error: appsQueryError } = useGetAppsQuery();
  const app = useMemo(() => getAppByKey(data?.apps || [], route.params?.appKey), [data?.apps, route.params?.appKey]);
  const sourceUri = useMemo(() => resolveAppWebViewUrl(app, endpointInput), [app, endpointInput]);
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const postToWebView = useCallback((payload: Record<string, unknown>) => {
    if (!webViewRef.current || typeof webViewRef.current.injectJavaScript !== 'function') {
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

  useShellRouteBridge({
    navigation,
    onBindNavigation,
    onFocus: () => onRouteFocus?.('AppsWebView', app?.key, app?.name)
  });

  useEffect(() => {
    if (!runtime?.authTokenSignal) {
      return;
    }
    pushLatestToken();
  }, [pushLatestToken, runtime?.authTokenSignal]);

  if (appsLoading && !app) {
    return (
      <View style={[styles.stateWrap, { backgroundColor: theme.surface }]} testID="apps-webview-loading-page">
        <Text style={[styles.stateTitle, { color: theme.text }]}>正在加载小应用...</Text>
      </View>
    );
  }

  if (appsError && !app) {
    return (
      <View style={[styles.stateWrap, { backgroundColor: theme.surface }]} testID="apps-webview-error-page">
        <Text style={[styles.stateTitle, { color: theme.text }]}>小应用列表加载失败</Text>
        <Text style={[styles.stateText, { color: theme.textMute }]}>{formatError(appsQueryError)}</Text>
      </View>
    );
  }

  if (!app) {
    return (
      <View style={[styles.stateWrap, { backgroundColor: theme.surface }]} testID="apps-webview-missing-page">
        <Text style={[styles.stateTitle, { color: theme.text }]}>小应用不存在</Text>
      </View>
    );
  }

  if (!sourceUri) {
    return (
      <View style={[styles.stateWrap, { backgroundColor: theme.surface }]} testID="apps-webview-missing-url-page">
        <Text style={[styles.stateTitle, { color: theme.text }]}>小应用地址无效</Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.surfaceStrong }]} testID="apps-webview-page">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ uri: sourceUri }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        injectedJavaScript={WEBVIEW_AUTH_BRIDGE_SCRIPT}
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
          relayWebViewAuthMessage({
            raw: event?.nativeEvent?.data,
            onAuthRefreshRequest: runtime?.onWebViewAuthRefreshRequest,
            postMessage: postToWebView
          }).catch(() => {});
        }}
      />

      <EmbeddedWebViewState
        loading={loading}
        error={error}
        loadingText="正在加载小应用..."
        errorTitle="小应用加载失败"
        theme={theme}
      />
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
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '600'
  },
  stateText: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center'
  }
});
