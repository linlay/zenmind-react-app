export const DEVICE_LINK_SCHEMA_VERSION = 1 as const;
export const REMOTE_CONVERSATION_PAGE_SIZE = 10 as const;

// This is the Hub's Desktop directory, independent of Identity login sessions.
export type AccountDevice = {
  deviceId: string;
  deviceName: string;
  online: boolean;
  connectedAt?: string;
};
export type AccountDeviceListV1 = { schemaVersion: 1; items: AccountDevice[] };
export type DesktopPlatformCredential = {
  schemaVersion: 1;
  credential: string;
  expiresAt: string;
  platformDeviceId: string;
  webSocketUrl: string;
  tokenMode: 'subprotocol';
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
export function parseDesktopPlatformCredential(value: unknown, nowMs = Date.now()): DesktopPlatformCredential {
  const code = 'ROUTE_CREDENTIAL_INVALID';
  const payload = record(value, code);
  const credential = text(payload, 'credential', code);
  const expiresAt = instant(payload, 'expiresAt', code);
  const platformDeviceId = text(payload, 'platformDeviceId', code);
  const url = new URL(text(payload, 'webSocketUrl', code));
  if (
    payload.schemaVersion !== 1 ||
    payload.tokenMode !== 'subprotocol' ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(credential) ||
    credential.length > 16384 ||
    Date.parse(expiresAt) <= nowMs ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/ws' ||
    (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new DeviceLinkContractError(code, 'Invalid Platform credential');
  return {
    schemaVersion: 1,
    credential,
    expiresAt,
    platformDeviceId,
    webSocketUrl: url.toString(),
    tokenMode: 'subprotocol'
  };
}
