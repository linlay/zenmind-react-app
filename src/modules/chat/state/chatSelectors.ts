import { RootState } from '../../../app/store/store';
import { Agent } from '../../../core/types/common';
import { getAgentKey, getAgentName, getChatAgentKey, getChatAgentName, getChatTimestamp, getChatTitle } from '../../../shared/utils/format';
import { ChatSummary } from '../../../core/types/common';

const UNKNOWN_AGENT_KEY = '__unknown_agent__';

export interface AgentLatestChatItem {
  agentKey: string;
  agentName: string;
  iconName?: string;
  iconColor?: string;
  latestChat: ChatSummary;
}

export const selectChats = (state: RootState) => state.chat.chats;
export const selectChatId = (state: RootState) => state.chat.chatId;
export const selectChatKeyword = (state: RootState) => state.chat.chatKeyword;

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

function matchesKeyword(chat: ChatSummary, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const haystack = `${chat.chatName || ''} ${chat.title || ''} ${chat.chatId || ''} ${getChatAgentName(chat)} ${getChatAgentKey(chat)}`.toLowerCase();
  return haystack.includes(keyword);
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

function resolveAgentIconName(agent: Agent | null | undefined): string {
  if (!agent || typeof agent !== 'object') {
    return '';
  }
  return pickFirstNonEmptyValue(agent as Record<string, unknown>, [
    'iconName',
    'agentIconName',
    'avatarName',
    'icon'
  ]);
}

function resolveAgentIconColor(agent: Agent | null | undefined): string {
  if (!agent || typeof agent !== 'object') {
    return '';
  }
  return pickFirstNonEmptyValue(agent as Record<string, unknown>, [
    'iconColor',
    'bgColor',
    'avatarBgColor',
    'agentIconColor'
  ]);
}

function matchesAgentItemKeyword(item: AgentLatestChatItem, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const latestChatTitle = getChatTitle(item.latestChat) || item.latestChat.chatName || '';
  const haystack = `${item.agentName || ''} ${item.agentKey || ''} ${latestChatTitle} ${item.latestChat.chatId || ''}`.toLowerCase();
  return haystack.includes(keyword);
}

function sortByRecent(a: ChatSummary, b: ChatSummary): number {
  return getChatTimestamp(b) - getChatTimestamp(a);
}

export const selectFilteredChats = (state: RootState) => {
  const chats = state.chat.chats;
  const keyword = state.chat.chatKeyword.trim().toLowerCase();
  const sorted = [...chats].sort(sortByRecent);
  if (!keyword) return sorted;

  return sorted.filter((chat) => matchesKeyword(chat, keyword));
};

export const selectAgentLatestChats = (state: RootState): AgentLatestChatItem[] => {
  const sorted = [...state.chat.chats].sort(sortByRecent);
  const keyword = state.chat.chatKeyword.trim().toLowerCase();
  const latestByAgent = new Map<string, ChatSummary>();
  const agentNameByKey = new Map<string, string>();
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
    visualByAgentKey.set(key, {
      iconName: resolveAgentIconName(agent),
      iconColor: resolveAgentIconColor(agent)
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
        iconName: resolveChatIconName(chat) || visualFromAgent?.iconName || '',
        iconColor: resolveChatIconColor(chat) || visualFromAgent?.iconColor || '',
        latestChat: chat
      };
    })
    .sort((a, b) => sortByRecent(a.latestChat, b.latestChat));

  if (!keyword) {
    return items;
  }
  return items.filter((item) => matchesAgentItemKeyword(item, keyword));
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
