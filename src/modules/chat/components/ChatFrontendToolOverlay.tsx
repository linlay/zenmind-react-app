import { RefObject } from 'react';
import { Animated, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import { Composer } from './Composer';
import { FrontendToolState } from '../types/chat';
import { styles } from '../screens/ChatAssistantScreen.styles';

interface ChatFrontendToolOverlayProps {
  mounted: boolean;
  visible: boolean;
  composerBottomPadding: number;
  composerText: string;
  theme: {
    overlay: string;
    mode: string;
    surfaceStrong: string;
    surface: string;
    border: string;
    text: string;
    textMute: string;
    primary: string;
    primaryDeep: string;
    danger: string;
  };
  maskOpacity: Animated.Value;
  sheetOpacity: Animated.AnimatedInterpolation<number>;
  sheetTranslateY: Animated.AnimatedInterpolation<number>;
  streaming: boolean;
  activeFrontendTool: FrontendToolState | null;
  frontendToolBaseUrl: string;
  frontendToolWebViewRef: RefObject<WebView>;
  composerInputRef: RefObject<TextInput | null>;
  onChangeText: (text: string) => void;
  onSelectionChange: (selection: { start: number; end: number }) => void;
  onSend: () => void;
  onStop: () => void;
  onFrontendToolMessage: (event: { nativeEvent: { data: string } }) => void;
  onFrontendToolLoad: () => void;
  onFrontendToolRetry: () => void;
  onNativeConfirmSubmit: (params: Record<string, unknown>) => Promise<boolean>;
}

export function ChatFrontendToolOverlay({
  mounted,
  visible,
  composerBottomPadding,
  composerText,
  theme,
  maskOpacity,
  sheetOpacity,
  sheetTranslateY,
  streaming,
  activeFrontendTool,
  frontendToolBaseUrl,
  frontendToolWebViewRef,
  composerInputRef,
  onChangeText,
  onSelectionChange,
  onSend,
  onStop,
  onFrontendToolMessage,
  onFrontendToolLoad,
  onFrontendToolRetry,
  onNativeConfirmSubmit
}: ChatFrontendToolOverlayProps) {
  if (!mounted) {
    return null;
  }

  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={styles.frontendToolOverlay} testID="frontend-tool-overlay">
      <Animated.View
        style={[styles.frontendToolOverlayMask, { backgroundColor: theme.overlay, opacity: maskOpacity }]}
        testID="frontend-tool-overlay-mask"
      />
      <Animated.View
        style={[
          styles.frontendToolOverlaySheetWrap,
          {
            paddingBottom: composerBottomPadding,
            opacity: sheetOpacity,
            transform: [{ translateY: sheetTranslateY }]
          }
        ]}
        testID="frontend-tool-overlay-sheet"
      >
        {visible ? (
          <Composer
            theme={theme}
            composerText={composerText}
            inputRef={composerInputRef}
            onChangeText={onChangeText}
            onSelectionChange={onSelectionChange}
            onFocus={() => {}}
            onBlur={() => {}}
            onSend={onSend}
            onStop={onStop}
            streaming={streaming}
            activeFrontendTool={activeFrontendTool}
            frontendToolBaseUrl={frontendToolBaseUrl}
            frontendToolWebViewRef={frontendToolWebViewRef}
            onFrontendToolMessage={onFrontendToolMessage}
            onFrontendToolLoad={onFrontendToolLoad}
            onFrontendToolRetry={onFrontendToolRetry}
            onNativeConfirmSubmit={onNativeConfirmSubmit}
          />
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
