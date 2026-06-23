import type { ChatReasoningEffort } from './types';

const REASONING_STAGE_KEYS = ['execute', 'plan', 'summary'] as const;

export type AgentModelSettings = {
  modelKey: string | null;
  reasoningEffort: ChatReasoningEffort | null;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  return String(value || '').trim();
}

function readModelKey(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!isObjectRecord(value)) {
    return '';
  }
  return toText(value.key) || toText(value.modelKey) || toText(value.model_key);
}

export function normalizeChatReasoningEffort(value: unknown): ChatReasoningEffort | null {
  switch (toText(value).toUpperCase()) {
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    case 'LOW':
      return 'LOW';
    case 'NONE':
      return 'NONE';
    default:
      return null;
  }
}

function readReasoningEffort(value: unknown): ChatReasoningEffort | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (value.enabled === false) {
    return 'NONE';
  }
  return normalizeChatReasoningEffort(value.effort);
}

function readStageReasoningEffort(stageSettings: unknown): ChatReasoningEffort | null {
  if (!isObjectRecord(stageSettings)) {
    return null;
  }

  for (const stageKey of REASONING_STAGE_KEYS) {
    const stage = stageSettings[stageKey];
    if (!isObjectRecord(stage)) {
      continue;
    }
    const modelConfig = stage.modelConfig;
    if (!isObjectRecord(modelConfig)) {
      continue;
    }
    const effort = readReasoningEffort(modelConfig.reasoning);
    if (effort) {
      return effort;
    }
  }

  return null;
}

export function resolveAgentModelSettings(value: unknown): AgentModelSettings {
  if (!isObjectRecord(value)) {
    return {
      modelKey: null,
      reasoningEffort: null
    };
  }

  const meta = isObjectRecord(value.meta) ? value.meta : null;
  const modelKey =
    readModelKey(meta?.modelKey) ||
    readModelKey(meta?.model) ||
    readModelKey(value.modelKey) ||
    readModelKey(value.model) ||
    null;

  return {
    modelKey,
    reasoningEffort: readStageReasoningEffort(meta?.stageSettings)
  };
}
