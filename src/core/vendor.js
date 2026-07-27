'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { WienerdogError } = require('./errors');
// D8 (WP-stance-authority-containment, Table G row 2): NO new predicate. The
// existing, length-guarded `isSemver` already guards the IDENTICAL
// `path.join(appDir(paths), version)` construction in src/core/tarball.js.
const { isSemver } = require('./update-check');

// Published-files list to vendor (matches package.json "files" + package.json
// itself). NEVER copies node_modules or .git (not in this list). ADR-0013.
const COPY_INCLUDE = ['bin', 'src', 'skills', 'templates', 'package.json'];

/** Root of the RUNNING package (…/wienerdog). @returns {string} */
function packageRoot() { return path.resolve(__dirname, '..', '..'); }

/** @param {string} root @returns {string} version from <root>/package.json
 *  @throws {WienerdogError} when the value is not strict semver — an app tree
 *  whose package.json declares one is tampered, and `path.join(app, version)`
 *  would escape `<core>/app`, collide with the `current` symlink (any case, on
 *  a case-insensitive FS) or evade repointCurrent's `current.tmp.` sweep
 *  (WP-stance-authority-containment D8, Table G row 2). */
function readVersion(root) {
  const v = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (!isSemver(v)) {
    throw new WienerdogError(
      `refusing to use ${path.join(root, 'package.json')}: "version" is ${JSON.stringify(v)}, ` +
        'which is not a plain version token — the app tree looks tampered; reinstall Wienerdog.'
    );
  }
  return v;
}

/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/app */
function appDir(paths) { return path.join(paths.core, 'app'); }
/** @param {import('./paths').WienerdogPaths} paths @returns {string} <core>/app/current */
function currentLink(paths) { return path.join(appDir(paths), 'current'); }
/** Stable bin the scheduler + self-invocations target.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string} */
function currentBin(paths) { return path.join(currentLink(paths), 'bin', 'wienerdog.js'); }

/** Dev checkout? A `.git` at `root` that is a DIRECTORY (normal clone) OR a
 *  regular FILE (git worktree). Decides copy-vs-link in `vendorSelf` ONLY — it
 *  is NOT the stance authority (that is `installStance`) and it deliberately
 *  takes no `env`: no environment variable may select a verification path
 *  (WP-stance-authority-containment, Table D).
 *  @param {string} root @returns {boolean} */
function isDevCheckout(root) {
  try {
    const st = fs.statSync(path.join(root, '.git'));
    return st.isDirectory() || st.isFile();
  } catch { return false; }
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
 *
 * SELF-RESYNC: when the running installer IS the tree `app/current` already
 * resolves to (the shim path on every install), `current` is left pointing
 * exactly where it pointed and NO signal inside that tree can SELECT that
 * target: `isDevCheckout` is not called at all, and `target` is the realpath of
 * `current` itself. `readVersion(root)` still runs (it always did — it is the
 * returned/printed `version`), but its value cannot reach the target path and is
 * strict-semver validated, so a tampered version REFUSES the call instead of
 * moving containment. Against DATA-shaped A7 writes an attended `sync` therefore
 * carries containment forward, OR refuses (V9).
 * SCOPE: this says nothing about an A7 write that REPLACES this module's code
 * or relocates packageRoot() via a symlink — the mint runs out of the tree it
 * is vendoring, so that channel is structural and is NOT closed here
 * (WP-stance-authority-containment, Table G rows S1/S2; the fire-time tree
 * digest catches it until the next attended sync). Changing an install's stance
 * otherwise requires running the installer from a DIFFERENT, NON-DEV source root
 * (a git checkout links itself in place and stays dev), which is an attended
 * act — WP-stance-authority-containment Table G row 1's recovery property.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, env?: NodeJS.ProcessEnv, sourceRoot?: string}} [opts]
 *   `env` is accepted and IGNORED — no environment variable may select a
 *   verification path (Table D).
 * @returns {{version:string, target:string, dev:boolean, copied:boolean}}
 *   `dev` is now `installStance(paths) === 'dev'`, evaluated AFTER the repoint,
 *   so the value `src/cli/sync.js:206` prints agrees with Table A.
 */
function vendorSelf(paths, opts = {}) {
  const root = opts.sourceRoot || packageRoot();
  const version = readVersion(root);
  const app = appDir(paths);
  fs.mkdirSync(app, { recursive: true });
  if (opts.manifest) recordOnce(opts.manifest, { kind: 'vendored-tree', path: app });

  // SELF-RESYNC: the running installer IS the tree `app/current` already
  // resolves to. Carry containment forward: let NO signal inside that tree
  // select the target — `isDevCheckout` is not called, and `target` is the
  // realpath of `current` itself. (`readVersion` still runs above; its value
  // cannot reach `target` and is semver-validated, so a tampered version
  // refuses the call.) Table G row 1 + canonical scope statement;
  // ADR-0028 amendment §3 mint-time half.
  let selfResync = false;
  try {
    selfResync = fs.realpathSync(currentLink(paths)) === fs.realpathSync(root);
  } catch { selfResync = false; }

  let target;
  let copied = false;
  if (selfResync) {
    target = fs.realpathSync(currentLink(paths));
  } else if (isDevCheckout(root)) {
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
  // Table G row 3: the returned `dev` is CONTAINMENT-derived (Table A), not
  // `.git`-derived, and is evaluated AFTER the repoint — so `src/cli/sync.js`'s
  // message cannot contradict the descriptor the same `sync` mints.
  const dev = installStance(paths) === 'dev';
  // A7/F1/F2/F3 (WP-157): place the out-of-tree launcher the scheduler invokes.
  // On a NON-self-resync its source is the running installer (`packageRoot()`),
  // which is a different tree from the one `app/current` resolves to — a real
  // upgrade, so publish. On a PROD self-resync `packageRoot()` IS that tree
  // (the shim enters through `app/current`), so there is no newer launcher to
  // offer and re-publishing would let one app-tree write become the fire-time
  // verifier: carry the existing one forward instead
  // (WP-launcher-no-self-resync-republish, Table L). A DEV self-resync still
  // publishes — its `app/current` is the maintainer's checkout and its
  // descriptor binds the reduced digest anyway (ADR-0028 amendment #7).
  writeLauncher(paths, { manifest: opts.manifest, carryForward: selfResync && !dev });
  return { version, target, dev, copied };
}

/**
 * The install's STANCE, decided by CONTAINMENT of `<core>/app/current` inside
 * `<core>/app` — the one property an A7-scoped DATA write into the app tree
 * cannot forge (ADR-0028 amendment §3/§4, WP-stance-authority-containment).
 * Consults NO signal inside the tree: not `.git`, not any environment variable
 * (the dev-mode env var is deleted outright — Table D; naming it here would put
 * the token back under `src/`, which AC10 forbids), not any file under
 * `app/current`. Fails CLOSED: any unresolvable path ⇒ 'prod',
 * the ENFORCED path. MUST stay behaviourally identical to the launcher's inlined
 * `liveStance` (a cross-implementation test pins that).
 * Deliberately does NOT delegate to `verifyCurrentContainment` below, and the
 * small duplication is the point: that function ALSO fails on POSIX ownership,
 * so delegating would let a foreign-owned `current` select the REDUCED
 * verification path. Ownership must never select an arm (Table A).
 * SCOPE: an app-tree write that replaces the MINT'S OWN CODE still moves
 * containment, because the attended mint runs out of the tree it is vendoring.
 * That channel is known-open and owner-routed; the app release digest covers it
 * until the next attended `sync`. Do not add a guard for it here.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {'prod'|'dev'}
 */
function installStance(paths) {
  let outer;
  let inner;
  try {
    outer = fs.realpathSync(appDir(paths));
    inner = fs.realpathSync(currentLink(paths));
  } catch {
    return 'prod'; // fail closed to the ENFORCED path
  }
  const rel = path.relative(outer, inner);
  return rel !== '' && (rel.startsWith('..') || path.isAbsolute(rel)) ? 'dev' : 'prod';
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
 * It is a SECONDARY anchor: it lives outside `app/current`. It is NOT by itself
 * a complete defence against a write into the app tree — the bytes' honest
 * source is `packageRoot()`, which on a shim-reached prod install IS that tree,
 * which is why `carryForward` exists. Channels that remain open are owner-routed:
 * see WP-stance-authority-containment, Table G row S2 (row S1 is the one
 * `carryForward` closes), and this function's dev arm, which always publishes.
 * Idempotent (skip when byte-identical); records the `<core>/launcher` dir entry
 * and then the `launch.js` file entry, once each, on BOTH arms; mode 0755 (POSIX).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{manifest?: object, sourceRoot?: string, carryForward?: boolean}} [opts]
 *   carryForward: when true, DO NOT read `sourceRoot`/`packageRoot()` at all —
 *   keep the launcher already at `<core>/launcher/launch.js`. Throws a
 *   WienerdogError if that file is missing or unreadable. `sourceRoot` is
 *   ignored when `carryForward` is true.
 * @returns {{path:string, changed:boolean}}   changed is false on the carry arm
 * @throws {WienerdogError} carryForward with no readable existing launcher. The
 *   message MUST carry three fields: the absolute destination path, the failing
 *   `err.code` (e.g. ENOENT / EISDIR / EACCES), and the recovery command
 *   `npx wienerdog@latest sync`. All three are gated by T2.
 */
function writeLauncher(paths, opts = {}) {
  const dest = launcherPath(paths);
  let changed = false;
  if (opts.carryForward) {
    // Table L row 2/3: a self-resync has no newer launcher to offer, and the
    // only tree it could take one from is the tree it is re-vendoring. Prove
    // the existing launcher is readable, then leave it alone. Fail CLOSED if it
    // is not — re-publishing from the app tree is precisely what this arm exists
    // to remove (WP-launcher-no-self-resync-republish).
    try {
      fs.readFileSync(dest);
    } catch (err) {
      throw new WienerdogError(
        `the out-of-tree launcher at ${dest} is missing or unreadable (${err.code || err.message}), ` +
        'and it is deliberately NOT re-published from the app tree this sync is re-vendoring. ' +
        'If something else occupies that path, remove it first; then reinstall from a clean ' +
        'source: `npx wienerdog@latest sync`.'
      );
    }
  } else {
    const root = opts.sourceRoot || packageRoot();
    const src = path.join(root, 'src', 'scheduler', 'launcher.js');
    const content = fs.readFileSync(src);
    let same = false;
    try {
      same = fs.readFileSync(dest).equals(content);
    } catch {
      same = false;
    }
    if (!same) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content, { mode: 0o755 });
      if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
      changed = true;
    }
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
  installStance,
};
