import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { appVisualTokens } from '../../../shared/visual/foundation';

function SkeletonBlock({
  width = '100%',
  height,
  style,
}: {
  width?: DimensionValue;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.skeletonBlock, { width, height }, style]} />;
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
    <Animated.View style={[styles.skeletonScreen, { opacity }]}>
      <View style={styles.skeletonHeader}>
        <SkeletonBlock width={22} height={22} style={styles.skeletonRound} />
        <View style={styles.skeletonHeaderCenter}>
          <SkeletonBlock width={78} height={18} />
          <SkeletonBlock width={58} height={12} style={styles.skeletonHeaderMeta} />
        </View>
        <SkeletonBlock width={22} height={22} style={styles.skeletonRound} />
      </View>

      <View style={styles.skeletonThread}>
        <SkeletonBlock width="54%" height={44} style={styles.skeletonBubbleUser} />
        <View style={styles.skeletonAssistantRow}>
          <SkeletonBlock width={18} height={18} style={styles.skeletonRound} />
          <View style={styles.skeletonAssistantText}>
            <SkeletonBlock width="94%" height={15} />
            <SkeletonBlock width="88%" height={15} style={styles.skeletonLineGap} />
            <SkeletonBlock width="62%" height={15} style={styles.skeletonLineGap} />
          </View>
        </View>
        <SkeletonBlock width="34%" height={40} style={styles.skeletonBubbleUser} />
        <View style={styles.skeletonAssistantRow}>
          <SkeletonBlock width={18} height={18} style={styles.skeletonRound} />
          <View style={styles.skeletonAssistantText}>
            <SkeletonBlock width="76%" height={15} />
            <SkeletonBlock width="52%" height={15} style={styles.skeletonLineGap} />
          </View>
        </View>
      </View>

      <View style={styles.skeletonComposer}>
        <SkeletonBlock width="100%" height={50} style={styles.skeletonComposerInput} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  skeletonScreen: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.background,
  },
  skeletonHeader: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: appVisualTokens.spacing.lg,
  },
  skeletonHeaderCenter: {
    alignItems: 'center',
  },
  skeletonHeaderMeta: {
    marginTop: 8,
  },
  skeletonThread: {
    flex: 1,
    paddingHorizontal: appVisualTokens.spacing.md,
    paddingTop: appVisualTokens.spacing.sm,
  },
  skeletonAssistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 22,
  },
  skeletonAssistantText: {
    flex: 1,
    paddingTop: 2,
  },
  skeletonLineGap: {
    marginTop: 8,
  },
  skeletonBubbleUser: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    borderRadius: 18,
  },
  skeletonComposer: {
    paddingHorizontal: appVisualTokens.spacing.lg,
    paddingTop: 5,
    paddingBottom: 6,
  },
  skeletonComposerInput: {
    borderRadius: appVisualTokens.radii.pill,
  },
  skeletonRound: {
    borderRadius: appVisualTokens.radii.pill,
  },
  skeletonBlock: {
    backgroundColor: appVisualTokens.colors.backgroundMuted,
  },
});
