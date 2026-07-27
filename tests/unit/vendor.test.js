'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const vendor = require('../../src/core/vendor');
const launcher = require('../../src/scheduler/launcher');
const { WienerdogError } = require('../../src/core/errors');
// The A7 fixture builder is IMPORTED, never edited (it is not a deliverable of
// WP-stance-authority-containment).
const { stubForeignOwner, corePathsOf } = require('../scenarios/a7-integrity/fixtures/build');

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

// T1 (converts the pre-WP-stance-authority-containment "dev mode via
// WIENERDOG_DEV" test). No environment variable may select a verification path
// (Table D), so WIENERDOG_DEV is now INERT: the `.git`-free source is copied and
// `current` stays contained ⇒ the install is prod. AC9.
test('vendor: WIENERDOG_DEV=1 is INERT — a .git-free source is still copied and current stays contained', () => {
  const paths = tempPaths();
  const src = fakeSource('9.9.9');

  const r = vendor.vendorSelf(paths, { sourceRoot: src, env: { WIENERDOG_DEV: '1' } });
  assert.equal(r.dev, false, 'an env var cannot select the reduced (dev) path');
  assert.equal(r.copied, true, 'the published files are copied, exactly as without the var');
  const app = path.join(paths.core, 'app');
  assert.equal(fs.realpathSync(path.join(app, '9.9.9')), fs.realpathSync(r.target), 'a frozen snapshot IS published');
  assert.equal(vendor.installStance(paths), 'prod', 'containment decides the stance, not the environment');
  const rel = path.relative(fs.realpathSync(app), fs.realpathSync(vendor.currentLink(paths)));
  assert.ok(rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel), 'current resolves INSIDE <core>/app');
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

// ── WP-stance-authority-containment: containment decides the stance ─────────

/** A prod-shaped install: `current` → `<core>/app/<version>` (contained). */
function containedInstall(version = '0.6.0') {
  const paths = tempPaths();
  vendor.vendorSelf(paths, { sourceRoot: fakeSource(version), env: {} });
  return paths;
}

/** A dev-shaped install: `current` → a checkout OUTSIDE `<core>/app`. */
function outsideInstall(version = '0.6.0') {
  const paths = tempPaths();
  const checkout = fakeSource(version);
  fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /elsewhere\n');
  vendor.vendorSelf(paths, { sourceRoot: checkout, env: {} });
  return { paths, checkout };
}

// T2 — AC3 + AC4. Table A at the MINT side.
test('vendor: installStance is decided by containment, fails closed, and never consults ownership', { skip: process.platform === 'win32' }, () => {
  // contained ⇒ prod
  const prod = containedInstall('0.6.0');
  assert.equal(vendor.installStance(prod), 'prod');

  // a planted `.git` INSIDE the app tree does NOT downgrade it (the whole point)
  fs.mkdirSync(path.join(fs.realpathSync(vendor.currentLink(prod)), '.git'));
  assert.equal(vendor.installStance(prod), 'prod', 'a planted .git cannot select the reduced path');

  // outside ⇒ dev
  const { paths: dev } = outsideInstall('0.6.1');
  assert.equal(vendor.installStance(dev), 'dev');

  // AC3 — fail closed to the ENFORCED path on every unresolvable shape.
  const missing = tempPaths();
  fs.mkdirSync(vendor.appDir(missing), { recursive: true });
  assert.equal(vendor.installStance(missing), 'prod', 'missing current ⇒ prod');
  fs.symlinkSync(path.join(os.tmpdir(), 'wd-does-not-exist-stance'), vendor.currentLink(missing));
  assert.equal(vendor.installStance(missing), 'prod', 'dangling current ⇒ prod');
  const noApp = tempPaths();
  assert.equal(vendor.installStance(noApp), 'prod', 'unresolvable <core>/app ⇒ prod');

  // AC4 — OWNERSHIP MUST NEVER SELECT AN ARM. Both halves in one test, so an
  // implementation delegating to verifyCurrentContainment (which also fails on a
  // foreign uid) cannot pass: it would return 'dev' here.
  const owned = containedInstall('0.6.2');
  const target = fs.realpathSync(vendor.currentLink(owned)); // the resolved TARGET is what is stat'd
  const restore = stubForeignOwner(target);
  try {
    assert.equal(vendor.verifyCurrentContainment(owned).ok, false, 'the stub really fires (non-vacuity)');
    assert.equal(vendor.installStance(owned), 'prod', 'a foreign-owned current must NOT select the reduced path');
  } finally {
    restore();
  }
});

// T3 — AC10. Enforced, not documented (Table D).
test('vendor: no .js under src/ outside the launcher reads WIENERDOG_DEV (with a non-vacuity control)', () => {
  const srcRoot = path.join(vendor.packageRoot(), 'src');
  const allowed = path.join(srcRoot, 'scheduler', 'launcher.js');
  /** @type {string[]} */ const offenders = [];
  let visited = 0;
  let homeHits = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.js')) {
        visited += 1;
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes('WIENERDOG_HOME')) homeHits += 1;
        if (full !== allowed && text.includes('WIENERDOG_DEV')) offenders.push(full);
      }
    }
  };
  walk(srcRoot);
  // Non-vacuity: a walker that silently visits nothing would pass forever.
  assert.ok(visited >= 60, `the walk visited ${visited} .js files under src/ (expected >= 60)`);
  assert.ok(homeHits >= 5, `the walk found WIENERDOG_HOME in ${homeHits} files (expected >= 5)`);
  assert.deepEqual(offenders, [], 'WIENERDOG_DEV survives ONLY as the launcher\'s defensive scrub');
});

// T4 — AC11. The two independent implementations of Table A must agree.
test('vendor: launcher.liveStance ≡ vendor.installStance over every install shape', { skip: process.platform === 'win32' }, () => {
  /** @type {Array<{name:string, paths:object}>} */
  const shapes = [];
  shapes.push({ name: 'contained prod', paths: containedInstall('0.7.0') });
  shapes.push({ name: 'non-contained dev', paths: outsideInstall('0.7.1').paths });

  const missing = tempPaths();
  fs.mkdirSync(vendor.appDir(missing), { recursive: true });
  shapes.push({ name: 'missing current', paths: missing });

  // Table E row 7's discriminator: capture the core paths FIRST, then remove
  // <core>/app entirely. A naive `containedIn(...) ? 'prod' : 'dev'` fails OPEN
  // here and this shape is the only one that catches it.
  const gone = tempPaths();
  fs.mkdirSync(vendor.appDir(gone), { recursive: true });
  const goneCore = corePathsOf(gone);
  fs.rmSync(vendor.appDir(gone), { recursive: true, force: true });
  shapes.push({ name: 'unresolvable <core>/app', paths: gone, corePaths: goneCore });

  const seen = new Set();
  for (const s of shapes) {
    const mint = vendor.installStance(s.paths);
    const fire = launcher.liveStance(s.corePaths || corePathsOf(s.paths));
    assert.equal(fire, mint, `${s.name}: the fire-time and mint-time implementations disagree`);
    seen.add(mint);
  }
  // Without this, two constant functions would satisfy the equality.
  assert.ok(seen.has('prod') && seen.has('dev'), `both stances must occur across the shapes (saw ${[...seen].join(',')})`);
});

// T11 — AC17. D8 reuses the existing `isSemver`; the test drives readVersion and
// deliberately imports NO predicate of its own.
test('vendor: readVersion refuses a tampered package.json version, and accepts real ones', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ver-'));
  const set = (v) => fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'wienerdog', version: v }));

  const refused = ['../../escaped', 'a/b', 'current', 'Current', 'current.tmp.9', 'Current.tmp.9', '0.10.0.', '', null, 42];
  for (const v of refused) {
    set(v);
    assert.throws(
      () => vendor.readVersion(root),
      (err) => {
        assert.equal(err.name, 'WienerdogError', `${JSON.stringify(v)} must be a WienerdogError`);
        assert.ok(err instanceof WienerdogError);
        assert.ok(err.message.includes(path.join(root, 'package.json')), 'the message names the package.json path');
        return true;
      },
      `version ${JSON.stringify(v)} must be refused, not sanitised`
    );
  }

  for (const v of ['0.10.0', '0.0.1', '1.2.3-rc.1+build.7', '999.0.0-a7test']) {
    set(v);
    assert.equal(vendor.readVersion(root), v, `version ${JSON.stringify(v)} must be accepted`);
  }
});

// T12 — AC16. The FIVE GATED shapes of "Table G — canonical scope statement":
// an attended `sync` carries containment forward, OR refuses; no A7-scoped DATA
// write changes it. The sixth (symlink) shape is V9's KNOWN-OPEN row and is
// deliberately NOT asserted here — a test that must fail is not a test.
test('vendor: an attended sync carries containment forward or refuses — no DATA-shaped A7 write moves it', { skip: process.platform === 'win32' }, () => {
  const REPO = vendor.packageRoot();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-syncinv-'));

  const contained = (core) => {
    const app = path.join(core, 'app');
    try {
      const rel = path.relative(fs.realpathSync(app), fs.realpathSync(path.join(app, 'current')));
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    } catch {
      return 'UNRESOLVABLE';
    }
  };

  const run = (name, { outside, write }) => {
    const base = path.join(root, name);
    const core = path.join(base, 'core');
    const app = path.join(core, 'app');
    const paths = { core, home: base, state: path.join(core, 'state') };
    const start = outside ? path.join(base, 'checkout') : path.join(app, '0.0.1');
    fs.mkdirSync(start, { recursive: true });
    fs.mkdirSync(app, { recursive: true });
    vendor.copyTree(REPO, start);
    fs.symlinkSync(start, path.join(app, 'current'));
    // A real installed core always has the out-of-tree launcher a first install
    // published. This fixture hand-builds the core, so publish it by hand.
    fs.mkdirSync(path.join(core, 'launcher'), { recursive: true });
    fs.copyFileSync(
      path.join(REPO, 'src', 'scheduler', 'launcher.js'),
      path.join(core, 'launcher', 'launch.js')
    );
    const before = contained(core);
    if (write === 'git') fs.writeFileSync(path.join(start, '.git'), 'gitdir: /elsewhere\n');
    if (write === 'version') {
      const pj = path.join(start, 'package.json');
      fs.chmodSync(pj, 0o644);
      const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
      j.version = '../../escaped';
      fs.writeFileSync(pj, JSON.stringify(j, null, 2));
    }
    let after;
    try {
      // Required THROUGH app/current — that is what makes packageRoot() the app
      // tree, exactly as the ~/.local/bin shim makes it on a real install.
      require(path.join(app, 'current', 'src', 'core', 'vendor')).vendorSelf(paths, {});
      after = contained(core);
    } catch {
      after = 'REFUSED';
    }
    return { before, after };
  };

  const base = run('contained-clean', { outside: false, write: 'none' });
  const gitP = run('contained-plant-git', { outside: false, write: 'git' });
  const verP = run('contained-bad-version', { outside: false, write: 'version' });
  const outB = run('outside-clean', { outside: true, write: 'none' });
  const outG = run('outside-plant-git', { outside: true, write: 'git' });

  // Oracle guards on the STARTING shapes, never on the outcome under test.
  for (const [n, r] of [['contained-clean', base], ['contained-plant-git', gitP], ['contained-bad-version', verP]]) {
    assert.equal(r.before, true, `${n} must start contained`);
  }
  for (const [n, r] of [['outside-clean', outB], ['outside-plant-git', outG]]) {
    assert.equal(r.before, false, `${n} must start outside`);
  }

  // The clean baselines are CARRIED FORWARD — without these two an
  // implementation that inverts every row satisfies the neighbour comparisons.
  assert.equal(base.after, base.before, 'contained-clean is carried forward unchanged');
  assert.equal(outB.after, outB.before, 'outside-clean is carried forward unchanged');
  // The planted rows track their baseline, or the call refuses (qualifier iii).
  assert.equal(gitP.after, base.after, 'a planted .git does not move containment');
  assert.ok(verP.after === base.after || verP.after === 'REFUSED', 'a tampered version refuses rather than moving containment');
  assert.equal(outG.after, outB.after, 'a planted .git does not move containment on a non-contained install');
});
