export type OfficialUser = {
  id: number;
  email: string;
  displayName: string;
  avatarUrl: string;
  enabled: boolean;
};
export type AccountSession = {
  accountId: string;
  user: OfficialUser;
  accessToken: string;
  accessExpireAtMs: number;
};
export function parseOfficialUser(value: unknown): OfficialUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid official user');
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'number' ||
    !Number.isSafeInteger(v.id) ||
    v.id <= 0 ||
    typeof v.email !== 'string' ||
    typeof v.displayName !== 'string' ||
    typeof v.avatarUrl !== 'string' ||
    v.enabled !== true
  )
    throw new Error('Invalid official user');
  return { id: v.id, email: v.email, displayName: v.displayName, avatarUrl: v.avatarUrl, enabled: true };
}
export function parseAccountSession(
  value: unknown,
  baseUrl: string,
  expectedUser: OfficialUser,
  nowMs = Date.now()
): AccountSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid official session');
  const v = value as Record<string, unknown>;
  const user = parseOfficialUser(v.user);
  const expires = typeof v.expiresAt === 'string' ? Date.parse(v.expiresAt) : NaN;
  if (
    v.ok !== true ||
    v.tokenType !== 'Bearer' ||
    typeof v.accessToken !== 'string' ||
    !v.accessToken ||
    !Number.isFinite(expires) ||
    expires <= nowMs ||
    user.id !== expectedUser.id
  )
    throw new Error('Invalid official session');
  // A new namespace deliberately does not map or merge former Identity account caches.
  return {
    accountId: `official:${new URL(baseUrl).origin}:${user.id}`,
    user,
    accessToken: v.accessToken,
    accessExpireAtMs: expires
  };
}
