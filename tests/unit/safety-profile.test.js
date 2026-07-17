'use strict';

// WP-109: fail-closed safety-profile capability state. Covers every branch of
// the pure module — the default (frozen, all-blocked) profile, the allowAll()
// test seam, unknown-gate fail-closed behavior, and the no-env/argv-override
// guarantee (the whole point of A0).

const test = require('node:test');
const assert = require('node:assert/strict');

const { WienerdogError } = require('../../src/core/errors');
const safetyProfile = require('../../src/core/safety-profile');
const { CAPABILITY, requireCapability, isCapabilityAllowed, capabilityStatus, allowAll } = safetyProfile;

const ALL_GATES = [
  'google-setup',
  'gws-use',
  'external-content-routine',
  'daily-summary-injection',
  'identity-auto-activation',
];

test('safety-profile: CAPABILITY names match the five canonical gate strings', () => {
  assert.deepEqual(Object.values(CAPABILITY).sort(), [...ALL_GATES].sort());
});

test('safety-profile: requireCapability throws WienerdogError for every gate with the default (frozen) profile', () => {
  for (const gate of ALL_GATES) {
    assert.throws(
      () => requireCapability(gate),
      (err) => {
        assert.ok(err instanceof WienerdogError, `${gate}: throws a WienerdogError`);
        assert.match(err.message, new RegExp(`"${gate}"`), `${gate}: message names the gate`);
        assert.match(err.message, /wienerdog safety/, `${gate}: message names the wienerdog safety command`);
        assert.match(err.message, /no flag or environment override/, `${gate}: message states there is no override`);
        return true;
      }
    );
  }
});

test('safety-profile: isCapabilityAllowed returns false for all five gates with the default profile', () => {
  for (const gate of ALL_GATES) {
    assert.equal(isCapabilityAllowed(gate), false, `${gate}: not allowed by default`);
  }
});

test('safety-profile: isCapabilityAllowed returns true for all five gates when passed allowAll()', () => {
  const open = allowAll();
  for (const gate of ALL_GATES) {
    assert.equal(isCapabilityAllowed(gate, open), true, `${gate}: allowed under allowAll()`);
  }
});

test('safety-profile: requireCapability is a no-op (does not throw) for every gate when passed allowAll()', () => {
  const open = allowAll();
  for (const gate of ALL_GATES) {
    assert.doesNotThrow(() => requireCapability(gate, open));
  }
});

test('safety-profile: allowAll() returns a frozen object', () => {
  const open = allowAll();
  assert.ok(Object.isFrozen(open));
});

test('safety-profile: statusOf/isCapabilityAllowed/requireCapability throw (fail closed) on an unknown gate name, never treat it as allowed', () => {
  assert.throws(() => isCapabilityAllowed('not-a-real-gate'), WienerdogError);
  assert.throws(() => requireCapability('not-a-real-gate'), WienerdogError);
  assert.throws(() => isCapabilityAllowed('not-a-real-gate', allowAll()), WienerdogError);
});

test('safety-profile: capabilityStatus() returns exactly the five gates in fixed ORDER, each blocked, each with a description', () => {
  const rows = capabilityStatus();
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.name), ALL_GATES);
  for (const r of rows) {
    assert.equal(r.status, 'blocked');
    assert.equal(typeof r.description, 'string');
    assert.ok(r.description.length > 0);
  }
});

test('safety-profile: capabilityStatus() reflects an allowAll() profile as all allowed, still in fixed ORDER', () => {
  const rows = capabilityStatus(allowAll());
  assert.deepEqual(rows.map((r) => r.name), ALL_GATES);
  for (const r of rows) assert.equal(r.status, 'allowed');
});

test('safety-profile: no environment variable or CLI flag flips a gate — the module never reads process.env or process.argv', () => {
  const savedEnv = process.env.WIENERDOG_YES;
  const savedArgv = process.argv.slice();
  process.env.WIENERDOG_YES = '1';
  process.argv = [...process.argv, '--yes'];
  try {
    for (const gate of ALL_GATES) {
      assert.equal(isCapabilityAllowed(gate), false, `${gate}: still blocked with WIENERDOG_YES=1 and --yes present`);
      assert.throws(() => requireCapability(gate), WienerdogError);
    }
  } finally {
    if (savedEnv === undefined) delete process.env.WIENERDOG_YES;
    else process.env.WIENERDOG_YES = savedEnv;
    process.argv = savedArgv;
  }
});

test('safety-profile: the module exposes no setter — the default profile stays all-blocked after prior allowAll() calls in this file', () => {
  const rows = capabilityStatus();
  for (const r of rows) assert.equal(r.status, 'blocked');
  assert.deepEqual(Object.keys(safetyProfile).sort(), [
    'CAPABILITY', 'allowAll', 'capabilityStatus', 'isCapabilityAllowed', 'requireCapability',
  ]);
});
