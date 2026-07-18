import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type I18nKey, type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens } from '../../../shared/visual/foundation';
import type {
  ChatTimelineUsageEstimatedCost,
  ChatTimelineUsageStats,
  ChatTimelineUsageSummary
} from '../../chatTimeline/index.ts';
import { normalizeChatReasoningEffort } from '../agentModelSettings.ts';
import { formatChatUsageNumber } from '../chatDetailFormatters.ts';
import type { ChatReasoningEffort } from '../types';

type ChatUsageHeaderBadgeProps = {
  usageSummary: ChatTimelineUsageSummary;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
};

type ChatUsageStatsDrawerProps = {
  visible: boolean;
  usageSummary: ChatTimelineUsageSummary;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
  onClose: () => void;
  onDismissed: () => void;
};

type UsageMetric = {
  key: string;
  label: string;
  value: number | null;
};

const USAGE_SHEET_ANIMATION_DURATION = 150;
const USAGE_SHEET_MAX_HEIGHT = 580;
const USAGE_SHEET_ENTER_OFFSET = USAGE_SHEET_MAX_HEIGHT + appVisualTokens.spacing.xl;
const USAGE_HEADER_BADGE_CLASS =
  'h-[34px] w-[72px] shrink-0 flex-row items-center justify-center gap-[5px] rounded-app-pill border border-app-line-strong bg-app-surface pb-0 pl-1 pr-[7px] active:opacity-[0.68]';
const USAGE_HEADER_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 items-start justify-center';
const USAGE_HEADER_VALUE_CLASS = 'max-w-full text-[11px] font-extrabold leading-[14px] text-app-primary';
const USAGE_RING_CLASS = 'relative shrink-0 items-center justify-center';
const USAGE_RING_LABEL_CLASS = 'absolute inset-0 items-center justify-center';
const USAGE_RING_TEXT_CLASS = 'text-center text-[7px] font-extrabold leading-[9px] text-app-primary';
const USAGE_MODAL_ROOT_CLASS = 'flex-1 justify-end';
const USAGE_BACKDROP_CLASS = 'absolute inset-0 bg-app-overlay';
const USAGE_BACKDROP_PRESSABLE_CLASS = 'flex-1';
const USAGE_DRAWER_PANEL_CLASS = 'rounded-t-[16px] bg-app-surface px-app-lg pt-app-sm';
const USAGE_DRAWER_HANDLE_CLASS = 'mb-app-md h-[5px] w-9 self-center rounded-[3px] bg-app-line-strong';
const USAGE_DRAWER_HEADER_CLASS = 'min-h-[38px] flex-row items-start justify-between gap-app-md pb-app-sm';
const USAGE_DRAWER_TITLE_BLOCK_CLASS = 'min-w-0 flex-1 gap-[2px]';
const USAGE_DRAWER_TITLE_CLASS = 'text-[17px] font-extrabold leading-[22px] text-app-primary';
const USAGE_DRAWER_MODEL_CLASS = 'text-[12px] font-bold leading-4 text-app-secondary';
const USAGE_DRAWER_CLOSE_CLASS =
  'h-[30px] w-[30px] items-center justify-center rounded-app-pill bg-app-surface-muted active:opacity-[0.68]';
const USAGE_DRAWER_SCROLL_CLASS = 'grow-0';
const USAGE_DRAWER_CONTENT_CLASS = 'gap-app-md pb-app-sm';
const USAGE_CONTEXT_WINDOW_CLASS =
  'flex-row flex-wrap items-center gap-app-sm rounded-app-sm bg-app-brand-blue-soft px-[10px] py-[10px]';
const USAGE_CONTEXT_MAIN_CLASS = 'min-w-0 flex-1 flex-row items-center gap-app-sm';
const USAGE_CONTEXT_COPY_CLASS = 'min-w-0 flex-1 gap-[1px]';
const USAGE_CONTEXT_LABEL_CLASS = 'text-[11px] font-bold leading-[14px] text-app-secondary';
const USAGE_CONTEXT_VALUE_CLASS = 'text-[13px] font-extrabold leading-4 text-app-primary';
const USAGE_CONTEXT_HINT_CLASS = 'text-[11px] font-semibold leading-[14px] text-app-secondary';
const USAGE_CONTEXT_SIDE_CLASS = 'min-w-[126px] shrink-0 items-end gap-1';
const USAGE_CONTEXT_SIDE_TEXT_CLASS = 'text-right text-[11px] font-bold leading-[14px] text-app-secondary';
const USAGE_CONTEXT_SIDE_VALUE_CLASS = 'font-extrabold text-app-primary';
const USAGE_SECTION_CLASS = 'gap-[7px]';
const USAGE_SECTION_HEADER_CLASS = 'min-h-[18px] flex-row items-center justify-between gap-app-sm';
const USAGE_SECTION_TITLE_CLASS = 'text-[13px] font-extrabold leading-[17px] text-app-primary';
const USAGE_CALL_COUNTS_CLASS = 'min-w-0 shrink flex-row justify-end gap-app-sm';
const USAGE_CALL_COUNT_TEXT_CLASS = 'text-[11px] font-bold leading-[14px] text-app-secondary';
const USAGE_CALL_COUNT_VALUE_CLASS = 'font-extrabold text-app-primary';
const USAGE_METRIC_GRID_CLASS = 'flex-row flex-wrap gap-[7px]';
const USAGE_METRIC_CELL_CLASS =
  'h-[34px] grow shrink basis-[31%] flex-row items-center justify-between gap-[5px] rounded-app-sm border border-app-line-strong bg-app-surface px-[9px]';
const USAGE_METRIC_LABEL_CLASS = 'shrink text-[11px] font-bold leading-[14px] text-app-secondary';
const USAGE_METRIC_VALUE_CLASS = 'shrink-0 text-right text-[13px] font-extrabold leading-4 text-app-primary';
const USAGE_DRAWER_PANEL_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: -10 },
  shadowOpacity: 0.14,
  shadowRadius: 24,
  elevation: 12,
} satisfies ViewStyle;

const USAGE_SHEET_SPRING_CONFIG = {
  damping: 20,
  stiffness: 230,
  mass: 0.9
};

const USAGE_REASONING_LABEL_KEYS: Record<ChatReasoningEffort, I18nKey> = {
  HIGH: 'usage.reasoning.HIGH',
  MEDIUM: 'usage.reasoning.MEDIUM',
  LOW: 'usage.reasoning.LOW',
  NONE: 'usage.reasoning.NONE'
};

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

function formatCompactUsageNumber(value: number | null): string {
  if (value === null) {
    return '-';
  }

  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000) {
    return `${trimTrailingZeros((value / 1_000_000).toFixed(1))}m`;
  }
  if (absoluteValue >= 1_000) {
    return `${trimTrailingZeros((value / 1_000).toFixed(1))}k`;
  }

  return String(value);
}

function formatMoneyAmount(value: number): string {
  if (value >= 0.01) {
    return trimTrailingZeros(value.toFixed(3));
  }
  return trimTrailingZeros(value.toFixed(6));
}

function formatChatEstimatedCost(cost: ChatTimelineUsageEstimatedCost | null | undefined): string {
  const total = cost?.total;
  if (total === null || total === undefined || total < 0) {
    return '--';
  }
  const currency = cost?.currency.toUpperCase();
  if (currency === 'USD') {
    return `$${formatMoneyAmount(total)}`;
  }
  if (currency === 'CNY' || currency === 'RMB' || currency === 'CNH') {
    if (total <= 0.1) {
      return `¥ ${(total * 100).toFixed(2)} 分`;
    }
    return `¥ ${trimTrailingZeros(total.toFixed(3))} 元`;
  }
  return formatMoneyAmount(total);
}

function formatUsagePercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '--%' : `${value.toFixed(2)}%`;
}

function resolveDisplayTotal(summary: ChatTimelineUsageSummary): number | null {
  return (
    summary.chat.totalTokens ??
    summary.current.totalTokens ??
    summary.run.totalTokens ??
    summary.compact?.totalTokens ??
    null
  );
}

function resolveUsageModelLabel({
  usageSummary,
  modelKey,
  reasoningEffort,
  t
}: {
  usageSummary: ChatTimelineUsageSummary;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
  t: TFunction;
}): string {
  const displayModelKey = usageSummary.modelKey || modelKey || t('usage.unknownModel');
  const displayReasoningEffort =
    normalizeChatReasoningEffort(usageSummary.contextWindow.reasoningEffort) || reasoningEffort;
  const reasoningLabel = displayReasoningEffort ? t(USAGE_REASONING_LABEL_KEYS[displayReasoningEffort]) : '';
  return reasoningLabel ? `${displayModelKey} · ${reasoningLabel}` : displayModelKey;
}

function resolveUsageEstimatedCost(
  stats: ChatTimelineUsageStats | null | undefined
): ChatTimelineUsageEstimatedCost | null {
  if (stats?.estimatedCost) {
    return stats.estimatedCost;
  }
  const legacyTotal = (stats as { estimatedCostTotal?: number | null } | null | undefined)?.estimatedCostTotal;
  return legacyTotal === null || legacyTotal === undefined
    ? null
    : {
        currency: '',
        inputCacheHit: null,
        inputCacheMiss: null,
        output: null,
        total: legacyTotal
      };
}

function resolveChatCacheHitPercent(summary: ChatTimelineUsageSummary): number | null {
  const hitTokens = summary.chat.cacheHitTokens;
  const missTokens = summary.chat.cacheMissTokens;
  if (hitTokens === null || hitTokens === undefined || missTokens === null || missTokens === undefined) {
    return null;
  }
  const totalTokens = hitTokens + missTokens;
  if (totalTokens <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, (hitTokens / totalTokens) * 100));
}

function buildUsageMetrics(stats: ChatTimelineUsageStats | null | undefined, t: TFunction): UsageMetric[] {
  return [
    { key: 'prompt', label: t('usage.metric.prompt'), value: stats?.promptTokens ?? null },
    { key: 'completion', label: t('usage.metric.completion'), value: stats?.completionTokens ?? null },
    { key: 'total', label: t('usage.metric.total'), value: stats?.totalTokens ?? null },
    { key: 'reasoning', label: t('usage.metric.reasoning'), value: stats?.reasoningTokens ?? null },
    { key: 'cacheHit', label: t('usage.metric.cacheHit'), value: stats?.cacheHitTokens ?? null },
    { key: 'cacheMiss', label: t('usage.metric.cacheMiss'), value: stats?.cacheMissTokens ?? null }
  ];
}

function shouldCaptureUsageDrawerTouch() {
  return true;
}

const UsageRing = memo(function UsageRing({
  percent,
  size = 28
}: {
  percent: number | null | undefined;
  size?: number;
}) {
  const { theme } = useAppTheme();
  const progress = percent === null || percent === undefined ? 0 : Math.max(0, Math.min(100, percent));
  const strokeWidth = size >= 36 ? 3.6 : 3.2;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const label = percent === null || percent === undefined ? '--' : `${Math.round(percent)}%`;

  return (
    <View className={USAGE_RING_CLASS} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.lineStrong}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.brandBlueStrong}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - progress / 100)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View pointerEvents="none" className={USAGE_RING_LABEL_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={USAGE_RING_TEXT_CLASS}>
          {label}
        </Text>
      </View>
    </View>
  );
});

const UsageMetricCell = memo(function UsageMetricCell({ metric }: { metric: UsageMetric }) {
  return (
    <View className={USAGE_METRIC_CELL_CLASS}>
      <Text allowFontScaling={false} numberOfLines={1} className={USAGE_METRIC_LABEL_CLASS}>
        {metric.label}
      </Text>
      <Text allowFontScaling={false} numberOfLines={1} className={USAGE_METRIC_VALUE_CLASS}>
        {formatChatUsageNumber(metric.value)}
      </Text>
    </View>
  );
});

const UsageCallCounts = memo(function UsageCallCounts({ stats }: { stats: ChatTimelineUsageStats | null | undefined }) {
  const t = useT();
  const counts = useMemo(
    () =>
      [
        { key: 'llm', label: t('usage.call.llm'), value: stats?.llmChatCompletionCount ?? null },
        { key: 'tool', label: t('usage.call.tool'), value: stats?.toolCallCount ?? null }
      ].filter((count) => count.value !== null && count.value !== undefined),
    [stats, t]
  );

  if (!counts.length) {
    return null;
  }

  return (
    <View className={USAGE_CALL_COUNTS_CLASS}>
      {counts.map((count) => (
        <Text allowFontScaling={false} numberOfLines={1} key={count.key} className={USAGE_CALL_COUNT_TEXT_CLASS}>
          {count.label} <Text className={USAGE_CALL_COUNT_VALUE_CLASS}>{formatChatUsageNumber(count.value)}</Text>
        </Text>
      ))}
    </View>
  );
});

const UsageSection = memo(function UsageSection({
  title,
  stats
}: {
  title: string;
  stats: ChatTimelineUsageStats | null | undefined;
}) {
  const t = useT();
  const metrics = useMemo(() => buildUsageMetrics(stats, t), [stats, t]);

  return (
    <View className={USAGE_SECTION_CLASS}>
      <View className={USAGE_SECTION_HEADER_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={USAGE_SECTION_TITLE_CLASS}>
          {title}
        </Text>
        <UsageCallCounts stats={stats} />
      </View>
      <View className={USAGE_METRIC_GRID_CLASS}>
        {metrics.map((metric) => (
          <UsageMetricCell key={metric.key} metric={metric} />
        ))}
      </View>
    </View>
  );
});

const UsageContextWindow = memo(function UsageContextWindow({ summary }: { summary: ChatTimelineUsageSummary }) {
  const t = useT();
  const cacheHitLabel = formatUsagePercent(resolveChatCacheHitPercent(summary));
  const estimatedCostLabel = formatChatEstimatedCost(resolveUsageEstimatedCost(summary.chat));

  return (
    <View className={USAGE_CONTEXT_WINDOW_CLASS}>
      <View className={USAGE_CONTEXT_MAIN_CLASS}>
        <UsageRing percent={summary.contextWindow.percent ?? null} size={40} />
        <View className={USAGE_CONTEXT_COPY_CLASS}>
          <Text allowFontScaling={false} numberOfLines={1} className={USAGE_CONTEXT_LABEL_CLASS}>
            {t('usage.context.title')}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} className={USAGE_CONTEXT_VALUE_CLASS}>
            {formatChatUsageNumber(summary.contextWindow.currentSize)} /{' '}
            {formatChatUsageNumber(summary.contextWindow.maxSize)}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} className={USAGE_CONTEXT_HINT_CLASS}>
            {t('usage.context.nextCall', {
              count: formatChatUsageNumber(summary.contextWindow.estimatedNextCallSize)
            })}
          </Text>
        </View>
      </View>
      <View className={USAGE_CONTEXT_SIDE_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={USAGE_CONTEXT_SIDE_TEXT_CLASS}>
          {t('usage.context.cacheHitRate')} <Text className={USAGE_CONTEXT_SIDE_VALUE_CLASS}>{cacheHitLabel}</Text>
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} className={USAGE_CONTEXT_SIDE_TEXT_CLASS}>
          {t('usage.context.totalCost')} <Text className={USAGE_CONTEXT_SIDE_VALUE_CLASS}>{estimatedCostLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const ChatUsageStatsContent = memo(function ChatUsageStatsContent({
  usageSummary
}: {
  usageSummary: ChatTimelineUsageSummary;
}) {
  const t = useT();

  return (
    <ScrollView
      bounces={false}
      showsVerticalScrollIndicator={false}
      className={USAGE_DRAWER_SCROLL_CLASS}
      contentContainerClassName={USAGE_DRAWER_CONTENT_CLASS}
    >
      <UsageContextWindow summary={usageSummary} />
      <UsageSection title={t('usage.section.current')} stats={usageSummary.current} />
      <UsageSection title={t('usage.section.run')} stats={usageSummary.run} />
      <UsageSection title={t('usage.section.chat')} stats={usageSummary.chat} />
      {usageSummary.compact ? <UsageSection title={t('usage.section.compact')} stats={usageSummary.compact} /> : null}
    </ScrollView>
  );
});

const ChatUsageStatsDrawer = memo(function ChatUsageStatsDrawer({
  visible,
  usageSummary,
  modelKey,
  reasoningEffort,
  onClose,
  onDismissed
}: ChatUsageStatsDrawerProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(USAGE_SHEET_ENTER_OFFSET)).current;
  const closeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const modelLabel = useMemo(
    () => resolveUsageModelLabel({ usageSummary, modelKey, reasoningEffort, t }),
    [modelKey, reasoningEffort, t, usageSummary]
  );

  useEffect(() => {
    closeAnimationRef.current?.stop();
    closeAnimationRef.current = null;

    if (!visible) {
      closeAnimationRef.current = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: USAGE_SHEET_ANIMATION_DURATION,
          useNativeDriver: true
        }),
        Animated.timing(translateY, {
          toValue: USAGE_SHEET_ENTER_OFFSET,
          duration: USAGE_SHEET_ANIMATION_DURATION,
          useNativeDriver: true
        })
      ]);
      closeAnimationRef.current.start(({ finished }) => {
        closeAnimationRef.current = null;
        if (finished) {
          onDismissed();
        }
      });
      return;
    }

    backdropOpacity.setValue(0);
    translateY.setValue(USAGE_SHEET_ENTER_OFFSET);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true
      }),
      Animated.spring(translateY, {
        toValue: 0,
        ...USAGE_SHEET_SPRING_CONFIG,
        useNativeDriver: true
      })
    ]).start();
  }, [backdropOpacity, onDismissed, translateY, visible]);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className={USAGE_MODAL_ROOT_CLASS}>
        <Animated.View className={USAGE_BACKDROP_CLASS} style={{ opacity: backdropOpacity }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('usage.close')}
            className={USAGE_BACKDROP_PRESSABLE_CLASS}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          className={USAGE_DRAWER_PANEL_CLASS}
          style={[
            USAGE_DRAWER_PANEL_ELEVATION_STYLE,
            {
              shadowColor: theme.colors.shadow,
              maxHeight: USAGE_SHEET_MAX_HEIGHT,
              paddingBottom: Math.max(insets.bottom, appVisualTokens.spacing.md),
              transform: [{ translateY }]
            }
          ]}
          onStartShouldSetResponder={shouldCaptureUsageDrawerTouch}
        >
          <View className={USAGE_DRAWER_HANDLE_CLASS} />
          <View className={USAGE_DRAWER_HEADER_CLASS}>
            <View className={USAGE_DRAWER_TITLE_BLOCK_CLASS}>
              <Text allowFontScaling={false} numberOfLines={1} className={USAGE_DRAWER_TITLE_CLASS}>
                {t('usage.title')}
              </Text>
              <Text allowFontScaling={false} numberOfLines={1} className={USAGE_DRAWER_MODEL_CLASS}>
                {modelLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('usage.close')}
              onPress={onClose}
              hitSlop={8}
              className={USAGE_DRAWER_CLOSE_CLASS}
            >
              <AppIcon usage="usage.close" />
            </Pressable>
          </View>
          <ChatUsageStatsContent usageSummary={usageSummary} />
        </Animated.View>
      </View>
    </Modal>
  );
});

export const ChatUsageHeaderBadge = memo(function ChatUsageHeaderBadge({
  usageSummary,
  modelKey,
  reasoningEffort
}: ChatUsageHeaderBadgeProps) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const total = resolveDisplayTotal(usageSummary);
  const compactTotal = formatCompactUsageNumber(total);
  const accessibilityLabel =
    total !== null ? `${t('usage.title')}, ${t('usage.metric.total')} ${formatChatUsageNumber(total)}` : t('usage.title');
  const handleOpen = useCallback(() => {
    Keyboard.dismiss();
    setMounted(true);
    setVisible(true);
  }, []);
  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);
  const handleDismissed = useCallback(() => {
    setMounted(false);
  }, []);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={handleOpen}
        hitSlop={6}
        className={USAGE_HEADER_BADGE_CLASS}
      >
        <UsageRing percent={usageSummary.contextWindow.percent ?? null} size={26} />
        <View className={USAGE_HEADER_TEXT_BLOCK_CLASS}>
          <Text allowFontScaling={false} numberOfLines={1} className={USAGE_HEADER_VALUE_CLASS}>
            {compactTotal}
          </Text>
        </View>
      </Pressable>

      {mounted ? (
        <ChatUsageStatsDrawer
          visible={visible}
          usageSummary={usageSummary}
          modelKey={modelKey}
          reasoningEffort={reasoningEffort}
          onClose={handleClose}
          onDismissed={handleDismissed}
        />
      ) : null}
    </>
  );
});
