import type { ChatSkillsCatalog } from '../../../core/api/services/chatSkillsProtocol';
import { ChatComposerSkillsMenu } from './ChatComposerSkillsMenu';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';

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
  onModelOverrideChange: (value: QueryModelOverride) => void;
};

type OptionMenu = 'access' | 'model' | 'skills';

type ModelMenuView = 'settings' | 'models';

type MenuAnchorLayout = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type OptionChipProps = {
  active?: boolean;
  disabled?: boolean;
  iconUsage: AppIconUsage;
  label: string;
  onPress: () => void;
};

type MenuChoiceRowProps = {
  checked?: boolean;
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

const ROOT_CLASS = 'relative z-[20] gap-[7px] pb-[6px]';
const ROOT_ACTIVE_CLASS = 'z-[30]';
const CHIP_ROW_CONTENT_CLASS = 'gap-app-sm px-0';
const CHIP_CLASS =
  'h-[38px] min-w-[98px] max-w-[210px] flex-row items-center justify-center gap-[7px] rounded-app-md border border-app-line bg-app-surface px-app-md active:opacity-[0.72]';
const CHIP_ACTIVE_CLASS = 'border-app-brand-blue bg-app-brand-blue-soft';
const CHIP_DISABLED_CLASS = 'opacity-[0.58]';
const CHIP_LABEL_CLASS = 'min-w-0 shrink text-[15px] leading-5 text-app-primary';
const MENU_MODAL_ROOT_CLASS = 'absolute inset-0';
const MENU_DISMISS_BACKDROP_CLASS = 'absolute inset-0 z-[20]';
const MENU_POPOVER_CONTAINER_CLASS = 'absolute bottom-[48px] left-0 right-0 z-[30]';
const MENU_PANEL_CLASS =
  'max-h-[360px] gap-[10px] rounded-[28px] border border-app-line bg-app-surface-raised px-app-md py-app-md';
const MENU_CONTENT_CLASS = 'gap-[8px]';
const MENU_SCROLL_CLASS = 'shrink';
const MENU_HEADER_CLASS =
  'z-[1] min-h-[38px] flex-row items-center gap-app-xs rounded-[18px] bg-app-surface-raised px-app-xs py-[2px] active:bg-app-surface-muted';
const MENU_BACK_ICON_CLASS = 'h-[34px] w-[34px] items-center justify-center rounded-app-pill';
const MENU_HEADER_TITLE_CLASS = 'text-[17px] font-semibold leading-[23px] text-app-primary';
const MENU_SECTION_CLASS = 'gap-[4px]';
const MENU_SECTION_TITLE_CLASS = 'px-app-sm pt-[2px] text-[12px] font-semibold leading-[16px] text-app-tertiary';
const MENU_CHOICE_ROW_CLASS =
  'min-h-[62px] flex-row items-center gap-app-md rounded-[18px] px-app-sm py-[8px] active:bg-app-surface-muted';
const MENU_CHOICE_CHECKED_CLASS = 'bg-app-brand-blue-soft';
const MENU_CHOICE_DISABLED_CLASS = 'opacity-[0.48]';
const MENU_CHOICE_ICON_CLASS = 'h-[36px] w-[36px] items-center justify-center rounded-app-pill bg-app-background-muted';
const MENU_CHOICE_TEXT_CLASS = 'min-w-0 flex-1';
const MENU_CHOICE_LABEL_CLASS = 'text-[17px] font-semibold leading-[23px] text-app-primary';
const MENU_CHOICE_DESCRIPTION_CLASS = 'mt-[2px] text-[14px] leading-[20px] text-app-tertiary';
const EMPTY_TEXT_CLASS = 'px-app-sm text-[13px] leading-[18px] text-app-tertiary';
const POPOVER_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.14,
  shadowRadius: 24,
  elevation: 12
} satisfies ViewStyle;
const POPOVER_HORIZONTAL_INSET = 16;
const POPOVER_VERTICAL_GAP = 8;
const DEFAULT_POPOVER_FRAME_STYLE = {
  bottom: 96,
  left: POPOVER_HORIZONTAL_INSET,
  right: POPOVER_HORIZONTAL_INSET
} satisfies ViewStyle;

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

function getServiceTierChipLabel(value: ModelOptionServiceTier | undefined, t: TFunction): string {
  if (!value) {
    return '';
  }
  if (value === 'STANDARD') {
    return t('composer.query.serviceTier.STANDARD');
  }
  return getServiceTierLabel(value, t);
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
      accessibilityState={{ disabled, expanded: active }}
    >
      <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.sm} />
      <Text allowFontScaling={false} numberOfLines={1} className={CHIP_LABEL_CLASS}>
        {label}
      </Text>
      <AppIcon usage="composer.optionExpand" size={16} />
    </Pressable>
  );
});

const MenuChoiceRow = memo(function MenuChoiceRow({
  checked = false,
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
        MENU_CHOICE_ROW_CLASS,
        checked ? MENU_CHOICE_CHECKED_CLASS : null,
        disabled ? MENU_CHOICE_DISABLED_CLASS : null
      )}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: checked }}
    >
      {iconUsage ? (
        <View className={MENU_CHOICE_ICON_CLASS}>
          <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.sm} />
        </View>
      ) : null}
      <View className={MENU_CHOICE_TEXT_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={MENU_CHOICE_LABEL_CLASS}>
          {label}
        </Text>
        {description ? (
          <Text allowFontScaling={false} numberOfLines={1} className={MENU_CHOICE_DESCRIPTION_CLASS}>
            {description}
          </Text>
        ) : null}
      </View>
      {checked ? <AppIcon usage="composer.optionSelected" size={20} /> : null}
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
      className={cn(MENU_CHOICE_ROW_CLASS, disabled ? MENU_CHOICE_DISABLED_CLASS : null)}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      {iconUsage ? (
        <View className={MENU_CHOICE_ICON_CLASS}>
          <AppIcon usage={iconUsage} size={appVisualTokens.iconSizes.sm} />
        </View>
      ) : null}
      <View className={MENU_CHOICE_TEXT_CLASS}>
        <Text allowFontScaling={false} numberOfLines={1} className={MENU_CHOICE_LABEL_CLASS}>
          {label}
        </Text>
        {description ? (
          <Text allowFontScaling={false} numberOfLines={1} className={MENU_CHOICE_DESCRIPTION_CLASS}>
            {description}
          </Text>
        ) : null}
      </View>
      <AppIcon usage="composer.optionNavigate" size={18} />
    </Pressable>
  );
});

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
  const { theme } = useAppTheme();
  const windowDimensions = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const keyboardVisibleRef = useRef(Keyboard.isVisible());
  const keyboardSettleFrameRef = useRef<number | null>(null);
  const pendingMenuRef = useRef<OptionMenu | null>(null);
  const [activeMenu, setActiveMenu] = useState<OptionMenu | null>(null);
  const activeMenuRef = useRef(activeMenu);
  activeMenuRef.current = activeMenu;
  const [modelMenuView, setModelMenuView] = useState<ModelMenuView>('settings');
  const [menuAnchorLayout, setMenuAnchorLayout] = useState<MenuAnchorLayout | null>(null);
  const models = modelOptionsSnapshot?.models || EMPTY_MODELS;
  const reasoningEfforts = modelOptionsSnapshot?.reasoningEfforts || EMPTY_REASONING_EFFORTS;
  const serviceTiers = modelOptionsSnapshot?.serviceTiers || EMPTY_SERVICE_TIERS;
  const selectedModelKey = modelOverride.key || '';
  const selectedModel = findModel(models, selectedModelKey);
  const selectedReasoning = modelOverride.reasoningEffort;
  const selectedServiceTier = modelOverride.serviceTier || 'STANDARD';
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
    const shouldShowServiceTierInChip = selectedServiceTier !== 'STANDARD' || serviceTiers.length > 1;
    const modelChipLabelParts = [
      selectedModel?.name || selectedModelKey || t('composer.query.model.title'),
      getReasoningLabel(selectedReasoning, t),
      shouldShowServiceTierInChip ? getServiceTierChipLabel(selectedServiceTier, t) : ''
    ];
    return modelChipLabelParts.filter(Boolean).join(' · ');
  }, [
    agentKey,
    modelOptionsLoading,
    models.length,
    selectedModel?.name,
    selectedModelKey,
    selectedReasoning,
    selectedServiceTier,
    serviceTiers.length,
    t
  ]);
  const modelChipDisabled = !modelEnabled || disabled || modelDisabled || !agentKey;
  const popoverFrameStyle = useMemo<ViewStyle>(() => {
    if (!menuAnchorLayout || !menuAnchorLayout.width || !menuAnchorLayout.height) {
      return DEFAULT_POPOVER_FRAME_STYLE;
    }

    const maxWidth = Math.max(windowDimensions.width - POPOVER_HORIZONTAL_INSET * 2, POPOVER_HORIZONTAL_INSET);
    const left = Math.max(
      POPOVER_HORIZONTAL_INSET,
      Math.min(menuAnchorLayout.x, windowDimensions.width - POPOVER_HORIZONTAL_INSET)
    );
    const width = Math.min(
      menuAnchorLayout.width,
      Math.max(maxWidth - (left - POPOVER_HORIZONTAL_INSET), POPOVER_HORIZONTAL_INSET)
    );
    const bottom = Math.max(POPOVER_VERTICAL_GAP, windowDimensions.height - menuAnchorLayout.y + POPOVER_VERTICAL_GAP);

    return {
      bottom,
      left,
      width
    };
  }, [menuAnchorLayout, windowDimensions.height, windowDimensions.width]);

  const measureMenuAnchor = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchorLayout({ height, width, x, y });
    });
  }, []);
  const openMenu = useCallback(
    (menu: OptionMenu) => {
      measureMenuAnchor();
      setActiveMenu(menu);
    },
    [measureMenuAnchor]
  );
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
    if (activeMenuRef.current === 'skills') Keyboard.dismiss();
    pendingMenuRef.current = null;
    setModelMenuView('settings');
    setActiveMenu(null);
  }, []);
  const handleSkillsChipPress = useCallback(() => {
    if (skillsDisabled || !skillsEnabled) return;
    if (activeMenu !== 'skills') onLoadSkills();
    toggleMenu('skills');
  }, [activeMenu, onLoadSkills, skillsDisabled, skillsEnabled, toggleMenu]);
  useEffect(() => {
    if (activeMenu === 'skills' && (skillsDisabled || !skillsEnabled)) handleDismissMenu();
  }, [activeMenu, handleDismissMenu, skillsDisabled, skillsEnabled]);
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
      toggleMenu('model');
    }
  }, [modelChipDisabled, toggleMenu]);
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
      const nextServiceTier = supportsServiceTier(model, selectedServiceTier) ? selectedServiceTier : 'STANDARD';
      onModelOverrideChange(
        buildModelOverride(modelOverride, {
          key: model.key,
          serviceTier: nextServiceTier
        })
      );
      setModelMenuView('settings');
    },
    [modelOverride, models, onModelOverrideChange, selectedServiceTier]
  );
  const handleReasoningSelect = useCallback(
    (key: string) => {
      const option = reasoningEfforts.find((item) => item.key === key);
      if (!option) {
        return;
      }
      onModelOverrideChange(buildModelOverride(modelOverride, { reasoningEffort: option.key }));
    },
    [modelOverride, onModelOverrideChange, reasoningEfforts]
  );
  const handleServiceTierSelect = useCallback(
    (key: string) => {
      const option = serviceTiers.find((item) => item.key === key);
      if (!option) {
        return;
      }
      onModelOverrideChange(buildModelOverride(modelOverride, { serviceTier: option.key }));
    },
    [modelOverride, onModelOverrideChange, serviceTiers]
  );
  useEffect(() => {
    if (disabled || (activeMenu === 'model' && modelChipDisabled) || (activeMenu === 'access' && !accessLevelEnabled)) {
      pendingMenuRef.current = null;
      setActiveMenu(null);
    }
  }, [disabled, activeMenu, modelChipDisabled, accessLevelEnabled]);
  useEffect(() => {
    pendingMenuRef.current = null;
    setActiveMenu(null);
  }, [agentKey]);

  const isModelListMenu = activeMenu === 'model' && modelMenuView === 'models';

  useEffect(() => {
    if (activeMenu) {
      measureMenuAnchor();
    }
  }, [activeMenu, measureMenuAnchor, windowDimensions.height, windowDimensions.width]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisibleRef.current = true;
      if (activeMenuRef.current === 'skills') {
        measureMenuAnchor();
        return;
      }
      pendingMenuRef.current = null;
      cancelKeyboardSettleFrame();
      setModelMenuView('settings');
      setActiveMenu(null);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisibleRef.current = false;
      if (activeMenuRef.current === 'skills') measureMenuAnchor();
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
  }, [cancelKeyboardSettleFrame, measureMenuAnchor, openMenuAfterKeyboardSettled]);

  return (
    <View ref={rootRef} className={cn(ROOT_CLASS, activeMenu ? ROOT_ACTIVE_CLASS : null)}>
      <ScrollView
        horizontal
        bounces={false}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={CHIP_ROW_CONTENT_CLASS}
      >
        {accessLevelEnabled ? (
          <OptionChip
            active={activeMenu === 'access'}
            disabled={disabled || !accessLevelEnabled}
            iconUsage={ACCESS_ICON_USAGE[accessLevel]}
            label={
              runtimeAccess
                ? runtimeAccess.phase === 'unknown' || !runtimeAccess.level
                  ? t('composer.runtimeAccess.unknown')
                  : runtimeAccess.phase === 'sending'
                    ? t('composer.runtimeAccess.sending')
                    : `${t('composer.runtimeAccess.current')} · ${t(`composer.query.access.${runtimeAccess.level}`)}`
                : t(`composer.query.access.${accessLevel}`)
            }
            onPress={handleAccessChipPress}
          />
        ) : null}
        {modelEnabled ? (
          <OptionChip
            active={activeMenu === 'model'}
            disabled={modelChipDisabled}
            iconUsage={selectedServiceTier === 'FAST' ? 'composer.modelFast' : 'composer.model'}
            label={modelChipLabel}
            onPress={handleModelChipPress}
          />
        ) : null}
        {skillsEnabled ? (
          <OptionChip
            active={selectedSkills.length > 0 || activeMenu === 'skills'}
            disabled={skillsDisabled}
            iconUsage="composer.skills"
            label={`${t('composer.skills.title')}${selectedSkills.length ? ` · ${selectedSkills.length}` : ''}`}
            onPress={handleSkillsChipPress}
          />
        ) : null}
      </ScrollView>

      {activeMenu ? (
        <Modal animationType="none" transparent visible statusBarTranslucent onRequestClose={handleDismissMenu}>
          <View pointerEvents="box-none" className={MENU_MODAL_ROOT_CLASS}>
            <Pressable
              accessibilityLabel={t('composer.query.closeOptions')}
              accessibilityRole="button"
              className={MENU_DISMISS_BACKDROP_CLASS}
              onPress={handleDismissMenu}
            />
            <View className={MENU_POPOVER_CONTAINER_CLASS} pointerEvents="box-none" style={popoverFrameStyle}>
              <View
                className={MENU_PANEL_CLASS}
                style={[POPOVER_ELEVATION_STYLE, { shadowColor: theme.colors.shadow }]}
              >
                {activeMenu === 'model' ? (
                  <View className={MENU_SECTION_CLASS}>
                    {modelOptionsError ? <Text className={EMPTY_TEXT_CLASS}>{modelOptionsError}</Text> : null}
                    {!modelOptionsLoading && selectedModelKey && !selectedModel ? (
                      <Text className={EMPTY_TEXT_CLASS}>{t('composer.query.model.selectedUnavailable')}</Text>
                    ) : null}
                    <Pressable disabled={modelOptionsLoading} accessibilityRole="button" onPress={onRefreshModels}>
                      <Text className="px-app-sm text-[13px] text-app-brand-blue">
                        {t(modelOptionsLoading ? 'composer.query.model.loading' : 'composer.query.model.refresh')}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {activeMenu === 'skills' ? (
                  <ChatComposerSkillsMenu
                    catalog={skillsCatalog}
                    selected={selectedSkills}
                    loading={skillsLoading}
                    error={skillsError}
                    onRetry={onLoadSkills}
                    onToggle={onToggleSkills}
                  />
                ) : isModelListMenu ? (
                  <>
                    <Pressable
                      accessibilityLabel={t('composer.query.model.back')}
                      accessibilityRole="button"
                      className={MENU_HEADER_CLASS}
                      onPress={handleBackToModelSettings}
                    >
                      <View className={MENU_BACK_ICON_CLASS}>
                        <AppIcon usage="composer.optionBack" size={18} />
                      </View>
                      <Text allowFontScaling={false} numberOfLines={1} className={MENU_HEADER_TITLE_CLASS}>
                        {t('composer.query.model.title')}
                      </Text>
                    </Pressable>

                    <MenuScrollView>
                      <View className={MENU_SECTION_CLASS}>
                        {models.length > 0 ? (
                          models.map((model) => (
                            <MenuChoiceRow
                              key={model.key}
                              checked={model.key === selectedModelKey}
                              iconUsage="composer.model"
                              label={model.name}
                              description={getModelDescription(model)}
                              onSelect={handleModelSelect}
                              selectKey={model.key}
                            />
                          ))
                        ) : (
                          <Text allowFontScaling={false} className={EMPTY_TEXT_CLASS}>
                            {t('composer.query.model.empty')}
                          </Text>
                        )}
                      </View>
                    </MenuScrollView>
                  </>
                ) : (
                  <MenuScrollView>
                    {activeMenu === 'access' ? (
                      <>
                        {runtimeAccess ? (
                          <View className={MENU_SECTION_CLASS}>
                            <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.runtimeAccess.current')}</Text>
                            {runtimeAccess.phase === 'unknown' || !runtimeAccess.level ? (
                              <Text className={EMPTY_TEXT_CLASS}>{t('composer.runtimeAccess.unknown')}</Text>
                            ) : null}
                            {ACCESS_LEVELS.map((value) => (
                              <MenuChoiceRow
                                key={value}
                                checked={runtimeAccess.level === value && runtimeAccess.phase !== 'unknown'}
                                disabled={Boolean(runtimeAccess.phase)}
                                label={t(`composer.query.access.${value}`)}
                                selectKey={value}
                                onSelect={handleRuntimeAccessSelect}
                              />
                            ))}
                            {runtimeAccess.phase === 'unknown' ? (
                              <Pressable onPress={onRuntimeAccessRefresh} accessibilityRole="button">
                                <Text className="px-app-sm text-[13px] text-app-brand-blue">
                                  {t('composer.runtimeAccess.refresh')}
                                </Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                        <>
                          <Text className={MENU_SECTION_TITLE_CLASS}>{t('composer.runtimeAccess.future')}</Text>
                          {ACCESS_LEVELS.map((value) => (
                            <MenuChoiceRow
                              key={value}
                              checked={value === accessLevel}
                              iconUsage={ACCESS_ICON_USAGE[value]}
                              label={t(`composer.query.access.${value}`)}
                              description={getAccessDescription(value, t)}
                              onSelect={handleAccessSelect}
                              selectKey={value}
                            />
                          ))}
                        </>
                      </>
                    ) : (
                      <>
                        {reasoningEfforts.length > 0 ? (
                          <View className={MENU_SECTION_CLASS}>
                            <Text allowFontScaling={false} className={MENU_SECTION_TITLE_CLASS}>
                              {t('composer.query.reasoning.group')}
                            </Text>
                            {reasoningEfforts.map((option) => (
                              <MenuChoiceRow
                                key={option.key}
                                checked={option.key === selectedReasoning}
                                iconUsage="composer.reasoning"
                                label={getReasoningLabel(option.key, t) || option.label}
                                description={option.label}
                                onSelect={handleReasoningSelect}
                                selectKey={option.key}
                              />
                            ))}
                          </View>
                        ) : null}

                        {serviceTiers.length > 0 ? (
                          <View className={MENU_SECTION_CLASS}>
                            <Text allowFontScaling={false} className={MENU_SECTION_TITLE_CLASS}>
                              {t('composer.query.serviceTier.group')}
                            </Text>
                            {serviceTiers.map((option) => (
                              <MenuChoiceRow
                                key={option.key}
                                checked={option.key === selectedServiceTier}
                                disabled={Boolean(selectedModel && !supportsServiceTier(selectedModel, option.key))}
                                iconUsage={option.key === 'FAST' ? 'composer.modelFast' : 'composer.model'}
                                label={getServiceTierOptionLabel(option, t)}
                                description={option.label}
                                onSelect={handleServiceTierSelect}
                                selectKey={option.key}
                              />
                            ))}
                          </View>
                        ) : null}

                        <View className={MENU_SECTION_CLASS}>
                          <Text allowFontScaling={false} className={MENU_SECTION_TITLE_CLASS}>
                            {t('composer.query.model.title')}
                          </Text>
                          <MenuNavigationRow
                            iconUsage="composer.model"
                            label={selectedModel?.name || selectedModelKey || t('composer.query.model.empty')}
                            description={selectedModel ? getModelDescription(selectedModel) : undefined}
                            onPress={handleOpenModelList}
                          />
                        </View>
                      </>
                    )}
                  </MenuScrollView>
                )}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
});
