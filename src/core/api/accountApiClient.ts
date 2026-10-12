import { getAccountAccessTokenForRequest, getAccountAuthGeneration } from '../auth/accountAuth.ts';
import { ApiError } from './apiError.ts';

export type AccountApiRequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

function buildUrl(baseUrl: string, options: AccountApiRequestOptions): string {
  const url = new URL(options.path, `${baseUrl.replace(/\/+$/u, '')}/`);
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function send<T>(baseUrl: string, options: AccountApiRequestOptions, accessToken?: string): Promise<T> {
  const response = await fetch(buildUrl(baseUrl, options), {
    method: options.method || 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
        ? String((payload as Record<string, unknown>).error)
        : `HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export function publicAccountApiRequest<T>(baseUrl: string, options: AccountApiRequestOptions): Promise<T> {
  return send<T>(baseUrl, options);
}

export async function authenticatedAccountApiRequest<T>(
  baseUrl: string,
  options: AccountApiRequestOptions
): Promise<T> {
  const generation = getAccountAuthGeneration();
  const assertCurrent = () => {
    if (generation !== getAccountAuthGeneration() || options.signal?.aborted)
      throw new Error('Account request superseded');
  };
  let token = await getAccountAccessTokenForRequest(baseUrl);
  assertCurrent();
  if (!token) throw new ApiError('Not authenticated', 401, null);
  try {
    const result = await send<T>(baseUrl, options, token);
    assertCurrent();
    return result;
  } catch (error) {
    assertCurrent();
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    token = await getAccountAccessTokenForRequest(baseUrl, true);
    assertCurrent();
    if (!token) throw new ApiError('Not authenticated', 401, null);
    const result = await send<T>(baseUrl, options, token);
    assertCurrent();
    return result;
  }
}
