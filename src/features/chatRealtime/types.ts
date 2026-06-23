import type {
  ChatMessageItem,
  ChatMessageStatus,
  ChatReadState,
} from '../chatPersistence/types.ts';
import type {
  ChatTimelineAwaitingMode,
  ChatTimelineAwaitingState,
  ChatTimelineLifecycle,
  ChatTimelineRuntimeEntry,
  ChatTimelineRuntimeEntryKind,
  ChatTimelineRuntimeState,
  ChatTimelineState,
} from '../chatTimeline/index.ts';
import type { WsSocketStatus } from '../../core/ws/wsClient.ts';

export type ChatSocketStatus = WsSocketStatus;

export type ChatSyncReason =
  | 'bootstrap'
  | 'detail_open'
  | 'manual_refresh'
  | 'notification'
  | 'local_send'
  | 'awaiting_submit'
  | 'attach'
  | 'push'
  | 'reconcile'
  | 'stream';

export type ChatRuntimeLifecycle = ChatTimelineLifecycle;

export type ChatAwaitingMode = ChatTimelineAwaitingMode;

export type ChatHomeItemPatch = {
  conversationId: string;
  title?: string;
  lastMessageText?: string;
  lastMessageAt?: number;
  unreadCount?: number;
  read?: ChatReadState;
  unreadCountDelta?: number;
  lastMessageStatus?: ChatMessageStatus;
  pinnedAt?: number;
  shouldMoveToTop?: boolean;
  directoryProjectionChanged?: boolean;
};

export type ChatConnectionStatusEvent = {
  type: 'connection.status';
  status: ChatSocketStatus;
};

export type ChatHomeItemPatchEvent = {
  type: 'home.item.patch';
  patch: ChatHomeItemPatch;
};

export type ChatHomeItemRemoveEvent = {
  type: 'home.item.remove';
  conversationId: string;
};

export type ChatDirectoryReplaceEvent = {
  type: 'home.directory.replace';
};

export type ChatConversationMessageInsertEvent = {
  type: 'conversation.message.insert';
  conversationId: string;
  reason: ChatSyncReason;
  message: ChatMessageItem;
};

export type ChatConversationMessagePatchEvent = {
  type: 'conversation.message.patch';
  conversationId: string;
  reason: ChatSyncReason;
  messageId: string;
  patch: Partial<
    Pick<
      ChatMessageItem,
      | 'content'
      | 'createdAt'
      | 'deliveryStatus'
      | 'errorReason'
      | 'serverMessageId'
      | 'streamStatus'
      | 'attachments'
    >
  >;
};

export type ChatConversationStreamDeltaEvent = {
  type: 'conversation.stream.delta';
  conversationId: string;
  reason: ChatSyncReason;
  messageId: string;
  createdAt: number;
  delta: string;
  snapshotText?: string;
};

export type ChatConversationReconcileEvent = {
  type: 'conversation.reconcile';
  conversationId: string;
  reason: ChatSyncReason;
};

export type ChatRuntimeEntryKind = ChatTimelineRuntimeEntryKind;

export type ChatRuntimeEntry = ChatTimelineRuntimeEntry;

export type ChatConversationAwaitingState = ChatTimelineAwaitingState;

export type ChatConversationRuntimeState = ChatTimelineRuntimeState;

export type ChatConversationRuntimeReplaceEvent = {
  type: 'conversation.runtime.replace';
  conversationId: string;
  reason: ChatSyncReason;
  state: ChatConversationRuntimeState;
};

export type ChatConversationRuntimeResetEvent = {
  type: 'conversation.runtime.reset';
  conversationId: string;
  reason: ChatSyncReason;
};

export type ChatConversationTimelineReplaceEvent = {
  type: 'conversation.timeline.replace';
  conversationId: string;
  reason: ChatSyncReason;
  state: ChatTimelineState;
};

export type ChatConversationTimelineResetEvent = {
  type: 'conversation.timeline.reset';
  conversationId: string;
  reason: ChatSyncReason;
};

export type ChatSyncEvent =
  | ChatConnectionStatusEvent
  | ChatHomeItemPatchEvent
  | ChatHomeItemRemoveEvent
  | ChatDirectoryReplaceEvent
  | ChatConversationMessageInsertEvent
  | ChatConversationMessagePatchEvent
  | ChatConversationStreamDeltaEvent
  | ChatConversationReconcileEvent
  | ChatConversationRuntimeReplaceEvent
  | ChatConversationRuntimeResetEvent
  | ChatConversationTimelineReplaceEvent
  | ChatConversationTimelineResetEvent;
