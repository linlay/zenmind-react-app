import { DEVICE_LINK_SCHEMA_VERSION, type AccountDeviceListV1 } from './deviceLink.ts';

export type DesktopPresence = {
  deviceId: string;
  online: boolean;
  connectedAt?: string | null;
  lastConnectedAt?: string | null;
};

export function parseDesktopPresence(value: unknown): DesktopPresence[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid presence response');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== DEVICE_LINK_SCHEMA_VERSION || !Array.isArray(record.items)) {
    throw new Error('Unsupported presence response');
  }
  return record.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid presence item');
    const presence = item as Record<string, unknown>;
    if (typeof presence.deviceId !== 'string' || typeof presence.online !== 'boolean') {
      throw new Error('Invalid presence item');
    }
    for (const key of ['connectedAt', 'lastConnectedAt'] as const) {
      const instant = presence[key];
      if (
        instant !== undefined &&
        instant !== null &&
        (typeof instant !== 'string' || !Number.isFinite(Date.parse(instant)))
      ) {
        throw new Error(`Invalid presence ${key}`);
      }
    }
    return {
      deviceId: presence.deviceId,
      online: presence.online,
      ...(presence.connectedAt === undefined ? {} : { connectedAt: presence.connectedAt as string | null }),
      ...(presence.lastConnectedAt === undefined ? {} : { lastConnectedAt: presence.lastConnectedAt as string | null })
    };
  });
}

export function mergeAccountDevicePresence(
  devices: AccountDeviceListV1,
  presenceItems: ReadonlyArray<DesktopPresence>
): AccountDeviceListV1 {
  const presenceByID = new Map(presenceItems.map((item) => [item.deviceId, item]));
  return {
    ...devices,
    items: devices.items.map((device) => {
      if (device.deviceKind !== 'desktop') {
        return {
          deviceId: device.deviceId,
          deviceKind: device.deviceKind,
          deviceName: device.deviceName,
          trustLevel: device.trustLevel,
          lastSeenAt: device.lastSeenAt
        };
      }
      const presence = presenceByID.get(device.deviceId);
      return {
        ...device,
        online: Boolean(presence?.online),
        connectedAt: presence?.connectedAt ?? null,
        lastConnectedAt: presence?.lastConnectedAt ?? device.lastConnectedAt ?? null
      };
    })
  };
}
