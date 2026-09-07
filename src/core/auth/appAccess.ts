import { MMKV } from 'react-native-mmkv';

import { BRAND_ID, STORAGE_NAMESPACE } from '../../shared/generated/brand';
import { getDefaultSourceConfig } from '../config/appEnvironment';
import { bootstrapAuth, getAuthSnapshot, subscribeAuthStore } from './appAuth';
import { reduceAppAccessSnapshot, type AppAccessSnapshot, type DefaultSourceIdentity } from './appAccessSnapshotModel';

export type { AppAccessSnapshot, DefaultSourceIdentity } from './appAccessSnapshotModel';

const accessStorage = new MMKV({ id: `${STORAGE_NAMESPACE}-${BRAND_ID}-app-access` });
const ACCESS_CHOICE_KEY = 'access_choice_v1';
const DEFAULT_IDENTITY_KEY = 'default_source_identity_v1';

type StoreListener = () => void;

let isAccessBootstrapping = true;
let defaultIdentity: DefaultSourceIdentity | null = null;
let onboardingCompleted = accessStorage.getString(ACCESS_CHOICE_KEY) === 'completed';
let currentSnapshot: AppAccessSnapshot | null = null;
const listeners = new Set<StoreListener>();
let bootstrapPromise: Promise<AppAccessSnapshot> | null = null;

function emitStoreChange() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // An observer must not prevent the access state from progressing.
    }
  });
}

function createIdentityId(): string {
  const runtimeCrypto = globalThis.crypto as Crypto | undefined;
  if (runtimeCrypto?.randomUUID) {
    return runtimeCrypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function isDefaultSourceIdentity(value: unknown): value is DefaultSourceIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    Boolean(record.id.trim()) &&
    typeof record.sourceId === 'string' &&
    Boolean(record.sourceId.trim()) &&
    typeof record.createdAtMs === 'number' &&
    Number.isFinite(record.createdAtMs)
  );
}

function readOrCreateDefaultIdentity(): DefaultSourceIdentity {
  const sourceId = getDefaultSourceConfig().sourceId;
  const stored = accessStorage.getString(DEFAULT_IDENTITY_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (isDefaultSourceIdentity(parsed) && parsed.sourceId === sourceId) {
        return parsed;
      }
    } catch {
      // Replace corrupt or stale identity data below.
    }
  }

  const identity: DefaultSourceIdentity = {
    id: createIdentityId(),
    sourceId,
    createdAtMs: Date.now()
  };
  accessStorage.set(DEFAULT_IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function getAppAccessSnapshot(): AppAccessSnapshot {
  currentSnapshot = reduceAppAccessSnapshot(currentSnapshot, {
    authSnapshot: getAuthSnapshot(),
    defaultIdentity,
    isAccessBootstrapping,
    onboardingCompleted
  });
  return currentSnapshot;
}

export function subscribeAppAccessStore(listener: StoreListener): () => void {
  listeners.add(listener);
  const unsubscribeAuth = subscribeAuthStore(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeAuth();
  };
}

export async function bootstrapAppAccess(): Promise<AppAccessSnapshot> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  isAccessBootstrapping = true;
  emitStoreChange();
  const task = (async () => {
    defaultIdentity = readOrCreateDefaultIdentity();
    await bootstrapAuth('');
    isAccessBootstrapping = false;
    emitStoreChange();
    return getAppAccessSnapshot();
  })();
  bootstrapPromise = task;
  try {
    return await task;
  } finally {
    if (bootstrapPromise === task) {
      bootstrapPromise = null;
    }
  }
}

export function completeAccessOnboarding() {
  accessStorage.set(ACCESS_CHOICE_KEY, 'completed');
  onboardingCompleted = true;
  if (!defaultIdentity) {
    defaultIdentity = readOrCreateDefaultIdentity();
  }
  isAccessBootstrapping = false;
  emitStoreChange();
}

export function continueWithoutPairing() {
  completeAccessOnboarding();
}

export function getDefaultSourceIdentity(): DefaultSourceIdentity {
  if (!defaultIdentity) {
    defaultIdentity = readOrCreateDefaultIdentity();
  }
  return defaultIdentity;
}
