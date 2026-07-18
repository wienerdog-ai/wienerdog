'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  resolveExecutable,
  verifyExecutable,
  probeVersion,
  createPins,
  loadPins,
  verifyPin,
  resolvePinnedSpawn,
  EXEC_PINS_PATH,
} = require('../../src/core/exec-identity');
const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');

const posixOnly = { skip: process.platform === 'win32' };
const platform = process.platform;

/** Isolated temp core. @returns {{paths:import('../../src/core/paths').WienerdogPaths, root:string}} */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-execid-'));
  return { paths: getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') }), root };
}

/** Write an executable shell script named `name` into `dir`. @returns {string} its path */
function writeExec(dir, name, body = 'exit 0') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** A bin dir under `root`. @returns {string} */
function makeBin(root, label) {
  const dir = path.join(root, label);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

test('exec-identity: resolveExecutable walks PATH left-to-right and returns the first executable hit', posixOnly, () => {
  const { root } = tempPaths();
  const binA = makeBin(root, 'binA');
  const binB = makeBin(root, 'binB');
  writeExec(binA, 'claude');
  writeExec(binB, 'claude');

  const hit = resolveExecutable('claude', { PATH: `${binA}:${binB}` }, platform);
  assert.equal(hit.path, path.join(binA, 'claude'));
  assert.equal(hit.realpath, fs.realpathSync(path.join(binA, 'claude')));
  assert.equal(hit.name, 'claude');
});

test('exec-identity: resolveExecutable skips a non-executable file (PATH semantics)', posixOnly, () => {
  const { root } = tempPaths();
  const binA = makeBin(root, 'binA');
  const binB = makeBin(root, 'binB');
  const noExec = path.join(binA, 'claude');
  fs.writeFileSync(noExec, '#!/bin/sh\nexit 0\n'); // mode 0644 — not executable
  writeExec(binB, 'claude');

  const hit = resolveExecutable('claude', { PATH: `${binA}:${binB}` }, platform);
  assert.equal(hit.path, path.join(binB, 'claude'));
});

test('exec-identity: resolveExecutable canonicalizes a symlinked command to its realpath', posixOnly, () => {
  const { root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const versions = makeBin(root, 'versions');
  const target = writeExec(versions, '2.1.214');
  fs.symlinkSync(target, path.join(bin, 'claude'));

  const hit = resolveExecutable('claude', { PATH: bin }, platform);
  assert.equal(hit.path, path.join(bin, 'claude'), 'path is the pre-realpath command path');
  assert.equal(hit.realpath, fs.realpathSync(target));
});

test('exec-identity: resolveExecutable returns null when absent or PATH is empty', () => {
  const { root } = tempPaths();
  const bin = makeBin(root, 'bin');
  assert.equal(resolveExecutable('claude', { PATH: bin }, platform), null);
  assert.equal(resolveExecutable('claude', { PATH: '' }, platform), null);
  assert.equal(resolveExecutable('claude', {}, platform), null);
});

test('exec-identity: verifyExecutable passes a user-owned 0755 regular file in private dirs', posixOnly, () => {
  const { root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const p = writeExec(bin, 'claude');
  assert.deepEqual(verifyExecutable(fs.realpathSync(p), platform), { ok: true });
});

test('exec-identity: verifyExecutable refuses a directory, a non-exec file, and a foreign owner', posixOnly, () => {
  const { root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const p = writeExec(bin, 'claude');
  const real = fs.realpathSync(p);

  assert.equal(verifyExecutable(fs.realpathSync(bin), platform).ok, false, 'a directory is not spawnable');

  fs.chmodSync(p, 0o644);
  const noExec = verifyExecutable(real, platform);
  assert.equal(noExec.ok, false);
  assert.match(noExec.why, /execute bit/);
  fs.chmodSync(p, 0o755);

  // Owner check via the injected uid seam (the file is ours; pretend we are not).
  const foreign = verifyExecutable(real, platform, { uid: process.getuid() + 12345 });
  assert.equal(foreign.ok, false);
  assert.match(foreign.why, /owned by uid/);
});

test('exec-identity: verifyExecutable refuses a group/other-writable non-root ancestor, allows root-owned /tmp', posixOnly, () => {
  const { root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const p = writeExec(bin, 'claude');
  const real = fs.realpathSync(p);

  fs.chmodSync(bin, 0o770); // group-writable, owned by the current user (not root)
  const r = verifyExecutable(real, platform);
  assert.equal(r.ok, false);
  assert.match(r.why, /group\/other-writable/);
  fs.chmodSync(bin, 0o700);
  assert.equal(verifyExecutable(real, platform).ok, true);

  // Root-owned sticky /tmp is other-writable but root-owned — the ancestor rule
  // passes it (the acceptance's /tmp/evil is refused by the INSTALL-DIR check).
  const tmpDir = fs.mkdtempSync('/tmp/wd-execid-');
  try {
    const t = writeExec(tmpDir, 'claude');
    assert.equal(verifyExecutable(fs.realpathSync(t), platform).ok, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('exec-identity: probeVersion captures the first stdout line, bounded; unknown on failure', posixOnly, () => {
  const { root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const ok = writeExec(bin, 'claude', 'echo "9.9.9 (Fake Claude)"; echo "second line"');
  const bad = writeExec(bin, 'broken', 'exit 3');

  assert.equal(probeVersion(ok, process.env), '9.9.9 (Fake Claude)');
  assert.equal(probeVersion(bad, process.env), 'unknown');
  assert.equal(probeVersion(path.join(bin, 'missing'), process.env), 'unknown');
});

test('exec-identity: createPins pins claude+git, notices unresolvable codex, writes a 0600 store, records the manifest once', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo "9.9.9 (Fake Claude)"');
  writeExec(bin, 'git', 'echo "git version 2.99.0"');
  const env = { PATH: bin };
  const manifest = { version: 1, createdAt: 'now', entries: [] };

  const r = createPins(paths, { env, platform, manifest });
  assert.deepEqual(Object.keys(r.pins), ['claude', 'git']);
  assert.equal(r.pins.claude.commandPath, path.join(bin, 'claude'));
  assert.equal(r.pins.claude.installDir, path.dirname(fs.realpathSync(path.join(bin, 'claude'))));
  assert.equal(r.pins.claude.version, '9.9.9 (Fake Claude)');
  assert.equal(r.notices.length, 1);
  assert.match(r.notices[0], /codex/);

  const store = path.join(paths.state, EXEC_PINS_PATH);
  assert.equal(fs.statSync(store).mode & 0o777, 0o600);
  const onDisk = JSON.parse(fs.readFileSync(store, 'utf8'));
  assert.equal(onDisk.schema, 1);
  assert.equal(onDisk.pins.git.commandPath, path.join(bin, 'git'));

  // Second sync: byte-identical store (pinnedAt preserved), manifest entry once.
  const bytes1 = fs.readFileSync(store);
  createPins(paths, { env, platform, manifest });
  assert.ok(fs.readFileSync(store).equals(bytes1), 'idempotent re-pin is byte-identical');
  const pinEntries = manifest.entries.filter((e) => e.path === store);
  assert.equal(pinEntries.length, 1);
});

test('exec-identity: createPins notices a missing git; dryRun writes nothing', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude', 'echo "9.9.9"');
  const env = { PATH: bin };

  const dry = createPins(paths, { env, platform, dryRun: true });
  assert.deepEqual(Object.keys(dry.pins), ['claude']);
  assert.ok(dry.notices.some((n) => /git not found on the job PATH/.test(n)));
  assert.equal(fs.existsSync(path.join(paths.state, EXEC_PINS_PATH)), false, 'dry-run never writes');
});

test('exec-identity: loadPins returns {} on missing or corrupt store', () => {
  const { paths } = tempPaths();
  assert.deepEqual(loadPins(paths), {});
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(path.join(paths.state, EXEC_PINS_PATH), 'not json');
  assert.deepEqual(loadPins(paths), {});
});

test('exec-identity: verifyPin passes silently across an auto-update (new file, same install dir)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const versions = makeBin(root, 'versions');
  const v1 = writeExec(versions, '1.0.0', 'echo v1');
  fs.symlinkSync(v1, path.join(bin, 'claude'));
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  // Auto-update: a NEW version file appears, the command symlink repoints.
  const v2 = writeExec(versions, '2.0.0', 'echo v2');
  fs.unlinkSync(path.join(bin, 'claude'));
  fs.symlinkSync(v2, path.join(bin, 'claude'));

  const r = verifyPin('claude', paths, { env, platform });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.path, fs.realpathSync(v2), 'the LIVE realpath is returned, never the stored one');
});

test('exec-identity: verifyPin drifts on a changed command path (fake earlier on PATH)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  writeExec(bin, 'claude');
  createPins(paths, { env: { PATH: bin }, platform });

  writeExec(evil, 'claude', 'echo pwned');
  const r = verifyPin('claude', paths, { env: { PATH: `${evil}:${bin}` }, platform });
  assert.equal(r.ok, false);
  assert.equal(r.drift, true);
  assert.match(r.why, /pinned command path/);
});

test('exec-identity: verifyPin drifts when the symlink leaves the pinned install dir (e.g. /tmp/evil)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const versions = makeBin(root, 'versions');
  const v1 = writeExec(versions, '1.0.0');
  fs.symlinkSync(v1, path.join(bin, 'claude'));
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  const tmpDir = fs.mkdtempSync('/tmp/wd-execid-');
  try {
    const evil = writeExec(tmpDir, 'evil');
    fs.unlinkSync(path.join(bin, 'claude'));
    fs.symlinkSync(evil, path.join(bin, 'claude'));

    const r = verifyPin('claude', paths, { env, platform });
    assert.equal(r.ok, false);
    assert.equal(r.drift, true);
    assert.match(r.why, /outside its pinned install dir/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('exec-identity: verifyPin drifts when the live target fails structural verification', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'git');
  const env = { PATH: bin };
  createPins(paths, { env, platform });

  fs.chmodSync(bin, 0o770); // group-writable ancestor of the live target
  try {
    const r = verifyPin('git', paths, { env, platform });
    assert.equal(r.ok, false);
    assert.equal(r.drift, true);
    assert.match(r.why, /failed verification/);
  } finally {
    fs.chmodSync(bin, 0o700);
  }
});

test('exec-identity: verifyPin distinguishes missing pin (drift:false) from a drifted pin (drift:true)', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  writeExec(bin, 'claude');
  const r = verifyPin('claude', paths, { env: { PATH: bin }, platform });
  assert.equal(r.ok, false);
  assert.equal(r.drift, false, 'no pin is the benign first-run state, never fail-safe');
});

test('exec-identity: resolvePinnedSpawn throws the repin message on drift and never yields the fake', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const evil = makeBin(root, 'evil');
  writeExec(bin, 'claude');
  createPins(paths, { env: { PATH: bin }, platform });
  writeExec(evil, 'claude', 'echo pwned');

  assert.throws(
    () => resolvePinnedSpawn('claude', paths, { PATH: `${evil}:${bin}` }, platform),
    (err) => err instanceof WienerdogError && /wienerdog sync/.test(err.message) && /claude/.test(err.message)
  );
});

test('exec-identity: resolvePinnedSpawn self-heals with a live verified resolve when never pinned', posixOnly, () => {
  const { paths, root } = tempPaths();
  const bin = makeBin(root, 'bin');
  const p = writeExec(bin, 'git');
  const got = resolvePinnedSpawn('git', paths, { PATH: bin }, platform);
  assert.equal(got, fs.realpathSync(p));
  assert.throws(() => resolvePinnedSpawn('claude', paths, { PATH: bin }, platform), WienerdogError);
});
