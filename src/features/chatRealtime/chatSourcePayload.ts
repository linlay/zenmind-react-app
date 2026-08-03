import type {
  RemoteAgent,
  RemoteTeam
} from '../chatPersistence/chatDirectoryProjector';
import type { RemoteChatSummary } from '../../core/api/services/chatApi';
import {
  encodeChatSourceId,
  getRemoteChatSourceId,
  type ChatSource
} from '../chatPersistence/chatSource.ts';

const SCOPED_IDENTIFIER_KEYS = new Set([
  'chatId',
  'conversationId',
  'latestConversationId',
  'agentKey',
  'defaultAgentKey',
  'firstAgentKey',
  'teamId',
  'messageId',
  'serverMessageId'
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mapPayloadIdentifiers(
  value: unknown,
  mapIdentifier: (value: string) => string
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => mapPayloadIdentifiers(item, mapIdentifier));
  }
  if (!isObjectRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (SCOPED_IDENTIFIER_KEYS.has(key) && typeof entry === 'string') {
        return [key, mapIdentifier(entry)];
      }
      if (key === 'agentKeys' && Array.isArray(entry)) {
        return [
          key,
          entry.map((item) =>
            typeof item === 'string' ? mapIdentifier(item) : item
          )
        ];
      }
      return [key, mapPayloadIdentifiers(entry, mapIdentifier)];
    })
  );
}

export function scopeChatPayload<T>(source: ChatSource, value: T): T {
  return mapPayloadIdentifiers(value, (identifier) =>
    encodeChatSourceId(source, identifier)
  ) as T;
}

export function unscopeChatPayload<T>(value: T): T {
  return mapPayloadIdentifiers(value, getRemoteChatSourceId) as T;
}

export function scopeRemoteHomePayload(
  source: ChatSource,
  input: {
    agents: RemoteAgent[];
    teams: RemoteTeam[];
    chats: RemoteChatSummary[];
  }
) {
  const agents = input.agents.map((agent) => {
    const key = String(agent.key || agent.id || '').trim();
    return {
      ...scopeChatPayload(source, agent),
      ...(key
        ? {
            key: encodeChatSourceId(source, key),
            id: encodeChatSourceId(source, key)
          }
        : {})
    };
  });
  const teams = input.teams.map((team) => scopeChatPayload(source, team));
  const chats = input.chats.map((chat) => scopeChatPayload(source, chat));
  return { agents, teams, chats };
}
