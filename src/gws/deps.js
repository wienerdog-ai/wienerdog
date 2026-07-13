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
 * Whether a googleapis tree is PHYSICALLY present in the deps dir (its own
 * package.json exists). This — NOT resolvability — is the absent/broken key and
 * the self-heal gate (WP-102 §2/§3/§3b, round-6 P2): a present-but-unresolvable
 * tree (missing/malformed main, or a symlink pointing outside) must read BROKEN,
 * and self-heal must NOT `npm` over it (arborist can no-op). `existsSync` follows
 * symlinks, so a symlinked-inside copy counts as present and is then rejected as
 * broken by resolveFromDeps's containment check. Exported (doctor/WP-103 uses it).
 * @param {WienerdogPaths} paths
 * @returns {boolean}
 */
function depsPresent(paths) {
  return fs.existsSync(path.join(depsDir(paths), 'node_modules', 'googleapis', 'package.json'));
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
  // (1) Absent unless the deps-dir copy is physically present (its own package.json
  //     exists). Pure existence check — no resolution, so nothing is looked up in
  //     ancestors or cached.
  if (!depsPresent(paths)) return null;
  const candidate = path.join(dir, 'node_modules', 'googleapis');
  // (2) Resolve the ABSOLUTE candidate path (never the bare 'googleapis' request),
  //     so resolution targets exactly this dir, never walks ancestors, and is not
  //     served from Module._pathCache (the bare-request cache key is never used).
  //     NOTE: this can THROW when the tree is present but its main is missing/
  //     malformed — callers treat a throw as "present but broken" (§2/§3b), never
  //     as absent.
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
 * (never a raw MODULE_NOT_FOUND). Keys the absent/broken split on PHYSICAL
 * presence (`depsPresent`), not resolvability (round-6 P2): a tree whose
 * package.json exists but whose main is missing/malformed makes resolveFromDeps
 * THROW, which would mis-classify it absent under a resolvable key → self-heal
 * would `npm`-over-corrupt → arborist can no-op → permanent loop.
 * @param {WienerdogPaths} paths
 * @returns {object}
 */
function loadGoogleapis(paths) {
  const present = depsPresent(paths); // physical presence — the classification key (round-6 P2)
  if (present) {
    try {
      const hit = resolveFromDeps(paths); // may THROW (bad main) or return null (symlink-out)
      if (hit) {
        const mod = hit.req(hit.resolved); // may THROW (corrupt entry point)
        // SHAPE check: a zero-byte / stub `index.js` requires to `{}` without
        // throwing but has no `.google`, so getServices would later crash with a
        // raw TypeError at `new google.auth.OAuth2`. Require a truthy `.google`.
        if (mod && typeof mod.google === 'object' && mod.google) return mod; // healthy
      }
      // hit === null (symlink-out) or shape-fail → present-but-broken; fall through.
    } catch {
      /* resolve-throw (bad main) or require-throw (corrupt) — present-but-broken */
    }
  }
  // Disambiguate the states that share this failure (BUG-gws-deps-missing):
  if (hasToken(paths)) {
    const dir = depsDir(paths);
    const cmd = `npm install --ignore-scripts --prefix "${dir}" ${GOOGLEAPIS_SPEC}`;
    if (present) {
      // CONNECTED but a deps tree is physically present yet not usable
      // (bad main / corrupt entry / no `.google` / symlink-out): the read-path
      // self-heal NO-OPs here (depsPresent is true), and a plain reinstall can
      // NO-OP too — npm compares tree metadata (recorded version/integrity), NOT
      // file contents (round-4 Finding). The tree must be REMOVED first. The deps
      // dir is single-purpose, so deleting it wholesale is safe. Platform-neutral
      // prose (not a per-OS rm/Remove-Item one-liner) — CLAUDE.md.
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
 * googleapis@<major>`. Child stdin inherits from the parent; child stdout AND
 * stderr both go to the parent's STDERR (fd 2) so npm's progress is visible but
 * never lands on a piped stdout (round-6 P1). The argv array needs no quoting
 * (no shell — only the human-facing command STRINGS are quoted).
 * `--ignore-scripts` because googleapis is pure JS; disabling lifecycle scripts
 * removes a residual supply-chain surface. Runs synchronously and exits
 * (ADR-0004).
 * @param {string} dir
 * @param {string} spec
 * @returns {{status:number}}
 */
function defaultRunInstall(dir, spec) {
  const r = spawnSync('npm', ['install', '--ignore-scripts', '--prefix', dir, spec], {
    stdio: ['inherit', 2, 2],
  });
  return { status: r.status == null ? 1 : r.status };
}

/**
 * Ensure googleapis is installed in the deps dir, once, with consent (ADR-0011
 * posture: show the exact command, default yes, fail-to-print on decline/failure).
 * No-op when already healthy; a present-but-broken tree fails to the honest
 * delete-then-reinstall remedy — never `npm`-over-corrupt (round-6 P2). ALL
 * chatter (notice, prompt, npm output) goes to STDERR so a piped stdout stays
 * clean (round-6 P1). Seams: opts.confirm, opts.runInstall, opts.yes.
 * @param {WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<{installed:boolean, already?:boolean}>}
 */
async function ensureGoogleapis(paths, opts = {}) {
  if (isInstalled(paths)) return { installed: false, already: true }; // healthy → no-op
  const dir = depsDir(paths);
  // P2-A: quote the prefix (space-safe home paths); same form as loadGoogleapis.
  const cmd = `npm install --ignore-scripts --prefix "${dir}" ${GOOGLEAPIS_SPEC}`;
  // round-6 P2 (auth path): a deps tree is physically present but NOT usable
  // (isInstalled false, e.g. bad main / symlink-out). A plain reinstall may no-op
  // over it (arborist metadata compare), so fail to the HONEST delete-then-reinstall
  // remedy instead of npm-over-corrupt — never auto-repair (owner disposition).
  if (depsPresent(paths)) {
    throw new WienerdogError(
      `Google's client library is installed but not loadable. Delete the folder ${dir}, then reinstall it:\n  ${cmd}`
    );
  }
  // Truly absent → consented install. round-6 P1: ALL chatter goes to STDERR so a
  // piped read (`gws … --json | jq`) keeps clean stdout.
  process.stderr.write(`\nWienerdog needs Google's client library. It will run:\n  ${cmd}\n`);
  const ask = opts.confirm || confirm;
  // P2-B: {defaultYes:true} so Enter ACCEPTS. round-6 P1: output:process.stderr so
  // the prompt question is visible (and not written into a piped stdout).
  const ok = opts.yes || (await ask('Install it now? [Y/n] ', { defaultYes: true, output: process.stderr }));
  if (!ok) throw new WienerdogError(`declined — run this yourself, then retry:\n  ${cmd}`);
  fs.mkdirSync(dir, { recursive: true });
  const run = opts.runInstall || defaultRunInstall;
  const r = run(dir, GOOGLEAPIS_SPEC);
  if (r.status !== 0) throw new WienerdogError(`install failed — run it yourself, then retry:\n  ${cmd}`);
  return { installed: true };
}

/**
 * Self-heal the on-demand googleapis install on the READ path. When a Google
 * sign-in token exists but NO deps tree is present (the post-WP-047-upgrade
 * dead-end, BUG-gws-deps-missing), install it once — with consent, exactly like
 * first auth (ADR-0011/ADR-0013). No-op when a deps tree is already PRESENT
 * (healthy or broken — never install over it), or when no token exists (an
 * unauthed user; getServices()'s loadToken then surfaces the connect-Google flow
 * unchanged). Consent seams pass straight through to ensureGoogleapis: interactive
 * → a [Y/n] prompt (on stderr); non-TTY/headless → ensureGoogleapis throws the
 * accurate, browser-free npm-install remedy.
 * @param {WienerdogPaths} paths
 * @param {{yes?:boolean, confirm?:(q:string)=>Promise<boolean>,
 *          runInstall?:(dir:string,spec:string)=>{status:number}}} [opts]
 * @returns {Promise<void>}
 */
async function ensureGoogleReady(paths, opts = {}) {
  if (depsPresent(paths)) return; // a deps tree is present (healthy or broken) — never install over it
  if (!hasToken(paths)) return; // unauthed — do not install; let loadToken surface the connect flow
  await ensureGoogleapis(paths, opts);
}

module.exports = {
  GOOGLEAPIS_SPEC,
  depsDir,
  depsPresent,
  isInstalled,
  loadGoogleapis,
  ensureGoogleapis,
  ensureGoogleReady,
  defaultRunInstall,
};
