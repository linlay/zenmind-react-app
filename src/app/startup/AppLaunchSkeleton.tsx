import { useEffect, useRef } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';

import { BRAND_SPLASH_BACKGROUND_COLOR, BRAND_SPLASH_IMAGE_WIDTH } from '../../shared/generated/brand';
import { GeminiLogo } from './GeminiLogo';

type AppLaunchSkeletonProps = {
  dismiss: boolean;
  motionEnabled: boolean;
  onHidden: () => void;
  onReady: () => void;
};

const DECORATION_REVEAL_DURATION_MS = 280;
const FADE_OUT_DURATION_MS = 320;
const OVERLAY_CLASS = 'absolute inset-0 z-20 items-center justify-center overflow-hidden';
const DECORATION_LAYER_CLASS = 'absolute inset-0';
const AMBIENT_ORB_CLASS = 'absolute rounded-app-pill bg-white/80';
const AMBIENT_ORB_TOP_LEFT_CLASS = `${AMBIENT_ORB_CLASS} left-[-36px] top-[-84px] h-[240px] w-[240px]`;
const AMBIENT_ORB_BOTTOM_RIGHT_CLASS =
  `${AMBIENT_ORB_CLASS} bottom-[-104px] right-[-72px] h-[280px] w-[280px] bg-[#dfe5ec]/90`;
const FROST_SHEET_CLASS = 'absolute border border-white/70 bg-white/35';
const FROST_SHEET_TOP_CLASS =
  `${FROST_SHEET_CLASS} left-[-86px] top-[96px] h-[180px] w-[420px] rounded-[56px] -rotate-[18deg]`;
const FROST_SHEET_BOTTOM_CLASS =
  `${FROST_SHEET_CLASS} bottom-[104px] right-[-94px] h-[180px] w-[380px] rounded-[56px] rotate-[16deg]`;

export function AppLaunchSkeleton({
  dismiss,
  motionEnabled,
  onHidden,
  onReady,
}: AppLaunchSkeletonProps) {
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(1)).current;
  const decorationOpacity = useRef(new Animated.Value(0)).current;
  const hasStartedFadeOut = useRef(false);
  const hasStartedDecorationReveal = useRef(false);
  const hasReportedReady = useRef(false);

  useEffect(() => {
    if (!motionEnabled || hasStartedDecorationReveal.current) {
      return;
    }

    hasStartedDecorationReveal.current = true;
    Animated.timing(decorationOpacity, {
      toValue: 1,
      duration: DECORATION_REVEAL_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [decorationOpacity, motionEnabled]);

  useEffect(() => {
    if (!dismiss || hasStartedFadeOut.current) {
      return;
    }

    hasStartedFadeOut.current = true;
    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onHidden();
      }
    });
  }, [dismiss, onHidden, opacity]);

  const logoSize = Math.max(156, Math.min(width * 0.58, height * 0.34, BRAND_SPLASH_IMAGE_WIDTH));

  return (
    <Animated.View
      className={OVERLAY_CLASS}
      style={{ opacity, backgroundColor: BRAND_SPLASH_BACKGROUND_COLOR }}
      onLayout={() => {
        if (hasReportedReady.current) {
          return;
        }

        hasReportedReady.current = true;
        onReady();
      }}
    >
      <Animated.View
        pointerEvents="none"
        className={DECORATION_LAYER_CLASS}
        style={{ opacity: decorationOpacity }}
      >
        <View className={AMBIENT_ORB_TOP_LEFT_CLASS} />
        <View className={AMBIENT_ORB_BOTTOM_RIGHT_CLASS} />
        <View className={FROST_SHEET_TOP_CLASS} />
        <View className={FROST_SHEET_BOTTOM_CLASS} />
      </Animated.View>

      <GeminiLogo animated={motionEnabled} size={logoSize} />
    </Animated.View>
  );
}
