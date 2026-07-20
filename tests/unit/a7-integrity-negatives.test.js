'use strict';

// WP-158 — the DETERMINISTIC A7 integrity negatives (run in `npm test`, no
// scenario gating, no model quota). Each tamper drives the REAL launcher / pin /
// catch-up path with a recording fake spawn and asserts a refusal with ZERO
// recorded app/model launches. Case 0 is the non-vacuity control: the clean
// fixture DOES record exactly one intended spawn, so every "zero spawn" below is
// meaningful.
//
// NON-VACUITY (WP-082 canary class — the whole point of the fix pass). The tamper
// matrix is the ONE shared list in fixtures/cases.js (also consumed by the gated
// runner). Every launcher case asserts the DISTINCT reason only the guard it
// isolates emits, so deleting that guard changes the reason (or reaches a spawn)
// and the case goes red. The guard→case map is spot-checked by deleting a
// representative guard and confirming red (see the PR/report).
//
// Honest boundary (mirrored from the spec): this proves the SCOPED-WRITE
// negatives (config.yaml / app tree / ~/.local/bin / pins) and the drift-
// detection positives. It does NOT assert protection against an actor who
// overwrites the launcher file itself or the OS entry — that is A12's territory.

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
const { spawnPinnedSync, createPins } = require('../../src/core/exec-identity');
const { WienerdogError } = require('../../src/core/errors');
const vendor = require('../../src/core/vendor');
const descriptorMod = require('../../src/scheduler/descriptor');
const jobsLib = require('../../src/scheduler/jobs');
const runJobLib = require('../../src/cli/run-job');
const {
  buildProdInstall,
  buildDevInstall,
  writeFakeExec,
  writePinStore,
  plantInterpreterHijack,
  stubForeignOwner,
  recordingSpawn,
  cleanup,
  prodSourceV2,
} = require('../scenarios/a7-integrity/fixtures/build');
const { launcherCases, catchupCases } = require('../scenarios/a7-integrity/fixtures/cases');

/** Drive launcher.main for the dream job with a recording spawn; return
 *  {code, calls, alerts}. Silences stderr. */
function runLauncher(fx, descriptorPath, digest, env) {
  const { spawn, calls } = recordingSpawn();
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  let code;
  try {
    code = launcher.main(['dream', '--descriptor', descriptorPath || fx.descriptorPath, '--expect-digest', digest || fx.digest], {
      env: env || fx.env,
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

// ── The shared launcher tamper matrix (F18/F19/F23 + R15 digest fields) ─────
// One test per case. Each refuse case asserts the SPECIFIC guard reason so it
// fails if the guard it isolates is deleted; each positive case asserts exactly
// one spawn (+ its extra check).

for (const c of launcherCases()) {
  const opts = c.skipWin32 ? { skip: process.platform === 'win32' } : {};
  test(`a7-integrity-negatives: [${c.id}] ${c.title} (isolates: ${c.guard})`, opts, () => {
    const fx = c.stance === 'dev' ? buildDevInstall() : buildProdInstall();
    try {
      const ov = c.mutate(fx) || {};
      const { code, calls, alerts } = runLauncher(fx, null, null, ov.env);
      if (c.refuse) {
        assert.equal(code, 1, `${c.id}: launcher refuses`);
        assert.equal(calls.length, 0, `${c.id}: ZERO spawn`);
        assert.match(alerts, c.reasonRe, `${c.id}: the "${c.guard}" guard's DISTINCT reason (non-vacuity)`);
      } else {
        assert.equal(code, 0, `${c.id}: positive path runs`);
        assert.equal(calls.length, 1, `${c.id}: exactly one spawn`);
        if (c.boundHome) {
          // R4:#2 — a hostile ambient HOME does not move the child's config/
          // credential root; the launcher re-asserts the DIGEST-BOUND home.
          const childHome = calls[0].opts && calls[0].opts.env && calls[0].opts.env.HOME;
          assert.equal(childHome, fx.env.HOME, `${c.id}: child HOME is the bound home, not the hostile one`);
          assert.notEqual(childHome, '/tmp/hostile-home-does-not-exist');
        }
      }
    } finally {
      cleanup(fx.root);
    }
  });
}

// ── Pin structural failures stop pre-spawn (bullet 5 + R2:F1 + F22) ─────────

test('a7-integrity-negatives: (5) a fake claude planted earlier on PATH is never resolved (pin drift throws)', () => {
  const fx = buildProdInstall();
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-evilbin-'));
  try {
    const marker = path.join(fx.root, 'PLANT_RAN');
    writeFakeExec(evilDir, 'claude', `touch "${marker}"`);
    const jobEnv = { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` };
    assert.throws(
      () => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }),
      (err) => err instanceof WienerdogError && /wienerdog sync/.test(err.message)
    );
    assert.equal(fs.existsSync(marker), false, 'the planted fake never executed');
  } finally {
    cleanup(fx.root);
    cleanup(evilDir);
  }
});

test('a7-integrity-negatives: (6a) repointing the pinned claude outside its install dir ⇒ throws pre-spawn', { skip: process.platform === 'win32' }, () => {
  const fx = buildProdInstall();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-out-'));
  try {
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

test('a7-integrity-negatives: (6d) a FOREIGN-OWNER pinned target ⇒ throws pre-spawn (F22, owner-uid guard)', { skip: process.platform === 'win32' }, () => {
  const fx = buildProdInstall();
  const restore = stubForeignOwner(fx.fakeClaude); // deterministic foreign st.uid — no root needed
  try {
    const jobEnv = { ...fx.env, PATH: fx.pinBin };
    assert.throws(
      () => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }),
      WienerdogError,
      'a pinned target owned by another uid is refused before any spawn'
    );
  } finally {
    restore();
    cleanup(fx.root);
  }
});

test('a7-integrity-negatives: (6e) a PARTIAL pin store (git, no claude) ⇒ a planted claude never resolves (R2:F1)', () => {
  const fx = buildProdInstall();
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-partial-'));
  try {
    // Overwrite the store with a valid partial: git only, no claude.
    writePinStore(fx.paths, { git: fx.fakeGit });
    const marker = path.join(fx.root, 'PARTIAL_PLANT_RAN');
    writeFakeExec(evilDir, 'claude', `touch "${marker}"`);
    const jobEnv = { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` };
    assert.throws(
      () => spawnPinnedSync('claude', fx.paths, { env: jobEnv, platform: process.platform }),
      WienerdogError,
      'a present store missing the requested pin fails closed (no live-resolve of the plant)'
    );
    assert.equal(fs.existsSync(marker), false, 'the planted claude never executed');
  } finally {
    cleanup(fx.root);
    cleanup(evilDir);
  }
});

// ── Interpreter hijack closed by ENCAPSULATION (R10–R13) — zero execution ────

test('a7-integrity-negatives: (I1) non-node env-shebang + planted interpreter ⇒ spawnPinnedSync throws, ZERO execution (fire site)', () => {
  const fx = buildProdInstall();
  const h = plantInterpreterHijack(fx);
  try {
    assert.throws(
      () => spawnPinnedSync('claude', fx.paths, { env: h.jobEnv, platform: process.platform, args: ['--version'] }),
      WienerdogError,
      'a PATH-resolving non-node interpreter is refused before any spawn'
    );
    assert.equal(fs.existsSync(h.marker), false, 'the planted interpreter recorded ZERO executions at the fire site');
  } finally {
    cleanup(fx.root);
    cleanup(h.evilDir);
  }
});

test('a7-integrity-negatives: (I2) same hijack ⇒ createPins records ZERO execution (pin-creation site, mirrors the exec canary)', () => {
  const fx = buildProdInstall();
  const h = plantInterpreterHijack(fx);
  try {
    // Fresh pin creation over the planted interpreter: the plant must not run at
    // pin-build time either (createPins/dryRun route through bindInterpreter).
    fs.rmSync(path.join(fx.paths.state, 'exec-pins.json'), { force: true });
    const r = createPins(fx.paths, { env: h.jobEnv, platform: process.platform, dryRun: true });
    assert.equal(fs.existsSync(h.marker), false, 'the planted interpreter recorded ZERO executions at pin creation');
    assert.ok(
      r.notices.some((n) => /unsupported interpreter|not pinned/.test(n)),
      'claude is refused (unsupported interpreter), never a partial that ran the plant'
    );
  } finally {
    cleanup(fx.root);
    cleanup(h.evilDir);
  }
});

// ── Manifest+config rewrite cannot defeat the unchanged entry digest (F20) ──

test('a7-integrity-negatives: (4) rewriting config + a REAL manifest but NOT the entry digest still refuses', () => {
  const fx = buildProdInstall();
  try {
    // The install wrote a REAL install-manifest.json; tamper it for real (not a
    // swallowed ENOENT) plus a config drift.
    const manifestPath = fx.paths.manifest;
    const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(before.entries.length > 0, 'a real manifest with entries exists (not ENOENT)');
    jobsLib.saveJob(fx.paths, { name: 'dream', at: '03:30', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 20 });
    before.entries.push({ kind: 'file', path: path.join(fx.paths.state, 'decoy.json') });
    fs.writeFileSync(manifestPath, JSON.stringify(before, null, 2));
    // Prove the manifest tamper actually landed (kills the "degenerates to case 1"
    // mutation where the manifest half is a no-op).
    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(after.entries.some((e) => e.path.endsWith('decoy.json')), 'the real manifest carries the decoy');
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 1);
    assert.equal(calls.length, 0, 'the independent entry digest is unchanged ⇒ refuse');
  } finally {
    cleanup(fx.root);
  }
});

// ── Update atomicity: interrupted retains prior; completed switches (F21) ────

test('a7-integrity-negatives: (7a) an interrupted re-vendor (crash after staging) leaves the prior valid current verifying + runnable', () => {
  const fx = buildProdInstall();
  try {
    const before = fs.realpathSync(fx.corePaths.appCurrent);
    // A valid different-version v2 source so vendorSelf reaches staging, then
    // crash the atomic publish (renameSync of the staging dir) — interruption
    // AFTER staging begins, not before readVersion.
    const realRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (String(from).includes('.staging.')) throw new Error('interrupted publish (simulated crash)');
      return realRename(from, to);
    };
    try {
      assert.throws(() => vendor.vendorSelf(fx.paths, { sourceRoot: prodSourceV2(), env: {} }));
    } finally {
      fs.renameSync = realRename;
    }
    assert.equal(fs.realpathSync(fx.corePaths.appCurrent), before, 'current still points at the prior valid version');
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 0, 'the prior version still verifies and runs');
    assert.equal(calls.length, 1);
  } finally {
    cleanup(fx.root);
  }
});

test('a7-integrity-negatives: (7b) a COMPLETED re-vendor switches current, re-binds the entry digest, and verifies (positive)', () => {
  const fx = buildProdInstall();
  try {
    const before = fs.realpathSync(fx.corePaths.appCurrent);
    vendor.vendorSelf(fx.paths, { sourceRoot: prodSourceV2(), env: {} });
    const after = fs.realpathSync(fx.corePaths.appCurrent);
    assert.notEqual(after, before, 'current switched to the new version');
    // Re-bind: write the new descriptor + digest (what `sync` does after a vendor).
    const dreamJob = jobsLib.findJob(fx.paths, 'dream');
    const rebound = descriptorMod.writeDescriptor(fx.paths, dreamJob, { env: fx.env });
    const { code, calls } = runLauncher(fx, rebound.path, rebound.digest);
    assert.equal(code, 0, 'the re-bound install verifies and runs');
    assert.equal(calls.length, 1, 'exactly one spawn after the completed switch');
  } finally {
    cleanup(fx.root);
  }
});

// ── Catch-up per-job authorization (WP-catchup-per-job-authorization + R4/R5) ────────────────────

for (const c of catchupCases()) {
  test(`a7-integrity-negatives: [${c.id}] ${c.title}`, async () => {
    const fx = buildProdInstall();
    try {
      const spec = c.build(fx);
      /** @type {string[]} */ const runs = [];
      await runJobLib.catchUp(fx.paths, {
        platform: 'darwin', // the base64url map path is macOS + Windows (R8:#2)
        now: new Date('2035-06-15T12:00:00Z'), // 03:30 already passed, no last_success ⇒ overdue
        jobDigests: spec.jobDigests,
        runJob: async (_p, job) => {
          runs.push(job.name);
        },
        sendAlert: () => {},
      });
      // Durable alerts land in state/alerts.jsonl (append-only, code-owned).
      let durable = [];
      try {
        durable = fs
          .readFileSync(path.join(fx.paths.state, 'alerts.jsonl'), 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l).job);
      } catch {
        durable = [];
      }
      assert.deepEqual(runs.sort(), spec.expectRuns.slice().sort(), `${c.id}: RUN set (zero spawn where refused)`);
      assert.deepEqual(durable.sort(), spec.expectAlerts.slice().sort(), `${c.id}: durable ALERT set (union-authorize, not silent suppression)`);
    } finally {
      cleanup(fx.root);
    }
  });
}

// ── WP-155 cross-check — the deleted test-exec / date / timeout seams ────────

test('a7-integrity-negatives: (8) deleted env seams have no effect (WIENERDOG_RUNJOB_CMD/DREAM_CMD/FAKE_TODAY/RUNJOB_TIMEOUT_MS)', () => {
  // Source-level proof: none of the deleted seam names exists anywhere in src/.
  const { execFileSync } = require('node:child_process');
  const repoRoot = path.resolve(__dirname, '..', '..');
  let hits = '';
  try {
    hits = execFileSync(
      'grep',
      ['-rnE', 'WIENERDOG_RUNJOB_CMD|WIENERDOG_DREAM_CMD|WIENERDOG_FAKE_TODAY|WIENERDOG_RUNJOB_TIMEOUT_MS', 'src/'],
      { cwd: repoRoot, encoding: 'utf8' }
    );
  } catch (err) {
    hits = err.stdout || ''; // grep exit 1 (no matches) ⇒ empty stdout = success
  }
  assert.equal(hits.trim(), '', 'no test-exec / date / timeout env seam remains in production code');

  // Behavioral proof: setting the vars changes nothing about the launcher verdict.
  const fx = buildProdInstall();
  try {
    fx.env.WIENERDOG_RUNJOB_CMD = '/bin/echo';
    fx.env.WIENERDOG_DREAM_CMD = '/bin/echo';
    fx.env.WIENERDOG_FAKE_TODAY = '2000-01-01';
    fx.env.WIENERDOG_RUNJOB_TIMEOUT_MS = '1';
    const { code, calls } = runLauncher(fx);
    assert.equal(code, 0, 'the env vars do not disturb a clean verify');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, process.execPath, 'the real node is spawned, not /bin/echo');
  } finally {
    cleanup(fx.root);
  }
});
