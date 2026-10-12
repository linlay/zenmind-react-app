import { MMKV } from 'react-native-mmkv';

import { readIdentityApiBaseUrl, readTunnelHubApiBaseUrl } from './authConfig.ts';
import { parseAccountSession, type AccountSession } from './accountAuthModel.ts';
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
  error?: string;
};

type Listener = () => void;

let snapshot: AccountAuthSnapshot = { isBootstrapping: true, session: null };
let refreshPromise: Promise<AccountSession | null> | null = null;
let authGeneration = 0;
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
  storage.set(
    PERSISTED_CREDENTIAL_KEY,
    JSON.stringify({ identityBaseUrl: normalizeBaseUrl(identityBaseUrl), deviceToken: session.deviceToken })
  );
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

export function getAccountAuthGeneration(): number {
  return authGeneration;
}

export function subscribeAccountAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loginWithAccountCredentials(input: {
  username: string;
  password: string;
  deviceName: string;
  signal?: AbortSignal;
}): Promise<AccountSession> {
  if (
    !input.username.trim() ||
    !input.password ||
    !input.deviceName.trim() ||
    [...input.deviceName.trim()].length > 64
  ) {
    throw new Error('Account, password and a device name of 1–64 characters are required');
  }
  const identityBaseUrl = readIdentityApiBaseUrl();
  if (!identityBaseUrl) throw new Error('Identity API is not configured');
  const generation = ++authGeneration;
  refreshPromise = null;
  const session = await requestAccountSession(
    identityBaseUrl,
    '/api/auth/account/login',
    {
      username: input.username.trim(),
      password: input.password,
      deviceName: input.deviceName.trim()
    },
    input.signal
  );
  if (generation !== authGeneration || input.signal?.aborted) throw new Error('Account login superseded');
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
  const generation = ++authGeneration;
  refreshPromise = null;
  const session = await requestAccountSession(
    identityBaseUrl,
    `/api/auth/account/login-challenges/${encodeURIComponent(challengeId.trim())}/claim`,
    { claimToken: claimToken.trim() },
    signal
  );
  if (generation !== authGeneration || signal?.aborted) throw new Error('Account login superseded');
  persistSession(identityBaseUrl, session);
  return session;
}

async function refreshAccountSession(force = false): Promise<AccountSession | null> {
  const current = snapshot.session;
  if (!force && current && current.accessExpireAtMs - Date.now() > MIN_ACCESS_VALIDITY_MS) return current;
  if (refreshPromise) return refreshPromise;
  const credential = readPersistedCredential();
  if (!credential) {
    if (current && current.accessExpireAtMs > Date.now()) return current;
    setSnapshot({ isBootstrapping: false, session: null });
    return null;
  }
  const generation = authGeneration;
  const task = requestAccountSession(credential.identityBaseUrl, '/api/auth/refresh', {
    deviceToken: credential.deviceToken
  })
    .then((session) => {
      if (generation !== authGeneration) return null;
      persistSession(credential.identityBaseUrl, session);
      return session;
    })
    .catch((error: unknown) => {
      if (generation !== authGeneration) return null;
      const invalid = error instanceof ApiError && (error.status === 401 || error.status === 403);
      if (invalid) storage.delete(PERSISTED_CREDENTIAL_KEY);
      setSnapshot({
        isBootstrapping: false,
        session: null,
        ...(invalid ? {} : { error: error instanceof Error ? error.message : 'Account recovery failed' })
      });
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
  authGeneration++;
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
