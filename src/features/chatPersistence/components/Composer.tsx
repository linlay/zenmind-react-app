import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text, TextInput, View, type TextStyle } from 'react-native';
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
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { appVisualTokens } from '../../../shared/visual/foundation';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';
import type { ChatComposerAttachment } from '../types';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';

const COLLAPSED_INPUT_HEIGHT = 30;
const EXPANDED_INPUT_MIN_HEIGHT = 48;
const MAX_HEIGHT = 82;
const INPUT_LINE_HEIGHT = 22;
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
const ROOT_CLASS = 'gap-app-xs';
const ATTACHMENT_TRAY_CLASS = 'flex-row gap-app-sm px-app-xs';
const ATTACHMENT_OPTION_CLASS =
  'h-[34px] flex-row items-center gap-app-xs rounded-app-pill border border-app-line bg-app-surface px-app-md active:opacity-[0.72]';
const ATTACHMENT_OPTION_TEXT_CLASS = 'text-[13px] font-semibold text-app-primary';
const CONTAINER_CLASS =
  'relative justify-end overflow-hidden rounded-[22px] bg-[#f5f5f5] px-[12px] py-[5px] dark:bg-app-surface-muted';
const INPUT_FRAME_CLASS = 'absolute overflow-hidden';
const INPUT_CLASS =
  'min-h-[30px] min-w-0 flex-1 max-h-[82px] px-[10px] py-1 text-[15px] leading-[22px] text-app-primary';
const INPUT_EXPANDED_CLASS = 'pt-0';
const INPUT_PLACEHOLDER_CLASS =
  'absolute left-[10px] right-[10px] text-[15px] leading-[22px] text-app-secondary';
const INPUT_PLACEHOLDER_HIDDEN_CLASS = 'opacity-0';
const TOOLBAR_ROW_CLASS = 'h-[34px] flex-row items-center';
const TOOLBAR_SPACER_CLASS = 'min-w-app-sm flex-1';
const ICON_BUTTON_CLASS =
  'h-[34px] w-[34px] items-center justify-center rounded-app-pill border border-app-line active:opacity-[0.72]';
const ICON_BUTTON_DISABLED_CLASS = 'opacity-[0.54]';
const PLAN_BUTTON_FRAME_CLASS = 'h-[34px] overflow-hidden';
const PLAN_BUTTON_CLASS =
  'h-[34px] min-w-[34px] flex-1 flex-row items-center justify-start gap-app-xs rounded-app-pill px-[6px] active:opacity-[0.72]';
const PLAN_BUTTON_ENABLED_CLASS = 'bg-app-brand-blue-soft';
const PLAN_BUTTON_TEXT_CLASS = 'shrink-0 text-[16px] leading-5 text-app-primary';
const PRIMARY_SLOT_CLASS = 'h-[34px] overflow-hidden';
const PRIMARY_BUTTON_CLASS = 'h-[34px] w-[34px] items-center justify-center rounded-app-pill active:opacity-[0.72]';
const PRIMARY_BUTTON_DISABLED_CLASS = 'bg-app-background-muted';
const PRIMARY_BUTTON_SEND_CLASS = 'bg-app-action';
const PRIMARY_BUTTON_SENDING_CLASS = 'bg-app-action';
const PRIMARY_BUTTON_STOP_CLASS = 'bg-app-danger';
const PRIMARY_BUTTON_RESUME_CLASS = 'bg-app-success';
const INPUT_INCLUDE_FONT_PADDING_STYLE = { includeFontPadding: false } satisfies TextStyle;

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
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(ICON_BUTTON_CLASS, disabled ? ICON_BUTTON_DISABLED_CLASS : null)}
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
    <Animated.View className={PLAN_BUTTON_FRAME_CLASS} style={planButtonStyle}>
      <Pressable
        onPress={onPress}
        className={cn(PLAN_BUTTON_CLASS, enabled ? PLAN_BUTTON_ENABLED_CLASS : null)}
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
        <Animated.Text
          allowFontScaling={false}
          numberOfLines={1}
          className={PLAN_BUTTON_TEXT_CLASS}
          style={planLabelStyle}
        >
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
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} className={PRIMARY_SLOT_CLASS} style={slotStyle}>
      <Animated.View style={buttonStyle}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          className={cn(
            PRIMARY_BUTTON_CLASS,
            primaryAction === 'send-disabled' ? PRIMARY_BUTTON_DISABLED_CLASS : null,
            primaryAction === 'send' ? PRIMARY_BUTTON_SEND_CLASS : null,
            primaryAction === 'sending' ? PRIMARY_BUTTON_SENDING_CLASS : null,
            primaryAction === 'stop' ? PRIMARY_BUTTON_STOP_CLASS : null,
            primaryAction === 'resume' ? PRIMARY_BUTTON_RESUME_CLASS : null
          )}
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
    <View className={ROOT_CLASS}>
      {attachmentTrayOpen ? (
        <View className={ATTACHMENT_TRAY_CLASS}>
          <Pressable
            onPress={handleSelectImageAttachment}
            disabled={attachmentDisabled}
            className={ATTACHMENT_OPTION_CLASS}
            accessibilityLabel={t('composer.uploadImage')}
            accessibilityRole="button"
          >
            <AppIcon usage="composer.attachImage" />
            <Text allowFontScaling={false} className={ATTACHMENT_OPTION_TEXT_CLASS}>
              {t('composer.image')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSelectFileAttachment}
            disabled={attachmentDisabled}
            className={ATTACHMENT_OPTION_CLASS}
            accessibilityLabel={t('composer.uploadFile')}
            accessibilityRole="button"
          >
            <AppIcon usage="composer.attachFile" />
            <Text allowFontScaling={false} className={ATTACHMENT_OPTION_TEXT_CLASS}>
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
        className={CONTAINER_CLASS}
        style={containerAnimatedStyle}
      >
        <Animated.View className={INPUT_FRAME_CLASS} style={inputFrameStyle}>
          <Animated.Text
            pointerEvents="none"
            accessible={false}
            allowFontScaling={false}
            numberOfLines={1}
            className={cn(INPUT_PLACEHOLDER_CLASS, !isPlaceholderVisible ? INPUT_PLACEHOLDER_HIDDEN_CLASS : null)}
            style={[INPUT_INCLUDE_FONT_PADDING_STYLE, placeholderStyle]}
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
            className={cn(INPUT_CLASS, isExpanded ? INPUT_EXPANDED_CLASS : null)}
            style={INPUT_INCLUDE_FONT_PADDING_STYLE}
            textAlignVertical={isExpanded ? 'top' : 'center'}
            onContentSizeChange={handleContentSizeChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            editable={!disabled}
            accessibilityLabel={placeholderText}
          />
        </Animated.View>
        <View pointerEvents="box-none" className={TOOLBAR_ROW_CLASS}>
          {planModeAvailable ? (
            <PlanModeButton
              expandedProgress={expandedProgress}
              enabled={planModeEnabled}
              onPress={handleTogglePlanMode}
            />
          ) : null}
          <View pointerEvents="none" className={TOOLBAR_SPACER_CLASS} />
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
