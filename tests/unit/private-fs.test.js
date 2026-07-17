'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  mkdirPrivate,
  writeFilePrivate,
  repairPrivateModes,
  scanPrivateModes,
  insecureEntries,
  A5_PRIVATE_DIRS,
  A5_PRIVATE_FILE_BASENAMES,
} = require('../../src/core/private-fs');

const POSIX = process.platform !== 'win32';

/** @param {string} p @returns {number} */
function modeOf(p) {
  return fs.statSync(p).mode & 0o777;
}

/** Minimal paths object over a temp root, shaped like getPaths()'s A5 fields. */
function pathsFor(root) {
  return {
    core: path.join(root, 'wd'),
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

test('private-fs: repairPrivateModes never touches secrets/ (A5/A9 boundary)', { skip: !POSIX }, () => {
  withUmask(0o022, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-privfs-'));
    const paths = pathsFor(root);
    fs.mkdirSync(paths.state, { recursive: true });
    fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o755 });
    fs.writeFileSync(path.join(paths.secrets, 'token.json'), '{}', { mode: 0o644 });
    fs.chmodSync(paths.secrets, 0o755);

    repairPrivateModes(paths);

    assert.equal(modeOf(paths.secrets), 0o755, 'secrets dir mode untouched (A9)');
    assert.equal(modeOf(path.join(paths.secrets, 'token.json')), 0o644, 'secrets file untouched (A9)');
  });
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
  assert.ok(!dirs.includes(paths.secrets), 'secrets is A9, never in the A5 set');
  assert.deepEqual(A5_PRIVATE_FILE_BASENAMES, [
    'digest.md',
    'alerts.jsonl',
    'transcript-ledger.json',
    'identity-approvals.json',
  ]);
});
