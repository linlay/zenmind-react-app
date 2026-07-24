import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';

export const CHAT_RESPONSE_WAITING_VARIANTS = ['orbit', 'pulse', 'wave', 'typing', 'scan'] as const;

export type ChatResponseWaitingVariant = (typeof CHAT_RESPONSE_WAITING_VARIANTS)[number];

export type ChatResponseWaitingIndicatorProps = {
  variant?: ChatResponseWaitingVariant;
  label?: string;
};

const LOOP_DURATION_MS = 1600;
const ORBIT_DURATION_MS = 1800;
const STAGGER_DELAY_MS = 90;
const STAGGER_PULSE_DURATION_MS = 480;
const WAVE_BAR_COUNT = 5;
const TYPING_DOT_COUNT = 3;

const WAITING_INDICATOR_CLASS = 'h-12 w-full shrink-0 items-center justify-center';
const VISUAL_SHELL_CLASS =
  'h-10 w-12 shrink-0 items-center justify-center overflow-hidden rounded-app-md';
const PULSE_RING_CLASS = 'absolute h-8 w-8 rounded-app-pill border border-app-brand-blue';
const PULSE_CORE_CLASS = 'h-7 w-7 items-center justify-center rounded-app-pill bg-app-action';
const ORBIT_TRACK_CLASS = 'absolute h-8 w-8 rounded-app-pill border border-app-line-strong';
const ORBIT_DOT_PRIMARY_CLASS = 'absolute left-[13px] top-[-2px] h-[7px] w-[7px] rounded-app-pill bg-app-action';
const ORBIT_DOT_SECONDARY_CLASS =
  'absolute bottom-[-1px] left-[14px] h-[5px] w-[5px] rounded-app-pill bg-app-brand-blue';
const ORBIT_CORE_CLASS = 'h-5 w-5 items-center justify-center rounded-app-pill bg-app-surface';
const WAVE_ROW_CLASS = 'h-7 flex-row items-center gap-[3px]';
const WAVE_BAR_CLASS = 'h-4 w-[3px] rounded-app-pill bg-app-brand-blue';
const TYPING_BUBBLE_CLASS =
  'h-7 flex-row items-center gap-[4px] rounded-app-pill border border-app-line-strong bg-app-surface px-[9px]';
const TYPING_DOT_CLASS = 'h-[5px] w-[5px] rounded-app-pill bg-app-brand-blue';
const SCAN_DOCUMENT_CLASS =
  'h-[30px] w-[38px] justify-center gap-[4px] overflow-hidden rounded-app-sm border border-app-line-strong bg-app-surface px-[6px]';
const SCAN_LINE_LONG_CLASS = 'h-[3px] w-full rounded-app-pill bg-app-line-strong';
const SCAN_LINE_MEDIUM_CLASS = 'h-[3px] w-4/5 rounded-app-pill bg-app-line-strong';
const SCAN_LINE_SHORT_CLASS = 'h-[3px] w-1/2 rounded-app-pill bg-app-line-strong';
const SCAN_SWEEP_CLASS = 'absolute inset-y-0 w-4 bg-app-brand-blue-soft';

function useLoopingProgress(durationMs: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.inOut(Easing.cubic),
        isInteraction: false,
        useNativeDriver: true
      })
    );

    animation.start();
    return () => {
      animation.stop();
      progress.setValue(0);
    };
  }, [durationMs, progress]);

  return progress;
}

function useStaggeredPulseProgress(count: number): readonly Animated.Value[] {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  useEffect(() => {
    values.forEach((value) => value.setValue(0));
    const animation = Animated.loop(
      Animated.stagger(
        STAGGER_DELAY_MS,
        values.map((value) =>
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: STAGGER_PULSE_DURATION_MS / 2,
              easing: Easing.out(Easing.cubic),
              isInteraction: false,
              useNativeDriver: true
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: STAGGER_PULSE_DURATION_MS / 2,
              easing: Easing.in(Easing.cubic),
              isInteraction: false,
              useNativeDriver: true
            })
          ])
        )
      )
    );

    animation.start();
    return () => {
      animation.stop();
      values.forEach((value) => value.setValue(0));
    };
  }, [values]);

  return values;
}

const PulseWaitingVisual = memo(function PulseWaitingVisual() {
  const { theme } = useAppTheme();
  const progress = useLoopingProgress(LOOP_DURATION_MS);
  const ringOpacity = progress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0.72, 0.28, 0]
  });
  const ringScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1.32]
  });
  const coreScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.92, 1.06, 0.92]
  });

  return (
    <View className={VISUAL_SHELL_CLASS}>
      <Animated.View className={PULSE_RING_CLASS} style={{ opacity: ringOpacity, transform: [{ scale: ringScale }] }} />
      <Animated.View className={PULSE_CORE_CLASS} style={{ transform: [{ scale: coreScale }] }}>
        <AppIcon usage="preview.terminalAction" color={theme.colors.onBrandBlueAction} size={15} strokeWidth={2.1} />
      </Animated.View>
    </View>
  );
});

const OrbitWaitingVisual = memo(function OrbitWaitingVisual() {
  const progress = useLoopingProgress(ORBIT_DURATION_MS);
  const rotation = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });
  const coreScale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.88, 1.05, 0.88]
  });

  return (
    <View className={VISUAL_SHELL_CLASS}>
      <View className={ORBIT_TRACK_CLASS} />
      <Animated.View className="absolute h-8 w-8" style={{ transform: [{ rotate: rotation }] }}>
        <View className={ORBIT_DOT_PRIMARY_CLASS} />
        <View className={ORBIT_DOT_SECONDARY_CLASS} />
      </Animated.View>
      <Animated.View className={ORBIT_CORE_CLASS} style={{ transform: [{ scale: coreScale }] }}>
        <AppIcon usage="preview.terminalAction" size={12} strokeWidth={2.2} />
      </Animated.View>
    </View>
  );
});

const WaveWaitingVisual = memo(function WaveWaitingVisual() {
  const values = useStaggeredPulseProgress(WAVE_BAR_COUNT);

  return (
    <View className={VISUAL_SHELL_CLASS}>
      <View className={WAVE_ROW_CLASS}>
        {values.map((value, index) => {
          const scaleY = value.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, index === 2 ? 1.25 : 1]
          });
          const opacity = value.interpolate({
            inputRange: [0, 1],
            outputRange: [0.38, 1]
          });

          return <Animated.View key={index} className={WAVE_BAR_CLASS} style={{ opacity, transform: [{ scaleY }] }} />;
        })}
      </View>
    </View>
  );
});

const TypingWaitingVisual = memo(function TypingWaitingVisual() {
  const values = useStaggeredPulseProgress(TYPING_DOT_COUNT);

  return (
    <View className={VISUAL_SHELL_CLASS}>
      <View className={TYPING_BUBBLE_CLASS}>
        {values.map((value, index) => {
          const translateY = value.interpolate({
            inputRange: [0, 1],
            outputRange: [1.5, -3]
          });
          const opacity = value.interpolate({
            inputRange: [0, 1],
            outputRange: [0.38, 1]
          });

          return (
            <Animated.View key={index} className={TYPING_DOT_CLASS} style={{ opacity, transform: [{ translateY }] }} />
          );
        })}
      </View>
    </View>
  );
});

const ScanWaitingVisual = memo(function ScanWaitingVisual() {
  const progress = useLoopingProgress(LOOP_DURATION_MS);
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-22, 44]
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 0.9, 0.9, 0]
  });

  return (
    <View className={VISUAL_SHELL_CLASS}>
      <View className={SCAN_DOCUMENT_CLASS}>
        <Animated.View className={SCAN_SWEEP_CLASS} style={{ opacity, transform: [{ translateX }] }} />
        <View className={SCAN_LINE_LONG_CLASS} />
        <View className={SCAN_LINE_MEDIUM_CLASS} />
        <View className={SCAN_LINE_SHORT_CLASS} />
      </View>
    </View>
  );
});

function WaitingVisual({ variant }: { variant: ChatResponseWaitingVariant }) {
  if (variant === 'pulse') {
    return <PulseWaitingVisual />;
  }
  if (variant === 'wave') {
    return <WaveWaitingVisual />;
  }
  if (variant === 'typing') {
    return <TypingWaitingVisual />;
  }
  if (variant === 'scan') {
    return <ScanWaitingVisual />;
  }
  return <OrbitWaitingVisual />;
}

export const ChatResponseWaitingIndicator = memo(function ChatResponseWaitingIndicator({
  variant = 'orbit',
  label
}: ChatResponseWaitingIndicatorProps) {
  const t = useT();
  const resolvedLabel = label ?? t('chatDetail.waitingForResponse');

  return (
    <View
      accessible
      accessibilityLabel={resolvedLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      className={WAITING_INDICATOR_CLASS}
    >
      <WaitingVisual variant={variant} />
    </View>
  );
});
