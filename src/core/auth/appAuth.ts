import { saveStoredApiBaseUrl } from './authConfig';
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';

import {
  deleteChatDatabaseScope,
  switchChatDatabaseScope,
} from '../../features/chatPersistence/database';
import { clearChatDirectorySnapshotForScope } from '../../features/chatPersistence/homeSnapshot';
import { logHttpError, logHttpRequest, logHttpResponse } from '../debug/httpDebugLogger';
import {
  getActiveDeviceProfile,
  markActiveDeviceProfileNeedsRelink,
  setActiveDeviceProfileId,
  updateActiveDeviceProfileAuth,
  upsertDeviceProfile,
  upsertManualDeviceProfile,
  type DeviceProfile,
} from './deviceProfiles';

const authStorage = new MMKV({ id: 'zenmind-auth-session' });

const DEVICE_TOKEN_KEY = 'auth_device_token_v1';
const DEVICE_NAME_KEY = 'auth_device_name_v1';
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

export interface SessionState {
  username: string;
  deviceId: string;
  deviceName: string;
  accessToken: string;
  accessExpireAtMs: number;
  deviceToken: string;
}

export interface AuthStoreSnapshot {
  isBootstrapping: boolean;
  session: SessionState | null;
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

interface PairingPayload {
  desktopDeviceId: string;
  desktopIdentityCreatedAt?: string;
  desktopUsername?: string;
  desktopHostname?: string;
  appServerIssuer?: string;
  appServerPublicKeySha256?: string;
  apiBaseUrl: string;
  pairingId: string;
  secret: string;
  expiresAt?: string;
}

interface PairingClaimResponse extends LoginResponse {
  desktopDeviceId: string;
  desktopIdentityCreatedAt?: string;
  desktopUsername?: string;
  desktopHostname?: string;
  appServerIssuer?: string;
  appServerPublicKeySha256?: string;
  apiBaseUrl?: string;
}

interface RefreshResponse {
  deviceId: string;
  accessToken: string;
  accessTokenExpireAtMs?: number | string;
  accessTokenExpireAt?: number | string;
  accessExpireAt?: number | string;
  deviceToken: string;
}

type StoreListener = () => void;

let currentSession: SessionState | null = null;
let currentBaseUrl = '';
let refreshPromise: Promise<string | null> | null = null;
let refreshFailureMode: RefreshFailureMode | null = null;
let bootstrapPromise: Promise<SessionState | null> | null = null;
let authSnapshot: AuthStoreSnapshot = {
  isBootstrapping: true,
  session: null,
};
const listeners = new Set<StoreListener>();

function emitStoreChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore observer failures so auth state can continue updating.
    }
  });
}

function setAuthSnapshot(nextSnapshot: AuthStoreSnapshot) {
  if (
    authSnapshot.isBootstrapping === nextSnapshot.isBootstrapping &&
    authSnapshot.session === nextSnapshot.session
  ) {
    return;
  }

  authSnapshot = nextSnapshot;
  emitStoreChange();
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '');
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key].trim() : '';
}

function parsePairingPayload(payloadText: string): PairingPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(payloadText || '').trim());
  } catch {
    throw new Error('二维码内容格式不正确');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('二维码内容格式不正确');
  }
  const record = parsed as Record<string, unknown>;
  const payload: PairingPayload = {
    desktopDeviceId: readString(record, 'desktopDeviceId'),
    desktopIdentityCreatedAt: readString(record, 'desktopIdentityCreatedAt'),
    desktopUsername: readString(record, 'desktopUsername'),
    desktopHostname: readString(record, 'desktopHostname'),
    appServerIssuer: readString(record, 'appServerIssuer'),
    appServerPublicKeySha256: readString(record, 'appServerPublicKeySha256'),
    apiBaseUrl: normalizeBaseUrl(readString(record, 'apiBaseUrl')),
    pairingId: readString(record, 'pairingId'),
    secret: readString(record, 'secret'),
    expiresAt: readString(record, 'expiresAt'),
  };
  if (!payload.desktopDeviceId || !payload.apiBaseUrl || !payload.pairingId || !payload.secret) {
    throw new Error('二维码缺少必要配对字段');
  }
  return payload;
}

function defaultDisplayNameFromPairing(payload: PairingPayload | PairingClaimResponse): string {
  return (
    String(payload.desktopUsername || '').trim() ||
    String(payload.desktopHostname || '').trim() ||
    'Desktop'
  );
}

function applyDeviceProfileRuntime(profile: DeviceProfile) {
  switchChatDatabaseScope(profile.cacheScopeId);
  saveStoredApiBaseUrl(profile.apiBaseUrl);
  saveDeviceToken(profile.deviceToken);
}

function hydrateActiveProfileRuntime(): DeviceProfile | null {
  const profile = getActiveDeviceProfile();
  if (!profile || profile.needsRelink) {
    return null;
  }
  applyDeviceProfileRuntime(profile);
  return profile;
}

function cleanupEvictedDeviceCaches(cacheScopeIds: string[]) {
  const seen = new Set<string>();
  for (const cacheScopeId of cacheScopeIds) {
    const normalized = String(cacheScopeId || '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    clearChatDirectorySnapshotForScope(normalized);
    deleteChatDatabaseScope(normalized);
  }
}

function parseNumericEpochMs(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw >= 1_000_000_000_000 ? raw : raw * 1000;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed >= 1_000_000_000_000 ? parsed : parsed * 1000;
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
  const parsedTs = new Date(normalizedIsoText).getTime();
  if (Number.isFinite(parsedTs) && parsedTs > 0) {
    return parsedTs;
  }

  return null;
}

function resolveAccessExpireAtMs(payload: LoginResponse | RefreshResponse): number {
  const candidates = [
    payload.accessTokenExpireAtMs,
    payload.accessTokenExpireAt,
    payload.accessExpireAt,
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const ts = parseExpireAt(candidates[index]);
    if (ts) {
      return ts;
    }
  }

  return Date.now() + FALLBACK_TOKEN_VALIDITY_MS;
}

function resolveErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    const candidates = [data.error, data.msg, data.message];
    for (let index = 0; index < candidates.length; index += 1) {
      const value = candidates[index];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }

  return `HTTP ${status}`;
}

function parseJsonPayload(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const method = String(options.method || 'GET');
  const startedAt = Date.now();

  logHttpRequest({
    url,
    method,
    body: options.body,
  });

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(url, options);
    const text = await response.text();
    payload = parseJsonPayload(text);
  } catch (error) {
    logHttpError({
      url,
      method,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }

  logHttpResponse({
    url,
    method,
    status: response.status,
    durationMs: Date.now() - startedAt,
    payload,
  });

  if (!response.ok) {
    throw new Error(resolveErrorMessage(response.status, payload));
  }

  return payload as T;
}

function readDeviceTokenFromStorage(): string {
  return String(authStorage.getString(DEVICE_TOKEN_KEY) || '').trim();
}

function saveDeviceToken(deviceToken: string) {
  const normalized = String(deviceToken || '').trim();
  if (!normalized) {
    authStorage.delete(DEVICE_TOKEN_KEY);
    return;
  }

  authStorage.set(DEVICE_TOKEN_KEY, normalized);
}

function savePreferredDeviceName(deviceName: string) {
  const normalized = String(deviceName || '').trim();
  if (!normalized) {
    authStorage.delete(DEVICE_NAME_KEY);
    return;
  }

  authStorage.set(DEVICE_NAME_KEY, normalized);
}

function clearSessionAndDeviceToken() {
  markActiveDeviceProfileNeedsRelink();
  saveDeviceToken('');
  setCurrentSession(null);
}

function ensureBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (normalizedBaseUrl === currentBaseUrl) {
    return normalizedBaseUrl;
  }

  currentBaseUrl = normalizedBaseUrl;
  currentSession = null;
  refreshPromise = null;
  refreshFailureMode = null;
  bootstrapPromise = null;
  setAuthSnapshot({
    isBootstrapping: false,
    session: null,
  });
  return normalizedBaseUrl;
}

function setCurrentSession(session: SessionState | null) {
  currentSession = session;
  setAuthSnapshot({
    isBootstrapping: false,
    session,
  });
}

function buildSessionFromLogin(payload: LoginResponse, fallbackDeviceName: string): SessionState {
  return {
    username: String(payload.username || 'app'),
    deviceId: String(payload.deviceId || ''),
    deviceName: String(payload.deviceName || fallbackDeviceName || 'Device'),
    accessToken: String(payload.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(payload),
    deviceToken: String(payload.deviceToken || ''),
  };
}

function buildSessionFromRefresh(payload: RefreshResponse): SessionState {
  return {
    username: currentSession?.username || 'app',
    deviceId: String(payload.deviceId || currentSession?.deviceId || ''),
    deviceName: currentSession?.deviceName || readPreferredDeviceName(),
    accessToken: String(payload.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(payload),
    deviceToken: String(payload.deviceToken || currentSession?.deviceToken || ''),
  };
}

function getRandomJitterMs(maxJitterMs: number): number {
  if (!Number.isFinite(maxJitterMs) || maxJitterMs <= 0) {
    return 0;
  }

  return Math.floor(Math.random() * maxJitterMs);
}

async function refreshAccessToken(
  baseUrl: string,
  forceRefresh: boolean,
  failureMode: RefreshFailureMode
): Promise<string | null> {
  const normalizedBaseUrl = ensureBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    if (failureMode === 'hard') {
      clearSessionAndDeviceToken();
    }
    return null;
  }

  if (
    !forceRefresh &&
    currentSession &&
    currentSession.accessToken &&
    currentSession.accessExpireAtMs - Date.now() > 30_000
  ) {
    return currentSession.accessToken;
  }

  if (refreshPromise) {
    const inFlightPromise = refreshPromise;
    const inFlightMode = refreshFailureMode;
    const token = await inFlightPromise;
    if (token || failureMode !== 'hard' || inFlightMode === 'hard') {
      return token;
    }
    return refreshAccessToken(normalizedBaseUrl, true, 'hard');
  }

  const refreshTask = (async () => {
    const deviceToken = readDeviceTokenFromStorage() || currentSession?.deviceToken || '';
    if (!deviceToken) {
      if (failureMode === 'hard') {
        clearSessionAndDeviceToken();
      }
      return null;
    }

    try {
      const payload = await requestJson<RefreshResponse>(normalizedBaseUrl, '/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceToken }),
      });

      const nextSession = buildSessionFromRefresh(payload);
      saveDeviceToken(nextSession.deviceToken);
      savePreferredDeviceName(nextSession.deviceName);
      const profileResult = updateActiveDeviceProfileAuth({
        apiBaseUrl: normalizedBaseUrl,
        deviceToken: nextSession.deviceToken,
        serverDeviceId: nextSession.deviceId,
      });
      if (profileResult) {
        cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
      }
      setCurrentSession(nextSession);
      return nextSession.accessToken;
    } catch {
      if (failureMode === 'hard') {
        clearSessionAndDeviceToken();
      }
      return null;
    }
  })();

  refreshPromise = refreshTask;
  refreshFailureMode = failureMode;
  try {
    return await refreshTask;
  } finally {
    if (refreshPromise === refreshTask) {
      refreshPromise = null;
      refreshFailureMode = null;
    }
  }
}

export function getAuthSnapshot(): AuthStoreSnapshot {
  return authSnapshot;
}

export function subscribeAuthStore(listener: StoreListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCurrentSession(): SessionState | null {
  return currentSession;
}

export async function getAccessTokenForRequest(
  baseUrl: string,
  forceRefresh = false
): Promise<string | null> {
  return refreshAccessToken(baseUrl, forceRefresh, 'hard');
}

export async function ensureFreshAccessToken(
  baseUrl: string,
  options: EnsureFreshAccessTokenOptions = {}
): Promise<string | null> {
  const normalizedBaseUrl = ensureBaseUrl(baseUrl);
  const minValidityMs = Math.max(0, Number(options.minValidityMs ?? DEFAULT_TOKEN_MIN_VALIDITY_MS));
  const maxJitterMs = Math.max(0, Number(options.jitterMs ?? DEFAULT_TOKEN_JITTER_MS));
  const forceRefresh = Boolean(options.forceRefresh);
  const failureMode = options.failureMode || 'soft';

  if (!forceRefresh && currentSession && currentSession.accessToken) {
    const remainingMs = currentSession.accessExpireAtMs - Date.now();
    if (remainingMs > minValidityMs + getRandomJitterMs(maxJitterMs)) {
      return currentSession.accessToken;
    }
  }

  return refreshAccessToken(normalizedBaseUrl, true, failureMode);
}

export async function bootstrapAuth(baseUrl: string): Promise<SessionState | null> {
  const activeProfile = hydrateActiveProfileRuntime();
  const normalizedBaseUrl = normalizeBaseUrl(activeProfile?.apiBaseUrl || baseUrl);
  if (!normalizedBaseUrl) {
    ensureBaseUrl('');
    setCurrentSession(null);
    return null;
  }

  ensureBaseUrl(normalizedBaseUrl);

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  setAuthSnapshot({
    isBootstrapping: true,
    session: currentSession,
  });

  const task = (async () => {
    const accessToken = await refreshAccessToken(normalizedBaseUrl, true, 'hard');
    setAuthSnapshot({
      isBootstrapping: false,
      session: currentSession,
    });
    return accessToken && currentSession ? currentSession : null;
  })();

  bootstrapPromise = task;
  try {
    return await task;
  } finally {
    if (bootstrapPromise === task) {
      bootstrapPromise = null;
    }
  }
}

export async function restoreSession(baseUrl: string): Promise<SessionState | null> {
  return bootstrapAuth(baseUrl);
}

export async function loginWithMasterPassword(
  baseUrl: string,
  masterPassword: string,
  deviceName: string
): Promise<SessionState> {
  const normalizedBaseUrl = ensureBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not configured');
  }

  const normalizedPassword = String(masterPassword || '').trim();
  if (!normalizedPassword) {
    throw new Error('请输入主密码');
  }

  const normalizedDeviceName = String(deviceName || '').trim() || getDefaultDeviceName();
  const payload = await requestJson<LoginResponse>(normalizedBaseUrl, '/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      masterPassword: normalizedPassword,
      deviceName: normalizedDeviceName,
    }),
  });

  const nextSession = buildSessionFromLogin(payload, normalizedDeviceName);
  const profileResult = upsertManualDeviceProfile({
    apiBaseUrl: normalizedBaseUrl,
    deviceName: nextSession.deviceName,
    deviceToken: nextSession.deviceToken,
    serverDeviceId: nextSession.deviceId,
  });
  applyDeviceProfileRuntime(profileResult.profile);
  cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
  savePreferredDeviceName(nextSession.deviceName);
  setCurrentSession(nextSession);
  return nextSession;
}

export async function loginWithPairingPayload(
  pairingPayloadText: string,
  deviceName: string
): Promise<SessionState> {
  const pairing = parsePairingPayload(pairingPayloadText);
  const normalizedBaseUrl = ensureBaseUrl(pairing.apiBaseUrl);
  if (!normalizedBaseUrl) {
    throw new Error('二维码缺少服务地址');
  }

  const normalizedDeviceName = String(deviceName || '').trim() || getDefaultDeviceName();
  const payload = await requestJson<PairingClaimResponse>(normalizedBaseUrl, '/api/auth/pairing/claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pairingId: pairing.pairingId,
      secret: pairing.secret,
      deviceName: normalizedDeviceName,
    }),
  });

  const nextSession = buildSessionFromLogin(payload, normalizedDeviceName);
  const apiBaseUrl = normalizeBaseUrl(payload.apiBaseUrl || pairing.apiBaseUrl);
  const profileResult = upsertDeviceProfile({
    desktopDeviceId: payload.desktopDeviceId || pairing.desktopDeviceId,
    defaultDisplayName: defaultDisplayNameFromPairing(payload) || defaultDisplayNameFromPairing(pairing),
    apiBaseUrl,
    deviceToken: nextSession.deviceToken,
    serverDeviceId: nextSession.deviceId,
    identityCreatedAt: payload.desktopIdentityCreatedAt || pairing.desktopIdentityCreatedAt,
    hostname: payload.desktopHostname || pairing.desktopHostname,
    appServerPublicKeySha256:
      payload.appServerPublicKeySha256 || pairing.appServerPublicKeySha256,
  });
  applyDeviceProfileRuntime(profileResult.profile);
  cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
  savePreferredDeviceName(nextSession.deviceName);
  setCurrentSession(nextSession);
  return nextSession;
}

export function activateProfile(desktopDeviceId: string): DeviceProfile {
  const profile = setActiveDeviceProfileId(desktopDeviceId);
  if (!profile) {
    throw new Error('profile not found');
  }
  applyDeviceProfileRuntime(profile);
  currentBaseUrl = profile.apiBaseUrl;
  currentSession = null;
  refreshPromise = null;
  refreshFailureMode = null;
  bootstrapPromise = null;
  setAuthSnapshot({
    isBootstrapping: false,
    session: null,
  });
  return profile;
}

export async function logoutCurrentDevice(baseUrl: string): Promise<void> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const token = currentSession?.accessToken || '';

  try {
    if (normalizedBaseUrl && token) {
      await requestJson<unknown>(normalizedBaseUrl, '/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch {
    // Ignore network failures and continue clearing local session.
  }

  refreshPromise = null;
  bootstrapPromise = null;
  markActiveDeviceProfileNeedsRelink();
  saveDeviceToken('');
  setCurrentSession(null);
}

export function readPreferredDeviceName(): string {
  return String(authStorage.getString(DEVICE_NAME_KEY) || '').trim() || getDefaultDeviceName();
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
