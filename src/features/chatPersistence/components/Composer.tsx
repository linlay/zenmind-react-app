import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { useAppTheme, useAppThemeStyles } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens, type AppThemeTokens } from '../../../shared/visual/foundation';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';
import type { ChatComposerAttachment } from '../types';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';

const COLLAPSED_INPUT_HEIGHT = 30;
const EXPANDED_INPUT_MIN_HEIGHT = 48;
const MAX_HEIGHT = 82;
const VERTICAL_PADDING = 4;
const INPUT_FONT_SIZE = 17;
const INPUT_LINE_HEIGHT = 24;
const INPUT_HORIZONTAL_PADDING = 10;
const COLLAPSED_PLACEHOLDER_TOP = (COLLAPSED_INPUT_HEIGHT - INPUT_LINE_HEIGHT) / 2;
const CONTENT_HEIGHT_STABLE_TOLERANCE = 4;
const COMPOSER_HORIZONTAL_PADDING = 12;
const COMPOSER_VERTICAL_PADDING = 5;
const COMPOSER_COLLAPSED_HEIGHT = 44;
const COMPOSER_TOOLBAR_HEIGHT = 34;
const COMPOSER_COLLAPSED_INPUT_TOP = (COMPOSER_COLLAPSED_HEIGHT - COLLAPSED_INPUT_HEIGHT) / 2;
const COMPOSER_EXPANDED_INPUT_TOP = appVisualTokens.spacing.md;
const COMPOSER_EXPANDED_INPUT_SIDE_INSET = appVisualTokens.spacing.md;
const COMPOSER_EXPANDED_INPUT_GAP = 5;
const COMPOSER_CONTAINER_RADIUS = 22;
const PRIMARY_ACTION_SLOT_WIDTH = 38;
const PRIMARY_ACTION_SLOT_GAP = appVisualTokens.spacing.sm;
const PLAN_COLLAPSED_WIDTH = 34;
const PLAN_EXPANDED_WIDTH = 112;
const COLLAPSED_INPUT_SIDE_GAP = 5;
const COLLAPSED_INPUT_SIDE_TOOL_GUTTER =
  COMPOSER_HORIZONTAL_PADDING + PLAN_COLLAPSED_WIDTH + COLLAPSED_INPUT_SIDE_GAP;
const COMPOSER_ANIMATION_CONFIG = {
  duration: 180,
  easing: Easing.out(Easing.cubic)
};

type ComposerProgressValue = {
  readonly value: number;
};

export type ComposerAttachmentType = 'image' | 'file';

type ComposerProps = {
  value: string;
  attachments: ChatComposerAttachment[];
  onChangeText: (text: string) => void;
  primaryAction: ChatComposerPrimaryAction;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
  onSelectAttachment: (type: ComposerAttachmentType) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRetryAttachment: (attachmentId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  planModeAvailable?: boolean;
  planModeEnabled?: boolean;
  onTogglePlanMode?: () => void;
};

function getPrimaryIconUsage(primaryAction: ChatComposerPrimaryAction): AppIconUsage {
  switch (primaryAction) {
    case 'stop':
      return 'composer.stop';
    case 'resume':
      return 'composer.resume';
    case 'sending':
    default:
      return 'composer.send';
  }
}

function getPrimaryAccessibilityLabel(primaryAction: ChatComposerPrimaryAction, t: TFunction) {
  switch (primaryAction) {
    case 'stop':
      return t('composer.stop');
    case 'resume':
      return t('composer.resume');
    case 'sending':
      return t('composer.sending');
    default:
      return t('composer.send');
  }
}

type ComposerIconButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  iconColor?: string;
  iconUsage: AppIconUsage;
  onPress: () => void;
  strokeWidth?: number;
};

const ComposerIconButton = memo(function ComposerIconButton({
  accessibilityLabel,
  disabled = false,
  iconColor,
  iconUsage,
  onPress,
  strokeWidth
}: ComposerIconButtonProps) {
  const styles = useAppThemeStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.iconButtonDisabled,
        pressed && !disabled && styles.pressed
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.md} color={iconColor} strokeWidth={strokeWidth} />
    </Pressable>
  );
});

type PlanModeButtonProps = {
  expandedProgress: ComposerProgressValue;
  enabled: boolean;
  onPress: () => void;
};

const PlanModeButton = memo(function PlanModeButton({ expandedProgress, enabled, onPress }: PlanModeButtonProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const planButtonStyle = useAnimatedStyle(() => ({
    width: interpolate(
      expandedProgress.value,
      [0, 1],
      [PLAN_COLLAPSED_WIDTH, PLAN_EXPANDED_WIDTH],
      Extrapolation.CLAMP
    )
  }));
  const planLabelStyle = useAnimatedStyle(() => ({
    opacity: expandedProgress.value,
    transform: [
      {
        translateX: interpolate(expandedProgress.value, [0, 1], [-6, 0], Extrapolation.CLAMP)
      }
    ]
  }));

  return (
    <Animated.View style={[styles.planButtonFrame, planButtonStyle]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.planButton,
          enabled && styles.planButtonEnabled,
          pressed && styles.pressed
        ]}
        accessibilityLabel={t('composer.planMode')}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
      >
        <AppIcon
          usage={enabled ? 'composer.planActive' : 'composer.plan'}
          size={appVisualTokens.iconSizes.md}
          color={enabled ? theme.colors.brandBlueAction : theme.colors.textPrimary}
          strokeWidth={2.1}
        />
        <Animated.Text allowFontScaling={false} numberOfLines={1} style={[styles.planButtonText, planLabelStyle]}>
          {t('composer.planMode')}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
});

type PrimaryActionSlotProps = {
  disabled: boolean;
  iconColor?: string;
  iconUsage: AppIconUsage;
  onPress: () => void;
  primaryAction: ChatComposerPrimaryAction;
  progress: ComposerProgressValue;
  translateX: ComposerProgressValue;
  visible: boolean;
};

const PrimaryActionSlot = memo(function PrimaryActionSlot({
  disabled,
  iconColor,
  iconUsage,
  onPress,
  primaryAction,
  progress,
  translateX,
  visible
}: PrimaryActionSlotProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const slotStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [0, PRIMARY_ACTION_SLOT_WIDTH], Extrapolation.CLAMP),
    marginLeft: interpolate(progress.value, [0, 1], [0, PRIMARY_ACTION_SLOT_GAP], Extrapolation.CLAMP),
    opacity: progress.value
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: translateX.value
      }
    ]
  }));

  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.primarySlot, slotStyle]}>
      <Animated.View style={buttonStyle}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [
            styles.primaryButton,
            primaryAction === 'send-disabled' && styles.primaryButtonDisabled,
            primaryAction === 'send' && styles.primaryButtonSend,
            primaryAction === 'sending' && styles.primaryButtonSending,
            primaryAction === 'stop' && styles.primaryButtonStop,
            primaryAction === 'resume' && styles.primaryButtonResume,
            pressed && !disabled && styles.pressed
          ]}
          accessibilityLabel={getPrimaryAccessibilityLabel(primaryAction, t)}
          accessibilityRole="button"
        >
          {primaryAction === 'sending' ? (
            <ActivityIndicator size="small" color={theme.colors.onBrandBlueAction} />
          ) : (
            <AppIcon usage={iconUsage} color={iconColor} />
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
});

export const Composer = memo(function Composer({
  value,
  attachments,
  onChangeText,
  primaryAction,
  onSubmit,
  onStop,
  onResume,
  onSelectAttachment,
  onRemoveAttachment,
  onRetryAttachment,
  disabled = false,
  placeholder,
  planModeAvailable = false,
  planModeEnabled = false,
  onTogglePlanMode
}: ComposerProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const styles = useAppThemeStyles(createStyles);
  const [inputHeight, setInputHeight] = useState(COLLAPSED_INPUT_HEIGHT);
  const [attachmentTrayOpen, setAttachmentTrayOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputHeightRef = useRef(COLLAPSED_INPUT_HEIGHT);
  const hasComposerContent = Boolean(value.trim()) || attachments.length > 0;
  const placeholderText = placeholder ?? t('composer.placeholder');
  const isPlaceholderVisible = value.length === 0;
  const isExpanded = isFocused || hasComposerContent;
  const showPrimaryAction =
    primaryAction === 'stop' ||
    primaryAction === 'resume' ||
    primaryAction === 'sending' ||
    hasComposerContent;
  const primaryDisabled = disabled || primaryAction === 'send-disabled' || primaryAction === 'sending';
  const attachmentDisabled =
    disabled || primaryAction === 'sending' || primaryAction === 'stop' || primaryAction === 'resume';
  const expandedProgress = useDerivedValue(
    () => withTiming(isExpanded ? 1 : 0, COMPOSER_ANIMATION_CONFIG),
    [isExpanded]
  );
  const primaryProgress = useDerivedValue(
    () => withTiming(showPrimaryAction ? 1 : 0, COMPOSER_ANIMATION_CONFIG),
    [showPrimaryAction]
  );
  const primaryTranslateX = useSharedValue(showPrimaryAction ? 0 : 10);
  const expandedInputHeight = Math.max(EXPANDED_INPUT_MIN_HEIGHT, inputHeight);
  const expandedContainerHeight =
    COMPOSER_EXPANDED_INPUT_TOP +
    expandedInputHeight +
    COMPOSER_EXPANDED_INPUT_GAP +
    COMPOSER_TOOLBAR_HEIGHT +
    COMPOSER_VERTICAL_PADDING;
  const containerAnimatedStyle = useAnimatedStyle(() => ({
    minHeight: interpolate(
      expandedProgress.value,
      [0, 1],
      [COMPOSER_COLLAPSED_HEIGHT, expandedContainerHeight],
      Extrapolation.CLAMP
    )
  }), [expandedContainerHeight]);

  const handleContentSizeChange = useCallback((event: { nativeEvent: { contentSize: { height: number } } }) => {
    const contentHeight = Math.round(event.nativeEvent.contentSize.height);
    if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
      return;
    }

    const nextHeight =
      contentHeight <= EXPANDED_INPUT_MIN_HEIGHT + CONTENT_HEIGHT_STABLE_TOLERANCE
        ? COLLAPSED_INPUT_HEIGHT
        : Math.min(MAX_HEIGHT, contentHeight);
    if (nextHeight !== inputHeightRef.current) {
      inputHeightRef.current = nextHeight;
      setInputHeight(nextHeight);
    }
  }, []);

  const handlePrimaryPress = useCallback(() => {
    if (primaryDisabled) {
      return;
    }

    if (primaryAction === 'send') {
      setAttachmentTrayOpen(false);
      Keyboard.dismiss();
      onSubmit();
      return;
    }
    if (primaryAction === 'stop') {
      onStop();
      return;
    }

    if (primaryAction === 'resume') {
      setAttachmentTrayOpen(false);
      Keyboard.dismiss();
      onResume();
    }
  }, [onResume, onStop, onSubmit, primaryAction, primaryDisabled]);

  const handleToggleAttachmentTray = useCallback(() => {
    if (attachmentDisabled) {
      return;
    }
    setAttachmentTrayOpen((value) => !value);
  }, [attachmentDisabled]);

  const handleSelectAttachment = useCallback(
    (type: ComposerAttachmentType) => {
      setAttachmentTrayOpen(false);
      onSelectAttachment(type);
    },
    [onSelectAttachment]
  );
  const handleSelectImageAttachment = useCallback(() => handleSelectAttachment('image'), [handleSelectAttachment]);
  const handleSelectFileAttachment = useCallback(() => handleSelectAttachment('file'), [handleSelectAttachment]);
  const handleInputFocus = useCallback(() => setIsFocused(true), []);
  const handleInputBlur = useCallback(() => setIsFocused(false), []);
  const handleTogglePlanMode = useCallback(() => {
    if (!planModeAvailable) {
      return;
    }
    onTogglePlanMode?.();
  }, [onTogglePlanMode, planModeAvailable]);

  const iconUsage = getPrimaryIconUsage(primaryAction);
  const iconColor = primaryDisabled ? theme.colors.textTertiary : undefined;
  const inputFrameStyle = useAnimatedStyle(
    () => {
      const primaryActionWidth = primaryProgress.value * (PRIMARY_ACTION_SLOT_WIDTH + PRIMARY_ACTION_SLOT_GAP);
      const collapsedLeftGutter = planModeAvailable
        ? COLLAPSED_INPUT_SIDE_TOOL_GUTTER
        : COMPOSER_HORIZONTAL_PADDING;
      const collapsedRightGutter = planModeAvailable
        ? COLLAPSED_INPUT_SIDE_TOOL_GUTTER
        : COMPOSER_HORIZONTAL_PADDING;
      return {
        left: interpolate(
          expandedProgress.value,
          [0, 1],
          [collapsedLeftGutter, COMPOSER_EXPANDED_INPUT_SIDE_INSET],
          Extrapolation.CLAMP
        ),
        right: interpolate(
          expandedProgress.value,
          [0, 1],
          [collapsedRightGutter + primaryActionWidth, COMPOSER_EXPANDED_INPUT_SIDE_INSET],
          Extrapolation.CLAMP
        ),
        top: interpolate(
          expandedProgress.value,
          [0, 1],
          [COMPOSER_COLLAPSED_INPUT_TOP, COMPOSER_EXPANDED_INPUT_TOP],
          Extrapolation.CLAMP
        ),
        height: interpolate(
          expandedProgress.value,
          [0, 1],
          [COLLAPSED_INPUT_HEIGHT, expandedInputHeight],
          Extrapolation.CLAMP
        )
      };
    },
    [expandedInputHeight, planModeAvailable]
  );
  const placeholderStyle = useAnimatedStyle(() => ({
    top: interpolate(
      expandedProgress.value,
      [0, 1],
      [COLLAPSED_PLACEHOLDER_TOP, 0],
      Extrapolation.CLAMP
    )
  }));
  useEffect(() => {
    if (attachmentDisabled) {
      setAttachmentTrayOpen(false);
    }
  }, [attachmentDisabled]);

  useEffect(() => {
    if (showPrimaryAction) {
      primaryTranslateX.value = -8;
      primaryTranslateX.value = withTiming(0, COMPOSER_ANIMATION_CONFIG);
      return;
    }

    primaryTranslateX.value = withTiming(10, COMPOSER_ANIMATION_CONFIG);
  }, [primaryTranslateX, showPrimaryAction]);

  return (
    <View style={styles.root}>
      {attachmentTrayOpen ? (
        <View style={styles.attachmentTray}>
          <Pressable
            onPress={handleSelectImageAttachment}
            disabled={attachmentDisabled}
            style={({ pressed }) => [styles.attachmentOption, pressed && styles.pressed]}
            accessibilityLabel={t('composer.uploadImage')}
            accessibilityRole="button"
          >
            <AppIcon usage="composer.attachImage" />
            <Text allowFontScaling={false} style={styles.attachmentOptionText}>
              {t('composer.image')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSelectFileAttachment}
            disabled={attachmentDisabled}
            style={({ pressed }) => [styles.attachmentOption, pressed && styles.pressed]}
            accessibilityLabel={t('composer.uploadFile')}
            accessibilityRole="button"
          >
            <AppIcon usage="composer.attachFile" />
            <Text allowFontScaling={false} style={styles.attachmentOptionText}>
              {t('composer.file')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ChatAttachmentStrip
        attachments={attachments}
        variant="composer"
        onRemoveAttachment={onRemoveAttachment}
        onRetryAttachment={onRetryAttachment}
      />

      <Animated.View
        style={[
          styles.container,
          containerAnimatedStyle
        ]}
      >
        <Animated.View style={[styles.inputFrame, inputFrameStyle]}>
          <Animated.Text
            pointerEvents="none"
            accessible={false}
            allowFontScaling={false}
            numberOfLines={1}
            style={[
              styles.inputPlaceholder,
              placeholderStyle,
              !isPlaceholderVisible && styles.inputPlaceholderHidden
            ]}
          >
            {placeholderText}
          </Animated.Text>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder=""
            allowFontScaling={false}
            multiline
            maxLength={480}
            style={[styles.input, isExpanded && styles.inputExpanded]}
            textAlignVertical={isExpanded ? 'top' : 'center'}
            onContentSizeChange={handleContentSizeChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            editable={!disabled}
            accessibilityLabel={placeholderText}
          />
        </Animated.View>
        <View pointerEvents="box-none" style={styles.toolbarRow}>
          {planModeAvailable ? (
            <PlanModeButton
              expandedProgress={expandedProgress}
              enabled={planModeEnabled}
              onPress={handleTogglePlanMode}
            />
          ) : null}
          <View pointerEvents="none" style={styles.toolbarSpacer} />
          <ComposerIconButton
            onPress={handleToggleAttachmentTray}
            disabled={attachmentDisabled}
            accessibilityLabel={t('composer.addAttachment')}
            iconUsage="composer.attach"
            iconColor={attachmentDisabled ? theme.colors.textTertiary : theme.colors.textPrimary}
            strokeWidth={2.2}
          />
          <PrimaryActionSlot
            disabled={primaryDisabled}
            iconColor={iconColor}
            iconUsage={iconUsage}
            onPress={handlePrimaryPress}
            primaryAction={primaryAction}
            progress={primaryProgress}
            translateX={primaryTranslateX}
            visible={showPrimaryAction}
          />
        </View>
      </Animated.View>
    </View>
  );
});

function createStyles(theme: AppThemeTokens) {
  return StyleSheet.create({
    root: {
      gap: appVisualTokens.spacing.xs
    },
    attachmentTray: {
      flexDirection: 'row',
      gap: appVisualTokens.spacing.sm,
      paddingHorizontal: appVisualTokens.spacing.xs
    },
    attachmentOption: {
      height: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: appVisualTokens.spacing.xs,
      borderRadius: appVisualTokens.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.line,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: appVisualTokens.spacing.md
    },
    attachmentOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textPrimary
    },
    container: {
      justifyContent: 'flex-end',
      overflow: 'hidden',
      position: 'relative',
      borderRadius: COMPOSER_CONTAINER_RADIUS,
      backgroundColor: theme.isDark ? theme.colors.surfaceMuted : '#f5f5f5',
      paddingHorizontal: COMPOSER_HORIZONTAL_PADDING,
      paddingVertical: COMPOSER_VERTICAL_PADDING
    },
    inputFrame: {
      position: 'absolute',
      overflow: 'hidden'
    },
    input: {
      flex: 1,
      minWidth: 0,
      minHeight: COLLAPSED_INPUT_HEIGHT,
      maxHeight: MAX_HEIGHT,
      paddingHorizontal: INPUT_HORIZONTAL_PADDING,
      paddingVertical: VERTICAL_PADDING,
      fontSize: INPUT_FONT_SIZE,
      lineHeight: INPUT_LINE_HEIGHT,
      color: theme.colors.textPrimary,
      includeFontPadding: false
    },
    inputExpanded: {
      paddingTop: 0
    },
    inputPlaceholder: {
      position: 'absolute',
      left: INPUT_HORIZONTAL_PADDING,
      right: INPUT_HORIZONTAL_PADDING,
      fontSize: INPUT_FONT_SIZE,
      lineHeight: INPUT_LINE_HEIGHT,
      color: theme.colors.textSecondary,
      includeFontPadding: false
    },
    inputPlaceholderHidden: {
      opacity: 0
    },
    toolbarRow: {
      height: COMPOSER_TOOLBAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center'
    },
    toolbarSpacer: {
      flex: 1,
      minWidth: appVisualTokens.spacing.sm
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: appVisualTokens.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.line,
      alignItems: 'center',
      justifyContent: 'center'
    },
    iconButtonDisabled: {
      opacity: 0.54
    },
    planButtonFrame: {
      height: COMPOSER_TOOLBAR_HEIGHT,
      overflow: 'hidden'
    },
    planButton: {
      flex: 1,
      minWidth: 34,
      height: COMPOSER_TOOLBAR_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: appVisualTokens.spacing.xs,
      borderRadius: appVisualTokens.radii.pill,
      paddingHorizontal: 6
    },
    planButtonEnabled: {
      backgroundColor: theme.colors.brandBlueSoft
    },
    planButtonText: {
      flexShrink: 0,
      fontSize: 16,
      lineHeight: 20,
      color: theme.colors.textPrimary
    },
    primarySlot: {
      height: COMPOSER_TOOLBAR_HEIGHT,
      overflow: 'hidden'
    },
    primaryButton: {
      width: 34,
      height: 34,
      borderRadius: appVisualTokens.radii.pill,
      alignItems: 'center',
      justifyContent: 'center'
    },
    primaryButtonDisabled: {
      backgroundColor: theme.colors.backgroundMuted
    },
    primaryButtonSend: {
      backgroundColor: theme.colors.brandBlueAction
    },
    primaryButtonSending: {
      backgroundColor: theme.colors.brandBlueAction
    },
    primaryButtonStop: {
      backgroundColor: theme.colors.danger
    },
    primaryButtonResume: {
      backgroundColor: theme.colors.success
    },
    pressed: {
      opacity: 0.72
    }
  });
}
