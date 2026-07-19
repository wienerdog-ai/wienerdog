'use strict';

// Shared fixture builders for the A7 integrity harness (WP-158). Both the
// deterministic negatives (tests/unit/a7-integrity-negatives.test.js, run in
// `npm test`) and the gated scenario runner (../run-a7-integrity.js) import
// these, so the tamper matrix is exercised against the REAL A7 modules from one
// place. Nothing here spends model quota or touches the maintainer's config:
// every install is a disposable temp $HOME/core, and the "spawn" is a recorder.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const vendor = require(path.join(REPO_ROOT, 'src/core/vendor'));
const descriptorMod = require(path.join(REPO_ROOT, 'src/scheduler/descriptor'));
const { getPaths } = require(path.join(REPO_ROOT, 'src/core/paths'));
const jobsLib = require(path.join(REPO_ROOT, 'src/scheduler/jobs'));

const DREAM_JOB = { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 };

// A .git-free copy of the running package → prod vendoring (the real repo has a
// .git, which would make vendorSelf pick dev mode). Built once, reused.
let PROD_SOURCE = null;
function prodSource() {
  if (PROD_SOURCE) return PROD_SOURCE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-src-'));
  vendor.copyTree(REPO_ROOT, dir); // bin/src/skills/templates/package.json, no .git
  PROD_SOURCE = dir;
  return dir;
}

/** The inlined core paths the launcher computes from env. */
function corePathsOf(paths) {
  return {
    core: paths.core,
    state: paths.state,
    appDir: path.join(paths.core, 'app'),
    appCurrent: path.join(paths.core, 'app', 'current'),
  };
}

/**
 * Build a fully-wired temp PROD install: a real vendored prod app tree, a config
 * with a vault, WP-154 exec pins pointing at fake `claude`/`git`, a saved dream
 * job, and a written descriptor whose digest is the entry-bound anchor.
 * @returns {{root, env, paths, corePaths, descriptorPath, digest, pinBin,
 *   fakeClaude, fakeGit}}
 */
function buildProdInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(root, 'vault')}\n`);
  vendor.vendorSelf(paths, { sourceRoot: prodSource(), env: {} });

  // Fake external executables in a user-owned, non-writable-by-group bin dir so
  // WP-154 verifyExecutable passes; pin them structurally.
  const pinBin = path.join(fs.realpathSync(root), 'pinbin');
  fs.mkdirSync(pinBin, { recursive: true, mode: 0o755 });
  const fakeClaude = writeFakeExec(pinBin, 'claude');
  const fakeGit = writeFakeExec(pinBin, 'git');
  fs.writeFileSync(
    path.join(paths.state, 'exec-pins.json'),
    JSON.stringify({
      schema: 1,
      pins: {
        claude: { commandPath: fakeClaude, installDir: pinBin, version: 'fake', pinnedAt: 't' },
        git: { commandPath: fakeGit, installDir: pinBin, version: 'fake', pinnedAt: 't' },
      },
    }),
    { mode: 0o600 }
  );

  jobsLib.saveJob(paths, DREAM_JOB);
  const { path: descriptorPath, digest } = descriptorMod.writeDescriptor(paths, DREAM_JOB, { env });
  return { root, env, paths, corePaths: corePathsOf(paths), descriptorPath, digest, pinBin, fakeClaude, fakeGit };
}

/** Write an executable `#!/bin/sh` fake and return its path. Records nothing —
 *  the harness never actually runs it; the recorder captures would-be spawns.
 *  @param {string} dir @param {string} name @param {string} [body='exit 0'] */
function writeFakeExec(dir, name, body = 'exit 0') {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "0.0.0 (fake ${name})"; exit 0; fi\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** Overwrite config.yaml with a poisoned value for one authorized field. `field`
 *  ∈ 'run' | 'dream_model' | 'dream_timeout_minutes'.
 *  @param {object} paths @param {string} root @param {string} field @param {string} value */
function poisonConfig(paths, root, field, value) {
  const vault = path.join(root, 'vault');
  if (field === 'run') {
    // The `run` action lives in the managed jobs block, not a top-level key —
    // rewrite it via the jobs library so the saved job carries the new action.
    jobsLib.saveJob(paths, { ...DREAM_JOB, run: value });
    return;
  }
  fs.writeFileSync(paths.config, `version: 1\nvault: ${vault}\n${field}: ${value}\n`);
}

/** A recording fake spawn: captures every would-be launch instead of executing.
 *  @returns {{spawn:Function, calls:Array<{command:string, args:string[]}>}} */
function recordingSpawn() {
  const calls = [];
  const spawn = (command, args) => {
    calls.push({ command, args });
    return { status: 0 };
  };
  return { spawn, calls };
}

/** Recursively rm a temp root, best-effort (files may be read-only). */
function cleanup(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

module.exports = {
  REPO_ROOT,
  DREAM_JOB,
  buildProdInstall,
  writeFakeExec,
  poisonConfig,
  recordingSpawn,
  corePathsOf,
  cleanup,
  prodSource,
};
