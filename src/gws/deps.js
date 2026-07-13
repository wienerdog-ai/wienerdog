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
 * Resolve googleapis strictly from within the deps dir, by DIRECT-PATH
 * construction — no ancestor walk (WP-102 §0, owner-approved guard rewrite).
 * The former bare-request resolve walked every ancestor node_modules; a
 * successful ancestor hit (correctly rejected by containment) was cached in
 * Module._pathCache, so a consented deps-dir install in the SAME process still
 * re-resolved the cached ancestor and read as absent. Direct-path resolution
 * never considers ancestors and is cache-immune, while the realpath
 * containment check preserves the symlink defense (ADR-0011/ADR-0013).
 * @param {WienerdogPaths} paths
 * @returns {{req:NodeRequire, resolved:string}|null}
 */
function resolveFromDeps(paths) {
  const dir = depsDir(paths);
  const candidate = path.join(dir, 'node_modules', 'googleapis');
  // (1) Absent unless the deps-dir copy's OWN package.json exists. Pure existence
  //     check — no resolution, so nothing is looked up in ancestors or cached.
  if (!fs.existsSync(path.join(candidate, 'package.json'))) return null;
  // (2) Resolve the ABSOLUTE candidate path (never the bare 'googleapis' request),
  //     so resolution targets exactly this dir, never walks ancestors, and is not
  //     served from Module._pathCache (the bare-request cache key is never used).
  const req = createRequire(path.join(dir, 'noop.js'));
  const resolved = req.resolve(candidate);
  // (3) RETAIN the realpath containment check — the resolved entry must live inside
  //     realpath(depsDir). `req.resolve` returns a symlink-resolved path, so a
  //     planted symlink deps/node_modules/googleapis -> elsewhere resolves OUTSIDE
  //     and is still rejected exactly as today (symlink defense preserved).
  let real = dir;
  try {
    real = fs.realpathSync(dir);
  } catch {
    /* deps dir absent — handled at (1) */
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
 * Whether a Google sign-in token exists on disk. Lazy require avoids a
 * load-time cycle with client.js (which requires this module at top level).
 * @param {WienerdogPaths} paths
 * @returns {boolean}
 */
function hasToken(paths) {
  const { tokenPath } = require('./client');
  return fs.existsSync(tokenPath(paths));
}

/**
 * Resolve googleapis from the deps dir (containment-guarded). Throws a plain
 * setup error when absent or when resolution lands outside the deps dir
 * (never a raw MODULE_NOT_FOUND).
 * @param {WienerdogPaths} paths
 * @returns {object}
 */
function loadGoogleapis(paths) {
  let resolvable = false;
  try {
    const hit = resolveFromDeps(paths);
    if (hit) {
      resolvable = true; // resolves from inside the deps dir (== isInstalled)...
      const mod = hit.req(hit.resolved); // ...but a corrupt/partial install can still throw on require
      // Shape check (closing PR-gate): a require that succeeds but yields no
      // `google` API object (e.g. an empty/zero-byte entry point) is just as
      // unusable — fall through so it is classified broken, not returned.
      if (mod && typeof mod.google === 'object' && mod.google) return mod;
    }
  } catch {
    /* resolve failed (absent), OR require threw (corrupt); `resolvable` tells them apart */
  }
  // Disambiguate the states that share this failure (BUG-gws-deps-missing):
  if (hasToken(paths)) {
    const dir = depsDir(paths);
    const cmd = `npm install --ignore-scripts --prefix "${dir}" ${GOOGLEAPIS_SPEC}`;
    if (resolvable) {
      // CONNECTED but the library is installed-yet-unloadable (corrupt/partial):
      // the read-path self-heal NO-OPs here (isInstalled is true), so promising an
      // "offer to install" would make the user loop on a contradictory message.
      // A plain reinstall can NO-OP too: npm compares tree metadata (recorded
      // version/integrity), NOT file contents, so a corrupt-but-resolvable tree
      // reads as "up to date" and stays broken (round-4 Finding). The corrupt tree
      // must be REMOVED first. The deps dir is single-purpose (it exists solely to
      // hold the consented googleapis tree), so deleting it wholesale is safe.
      // Platform-neutral prose (not a per-OS rm/Remove-Item one-liner) — plain
      // language for knowledge workers, CLAUDE.md.
      throw new WienerdogError(
        'Google is connected, but its client library is broken (installed but not loadable). ' +
          `To repair it, delete the folder ${dir}, then reinstall it:\n  ${cmd}`
      );
    }
    // CONNECTED and the library is ABSENT: the next gws read WILL self-heal.
    throw new WienerdogError(
      'Google is connected, but its client library needs a one-time install. ' +
        'The next `wienerdog gws` command will offer to install it, or run:\n  ' +
        cmd
    );
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
  const cmd = `npm install --ignore-scripts --prefix "${dir}" ${GOOGLEAPIS_SPEC}`;
  process.stdout.write(`\nWienerdog needs Google's client library. It will run:\n  ${cmd}\n`);
  const ask = opts.confirm || confirm;
  const ok = opts.yes || (await ask('Install it now? [Y/n] ', { defaultYes: true }));
  if (!ok) throw new WienerdogError(`declined — run this yourself, then retry:\n  ${cmd}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = opts.runInstall || defaultRunInstall;
  const r = run(dir, GOOGLEAPIS_SPEC);
  if (r.status !== 0) throw new WienerdogError(`install failed — run it yourself, then retry:\n  ${cmd}`);
  return { installed: true };
}

/**
 * Self-heal the on-demand googleapis install on the READ path. When a Google
 * sign-in token exists but the client library is absent (the post-WP-047-upgrade
 * dead-end, BUG-gws-deps-missing), install it once — with consent, exactly like
 * first auth (ADR-0011/ADR-0013). No-op when already installed, or when no token
 * exists (an unauthed user; getServices()'s loadToken then surfaces the
 * connect-Google flow unchanged). Consent seams pass straight through to
 * ensureGoogleapis: interactive → a [Y/n] prompt; non-TTY/headless →
 * ensureGoogleapis throws the accurate, browser-free npm-install remedy.
 * @param {WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<void>}
 */
async function ensureGoogleReady(paths, opts = {}) {
  if (isInstalled(paths)) return; // already present — nothing to do
  if (!hasToken(paths)) return; // unauthed — do not install; let loadToken surface the connect flow
  await ensureGoogleapis(paths, opts);
}

module.exports = {
  GOOGLEAPIS_SPEC,
  depsDir,
  isInstalled,
  loadGoogleapis,
  ensureGoogleapis,
  ensureGoogleReady,
  defaultRunInstall,
};
