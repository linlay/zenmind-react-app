import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Pressable,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon.tsx';
import { useT } from '../../../shared/i18n/index.ts';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider.tsx';
import { appVisualTokens } from '../../../shared/visual/foundation.ts';
import type { ChatTimelineArtifactNode } from '../../chatTimeline/index.ts';
import { ArtifactTimelineRow } from './ArtifactTimelineRow.tsx';

type ChatArtifactShortcutProps = {
  count: number;
  onPress: () => void;
};

type ChatArtifactDrawerProps = {
  visible: boolean;
  artifacts: readonly ChatTimelineArtifactNode[];
  onClose: () => void;
};

const ARTIFACT_DRAWER_ANIMATION_DURATION_MS = 160;
const ARTIFACT_DRAWER_MIN_HEIGHT = 340;
const ARTIFACT_DRAWER_MAX_HEIGHT = 620;
const ARTIFACT_DRAWER_HEIGHT_RATIO = 0.68;
const ARTIFACT_DRAW_DISTANCE = 720;
const ARTIFACT_DRAWER_ENTER_OFFSET = ARTIFACT_DRAWER_MAX_HEIGHT + appVisualTokens.spacing.xl;
const ARTIFACT_SHORTCUT_CLASS =
  'absolute bottom-app-md right-app-md z-[30] h-12 w-12 items-center justify-center rounded-app-pill bg-app-action active:opacity-[0.78]';
const ARTIFACT_COUNT_BADGE_CLASS =
  'absolute -right-[3px] -top-[3px] min-w-[20px] items-center justify-center rounded-app-pill border-2 border-app-background bg-app-danger px-[4px]';
const ARTIFACT_COUNT_TEXT_CLASS = 'text-[10px] font-extrabold leading-4 text-app-on-action';
const ARTIFACT_MODAL_ROOT_CLASS = 'flex-1 justify-end';
const ARTIFACT_BACKDROP_CLASS = 'absolute inset-0 bg-app-overlay';
const ARTIFACT_BACKDROP_PRESSABLE_CLASS = 'flex-1';
const ARTIFACT_PANEL_CLASS = 'overflow-hidden rounded-t-[20px] bg-app-surface pt-app-sm';
const ARTIFACT_HANDLE_CLASS = 'mb-app-sm h-[5px] w-9 self-center rounded-app-pill bg-app-line-strong';
const ARTIFACT_HEADER_CLASS =
  'min-h-[52px] flex-row items-center gap-app-md border-b border-app-line px-app-lg pb-app-sm';
const ARTIFACT_HEADER_COPY_CLASS = 'min-w-0 flex-1 gap-[2px]';
const ARTIFACT_TITLE_CLASS = 'text-[18px] font-extrabold leading-6 text-app-primary';
const ARTIFACT_SUBTITLE_CLASS = 'text-[12px] font-semibold leading-4 text-app-secondary';
const ARTIFACT_CLOSE_CLASS =
  'h-9 w-9 items-center justify-center rounded-app-pill bg-app-surface-muted active:opacity-[0.7]';
const ARTIFACT_LIST_CLASS = 'flex-1';
const ARTIFACT_ITEM_CLASS = 'mb-app-md';
const ARTIFACT_EMPTY_CLASS = 'px-app-lg py-app-xl text-center text-[14px] leading-5 text-app-secondary';
const ARTIFACT_LIST_CONTENT_STYLE = {
  paddingHorizontal: appVisualTokens.spacing.lg,
  paddingTop: appVisualTokens.spacing.md
} satisfies ViewStyle;
const ARTIFACT_SHORTCUT_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 16,
  elevation: 8
} satisfies ViewStyle;
const ARTIFACT_PANEL_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: -10 },
  shadowOpacity: 0.14,
  shadowRadius: 24,
  elevation: 12
} satisfies ViewStyle;
const ARTIFACT_DRAWER_SPRING_CONFIG = {
  damping: 20,
  stiffness: 230,
  mass: 0.9
};

function captureArtifactDrawerTouch(): boolean {
  return true;
}

function getArtifactItemType(): string {
  return 'artifact-file';
}

export const ChatArtifactShortcut = memo(function ChatArtifactShortcut({ count, onPress }: ChatArtifactShortcutProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const countLabel = count > 99 ? '99+' : String(Math.max(0, count));
  const handlePress = useCallback(() => {
    Keyboard.dismiss();
    onPress();
  }, [onPress]);

  if (count <= 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('artifact.openDrawer', { count })}
      onPress={handlePress}
      className={ARTIFACT_SHORTCUT_CLASS}
      style={[ARTIFACT_SHORTCUT_ELEVATION_STYLE, { shadowColor: theme.colors.shadow }]}
    >
      <AppIcon usage="runtime.file" color={theme.colors.onBrandBlueAction} size={24} />
      <View className={ARTIFACT_COUNT_BADGE_CLASS}>
        <Text allowFontScaling={false} className={ARTIFACT_COUNT_TEXT_CLASS}>
          {countLabel}
        </Text>
      </View>
    </Pressable>
  );
});

export const ChatArtifactDrawer = memo(function ChatArtifactDrawer({
  visible,
  artifacts,
  onClose
}: ChatArtifactDrawerProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const drawerHeight = Math.min(
    ARTIFACT_DRAWER_MAX_HEIGHT,
    Math.max(ARTIFACT_DRAWER_MIN_HEIGHT, windowHeight * ARTIFACT_DRAWER_HEIGHT_RATIO)
  );
  const hiddenOffset = drawerHeight + appVisualTokens.spacing.xl;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ARTIFACT_DRAWER_ENTER_OFFSET)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [shouldRender, setShouldRender] = useState(visible);
  const countLabel = useMemo(() => t('artifact.drawerCount', { count: artifacts.length }), [artifacts.length, t]);
  const keyExtractor = useCallback((item: ChatTimelineArtifactNode) => item.id, []);
  const renderArtifact = useCallback(
    ({ item }: { item: ChatTimelineArtifactNode }) => (
      <View className={ARTIFACT_ITEM_CLASS}>
        <ArtifactTimelineRow node={item} isLastInRun variant="card" />
      </View>
    ),
    []
  );

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!shouldRender) {
      return;
    }

    animationRef.current?.stop();
    animationRef.current = null;

    if (visible) {
      backdropOpacity.setValue(0);
      translateY.setValue(hiddenOffset);
      animationRef.current = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true
        }),
        Animated.spring(translateY, {
          toValue: 0,
          ...ARTIFACT_DRAWER_SPRING_CONFIG,
          useNativeDriver: true
        })
      ]);
      animationRef.current.start(() => {
        animationRef.current = null;
      });
      return () => animationRef.current?.stop();
    }

    animationRef.current = Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: ARTIFACT_DRAWER_ANIMATION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }),
      Animated.timing(translateY, {
        toValue: hiddenOffset,
        duration: ARTIFACT_DRAWER_ANIMATION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      })
    ]);
    animationRef.current.start(({ finished }) => {
      animationRef.current = null;
      if (finished) {
        setShouldRender(false);
      }
    });
    return () => animationRef.current?.stop();
  }, [backdropOpacity, hiddenOffset, shouldRender, translateY, visible]);

  useEffect(() => () => animationRef.current?.stop(), []);

  if (!shouldRender) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View className={ARTIFACT_MODAL_ROOT_CLASS}>
        <Animated.View className={ARTIFACT_BACKDROP_CLASS} style={{ opacity: backdropOpacity }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('artifact.closeDrawer')}
            onPressIn={onClose}
            onPress={onClose}
            className={ARTIFACT_BACKDROP_PRESSABLE_CLASS}
          />
        </Animated.View>
        <Animated.View
          className={ARTIFACT_PANEL_CLASS}
          style={[
            ARTIFACT_PANEL_ELEVATION_STYLE,
            {
              height: drawerHeight,
              paddingBottom: Math.max(insets.bottom, appVisualTokens.spacing.md),
              shadowColor: theme.colors.shadow,
              transform: [{ translateY }]
            }
          ]}
          onStartShouldSetResponder={captureArtifactDrawerTouch}
        >
          <View className={ARTIFACT_HANDLE_CLASS} />
          <View className={ARTIFACT_HEADER_CLASS}>
            <View className={ARTIFACT_HEADER_COPY_CLASS}>
              <Text allowFontScaling={false} numberOfLines={1} className={ARTIFACT_TITLE_CLASS}>
                {t('artifact.drawerTitle')}
              </Text>
              <Text allowFontScaling={false} numberOfLines={1} className={ARTIFACT_SUBTITLE_CLASS}>
                {countLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('artifact.closeDrawer')}
              onPressIn={onClose}
              onPress={onClose}
              className={ARTIFACT_CLOSE_CLASS}
            >
              <AppIcon usage="artifact.close" />
            </Pressable>
          </View>

          <FlashList
            className={ARTIFACT_LIST_CLASS}
            data={artifacts}
            renderItem={renderArtifact}
            keyExtractor={keyExtractor}
            contentContainerStyle={ARTIFACT_LIST_CONTENT_STYLE}
            drawDistance={ARTIFACT_DRAW_DISTANCE}
            getItemType={getArtifactItemType}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text className={ARTIFACT_EMPTY_CLASS}>{t('artifact.drawerEmpty')}</Text>}
          />
        </Animated.View>
      </View>
    </Modal>
  );
});
