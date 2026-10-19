import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { getDefaultSourceConfig } from '../config/appEnvironment';

export type CloudStatus =
  | 'checking'
  | 'available'
  | 'login_required'
  | 'forbidden'
  | 'network_error'
  | 'service_error'
  | 'protocol_error';
export type CloudCredential = { binding: string; token: string; scopeId: string; manual: boolean };
export type CloudAuthSnapshot = { status: CloudStatus; scopeId: string; cacheAllowed: boolean; generation: number };
// Reuse the existing native credential store. Web keeps tokens in memory only.
const storage = Platform.OS === 'web' ? null : new MMKV({ id: 'zenmind-cloud-credential' });
const KEY = 'default_cloud_credential_v1';
const listeners = new Set<() => void>();
let credential: CloudCredential | null = null;
let signedOut = false;
let snapshot: CloudAuthSnapshot = { status: 'checking', scopeId: '', cacheAllowed: false, generation: 0 };

function getDefaultCloudBinding(): string {
  const config = getDefaultSourceConfig();
  return JSON.stringify([config.sourceId, config.apiBaseUrl, config.wsUrl, config.authMode]);
}
export function getCloudAuthSnapshot(): CloudAuthSnapshot {
  return snapshot;
}
export function subscribeCloudAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publish(next: CloudAuthSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
export function readCloudCredential(): CloudCredential | null {
  return credential?.binding === getDefaultCloudBinding() && !signedOut ? credential : null;
}
export function createCloudCredential(token: string, manual: boolean): CloudCredential {
  if (getDefaultSourceConfig().authMode === 'none') token = '';
  const binding = getDefaultCloudBinding();
  if (credential?.binding === binding && credential.token === token) return credential;
  return {
    binding,
    token,
    manual,
    scopeId: `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
  };
}
export function restoreCloudCredential(): void {
  const binding = getDefaultCloudBinding();
  try {
    const saved = JSON.parse(storage?.getString(KEY) || 'null');
    signedOut = saved?.binding === binding && saved.signedOut === true;
    if (
      saved?.binding === binding &&
      typeof saved.token === 'string' &&
      /^cs_[a-zA-Z0-9_-]{1,60}$/u.test(saved.scopeId)
    )
      credential = { binding, token: saved.token, scopeId: saved.scopeId, manual: saved.manual === true };
  } catch {
    /* Malformed local credentials never become access. */
  }
  const configured = getDefaultSourceConfig();
  if (
    credential &&
    !credential.manual &&
    credential.token !== (configured.authMode === 'none' ? '' : configured.accessToken.trim())
  )
    credential = null;
  if (!credential && !signedOut) {
    const config = getDefaultSourceConfig();
    if (config.authMode === 'none' || config.accessToken.trim())
      credential = createCloudCredential(config.authMode === 'none' ? '' : config.accessToken.trim(), false);
  }
}
export function beginCloudVerification(): number {
  publish({ ...snapshot, status: 'checking', generation: snapshot.generation + 1 });
  return snapshot.generation;
}
export function finishCloudVerification(
  candidate: CloudCredential | null,
  status: CloudStatus,
  generation: number
): boolean {
  if (generation !== snapshot.generation || (candidate && candidate.binding !== getDefaultCloudBinding())) return false;
  if (status === 'available' && candidate) {
    credential = candidate;
    signedOut = false;
    storage?.set(KEY, JSON.stringify(candidate));
  }
  publish({
    status,
    generation,
    scopeId: credential?.scopeId || '',
    cacheAllowed: status === 'available' || (snapshot.cacheAllowed && status !== 'login_required')
  });
  return true;
}
export function reportCloudFailure(status: CloudStatus, generation: number): void {
  if (generation !== snapshot.generation) return;
  if (status === 'login_required') publish({ ...snapshot, status, cacheAllowed: false, generation: generation + 1 });
  else finishCloudVerification(readCloudCredential(), status, generation);
}
export function logoutCloud(): void {
  signedOut = true;
  credential = null;
  storage?.set(KEY, JSON.stringify({ binding: getDefaultCloudBinding(), signedOut: true }));
  publish({ status: 'login_required', generation: snapshot.generation + 1, scopeId: '', cacheAllowed: false });
}
export function getCloudAccessTokenForRequest(): string {
  const current = readCloudCredential();
  if (!current || snapshot.status !== 'available') throw new Error('Cloud access unavailable');
  return current.token;
}
