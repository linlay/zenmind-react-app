import type { AccountDevice } from '../../core/api/contracts/deviceLink.ts';
import { commitActiveDesktop } from '../../core/auth/activeDesktop.ts';
import { resolveAndPersistAccountDesktopCacheScope } from '../../core/auth/accountDesktopCacheScopes.ts';
import { switchChatDatabaseScope } from './database.ts';

export function activateAccountDesktopSource(accountId: string, device: AccountDevice): string {
  if (device.deviceKind !== 'desktop' || device.online !== true) {
    throw new Error('Desktop is offline or not connectable');
  }
  const resolution = resolveAndPersistAccountDesktopCacheScope(accountId, device.deviceId);
  if (resolution.result === 'conflict') {
    throw new Error('Legacy cache ownership is ambiguous; resolve it from data cleanup settings');
  }
  // Ownership is durable before the SQLite handle is switched.
  switchChatDatabaseScope(resolution.entry.cacheScopeId);
  commitActiveDesktop(accountId, device);
  return resolution.entry.cacheScopeId;
}

export function restoreAccountDesktopSource(accountId: string, desktopId: string): string {
  const resolution = resolveAndPersistAccountDesktopCacheScope(accountId, desktopId);
  if (resolution.result === 'conflict') {
    throw new Error('Legacy cache ownership is ambiguous; resolve it from data cleanup settings');
  }
  switchChatDatabaseScope(resolution.entry.cacheScopeId);
  return resolution.entry.cacheScopeId;
}
