import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../../../app/store/store';
import {
  getAgentIconColor,
  getAgentIconName,
  getAgentKey,
  getAgentName,
  getAgentRole,
  getChatAgentKey,
  getChatAgentName,
  getChatTimestamp
} from '../../../shared/utils/format';
import { ChatSummary, TeamSummary } from '../../../core/types/common';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

export interface AgentLatestChatItem {
  agentKey: string;
  agentName: string;
  agentRole?: string;
  iconName?: string;
  iconColor?: string;
  unreadCount: number;
  latestChat: ChatSummary;
}

interface AgentMeta {
  name: string;
  role: string;
  iconName: string;
  iconColor: string;
}

interface AgentLatestChatBaseItem {
  agentKey: string;
  unreadCount: number;
  latestChat: ChatSummary;
}

export const selectChats = (state: RootState) => state.chat.chats;
export const selectTeams = (state: RootState) => state.chat.teams;
export const selectChatId = (state: RootState) => state.chat.chatId;
const selectAgents = (state: RootState) => state.agents.agents;
const selectSelectedAgentKey = (state: RootState) => String(state.user.selectedAgentKey || '').trim();

function supplementChatWithTeam(chat: ChatSummary, teamById: Map<string, TeamSummary>): ChatSummary {
  const teamId = String(chat.teamId || '').trim();
  const team = teamId ? teamById.get(teamId) : undefined;
  if (!team) {
    return chat;
  }

  const next: ChatSummary = { ...chat };
  const teamDefaultAgentKey = String(team.meta?.defaultAgentKey || '').trim();
  const teamName = String(team.name || '').trim();

  if (!String(getChatAgentKey(chat) || '').trim() && teamDefaultAgentKey) {
    next.firstAgentKey = String(next.firstAgentKey || '').trim() || teamDefaultAgentKey;
    next.agentKey = String(next.agentKey || '').trim() || teamDefaultAgentKey;
  }

  if (!String(chat.firstAgentName || chat.agentName || '').trim() && teamName) {
    next.firstAgentName = String(next.firstAgentName || '').trim() || teamName;
    next.agentName = String(next.agentName || '').trim() || teamName;
  }

  return next;
}

function getAgentKeyFromChat(chat: ChatSummary): string {
  const key = String(getChatAgentKey(chat) || '').trim();
  return key || UNKNOWN_AGENT_KEY;
}

function getFallbackAgentNameFromChat(chat: ChatSummary): string {
  const name = String(getChatAgentName(chat) || '').trim();
  if (name) {
    return name;
  }
  const fallbackKey = String(getChatAgentKey(chat) || '').trim();
  return fallbackKey || '未知智能体';
}

function pickFirstNonEmptyValue(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(source[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function resolveChatIconName(chat: ChatSummary): string {
  return pickFirstNonEmptyValue(chat as Record<string, unknown>, [
    'firstAgentIconName',
    'agentIconName',
    'iconName',
    'firstAgentIcon',
    'agentIcon'
  ]);
}

function resolveChatIconColor(chat: ChatSummary): string {
  return pickFirstNonEmptyValue(chat as Record<string, unknown>, [
    'firstAgentIconColor',
    'agentIconColor',
    'iconColor',
    'firstAgentBgColor',
    'agentBgColor',
    'bgColor',
    'iconBgColor'
  ]);
}

function resolveChatAgentRole(chat: ChatSummary): string {
  return pickFirstNonEmptyValue(chat as Record<string, unknown>, ['firstAgentRole', 'agentRole']);
}

function sortByRecent(a: ChatSummary, b: ChatSummary): number {
  return getChatTimestamp(b) - getChatTimestamp(a);
}

const selectTeamById = createSelector([selectTeams], (teams): Map<string, TeamSummary> => {
  const teamById = new Map<string, TeamSummary>();
  const normalizedTeams = Array.isArray(teams) ? teams : [];

  normalizedTeams.forEach((team) => {
    const teamId = String(team?.teamId || '').trim();
    if (!teamId) return;
    teamById.set(teamId, team);
  });
  return teamById;
});

const selectAgentMetaByKey = createSelector([selectAgents], (agents): Map<string, AgentMeta> => {
  const agentMetaByKey = new Map<string, AgentMeta>();
  const normalizedAgents = Array.isArray(agents) ? agents : [];

  normalizedAgents.forEach((agent) => {
    const key = getAgentKey(agent);
    if (!key) {
      return;
    }

    agentMetaByKey.set(key, {
      name: String(getAgentName(agent) || '').trim(),
      role: String(getAgentRole(agent) || '').trim(),
      iconName: getAgentIconName(agent),
      iconColor: getAgentIconColor(agent)
    });
  });

  return agentMetaByKey;
});

const selectAgentLatestChatsBase = createSelector(
  [selectChats, selectTeamById],
  (chats, teamById): AgentLatestChatBaseItem[] => {
    const normalizedChats = Array.isArray(chats) ? chats : [];
    const latestByAgent = new Map<string, ChatSummary>();
    const unreadByAgent = new Map<string, number>();
    normalizedChats.forEach((chat, index) => {
      const supplementedChat = supplementChatWithTeam(chat, teamById);
      const agentKey = getAgentKeyFromChat(supplementedChat);
      const readStatus = Number((chat as Record<string, unknown>).readStatus);
      const currentLatest = latestByAgent.get(agentKey);

      if (Number.isFinite(readStatus) && readStatus === 0) {
        unreadByAgent.set(agentKey, (unreadByAgent.get(agentKey) || 0) + 1);
      }

      if (!currentLatest || getChatTimestamp(supplementedChat) > getChatTimestamp(currentLatest)) {
        latestByAgent.set(agentKey, supplementedChat);
      }
    });

    return Array.from(latestByAgent.entries())
      .map(([agentKey, latestChat]) => ({
        agentKey,
        unreadCount: unreadByAgent.get(agentKey) || 0,
        latestChat
      }))
      .sort((a, b) => sortByRecent(a.latestChat, b.latestChat));
  }
);

export const selectAgentLatestChats = createSelector(
  [selectAgentLatestChatsBase, selectAgentMetaByKey, selectTeamById],
  (baseItems, agentMetaByKey, teamById): AgentLatestChatItem[] =>
    baseItems.map(({ agentKey, unreadCount, latestChat }) => {
      const agentMeta = agentMetaByKey.get(agentKey);
      const team = latestChat.teamId ? teamById.get(String(latestChat.teamId || '').trim()) : undefined;
      const teamIconName = String(team?.icon?.name || '').trim();
      const teamIconColor = String(team?.icon?.color || '').trim();

      return {
        agentKey,
        agentName: agentMeta?.name || getFallbackAgentNameFromChat(latestChat),
        agentRole: agentMeta?.role || resolveChatAgentRole(latestChat) || '',
        iconName: resolveChatIconName(latestChat) || agentMeta?.iconName || teamIconName || '',
        iconColor: resolveChatIconColor(latestChat) || agentMeta?.iconColor || teamIconColor || '',
        unreadCount,
        latestChat
      };
    })
);

export const selectCurrentAgentChats = createSelector(
  [selectChats, selectChatId, selectSelectedAgentKey],
  (chats, activeChatIdInput, selectedAgentKey): ChatSummary[] => {
    const normalizedChats = Array.isArray(chats) ? chats : [];
    const activeChatId = String(activeChatIdInput || '').trim();
    const activeChat = normalizedChats.find((chat) => String(chat.chatId || '').trim() === activeChatId);
    const activeAgentKey = String(getChatAgentKey(activeChat) || '').trim();
    const resolvedAgentKey = activeAgentKey || selectedAgentKey || UNKNOWN_AGENT_KEY;

    return [...normalizedChats].filter((chat) => getAgentKeyFromChat(chat) === resolvedAgentKey).sort(sortByRecent);
  }
);
