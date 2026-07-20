import { memo, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { useT } from '../../i18n';
import { useAppTheme } from '../../visual/AppThemeProvider';
import type { ConversationPreviewSurfaceProps } from './types';
import { useConversationPreviewRuntime } from './useConversationPreviewRuntime';

function isAllowedRuntimeNavigation(navigation: WebViewNavigation): boolean {
  const url = navigation.url || '';
  return url === 'about:blank' || url.startsWith('data:text/html');
}

export const PreviewSurface = memo(function PreviewSurface(props: ConversationPreviewSurfaceProps) {
  const { active, mode, onError } = props;
  const t = useT();
  const { theme: appTheme } = useAppTheme();
  const webViewRef = useRef<WebView>(null);
  const { handleRawEvent, height, requestId, runtimeHtml, serializedRequest } = useConversationPreviewRuntime(props);
  const handleLoadEnd = useCallback(() => {
    webViewRef.current?.postMessage(serializedRequest);
  }, [serializedRequest]);
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => handleRawEvent(event.nativeEvent.data),
    [handleRawEvent]
  );
  const handleShouldStartLoad = useCallback((navigation: WebViewNavigation) => {
    return isAllowedRuntimeNavigation(navigation);
  }, []);

  if (!active || !runtimeHtml) {
    return (
      <View
        className="items-center justify-center bg-app-surface-muted"
        style={mode === 'overlay' ? styles.overlay : { height }}
      >
        {active ? <ActivityIndicator color={appTheme.colors.brandBlue} /> : null}
      </View>
    );
  }

  return (
    <View style={mode === 'overlay' ? styles.overlay : { height }}>
      <WebView
        key={requestId}
        ref={webViewRef}
        source={{ html: runtimeHtml, baseUrl: 'about:blank' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        incognito
        mixedContentMode="never"
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        allowsBackForwardNavigationGestures={false}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onError={() => onError(t('markdownPreview.crashed'))}
        onHttpError={() => onError(t('markdownPreview.httpError'))}
        onContentProcessDidTerminate={() => onError(t('markdownPreview.crashed'))}
        onRenderProcessGone={() => onError(t('markdownPreview.crashed'))}
        style={styles.webView}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: { flex: 1, minHeight: 240 },
  webView: { flex: 1, backgroundColor: 'transparent' }
});
