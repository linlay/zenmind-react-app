import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../app/navigation/types';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon } from '../../shared/icons/AppIcon';
import { useT, type TFunction } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens } from '../../shared/visual/foundation';
import { appHairlineStyles } from '../../shared/visual/hairline';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
import type { WebAppItem, WebAppsGatewayCapabilities, WebAppsGatewayErrorCode } from './types';
import { useWebAppsRuntime } from './WebAppsRuntimeProvider';

const ROW_HEIGHT = 64;
const DRAW_DISTANCE = ROW_HEIGHT * 8;
const SCREEN_CLASS = 'flex-1 bg-app-surface';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const LIST_CLASS = 'flex-1 bg-app-surface';
const OPEN_CARD_CLASS =
  'mx-app-xl mb-app-md mt-app-lg min-h-[72px] flex-row items-center gap-app-md rounded-app-lg border border-app-line bg-app-surface-muted px-app-lg active:opacity-[0.68]';
const DISABLED_CLASS = 'opacity-[0.42]';
const OPEN_CARD_ICON_CLASS = 'h-10 w-10 items-center justify-center rounded-app-md bg-app-brand-blue-soft';
const OPEN_CARD_TEXT_CLASS = 'min-w-0 flex-1';
const OPEN_CARD_TITLE_CLASS = 'text-app-body font-bold text-app-primary';
const OPEN_CARD_META_CLASS = 'mt-[2px] text-app-footnote text-app-secondary';
const SECTION_LABEL_CLASS = 'px-app-xl pb-app-xs pt-app-sm text-app-caption font-bold text-app-secondary';
const ROW_CLASS = 'h-16 flex-row items-center gap-app-md border-app-line px-app-xl';
const ROW_NAME_CLASS = 'min-w-0 flex-1 text-app-body font-semibold text-app-primary';
const ROW_ACTION_CLASS = 'h-9 min-w-[76px] items-center justify-center rounded-app-pill px-app-md';
const ROW_START_CLASS = 'bg-app-action';
const ROW_PAUSE_CLASS = 'border border-app-line-strong bg-app-surface';
const ROW_ACTION_TEXT_CLASS = 'text-app-footnote font-bold';
const ROW_START_TEXT_CLASS = 'text-app-on-action';
const ROW_PAUSE_TEXT_CLASS = 'text-app-primary';
const STATE_CLASS = 'items-center justify-center px-app-xl py-[56px]';
const STATE_TITLE_CLASS = 'text-center text-app-title-sm font-bold text-app-primary';
const STATE_BODY_CLASS = 'mt-app-sm text-center text-app-body-sm text-app-secondary';
const UNPAIRED_STATE_CLASS = 'flex-1 items-center justify-center px-app-xxl pb-[96px]';
const UNPAIRED_ICON_CLASS =
  'mb-app-lg h-[72px] w-[72px] items-center justify-center rounded-app-pill bg-app-brand-blue-soft';
const PAIR_BUTTON_CLASS =
  'mt-app-xl min-h-[48px] min-w-[168px] items-center justify-center rounded-app-lg bg-app-action px-app-xl active:opacity-[0.76]';
const PAIR_BUTTON_TEXT_CLASS = 'text-app-body font-extrabold text-app-on-action';
const NOTICE_CLASS = 'mx-app-xl mb-app-sm rounded-app-md bg-app-brand-blue-soft px-app-md py-app-sm';
const NOTICE_TEXT_CLASS = 'text-app-footnote text-app-secondary';
const ERROR_CLASS = 'mx-app-xl mb-app-sm rounded-app-md bg-app-danger-soft px-app-md py-app-sm';
const ERROR_TEXT_CLASS = 'text-app-footnote text-app-danger';

type WebAppRowProps = {
  item: WebAppItem;
  capabilities: WebAppsGatewayCapabilities;
};

function getGatewayErrorMessage(t: TFunction, code: WebAppsGatewayErrorCode): string {
  switch (code) {
    case 'desktop-required':
      return t('webApps.error.desktop-required');
    case 'desktop-unavailable':
      return t('webApps.error.desktop-unavailable');
    case 'device-mismatch':
      return t('webApps.error.device-mismatch');
    case 'invalid-protocol':
      return t('webApps.error.invalid-protocol');
  }
}

const WebAppRow = memo(function WebAppRow({ item, capabilities }: WebAppRowProps) {
  const t = useT();
  const running = item.runtimeStatus === 'running';
  const processing = item.runtimeStatus === 'starting' || item.publishStatus === 'publishing';
  const controlEnabled = running ? capabilities.pause : capabilities.activate;
  const label = processing
    ? item.runtimeStatus === 'starting'
      ? t('webApps.action.starting')
      : t('webApps.action.publishing')
    : running
      ? t('webApps.action.pause')
      : t('webApps.action.start');

  return (
    <View className={ROW_CLASS} style={appHairlineStyles.borderBottom}>
      <Text numberOfLines={1} className={ROW_NAME_CLASS}>
        {item.name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !controlEnabled || processing, busy: processing }}
        disabled={!controlEnabled || processing}
        className={cn(
          ROW_ACTION_CLASS,
          running ? ROW_PAUSE_CLASS : ROW_START_CLASS,
          !controlEnabled || processing ? DISABLED_CLASS : null
        )}
      >
        {processing ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text className={cn(ROW_ACTION_TEXT_CLASS, running ? ROW_PAUSE_TEXT_CLASS : ROW_START_TEXT_CLASS)}>
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
});

export function WebAppsScreen() {
  const t = useT();
  const { theme } = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tabBarHeight = useAppTabBarHeight();
  const {
    items,
    enabled,
    openableApps,
    capabilities,
    connectionStatus,
    initialized,
    loading,
    refreshing,
    error,
    refresh,
    prepareDetail
  } = useWebAppsRuntime();
  const canOpenContainer = connectionStatus === 'connected' && openableApps.length > 0;
  const controlsAvailable = capabilities.activate || capabilities.pause;
  const listContentStyle = useMemo<ViewStyle>(
    () => ({ paddingBottom: tabBarHeight + appVisualTokens.spacing.xl }),
    [tabBarHeight]
  );

  const openDetail = useCallback(
    (preferredAppId?: string) => {
      const appId = prepareDetail(preferredAppId);
      if (appId) {
        navigation.navigate('WebAppDetail', { initialAppId: appId });
      }
    },
    [navigation, prepareDetail]
  );
  const renderItem = useCallback(
    ({ item }: { item: WebAppItem }) => <WebAppRow item={item} capabilities={capabilities} />,
    [capabilities]
  );
  const keyExtractor = useCallback((item: WebAppItem) => item.id, []);
  const listHeader = useMemo(
    () => (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canOpenContainer }}
          disabled={!canOpenContainer}
          onPress={() => openDetail()}
          className={cn(OPEN_CARD_CLASS, !canOpenContainer ? DISABLED_CLASS : null)}
        >
          <View className={OPEN_CARD_ICON_CLASS}>
            <AppIcon usage="webApps.openContainer" />
          </View>
          <View className={OPEN_CARD_TEXT_CLASS}>
            <Text className={OPEN_CARD_TITLE_CLASS}>{t('webApps.openContainer')}</Text>
            <Text className={OPEN_CARD_META_CLASS}>
              {canOpenContainer ? t('webApps.runningCount', { count: openableApps.length }) : t('webApps.noRunning')}
            </Text>
          </View>
          <AppIcon usage="webApps.navigate" />
        </Pressable>
        {!controlsAvailable ? (
          <View className={NOTICE_CLASS}>
            <Text className={NOTICE_TEXT_CLASS}>{t('webApps.controlsUnavailable')}</Text>
          </View>
        ) : null}
        {initialized && connectionStatus !== 'connected' && !error ? (
          <View className={NOTICE_CLASS}>
            <Text className={NOTICE_TEXT_CLASS}>{t('webApps.desktopDisconnected')}</Text>
          </View>
        ) : null}
        {error ? (
          <View className={ERROR_CLASS}>
            <Text className={ERROR_TEXT_CLASS}>{getGatewayErrorMessage(t, error.code)}</Text>
          </View>
        ) : null}
        <Text className={SECTION_LABEL_CLASS}>{t('webApps.listTitle')}</Text>
      </>
    ),
    [canOpenContainer, connectionStatus, controlsAvailable, error, initialized, openDetail, openableApps.length, t]
  );
  const emptyState = loading ? (
    <View className={STATE_CLASS}>
      <ActivityIndicator color={theme.colors.brandBlue} />
      <Text className={STATE_BODY_CLASS}>{t('webApps.loading')}</Text>
    </View>
  ) : (
    <View className={STATE_CLASS}>
      <Text className={STATE_TITLE_CLASS}>{t('webApps.emptyTitle')}</Text>
      <Text className={STATE_BODY_CLASS}>{t('webApps.emptyBody')}</Text>
    </View>
  );

  if (!enabled) {
    return (
      <View className={SCREEN_CLASS}>
        <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
          <ScreenHeader title={t('webApps.title')} />
        </SafeAreaView>
        <View className={UNPAIRED_STATE_CLASS}>
          <View className={UNPAIRED_ICON_CLASS}>
            <AppIcon usage="webApps.pairRequired" />
          </View>
          <Text className={STATE_TITLE_CLASS}>{t('webApps.unpairedTitle')}</Text>
          <Text className={STATE_BODY_CLASS}>{t('webApps.unpairedBody')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Login')}
            className={PAIR_BUTTON_CLASS}
          >
            <Text className={PAIR_BUTTON_TEXT_CLASS}>{t('webApps.pairAction')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader title={t('webApps.title')} />
      </SafeAreaView>
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        drawDistance={DRAW_DISTANCE}
        refreshing={refreshing}
        onRefresh={refresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        className={LIST_CLASS}
      />
    </View>
  );
}
