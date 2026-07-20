'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WienerdogError } = require('./errors');

/**
 * Private-by-default modes for the whole Wienerdog mechanics root (audits A5 +
 * A9, ADR-0024, WP-126 + WP-a9-private-modes-repair): 0700 dirs / 0600 files,
 * independent of umask, with an explicit final chmod (mkdir's mode is
 * umask-masked on some platforms). Mirrors the proven identity-approvals/
 * ledger atomic-write shape.
 *
 * Coverage (single enumerator, three surfaces): the A5 set (core/state/logs
 * dirs, digest/alerts/ledger/approvals files, per-run logs, dream scratch,
 * quarantine) UNION the A9 set (`secrets/` and every file directly inside it —
 * GWS tokens + client JSON — the grants/pins/run-evidence state files, every
 * `logs/<job>` subdirectory, and the four repair-only metadata files
 * config.yaml / install-manifest.json / schedule.json / watermarks.json,
 * whose WRITERS stay unchanged per the DATED OWNER DECISION 2026-07-19).
 *
 * win32 posture (OWNER-APPROVED 2026-07-17): POSIX modes do not exist there —
 * chmod is a best-effort no-op, the scan reports {insecure: 0}, and WP-127
 * documents that Windows protection relies on the per-user profile ACLs.
 *
 * Never-follow guarantee (G2–G5 + F1–F11, ADR-0027) — stated HONESTLY, NOT as an
 * unconditional "never follows symlinks". A PRE-EXISTING symlink is caught at
 * EVERY position × phase — `{root, intermediate, leaf}` × `{enumerate,
 * dir-chmod, file-chmod, 000-fallback, mkdir, open-write, temp-write}` AND on the
 * FAILURE path AND the whole top-level protected set (F9/F12/F13: a single
 * `mechanicsRootUntrusted` entry gate over core/state/logs/secrets refuses at
 * the top of `run()`/`dream.run` before ANY dispatch mode or writer; the failure
 * surfaces via a non-core channel, stderr + email):
 *  - ROOT: `coreRootContext` opens the core `O_DIRECTORY|O_NOFOLLOW` + fstat
 *    before trusting its realpath — a symlinked/non-dir core is an anomaly, NO
 *    descendant is enumerated/repaired, every WRITE refuses, and the entry gate
 *    (`mechanicsRootUntrusted` over core/state/logs/secrets) refuses every
 *    dispatch — runJob, catchUp (named + empty), dream, probes (G5/F3/F5/F9/F12/F13);
 *  - INTERMEDIATE: repair revalidates each opened fd by (dev, ino) against the
 *    classifying lstat (a redirected open → different inode → refused, G3); the
 *    write helpers validate the whole in-core ancestor chain
 *    (`assertInCoreAncestry`) so a symlinked intermediate dir refuses (F5);
 *  - LEAF: EVERY candidate — statically-named AND dynamically-enumerated
 *    (`secrets/`, `logs/<job>/`, `dream-scratch/`, `quarantine/`; `listNames`
 *    keeps symlink Dirents) — is lstat-classified (symlink/escape → anomaly,
 *    G2/F2); repair chmods via an `O_NOFOLLOW` fd + (dev, ino); writes open
 *    `O_NOFOLLOW` (log stream) or a crypto-random `O_EXCL|O_NOFOLLOW` temp
 *    (`writeFilePrivate`, F6 — closes the predictable-temp-symlink class).
 * The RESIDUAL is ONLY the CLASS of concurrent OWNER-LEVEL swaps DURING an
 * operation — no pre-existing case, and NOT "only readdir". FOUR windows, all
 * the SAME same-user concurrent-writer class ADR-0028 hands to A12 ("Honest
 * boundary — the A7 residual"); pure Node cannot PREVENT any (no
 * openat/openat2/fdopendir; no portable fd-bound chmod for a mode-000 entry —
 * O_PATH absent on macOS, /proc Linux-only). Consequences DIFFER — per-window
 * (do NOT claim uniform loudness):
 *   W1. readdir-enumeration → fd-bind (repair): the (dev, ino) fd-revalidation
 *       REFUSES the redirected open — no chmod; surfaced by the next scan.
 *   W2. ancestor validate/open → leaf op (repair AND write): the repair path
 *       still refuses via (dev, ino), BUT the WRITE helpers have NO post-open
 *       ancestry revalidation — after `assertInCoreAncestry`/the open, a
 *       concurrent ancestor swap redirects the leaf op to an EXTERNAL target and
 *       the helper returns SUCCESSFULLY. This window can SILENTLY chmod/write/
 *       rename out-of-tree AND, via `rotateLogs`, silently DELETE external files
 *       (F11 adds a cheap lstat-first guard that narrows but cannot close it).
 *   W3. mode-000 lstat → path-`chmodSync` (`applyModeFallback`): worst case ONE
 *       chmod on a swapped target. The post-chmod (dev, ino) re-lstat surfaces it
 *       LOUDLY only if the substitution PERSISTS through revalidation — an ABA
 *       swap (restore the original inode before the final lstat) DEFEATS the
 *       check and chmods one external target SILENTLY (F14). Detection is
 *       conditional, NOT unconditional loudness.
 *   W4. temp O_EXCL-open → rename-target substitution (`writeFilePrivate`): a
 *       concurrent unlink+symlink at the temp name makes rename land a foreign
 *       target. F10 DETECTS it (post-rename (dev,ino) lstat → loud throw) —
 *       detection, NOT prevention, and (like W3) an ABA swap that restores the
 *       inode before the check defeats detection.
 * In every window the attacker must ALREADY hold concurrent owner-level write
 * access inside the already-0700 core.
 */

const WIN32 = process.platform === 'win32';

/** The A5-scoped private DIRECTORIES (0700). state/quarantine is WP-123's
 *  staged-output secret quarantine — it can hold raw secret bytes.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A5_PRIVATE_DIRS = (paths) => [
  paths.core,
  paths.state,
  paths.logs,
  path.join(paths.state, 'dream-scratch'),
  path.join(paths.state, 'quarantine'),
];

/** The A5-scoped private FILES directly under state/ (0600). */
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md',
  'alerts.jsonl',
  'transcript-ledger.json',
  'identity-approvals.json',
];

/** A9-scoped private DIRECTORIES (0700): the credential store. `secrets/` is
 *  where GWS OAuth tokens + client JSON live (A9). Repaired, never created here.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_DIRS = (paths) => [paths.secrets];

/** A9-scoped private FILES directly under state/ (0600): grants, exec pins, run
 *  evidence, plus the two metadata files schedule.json/watermarks.json
 *  (repair-only, DATED OWNER DECISION 2026-07-19 — their writers are NOT
 *  changed). (Tokens/client JSON are matched by walking secrets/ for every
 *  regular file — no fixed basename list, so a new google-token-*.json is
 *  covered automatically.) */
const A9_PRIVATE_STATE_FILES = [
  'broker-grants.json',
  'exec-pins.json',
  'run-evidence.jsonl',
  'schedule.json',
  'watermarks.json',
];

/** A9-scoped private FILES at the CORE ROOT (0600): the two non-credential
 *  metadata files (repair-only — writers unchanged). Their absolute paths are
 *  `paths.config` and `paths.manifest`; enumerate by those, not by joining a
 *  basename onto state/.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_CORE_FILES = (paths) => [paths.config, paths.manifest];

/** chmod `p` to `mode` unless it already has it. Best-effort: a vanished or
 *  odd path is skipped; win32 is a no-op. Returns true iff the mode changed.
 *  NOTE (audit): path-based statSync/chmodSync FOLLOW symlinks. Only ever called
 *  on a lstat-first-confirmed real directory with a validated in-core ancestry
 *  (mkdirPrivate); the residual lstat→chmod window is the documented A12 window.
 *  @param {string} p @param {number} mode @returns {boolean} */
function chmodIfNeeded(p, mode) {
  if (WIN32) return false;
  try {
    if ((fs.statSync(p).mode & 0o777) === mode) return false;
    fs.chmodSync(p, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that the in-core ANCESTOR chain of a write `target` is all-real —
 * no symlink at the core itself or at ANY intermediate directory between the
 * core and the target's parent (F5, ADR-0027). Leaf-only `O_NOFOLLOW` protects
 * only the final component; a symlinked ancestor still redirects the leaf
 * open/chmod/write to an out-of-tree file. Walk down from the
 * `coreRootContext`-verified core:
 *  - a symlinked/non-dir CORE (`coreAnomaly`) → refuse (never trust the root);
 *  - a MISSING core → nothing pre-exists beneath it to be a symlink → allow
 *    (a fresh install; `mkdir` will create the chain as real dirs);
 *  - each EXISTING component from core to the parent must be a real directory;
 *    the first non-existent component means the rest don't exist either → allow.
 * A `target` NOT under the core is outside this guard's scope (the leaf-level
 * `O_NOFOLLOW`/`O_EXCL` still applies). `core` may be passed by the caller (the
 * run-job/dream log sites) or resolved once via `getPaths()`. POSIX-only
 * (win32 → no-op, matching the module's posture). Best-effort on a resolution
 * failure (skip rather than crash a write).
 * @param {string} target absolute path being created/written
 * @param {string} [coreOverride] the caller's verified core (else getPaths())
 * @throws {WienerdogError} when the core or any in-core ancestor is a symlink /
 *   non-directory. */
function assertInCoreAncestry(target, coreOverride) {
  if (WIN32) return;
  let core = coreOverride;
  if (!core) {
    try {
      core = require('./paths').getPaths().core;
    } catch {
      return; // cannot resolve the core → rely on the leaf O_NOFOLLOW/O_EXCL guard
    }
  }
  const ctx = coreRootContext({ core });
  if (ctx.coreAnomaly) {
    throw new WienerdogError(
      `refusing to write under ${core}: the Wienerdog core is a symlink or not a directory — ` +
        'never following it to an out-of-tree location (investigate and remove it)'
    );
  }
  if (ctx.coreReal === null) return; // missing core → fresh install, nothing to follow
  const parent = path.dirname(target);
  const rel = path.relative(core, parent);
  if (rel === '' || rel === '.') return; // parent IS the core (already verified real)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return; // target not under core → out of scope
  let cur = core;
  for (const comp of rel.split(path.sep)) {
    cur = path.join(cur, comp);
    const ls = lstatOrNull(cur);
    if (!ls) break; // does not exist yet → deeper components don't either → nothing to follow
    if (ls.isSymbolicLink() || !ls.isDirectory()) {
      throw new WienerdogError(
        `refusing to write ${target}: its ancestor ${cur} is a ${ls.isSymbolicLink() ? 'symlink' : 'non-directory'} ` +
          '(a Wienerdog private path must have an all-real in-core ancestry — investigate and remove it)'
      );
    }
  }
}

/**
 * Create `dir` (recursive) private to the owner (0700), independent of umask:
 * mkdir with mode then chmod (the explicit chmod defeats a permissive umask).
 * Idempotent; the chmod is best-effort and a no-op on win32.
 *
 * Never-follow (F1b/F5, ADR-0027): first VALIDATE THE IN-CORE ANCESTOR CHAIN
 * (a symlinked core or intermediate dir → refuse), then lstat the FINAL
 * component and REFUSE a pre-existing symlink/non-directory before any chmod —
 * a symlinked `logs/<job>` (or a symlinked ancestor above it) must never have
 * its external target chmodded/written through. A missing dir is created; a
 * real dir is (re)hardened to 0700.
 * @param {string} dir
 * @param {{core?:string}} [opts] `core` = the caller's verified core (else getPaths())
 * @throws {WienerdogError} on a symlinked ancestor OR a symlink/non-dir at the
 *   final component. */
function mkdirPrivate(dir, opts = {}) {
  assertInCoreAncestry(dir, opts.core);
  const ls = lstatOrNull(dir);
  if (ls) {
    if (ls.isSymbolicLink() || !ls.isDirectory()) {
      throw new WienerdogError(
        `refusing to use ${dir}: a ${ls.isSymbolicLink() ? 'symlink' : 'non-directory'} is in the way ` +
          '(a private Wienerdog directory must be a real directory — investigate and remove it)'
      );
    }
  } else {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  chmodIfNeeded(dir, 0o700);
}

/**
 * Atomically write `data` to `dest` as a 0600 file, never following a symlink
 * at the destination, its temp, or any in-core ancestor (F5/F6, ADR-0027).
 * `mkdirPrivate` validates the ancestry + parent dir; the temp is created with
 * a CRYPTO-RANDOM name and `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW` (mode 0600), so
 * a pre-existing file/symlink at the name is rejected (`EEXIST` → fresh random
 * name, bounded) — closing the classic predictable-temp-symlink hole completely,
 * not just narrowing a window. The write + `fchmod` go THROUGH the verified fd
 * (no post-write path-following chmod); then an atomic rename replaces `dest`
 * (rename never follows a symlink at `dest`). win32 keeps the plain atomic
 * temp+rename (POSIX-only hardening).
 * @param {string} dest @param {string|Buffer} data
 * F10 (concurrent, W4): after the O_EXCL open a concurrent same-owner process
 * could unlink the temp entry and plant a symlink at that pathname, so the
 * rename would move the SUBSTITUTED symlink onto `dest`. Pure Node cannot
 * prevent this (no directory-relative rename), but this DETECTS it: it captures
 * the opened fd's (dev, ino) and, after the rename, `lstat`s `dest` — a symlink
 * or a (dev, ino) mismatch means the temp was substituted, so it THROWS
 * (detection, not prevention — surfaced loudly instead of silently landing an
 * attacker-selected symlink).
 * @param {{core?:string, openSync?, fstatSync?, writeSync?, fchmodSync?, closeSync?, renameSync?}} [opts]
 *   `core` threads the caller's verified core; the *Sync seams are test-only. */
function writeFilePrivate(dest, data, opts = {}) {
  const dir = path.dirname(dest);
  mkdirPrivate(dir, opts);
  if (WIN32) {
    const tmp = path.join(dir, `.${path.basename(dest)}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, dest);
    return;
  }
  const openSync = opts.openSync || fs.openSync;
  const fstatSync = opts.fstatSync || fs.fstatSync;
  const writeSync = opts.writeSync || fs.writeSync;
  const fchmodSync = opts.fchmodSync || fs.fchmodSync;
  const closeSync = opts.closeSync || fs.closeSync;
  const renameSync = opts.renameSync || fs.renameSync;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
  let tmp;
  let fd = null;
  for (let attempt = 0; ; attempt += 1) {
    tmp = path.join(dir, `.${path.basename(dest)}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    try {
      fd = openSync(tmp, flags, 0o600); // O_EXCL: EEXIST if ANYTHING (incl. a symlink) is at the name
      break;
    } catch (e) {
      if (e && e.code === 'EEXIST' && attempt < 8) continue; // fresh random name, bounded
      throw new WienerdogError(
        `refusing to write ${dest}: could not create a private temp file (${(e && e.code) || (e && e.message)})`
      );
    }
  }
  let fdDev;
  let fdIno;
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error('temp is not a regular file');
    fdDev = st.dev;
    fdIno = st.ino;
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off, null);
    fchmodSync(fd, 0o600); // set the mode ON THE FD (no post-write path-following chmod)
  } catch (e) {
    try {
      closeSync(fd);
    } catch {
      /* best-effort */
    }
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* best-effort */
    }
    throw new WienerdogError(`refusing to write ${dest}: could not write the private temp file (${e && e.message})`);
  }
  try {
    closeSync(fd);
  } catch {
    /* best-effort */
  }
  renameSync(tmp, dest); // atomic; replaces a pre-existing dest (even a symlink) without following it
  // F10/W4 detection: confirm `dest` is the very inode we wrote — a symlink or a
  // (dev,ino) mismatch means a concurrent temp substitution landed a foreign
  // target. Detection-not-prevention (the race already happened); surface loudly.
  try {
    const after = fs.lstatSync(dest);
    if (after.isSymbolicLink() || after.dev !== fdDev || after.ino !== fdIno) {
      throw new WienerdogError(
        `refusing to complete write ${dest}: its temp was substituted between the private open and the ` +
          'rename (a concurrent same-owner swap — the destination is not the file we wrote); investigate ' +
          'for a same-user attacker inside your Wienerdog core.'
      );
    }
  } catch (e) {
    if (e instanceof WienerdogError) throw e;
    /* a transient post-rename lstat error is best-effort detection — do not fail a legit write */
  }
}

/** Enumerate candidate NAMES in `dir` matching `keepName`, WITHOUT filtering by
 *  type (F2, ADR-0027). A prior `e.isFile()` filter dropped symlink Dirents
 *  BEFORE classification, so a symlinked dynamic leaf (e.g.
 *  `secrets/google-token.json`→external) never reached the anomaly path and
 *  doctor/sync/digest reported CLEAN while the repair silently skipped it. Now
 *  every matching name is returned and the caller lstat-classifies it (a symlink
 *  → anomaly, surfaced; a real regular file → repaired; a subdir → skipped).
 *  @param {string} dir @param {(name:string)=>boolean} keepName
 *  @returns {string[]} absolute paths of matching entries (one level, any type) */
function listNames(dir, keepName) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => keepName(e.name)).map((e) => path.join(dir, e.name));
}

/** @param {string} p @returns {import('fs').Stats|null} lstat (never follows). */
function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/** @param {string} p @returns {string|null} realpath, or null when unresolvable. */
function realpathOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** Is the canonical `real` at or beneath the canonical `coreReal`? Both sides
 *  are realpaths, so a symlinked ancestor of the core (e.g. /var → /private/var)
 *  never causes a false escape. Fail-closed when either is missing.
 *  @param {string|null} real @param {string|null} coreReal @returns {boolean} */
function withinCore(real, coreReal) {
  if (!real || !coreReal) return false;
  return real === coreReal || real.startsWith(coreReal + path.sep);
}

/** True iff `st`'s (dev, ino) equals the expected pair. An undefined expectation
 *  (a non-repair caller) is permissive. dev+ino uniquely identify a file, so an
 *  attacker cannot fabricate a match for an out-of-tree file; a hardlink to the
 *  same inode IS the same inode (chmodding it chmods the intended file).
 *  @param {import('fs').Stats} st @param {number} [dev] @param {number} [ino]
 *  @returns {boolean} */
function sameInode(st, dev, ino) {
  if (dev === undefined || ino === undefined) return true;
  return st.dev === dev && st.ino === ino;
}

/**
 * Classify an enumerated private path WITHOUT following symlinks (audit A9 /
 * G2, ADR-0027 never-follow bar). Records the classifying lstat's (dev, ino)
 * so the repair can revalidate the opened fd is the SAME file (G3 — closes an
 * intermediate-component swap that leaf-only O_NOFOLLOW misses). Returns the
 * entry record when the path is a REAL (non-symlink) entry of the expected type
 * whose canonical location stays within the core; `{kind:'anomaly'}` when it is
 * a symlink OR its realpath escapes the core (surfaced, never repaired-through);
 * null when it is missing or the wrong kind (skipped).
 * @param {string} p @param {'dir'|'file'} kind @param {string|null} coreReal
 * @returns {{kind:'dir'|'file', path:string, dev:number, ino:number}
 *           | {kind:'anomaly'} | null} */
function classifyPrivatePath(p, kind, coreReal) {
  const ls = lstatOrNull(p);
  if (!ls) return null; // missing / parent unreadable
  if (ls.isSymbolicLink()) return { kind: 'anomaly' }; // a private path is a symlink → surface, never follow
  if (kind === 'dir' ? !ls.isDirectory() : !ls.isFile()) return null; // wrong kind → skip
  if (!withinCore(realpathOrNull(p), coreReal)) return { kind: 'anomaly' }; // escapes the core → surface
  return { kind, path: p, dev: ls.dev, ino: ls.ino };
}

/**
 * The ONE verified root context every surface shares (G5 + F3b): confirm the
 * core is a REAL directory via an `O_DIRECTORY|O_NOFOLLOW` open BEFORE trusting
 * its realpath as the containment root. Outcomes:
 *  - missing (`ENOENT`) → `{coreReal:null, coreAnomaly:false}`: nothing
 *    installed here, enumerate/repair nothing (no anomaly — a not-yet-installed
 *    machine is not "insecure");
 *  - a SYMLINK / non-directory (`ELOOP`/`ENOTDIR`, or fstat not a dir) →
 *    `{coreReal:null, coreAnomaly:true}`: the core itself is untrusted — a
 *    symlinked `~/.wienerdog`→`/outside/wd` would make the external target the
 *    trusted root and let descendants classify as legitimately-contained (their
 *    realpath IS under the external target) and be chmodded. The `O_NOFOLLOW`
 *    open trips `ELOOP` on a pre-existing symlinked core, closing that case
 *    HARD (no lstat→realpath swap window for the symlink case). Refuse: surface
 *    ONLY the core anomaly and repair NOTHING beneath it;
 *  - an UNREADABLE-but-real core (`EACCES`, i.e. mode `000`) → confirmed a real
 *    directory via `lstat` (a symlink cannot yield `EACCES` here — `O_NOFOLLOW`
 *    fails a symlink with `ELOOP`/`ENOTDIR` before any permission check), then
 *    trusted so the fixed-point loop can repair it (the irreducible mode-000
 *    lstat→realpath window is the same A12 residual as `applyModeFallback`);
 *  - a real directory → `{coreReal:realpath(core), coreAnomaly:false}`: the
 *    trusted root. `realpath` canonicalizes a symlinked/firmlinked ANCESTOR
 *    (macOS `/Users`→`/System/Volumes/Data/Users`, `/var`→`/private/var`) —
 *    `O_NOFOLLOW` refuses only the core's OWN final component, so a real core
 *    reached through a symlinked ancestor is NOT a false anomaly, and
 *    `withinCore` (realpath-vs-realpath) keeps descendants contained.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{coreReal:string|null, coreAnomaly:boolean}} */
function coreRootContext(paths) {
  if (WIN32) {
    // No O_NOFOLLOW/O_DIRECTORY semantics — lstat-classify (parity with the rest
    // of the module's POSIX-only guarantee).
    const ls = lstatOrNull(paths.core);
    if (!ls) return { coreReal: null, coreAnomaly: false };
    if (ls.isSymbolicLink() || !ls.isDirectory()) return { coreReal: null, coreAnomaly: true };
    return { coreReal: realpathOrNull(paths.core), coreAnomaly: false };
  }
  let fd = null;
  try {
    fd = fs.openSync(paths.core, fs.constants.O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
  } catch (e) {
    if (e && e.code === 'ENOENT') return { coreReal: null, coreAnomaly: false }; // missing → skip, no anomaly
    if (e && e.code === 'EACCES') {
      // A real mode-000 core cannot be opened O_RDONLY (a symlink would have
      // failed ELOOP/ENOTDIR, never EACCES). Confirm it is a real directory by
      // lstat, then trust it so the fixed-point loop can repair 000→0700.
      const ls = lstatOrNull(paths.core);
      if (ls && !ls.isSymbolicLink() && ls.isDirectory()) {
        const coreReal = realpathOrNull(paths.core);
        if (coreReal) return { coreReal, coreAnomaly: false };
      }
      return { coreReal: null, coreAnomaly: true };
    }
    return { coreReal: null, coreAnomaly: true }; // ELOOP/ENOTDIR/other → untrusted root
  }
  try {
    // The O_DIRECTORY|O_NOFOLLOW open already GUARANTEED a real (non-symlink)
    // directory; the fstat is belt-and-suspenders. Tolerate a transient fstat
    // failure (e.g. EIO) — fall back to an lstat re-classify — so a private
    // write never crashes on it.
    let isDir;
    try {
      isDir = fs.fstatSync(fd).isDirectory();
    } catch {
      const ls = lstatOrNull(paths.core);
      isDir = !!(ls && !ls.isSymbolicLink() && ls.isDirectory());
    }
    if (!isDir) return { coreReal: null, coreAnomaly: true };
    const coreReal = realpathOrNull(paths.core);
    return coreReal ? { coreReal, coreAnomaly: false } : { coreReal: null, coreAnomaly: true };
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* best-effort close */
    }
  }
}

/** The DIRECTORY half of the single enumerator (kept a separate internal
 *  function so the fixed-point repair loop can enumerate dirs WITHOUT the
 *  redundant per-iteration secrets/scratch file walk; `listPrivateEntries`
 *  builds on it, so all surfaces still share one dir source). Never follows a
 *  symlink: a symlinked/escaping private dir is returned under `anomalies`, not
 *  `dirs` — so it is neither traversed nor chmodded, only surfaced. Each dir is
 *  an `{path, dev, ino}` record so the repair can revalidate the opened fd. The
 *  root context is verified FIRST (G5): a symlinked/non-dir core enumerates NO
 *  descendants. Accepts a precomputed `ctx` so `listPrivateEntries` shares the
 *  identical root verification (the two functions must never diverge).
 *  @param {import('./paths').WienerdogPaths} paths
 *  @param {{coreReal:string|null, coreAnomaly:boolean}} [ctx]
 *  @returns {{dirs:{path:string,dev:number,ino:number}[], anomalies:string[]}} */
function listPrivateDirs(paths, ctx = coreRootContext(paths)) {
  if (ctx.coreReal === null) {
    // core missing (no anomaly) OR core is a symlink/non-dir (surface it, repair
    // nothing beneath — never trust an untrusted root's external target).
    return { dirs: [], anomalies: ctx.coreAnomaly ? [paths.core] : [] };
  }
  const coreReal = ctx.coreReal;
  const dirMap = new Map(); // path → {path, dev, ino}
  const anomalies = new Set();
  const consider = (d) => {
    const c = classifyPrivatePath(d, 'dir', coreReal);
    if (!c) return;
    if (c.kind === 'anomaly') anomalies.add(d);
    else dirMap.set(d, c);
  };

  for (const d of [...A5_PRIVATE_DIRS(paths), ...A9_PRIVATE_DIRS(paths)]) consider(d);

  // logs/<job> subdirs — only READ logs/ when it is itself a real, contained,
  // traversable dir (a symlinked logs/ is an anomaly above and never read).
  if (dirMap.has(paths.logs)) {
    let jobEntries = [];
    try {
      jobEntries = fs.readdirSync(paths.logs, { withFileTypes: true });
    } catch {
      jobEntries = [];
    }
    for (const e of jobEntries) consider(path.join(paths.logs, e.name)); // re-lstat inside: don't trust the Dirent
  }
  return { dirs: [...dirMap.values()], anomalies: [...anomalies] };
}

/**
 * The SINGLE enumerator behind all three surfaces (doctor warn, sync
 * repair/scan, digest banner) — the A5 ∪ A9 union, never following a symlink:
 * `{dirs, files, anomalies}`. `dirs`/`files` are `{path, dev, ino}` records of
 * REAL, in-core entries safe to chmod (the dev/ino lets the repair revalidate
 * the fd it opens); `anomalies` are enumerated private paths that are symlinks
 * or escape the core — surfaced (so the predicate flags them and doctor WARNs)
 * but NEVER repaired-through.
 *  - dirs: the A5 dirs, `secrets/`, and every existing `logs/<job>` subdir.
 *  - files: the four A5 state/ basenames, the A9 state/ files (grants, pins,
 *    run evidence, schedule.json, watermarks.json), the two core-root metadata
 *    files (config.yaml, install-manifest.json), every `logs/<job>/*.log` (one
 *    nesting level — run-job's layout), every scratch extract, every
 *    quarantined copy, and every regular file directly under `secrets/`
 *    (tokens + client JSON, no fixed basename list).
 * Existence-guarded (a missing entry is skipped — this module repairs, it
 * never creates) and de-duplicated (the union must not double-report). Files
 * are walked ONLY out of real, contained dirs (`dirPaths` membership), so a
 * symlinked `secrets/`/`logs/<job>` is never enumerated into; and every
 * dynamic-leaf NAME is lstat-classified (F2) so a symlinked leaf is surfaced as
 * an anomaly, not silently dropped. Accepts a precomputed `ctx` so the repair
 * can BIND one root context for its whole operation (F3a).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{coreReal:string|null, coreAnomaly:boolean}} [ctx]
 * @returns {{dirs:{path:string,dev:number,ino:number}[],
 *            files:{path:string,dev:number,ino:number}[], anomalies:string[]}}
 */
function listPrivateEntries(paths, ctx = coreRootContext(paths)) {
  // The root is verified ONCE and shared with listPrivateDirs (G5): the two must
  // never diverge on whether the core is a trusted, real, in-place directory.
  const { dirs, anomalies: dirAnomalies } = listPrivateDirs(paths, ctx);
  if (ctx.coreReal === null) {
    // Untrusted/absent core → no descendants enumerated (only the core anomaly,
    // if any, carried up from listPrivateDirs).
    return { dirs: [], files: [], anomalies: dirAnomalies };
  }
  const coreReal = ctx.coreReal;
  const dirPaths = new Set(dirs.map((d) => d.path));
  const anomalies = new Set(dirAnomalies);

  const fileMap = new Map(); // path → {path, dev, ino}
  const considerFile = (f) => {
    const c = classifyPrivatePath(f, 'file', coreReal);
    if (!c) return;
    if (c.kind === 'anomaly') anomalies.add(f);
    else fileMap.set(f, c);
  };

  for (const f of [
    ...A5_PRIVATE_FILE_BASENAMES.map((base) => path.join(paths.state, base)),
    ...A9_PRIVATE_STATE_FILES.map((base) => path.join(paths.state, base)),
    ...A9_PRIVATE_CORE_FILES(paths),
  ]) {
    considerFile(f);
  }
  // Walk NAMES ONLY out of real, contained dirs (dirPaths membership) so a
  // symlinked secrets//logs/<job> is never followed. `listNames` keeps symlink
  // Dirents (F2); considerFile lstat-classifies each — a symlinked leaf →
  // anomaly (surfaced), a real regular file → files (with its dev/ino).
  for (const d of dirs) {
    if (path.dirname(d.path) === paths.logs) {
      for (const f of listNames(d.path, (n) => n.endsWith('.log'))) considerFile(f);
    }
  }
  if (dirPaths.has(path.join(paths.state, 'dream-scratch'))) {
    for (const f of listNames(path.join(paths.state, 'dream-scratch'), (n) => n.endsWith('.json'))) considerFile(f);
  }
  if (dirPaths.has(path.join(paths.state, 'quarantine'))) {
    for (const f of listNames(path.join(paths.state, 'quarantine'), () => true)) considerFile(f);
  }
  if (dirPaths.has(paths.secrets)) {
    for (const f of listNames(paths.secrets, () => true)) considerFile(f);
  }
  return { dirs, files: [...fileMap.values()], anomalies: [...anomalies] };
}

/** Defensive iteration cap for the fixed-point directory repair. The real
 *  private tree is shallow (core → state → {dream-scratch,quarantine},
 *  core → logs → <job>, core → secrets — depth 3), so a handful of passes
 *  always converges; this cap only guards against a pathological/unbounded
 *  spin and CANNOT be hit by the real layout. If it is ever hit the repair is
 *  aborted (fail-closed) rather than reporting a partial repair as complete. */
const MAX_DIR_REPAIR_PASSES = 64;

/** F30/ADR-0027 never-follow flags. Undefined on win32 → 0 (no-op there — the
 *  realpath-canonical containment above is the win32 bound, and chmod is a
 *  WIN32 no-op regardless). */
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_DIRECTORY = fs.constants.O_DIRECTORY || 0;

/**
 * TOCTOU-safe chmod that NEVER follows a symlink (audit A9 / G2 + G3,
 * ADR-0027). Opens the path O_RDONLY|O_NOFOLLOW (dirs add O_DIRECTORY),
 * `fstat`s the fd to confirm the kind + current mode, REVALIDATES that the fd's
 * (dev, ino) equals the pair captured when the entry was classified, and only
 * then `fchmod`s that verified descriptor:
 *  - a swap-to-symlink at the LEAF between enumeration and chmod trips
 *    O_NOFOLLOW at open (ELOOP/ENOTDIR) → REFUSED;
 *  - a swap of an INTERMEDIATE directory component (which leaf-only O_NOFOLLOW
 *    cannot catch — the open then lands on a different, out-of-tree inode) is
 *    caught by the (dev, ino) mismatch → REFUSED, so the external file is never
 *    chmodded. dev+ino uniquely identify a file; an attacker cannot fabricate a
 *    match for an out-of-tree target (G3).
 *
 * An owner-owned but UNREADABLE real dir/file (VERIFIED mode 000 — the
 * fixed-point loop's whole reason to exist) cannot be opened O_RDONLY (EACCES),
 * so ONLY that case falls back to an lstat-guarded path chmod (below). Every
 * other open error — EPERM, ELOOP, ENOTDIR, ENOENT, EIO, … — is REFUSED, never
 * fallen back (G4a). `seams` inject the *Sync calls + the expected (dev, ino)
 * for tests (a forced ELOOP / a redirected-inode fd).
 *
 * @param {string} p @param {number} expectedMode @param {boolean} isDir
 * @param {{openSync?,fstatSync?,fchmodSync?,closeSync?,lstatSync?,chmodSync?,
 *          expectedDev?:number, expectedIno?:number}} [seams]
 * @returns {'changed'|'unchanged'|'refused'|'swapped'} 'refused' = a
 *   symlink/swap/error surfaced by the read predicate; 'swapped' = the mode-000
 *   fallback detected a post-chmod inode change (surfaced LOUDLY by the caller). */
function applyModeSecure(p, expectedMode, isDir, seams = {}) {
  if (WIN32) return 'unchanged';
  const openSync = seams.openSync || fs.openSync;
  const fstatSync = seams.fstatSync || fs.fstatSync;
  const fchmodSync = seams.fchmodSync || fs.fchmodSync;
  const closeSync = seams.closeSync || fs.closeSync;
  const { expectedDev, expectedIno } = seams;
  let fd = null;
  try {
    fd = openSync(p, fs.constants.O_RDONLY | O_NOFOLLOW | (isDir ? O_DIRECTORY : 0));
  } catch (e) {
    // ONLY a genuine EACCES (an unreadable real entry) may fall back — and the
    // fallback itself re-verifies mode-000 + (dev,ino). Everything else refuses.
    if (e && e.code === 'EACCES') {
      return applyModeFallback(p, expectedMode, isDir, expectedDev, expectedIno, seams);
    }
    return 'refused';
  }
  try {
    const st = fstatSync(fd);
    if (isDir ? !st.isDirectory() : !st.isFile()) return 'refused';
    // (dev,ino) revalidation (G3): the fd MUST be the file we classified. An
    // intermediate-component swap redirects the open to a different inode.
    if (!sameInode(st, expectedDev, expectedIno)) return 'refused';
    if ((st.mode & 0o777) === expectedMode) return 'unchanged';
    fchmodSync(fd, expectedMode);
    return 'changed';
  } catch {
    return 'refused';
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* best-effort close */
      }
    }
  }
}

/** lstat-guarded path chmod for an unreadable-but-owned real entry the fd path
 *  cannot open (G4). Reached ONLY on an EACCES open — a mode-000 dir/file cannot
 *  be opened `O_RDONLY|O_NOFOLLOW` (EACCES), and pure Node has NO portable
 *  fd-bound chmod for it (Linux `O_PATH`+`/proc/self/fd` is not portable — no
 *  `O_PATH` on macOS, no `/proc`), so a path-based `chmodSync` is the only option
 *  and the lstat→chmod window is IRREDUCIBLE (the F4 / A12 residual). Mitigated:
 *  refuses unless a fresh lstat confirms not-a-symlink + expected kind +
 *  (dev,ino) == classification + VERIFIED mode 000 (a non-000 EACCES — e.g. a
 *  write-only 0200 file — is refused, not chmodded), and RE-LSTATs after the
 *  chmod; a (dev,ino) change means the chmod may have hit a SWAPPED target →
 *  returns `'swapped'` so the caller surfaces it LOUDLY (not a silent
 *  `changed:0`).
 *  @param {string} p @param {number} expectedMode @param {boolean} isDir
 *  @param {number} [expectedDev] @param {number} [expectedIno] @param {object} seams
 *  @returns {'changed'|'unchanged'|'refused'|'swapped'} */
function applyModeFallback(p, expectedMode, isDir, expectedDev, expectedIno, seams = {}) {
  const lstatSync = seams.lstatSync || fs.lstatSync;
  const chmodSync = seams.chmodSync || fs.chmodSync;
  let before;
  try {
    before = lstatSync(p);
  } catch {
    return 'refused';
  }
  if (before.isSymbolicLink()) return 'refused'; // never follow
  if (isDir ? !before.isDirectory() : !before.isFile()) return 'refused';
  if (!sameInode(before, expectedDev, expectedIno)) return 'refused'; // not the classified file
  if ((before.mode & 0o777) !== 0o000) return 'refused'; // VERIFIED mode-000 only (G4a)
  try {
    chmodSync(p, expectedMode);
  } catch {
    return 'refused';
  }
  // G4b: confirm the chmod hit the same inode we verified. A change means a
  // concurrent swap landed in the irreducible lstat→chmod window and the chmod
  // may have touched a swapped/external target — surface it LOUDLY.
  let after;
  try {
    after = lstatSync(p);
  } catch {
    return 'swapped';
  }
  if (after.isSymbolicLink() || !sameInode(after, expectedDev, expectedIno)) return 'swapped';
  return 'changed';
}

/**
 * Repair wrong modes over the A5 ∪ A9 set to their EXPECTED mode (dirs 0700,
 * files 0600 — over-tight modes repaired too, expected-mode equality).
 *
 * FIXED-POINT DIRECTORY REPAIR, THEN A SINGLE FILE PASS (WP-a9 round-3 + G1).
 * A 000/non-executable directory hides its contents from the enumeration
 * (`readdirSync`/`statSync` fail through the unreadable parent → skipped), and
 * this can nest to ANY depth (`logs/`=000 hiding `logs/<job>/`=000 hiding a
 * `0644` log; `core/`=000 hiding `secrets/`=000 hiding a `0644` token). A fixed
 * number of passes only opens a fixed number of levels, leaving a deeper file
 * world-readable until the next sync — a fail-open in a security guard. So the
 * DIRECTORY repair is a fixed-point LOOP: chmod every currently-discoverable
 * private dir to 0700 and RE-ENUMERATE, repeating until the discoverable dir
 * set stops growing (each newly-traversable dir can reveal deeper ones). The
 * set is monotonic (a chmod only reveals more, never hides) and bounded by the
 * finite tree, so it converges; the cap is purely defensive. Only AFTER every
 * private dir is traversable does ONE fresh file enumeration run and chmod
 * files to 0600 — so a token trapped under any nesting depth is reached in this
 * single `repairPrivateModes` call, and a follow-up `scanPrivateModes` is
 * `{insecure: 0}`.
 *
 * NEVER FOLLOWS A SYMLINK (G2, ADR-0027): only REAL, in-core `dirs`/`files`
 * are repaired — a symlinked/escaping private path is an `anomaly` (surfaced by
 * the read predicate, never chmodded through), and each chmod goes through the
 * O_NOFOLLOW `applyModeSecure` fd so a swap-to-symlink mid-repair is refused,
 * not followed to an out-of-tree target.
 *
 * Best-effort per entry (a missing/symlinked/un-chmoddable entry is skipped —
 * and remains flagged by the predicate, never silently certified clean); win32
 * chmod is a no-op. Returns the count of entries actually changed for a
 * truthful doctor/sync line. Keeps the single-enumerator invariant: the dir
 * loop and the file pass both derive from `listPrivateDirs`/`listPrivateEntries`
 * that feed the three read surfaces. The root context is BOUND ONCE for the
 * whole operation (F3a) and threaded through every dir pass + the file pass —
 * never recomputed, so trust cannot flip mid-repair. `opts` forwards the *Sync
 * test seams to `applyModeSecure`; production passes none.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{openSync?,fstatSync?,fchmodSync?,closeSync?,lstatSync?,chmodSync?}} [opts]
 * @returns {{changed:number}}
 * @throws {WienerdogError} if the directory repair does not converge within the
 *   defensive cap, OR if the mode-000 fallback detects a post-chmod inode swap
 *   (F4 — a possible out-of-tree chmod: surfaced LOUDLY, never a silent success).
 */
function repairPrivateModes(paths, opts = {}) {
  // BIND the root context ONCE for the whole repair (F3a): every dir pass and the
  // file pass share this one verified root, so a concurrent core swap cannot flip
  // the trusted root between passes.
  const ctx = coreRootContext(paths);
  let changed = 0;
  /** LOUD-surface a mode-000-fallback post-chmod swap (F4): a chmod may have hit
   *  a swapped/external target — fail the whole repair rather than report success. */
  const guardSwap = (outcome, p) => {
    if (outcome === 'swapped') {
      throw new WienerdogError(
        `private-modes repair aborted: ${p} changed identity between the permission read and the ` +
          'chmod (a concurrent swap in the irreducible mode-000 window) — the chmod may have hit an ' +
          'out-of-tree target; investigate for a same-user attacker inside your Wienerdog core.'
      );
    }
    return outcome === 'changed';
  };
  // Fixed-point directory phase: repair discoverable REAL private dirs to 0700
  // (never following a symlink; fd revalidated by (dev,ino)) and re-enumerate
  // until the set stops growing. A permanently-anomalous/refused entry drops out
  // of `dirs` (or stays wrong-moded) and the count stabilizes, so the loop
  // always terminates — an un-repairable entry is surfaced, never spun on.
  let prevCount = -1;
  let pass = 0;
  for (; pass < MAX_DIR_REPAIR_PASSES; pass += 1) {
    const { dirs } = listPrivateDirs(paths, ctx);
    for (const d of dirs) {
      if (guardSwap(applyModeSecure(d.path, 0o700, true, { ...opts, expectedDev: d.dev, expectedIno: d.ino }), d.path)) changed += 1;
    }
    if (dirs.length === prevCount) break; // no newly-revealed dir → fixed point
    prevCount = dirs.length;
  }
  if (pass >= MAX_DIR_REPAIR_PASSES) {
    throw new WienerdogError(
      'private-modes repair did not converge within its bounded directory-repair cap — ' +
        'the private directory tree is unexpectedly deep; repair aborted rather than reporting ' +
        'a partially-repaired credential store as complete.'
    );
  }
  // Every real private dir is now traversable → one fresh file pass to 0600.
  for (const f of listPrivateEntries(paths, ctx).files) {
    if (guardSwap(applyModeSecure(f.path, 0o600, false, { ...opts, expectedDev: f.dev, expectedIno: f.ino }), f.path)) changed += 1;
  }
  return { changed };
}

/**
 * READ-ONLY list of insecure A5 ∪ A9 entries. Two classes, both surfaced so
 * doctor WARNs / the digest banner counts them and neither is silently clean:
 *  - a REAL entry whose mode deviates from the expected one in EITHER direction
 *    — (mode & 0o777) !== 0700 for dirs / 0600 for files — so a loosened
 *    0755/0644 AND an over-tight 0600/000 dir (a traversal-broken credential
 *    store) are both flagged;
 *  - an ANOMALY: a private path that is a SYMLINK or resolves outside the core
 *    (G2, ADR-0027) — repair refuses to follow it, so it stays flagged until a
 *    human replaces it with a real in-core path.
 * Mode reads use `lstat` (the entries are already classified non-symlink real,
 * so lstat mode == stat mode — but lstat never follows). Never chmods. POSIX
 * only (win32 → []). The single predicate behind doctor's WARNs, sync
 * --dry-run's would-repair count, and the digest banner — those surfaces can
 * never disagree.
 * @param {import('./paths').WienerdogPaths} paths @returns {string[]}
 */
function insecureEntries(paths) {
  if (WIN32) return [];
  const { dirs, files, anomalies } = listPrivateEntries(paths);
  const out = new Set();
  for (const [list, expectedMode] of [
    [dirs, 0o700],
    [files, 0o600],
  ]) {
    for (const e of list) {
      const ls = lstatOrNull(e.path);
      if (ls && (ls.mode & 0o777) !== expectedMode) out.add(e.path);
    }
  }
  for (const a of anomalies) out.add(a); // symlink / escapes-core → surfaced, never repaired
  return [...out];
}

/**
 * READ-ONLY scan: the count of wrong-moded A5 ∪ A9 entries.
 * win32 → {insecure: 0} (POSIX-only guarantee, owner-approved).
 * @param {import('./paths').WienerdogPaths} paths @returns {{insecure:number}}
 */
function scanPrivateModes(paths) {
  return { insecure: insecureEntries(paths).length };
}

/** Open a per-run log stream that is ALWAYS owner-only (0600) AND never follows
 *  a pre-existing symlink at the path — or FAIL: it never returns a stream onto
 *  a file it could not secure to 0600, and never writes/chmods THROUGH a symlink
 *  to an out-of-tree target (F1a, ADR-0027).
 *  POSIX: openSync with NUMERIC flags including O_NOFOLLOW (O_WRONLY|O_CREAT|
 *    O_APPEND for append sites, |O_TRUNC for truncate sites), mode 0600 — a
 *    pre-existing symlink at `file` trips O_NOFOLLOW (ELOOP) and the open throws
 *    (fail-closed, zero bytes). fstat the fd to confirm a REGULAR FILE (refuse a
 *    fifo/dir/device), then fchmodSync(fd, 0o600) on that verified fd (covers
 *    the append-into-a-legacy-0666 case); on any failure closeSync(fd) and THROW.
 *  win32: no O_NOFOLLOW/mode semantics — plain stream (POSIX-only guarantee).
 *  @param {string} file  absolute log path (its dir already exists — mkdir is
 *    the caller's job, now the lstat-first mkdirPrivate)
 *  @param {{flags?: string, core?:string, openSync?, fstatSync?, fchmodSync?, closeSync?}} [opts]
 *    `core` threads the caller's verified core (F5 ancestry); the *Sync seams
 *    are test injection only
 *  @returns {import('fs').WriteStream}
 *  @throws {WienerdogError} if a symlinked in-core ancestor is found, or the fd
 *    cannot be opened privately or secured to 0600 */
function createLogStreamPrivate(file, opts = {}) {
  const flags = opts.flags || 'w';
  if (WIN32) return fs.createWriteStream(file, { flags });
  assertInCoreAncestry(file, opts.core); // F5: a symlinked core/logs ancestor → refuse before opening the leaf
  const openSync = opts.openSync || fs.openSync;
  const fstatSync = opts.fstatSync || fs.fstatSync;
  const fchmodSync = opts.fchmodSync || fs.fchmodSync;
  const closeSync = opts.closeSync || fs.closeSync;
  // Numeric flags WITH O_NOFOLLOW so a pre-existing symlink at `file` refuses
  // (ELOOP) instead of the write/chmod following it out of the core.
  const numeric =
    (flags === 'a'
      ? fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND
      : fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC) | O_NOFOLLOW;
  let fd;
  try {
    fd = openSync(file, numeric, 0o600); // atomic create-with-0600; ELOOP on a symlink
  } catch (e) {
    throw new WienerdogError(
      `refusing to write log ${file}: could not open it privately without following a symlink (${(e && e.code) || (e && e.message)})`
    );
  }
  try {
    if (!fstatSync(fd).isFile()) throw new Error('not a regular file'); // fifo/dir/device → refuse
    fchmodSync(fd, 0o600); // enforce 0600 even on a pre-existing append target, on the verified fd
  } catch (e) {
    try {
      closeSync(fd);
    } catch {
      /* best-effort close */
    }
    throw new WienerdogError(
      `refusing to write log ${file}: could not secure it to 0600 (${e && e.message})`
    );
  }
  return fs.createWriteStream(file, { fd }); // stream on the verified fd
}

/** True IFF ANY top-level protected directory the runtime writes to —
 *  `core`, `state`, `logs`, OR `secrets` — is a PRE-EXISTING symlink or a
 *  non-directory (F9/F12): an UNTRUSTED mechanics root that NOTHING may be
 *  written/renamed/chmodded/deleted under. Each is classified by the same
 *  `coreRootContext` `O_DIRECTORY|O_NOFOLLOW`+fstat logic (a symlink/non-dir →
 *  anomaly; a MISSING dir → NOT anomalous, a fresh install the writers create
 *  real). This is the SINGLE ENTRY GATE — `run()` and `dream.run` call it once,
 *  before ANY dispatch mode or writer, and refuse via a non-core channel on
 *  true. (Deeper paths — `logs/<job>`, `secrets/<file>` — stay covered per-write
 *  by `assertInCoreAncestry`; this gate covers the top-level dirs.) POSIX-only
 *  (win32 → false, matching the module posture).
 *  @param {import('./paths').WienerdogPaths} paths @returns {boolean} */
function mechanicsRootUntrusted(paths) {
  if (WIN32) return false;
  for (const dir of [paths.core, paths.state, paths.logs, paths.secrets]) {
    if (dir && coreRootContext({ core: dir }).coreAnomaly === true) return true;
  }
  return false;
}

module.exports = {
  mkdirPrivate,
  writeFilePrivate,
  createLogStreamPrivate,
  repairPrivateModes,
  scanPrivateModes,
  insecureEntries,
  mechanicsRootUntrusted,
  A5_PRIVATE_DIRS,
  A5_PRIVATE_FILE_BASENAMES,
  A9_PRIVATE_DIRS,
  A9_PRIVATE_STATE_FILES,
  A9_PRIVATE_CORE_FILES,
};
