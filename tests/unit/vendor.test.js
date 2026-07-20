'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const vendor = require('../../src/core/vendor');

/** Fresh temp core; returns resolved paths. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-'));
  const core = path.join(root, 'wd');
  fs.mkdirSync(core, { recursive: true });
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/**
 * Build a fake published package root (bin/, src/, package.json) with a version.
 * No `.git` → prod mode unless the caller forces dev.
 * @param {string} version
 * @returns {string} the fake root
 */
function fakeSource(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-pkg-'));
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'wienerdog.js'), '// vendored bin\n');
  fs.writeFileSync(path.join(root, 'src', 'marker.js'), '// marker\n');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'wienerdog', version }));
  return root;
}

test('vendor: prod mode copies the published files and links current', () => {
  const paths = tempPaths();
  const src = fakeSource('0.2.1');
  const manifest = { version: 1, createdAt: '', entries: [] };

  const r = vendor.vendorSelf(paths, { sourceRoot: src, env: {}, manifest });
  assert.equal(r.dev, false);
  assert.equal(r.copied, true);
  assert.equal(r.version, '0.2.1');

  const versionDir = path.join(paths.core, 'app', '0.2.1');
  assert.ok(fs.statSync(path.join(versionDir, 'bin', 'wienerdog.js')).isFile(), 'bin/ copied');
  assert.ok(fs.statSync(path.join(versionDir, 'src', 'marker.js')).isFile(), 'src/ copied');
  assert.ok(fs.statSync(path.join(versionDir, 'package.json')).isFile(), 'package.json copied');
  // No node_modules / .git in the vendored tree.
  assert.equal(fs.existsSync(path.join(versionDir, 'node_modules')), false);
  assert.equal(fs.existsSync(path.join(versionDir, '.git')), false);

  const link = vendor.currentLink(paths);
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'current is a symlink');
  assert.equal(fs.realpathSync(link), fs.realpathSync(versionDir), 'current → version dir');
  // One vendored-tree manifest entry pointing at app/.
  const entries = manifest.entries.filter((e) => e.kind === 'vendored-tree');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, vendor.appDir(paths));
});

test('vendor: prod mode is idempotent — a second call does not re-copy', () => {
  const paths = tempPaths();
  const src = fakeSource('0.2.1');
  const manifest = { version: 1, createdAt: '', entries: [] };

  vendor.vendorSelf(paths, { sourceRoot: src, env: {}, manifest });
  const r2 = vendor.vendorSelf(paths, { sourceRoot: src, env: {}, manifest });
  assert.equal(r2.copied, false, 'the version dir already exists → no re-copy');
  assert.equal(r2.dev, false);
  const link = vendor.currentLink(paths);
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'current stays a valid symlink');
  // Only one vendored-tree entry despite two calls (recordOnce).
  assert.equal(manifest.entries.filter((e) => e.kind === 'vendored-tree').length, 1);
});

test('vendor: an upgrade copies the new version and atomically repoints current', () => {
  const paths = tempPaths();
  const manifest = { version: 1, createdAt: '', entries: [] };

  vendor.vendorSelf(paths, { sourceRoot: fakeSource('0.2.1'), env: {}, manifest });
  const r = vendor.vendorSelf(paths, { sourceRoot: fakeSource('0.3.0'), env: {}, manifest });
  assert.equal(r.copied, true);
  assert.equal(r.version, '0.3.0');

  const app = path.join(paths.core, 'app');
  assert.ok(fs.existsSync(path.join(app, '0.2.1')), 'old version dir left in place');
  assert.ok(fs.existsSync(path.join(app, '0.3.0')), 'new version dir created');
  assert.equal(
    fs.realpathSync(vendor.currentLink(paths)),
    fs.realpathSync(path.join(app, '0.3.0')),
    'current now points at the new version'
  );
});

test('vendor: repointCurrent falls back to remove-then-rename on EPERM', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const oldTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-old-'));
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));
  fs.symlinkSync(oldTarget, vendor.currentLink(paths));

  let calls = 0;
  const rename = (from, to) => {
    calls += 1;
    if (calls === 1) {
      const err = new Error('EPERM: operation not permitted, rename');
      err.code = 'EPERM';
      throw err;
    }
    fs.renameSync(from, to);
  };

  vendor.repointCurrent(paths, newTarget, { rename });
  assert.equal(calls, 2, 'rename retried once after the fallback removed the old link');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget));
  const leftovers = fs.readdirSync(vendor.appDir(paths)).filter((n) => n.startsWith('current.tmp.'));
  assert.deepEqual(leftovers, [], 'no current.tmp.* remains under app/');
});

test('vendor: repointCurrent rethrows non-fallback rename errors', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));

  const rename = () => {
    const err = new Error('ENOSPC: no space left on device, rename');
    err.code = 'ENOSPC';
    throw err;
  };

  assert.throws(() => vendor.repointCurrent(paths, newTarget, { rename }), /ENOSPC/);
});

test('vendor: repointCurrent sweeps pre-existing orphan current.tmp.* links', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));
  const orphan = path.join(vendor.appDir(paths), 'current.tmp.99999');
  fs.symlinkSync(newTarget, orphan);
  assert.ok(fs.existsSync(orphan), 'orphan created for the test');

  vendor.repointCurrent(paths, newTarget);
  assert.equal(fs.existsSync(orphan), false, 'orphan removed after a successful repoint');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget));
});

test('vendor: repointCurrent no-ops when current already points at targetDir', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-target-'));
  fs.symlinkSync(target, vendor.currentLink(paths));
  // Plant an orphan from an earlier crashed run — must still be swept.
  const orphan = path.join(vendor.appDir(paths), 'current.tmp.12345');
  fs.symlinkSync(target, orphan);

  let calls = 0;
  const rename = () => { calls += 1; };

  vendor.repointCurrent(paths, target, { rename });
  assert.equal(calls, 0, 'rename never called when current already points at targetDir');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(target), 'current untouched, still correct');
  assert.equal(fs.existsSync(orphan), false, 'pre-planted orphan still swept on the no-op path');
});

test('vendor: repointCurrent repairs a broken/mismatched current link', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));
  // current points elsewhere (a different, still-existing dir).
  const otherTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-other-'));
  fs.symlinkSync(otherTarget, vendor.currentLink(paths));

  let calls = 0;
  const rename = (from, to) => { calls += 1; fs.renameSync(from, to); };

  vendor.repointCurrent(paths, newTarget, { rename });
  assert.equal(calls, 1, 'rename called once to repoint the mismatched link');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget), 'current now resolves to the new target');
});

test('vendor: repointCurrent repairs a dangling current link', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));
  const goneTarget = path.join(os.tmpdir(), 'wd-does-not-exist-xyz');
  fs.symlinkSync(goneTarget, vendor.currentLink(paths));

  let calls = 0;
  const rename = (from, to) => { calls += 1; fs.renameSync(from, to); };

  vendor.repointCurrent(paths, newTarget, { rename });
  assert.equal(calls, 1, 'rename called once to repair the dangling link');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget), 'current now resolves to the new target');
});

test('vendor: repointCurrent creates the tmp reparse point as a junction on win32', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));

  let symlinkArgs = null;
  // Spy creates a real POSIX symlink (dropping the type) so the subsequent
  // rename + readlink + no-op assertions still work on non-Windows CI.
  const symlink = (target, tmp, type) => {
    symlinkArgs = [target, tmp, type];
    fs.symlinkSync(target, tmp);
  };

  vendor.repointCurrent(paths, newTarget, { platform: 'win32', symlink });
  assert.deepEqual(symlinkArgs, [newTarget, `${vendor.currentLink(paths)}.tmp.${process.pid}`, 'junction']);
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget));
});

test('vendor: repointCurrent creates the tmp reparse point as a plain symlink off win32', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));

  let symlinkArgs = null;
  const symlink = (target, tmp, type) => {
    symlinkArgs = [target, tmp, type];
    fs.symlinkSync(target, tmp);
  };

  vendor.repointCurrent(paths, newTarget, { platform: 'linux', symlink });
  assert.deepEqual(symlinkArgs, [newTarget, `${vendor.currentLink(paths)}.tmp.${process.pid}`, undefined]);
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget));
});

test('vendor: repointCurrent same-target no-op holds on win32 (no symlink/rename call)', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-target-'));
  fs.symlinkSync(target, vendor.currentLink(paths));
  const orphan = path.join(vendor.appDir(paths), 'current.tmp.12345');
  fs.symlinkSync(target, orphan);

  let symlinkCalls = 0;
  let renameCalls = 0;
  const symlink = () => { symlinkCalls += 1; };
  const rename = () => { renameCalls += 1; };

  vendor.repointCurrent(paths, target, { platform: 'win32', symlink, rename });
  assert.equal(symlinkCalls, 0, 'no symlink call on the no-op path');
  assert.equal(renameCalls, 0, 'no rename call on the no-op path');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(target));
  assert.equal(fs.existsSync(orphan), false, 'orphan still swept on the win32 no-op path');
});

test('vendor: repointCurrent rewrite path runs the orphan sweep on win32', () => {
  const paths = tempPaths();
  fs.mkdirSync(vendor.appDir(paths), { recursive: true });
  const newTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-new-'));
  const orphan = path.join(vendor.appDir(paths), 'current.tmp.99999');
  fs.symlinkSync(newTarget, orphan);

  const symlink = (target, tmp) => { fs.symlinkSync(target, tmp); };

  vendor.repointCurrent(paths, newTarget, { platform: 'win32', symlink });
  assert.equal(fs.existsSync(orphan), false, 'orphan removed after a successful win32 repoint');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(newTarget));
});

test('vendor: dev mode via WIENERDOG_DEV links current at the checkout, copies nothing', () => {
  const paths = tempPaths();
  const src = fakeSource('9.9.9');

  const r = vendor.vendorSelf(paths, { sourceRoot: src, env: { WIENERDOG_DEV: '1' } });
  assert.equal(r.dev, true);
  assert.equal(r.copied, false);
  assert.equal(r.target, src);
  const app = path.join(paths.core, 'app');
  assert.equal(fs.existsSync(path.join(app, '9.9.9')), false, 'no frozen snapshot in dev mode');
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(src), 'current → checkout root');
});

test('vendor: dev mode is detected from a .git dir at the source root', () => {
  const paths = tempPaths();
  const src = fakeSource('1.0.0');
  fs.mkdirSync(path.join(src, '.git'));

  const r = vendor.vendorSelf(paths, { sourceRoot: src, env: {} });
  assert.equal(r.dev, true);
  assert.equal(r.copied, false);
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(src));
});

test('vendor: dev mode is detected from a .git FILE (git worktree) at the source root (WP-157 F10)', () => {
  const paths = tempPaths();
  const src = fakeSource('1.0.0');
  // A git WORKTREE (our own dev machine + Gyula's) has `.git` as a regular FILE,
  // not a directory. isDevCheckout must treat it as dev so a worktree install
  // produces a dev-stance descriptor the launcher can verify — a dir-only check
  // would make worktree dev permanently non-runnable.
  fs.writeFileSync(path.join(src, '.git'), 'gitdir: /repo/.git/worktrees/wt\n');

  const r = vendor.vendorSelf(paths, { sourceRoot: src, env: {} });
  assert.equal(r.dev, true, 'a .git FILE (worktree) is detected as dev');
  assert.equal(r.copied, false);
  assert.equal(fs.realpathSync(vendor.currentLink(paths)), fs.realpathSync(src));
});

test('vendor: currentBin is <core>/app/current/bin/wienerdog.js', () => {
  const paths = tempPaths();
  assert.equal(
    vendor.currentBin(paths),
    path.join(paths.core, 'app', 'current', 'bin', 'wienerdog.js')
  );
});

test('vendor: writeShim writes an executable launcher, records it, and is byte-idempotent', () => {
  const paths = tempPaths();
  const manifest = { version: 1, createdAt: '', entries: [] };

  const r = vendor.writeShim(paths, { manifest });
  assert.equal(r.path, path.join(paths.home, '.local', 'bin', 'wienerdog'));
  assert.equal(r.changed, true);
  const content = fs.readFileSync(r.path, 'utf8');
  assert.match(content, /^#!\/usr\/bin\/env bash$/m);
  assert.ok(content.includes(`exec node "${vendor.currentBin(paths)}"`), 'execs the vendored current bin');
  assert.equal(content.endsWith(' "$@"\n'), true);
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(r.path).mode & 0o111, 0o111, 'shim is executable');
  }
  // Manifest tracks it as a plain file (uninstall removes it).
  const fileEntries = manifest.entries.filter((e) => e.kind === 'file' && e.path === r.path);
  assert.equal(fileEntries.length, 1);

  // Second call: byte-identical → no write, still one manifest entry.
  const r2 = vendor.writeShim(paths, { manifest });
  assert.equal(r2.changed, false, 'a re-run makes zero content changes');
  assert.equal(manifest.entries.filter((e) => e.kind === 'file' && e.path === r.path).length, 1);
});

test('vendor: writeShim on win32 also writes a .cmd launcher, byte-idempotent', () => {
  const paths = tempPaths();
  const manifest = { version: 1, createdAt: '', entries: [] };

  const r = vendor.writeShim(paths, { manifest, platform: 'win32' });
  const expectedCmdPath = path.join(paths.home, '.local', 'bin', 'wienerdog.cmd');
  assert.equal(r.cmdPath, expectedCmdPath);
  assert.equal(r.cmdChanged, true);
  const cmdContent = fs.readFileSync(r.cmdPath, 'utf8');
  assert.equal(cmdContent, `@node "${vendor.currentBin(paths)}" %* & exit /b\r\n`, 'exact CRLF content');
  // Manifest tracks the .cmd as a plain file.
  const cmdEntries = manifest.entries.filter((e) => e.kind === 'file' && e.path === r.cmdPath);
  assert.equal(cmdEntries.length, 1);
  // The bash shim is also written.
  assert.ok(fs.existsSync(r.path), 'bash shim also written on win32');

  // Single-parser-block invariant (WP-067): the node invocation and the
  // batch-terminating `exit /b` share ONE line that cmd.exe reads into memory
  // before `node` runs — so the shim survives node deleting the .cmd mid-run
  // (e.g. during `wienerdog uninstall`), which the prior two-line
  // `@echo off` / `node …` template did not.
  const lines = cmdContent.split('\r\n').filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ''));
  assert.equal(lines.length, 1, 'single logical line');
  assert.ok(lines[0].endsWith('& exit /b'), 'ends with & exit /b');
  // endsWith('& exit /b') also matches '&& exit /b' (string suffix) — pin the
  // unconditional form explicitly: '&&' would skip exit /b on node's failure
  // path and reintroduce the self-deletion crash exactly when exit codes matter.
  assert.ok(!lines[0].includes('&&'), 'separator is unconditional & (never &&)');
  assert.ok(lines[0].includes('%*'), 'forwards all args via %*');

  // Second call: byte-identical → no write, manifest not grown.
  const r2 = vendor.writeShim(paths, { manifest, platform: 'win32' });
  assert.equal(r2.cmdChanged, false, 'a re-run makes zero content changes to the .cmd');
  assert.equal(manifest.entries.filter((e) => e.kind === 'file' && e.path === r.cmdPath).length, 1);
});

test('vendor: writeShim off-Windows writes no .cmd', () => {
  const paths = tempPaths();

  const r = vendor.writeShim(paths, { platform: 'linux' });
  assert.equal(r.cmdPath, null);
  assert.equal(fs.existsSync(path.join(paths.home, '.local', 'bin', 'wienerdog.cmd')), false);
});

test('vendor: writeShim.onPath reflects whether ~/.local/bin is on PATH', () => {
  const paths = tempPaths();
  const localBin = path.join(paths.home, '.local', 'bin');
  const savedPath = process.env.PATH;
  try {
    process.env.PATH = `/usr/bin:${localBin}:/bin`;
    assert.equal(vendor.writeShim(paths, {}).onPath, true);
    process.env.PATH = '/usr/bin:/bin';
    assert.equal(vendor.writeShim(paths, {}).onPath, false);
  } finally {
    process.env.PATH = savedPath;
  }
});

// ── WP-157: out-of-tree launcher, read-only publish, containment ────────────

test('vendor: writeLauncher places launch.js OUTSIDE app/, records dir+file, idempotent (WP-157)', () => {
  const paths = tempPaths();
  const src = fakeSource('0.3.0');
  const manifest = { version: 1, createdAt: '', entries: [] };
  vendor.vendorSelf(paths, { sourceRoot: src, env: {}, manifest });

  const launcher = vendor.launcherPath(paths);
  assert.equal(launcher, path.join(paths.core, 'launcher', 'launch.js'));
  assert.ok(fs.statSync(launcher).isFile(), 'launcher placed');
  // OUTSIDE the app tree — a scoped write to app/ cannot disable it.
  assert.ok(!launcher.startsWith(vendor.appDir(paths) + path.sep), 'launcher is not under app/');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(launcher).mode & 0o111, 0o111, 'launcher is executable');
  }
  // Its bytes equal the packaged self-contained launcher source (installer file).
  const pkgLauncher = fs.readFileSync(path.join(vendor.packageRoot(), 'src', 'scheduler', 'launcher.js'));
  assert.ok(fs.readFileSync(launcher).equals(pkgLauncher), 'launcher copied from the installer, not the vendored fixture');
  // The dir is recorded BEFORE the file so uninstall removes both (core empties).
  const dirIdx = manifest.entries.findIndex((e) => e.kind === 'dir' && e.path === path.dirname(launcher));
  const fileIdx = manifest.entries.findIndex((e) => e.kind === 'file' && e.path === launcher);
  assert.ok(dirIdx !== -1 && fileIdx !== -1, 'dir + file recorded');
  assert.ok(dirIdx < fileIdx, 'dir recorded before file (reverse removes file first)');

  // Idempotent: a second vendor writes no duplicate entries and leaves it identical.
  const bytes = fs.readFileSync(launcher);
  vendor.vendorSelf(paths, { sourceRoot: src, env: {}, manifest });
  assert.ok(fs.readFileSync(launcher).equals(bytes));
  assert.equal(manifest.entries.filter((e) => e.kind === 'file' && e.path === launcher).length, 1);
});

test('vendor: the published version dir files are read-only after publish; dirs stay writable so uninstall works (WP-157)', { skip: process.platform === 'win32' }, () => {
  const paths = tempPaths();
  const src = fakeSource('0.4.0');
  vendor.vendorSelf(paths, { sourceRoot: src, env: {} });
  const versionDir = path.join(paths.core, 'app', '0.4.0');

  const binFile = path.join(versionDir, 'bin', 'wienerdog.js');
  assert.equal(fs.statSync(binFile).mode & 0o222, 0, 'a published file has no write bits');
  // Directories are left writable so a recursive rmSync (uninstall) still unlinks.
  assert.notEqual(fs.statSync(path.join(versionDir, 'bin')).mode & 0o200, 0, 'dirs remain owner-writable');
  assert.doesNotThrow(() => fs.rmSync(versionDir, { recursive: true, force: true }), 'read-only files still removable');
  assert.equal(fs.existsSync(versionDir), false);
});

test('vendor: an interrupted publish (staging removed before rename) leaves the previous valid current (WP-157)', () => {
  const paths = tempPaths();
  const v1 = fakeSource('1.0.0');
  const manifest = { version: 1, createdAt: '', entries: [] };
  vendor.vendorSelf(paths, { sourceRoot: v1, env: {}, manifest });
  const link = vendor.currentLink(paths);
  const before = fs.realpathSync(link);

  // Simulate an interrupted upgrade to 2.0.0: the copy crashes mid-staging (no
  // atomic rename ever happens). The prior current must stay intact + valid.
  const v2 = fakeSource('2.0.0');
  const origCp = fs.cpSync;
  fs.cpSync = () => {
    throw new Error('disk full mid-copy');
  };
  try {
    assert.throws(() => vendor.vendorSelf(paths, { sourceRoot: v2, env: {}, manifest }), /disk full/);
  } finally {
    fs.cpSync = origCp;
  }
  assert.equal(fs.realpathSync(link), before, 'current still points at the prior valid version');
  assert.ok(fs.existsSync(path.join(before, 'bin', 'wienerdog.js')), 'the prior version is intact');
  assert.equal(fs.existsSync(path.join(paths.core, 'app', '2.0.0')), false, 'the interrupted version never published');
});

test('vendor: verifyCurrentContainment accepts a contained prod tree and rejects an out-of-root symlink (WP-157)', { skip: process.platform === 'win32' }, () => {
  const paths = tempPaths();
  const src = fakeSource('0.5.0');
  vendor.vendorSelf(paths, { sourceRoot: src, env: {} });
  const ok = vendor.verifyCurrentContainment(paths);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.target, fs.realpathSync(vendor.currentLink(paths)));

  // Repoint current OUT of <core>/app (attacker symlink escape) → refuse.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-evil-'));
  fs.rmSync(vendor.currentLink(paths), { force: true });
  fs.symlinkSync(outside, vendor.currentLink(paths));
  const bad = vendor.verifyCurrentContainment(paths);
  assert.equal(bad.ok, false);
  assert.match(bad.why, /outside/);
});
