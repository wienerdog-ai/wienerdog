'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const client = require('../../src/gws/client');
const { SCOPE_SETS, requiredScopesFor } = require('../../src/gws/scope-sets');
const { loadCredentialServices } = require('../../src/gws/broker/credentials');
const migration = require('../../src/gws/token-migration');
const { CAPABILITY_CLASS } = require('../../src/gws/broker/constants');

/** Fresh temp core with secrets/ and a client JSON in place. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brokercred-'));
  const core = path.join(root, 'wd');
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: core });
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  client.persistClientJson(paths, { installed: { client_id: 'id', client_secret: 's' } });
  return paths;
}

/** Persist a per-class token and return common opts with a matching tokeninfo. */
function seedClass(paths, cls, scopes) {
  client.persistTokenForClass(paths, cls, { access_token: 'a', refresh_token: 'r' });
  return {
    getTokenInfo: async () => ({ scopes: scopes || requiredScopesFor(cls).slice() }),
    factory: (token, capabilityClass) => ({ fake: true, cls: capabilityClass }),
  };
}

// ------------------------------------------------------------- scope-sets.js

test('broker-credentials: SCOPE_SETS are the exact least-scope arrays per class', () => {
  assert.deepEqual(SCOPE_SETS[CAPABILITY_CLASS.READ], [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
  ]);
  assert.deepEqual(SCOPE_SETS[CAPABILITY_CLASS.DRAFT], ['https://www.googleapis.com/auth/gmail.compose']);
  assert.deepEqual(SCOPE_SETS[CAPABILITY_CLASS.SEND], ['https://www.googleapis.com/auth/gmail.send']);
  assert.deepEqual(SCOPE_SETS[CAPABILITY_CLASS.CALENDAR_WRITE], [
    'https://www.googleapis.com/auth/calendar.events',
  ]);
  assert.ok(Object.isFrozen(SCOPE_SETS));
  assert.throws(() => requiredScopesFor('NOT_A_CLASS'), WienerdogError);
});

// ------------------------------------------------- per-class token/services

test('broker-credentials: per-class token paths are four separate secrets files', () => {
  const paths = tempPaths();
  assert.equal(client.tokenPathForClass(paths, CAPABILITY_CLASS.READ), path.join(paths.secrets, 'google-token-read.json'));
  assert.equal(client.tokenPathForClass(paths, CAPABILITY_CLASS.DRAFT), path.join(paths.secrets, 'google-token-draft.json'));
  assert.equal(client.tokenPathForClass(paths, CAPABILITY_CLASS.SEND), path.join(paths.secrets, 'google-token-send.json'));
  assert.equal(
    client.tokenPathForClass(paths, CAPABILITY_CLASS.CALENDAR_WRITE),
    path.join(paths.secrets, 'google-token-calendar.json')
  );
  assert.throws(() => client.tokenPathForClass(paths, 'NOT_A_CLASS'), WienerdogError);
});

test('broker-credentials: getServicesForClass builds the MINIMAL services per class (real googleapis stub)', () => {
  const paths = tempPaths();
  const mk = (cls) => {
    client.persistTokenForClass(paths, cls, { access_token: 'a' });
    const googleapisStub = {
      google: {
        auth: { OAuth2: class { setCredentials() {} } },
        gmail: () => 'GMAIL',
        calendar: () => 'CAL',
        drive: () => 'DRIVE',
      },
    };
    return client.getServicesForClass(paths, cls, { googleapis: googleapisStub });
  };
  assert.deepEqual(Object.keys(mk(CAPABILITY_CLASS.READ)).sort(), ['calendar', 'drive', 'gmail']);
  assert.deepEqual(Object.keys(mk(CAPABILITY_CLASS.DRAFT)), ['gmail']);
  assert.deepEqual(Object.keys(mk(CAPABILITY_CLASS.SEND)), ['gmail']);
  assert.deepEqual(Object.keys(mk(CAPABILITY_CLASS.CALENDAR_WRITE)), ['calendar']);
});

test('broker-credentials: a class cannot obtain another class token — separate files, separate loads', () => {
  const paths = tempPaths();
  client.persistTokenForClass(paths, CAPABILITY_CLASS.READ, { access_token: 'read-only-token' });
  // SEND token was never written: the SEND load must fail even though READ exists.
  assert.throws(() => client.loadTokenForClass(paths, CAPABILITY_CLASS.SEND), WienerdogError);
  assert.deepEqual(client.loadTokenForClass(paths, CAPABILITY_CLASS.READ), { access_token: 'read-only-token' });
});

test('broker-credentials: legacy combined getServices is retired with a migration error', () => {
  const paths = tempPaths();
  client.persistToken(paths, { access_token: 'legacy' });
  assert.throws(
    () => client.getServices(paths),
    (err) => err instanceof WienerdogError && /split|migration|gws auth/i.test(err.message)
  );
});

// --------------------------------------------------- loadCredentialServices

test('broker-credentials: exact granted-scope match is accepted and returns the class services', async () => {
  const paths = tempPaths();
  const opts = seedClass(paths, CAPABILITY_CLASS.READ);
  const services = await loadCredentialServices(paths, CAPABILITY_CLASS.READ, opts);
  assert.equal(services.fake, true);
  assert.equal(services.cls, CAPABILITY_CLASS.READ);
  assert.deepEqual(services.verifiedScopes, requiredScopesFor(CAPABILITY_CLASS.READ));
});

test('broker-credentials: a granted-scope SUPERSET (scope bleed) is refused fail-closed', async () => {
  const paths = tempPaths();
  const opts = seedClass(paths, CAPABILITY_CLASS.SEND, [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly', // bleed
  ]);
  await assert.rejects(
    () => loadCredentialServices(paths, CAPABILITY_CLASS.SEND, opts),
    (err) => err instanceof WienerdogError && /scope/i.test(err.message) && !/gmail\.readonly.*token|access_token/.test(err.message)
  );
});

test('broker-credentials: a missing granted scope is refused fail-closed', async () => {
  const paths = tempPaths();
  const opts = seedClass(paths, CAPABILITY_CLASS.READ, [
    'https://www.googleapis.com/auth/gmail.readonly', // calendar+drive missing
  ]);
  await assert.rejects(
    () => loadCredentialServices(paths, CAPABILITY_CLASS.READ, opts),
    (err) => err instanceof WienerdogError && /scope/i.test(err.message)
  );
});

test('broker-credentials: SEND services can never be built from the READ token (missing-file fail)', async () => {
  const paths = tempPaths();
  seedClass(paths, CAPABILITY_CLASS.READ);
  await assert.rejects(
    () => loadCredentialServices(paths, CAPABILITY_CLASS.SEND, { getTokenInfo: async () => ({ scopes: [] }) }),
    WienerdogError
  );
});

test('broker-credentials: invalid_grant maps to the DISTINCT testing-mode 7-day expiry alert', async () => {
  const paths = tempPaths();
  client.persistTokenForClass(paths, CAPABILITY_CLASS.READ, { access_token: 'a', refresh_token: 'r' });
  // The pinned vendored-library shape: GaxiosError with response.data.error —
  // detection must key on that, never on e.message (SPIKE-scope-verify-shape).
  const gaxiosish = new Error('{"error":"invalid_grant","error_description":"reauth related error"}');
  gaxiosish.response = { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } };
  await assert.rejects(
    () => loadCredentialServices(paths, CAPABILITY_CLASS.READ, { getTokenInfo: async () => { throw gaxiosish; } }),
    (err) =>
      err instanceof WienerdogError &&
      /expired|revoked/i.test(err.message) &&
      /7.day|testing/i.test(err.message) &&
      /gws auth/.test(err.message)
  );
});

test('broker-credentials: a non-invalid_grant verification failure is a generic fixed secret-free error', async () => {
  const paths = tempPaths();
  client.persistTokenForClass(paths, CAPABILITY_CLASS.READ, { access_token: 'a' });
  await assert.rejects(
    () => loadCredentialServices(paths, CAPABILITY_CLASS.READ, {
      getTokenInfo: async () => { throw new Error('boom with token ya29.SECRET inside'); },
    }),
    (err) => err instanceof WienerdogError && !/SECRET|ya29/.test(err.message)
  );
});

test('broker-credentials: missing class token with a LEGACY token present names the migration', async () => {
  const paths = tempPaths();
  client.persistToken(paths, { access_token: 'legacy-combined' });
  await assert.rejects(
    () => loadCredentialServices(paths, CAPABILITY_CLASS.READ, { getTokenInfo: async () => ({ scopes: [] }) }),
    (err) => err instanceof WienerdogError && /credential model changed|re-connect|gws auth/i.test(err.message)
  );
});

// ------------------------------------------------------------- migration

test('broker-credentials: legacy token is detected, retired by rename, never reused; retire is idempotent', () => {
  const paths = tempPaths();
  assert.equal(migration.hasLegacyToken(paths), false);
  client.persistToken(paths, { access_token: 'legacy' });
  assert.equal(migration.hasLegacyToken(paths), true);

  const retired = migration.retireLegacyToken(paths);
  assert.ok(retired && retired.endsWith('.retired'));
  assert.equal(fs.existsSync(client.tokenPath(paths)), false, 'legacy file renamed away');
  assert.ok(fs.existsSync(retired));
  assert.equal(migration.hasLegacyToken(paths), false);
  assert.equal(migration.retireLegacyToken(paths), null, 'second retire is a no-op');
  assert.match(migration.MIGRATION_NOTICE, /wienerdog gws auth/);
});
