import {
  APP_ENVIRONMENT,
  DEFAULT_SOURCE_ENVIRONMENT
} from '../../shared/generated/appEnv';
import { normalizeApiBaseUrl } from './endpoint';

export type DefaultSourceConfig = {
  kind: 'default';
  sourceId: string;
  displayName: string;
  environmentId: string;
  apiBaseUrl: string;
  wsUrl: string;
  wsPath: string;
  authMode: 'none' | 'query-token';
  accessToken: string;
};

function resolveWsUrl(explicitWsUrl: string, apiBaseUrl: string, wsPath: string): string {
  const candidate = String(explicitWsUrl || '').trim();
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:' ? parsed.toString() : '';
    } catch {
      return '';
    }
  }
  if (!apiBaseUrl) {
    return '';
  }

  try {
    const parsed = new URL(apiBaseUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = wsPath;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function getDefaultSourceConfig(): DefaultSourceConfig {
  const environment = DEFAULT_SOURCE_ENVIRONMENT;
  const apiBaseUrl = normalizeApiBaseUrl(environment.apiBaseUrl);
  const wsPath = environment.wsPath || '/ap/ws';
  const wsUrl = resolveWsUrl(environment.wsUrl, apiBaseUrl, wsPath);

  return {
    kind: 'default',
    sourceId: environment.id,
    displayName: environment.displayName,
    environmentId: APP_ENVIRONMENT.environmentId,
    apiBaseUrl,
    wsUrl,
    wsPath,
    authMode: environment.authMode,
    accessToken: environment.accessToken
  };
}
