import { ensureFreshAccessToken } from '../auth/appAuth';
import { getAccountAuthSnapshot } from '../auth/accountAuth.ts';
import { readActiveDesktopId } from '../auth/activeDesktop.ts';
import { getActiveDeviceProfile } from '../auth/deviceProfiles';
import { getDefaultSourceConfig } from '../config/appEnvironment';
import type { WsTransportConfig, WsTransportNamespace } from '../ws/wsTransportConfig';
import { issueDesktopRouteCredential } from './services/deviceLinkApi.ts';

function createRequestId(): string {
  const value = new Uint8Array(16);
  const runtimeCrypto = globalThis.crypto as Crypto | undefined;
  if (runtimeCrypto?.getRandomValues) {
    runtimeCrypto.getRandomValues(value);
  } else {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = Math.floor(Math.random() * 256);
    }
  }
  value[6] = (value[6] & 0x0f) | 0x40;
  value[8] = (value[8] & 0x3f) | 0x80;
  const hex = [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function resolveActiveWsTransportConfig(
  namespace: WsTransportNamespace
): Promise<WsTransportConfig | null> {
  const accountSession = getAccountAuthSnapshot().session;
  const activeAccountDesktopId = accountSession ? readActiveDesktopId(accountSession.accountId) : '';
  if (accountSession && activeAccountDesktopId) {
    const issueCredential = () => issueDesktopRouteCredential(activeAccountDesktopId, createRequestId());
    const route = await issueCredential();
    return {
      kind: 'desktop-ws',
      wsUrl: route.webSocketUrl,
      tokenMode: route.tokenMode,
      accessToken: route.credential,
      accessTokenProvider: async () => (await issueCredential()).credential,
      namespace,
      connectionKey: `account:${accountSession.accountId}:${activeAccountDesktopId}`
    };
  }

  const activeProfile = getActiveDeviceProfile();
  if (activeProfile?.transportKind === 'desktop-ws') {
    const transport = activeProfile.desktopWs;
    if (!transport) {
      return null;
    }

    const accessToken = await ensureFreshAccessToken('', {
      failureMode: 'hard'
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
