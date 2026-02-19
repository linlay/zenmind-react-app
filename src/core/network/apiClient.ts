import { ApiEnvelope } from '../types/common';

export function formatError(error: unknown): string {
  const message = String((error as { message?: string })?.message || 'unknown error');
  if (message.toLowerCase().includes('network request failed')) {
    return `${message}（请确认域名/IP 可访问，并且手机可连接后端）`;
  }
  return message;
}

export function parseApiEnvelope<T>(response: Response, bodyText: string): T {
  let json: ApiEnvelope<T> | null = null;
  try {
    json = bodyText ? (JSON.parse(bodyText) as ApiEnvelope<T>) : null;
  } catch {
    throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(json?.msg || `HTTP ${response.status}`);
  }

  if (!json || typeof json !== 'object' || json.code !== 0) {
    throw new Error(json?.msg || 'API returned non-zero code');
  }

  return json.data;
}

export async function fetchApiJson<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  return parseApiEnvelope<T>(response, bodyText);
}

export async function fetchViewportHtml(baseUrl: string, viewportKey: string): Promise<string> {
  const data = await fetchApiJson<{ html?: string }>(
    baseUrl,
    `/api/viewport?viewportKey=${encodeURIComponent(viewportKey)}`
  );
  const html = data?.html;
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Viewport response does not contain html');
  }
  return html;
}

export async function submitFrontendToolApi(
  baseUrl: string,
  payload: { runId?: string; toolId?: string; params?: Record<string, unknown> }
): Promise<{ accepted?: boolean; detail?: string; status?: string }> {
  return fetchApiJson(baseUrl, '/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
