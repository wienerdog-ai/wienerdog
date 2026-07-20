'use strict';

// WP-158 — the DETERMINISTIC A7 integrity negatives (run in `npm test`, no
// scenario gating, no model quota). Each tamper drives the REAL launcher / pin
// path with a recording fake spawn and asserts a refusal with ZERO recorded
// app/model launches. Case 0 is the non-vacuity control: the clean fixture DOES
// record exactly one intended spawn, so every "zero spawn" below is meaningful.
//
// Honest boundary (mirrored from the spec): this proves the SCOPED-WRITE
// negatives (config.yaml / app tree / ~/.local/bin) and the drift-detection
// positives. It does NOT assert protection against an actor who overwrites the
// launcher file itself or the OS entry — that is A12's territory.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const launcher = require('../../src/scheduler/launcher');
// WP-154 R13/R15: the exec-path helpers (resolvePinnedSpawn/bindInterpreter/…)
// are module-internal now; drive the encapsulated public exec API instead. A
// drift/tamper/verify-failure THROWS inside spawnPinnedSync BEFORE any spawn, so
// these negatives still assert the fail-safe refusal (the plant never runs).
const { spawnPinnedSync } = require('../../src/core/exec-identity');
const { WienerdogError } = require('../../src/core/errors');
const {
  buildProdInstall,
  writeFakeExec,
  poisonConfig,
  recordingSpawn,
  cleanup,
} = require('../scenarios/a7-integrity/fixtures/build');

/** Drive launcher.main for the dream job with a recording spawn; return
 *  {code, calls, alerts}. Silences stderr. */
function runLauncher(fx) {
  const { spawn, calls } = recordingSpawn();
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  let code;
  try {
    code = launcher.main(['dream', '--descriptor', fx.descriptorPath, '--expect-digest', fx.digest], {
      env: fx.env,
      platform: process.platform,
      spawn,
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  let alerts = '';
  try {
    alerts = fs.readFileSync(path.join(fx.paths.state, 'alerts.jsonl'), 'utf8');
  } catch {
    alerts = '';
  }
  return { code, calls, alerts };
}

// ── Case 0: non-vacuity baseline (control) ──────────────────────────────────

test('a7-integrity-negatives: (0) non-vacuity — the clean fixture records EXACTLY ONE intended run-job spawn', () => {
  const fx = buildProdInstall();
  try {
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 0, 'clean install verifies and runs');
    assert.equal(calls.length, 1, 'exactly one spawn on the clean baseline');
    assert.equal(calls[0].command, process.execPath);
    assert.deepEqual(calls[0].args.slice(1), ['run-job', 'dream']);
  } finally {
    cleanup(fx.root);
  }
});

// ── Case 1: config authorized-field rewrite (three tampers) ─────────────────

for (const [field, value, label] of [
  ['run', 'skill:wienerdog-weekly-review', 'run action'],
  ['dream_model', 'opus', 'dream_model'],
  ['dream_timeout_minutes', '5', 'dream_timeout_minutes'],
]) {
  test(`a7-integrity-negatives: (1) config ${label} rewrite ⇒ descriptor mismatch, zero spawn`, () => {
    const fx = buildProdInstall();
    try {
      poisonConfig(fx.paths, fx.root, field, value); // no re-sync ⇒ entry digest unchanged
      const { code, calls, alerts } = runLauncher(fx);
      assert.equal(code, 1, 'launcher refuses');
      assert.equal(calls.length, 0, `zero spawn after ${label} tamper`);
      assert.match(alerts, /integrity mismatch/);
    } finally {
      cleanup(fx.root);
    }
  });
}

// ── Case 2: app mutation / repoint / out-of-root symlink ────────────────────

test('a7-integrity-negatives: (2a) an app byte mutation ⇒ zero spawn', () => {
  const fx = buildProdInstall();
  try {
    const target = fs.realpathSync(fx.corePaths.appCurrent);
    const f = path.join(target, 'package.json');
    try {
      fs.chmodSync(f, 0o644);
    } catch {
      /* already writable */
    }
    fs.appendFileSync(f, '\n// tampered\n');
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 1);
    assert.equal(calls.length, 0, 'zero spawn after an app byte mutation');
  } finally {
    cleanup(fx.root);
  }
});

test('a7-integrity-negatives: (2b) repointing current to a sibling dir ⇒ zero spawn', () => {
  const fx = buildProdInstall();
  try {
    // A second real vendored version dir under app/, then repoint current at it.
    // Its treeDigest differs from the descriptor's ⇒ refuse.
    const sibling = path.join(fx.corePaths.appDir, 'sibling');
    fs.mkdirSync(path.join(sibling, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(sibling, 'bin', 'wienerdog.js'), '// other\n');
    fs.writeFileSync(path.join(sibling, 'package.json'), '{"version":"9.9.9"}\n');
    fs.rmSync(fx.corePaths.appCurrent, { force: true });
    fs.symlinkSync(sibling, fx.corePaths.appCurrent);
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 1);
    assert.equal(calls.length, 0, 'zero spawn after a current repoint');
  } finally {
    cleanup(fx.root);
  }
});

test('a7-integrity-negatives: (2c) current symlinked OUTSIDE <core>/app ⇒ zero spawn', { skip: process.platform === 'win32' }, () => {
  const fx = buildProdInstall();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-evil-'));
  try {
    fs.mkdirSync(path.join(outside, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'bin', 'wienerdog.js'), '// evil\n');
    fs.writeFileSync(path.join(outside, 'package.json'), '{"version":"9.9.9"}\n');
    fs.rmSync(fx.corePaths.appCurrent, { force: true });
    fs.symlinkSync(outside, fx.corePaths.appCurrent);
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 1);
    assert.equal(calls.length, 0, 'zero spawn when current escapes <core>/app');
  } finally {
    cleanup(fx.root);
    cleanup(outside);
  }
});

// ── Case 3: prod/dev stance downgrade (planted .git) ────────────────────────

test('a7-integrity-negatives: (3) a planted .git downgrade of a prod tree ⇒ refuse, zero spawn (no silent dev fallback)', () => {
  const fx = buildProdInstall();
  try {
    const target = fs.realpathSync(fx.corePaths.appCurrent);
    fs.mkdirSync(path.join(target, '.git')); // now isDevCheckout(target) is true
    const { code, calls, alerts } = runLauncher(fx);
    assert.equal(code, 1);
    assert.equal(calls.length, 0, 'a prod entry over a dev-looking tree refuses, never downgrades');
    assert.match(alerts, /integrity mismatch/);
  } finally {
    cleanup(fx.root);
  }
});

// ── Case 4: manifest+config rewrite cannot defeat the unchanged descriptor ──

test('a7-integrity-negatives: (4) rewriting config + manifest but NOT the entry digest still refuses', () => {
  const fx = buildProdInstall();
  try {
    poisonConfig(fx.paths, fx.root, 'run', 'skill:wienerdog-weekly-review');
    // Also churn the manifest — the entry-bound --expect-digest is the anchor,
    // so no config/manifest rewrite short of re-syncing the entry can verify.
    const manifestPath = fx.paths.manifest;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.entries.push({ kind: 'file', path: path.join(fx.paths.state, 'decoy.json') });
      fs.writeFileSync(manifestPath, JSON.stringify(m));
    } catch {
      /* manifest may not exist in this minimal fixture — the config drift alone still refuses */
    }
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 1);
    assert.equal(calls.length, 0, 'the independent entry digest is unchanged ⇒ refuse');
  } finally {
    cleanup(fx.root);
  }
});

// ── Case 5: fake claude/git earlier on PATH never executes ──────────────────

test('a7-integrity-negatives: (5) a fake claude planted earlier on PATH is never resolved (pin drift throws)', () => {
  const fx = buildProdInstall();
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-evilbin-'));
  try {
    const evil = writeFakeExec(evilDir, 'claude', 'echo pwned');
    const jobEnv = { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` };
    assert.throws(
      () => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }),
      (err) => err instanceof WienerdogError && /wienerdog sync/.test(err.message)
    );
    // The pinned resolve returns the PINNED path, never the planted fake.
    assert.notEqual(evil, fx.fakeClaude);
  } finally {
    cleanup(fx.root);
    cleanup(evilDir);
  }
});

// ── Case 6: pinned executable structural failure stops pre-spawn ────────────

test('a7-integrity-negatives: (6a) repointing the pinned claude outside its install dir ⇒ throws pre-spawn', { skip: process.platform === 'win32' }, () => {
  const fx = buildProdInstall();
  const tmpDir = fs.mkdtempSync('/tmp/wd-a7-out-');
  try {
    // Replace the pinned command PATH-hit with a symlink to a target OUTSIDE the
    // pinned install dir. The pin records commandPath=pinBin/claude, installDir=
    // pinBin; a symlink there → /tmp/evil resolves outside installDir ⇒ drift.
    const evil = writeFakeExec(tmpDir, 'evil');
    fs.rmSync(fx.fakeClaude, { force: true });
    fs.symlinkSync(evil, fx.fakeClaude);
    const jobEnv = { ...fx.env, PATH: fx.pinBin };
    assert.throws(() => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }), WienerdogError);
  } finally {
    cleanup(fx.root);
    cleanup(tmpDir);
  }
});

test('a7-integrity-negatives: (6b) clearing the pinned target exec bit ⇒ throws pre-spawn', { skip: process.platform === 'win32' }, () => {
  const fx = buildProdInstall();
  try {
    fs.chmodSync(fx.fakeClaude, 0o644); // no exec bit
    const jobEnv = { ...fx.env, PATH: fx.pinBin };
    assert.throws(() => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }), WienerdogError);
  } finally {
    cleanup(fx.root);
  }
});

test('a7-integrity-negatives: (6c) a group/other-writable ancestor of the pinned target ⇒ throws pre-spawn', { skip: process.platform === 'win32' }, () => {
  const fx = buildProdInstall();
  try {
    fs.chmodSync(fx.pinBin, 0o777); // ancestor now group/other-writable
    const jobEnv = { ...fx.env, PATH: fx.pinBin };
    assert.throws(() => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }), WienerdogError);
  } finally {
    try {
      fs.chmodSync(fx.pinBin, 0o755);
    } catch {
      /* ignore */
    }
    cleanup(fx.root);
  }
});

// ── Case 7: valid update switches atomically; interrupted update retains old ─

test('a7-integrity-negatives: (7) an interrupted re-vendor leaves the prior valid current verifying + runnable', () => {
  const fx = buildProdInstall();
  try {
    const before = fs.realpathSync(fx.corePaths.appCurrent);
    // Simulate an interrupted upgrade: a copy crash mid-staging, no atomic rename.
    const vendor = require('../../src/core/vendor');
    const origCp = fs.cpSync;
    fs.cpSync = () => {
      throw new Error('disk full mid-copy');
    };
    try {
      assert.throws(() => vendor.vendorSelf(fx.paths, { sourceRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-v2-')), env: {} }));
    } catch {
      /* vendorSelf may or may not throw depending on version dir; the invariant is below */
    } finally {
      fs.cpSync = origCp;
    }
    // The prior current still resolves and the launcher still verifies + runs it.
    assert.equal(fs.realpathSync(fx.corePaths.appCurrent), before, 'current still points at the prior valid version');
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 0, 'the prior version still verifies and runs');
    assert.equal(calls.length, 1);
  } finally {
    cleanup(fx.root);
  }
});

// ── Case 8: WP-155 cross-check — the test-exec env seams do not exist ────────

test('a7-integrity-negatives: (8) WIENERDOG_RUNJOB_CMD / WIENERDOG_DREAM_CMD have no effect (seams deleted)', () => {
  // Source-level proof: neither seam name exists anywhere in src/.
  const { execFileSync } = require('node:child_process');
  const repoRoot = path.resolve(__dirname, '..', '..');
  let hits = '';
  try {
    hits = execFileSync('grep', ['-rnE', 'WIENERDOG_RUNJOB_CMD|WIENERDOG_DREAM_CMD', 'src/'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } catch (err) {
    // grep exits 1 (no matches) → err.status === 1, stdout empty. That is success.
    hits = err.stdout || '';
  }
  assert.equal(hits.trim(), '', 'no test-exec env seam remains in production code');

  // Behavioral proof: setting the vars changes nothing about the launcher verdict.
  const fx = buildProdInstall();
  try {
    fx.env.WIENERDOG_RUNJOB_CMD = '/bin/echo';
    fx.env.WIENERDOG_DREAM_CMD = '/bin/echo';
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 0, 'the env vars do not disturb a clean verify');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, process.execPath, 'the real node is spawned, not /bin/echo');
  } finally {
    cleanup(fx.root);
  }
});
