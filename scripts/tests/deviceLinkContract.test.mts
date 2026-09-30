import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  DeviceLinkContractError,
  parseAccountDeviceListV1,
  parseTrustedRouteContext,
  validateTrustedRouteContext
} from '../../src/core/api/contracts/deviceLink.ts';

const fixturePath = path.join(process.cwd(), 'contracts', 'device-link', 'v1', 'fixtures.json');
const fixtureBytes = readFileSync(fixturePath);
const fixtures = JSON.parse(fixtureBytes.toString('utf8')) as {
  accountDeviceLists: { valid: unknown[]; invalid: Array<{ name: string; value: unknown }> };
  routeContexts: { valid: unknown };
};
const FIXTURE_SHA256 = '1984465f5d837277d54eb89fe3ca568c847e3e1451fda4558891a3d05ba3974d';

test('shared device-link fixture hash is pinned', () => {
  assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'), FIXTURE_SHA256);
});

test('account device parser accepts optional additions and rejects unsafe enums', () => {
  for (const value of fixtures.accountDeviceLists.valid) {
    assert.equal(parseAccountDeviceListV1(value).schemaVersion, 1);
  }
  for (const fixture of fixtures.accountDeviceLists.invalid) {
    assert.throws(
      () => parseAccountDeviceListV1(fixture.value),
      (error: unknown) => error instanceof DeviceLinkContractError && error.code === 'PROTOCOL_INCOMPATIBLE',
      fixture.name
    );
  }
});

test('trusted route parser enforces target, expiry and replay binding', () => {
  const context = parseTrustedRouteContext(fixtures.routeContexts.valid);
  const expected = {
    issuer: 'tunnel-hub',
    audience: 'desktop-route',
    accountId: 'account-alice',
    targetDesktopId: context.targetDesktopId,
    nowMs: new Date('2030-01-01T00:01:00Z').getTime()
  };
  assert.doesNotThrow(() => validateTrustedRouteContext(context, expected));
  assert.throws(
    () =>
      validateTrustedRouteContext(context, {
        ...expected,
        targetDesktopId: '33333333-3333-4333-8333-333333333333'
      }),
    (error: unknown) => error instanceof DeviceLinkContractError && error.code === 'ROUTE_CREDENTIAL_INVALID'
  );
  assert.throws(
    () => validateTrustedRouteContext(context, { ...expected, nowMs: new Date(context.expiresAt).getTime() }),
    (error: unknown) => error instanceof DeviceLinkContractError && error.code === 'ROUTE_CREDENTIAL_INVALID'
  );
  assert.throws(
    () => validateTrustedRouteContext(context, { ...expected, isJtiUsed: () => true }),
    (error: unknown) => error instanceof DeviceLinkContractError && error.code === 'ROUTE_CREDENTIAL_INVALID'
  );
});
