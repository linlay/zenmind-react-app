import { ApiError } from '../apiError.ts';

export const MODEL_OPTIONS_API_PATH = '/api/model-options';
export const MODEL_CONFIG_API_PATH = '/api/agent/model-config';

export type ModelOptionReasoningEffort = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH' | 'MAX';
export type ModelOptionServiceTier = string;
export type QueryAccessLevel = 'default' | 'auto_approve' | 'full_access';
export type QueryModelOverride = {
  key?: string;
  reasoningEffort?: ModelOptionReasoningEffort;
  serviceTier?: ModelOptionServiceTier;
};

export type ModelOptionItem = {
  key: string;
  name: string;
  modelId?: string;
  provider?: string;
  serviceTiers: ModelOptionServiceTier[];
  raw: Record<string, unknown>;
};

export type ReasoningEffortOption = {
  key: ModelOptionReasoningEffort;
  label: string;
  raw: Record<string, unknown>;
};

export type ServiceTierOption = {
  key: ModelOptionServiceTier;
  label: string;
  raw?: Record<string, unknown>;
};

export type ModelOptionsSnapshot = {
  models: ModelOptionItem[];
  reasoningEfforts: ReasoningEffortOption[];
  serviceTiers: ServiceTierOption[];
  defaultModelKey?: string;
  defaultReasoningEffort?: ModelOptionReasoningEffort;
  defaultServiceTier: ModelOptionServiceTier;
  recognized: boolean;
  fetchedAt: number;
};

type ApiEnvelope<T> = {
  code?: number;
  msg?: string;
  error?: string;
  data?: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export function normalizeModelOptionsAgentKey(value: unknown): string {
  const key = toText(value);
  return key.startsWith('agent:') ? key.slice('agent:'.length).trim() : key;
}

function toModelKey(value: unknown): string {
  const direct = toText(value);
  if (direct) {
    return direct;
  }
  if (!isRecord(value)) {
    return '';
  }
  return toText(value.key) || toText(value.modelKey) || toText(value.id);
}

export function normalizeModelOptionReasoningEffort(value: unknown): ModelOptionReasoningEffort | undefined {
  const text = toText(value).toUpperCase();
  switch (text) {
    case 'NONE':
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
    case 'XHIGH':
    case 'MAX':
      return text;
    case 'EXTRA_HIGH':
      return 'XHIGH';
    default:
      return undefined;
  }
}

export function normalizeModelOptionServiceTier(value: unknown): ModelOptionServiceTier | undefined {
  const text = toText(value).toUpperCase();
  switch (text) {
    case '':
    case 'AUTO':
    case 'DEFAULT':
    case 'STANDARD':
      return 'STANDARD';
    case 'PRIORITY':
    case 'FAST':
      return 'FAST';
    default:
      return text || undefined;
  }
}

function normalizeModelServiceTiers(value: unknown): ModelOptionServiceTier[] {
  const seen = new Set<ModelOptionServiceTier>(['STANDARD']);
  const tiers: ModelOptionServiceTier[] = ['STANDARD'];
  if (!Array.isArray(value)) {
    return tiers;
  }
  value.forEach((item) => {
    const key = normalizeModelOptionServiceTier(item);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    tiers.push(key);
  });
  return tiers;
}

function filterModels(value: unknown): ModelOptionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((item) => {
      const key = toModelKey(item.key || item.modelKey || item.id);
      const name = toText(item.name);
      if (!key || !name) {
        return null;
      }
      return {
        key,
        name,
        ...(toText(item.modelId) ? { modelId: toText(item.modelId) } : {}),
        ...(toText(item.provider) ? { provider: toText(item.provider) } : {}),
        serviceTiers: normalizeModelServiceTiers(item.serviceTiers),
        raw: item,
      };
    })
    .filter((item): item is ModelOptionItem => Boolean(item));
}

function filterReasoningOptions(value: unknown): ReasoningEffortOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isRecord)
    .map((item) => {
      const key = normalizeModelOptionReasoningEffort(item.key);
      if (!key) {
        return null;
      }
      return {
        key,
        label: toText(item.label) || key,
        raw: item,
      };
    })
    .filter((item): item is ReasoningEffortOption => Boolean(item));
}

function filterServiceTierOptions(value: unknown): ServiceTierOption[] {
  const seen = new Set<ModelOptionServiceTier>(['STANDARD']);
  const options: ServiceTierOption[] = [{ key: 'STANDARD', label: 'Standard' }];
  if (!Array.isArray(value)) {
    return options;
  }
  value.filter(isRecord).forEach((item) => {
    const key = normalizeModelOptionServiceTier(item.key);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push({
      key,
      label: toText(item.label) || key,
      raw: item,
    });
  });
  return options;
}

function unwrapSuccessfulEnvelope(response: unknown): unknown {
  if (!isRecord(response) || (!('code' in response) && !('data' in response))) {
    return response;
  }
  const envelope = response as ApiEnvelope<unknown>;
  const code = Number(envelope.code ?? 0);
  if (Number.isFinite(code) && code !== 0) {
    throw new ApiError(toText(envelope.msg) || toText(envelope.error) || 'API returned non-zero code', 200, response);
  }
  return envelope.data ?? response;
}

export function buildModelOptionsPayload(agentKey: string): { agentKey?: string } {
  const normalizedAgentKey = normalizeModelOptionsAgentKey(agentKey);
  return normalizedAgentKey ? { agentKey: normalizedAgentKey } : {};
}

export function buildAgentModelConfigPayload(
  agentKey: string,
  modelOverride: QueryModelOverride
): {
  agentKey?: string;
  modelKey?: string;
  reasoningEffort?: ModelOptionReasoningEffort;
  serviceTier?: ModelOptionServiceTier;
} {
  const normalizedAgentKey = normalizeModelOptionsAgentKey(agentKey);
  const modelKey = toText(modelOverride.key);
  const reasoningEffort = normalizeModelOptionReasoningEffort(modelOverride.reasoningEffort);
  const serviceTier = normalizeModelOptionServiceTier(modelOverride.serviceTier);
  return {
    ...(normalizedAgentKey ? { agentKey: normalizedAgentKey } : {}),
    ...(modelKey ? { modelKey } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
    ...(serviceTier && serviceTier !== 'STANDARD' ? { serviceTier } : {})
  };
}

export function unwrapModelOptionsApiEnvelope(response: unknown): unknown {
  return unwrapSuccessfulEnvelope(response);
}

export function normalizeModelOptionsResponse(response: unknown, fetchedAt = Date.now()): ModelOptionsSnapshot {
  const unwrapped = unwrapSuccessfulEnvelope(response);
  const topLevel = isRecord(response) ? response : {};
  const data = isRecord(topLevel.data) ? topLevel.data : null;
  const nestedData = data && isRecord(data.data) ? data.data : null;
  const direct = isRecord(unwrapped) ? unwrapped : null;
  const candidates = [nestedData, data, direct].filter((item): item is Record<string, unknown> => Boolean(item));

  for (const candidate of candidates) {
    if (!Array.isArray(candidate.models) && !Array.isArray(candidate.reasoningEfforts)) {
      continue;
    }
    const defaultModelKey = toModelKey(candidate.defaultModelKey);
    const defaultReasoningEffort = normalizeModelOptionReasoningEffort(candidate.defaultReasoningEffort);
    return {
      models: filterModels(candidate.models),
      reasoningEfforts: filterReasoningOptions(candidate.reasoningEfforts),
      serviceTiers: filterServiceTierOptions(candidate.serviceTiers),
      ...(defaultModelKey ? { defaultModelKey } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
      defaultServiceTier: normalizeModelOptionServiceTier(candidate.defaultServiceTier) || 'STANDARD',
      recognized: true,
      fetchedAt,
    };
  }

  return {
    models: [],
    reasoningEfforts: [],
    serviceTiers: filterServiceTierOptions([]),
    defaultServiceTier: 'STANDARD',
    recognized: false,
    fetchedAt,
  };
}
