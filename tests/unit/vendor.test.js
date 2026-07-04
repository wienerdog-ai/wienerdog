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
