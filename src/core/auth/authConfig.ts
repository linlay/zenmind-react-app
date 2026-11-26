import { normalizeApiBaseUrl } from '../config/endpoint';
import { ACCOUNT_SERVICES } from '../../shared/generated/appEnv';
import { APP_BRAND } from '../../shared/generated/brand';

export const ACCOUNT_LOGIN_METHOD = APP_BRAND.accountLoginMethod;
export function readOfficialApiBaseUrl(): string {
  return normalizeApiBaseUrl(ACCOUNT_SERVICES?.officialApiBaseUrl || '');
}
export function readEnterpriseApiBaseUrl(): string {
  return normalizeApiBaseUrl(ACCOUNT_SERVICES?.ssoBaseUrl || '');
}
export function readAccountApiBaseUrl(): string {
  return ACCOUNT_LOGIN_METHOD === 'email-code' ? readOfficialApiBaseUrl() : readEnterpriseApiBaseUrl();
}
export function readTunnelHubApiBaseUrl(): string {
  return normalizeApiBaseUrl(ACCOUNT_SERVICES?.tunnelHubApiBaseUrl || '');
}
