'use strict';

// Server-side per-verb allowlist (ADR-0026 amendment 1, WP-broker-verb-allowlist-and-gws-gate):
// buildRegistry advertises/executes ONLY the profile's declared brokerVerbs.
// listTools returns only the declared verbs; callTool rejects an undeclared verb
// BEFORE any service/validate/dispatch (zero side effect). Absent/empty allowedVerbs
// ⇒ advertise nothing / reject everything (fail closed).

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRegistry } = require('../../src/gws/broker/registry');

/** A recording fake: every Google method logs its call so a test can assert
 *  ZERO side effect on a rejected verb. */
function fakeServices() {
  const calls = [];
  const log = (method, data) => (params) => {
    calls.push({ method, params });
    return Promise.resolve({ data });
  };
  return {
    calls,
    gmail: {
      users: {
        getProfile: log('gmail.users.getProfile', { emailAddress: 'me@example.com' }),
        messages: { send: log('gmail.users.messages.send', { id: 's1' }) },
        drafts: { create: log('gmail.users.drafts.create', { id: 'd1', message: { id: 'm1' } }) },
      },
    },
  };
}

test('broker-registry: listTools advertises ONLY the declared allowedVerbs', () => {
  const registry = buildRegistry({
    services: fakeServices(),
    routineId: 'weekly-review',
    allowedVerbs: ['create_draft'],
    grantCheck: () => true,
  });
  const tools = registry.listTools();
  assert.deepEqual(tools.map((t) => t.name), ['create_draft'], 'only the declared verb is advertised');
});

test('broker-registry: an undeclared verb throws "unknown broker verb" BEFORE any dispatch (zero side effect)', async () => {
  const services = fakeServices();
  const registry = buildRegistry({
    services,
    routineId: 'weekly-review',
    allowedVerbs: ['create_draft'], // send_digest_to_self is NOT declared
    grantCheck: () => true,
  });
  await assert.rejects(
    () => registry.callTool('send_digest_to_self', { subject: 's', body: 'b' }),
    /unknown broker verb/
  );
  assert.equal(services.calls.length, 0, 'the undeclared verb makes ZERO API calls (rejected before dispatch)');
});

test('broker-registry: absent/empty allowedVerbs advertises nothing and rejects every verb (fail closed)', async () => {
  const services = fakeServices();
  const absent = buildRegistry({ services, routineId: 'daily-digest', grantCheck: () => true });
  assert.deepEqual(absent.listTools(), [], 'absent allowedVerbs → advertise nothing');
  await assert.rejects(() => absent.callTool('create_draft', { to: 'x@y.z', subject: 's', body: 'b' }), /unknown broker verb/);

  const empty = buildRegistry({ services, routineId: 'daily-digest', allowedVerbs: [], grantCheck: () => true });
  assert.deepEqual(empty.listTools(), [], 'empty allowedVerbs → advertise nothing');
  await assert.rejects(() => empty.callTool('create_draft', { to: 'x@y.z', subject: 's', body: 'b' }), /unknown broker verb/);
  assert.equal(services.calls.length, 0, 'a fail-closed registry never dispatches');
});
