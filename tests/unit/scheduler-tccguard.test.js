'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { TCC_PREFIXES, checkPath, guard } = require('../../src/scheduler/tccguard');

const HOME = '/Users/ada';

test('scheduler-tccguard: protected prefixes are refused on darwin', () => {
  for (const prefix of TCC_PREFIXES) {
    const p = path.join(HOME, prefix, 'vault');
    const c = checkPath(p, HOME, 'darwin');
    assert.equal(c.protected, true, `${p} should be protected`);
    assert.equal(c.prefix, prefix);
  }
});

test('scheduler-tccguard: the protected folder itself (no subpath) is refused', () => {
  const c = checkPath(path.join(HOME, 'Documents'), HOME, 'darwin');
  assert.equal(c.protected, true);
  assert.equal(c.prefix, 'Documents');
});

test('scheduler-tccguard: iCloud Drive root (Library/Mobile Documents) is refused', () => {
  const p = path.join(HOME, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'vault');
  const c = checkPath(p, HOME, 'darwin');
  assert.equal(c.protected, true);
  assert.equal(c.prefix, 'Library/Mobile Documents');
});

test('scheduler-tccguard: ~/wienerdog (home root) is allowed on darwin', () => {
  const c = checkPath(path.join(HOME, 'wienerdog'), HOME, 'darwin');
  assert.equal(c.protected, false);
  assert.equal(c.prefix, null);
});

test('scheduler-tccguard: ~/.wienerdog core is allowed on darwin', () => {
  const c = checkPath(path.join(HOME, '.wienerdog'), HOME, 'darwin');
  assert.equal(c.protected, false);
});

test('scheduler-tccguard: segment comparison — DocumentsArchive is NOT protected', () => {
  const c = checkPath(path.join(HOME, 'DocumentsArchive', 'vault'), HOME, 'darwin');
  assert.equal(c.protected, false, 'string-prefix match would wrongly flag this');
  assert.equal(c.prefix, null);
});

test('scheduler-tccguard: a sibling of Library (LibraryX) is NOT protected', () => {
  const c = checkPath(path.join(HOME, 'LibraryX', 'Mobile Documents'), HOME, 'darwin');
  assert.equal(c.protected, false);
});

test('scheduler-tccguard: paths outside home are not protected', () => {
  const c = checkPath('/opt/data/Documents/vault', HOME, 'darwin');
  assert.equal(c.protected, false);
});

test('scheduler-tccguard: home itself is not protected', () => {
  assert.equal(checkPath(HOME, HOME, 'darwin').protected, false);
});

test('scheduler-tccguard: non-darwin platforms are never protected', () => {
  for (const platform of ['linux', 'win32']) {
    const p = path.join(HOME, 'Documents', 'vault');
    const c = checkPath(p, HOME, platform);
    assert.equal(c.protected, false, `${platform} must not be protected`);
    assert.equal(c.prefix, null);
  }
});

test('scheduler-tccguard: guard returns the first offender', () => {
  const ok = path.join(HOME, 'wienerdog');
  const bad = path.join(HOME, 'Desktop', 'vault');
  const g = guard([ok, bad], HOME, 'darwin');
  assert.equal(g.ok, false);
  assert.equal(g.offending, bad);
  assert.equal(g.prefix, 'Desktop');
});

test('scheduler-tccguard: guard is ok when all paths are safe', () => {
  const g = guard([path.join(HOME, 'wienerdog'), path.join(HOME, '.wienerdog')], HOME, 'darwin');
  assert.deepEqual(g, { ok: true, offending: null, prefix: null });
});

test('scheduler-tccguard: guard on linux always ok even for Documents', () => {
  const g = guard([path.join(HOME, 'Documents', 'vault')], HOME, 'linux');
  assert.equal(g.ok, true);
});
