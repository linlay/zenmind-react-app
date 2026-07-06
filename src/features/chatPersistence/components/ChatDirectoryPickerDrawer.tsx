import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../../../shared/icons/AppIcon';
import { type TFunction, useT } from '../../../shared/i18n';
import { AgentAvatar } from '../../../shared/visual/AgentAvatar';
import { useAppTheme } from '../../../shared/visual/AppThemeProvider';
import { cn } from '../../../shared/visual/className';
import { appVisualTokens } from '../../../shared/visual/foundation';
import { appHairlineStyles } from '../../../shared/visual/hairline';
import type { ChatDirectoryItem } from '../types';

const DIRECTORY_PICKER_ROW_HEIGHT = 72;
const DIRECTORY_PICKER_DRAW_DISTANCE = DIRECTORY_PICKER_ROW_HEIGHT * 8;
const DIRECTORY_PICKER_ENTER_OFFSET = -72;
const DIRECTORY_PICKER_TOP_PADDING_MIN = appVisualTokens.spacing.xs;
const DIRECTORY_PICKER_BOTTOM_PADDING_MIN = appVisualTokens.spacing.md;
const MODAL_ROOT_CLASS = 'flex-1';
const DRAWER_OVERLAY_CLASS = 'absolute inset-0';
const BACKDROP_CLASS = 'absolute inset-0 bg-app-overlay';
const PANEL_CLASS = 'absolute bottom-0 left-0 top-0 w-[86%] max-w-[390px] border-app-line bg-app-surface';
const HEADER_CLASS = 'min-h-[58px] flex-row items-center gap-app-sm border-app-line px-app-md pb-app-sm';
const HEADER_TEXT_CLASS = 'min-w-0 flex-1';
const TITLE_CLASS = 'text-app-title-sm font-bold text-app-primary';
const SUBTITLE_CLASS = 'mt-[2px] text-[12px] font-semibold leading-[17px] text-app-secondary';
const CLOSE_BUTTON_CLASS = 'h-[34px] w-[34px] items-center justify-center rounded-app-pill active:bg-app-surface-muted';
const ERROR_TEXT_CLASS = 'px-app-md py-app-sm text-[12px] leading-[17px] text-app-danger';
const LIST_FRAME_CLASS = 'flex-1 px-app-sm';
const STATE_BLOCK_CLASS = 'flex-1 items-center justify-center';
const EMPTY_TEXT_CLASS = 'px-app-sm py-app-lg text-[14px] leading-[21px] text-app-secondary';
const DIRECTORY_ROW_CLASS =
  'h-[72px] flex-row items-center gap-app-md border-app-line px-app-sm active:bg-app-surface-muted';
const DIRECTORY_ROW_OPENING_CLASS = 'opacity-[0.74]';
const DIRECTORY_ROW_TEXT_CLASS = 'min-w-0 flex-1';
const DIRECTORY_ROW_TITLE_CLASS = 'text-app-body font-bold text-app-primary';
const DIRECTORY_ROW_SUBTITLE_CLASS = 'mt-[2px] text-app-footnote font-medium text-app-secondary';
const DIRECTORY_ROW_ACTION_CLASS = 'h-[34px] w-[34px] items-center justify-center';
const FOOTER_CLASS = 'min-h-[42px] items-center justify-center';
const FOOTER_TEXT_CLASS = 'py-app-md text-center text-app-footnote font-semibold text-app-tertiary';

type ChatDirectoryPickerDrawerProps = {
  visible: boolean;
  items: ChatDirectoryItem[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  errorText: string;
  hasMore: boolean;
  openingItemId: string | null;
  onClose: () => void;
  onLoadMore: () => void;
  onSelectItem: (item: ChatDirectoryItem) => void;
};

type DirectoryPickerRowProps = {
  item: ChatDirectoryItem;
  opening: boolean;
  onSelect: (item: ChatDirectoryItem) => void;
};

function formatDirectoryPickerCount(loaded: number, total: number, t: TFunction) {
  const safeLoaded = Math.max(0, Math.trunc(Number(loaded) || 0));
  const safeTotal = Math.max(safeLoaded, Math.trunc(Number(total) || 0));

  return safeTotal > safeLoaded
    ? t('common.loadedOfTotal', { loaded: safeLoaded, total: safeTotal })
    : t('common.countItems', { count: safeTotal });
}

function getDirectoryKindLabel(kind: ChatDirectoryItem['kind'], t: TFunction) {
  return kind === 'team' ? t('directoryPicker.kind.team') : t('directoryPicker.kind.agent');
}

function getDirectoryItemType(item: ChatDirectoryItem) {
  return item.kind;
}

const DirectoryPickerRow = memo(function DirectoryPickerRow({ item, opening, onSelect }: DirectoryPickerRowProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const handlePress = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);
  const subtitle = `${getDirectoryKindLabel(item.kind, t)} · ${item.subtitle || t('directoryPicker.canStart')}`;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={opening}
      onPress={handlePress}
      className={cn(DIRECTORY_ROW_CLASS, opening ? DIRECTORY_ROW_OPENING_CLASS : null)}
      style={appHairlineStyles.borderBottom}
    >
      <AgentAvatar
        type={item.kind}
        icon={item.icon}
        fallbackSeed={item.agentKey || item.teamId || item.title}
        size={42}
      />
      <View className={DIRECTORY_ROW_TEXT_CLASS}>
        <Text numberOfLines={1} className={DIRECTORY_ROW_TITLE_CLASS}>
          {item.title}
        </Text>
        <Text numberOfLines={1} className={DIRECTORY_ROW_SUBTITLE_CLASS}>
          {subtitle}
        </Text>
      </View>
      <View className={DIRECTORY_ROW_ACTION_CLASS}>
        {opening ? (
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
        ) : (
          <AppIcon usage="directoryPicker.startConversation" />
        )}
      </View>
    </Pressable>
  );
});

export const ChatDirectoryPickerDrawer = memo(function ChatDirectoryPickerDrawer({
  visible,
  items,
  total,
  loading,
  loadingMore,
  errorText,
  hasMore,
  openingItemId,
  onClose,
  onLoadMore,
  onSelectItem
}: ChatDirectoryPickerDrawerProps) {
  const t = useT();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const translateX = useRef(new Animated.Value(DIRECTORY_PICKER_ENTER_OFFSET)).current;
  const countLabel = useMemo(() => formatDirectoryPickerCount(items.length, total, t), [items.length, total, t]);
  const renderItem = useCallback(
    ({ item }: { item: ChatDirectoryItem }) => (
      <DirectoryPickerRow item={item} opening={openingItemId === item.id} onSelect={onSelectItem} />
    ),
    [onSelectItem, openingItemId]
  );
  const keyExtractor = useCallback((item: ChatDirectoryItem) => item.id, []);
  const handleEndReached = useCallback(() => {
    if (!hasMore || loading || loadingMore) {
      return;
    }

    onLoadMore();
  }, [hasMore, loading, loadingMore, onLoadMore]);
  const footer = useMemo(() => {
    if (loading || items.length <= 0) {
      return null;
    }

    if (loadingMore) {
      return (
        <View className={FOOTER_CLASS}>
          <ActivityIndicator size="small" color={theme.colors.brandBlue} />
        </View>
      );
    }

    return <Text className={FOOTER_TEXT_CLASS}>{countLabel}</Text>;
  }, [countLabel, items.length, loading, loadingMore, theme.colors.brandBlue]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    translateX.setValue(DIRECTORY_PICKER_ENTER_OFFSET);
    Animated.spring(translateX, {
      toValue: 0,
      damping: 20,
      stiffness: 230,
      mass: 0.9,
      useNativeDriver: true
    }).start();
  }, [translateX, visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View className={MODAL_ROOT_CLASS}>
        <View pointerEvents="box-none" className={DRAWER_OVERLAY_CLASS}>
          <Pressable className={BACKDROP_CLASS} onPress={onClose} />
          <Animated.View
            className={PANEL_CLASS}
            style={[
              appHairlineStyles.borderRight,
              {
                paddingTop: Math.max(insets.top, DIRECTORY_PICKER_TOP_PADDING_MIN),
                paddingBottom: Math.max(insets.bottom, DIRECTORY_PICKER_BOTTOM_PADDING_MIN),
                transform: [{ translateX }]
              }
            ]}
          >
            <View className={HEADER_CLASS} style={appHairlineStyles.borderBottom}>
              <View className={HEADER_TEXT_CLASS}>
                <Text numberOfLines={1} className={TITLE_CLASS}>
                  {t('directoryPicker.title')}
                </Text>
                <Text numberOfLines={1} className={SUBTITLE_CLASS}>
                  {t('directoryPicker.subtitle', { count: countLabel })}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={t('directoryPicker.close')}
                accessibilityRole="button"
                onPress={onClose}
                className={CLOSE_BUTTON_CLASS}
              >
                <AppIcon usage="directoryPicker.close" />
              </Pressable>
            </View>

            {errorText ? <Text className={ERROR_TEXT_CLASS}>{errorText}</Text> : null}

            <View className={LIST_FRAME_CLASS}>
              {loading ? (
                <View className={STATE_BLOCK_CLASS}>
                  <ActivityIndicator size="small" color={theme.colors.brandBlue} />
                </View>
              ) : (
                <FlashList
                  data={items}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  getItemType={getDirectoryItemType}
                  drawDistance={DIRECTORY_PICKER_DRAW_DISTANCE}
                  onEndReached={handleEndReached}
                  onEndReachedThreshold={0.45}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={<Text className={EMPTY_TEXT_CLASS}>{t('directoryPicker.empty')}</Text>}
                  ListFooterComponent={footer}
                />
              )}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
});
