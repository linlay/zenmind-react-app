import { Platform } from 'react-native';
import { toBackendBaseUrl } from '../network/endpoint';
import { parseErrorMessage } from '../network/errorUtils';
import { patchSettings, loadSettings } from '../storage/settingsStorage';
import { StoredAccount } from '../types/common';
import {
  buildStoredAccountId,
  getStoredAccount,
  listStoredAccounts as listStoredAccountsFromStorage,
  removeStoredAccount as removeStoredAccountFromStorage,
  toStoredAccountSummary,
  upsertStoredAccount
} from './authAccountsStorage';

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

export interface RestoreSessionOptions {
  silentBaseReset?: boolean;
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

  const localMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
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
  const candidates = [payload.accessTokenExpireAtMs, payload.accessTokenExpireAt, payload.accessExpireAt];

  for (let i = 0; i < candidates.length; i += 1) {
    const ts = parseExpireAt(candidates[i]);
    if (ts) {
      return ts;
    }
  }

  console.warn('[auth] Access token expiry is missing or invalid; using fallback validity window');
  return Date.now() + FALLBACK_TOKEN_VALIDITY_MS;
}

async function requestJson<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;

  if (!response.ok) {
    throw new Error(parseErrorMessage(response.status, body));
  }

  return body as T;
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
}

function ensureBaseUrl(baseUrl: string, options: RestoreSessionOptions = {}) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized !== currentBaseUrl) {
    const hadSession = Boolean(currentSession);
    currentBaseUrl = normalized;
    currentSession = null;
    refreshingPromise = null;
    refreshingFailureMode = null;
    if (hadSession && !options.silentBaseReset) {
      emitSessionCleared();
    }
  }
  return normalized;
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

async function getStoredAccountsWithSettings() {
  const settings = await loadSettings();
  const accounts = await listStoredAccountsFromStorage({
    migrationSettings: {
      endpointInput: settings.endpointInput,
      ptyUrlInput: settings.ptyUrlInput
    }
  });

  return {
    settings,
    accounts
  };
}

async function getActiveAccountState(): Promise<{
  activeAccount: StoredAccount | null;
  accounts: StoredAccount[];
  settings: Awaited<ReturnType<typeof loadSettings>>;
}> {
  const { settings, accounts } = await getStoredAccountsWithSettings();
  const activeAccount =
    accounts.find((item) => item.accountId === String(settings.activeAccountId || '').trim()) || null;

  return {
    activeAccount,
    accounts,
    settings
  };
}

async function persistActiveAccountSession(
  baseUrl: string,
  session: SessionState,
  overrides?: Partial<StoredAccount>
): Promise<StoredAccount> {
  const settings = await loadSettings();
  const endpointInput = String(overrides?.endpointInput || settings.endpointInput || baseUrl).trim();
  const deviceId = String(overrides?.deviceId || session.deviceId || '').trim();
  const accountId = buildStoredAccountId(endpointInput, deviceId);
  const nextAccount: StoredAccount = {
    accountId,
    username: String(overrides?.username || session.username || '').trim(),
    deviceId,
    deviceName: String(overrides?.deviceName || session.deviceName || '').trim(),
    endpointInput,
    ptyUrlInput: String(overrides?.ptyUrlInput || settings.ptyUrlInput || '').trim(),
    deviceToken: String(overrides?.deviceToken || session.deviceToken || '').trim(),
    lastUsedAtMs: Date.now()
  };

  await upsertStoredAccount(nextAccount);
  await patchSettings({
    activeAccountId: accountId,
    endpointInput: nextAccount.endpointInput,
    ptyUrlInput: nextAccount.ptyUrlInput
  });

  return nextAccount;
}

async function clearSessionAndRemoveActiveAccount(options: {
  forceEmit?: boolean;
  preserveBaseUrl?: boolean;
} = {}): Promise<void> {
  const { activeAccount, settings } = await getActiveAccountState();
  const hadSession = Boolean(currentSession);
  currentSession = null;
  refreshingPromise = null;
  refreshingFailureMode = null;
  if (!options.preserveBaseUrl) {
    currentBaseUrl = '';
  }

  if (activeAccount) {
    await removeStoredAccountFromStorage(activeAccount.accountId);
  }

  if (String(settings.activeAccountId || '').trim()) {
    await patchSettings({ activeAccountId: '' });
  }

  if (hadSession || options.forceEmit) {
    emitSessionCleared();
  }
}

function updateSessionWithRefresh(refresh: RefreshResponse, account: StoredAccount | null) {
  const previous = currentSession;
  currentSession = {
    username: account?.username || previous?.username || 'app',
    deviceId: String(refresh.deviceId || account?.deviceId || previous?.deviceId || ''),
    deviceName: account?.deviceName || previous?.deviceName || 'Device',
    accessToken: String(refresh.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(refresh),
    deviceToken: String(refresh.deviceToken || account?.deviceToken || previous?.deviceToken || '')
  };
  emitSessionUpdated();
}

async function refreshAccessToken(
  baseUrl: string,
  forceRefresh: boolean,
  failureMode: RefreshFailureMode,
  options: RestoreSessionOptions = {}
): Promise<string | null> {
  const normalizedBase = ensureBaseUrl(baseUrl, options);

  if (
    !forceRefresh &&
    currentSession &&
    currentSession.accessToken &&
    currentSession.accessExpireAtMs - Date.now() > 30_000
  ) {
    return currentSession.accessToken;
  }

  if (refreshingPromise) {
    const inFlightPromise = refreshingPromise;
    const inFlightMode = refreshingFailureMode;
    const token = await inFlightPromise;
    if (token || failureMode !== 'hard' || inFlightMode === 'hard') {
      return token;
    }
    return refreshAccessToken(normalizedBase, true, 'hard', options);
  }

  const refreshTask = (async () => {
    const { activeAccount } = await getActiveAccountState();
    const deviceToken = activeAccount?.deviceToken || currentSession?.deviceToken || '';
    if (!deviceToken) {
      if (failureMode === 'hard') {
        await clearSessionAndRemoveActiveAccount({ forceEmit: true });
      }
      return null;
    }

    try {
      const refreshed = await requestJson<RefreshResponse>(normalizedBase, '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken })
      });

      updateSessionWithRefresh(refreshed, activeAccount);
      if (currentSession) {
        await persistActiveAccountSession(normalizedBase, currentSession, activeAccount || undefined);
      }
      return currentSession?.accessToken || null;
    } catch {
      if (failureMode === 'hard') {
        await clearSessionAndRemoveActiveAccount({ forceEmit: true });
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

export async function listStoredAccounts(): Promise<ReturnType<typeof toStoredAccountSummary>[]> {
  const { accounts } = await getStoredAccountsWithSettings();
  return accounts.map((item) => toStoredAccountSummary(item));
}

export async function getActiveStoredAccount(): Promise<ReturnType<typeof toStoredAccountSummary> | null> {
  const { activeAccount } = await getActiveAccountState();
  return activeAccount ? toStoredAccountSummary(activeAccount) : null;
}

export async function restoreSession(
  baseUrl: string,
  options: RestoreSessionOptions = {}
): Promise<SessionState | null> {
  const token = await refreshAccessToken(baseUrl, true, 'hard', options);
  if (!token || !currentSession) {
    return null;
  }
  return currentSession;
}

export async function switchActiveAccount(accountId: string): Promise<SessionState | null> {
  const account = await getStoredAccount(accountId);
  if (!account) {
    await patchSettings({ activeAccountId: '' });
    await clearSessionAndRemoveActiveAccount({ forceEmit: true });
    return null;
  }

  await patchSettings({
    activeAccountId: account.accountId,
    endpointInput: account.endpointInput,
    ptyUrlInput: account.ptyUrlInput
  });

  const backendUrl = toBackendBaseUrl(account.endpointInput);
  if (!backendUrl) {
    await clearSessionAndRemoveActiveAccount({ forceEmit: true });
    return null;
  }

  return restoreSession(backendUrl, { silentBaseReset: true });
}

export async function removeStoredAccount(accountId: string): Promise<ReturnType<typeof toStoredAccountSummary>[]> {
  const normalizedId = String(accountId || '').trim();
  const settings = await loadSettings();
  const next = await removeStoredAccountFromStorage(normalizedId);

  if (normalizedId && normalizedId === String(settings.activeAccountId || '').trim()) {
    await patchSettings({ activeAccountId: '' });
  }

  return next.map((item) => toStoredAccountSummary(item));
}

export async function syncActiveAccountConnection(config: {
  endpointInput: string;
  ptyUrlInput: string;
}): Promise<ReturnType<typeof toStoredAccountSummary> | null> {
  const { activeAccount } = await getActiveAccountState();
  if (!activeAccount) {
    return null;
  }

  const nextAccount = {
    ...activeAccount,
    endpointInput: String(config.endpointInput || '').trim(),
    ptyUrlInput: String(config.ptyUrlInput || '').trim(),
    lastUsedAtMs: Date.now()
  };

  await removeStoredAccountFromStorage(activeAccount.accountId);
  const saved = await upsertStoredAccount({
    ...nextAccount,
    accountId: buildStoredAccountId(nextAccount.endpointInput, nextAccount.deviceId)
  });
  const resolved =
    saved.find((item) => item.deviceId === activeAccount.deviceId && item.endpointInput === nextAccount.endpointInput) ||
    null;

  if (resolved) {
    await patchSettings({
      activeAccountId: resolved.accountId,
      endpointInput: resolved.endpointInput,
      ptyUrlInput: resolved.ptyUrlInput
    });
    return toStoredAccountSummary(resolved);
  }

  return null;
}

export async function loginWithMasterPassword(
  baseUrl: string,
  masterPassword: string,
  deviceName: string
): Promise<SessionState> {
  const normalizedBase = ensureBaseUrl(baseUrl, { silentBaseReset: true });
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

  await persistActiveAccountSession(normalizedBase, currentSession);
  emitSessionUpdated();
  return currentSession;
}

export async function logoutCurrentDevice(baseUrl: string): Promise<void> {
  const normalizedBase = ensureBaseUrl(baseUrl, { silentBaseReset: true });
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

  await clearSessionAndRemoveActiveAccount({ forceEmit: true });
}

export async function getAccessToken(baseUrl: string, forceRefresh = false): Promise<string | null> {
  return refreshAccessToken(baseUrl, forceRefresh, 'hard');
}

export async function ensureFreshAccessToken(
  baseUrl: string,
  options: EnsureFreshAccessTokenOptions = {}
): Promise<string | null> {
  const normalizedBase = ensureBaseUrl(baseUrl, { silentBaseReset: false });
  const minValidityMs = Math.max(0, Number(options.minValidityMs ?? DEFAULT_TOKEN_MIN_VALIDITY_MS));
  const maxJitterMs = Math.max(0, Number(options.jitterMs ?? DEFAULT_TOKEN_JITTER_MS));
  const forceRefresh = Boolean(options.forceRefresh);
  const failureMode = options.failureMode || 'soft';

  if (!forceRefresh && currentSession && currentSession.accessToken) {
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

export async function authorizedFetch(baseUrl: string, path: string, options: RequestInit = {}): Promise<Response> {
  const normalizedBase = ensureBaseUrl(baseUrl, { silentBaseReset: false });
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
