import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { parseErrorMessage } from '../network/errorUtils';

const DEVICE_TOKEN_KEY = 'app_device_token_v2';
const LEGACY_DEVICE_TOKEN_KEY = 'app_device_token_v1';
const DEFAULT_TOKEN_MIN_VALIDITY_MS = 90_000;
const DEFAULT_TOKEN_JITTER_MS = 8_000;
const FALLBACK_TOKEN_VALIDITY_MS = 5 * 60_000;

export type RefreshFailureMode = 'soft' | 'hard';

export interface EnsureFreshAccessTokenOptions {
  minValidityMs?: number;
  jitterMs?: number;
  forceRefresh?: boolean;
  failureMode?: RefreshFailureMode;
}

export type AuthSessionEvent =
  | {
      type: 'session_updated';
      session: SessionState;
    }
  | {
      type: 'session_cleared';
    };

type AuthSessionListener = (event: AuthSessionEvent) => void;

export interface SessionState {
  username: string;
  deviceId: string;
  deviceName: string;
  accessToken: string;
  accessExpireAtMs: number;
  deviceToken: string;
}

interface LoginResponse {
  username: string;
  deviceId: string;
  deviceName: string;
  accessToken: string;
  accessTokenExpireAtMs?: number | string;
  accessTokenExpireAt?: number | string;
  accessExpireAt?: number | string;
  deviceToken: string;
}

interface RefreshResponse {
  deviceId: string;
  accessToken: string;
  accessTokenExpireAtMs?: number | string;
  accessTokenExpireAt?: number | string;
  accessExpireAt?: number | string;
  deviceToken: string;
}

let currentSession: SessionState | null = null;
let refreshingPromise: Promise<string | null> | null = null;
let refreshingFailureMode: RefreshFailureMode | null = null;
let currentBaseUrl = '';
const authListeners = new Set<AuthSessionListener>();
let legacyDeviceTokenPurged = false;

function parseNumericEpochMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw >= 1_000_000_000_000 ? raw : raw * 1000;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num > 0) {
        return num >= 1_000_000_000_000 ? num : num * 1000;
      }
    }
  }
  return null;
}

function parseExpireAt(raw: unknown): number | null {
  const numericTs = parseNumericEpochMs(raw);
  if (numericTs) {
    return numericTs;
  }

  const text = String(raw || '').trim();
  if (!text) {
    return null;
  }

  const localMatch = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/
  );
  if (localMatch) {
    const [, year, month, day, hour, minute, second = '0'] = localMatch;
    const localTs = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      0
    ).getTime();
    if (Number.isFinite(localTs) && localTs > 0) {
      return localTs;
    }
  }

  const normalizedIsoText = text.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:\d{2})$)/, '$1');
  const ts = new Date(normalizedIsoText).getTime();
  if (Number.isFinite(ts) && ts > 0) {
    return ts;
  }
  return null;
}

function resolveAccessExpireAtMs(payload: LoginResponse | RefreshResponse): number {
  const candidates = [
    payload.accessTokenExpireAtMs,
    payload.accessTokenExpireAt,
    payload.accessExpireAt
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const ts = parseExpireAt(candidates[i]);
    if (ts) {
      return ts;
    }
  }

  console.warn('[auth] Access token expiry is missing or invalid; using fallback validity window');
  return Date.now() + FALLBACK_TOKEN_VALIDITY_MS;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;

  if (!response.ok) {
    throw new Error(parseErrorMessage(response.status, body));
  }

  return body as T;
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function ensureBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized !== currentBaseUrl) {
    const hadSession = Boolean(currentSession);
    currentBaseUrl = normalized;
    currentSession = null;
    refreshingPromise = null;
    refreshingFailureMode = null;
    if (hadSession) {
      emitSessionCleared();
    }
  }
  return normalized;
}

async function loadDeviceTokenFromStorage(): Promise<string> {
  if (!legacyDeviceTokenPurged) {
    legacyDeviceTokenPurged = true;
    try {
      await AsyncStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY);
    } catch {
      // ignore storage cleanup failures
    }
  }
  return String((await AsyncStorage.getItem(DEVICE_TOKEN_KEY)) || '').trim();
}

async function saveDeviceToken(deviceToken: string): Promise<void> {
  const normalized = String(deviceToken || '').trim();
  if (!normalized) {
    await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, normalized);
}

function updateSessionWithRefresh(refresh: RefreshResponse, fallbackUsername = 'app', fallbackDeviceName = '') {
  const previous = currentSession;
  currentSession = {
    username: previous?.username || fallbackUsername,
    deviceId: String(refresh.deviceId || previous?.deviceId || ''),
    deviceName: previous?.deviceName || fallbackDeviceName || 'Device',
    accessToken: String(refresh.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(refresh),
    deviceToken: String(refresh.deviceToken || previous?.deviceToken || '')
  };
  emitSessionUpdated();
}

function emitSessionUpdated() {
  if (!currentSession) {
    return;
  }
  const snapshot = { ...currentSession };
  authListeners.forEach((listener) => {
    try {
      listener({ type: 'session_updated', session: snapshot });
    } catch {
      // ignore listener failures
    }
  });
}

function emitSessionCleared() {
  authListeners.forEach((listener) => {
    try {
      listener({ type: 'session_cleared' });
    } catch {
      // ignore listener failures
    }
  });
}

function getRandomJitterMs(maxJitterMs: number): number {
  if (!Number.isFinite(maxJitterMs) || maxJitterMs <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * maxJitterMs);
}

async function clearSessionAndDeviceToken(): Promise<void> {
  const hadSession = Boolean(currentSession);
  currentSession = null;
  await saveDeviceToken('');
  if (hadSession) {
    emitSessionCleared();
  }
}

async function refreshAccessToken(
  baseUrl: string,
  forceRefresh: boolean,
  failureMode: RefreshFailureMode
): Promise<string | null> {
  const normalizedBase = ensureBaseUrl(baseUrl);

  if (!forceRefresh && currentSession && currentSession.accessToken && currentSession.accessExpireAtMs - Date.now() > 30_000) {
    return currentSession.accessToken;
  }

  if (refreshingPromise) {
    const inFlightPromise = refreshingPromise;
    const inFlightMode = refreshingFailureMode;
    const token = await inFlightPromise;
    if (token || failureMode !== 'hard' || inFlightMode === 'hard') {
      return token;
    }
    // A soft refresh failed while a hard refresh caller was waiting.
    // Re-run once in hard mode to guarantee session invalidation semantics.
    return refreshAccessToken(normalizedBase, true, 'hard');
  }

  const refreshTask = (async () => {
    const storedDeviceToken = await loadDeviceTokenFromStorage();
    const deviceToken = storedDeviceToken || currentSession?.deviceToken || '';
    if (!deviceToken) {
      if (failureMode === 'hard') {
        await clearSessionAndDeviceToken();
      }
      return null;
    }

    try {
      const refreshed = await requestJson<RefreshResponse>(normalizedBase, '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken })
      });

      updateSessionWithRefresh(refreshed);
      await saveDeviceToken(currentSession?.deviceToken || '');
      return currentSession?.accessToken || null;
    } catch {
      if (failureMode === 'hard') {
        await clearSessionAndDeviceToken();
      }
      return null;
    }
  })();

  refreshingPromise = refreshTask;
  refreshingFailureMode = failureMode;
  try {
    return await refreshTask;
  } finally {
    if (refreshingPromise === refreshTask) {
      refreshingPromise = null;
      refreshingFailureMode = null;
    }
  }
}

export function getCurrentSession(): SessionState | null {
  return currentSession;
}

export async function restoreSession(baseUrl: string): Promise<SessionState | null> {
  const token = await refreshAccessToken(baseUrl, true, 'hard');
  if (!token || !currentSession) {
    return null;
  }
  return currentSession;
}

export async function loginWithMasterPassword(
  baseUrl: string,
  masterPassword: string,
  deviceName: string
): Promise<SessionState> {
  const normalizedBase = ensureBaseUrl(baseUrl);
  const normalizedDeviceName = String(deviceName || '').trim() || getDefaultDeviceName();
  const payload = await requestJson<LoginResponse>(normalizedBase, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      masterPassword,
      deviceName: normalizedDeviceName
    })
  });

  currentSession = {
    username: String(payload.username || 'app'),
    deviceId: String(payload.deviceId || ''),
    deviceName: String(payload.deviceName || normalizedDeviceName),
    accessToken: String(payload.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(payload),
    deviceToken: String(payload.deviceToken || '')
  };

  await saveDeviceToken(currentSession.deviceToken);
  emitSessionUpdated();
  return currentSession;
}

export async function logoutCurrentDevice(baseUrl: string): Promise<void> {
  const normalizedBase = ensureBaseUrl(baseUrl);
  const token = await getAccessToken(normalizedBase);

  try {
    if (token) {
      await fetch(`${normalizedBase}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  } catch {
    // ignore network errors when logging out
  }

  const hadSession = Boolean(currentSession);
  currentSession = null;
  refreshingPromise = null;
  refreshingFailureMode = null;
  await saveDeviceToken('');
  if (hadSession) {
    emitSessionCleared();
  }
}

export async function getAccessToken(baseUrl: string, forceRefresh = false): Promise<string | null> {
  return refreshAccessToken(baseUrl, forceRefresh, 'hard');
}

export async function ensureFreshAccessToken(
  baseUrl: string,
  options: EnsureFreshAccessTokenOptions = {}
): Promise<string | null> {
  const normalizedBase = ensureBaseUrl(baseUrl);
  const minValidityMs = Math.max(0, Number(options.minValidityMs ?? DEFAULT_TOKEN_MIN_VALIDITY_MS));
  const maxJitterMs = Math.max(0, Number(options.jitterMs ?? DEFAULT_TOKEN_JITTER_MS));
  const forceRefresh = Boolean(options.forceRefresh);
  const failureMode = options.failureMode || 'soft';

  if (
    !forceRefresh &&
    currentSession &&
    currentSession.accessToken
  ) {
    const jitterMs = getRandomJitterMs(maxJitterMs);
    const remainingMs = currentSession.accessExpireAtMs - Date.now();
    if (remainingMs > minValidityMs + jitterMs) {
      return currentSession.accessToken;
    }
  }

  return refreshAccessToken(normalizedBase, true, failureMode);
}

export function subscribeAuthSession(listener: AuthSessionListener): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export async function authorizedFetch(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const normalizedBase = ensureBaseUrl(baseUrl);
  const token = await getAccessToken(normalizedBase);

  if (!token) {
    throw new Error('未登录或设备令牌已失效，请重新登录');
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  } as Record<string, string>;

  const response = await fetch(`${normalizedBase}${path}`, {
    ...options,
    headers
  });

  if (response.status !== 401) {
    return response;
  }

  const nextToken = await refreshAccessToken(normalizedBase, true, 'hard');
  if (!nextToken) {
    return response;
  }

  const retryHeaders = {
    ...(options.headers || {}),
    Authorization: `Bearer ${nextToken}`
  } as Record<string, string>;

  return fetch(`${normalizedBase}${path}`, {
    ...options,
    headers: retryHeaders
  });
}

export function getDefaultDeviceName(): string {
  if (Platform.OS === 'ios') {
    return 'iPhone';
  }
  if (Platform.OS === 'android') {
    return 'Android';
  }
  return 'RN Device';
}
