export type ChatRunOwnerInput = {
  agentKey?: string | null;
  teamId?: string | null;
};

// A member agent is a display identity; a Team remains the control owner.
export function buildChatRunOwnerPayload(input: ChatRunOwnerInput): { agentKey?: string; teamId?: string } {
  const teamId = String(input.teamId || '').trim();
  if (teamId) return { teamId };
  const agentKey = String(input.agentKey || '').trim();
  return agentKey ? { agentKey } : {};
}
