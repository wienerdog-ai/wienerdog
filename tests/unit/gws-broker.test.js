'use strict';

// WP-gws-getprofile-via-read: compositeServices must route getProfile (and the
// message reads) to the READ credential and messages.send to the SEND credential.
// The SEND scope (gmail.send) cannot call users.getProfile, so wiring it to SEND
// would 403 at runtime (the daily digest + fail-loud alert would never send).
// This is a CI-runnable regression lock; the live broker-e2e covers the real path.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { compositeServices, assembleRegistry } = require('../../src/cli/gws-broker');
const { requiredClassesFor } = require('../../src/gws/broker/verbs');
const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');

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

// ------------------------------------------------------------------ AUD-D6

/** Isolated temp core with NO Google credentials at all — loadCredentialServices
 *  fails fast and locally for every class (fixed WienerdogError, no network). */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gwsbroker-'));
  return getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd'), WIENERDOG_VAULT: path.join(root, 'vault') });
}

/** A SINGLETON profile: brokerVerbs is exactly [verb] — deliberately with NO
 *  READ sibling such as gmail_read, which would make the OLD single-class
 *  derivation load READ anyway and mask the defect (criterion 8). */
function singletonProfile(verb) {
  return { id: 'aud-d6-singleton', kind: 'routine', mcp: 'broker', brokerVerbs: [verb] };
}

/** An injected loader that resolves the classes in `available`, rejects
 *  (fixed, secret-free) every other class, and records every class it was
 *  asked to load — the instrumentation criterion 8 requires: the identity
 *  asserts the set of classes ACTUALLY REQUESTED, not only the outcome. */
function instrumentedLoader(available) {
  const requested = [];
  const loadServices = async (paths, cls) => {
    requested.push(cls);
    if (available.has('READ') && cls === 'READ') {
      return {
        gmail: {
          users: {
            getProfile: async () => ({ data: { emailAddress: 'me@x.com' } }),
            messages: {
              get: async (p) => ({
                data: { id: p.id, threadId: 't1', payload: { headers: [{ name: 'From', value: 'alice@example.org' }, { name: 'Subject', value: 'hi' }] } },
              }),
            },
          },
        },
      };
    }
    if (available.has('DRAFT') && cls === 'DRAFT') {
      return { gmail: { users: { drafts: { create: async () => ({ data: { id: 'd1', message: { id: 'm1' } } }) } } } };
    }
    throw new WienerdogError(`${cls} credential unavailable (test double)`);
  };
  return { requested, loadServices };
}

function argsFor(verb) {
  return verb === 'create_draft_to_self' ? { subject: 's', body: 'b' } : { id: 'm1', body: 'b' };
}

test('gws-broker: [AUD-D6] on a SINGLETON profile, every class a verb requires is REQUESTED and must have loaded before it dispatches — the real assembly path, three credential states, and the default loader', async () => {
  for (const verb of ['create_draft_to_self', 'create_reply_draft']) {
    // State 1: READ unavailable, DRAFT loaded.
    {
      const { requested, loadServices } = instrumentedLoader(new Set(['DRAFT']));
      const registry = await assembleRegistry(tempPaths(), singletonProfile(verb), { loadServices });
      assert.deepEqual([...new Set(requested)].sort(), ['DRAFT', 'READ'], `[AUD-D6] ${verb}: READ-unavailable state — the classes REQUESTED are {DRAFT, READ}`);
      await assert.rejects(
        () => registry.callTool(verb, argsFor(verb)),
        (err) => err.message === 'the READ credential is not available in this run',
        `[AUD-D6] ${verb}: READ unavailable — the exact fixed refusal, zero Google calls`
      );
    }

    // State 2: DRAFT unavailable, READ loaded.
    {
      const { requested, loadServices } = instrumentedLoader(new Set(['READ']));
      const registry = await assembleRegistry(tempPaths(), singletonProfile(verb), { loadServices });
      assert.deepEqual([...new Set(requested)].sort(), ['DRAFT', 'READ'], `[AUD-D6] ${verb}: DRAFT-unavailable state — the classes REQUESTED are {DRAFT, READ}`);
      await assert.rejects(
        () => registry.callTool(verb, argsFor(verb)),
        (err) => err.message === 'the DRAFT credential is not available in this run',
        `[AUD-D6] ${verb}: DRAFT unavailable — the same sentence naming DRAFT, zero Google calls`
      );
    }

    // State 3: both loaded — the call reaches the verb's handler.
    {
      const { requested, loadServices } = instrumentedLoader(new Set(['READ', 'DRAFT']));
      const registry = await assembleRegistry(tempPaths(), singletonProfile(verb), { loadServices });
      assert.deepEqual([...new Set(requested)].sort(), ['DRAFT', 'READ'], `[AUD-D6] ${verb}: both-loaded state — the classes REQUESTED are {DRAFT, READ}`);
      const res = await registry.callTool(verb, argsFor(verb));
      assert.equal(res.content[0].type, 'text', `[AUD-D6] ${verb}: both loaded — dispatch reaches the verb's handler`);
    }
  }

  // The requested-class and missing-class assertions must hold on the
  // NO-deps path too. A credential-less temp core makes the REAL default
  // loadCredentialServices fail fast for every class it is asked to load;
  // assembleRegistry's own per-class stderr trace — written identically on
  // both the injected and default paths — is the observable that shows
  // BOTH classes were attempted, not only the verb's own capabilityClass.
  for (const verb of ['create_draft_to_self', 'create_reply_draft']) {
    const originalWrite = process.stderr.write;
    const lines = [];
    process.stderr.write = (chunk) => {
      lines.push(String(chunk));
      return true;
    };
    let registry;
    try {
      registry = await assembleRegistry(tempPaths(), singletonProfile(verb));
    } finally {
      process.stderr.write = originalWrite;
    }
    assert.ok(
      lines.some((l) => l.includes('READ credential unavailable')),
      `[AUD-D6] ${verb}: no-deps path — READ was REQUESTED (its unavailability was reported)`
    );
    assert.ok(
      lines.some((l) => l.includes('DRAFT credential unavailable')),
      `[AUD-D6] ${verb}: no-deps path — DRAFT was REQUESTED (its unavailability was reported)`
    );
    await assert.rejects(
      () => registry.callTool(verb, argsFor(verb)),
      (err) => /credential is not available in this run/.test(err.message),
      `[AUD-D6] ${verb}: no-deps path — dispatch still refuses fail-closed`
    );
  }

  // An unknown verb name makes requiredClassesFor throw.
  assert.throws(
    () => requiredClassesFor(['not_a_real_verb']),
    /unknown broker verb/,
    '[AUD-D6] an unknown verb name makes requiredClassesFor throw'
  );
});
