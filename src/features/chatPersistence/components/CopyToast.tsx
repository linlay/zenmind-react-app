import { memo, useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';

import { useT } from '../../../shared/i18n';

const DISMISS_DELAY_MS = 1200;
const CONTAINER_CLASS = 'absolute bottom-[140px] left-0 right-0 z-[999] items-center';
const TOAST_CLASS = 'rounded-[24px] bg-app-primary px-app-xl py-app-md';
const TOAST_TEXT_CLASS = 'text-app-body-sm font-semibold text-app-surface';

type CopyToastProps = {
  trigger: number;
  message?: string;
};

export const CopyToast = memo(function CopyToast({ trigger, message }: CopyToastProps) {
  const t = useT();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger <= 0) {
      return undefined;
    }

    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }).start();
    }, DISMISS_DELAY_MS);

    return () => clearTimeout(timer);
  }, [opacity, trigger]);

  if (trigger <= 0) {
    return null;
  }

  return (
    <Animated.View className={CONTAINER_CLASS} style={{ opacity }} pointerEvents="none">
      <View className={TOAST_CLASS}>
        <Text className={TOAST_TEXT_CLASS}>{message || t('copyToast.default')}</Text>
      </View>
    </Animated.View>
  );
});
