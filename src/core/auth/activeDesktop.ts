import { MMKV } from 'react-native-mmkv';

import type { AccountDevice } from '../api/contracts/deviceLink.ts';

const storage = new MMKV({ id: 'zenmind-active-account-desktop' });
const ACTIVE_DESKTOPS_KEY = 'active_desktop_by_account_v1';

function readActiveMap(): Record<string, string> {
  try {
    const parsed = JSON.parse(storage.getString(ACTIVE_DESKTOPS_KEY) || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function readActiveDesktopId(accountId: string): string {
  return String(readActiveMap()[accountId] || '').trim();
}

export function commitActiveDesktop(accountId: string, device: AccountDevice): void {
  if (device.deviceKind !== 'desktop' || device.online !== true) {
    throw new Error('Only an online Desktop can become the active data source');
  }
  storage.set(ACTIVE_DESKTOPS_KEY, JSON.stringify({ ...readActiveMap(), [accountId]: device.deviceId }));
}

export function clearActiveDesktop(accountId: string): void {
  const active = readActiveMap();
  delete active[accountId];
  storage.set(ACTIVE_DESKTOPS_KEY, JSON.stringify(active));
}
