import { getChatCacheScopeId, subscribeChatCacheScope } from './cacheScope';
import { AccountSourceSheet } from './components/AccountSourceSheet';
import type { AccountDevice } from '../../core/api/contracts/deviceLink';
import { isActiveDesktopOffline, readActiveDesktopId, subscribeActiveDesktop } from '../../core/auth/activeDesktop';
import { useAccountAuth } from '../../core/auth/useAccountAuth';
import { activateAccountDesktopSource, refreshAccountDesktopDirectory } from './accountDesktopSource';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { useT } from '../../shared/i18n';
import { buildChatDetailRouteParams } from './chatDetailNavigation';
import { prewarmAgentDetailForEmptyConversation } from './chatDetailPrefetch';
import { chatSyncService } from '../chatRealtime/chatSyncService';
import { getActiveChatSource } from './chatSourceRuntime';
import { createDirectoryPickerLoadGate, getDirectoryPickerStatus } from './chatDirectoryPickerOverlayState';
import { createConversationForDirectoryItem, getChatDirectoryCatalogPage } from './chatRepository';
import { appendDirectoryListState, buildDirectoryListState, type ChatDirectoryListState } from './chatRealtimeUiState';
import { ChatDirectoryPickerDrawer } from './components/ChatDirectoryPickerDrawer';
import type { ChatDetailRouteParams, ChatDirectoryItem } from './types';

const DIRECTORY_PICKER_PAGE_SIZE = 18;
const SCREEN_CLASS = 'flex-1';
const subscribeDirectorySync = (listener: () => void) => chatSyncService.subscribe(() => listener());
const readDirectorySync = () => chatSyncService.getDirectorySyncSnapshot();

type BeforeRemoveEvent = {
  preventDefault: () => void;
};

type ChatDirectoryPickerOverlayNavigation = {
  addListener: (eventName: 'beforeRemove', listener: (event: BeforeRemoveEvent) => void) => () => void;
  goBack: () => void;
  replace: (screen: 'ChatDetail', params: ChatDetailRouteParams) => void;
  navigate: (screen: 'Login', params?: { mode: 'account' | 'cloud' }) => void;
};

type ChatDirectoryPickerOverlayScreenProps = {
  navigation: ChatDirectoryPickerOverlayNavigation;
};

export function ChatDirectoryPickerOverlayScreen({ navigation }: ChatDirectoryPickerOverlayScreenProps) {
  const t = useT();
  const auth = useAccountAuth();
  const accountId = auth.session?.accountId || '';
  const readDesktopId = () => readActiveDesktopId(accountId);
  const selectedId = useSyncExternalStore(subscribeActiveDesktop, readDesktopId, readDesktopId);
  const scopeId = useSyncExternalStore(subscribeChatCacheScope, getChatCacheScopeId, getChatCacheScopeId);
  const directorySync = useSyncExternalStore(subscribeDirectorySync, readDirectorySync, readDirectorySync);
  const offline = useSyncExternalStore(subscribeActiveDesktop, isActiveDesktopOffline, isActiveDesktopOffline);
  const [sourceVisible, setSourceVisible] = useState(false);
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceSwitchingId, setSourceSwitchingId] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState('');
  const deviceRequestRef = useRef<AbortController | null>(null);
  const refreshDevices = useCallback(async () => {
    if (!accountId || deviceRequestRef.current) return;
    const controller = new AbortController();
    deviceRequestRef.current = controller;
    setSourceLoading(true);
    setSourceError('');
    try {
      const result = await refreshAccountDesktopDirectory(controller.signal);
      if (controller.signal.aborted) return;
      setDevices(result.items);
    } catch (error) {
      if (!controller.signal.aborted) setSourceError(error instanceof Error ? error.message : String(error));
    } finally {
      if (deviceRequestRef.current === controller) deviceRequestRef.current = null;
      if (!controller.signal.aborted) setSourceLoading(false);
    }
  }, [accountId]);
  useEffect(() => {
    setDevices([]);
    void refreshDevices();
    return () => {
      deviceRequestRef.current?.abort();
      deviceRequestRef.current = null;
    };
  }, [refreshDevices]);
  const selectSource = async (device: AccountDevice | null) => {
    if (sourceSwitchingId !== null) return;
    setSourceSwitchingId(device?.deviceId ?? '');
    setSourceError('');
    try {
      await activateAccountDesktopSource(accountId, device);
      setSourceVisible(false);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceSwitchingId(null);
    }
  };
  const [drawerVisible, setDrawerVisible] = useState(true);
  const [directoryState, setDirectoryState] = useState<ChatDirectoryListState>(() => buildDirectoryListState([], 0));
  const [reading, setReading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const pageRef = useRef(1);
  const stateScopeRef = useRef(scopeId);
  const directoryRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const closingRequestedRef = useRef(false);
  const openingItemIdRef = useRef<string | null>(null);
  const pendingDetailParamsRef = useRef<ChatDetailRouteParams | null>(null);
  const loadMoreGate = useMemo(() => createDirectoryPickerLoadGate(), []);
  const items = useMemo(
    () =>
      stateScopeRef.current === scopeId
        ? directoryState.orderedIds
            .map((id) => directoryState.itemsById[id])
            .filter((item): item is ChatDirectoryItem => Boolean(item))
        : [],
    [directoryState.itemsById, directoryState.orderedIds, scopeId]
  );
  const total = stateScopeRef.current === scopeId ? directoryState.total : 0;
  const hasSource = scopeId !== 'signed_out' && Boolean(getActiveChatSource());
  const status = getDirectoryPickerStatus({
    hasSource,
    offline,
    reading: reading || stateScopeRef.current !== scopeId,
    hasItems: items.length > 0,
    readFailed: readFailed && stateScopeRef.current === scopeId,
    syncStatus: directorySync.status
  });
  const hasMore = items.length < total;

  const isDirectoryRequestActive = useCallback(
    (requestId: number) =>
      mountedRef.current &&
      !closingRequestedRef.current &&
      !pendingDetailParamsRef.current &&
      directoryRequestIdRef.current === requestId,
    []
  );

  const invalidateDirectoryRequests = useCallback(() => {
    directoryRequestIdRef.current += 1;
    loadMoreGate.reset();
    setReading(false);
    setLoadingMore(false);
  }, [loadMoreGate]);

  const loadPage = useCallback(
    async (pageCount: number, requestId: number, replace = false) => {
      const directory = hasSource
        ? await getChatDirectoryCatalogPage(
            replace ? 1 : pageCount,
            DIRECTORY_PICKER_PAGE_SIZE * (replace ? pageCount : 1)
          )
        : { items: [], total: 0, page: 1 };
      if (!isDirectoryRequestActive(requestId) || getChatCacheScopeId() !== scopeId) {
        return;
      }

      stateScopeRef.current = scopeId;
      setDirectoryState((current) =>
        directory.page <= 1
          ? buildDirectoryListState(directory.items, directory.total)
          : appendDirectoryListState(current, directory.items, directory.total)
      );
      pageRef.current = pageCount;
    },
    [hasSource, scopeId, isDirectoryRequestActive]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reloadDirectory = useCallback(
    async (pageCount: number) => {
      if (closingRequestedRef.current || pendingDetailParamsRef.current) return;
      const requestId = ++directoryRequestIdRef.current;
      setReading(true);
      setLoadingMore(false);
      setReadFailed(false);
      loadMoreGate.reset();
      try {
        await loadPage(pageCount, requestId, true);
      } catch {
        if (isDirectoryRequestActive(requestId)) {
          setReadFailed(true);
        }
      } finally {
        if (isDirectoryRequestActive(requestId)) setReading(false);
      }
    },
    [isDirectoryRequestActive, loadMoreGate, loadPage]
  );

  useEffect(() => {
    pageRef.current = 1;
    stateScopeRef.current = scopeId;
    setDirectoryState(buildDirectoryListState([], 0));
    setReadFailed(false);
    setErrorText('');
    const unsubscribe = chatSyncService.subscribe((event) => {
      if (event.type === 'home.directory.replace' && getChatCacheScopeId() === scopeId) {
        void reloadDirectory(pageRef.current);
      }
    });
    void reloadDirectory(1);
    return () => {
      unsubscribe();
      directoryRequestIdRef.current += 1;
    };
  }, [reloadDirectory, scopeId]);

  const retryDirectory = useCallback(() => {
    void reloadDirectory(pageRef.current);
    if (hasSource && !offline && directorySync.status !== 'ready') void chatSyncService.refreshHome();
  }, [directorySync.status, hasSource, offline, reloadDirectory]);

  const closeDrawer = useCallback(() => {
    if (openingItemIdRef.current || closingRequestedRef.current || pendingDetailParamsRef.current) {
      return;
    }

    closingRequestedRef.current = true;
    invalidateDirectoryRequests();
    setDrawerVisible(false);
  }, [invalidateDirectoryRequests]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (sourceVisible) {
          event.preventDefault();
          setSourceVisible(false);
          return;
        }
        if (!drawerVisible || closingRequestedRef.current || pendingDetailParamsRef.current) {
          return;
        }

        event.preventDefault();
        closeDrawer();
      }),
    [closeDrawer, drawerVisible, navigation, sourceVisible]
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
    if (!hasMore || reading || loadingMore || !loadMoreGate.tryAcquire()) {
      return;
    }

    setLoadingMore(true);
    setReadFailed(false);
    const requestId = directoryRequestIdRef.current + 1;
    directoryRequestIdRef.current = requestId;

    try {
      await loadPage(pageRef.current + 1, requestId);
    } catch {
      if (isDirectoryRequestActive(requestId)) {
        setReadFailed(true);
      }
    } finally {
      if (isDirectoryRequestActive(requestId)) {
        loadMoreGate.release();
        setLoadingMore(false);
      }
    }
  }, [hasMore, isDirectoryRequestActive, loadMoreGate, loadPage, reading, loadingMore]);

  const handleSelectItem = useCallback(
    (item: ChatDirectoryItem) => {
      if (openingItemIdRef.current || closingRequestedRef.current || pendingDetailParamsRef.current) {
        return;
      }

      const openConversation = async () => {
        const requestedScope = getChatCacheScopeId();
        openingItemIdRef.current = item.id;
        setOpeningItemId(item.id);
        setErrorText('');

        try {
          const result = await createConversationForDirectoryItem(item.id);
          if (!result) {
            setErrorText(t('chatHome.error.missingDirectoryTarget'));
            return;
          }

          if (requestedScope !== getChatCacheScopeId()) return;
          prewarmAgentDetailForEmptyConversation(item, result);
          pendingDetailParamsRef.current = buildChatDetailRouteParams(item, result);
          invalidateDirectoryRequests();
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
    [invalidateDirectoryRequests, t]
  );

  return (
    <View className={SCREEN_CLASS}>
      <ChatDirectoryPickerDrawer
        sourceLabel={
          selectedId
            ? devices.find((device) => device.deviceId === selectedId)?.deviceName || 'Desktop'
            : scopeId === 'signed_out'
              ? t('cloud.chooseSource')
              : t('accountSource.cloud')
        }
        isDesktop={Boolean(selectedId)}
        onOpenSource={() => setSourceVisible(true)}
        visible={drawerVisible}
        items={items}
        total={total}
        status={status}
        onRetry={retryDirectory}
        loadingMore={loadingMore}
        errorText={errorText}
        hasMore={hasMore}
        openingItemId={openingItemId}
        onClose={closeDrawer}
        onDismissed={handleDrawerDismissed}
        onLoadMore={handleLoadMore}
        onSelectItem={handleSelectItem}
      />
      <AccountSourceSheet
        visible={sourceVisible}
        loggedIn={Boolean(auth.session)}
        devices={devices}
        selectedId={selectedId}
        loading={sourceLoading}
        switchingId={sourceSwitchingId}
        error={sourceError}
        onClose={() => setSourceVisible(false)}
        onRefresh={() => {
          void refreshDevices();
        }}
        onSelect={(device) => {
          void selectSource(device);
        }}
        onLogin={(mode) => {
          setSourceVisible(false);
          navigation.navigate('Login', { mode });
        }}
      />
    </View>
  );
}
