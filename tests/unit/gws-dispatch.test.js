'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');

const client = require('../../src/gws/client');
const grantStore = require('../../src/gws/broker/grant-store');
const { allowAll } = require('../../src/core/safety-profile');

// A fully-blocked profile (the pre-0.10.0 frozen shape). The released profile now
// defaults to all-allowed, so a bare dispatch no longer fails closed. Passing this
// via `opts.profile` still exercises the A0 fail-closed refusal before any credential load.
const BLOCKED = Object.freeze(Object.fromEntries(
  ['google-setup', 'gws-use', 'external-content-routine', 'daily-summary-injection', 'identity-auto-activation']
    .map((g) => [g, 'blocked'])
));

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/**
 * The client seam: index.js's `run()` always calls the real `getServices`, so
 * we monkeypatch that one export to hand back whatever stub the current test
 * installed — zero network, no token/client-json files needed. This MUST
 * happen before `../../src/gws/index` is first required, since it destructures
 * `getServices` out of this module at load time.
 */
let currentServices;
// Capture the genuine (throwing) getServices before we monkeypatch it, so the
// retirement-lock test below can assert the real combined-token accessor throws.
const realGetServices = client.getServices;
client.getServices = () => currentServices;
// WP-140: the cal bridge selects a per-class credential via getServicesForClass;
// the same stub serves every class in these dispatch tests.
client.getServicesForClass = () => currentServices;

const gwsIndex = require('../../src/gws/index');

/** Isolated temp core with a real config.yaml (via `init`), no token needed. */
function initPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-dispatch-'));
  const core = path.join(root, 'wd');
  const env = {
    ...process.env,
    // Isolate HOME: init runs sync, which writes the PATH shim to ~/.local/bin (WP-042).
    HOME: root,
    WIENERDOG_HOME: core,
    WIENERDOG_VAULT: path.join(root, 'vault'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  execFileSync('node', [bin, 'init', '--yes'], { env, stdio: 'ignore' });
  return { paths: getPaths(env), env };
}

/** Point index.js's bare `getPaths()` at a temp core for the duration of `fn`. */
async function withEnv(env, fn) {
  const keys = ['WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  for (const k of keys) process.env[k] = env[k];
  try {
    return await fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/** Capture everything written to stdout during `fn`. */
async function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

/** Stub Gmail service: spies for send/drafts/getProfile, no network. */
function stubGmail(emailAddress = 'me@example.com') {
  const calls = { send: [], drafts: [], profile: 0 };
  const services = {
    gmail: {
      users: {
        messages: {
          send: async (args) => {
            calls.send.push(args);
            return { data: { id: 'sent-1' } };
          },
        },
        drafts: {
          create: async (args) => {
            calls.drafts.push(args);
            return { data: { id: 'r-9', message: { id: 'm-9' } } };
          },
        },
        getProfile: async () => {
          calls.profile++;
          return { data: { emailAddress } };
        },
      },
    },
  };
  return { calls, services };
}

/** Stub Calendar service: spy for events.insert, no network. */
function stubCalendar() {
  const calls = { insert: [] };
  const services = {
    calendar: {
      events: {
        insert: async (args) => {
          calls.insert.push(args);
          return { data: { id: 'evt-1', htmlLink: 'https://calendar.google.com/evt-1' } };
        },
      },
    },
  };
  return { calls, services };
}

/** @param {string} raw @returns {string} */
function decode(raw) {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

test('gws-dispatch: getServices() (combined-token path) is RETIRED — it throws', () => {
  // Retirement lock (WP-gws-retire-dead-send-path): a regression re-enabling the
  // combined-token accessor would resurrect the forgeable legacy-grant send path.
  // Asserts the GENUINE implementation (captured before this file's monkeypatch).
  assert.throws(
    () => realGetServices(),
    (err) => err instanceof WienerdogError && /least-scope credentials/.test(err.message)
  );
});

test('gws-dispatch: _alert resolves getProfile via READ and sends via SEND (send scope cannot getProfile) — WP-gws-getprofile-via-read', async () => {
  const { env } = initPaths();
  // Distinct per-class stubs prove the self-address is resolved under READ and
  // the send happens under SEND — a single shared stub would pass vacuously.
  const readStub = stubGmail('owner@example.com');
  const sendStub = stubGmail('owner@example.com');
  const seenClasses = [];
  const savedForClass = client.getServicesForClass;
  client.getServicesForClass = (_paths, cls) => {
    seenClasses.push(cls);
    return cls === 'READ' ? readStub.services : sendStub.services;
  };
  try {
    await captureStdout(() =>
      withEnv(env, () =>
        gwsIndex.run(['_alert', '--subject', 's', '--body', 'b'], { profile: allowAll() })
      )
    );
  } finally {
    client.getServicesForClass = savedForClass;
  }

  assert.deepEqual(seenClasses, ['READ', 'SEND']);
  // getProfile hit READ only; send hit SEND only — the least-scope split holds.
  assert.equal(readStub.calls.profile, 1, 'getProfile resolved under READ');
  assert.equal(readStub.calls.send.length, 0, 'no send under READ');
  assert.equal(sendStub.calls.profile, 0, 'getProfile NOT called under SEND (gmail.send cannot getProfile)');
  assert.equal(sendStub.calls.send.length, 1, 'send happened under SEND');
  assert.match(decode(sendStub.calls.send[0].requestBody.raw), /To: owner@example\.com/);
});

test('gws-dispatch: _alert is invoked with exactly {subject, body}', async () => {
  const { env } = initPaths();
  const s = stubGmail('owner@example.com');
  currentServices = s.services;

  await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        ['_alert', '--subject', 'watchdog failed', '--body', 'job X crashed'],
        { profile: allowAll() }
      )
    )
  );

  assert.equal(s.calls.send.length, 1);
  const decoded = decode(s.calls.send[0].requestBody.raw);
  assert.match(decoded, /To: owner@example\.com/);
  assert.match(decoded, /Subject: \[wienerdog alert\] watchdog failed/);
  assert.match(decoded, /job X crashed/);
});

test('gws-dispatch: cal add-event works through the run() bridge under a calendar_write grant', async () => {
  const { paths, env } = initPaths();
  grantStore.putGrant(paths, { routineId: 'daily-digest', kind: 'calendar_write', to: [] }, { confirmedAtTty: true });
  const s = stubCalendar();
  currentServices = s.services;

  await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        [
          'cal',
          'add-event',
          '--routine',
          'daily-digest',
          '--title',
          't',
          '--start',
          '2026-07-03T09:00:00Z',
          '--end',
          '2026-07-03T09:15:00Z',
        ],
        { profile: allowAll() }
      )
    )
  );

  assert.equal(s.calls.insert.length, 1);
  const seen = s.calls.insert[0];
  assert.equal(seen.calendarId, 'primary');
  assert.equal(seen.sendUpdates, 'none');
  assert.equal(seen.requestBody.summary, 't');
  assert.deepEqual(seen.requestBody.start, { dateTime: '2026-07-03T09:00:00Z' });
  assert.deepEqual(seen.requestBody.end, { dateTime: '2026-07-03T09:15:00Z' });
});

test('gws-dispatch: repeatable --attendee accumulates through to cal add-event', async () => {
  const { paths, env } = initPaths();
  grantStore.putGrant(paths, { routineId: 'daily-digest', kind: 'calendar_write', to: [] }, { confirmedAtTty: true });
  const s = stubCalendar();
  currentServices = s.services;

  await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        [
          'cal',
          'add-event',
          '--routine',
          'daily-digest',
          '--title',
          't',
          '--start',
          '2026-07-03T09:00:00Z',
          '--end',
          '2026-07-03T09:15:00Z',
          '--attendee',
          'a@x.com',
          '--attendee',
          'c@x.com',
        ],
        { profile: allowAll() }
      )
    )
  );

  assert.equal(s.calls.insert.length, 1);
  assert.deepEqual(s.calls.insert[0].requestBody.attendees, [
    { email: 'a@x.com' },
    { email: 'c@x.com' },
  ]);
});

test('gws-dispatch freeze: a gws-use verb (_alert) fails closed with the disabled error before any credential load', async () => {
  let forClassCalls = 0;
  const savedForClass = client.getServicesForClass;
  client.getServicesForClass = () => {
    forClassCalls++;
    return currentServices;
  };
  try {
    // Explicit fully-blocked profile via the seam; no env/argv override exists.
    // The freeze must throw BEFORE the handler resolves a credential.
    await assert.rejects(
      gwsIndex.run(['_alert', '--subject', 's', '--body', 'b'], { profile: BLOCKED }),
      /disabled in this release/
    );
  } finally {
    client.getServicesForClass = savedForClass;
  }
  assert.equal(forClassCalls, 0);
});

test('gws-dispatch freeze: auth fails closed with the google-setup disabled error before the client JSON is read', async () => {
  // A path that does not exist: the freeze must throw the "disabled" error
  // BEFORE the auth handler ever attempts to read it, not a file-read error.
  await assert.rejects(gwsIndex.run(['auth', '--client', '/nope.json'], { profile: BLOCKED }), (err) => {
    assert.match(err.message, /disabled in this release/);
    assert.doesNotMatch(err.message, /could not read the client JSON/);
    return true;
  });
});
