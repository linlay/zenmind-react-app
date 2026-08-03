import { MMKV } from 'react-native-mmkv';

import { BRAND_ID, STORAGE_NAMESPACE } from '../../shared/generated/brand';
import { getDefaultSourceConfig } from '../config/appEnvironment';
import {
  bootstrapAuth,
  getAuthSnapshot,
  subscribeAuthStore,
  type SessionState
} from './appAuth';

const accessStorage = new MMKV({ id: `${STORAGE_NAMESPACE}-${BRAND_ID}-app-access` });
const ACCESS_CHOICE_KEY = 'access_choice_v1';
const DEFAULT_IDENTITY_KEY = 'default_source_identity_v1';

export type DefaultSourceIdentity = {
  id: string;
  sourceId: string;
  createdAtMs: number;
};

export type AppAccessSnapshot =
  | {
      status: 'bootstrapping';
      defaultIdentity: DefaultSourceIdentity | null;
      pairedSession: SessionState | null;
    }
  | {
      status: 'onboarding';
      defaultIdentity: DefaultSourceIdentity;
      pairedSession: null;
    }
  | {
      status: 'ready';
      pairingState: 'unpaired';
      entryChoice: 'skipped';
      defaultIdentity: DefaultSourceIdentity;
      pairedSession: null;
    }
  | {
      status: 'ready';
      pairingState: 'paired';
      entryChoice: 'paired';
      defaultIdentity: DefaultSourceIdentity;
      pairedSession: SessionState;
    };

type StoreListener = () => void;

let isAccessBootstrapping = true;
let defaultIdentity: DefaultSourceIdentity | null = null;
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

function hasCompletedOnboarding(): boolean {
  return accessStorage.getString(ACCESS_CHOICE_KEY) === 'completed';
}

export function getAppAccessSnapshot(): AppAccessSnapshot {
  const authSnapshot = getAuthSnapshot();
  if (isAccessBootstrapping || authSnapshot.isBootstrapping || !defaultIdentity) {
    return {
      status: 'bootstrapping',
      defaultIdentity,
      pairedSession: authSnapshot.session
    };
  }
  if (authSnapshot.session) {
    return {
      status: 'ready',
      pairingState: 'paired',
      entryChoice: 'paired',
      defaultIdentity,
      pairedSession: authSnapshot.session
    };
  }
  if (hasCompletedOnboarding()) {
    return {
      status: 'ready',
      pairingState: 'unpaired',
      entryChoice: 'skipped',
      defaultIdentity,
      pairedSession: null
    };
  }
  return {
    status: 'onboarding',
    defaultIdentity,
    pairedSession: null
  };
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
