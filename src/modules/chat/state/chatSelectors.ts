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
import { ChatSummary } from '../../../core/types/common';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

export interface AgentLatestChatItem {
  agentKey: string;
  agentName: string;
  agentRole?: string;
  iconName?: string;
  iconColor?: string;
  latestChat: ChatSummary;
}

export const selectChats = (state: RootState) => state.chat.chats;
export const selectChatId = (state: RootState) => state.chat.chatId;

function getAgentKeyFromChat(chat: ChatSummary): string {
  const key = String(getChatAgentKey(chat) || '').trim();
  return key || UNKNOWN_AGENT_KEY;
}

function getAgentNameFromChat(chat: ChatSummary, agentNameByKey: Map<string, string>): string {
  const agentKey = String(getChatAgentKey(chat) || '').trim();
  const mappedName = agentKey ? String(agentNameByKey.get(agentKey) || '').trim() : '';
  if (mappedName) {
    return mappedName;
  }
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

export const selectAgentLatestChats = (state: RootState): AgentLatestChatItem[] => {
  const sorted = [...state.chat.chats].sort(sortByRecent);
  const latestByAgent = new Map<string, ChatSummary>();
  const agentNameByKey = new Map<string, string>();
  const agentRoleByKey = new Map<string, string>();
  const visualByAgentKey = new Map<string, { iconName: string; iconColor: string }>();

  const agents = Array.isArray((state as RootState).agents?.agents) ? (state as RootState).agents.agents : [];
  agents.forEach((agent) => {
    const key = getAgentKey(agent);
    if (!key) {
      return;
    }
    const mappedName = String(getAgentName(agent) || '').trim();
    if (mappedName) {
      agentNameByKey.set(key, mappedName);
    }
    const mappedRole = String(getAgentRole(agent) || '').trim();
    if (mappedRole) {
      agentRoleByKey.set(key, mappedRole);
    }
    visualByAgentKey.set(key, {
      iconName: getAgentIconName(agent),
      iconColor: getAgentIconColor(agent)
    });
  });

  sorted.forEach((chat) => {
    const agentKey = getAgentKeyFromChat(chat);
    if (!latestByAgent.has(agentKey)) {
      latestByAgent.set(agentKey, chat);
    }
  });

  const items = Array.from(latestByAgent.entries())
    .map(([agentKey, chat]) => {
      const visualFromAgent = visualByAgentKey.get(agentKey);
      return {
        agentKey,
        agentName: getAgentNameFromChat(chat, agentNameByKey),
        agentRole: agentRoleByKey.get(agentKey) || resolveChatAgentRole(chat) || '',
        iconName: resolveChatIconName(chat) || visualFromAgent?.iconName || '',
        iconColor: resolveChatIconColor(chat) || visualFromAgent?.iconColor || '',
        latestChat: chat
      };
    })
    .sort((a, b) => sortByRecent(a.latestChat, b.latestChat));
  return items;
};

export const selectCurrentAgentChats = (state: RootState): ChatSummary[] => {
  const chats = state.chat.chats;
  const selectedAgentKey = String(state.user.selectedAgentKey || '').trim();
  const activeChatId = String(state.chat.chatId || '').trim();
  const activeChat = chats.find((chat) => String(chat.chatId || '').trim() === activeChatId);
  const activeAgentKey = String(getChatAgentKey(activeChat) || '').trim();
  const resolvedAgentKey = activeAgentKey || selectedAgentKey || UNKNOWN_AGENT_KEY;

  return [...chats]
    .filter((chat) => getAgentKeyFromChat(chat) === resolvedAgentKey)
    .sort(sortByRecent);
};
