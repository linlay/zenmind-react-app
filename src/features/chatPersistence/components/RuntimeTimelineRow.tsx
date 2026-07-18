import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { type AppVisualColors } from '../../../shared/visual/foundation';
import type {
  ChatTimelineAssistantReplyFooterDisplayItem,
  ChatTimelineDisplayItem,
} from '../../chatTimeline/index.ts';
import { ChatTimelineRail } from './ChatTimelineRail';
import {
  RuntimePlanningBlock,
  type RuntimePlanningBlockMode,
  type RuntimePlanningCollapseOverlayRequest,
} from './RuntimePlanningBlock';
import { RuntimePayloadFrame } from './RuntimePayloadFrame';
import {
  buildRuntimePayloadDescriptor,
  type RuntimePayloadDescriptor,
  type RuntimePayloadSource,
} from './runtimePayloadDescriptor';
import { RuntimePayloadContent } from './runtimePayloadRenderers';
import { getRuntimeToolStatusColor } from './runtimeToolStatusVisual';

type RuntimeTimelineRowProps = {
  item: Exclude<ChatTimelineDisplayItem, ChatTimelineAssistantReplyFooterDisplayItem>;
  onCopyText: (text: string) => void;
  getInitialExpanded: (nodeId: string, fallback: boolean) => boolean;
  onExpandedChange: (nodeId: string, expanded: boolean) => void;
  getInitialPlanningMode: (nodeId: string) => RuntimePlanningBlockMode;
  onPlanningCollapseOverlayChange: (nodeId: string, overlay: RuntimePlanningCollapseOverlayRequest | null) => void;
  onPlanningModeChange: (nodeId: string, mode: RuntimePlanningBlockMode) => void;
};

const TOOL_STATUS_FLASH_DURATION_MS = 1000;
const REASONING_LOADING_DURATION_MS = 900;
const TIMELINE_ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const TIMELINE_BODY_CLASS = 'min-w-0 flex-1';
const RUNTIME_BLOCK_CLASS = 'self-stretch';
const RUNTIME_HEADER_CLASS = 'min-h-[28px] flex-row items-center gap-[7px]';
const RUNTIME_HEADER_PRESSABLE_CLASS = 'min-h-[28px] flex-row items-center gap-[7px] active:opacity-[0.72]';
const RUNTIME_HEADER_LEADING_CLASS = 'min-w-0 flex-1 flex-row items-center gap-[7px]';
const RUNTIME_TITLE_CLASS = 'min-w-0 shrink text-[14px] font-bold leading-5 text-app-primary';
const TOOL_STATUS_DOTS_CLASS = 'shrink-0 flex-row items-center gap-[7px]';
const TOOL_STATUS_DOT_CLASS = 'h-[7px] w-[7px] rounded-app-pill';
const REASONING_LOADING_DOTS_CLASS = 'shrink-0 flex-row items-center gap-1';
const REASONING_LOADING_DOT_CLASS = 'h-1 w-1 rounded-app-pill';
const FOLD_BUTTON_CLASS = 'h-[28px] w-[28px] items-center justify-center rounded-app-sm';

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

function getRuntimePayloadSource(
  item: Exclude<ChatTimelineDisplayItem, ChatTimelineAssistantReplyFooterDisplayItem>
): RuntimePayloadSource {
  const source = item.kind === 'tool-group' ? item : item.node;
  if (source.kind === 'source') {
    throw new Error('source timeline items must use SourceTimelineRow');
  }
  return source;
}

const RunningToolStatusDot = memo(function RunningToolStatusDot({
  accessibilityLabel,
  color,
}: {
  accessibilityLabel: string;
  color: string;
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
      className={TOOL_STATUS_DOT_CLASS}
      style={[{ backgroundColor: color }, { opacity }]}
    />
  );
});

const ReasoningInlineLoading = memo(function ReasoningInlineLoading({
  accessibilityLabel,
  color,
}: {
  accessibilityLabel: string;
  color: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: REASONING_LOADING_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
      progress.setValue(0);
    };
  }, [progress]);

  return (
    <View accessibilityLabel={accessibilityLabel} className={REASONING_LOADING_DOTS_CLASS}>
      {[0, 1, 2].map((index) => {
        const opacity = progress.interpolate({
          inputRange: [0, 0.33, 0.66, 1],
          outputRange:
            index === 0
              ? [1, 0.35, 0.35, 1]
              : index === 1
                ? [0.35, 1, 0.35, 0.35]
                : [0.35, 0.35, 1, 0.35],
        });
        return (
          <Animated.View
            key={index}
            className={REASONING_LOADING_DOT_CLASS}
            style={[{ backgroundColor: color, opacity }]}
          />
        );
      })}
    </View>
  );
});

export const RuntimeTimelineRow = memo(function RuntimeTimelineRow({
  item,
  onCopyText,
  getInitialExpanded,
  onExpandedChange,
  getInitialPlanningMode,
  onPlanningCollapseOverlayChange,
  onPlanningModeChange,
}: RuntimeTimelineRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const descriptor = useMemo(
    () => buildRuntimePayloadDescriptor(getRuntimePayloadSource(item), t),
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

  if (descriptor.kind === 'planning') {
    return (
      <RuntimePlanningBlock
        descriptor={descriptor}
        isLastInRun={item.isLastInRun}
        getInitialMode={getInitialPlanningMode}
        onCopyText={onCopyText}
        onCollapseOverlayChange={onPlanningCollapseOverlayChange}
        onModeChange={onPlanningModeChange}
      />
    );
  }

  const showToolStatusDots = descriptor.toolRecords.length > 0;
  const showReasoningLoading = descriptor.kind === 'reasoning' && descriptor.statusTone === 'active' && !expanded;
  const headerContent = (
    <>
      <View className={RUNTIME_HEADER_LEADING_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={RUNTIME_TITLE_CLASS}>
          {descriptor.title}
        </Text>
        {showReasoningLoading ? (
          <ReasoningInlineLoading
            accessibilityLabel={t('chatDetail.status.running')}
            color={theme.colors.warning}
          />
        ) : null}
        {showToolStatusDots ? (
          <View className={TOOL_STATUS_DOTS_CLASS}>
            {descriptor.toolRecords.map((record) => {
              const color = getRuntimeToolStatusColor(theme.colors, record.status);
              const accessibilityLabel = `${record.title}${record.statusLabel}`;
              if (record.status === 'running') {
                return (
                  <RunningToolStatusDot
                    key={record.key}
                    accessibilityLabel={accessibilityLabel}
                    color={color}
                  />
                );
              }
              return (
                <View
                  key={record.key}
                  accessibilityLabel={accessibilityLabel}
                  className={TOOL_STATUS_DOT_CLASS}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </View>
        ) : null}
      </View>
      {descriptor.canExpand ? (
        <View className={FOLD_BUTTON_CLASS}>
          <AppIcon usage={expanded ? 'runtime.collapse' : 'runtime.expand'} />
        </View>
      ) : null}
    </>
  );

  return (
    <View className={TIMELINE_ROW_CLASS}>
      <ChatTimelineRail
        iconUsage={descriptor.iconUsage}
        terminal={item.isLastInRun}
        toneColor={getToneColor(theme.colors, descriptor.tone)}
      />
      <View className={TIMELINE_BODY_CLASS}>
        <View className={RUNTIME_BLOCK_CLASS}>
          {descriptor.canExpand ? (
            <Pressable
              accessibilityLabel={expanded ? t('timeline.collapseContent') : t('timeline.expandContent')}
              accessibilityRole="button"
              onPress={handleToggle}
              className={RUNTIME_HEADER_PRESSABLE_CLASS}
            >
              {headerContent}
            </Pressable>
          ) : (
            <View className={RUNTIME_HEADER_CLASS}>{headerContent}</View>
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
