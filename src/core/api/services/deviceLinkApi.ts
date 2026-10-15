import { readTunnelHubApiBaseUrl } from '../../auth/authConfig.ts';
import { authenticatedAccountApiRequest } from '../accountApiClient.ts';
import {
  parseAccountDeviceListV1,
  parseDesktopPlatformCredential,
  type AccountDeviceListV1
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

export async function getDesktopPlatformCredential(targetDesktopId: string, signal?: AbortSignal) {
  return parseDesktopPlatformCredential(
    await authenticatedAccountApiRequest<unknown>(readTunnelHubApiBaseUrl(), {
      path: '/api/desktop/route-credentials',
      method: 'POST',
      body: { targetDesktopId },
      signal
    })
  );
}
