'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const https = require('node:https');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const vendor = require('../../src/core/vendor');
const tarball = require('../../src/core/tarball');

/** Fresh temp core; isolates BOTH HOME and WIENERDOG_HOME (WP-042 lesson). */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-tarball-'));
  const core = path.join(root, 'wd');
  fs.mkdirSync(core, { recursive: true });
  return getPaths({ HOME: root, WIENERDOG_HOME: core });
}

/**
 * Build a fixture npm-shaped tarball OFFLINE with system `tar` (no npm pack, no
 * network). Entries live under `package/`, mirroring a published npm tarball.
 * @param {string} version @returns {{tgz:string, integrity:string, binBody:string}}
 */
function buildFixtureTarball(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-fixture-'));
  const pkg = path.join(root, 'pkg');
  const binBody = `// vendored bin ${version}\n`;
  fs.mkdirSync(path.join(pkg, 'package', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'package', 'src'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'package', 'bin', 'wienerdog.js'), binBody);
  fs.writeFileSync(path.join(pkg, 'package', 'src', 'x.js'), '// x\n');
  fs.writeFileSync(path.join(pkg, 'package', 'package.json'), JSON.stringify({ name: 'wienerdog', version }));
  const tgz = path.join(root, `wienerdog-${version}.tgz`);
  const r = spawnSync('tar', ['-czf', tgz, '-C', pkg, 'package']);
  assert.equal(r.status, 0, 'fixture tar build succeeds');
  const integrity = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64');
  return { tgz, integrity, binBody };
}

// ---------------------------------------------------------------------------
// tarballUrl / latestManifestUrl
// ---------------------------------------------------------------------------

test('tarballUrl is constructed locally and deterministic', () => {
  assert.equal(tarball.tarballUrl('0.4.0'), 'https://registry.npmjs.org/wienerdog/-/wienerdog-0.4.0.tgz');
});

test('latestManifestUrl points at the latest dist-tag', () => {
  assert.equal(tarball.latestManifestUrl(), 'https://registry.npmjs.org/wienerdog/latest');
});

// ---------------------------------------------------------------------------
// parseManifest
// ---------------------------------------------------------------------------

test('parseManifest returns {version, integrity} for a well-formed manifest, ignoring dist.tarball/shasum', () => {
  const integrity = 'sha512-' + Buffer.from('x').toString('base64');
  const json = JSON.stringify({
    name: 'wienerdog', version: '0.4.0',
    dist: { integrity, shasum: 'deadbeef', tarball: 'https://ignored.example/evil.tgz' },
  });
  const out = tarball.parseManifest(json);
  assert.deepEqual(out, { version: '0.4.0', integrity });
});

test('parseManifest throws WienerdogError on non-JSON', () => {
  assert.throws(() => tarball.parseManifest('not json {'), WienerdogError);
});

test('parseManifest throws on non-semver version', () => {
  const json = JSON.stringify({ version: 'latest; rm -rf /', dist: { integrity: 'sha512-AAAA' } });
  assert.throws(() => tarball.parseManifest(json), WienerdogError);
});

test('parseManifest throws when dist is absent', () => {
  const json = JSON.stringify({ version: '0.4.0' });
  assert.throws(() => tarball.parseManifest(json), WienerdogError);
});

test('parseManifest throws on a legacy sha1 integrity', () => {
  const json = JSON.stringify({ version: '0.4.0', dist: { integrity: 'sha1-abcdef==' } });
  assert.throws(() => tarball.parseManifest(json), WienerdogError);
});

test('parseManifest throws on sha512 with illegal base64 chars', () => {
  const json = JSON.stringify({ version: '0.4.0', dist: { integrity: 'sha512-not*valid*base64!' } });
  assert.throws(() => tarball.parseManifest(json), WienerdogError);
});

// ---------------------------------------------------------------------------
// verifyIntegrity
// ---------------------------------------------------------------------------

test('verifyIntegrity: correct sha512 → true', () => {
  const buf = Buffer.from('hello world');
  const integrity = 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');
  assert.equal(tarball.verifyIntegrity(buf, integrity), true);
});

test('verifyIntegrity: wrong bytes → false', () => {
  const integrity = 'sha512-' + crypto.createHash('sha512').update(Buffer.from('a')).digest('base64');
  assert.equal(tarball.verifyIntegrity(Buffer.from('b'), integrity), false);
});

test('verifyIntegrity: sha256-/sha1-/malformed/non-string → false', () => {
  const buf = Buffer.from('x');
  const b64 = crypto.createHash('sha256').update(buf).digest('base64');
  assert.equal(tarball.verifyIntegrity(buf, 'sha256-' + b64), false);
  assert.equal(tarball.verifyIntegrity(buf, 'sha1-deadbeef'), false);
  assert.equal(tarball.verifyIntegrity(buf, 'not-an-integrity'), false);
  assert.equal(tarball.verifyIntegrity(buf, undefined), false);
});

// ---------------------------------------------------------------------------
// fetchLatestManifest (injected seam)
// ---------------------------------------------------------------------------

test('fetchLatestManifest resolves via opts.fetchManifest seam', async () => {
  const integrity = 'sha512-' + Buffer.from('x').toString('base64');
  const out = await tarball.fetchLatestManifest({
    fetchManifest: async () => JSON.stringify({ version: '1.2.3', dist: { integrity, tarball: 'https://ignored' } }),
  });
  assert.deepEqual(out, { version: '1.2.3', integrity });
});

// ---------------------------------------------------------------------------
// downloadVerified
// ---------------------------------------------------------------------------

test('downloadVerified returns the buffer when sha512 matches', async () => {
  const buf = Buffer.from('tarball-bytes');
  const integrity = 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');
  const got = await tarball.downloadVerified('0.4.0', integrity, { downloadBuffer: async () => buf });
  assert.ok(got.equals(buf));
});

test('downloadVerified throws when sha512 does not match (security-critical)', async () => {
  const integrity = 'sha512-' + crypto.createHash('sha512').update(Buffer.from('good')).digest('base64');
  await assert.rejects(
    () => tarball.downloadVerified('0.4.0', integrity, { downloadBuffer: async () => Buffer.from('tampered') }),
    WienerdogError,
  );
});

// ---------------------------------------------------------------------------
// extractTarball
// ---------------------------------------------------------------------------

test('extractTarball strips the leading package/ component', () => {
  const { tgz, binBody } = buildFixtureTarball('0.4.0');
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-extract-'));
  tarball.extractTarball(tgz, dest);
  assert.equal(fs.readFileSync(path.join(dest, 'bin', 'wienerdog.js'), 'utf8'), binBody);
  assert.equal(fs.existsSync(path.join(dest, 'package')), false, 'package/ prefix stripped');
});

test('extractTarball throws WienerdogError when tar is missing (injected spawn ENOENT)', () => {
  assert.throws(
    () => tarball.extractTarball('/x.tgz', '/dest', { spawn: () => ({ error: new Error('ENOENT') }) }),
    WienerdogError,
  );
});

test('extractTarball throws WienerdogError when tar exits non-zero', () => {
  assert.throws(
    () => tarball.extractTarball('/x.tgz', '/dest', { spawn: () => ({ status: 1 }) }),
    WienerdogError,
  );
});

// ---------------------------------------------------------------------------
// installVersion
// ---------------------------------------------------------------------------

test('installVersion on a fresh core unpacks app/<v>/bin/wienerdog.js (package/ stripped)', async () => {
  const paths = tempPaths();
  const { tgz, integrity, binBody } = buildFixtureTarball('0.4.0');
  const r = await tarball.installVersion(paths, {
    version: '0.4.0', integrity,
    downloadBuffer: async () => fs.readFileSync(tgz),
  });
  assert.equal(r.alreadyPresent, false);
  assert.equal(r.version, '0.4.0');
  assert.equal(r.target, path.join(vendor.appDir(paths), '0.4.0'));
  const binFile = path.join(r.target, 'bin', 'wienerdog.js');
  assert.equal(fs.readFileSync(binFile, 'utf8'), binBody);
  assert.ok(fs.existsSync(path.join(r.target, 'src', 'x.js')), 'src/ present');
  assert.ok(fs.existsSync(path.join(r.target, 'package.json')), 'package.json present');
  assert.equal(fs.existsSync(path.join(r.target, 'package')), false, 'no package/ prefix');
});

test('installVersion is idempotent: second call is alreadyPresent with zero new writes', async () => {
  const paths = tempPaths();
  const { tgz, integrity } = buildFixtureTarball('0.4.0');
  await tarball.installVersion(paths, { version: '0.4.0', integrity, downloadBuffer: async () => fs.readFileSync(tgz) });

  const target = path.join(vendor.appDir(paths), '0.4.0');
  const mtimeBefore = fs.statSync(target).mtimeMs;

  let called = false;
  const r2 = await tarball.installVersion(paths, {
    version: '0.4.0', integrity,
    downloadBuffer: async () => { called = true; return fs.readFileSync(tgz); },
  });
  assert.equal(r2.alreadyPresent, true);
  assert.equal(called, false, 'no download on the idempotent path');
  assert.equal(fs.statSync(target).mtimeMs, mtimeBefore, 'version dir untouched');
});

test('installVersion replaces a pre-existing INCOMPLETE target dir (partial-dir recovery)', async () => {
  const paths = tempPaths();
  const { tgz, integrity, binBody } = buildFixtureTarball('0.4.0');
  // Plant a partial version dir: dir present with stale content, but NO sentinel
  // bin/wienerdog.js (a crash leftover, or the loser of two same-version installs).
  const target = path.join(vendor.appDir(paths), '0.4.0');
  fs.mkdirSync(path.join(target, 'src'), { recursive: true });
  fs.writeFileSync(path.join(target, 'src', 'stale.js'), '// crash leftover\n');
  assert.equal(fs.existsSync(path.join(target, 'bin', 'wienerdog.js')), false, 'sentinel absent (partial)');

  const r = await tarball.installVersion(paths, {
    version: '0.4.0', integrity,
    downloadBuffer: async () => fs.readFileSync(tgz),
  });
  assert.equal(r.alreadyPresent, false, 'partial dir is not treated as present');
  assert.equal(fs.readFileSync(path.join(target, 'bin', 'wienerdog.js'), 'utf8'), binBody, 'verified tree published');
  assert.equal(fs.existsSync(path.join(target, 'src', 'stale.js')), false, 'stale partial content replaced');
});

test('installVersion never repoints current and never writes the manifest', async () => {
  const paths = tempPaths();
  const { tgz, integrity } = buildFixtureTarball('0.4.0');
  await tarball.installVersion(paths, { version: '0.4.0', integrity, downloadBuffer: async () => fs.readFileSync(tgz) });
  assert.equal(fs.existsSync(vendor.currentLink(paths)), false, 'no app/current symlink created');
  assert.equal(fs.existsSync(paths.manifest), false, 'no install-manifest.json written');
});

test('installVersion aborts (throws) on a checksum mismatch and unpacks nothing', async () => {
  const paths = tempPaths();
  const { tgz } = buildFixtureTarball('0.4.0');
  const wrongIntegrity = 'sha512-' + crypto.createHash('sha512').update(Buffer.from('other')).digest('base64');
  await assert.rejects(
    () => tarball.installVersion(paths, {
      version: '0.4.0', integrity: wrongIntegrity,
      downloadBuffer: async () => fs.readFileSync(tgz),
    }),
    WienerdogError,
  );
  assert.equal(fs.existsSync(path.join(vendor.appDir(paths), '0.4.0')), false, 'nothing unpacked');
});

test('installVersion rejects a non-semver version before any download', async () => {
  const paths = tempPaths();
  let called = false;
  await assert.rejects(
    () => tarball.installVersion(paths, {
      version: '0.4.0; rm -rf /', integrity: 'sha512-AAAA',
      downloadBuffer: async () => { called = true; return Buffer.alloc(0); },
    }),
    WienerdogError,
  );
  assert.equal(called, false, 'no download attempted for an invalid version');
});

// ---------------------------------------------------------------------------
// Hermeticity proof: seam paths never touch https.get (WP-045 precedent).
// ---------------------------------------------------------------------------

test('seam paths never call https.get (hermeticity proof)', async () => {
  const orig = https.get;
  https.get = () => { throw new Error('network access is forbidden in tests'); };
  try {
    const { tgz, integrity } = buildFixtureTarball('0.4.0');
    const paths = tempPaths();
    // manifest seam
    await tarball.fetchLatestManifest({ fetchManifest: async () => JSON.stringify({ version: '0.4.0', dist: { integrity } }) });
    // download seam + install
    const r = await tarball.installVersion(paths, {
      version: '0.4.0', integrity,
      downloadBuffer: async () => fs.readFileSync(tgz),
    });
    assert.equal(r.alreadyPresent, false);
  } finally {
    https.get = orig;
  }
});
