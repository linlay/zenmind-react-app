import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { FrontendToolState } from '../types/chat';

export const WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  var origPostMessage = window.postMessage;
  window.postMessage = function(data, targetOrigin) {
    if (data && typeof data === 'object' &&
        (data.type === 'agw_frontend_submit' || data.type === 'agw_chat_message')) {
      window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }
    origPostMessage.call(window, data, targetOrigin);
  };
  true;
})();
`;

interface ComposerProps {
  theme: {
    surfaceStrong: string;
    surface: string;
    text: string;
    textMute: string;
    primary: string;
    primaryDeep: string;
    danger: string;
  };
  composerText: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  activeFrontendTool: FrontendToolState | null;
  frontendToolWebViewRef: React.RefObject<WebView>;
  onFrontendToolMessage: (event: { nativeEvent: { data: string } }) => void;
  onFrontendToolLoad: () => void;
}

export function Composer({
  theme,
  composerText,
  onChangeText,
  onSend,
  onStop,
  streaming,
  activeFrontendTool,
  frontendToolWebViewRef,
  onFrontendToolMessage,
  onFrontendToolLoad
}: ComposerProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.surfaceStrong }]}> 
      {activeFrontendTool ? (
        <View style={styles.frontendToolContainer}>
          {activeFrontendTool.loading ? (
            <View style={styles.center}>
              <Text style={{ color: theme.text }}>加载前端工具...</Text>
            </View>
          ) : activeFrontendTool.loadError ? (
            <View style={styles.center}>
              <Text style={{ color: theme.danger }}>{activeFrontendTool.loadError}</Text>
            </View>
          ) : activeFrontendTool.viewportHtml ? (
            <WebView
              ref={frontendToolWebViewRef}
              originWhitelist={['*']}
              source={{ html: activeFrontendTool.viewportHtml }}
              style={styles.frontendToolWebView}
              javaScriptEnabled
              injectedJavaScript={WEBVIEW_BRIDGE_SCRIPT}
              onMessage={onFrontendToolMessage as never}
              onLoad={onFrontendToolLoad}
              scrollEnabled
              nestedScrollEnabled
            />
          ) : (
            <View style={styles.center}>
              <Text style={{ color: theme.textMute }}>等待前端工具就绪...</Text>
            </View>
          )}
        </View>
      ) : (
        <>
          <TextInput
            value={composerText}
            onChangeText={onChangeText}
            placeholder={streaming ? '正在流式输出中，可点击停止' : '输入消息...'}
            placeholderTextColor={theme.textMute}
            editable={!streaming}
            multiline
            numberOfLines={1}
            scrollEnabled
            textAlignVertical="top"
            style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
          />

          <View style={styles.bottomRow}>
            {composerText.length > 0 ? (
              <Text style={[styles.charCount, { color: theme.textMute }]}>{composerText.length}</Text>
            ) : <View />}

            {streaming ? (
              <TouchableOpacity activeOpacity={0.9} style={[styles.actionBtn, { backgroundColor: theme.danger }]} onPress={onStop}>
                <View style={styles.stopSquare} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={0.9} style={styles.actionBtn} onPress={onSend}>
                <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.sendGradient}>
                  <Text style={styles.sendText}>↑</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 10,
    marginHorizontal: 14,
    marginBottom: 8
  },
  input: {
    minHeight: 40,
    maxHeight: 140,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    lineHeight: 20
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6
  },
  charCount: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4
  },
  actionBtn: {
    borderRadius: 12,
    overflow: 'hidden'
  },
  sendGradient: {
    width: 44,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  stopSquare: {
    width: 14,
    height: 14,
    backgroundColor: '#fff',
    borderRadius: 2,
    margin: 13
  },
  frontendToolContainer: {
    minHeight: 130,
    maxHeight: 340,
    borderRadius: 12,
    overflow: 'hidden'
  },
  frontendToolWebView: {
    flex: 1
  },
  center: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
