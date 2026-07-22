'use strict';

// WP-gws-getprofile-via-read: compositeServices must route getProfile (and the
// message reads) to the READ credential and messages.send to the SEND credential.
// The SEND scope (gmail.send) cannot call users.getProfile, so wiring it to SEND
// would 403 at runtime (the daily digest + fail-loud alert would never send).
// This is a CI-runnable regression lock; the live broker-e2e covers the real path.

const test = require('node:test');
const assert = require('node:assert/strict');

const { compositeServices } = require('../../src/cli/gws-broker');

/** A per-class fake gmail service that records which methods it was called on. */
function fakeClass(label) {
  const calls = [];
  return {
    calls,
    svc: {
      gmail: {
        users: {
          getProfile: (p) => { calls.push(['getProfile', p]); return { data: { emailAddress: `${label}@x` } }; },
          messages: {
            list: (p) => { calls.push(['list', p]); return {}; },
            get: (p) => { calls.push(['get', p]); return {}; },
            send: (p) => { calls.push(['send', p]); return { data: { id: 'm1' } }; },
          },
        },
      },
    },
  };
}

test('compositeServices: getProfile + reads route to READ; messages.send routes to SEND (WP-gws-getprofile-via-read)', () => {
  const read = fakeClass('read');
  const send = fakeClass('send');
  const composite = compositeServices({ READ: read.svc, SEND: send.svc });

  // getProfile is served — and only the READ credential handles it.
  const prof = composite.gmail.users.getProfile({ userId: 'me' });
  assert.equal(prof.data.emailAddress, 'read@x', 'getProfile resolved by the READ credential');
  assert.deepEqual(read.calls.map((c) => c[0]), ['getProfile']);
  assert.deepEqual(send.calls, [], 'SEND credential never handles getProfile (gmail.send cannot getProfile)');

  // messages.send is served — and only the SEND credential handles it.
  composite.gmail.users.messages.send({ userId: 'me', requestBody: { raw: 'x' } });
  assert.deepEqual(send.calls.map((c) => c[0]), ['send'], 'send routed to the SEND credential');
  // reads route to READ
  composite.gmail.users.messages.list({});
  composite.gmail.users.messages.get({});
  assert.deepEqual(read.calls.map((c) => c[0]), ['getProfile', 'list', 'get']);
});

test('compositeServices: with no READ credential, getProfile is unavailable — fail closed, not silently wired to SEND', () => {
  const send = fakeClass('send');
  const composite = compositeServices({ SEND: send.svc });
  // messages.send exists (SEND loaded) but getProfile does not (READ absent):
  // a SEND-only profile cannot self-resolve rather than 403-ing at runtime.
  assert.equal(typeof composite.gmail.users.messages.send, 'function');
  assert.equal(composite.gmail.users.getProfile, undefined, 'no getProfile without READ — never sourced from SEND');
});
