import { normalizeApiBaseUrl } from '../config/endpoint.ts';
import {
  normalizeDesktopWsStorageUrl,
  normalizeDesktopWsTokenMode,
  type DesktopWsTokenMode,
} from './desktopWsTransport.ts';

export type DeviceProfileTransportKind = 'http' | 'desktop-ws';
export type { DesktopWsTokenMode };

export type DesktopWsProfileTransport = {
  wsUrl: string;
  tokenMode: DesktopWsTokenMode;
  accessToken: string;
  accessExpireAtMs: number;
};

export interface DeviceProfile {
  transportKind: DeviceProfileTransportKind;
  desktopDeviceId: string;
  displayName: string;
  apiBaseUrl: string;
  deviceToken: string;
  serverDeviceId: string;
  cacheScopeId: string;
  lastUsedAt: number;
  needsRelink: boolean;
  identityCreatedAt: string;
  hostname: string;
  appServerPublicKeySha256: string;
  desktopWs?: DesktopWsProfileTransport;
}

export interface DeviceProfileRegistrySnapshot {
  version: 1;
  activeDesktopDeviceId: string;
  profiles: DeviceProfile[];
}

export interface DeviceProfileWriteResult {
  profile: DeviceProfile;
  evictedCacheScopeIds: string[];
}

export type DeviceProfileInput = {
  transportKind?: DeviceProfileTransportKind;
  desktopDeviceId: string;
  defaultDisplayName: string;
  apiBaseUrl?: string;
  deviceToken?: string;
  serverDeviceId: string;
  identityCreatedAt?: string;
  hostname?: string;
  appServerPublicKeySha256?: string;
  cacheScopeId?: string;
  desktopWs?: DesktopWsProfileTransport;
};

export function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

export function createCacheScopeId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `cs_${timePart}_${randomPart}`;
}

export function normalizeDisplayName(value: string): string {
  return normalizeText(value) || 'Desktop';
}

export function normalizeDeviceProfileTransportKind(value: unknown): DeviceProfileTransportKind {
  return value === 'desktop-ws' ? 'desktop-ws' : 'http';
}

export function normalizeDesktopWsProfileTransport(raw: unknown): DesktopWsProfileTransport | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const wsUrl = normalizeDesktopWsStorageUrl(record.wsUrl);
  const accessToken = normalizeText(record.accessToken);
  const accessExpireAtMs = Number(record.accessExpireAtMs || 0);
  if (!wsUrl || !accessToken || !Number.isFinite(accessExpireAtMs) || accessExpireAtMs <= 0) {
    return undefined;
  }

  return {
    wsUrl,
    tokenMode: normalizeDesktopWsTokenMode(record.tokenMode),
    accessToken,
    accessExpireAtMs,
  };
}

export function normalizeDeviceProfile(raw: unknown): DeviceProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const transportKind = normalizeDeviceProfileTransportKind(record.transportKind);
  const desktopDeviceId = normalizeText(record.desktopDeviceId);
  const displayName = normalizeDisplayName(normalizeText(record.displayName));
  const apiBaseUrl = transportKind === 'http' ? normalizeApiBaseUrl(normalizeText(record.apiBaseUrl)) : '';
  const deviceToken = transportKind === 'http' ? normalizeText(record.deviceToken) : '';
  const serverDeviceId = normalizeText(record.serverDeviceId);
  const cacheScopeId = normalizeText(record.cacheScopeId) || createCacheScopeId();
  const needsRelink = Boolean(record.needsRelink);
  const desktopWs = normalizeDesktopWsProfileTransport(record.desktopWs);

  if (!desktopDeviceId || !serverDeviceId) {
    return null;
  }

  if (transportKind === 'http' && (!apiBaseUrl || (!deviceToken && !needsRelink))) {
    return null;
  }

  if (transportKind === 'desktop-ws' && !desktopWs && !needsRelink) {
    return null;
  }

  return {
    transportKind,
    desktopDeviceId,
    displayName,
    apiBaseUrl,
    deviceToken,
    serverDeviceId,
    cacheScopeId,
    lastUsedAt: Number(record.lastUsedAt || 0) || 0,
    needsRelink,
    identityCreatedAt: normalizeText(record.identityCreatedAt),
    hostname: normalizeText(record.hostname),
    appServerPublicKeySha256: normalizeText(record.appServerPublicKeySha256),
    desktopWs,
  };
}

export function legacyDeviceTokenForProfile(profile: Pick<DeviceProfile, 'transportKind' | 'deviceToken'>): string {
  return profile.transportKind === 'http' ? normalizeText(profile.deviceToken) : '';
}
