import { createCacheScopeId, normalizeText, type DeviceProfile } from './deviceProfileModel.ts';

export type AccountDesktopCacheScopeEntry = {
  accountId: string;
  desktopId: string;
  cacheScopeId: string;
  source: 'legacy-profile' | 'new';
  legacyProfileId?: string;
  linkedAtMs: number;
};

export type AccountDesktopCacheScopeSnapshot = {
  version: 1;
  mappings: Record<string, AccountDesktopCacheScopeEntry>;
};

export type CacheScopeResolution =
  | {
      result: 'resolved';
      entry: AccountDesktopCacheScopeEntry;
      snapshot: AccountDesktopCacheScopeSnapshot;
      created: boolean;
    }
  | {
      result: 'conflict';
      conflictingScopeIds: string[];
      snapshot: AccountDesktopCacheScopeSnapshot;
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CACHE_SCOPE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/u;
export const LEGACY_DEFAULT_CACHE_SCOPE_ID = 'legacy';

export function createEmptyAccountDesktopCacheScopeSnapshot(): AccountDesktopCacheScopeSnapshot {
  return { version: 1, mappings: {} };
}

export function buildAccountDesktopCacheScopeKey(accountId: string, desktopId: string): string {
  const normalizedAccountId = normalizeText(accountId);
  const normalizedDesktopId = normalizeText(desktopId).toLowerCase();
  if (!normalizedAccountId || !UUID_PATTERN.test(normalizedDesktopId)) {
    throw new Error('accountId and canonical desktopId are required');
  }
  return `${normalizedAccountId.length}:${normalizedAccountId}:${normalizedDesktopId}`;
}

export function normalizeAccountDesktopCacheScopeSnapshot(raw: unknown): AccountDesktopCacheScopeSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyAccountDesktopCacheScopeSnapshot();
  }
  const record = raw as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !record.mappings ||
    typeof record.mappings !== 'object' ||
    Array.isArray(record.mappings)
  ) {
    return createEmptyAccountDesktopCacheScopeSnapshot();
  }
  const mappings: Record<string, AccountDesktopCacheScopeEntry> = {};
  for (const value of Object.values(record.mappings as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue;
    }
    const entry = value as Partial<AccountDesktopCacheScopeEntry>;
    const accountId = normalizeText(entry.accountId);
    const desktopId = normalizeText(entry.desktopId).toLowerCase();
    const cacheScopeId = normalizeText(entry.cacheScopeId);
    if (!accountId || !UUID_PATTERN.test(desktopId) || !CACHE_SCOPE_PATTERN.test(cacheScopeId)) {
      continue;
    }
    const source = entry.source === 'legacy-profile' ? 'legacy-profile' : 'new';
    const normalized: AccountDesktopCacheScopeEntry = {
      accountId,
      desktopId,
      cacheScopeId,
      source,
      ...(source === 'legacy-profile' && normalizeText(entry.legacyProfileId)
        ? { legacyProfileId: normalizeText(entry.legacyProfileId) }
        : {}),
      linkedAtMs: Number.isSafeInteger(entry.linkedAtMs) && Number(entry.linkedAtMs) > 0 ? Number(entry.linkedAtMs) : 0
    };
    mappings[buildAccountDesktopCacheScopeKey(accountId, desktopId)] = normalized;
  }
  return { version: 1, mappings };
}

export function resolveAccountDesktopCacheScope(input: {
  snapshot: AccountDesktopCacheScopeSnapshot;
  accountId: string;
  desktopId: string;
  legacyProfiles: ReadonlyArray<Pick<DeviceProfile, 'desktopDeviceId' | 'serverDeviceId' | 'cacheScopeId'>>;
  nowMs?: number;
  createScopeId?: () => string;
}): CacheScopeResolution {
  const accountId = normalizeText(input.accountId);
  const desktopId = normalizeText(input.desktopId).toLowerCase();
  const key = buildAccountDesktopCacheScopeKey(accountId, desktopId);
  const existing = input.snapshot.mappings[key];
  if (existing) {
    return { result: 'resolved', entry: existing, snapshot: input.snapshot, created: false };
  }

  const exactMatches = input.legacyProfiles.filter(
    (profile) =>
      normalizeText(profile.serverDeviceId).toLowerCase() === desktopId &&
      normalizeText(profile.cacheScopeId) !== LEGACY_DEFAULT_CACHE_SCOPE_ID &&
      CACHE_SCOPE_PATTERN.test(normalizeText(profile.cacheScopeId))
  );
  const scopeIds = [...new Set(exactMatches.map((profile) => normalizeText(profile.cacheScopeId)))];
  if (scopeIds.length > 1) {
    return { result: 'conflict', conflictingScopeIds: scopeIds.sort(), snapshot: input.snapshot };
  }

  const matchingProfile =
    scopeIds.length === 1
      ? exactMatches.find((profile) => normalizeText(profile.cacheScopeId) === scopeIds[0])
      : undefined;
  const entry: AccountDesktopCacheScopeEntry = {
    accountId,
    desktopId,
    cacheScopeId: scopeIds[0] || (input.createScopeId ?? createCacheScopeId)(),
    source: matchingProfile ? 'legacy-profile' : 'new',
    ...(matchingProfile ? { legacyProfileId: matchingProfile.desktopDeviceId } : {}),
    linkedAtMs: input.nowMs ?? Date.now()
  };
  const snapshot: AccountDesktopCacheScopeSnapshot = {
    version: 1,
    mappings: { ...input.snapshot.mappings, [key]: entry }
  };
  return { result: 'resolved', entry, snapshot, created: true };
}

export function listUnassignedLegacyCacheScopes(
  snapshot: AccountDesktopCacheScopeSnapshot,
  profiles: ReadonlyArray<Pick<DeviceProfile, 'desktopDeviceId' | 'cacheScopeId'>>
): Array<{ legacyProfileId: string; cacheScopeId: string }> {
  const assignedScopes = new Set(Object.values(snapshot.mappings).map((entry) => entry.cacheScopeId));
  const seen = new Set<string>();
  const result: Array<{ legacyProfileId: string; cacheScopeId: string }> = [];
  for (const profile of profiles) {
    const cacheScopeId = normalizeText(profile.cacheScopeId);
    if (!CACHE_SCOPE_PATTERN.test(cacheScopeId) || assignedScopes.has(cacheScopeId) || seen.has(cacheScopeId)) {
      continue;
    }
    seen.add(cacheScopeId);
    result.push({ legacyProfileId: profile.desktopDeviceId, cacheScopeId });
  }
  return result;
}
