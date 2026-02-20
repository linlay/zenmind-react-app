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
    border: string;
    text: string;
    textMute: string;
    primary: string;
    primaryDeep: string;
    danger: string;
  };
  composerText: string;
  focused: boolean;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
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
  focused,
  onChangeText,
  onFocus,
  onBlur,
  onSend,
  onStop,
  streaming,
  activeFrontendTool,
  frontendToolWebViewRef,
  onFrontendToolMessage,
  onFrontendToolLoad
}: ComposerProps) {
  const minRows = 1;
  const minHeight = minRows * 20 + 20;

  return (
    <View style={styles.card} nativeID="chat-composer" testID="chat-composer">
      {activeFrontendTool ? (
        <View
          style={[styles.frontendToolContainer, { backgroundColor: theme.surfaceStrong, borderRadius: 20 }]}
          nativeID="frontend-tool-container"
          testID="frontend-tool-container"
        >
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
              nativeID="frontend-tool-webview"
              testID="frontend-tool-webview"
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
        <View
          style={[styles.inputShell, { backgroundColor: theme.surface, borderColor: theme.border }]}
          nativeID="chat-input-shell"
          testID="chat-input-shell"
        >
          <TextInput
            value={composerText}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={streaming ? '正在流式输出中，可点击停止' : '输入消息...'}
            placeholderTextColor={theme.textMute}
            editable={!streaming}
            multiline
            numberOfLines={minRows}
            scrollEnabled
            textAlignVertical="center"
            style={[styles.input, { color: theme.text, minHeight }]}
            nativeID="chat-input"
            testID="chat-input"
          />

          <View style={styles.actionWrap}>
            {streaming ? (
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.actionBtn, { backgroundColor: theme.danger }]}
                testID="chat-stop-btn"
                onPress={onStop}
              >
                <View style={styles.stopSquare} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.actionBtn}
                testID="chat-send-btn"
                onPress={onSend}
              >
                <LinearGradient colors={[theme.primary, theme.primaryDeep]} style={styles.sendGradient}>
                  <Text style={styles.sendText}>↑</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginBottom: 8
  },
  inputShell: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 8,
    paddingTop: 8,
    paddingBottom: 8
  },
  input: {
    flex: 1,
    maxHeight: 140,
    paddingTop: 0,
    paddingBottom: 0,
    paddingRight: 10,
    fontSize: 15,
    lineHeight: 20
  },
  actionWrap: {
    marginLeft: 6,
    marginBottom: 0
  },
  actionBtn: {
    borderRadius: 19,
    overflow: 'hidden'
  },
  sendGradient: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  stopSquare: {
    width: 13,
    height: 13,
    backgroundColor: '#fff',
    borderRadius: 2,
    margin: 12.5
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
