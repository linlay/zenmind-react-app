import type { AccountSession } from './accountAuthModel';

// Browser previews do not have access to the native authentication Cookie store.
export async function verifyEnterpriseLogin(_signal?: AbortSignal): Promise<AccountSession> {
  throw new Error('Enterprise sign-in requires iOS or Android');
}
export async function restoreEnterpriseSession(_currentToken?: string): Promise<AccountSession | null> {
  return null;
}
export async function saveEnterpriseSession(_session: AccountSession): Promise<void> {
  throw new Error('Enterprise sign-in requires iOS or Android');
}
export async function clearEnterpriseSession(): Promise<void> {}
