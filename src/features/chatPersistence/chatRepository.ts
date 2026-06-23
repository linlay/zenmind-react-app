import { and, asc, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import { normalizeAgentAvatarIcon } from '../../shared/visual/agentAvatarIcon.ts';
import { chatDb, ensureChatDatabase } from './database';
import { createChatConversationTarget } from './chatConversationTarget';
import { normalizeAgentMode } from './agentMode.ts';
import { normalizeChatReasoningEffort } from './agentModelSettings.ts';
import {
  isActiveTimelinePayload,
  shouldOpenLatestConversationFromSummary,
} from './chatDirectoryOpenDecision';
import { normalizeChatConversationHistoryScope } from './chatHistoryScope';
import { clearChatDirectorySnapshot, writeChatDirectorySnapshot } from './homeSnapshot';
import {
  chatDirectoryItems,
  conversationTimelineMeta,
  conversationTimelineNodes,
  conversationSyncState,
  conversations,
  messageAttachments,
  messages,
  outboxMessages,
} from './schema';
import {
  applyChatTimelineMessage,
  deriveChatTimelineStateFromMessages,
  deserializeChatTimelineState,
  projectTimelineMessages,
  serializeChatTimelineState,
  type ChatTimelineState,
  type SerializedTimelineMeta,
  type SerializedTimelineNode,
} from '../chatTimeline/index.ts';
import {
  mergeChatReadState,
  normalizeChatReadPatch,
  normalizeChatReadState,
  normalizeConversationUnreadCount,
  normalizePersistedConversationReadState,
  readStateToUnreadBit,
  type ChatReadStateInput,
} from './chatReadState.ts';
import {
  formatChatAttachmentsMessageText,
  getChatAttachmentKind,
  parseChatAttachmentReferencesJson,
  serializeChatAttachmentReferences,
} from './chatAttachmentModels.ts';
import {
  ChatComposerAttachment,
  ChatConversationHistoryPage,
  ChatConversationHistoryScope,
  ChatConversationTarget,
  ChatDirectoryItem,
  ChatDirectoryPage,
  ChatConversationSummaryProjection,
  ChatDirectoryProjectionItem,
  ChatHomeProjection,
  ChatHomeItem,
  ChatMessageAttachment,
  ChatMessageItem,
  ChatMessageRole,
  ChatMessageStatus,
  ChatReadState,
  PendingOutboxMessage,
  ServerMessageDetail,
} from './types';

const CHAT_DIRECTORY_DEFAULT_PAGE_SIZE = 6;
const TIMELINE_STALE_DELETE_BATCH_SIZE = 240;
const DEFAULT_NEW_CONVERSATION_TITLE = '新对话';

function getPinnedDirectoryCountExpression() {
  return sql<number>`coalesce(sum(case when ${chatDirectoryItems.pinnedAt} > 0 then 1 else 0 end), 0)`;
}

function getUnpinnedDirectoryCountExpression() {
  return sql<number>`coalesce(sum(case when ${chatDirectoryItems.pinnedAt} = 0 then 1 else 0 end), 0)`;
}

function normalizeCountValue(value: unknown): number {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

let localIdCounter = 0;
let chatHomeDirectoryPrewarmPromise: Promise<{
  items: ChatDirectoryItem[];
  total: number;
  pinnedTotal: number;
}> | null = null;

function createLocalId(prefix: string): string {
  localIdCounter += 1;
  return `${prefix}-${Date.now()}-${localIdCounter}`;
}

function mapChatHomeItem(row: {
  conversationId: string;
  title: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
  isRead?: number | boolean | null;
  readAt?: number | null;
  readRunId?: string | null;
  lastMessageStatus: string;
  pinnedAt: number;
}): ChatHomeItem {
  const read = mapConversationReadState(row);
  return {
    conversationId: row.conversationId,
    title: row.title,
    lastMessageText: row.lastMessageText,
    lastMessageAt: row.lastMessageAt,
    unreadCount: readStateToUnreadBit(read),
    read,
    lastMessageStatus: row.lastMessageStatus as ChatMessageStatus,
    pinnedAt: Number(row.pinnedAt || 0),
  };
}

function mapConversationReadState(row: {
  unreadCount?: number | null;
  isRead?: number | boolean | null;
  readAt?: number | null;
  readRunId?: string | null;
}): ChatReadState {
  return normalizePersistedConversationReadState(row);
}

function mapChatDirectoryItem(row: {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  iconName?: string | null;
  iconColor?: string | null;
  iconUri?: string | null;
  unreadCount: number;
  pinnedAt: number;
  sortRank: number;
  agentKey: string | null;
  teamId: string | null;
  defaultAgentKey: string | null;
  agentMode?: string | null;
  modelKey?: string | null;
  reasoningEffort?: string | null;
  latestConversationId: string | null;
  lastMessageText?: string | null;
  lastMessageAt?: number | null;
}): ChatDirectoryItem {
  return {
    id: row.id,
    kind: row.kind === 'team' ? 'team' : 'agent',
    title: row.title,
    subtitle: row.subtitle,
    icon: normalizeAgentAvatarIcon({
      name: row.iconName || null,
      color: row.iconColor || null,
      uri: row.iconUri || null,
    }),
    unreadCount: Math.max(0, Math.trunc(Number(row.unreadCount || 0))),
    pinnedAt: Number(row.pinnedAt || 0),
    sortRank: Number.isFinite(Number(row.sortRank)) ? Number(row.sortRank) : 0,
    agentKey: row.agentKey || null,
    teamId: row.teamId || null,
    defaultAgentKey: row.defaultAgentKey || null,
    agentMode: normalizeAgentMode(row.agentMode),
    modelKey: row.modelKey || null,
    reasoningEffort: normalizeChatReasoningEffort(row.reasoningEffort),
    latestConversationId: row.latestConversationId || null,
    lastMessageText: String(row.lastMessageText || ''),
    lastMessageAt: Number.isFinite(Number(row.lastMessageAt)) ? Number(row.lastMessageAt) : 0,
  };
}

async function getConversationRecord(conversationId: string) {
  const rows = await chatDb
    .select({
      id: conversations.id,
      title: conversations.title,
      unreadCount: conversations.unreadCount,
      isRead: conversations.isRead,
      readAt: conversations.readAt,
      readRunId: conversations.readRunId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return rows[0] ?? null;
}

function mapChatMessageItem(row: {
  messageId: string;
  clientMessageId: string | null;
  serverMessageId: string | null;
  conversationId: string;
  role: string;
  content: string;
  createdAt: number;
  deliveryStatus: string;
  errorReason: string | null;
}): ChatMessageItem {
  return {
    ...row,
    clientMessageId: row.clientMessageId ?? null,
    serverMessageId: row.serverMessageId ?? null,
    role: row.role as ChatMessageRole,
    errorReason: row.errorReason ?? null,
    deliveryStatus: row.deliveryStatus as ChatMessageStatus,
    attachments: [],
  };
}

function mapMessageAttachmentRow(row: {
  attachmentId: string;
  messageId: string;
  conversationId: string;
  name: string;
  kind: string;
  mimeType: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  localUri: string;
  previewUri: string | null;
  resourceUrl: string | null;
  sha256: string | null;
  status: string;
  errorReason: string | null;
  referencesJson: string;
  createdAt: number;
  updatedAt: number;
}): ChatMessageAttachment {
  return {
    attachmentId: row.attachmentId,
    messageId: row.messageId,
    conversationId: row.conversationId,
    name: row.name,
    kind: getChatAttachmentKind({
      type: row.kind,
      name: row.name,
      mimeType: row.mimeType,
    }),
    mimeType: row.mimeType || null,
    sizeBytes: Number.isFinite(Number(row.sizeBytes)) ? Number(row.sizeBytes) : 0,
    width: Number.isFinite(Number(row.width)) ? Number(row.width) : null,
    height: Number.isFinite(Number(row.height)) ? Number(row.height) : null,
    localUri: row.localUri || '',
    previewUri: row.previewUri || null,
    resourceUrl: row.resourceUrl || null,
    sha256: row.sha256 || null,
    status: row.status === 'uploading' || row.status === 'failed' ? row.status : 'ready',
    errorReason: row.errorReason || null,
    references: parseChatAttachmentReferencesJson(row.referencesJson),
    createdAt: Number(row.createdAt || 0),
    updatedAt: Number(row.updatedAt || 0),
  };
}

async function getAttachmentsByMessageIds(
  messageIds: readonly string[]
): Promise<Map<string, ChatMessageAttachment[]>> {
  const normalizedIds = [
    ...new Set(messageIds.map((id) => String(id || '').trim()).filter(Boolean)),
  ];
  const attachmentsByMessageId = new Map<string, ChatMessageAttachment[]>();
  if (normalizedIds.length === 0) {
    return attachmentsByMessageId;
  }

  const rows = await chatDb
    .select({
      attachmentId: messageAttachments.id,
      messageId: messageAttachments.messageId,
      conversationId: messageAttachments.conversationId,
      name: messageAttachments.name,
      kind: messageAttachments.kind,
      mimeType: messageAttachments.mimeType,
      sizeBytes: messageAttachments.sizeBytes,
      width: messageAttachments.width,
      height: messageAttachments.height,
      localUri: messageAttachments.localUri,
      previewUri: messageAttachments.previewUri,
      resourceUrl: messageAttachments.resourceUrl,
      sha256: messageAttachments.sha256,
      status: messageAttachments.status,
      errorReason: messageAttachments.errorReason,
      referencesJson: messageAttachments.referencesJson,
      createdAt: messageAttachments.createdAt,
      updatedAt: messageAttachments.updatedAt,
    })
    .from(messageAttachments)
    .where(inArray(messageAttachments.messageId, normalizedIds))
    .orderBy(asc(messageAttachments.sortOrder), asc(messageAttachments.createdAt));

  rows.forEach((row) => {
    const attachment = mapMessageAttachmentRow(row);
    const current = attachmentsByMessageId.get(attachment.messageId) || [];
    current.push(attachment);
    attachmentsByMessageId.set(attachment.messageId, current);
  });

  return attachmentsByMessageId;
}

async function attachMessageAttachments<T extends ChatMessageItem>(items: T[]): Promise<T[]> {
  const attachmentsByMessageId = await getAttachmentsByMessageIds(
    items.map((item) => item.messageId)
  );
  return items.map((item) => ({
    ...item,
    attachments: attachmentsByMessageId.get(item.messageId) || [],
  }));
}

function buildMessageAttachmentInsertRows(input: {
  conversationId: string;
  messageId: string;
  clientMessageId: string | null;
  attachments: readonly ChatComposerAttachment[] | readonly ChatMessageAttachment[];
  createdAt: number;
}) {
  return input.attachments.map((attachment, index) => ({
    id: attachment.attachmentId || `${input.messageId}:attachment:${index + 1}`,
    messageId: input.messageId,
    clientMessageId: input.clientMessageId,
    conversationId: input.conversationId,
    name: attachment.name,
    kind: getChatAttachmentKind(attachment),
    mimeType: attachment.mimeType,
    sizeBytes: Number.isFinite(Number(attachment.sizeBytes)) ? Number(attachment.sizeBytes) : 0,
    width: Number.isFinite(Number(attachment.width)) ? attachment.width : null,
    height: Number.isFinite(Number(attachment.height)) ? attachment.height : null,
    localUri: attachment.localUri || '',
    previewUri: attachment.previewUri || null,
    resourceUrl: attachment.resourceUrl || null,
    sha256: attachment.sha256 || null,
    status: attachment.status,
    errorReason: attachment.errorReason || null,
    referencesJson: serializeChatAttachmentReferences(attachment.references),
    sortOrder: index,
    createdAt: attachment.createdAt || input.createdAt,
    updatedAt: attachment.updatedAt || input.createdAt,
  }));
}

function withMessageAttachmentIdentity(
  attachment: ChatComposerAttachment,
  messageId: string
): ChatMessageAttachment {
  return {
    ...attachment,
    messageId,
  };
}

type ConversationSummaryRow = {
  conversationId: string;
  title: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
  isRead: number;
  readAt: number | null;
  readRunId: string | null;
  lastMessageStatus: string;
  pinnedAt: number;
  updatedAt: number;
  agentKey: string | null;
  teamId: string | null;
};

type ConversationDirectoryKeys = {
  agentKey: string | null;
  teamId: string | null;
};

type DirectoryItemOpenScope = {
  directoryItem: {
    kind: string;
    title: string;
    agentKey: string | null;
    teamId: string | null;
    defaultAgentKey: string | null;
    latestConversationId: string | null;
  };
  historyScope: ChatConversationHistoryScope;
};

type ConversationDirectoryProjection = {
  latestConversationId: string | null;
  unreadCount: number;
};

type DirectoryProjectionKind = 'agent' | 'team';

type DirectoryProjectionTargetRow = {
  id: string;
  scopeKey: string;
  latestConversationId: string | null;
  unreadCount: number;
};

type DirectoryProjectionChange = {
  id: string;
  latestConversationId: string | null;
  unreadCount: number;
};

type LatestConversationScopeRow = {
  scope_key: string | null;
  conversation_id: string | null;
};

const CHAT_HOME_ITEM_SELECT = {
  conversationId: conversations.id,
  title: conversations.title,
  lastMessageText: conversations.lastMessageText,
  lastMessageAt: conversations.lastMessageAt,
  unreadCount: conversations.unreadCount,
  isRead: conversations.isRead,
  readAt: conversations.readAt,
  readRunId: conversations.readRunId,
  lastMessageStatus: conversations.lastMessageStatus,
  pinnedAt: conversations.pinnedAt,
};

const CONVERSATION_SUMMARY_SELECT = {
  ...CHAT_HOME_ITEM_SELECT,
  updatedAt: conversations.updatedAt,
  agentKey: conversations.agentKey,
  teamId: conversations.teamId,
};

const CHAT_DIRECTORY_ITEM_SELECT = {
  id: chatDirectoryItems.id,
  kind: chatDirectoryItems.kind,
  title: chatDirectoryItems.title,
  subtitle: chatDirectoryItems.subtitle,
  iconName: chatDirectoryItems.iconName,
  iconColor: chatDirectoryItems.iconColor,
  iconUri: chatDirectoryItems.iconUri,
  unreadCount: chatDirectoryItems.unreadCount,
  pinnedAt: chatDirectoryItems.pinnedAt,
  sortRank: chatDirectoryItems.sortRank,
  agentKey: chatDirectoryItems.agentKey,
  teamId: chatDirectoryItems.teamId,
  defaultAgentKey: chatDirectoryItems.defaultAgentKey,
  agentMode: chatDirectoryItems.agentMode,
  modelKey: chatDirectoryItems.modelKey,
  reasoningEffort: chatDirectoryItems.reasoningEffort,
  latestConversationId: chatDirectoryItems.latestConversationId,
};

const CHAT_DIRECTORY_ITEM_WITH_SUMMARY_SELECT = {
  ...CHAT_DIRECTORY_ITEM_SELECT,
  lastMessageText: conversations.lastMessageText,
  lastMessageAt: conversations.lastMessageAt,
};

const CHAT_DIRECTORY_LATEST_MESSAGE_AT = sql<number>`coalesce(${conversations.lastMessageAt}, 0)`;
const CHAT_DIRECTORY_STABLE_ORDER = [asc(chatDirectoryItems.sortRank), asc(chatDirectoryItems.id)];
const CHAT_DIRECTORY_RECENCY_ORDER = [
  desc(CHAT_DIRECTORY_LATEST_MESSAGE_AT),
  ...CHAT_DIRECTORY_STABLE_ORDER,
];
const CHAT_DIRECTORY_PINNED_ORDER = [
  desc(chatDirectoryItems.pinnedAt),
  ...CHAT_DIRECTORY_RECENCY_ORDER,
];
const CONVERSATION_RECENCY_ORDER = [
  desc(conversations.lastMessageAt),
  desc(conversations.updatedAt),
  asc(conversations.id),
];
const CONVERSATION_HISTORY_VISIBLE_FILTER = sql<boolean>`length(trim(${conversations.lastMessageText})) > 0`;

export type ConversationSyncState = {
  conversationId: string;
  activeRunId: string;
  lastSyncedAt: number;
  dirtyReason: string;
  tailSignature: string;
};

export type ProjectedMessageUpsertInput = {
  messageId: string;
  clientMessageId?: string | null;
  serverMessageId?: string | null;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: number;
  deliveryStatus?: ChatMessageStatus;
  errorReason?: string | null;
  attachments?: ChatMessageAttachment[];
  title?: string;
};

export type MessagePatch = Partial<
  Pick<
    ChatMessageItem,
    'content' | 'createdAt' | 'deliveryStatus' | 'errorReason' | 'serverMessageId'
  >
>;

export type ConversationSummaryPatch = {
  conversationId: string;
  title?: string;
  lastMessageText?: string;
  lastMessageAt?: number;
  read?: ChatReadStateInput;
  unreadCount?: number;
  unreadCountDelta?: number;
  lastMessageStatus?: ChatMessageStatus;
  shouldMoveToTop?: boolean;
  agentKey?: string | null;
  teamId?: string | null;
};

export type ConversationSummaryPatchResult = {
  summary: ChatHomeItem;
  changed: boolean;
  directoryChanged: boolean;
};

export type ConversationReadScope = {
  agentKey?: string | null;
  teamId?: string | null;
  activeConversationId?: string | null;
};

export type ConversationUnreadLocalResult = {
  summary: ChatHomeItem;
  changed: boolean;
  directoryChanged: boolean;
};

export type DirectoryConversationOpenResult = {
  conversation: ChatHomeItem;
  historyScope: ChatConversationHistoryScope | null;
  skipInitialReconcile: boolean;
};

function areReadStatesEqual(left: ChatReadState, right: ChatReadState): boolean {
  return (
    left.isRead === right.isRead &&
    (left.readAt || null) === (right.readAt || null) &&
    (left.readRunId || null) === (right.readRunId || null)
  );
}

async function ensureConversationRecord(conversationId: string, createdAt: number, title?: string) {
  const existing = await getConversationRecord(conversationId);
  if (existing) {
    const nextTitle = String(title || '').trim();
    if (nextTitle && nextTitle !== existing.title) {
      await chatDb
        .update(conversations)
        .set({ title: nextTitle })
        .where(eq(conversations.id, conversationId));
      return {
        ...existing,
        title: nextTitle,
      };
    }

    return existing;
  }

  const fallbackTitle = String(title || '').trim() || `Conversation ${conversationId.slice(0, 8)}`;
  await chatDb.insert(conversations).values({
    id: conversationId,
    title: fallbackTitle,
    lastMessageText: '',
    lastMessageAt: createdAt,
    unreadCount: 0,
    isRead: 1,
    readAt: null,
    readRunId: null,
    lastMessageStatus: 'sent',
    pinnedAt: 0,
    updatedAt: createdAt,
  });

  return {
    id: conversationId,
    title: fallbackTitle,
    unreadCount: 0,
    isRead: 1,
    readAt: null,
    readRunId: null,
  };
}

async function getConversationSummaryRow(
  conversationId: string
): Promise<ConversationSummaryRow | null> {
  const rows = await chatDb
    .select(CONVERSATION_SUMMARY_SELECT)
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  return rows[0] ?? null;
}

async function getConversationDirectoryKeys(
  conversationId: string
): Promise<ConversationDirectoryKeys | null> {
  const rows = await chatDb
    .select({
      agentKey: conversations.agentKey,
      teamId: conversations.teamId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!rows[0]) {
    return null;
  }

  return {
    agentKey: rows[0].agentKey || null,
    teamId: rows[0].teamId || null,
  };
}

function clampUnreadCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function resolveConversationUnreadCountDelta(currentUnreadCount: number, delta: unknown): number {
  const numericDelta = Number(delta || 0);
  if (!Number.isFinite(numericDelta) || numericDelta === 0) {
    return normalizeConversationUnreadCount(currentUnreadCount);
  }

  return numericDelta > 0 ? 1 : 0;
}

function normalizeProvidedDirectoryKey(value: string | null | undefined): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function getDirectoryConversationKeys(item: {
  kind: string;
  agentKey: string | null;
  teamId: string | null;
  defaultAgentKey: string | null;
}): ConversationDirectoryKeys {
  const teamId = item.kind === 'team' ? String(item.teamId || '').trim() : '';
  const agentKey = teamId ? '' : String(item.agentKey || item.defaultAgentKey || '').trim();

  return {
    agentKey: agentKey || null,
    teamId: teamId || null,
  };
}

function normalizeLocalConversationTitle(title: string | null | undefined): string {
  return String(title || '').trim() || DEFAULT_NEW_CONVERSATION_TITLE;
}

async function getDirectoryItemOpenScope(itemId: string): Promise<DirectoryItemOpenScope | null> {
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) {
    return null;
  }

  const directoryRows = await chatDb
    .select(CHAT_DIRECTORY_ITEM_SELECT)
    .from(chatDirectoryItems)
    .where(eq(chatDirectoryItems.id, normalizedItemId))
    .limit(1);
  const directoryItem = directoryRows[0];
  if (!directoryItem) {
    return null;
  }

  const historyScope = normalizeChatConversationHistoryScope(
    getDirectoryConversationKeys(directoryItem)
  );
  if (!historyScope) {
    return null;
  }

  return {
    directoryItem,
    historyScope,
  };
}

async function createLocalConversationForHistoryScope(
  scope: ChatConversationHistoryScope,
  title?: string | null
): Promise<DirectoryConversationOpenResult | null> {
  const historyScope = normalizeChatConversationHistoryScope(scope);
  if (!historyScope) {
    return null;
  }

  const createdAt = Date.now();
  const conversationId = createLocalId('conversation');
  await chatDb.insert(conversations).values({
    id: conversationId,
    title: normalizeLocalConversationTitle(title),
    lastMessageText: '',
    lastMessageAt: createdAt,
    unreadCount: 0,
    isRead: 1,
    readAt: null,
    readRunId: null,
    lastMessageStatus: 'sent',
    pinnedAt: 0,
    updatedAt: createdAt,
    agentKey: historyScope.agentKey,
    teamId: historyScope.teamId,
  });

  const conversation = await getConversationDetail(conversationId);
  if (!conversation) {
    return null;
  }

  return {
    conversation,
    historyScope,
    skipInitialReconcile: true,
  };
}

function didDirectoryKeysChange(
  current: ConversationDirectoryKeys,
  next: ConversationDirectoryKeys
): boolean {
  return (
    (current.agentKey || null) !== (next.agentKey || null) ||
    (current.teamId || null) !== (next.teamId || null)
  );
}

function normalizeMessageId(value: string | null | undefined, fallback: string): string {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function buildTailSignatureFromMessage(
  message:
    | Pick<ChatMessageItem, 'messageId' | 'createdAt' | 'content' | 'deliveryStatus'>
    | null
    | undefined
): string {
  if (!message) {
    return '';
  }
  return [
    message.messageId,
    message.createdAt,
    message.deliveryStatus,
    String(message.content || '').length,
  ].join(':');
}

function buildTailSignatureFromTimelineState(state: ChatTimelineState): string {
  const timelineMessages = projectTimelineMessages(state);
  return buildTailSignatureFromMessage(timelineMessages[timelineMessages.length - 1] || null);
}

function mapSerializedTimelineMetaRow(row: {
  conversationId: string;
  activeRunId: string;
  awaitingId: string | null;
  usageLabel: string;
  updatedAt: number;
  revision: number;
  nextOrder: number;
}): SerializedTimelineMeta {
  return {
    conversationId: row.conversationId,
    activeRunId: row.activeRunId || '',
    awaitingId: row.awaitingId || null,
    usageLabel: row.usageLabel || '',
    updatedAt: Number(row.updatedAt || 0),
    revision: Number(row.revision || 0),
    nextOrder: Number(row.nextOrder || 0),
  };
}

function mapSerializedTimelineNodeRow(row: {
  conversationId: string;
  nodeId: string;
  kind: string;
  runId: string;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
  payloadHash: string;
  payloadJson: string;
}): SerializedTimelineNode {
  return {
    conversationId: row.conversationId,
    nodeId: row.nodeId,
    kind: row.kind as SerializedTimelineNode['kind'],
    runId: row.runId || '',
    orderIndex: Number(row.orderIndex || 0),
    createdAt: Number(row.createdAt || 0),
    updatedAt: Number(row.updatedAt || 0),
    payloadHash: row.payloadHash || '',
    payloadJson: row.payloadJson || '',
  };
}

function mapConversationSyncStateRow(row: {
  conversationId: string;
  activeRunId: string;
  lastSyncedAt: number;
  dirtyReason: string;
  tailSignature: string;
}): ConversationSyncState {
  return {
    conversationId: row.conversationId,
    activeRunId: row.activeRunId || '',
    lastSyncedAt: Number(row.lastSyncedAt || 0),
    dirtyReason: row.dirtyReason || '',
    tailSignature: row.tailSignature || '',
  };
}

async function getMessageRowByClientMessageId(clientMessageId: string) {
  const normalizedClientMessageId = String(clientMessageId || '').trim();
  if (!normalizedClientMessageId) {
    return null;
  }

  const rows = await chatDb
    .select({
      messageId: messages.id,
      clientMessageId: messages.clientMessageId,
      serverMessageId: messages.serverMessageId,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      deliveryStatus: messages.deliveryStatus,
      errorReason: messages.errorReason,
    })
    .from(messages)
    .where(eq(messages.clientMessageId, normalizedClientMessageId))
    .limit(1);

  return rows[0] ? mapChatMessageItem(rows[0]) : null;
}

async function getMessageRowByMessageId(messageId: string) {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) {
    return null;
  }

  const rows = await chatDb
    .select({
      messageId: messages.id,
      clientMessageId: messages.clientMessageId,
      serverMessageId: messages.serverMessageId,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      deliveryStatus: messages.deliveryStatus,
      errorReason: messages.errorReason,
    })
    .from(messages)
    .where(eq(messages.id, normalizedMessageId))
    .limit(1);

  return rows[0] ? mapChatMessageItem(rows[0]) : null;
}

async function getLatestConversationMessage(conversationId: string) {
  const rows = await chatDb
    .select({
      messageId: messages.id,
      clientMessageId: messages.clientMessageId,
      serverMessageId: messages.serverMessageId,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      deliveryStatus: messages.deliveryStatus,
      errorReason: messages.errorReason,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  return rows[0] ? mapChatMessageItem(rows[0]) : null;
}

async function upsertConversationSyncState(
  input: Partial<ConversationSyncState> & { conversationId: string }
) {
  const conversationId = String(input.conversationId || '').trim();
  if (!conversationId) {
    return null;
  }

  const current = await getConversationSyncState(conversationId);
  const nextState: ConversationSyncState = {
    conversationId,
    activeRunId:
      input.activeRunId !== undefined
        ? String(input.activeRunId || '').trim()
        : current?.activeRunId || '',
    lastSyncedAt:
      input.lastSyncedAt !== undefined
        ? Number(input.lastSyncedAt || 0)
        : current?.lastSyncedAt || 0,
    dirtyReason:
      input.dirtyReason !== undefined
        ? String(input.dirtyReason || '').trim()
        : current?.dirtyReason || '',
    tailSignature:
      input.tailSignature !== undefined
        ? String(input.tailSignature || '').trim()
        : current?.tailSignature || '',
  };

  if (current) {
    await chatDb
      .update(conversationSyncState)
      .set({
        activeRunId: nextState.activeRunId,
        lastSyncedAt: nextState.lastSyncedAt,
        dirtyReason: nextState.dirtyReason,
        tailSignature: nextState.tailSignature,
      })
      .where(eq(conversationSyncState.conversationId, conversationId));
  } else {
    await chatDb.insert(conversationSyncState).values({
      conversationId,
      activeRunId: nextState.activeRunId,
      lastSyncedAt: nextState.lastSyncedAt,
      dirtyReason: nextState.dirtyReason,
      tailSignature: nextState.tailSignature,
    });
  }

  return nextState;
}

type ChatDbTransaction = Parameters<Parameters<typeof chatDb.transaction>[0]>[0];

function writeTimelineSnapshotInTransaction(
  tx: ChatDbTransaction,
  state: ChatTimelineState,
  messageTailSignature: string
) {
  const conversationId = String(state.conversationId || '').trim();
  if (!conversationId) {
    return;
  }

  const serialized = serializeChatTimelineState(state);
  const now = Date.now();
  const existingMeta = tx
    .select({
      conversationId: conversationTimelineMeta.conversationId,
    })
    .from(conversationTimelineMeta)
    .where(eq(conversationTimelineMeta.conversationId, conversationId))
    .limit(1)
    .all();

  const metaValues = {
    activeRunId: serialized.meta.activeRunId,
    awaitingId: serialized.meta.awaitingId,
    usageLabel: serialized.meta.usageLabel,
    updatedAt: serialized.meta.updatedAt,
    revision: serialized.meta.revision,
    nextOrder: serialized.meta.nextOrder,
    messageTailSignature,
    persistedAt: now,
  };

  if (existingMeta[0]) {
    tx.update(conversationTimelineMeta)
      .set(metaValues)
      .where(eq(conversationTimelineMeta.conversationId, conversationId))
      .run();
  } else {
    tx.insert(conversationTimelineMeta)
      .values({
        conversationId,
        ...metaValues,
      })
      .run();
  }

  const existingRows = tx
    .select({
      nodeId: conversationTimelineNodes.nodeId,
      orderIndex: conversationTimelineNodes.orderIndex,
      payloadHash: conversationTimelineNodes.payloadHash,
    })
    .from(conversationTimelineNodes)
    .where(eq(conversationTimelineNodes.conversationId, conversationId))
    .all();
  const existingById = new Map(existingRows.map((row) => [row.nodeId, row]));
  const nextNodeIdSet = new Set(serialized.nodes.map((node) => node.nodeId));
  const staleNodeIds = existingRows
    .map((row) => row.nodeId)
    .filter((nodeId) => !nextNodeIdSet.has(nodeId));

  if (serialized.nodes.length <= 0 && existingRows.length > 0) {
    tx.delete(conversationTimelineNodes)
      .where(eq(conversationTimelineNodes.conversationId, conversationId))
      .run();
  } else {
    for (let index = 0; index < staleNodeIds.length; index += TIMELINE_STALE_DELETE_BATCH_SIZE) {
      const batch = staleNodeIds.slice(index, index + TIMELINE_STALE_DELETE_BATCH_SIZE);
      if (batch.length <= 0) {
        continue;
      }
      tx.delete(conversationTimelineNodes)
        .where(
          and(
            eq(conversationTimelineNodes.conversationId, conversationId),
            inArray(conversationTimelineNodes.nodeId, batch)
          )
        )
        .run();
    }
  }

  for (const node of serialized.nodes) {
    const existing = existingById.get(node.nodeId);
    const values = {
      kind: node.kind,
      runId: node.runId,
      orderIndex: node.orderIndex,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      payloadHash: node.payloadHash,
      payloadJson: node.payloadJson,
    };

    if (existing) {
      if (existing.payloadHash === node.payloadHash && existing.orderIndex === node.orderIndex) {
        continue;
      }
      tx.update(conversationTimelineNodes)
        .set(values)
        .where(
          and(
            eq(conversationTimelineNodes.conversationId, conversationId),
            eq(conversationTimelineNodes.nodeId, node.nodeId)
          )
        )
        .run();
      continue;
    }

    tx.insert(conversationTimelineNodes)
      .values({
        conversationId,
        nodeId: node.nodeId,
        ...values,
      })
      .run();
  }
}

async function syncConversationSummary(conversationId: string, readOverride?: ChatReadStateInput) {
  const [conversation, latestMessage] = await Promise.all([
    getConversationRecord(conversationId),
    chatDb
      .select({
        content: messages.content,
        createdAt: messages.createdAt,
        deliveryStatus: messages.deliveryStatus,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(1),
  ]);

  if (!conversation || !latestMessage[0]) {
    return;
  }

  const read =
    readOverride !== undefined
      ? normalizeChatReadState(readOverride)
      : mapConversationReadState(conversation);

  await chatDb
    .update(conversations)
    .set({
      lastMessageText: latestMessage[0].content,
      lastMessageAt: latestMessage[0].createdAt,
      lastMessageStatus: latestMessage[0].deliveryStatus,
      unreadCount: readStateToUnreadBit(read),
      isRead: read.isRead ? 1 : 0,
      readAt: read.readAt,
      readRunId: read.readRunId,
      updatedAt: latestMessage[0].createdAt,
    })
    .where(eq(conversations.id, conversationId));
}

async function writeConversationSummaryPatch(patch: ConversationSummaryPatch) {
  await ensureChatDatabase();

  const conversationId = String(patch.conversationId || '').trim();
  if (!conversationId) {
    return null;
  }

  const seedTime = Number.isFinite(Number(patch.lastMessageAt))
    ? Number(patch.lastMessageAt)
    : Date.now();
  const ensured = await ensureConversationRecord(conversationId, seedTime, patch.title);
  const current = await getConversationSummaryRow(conversationId);
  const currentKeys: ConversationDirectoryKeys = {
    agentKey: current?.agentKey || null,
    teamId: current?.teamId || null,
  };
  const patchAgentKey = normalizeProvidedDirectoryKey(patch.agentKey);
  const patchTeamId = normalizeProvidedDirectoryKey(patch.teamId);
  const nextTitle =
    String(patch.title || current?.title || ensured.title || '').trim() || conversationId;
  const nextLastMessageText =
    patch.lastMessageText !== undefined
      ? String(patch.lastMessageText || '')
      : String(current?.lastMessageText || '');
  const nextLastMessageAt = Number.isFinite(Number(patch.lastMessageAt))
    ? Number(patch.lastMessageAt)
    : Number(current?.lastMessageAt || seedTime);
  const currentRead = mapConversationReadState(current ?? ensured);
  const nextRead =
    patch.read !== undefined
      ? mergeChatReadState(currentRead, patch.read)
      : patch.unreadCount !== undefined
        ? mergeChatReadState(currentRead, { unreadCount: patch.unreadCount })
        : patch.unreadCountDelta !== undefined
          ? mergeChatReadState(currentRead, {
              unreadCount: resolveConversationUnreadCountDelta(
                readStateToUnreadBit(currentRead),
                patch.unreadCountDelta
              ),
            })
          : currentRead;
  const currentUnreadCount = readStateToUnreadBit(currentRead);
  const nextUnreadCount = readStateToUnreadBit(nextRead);
  const nextLastMessageStatus = String(
    patch.lastMessageStatus || current?.lastMessageStatus || 'sent'
  ) as ChatMessageStatus;
  const nextUpdatedAt =
    patch.shouldMoveToTop || patch.lastMessageAt !== undefined
      ? nextLastMessageAt || Date.now()
      : Number(current?.updatedAt || nextLastMessageAt || Date.now());
  const persistedLastMessageAt = nextLastMessageAt || Date.now();
  const persistedUpdatedAt = nextUpdatedAt || Date.now();
  const nextKeys: ConversationDirectoryKeys = {
    agentKey: patchAgentKey !== undefined ? patchAgentKey : currentKeys.agentKey,
    teamId: patchTeamId !== undefined ? patchTeamId : currentKeys.teamId,
  };
  const keysChanged = didDirectoryKeysChange(currentKeys, nextKeys);
  const summaryChanged =
    !current ||
    nextTitle !== current.title ||
    nextLastMessageText !== current.lastMessageText ||
    persistedLastMessageAt !== current.lastMessageAt ||
    !areReadStatesEqual(nextRead, currentRead) ||
    nextLastMessageStatus !== current.lastMessageStatus ||
    persistedUpdatedAt !== current.updatedAt ||
    keysChanged;

  if (summaryChanged) {
    await chatDb
      .update(conversations)
      .set({
        title: nextTitle,
        lastMessageText: nextLastMessageText,
        lastMessageAt: persistedLastMessageAt,
        unreadCount: nextUnreadCount,
        isRead: nextRead.isRead ? 1 : 0,
        readAt: nextRead.readAt,
        readRunId: nextRead.readRunId,
        lastMessageStatus: nextLastMessageStatus,
        updatedAt: persistedUpdatedAt,
        agentKey: nextKeys.agentKey,
        teamId: nextKeys.teamId,
      })
      .where(eq(conversations.id, conversationId));
  }

  const nextSummary = await getConversationDetail(conversationId);
  if (!nextSummary) {
    return null;
  }

  const shouldRefreshDirectory =
    keysChanged ||
    !current ||
    nextLastMessageAt !== current.lastMessageAt ||
    nextUnreadCount !== currentUnreadCount;
  const directoryChanged = shouldRefreshDirectory
    ? await refreshChatDirectoryProjectionForKeys([currentKeys, nextKeys])
    : false;
  return {
    summary: nextSummary,
    changed: summaryChanged,
    directoryChanged,
  };
}

export async function applyConversationSummaryPatch(patch: ConversationSummaryPatch) {
  return writeConversationSummaryPatch(patch);
}

export async function patchConversationSummary(patch: ConversationSummaryPatch) {
  return writeConversationSummaryPatch(patch);
}

export async function incrementConversationUnread(conversationId: string, delta: number = 1) {
  return writeConversationSummaryPatch({
    conversationId,
    unreadCountDelta: delta,
  });
}

export async function setConversationReadStateLocal(
  conversationId: string,
  readInput: ChatReadStateInput,
  scope?: ConversationReadScope,
  options?: {
    onlyIfUnread?: boolean;
  }
): Promise<ConversationUnreadLocalResult | null> {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  const current = await getConversationSummaryRow(normalizedConversationId);
  if (!current) {
    return null;
  }

  const currentRead = mapConversationReadState(current);
  const nextRead = mergeChatReadState(currentRead, readInput);
  const nextUnreadCount = readStateToUnreadBit(nextRead);
  const currentKeys: ConversationDirectoryKeys = {
    agentKey: current.agentKey || null,
    teamId: current.teamId || null,
  };
  const patchAgentKey = normalizeProvidedDirectoryKey(scope?.agentKey);
  const patchTeamId = normalizeProvidedDirectoryKey(scope?.teamId);
  const nextKeys: ConversationDirectoryKeys = {
    agentKey: patchAgentKey !== undefined ? patchAgentKey : currentKeys.agentKey,
    teamId: patchTeamId !== undefined ? patchTeamId : currentKeys.teamId,
  };
  const keysChanged = didDirectoryKeysChange(currentKeys, nextKeys);
  const readChanged = !areReadStatesEqual(currentRead, nextRead);
  if (options?.onlyIfUnread && currentRead.isRead && !keysChanged) {
    return {
      summary: mapChatHomeItem(current),
      changed: false,
      directoryChanged: false,
    };
  }

  if (!readChanged && !keysChanged) {
    return {
      summary: mapChatHomeItem(current),
      changed: false,
      directoryChanged: false,
    };
  }

  await chatDb
    .update(conversations)
    .set({
      unreadCount: nextUnreadCount,
      isRead: nextRead.isRead ? 1 : 0,
      readAt: nextRead.readAt,
      readRunId: nextRead.readRunId,
      agentKey: nextKeys.agentKey,
      teamId: nextKeys.teamId,
    })
    .where(eq(conversations.id, normalizedConversationId));
  const directoryChanged = await refreshChatDirectoryProjectionForKeys([currentKeys, nextKeys]);
  const summary = await getConversationDetail(normalizedConversationId);
  return summary
    ? {
        summary,
        changed: true,
        directoryChanged,
      }
    : null;
}

export async function setConversationUnreadCountLocal(
  conversationId: string,
  unreadCount: number,
  scope?: ConversationReadScope
): Promise<ConversationUnreadLocalResult | null> {
  return setConversationReadStateLocal(conversationId, { unreadCount }, scope);
}

export async function markConversationReadLocal(
  conversationId: string,
  options?: {
    readAt?: number;
    readRunId?: string | null;
  }
) {
  return setConversationReadStateLocal(
    conversationId,
    {
      read: {
        isRead: true,
        readAt: options?.readAt ?? Date.now(),
        readRunId: options?.readRunId ?? null,
      },
    },
    undefined,
    { onlyIfUnread: true }
  );
}

export async function markConversationUnreadLocal(conversationId: string) {
  return setConversationReadStateLocal(conversationId, { read: { isRead: false } });
}

export async function markConversationReadScopeLocal(scope: ConversationReadScope): Promise<{
  changedActiveConversationId: string | null;
  directoryChanged: boolean;
}> {
  await ensureChatDatabase();

  const agentKey = String(scope.agentKey || '').trim();
  const teamId = String(scope.teamId || '').trim();
  if (!agentKey && !teamId) {
    return {
      changedActiveConversationId: null,
      directoryChanged: false,
    };
  }

  const whereConditions = [eq(conversations.isRead, 0)];
  if (agentKey) {
    whereConditions.push(eq(conversations.agentKey, agentKey));
  }
  if (teamId) {
    whereConditions.push(eq(conversations.teamId, teamId));
  }

  const whereClause = and(...whereConditions);
  const activeConversationId = String(scope.activeConversationId || '').trim();
  const [changedCountRows, affectedKeyRows, activeRows] = await Promise.all([
    chatDb.select({ value: count() }).from(conversations).where(whereClause),
    chatDb
      .select({
        agentKey: conversations.agentKey,
        teamId: conversations.teamId,
      })
      .from(conversations)
      .where(whereClause)
      .groupBy(conversations.agentKey, conversations.teamId),
    activeConversationId
      ? chatDb
          .select({
            conversationId: conversations.id,
          })
          .from(conversations)
          .where(and(whereClause, eq(conversations.id, activeConversationId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (Number(changedCountRows[0]?.value || 0) <= 0) {
    return {
      changedActiveConversationId: null,
      directoryChanged: false,
    };
  }

  await chatDb
    .update(conversations)
    .set({
      unreadCount: 0,
      isRead: 1,
      readAt: Date.now(),
      readRunId: null,
    })
    .where(whereClause);
  const directoryChanged = await refreshChatDirectoryProjectionForKeys(
    affectedKeyRows.map((row) => ({
      agentKey: row.agentKey || null,
      teamId: row.teamId || null,
    }))
  );

  return {
    changedActiveConversationId: activeRows[0]?.conversationId || null,
    directoryChanged,
  };
}

export async function setConversationPinned(conversationId: string, pinned: boolean) {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  const current = await getConversationSummaryRow(normalizedConversationId);
  if (!current) {
    return null;
  }

  const currentPinnedAt = Number(current.pinnedAt || 0);
  const nextPinnedAt = pinned ? currentPinnedAt || Date.now() : 0;
  if (currentPinnedAt === nextPinnedAt) {
    return mapChatHomeItem(current);
  }

  await chatDb
    .update(conversations)
    .set({ pinnedAt: nextPinnedAt })
    .where(eq(conversations.id, normalizedConversationId));
  return getConversationDetail(normalizedConversationId);
}

function normalizeChatDirectoryItem(
  item: ChatDirectoryProjectionItem
): ChatDirectoryProjectionItem | null {
  const id = String(item.id || '').trim();
  const title = String(item.title || '').trim();
  if (!id || !title) {
    return null;
  }

  return {
    id,
    kind: item.kind === 'team' ? 'team' : 'agent',
    title,
    subtitle: String(item.subtitle || '').trim(),
    icon: normalizeAgentAvatarIcon(item.icon),
    unreadCount: Math.max(0, Math.trunc(Number(item.unreadCount || 0))),
    pinnedAt: Number(item.pinnedAt || 0) > 0 ? Number(item.pinnedAt || 0) : 0,
    sortRank: Number.isFinite(Number(item.sortRank)) ? Number(item.sortRank) : 0,
    agentKey: item.agentKey ? String(item.agentKey).trim() || null : null,
    teamId: item.teamId ? String(item.teamId).trim() || null : null,
    defaultAgentKey: item.defaultAgentKey ? String(item.defaultAgentKey).trim() || null : null,
    agentMode: normalizeAgentMode(item.agentMode),
    modelKey: item.modelKey ? String(item.modelKey).trim() || null : null,
    reasoningEffort: normalizeChatReasoningEffort(item.reasoningEffort),
    latestConversationId: item.latestConversationId
      ? String(item.latestConversationId).trim() || null
      : null,
    unreadCountSource:
      item.unreadCountSource === 'server' || item.unreadCountSource === 'projection'
        ? item.unreadCountSource
        : undefined,
  };
}

function normalizeDirectoryProjectionKeys(
  keys: readonly (string | null | undefined)[]
): string[] {
  return Array.from(
    new Set(keys.map((item) => String(item || '').trim()).filter(Boolean))
  );
}

function buildDirectoryProjectionChange(
  target: DirectoryProjectionTargetRow,
  projection: ConversationDirectoryProjection
): DirectoryProjectionChange | null {
  if (
    (target.latestConversationId || null) === projection.latestConversationId &&
    clampUnreadCount(Number(target.unreadCount || 0)) === projection.unreadCount
  ) {
    return null;
  }

  return {
    id: target.id,
    latestConversationId: projection.latestConversationId,
    unreadCount: projection.unreadCount,
  };
}

async function loadDirectoryProjectionTargets(
  kind: DirectoryProjectionKind,
  keys: readonly string[]
): Promise<DirectoryProjectionTargetRow[]> {
  if (keys.length <= 0) {
    return [];
  }

  const scopeColumn = kind === 'agent' ? chatDirectoryItems.agentKey : chatDirectoryItems.teamId;
  const rows = await chatDb
    .select({
      id: chatDirectoryItems.id,
      scopeKey: scopeColumn,
      latestConversationId: chatDirectoryItems.latestConversationId,
      unreadCount: chatDirectoryItems.unreadCount,
    })
    .from(chatDirectoryItems)
    .where(inArray(scopeColumn, keys));

  return rows
    .map((row) => ({
      id: row.id,
      scopeKey: String(row.scopeKey || '').trim(),
      latestConversationId: row.latestConversationId || null,
      unreadCount: clampUnreadCount(Number(row.unreadCount || 0)),
    }))
    .filter((row) => Boolean(row.scopeKey));
}

async function loadLatestConversationIdsByScope(
  kind: DirectoryProjectionKind,
  keys: readonly string[]
): Promise<Map<string, string>> {
  if (keys.length <= 0) {
    return new Map();
  }

  const scopeColumn = sql.raw(kind === 'agent' ? 'agent_key' : 'team_id');
  const scopeValues = sql.join(keys.map((key) => sql`${key}`), sql`, `);
  const rows = await chatDb.all<LatestConversationScopeRow>(sql`
    SELECT scope_key, conversation_id
    FROM (
      SELECT
        ${scopeColumn} AS scope_key,
        id AS conversation_id,
        row_number() OVER (
          PARTITION BY ${scopeColumn}
          ORDER BY last_message_at DESC, updated_at DESC, id ASC
        ) AS row_rank
      FROM conversations
      WHERE ${scopeColumn} IN (${scopeValues})
        AND length(trim(last_message_text)) > 0
    )
    WHERE row_rank = 1
  `);

  return new Map(
    rows
      .map((row) => [String(row.scope_key || '').trim(), String(row.conversation_id || '').trim()] as const)
      .filter(([scopeKey, conversationId]) => Boolean(scopeKey && conversationId))
  );
}

async function loadUnreadCountsByScope(
  kind: DirectoryProjectionKind,
  keys: readonly string[]
): Promise<Map<string, number>> {
  if (keys.length <= 0) {
    return new Map();
  }

  const scopeColumn = kind === 'agent' ? conversations.agentKey : conversations.teamId;
  const rows = await chatDb
    .select({
      scopeKey: scopeColumn,
      value: count(),
    })
    .from(conversations)
    .where(and(inArray(scopeColumn, keys), eq(conversations.isRead, 0)))
    .groupBy(scopeColumn);

  return new Map(
    rows
      .map((row) => [String(row.scopeKey || '').trim(), clampUnreadCount(Number(row.value || 0))] as const)
      .filter(([scopeKey]) => Boolean(scopeKey))
  );
}

async function collectDirectoryProjectionChanges(
  kind: DirectoryProjectionKind,
  rawKeys: readonly string[]
): Promise<DirectoryProjectionChange[]> {
  const keys = normalizeDirectoryProjectionKeys(rawKeys);
  if (keys.length <= 0) {
    return [];
  }

  const targets = await loadDirectoryProjectionTargets(kind, keys);
  if (targets.length <= 0) {
    return [];
  }

  const targetKeys = normalizeDirectoryProjectionKeys(targets.map((row) => row.scopeKey));
  const [latestConversationIdByScope, unreadCountByScope] = await Promise.all([
    loadLatestConversationIdsByScope(kind, targetKeys),
    loadUnreadCountsByScope(kind, targetKeys),
  ]);
  const changes: DirectoryProjectionChange[] = [];

  for (const target of targets) {
    const change = buildDirectoryProjectionChange(target, {
      latestConversationId: latestConversationIdByScope.get(target.scopeKey) || null,
      unreadCount: unreadCountByScope.get(target.scopeKey) || 0,
    });
    if (change) {
      changes.push(change);
    }
  }

  return changes;
}

async function refreshChatDirectoryProjectionForKeys(
  keys: ConversationDirectoryKeys[]
): Promise<boolean> {
  const agentKeys = normalizeDirectoryProjectionKeys(keys.map((item) => item.agentKey));
  const teamIds = normalizeDirectoryProjectionKeys(keys.map((item) => item.teamId));
  const [agentChanges, teamChanges] = await Promise.all([
    collectDirectoryProjectionChanges('agent', agentKeys),
    collectDirectoryProjectionChanges('team', teamIds),
  ]);
  const changes = [...agentChanges, ...teamChanges];
  if (changes.length <= 0) {
    return false;
  }

  chatDb.transaction((tx) => {
    for (const change of changes) {
      tx.update(chatDirectoryItems)
        .set({
          latestConversationId: change.latestConversationId,
          unreadCount: change.unreadCount,
        })
        .where(eq(chatDirectoryItems.id, change.id))
        .run();
    }
  });
  await refreshChatDirectorySnapshot();
  return true;
}

export async function refreshChatDirectoryProjectionForConversation(
  conversationId: string
): Promise<boolean> {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return false;
  }

  const keys = await getConversationDirectoryKeys(normalizedConversationId);
  if (!keys?.agentKey && !keys?.teamId) {
    return false;
  }

  return refreshChatDirectoryProjectionForKeys([keys]);
}

function normalizeConversationSummaryProjection(
  item: ChatConversationSummaryProjection
): ChatConversationSummaryProjection | null {
  const conversationId = String(item.conversationId || '').trim();
  if (!conversationId) {
    return null;
  }

  const lastMessageAt = Number.isFinite(Number(item.lastMessageAt))
    ? Number(item.lastMessageAt)
    : Date.now();

  const read =
    item.read !== undefined
      ? normalizeChatReadState(item.read)
      : item.unreadCount !== undefined
        ? normalizeChatReadState({ unreadCount: item.unreadCount })
        : undefined;

  return {
    conversationId,
    title: String(item.title || conversationId).trim() || conversationId,
    lastMessageText: String(item.lastMessageText || ''),
    lastMessageAt,
    ...(read ? { unreadCount: readStateToUnreadBit(read), read } : {}),
    lastMessageStatus: (item.lastMessageStatus || 'sent') as ChatMessageStatus,
    agentKey: item.agentKey ? String(item.agentKey).trim() || null : null,
    teamId: item.teamId ? String(item.teamId).trim() || null : null,
  };
}

export async function replaceChatHomeProjection(input: ChatHomeProjection) {
  await ensureChatDatabase();

  const conversationById = new Map<string, ChatConversationSummaryProjection>();
  input.conversationSummaries.forEach((item) => {
    const normalized = normalizeConversationSummaryProjection(item);
    if (!normalized) {
      return;
    }

    const current = conversationById.get(normalized.conversationId);
    if (!current || normalized.lastMessageAt >= current.lastMessageAt) {
      conversationById.set(normalized.conversationId, normalized);
    }
  });

  const directoryById = new Map<string, ChatDirectoryProjectionItem>();
  input.directoryItems.forEach((item) => {
    const normalized = normalizeChatDirectoryItem(item);
    if (normalized && !directoryById.has(normalized.id)) {
      directoryById.set(normalized.id, normalized);
    }
  });

  const normalizedConversations = Array.from(conversationById.values());
  const normalizedDirectoryItems = Array.from(directoryById.values());
  const conversationIds = normalizedConversations.map((item) => item.conversationId);
  const directoryIds = normalizedDirectoryItems.map((item) => item.id);

  chatDb.transaction((tx) => {
    const existingConversationRows =
      conversationIds.length > 0
        ? tx
            .select({
              id: conversations.id,
              pinnedAt: conversations.pinnedAt,
              unreadCount: conversations.unreadCount,
              isRead: conversations.isRead,
              readAt: conversations.readAt,
              readRunId: conversations.readRunId,
            })
            .from(conversations)
            .where(inArray(conversations.id, conversationIds))
            .all()
        : [];
    const conversationPinnedById = new Map(
      existingConversationRows.map((row) => [row.id, Number(row.pinnedAt || 0)])
    );
    const conversationReadById = new Map(
      existingConversationRows.map((row) => [row.id, mapConversationReadState(row)])
    );
    const unreadByAgentKey = new Map<string, number>();
    const unreadByTeamId = new Map<string, number>();

    for (const item of normalizedConversations) {
      const existing = conversationPinnedById.has(item.conversationId);
      const read =
        normalizeChatReadPatch(item.read ?? { unreadCount: item.unreadCount }) ??
        conversationReadById.get(item.conversationId) ??
        normalizeChatReadState({ read: { isRead: true } });
      const unreadBit = readStateToUnreadBit(read);
      if (unreadBit > 0 && item.agentKey) {
        unreadByAgentKey.set(item.agentKey, (unreadByAgentKey.get(item.agentKey) || 0) + 1);
      }
      if (unreadBit > 0 && item.teamId) {
        unreadByTeamId.set(item.teamId, (unreadByTeamId.get(item.teamId) || 0) + 1);
      }
      const values = {
        title: item.title,
        lastMessageText: item.lastMessageText,
        lastMessageAt: item.lastMessageAt,
        unreadCount: unreadBit,
        isRead: read.isRead ? 1 : 0,
        readAt: read.readAt,
        readRunId: read.readRunId,
        lastMessageStatus: item.lastMessageStatus,
        updatedAt: item.lastMessageAt,
        agentKey: item.agentKey,
        teamId: item.teamId,
      };

      if (existing) {
        tx.update(conversations).set(values).where(eq(conversations.id, item.conversationId)).run();
        continue;
      }

      tx.insert(conversations)
        .values({
          id: item.conversationId,
          pinnedAt: 0,
          ...values,
        })
        .run();
    }

    const existingDirectoryRows = tx
      .select({
        id: chatDirectoryItems.id,
        pinnedAt: chatDirectoryItems.pinnedAt,
      })
      .from(chatDirectoryItems)
      .all();
    const directoryPinnedById = new Map(
      existingDirectoryRows.map((row) => [row.id, Number(row.pinnedAt || 0)])
    );

    if (directoryIds.length <= 0) {
      tx.delete(chatDirectoryItems).run();
      return;
    }

    tx.delete(chatDirectoryItems).where(notInArray(chatDirectoryItems.id, directoryIds)).run();

    for (const item of normalizedDirectoryItems) {
      const pinnedAt = directoryPinnedById.get(item.id) || item.pinnedAt;
      const existing = directoryPinnedById.has(item.id);
      const knownConversationUnreadCount =
        item.kind === 'team'
          ? unreadByTeamId.get(item.teamId || '') || 0
          : unreadByAgentKey.get(item.agentKey || '') || 0;
      const unreadCount =
        item.unreadCountSource === 'projection' ? knownConversationUnreadCount : item.unreadCount;
      const values = {
        kind: item.kind,
        title: item.title,
        subtitle: item.subtitle,
        iconName: item.icon?.name ?? null,
        iconColor: item.icon?.color ?? null,
        iconUri: item.icon?.uri ?? null,
        unreadCount,
        pinnedAt,
        sortRank: item.sortRank,
        agentKey: item.agentKey,
        teamId: item.teamId,
        defaultAgentKey: item.defaultAgentKey,
        agentMode: item.agentMode,
        modelKey: item.modelKey,
        reasoningEffort: item.reasoningEffort,
        latestConversationId: item.latestConversationId,
      };

      if (existing) {
        tx.update(chatDirectoryItems).set(values).where(eq(chatDirectoryItems.id, item.id)).run();
        continue;
      }

      tx.insert(chatDirectoryItems)
        .values({
          id: item.id,
          ...values,
        })
        .run();
    }
  });

  await refreshChatDirectorySnapshot();
}

export async function refreshChatDirectorySnapshot(pageSize: number = CHAT_DIRECTORY_DEFAULT_PAGE_SIZE) {
  const firstPage = await getChatDirectoryPage(1, pageSize);
  writeChatDirectorySnapshot(firstPage.items);
  return firstPage.items;
}

export async function setChatDirectoryItemPinned(itemId: string, pinned: boolean) {
  await ensureChatDatabase();

  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) {
    return null;
  }

  const rows = await chatDb
    .select(CHAT_DIRECTORY_ITEM_SELECT)
    .from(chatDirectoryItems)
    .where(eq(chatDirectoryItems.id, normalizedItemId))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return null;
  }

  const currentPinnedAt = Number(current.pinnedAt || 0);
  const nextPinnedAt = pinned ? currentPinnedAt || Date.now() : 0;
  if (currentPinnedAt !== nextPinnedAt) {
    await chatDb
      .update(chatDirectoryItems)
      .set({ pinnedAt: nextPinnedAt })
      .where(eq(chatDirectoryItems.id, normalizedItemId));
    await refreshChatDirectorySnapshot();
  }

  const nextRows = await chatDb
    .select(CHAT_DIRECTORY_ITEM_WITH_SUMMARY_SELECT)
    .from(chatDirectoryItems)
    .leftJoin(conversations, eq(chatDirectoryItems.latestConversationId, conversations.id))
    .where(eq(chatDirectoryItems.id, normalizedItemId))
    .limit(1);
  return nextRows[0] ? mapChatDirectoryItem(nextRows[0]) : null;
}

async function isPersistedTimelineNodeActive(conversationId: string, nodeId: string): Promise<boolean> {
  const rows = await chatDb
    .select({
      payloadJson: conversationTimelineNodes.payloadJson,
    })
    .from(conversationTimelineNodes)
    .where(
      and(
        eq(conversationTimelineNodes.conversationId, conversationId),
        eq(conversationTimelineNodes.nodeId, nodeId)
      )
    )
    .limit(1);

  return isActiveTimelinePayload(rows[0]?.payloadJson);
}

async function isPersistedTimelineTailActive(conversationId: string): Promise<boolean> {
  const rows = await chatDb
    .select({
      payloadJson: conversationTimelineNodes.payloadJson,
    })
    .from(conversationTimelineNodes)
    .where(eq(conversationTimelineNodes.conversationId, conversationId))
    .orderBy(desc(conversationTimelineNodes.orderIndex))
    .limit(1);

  return isActiveTimelinePayload(rows[0]?.payloadJson);
}

async function getOpenableLatestConversation(
  conversationId: string | null | undefined
): Promise<ChatHomeItem | null> {
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  const rows = await chatDb
    .select({
      ...CHAT_HOME_ITEM_SELECT,
      timelineConversationId: conversationTimelineMeta.conversationId,
      activeRunId: conversationTimelineMeta.activeRunId,
      awaitingId: conversationTimelineMeta.awaitingId,
    })
    .from(conversations)
    .leftJoin(conversationTimelineMeta, eq(conversations.id, conversationTimelineMeta.conversationId))
    .where(eq(conversations.id, normalizedConversationId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const conversation = mapChatHomeItem(row);
  if (shouldOpenLatestConversationFromSummary(row)) {
    return conversation;
  }

  const awaitingId = String(row.awaitingId || '').trim();
  if (awaitingId && (await isPersistedTimelineNodeActive(normalizedConversationId, awaitingId))) {
    return conversation;
  }

  if (row.timelineConversationId && (await isPersistedTimelineTailActive(normalizedConversationId))) {
    return conversation;
  }

  return null;
}

export async function resolveDirectoryItemConversationOpenTarget(
  itemId: string
): Promise<DirectoryConversationOpenResult | null> {
  await ensureChatDatabase();

  const openScope = await getDirectoryItemOpenScope(itemId);
  if (!openScope) {
    return null;
  }
  const { directoryItem, historyScope } = openScope;

  const latestConversation = await getOpenableLatestConversation(directoryItem.latestConversationId);
  if (latestConversation) {
    return {
      conversation: latestConversation,
      historyScope,
      skipInitialReconcile: false,
    };
  }

  return createLocalConversationForHistoryScope(historyScope, directoryItem.title);
}

export async function createConversationForDirectoryItem(
  itemId: string
): Promise<DirectoryConversationOpenResult | null> {
  await ensureChatDatabase();

  const openScope = await getDirectoryItemOpenScope(itemId);
  if (!openScope) {
    return null;
  }
  const { directoryItem, historyScope } = openScope;

  return createLocalConversationForHistoryScope(historyScope, directoryItem.title);
}

export async function createConversationForHistoryScope(
  scope: ChatConversationHistoryScope,
  title?: string | null
): Promise<DirectoryConversationOpenResult | null> {
  await ensureChatDatabase();

  return createLocalConversationForHistoryScope(scope, title);
}

export async function replaceChatDirectoryItems(items: ChatDirectoryProjectionItem[]) {
  return replaceChatHomeProjection({
    directoryItems: items,
    conversationSummaries: [],
  });
}

export async function getChatDirectoryPage(
  page: number,
  pageSize: number = CHAT_DIRECTORY_DEFAULT_PAGE_SIZE
): Promise<ChatDirectoryPage> {
  await ensureChatDatabase();

  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * pageSize;

  const [rows, totals] = await Promise.all([
    chatDb
      .select(CHAT_DIRECTORY_ITEM_WITH_SUMMARY_SELECT)
      .from(chatDirectoryItems)
      .leftJoin(conversations, eq(chatDirectoryItems.latestConversationId, conversations.id))
      .orderBy(...CHAT_DIRECTORY_PINNED_ORDER)
      .limit(pageSize)
      .offset(offset),
    chatDb.select({ value: count() }).from(chatDirectoryItems),
  ]);

  return {
    items: rows.map(mapChatDirectoryItem),
    total: totals[0]?.value ?? 0,
    page: safePage,
    pageSize,
  };
}

export async function getChatDirectorySlice(
  limit: number
): Promise<{ items: ChatDirectoryItem[]; total: number; pinnedTotal: number }> {
  await ensureChatDatabase();

  const safeLimit = Math.max(1, limit);
  const [rows, totals] = await Promise.all([
    chatDb
      .select(CHAT_DIRECTORY_ITEM_WITH_SUMMARY_SELECT)
      .from(chatDirectoryItems)
      .leftJoin(conversations, eq(chatDirectoryItems.latestConversationId, conversations.id))
      .orderBy(...CHAT_DIRECTORY_PINNED_ORDER)
      .limit(safeLimit),
    chatDb.select({
      total: count(),
      pinnedTotal: getPinnedDirectoryCountExpression(),
    }).from(chatDirectoryItems),
  ]);
  const countRow = totals[0];

  return {
    items: rows.map(mapChatDirectoryItem),
    total: normalizeCountValue(countRow?.total),
    pinnedTotal: normalizeCountValue(countRow?.pinnedTotal),
  };
}

export async function getCollapsedChatDirectorySlice(
  limit: number
): Promise<{ items: ChatDirectoryItem[]; total: number; pinnedTotal: number }> {
  await ensureChatDatabase();

  const safeLimit = Math.max(1, limit);
  const [rows, totals] = await Promise.all([
    chatDb
      .select(CHAT_DIRECTORY_ITEM_WITH_SUMMARY_SELECT)
      .from(chatDirectoryItems)
      .leftJoin(conversations, eq(chatDirectoryItems.latestConversationId, conversations.id))
      .where(eq(chatDirectoryItems.pinnedAt, 0))
      .orderBy(...CHAT_DIRECTORY_RECENCY_ORDER)
      .limit(safeLimit),
    chatDb.select({
      total: getUnpinnedDirectoryCountExpression(),
      pinnedTotal: getPinnedDirectoryCountExpression(),
    }).from(chatDirectoryItems),
  ]);
  const countRow = totals[0];

  return {
    items: rows.map(mapChatDirectoryItem),
    total: normalizeCountValue(countRow?.total),
    pinnedTotal: normalizeCountValue(countRow?.pinnedTotal),
  };
}

export async function getChatDirectoryCatalogPage(
  page: number,
  pageSize: number = CHAT_DIRECTORY_DEFAULT_PAGE_SIZE
): Promise<ChatDirectoryPage> {
  await ensureChatDatabase();

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const offset = (safePage - 1) * safePageSize;
  const [rows, totals] = await Promise.all([
    chatDb
      .select(CHAT_DIRECTORY_ITEM_WITH_SUMMARY_SELECT)
      .from(chatDirectoryItems)
      .leftJoin(conversations, eq(chatDirectoryItems.latestConversationId, conversations.id))
      .orderBy(...CHAT_DIRECTORY_STABLE_ORDER)
      .limit(safePageSize)
      .offset(offset),
    chatDb.select({ value: count() }).from(chatDirectoryItems),
  ]);

  return {
    items: rows.map(mapChatDirectoryItem),
    total: totals[0]?.value ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function removeConversation(conversationId: string) {
  await ensureChatDatabase();
  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return;
  }

  const keys = await getConversationDirectoryKeys(normalizedConversationId);

  await chatDb
    .delete(conversationTimelineNodes)
    .where(eq(conversationTimelineNodes.conversationId, normalizedConversationId));
  await chatDb
    .delete(conversationTimelineMeta)
    .where(eq(conversationTimelineMeta.conversationId, normalizedConversationId));
  await chatDb
    .delete(outboxMessages)
    .where(eq(outboxMessages.conversationId, normalizedConversationId));
  await chatDb
    .delete(messageAttachments)
    .where(eq(messageAttachments.conversationId, normalizedConversationId));
  await chatDb.delete(messages).where(eq(messages.conversationId, normalizedConversationId));
  await chatDb
    .delete(conversationSyncState)
    .where(eq(conversationSyncState.conversationId, normalizedConversationId));
  await chatDb.delete(conversations).where(eq(conversations.id, normalizedConversationId));

  if (keys?.agentKey || keys?.teamId) {
    await refreshChatDirectoryProjectionForKeys([keys]);
  } else {
    await refreshChatDirectorySnapshot();
  }
}

export async function clearChatLocalCache() {
  await ensureChatDatabase();
  await chatDb.delete(conversationTimelineNodes);
  await chatDb.delete(conversationTimelineMeta);
  await chatDb.delete(conversationSyncState);
  await chatDb.delete(messageAttachments);
  await chatDb.delete(messages);
  await chatDb.delete(outboxMessages);
  await chatDb.delete(conversations);
  await chatDb.delete(chatDirectoryItems);
  clearChatDirectorySnapshot();
}

export async function prewarmChatHomeDirectory(pageSize: number = CHAT_DIRECTORY_DEFAULT_PAGE_SIZE) {
  if (chatHomeDirectoryPrewarmPromise) {
    return chatHomeDirectoryPrewarmPromise;
  }

  chatHomeDirectoryPrewarmPromise = (async () => {
    const directory = await getChatDirectorySlice(pageSize);

    if (directory.items.length > 0 || directory.total > 0) {
      writeChatDirectorySnapshot(directory.items);
    }

    return directory;
  })().finally(() => {
    chatHomeDirectoryPrewarmPromise = null;
  });

  return chatHomeDirectoryPrewarmPromise;
}

function getConversationHistoryWhereClause(scope?: Partial<ChatConversationHistoryScope> | null) {
  const normalizedScope = normalizeChatConversationHistoryScope(scope);
  if (!normalizedScope) {
    return null;
  }

  return normalizedScope.teamId
    ? eq(conversations.teamId, normalizedScope.teamId)
    : eq(conversations.agentKey, normalizedScope.agentKey || '');
}

export async function getConversationHistoryScope(
  conversationId: string
): Promise<ChatConversationHistoryScope | null> {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  const rows = await chatDb
    .select({
      agentKey: conversations.agentKey,
      teamId: conversations.teamId,
    })
    .from(conversations)
    .where(eq(conversations.id, normalizedConversationId))
    .limit(1);

  return normalizeChatConversationHistoryScope(rows[0] ?? null);
}

export async function getConversationHistorySlice(
  scope?: Partial<ChatConversationHistoryScope> | null,
  limit: number = 20
): Promise<ChatConversationHistoryPage> {
  await ensureChatDatabase();

  const safeLimit = Math.max(1, Math.trunc(Number(limit) || 20));
  const whereClause = getConversationHistoryWhereClause(scope);
  if (!whereClause) {
    return {
      items: [],
      total: 0,
      unreadTotal: 0,
      limit: safeLimit,
    };
  }

  const historyWhereClause = and(whereClause, CONVERSATION_HISTORY_VISIBLE_FILTER);

  const [rows, totalRows, unreadRows] = await Promise.all([
    chatDb
      .select(CHAT_HOME_ITEM_SELECT)
      .from(conversations)
      .where(historyWhereClause)
      .orderBy(...CONVERSATION_RECENCY_ORDER)
      .limit(safeLimit),
    chatDb.select({ value: count() }).from(conversations).where(historyWhereClause),
    chatDb
      .select({ value: count() })
      .from(conversations)
      .where(and(historyWhereClause, eq(conversations.isRead, 0))),
  ]);

  return {
    items: rows.map(mapChatHomeItem),
    total: totalRows[0]?.value ?? 0,
    unreadTotal: unreadRows[0]?.value ?? 0,
    limit: safeLimit,
  };
}

export async function getConversationDetail(conversationId: string): Promise<ChatHomeItem | null> {
  await ensureChatDatabase();

  const conversationRows = await chatDb
    .select(CHAT_HOME_ITEM_SELECT)
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  const conversation = conversationRows[0];
  if (!conversation) {
    return null;
  }

  return mapChatHomeItem(conversation);
}

export async function getConversationTarget(conversationId: string): Promise<ChatConversationTarget | null> {
  await ensureChatDatabase();

  const keys = await getConversationDirectoryKeys(conversationId);
  const scopeValue = keys?.teamId || keys?.agentKey || '';
  if (!scopeValue) {
    return null;
  }

  const scopeColumn = keys?.teamId ? chatDirectoryItems.teamId : chatDirectoryItems.agentKey;
  const rows = await chatDb
    .select({
      kind: chatDirectoryItems.kind,
      title: chatDirectoryItems.title,
      subtitle: chatDirectoryItems.subtitle,
      agentKey: chatDirectoryItems.agentKey,
      teamId: chatDirectoryItems.teamId,
      defaultAgentKey: chatDirectoryItems.defaultAgentKey,
      agentMode: chatDirectoryItems.agentMode,
      modelKey: chatDirectoryItems.modelKey,
      reasoningEffort: chatDirectoryItems.reasoningEffort
    })
    .from(chatDirectoryItems)
    .where(eq(scopeColumn, scopeValue))
    .orderBy(...CHAT_DIRECTORY_STABLE_ORDER)
    .limit(1);

  return createChatConversationTarget(rows[0]);
}

export async function getConversationMessages(
  conversationId: string,
  limit: number = 20
): Promise<ChatMessageItem[]> {
  await ensureChatDatabase();

  const rows = await chatDb
    .select({
      messageId: messages.id,
      clientMessageId: messages.clientMessageId,
      serverMessageId: messages.serverMessageId,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      deliveryStatus: messages.deliveryStatus,
      errorReason: messages.errorReason,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return attachMessageAttachments(rows.map(mapChatMessageItem));
}

export async function getConversationInitialTimelineState(
  conversationId: string,
  limit: number = 60
): Promise<ChatTimelineState> {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return deriveChatTimelineStateFromMessages('', []);
  }

  const [metaRows, latestMessage] = await Promise.all([
    chatDb
      .select({
        conversationId: conversationTimelineMeta.conversationId,
        activeRunId: conversationTimelineMeta.activeRunId,
        awaitingId: conversationTimelineMeta.awaitingId,
        usageLabel: conversationTimelineMeta.usageLabel,
        updatedAt: conversationTimelineMeta.updatedAt,
        revision: conversationTimelineMeta.revision,
        nextOrder: conversationTimelineMeta.nextOrder,
        messageTailSignature: conversationTimelineMeta.messageTailSignature,
      })
      .from(conversationTimelineMeta)
      .where(eq(conversationTimelineMeta.conversationId, normalizedConversationId))
      .limit(1),
    getLatestConversationMessage(normalizedConversationId),
  ]);
  const metaRow = metaRows[0];
  const currentTailSignature = buildTailSignatureFromMessage(latestMessage);

  if (metaRow && metaRow.messageTailSignature === currentTailSignature) {
    const nodeRows = await chatDb
      .select({
        conversationId: conversationTimelineNodes.conversationId,
        nodeId: conversationTimelineNodes.nodeId,
        kind: conversationTimelineNodes.kind,
        runId: conversationTimelineNodes.runId,
        orderIndex: conversationTimelineNodes.orderIndex,
        createdAt: conversationTimelineNodes.createdAt,
        updatedAt: conversationTimelineNodes.updatedAt,
        payloadHash: conversationTimelineNodes.payloadHash,
        payloadJson: conversationTimelineNodes.payloadJson,
      })
      .from(conversationTimelineNodes)
      .where(eq(conversationTimelineNodes.conversationId, normalizedConversationId))
      .orderBy(asc(conversationTimelineNodes.orderIndex));
    const snapshot = deserializeChatTimelineState(
      mapSerializedTimelineMetaRow(metaRow),
      nodeRows.map(mapSerializedTimelineNodeRow)
    );
    if (snapshot) {
      return snapshot;
    }
  }

  const fallbackMessages = await getConversationMessages(normalizedConversationId, limit);
  return deriveChatTimelineStateFromMessages(normalizedConversationId, fallbackMessages.reverse());
}

export async function persistConversationTimelineState(state: ChatTimelineState) {
  await ensureChatDatabase();

  const conversationId = String(state.conversationId || '').trim();
  if (!conversationId) {
    return null;
  }

  await ensureConversationRecord(conversationId, state.updatedAt || Date.now());
  const messageTailSignature = buildTailSignatureFromTimelineState(state);
  chatDb.transaction((tx) => {
    writeTimelineSnapshotInTransaction(tx, state, messageTailSignature);
  });
  return state;
}

export async function getConversationSyncState(
  conversationId: string
): Promise<ConversationSyncState | null> {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  const rows = await chatDb
    .select({
      conversationId: conversationSyncState.conversationId,
      activeRunId: conversationSyncState.activeRunId,
      lastSyncedAt: conversationSyncState.lastSyncedAt,
      dirtyReason: conversationSyncState.dirtyReason,
      tailSignature: conversationSyncState.tailSignature,
    })
    .from(conversationSyncState)
    .where(eq(conversationSyncState.conversationId, normalizedConversationId))
    .limit(1);

  return rows[0] ? mapConversationSyncStateRow(rows[0]) : null;
}

export async function replaceConversationProjection(input: {
  conversationId: string;
  title: string;
  unreadCount?: number;
  read?: ChatReadStateInput;
  activeRunId?: string;
  summary?: Partial<ChatHomeItem> | null;
  messages: ChatMessageItem[];
  timelineState?: ChatTimelineState | null;
}) {
  await ensureChatDatabase();

  const conversationId = String(input.conversationId || '').trim();
  if (!conversationId) {
    throw new Error('Conversation id is required');
  }

  const existingMessages = await getConversationMessages(conversationId, 500);
  const unsyncedLocalMessages = existingMessages.filter(
    (message) =>
      message.deliveryStatus !== 'sent' && message.clientMessageId && !message.serverMessageId
  );
  const pendingOutboxMessages = unsyncedLocalMessages.filter(
    (message) => message.clientMessageId && message.deliveryStatus === 'pending'
  );
  const pendingOutboxClientMessageIds = pendingOutboxMessages.map((message) =>
    String(message.clientMessageId)
  );
  const currentOutboxRows =
    pendingOutboxClientMessageIds.length > 0
      ? await chatDb
          .select({
            clientMessageId: outboxMessages.clientMessageId,
            planningMode: outboxMessages.planningMode,
          })
          .from(outboxMessages)
          .where(inArray(outboxMessages.clientMessageId, pendingOutboxClientMessageIds))
      : [];
  const currentOutboxPlanningModeByClientId = new Map(
    currentOutboxRows.map((row) => [row.clientMessageId, Number(row.planningMode) === 1])
  );
  const summaryTime = Number(
    input.summary?.lastMessageAt ||
      input.messages[input.messages.length - 1]?.createdAt ||
      Date.now()
  );

  const conversation = await ensureConversationRecord(conversationId, summaryTime, input.title);

  const projectedMessageRowsById = new Map<
    string,
    {
      id: string;
      clientMessageId: string | null;
      serverMessageId: string | null;
      conversationId: string;
      role: ChatMessageItem['role'];
      content: string;
      createdAt: number;
      deliveryStatus: ChatMessageItem['deliveryStatus'];
      errorReason: string | null;
      attachments: ChatMessageAttachment[];
    }
  >();
  [...input.messages, ...unsyncedLocalMessages]
    .sort((left, right) => left.createdAt - right.createdAt)
    .forEach((message) => {
      const id = normalizeMessageId(
        message.messageId,
        message.serverMessageId || message.clientMessageId || createLocalId('message')
      );
      projectedMessageRowsById.set(id, {
        id,
        clientMessageId: message.clientMessageId,
        serverMessageId: message.serverMessageId,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        deliveryStatus: message.deliveryStatus,
        errorReason: message.errorReason,
        attachments: message.attachments || [],
      });
    });
  const projectedMessageItems = [...projectedMessageRowsById.values()];
  const projectedMessages = projectedMessageItems.map((message) => ({
    id: message.id,
    clientMessageId: message.clientMessageId,
    serverMessageId: message.serverMessageId,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    deliveryStatus: message.deliveryStatus,
    errorReason: message.errorReason,
  }));
  const projectedAttachmentRows = projectedMessageItems.flatMap((message) =>
    buildMessageAttachmentInsertRows({
      conversationId,
      messageId: message.id,
      clientMessageId: message.clientMessageId,
      attachments: message.attachments,
      createdAt: message.createdAt,
    })
  );

  const pendingOutboxItems = pendingOutboxMessages.map((message) => ({
    clientMessageId: String(message.clientMessageId),
    conversationId: message.conversationId,
    content: message.content,
    planningMode: currentOutboxPlanningModeByClientId.get(String(message.clientMessageId)) ? 1 : 0,
    createdAt: message.createdAt,
  }));
  const latestProjectedMessage = projectedMessages[projectedMessages.length - 1] || null;
  const messageTailSignature = latestProjectedMessage
    ? buildTailSignatureFromMessage({
        messageId: latestProjectedMessage.id,
        createdAt: latestProjectedMessage.createdAt,
        content: latestProjectedMessage.content,
        deliveryStatus: latestProjectedMessage.deliveryStatus,
      })
    : '';
  const timelineStateToPersist = input.timelineState
    ? unsyncedLocalMessages.reduce<ChatTimelineState>(
        (state, message) => applyChatTimelineMessage(state, message),
        input.timelineState
      )
    : null;

  chatDb.transaction((tx) => {
    tx.delete(messageAttachments)
      .where(eq(messageAttachments.conversationId, conversationId))
      .run();
    tx.delete(messages).where(eq(messages.conversationId, conversationId)).run();

    if (projectedMessages.length > 0) {
      tx.insert(messages).values(projectedMessages).run();
    }

    if (projectedAttachmentRows.length > 0) {
      tx.insert(messageAttachments).values(projectedAttachmentRows).run();
    }

    tx.delete(outboxMessages).where(eq(outboxMessages.conversationId, conversationId)).run();

    if (pendingOutboxItems.length > 0) {
      tx.insert(outboxMessages).values(pendingOutboxItems).run();
    }

    if (projectedMessages.length > 0 && latestProjectedMessage) {
      const readOverride =
        input.read !== undefined
          ? input.read
          : input.unreadCount !== undefined
            ? { unreadCount: input.unreadCount }
            : undefined;
      const read =
        readOverride !== undefined
          ? normalizeChatReadState(readOverride)
          : mapConversationReadState(conversation);

      tx.update(conversations)
        .set({
          title: input.title || conversationId,
          lastMessageText: latestProjectedMessage.content,
          lastMessageAt: latestProjectedMessage.createdAt,
          unreadCount: readStateToUnreadBit(read),
          isRead: read.isRead ? 1 : 0,
          readAt: read.readAt,
          readRunId: read.readRunId,
          lastMessageStatus: latestProjectedMessage.deliveryStatus,
          updatedAt: latestProjectedMessage.createdAt,
        })
        .where(eq(conversations.id, conversationId))
        .run();
    } else {
      const read =
        input.read !== undefined
          ? normalizeChatReadState(input.read)
          : input.unreadCount !== undefined
            ? normalizeChatReadState({ unreadCount: input.unreadCount })
            : mapConversationReadState(conversation);
      tx.update(conversations)
        .set({
          title: input.title || conversationId,
          lastMessageText: String(input.summary?.lastMessageText || ''),
          lastMessageAt: summaryTime,
          unreadCount: readStateToUnreadBit(read),
          isRead: read.isRead ? 1 : 0,
          readAt: read.readAt,
          readRunId: read.readRunId,
          lastMessageStatus: (input.summary?.lastMessageStatus || 'sent') as ChatMessageStatus,
          updatedAt: summaryTime,
        })
        .where(eq(conversations.id, conversationId))
        .run();
    }

    const syncRows = tx
      .select({
        conversationId: conversationSyncState.conversationId,
      })
      .from(conversationSyncState)
      .where(eq(conversationSyncState.conversationId, conversationId))
      .limit(1)
      .all();
    const syncValues = {
      activeRunId: String(input.activeRunId || '').trim(),
      lastSyncedAt: Date.now(),
      dirtyReason: '',
      tailSignature: messageTailSignature,
    };

    if (syncRows[0]) {
      tx.update(conversationSyncState)
        .set(syncValues)
        .where(eq(conversationSyncState.conversationId, conversationId))
        .run();
    } else {
      tx.insert(conversationSyncState)
        .values({
          conversationId,
          ...syncValues,
        })
        .run();
    }

    if (timelineStateToPersist) {
      writeTimelineSnapshotInTransaction(
        tx,
        timelineStateToPersist,
        buildTailSignatureFromTimelineState(timelineStateToPersist)
      );
    }
  });

  return getConversationDetail(conversationId);
}

export async function markConversationDirty(conversationId: string, dirtyReason: string) {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  await ensureConversationRecord(normalizedConversationId, Date.now());
  return upsertConversationSyncState({
    conversationId: normalizedConversationId,
    dirtyReason: String(dirtyReason || '').trim(),
  });
}

export async function setConversationActiveRunId(conversationId: string, activeRunId: string) {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  await ensureConversationRecord(normalizedConversationId, Date.now());
  return upsertConversationSyncState({
    conversationId: normalizedConversationId,
    activeRunId: String(activeRunId || '').trim(),
  });
}

export async function markConversationSynced(
  conversationId: string,
  input?: {
    activeRunId?: string;
    tailSignature?: string;
  }
) {
  await ensureChatDatabase();

  const normalizedConversationId = String(conversationId || '').trim();
  if (!normalizedConversationId) {
    return null;
  }

  const latestMessage = await getLatestConversationMessage(normalizedConversationId);
  return upsertConversationSyncState({
    conversationId: normalizedConversationId,
    activeRunId: input?.activeRunId,
    lastSyncedAt: Date.now(),
    dirtyReason: '',
    tailSignature:
      input?.tailSignature !== undefined
        ? String(input.tailSignature || '').trim()
        : buildTailSignatureFromMessage(latestMessage),
  });
}

export async function reconcileConversationDetail(input: {
  conversationId: string;
  title: string;
  unreadCount?: number;
  read?: ChatReadStateInput;
  activeRunId?: string;
  summary?: Partial<ChatHomeItem> | null;
  messages: ChatMessageItem[];
  timelineState?: ChatTimelineState | null;
}) {
  return replaceConversationProjection(input);
}

export async function getMessageByServerMessageId(
  serverMessageId: string
): Promise<ChatMessageItem | null> {
  await ensureChatDatabase();

  const normalizedServerMessageId = String(serverMessageId || '').trim();
  if (!normalizedServerMessageId) {
    return null;
  }

  const rows = await chatDb
    .select({
      messageId: messages.id,
      clientMessageId: messages.clientMessageId,
      serverMessageId: messages.serverMessageId,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      deliveryStatus: messages.deliveryStatus,
      errorReason: messages.errorReason,
    })
    .from(messages)
    .where(eq(messages.serverMessageId, normalizedServerMessageId))
    .limit(1);

  return rows[0] ? mapChatMessageItem(rows[0]) : null;
}

export async function getMessageByClientMessageId(
  clientMessageId: string
): Promise<ChatMessageItem | null> {
  await ensureChatDatabase();
  return getMessageRowByClientMessageId(clientMessageId);
}

export async function upsertProjectedMessage(
  input: ProjectedMessageUpsertInput,
  options?: {
    suppressUnread?: boolean;
    unreadCountOverride?: number;
    readOverride?: ChatReadStateInput;
  }
): Promise<ChatMessageItem> {
  await ensureChatDatabase();

  const conversationId = String(input.conversationId || '').trim();
  if (!conversationId) {
    throw new Error('Conversation id is required');
  }

  const createdAt = Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now();
  const conversation = await ensureConversationRecord(conversationId, createdAt, input.title);
  const existingByMessageId = await getMessageRowByMessageId(input.messageId);
  const existingByServerMessageId = input.serverMessageId
    ? await getMessageByServerMessageId(input.serverMessageId)
    : null;
  const existingByClientMessageId = input.clientMessageId
    ? await getMessageRowByClientMessageId(input.clientMessageId)
    : null;
  const existing = existingByMessageId || existingByServerMessageId || existingByClientMessageId;
  const normalizedMessageId = normalizeMessageId(
    existing?.messageId || input.messageId,
    input.serverMessageId || input.clientMessageId || createLocalId('projected-message')
  );
  const persistedMessageId = existing?.messageId || normalizedMessageId;

  if (existing) {
    await chatDb
      .update(messages)
      .set({
        clientMessageId: input.clientMessageId ?? existing.clientMessageId,
        serverMessageId: input.serverMessageId ?? existing.serverMessageId,
        conversationId,
        role: input.role,
        content: input.content,
        createdAt,
        deliveryStatus: input.deliveryStatus || existing.deliveryStatus,
        errorReason: input.errorReason ?? existing.errorReason,
      })
      .where(eq(messages.id, existing.messageId));
  } else {
    await chatDb.insert(messages).values({
      id: normalizedMessageId,
      clientMessageId: input.clientMessageId ?? null,
      serverMessageId: input.serverMessageId ?? null,
      conversationId,
      role: input.role,
      content: input.content,
      createdAt,
      deliveryStatus: input.deliveryStatus || 'sent',
      errorReason: input.errorReason ?? null,
    });
  }

  if (input.attachments !== undefined) {
    await chatDb
      .delete(messageAttachments)
      .where(eq(messageAttachments.messageId, persistedMessageId));
    const attachmentRows = buildMessageAttachmentInsertRows({
      conversationId,
      messageId: persistedMessageId,
      clientMessageId: input.clientMessageId ?? existing?.clientMessageId ?? null,
      attachments: input.attachments,
      createdAt,
    });
    if (attachmentRows.length > 0) {
      await chatDb.insert(messageAttachments).values(attachmentRows);
    }
  }

  const nextRead =
    options?.readOverride !== undefined
      ? normalizeChatReadState(options.readOverride)
      : options?.unreadCountOverride !== undefined
        ? normalizeChatReadState({ unreadCount: options.unreadCountOverride })
        : !existing && input.role === 'assistant' && !options?.suppressUnread
          ? normalizeChatReadState({ read: { isRead: false } })
          : mapConversationReadState(conversation);

  await syncConversationSummary(conversationId, nextRead);
  const latestMessage = await getLatestConversationMessage(conversationId);
  await upsertConversationSyncState({
    conversationId,
    tailSignature: buildTailSignatureFromMessage(latestMessage),
  });

  const [message] = await attachMessageAttachments(
    [(await getMessageRowByMessageId(persistedMessageId)) as ChatMessageItem].filter(Boolean)
  );
  return message;
}

async function patchMessageByMessageId(
  messageId: string,
  patch: MessagePatch,
  options?: {
    removeOutbox?: boolean;
    unreadCountOverride?: number;
  }
) {
  const existing = await getMessageRowByMessageId(messageId);
  if (!existing) {
    return null;
  }

  await chatDb
    .update(messages)
    .set({
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.createdAt !== undefined ? { createdAt: patch.createdAt } : {}),
      ...(patch.deliveryStatus !== undefined ? { deliveryStatus: patch.deliveryStatus } : {}),
      ...(patch.errorReason !== undefined ? { errorReason: patch.errorReason } : {}),
      ...(patch.serverMessageId !== undefined ? { serverMessageId: patch.serverMessageId } : {}),
    })
    .where(eq(messages.id, existing.messageId));

  if (options?.removeOutbox && existing.clientMessageId) {
    await chatDb
      .delete(outboxMessages)
      .where(eq(outboxMessages.clientMessageId, existing.clientMessageId));
  }

  await syncConversationSummary(existing.conversationId, options?.unreadCountOverride);
  const latestMessage = await getLatestConversationMessage(existing.conversationId);
  await upsertConversationSyncState({
    conversationId: existing.conversationId,
    tailSignature: buildTailSignatureFromMessage(latestMessage),
  });
  return getMessageRowByMessageId(existing.messageId);
}

export async function patchMessageByClientMessageId(
  clientMessageId: string,
  patch: MessagePatch,
  options?: {
    removeOutbox?: boolean;
  }
) {
  await ensureChatDatabase();
  const existing = await getMessageRowByClientMessageId(clientMessageId);
  if (!existing) {
    return null;
  }
  return patchMessageByMessageId(existing.messageId, patch, options);
}

export async function appendAssistantDelta(
  input: {
    conversationId: string;
    messageId: string;
    delta: string;
    snapshotText?: string;
    createdAt: number;
    serverMessageId?: string | null;
    title?: string;
  },
  options?: {
    suppressUnread?: boolean;
  }
) {
  await ensureChatDatabase();

  const existing =
    (await getMessageRowByMessageId(input.messageId)) ||
    (input.serverMessageId ? await getMessageByServerMessageId(input.serverMessageId) : null);

  if (!existing) {
    const initialContent =
      input.snapshotText !== undefined
        ? String(input.snapshotText || '')
        : String(input.delta || '');
    return upsertProjectedMessage(
      {
        messageId: input.messageId,
        clientMessageId: null,
        serverMessageId: input.serverMessageId ?? null,
        conversationId: input.conversationId,
        role: 'assistant',
        content: initialContent,
        createdAt: input.createdAt,
        deliveryStatus: 'sent',
        errorReason: null,
        title: input.title,
      },
      {
        suppressUnread: options?.suppressUnread,
      }
    );
  }

  const nextContent =
    input.snapshotText !== undefined
      ? String(input.snapshotText || '')
      : `${existing.content}${String(input.delta || '')}`;
  return patchMessageByMessageId(existing.messageId, {
    content: nextContent,
    createdAt: Math.max(existing.createdAt, input.createdAt),
    ...(input.serverMessageId !== undefined ? { serverMessageId: input.serverMessageId } : {}),
  });
}

export async function upsertServerMessageDetail(input: ServerMessageDetail) {
  await ensureChatDatabase();

  const conversationId = String(
    input.message.conversationId || input.conversation.conversationId || ''
  ).trim();
  const serverMessageId = String(input.message.serverMessageId || '').trim();
  const isSupportedRole = input.message.role === 'assistant' || input.message.role === 'user';
  if (
    !conversationId ||
    !serverMessageId ||
    !isSupportedRole ||
    !Number.isFinite(input.message.createdAt)
  ) {
    throw new Error('Invalid server message detail payload');
  }

  const existing = await getMessageByServerMessageId(serverMessageId);
  if (existing && existing.conversationId !== conversationId) {
    throw new Error('Server message belongs to a different conversation');
  }

  const conversation = await ensureConversationRecord(
    conversationId,
    input.message.createdAt,
    input.conversation.title
  );

  if (existing) {
    await chatDb
      .update(messages)
      .set({
        conversationId,
        role: input.message.role,
        content: input.message.content,
        createdAt: input.message.createdAt,
        deliveryStatus: 'sent',
        errorReason: null,
      })
      .where(eq(messages.id, existing.messageId));

    await syncConversationSummary(conversationId, {
      unreadCount: input.conversation.unreadCount,
    });
    await refreshChatDirectoryProjectionForConversation(conversationId);
    const latestMessage = await getLatestConversationMessage(conversationId);
    await upsertConversationSyncState({
      conversationId,
      tailSignature: buildTailSignatureFromMessage(latestMessage),
    });
    return;
  }

  await chatDb.insert(messages).values({
    id: serverMessageId,
    clientMessageId: null,
    serverMessageId,
    conversationId,
    role: input.message.role,
    content: input.message.content,
    createdAt: input.message.createdAt,
    deliveryStatus: 'sent',
    errorReason: null,
  });

  const hasRemoteReadState =
    input.conversation.read !== undefined || input.conversation.unreadCount !== undefined;
  const nextRead = hasRemoteReadState
    ? normalizeChatReadState(
        input.conversation.read ?? { unreadCount: input.conversation.unreadCount }
      )
    : input.message.role === 'assistant'
      ? normalizeChatReadState({ read: { isRead: false } })
      : mapConversationReadState(conversation);

  await syncConversationSummary(conversationId, nextRead);
  await refreshChatDirectoryProjectionForConversation(conversationId);
  const latestMessage = await getLatestConversationMessage(conversationId);
  await upsertConversationSyncState({
    conversationId,
    tailSignature: buildTailSignatureFromMessage(latestMessage),
  });
}

export async function createOutgoingMessage(
  conversationId: string,
  content: string,
  attachments: readonly ChatComposerAttachment[] = [],
  options: { planningMode?: boolean } = {}
) {
  await ensureChatDatabase();

  const conversation = await getConversationRecord(conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  const clientMessageId = createLocalId('client-message');
  const createdAt = Date.now();
  const normalizedContent =
    String(content || '').trim() || formatChatAttachmentsMessageText(attachments);
  if (!normalizedContent) {
    throw new Error('Message content or attachments are required');
  }
  const messageAttachmentsForTimeline = attachments.map((attachment) =>
    withMessageAttachmentIdentity(attachment, clientMessageId)
  );

  chatDb.transaction((tx) => {
    tx.insert(messages)
      .values({
        id: clientMessageId,
        clientMessageId,
        serverMessageId: null,
        conversationId,
        role: 'user',
        content: normalizedContent,
        createdAt,
        deliveryStatus: 'pending',
        errorReason: null,
      })
      .run();

    const attachmentRows = buildMessageAttachmentInsertRows({
      conversationId,
      messageId: clientMessageId,
      clientMessageId,
      attachments: messageAttachmentsForTimeline,
      createdAt,
    });
    if (attachmentRows.length > 0) {
      tx.insert(messageAttachments).values(attachmentRows).run();
    }

    tx.insert(outboxMessages)
      .values({
        clientMessageId,
        conversationId,
        content: normalizedContent,
        planningMode: options.planningMode === true ? 1 : 0,
        createdAt,
      })
      .run();
  });

  await syncConversationSummary(conversationId, mapConversationReadState(conversation));
  await upsertConversationSyncState({
    conversationId,
    tailSignature: buildTailSignatureFromMessage({
      messageId: clientMessageId,
      createdAt,
      content: normalizedContent,
      deliveryStatus: 'pending',
    }),
  });

  return {
    clientMessageId,
    conversationId,
    createdAt,
    message: {
      messageId: clientMessageId,
      clientMessageId,
      serverMessageId: null,
      conversationId,
      role: 'user' as const,
      content: normalizedContent,
      createdAt,
      deliveryStatus: 'pending' as const,
      errorReason: null,
      attachments: messageAttachmentsForTimeline,
    },
  };
}

export async function getPendingOutboxMessages(
  limit: number = 50
): Promise<PendingOutboxMessage[]> {
  await ensureChatDatabase();

  const rows = await chatDb
    .select({
      clientMessageId: outboxMessages.clientMessageId,
      conversationId: outboxMessages.conversationId,
      content: outboxMessages.content,
      createdAt: outboxMessages.createdAt,
      planningMode: outboxMessages.planningMode,
    })
    .from(outboxMessages)
    .orderBy(desc(outboxMessages.createdAt))
    .limit(limit);

  const attachmentsByMessageId = await getAttachmentsByMessageIds(
    rows.map((row) => row.clientMessageId)
  );
  return rows.map((row) => ({
    clientMessageId: row.clientMessageId,
    conversationId: row.conversationId,
    content: row.content,
    createdAt: row.createdAt,
    planningMode: Number(row.planningMode) === 1,
    attachments: attachmentsByMessageId.get(row.clientMessageId) || [],
  }));
}

export async function getPendingOutboxCount(): Promise<number> {
  await ensureChatDatabase();
  const [{ value }] = await chatDb.select({ value: count() }).from(outboxMessages);
  return value ?? 0;
}
