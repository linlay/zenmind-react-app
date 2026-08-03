import { ensureFreshAccessToken } from '../auth/appAuth';
import { getActiveDeviceProfile } from '../auth/deviceProfiles';
import { getDefaultSourceConfig } from '../config/appEnvironment';
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
      connectionKey: `paired:${refreshedProfile?.desktopDeviceId || activeProfile.desktopDeviceId}`
    };
  }

  return null;
}

export function resolveDefaultWsTransportConfig(): WsTransportConfig | null {
  const source = getDefaultSourceConfig();
  if (!source.apiBaseUrl && !source.wsUrl) {
    return null;
  }
  return {
    kind: 'agent-platform',
    backendUrl: source.apiBaseUrl,
    wsUrl: source.wsUrl || undefined,
    accessToken: source.accessToken,
    connectionKey: `default:${source.sourceId}`
  };
}
