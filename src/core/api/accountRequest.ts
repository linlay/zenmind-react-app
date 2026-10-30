import { fetch } from 'expo/fetch';
import { ApiError } from './apiError.ts';

export type AccountApiRequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit';
  onResponse?: (response: { status: number; headers: Headers }) => void;
};

export async function sendAccountApiRequest<T>(
  baseUrl: string,
  options: AccountApiRequestOptions,
  accessToken?: string
): Promise<T> {
  const url = new URL(options.path, `${baseUrl.replace(/\/+$/u, '')}/`);
  // Account credentials must never follow an absolute path to another origin.
  if (url.origin !== new URL(baseUrl).origin) throw new Error('Invalid account API origin');
  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 15_000);
  try {
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: options.credentials ?? 'omit',
      redirect: 'error'
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
      const officialError = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).error : null;
      const message =
        officialError &&
        typeof officialError === 'object' &&
        typeof (officialError as Record<string, unknown>).code === 'string'
          ? String((officialError as Record<string, unknown>).code)
          : payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
            ? String((payload as Record<string, unknown>).error)
            : `HTTP ${response.status}`;
      throw new ApiError(message, response.status, payload);
    }
    options.onResponse?.({ status: response.status, headers: response.headers });
    return payload as T;
  } catch (error) {
    if (timedOut && !options.signal?.aborted) throw new ApiError('account_request_timeout', 0, null);
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
