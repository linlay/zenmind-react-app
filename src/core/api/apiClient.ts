import { getSelectedSource } from '../auth/activeDesktop';
import { getCloudAuthSnapshot, reportCloudFailure } from '../auth/cloudAuth';
import { classifyCloudFailure } from './services/chatDirectoryApi';
import { getDefaultSourceConfig } from '../config/appEnvironment';
import { logHttpError, logHttpRequest, logHttpResponse } from '../debug/httpDebugLogger';
import { ApiError } from './apiError.ts';
import { resolveActiveWsTransportConfig, resolveDefaultWsTransportConfig } from './activeWsTransport';
import { getAccountAuthGeneration } from '../auth/accountAuth';

export { ApiError } from './apiError.ts';

type ApiPrimitive = string | number | boolean | null | undefined;

export type ApiRequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, ApiPrimitive>;
  body?: unknown;
  bodyFormat?: 'json' | 'form';
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type ApiUriSource = {
  textContent?: string;
  uri: string;
  headers?: Record<string, string>;
};

type ApiResponseResult = {
  ok: boolean;
  status: number;
  payload: unknown;
};

async function getCloudAccessTokenForRequest(): Promise<string> {
  const transport = resolveDefaultWsTransportConfig();
  if (!transport) throw new ApiError('Not authenticated', 401, null);
  return transport.accessTokenProvider ? transport.accessTokenProvider() : transport.accessToken;
}

function normalizeBaseUrl(value: string | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  const value = String(path || '').trim();
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function buildQueryString(query?: Record<string, ApiPrimitive>): string {
  if (!query) {
    return '';
  }

  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  const text = searchParams.toString();
  return text ? `?${text}` : '';
}

function parsePayload(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function resolveErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
    if (typeof data.msg === 'string' && data.msg.trim()) {
      return data.msg;
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
  }

  return `HTTP ${status}`;
}

export function getApiBaseUrl(): string {
  return normalizeBaseUrl(getDefaultSourceConfig().apiBaseUrl);
}

function buildApiUrlWithBase(baseUrl: string, path: string, query?: Record<string, ApiPrimitive>): string {
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }

  return `${baseUrl}${normalizePath(path)}${buildQueryString(query)}`;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function isProtocolRelativeUrl(value: string): boolean {
  return value.startsWith('//');
}

function appendQueryToAbsoluteUrl(url: string, query?: Record<string, ApiPrimitive>): string {
  if (!query) {
    return url;
  }

  const parsedUrl = new URL(url);
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    parsedUrl.searchParams.set(key, String(value));
  });
  return parsedUrl.toString();
}

function isSameOriginUrl(leftUrl: string, rightUrl: string): boolean {
  try {
    return new URL(leftUrl).origin === new URL(rightUrl).origin;
  } catch {
    return false;
  }
}

function resolveApiUrlWithBase(baseUrl: string, pathOrUrl: string, query?: Record<string, ApiPrimitive>): string {
  const target = String(pathOrUrl || '').trim();
  if (isProtocolRelativeUrl(target) || (hasUrlScheme(target) && !isHttpUrl(target))) {
    return target;
  }
  if (isHttpUrl(target)) {
    return appendQueryToAbsoluteUrl(target, query);
  }
  return buildApiUrlWithBase(baseUrl, target, query);
}

function buildDebugApiUrlWithBase(baseUrl: string, path: string, query?: Record<string, ApiPrimitive>): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const requestPath = `${normalizePath(path)}${buildQueryString(query)}`;
  return normalizedBaseUrl ? `${normalizedBaseUrl}${requestPath}` : requestPath;
}

export function buildApiUrl(path: string, query?: Record<string, ApiPrimitive>): string {
  return buildApiUrlWithBase(getApiBaseUrl(), path, query);
}

function isApiUrlTargetWithBase(target: string, baseUrl: string): boolean {
  if (!target) {
    return false;
  }
  if (isProtocolRelativeUrl(target)) {
    return false;
  }
  if (target.startsWith('/')) {
    return true;
  }
  return Boolean(baseUrl && isHttpUrl(target) && isSameOriginUrl(baseUrl, target));
}

export async function buildAuthenticatedApiUriSource(
  pathOrUrl: string,
  query?: Record<string, ApiPrimitive>
): Promise<ApiUriSource> {
  const target = String(pathOrUrl || '').trim();
  if (!target || isProtocolRelativeUrl(target) || (hasUrlScheme(target) && !isHttpUrl(target))) {
    return { uri: target };
  }

  if (getSelectedSource()?.kind === 'desktop') {
    const selection = getSelectedSource();
    const generation = getAccountAuthGeneration();
    const transport = await resolveActiveWsTransportConfig('d');
    if (!transport || transport.kind !== 'desktop-ws') throw new ApiError('Desktop unavailable', 401, null);
    const base = new URL(transport.wsUrl);
    base.protocol = base.protocol === 'wss:' ? 'https:' : 'http:';
    base.pathname = '/';
    const url = new URL(target, base);
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      url.hash ||
      !['/api/resource', '/api/file'].includes(url.pathname) ||
      url.searchParams.has('token')
    )
      throw new Error('Invalid Desktop resource origin or path');
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    const token = transport.accessTokenProvider ? await transport.accessTokenProvider() : transport.accessToken;
    const headers = await transport.requestHeadersProvider?.();
    if (selection !== getSelectedSource() || generation !== getAccountAuthGeneration())
      throw new Error('Desktop resource superseded');
    return { uri: url.toString(), headers: { ...headers, Authorization: `Bearer ${token}` } };
  }
  const baseUrl = getApiBaseUrl();
  if (!baseUrl || !isApiUrlTargetWithBase(target, baseUrl)) {
    return { uri: target };
  }

  const uri = resolveApiUrlWithBase(baseUrl, pathOrUrl, query);
  const selection = getSelectedSource();
  const generation = getCloudAuthSnapshot().generation;
  const accessToken = await getCloudAccessTokenForRequest();
  if (selection !== getSelectedSource() || generation !== getCloudAuthSnapshot().generation)
    throw new Error('Cloud resource superseded');
  return accessToken
    ? {
        uri,
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    : { uri };
}

function buildRequestHeaders(options: ApiRequestOptions, accessToken?: string): Headers {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined;

  if (hasBody && options.bodyFormat !== 'form' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

function buildRequestInit(options: ApiRequestOptions, accessToken?: string): RequestInit {
  const hasBody = options.body !== undefined;
  const body =
    hasBody && options.bodyFormat === 'form'
      ? (options.body as BodyInit)
      : hasBody
        ? JSON.stringify(options.body)
        : undefined;
  return {
    method: options.method || 'GET',
    headers: buildRequestHeaders(options, accessToken),
    body,
    signal: options.signal,
    redirect: 'error'
  };
}

async function sendApiRequest(
  baseUrl: string,
  options: ApiRequestOptions,
  accessToken?: string,
  attempt = 1
): Promise<ApiResponseResult> {
  const url = buildApiUrlWithBase(baseUrl, options.path, options.query);
  const method = options.method || 'GET';
  const startedAt = Date.now();
  const requestInit = buildRequestInit(options, accessToken);

  logHttpRequest({
    url,
    method,
    attempt,
    body: options.body
  });

  try {
    const response = await fetch(url, requestInit);
    const text = await response.text();
    const payload = parsePayload(text);

    logHttpResponse({
      url,
      method,
      attempt,
      status: response.status,
      durationMs: Date.now() - startedAt,
      payload
    });

    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  } catch (error) {
    logHttpError({
      url,
      method,
      attempt,
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  }
}

function parseApiResponse<T>(response: ApiResponseResult): T {
  if (!response.ok) {
    throw new ApiError(resolveErrorMessage(response.status, response.payload), response.status, response.payload);
  }

  return response.payload as T;
}

async function apiRequestWithBaseUrl<T>(baseUrl: string, options: ApiRequestOptions): Promise<T> {
  return parseApiResponse<T>(await sendApiRequest(baseUrl, options));
}

export async function apiRequest<T>(options: ApiRequestOptions): Promise<T> {
  return apiRequestWithBaseUrl(getApiBaseUrl(), options);
}

export async function authenticatedApiRequest<T>(options: ApiRequestOptions): Promise<T> {
  const generation = getCloudAuthSnapshot().generation;
  const selection = getSelectedSource();
  const assertCurrent = () => {
    if (
      generation !== getCloudAuthSnapshot().generation ||
      getCloudAuthSnapshot().status !== 'available' ||
      selection !== getSelectedSource() ||
      options.signal?.aborted
    )
      throw new Error('Account or source request superseded');
  };
  const baseUrl = getApiBaseUrl();
  const method = options.method || 'GET';
  const startedAt = Date.now();
  let accessToken: string;

  try {
    accessToken = await getCloudAccessTokenForRequest();
  } catch (error) {
    logHttpError({
      url: buildDebugApiUrlWithBase(baseUrl, options.path, options.query),
      method,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      error
    });
    throw error;
  }

  assertCurrent();
  const response = await sendApiRequest(baseUrl, options, accessToken, 1);
  assertCurrent();

  if (!response.ok) reportCloudFailure(classifyCloudFailure({ status: response.status }), generation);
  return parseApiResponse<T>(response);
}

export async function authenticatedFormDataRequest<T>(
  options: Omit<ApiRequestOptions, 'body' | 'bodyFormat'> & { body: FormData }
): Promise<T> {
  return authenticatedApiRequest<T>({
    ...options,
    body: options.body,
    bodyFormat: 'form'
  });
}
