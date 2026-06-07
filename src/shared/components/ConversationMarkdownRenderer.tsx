import { memo, useCallback, useMemo } from 'react';
import { Linking, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { MarkdownStyle } from 'react-native-enriched-markdown';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';

import { preprocessMarkdownContent } from '../markdown/preprocess';
import { appVisualTokens } from '../visual/foundation';

type ConversationMarkdownRendererProps = {
  markdown: string;
  streaming?: boolean;
  selectable?: boolean;
  allowFontScaling?: boolean;
  style?: StyleProp<ViewStyle>;
  textColor?: string;
  linkColor?: string;
  onLinkPress?: (url: string) => boolean | void;
};

const MONO_FONT_FAMILY = 'monospace';

export const ConversationMarkdownRenderer = memo(function ConversationMarkdownRenderer({
  markdown,
  streaming = false,
  selectable = true,
  allowFontScaling = false,
  style,
  textColor = appVisualTokens.colors.textPrimary,
  linkColor = appVisualTokens.colors.brandBlue,
  onLinkPress,
}: ConversationMarkdownRendererProps) {
  const processedMarkdown = useMemo(() => preprocessMarkdownContent(markdown), [markdown]);
  const containerStyle = useMemo(() => StyleSheet.flatten(style), [style]);
  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      paragraph: {
        color: textColor,
        fontSize: 15,
        lineHeight: 23,
        marginTop: 0,
        marginBottom: 10,
      },
      h1: { color: textColor, fontSize: 22, lineHeight: 29, marginTop: 4, marginBottom: 10 },
      h2: { color: textColor, fontSize: 20, lineHeight: 27, marginTop: 4, marginBottom: 9 },
      h3: { color: textColor, fontSize: 18, lineHeight: 25, marginTop: 4, marginBottom: 8 },
      h4: { color: textColor, fontSize: 16, lineHeight: 23, marginTop: 3, marginBottom: 7 },
      h5: { color: textColor, fontSize: 15, lineHeight: 22, marginTop: 3, marginBottom: 6 },
      h6: { color: textColor, fontSize: 14, lineHeight: 21, marginTop: 3, marginBottom: 6 },
      link: {
        color: linkColor,
        underline: true,
      },
      blockquote: {
        color: textColor,
        borderColor: appVisualTokens.colors.brandBlueSoft,
        borderWidth: 3,
        gapWidth: 10,
        backgroundColor: appVisualTokens.colors.surfaceMuted,
        marginTop: 2,
        marginBottom: 10,
      },
      list: {
        color: textColor,
        markerColor: appVisualTokens.colors.textSecondary,
        markerMinWidth: 22,
        gapWidth: 7,
        marginBottom: 8,
      },
      code: {
        fontFamily: MONO_FONT_FAMILY,
        color: appVisualTokens.colors.textPrimary,
        backgroundColor: appVisualTokens.colors.brandBlueSoft,
        borderColor: appVisualTokens.colors.line,
        fontSize: 14,
      },
      codeBlock: {
        fontFamily: MONO_FONT_FAMILY,
        color: appVisualTokens.colors.textPrimary,
        backgroundColor: appVisualTokens.colors.surfaceMuted,
        borderColor: appVisualTokens.colors.line,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 2,
        marginBottom: 10,
      },
      table: {
        color: textColor,
        borderColor: appVisualTokens.colors.lineStrong,
        borderWidth: 1,
        borderRadius: 8,
        cellPaddingHorizontal: 10,
        cellPaddingVertical: 8,
        headerBackgroundColor: appVisualTokens.colors.surfaceMuted,
        headerTextColor: appVisualTokens.colors.textPrimary,
        rowEvenBackgroundColor: appVisualTokens.colors.surface,
        rowOddBackgroundColor: appVisualTokens.colors.backgroundMuted,
      },
      thematicBreak: {
        color: appVisualTokens.colors.line,
        height: StyleSheet.hairlineWidth,
        marginTop: 10,
        marginBottom: 10,
      },
      math: {
        color: textColor,
        fontSize: 15,
        textAlign: 'left',
      },
      inlineMath: {
        color: textColor,
      },
    }),
    [linkColor, textColor]
  );
  const handleLinkPress = useCallback(
    (event: { url: string }) => {
      const url = event.url.trim();
      if (!url) {
        return;
      }
      const handled = onLinkPress?.(url);
      if (handled === true) {
        return;
      }
      if (/^(https?:|mailto:|tel:)/i.test(url)) {
        Linking.openURL(url).catch(() => {});
      }
    },
    [onLinkPress]
  );

  if (!processedMarkdown) {
    return null;
  }

  const commonProps = {
    markdown: processedMarkdown,
    flavor: 'github' as const,
    markdownStyle,
    containerStyle,
    selectable,
    allowFontScaling,
    allowTrailingMargin: false,
    md4cFlags: {
      latexMath: true,
    },
    onLinkPress: handleLinkPress,
  };

  return streaming ? (
    <StreamdownText
      {...commonProps}
      streamingConfig={{
        tableMode: 'progressive',
      }}
    />
  ) : (
    <EnrichedMarkdownText {...commonProps} />
  );
});
