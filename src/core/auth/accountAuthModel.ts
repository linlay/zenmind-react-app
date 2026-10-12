const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export type AccountSession = {
  schemaVersion: 1;
  accountId: string;
  username: string;
  deviceId: string;
  deviceName: string;
  accessToken: string;
  accessExpireAtMs: number;
  deviceToken: string;
};
function requiredText(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string' || !result.trim()) throw new Error(`Invalid account session: ${key} is required`);
  return result.trim();
}
export function parseAccountSession(value: unknown, nowMs = Date.now()): AccountSession {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('schemaVersion' in value) ||
    value.schemaVersion !== 1
  )
    throw new Error('Unsupported account session schema');
  const payload = value as Record<string, unknown>;
  const deviceId = requiredText(payload, 'deviceId');
  const deviceName = requiredText(payload, 'deviceName');
  const accessExpireAtMs = Date.parse(requiredText(payload, 'accessTokenExpireAt'));
  if (
    !UUID_PATTERN.test(deviceId) ||
    [...deviceName].length > 64 ||
    !Number.isFinite(accessExpireAtMs) ||
    accessExpireAtMs <= nowMs
  )
    throw new Error('Invalid account session identity or expiry');
  return {
    schemaVersion: 1,
    accountId: requiredText(payload, 'accountId'),
    username: requiredText(payload, 'username'),
    deviceId,
    deviceName,
    accessToken: requiredText(payload, 'accessToken'),
    accessExpireAtMs,
    deviceToken: requiredText(payload, 'deviceToken')
  };
}
