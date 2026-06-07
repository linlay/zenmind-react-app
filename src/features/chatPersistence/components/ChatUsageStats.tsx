import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Svg } from 'react-native-svg';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { appVisualTokens } from '../../../shared/visual/foundation';
import type {
  ChatTimelineUsageEstimatedCost,
  ChatTimelineUsageStats,
  ChatTimelineUsageSummary,
} from '../../chatTimeline/index.ts';

type ChatUsageStatsButtonProps = {
  usageLabel: string;
  usageSummary: ChatTimelineUsageSummary | null;
};

type ChatUsageStatsDrawerProps = {
  visible: boolean;
  usageSummary: ChatTimelineUsageSummary | null;
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
const USAGE_METRIC_CELL_BASIS = '31%';

const USAGE_SHEET_SPRING_CONFIG = {
  damping: 20,
  stiffness: 230,
  mass: 0.9,
};

function readUsageTotalFromLabel(usageLabel: string): number | null {
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

function resolveDisplayTotal(
  summary: ChatTimelineUsageSummary | null,
  usageLabel: string
): number | null {
  return (
    summary?.chat.totalTokens ??
    summary?.current.totalTokens ??
    summary?.run.totalTokens ??
    summary?.compact?.totalTokens ??
    readUsageTotalFromLabel(usageLabel)
  );
}

function resolveUsageEstimatedCost(
  stats: ChatTimelineUsageStats | null | undefined
): ChatTimelineUsageEstimatedCost | null {
  if (stats?.estimatedCost) {
    return stats.estimatedCost;
  }
  const legacyTotal = (stats as { estimatedCostTotal?: number | null } | null | undefined)
    ?.estimatedCostTotal;
  return legacyTotal === null || legacyTotal === undefined
    ? null
    : {
        currency: '',
        inputCacheHit: null,
        inputCacheMiss: null,
        output: null,
        total: legacyTotal,
      };
}

function resolveChatCacheHitPercent(summary: ChatTimelineUsageSummary | null): number | null {
  const hitTokens = summary?.chat.cacheHitTokens;
  const missTokens = summary?.chat.cacheMissTokens;
  if (
    hitTokens === null ||
    hitTokens === undefined ||
    missTokens === null ||
    missTokens === undefined
  ) {
    return null;
  }
  const totalTokens = hitTokens + missTokens;
  if (totalTokens <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, (hitTokens / totalTokens) * 100));
}

function buildUsageMetrics(stats: ChatTimelineUsageStats | null | undefined): UsageMetric[] {
  return [
    { key: 'prompt', label: '输入', value: stats?.promptTokens ?? null },
    { key: 'completion', label: '输出', value: stats?.completionTokens ?? null },
    { key: 'total', label: '总计', value: stats?.totalTokens ?? null },
    { key: 'reasoning', label: '推理', value: stats?.reasoningTokens ?? null },
    { key: 'cacheHit', label: '缓存命中', value: stats?.cacheHitTokens ?? null },
    { key: 'cacheMiss', label: '缓存未命中', value: stats?.cacheMissTokens ?? null },
  ];
}

function shouldCaptureUsageDrawerTouch() {
  return true;
}

const UsageRing = memo(function UsageRing({
  percent,
  size = 28,
}: {
  percent: number | null | undefined;
  size?: number;
}) {
  const progress =
    percent === null || percent === undefined ? 0 : Math.max(0, Math.min(100, percent));
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
          stroke={appVisualTokens.colors.lineStrong}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={appVisualTokens.colors.brandBlueStrong}
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

const UsageCallCounts = memo(function UsageCallCounts({
  stats,
}: {
  stats: ChatTimelineUsageStats | null | undefined;
}) {
  const counts = useMemo(
    () =>
      [
        { key: 'llm', label: 'LLM 调用', value: stats?.llmChatCompletionCount ?? null },
        { key: 'tool', label: '工具', value: stats?.toolCallCount ?? null },
      ].filter((count) => count.value !== null && count.value !== undefined),
    [stats]
  );

  if (!counts.length) {
    return null;
  }

  return (
    <View style={styles.usageCallCounts}>
      {counts.map((count) => (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          key={count.key}
          style={styles.usageCallCountText}
        >
          {count.label}{' '}
          <Text style={styles.usageCallCountValue}>{formatUsageNumber(count.value)}</Text>
        </Text>
      ))}
    </View>
  );
});

const UsageSection = memo(function UsageSection({
  title,
  stats,
}: {
  title: string;
  stats: ChatTimelineUsageStats | null | undefined;
}) {
  const metrics = useMemo(() => buildUsageMetrics(stats), [stats]);

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

const UsageContextWindow = memo(function UsageContextWindow({
  summary,
}: {
  summary: ChatTimelineUsageSummary | null;
}) {
  const cacheHitLabel = formatUsagePercent(resolveChatCacheHitPercent(summary));
  const estimatedCostLabel = formatChatEstimatedCost(resolveUsageEstimatedCost(summary?.chat));

  return (
    <View style={styles.usageContextWindow}>
      <View style={styles.usageContextMain}>
        <UsageRing percent={summary?.contextWindow.percent ?? null} size={40} />
        <View style={styles.usageContextCopy}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextLabel}>
            上下文窗口
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextValue}>
            {formatUsageNumber(summary?.contextWindow.currentSize)} /{' '}
            {formatUsageNumber(summary?.contextWindow.maxSize)}
          </Text>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextHint}>
            预计下次调用 {formatUsageNumber(summary?.contextWindow.estimatedNextCallSize)}
          </Text>
        </View>
      </View>
      <View style={styles.usageContextSide}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextSideText}>
          缓存命中率: <Text style={styles.usageContextSideValue}>{cacheHitLabel}</Text>
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.usageContextSideText}>
          总花费: <Text style={styles.usageContextSideValue}>{estimatedCostLabel}</Text>
        </Text>
      </View>
    </View>
  );
});

const ChatUsageStatsContent = memo(function ChatUsageStatsContent({
  usageSummary,
}: {
  usageSummary: ChatTimelineUsageSummary | null;
}) {
  return (
    <ScrollView
      bounces={false}
      showsVerticalScrollIndicator={false}
      style={styles.usageDrawerScroll}
      contentContainerStyle={styles.usageDrawerContent}
    >
      <UsageContextWindow summary={usageSummary} />
      <UsageSection title="本次调用" stats={usageSummary?.current} />
      <UsageSection title="最新运行累计" stats={usageSummary?.run} />
      <UsageSection title="会话累计" stats={usageSummary?.chat} />
      {usageSummary?.compact ? (
        <UsageSection title="上下文压缩" stats={usageSummary.compact} />
      ) : null}
    </ScrollView>
  );
});

const ChatUsageStatsDrawer = memo(function ChatUsageStatsDrawer({
  visible,
  usageSummary,
  onClose,
  onDismissed,
}: ChatUsageStatsDrawerProps) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(USAGE_SHEET_ENTER_OFFSET)).current;
  const closeAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const modelLabel = usageSummary?.modelKey || '未知模型';

  useEffect(() => {
    closeAnimationRef.current?.stop();
    closeAnimationRef.current = null;

    if (!visible) {
      closeAnimationRef.current = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: USAGE_SHEET_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: USAGE_SHEET_ENTER_OFFSET,
          duration: USAGE_SHEET_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
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
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        ...USAGE_SHEET_SPRING_CONFIG,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, onDismissed, translateY, visible]);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.usageModalRoot}>
        <Animated.View style={[styles.usageBackdrop, { opacity: backdropOpacity }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭用量统计"
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
              transform: [{ translateY }],
            },
          ]}
          onStartShouldSetResponder={shouldCaptureUsageDrawerTouch}
        >
          <View style={styles.usageDrawerHandle} />
          <View style={styles.usageDrawerHeader}>
            <View style={styles.usageDrawerTitleBlock}>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.usageDrawerTitle}>
                用量统计
              </Text>
              <Text allowFontScaling={false} numberOfLines={1} style={styles.usageDrawerModel}>
                {modelLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭用量统计"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                styles.usageDrawerClose,
                pressed && styles.usageButtonPressed,
              ]}
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

export const ChatUsageStatsButton = memo(function ChatUsageStatsButton({
  usageLabel,
  usageSummary,
}: ChatUsageStatsButtonProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const normalizedUsageLabel = usageLabel.trim();
  const hasUsageStats = Boolean(normalizedUsageLabel || usageSummary);
  const total = useMemo(
    () => resolveDisplayTotal(usageSummary, normalizedUsageLabel),
    [normalizedUsageLabel, usageSummary]
  );
  const accessibilityLabel = total
    ? `打开用量统计，总计 ${formatUsageNumber(total)} tokens`
    : '打开用量统计';
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
        hitSlop={8}
        style={({ pressed }) => [styles.usageButton, pressed && styles.usageButtonPressed]}
      >
        <UsageRing percent={usageSummary?.contextWindow.percent ?? null} />
      </Pressable>

      {mounted ? (
        <ChatUsageStatsDrawer
          visible={visible}
          usageSummary={usageSummary}
          onClose={handleClose}
          onDismissed={handleDismissed}
        />
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  usageButton: {
    width: 34,
    height: 34,
    borderRadius: appVisualTokens.radii.pill,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.lineStrong,
    backgroundColor: appVisualTokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  usageButtonPressed: {
    opacity: 0.68,
  },
  usageRing: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  usageRingLabel: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usageRingText: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
    textAlign: 'center',
  },
  usageModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  usageBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appVisualTokens.colors.overlay,
  },
  usageBackdropPressable: {
    flex: 1,
  },
  usageDrawerPanel: {
    borderTopLeftRadius: appVisualTokens.radii.lg,
    borderTopRightRadius: appVisualTokens.radii.lg,
    backgroundColor: appVisualTokens.colors.surface,
    paddingHorizontal: appVisualTokens.spacing.lg,
    paddingTop: appVisualTokens.spacing.sm,
    shadowColor: appVisualTokens.colors.shadow,
    shadowOffset: {
      width: 0,
      height: -10,
    },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
  usageDrawerHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: appVisualTokens.colors.lineStrong,
    alignSelf: 'center',
    marginBottom: appVisualTokens.spacing.md,
  },
  usageDrawerHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.md,
    paddingBottom: appVisualTokens.spacing.sm,
  },
  usageDrawerTitleBlock: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  usageDrawerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  usageDrawerModel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
  },
  usageDrawerClose: {
    width: 30,
    height: 30,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  usageDrawerScroll: {
    flexGrow: 0,
  },
  usageDrawerContent: {
    gap: appVisualTokens.spacing.md,
    paddingBottom: appVisualTokens.spacing.sm,
  },
  usageContextWindow: {
    borderRadius: appVisualTokens.radii.sm,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
  },
  usageContextMain: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
  },
  usageContextCopy: {
    minWidth: 0,
    flex: 1,
    gap: 1,
  },
  usageContextLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
  },
  usageContextValue: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  usageContextHint: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: appVisualTokens.colors.textSecondary,
  },
  usageContextSide: {
    minWidth: 126,
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 4,
  },
  usageContextSideText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
    textAlign: 'right',
  },
  usageContextSideValue: {
    color: appVisualTokens.colors.textPrimary,
    fontWeight: '800',
  },
  usageSection: {
    gap: 7,
  },
  usageSectionHeader: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: appVisualTokens.spacing.sm,
  },
  usageSectionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
  },
  usageCallCounts: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: appVisualTokens.spacing.sm,
  },
  usageCallCountText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
  },
  usageCallCountValue: {
    color: appVisualTokens.colors.textPrimary,
    fontWeight: '800',
  },
  usageMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  usageMetricCell: {
    flexBasis: USAGE_METRIC_CELL_BASIS,
    flexGrow: 1,
    flexShrink: 1,
    height: 34,
    borderRadius: appVisualTokens.radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.lineStrong,
    backgroundColor: appVisualTokens.colors.surface,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  usageMetricLabel: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
  },
  usageMetricValue: {
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '800',
    color: appVisualTokens.colors.textPrimary,
    textAlign: 'right',
  },
});
