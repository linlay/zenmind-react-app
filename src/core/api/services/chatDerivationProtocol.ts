import { isRemoteEpochMillis } from './chatRemoteTimeProtocol.ts';
export const CHAT_DERIVE_TRANSPORT_TYPE = '/api/chat/derive';
export type ChatDerivation = { chatId: string; phase: 'unknown' | 'ready'; agentKey?: string };
export function validateChatDerivationResponse(
  value: unknown,
  sourceChatId: string,
  sourceRunId: string,
  target: ChatDerivation
) {
  if (!value || typeof value !== 'object') throw new Error('Invalid derivation response');
  const result = value as Record<string, unknown>;
  if (
    result.chatId !== target.chatId ||
    result.sourceChatId !== sourceChatId ||
    result.sourceRunId !== sourceRunId ||
    !isRemoteEpochMillis(result.createdAt) ||
    !isRemoteEpochMillis(result.updatedAt) ||
    !Number.isSafeInteger(result.copiedRuns) ||
    Number(result.copiedRuns) < 1 ||
    typeof result.lastRunId !== 'string' ||
    !result.lastRunId.trim() ||
    result.agentKey !== target.agentKey
  )
    throw new Error('Derivation response does not match this run and owner');
}

export function isDefinitiveChatDerivationRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { status?: unknown; code?: unknown; data?: { code?: unknown }; payload?: { code?: unknown } };
  const status = Number(value.status ?? value.code);
  if (!Number.isInteger(status) || status < 400 || status >= 500 || status === 408) return false;
  if (status !== 409) return true;
  const code = value.data?.code ?? value.payload?.code ?? value.code;
  return ['active_run_conflict', 'awaiting_pending', 'run_incomplete'].includes(String(code));
}
