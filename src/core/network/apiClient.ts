import { ApiEnvelope } from '../types/common';
import { authorizedFetch } from '../auth/appAuth';
export { parseErrorMessage } from './errorUtils';

export function formatError(error: unknown): string {
  const message = String((error as { message?: string })?.message || 'unknown error');
  if (message.toLowerCase().includes('network request failed')) {
    return `${message}（请确认域名/IP 可访问，并且手机可连接后端）`;
  }
  return message;
}

function parseApiEnvelope<T>(response: Response, bodyText: string): T {
  let json: ApiEnvelope<T> | null = null;
  try {
    json = bodyText ? (JSON.parse(bodyText) as ApiEnvelope<T>) : null;
  } catch {
    throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
  }

  if (!response.ok) {
    const errorPayload = json as unknown as { msg?: string; error?: string } | null;
    throw new Error(errorPayload?.msg || errorPayload?.error || `HTTP ${response.status}`);
  }

  if (!json || typeof json !== 'object' || json.code !== 0) {
    throw new Error(json?.msg || 'API returned non-zero code');
  }

  return json.data;
}

export async function fetchApiJson<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const response = await authorizedFetch(baseUrl, path, options);
  const bodyText = await response.text();
  return parseApiEnvelope<T>(response, bodyText);
}

export async function fetchAuthedJson<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const response = await authorizedFetch(baseUrl, path, options);
  const bodyText = await response.text();

  let payload: unknown = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
    }
  }

  if (!response.ok) {
    if (payload && typeof payload === 'object') {
      const data = payload as Record<string, unknown>;
      throw new Error(String(data.error || data.msg || `HTTP ${response.status}`));
    }
    throw new Error(`HTTP ${response.status}`);
  }

  return payload as T;
}

export async function fetchViewportHtml(baseUrl: string, viewportKey: string): Promise<string> {
  const response = await authorizedFetch(baseUrl, `/api/ap/viewport?viewportKey=${encodeURIComponent(viewportKey)}`);
  const bodyText = await response.text();
  let payload: unknown = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (payload && typeof payload === 'object') {
      const data = payload as Record<string, unknown>;
      throw new Error(String(data.msg || data.error || `HTTP ${response.status}`));
    }
    throw new Error(`HTTP ${response.status}`);
  }

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    if (Number(data.code) === 0 && data.data && typeof data.data === 'object') {
      const htmlFromEnvelope = (data.data as Record<string, unknown>).html;
      if (typeof htmlFromEnvelope === 'string' && htmlFromEnvelope.trim()) {
        return htmlFromEnvelope;
      }
    }
    if (typeof data.html === 'string' && data.html.trim()) {
      return data.html;
    }
  }

  if (bodyText && /<(?:!doctype|html|body|div|main|section|script)\b/i.test(bodyText)) {
    return bodyText;
  }

  throw new Error('Viewport response does not contain html');
}

export async function submitFrontendToolApi(
  baseUrl: string,
  payload: { runId?: string; toolId?: string; params?: Record<string, unknown> }
): Promise<{ accepted?: boolean; detail?: string; status?: string }> {
  return fetchApiJson(baseUrl, '/api/ap/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
