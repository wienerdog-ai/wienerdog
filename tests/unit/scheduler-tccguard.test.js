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

test('scheduler-tccguard: protected prefixes match CASE-INSENSITIVELY (macOS default FS)', () => {
  // macOS's default case-insensitive volume makes ~/documents === ~/Documents, so a
  // differently-cased spelling must still be refused (else it evades the guard while
  // the OS resolves to the real protected dir).
  const cases = [
    ['documents', 'Documents'],
    ['DESKTOP', 'Desktop'],
    ['downloads', 'Downloads'],
    [path.join('library', 'mobile documents'), 'Library/Mobile Documents'],
  ];
  for (const [spelling, prefix] of cases) {
    const p = path.join(HOME, spelling, 'vault');
    const c = checkPath(p, HOME, 'darwin');
    assert.equal(c.protected, true, `${p} should be protected case-insensitively`);
    assert.equal(c.prefix, prefix, 'returns the canonical prefix spelling');
  }
  // A case-variant of a non-protected sibling stays unprotected (segment boundary holds).
  assert.equal(checkPath(path.join(HOME, 'documentsarchive', 'x'), HOME, 'darwin').protected, false);
});

test('scheduler-tccguard: a HOME-component casing variance is still matched (containment is case-insensitive)', () => {
  // home is /Users/ada; a path that varies the casing of a HOME component
  // (/users/ada or /Users/Ada) is the SAME dir on macOS's case-insensitive volume and
  // must NOT be classified as "outside home" — else `path.relative` returns a
  // ..-prefixed relative, the protected-prefix check never runs, and the guard is
  // evaded while the OS still accesses the real protected dir.
  const variants = ['/users/ada/Documents/vault', '/Users/Ada/Documents/vault', '/USERS/ADA/documents/vault'];
  for (const p of variants) {
    const c = checkPath(p, HOME, 'darwin');
    assert.equal(c.protected, true, `${p} should be protected despite home-component casing`);
    assert.equal(c.prefix, 'Documents');
  }
  // A genuinely different home (not a case-variant) is still outside → not protected.
  assert.equal(checkPath('/Users/bob/Documents/vault', HOME, 'darwin').protected, false);
});

test('scheduler-tccguard: the APFS Data-volume FIRMLINK spelling of a protected dir is matched', () => {
  // /Users is a firmlink onto the Data volume; /System/Volumes/Data/Users/ada is the
  // SAME dir as /Users/ada. A target using the Data-volume spelling must still be caught
  // (else it is "outside" both home spellings and the resolver stats the real dir).
  const c = checkPath('/System/Volumes/Data/Users/ada/Documents/vault', HOME, 'darwin');
  assert.equal(c.protected, true, 'Data-volume firmlink spelling of ~/Documents is protected');
  assert.equal(c.prefix, 'Documents');
  // Reverse direction: home spelled via the Data volume, plain-spelled target.
  const c2 = checkPath('/Users/ada/Desktop/x', '/System/Volumes/Data/Users/ada', 'darwin');
  assert.equal(c2.protected, true, 'Data-volume-spelled home still contains a plain target');
  assert.equal(c2.prefix, 'Desktop');
  // A genuinely different Data-volume path (different user) stays outside → not protected.
  assert.equal(checkPath('/System/Volumes/Data/Users/bob/Documents/x', HOME, 'darwin').protected, false);
});

test('scheduler-tccguard: a CASE-VARIANT firmlink prefix is stripped (fold before strip)', () => {
  // The firmlink prefix itself spelled in a non-canonical case — /system/volumes/data,
  // /SYSTEM/VOLUMES/DATA — must still be stripped. If the strip ran before lowercasing
  // (the round-6 ordering bug) these would NOT match the exact-case constant, the path
  // would stay "outside" the lowercased home, and the guard would be evaded.
  const variants = [
    '/system/volumes/data/Users/ada/Documents/vault',
    '/SYSTEM/VOLUMES/DATA/Users/ada/Documents/vault',
    '/System/Volumes/DATA/users/ADA/documents/vault',
  ];
  for (const p of variants) {
    const c = checkPath(p, HOME, 'darwin');
    assert.equal(c.protected, true, `${p} should be protected (case-variant firmlink stripped)`);
    assert.equal(c.prefix, 'Documents');
  }
});

test('scheduler-tccguard: a COMBINED case + firmlink + NFD spelling is matched', () => {
  // All three canonicalization axes at once: lowercase firmlink prefix, a home component
  // in NFD, and mixed case elsewhere — the single normalizeForCompare pass must collapse
  // it to the same canonical form as the plain NFC/proper-case home.
  const home = '/Users/Jos\u00e9'; // NFC, canonical case
  // target: lowercase firmlink + NFD 'José' + uppercase 'DOCUMENTS'
  const target = '/system/volumes/data/users/jos\u0065\u0301/DOCUMENTS/vault'; // lowercase firmlink + NFD jose\u0301 + uppercase DOCUMENTS
  const c = checkPath(target, home, 'darwin');
  assert.equal(c.protected, true, 'combined case+firmlink+NFD spelling is protected');
  assert.equal(c.prefix, 'Documents');
});

test('scheduler-tccguard: a Unicode NFC-vs-NFD home-component variance is matched', () => {
  // 'José': NFC = 'é' as one codepoint (U+00E9); NFD = 'e' + combining acute (U+0301).
  // Same directory on APFS, different bytes — a byte compare (even case-folded) would
  // classify a differently-normalized target as outside home and evade the guard.
  const nfc = '/Users/Jos\u00e9'; // e-acute precomposed (single codepoint U+00E9)
  const nfd = '/Users/Jose\u0301'; // e + U+0301 combining acute
  const c1 = checkPath(`${nfd}/Documents/vault`, nfc, 'darwin');
  assert.equal(c1.protected, true, 'NFD-spelled target under an NFC-spelled home is protected');
  assert.equal(c1.prefix, 'Documents');
  const c2 = checkPath(`${nfc}/Desktop/x`, nfd, 'darwin');
  assert.equal(c2.protected, true, 'NFC-spelled target under an NFD-spelled home is protected');
  assert.equal(c2.prefix, 'Desktop');
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
