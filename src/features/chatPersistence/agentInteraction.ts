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
  connectors: boolean;
  showPlanningMode: boolean;
  showEditingMode: boolean;
  showTerminal: boolean;
  attachment: { localFiles: boolean; chatRecords: boolean; skills: boolean; kbases: boolean };
};
export function resolveAgentInteraction(value: unknown): AgentInteraction {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const attachment =
    input.attachment && typeof input.attachment === 'object' ? (input.attachment as Record<string, unknown>) : {};
  return {
    model: input.model === true,
    accessLevel: input.accessLevel === true,
    connectors: input.connectors === true,
    showPlanningMode: input.showPlanningMode === true,
    showEditingMode: input.showEditingMode === true,
    showTerminal: input.showTerminal === true,
    attachment: {
      localFiles: attachment.localFiles === true,
      chatRecords: attachment.chatRecords === true,
      skills: attachment.skills === true,
      kbases: attachment.kbases === true
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

export function hasValidAgentInteraction(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const attachment = input.attachment;
  return (
    typeof input.model === 'boolean' &&
    typeof input.accessLevel === 'boolean' &&
    Boolean(
      attachment &&
      typeof attachment === 'object' &&
      !Array.isArray(attachment) &&
      typeof (attachment as Record<string, unknown>).localFiles === 'boolean'
    )
  );
}
