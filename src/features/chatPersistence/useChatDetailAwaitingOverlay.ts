import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ChatConversationAwaitingState,
  ChatConversationRuntimeState,
} from '../chatRealtime/types';

export type ChatDetailAwaitingOverlayState = ChatConversationAwaitingState & {
  isOverlayVisible: boolean;
};

export function useChatDetailAwaitingOverlay(
  runtimeState: ChatConversationRuntimeState,
  resetKey: string
) {
  const [overlayAwaitingId, setOverlayAwaitingId] = useState<string | null>(null);
  const [lastPresentedAwaitingId, setLastPresentedAwaitingId] = useState<string | null>(null);
  const awaiting =
    runtimeState.conversationId === resetKey && runtimeState.awaiting?.status === 'ask'
      ? runtimeState.awaiting
      : null;

  useEffect(() => {
    setOverlayAwaitingId(null);
    setLastPresentedAwaitingId(null);
  }, [resetKey]);

  useEffect(() => {
    if (!awaiting) {
      setOverlayAwaitingId(null);
      return;
    }

    if (awaiting.id !== lastPresentedAwaitingId) {
      setOverlayAwaitingId(awaiting.id);
      setLastPresentedAwaitingId(awaiting.id);
    }
  }, [awaiting, lastPresentedAwaitingId]);

  const awaitingSummary = useMemo<ChatDetailAwaitingOverlayState | null>(
    () =>
      awaiting
        ? {
            ...awaiting,
            isOverlayVisible: awaiting.id === overlayAwaitingId,
          }
        : null,
    [awaiting, overlayAwaitingId]
  );

  const handleDismissAwaitingOverlay = useCallback(() => {
    if (awaiting) {
      setLastPresentedAwaitingId(awaiting.id);
    }
    setOverlayAwaitingId(null);
  }, [awaiting]);

  const handleOpenAwaitingOverlay = useCallback(() => {
    if (!awaiting) {
      return;
    }

    setOverlayAwaitingId(awaiting.id);
    setLastPresentedAwaitingId(awaiting.id);
  }, [awaiting]);

  return {
    awaitingSummary,
    handleOpenAwaitingOverlay,
    handleDismissAwaitingOverlay,
  };
}
