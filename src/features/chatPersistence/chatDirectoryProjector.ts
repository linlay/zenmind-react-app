import type { RemoteChatSummary } from '../../core/api/services/chatApi';
import { normalizeAgentAvatarIcon } from '../../shared/visual/agentAvatarIcon.ts';
import type { ChatConversationSummaryProjection, ChatDirectoryProjectionItem, ChatHomeProjection } from './types';
import { normalizeAgentMode } from './agentMode.ts';
import { resolveAgentModelSettings } from './agentModelSettings.ts';
import { resolveChatConversationTitleCandidate } from './chatConversationTitle.ts';
import { normalizeChatReadPatch, readStateToUnreadBit } from './chatReadState.ts';
import { encodeChatSourceId, getRemoteChatSourceId, parseChatSourceId } from './chatSource.ts';

export type RemoteAgent = {
  key?: string;
  id?: string;
  name?: string;
  icon?: unknown;
  mode?: string;
  model?: unknown;
  modelKey?: unknown;
  role?: string;
  meta?: {
    model?: unknown;
    modelKey?: unknown;
    role?: string;
    stageSettings?: unknown;
  };
  stats?: {
    unreadCount?: number | string;
  };
  unreadCount?: number | string;
  [key: string]: unknown;
};

type NormalizedRemoteChatSummary = ChatConversationSummaryProjection & {
  agentKey: string | null;
};

function toText(value: unknown): string {
  return String(value || '').trim();
}

function toUnreadCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : 0;
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseTimestamp(value: unknown, fallback: number): number {
  const numeric = toFiniteNumber(value);
  if (numeric !== null && numeric > 0) {
    return numeric >= 1_000_000_000_000 ? numeric : numeric * 1000;
  }

  const text = toText(value);
  if (!text) {
    return fallback;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toDirectoryTitle(primary: unknown, fallback: string) {
  return toText(primary) || fallback;
}

function buildAgentSubtitle(agent: RemoteAgent) {
  return toText(agent.role) || toText(agent.meta?.role) || '智能体';
}

function buildDirectoryItemId(kind: 'agent', scopedId: string): string {
  const parsed = parseChatSourceId(scopedId);
  return parsed ? encodeChatSourceId(parsed.source, `${kind}:${parsed.remoteId}`) : `${kind}:${scopedId}`;
}

export function projectRemoteAgent(agent: RemoteAgent, index: number): ChatDirectoryProjectionItem | null {
  const agentKey = toText(agent.key || agent.id);
  if (!agentKey) {
    return null;
  }
  const explicitUnread = agent.stats?.unreadCount ?? agent.unreadCount;
  const modelSettings = resolveAgentModelSettings(agent);

  return {
    id: buildDirectoryItemId('agent', agentKey),
    kind: 'agent',
    title: toDirectoryTitle(agent.name, getRemoteChatSourceId(agentKey)),
    subtitle: buildAgentSubtitle(agent),
    icon: normalizeAgentAvatarIcon(agent.icon),
    unreadCount: toUnreadCount(explicitUnread),
    unreadCountSource: explicitUnread !== undefined ? 'server' : 'projection',
    pinnedAt: 0,
    sortRank: index,
    agentKey,
    agentMode: normalizeAgentMode(agent.mode),
    modelKey: modelSettings.modelKey,
    reasoningEffort: modelSettings.reasoningEffort,
    latestConversationId: null
  };
}

export function projectRemoteDirectory(agents: RemoteAgent[]): ChatDirectoryProjectionItem[] {
  const seen = new Set<string>();
  return agents.flatMap((agent, index) => {
    const item = projectRemoteAgent(agent, index);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  });
}

function normalizeRemoteChatSummary(chat: RemoteChatSummary): NormalizedRemoteChatSummary | null {
  const conversationId = toText(chat.chatId);
  if (!conversationId) {
    return null;
  }

  const agentKey = toText(chat.agentKey);
  const lastMessageAt = parseTimestamp(chat.updatedAt || chat.lastRunCompletedAt || chat.createdAt, Date.now());
  const read = normalizeChatReadPatch(chat);
  const title = resolveChatConversationTitleCandidate(chat.chatName, chat.title);

  return {
    conversationId,
    ...(title ? { title } : {}),
    lastMessageText: toText(chat.lastRunContent || chat.lastMessageText),
    lastMessageAt,
    ...(read ? { unreadCount: readStateToUnreadBit(read), read } : {}),
    lastMessageStatus: 'sent',
    agentKey: agentKey || null
  };
}

function setLatestByKey(
  latestByKey: Map<string, NormalizedRemoteChatSummary>,
  key: string | null,
  summary: NormalizedRemoteChatSummary
) {
  if (!key || !summary.lastMessageText) {
    return;
  }

  const current = latestByKey.get(key);
  if (!current || summary.lastMessageAt > current.lastMessageAt) {
    latestByKey.set(key, summary);
  }
}

function addUnreadByKey(unreadByKey: Map<string, number>, key: string | null, count: number | undefined) {
  if (!key || !count || count <= 0) {
    return;
  }

  unreadByKey.set(key, (unreadByKey.get(key) || 0) + count);
}

function addConversationSummary(
  summariesById: Map<string, ChatConversationSummaryProjection>,
  summary: NormalizedRemoteChatSummary
) {
  const current = summariesById.get(summary.conversationId);
  if (!current || summary.lastMessageAt >= current.lastMessageAt) {
    summariesById.set(summary.conversationId, summary);
  }
}

export function projectRemoteHomeDirectory(input: {
  agents: RemoteAgent[];
  chats: RemoteChatSummary[];
}): ChatHomeProjection {
  const agents = Array.isArray(input.agents) ? input.agents : [];
  const chats = Array.isArray(input.chats) ? input.chats : [];
  const latestByAgentKey = new Map<string, NormalizedRemoteChatSummary>();
  const unreadByAgentKey = new Map<string, number>();
  const explicitAgentUnreadByKey = new Map<string, number>();
  const summariesById = new Map<string, ChatConversationSummaryProjection>();

  agents.forEach((agent) => {
    const agentKey = toText(agent.key || agent.id);
    const explicitUnread = agent.stats?.unreadCount ?? agent.unreadCount;
    if (agentKey && explicitUnread !== undefined) {
      explicitAgentUnreadByKey.set(agentKey, toUnreadCount(explicitUnread));
    }
  });

  chats.forEach((chat) => {
    const summary = normalizeRemoteChatSummary(chat);
    if (!summary) {
      return;
    }

    addConversationSummary(summariesById, summary);
    setLatestByKey(latestByAgentKey, summary.agentKey, summary);
    addUnreadByKey(unreadByAgentKey, summary.agentKey, summary.unreadCount);
  });

  const directoryItems = projectRemoteDirectory(agents).map((item) => {
    const latest = latestByAgentKey.get(item.agentKey || '');
    let unreadCount = 0;
    let unreadCountSource: ChatDirectoryProjectionItem['unreadCountSource'] = 'projection';
    if (explicitAgentUnreadByKey.has(item.agentKey || '')) {
      unreadCount = explicitAgentUnreadByKey.get(item.agentKey || '') || 0;
      unreadCountSource = 'server';
    } else {
      unreadCount = unreadByAgentKey.get(item.agentKey || '') || 0;
    }

    return {
      ...item,
      unreadCount,
      unreadCountSource,
      latestConversationId: latest?.conversationId || null
    };
  });

  return {
    directoryItems,
    conversationSummaries: Array.from(summariesById.values())
  };
}
