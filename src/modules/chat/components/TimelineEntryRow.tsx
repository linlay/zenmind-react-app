// @ts-nocheck
import { useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { FONT_MONO, FONT_SANS } from '../../../core/constants/theme';
import { toHHMM } from '../../../shared/utils/format';
import { TimelineEntry } from '../types/chat';
import { getActionGlyph, getTaskTone, normalizeTaskStatus } from '../services/eventNormalizer';
import { ViewportBlockView } from './ViewportBlockView';

interface TimelineEntryRowProps {
  item: TimelineEntry;
  theme: {
    timelineLine: string;
    timelineDot: string;
    ok: string;
    danger: string;
    warn: string;
    text: string;
    textSoft: string;
    textMute: string;
    primary: string;
    primaryDeep: string;
    primarySoft: string;
    surfaceSoft: string;
    surfaceStrong: string;
    userBubble: [string, string];
    systemBubble: string;
  };
  contentWidth: number;
  backendUrl: string;
  toolExpanded: boolean;
  onToggleTool: (id: string) => void;
  onToggleReasoning: (id: string) => void;
  onCopyText: (text: string) => void;
}

function parseViewportHeaderFields(headerLine: string) {
  const result: Record<string, string> = {};
  const parts = String(headerLine || '').split(',');
  for (const part of parts) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (!rawKey || rawValueParts.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rawValueParts.join('=').trim();
    if (!key || !value) continue;
    result[key] = value;
  }
  return result;
}

function splitViewportBlocks(rawText: string) {
  const text = String(rawText || '');
  if (!text) return [] as Array<Record<string, unknown>>;

  const regex = /```viewport\s*\n?([\s\S]*?)```/gi;
  const segments: Array<Record<string, unknown>> = [];
  let lastIndex = 0;
  let match = regex.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'markdown', content: text.slice(lastIndex, match.index) });
    }

    const blockContent = (match[1] || '').trim();
    const lines = blockContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length >= 2) {
      const fields = parseViewportHeaderFields(lines[0]);
      const viewportType = (fields.type || '').toLowerCase();
      const viewportKey = fields.key || '';
      if (viewportType && viewportKey) {
        const payloadRaw = lines.slice(1).join('\n');
        let payload: Record<string, unknown> | null = null;
        try {
          payload = JSON.parse(payloadRaw) as Record<string, unknown>;
        } catch {
          payload = null;
        }
        segments.push({
          type: 'viewport',
          viewportType,
          viewportKey,
          payload,
          payloadRaw
        });
      } else {
        segments.push({ type: 'viewport', content: blockContent });
      }
    } else {
      segments.push({ type: 'viewport', content: blockContent });
    }

    lastIndex = regex.lastIndex;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'markdown', content: text.slice(lastIndex) });
  }

  if (!segments.length) {
    segments.push({ type: 'markdown', content: text });
  }

  return segments;
}

export function TimelineEntryRow({
  item,
  theme,
  contentWidth,
  backendUrl,
  toolExpanded,
  onToggleTool,
  onToggleReasoning,
  onCopyText
}: TimelineEntryRowProps) {
  const appear = useRef(new Animated.Value(0)).current;

  useMemo(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [appear]);

  const enterStyle = {
    opacity: appear,
    transform: [
      {
        translateY: appear.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0]
        })
      }
    ]
  };

  const renderRail = (icon?: string) => (
    <View style={styles.rail}>
      <View style={[styles.railLine, { backgroundColor: theme.timelineLine }]} />
      {icon ? <Text style={styles.railIcon}>{icon}</Text> : <View style={[styles.railDot, { backgroundColor: theme.timelineDot }]} />}
    </View>
  );

  const mdStyle = {
    body: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    text: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    code_inline: {
      color: theme.primaryDeep,
      backgroundColor: theme.primarySoft,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      fontFamily: FONT_MONO
    },
    fence: {
      color: theme.textSoft,
      backgroundColor: theme.surfaceSoft,
      borderRadius: 10,
      padding: 10,
      fontFamily: FONT_MONO,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 0,
      marginBottom: 10
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline'
    }
  };

  if (item.kind === 'tool' || item.kind === 'action') {
    const tone = getTaskTone(item.state);
    const color = tone === 'ok' ? theme.ok : tone === 'danger' ? theme.danger : tone === 'warn' ? theme.warn : theme.textSoft;
    const bg = tone === 'ok' ? `${theme.ok}16` : tone === 'danger' ? `${theme.danger}14` : tone === 'warn' ? `${theme.warn}16` : theme.surfaceSoft;
    const glyph = item.kind === 'action' ? getActionGlyph(item.actionName || item.label) : '';

    return (
      <Animated.View style={[styles.row, enterStyle]}>
        {renderRail('🔧')}
        <View style={styles.rowBody}>
          <TouchableOpacity activeOpacity={0.82} onPress={() => onToggleTool(item.id)}>
            <View style={[styles.toolHead, { backgroundColor: bg }]}>
              {normalizeTaskStatus(item.state) === 'running' ? (
                <ActivityIndicator size="small" color={color} />
              ) : (
                <Text style={{ color, fontWeight: '700' }}>{normalizeTaskStatus(item.state) === 'failed' ? '×' : '✓'}</Text>
              )}
              {glyph ? <Text style={{ color }}>{glyph}</Text> : null}
              <Text style={{ color, fontWeight: '700', flex: 1 }} numberOfLines={1}>{item.label}</Text>
            </View>
          </TouchableOpacity>

          {toolExpanded ? (
            <View style={[styles.toolExpand, { backgroundColor: theme.surfaceStrong }]}>
              <Text style={[styles.toolTitle, { color: theme.textSoft }]}>args</Text>
              <Text style={{ color: theme.text }}>{item.argsText || '(empty)'}</Text>
              <Text style={[styles.toolTitle, { color: theme.textSoft }]}>result</Text>
              <Text style={{ color: theme.text }}>{item.resultText || '(empty)'}</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  if (item.kind === 'reasoning') {
    const durationSec = item.startTs && item.endTs ? ((item.endTs - item.startTs) / 1000).toFixed(1) : null;
    return (
      <Animated.View style={[styles.row, enterStyle]}>
        {renderRail('💡')}
        <TouchableOpacity style={styles.reasoning} activeOpacity={0.72} onPress={() => onToggleReasoning(item.id)}>
          <Text style={{ color: theme.textMute }}>{durationSec ? `思考 ${durationSec}s` : '思考中...'}</Text>
          {item.collapsed ? null : <Text style={{ color: theme.textMute, marginTop: 4 }}>{item.text}</Text>}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (item.kind === 'message' && item.role === 'user') {
    return (
      <Animated.View style={[styles.userRow, enterStyle]}>
        <TouchableOpacity activeOpacity={0.84} onLongPress={() => onCopyText(item.text)} style={styles.userWrap}>
          <View style={[styles.userBubble, { backgroundColor: theme.primary }]}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
          <Text style={[styles.time, { color: theme.textMute }]}>{toHHMM(item.ts)}</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  if (item.kind === 'message' && item.role === 'system' && item.variant === 'run_end') {
    return (
      <Animated.View style={[styles.runEndRow, enterStyle]}>
        <Text style={[styles.runEndText, { color: theme.textMute }]}>{`-- ${item.text || '本次运行结束'} --`}</Text>
      </Animated.View>
    );
  }

  if (item.kind === 'message' && item.role === 'system') {
    return (
      <Animated.View style={[styles.row, enterStyle]}>
        {renderRail()}
        <View style={styles.rowBody}>
          <View style={[styles.systemBubble, { backgroundColor: theme.systemBubble }]}>
            <Text style={{ color: theme.textSoft }}>{item.text}</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  const isStreaming = item.kind === 'message' && item.role === 'assistant' && Boolean(item.isStreamingContent);
  const segments = item.kind === 'message' && item.role === 'assistant' && !isStreaming ? splitViewportBlocks(item.text) : [];

  return (
    <Animated.View style={[styles.row, enterStyle]}>
      {renderRail('💬')}
      <TouchableOpacity activeOpacity={0.9} onLongPress={() => onCopyText(item.kind === 'message' ? item.text : '')} style={styles.rowBody}>
        {isStreaming ? (
          <Markdown style={mdStyle}>{item.kind === 'message' ? item.text : ''}</Markdown>
        ) : (
          segments.map((segment, index) => {
            if (segment.type === 'viewport') {
              if (segment.viewportKey) {
                return (
                  <ViewportBlockView
                    key={`vp-${item.id}-${index}`}
                    viewportKey={String(segment.viewportKey)}
                    payload={(segment.payload || null) as Record<string, unknown> | null}
                    backendUrl={backendUrl}
                    theme={theme}
                    contentWidth={contentWidth}
                  />
                );
              }
              const fallbackText = String(segment.content || segment.payloadRaw || '');
              if (!fallbackText.trim()) return null;
              return (
                <Text key={`vp-fallback-${item.id}-${index}`} style={{ color: theme.textSoft, fontSize: 12, backgroundColor: theme.surfaceSoft, borderRadius: 8, padding: 8, marginVertical: 4 }}>
                  {fallbackText}
                </Text>
              );
            }

            const content = String(segment.content || '');
            if (!content.trim()) return null;
            return (
              <Markdown key={`md-${item.id}-${index}`} style={mdStyle}>
                {content}
              </Markdown>
            );
          })
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    marginBottom: 10
  },
  rail: {
    width: 28,
    alignItems: 'center',
    position: 'relative'
  },
  railLine: {
    position: 'absolute',
    top: 0,
    bottom: -10,
    width: 2
  },
  railDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6
  },
  railIcon: {
    marginTop: 2,
    fontSize: 14
  },
  rowBody: {
    flex: 1
  },
  toolHead: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  toolExpand: {
    marginTop: 8,
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  toolTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4
  },
  reasoning: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  userRow: {
    paddingHorizontal: 14,
    marginBottom: 10,
    alignItems: 'flex-end'
  },
  userWrap: {
    maxWidth: '82%'
  },
  userBubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  userText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22
  },
  time: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  systemBubble: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10
  },
  runEndRow: {
    alignItems: 'center',
    marginBottom: 10
  },
  runEndText: {
    fontSize: 12
  }
});
