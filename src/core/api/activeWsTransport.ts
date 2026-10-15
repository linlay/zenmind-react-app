import {
  getAccountAccessTokenForRequest,
  getAccountAuthGeneration,
  getAccountAuthSnapshot
} from '../auth/accountAuth.ts';
import { readActiveDesktopId, isActiveDesktopOffline, getSelectedSource } from '../auth/activeDesktop.ts';
import { getCloudAuthSnapshot, readCloudCredential, type CloudCredential } from '../auth/cloudAuth';
import { getDefaultSourceConfig } from '../config/appEnvironment';
import type { WsTransportConfig, WsTransportNamespace } from '../ws/wsTransportConfig';
import { getDesktopPlatformCredential } from './services/deviceLinkApi.ts';

import { readTunnelHubApiBaseUrl } from '../auth/authConfig.ts';

type DesktopRoute = Awaited<ReturnType<typeof getDesktopPlatformCredential>>;
let routeCache: { key: string; route?: DesktopRoute; pending?: Promise<DesktopRoute> } | null = null;

export function clearDesktopPlatformCredentialCache() {
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
    const key = JSON.stringify([generation, accountSession.accountId, desktopId]);
    if (routeCache?.key !== key) routeCache = { key };
    const cache = routeCache;
    if (!forceRefresh && cache.route && Date.parse(cache.route.expiresAt) > Date.now() + 15_000) return cache.route;
    if (!cache.pending) {
      cache.pending = getDesktopPlatformCredential(desktopId).finally(() => {
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
      cache.route &&
      (cache.route.platformDeviceId !== route.platformDeviceId || cache.route.webSocketUrl !== route.webSocketUrl)
    )
      throw new Error('Desktop credential identity changed');
    cache.route = route;
    return route;
  };
  const route = await issueCredential();
  return {
    kind: 'desktop-ws',
    wsUrl: route.webSocketUrl,
    tokenMode: route.tokenMode,
    accessToken: route.credential,
    accessTokenProvider: async (forceRefresh = false) => (await issueCredential(forceRefresh)).credential,
    requestHeadersProvider: async () => {
      await issueCredential();
      const token = await getAccountAccessTokenForRequest(readTunnelHubApiBaseUrl());
      if (selected !== getSelectedSource() || generation !== getAccountAuthGeneration() || !token)
        throw new Error('Account source superseded');
      return { 'X-Account-Authorization': `Bearer ${token}` };
    },
    namespace,
    connectionKey: `account:${accountSession.accountId}:${generation}:${desktopId}:${route.platformDeviceId}`
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
