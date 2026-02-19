import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface TerminalWebViewProps {
  uri: string;
  reloadKey: number;
  loading: boolean;
  error: string;
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
}

export function TerminalWebView({
  uri,
  reloadKey,
  loading,
  error,
  theme,
  onLoadStart,
  onLoadEnd,
  onError
}: TerminalWebViewProps) {
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surfaceStrong }]}> 
      <WebView
        key={`${uri}:${reloadKey}`}
        originWhitelist={['*']}
        source={{ uri }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        mixedContentMode="always"
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onError={(event) => {
          const message = String(event?.nativeEvent?.description || '加载失败');
          onError(message);
        }}
      />

      {loading ? (
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
    borderRadius: 14,
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
