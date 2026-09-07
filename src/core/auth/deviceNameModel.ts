export const MAX_DEVICE_NAME_LENGTH = 64;

const LEGACY_GENERATED_DEVICE_NAMES = new Set(['iPhone', 'Android', 'RN Device']);

export function normalizeDeviceName(value: unknown): string {
  return String(value || '').trim();
}

export function resolveMigratedDeviceNameOverride(legacyValue: unknown): string {
  const normalized = normalizeDeviceName(legacyValue);
  return LEGACY_GENERATED_DEVICE_NAMES.has(normalized) ? '' : normalized;
}

export function resolvePreferredDeviceName(overrideValue: unknown, effectiveDeviceId: unknown): string {
  return normalizeDeviceName(overrideValue) || normalizeDeviceName(effectiveDeviceId);
}

export function validateDeviceNameOverride(value: unknown): string {
  const normalized = normalizeDeviceName(value);
  if (!normalized) {
    throw new Error('device name is required');
  }
  if (normalized.length > MAX_DEVICE_NAME_LENGTH) {
    throw new Error(`device name must be at most ${MAX_DEVICE_NAME_LENGTH} characters`);
  }
  return normalized;
}

export function applyDeviceNameToSession<T extends { deviceName: string }>(
  session: T | null,
  deviceName: string
): T | null {
  if (!session || session.deviceName === deviceName) {
    return session;
  }
  return {
    ...session,
    deviceName
  };
}
