import { MMKV } from 'react-native-mmkv';

import { normalizeApiBaseUrl } from '../config/endpoint';
import { readPublicEnv } from '../config/runtimeEnv';
import { APP_ENVIRONMENT } from '../../shared/generated/appEnv';

const authConfigStorage = new MMKV({ id: 'zenmind-auth-config' });
const API_BASE_URL_KEY = 'auth_api_base_url_v1';
export function readStoredApiBaseUrl(): string {
  return normalizeApiBaseUrl(authConfigStorage.getString(API_BASE_URL_KEY) || '');
}

export function readResolvedApiBaseUrl(): string {
  return readStoredApiBaseUrl() || normalizeApiBaseUrl(readPublicEnv('EXPO_PUBLIC_API_BASE_URL'));
}

type AccountServices = { officialApiBaseUrl?: string; tunnelHubApiBaseUrl?: string };
function accountServices(): AccountServices {
  return (APP_ENVIRONMENT as typeof APP_ENVIRONMENT & { accountServices?: AccountServices }).accountServices || {};
}
export function readOfficialApiBaseUrl(): string {
  return normalizeApiBaseUrl(
    accountServices().officialApiBaseUrl || readPublicEnv('EXPO_PUBLIC_OFFICIAL_API_BASE_URL')
  );
}
export function readTunnelHubApiBaseUrl(): string {
  return normalizeApiBaseUrl(
    accountServices().tunnelHubApiBaseUrl || readPublicEnv('EXPO_PUBLIC_TUNNEL_HUB_API_BASE_URL')
  );
}
