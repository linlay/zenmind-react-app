import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reduceAppAccessSnapshot,
  type AppAccessSnapshotInput,
  type DefaultSourceIdentity
} from '../../src/core/auth/appAccessSnapshotModel.ts';
import type { SessionState } from '../../src/core/auth/appAuth.ts';

const defaultIdentity: DefaultSourceIdentity = {
  id: 'default-device',
  sourceId: 'default-source',
  createdAtMs: 1
};

const pairedSession: SessionState = {
  username: 'test-user',
  deviceId: 'desktop-device',
  deviceName: 'Test Desktop',
  accessToken: 'test-access-token',
  accessExpireAtMs: 10_000,
  deviceToken: ''
};

function createInput(overrides: Partial<AppAccessSnapshotInput> = {}): AppAccessSnapshotInput {
  return {
    authSnapshot: {
      isBootstrapping: false,
      session: null
    },
    defaultIdentity,
    isAccessBootstrapping: false,
    onboardingCompleted: false,
    ...overrides
  };
}

test('unchanged AppAccess inputs reuse the same snapshot reference', () => {
  const input = createInput();
  const firstSnapshot = reduceAppAccessSnapshot(null, input);
  const secondSnapshot = reduceAppAccessSnapshot(firstSnapshot, { ...input });

  assert.strictEqual(secondSnapshot, firstSnapshot);
  assert.equal(secondSnapshot.status, 'onboarding');
});

test('AppAccess snapshot transitions through bootstrapping, onboarding and unpaired states', () => {
  const bootstrappingSnapshot = reduceAppAccessSnapshot(
    null,
    createInput({
      defaultIdentity: null,
      isAccessBootstrapping: true
    })
  );
  assert.deepEqual(bootstrappingSnapshot, {
    status: 'bootstrapping',
    defaultIdentity: null,
    pairedSession: null
  });

  const onboardingSnapshot = reduceAppAccessSnapshot(bootstrappingSnapshot, createInput());
  assert.notStrictEqual(onboardingSnapshot, bootstrappingSnapshot);
  assert.equal(onboardingSnapshot.status, 'onboarding');

  const unpairedSnapshot = reduceAppAccessSnapshot(onboardingSnapshot, createInput({ onboardingCompleted: true }));
  assert.notStrictEqual(unpairedSnapshot, onboardingSnapshot);
  assert.deepEqual(unpairedSnapshot, {
    status: 'ready',
    pairingState: 'unpaired',
    entryChoice: 'skipped',
    defaultIdentity,
    pairedSession: null
  });
  assert.strictEqual(
    reduceAppAccessSnapshot(unpairedSnapshot, createInput({ onboardingCompleted: true })),
    unpairedSnapshot
  );
});

test('paired AppAccess snapshots change only when the session reference changes', () => {
  const input = createInput({
    authSnapshot: {
      isBootstrapping: false,
      session: pairedSession
    },
    onboardingCompleted: true
  });
  const pairedSnapshot = reduceAppAccessSnapshot(null, input);

  assert.deepEqual(pairedSnapshot, {
    status: 'ready',
    pairingState: 'paired',
    entryChoice: 'paired',
    defaultIdentity,
    pairedSession
  });
  assert.strictEqual(reduceAppAccessSnapshot(pairedSnapshot, { ...input }), pairedSnapshot);

  const refreshedSession = {
    ...pairedSession,
    accessToken: 'refreshed-access-token'
  };
  const refreshedSnapshot = reduceAppAccessSnapshot(
    pairedSnapshot,
    createInput({
      authSnapshot: {
        isBootstrapping: false,
        session: refreshedSession
      },
      onboardingCompleted: true
    })
  );

  assert.notStrictEqual(refreshedSnapshot, pairedSnapshot);
  assert.equal(refreshedSnapshot.pairedSession, refreshedSession);
  assert.strictEqual(
    reduceAppAccessSnapshot(
      refreshedSnapshot,
      createInput({
        authSnapshot: {
          isBootstrapping: false,
          session: refreshedSession
        },
        onboardingCompleted: true
      })
    ),
    refreshedSnapshot
  );
});
