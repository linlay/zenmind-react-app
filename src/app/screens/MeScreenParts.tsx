import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';

const ACCOUNT_HEADER_CLASS =
  'mx-app-lg mt-app-md flex-row items-center gap-app-md rounded-app-md border border-app-line bg-app-surface px-app-lg py-app-lg';
const AVATAR_CLASS = 'h-[52px] w-[52px] shrink-0 items-center justify-center rounded-app-pill';
const AVATAR_TEXT_CLASS = 'text-app-title-lg font-semibold';
const ACCOUNT_BODY_CLASS = 'min-w-0 flex-1';
const ACCOUNT_NAME_CLASS = 'text-app-title-sm font-semibold text-app-primary';
const ACCOUNT_STATUS_ROW_CLASS = 'mt-[3px] flex-row items-center gap-[6px]';
const ACCOUNT_STATUS_DOT_CLASS = 'h-[6px] w-[6px] rounded-app-pill';
const ACCOUNT_STATUS_PAIRED_CLASS = 'bg-app-success';
const ACCOUNT_STATUS_DEFAULT_CLASS = 'bg-app-tertiary';
const ACCOUNT_STATUS_TEXT_CLASS = 'text-app-footnote font-medium text-app-secondary';
const ACCOUNT_SUMMARY_CLASS = 'mt-[3px] text-app-caption text-app-tertiary';
const SECTION_CLASS = 'gap-app-sm';
const SECTION_TITLE_CLASS = 'ml-app-xs text-app-footnote font-semibold text-app-secondary';
const SECTION_CARD_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const ROW_CLASS = 'min-h-[58px] flex-row items-center gap-app-md bg-app-surface px-app-lg py-app-sm';
const ROW_PRESSABLE_CLASS = `${ROW_CLASS} active:bg-app-surface-muted`;
const ROW_DIVIDER_CLASS = 'border-t border-app-line';
const ROW_ICON_SLOT_CLASS = 'h-8 w-8 shrink-0 items-center justify-center';
const ROW_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 gap-[2px]';
const ROW_TITLE_CLASS = 'text-app-body font-semibold text-app-primary';
const ROW_DETAIL_CLASS = 'text-app-footnote text-app-secondary';
const ROW_DETAIL_LINK_CLASS = 'text-app-brand-blue';
const ROW_VALUE_CLASS = 'max-w-[132px] shrink text-right text-app-body-sm font-medium text-app-primary';
const ROW_VALUE_LINK_CLASS = 'text-app-brand-blue';
const ROW_VALUE_MUTED_CLASS = 'text-app-secondary';
const STATUS_ACCESSORY_CLASS = 'flex-row items-center gap-[6px]';
const STATUS_DOT_CLASS = 'h-[7px] w-[7px] rounded-app-pill';
const STATUS_DOT_POSITIVE_CLASS = 'bg-app-success';
const STATUS_DOT_NEUTRAL_CLASS = 'bg-app-tertiary';
const STATUS_LABEL_CLASS = 'text-app-footnote font-medium text-app-secondary';
const CHECK_SLOT_CLASS = 'h-[22px] w-[22px] items-center justify-center';
const CHEVRON_RIGHT_CLASS = 'rotate-180';
const DEVICE_NAME_EDITOR_CLASS = 'gap-app-md border-t border-app-line bg-app-surface px-app-lg py-app-lg';
const DEVICE_NAME_INPUT_CLASS =
  'min-h-[44px] rounded-app-sm border border-app-line-strong bg-app-background px-app-md text-app-body text-app-primary';
const DEVICE_NAME_EDITOR_HINT_CLASS = 'text-app-caption leading-5 text-app-tertiary';
const DEVICE_NAME_EDITOR_ERROR_CLASS = 'text-app-caption leading-5 text-app-danger';
const DEVICE_NAME_ACTIONS_CLASS = 'flex-row justify-end gap-app-sm';
const DEVICE_NAME_ACTION_CLASS =
  'min-h-[44px] items-center justify-center rounded-app-sm px-app-lg active:bg-app-surface-muted';
const DEVICE_NAME_SAVE_CLASS = 'bg-app-action active:opacity-[0.86]';
const DEVICE_NAME_SAVE_DISABLED_CLASS = 'opacity-[0.42]';
const DEVICE_NAME_ACTION_TEXT_CLASS = 'text-app-body-sm font-semibold text-app-secondary';
const DEVICE_NAME_SAVE_TEXT_CLASS = 'text-app-body-sm font-semibold text-app-on-action';
const LOGOUT_BUTTON_CLASS =
  'mb-app-lg min-h-[48px] items-center justify-center rounded-app-md border border-app-danger-line bg-app-surface active:bg-app-danger-soft';
const LOGOUT_BUTTON_DISABLED_CLASS = 'opacity-[0.58]';
const LOGOUT_BUTTON_TEXT_CLASS = 'text-app-body-lg font-semibold text-app-danger';

export type MeRowAccessory =
  | { kind: 'status'; label: string; tone: 'positive' | 'neutral' }
  | { kind: 'check' }
  | { kind: 'copy' }
  | { kind: 'chevron' };

export type MeScreenRowModel = {
  key: string;
  title: string;
  detail?: string;
  value?: string;
  valueTone?: 'default' | 'link' | 'muted';
  iconUsage?: AppIconUsage;
  accessory?: MeRowAccessory;
  onPress?: () => void;
};

type MeScreenSectionProps = {
  title: string;
  children: ReactNode;
};

type MeScreenRowProps = Omit<MeScreenRowModel, 'key'> & {
  isFirst?: boolean;
};

type MeAccountHeaderProps = {
  accountName: string;
  avatarLabel: string;
  avatarBackgroundColor: string;
  avatarForegroundColor: string;
  paired: boolean;
  statusLabel: string;
  summary: string;
};

type MeDeviceNameEditorProps = {
  value: string;
  error: string;
  hint: string;
  placeholder: string;
  cancelLabel: string;
  saveLabel: string;
  maxLength: number;
  onChangeText: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

type MeLogoutButtonProps = {
  disabled: boolean;
  title: string;
  onPress: () => void;
};

export const MeAccountHeader = memo(function MeAccountHeader({
  accountName,
  avatarLabel,
  avatarBackgroundColor,
  avatarForegroundColor,
  paired,
  statusLabel,
  summary
}: MeAccountHeaderProps) {
  return (
    <View className={ACCOUNT_HEADER_CLASS}>
      <View className={AVATAR_CLASS} style={{ backgroundColor: avatarBackgroundColor }}>
        <Text className={AVATAR_TEXT_CLASS} style={{ color: avatarForegroundColor }}>
          {avatarLabel}
        </Text>
      </View>
      <View className={ACCOUNT_BODY_CLASS}>
        <Text className={ACCOUNT_NAME_CLASS} numberOfLines={1}>
          {accountName}
        </Text>
        <View className={ACCOUNT_STATUS_ROW_CLASS}>
          <View
            className={cn(
              ACCOUNT_STATUS_DOT_CLASS,
              paired ? ACCOUNT_STATUS_PAIRED_CLASS : ACCOUNT_STATUS_DEFAULT_CLASS
            )}
          />
          <Text className={ACCOUNT_STATUS_TEXT_CLASS} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
        <Text className={ACCOUNT_SUMMARY_CLASS} numberOfLines={2}>
          {summary}
        </Text>
      </View>
    </View>
  );
});

export const MeScreenSection = memo(function MeScreenSection({ title, children }: MeScreenSectionProps) {
  return (
    <View className={SECTION_CLASS}>
      <Text className={SECTION_TITLE_CLASS}>{title}</Text>
      <View className={SECTION_CARD_CLASS}>{children}</View>
    </View>
  );
});

function MeRowAccessoryView({ accessory }: { accessory?: MeRowAccessory }) {
  const { theme } = useAppTheme();

  if (!accessory) {
    return null;
  }

  if (accessory.kind === 'status') {
    return (
      <View className={STATUS_ACCESSORY_CLASS}>
        <View
          className={cn(
            STATUS_DOT_CLASS,
            accessory.tone === 'positive' ? STATUS_DOT_POSITIVE_CLASS : STATUS_DOT_NEUTRAL_CLASS
          )}
        />
        <Text className={STATUS_LABEL_CLASS}>{accessory.label}</Text>
      </View>
    );
  }

  if (accessory.kind === 'check') {
    return (
      <View className={CHECK_SLOT_CLASS}>
        <AppIcon usage="settings.selected" color={theme.colors.success} size={16} />
      </View>
    );
  }

  if (accessory.kind === 'copy') {
    return <AppIcon usage="timeline.copy" color={theme.colors.textSecondary} size={19} />;
  }

  return (
    <View className={CHEVRON_RIGHT_CLASS}>
      <AppIcon usage="chatDetail.back" color={theme.colors.textTertiary} size={19} />
    </View>
  );
}

export const MeScreenRow = memo(function MeScreenRow({
  title,
  detail,
  value,
  valueTone = 'default',
  iconUsage,
  accessory,
  onPress,
  isFirst = false
}: MeScreenRowProps) {
  const { theme } = useAppTheme();
  const rowClass = cn(onPress ? ROW_PRESSABLE_CLASS : ROW_CLASS, !isFirst && ROW_DIVIDER_CLASS);
  const content = (
    <>
      {iconUsage ? (
        <View className={ROW_ICON_SLOT_CLASS}>
          <AppIcon usage={iconUsage} color={theme.colors.textSecondary} size={19} />
        </View>
      ) : null}
      <View className={ROW_TEXT_BLOCK_CLASS}>
        <Text className={ROW_TITLE_CLASS} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text className={cn(ROW_DETAIL_CLASS, valueTone === 'link' && ROW_DETAIL_LINK_CLASS)} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text
          className={cn(
            ROW_VALUE_CLASS,
            valueTone === 'link' && ROW_VALUE_LINK_CLASS,
            valueTone === 'muted' && ROW_VALUE_MUTED_CLASS
          )}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      <MeRowAccessoryView accessory={accessory} />
    </>
  );

  if (!onPress) {
    return <View className={rowClass}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} className={rowClass}>
      {content}
    </Pressable>
  );
});

export const MeDeviceNameEditor = memo(function MeDeviceNameEditor({
  value,
  error,
  hint,
  placeholder,
  cancelLabel,
  saveLabel,
  maxLength,
  onChangeText,
  onCancel,
  onSave
}: MeDeviceNameEditorProps) {
  const { theme } = useAppTheme();
  const saveDisabled = !value.trim();

  return (
    <View className={DEVICE_NAME_EDITOR_CLASS}>
      <TextInput
        autoCapitalize="words"
        autoCorrect={false}
        autoFocus
        maxLength={maxLength}
        onChangeText={onChangeText}
        onSubmitEditing={onSave}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        returnKeyType="done"
        className={DEVICE_NAME_INPUT_CLASS}
        value={value}
      />
      <Text className={error ? DEVICE_NAME_EDITOR_ERROR_CLASS : DEVICE_NAME_EDITOR_HINT_CLASS}>{error || hint}</Text>
      <View className={DEVICE_NAME_ACTIONS_CLASS}>
        <Pressable accessibilityRole="button" onPress={onCancel} className={DEVICE_NAME_ACTION_CLASS}>
          <Text className={DEVICE_NAME_ACTION_TEXT_CLASS}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saveDisabled}
          onPress={onSave}
          className={cn(
            DEVICE_NAME_ACTION_CLASS,
            DEVICE_NAME_SAVE_CLASS,
            saveDisabled && DEVICE_NAME_SAVE_DISABLED_CLASS
          )}
        >
          <Text className={DEVICE_NAME_SAVE_TEXT_CLASS}>{saveLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
});

export const MeLogoutButton = memo(function MeLogoutButton({ disabled, title, onPress }: MeLogoutButtonProps) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={cn(LOGOUT_BUTTON_CLASS, disabled && LOGOUT_BUTTON_DISABLED_CLASS)}
    >
      {disabled ? (
        <ActivityIndicator size="small" color={theme.colors.danger} />
      ) : (
        <Text className={LOGOUT_BUTTON_TEXT_CLASS}>{title}</Text>
      )}
    </Pressable>
  );
});
