import type { AgentAvatarIcon } from '../../shared/visual/agentAvatarTypes';

export type ChatReadState = {
  isRead: boolean;
  readAt: number | null;
  readRunId: string | null;
};

export type ChatHomeItem = {
  conversationId: string;
  title: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount: number;
  read?: ChatReadState;
  lastMessageStatus: ChatMessageStatus;
  pinnedAt: number;
};

export type ChatConversationHistoryScope = {
  agentKey: string | null;
  teamId: string | null;
};

export type ChatReasoningEffort = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type ChatConversationTarget = {
  kind: ChatDirectoryKind;
  title: string;
  subtitle: string;
  agentKey: string | null;
  teamId: string | null;
  agentMode: string | null;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
};

export type ChatConversationHistoryPage = {
  items: ChatHomeItem[];
  total: number;
  unreadTotal: number;
  limit: number;
};

export type ChatDirectoryKind = 'agent' | 'team';

export type ChatDirectoryIcon = AgentAvatarIcon;

export type ChatDirectoryItem = {
  id: string;
  kind: ChatDirectoryKind;
  title: string;
  subtitle: string;
  icon: ChatDirectoryIcon | null;
  unreadCount: number;
  pinnedAt: number;
  sortRank: number;
  agentKey: string | null;
  teamId: string | null;
  defaultAgentKey: string | null;
  agentMode: string | null;
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
  latestConversationId: string | null;
  lastMessageText: string;
  lastMessageAt: number;
};

export type ChatDirectoryProjectionItem = Omit<
  ChatDirectoryItem,
  'lastMessageText' | 'lastMessageAt'
> & {
  unreadCountSource?: 'server' | 'projection';
};

export type ChatConversationSummaryProjection = {
  conversationId: string;
  title: string;
  lastMessageText: string;
  lastMessageAt: number;
  unreadCount?: number;
  read?: ChatReadState;
  lastMessageStatus: ChatMessageStatus;
  agentKey: string | null;
  teamId: string | null;
};

export type ChatHomeProjection = {
  directoryItems: ChatDirectoryProjectionItem[];
  conversationSummaries: ChatConversationSummaryProjection[];
};

export type ChatDetailRouteParams = {
  conversationId: string;
  conversationSubtitle?: string;
  conversationTarget?: ChatConversationTarget | null;
  initialConversation?: ChatHomeItem;
  historyScope?: ChatConversationHistoryScope;
  serverMessageId?: string;
  fromNotification?: boolean;
  skipInitialReconcile?: boolean;
};

export type ChatDirectoryPage = {
  items: ChatDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ChatDirectorySearchPage = {
  items: ChatDirectoryItem[];
  query: string;
  offset: number;
  pageSize: number;
  hasMore: boolean;
};

export type ChatDirectorySnapshot = {
  version: 1;
  updatedAt: number;
  items: ChatDirectoryItem[];
};

export type ChatMessageRole = 'assistant' | 'user';

export type ChatMessageStreamStatus = 'streaming' | 'done';

export type ChatAttachmentKind = 'image' | 'file';

export type ChatAttachmentStatus = 'uploading' | 'ready' | 'failed';

export type ChatAttachmentReference = {
  id?: string;
  type?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  sha256?: string;
};

export type ChatAttachmentBase = {
  attachmentId: string;
  conversationId: string;
  name: string;
  kind: ChatAttachmentKind;
  mimeType: string | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  localUri: string;
  previewUri: string | null;
  resourceUrl: string | null;
  sha256: string | null;
  status: ChatAttachmentStatus;
  errorReason: string | null;
  references: ChatAttachmentReference[];
  createdAt: number;
  updatedAt: number;
};

export type ChatComposerAttachment = ChatAttachmentBase;

export type ChatMessageAttachment = ChatAttachmentBase & {
  messageId: string;
};

export type ChatMessageItem = {
  messageId: string;
  clientMessageId: string | null;
  serverMessageId: string | null;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: number;
  deliveryStatus: ChatMessageStatus;
  streamStatus?: ChatMessageStreamStatus;
  errorReason: string | null;
  attachments: ChatMessageAttachment[];
};

export type ChatMessageStatus = 'pending' | 'sent' | 'failed';

export type PendingOutboxMessage = {
  clientMessageId: string;
  conversationId: string;
  content: string;
  createdAt: number;
  planningMode: boolean;
  attachments: ChatMessageAttachment[];
};

export type ServerMessageDetail = {
  conversation: {
    conversationId: string;
    title: string;
    read?: unknown;
    unreadCount?: number;
  };
  message: {
    conversationId: string;
    serverMessageId: string;
    content: string;
    createdAt: number;
    role: ChatMessageRole;
  };
};
