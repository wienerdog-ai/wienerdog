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
 *     RESIDUAL, covering one more window than copy-in's. `createWorkspace`
 *     validates the private ancestry BEFORE it removes the previous workspace,
 *     which is what stops a symlinked `state` from redirecting a recursive
 *     delete out of the tree; an ancestor swapped between that validation and
 *     the delete is still followed. Same class, same reason: portable Node
 *     cannot bind a path's component chain against concurrent replacement
 *     (`delta.js:22-40`, owner-ruled 2026-08-21).
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
 * True when `candidate` names `root` itself or something beneath it.
 *
 * THE ONE CONTAINMENT COMPARISON IN THIS PACKAGE. Three rules — the workspace's
 * placement, the child `PATH`'s components, and the child environment's values —
 * each ask it, and every weaker form of it has been measured wrong.
 *
 * TWO PASSES, and the division of labour is the whole design: SPELLING answers
 * only what it can answer exactly, and THE FILESYSTEM answers what counts as the
 * same place.
 *
 * PASS 1, SPELLING, EXACT — over the KERNEL-RESOLVED path, never the lexical
 * one. Compare on a SEPARATOR BOUNDARY — which
 * is why a sibling merely starting with the vault's name (`~/wienerdog-backup`
 * beside `~/wienerdog`) is not inside it, and why a filesystem ROOT, already
 * separator-terminated, must not have another appended.
 *
 * IT DELIBERATELY DOES NOT CASE-FOLD OR NORMALISE, and that is a correction of
 * this function's own earlier design. Folding looked free — "it can only
 * over-match, which is the fail-safe direction" — and that reasoning was WRONG.
 * Measured on a case-sensitive filesystem: the default core `/home/ada/.wienerdog`
 * beside an adopted vault `/home/ada/.WIENERDOG`, which are different directories
 * there and which `wienerdog adopt` accepts, made the placement gate report
 * containment and refuse EVERY dream. Over-refusing is not a safe direction; it
 * is the product not running. The same argument retires NFC normalisation, since
 * composed and decomposed spellings are likewise distinct files where the
 * filesystem says they are.
 *
 * PASS 2, IDENTITY, is what makes that safe to give up. Where a filesystem DOES
 * treat two spellings as one place, it says so itself: walk the resolved
 * candidate's ancestors and compare `(dev, ino)`. That covers a case-insensitive
 * filesystem (measured: a directory created as `straße` is reachable as
 * `STRASSE`, which `toLowerCase()` does not equate and `realpath` does not
 * reconcile), a symlinked vault root, and an alias into the vault — with no case
 * table and no guess about the volume. The one thing it cannot answer for is a
 * path that does not exist, and a path that does not exist grants no access.
 *
 * A NON-ABSOLUTE CANDIDATE IS NEVER INSIDE ANYTHING. Resolving one would join it
 * to OUR working directory — and measured, `run-job` runs the dream with its cwd
 * AT the vault, so the scalar `USER=ada` resolved to `<vault>/ada` and refused
 * every scheduled dream. Nothing is lost: a relative `PATH` component is
 * resolved by the OS against the CHILD's cwd, never the vault.
 *
 * ONE FAIL-OPEN, NAMED: if `root` itself cannot be `stat`ed, pass 2 is
 * unavailable and containment falls back to exact spelling. Not worth guarding —
 * a dream that cannot stat its own vault fails moments later in copy-in.
 * @param {string} candidate @param {string} root @returns {boolean}
 */
function isAtOrBeneath(candidate, root) {
  const c0 = String(candidate);
  if (!path.isAbsolute(c0)) return false;
  let c;
  let r;
  try {
    // RESOLVED, not merely `path.resolve`d. The lexical answer is wrong in BOTH
    // directions once a symlink and a `..` meet, and each direction has been
    // measured: `/outside-alias/../nested` reads the VAULT's bytes while
    // `path.resolve` names somewhere else, and `<vault>/alias/../home` — where
    // `<vault>/alias` points outside — reads bytes OUTSIDE the vault while
    // `path.resolve` names something inside it. The first is a leak, the second
    // refuses a safe child; both are the same mistake, which is deciding
    // containment on a spelling the kernel does not use.
    c = resolveExisting(c0);
    r = resolveExisting(String(root));
  } catch {
    return false; // unresolvable — nothing to compare
  }
  // A root already ends in the separator; anything else needs one appended so
  // `/a/bc` is not read as being inside `/a/b`.
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  if (c === r || c.startsWith(prefix)) return true;

  // Pass 2 — the filesystem's own identity answer.
  const rootId = statIdOrNull(root);
  if (rootId === null) return false; // root does not exist: spelling was all there was
  let cur = c;
  for (;;) {
    const id = statIdOrNull(cur);
    if (id !== null && id.dev === rootId.dev && id.ino === rootId.ino) return true;
    const parent = path.dirname(cur);
    if (parent === cur) return false; // reached the filesystem root
    cur = parent;
  }
}

/**
 * `(dev, ino)` of `p`, following symlinks — that following is deliberate, since
 * the question is which directory a path REACHES. Null when it does not exist
 * or cannot be read.
 * @param {string} p @returns {{dev:number, ino:number}|null}
 */
function statIdOrNull(p) {
  try {
    const st = fs.statSync(p);
    return { dev: st.dev, ino: st.ino };
  } catch {
    return null;
  }
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
 * A path's ROOT and the components below it, with `.` and empty segments
 * dropped. Returned together because the walk needs both, and getting the root
 * wrong silently relocates every component that follows.
 *
 * THE ROOT MUST COME OFF FIRST. A plain `split(sep)` keeps it as a component,
 * and on win32 that component is the drive or the UNC host: measured,
 * `C:\outside-alias\bin` split to `['C:', 'outside-alias', 'bin']`, so a walk
 * seeded at `C:\` then probed `C:\C:`. POSIX hid this because its root
 * component splits to the empty string, which the filter drops anyway.
 *
 * A NAMESPACED UNC ROOT IS NOT WHAT NODE SAYS IT IS. `\\?\UNC\server\share\` is
 * the same location as `\\server\share\`, so the server and the share belong to
 * the ROOT — but measured, BOTH `path.win32.parse().root` and
 * `path.win32.dirname()` stop at `\\?\UNC\` and hand `server` and `share` back
 * as ordinary components. Walking from there probes `\\?\UNC\server`, which is
 * not a location at all; resolution stops, and an alias below the share is
 * never followed. There is no Node primitive that gets this right, so the two
 * components are absorbed here.
 *
 * WIN32 ACCEPTS BOTH SEPARATORS, so both are split there — and only there: a
 * backslash is a legal character in a POSIX filename, so splitting on it would
 * tear a real name in half.
 *
 * `mod` is injectable ONLY so the win32 shapes can be asserted from a POSIX test
 * run; production always uses the platform's own `path`.
 * @param {string} input @param {typeof path} [mod]
 * @returns {{root:string, parts:string[]}}
 */
function splitPath(input, mod = path) {
  const s = String(input);
  let root = mod.parse(s).root;
  const rest = s.slice(root.length);
  const split = mod.sep === '\\' ? rest.split(/[\\/]+/) : rest.split('/');
  let parts = split.filter((seg) => seg !== '' && seg !== '.');
  if (mod.sep === '\\' && /^\\\\[?.]\\UNC\\$/i.test(root) && parts.length >= 2) {
    root = `${root}${parts[0]}${mod.sep}${parts[1]}${mod.sep}`;
    parts = parts.slice(2);
  }
  return { root, parts };
}

/**
 * Canonicalise a path the way the KERNEL does, even when its tail does not exist
 * yet: walk it one component at a time, resolving each symlink as it is reached,
 * and apply `..` to what is resolved SO FAR.
 *
 * NEITHER `path.resolve` NOR `fs.realpathSync` DOES THIS, and the gap is a hole
 * rather than a nicety. Both collapse `..` LEXICALLY first, which discards a
 * symlink that came before it. Measured, with `/outside-alias -> <vault>/nested`:
 * `path.resolve('/outside-alias/../nested')` answers `/nested`, `realpathSync`
 * on it throws ENOENT — and `cat` on that same path prints the vault's bytes,
 * because the kernel resolves the alias FIRST and then applies `..` to the real
 * parent. A value shaped like that, handed to a child as `HOME`, is vault access
 * that every string comparison agrees is somewhere else.
 *
 * The other half is the tail: `realpathSync` needs the whole path to exist,
 * while the workspace does not exist yet when the placement gate must answer.
 * Once a component is missing, the rest is appended lexically — the kernel would
 * refuse to walk further anyway.
 * @param {string} p @returns {string}
 */
function resolveExisting(p) {
  const input = String(p);
  if (!path.isAbsolute(input)) return path.resolve(input);
  const { root, parts } = splitPath(input);
  let cur = root;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part === '..') {
      // `cur` is already fully resolved, so its parent is the real parent —
      // which is exactly what the kernel walks to.
      cur = path.dirname(cur);
      continue;
    }
    try {
      cur = fs.realpathSync(path.join(cur, part));
    } catch {
      // This component does not exist; nothing beyond it can be resolved.
      return path.join(cur, ...parts.slice(i));
    }
  }
  return cur;
}

/**
 * The one wording for a containment refusal, so both passes of the gate say the
 * same thing.
 * @param {string} workspaceDir @param {string} vaultRoot @returns {string}
 */
function containmentRefusal(workspaceDir, vaultRoot) {
  return (
    `dream workspace: refusing to build the run workspace at ${workspaceDir} — it and the vault ` +
    `${vaultRoot} contain one another, so the run would either write straight into the promotion ` +
    'target or delete the vault at teardown (move the Wienerdog core outside the vault)'
  );
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
  if (!paths || typeof paths.state !== 'string' || typeof paths.core !== 'string') {
    // `core` is not decoration: it is what `mkdirPrivate` validates the private
    // ancestry AGAINST. Measured — with it absent, `assertInCoreAncestry` falls
    // back to the ambient core, finds the target is not under it, and returns
    // WITHOUT validating anything, which silently disarms the destructive-order
    // guard below and deleted an external tree.
    throw new WienerdogError('dream workspace: paths must be a WienerdogPaths value with core and state');
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
  const mkdirOpts = { core: paths.core };
  // ORDER IS LOAD-BEARING, and it is a destructive-action rule: the private
  // ancestry is VALIDATED BEFORE anything is removed. `mkdirPrivate` refuses a
  // symlinked core, a symlinked intermediate directory and a symlinked leaf.
  // Removing first and validating second was measured to delete an EXTERNAL
  // tree: with `<core>/state` a symlink to somewhere else, the recursive remove
  // resolved through it and destroyed that directory's `dream-workspace` before
  // the validation that would have refused ever ran.
  // THE CONTAINMENT GATE, IN TWO PASSES, AND THE FIRST ONE TOUCHES NOTHING.
  // BOTH DIRECTIONS are refused: a workspace at or beneath the vault puts the
  // brain's write root inside the promotion TARGET (and copy-in descends into
  // the tree it is writing — measured, recursing to ENAMETOOLONG); a vault at or
  // beneath the WORKSPACE makes every recursive removal below delete the vault.
  // Neither needs a symlink — a core configured inside the vault, or a vault
  // configured inside the core's state, does it.
  //
  // PASS 1 RUNS BEFORE ANY WRITE. It only READS — canonicalising the workspace
  // path through its deepest existing ancestor, because a lexical compare misses
  // the primary platform's `/var` → `/private/var` symlink — since every
  // operation the gate would otherwise perform first is one it may not perform
  // on a vault. Measured on the version that gated after `mkdirPrivate`: with the
  // vault AT the workspace path, the run refused — and had already chmodded the
  // user's vault 0755 → 0700; when that vault was empty, the refusal's own
  // cleanup deleted it. A refusal must cost the user nothing.
  const workspaceProbe = resolveExisting(workspaceDir);
  if (isAtOrBeneath(workspaceProbe, vaultRoot) || isAtOrBeneath(vaultRoot, workspaceProbe)) {
    throw new WienerdogError(containmentRefusal(workspaceDir, vaultRoot));
  }

  const preExisting = fs.existsSync(workspaceDir);
  mkdirPrivate(workspaceDir, mkdirOpts);

  // PASS 2 resolves symlinks, which pass 1 cannot: a symlinked component could
  // still land the workspace inside the vault. It runs OUTSIDE the cleanup
  // handler — that handler's whole job is a recursive delete of `workspaceDir`,
  // so on this refusal it would destroy exactly what the refusal protects
  // (measured: the vault's note was gone). The only removal here is a
  // NON-recursive `rmdir`, and only of a directory THIS call created — never of
  // one that was already on disk.
  // Everything from here to the end of the gate can throw, and a throw here is
  // an ordinary refused call with a live stack — not a crash — so it may not
  // leave the directory this call just created behind. The removal is
  // NON-recursive and conditional on us having created it: nothing on a refusal
  // path deletes what it did not make.
  const undoCreate = () => {
    if (preExisting) return;
    try {
      fs.rmdirSync(workspaceDir);
    } catch {
      /* non-empty or gone — leave it rather than escalate to a recursive delete */
    }
  };
  let workspaceReal;
  try {
    workspaceReal = fs.realpathSync(workspaceDir);
  } catch (err) {
    undoCreate();
    throw new WienerdogError(
      `dream workspace: cannot resolve the workspace directory (${(err && err.code) || 'realpath failed'})`
    );
  }
  if (isAtOrBeneath(workspaceReal, vaultRoot) || isAtOrBeneath(vaultRoot, workspaceReal)) {
    undoCreate();
    throw new WienerdogError(containmentRefusal(workspaceDir, vaultRoot));
  }

  try {
    // Past the gate the workspace provably does not contain the vault, so the
    // recursive removals from here on cannot reach it. A leftover from a crashed
    // run is removed before the build, never merged into: the baseline must
    // describe THIS run's copy and nothing else.
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
  isAtOrBeneath,
  splitPath,
  // Layer 1's mechanism. Exported because it is UNREACHABLE through
  // `createWorkspace` in a test: a symlink planted before the walk is
  // classified by `lstat` and skipped by the walk, so the swap branches here
  // are never entered. A test that could only reach them through the walk would
  // stay green against a naive `fs.copyFileSync(abs, dest)` — measured.
  copyRegularFileSecure,
  WORKSPACE_DIRNAME,
};
