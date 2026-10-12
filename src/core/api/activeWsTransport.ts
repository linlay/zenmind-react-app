import { getAccountAuthGeneration, getAccountAuthSnapshot } from '../auth/accountAuth.ts';
import { readActiveDesktopId, isActiveDesktopOffline, getSelectedSource } from '../auth/activeDesktop.ts';
import { getCloudAuthSnapshot, readCloudCredential, type CloudCredential } from '../auth/cloudAuth';
import { getDefaultSourceConfig } from '../config/appEnvironment';
import type { WsTransportConfig, WsTransportNamespace } from '../ws/wsTransportConfig';
import { issueDesktopRouteCredential } from './services/deviceLinkApi.ts';

export function createRequestId(): string {
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

type DesktopRoute = Awaited<ReturnType<typeof issueDesktopRouteCredential>>;
let routeCache: { key: string; route?: DesktopRoute; pending?: Promise<DesktopRoute> } | null = null;

export function clearDesktopRouteCredentialCache() {
  routeCache = null;
}

export async function resolveActiveWsTransportConfig(
  namespace: WsTransportNamespace
): Promise<WsTransportConfig | null> {
  const accountSession = getAccountAuthSnapshot().session;
  const desktopId = accountSession ? readActiveDesktopId(accountSession.accountId) : '';
  if (!accountSession || !desktopId || isActiveDesktopOffline()) return null;
  const generation = getAccountAuthGeneration();
  const selected = getSelectedSource();
  const issueCredential = async (forceRefresh = false) => {
    if (
      selected !== getSelectedSource() ||
      generation !== getAccountAuthGeneration() ||
      readActiveDesktopId(accountSession.accountId) !== desktopId ||
      isActiveDesktopOffline()
    ) {
      throw new Error('Source request superseded');
    }
    const key = JSON.stringify([generation, accountSession.accountId, accountSession.deviceId, desktopId]);
    if (routeCache?.key !== key) routeCache = { key };
    const cache = routeCache;
    if (!forceRefresh && cache.route && Date.parse(cache.route.routeContext.expiresAt) > Date.now() + 15_000)
      return cache.route;
    if (!cache.pending) {
      cache.pending = issueDesktopRouteCredential(desktopId, createRequestId()).finally(() => {
        cache.pending = undefined;
      });
    }
    const route = await cache.pending;
    if (
      selected !== getSelectedSource() ||
      generation !== getAccountAuthGeneration() ||
      readActiveDesktopId(accountSession.accountId) !== desktopId ||
      isActiveDesktopOffline()
    ) {
      throw new Error('Source request superseded');
    }
    if (
      route.routeContext.accountId !== accountSession.accountId ||
      route.routeContext.sourceDeviceId !== accountSession.deviceId ||
      route.routeContext.targetDesktopId !== desktopId
    ) {
      throw new Error('Route credential identity mismatch');
    }
    cache.route = route;
    return route;
  };
  const route = await issueCredential();
  return {
    kind: 'desktop-ws',
    wsUrl: route.webSocketUrl,
    tokenMode: route.tokenMode,
    accessToken: route.credential,
    accessTokenProvider: async () => (await issueCredential(true)).credential,
    namespace,
    connectionKey: `account:${accountSession.accountId}:${accountSession.deviceId}:${desktopId}`
  };
}

export function createDefaultWsTransportConfig(credential: CloudCredential): WsTransportConfig | null {
  const source = getDefaultSourceConfig();
  if (!source.apiBaseUrl && !source.wsUrl) {
    return null;
  }
  return {
    kind: 'agent-platform',
    backendUrl: source.apiBaseUrl,
    wsUrl: source.wsUrl || undefined,
    accessToken: credential.token,
    connectionKey: `cloud:${credential.scopeId}`
  };
}

export function resolveDefaultWsTransportConfig(): WsTransportConfig | null {
  const credential = readCloudCredential();
  if (getSelectedSource()?.kind !== 'cloud' || !credential || getCloudAuthSnapshot().status !== 'available')
    return null;
  const selection = getSelectedSource();
  const config = createDefaultWsTransportConfig(credential);
  if (!config) return null;
  return {
    ...config,
    accessTokenProvider: async () => {
      if (
        selection !== getSelectedSource() ||
        getSelectedSource()?.kind !== 'cloud' ||
        readCloudCredential()?.scopeId !== credential.scopeId
      )
        throw new Error('Cloud source superseded');
      const state = getCloudAuthSnapshot();
      if (state.status === 'login_required' || state.status === 'forbidden')
        throw new Error('Cloud access unavailable');
      return credential.token;
    }
  };
}
