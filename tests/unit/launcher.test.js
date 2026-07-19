'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const launcher = require('../../src/scheduler/launcher');
const vendor = require('../../src/core/vendor');
const descriptorMod = require('../../src/scheduler/descriptor');
const { getPaths } = require('../../src/core/paths');
const jobsLib = require('../../src/scheduler/jobs');

const DREAM_JOB = { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 };

/** Inlined core paths (what the launcher computes from env). */
function corePathsOf(paths) {
  return {
    core: paths.core,
    state: paths.state,
    appDir: path.join(paths.core, 'app'),
    appCurrent: path.join(paths.core, 'app', 'current'),
  };
}

/**
 * A fully-wired temp install: a REAL vendored prod app tree (the running package
 * copied to <core>/app/<version>), a config with a vault, exec pins, a saved
 * dream job, and a written descriptor. Returns the inlined core paths the
 * launcher uses plus the descriptor path + its digest (the entry-bound anchor).
 */
/** A .git-free copy of the running package → prod vendoring (the real repo has
 *  a .git, which would make vendorSelf pick dev mode). Copied once, reused. */
let PROD_SOURCE = null;
function prodSource() {
  if (PROD_SOURCE) return PROD_SOURCE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-src-'));
  vendor.copyTree(vendor.packageRoot(), dir); // bin/src/skills/templates/package.json, no .git
  PROD_SOURCE = dir;
  return dir;
}

function setupProd() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(root, 'vault')}\n`);
  vendor.vendorSelf(paths, { sourceRoot: prodSource(), env: {} }); // no .git → prod stance
  fs.writeFileSync(
    path.join(paths.state, 'exec-pins.json'),
    JSON.stringify({
      schema: 1,
      pins: {
        claude: { commandPath: '/x/bin/claude', installDir: '/x/share/claude', version: '9', pinnedAt: 't' },
        git: { commandPath: '/usr/bin/git', installDir: '/usr/bin', version: 'g', pinnedAt: 't' },
      },
    }),
    { mode: 0o600 }
  );
  jobsLib.saveJob(paths, DREAM_JOB);
  const { path: descriptorPath, digest } = descriptorMod.writeDescriptor(paths, DREAM_JOB, { env });
  return { root, env, paths, corePaths: corePathsOf(paths), descriptorPath, digest };
}

test('launcher: verifyAndResolve accepts a valid prod install and resolves the run-job spawn', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.command, process.execPath);
  assert.equal(r.args[0], path.join(fs.realpathSync(path.join(paths.core, 'app', 'current')), 'bin', 'wienerdog.js'));
  assert.deepEqual(r.args.slice(1), ['run-job', 'dream']);
});

test('launcher: a config run-action rewrite makes the re-derived digest diverge ⇒ refuse (A7 bullet 1)', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  // F1: flip the job's run action in config.yaml WITHOUT re-syncing — the OS
  // entry's --expect-digest is unchanged, so the re-derivation diverges.
  jobsLib.saveJob(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' });
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /descriptor changed since it was scheduled/);
});

test('launcher: an app byte mutation ⇒ refuse (A7 bullet 2)', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const f = path.join(target, 'package.json');
  try {
    fs.chmodSync(f, 0o644); // undo the read-only publish so we can mutate it
  } catch {
    /* ignore */
  }
  fs.appendFileSync(f, '\n// tampered\n');
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /app tree does not match the descriptor/);
});

test('launcher: repointing current OUT of <core>/app ⇒ refuse (A7 bullet 2)', { skip: process.platform === 'win32' }, () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-evil-'));
  fs.mkdirSync(path.join(outside, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(outside, 'bin', 'wienerdog.js'), '// evil\n');
  fs.writeFileSync(path.join(outside, 'package.json'), '{"version":"9.9.9"}\n');
  fs.rmSync(path.join(paths.core, 'app', 'current'), { force: true });
  fs.symlinkSync(outside, path.join(paths.core, 'app', 'current'));
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /does not resolve inside|app tree does not match/);
});

test('launcher: a wrong entry-bound expect-digest ⇒ refuse (A7 bullet 3: config+manifest cannot defeat the anchor)', () => {
  const { env, corePaths, descriptorPath } = setupProd();
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: 'sha256:not-the-real-digest', env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /descriptor changed since it was scheduled/);
});

test('launcher: a prod descriptor over a dev-looking tree (planted .git) ⇒ refuse, no silent downgrade', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  fs.mkdirSync(path.join(target, '.git')); // downgrade attempt
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /looks like a dev checkout/);
});

test('launcher: a missing descriptor ⇒ refuse', () => {
  const { env, corePaths, digest } = setupProd();
  const r = launcher.verifyAndResolve(corePaths, 'dream', {
    descriptorPath: '/no/such/descriptor.json',
    expectDigest: digest,
    env,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing or unreadable/);
});

test('launcher: main refuses on drift — appends a durable alert, exits non-zero, spawns NOTHING', () => {
  const { env, descriptorPath, digest, paths } = setupProd();
  jobsLib.saveJob(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' }); // drift
  let spawned = false;
  let code = null;
  const argv = ['dream', '--descriptor', descriptorPath, '--expect-digest', digest];
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  try {
    code = launcher.main(argv, {
      env,
      platform: process.platform,
      spawn: () => {
        spawned = true;
        return { status: 0 };
      },
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(spawned, false, 'no app/model spawn on refuse');
  assert.equal(code, 1, 'non-zero exit');
  const alerts = fs.readFileSync(path.join(paths.state, 'alerts.jsonl'), 'utf8');
  assert.match(alerts, /refusing to run/);
  assert.match(alerts, /integrity mismatch/);
  assert.equal(JSON.parse(alerts.trim()).job, 'dream', 'the alert is attributed to the dream job');
});

test('launcher: main on a valid install spawns exactly the run-job child and returns its code', () => {
  const { env, descriptorPath, digest } = setupProd();
  const calls = [];
  const argv = ['dream', '--descriptor', descriptorPath, '--expect-digest', digest];
  const code = launcher.main(argv, {
    env,
    platform: process.platform,
    spawn: (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    },
    exit: () => {},
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1, 'exactly one spawn');
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args.slice(1), ['run-job', 'dream']);
  assert.ok(calls[0].args[0].endsWith(path.join('bin', 'wienerdog.js')), calls[0].args[0]);
});

test('launcher: verifyCatchup verifies the app tree against the bound digest, refuses on mutation', () => {
  const { env, corePaths, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const treeDigest = launcher.appTreeDigestOf(target);
  const ok = launcher.verifyCatchup(corePaths, treeDigest, env, process.platform);
  assert.equal(ok.ok, true, ok.reason);
  assert.deepEqual(ok.args.slice(1), ['run-job', '--catch-up']);

  const wrong = launcher.verifyCatchup(corePaths, 'sha256:nope', env, process.platform);
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /does not match the scheduled digest/);
});

test('launcher: the inlined appTreeDigest matches descriptor.js byte-for-byte (determinism guard)', () => {
  const { paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  // The launcher's inlined hash MUST equal descriptor.js's — the entry-bound
  // digest was produced by descriptor.js, so any drift between the two would
  // make every dream refuse. This test fails loudly if they diverge.
  assert.equal(launcher.appTreeDigestOf(target), descriptorMod.appTreeDigest(paths));
});

test('launcher: a dev install runs on stance match (descriptor dev + live dev)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-dev-'));
  // A small fake dev checkout (a `.git` dir marks it dev) — fast, and the dev
  // path never walks/re-requires the tree, so a minimal source suffices.
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-devsrc-'));
  fs.mkdirSync(path.join(checkout, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(checkout, '.git'));
  fs.writeFileSync(path.join(checkout, 'bin', 'wienerdog.js'), '// dev bin\n');
  fs.writeFileSync(path.join(checkout, 'package.json'), '{"version":"0.0.0-dev"}\n');

  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(root, 'vault')}\n`);
  vendor.vendorSelf(paths, { sourceRoot: checkout, env }); // .git → dev: current → the checkout
  jobsLib.saveJob(paths, DREAM_JOB);
  const { path: descriptorPath, digest } = descriptorMod.writeDescriptor(paths, DREAM_JOB, { env });
  const r = launcher.verifyAndResolve(corePathsOf(paths), 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.args.slice(1), ['run-job', 'dream']);
});
