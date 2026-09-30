import { MMKV } from 'react-native-mmkv';

import { normalizeApiBaseUrl } from '../config/endpoint';
import { readPublicEnv } from '../config/runtimeEnv';

const authConfigStorage = new MMKV({ id: 'zenmind-auth-config' });
const API_BASE_URL_KEY = 'auth_api_base_url_v1';
const IDENTITY_API_BASE_URL_KEY = 'identity_api_base_url_v1';
const TUNNEL_HUB_API_BASE_URL_KEY = 'tunnel_hub_api_base_url_v1';
const AUTH_REQUIRED = true;

export function isAuthRequired(): boolean {
  return AUTH_REQUIRED;
}

export function readStoredApiBaseUrl(): string {
  return normalizeApiBaseUrl(authConfigStorage.getString(API_BASE_URL_KEY) || '');
}

export function saveStoredApiBaseUrl(value: string) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) {
    authConfigStorage.delete(API_BASE_URL_KEY);
    return;
  }

  authConfigStorage.set(API_BASE_URL_KEY, normalized);
}

export function readResolvedApiBaseUrl(): string {
  return readStoredApiBaseUrl() || normalizeApiBaseUrl(readPublicEnv('EXPO_PUBLIC_API_BASE_URL'));
}

export function readIdentityApiBaseUrl(): string {
  return (
    normalizeApiBaseUrl(authConfigStorage.getString(IDENTITY_API_BASE_URL_KEY) || '') ||
    normalizeApiBaseUrl(readPublicEnv('EXPO_PUBLIC_IDENTITY_API_BASE_URL')) ||
    readResolvedApiBaseUrl()
  );
}

export function readTunnelHubApiBaseUrl(): string {
  return (
    normalizeApiBaseUrl(authConfigStorage.getString(TUNNEL_HUB_API_BASE_URL_KEY) || '') ||
    normalizeApiBaseUrl(readPublicEnv('EXPO_PUBLIC_TUNNEL_HUB_API_BASE_URL')) ||
    readIdentityApiBaseUrl()
  );
}

export function saveAccountServiceBaseUrls(identityBaseUrl: string, tunnelHubBaseUrl = '') {
  const identity = normalizeApiBaseUrl(identityBaseUrl);
  const hub = normalizeApiBaseUrl(tunnelHubBaseUrl);
  if (identity) authConfigStorage.set(IDENTITY_API_BASE_URL_KEY, identity);
  else authConfigStorage.delete(IDENTITY_API_BASE_URL_KEY);
  if (hub) authConfigStorage.set(TUNNEL_HUB_API_BASE_URL_KEY, hub);
  else authConfigStorage.delete(TUNNEL_HUB_API_BASE_URL_KEY);
}
