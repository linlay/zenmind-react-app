import { MMKV } from 'react-native-mmkv';

import { readIdentityApiBaseUrl, readTunnelHubApiBaseUrl } from './authConfig.ts';
import { canPersistAccountSession, parseAccountSession, type AccountSession } from './accountAuthModel.ts';
import type { DeviceKind, TrustLevel } from '../api/contracts/deviceLink.ts';
import { ApiError } from '../api/apiError.ts';

const storage = new MMKV({ id: 'zenmind-account-session' });
const PERSISTED_CREDENTIAL_KEY = 'account_device_credential_v1';
const MIN_ACCESS_VALIDITY_MS = 90_000;

type PersistedCredential = {
  identityBaseUrl: string;
  deviceToken: string;
};

export type AccountAuthSnapshot = {
  isBootstrapping: boolean;
  session: AccountSession | null;
};

type Listener = () => void;

let snapshot: AccountAuthSnapshot = { isBootstrapping: true, session: null };
let refreshPromise: Promise<AccountSession | null> | null = null;
const listeners = new Set<Listener>();

function normalizeBaseUrl(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\/+$/u, '');
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: AccountAuthSnapshot) {
  snapshot = next;
  emit();
}

function readPersistedCredential(): PersistedCredential | null {
  const raw = storage.getString(PERSISTED_CREDENTIAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCredential>;
    const identityBaseUrl = normalizeBaseUrl(parsed.identityBaseUrl || '');
    const deviceToken = String(parsed.deviceToken || '').trim();
    return identityBaseUrl && deviceToken ? { identityBaseUrl, deviceToken } : null;
  } catch {
    return null;
  }
}

function persistSession(identityBaseUrl: string, session: AccountSession) {
  if (canPersistAccountSession(session)) {
    storage.set(
      PERSISTED_CREDENTIAL_KEY,
      JSON.stringify({ identityBaseUrl: normalizeBaseUrl(identityBaseUrl), deviceToken: session.deviceToken })
    );
  } else {
    storage.delete(PERSISTED_CREDENTIAL_KEY);
  }
  setSnapshot({ isBootstrapping: false, session });
}

async function requestAccountSession(
  identityBaseUrl: string,
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<AccountSession> {
  const response = await fetch(`${normalizeBaseUrl(identityBaseUrl)}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
        ? String((payload as Record<string, unknown>).error)
        : `HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload);
  }
  return parseAccountSession(payload);
}

export function getAccountAuthSnapshot(): AccountAuthSnapshot {
  return snapshot;
}

export function subscribeAccountAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loginWithAccountCredentials(input: {
  username: string;
  password: string;
  deviceName: string;
  deviceKind?: DeviceKind;
  trustLevel?: TrustLevel;
  signal?: AbortSignal;
}): Promise<AccountSession> {
  const identityBaseUrl = readIdentityApiBaseUrl();
  if (!identityBaseUrl) throw new Error('Identity API is not configured');
  const session = await requestAccountSession(
    identityBaseUrl,
    '/api/auth/account/login',
    {
      username: input.username.trim(),
      password: input.password,
      deviceName: input.deviceName.trim(),
      deviceKind: input.deviceKind || 'mobile',
      trustLevel: input.trustLevel || 'trusted'
    },
    input.signal
  );
  persistSession(identityBaseUrl, session);
  return session;
}

export async function claimAccountLoginChallenge(
  challengeId: string,
  claimToken: string,
  signal?: AbortSignal
): Promise<AccountSession> {
  const identityBaseUrl = readIdentityApiBaseUrl();
  if (!identityBaseUrl) throw new Error('Identity API is not configured');
  const session = await requestAccountSession(
    identityBaseUrl,
    `/api/auth/account/login-challenges/${encodeURIComponent(challengeId.trim())}/claim`,
    { claimToken: claimToken.trim() },
    signal
  );
  persistSession(identityBaseUrl, session);
  return session;
}

async function refreshAccountSession(force = false): Promise<AccountSession | null> {
  const current = snapshot.session;
  if (!force && current && current.accessExpireAtMs - Date.now() > MIN_ACCESS_VALIDITY_MS) return current;
  if (refreshPromise) return refreshPromise;
  const credential = readPersistedCredential();
  if (!credential) {
    setSnapshot({ isBootstrapping: false, session: null });
    return null;
  }
  const task = requestAccountSession(credential.identityBaseUrl, '/api/auth/refresh', {
    deviceToken: credential.deviceToken
  })
    .then((session) => {
      persistSession(credential.identityBaseUrl, session);
      return session;
    })
    .catch(() => {
      storage.delete(PERSISTED_CREDENTIAL_KEY);
      setSnapshot({ isBootstrapping: false, session: null });
      return null;
    });
  refreshPromise = task;
  try {
    return await task;
  } finally {
    if (refreshPromise === task) refreshPromise = null;
  }
}

export async function bootstrapAccountAuth(): Promise<AccountSession | null> {
  setSnapshot({ isBootstrapping: true, session: snapshot.session });
  return refreshAccountSession(true);
}

function isAllowedAccountOrigin(baseUrl: string): boolean {
  const requested = normalizeBaseUrl(baseUrl);
  return [readIdentityApiBaseUrl(), readTunnelHubApiBaseUrl()].some((allowed) => {
    try {
      return Boolean(allowed && new URL(requested).origin === new URL(allowed).origin);
    } catch {
      return false;
    }
  });
}

export async function getAccountAccessTokenForRequest(baseUrl: string, forceRefresh = false): Promise<string | null> {
  if (!isAllowedAccountOrigin(baseUrl)) return null;
  return (await refreshAccountSession(forceRefresh))?.accessToken || null;
}

export async function logoutAccount(): Promise<void> {
  const current = snapshot.session;
  storage.delete(PERSISTED_CREDENTIAL_KEY);
  refreshPromise = null;
  setSnapshot({ isBootstrapping: false, session: null });
  if (!current) return;
  const identityBaseUrl = readIdentityApiBaseUrl();
  if (!identityBaseUrl) return;
  await fetch(`${identityBaseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${current.accessToken}` }
  }).catch(() => undefined);
}
