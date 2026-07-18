'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const auth = require('../../src/gws/auth');

/** Fresh, isolated temp core (no app/deps installed). */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gws-auth-'));
  const core = path.join(root, 'wd');
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/** Write a valid Desktop-app OAuth client JSON to a temp file; return its path. */
function tempClientPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-gws-client-'));
  const file = path.join(dir, 'client.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      installed: {
        client_id: 'id123',
        client_secret: 'sec123',
        redirect_uris: ['http://localhost'],
      },
    })
  );
  return file;
}

// ---------------------------------------------------------------------------
// (i) run() with an injected oauthClient + opts.startLoopback fake.
// ---------------------------------------------------------------------------

const clientMod = require('../../src/gws/client');
const { requiredScopesFor } = require('../../src/gws/scope-sets');
const { CAPABILITY_CLASS } = require('../../src/gws/broker/constants');

/** A recording fake oauth client whose tokeninfo grants exactly what was requested. */
function fakeOauth(overrides = {}) {
  const state = { authUrlCalls: [], getTokenArgs: [], lastScope: null };
  return {
    state,
    generateCodeVerifierAsync: async () => ({ codeVerifier: 'ver', codeChallenge: 'chal' }),
    generateAuthUrl: (opts) => {
      state.authUrlCalls.push(opts);
      state.lastScope = opts.scope;
      return 'https://accounts.google.com/o/oauth2/v2/auth?fake=1';
    },
    getToken: async (arg) => {
      state.getTokenArgs.push(arg);
      return { tokens: { access_token: `at-${state.getTokenArgs.length}`, refresh_token: 'r' } };
    },
    setCredentials() {},
    getTokenInfo: overrides.getTokenInfo || (async () => ({ scopes: state.lastScope.slice() })),
  };
}

const fakeStartLoopback = (_expectedState) =>
  Promise.resolve({
    server: { close() {} },
    port: 12345,
    waitForCode: Promise.resolve('the-code'),
  });

const googleapisStub = {
  google: {
    gmail: () => {
      throw new Error('no gmail in this test');
    },
  },
};

test('run() runs ONE consent flow per capability class: per-class scopes, include_granted_scopes:false, PKCE, separate tokens', async () => {
  const paths = tempPaths();
  const clientPath = tempClientPath();
  const oauthClient = fakeOauth();

  const result = await auth.run(paths, {
    clientPath,
    startLoopback: fakeStartLoopback,
    oauthClient,
    googleapis: googleapisStub,
    yes: true,
    runInstall: () => ({ status: 0 }),
  });

  const classes = Object.values(CAPABILITY_CLASS);
  assert.equal(oauthClient.state.authUrlCalls.length, classes.length, 'one flow per class');
  for (let i = 0; i < classes.length; i++) {
    const call = oauthClient.state.authUrlCalls[i];
    assert.deepEqual(call.scope, requiredScopesFor(classes[i]), `flow ${i} requests the ${classes[i]} set`);
    assert.equal(call.include_granted_scopes, false, 'scope-bleed guard is explicit');
    assert.equal(typeof call.state, 'string');
    assert.ok(call.state.length > 0);
    assert.equal(call.code_challenge, 'chal');
    assert.equal(call.code_challenge_method, 'S256');
  }
  assert.deepEqual(oauthClient.state.getTokenArgs[0], { code: 'the-code', codeVerifier: 'ver' });

  for (const cls of classes) {
    assert.ok(
      fs.existsSync(clientMod.tokenPathForClass(paths, cls)),
      `token persisted for ${cls}`
    );
  }
  assert.equal(result.email, null);
  assert.equal(result.tokenPaths.length, classes.length);
});

test('run() fails the flow when the granted scopes are not exactly the requested least-scope set', async () => {
  const paths = tempPaths();
  const clientPath = tempClientPath();
  const oauthClient = fakeOauth({
    // Grants a superset on every flow — the exact-set verification must refuse.
    getTokenInfo: async () => ({
      scopes: [...requiredScopesFor(CAPABILITY_CLASS.READ), 'https://www.googleapis.com/auth/gmail.send'],
    }),
  });

  await assert.rejects(
    () =>
      auth.run(paths, {
        clientPath,
        startLoopback: fakeStartLoopback,
        oauthClient,
        googleapis: googleapisStub,
        yes: true,
        runInstall: () => ({ status: 0 }),
      }),
    /scope/i
  );
  assert.equal(
    fs.existsSync(clientMod.tokenPathForClass(paths, CAPABILITY_CLASS.READ)),
    false,
    'a token failing scope verification is NOT persisted'
  );
});

test('run() retires a legacy combined token (rename, never reuse)', async () => {
  const paths = tempPaths();
  const clientPath = tempClientPath();
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  clientMod.persistToken(paths, { access_token: 'legacy' });

  await auth.run(paths, {
    clientPath,
    startLoopback: fakeStartLoopback,
    oauthClient: fakeOauth(),
    googleapis: googleapisStub,
    yes: true,
    runInstall: () => ({ status: 0 }),
  });

  assert.equal(fs.existsSync(clientMod.tokenPath(paths)), false, 'legacy token renamed away');
  assert.ok(fs.existsSync(`${clientMod.tokenPath(paths)}.retired`));
});

// ---------------------------------------------------------------------------
// (ii) Real startLoopback(expectedState, timeoutMs) — state verification +
// timeout. Driven with real loopback HTTP requests.
// ---------------------------------------------------------------------------

const PENDING = Symbol('pending');

/** Resolve to PENDING if `p` has not settled within `ms`; else to `p`'s outcome. */
function raceIsPending(p, ms) {
  const timer = new Promise((resolve) => setTimeout(() => resolve(PENDING), ms));
  return Promise.race([p.then((v) => ({ settled: 'resolved', v })).catch((e) => ({ settled: 'rejected', e })), timer]);
}

test('startLoopback ignores a mismatched-state callback and keeps listening', async () => {
  const expected = 'expected-state-value';
  const { server, port, waitForCode } = await auth.startLoopback(expected, 60_000);
  try {
    await fetch(`http://127.0.0.1:${port}/?state=wrong&code=x`);
    const outcome = await raceIsPending(waitForCode, 50);
    assert.equal(outcome, PENDING, 'waitForCode must still be pending after a mismatched-state callback');
  } finally {
    server.close();
  }
});

test('startLoopback ignores an absent-state callback and keeps listening', async () => {
  const expected = 'expected-state-value';
  const { server, port, waitForCode } = await auth.startLoopback(expected, 60_000);
  try {
    await fetch(`http://127.0.0.1:${port}/?code=x`);
    const outcome = await raceIsPending(waitForCode, 50);
    assert.equal(outcome, PENDING, 'waitForCode must still be pending after an absent-state callback');
  } finally {
    server.close();
  }
});

test('startLoopback resolves waitForCode only on a matching-state callback, after ignoring mismatches', async () => {
  const expected = 'expected-state-value';
  const { server, port, waitForCode } = await auth.startLoopback(expected, 60_000);
  try {
    await fetch(`http://127.0.0.1:${port}/?state=wrong&code=x`);
    await fetch(`http://127.0.0.1:${port}/?code=x`); // absent state
    await fetch(`http://127.0.0.1:${port}/?state=${expected}&code=good`);
    const code = await waitForCode;
    assert.equal(code, 'good');
  } finally {
    server.close();
  }
});

test('startLoopback rejects on a matching-state error= callback; a mismatched-state error= is ignored', async () => {
  const expected = 'expected-state-value';
  const { server, port, waitForCode } = await auth.startLoopback(expected, 60_000);
  try {
    // Mismatched-state error is ignored — still pending.
    await fetch(`http://127.0.0.1:${port}/?state=wrong&error=access_denied`);
    let outcome = await raceIsPending(waitForCode, 50);
    assert.equal(outcome, PENDING);

    // Matching-state error rejects.
    await fetch(`http://127.0.0.1:${port}/?state=${expected}&error=access_denied`);
    await assert.rejects(waitForCode, (err) => {
      assert.match(err.message, /Google denied authorization: access_denied/);
      return true;
    });
  } finally {
    server.close();
  }
});

test('startLoopback rejects with a plain-language timeout error when no matching callback arrives', async () => {
  const expected = 'expected-state-value';
  const { server, port, waitForCode } = await auth.startLoopback(expected, 50);
  try {
    // Only a mismatched-state request arrives before the tiny timeout fires.
    await fetch(`http://127.0.0.1:${port}/?state=wrong&code=x`);
    await assert.rejects(waitForCode, (err) => {
      assert.match(err.message, /Timed out waiting for Google authorization/);
      return true;
    });
  } finally {
    server.close();
  }
});
