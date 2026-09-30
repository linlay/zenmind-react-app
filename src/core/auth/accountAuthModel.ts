import type { DeviceKind, TrustLevel } from '../api/contracts/deviceLink.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEVICE_KINDS = new Set<DeviceKind>(['mobile', 'desktop']);
const TRUST_LEVELS = new Set<TrustLevel>(['session', 'trusted', 'fully_trusted']);

export type AccountSession = {
  schemaVersion: 1;
  accountId: string;
  username: string;
  deviceId: string;
  deviceKind: DeviceKind;
  deviceName: string;
  trustLevel: TrustLevel;
  accessToken: string;
  accessExpireAtMs: number;
  deviceToken?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid account session: ${key} is required`);
  }
  return value.trim();
}

export function parseAccountSession(value: unknown, nowMs = Date.now()): AccountSession {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported account session schema');
  }
  const deviceId = requiredText(value, 'deviceId');
  const deviceKind = requiredText(value, 'deviceKind') as DeviceKind;
  const trustLevel = requiredText(value, 'trustLevel') as TrustLevel;
  const expireText = requiredText(value, 'accessTokenExpireAt');
  const accessExpireAtMs = new Date(expireText).getTime();
  if (
    !UUID_PATTERN.test(deviceId) ||
    !DEVICE_KINDS.has(deviceKind) ||
    !TRUST_LEVELS.has(trustLevel) ||
    !Number.isFinite(accessExpireAtMs) ||
    accessExpireAtMs <= nowMs
  ) {
    throw new Error('Invalid account session identity or expiry');
  }
  const deviceName = requiredText(value, 'deviceName');
  if ([...deviceName].length > 64) {
    throw new Error('Invalid account session device name');
  }
  const deviceToken = typeof value.deviceToken === 'string' ? value.deviceToken.trim() : '';
  if (trustLevel === 'session' && deviceToken) {
    throw new Error('Session trust must not include a persistent credential');
  }
  if (trustLevel !== 'session' && !deviceToken) {
    throw new Error('Persistent trust requires a device credential');
  }
  return {
    schemaVersion: 1,
    accountId: requiredText(value, 'accountId'),
    username: requiredText(value, 'username'),
    deviceId,
    deviceKind,
    deviceName,
    trustLevel,
    accessToken: requiredText(value, 'accessToken'),
    accessExpireAtMs,
    ...(deviceToken ? { deviceToken } : {})
  };
}

export function canPersistAccountSession(session: AccountSession): boolean {
  return session.trustLevel !== 'session' && Boolean(session.deviceToken);
}
