import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildWebViewPostMessageScript,
  createWebViewAuthTokenMessage,
  parseWebViewBridgePayload,
  relayWebViewAuthMessage,
} from '../../../../core/auth/webViewAuthBridge';
import { EmbeddedWebViewState } from '../../../../core/components/EmbeddedWebViewState';
import { THEMES } from '../../../../core/constants/theme';
import { formatError } from '../../../../core/network/apiClient';
import { useAppSelector } from '../../../store/hooks';
import { useShellRouteBridge } from '../../hooks/useShellRouteBridge';
import { useGetAppsQuery } from './appsApi';
import { getAppByKey, resolveAppWebViewUrl } from './helpers';
import { AppsRouteBridgeProps, AppsRouteScreenProps } from './types';

type AppsWebViewDebugMessage =
  | {
      type: 'apps_webview_bootstrap';
      stage: string;
      href: string;
      baseURI: string;
      apiBase: string;
      appContext: unknown;
    }
  | {
      type: 'apps_webview_fetch_request';
      requestId: string;
      method: string;
      url: string;
      href: string;
      apiBase: string;
    }
  | {
      type: 'apps_webview_fetch_response';
      requestId: string;
      method: string;
      url: string;
      status: number;
      ok: boolean;
      redirected: boolean;
      contentType: string;
      responseUrl: string;
    }
  | {
      type: 'apps_webview_fetch_error';
      requestId: string;
      method: string;
      url: string;
      error: string;
    };

const APPS_WEBVIEW_DIAGNOSTIC_SCRIPT = `
(function() {
  function post(payload) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      return;
    }
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (error) {}
  }
  function safeString(value) {
    return typeof value === 'string' ? value : String(value || '');
  }
  function safeClone(value) {
    if (value === null || value === undefined) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return safeString(value);
    }
  }
  function resolveApiBase() {
    var context = window.__APP_CONTEXT__;
    return safeString((context && context.apiBase) || './api');
  }
  function resolveRequestUrl(input) {
    try {
      if (typeof input === 'string') {
        return new URL(input, window.location.href).toString();
      }
      if (input && typeof input === 'object' && input.url) {
        return new URL(String(input.url), window.location.href).toString();
      }
    } catch (error) {}
    if (input && typeof input === 'object' && input.url) {
      return safeString(input.url);
    }
    return safeString(input);
  }
  function reportBootstrap(stage) {
    post({
      type: 'apps_webview_bootstrap',
      stage: safeString(stage),
      href: safeString(window.location && window.location.href),
      baseURI: safeString(document && document.baseURI),
      apiBase: resolveApiBase(),
      appContext: safeClone(window.__APP_CONTEXT__ || null)
    });
  }
  reportBootstrap('before_content_loaded');
  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      var requestId = 'wv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      var method = safeString((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var url = resolveRequestUrl(input);
      post({
        type: 'apps_webview_fetch_request',
        requestId: requestId,
        method: method,
        url: url,
        href: safeString(window.location && window.location.href),
        apiBase: resolveApiBase()
      });
      return originalFetch(input, init)
        .then(function(response) {
          var contentType = '';
          try {
            contentType = safeString(response.headers && response.headers.get && response.headers.get('content-type'));
          } catch (error) {}
          post({
            type: 'apps_webview_fetch_response',
            requestId: requestId,
            method: method,
            url: url,
            status: Number(response.status || 0),
            ok: Boolean(response.ok),
            redirected: Boolean(response.redirected),
            contentType: contentType,
            responseUrl: safeString(response.url)
          });
          return response;
        })
        .catch(function(error) {
          post({
            type: 'apps_webview_fetch_error',
            requestId: requestId,
            method: method,
            url: url,
            error: safeString((error && error.message) || error || 'fetch_failed')
          });
          throw error;
        });
    };
  }
  if (document && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function() {
      reportBootstrap('dom_content_loaded');
    }, false);
  }
  if (window && window.addEventListener) {
    window.addEventListener('load', function() {
      reportBootstrap('load');
    }, false);
  }
  true;
})();
`;

function parseAppsWebViewDebugMessage(raw: unknown): AppsWebViewDebugMessage | null {
  const payload = parseWebViewBridgePayload(raw);
  if (!payload) {
    return null;
  }

  const type = String(payload.type || '');
  if (type === 'apps_webview_bootstrap') {
    return {
      type,
      stage: String(payload.stage || ''),
      href: String(payload.href || ''),
      baseURI: String(payload.baseURI || ''),
      apiBase: String(payload.apiBase || ''),
      appContext: payload.appContext
    };
  }

  if (type === 'apps_webview_fetch_request') {
    return {
      type,
      requestId: String(payload.requestId || ''),
      method: String(payload.method || 'GET'),
      url: String(payload.url || ''),
      href: String(payload.href || ''),
      apiBase: String(payload.apiBase || '')
    };
  }

  if (type === 'apps_webview_fetch_response') {
    return {
      type,
      requestId: String(payload.requestId || ''),
      method: String(payload.method || 'GET'),
      url: String(payload.url || ''),
      status: Number(payload.status || 0),
      ok: Boolean(payload.ok),
      redirected: Boolean(payload.redirected),
      contentType: String(payload.contentType || ''),
      responseUrl: String(payload.responseUrl || '')
    };
  }

  if (type === 'apps_webview_fetch_error') {
    return {
      type,
      requestId: String(payload.requestId || ''),
      method: String(payload.method || 'GET'),
      url: String(payload.url || ''),
      error: String(payload.error || 'fetch_failed')
    };
  }

  return null;
}

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
  const lastKnownUrlRef = useRef(sourceUri);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastKnownUrl, setLastKnownUrl] = useState(sourceUri);

  const postToWebView = useCallback((payload: Record<string, unknown>) => {
    if (!webViewRef.current || typeof webViewRef.current.injectJavaScript !== 'function') {
      return;
    }
    webViewRef.current.injectJavaScript(buildWebViewPostMessageScript(payload));
  }, []);

  const pushLatestToken = useCallback(() => {
    const message = createWebViewAuthTokenMessage(runtime?.authAccessToken || '', runtime?.authAccessExpireAtMs);
    if (!message) {
      return;
    }
    postToWebView(message as unknown as Record<string, unknown>);
  }, [postToWebView, runtime?.authAccessExpireAtMs, runtime?.authAccessToken]);

  const updateLastKnownUrl = useCallback((value: unknown) => {
    const nextUrl = String(value || '').trim();
    if (!nextUrl || nextUrl === lastKnownUrlRef.current) {
      return;
    }
    lastKnownUrlRef.current = nextUrl;
    setLastKnownUrl(nextUrl);
    if (__DEV__) {
      console.log(`[apps-webview] navigation ${nextUrl}`);
    }
  }, []);

  const handleDebugMessage = useCallback(
    (raw: unknown): boolean => {
      const message = parseAppsWebViewDebugMessage(raw);
      if (!message) {
        return false;
      }

      if (message.type === 'apps_webview_bootstrap') {
        updateLastKnownUrl(message.href);
      }

      if (!__DEV__) {
        return true;
      }

      if (message.type === 'apps_webview_bootstrap') {
        console.log('[apps-webview] bootstrap', {
          stage: message.stage,
          href: message.href,
          baseURI: message.baseURI,
          apiBase: message.apiBase,
          appContext: message.appContext
        });
        return true;
      }

      if (message.type === 'apps_webview_fetch_request') {
        console.log('[apps-webview] fetch request', {
          requestId: message.requestId,
          method: message.method,
          url: message.url,
          href: message.href,
          apiBase: message.apiBase
        });
        return true;
      }

      if (message.type === 'apps_webview_fetch_response') {
        const logger = message.ok && message.status < 400 ? console.log : console.warn;
        logger('[apps-webview] fetch response', {
          requestId: message.requestId,
          method: message.method,
          url: message.url,
          status: message.status,
          redirected: message.redirected,
          contentType: message.contentType,
          responseUrl: message.responseUrl
        });
        return true;
      }

      console.warn('[apps-webview] fetch error', {
        requestId: message.requestId,
        method: message.method,
        url: message.url,
        error: message.error
      });
      return true;
    },
    [updateLastKnownUrl]
  );

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

  useEffect(() => {
    lastKnownUrlRef.current = sourceUri;
    setLastKnownUrl(sourceUri);
  }, [sourceUri]);

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

  if (!sourceUri)
    return (
      <View style={[styles.stateWrap, { backgroundColor: theme.surface }]} testID="apps-webview-missing-url-page">
        <Text style={[styles.stateTitle, { color: theme.text }]}>小应用地址无效</Text>
      </View>
    );

  return (
    <View style={[styles.page, { backgroundColor: theme.surfaceStrong }]} testID="apps-webview-page">
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ uri: sourceUri }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        injectedJavaScriptBeforeContentLoaded={APPS_WEBVIEW_DIAGNOSTIC_SCRIPT}
        onNavigationStateChange={(navState) => {
          updateLastKnownUrl(navState?.url);
        }}
        onLoadStart={() => {
          setLoading(true);
          setError('');
        }}
        onLoadEnd={() => {
          setLoading(false);
          pushLatestToken();
        }}
        onHttpError={(event) => {
          const statusCode = Number(event?.nativeEvent?.statusCode || 0);
          const url = String(event?.nativeEvent?.url || '');
          const description = String(event?.nativeEvent?.description || '请求失败');
          updateLastKnownUrl(url);
          setLoading(false);
          setError(statusCode > 0 ? `HTTP ${statusCode}: ${description}` : description);
          if (__DEV__) {
            console.warn('[apps-webview] document http error', {
              statusCode,
              description,
              url
            });
          }
        }}
        onError={(event) => {
          const description = String(event?.nativeEvent?.description || '加载失败');
          const errorCode = Number(event?.nativeEvent?.code || 0);
          const failingUrl = String(event?.nativeEvent?.url || '');
          updateLastKnownUrl(failingUrl);
          setLoading(false);
          setError(errorCode ? `网络错误 (${errorCode}): ${description}` : `网络错误: ${description}`);
          if (__DEV__) {
            console.warn('[apps-webview] document load error', {
              code: errorCode,
              description,
              url: failingUrl
            });
          }
        }}
        onMessage={(event) => {
          if (handleDebugMessage(event?.nativeEvent?.data)) {
            return;
          }
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
        errorDetail={error ? `地址：${lastKnownUrl || sourceUri}` : undefined}
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
