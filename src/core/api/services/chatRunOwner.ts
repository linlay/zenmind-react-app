export type ChatRunOwnerInput = { agentKey?: string | null };

export function buildChatRunOwnerPayload(input: ChatRunOwnerInput): { agentKey?: string } {
  const agentKey = String(input.agentKey || '').trim();
  return agentKey ? { agentKey } : {};
}
