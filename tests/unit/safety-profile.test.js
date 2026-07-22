'use strict';

// WP-109 + WP-flip-frozen-profile-allowed: safety-profile capability state.
// Covers every branch of the pure module — the default released profile (0.10.0:
// all gates allowed), the allowAll() seam, an explicit BLOCKED_PROFILE exercising
// the fail-closed throw path, unknown-gate fail-closed behavior, and the
// no-env/argv-override guarantee (the code-owned constant is the sole source of truth).

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

// A fully-blocked profile (the pre-0.10.0 frozen shape). Production now defaults
// to the all-allowed released profile; this explicit profile still exercises the
// fail-closed throw path via the `profile` argument seam (any future re-gate).
const BLOCKED_PROFILE = Object.freeze(
  Object.fromEntries(ALL_GATES.map((g) => [g, 'blocked']))
);

test('safety-profile: CAPABILITY names match the five canonical gate strings', () => {
  assert.deepEqual(Object.values(CAPABILITY).sort(), [...ALL_GATES].sort());
});

test('safety-profile: requireCapability is a no-op (does not throw) for every gate with the default (released, all-allowed) profile', () => {
  for (const gate of ALL_GATES) {
    assert.doesNotThrow(() => requireCapability(gate), `${gate}: allowed by default in the released profile`);
  }
});

test('safety-profile: requireCapability still throws WienerdogError with the fail-closed message when a gate is explicitly blocked (profile-arg seam)', () => {
  for (const gate of ALL_GATES) {
    assert.throws(
      () => requireCapability(gate, BLOCKED_PROFILE),
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

test('safety-profile: isCapabilityAllowed returns true for all five gates with the default (released) profile', () => {
  for (const gate of ALL_GATES) {
    assert.equal(isCapabilityAllowed(gate), true, `${gate}: allowed by default in the released profile`);
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

test('safety-profile: capabilityStatus() returns exactly the five gates in fixed ORDER, each allowed, each with a description', () => {
  const rows = capabilityStatus();
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.name), ALL_GATES);
  for (const r of rows) {
    assert.equal(r.status, 'allowed');
    assert.equal(typeof r.description, 'string');
    assert.ok(r.description.length > 0);
  }
});

test('safety-profile: capabilityStatus() reflects an allowAll() profile as all allowed, still in fixed ORDER', () => {
  const rows = capabilityStatus(allowAll());
  assert.deepEqual(rows.map((r) => r.name), ALL_GATES);
  for (const r of rows) assert.equal(r.status, 'allowed');
});

test('safety-profile: no environment variable or CLI flag changes a gate — the module never reads process.env or process.argv (the constant is the sole source of truth)', () => {
  const savedEnv = process.env.WIENERDOG_YES;
  const savedArgv = process.argv.slice();
  process.env.WIENERDOG_YES = '0';
  process.argv = [...process.argv, '--no-google'];
  try {
    // No env/argv can flip the code-owned constant in either direction: the
    // released profile stays as coded regardless of what the environment says.
    for (const gate of ALL_GATES) {
      assert.equal(isCapabilityAllowed(gate), true, `${gate}: unchanged by env/argv (WIENERDOG_YES=0, --no-google present)`);
      assert.doesNotThrow(() => requireCapability(gate));
    }
  } finally {
    if (savedEnv === undefined) delete process.env.WIENERDOG_YES;
    else process.env.WIENERDOG_YES = savedEnv;
    process.argv = savedArgv;
  }
});

test('safety-profile: the module exposes no setter — the default profile stays as coded (all allowed) after prior allowAll() calls in this file', () => {
  const rows = capabilityStatus();
  for (const r of rows) assert.equal(r.status, 'allowed');
  assert.deepEqual(Object.keys(safetyProfile).sort(), [
    'CAPABILITY', 'allowAll', 'capabilityStatus', 'isCapabilityAllowed', 'requireCapability',
  ]);
});
