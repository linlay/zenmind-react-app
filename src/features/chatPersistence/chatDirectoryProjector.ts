import type { RemoteChatSummary } from '../../core/api/services/chatApi';
import { normalizeAgentAvatarIcon } from '../../shared/visual/agentAvatarIcon.ts';
import type {
  ChatConversationSummaryProjection,
  ChatDirectoryProjectionItem,
  ChatHomeProjection,
} from './types';
import { normalizeAgentMode } from './agentMode.ts';
import { resolveAgentModelSettings, type AgentModelSettings } from './agentModelSettings.ts';
import { resolveChatConversationTitleCandidate } from './chatConversationTitle.ts';
import { normalizeChatReadPatch, readStateToUnreadBit } from './chatReadState.ts';

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

export type RemoteTeam = {
  teamId?: string;
  name?: string;
  icon?: unknown;
  agentKeys?: string[];
  meta?: {
    defaultAgentKey?: string;
  };
  [key: string]: unknown;
};

type NormalizedRemoteChatSummary = ChatConversationSummaryProjection & {
  agentKey: string | null;
  teamId: string | null;
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

function buildTeamSubtitle(team: RemoteTeam) {
  const defaultAgentKey = toText(team.meta?.defaultAgentKey);
  if (defaultAgentKey) {
    return `默认 ${defaultAgentKey}`;
  }

  const agentCount = Array.isArray(team.agentKeys) ? team.agentKeys.length : 0;
  return agentCount > 0 ? `${agentCount} 个智能体` : '团队';
}

export function projectRemoteAgent(
  agent: RemoteAgent,
  index: number
): ChatDirectoryProjectionItem | null {
  const agentKey = toText(agent.key || agent.id);
  if (!agentKey) {
    return null;
  }
  const explicitUnread = agent.stats?.unreadCount ?? agent.unreadCount;
  const modelSettings = resolveAgentModelSettings(agent);

  return {
    id: `agent:${agentKey}`,
    kind: 'agent',
    title: toDirectoryTitle(agent.name, agentKey),
    subtitle: buildAgentSubtitle(agent),
    icon: normalizeAgentAvatarIcon(agent.icon),
    unreadCount: toUnreadCount(explicitUnread),
    unreadCountSource: explicitUnread !== undefined ? 'server' : 'projection',
    pinnedAt: 0,
    sortRank: index,
    agentKey,
    teamId: null,
    defaultAgentKey: null,
    agentMode: normalizeAgentMode(agent.mode),
    modelKey: modelSettings.modelKey,
    reasoningEffort: modelSettings.reasoningEffort,
    latestConversationId: null,
  };
}

export function projectRemoteTeam(
  team: RemoteTeam,
  index: number,
  agentModelSettingsByKey?: ReadonlyMap<string, AgentModelSettings> | null
): ChatDirectoryProjectionItem | null {
  const teamId = toText(team.teamId);
  if (!teamId) {
    return null;
  }
  const defaultAgentKey = toText(team.meta?.defaultAgentKey);
  const modelSettings = defaultAgentKey ? agentModelSettingsByKey?.get(defaultAgentKey) : null;

  return {
    id: `team:${teamId}`,
    kind: 'team',
    title: toDirectoryTitle(team.name, teamId),
    subtitle: buildTeamSubtitle(team),
    icon: normalizeAgentAvatarIcon(team.icon),
    unreadCount: 0,
    unreadCountSource: 'projection',
    pinnedAt: 0,
    sortRank: index,
    agentKey: null,
    teamId,
    defaultAgentKey: defaultAgentKey || null,
    agentMode: null,
    modelKey: modelSettings?.modelKey ?? null,
    reasoningEffort: modelSettings?.reasoningEffort ?? null,
    latestConversationId: null,
  };
}

export function projectRemoteDirectory(
  agents: RemoteAgent[],
  teams: RemoteTeam[]
): ChatDirectoryProjectionItem[] {
  const seenIds = new Set<string>();
  const items: ChatDirectoryProjectionItem[] = [];
  const agentModelSettingsByKey = teams.length > 0 ? new Map<string, AgentModelSettings>() : null;

  agents.forEach((agent, index) => {
    const projected = projectRemoteAgent(agent, index);
    if (!projected || seenIds.has(projected.id)) {
      return;
    }
    if (agentModelSettingsByKey && projected.agentKey) {
      agentModelSettingsByKey.set(projected.agentKey, projected);
    }
    seenIds.add(projected.id);
    items.push(projected);
  });

  const teamRankOffset = items.length;
  teams.forEach((team, index) => {
    const projected = projectRemoteTeam(team, teamRankOffset + index, agentModelSettingsByKey);
    if (!projected || seenIds.has(projected.id)) {
      return;
    }
    seenIds.add(projected.id);
    items.push(projected);
  });

  return items;
}

function buildTeamById(teams: RemoteTeam[]): Map<string, RemoteTeam> {
  const teamById = new Map<string, RemoteTeam>();
  teams.forEach((team) => {
    const teamId = toText(team.teamId);
    if (teamId && !teamById.has(teamId)) {
      teamById.set(teamId, team);
    }
  });
  return teamById;
}

function normalizeRemoteChatSummary(
  chat: RemoteChatSummary,
  teamById: Map<string, RemoteTeam>
): NormalizedRemoteChatSummary | null {
  const conversationId = toText(chat.chatId);
  if (!conversationId) {
    return null;
  }

  const teamId = toText(chat.teamId);
  const team = teamId ? teamById.get(teamId) : undefined;
  const agentKey =
    toText(chat.firstAgentKey || chat.agentKey) || toText(team?.meta?.defaultAgentKey);
  const lastMessageAt = parseTimestamp(
    chat.updatedAt || chat.lastRunCompletedAt || chat.createdAt,
    Date.now()
  );
  const read = normalizeChatReadPatch(chat);
  const title = resolveChatConversationTitleCandidate(chat.chatName, chat.title);

  return {
    conversationId,
    ...(title ? { title } : {}),
    lastMessageText: toText(chat.lastRunContent || chat.lastMessageText),
    lastMessageAt,
    ...(read ? { unreadCount: readStateToUnreadBit(read), read } : {}),
    lastMessageStatus: 'sent',
    agentKey: agentKey || null,
    teamId: teamId || null,
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

function addUnreadByKey(
  unreadByKey: Map<string, number>,
  key: string | null,
  count: number | undefined
) {
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
  teams: RemoteTeam[];
  chats: RemoteChatSummary[];
}): ChatHomeProjection {
  const agents = Array.isArray(input.agents) ? input.agents : [];
  const teams = Array.isArray(input.teams) ? input.teams : [];
  const chats = Array.isArray(input.chats) ? input.chats : [];
  const teamById = buildTeamById(teams);
  const latestByAgentKey = new Map<string, NormalizedRemoteChatSummary>();
  const latestByTeamId = new Map<string, NormalizedRemoteChatSummary>();
  const unreadByAgentKey = new Map<string, number>();
  const unreadByTeamId = new Map<string, number>();
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
    const summary = normalizeRemoteChatSummary(chat, teamById);
    if (!summary) {
      return;
    }

    addConversationSummary(summariesById, summary);
    setLatestByKey(latestByAgentKey, summary.agentKey, summary);
    setLatestByKey(latestByTeamId, summary.teamId, summary);
    addUnreadByKey(unreadByAgentKey, summary.agentKey, summary.unreadCount);
    addUnreadByKey(unreadByTeamId, summary.teamId, summary.unreadCount);
  });

  const directoryItems = projectRemoteDirectory(agents, teams).map((item) => {
    const latest =
      item.kind === 'team'
        ? latestByTeamId.get(item.teamId || '')
        : latestByAgentKey.get(item.agentKey || '');
    let unreadCount = 0;
    let unreadCountSource: ChatDirectoryProjectionItem['unreadCountSource'] = 'projection';
    if (item.kind === 'team') {
      unreadCount = unreadByTeamId.get(item.teamId || '') || 0;
    } else if (explicitAgentUnreadByKey.has(item.agentKey || '')) {
      unreadCount = explicitAgentUnreadByKey.get(item.agentKey || '') || 0;
      unreadCountSource = 'server';
    } else {
      unreadCount = unreadByAgentKey.get(item.agentKey || '') || 0;
    }

    return {
      ...item,
      unreadCount,
      unreadCountSource,
      latestConversationId: latest?.conversationId || null,
    };
  });

  return {
    directoryItems,
    conversationSummaries: Array.from(summariesById.values()),
  };
}
