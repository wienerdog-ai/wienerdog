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

// T7(a) — converts the pre-WP-stance-authority-containment "planted .git ⇒
// refuse" test. The plant no longer needs refusing because it no longer selects
// anything: an EMPTY `.git` directory contributes zero pairs to appTreeDigestOf
// (only isFile() entries are pushed), so the tree digest is unchanged and the
// prod arm verifies exactly as before. Table B row 1.
test('launcher: a prod descriptor over a tree with a planted .git still VERIFIES — the plant selects nothing', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const before = launcher.appTreeDigestOf(target);
  fs.mkdirSync(path.join(target, '.git')); // the former downgrade attempt
  assert.equal(launcher.appTreeDigestOf(target), before, 'an empty .git dir is invisible to the app release digest');
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, true, 'the plant does not downgrade and does not refuse: ' + r.reason);
  assert.deepEqual(r.args.slice(1), ['run-job', 'dream']);
  assert.equal(launcher.liveStance(corePaths), 'prod', 'the LIVE stance is containment, not .git');
});

// T7(b) — AC5. Table B row 4, reason C1. The migration path for every descriptor
// minted under the old rule on a contained tree.
test('launcher: a dev-stance descriptor over a CONTAINED tree ⇒ refuse (C1), before any require from the app tree', () => {
  const { env, corePaths, descriptorPath, digest } = setupProd();
  const d = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  d.appRelease.stance = 'dev';
  fs.writeFileSync(descriptorPath, JSON.stringify(d));
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /authorized for a dev checkout but app\/current now resolves inside/);
  // The reason names the real <core>/app path, matching its live analogue C2.
  assert.ok(r.reason.includes(corePaths.appDir), 'the refusal interpolates the real appDir');
});

// T8 — AC8. The attack end to end, at unit level, through the REAL sync order:
// the vendorSelf CALL (required THROUGH app/current, so packageRoot() is the app
// tree exactly as the shim makes it) BEFORE the descriptor write.
test('launcher: plant .git + one attended sync ⇒ still prod, and an app-code tamper is refused with a durable C3 alert', () => {
  const { env, corePaths, paths } = setupProd();
  const app0 = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  fs.writeFileSync(path.join(app0, '.git'), 'gitdir: /elsewhere\n'); // 1. the A7-scoped write

  // 2. ONE attended `wienerdog sync`, in sync.js's own order.
  require(path.join(app0, 'src', 'core', 'vendor')).vendorSelf(paths, { env });
  const app = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const w = descriptorMod.writeDescriptor(paths, DREAM_JOB, { env });
  assert.equal(JSON.parse(fs.readFileSync(w.path, 'utf8')).appRelease.stance, 'prod', 'the plant did not downgrade the mint');

  // 3. tamper app CODE — a content change, so it MUST drift the tree digest.
  const f = path.join(app, 'src', 'core', 'errors.js');
  try { fs.chmodSync(f, 0o644); } catch { /* already writable */ }
  fs.appendFileSync(f, '\n// attacker payload marker\n');

  // 4. fire.
  const calls = [];
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  let code;
  try {
    code = launcher.main(['dream', '--descriptor', w.path, '--expect-digest', w.digest], {
      env,
      core: paths.core,
      platform: process.platform,
      spawn: (command, args) => { calls.push({ command, args }); return { status: 0 }; },
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(code, 1, 'non-zero exit');
  assert.equal(calls.length, 0, 'ZERO spawn');
  const alerts = fs.readFileSync(path.join(corePaths.state, 'alerts.jsonl'), 'utf8');
  assert.match(alerts, /the live app tree does not match the descriptor/, 'the RIGHT refusal (C3), durably recorded');
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
      core: paths.core,
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
  const { env, descriptorPath, digest, paths } = setupProd();
  const calls = [];
  const argv = ['dream', '--descriptor', descriptorPath, '--expect-digest', digest];
  const code = launcher.main(argv, {
    env,
    core: paths.core,
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

test('launcher: appTreeDigestOf === descriptor.appTreeDigestOf over normal/unicode/quote/newline filenames (cross-impl, WP-156 F6)', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-xtree-')));
  const names = ['normal.txt', 'ünïcödé.md', 'quote".js', 'new\nline.txt', path.join('sub', 'dir', 'deep.json')];
  for (const n of names) {
    const full = path.join(root, n);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `content-of-${n}`);
  }
  // The two independent implementations MUST agree byte-for-byte over hostile
  // filenames — any drift makes every prod fire AND catch-up refuse.
  assert.equal(launcher.appTreeDigestOf(root), descriptorMod.appTreeDigestOf(root));
});

/**
 * A fully-wired DEV install: the running package (with src/, so the launcher can
 * re-derive the dev digest from the tree) copied to an out-of-tree checkout,
 * vendored (current → the checkout, OUTSIDE <core>/app), pins, a saved dream
 * job, and a dev-stance descriptor.
 *
 * What makes this install `dev` is CONTAINMENT — `current` resolves outside
 * `<core>/app` (WP-stance-authority-containment, Table A). The `.git` written
 * below is NOT the stance signal any more; it is what makes `vendorSelf` LINK
 * the checkout in place instead of copying it into `<core>/app`, so it must
 * stay. (This is not a self-resync: the temp checkout is not where `current`
 * points when `vendorSelf` runs — Table G row 1.)
 * @param {'dir'|'file'} gitKind  a `.git` DIRECTORY (clone) or FILE (worktree)
 */
function setupDev(gitKind = 'file') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-dev-'));
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-devsrc-'));
  vendor.copyTree(prodSource(), checkout); // real src/ so the dev digest is re-derivable
  if (gitKind === 'file') fs.writeFileSync(path.join(checkout, '.git'), 'gitdir: /elsewhere/.git/worktrees/x\n');
  else fs.mkdirSync(path.join(checkout, '.git'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(root, 'vault')}\n`);
  vendor.vendorSelf(paths, { sourceRoot: checkout, env }); // .git → dev: current → the checkout
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
  return { root, checkout, env, paths, corePaths: corePathsOf(paths), descriptorPath, digest };
}

test('launcher: a git-WORKTREE dev install (.git is a FILE) runs, and a tracked-source edit still runs (F10)', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupDev('file');
  let r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.args.slice(1), ['run-job', 'dream']);
  // Editing a TRACKED source file does NOT drift the dev digest (it excludes the
  // tree digest) — dev stays runnable.
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  fs.appendFileSync(path.join(target, 'package.json'), '\n');
  r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, true, 'a tracked-source edit still runs on dev: ' + r.reason);
});

test('launcher: a `.git` DIRECTORY dev install runs (F10)', () => {
  const { env, corePaths, descriptorPath, digest } = setupDev('dir');
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, true, r.reason);
});

test('launcher: dev + a config run-action rewrite ⇒ refuse (dev config-digest drifts, F10)', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupDev('file');
  jobsLib.saveJob(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' });
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /descriptor changed since it was scheduled/);
});

test('launcher: dev app/current repointed OFF the bound checkout root ⇒ refuse (dev containment, F10)', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupDev('file');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-devother-'));
  vendor.copyTree(prodSource(), other);
  fs.writeFileSync(path.join(other, '.git'), 'gitdir: /elsewhere\n');
  fs.rmSync(path.join(paths.core, 'app', 'current'), { force: true });
  fs.symlinkSync(other, path.join(paths.core, 'app', 'current'));
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.match(r.reason, /authorized checkout root/);
});

test('launcher: WIENERDOG_DEV=1 in the scheduler env + a PROD descriptor does NOT flip to dev (F10)', () => {
  const { env, corePaths, descriptorPath, digest } = setupProd();
  // A hostile inherited WIENERDOG_DEV must NOT downgrade a prod install to the
  // unverified dev path — the prod stance + full tree verification still runs.
  const hostile = { ...env, WIENERDOG_DEV: '1' };
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env: hostile });
  assert.equal(r.ok, true, 'prod install still verifies+runs, not a dev fail-open: ' + r.reason);
  assert.deepEqual(r.args.slice(1), ['run-job', 'dream']);
});

// -------------------------------------------------------------------------
// F11: schema-aware parseArgv
// -------------------------------------------------------------------------

test('launcher: parseArgv treats --catch-up as boolean, not value-taking (F11)', () => {
  const r = launcher.parseArgv(['--catch-up', '--expect-digest', 'D']);
  assert.equal(r.flags['catch-up'], true);
  assert.equal(r.flags['expect-digest'], 'D', '--catch-up must NOT swallow the following --expect-digest');
  assert.equal(r.error, undefined);
});

test('launcher: parseArgv fails closed on an unknown flag (F11)', () => {
  const r = launcher.parseArgv(['dream', '--descriptor', 'd', '--evil', 'x']);
  assert.ok(r.error, 'an unknown flag is an error, not a silent consume');
  assert.match(r.error, /unknown flag --evil/);
});

test('launcher: main on --catch-up + --expect-digest verifies the tree and spawns catch-up (F11 end-to-end)', () => {
  const { env, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const treeDigest = launcher.appTreeDigestOf(target);
  const calls = [];
  const code = launcher.main(['--catch-up', '--expect-digest', treeDigest], {
    env,
    core: paths.core,
    platform: process.platform,
    spawn: (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    },
    exit: () => {},
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(1), ['run-job', '--catch-up']);
});

// -------------------------------------------------------------------------
// F8 / A10 / R4: env scrub + bound HOME on the child spawn
// -------------------------------------------------------------------------

test('launcher: main scrubs NODE_OPTIONS/NODE_PATH and binds HOME on the child spawn env (F8/R4)', () => {
  const { env, descriptorPath, digest, paths } = setupProd();
  const hostile = {
    ...env,
    NODE_OPTIONS: '--require /evil.js',
    NODE_PATH: '/evil/modules',
    CLAUDE_CONFIG_DIR: '/evil/claude',
    CODEX_HOME: '/evil/codex',
    ANTHROPIC_API_KEY: 'sk-evil',
  };
  let childEnv = null;
  launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
    env: hostile,
    core: paths.core,
    platform: process.platform,
    spawn: (_c, _a, opts) => {
      childEnv = opts.env;
      return { status: 0 };
    },
    exit: () => {},
  });
  assert.ok(childEnv, 'spawned');
  assert.equal(childEnv.NODE_OPTIONS, undefined, 'NODE_OPTIONS scrubbed from the child');
  assert.equal(childEnv.NODE_PATH, undefined, 'NODE_PATH scrubbed from the child');
  assert.equal(childEnv.CLAUDE_CONFIG_DIR, undefined, 'ambient CLAUDE_CONFIG_DIR scrubbed');
  assert.equal(childEnv.CODEX_HOME, undefined, 'ambient CODEX_HOME scrubbed');
  assert.equal(childEnv.ANTHROPIC_API_KEY, undefined, 'ambient ANTHROPIC_API_KEY scrubbed');
  assert.equal(childEnv.HOME, paths.home, 'HOME bound to the descriptor-recorded authorized home');
});

test('launcher: a hostile ambient HOME does NOT move the authorized root — the bound home wins (R4)', () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const hostileHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-evilhome-'));
  const hostile = { ...env, HOME: hostileHome };
  // The re-derivation binds the descriptor's home, so a hostile ambient HOME
  // does NOT drift the digest — the run still verifies.
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env: hostile });
  assert.equal(r.ok, true, r.reason);
  // And the child spawn re-asserts the bound home, not the hostile one.
  let childEnv = null;
  launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
    env: hostile,
    core: paths.core,
    platform: process.platform,
    spawn: (_c, _a, opts) => {
      childEnv = opts.env;
      return { status: 0 };
    },
    exit: () => {},
  });
  assert.equal(childEnv.HOME, paths.home, 'child HOME is the bound authorized home, not the hostile ambient one');
  assert.notEqual(childEnv.HOME, hostileHome);
});

// -------------------------------------------------------------------------
// A7 hardening pass (fix #2): the core is ANCHORED to the launcher's own
// location, never an ambient WIENERDOG_HOME.
// -------------------------------------------------------------------------

test('launcher: a hostile ambient WIENERDOG_HOME does NOT relocate verification or the refuse alert — the anchored core wins (fix #2)', () => {
  const { env, descriptorPath, digest, paths } = setupProd();
  jobsLib.saveJob(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' }); // drift → refuse
  const evilCore = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-evilcore-'));
  fs.mkdirSync(path.join(evilCore, 'state'), { recursive: true });
  const hostile = { ...env, WIENERDOG_HOME: evilCore };
  let spawned = false;
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  try {
    launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
      env: hostile,
      core: paths.core, // the anchored core (production derives it from __filename)
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
  assert.equal(spawned, false, 'no spawn on drift');
  // The durable refuse alert lands under the ANCHORED state dir, not the hostile core.
  const anchored = fs.readFileSync(path.join(paths.state, 'alerts.jsonl'), 'utf8');
  assert.match(anchored, /refusing to run/, 'alert lands under the anchored state dir');
  assert.equal(fs.existsSync(path.join(evilCore, 'state', 'alerts.jsonl')), false, 'no alert under the hostile ambient core');
});

test('launcher: a copied byte-identical tree + hostile WIENERDOG_HOME — the child still gets the anchored core (fix #2)', () => {
  const { env, descriptorPath, digest, paths } = setupProd();
  const evilCore = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-evilcore2-'));
  const hostile = { ...env, WIENERDOG_HOME: evilCore };
  let childEnv = null;
  launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
    env: hostile,
    core: paths.core,
    platform: process.platform,
    spawn: (_c, _a, opts) => {
      childEnv = opts.env;
      return { status: 0 };
    },
    exit: () => {},
  });
  assert.ok(childEnv, 'spawned');
  // The child (run-job) resolves its core/state/locks/logs from the ANCHORED core,
  // so an ambient/copied-tree WIENERDOG_HOME cannot relocate them.
  assert.equal(childEnv.WIENERDOG_HOME, paths.core, 'child WIENERDOG_HOME is the anchored core');
  assert.notEqual(childEnv.WIENERDOG_HOME, evilCore);
});

test('launcher: production anchors the core to the launcher file location (path.dirname^2), independent of env', () => {
  // The vendored launcher lives at <core>/launcher/launch.js, so its own path is
  // the registration-time anchor. verify main derives <core> from opts.launcherFile.
  const { env, descriptorPath, digest, paths } = setupProd();
  const launcherFile = path.join(paths.core, 'launcher', 'launch.js');
  let childEnv = null;
  launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
    env: { ...env, WIENERDOG_HOME: '/somewhere/evil' },
    launcherFile, // production passes none → uses __filename of the vendored copy
    platform: process.platform,
    spawn: (_c, _a, opts) => {
      childEnv = opts.env;
      return { status: 0 };
    },
    exit: () => {},
  });
  assert.ok(childEnv, 'spawned — the anchored core resolved the app tree');
  assert.equal(childEnv.WIENERDOG_HOME, paths.core, 'anchored core = dirname(dirname(launcherFile))');
});

// -------------------------------------------------------------------------
// F13: every verification exception → durable alert, never a bare throw
// -------------------------------------------------------------------------

test('launcher: an fs error during verification ⇒ refuse + durable alert + ZERO spawn (F13)', { skip: process.platform === 'win32' }, () => {
  const { env, descriptorPath, digest, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  // Make a file under app/current unreadable so the tree walk throws mid-hash.
  const victim = path.join(target, 'package.json');
  fs.chmodSync(victim, 0o000);
  let spawned = false;
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  let code;
  try {
    code = launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
      env,
      core: paths.core,
      platform: process.platform,
      spawn: () => {
        spawned = true;
        return { status: 0 };
      },
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
    try {
      fs.chmodSync(victim, 0o644);
    } catch {
      /* ignore */
    }
  }
  assert.equal(spawned, false, 'no spawn when verification throws');
  assert.equal(code, 1);
  const alerts = fs.readFileSync(path.join(paths.state, 'alerts.jsonl'), 'utf8');
  assert.match(alerts, /refusing to run/, 'a durable alert is appended even on a thrown error');
});

// -------------------------------------------------------------------------
// F27: refuse text points at the digest banner + `wienerdog sync`, not doctor
// -------------------------------------------------------------------------

test('launcher: the refuse text points at the next digest + `wienerdog sync`, never `wienerdog doctor` (F27)', () => {
  const { env, descriptorPath, digest, paths } = setupProd();
  jobsLib.saveJob(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' }); // drift
  const origErr = process.stderr.write;
  let stderr = '';
  process.stderr.write = (s) => {
    stderr += s;
    return true;
  };
  try {
    launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
      env,
      core: paths.core,
      platform: process.platform,
      spawn: () => ({ status: 0 }),
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  assert.match(stderr, /wienerdog sync/, 'points at the real remedy');
  assert.match(stderr, /next digest/, 'points at the real surface');
  assert.doesNotMatch(stderr, /wienerdog doctor/, 'no longer points at doctor (reads no A7 state)');
});

// -------------------------------------------------------------------------
// WP-refusal-remedy-discriminator: the remedy is a class, not a constant.
// Table R decides the two remedy classes and their sentences; Table S records
// which return site gets which class; block R-P is the rule that assigns them.
// -------------------------------------------------------------------------

test("remedy: refusalText('sync') is byte-identical to the shipped banner", () => {
  const REASON = 'the live app tree does not match the descriptor (app files changed since sync)';
  const expected =
    'wienerdog: refusing to run "dream" — the live app tree does not match the descriptor (app files changed since sync) ' +
    '(integrity mismatch); no job was run. This alert will appear in your next digest. If the change was intentional, run ' +
    '`wienerdog sync`; otherwise investigate.';
  assert.equal(launcher.refusalText('dream', REASON, 'sync'), expected);
});

test("remedy: refusalText('reinstall') is byte-identical to the canonical reinstall banner", () => {
  const REASON = 'the live app tree does not match the descriptor (app files changed since sync)';
  const expected =
    'wienerdog: refusing to run "dream" — the live app tree does not match the descriptor (app files changed since sync) ' +
    '(integrity mismatch); no job was run. This alert will appear in your next digest. ' +
    'Do not run `wienerdog sync` — this check could not confirm the app files are the ones you installed, so syncing is not the safe next step. ' +
    'Reinstall Wienerdog from a trusted source, then investigate.';
  const actual = launcher.refusalText('dream', REASON, 'reinstall');
  assert.equal(actual, expected);
  assert.doesNotMatch(actual, /If the change was intentional/);
});

test('remedy: an absent or unknown remedy falls back to reinstall (fail closed)', () => {
  for (const bad of [undefined, null, '', 'bogus', 'SYNC', '__proto__', 'constructor', 'toString']) {
    const text = launcher.refusalText('dream', 'W', bad);
    assert.match(text, /Do not run `wienerdog sync`/, `remedy=${String(bad)} falls back to reinstall`);
    assert.doesNotMatch(text, /If the change was intentional/, `remedy=${String(bad)} does not select the sync tail`);
  }
});

test("remedy: only the exact string 'sync' selects the sync tail", () => {
  assert.match(launcher.refusalText('dream', 'W', 'sync'), /If the change was intentional/);
  for (const other of [undefined, null, '', 'bogus', 'SYNC', '__proto__', 'constructor', 'toString']) {
    assert.doesNotMatch(launcher.refusalText('dream', 'W', other), /If the change was intentional/);
  }
});

test("remedy: a prod app-tree mutation refuses with remedy 'reinstall' and a banner that forbids sync", () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const f = path.join(target, 'package.json');
  try {
    fs.chmodSync(f, 0o644);
  } catch {
    /* ignore */
  }
  fs.appendFileSync(f, '\n// tampered\n');
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.equal(r.remedy, 'reinstall');
  assert.match(r.reason, /app tree does not match the descriptor/);

  const calls = [];
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  let code;
  try {
    code = launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
      env,
      core: paths.core,
      platform: process.platform,
      spawn: (command, args) => {
        calls.push({ command, args });
        return { status: 0 };
      },
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(calls.length, 0, 'zero spawn');
  assert.equal(code, 1, 'exit 1');
  const alerts = fs.readFileSync(path.join(paths.state, 'alerts.jsonl'), 'utf8');
  assert.match(alerts, /Do not run/);
  assert.doesNotMatch(alerts, /If the change was intentional/);
});

test("remedy: a catch-up tree mismatch refuses with remedy 'reinstall'", () => {
  const { env, corePaths } = setupProd();
  const wrong = launcher.verifyCatchup(corePaths, 'sha256:nope', env, process.platform);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.remedy, 'reinstall');
  assert.match(wrong.reason, /does not match the scheduled digest/);
});

test("remedy: a prod descriptor drift keeps remedy 'sync' and the unchanged banner", () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();
  jobsLib.saveJob(paths, { ...DREAM_JOB, run: 'skill:wienerdog-weekly-review' }); // Table S row 11
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.equal(r.remedy, 'sync');
  assert.match(r.reason, /descriptor changed since it was scheduled/);

  const origErr = process.stderr.write;
  let stderr = '';
  process.stderr.write = (s) => {
    stderr += s;
    return true;
  };
  try {
    launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
      env,
      core: paths.core,
      platform: process.platform,
      spawn: () => ({ status: 0 }),
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  assert.match(stderr, /If the change was intentional/);
  assert.doesNotMatch(stderr, /Do not run/, "T7's own guard — F27 alone cannot catch a wrong class here");
});

test("remedy: a repointed dev app/current refuses with remedy 'reinstall'", () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupDev('file');
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-launch-devother-remedy-'));
  vendor.copyTree(prodSource(), other);
  fs.writeFileSync(path.join(other, '.git'), 'gitdir: /elsewhere\n');
  fs.rmSync(path.join(paths.core, 'app', 'current'), { force: true });
  fs.symlinkSync(other, path.join(paths.core, 'app', 'current'));
  const r = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(r.ok, false);
  assert.equal(r.remedy, 'reinstall');
  assert.match(r.reason, /authorized checkout root/);

  const calls = [];
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  let code;
  try {
    code = launcher.main(['dream', '--descriptor', descriptorPath, '--expect-digest', digest], {
      env,
      core: paths.core,
      platform: process.platform,
      spawn: (command, args) => {
        calls.push({ command, args });
        return { status: 0 };
      },
      exit: () => {},
    });
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(calls.length, 0, 'zero spawn');
  assert.equal(code, 1, 'exit 1');
  const alerts = fs.readFileSync(path.join(paths.state, 'alerts.jsonl'), 'utf8');
  assert.match(alerts, /Do not run/);
  assert.doesNotMatch(alerts, /If the change was intentional/);
});

test("remedy: the outer catch follows the tie-back — after it 'sync', before it 'reinstall'", { skip: process.platform === 'win32' }, () => {
  const { env, corePaths, descriptorPath, digest, paths } = setupProd();

  // (a) after: the tie-back (tree-digest comparison) has already passed when the
  // catch is reached — remove exec-pins.json so reDeriveDigest throws AFTER it.
  const healthy = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(healthy.ok, true, healthy.reason);
  fs.rmSync(path.join(paths.state, 'exec-pins.json'), { force: true });
  const after = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  assert.equal(after.ok, false);
  assert.match(after.reason, /integrity check errored:/);
  assert.equal(after.remedy, 'sync', 'the tie-back passed before this throw, so sync is the right advice');

  // (b) before: make the tree walk throw BEFORE the tree-digest comparison runs
  // (the F13 recipe) — reused from the existing F13 test above.
  const target = fs.realpathSync(path.join(paths.core, 'app', 'current'));
  const victim = path.join(target, 'package.json');
  fs.chmodSync(victim, 0o000);
  let before;
  try {
    before = launcher.verifyAndResolve(corePaths, 'dream', { descriptorPath, expectDigest: digest, env });
  } finally {
    try {
      fs.chmodSync(victim, 0o644);
    } catch {
      /* ignore */
    }
  }
  assert.equal(before.ok, false);
  assert.match(before.reason, /integrity check errored:/);
  assert.equal(before.remedy, 'reinstall', 'no tie-back had executed on this path');
});

test('remedy: an INHERITED remedy does not select the sync tail (ownership)', () => {
  const REASON = 'W';
  try {
    Object.prototype.remedy = 'sync';
    const v = { ok: false, reason: REASON };
    assert.equal(v.remedy, 'sync', 'the hazard is real: a bare read inherits through the prototype chain');
    assert.equal(launcher.remedyOf(v), undefined, 'remedyOf requires OWNERSHIP, not inheritance');
    const text = launcher.refusalText('dream', REASON, launcher.remedyOf(v));
    assert.match(text, /Do not run `wienerdog sync`/);
    assert.doesNotMatch(text, /If the change was intentional/);
    assert.equal(launcher.remedyOf({ ok: false, remedy: 'sync', reason: REASON }), 'sync', 'an OWN remedy still reads through');
  } finally {
    delete Object.prototype.remedy;
  }
});
