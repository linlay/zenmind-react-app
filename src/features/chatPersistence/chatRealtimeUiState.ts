import type { ChatHomeItemPatch } from '../chatRealtime/types';
import type { ChatDirectoryItem, ChatHomeItem, ChatMessageItem } from './types';
import { normalizeChatReadState, normalizeConversationUnreadCount } from './chatReadState.ts';

export type ChatHomeListState = {
  orderedIds: string[];
  itemsById: Record<string, ChatHomeItem>;
  total: number;
};

export function buildHomeListState(items: ChatHomeItem[], total: number): ChatHomeListState {
  const itemsById: Record<string, ChatHomeItem> = {};
  const orderedIds: string[] = [];

  items.forEach((item) => {
    itemsById[item.conversationId] = normalizeHomeItem(item);
    orderedIds.push(item.conversationId);
  });

  return {
    orderedIds,
    itemsById,
    total,
  };
}

function normalizePinnedAt(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeHomeItem(item: ChatHomeItem): ChatHomeItem {
  return {
    ...item,
    unreadCount: normalizeConversationUnreadCount(item.unreadCount),
    read: item.read ?? normalizeChatReadState({ unreadCount: item.unreadCount }),
    pinnedAt: normalizePinnedAt(item.pinnedAt),
  };
}

function resolvePatchedUnreadCount(currentUnreadCount: number, patch: ChatHomeItemPatch): number {
  if (patch.unreadCount !== undefined) {
    return normalizeConversationUnreadCount(patch.unreadCount);
  }

  if (patch.unreadCountDelta !== undefined) {
    const delta = Number(patch.unreadCountDelta || 0);
    if (Number.isFinite(delta) && delta !== 0) {
      return delta > 0 ? 1 : 0;
    }
  }

  return normalizeConversationUnreadCount(currentUnreadCount);
}

function insertByPinnedAt(
  orderedIds: string[],
  itemsById: Record<string, ChatHomeItem>,
  item: ChatHomeItem
): string[] {
  const nextPinnedAt = normalizePinnedAt(item.pinnedAt);
  const insertIndex = orderedIds.findIndex((id) => {
    const currentPinnedAt = normalizePinnedAt(itemsById[id]?.pinnedAt);
    return currentPinnedAt <= 0 || currentPinnedAt < nextPinnedAt;
  });

  if (insertIndex < 0) {
    return [...orderedIds, item.conversationId];
  }

  return [
    ...orderedIds.slice(0, insertIndex),
    item.conversationId,
    ...orderedIds.slice(insertIndex),
  ];
}

function insertAfterPinned(
  orderedIds: string[],
  itemsById: Record<string, ChatHomeItem>,
  conversationId: string
): string[] {
  const pinnedCount = orderedIds.findIndex((id) => normalizePinnedAt(itemsById[id]?.pinnedAt) <= 0);
  const insertIndex = pinnedCount < 0 ? orderedIds.length : pinnedCount;

  return [...orderedIds.slice(0, insertIndex), conversationId, ...orderedIds.slice(insertIndex)];
}

function sliceHomeState(
  orderedIds: string[],
  itemsById: Record<string, ChatHomeItem>,
  visibleLimit: number
) {
  const limitedOrderedIds = orderedIds.slice(0, Math.max(1, visibleLimit));
  const limitedItemsById: Record<string, ChatHomeItem> = {};

  limitedOrderedIds.forEach((id) => {
    const item = itemsById[id];
    if (item) {
      limitedItemsById[id] = item;
    }
  });

  return {
    orderedIds: limitedOrderedIds,
    itemsById: limitedItemsById,
  };
}

export function patchHomeListState(
  state: ChatHomeListState,
  patch: ChatHomeItemPatch,
  visibleLimit: number
): ChatHomeListState {
  const conversationId = String(patch.conversationId || '').trim();
  if (!conversationId) {
    return state;
  }

  const current = state.itemsById[conversationId];
  if (!current && patch.title === undefined && patch.lastMessageAt === undefined) {
    return state;
  }

  const nextUnreadCount = resolvePatchedUnreadCount(current?.unreadCount ?? 0, patch);
  const hasUnreadPatch = patch.unreadCount !== undefined || patch.unreadCountDelta !== undefined;
  const nextRead =
    patch.read ??
    (hasUnreadPatch
      ? normalizeChatReadState({ unreadCount: nextUnreadCount })
      : (current?.read ?? normalizeChatReadState({ unreadCount: nextUnreadCount })));
  const nextItem: ChatHomeItem = {
    conversationId,
    title: patch.title ?? current?.title ?? conversationId,
    lastMessageText: patch.lastMessageText ?? current?.lastMessageText ?? '',
    lastMessageAt: patch.lastMessageAt ?? current?.lastMessageAt ?? Date.now(),
    unreadCount: nextUnreadCount,
    read: nextRead,
    lastMessageStatus: patch.lastMessageStatus ?? current?.lastMessageStatus ?? 'sent',
    pinnedAt:
      patch.pinnedAt !== undefined
        ? normalizePinnedAt(patch.pinnedAt)
        : normalizePinnedAt(current?.pinnedAt),
  };

  const alreadyLoaded = Boolean(current);
  const withoutCurrent = state.orderedIds.filter((id) => id !== conversationId);
  const mergedItemsById = {
    ...state.itemsById,
    [conversationId]: nextItem,
  };
  const currentPinnedAt = normalizePinnedAt(current?.pinnedAt);
  const nextPinnedAt = normalizePinnedAt(nextItem.pinnedAt);
  const didPinnedAtChange = currentPinnedAt !== nextPinnedAt;
  const nextOrderedIds =
    nextPinnedAt > 0 && didPinnedAtChange
      ? insertByPinnedAt(withoutCurrent, mergedItemsById, nextItem)
      : nextPinnedAt <= 0 && (patch.shouldMoveToTop || didPinnedAtChange)
        ? insertAfterPinned(withoutCurrent, mergedItemsById, conversationId)
        : alreadyLoaded
          ? state.orderedIds
          : [...withoutCurrent, conversationId];
  const sliced = sliceHomeState(nextOrderedIds, mergedItemsById, visibleLimit);

  return {
    orderedIds: sliced.orderedIds,
    itemsById: sliced.itemsById,
    total: alreadyLoaded ? state.total : state.total + 1,
  };
}

export function removeHomeListItem(
  state: ChatHomeListState,
  conversationId: string
): ChatHomeListState {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId || !state.itemsById[normalizedConversationId]) {
    return state;
  }

  const restItems = { ...state.itemsById };
  delete restItems[normalizedConversationId];
  return {
    orderedIds: state.orderedIds.filter((id) => id !== normalizedConversationId),
    itemsById: restItems,
    total: Math.max(0, state.total - 1),
  };
}

export type ChatDirectoryListState = {
  orderedIds: string[];
  itemsById: Record<string, ChatDirectoryItem>;
  total: number;
};

export function buildDirectoryListState(items: ChatDirectoryItem[], total: number): ChatDirectoryListState {
  const itemsById: Record<string, ChatDirectoryItem> = {};
  const orderedIds: string[] = [];

  items.forEach((item) => {
    itemsById[item.id] = item;
    orderedIds.push(item.id);
  });

  return {
    orderedIds,
    itemsById,
    total,
  };
}

export function appendDirectoryListState(
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
    total,
  };
}

export function patchDirectoryListPreviewByConversation(
  state: ChatDirectoryListState,
  patch: ChatHomeItemPatch
): ChatDirectoryListState {
  const conversationId = String(patch.conversationId || '').trim();
  if (!conversationId || patch.directoryProjectionChanged) {
    return state;
  }

  let changed = false;
  const nextItemsById: Record<string, ChatDirectoryItem> = {};
  state.orderedIds.forEach((id) => {
    const current = state.itemsById[id];
    if (!current) {
      return;
    }

    if (current.latestConversationId !== conversationId) {
      nextItemsById[id] = current;
      return;
    }

    const nextPreview =
      patch.lastMessageText !== undefined ? patch.lastMessageText : current.lastMessageText;
    const nextTimestamp =
      patch.lastMessageAt !== undefined ? patch.lastMessageAt : current.lastMessageAt;
    if (nextPreview === current.lastMessageText && nextTimestamp === current.lastMessageAt) {
      nextItemsById[id] = current;
      return;
    }

    changed = true;
    nextItemsById[id] = {
      ...current,
      lastMessageText: nextPreview,
      lastMessageAt: nextTimestamp,
    };
  });

  return changed
    ? {
        ...state,
        itemsById: nextItemsById,
      }
    : state;
}

export function patchDetailFromHomeEvent(
  detail: ChatHomeItem | null,
  patch: ChatHomeItemPatch
): ChatHomeItem | null {
  if (!detail || detail.conversationId !== patch.conversationId) {
    return detail;
  }

  const nextUnreadCount =
    patch.unreadCount !== undefined
      ? normalizeConversationUnreadCount(patch.unreadCount)
      : normalizeConversationUnreadCount(detail.unreadCount);

  return {
    ...detail,
    title: patch.title ?? detail.title,
    lastMessageText: patch.lastMessageText ?? detail.lastMessageText,
    lastMessageAt: patch.lastMessageAt ?? detail.lastMessageAt,
    unreadCount: nextUnreadCount,
    read:
      patch.read ??
      (patch.unreadCount !== undefined
        ? normalizeChatReadState({ unreadCount: nextUnreadCount })
        : detail.read),
    lastMessageStatus: patch.lastMessageStatus ?? detail.lastMessageStatus,
    pinnedAt:
      patch.pinnedAt !== undefined
        ? normalizePinnedAt(patch.pinnedAt)
        : normalizePinnedAt(detail.pinnedAt),
  };
}

export function upsertConversationMessage(
  currentMessages: ChatMessageItem[],
  message: ChatMessageItem
): ChatMessageItem[] {
  const existingIndex = currentMessages.findIndex(
    (current) => current.messageId === message.messageId
  );
  if (existingIndex >= 0) {
    const nextMessages = [...currentMessages];
    nextMessages[existingIndex] = message;
    return nextMessages;
  }

  return [...currentMessages, message].sort((left, right) => left.createdAt - right.createdAt);
}

export function patchConversationMessage(
  currentMessages: ChatMessageItem[],
  messageId: string,
  patch: Partial<
    Pick<
      ChatMessageItem,
      | 'content'
      | 'createdAt'
      | 'deliveryStatus'
      | 'errorReason'
      | 'serverMessageId'
      | 'streamStatus'
    >
  >
): ChatMessageItem[] {
  const existingIndex = currentMessages.findIndex((message) => message.messageId === messageId);
  if (existingIndex < 0) {
    return currentMessages;
  }

  const nextMessages = [...currentMessages];
  nextMessages[existingIndex] = {
    ...nextMessages[existingIndex],
    ...patch,
  };
  return nextMessages;
}

export function applyConversationStreamDelta(
  currentMessages: ChatMessageItem[],
  input: {
    messageId: string;
    createdAt: number;
    delta: string;
    snapshotText?: string;
  }
): ChatMessageItem[] {
  const existingIndex = currentMessages.findIndex(
    (message) => message.messageId === input.messageId
  );
  if (existingIndex < 0) {
    return currentMessages;
  }

  const nextMessages = [...currentMessages];
  const target = nextMessages[existingIndex];
  nextMessages[existingIndex] = {
    ...target,
    content:
      input.snapshotText !== undefined
        ? input.snapshotText
        : `${target.content}${String(input.delta || '')}`,
    createdAt: Math.max(target.createdAt, input.createdAt),
    streamStatus: 'streaming',
  };
  return nextMessages;
}
