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
const manifestLib = require(path.join(REPO_ROOT, 'src/core/manifest'));
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

// A valid, DIFFERENT-version prod source (F21): a copy of prodSource with a
// bumped package.json version, so vendorSelf resolves a NOT-yet-present version
// dir and proceeds into staging (rather than the same-version idempotent no-op).
let PROD_SOURCE_V2 = null;
const V2_VERSION = '999.0.0-a7test';
function prodSourceV2() {
  if (PROD_SOURCE_V2) return PROD_SOURCE_V2;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-srcv2-'));
  vendor.copyTree(prodSource(), dir);
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = V2_VERSION;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  PROD_SOURCE_V2 = dir;
  return dir;
}

// A dev-stance source (F10/R2:F10): a copy of prodSource carrying a `.git`
// *file* (git-worktree gitfile) so isDevCheckout is true and vendorSelf points
// current at the checkout itself (no copy) → a `dev`-stance descriptor.
let DEV_SOURCE = null;
function devSource() {
  if (DEV_SOURCE) return DEV_SOURCE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-devsrc-'));
  vendor.copyTree(prodSource(), dir);
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /somewhere/.git/worktrees/wd\n');
  DEV_SOURCE = dir;
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

/** Write the WP-154 pin store (schema 1) pointing at the given fakes.
 *  @param {import('../../../../src/core/paths').WienerdogPaths} paths
 *  @param {Record<string,string>} fakes  name → commandPath */
function writePinStore(paths, fakes) {
  /** @type {Record<string, object>} */
  const pins = {};
  for (const [name, commandPath] of Object.entries(fakes)) {
    pins[name] = { commandPath, installDir: path.dirname(commandPath), version: 'fake', pinnedAt: 't' };
  }
  fs.writeFileSync(path.join(paths.state, 'exec-pins.json'), JSON.stringify({ schema: 1, pins }), { mode: 0o600 });
  return path.join(paths.state, 'exec-pins.json');
}

/**
 * Build a fully-wired temp install: a real vendored app tree, a config with a
 * vault, WP-154 exec pins pointing at fake `claude`/`git`, a saved dream job, a
 * REAL install-manifest.json (F20/A3 — so a manifest tamper hits a real file, not
 * a swallowed ENOENT), and a written descriptor whose digest is the entry-bound
 * anchor. `stance` selects the prod (default) or dev (git-worktree) source.
 * @param {{stance?: 'prod'|'dev'}} [opts]
 * @returns {{root, env, paths, corePaths, descriptorPath, digest, pinBin,
 *   fakeClaude, fakeGit, stance}}
 */
function buildInstall(opts = {}) {
  const stance = opts.stance || 'prod';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${path.join(root, 'vault')}\n`);

  // A REAL install manifest (F20): vendorSelf + createPins record into it, and we
  // save it, so tests that tamper the manifest act on a genuine file.
  const manifest = manifestLib.load(paths); // ENOENT → fresh empty manifest
  vendor.vendorSelf(paths, { sourceRoot: stance === 'dev' ? devSource() : prodSource(), env: {}, manifest });

  // Fake external executables in a user-owned, non-writable-by-group bin dir so
  // WP-154 verifyExecutable passes; pin them structurally.
  const pinBin = path.join(fs.realpathSync(root), 'pinbin');
  fs.mkdirSync(pinBin, { recursive: true, mode: 0o755 });
  const fakeClaude = writeFakeExec(pinBin, 'claude');
  const fakeGit = writeFakeExec(pinBin, 'git');
  const pinFile = writePinStore(paths, { claude: fakeClaude, git: fakeGit });
  manifest.entries.push({ kind: 'file', path: pinFile });
  manifestLib.save(paths, manifest);

  jobsLib.saveJob(paths, DREAM_JOB);
  const { path: descriptorPath, digest } = descriptorMod.writeDescriptor(paths, DREAM_JOB, { env });
  return { root, env, paths, corePaths: corePathsOf(paths), descriptorPath, digest, pinBin, fakeClaude, fakeGit, stance };
}

/** Prod install (the default). @returns {ReturnType<typeof buildInstall>} */
function buildProdInstall() {
  return buildInstall({ stance: 'prod' });
}

/** Dev-stance (git-worktree) install. @returns {ReturnType<typeof buildInstall>} */
function buildDevInstall() {
  return buildInstall({ stance: 'dev' });
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

/** Set/replace ONE top-level config scalar (`dream_model`, `dream_timeout_minutes`,
 *  `dream_max_input_bytes`, `vault`, …) WITHOUT disturbing the managed `jobs:`
 *  block (F18/A1). A whole-file rewrite would erase the jobs block, so the
 *  launcher would refuse at `findJob` BEFORE the descriptor-digest check and the
 *  case would be vacuous. Preserves the block via the jobs library's own renderer.
 *  @param {object} paths @param {string} key @param {string} value */
function setConfigScalar(paths, key, value) {
  const text = fs.readFileSync(paths.config, 'utf8');
  const jobs = jobsLib.parseJobs(text);
  let base = jobsLib.renderConfigWithJobs(text, []); // strip the managed jobs block
  base = base.replace(new RegExp(`^${key}:.*$\\n?`, 'm'), ''); // drop any existing scalar
  if (!base.endsWith('\n')) base += '\n';
  base += `${key}: ${value}\n`;
  fs.writeFileSync(paths.config, jobsLib.renderConfigWithJobs(base, jobs)); // re-append the SAME jobs
}

/** Rewrite the saved dream job's fields (run / at / timeoutMinutes) via the jobs
 *  library, preserving it as a real managed-block job (F18/A1).
 *  @param {object} paths @param {Partial<typeof DREAM_JOB>} patch */
function setJobFields(paths, patch) {
  jobsLib.saveJob(paths, { ...DREAM_JOB, ...patch });
}

/** Legacy targeted-config poison kept for back-compat with the case list. `field`
 *  ∈ 'run' | 'dream_model' | 'dream_timeout_minutes' | 'dream_max_input_bytes' |
 *  'vault' | 'vault_layout' | 'timeout_minutes' | 'at'. Each mutates ONLY its
 *  target, preserving the jobs block, so model/timeout/layout tampers reach the
 *  DIGEST check (not findJob). @param {object} paths @param {string} field @param {string} value */
function poisonConfig(paths, field, value) {
  if (field === 'run') return setJobFields(paths, { run: value });
  if (field === 'timeout_minutes') return setJobFields(paths, { timeoutMinutes: Number(value) });
  if (field === 'at') return setJobFields(paths, { at: value });
  if (field === 'vault_layout') {
    // Nested block — append a layout override; readVaultLayout folds it into the digest.
    fs.appendFileSync(paths.config, `vault_layout:\n  inbox_dir: ${value}\n`);
    return undefined;
  }
  return setConfigScalar(paths, field, value); // dream_model / dream_timeout_minutes / dream_max_input_bytes / vault
}

/** A recording fake spawn: captures every would-be launch (command, args, opts)
 *  instead of executing. `opts` is captured so a test can assert the scrubbed
 *  child env (bound HOME, dropped NODE_OPTIONS/API key — A10/R4).
 *  @returns {{spawn:Function, calls:Array<{command:string, args:string[], opts:object}>}} */
function recordingSpawn() {
  const calls = [];
  const spawn = (command, args, opts) => {
    calls.push({ command, args, opts: opts || {} });
    return { status: 0 };
  };
  return { spawn, calls };
}

/** Plant a NON-NODE PATH-resolving interpreter hijack (R10-R13): re-point the
 *  pinned `claude` at a script whose shebang is `#!/usr/bin/env <interp>` and
 *  plant `<interp>` FIRST on the job PATH. bindInterpreter must THROW before any
 *  spawn, so the plant NEVER runs. The planted interpreter touches `marker` when
 *  executed — a spy the caller asserts stays absent.
 *  @param {ReturnType<typeof buildInstall>} fx
 *  @returns {{jobEnv:NodeJS.ProcessEnv, marker:string, evilDir:string}} */
function plantInterpreterHijack(fx) {
  const evilDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-a7-hij-'));
  const marker = path.join(fx.root, 'HIJACK_EXECUTED');
  const interp = path.join(evilDir, 'wdfakeinterp');
  fs.writeFileSync(interp, `#!/bin/sh\ntouch "${marker}"\nexit 0\n`);
  fs.chmodSync(interp, 0o755);
  // The pinned claude now uses a PATH-resolving non-node interpreter.
  fs.writeFileSync(fx.fakeClaude, '#!/usr/bin/env wdfakeinterp\necho hi\n');
  fs.chmodSync(fx.fakeClaude, 0o755);
  return { jobEnv: { ...fx.env, PATH: `${evilDir}:${fx.pinBin}` }, marker, evilDir };
}

/** Wrap fs.statSync so the pinned target reports a FOREIGN owner uid (F22/A5) —
 *  drives verifyExecutable's owner check deterministically, no root needed.
 *  Returns a restore fn. @param {string} targetPath @returns {() => void} */
function stubForeignOwner(targetPath) {
  const realStat = fs.statSync;
  const foreignUid = (process.getuid ? process.getuid() : 1000) + 54321;
  fs.statSync = (p, ...rest) => {
    const st = realStat.call(fs, p, ...rest);
    if (p === targetPath) {
      return {
        isFile: () => st.isFile(),
        isDirectory: () => st.isDirectory(),
        isSymbolicLink: () => st.isSymbolicLink(),
        mode: st.mode,
        uid: foreignUid,
        gid: st.gid,
        size: st.size,
      };
    }
    return st;
  };
  return () => {
    fs.statSync = realStat;
  };
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
  V2_VERSION,
  buildInstall,
  buildProdInstall,
  buildDevInstall,
  writeFakeExec,
  writePinStore,
  setConfigScalar,
  setJobFields,
  poisonConfig,
  recordingSpawn,
  plantInterpreterHijack,
  stubForeignOwner,
  corePathsOf,
  cleanup,
  prodSource,
  prodSourceV2,
  devSource,
};
