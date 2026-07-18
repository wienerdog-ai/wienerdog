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

test('adopt refuses a vault inside the canonical core (ADR-0019) with zero writes', async () => {
  const adopt = require('../../src/cli/adopt');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-incore-'));
  const core = path.join(root, 'wd');
  const nested = path.join(core, 'state', 'mynotes');
  const configPath = path.join(core, 'config.yaml');

  const ENV_KEYS = ['HOME', 'WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  try {
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, 'note.md'), '# note\n');
    const configBefore = 'version: 1\nvault: null\nmemory_mode: standard\n';
    fs.writeFileSync(configPath, configBefore);
    fs.writeFileSync(
      path.join(core, 'install-manifest.json'),
      JSON.stringify({ version: 1, createdAt: 'x', entries: [{ kind: 'file', path: configPath, hash: 'x' }] })
    );
    Object.assign(process.env, { HOME: root, WIENERDOG_HOME: core });
    for (const k of ['WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME']) delete process.env[k];

    // Direct nested path: refused in plain language.
    await assert.rejects(
      () => adopt.run([nested, '--yes']),
      (err) => {
        assert.ok(err instanceof WienerdogError);
        assert.match(err.message, /can't live inside Wienerdog's own folder/);
        assert.match(err.message, /pick a location of your own/);
        return true;
      }
    );

    // A symlink that resolves INTO the core is refused too (realpath compare).
    const link = path.join(root, 'sneaky-link');
    fs.symlinkSync(nested, link);
    await assert.rejects(() => adopt.run([link, '--yes']), /can't live inside Wienerdog's own folder/);

    // Zero writes: config untouched, nested dir untouched (no git init, no scaffold).
    assert.equal(fs.readFileSync(configPath, 'utf8'), configBefore, 'config unchanged');
    assert.deepEqual(fs.readdirSync(nested).sort(), ['note.md'], 'nested dir unchanged');
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── WP-149: inspectAdoptTree (audit A13 adopt guard) ─────────────────────────

/** Fresh temp dir for tree-inspection cases. */
function treeSetup() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-tree-'));
}

test('inspectAdoptTree: dir === home reports isHome', () => {
  const root = treeSetup();
  const r = adoptGit.inspectAdoptTree(root, root);
  assert.equal(r.isHome, true);
});

test('inspectAdoptTree: finds sensitive dirs, key files, and pem/key extensions as relative paths', () => {
  const root = treeSetup();
  fs.mkdirSync(path.join(root, '.ssh'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ssh', 'id_rsa'), 'x');
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sub', 'server.pem'), 'x');
  fs.writeFileSync(path.join(root, '.env'), 'x');
  fs.writeFileSync(path.join(root, 'notes.md'), '# fine\n');

  const r = adoptGit.inspectAdoptTree(root, '/nonexistent-home');
  assert.equal(r.isHome, false);
  assert.ok(r.sensitive.includes('.ssh'), 'sensitive dir basename');
  assert.ok(r.sensitive.includes('.ssh/id_rsa'), 'key file inside sensitive dir');
  assert.ok(r.sensitive.includes('sub/server.pem'), 'pem extension in subdir');
  assert.ok(r.sensitive.includes('.env'), 'dotenv file');
  assert.ok(!r.sensitive.includes('notes.md'), 'plain note not flagged');
  assert.equal(r.tooLarge, false);
});

test('inspectAdoptTree: .git directories are not descended into', () => {
  const root = treeSetup();
  fs.mkdirSync(path.join(root, '.git', 'objects'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git', 'objects', 'id_rsa'), 'x'); // would match if descended
  const r = adoptGit.inspectAdoptTree(root, '/nonexistent-home');
  assert.deepEqual(r.sensitive, []);
});

test('inspectAdoptTree: lowered entry cap marks the tree truncated + tooLarge', () => {
  const root = treeSetup();
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(root, `f${i}.md`), 'x');
  const r = adoptGit.inspectAdoptTree(root, '/nonexistent-home', { maxEntries: 5 });
  assert.equal(r.truncated, true);
  assert.equal(r.tooLarge, true);
});

test('inspectAdoptTree: lowered byte cap also truncates', () => {
  const root = treeSetup();
  fs.writeFileSync(path.join(root, 'a.md'), 'x'.repeat(4096));
  fs.writeFileSync(path.join(root, 'b.md'), 'x'.repeat(4096));
  const r = adoptGit.inspectAdoptTree(root, '/nonexistent-home', { maxBytes: 1000 });
  assert.equal(r.truncated, true);
  assert.equal(r.tooLarge, true);
});

test('inspectAdoptTree: a clean small notes folder is unflagged', () => {
  const root = treeSetup();
  fs.mkdirSync(path.join(root, '05-Daily'), { recursive: true });
  fs.writeFileSync(path.join(root, '05-Daily', '2026-07-18.md'), '# day\n');
  fs.writeFileSync(path.join(root, 'hub.md'), '# hub\n');
  const r = adoptGit.inspectAdoptTree(root, '/nonexistent-home');
  assert.deepEqual(
    { isHome: r.isHome, sensitive: r.sensitive, tooLarge: r.tooLarge, truncated: r.truncated },
    { isHome: false, sensitive: [], tooLarge: false, truncated: false }
  );
  assert.equal(r.entryCount, 3, 'dir + two files counted');
});

test('inspectAdoptTree: a symlink is counted but never followed', () => {
  if (process.platform === 'win32') return;
  const root = treeSetup();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-outside-'));
  fs.writeFileSync(path.join(outside, 'id_rsa'), 'x');
  fs.symlinkSync(outside, path.join(root, 'link-out'));
  const r = adoptGit.inspectAdoptTree(root, '/nonexistent-home');
  assert.deepEqual(r.sensitive, [], 'content behind the symlink is not scanned');
  assert.equal(r.entryCount, 1, 'the symlink itself is counted');
});

test('inspectAdoptTree: an unreadable root does not throw but FAILS CLOSED (truncated → tooLarge)', () => {
  const r = adoptGit.inspectAdoptTree('/nonexistent-dir-xyz', '/nonexistent-home');
  // A dir we cannot read cannot be proven safe → the gate must fire, not pass.
  assert.deepEqual(
    { isHome: r.isHome, entryCount: r.entryCount, truncated: r.truncated, tooLarge: r.tooLarge },
    { isHome: false, entryCount: 0, truncated: true, tooLarge: true }
  );
});

test('adopt hard-refuses the home directory before any git work (WP-149)', async () => {
  const adopt = require('../../src/cli/adopt');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-home-'));
  const core = path.join(root, 'wd');
  const configPath = path.join(core, 'config.yaml');

  const ENV_KEYS = ['HOME', 'WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  try {
    fs.mkdirSync(core, { recursive: true });
    fs.writeFileSync(configPath, 'version: 1\nvault: null\nmemory_mode: standard\n');
    Object.assign(process.env, { HOME: root, WIENERDOG_HOME: core });
    for (const k of ['WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME']) delete process.env[k];

    await assert.rejects(
      () => adopt.run([root, '--yes']),
      (err) => {
        assert.ok(err instanceof WienerdogError);
        assert.match(err.message, /refusing to adopt your home directory/);
        return true;
      }
    );
    assert.equal(fs.existsSync(path.join(root, '.git')), false, 'no git init happened');
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('adopt under --yes refuses a tree with sensitive files instead of auto-accepting (WP-149)', async () => {
  const adopt = require('../../src/cli/adopt');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-secret-'));
  const core = path.join(root, 'wd');
  const vault = path.join(root, 'notes');
  const configPath = path.join(core, 'config.yaml');

  const ENV_KEYS = ['HOME', 'WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  try {
    fs.mkdirSync(core, { recursive: true });
    fs.mkdirSync(path.join(vault, '.ssh'), { recursive: true });
    fs.writeFileSync(path.join(vault, '.ssh', 'id_rsa'), 'x');
    fs.writeFileSync(path.join(vault, 'hub.md'), '# hub\n');
    fs.writeFileSync(configPath, 'version: 1\nvault: null\nmemory_mode: standard\n');
    Object.assign(process.env, { HOME: root, WIENERDOG_HOME: core });
    for (const k of ['WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME']) delete process.env[k];

    await assert.rejects(
      () => adopt.run([vault, '--yes']),
      (err) => {
        assert.ok(err instanceof WienerdogError);
        assert.match(err.message, /refusing to adopt a folder with sensitive files/);
        return true;
      }
    );
    assert.equal(fs.existsSync(path.join(vault, '.git')), false, 'no git init happened');
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── WP-149 review round (Codex F3): streaming, handle-bounded, fail-closed ───

/** Build an injected opendir seam over an in-memory tree (map of dir abs →
 *  array of {name, dir?} dirents), tracking peak concurrent open handles and
 *  total readSync calls. Optional faults: throwOpen(abs)/throwRead(abs). */
function fakeFs(tree, faults = {}) {
  const stats = { open: 0, close: 0, peak: 0, active: 0, reads: 0 };
  const opendir = (abs) => {
    if (faults.throwOpen && faults.throwOpen(abs)) throw new Error('EMFILE');
    stats.open += 1; stats.active += 1; stats.peak = Math.max(stats.peak, stats.active);
    const ents = tree[abs] || [];
    let i = 0;
    return {
      readSync() {
        stats.reads += 1;
        if (faults.throwRead && faults.throwRead(abs)) throw new Error('EIO');
        if (i >= ents.length) return null;
        const e = ents[i]; i += 1;
        return { name: e.name, isDirectory: () => !!e.dir, isFile: () => !e.dir };
      },
      closeSync() { stats.close += 1; stats.active -= 1; },
    };
  };
  return { opendir, stats };
}

test('inspectAdoptTree: streams a huge flat dir, stops at the cap, reads no more than cap+1 dirents (WP-149)', () => {
  const N = 100000;
  const ents = Array.from({ length: N }, (_, i) => ({ name: `f${i}.md` }));
  const { opendir, stats } = fakeFs({ '/r': ents });
  const r = adoptGit.inspectAdoptTree('/r', '/nonexistent-home', { maxEntries: 5, opendir });
  assert.equal(r.truncated, true);
  assert.equal(r.tooLarge, true);
  assert.ok(stats.reads <= 6, `stopped early: ${stats.reads} reads, not ${N}`);
});

test('inspectAdoptTree: holds at most ONE directory handle open at any depth (WP-149 — no EMFILE by depth)', () => {
  // A deep chain /d0 → /d0/s → /d0/s/s → … ; every parent must be closed before
  // its child is opened, so peak concurrent handles is 1.
  const tree = {};
  let abs = '/d0';
  for (let d = 0; d < 50; d++) {
    const child = `${abs}/s`;
    tree[abs] = [{ name: 's', dir: true }];
    abs = child;
  }
  tree[abs] = [{ name: 'leaf.md' }];
  const { opendir, stats } = fakeFs(tree);
  const r = adoptGit.inspectAdoptTree('/d0', '/nonexistent-home', { opendir });
  assert.equal(stats.peak, 1, `peak open handles was ${stats.peak}, must be 1`);
  assert.equal(stats.open, stats.close, 'every opened handle was closed');
  assert.equal(r.truncated, false);
});

test('inspectAdoptTree: a mid-tree opendir failure FAILS CLOSED even with a secret below it (WP-149 — no fail-open)', () => {
  // /r has subdir /r/deep which cannot be opened (EMFILE); a secret lives below.
  const tree = {
    '/r': [{ name: 'deep', dir: true }, { name: 'notes.md' }],
    '/r/deep': [{ name: 'id_rsa' }], // never reached — opendir throws
  };
  const { opendir } = fakeFs(tree, { throwOpen: (abs) => abs === '/r/deep' });
  const r = adoptGit.inspectAdoptTree('/r', '/nonexistent-home', { opendir });
  // We could not scan /r/deep → the tree is NOT provably clean → the gate must fire.
  assert.equal(r.truncated, true, 'incomplete scan marked truncated');
  assert.equal(r.tooLarge, true, 'so the high-friction adopt gate fires');
});

test('inspectAdoptTree: a mid-stream readSync fault also fails closed (WP-149)', () => {
  const { opendir } = fakeFs({ '/r': [{ name: 'a.md' }] }, { throwRead: (abs) => abs === '/r' });
  const r = adoptGit.inspectAdoptTree('/r', '/nonexistent-home', { opendir });
  assert.equal(r.truncated, true);
  assert.equal(r.tooLarge, true);
});
