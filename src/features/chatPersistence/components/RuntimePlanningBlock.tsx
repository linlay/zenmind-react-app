import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { ChatTimelineRail } from './ChatTimelineRail';
import type { RuntimePayloadDescriptor } from './runtimePayloadDescriptor';
import { RuntimePayloadContent } from './runtimePayloadRenderers';

export type RuntimePlanningBlockMode = 'preview' | 'expanded' | 'compact';

export type RuntimePlanningCollapseOverlayRequest = {
  label: string;
  onPress: () => void;
};

type RuntimePlanningBlockProps = {
  descriptor: RuntimePayloadDescriptor;
  isLastInRun: boolean;
  getInitialMode: (nodeId: string) => RuntimePlanningBlockMode;
  onCopyText: (text: string) => void;
  onCollapseOverlayChange: (nodeId: string, overlay: RuntimePlanningCollapseOverlayRequest | null) => void;
  onModeChange: (nodeId: string, mode: RuntimePlanningBlockMode) => void;
};

const WRITING_SHIMMER_DURATION_MS = 1200;
const TIMELINE_ROW_CLASS = 'mb-4 flex-row items-stretch gap-2';
const TIMELINE_BODY_CLASS = 'min-w-0 flex-1';
const CARD_CLASS = 'overflow-hidden rounded-[18px] bg-app-surface-muted px-app-lg pb-app-lg pt-app-md';
const CARD_PREVIEW_CLASS = 'pb-0';
const CARD_COMPACT_CLASS = 'pb-app-md';
const HEADER_CLASS = 'min-h-[30px] flex-row items-center gap-app-sm';
const HEADER_TITLE_WRAP_CLASS = 'min-w-0 flex-1 overflow-hidden';
const TITLE_CLASS = 'text-[15px] font-extrabold leading-[21px] text-app-primary';
const WRITING_TITLE_CLASS = 'text-app-secondary';
const HEADER_ACTIONS_CLASS = 'shrink-0 flex-row items-center gap-[6px]';
const ICON_BUTTON_CLASS = 'h-7 w-7 items-center justify-center rounded-app-sm active:opacity-[0.72]';
const ICON_BUTTON_DISABLED_CLASS = 'opacity-[0.38]';
const PREVIEW_CONTENT_CLASS = 'mt-app-lg max-h-[390px] overflow-hidden';
const EXPANDED_CONTENT_CLASS = 'mt-app-lg';
const FADE_POSITION_CLASS = 'absolute inset-x-0 bottom-0 h-[92px]';
const FADE_OVERLAY_CLASS = FADE_POSITION_CLASS;
const FADE_BUTTON_OVERLAY_CLASS = `${FADE_POSITION_CLASS} items-center justify-end pb-app-xl`;
const EXPAND_BUTTON_CLASS =
  'min-h-9 flex-row items-center gap-[5px] rounded-app-pill bg-app-action px-app-lg py-[7px] active:opacity-[0.78]';
const EXPAND_BUTTON_TEXT_CLASS = 'text-[14px] font-extrabold leading-5 text-app-on-action';
const EMPTY_CONTENT_CLASS = 'mt-app-sm text-[13px] leading-5 text-app-tertiary';
const SHIMMER_CLASS = 'absolute -left-1/3 top-0 h-full w-1/3 rounded-app-pill bg-app-surface opacity-[0.55]';

function gradientIdForDescriptor(descriptorId: string): string {
  return `runtimePlanningFade-${descriptorId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

const PlanningWritingTitle = memo(function PlanningWritingTitle({ title }: { title: string }) {
  const progress = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = RNAnimated.loop(
      RNAnimated.timing(progress, {
        toValue: 1,
        duration: WRITING_SHIMMER_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
      progress.setValue(0);
    };
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-48, 168],
  });

  return (
    <View className={HEADER_TITLE_WRAP_CLASS}>
      <Text allowFontScaling={false} numberOfLines={1} className={cn(TITLE_CLASS, WRITING_TITLE_CLASS)}>
        {title}
      </Text>
      <RNAnimated.View pointerEvents="none" className={SHIMMER_CLASS} style={{ transform: [{ translateX }] }} />
    </View>
  );
});

function PlanFadeOverlay({
  gradientId,
  surfaceColor,
}: {
  gradientId: string;
  surfaceColor: string;
}) {
  return (
    <View pointerEvents="none" className={FADE_OVERLAY_CLASS}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={surfaceColor} stopOpacity="0" />
            <Stop offset="0.62" stopColor={surfaceColor} stopOpacity="0.94" />
            <Stop offset="1" stopColor={surfaceColor} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

export const PlanningActionPill = memo(function PlanningActionPill({
  accessibilityLabel,
  iconColor,
  iconUsage,
  label,
  onPress,
}: {
  accessibilityLabel: string;
  iconColor: string;
  iconUsage: 'runtime.planExpand' | 'runtime.planCollapse';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      className={EXPAND_BUTTON_CLASS}
    >
      <Text allowFontScaling={false} numberOfLines={1} className={EXPAND_BUTTON_TEXT_CLASS}>
        {label}
      </Text>
      <AppIcon usage={iconUsage} color={iconColor} />
    </Pressable>
  );
});

export const RuntimePlanningBlock = memo(function RuntimePlanningBlock({
  descriptor,
  isLastInRun,
  getInitialMode,
  onCopyText,
  onCollapseOverlayChange,
  onModeChange,
}: RuntimePlanningBlockProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const [mode, setMode] = useState<RuntimePlanningBlockMode>(() => getInitialMode(descriptor.id));
  const hasContent = descriptor.sections.some((section) => section.text.trim().length > 0);
  const isStreaming = descriptor.statusTone === 'active';
  const isPreview = mode === 'preview';
  const isExpanded = mode === 'expanded';
  const isCompact = mode === 'compact';
  const gradientId = useMemo(() => gradientIdForDescriptor(descriptor.id), [descriptor.id]);
  const expandLabel = t('runtime.planning.expand');
  const collapseLabel = t('runtime.planning.collapse');

  useEffect(() => {
    setMode(getInitialMode(descriptor.id));
  }, [descriptor.id, getInitialMode]);

  const commitMode = useCallback(
    (nextMode: RuntimePlanningBlockMode) => {
      setMode(nextMode);
      onModeChange(descriptor.id, nextMode);
    },
    [descriptor.id, onModeChange]
  );

  const handleCopy = useCallback(() => {
    if (descriptor.copyText) {
      onCopyText(descriptor.copyText);
    }
  }, [descriptor.copyText, onCopyText]);

  const handleExpand = useCallback(() => commitMode('expanded'), [commitMode]);
  const handlePreview = useCallback(() => commitMode('preview'), [commitMode]);
  const handleCompact = useCallback(() => commitMode('compact'), [commitMode]);

  useEffect(() => {
    if (!isExpanded || !hasContent) {
      onCollapseOverlayChange(descriptor.id, null);
      return;
    }

    onCollapseOverlayChange(descriptor.id, {
      label: collapseLabel,
      onPress: handlePreview,
    });

    return () => {
      onCollapseOverlayChange(descriptor.id, null);
    };
  }, [collapseLabel, descriptor.id, handlePreview, hasContent, isExpanded, onCollapseOverlayChange]);

  const content = hasContent ? <RuntimePayloadContent descriptor={descriptor} wrap /> : null;

  return (
    <View className={TIMELINE_ROW_CLASS}>
      <ChatTimelineRail
        iconUsage={descriptor.iconUsage}
        terminal={isLastInRun}
        toneColor={theme.colors.brandBlue}
      />
      <View className={TIMELINE_BODY_CLASS}>
        <View
          className={cn(
            CARD_CLASS,
            isPreview && hasContent ? CARD_PREVIEW_CLASS : null,
            isCompact ? CARD_COMPACT_CLASS : null
          )}
        >
          <View className={HEADER_CLASS}>
            {isStreaming ? (
              <PlanningWritingTitle title={descriptor.title} />
            ) : (
              <View className={HEADER_TITLE_WRAP_CLASS}>
                <Text allowFontScaling={false} numberOfLines={1} className={TITLE_CLASS}>
                  {descriptor.title}
                </Text>
              </View>
            )}
            <View className={HEADER_ACTIONS_CLASS}>
              <Pressable
                accessibilityLabel={t('timeline.copy')}
                accessibilityRole="button"
                disabled={!descriptor.copyText}
                onPress={handleCopy}
                className={cn(ICON_BUTTON_CLASS, !descriptor.copyText ? ICON_BUTTON_DISABLED_CLASS : null)}
              >
                <AppIcon
                  usage="runtime.copy"
                  color={descriptor.copyText ? theme.colors.textSecondary : theme.colors.textTertiary}
                />
              </Pressable>
              <Pressable
                accessibilityLabel={isCompact ? t('runtime.planning.expand') : t('runtime.planning.collapseToLine')}
                accessibilityRole="button"
                onPress={isCompact ? handlePreview : handleCompact}
                className={ICON_BUTTON_CLASS}
              >
                <AppIcon usage={isCompact ? 'runtime.planExpand' : 'runtime.planCollapse'} />
              </Pressable>
            </View>
          </View>

          {!isCompact && hasContent ? (
            <View className={isExpanded ? EXPANDED_CONTENT_CLASS : PREVIEW_CONTENT_CLASS}>
              {content}
            </View>
          ) : !isCompact && !hasContent ? (
            <Text allowFontScaling={false} className={EMPTY_CONTENT_CLASS}>
              {t('runtime.planning.empty')}
            </Text>
          ) : null}
          {isPreview && hasContent ? (
            <>
              <PlanFadeOverlay gradientId={gradientId} surfaceColor={theme.colors.surfaceMuted} />
              <View pointerEvents="box-none" className={FADE_BUTTON_OVERLAY_CLASS}>
                <PlanningActionPill
                  accessibilityLabel={expandLabel}
                  iconColor={theme.colors.onBrandBlueAction}
                  iconUsage="runtime.planExpand"
                  label={expandLabel}
                  onPress={handleExpand}
                />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
});
