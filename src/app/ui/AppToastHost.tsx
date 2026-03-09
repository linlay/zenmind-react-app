import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { hideToast } from './uiSlice';
import { useAppTheme } from '../hooks/useAppTheme';

const TOAST_TTL_MS = 2600;

export function AppToastHost() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const { visible, message, tone, nonce } = useAppSelector((state) => state.ui);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-10)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!visible || !message) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -10, duration: 140, useNativeDriver: true })
      ]).start();
      return;
    }

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver: true })
    ]).start();

    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      dispatch(hideToast());
    }, TOAST_TTL_MS);
  }, [dispatch, message, nonce, opacity, translateY, visible]);

  const cardStyle = useMemo(() => {
    if (tone === 'danger') {
      return { backgroundColor: '#fff1f1', borderColor: '#f0c5c5', color: '#b34343' };
    }
    if (tone === 'warn') {
      return { backgroundColor: '#fff7e8', borderColor: '#f0d39a', color: '#9b6921' };
    }
    if (tone === 'success') {
      return { backgroundColor: '#edf9f3', borderColor: '#a9dec0', color: '#1c7a4e' };
    }
    return {
      backgroundColor: theme.surfaceStrong,
      borderColor: theme.border,
      color: theme.text
    };
  }, [theme.border, theme.surfaceStrong, theme.text, tone]);

  if (!message) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.host, { top: Math.max(insets.top + 10, 14) }]}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: cardStyle.backgroundColor,
            borderColor: cardStyle.borderColor,
            opacity,
            transform: [{ translateY }]
          }
        ]}
      >
        <Text style={[styles.text, { color: cardStyle.color }]}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 1000
  },
  card: {
    minHeight: 38,
    maxWidth: 520,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.12)',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  text: {
    fontSize: 13,
    textAlign: 'center'
  }
});
