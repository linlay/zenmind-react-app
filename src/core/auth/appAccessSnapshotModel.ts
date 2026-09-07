import type { AuthStoreSnapshot, SessionState } from './appAuth';

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

export type AppAccessSnapshotInput = {
  authSnapshot: AuthStoreSnapshot;
  defaultIdentity: DefaultSourceIdentity | null;
  isAccessBootstrapping: boolean;
  onboardingCompleted: boolean;
};

export function reduceAppAccessSnapshot(
  previousSnapshot: AppAccessSnapshot | null,
  input: AppAccessSnapshotInput
): AppAccessSnapshot {
  const { authSnapshot, defaultIdentity, isAccessBootstrapping, onboardingCompleted } = input;

  if (isAccessBootstrapping || authSnapshot.isBootstrapping || !defaultIdentity) {
    if (
      previousSnapshot?.status === 'bootstrapping' &&
      previousSnapshot.defaultIdentity === defaultIdentity &&
      previousSnapshot.pairedSession === authSnapshot.session
    ) {
      return previousSnapshot;
    }
    return {
      status: 'bootstrapping',
      defaultIdentity,
      pairedSession: authSnapshot.session
    };
  }

  if (authSnapshot.session) {
    if (
      previousSnapshot?.status === 'ready' &&
      previousSnapshot.pairingState === 'paired' &&
      previousSnapshot.defaultIdentity === defaultIdentity &&
      previousSnapshot.pairedSession === authSnapshot.session
    ) {
      return previousSnapshot;
    }
    return {
      status: 'ready',
      pairingState: 'paired',
      entryChoice: 'paired',
      defaultIdentity,
      pairedSession: authSnapshot.session
    };
  }

  if (onboardingCompleted) {
    if (
      previousSnapshot?.status === 'ready' &&
      previousSnapshot.pairingState === 'unpaired' &&
      previousSnapshot.defaultIdentity === defaultIdentity
    ) {
      return previousSnapshot;
    }
    return {
      status: 'ready',
      pairingState: 'unpaired',
      entryChoice: 'skipped',
      defaultIdentity,
      pairedSession: null
    };
  }

  if (previousSnapshot?.status === 'onboarding' && previousSnapshot.defaultIdentity === defaultIdentity) {
    return previousSnapshot;
  }
  return {
    status: 'onboarding',
    defaultIdentity,
    pairedSession: null
  };
}
