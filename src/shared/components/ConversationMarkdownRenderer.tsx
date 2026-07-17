import { memo, useCallback, useMemo, useRef } from 'react';
import { Linking, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { MarkdownStyle } from 'react-native-enriched-markdown';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import { StreamdownText } from 'react-native-streamdown';

import { PreviewCodeBlock } from './conversationPreview/PreviewCodeBlock';
import { preprocessMarkdownContent } from '../markdown/preprocess';
import {
  createConversationMarkdownSegmentCache,
  type ConversationMarkdownSegmentCache
} from '../markdown/previewSegments';
import { useAppTheme } from '../visual/AppThemeProvider';

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
  textColor,
  linkColor,
  onLinkPress
}: ConversationMarkdownRendererProps) {
  const { theme } = useAppTheme();
  const resolvedTextColor = textColor ?? theme.colors.textPrimary;
  const resolvedLinkColor = linkColor ?? theme.colors.brandBlue;
  const renderedMarkdown = useMemo(
    () => (streaming ? String(markdown || '') : preprocessMarkdownContent(markdown)),
    [markdown, streaming]
  );
  const segmentCacheRef = useRef<ConversationMarkdownSegmentCache | null>(null);
  if (!segmentCacheRef.current) {
    segmentCacheRef.current = createConversationMarkdownSegmentCache();
  }
  const segmentCache = segmentCacheRef.current;
  const segments = useMemo(() => segmentCache.parse(renderedMarkdown), [renderedMarkdown, segmentCache]);
  const containerStyle = useMemo(() => StyleSheet.flatten(style), [style]);
  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      paragraph: {
        color: resolvedTextColor,
        fontSize: 15,
        lineHeight: 23,
        marginTop: 0,
        marginBottom: 10
      },
      h1: { color: resolvedTextColor, fontSize: 22, lineHeight: 29, marginTop: 4, marginBottom: 10 },
      h2: { color: resolvedTextColor, fontSize: 20, lineHeight: 27, marginTop: 4, marginBottom: 9 },
      h3: { color: resolvedTextColor, fontSize: 18, lineHeight: 25, marginTop: 4, marginBottom: 8 },
      h4: { color: resolvedTextColor, fontSize: 16, lineHeight: 23, marginTop: 3, marginBottom: 7 },
      h5: { color: resolvedTextColor, fontSize: 15, lineHeight: 22, marginTop: 3, marginBottom: 6 },
      h6: { color: resolvedTextColor, fontSize: 14, lineHeight: 21, marginTop: 3, marginBottom: 6 },
      link: {
        color: resolvedLinkColor,
        underline: true
      },
      blockquote: {
        color: resolvedTextColor,
        borderColor: theme.colors.brandBlueSoft,
        borderWidth: 3,
        gapWidth: 10,
        backgroundColor: theme.colors.surfaceMuted,
        marginTop: 2,
        marginBottom: 10
      },
      list: {
        color: resolvedTextColor,
        markerColor: theme.colors.textSecondary,
        markerMinWidth: 22,
        gapWidth: 7,
        marginBottom: 8
      },
      code: {
        fontFamily: MONO_FONT_FAMILY,
        color: theme.colors.textPrimary,
        backgroundColor: theme.colors.brandBlueSoft,
        borderColor: theme.colors.line,
        fontSize: 14
      },
      codeBlock: {
        fontFamily: MONO_FONT_FAMILY,
        color: theme.colors.textPrimary,
        backgroundColor: theme.colors.surfaceMuted,
        borderColor: theme.colors.line,
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        lineHeight: 19,
        marginTop: 2,
        marginBottom: 10
      },
      table: {
        color: resolvedTextColor,
        borderColor: theme.colors.lineStrong,
        borderWidth: 1,
        borderRadius: 8,
        cellPaddingHorizontal: 10,
        cellPaddingVertical: 8,
        headerBackgroundColor: theme.colors.surfaceMuted,
        headerTextColor: theme.colors.textPrimary,
        rowEvenBackgroundColor: theme.colors.surface,
        rowOddBackgroundColor: theme.colors.backgroundMuted
      },
      thematicBreak: {
        color: theme.colors.line,
        height: StyleSheet.hairlineWidth,
        marginTop: 10,
        marginBottom: 10
      },
      math: {
        color: resolvedTextColor,
        fontSize: 15,
        textAlign: 'left'
      },
      inlineMath: {
        color: resolvedTextColor
      }
    }),
    [resolvedLinkColor, resolvedTextColor, theme]
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

  if (!renderedMarkdown) {
    return null;
  }

  const commonProps = {
    flavor: 'github' as const,
    markdownStyle,
    selectable,
    allowFontScaling,
    allowTrailingMargin: false,
    md4cFlags: {
      latexMath: true
    },
    onLinkPress: handleLinkPress
  };

  if (segments.length === 1 && segments[0]?.type === 'markdown') {
    return streaming ? (
      <StreamdownText
        {...commonProps}
        markdown={segments[0].markdown}
        containerStyle={containerStyle}
        streamingConfig={{ tableMode: 'progressive' }}
      />
    ) : (
      <EnrichedMarkdownText {...commonProps} markdown={segments[0].markdown} containerStyle={containerStyle} />
    );
  }

  return (
    <View style={containerStyle}>
      {segments.map((segment) => {
        if (segment.type !== 'markdown') {
          return (
            <PreviewCodeBlock
              key={segment.key}
              kind={segment.type}
              source={segment.source}
              sourceHash={segment.sourceHash}
            />
          );
        }
        if (!segment.markdown) {
          return null;
        }
        return streaming ? (
          <StreamdownText
            key={segment.key}
            {...commonProps}
            markdown={segment.markdown}
            streamingConfig={{ tableMode: 'progressive' }}
          />
        ) : (
          <EnrichedMarkdownText key={segment.key} {...commonProps} markdown={segment.markdown} />
        );
      })}
    </View>
  );
});
