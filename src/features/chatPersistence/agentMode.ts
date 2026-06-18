const PLAN_MODE_AGENT_MODE = 'CODER';

export function normalizeAgentMode(value: unknown): string | null {
  const mode = String(value || '').trim().toUpperCase();
  return mode || null;
}

export function canUsePlanMode(agentMode: string | null | undefined): boolean {
  return normalizeAgentMode(agentMode) === PLAN_MODE_AGENT_MODE;
}
