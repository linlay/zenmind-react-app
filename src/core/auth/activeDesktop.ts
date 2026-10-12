import { getAccountAuthSnapshot } from './accountAuth.ts';
import { MMKV } from 'react-native-mmkv';
import type { AccountDevice } from '../api/contracts/deviceLink.ts';

export type SelectedSource = { kind: 'cloud' } | { kind: 'desktop'; accountId: string; desktopId: string } | null;
const storage = new MMKV({ id: 'zenmind-active-account-desktop' });
const SOURCE_KEY = 'selected_source_v2';
const deviceAvailability = new Map<string, boolean | undefined>();
const listeners = new Set<() => void>();
let selected: SelectedSource = readSelection();

function readSelection(): SelectedSource {
  try {
    const value = JSON.parse(storage.getString(SOURCE_KEY) || 'null');
    if (value?.kind === 'cloud') return { kind: 'cloud' };
    if (
      value?.kind === 'desktop' &&
      typeof value.accountId === 'string' &&
      value.accountId &&
      typeof value.desktopId === 'string' &&
      value.desktopId
    )
      return { kind: 'desktop', accountId: value.accountId, desktopId: value.desktopId };
  } catch {
    /* Invalid selection stays closed. */
  }
  return null;
}
export function hasSavedSourceSelection(): boolean {
  return storage.contains(SOURCE_KEY);
}
export function hasLegacyDesktopSelection(): boolean {
  try {
    const value: unknown = JSON.parse(storage.getString('active_desktop_by_account_v1') || '{}');
    return Boolean(
      value && typeof value === 'object' && Object.values(value).some((id) => typeof id === 'string' && id.trim())
    );
  } catch {
    return false;
  }
}
export function restoreLegacyDesktopSelection(accountId: string): void {
  if (hasSavedSourceSelection() || !accountId) return;
  try {
    const id: unknown = JSON.parse(storage.getString('active_desktop_by_account_v1') || '{}')[accountId];
    if (typeof id === 'string' && id.trim()) commitActiveDesktop(accountId, { deviceId: id.trim() });
  } catch {
    /* Old preferences cannot grant access. */
  }
}
export function getSelectedSource(): SelectedSource {
  return selected;
}
export function subscribeActiveDesktop(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function commitSelectedSource(value: SelectedSource): void {
  selected = value;
  storage.set(SOURCE_KEY, JSON.stringify(value));
  storage.delete('active_desktop_by_account_v1');
  listeners.forEach((listener) => listener());
}
export function readActiveDesktopId(accountId: string): string {
  return selected?.kind === 'desktop' && selected.accountId === accountId ? selected.desktopId : '';
}
export function commitActiveDesktop(
  accountId: string,
  device: Pick<AccountDevice, 'deviceId'> & Partial<Pick<AccountDevice, 'online'>>
): void {
  if (!accountId.trim() || !device.deviceId.trim()) throw new Error('An account Desktop is required');
  if (device.online !== undefined) deviceAvailability.set(JSON.stringify([accountId, device.deviceId]), device.online);
  commitSelectedSource({ kind: 'desktop', accountId, desktopId: device.deviceId });
}
export function isActiveDesktopOffline(): boolean {
  const accountId = getAccountAuthSnapshot().session?.accountId;
  return Boolean(
    accountId && deviceAvailability.get(JSON.stringify([accountId, readActiveDesktopId(accountId)])) === false
  );
}
export function updateAccountDesktopAvailability(accountId: string, devices: readonly AccountDevice[]): boolean {
  for (const device of devices) deviceAvailability.set(JSON.stringify([accountId, device.deviceId]), device.online);
  const desktopId = readActiveDesktopId(accountId);
  const revoked = Boolean(desktopId && !devices.some((device) => device.deviceId === desktopId));
  listeners.forEach((listener) => listener());
  return revoked;
}
