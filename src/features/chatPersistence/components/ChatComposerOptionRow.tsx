import type { ChatSkillsCatalog } from '../../../core/api/services/chatSkillsProtocol';
import { ChatComposerSkillsMenu } from './ChatComposerSkillsMenu';
import { ChatComposerSheet } from './ChatComposerSheet';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import type {
  ModelOptionItem,
  ModelOptionReasoningEffort,
  ModelOptionServiceTier,
  ModelOptionsSnapshot,
  QueryAccessLevel,
  QueryModelOverride
} from '../../../core/api/services/modelOptionsProtocol';
import { AppIcon, type AppIconUsage } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { cn } from '../../../shared/visual/className';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { appVisualTokens } from '../../../shared/visual/foundation';

type ChatComposerOptionRowProps = {
  localFilesAllowed?: boolean;
  onSelectAttachment?: (type: 'image' | 'file') => void;
  onOpenChatReferences?: () => void;
  onOpenKbaseReferences?: () => void;
  planModeAvailable?: boolean;
  planModeEnabled?: boolean;
  editingModeAvailable?: boolean;
  editingModeEnabled?: boolean;
  queryModeDisabled?: boolean;
  onTogglePlanMode?: () => void;
  onToggleEditingMode?: () => void;

  skillsEnabled: boolean;
  skillsDisabled: boolean;
  skillsCatalog: ChatSkillsCatalog | null;
  selectedSkills: readonly string[];
  skillsLoading: boolean;
  skillsError: string;
  onLoadSkills: () => void;
  onToggleSkills: (ids: readonly string[]) => void;
  modelEnabled?: boolean;
  accessLevelEnabled?: boolean;
  runtimeAccess?: { runId: string; level?: QueryAccessLevel; phase?: 'sending' | 'unknown' } | null;
  onRuntimeAccessChange?: (level: QueryAccessLevel) => void;
  onRuntimeAccessRefresh?: () => void;
  accessLevel: QueryAccessLevel;
  agentKey: string;
  disabled?: boolean;
  modelDisabled: boolean;
  modelOptionsError: string;
  onRefreshModels: () => void;
  modelOptionsLoading: boolean;
  modelOptionsSnapshot: ModelOptionsSnapshot | null;
  modelOverride: QueryModelOverride;
  onAccessLevelChange: (value: QueryAccessLevel) => void;
  onModelOverrideChange: (value: QueryModelOverride) => Promise<boolean>;
};

type OptionMenu = 'content' | 'access' | 'model' | 'skills';

type ModelMenuView = 'settings' | 'models';

type OptionChipProps = {
  active?: boolean;
  disabled?: boolean;
  iconUsage: AppIconUsage;
  label: string;
  onPress: () => void;
};

type MenuChoiceRowProps = {
  checked?: boolean;
  compact?: boolean;
  disabled?: boolean;
  iconUsage?: AppIconUsage;
  description?: string;
  label: string;
  onSelect: (key: string) => void;
  selectKey: string;
};

type MenuNavigationRowProps = {
  disabled?: boolean;
  iconUsage?: AppIconUsage;
  description?: string;
  label: string;
  onPress: () => void;
};

type MenuScrollViewProps = {
  children: ReactNode;
};

const ROOT_CLASS = 'relative z-[20] min-w-0 flex-1 flex-row items-center';
const ROOT_ACTIVE_CLASS = 'z-[30]';
const CHIP_CLASS =
  'min-h-[44px] min-w-0 shrink flex-row items-center justify-center gap-app-xs rounded-app-md px-app-xs active:opacity-[0.72]';
const CHIP_ACTIVE_CLASS = 'border-app-brand-blue bg-app-brand-blue-soft';
const CHIP_DISABLED_CLASS = 'opacity-[0.58]';
const CHIP_LABEL_CLASS = 'min-w-0 shrink text-[13px] leading-5 text-app-secondary';
const MENU_CONTENT_CLASS = 'gap-app-lg px-app-lg pb-app-lg';
const MENU_SCROLL_CLASS = 'shrink';
const MENU_HEADER_CLASS = 'min-h-[64px] flex-row items-center gap-app-xs px-app-lg';
const MENU_HEADER_TITLE_CLASS = 'min-w-0 flex-1 text-[18px] font-semibold leading-6 text-app-primary';
const MENU_SECTION_CLASS = 'gap-app-sm';
const MENU_SECTION_TITLE_CLASS = 'text-[12px] font-medium leading-[18px] text-app-secondary';
const MENU_CHOICE_ROW_CLASS =
  'min-h-[64px] flex-row items-center gap-app-sm rounded-app-md border px-app-md py-app-sm active:bg-app-surface-muted';
const MENU_CHOICE_CHECKED_CLASS = 'border-app-brand-blue bg-app-brand-blue-soft';
const MENU_CHOICE_DISABLED_CLASS = 'opacity-[0.48]';
const MENU_CHOICE_ICON_CLASS = 'h-[32px] w-[32px] items-center justify-center';
const MENU_CHOICE_TEXT_CLASS = 'min-w-0 flex-1';
const MENU_CHOICE_LABEL_CLASS = 'text-[15px] font-medium leading-[22px] text-app-primary';
const MENU_CHOICE_DESCRIPTION_CLASS = 'mt-[2px] text-[12px] leading-[18px] text-app-secondary';
const EMPTY_TEXT_CLASS = 'text-[13px] leading-[20px] text-app-secondary';
const SEGMENT_ROW_CLASS = 'flex-row flex-wrap gap-app-sm';
const SEGMENT_CLASS =
  'min-h-[44px] min-w-[56px] grow items-center justify-center rounded-app-md border px-app-sm py-app-sm active:opacity-[0.72]';

const ACCESS_LEVELS: QueryAccessLevel[] = ['default', 'auto_approve', 'full_access'];
const EMPTY_MODELS: readonly ModelOptionItem[] = [];
const EMPTY_REASONING_EFFORTS: ModelOptionsSnapshot['reasoningEfforts'] = [];
const EMPTY_SERVICE_TIERS: ModelOptionsSnapshot['serviceTiers'] = [];

const ACCESS_ICON_USAGE: Record<QueryAccessLevel, AppIconUsage> = {
  default: 'composer.accessDefault',
  auto_approve: 'composer.accessAutoApprove',
  full_access: 'composer.accessFullAccess'
};

function getReasoningLabel(value: ModelOptionReasoningEffort | undefined, t: TFunction): string {
  if (!value) {
    return '';
  }
  return t(`composer.query.reasoning.${value}`);
}

function getServiceTierLabel(value: ModelOptionServiceTier | undefined, t: TFunction): string {
  if (!value || value === 'STANDARD') {
    return '';
  }
  if (value === 'FAST' || value === 'FLEX') {
    return t(`composer.query.serviceTier.${value}`);
  }
  return value;
}

function getAccessDescription(value: QueryAccessLevel, t: TFunction): string {
  return t(`composer.query.access.${value}.description`);
}

function getModelDescription(model: ModelOptionItem): string {
  const fallbackId = model.modelId && model.modelId !== model.key ? model.modelId : model.key;
  return [model.provider, fallbackId].filter(Boolean).join(' · ');
}

function getServiceTierOptionLabel(option: { key: ModelOptionServiceTier; label: string }, t: TFunction): string {
  return option.key === 'STANDARD'
    ? t('composer.query.serviceTier.STANDARD')
    : getServiceTierLabel(option.key, t) || option.label;
}

function findModel(models: readonly ModelOptionItem[], key: string): ModelOptionItem | null {
  return models.find((model) => model.key === key) || null;
}

function supportsServiceTier(model: ModelOptionItem | null, tier: ModelOptionServiceTier): boolean {
  if (tier === 'STANDARD') {
    return true;
  }
  return Boolean(model?.serviceTiers.includes(tier));
}

function buildModelOverride(current: QueryModelOverride, patch: QueryModelOverride): QueryModelOverride {
  return { ...current, ...patch };
}

const OptionChip = memo(function OptionChip({
  active = false,
  disabled = false,
  iconUsage,
  label,
  onPress
}: OptionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(CHIP_CLASS, active ? CHIP_ACTIVE_CLASS : null, disabled ? CHIP_DISABLED_CLASS : null)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, expanded: active }}
    >
      <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.sm} />
      <Text numberOfLines={1} className={CHIP_LABEL_CLASS}>
        {label}
      </Text>
      <AppIcon usage="composer.optionExpand" size={16} />
    </Pressable>
  );
});

const MenuChoiceRow = memo(function MenuChoiceRow({
  checked = false,
  compact = false,
  disabled = false,
  iconUsage,
  description,
  label,
  onSelect,
  selectKey
}: MenuChoiceRowProps) {
  const handlePress = useCallback(() => onSelect(selectKey), [onSelect, selectKey]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      className={cn(
        compact ? SEGMENT_CLASS : MENU_CHOICE_ROW_CLASS,
        checked
          ? MENU_CHOICE_CHECKED_CLASS
          : compact
            ? 'border-app-line bg-app-background-muted'
            : 'border-transparent',
        disabled ? MENU_CHOICE_DISABLED_CLASS : null
      )}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ disabled, checked }}
    >
      {iconUsage && !compact ? (
        <View className={MENU_CHOICE_ICON_CLASS}>
          <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.sm} />
        </View>
      ) : null}
      <View className={compact ? undefined : MENU_CHOICE_TEXT_CLASS}>
        <Text
          className={checked ? 'text-[15px] font-semibold leading-[22px] text-app-brand-blue' : MENU_CHOICE_LABEL_CLASS}
        >
          {label}
        </Text>
        {description ? <Text className={MENU_CHOICE_DESCRIPTION_CLASS}>{description}</Text> : null}
      </View>
      {checked && !compact ? <AppIcon usage="composer.optionSelected" size={20} /> : null}
    </Pressable>
  );
});

const MenuNavigationRow = memo(function MenuNavigationRow({
  disabled = false,
  iconUsage,
  description,
  label,
  onPress
}: MenuNavigationRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn(MENU_CHOICE_ROW_CLASS, 'border-transparent', disabled ? MENU_CHOICE_DISABLED_CLASS : null)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      {iconUsage ? (
        <View className={MENU_CHOICE_ICON_CLASS}>
          <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.sm} />
        </View>
      ) : null}
      <View className={MENU_CHOICE_TEXT_CLASS}>
        <Text className={MENU_CHOICE_LABEL_CLASS}>{label}</Text>
        {description ? <Text className={MENU_CHOICE_DESCRIPTION_CLASS}>{description}</Text> : null}
      </View>
      <AppIcon usage="composer.optionNavigate" size={18} />
    </Pressable>
  );
});

function MenuToggleRow({
  label,
  value,
  disabled,
  onPress
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useAppTheme();
  return (
    <View
      className={cn(
        'min-h-[56px] flex-row items-center justify-between gap-app-md px-app-md',
        disabled && MENU_CHOICE_DISABLED_CLASS
      )}
    >
      <Text className={MENU_CHOICE_LABEL_CLASS}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onPress}
        trackColor={{ false: theme.colors.lineStrong, true: theme.colors.brandBlueAction }}
        thumbColor={theme.colors.onBrandBlueAction}
      />
    </View>
  );
}

function MenuContentTile({ iconUsage, label, disabled, onPress }: MenuNavigationRowProps) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'w-1/3 items-center gap-app-sm rounded-app-md px-app-xs py-app-md active:bg-app-surface-muted',
        disabled && MENU_CHOICE_DISABLED_CLASS
      )}
    >
      <View className="h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-app-background-muted">
        {iconUsage ? <AppIcon usage={iconUsage} size={24} color={theme.colors.textPrimary} /> : null}
      </View>
      <Text className="text-center text-[13px] leading-[20px] text-app-primary">{label}</Text>
    </Pressable>
  );
}

function MenuScrollView({ children }: MenuScrollViewProps) {
  return (
    <ScrollView
      bounces={false}
      className={MENU_SCROLL_CLASS}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerClassName={MENU_CONTENT_CLASS}
    >
      {children}
    </ScrollView>
  );
}

export const ChatComposerOptionRow = memo(function ChatComposerOptionRow({
  localFilesAllowed,
  onSelectAttachment,
  onOpenChatReferences,
  onOpenKbaseReferences,
  planModeAvailable,
  planModeEnabled,
  editingModeAvailable,
  editingModeEnabled,
  queryModeDisabled,
  onTogglePlanMode,
  onToggleEditingMode,
  skillsEnabled,
  skillsDisabled,
  skillsCatalog,
  selectedSkills,
  skillsLoading,
  skillsError,
  onLoadSkills,
  onToggleSkills,
  modelEnabled = true,
  accessLevelEnabled = true,
  accessLevel,
  runtimeAccess,
  onRuntimeAccessChange,
  onRuntimeAccessRefresh,
  agentKey,
  disabled = false,
  modelDisabled,
  modelOptionsError,
  onRefreshModels,
  modelOptionsLoading,
  modelOptionsSnapshot,
  modelOverride,
  onAccessLevelChange,
  onModelOverrideChange
}: ChatComposerOptionRowProps) {
  const t = useT();
  const keyboardVisibleRef = useRef(Keyboard.isVisible());
  const keyboardSettleFrameRef = useRef<number | null>(null);
  const pendingMenuRef = useRef<OptionMenu | null>(null);
  const afterMenuDismissRef = useRef<(() => void) | null>(null);
  const [activeMenu, setActiveMenu] = useState<OptionMenu | null>(null);
  const activeMenuRef = useRef(activeMenu);
  activeMenuRef.current = activeMenu;
  const [modelDraft, setModelDraft] = useState<QueryModelOverride>(modelOverride);
  const [applyingModel, setApplyingModel] = useState(false);
  const [modelMenuView, setModelMenuView] = useState<ModelMenuView>('settings');
  const models = modelOptionsSnapshot?.models || EMPTY_MODELS;
  const reasoningEfforts = modelOptionsSnapshot?.reasoningEfforts || EMPTY_REASONING_EFFORTS;
  const serviceTiers = modelOptionsSnapshot?.serviceTiers || EMPTY_SERVICE_TIERS;
  const selectedModelKey = (activeMenu === 'model' ? modelDraft : modelOverride).key || '';
  const selectedModel = findModel(models, selectedModelKey);
  const selectedReasoning = (activeMenu === 'model' ? modelDraft : modelOverride).reasoningEffort;
  const selectedServiceTier = (activeMenu === 'model' ? modelDraft : modelOverride).serviceTier || 'STANDARD';
  const modelChipLabel = useMemo(() => {
    if (!agentKey) {
      return t('composer.query.model.unavailable');
    }
    if (!selectedModelKey && modelOptionsLoading) {
      return t('composer.query.model.loading');
    }
    if (!selectedModelKey && models.length === 0) {
      return t('composer.query.model.empty');
    }
    return findModel(models, modelOverride.key || '')?.name || modelOverride.key || t('composer.query.model.title');
  }, [agentKey, modelOptionsLoading, models, modelOverride.key, selectedModelKey, t]);
  const modelChipDisabled = !modelEnabled || disabled || modelDisabled || !agentKey;
  const openMenu = useCallback((menu: OptionMenu) => {
    afterMenuDismissRef.current = null;
    setActiveMenu(menu);
  }, []);
  const handleMenuDismissed = useCallback(() => {
    const action = afterMenuDismissRef.current;
    afterMenuDismissRef.current = null;
    action?.();
  }, []);
  const cancelKeyboardSettleFrame = useCallback(() => {
    if (keyboardSettleFrameRef.current === null) {
      return;
    }
    cancelAnimationFrame(keyboardSettleFrameRef.current);
    keyboardSettleFrameRef.current = null;
  }, []);
  const openMenuAfterKeyboardSettled = useCallback(
    (menu: OptionMenu) => {
      cancelKeyboardSettleFrame();
      keyboardSettleFrameRef.current = requestAnimationFrame(() => {
        keyboardSettleFrameRef.current = requestAnimationFrame(() => {
          keyboardSettleFrameRef.current = null;
          openMenu(menu);
        });
      });
    },
    [cancelKeyboardSettleFrame, openMenu]
  );
  const toggleMenu = useCallback(
    (menu: OptionMenu) => {
      if (activeMenu === menu) {
        if (menu === 'skills') Keyboard.dismiss();
        pendingMenuRef.current = null;
        setModelMenuView('settings');
        setActiveMenu(null);
        return;
      }
      if (keyboardVisibleRef.current) {
        pendingMenuRef.current = menu;
        setModelMenuView('settings');
        setActiveMenu(null);
        Keyboard.dismiss();
        return;
      }
      setModelMenuView('settings');
      openMenu(menu);
    },
    [activeMenu, openMenu]
  );
  const handleDismissMenu = useCallback(() => {
    if (applyingModel) return;
    if (activeMenuRef.current === 'skills') Keyboard.dismiss();
    pendingMenuRef.current = null;
    setModelMenuView('settings');
    setActiveMenu(null);
  }, [applyingModel]);
  const handleSkillsChipPress = useCallback(() => {
    if (skillsDisabled || !skillsEnabled) return;
    if (activeMenu !== 'skills') onLoadSkills();
    toggleMenu('skills');
  }, [activeMenu, onLoadSkills, skillsDisabled, skillsEnabled, toggleMenu]);
  useEffect(() => {
    if (activeMenu === 'skills' && (disabled || !skillsEnabled)) handleDismissMenu();
  }, [activeMenu, handleDismissMenu, disabled, skillsEnabled]);
  useEffect(() => {
    if (activeMenuRef.current === 'skills') handleDismissMenu();
  }, [agentKey, handleDismissMenu]);
  const handleRuntimeAccessSelect = useCallback(
    (key: string) => {
      const level = ACCESS_LEVELS.find((value) => value === key);
      if (!level || runtimeAccess?.phase) return;
      onRuntimeAccessChange?.(level);
      setActiveMenu(null);
    },
    [onRuntimeAccessChange, runtimeAccess?.phase]
  );
  const handleAccessChipPress = useCallback(() => toggleMenu('access'), [toggleMenu]);
  const handleModelChipPress = useCallback(() => {
    if (!modelChipDisabled) {
      setModelDraft({ ...modelOverride });
      toggleMenu('model');
    }
  }, [modelChipDisabled, modelOverride, toggleMenu]);
  const handleOpenModelList = useCallback(() => setModelMenuView('models'), []);
  const handleBackToModelSettings = useCallback(() => setModelMenuView('settings'), []);
  const handleAccessSelect = useCallback(
    (key: string) => {
      const nextAccessLevel = ACCESS_LEVELS.find((value) => value === key);
      if (!nextAccessLevel) {
        return;
      }
      onAccessLevelChange(nextAccessLevel);
      setActiveMenu(null);
    },
    [onAccessLevelChange]
  );
  const handleModelSelect = useCallback(
    (key: string) => {
      const model = models.find((item) => item.key === key);
      if (!model) {
        return;
      }

      setModelDraft((current) => buildModelOverride(current, { key: model.key }));
      setModelMenuView('settings');
    },
    [models]
  );
  const handleReasoningSelect = useCallback(
    (key: string) => {
      const option = reasoningEfforts.find((item) => item.key === key);
      if (!option) {
        return;
      }
      setModelDraft((current) => buildModelOverride(current, { reasoningEffort: option.key }));
    },
    [reasoningEfforts]
  );
  const handleServiceTierSelect = useCallback(
    (key: string) => {
      const option = serviceTiers.find((item) => item.key === key);
      if (!option) {
        return;
      }
      setModelDraft((current) => buildModelOverride(current, { serviceTier: option.key }));
    },
    [serviceTiers]
  );
  useEffect(() => {
    if (
      disabled ||
      (activeMenu === 'model' && (!modelEnabled || (modelDisabled && !applyingModel))) ||
      (activeMenu === 'access' && !accessLevelEnabled && !planModeAvailable && !editingModeAvailable)
    ) {
      pendingMenuRef.current = null;
      setActiveMenu(null);
    }
  }, [
    disabled,
    activeMenu,
    modelEnabled,
    modelDisabled,
    applyingModel,
    accessLevelEnabled,
    planModeAvailable,
    editingModeAvailable
  ]);
  useEffect(() => {
    afterMenuDismissRef.current = null;
    pendingMenuRef.current = null;
    setActiveMenu(null);
  }, [agentKey]);

  const isModelListMenu = activeMenu === 'model' && modelMenuView === 'models';

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
      if (activeMenuRef.current === 'skills') return;
      pendingMenuRef.current = null;
      cancelKeyboardSettleFrame();
      setModelMenuView('settings');
      setActiveMenu(null);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      const pendingMenu = pendingMenuRef.current;
      pendingMenuRef.current = null;
      if (pendingMenu) {
        openMenuAfterKeyboardSettled(pendingMenu);
      }
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      cancelKeyboardSettleFrame();
      pendingMenuRef.current = null;
    };
  }, [cancelKeyboardSettleFrame, openMenuAfterKeyboardSettled]);

  return (
    <View className={cn(ROOT_CLASS, activeMenu ? ROOT_ACTIVE_CLASS : null)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('composer.addContent')}
        disabled={disabled || !(localFilesAllowed || skillsEnabled || onOpenChatReferences || onOpenKbaseReferences)}
        onPress={() => toggleMenu('content')}
        className="h-[44px] w-[44px] shrink-0 items-center justify-center rounded-app-pill active:opacity-[0.72]"
      >
        <AppIcon usage="composer.attach" />
      </Pressable>
      {accessLevelEnabled || planModeAvailable || editingModeAvailable ? (
        <OptionChip
          active={activeMenu === 'access' || planModeEnabled || editingModeEnabled}
          disabled={disabled}
          iconUsage="composer.plan"
          label={
            [planModeEnabled ? t('composer.planSummary') : '', editingModeEnabled ? t('composer.editSummary') : '']
              .filter(Boolean)
              .join(' · ') || t('composer.executionSettings')
          }
          onPress={handleAccessChipPress}
        />
      ) : null}
      {modelEnabled ? (
        <OptionChip
          active={activeMenu === 'model'}
          disabled={modelChipDisabled}
          iconUsage="composer.model"
          label={modelChipLabel}
          onPress={handleModelChipPress}
        />
      ) : null}

      <ChatComposerSheet
        visible={activeMenu !== null}
        closeLabel={t('composer.query.closeOptions')}
        onClose={handleDismissMenu}
        onDismiss={handleMenuDismissed}
      >
        <View className={MENU_HEADER_CLASS}>
          {isModelListMenu || activeMenu === 'skills' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(isModelListMenu ? 'composer.query.model.back' : 'composer.addContent')}
              onPress={
                isModelListMenu
                  ? handleBackToModelSettings
                  : () => {
                      Keyboard.dismiss();
                      setActiveMenu('content');
                    }
              }
              className="h-[44px] w-[36px] items-center justify-center rounded-app-pill active:bg-app-surface-muted"
            >
              <AppIcon usage="composer.optionBack" size={22} />
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" className={MENU_HEADER_TITLE_CLASS}>
            {t(
              activeMenu === 'content'
                ? 'composer.addContent'
                : activeMenu === 'access'
                  ? 'composer.executionSettings'
                  : activeMenu === 'skills'
                    ? 'composer.skills.title'
                    : isModelListMenu
                      ? 'composer.query.model.title'
                      : 'composer.modelSettings'
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('composer.query.closeOptions')}
            disabled={applyingModel}
            onPress={handleDismissMenu}
            className="h-[44px] w-[44px] items-center justify-center rounded-app-pill active:bg-app-surface-muted"
          >
            <AppIcon usage="chatSearch.close" size={20} />
          </Pressable>
        </View>
        {activeMenu === 'content' ? (
          <MenuScrollView>
            <View className="flex-row flex-wrap">
              {localFilesAllowed ? (
                <>
                  <MenuContentTile
                    iconUsage="composer.attachImage"
                    label={t('composer.image')}
                    onPress={() => {
                      afterMenuDismissRef.current = () => onSelectAttachment?.('image');
                      handleDismissMenu();
                    }}
                  />
                  <MenuContentTile
                    iconUsage="composer.attachFile"
                    label={t('composer.file')}
                    onPress={() => {
                      afterMenuDismissRef.current = () => onSelectAttachment?.('file');
                      handleDismissMenu();
                    }}
                  />
                </>
              ) : null}
              {skillsEnabled ? (
                <MenuContentTile
                  iconUsage="composer.skills"
                  label={t('composer.skills.title')}
                  disabled={skillsDisabled}
                  onPress={handleSkillsChipPress}
                />
              ) : null}
              {onOpenChatReferences ? (
                <MenuContentTile
                  iconUsage="composer.attachChatReference"
                  label={t('contextReference.chooseChat')}
                  onPress={() => {
                    afterMenuDismissRef.current = onOpenChatReferences;
                    handleDismissMenu();
                  }}
                />
              ) : null}
              {onOpenKbaseReferences ? (
                <MenuContentTile
                  iconUsage="tab.drive"
                  label={t('contextReference.chooseKbase')}
                  onPress={() => {
                    afterMenuDismissRef.current = onOpenKbaseReferences;
                    handleDismissMenu();
                  }}
                />
              ) : null}
            </View>
          </MenuScrollView>
        ) : activeMenu === 'skills' ? (
          <View className="shrink px-app-lg pb-app-md">
            <ChatComposerSkillsMenu
              disabled={skillsDisabled}
              catalog={skillsCatalog}
              selected={selectedSkills}
              loading={skillsLoading}
              error={skillsError}
              onRetry={onLoadSkills}
              onToggle={onToggleSkills}
            />
          </View>
        ) : activeMenu === 'access' ? (
          <MenuScrollView>
            {planModeAvailable || editingModeAvailable ? (
              <View className={MENU_SECTION_CLASS}>
                <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.executionModes')}</Text>
                <View className="rounded-app-lg bg-app-background-muted">
                  {planModeAvailable ? (
                    <MenuToggleRow
                      label={t('composer.planMode')}
                      value={Boolean(planModeEnabled)}
                      disabled={queryModeDisabled}
                      onPress={onTogglePlanMode}
                    />
                  ) : null}
                  {planModeAvailable && editingModeAvailable ? <View className="mx-app-md h-px bg-app-line" /> : null}
                  {editingModeAvailable ? (
                    <MenuToggleRow
                      label={t('composer.editingMode')}
                      value={Boolean(editingModeEnabled)}
                      disabled={queryModeDisabled}
                      onPress={onToggleEditingMode}
                    />
                  ) : null}
                </View>
                {queryModeDisabled ? (
                  <Text className={EMPTY_TEXT_CLASS}>{t('composer.executionModes.running')}</Text>
                ) : null}
              </View>
            ) : null}
            {accessLevelEnabled ? (
              <View className={MENU_SECTION_CLASS}>
                <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.accessSettings')}</Text>
                {runtimeAccess?.phase === 'unknown' || (runtimeAccess && !runtimeAccess.level) ? (
                  <Text className={EMPTY_TEXT_CLASS}>{t('composer.runtimeAccess.unknown')}</Text>
                ) : null}
                {runtimeAccess?.phase === 'sending' ? (
                  <Text className={EMPTY_TEXT_CLASS}>{t('composer.runtimeAccess.sending')}</Text>
                ) : null}
                <View className="gap-app-xs">
                  {ACCESS_LEVELS.map((value) => (
                    <MenuChoiceRow
                      key={value}
                      checked={
                        runtimeAccess
                          ? runtimeAccess.level === value && runtimeAccess.phase !== 'unknown'
                          : value === accessLevel
                      }
                      disabled={Boolean(runtimeAccess?.phase)}
                      iconUsage={ACCESS_ICON_USAGE[value]}
                      label={t(`composer.query.access.${value}`)}
                      description={getAccessDescription(value, t)}
                      selectKey={value}
                      onSelect={runtimeAccess ? handleRuntimeAccessSelect : handleAccessSelect}
                    />
                  ))}
                </View>
                {runtimeAccess?.phase === 'unknown' ? (
                  <Pressable
                    onPress={onRuntimeAccessRefresh}
                    accessibilityRole="button"
                    className="min-h-[44px] justify-center"
                  >
                    <Text className="text-[13px] text-app-brand-blue">{t('composer.runtimeAccess.refresh')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </MenuScrollView>
        ) : (
          <>
            <MenuScrollView>
              {modelOptionsError ? (
                <Text accessibilityRole="alert" className={EMPTY_TEXT_CLASS}>
                  {modelOptionsError}
                </Text>
              ) : null}
              {!modelOptionsLoading && selectedModelKey && !selectedModel ? (
                <Text className={EMPTY_TEXT_CLASS}>{t('composer.query.model.selectedUnavailable')}</Text>
              ) : null}
              {isModelListMenu ? (
                <View className={MENU_SECTION_CLASS}>
                  {models.length > 0 ? (
                    models.map((model) => (
                      <MenuChoiceRow
                        key={model.key}
                        checked={model.key === selectedModelKey}
                        disabled={applyingModel}
                        label={model.name}
                        description={getModelDescription(model)}
                        onSelect={handleModelSelect}
                        selectKey={model.key}
                      />
                    ))
                  ) : (
                    <Text className={EMPTY_TEXT_CLASS}>{t('composer.query.model.empty')}</Text>
                  )}
                </View>
              ) : (
                <>
                  <View className={MENU_SECTION_CLASS}>
                    <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.query.model.title')}</Text>
                    <View className="rounded-app-lg bg-app-background-muted">
                      <MenuNavigationRow
                        iconUsage="composer.model"
                        label={selectedModel?.name || selectedModelKey || t('composer.query.model.empty')}
                        description={selectedModel ? getModelDescription(selectedModel) : undefined}
                        onPress={handleOpenModelList}
                        disabled={applyingModel}
                      />
                    </View>
                  </View>
                  {reasoningEfforts.length > 0 ? (
                    <View className={MENU_SECTION_CLASS}>
                      <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.query.reasoning.group')}</Text>
                      <View className={SEGMENT_ROW_CLASS}>
                        {reasoningEfforts.map((option) => (
                          <MenuChoiceRow
                            compact
                            key={option.key}
                            checked={option.key === selectedReasoning}
                            disabled={applyingModel}
                            label={getReasoningLabel(option.key, t) || option.label}
                            onSelect={handleReasoningSelect}
                            selectKey={option.key}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {serviceTiers.length > 0 ? (
                    <View className={MENU_SECTION_CLASS}>
                      <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.query.serviceTier.group')}</Text>
                      <View className={SEGMENT_ROW_CLASS}>
                        {serviceTiers.map((option) => (
                          <MenuChoiceRow
                            compact
                            key={option.key}
                            checked={option.key === selectedServiceTier}
                            disabled={
                              applyingModel || Boolean(selectedModel && !supportsServiceTier(selectedModel, option.key))
                            }
                            label={getServiceTierOptionLabel(option, t)}
                            onSelect={handleServiceTierSelect}
                            selectKey={option.key}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </>
              )}
              <Pressable
                disabled={modelOptionsLoading || applyingModel}
                accessibilityRole="button"
                onPress={onRefreshModels}
                className="min-h-[44px] flex-row items-center justify-center gap-app-xs rounded-app-md active:bg-app-surface-muted"
              >
                <AppIcon usage="accountSource.refresh" size={15} />
                <Text className="text-[13px] text-app-secondary">
                  {t(modelOptionsLoading ? 'composer.query.model.loading' : 'composer.query.model.refresh')}
                </Text>
              </Pressable>
            </MenuScrollView>
            {!isModelListMenu ? (
              <View className="flex-row gap-app-sm border-t border-app-line px-app-lg pt-app-md pb-app-xs">
                <Pressable
                  accessibilityRole="button"
                  disabled={applyingModel}
                  onPress={handleDismissMenu}
                  className="min-h-[48px] flex-1 items-center justify-center rounded-app-md bg-app-background-muted active:opacity-[0.72]"
                >
                  <Text className="text-[15px] font-medium text-app-secondary">{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: applyingModel, busy: applyingModel }}
                  disabled={applyingModel}
                  onPress={async () => {
                    setApplyingModel(true);
                    try {
                      if (await onModelOverrideChange(modelDraft)) handleDismissMenu();
                    } finally {
                      setApplyingModel(false);
                    }
                  }}
                  className={cn(
                    'min-h-[48px] flex-[2] items-center justify-center rounded-app-md bg-app-action active:opacity-[0.72]',
                    applyingModel && MENU_CHOICE_DISABLED_CLASS
                  )}
                >
                  <Text className="text-[15px] font-semibold text-app-on-action">{t('common.apply')}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ChatComposerSheet>
    </View>
  );
});
