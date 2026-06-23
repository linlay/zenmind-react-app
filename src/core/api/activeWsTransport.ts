import { ensureFreshAccessToken, getAccessTokenForRequest } from '../auth/appAuth';
import { getActiveDeviceProfile } from '../auth/deviceProfiles';
import { getApiBaseUrl } from './apiClient';
import type { WsTransportConfig, WsTransportNamespace } from '../ws/wsTransportConfig';

export async function resolveActiveWsTransportConfig(
  namespace: WsTransportNamespace
): Promise<WsTransportConfig | null> {
  const activeProfile = getActiveDeviceProfile();
  if (activeProfile?.transportKind === 'desktop-ws') {
    const transport = activeProfile.desktopWs;
    if (!transport) {
      return null;
    }

    const accessToken = await ensureFreshAccessToken('', {
      failureMode: 'hard',
    });
    if (!accessToken) {
      return null;
    }

    const refreshedProfile = getActiveDeviceProfile();
    const refreshedTransport =
      refreshedProfile?.transportKind === 'desktop-ws' && refreshedProfile.desktopWs
        ? refreshedProfile.desktopWs
        : transport;
    return {
      kind: 'desktop-ws',
      wsUrl: refreshedTransport.wsUrl,
      tokenMode: refreshedTransport.tokenMode,
      accessToken,
      namespace,
    };
  }

  const backendUrl = getApiBaseUrl();
  if (!backendUrl) {
    return null;
  }

  const accessToken = await getAccessTokenForRequest(backendUrl);
  if (!accessToken) {
    return null;
  }

  return {
    kind: 'agent-platform',
    backendUrl,
    accessToken,
  };
}
