export const DEVICE_LINK_SCHEMA_VERSION = 1 as const;
export const ROUTE_CREDENTIAL_TTL_MS = 2 * 60 * 1000;
export const REMOTE_CONVERSATION_PAGE_SIZE = 10 as const;

// This is the Hub's Desktop directory, independent of Identity login sessions.
export type AccountDevice = {
  deviceId: string;
  deviceName: string;
  online: boolean;
  connectedAt?: string;
};
export type AccountDeviceListV1 = { schemaVersion: 1; items: AccountDevice[] };
export type TrustedRouteContext = {
  schemaVersion: 1;
  accountId: string;
  sourceDeviceId: string;
  targetDesktopId: string;
  requestId: string;
  jti: string;
  issuedAt: string;
  expiresAt: string;
};

export class DeviceLinkContractError extends Error {
  constructor(
    readonly code: 'PROTOCOL_INCOMPATIBLE' | 'ROUTE_CREDENTIAL_INVALID',
    message: string
  ) {
    super(message);
    this.name = 'DeviceLinkContractError';
  }
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DESKTOP_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
type ContractCode = DeviceLinkContractError['code'];
function record(value: unknown, code: ContractCode): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DeviceLinkContractError(code, 'Expected an object');
  return value as Record<string, unknown>;
}
function text(value: Record<string, unknown>, key: string, code: ContractCode): string {
  const result = value[key];
  if (typeof result !== 'string' || !result.trim()) throw new DeviceLinkContractError(code, `${key} is required`);
  return result;
}
function instant(value: Record<string, unknown>, key: string, code: ContractCode): string {
  const result = text(value, key, code);
  if (!ISO_INSTANT_PATTERN.test(result) || !Number.isFinite(Date.parse(result)))
    throw new DeviceLinkContractError(code, `${key} must be a UTC instant`);
  return result;
}
export function parseAccountDeviceListV1(value: unknown): AccountDeviceListV1 {
  const code = 'PROTOCOL_INCOMPATIBLE';
  const payload = record(value, code);
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.items))
    throw new DeviceLinkContractError(code, 'Invalid Desktop directory');
  return {
    schemaVersion: 1,
    items: payload.items.map((item: unknown) => {
      const device = record(item, code);
      const deviceId = text(device, 'deviceId', code);
      const deviceName = text(device, 'deviceName', code);
      if (!DESKTOP_ID_PATTERN.test(deviceId) || [...deviceName].length > 64 || typeof device.online !== 'boolean')
        throw new DeviceLinkContractError(code, 'Invalid Desktop identity or presence');
      return {
        deviceId,
        deviceName,
        online: device.online,
        ...(device.connectedAt === undefined ? {} : { connectedAt: instant(device, 'connectedAt', code) })
      };
    })
  };
}
export function parseTrustedRouteContext(value: unknown): TrustedRouteContext {
  const code = 'ROUTE_CREDENTIAL_INVALID';
  const payload = record(value, code);
  if (payload.schemaVersion !== 1) throw new DeviceLinkContractError(code, 'Unsupported route context');
  const context: TrustedRouteContext = {
    schemaVersion: 1,
    accountId: text(payload, 'accountId', code),
    sourceDeviceId: text(payload, 'sourceDeviceId', code),
    targetDesktopId: text(payload, 'targetDesktopId', code),
    requestId: text(payload, 'requestId', code),
    jti: text(payload, 'jti', code),
    issuedAt: instant(payload, 'issuedAt', code),
    expiresAt: instant(payload, 'expiresAt', code)
  };
  const lifetime = Date.parse(context.expiresAt) - Date.parse(context.issuedAt);
  if (
    !UUID_PATTERN.test(context.sourceDeviceId) ||
    !DESKTOP_ID_PATTERN.test(context.targetDesktopId) ||
    !UUID_PATTERN.test(context.requestId) ||
    !UUID_PATTERN.test(context.jti) ||
    lifetime <= 0 ||
    lifetime > ROUTE_CREDENTIAL_TTL_MS
  )
    throw new DeviceLinkContractError(code, 'Invalid route binding or lifetime');
  return context;
}
