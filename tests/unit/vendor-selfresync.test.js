'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const vendor = require('../../src/core/vendor');

function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-'));
  const core = path.join(root, 'wd');
  fs.mkdirSync(core, { recursive: true });
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/** A .git-free copy of the running package: a real `src/` so the vendored tree
 *  can be required THROUGH `app/current` the way the PATH shim does. */
let FULL_SOURCE = null;
function fullSource() {
  if (FULL_SOURCE) return FULL_SOURCE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-full-'));
  vendor.copyTree(vendor.packageRoot(), dir);
  FULL_SOURCE = dir;
  return dir;
}

/** Load vendor.js the way `wienerdog sync` does on a real install: through the
 *  PATH shim, i.e. through `<core>/app/current`. `packageRoot()` inside the
 *  returned module is therefore `realpath(app/current)` — the app tree itself. */
function shimVendor(paths) {
  return require(path.join(paths.core, 'app', 'current', 'src', 'core', 'vendor.js'));
}

/** One A7-scoped write: append a marker to the app tree's launcher source. */
function plantMarker(file, marker) {
  fs.chmodSync(file, 0o644);
  fs.appendFileSync(file, `\n// ${marker}\n`);
}

const readsMarker = (f, m) => {
  try { return fs.readFileSync(f, 'utf8').includes(m); } catch { return false; }
};

test('vendor: a prod self-resync does NOT re-publish launch.js from the app tree', () => {
  const paths = tempPaths();
  const r = vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);
  const before = fs.readFileSync(launcher);

  plantMarker(path.join(paths.core, 'app', r.version, 'src', 'scheduler', 'launcher.js'), 'A7-PLANT-PROD');

  const out = shimVendor(paths).vendorSelf(paths, {});
  assert.equal(readsMarker(launcher, 'A7-PLANT-PROD'), false, 'the app tree cannot reach launch.js');
  assert.ok(fs.readFileSync(launcher).equals(before), 'launch.js bytes carried forward verbatim');
  assert.equal(vendor.installStance(paths), 'prod', 'containment carried forward');
  assert.equal(out.version, r.version);

  // Idempotent: a second self-resync changes nothing either.
  shimVendor(paths).vendorSelf(paths, {});
  assert.ok(fs.readFileSync(launcher).equals(before));

  // Table L "both arms": the CARRY arm still records the launcher's manifest
  // pair. writeLauncher is their only recorder, and manifest.load hands back a
  // FRESH EMPTY manifest when install-manifest.json is gone — so a carry arm
  // that skipped the recording would leave <core> non-empty at uninstall. A
  // fresh empty manifest is exactly that scenario. This is the only gate on it.
  const fresh = { version: 1, createdAt: '', entries: [] };
  shimVendor(paths).vendorSelf(paths, { manifest: fresh });
  const dirs = fresh.entries.filter((e) => e.kind === 'dir' && e.path === path.dirname(launcher));
  const files = fresh.entries.filter((e) => e.kind === 'file' && e.path === launcher);
  assert.equal(dirs.length, 1, 'exactly one <core>/launcher dir entry on the carry arm');
  assert.equal(files.length, 1, 'exactly one launch.js file entry on the carry arm');
  assert.ok(
    fresh.entries.indexOf(dirs[0]) < fresh.entries.indexOf(files[0]),
    'dir recorded BEFORE file on the carry arm too (uninstall replays in reverse)'
  );
  assert.ok(fs.readFileSync(launcher).equals(before), 'still carried forward when a manifest is passed');
});

test('vendor: a prod self-resync with launch.js missing or unreadable fails closed', () => {
  const paths = tempPaths();
  const r = vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);
  plantMarker(path.join(paths.core, 'app', r.version, 'src', 'scheduler', 'launcher.js'), 'A7-PLANT-DELETED');

  // --- Shape A: ABSENT (ENOENT). Fails closed; the named recovery completes it.
  fs.rmSync(launcher);
  assert.throws(
    () => shimVendor(paths).vendorSelf(paths, {}),
    // Table L row 3 requires all three fields in the message; gate all three.
    (e) => e.name === 'WienerdogError'
      && e.message.includes(launcher)
      && /ENOENT/.test(e.message)
      && /npx wienerdog@latest sync/.test(e.message),
    'refuses rather than re-publishing from the tree it is re-vendoring'
  );
  assert.equal(fs.existsSync(launcher), false, 'nothing was published');

  // Recovery: a run from a DIFFERENT source root is not a self-resync and restores it.
  // A different source root makes carryForward FALSY, so Table L row 1 runs. The
  // bytes come from packageRoot() — vendorSelf never forwards sourceRoot to
  // writeLauncher (Current state §3, bytes-provenance) — so the marker planted in
  // the APP TREE cannot appear. The second assertion is belt-and-braces: under
  // every implementation this spec contemplates the bytes are packageRoot()'s and
  // it cannot fail. Keep it anyway — it is the tripwire if someone later forwards
  // sourceRoot, which AC4 / vendor.test.js:412-413 also forbid.
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  assert.ok(fs.statSync(launcher).isFile(), 'a non-self-resync run republishes launch.js');
  assert.equal(readsMarker(launcher, 'A7-PLANT-DELETED'), false, 'republished from packageRoot(), not the app tree');

  // --- Shape B: PRESENT BUT UNREADABLE (EISDIR). A directory is used rather
  // than a mode-000 file because root can read mode 000 and CI may run as root.
  // The carry arm fails closed the same way, and the documented recovery is
  // NOT complete for this shape: row 1's own fs.writeFileSync(dest) throws the
  // same code, so the path must be removed first. Both halves are the claim
  // made in Implementation notes → D1, so both are asserted.
  fs.rmSync(launcher);
  fs.mkdirSync(launcher);
  assert.throws(
    () => shimVendor(paths).vendorSelf(paths, {}),
    (e) => e.name === 'WienerdogError'
      && e.message.includes(launcher)
      && /EISDIR/.test(e.message)
      && /npx wienerdog@latest sync/.test(e.message),
    'an occupied destination also fails closed, with its own err.code'
  );
  assert.ok(fs.statSync(launcher).isDirectory(), 'nothing was published over it');
  assert.throws(
    () => vendor.vendorSelf(paths, { sourceRoot: fullSource() }),
    /EISDIR/,
    'the publish arm does not auto-repair an occupied destination either (unchanged from main)'
  );
  fs.rmSync(launcher, { recursive: true });
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  assert.ok(fs.statSync(launcher).isFile(), 'clearing the path first completes the recovery');
});

test('vendor: an upgrade (different source root) still publishes the new launcher', () => {
  const paths = tempPaths();
  vendor.vendorSelf(paths, { sourceRoot: fullSource() });
  const launcher = vendor.launcherPath(paths);

  // What `wienerdog update` does: unpack <core>/app/<newver>, then run ITS bin.
  const newDir = path.join(paths.core, 'app', '9.9.9');
  vendor.copyTree(fullSource(), newDir);
  const pkg = JSON.parse(fs.readFileSync(path.join(newDir, 'package.json'), 'utf8'));
  pkg.version = '9.9.9';
  fs.writeFileSync(path.join(newDir, 'package.json'), JSON.stringify(pkg));
  fs.appendFileSync(path.join(newDir, 'src', 'scheduler', 'launcher.js'), '\n// NEW-LAUNCHER-9.9.9\n');

  const out = require(path.join(newDir, 'src', 'core', 'vendor.js')).vendorSelf(paths, {});
  assert.equal(out.version, '9.9.9');
  assert.equal(path.basename(fs.realpathSync(vendor.currentLink(paths))), '9.9.9');
  assert.equal(readsMarker(launcher, 'NEW-LAUNCHER-9.9.9'), true, 'the new version publishes its launcher');
});

test('vendor: a dev self-resync still re-publishes launch.js from the checkout', () => {
  const paths = tempPaths();
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-vendor-dev-'));
  vendor.copyTree(fullSource(), checkout);
  fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  vendor.vendorSelf(paths, { sourceRoot: checkout });
  assert.equal(vendor.installStance(paths), 'dev');

  fs.appendFileSync(path.join(checkout, 'src', 'scheduler', 'launcher.js'), '\n// DEV-EDIT\n');
  shimVendor(paths).vendorSelf(paths, {});
  assert.equal(readsMarker(vendor.launcherPath(paths), 'DEV-EDIT'), true, 'a maintainer edit still reaches launch.js');
});
