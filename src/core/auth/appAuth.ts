import { saveStoredApiBaseUrl } from './authConfig';
import { Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';

import { logHttpError, logHttpRequest, logHttpResponse } from '../debug/httpDebugLogger';
import {
  clearActiveDeviceProfileAuth,
  getActiveDeviceProfile,
  setActiveDeviceProfileId,
  updateActiveDeviceProfileAuth,
  upsertDeviceProfile,
  upsertManualDeviceProfile,
  type DesktopWsProfileTransport,
  type DeviceProfile
} from './deviceProfiles';
import {
  buildDesktopTokenTransport,
  normalizeDesktopWsUrlInput,
  parsePairingPayload,
  type DesktopWsPairingPayload,
  type LegacyPairingPayload as PairingPayload
} from './desktopWsProtocol';
import { legacyDeviceTokenForProfile } from './deviceProfileModel.ts';
import { buildMasterPasswordLoginRequest, buildPairingClaimRequest } from './authRequestModel.ts';

const authStorage = new MMKV({ id: 'zenmind-auth-session' });

const DEVICE_TOKEN_KEY = 'auth_device_token_v1';
const DEVICE_NAME_KEY = 'auth_device_name_v1';
const DEFAULT_TOKEN_MIN_VALIDITY_MS = 90_000;
const DEFAULT_TOKEN_JITTER_MS = 8_000;
const FALLBACK_TOKEN_VALIDITY_MS = 5 * 60_000;
const DESKTOP_WS_NAMESPACE = 'd';
const DESKTOP_WS_CONNECT_TIMEOUT_MS = 8_000;
const DESKTOP_WS_REQUEST_TIMEOUT_MS = 8_000;

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

type DesktopWsRequestFrame = {
  ns: typeof DESKTOP_WS_NAMESPACE;
  frame: 'request';
  type: string;
  id: string;
  payload: Record<string, unknown>;
};

type DesktopWsInboundFrame = {
  ns?: string;
  frame?: string;
  type?: string;
  id?: string;
  code?: number | string;
  status?: number;
  msg?: string;
  error?: string;
  data?: unknown;
};

type DesktopWsHelloData = {
  deviceId: string;
  subject: string;
  authExpiresAtMs: number;
};

type DesktopWsRefreshData = {
  accessToken: string;
  accessExpireAtMs: number;
};

type WebSocketLikeMessageEvent = {
  data?: unknown;
};

type WebSocketLikeCloseEvent = {
  code?: number;
  reason?: string;
};

type WebSocketLike = {
  readyState: number;
  send: (payload: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: WebSocketLikeMessageEvent) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: WebSocketLikeCloseEvent) => void) | null;
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
let currentBaseUrl = '';
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

function defaultDisplayNameFromPairing(payload: PairingPayload | PairingClaimResponse): string {
  return String(payload.desktopUsername || '').trim() || String(payload.desktopHostname || '').trim() || 'Desktop';
}

function buildProfileRefreshKey(profile: DeviceProfile): string {
  return `${profile.transportKind}:${profile.desktopDeviceId}`;
}

function buildHttpRefreshKey(baseUrl: string): string {
  if (currentProfile?.transportKind === 'http' && !currentProfile.needsRelink) {
    return buildProfileRefreshKey(currentProfile);
  }
  return `http:${normalizeBaseUrl(baseUrl)}`;
}

function isHttpRefreshStillCurrent(refreshKey: string, baseUrl: string): boolean {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (currentProfile?.transportKind === 'desktop-ws') {
    return false;
  }

  if (currentProfile?.transportKind === 'http' && !currentProfile.needsRelink) {
    return currentProfile.apiBaseUrl === normalizedBaseUrl && refreshKey === buildProfileRefreshKey(currentProfile);
  }

  return currentBaseUrl === normalizedBaseUrl && refreshKey === `http:${normalizedBaseUrl}`;
}

function isCurrentProfile(profile: DeviceProfile): boolean {
  return (
    currentProfile?.transportKind === profile.transportKind &&
    currentProfile.desktopDeviceId === profile.desktopDeviceId
  );
}

function applyDeviceProfileRuntime(profile: DeviceProfile) {
  currentProfile = profile;
  currentBaseUrl = normalizeBaseUrl(profile.apiBaseUrl);
  authCacheRuntime.switchScope(profile.cacheScopeId);
  if (currentBaseUrl) {
    saveStoredApiBaseUrl(currentBaseUrl);
  } else {
    saveStoredApiBaseUrl('');
  }
  saveDeviceToken(legacyDeviceTokenForProfile(profile));
}

function hydrateActiveProfileRuntime(): DeviceProfile | null {
  const profile = getActiveDeviceProfile();
  if (!profile || profile.needsRelink) {
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

function resolveAccessExpireAtMs(payload: LoginResponse | RefreshResponse): number {
  const candidates = [payload.accessTokenExpireAtMs, payload.accessTokenExpireAt, payload.accessExpireAt];

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

async function requestJson<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
  const url = `${baseUrl}${path}`;
  const method = String(options.method || 'GET');
  const startedAt = Date.now();

  logHttpRequest({
    url,
    method,
    body: options.body
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
      error
    });
    throw error;
  }

  logHttpResponse({
    url,
    method,
    status: response.status,
    durationMs: Date.now() - startedAt,
    payload
  });

  if (!response.ok) {
    throw new Error(resolveErrorMessage(response.status, payload));
  }

  return payload as T;
}

function normalizeDesktopWsUrl(
  wsUrl: string,
  tokenMode: DesktopWsProfileTransport['tokenMode'],
  accessToken: string
): { url: string; protocol?: string } {
  const normalizedToken = String(accessToken || '').trim();
  if (!normalizedToken) {
    throw new Error('Desktop WS token is missing');
  }

  const transport = buildDesktopTokenTransport(wsUrl, tokenMode, normalizedToken);
  if (!transport.url) {
    throw new Error('Desktop WS 地址必须使用 ws 或 wss');
  }
  return {
    url: transport.url,
    protocol: transport.protocols?.[0]
  };
}

function createDesktopWsRequestId(type: string): string {
  return `dws-${type.replace(/[^a-z0-9]+/giu, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFrameCode(frame: DesktopWsInboundFrame): number {
  if (typeof frame.code === 'number' && Number.isFinite(frame.code)) {
    return frame.code;
  }
  const parsed = Number(frame.code);
  return Number.isFinite(parsed) ? parsed : 0;
}

function frameToError(frame: DesktopWsInboundFrame): Error {
  const message = String(frame.msg || frame.error || '').trim();
  return new Error(message || (frame.status ? `Desktop WS ${frame.status}` : 'Desktop WS request failed'));
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

class DesktopWsTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesktopWsTransportError';
  }
}

function isDesktopWsTransportError(error: unknown): boolean {
  return error instanceof DesktopWsTransportError;
}

class DesktopWsAuthClient {
  private socket: WebSocketLike | null = null;
  private expectedClose = false;
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly transport: DesktopWsProfileTransport) {}

  connect(): Promise<void> {
    const { url, protocol } = normalizeDesktopWsUrl(
      this.transport.wsUrl,
      this.transport.tokenMode,
      this.transport.accessToken
    );

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        this.close(1002, 'desktop ws connect timeout');
        reject(new DesktopWsTransportError('Desktop WS 连接超时'));
      }, DESKTOP_WS_CONNECT_TIMEOUT_MS);

      const finish = () => {
        if (settled) {
          return false;
        }
        settled = true;
        clearTimeout(timer);
        return true;
      };

      const socket = protocol
        ? (new WebSocket(url, protocol) as unknown as WebSocketLike)
        : (new WebSocket(url) as unknown as WebSocketLike);
      this.socket = socket;

      socket.onopen = () => {
        if (!finish()) {
          return;
        }
        socket.onmessage = (event) => this.handleMessage(event);
        socket.onclose = (event) => this.handleClose(event);
        socket.onerror = () => this.handleError();
        resolve();
      };

      socket.onerror = () => {
        if (!finish()) {
          return;
        }
        this.socket = null;
        reject(new DesktopWsTransportError('Desktop WS 连接失败'));
      };

      socket.onclose = () => {
        if (!finish()) {
          return;
        }
        this.socket = null;
        reject(new DesktopWsTransportError('Desktop WS 已断开'));
      };
    });
  }

  request<T>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    if (!this.socket || this.socket.readyState !== 1) {
      return Promise.reject(new DesktopWsTransportError('Desktop WS 未连接'));
    }

    const id = createDesktopWsRequestId(type);
    const frame: DesktopWsRequestFrame = {
      ns: DESKTOP_WS_NAMESPACE,
      frame: 'request',
      type,
      id,
      payload
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new DesktopWsTransportError(`Desktop WS 请求超时: ${type}`));
      }, DESKTOP_WS_REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
        timer
      });

      try {
        this.socket?.send(JSON.stringify(frame));
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(error instanceof Error ? new DesktopWsTransportError(error.message) : error);
      }
    });
  }

  close(code = 1000, reason = 'desktop ws auth done') {
    this.expectedClose = true;
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      if (socket.readyState <= 1) {
        socket.close(code, reason);
      }
    } catch {
      // Best-effort close for short-lived auth sockets.
    }
  }

  private handleMessage(event: WebSocketLikeMessageEvent) {
    const raw = typeof event.data === 'string' ? event.data : String(event.data || '');
    let frame: DesktopWsInboundFrame;
    try {
      frame = JSON.parse(raw) as DesktopWsInboundFrame;
    } catch {
      return;
    }

    if (!frame.id || (frame.frame !== 'response' && frame.frame !== 'error')) {
      return;
    }

    const pending = this.pendingRequests.get(frame.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(frame.id);
    if (frame.frame === 'error' || getFrameCode(frame) !== 0) {
      pending.reject(frameToError(frame));
      return;
    }

    pending.resolve(frame.data);
  }

  private handleClose(_event?: WebSocketLikeCloseEvent) {
    this.socket = null;
    if (!this.expectedClose) {
      this.rejectPending(new DesktopWsTransportError('Desktop WS 已断开'));
    }
  }

  private handleError() {
    this.rejectPending(new DesktopWsTransportError('Desktop WS 连接错误'));
  }

  private rejectPending(error: Error) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }
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
  clearActiveDeviceProfileAuth();
  currentProfile = null;
  saveDeviceToken('');
  setCurrentSession(null);
}

function ensureBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (normalizedBaseUrl === currentBaseUrl) {
    return normalizedBaseUrl;
  }

  const preservedProfile =
    currentProfile?.transportKind === 'http' && currentProfile.apiBaseUrl === normalizedBaseUrl ? currentProfile : null;
  currentBaseUrl = normalizedBaseUrl;
  currentProfile = preservedProfile;
  currentSession = null;
  refreshInFlightByKey.clear();
  bootstrapPromise = null;
  bootstrapKey = '';
  setAuthSnapshot({
    isBootstrapping: false,
    session: null
  });
  return normalizedBaseUrl;
}

function setCurrentSession(session: SessionState | null, isBootstrapping = false) {
  currentSession = session;
  setAuthSnapshot({
    isBootstrapping,
    session
  });
}

function buildSessionFromLogin(payload: LoginResponse, fallbackDeviceName: string): SessionState {
  return {
    username: String(payload.username || 'app'),
    deviceId: String(payload.deviceId || ''),
    deviceName: String(payload.deviceName || fallbackDeviceName || 'Device'),
    accessToken: String(payload.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(payload),
    deviceToken: String(payload.deviceToken || '')
  };
}

function buildSessionFromRefresh(payload: RefreshResponse): SessionState {
  return {
    username: currentSession?.username || 'app',
    deviceId: String(payload.deviceId || currentSession?.deviceId || ''),
    deviceName: currentSession?.deviceName || readPreferredDeviceName(),
    accessToken: String(payload.accessToken || ''),
    accessExpireAtMs: resolveAccessExpireAtMs(payload),
    deviceToken: String(payload.deviceToken || currentSession?.deviceToken || '')
  };
}

function buildSessionFromDesktopWs(
  profile: DeviceProfile,
  transport: DesktopWsProfileTransport,
  input: {
    deviceName?: string;
    subject?: string;
    deviceId?: string;
  } = {}
): SessionState {
  return {
    username: String(input.subject || currentSession?.username || 'app'),
    deviceId: String(input.deviceId || profile.serverDeviceId || profile.desktopDeviceId),
    deviceName: String(input.deviceName || currentSession?.deviceName || readPreferredDeviceName()),
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

async function refreshAccessToken(
  baseUrl: string,
  forceRefresh: boolean,
  failureMode: RefreshFailureMode
): Promise<string | null> {
  if (currentProfile?.transportKind === 'desktop-ws') {
    return null;
  }

  const normalizedBaseUrl = ensureBaseUrl(baseUrl);
  const refreshKey = buildHttpRefreshKey(normalizedBaseUrl);
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

  const inFlight = refreshInFlightByKey.get(refreshKey);
  if (inFlight) {
    const token = await inFlight.promise;
    if (token || failureMode !== 'hard' || inFlight.failureMode === 'hard') {
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceToken })
      });

      const nextSession = buildSessionFromRefresh(payload);
      if (!isHttpRefreshStillCurrent(refreshKey, normalizedBaseUrl)) {
        return null;
      }
      saveDeviceToken(nextSession.deviceToken);
      savePreferredDeviceName(nextSession.deviceName);
      const profileResult = updateActiveDeviceProfileAuth({
        apiBaseUrl: normalizedBaseUrl,
        deviceToken: nextSession.deviceToken,
        serverDeviceId: nextSession.deviceId
      });
      if (profileResult) {
        currentProfile = profileResult.profile;
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

  refreshInFlightByKey.set(refreshKey, { failureMode, promise: refreshTask });
  try {
    return await refreshTask;
  } finally {
    if (refreshInFlightByKey.get(refreshKey)?.promise === refreshTask) {
      refreshInFlightByKey.delete(refreshKey);
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

export async function getAccessTokenForRequest(baseUrl: string, forceRefresh = false): Promise<string | null> {
  const activeProfile = currentProfile;
  if (activeProfile?.transportKind === 'desktop-ws') {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    if (!normalizedBaseUrl || normalizeBaseUrl(activeProfile.apiBaseUrl) !== normalizedBaseUrl) {
      return null;
    }
    return refreshDesktopWsAccessToken(activeProfile, forceRefresh, 'hard');
  }

  return refreshAccessToken(baseUrl, forceRefresh, 'hard');
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

  if (activeProfile?.transportKind === 'desktop-ws') {
    return refreshDesktopWsAccessToken(activeProfile, forceRefresh, failureMode, minValidityMs, maxJitterMs);
  }

  const normalizedBaseUrl = ensureBaseUrl(baseUrl);

  if (!forceRefresh && currentSession && currentSession.accessToken) {
    const remainingMs = currentSession.accessExpireAtMs - Date.now();
    if (remainingMs > minValidityMs + getRandomJitterMs(maxJitterMs)) {
      return currentSession.accessToken;
    }
  }

  return refreshAccessToken(normalizedBaseUrl, true, failureMode);
}

export function applyActiveDesktopWsRefreshPayload(payload: unknown): string | null {
  const activeProfile = currentProfile;
  const transport = activeProfile?.desktopWs;
  if (activeProfile?.transportKind !== 'desktop-ws' || !transport) {
    return null;
  }
  return persistDesktopWsRefresh(activeProfile, transport, readDesktopWsRefreshData(payload));
}

export async function bootstrapAuth(baseUrl: string): Promise<SessionState | null> {
  const activeProfile = hydrateActiveProfileRuntime();
  if (activeProfile?.transportKind === 'desktop-ws') {
    currentBaseUrl = '';
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

  const normalizedBaseUrl = normalizeBaseUrl(activeProfile?.apiBaseUrl || baseUrl);
  if (!normalizedBaseUrl) {
    ensureBaseUrl('');
    setCurrentSession(null);
    return null;
  }

  ensureBaseUrl(normalizedBaseUrl);
  const activeBootstrapKey = buildHttpRefreshKey(normalizedBaseUrl);

  if (bootstrapPromise && bootstrapKey === activeBootstrapKey) {
    return bootstrapPromise;
  }

  setAuthSnapshot({
    isBootstrapping: true,
    session: currentSession
  });

  const task = (async () => {
    const accessToken = await refreshAccessToken(normalizedBaseUrl, true, 'hard');
    setAuthSnapshot({
      isBootstrapping: false,
      session: currentSession
    });
    return accessToken && currentSession ? currentSession : null;
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

  const request = buildMasterPasswordLoginRequest(masterPassword, deviceName, getDefaultDeviceName());
  const payload = await requestJson<LoginResponse>(normalizedBaseUrl, request.path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request.body)
  });

  const nextSession = buildSessionFromLogin(payload, request.deviceName);
  const profileResult = upsertManualDeviceProfile({
    apiBaseUrl: normalizedBaseUrl,
    deviceName: nextSession.deviceName,
    deviceToken: nextSession.deviceToken,
    serverDeviceId: nextSession.deviceId
  });
  applyDeviceProfileRuntime(profileResult.profile);
  cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
  savePreferredDeviceName(nextSession.deviceName);
  setCurrentSession(nextSession);
  return nextSession;
}

export async function loginWithPairingPayload(pairingPayloadText: string, deviceName: string): Promise<SessionState> {
  const parsedPairing = parsePairingPayload(pairingPayloadText);
  if (parsedPairing.transportKind === 'desktop-ws') {
    return loginWithDesktopWsPairingPayload(parsedPairing.payload, deviceName);
  }

  const pairing = parsedPairing.payload;
  const normalizedBaseUrl = ensureBaseUrl(pairing.apiBaseUrl);
  if (!normalizedBaseUrl) {
    throw new Error('二维码缺少服务地址');
  }

  const request = buildPairingClaimRequest(pairing.pairingId, pairing.secret, deviceName, getDefaultDeviceName());
  const payload = await requestJson<PairingClaimResponse>(normalizedBaseUrl, request.path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request.body)
  });

  const nextSession = buildSessionFromLogin(payload, request.deviceName);
  const apiBaseUrl = normalizeBaseUrl(payload.apiBaseUrl || pairing.apiBaseUrl);
  const profileResult = upsertDeviceProfile({
    desktopDeviceId: payload.desktopDeviceId || pairing.desktopDeviceId,
    defaultDisplayName: defaultDisplayNameFromPairing(payload) || defaultDisplayNameFromPairing(pairing),
    apiBaseUrl,
    deviceToken: nextSession.deviceToken,
    serverDeviceId: nextSession.deviceId,
    identityCreatedAt: payload.desktopIdentityCreatedAt || pairing.desktopIdentityCreatedAt,
    hostname: payload.desktopHostname || pairing.desktopHostname,
    appServerPublicKeySha256: payload.appServerPublicKeySha256 || pairing.appServerPublicKeySha256
  });
  applyDeviceProfileRuntime(profileResult.profile);
  cleanupEvictedDeviceCaches(profileResult.evictedCacheScopeIds);
  savePreferredDeviceName(nextSession.deviceName);
  setCurrentSession(nextSession);
  return nextSession;
}

async function loginWithDesktopWsPairingPayload(
  pairing: DesktopWsPairingPayload,
  deviceName: string
): Promise<SessionState> {
  const normalizedWsUrl = normalizeDesktopWsUrlInput(pairing.wsUrl);
  if (!normalizedWsUrl) {
    throw new Error('Desktop WS 地址必须使用 ws 或 wss');
  }
  const normalizedDeviceName = String(deviceName || '').trim() || getDefaultDeviceName();
  const initialTransport: DesktopWsProfileTransport = {
    wsUrl: normalizedWsUrl,
    tokenMode: pairing.tokenMode,
    accessToken: pairing.token,
    accessExpireAtMs: pairing.expiresAtMs
  };
  const client = new DesktopWsAuthClient(initialTransport);

  try {
    await client.connect();
    const hello = readDesktopWsHelloData(await client.request('session.hello'));
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
    savePreferredDeviceName(normalizedDeviceName);

    const nextSession = buildSessionFromDesktopWs(profileResult.profile, transport, {
      deviceName: normalizedDeviceName,
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
  if (!profile) {
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

export async function logoutCurrentDevice(baseUrl: string): Promise<void> {
  const activeProfile = currentProfile ?? getActiveDeviceProfile();
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const token = currentSession?.accessToken || '';

  try {
    if (activeProfile?.transportKind !== 'desktop-ws' && normalizedBaseUrl && token) {
      await requestJson<unknown>(normalizedBaseUrl, '/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  } catch {
    // Ignore network failures and continue clearing local session.
  }

  refreshInFlightByKey.clear();
  bootstrapPromise = null;
  bootstrapKey = '';
  clearActiveDeviceProfileAuth();
  currentProfile = null;
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
