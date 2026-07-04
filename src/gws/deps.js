'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const { WienerdogError } = require('../core/errors');
const { confirm } = require('../core/prompt');

/**
 * @typedef {import('../core/paths').WienerdogPaths} WienerdogPaths
 */

// Pinned major — MUST track package.json's googleapis range. Moving the pin is a
// normal release change; re-running `wienerdog gws auth` re-installs (ADR-0013).
const GOOGLEAPIS_SPEC = 'googleapis@^173';

/**
 * The per-install deps dir. NOT under app/<version>/, so version bumps never
 * remove it; uninstall's recursive removal of app/ still clears it (ADR-0013).
 * @param {WienerdogPaths} paths
 * @returns {string} <core>/app/deps
 */
function depsDir(paths) {
  return path.join(paths.core, 'app', 'deps');
}

/**
 * Resolve googleapis strictly from within the deps dir. `createRequire` anchors
 * resolution at app/deps but Node then walks EVERY ancestor node_modules, so a
 * copy planted outside the deps dir (e.g. ~/node_modules) could otherwise
 * satisfy the lookup — silently bypassing the consented, pinned install
 * (ADR-0011/ADR-0013). A resolution outside the deps dir is treated exactly as
 * absent.
 * @param {WienerdogPaths} paths
 * @returns {{req:NodeRequire, resolved:string}|null}
 */
function resolveFromDeps(paths) {
  const dir = depsDir(paths);
  const req = createRequire(path.join(dir, 'noop.js'));
  const resolved = req.resolve('googleapis');
  // req.resolve returns a canonical (symlink-resolved) path; canonicalize the
  // deps dir the same way so a symlinked ancestor (e.g. macOS /var ->
  // /private/var) does not defeat the containment check.
  let real = dir;
  try {
    real = fs.realpathSync(dir);
  } catch {
    /* deps dir absent — resolved can't be inside it; fall through */
  }
  if (!resolved.startsWith(real + path.sep)) return null;
  return { req, resolved };
}

/**
 * Whether googleapis resolves from within the deps dir (containment-guarded).
 * @param {WienerdogPaths} paths
 * @returns {boolean}
 */
function isInstalled(paths) {
  try {
    return resolveFromDeps(paths) !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve googleapis from the deps dir (containment-guarded). Throws a plain
 * setup error when absent or when resolution lands outside the deps dir
 * (never a raw MODULE_NOT_FOUND).
 * @param {WienerdogPaths} paths
 * @returns {object}
 */
function loadGoogleapis(paths) {
  try {
    const hit = resolveFromDeps(paths);
    if (hit) return hit.req(hit.resolved);
  } catch {
    /* treated as absent */
  }
  throw new WienerdogError(
    "Google isn't set up yet — run /wienerdog-google-setup to connect Gmail, Calendar, and Drive."
  );
}

/**
 * Default installer: `npm install --ignore-scripts --prefix <deps>
 * googleapis@<major>` (inherit stdio so npm's progress is visible).
 * `--ignore-scripts` because googleapis is pure JS; disabling lifecycle scripts
 * removes a residual supply-chain surface. Runs synchronously and exits
 * (ADR-0004).
 * @param {string} dir
 * @param {string} spec
 * @returns {{status:number}}
 */
function defaultRunInstall(dir, spec) {
  const r = spawnSync('npm', ['install', '--ignore-scripts', '--prefix', dir, spec], {
    stdio: 'inherit',
  });
  return { status: r.status == null ? 1 : r.status };
}

/**
 * Ensure googleapis is installed in the deps dir, once, with consent (ADR-0011
 * posture: show the exact command, default yes, fail-to-print on decline/failure).
 * No-op when already present. Seams: opts.confirm, opts.runInstall, opts.yes.
 * @param {WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<{installed:boolean, already?:boolean}>}
 */
async function ensureGoogleapis(paths, opts = {}) {
  if (isInstalled(paths)) return { installed: false, already: true };
  const dir = depsDir(paths);
  const cmd = `npm install --ignore-scripts --prefix ${dir} ${GOOGLEAPIS_SPEC}`;
  process.stdout.write(`\nWienerdog needs Google's client library. It will run:\n  ${cmd}\n`);
  const ask = opts.confirm || confirm;
  const ok = opts.yes || (await ask('Install it now? [Y/n] '));
  if (!ok) throw new WienerdogError(`declined — run this yourself, then retry:\n  ${cmd}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = opts.runInstall || defaultRunInstall;
  const r = run(dir, GOOGLEAPIS_SPEC);
  if (r.status !== 0) throw new WienerdogError(`install failed — run it yourself, then retry:\n  ${cmd}`);
  return { installed: true };
}

module.exports = {
  GOOGLEAPIS_SPEC,
  depsDir,
  isInstalled,
  loadGoogleapis,
  ensureGoogleapis,
  defaultRunInstall,
};
