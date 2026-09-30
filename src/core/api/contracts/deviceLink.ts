export const DEVICE_LINK_SCHEMA_VERSION = 1 as const;
export const ROUTE_CREDENTIAL_TTL_MS = 2 * 60 * 1000;
export const REMOTE_CONVERSATION_PAGE_SIZE = 10 as const;

export type DeviceKind = 'mobile' | 'desktop';
export type TrustLevel = 'session' | 'trusted' | 'fully_trusted';

export type AccountDevice = {
  deviceId: string;
  deviceKind: DeviceKind;
  deviceName: string;
  trustLevel: TrustLevel;
  lastSeenAt: string;
  online?: boolean;
  connectedAt?: string | null;
  lastConnectedAt?: string | null;
};

export type AccountDeviceListV1 = {
  schemaVersion: 1;
  items: AccountDevice[];
  nextCursor?: string;
};

export type AccountDeviceEventV1 = {
  schemaVersion: 1;
  eventId: string;
  eventType: 'created' | 'updated' | 'deleted' | 'revoked' | 'trust_changed';
  deviceId: string;
  occurredAt: string;
  device?: AccountDevice;
  stateVersion: number;
};

export type TrustedRouteContext = {
  issuer: string;
  audience: string;
  accountId: string;
  sourceDeviceId: string;
  targetDesktopId: string;
  requestId: string;
  jti: string;
  issuedAt: string;
  expiresAt: string;
};

export class DeviceLinkContractError extends Error {
  readonly code: 'PROTOCOL_INCOMPATIBLE' | 'ROUTE_CREDENTIAL_INVALID';

  constructor(code: DeviceLinkContractError['code'], message: string) {
    super(message);
    this.name = 'DeviceLinkContractError';
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const DEVICE_KINDS = new Set<DeviceKind>(['mobile', 'desktop']);
const TRUST_LEVELS = new Set<TrustLevel>(['session', 'trusted', 'fully_trusted']);
const EVENT_TYPES = new Set<AccountDeviceEventV1['eventType']>([
  'created',
  'updated',
  'deleted',
  'revoked',
  'trust_changed'
]);
const ROUTE_KEYS = new Set<keyof TrustedRouteContext>([
  'issuer',
  'audience',
  'accountId',
  'sourceDeviceId',
  'targetDesktopId',
  'requestId',
  'jti',
  'issuedAt',
  'expiresAt'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  code: DeviceLinkContractError['code']
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DeviceLinkContractError(code, `${key} is required`);
  }
  return value;
}

function readInstant(record: Record<string, unknown>, key: string, code: DeviceLinkContractError['code']): string {
  const value = readRequiredString(record, key, code);
  if (!ISO_INSTANT_PATTERN.test(value) || !Number.isFinite(new Date(value).getTime())) {
    throw new DeviceLinkContractError(code, `${key} must be an RFC 3339 UTC instant`);
  }
  return value;
}

function readUUID(record: Record<string, unknown>, key: string, code: DeviceLinkContractError['code']): string {
  const value = readRequiredString(record, key, code);
  if (!UUID_PATTERN.test(value)) {
    throw new DeviceLinkContractError(code, `${key} must be a UUID`);
  }
  return value;
}

function parseAccountDevice(value: unknown): AccountDevice {
  if (!isRecord(value)) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'device must be an object');
  }
  const deviceKind = readRequiredString(value, 'deviceKind', 'PROTOCOL_INCOMPATIBLE');
  const trustLevel = readRequiredString(value, 'trustLevel', 'PROTOCOL_INCOMPATIBLE');
  if (!DEVICE_KINDS.has(deviceKind as DeviceKind) || !TRUST_LEVELS.has(trustLevel as TrustLevel)) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'unknown deviceKind or trustLevel');
  }
  const deviceName = readRequiredString(value, 'deviceName', 'PROTOCOL_INCOMPATIBLE');
  if ([...deviceName].length > 64) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'deviceName is too long');
  }
  if (deviceKind === 'mobile' && value.online !== undefined) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'mobile devices do not expose connectable presence');
  }
  if (value.online !== undefined && typeof value.online !== 'boolean') {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'online must be boolean');
  }
  const readNullableInstant = (key: string): string | null | undefined => {
    if (value[key] === undefined || value[key] === null) {
      return value[key] as null | undefined;
    }
    return readInstant(value, key, 'PROTOCOL_INCOMPATIBLE');
  };
  return {
    deviceId: readUUID(value, 'deviceId', 'PROTOCOL_INCOMPATIBLE'),
    deviceKind: deviceKind as DeviceKind,
    deviceName,
    trustLevel: trustLevel as TrustLevel,
    lastSeenAt: readInstant(value, 'lastSeenAt', 'PROTOCOL_INCOMPATIBLE'),
    ...(value.online === undefined ? {} : { online: value.online }),
    ...(value.connectedAt === undefined ? {} : { connectedAt: readNullableInstant('connectedAt') }),
    ...(value.lastConnectedAt === undefined ? {} : { lastConnectedAt: readNullableInstant('lastConnectedAt') })
  };
}

export function parseAccountDeviceListV1(value: unknown): AccountDeviceListV1 {
  if (!isRecord(value) || value.schemaVersion !== DEVICE_LINK_SCHEMA_VERSION || !Array.isArray(value.items)) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'unsupported account device list');
  }
  if (value.nextCursor !== undefined && (typeof value.nextCursor !== 'string' || value.nextCursor === '')) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'nextCursor must be a non-empty string');
  }
  return {
    schemaVersion: DEVICE_LINK_SCHEMA_VERSION,
    items: value.items.map(parseAccountDevice),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor })
  };
}

export function parseAccountDeviceEventV1(value: unknown): AccountDeviceEventV1 {
  if (!isRecord(value) || value.schemaVersion !== DEVICE_LINK_SCHEMA_VERSION) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'unsupported account device event');
  }
  const eventType = readRequiredString(value, 'eventType', 'PROTOCOL_INCOMPATIBLE');
  if (!EVENT_TYPES.has(eventType as AccountDeviceEventV1['eventType'])) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'unknown eventType');
  }
  if (!Number.isSafeInteger(value.stateVersion) || (value.stateVersion as number) < 1) {
    throw new DeviceLinkContractError('PROTOCOL_INCOMPATIBLE', 'stateVersion must be a positive integer');
  }
  return {
    schemaVersion: DEVICE_LINK_SCHEMA_VERSION,
    eventId: readUUID(value, 'eventId', 'PROTOCOL_INCOMPATIBLE'),
    eventType: eventType as AccountDeviceEventV1['eventType'],
    deviceId: readUUID(value, 'deviceId', 'PROTOCOL_INCOMPATIBLE'),
    occurredAt: readInstant(value, 'occurredAt', 'PROTOCOL_INCOMPATIBLE'),
    ...(value.device === undefined ? {} : { device: parseAccountDevice(value.device) }),
    stateVersion: value.stateVersion as number
  };
}

export function parseTrustedRouteContext(value: unknown): TrustedRouteContext {
  if (!isRecord(value) || Object.keys(value).some((key) => !ROUTE_KEYS.has(key as keyof TrustedRouteContext))) {
    throw new DeviceLinkContractError('ROUTE_CREDENTIAL_INVALID', 'invalid route context');
  }
  const context: TrustedRouteContext = {
    issuer: readRequiredString(value, 'issuer', 'ROUTE_CREDENTIAL_INVALID'),
    audience: readRequiredString(value, 'audience', 'ROUTE_CREDENTIAL_INVALID'),
    accountId: readRequiredString(value, 'accountId', 'ROUTE_CREDENTIAL_INVALID'),
    sourceDeviceId: readUUID(value, 'sourceDeviceId', 'ROUTE_CREDENTIAL_INVALID'),
    targetDesktopId: readUUID(value, 'targetDesktopId', 'ROUTE_CREDENTIAL_INVALID'),
    requestId: readUUID(value, 'requestId', 'ROUTE_CREDENTIAL_INVALID'),
    jti: readUUID(value, 'jti', 'ROUTE_CREDENTIAL_INVALID'),
    issuedAt: readInstant(value, 'issuedAt', 'ROUTE_CREDENTIAL_INVALID'),
    expiresAt: readInstant(value, 'expiresAt', 'ROUTE_CREDENTIAL_INVALID')
  };
  const lifetime = new Date(context.expiresAt).getTime() - new Date(context.issuedAt).getTime();
  if (lifetime <= 0 || lifetime > ROUTE_CREDENTIAL_TTL_MS) {
    throw new DeviceLinkContractError('ROUTE_CREDENTIAL_INVALID', 'invalid route credential lifetime');
  }
  return context;
}

export function validateTrustedRouteContext(
  context: TrustedRouteContext,
  expected: {
    issuer: string;
    audience: string;
    accountId: string;
    targetDesktopId: string;
    nowMs: number;
    clockSkewMs?: number;
    isJtiUsed?: (jti: string) => boolean;
  }
): void {
  const skew = Math.max(0, expected.clockSkewMs ?? 0);
  const issuedAt = new Date(context.issuedAt).getTime();
  const expiresAt = new Date(context.expiresAt).getTime();
  if (
    context.issuer !== expected.issuer ||
    context.audience !== expected.audience ||
    context.accountId !== expected.accountId ||
    context.targetDesktopId !== expected.targetDesktopId ||
    expected.nowMs < issuedAt - skew ||
    expected.nowMs >= expiresAt + skew ||
    expected.isJtiUsed?.(context.jti)
  ) {
    throw new DeviceLinkContractError('ROUTE_CREDENTIAL_INVALID', 'route credential binding is invalid');
  }
}
