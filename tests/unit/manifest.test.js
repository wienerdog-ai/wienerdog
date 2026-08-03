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
  // An OWNED, target-matched skill link (wienerdog-* directly under a harness
  // skills root) pointing at the manifest ledger. It reaches Table A row 5 —
  // OWNED (row 4) and readlink === target (row 3) — so the deferred-member guard
  // is the ONLY thing between it and fs.unlinkSync. (A <core>/ledger-link fixture
  // would be doubly vacuous under WP-153: preserved by row 2 as legacy AND by
  // row 4 for not being OWNED, so the guard could never be shown to matter.)
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-ledger');
  fs.symlinkSync(paths.manifest, link);
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: paths.manifest });
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

test('WP-145 closes the WP-088 residual: a stored scheduler-entry `unload` argv is NEVER spawned (ADR-0027)', () => {
  // The WP-088-era residual — reverse() executing the manifest-stored `unload`
  // argv — is CLOSED: the unregister command is re-derived from the file's
  // basename identity + platform, and this hybrid name ('wienerdog-dream.plist')
  // derives to nothing on every platform, so the chokepoint sees zero calls.
  // The unrecognized basename also fails the WP-145 scheduler-root bound, so
  // the file itself is preserved.
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
  let res;
  try {
    res = manifestLib.reverse(paths, reloaded, {});
  } finally {
    spawnMod.schedulerSpawn = origSpawn;
  }
  assert.equal(calls.length, 0, 'the stored unload argv never reaches the chokepoint');
  assert.equal(fs.existsSync(schedFile), true, 'unrecognized schedule name is preserved, not deleted');
  assert.ok(res.skipped.includes(schedFile));
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

// ── WP-091: reverse-side full-line anchoring + fail-closed (caught internally) ──

test('WP-091 reverse: an inline sentinel in prose is NOT a marker; a real full-line block round-trips byte-identically', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const md = path.join(paths.claudeDir, 'CLAUDE.md');
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const prose = 'See <!-- wienerdog:begin --> mentioned inline as an example.';
  // The pre-existing user file (what a byte-identical round-trip must restore).
  const original = `# notes\n${prose}\n\ntail\n`;
  // The forward step appends exactly '\n\n' + block + '\n' after trimming trailing newlines.
  const block = `${MB_BEGIN}\nbody\n${MB_END}`;
  const withBlock = `${original.replace(/\n+$/, '')}\n\n${block}\n`;
  fs.writeFileSync(md, withBlock);
  manifestLib.record(manifest, { kind: 'managed-block', path: md, createdFile: false });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);

  const { removed } = manifestLib.reverse(paths, reloaded, {});
  assert.ok(removed.includes(md));
  assert.equal(
    fs.readFileSync(md, 'utf8'),
    original,
    'reverse strips ONLY the real full-line block; the inline mention is preserved byte-identically'
  );
});

test('WP-091 reverse: an ambiguous managed-block entry is caught+skipped (WienerdogError, not ReferenceError) and uninstall CONTINUES', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  // A user-owned file with TWO full-line begin markers → ambiguous.
  const md = path.join(paths.claudeDir, 'CLAUDE.md');
  const ambiguous = `# notes\n\n${MB_BEGIN}\na\n${MB_END}\n\n${MB_BEGIN}\nb\n${MB_END}\n`;
  fs.writeFileSync(md, ambiguous);
  manifestLib.record(manifest, { kind: 'managed-block', path: md, createdFile: false });
  // Another removable entry recorded AFTER the block → reversed BEFORE it, so the
  // ambiguity throw must not abort the loop before OR after it either way.
  const extra = path.join(paths.core, 'notes.md');
  fs.writeFileSync(extra, '# x\n');
  manifestLib.record(manifest, { kind: 'file', path: extra });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);

  // Capture stderr to prove the CAUGHT WienerdogError message was reported. A
  // missing import would instead surface "WienerdogError is not defined" here.
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let result;
  try {
    assert.doesNotThrow(() => { result = manifestLib.reverse(paths, reloaded, {}); },
      'an ambiguous managed-block must NOT abort the whole uninstall');
  } finally {
    process.stderr.write = origWrite;
  }
  assert.match(err, /ambiguous wienerdog managed-block markers/, 'the caught WienerdogError message was written (not a ReferenceError)');
  assert.doesNotMatch(err, /is not defined/, 'no ReferenceError leaked — WienerdogError is imported');
  assert.ok(result.skipped.includes(md), 'the ambiguous file is skipped');
  assert.equal(fs.readFileSync(md, 'utf8'), ambiguous, 'the ambiguous file is left byte-identical (no user content swallowed)');
  assert.ok(result.removed.includes(extra), 'the OTHER removable entry is still reversed — the loop continued');
  assert.equal(fs.existsSync(extra), false, 'uninstall did not abort');
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

// ── WP-144 (audit A8): schema validation + per-entry isolation + root bound ──

test('WP-144 reverse: a hash-less file entry OUTSIDE every allowed root is preserved (taxes.pdf)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const taxes = path.join(paths.home, 'taxes.pdf');
  fs.writeFileSync(taxes, 'my taxes');
  manifestLib.record(manifest, { kind: 'file', path: taxes }); // poisoned: no hash, outside roots

  const res = manifestLib.reverse(paths, manifest);

  assert.equal(fs.readFileSync(taxes, 'utf8'), 'my taxes', 'the external file is untouched');
  assert.ok(res.skipped.includes(taxes), 'the poisoned entry is reported in skipped');
  assert.ok(!res.removed.includes(taxes));
});

test('WP-144 reverse: a ../ alias pointing outside the roots is preserved (realpath containment)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const evilReal = path.join(paths.home, 'evil.txt');
  fs.writeFileSync(evilReal, 'evil-but-precious');
  const alias = path.join(paths.claudeDir, '..', 'evil.txt'); // resolves to <home>/evil.txt

  manifestLib.record(manifest, { kind: 'file', path: alias });
  const res = manifestLib.reverse(paths, manifest);

  assert.equal(fs.readFileSync(evilReal, 'utf8'), 'evil-but-precious');
  assert.ok(res.skipped.includes(alias));
});

test('WP-144 reverse: a malformed settings.json no longer aborts the sweep — entry skipped, everything else reversed', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const settings = path.join(paths.claudeDir, 'settings.json');
  fs.writeFileSync(settings, '{ not json at all');
  const survivor = path.join(paths.core, 'bin-extra.txt');
  fs.mkdirSync(path.dirname(survivor), { recursive: true });
  fs.writeFileSync(survivor, 'x');
  // survivor is recorded BEFORE the settings entry, so the reverse-order loop
  // hits the THROWING settings entry FIRST and the survivor after it — its
  // removal proves the loop ran past the bad entry instead of aborting.
  manifestLib.record(manifest, { kind: 'file', path: survivor });
  manifestLib.record(manifest, { kind: 'settings-entry', path: settings, commands: ['x'] });

  let res;
  assert.doesNotThrow(() => {
    res = manifestLib.reverse(paths, manifest);
  });
  assert.ok(res.skipped.includes(settings), 'the malformed settings entry is skipped, not fatal');
  assert.equal(fs.existsSync(survivor), false, 'entries after the bad one still reverse');
  assert.equal(fs.readFileSync(settings, 'utf8'), '{ not json at all', 'the malformed file is left in place');
});

test('WP-144 reverse: invalid shapes (unknown kind, numeric path, wrong-typed fields) never reach a reverser', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const victim = path.join(paths.core, 'victim.txt');
  fs.writeFileSync(victim, 'x');
  manifest.entries.push({ kind: 'frobnicate', path: victim }); // unknown kind
  manifest.entries.push({ kind: 'file', path: 42 }); // non-string path
  manifest.entries.push({ kind: 'file' }); // missing path
  manifest.entries.push({ kind: 'file', path: victim, hash: 42 }); // wrong-typed hash
  manifest.entries.push({ kind: 'settings-entry', path: victim, commands: 'not-an-array' });
  manifest.entries.push(null); // not even an object

  let res;
  assert.doesNotThrow(() => {
    res = manifestLib.reverse(paths, manifest);
  });
  assert.equal(fs.existsSync(victim), true, 'no malformed entry deleted the target');
  // Every malformed entry lands in skipped ('?' for the unusable paths).
  assert.ok(res.skipped.filter((p) => p === '?').length >= 3, 'unusable paths reported as ?');
});

test('WP-144 validateEntry: shapes accepted and rejected per the schema table', () => {
  const ok = (e) => assert.equal(manifestLib.validateEntry(e).ok, true, JSON.stringify(e));
  const bad = (e) => assert.equal(manifestLib.validateEntry(e).ok, false, JSON.stringify(e));

  ok({ kind: 'file', path: '/a' });
  ok({ kind: 'file', path: '/a', hash: 'abc', extra: { ignored: true } });
  ok({ kind: 'settings-entry', path: '/a', createdFile: true, commands: ['a', 'b'] });
  ok({ kind: 'scheduler-entry', path: '/a', unload: 'deep validation is WP-145' });
  ok({ kind: 'vault-file', path: '/a' });

  bad({ kind: 'file', path: '' });
  bad({ kind: 'file', path: 42 });
  bad({ kind: 'file' });
  bad({ kind: 'file', path: '/a', hash: 42 });
  bad({ kind: 'managed-block', path: '/a', createdFile: 'yes' });
  bad({ kind: 'settings-entry', path: '/a', commands: [1, 2] });
  bad({ kind: 'no-such-kind', path: '/a' });
  bad(null);
  bad(['file']);
});

test('WP-144 reverse: the ~/.local/bin shim is removed, a planted neighbor is preserved (basename allowlist)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const localBin = path.join(paths.home, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const shim = path.join(localBin, 'wienerdog');
  const other = path.join(localBin, 'other-tool');
  fs.writeFileSync(shim, '#!/bin/sh\n');
  fs.writeFileSync(other, '#!/bin/sh\nprecious user tool\n');
  manifestLib.record(manifest, { kind: 'file', path: shim });
  manifestLib.record(manifest, { kind: 'file', path: other }); // poisoned neighbor

  const res = manifestLib.reverse(paths, manifest);

  assert.equal(fs.existsSync(shim), false, 'the wienerdog shim is removed (in-bounds basename)');
  assert.equal(fs.existsSync(other), true, 'the shared-dir neighbor is preserved');
  assert.ok(res.removed.includes(shim));
  assert.ok(res.skipped.includes(other));
});

test('WP-144 withinAllowedRoot: containment + shared-dir basename rule', () => {
  const paths = tempPaths();
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const localBin = path.join(paths.home, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const roots = [paths.core, paths.claudeDir, paths.codexDir, localBin];
  const touch = (p) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
    return p;
  };

  assert.equal(manifestLib.withinAllowedRoot(touch(path.join(paths.core, 'a.txt')), roots, localBin), true);
  assert.equal(manifestLib.withinAllowedRoot(touch(path.join(paths.claudeDir, 'skills', 's.md')), roots, localBin), true);
  assert.equal(manifestLib.withinAllowedRoot(touch(path.join(paths.home, 'outside.txt')), roots, localBin), false);
  assert.equal(manifestLib.withinAllowedRoot(touch(path.join(localBin, 'wienerdog')), roots, localBin), true);
  assert.equal(manifestLib.withinAllowedRoot(touch(path.join(localBin, 'wienerdog.cmd')), roots, localBin), true);
  assert.equal(manifestLib.withinAllowedRoot(touch(path.join(localBin, 'rm')), roots, localBin), false, 'shared-dir neighbor blocked');
});

// ── WP-145 (audit A8, ADR-0027): scheduler unload re-derivation + root bound ──

const generators = require('../../src/scheduler/generators');

test('WP-145 deriveUnloadArgv: per-platform derivation from basename identity only', () => {
  const d = generators.deriveUnloadArgv;
  if (typeof process.getuid === 'function') {
    assert.deepEqual(
      d('/Users/x/Library/LaunchAgents/ai.wienerdog.dream.plist', 'darwin'),
      ['launchctl', 'bootout', `gui/${process.getuid()}/ai.wienerdog.dream`]
    );
  }
  assert.deepEqual(
    d('/home/x/.config/systemd/user/wienerdog-daily-digest.timer', 'linux'),
    ['systemctl', '--user', 'disable', '--now', 'wienerdog-daily-digest.timer']
  );
  assert.equal(d('/home/x/.config/systemd/user/wienerdog-dream.service', 'linux'), null, '.service needs no unregister');
  assert.deepEqual(
    d('C:\\Users\\x\\.wienerdog\\schedules\\wienerdog-dream.xml', 'win32'),
    ['schtasks', '/delete', '/tn', '\\Wienerdog\\dream', '/f']
  );
  // Non-matching / poisoned basenames and foreign platforms derive nothing.
  assert.equal(d('/x/com.apple.something.plist', 'darwin'), null);
  assert.equal(d('/x/ai.wienerdog.evil name.plist', 'darwin'), null, 'a space breaks the anchored match');
  assert.equal(d('/x/ai.wienerdog.UPPER.plist', 'darwin'), null, 'stem charset is enforced');
  assert.equal(d('/x/wienerdog-dream.timer', 'darwin'), null, 'wrong platform for the suffix');
  assert.equal(d('/x/wienerdog-dream.xml', 'linux'), null);
  assert.equal(d('/x/ai.wienerdog.dream.plist', 'freebsd'), null, 'unknown platform derives nothing');
});

test('WP-145 reverse dry-run: the DERIVED unregister command is shown; the stored unload argv is ignored', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // Build the platform's real schedule file identity so derivation fires here.
  let schedDir;
  let base;
  let expected;
  if (process.platform === 'darwin') {
    schedDir = path.join(paths.home, 'Library', 'LaunchAgents');
    base = 'ai.wienerdog.dream.plist';
    expected = ['launchctl', 'bootout', `gui/${process.getuid()}/ai.wienerdog.dream`];
  } else if (process.platform === 'win32') {
    schedDir = path.join(paths.core, 'schedules');
    base = 'wienerdog-dream.xml';
    expected = ['schtasks', '/delete', '/tn', '\\Wienerdog\\dream', '/f'];
  } else {
    schedDir = path.join(paths.home, '.config', 'systemd', 'user');
    base = 'wienerdog-dream.timer';
    expected = ['systemctl', '--user', 'disable', '--now', 'wienerdog-dream.timer'];
  }
  fs.mkdirSync(schedDir, { recursive: true });
  const schedFile = path.join(schedDir, base);
  fs.writeFileSync(schedFile, 'x');
  manifestLib.record(manifest, {
    kind: 'scheduler-entry',
    path: schedFile,
    unload: ['/bin/sh', '-c', 'echo poisoned'], // must never appear anywhere
  });

  // systemdUserDir honors XDG_CONFIG_HOME; pin it to the temp home for the run.
  const savedXdg = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME;
  const savedHomeEnv = process.env.HOME;
  process.env.HOME = paths.home;
  const origWrite = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    manifestLib.reverse(paths, manifest, { dryRun: true });
  } finally {
    process.stdout.write = origWrite;
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
    process.env.HOME = savedHomeEnv;
  }
  assert.ok(out.includes(`would run: ${expected.join(' ')}`), out);
  assert.ok(!out.includes('/bin/sh'), 'the stored (poisoned) argv is never shown or run');
  assert.equal(fs.existsSync(schedFile), true, 'dry-run removes nothing');
});

test('WP-145 reverse: a foreign plist in a recognized scheduler root is preserved with no unregister', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const laDir = path.join(paths.home, 'Library', 'LaunchAgents');
  fs.mkdirSync(laDir, { recursive: true });
  const foreign = path.join(laDir, 'com.apple.something.plist');
  fs.writeFileSync(foreign, '<plist/>\n');
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: foreign });

  const spawnMod = require('../../src/scheduler/spawn');
  const origSpawn = spawnMod.schedulerSpawn;
  /** @type {string[][]} */ const calls = [];
  spawnMod.schedulerSpawn = (argv) => { calls.push(argv); return { status: 0 }; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifest);
  } finally {
    spawnMod.schedulerSpawn = origSpawn;
  }
  assert.equal(calls.length, 0, 'no unregister derived for a foreign basename');
  assert.equal(fs.existsSync(foreign), true, 'the foreign plist is preserved');
  assert.ok(res.skipped.includes(foreign));
});

test('WP-145/F33 reverse: a RECOGNIZED-basename scheduler-entry OUT of every root spawns NOTHING and is preserved (validate before spawn)', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  // A platform-correct, wienerdog-recognized basename (so deriveUnloadArgv WOULD
  // fire on this host), but placed OUTSIDE every scheduler root (directly in
  // HOME). The first-pass derived + spawned the unregister BEFORE the root gate;
  // post-F33 the containment check runs FIRST → zero spawn, file preserved.
  let base;
  if (process.platform === 'darwin') base = 'ai.wienerdog.evil.plist';
  else if (process.platform === 'win32') base = 'wienerdog-evil.xml';
  else base = 'wienerdog-evil.timer';
  const evil = path.join(paths.home, base);
  fs.writeFileSync(evil, 'x');
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: evil });

  const spawnMod = require('../../src/scheduler/spawn');
  const origSpawn = spawnMod.schedulerSpawn;
  /** @type {string[][]} */ const calls = [];
  spawnMod.schedulerSpawn = (argv) => { calls.push(argv); return { status: 0 }; };
  const savedXdg = process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_CONFIG_HOME;
  let res;
  try {
    res = manifestLib.reverse(paths, manifest);
  } finally {
    spawnMod.schedulerSpawn = origSpawn;
    if (savedXdg !== undefined) process.env.XDG_CONFIG_HOME = savedXdg;
  }
  assert.equal(calls.length, 0, 'no unregister spawns for an out-of-root recognized basename (F33)');
  assert.equal(fs.existsSync(evil), true, 'the out-of-root file is preserved');
  assert.ok(res.skipped.includes(evil));
});

test('WP-145 withinSchedulerRoot: containment AND wienerdog basename are both required', () => {
  const paths = tempPaths();
  const laDir = path.join(paths.home, 'Library', 'LaunchAgents');
  fs.mkdirSync(laDir, { recursive: true });
  const roots = [laDir];
  const touch = (p) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
    return p;
  };
  assert.equal(manifestLib.withinSchedulerRoot(touch(path.join(laDir, 'ai.wienerdog.dream.plist')), roots), true);
  assert.equal(manifestLib.withinSchedulerRoot(touch(path.join(laDir, 'wienerdog-dream.timer')), roots), true);
  assert.equal(manifestLib.withinSchedulerRoot(touch(path.join(laDir, 'com.apple.x.plist')), roots), false);
  assert.equal(
    manifestLib.withinSchedulerRoot(touch(path.join(paths.home, 'ai.wienerdog.dream.plist')), roots),
    false,
    'right name outside every scheduler root is still out-of-bounds'
  );
});

// ── WP-144 fix-pass (FIX-PLAN C6): F30 delete-time binding + F32 crash-retry ──

test('WP-144/F30 reverse: a file reached through a STATIC in-root dir symlink to an out-of-root tree is PRESERVED (bind to resolved path)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  // An out-of-root directory holding a precious user file.
  const outside = path.join(paths.home, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  const secret = path.join(outside, 'secret.txt');
  fs.writeFileSync(secret, 'SECRET');
  // A directory symlink INSIDE an allowed root that resolves OUT of root. The
  // recorded entry path traverses it. Static (created before reverse runs).
  const link = path.join(paths.claudeDir, 'link');
  fs.symlinkSync(outside, link);
  const entryPath = path.join(link, 'secret.txt'); // realpath → <home>/outside/secret.txt
  manifestLib.record(manifest, { kind: 'file', path: entryPath });

  const res = manifestLib.reverse(paths, manifest, {});

  // The op is bound to the realpath-RESOLVED target, which is out of root →
  // preserved. If the reverser deleted the lexical/resolved path without the
  // containment re-validation, secret.txt would be gone.
  assert.equal(fs.readFileSync(secret, 'utf8'), 'SECRET', 'the out-of-root file is untouched');
  assert.ok(res.skipped.includes(entryPath), 'the symlink-reached entry is reported skipped');
  assert.ok(!res.removed.includes(entryPath));
});

test('WP-144/F30 reverse: a managed-block entry whose recorded path is a symlink is REFUSED (O_NOFOLLOW), the pointed-at file is not rewritten', (t) => {
  if (!isPosix) return t.skip('symlink creation / O_NOFOLLOW needs POSIX');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  // A real IN-ROOT file that DOES carry our managed block (so a follow-through
  // read+write WOULD strip the block and rewrite it).
  const real = path.join(paths.claudeDir, 'real.md');
  const realContent = `# user notes\n\n${MB_BEGIN}\nbody\n${MB_END}\n`;
  fs.writeFileSync(real, realContent);
  // The recorded managed-block path is a SYMLINK to that in-root file. Containment
  // passes (parent + target resolve in-root); only O_NOFOLLOW stops the rewrite.
  const linkMd = path.join(paths.claudeDir, 'CLAUDE.md');
  fs.symlinkSync(real, linkMd);
  manifestLib.record(manifest, { kind: 'managed-block', path: linkMd, createdFile: false });

  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifest, {});
  } finally {
    process.stderr.write = origWrite;
  }

  assert.equal(fs.readFileSync(real, 'utf8'), realContent, 'the pointed-at file is NOT rewritten through the symlink');
  assert.equal(fs.lstatSync(linkMd).isSymbolicLink(), true, 'the symlink itself is untouched');
  assert.ok(res.skipped.includes(linkMd), 'the symlinked managed-block entry is skipped');
  assert.ok(!res.removed.includes(linkMd));
  assert.match(err, /refusing to follow/, 'the O_NOFOLLOW refusal is disclosed');
});

test('WP-144/F32 reverse: a second reverse of an already-removed in-bounds file emits NO false "outside every root" notice', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const extra = path.join(paths.core, 'notes.md');
  const content = '# notes\n';
  fs.writeFileSync(extra, content);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  manifestLib.record(manifest, { kind: 'file', path: extra, hash });
  manifestLib.save(paths, manifest);
  const reloaded = manifestLib.load(paths);

  // First reverse removes the in-bounds file (and the empty tracked dirs).
  const first = manifestLib.reverse(paths, reloaded, {});
  assert.ok(first.removed.includes(extra));
  assert.equal(fs.existsSync(extra), false);

  // Second (idempotent) reverse: the target is already gone. It must be skipped
  // SILENTLY as already-removed — not slandered as "outside every root".
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let second;
  try {
    second = manifestLib.reverse(paths, reloaded, {});
  } finally {
    process.stderr.write = origWrite;
  }
  assert.doesNotMatch(err, /outside every Wienerdog-owned root/, 'no false out-of-root notice on the retry');
  assert.doesNotMatch(err, /could not reverse/, 'an already-removed entry is skipped SILENTLY, not as a scary error');
  assert.ok(second.skipped.includes(extra), 'the already-removed file is reported skipped');
});

// ── WP-147: managed-block separator round-trip fidelity (audit A13) ──────────

const WP147_BLOCK = `${MB_BEGIN}\nbody\n${MB_END}`;

/** Reverse a single crafted managed-block entry over `content`, capturing
 *  stderr. Returns the file's final content (null when deleted), the reverse()
 *  result, the captured stderr, and the md path.
 *  @param {string} content @param {object} [extra] extra entry fields
 *  @returns {{final: string|null, res: object, err: string, md: string}} */
function reverseBlockCase(content, extra = {}) {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const md = path.join(paths.claudeDir, 'CLAUDE.md');
  fs.writeFileSync(md, content);
  manifestLib.record(manifest, { kind: 'managed-block', path: md, createdFile: false, ...extra });
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifest, {});
  } finally {
    process.stderr.write = origWrite;
  }
  return { final: fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : null, res, err, md };
}

test('WP-147 Table N: the safe predicate over every reachable case (recorded metadata)', () => {
  const rows = [
    // [label, content, sepBefore, want]
    ['row 1: genuine append onto "foo\\n"', `foo\n\n${WP147_BLOCK}\n`, '\n', 'foo\n'],
    ['row 2: genuine append onto "foo" — we supplied the terminator', `foo\n\n${WP147_BLOCK}\n`, '\n\n', 'foo'],
    ['row 3: relocated to EOF, original "foo\\n"', `foo\n${WP147_BLOCK}\n`, '\n', 'foo\n'],
    ['row 4: relocated between two user lines — no fusion', `lineA\n${WP147_BLOCK}\nlineB\n`, '\n', 'lineA\nlineB\n'],
    ['row 5: empty original', `\n\n${WP147_BLOCK}\n`, '\n\n', ''],
    // Rows 6-7: sepBefore='\n\n' relocated (the ownership re-check + anti-fusion pair).
    ['row 6: relocated between lines, sepBefore=\\n\\n — user blank line survives', `lineA\n\n\n${WP147_BLOCK}\nlineB\n`, '\n\n', 'lineA\n\n\nlineB\n'],
    ['row 7: fusion probe, sepBefore=\\n\\n — no fusion', `lineA\n\n${WP147_BLOCK}\nlineB\n`, '\n\n', 'lineA\n\nlineB\n'],
    // Row 8: the DECLARED RESIDUAL (gate round 10). A sepBefore='\n' cross-paragraph
    // relocation collapses one blank line — this is EQUAL TO shipped base b3a53bc
    // (base strips one newline unconditionally too), not fusion, and out of this
    // WP's remit. Pinned so the permutation resolves against a committed assertion;
    // full closure is routed to WP-managed-block-insertion-anchor.
    ['row 8: cross-paragraph relocation, sepBefore=\\n — =base residual', `paraA\n\n${WP147_BLOCK}\nparaB\n`, '\n', 'paraA\nparaB\n'],
  ];
  for (const [label, content, sepBefore, want] of rows) {
    const { final } = reverseBlockCase(content, { sepBefore, sepAfter: '\n' });
    assert.equal(final, want, label);
  }
});

test('WP-147 T6: the at-EOF discrimination pair (Table N rows 3 vs 2) — the gate consults sepBefore', () => {
  // Both rows reach after === ''; they differ ONLY in sepBefore. Row 3 alone is
  // satisfied by deleting the at-EOF disjunct, row 2 alone by leaving it
  // ungated — only the gated form passes both.
  const row3 = reverseBlockCase(`foo\n${WP147_BLOCK}\n`, { sepBefore: '\n', sepAfter: '\n' });
  assert.equal(row3.final, 'foo\n', "row 3: the trailing newline is the USER's — it survives");
  const row2 = reverseBlockCase(`foo\n\n${WP147_BLOCK}\n`, { sepBefore: '\n\n', sepAfter: '\n' });
  assert.equal(row2.final, 'foo', 'row 2: WE supplied the terminator — it is removed');
});

test('WP-147 legacy entry (no sep metadata): a genuine append still restores; a relocated block no longer fuses', () => {
  // The old lossy forward step always left "...\n\n<BLOCK>\n" for an append.
  assert.equal(reverseBlockCase(`foo\n\n${WP147_BLOCK}\n`, {}).final, 'foo\n', 'legacy genuine append restores');
  // Relocated between two single-newline user lines: the safe guard withholds
  // the strip — the A13 fusion is gone even without metadata.
  assert.equal(reverseBlockCase(`lineA\n${WP147_BLOCK}\nlineB\n`, {}).final, 'lineA\nlineB\n', 'legacy relocated block does not fuse');
  // Relocated to EOF: the legacy default '\n' means weSuppliedTerminator is
  // false — the user's trailing newline survives.
  assert.equal(reverseBlockCase(`foo\n${WP147_BLOCK}\n`, {}).final, 'foo\n', 'legacy relocated-to-EOF keeps the user newline');
});

test('WP-147 T7 (Table M): forged out-of-vocabulary separator metadata cannot delete user text', () => {
  const content = `lineA\n${WP147_BLOCK}\nlineB\n`;
  const cases = [
    { label: 'forged sepAfter', extra: { sepBefore: '\n', sepAfter: '\nlineB\n' } },
    { label: 'forged sepBefore', extra: { sepBefore: 'lineA\n', sepAfter: '\n' } },
    { label: 'forged both', extra: { sepBefore: 'lineA\n', sepAfter: '\nlineB\n' } },
  ];
  for (const { label, extra } of cases) {
    const { final, res, err, md } = reverseBlockCase(content, extra);
    assert.equal(final, 'lineA\nlineB\n', `${label}: every byte of user text survives`);
    assert.ok(res.removed.includes(md), `${label}: the block is still removed`);
    assert.match(err, /ignoring out-of-vocabulary separator metadata/, `${label}: the stderr notice fires`);
  }
});

// WP-managed-block-insertion-anchor (Table F): the bound TIGHTENED. The forged
// '\n\n' makes `candidate` = 'foo', which no longer hashes to the recorded
// anchor of 'foo\n' — the strip is withheld, so the forgery now loses ZERO user
// bytes (it used to lose exactly the trailing newline; our blank line is left
// behind instead).
test('WP-147 T9 (Table M bound): an in-vocabulary at-EOF forgery loses exactly one newline, never text', () => {
  const { applyManagedBlock } = require('../../src/adapters/shared');
  /** Honest install of "foo\n"; optionally hand-edit the manifest entry to the
   *  in-vocabulary '\n\n' (NO on-disk content change), then uninstall.
   *  @param {boolean} forge @returns {string} */
  const run = (forge) => {
    const paths = tempPaths();
    const manifest = makeInstall(paths);
    fs.mkdirSync(paths.claudeDir, { recursive: true });
    const md = path.join(paths.claudeDir, 'CLAUDE.md');
    fs.writeFileSync(md, 'foo\n');
    applyManagedBlock(md, 'body', false, manifest, { changed: [], unchanged: [], notices: [] });
    const entry = manifest.entries.find((e) => e.kind === 'managed-block' && e.path === md);
    assert.equal(entry.sepBefore, '\n', "the honest sync recorded sepBefore '\\n'");
    if (forge) entry.sepBefore = '\n\n';
    manifestLib.reverse(paths, manifest, {});
    return fs.readFileSync(md, 'utf8');
  };
  const control = run(false);
  const forged = run(true);
  assert.equal(control, 'foo\n', 'honest control restores byte-perfectly');
  assert.equal(forged, 'foo\n\n', 'forged entry now loses NOTHING — the anchor refuses the forged separator claim and our blank line is left instead');
  assert.equal(
    control.replace(/\n/g, ''),
    forged.replace(/\n/g, ''),
    'the text is byte-identical with newlines removed — the loss never widens past whitespace'
  );
});

test('WP-147 T11 (AC13): honest relocation — ownership re-check, anti-fusion, and the declared \'\\n\' residual, three rows', () => {
  const { applyManagedBlock } = require('../../src/adapters/shared');
  // Honest setup: sync an original so the forward step records the separator by
  // itself (unterminated → '\n\n'; newline-terminated → '\n'), then move the block
  // by writing the file directly. NO manifest hand-editing — that would be a
  // forgery test (T9's job) and would not exercise the honest path these rows need.
  const run = (original, expectedSep, template) => {
    const paths = tempPaths();
    const manifest = makeInstall(paths);
    fs.mkdirSync(paths.claudeDir, { recursive: true });
    const md = path.join(paths.claudeDir, 'CLAUDE.md');
    fs.writeFileSync(md, original);
    applyManagedBlock(md, 'body', false, manifest, { changed: [], unchanged: [], notices: [] });
    const entry = manifest.entries.find((e) => e.kind === 'managed-block' && e.path === md);
    assert.equal(entry.sepBefore, expectedSep, `honest append records sepBefore ${JSON.stringify(expectedSep)}`);
    const written = fs.readFileSync(md, 'utf8');
    const block = written.slice(written.indexOf(MB_BEGIN), written.indexOf(MB_END) + MB_END.length);
    fs.writeFileSync(md, template.split('<BLOCK>').join(block));
    manifestLib.reverse(paths, manifest, {});
    return fs.readFileSync(md, 'utf8');
  };
  // (a) ownership re-check: candidate="lineA\n" ends in a newline → block is NOT
  // at its recorded append position → strip nothing on the leading side (row 6).
  assert.equal(run('orig', '\n\n', 'lineA\n\n\n<BLOCK>\nlineB\n'), 'lineA\n\n\nlineB\n', '(a) the user blank line survives — no paragraph merge');
  // (b) anti-fusion still governs: candidate="lineA" passes the re-check, only
  // noFusion prevents lineAlineB\n (row 7).
  assert.equal(run('orig', '\n\n', 'lineA\n\n<BLOCK>\nlineB\n'), 'lineA\n\nlineB\n', '(b) no fusion');
  // (c) the DECLARED RESIDUAL (Table N row 8), NOT red-first: a sepBefore='\n'
  // cross-paragraph relocation collapses one blank line — EQUAL to shipped base
  // b3a53bc, out of this WP's remit. This pins CURRENT behaviour, not a fix; a
  // '\n' relocation cannot establish ownership without the insertion anchor
  // (routed to WP-managed-block-insertion-anchor). If it ever goes red, either
  // the code regressed below base or that anchor WP landed — both worth a failure.
  assert.equal(run('paraA\n', '\n', 'paraA\n\n<BLOCK>\nparaB\n'), 'paraA\nparaB\n', '(c) =base residual: one blank line collapses (not fusion, not a regression)');
});

test('WP-147 T12 (AC14): non-string separator metadata still strips the block, not rejected upstream', () => {
  // A non-string sepBefore/sepAfter must NOT be type-gated by ENTRY_FIELD_TYPES —
  // it has to reach reverseManagedBlock so the SEP_BEFORE_OK allowlist degrades to
  // the legacy conservative strip and still removes the block (Table M).
  const content = `lineA\n${WP147_BLOCK}\nlineB\n`;
  const cases = [
    { label: 'null sepBefore', extra: { sepBefore: null, sepAfter: '\n' } },
    { label: 'number sepBefore', extra: { sepBefore: 5, sepAfter: '\n' } },
    { label: 'boolean sepBefore', extra: { sepBefore: true, sepAfter: '\n' } },
    { label: 'array sepBefore', extra: { sepBefore: ['\n'], sepAfter: '\n' } },
    { label: 'null sepAfter', extra: { sepBefore: '\n', sepAfter: null } },
    { label: 'number sepAfter', extra: { sepBefore: '\n', sepAfter: 3 } },
    { label: 'array both', extra: { sepBefore: [], sepAfter: [] } },
  ];
  for (const { label, extra } of cases) {
    const { final, res, err, md } = reverseBlockCase(content, extra);
    assert.equal(final, 'lineA\nlineB\n', `${label}: legacy conservative strip, no user text touched`);
    assert.ok(res.removed.includes(md), `${label}: block still removed (entry NOT rejected upstream)`);
    assert.match(err, /ignoring out-of-vocabulary separator metadata/, `${label}: the stderr notice fires`);
  }
});

// ── WP-managed-block-insertion-anchor: forward-time position evidence ─────────
// A-T1 … A-T11 (A-T5 is the edit to WP-147 T9 above, per Table F). Every fixture
// is set up HONESTLY through applyManagedBlock (WP-147 T11's harness shape) so
// the recorded separator + anchor are whatever the forward step actually wrote;
// manifest hand-editing appears only in the forgery rows (A-T4).

const { applyManagedBlock: anchorApplyMB } = require('../../src/adapters/shared');
const { insertionAnchor } = manifestLib;

/** Honest-setup harness (WP-147 T11's `run` shape): sync `original` through
 *  applyManagedBlock, assert the recorded sepBefore, then rewrite the file from
 *  `template` with <BLOCK> substituted (`null` = leave the honest write as is),
 *  optionally mutate the manifest entry (forgery rows only), and uninstall.
 *  @param {string} original @param {string} expectedSep
 *  @param {string|null} template @param {(e: object) => void} [mutate]
 *  @returns {{final: string|null, pre: string, block: string, entry: object,
 *             res: object, err: string, md: string}} */
function anchorRun(original, expectedSep, template, mutate) {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const md = path.join(paths.claudeDir, 'CLAUDE.md');
  fs.writeFileSync(md, original);
  anchorApplyMB(md, 'body', false, manifest, { changed: [], unchanged: [], notices: [] });
  const entry = manifest.entries.find((e) => e.kind === 'managed-block' && e.path === md);
  assert.equal(entry.sepBefore, expectedSep, `honest sync records sepBefore ${JSON.stringify(expectedSep)}`);
  const written = fs.readFileSync(md, 'utf8');
  const block = written.slice(written.indexOf(MB_BEGIN), written.indexOf(MB_END) + MB_END.length);
  const pre = template === null ? written : template.split('<BLOCK>').join(block);
  if (template !== null) fs.writeFileSync(md, pre);
  if (mutate) mutate(entry);
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifest, {});
  } finally {
    process.stderr.write = origWrite;
  }
  return { final: fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : null, pre, block, entry, res, err, md };
}

test('WP-managed-block-insertion-anchor A-T1 (Q1): the routed residual is closed — a moved block restores the user blank line byte-perfectly', () => {
  const { final, entry } = anchorRun('paraA\n\nparaB\n', '\n', 'paraA\n\n<BLOCK>\nparaB\n');
  assert.equal(typeof entry.anchorBefore, 'string', 'the honest sync recorded an anchor — this row must not pass by the legacy arm');
  assert.equal(final, 'paraA\n\nparaB\n', 'byte-perfect: the user blank line survives the relocation (base eats it)');
});

test('WP-managed-block-insertion-anchor A-T2 (Q3+Q4): the ordinary path and a distant edit restore byte-perfectly; the forward step is idempotent (AC11)', () => {
  // (a) ordinary in-place uninstall, with the AC11 idempotency check: sync TWICE.
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  const md = path.join(paths.claudeDir, 'CLAUDE.md');
  fs.writeFileSync(md, 'foo\n');
  anchorApplyMB(md, 'body', false, manifest, { changed: [], unchanged: [], notices: [] });
  const find = () => manifest.entries.find((e) => e.kind === 'managed-block' && e.path === md);
  const snapshot = JSON.parse(JSON.stringify(find()));
  const bytes = fs.readFileSync(md, 'utf8');
  const out2 = { changed: [], unchanged: [], notices: [] };
  anchorApplyMB(md, 'body', false, manifest, out2);
  assert.deepEqual(find(), snapshot, 'second sync leaves the manifest entry deep-equal (AC11)');
  assert.equal(fs.readFileSync(md, 'utf8'), bytes, 'second sync leaves the file bytes unchanged (AC11)');
  assert.deepEqual(out2.unchanged, [md], 'second sync reports the file unchanged');
  manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.readFileSync(md, 'utf8'), 'foo\n', '(a) in-place uninstall restores byte-perfectly');
  // (b) a distant edit — first line changed, 400 filler chars between it and the
  // block. Red against a full-prefix or prefix-length anchor: this is the row
  // that justifies ANCHOR_WINDOW being bounded.
  const filler = 'f'.repeat(400);
  const edited = `HEAD-EDITED\n${filler}\ntail-para\n`;
  const { final } = anchorRun(`head\n${filler}\ntail-para\n`, '\n', `${edited}\n<BLOCK>\n`);
  assert.equal(final, edited, '(b) an edit far above the block does not withhold the strip');
});

test('WP-managed-block-insertion-anchor A-T3 (Q5, R2): an in-window edit withholds the strip — the declared cost, BOTH producer-valid separators', () => {
  // (a) newline-terminated original ⇒ sepBefore '\n' ⇒ one-character surplus.
  const a = anchorRun('paraA\n', '\n', 'paraA-EDITED\n\n<BLOCK>\n');
  const aBase = 'paraA-EDITED\n'; // what shipped base produces on this fixture
  assert.equal(a.final, 'paraA-EDITED\n\n', '(a) our separator is left — the strip is withheld');
  assert.equal(a.final.length - aBase.length, a.entry.sepBefore.length, '(a) the surplus against base equals sepBefore.length');
  assert.equal(a.final.replace(/\n/g, ''), aBase.replace(/\n/g, ''), '(a) no user byte is lost');
  // (b) unterminated original ⇒ sepBefore '\n\n' ⇒ TWO-character surplus.
  const b = anchorRun('paraA', '\n\n', 'paraA-EDITED\n\n<BLOCK>\n');
  const bBase = 'paraA-EDITED';
  assert.equal(b.final, 'paraA-EDITED\n\n', '(b) our two-byte separator is left — the strip is withheld');
  assert.equal(b.final.length - bBase.length, b.entry.sepBefore.length, '(b) the surplus against base equals sepBefore.length (2)');
  assert.equal(b.final.replace(/\n/g, ''), bBase.replace(/\n/g, ''), '(b) no user byte is lost');
});

test('WP-managed-block-insertion-anchor A-T4 (Q7/Q8): a deleted or non-string anchor degrades to EXACTLY base behaviour — narrowing only', () => {
  const cases = [
    ['deleted anchor', (e) => { delete e.anchorBefore; }],
    ['non-string anchor', (e) => { e.anchorBefore = 42; }],
  ];
  for (const [label, mutate] of cases) {
    const { final, res, err, md } = anchorRun('paraA\n\nparaB\n', '\n', 'paraA\n\n<BLOCK>\nparaB\n', mutate);
    assert.equal(final, 'paraA\nparaB\n', `${label}: exactly shipped 0.12.0 behaviour, no more and no less`);
    assert.ok(res.removed.includes(md), `${label}: the block is still removed — uninstall is not made incomplete`);
    assert.doesNotMatch(err, /ignoring out-of-vocabulary separator metadata/, `${label}: the separator notice belongs to sepBefore/sepAfter, not the anchor`);
  }
});

test('WP-managed-block-insertion-anchor A-T6 (Q10): the duplicate-window move — uniqueness, not the hash alone, proves position', () => {
  const W = 'w'.repeat(251) + '\nEND\n';
  assert.equal(W.length, 256, 'the fixture sits exactly on the window boundary');
  const original = `${W}\nTAIL\n${W}`;
  const { final } = anchorRun(original, '\n', `${W}\n<BLOCK>\nTAIL\n${W}`);
  assert.equal(final, original, 'byte-perfect: the ambiguous window withholds the strip at the wrong position');
  const count = (s) => s.split(W).length - 1;
  assert.ok(count(final) >= count(original), 'no W occurrence was consumed — the withhold never became a strip');
});

test('WP-managed-block-insertion-anchor A-T7 (Q12): boundary sweep at candidate.length 255/256/257 — nothing special happens at the window edge', () => {
  for (const len of [255, 256, 257]) {
    const P = 'x'.repeat(len - 1) + '\n';
    assert.equal(P.length, len);
    // ordinary in-place uninstall
    const inPlace = anchorRun(P, '\n', null);
    assert.equal(inPlace.final, P, `in-place restores byte-perfectly at candidate.length ${len}`);
    // honest relocation (Q1 shape scaled to the boundary)
    const original = `${P}\nparaB\n`;
    const moved = anchorRun(original, '\n', `${P}\n<BLOCK>\nparaB\n`);
    assert.equal(moved.final, original, `relocation preserves byte-perfectly at candidate.length ${len}`);
  }
});

test('WP-managed-block-insertion-anchor A-T8 (Table B :179/:197): the createdFile branch anchors the empty prefix; replace preserves; uninstall deletes', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const md = path.join(paths.claudeDir, 'CLAUDE.md'); // ABSENT — the createdFile branch
  anchorApplyMB(md, 'body', false, manifest, { changed: [], unchanged: [], notices: [] });
  const find = () => manifest.entries.find((e) => e.kind === 'managed-block' && e.path === md);
  const entry = find();
  assert.equal(entry.createdFile, true);
  assert.equal(entry.sepBefore, '');
  assert.equal(entry.sepAfter, '\n');
  assert.equal(entry.anchorBefore, insertionAnchor(''), 'the empty prefix is anchored via insertionAnchor(\'\'), not null');
  const snapshot = JSON.parse(JSON.stringify(entry));
  const bytes = fs.readFileSync(md, 'utf8');
  // Second sync runs the REPLACE branch (:197): inserted=false must preserve all
  // three recorded fields (rule P-3) and change nothing on disk (AC11).
  anchorApplyMB(md, 'body', false, manifest, { changed: [], unchanged: [], notices: [] });
  assert.deepEqual(find(), snapshot, 'the replace branch preserves the whole entry — sepBefore/sepAfter/anchorBefore untouched');
  assert.equal(fs.readFileSync(md, 'utf8'), bytes, 'second sync leaves the file bytes unchanged (AC11)');
  manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(md), false, 'uninstall deletes the file we created');
});

test('WP-managed-block-insertion-anchor A-T9 (Q14/Q15, R2c): a reproduced window strips exactly sepBefore — EQUAL to base, both arms', () => {
  // (a) 256-char newline-terminated window ⇒ sepBefore '\n' ⇒ one character.
  const Wa = 'w'.repeat(251) + '\nEND\n';
  assert.equal(Wa.length, 256);
  const a = anchorRun(`PPPP\n${Wa}`, '\n', `QQ\n${Wa}\n<BLOCK>\n`);
  assert.equal(a.final, `QQ\n${Wa}`, '(a) the strip proceeds at the reproduced, unique window');
  const aNoBlock = a.pre.replace(a.block + '\n', ''); // block + sepAfter excised, leading separator RETAINED
  assert.equal(aNoBlock.length - a.final.length, a.entry.sepBefore.length, '(a) exactly sepBefore.length characters removed');
  assert.equal(aNoBlock.replace(/\s/g, ''), a.final.replace(/\s/g, ''), '(a) the removed characters are whitespace');
  // (b) 256-char UNTERMINATED window ⇒ sepBefore '\n\n' ⇒ two characters, block at EOF.
  const Wb = 'w'.repeat(253) + 'END';
  assert.equal(Wb.length, 256);
  const b = anchorRun(`PPPP\n${Wb}`, '\n\n', `QQ\n${Wb}\n\n<BLOCK>\n`);
  assert.equal(b.final, `QQ\n${Wb}`, '(b) both separator bytes stripped — equal to base, the two-character arm');
  const bNoBlock = b.pre.replace(b.block + '\n', '');
  assert.equal(bNoBlock.length - b.final.length, b.entry.sepBefore.length, '(b) exactly sepBefore.length (2) characters removed');
  assert.equal(bNoBlock.replace(/\s/g, ''), b.final.replace(/\s/g, ''), '(b) the removed characters are whitespace');
});

test('WP-managed-block-insertion-anchor A-T10 (Q13): the ordinary-path corpus sweep — newline-only, repeated-line, CRLF and empty content all round-trip', () => {
  for (const original of ['\n', '\n\n\n', 'a\na\na\n', 'x\r\ny\r\n', 'foo\n', '']) {
    const expectedSep = original.endsWith('\n') ? '\n' : '\n\n';
    const { final } = anchorRun(original, expectedSep, null);
    assert.equal(final, original, `${JSON.stringify(original)} restores byte-perfectly`);
  }
  // Ambiguous sentinels: the entry is skipped with the shipped notice and the file
  // is untouched — the anchor never runs on a file locateManagedBlock refuses.
  const amb = anchorRun('foo\n', '\n', 'foo\n\n<BLOCK>\n<BLOCK>\n');
  assert.match(amb.err, /ambiguous wienerdog managed-block markers/, 'the shipped ambiguity notice fires');
  assert.ok(amb.res.skipped.includes(amb.md), 'the ambiguous entry is skipped');
  assert.equal(amb.final, amb.pre, 'the ambiguous file is left byte-untouched');
});

test('WP-managed-block-insertion-anchor A-T11 (Q16, R2b): a repeated short window after the block withholds — the cost, pinned with controls', () => {
  // [original, appended-after-block, expectedSep, base result]
  const costing = [
    ['A\n', 'A\n', '\n', 'A\nA\n'],
    ['hi\n', 'hi\n', '\n', 'hi\nhi\n'],
    ['# Notes\n', '# Notes\n', '\n', '# Notes\n# Notes\n'],
    ['A', '\nA', '\n\n', 'A\nA'], // the unterminated, two-byte arm
  ];
  for (const [original, appended, expectedSep, base] of costing) {
    const { final, entry } = anchorRun(original, expectedSep, `${original}${expectedSep}<BLOCK>\n${appended}`);
    assert.equal(final, `${original}${expectedSep}${appended}`, `${JSON.stringify(original)}+${JSON.stringify(appended)}: the surplus is the recorded separator`);
    assert.equal(final.length - base.length, entry.sepBefore.length, `${JSON.stringify(original)}: the surplus equals sepBefore.length`);
    assert.equal(final.replace(/\n/g, ''), base.replace(/\n/g, ''), `${JSON.stringify(original)}: no user byte moves`);
  }
  // Controls: a NON-repeating append costs nothing — the withhold is caused by
  // the repetition, not by the append.
  const c1 = anchorRun('A\n', '\n', 'A\n\n<BLOCK>\nB\n');
  assert.equal(c1.final, 'A\nB\n', 'control (\\n arm): base exactly — zero cost');
  const c2 = anchorRun('A', '\n\n', 'A\n\n<BLOCK>\n\nB');
  assert.equal(c2.final, 'A\nB', 'control (\\n\\n arm): base exactly — zero cost');
});

// ── WP-153: target-aware symlink reverser (audit A13 follow-up) ───────────────
// reverseSymlink now unlinks ONLY a link it can prove Wienerdog owns (Table A):
// row 2 legacy (target-less) → preserve; row 3 target mismatch → preserve;
// row 4 not-OWNED (wienerdog-* directly under a harness skills root) → preserve;
// row 5 OWNED + resolves to the recorded source → unlink. OWNED fixtures live at
// `<claudeDir>/skills/wienerdog-<name>` (a harness skills root); their symlink
// destinations sit inside `claudeDir` so reverse()'s withinAllowedRoot gate
// (which realpaths — i.e. follows — the link) passes and the red baseline is
// obtainable.

test('reverseSymlink: a user replacement link (target mismatch) survives uninstall — Table A row 3 (T1)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const recordedSource = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(recordedSource, { recursive: true });
  // The user replaced our link with their own wienerdog-foo symlink to their dir.
  const userDir = path.join(paths.claudeDir, 'my-notes');
  fs.mkdirSync(userDir, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(userDir, link);
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: recordedSource });
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifestLib.load(paths), {});
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the user's replacement link is not unlinked");
  assert.equal(fs.readlinkSync(link), userDir, "the user's link target is unchanged");
  assert.ok(!removed.includes(link));
  assert.ok(skipped.includes(link));
});

test('reverseSymlink: our own unmodified link is removed, in real and dry-run mode — Table A row 5 (T2)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills'); // OWNED location — required
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: source });
  manifestLib.save(paths, manifest);
  // dry-run first: reports it as removed but leaves it on disk.
  const dry = manifestLib.reverse(paths, manifestLib.load(paths), { dryRun: true });
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'dry-run does not unlink');
  assert.ok(dry.removed.includes(link), 'dry-run still reports it in removed');
  // real: unlinks it.
  const real = manifestLib.reverse(paths, manifestLib.load(paths), {});
  assert.equal(fs.existsSync(link), false, 'our own link is removed');
  assert.ok(real.removed.includes(link));
});

test('reverseSymlink: a legacy (target-less) entry is preserved whatever it points at — Table A row 2 (T3)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-a');
  const other = path.join(paths.claudeDir, 'elsewhere');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  // Sub-case A: legacy entry, link points at what would be its source.
  const linkA = path.join(skillsRoot, 'wienerdog-a');
  fs.symlinkSync(source, linkA);
  manifestLib.record(manifest, { kind: 'symlink', path: linkA }); // NO target — legacy
  // Sub-case B: legacy entry, link points elsewhere.
  const linkB = path.join(skillsRoot, 'wienerdog-b');
  fs.symlinkSync(other, linkB);
  manifestLib.record(manifest, { kind: 'symlink', path: linkB }); // NO target — legacy
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifestLib.load(paths), {});
  for (const link of [linkA, linkB]) {
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'a legacy link is never unlinked');
    assert.ok(!removed.includes(link));
    assert.ok(skipped.includes(link));
  }
});

test('reverseSymlink: a dangling own link is PRESERVED — direct call (T4a)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // Row 3 is one test, sameResolvedDir, and it is fail-closed: a dangling link cannot
  // prove it resolves to the recorded source, so it is preserved. WP-153 shipped a
  // second, link-text sub-test that unlinked exactly this case;
  // WP-symlink-lexical-fallback-removal dropped it, narrowing delete authority.
  // This case is UNREACHABLE through reverse() (see T4b), so the narrowing is only
  // observable here, at the exported-helper boundary.
  const paths = tempPaths();
  const skillsRoot = path.join(paths.claudeDir, 'skills'); // OWNED location — required
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  fs.rmSync(source, { recursive: true, force: true }); // core deleted by hand → link dangles
  const removed = [];
  const skipped = [];
  const removedSet = new Set();
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  try {
    manifestLib.reverseSymlink(
      { kind: 'symlink', path: link, target: source },
      false,
      removed,
      skipped,
      removedSet,
      [skillsRoot]
    );
  } finally {
    process.stderr.write = origWrite;
  }
  // lstat, NOT existsSync: existsSync FOLLOWS the link and is false for a link that
  // is still on disk but dangling, so an existsSync assertion here is vacuous.
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the dangling own link is preserved');
  assert.ok(!removed.includes(link));
  assert.ok(skipped.includes(link));
  assert.match(err, /not the Wienerdog skill link we recorded/);
});

test('reverseSymlink: a DANGLING own link never reaches the reverser through reverse() (T4b)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // Scoped claim: the DANGLING case, and only that case, is unreachable through
  // reverse(). Its symlink arm passes the link path to withinAllowedRoot, whose
  // contains() realpaths it — which FOLLOWS the link and throws on a dangling one —
  // so the entry is preserved at that upstream gate and reverseSymlink never runs.
  // CHARACTERIZATION test: green both before and after
  // WP-symlink-lexical-fallback-removal. The asserted notice is the upstream gate's,
  // not row 3's, which is what proves reverseSymlink was never entered.
  // This does NOT say the dropped sub-test was unreachable in general — T4c is a
  // reachable case that DID change behavior.
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-bar');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-bar');
  fs.symlinkSync(source, link);
  fs.rmSync(source, { recursive: true, force: true });
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: source });
  manifestLib.save(paths, manifest);
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifestLib.load(paths), {});
  } finally {
    process.stderr.write = origWrite;
  }
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'reverse() preserves the dangling own link');
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(
    err,
    /outside every Wienerdog-owned root/,
    'preserved by the upstream withinAllowedRoot gate — reverseSymlink never ran'
  );
});

test('reverseSymlink: a relative-target entry is PRESERVED through reverse(), not unlinked (T4c)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  // THE BEHAVIOR CHANGE, red-first, through reverse(). `L` is OWNED and NOT dangling:
  // its link text is RELATIVE and resolves fine, and the entry's `target` is that same
  // relative text. withinAllowedRoot follows L to an in-bounds destination and passes,
  // so reverseSymlink DOES run. Before WP-symlink-lexical-fallback-removal the
  // link-text sub-test matched the raw string and row 5 UNLINKED it. sameResolvedDir
  // alone refuses, because realpath() resolves a relative T against process.cwd(),
  // not against the link's directory.
  // Preserving it is INTENDED: Wienerdog never records a relative target (shared.js
  // joins an absolute core path), so such an entry is hand-edited or forged input,
  // and the manifest is untrusted — a recorded field may narrow deletion, never
  // authorize one the semantic proof refuses.
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills'); // OWNED location — required
  fs.mkdirSync(skillsRoot, { recursive: true });
  const dest = path.join(paths.claudeDir, 'core-skills', 'wienerdog-rel');
  fs.mkdirSync(dest, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-rel');
  const relText = path.join('..', 'core-skills', 'wienerdog-rel');
  fs.symlinkSync(relText, link); // RELATIVE link text that resolves — not the dangling case
  // Fixture preconditions, asserted so a later edit cannot make this test vacuous.
  assert.equal(fs.readlinkSync(link), relText, 'the link text is the relative form');
  assert.equal(fs.existsSync(link), true, 'the link RESOLVES — this is not the dangling case');
  assert.equal(fs.existsSync(relText), false, 'the relative target must not resolve from the test cwd');
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: relText });
  manifestLib.save(paths, manifest);
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  let res;
  try {
    res = manifestLib.reverse(paths, manifestLib.load(paths), {});
  } finally {
    process.stderr.write = origWrite;
  }
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the relative-target link is preserved');
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(err, /not the Wienerdog skill link we recorded/);
});

test('reverseSymlink: a forged (path,target) pair for a non-OWNED link is preserved — Table A row 4 (T7)', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  // Destination inside an allowed root, so withinAllowedRoot passes and the red
  // baseline is obtainable (a /tmp destination would be preserved at :775 for the
  // WRONG reason — no red baseline).
  const userDest = path.join(paths.claudeDir, 'my-skills');
  fs.mkdirSync(userDest, { recursive: true });
  // Case 1: a user link WITHOUT the wienerdog- prefix, directly under the skills root.
  const notes = path.join(skillsRoot, 'my-notes');
  fs.symlinkSync(userDest, notes);
  // Forgery: target read straight off the link, so rows 1-3 all pass.
  manifestLib.record(manifest, { kind: 'symlink', path: notes, target: fs.readlinkSync(notes) });
  // Case 2: a wienerdog-* link ONE DIRECTORY DEEPER than the skills root.
  const nested = path.join(skillsRoot, 'nested');
  fs.mkdirSync(nested, { recursive: true });
  const deep = path.join(nested, 'wienerdog-deep');
  fs.symlinkSync(userDest, deep);
  manifestLib.record(manifest, { kind: 'symlink', path: deep, target: fs.readlinkSync(deep) });
  manifestLib.save(paths, manifest);
  const { removed, skipped } = manifestLib.reverse(paths, manifestLib.load(paths), {});
  for (const link of [notes, deep]) {
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'a non-OWNED forged link is preserved');
    assert.ok(!removed.includes(link));
    assert.ok(skipped.includes(link));
  }
});

// ── WP-symlink-authorship-identity: forward-time authorship evidence ──────────
// Rows 4a/4b of reverseSymlink (Table A2): `origin: 'adopted'` preserves — the
// link was already on disk when we first recorded it, so it is the user's — and
// a recorded (dev, ino) pair must still BE the live link's lstat identity before
// row 5 may unlink. Fail closed on any doubt; ALL provenance fields absent keeps
// shipped 0.12.0 behaviour byte-for-byte (AC8a). Fixtures mirror WP-153's:
// OWNED links live at <claudeDir>/skills/wienerdog-* and their destinations sit
// inside claudeDir so reverse()'s withinAllowedRoot gate passes.

const { applySkillLinks } = require('../../src/adapters/shared');

/** Run fn with stderr captured; returns { result, err }. */
function captureStderr(fn) {
  const origWrite = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += chunk; return true; };
  try {
    const result = fn();
    return { result, err };
  } finally {
    process.stderr.write = origWrite;
  }
}

/** Honest forward step: a claudeDir-contained core skill source, linked into the
 *  harness skills dir by the REAL applySkillLinks (the create branch). */
function honestSkillLink(paths, manifest) {
  const skillsDir = path.join(paths.claudeDir, 'core-skills');
  const targetSkillsDir = path.join(paths.claudeDir, 'skills');
  const coreSkill = path.join(skillsDir, 'wienerdog-foo');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');
  const out = { changed: [], unchanged: [], notices: [] };
  applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out);
  return { skillsDir, targetSkillsDir, coreSkill, link: path.join(targetSkillsDir, 'wienerdog-foo'), out };
}

test('WP-symlink-authorship-identity B-T1: a user same-source replacement (new file object) survives uninstall — row 4b', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { coreSkill, link } = honestSkillLink(paths, manifest);
  const entry = manifest.entries.find((e) => e.kind === 'symlink' && e.path === link);
  assert.equal(entry.origin, 'created');
  assert.equal(typeof entry.dev, 'string');
  assert.equal(typeof entry.ino, 'string');
  // The user deletes our link and re-makes it — same path, same target, but a
  // NEW file object (honest-use case 1).
  fs.unlinkSync(link);
  fs.symlinkSync(coreSkill, link);
  // Precondition, asserted explicitly (Test index B-T1): the recreated link's
  // identity must differ from the recorded pair, so a filesystem that recycled
  // the inode fails HERE, loudly, instead of making the row a vacuous pass.
  const now = manifestLib.linkIdentity(link);
  assert.notEqual(now, null);
  assert.ok(
    now.dev !== entry.dev || now.ino !== entry.ino,
    'precondition: delete+recreate must change the (dev, ino) pair'
  );
  manifestLib.save(paths, manifest);
  const { result: res, err } = captureStderr(() => manifestLib.reverse(paths, manifestLib.load(paths), {}));
  // At base this link was DELETED (measured): target equality alone authorized
  // the unlink. Row 4b now refuses — the file object is not the one we made.
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the user's same-source replacement is preserved");
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(err, /wienerdog: keeping .* — not the Wienerdog skill link we recorded/);
});

test('WP-symlink-authorship-identity B-T2: a pre-existing exact-target link is adopted and survives uninstall — row 4a', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsDir = path.join(paths.claudeDir, 'core-skills');
  const targetSkillsDir = path.join(paths.claudeDir, 'skills');
  const coreSkill = path.join(skillsDir, 'wienerdog-foo');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');
  // The USER made this link before we ever synced (honest-use case 2).
  fs.mkdirSync(targetSkillsDir, { recursive: true });
  const link = path.join(targetSkillsDir, 'wienerdog-foo');
  fs.symlinkSync(coreSkill, link);
  const out = { changed: [], unchanged: [], notices: [] };
  applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out);
  assert.ok(out.unchanged.includes(link), 'the adopt branch reports unchanged');
  // Assert the entry shape too (Test index B-T2): the end state alone says
  // something preserved the link; `origin: 'adopted'` with NO identity says
  // WHICH rule fired — row 4a, off the adopt branch's recording (rule S-1).
  const entry = manifest.entries.find((e) => e.kind === 'symlink' && e.path === link);
  assert.ok(entry, 'the adopt branch records an entry');
  assert.equal(entry.origin, 'adopted');
  assert.equal(entry.dev, undefined);
  assert.equal(entry.ino, undefined);
  manifestLib.save(paths, manifest);
  const { result: res, err } = captureStderr(() => manifestLib.reverse(paths, manifestLib.load(paths), {}));
  // At base this link was DELETED (measured). Row 4a now preserves it.
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the user's pre-existing link is preserved");
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(err, /wienerdog: keeping .* — not the Wienerdog skill link we recorded/);
});

test('WP-symlink-authorship-identity B-T3: our own untouched link is still removed; the forward step is idempotent (AC11)', (t) => {
  // PATCH: none — baseline / ordinary path (ADR-0036 A1 exemption (ii)). Red
  // against making identity REQUIRED, and against any row 4a/4b that fires on
  // our own untouched link.
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { skillsDir, targetSkillsDir, link } = honestSkillLink(paths, manifest);
  // AC11: run the forward step a SECOND time before uninstalling — deep-equal
  // manifest entries (recordOnce no-ops; the entry keeps its first-run identity)
  // and zero `changed`.
  const snapshot = JSON.parse(JSON.stringify(manifest.entries));
  const out2 = { changed: [], unchanged: [], notices: [] };
  applySkillLinks(skillsDir, targetSkillsDir, false, manifest, out2);
  assert.deepEqual(manifest.entries, snapshot, 'second run leaves every entry exactly as recorded');
  assert.deepEqual(out2.changed, [], 'second run reports zero changed');
  assert.ok(out2.unchanged.includes(link));
  manifestLib.save(paths, manifest);
  const { result: res } = captureStderr(() => manifestLib.reverse(paths, manifestLib.load(paths), {}));
  assert.equal(fs.existsSync(link), false, 'our own untouched link is removed — uninstall stays complete');
  assert.ok(res.removed.includes(link));
});

/** Table S harness (B-T4): an OWNED, resolving wienerdog-* link plus a crafted
 *  entry whose {origin, dev, ino} shape comes from `shape(id)`. When
 *  `opts.baseControl`, a second link with an ALL-ABSENT entry rides along and
 *  must be removed in the same run — the all-absent shape reproduces base
 *  behaviour byte-for-byte (AC8a), which is how the base contrast the ledger's
 *  wrong-pair row demands is asserted in-tree. */
function tableSRow(t, shape, expect, opts = {}) {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  const id = manifestLib.linkIdentity(link);
  assert.notEqual(id, null, 'precondition: the live link has an establishable identity');
  manifestLib.record(manifest, { kind: 'symlink', path: link, target: source, ...shape(id) });
  let control = null;
  if (opts.baseControl) {
    control = path.join(skillsRoot, 'wienerdog-ctl');
    fs.symlinkSync(source, control);
    manifestLib.record(manifest, { kind: 'symlink', path: control, target: source });
  }
  manifestLib.save(paths, manifest);
  const { result: res } = captureStderr(() => manifestLib.reverse(paths, manifestLib.load(paths), {}));
  if (expect === 'removed') {
    assert.equal(fs.existsSync(link), false, 'Table S says removed');
    assert.ok(res.removed.includes(link));
  } else {
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'Table S says PRESERVED');
    assert.ok(!res.removed.includes(link));
    assert.ok(res.skipped.includes(link));
  }
  if (control) {
    assert.equal(fs.existsSync(control), false, 'base contrast: the no-provenance control is removed');
    assert.ok(res.removed.includes(control));
  }
}

test('WP-symlink-authorship-identity B-T4: all provenance absent (pre-WP install) — removed, the backward-compatibility fence (AC8a)', (t) => {
  // Red against "absent identity ⇒ preserve", which would strand every install
  // written before this WP with permanent leftovers.
  tableSRow(t, () => ({}), 'removed');
});

test("WP-symlink-authorship-identity B-T4: 'created' + matching identity — removed (the mainline)", (t) => {
  tableSRow(t, (id) => ({ origin: 'created', dev: id.dev, ino: id.ino }), 'removed');
});

test("WP-symlink-authorship-identity B-T4: 'created' + no identity (S-2: identity never establishable) — removed, base behaviour", (t) => {
  tableSRow(t, () => ({ origin: 'created' }), 'removed');
});

test("WP-symlink-authorship-identity B-T4: 'adopted' + no identity — PRESERVED (row 4a, the adopt shape)", (t) => {
  tableSRow(t, () => ({ origin: 'adopted' }), 'preserved');
});

test("WP-symlink-authorship-identity B-T4: 'adopted' + matching identity — PRESERVED (row 4a fires first; identity never consulted)", (t) => {
  tableSRow(t, (id) => ({ origin: 'adopted', dev: id.dev, ino: id.ino }), 'preserved');
});

test('WP-symlink-authorship-identity B-T4: unknown origin string + no identity — removed (never more permissive than created)', (t) => {
  tableSRow(t, () => ({ origin: 'bogus' }), 'removed');
});

test('WP-symlink-authorship-identity B-T4: unknown origin string + matching identity — removed (behaves exactly as created)', (t) => {
  tableSRow(t, (id) => ({ origin: 'bogus', dev: id.dev, ino: id.ino }), 'removed');
});

test('WP-symlink-authorship-identity B-T4: dev-only partial pair — PRESERVED (unverifiable, not absent)', (t) => {
  // One of the two partial directions; its sibling below is required too — one
  // alone is passed by an implementation that checks only the field it tests.
  tableSRow(t, (id) => ({ origin: 'created', dev: id.dev }), 'preserved');
});

test('WP-symlink-authorship-identity B-T4: ino-only partial pair — PRESERVED (unverifiable, not absent)', (t) => {
  tableSRow(t, (id) => ({ origin: 'created', ino: id.ino }), 'preserved');
});

test('WP-symlink-authorship-identity B-T4: both identity fields wrong — PRESERVED where base removed (the corruption-only ledger row)', (t) => {
  tableSRow(t, (id) => ({ origin: 'created', dev: `${id.dev}0`, ino: `${id.ino}0` }), 'preserved', { baseControl: true });
});

test('WP-symlink-authorship-identity B-T4: ino wrong only — PRESERVED where base removed', (t) => {
  tableSRow(t, (id) => ({ origin: 'created', dev: id.dev, ino: `${id.ino}0` }), 'preserved', { baseControl: true });
});

test('WP-symlink-authorship-identity B-T4: dev wrong only — PRESERVED where base removed', (t) => {
  tableSRow(t, (id) => ({ origin: 'created', dev: `${id.dev}0`, ino: id.ino }), 'preserved', { baseControl: true });
});

/** B-T5 harness: an honest-shaped entry with ONE field forged to a non-string.
 *  validateEntry must reject it upstream (D5's type gates) and the link must be
 *  preserved — where base VALIDATED the same entry and removed the link,
 *  because its `symlink: {}` cell gated none of these keys. */
function nonStringRow(t, field, value) {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  const id = manifestLib.linkIdentity(link);
  assert.notEqual(id, null);
  const entry = { kind: 'symlink', path: link, target: source, origin: 'created', dev: id.dev, ino: id.ino };
  entry[field] = value;
  // The rejection is validateEntry's, with a `why` naming the forged field.
  const shape = manifestLib.validateEntry(entry);
  assert.equal(shape.ok, false);
  assert.match(shape.why, new RegExp(`${field} must be a string`));
  // Base contrast (the ledger's schema-rejection cost): base's `symlink: {}`
  // cell gated NONE of these keys, so the same entry validated and the link was
  // removed. Proved in-test with an ungated key, which still validates today.
  assert.equal(manifestLib.validateEntry({ kind: 'symlink', path: link, target: source, zzz: 12345 }).ok, true);
  manifestLib.record(manifest, entry);
  manifestLib.save(paths, manifest);
  const { result: res, err } = captureStderr(() => manifestLib.reverse(paths, manifestLib.load(paths), {}));
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the link is preserved — the safe direction for a symlink');
  assert.ok(!res.removed.includes(link));
  assert.ok(res.skipped.includes(link));
  assert.match(err, /wienerdog: skipping manifest entry with invalid symlink shape/);
}

test('WP-symlink-authorship-identity B-T5: non-string origin is rejected upstream and the link preserved', (t) => {
  nonStringRow(t, 'origin', 1);
});

test('WP-symlink-authorship-identity B-T5: non-string dev is rejected upstream and the link preserved', (t) => {
  nonStringRow(t, 'dev', 1);
});

test('WP-symlink-authorship-identity B-T5: non-string ino is rejected upstream and the link preserved', (t) => {
  nonStringRow(t, 'ino', 12345);
});

/** B-T7 harness: honest OWNED link with its real recorded identity, then a
 *  DIRECT reverseSymlink call (WP-153 blessed the direct unit call) with the
 *  identity SEAM as the 7th argument, making the filesystem-dependent row-4b
 *  behaviours deterministic. Returns everything the arms assert on. */
function seamArm(makeIdentity) {
  const paths = tempPaths();
  const skillsRoot = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(skillsRoot, { recursive: true });
  const source = path.join(paths.claudeDir, 'core-skills', 'wienerdog-foo');
  fs.mkdirSync(source, { recursive: true });
  const link = path.join(skillsRoot, 'wienerdog-foo');
  fs.symlinkSync(source, link);
  const recorded = manifestLib.linkIdentity(link);
  assert.notEqual(recorded, null);
  const entry = { kind: 'symlink', path: link, target: source, origin: 'created', dev: recorded.dev, ino: recorded.ino };
  const removed = [];
  const skipped = [];
  const removedSet = new Set();
  const { err } = captureStderr(() =>
    manifestLib.reverseSymlink(entry, false, removed, skipped, removedSet, [skillsRoot], {
      identity: makeIdentity(recorded, link, source),
    })
  );
  return { link, removed, skipped, err };
}

test('WP-symlink-authorship-identity B-T7(a): a changed device preserves — the seam, deterministic', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const { link, removed, skipped, err } = seamArm((recorded) => () => ({ dev: recorded.dev + 1, ino: recorded.ino }));
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the link survives');
  assert.ok(skipped.includes(link));
  assert.deepEqual(removed, []);
  assert.match(err, /wienerdog: keeping .* — not the Wienerdog skill link we recorded/);
});

test('WP-symlink-authorship-identity B-T7(b): a changed inode preserves — the deterministic proof behind B-T1', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const { link, removed, skipped, err } = seamArm((recorded) => () => ({ dev: recorded.dev, ino: recorded.ino + 1 }));
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the link survives');
  assert.ok(skipped.includes(link));
  assert.deepEqual(removed, []);
  assert.match(err, /wienerdog: keeping .* — not the Wienerdog skill link we recorded/);
});

test('WP-symlink-authorship-identity B-T7(c): an unavailable identity (null) preserves — never treated as a match', (t) => {
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const { link, removed, skipped, err } = seamArm(() => () => null);
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true, 'the link survives');
  assert.ok(skipped.includes(link));
  assert.deepEqual(removed, []);
  assert.match(err, /wienerdog: keeping .* — not the Wienerdog skill link we recorded/);
});

test('WP-symlink-authorship-identity B-T7(d): a reused (recycled) identity is removed — R4 residual pin', (t) => {
  // PATCH: none — residual pin. This arm pins CURRENT behaviour at its declared
  // size, not a fix: an inode the filesystem recycled back to the same pair
  // passes row 4b, exactly as Table A2 declares (equal to base, which removes
  // the same link with no check at all).
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const { link, removed } = seamArm((recorded) => () => ({ dev: recorded.dev, ino: recorded.ino }));
  assert.equal(fs.existsSync(link), false, 'the link is removed');
  assert.ok(removed.includes(link));
});

test('WP-symlink-authorship-identity B-T8: a replacement landing between the identity check and the unlink is deleted — R7 residual pin', (t) => {
  // PATCH: none — residual pin. Row 4b's check and row 5's unlink are two
  // syscalls with nothing binding them (the verify→unlink race). This pins R7
  // at its declared size: if it ever goes red, either an atomic
  // compare-and-unlink primitive was adopted or the mechanism changed.
  if (!isPosix) return t.skip('symlink creation may be unavailable');
  const { link, removed } = seamArm((recorded, linkPath, source) => () => {
    // The seam replaces the link on disk and THEN reports the recorded pair —
    // simulating a same-user process winning the race after the check ran.
    fs.unlinkSync(linkPath);
    fs.symlinkSync(source, linkPath);
    return { dev: recorded.dev, ino: recorded.ino };
  });
  assert.equal(fs.existsSync(link), false, 'the replacement is deleted');
  assert.ok(removed.includes(link));
});
