import { useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactElement } from 'react';
import {
  FlashList,
  FlashListRef,
  type FlashListProps as BaseFlashListProps,
} from '@shopify/flash-list';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { appVisualTokens } from '../visual/foundation';

type CardComponentProps<ItemT> = {
  item: ItemT;
  index: number;
  itemHeight?: number;
};

const ITEM_SPACING = 14;

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
  maintainVisibleContentPosition,
}: PaginatedCardListProps<ItemT>) {
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
    <View style={styles.container}>
      <FlashList
        ref={listRef}
        data={data}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        renderItem={({ item, index }: { item: ItemT; index: number }) => {
          const resolvedItemHeight = getItemHeight?.(item, index) ?? itemHeight;

          return (
            <View
              style={[
                styles.itemShell,
                { height: resolvedItemHeight + itemSpacing, paddingBottom: itemSpacing },
              ]}
            >
              <CardComponent item={item} index={index} itemHeight={resolvedItemHeight} />
            </View>
          );
        }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={pagination.endReachedThreshold ?? 0.35}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
          handleScroll(event.nativeEvent.contentOffset.y)
        }
        onLayout={(event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onRefresh={() => void onRefresh()}
        refreshing={refreshing}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={
          pagination.loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator size="small" color={appVisualTokens.colors.brandBlue} />
              <Text style={styles.footerText}>加载中...</Text>
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
        contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
        drawDistance={(itemHeight + itemSpacing) * 4}
        maintainVisibleContentPosition={maintainVisibleContentPosition}
      />

      {showScrollTop && showScrollTopButton ? (
        <Pressable
          style={[styles.scrollTopButton, { bottom: scrollTopBottomInset }]}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        >
          <Text style={styles.scrollTopButtonText}>↑</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 18,
  },
  itemShell: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 18,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: appVisualTokens.colors.textSecondary,
  },
  footerSpacer: {
    height: 12,
  },
  scrollTopButton: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: appVisualTokens.colors.surface,
    borderWidth: 1,
    borderColor: appVisualTokens.colors.line,
  },
  scrollTopButtonText: {
    marginTop: -2,
    color: appVisualTokens.colors.brandBlue,
    fontSize: 20,
    fontWeight: '800',
  },
});
