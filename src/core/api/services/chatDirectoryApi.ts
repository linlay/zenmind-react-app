import { ApiError } from '../apiError.ts';
import { sharedWsTransport } from '../../ws/sharedWsTransport.ts';
import type { WsTransportConfig } from '../../ws/wsTransportConfig.ts';
import { buildChatSummariesPayload, unwrapChatApiEnvelope, type RemoteChatSummary } from './chatApi.ts';

// The same read-only directory contract serves verification and home projection.
export async function readChatDirectory<TAgent, TTeam>(transport: WsTransportConfig, signal?: AbortSignal) {
  const request = async <T>(type: string, payload?: unknown): Promise<T[]> => {
    const response = unwrapChatApiEnvelope<unknown>(
      await sharedWsTransport.request({
        transport,
        type,
        payload,
        signal,
        namespace: transport.kind === 'desktop-ws' ? transport.namespace : undefined
      })
    );
    if (!Array.isArray(response) || response.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))
      throw new ApiError('Invalid chat directory response', 502, { code: 'INVALID_DIRECTORY' });
    return response as T[];
  };
  const [agents, chats] = await Promise.all([
    request<TAgent>('/api/agents'),
    request<RemoteChatSummary>('/api/chats', buildChatSummariesPayload())
  ]);
  // TEAM is an Agent mode; retain the projection shape without the retired teams route.
  return { agents, teams: [] as TTeam[], chats };
}

export function classifyCloudFailure(error: unknown) {
  const record =
    error && typeof error === 'object' ? (error as { status?: unknown; code?: unknown; payload?: unknown }) : {};
  const payload = record.payload && typeof record.payload === 'object' ? (record.payload as { code?: unknown }) : {};
  const code = record.code ?? payload.code;
  const status = Number(record.status);
  if (status === 401 || Number(code) === 401 || code === 'UNAUTHORIZED' || code === 'TOKEN_EXPIRED')
    return 'login_required' as const;
  if (status === 403 || Number(code) === 403 || code === 'FORBIDDEN') return 'forbidden' as const;
  if (code === 'INVALID_DIRECTORY' || error instanceof SyntaxError) return 'protocol_error' as const;
  if (status >= 500 || status === 200) return 'service_error' as const;
  return 'network_error' as const;
}
