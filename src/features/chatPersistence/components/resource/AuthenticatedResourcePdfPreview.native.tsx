import { memo, useCallback } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import type { AuthenticatedResourcePdfPreviewProps } from './AuthenticatedResourcePdfPreview.tsx';

function isAllowedPdfNavigation(targetUrl: string, navigation: WebViewNavigation): boolean {
  return navigation.url === targetUrl || navigation.url === 'about:blank';
}

export const AuthenticatedResourcePdfPreview = memo(function AuthenticatedResourcePdfPreview({
  source,
  unavailableLabel,
  onError
}: AuthenticatedResourcePdfPreviewProps) {
  const handleShouldStart = useCallback(
    (navigation: WebViewNavigation) => isAllowedPdfNavigation(source.uri, navigation),
    [source.uri]
  );

  if (Platform.OS !== 'ios') {
    return (
      <View className="flex-1 items-center justify-center px-app-lg">
        <Text allowFontScaling={false} className="text-center text-app-body text-app-secondary">
          {unavailableLabel}
        </Text>
      </View>
    );
  }

  return (
    <WebView
      source={source}
      originWhitelist={['http://*', 'https://*']}
      javaScriptEnabled={false}
      domStorageEnabled={false}
      cacheEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      allowsLinkPreview={false}
      allowsBackForwardNavigationGestures={false}
      onShouldStartLoadWithRequest={handleShouldStart}
      onError={() => onError(unavailableLabel)}
      onHttpError={() => onError(unavailableLabel)}
      className="flex-1 bg-app-background"
    />
  );
});
