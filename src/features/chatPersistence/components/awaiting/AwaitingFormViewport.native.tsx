import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { AwaitingFormViewportHandle, AwaitingFormViewportProps } from './AwaitingFormViewportTypes';
import { useAwaitingFormFrame } from './useAwaitingFormFrame';

const FormViewport = forwardRef<AwaitingFormViewportHandle, AwaitingFormViewportProps>(
  function FormViewport(props, ref) {
    const webViewRef = useRef<WebView | null>(null);
    const frame = useAwaitingFormFrame(props);
    frame.sendRef.current = (message) => webViewRef.current?.postMessage(message);
    useImperativeHandle(ref, () => ({ collect: frame.collect }), [frame.collect]);
    if (!frame.frameHtml)
      return (
        <View className="min-h-28 items-center justify-center">
          {frame.loading ? <ActivityIndicator /> : <Text className="text-app-danger">{frame.error}</Text>}
        </View>
      );
    return (
      <View
        className="overflow-hidden rounded-app-md border border-app-line bg-app-background"
        style={{ height: frame.height }}
      >
        <WebView
          key={frame.frameId}
          ref={webViewRef}
          source={{ html: frame.frameHtml, baseUrl: 'about:blank' }}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled={false}
          cacheEnabled={false}
          incognito={Platform.OS === 'ios'}
          mixedContentMode="never"
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          onMessage={(event) => frame.handleMessage(event.nativeEvent.data)}
          onShouldStartLoadWithRequest={(request) =>
            request.url === 'about:blank' || request.url.startsWith('data:text/html')
          }
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />
      </View>
    );
  }
);
export const AwaitingFormViewport = memo(FormViewport);
