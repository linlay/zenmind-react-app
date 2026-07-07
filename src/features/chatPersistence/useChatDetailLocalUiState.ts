import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatSyncEvent } from '../chatRealtime/types.ts';
import {
  getChatConversationHistoryScopeKey,
  normalizeChatConversationHistoryScope,
} from './chatHistoryScope.ts';
import type {
  ChatConversationHistoryPage,
  ChatConversationHistoryScope,
  ChatHomeItem,
} from './types.ts';

const HISTORY_PAGE_SIZE = 20;
const HISTORY_RELOAD_DEBOUNCE_MS = 120;
const EMPTY_HISTORY_ITEMS: ChatHomeItem[] = [];

type HistoryLoadMode = 'initial' | 'more' | 'silent';

type UseChatDetailLocalUiStateOptions = {
  copyText: (text: string) => Promise<unknown>;
  loadHistory: (
    scope: ChatConversationHistoryScope,
    limit: number
  ) => Promise<ChatConversationHistoryPage>;
  markHistoryScopeRead: (scope: ChatConversationHistoryScope) => Promise<unknown>;
  subscribeHistoryEvents?: (listener: (event: ChatSyncEvent) => void) => () => void;
};

export function useChatDetailLocalUiState(
  resetKey: string,
  historyScope: ChatConversationHistoryScope | null,
  options: UseChatDetailLocalUiStateOptions
) {
  const { copyText, loadHistory, markHistoryScopeRead, subscribeHistoryEvents } = options;
  const historyAgentKey = historyScope?.agentKey ?? null;
  const historyTeamId = historyScope?.teamId ?? null;
  const normalizedHistoryScope = useMemo(
    () =>
      normalizeChatConversationHistoryScope({
        agentKey: historyAgentKey,
        teamId: historyTeamId,
      }),
    [historyAgentKey, historyTeamId]
  );
  const historyScopeKey = useMemo(
    () => getChatConversationHistoryScopeKey(normalizedHistoryScope),
    [normalizedHistoryScope]
  );
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<ChatHomeItem[]>(EMPTY_HISTORY_ITEMS);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyUnreadTotal, setHistoryUnreadTotal] = useState(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);
  const [isHistoryMarkingRead, setIsHistoryMarkingRead] = useState(false);
  const [historyErrorText, setHistoryErrorText] = useState('');
  const [copyToastTrigger, setCopyToastTrigger] = useState(0);
  const isHistoryDrawerOpenRef = useRef(false);
  const historyRequestIdRef = useRef(0);
  const historyLimitRef = useRef(HISTORY_PAGE_SIZE);
  const historyReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHistoryReloadTimer = useCallback(() => {
    if (historyReloadTimerRef.current) {
      clearTimeout(historyReloadTimerRef.current);
      historyReloadTimerRef.current = null;
    }
  }, []);

  const resetHistoryState = useCallback(() => {
    historyRequestIdRef.current += 1;
    historyLimitRef.current = HISTORY_PAGE_SIZE;
    clearHistoryReloadTimer();
    setHistoryItems(EMPTY_HISTORY_ITEMS);
    setHistoryTotal(0);
    setHistoryUnreadTotal(0);
    setIsHistoryLoading(false);
    setIsHistoryLoadingMore(false);
    setIsHistoryMarkingRead(false);
    setHistoryErrorText('');
  }, [clearHistoryReloadTimer]);

  useEffect(() => {
    isHistoryDrawerOpenRef.current = false;
    setIsHistoryDrawerOpen(false);
    setCopyToastTrigger(0);
    resetHistoryState();
  }, [historyScopeKey, resetHistoryState, resetKey]);

  useEffect(() => clearHistoryReloadTimer, [clearHistoryReloadTimer]);

  const loadHistorySlice = useCallback(
    async (limit: number, mode: HistoryLoadMode) => {
      const scope = normalizedHistoryScope;
      const safeLimit = Math.max(1, Math.trunc(Number(limit) || HISTORY_PAGE_SIZE));
      const requestId = historyRequestIdRef.current + 1;
      historyRequestIdRef.current = requestId;
      historyLimitRef.current = safeLimit;

      if (!scope) {
        setHistoryItems(EMPTY_HISTORY_ITEMS);
        setHistoryTotal(0);
        setHistoryUnreadTotal(0);
        setHistoryErrorText('');
        return;
      }

      if (mode === 'initial') {
        setIsHistoryLoading(true);
      } else if (mode === 'more') {
        setIsHistoryLoadingMore(true);
      }
      setHistoryErrorText('');

      try {
        const page = await loadHistory(scope, safeLimit);
        if (historyRequestIdRef.current !== requestId) {
          return;
        }

        historyLimitRef.current = page.limit;
        setHistoryItems(page.items);
        setHistoryTotal(page.total);
        setHistoryUnreadTotal(page.unreadTotal);
      } catch (error) {
        if (historyRequestIdRef.current !== requestId) {
          return;
        }

        setHistoryErrorText(error instanceof Error ? error.message : String(error));
      } finally {
        if (historyRequestIdRef.current !== requestId) {
          return;
        }

        if (mode === 'initial') {
          setIsHistoryLoading(false);
        } else if (mode === 'more') {
          setIsHistoryLoadingMore(false);
        }
      }
    },
    [loadHistory, normalizedHistoryScope]
  );

  const scheduleHistoryReload = useCallback(() => {
    if (!isHistoryDrawerOpen) {
      return;
    }

    clearHistoryReloadTimer();
    historyReloadTimerRef.current = setTimeout(() => {
      historyReloadTimerRef.current = null;
      void loadHistorySlice(historyLimitRef.current, 'silent');
    }, HISTORY_RELOAD_DEBOUNCE_MS);
  }, [clearHistoryReloadTimer, isHistoryDrawerOpen, loadHistorySlice]);

  useEffect(() => {
    if (!isHistoryDrawerOpen || !subscribeHistoryEvents) {
      return undefined;
    }

    return subscribeHistoryEvents((event) => {
      if (
        event.type === 'home.item.patch' ||
        event.type === 'home.directory.replace' ||
        event.type === 'home.item.remove' ||
        event.type === 'conversation.reconcile'
      ) {
        scheduleHistoryReload();
      }
    });
  }, [isHistoryDrawerOpen, scheduleHistoryReload, subscribeHistoryEvents]);

  const handleCopyMessage = useCallback(
    (text: string) => {
      const nextText = text.trim();
      if (!nextText) {
        return;
      }

      void copyText(nextText)
        .then(() => setCopyToastTrigger((current) => current + 1))
        .catch(() => {});
    },
    [copyText]
  );

  const handleOpenHistoryDrawer = useCallback(() => {
    if (isHistoryDrawerOpenRef.current) {
      return;
    }

    isHistoryDrawerOpenRef.current = true;
    setIsHistoryDrawerOpen(true);
    void loadHistorySlice(HISTORY_PAGE_SIZE, 'initial');
  }, [loadHistorySlice]);
  const handleCloseHistoryDrawer = useCallback(() => {
    if (!isHistoryDrawerOpenRef.current) {
      return;
    }

    isHistoryDrawerOpenRef.current = false;
    setIsHistoryDrawerOpen(false);
    resetHistoryState();
  }, [resetHistoryState]);
  const handleLoadMoreHistory = useCallback(() => {
    if (historyItems.length >= historyTotal || isHistoryLoadingMore) {
      return;
    }

    void loadHistorySlice(historyLimitRef.current + HISTORY_PAGE_SIZE, 'more');
  }, [historyItems.length, historyTotal, isHistoryLoadingMore, loadHistorySlice]);
  const handleMarkAllHistoryRead = useCallback(async () => {
    const scope = normalizedHistoryScope;
    if (!scope || historyUnreadTotal <= 0 || isHistoryMarkingRead) {
      return;
    }

    setIsHistoryMarkingRead(true);
    setHistoryErrorText('');
    try {
      await markHistoryScopeRead(scope);
      await loadHistorySlice(historyLimitRef.current, 'silent');
    } catch (error) {
      setHistoryErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setIsHistoryMarkingRead(false);
    }
  }, [
    historyUnreadTotal,
    isHistoryMarkingRead,
    loadHistorySlice,
    markHistoryScopeRead,
    normalizedHistoryScope,
  ]);

  return {
    isHistoryDrawerOpen,
    historyItems,
    historyTotal,
    historyUnreadTotal,
    isHistoryLoading,
    isHistoryLoadingMore,
    isHistoryMarkingRead,
    historyErrorText,
    hasMoreHistory: historyItems.length < historyTotal,
    copyToastTrigger,
    handleCopyMessage,
    handleOpenHistoryDrawer,
    handleCloseHistoryDrawer,
    handleLoadMoreHistory,
    handleMarkAllHistoryRead,
  };
}
