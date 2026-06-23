import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    lastMessageText: text('last_message_text').notNull(),
    lastMessageAt: integer('last_message_at').notNull(),
    unreadCount: integer('unread_count').notNull().default(0),
    isRead: integer('is_read').notNull().default(1),
    readAt: integer('read_at'),
    readRunId: text('read_run_id'),
    lastMessageStatus: text('last_message_status').notNull().default('sent'),
    pinnedAt: integer('pinned_at').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
    agentKey: text('agent_key'),
    teamId: text('team_id'),
  },
  (table) => [
    index('conversations_agent_recency_idx').on(
      table.agentKey,
      table.lastMessageAt,
      table.updatedAt,
      table.id
    ),
    index('conversations_team_recency_idx').on(
      table.teamId,
      table.lastMessageAt,
      table.updatedAt,
      table.id
    ),
    index('conversations_agent_read_idx').on(table.agentKey, table.isRead),
    index('conversations_team_read_idx').on(table.teamId, table.isRead),
  ]
);

export const chatDirectoryItems = sqliteTable(
  'chat_directory_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull(),
    iconName: text('icon_name'),
    iconColor: text('icon_color'),
    iconUri: text('icon_uri'),
    unreadCount: integer('unread_count').notNull().default(0),
    pinnedAt: integer('pinned_at').notNull().default(0),
    sortRank: integer('sort_rank').notNull(),
    agentKey: text('agent_key'),
    teamId: text('team_id'),
    defaultAgentKey: text('default_agent_key'),
    agentMode: text('agent_mode'),
    modelKey: text('model_key'),
    reasoningEffort: text('reasoning_effort'),
    latestConversationId: text('latest_conversation_id'),
  },
  (table) => [
    index('chat_directory_items_home_order_idx').on(
      table.pinnedAt,
      table.sortRank,
      table.latestConversationId
    ),
    index('chat_directory_items_agent_idx').on(table.agentKey),
    index('chat_directory_items_team_idx').on(table.teamId),
    index('chat_directory_items_stable_order_idx').on(table.sortRank, table.id),
  ]
);

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  clientMessageId: text('client_message_id'),
  serverMessageId: text('server_message_id'),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  deliveryStatus: text('delivery_status').notNull().default('sent'),
  errorReason: text('error_reason'),
});

export const messageAttachments = sqliteTable(
  'message_attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id),
    clientMessageId: text('client_message_id'),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    localUri: text('local_uri').notNull().default(''),
    previewUri: text('preview_uri'),
    resourceUrl: text('resource_url'),
    sha256: text('sha256'),
    status: text('status').notNull().default('ready'),
    errorReason: text('error_reason'),
    referencesJson: text('references_json').notNull().default('[]'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('message_attachments_message_idx').on(table.messageId, table.sortOrder),
    index('message_attachments_conversation_idx').on(table.conversationId, table.createdAt),
    index('message_attachments_client_message_idx').on(table.clientMessageId),
  ]
);

export const outboxMessages = sqliteTable(
  'outbox_messages',
  {
    clientMessageId: text('client_message_id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    content: text('content').notNull(),
    planningMode: integer('planning_mode').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('outbox_messages_created_at_idx').on(table.createdAt, table.clientMessageId),
    index('outbox_messages_conversation_idx').on(table.conversationId),
  ]
);

export const conversationSyncState = sqliteTable('conversation_sync_state', {
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversations.id),
  activeRunId: text('active_run_id').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
  dirtyReason: text('dirty_reason').notNull().default(''),
  tailSignature: text('tail_signature').notNull().default(''),
});

export const conversationTimelineMeta = sqliteTable('conversation_timeline_meta', {
  conversationId: text('conversation_id')
    .primaryKey()
    .references(() => conversations.id),
  activeRunId: text('active_run_id').notNull().default(''),
  awaitingId: text('awaiting_id'),
  usageLabel: text('usage_label').notNull().default(''),
  updatedAt: integer('updated_at').notNull().default(0),
  revision: integer('revision').notNull().default(0),
  nextOrder: integer('next_order').notNull().default(0),
  messageTailSignature: text('message_tail_signature').notNull().default(''),
  persistedAt: integer('persisted_at').notNull(),
});

export const conversationTimelineNodes = sqliteTable(
  'conversation_timeline_nodes',
  {
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id),
    nodeId: text('node_id').notNull(),
    kind: text('kind').notNull(),
    runId: text('run_id').notNull().default(''),
    orderIndex: integer('order_index').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    payloadHash: text('payload_hash').notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.nodeId] }),
    index('conversation_timeline_nodes_order_idx').on(table.conversationId, table.orderIndex),
  ]
);

export type ConversationRow = InferSelectModel<typeof conversations>;
export type NewConversationRow = InferInsertModel<typeof conversations>;
export type ChatDirectoryItemRow = InferSelectModel<typeof chatDirectoryItems>;
export type NewChatDirectoryItemRow = InferInsertModel<typeof chatDirectoryItems>;
export type MessageRow = InferSelectModel<typeof messages>;
export type NewMessageRow = InferInsertModel<typeof messages>;
export type MessageAttachmentRow = InferSelectModel<typeof messageAttachments>;
export type NewMessageAttachmentRow = InferInsertModel<typeof messageAttachments>;
export type OutboxMessageRow = InferSelectModel<typeof outboxMessages>;
export type NewOutboxMessageRow = InferInsertModel<typeof outboxMessages>;
export type ConversationSyncStateRow = InferSelectModel<typeof conversationSyncState>;
export type NewConversationSyncStateRow = InferInsertModel<typeof conversationSyncState>;
export type ConversationTimelineMetaRow = InferSelectModel<typeof conversationTimelineMeta>;
export type NewConversationTimelineMetaRow = InferInsertModel<typeof conversationTimelineMeta>;
export type ConversationTimelineNodeRow = InferSelectModel<typeof conversationTimelineNodes>;
export type NewConversationTimelineNodeRow = InferInsertModel<typeof conversationTimelineNodes>;
