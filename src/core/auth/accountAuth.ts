import { MMKV } from 'react-native-mmkv';
import { ACCOUNT_LOGIN_METHOD, readAccountApiBaseUrl, readTunnelHubApiBaseUrl } from './authConfig.ts';
import { parseAccountSession, parseOfficialUser, type AccountSession } from './accountAuthModel.ts';
import { ApiError } from '../api/apiError.ts';
import { sendAccountApiRequest } from '../api/accountRequest.ts';
import { isAccountEmailVerification } from '../api/contracts/accountEmail.ts';
import {
  clearEnterpriseSession,
  restoreEnterpriseSession,
  saveEnterpriseSession,
  verifyEnterpriseLogin
} from './enterpriseAccount';

const MIN_ACCESS_VALIDITY_MS = 90_000;
const enterprise = ACCOUNT_LOGIN_METHOD === 'enterprise-sso';
const storage = new MMKV({ id: 'zenmind-official-session-state' });
const SIGNED_OUT_KEY = enterprise ? `signed_out:${readAccountApiBaseUrl()}` : 'signed_out';
let signedOut = storage.getBoolean(SIGNED_OUT_KEY) === true;
export type AccountAuthSnapshot = { isBootstrapping: boolean; session: AccountSession | null; error?: string };
let snapshot: AccountAuthSnapshot = { isBootstrapping: true, session: null };
let authGeneration = 0;
let refreshPromise: Promise<AccountSession | null> | null = null;
let sessionMutation: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
function setSnapshot(next: AccountAuthSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
export function getAccountAuthSnapshot() {
  return snapshot;
}
export function getAccountAuthGeneration() {
  return authGeneration;
}
export function subscribeAccountAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function queueSessionMutation<T>(work: () => Promise<T>): Promise<T> {
  const task = sessionMutation.then(work, work);
  sessionMutation = task;
  return task;
}
function setSignedOut(value: boolean) {
  signedOut = value;
  storage.set(SIGNED_OUT_KEY, value);
}
function beginLogin() {
  ++authGeneration;
  refreshPromise = null;
  setSignedOut(true);
  setSnapshot({ isBootstrapping: false, session: null });
  return authGeneration;
}
function assertCurrent(generation: number, signal?: AbortSignal) {
  if (generation !== authGeneration || signal?.aborted) throw new Error('Account login superseded');
}
async function officialCSRF(base: string) {
  const value = await sendAccountApiRequest<{ csrfToken?: unknown }>(base, {
    path: '/api/auth/csrf',
    credentials: 'include'
  });
  if (typeof value.csrfToken !== 'string' || !value.csrfToken) throw new Error('Invalid official CSRF response');
  return value.csrfToken;
}
async function requestOfficialSession(base: string): Promise<AccountSession> {
  const me = await sendAccountApiRequest<{ user?: unknown }>(base, { path: '/api/auth/me', credentials: 'include' });
  const user = parseOfficialUser(me.user);
  const csrf = await officialCSRF(base);
  const value = await sendAccountApiRequest(base, {
    path: '/api/auth/desktop-sso/token',
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf }
  });
  return parseAccountSession(value, base, user);
}
async function clearAccountSession() {
  const base = readAccountApiBaseUrl();
  if (!base) return;
  if (enterprise) return clearEnterpriseSession();
  try {
    const csrf = await officialCSRF(base);
    await sendAccountApiRequest(base, {
      path: '/api/auth/logout',
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf }
    });
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error;
  }
}
async function publishLogin(session: AccountSession, generation: number, signal?: AbortSignal) {
  assertCurrent(generation, signal);
  if (enterprise) await saveEnterpriseSession(session);
  assertCurrent(generation, signal);
  setSignedOut(false);
  setSnapshot({ isBootstrapping: false, session });
  return session;
}
export function loginWithAccountEmail(input: {
  email: string;
  code: string;
  signal?: AbortSignal;
}): Promise<AccountSession> {
  const base = readAccountApiBaseUrl();
  if (enterprise || !base || !isAccountEmailVerification(input.email, input.code))
    return Promise.reject(new Error('Invalid email login input'));
  const generation = beginLogin();
  return queueSessionMutation(async () => {
    assertCurrent(generation, input.signal);
    let verified = false;
    try {
      // Cookie writes finish before cancellation cleanup and the next account operation.
      await sendAccountApiRequest(base, {
        path: '/api/auth/email-code/verify',
        method: 'POST',
        body: { email: input.email.trim(), code: input.code },
        credentials: 'include'
      });
      verified = true;
      return await publishLogin(await requestOfficialSession(base), generation, input.signal);
    } finally {
      if (verified && (generation !== authGeneration || input.signal?.aborted)) await clearAccountSession();
    }
  });
}
export function beginEnterpriseAccountLogin(signal?: AbortSignal) {
  if (!enterprise || !readAccountApiBaseUrl()) return Promise.reject(new Error('Enterprise sign-in is not configured'));
  const generation = beginLogin();
  return queueSessionMutation(async () => {
    assertCurrent(generation, signal);
    await clearEnterpriseSession();
    assertCurrent(generation, signal);
  });
}
export function completeEnterpriseAccountLogin(generation: number, signal?: AbortSignal): Promise<AccountSession> {
  if (!enterprise) return Promise.reject(new Error('Enterprise sign-in is not configured'));
  return queueSessionMutation(async () => {
    assertCurrent(generation, signal);
    try {
      return await publishLogin(await verifyEnterpriseLogin(signal), generation, signal);
    } finally {
      if (generation !== authGeneration || signal?.aborted) await clearEnterpriseSession();
    }
  });
}
export function cancelEnterpriseAccountLogin(generation: number) {
  if (!enterprise || generation !== authGeneration || snapshot.session) return Promise.resolve();
  beginLogin();
  return queueSessionMutation(clearEnterpriseSession);
}
export async function refreshAccountSession(force = false): Promise<AccountSession | null> {
  if (signedOut || !readAccountApiBaseUrl()) {
    setSnapshot({ isBootstrapping: false, session: null });
    return null;
  }
  const current = snapshot.session;
  if (!force && current && current.accessExpireAtMs - Date.now() > MIN_ACCESS_VALIDITY_MS) return current;
  if (refreshPromise) return refreshPromise;
  const generation = authGeneration;
  const task = queueSessionMutation(async () => {
    if (generation !== authGeneration) return null;
    try {
      const session = enterprise
        ? await restoreEnterpriseSession(current?.accessToken)
        : await requestOfficialSession(readAccountApiBaseUrl());
      if (generation !== authGeneration) return null;
      if (current && current.accountId !== session?.accountId) throw new ApiError('account_changed', 401, null);
      if (session && enterprise) {
        await saveEnterpriseSession(session);
        if (generation !== authGeneration) return null;
      }
      setSnapshot({ isBootstrapping: false, session });
      return session;
    } catch (error) {
      if (generation !== authGeneration) return null;
      const invalid = error instanceof ApiError && (error.status === 401 || error.status === 403);
      if (invalid) {
        ++authGeneration;
        setSignedOut(true);
      }
      setSnapshot({
        isBootstrapping: false,
        session: !invalid && current && current.accessExpireAtMs > Date.now() ? current : null,
        ...(invalid ? {} : { error: error instanceof Error ? error.message : 'Account recovery failed' })
      });
      if (invalid && enterprise) await clearEnterpriseSession();
      return null;
    }
  });
  refreshPromise = task;
  try {
    return await task;
  } finally {
    if (refreshPromise === task) refreshPromise = null;
  }
}
export function bootstrapAccountAuth() {
  setSnapshot({ isBootstrapping: true, session: snapshot.session });
  return refreshAccountSession(true);
}
export async function getAccountAccessTokenForRequest(baseUrl: string, forceRefresh = false): Promise<string | null> {
  try {
    if (
      ![readAccountApiBaseUrl(), readTunnelHubApiBaseUrl()].some(
        (base) => base && new URL(base).origin === new URL(baseUrl).origin
      )
    )
      return null;
  } catch {
    return null;
  }
  return (await refreshAccountSession(forceRefresh))?.accessToken || null;
}
export function logoutAccount(): Promise<void> {
  beginLogin();
  return queueSessionMutation(clearAccountSession);
}
