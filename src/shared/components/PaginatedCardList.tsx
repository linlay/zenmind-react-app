import { useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { FlashList, FlashListRef, type FlashListProps as BaseFlashListProps } from '@shopify/flash-list';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle
} from 'react-native';

import { useAppTheme } from '../visual/AppThemeProvider';
import { useT } from '../i18n';

type CardComponentProps<ItemT> = {
  item: ItemT;
  index: number;
  itemHeight?: number;
};

const ITEM_SPACING = 14;
const CONTAINER_CLASS = 'flex-1';
const ITEM_SHELL_CLASS = 'w-full';
const FOOTER_CLASS = 'flex-row items-center justify-center gap-[10px] pb-[18px] pt-app-sm';
const FOOTER_TEXT_CLASS = 'text-[14px] font-semibold text-app-secondary';
const FOOTER_SPACER_CLASS = 'h-3';
const SCROLL_TOP_BUTTON_CLASS =
  'absolute right-4 h-11 w-11 items-center justify-center rounded-app-pill border border-app-line bg-app-surface';
const SCROLL_TOP_BUTTON_TEXT_CLASS = '-mt-0.5 text-[20px] font-extrabold text-app-brand-blue';
const CONTENT_CONTAINER_STYLE = { paddingBottom: 18 } satisfies ViewStyle;

export type ListPaginationConfig = {
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  endReachedThreshold?: number;
};

export type PaginatedCardListProps<ItemT> = {
  data: ItemT[];
  CardComponent: ComponentType<CardComponentProps<ItemT>>;
  keyExtractor: (item: ItemT, index: number) => string;
  pagination: ListPaginationConfig;
  refreshing?: boolean;
  onRefresh: () => void | Promise<void>;
  itemHeight?: number;
  ListHeaderComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showScrollTopButton?: boolean;
  scrollTopBottomInset?: number;
  itemSpacing?: number;
  getItemHeight?: (item: ItemT, index: number) => number | undefined;
  getItemType?: (item: ItemT, index: number) => string | number | undefined;
  maintainVisibleContentPosition?: BaseFlashListProps<ItemT>['maintainVisibleContentPosition'];
};

export function PaginatedCardList<ItemT>({
  data,
  CardComponent,
  keyExtractor,
  pagination,
  refreshing = false,
  onRefresh,
  itemHeight = 160,
  ListHeaderComponent = null,
  ListEmptyComponent = null,
  contentContainerStyle,
  showScrollTopButton = true,
  scrollTopBottomInset = 20,
  itemSpacing = ITEM_SPACING,
  getItemHeight,
  getItemType,
  maintainVisibleContentPosition
}: PaginatedCardListProps<ItemT>) {
  const t = useT();
  const { theme } = useAppTheme();
  const listRef = useRef<FlashListRef<ItemT>>(null);
  const loadMoreLockedRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    if (!pagination.loadingMore) {
      loadMoreLockedRef.current = false;
    }
  }, [pagination.loadingMore, data.length]);

  const handleEndReached = () => {
    if (!pagination.hasMore || pagination.loadingMore || refreshing || !pagination.onLoadMore) {
      return;
    }

    if (loadMoreLockedRef.current) {
      return;
    }

    loadMoreLockedRef.current = true;
    void pagination.onLoadMore();
  };

  const handleScroll = (offsetY: number) => {
    const shouldShow = viewportHeight > 0 && offsetY > viewportHeight;
    if (shouldShow !== showScrollTop) {
      setShowScrollTop(shouldShow);
    }
  };

  const headerComponent = ListHeaderComponent ? <View>{ListHeaderComponent}</View> : null;

  return (
    <View className={CONTAINER_CLASS}>
      <FlashList
        ref={listRef}
        data={data}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={({ item, index }: { item: ItemT; index: number }) => {
          const resolvedItemHeight = getItemHeight?.(item, index) ?? itemHeight;

          return (
            <View
              className={ITEM_SHELL_CLASS}
              style={{ height: resolvedItemHeight + itemSpacing, paddingBottom: itemSpacing }}
            >
              <CardComponent item={item} index={index} itemHeight={resolvedItemHeight} />
            </View>
          );
        }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={pagination.endReachedThreshold ?? 0.35}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => handleScroll(event.nativeEvent.contentOffset.y)}
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onRefresh={() => void onRefresh()}
        refreshing={refreshing}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={ListEmptyComponent as BaseFlashListProps<ItemT>['ListEmptyComponent']}
        ListFooterComponent={
          pagination.loadingMore ? (
            <View className={FOOTER_CLASS}>
              <ActivityIndicator size="small" color={theme.colors.brandBlue} />
              <Text className={FOOTER_TEXT_CLASS}>{t('common.loading')}</Text>
            </View>
          ) : (
            <View className={FOOTER_SPACER_CLASS} />
          )
        }
        contentContainerStyle={[CONTENT_CONTAINER_STYLE, contentContainerStyle]}
        drawDistance={(itemHeight + itemSpacing) * 4}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
      />

      {showScrollTop && showScrollTopButton ? (
        <Pressable
          className={SCROLL_TOP_BUTTON_CLASS}
          style={{ bottom: scrollTopBottomInset }}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        >
          <Text className={SCROLL_TOP_BUTTON_TEXT_CLASS}>↑</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
