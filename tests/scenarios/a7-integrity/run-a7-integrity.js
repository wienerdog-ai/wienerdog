#!/usr/bin/env node
'use strict';

// WP-158 — the A7 end-to-end integrity containment proof (audit A7, part 5 of
// 6). It drives the REAL out-of-tree launcher / pin / catch-up path against each
// tamper in the A7 matrix with a RECORDING fake spawn, asserting zero model/app
// launch (or the correct pre-spawn throw) on every tamper and exactly one
// intended launch on the clean baseline (non-vacuity control, à la WP-133/142).
//
// ONE authoritative tamper list (F23): this runner and the deterministic unit
// negatives (tests/unit/a7-integrity-negatives.test.js) import the SAME
// fixtures/cases.js — they cannot drift. Every launcher case asserts the DISTINCT
// reason only the guard it isolates emits, so the harness fails if that guard is
// deleted (non-vacuity — the WP-082 canary class this fix pass closes).
//
// This proof opens NO gate: `wienerdog safety` stays all-BLOCKED. It spends NO
// model quota (the "spawn" is a recorder), never writes the maintainer's real
// config, and never touches the real OS scheduler (disposable temp
// $HOME/WIENERDOG_HOME, removed in finally).
//
// Honest boundary: this proves the SCOPED-WRITE negatives (config.yaml /
// app/current / ~/.local/bin / pins) and the drift-detection positives. It does
// NOT assert protection against an actor who overwrites the launcher file itself
// (<core>/launcher/launch.js) or rewrites the OS scheduler entry — A12's
// territory, not A7's.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.env.WIENERDOG_RUN_SCENARIOS !== '1') {
  process.stdout.write('A7 integrity containment proof: SKIPPED (set WIENERDOG_RUN_SCENARIOS=1 to run)\n');
  process.exit(0);
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const launcher = require(path.join(REPO_ROOT, 'src/scheduler/launcher'));
// WP-154 R13/R15: resolvePinnedSpawn is module-INTERNAL now — drive the
// encapsulated public exec API. A drift/tamper/verify-failure THROWS inside
// spawnPinnedSync BEFORE any spawn, so the fail-safe refusal is still asserted.
const { spawnPinnedSync, createPins } = require(path.join(REPO_ROOT, 'src/core/exec-identity'));
const { WienerdogError } = require(path.join(REPO_ROOT, 'src/core/errors'));
const vendor = require(path.join(REPO_ROOT, 'src/core/vendor'));
const descriptorMod = require(path.join(REPO_ROOT, 'src/scheduler/descriptor'));
const jobsLib = require(path.join(REPO_ROOT, 'src/scheduler/jobs'));
const runJobLib = require(path.join(REPO_ROOT, 'src/cli/run-job'));
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
} = require('./fixtures/build');
const { launcherCases, catchupCases } = require('./fixtures/cases');

let failures = 0;
/** @param {boolean} cond @param {string} msg */
function check(cond, msg) {
  if (cond) {
    process.stdout.write(`  ok   ${msg}\n`);
  } else {
    failures += 1;
    process.stdout.write(`  FAIL ${msg}\n`);
  }
}

/** Run the launcher for the dream job with a recorder; return {code, calls, alerts}. */
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

process.stdout.write('A7 integrity containment proof (WIENERDOG_RUN_SCENARIOS=1)\n\n');

// Case 0 — non-vacuity baseline.
process.stdout.write('[0] non-vacuity baseline\n');
{
  const fx = buildProdInstall();
  try {
    const { code, calls } = runLauncher(fx);
    check(code === 0 && calls.length === 1, 'clean fixture records exactly one intended run-job spawn');
  } finally {
    cleanup(fx.root);
  }
}

// The shared launcher tamper matrix (config-field drift + guard isolation +
// hostile-HOME + dev-stance). Each case asserts the SPECIFIC guard reason.
process.stdout.write('[L] launcher tamper matrix (shared with the unit negatives)\n');
for (const c of launcherCases()) {
  if (c.skipWin32 && process.platform === 'win32') continue;
  const fx = c.stance === 'dev' ? buildDevInstall() : buildProdInstall();
  try {
    const ov = c.mutate(fx) || {};
    const { code, calls, alerts } = runLauncher(fx, null, null, ov.env);
    if (c.refuse) {
      check(
        code === 1 && calls.length === 0 && c.reasonRe.test(alerts),
        `[${c.id}] ${c.title} — refuse+zero-spawn, isolates "${c.guard}"`
      );
    } else if (c.boundHome) {
      const childHome = calls[0] && calls[0].opts && calls[0].opts.env && calls[0].opts.env.HOME;
      check(code === 0 && calls.length === 1 && childHome === fx.env.HOME, `[${c.id}] ${c.title} — bound home re-asserted, runs`);
    } else {
      check(code === 0 && calls.length === 1, `[${c.id}] ${c.title} — positive path runs`);
    }
  } finally {
    cleanup(fx.root);
  }
}

// Pin structural failures (bullet 5 + R2:F1 + F22) — spawnPinnedSync throws pre-spawn.
process.stdout.write('[P] pinned-executable structural failures ⇒ throw pre-spawn, zero execution\n');
{
  const fx = buildProdInstall();
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-evilbin-'));
  try {
    const marker = path.join(fx.root, 'PLANT_RAN');
    writeFakeExec(evilDir, 'claude', `touch "${marker}"`);
    let threw = false;
    try {
      spawnPinnedSync('claude', fx.paths, { env: { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` }, platform: process.platform });
    } catch (err) {
      threw = err instanceof WienerdogError;
    }
    check(threw && !fs.existsSync(marker), '[5] a fake claude earlier on PATH throws — the plant never runs');
  } finally {
    cleanup(fx.root);
    cleanup(evilDir);
  }
}
if (process.platform !== 'win32') {
  // 6a repoint outside install dir.
  {
    const fx = buildProdInstall();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-out-'));
    try {
      const evil = writeFakeExec(tmpDir, 'evil');
      fs.rmSync(fx.fakeClaude, { force: true });
      fs.symlinkSync(evil, fx.fakeClaude);
      let threw = false;
      try {
        spawnPinnedSync('claude', fx.paths, { env: { ...fx.env, PATH: fx.pinBin }, platform: process.platform });
      } catch (err) {
        threw = err instanceof WienerdogError;
      }
      check(threw, '[6a] pinned claude symlinked outside its install dir throws pre-spawn');
    } finally {
      cleanup(fx.root);
      cleanup(tmpDir);
    }
  }
  // 6b cleared exec bit.
  {
    const fx = buildProdInstall();
    try {
      fs.chmodSync(fx.fakeClaude, 0o644);
      let threw = false;
      try {
        spawnPinnedSync('claude', fx.paths, { env: { ...fx.env, PATH: fx.pinBin }, platform: process.platform });
      } catch (err) {
        threw = err instanceof WienerdogError;
      }
      check(threw, '[6b] cleared exec bit throws pre-spawn');
    } finally {
      cleanup(fx.root);
    }
  }
  // 6c group/other-writable ancestor.
  {
    const fx = buildProdInstall();
    try {
      fs.chmodSync(fx.pinBin, 0o777);
      let threw = false;
      try {
        spawnPinnedSync('claude', fx.paths, { env: { ...fx.env, PATH: fx.pinBin }, platform: process.platform });
      } catch (err) {
        threw = err instanceof WienerdogError;
      }
      check(threw, '[6c] group/other-writable ancestor throws pre-spawn');
    } finally {
      cleanup(fx.root);
    }
  }
  // 6d foreign owner (F22) — deterministic via a stubbed foreign st.uid.
  {
    const fx = buildProdInstall();
    const restore = stubForeignOwner(fx.fakeClaude);
    try {
      let threw = false;
      try {
        spawnPinnedSync('claude', fx.paths, { env: { ...fx.env, PATH: fx.pinBin }, platform: process.platform });
      } catch (err) {
        threw = err instanceof WienerdogError;
      }
      check(threw, '[6d] a FOREIGN-OWNER pinned target throws pre-spawn (owner-uid guard)');
    } finally {
      restore();
      cleanup(fx.root);
    }
  }
}
// 6e partial pin store (R2:F1).
{
  const fx = buildProdInstall();
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-partial-'));
  try {
    writePinStore(fx.paths, { git: fx.fakeGit }); // git only, no claude
    const marker = path.join(fx.root, 'PARTIAL_PLANT_RAN');
    writeFakeExec(evilDir, 'claude', `touch "${marker}"`);
    let threw = false;
    try {
      spawnPinnedSync('claude', fx.paths, { env: { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` }, platform: process.platform });
    } catch (err) {
      threw = err instanceof WienerdogError;
    }
    check(threw && !fs.existsSync(marker), '[6e] a partial store (git only) fails closed — a planted claude never runs');
  } finally {
    cleanup(fx.root);
    cleanup(evilDir);
  }
}

// Interpreter hijack closed by ENCAPSULATION (R10–R13) — zero execution.
process.stdout.write('[I] interpreter hijack ⇒ zero execution at every exec site\n');
{
  const fx = buildProdInstall();
  const h = plantInterpreterHijack(fx);
  try {
    let threw = false;
    try {
      spawnPinnedSync('claude', fx.paths, { env: h.jobEnv, platform: process.platform, args: ['--version'] });
    } catch (err) {
      threw = err instanceof WienerdogError;
    }
    check(threw && !fs.existsSync(h.marker), '[I1] non-node env-shebang + planted interp ⇒ throws, ZERO execution (fire)');
  } finally {
    cleanup(fx.root);
    cleanup(h.evilDir);
  }
}
{
  const fx = buildProdInstall();
  const h = plantInterpreterHijack(fx);
  try {
    fs.rmSync(path.join(fx.paths.state, 'exec-pins.json'), { force: true });
    const r = createPins(fx.paths, { env: h.jobEnv, platform: process.platform, dryRun: true });
    check(
      !fs.existsSync(h.marker) && r.notices.some((n) => /unsupported interpreter|not pinned/.test(n)),
      '[I2] createPins records ZERO execution over the planted interpreter (pin-creation site)'
    );
  } finally {
    cleanup(fx.root);
    cleanup(h.evilDir);
  }
}

// Manifest+config rewrite cannot defeat the unchanged entry digest (F20).
process.stdout.write('[4] manifest+config rewrite cannot defeat the entry digest\n');
{
  const fx = buildProdInstall();
  try {
    const manifestPath = fx.paths.manifest;
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    jobsLib.saveJob(fx.paths, { name: 'dream', at: '03:30', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 20 });
    m.entries.push({ kind: 'file', path: path.join(fx.paths.state, 'decoy.json') });
    fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
    const tampered = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).entries.some((e) => e.path.endsWith('decoy.json'));
    const { code, calls } = runLauncher(fx);
    check(tampered && code === 1 && calls.length === 0, 'a real manifest tamper + config drift still refuses (unchanged entry digest)');
  } finally {
    cleanup(fx.root);
  }
}

// Update atomicity — interrupted retains prior; completed switches + re-binds (F21).
process.stdout.write('[7] update atomicity — interrupted retains prior; completed switches\n');
{
  const fx = buildProdInstall();
  try {
    const before = fs.realpathSync(fx.corePaths.appCurrent);
    const realRename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (String(from).includes('.staging.')) throw new Error('interrupted publish (simulated crash)');
      return realRename(from, to);
    };
    let threw = false;
    try {
      vendor.vendorSelf(fx.paths, { sourceRoot: prodSourceV2(), env: {} });
    } catch {
      threw = true;
    } finally {
      fs.renameSync = realRename;
    }
    const r = runLauncher(fx);
    check(
      threw && fs.realpathSync(fx.corePaths.appCurrent) === before && r.code === 0 && r.calls.length === 1,
      '[7a] an interrupted re-vendor leaves the prior valid current verifying + runnable'
    );
  } finally {
    cleanup(fx.root);
  }
}
{
  const fx = buildProdInstall();
  try {
    const before = fs.realpathSync(fx.corePaths.appCurrent);
    vendor.vendorSelf(fx.paths, { sourceRoot: prodSourceV2(), env: {} });
    const after = fs.realpathSync(fx.corePaths.appCurrent);
    const dreamJob = jobsLib.findJob(fx.paths, 'dream');
    const rebound = descriptorMod.writeDescriptor(fx.paths, dreamJob, { env: fx.env });
    const r = runLauncher(fx, rebound.path, rebound.digest);
    check(after !== before && r.code === 0 && r.calls.length === 1, '[7b] a completed re-vendor switches current, re-binds the digest, verifies');
  } finally {
    cleanup(fx.root);
  }
}

// Catch-up per-job authorization (WP-catchup-per-job-authorization + R4/R5).
process.stdout.write('[C] catch-up per-job authorization (union-authorize, transport)\n');
(async () => {
  for (const c of catchupCases()) {
    const fx = buildProdInstall();
    try {
      const spec = c.build(fx);
      /** @type {string[]} */ const runs = [];
      await runJobLib.catchUp(fx.paths, {
        platform: 'darwin',
        now: new Date('2035-06-15T12:00:00Z'),
        jobDigests: spec.jobDigests,
        runJob: async (_p, job) => {
          runs.push(job.name);
        },
        sendAlert: () => {},
      });
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
      const okRuns = JSON.stringify(runs.slice().sort()) === JSON.stringify(spec.expectRuns.slice().sort());
      const okAlerts = JSON.stringify(durable.slice().sort()) === JSON.stringify(spec.expectAlerts.slice().sort());
      check(okRuns && okAlerts, `[${c.id}] ${c.title}`);
    } finally {
      cleanup(fx.root);
    }
  }

  // WP-155 cross-check: the deleted env seams have no effect.
  process.stdout.write('[8] WP-155 cross-check — deleted env seams have no effect\n');
  {
    const fx = buildProdInstall();
    try {
      Object.assign(fx.env, {
        WIENERDOG_RUNJOB_CMD: '/bin/echo',
        WIENERDOG_DREAM_CMD: '/bin/echo',
        WIENERDOG_FAKE_TODAY: '2000-01-01',
        WIENERDOG_RUNJOB_TIMEOUT_MS: '1',
      });
      const { code, calls } = runLauncher(fx);
      check(code === 0 && calls.length === 1 && calls[0].command === process.execPath, 'the deleted env seams do not disturb a clean verify');
    } finally {
      cleanup(fx.root);
    }
  }

  process.stdout.write(`\n${failures === 0 ? 'PASS' : `FAIL (${failures} failure(s))`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
