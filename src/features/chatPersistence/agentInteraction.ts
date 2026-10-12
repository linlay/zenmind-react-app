import { ApiError } from '../../core/api/apiError.ts';

export type AgentAvailability =
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'authentication_required'
  | 'forbidden'
  | 'error';
export type AgentInteraction = {
  model: boolean;
  accessLevel: boolean;
  mustUseSkills: boolean;
  connectors: boolean;
  attachment: { localFiles: boolean; chatRecords: boolean };
};
export function resolveAgentInteraction(mode: string, value: unknown): AgentInteraction {
  const normalized = mode.toUpperCase();
  const kbase = normalized === 'KBASE';
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const attachments =
    input.attachment && typeof input.attachment === 'object' ? (input.attachment as Record<string, unknown>) : {};
  const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    model: flag(input.model, !kbase && !['TEAM', 'PROXY', 'CHANNEL'].includes(normalized)),
    accessLevel: flag(input.accessLevel, !kbase),
    mustUseSkills: flag(input.mustUseSkills, normalized !== 'TEAM'),
    connectors: flag(input.connectors, !kbase && normalized !== 'TEAM'),
    attachment: {
      localFiles: flag(attachments.localFiles, true),
      chatRecords: flag(attachments.chatRecords, !kbase && normalized !== 'CODER')
    }
  };
}
export function classifyAgentAvailabilityError(error: unknown): AgentAvailability {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'authentication_required';
    if (error.status === 403) return 'forbidden';
    if (error.status === 404) return 'unavailable';
  }
  return 'error';
}
