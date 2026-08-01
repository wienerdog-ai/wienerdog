'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const {
  ACK_FILE,
  ackPath,
  ackKey,
  readAcks,
  addAcks,
  pruneAcksForJob,
  unacknowledgedAlerts,
} = require('../../src/core/alert-ack');
const { appendAlert, clearAlerts, readAlerts } = require('../../src/core/alerts');
const { A5_PRIVATE_FILE_BASENAMES } = require('../../src/core/private-fs');
const { renderDigest } = require('../../src/core/digest');
const alertsCli = require('../../src/cli/alerts');

/** Isolated temp core; state/ is created lazily by appendAlert. (copied from
 *  tests/unit/alerts.test.js:20-26) */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-alerts-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  return { root, paths };
}

/** @param {string} job */
function rec(job, at, reason) {
  return { job, at, reason, log_hint: `~/.wienerdog/logs/${job}/` };
}

/** Capture stdout writes during fn. */
async function withStdout(fn) {
  const chunks = [];
  const orig = process.stdout.write;
  process.stdout.write = (c) => {
    chunks.push(String(c));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join('');
}

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'identity-filled');

// -------------------------------------------------------------------------
// A1 — AC1
// -------------------------------------------------------------------------

test('alert-ack: no store renders every alert unchanged', () => {
  const { paths } = setup();
  const alerts = [
    rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'),
    rec('digest', '2026-07-04T07:00:00.000Z', 'exited 2'),
  ];
  assert.ok(!fs.existsSync(ackPath(paths)), 'precondition: no store on disk');
  const out = unacknowledgedAlerts(paths, alerts);
  assert.deepEqual(out, alerts);
});

// -------------------------------------------------------------------------
// A2 — AC2
// -------------------------------------------------------------------------

test('alert-ack: addAcks writes a 0600 schema-1 store', { skip: process.platform === 'win32' }, () => {
  const { paths } = setup();
  const alerts = [
    rec('--catch-up', '2026-07-25T19:12:34.322Z', 'refusing to run'),
    rec('--catch-up', '2026-08-01T10:00:05.159Z', 'refusing to run'),
  ];
  const { added } = addAcks(paths, alerts);
  assert.equal(added, 1, 'the two records collapse to one distinct (job, reason) pair');

  const file = ackPath(paths);
  assert.ok(fs.existsSync(file));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'store is 0600');

  const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(obj.schema, 1);
  assert.equal(obj.acked.length, 1);
  assert.match(obj.acked[0].key, /^[0-9a-f]{64}$/);
  assert.equal(obj.acked[0].job, '--catch-up');
});

// -------------------------------------------------------------------------
// A3 — AC3, AC14
// -------------------------------------------------------------------------

test('alert-ack: addAcks is idempotent', () => {
  const { paths } = setup();
  const alerts = [rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1')];
  const first = addAcks(paths, alerts);
  assert.equal(first.added, 1);
  const bytesAfterFirst = fs.readFileSync(ackPath(paths));

  const second = addAcks(paths, alerts);
  assert.deepEqual(second, { added: 0 });
  const bytesAfterSecond = fs.readFileSync(ackPath(paths));
  assert.ok(bytesAfterFirst.equals(bytesAfterSecond), 'bytes unchanged on the no-op second call');
});

// -------------------------------------------------------------------------
// A4 — AC4
// -------------------------------------------------------------------------

test('alert-ack: the key covers both job and reason', () => {
  assert.notEqual(ackKey('a', 'r'), ackKey('b', 'r'), 'job is inside the hash');
  assert.notEqual(ackKey('a', 'r'), ackKey('a', 'r '), 'reason is inside the hash, byte-exact');
});

// -------------------------------------------------------------------------
// A5 — AC5
// -------------------------------------------------------------------------

test('alert-ack: acknowledged pairs are dropped and only those', () => {
  const { paths } = setup();
  const alerts = [
    rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'),
    rec('digest', '2026-07-04T07:00:00.000Z', 'exited 1'), // same reason, different job
    rec('dream', '2026-07-05T01:00:00.000Z', 'timed out'),
  ];
  addAcks(paths, [{ job: 'dream', reason: 'exited 1' }]);

  const remaining = unacknowledgedAlerts(paths, alerts);
  assert.deepEqual(remaining, [
    rec('digest', '2026-07-04T07:00:00.000Z', 'exited 1'),
    rec('dream', '2026-07-05T01:00:00.000Z', 'timed out'),
  ]);
});

// -------------------------------------------------------------------------
// A6 — AC6
// -------------------------------------------------------------------------

test('alert-ack: a changed reason surfaces again', () => {
  const { paths } = setup();
  addAcks(paths, [{ job: 'dream', reason: 'exited 1' }]);
  const alerts = [rec('dream', '2026-07-06T01:00:00.000Z', 'exited 1x')]; // one byte different
  const remaining = unacknowledgedAlerts(paths, alerts);
  assert.deepEqual(remaining, alerts, 'a one-byte-different reason is not suppressed');
});

// -------------------------------------------------------------------------
// A7 — AC7
// -------------------------------------------------------------------------

test('alert-ack: a corrupt store fails open', () => {
  const { paths } = setup();
  const alerts = [rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1')];
  fs.mkdirSync(paths.state, { recursive: true });
  const file = ackPath(paths);

  const cases = [
    'not JSON',
    JSON.stringify({ schema: 2, acked: [] }),
    JSON.stringify({ schema: 1, acked: 'x' }),
    JSON.stringify({ schema: 1, acked: [{ job: 'dream', key: '__proto__', at: '2026-01-01T00:00:00.000Z' }] }),
  ];
  for (const content of cases) {
    fs.writeFileSync(file, content);
    assert.doesNotThrow(() => unacknowledgedAlerts(paths, alerts));
    const out = unacknowledgedAlerts(paths, alerts);
    assert.deepEqual(out, alerts, `fails open for: ${content}`);
  }
});

// -------------------------------------------------------------------------
// A8 — AC8
// -------------------------------------------------------------------------

test('alert-ack: clearAlerts prunes that job\'s acknowledgements', () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  appendAlert(paths, rec('digest', '2026-07-04T07:00:00.000Z', 'exited 2'));
  addAcks(paths, [
    { job: 'dream', reason: 'exited 1' },
    { job: 'digest', reason: 'exited 2' },
  ]);
  assert.equal(readAcks(paths).length, 2);

  clearAlerts(paths, 'dream');
  const afterAcks = readAcks(paths);
  assert.deepEqual(afterAcks.map((a) => a.job), ['digest'], "only dream's acknowledgements were pruned");
  assert.ok(fs.existsSync(ackPath(paths)), 'store remains while digest ack exists');

  clearAlerts(paths, 'digest');
  assert.deepEqual(readAcks(paths), []);
  assert.ok(!fs.existsSync(ackPath(paths)), 'store removed when no acknowledgements remain');
});

// -------------------------------------------------------------------------
// A9 — AC9
// -------------------------------------------------------------------------

test('alert-ack: the store is private-mode covered', () => {
  assert.ok(A5_PRIVATE_FILE_BASENAMES.includes(ACK_FILE));
});

// -------------------------------------------------------------------------
// A10 — AC1
// -------------------------------------------------------------------------

test('alert-ack: the digest is byte-identical with an empty store', () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  const raw = readAlerts(paths);
  const withStore = renderDigest(FIXTURE, undefined, { alerts: raw });
  const filtered = renderDigest(FIXTURE, undefined, { alerts: unacknowledgedAlerts(paths, raw) });
  assert.equal(filtered, withStore, 'no ack store on disk → byte-identical digest output');
});

// -------------------------------------------------------------------------
// A11 — AC11
// -------------------------------------------------------------------------

test('alerts cli: only the typed word ack acknowledges', async () => {
  for (const answer of ['yes', 'y', 'ACK', '']) {
    const { paths } = setup();
    appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
    const out = await withStdout(() =>
      alertsCli.run(['ack'], { paths, promptFn: async () => answer })
    );
    assert.ok(!fs.existsSync(ackPath(paths)), `no file written for answer ${JSON.stringify(answer)}`);
    assert.ok(out.includes('wienerdog: nothing was acknowledged.'));
  }

  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  const out = await withStdout(() => alertsCli.run(['ack'], { paths, promptFn: async () => 'ack' }));
  assert.ok(fs.existsSync(ackPath(paths)), 'store written on the exact word "ack"');
  assert.ok(out.includes('acknowledged 1 alert(s)'));
});

// -------------------------------------------------------------------------
// A12 — AC12
// -------------------------------------------------------------------------

test('alerts cli: --yes does not bypass the prompt', async () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  let calls = 0;
  let question = null;
  const promptFn = async (q) => {
    calls += 1;
    question = q;
    return 'ack';
  };
  await withStdout(() => alertsCli.run(['ack'], { paths, promptFn }));
  assert.equal(calls, 1);
  assert.equal(
    question,
    'Type the word "ack" to stop showing the alert(s) above in your session digest (anything else cancels): '
  );

  const { paths: paths2 } = setup();
  appendAlert(paths2, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  let calls2 = 0;
  const promptFn2 = async () => {
    calls2 += 1;
    return 'ack';
  };
  await withStdout(() => alertsCli.run(['ack', '--yes'], { paths: paths2, promptFn: promptFn2 }));
  assert.equal(calls2, 1, '--yes never bypasses the prompt');
});

// -------------------------------------------------------------------------
// A13 — AC13
// -------------------------------------------------------------------------

test('alerts cli: list and unknown subcommand', async () => {
  const { paths } = setup();

  await assert.rejects(() => alertsCli.run(['bogus'], { paths }), /unknown alerts subcommand "bogus"/);
  assert.ok(!fs.existsSync(ackPath(paths)), 'unknown subcommand creates no file');

  const outEmpty = await withStdout(() => alertsCli.run([], { paths }));
  assert.ok(outEmpty.includes('wienerdog: no alerts on record.'));
  assert.ok(!fs.existsSync(ackPath(paths)));

  appendAlert(paths, rec('dream', '2026-07-04T01:00:00.000Z', 'exited 1'));
  const outList = await withStdout(() => alertsCli.run(['list'], { paths }));
  assert.ok(outList.includes('1 distinct alert(s) on record.'));
  assert.ok(outList.includes('job "dream"'));
  assert.ok(!fs.existsSync(ackPath(paths)), 'list never writes the ack store');
});

// A13 (extension) — grouping must not assume alerts.jsonl is sorted by `at`;
// it is file-write order. A newest-first write for one (job, reason) must
// still render the group's range earliest-to-latest, never reversed.
test('alerts cli: grouped range is earliest-to-latest even when written newest-first', async () => {
  const { paths } = setup();
  appendAlert(paths, rec('dream', '2026-08-01T00:00:00.000Z', 'exited 1'));
  appendAlert(paths, rec('dream', '2026-07-01T00:00:00.000Z', 'exited 1'));

  const outList = await withStdout(() => alertsCli.run(['list'], { paths }));
  assert.ok(
    outList.includes('2 times, 2026-07-01T00:00:00.000Z to 2026-08-01T00:00:00.000Z'),
    'range is earliest to latest, not reversed'
  );
  assert.ok(!outList.includes('2026-08-01T00:00:00.000Z to 2026-07-01T00:00:00.000Z'));
});
