import { useCallback, useEffect, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { FrontendToolState } from '../types/chat';

export const WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  var origPostMessage = window.postMessage;
  window.postMessage = function(data, targetOrigin) {
    if (data && typeof data === 'object' &&
        (data.type === 'frontend_submit' ||
         data.type === 'chat_message' ||
         data.type === 'auth_refresh_request')) {
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
  const maxRows = 6;
  const lineHeight = 20;
  const baseInputHeight = 22;
  const rowSwitchThreshold = lineHeight * 0.35;
  const minHeight = baseInputHeight;
  const maxHeight = baseInputHeight + (maxRows - 1) * lineHeight;
  const [visibleRows, setVisibleRows] = useState(minRows);
  const charCount = useMemo(() => Array.from(composerText || '').length, [composerText]);
  const inputHeight = minHeight + (visibleRows - minRows) * lineHeight;
  const showCharCount = !streaming && charCount > 0 && visibleRows > 1;
  const isEmpty = charCount === 0;
  const placeholderText = streaming ? '正在流式输出中，可点击停止' : '输入提问内容';
  const showPlaceholder = isEmpty;

  useEffect(() => {
    if (isEmpty) {
      setVisibleRows(minRows);
    }
  }, [isEmpty, minRows]);

  const handleContentSizeChange = useCallback(
    (event: { nativeEvent: { contentSize: { height: number } } }) => {
      if (isEmpty) {
        setVisibleRows((prev) => (prev === minRows ? prev : minRows));
        return;
      }
      const contentHeight = Math.max(minHeight, Math.min(maxHeight, Math.ceil(event.nativeEvent.contentSize.height)));
      const heightDelta = Math.max(0, contentHeight - minHeight);
      const estimatedRows = minRows + Math.floor((heightDelta + rowSwitchThreshold) / lineHeight);
      const nextRows = Math.max(minRows, Math.min(maxRows, estimatedRows));
      setVisibleRows((prev) => (prev === nextRows ? prev : nextRows));
    },
    [isEmpty, lineHeight, maxHeight, maxRows, minHeight, minRows, rowSwitchThreshold]
  );

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
          style={[
            styles.inputShell,
            visibleRows === 1 ? styles.inputShellCompact : styles.inputShellExpanded,
            { backgroundColor: theme.surface, borderColor: theme.border }
          ]}
          nativeID="chat-input-shell"
          testID="chat-input-shell"
        >
          <View style={[styles.inputBox, { minHeight, maxHeight, height: inputHeight }]}>
            {showPlaceholder ? (
              <View
                pointerEvents="none"
                style={[
                  styles.placeholderWrap,
                  visibleRows > 1 ? styles.placeholderWrapMulti : styles.placeholderWrapSingle
                ]}
              >
                <Text style={[styles.placeholderText, { color: theme.textMute }]} numberOfLines={1}>
                  {placeholderText}
                </Text>
              </View>
            ) : null}

            <TextInput
              value={composerText}
              onChangeText={onChangeText}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder=""
              editable={!streaming}
              multiline
              numberOfLines={minRows}
              scrollEnabled
              onContentSizeChange={handleContentSizeChange}
              textAlignVertical={visibleRows > 1 ? 'top' : 'center'}
              style={[
                styles.input,
                visibleRows > 1 ? styles.inputMultiRow : styles.inputSingleRow,
                { color: theme.text, minHeight, maxHeight, height: inputHeight }
              ]}
              nativeID="chat-input"
              testID="chat-input"
            />
          </View>

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
            {showCharCount ? (
              <Text style={[styles.charCount, { color: theme.textMute }]} testID="chat-input-char-count">
                {`${charCount}字`}
              </Text>
            ) : null}
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
    paddingRight: 8
  },
  inputShellCompact: {
    paddingTop: 7,
    paddingBottom: 7
  },
  inputShellExpanded: {
    paddingTop: 8,
    paddingBottom: 8
  },
  inputBox: {
    flex: 1,
    position: 'relative'
  },
  placeholderWrap: {
    ...StyleSheet.absoluteFillObject,
    paddingRight: 10
  },
  placeholderWrapSingle: {
    justifyContent: 'center'
  },
  placeholderWrapMulti: {
    justifyContent: 'flex-start'
  },
  placeholderText: {
    fontSize: 15,
    lineHeight: 20
  },
  input: {
    flex: 1,
    maxHeight: 140,
    paddingRight: 10,
    fontSize: 15,
    lineHeight: 20
  },
  inputSingleRow: {
    paddingTop: Platform.OS === 'ios' ? 1 : 0,
    paddingBottom: Platform.OS === 'ios' ? 1 : 0
  },
  inputMultiRow: {
    paddingTop: 0,
    paddingBottom: 0
  },
  actionWrap: {
    marginLeft: 6,
    marginBottom: 0,
    alignItems: 'center'
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  stopSquare: {
    width: 10,
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 2
  },
  charCount: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600'
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
