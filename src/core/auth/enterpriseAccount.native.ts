import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { sendAccountApiRequest } from '../api/accountRequest.ts';
import { ApiError } from '../api/apiError.ts';
import { BRAND_ID } from '../../shared/generated/brand';
import { readEnterpriseApiBaseUrl } from './authConfig.ts';
import type { AccountSession } from './accountAuthModel.ts';

const SESSION_PATH = '/oauth2/auth';
const TOKEN_PATH = '/authorization';
const USER_PATH = '/api/oauth2/userinfo';
const COOKIE_PATHS = ['/', SESSION_PATH, TOKEN_PATH, USER_PATH, '/api/login/oidc/start'];
const STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

function credentialKey() {
  const origin = new URL(readEnterpriseApiBaseUrl()).origin;
  const originKey = Array.from(origin, (char) => char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  return `enterprise.${BRAND_ID}.${originKey}`;
}

function parseToken(value: unknown) {
  const raw = typeof value === 'string' ? value : (value as { access_token?: unknown } | null)?.access_token;
  if (typeof raw !== 'string') throw new Error('Invalid enterprise token response');
  const token = raw.replace(/^Bearer\s+/iu, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 16_384) throw new Error('Invalid enterprise token response');
  try {
    const encoded = parts[1].replace(/-/gu, '+').replace(/_/gu, '/');
    const claims: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    const exp = (claims as { exp?: unknown } | null)?.exp;
    if (typeof exp === 'number' && Number.isSafeInteger(exp) && exp * 1000 > Date.now())
      return { token, expiresAt: exp * 1000 };
  } catch {
    // Claims supply expiry only. Identity is confirmed by the authenticated user endpoint below.
  }
  throw new Error('Invalid enterprise token expiry');
}

function parseUser(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid enterprise user');
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid enterprise user');
  const user = data as Record<string, unknown>;
  const id = typeof user.staffno === 'string' ? user.staffno.trim() : '';
  if (!id || typeof user.name !== 'string' || !user.name.trim()) throw new Error('Invalid enterprise user');
  for (const key of ['staffemail', 'avatarUrl']) {
    if (user[key] !== undefined && typeof user[key] !== 'string') throw new Error('Invalid enterprise user');
  }
  return {
    id,
    displayName: user.name.trim(),
    email: typeof user.staffemail === 'string' ? user.staffemail : '',
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : ''
  };
}

async function exchangeSession(candidate: string | null, signal?: AbortSignal): Promise<AccountSession> {
  const base = readEnterpriseApiBaseUrl();
  let expectedUser = '';
  const cookieHeaders = async (path: string) => ({
    Cookie: await CookieManager.getCookieHeader(new URL(path, base).toString(), { iosCookieStore: 'webKit' })
  });
  if (candidate === null) {
    await sendAccountApiRequest(base, {
      path: SESSION_PATH,
      credentials: 'omit',
      headers: await cookieHeaders(SESSION_PATH),
      signal,
      onResponse: ({ status, headers }) => {
        if (status !== 200 && status !== 202) throw new ApiError('enterprise_session_rejected', 401, null);
        expectedUser = headers.get('x-auth-request-user')?.trim() || '';
      }
    });
  }
  const value = await sendAccountApiRequest(
    base,
    {
      path: TOKEN_PATH,
      credentials: 'omit',
      ...(candidate === null ? { headers: await cookieHeaders(TOKEN_PATH) } : {}),
      signal,
      onResponse: ({ status }) => {
        if (status === 204) throw new ApiError('enterprise_session_rejected', 401, null);
      }
    },
    candidate ?? undefined
  );
  const { token, expiresAt } = parseToken(value);
  const user = parseUser(await sendAccountApiRequest(base, { path: USER_PATH, credentials: 'omit', signal }, token));
  if (expectedUser && expectedUser !== user.id) throw new Error('Enterprise identity mismatch');
  return {
    accountId: `enterprise:${new URL(base).origin}:${encodeURIComponent(user.id)}`,
    user: { displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl },
    accessToken: token,
    accessExpireAtMs: expiresAt
  };
}

export function verifyEnterpriseLogin(signal?: AbortSignal) {
  return exchangeSession(null, signal);
}

export async function restoreEnterpriseSession(currentToken?: string) {
  const candidate = currentToken || (await SecureStore.getItemAsync(credentialKey(), STORE_OPTIONS));
  return candidate ? exchangeSession(candidate) : null;
}

export function saveEnterpriseSession(session: AccountSession) {
  return SecureStore.setItemAsync(credentialKey(), session.accessToken, STORE_OPTIONS);
}

export async function clearEnterpriseSession() {
  await SecureStore.deleteItemAsync(credentialKey(), STORE_OPTIONS);
  const stores = Platform.OS === 'ios' ? (['webKit', 'foundation'] as const) : (['webKit'] as const);
  for (const iosCookieStore of stores) {
    for (const path of COOKIE_PATHS) {
      const url = new URL(path, readEnterpriseApiBaseUrl()).toString();
      const cookies = await CookieManager.getAsArray(url, { iosCookieStore });
      for (const name of new Set(cookies.map((cookie: { name: string }) => cookie.name)))
        await CookieManager.clearByName(url, name, { iosCookieStore });
    }
  }
}
