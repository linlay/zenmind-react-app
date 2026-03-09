import { BaseQueryFn } from '@reduxjs/toolkit/query';
import { getAccessToken } from '../auth/appAuth';
import { normalizePtyUrlInput, toBackendBaseUrl } from './endpoint';
import { parseErrorMessage } from './errorUtils';
import { RootState } from '../../app/store/store';

type QueryParamValue = string | number | boolean | null | undefined;

export interface AuthBaseQueryArgs {
  url: string;
  method?: string;
  body?: unknown;
  params?: Record<string, QueryParamValue>;
  headers?: Record<string, string>;
  base?: 'backend' | 'pty';
  absoluteUrl?: string;
  responseType?: 'json' | 'viewportHtml';
}

function buildUrl(args: AuthBaseQueryArgs, state: RootState): { absoluteUrl: string; backendUrl: string } {
  const backendUrl = toBackendBaseUrl(state.user.endpointInput);
  const ptyUrl = normalizePtyUrlInput(state.user.ptyUrlInput, state.user.endpointInput);
  const resolvedBase =
    typeof args.absoluteUrl === 'string' && args.absoluteUrl.trim()
      ? ''
      : args.base === 'pty'
        ? ptyUrl.replace(/\/+$/, '')
        : backendUrl.replace(/\/+$/, '');
  const rawUrl = String(args.absoluteUrl || `${resolvedBase}${args.url}` || '').trim();
  const absoluteUrl = args.params ? appendSearchParams(rawUrl, args.params) : rawUrl;
  return { absoluteUrl, backendUrl };
}

function appendSearchParams(url: string, params: Record<string, QueryParamValue>): string {
  const parsed = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    parsed.searchParams.set(key, String(value));
  });
  return parsed.toString();
}

function parseJsonText(bodyText: string): unknown {
  if (!bodyText) {
    return null;
  }
  return JSON.parse(bodyText);
}

function unwrapPayload(response: Response, payload: unknown): unknown {
  if (!response.ok) {
    throw new Error(parseErrorMessage(response.status, payload));
  }

  if (
    payload &&
    typeof payload === 'object' &&
    Object.prototype.hasOwnProperty.call(payload, 'code') &&
    Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    const envelope = payload as { code?: number; msg?: string; data?: unknown };
    if (Number(envelope.code) !== 0) {
      throw new Error(String(envelope.msg || 'API returned non-zero code'));
    }
    return envelope.data;
  }

  return payload;
}

function resolveViewportHtml(response: Response, bodyText: string): string {
  let payload: unknown = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(response.status, payload));
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

async function executeRequest(
  absoluteUrl: string,
  backendUrl: string,
  args: AuthBaseQueryArgs,
  forceRefresh = false
): Promise<Response> {
  const accessToken = await getAccessToken(backendUrl, forceRefresh);
  if (!accessToken) {
    throw new Error('未登录或设备令牌已失效，请重新登录');
  }

  const headers = new Headers(args.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (args.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(absoluteUrl, {
    method: args.method || 'GET',
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body)
  });
}

export const authBaseQuery: BaseQueryFn<AuthBaseQueryArgs, unknown, Error> = async (args, api) => {
  try {
    const state = api.getState() as RootState;
    const { absoluteUrl, backendUrl } = buildUrl(args, state);
    if (!absoluteUrl || !backendUrl) {
      throw new Error('后端地址未配置');
    }

    let response = await executeRequest(absoluteUrl, backendUrl, args, false);
    if (response.status === 401) {
      response = await executeRequest(absoluteUrl, backendUrl, args, true);
    }

    const bodyText = await response.text();
    if (args.responseType === 'viewportHtml') {
      return { data: resolveViewportHtml(response, bodyText) };
    }

    let payload: unknown = null;
    try {
      payload = parseJsonText(bodyText);
    } catch {
      throw new Error(`Invalid JSON response: ${bodyText.slice(0, 180)}`);
    }

    return { data: unwrapPayload(response, payload) };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error || 'unknown error'))
    };
  }
};
