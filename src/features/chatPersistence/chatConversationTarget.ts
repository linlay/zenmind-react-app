import type { ChatConversationTarget, ChatDirectoryKind } from './types';
import type { ChatSource } from './chatSource.ts';
import { normalizeAgentMode } from './agentMode.ts';
import { normalizeChatReasoningEffort } from './agentModelSettings.ts';
import { getChatSourceFromId } from './chatSource.ts';

type ChatConversationTargetSource = {
  source?: ChatSource;
  id?: string | null;
  kind: ChatDirectoryKind | string;
  title?: string | null;
  subtitle?: string | null;
  agentKey?: string | null;
  teamId?: string | null;
  defaultAgentKey?: string | null;
  agentMode?: string | null;
  modelKey?: string | null;
  reasoningEffort?: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim();
}

function normalizeKey(value: string | null | undefined): string | null {
  return normalizeText(value) || null;
}

export function createChatConversationTarget(
  source: ChatConversationTargetSource | null | undefined
): ChatConversationTarget | null {
  const title = normalizeText(source?.title);
  if (!source || !title) {
    return null;
  }

  const kind: ChatDirectoryKind = source.kind === 'team' ? 'team' : 'agent';
  const teamId = kind === 'team' ? normalizeKey(source.teamId) : null;
  const agentKey = kind === 'team' ? null : normalizeKey(source.agentKey || source.defaultAgentKey);

  return {
    source: source.source ?? getChatSourceFromId(source.id || agentKey || teamId),
    kind,
    title,
    subtitle: normalizeText(source.subtitle),
    agentKey,
    teamId,
    agentMode: normalizeAgentMode(source.agentMode),
    modelKey: normalizeKey(source.modelKey),
    reasoningEffort: normalizeChatReasoningEffort(source.reasoningEffort)
  };
}
