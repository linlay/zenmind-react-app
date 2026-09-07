import { MMKV } from 'react-native-mmkv';

import { wsDebugRecorder } from '../debug/wsDebugRecorder';
import {
  clearActiveDeviceProfileAuth,
  getActiveDeviceProfile,
  setActiveDeviceProfileId,
  updateActiveDeviceProfileAuth,
  upsertDeviceProfile,
  type DesktopWsProfileTransport,
  type DeviceProfile
} from './deviceProfiles';
import { normalizeDesktopWsUrlInput, parsePairingPayload, type DesktopWsPairingPayload } from './desktopWsProtocol';
import {
  DesktopWsAuthClient,
  getDesktopWsAuthErrorCode,
  isAbortError,
  isDesktopWsTransportError
} from './desktopWsAuthClient';
import {
  applyDeviceNameToSession,
  resolveMigratedDeviceNameOverride,
  resolvePreferredDeviceName,
  validateDeviceNameOverride
} from './deviceNameModel';

const authStorage = new MMKV({ id: 'zenmind-auth-session' });

const DEVICE_TOKEN_KEY = 'auth_device_token_v1';
const LEGACY_DEVICE_NAME_KEY = 'auth_device_name_v1';
const DEVICE_NAME_OVERRIDE_KEY = 'auth_device_name_override_v2';
const DEFAULT_TOKEN_MIN_VALIDITY_MS = 90_000;
const DEFAULT_TOKEN_JITTER_MS = 8_000;

export type RefreshFailureMode = 'soft' | 'hard';

export interface EnsureFreshAccessTokenOptions {
  minValidityMs?: number;
  jitterMs?: number;
  forceRefresh?: boolean;
  failureMode?: RefreshFailureMode;
}

export interface LoginWithPairingPayloadOptions {
  signal?: AbortSignal;
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

type DesktopWsHelloData = {
  deviceId: string;
  subject: string;
  authExpiresAtMs: number;
};

type DesktopWsRefreshData = {
  accessToken: string;
  accessExpireAtMs: number;
};

type StoreListener = () => void;

type RefreshInFlight = {
  failureMode: RefreshFailureMode;
  promise: Promise<string | null>;
};

type AuthCacheRuntime = {
  switchScope: (scopeId: string) => void;
  clearDirectorySnapshotForScope: (scopeId: string) => void;
  deleteScope: (scopeId: string) => void;
};

const noopAuthCacheRuntime: AuthCacheRuntime = {
  switchScope: () => {},
  clearDirectorySnapshotForScope: () => {},
  deleteScope: () => {}
};

let currentSession: SessionState | null = null;
let currentProfile: DeviceProfile | null = null;
const refreshInFlightByKey = new Map<string, RefreshInFlight>();
let bootstrapPromise: Promise<SessionState | null> | null = null;
let bootstrapKey = '';
let authSnapshot: AuthStoreSnapshot = {
  isBootstrapping: true,
  session: null
};
let authCacheRuntime = noopAuthCacheRuntime;
const listeners = new Set<StoreListener>();

export function configureAuthCacheRuntime(runtime: Partial<AuthCacheRuntime>) {
  authCacheRuntime = {
    ...noopAuthCacheRuntime,
    ...runtime
  };
}

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
  if (authSnapshot.isBootstrapping === nextSnapshot.isBootstrapping && authSnapshot.session === nextSnapshot.session) {
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === 'string' ? record[key].trim() : '';
}

function buildProfileRefreshKey(profile: DeviceProfile): string {
  return `${profile.transportKind}:${profile.desktopDeviceId}`;
}

function isCurrentProfile(profile: DeviceProfile): boolean {
  return (
    currentProfile?.transportKind === profile.transportKind &&
    currentProfile.desktopDeviceId === profile.desktopDeviceId
  );
}

function applyDeviceProfileRuntime(profile: DeviceProfile) {
  currentProfile = profile;
}

function hydrateActiveProfileRuntime(): DeviceProfile | null {
  const profile = getActiveDeviceProfile();
  if (!profile || profile.needsRelink || profile.transportKind !== 'desktop-ws') {
    currentProfile = null;
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
    authCacheRuntime.clearDirectorySnapshotForScope(normalized);
    authCacheRuntime.deleteScope(normalized);
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
  const parsedTs = new Date(normalizedIsoText).getTime();
  if (Number.isFinite(parsedTs) && parsedTs > 0) {
    return parsedTs;
  }

  return null;
}

function readDesktopWsHelloData(data: unknown): DesktopWsHelloData {
  if (!isObjectRecord(data)) {
    throw new Error('Desktop WS hello 响应无效');
  }

  const auth = isObjectRecord(data.auth) ? data.auth : {};
  return {
    deviceId: readString(data, 'deviceId'),
    subject: readString(auth, 'subject'),
    authExpiresAtMs: parseExpireAt(auth.expiresAt) || 0
  };
}

function readDesktopWsRefreshData(data: unknown): DesktopWsRefreshData {
  if (!isObjectRecord(data)) {
    throw new Error('Desktop WS refresh 响应无效');
  }

  const accessToken = readString(data, 'token');
  const accessExpireAtMs = parseExpireAt(data.expiresAt) || parseExpireAt(data.expiresAtMs) || 0;
  if (!accessToken || accessExpireAtMs <= Date.now()) {
    throw new Error('Desktop WS refresh 响应缺少有效 token');
  }

  return {
    accessToken,
    accessExpireAtMs
  };
}

function saveDeviceToken(deviceToken: string) {
  const normalized = String(deviceToken || '').trim();
  if (!normalized) {
    authStorage.delete(DEVICE_TOKEN_KEY);
    return;
  }

  authStorage.set(DEVICE_TOKEN_KEY, normalized);
}

function readDeviceNameOverride(): string {
  const storedOverride = String(authStorage.getString(DEVICE_NAME_OVERRIDE_KEY) || '').trim();
  if (storedOverride) {
    return storedOverride;
  }

  const legacyValue = authStorage.getString(LEGACY_DEVICE_NAME_KEY);
  if (legacyValue === undefined) {
    return '';
  }

  const migratedOverride = resolveMigratedDeviceNameOverride(legacyValue);
  authStorage.delete(LEGACY_DEVICE_NAME_KEY);
  if (migratedOverride) {
    authStorage.set(DEVICE_NAME_OVERRIDE_KEY, migratedOverride);
  }
  return migratedOverride;
}

function clearSessionAndDeviceToken() {
  clearActiveDeviceProfileAuth();
  currentProfile = null;
  saveDeviceToken('');
  setCurrentSession(null);
}

function setCurrentSession(session: SessionState | null, isBootstrapping = false) {
  currentSession = session;
  setAuthSnapshot({
    isBootstrapping,
    session
  });
}

function buildSessionFromDesktopWs(
  profile: DeviceProfile,
  transport: DesktopWsProfileTransport,
  input: {
    subject?: string;
    deviceId?: string;
  } = {}
): SessionState {
  const deviceId = String(input.deviceId || profile.serverDeviceId || profile.desktopDeviceId);
  return {
    username: String(input.subject || currentSession?.username || 'app'),
    deviceId,
    deviceName: readPreferredDeviceName(deviceId),
    accessToken: transport.accessToken,
    accessExpireAtMs: transport.accessExpireAtMs,
    deviceToken: ''
  };
}

function getRandomJitterMs(maxJitterMs: number): number {
  if (!Number.isFinite(maxJitterMs) || maxJitterMs <= 0) {
    return 0;
  }

  return Math.floor(Math.random() * maxJitterMs);
}

function hasTokenValidity(accessExpireAtMs: number, minValidityMs: number, jitterMs = 0): boolean {
  return accessExpireAtMs - Date.now() > minValidityMs + getRandomJitterMs(jitterMs);
}

function persistDesktopWsRefresh(
  profile: DeviceProfile,
  transport: DesktopWsProfileTransport,
  refreshed: DesktopWsRefreshData
): string | null {
  const nextTransport: DesktopWsProfileTransport = {
    ...transport,
    accessToken: refreshed.accessToken,
    accessExpireAtMs: refreshed.accessExpireAtMs
  };
  if (!isCurrentProfile(profile)) {
    return null;
  }
  const profileResult = updateActiveDeviceProfileAuth({
    serverDeviceId: profile.serverDeviceId,
    desktopWs: nextTransport
  });
  if (profileResult) {
    currentProfile = profileResult.profile;
    cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
  }
  setCurrentSession(
    buildSessionFromDesktopWs(profileResult?.profile || profile, nextTransport, {
      subject: currentSession?.username,
      deviceId: profile.serverDeviceId
    })
  );
  return nextTransport.accessToken;
}

async function refreshDesktopWsAccessToken(
  profile: DeviceProfile,
  forceRefresh: boolean,
  failureMode: RefreshFailureMode,
  minValidityMs = DEFAULT_TOKEN_MIN_VALIDITY_MS,
  jitterMs = DEFAULT_TOKEN_JITTER_MS
): Promise<string | null> {
  const refreshKey = buildProfileRefreshKey(profile);
  const transport = profile.desktopWs;
  if (profile.transportKind !== 'desktop-ws' || !transport?.accessToken) {
    if (failureMode === 'hard') {
      clearSessionAndDeviceToken();
    }
    return null;
  }

  if (
    !forceRefresh &&
    currentSession?.accessToken &&
    hasTokenValidity(currentSession.accessExpireAtMs, minValidityMs, jitterMs)
  ) {
    return currentSession.accessToken;
  }

  if (!forceRefresh && hasTokenValidity(transport.accessExpireAtMs, minValidityMs, jitterMs)) {
    const restoredSession = buildSessionFromDesktopWs(profile, transport);
    setCurrentSession(restoredSession);
    return restoredSession.accessToken;
  }

  const inFlight = refreshInFlightByKey.get(refreshKey);
  if (inFlight) {
    const token = await inFlight.promise;
    if (token || failureMode !== 'hard' || inFlight.failureMode === 'hard') {
      return token;
    }
    return refreshDesktopWsAccessToken(profile, true, 'hard', minValidityMs, jitterMs);
  }

  const refreshTask = (async () => {
    const client = new DesktopWsAuthClient(transport);
    try {
      await client.connect();
      const refreshed = readDesktopWsRefreshData(await client.request('auth.refresh'));
      return persistDesktopWsRefresh(profile, transport, refreshed);
    } catch (error) {
      if (failureMode === 'hard' && !isDesktopWsTransportError(error)) {
        clearSessionAndDeviceToken();
      }
      return null;
    } finally {
      client.close();
    }
  })();

  refreshInFlightByKey.set(refreshKey, { failureMode, promise: refreshTask });
  try {
    return await refreshTask;
  } finally {
    if (refreshInFlightByKey.get(refreshKey)?.promise === refreshTask) {
      refreshInFlightByKey.delete(refreshKey);
    }
  }
}

async function bootstrapDesktopWsAuth(profile: DeviceProfile): Promise<SessionState | null> {
  const transport = profile.desktopWs;
  if (!transport?.accessToken) {
    clearSessionAndDeviceToken();
    return null;
  }

  const restoredSession = buildSessionFromDesktopWs(profile, transport);
  setCurrentSession(restoredSession, true);

  const client = new DesktopWsAuthClient(transport);
  try {
    await client.connect();
    const hello = readDesktopWsHelloData(await client.request('session.hello'));
    if (hello.deviceId !== profile.desktopDeviceId) {
      throw new Error('Desktop WS 设备不匹配');
    }

    let nextTransport = transport;
    if (!hasTokenValidity(transport.accessExpireAtMs, DEFAULT_TOKEN_MIN_VALIDITY_MS)) {
      const refreshed = readDesktopWsRefreshData(await client.request('auth.refresh'));
      nextTransport = {
        ...transport,
        accessToken: refreshed.accessToken,
        accessExpireAtMs: refreshed.accessExpireAtMs
      };
    }

    if (!isCurrentProfile(profile)) {
      return null;
    }

    const profileResult = updateActiveDeviceProfileAuth({
      serverDeviceId: hello.deviceId,
      desktopWs: nextTransport
    });
    if (profileResult) {
      currentProfile = profileResult.profile;
      cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
    }

    const nextProfile = profileResult?.profile || profile;
    const nextSession = buildSessionFromDesktopWs(nextProfile, nextTransport, {
      subject: hello.subject,
      deviceId: hello.deviceId
    });
    setCurrentSession(nextSession);
    return nextSession;
  } catch (error) {
    if (isDesktopWsTransportError(error)) {
      setCurrentSession(null);
    } else {
      clearSessionAndDeviceToken();
    }
    return null;
  } finally {
    client.close();
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

export async function getAccessTokenForRequest(baseUrl: string, forceRefresh = false): Promise<string | null> {
  const activeProfile = currentProfile;
  if (activeProfile?.transportKind !== 'desktop-ws') {
    return null;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl || normalizeBaseUrl(activeProfile.apiBaseUrl) !== normalizedBaseUrl) {
    return null;
  }
  return refreshDesktopWsAccessToken(activeProfile, forceRefresh, 'hard');
}

export async function ensureFreshAccessToken(
  baseUrl: string,
  options: EnsureFreshAccessTokenOptions = {}
): Promise<string | null> {
  const activeProfile = currentProfile;
  const minValidityMs = Math.max(0, Number(options.minValidityMs ?? DEFAULT_TOKEN_MIN_VALIDITY_MS));
  const maxJitterMs = Math.max(0, Number(options.jitterMs ?? DEFAULT_TOKEN_JITTER_MS));
  const forceRefresh = Boolean(options.forceRefresh);
  const failureMode = options.failureMode || 'soft';

  if (activeProfile?.transportKind !== 'desktop-ws') {
    return null;
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (normalizedBaseUrl && normalizeBaseUrl(activeProfile.apiBaseUrl) !== normalizedBaseUrl) {
    return null;
  }
  return refreshDesktopWsAccessToken(activeProfile, forceRefresh, failureMode, minValidityMs, maxJitterMs);
}

export function applyActiveDesktopWsRefreshPayload(payload: unknown): string | null {
  const activeProfile = currentProfile;
  const transport = activeProfile?.desktopWs;
  if (activeProfile?.transportKind !== 'desktop-ws' || !transport) {
    return null;
  }
  return persistDesktopWsRefresh(activeProfile, transport, readDesktopWsRefreshData(payload));
}

export async function bootstrapAuth(_baseUrl: string): Promise<SessionState | null> {
  const activeProfile = hydrateActiveProfileRuntime();
  if (activeProfile?.transportKind === 'desktop-ws') {
    refreshInFlightByKey.clear();
    const activeBootstrapKey = buildProfileRefreshKey(activeProfile);

    if (bootstrapPromise && bootstrapKey === activeBootstrapKey) {
      return bootstrapPromise;
    }

    setAuthSnapshot({
      isBootstrapping: true,
      session: currentSession
    });

    const task = (async () => {
      const session = await bootstrapDesktopWsAuth(activeProfile);
      setAuthSnapshot({
        isBootstrapping: false,
        session: currentSession
      });
      return session;
    })();

    bootstrapPromise = task;
    bootstrapKey = activeBootstrapKey;
    try {
      return await task;
    } finally {
      if (bootstrapPromise === task) {
        bootstrapPromise = null;
        bootstrapKey = '';
      }
    }
  }

  currentSession = null;
  refreshInFlightByKey.clear();
  bootstrapPromise = null;
  bootstrapKey = '';
  setAuthSnapshot({
    isBootstrapping: false,
    session: null
  });
  return null;
}

export async function restoreSession(baseUrl: string): Promise<SessionState | null> {
  return bootstrapAuth(baseUrl);
}

export async function loginWithPairingPayload(
  pairingPayloadText: string,
  options: LoginWithPairingPayloadOptions = {}
): Promise<SessionState> {
  try {
    const parsedPairing = parsePairingPayload(pairingPayloadText);
    wsDebugRecorder.recordStatus('auth.pairing_payload.valid');
    const session = await loginWithDesktopWsPairingPayload(parsedPairing.payload, options);
    wsDebugRecorder.recordStatus('auth.pairing.success');
    return session;
  } catch (error) {
    if (isAbortError(error)) {
      wsDebugRecorder.recordStatus('auth.pairing.cancelled');
    } else {
      wsDebugRecorder.recordStatus(`auth.pairing.failed:${getDesktopWsAuthErrorCode(error) || 'protocol'}`);
    }
    throw error;
  }
}

async function loginWithDesktopWsPairingPayload(
  pairing: DesktopWsPairingPayload,
  options: LoginWithPairingPayloadOptions
): Promise<SessionState> {
  const normalizedWsUrl = normalizeDesktopWsUrlInput(pairing.wsUrl);
  if (!normalizedWsUrl) {
    throw new Error('Desktop WS 地址必须使用 ws 或 wss');
  }
  const initialTransport: DesktopWsProfileTransport = {
    wsUrl: normalizedWsUrl,
    tokenMode: pairing.tokenMode,
    accessToken: pairing.token,
    accessExpireAtMs: pairing.expiresAtMs
  };
  const client = new DesktopWsAuthClient(initialTransport);

  try {
    await client.connect(options.signal);
    const hello = readDesktopWsHelloData(await client.request('session.hello', {}, options.signal));
    if (options.signal?.aborted) {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      throw error;
    }
    if (hello.deviceId !== pairing.desktopDeviceId) {
      throw new Error('Desktop WS 设备不匹配');
    }

    const transport: DesktopWsProfileTransport = {
      ...initialTransport,
      accessExpireAtMs: hello.authExpiresAtMs || initialTransport.accessExpireAtMs
    };
    const profileResult = upsertDeviceProfile({
      transportKind: 'desktop-ws',
      desktopDeviceId: pairing.desktopDeviceId,
      defaultDisplayName: 'Desktop',
      apiBaseUrl: pairing.apiBaseUrl,
      serverDeviceId: hello.deviceId,
      desktopWs: transport
    });
    applyDeviceProfileRuntime(profileResult.profile);
    cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
    const nextSession = buildSessionFromDesktopWs(profileResult.profile, transport, {
      subject: hello.subject,
      deviceId: hello.deviceId
    });
    setCurrentSession(nextSession);
    return nextSession;
  } finally {
    client.close();
  }
}

export function activateProfile(desktopDeviceId: string): DeviceProfile {
  const profile = setActiveDeviceProfileId(desktopDeviceId);
  if (!profile || profile.transportKind !== 'desktop-ws') {
    throw new Error('profile not found');
  }
  applyDeviceProfileRuntime(profile);
  currentSession = null;
  refreshInFlightByKey.clear();
  bootstrapPromise = null;
  bootstrapKey = '';
  setAuthSnapshot({
    isBootstrapping: false,
    session: null
  });
  return profile;
}

export async function logoutCurrentDevice(_baseUrl = ''): Promise<void> {
  refreshInFlightByKey.clear();
  bootstrapPromise = null;
  bootstrapKey = '';
  clearActiveDeviceProfileAuth();
  currentProfile = null;
  saveDeviceToken('');
  setCurrentSession(null);
}

export function readPreferredDeviceName(effectiveDeviceId: string): string {
  return resolvePreferredDeviceName(readDeviceNameOverride(), effectiveDeviceId);
}

export function updatePreferredDeviceName(deviceName: string): string {
  const normalizedDeviceName = validateDeviceNameOverride(deviceName);
  authStorage.set(DEVICE_NAME_OVERRIDE_KEY, normalizedDeviceName);
  authStorage.delete(LEGACY_DEVICE_NAME_KEY);

  const nextSession = applyDeviceNameToSession(currentSession, normalizedDeviceName);
  if (nextSession !== currentSession) {
    setCurrentSession(nextSession);
  }
  return normalizedDeviceName;
}
