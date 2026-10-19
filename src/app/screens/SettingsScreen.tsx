import { Fragment, ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccountAuth } from '../../core/auth/useAccountAuth.ts';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { type I18nKey, type LocalePreference, useI18n } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens } from '../../shared/visual/foundation';
import { logoutAccount } from '../../core/auth/accountAuth.ts';
import { AccountDevicesPanel } from '../../features/deviceLink/AccountDevicesPanel.tsx';
import { MeLogoutButton } from './MeScreenParts';
import {
  getDevelopmentDebugPanelSnapshot,
  openDevelopmentDebugPanel,
  setDevelopmentDebugPanelEnabled,
  subscribeDevelopmentDebugPanel
} from '../debug/developmentDebugPanel';
import {
  clearSettingsAccountCache,
  clearSettingsConversationCache,
  clearSettingsDesktopCache,
  listSettingsCacheScopes,
  type SettingsCacheScope
} from '../settings/settingsActions';
import type { RootStackParamList } from '../navigation/types';

type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type CacheActionState = {
  key: string;
  status: 'clearing' | 'success' | 'error';
  errorText: string;
};

type SettingsCacheAccount = {
  accountId: string;
  scopes: SettingsCacheScope[];
  sizeBytes: number;
  lastLoadedAt: number;
  conversationCount: number;
};

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

type SettingsRowProps = {
  iconUsage: AppIconUsage;
  title: string;
  detail?: string;
  value?: string;
  disabled?: boolean;
  selected?: boolean;
  rightAccessory?: ReactNode;
  onPress?: () => void;
};

type LanguageOption = {
  preference: LocalePreference;
  titleKey: I18nKey;
  detailKey: I18nKey;
};

const SCREEN_CLASS = 'flex-1 bg-app-background';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const SCROLL_VIEW_CLASS = 'flex-1';
const CONTENT_CLASS = 'gap-app-lg px-app-lg pt-app-lg';
const SECTION_CLASS = 'gap-app-sm';
const SECTION_TITLE_CLASS = 'ml-app-xs text-app-footnote font-semibold text-app-secondary';
const SECTION_ROWS_CLASS = 'overflow-hidden rounded-app-md border border-app-line bg-app-surface';
const ROW_CLASS = 'min-h-[58px] flex-row items-center gap-app-md border-t border-app-line px-app-lg py-app-sm';
const ROW_PRESSABLE_CLASS = `${ROW_CLASS} active:bg-app-surface-muted`;
const ROW_SELECTED_CLASS = 'bg-app-surface-muted';
const ROW_DISABLED_CLASS = 'opacity-[0.58]';
const ROW_ICON_SLOT_CLASS = 'h-8 w-8 shrink-0 items-center justify-center';
const ROW_TEXT_BLOCK_CLASS = 'min-w-0 flex-1 gap-[2px]';
const ROW_TITLE_CLASS = 'text-app-body font-semibold text-app-primary';
const ROW_DETAIL_CLASS = 'text-app-footnote text-app-secondary';
const ROW_VALUE_CLASS = 'max-w-24 shrink text-app-footnote font-medium text-app-secondary';
const ROW_TEXT_DISABLED_CLASS = 'text-app-tertiary';
const CACHE_CLEAR_BUTTON_CLASS =
  'min-h-[36px] items-center justify-center rounded-app-sm border border-app-danger-line bg-app-surface px-app-md active:bg-app-danger-soft';
const CACHE_CLEAR_BUTTON_DISABLED_CLASS = 'opacity-[0.5]';
const CACHE_CLEAR_BUTTON_TEXT_CLASS = 'text-app-footnote font-semibold text-app-danger';
const SELECTION_PLACEHOLDER_CLASS = 'h-[22px] w-[22px]';
const HEADER_ACTION_BUTTON_CLASS = 'h-11 w-11 items-center justify-center rounded-app-pill active:bg-app-surface-muted';

function formatCacheSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCacheLastLoaded(lastLoadedAt: number, locale: string): string {
  if (!lastLoadedAt) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(lastLoadedAt);
}

const LANGUAGE_OPTIONS = [
  {
    preference: 'system',
    titleKey: 'settings.language.system',
    detailKey: 'settings.language.systemDetail'
  },
  {
    preference: 'zh-CN',
    titleKey: 'settings.language.zhCN',
    detailKey: 'settings.language.zhCNDetail'
  },
  {
    preference: 'en-US',
    titleKey: 'settings.language.enUS',
    detailKey: 'settings.language.enUSDetail'
  }
] as const satisfies readonly LanguageOption[];

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View className={SECTION_CLASS}>
      <Text className={SECTION_TITLE_CLASS}>{title}</Text>
      <View className={SECTION_ROWS_CLASS}>{children}</View>
    </View>
  );
}

function SettingsRow({
  iconUsage,
  title,
  detail,
  value,
  disabled = false,
  selected = false,
  rightAccessory,
  onPress
}: SettingsRowProps) {
  const rowClass = cn(
    onPress ? ROW_PRESSABLE_CLASS : ROW_CLASS,
    selected && ROW_SELECTED_CLASS,
    disabled && ROW_DISABLED_CLASS
  );
  const disabledTextClass = disabled && ROW_TEXT_DISABLED_CLASS;

  const content = (
    <>
      <View className={ROW_ICON_SLOT_CLASS}>
        <AppIcon usage={iconUsage} size={19} />
      </View>
      <View className={ROW_TEXT_BLOCK_CLASS}>
        <Text className={cn(ROW_TITLE_CLASS, disabledTextClass)} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text className={cn(ROW_DETAIL_CLASS, disabledTextClass)} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className={cn(ROW_VALUE_CLASS, disabledTextClass)} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {rightAccessory}
    </>
  );

  if (!onPress) {
    return <View className={rowClass}>{content}</View>;
  }

  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} className={rowClass}>
      {content}
    </Pressable>
  );
}

export function SettingsScreen({ navigation, route }: SettingsScreenProps) {
  const { locale, preference: localePreference, setLocalePreference, t } = useI18n();
  const { theme } = useAppTheme();
  const section = route.params?.section || 'development';
  const [loggingOut, setLoggingOut] = useState(false);
  const { session: accountSession } = useAccountAuth();
  const insets = useSafeAreaInsets();
  const debugSnapshot = useSyncExternalStore(
    subscribeDevelopmentDebugPanel,
    getDevelopmentDebugPanelSnapshot,
    getDevelopmentDebugPanelSnapshot
  );
  const [cacheAction, setCacheAction] = useState<CacheActionState | null>(null);
  const [cacheScopes, setCacheScopes] = useState<SettingsCacheScope[]>([]);
  const [cacheLoading, setCacheLoading] = useState(true);
  const [cacheLoadError, setCacheLoadError] = useState('');
  const currentAccountId = accountSession?.accountId || '';
  const cacheAccounts = useMemo<SettingsCacheAccount[]>(() => {
    const grouped = new Map<string, SettingsCacheScope[]>();
    for (const scope of cacheScopes) {
      if (!scope.accountId) continue;
      grouped.set(scope.accountId, [...(grouped.get(scope.accountId) || []), scope]);
    }
    return [...grouped.entries()].map(([accountId, scopes]) => ({
      accountId,
      scopes,
      sizeBytes: scopes.reduce((total, scope) => total + scope.sizeBytes, 0),
      lastLoadedAt: scopes.reduce((latest, scope) => Math.max(latest, scope.lastLoadedAt), 0),
      conversationCount: scopes.reduce((total, scope) => total + scope.conversationCount, 0)
    }));
  }, [cacheScopes]);
  const unassignedCacheScopes = useMemo(() => cacheScopes.filter((scope) => scope.unassigned), [cacheScopes]);
  const developerModeEnabled = __DEV__ && debugSnapshot.enabled;
  const leftActions = useMemo(
    () =>
      [
        <AppIconButton
          key="back"
          usage="chatDetail.back"
          accessibilityLabel={t('settings.back')}
          onPress={() => navigation.goBack()}
          hitSlop={10}
          className={HEADER_ACTION_BUTTON_CLASS}
        />
      ] as const,
    [navigation, t]
  );

  const loadCacheScopes = useCallback(async () => {
    setCacheLoading(true);
    try {
      setCacheScopes(await listSettingsCacheScopes(currentAccountId || null));
      setCacheLoadError('');
    } catch (error) {
      setCacheLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setCacheLoading(false);
    }
  }, [currentAccountId]);

  useEffect(() => {
    if (section !== 'storage') return;
    let cancelled = false;
    void loadCacheScopes().catch(() => {
      if (!cancelled) setCacheLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadCacheScopes, section]);

  const handleClearCache = useCallback(
    (key: string, name: string, detail: string, clear: () => Promise<unknown>) => {
      if (cacheAction?.status === 'clearing') {
        return;
      }

      Alert.alert(t('settings.cache.confirmTitle'), `${t('settings.cache.confirmMessage', { name })}\n\n${detail}`, [
        {
          text: t('common.cancel'),
          style: 'cancel'
        },
        {
          text: t('settings.cache.clear'),
          style: 'destructive',
          onPress: () => {
            setCacheAction({ key, status: 'clearing', errorText: '' });
            clear()
              .then(() => loadCacheScopes())
              .then(() => setCacheAction({ key, status: 'success', errorText: '' }))
              .catch((error) => {
                setCacheAction({
                  key,
                  status: 'error',
                  errorText: error instanceof Error ? error.message : String(error)
                });
              });
          }
        }
      ]);
    },
    [cacheAction?.status, loadCacheScopes, t]
  );

  const cacheDetail = useCallback(
    (sizeBytes: number, conversationCount: number, lastLoadedAt: number) =>
      t('settings.cache.stats', {
        size: formatCacheSize(sizeBytes),
        count: conversationCount,
        time: formatCacheLastLoaded(lastLoadedAt, locale)
      }),
    [locale, t]
  );

  const handleDeveloperToggle = useCallback((enabled: boolean) => {
    setDevelopmentDebugPanelEnabled(enabled);
  }, []);
  const handleOpenDebugPanel = useCallback(() => {
    openDevelopmentDebugPanel();
  }, []);
  const handleLanguageSelect = useCallback(
    (nextPreference: LocalePreference) => {
      if (nextPreference === localePreference) {
        return;
      }

      setLocalePreference(nextPreference);
    },
    [localePreference, setLocalePreference]
  );
  const renderCacheClearButton = (key: string, accessibilityLabel: string, onPress: () => void) => {
    const clearing = cacheAction?.key === key && cacheAction.status === 'clearing';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={cacheAction?.status === 'clearing'}
        className={cn(
          CACHE_CLEAR_BUTTON_CLASS,
          cacheAction?.status === 'clearing' && CACHE_CLEAR_BUTTON_DISABLED_CLASS
        )}
        onPress={onPress}
      >
        {clearing ? (
          <ActivityIndicator size="small" color={theme.colors.danger} />
        ) : (
          <Text className={CACHE_CLEAR_BUTTON_TEXT_CLASS}>{t('settings.cache.clear')}</Text>
        )}
      </Pressable>
    );
  };

  const cacheFeedback = (key: string) => {
    if (cacheAction?.key !== key) return '';
    if (cacheAction.status === 'success') return t('settings.cache.success');
    if (cacheAction.status === 'error') {
      return t('settings.cache.error', { message: cacheAction.errorText || t('common.unknown') });
    }
    return '';
  };

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader
          title={t(
            section === 'account'
              ? 'account.title'
              : section === 'devices'
                ? 'me.section.accountDevices'
                : section === 'storage'
                  ? 'account.storage'
                  : section === 'language'
                    ? 'me.action.languageSettings'
                    : 'me.action.developerMode'
          )}
          leftActions={leftActions}
        />
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} className={SCROLL_VIEW_CLASS}>
        <View className={CONTENT_CLASS} style={{ paddingBottom: insets.bottom + appVisualTokens.spacing.xxl }}>
          {section === 'account' ? (
            <SettingsSection title={t('account.title')}>
              <SettingsRow
                iconUsage="tab.me"
                title={accountSession?.user.displayName || accountSession?.user.email || t('me.accountName.loggedOut')}
                detail={accountSession?.user.email}
              />
              {accountSession ? (
                <MeLogoutButton
                  disabled={loggingOut}
                  title={t('me.logout')}
                  onPress={() => {
                    setLoggingOut(true);
                    void logoutAccount().finally(() => {
                      setLoggingOut(false);
                      navigation.goBack();
                    });
                  }}
                />
              ) : (
                <SettingsRow
                  iconUsage="tab.me"
                  title={t('auth.mode.account')}
                  onPress={() => navigation.navigate('Login')}
                />
              )}
            </SettingsSection>
          ) : null}
          {section === 'devices' ? (
            <SettingsSection title={t('me.section.accountDevices')}>
              <AccountDevicesPanel />
            </SettingsSection>
          ) : null}
          {section === 'storage' ? (
            <SettingsSection title={t('settings.section.cache')}>
              {cacheLoading ? (
                <SettingsRow iconUsage="settings.cache" title={t('settings.cache.loading')} />
              ) : cacheLoadError ? (
                <SettingsRow
                  iconUsage="settings.cache"
                  title={t('settings.cache.loadError')}
                  detail={cacheLoadError}
                  onPress={() => void loadCacheScopes()}
                />
              ) : cacheScopes.length === 0 ? (
                <SettingsRow iconUsage="settings.cache" title={t('settings.cache.empty')} />
              ) : (
                <>
                  {cacheAccounts.map((account) => {
                    const accountKey = `account:${account.accountId}`;
                    const accountName = t('settings.cache.account', { id: account.accountId });
                    const accountStats = cacheDetail(
                      account.sizeBytes,
                      account.conversationCount,
                      account.lastLoadedAt
                    );
                    const feedback = cacheFeedback(accountKey);
                    return (
                      <Fragment key={accountKey}>
                        <SettingsRow
                          iconUsage="tab.me"
                          title={accountName}
                          detail={`${accountStats}${feedback ? `\n${feedback}` : ''}`}
                          rightAccessory={renderCacheClearButton(
                            accountKey,
                            t('settings.cache.clearAccount', { name: accountName }),
                            () =>
                              handleClearCache(accountKey, accountName, accountStats, () =>
                                clearSettingsAccountCache(account.accountId)
                              )
                          )}
                        />
                        {account.scopes.map((scope) => {
                          const desktopKey = `desktop:${scope.cacheScopeId}`;
                          const desktopName =
                            scope.desktopName || t('settings.cache.desktop', { id: scope.desktopId.slice(0, 8) });
                          const desktopStats = cacheDetail(
                            scope.sizeBytes,
                            scope.conversationCount,
                            scope.lastLoadedAt
                          );
                          const desktopFeedback = cacheFeedback(desktopKey);
                          return (
                            <Fragment key={desktopKey}>
                              <SettingsRow
                                iconUsage="settings.cache"
                                title={desktopName}
                                detail={`${scope.desktopId}\n${desktopStats}${desktopFeedback ? `\n${desktopFeedback}` : ''}`}
                                value={scope.current ? t('settings.cache.currentDevice') : undefined}
                                rightAccessory={renderCacheClearButton(
                                  desktopKey,
                                  t('settings.cache.clearDesktop', { name: desktopName }),
                                  () =>
                                    handleClearCache(desktopKey, desktopName, desktopStats, () =>
                                      clearSettingsDesktopCache(scope.cacheScopeId)
                                    )
                                )}
                              />
                              {scope.conversations.map((conversation) => {
                                const conversationKey = `conversation:${scope.cacheScopeId}:${conversation.conversationId}`;
                                const conversationName =
                                  conversation.title ||
                                  t('settings.cache.conversation', { id: conversation.conversationId.slice(0, 8) });
                                const conversationStats = cacheDetail(
                                  conversation.sizeBytes,
                                  1,
                                  conversation.lastLoadedAt
                                );
                                const conversationFeedback = cacheFeedback(conversationKey);
                                return (
                                  <SettingsRow
                                    key={conversationKey}
                                    iconUsage="tab.chat"
                                    title={conversationName}
                                    detail={`${conversationStats}${conversationFeedback ? `\n${conversationFeedback}` : ''}`}
                                    rightAccessory={renderCacheClearButton(
                                      conversationKey,
                                      t('settings.cache.clearConversation', { name: conversationName }),
                                      () =>
                                        handleClearCache(conversationKey, conversationName, conversationStats, () =>
                                          clearSettingsConversationCache(
                                            currentAccountId,
                                            scope.cacheScopeId,
                                            conversation.conversationId
                                          )
                                        )
                                    )}
                                  />
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  {unassignedCacheScopes.map((scope) => {
                    const desktopKey = `desktop:${scope.cacheScopeId}`;
                    const desktopName = scope.cacheScopeId.startsWith('cs_')
                      ? t('accountSource.cloud')
                      : scope.desktopName || t('settings.cache.unassigned');
                    const desktopStats = cacheDetail(scope.sizeBytes, scope.conversationCount, scope.lastLoadedAt);
                    const feedback = cacheFeedback(desktopKey);
                    return (
                      <SettingsRow
                        key={desktopKey}
                        iconUsage="settings.cache"
                        title={desktopName}
                        detail={`${scope.cacheScopeId.startsWith('cs_') ? '' : t('settings.cache.unassignedDetail') + ' · ' + scope.desktopId + '\n'}${desktopStats}${feedback ? `\n${feedback}` : ''}`}
                        rightAccessory={renderCacheClearButton(
                          desktopKey,
                          t('settings.cache.clearDesktop', { name: desktopName }),
                          () =>
                            handleClearCache(desktopKey, desktopName, desktopStats, () =>
                              clearSettingsDesktopCache(scope.cacheScopeId)
                            )
                        )}
                      />
                    );
                  })}
                </>
              )}
            </SettingsSection>
          ) : null}

          {section === 'development' ? (
            <SettingsSection title={t('settings.section.developer')}>
              <SettingsRow
                iconUsage="settings.developer"
                title={t('settings.developer.mode')}
                detail={__DEV__ ? t('settings.developer.modeDetail') : t('settings.developer.unavailable')}
                value={developerModeEnabled ? t('settings.value.enabled') : t('settings.value.disabled')}
                disabled={!__DEV__}
                rightAccessory={
                  <Switch
                    disabled={!__DEV__}
                    value={developerModeEnabled}
                    onValueChange={handleDeveloperToggle}
                    trackColor={{
                      false: theme.colors.lineStrong,
                      true: theme.colors.brandBlueAction
                    }}
                    thumbColor={developerModeEnabled ? theme.colors.onBrandBlueAction : theme.colors.surface}
                  />
                }
              />
              <SettingsRow
                iconUsage="settings.openPanel"
                title={t('settings.developer.openPanel')}
                detail={t('settings.developer.openPanelDetail')}
                disabled={!developerModeEnabled}
                onPress={handleOpenDebugPanel}
              />
              <SettingsRow
                iconUsage="settings.openPanel"
                title={t('me.action.waitingEffects')}
                onPress={() => navigation.navigate('AgentWaitingDemo')}
              />
            </SettingsSection>
          ) : null}

          {section === 'language' ? (
            <SettingsSection title={t('settings.section.language')}>
              {LANGUAGE_OPTIONS.map((option) => {
                const selected = localePreference === option.preference;
                const value =
                  option.preference === 'system' && selected ? t('settings.language.current', { locale }) : undefined;
                return (
                  <SettingsRow
                    key={option.preference}
                    iconUsage="settings.language"
                    title={t(option.titleKey)}
                    detail={t(option.detailKey)}
                    value={value}
                    selected={selected}
                    onPress={selected ? undefined : () => handleLanguageSelect(option.preference)}
                    rightAccessory={
                      selected ? (
                        <AppIcon usage="settings.selected" />
                      ) : (
                        <View className={SELECTION_PLACEHOLDER_CLASS} />
                      )
                    }
                  />
                );
              })}
            </SettingsSection>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
