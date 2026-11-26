import type { RemoteAgent } from '../chatPersistence/chatDirectoryProjector';
import type { RemoteChatSummary } from '../../core/api/services/chatApi';
import { encodeChatSourceId, getRemoteChatSourceId, type ChatSource } from '../chatPersistence/chatSource.ts';

const SCOPED_IDENTIFIER_KEYS = new Set([
  'chatId',
  'sourceChatId',
  'conversationId',
  'latestConversationId',
  'agentKey',
  'messageId',
  'serverMessageId'
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

// Traverse protocol containers only. A view/form/tool can contain arbitrary JSON,
// including fields with the same names as protocol identities.
const PROTOCOL_CONTAINERS = new Set([
  'events',
  'runs',
  'activeRun',
  'messages',
  'rawMessages',
  'awaiting',
  'relatedChat',
  'source',
  'owner',
  'member',
  'members'
]);

function mapPayloadIdentifiers(value: unknown, mapIdentifier: (value: string) => string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => mapPayloadIdentifiers(item, mapIdentifier));
  }
  if (!isObjectRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === 'id' && value.type === 'chat' && typeof entry === 'string') return [key, mapIdentifier(entry)];
      if (SCOPED_IDENTIFIER_KEYS.has(key) && typeof entry === 'string') {
        return [key, mapIdentifier(entry)];
      }
      if (key === 'agentKeys' && Array.isArray(entry)) {
        return [key, entry.map((item) => (typeof item === 'string' ? mapIdentifier(item) : item))];
      }
      if (key === 'references' && Array.isArray(entry)) {
        return [
          key,
          entry.map((reference) => {
            if (!isObjectRecord(reference) || reference.type !== 'chat') return reference;
            const scoped = mapPayloadIdentifiers(reference, mapIdentifier) as Record<string, unknown>;
            return isObjectRecord(reference.meta)
              ? {
                  ...scoped,
                  meta: {
                    ...reference.meta,
                    ...(typeof reference.meta.agentKey === 'string'
                      ? { agentKey: mapIdentifier(reference.meta.agentKey) }
                      : {})
                  }
                }
              : scoped;
          })
        ];
      }
      return [key, PROTOCOL_CONTAINERS.has(key) ? mapPayloadIdentifiers(entry, mapIdentifier) : entry];
    })
  );
}

export function scopeChatPayload<T>(source: ChatSource, value: T): T {
  return mapPayloadIdentifiers(value, (identifier) => encodeChatSourceId(source, identifier)) as T;
}

export function unscopeChatPayload<T>(value: T): T {
  return mapPayloadIdentifiers(value, getRemoteChatSourceId) as T;
}

export function scopeRemoteHomePayload(
  source: ChatSource,
  input: {
    agents: RemoteAgent[];
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
  const chats = input.chats.map((chat) => scopeChatPayload(source, chat));
  return { agents, chats };
}
