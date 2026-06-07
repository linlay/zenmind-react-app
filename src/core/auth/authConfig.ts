import { MMKV } from 'react-native-mmkv';

import { normalizeApiBaseUrl } from '../config/endpoint';
import { readPublicEnv } from '../config/runtimeEnv';

const authConfigStorage = new MMKV({ id: 'zenmind-auth-config' });
const API_BASE_URL_KEY = 'auth_api_base_url_v1';
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
