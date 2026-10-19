export type AccountDesktopCacheScopeEntry = {
  accountId: string;
  desktopId: string;
  cacheScopeId: string;
  linkedAtMs: number;
};

export type AccountDesktopCacheScopeSnapshot = {
  version: 2;
  mappings: Record<string, AccountDesktopCacheScopeEntry>;
};

export function createEmptyAccountDesktopCacheScopeSnapshot(): AccountDesktopCacheScopeSnapshot {
  return { version: 2, mappings: {} };
}

export function buildAccountDesktopCacheScopeKey(accountId: string, desktopId: string): string {
  if (!accountId.trim()) throw new Error('Account is required');
  return JSON.stringify([accountId.trim(), desktopId.trim()]);
}

export function normalizeAccountDesktopCacheScopeSnapshot(raw: unknown): AccountDesktopCacheScopeSnapshot {
  const result = createEmptyAccountDesktopCacheScopeSnapshot();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const record = raw as Record<string, unknown>;
  if (record.version !== 2 || !record.mappings || typeof record.mappings !== 'object') return result;
  const usedScopes = new Set<string>();
  for (const value of Object.values(record.mappings)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as AccountDesktopCacheScopeEntry;
    if (
      typeof entry.accountId !== 'string' ||
      !entry.accountId.trim() ||
      typeof entry.desktopId !== 'string' ||
      typeof entry.cacheScopeId !== 'string' ||
      !/^as_[a-zA-Z0-9_-]{1,60}$/u.test(entry.cacheScopeId) ||
      usedScopes.has(entry.cacheScopeId)
    )
      continue;
    result.mappings[buildAccountDesktopCacheScopeKey(entry.accountId, entry.desktopId)] = entry;
    usedScopes.add(entry.cacheScopeId);
  }
  return result;
}

export function resolveAccountDesktopCacheScope(input: {
  snapshot: AccountDesktopCacheScopeSnapshot;
  accountId: string;
  desktopId: string;
  createScopeId: () => string;
  nowMs?: number;
}) {
  const key = buildAccountDesktopCacheScopeKey(input.accountId, input.desktopId);
  const existing = input.snapshot.mappings[key];
  if (existing) return { entry: existing, snapshot: input.snapshot, created: false };
  const entry: AccountDesktopCacheScopeEntry = {
    accountId: input.accountId.trim(),
    desktopId: input.desktopId.trim(),
    cacheScopeId: input.createScopeId(),
    linkedAtMs: input.nowMs ?? Date.now()
  };
  return {
    entry,
    created: true,
    snapshot: { version: 2 as const, mappings: { ...input.snapshot.mappings, [key]: entry } }
  };
}
