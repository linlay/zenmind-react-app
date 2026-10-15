import { MMKV } from 'react-native-mmkv';
import { readOfficialApiBaseUrl, readTunnelHubApiBaseUrl } from './authConfig.ts';
import { parseAccountSession, parseOfficialUser, type AccountSession } from './accountAuthModel.ts';
import { ApiError } from '../api/apiError.ts';
import { sendAccountApiRequest } from '../api/accountRequest.ts';
import { isAccountEmailVerification } from '../api/contracts/accountEmail.ts';

const MIN_ACCESS_VALIDITY_MS = 90_000;
const storage = new MMKV({ id: 'zenmind-official-session-state' });
const SIGNED_OUT_KEY = 'signed_out';
let signedOut = storage.getBoolean(SIGNED_OUT_KEY) === true;
export type AccountAuthSnapshot = { isBootstrapping: boolean; session: AccountSession | null; error?: string };
let snapshot: AccountAuthSnapshot = { isBootstrapping: true, session: null };
let authGeneration = 0;
let refreshPromise: Promise<AccountSession | null> | null = null;
// Cookie-changing requests must finish in order, including cleanup of a cancelled verification.
let sessionMutation: Promise<void> = Promise.resolve();
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
async function revokeOfficialSession(base: string) {
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
export async function loginWithAccountEmail(input: {
  email: string;
  code: string;
  signal?: AbortSignal;
}): Promise<AccountSession> {
  if (!isAccountEmailVerification(input.email, input.code)) throw new Error('Invalid email login input');
  const base = readOfficialApiBaseUrl();
  if (!base) throw new Error('Official account API is not configured');
  const generation = ++authGeneration;
  refreshPromise = null;
  setSnapshot({ isBootstrapping: false, session: null });
  const task = sessionMutation.then(async () => {
    if (generation !== authGeneration || input.signal?.aborted) throw new Error('Account login superseded');
    let verified = false;
    try {
      // Do not abort a Cookie-writing request halfway through. Cancellation discards and revokes its result.
      await sendAccountApiRequest(base, {
        path: '/api/auth/email-code/verify',
        method: 'POST',
        body: { email: input.email.trim(), code: input.code },
        credentials: 'include'
      });
      verified = true;
      const session = await requestOfficialSession(base);
      if (generation !== authGeneration || input.signal?.aborted) {
        throw new Error('Account login superseded');
      }
      signedOut = false;
      storage.set(SIGNED_OUT_KEY, false);
      setSnapshot({ isBootstrapping: false, session });
      return session;
    } catch (error) {
      if (generation === authGeneration) setSnapshot({ isBootstrapping: false, session: null });
      throw error;
    } finally {
      if (verified && (generation !== authGeneration || input.signal?.aborted)) await revokeOfficialSession(base);
    }
  });
  sessionMutation = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}
async function refreshAccountSession(force = false): Promise<AccountSession | null> {
  if (signedOut) {
    setSnapshot({ isBootstrapping: false, session: null });
    return null;
  }
  const current = snapshot.session;
  if (!force && current && current.accessExpireAtMs - Date.now() > MIN_ACCESS_VALIDITY_MS) return current;
  if (refreshPromise) return refreshPromise;
  const base = readOfficialApiBaseUrl();
  if (!base) {
    setSnapshot({ isBootstrapping: false, session: null });
    return null;
  }
  const generation = authGeneration;
  const task = sessionMutation
    .then(() => requestOfficialSession(base))
    .then((session) => {
      if (generation !== authGeneration) return null;
      if (current && current.accountId !== session.accountId) {
        ++authGeneration;
        setSnapshot({ isBootstrapping: false, session: null });
        return null;
      }
      setSnapshot({ isBootstrapping: false, session });
      return session;
    })
    .catch((error: unknown) => {
      if (generation !== authGeneration) return null;
      const invalid = error instanceof ApiError && (error.status === 401 || error.status === 403);
      if (invalid) ++authGeneration;
      setSnapshot({
        isBootstrapping: false,
        session: !invalid && current && current.accessExpireAtMs > Date.now() ? current : null,
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
export function bootstrapAccountAuth() {
  setSnapshot({ isBootstrapping: true, session: snapshot.session });
  return refreshAccountSession(true);
}
export async function getAccountAccessTokenForRequest(baseUrl: string, forceRefresh = false): Promise<string | null> {
  try {
    if (
      ![readOfficialApiBaseUrl(), readTunnelHubApiBaseUrl()].some(
        (base) => base && new URL(base).origin === new URL(baseUrl).origin
      )
    )
      return null;
  } catch {
    return null;
  }
  return (await refreshAccountSession(forceRefresh))?.accessToken || null;
}
export async function logoutAccount(): Promise<void> {
  ++authGeneration;
  refreshPromise = null;
  signedOut = true;
  storage.set(SIGNED_OUT_KEY, true);
  setSnapshot({ isBootstrapping: false, session: null });
  const base = readOfficialApiBaseUrl();
  if (!base) return;
  const task = sessionMutation.then(() => revokeOfficialSession(base));
  sessionMutation = task.then(
    () => undefined,
    () => undefined
  );
  await task;
}
