import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { agentsPlaceholderHtml } from '../webview/agentsPlaceholderHtml';

export function AgentsWebViewPlaceholder() {
  return (
    <View style={styles.wrap}>
      <WebView originWhitelist={['*']} source={{ html: agentsPlaceholderHtml }} style={styles.webView} />
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
