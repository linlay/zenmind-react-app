// @ts-nocheck
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { FONT_MONO, FONT_SANS } from '../../../core/constants/theme';
import { toSmartTime } from '../../../shared/utils/format';
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

  const isAssistantStreaming =
    item.kind === 'message' && item.role === 'assistant' && Boolean(item.isStreamingContent);

  const segments = useMemo(() => {
    if (isAssistantStreaming) return [];
    if (item.kind === 'message' && item.role === 'assistant') {
      return splitViewportBlocks(item.text);
    }
    return [];
  }, [isAssistantStreaming, item.kind, item.role, item.text]);

  useEffect(() => {
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

  const renderTimelineRail = (dotStyle?: Record<string, unknown>, icon?: string) => (
    <View style={styles.timelineRail}>
      <View style={[styles.timelineLine, { backgroundColor: theme.timelineLine }]} />
      {icon ? (
        <Text style={[styles.timelineIcon, dotStyle]}>{icon}</Text>
      ) : (
        <View style={[styles.timelineDot, dotStyle, { backgroundColor: theme.timelineDot }]} />
      )}
    </View>
  );

  const renderStateIcon = (state: unknown, color: string) => {
    const normalized = normalizeTaskStatus(state);
    if (normalized === 'running') {
      return <ActivityIndicator size="small" color={color} />;
    }
    if (normalized === 'failed') {
      return (
        <View style={[styles.statusIconDot, { backgroundColor: `${theme.danger}2b` }]}>
          <Text style={[styles.statusIconText, { color: theme.danger }]}>×</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusIconDot, { backgroundColor: `${theme.ok}2b` }]}>
        <Text style={[styles.statusIconText, { color: theme.ok }]}>✓</Text>
      </View>
    );
  };

  if (item.kind === 'tool' || item.kind === 'action') {
    const tone = getTaskTone(item.state);
    const toneStyle =
      tone === 'ok'
        ? { color: theme.ok, bg: `${theme.ok}16` }
        : tone === 'danger'
          ? { color: theme.danger, bg: `${theme.danger}14` }
          : tone === 'warn'
            ? { color: theme.warn, bg: `${theme.warn}16` }
            : { color: theme.textSoft, bg: theme.surfaceSoft };

    const typeGlyph = item.kind === 'action' ? getActionGlyph(item.actionName || item.label) : '';

    return (
      <Animated.View style={[styles.toolRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotTool, '🔧')}
        <View style={styles.toolBody}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => onToggleTool(item.id)}>
            <View style={[styles.toolHead, { backgroundColor: toneStyle.bg }]}> 
              <View style={styles.toolStateIconWrap}>{renderStateIcon(item.state, toneStyle.color)}</View>
              {typeGlyph ? <Text style={[styles.toolKindGlyph, { color: toneStyle.color }]}>{typeGlyph}</Text> : null}
              <Text style={[styles.toolHeadText, { color: toneStyle.color }]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          </TouchableOpacity>

          {toolExpanded ? (
            <View style={[styles.toolExpandPanel, { backgroundColor: theme.surfaceStrong }]}> 
              <View style={styles.toolDetailBlock}>
                <Text style={[styles.toolDetailTitle, { color: theme.textSoft }]}>args</Text>
                <Text style={[styles.toolDetailText, { color: theme.text }]}>{item.argsText || '(empty)'}</Text>
              </View>
              <View style={styles.toolDetailBlock}>
                <Text style={[styles.toolDetailTitle, { color: theme.textSoft }]}>result</Text>
                <Text style={[styles.toolDetailText, { color: theme.text }]}>{item.resultText || '(empty)'}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  if (item.kind === 'reasoning') {
    const durationSec = item.startTs && item.endTs ? ((item.endTs - item.startTs) / 1000).toFixed(1) : null;
    const durationLabel = durationSec ? `思考 ${durationSec}s` : '思考中...';

    return (
      <Animated.View style={[styles.reasoningRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotReasoning, '💡')}
        <TouchableOpacity activeOpacity={0.7} style={styles.reasoningBody} onPress={() => onToggleReasoning(item.id)}>
          <Text style={[styles.reasoningLabel, { color: theme.textMute }]}>{durationLabel}</Text>
          {item.collapsed ? null : <Text style={[styles.reasoningText, { color: theme.textMute }]}>{item.text || ''}</Text>}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const isUser = item.kind === 'message' && item.role === 'user';
  const isSystem = item.kind === 'message' && item.role === 'system';
  const isRunEnd = isSystem && item.variant === 'run_end';

  if (isUser) {
    return (
      <Animated.View style={[styles.userRow, enterStyle]}>
        <View style={styles.timelineSpacer} />
        <View style={styles.userBubbleWrap}>
          <TouchableOpacity activeOpacity={0.85} onLongPress={() => onCopyText(item.text)}>
            <LinearGradient colors={theme.userBubble} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.userBubble}>
              <Text style={styles.userText}>{item.text}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.userTime, { color: theme.textMute }]}>{toSmartTime(item.ts)}</Text>
        </View>
      </Animated.View>
    );
  }

  if (isRunEnd) {
    const endText = String(item.text || '本次运行结束').trim();
    return (
      <Animated.View style={[styles.runEndRow, enterStyle]}>
        {item.ts ? <Text style={[styles.runEndTime, { color: theme.textMute }]}>{toSmartTime(item.ts)}</Text> : null}
        <Text style={[styles.runEndText, { color: theme.textMute }]}>{`-- ${endText} --`}</Text>
      </Animated.View>
    );
  }

  if (isSystem) {
    const systemColor =
      item.tone === 'ok'
        ? theme.ok
        : item.tone === 'warn'
          ? theme.warn
          : item.tone === 'neutral'
            ? theme.textSoft
            : theme.danger;

    return (
      <Animated.View style={[styles.systemRow, enterStyle]}>
        {renderTimelineRail(styles.timelineDotMessage)}
        <View style={styles.systemWrap}>
          <View style={[styles.systemBadge, { backgroundColor: theme.systemBubble }]}> 
            <Text style={[styles.systemText, { color: systemColor }]}>{item.text}</Text>
          </View>
          <Text style={[styles.systemTime, { color: theme.textMute }]}>{toSmartTime(item.ts)}</Text>
        </View>
      </Animated.View>
    );
  }

  const mdStyle = {
    body: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    text: { color: theme.text, fontFamily: FONT_SANS, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    heading1: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 22, fontWeight: '800' },
    heading2: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 20, fontWeight: '700' },
    heading3: { color: theme.text, marginTop: 2, marginBottom: 8, fontSize: 18, fontWeight: '700' },
    bullet_list: { marginTop: 0, marginBottom: 10 },
    ordered_list: { marginTop: 0, marginBottom: 10 },
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

  return (
    <Animated.View style={[styles.assistantRow, enterStyle]}>
      {renderTimelineRail(styles.timelineDotMessage, '💬')}
      <TouchableOpacity activeOpacity={0.9} style={styles.assistantFlowWrap} onLongPress={() => onCopyText(item.kind === 'message' ? item.text : '')}>
        <View style={styles.assistantBubblePanel}>
          {isAssistantStreaming ? (
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
                  <Text
                    key={`vp-fallback-${item.id}-${index}`}
                    style={{
                      color: theme.textSoft,
                      fontSize: 12,
                      fontFamily: FONT_MONO,
                      backgroundColor: theme.surfaceSoft,
                      borderRadius: 8,
                      padding: 8,
                      marginVertical: 4
                    }}
                  >
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
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  timelineRail: {
    width: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginRight: 8
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1
  },
  timelineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  timelineIcon: {
    fontSize: 10,
    lineHeight: 14
  },
  timelineDotTool: {
    marginTop: 11
  },
  timelineDotReasoning: {
    marginTop: 8
  },
  timelineDotMessage: {
    marginTop: 10
  },
  timelineSpacer: {
    width: 20
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 14
  },
  toolBody: {
    flex: 1
  },
  toolHead: {
    minHeight: 30,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    maxWidth: '94%'
  },
  toolStateIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toolKindGlyph: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: '700',
    marginTop: -0.5
  },
  toolHeadText: {
    flex: 1,
    minWidth: 0,
    fontFamily: FONT_MONO,
    fontSize: 11.5,
    fontWeight: '700'
  },
  statusIconDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusIconText: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700'
  },
  toolExpandPanel: {
    marginTop: 6,
    borderRadius: 11,
    padding: 8
  },
  toolDetailBlock: {
    marginBottom: 8
  },
  toolDetailTitle: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 3
  },
  toolDetailText: {
    fontFamily: FONT_MONO,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8
  },
  reasoningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 14
  },
  reasoningBody: {
    flex: 1,
    paddingTop: 1
  },
  reasoningLabel: {
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2
  },
  reasoningText: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
    paddingHorizontal: 14
  },
  userBubbleWrap: {
    flex: 1,
    alignItems: 'flex-end'
  },
  userBubble: {
    maxWidth: '87%',
    borderRadius: 14,
    borderTopRightRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 2
  },
  userText: {
    color: '#ffffff',
    fontFamily: FONT_SANS,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600'
  },
  userTime: {
    marginTop: 4,
    textAlign: 'right',
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '700'
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 14
  },
  assistantFlowWrap: {
    flex: 1,
    paddingRight: 2
  },
  assistantBubblePanel: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 3
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 14
  },
  systemWrap: {
    flex: 1,
    alignItems: 'flex-start'
  },
  systemBadge: {
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  systemText: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600'
  },
  systemTime: {
    marginTop: 4,
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '700'
  },
  runEndRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  runEndTime: {
    marginRight: 6,
    fontFamily: FONT_MONO,
    fontSize: 10,
    fontWeight: '600'
  },
  runEndText: {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    fontWeight: '600'
  }
});
