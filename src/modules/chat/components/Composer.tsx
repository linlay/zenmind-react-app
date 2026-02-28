import { useCallback, useEffect, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import { FrontendToolState } from '../types/chat';
import {
  buildConfirmDialogSubmitParams,
  normalizeConfirmDialogParams
} from '../utils/confirmDialog';
import { parseFrontendToolBridgeMessage } from '../services/frontendToolBridge';
import { WEBVIEW_BRIDGE_SCRIPT } from '../utils/webViewBridge';
export { WEBVIEW_BRIDGE_SCRIPT } from '../utils/webViewBridge';

const FRONTEND_TOOL_MAX_HEIGHT_RATIO = 0.8;
const FRONTEND_TOOL_MIN_HEIGHT = 320;
const FRONTEND_TOOL_HEIGHT_EPSILON = 2;

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
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  activeFrontendTool: FrontendToolState | null;
  frontendToolBaseUrl: string;
  frontendToolWebViewRef: React.RefObject<WebView>;
  onFrontendToolMessage: (event: { nativeEvent: { data: string } }) => void;
  onFrontendToolLoad: () => void;
  onFrontendToolRetry: () => void;
  onNativeConfirmSubmit: (params: Record<string, unknown>) => Promise<boolean>;
}

export function Composer({
  theme,
  composerText,
  onChangeText,
  onFocus,
  onBlur,
  onSend,
  onStop,
  streaming,
  activeFrontendTool,
  frontendToolBaseUrl,
  frontendToolWebViewRef,
  onFrontendToolMessage,
  onFrontendToolLoad,
  onFrontendToolRetry,
  onNativeConfirmSubmit
}: ComposerProps) {
  const { height: windowHeight } = useWindowDimensions();
  const minRows = 1;
  const maxRows = 6;
  const lineHeight = 20;
  const baseInputHeight = 22;
  const rowSwitchThreshold = lineHeight * 0.35;
  const minHeight = baseInputHeight;
  const maxHeight = baseInputHeight + (maxRows - 1) * lineHeight;
  const [visibleRows, setVisibleRows] = useState(minRows);
  const [confirmSelectedIndex, setConfirmSelectedIndex] = useState(-1);
  const [confirmFreeText, setConfirmFreeText] = useState('');
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [frontendToolMeasuredHeight, setFrontendToolMeasuredHeight] = useState<number | null>(null);

  const charCount = useMemo(() => Array.from(composerText || '').length, [composerText]);
  const inputHeight = minHeight + (visibleRows - minRows) * lineHeight;
  const showCharCount = !streaming && charCount > 0 && visibleRows > 1;
  const isEmpty = charCount === 0;
  const placeholderText = streaming ? '正在流式输出中，可点击停止' : '输入提问内容';
  const showPlaceholder = isEmpty;

  const isNativeConfirmDialog = activeFrontendTool?.renderMode === 'native_confirm_dialog';
  const normalizedConfirmDialog = useMemo(() => {
    if (!isNativeConfirmDialog) {
      return { params: null, error: '' };
    }
    return normalizeConfirmDialogParams(
      activeFrontendTool?.toolParams as Record<string, unknown> | null | undefined
    );
  }, [activeFrontendTool?.toolParams, isNativeConfirmDialog]);

  useEffect(() => {
    if (isEmpty) {
      setVisibleRows(minRows);
    }
  }, [isEmpty, minRows]);

  useEffect(() => {
    setConfirmSelectedIndex(-1);
    setConfirmFreeText('');
    setConfirmSubmitting(false);
    setFrontendToolMeasuredHeight(null);
  }, [activeFrontendTool?.toolId]);

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

  const submitNativeConfirmDialog = useCallback(
    async (params: Record<string, unknown>) => {
      if (confirmSubmitting) {
        return;
      }
      setConfirmSubmitting(true);
      try {
        await onNativeConfirmSubmit(params);
      } finally {
        setConfirmSubmitting(false);
      }
    },
    [confirmSubmitting, onNativeConfirmSubmit]
  );

  const handleNativeConfirmOptionPress = useCallback(
    async (option: string, index: number, allowFreeText: boolean) => {
      if (confirmSubmitting) {
        return;
      }
      if (allowFreeText) {
        setConfirmSelectedIndex(index);
        setConfirmFreeText('');
        return;
      }
      const params = buildConfirmDialogSubmitParams({
        selectedOption: option,
        selectedIndex: index
      });
      if (!params) {
        return;
      }
      await submitNativeConfirmDialog({ ...params });
    },
    [confirmSubmitting, submitNativeConfirmDialog]
  );

  const handleNativeConfirmTextChange = useCallback((text: string) => {
    setConfirmFreeText(text);
    if (String(text || '').trim()) {
      setConfirmSelectedIndex(-1);
    }
  }, []);

  const handleNativeConfirmSubmitPress = useCallback(async () => {
    if (confirmSubmitting || !normalizedConfirmDialog.params) {
      return;
    }
    const selectedOption =
      confirmSelectedIndex >= 0 ? normalizedConfirmDialog.params.options[confirmSelectedIndex] || '' : '';
    const payload = buildConfirmDialogSubmitParams({
      selectedOption,
      selectedIndex: confirmSelectedIndex,
      freeText: confirmFreeText
    });
    if (!payload) {
      return;
    }
    await submitNativeConfirmDialog({ ...payload });
  }, [
    confirmFreeText,
    confirmSelectedIndex,
    confirmSubmitting,
    normalizedConfirmDialog.params,
    submitNativeConfirmDialog
  ]);

  const waitingConfirmParams = Boolean(
    isNativeConfirmDialog &&
      activeFrontendTool &&
      !activeFrontendTool.paramsReady &&
      !activeFrontendTool.paramsError
  );
  const nativeConfirmError = isNativeConfirmDialog
    ? String(activeFrontendTool?.paramsError || normalizedConfirmDialog.error || '')
    : '';
  const canSubmitFreeTextConfirm = useMemo(() => {
    const params = normalizedConfirmDialog.params;
    if (!params || !params.allowFreeText || confirmSubmitting) {
      return false;
    }
    const hasCustomText = String(confirmFreeText || '').trim().length > 0;
    const hasSelectedOption =
      confirmSelectedIndex >= 0 && confirmSelectedIndex < params.options.length;
    return hasCustomText || hasSelectedOption;
  }, [confirmFreeText, confirmSelectedIndex, confirmSubmitting, normalizedConfirmDialog.params]);

  const frontendToolMaxHeight = useMemo(
    () =>
      Math.max(
        FRONTEND_TOOL_MIN_HEIGHT,
        Math.floor(Number(windowHeight || 0) * FRONTEND_TOOL_MAX_HEIGHT_RATIO)
      ),
    [windowHeight]
  );

  const updateFrontendToolMeasuredHeight = useCallback((nextHeight: number) => {
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }
    const normalizedHeight = Math.ceil(nextHeight);
    setFrontendToolMeasuredHeight((prev) => {
      if (prev !== null && Math.abs(prev - normalizedHeight) < FRONTEND_TOOL_HEIGHT_EPSILON) {
        return prev;
      }
      return normalizedHeight;
    });
  }, []);

  const frontendToolResolvedHeight = useMemo(() => {
    if (!activeFrontendTool) {
      return FRONTEND_TOOL_MIN_HEIGHT;
    }
    const fallbackHeight = isNativeConfirmDialog ? FRONTEND_TOOL_MIN_HEIGHT : frontendToolMaxHeight;
    const measuredOrFallback =
      frontendToolMeasuredHeight !== null && Number.isFinite(frontendToolMeasuredHeight)
        ? frontendToolMeasuredHeight
        : fallbackHeight;
    return Math.max(FRONTEND_TOOL_MIN_HEIGHT, Math.min(frontendToolMaxHeight, Math.ceil(measuredOrFallback)));
  }, [activeFrontendTool, frontendToolMaxHeight, frontendToolMeasuredHeight, isNativeConfirmDialog]);

  const handleNativeConfirmContentSizeChange = useCallback(
    (_width: number, height: number) => {
      updateFrontendToolMeasuredHeight(height);
    },
    [updateFrontendToolMeasuredHeight]
  );

  const handleFrontendToolWebViewMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const bridgeMessage = parseFrontendToolBridgeMessage(event.nativeEvent.data);
      if (bridgeMessage?.type === 'frontend_layout') {
        updateFrontendToolMeasuredHeight(bridgeMessage.contentHeight);
        return;
      }
      onFrontendToolMessage(event);
    },
    [onFrontendToolMessage, updateFrontendToolMeasuredHeight]
  );

  return (
    <View style={styles.card} nativeID="chat-composer" testID="chat-composer">
      {activeFrontendTool ? (
        <View
          style={[
            styles.frontendToolContainer,
            {
              backgroundColor: theme.surfaceStrong,
              borderRadius: 20,
              height: frontendToolResolvedHeight,
              maxHeight: frontendToolMaxHeight
            }
          ]}
          nativeID="frontend-tool-container"
          testID="frontend-tool-container"
        >
          {activeFrontendTool.loading ? (
            <View style={styles.center}>
              <Text style={{ color: theme.text }}>加载前端工具...</Text>
            </View>
          ) : activeFrontendTool.loadError ? (
            <View style={styles.center}>
              <Text style={[styles.frontendToolErrorText, { color: theme.danger }]}>{activeFrontendTool.loadError}</Text>
              <TouchableOpacity
                activeOpacity={0.86}
                style={[styles.frontendToolRetryBtn, { borderColor: theme.border }]}
                onPress={onFrontendToolRetry}
                testID="frontend-tool-retry-btn"
              >
                <Text style={{ color: theme.text }}>重试加载</Text>
              </TouchableOpacity>
            </View>
          ) : isNativeConfirmDialog ? (
            <View style={styles.nativeConfirmWrap} testID="native-confirm-dialog-root">
              {waitingConfirmParams ? (
                <View style={styles.center}>
                  <Text style={{ color: theme.textMute }}>等待确认参数...</Text>
                </View>
              ) : nativeConfirmError ? (
                <View
                  style={[styles.nativeConfirmErrorPanel, { backgroundColor: `${theme.danger}22` }]}
                  testID="native-confirm-dialog-error"
                >
                  <Text style={[styles.frontendToolErrorText, { color: theme.danger }]}>
                    {nativeConfirmError}
                  </Text>
                  {activeFrontendTool.chunkGapDetected ? (
                    <Text style={[styles.frontendToolChunkGapHint, { color: theme.danger }]}>
                      {`检测到参数分片缺失（${Array.isArray(activeFrontendTool.missingChunkIndexes) ? activeFrontendTool.missingChunkIndexes.join(',') : ''}），无法初始化确认对话框`}
                    </Text>
                  ) : null}
                </View>
              ) : normalizedConfirmDialog.params ? (
                <ScrollView
                  style={styles.nativeConfirmScroll}
                  contentContainerStyle={styles.nativeConfirmScrollContent}
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={handleNativeConfirmContentSizeChange}
                  testID="native-confirm-dialog-scroll"
                >
                  <Text style={[styles.nativeConfirmCaption, { color: theme.textMute }]}>确认操作</Text>
                  <Text style={[styles.nativeConfirmQuestion, { color: theme.text }]}>
                    {normalizedConfirmDialog.params.question}
                  </Text>

                  <View style={styles.nativeConfirmOptions}>
                    {normalizedConfirmDialog.params.options.map((option, index) => {
                      const selected = confirmSelectedIndex === index;
                      return (
                        <TouchableOpacity
                          key={`${option}:${index}`}
                          activeOpacity={0.86}
                          disabled={confirmSubmitting}
                          onPress={() =>
                            handleNativeConfirmOptionPress(
                              option,
                              index,
                              normalizedConfirmDialog.params?.allowFreeText || false
                            ).catch(() => {})
                          }
                          style={[
                            styles.nativeConfirmOptionBtn,
                            {
                              borderColor: selected ? theme.primary : theme.border,
                              backgroundColor: selected ? `${theme.primary}18` : theme.surface
                            }
                          ]}
                          testID={`native-confirm-dialog-option-${index}`}
                        >
                          <Text style={[styles.nativeConfirmOptionText, { color: selected ? theme.primaryDeep : theme.text }]}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {normalizedConfirmDialog.params.allowFreeText ? (
                    <View style={styles.nativeConfirmFreeTextWrap}>
                      <TextInput
                        value={confirmFreeText}
                        onChangeText={handleNativeConfirmTextChange}
                        style={[
                          styles.nativeConfirmInput,
                          {
                            color: theme.text,
                            borderColor: theme.border,
                            backgroundColor: theme.surface
                          }
                        ]}
                        editable={!confirmSubmitting}
                        placeholder="或输入自定义内容"
                        placeholderTextColor={theme.textMute}
                        testID="native-confirm-dialog-free-text-input"
                      />
                      <TouchableOpacity
                        activeOpacity={0.9}
                        disabled={!canSubmitFreeTextConfirm}
                        onPress={() => {
                          handleNativeConfirmSubmitPress().catch(() => {});
                        }}
                        style={[
                          styles.nativeConfirmSubmitBtn,
                          { backgroundColor: canSubmitFreeTextConfirm ? theme.primary : `${theme.primary}66` }
                        ]}
                        testID="native-confirm-dialog-submit-btn"
                      >
                        <Text style={styles.nativeConfirmSubmitText}>
                          {confirmSubmitting ? '提交中...' : '确认'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <View style={styles.center}>
                  <Text style={{ color: theme.textMute }}>确认参数不可用</Text>
                </View>
              )}
            </View>
          ) : activeFrontendTool.viewportHtml ? (
            <View style={styles.frontendToolWebViewWrap}>
              {!activeFrontendTool.userInteracted && !activeFrontendTool.paramsError ? (
                <View
                  style={[styles.frontendToolInitBanner, { borderColor: `${theme.border}`, backgroundColor: `${theme.surface}EE` }]}
                  testID="frontend-tool-init-banner"
                >
                  <Text style={[styles.frontendToolInitText, { color: theme.textMute }]}>正在初始化前端工具...</Text>
                </View>
              ) : null}
              <WebView
                ref={frontendToolWebViewRef}
                nativeID="frontend-tool-webview"
                testID="frontend-tool-webview"
                originWhitelist={['*']}
                source={{ html: activeFrontendTool.viewportHtml, baseUrl: frontendToolBaseUrl }}
                style={styles.frontendToolWebView}
                javaScriptEnabled
                injectedJavaScript={WEBVIEW_BRIDGE_SCRIPT}
                onMessage={handleFrontendToolWebViewMessage as never}
                onLoad={onFrontendToolLoad}
                scrollEnabled
                nestedScrollEnabled
              />
              {activeFrontendTool.paramsError ? (
                <View
                  style={[styles.frontendToolParamsErrorBanner, { backgroundColor: `${theme.danger}22` }]}
                  testID="frontend-tool-params-error"
                >
                  <Text style={[styles.frontendToolErrorText, { color: theme.danger }]}>
                    {activeFrontendTool.paramsError}
                  </Text>
                  {activeFrontendTool.chunkGapDetected ? (
                    <Text style={[styles.frontendToolChunkGapHint, { color: theme.danger }]}>
                      {`检测到参数分片缺失（${Array.isArray(activeFrontendTool.missingChunkIndexes) ? activeFrontendTool.missingChunkIndexes.join(',') : ''}），无法初始化确认对话框`}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
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
    borderRadius: 12,
    overflow: 'hidden'
  },
  frontendToolWebView: {
    flex: 1
  },
  frontendToolWebViewWrap: {
    flex: 1
  },
  nativeConfirmWrap: {
    flex: 1
  },
  nativeConfirmScroll: {
    flex: 1
  },
  nativeConfirmScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  nativeConfirmCaption: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8
  },
  nativeConfirmQuestion: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600'
  },
  nativeConfirmOptions: {
    marginTop: 10,
    gap: 8
  },
  nativeConfirmOptionBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  nativeConfirmOptionText: {
    fontSize: 14,
    lineHeight: 20
  },
  nativeConfirmFreeTextWrap: {
    marginTop: 12
  },
  nativeConfirmInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14
  },
  nativeConfirmSubmitBtn: {
    marginTop: 10,
    borderRadius: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  nativeConfirmSubmitText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  nativeConfirmErrorPanel: {
    margin: 10,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  center: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center'
  },
  frontendToolErrorText: {
    textAlign: 'center',
    paddingHorizontal: 16
  },
  frontendToolRetryBtn: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  frontendToolParamsErrorBanner: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 10,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10
  },
  frontendToolChunkGapHint: {
    marginTop: 6,
    fontSize: 12,
    textAlign: 'center'
  },
  frontendToolInitBanner: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 10,
    zIndex: 2
  },
  frontendToolInitText: {
    fontSize: 12,
    textAlign: 'center'
  }
});
