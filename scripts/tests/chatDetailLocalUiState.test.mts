import assert from 'node:assert/strict';
import test from 'node:test';

import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ChatConversationHistoryPage,
  ChatConversationHistoryScope,
  ChatHomeItem,
} from '../../src/features/chatPersistence/types.ts';
import { useChatDetailLocalUiState } from '../../src/features/chatPersistence/useChatDetailLocalUiState.ts';

type HookSnapshot = ReturnType<typeof useChatDetailLocalUiState>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

const historyScope: ChatConversationHistoryScope = {
  agentKey: 'agent-a',
  teamId: null,
};

const historyRows: ChatHomeItem[] = [
  {
    conversationId: 'chat-2',
    title: 'Second chat',
    lastMessageText: 'second preview',
    lastMessageAt: 20,
    unreadCount: 1,
    read: {
      isRead: false,
      readAt: null,
      readRunId: null,
    },
    lastMessageStatus: 'sent',
    pinnedAt: 0,
  },
  {
    conversationId: 'chat-1',
    title: 'First chat',
    lastMessageText: 'first preview',
    lastMessageAt: 10,
    unreadCount: 0,
    read: {
      isRead: true,
      readAt: 9,
      readRunId: null,
    },
    lastMessageStatus: 'sent',
    pinnedAt: 0,
  },
];

function HookHarness({
  resetKey,
  scope,
  copyText,
  loadHistory,
  markHistoryScopeRead,
  onValue,
}: {
  resetKey: string;
  scope: ChatConversationHistoryScope | null;
  copyText: (text: string) => Promise<unknown>;
  loadHistory: (
    scope: ChatConversationHistoryScope,
    limit: number
  ) => Promise<ChatConversationHistoryPage>;
  markHistoryScopeRead: (scope: ChatConversationHistoryScope) => Promise<unknown>;
  onValue: (value: HookSnapshot) => void;
}) {
  const value = useChatDetailLocalUiState(resetKey, scope, {
    copyText,
    loadHistory,
    markHistoryScopeRead,
  });

  useEffect(() => {
    onValue(value);
  }, [onValue, value]);

  return null;
}

test('local ui state loads history lazily and resets drawer on conversation switch', async () => {
  let latest: HookSnapshot | null = null;
  const handleValue = (value: HookSnapshot) => {
    latest = value;
  };
  const copyText = async (_text: string) => undefined;
  const loadHistory = async (
    _scope: ChatConversationHistoryScope,
    limit: number
  ): Promise<ChatConversationHistoryPage> => ({
    items: historyRows.slice(0, limit),
    total: historyRows.length,
    unreadTotal: 1,
    limit,
  });
  const markHistoryScopeRead = async (_scope: ChatConversationHistoryScope) => undefined;
  let renderer: ReactTestRenderer;

  await act(async () => {
    renderer = create(
      React.createElement(HookHarness, {
        resetKey: 'chat-1',
        scope: historyScope,
        copyText,
        loadHistory,
        markHistoryScopeRead,
        onValue: handleValue,
      })
    );
  });

  assert.ok(latest);
  await act(async () => {
    latest?.handleOpenHistoryDrawer();
    await Promise.resolve();
  });
  assert.equal(latest?.isHistoryDrawerOpen, true);
  assert.deepEqual(
    latest?.historyItems.map((item) => item.conversationId),
    ['chat-2', 'chat-1']
  );
  assert.equal(latest?.historyTotal, 2);
  assert.equal(latest?.historyUnreadTotal, 1);

  await act(async () => {
    renderer!.update(
      React.createElement(HookHarness, {
        resetKey: 'chat-2',
        scope: historyScope,
        copyText,
        loadHistory,
        markHistoryScopeRead,
        onValue: handleValue,
      })
    );
  });

  assert.equal(latest?.isHistoryDrawerOpen, false);
  assert.equal(latest?.historyItems.length, 0);
});

test('local ui state ignores pending history load after drawer closes', async () => {
  let latest: HookSnapshot | null = null;
  const handleValue = (value: HookSnapshot) => {
    latest = value;
  };
  const copyText = async (_text: string) => undefined;
  const pendingPage = createDeferred<ChatConversationHistoryPage>();
  const loadHistory = async (
    _scope: ChatConversationHistoryScope,
    _limit: number
  ): Promise<ChatConversationHistoryPage> => pendingPage.promise;
  const markHistoryScopeRead = async (_scope: ChatConversationHistoryScope) => undefined;

  await act(async () => {
    create(
      React.createElement(HookHarness, {
        resetKey: 'chat-1',
        scope: historyScope,
        copyText,
        loadHistory,
        markHistoryScopeRead,
        onValue: handleValue,
      })
    );
  });

  assert.ok(latest);
  await act(async () => {
    latest?.handleOpenHistoryDrawer();
  });
  assert.equal(latest?.isHistoryDrawerOpen, true);
  assert.equal(latest?.isHistoryLoading, true);

  await act(async () => {
    latest?.handleCloseHistoryDrawer();
  });
  assert.equal(latest?.isHistoryDrawerOpen, false);
  assert.equal(latest?.isHistoryLoading, false);

  await act(async () => {
    pendingPage.resolve({
      items: historyRows,
      total: historyRows.length,
      unreadTotal: 1,
      limit: historyRows.length,
    });
    await pendingPage.promise;
  });

  assert.equal(latest?.isHistoryDrawerOpen, false);
  assert.equal(latest?.historyItems.length, 0);
  assert.equal(latest?.historyTotal, 0);
  assert.equal(latest?.historyUnreadTotal, 0);
});

test('local ui state does not start duplicate history loads while drawer is already open', async () => {
  let latest: HookSnapshot | null = null;
  const handleValue = (value: HookSnapshot) => {
    latest = value;
  };
  const copyText = async (_text: string) => undefined;
  const pendingPage = createDeferred<ChatConversationHistoryPage>();
  let loadCount = 0;
  const loadHistory = async (
    _scope: ChatConversationHistoryScope,
    _limit: number
  ): Promise<ChatConversationHistoryPage> => {
    loadCount += 1;
    return pendingPage.promise;
  };
  const markHistoryScopeRead = async (_scope: ChatConversationHistoryScope) => undefined;

  await act(async () => {
    create(
      React.createElement(HookHarness, {
        resetKey: 'chat-1',
        scope: historyScope,
        copyText,
        loadHistory,
        markHistoryScopeRead,
        onValue: handleValue,
      })
    );
  });

  await act(async () => {
    latest?.handleOpenHistoryDrawer();
    latest?.handleOpenHistoryDrawer();
  });

  assert.equal(loadCount, 1);

  await act(async () => {
    pendingPage.resolve({
      items: historyRows,
      total: historyRows.length,
      unreadTotal: 1,
      limit: historyRows.length,
    });
    await pendingPage.promise;
  });
});

test('local ui state marks the current history scope read and reloads the visible slice', async () => {
  let latest: HookSnapshot | null = null;
  let loadCount = 0;
  let markedScope: ChatConversationHistoryScope | null = null;
  const handleValue = (value: HookSnapshot) => {
    latest = value;
  };
  const copyText = async (_text: string) => undefined;
  const loadHistory = async (
    _scope: ChatConversationHistoryScope,
    limit: number
  ): Promise<ChatConversationHistoryPage> => {
    loadCount += 1;
    return {
      items: historyRows.slice(0, limit),
      total: historyRows.length,
      unreadTotal: loadCount <= 1 ? 1 : 0,
      limit,
    };
  };
  const markHistoryScopeRead = async (scope: ChatConversationHistoryScope) => {
    markedScope = scope;
  };

  await act(async () => {
    create(
      React.createElement(HookHarness, {
        resetKey: 'chat-1',
        scope: historyScope,
        copyText,
        loadHistory,
        markHistoryScopeRead,
        onValue: handleValue,
      })
    );
  });

  assert.ok(latest);
  await act(async () => {
    latest?.handleOpenHistoryDrawer();
    await Promise.resolve();
  });
  assert.equal(latest?.historyUnreadTotal, 1);

  await act(async () => {
    await latest?.handleMarkAllHistoryRead();
    await Promise.resolve();
  });

  assert.deepEqual(markedScope, historyScope);
  assert.equal(loadCount, 2);
  assert.equal(latest?.historyUnreadTotal, 0);
});

test('local ui state trims copied message text and bumps toast trigger', async () => {
  let latest: HookSnapshot | null = null;
  let copiedText = '';
  const handleValue = (value: HookSnapshot) => {
    latest = value;
  };
  const copyText = async (text: string) => {
    copiedText = text;
  };
  const loadHistory = async (
    _scope: ChatConversationHistoryScope,
    limit: number
  ): Promise<ChatConversationHistoryPage> => ({
    items: [],
    total: 0,
    unreadTotal: 0,
    limit,
  });
  const markHistoryScopeRead = async (_scope: ChatConversationHistoryScope) => undefined;

  await act(async () => {
    create(
      React.createElement(HookHarness, {
        resetKey: 'chat-1',
        scope: historyScope,
        copyText,
        loadHistory,
        markHistoryScopeRead,
        onValue: handleValue,
      })
    );
  });

  assert.ok(latest);
  await act(async () => {
    await latest?.handleCopyMessage('  copied text  ');
  });

  assert.equal(copiedText, 'copied text');
  assert.equal(latest?.copyToastTrigger, 1);
});
