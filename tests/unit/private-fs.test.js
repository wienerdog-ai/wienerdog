'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mkdirPrivate,
  writeFilePrivate,
  createLogStreamPrivate,
  repairPrivateModes,
  scanPrivateModes,
  insecureEntries,
  A5_PRIVATE_DIRS,
  A5_PRIVATE_FILE_BASENAMES,
  A9_PRIVATE_DIRS,
  A9_PRIVATE_STATE_FILES,
  A9_PRIVATE_CORE_FILES,
} = require('../../src/core/private-fs');
const { WienerdogError } = require('../../src/core/errors');

const POSIX = process.platform !== 'win32';

/** @param {string} p @returns {number} */
function modeOf(p) {
  return fs.statSync(p).mode & 0o777;
}

/** Minimal paths object over a temp root, shaped like getPaths()'s A5+A9 fields. */
function pathsFor(root) {
  return {
    core: path.join(root, 'wd'),
    config: path.join(root, 'wd', 'config.yaml'),
    manifest: path.join(root, 'wd', 'install-manifest.json'),
    state: path.join(root, 'wd', 'state'),
    logs: path.join(root, 'wd', 'logs'),
    secrets: path.join(root, 'wd', 'secrets'),
  };
}

/** Run `fn` under a permissive umask, restoring the previous one. */
function withUmask(mask, fn) {
  const prev = process.umask(mask);
  try {
    return fn();
  } finally {
    process.umask(prev);
  }
}

test('private-fs: mkdirPrivate produces 0700 under a permissive umask (worked example)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    mkdirPrivate(path.join(root, 'state'));
    assert.equal(modeOf(path.join(root, 'state')), 0o700);
    mkdirPrivate(path.join(root, 'state')); // idempotent
    assert.equal(modeOf(path.join(root, 'state')), 0o700);
  });
});

test('private-fs: writeFilePrivate writes 0600 atomically, parent 0700 (worked example)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const dest = path.join(root, 'state', 'x');
    writeFilePrivate(dest, 'hi');
    assert.equal(fs.readFileSync(dest, 'utf8'), 'hi');
    assert.equal(modeOf(dest), 0o600);
    assert.equal(modeOf(path.join(root, 'state')), 0o700);
    writeFilePrivate(dest, 'second'); // overwrite keeps the mode
    assert.equal(fs.readFileSync(dest, 'utf8'), 'second');
    assert.equal(modeOf(dest), 0o600);
    assert.deepEqual(fs.readdirSync(path.join(root, 'state')), ['x'], 'no leftover temp file');
  });
});

test('private-fs: repairPrivateModes fixes a legacy 0755/0644 install and is idempotent', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o755 });
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true, mode: 0o755 });
    fs.mkdirSync(path.join(paths.state, 'dream-scratch'), { recursive: true, mode: 0o755 });
    fs.mkdirSync(path.join(paths.state, 'quarantine'), { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(paths.state, 'digest.md'), 'd', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'alerts.jsonl'), '{}\n', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.logs, 'dream', 'run.log'), 'log', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'dream-scratch', 'a.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'quarantine', '2026-07-17-leak.md'), 's', { mode: 0o644 });

    const first = repairPrivateModes(paths);
    assert.ok(first.changed >= 9, `expected >= 9 changes, got ${first.changed}`);
    assert.equal(modeOf(paths.core), 0o700);
    assert.equal(modeOf(paths.state), 0o700);
    assert.equal(modeOf(paths.logs), 0o700);
    assert.equal(modeOf(path.join(paths.state, 'dream-scratch')), 0o700);
    assert.equal(modeOf(path.join(paths.state, 'quarantine')), 0o700);
    assert.equal(modeOf(path.join(paths.state, 'digest.md')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'alerts.jsonl')), 0o600);
    assert.equal(modeOf(path.join(paths.logs, 'dream', 'run.log')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'dream-scratch', 'a.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'quarantine', '2026-07-17-leak.md')), 0o600);

    assert.deepEqual(repairPrivateModes(paths), { changed: 0 }, 'second call is a no-op');
  });
});

test('private-fs: repairPrivateModes fixes a legacy A9 install — secrets/, tokens, grants/pins, metadata, log dirs (WP-a9)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.chmodSync(paths.secrets, 0o755);
    fs.writeFileSync(path.join(paths.secrets, 'google-token-read.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.secrets, 'google-client.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'broker-grants.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'exec-pins.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'run-evidence.jsonl'), '{}\n', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'schedule.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.state, 'watermarks.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(paths.config, 'vault: null\n', { mode: 0o644 });
    fs.writeFileSync(paths.manifest, '{}\n', { mode: 0o644 });
    fs.mkdirSync(path.join(paths.logs, 'dream'), { recursive: true });
    fs.chmodSync(paths.logs, 0o700);
    fs.chmodSync(path.join(paths.logs, 'dream'), 0o777);

    const before = insecureEntries(paths);
    assert.ok(before.includes(paths.secrets), 'a loosened secrets/ is flagged');
    assert.ok(before.includes(path.join(paths.secrets, 'google-token-read.json')), 'a loosened token is flagged');
    assert.ok(before.includes(paths.config), 'a loosened config.yaml is flagged (metadata, repair-only)');
    assert.ok(before.includes(path.join(paths.logs, 'dream')), 'a loosened logs/<job> dir is flagged');
    assert.equal(before.length, 11, 'secrets dir + log dir + 9 files');

    const first = repairPrivateModes(paths);
    assert.equal(first.changed, 11, 'every wrong-moded entry repaired');
    assert.equal(modeOf(paths.secrets), 0o700);
    assert.equal(modeOf(path.join(paths.secrets, 'google-token-read.json')), 0o600);
    assert.equal(modeOf(path.join(paths.secrets, 'google-client.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'broker-grants.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'exec-pins.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'run-evidence.jsonl')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'schedule.json')), 0o600);
    assert.equal(modeOf(path.join(paths.state, 'watermarks.json')), 0o600);
    assert.equal(modeOf(paths.config), 0o600);
    assert.equal(modeOf(paths.manifest), 0o600);
    assert.equal(modeOf(path.join(paths.logs, 'dream')), 0o700);

    assert.deepEqual(repairPrivateModes(paths), { changed: 0 }, 'second call is a no-op');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 });
  });
});

test('private-fs: an over-tight 0600 or 000 secrets/ is flagged (broken store) and repaired to 0700 (WP-a9)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    for (const tight of [0o600, 0o000]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
      const paths = pathsFor(root);
      fs.mkdirSync(paths.secrets, { recursive: true });
      fs.chmodSync(paths.core, 0o700);
      fs.chmodSync(paths.secrets, tight);

      const flagged = insecureEntries(paths);
      assert.ok(flagged.includes(paths.secrets), `a ${tight.toString(8)} secrets/ is flagged, not passed as clean`);
      repairPrivateModes(paths);
      assert.equal(modeOf(paths.secrets), 0o700, `a ${tight.toString(8)} secrets/ is repaired`);
    }
  });
});

test('private-fs: over-tight FILES are flagged in either direction too (expected-mode equality)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.chmodSync(paths.state, 0o700);
    fs.writeFileSync(path.join(paths.state, 'broker-grants.json'), '{}', { mode: 0o400 });

    assert.deepEqual(insecureEntries(paths), [path.join(paths.state, 'broker-grants.json')]);
    repairPrivateModes(paths);
    assert.equal(modeOf(path.join(paths.state, 'broker-grants.json')), 0o600);
  });
});

test('private-fs: TWO-PHASE repair — a 000 secrets/ hiding a 0644 token is fully fixed by a SINGLE call (round-3)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.secrets, { recursive: true });
    fs.chmodSync(paths.core, 0o700);
    fs.writeFileSync(path.join(paths.secrets, 'google-token-read.json'), '{}', { mode: 0o644 });
    fs.writeFileSync(path.join(paths.secrets, 'google-client.json'), '{}', { mode: 0o644 });
    fs.chmodSync(paths.secrets, 0o000); // the trapped-file case: readdir fails while 000

    const r = repairPrivateModes(paths);
    assert.equal(modeOf(paths.secrets), 0o700, 'phase 1 opened the dir');
    assert.equal(modeOf(path.join(paths.secrets, 'google-token-read.json')), 0o600, 'phase 2 reached the trapped token');
    assert.equal(modeOf(path.join(paths.secrets, 'google-client.json')), 0o600, 'phase 2 reached the trapped client JSON');
    assert.equal(r.changed, 3, 'dir + both trapped files counted');
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'a follow-up scan is clean after ONE repair call');
  });
});

test('private-fs: repairPrivateModes never creates secrets/ or any file (repair, never create)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
  const paths = pathsFor(root);
  fs.mkdirSync(paths.core, { recursive: true, mode: 0o700 });
  assert.deepEqual(repairPrivateModes(paths), { changed: 0 }, 'nothing to repair, nothing created');
  assert.equal(fs.existsSync(paths.secrets), false, 'no secrets/ was created');
  assert.deepEqual(scanPrivateModes(paths), { insecure: 0 }, 'a machine with no Google setup scans clean');
});

test('private-fs: scanPrivateModes counts group/world-accessible entries read-only; insecureEntries agrees', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(paths.state, 'digest.md'), 'd', { mode: 0o644 });
    fs.chmodSync(paths.core, 0o700);

    const before = scanPrivateModes(paths);
    assert.equal(before.insecure, 2, 'state dir + digest.md are insecure');
    assert.equal(insecureEntries(paths).length, before.insecure, 'the two surfaces agree');
    assert.equal(modeOf(paths.state), 0o755, 'scan never chmods');

    repairPrivateModes(paths);
    assert.deepEqual(scanPrivateModes(paths), { insecure: 0 });
    assert.deepEqual(insecureEntries(paths), []);
  });
});

test('private-fs: missing dirs/files are skipped, never thrown', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
  const paths = pathsFor(root); // nothing exists
  assert.deepEqual(repairPrivateModes(paths), { changed: 0 });
  assert.deepEqual(scanPrivateModes(paths), { insecure: 0 });
});

test('private-fs: the A5-scoped set matches the OWNER-APPROVED membership', () => {
  const paths = pathsFor('/tmp/x');
  const dirs = A5_PRIVATE_DIRS(paths);
  assert.deepEqual(dirs, [
    paths.core,
    paths.state,
    paths.logs,
    path.join(paths.state, 'dream-scratch'),
    path.join(paths.state, 'quarantine'),
  ]);
  assert.ok(!dirs.includes(paths.secrets), 'secrets is A9, not in the A5 constant');
  assert.deepEqual(A5_PRIVATE_FILE_BASENAMES, [
    'digest.md',
    'alerts.jsonl',
    'transcript-ledger.json',
    'identity-approvals.json',
  ]);
});

test('private-fs: the A9-scoped set matches the spec membership (WP-a9)', () => {
  const paths = pathsFor('/tmp/x');
  assert.deepEqual(A9_PRIVATE_DIRS(paths), [paths.secrets]);
  assert.deepEqual(A9_PRIVATE_STATE_FILES, [
    'broker-grants.json',
    'exec-pins.json',
    'run-evidence.jsonl',
    'schedule.json',
    'watermarks.json',
  ]);
  assert.deepEqual(A9_PRIVATE_CORE_FILES(paths), [paths.config, paths.manifest]);
});

// ── createLogStreamPrivate: the fail-closed 0600 log-stream helper (WP-a9) ──

/** Write `data` through a stream and wait for the flush. */
function writeAndEnd(stream, data) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject);
    stream.end(data, resolve);
  });
}

test('private-fs: createLogStreamPrivate writes a fresh 0600 log under umask 000', { skip: !POSIX }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'run.log');
  await withUmask(0o000, async () => {
    const stream = createLogStreamPrivate(file);
    await writeAndEnd(stream, 'hello\n');
  });
  assert.equal(modeOf(file), 0o600, 'fresh log is 0600 despite umask 000');
  assert.equal(fs.readFileSync(file, 'utf8'), 'hello\n');
});

test('private-fs: createLogStreamPrivate re-secures a pre-existing 0666 append target to 0600', { skip: !POSIX }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'daily.log');
  fs.writeFileSync(file, 'old\n');
  fs.chmodSync(file, 0o666); // the legacy world-readable daily log
  const stream = createLogStreamPrivate(file, { flags: 'a' });
  await writeAndEnd(stream, 'new\n');
  assert.equal(modeOf(file), 0o600, 'legacy 0666 append target ends 0600');
  assert.equal(fs.readFileSync(file, 'utf8'), 'old\nnew\n', 'append semantics preserved');
});

test('private-fs: createLogStreamPrivate is FAIL-CLOSED — fchmod failure throws, closes the fd, writes ZERO bytes', { skip: !POSIX }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'refused.log');
  const closed = [];
  assert.throws(
    () =>
      createLogStreamPrivate(file, {
        fchmodSync: () => {
          throw new Error('EPERM: not yours');
        },
        closeSync: (fd) => {
          closed.push(fd);
          fs.closeSync(fd);
        },
      }),
    (err) => err instanceof WienerdogError && /could not secure it to 0600/.test(err.message)
  );
  assert.equal(closed.length, 1, 'the fd was closed on failure');
  assert.equal(fs.statSync(file).size, 0, 'zero log bytes written — never into an unsecured file');
});

test('private-fs: createLogStreamPrivate on win32 is a plain stream (no chmod semantics)', { skip: POSIX }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-log-'));
  const file = path.join(root, 'win.log');
  const stream = createLogStreamPrivate(file);
  await writeAndEnd(stream, 'x');
  assert.equal(fs.readFileSync(file, 'utf8'), 'x');
});
