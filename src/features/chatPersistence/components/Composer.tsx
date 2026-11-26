import { forwardRef, memo, type ReactNode, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { AppIcon } from '../../../shared/icons/AppIcon';
import { useT } from '../../../shared/i18n';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import type { ChatComposerPrimaryAction } from '../chatDetailViewModel';
import type { ComposerTextEdit } from '../chatComposerDraft';
import { ComposerTextInput } from './ComposerTextInput';
import type { ComposerTextInputHandle } from './ComposerTextInput.types';

const PRIMARY_BUTTON_CLASS =
  'h-[44px] w-[44px] shrink-0 items-center justify-center rounded-app-pill active:opacity-[0.72]';
export type ComposerAttachmentType = 'image' | 'file';

type ComposerProps = {
  value: string;
  onEdit: (edit: ComposerTextEdit) => void;
  content: ReactNode;
  toolbar: ReactNode;
  primaryAction: ChatComposerPrimaryAction;
  onSubmit: () => void;
  onStop: () => void;
  onResume: () => void;
  inputDisabled?: boolean;
  placeholder?: string;
};

export const Composer = memo(
  forwardRef<ComposerTextInputHandle, ComposerProps>(function Composer(
    {
      value,
      onEdit,
      content,
      toolbar,
      primaryAction,
      onSubmit,
      onStop,
      onResume,
      inputDisabled = false,
      placeholder
    }: ComposerProps,
    ref
  ) {
    const t = useT();
    const { theme } = useAppTheme();
    const { fontScale } = useWindowDimensions();
    const inputRef = useRef<ComposerTextInputHandle>(null);
    useImperativeHandle(
      ref,
      () => ({ focus: () => inputRef.current?.focus(), blur: () => inputRef.current?.blur() }),
      []
    );
    const [contentHeight, setContentHeight] = useState(0);
    const minHeight = 44 * fontScale + 16;
    const maxHeight = 132 * fontScale + 16;
    const height = Math.max(minHeight, Math.min(maxHeight, value ? contentHeight : minHeight));
    const disabled = primaryAction === 'send-disabled' || primaryAction === 'sending';
    const placeholderText = placeholder ?? t('composer.placeholder');
    const label =
      primaryAction === 'stop'
        ? t('composer.stop')
        : primaryAction === 'resume'
          ? t('composer.resume')
          : primaryAction === 'sending'
            ? t('composer.sending')
            : t('composer.send');
    const handlePrimaryPress = () => {
      if (disabled) return;
      if (primaryAction === 'stop') onStop();
      else if (primaryAction === 'resume') onResume();
      else {
        onSubmit();
        inputRef.current?.focus();
      }
    };
    return (
      <View
        className="gap-app-xs rounded-app-xl border border-app-line bg-app-surface-muted p-app-sm"
        onTouchStart={(event) => event.stopPropagation()}
      >
        {content}
        <View className="min-w-0 px-app-sm">
          <ComposerTextInput
            ref={inputRef}
            value={value}
            onEdit={onEdit}
            editable={!inputDisabled}
            placeholder={placeholderText}
            placeholderTextColor={theme.colors.textSecondary}
            textColor={theme.colors.textPrimary}
            fontScale={fontScale}
            scrollEnabled={contentHeight >= maxHeight}
            onContentHeight={setContentHeight}
            height={height}
          />
        </View>
        <View className="flex-row items-center gap-app-xs">
          {toolbar}
          <Pressable
            onPress={handlePrimaryPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled, busy: primaryAction === 'sending' }}
            className={cn(
              PRIMARY_BUTTON_CLASS,
              disabled ? 'bg-app-background-muted' : primaryAction === 'stop' ? 'bg-app-danger' : 'bg-app-action'
            )}
          >
            {primaryAction === 'sending' ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : (
              <AppIcon
                usage={
                  primaryAction === 'stop'
                    ? 'composer.stop'
                    : primaryAction === 'resume'
                      ? 'composer.resume'
                      : 'composer.send'
                }
                size={22}
                color={disabled ? theme.colors.textTertiary : theme.colors.onBrandBlueAction}
              />
            )}
          </Pressable>
        </View>
      </View>
    );
  })
);
