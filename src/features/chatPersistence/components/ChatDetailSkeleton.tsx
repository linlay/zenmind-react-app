import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, View } from 'react-native';

import { cn } from '../../../shared/visual/className';

const SKELETON_SCREEN_CLASS = 'flex-1 bg-app-background';
const SKELETON_HEADER_CLASS = 'h-[58px] flex-row items-center justify-between px-app-lg';
const SKELETON_HEADER_CENTER_CLASS = 'items-center';
const SKELETON_HEADER_META_CLASS = 'mt-2';
const SKELETON_THREAD_CLASS = 'flex-1 px-app-md pt-app-sm';
const SKELETON_ASSISTANT_ROW_CLASS = 'mb-[22px] flex-row items-start gap-2';
const SKELETON_ASSISTANT_TEXT_CLASS = 'flex-1 pt-[2px]';
const SKELETON_LINE_GAP_CLASS = 'mt-2';
const SKELETON_BUBBLE_USER_CLASS = 'mb-5 self-end rounded-[18px]';
const SKELETON_COMPOSER_CLASS = 'px-app-lg pb-[6px] pt-[5px]';
const SKELETON_COMPOSER_INPUT_CLASS = 'rounded-app-pill';
const SKELETON_ROUND_CLASS = 'rounded-app-pill';
const SKELETON_BLOCK_CLASS = 'bg-app-background-muted';

function SkeletonBlock({
  width = '100%',
  height,
  className,
}: {
  width?: DimensionValue;
  height: number;
  className?: string;
}) {
  return <View className={cn(SKELETON_BLOCK_CLASS, className)} style={{ width, height }} />;
}

export function ChatDetailSkeleton() {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.92,
          duration: 820,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 820,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View className={SKELETON_SCREEN_CLASS} style={{ opacity }}>
      <View className={SKELETON_HEADER_CLASS}>
        <SkeletonBlock width={22} height={22} className={SKELETON_ROUND_CLASS} />
        <View className={SKELETON_HEADER_CENTER_CLASS}>
          <SkeletonBlock width={78} height={18} />
          <SkeletonBlock width={58} height={12} className={SKELETON_HEADER_META_CLASS} />
        </View>
        <SkeletonBlock width={22} height={22} className={SKELETON_ROUND_CLASS} />
      </View>

      <View className={SKELETON_THREAD_CLASS}>
        <SkeletonBlock width="54%" height={44} className={SKELETON_BUBBLE_USER_CLASS} />
        <View className={SKELETON_ASSISTANT_ROW_CLASS}>
          <SkeletonBlock width={18} height={18} className={SKELETON_ROUND_CLASS} />
          <View className={SKELETON_ASSISTANT_TEXT_CLASS}>
            <SkeletonBlock width="94%" height={15} />
            <SkeletonBlock width="88%" height={15} className={SKELETON_LINE_GAP_CLASS} />
            <SkeletonBlock width="62%" height={15} className={SKELETON_LINE_GAP_CLASS} />
          </View>
        </View>
        <SkeletonBlock width="34%" height={40} className={SKELETON_BUBBLE_USER_CLASS} />
        <View className={SKELETON_ASSISTANT_ROW_CLASS}>
          <SkeletonBlock width={18} height={18} className={SKELETON_ROUND_CLASS} />
          <View className={SKELETON_ASSISTANT_TEXT_CLASS}>
            <SkeletonBlock width="76%" height={15} />
            <SkeletonBlock width="52%" height={15} className={SKELETON_LINE_GAP_CLASS} />
          </View>
        </View>
      </View>

      <View className={SKELETON_COMPOSER_CLASS}>
        <SkeletonBlock width="100%" height={50} className={SKELETON_COMPOSER_INPUT_CLASS} />
      </View>
    </Animated.View>
  );
}
