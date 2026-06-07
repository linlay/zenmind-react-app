import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { GeminiLogo } from './GeminiLogo';

type AppLaunchSkeletonProps = {
  dismiss: boolean;
  motionEnabled: boolean;
  onHidden: () => void;
  onReady: () => void;
};

const DECORATION_REVEAL_DURATION_MS = 280;
const FADE_OUT_DURATION_MS = 320;

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

  const logoSize = Math.max(156, Math.min(width * 0.58, height * 0.34, 220));

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
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
        style={[styles.decorationLayer, { opacity: decorationOpacity }]}
      >
        <View style={[styles.ambientOrb, styles.ambientOrbTopLeft]} />
        <View style={[styles.ambientOrb, styles.ambientOrbBottomRight]} />
        <View style={[styles.frostSheet, styles.frostSheetTop]} />
        <View style={[styles.frostSheet, styles.frostSheetBottom]} />
      </Animated.View>

      <GeminiLogo animated={motionEnabled} size={logoSize} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    backgroundColor: '#edf1f5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  decorationLayer: {
    ...StyleSheet.absoluteFill,
  },
  ambientOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
  },
  ambientOrbTopLeft: {
    width: 240,
    height: 240,
    top: -84,
    left: -36,
  },
  ambientOrbBottomRight: {
    width: 280,
    height: 280,
    right: -72,
    bottom: -104,
    backgroundColor: 'rgba(223, 229, 236, 0.9)',
  },
  frostSheet: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.68)',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
  },
  frostSheetTop: {
    width: 420,
    height: 180,
    top: 96,
    left: -86,
    borderRadius: 56,
    transform: [{ rotate: '-18deg' }],
  },
  frostSheetBottom: {
    width: 380,
    height: 180,
    right: -94,
    bottom: 104,
    borderRadius: 56,
    transform: [{ rotate: '16deg' }],
  },
});
