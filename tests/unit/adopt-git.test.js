'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const adoptGit = require('../../src/core/adopt-git');
const { WienerdogError } = require('../../src/core/errors');

/** @param {object} result @returns {import('../../src/core/adopt-git').SpawnFn} */
function fakeSpawn(result) {
  return () => result;
}

test('runGitStep: success returns the spawn result and does not throw', () => {
  const r = { status: 0, signal: null, stdout: Buffer.from(''), stderr: Buffer.from('') };
  const out = adoptGit.runGitStep('/x', ['add', '-A'], 'git add -A', { spawn: fakeSpawn(r) });
  assert.equal(out, r);
});

test('runGitStep: non-zero exit surfaces stderr + exit code', () => {
  const r = { status: 1, signal: null, stdout: Buffer.from(''), stderr: Buffer.from('fatal: bad thing\n') };
  assert.throws(
    () => adoptGit.runGitStep('/x', ['commit'], 'git commit (initial snapshot)', { spawn: fakeSpawn(r) }),
    (err) => {
      assert.ok(err instanceof WienerdogError);
      assert.match(err.message, /git commit \(initial snapshot\) failed: git exited with code 1\./);
      assert.match(err.message, /git said: fatal: bad thing/);
      // No size/lock hint for a plain non-zero exit with unremarkable stderr.
      assert.doesNotMatch(err.message, /very large or locked file/);
      return true;
    }
  );
});

test('runGitStep: SIGKILL surfaces the signal name and the size/lock hint', () => {
  const r = { status: null, signal: 'SIGKILL', stdout: Buffer.from(''), stderr: Buffer.from('') };
  assert.throws(
    () => adoptGit.runGitStep('/x', ['add', '-A'], 'git add -A (staging the vault)', { spawn: fakeSpawn(r) }),
    (err) => {
      assert.match(err.message, /git add -A \(staging the vault\) failed: git was killed by signal SIGKILL\./);
      assert.match(err.message, /git said: \(no output\)/);
      assert.match(err.message, /very large or locked file/);
      assert.match(err.message, /Exclude such paths via \.gitignore and retry\./);
      return true;
    }
  );
});

test('runGitStep: exit 137 also triggers the size/lock hint', () => {
  const r = { status: 137, signal: null, stdout: Buffer.from(''), stderr: Buffer.from('') };
  assert.throws(
    () => adoptGit.runGitStep('/x', ['add', '-A'], 'git add -A', { spawn: fakeSpawn(r) }),
    /very large or locked file/
  );
});

test('runGitStep: size-smelling stderr triggers the hint even on a plain non-zero exit', () => {
  const r = { status: 1, signal: null, stdout: Buffer.from(''), stderr: Buffer.from('fatal: out of memory, malloc failed\n') };
  assert.throws(
    () => adoptGit.runGitStep('/x', ['add', '-A'], 'git add -A', { spawn: fakeSpawn(r) }),
    /very large or locked file/
  );
});

test('runGitStep: spawn error surfaces "could not start git" + git-installed hint', () => {
  const r = { status: null, signal: null, error: { code: 'ENOENT' } };
  assert.throws(
    () => adoptGit.runGitStep('/x', ['init'], 'git init', { spawn: fakeSpawn(r) }),
    (err) => {
      assert.match(err.message, /git init failed: could not start git \(ENOENT\)\./);
      assert.match(err.message, /Is git installed and on your PATH\?/);
      // Spawn error uses the git-installed hint, NOT the size hint.
      assert.doesNotMatch(err.message, /very large or locked file/);
      return true;
    }
  );
});

test('inspectIndexLock: absent lock => present:false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-lock-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    const r = adoptGit.inspectIndexLock(dir);
    assert.equal(r.present, false);
    assert.equal(r.stale, false);
    assert.equal(r.ageMs, null);
    assert.equal(r.lockPath, path.join(dir, '.git', 'index.lock'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectIndexLock: freshly-created lock => stale:false', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-lock-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    const lockPath = path.join(dir, '.git', 'index.lock');
    fs.writeFileSync(lockPath, '');
    const r = adoptGit.inspectIndexLock(dir);
    assert.equal(r.present, true);
    assert.equal(r.stale, false);
    assert.ok(r.ageMs < adoptGit.STALE_LOCK_AGE_MS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectIndexLock: aged lock (mtime in the past) => stale:true', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-lock-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    const lockPath = path.join(dir, '.git', 'index.lock');
    fs.writeFileSync(lockPath, '');
    const past = (Date.now() - 60_000) / 1000; // 60s ago, in seconds
    fs.utimesSync(lockPath, past, past);
    const r = adoptGit.inspectIndexLock(dir);
    assert.equal(r.present, true);
    assert.equal(r.stale, true);
    assert.ok(r.ageMs >= adoptGit.STALE_LOCK_AGE_MS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('inspectIndexLock: injectable now flips staleness deterministically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-lock-'));
  try {
    fs.mkdirSync(path.join(dir, '.git'));
    const lockPath = path.join(dir, '.git', 'index.lock');
    fs.writeFileSync(lockPath, '');
    const mtimeMs = fs.statSync(lockPath).mtimeMs;
    const fresh = adoptGit.inspectIndexLock(dir, { now: mtimeMs + 1000 });
    assert.equal(fresh.stale, false);
    const stale = adoptGit.inspectIndexLock(dir, { now: mtimeMs + adoptGit.STALE_LOCK_AGE_MS });
    assert.equal(stale.stale, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('removeIndexLock: deletes the lock; missing is fine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-lock-'));
  try {
    const lockPath = path.join(dir, 'index.lock');
    fs.writeFileSync(lockPath, '');
    adoptGit.removeIndexLock(lockPath);
    assert.equal(fs.existsSync(lockPath), false);
    // Second removal on a now-missing file must not throw.
    adoptGit.removeIndexLock(lockPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('planGitignore/applyGitignore: fresh file gets all five lines + header', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ignore-'));
  try {
    const plan = adoptGit.planGitignore(dir);
    assert.equal(plan.existing, false);
    assert.deepEqual(plan.missing, adoptGit.DEFAULT_GITIGNORE_LINES);
    adoptGit.applyGitignore(plan);
    const written = fs.readFileSync(plan.path, 'utf8');
    assert.match(written, /^# Added by wienerdog adopt/);
    for (const l of adoptGit.DEFAULT_GITIGNORE_LINES) assert.ok(written.includes(l), `has ${l}`);
    assert.ok(written.endsWith('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('planGitignore/applyGitignore: existing file with two defaults + custom → append only the missing three, preserve custom', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ignore-'));
  try {
    const p = path.join(dir, '.gitignore');
    fs.writeFileSync(p, 'node_modules/\n.DS_Store\n.trash/\n'); // custom + two defaults
    const plan = adoptGit.planGitignore(dir);
    assert.equal(plan.existing, true);
    assert.deepEqual(plan.missing, [
      '.obsidian/plugins/*/bin/',
      '.smart-env/',
      '.obsidian/workspace*',
    ]);
    adoptGit.applyGitignore(plan);
    const after = fs.readFileSync(p, 'utf8');
    // Custom line preserved, not reordered/removed.
    assert.ok(after.includes('node_modules/'), 'custom line survives');
    // The two already-present defaults are not duplicated.
    assert.equal(after.match(/\.DS_Store/g).length, 1, '.DS_Store not duplicated');
    assert.equal(after.match(/\.trash\//g).length, 1, '.trash/ not duplicated');
    // The three missing defaults appended.
    for (const l of plan.missing) assert.ok(after.includes(l), `appended ${l}`);
    assert.match(after, /# Added by wienerdog adopt/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('applyGitignore: second run is a no-op (idempotent — no duplicate lines)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ignore-'));
  try {
    adoptGit.applyGitignore(adoptGit.planGitignore(dir));
    const first = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    const plan2 = adoptGit.planGitignore(dir);
    assert.deepEqual(plan2.missing, [], 'nothing missing on re-plan');
    adoptGit.applyGitignore(plan2);
    const second = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.equal(second, first, 'file unchanged on second apply');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
