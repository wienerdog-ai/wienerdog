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
 *  On win32 the tmp reparse point is created as a directory JUNCTION (type
 *  'junction'), which a non-elevated user can always create for an ABSOLUTE
 *  target — unlike a symlink, which needs Developer Mode or elevation. Our
 *  targets are always absolute directories (ADR-0013), so a junction is valid.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {string} targetDir
 *  @param {{rename?: (from: string, to: string) => void,
 *           symlink?: (target: string, path: string, type?: string) => void,
 *           platform?: string}} [opts]
 *    test seams only; default fs.renameSync / fs.symlinkSync / process.platform. */
function repointCurrent(paths, targetDir, opts = {}) {
  const rename = opts.rename || fs.renameSync;
  const symlink = opts.symlink || fs.symlinkSync;
  const platform = opts.platform || process.platform;
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
    if (platform === 'win32') symlink(targetDir, tmp, 'junction');
    else symlink(targetDir, tmp);
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
 * Recursively clear the write bits on every regular FILE under `dir` (dirs left
 * writable). Defense-in-depth on the published app tree (audit A7/F2, WP-157):
 * an in-place overwrite of an app file now needs a chmod first. Directories are
 * deliberately NOT made read-only, so uninstall's `rmSync(app, {recursive})`
 * still unlinks the files without a manifest.js change (unlinking a read-only
 * file from a writable dir succeeds on POSIX). The fire-time treeDigest check
 * (launcher.js) is the primary defense; this only raises the bar on the naive
 * overwrite. Best-effort — never throws. No-op on win32 (POSIX mode semantics).
 * @param {string} dir
 */
function makeTreeFilesReadOnly(dir) {
  if (process.platform === 'win32') return;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        try {
          const mode = fs.statSync(full).mode & 0o777;
          fs.chmodSync(full, mode & ~0o222);
        } catch {
          /* best-effort */
        }
      }
    }
  };
  walk(dir);
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
      // A7/F2: make the published files read-only AFTER the atomic publish (never
      // the dev checkout). Skipped on a re-vendor of the same version (the dir
      // already exists → no re-copy), so idempotence is preserved.
      makeTreeFilesReadOnly(target);
      copied = true;
    }
  }
  repointCurrent(paths, target);
  // A7/F1/F2/F3 (WP-157): place the out-of-tree launcher the scheduler invokes.
  // Its source is the RUNNING installer (packageRoot), not the vendored
  // `root` — the launcher is the installer's own verifier and always ships with
  // the package (a synthetic test `sourceRoot` need not carry it).
  writeLauncher(paths, { manifest: opts.manifest });
  return { version, target, dev, copied };
}

/**
 * Verify `<core>/app/current` resolves INSIDE `<core>/app` (realpath-canonical —
 * no out-of-root symlink) and is owned by the current user (POSIX; win32 reduced
 * to the containment check). The launcher inlines an equivalent (it cannot
 * require this from the very tree it is verifying); this export is for doctor /
 * tests. Note: a DEV install's `current` legitimately points at the checkout
 * OUTSIDE `<core>/app`, so this returns ok:false for dev — callers gate it on
 * the prod stance (WP-157).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {NodeJS.Platform} [platform=process.platform]
 * @returns {{ok:true, target:string}|{ok:false, why:string}}
 */
function verifyCurrentContainment(paths, platform = process.platform) {
  const app = appDir(paths);
  const link = currentLink(paths);
  let outer;
  let inner;
  try {
    outer = fs.realpathSync(app);
    inner = fs.realpathSync(link);
  } catch (err) {
    return { ok: false, why: `cannot resolve app/current: ${err.message}` };
  }
  const rel = path.relative(outer, inner);
  if (rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel))) {
    return { ok: false, why: `app/current resolves outside ${app}` };
  }
  if (platform !== 'win32') {
    const uid = process.getuid ? process.getuid() : 0;
    let st;
    try {
      st = fs.statSync(inner);
    } catch (err) {
      return { ok: false, why: `cannot stat app/current target: ${err.message}` };
    }
    if (st.uid !== uid && st.uid !== 0) {
      return { ok: false, why: `app/current is owned by uid ${st.uid}, not the current user (${uid}) or root` };
    }
  }
  return { ok: true, target: inner };
}

/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/launcher/launch.js */
function launcherPath(paths) {
  return path.join(paths.core, 'launcher', 'launch.js');
}

/**
 * Place the out-of-tree launcher at `<core>/launcher/launch.js` by copying the
 * self-contained `src/scheduler/launcher.js` bytes OUT of the app tree (WP-157).
 * It is a SECONDARY anchor: distinct from `app/current`, so a scoped write to
 * the app tree cannot disable the fire-time verification. Idempotent (skip when
 * byte-identical); records a `file` manifest entry once; mode 0755 (POSIX).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, sourceRoot?: string}} [opts]  sourceRoot defaults
 *   to packageRoot() — the launcher is the installer's own file, not vendored
 *   app content.
 * @returns {{path:string, changed:boolean}}
 */
function writeLauncher(paths, opts = {}) {
  const root = opts.sourceRoot || packageRoot();
  const src = path.join(root, 'src', 'scheduler', 'launcher.js');
  const dest = launcherPath(paths);
  const content = fs.readFileSync(src);
  let same = false;
  try {
    same = fs.readFileSync(dest).equals(content);
  } catch {
    same = false;
  }
  let changed = false;
  if (!same) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, { mode: 0o755 });
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
    changed = true;
  }
  if (opts.manifest) {
    // Record the dir BEFORE the file: reverse() replays in reverse order, so the
    // file (launch.js) is removed first and the now-empty launcher/ dir is
    // rmdir'd after — otherwise the lingering dir keeps <core> non-empty and
    // uninstall cannot remove the core.
    recordOnce(opts.manifest, { kind: 'dir', path: path.dirname(dest) });
    recordOnce(opts.manifest, { kind: 'file', path: dest });
  }
  return { path: dest, changed };
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
  // Single-parser-block form (WP-067, supersedes WP-051): cmd.exe re-opens the
  // batch file after each line executes, so a two-line `@echo off` / `node …`
  // launcher crashes with "The batch file cannot be found." if the invoked
  // command (e.g. `wienerdog uninstall`) deletes this .cmd mid-run — cmd tries
  // to re-open the file for the next line and it's gone. Fix: put the node
  // invocation and the batch-terminating `exit /b` on ONE line, which cmd reads
  // into memory before `node` runs, so mid-run self-deletion can't affect what
  // cmd does next. `&` (never `&&`) runs `exit /b` unconditionally — including
  // on node's failure path — and `exit /b` with no code ends batch processing
  // from memory (no re-open) while leaving ERRORLEVEL as node set it, so the
  // shim's exit code still reflects node's.
  let cmdPath = null;
  let cmdChanged = false;
  if (platform === 'win32') {
    cmdPath = path.join(localBin, 'wienerdog.cmd');
    const cmdContent = `@node "${currentBin(paths)}" %* & exit /b\r\n`;
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
  writeLauncher, launcherPath, verifyCurrentContainment, makeTreeFilesReadOnly,
};
