import { MMKV } from 'react-native-mmkv';

import { normalizeApiBaseUrl } from '../config/endpoint';
import {
  createCacheScopeId,
  normalizeDesktopWsProfileTransport,
  normalizeDeviceProfile,
  normalizeDeviceProfileTransportKind,
  normalizeDisplayName,
  normalizeText,
  type DesktopWsProfileTransport,
  type DeviceProfile,
  type DeviceProfileInput,
  type DeviceProfileRegistrySnapshot,
  type DeviceProfileWriteResult
} from './deviceProfileModel.ts';

const MAX_RETAINED_DEVICE_CACHE_PROFILES = 3;

export type {
  DesktopWsProfileTransport,
  DesktopWsTokenMode,
  DeviceProfile,
  DeviceProfileRegistrySnapshot,
  DeviceProfileTransportKind,
  DeviceProfileWriteResult
} from './deviceProfileModel.ts';

const profileStorage = new MMKV({ id: 'zenmind-device-profiles' });
const REGISTRY_KEY = 'device_profile_registry_v1';
const MANUAL_PROFILE_PREFIX = 'manual:';
const LEGACY_CACHE_SCOPE_ID = 'legacy';

function readRegistry(): DeviceProfileRegistrySnapshot {
  const raw = profileStorage.getString(REGISTRY_KEY);
  if (!raw) {
    return { version: 1, activeDesktopDeviceId: '', profiles: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceProfileRegistrySnapshot>;
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.map(normalizeDeviceProfile).filter((profile): profile is DeviceProfile => Boolean(profile))
      : [];
    const activeDesktopDeviceId = normalizeText(parsed.activeDesktopDeviceId);
    return {
      version: 1,
      activeDesktopDeviceId: profiles.some((profile) => profile.desktopDeviceId === activeDesktopDeviceId)
        ? activeDesktopDeviceId
        : profiles[0]?.desktopDeviceId || '',
      profiles
    };
  } catch {
    return { version: 1, activeDesktopDeviceId: '', profiles: [] };
  }
}

function writeRegistry(snapshot: DeviceProfileRegistrySnapshot): DeviceProfile[] {
  const seen = new Set<string>();
  const uniqueProfiles = snapshot.profiles
    .filter((profile) => {
      if (seen.has(profile.desktopDeviceId)) {
        return false;
      }
      seen.add(profile.desktopDeviceId);
      return true;
    })
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt);
  const profiles = uniqueProfiles.slice(0, MAX_RETAINED_DEVICE_CACHE_PROFILES);
  const evictedProfiles = uniqueProfiles.slice(MAX_RETAINED_DEVICE_CACHE_PROFILES);
  const activeDesktopDeviceId = profiles.some((profile) => profile.desktopDeviceId === snapshot.activeDesktopDeviceId)
    ? snapshot.activeDesktopDeviceId
    : profiles[0]?.desktopDeviceId || '';

  profileStorage.set(
    REGISTRY_KEY,
    JSON.stringify({
      version: 1,
      activeDesktopDeviceId,
      profiles
    })
  );
  return evictedProfiles;
}

function resolveUniqueDisplayName(baseName: string, profiles: DeviceProfile[], excludeDesktopDeviceId = '') {
  const base = normalizeDisplayName(baseName);
  const used = new Set(
    profiles
      .filter((profile) => profile.desktopDeviceId !== excludeDesktopDeviceId)
      .map((profile) => profile.displayName)
  );
  if (!used.has(base)) {
    return base;
  }
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base} +${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${base} +${Date.now().toString(36)}`;
}

export function listDeviceProfiles(): DeviceProfile[] {
  return readRegistry().profiles;
}

export function getActiveDeviceProfile(): DeviceProfile | null {
  const snapshot = readRegistry();
  return (
    snapshot.profiles.find((profile) => profile.desktopDeviceId === snapshot.activeDesktopDeviceId) ??
    snapshot.profiles[0] ??
    null
  );
}

export function setActiveDeviceProfileId(desktopDeviceId: string): DeviceProfile | null {
  const snapshot = readRegistry();
  const normalizedId = normalizeText(desktopDeviceId);
  const profile = snapshot.profiles.find((item) => item.desktopDeviceId === normalizedId) ?? null;
  if (!profile) {
    return null;
  }
  const now = Date.now();
  writeRegistry({
    ...snapshot,
    activeDesktopDeviceId: profile.desktopDeviceId,
    profiles: snapshot.profiles.map((item) =>
      item.desktopDeviceId === profile.desktopDeviceId ? { ...item, lastUsedAt: now } : item
    )
  });
  return { ...profile, lastUsedAt: now };
}

export function upsertDeviceProfile(input: DeviceProfileInput): DeviceProfileWriteResult {
  const snapshot = readRegistry();
  const desktopDeviceId = normalizeText(input.desktopDeviceId);
  if (!desktopDeviceId) {
    throw new Error('desktopDeviceId is required');
  }
  const now = Date.now();
  const existing = snapshot.profiles.find((profile) => profile.desktopDeviceId === desktopDeviceId);
  const defaultDisplayName = normalizeDisplayName(input.defaultDisplayName);
  const transportKind = normalizeDeviceProfileTransportKind(input.transportKind);
  const desktopWs = transportKind === 'desktop-ws' ? normalizeDesktopWsProfileTransport(input.desktopWs) : undefined;
  const apiBaseUrl = transportKind === 'http' ? normalizeApiBaseUrl(normalizeText(input.apiBaseUrl)) : '';
  const deviceToken = transportKind === 'http' ? normalizeText(input.deviceToken) : '';
  const serverDeviceId = normalizeText(input.serverDeviceId);
  if (!serverDeviceId) {
    throw new Error('serverDeviceId is required');
  }
  if (transportKind === 'http' && (!apiBaseUrl || !deviceToken)) {
    throw new Error('HTTP device profile requires apiBaseUrl and deviceToken');
  }
  if (transportKind === 'desktop-ws' && !desktopWs) {
    throw new Error('Desktop WS device profile requires transport credentials');
  }
  const nextProfile: DeviceProfile = {
    transportKind,
    desktopDeviceId,
    displayName: existing?.displayName || resolveUniqueDisplayName(defaultDisplayName, snapshot.profiles),
    apiBaseUrl,
    deviceToken,
    serverDeviceId,
    cacheScopeId: existing?.cacheScopeId || normalizeText(input.cacheScopeId) || createCacheScopeId(),
    lastUsedAt: now,
    needsRelink: false,
    identityCreatedAt: normalizeText(input.identityCreatedAt),
    hostname: normalizeText(input.hostname),
    appServerPublicKeySha256: normalizeText(input.appServerPublicKeySha256),
    desktopWs
  };
  const profiles = existing
    ? snapshot.profiles.map((profile) => (profile.desktopDeviceId === desktopDeviceId ? nextProfile : profile))
    : [nextProfile, ...snapshot.profiles];
  const evictedProfiles = writeRegistry({
    version: 1,
    activeDesktopDeviceId: desktopDeviceId,
    profiles
  });
  return {
    profile: nextProfile,
    evictedCacheScopeIds: evictedProfiles.map((profile) => profile.cacheScopeId)
  };
}

export function upsertManualDeviceProfile(input: {
  apiBaseUrl: string;
  deviceToken: string;
  serverDeviceId: string;
  deviceName: string;
}): DeviceProfileWriteResult {
  const snapshot = readRegistry();
  const desktopDeviceId = `${MANUAL_PROFILE_PREFIX}${normalizeText(input.serverDeviceId)}`;
  const useLegacyScope = snapshot.profiles.length === 0;
  return upsertDeviceProfile({
    desktopDeviceId,
    defaultDisplayName: input.deviceName || 'Manual login',
    apiBaseUrl: input.apiBaseUrl,
    deviceToken: input.deviceToken,
    serverDeviceId: input.serverDeviceId,
    cacheScopeId: useLegacyScope ? LEGACY_CACHE_SCOPE_ID : undefined
  });
}

export function updateActiveDeviceProfileAuth(input: {
  deviceToken?: string;
  serverDeviceId?: string;
  apiBaseUrl?: string;
  desktopWs?: DesktopWsProfileTransport;
}): DeviceProfileWriteResult | null {
  const snapshot = readRegistry();
  const activeId = snapshot.activeDesktopDeviceId;
  if (!activeId) {
    return null;
  }
  let updated: DeviceProfile | null = null;
  const profiles = snapshot.profiles.map((profile) => {
    if (profile.desktopDeviceId !== activeId) {
      return profile;
    }
    const desktopWs =
      profile.transportKind === 'desktop-ws'
        ? normalizeDesktopWsProfileTransport(input.desktopWs) || profile.desktopWs
        : undefined;
    updated = {
      ...profile,
      deviceToken: profile.transportKind === 'http' ? normalizeText(input.deviceToken) || profile.deviceToken : '',
      serverDeviceId: normalizeText(input.serverDeviceId) || profile.serverDeviceId,
      apiBaseUrl:
        profile.transportKind === 'http' && input.apiBaseUrl
          ? normalizeApiBaseUrl(input.apiBaseUrl)
          : profile.apiBaseUrl,
      desktopWs,
      lastUsedAt: Date.now(),
      needsRelink: false
    };
    return updated;
  });
  if (!updated) {
    return null;
  }
  const evictedProfiles = writeRegistry({ ...snapshot, profiles });
  return {
    profile: updated,
    evictedCacheScopeIds: evictedProfiles.map((profile) => profile.cacheScopeId)
  };
}

export function clearActiveDeviceProfileAuth() {
  const snapshot = readRegistry();
  const activeId = snapshot.activeDesktopDeviceId;
  if (!activeId) {
    return null;
  }
  let updated: DeviceProfile | null = null;
  const profiles = snapshot.profiles.map((profile) => {
    if (profile.desktopDeviceId !== activeId) {
      return profile;
    }
    updated = {
      ...profile,
      deviceToken: '',
      desktopWs: undefined,
      needsRelink: true,
      lastUsedAt: Date.now()
    };
    return updated;
  });
  if (updated) {
    writeRegistry({ ...snapshot, profiles });
  }
  return updated;
}

export const markActiveDeviceProfileNeedsRelink = clearActiveDeviceProfileAuth;
