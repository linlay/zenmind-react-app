import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon } from '../../shared/icons/AppIcon';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { cn } from '../../shared/visual/className';
import { appVisualTokens } from '../../shared/visual/foundation';
import { appHairlineStyles } from '../../shared/visual/hairline';
import type { OpenableWebApp } from './types';
import { isOpenableWebApp, normalizeWebAppUrl } from './webAppsRuntimeModel';
import type { WebAppsRuntimeHostProps } from './WebAppsRuntimeHost.types';

const HOST_VISIBLE_Z_INDEX = 1200;
const HOST_HIDDEN_Z_INDEX = -1;
const HEADER_HEIGHT = 56;
const SELECTOR_ROW_HEIGHT = 52;
const SELECTOR_MAX_HEIGHT = SELECTOR_ROW_HEIGHT * 6;
const SELECTOR_HORIZONTAL_MARGIN = appVisualTokens.spacing.md * 2;
const SCREEN_CLASS = 'absolute inset-0 bg-app-surface';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const HEADER_BUTTON_CLASS = 'h-10 w-10 items-center justify-center rounded-app-pill active:opacity-[0.62]';
const CONTENT_CLASS = 'flex-1 overflow-hidden bg-app-surface';
const WEBVIEW_LAYER_CLASS = 'absolute inset-0 bg-app-surface';
const STATE_OVERLAY_CLASS = 'absolute inset-0 items-center justify-center gap-app-md bg-app-surface';
const STATE_TEXT_CLASS = 'px-app-xl text-center text-app-body text-app-secondary';
const RETRY_BUTTON_CLASS =
  'min-h-10 items-center justify-center rounded-app-pill bg-app-brand-blue-soft px-app-xl active:opacity-[0.62]';
const RETRY_TEXT_CLASS = 'text-app-body-sm font-bold text-app-brand-blue';
const SELECTOR_OVERLAY_CLASS = 'absolute inset-0 z-[1300]';
const SELECTOR_BACKDROP_CLASS = 'absolute inset-0 bg-transparent';
const SELECTOR_PANEL_CLASS =
  'absolute right-app-md overflow-hidden rounded-app-lg border border-app-line bg-app-surface';
const SELECTOR_ROW_CLASS =
  'h-[52px] flex-row items-center gap-app-sm border-app-line px-app-md active:bg-app-surface-muted';
const SELECTOR_ROW_SELECTED_CLASS = 'bg-app-brand-blue-soft';
const SELECTOR_ROW_TEXT_CLASS = 'min-w-0 flex-1 text-app-body-sm font-semibold text-app-primary';
const SELECTOR_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.16,
  shadowRadius: 18,
  elevation: 16
} satisfies ViewStyle;

function isAllowedWebAppNavigation(url: string): boolean {
  return Boolean(normalizeWebAppUrl(url));
}

export const WebAppsRuntimeHost = memo(function WebAppsRuntimeHost({
  visible,
  selectorVisible,
  activeApp,
  openableApps,
  residents,
  connectionStatus,
  onBack,
  onOpenSelector,
  onCloseSelector,
  onSelectApp,
  onResidentLoadState,
  onResidentTerminated,
  onResidentNavigation,
  onRetryResident
}: WebAppsRuntimeHostProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const activeResident = residents.find((resident) => resident.appId === activeApp?.id) ?? null;
  const activeUnavailable = Boolean(
    activeResident && (connectionStatus !== 'connected' || !isOpenableWebApp(activeApp ?? undefined))
  );
  const canOpenSelector = connectionStatus === 'connected' && openableApps.length > 0;
  const selectorHeight = Math.min(openableApps.length * SELECTOR_ROW_HEIGHT, SELECTOR_MAX_HEIGHT);
  const webViewStyle = useMemo(() => ({ flex: 1, backgroundColor: theme.colors.surface }), [theme.colors.surface]);
  const hostStyle = useMemo(
    () => [
      {
        elevation: visible ? HOST_VISIBLE_Z_INDEX : 0,
        opacity: visible ? 1 : 0,
        zIndex: visible ? HOST_VISIBLE_Z_INDEX : HOST_HIDDEN_Z_INDEX
      }
    ],
    [visible]
  );
  const selectorPanelStyle = useMemo(
    () => [
      SELECTOR_ELEVATION_STYLE,
      {
        height: selectorHeight,
        top: insets.top + HEADER_HEIGHT,
        width: Math.min(280, windowWidth - SELECTOR_HORIZONTAL_MARGIN)
      }
    ],
    [insets.top, selectorHeight, windowWidth]
  );
  const renderSelectorItem = useCallback(
    ({ item }: { item: OpenableWebApp }) => {
      const selected = item.id === activeApp?.id;
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => onSelectApp(item.id)}
          className={cn(SELECTOR_ROW_CLASS, selected ? SELECTOR_ROW_SELECTED_CLASS : null)}
          style={appHairlineStyles.borderBottom}
        >
          <Text numberOfLines={1} className={SELECTOR_ROW_TEXT_CLASS}>
            {item.name}
          </Text>
          {selected ? <AppIcon usage="webApps.selected" /> : null}
        </Pressable>
      );
    },
    [activeApp?.id, onSelectApp]
  );
  const keyExtractor = useCallback((item: OpenableWebApp) => item.id, []);

  return (
    <View
      collapsable={false}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      className={SCREEN_CLASS}
      style={hostStyle}
    >
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader
          title={activeApp?.name || t('webApps.detail.loadingTitle')}
          leftActions={[
            <AppIconButton
              key="back"
              usage="webApps.back"
              accessibilityLabel={t('webApps.detail.back')}
              hitSlop={10}
              onPress={onBack}
              className={HEADER_BUTTON_CLASS}
            />
          ]}
          rightActions={[
            <AppIconButton
              key="selector"
              usage="webApps.openSelector"
              accessibilityLabel={t('webApps.detail.openSelector')}
              accessibilityState={{ disabled: !canOpenSelector }}
              disabled={!canOpenSelector}
              hitSlop={10}
              onPress={onOpenSelector}
              className={cn(HEADER_BUTTON_CLASS, !canOpenSelector ? 'opacity-[0.42]' : null)}
            />
          ]}
        />
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} className={CONTENT_CLASS}>
        {residents.map((resident) => {
          const active = resident.appId === activeApp?.id;
          return (
            <View
              key={resident.appId}
              pointerEvents={active ? 'auto' : 'none'}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              className={WEBVIEW_LAYER_CLASS}
              style={{ opacity: active ? 1 : 0 }}
            >
              <WebView
                key={`${resident.appId}:${resident.generation}`}
                source={{ uri: resident.url }}
                originWhitelist={['http://*', 'https://*']}
                javaScriptEnabled
                domStorageEnabled
                cacheEnabled
                incognito={false}
                mixedContentMode="never"
                sharedCookiesEnabled={false}
                thirdPartyCookiesEnabled={false}
                setSupportMultipleWindows={false}
                allowsLinkPreview={false}
                allowsBackForwardNavigationGestures
                onLoadStart={() => onResidentLoadState(resident.appId, resident.generation, 'loading')}
                onLoad={() => onResidentLoadState(resident.appId, resident.generation, 'ready')}
                onError={() => onResidentLoadState(resident.appId, resident.generation, 'error')}
                onHttpError={() => onResidentLoadState(resident.appId, resident.generation, 'error')}
                onContentProcessDidTerminate={() => onResidentTerminated(resident.appId, resident.generation)}
                onRenderProcessGone={() => onResidentTerminated(resident.appId, resident.generation)}
                onNavigationStateChange={(navigation: WebViewNavigation) =>
                  onResidentNavigation(resident.appId, navigation.url)
                }
                onShouldStartLoadWithRequest={(navigation) => isAllowedWebAppNavigation(navigation.url)}
                style={webViewStyle}
              />
            </View>
          );
        })}

        {!activeUnavailable && (!activeResident || activeResident.loadState === 'loading') ? (
          <View pointerEvents="none" className={STATE_OVERLAY_CLASS}>
            <ActivityIndicator color={theme.colors.brandBlue} />
            <Text className={STATE_TEXT_CLASS}>{t('webApps.detail.loading')}</Text>
          </View>
        ) : null}

        {!activeUnavailable && activeResident?.loadState === 'error' ? (
          <View className={STATE_OVERLAY_CLASS}>
            <Text className={STATE_TEXT_CLASS}>{t('webApps.detail.loadFailed')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onRetryResident(activeResident.appId)}
              className={RETRY_BUTTON_CLASS}
            >
              <Text className={RETRY_TEXT_CLASS}>{t('webApps.retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {activeUnavailable ? (
          <View pointerEvents="none" className={STATE_OVERLAY_CLASS}>
            <Text className={STATE_TEXT_CLASS}>{t('webApps.detail.connectionUnavailable')}</Text>
          </View>
        ) : null}
      </SafeAreaView>

      {selectorVisible ? (
        <View className={SELECTOR_OVERLAY_CLASS}>
          <Pressable className={SELECTOR_BACKDROP_CLASS} onPress={onCloseSelector} />
          <View className={SELECTOR_PANEL_CLASS} style={selectorPanelStyle}>
            <FlashList
              data={openableApps}
              renderItem={renderSelectorItem}
              keyExtractor={keyExtractor}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
});
