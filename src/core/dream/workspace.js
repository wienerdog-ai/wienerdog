'use strict';

/**
 * The dream run's WORKSPACE — the brain's write root, built by us, outside the
 * vault (WP-dream-workspace-retarget, Table A).
 *
 * WHY IT EXISTS. Until now the brain wrote straight into the live vault and a
 * code validator afterwards tried to filter the damage out of a namespace that
 * already held the user's data. That filtering needs a pre-brain baseline, and
 * every OBSERVED baseline of a contaminated namespace was measured blindable
 * from inside the tree. This module inverts the direction: the system builds a
 * fresh directory, copies the vault's readable content into it, and captures
 * the exact bytes it just wrote. The baseline is therefore CONSTRUCTED — known
 * because we wrote every byte of it — and needs no observation proof.
 *
 * WHAT THIS FILE DOES NOT DO. It does not promote anything back into the vault,
 * it does not classify what the brain wrote, and it runs NO git — it spawns
 * nothing at all (Postcondition 2's share). That is asserted mechanically by
 * the tests, as a grep over this file for Node's process-spawning module, which
 * is why this comment does not NAME that module: a grep cannot tell a comment
 * from a call. Promotion, the gates and the pipeline wiring are the successor's
 * (`WP-dream-promote-in-workspace`).
 *
 * THE CALLER INVARIANT, IN THREE LAYERS. `captureBaseline` walks the workspace
 * this run just built under the 0700 private core, where nothing else writes —
 * that walk is genuinely actorless. COPY-IN reads the LIVE VAULT, where the
 * user's editor or file synchroniser is a benign writer throughout, so brain
 * ordering alone does not discharge `delta.js`'s caller invariant there:
 *  1. FILE-LEVEL CONTAINMENT, fail-closed: an entry classified as a regular
 *     file and then replaced by a symlink before the read is NEVER followed —
 *     the open is `O_NOFOLLOW` where the platform has it, and the (dev, ino)
 *     revalidation catches the swap everywhere else, because `lstat` recorded
 *     the ENTRY's identity and `fstat` reports the TARGET's. The entry is
 *     skipped and reported. Bytes from outside the vault cannot enter the
 *     workspace through a swap AT A FILE ENTRY. A DIRECTORY entry replaced
 *     between its `lstat` and the `readdirSync` that descends into it is a
 *     chain-level substitution and belongs to layer 2 below — `readdirSync`
 *     resolves the name again, and portable Node cannot bind it.
 *  2. CHAIN-LEVEL SUBSTITUTION: a replaced ANCESTOR component is a NAMED
 *     RESIDUAL — portable Node cannot bind a path's component chain against
 *     concurrent replacement (`delta.js:22-40`, owner-ruled 2026-08-21).
 *  3. COHERENCE: a copy of a live tree is not atomic, so a concurrent save can
 *     hand the dream a view mixing two moments. Its damage bound: this affects
 *     what the dream SEES, never what enters the vault unvetted — every return
 *     path runs through the successor's admission, gates and vault-write
 *     primitive.
 *
 * ADR-0004: just files. The workspace is created and removed within one run;
 * nothing it makes outlives the job.
 */

const fs = require('node:fs');
const path = require('node:path');

const { WienerdogError } = require('../errors');
const { mkdirPrivate } = require('../private-fs');
const { defaultLayout } = require('../layout');
const { captureBaseline } = require('./delta');

/**
 * The workspace's fixed basename under `paths.state`. FIXED and SHALLOW on
 * purpose: `private-fs.js:671-677` justifies its 64-pass directory-repair cap on
 * the real private tree being shallow ("depth 4"), and a vault-shaped tree at an
 * arbitrary depth would invalidate that justification. `core → state →
 * dream-workspace` keeps it at the same depth as the existing `dream-run`
 * staging dir, and — measured — the repair enumerates a FIXED dir list
 * (`A5_PRIVATE_DIRS` ∪ `A9_PRIVATE_DIRS` plus `logs/<job>`), so the workspace's
 * interior is never walked by it. The run creates it, the run owns it, the run
 * removes it.
 */
const WORKSPACE_DIRNAME = 'dream-workspace';

/**
 * Never-follow flags for the ONE open per copied file. NEITHER CONSTANT EXISTS
 * EVERYWHERE (win32 has no `O_NOFOLLOW`), and the fallback is an explicit branch
 * that NAMES what is lost — deliberately not the `fs.constants.X || 0` idiom,
 * "which makes a missing flag look like a present one"
 * (`src/core/vault-snapshot.js:45-61`, the precedent this file follows).
 * Where `O_NOFOLLOW` is absent, the atomic leaf-symlink refusal is gone and the
 * (dev, ino) revalidation below is what refuses instead: it refuses at `fstat`,
 * before any byte is read, so the platform costs WHEN the refusal happens, not
 * WHETHER it happens. Where `O_NONBLOCK` is absent, the hazard it guards (a
 * blocking open of a writer-less FIFO) is a POSIX one.
 */
const OPEN_FLAGS =
  fs.constants.O_RDONLY |
  (typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0) |
  (typeof fs.constants.O_NONBLOCK === 'number' ? fs.constants.O_NONBLOCK : 0);

/**
 * Harness INSTRUCTION-FILE basenames excluded from copy-in at any depth, stored
 * already canonicalised+folded. Identical to the set the successor's promotion
 * allowlist denies (its Table C9), kept identical on purpose so the baseline and
 * the promotion barrier cover the same shapes.
 *
 * The exclusion is DEFENSE IN DEPTH on the Claude arm and LOAD-BEARING on the
 * Codex arm: measured, the Claude brain does not load an instruction file from
 * an `--add-dir` root, while the Codex arm's write root IS its cwd
 * (`brain.js:120`, `:189`) — which is exactly where instruction discovery
 * happens. Keeping a vault-carried `AGENTS.md` out of the workspace keeps it out
 * of the brain's instructions and out of the baseline.
 */
const CONTROL_BASENAMES = new Set([
  'claude.md',
  'claude.local.md',
  'agents.md',
  'agents.override.md',
  '.mcp.json',
]);

/** Harness CONFIG DIRECTORY segments excluded at any depth (folded). */
const CONTROL_SEGMENTS = new Set(['.claude', '.codex']);

/** Any entry with this folded name is a git object — Postcondition 1. */
const GIT_ENTRY = '.git';

/**
 * Canonicalise then case-fold one path component before comparing it.
 *
 * BOTH STEPS ARE LOAD-BEARING. The primary filesystem is case-insensitive —
 * measured, a file created as `claude.md` answers to `CLAUDE.md` — so a literal
 * comparison would let `agents.override.md` through while the harness still
 * loads it. Folding alone is still insufficient: macOS enumerates DECOMPOSED
 * names while accepting composed ones, and lowercasing does not make the two
 * forms equal. `src/scheduler/tccguard.js:48` is the in-repo precedent for this
 * exact NFC-then-fold order.
 * @param {string} name @returns {string}
 */
function fold(name) {
  return name.normalize('NFC').toLowerCase();
}

/**
 * Byte-wise ascending comparison of two names — NOT `<` and not
 * `localeCompare`: JavaScript compares strings by UTF-16 code unit, which orders
 * non-BMP names differently from their UTF-8 bytes. Deterministic order is what
 * lets a test's `skipped` expectation be written without re-sorting.
 * @param {string} a @param {string} b @returns {number}
 */
function byteCompare(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Name the kind of a non-regular, non-directory entry, for the `skipped` reason.
 * @param {import('fs').Stats} st @returns {string}
 */
function entryKind(st) {
  if (st.isSymbolicLink()) return 'symlink';
  if (st.isFIFO()) return 'fifo';
  if (st.isSocket()) return 'socket';
  if (st.isCharacterDevice()) return 'characterDevice';
  if (st.isBlockDevice()) return 'blockDevice';
  if (st.isDirectory()) return 'directory';
  return 'unknown';
}

/**
 * The NAME-based exclusion: `.git` at any depth, and the harness control-file
 * shapes at any depth. Returns the `skipped` reason, or null to copy.
 *
 * NOTE WHAT THIS IS NOT. Excluding a shape from copy-in keeps it out of the
 * BASELINE. What keeps a brain-CREATED one out of the vault is the successor's
 * promotion allowlist — two different barriers at two different moments, and
 * neither is a restatement of the other.
 *
 * `reports_dir` is deliberately NOT excluded (owner ruling on F2'', 2026-08-27):
 * the shipped skill REQUIRES the brain to author the dream report
 * (`skills/wienerdog-dream/SKILL.md:409-425`), so the reports dir must be inside
 * the brain's write root and the run's existing report for the same date must be
 * in the baseline — otherwise a second run on one date writes a path that
 * already exists in the vault and the successor's C4 refuses it, losing the
 * report on every same-day re-run.
 * @param {string} name one path component, as enumerated
 * @returns {string|null}
 */
function excludeReason(name) {
  const folded = fold(name);
  if (folded === GIT_ENTRY) return 'git-object';
  if (CONTROL_SEGMENTS.has(folded)) return 'harness-config-dir';
  if (CONTROL_BASENAMES.has(folded)) return 'harness-control-file';
  return null;
}

/**
 * Copy ONE regular file, with classification and read BOUND TO ONE OPENED
 * OBJECT (layer 1 above). The obvious shape — `lstat` to classify, then
 * `fs.copyFileSync(src, dest)` to copy — passes every test that plants a symlink
 * BEFORE the walk starts and still follows one substituted in between, because
 * `copyFile` takes a PATH and resolves it again.
 *
 * That is also why `COPYFILE_FICLONE` is not used: it is only reachable through
 * the path-based API, and copy-on-write was MEASURED absent through Node's API
 * on the primary platform anyway (macOS / APFS, Node 24.18: `FICLONE_FORCE`
 * fails ENOSYS and plain `FICLONE` is indistinguishable in wall-clock from a
 * plain copy — 165 ms either way for 2 000 files / 7.8 MB). Containment beats a
 * measured-zero speedup.
 *
 * NEVER A HARDLINK MIRROR: a hardlink alias writes the vault inode, so the brain
 * would be editing the real vault through the mirror — today's failure with an
 * extra step.
 *
 * @param {string} abs absolute source path, as enumerated
 * @param {string} dest absolute destination path inside the workspace
 * @param {number} expectedDev `dev` captured when the walk classified `abs`
 * @param {number} expectedIno `ino` captured when the walk classified `abs`
 * @param {string} rel the vault-relative path, for diagnostics
 * @returns {string|null} a `skipped` reason, or null when the file was copied
 * @throws {WienerdogError} when the source is real but unreadable
 */
function copyRegularFileSecure(abs, dest, expectedDev, expectedIno, rel) {
  let fd;
  try {
    fd = fs.openSync(abs, OPEN_FLAGS);
  } catch (err) {
    const code = (err && err.code) || 'open failed';
    // ELOOP is the O_NOFOLLOW refusal — the entry became a symlink after it was
    // classified. ENOENT/ENOTDIR mean it vanished mid-copy, which is the live
    // vault's ordinary behaviour (layer 3) and not a failure: a file that is no
    // longer in the vault cannot be clobbered by anything promoted later.
    // Anything else — EACCES, EIO — is an unreadable source and fails the run
    // CLOSED, because a baseline that silently omitted a readable file would
    // report it as `added` later, which is a false accusation against whoever
    // wrote it.
    if (code === 'ELOOP') return 'symlink';
    if (code === 'ENOENT' || code === 'ENOTDIR') return 'vanished';
    throw new WienerdogError(`dream workspace: cannot read ${rel} (${code})`);
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return entryKind(st);
    if (st.dev !== expectedDev || st.ino !== expectedIno) return 'identity-changed';
    fs.writeFileSync(dest, fs.readFileSync(fd), { mode: 0o600 });
    return null;
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      /* best-effort close; the copy result stands either way */
    }
  }
}

/**
 * Copy the vault's readable content into the workspace.
 *
 * SCOPE IS THE BRAIN'S REAL READ/WRITE NEED — approximately the whole readable
 * vault, NOT the seven `LAYOUT_KEYS`. Measured: the brain reads across the vault
 * for dedupe (`SKILL.md:52-54`) and writes outside the mapped dirs (`:115-117`,
 * `02-Areas/` and `03-Resources/`). Narrowing to the seven keys would silently
 * degrade the product — blind dedupe produces duplicates and Tier-2 writes land
 * in the void. Width does not weaken the guarantee: the guarantee is that the
 * baseline is KNOWN, not that it is small, and a wide baseline is exactly as
 * known as a narrow one because the system wrote every byte of it.
 *
 * A directory that cannot be ENUMERATED at any depth THROWS — the same rule and
 * the same reason as `delta.js`'s walk, deliberately unlike `listNames`, which
 * swallows a `readdirSync` failure and returns `[]`.
 *
 * @param {string} srcRoot absolute, realpath-resolved vault root
 * @param {string} destRoot absolute workspace root (already created)
 * @returns {{copied:number, skipped:Array<{rel:string, reason:string}>}}
 */
function copyIn(srcRoot, destRoot) {
  /** @type {Array<{rel:string, reason:string}>} */
  const skipped = [];
  let copied = 0;

  /** @param {string} absDir @param {string} destDir @param {string} relDir */
  const visit = (absDir, destDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      const where = relDir === '' ? 'the vault root' : relDir;
      throw new WienerdogError(
        `dream workspace: cannot enumerate ${where} (${(err && err.code) || 'readdir failed'}); ` +
          'a baseline that omitted its files would later report them as added'
      );
    }
    entries.sort((a, b) => byteCompare(a.name, b.name));
    for (const entry of entries) {
      // POSIX separators in `rel` on every platform — the shape `git status`
      // yields, and the shape the successor's prefix tests expect.
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      const abs = path.join(absDir, entry.name);
      // NAME first, so an excluded directory is never even descended into: that
      // is what makes ".git/ at any depth" and "a .claude segment anywhere" true
      // of the whole subtree rather than of its top entry.
      const named = excludeReason(entry.name);
      if (named) {
        skipped.push({ rel, reason: named });
        continue;
      }
      // Never trust the Dirent: re-classify with `lstat`, which never follows.
      let st;
      try {
        st = fs.lstatSync(abs);
      } catch (err) {
        const code = (err && err.code) || 'lstat failed';
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          skipped.push({ rel, reason: 'vanished' });
          continue;
        }
        throw new WienerdogError(`dream workspace: cannot classify ${rel} (${code})`);
      }
      const dest = path.join(destDir, entry.name);
      if (st.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
        visit(abs, dest, rel);
        continue;
      }
      if (!st.isFile()) {
        // A symlink (to a file OR a directory), a device, a socket or a FIFO is
        // never copied and never recursed into — it is REPORTED, never silently
        // dropped. This is also what keeps the capture below anomaly-free, which
        // is what gives `createWorkspace`'s fail-closed check its teeth.
        skipped.push({ rel, reason: entryKind(st) });
        continue;
      }
      const why = copyRegularFileSecure(abs, dest, st.dev, st.ino, rel);
      if (why) skipped.push({ rel, reason: why });
      else copied += 1;
    }
  };

  visit(srcRoot, destRoot, '');
  skipped.sort((a, b) => byteCompare(a.rel, b.rel));
  return { copied, skipped };
}

/**
 * POSTCONDITION 1 — no `.git` object anywhere in the finished workspace.
 *
 * A walk over what was actually built, not a re-reading of the exclusion rule:
 * an exclusion bug and a postcondition failure must be distinguishable, and this
 * is the half that catches the bug. Any entry named `.git` — directory, file or
 * symlink — fails the run closed.
 *
 * This is NOT "the workspace is not a git repository", which is not establishable
 * by any construction of ours: measured, `git rev-parse --show-toplevel` from a
 * plain directory nested under a repository resolves to that ancestor, and
 * whether an ancestor of the private core is a repository is a property of the
 * user's filesystem. The checkable and true form of that property is
 * Postcondition 2 — no product code runs git with a cwd at or beneath the
 * workspace root — and this module's share of it is that it spawns nothing.
 * @param {string} root absolute workspace root
 * @throws {WienerdogError}
 */
function assertNoGitEntry(root) {
  /** @param {string} absDir @param {string} relDir */
  const visit = (absDir, relDir) => {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (err) {
      const where = relDir === '' ? 'the workspace root' : relDir;
      throw new WienerdogError(
        `dream workspace: cannot enumerate ${where} (${(err && err.code) || 'readdir failed'}) ` +
          'while checking for git objects'
      );
    }
    for (const entry of entries) {
      const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (fold(entry.name) === GIT_ENTRY) {
        throw new WienerdogError(
          `dream workspace: a git object reached the workspace at ${rel} — refusing to run the brain`
        );
      }
      // `isDirectory()` on a Dirent is lstat-shaped: a symlink to a directory is
      // NOT descended into, so this walk cannot be steered out of the tree.
      if (entry.isDirectory()) visit(path.join(absDir, entry.name), rel);
    }
  };
  visit(root, '');
}

/**
 * The F2'' precondition, asserted rather than trusted: when the vault already
 * holds this run's dream report, that report MUST be in the baseline.
 *
 * Its absence is not cosmetic. The skill requires the brain to author the report
 * at `<reports_dir>/<date>.md`; if the existing one were missing from the
 * baseline, the brain's rewrite would look `added` to the successor, whose C4
 * refuses an `added` path that already exists in the vault — so a same-day
 * re-run would lose its report every time. Any future exclusion rule that
 * swallowed the reports dir would be caught here instead of in production.
 * @param {string} vaultRoot @param {string} workspaceDir
 * @param {import('../layout').VaultLayout} layout @param {string} date
 * @throws {WienerdogError}
 */
function assertReportCopied(vaultRoot, workspaceDir, layout, date) {
  const rel = path.posix.join(layout.reports_dir, `${date}.md`);
  const src = path.join(vaultRoot, ...rel.split('/'));
  let st;
  try {
    st = fs.lstatSync(src);
  } catch {
    return; // no existing report for this date — nothing to preserve
  }
  if (!st.isFile()) return; // not a regular file → legitimately excluded above
  const copiedPath = path.join(workspaceDir, ...rel.split('/'));
  const ls = fs.lstatSync(copiedPath, { throwIfNoEntry: false });
  if (!ls || !ls.isFile()) {
    throw new WienerdogError(
      `dream workspace: the vault's existing dream report ${rel} was not copied into the workspace — ` +
        'the brain would rewrite it as a new file and the promotion gate would refuse it'
    );
  }
}

/**
 * Build the run's workspace, copy the vault's readable content into it, and
 * capture the bytes just written as the run's CONSTRUCTED BASELINE (Table A).
 *
 * Asserts POSTCONDITION 1 (no `.git` entry), and refuses a capture that reports
 * anomalies, before returning; POSTCONDITION 2 is a static property of this
 * module (it spawns nothing), asserted by tests rather than checked at runtime.
 *
 * The baseline holds BYTES, not only hashes — the successor's merge needs bytes.
 * It is proportional to the copied vault (~7.8 MB for 2 000 notes, ~78 MB for
 * 20 000) and this package sets NO CAP on purpose: a cap would have to drop
 * files, and a baseline that silently omits a file reports that file as `added`
 * later, which is a false accusation against whoever wrote it.
 *
 * @param {{vaultDir:string, paths:import('../paths').WienerdogPaths, date:string,
 *          layout:import('../layout').VaultLayout}} o
 * @returns {{workspaceDir:string, baseline:import('./delta').Baseline,
 *            copied:number, skipped:Array<{rel:string, reason:string}>}}
 * @throws {WienerdogError} when a postcondition fails (fail closed, before
 *   spawn) — and it REMOVES whatever of the workspace it had already built
 *   before it throws. It is the only party that can: on the throw path the
 *   caller never receives `workspaceDir`, so no pipeline exit path can reach the
 *   partial tree. Without that, a failure would leave a private copy of the
 *   user's whole vault on disk, which ADR-0004 forbids.
 */
function createWorkspace(o) {
  const { vaultDir, paths, date } = o;
  const layout = o.layout || defaultLayout();
  if (typeof vaultDir !== 'string' || !path.isAbsolute(vaultDir)) {
    throw new WienerdogError('dream workspace: vaultDir must be an absolute path');
  }
  if (!paths || typeof paths.state !== 'string') {
    throw new WienerdogError('dream workspace: paths must be a WienerdogPaths value');
  }
  if (typeof date !== 'string' || date === '') {
    throw new WienerdogError('dream workspace: date must be a non-empty string');
  }
  // The vault root is resolved ONCE and the whole walk is bound to the result. A
  // symlinked vault root is the user's own arrangement (the repo already
  // realpaths it in `validate.js`), not an attack — what must never be followed
  // is a symlink INSIDE the tree, which copy-in refuses per entry.
  let vaultRoot;
  try {
    vaultRoot = fs.realpathSync(vaultDir);
  } catch (err) {
    throw new WienerdogError(
      `dream workspace: cannot resolve the vault directory (${(err && err.code) || 'realpath failed'})`
    );
  }

  const workspaceDir = path.join(paths.state, WORKSPACE_DIRNAME);
  const mkdirOpts = paths.core ? { core: paths.core } : {};
  // ORDER IS LOAD-BEARING, and it is a destructive-action rule: the private
  // ancestry is VALIDATED BEFORE anything is removed. `mkdirPrivate` refuses a
  // symlinked core, a symlinked intermediate directory and a symlinked leaf.
  // Removing first and validating second was measured to delete an EXTERNAL
  // tree: with `<core>/state` a symlink to somewhere else, the recursive remove
  // resolved through it and destroyed that directory's `dream-workspace` before
  // the validation that would have refused ever ran.
  mkdirPrivate(workspaceDir, mkdirOpts);
  try {
    // The placement contract, now checkable: the ancestry above is verified
    // real, so this resolves to where the workspace actually lives. A workspace
    // at or beneath the vault would put the brain's write root inside the
    // promotion TARGET — and copy-in would descend into the tree it is writing,
    // measured to recurse until ENAMETOOLONG. Reachable without any symlink: a
    // core configured inside the vault (`WIENERDOG_VAULT=~/notes` with
    // `WIENERDOG_HOME=~/notes/.wienerdog`) does it.
    const workspaceReal = fs.realpathSync(workspaceDir);
    if (workspaceReal === vaultRoot || workspaceReal.startsWith(vaultRoot + path.sep)) {
      throw new WienerdogError(
        `dream workspace: refusing to build the run workspace at ${workspaceDir} — it is inside the vault, ` +
          'so the brain would write straight into the promotion target (move the Wienerdog core outside the vault)'
      );
    }
    // A leftover from a crashed run is removed before the build, never merged
    // into: the baseline must describe THIS run's copy and nothing else.
    destroyWorkspace(workspaceDir);
    mkdirPrivate(workspaceDir, mkdirOpts);
    const { copied, skipped } = copyIn(vaultRoot, workspaceDir);
    assertReportCopied(vaultRoot, workspaceDir, layout, date);
    assertNoGitEntry(workspaceDir);
    // AFTER copy-in, and over the WORKSPACE, never the vault: capturing the
    // vault would re-introduce the observed baseline this whole direction exists
    // to escape.
    const baseline = captureBaseline(workspaceDir);
    if (baseline.anomalies.length > 0) {
      // The capture RECORDS a symlink as an anomaly and returns; it does not
      // throw (`delta.js` Anomaly typedef). So the exclusion above may not lean
      // on the capture failing closed — this check is what does.
      const first = baseline.anomalies[0];
      throw new WienerdogError(
        `dream workspace: the finished workspace holds ${baseline.anomalies.length} entry/entries that are not ` +
          `regular files (first: ${first.rel}, kind: ${first.kind}) — refusing to run the brain`
      );
    }
    return { workspaceDir, baseline, copied, skipped };
  } catch (err) {
    destroyWorkspace(workspaceDir);
    throw err;
  }
}

/**
 * Remove the workspace tree. Idempotent (a second call is a no-op, not a throw);
 * NEVER touches the vault.
 *
 * Wiring this into every pipeline exit path — and the one named exception, a run
 * that refused because the brain's reap was not verified and therefore does NOT
 * tear down — is the successor's. A workspace left behind by a CRASH is the
 * residue-lifecycle package's subject, not this one's.
 * @param {string} workspaceDir
 * @throws {WienerdogError} when handed a path that is not a workspace root — the
 *   only guard a function whose whole job is a recursive delete can offer
 *   without being handed the paths it belongs to.
 */
function destroyWorkspace(workspaceDir) {
  if (typeof workspaceDir !== 'string' || !path.isAbsolute(workspaceDir)) {
    throw new WienerdogError('dream workspace: workspaceDir must be an absolute path');
  }
  if (path.basename(workspaceDir) !== WORKSPACE_DIRNAME) {
    throw new WienerdogError(
      `dream workspace: refusing to remove ${workspaceDir} — it is not a dream workspace root`
    );
  }
  // `rmSync` on a symlinked root removes the LINK, never the tree behind it.
  fs.rmSync(workspaceDir, { recursive: true, force: true });
}

module.exports = {
  createWorkspace,
  destroyWorkspace,
  // Exported for the deliverable test file so each rule can be proven RED on its
  // own: the exclusion predicate and the postcondition walk are separate
  // barriers and a test that could only reach them through `createWorkspace`
  // could not tell which of the two fired.
  assertNoGitEntry,
  excludeReason,
  // Layer 1's mechanism. Exported because it is UNREACHABLE through
  // `createWorkspace` in a test: a symlink planted before the walk is
  // classified by `lstat` and skipped by the walk, so the swap branches here
  // are never entered. A test that could only reach them through the walk would
  // stay green against a naive `fs.copyFileSync(abs, dest)` — measured.
  copyRegularFileSecure,
  WORKSPACE_DIRNAME,
};
