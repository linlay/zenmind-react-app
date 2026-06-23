import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type I18nKey, type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import type {
  ChatTimelineUsageEstimatedCost,
  ChatTimelineUsageStats,
  ChatTimelineUsageSummary
} from '../../chatTimeline/index.ts';
import { normalizeChatReasoningEffort } from '../agentModelSettings.ts';
import type { ChatReasoningEffort } from '../types';

type ChatUsageHeaderBadgeProps = {
  usageLabel: string;
  usageSummary: ChatTimelineUsageSummary | null;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
};

type ChatUsageStatsDrawerProps = {
  visible: boolean;
  usageSummary: ChatTimelineUsageSummary | null;
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

const USAGE_HEADER_BADGE_WIDTH = 72;
const USAGE_SHEET_ANIMATION_DURATION = 150;
const USAGE_SHEET_MAX_HEIGHT = 580;
const USAGE_SHEET_ENTER_OFFSET = USAGE_SHEET_MAX_HEIGHT + appVisualTokens.spacing.xl;
const USAGE_METRIC_CELL_BASIS = '31%';

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

function readLegacyUsageTotalFromLabel(usageLabel: string): number | null {
  const match = usageLabel.match(/总计\s*([\d,.]+)/);
  const numberValue = match ? Number(match[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatUsageNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : value.toLocaleString();
}

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

function resolveDisplayTotal(summary: ChatTimelineUsageSummary | null, usageLabel: string): number | null {
  return (
    summary?.chat.totalTokens ??
    summary?.current.totalTokens ??
    summary?.run.totalTokens ??
    summary?.compact?.totalTokens ??
    readLegacyUsageTotalFromLabel(usageLabel)
  );
}

function resolveUsageModelLabel({
  usageSummary,
  modelKey,
  reasoningEffort,
  t
}: {
  usageSummary: ChatTimelineUsageSummary | null;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
  t: TFunction;
}): string {
  const displayModelKey = usageSummary?.modelKey || modelKey || t('usage.unknownModel');
  const displayReasoningEffort =
    normalizeChatReasoningEffort(usageSummary?.contextWindow.reasoningEffort) || reasoningEffort;
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

function resolveChatCacheHitPercent(summary: ChatTimelineUsageSummary | null): number | null {
  const hitTokens = summary?.chat.cacheHitTokens;
  const missTokens = summary?.chat.cacheMissTokens;
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
  const styles = useAppThemeStyles(createStyles);
  const progress = percent === null || percent === undefined ? 0 : Math.max(0, Math.min(100, percent));
  const strokeWidth = size >= 36 ? 3.6 : 3.2;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const label = percent === null || percent === undefined ? '--' : `${Math.round(percent)}%`;

  return (
    <View style={[styles.usageRing, { width: size, height: size }]}>
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
      <View pointerEvents="none" style={styles.usageRingLabel}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.usageRingText}>
          {label}
        </Text>
      </View>
    </View>
  );
});

const UsageMetricCell = memo(function UsageMetricCell({ metric }: { metric: UsageMetric }) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <View style={styles.usageMetricCell}>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.usageMetricLabel}>
        {metric.label}
      </Text>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.usageMetricValue}>
        {formatUsageNumber(metric.value)}
      </Text>
    </View>
  );
});

const UsageCallCounts = memo(function UsageCallCounts({ stats }: { stats: ChatTimelineUsageStats | null | undefined }) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
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
    <View style={styles.usageCallCounts}>
      {counts.map((count) => (
        <Text allowFontScaling={false} numberOfLines={1} key={count.key} style={styles.usageCallCountText}>
          {count.label} <Text style={styles.usageCallCountValue}>{formatUsageNumber(count.value)}</Text>
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
  const styles = useAppThemeStyles(createStyles);
  const metrics = useMemo(() => buildUsageMetrics(stats, t), [stats, t]);

  return (
    <View style={styles.usageSection}>
      <View style={styles.usageSectionHeader}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.usageSectionTitle}>
          {title}
        </Text>
        <UsageCallCounts stats={stats} />
      </View>
      <View style={styles.usageMetricGrid}>
        {metrics.map((metric) => (
          <UsageMetricCell key={metric.key} metric={metric} />
        ))}
      </View>
    </View>
  );
});

const UsageContextWindow = memo(function UsageContextWindow({ summary }: { summary: ChatTimelineUsageSummary | null }) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const cacheHitLabel = formatUsagePercent(resolveChatCacheHitPercent(summary));
  const estimatedCostLabel = formatChatEstimatedCost(resolveUsageEstimatedCost(summary?.chat));

  return (
    <View style={styles.usageContextWindow}>
      <View style={styles.usageContextMain}>
        <UsageRing percent={summary?.contextWindow.percent ?? null} size={40} />
        <View style={styles.usageContextCopy}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextLabel}>
            {t('usage.context.title')}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextValue}>
            {formatUsageNumber(summary?.contextWindow.currentSize)} /{' '}
            {formatUsageNumber(summary?.contextWindow.maxSize)}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextHint}>
            {t('usage.context.nextCall', {
              count: formatUsageNumber(summary?.contextWindow.estimatedNextCallSize)
            })}
          </Text>
        </View>
      </View>
      <View style={styles.usageContextSide}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextSideText}>
          {t('usage.context.cacheHitRate')} <Text style={styles.usageContextSideValue}>{cacheHitLabel}</Text>
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextSideText}>
          {t('usage.context.totalCost')} <Text style={styles.usageContextSideValue}>{estimatedCostLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const ChatUsageStatsContent = memo(function ChatUsageStatsContent({
  usageSummary
}: {
  usageSummary: ChatTimelineUsageSummary | null;
}) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);

  return (
    <ScrollView
      bounces={false}
      showsVerticalScrollIndicator={false}
      style={styles.usageDrawerScroll}
      contentContainerStyle={styles.usageDrawerContent}
    >
      <UsageContextWindow summary={usageSummary} />
      <UsageSection title={t('usage.section.current')} stats={usageSummary?.current} />
      <UsageSection title={t('usage.section.run')} stats={usageSummary?.run} />
      <UsageSection title={t('usage.section.chat')} stats={usageSummary?.chat} />
      {usageSummary?.compact ? <UsageSection title={t('usage.section.compact')} stats={usageSummary.compact} /> : null}
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
  const styles = useAppThemeStyles(createStyles);
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
      <View style={styles.usageModalRoot}>
        <Animated.View style={[styles.usageBackdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('usage.close')}
            style={styles.usageBackdropPressable}
            onPress={onClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.usageDrawerPanel,
            {
              maxHeight: USAGE_SHEET_MAX_HEIGHT,
              paddingBottom: Math.max(insets.bottom, appVisualTokens.spacing.md),
              transform: [{ translateY }]
            }
          ]}
          onStartShouldSetResponder={shouldCaptureUsageDrawerTouch}
        >
          <View style={styles.usageDrawerHandle} />
          <View style={styles.usageDrawerHeader}>
            <View style={styles.usageDrawerTitleBlock}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.usageDrawerTitle}>
                {t('usage.title')}
              </Text>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.usageDrawerModel}>
                {modelLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('usage.close')}
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.usageDrawerClose, pressed && styles.usageButtonPressed]}
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
  usageLabel,
  usageSummary,
  modelKey,
  reasoningEffort
}: ChatUsageHeaderBadgeProps) {
  const t = useT();
  const styles = useAppThemeStyles(createStyles);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const normalizedUsageLabel = usageLabel.trim();
  const hasUsageStats = Boolean(normalizedUsageLabel || usageSummary);
  const total = resolveDisplayTotal(usageSummary, normalizedUsageLabel);
  const compactTotal = formatCompactUsageNumber(total);
  const accessibilityLabel =
    total !== null ? `${t('usage.title')}, ${t('usage.metric.total')} ${formatUsageNumber(total)}` : t('usage.title');
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

  if (!hasUsageStats) {
    return null;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={handleOpen}
        hitSlop={6}
        style={({ pressed }) => [styles.usageHeaderBadge, pressed && styles.usageButtonPressed]}
      >
        <UsageRing percent={usageSummary?.contextWindow.percent ?? null} size={26} />
        <View style={styles.usageHeaderTextBlock}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageHeaderValue}>
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

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    usageHeaderBadge: {
      width: USAGE_HEADER_BADGE_WIDTH,
      height: 34,
      borderRadius: appVisualTokens.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.lineStrong,
      backgroundColor: theme.colors.surface,
      paddingLeft: 4,
      paddingRight: 7,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      flexShrink: 0
    },
    usageButtonPressed: {
      opacity: 0.68
    },
    usageHeaderTextBlock: {
      minWidth: 0,
      flex: 1,
      alignItems: 'flex-start',
      justifyContent: 'center'
    },
    usageHeaderValue: {
      maxWidth: '100%',
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    usageRing: {
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    },
    usageRingLabel: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center'
    },
    usageRingText: {
      fontSize: 7,
      lineHeight: 9,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'center'
    },
    usageModalRoot: {
      flex: 1,
      justifyContent: 'flex-end'
    },
    usageBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: theme.colors.overlay
    },
    usageBackdropPressable: {
      flex: 1
    },
    usageDrawerPanel: {
      borderTopLeftRadius: appVisualTokens.radii.lg,
      borderTopRightRadius: appVisualTokens.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: appVisualTokens.spacing.lg,
      paddingTop: appVisualTokens.spacing.sm,
      shadowColor: theme.colors.shadow,
      shadowOffset: {
        width: 0,
        height: -10
      },
      shadowOpacity: 0.14,
      shadowRadius: 24,
      elevation: 12
    },
    usageDrawerHandle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.lineStrong,
      alignSelf: 'center',
      marginBottom: appVisualTokens.spacing.md
    },
    usageDrawerHeader: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.md,
      paddingBottom: appVisualTokens.spacing.sm
    },
    usageDrawerTitleBlock: {
      minWidth: 0,
      flex: 1,
      gap: 2
    },
    usageDrawerTitle: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    usageDrawerModel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    usageDrawerClose: {
      width: 30,
      height: 30,
      borderRadius: appVisualTokens.radii.pill,
      backgroundColor: theme.colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center'
    },
    usageDrawerScroll: {
      flexGrow: 0
    },
    usageDrawerContent: {
      gap: appVisualTokens.spacing.md,
      paddingBottom: appVisualTokens.spacing.sm
    },
    usageContextWindow: {
      borderRadius: appVisualTokens.radii.sm,
      backgroundColor: theme.colors.brandBlueSoft,
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm
    },
    usageContextMain: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.sm
    },
    usageContextCopy: {
      minWidth: 0,
      flex: 1,
      gap: 1
    },
    usageContextLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    usageContextValue: {
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    usageContextHint: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary
    },
    usageContextSide: {
      minWidth: 126,
      flexShrink: 0,
      alignItems: 'flex-end',
      gap: 4
    },
    usageContextSideText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textAlign: 'right'
    },
    usageContextSideValue: {
      color: theme.colors.textPrimary,
      fontWeight: '800'
    },
    usageSection: {
      gap: 7
    },
    usageSectionHeader: {
      minHeight: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: appVisualTokens.spacing.sm
    },
    usageSectionTitle: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '800',
      color: theme.colors.textPrimary
    },
    usageCallCounts: {
      minWidth: 0,
      flexShrink: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: appVisualTokens.spacing.sm
    },
    usageCallCountText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    usageCallCountValue: {
      color: theme.colors.textPrimary,
      fontWeight: '800'
    },
    usageMetricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7
    },
    usageMetricCell: {
      flexBasis: USAGE_METRIC_CELL_BASIS,
      flexGrow: 1,
      flexShrink: 1,
      height: 34,
      borderRadius: appVisualTokens.radii.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.lineStrong,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 5
    },
    usageMetricLabel: {
      flexShrink: 1,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      color: theme.colors.textSecondary
    },
    usageMetricValue: {
      flexShrink: 0,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '800',
      color: theme.colors.textPrimary,
      textAlign: 'right'
    }
  });
}
