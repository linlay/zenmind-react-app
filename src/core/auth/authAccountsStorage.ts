import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeEndpointInput, normalizePtyUrlInput } from '../network/endpoint';
import { AppSettings, StoredAccount } from '../types/common';

const STORAGE_KEY = 'mobile_auth_accounts_v1';
const LEGACY_DEVICE_TOKEN_KEY = 'app_device_token_v2';
const LEGACY_MIGRATION_DEVICE_ID = 'legacy-device';

export { STORAGE_KEY, LEGACY_DEVICE_TOKEN_KEY };

interface LoadStoredAccountsOptions {
  migrationSettings?: Partial<Pick<AppSettings, 'endpointInput' | 'ptyUrlInput'>>;
}

function normalizeTimestamp(input: unknown): number {
  const value = Number(input);
  if (Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return Date.now();
}

function sortAccounts(accounts: StoredAccount[]): StoredAccount[] {
  return [...accounts].sort((a, b) => {
    if (b.lastUsedAtMs !== a.lastUsedAtMs) {
      return b.lastUsedAtMs - a.lastUsedAtMs;
    }
    return a.accountId.localeCompare(b.accountId);
  });
}

export function buildStoredAccountId(endpointInput: string, deviceId: string): string {
  return `${normalizeEndpointInput(endpointInput)}::${String(deviceId || '').trim()}`;
}

export function toStoredAccountSummary(account: StoredAccount) {
  return {
    accountId: account.accountId,
    username: account.username,
    deviceId: account.deviceId,
    deviceName: account.deviceName,
    endpointInput: account.endpointInput,
    ptyUrlInput: account.ptyUrlInput,
    lastUsedAtMs: account.lastUsedAtMs
  };
}

export function normalizeStoredAccount(raw: Partial<StoredAccount> | null | undefined): StoredAccount {
  const endpointInput = normalizeEndpointInput(raw?.endpointInput || '');
  const deviceId = String(raw?.deviceId || '').trim() || LEGACY_MIGRATION_DEVICE_ID;
  const accountId = String(raw?.accountId || '').trim() || buildStoredAccountId(endpointInput, deviceId);

  return {
    accountId,
    username: String(raw?.username || '').trim(),
    deviceId,
    deviceName: String(raw?.deviceName || '').trim(),
    endpointInput,
    ptyUrlInput: normalizePtyUrlInput(raw?.ptyUrlInput || '', endpointInput),
    deviceToken: String(raw?.deviceToken || '').trim(),
    lastUsedAtMs: normalizeTimestamp(raw?.lastUsedAtMs)
  };
}

export async function saveStoredAccounts(accounts: StoredAccount[]): Promise<StoredAccount[]> {
  const normalized = sortAccounts(
    (Array.isArray(accounts) ? accounts : [])
      .map((item) => normalizeStoredAccount(item))
      .filter((item) => item.accountId && item.endpointInput && item.deviceToken)
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

async function migrateLegacyDeviceToken(
  options: LoadStoredAccountsOptions = {}
): Promise<StoredAccount[]> {
  const legacyToken = String((await AsyncStorage.getItem(LEGACY_DEVICE_TOKEN_KEY)) || '').trim();
  if (!legacyToken) {
    return [];
  }

  const endpointInput = normalizeEndpointInput(options.migrationSettings?.endpointInput || '');
  const migrated = normalizeStoredAccount({
    username: '',
    deviceId: LEGACY_MIGRATION_DEVICE_ID,
    deviceName: '',
    endpointInput,
    ptyUrlInput: options.migrationSettings?.ptyUrlInput || '',
    deviceToken: legacyToken,
    lastUsedAtMs: Date.now()
  });

  const saved = await saveStoredAccounts([migrated]);
  await AsyncStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY);
  return saved;
}

export async function loadStoredAccounts(options: LoadStoredAccountsOptions = {}): Promise<StoredAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      return sortAccounts(
        (Array.isArray(parsed) ? parsed : [])
          .map((item) => normalizeStoredAccount(item as Partial<StoredAccount>))
          .filter((item) => item.accountId && item.endpointInput && item.deviceToken)
      );
    }

    return migrateLegacyDeviceToken(options);
  } catch {
    return [];
  }
}

export async function listStoredAccounts(options: LoadStoredAccountsOptions = {}): Promise<StoredAccount[]> {
  return loadStoredAccounts(options);
}

export async function getStoredAccount(accountId: string): Promise<StoredAccount | null> {
  const normalizedId = String(accountId || '').trim();
  if (!normalizedId) {
    return null;
  }
  const accounts = await loadStoredAccounts();
  return accounts.find((item) => item.accountId === normalizedId) || null;
}

export async function upsertStoredAccount(account: StoredAccount): Promise<StoredAccount[]> {
  const normalized = normalizeStoredAccount(account);
  const current = await loadStoredAccounts();
  const next = current.filter((item) => item.accountId !== normalized.accountId);
  next.push(normalized);
  return saveStoredAccounts(next);
}

export async function removeStoredAccount(accountId: string): Promise<StoredAccount[]> {
  const normalizedId = String(accountId || '').trim();
  const current = await loadStoredAccounts();
  const next = current.filter((item) => item.accountId !== normalizedId);
  return saveStoredAccounts(next);
}
