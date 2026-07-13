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

test('run() sends state + PKCE on the auth URL and codeVerifier on the token exchange', async () => {
  const paths = tempPaths();
  const clientPath = tempClientPath();

  const fakeStartLoopback = (_expectedState) =>
    Promise.resolve({
      server: { close() {} },
      port: 12345,
      waitForCode: Promise.resolve('the-code'),
    });

  let generateAuthUrlOpts;
  let getTokenArg;
  const oauthClient = {
    generateCodeVerifierAsync: async () => ({ codeVerifier: 'ver', codeChallenge: 'chal' }),
    generateAuthUrl: (opts) => {
      generateAuthUrlOpts = opts;
      return 'https://accounts.google.com/o/oauth2/v2/auth?fake=1';
    },
    getToken: async (arg) => {
      getTokenArg = arg;
      return { tokens: { access_token: 'a' } };
    },
    setCredentials() {},
  };

  const googleapisStub = {
    google: {
      gmail: () => {
        throw new Error('no gmail in this test');
      },
    },
  };

  const result = await auth.run(paths, {
    clientPath,
    startLoopback: fakeStartLoopback,
    oauthClient,
    googleapis: googleapisStub,
    yes: true,
    runInstall: () => ({ status: 0 }),
  });

  assert.equal(typeof generateAuthUrlOpts.state, 'string');
  assert.ok(generateAuthUrlOpts.state.length > 0);
  assert.equal(generateAuthUrlOpts.code_challenge, 'chal');
  assert.equal(generateAuthUrlOpts.code_challenge_method, 'S256');

  assert.deepEqual(getTokenArg, { code: 'the-code', codeVerifier: 'ver' });

  assert.equal(result.email, null);
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
