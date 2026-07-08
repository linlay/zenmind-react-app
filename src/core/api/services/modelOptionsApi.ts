import { resolveActiveWsTransportConfig } from '../activeWsTransport';
import { ApiError } from '../apiError.ts';
import { sharedWsTransport } from '../../ws/sharedWsTransport.ts';
import {
  buildAgentModelConfigPayload,
  buildModelOptionsPayload,
  MODEL_CONFIG_API_PATH,
  MODEL_OPTIONS_API_PATH,
  normalizeModelOptionsResponse,
  unwrapModelOptionsApiEnvelope,
  type ModelOptionsSnapshot,
  type QueryModelOverride
} from './modelOptionsProtocol.ts';

export * from './modelOptionsProtocol.ts';

async function requestApTransport(type: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const config = await resolveActiveWsTransportConfig('ap');
  if (!config) {
    throw new ApiError('Not authenticated', 401, null);
  }

  return sharedWsTransport.request<unknown>({
    transport: config,
    type,
    payload,
    signal,
    namespace: config.kind === 'desktop-ws' ? config.namespace : undefined,
  });
}

export async function getModelOptionsApi(agentKey: string, signal?: AbortSignal): Promise<ModelOptionsSnapshot> {
  const payload = await requestApTransport(MODEL_OPTIONS_API_PATH, buildModelOptionsPayload(agentKey), signal);
  return normalizeModelOptionsResponse(payload);
}

export async function updateAgentModelConfigApi(
  agentKey: string,
  modelOverride: QueryModelOverride,
  signal?: AbortSignal
): Promise<unknown> {
  const payload = await requestApTransport(
    MODEL_CONFIG_API_PATH,
    buildAgentModelConfigPayload(agentKey, modelOverride),
    signal
  );
  return unwrapModelOptionsApiEnvelope(payload);
}
