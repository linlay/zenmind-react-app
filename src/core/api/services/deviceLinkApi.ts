import { readIdentityApiBaseUrl, readTunnelHubApiBaseUrl } from '../../auth/authConfig.ts';
import { authenticatedAccountApiRequest, publicAccountApiRequest } from '../accountApiClient.ts';
import {
  DEVICE_LINK_SCHEMA_VERSION,
  parseAccountDeviceListV1,
  parseTrustedRouteContext,
  type AccountDeviceListV1,
  type TrustedRouteContext
} from '../contracts/deviceLink.ts';

export async function listAccountDevices(signal?: AbortSignal): Promise<AccountDeviceListV1> {
  const payload = await authenticatedAccountApiRequest<unknown>(readTunnelHubApiBaseUrl(), {
    path: '/api/desktop/account-devices',
    signal
  });
  return parseAccountDeviceListV1(payload);
}

export async function renameAccountDevice(deviceId: string, deviceName: string): Promise<void> {
  await authenticatedAccountApiRequest(readTunnelHubApiBaseUrl(), {
    path: `/api/desktop/account-devices/${encodeURIComponent(deviceId)}`,
    method: 'PATCH',
    body: { deviceName }
  });
}

export async function revokeAccountDevice(deviceId: string): Promise<void> {
  await authenticatedAccountApiRequest(readTunnelHubApiBaseUrl(), {
    path: `/api/desktop/account-devices/${encodeURIComponent(deviceId)}`,
    method: 'DELETE'
  });
}

export async function startAccountLoginChallenge(input: {
  deviceName: string;
  signal?: AbortSignal;
}): Promise<{ challengeId: string; claimToken: string; expiresAt: string; qrPayload: { challengeId: string } }> {
  return publicAccountApiRequest(readIdentityApiBaseUrl(), {
    path: '/api/auth/account/login-challenges',
    method: 'POST',
    body: { deviceName: input.deviceName },
    signal: input.signal
  });
}

export async function confirmAccountLoginChallenge(challengeId: string, signal?: AbortSignal): Promise<void> {
  await authenticatedAccountApiRequest(readIdentityApiBaseUrl(), {
    path: `/api/auth/account/login-challenges/${encodeURIComponent(challengeId)}/confirm`,
    method: 'POST',
    signal
  });
}

export async function issueDesktopRouteCredential(
  targetDesktopId: string,
  requestId: string,
  signal?: AbortSignal
): Promise<{
  credential: string;
  routeContext: TrustedRouteContext;
  webSocketUrl: string;
  tokenMode: 'query' | 'subprotocol';
}> {
  const payload = await authenticatedAccountApiRequest<Record<string, unknown>>(readTunnelHubApiBaseUrl(), {
    path: '/api/desktop/route-credentials',
    method: 'POST',
    body: { targetDesktopId, requestId },
    signal
  });
  if (
    payload.schemaVersion !== DEVICE_LINK_SCHEMA_VERSION ||
    typeof payload.credential !== 'string' ||
    !/^tr_[A-Za-z0-9_-]{43}$/u.test(payload.credential) ||
    typeof payload.webSocketUrl !== 'string' ||
    (payload.tokenMode !== 'query' && payload.tokenMode !== 'subprotocol')
  ) {
    throw new Error('Invalid route credential response');
  }
  const webSocketUrl = new URL(payload.webSocketUrl);
  if (webSocketUrl.protocol !== 'ws:' && webSocketUrl.protocol !== 'wss:') {
    throw new Error('Invalid route WebSocket URL');
  }
  return {
    credential: payload.credential,
    routeContext: parseTrustedRouteContext(payload.routeContext),
    webSocketUrl: webSocketUrl.toString(),
    tokenMode: payload.tokenMode
  };
}
