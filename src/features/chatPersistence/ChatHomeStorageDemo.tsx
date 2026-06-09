import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaginatedCardList } from '../../shared/components/PaginatedCardList';
import { ScreenHeader } from '../../shared/components/ScreenHeader';
import { AppIcon, type AppIconUsage } from '../../shared/icons/AppIcon';
import { AppIconButton } from '../../shared/icons/AppIconButton';
import { useT } from '../../shared/i18n';
import { AgentAvatar } from '../../shared/visual/AgentAvatar';
import { appVisualTokens, formatConversationTimestamp, formatUnreadCount } from '../../shared/visual/foundation';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import {
  createConversationForDirectoryItem,
  getCollapsedChatDirectorySlice,
  getChatDirectoryCatalogPage,
  getChatDirectorySlice,
  getOrCreateConversationForDirectoryItem,
  prepareChatPersistenceSample,
  setChatDirectoryItemPinned
} from './chatRepository';
import { ChatDirectoryPickerDrawer } from './components/ChatDirectoryPickerDrawer';
import { patchDirectoryListPreviewByConversation, type ChatDirectoryListState } from './chatRealtimeUiState';
import { readChatDirectorySnapshot } from './homeSnapshot';
import { ChatConversationHistoryScope, ChatDirectoryItem, ChatDetailRouteParams } from './types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../app/navigation/types';

const CHAT_PAGE_SIZE = 6;
const DIRECTORY_PICKER_PAGE_SIZE = 18;
const CHAT_ROW_HEIGHT = 84;
const CHAT_HOME_AUTOSCROLL_TO_TOP_THRESHOLD = CHAT_ROW_HEIGHT;
const PIN_FOLD_ROW_HEIGHT = 54;
const PIN_MENU_WIDTH = 176;
const PIN_MENU_ROW_HEIGHT = 58;

function getDirectoryHistoryScope(item: ChatDirectoryItem): ChatConversationHistoryScope | undefined {
  const teamId = item.kind === 'team' ? item.teamId : null;
  const agentKey = teamId ? null : item.agentKey || item.defaultAgentKey;

  if (!agentKey && !teamId) {
    return undefined;
  }

  return {
    agentKey: agentKey || null,
    teamId: teamId || null
  };
}

type ChatRowComponentProps = {
  item: ChatListItem;
  index: number;
  itemHeight?: number;
};

type RowActionAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ChatDirectoryDisplayItem = ChatDirectoryItem & {
  kind: 'agent' | 'team';
  lastMessagePreview: string;
  lastMessageTimeLabel: string;
  unreadLabel: string;
};

type PinnedFoldDisplayItem = {
  kind: 'pinned-fold';
  id: 'pinned-fold-control';
  pinnedCount: number;
  collapsed: boolean;
};

type ChatListItem = ChatDirectoryDisplayItem | PinnedFoldDisplayItem;

function buildDirectoryListState(items: ChatDirectoryItem[], total: number): ChatDirectoryListState {
  const itemsById: Record<string, ChatDirectoryItem> = {};
  const orderedIds: string[] = [];

  items.forEach((item) => {
    itemsById[item.id] = item;
    orderedIds.push(item.id);
  });

  return {
    orderedIds,
    itemsById,
    total
  };
}

function appendDirectoryListState(
  current: ChatDirectoryListState,
  items: ChatDirectoryItem[],
  total: number
): ChatDirectoryListState {
  const itemsById: Record<string, ChatDirectoryItem> = { ...current.itemsById };
  const orderedIds = [...current.orderedIds];

  items.forEach((item) => {
    if (!itemsById[item.id]) {
      orderedIds.push(item.id);
    }
    itemsById[item.id] = item;
  });

  return {
    orderedIds,
    itemsById,
    total
  };
}

const HeaderIconGlyph = memo(function HeaderIconGlyph({ usage }: { usage: AppIconUsage }) {
  return (
    <View style={styles.headerIconGlyph}>
      <AppIcon usage={usage} />
    </View>
  );
});

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
      style={styles.headerIconGlyph}
      pressedStyle={styles.headerIconButtonPressed}
    />
  );
});

const ChatRow = memo(function ChatRow({
  item,
  onPress,
  onLongPress,
  isMenuTarget
}: {
  item: ChatDirectoryDisplayItem;
  onPress: (item: ChatDirectoryItem) => void;
  onLongPress: (item: ChatDirectoryItem, anchor: RowActionAnchor) => void;
  isMenuTarget: boolean;
}) {
  const rowRef = useRef<View>(null);
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);
  const handleLongPress = useCallback(() => {
    rowRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress(item, { x, y, width, height });
    });
  }, [item, onLongPress]);

  return (
    <Pressable
      ref={rowRef}
      accessibilityRole="button"
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [styles.chatRowPressable, pressed && styles.chatRowPressed]}
    >
      <View
        style={[styles.chatRow, item.pinnedAt > 0 && styles.chatRowPinned, isMenuTarget && styles.chatRowMenuTarget]}
      >
        <AgentAvatar type={item.kind} icon={item.icon} fallbackSeed={item.agentKey || item.teamId || item.title} />

        <View style={styles.chatRowMain}>
          <Text numberOfLines={1} style={styles.chatTitle}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={styles.chatSummary}>
            {item.lastMessagePreview}
          </Text>
        </View>

        <View style={styles.chatRowMeta}>
          <Text numberOfLines={1} style={styles.chatTime}>
            {item.lastMessageTimeLabel}
          </Text>
          <View style={styles.chatRowMetaBottom}>
            {item.unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text numberOfLines={1} style={styles.unreadBadgeText}>
                  {item.unreadLabel}
                </Text>
              </View>
            ) : null}
            {item.pinnedAt > 0 ? (
              <View style={styles.pinnedMarker}>
                <AppIcon usage="chatHome.rowPinned" />
              </View>
            ) : null}
            {item.unreadCount <= 0 && item.pinnedAt <= 0 ? <View style={styles.unreadBadgePlaceholder} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
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
      style={({ pressed }) => [styles.pinnedFoldRow, pressed && styles.pinnedFoldRowPressed]}
    >
      <View style={styles.pinnedFoldLeft}>
        <AppIcon usage="chatHome.pinnedFold.leading" />
        <Text numberOfLines={1} style={styles.pinnedFoldText}>
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
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{t('chatHome.empty.title')}</Text>
      <Text style={styles.emptyStateBody}>{t('chatHome.empty.body')}</Text>
    </View>
  );
});

const CHAT_EMPTY_STATE = <ChatEmptyState />;

export function ChatHomeStorageDemo() {
  const t = useT();
  const tabBarHeight = useBottomTabBarHeight();
  const windowDimensions = useWindowDimensions();
  const isFocused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [homeState, setHomeState] = useState<ChatDirectoryListState>(() => buildDirectoryListState([], 0));
  const [directoryPickerState, setDirectoryPickerState] = useState<ChatDirectoryListState>(() =>
    buildDirectoryListState([], 0)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);
  const [directoryPickerLoading, setDirectoryPickerLoading] = useState(false);
  const [directoryPickerLoadingMore, setDirectoryPickerLoadingMore] = useState(false);
  const [directoryPickerErrorText, setDirectoryPickerErrorText] = useState('');
  const [openingPickerItemId, setOpeningPickerItemId] = useState<string | null>(null);
  const [isBootstrapReady, setIsBootstrapReady] = useState(false);
  const [pinActionTarget, setPinActionTarget] = useState<ChatDirectoryItem | null>(null);
  const [pinActionAnchor, setPinActionAnchor] = useState<RowActionAnchor | null>(null);
  const [arePinnedItemsCollapsed, setArePinnedItemsCollapsed] = useState(false);
  const [pinnedTotal, setPinnedTotal] = useState(0);

  const currentPageRef = useRef(1);
  const directoryPickerPageRef = useRef(1);
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
  const directoryPickerItems = useMemo(
    () =>
      directoryPickerState.orderedIds
        .map((id) => directoryPickerState.itemsById[id])
        .filter((item): item is ChatDirectoryItem => Boolean(item)),
    [directoryPickerState.itemsById, directoryPickerState.orderedIds]
  );
  const total = homeState.total;
  const hasMore = items.length < total;
  const directoryPickerTotal = directoryPickerState.total;
  const directoryPickerHasMore = directoryPickerItems.length < directoryPickerTotal;

  useEffect(() => {
    visibleConversationIdsRef.current = new Set(
      items.map((item) => item.latestConversationId).filter((id): id is string => Boolean(id))
    );
  }, [items]);

  const displayItems = useMemo(
    () =>
      items.map<ChatDirectoryDisplayItem>((item) => ({
        ...item,
        lastMessagePreview: item.lastMessageText || t('chatHome.noConversation'),
        lastMessageTimeLabel: formatConversationTimestamp(item.lastMessageAt),
        unreadLabel: item.unreadCount > 0 ? formatUnreadCount(item.unreadCount) : ''
      })),
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

  const handleShowPinMenu = useCallback((item: ChatDirectoryItem, anchor: RowActionAnchor) => {
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
          if (!item.latestConversationId) {
            const result = await getOrCreateConversationForDirectoryItem(item.id);
            if (!result) {
              setErrorText(t('chatHome.error.missingDirectoryTarget'));
              return;
            }

            navigation.navigate('ChatDetail', {
              conversationId: result.conversation.conversationId,
              conversationSubtitle: item.subtitle,
              initialConversation: result.conversation,
              ...(result.historyScope ? { historyScope: result.historyScope } : {}),
              skipInitialReconcile: result.isLocalDraft
            });
            return;
          }

          const historyScope = getDirectoryHistoryScope(item);
          const params: ChatDetailRouteParams = {
            conversationId: item.latestConversationId,
            conversationSubtitle: item.subtitle,
            ...(historyScope ? { historyScope } : {}),
            initialConversation: {
              conversationId: item.latestConversationId,
              title: item.title,
              lastMessageText: item.lastMessageText,
              lastMessageAt: item.lastMessageAt,
              unreadCount: item.unreadCount,
              read: undefined,
              lastMessageStatus: 'sent',
              pinnedAt: item.pinnedAt
            }
          };
          navigation.navigate('ChatDetail', params);
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

  const loadDirectoryPickerPage = useCallback(async (pageCount: number) => {
    const directory = await getChatDirectoryCatalogPage(pageCount, DIRECTORY_PICKER_PAGE_SIZE);

    setDirectoryPickerState((current) =>
      directory.page <= 1
        ? buildDirectoryListState(directory.items, directory.total)
        : appendDirectoryListState(current, directory.items, directory.total)
    );
    directoryPickerPageRef.current = directory.page;
  }, []);

  const handleTogglePinnedCollapse = useCallback(() => {
    const nextCollapsed = !arePinnedItemsCollapsed;
    setArePinnedItemsCollapsed(nextCollapsed);
    setErrorText('');
    void loadVisibleSlice(1, nextCollapsed);
  }, [arePinnedItemsCollapsed, loadVisibleSlice]);

  const handleOpenDirectoryPicker = useCallback(() => {
    if (isDirectoryPickerOpen || directoryPickerLoading) {
      return;
    }

    setIsDirectoryPickerOpen(true);
    setDirectoryPickerErrorText('');
    setDirectoryPickerLoading(true);
    directoryPickerPageRef.current = 1;

    const openDirectoryPicker = async () => {
      try {
        await loadDirectoryPickerPage(1);
      } catch (error) {
        setDirectoryPickerErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        setDirectoryPickerLoading(false);
      }
    };

    void openDirectoryPicker();
  }, [directoryPickerLoading, isDirectoryPickerOpen, loadDirectoryPickerPage]);

  const handleCloseDirectoryPicker = useCallback(() => {
    if (openingPickerItemId) {
      return;
    }

    setIsDirectoryPickerOpen(false);
  }, [openingPickerItemId]);

  const handleLoadMoreDirectoryPicker = useCallback(async () => {
    if (!directoryPickerHasMore || directoryPickerLoading || directoryPickerLoadingMore) {
      return;
    }

    setDirectoryPickerLoadingMore(true);
    setDirectoryPickerErrorText('');

    try {
      await loadDirectoryPickerPage(directoryPickerPageRef.current + 1);
    } catch (error) {
      setDirectoryPickerErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setDirectoryPickerLoadingMore(false);
    }
  }, [directoryPickerHasMore, directoryPickerLoading, directoryPickerLoadingMore, loadDirectoryPickerPage]);

  const handleDirectoryPickerItemPress = useCallback(
    (item: ChatDirectoryItem) => {
      if (openingDirectoryItemIdRef.current) {
        return;
      }

      const openNewDirectoryConversation = async () => {
        openingDirectoryItemIdRef.current = item.id;
        setOpeningPickerItemId(item.id);
        setDirectoryPickerErrorText('');
        setErrorText('');

        try {
          const result = await createConversationForDirectoryItem(item.id);
          if (!result) {
            const message = t('chatHome.error.missingDirectoryTarget');
            setDirectoryPickerErrorText(message);
            setErrorText(message);
            return;
          }

          setIsDirectoryPickerOpen(false);
          navigation.navigate('ChatDetail', {
            conversationId: result.conversation.conversationId,
            conversationSubtitle: item.subtitle,
            initialConversation: result.conversation,
            ...(result.historyScope ? { historyScope: result.historyScope } : {}),
            skipInitialReconcile: result.isLocalDraft
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setDirectoryPickerErrorText(message);
          setErrorText(message);
        } finally {
          openingDirectoryItemIdRef.current = null;
          setOpeningPickerItemId(null);
        }
      };

      void openNewDirectoryConversation();
    },
    [navigation, t]
  );

  const CardComponent = useCallback(
    ({ item }: ChatRowComponentProps) =>
      item.kind === 'pinned-fold' ? (
        <PinnedFoldRow item={item} onPress={handleTogglePinnedCollapse} />
      ) : (
        <ChatRow
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

    const bootstrap = async () => {
      try {
        const snapshot = readChatDirectorySnapshot();
        if (mounted && snapshot?.items.length) {
          setHomeState(buildDirectoryListState(snapshot.items, snapshot.items.length));
          setPinnedTotal(snapshot.items.filter((item) => item.pinnedAt > 0).length);
        }

        await prepareChatPersistenceSample();
        if (!mounted) {
          return;
        }

        await loadVisibleSlice(1);
        if (!mounted) {
          return;
        }

        setIsBootstrapReady(true);
      } catch (error) {
        if (mounted) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [loadVisibleSlice]);

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
        <HeaderIconGlyph key="search" usage="chatHome.search" />,
        <HeaderIconGlyph key="add" usage="chatHome.add" />
      ] as const,
    []
  );
  const listBottomPadding = tabBarHeight + appVisualTokens.spacing.xxl;
  const pinActionLabel = pinActionTarget?.pinnedAt ? t('chatHome.pin.cancel') : t('chatHome.pin.set');
  const pinMenuActionCount = pinActionTarget?.unreadCount ? 2 : 1;
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
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <ScreenHeader title={t('chatHome.title')} leftActions={headerLeftActions} rightActions={headerRightActions} />
      </SafeAreaView>

      <View style={styles.listShell}>
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
          itemHeight={CHAT_ROW_HEIGHT}
          ListHeaderComponent={
            errorText ? (
              <View style={styles.feedbackCard}>
                <Text style={styles.errorText}>{t('chatHome.error.readFailed', { message: errorText })}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={CHAT_EMPTY_STATE}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
          showScrollTopButton={false}
          itemSpacing={0}
          maintainVisibleContentPosition={{
            autoscrollToTopThreshold: CHAT_HOME_AUTOSCROLL_TO_TOP_THRESHOLD
          }}
          getItemHeight={(item) => (item.kind === 'pinned-fold' ? PIN_FOLD_ROW_HEIGHT : CHAT_ROW_HEIGHT)}
          getItemType={(item) => item.kind}
        />
      </View>

      <ChatDirectoryPickerDrawer
        visible={isDirectoryPickerOpen}
        items={directoryPickerItems}
        total={directoryPickerTotal}
        loading={directoryPickerLoading}
        loadingMore={directoryPickerLoadingMore}
        errorText={directoryPickerErrorText}
        hasMore={directoryPickerHasMore}
        openingItemId={openingPickerItemId}
        onClose={handleCloseDirectoryPicker}
        onLoadMore={handleLoadMoreDirectoryPicker}
        onSelectItem={handleDirectoryPickerItemPress}
      />

      <Modal visible={Boolean(pinActionTarget)} transparent animationType="fade" onRequestClose={handleClosePinMenu}>
        <Pressable style={styles.menuBackdrop} onPress={handleClosePinMenu}>
          <Pressable style={[styles.pinMenu, pinMenuPosition]} onPress={(event) => event.stopPropagation()}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.pinMenuAction, pressed && styles.pinMenuActionPressed]}
              onPress={() => void handleTogglePin()}
            >
              <AppIcon usage="chatHome.pinMenu.toggle" />
              <Text style={styles.pinMenuActionText}>{pinActionLabel}</Text>
            </Pressable>
            {pinActionTarget?.unreadCount ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.pinMenuAction, pressed && styles.pinMenuActionPressed]}
                onPress={() => void handleMarkScopeRead()}
              >
                <AppIcon usage="chatHome.pinMenu.markRead" />
                <Text style={styles.pinMenuActionText}>{t('chatHome.markAllRead')}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.surface
  },
  headerSafeArea: {
    backgroundColor: appVisualTokens.colors.surface
  },
  listShell: {
    flex: 1,
    backgroundColor: appVisualTokens.colors.surface
  },
  listContent: {
    paddingTop: appVisualTokens.spacing.xs
  },
  feedbackCard: {
    marginHorizontal: appVisualTokens.spacing.xl,
    marginBottom: appVisualTokens.spacing.sm,
    backgroundColor: '#fff6f6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#f0d6d6',
    paddingHorizontal: appVisualTokens.spacing.lg,
    paddingVertical: appVisualTokens.spacing.sm
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: appVisualTokens.colors.danger
  },
  headerIconGlyph: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerIconButtonPressed: {
    opacity: 0.68
  },
  chatRowPressable: {
    flex: 1
  },
  chatRowPressed: {
    opacity: 0.72
  },
  chatRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: appVisualTokens.spacing.xl,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.surface
  },
  chatRowPinned: {
    backgroundColor: appVisualTokens.colors.surfaceMuted
  },
  chatRowMenuTarget: {
    backgroundColor: appVisualTokens.colors.backgroundMuted
  },
  chatRowMain: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  chatTitle: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: appVisualTokens.colors.textPrimary
  },
  chatSummary: {
    fontSize: 13,
    lineHeight: 18,
    color: appVisualTokens.colors.textTertiary
  },
  chatRowMeta: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 46,
    minWidth: 74,
    gap: 4
  },
  chatRowMetaBottom: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6
  },
  chatTime: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '400',
    color: appVisualTokens.colors.textTertiary
  },
  unreadBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: appVisualTokens.radii.pill,
    backgroundColor: appVisualTokens.colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: appVisualTokens.colors.surface
  },
  unreadBadgePlaceholder: {
    width: 26,
    height: 26
  },
  pinnedMarker: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinnedFoldRow: {
    flex: 1,
    minHeight: PIN_FOLD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: appVisualTokens.spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.line,
    backgroundColor: appVisualTokens.colors.surfaceMuted
  },
  pinnedFoldRowPressed: {
    backgroundColor: appVisualTokens.colors.backgroundMuted
  },
  pinnedFoldLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.lg
  },
  pinnedFoldText: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    color: appVisualTokens.colors.textSecondary
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    marginHorizontal: appVisualTokens.spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.line
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: appVisualTokens.colors.textPrimary
  },
  emptyStateBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: appVisualTokens.colors.textSecondary,
    textAlign: 'center'
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  pinMenu: {
    position: 'absolute',
    width: PIN_MENU_WIDTH,
    borderRadius: appVisualTokens.radii.lg,
    backgroundColor: appVisualTokens.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appVisualTokens.colors.line,
    overflow: 'hidden',
    shadowColor: appVisualTokens.colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8
  },
  pinMenuAction: {
    minHeight: PIN_MENU_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: appVisualTokens.spacing.md,
    paddingHorizontal: appVisualTokens.spacing.xl
  },
  pinMenuActionPressed: {
    backgroundColor: appVisualTokens.colors.surfaceMuted
  },
  pinMenuActionText: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
    color: appVisualTokens.colors.textPrimary
  }
});
