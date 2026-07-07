import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useT } from '../../shared/i18n';
import { buildChatDetailRouteParams } from './chatDetailNavigation';
import { prewarmAgentDetailForEmptyConversation } from './chatDetailPrefetch';
import { createDirectoryPickerLoadGate } from './chatDirectoryPickerOverlayState';
import {
  createConversationForDirectoryItem,
  getChatDirectoryCatalogPage,
} from './chatRepository';
import {
  appendDirectoryListState,
  buildDirectoryListState,
  type ChatDirectoryListState,
} from './chatRealtimeUiState';
import { ChatDirectoryPickerDrawer } from './components/ChatDirectoryPickerDrawer';
import type { ChatDetailRouteParams, ChatDirectoryItem } from './types';

const DIRECTORY_PICKER_PAGE_SIZE = 18;
const SCREEN_CLASS = 'flex-1';

type BeforeRemoveEvent = {
  preventDefault: () => void;
};

type ChatDirectoryPickerOverlayNavigation = {
  addListener: (eventName: 'beforeRemove', listener: (event: BeforeRemoveEvent) => void) => () => void;
  goBack: () => void;
  replace: (screen: 'ChatDetail', params: ChatDetailRouteParams) => void;
};

type ChatDirectoryPickerOverlayScreenProps = {
  navigation: ChatDirectoryPickerOverlayNavigation;
};

export function ChatDirectoryPickerOverlayScreen({ navigation }: ChatDirectoryPickerOverlayScreenProps) {
  const t = useT();
  const [drawerVisible, setDrawerVisible] = useState(true);
  const [directoryState, setDirectoryState] = useState<ChatDirectoryListState>(() => buildDirectoryListState([], 0));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const pageRef = useRef(1);
  const mountedRef = useRef(true);
  const closingRequestedRef = useRef(false);
  const openingItemIdRef = useRef<string | null>(null);
  const pendingDetailParamsRef = useRef<ChatDetailRouteParams | null>(null);
  const loadMoreGate = useMemo(() => createDirectoryPickerLoadGate(), []);
  const items = useMemo(
    () =>
      directoryState.orderedIds
        .map((id) => directoryState.itemsById[id])
        .filter((item): item is ChatDirectoryItem => Boolean(item)),
    [directoryState.itemsById, directoryState.orderedIds]
  );
  const total = directoryState.total;
  const hasMore = items.length < total;

  const loadPage = useCallback(async (pageCount: number) => {
    const directory = await getChatDirectoryCatalogPage(pageCount, DIRECTORY_PICKER_PAGE_SIZE);
    if (!mountedRef.current) {
      return;
    }

    setDirectoryState((current) =>
      directory.page <= 1
        ? buildDirectoryListState(directory.items, directory.total)
        : appendDirectoryListState(current, directory.items, directory.total)
    );
    pageRef.current = directory.page;
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const loadInitialPage = async () => {
      setLoading(true);
      setErrorText('');
      loadMoreGate.reset();

      try {
        await loadPage(1);
      } catch (error) {
        if (mountedRef.current) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    };

    void loadInitialPage();
  }, [loadMoreGate, loadPage]);

  const closeDrawer = useCallback(() => {
    if (openingItemIdRef.current || closingRequestedRef.current || pendingDetailParamsRef.current) {
      return;
    }

    closingRequestedRef.current = true;
    setDrawerVisible(false);
  }, []);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!drawerVisible || closingRequestedRef.current || pendingDetailParamsRef.current) {
          return;
        }

        event.preventDefault();
        closeDrawer();
      }),
    [closeDrawer, drawerVisible, navigation]
  );

  const handleDrawerDismissed = useCallback(() => {
    const detailParams = pendingDetailParamsRef.current;
    if (detailParams) {
      pendingDetailParamsRef.current = null;
      navigation.replace('ChatDetail', detailParams);
      return;
    }

    navigation.goBack();
  }, [navigation]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || !loadMoreGate.tryAcquire()) {
      return;
    }

    setLoadingMore(true);
    setErrorText('');

    try {
      await loadPage(pageRef.current + 1);
    } catch (error) {
      if (mountedRef.current) {
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    } finally {
      loadMoreGate.release();
      if (mountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [hasMore, loadMoreGate, loadPage, loading, loadingMore]);

  const handleSelectItem = useCallback(
    (item: ChatDirectoryItem) => {
      if (openingItemIdRef.current || closingRequestedRef.current || pendingDetailParamsRef.current) {
        return;
      }

      const openConversation = async () => {
        openingItemIdRef.current = item.id;
        setOpeningItemId(item.id);
        setErrorText('');

        try {
          const result = await createConversationForDirectoryItem(item.id);
          if (!result) {
            setErrorText(t('chatHome.error.missingDirectoryTarget'));
            return;
          }

          prewarmAgentDetailForEmptyConversation(item, result);
          pendingDetailParamsRef.current = buildChatDetailRouteParams(item, result);
          setDrawerVisible(false);
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : String(error));
        } finally {
          openingItemIdRef.current = null;
          setOpeningItemId(null);
        }
      };

      void openConversation();
    },
    [t]
  );

  return (
    <View className={SCREEN_CLASS}>
      <ChatDirectoryPickerDrawer
        visible={drawerVisible}
        items={items}
        total={total}
        loading={loading}
        loadingMore={loadingMore}
        errorText={errorText}
        hasMore={hasMore}
        openingItemId={openingItemId}
        onClose={closeDrawer}
        onDismissed={handleDrawerDismissed}
        onLoadMore={handleLoadMore}
        onSelectItem={handleSelectItem}
      />
    </View>
  );
}
