'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Published-files list to vendor (matches package.json "files" + package.json
// itself). NEVER copies node_modules or .git (not in this list). ADR-0013.
const COPY_INCLUDE = ['bin', 'src', 'skills', 'templates', 'package.json'];

/** Root of the RUNNING package (…/wienerdog). @returns {string} */
function packageRoot() { return path.resolve(__dirname, '..', '..'); }

/** @param {string} root @returns {string} version from <root>/package.json */
function readVersion(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/app */
function appDir(paths) { return path.join(paths.core, 'app'); }
/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/app/current */
function currentLink(paths) { return path.join(appDir(paths), 'current'); }
/** Stable bin the scheduler + self-invocations target.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function currentBin(paths) { return path.join(currentLink(paths), 'bin', 'wienerdog.js'); }

/** Dev checkout? A `.git` dir at `root`, or WIENERDOG_DEV=1.
 *  @param {string} root @param {NodeJS.ProcessEnv} [env] @returns {boolean} */
function isDevCheckout(root, env = process.env) {
  if (env.WIENERDOG_DEV === '1') return true;
  try { return fs.statSync(path.join(root, '.git')).isDirectory(); } catch { return false; }
}

/** Copy the COPY_INCLUDE entries from srcRoot into destRoot (overwrite).
 *  @param {string} srcRoot @param {string} destRoot */
function copyTree(srcRoot, destRoot) {
  fs.mkdirSync(destRoot, { recursive: true });
  for (const name of COPY_INCLUDE) {
    const src = path.join(srcRoot, name);
    let st;
    try { st = fs.statSync(src); } catch { continue; } // missing entry → skip
    const dest = path.join(destRoot, name);
    if (st.isDirectory()) fs.cpSync(src, dest, { recursive: true });
    else fs.copyFileSync(src, dest);
  }
}

/** Point <core>/app/current at targetDir.
 *  Fast path: when `current` already points at targetDir, do nothing (skip the
 *  symlink+rename). This is the common case (every sync re-vendors the SAME
 *  version) and on Windows the rewrite would needlessly exercise the
 *  remove-then-rename fallback below — which can self-lock when a node process is
 *  running from inside app/current (the shim/scheduler invocation path holds the
 *  reparse point, so rmSync and rename both raise EPERM/EBUSY).
 *  Otherwise: POSIX `rename` over the existing symlink is atomic; on Windows
 *  renaming over an existing directory symlink throws EPERM/EEXIST/ENOTEMPTY —
 *  fall back to remove-old-link then rename (brief non-atomic window, acceptable
 *  under the module's single-writer assumption, ADR-0013).
 *  Always sweeps orphaned `current.tmp.*` symlinks left by earlier crashed runs.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {string} targetDir
 *  @param {{rename?: (from: string, to: string) => void}} [opts]
 *    test seam only; defaults to fs.renameSync. */
function repointCurrent(paths, targetDir, opts = {}) {
  const rename = opts.rename || fs.renameSync;
  const link = currentLink(paths);
  // Read the current stored target (null if `current` is absent or not a symlink).
  let existing = null;
  try { existing = fs.readlinkSync(link); } catch { existing = null; }
  // Compare via path.resolve: our stored targets are always absolute, so resolve
  // is pure normalization (no cwd dependence) and also reconciles a benign
  // trailing separator some platforms' readlink may append. Equal → no-op.
  const same = existing !== null && path.resolve(existing) === path.resolve(targetDir);
  if (!same) {
    const tmp = `${link}.tmp.${process.pid}`;
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    fs.symlinkSync(targetDir, tmp);
    try {
      rename(tmp, link); // atomic on POSIX
    } catch (err) {
      if (err && ['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(err.code)) {
        // Windows: cannot rename over an existing directory symlink. Remove the
        // old link, then rename into place (brief non-atomic window).
        fs.rmSync(link, { recursive: true, force: true });
        rename(tmp, link);
      } else {
        throw err;
      }
    }
  }
  // Self-heal: remove orphaned current.tmp.* from earlier crashed runs (any pid).
  // Runs on BOTH the no-op and the rewrite path. Our own tmp (if created) was
  // already renamed away and will not match.
  let leftovers = [];
  try { leftovers = fs.readdirSync(appDir(paths)); } catch { leftovers = []; }
  for (const name of leftovers) {
    if (name.startsWith('current.tmp.')) {
      try { fs.rmSync(path.join(appDir(paths), name), { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

/**
 * Vendor the running package into the core and repoint `current`.
 * - Prod: copy the published files into <core>/app/<version>/ (idempotent: if
 *   that version dir already exists, do NOT re-copy), then repoint current.
 * - Dev: point current at the checkout root itself (no copy).
 * Records the vendored-tree manifest entry once. Never throws on an already-
 * present version. Single-writer assumption (install is not concurrent).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, env?: NodeJS.ProcessEnv, sourceRoot?: string}} [opts]
 * @returns {{version:string, target:string, dev:boolean, copied:boolean}}
 */
function vendorSelf(paths, opts = {}) {
  const env = opts.env || process.env;
  const root = opts.sourceRoot || packageRoot();
  const version = readVersion(root);
  const dev = isDevCheckout(root, env);
  const app = appDir(paths);
  fs.mkdirSync(app, { recursive: true });
  if (opts.manifest) recordOnce(opts.manifest, { kind: 'vendored-tree', path: app });

  let target;
  let copied = false;
  if (dev) {
    target = root;
  } else {
    target = path.join(app, version);
    if (!fs.existsSync(target)) {
      const staging = `${target}.staging.${process.pid}`;
      fs.rmSync(staging, { recursive: true, force: true });
      copyTree(root, staging);
      fs.renameSync(staging, target); // atomic publish of the version dir
      copied = true;
    }
  }
  repointCurrent(paths, target);
  return { version, target, dev, copied };
}

/** Record an entry only if no entry with the same kind+path exists. */
function recordOnce(manifest, entry) {
  const exists = manifest.entries.some((e) => e.kind === entry.kind && e.path === entry.path);
  if (!exists) manifest.entries.push(entry);
}

/**
 * Write the PATH shim(s) so bare `wienerdog …` resolves for the brain and the
 * user (ADR-0013). Always writes an executable bash launcher
 * ~/.local/bin/wienerdog → the vendored current bin. On native Windows (where
 * cmd.exe/PowerShell cannot run the bash shim) it ADDITIONALLY writes a
 * ~/.local/bin/wienerdog.cmd that shells out to `node "<current bin>" %*`.
 * Idempotent (skip each file when byte-identical). Records a manifest `file`
 * entry per file written (uninstall removes them). Does NOT record/remove the
 * ~/.local/bin dir (may be user-shared).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, platform?: string}} [opts]
 *   platform defaults to process.platform; tests pass it to exercise both branches.
 * @returns {{path:string, changed:boolean, onPath:boolean, cmdPath:(string|null), cmdChanged:boolean}}
 */
function writeShim(paths, opts = {}) {
  const platform = opts.platform || process.platform;
  const localBin = path.join(paths.home, '.local', 'bin');
  const shimPath = path.join(localBin, 'wienerdog');
  const content =
    '#!/usr/bin/env bash\n' +
    '# Wienerdog CLI shim (managed) — points at the vendored app entry (ADR-0013).\n' +
    `exec node "${currentBin(paths)}" "$@"\n`;
  let same = false;
  try { same = fs.readFileSync(shimPath, 'utf8') === content; } catch { same = false; }
  let changed = false;
  if (!same) {
    fs.mkdirSync(localBin, { recursive: true });
    fs.writeFileSync(shimPath, content, { mode: 0o755 });
    fs.chmodSync(shimPath, 0o755);
    changed = true;
  }
  if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: shimPath });

  // Native Windows: the bash shim is not runnable by cmd.exe/PowerShell. Write a
  // .cmd launcher next to it that execs the vendored current bin. CRLF is
  // canonical for .cmd; the embedded absolute path comes from currentBin(paths).
  let cmdPath = null;
  let cmdChanged = false;
  if (platform === 'win32') {
    cmdPath = path.join(localBin, 'wienerdog.cmd');
    const cmdContent = `@echo off\r\nnode "${currentBin(paths)}" %*\r\n`;
    let cmdSame = false;
    try { cmdSame = fs.readFileSync(cmdPath, 'utf8') === cmdContent; } catch { cmdSame = false; }
    if (!cmdSame) {
      fs.mkdirSync(localBin, { recursive: true });
      fs.writeFileSync(cmdPath, cmdContent);
      cmdChanged = true;
    }
    if (opts.manifest) recordOnce(opts.manifest, { kind: 'file', path: cmdPath });
  }

  const onPath = (process.env.PATH || '').split(path.delimiter).includes(localBin);
  return { path: shimPath, changed, onPath, cmdPath, cmdChanged };
}

module.exports = {
  packageRoot, readVersion, appDir, currentLink, currentBin,
  isDevCheckout, copyTree, repointCurrent, vendorSelf, writeShim,
};
