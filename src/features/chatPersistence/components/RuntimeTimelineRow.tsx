import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens, type AppVisualColors } from '../../../shared/visual/foundation';
import type { ChatTimelineDisplayItem } from '../../chatTimeline/index.ts';
import { formatChatDetailRunningDuration } from '../chatDetailFormatters';
import { ChatTimelineRail } from './ChatTimelineRail';
import { RuntimePayloadFrame } from './RuntimePayloadFrame';
import { buildRuntimePayloadDescriptor, type RuntimePayloadDescriptor } from './runtimePayloadDescriptor';
import { RuntimePayloadContent } from './runtimePayloadRenderers';
import { getRuntimeToolStatusColor } from './runtimeToolStatusVisual';

type RuntimeTimelineRowProps = {
  item: ChatTimelineDisplayItem;
  onCopyText: (text: string) => void;
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
};

const RUNNING_DURATION_TICK_MS = 1000;
const TOOL_STATUS_FLASH_DURATION_MS = 1000;

function getToneColor(colors: AppVisualColors, tone: RuntimePayloadDescriptor['tone']): string {
  if (tone === 'reasoning') {
    return colors.warning;
  }
  if (tone === 'tool') {
    return colors.brandBlue;
  }
  if (tone === 'file') {
    return colors.success;
  }
  return colors.textSecondary;
}

function getNextRunningDurationDelay(startedAt: number, now: number): number {
  if (now < startedAt) {
    return Math.max(1, startedAt + RUNNING_DURATION_TICK_MS - now);
  }

  const elapsedMs = Math.max(0, now - startedAt);
  const remainder = elapsedMs % RUNNING_DURATION_TICK_MS;
  return remainder === 0 ? RUNNING_DURATION_TICK_MS : RUNNING_DURATION_TICK_MS - remainder;
}

function useActiveToolDurationLabel(startedAt: number | null | undefined): string {
  const [label, setLabel] = useState(() => formatChatDetailRunningDuration(startedAt));

  useEffect(() => {
    const startTime = Number(startedAt);
    if (!Number.isFinite(startTime) || startTime <= 0) {
      setLabel('');
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | null = null;
    function schedule(currentTime: number) {
      timeout = setTimeout(tick, getNextRunningDurationDelay(startTime, currentTime));
    }
    function update(currentTime: number) {
      const nextLabel = formatChatDetailRunningDuration(startTime, currentTime);
      setLabel((currentLabel) => (currentLabel === nextLabel ? currentLabel : nextLabel));
    }
    function tick() {
      const currentTime = Date.now();
      update(currentTime);
      schedule(currentTime);
    }

    const currentTime = Date.now();
    update(currentTime);
    schedule(currentTime);

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [startedAt]);

  return label;
}

const ActiveToolDurationText = memo(function ActiveToolDurationText({
  startedAt,
  style
}: {
  startedAt: number;
  style: StyleProp<TextStyle>;
}) {
  const activeToolDuration = useActiveToolDurationLabel(startedAt);
  if (!activeToolDuration) {
    return null;
  }

  return (
    <Text allowFontScaling={false} numberOfLines={1} style={style}>
      {activeToolDuration}
    </Text>
  );
});

const RunningToolStatusDot = memo(function RunningToolStatusDot({
  accessibilityLabel,
  color,
  baseStyle
}: {
  accessibilityLabel: string;
  color: string;
  baseStyle: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: TOOL_STATUS_FLASH_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );

    animation.start();

    return () => {
      animation.stop();
      progress.setValue(0);
    };
  }, [progress]);

  const opacity = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [1, 0, 1, 0, 1]
  });

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      style={[baseStyle, { backgroundColor: color }, { opacity }]}
    />
  );
});

export const RuntimeTimelineRow = memo(function RuntimeTimelineRow({
  item,
  onCopyText,
  getInitialExpanded,
  onExpandedChange
}: RuntimeTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const descriptor = useMemo(
    () => buildRuntimePayloadDescriptor(item.kind === 'tool-group' ? item : item.node, t),
    [item, t]
  );
  const [expanded, setExpanded] = useState(() => getInitialExpanded(descriptor.id, descriptor.defaultExpanded));

  useEffect(() => {
    setExpanded(getInitialExpanded(descriptor.id, descriptor.defaultExpanded));
  }, [descriptor.defaultExpanded, descriptor.id, getInitialExpanded]);

  const handleToggle = useCallback(() => {
    if (!descriptor.canExpand) {
      return;
    }

    setExpanded((value) => {
      const nextValue = !value;
      onExpandedChange(descriptor.id, nextValue);
      return nextValue;
    });
  }, [descriptor.canExpand, descriptor.id, onExpandedChange]);

  const renderPayloadContent = useCallback(
    (wrap: boolean) => <RuntimePayloadContent descriptor={descriptor} wrap={wrap} />,
    [descriptor]
  );
  const showToolStatusDots = descriptor.toolRecords.length > 0;
  const headerContent = (
    <>
      <View style={styles.runtimeHeaderLeading}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.runtimeTitle}>
          {descriptor.title}
        </Text>
        {descriptor.activeToolStartedAt ? (
          <ActiveToolDurationText startedAt={descriptor.activeToolStartedAt} style={styles.toolDurationText} />
        ) : null}
        {showToolStatusDots ? (
          <View style={styles.toolStatusDots}>
            {descriptor.toolRecords.map((record) => {
              const color = getRuntimeToolStatusColor(theme.colors, record.status);
              const accessibilityLabel = `${record.title}${record.statusLabel}`;
              if (record.status === 'running') {
                return (
                  <RunningToolStatusDot
                    key={record.key}
                    accessibilityLabel={accessibilityLabel}
                    baseStyle={styles.toolStatusDot}
                    color={color}
                  />
                );
              }
              return (
                <View
                  key={record.key}
                  accessibilityLabel={accessibilityLabel}
                  style={[styles.toolStatusDot, { backgroundColor: color }]}
                />
              );
            })}
          </View>
        ) : null}
      </View>
      {descriptor.canExpand ? (
        <View style={styles.foldButton}>
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.timelineRow}>
      <ChatTimelineRail
        iconUsage={descriptor.iconUsage}
        terminal={item.isLastInRun}
        toneColor={getToneColor(theme.colors, descriptor.tone)}
      />
      <View style={styles.timelineBody}>
        <View style={styles.runtimeBlock}>
          {descriptor.canExpand ? (
            <Pressable
              accessibilityLabel={expanded ? t('timeline.collapseContent') : t('timeline.expandContent')}
              accessibilityRole="button"
              onPress={handleToggle}
              style={({ pressed }) => [styles.runtimeHeader, pressed && styles.rowPressed]}
            >
              {headerContent}
            </Pressable>
          ) : (
            <View style={styles.runtimeHeader}>{headerContent}</View>
          )}

          {expanded && descriptor.canExpand ? (
            <RuntimePayloadFrame
              descriptorId={descriptor.id}
              copyText={descriptor.copyText}
              defaultWrap={descriptor.defaultWrap}
              onCopyText={onCopyText}
              renderContent={renderPayloadContent}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    timelineRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      marginBottom: 16
    },
    timelineBody: {
      flex: 1,
      minWidth: 0
    },
    runtimeBlock: {
      alignSelf: 'stretch'
    },
    runtimeHeader: {
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },
    runtimeHeaderLeading: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },
    runtimeTitle: {
      flexShrink: 1,
      minWidth: 0,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      color: theme.colors.textPrimary
    },
    toolStatusDots: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      flexShrink: 0
    },
    toolDurationText: {
      flexShrink: 0,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: theme.colors.textTertiary,
      fontVariant: ['tabular-nums']
    },
    toolStatusDot: {
      width: 7,
      height: 7,
      borderRadius: appVisualTokens.radii.pill
    },
    foldButton: {
      width: 28,
      height: 28,
      borderRadius: appVisualTokens.radii.sm,
      alignItems: 'center',
      justifyContent: 'center'
    },
    rowPressed: {
      opacity: 0.72
    }
  });
}
