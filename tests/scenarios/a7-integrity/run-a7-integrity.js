#!/usr/bin/env node
'use strict';

// WP-158 — the A7 end-to-end integrity containment proof (audit A7, part 5 of
// 6). It drives the REAL out-of-tree launcher / pin path against each tamper in
// the A7 matrix with a RECORDING fake spawn, asserting zero model/app launch (or
// the correct pre-spawn throw) on every tamper and exactly one intended launch
// on the clean baseline (non-vacuity control, à la WP-133/142).
//
// This proof opens NO gate: `wienerdog safety` stays all-BLOCKED — the harness
// only observes refusals. It spends NO model quota (the "spawn" is a recorder),
// never writes the maintainer's real config, and never touches the real OS
// scheduler (disposable temp $HOME/WIENERDOG_HOME, removed in finally).
//
// Gating (WP-023/133/142): refuses to run unless WIENERDOG_RUN_SCENARIOS=1
// (else skip + exit 0). The DETERMINISTIC negatives also run in `npm test` via
// tests/unit/a7-integrity-negatives.test.js (no gating, same builders).
//
// Honest boundary: this proves the SCOPED-WRITE negatives (config.yaml /
// app/current / ~/.local/bin) and the drift-detection positives. It does NOT
// assert protection against an actor who overwrites the launcher file itself
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
const { resolvePinnedSpawn } = require(path.join(REPO_ROOT, 'src/core/exec-identity'));
const {
  buildProdInstall,
  writeFakeExec,
  poisonConfig,
  recordingSpawn,
  cleanup,
} = require('./fixtures/build');

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

/** Run the launcher for the dream job with a recorder; return {code, calls}. */
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
  return { code, calls };
}

/** Run one tamper case with a fresh install; auto-cleanup. */
function withInstall(fn) {
  const fx = buildProdInstall();
  try {
    fn(fx);
  } finally {
    cleanup(fx.root);
  }
}

process.stdout.write('A7 integrity containment proof (WIENERDOG_RUN_SCENARIOS=1)\n\n');

// Case 0 — non-vacuity baseline.
process.stdout.write('[0] non-vacuity baseline\n');
withInstall((fx) => {
  const { code, calls } = runLauncher(fx);
  check(code === 0 && calls.length === 1, 'clean fixture records exactly one intended run-job spawn');
});

// Case 1 — config authorized-field rewrites (run / model / timeout).
process.stdout.write('[1] config authorized-field rewrites ⇒ mismatch, zero spawn\n');
for (const [field, value] of [
  ['run', 'skill:wienerdog-weekly-review'],
  ['dream_model', 'opus'],
  ['dream_timeout_minutes', '5'],
]) {
  withInstall((fx) => {
    poisonConfig(fx.paths, fx.root, field, value);
    const { code, calls } = runLauncher(fx);
    check(code === 1 && calls.length === 0, `${field} rewrite refuses with zero spawn`);
  });
}

// Case 2 — app mutation / repoint / out-of-root.
process.stdout.write('[2] app mutation / repoint / out-of-root ⇒ zero spawn\n');
withInstall((fx) => {
  const target = fs.realpathSync(fx.corePaths.appCurrent);
  const f = path.join(target, 'package.json');
  try {
    fs.chmodSync(f, 0o644);
  } catch {
    /* ignore */
  }
  fs.appendFileSync(f, '\n// tampered\n');
  const { code, calls } = runLauncher(fx);
  check(code === 1 && calls.length === 0, 'app byte mutation refuses with zero spawn');
});
if (process.platform !== 'win32') {
  withInstall((fx) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-evil-'));
    try {
      fs.mkdirSync(path.join(outside, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(outside, 'bin', 'wienerdog.js'), '// evil\n');
      fs.writeFileSync(path.join(outside, 'package.json'), '{"version":"9.9.9"}\n');
      fs.rmSync(fx.corePaths.appCurrent, { force: true });
      fs.symlinkSync(outside, fx.corePaths.appCurrent);
      const { code, calls } = runLauncher(fx);
      check(code === 1 && calls.length === 0, 'current escaping <core>/app refuses with zero spawn');
    } finally {
      cleanup(outside);
    }
  });
}

// Case 3 — prod/dev stance downgrade.
process.stdout.write('[3] planted .git prod→dev downgrade ⇒ refuse, zero spawn\n');
withInstall((fx) => {
  fs.mkdirSync(path.join(fs.realpathSync(fx.corePaths.appCurrent), '.git'));
  const { code, calls } = runLauncher(fx);
  check(code === 1 && calls.length === 0, 'prod entry over a dev-looking tree refuses, no silent downgrade');
});

// Case 4 — manifest+config rewrite cannot defeat the unchanged entry digest.
process.stdout.write('[4] manifest+config rewrite cannot defeat the entry digest\n');
withInstall((fx) => {
  poisonConfig(fx.paths, fx.root, 'run', 'skill:wienerdog-weekly-review');
  const { code, calls } = runLauncher(fx);
  check(code === 1 && calls.length === 0, 'unchanged --expect-digest still refuses the drifted state');
});

// Case 5 — fake claude earlier on PATH never executes.
process.stdout.write('[5] fake claude earlier on PATH never resolves\n');
withInstall((fx) => {
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-evilbin-'));
  try {
    writeFakeExec(evilDir, 'claude', 'echo pwned');
    let threw = false;
    try {
      resolvePinnedSpawn('claude', fx.paths, { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` }, process.platform);
    } catch {
      threw = true;
    }
    check(threw, 'pin drift throws — the planted fake is never resolved');
  } finally {
    cleanup(evilDir);
  }
});

// Case 6 — pinned executable structural failures.
process.stdout.write('[6] pinned executable structural failures ⇒ throw pre-spawn\n');
if (process.platform !== 'win32') {
  withInstall((fx) => {
    fs.chmodSync(fx.fakeClaude, 0o644);
    let threw = false;
    try {
      resolvePinnedSpawn('claude', fx.paths, { ...fx.env, PATH: fx.pinBin }, process.platform);
    } catch {
      threw = true;
    }
    check(threw, 'cleared exec bit throws pre-spawn');
  });
  withInstall((fx) => {
    fs.chmodSync(fx.pinBin, 0o777);
    let threw = false;
    try {
      resolvePinnedSpawn('claude', fx.paths, { ...fx.env, PATH: fx.pinBin }, process.platform);
    } catch {
      threw = true;
    }
    check(threw, 'group/other-writable ancestor throws pre-spawn');
  });
}

// Case 7 — interrupted update retains the prior valid current.
process.stdout.write('[7] interrupted update retains the prior valid current\n');
withInstall((fx) => {
  const before = fs.realpathSync(fx.corePaths.appCurrent);
  const vendor = require(path.join(REPO_ROOT, 'src/core/vendor'));
  const origCp = fs.cpSync;
  fs.cpSync = () => {
    throw new Error('disk full mid-copy');
  };
  try {
    vendor.vendorSelf(fx.paths, { sourceRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-v2-')), env: {} });
  } catch {
    /* expected */
  } finally {
    fs.cpSync = origCp;
  }
  const { code, calls } = runLauncher(fx);
  check(
    fs.realpathSync(fx.corePaths.appCurrent) === before && code === 0 && calls.length === 1,
    'the prior version still verifies and runs after an interrupted update'
  );
});

process.stdout.write(`\n${failures === 0 ? 'PASS' : `FAIL (${failures} failure(s))`}\n`);
process.exit(failures === 0 ? 0 : 1);
