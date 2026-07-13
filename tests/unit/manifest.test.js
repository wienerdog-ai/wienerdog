'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');

/** Create a fresh temp core and return its resolved paths. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-manifest-'));
  const core = path.join(root, 'wd');
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/**
 * Build a realistic install on disk (core + subdirs + config) plus a matching
 * saved manifest, and return the manifest.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 */
function makeInstall(paths) {
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state);
  fs.mkdirSync(paths.secrets, { mode: 0o700 });
  fs.mkdirSync(paths.logs);
  // Mirror a real install: `sync` (which init runs) leaves an untracked runtime
  // artifact in state/, so the core is never physically empty when reverse()
  // runs. reverse() therefore never rmdirs the core — it leaves the manifest
  // ledger behind, and disposeCoreMechanics (in uninstall.js) finishes the job.
  fs.writeFileSync(path.join(paths.state, 'scheduler-status.json'), '{}\n');
  const content = 'version: 1\n';
  fs.writeFileSync(paths.config, content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const manifest = { version: 1, createdAt: new Date().toISOString(), entries: [] };
  manifestLib.record(manifest, { kind: 'dir', path: paths.core });
  manifestLib.record(manifest, { kind: 'dir', path: paths.state });
  manifestLib.record(manifest, { kind: 'dir', path: paths.secrets });
  manifestLib.record(manifest, { kind: 'dir', path: paths.logs });
  manifestLib.record(manifest, { kind: 'file', path: paths.config, hash });
  manifestLib.save(paths, manifest);
  return manifest;
}

const { hashDir } = manifestLib;

/** Fresh empty temp dir. */
function tempDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `wd-hashdir-${tag}-`));
}

const isPosix = process.platform !== 'win32';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

test('hashDir is deterministic: two independently-built identical trees hash equal', () => {
  const a = tempDir('detA');
  const b = tempDir('detB');
  for (const root of [a, b]) {
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'top.md'), 'hello\n');
    fs.writeFileSync(path.join(root, 'sub', 'ref.md'), 'world\n');
  }
  const ha = hashDir(a);
  assert.equal(typeof ha, 'string');
  assert.match(ha, /^[0-9a-f]{64}$/);
  assert.equal(ha, hashDir(b), 'identical trees at different roots hash equal');
});

test('hashDir changes when a single content byte changes', () => {
  const a = tempDir('byteA');
  const b = tempDir('byteB');
  fs.writeFileSync(path.join(a, 'f'), 'abc');
  fs.writeFileSync(path.join(b, 'f'), 'abd');
  assert.notEqual(hashDir(a), hashDir(b));
});

test('hashDir returns null for a non-existent root', () => {
  assert.equal(hashDir(path.join(os.tmpdir(), 'wd-does-not-exist-xyz-123')), null);
});

test('hashDir returns null for an unreadable subtree, which never equals an empty tree', (t) => {
  if (!isPosix || isRoot) return t.skip('needs POSIX permission enforcement (non-root)');
  const root = tempDir('unread');
  const locked = path.join(root, 'locked');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'secret'), 'x\n');
  fs.chmodSync(locked, 0o000);
  try {
    const h = hashDir(root);
    assert.equal(h, null, 'a tree containing an unreadable subtree fails closed to null');
    const empty = tempDir('empty');
    assert.notEqual(h, hashDir(empty), 'null (unreadable) never equals an empty-tree digest');
  } finally {
    fs.chmodSync(locked, 0o700); // restore so tmp cleanup can proceed
  }
});

test('hashDir length-framing: two sibling files vs one file whose content mimics the naive stream', () => {
  // {a:"", b:""} would, under an unframed `f:<path>\n<content>\n` serializer,
  // emit the same bytes as a single file `a` whose content is "\nf:b\n".
  const two = tempDir('collideTwo');
  fs.writeFileSync(path.join(two, 'a'), '');
  fs.writeFileSync(path.join(two, 'b'), '');
  const one = tempDir('collideOne');
  fs.writeFileSync(path.join(one, 'a'), '\nf:b\n');
  assert.notEqual(hashDir(two), hashDir(one), 'length-framing keeps the naive-collision pair distinct');
});

test('hashDir length-framing: empty dir x + empty file y vs one dir whose name holds a newline', (t) => {
  if (!isPosix) return t.skip('newline in filename is not creatable on Windows');
  const sep = tempDir('sepEntries');
  fs.mkdirSync(path.join(sep, 'x'));
  fs.writeFileSync(path.join(sep, 'y'), '');
  const merged = tempDir('mergedName');
  fs.mkdirSync(path.join(merged, 'x\ny')); // a single directory whose name contains a newline
  assert.notEqual(hashDir(sep), hashDir(merged), 'a newline in a dir name never folds into a sibling');
});

test('hashDir distinguishes a regular file from a symlink with byte-identical name/target', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const fileTree = tempDir('nodeFile');
  fs.writeFileSync(path.join(fileTree, 'a'), 'target');
  const linkTree = tempDir('nodeLink');
  fs.symlinkSync('target', path.join(linkTree, 'a')); // link target "target" == the file's content
  assert.notEqual(hashDir(fileTree), hashDir(linkTree), 'the d/f/l node-type tag separates file from symlink');
});

test('hashDir distinguishes a regular file from a same-name FIFO/special node', (t) => {
  if (!isPosix) return t.skip('FIFO creation needs POSIX mkfifo');
  const cp = require('node:child_process');
  const fifoTree = tempDir('nodeFifo');
  try {
    cp.execFileSync('mkfifo', [path.join(fifoTree, 'a')]);
  } catch {
    return t.skip('mkfifo unavailable');
  }
  const fileTree = tempDir('nodeFileB');
  fs.writeFileSync(path.join(fileTree, 'a'), '');
  const hFifo = hashDir(fifoTree);
  assert.equal(typeof hFifo, 'string', 'a special node hashes to the "s" branch without reading it (no block)');
  assert.notEqual(hFifo, hashDir(fileTree), 'the special-node "s" tag differs from a regular file');
});

test('hashDir distinguishes raw-byte names 0x80 vs 0x81 (no UTF-8 folding)', (t) => {
  if (!isPosix) return t.skip('raw-byte filenames are not creatable on Windows');
  const t80 = tempDir('raw80');
  const t81 = tempDir('raw81');
  try {
    // Some filesystems (e.g. APFS/HFS+ on macOS) enforce UTF-8 names and reject
    // raw high bytes with EILSEQ; ext4 and friends accept them.
    fs.writeFileSync(Buffer.concat([Buffer.from(t80), Buffer.from('/'), Buffer.from([0x80])]), '');
    fs.writeFileSync(Buffer.concat([Buffer.from(t81), Buffer.from('/'), Buffer.from([0x81])]), '');
  } catch (err) {
    if (err && err.code === 'EILSEQ') return t.skip('filesystem forbids non-UTF-8 filenames');
    throw err;
  }
  assert.notEqual(hashDir(t80), hashDir(t81), 'raw Buffer names keep 0x80 and 0x81 distinct');
});

test('load returns an empty manifest when none exists', () => {
  const paths = tempPaths();
  const manifest = manifestLib.load(paths);
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.entries, []);
});

test('record + save + load round-trips entries', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  const manifest = manifestLib.load(paths);
  manifestLib.record(manifest, { kind: 'dir', path: paths.core });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  assert.equal(reloaded.entries.length, 1);
  assert.deepEqual(reloaded.entries[0], { kind: 'dir', path: paths.core });
});

test('load throws on a corrupted manifest', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.writeFileSync(paths.manifest, '{ not valid json');
  assert.throws(() => manifestLib.load(paths));
});

test('reverse does NOT delete the install manifest (recovery ledger survives for uninstall.js)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  assert.equal(fs.existsSync(paths.manifest), true);
  manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(paths.manifest), true, 'the manifest file remains after reverse() returns');
});

test('reverse removes tracked files and empty dirs but defers config + leaves the manifest ledger and core', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { removed, skipped, deferredConfig } = manifestLib.reverse(paths, manifest, {});
  // The recovery ledger and the core survive reverse() — the manifest still sits
  // in the (physically non-empty) core, which uninstall.js removes later.
  assert.equal(fs.existsSync(paths.manifest), true, 'reverse() does NOT delete the manifest');
  assert.equal(fs.existsSync(paths.core), true, 'core kept alive (the manifest still sits in it)');
  // config.yaml (unmodified) is now DEFERRED, not deleted by reverse() — it is
  // returned in deferredConfig and deleted LAST by uninstall.js.
  assert.equal(deferredConfig, paths.config, 'the unmodified config is deferred, not removed');
  assert.ok(!removed.includes(paths.config), 'reverse() does not delete config.yaml');
  assert.equal(fs.existsSync(paths.config), true, 'config.yaml survives reverse() for the vault-path source');
  assert.ok(removed.includes(paths.logs) && removed.includes(paths.secrets), 'empty tracked dirs removed');
  // state holds an untracked artifact (as after a real sync) → kept; core kept.
  assert.ok(skipped.includes(paths.state));
  assert.ok(skipped.includes(paths.core));
});

test('reverse never rmdirs the core even when it is virtually empty (retry-after-partial-sweep wedge guard)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // Simulate a RETRY after a partial uninstall: the first attempt already reversed
  // the tracked files, and the mechanics sweep already removed state/, but crashed
  // before deleting the manifest. On disk only the manifest remains in the core.
  fs.rmSync(paths.config, { force: true });
  fs.rmSync(paths.state, { recursive: true, force: true });
  fs.rmSync(paths.secrets, { recursive: true, force: true });
  fs.rmSync(paths.logs, { recursive: true, force: true });
  assert.equal(fs.existsSync(paths.manifest), true, 'the ledger is still physically present');
  // Pre-fix this threw ENOTEMPTY (core virtually empty + manifest still on disk),
  // wedging every retry before manifest deletion. It must NOT throw or rmdir core.
  let result;
  assert.doesNotThrow(() => {
    result = manifestLib.reverse(paths, manifest, {});
  });
  assert.equal(fs.existsSync(paths.core), true, 'reverse() leaves the core for uninstall.js disposal');
  assert.equal(fs.existsSync(paths.manifest), true, 'the ledger survives — the retry can proceed');
  assert.ok(result.skipped.includes(paths.core), 'the core is reported skipped, never removed');
  assert.ok(!result.removed.includes(paths.core));
});

test('reverse dry-run removes nothing but reports would-be removals (config deferred either way)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { removed, deferredConfig } = manifestLib.reverse(paths, manifest, { dryRun: true });
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.config), true);
  assert.equal(fs.existsSync(paths.manifest), true);
  // config.yaml is deferred under dryRun too (reverse never deletes it either way);
  // it moved out of `removed` into `deferredConfig`.
  assert.ok(!removed.includes(paths.config));
  assert.equal(deferredConfig, paths.config, 'dry-run still reports the deferred config');
  assert.ok(removed.includes(paths.logs), 'other tracked items still listed as would-be removed');
});

test('reverse keeps config.yaml when it was modified since install (deferredConfig null)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.writeFileSync(paths.config, 'user edited this\n');
  const { removed, skipped, deferredConfig } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(paths.config));
  assert.ok(!removed.includes(paths.config));
  assert.equal(deferredConfig, null, 'a customized config is NOT deferred for deletion (kept forever)');
  assert.equal(fs.existsSync(paths.config), true);
  // Core dir must remain because config still lives in it.
  assert.equal(fs.existsSync(paths.core), true);
});

// ── Global deferred-member guard: cross-kind regression (REAL manifest JSON,
//    loaded via manifestLib.load, reverse() on the REAL filesystem, NO fs stubs).
//    Each asserts the targeted deferred member survives on disk and is NOT in
//    `removed` — proving the single guard before the kind dispatch closes every
//    DIRECT path-based route regardless of entry kind or path normalization. ──

const MB_BEGIN = '<!-- wienerdog:begin -->';
const MB_END = '<!-- wienerdog:end -->';

test('global guard (i): a self-referential {kind:file, path: manifest} entry never deletes the ledger', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  manifestLib.record(manifest, { kind: 'file', path: paths.manifest });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed, skipped } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.manifest), true, 'the real ledger is intact on disk');
  assert.ok(!removed.includes(paths.manifest), 'manifest not in removed');
  assert.ok(skipped.includes(paths.manifest));
});

test('global guard (ii): a {kind:scheduler-entry, path: manifest} entry never rmSyncs the ledger', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: paths.manifest }); // no unload
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.manifest), true, 'scheduler-entry did not delete the ledger');
  assert.ok(!removed.includes(paths.manifest));
});

test('global guard (iii): a {kind:symlink} whose path resolves to a deferred member is never unlinked', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A symlink (inside the core) pointing at the manifest ledger. Without the
  // realpath-aware guard, reverseSymlink would unlink it.
  const link = path.join(paths.core, 'ledger-link');
  fs.symlinkSync(paths.manifest, link);
  manifestLib.record(manifest, { kind: 'symlink', path: link });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed, skipped } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.manifest), true, 'the ledger survives');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the symlink to a deferred member is not unlinked');
  assert.ok(!removed.includes(link));
  assert.ok(skipped.includes(link));
});

test('global guard (iv): a {kind:settings-entry, path: config} never rewrites/deletes config (mutation branch)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // Craft config so that WITHOUT the guard reverseSettingsEntry would delete it:
  // valid JSON with empty hooks + createdFile:true prunes to {} → rmSync.
  const cfg = '{"hooks":{}}';
  fs.writeFileSync(paths.config, cfg);
  manifestLib.record(manifest, { kind: 'settings-entry', path: paths.config, createdFile: true, commands: [] });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.config), true, 'config not deleted by the settings-entry');
  assert.equal(fs.readFileSync(paths.config, 'utf8'), cfg, 'config content not rewritten');
  assert.ok(!removed.includes(paths.config));
});

test('global guard (iv-b): a {kind:managed-block, path: config} never rewrites/deletes config (mutation branch)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // Craft config as a Wienerdog-created managed-block-only file so that WITHOUT
  // the guard reverseManagedBlock (createdFile:true, remaining empty) would rmSync it.
  const cfg = `${MB_BEGIN}\nblock body\n${MB_END}\n`;
  fs.writeFileSync(paths.config, cfg);
  manifestLib.record(manifest, { kind: 'managed-block', path: paths.config, createdFile: true });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.config), true, 'config not deleted by the managed-block entry');
  assert.equal(fs.readFileSync(paths.config, 'utf8'), cfg, 'config content not rewritten');
  assert.ok(!removed.includes(paths.config));
});

test('global guard (v): a normalized {kind:file, path: <core>/./config.yaml} alias defers config to the CANONICAL path', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths); // records the canonical config file entry (matching hash)
  const alias = `${paths.core}/./config.yaml`; // un-normalized alias string (path.join would collapse it)
  assert.notEqual(alias, paths.config, 'the alias is a distinct string from the canonical path');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(paths.config)).digest('hex');
  manifestLib.record(manifest, { kind: 'file', path: alias, hash });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed, deferredConfig } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.config), true, 'the normalized alias did not reach the generic rmSync');
  assert.equal(deferredConfig, paths.config, 'deferredConfig is the CANONICAL path, not the alias');
  assert.ok(!removed.includes(alias) && !removed.includes(paths.config));
});

test('global guard (vi): a {kind:scheduler-entry, path: config} leaves config intact', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: paths.config }); // no unload
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);
  const { removed } = manifestLib.reverse(paths, reloaded, {});
  assert.equal(fs.existsSync(paths.config), true, 'scheduler-entry did not delete config');
  assert.ok(!removed.includes(paths.config));
});

test('global guard (vii) DOCUMENTED RESIDUAL: a scheduler-entry `unload` argv IS invoked as designed (guard screens entry.path, NOT unload)', () => {
  // The global guard screens entry.path only. A scheduler-entry with a
  // NON-deferred path but an `unload` argv that would touch a deferred member
  // still runs its unload — an explicit, ACCEPTED out-of-scope residual (WP-088
  // Non-goals / round 6). This test PINS that behavior + scoping; it is NOT a
  // "guard blocks it" assertion. Forging `unload` requires write access to the
  // core, which already grants arbitrary code execution.
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const schedFile = path.join(paths.core, 'schedules', 'wienerdog-dream.plist');
  fs.mkdirSync(path.dirname(schedFile), { recursive: true });
  fs.writeFileSync(schedFile, '<plist/>\n');
  const unload = ['launchctl', 'bootout', `would-touch:${paths.manifest}`];
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: schedFile, unload });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);

  // Spy on the single scheduler mutation chokepoint (reverse() re-requires the
  // module, so mutating its export is observed).
  const spawnMod = require('../../src/scheduler/spawn');
  const origSpawn = spawnMod.schedulerSpawn;
  /** @type {string[][]} */ const calls = [];
  spawnMod.schedulerSpawn = (argv) => { calls.push(argv); return { status: 0 }; };
  try {
    manifestLib.reverse(paths, reloaded, {});
  } finally {
    spawnMod.schedulerSpawn = origSpawn;
  }
  assert.equal(calls.length, 1, 'the unload argv is invoked as designed (accepted residual)');
  assert.deepEqual(calls[0], unload, 'the exact unload argv reached the chokepoint — the guard did NOT block it');
  // And this indirect route is NOT a WP-088 regression: the ledger is untouched
  // (the unload was a marker, not a real delete).
  assert.equal(fs.existsSync(paths.manifest), true);
});

test('reverse preserves ANY kind:file entry whose recorded hash no longer matches (generalized guard)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A hashed file that is NOT config.yaml — the generalized prove-before-delete.
  const extra = path.join(paths.core, 'notes.md');
  const content = '# notes\n';
  fs.writeFileSync(extra, content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  manifestLib.record(manifest, { kind: 'file', path: extra, hash });
  manifestLib.save(paths, manifest);
  // The user edits it after install.
  fs.writeFileSync(extra, '# edited by the user\n');
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(extra), 'a modified hashed file is kept, not deleted');
  assert.ok(!removed.includes(extra));
  assert.equal(fs.existsSync(extra), true);
});

test('reverse removes a kind:file entry whose recorded hash still matches', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const extra = path.join(paths.core, 'notes.md');
  const content = '# notes\n';
  fs.writeFileSync(extra, content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  manifestLib.record(manifest, { kind: 'file', path: extra, hash });
  manifestLib.save(paths, manifest);
  const { removed } = manifestLib.reverse(paths, manifest, {});
  assert.ok(removed.includes(extra));
  assert.equal(fs.existsSync(extra), false);
});

test('reverse reports already-gone entries as skipped', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.rmSync(paths.config);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(paths.config));
  // The empty tracked subdirs are still cleaned up; the core + ledger remain
  // for uninstall.js to finish.
  assert.equal(fs.existsSync(paths.logs), false);
  assert.equal(fs.existsSync(paths.secrets), false);
  assert.equal(fs.existsSync(paths.core), true);
});

test('reverse removes a vendored-tree at the app root recursively (core kept for the sweep)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A realistic vendored app tree at the app root: app/<version>/{bin,...} + symlink.
  const app = path.join(paths.core, 'app');
  const versionDir = path.join(app, '0.2.1');
  fs.mkdirSync(path.join(versionDir, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(versionDir, 'bin', 'wienerdog.js'), '// vendored\n');
  fs.symlinkSync(versionDir, path.join(app, 'current'));
  manifestLib.record(manifest, { kind: 'vendored-tree', path: app });
  manifestLib.save(paths, manifest);

  const { removed } = manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(app), false, 'the vendored app tree is removed recursively');
  assert.ok(removed.includes(app));
  // reverse() leaves the core + ledger; uninstall.js completes the removal.
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.manifest), true);
});

test('reverse refuses a vendored-tree entry EQUAL to the core (P0 core-deletion) — never recursive-deletes it', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  manifestLib.record(manifest, { kind: 'vendored-tree', path: paths.core });
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(paths.core), 'the core is never recursively removed via a vendored-tree entry');
  assert.ok(skipped.includes(paths.core));
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.manifest), true, 'core contents (the ledger) survive the refusal');
});

test('reverse refuses a vendored-tree entry that is a descendant of (not equal to) the app root', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const app = path.join(paths.core, 'app');
  const nested = path.join(app, 'nested');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, 'x'), 'x\n');
  manifestLib.record(manifest, { kind: 'vendored-tree', path: nested });
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(nested));
  assert.ok(skipped.includes(nested));
  assert.equal(fs.existsSync(nested), true, 'a descendant of the app root is preserved, not removed');
});

test('reverse skips a vendored-tree entry that is already gone', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const app = path.join(paths.core, 'app');
  manifestLib.record(manifest, { kind: 'vendored-tree', path: app });
  manifestLib.save(paths, manifest);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(app), 'a missing vendored tree is skipped, not an error');
  assert.equal(fs.existsSync(paths.core), true);
});

test('reverse removes a legitimate copied-skill (parent is a harness skills root, wienerdog-*, fingerprint matches)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A realistic copied skill: <claudeDir>/skills/wienerdog-setup/{SKILL.md,sub/ref.md}.
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const copied = path.join(skillsRoot, 'wienerdog-setup');
  fs.mkdirSync(path.join(copied, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# skill\n');
  fs.writeFileSync(path.join(copied, 'sub', 'ref.md'), 'ref\n');
  const hash = manifestLib.hashDir(copied);
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied, hash });
  manifestLib.save(paths, manifest);

  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(copied), false, 'a fingerprint-matching Wienerdog skill is removed recursively');
  assert.ok(removed.includes(copied));
  assert.ok(!skipped.includes(copied));
});

test('reverse preserves a copied-skill whose on-disk tree no longer fingerprints to the recorded hash', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const copied = path.join(skillsRoot, 'wienerdog-setup');
  fs.mkdirSync(copied, { recursive: true });
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# skill\n');
  const hash = manifestLib.hashDir(copied);
  // The user edits/replaces Wienerdog's copy AFTER install → fingerprint drifts.
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# user edited\n');
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied, hash });
  manifestLib.save(paths, manifest);

  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(copied));
  assert.ok(skipped.includes(copied));
  assert.equal(fs.existsSync(copied), true, 'an edited copy is preserved, never deleted');
});

test('reverse preserves a copied-skill path that is a SYMLINK to an identical tree (lstat ownership gate, not deleted)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // The user moved our fallback-copied skill to their OWN location and left a
  // symlink at the copied-skill path pointing at an identical-content tree.
  const realTree = path.join(path.dirname(paths.core), 'my-skills', 'wienerdog-setup');
  fs.mkdirSync(path.join(realTree, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(realTree, 'SKILL.md'), '# skill\n');
  fs.writeFileSync(path.join(realTree, 'sub', 'ref.md'), 'ref\n');
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const linkPath = path.join(skillsRoot, 'wienerdog-setup');
  fs.mkdirSync(skillsRoot, { recursive: true });
  fs.symlinkSync(realTree, linkPath);
  // The recorded hash MATCHES (hashDir follows the symlink to the identical tree),
  // so ONLY the lstat real-directory gate prevents the delete.
  const hash = manifestLib.hashDir(linkPath);
  assert.equal(hash, manifestLib.hashDir(realTree), 'the symlink fingerprints to the identical target tree');
  manifestLib.record(manifest, { kind: 'copied-skill', path: linkPath, hash });
  manifestLib.save(paths, manifest);

  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(linkPath), 'a symlink at the copied-skill path is never deleted');
  assert.ok(skipped.includes(linkPath));
  assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true, 'the user-created symlink survives (lstat gate)');
  assert.equal(fs.existsSync(path.join(realTree, 'SKILL.md')), true, 'the symlink target tree is untouched');
});

test('reverse preserves a legacy hash-less copied-skill entry (no fingerprint to verify)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const copied = path.join(skillsRoot, 'wienerdog-setup');
  fs.mkdirSync(copied, { recursive: true });
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# skill\n');
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied }); // no hash
  manifestLib.save(paths, manifest);

  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(copied));
  assert.ok(skipped.includes(copied));
  assert.equal(fs.existsSync(copied), true, 'a hash-less legacy entry is preserved, never deleted');
});

test('reverse preserves a copied-skill whose tree is unreadable (hashDir → null, never deleted)', (t) => {
  if (!isPosix || isRoot) return t.skip('needs POSIX permission enforcement (non-root)');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const copied = path.join(skillsRoot, 'wienerdog-setup');
  const locked = path.join(copied, 'locked');
  fs.mkdirSync(locked, { recursive: true });
  fs.writeFileSync(path.join(locked, 'secret'), 'x\n');
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied, hash: 'a'.repeat(64) });
  manifestLib.save(paths, manifest);
  fs.chmodSync(locked, 0o000);
  try {
    const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
    assert.ok(!removed.includes(copied));
    assert.ok(skipped.includes(copied));
    assert.equal(fs.existsSync(copied), true, 'an unreadable copy is never deleted');
  } finally {
    fs.chmodSync(locked, 0o700); // restore so tmp cleanup can proceed
  }
});

test('reverse refuses a copied-skill whose parent is NOT a harness skills root (deeper descendant)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const copied = path.join(skillsRoot, 'user-content', 'wienerdog-x');
  fs.mkdirSync(copied, { recursive: true });
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# skill\n');
  const hash = manifestLib.hashDir(copied);
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied, hash });
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(copied));
  assert.ok(skipped.includes(copied));
  assert.equal(fs.existsSync(copied), true, 'a deeper descendant is refused even with a matching fingerprint');
});

test('reverse refuses a copied-skill whose basename is outside the wienerdog-* namespace', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  const copied = path.join(skillsRoot, 'some-other-skill');
  fs.mkdirSync(copied, { recursive: true });
  fs.writeFileSync(path.join(copied, 'SKILL.md'), '# skill\n');
  const hash = manifestLib.hashDir(copied);
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied, hash });
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(!removed.includes(copied));
  assert.ok(skipped.includes(copied));
  assert.equal(fs.existsSync(copied), true, 'a non-wienerdog-* name is refused even directly under a skills root');
});

test('reverse skips a copied-skill entry that is already gone', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const copied = path.join(paths.claudeDir, 'skills', 'wienerdog-setup');
  manifestLib.record(manifest, { kind: 'copied-skill', path: copied, hash: 'a'.repeat(64) });
  manifestLib.save(paths, manifest);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(copied), 'a missing copied skill is skipped, not an error');
  assert.equal(fs.existsSync(paths.core), true);
});

test('reverse skips unknown entry kinds (forward compat)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [{ kind: 'settings-entry', path: 'some/config/key' }],
  };
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.deepEqual(removed, []);
  assert.ok(skipped.includes('some/config/key'));
});

test('reverse preserves vault-file/vault-dir entries (never removed, never skipped, no warning)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A vault living OUTSIDE the core, with seeded notes + an ensured dir.
  const vaultDir = path.join(path.dirname(paths.core), 'vault');
  const daily = path.join(vaultDir, '05-Daily');
  const note = path.join(daily, 'note.md');
  fs.mkdirSync(daily, { recursive: true });
  fs.writeFileSync(note, '# my note\n');
  manifestLib.record(manifest, { kind: 'vault-dir', path: daily });
  manifestLib.record(manifest, { kind: 'vault-file', path: note });
  manifestLib.save(paths, manifest);

  // Capture stderr to prove no unknown-kind warning for a known kind.
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let result;
  try {
    result = manifestLib.reverse(paths, manifest, {});
  } finally {
    process.stderr.write = origWrite;
  }

  assert.deepEqual(result.preserved.sort(), [daily, note].sort());
  assert.ok(!result.removed.includes(note) && !result.removed.includes(daily));
  assert.ok(!result.skipped.includes(note) && !result.skipped.includes(daily));
  assert.doesNotMatch(err, /unknown manifest entry kind 'vault-file'/);
  assert.doesNotMatch(err, /unknown manifest entry kind 'vault-dir'/);
  // The vault files are left untouched on disk.
  assert.equal(fs.readFileSync(note, 'utf8'), '# my note\n');
  assert.equal(fs.existsSync(daily), true);
});

test('disposeCoreMechanics recursively removes the four subdirs then rmdirs the empty core', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  // Non-empty machine-generated subdirs (untracked runtime artifacts).
  fs.mkdirSync(path.join(paths.state, 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# digest\n');
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(path.join(paths.logs, 'dream.log'), 'run\n');
  const schedules = path.join(paths.core, 'schedules');
  fs.mkdirSync(schedules, { recursive: true });
  fs.writeFileSync(path.join(schedules, 'wienerdog-dream.xml'), '<Task/>\n');
  fs.mkdirSync(paths.secrets, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(paths.secrets, 'google-token.json'), '{}\n');

  const { removed } = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(removed.includes(paths.state));
  assert.ok(removed.includes(paths.logs));
  assert.ok(removed.includes(schedules));
  assert.ok(removed.includes(paths.secrets));
  assert.ok(removed.includes(paths.core));
  assert.equal(fs.existsSync(paths.core), false);
});

test('disposeCoreMechanics is idempotent — a second run is a no-op', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  const first = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(first.removed.includes(paths.state));
  assert.equal(fs.existsSync(paths.core), false);
  const second = manifestLib.disposeCoreMechanics(paths, {});
  assert.deepEqual(second.removed, []);
});

test('disposeCoreMechanics keeps the core alive when config.yaml remains', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  // A kept (user-modified) config.yaml sits in the core root, not a swept subdir.
  fs.writeFileSync(paths.config, 'user edited this\n');
  const { removed } = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(removed.includes(paths.state));
  assert.ok(!removed.includes(paths.core), 'core kept while config.yaml remains');
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.config), true);
});

test('disposeCoreMechanics skips a mechanics dir that contains the vault (containment guard)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  // Legacy/hand-edited install: the vault was nested INSIDE state/.
  const nestedVault = path.join(paths.state, 'mynotes');
  fs.mkdirSync(nestedVault, { recursive: true });
  fs.writeFileSync(path.join(nestedVault, 'precious-note.md'), '# precious\n');
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(path.join(paths.logs, 'run.log'), 'x\n');

  const { removed, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    vaultPath: nestedVault,
  });
  // state/ (the dir containing the vault) is skipped; logs/ is still swept.
  assert.deepEqual(skippedForVault, [paths.state]);
  assert.ok(!removed.includes(paths.state));
  assert.ok(removed.includes(paths.logs));
  assert.ok(!removed.includes(paths.core), 'core kept alive — it still holds the vault');
  assert.equal(
    fs.readFileSync(path.join(nestedVault, 'precious-note.md'), 'utf8'),
    '# precious\n',
    'the nested vault survives byte-identical'
  );
});

test('disposeCoreMechanics containment guard is realpath-based (symlinked vault path)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  const nestedVault = path.join(paths.state, 'mynotes');
  fs.mkdirSync(nestedVault, { recursive: true });
  fs.writeFileSync(path.join(nestedVault, 'note.md'), 'n\n');
  // The configured vault path reaches the nested dir through a symlink.
  const link = path.join(path.dirname(paths.core), 'vault-link');
  fs.symlinkSync(nestedVault, link);

  const { skippedForVault } = manifestLib.disposeCoreMechanics(paths, { vaultPath: link });
  assert.deepEqual(skippedForVault, [paths.state], 'symlinked vault path still detected inside state/');
  assert.equal(fs.existsSync(path.join(nestedVault, 'note.md')), true);
});

test('disposeCoreMechanics with a vault safely outside the core sweeps everything (guard inert)', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  const outsideVault = path.join(path.dirname(paths.core), 'vault');
  fs.mkdirSync(outsideVault, { recursive: true });

  const { removed, skippedForVault } = manifestLib.disposeCoreMechanics(paths, {
    vaultPath: outsideVault,
  });
  assert.deepEqual(skippedForVault, []);
  assert.ok(removed.includes(paths.state));
  assert.ok(removed.includes(paths.core));
  assert.equal(fs.existsSync(paths.core), false);
  assert.equal(fs.existsSync(outsideVault), true);
});

test('disposeCoreMechanics on a symlinked core unlinks the link, keeps the target, never throws', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-manifest-symcore-'));
  const realCore = path.join(root, 'real-core');
  const linkCore = path.join(root, 'wd');
  fs.mkdirSync(path.join(realCore, 'state'), { recursive: true });
  fs.writeFileSync(path.join(realCore, 'state', 'digest.md'), '# d\n');
  fs.symlinkSync(realCore, linkCore);
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: linkCore });

  const { removed } = manifestLib.disposeCoreMechanics(paths, {});
  assert.ok(removed.includes(paths.state), 'mechanics swept through the symlink');
  assert.ok(removed.includes(linkCore), 'the core link itself reported removed');
  assert.equal(fs.lstatSync(realCore).isDirectory(), true, 'the real target dir remains');
  assert.deepEqual(fs.readdirSync(realCore), [], 'target dir was emptied of mechanics');
  assert.equal(fs.existsSync(linkCore), false, 'the symlink was unlinked, not rmdir-crashed');
});

test('disposeCoreMechanics dry-run changes nothing on disk', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), '# d\n');
  fs.mkdirSync(paths.secrets, { recursive: true });
  fs.writeFileSync(path.join(paths.secrets, 'google-token.json'), '{}\n');
  const { removed } = manifestLib.disposeCoreMechanics(paths, { dryRun: true });
  assert.ok(removed.includes(paths.state));
  assert.ok(removed.includes(paths.secrets));
  // Nothing actually deleted; core is non-empty so it is NOT reported removed.
  assert.ok(!removed.includes(paths.core));
  assert.equal(fs.existsSync(paths.state), true);
  assert.equal(fs.existsSync(paths.secrets), true);
  assert.equal(fs.existsSync(paths.core), true);
});
