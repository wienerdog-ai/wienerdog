'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const grant = require('../../src/gws/grant');
const client = require('../../src/gws/client');
const { allowAll } = require('../../src/core/safety-profile');

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
client.getServices = () => currentServices;

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

test('gws-dispatch: gmail send without a grant degrades to draft + verbatim notice', async () => {
  const { paths, env } = initPaths();
  const s = stubGmail();
  currentServices = s.services;

  const output = await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        ['gmail', 'send', '--to', 'a@b.com', '--subject', 's', '--body', 'b'],
        { profile: allowAll() }
      )
    )
  );

  assert.equal(s.calls.send.length, 0);
  assert.equal(s.calls.drafts.length, 1);
  assert.match(output, /No matching send grant \(no send grant for this routine\)/);
  assert.match(output, /saved a draft instead/);
  assert.match(output, /wienerdog grant send --routine <name> --to <recipients>/);
  void paths;
});

test('gws-dispatch: gmail send with a matching --routine grant sends for real', async () => {
  const { paths, env } = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['a@b.com'] });
  const s = stubGmail();
  currentServices = s.services;

  await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        [
          'gmail',
          'send',
          '--to',
          'a@b.com',
          '--subject',
          's',
          '--body',
          'b',
          '--routine',
          'daily-digest',
        ],
        { profile: allowAll() }
      )
    )
  );

  assert.equal(s.calls.send.length, 1);
  assert.equal(s.calls.drafts.length, 0);
  assert.match(decode(s.calls.send[0].requestBody.raw), /To: a@b\.com/);
});

test('gws-dispatch: WIENERDOG_JOB env supplies the routine when --routine is absent', async () => {
  const { paths, env } = initPaths();
  grant.saveGrant(paths, { routine: 'daily-digest', to: ['a@b.com'] });
  const s = stubGmail();
  currentServices = s.services;

  const savedJob = process.env.WIENERDOG_JOB;
  process.env.WIENERDOG_JOB = 'daily-digest';
  try {
    await captureStdout(() =>
      withEnv(env, () =>
        gwsIndex.run(
          ['gmail', 'send', '--to', 'a@b.com', '--subject', 's', '--body', 'b'],
          { profile: allowAll() }
        )
      )
    );
  } finally {
    if (savedJob === undefined) delete process.env.WIENERDOG_JOB;
    else process.env.WIENERDOG_JOB = savedJob;
  }

  assert.equal(s.calls.send.length, 1);
  assert.equal(s.calls.drafts.length, 0);
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

test('gws-dispatch: cal draft-event still works through the run() bridge', async () => {
  const { env } = initPaths();
  const s = stubCalendar();
  currentServices = s.services;

  await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        [
          'cal',
          'draft-event',
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

test('gws-dispatch: repeatable --attendee accumulates through to cal draft-event', async () => {
  const { env } = initPaths();
  const s = stubCalendar();
  currentServices = s.services;

  await captureStdout(() =>
    withEnv(env, () =>
      gwsIndex.run(
        [
          'cal',
          'draft-event',
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

test('gws dispatch: gmail read accepts --id flag form', async () => {
  const { env } = initPaths();
  const calls = [];
  currentServices = {
    gmail: {
      users: {
        messages: {
          get: async (o) => {
            calls.push(o);
            return { data: { id: o.id, snippet: '', payload: { headers: [] } } };
          },
        },
      },
    },
  };
  await withEnv(env, () =>
    captureStdout(() =>
      gwsIndex.run(['gmail', 'read', '--id', 'msg-42', '--json'], { profile: allowAll() })
    )
  );
  assert.equal(calls[0].id, 'msg-42');
});

test('gws-dispatch freeze: gmail search fails closed with the gws-use disabled error before any API call', async () => {
  const calls = { list: [], get: [] };
  currentServices = {
    gmail: {
      users: {
        messages: {
          list: async (args) => {
            calls.list.push(args);
            return { data: { messages: [] } };
          },
          get: async (args) => {
            calls.get.push(args);
            return { data: {} };
          },
        },
      },
    },
  };

  // No opts passed -> the frozen A0 profile applies; no env/argv override exists.
  await assert.rejects(gwsIndex.run(['gmail', 'search', 'x']), /disabled in this release/);

  assert.equal(calls.list.length, 0);
  assert.equal(calls.get.length, 0);
});

test('gws-dispatch freeze: auth fails closed with the google-setup disabled error before the client JSON is read', async () => {
  // A path that does not exist: the freeze must throw the "disabled" error
  // BEFORE the auth handler ever attempts to read it, not a file-read error.
  await assert.rejects(gwsIndex.run(['auth', '--client', '/nope.json']), (err) => {
    assert.match(err.message, /disabled in this release/);
    assert.doesNotMatch(err.message, /could not read the client JSON/);
    return true;
  });
});
