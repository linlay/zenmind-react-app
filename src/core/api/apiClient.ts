import { readResolvedApiBaseUrl } from '../auth/authConfig';
import { getAccessTokenForRequest } from '../auth/appAuth';
import { logHttpError, logHttpRequest, logHttpResponse } from '../debug/httpDebugLogger';

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

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

type ApiResponseResult = {
  ok: boolean;
  status: number;
  payload: unknown;
  authScope: string;
};

const AUTH_SCOPE_HEADER = 'x-zenmind-auth-scope';
const APP_AUTH_SCOPE = 'app';

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
  return normalizeBaseUrl(readResolvedApiBaseUrl());
}

function buildApiUrlWithBase(
  baseUrl: string,
  path: string,
  query?: Record<string, ApiPrimitive>
): string {
  if (!baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }

  return `${baseUrl}${normalizePath(path)}${buildQueryString(query)}`;
}

export function buildApiUrl(path: string, query?: Record<string, ApiPrimitive>): string {
  return buildApiUrlWithBase(getApiBaseUrl(), path, query);
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
    body: options.body,
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
      payload,
    });

    return {
      ok: response.ok,
      status: response.status,
      payload,
      authScope: String(response.headers.get(AUTH_SCOPE_HEADER) || '').trim().toLowerCase(),
    };
  } catch (error) {
    logHttpError({
      url,
      method,
      attempt,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

function parseApiResponse<T>(response: ApiResponseResult): T {
  if (!response.ok) {
    throw new ApiError(
      resolveErrorMessage(response.status, response.payload),
      response.status,
      response.payload
    );
  }

  return response.payload as T;
}

function shouldRefreshAfterUnauthorized(response: ApiResponseResult, options: ApiRequestOptions): boolean {
  if (response.status !== 401) {
    return false;
  }
  if (normalizePath(options.path).startsWith('/ap/')) {
    return response.authScope === APP_AUTH_SCOPE;
  }
  return true;
}

async function apiRequestWithBaseUrl<T>(baseUrl: string, options: ApiRequestOptions): Promise<T> {
  return parseApiResponse<T>(await sendApiRequest(baseUrl, options));
}

export async function apiRequest<T>(options: ApiRequestOptions): Promise<T> {
  return apiRequestWithBaseUrl(getApiBaseUrl(), options);
}

export async function authenticatedApiRequest<T>(options: ApiRequestOptions): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const accessToken = await getAccessTokenForRequest(baseUrl);
  if (!accessToken) {
    throw new ApiError('Not authenticated', 401, null);
  }

  let response = await sendApiRequest(baseUrl, options, accessToken, 1);
  if (shouldRefreshAfterUnauthorized(response, options)) {
    const nextToken = await getAccessTokenForRequest(baseUrl, true);
    if (!nextToken) {
      throw new ApiError('Not authenticated', 401, null);
    }
    response = await sendApiRequest(baseUrl, options, nextToken, 2);
  }

  return parseApiResponse<T>(response);
}

export async function authenticatedFormDataRequest<T>(
  options: Omit<ApiRequestOptions, 'body' | 'bodyFormat'> & { body: FormData }
): Promise<T> {
  return authenticatedApiRequest<T>({
    ...options,
    body: options.body,
    bodyFormat: 'form',
  });
}
