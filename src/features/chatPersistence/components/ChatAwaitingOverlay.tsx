import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { appVisualTokens, formatConversationTimestamp } from '../../../shared/visual/foundation';
import { ChatConversationAwaitingState } from '../../chatRealtime/types';

const ANIMATION_DURATION = 280;
const SPRING_CONFIG = {
  damping: 18,
  stiffness: 220,
  mass: 0.9,
};

type ChatAwaitingOverlayProps = {
  awaiting: ChatConversationAwaitingState;
  onDismiss: () => void;
};

type ChatAwaitingResumeBarProps = {
  awaiting: ChatConversationAwaitingState | null;
  visible: boolean;
  onPress: () => void;
};

function getModeLabel(mode: ChatConversationAwaitingState['mode']): string {
  switch (mode) {
    case 'plan':
      return '计划';
    case 'approval':
      return '审批';
    case 'form':
      return '表单';
    case 'question':
    default:
      return '提问';
  }
}

function getModeHint(mode: ChatConversationAwaitingState['mode']): string {
  switch (mode) {
    case 'plan':
      return '当前移动端展示计划确认内容，提交动作仍保持在现有消息链路外。';
    case 'approval':
      return '当前移动端仅展示确认请求，提交动作仍保持在现有消息链路外。';
    case 'form':
      return '当前移动端先以只读方式展示待填写信息，不新增专用提交协议。';
    case 'question':
    default:
      return '当前步骤正在等待进一步输入，移动端会保持运行态与消息链路一致。';
  }
}

export const ChatAwaitingResumeBar = memo(function ChatAwaitingResumeBar({
  awaiting,
  visible,
  onPress,
}: ChatAwaitingResumeBarProps) {
  if (!awaiting || !visible) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="打开等待输入"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.resumeBar, pressed && styles.resumeBarPressed]}
    >
      <View style={styles.resumeIcon}>
        <AppIcon usage="awaiting.resume" />
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.resumeTitle}>
        等待输入 · {getModeLabel(awaiting.mode)}
      </Text>
    </Pressable>
  );
});

export const ChatAwaitingOverlay = memo(function ChatAwaitingOverlay({
  awaiting,
  onDismiss,
}: ChatAwaitingOverlayProps) {
  const insets = useSafeAreaInsets();
  const maskOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    maskOpacity.setValue(0);
    sheetTranslateY.setValue(600);

    Animated.parallel([
      Animated.timing(maskOpacity, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        ...SPRING_CONFIG,
        useNativeDriver: true,
      }),
    ]).start();
  }, [awaiting.id, maskOpacity, sheetTranslateY]);

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View style={[styles.mask, { opacity: maskOpacity }]} pointerEvents="box-only">
        <Pressable style={styles.maskPressable} onPress={onDismiss} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 18),
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.handle} />
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderText}>
            <Text allowFontScaling={false} style={styles.panelHeaderTitle}>
              等待输入
            </Text>
            <Text allowFontScaling={false} style={styles.panelHeaderMeta}>
              {getModeLabel(awaiting.mode)} · {formatConversationTimestamp(awaiting.updatedAt)}
            </Text>
          </View>
          <Pressable onPress={onDismiss} style={styles.dismissButton}>
            <Text allowFontScaling={false} style={styles.dismissButtonText}>
              收起
            </Text>
          </Pressable>
        </View>

        <View style={styles.panelContent}>
          <View style={styles.modeBadge}>
            <Text allowFontScaling={false} style={styles.modeBadgeText}>
              {getModeLabel(awaiting.mode)}
            </Text>
          </View>
          <Text allowFontScaling={false} style={styles.promptText}>
            {awaiting.prompt}
          </Text>
          {awaiting.payloadText ? (
            <View style={styles.payloadCard}>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                <Text allowFontScaling={false} selectable style={styles.payloadText}>
                  {awaiting.payloadText}
                </Text>
              </ScrollView>
            </View>
          ) : null}
          <Text allowFontScaling={false} style={styles.hintText}>
            {getModeHint(awaiting.mode)}
          </Text>
          {awaiting.answer ? (
            <View style={styles.answerCard}>
              <Text allowFontScaling={false} style={styles.answerLabel}>
                最近回复
              </Text>
              <Text allowFontScaling={false} style={styles.answerText}>
                {awaiting.answer}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  resumeBar: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: appVisualTokens.spacing.lg,
    marginTop: 0,
    marginBottom: 4,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resumeBarPressed: {
    opacity: 0.72,
  },
  resumeIcon: {
    width: 20,
    height: 20,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeTitle: {
    maxWidth: 180,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlueStrong,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  mask: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appVisualTokens.colors.overlay,
  },
  maskPressable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: appVisualTokens.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: appVisualTokens.colors.lineStrong,
    alignSelf: 'center',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelHeaderText: {
    flex: 1,
    gap: 4,
  },
  panelHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  panelHeaderMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: appVisualTokens.colors.textSecondary,
  },
  dismissButton: {
    borderRadius: 18,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dismissButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlueStrong,
  },
  panelContent: {
    gap: 12,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: appVisualTokens.colors.brandBlueSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: appVisualTokens.colors.brandBlueStrong,
  },
  promptText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 20,
    color: appVisualTokens.colors.textSecondary,
  },
  payloadCard: {
    maxHeight: 180,
    borderRadius: 16,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.lineStrong,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  payloadText: {
    fontSize: 13,
    lineHeight: 19,
    color: appVisualTokens.colors.textPrimary,
  },
  answerCard: {
    borderRadius: 16,
    backgroundColor: appVisualTokens.colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.lineStrong,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: appVisualTokens.colors.textSecondary,
  },
  answerText: {
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textPrimary,
  },
});
