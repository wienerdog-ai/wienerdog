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

test('reverse removes all files and empty dirs, leaving nothing', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.equal(fs.existsSync(paths.core), false);
  assert.ok(removed.includes(paths.config));
  assert.ok(removed.includes(paths.core));
  assert.equal(skipped.length, 0);
});

test('reverse dry-run removes nothing but reports would-be removals', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  const { removed } = manifestLib.reverse(paths, manifest, { dryRun: true });
  assert.equal(fs.existsSync(paths.core), true);
  assert.equal(fs.existsSync(paths.config), true);
  assert.equal(fs.existsSync(paths.manifest), true);
  assert.ok(removed.includes(paths.config));
  assert.ok(removed.includes(paths.core));
});

test('reverse keeps config.yaml when it was modified since install', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.writeFileSync(paths.config, 'user edited this\n');
  const { removed, skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(paths.config));
  assert.ok(!removed.includes(paths.config));
  assert.equal(fs.existsSync(paths.config), true);
  // Core dir must remain because config still lives in it.
  assert.equal(fs.existsSync(paths.core), true);
});

test('reverse reports already-gone entries as skipped', () => {
  const paths = tempPaths();
  const manifest = makeInstall(paths);
  fs.rmSync(paths.config);
  const { skipped } = manifestLib.reverse(paths, manifest, {});
  assert.ok(skipped.includes(paths.config));
  // Everything else still cleaned up.
  assert.equal(fs.existsSync(paths.core), false);
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
