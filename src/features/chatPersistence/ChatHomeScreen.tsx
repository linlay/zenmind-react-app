import { useIsFocused, useNavigation } from '@react-navigation/native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaginatedCardList } from '../../shared/components/PaginatedCardList';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { useT } from '../../shared/i18n';
import { useAppTheme } from '../../shared/visual/AppThemeProvider';
import { appVisualTokens } from '../../shared/visual/foundation';
import { appHairlineStyles } from '../../shared/visual/hairline';
import { useAppTabBarHeight } from '../../shared/visual/useAppTabBarHeight';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import { buildChatDetailRouteParams } from './chatDetailNavigation';
import { prewarmAgentDetailForEmptyConversation } from './chatDetailPrefetch';
import {
  createConversationForDirectoryItem,
  getCollapsedChatDirectorySlice,
  getChatDirectorySlice,
  prewarmChatHomeDirectory,
  resolveDirectoryItemConversationOpenTarget,
  setChatDirectoryItemPinned
} from './chatRepository';
import {
  CHAT_DIRECTORY_ROW_HEIGHT,
  ChatDirectoryRow,
  createChatDirectoryDisplayItem,
  type ChatDirectoryDisplayItem,
  type ChatDirectoryRowActionAnchor,
} from './components/ChatDirectoryRow';
import { ChatDirectorySearchOverlay } from './components/ChatDirectorySearchOverlay';
import {
  buildDirectoryListState,
  patchDirectoryListPreviewByConversation,
  type ChatDirectoryListState,
} from './chatRealtimeUiState';
import { readChatDirectorySnapshot } from './homeSnapshot';
import type { ChatDirectoryItem } from './types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/types';

const CHAT_PAGE_SIZE = 6;
const CHAT_HOME_AUTOSCROLL_TO_TOP_THRESHOLD = CHAT_DIRECTORY_ROW_HEIGHT;
const PIN_FOLD_ROW_HEIGHT = 54;
const PIN_MENU_ROW_HEIGHT = 58;
const SCREEN_CLASS = 'flex-1 bg-app-surface';
const HEADER_SAFE_AREA_CLASS = 'bg-app-surface';
const HEADER_ICON_BUTTON_CLASS = 'h-10 w-10 items-center justify-center active:opacity-[0.68]';
const HEADER_WITHOUT_DIVIDER_CLASS = 'h-14 bg-app-surface';
const LIST_SHELL_CLASS = 'flex-1 bg-app-surface';
const FEEDBACK_CARD_CLASS =
  'mx-app-xl mb-app-sm border-app-danger-line bg-app-danger-soft px-app-lg py-app-sm';
const ERROR_TEXT_CLASS = 'text-[13px] leading-[20px] text-app-danger';
const PINNED_FOLD_ROW_CLASS =
  'min-h-[54px] flex-1 flex-row items-center justify-between border-app-line bg-app-surface-muted px-app-xl active:bg-app-background-muted';
const PINNED_FOLD_LEFT_CLASS = 'min-w-0 flex-1 flex-row items-center gap-app-lg';
const PINNED_FOLD_TEXT_CLASS = 'shrink text-[15px] leading-[20px] text-app-secondary';
const EMPTY_STATE_CLASS = 'mx-app-xl items-center px-app-xxl py-[48px]';
const EMPTY_STATE_TITLE_CLASS = 'text-app-title font-bold text-app-primary';
const EMPTY_STATE_BODY_CLASS = 'mt-app-sm text-center text-[14px] leading-[21px] text-app-secondary';
const MENU_BACKDROP_CLASS = 'flex-1 bg-transparent';
const PIN_MENU_CLASS = 'absolute w-[176px] overflow-hidden rounded-app-lg border border-app-line bg-app-surface';
const PIN_MENU_ACTION_CLASS =
  'min-h-[58px] flex-row items-center gap-app-md px-app-xl active:bg-app-surface-muted';
const PIN_MENU_ACTION_TEXT_CLASS = 'shrink text-app-title-sm font-medium text-app-primary';
const CHAT_LIST_CONTENT_STYLE = { paddingTop: appVisualTokens.spacing.xs } satisfies ViewStyle;
const PIN_MENU_ELEVATION_STYLE = {
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.14,
  shadowRadius: 18,
  elevation: 8
} satisfies ViewStyle;

type ChatRowComponentProps = {
  item: ChatListItem;
  index: number;
  itemHeight?: number;
};

type PinnedFoldDisplayItem = {
  kind: 'pinned-fold';
  id: 'pinned-fold-control';
  pinnedCount: number;
  collapsed: boolean;
};

type ChatListItem = ChatDirectoryDisplayItem | PinnedFoldDisplayItem;

const HeaderIconButton = memo(function HeaderIconButton({
  usage,
  accessibilityLabel,
  onPress
}: {
  usage: AppIconUsage;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <AppIconButton
      usage={usage}
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      onPress={onPress}
      className={HEADER_ICON_BUTTON_CLASS}
    />
  );
});

const PinnedFoldRow = memo(function PinnedFoldRow({
  item,
  onPress
}: {
  item: PinnedFoldDisplayItem;
  onPress: () => void;
}) {
  const t = useT();
  const label = item.collapsed
    ? t('chatHome.pinned.expand', { count: item.pinnedCount })
    : t('chatHome.pinned.collapse');
  const chevronUsage: AppIconUsage = item.collapsed ? 'chatHome.pinnedFold.expand' : 'chatHome.pinnedFold.collapse';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={PINNED_FOLD_ROW_CLASS}
      style={appHairlineStyles.borderTopBottom}
    >
      <View className={PINNED_FOLD_LEFT_CLASS}>
        <AppIcon usage="chatHome.pinnedFold.leading" />
        <Text numberOfLines={1} className={PINNED_FOLD_TEXT_CLASS}>
          {label}
        </Text>
      </View>
      <AppIcon usage={chevronUsage} />
    </Pressable>
  );
});

const ChatEmptyState = memo(function ChatEmptyState() {
  const t = useT();

  return (
    <View className={EMPTY_STATE_CLASS}>
      <Text className={EMPTY_STATE_TITLE_CLASS}>{t('chatHome.empty.title')}</Text>
      <Text className={EMPTY_STATE_BODY_CLASS}>{t('chatHome.empty.body')}</Text>
    </View>
  );
});

const CHAT_EMPTY_STATE = <ChatEmptyState />;

export function ChatHomeScreen() {
  const t = useT();
  const { theme } = useAppTheme();
  const tabBarHeight = useAppTabBarHeight();
  const windowDimensions = useWindowDimensions();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [homeState, setHomeState] = useState<ChatDirectoryListState>(() => buildDirectoryListState([], 0));
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBootstrapReady, setIsBootstrapReady] = useState(false);
  const [pinActionTarget, setPinActionTarget] = useState<ChatDirectoryItem | null>(null);
  const [pinActionAnchor, setPinActionAnchor] = useState<ChatDirectoryRowActionAnchor | null>(null);
  const [arePinnedItemsCollapsed, setArePinnedItemsCollapsed] = useState(false);
  const [pinnedTotal, setPinnedTotal] = useState(0);

  const currentPageRef = useRef(1);
  const previousFocusRef = useRef(isFocused);
  const visibleConversationIdsRef = useRef<Set<string>>(new Set());
  const openingDirectoryItemIdRef = useRef<string | null>(null);
  const items = useMemo(
    () =>
      homeState.orderedIds
        .map((id) => homeState.itemsById[id])
        .filter((item): item is ChatDirectoryItem => Boolean(item)),
    [homeState.itemsById, homeState.orderedIds]
  );
  const total = homeState.total;
  const hasMore = items.length < total;
  const firstVisibleAgent = useMemo(() => items.find((item) => item.kind === 'agent') ?? null, [items]);

  useEffect(() => {
    visibleConversationIdsRef.current = new Set(
      items.map((item) => item.latestConversationId).filter((id): id is string => Boolean(id))
    );
  }, [items]);

  const displayItems = useMemo(
    () => items.map((item) => createChatDirectoryDisplayItem(item, t('chatHome.noConversation'))),
    [items, t]
  );
  const listItems = useMemo<ChatListItem[]>(() => {
    if (pinnedTotal <= 0) {
      return displayItems;
    }

    const pinnedItems = displayItems.filter((item) => item.pinnedAt > 0);
    const unpinnedItems = displayItems.filter((item) => item.pinnedAt <= 0);
    const foldItem: PinnedFoldDisplayItem = {
      kind: 'pinned-fold',
      id: 'pinned-fold-control',
      pinnedCount: pinnedTotal,
      collapsed: arePinnedItemsCollapsed
    };

    return arePinnedItemsCollapsed ? [foldItem, ...unpinnedItems] : [...pinnedItems, foldItem, ...unpinnedItems];
  }, [arePinnedItemsCollapsed, displayItems, pinnedTotal]);

  const handleShowPinMenu = useCallback((item: ChatDirectoryItem, anchor: ChatDirectoryRowActionAnchor) => {
    setPinActionTarget(item);
    setPinActionAnchor(anchor);
  }, []);

  const handleItemPress = useCallback(
    (item: ChatDirectoryItem) => {
      if (openingDirectoryItemIdRef.current) {
        return;
      }

      const openDirectoryItem = async () => {
        openingDirectoryItemIdRef.current = item.id;
        setErrorText('');

        try {
          const result = await resolveDirectoryItemConversationOpenTarget(item.id);
          if (!result) {
            setErrorText(t('chatHome.error.missingDirectoryTarget'));
            return;
          }

          prewarmAgentDetailForEmptyConversation(item, result);
          navigation.navigate('ChatDetail', buildChatDetailRouteParams(item, result));
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : String(error));
        } finally {
          openingDirectoryItemIdRef.current = null;
        }
      };

      void openDirectoryItem();
    },
    [navigation, t]
  );

  const loadVisibleSlice = useCallback(async (pageCount: number, collapsed: boolean = false) => {
    const limit = Math.max(1, pageCount) * CHAT_PAGE_SIZE;
    const home = collapsed ? await getCollapsedChatDirectorySlice(limit) : await getChatDirectorySlice(limit);

    setHomeState(buildDirectoryListState(home.items, home.total));
    setPinnedTotal(home.pinnedTotal);
    currentPageRef.current = pageCount;
  }, []);

  const handleTogglePinnedCollapse = useCallback(() => {
    const nextCollapsed = !arePinnedItemsCollapsed;
    setArePinnedItemsCollapsed(nextCollapsed);
    setErrorText('');
    void loadVisibleSlice(1, nextCollapsed);
  }, [arePinnedItemsCollapsed, loadVisibleSlice]);

  const handleOpenDirectoryPicker = useCallback(() => {
    navigation.navigate('ChatDirectoryPickerOverlay');
  }, [navigation]);

  const handleOpenSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const handleSearchItemPress = useCallback(
    (item: ChatDirectoryItem) => {
      setIsSearchOpen(false);
      handleItemPress(item);
    },
    [handleItemPress]
  );

  const openNewConversationForDirectoryItem = useCallback(
    async (item: ChatDirectoryItem) => {
      if (openingDirectoryItemIdRef.current) {
        return;
      }

      openingDirectoryItemIdRef.current = item.id;
      setErrorText('');

      try {
        const result = await createConversationForDirectoryItem(item.id);
        if (!result) {
          setErrorText(t('chatHome.error.missingDirectoryTarget'));
          return;
        }

        prewarmAgentDetailForEmptyConversation(item, result);
        navigation.navigate('ChatDetail', buildChatDetailRouteParams(item, result));
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        openingDirectoryItemIdRef.current = null;
      }
    },
    [navigation, t]
  );

  const handleAddConversationPress = useCallback(() => {
    if (!firstVisibleAgent) {
      handleOpenDirectoryPicker();
      return;
    }

    void openNewConversationForDirectoryItem(firstVisibleAgent);
  }, [firstVisibleAgent, handleOpenDirectoryPicker, openNewConversationForDirectoryItem]);

  const CardComponent = useCallback(
    ({ item }: ChatRowComponentProps) =>
      item.kind === 'pinned-fold' ? (
        <PinnedFoldRow item={item} onPress={handleTogglePinnedCollapse} />
      ) : (
        <ChatDirectoryRow
          item={item}
          onPress={handleItemPress}
          onLongPress={handleShowPinMenu}
          isMenuTarget={pinActionTarget?.id === item.id}
        />
      ),
    [handleItemPress, handleShowPinMenu, handleTogglePinnedCollapse, pinActionTarget?.id]
  );

  useEffect(() => {
    let mounted = true;
    let interactionTask: { cancel: () => void } | null = null;
    let hasSnapshot = false;

    try {
      const snapshot = readChatDirectorySnapshot();
      hasSnapshot = Boolean(snapshot?.items.length);
      if (snapshot?.items.length) {
        setHomeState(buildDirectoryListState(snapshot.items, snapshot.items.length));
        setPinnedTotal(snapshot.items.filter((item) => item.pinnedAt > 0).length);
      }
    } catch {
      hasSnapshot = false;
    }

    const refreshFromStore = async () => {
      try {
        const home = await prewarmChatHomeDirectory(CHAT_PAGE_SIZE);
        if (!mounted) {
          return;
        }

        if (home.items.length > 0 || home.total > 0 || !hasSnapshot) {
          setHomeState(buildDirectoryListState(home.items, home.total));
          setPinnedTotal(home.pinnedTotal);
        }
        currentPageRef.current = 1;

        setIsBootstrapReady(true);
      } catch (error) {
        if (mounted) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      }
    };

    interactionTask = InteractionManager.runAfterInteractions(() => {
      void refreshFromStore();
    });

    return () => {
      mounted = false;
      interactionTask?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!isFocused || !isBootstrapReady) {
      return;
    }

    const unsubscribe = chatSyncService.subscribe((event) => {
      if (event.type === 'connection.status') {
        return;
      }

      if (event.type === 'home.directory.replace') {
        void loadVisibleSlice(currentPageRef.current, arePinnedItemsCollapsed);
        return;
      }

      if (event.type === 'home.item.remove') {
        void loadVisibleSlice(currentPageRef.current, arePinnedItemsCollapsed);
        return;
      }

      if (
        event.type === 'home.item.patch' &&
        !event.patch.directoryProjectionChanged &&
        visibleConversationIdsRef.current.has(event.patch.conversationId)
      ) {
        setHomeState((current) => patchDirectoryListPreviewByConversation(current, event.patch));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [arePinnedItemsCollapsed, isBootstrapReady, isFocused, loadVisibleSlice]);

  useEffect(() => {
    const wasFocused = previousFocusRef.current;
    previousFocusRef.current = isFocused;

    if (!isFocused || wasFocused || !isBootstrapReady) {
      return;
    }

    setErrorText('');
    void loadVisibleSlice(currentPageRef.current, arePinnedItemsCollapsed);
  }, [arePinnedItemsCollapsed, isBootstrapReady, isFocused, loadVisibleSlice]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setErrorText('');

    try {
      await chatSyncService.refreshHome('manual_refresh');
      await loadVisibleSlice(1, arePinnedItemsCollapsed);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setErrorText('');

    try {
      await loadVisibleSlice(currentPageRef.current + 1, arePinnedItemsCollapsed);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClosePinMenu = useCallback(() => {
    setPinActionTarget(null);
    setPinActionAnchor(null);
  }, []);

  const handleTogglePin = async () => {
    const target = pinActionTarget;
    if (!target) {
      return;
    }

    setPinActionTarget(null);
    setPinActionAnchor(null);
    setErrorText('');

    try {
      await setChatDirectoryItemPinned(target.id, target.pinnedAt <= 0);
      await loadVisibleSlice(currentPageRef.current, arePinnedItemsCollapsed);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };

  const handleMarkScopeRead = async () => {
    const target = pinActionTarget;
    if (!target || target.unreadCount <= 0) {
      return;
    }

    setPinActionTarget(null);
    setPinActionAnchor(null);
    setErrorText('');

    try {
      await chatSyncService.markScopeRead({
        agentKey: target.agentKey,
        teamId: target.teamId
      });
      await loadVisibleSlice(currentPageRef.current, arePinnedItemsCollapsed);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };

  const headerLeftActions = useMemo(
    () =>
      [
        <HeaderIconButton
          key="directory-picker"
          usage="chatHome.openDirectory"
          accessibilityLabel={t('chatHome.openDirectory')}
          onPress={handleOpenDirectoryPicker}
        />
      ] as const,
    [handleOpenDirectoryPicker, t]
  );

  const headerRightActions = useMemo(
    () =>
      [
        <HeaderIconButton
          key="search"
          usage="chatHome.search"
          accessibilityLabel={t('chatHome.search.open')}
          onPress={handleOpenSearch}
        />,
        <HeaderIconButton
          key="add"
          usage="chatHome.add"
          accessibilityLabel={t('chatHome.add')}
          onPress={handleAddConversationPress}
        />
      ] as const,
    [handleAddConversationPress, handleOpenSearch, t]
  );
  const listBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const listContentStyle = useMemo<StyleProp<ViewStyle>>(
    () => [CHAT_LIST_CONTENT_STYLE, { paddingBottom: listBottomPadding }],
    [listBottomPadding]
  );
  const isListEmpty = listItems.length === 0;
  const pinActionLabel = pinActionTarget?.pinnedAt ? t('chatHome.pin.cancel') : t('chatHome.pin.set');
  const pinMenuActionCount = pinActionTarget?.unreadCount ? 2 : 1;
  const pinMenuShadowColorStyle = useMemo<ViewStyle>(
    () => ({ shadowColor: theme.colors.shadow }),
    [theme.colors.shadow]
  );
  const pinMenuPosition = useMemo(() => {
    const bottomLimit =
      windowDimensions.height - tabBarHeight - PIN_MENU_ROW_HEIGHT * pinMenuActionCount - appVisualTokens.spacing.xl;
    const preferredTop = pinActionAnchor
      ? pinActionAnchor.y + Math.min(28, pinActionAnchor.height * 0.42)
      : appVisualTokens.spacing.xxl;
    const top = Math.max(
      appVisualTokens.spacing.xl,
      Math.min(preferredTop, Math.max(appVisualTokens.spacing.xl, bottomLimit))
    );

    return {
      top,
      right: appVisualTokens.spacing.xl
    };
  }, [pinActionAnchor, pinMenuActionCount, tabBarHeight, windowDimensions.height]);

  return (
    <View className={SCREEN_CLASS}>
      <SafeAreaView edges={['top']} className={HEADER_SAFE_AREA_CLASS}>
        <ScreenHeader
          title={t('chatHome.title')}
          leftActions={headerLeftActions}
          rightActions={headerRightActions}
          className={isListEmpty ? HEADER_WITHOUT_DIVIDER_CLASS : undefined}
        />
      </SafeAreaView>

      <View className={LIST_SHELL_CLASS}>
        <PaginatedCardList
          data={listItems}
          CardComponent={CardComponent}
          keyExtractor={(item) => item.id}
          pagination={{
            hasMore,
            loadingMore,
            onLoadMore: handleLoadMore
          }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          itemHeight={CHAT_DIRECTORY_ROW_HEIGHT}
          ListHeaderComponent={
            errorText ? (
              <View className={FEEDBACK_CARD_CLASS} style={appHairlineStyles.borderTopBottom}>
                <Text className={ERROR_TEXT_CLASS}>{t('chatHome.error.readFailed', { message: errorText })}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={CHAT_EMPTY_STATE}
          contentContainerStyle={listContentStyle}
          showScrollTopButton={false}
          itemSpacing={0}
          maintainVisibleContentPosition={{
            autoscrollToTopThreshold: CHAT_HOME_AUTOSCROLL_TO_TOP_THRESHOLD
          }}
          getItemHeight={(item) => (item.kind === 'pinned-fold' ? PIN_FOLD_ROW_HEIGHT : CHAT_DIRECTORY_ROW_HEIGHT)}
          getItemType={(item) => item.kind}
        />
      </View>

      <ChatDirectorySearchOverlay
        visible={isSearchOpen}
        onClose={handleCloseSearch}
        onSelectItem={handleSearchItemPress}
      />

      <Modal visible={Boolean(pinActionTarget)} transparent animationType="fade" onRequestClose={handleClosePinMenu}>
        <Pressable className={MENU_BACKDROP_CLASS} onPress={handleClosePinMenu}>
          <Pressable
            className={PIN_MENU_CLASS}
            style={[PIN_MENU_ELEVATION_STYLE, pinMenuShadowColorStyle, pinMenuPosition]}
            onPress={(event) => event.stopPropagation()}
          >
            <Pressable
              accessibilityRole="button"
              className={PIN_MENU_ACTION_CLASS}
              onPress={() => void handleTogglePin()}
            >
              <AppIcon usage="chatHome.pinMenu.toggle" />
              <Text className={PIN_MENU_ACTION_TEXT_CLASS}>{pinActionLabel}</Text>
            </Pressable>
            {pinActionTarget?.unreadCount ? (
              <Pressable
                accessibilityRole="button"
                className={PIN_MENU_ACTION_CLASS}
                onPress={() => void handleMarkScopeRead()}
              >
                <AppIcon usage="chatHome.pinMenu.markRead" />
                <Text className={PIN_MENU_ACTION_TEXT_CLASS}>{t('chatHome.markAllRead')}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
