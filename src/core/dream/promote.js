'use strict';

/**
 * The promotion module (WP-dream-promote-module).
 *
 * WHAT THIS IS. The decision layer between the workspace and the vault. Given
 * the run's constructed baseline, the delta of what the brain wrote into the
 * workspace, and the live vault, it decides per path what happens — promote,
 * promote a merged version, or refuse-and-report — runs the four policy gates
 * on the bytes that would actually be published, publishes what survives
 * through the vault-write primitive, and returns the decided bytes.
 *
 * FILTERING OUT BECOMES PROMOTING IN. Today's validator lets the brain write
 * the vault and then reverts what fails policy. Here the brain never touches
 * the vault: a path enters it only by being admitted, and admission is a
 * POSITIVE allowlist (Table C, row C9) rather than a deny-list of known-bad
 * filenames. That is the mechanism that closes audit finding M7 — a hostile
 * `CLAUDE.md` is not caught in the vault, it never comes into existence there.
 *
 * WHAT THIS MODULE DOES NOT OWN, and must never re-implement:
 *
 *   - FILESYSTEM DISCIPLINE. Every vault byte goes through `writeIntoVault`
 *     (WP-dream-vault-write-primitive, Table H). Resolution, symlink refusal,
 *     partial-write invisibility, the conditional publish and the returned
 *     bytes are all the primitive's, applied by it. This module supplies two
 *     caller-side arguments — `admit` (the policy of Table C, row C9, which
 *     the primitive applies to the RESOLVED path) and `expect` (the bytes the
 *     decision was made against) — and writes no vault byte itself.
 *   - PATH CONTAINMENT. The family has exactly one containment rule and it
 *     took eleven review rounds to get right: kernel-faithful resolution plus
 *     `(dev, ino)` identity, owned by Table H and implemented in
 *     `vault-write.js` / `workspace.js` (`isAtOrBeneath`). Every string answer
 *     to "is this path inside that directory" was measured wrong, in both
 *     directions. A second implementation here would be a defect, not a
 *     defence. Row C9 is a POLICY over resolved paths, not a path validator.
 *   - THE GATES THEMSELVES. All four are INJECTED (`o.gates`), so this module
 *     carries no dependency on `validate.js`. What it owns is the ORDER and
 *     the INPUT ROUTING: the secret gate judges the brain's added lines
 *     BEFORE the merge; the other three judge the MERGED candidate bytes,
 *     which are exactly what would be published.
 *   - THE QUARANTINE. Preserving an unredacted copy is the secret gate's own
 *     act (Table Q, row Q7); this module never touches the state directory.
 *     What it does is CARRY the gate's reported metadata into its result, and
 *     refuse to publish when the only-copy invariant (Q4) is unsatisfied.
 *   - THE DREAM REPORT. `WP-dream-promote-report` owns it. Nothing here
 *     composes a report or records a report outcome.
 *   - THE COMMIT. `WP-dream-promote-in-workspace` owns it. This module
 *     supplies the decided bytes (Table S) so that package can build a commit
 *     from them rather than from a fresh read of the vault.
 *
 * CONSUMED BY NOTHING. This module ships with no caller: the running dream is
 * byte-identical after it merges. `WP-dream-promote-in-workspace` is what makes
 * it true of the product.
 *
 * ADR-0004: just files. Nothing here starts a process that outlives its call,
 * and the one process it does start — `git merge-file` — is a synchronous spawn
 * that has exited before the function returns.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { WienerdogError } = require('../errors');
const { getPaths } = require('../paths');
const { spawnPinnedSync, loadPins } = require('../exec-identity');
const { writeIntoVault } = require('./vault-write');
// The family's ONE containment answer — kernel-faithful resolution plus
// `(dev, ino)` identity. Imported, never re-implemented: every string answer to
// "is this path inside that directory" was measured wrong, in both directions,
// and eleven review rounds went into the one that holds.
const { isAtOrBeneath } = require('./workspace');

/**
 * The CURRENT harness instruction-file basenames, canonicalised and
 * case-folded. Row C9's clause (c).
 *
 * This is a deny-list, and it is stated as one that will NOT cover the next
 * convention. It exists only because clauses (a) and (b) — a writable tier
 * directory plus an `.md` extension — cannot reach an instruction file written
 * INSIDE a tier directory. The product itself already treats
 * `AGENTS.override.md` as a live shadowing convention (`src/adapters/codex.js`)
 * and `CLAUDE.local.md` as a current Claude one, which is why `.md` is not a
 * safe content-only extension.
 */
const INSTRUCTION_BASENAMES = new Set(['claude.md', 'claude.local.md', 'agents.md', 'agents.override.md']);

/** Path segments that make a path an instruction-discovery root at any depth. */
const DENIED_SEGMENTS = new Set(['.claude', '.codex']);

/** One further basename that is neither `.md` nor a directory marker. */
const DENIED_BASENAME = '.mcp.json';

/**
 * The two PARA tier directories row C9 admits that are not layout keys. The
 * layout has seven keys and neither Areas nor Resources is among them
 * (`layout.js:21-29`), but both are writable tiers of the vault skeleton.
 */
const EXTRA_TIER_DIRS = ['02-Areas', '03-Resources'];

/** The vault-side ADR-0020 ledger that pairs with a `SKILL.md` in its own
 *  directory (`validate.js:397`). */
const LEDGER_BASENAME = 'LEARNINGS.md';

/** The skill body a `LEARNINGS.md` is validated against. */
const SKILL_BASENAME = 'SKILL.md';

/**
 * Canonicalise then CASE-FOLD, in that order — row C9's matching rule, and the
 * order is load-bearing.
 *
 * Case folding alone is not enough: macOS enumerates decomposed names while
 * accepting composed ones, and measured, `nfc.toLowerCase() === nfd.toLowerCase()`
 * is FALSE for the same directory inode. So a name spelled composed and the
 * same name spelled decomposed are one file that a fold-only comparison would
 * match in one form and miss in the other — a false refusal in one direction
 * and a missed instruction file in the other.
 *
 * Canonicalisation alone is not enough either: the primary filesystem is
 * case-insensitive — measured, a file created as `claude.md` answers to
 * `CLAUDE.md` — so a literal comparison admits `agents.override.md` while the
 * harness still loads it as an instruction file. The repo already reasons this
 * way at `validate.js:1083-1086`.
 * @param {string} s @returns {string}
 */
function fold(s) {
  return s.normalize('NFC').toLowerCase();
}

/**
 * Split a vault-relative path into its folded segments. The primitive hands
 * `admit` a `/`-separated relative path on every platform, and the delta's
 * `rel` values come from a filesystem walk, so both are already plain relative
 * paths of plain names — this does NOT validate them (that is the primitive's,
 * Table H row H1, and a second segment check here is exactly the duplicated
 * containment rule the dispatch precondition forbids).
 * @param {string} rel @returns {string[]}
 */
function foldedSegments(rel) {
  return rel.split('/').map(fold);
}

/**
 * True when `rel` sits under the directory `dir`, compared segment-wise on
 * canonicalised, case-folded names. Segment-wise rather than string-prefix so
 * `01-ProjectsX/a.md` is not read as being under `01-Projects`.
 * @param {string[]} relSegments folded segments of the candidate
 * @param {string} dir a layout value or literal directory, possibly multi-segment
 * @returns {boolean}
 */
function isUnder(relSegments, dir) {
  if (typeof dir !== 'string' || dir === '') return false;
  const dirSegments = foldedSegments(dir).filter((s) => s !== '');
  if (dirSegments.length === 0) return false;
  // A path that IS the directory is not a file under it.
  if (relSegments.length <= dirSegments.length) return false;
  return dirSegments.every((seg, i) => relSegments[i] === seg);
}

/**
 * The writable tier directories row C9 clause (a) admits. `daily_filename` is a
 * filename, not a directory, and is deliberately absent. `reports_dir` is
 * ADMITTED, not denied (owner ruling, 2026-08-27): the shipped skill requires
 * the BRAIN to author the dream report (`skills/wienerdog-dream/SKILL.md:409-425`),
 * so the report is brain content and promotion is how it reaches the vault.
 * @param {import('../layout').VaultLayout} layout @returns {string[]}
 */
function admittedDirs(layout) {
  const l = layout || {};
  return [
    l.identity_dir,
    l.daily_dir,
    l.projects_dir,
    l.skills_dir,
    l.inbox_dir,
    l.reports_dir,
    ...EXTRA_TIER_DIRS,
  ].filter((d) => typeof d === 'string' && d !== '');
}

/**
 * Table C, row C9 — THE PROMOTION ALLOWLIST.
 *
 * Returns a refusal reason, or `null` to admit. This is the `admit` callback
 * handed to `writeIntoVault`, which calls it with the path the write actually
 * RESOLVES to, never with the candidate path. Where it is applied is part of
 * the rule: measured, a pre-existing vault symlink — `01-Projects/alias` →
 * `../reports/dreams`, or → `../.claude` — makes a lexically admitted
 * `01-Projects/alias/evil.md` land in a denied directory, and vault containment
 * alone cannot see it because the resolved target is still inside the vault.
 *
 * A path is admitted when ALL of these hold:
 *   (a) it is under one of the layout's writable tier directories, or under
 *       `02-Areas/` or `03-Resources/`, or under the layout's `reports_dir`;
 *   (b) its final component ends in `.md`;
 *   (c) its basename is not a current harness instruction-file shape at any
 *       depth, no segment is `.claude` or `.codex`, and the basename is not
 *       `.mcp.json`.
 *
 * (a) and (b) are the positive allowlist and close the class M7's remediation
 * asks for: a vault-root `CLAUDE.md`, a `.gitignore`, a `.claude/settings.json`
 * and an Obsidian plugin binary are all outside it without anyone enumerating
 * them. (c) is the named deny-list of CURRENT conventions.
 *
 * Deliberately NOT a dot-rule: audit finding C3 owns the layout dot-rule and
 * its notice, and a directory-and-extension rule does not step on it.
 * @param {import('../layout').VaultLayout} layout
 * @returns {(rel: string) => string|null}
 */
function makeAdmit(layout) {
  const dirs = admittedDirs(layout);
  return function admit(rel) {
    if (typeof rel !== 'string' || rel === '') return 'not admitted: empty path';
    const segments = foldedSegments(rel);
    const base = segments[segments.length - 1];

    // (c) first, so a denied instruction file is refused with the reason that
    // actually explains it rather than with an extension complaint.
    for (const seg of segments.slice(0, -1)) {
      if (DENIED_SEGMENTS.has(seg)) {
        return `not admitted: path segment \`${seg}\` is a harness instruction-discovery root`;
      }
    }
    if (DENIED_SEGMENTS.has(base)) {
      return `not admitted: \`${base}\` is a harness instruction-discovery root`;
    }
    if (INSTRUCTION_BASENAMES.has(base)) {
      return `not admitted: \`${base}\` is a harness instruction file`;
    }
    if (base === DENIED_BASENAME) {
      return `not admitted: \`${DENIED_BASENAME}\` is a harness configuration file`;
    }
    // (b)
    if (!base.endsWith('.md')) {
      return 'not admitted: only `.md` content files are promoted';
    }
    // (a)
    if (!dirs.some((d) => isUnder(segments, d))) {
      return 'not admitted: not under a writable vault tier directory';
    }
    return null;
  };
}

/**
 * True when `buf` survives a UTF-8 round trip unchanged.
 *
 * A decode that replaces an invalid sequence with U+FFFD is lossy, and a scan
 * over the replaced text is a scan over bytes that are not in the file. This is
 * the second half of "unscannable" — the first is the delta's own `binary` flag.
 * @param {Buffer} buf @returns {boolean}
 */
function isLosslessUtf8(buf) {
  return Buffer.from(buf.toString('utf8'), 'utf8').equals(buf);
}

/**
 * Read the live vault's bytes for `rel`, or `null` when the path is absent.
 *
 * This is the `vault-now` side of Table C's decision and the value that becomes
 * the primitive's `expect`. It is NOT a source any consumer may derive a fact
 * from — Table S row S4 forbids that, and this read happens BEFORE the publish,
 * never after it.
 * @param {string} vaultDir @param {string} rel
 * @returns {{bytes: Buffer|null}|{error: string}}
 */
function readVaultNow(vaultDir, rel) {
  try {
    return { bytes: fs.readFileSync(path.join(vaultDir, ...rel.split('/'))) };
  } catch (err) {
    const e = /** @type {NodeJS.ErrnoException} */ (err);
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return { bytes: null };
    // Fail closed: an unreadable vault path is not evidence that promotion is
    // safe, and guessing which of the two states it is in is how a modify/delete
    // conflict gets promoted as an add.
    return { error: `vault path could not be read (${e && e.code ? e.code : 'unknown error'})` };
  }
}

/**
 * The default git seam for the three-way merge (Table C, row M2).
 *
 * The merge's exit code is a security decision — clean means promote — so the
 * invocation takes the delta primitive's CONSTRUCTED-ENVIRONMENT discipline
 * (`docs/specs/done/WP-dream-baseline-delta-primitive.md`, its Table C), which
 * that spec owns and this one does not restate: an environment BUILT from
 * nothing rather than filtered, config and attribute roots pointed at
 * directories this run created empty, a cwd outside any repository, and the
 * verified absolute executable via `spawnPinnedSync`.
 *
 * Construction rather than a blocklist, because this program's record at
 * enumerating git's influence channels is 0 for 4 — a fifth list would be a
 * fifth guess. Measured here as corroboration only: an armed `merge=` driver
 * via `core.attributesFile` does not reach `merge-file`, and a hostile global
 * config did not move an exit code.
 *
 * NAMED RESIDUAL, inherited: an absolute verified invocation prevents PATH
 * selection of an impostor; it does not freeze the executable's bytes.
 *
 * Exposed as an injectable seam (`o.spawnGit`) so a test can observe every
 * invocation — in particular its `cwd`, which is this module's share of
 * CLAIM 2b.
 * @param {{args: string[], cwd: string, env: Record<string,string>}} o
 * @returns {{status: number|null, error?: Error}}
 */
function spawnGitForMerge(o) {
  return spawnPinnedSync('git', getPaths(), {
    args: o.args,
    cwd: o.cwd,
    env: o.env,
    platform: process.platform,
  });
}

/**
 * The single directory the constructed environment's PATH carries.
 *
 * A CONSTRUCTED ENVIRONMENT MUST STILL CARRY A PATH, and that PATH is a channel
 * — measured by the dependency: `env -i` with empty `HOME`/`XDG_CONFIG_HOME`
 * and `GIT_CONFIG_NOSYSTEM=1` still returned a forged answer when a directory
 * holding an executable named `git` came first on PATH. What closes it is not a
 * shorter PATH, it is the pinned absolute spawn: `spawnPinnedSync` re-resolves
 * the name on this PATH, refuses unless it lands on the pinned command path
 * inside the pinned install dir, verifies the target, and then spawns the
 * verified realpath.
 *
 * So the PATH is built from Wienerdog's OWN pin store rather than inherited —
 * one directory, the one the pin already names. An impostor placed there fails
 * the realpath, install-dir and verification checks before any spawn.
 *
 * Before the first `wienerdog sync` there is no store; the ambient PATH is used
 * so the primitive's own live-resolve-and-verify self-heal can run, and it is
 * that verification, not the PATH, that decides.
 * @returns {string}
 */
function mergePathEntry() {
  try {
    const pins = loadPins(getPaths());
    const git = pins && pins.git;
    if (git && typeof git.commandPath === 'string' && git.commandPath !== '') {
      return path.dirname(git.commandPath);
    }
  } catch {
    // An unreadable store is the primitive's to refuse, not this function's to
    // interpret; fall through to the ambient PATH and let it fail closed there.
  }
  return process.env.PATH || '';
}

/**
 * Build the constructed environment and the empty roots it points at, inside
 * `root` — a directory this call created.
 * @param {string} root @returns {Record<string,string>}
 */
function constructMergeEnv(root) {
  const home = path.join(root, 'home');
  const xdg = path.join(root, 'xdg');
  for (const d of [home, xdg]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  // A created empty file, not `/dev/null`: portable.
  const emptyConfig = path.join(home, 'empty-config');
  fs.writeFileSync(emptyConfig, Buffer.alloc(0), { mode: 0o600 });

  /** @type {Record<string,string>} */
  const env = {
    // BUILT FROM NOTHING: nothing is inherited, so `GIT_CONFIG_COUNT` and
    // friends cannot arrive even though this list never names them. The switch
    // list below stays as the RECIPE; the construction is the guarantee.
    PATH: mergePathEntry(),
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_ATTR_NOSYSTEM: '1',
    // The OTHER half of M2's cwd rule: "outside any repository". The three
    // switches above neutralise SYSTEM and GLOBAL config; none of them stops
    // REPOSITORY-LOCAL discovery walking up from the cwd, and the same ambient
    // input that produced the workspace defect can put that cwd inside a repo.
    // Measured by the dependency: a cwd inside a repository applies that
    // repository's `.gitattributes` even to operands living outside it.
    // A ceiling is construction, not enumeration — the walk cannot leave the
    // directory this call created, whatever is above it.
    GIT_CEILING_DIRECTORIES: root,
  };
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}

/**
 * Three-way merge, ON A COPY (Table C, row M1).
 *
 * THE TRAP, MEASURED on git 2.50.1: `git merge-file` exits 1 and writes
 * conflict markers INTO its first operand — for a divergent edit and for
 * modify/delete alike. So merging on the user's live note would leave conflict
 * markers in the very file refuse-and-report exists to protect. Every operand
 * here is a copy in a directory this call made, and the user's note is never
 * one of them.
 *
 * The cwd is that same temp directory, and CLAIM 2b — this module's share — is
 * that it is never at or beneath the workspace root. That is CHECKED, not
 * assumed: `os.tmpdir()` honours the ambient `TMPDIR`, which the dream already
 * passes through to the brain (`brain.js:225`), so an environment pointing it
 * into the workspace would put the merge's cwd inside the very directory the
 * claim excludes — and then workspace-local repository discovery could reach a
 * security decision. Found by the PR-review gate, reproduced, and closed here.
 *
 * The check uses the family's single containment helper rather than a second
 * implementation of the rule, and the failure is LOUD: a per-path refusal would
 * reach the user as "your edit conflicted", which is false, and would degrade
 * every divergent-edit promotion for as long as the misconfiguration lasted.
 * Nothing is half-done when it throws — this runs in the decision phase, before
 * any vault byte is written.
 * @param {{baseBytes: Buffer, oursBytes: Buffer, theirsBytes: Buffer,
 *          workspaceDir: string, spawnGit: typeof spawnGitForMerge}} o
 * @returns {{clean: true, bytes: Buffer}|{clean: false, reason: string}}
 * @throws {WienerdogError} when the temp root lands at or beneath the workspace
 */
function threeWayMerge(o) {
  // ABSOLUTE BEFORE THE CHECK, and this is the whole finding. `os.tmpdir()`
  // returns `TMPDIR` as given, so a RELATIVE `TMPDIR` yields a relative root —
  // and `isAtOrBeneath` answers `false` for every non-absolute candidate BY
  // DESIGN ("a non-absolute candidate is never inside anything", which is the
  // right answer where it was written, because resolving one against our cwd
  // is what broke a scheduled dream). Here that same rule makes the guard fail
  // OPEN: it reports "outside the workspace" about a path that is inside it.
  // Measured: with cwd `/tmp/x` holding `workspace/` and `TMPDIR=workspace`,
  // the root `workspace/wd-promote-merge-XXXX` passed the check while resolving
  // to `/private/tmp/x/workspace/wd-promote-merge-XXXX`.
  //
  // A GUARD THAT ASKS "AM I OUTSIDE?" CANNOT USE A HELPER THAT FAILS CLOSED ON
  // "INSIDE". Resolving first is what makes the helper's answer meaningful, and
  // the explicit absoluteness assertion keeps a later edit from silently
  // reintroducing the same shape.
  const root = path.resolve(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-promote-merge-')));
  try {
    if (!path.isAbsolute(root)) {
      throw new WienerdogError(`promote: the merge's temp root must be an absolute path (${root})`);
    }
    if (isAtOrBeneath(root, o.workspaceDir)) {
      throw new WienerdogError(
        'promote: the three-way merge needs a working directory outside the workspace, but the ' +
          `temp root resolved inside it (${root}). The merge's exit code is a security decision ` +
          'and must not be made from a directory the run itself writes — check `TMPDIR`.'
      );
    }
    const env = constructMergeEnv(root);
    const ours = path.join(root, 'ours');
    const base = path.join(root, 'base');
    const theirs = path.join(root, 'theirs');
    fs.writeFileSync(ours, o.oursBytes);
    fs.writeFileSync(base, o.baseBytes);
    fs.writeFileSync(theirs, o.theirsBytes);

    const res = o.spawnGit({ args: ['merge-file', ours, base, theirs], cwd: root, env });
    if (res && res.error) {
      return { clean: false, reason: `three-way merge could not run (${res.error.message})` };
    }
    if (!res || res.status !== 0) {
      // Exit 1..127 is the conflict count; anything else is a merge failure.
      // Both are refusals: only a CLEAN merge promotes.
      return { clean: false, reason: 'three-way merge conflicts with the current vault version' };
    }
    return { clean: true, bytes: fs.readFileSync(ours) };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/**
 * The pair directory a path belongs to, or `null` when it is not half of an
 * ADR-0020 skill/ledger pair. The guard authorizes the skill from the ledger and
 * the ledger is validated from the skill, so the two are decided together
 * (Table D, atomicity row).
 * @param {string} rel @param {import('../layout').VaultLayout} layout
 * @returns {string|null}
 */
function pairDirOf(rel, layout) {
  const skillsDir = layout && layout.skills_dir;
  if (!skillsDir || !isUnder(foldedSegments(rel), skillsDir)) return null;
  const base = rel.split('/').pop() || '';
  if (base !== SKILL_BASENAME && base !== LEDGER_BASENAME) return null;
  return rel.split('/').slice(0, -1).join('/');
}

/** @param {string} dir @param {string} base @returns {string} */
function siblingRel(dir, base) {
  return dir === '' ? base : `${dir}/${base}`;
}

/**
 * @param {import('./delta').Baseline} baseline @param {string} rel
 * @returns {Buffer|null}
 */
function baselineBytesOf(baseline, rel) {
  const files = baseline && baseline.files;
  if (!(files instanceof Map)) return null;
  const b = files.get(rel);
  return b === undefined ? null : b;
}

/**
 * Append the preserved-copy note to a refusal reason, when the secret gate
 * preserved one for this path. Table Q row Q3 makes the announcement of that
 * copy a data-loss concern rather than a reporting nicety, and a refusal is the
 * only channel a non-promoted path has.
 *
 * THE CLAUSE NAMES ITS OWN PATH, and that is not decoration. Because the
 * refused arm has no typed carrier (escalated), a consumer must read the
 * artifact out of this string — so on the skill/ledger pair route, where one
 * refusal quotes the other's reason, an unattributed clause pointed the user at
 * the SIBLING's copy. That is the same class of harm this note exists to
 * prevent. Pair refusals are additionally built from the sibling's UNDECORATED
 * reason, so exactly one clause is ever appended.
 * @param {string} reason @param {string|null|undefined} preserved
 * @param {string} rel @returns {string}
 */
function withPreserved(reason, preserved, rel) {
  if (typeof preserved !== 'string' || preserved === '') return reason;
  return `${reason} (an unredacted copy of \`${rel}\` was preserved as \`${preserved}\`)`;
}

/**
 * Decide, per changed path, what happens to it — and promote what survives.
 *
 * PURE DECISION FIRST, WRITES SECOND. Every POLICY decision in the run —
 * allowlist, merge, all four gates — is made before any vault byte is written
 * (Table E), and that is what makes the skill/ledger decision-atomicity
 * enforceable. It does NOT mean every outcome is decided first: the primitive's
 * `expect` guard is necessarily per-path at publish time, so a path can still
 * become refuse-and-report during the write phase, after earlier paths are
 * published. Cross-path WRITE-atomicity is not claimed — a first `rename` that
 * succeeds followed by one that fails leaves a half-applied pair, and the
 * rollback of a partial publish is the residue-lifecycle successor's subject.
 *
 * @param {{vaultDir:string, workspaceDir:string, date:string,
 *          baseline:import('./delta').Baseline,
 *          delta:ReturnType<import('./delta').computeDelta>,
 *          layout:import('../layout').VaultLayout,
 *          gates:{secret:Function, skillBody:Function, tier3:Function, ledger:Function},
 *          registry?:object, extractsBySession?:Map<string,object>,
 *          writeFile?:typeof writeIntoVault,
 *          spawnGit?:typeof spawnGitForMerge}} o
 *   vaultDir   the vault root — the only thing this module knows about the
 *              vault's location; it joins nothing under it for a WRITE
 *   workspaceDir the run's private write target, for diagnostics and for the
 *              CLAIM 2b cwd rule; no byte is read through it here (the delta
 *              already carries the after-bytes)
 *   date       the run's date. Supplied rather than derived so the module reads
 *              no clock; it is one of the skill-body guard's inputs
 *   baseline   the run's constructed baseline — the exact bytes the workspace
 *              was filled with, which is what "before" means for this run
 *   delta      the run's classified changes, computed by the CALLER. Passed in
 *              rather than computed here because the caller needs the same
 *              result for its own non-vacuity decision
 *              (`WP-dream-promote-in-workspace`, Table G), and computing it
 *              twice would let the two answers disagree
 *   layout     the effective vault layout; row C9 compares against its values
 *   gates      the four decision functions of Table D, INJECTED rather than
 *              imported so this module does not depend on `validate.js`. Their
 *              inputs differ BY GATE and Table D owns them: `secret` judges the
 *              delta's added lines against the baseline BEFORE the merge and
 *              returns the ADR-0034 taxonomy; `skillBody`, `tier3` and `ledger`
 *              judge the MERGED candidate bytes and return a refusal reason or
 *              `null`. Preserving an unredacted copy to quarantine is the
 *              SECRET GATE's own act, not this module's — but what that
 *              preservation PRODUCED travels back in its result, because the
 *              report line built from it is the user's only route back to their
 *              copy (Table Q)
 *   registry   the ownership-registry snapshot, threaded to the two gates whose
 *              rows name it. Table D's rule (b) forbids a gate substituting a
 *              vault re-read or a git query for any input it names, so a
 *              run-level value a gate needs has to arrive as an input
 *   extractsBySession this run's extracts keyed by session, threaded to the
 *              ledger validator for the same reason
 *   writeFile  test seam — the vault-write primitive. Defaults to the real
 *              `writeIntoVault`; a JS-only injection point, never an env one
 *   spawnGit   test seam — the merge's git invocation. Defaults to
 *              `spawnGitForMerge`
 *
 * @returns {{promoted:Array<{rel:string, bytes:Buffer}>,
 *            redacted:Array<{rel:string, bytes:Buffer,
 *                            lines:number, labels:string, artifact:string}>,
 *            refused:Array<{rel:string, reason:string}>,
 *            secretDisposition:{withheld:number, redactions:number}}}
 *   EVERY PUBLISHED ENTRY CARRIES BOTH HALVES — `rel` AND `bytes` (Table S).
 *   The bytes are the exact buffer the primitive returned: not the candidate
 *   this module composed, not a read of the target afterwards, and not a digest
 *   of either. Every fact a consumer derives about a published path — a
 *   frontmatter field, a length, a digest, a registry entry — is derived from
 *   that buffer, because re-reading the vault re-opens the window the publish
 *   closed. The path half is required because a consumer holding bytes without
 *   a path cannot stage, count or register them.
 *
 *   `refused[]` is `{rel, reason}` and carries NO bytes: nothing was published,
 *   so there is nothing to carry, and a field that could hold the candidate
 *   would invite a consumer to commit bytes the vault never took.
 *
 *   `redacted[]` additionally carries the EP2 accounting of Table Q row Q1 —
 *   the scrubbed-line count, the detector labels, and the artifact name the
 *   gate RETURNED (never one predicted from the date and path, which points the
 *   user at a file that does not exist on exactly the runs where two notes
 *   collide).
 *
 *   `secretDisposition` is the typed signal the pipeline's transcript-advance
 *   consumes — never a parsed refusal reason. ONLY `withheld` defers a
 *   transcript; `redactions` is accounting, because the sanitized note WAS
 *   promoted and its transcript was therefore consumed. Named `withheld`, not
 *   `reverts`: promotion never wrote the bytes, so there is nothing to revert.
 */
function promote(o) {
  const opts = o || {};
  const { vaultDir, workspaceDir, date, baseline, delta, layout, gates } = opts;
  if (typeof vaultDir !== 'string' || vaultDir === '') {
    throw new WienerdogError('promote: `vaultDir` must be a non-empty string');
  }
  if (typeof workspaceDir !== 'string' || workspaceDir === '') {
    throw new WienerdogError('promote: `workspaceDir` must be a non-empty string');
  }
  if (!baseline || !(baseline.files instanceof Map)) {
    throw new WienerdogError('promote: `baseline` must be a value returned by captureBaseline()');
  }
  if (!delta || !Array.isArray(delta.records)) {
    throw new WienerdogError('promote: `delta` must be a value returned by computeDelta()');
  }
  if (!gates || ['secret', 'skillBody', 'tier3', 'ledger'].some((k) => typeof gates[k] !== 'function')) {
    throw new WienerdogError('promote: `gates` must supply secret, skillBody, tier3 and ledger functions');
  }
  // FAIL LOUD LIKE THE OTHERS. A missing or malformed layout would otherwise
  // flow into `makeAdmit`, yield an empty set of writable tier directories, and
  // refuse EVERY path with "not under a writable vault tier directory" — a run
  // that promotes nothing and reads as policy rather than as a caller bug.
  // The two PARA directories are literals, so `admittedDirs` is never empty and
  // cannot itself detect this — the LAYOUT's own tier keys are what must be
  // there.
  const LAYOUT_TIER_KEYS = ['identity_dir', 'daily_dir', 'projects_dir', 'skills_dir', 'inbox_dir', 'reports_dir'];
  if (
    !layout ||
    typeof layout !== 'object' ||
    LAYOUT_TIER_KEYS.some((k) => typeof layout[k] !== 'string' || layout[k] === '')
  ) {
    throw new WienerdogError(
      'promote: `layout` must be a vault layout with every tier directory set — ' +
        `expected non-empty strings for ${LAYOUT_TIER_KEYS.join(', ')}`
    );
  }
  const writeFile = typeof opts.writeFile === 'function' ? opts.writeFile : writeIntoVault;
  const spawnGit = typeof opts.spawnGit === 'function' ? opts.spawnGit : spawnGitForMerge;
  const registry = opts.registry === undefined ? null : opts.registry;
  const extractsBySession = opts.extractsBySession === undefined ? new Map() : opts.extractsBySession;
  const admit = makeAdmit(layout);

  const disposition = { withheld: 0, redactions: 0 };

  /**
   * One decision per delta record, keyed by `rel`. `publish` entries carry the
   * candidate bytes and the `expect` the primitive will be given; `refuse`
   * entries carry a reason, plus — when the secret gate preserved an unredacted
   * copy for this path — that reason UNDECORATED (`refuseRaw`) and the artifact
   * name (`preserved`). The raw form exists so a pair refusal can quote its
   * sibling without inheriting the sibling's artifact clause.
   * @type {Map<string, {rel:string, refuse?:string, refuseRaw?:string,
   *   preserved?:string|null,
   *   candidate?:Buffer, expect?:Buffer|null,
   *   redaction?:{lines:number, labels:string, artifact:string}}>}
   */
  const decisions = new Map();

  // ── Phase 1: decide. No vault byte is written in this loop. ───────────────
  for (const record of delta.records) {
    const rel = record.rel;
    /**
     * A refusal, which by Table S row S3 is `{rel, reason}` and carries no
     * bytes. When the secret gate has already PRESERVED an unredacted copy for
     * this path, the reason NAMES it — otherwise a redaction that is
     * subsequently refused loses the only announcement that copy ever gets
     * (Table Q row Q3: `state/quarantine/redacted/` carries no digest banner,
     * so losing the line loses the copy in practice). Naming a survivor in the
     * refusal is this family's existing idiom — Table C row C1 requires exactly
     * that of a staging object the primitive leaves behind.
     *
     * PARTIAL, AND SAID SO: this keeps the artifact reachable inside a string
     * the contract already has. It does NOT give the report package a typed
     * field, which is a contract change and the owner's to make.
     * @param {string} reason
     */
    const refuse = (reason) =>
      decisions.set(rel, { rel, refuse: withPreserved(reason, preserved, rel), refuseRaw: reason, preserved });
    /** @type {string|null} the artifact name the secret gate reported, once it has */
    let preserved = null;

    // ── C1, the promotion allowlist — FIRST, because Table C says so ──────
    //
    // "Rows C1–C8 are the evaluated conditions, top to bottom, first match
    // decides." C1 is row one, so it precedes both C2 and the gates; an earlier
    // form of this loop ran C2 and the secret gate ahead of it and reported the
    // wrong reason for a deleted non-admitted path. This ordering also keeps
    // Table D intact, because the allowlist is a Table C ROW, not one of the
    // four gates — EP2 still runs first among the gates.
    //
    // The second consequence is the one that mattered: a path C1 can never
    // admit no longer reaches the secret gate, so it no longer increments
    // `secretDisposition.withheld` — and per Table E only `withheld` defers a
    // transcript. Deferring on a note that is unpromotable at any destination
    // would re-refuse it every run while holding the transcript back.
    //
    // The SAME function is handed to the primitive, which applies it to the
    // RESOLVED path. That second application is the one that sees a symlinked
    // component, and this one does not replace it.
    const notAdmitted = admit(rel);
    if (notAdmitted) {
      refuse(notAdmitted);
      continue;
    }

    // C2 — promotion never deletes. A deletion is unrecoverable and the brain
    // has no business making one; the vault keeps the note.
    if (record.status === 'deleted') {
      refuse('promotion never deletes: the vault keeps its version');
      continue;
    }

    const afterBytes = record.afterBytes;
    if (afterBytes === null || afterBytes === undefined) {
      refuse('promotion never deletes: the vault keeps its version');
      continue;
    }
    const recordBaseline = record.baselineBytes === undefined ? null : record.baselineBytes;

    // ── Gate 1 of 4: EP2 (ADR-0034), BEFORE the merge ─────────────────────
    //
    // UNSCANNABLE CONTENT IS A REFUSAL, NEVER A PASS, and the check is this
    // module's rather than the gate's. The delta primitive returns no line
    // numbers for a binary record — deliberately, so a consumer "withholds what
    // it cannot scan" (`delta.js:517-520`) — and a gate defined only over added
    // lines sees an empty scan and passes it, after which nothing else stops an
    // ordinary `.md` and it is promoted raw. Today's validator does the missing
    // work explicitly (`validate.js:1239-1255`), so passing it would be a
    // regression against shipped behaviour.
    if (record.binary === true) {
      disposition.withheld += 1;
      refuse('EP2: content is binary and cannot be secret-scanned; not promoted');
      continue;
    }
    if (!isLosslessUtf8(afterBytes)) {
      disposition.withheld += 1;
      refuse('EP2: content is not lossless UTF-8 and cannot be secret-scanned; not promoted');
      continue;
    }

    const verdict = gates.secret({
      rel,
      record,
      baselineBytes: recordBaseline,
      afterBytes,
      addedLineNumbers: record.addedLineNumbers,
      layout,
      date,
    });
    if (!verdict || typeof verdict !== 'object') {
      throw new WienerdogError(`promote: the secret gate returned no disposition for \`${rel}\``);
    }

    /** The bytes the merge and the remaining three gates work on. */
    let candidate = afterBytes;
    /** @type {{lines:number, labels:string, artifact:string}|null} */
    let redaction = null;

    if (verdict.refuse) {
      disposition.withheld += 1;
      refuse(`EP2: ${verdict.reason || 'secret withheld from promotion'}`);
      continue;
    }
    if (verdict.redact) {
      // Table Q, rows Q1–Q4. The redact arm's three extra fields are not
      // decoration: `lines` is how many added lines were scrubbed, `labels` is
      // what the detectors matched (never the matched bytes), and `artifact` is
      // the ACTUAL basename of the preserved unredacted copy — reported by the
      // preserving call, which resolves collisions itself, and never predicted.
      //
      // Q4, THE ONLY-COPY INVARIANT, is this module's share of it: refuse to
      // publish when it is unsatisfied. A redact arm that reports no artifact
      // is an arm whose preservation did not complete, and promoting the
      // sanitized bytes on that evidence would report a recovery route that
      // does not exist. This module cannot verify the copy — it never touches
      // the state directory (Q7) — so it refuses fail-loud rather than
      // weakening the invariant to "a copy was attempted".
      if (!Buffer.isBuffer(verdict.sanitizedBytes)) {
        throw new WienerdogError(
          `promote: the secret gate's redact arm returned no sanitized bytes for \`${rel}\``
        );
      }
      if (typeof verdict.artifact !== 'string' || verdict.artifact === '') {
        throw new WienerdogError(
          `promote: the secret gate's redact arm reported no preserved copy for \`${rel}\` — ` +
            'the only-copy invariant is unsatisfied and nothing is promoted'
        );
      }
      if (typeof verdict.lines !== 'number' || typeof verdict.labels !== 'string') {
        throw new WienerdogError(
          `promote: the secret gate's redact arm reported no scrub accounting for \`${rel}\``
        );
      }
      candidate = verdict.sanitizedBytes;
      redaction = { lines: verdict.lines, labels: verdict.labels, artifact: verdict.artifact };
      // From here on every refusal for this path names the preserved copy.
      preserved = verdict.artifact;
    } else if (!verdict.ok) {
      throw new WienerdogError(
        `promote: the secret gate returned an unrecognised disposition for \`${rel}\``
      );
    }

    // ── The three-way decision and the merge (Table C, rows C3–C8) ─────────
    const now = readVaultNow(vaultDir, rel);
    if ('error' in now) {
      refuse(now.error);
      continue;
    }
    const vaultNow = now.bytes;
    /** @type {Buffer|null} the primitive's `expect`; `null` means OMIT it. */
    let expect = null;

    if (record.status === 'added') {
      if (vaultNow !== null) {
        // C4 — the user created a note at that path during the run. The brain's
        // version does not displace it.
        refuse('a note already exists at this path in the vault');
        continue;
      }
      // C3 — nothing there; the workspace bytes are promoted as-is.
      expect = null;
    } else {
      if (vaultNow === null) {
        // C8 — modify/delete is a conflict and the user's deletion wins.
        refuse('the note was deleted in the vault during the run');
        continue;
      }
      expect = vaultNow;
      if (recordBaseline !== null && vaultNow.equals(recordBaseline)) {
        // C5 — the user did not touch it, so there is nothing to merge.
      } else if (recordBaseline === null) {
        // A record classified `modified` always has baseline bytes; treat the
        // impossible case as a refusal rather than as an unmergeable promote.
        refuse('the run has no baseline version of this note to merge against');
        continue;
      } else {
        // C6 / C7 — merge on a COPY, and promote only on a clean merge.
        const merged = threeWayMerge({
          baseBytes: recordBaseline,
          oursBytes: vaultNow,
          theirsBytes: candidate,
          workspaceDir,
          spawnGit,
        });
        if (!merged.clean) {
          // C7 — the note stays in the USER's live version.
          refuse(merged.reason);
          continue;
        }
        candidate = merged.bytes;
      }
    }

    decisions.set(rel, { rel, candidate, expect, redaction, preserved });
  }

  // ── Phase 1b: the three post-merge gates, on the MERGED candidate bytes ───
  //
  // They run after the merge because a Tier-3 / skill / ledger judgment must be
  // made on the bytes that would actually be published — a gate judging
  // pre-merge bytes would not be judging what is promoted, and that is a
  // data-loss contract, not an implementation detail.
  //
  // Each gate receives EVERY value Table D's row names. That enumeration is not
  // a summary: identical ledger bytes must be refused or admitted depending on
  // whether the named session appears in this run's extracts, so a gate handed
  // candidate bytes alone would silently drop ADR-0020's ownership, history and
  // invocation-binding controls while passing every byte-shaped case.
  for (const d of decisions.values()) {
    if (d.refuse) continue;
    const rel = d.rel;
    const pairDir = pairDirOf(rel, layout);
    const base = rel.split('/').pop() || '';
    const baselineLedgerBytes =
      pairDir === null ? null : baselineBytesOf(baseline, siblingRel(pairDir, LEDGER_BASENAME));

    let reason =
      gates.skillBody({
        rel,
        candidateBytes: d.candidate,
        baselineBytes: baselineBytesOf(baseline, rel),
        // The AUTHORIZING input is the BASELINE ledger, never the post-brain
        // one — otherwise the brain authorizes its own skill rewrite within a
        // single run.
        baselineLedgerBytes,
        registry,
        layout,
        date,
      }) || null;

    if (!reason) {
      reason = gates.tier3({ rel, candidateBytes: d.candidate, layout }) || null;
    }

    if (!reason) {
      // The paired SKILL.md bytes are selected by the pair decision: this run's
      // CANDIDATE when the skill changed too, otherwise the BASELINE — never
      // the live vault.
      let pairedSkillBytes = null;
      if (pairDir !== null && base === LEDGER_BASENAME) {
        const skillRel = siblingRel(pairDir, SKILL_BASENAME);
        const skillDecision = decisions.get(skillRel);
        pairedSkillBytes =
          skillDecision && skillDecision.candidate
            ? skillDecision.candidate
            : baselineBytesOf(baseline, skillRel);
      }
      reason =
        gates.ledger({
          rel,
          candidateBytes: d.candidate,
          baselineLedgerBytes,
          pairedSkillBytes,
          registry,
          extractsBySession,
          layout,
        }) || null;
    }

    if (reason) {
      // A gate refusing AFTER the secret gate redacted this path must not lose
      // the preserved copy's name — Table Q row Q3.
      decisions.set(rel, {
        rel,
        refuse: withPreserved(reason, d.preserved, rel),
        refuseRaw: reason,
        preserved: d.preserved,
      });
    }
  }

  // ── Phase 1c: the skill ↔ ledger pair promotes atomically AT THE DECISION ─
  //
  // The guard authorizes the skill from the ledger and the ledger is validated
  // from the skill, so promoting one while refusing the other would leave the
  // vault inconsistent. Both outcomes are decided before either is written,
  // which is what makes this enforceable; it is NOT a claim of write-atomicity
  // across the two paths.
  for (const d of [...decisions.values()]) {
    if (!d.refuse) continue;
    const pairDir = pairDirOf(d.rel, layout);
    if (pairDir === null) continue;
    const base = d.rel.split('/').pop() || '';
    const siblingBase = base === SKILL_BASENAME ? LEDGER_BASENAME : SKILL_BASENAME;
    const sibling = decisions.get(siblingRel(pairDir, siblingBase));
    if (sibling && !sibling.refuse) {
      decisions.set(sibling.rel, {
        rel: sibling.rel,
        refuse: withPreserved(
          // The sibling's RAW reason: quoting its decorated form would append a
          // second, unattributed artifact clause naming the WRONG file's copy.
          `paired with \`${d.rel}\`, which was refused: ${d.refuseRaw || d.refuse}`,
          sibling.preserved,
          sibling.rel
        ),
        refuseRaw: `paired with \`${d.rel}\`, which was refused: ${d.refuseRaw || d.refuse}`,
        preserved: sibling.preserved,
      });
    }
  }

  // ── Phase 2: write. Every vault byte goes through the primitive. ──────────
  /** @type {Array<{rel:string, bytes:Buffer}>} */
  const promoted = [];
  /** @type {Array<{rel:string, bytes:Buffer, lines:number, labels:string, artifact:string}>} */
  const redacted = [];
  /** @type {Array<{rel:string, reason:string}>} */
  const refused = [];

  for (const record of delta.records) {
    const d = decisions.get(record.rel);
    if (!d) {
      // Every record gets exactly one outcome; a record with no decision is a
      // bug, and saying nothing about it is how it stays one.
      throw new WienerdogError(`promote: no outcome was decided for \`${record.rel}\``);
    }
    if (d.refuse) {
      refused.push({ rel: d.rel, reason: d.refuse });
      continue;
    }

    /** @type {{vaultDir:string, rel:string, bytes:Buffer, admit:Function, expect?:Buffer}} */
    const call = { vaultDir, rel: d.rel, bytes: d.candidate, admit };
    // TWO STATES ONLY, never three: `expect` present means the target must
    // still hold exactly these bytes; OMITTED means it must not exist. The
    // primitive rejects an explicit `null` rather than guessing at it.
    if (d.expect !== null && d.expect !== undefined) call.expect = d.expect;

    const res = writeFile(call);
    if (!res || res.written !== true) {
      // The compare→promote window is NARROWED, not closed: a vault change
      // visible at the re-read abandons the write and the path is refused, and
      // a save landing between the re-read and the `rename` is the primitive's
      // stated residual, inherited here unchanged.
      // A redaction refused HERE — after the gate already preserved its copy —
      // still names that copy (Table Q, row Q3), exactly as the decision-phase
      // refusals do.
      refused.push({
        rel: d.rel,
        reason: withPreserved((res && res.reason) || 'the vault write was refused', d.preserved, d.rel),
      });
      continue;
    }

    // Table S — the DECIDED bytes are the ones the primitive returned.
    if (d.redaction) {
      redacted.push({
        rel: d.rel,
        bytes: res.bytes,
        lines: d.redaction.lines,
        labels: d.redaction.labels,
        artifact: d.redaction.artifact,
      });
      disposition.redactions += 1;
    } else {
      promoted.push({ rel: d.rel, bytes: res.bytes });
    }
  }

  return { promoted, redacted, refused, secretDisposition: disposition };
}

module.exports = {
  promote,
  // Exported for the deliverable test file. Row C9's policy and the merge's git
  // seam are each reachable through `promote()`, but a test that could only
  // reach them that way could not tell WHICH barrier fired, and the seam has to
  // be substitutable for the CLAIM 2b assertion to observe every `cwd`.
  makeAdmit,
  spawnGitForMerge,
  isLosslessUtf8,
};
