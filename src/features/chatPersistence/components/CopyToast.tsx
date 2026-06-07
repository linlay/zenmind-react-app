import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { appVisualTokens } from '../../../shared/visual/foundation';

const DISMISS_DELAY_MS = 1200;

type CopyToastProps = {
  trigger: number;
  message?: string;
};

export const CopyToast = memo(function CopyToast({
  trigger,
  message = '已复制到剪贴板',
}: CopyToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger <= 0) {
      return undefined;
    }

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, DISMISS_DELAY_MS);

    return () => clearTimeout(timer);
  }, [opacity, trigger]);

  if (trigger <= 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    backgroundColor: appVisualTokens.colors.textPrimary,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    color: appVisualTokens.colors.surface,
  },
});
