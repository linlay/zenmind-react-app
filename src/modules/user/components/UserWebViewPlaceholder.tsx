import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { userPlaceholderHtml } from '../webview/userPlaceholderHtml';

export function UserWebViewPlaceholder() {
  return (
    <View style={styles.wrap}>
      <WebView originWhitelist={['*']} source={{ html: userPlaceholderHtml }} style={styles.webView} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden'
  },
  webView: {
    flex: 1
  }
});
