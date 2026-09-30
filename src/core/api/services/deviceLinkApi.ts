import { readIdentityApiBaseUrl, readTunnelHubApiBaseUrl } from '../../auth/authConfig.ts';
import { authenticatedAccountApiRequest, publicAccountApiRequest } from '../accountApiClient.ts';
import {
  DEVICE_LINK_SCHEMA_VERSION,
  parseAccountDeviceListV1,
  parseTrustedRouteContext,
  type AccountDeviceListV1,
  type DeviceKind,
  type TrustedRouteContext,
  type TrustLevel
} from '../contracts/deviceLink.ts';
import { mergeAccountDevicePresence, parseDesktopPresence } from '../contracts/devicePresence.ts';

export async function listAccountDevices(signal?: AbortSignal): Promise<AccountDeviceListV1> {
  const identityBaseUrl = readIdentityApiBaseUrl();
  const hubBaseUrl = readTunnelHubApiBaseUrl();
  const [devicesPayload, presencePayload] = await Promise.all([
    authenticatedAccountApiRequest<unknown>(identityBaseUrl, { path: '/api/auth/account-devices', signal }),
    authenticatedAccountApiRequest<unknown>(hubBaseUrl, { path: '/api/desktop/account-presence', signal })
  ]);
  return mergeAccountDevicePresence(parseAccountDeviceListV1(devicesPayload), parseDesktopPresence(presencePayload));
}

export async function renameAccountDevice(deviceId: string, deviceName: string): Promise<void> {
  await authenticatedAccountApiRequest(readIdentityApiBaseUrl(), {
    path: `/api/auth/account-devices/${encodeURIComponent(deviceId)}`,
    method: 'PATCH',
    body: { deviceName }
  });
}

export async function revokeAccountDevice(deviceId: string): Promise<void> {
  await authenticatedAccountApiRequest(readIdentityApiBaseUrl(), {
    path: `/api/auth/account-devices/${encodeURIComponent(deviceId)}`,
    method: 'DELETE'
  });
}

export async function changeAccountDeviceTrust(deviceId: string, trustLevel: TrustLevel): Promise<void> {
  await authenticatedAccountApiRequest(readIdentityApiBaseUrl(), {
    path: `/api/auth/account-devices/${encodeURIComponent(deviceId)}/trust`,
    method: 'PATCH',
    body: { trustLevel }
  });
}

export async function startAccountLoginChallenge(input: {
  deviceName: string;
  deviceKind: DeviceKind;
  signal?: AbortSignal;
}): Promise<{ challengeId: string; claimToken: string; expiresAt: string; qrPayload: { challengeId: string } }> {
  return publicAccountApiRequest(readIdentityApiBaseUrl(), {
    path: '/api/auth/account/login-challenges',
    method: 'POST',
    body: { deviceName: input.deviceName, deviceKind: input.deviceKind },
    signal: input.signal
  });
}

export async function confirmAccountLoginChallenge(
  challengeId: string,
  trustLevel: TrustLevel,
  signal?: AbortSignal
): Promise<void> {
  await authenticatedAccountApiRequest(readIdentityApiBaseUrl(), {
    path: `/api/auth/account/login-challenges/${encodeURIComponent(challengeId)}/confirm`,
    method: 'POST',
    body: { trustLevel },
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
