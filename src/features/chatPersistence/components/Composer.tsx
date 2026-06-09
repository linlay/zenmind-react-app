import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { appVisualTokens } from '../../../shared/visual/foundation';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';
import type { ChatComposerAttachment } from '../types';
import { ChatAttachmentStrip } from './ChatAttachmentStrip';

const MIN_HEIGHT = 30;
const MAX_HEIGHT = 82;
const VERTICAL_PADDING = 4;

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
  rightAccessory?: ReactNode;
  disabled?: boolean;
  placeholder?: string;
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
  rightAccessory = null,
  disabled = false,
  placeholder
}: ComposerProps) {
  const t = useT();
  const [inputHeight, setInputHeight] = useState(MIN_HEIGHT);
  const [attachmentTrayOpen, setAttachmentTrayOpen] = useState(false);
  const primaryDisabled = disabled || primaryAction === 'send-disabled' || primaryAction === 'sending';
  const attachmentDisabled = disabled || primaryAction === 'stop' || primaryAction === 'sending';

  const handleContentSizeChange = useCallback((event: { nativeEvent: { contentSize: { height: number } } }) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const nextHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, contentHeight + VERTICAL_PADDING * 2));
    setInputHeight(nextHeight);
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

  const iconUsage = getPrimaryIconUsage(primaryAction);
  const iconColor = primaryDisabled ? appVisualTokens.colors.textTertiary : appVisualTokens.colors.surface;

  useEffect(() => {
    if (attachmentDisabled) {
      setAttachmentTrayOpen(false);
    }
  }, [attachmentDisabled]);

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

      <View style={styles.container}>
        <Pressable
          onPress={handleToggleAttachmentTray}
          disabled={attachmentDisabled}
          style={({ pressed }) => [
            styles.iconButton,
            attachmentDisabled && styles.iconButtonDisabled,
            pressed && !attachmentDisabled && styles.pressed
          ]}
          accessibilityLabel={t('composer.addAttachment')}
          accessibilityRole="button"
        >
          <AppIcon
            usage="composer.attach"
            size={appVisualTokens.iconSizes.md}
            color={attachmentDisabled ? appVisualTokens.colors.textTertiary : appVisualTokens.colors.textSecondary}
            strokeWidth={2.2}
          />
        </Pressable>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? t('composer.placeholder')}
          placeholderTextColor={appVisualTokens.colors.textTertiary}
          allowFontScaling={false}
          multiline
          maxLength={480}
          style={[styles.input, { height: inputHeight }]}
          textAlignVertical="center"
          onContentSizeChange={handleContentSizeChange}
          editable={!disabled}
        />

        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}

        <Pressable
          onPress={handlePrimaryPress}
          disabled={primaryDisabled}
          style={({ pressed }) => [
            styles.primaryButton,
            primaryAction === 'send-disabled' && styles.primaryButtonDisabled,
            primaryAction === 'send' && styles.primaryButtonSend,
            primaryAction === 'sending' && styles.primaryButtonSending,
            primaryAction === 'stop' && styles.primaryButtonStop,
            primaryAction === 'resume' && styles.primaryButtonResume,
            pressed && !primaryDisabled && styles.pressed
          ]}
          accessibilityLabel={getPrimaryAccessibilityLabel(primaryAction, t)}
          accessibilityRole="button"
        >
          {primaryAction === 'sending' ? (
            <ActivityIndicator size="small" color={appVisualTokens.colors.surface} />
          ) : (
            <AppIcon usage={iconUsage} color={iconColor} />
          )}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.surface,
    paddingHorizontal: appVisualTokens.spacing.md
  },
  attachmentOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: appVisualTokens.colors.textPrimary
  },
  container: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.sm,
    borderRadius: appVisualTokens.radii.pill,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.surface,
    paddingHorizontal: 5,
    paddingVertical: 5
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    paddingHorizontal: 10,
    paddingVertical: VERTICAL_PADDING,
    fontSize: 15,
    lineHeight: 20,
    color: appVisualTokens.colors.textPrimary,
    includeFontPadding: false
  },
  rightAccessory: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: appVisualTokens.radii.pill,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.line,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconButtonDisabled: {
    backgroundColor: appVisualTokens.colors.backgroundMuted
  },
  primaryButton: {
    width: 34,
    height: 34,
    borderRadius: appVisualTokens.radii.pill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButtonDisabled: {
    backgroundColor: appVisualTokens.colors.backgroundMuted
  },
  primaryButtonSend: {
    backgroundColor: appVisualTokens.colors.brandBlue
  },
  primaryButtonSending: {
    backgroundColor: appVisualTokens.colors.brandBlue
  },
  primaryButtonStop: {
    backgroundColor: appVisualTokens.colors.danger
  },
  primaryButtonResume: {
    backgroundColor: appVisualTokens.colors.success
  },
  pressed: {
    opacity: 0.72
  }
});
