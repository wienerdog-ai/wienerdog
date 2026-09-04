'use strict';

/**
 * The promotion module (WP-dream-promote-module).
 *
 * WHAT THIS IS. The decision layer between the workspace and the vault. Given
 * the run's constructed baseline, the delta of what the brain wrote into the
 * workspace, and the live vault, it decides per path what happens — promote,
 * promote a merged version, promote a scrubbed version, or refuse-and-report —
 * runs four policy gates, publishes what survives through the vault-write
 * primitive, and returns the decided bytes. **The gates do NOT share one
 * input:** the secret scan judges what the BRAIN wrote, before the merge; the
 * other three judge the MERGED bytes that would actually be published. Table D
 * owns that split and this header states none of its rule.
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
// Table N's two transformations, both SHIPPED and both imported rather than
// re-implemented. `redactOnly` is the ONE shared detector's redact-only face
// (ADR-0024); `sanitizeProjectName` is the display-name sanitiser Table R's
// measured-cost row names. A second detector here would be the defect
// `src/core/transcripts/index.js:60` already warns against.
const { redactOnly } = require('../secret-scan');
const { sanitizeProjectName } = require('../digest');

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
 *
 * `docs/instruction-file-inventory.md` is the canonical, dated inventory this
 * Set is drawn from — a member here is not authoritative, that document is.
 */
const INSTRUCTION_BASENAMES = new Set([
  'claude.md',
  'claude.local.md',
  'agents.md',
  'agents.override.md',
  'agent.md',
  'gemini.md',
  'qwen.md',
  'warp.md',
  'replit.md',
]);

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
 *  directory (`validate.js:398`). */
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
 * way at `validate.js:1084-1087`.
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
 *       depth, no segment is `.claude` or `.codex`, the basename is not
 *       `.mcp.json`, and no segment — at any position, the basename included —
 *       begins with a dot.
 *
 * (a) and (b) are the positive allowlist and close the class M7's remediation
 * asks for: a vault-root `CLAUDE.md`, a `.gitignore`, a `.claude/settings.json`
 * and an Obsidian plugin binary are all outside it without anyone enumerating
 * them. (c) is the named deny-list of CURRENT conventions, plus the class rule.
 *
 * Discharges audit finding M7 (2026-08-05 ruling, item 1): every dot-prefixed
 * path segment is denied as a class, so a future control directory needs no
 * addition to `DENIED_SEGMENTS` to be refused here. Finding C3's layout
 * dot-rule (item 3, `isSafeRelativePath`) is the same ruling's other half and
 * is what makes this class rule unconditional; it is discharged in
 * `src/core/layout.js`, not here.
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
    // The class rule (row A5): LAST, after every enumerated check, so no path
    // refused above changes the reason it is refused with — only a path every
    // other clause admits can reach it, and the sole observable change is that
    // a previously admitted dot path is now refused.
    for (const seg of segments) {
      if (seg.startsWith('.')) {
        return `not admitted: path segment \`${seg}\` begins with a dot`;
      }
    }
    return null;
  };
}

// THE UTF-8 ROUND-TRIP CHECK IS NOT HERE, AND ITS ABSENCE IS THE CONTRACT
// (`WP-ep2-unscannable-preserve`, Table U row U2). Both halves of "unscannable"
// — the delta's `binary` flag and the round trip — are decided by the EP2 gate,
// which is the party that preserves; a second copy of the predicate in this
// module is what put the refusal ahead of the preservation before. This module
// hands the gate the delta `record` and the after-bytes and honours its verdict.

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
 * Read the preservation record off a gate verdict, checking only what this
 * module is entitled to check: that it is a list of entries carrying the two
 * fields the GATE fills. Absent means "nothing preserved" and is an empty list,
 * never a missing field — an optional field spanning "nothing preserved" and
 * "not asked" is the defect Table S row S2 records one field over.
 * @param {unknown} raw @param {string} rel @param {string} arm
 * @returns {GateReportedCopy[]}
 */
function readRecord(raw, rel, arm) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new WienerdogError(
      `promote: the secret gate's ${arm} arm returned a malformed preservation record for \`${rel}\``
    );
  }
  return raw.map((e) => {
    if (!e || typeof e.artifact !== 'string' || e.artifact === '' || typeof e.location !== 'string') {
      throw new WienerdogError(
        `promote: the secret gate's ${arm} arm reported a preserved copy without an artifact and location for \`${rel}\``
      );
    }
    return { artifact: e.artifact, location: e.location };
  });
}

/**
 * Fill the one field the gate cannot — AT OUTCOME TIME, which is the whole
 * reason it is not gate-reported. `restore-or-delete` for a copy whose
 * sanitized content this run PROMOTED; `delete` for a copy on a path nothing
 * was promoted for. Every downstream surface READS this value; none re-derives
 * it (Table Q, row Q9).
 * @param {GateReportedCopy[]} record @param {'restore-or-delete'|'delete'} remediation
 * @returns {PreservedCopy[]}
 */
function withRemediation(record, remediation) {
  return record.map((e) => ({ artifact: e.artifact, location: e.location, remediation }));
}

// ── The dream report (WP-dream-promote-report) ───────────────────────────────
//
// THE REPORT IS BOTH A PROMOTION CANDIDATE AND THE RECORD OF THE PROMOTION
// DECISIONS. The brain authors its body — including the `## Gated out (and why)`
// accounting no filesystem outcome can reconstruct
// (`skills/wienerdog-dream/SKILL.md:409-425`) — and it travels through the
// decision phase, the gates and the primitive exactly like any other note. Code
// then appends its own measured accounting beneath it.
//
// The hard case, and the reason the fallback exists: the report can itself be
// refused, and then the run's enforcement record has nowhere to live. Table R
// preserves BOTH values rather than choosing between them.

/** The heading the run's refusal accounting is written under. */
const ENFORCEMENT_HEADING = '## Refused by policy (promotion enforcement)';

/** The heading the redaction lines are written under — the shipped section name. */
const REDACTION_HEADING = '## Redacted in place (secret scan)';

/** The heading the preserved-copy lines of REFUSED paths are written under. */
const PRESERVED_HEADING = '## Preserved copies (secret quarantine)';

/**
 * What the report tells the user to do with one preserved copy, keyed by the
 * `remediation` the record carries. **READ, never decided here:** Table Q row
 * Q9 owns the field's values and which arm takes which, and this map is the
 * rendering of a value already on the entry — not a second derivation of it.
 * @type {Record<string, string>}
 */
const REMEDIATION_GUIDANCE = {
  'restore-or-delete':
    'If the redaction was wrong, restore from that copy while it is there; otherwise delete it.',
  delete: 'Nothing was promoted for this path; delete that copy.',
};

/**
 * TABLE N's TRANSFORMATION, IN TABLE N's ORDER: redact FIRST, then sanitise.
 *
 * The order is not interchangeable and the reason is measured, not reasoned
 * from reading (row N1): EP2's context-dependent detectors need the RAW bytes,
 * separators included, and `sanitizeProjectName` replaces every character
 * outside `[\p{L}\p{N}\p{M} ._-]` — `=` and `:` among them. Measured,
 * `token=abcdefghijkl` sanitises to `token_abcdefghijkl`, on which the detector
 * does not fire. The justification is NOT that the placeholder survives the
 * sanitiser unchanged (measured, `[REDACTED:generic-secret]` becomes
 * `_REDACTED_generic-secret_`); it is that sanitising a placeholder cannot
 * restore the secret the redactor already removed.
 * @param {unknown} value @returns {string}
 */
function neutralise(value) {
  return sanitizeProjectName(redactOnly(String(value)));
}

/**
 * One preserved copy, rendered from the entry's own fields and nothing else.
 *
 * `location` is interpolated RAW because Table N classifies it as needing no
 * transformation — it is the state-relative directory the GATE reported, drawn
 * from a code-owned closed set (Table Q, row Q9). Classified rather than
 * omitted: a channel with no classification is indistinguishable from one
 * nobody thought about, and that is how two leaks arose. `artifact` derives
 * from the brain-chosen path, so it is treated as attacker text.
 * @param {PreservedCopy} entry @returns {string}
 */
function copyClause(entry) {
  const guidance = REMEDIATION_GUIDANCE[entry.remediation];
  if (guidance === undefined) {
    throw new WienerdogError(
      `promote: a preserved copy carries no known remediation (\`${entry.remediation}\`) and the report cannot announce it`
    );
  }
  return `unredacted copy at state/${entry.location}/${neutralise(entry.artifact)}. ${guidance}`;
}

/**
 * The redaction line for ONE source — an entry of `redacted[]`, or the report
 * arm that is `promoted` with a non-null `redaction` (Table R's redaction-lines
 * row, and its disclosure-parity ruling). Both sources compose the SAME line
 * from the SAME shape, which is what parity of disclosure means here.
 *
 * `lines` and `labels` are READ off the accounting and NEVER recomputed: only
 * the gate held the pre-scrub bytes (Table Q, row Q10). Neither needs
 * neutralising — a count, and detector names from a code-owned closed set.
 * @param {string} rel @param {RedactionAccounting} redaction
 * @param {PreservedCopy[]} preserved @returns {string}
 */
function redactionLine(rel, redaction, preserved) {
  const copies = preserved.map(copyClause).join(' ');
  const head = `- \`${neutralise(rel)}\` — ${redaction.lines} line(s) scrubbed (${redaction.labels})`;
  return copies === '' ? `${head}.` : `${head}; ${copies}`;
}

/**
 * The preserved-copy line for ONE entry of a record whose path has NO redaction
 * accounting — a `refused[]` entry, or a `report` arm carrying none (Table R's
 * preserved-copy row). One line per ENTRY, in the record's own order, because
 * the redact-arm fall-through keeps two copies on two shelves and each needs
 * its own `location`.
 * @param {string} rel @param {PreservedCopy} entry @returns {string}
 */
function preservedLine(rel, entry) {
  return `- \`${neutralise(rel)}\` — ${copyClause(entry)}`;
}

/**
 * Compose the run's COMPLETE enforcement record.
 *
 * ONE COMPOSER, ONE RECORD. The returned lines ARE the section: the normal
 * second write and Table R's fallback both render exactly these, and
 * `report.record` carries exactly these to the caller when no write took them.
 * That is what makes "the complete record still reaches the user" a property
 * rather than a hope — the three surfaces cannot drift because there is one.
 *
 * THE PARTITION (Table R): every preserved copy is rendered EXACTLY ONCE, and
 * the split is over whether that copy's PATH HAS A REDACTION ACCOUNTING —
 * never over the outcome, and never over where the entry sits. A copy on a
 * `redacted[]` entry, and a copy on a `report` arm that is `promoted` with a
 * non-null `redaction`, ride the redaction line; every other copy rides its
 * own preserved-copy line.
 *
 * The two arrays are typed BY REFERENCE to `promote()`'s own return rather than
 * by writing their fields out again: the Mirrored Surface Checklist forbids any
 * surface here restating the fields of the module half's returned shapes, and a
 * second structural statement of them in this same file is how they went stale
 * twice (round-1 PR gate, finding 7).
 * @param {{records:Array<{path:string, reason:string}>,
 *          refused:ReturnType<typeof promote>['refused'],
 *          redacted:ReturnType<typeof promote>['redacted'],
 *          reportRel:string, reportRefusal:string|null,
 *          reportRedaction:RedactionAccounting|null,
 *          reportPreserved:PreservedCopy[]}} o
 * @returns {string[]} the record, heading lines included
 * @throws {WienerdogError} when the composed record does not survive its own
 *   neutralisation — Table N row N2's fail-closed default
 */
function composeRecord(o) {
  /** @type {string[]} */
  const lines = [ENFORCEMENT_HEADING];

  // The CALLER's pre-promotion accounting first — it happened before promotion
  // did — then this run's own refusals, then the report body's own refusal,
  // which is about the file the record is being written into.
  /** @type {string[]} */
  const enforcement = [];
  for (const r of o.records) {
    enforcement.push(`- \`${neutralise(r.path)}\` — ${neutralise(r.reason)}`);
  }
  for (const r of o.refused) {
    enforcement.push(`- \`${neutralise(r.rel)}\` — ${neutralise(r.reason)}`);
  }
  // Table R's accounting row: the run states plainly that the brain's body was
  // refused, and why. The body is not a member of `refused[]`, so this line has
  // no other source.
  if (o.reportRefusal !== null) {
    enforcement.push(`- \`${neutralise(o.reportRel)}\` — ${neutralise(o.reportRefusal)}`);
  }
  lines.push(...(enforcement.length > 0 ? enforcement : ['- none']));

  /** @type {string[]} */
  const redactionLines = [];
  for (const r of o.redacted) redactionLines.push(redactionLine(r.rel, r.redaction, r.preserved));
  if (o.reportRedaction !== null) {
    redactionLines.push(redactionLine(o.reportRel, o.reportRedaction, o.reportPreserved));
  }
  // Written only when there is something in it: an empty section is noise on
  // the common path, and `- none` is never written under this heading.
  if (redactionLines.length > 0) lines.push('', REDACTION_HEADING, ...redactionLines);

  /** @type {string[]} */
  const preservedLines = [];
  for (const r of o.refused) {
    for (const entry of r.preserved) preservedLines.push(preservedLine(r.rel, entry));
  }
  // The report body's copies land here on every arm that has no accounting to
  // name — the fallback's and the refused arm's, and the `promoted` arm whose
  // `redaction` is null. Preservation is ORTHOGONAL to outcome (Table Q, row
  // Q8), so the condition is the accounting's presence, never the arm.
  if (o.reportRedaction === null) {
    for (const entry of o.reportPreserved) preservedLines.push(preservedLine(o.reportRel, entry));
  }
  if (preservedLines.length > 0) lines.push('', PRESERVED_HEADING, ...preservedLines);

  // TABLE N, ROW N2 — THE FAIL-CLOSED DEFAULT, AND IT IS THE CONTRACT'S ACTUAL
  // ENFORCEMENT. The rows above classify the channels this composer knows
  // about; this check is what makes a channel nobody classified a failure
  // rather than a silent pass-through, which is exactly how both prior leaks
  // happened. It is stated over the COMPOSED text rather than per value, so it
  // also catches a context the composition itself creates between two values
  // that were each harmless alone.
  //
  // Measured, the check is sound in both directions: a neutralised value is a
  // FIXED POINT of `redactOnly` (`token=abcdefghijkl` → `token__REDACTED_…_`,
  // which redacts to itself), so a correctly wired channel never trips it,
  // while an unwired one carrying a context-dependent secret always does.
  //
  // Composition REFUSES fail-loud rather than per-path, because an unclassified
  // interpolation is a caller-side implementation defect and not a policy
  // outcome — the same reason the gate-contract violations above throw.
  const text = lines.join('\n');
  if (redactOnly(text) !== text) {
    throw new WienerdogError(
      "promote: the report's enforcement section did not survive its own neutralisation — " +
        'a channel reached it unneutralised and composition is refused'
    );
  }
  return lines;
}

/**
 * @typedef {{artifact:string, location:string}} GateReportedCopy
 *   One preserved unredacted copy, as the EP2 GATE reported it. BOTH fields are
 *   FILLED BY THE GATE, AT GATE TIME (Table Q, row Q9): `artifact` is the
 *   basename the preserving call actually used — it resolves collisions itself,
 *   so a caller that reconstructs the name points the user at a file that does
 *   not exist — and `location` is the state-relative directory it wrote to,
 *   reported rather than composed because this module never touches the state
 *   directory (row Q7).
 * @typedef {GateReportedCopy & {remediation:'restore-or-delete'|'delete'}} PreservedCopy
 *   The same entry once this module has filled the one field the gate cannot:
 *   `remediation` is FILLED BY THIS MODULE, AT OUTCOME TIME, because its value
 *   depends on whether the run ended up promoting the path — which the gate,
 *   running before the merge, cannot know. **Assigning is not re-deriving:**
 *   the gate reports no value for it, so there is nothing here to derive FROM.
 *   The no-re-derivation rule binds the surfaces DOWNSTREAM of this return.
 * @typedef {{lines:number, labels:string}} RedactionAccounting
 *   The scrub's PER-PATH accounting (Table Q, row Q10), both halves gate-filled.
 *   Per-path and not per-copy: the case with the MOST preserved copies — a
 *   redact arm falling through to a withhold — has no accounting at all.
 */

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
 *          records?:Array<{path:string, reason:string}>,
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
 *   records    code-owned accounting the CALLER produced before promotion and
 *              cannot compose into the report itself, because the report is
 *              composed here. Today's only producer is the pipeline's scratch
 *              enforcement (`WP-dream-promote-in-workspace`, row G12). Each is
 *              neutralised at composition exactly like this module's own
 *              records (Table N)
 *   writeFile  test seam — the vault-write primitive. Defaults to the real
 *              `writeIntoVault`; a JS-only injection point, never an env one
 *   spawnGit   test seam — the merge's git invocation. Defaults to
 *              `spawnGitForMerge`
 *
 * @returns {{promoted:Array<{rel:string, bytes:Buffer}>,
 *            redacted:Array<{rel:string, bytes:Buffer,
 *                            redaction:RedactionAccounting,
 *                            preserved:Array<PreservedCopy>}>,
 *            refused:Array<{rel:string, reason:string,
 *                           preserved:Array<PreservedCopy>}>,
 *            secretDisposition:{withheld:number, redactions:number},
 *            report:{outcome:'promoted', rel:string, bytes:Buffer,
 *                    redaction:RedactionAccounting|null,
 *                    preserved:Array<PreservedCopy>, record:string[],
 *                    accounting:({published:true}
 *                               |{published:false, reason:string})}
 *                  |{outcome:'fallback', rel:string, bytes:Buffer,
 *                    preserved:Array<PreservedCopy>, record:string[]}
 *                  |{outcome:'refused', rel:string, reason:string,
 *                    preserved:Array<PreservedCopy>, record:string[]}}}
 *   EVERY PUBLISHED ENTRY CARRIES BOTH HALVES — `rel` AND `bytes` (Table S).
 *   The bytes are the exact buffer the primitive returned: not the candidate
 *   this module composed, not a read of the target afterwards, and not a digest
 *   of either. Every fact a consumer derives about a published path — a
 *   frontmatter field, a length, a digest, a registry entry — is derived from
 *   that buffer, because re-reading the vault re-opens the window the publish
 *   closed. The path half is required because a consumer holding bytes without
 *   a path cannot stage, count or register them.
 *
 *   `refused[]` is `{rel, reason, preserved}` and carries NO BYTES: nothing was
 *   published, so there is nothing to carry, and a field that could hold the
 *   candidate would invite a consumer to commit bytes the vault never took.
 *   The no-bytes rule reaches BYTES and stops there — `preserved` names a file
 *   the GATE already wrote outside the vault, so it is not content and cannot
 *   be staged, committed or mistaken for a candidate (Table S, row S3).
 *
 *   `preserved` is on BOTH of these arms, `refused[]` included, and is REQUIRED
 *   AND POSSIBLY EMPTY: "no copy exists for this path" is stated rather than
 *   left to a missing field. It is `Array<PreservedCopy>`, whose two-typedef
 *   split above carries the per-field provenance. Table Q rows Q8 and Q9 own
 *   why it travels and which party fills each field; this block restates
 *   neither.
 *
 *   `redacted[]` additionally carries `redaction`, ONE `RedactionAccounting`
 *   holding the scrubbed-line count and the detector labels — both filled by
 *   the gate. Table Q row **Q10** owns it, and owns why it is one field and not
 *   two loose ones. It is PER-PATH, not per-copy, which is why it is not a
 *   field of the preservation record.
 *
 *   `secretDisposition` is the typed signal the pipeline's transcript-advance
 *   consumes — never a parsed refusal reason. ONLY `withheld` defers a
 *   transcript; `redactions` is accounting, because the sanitized note WAS
 *   promoted and its transcript was therefore consumed. Named `withheld`, not
 *   `reverts`: promotion never wrote the bytes, so there is nothing to revert.
 *
 *   `report` is the dream report's own outcome, never folded into `promoted`:
 *   the body is a promotion candidate like any other, but it is NOT a member of
 *   `promoted[]`, `redacted[]` or `refused[]` — its whole disposition travels
 *   here, and Table R's fallback publish is recorded as itself. It is a
 *   DISCRIMINATED UNION: a published arm REQUIRES `bytes` and the refused arm
 *   cannot carry them, because an optional field spanning success and refusal
 *   guarantees nothing on the successful branch. The published arms' `bytes`
 *   are decided bytes under Table S, and which of the two writes' buffer
 *   travels is Table Y's row Y3.
 *
 *   On `refused` — and on `promoted` when `accounting.published` is `false` —
 *   the COMPLETE enforcement record is in `record` and reaches the user through
 *   no other channel. RETURNING IT IS NOT DELIVERING IT: the caller delivers
 *   (`WP-dream-promote-in-workspace`, row G11).
 *
 *   `preserved` is on EVERY ARM, required and possibly empty, because the union
 *   discriminates on OUTCOME while preservation is ORTHOGONAL to outcome
 *   (Table Q, rows Q8 and Q9): the gate can redact the body and see the
 *   SANITIZED body publish, withhold it and see the fallback publish, or
 *   preserve a copy for a body that C4, C7, C8 or an H-rule then refuses. The
 *   body is not a member of `refused[]`, so without this field on the arm the
 *   run actually took, those copies leave the return entirely.
 *
 *   `redaction` is on the `promoted` arm ALONE, required and NULLABLE — the arm
 *   that means THIS CANDIDATE'S SANITIZED BYTES PUBLISHED, which is exactly
 *   where an ordinary note's accounting reaches it (Table Q, row Q10, which
 *   owns the fields and the scope). `null` states positively that the gate did
 *   not redact the body.
 *
 *   `accounting` is on the `promoted` arm ALONE, required, and is itself a
 *   discriminated sub-union. TABLE Y IS THE SINGLE OWNER OF THAT CONTRACT AND
 *   THIS BLOCK RESTATES NO PART OF IT — what is declared here is the TYPE and
 *   its two-arm shape, and nothing else.
 *
 *   `rel` is on EVERY ARM and required — the vault-relative path this arm's
 *   outcome is ABOUT. It exists because a single owner only holds while
 *   downstream READS the owner's value: `WP-dream-promote-in-workspace`'s row
 *   G8 commits the report path and has no other source for it, and any source
 *   it derived itself would be a SECOND derivation, wrong on the `promoted` arm
 *   in exactly the runs where the two spellings differ.
 *
 *   **ITS MEANING IS NOT CONSTANT ACROSS THE ARMS, and that is stated here
 *   rather than left to symmetry, per the per-field-provenance pattern
 *   (`WP-dream-promote-module`'s Table Q preamble).** On `promoted` it is the
 *   BODY's own `rel` — the spelling the brain wrote and both writes targeted.
 *   On `fallback` and on `refused` it is the DERIVED path, because no body was
 *   published on those arms and the fallback targets the derived path by
 *   decision, not by accident: where CODE-authored content lands in the user's
 *   vault is a code decision, and a brain-chosen spelling must not create a
 *   second report directory. Table Z's row Z5 owns which consumer takes which
 *   value; this block declares the field and its per-arm meaning and decides
 *   nothing else. A consumer that assumes one value for all arms is the defect
 *   row Z5's sixth prohibition names.
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
  // FAIL LOUD LIKE THE OTHERS, and this one guards a RECOVERY ROUTE. `date`
  // reaches the EP2 gate, which names the preserved unredacted copy
  // `<date>-<sanitized-basename>` — only the basename half is sanitized, so
  // this value is an UNSANITIZED path component. An `undefined` shelves the
  // user's only way back to their original bytes under `undefined-note.md`; a
  // separator shelves it somewhere else entirely. Nothing downstream would
  // notice: the run promotes normally either way. The SHAPE, and why it is a
  // positive allowlist rather than a separator deny-list, are Table D's `date`
  // row's; this check states none of that rule.
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new WienerdogError('promote: `date` must be a run date of the form YYYY-MM-DD');
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
  // FAIL LOUD LIKE THE OTHERS. `records` is accounting the caller could not
  // compose itself, and a malformed entry would reach the report as
  // `undefined — undefined` rather than as the refusal it stands for: a
  // silently mangled record is worse than a caller bug that says so.
  const callerRecords = opts.records === undefined ? [] : opts.records;
  if (
    !Array.isArray(callerRecords) ||
    callerRecords.some((r) => !r || typeof r.path !== 'string' || typeof r.reason !== 'string')
  ) {
    throw new WienerdogError(
      'promote: `records` must be an array of `{path, reason}` entries, both strings'
    );
  }
  const admit = makeAdmit(layout);

  const disposition = { withheld: 0, redactions: 0 };

  /**
   * One decision per delta record, keyed by `rel`. `publish` entries carry the
   * candidate bytes and the `expect` the primitive will be given; `refuse`
   * entries carry a reason. Both carry the gate's preservation record, which
   * gains its `remediation` only at outcome time in the write phase.
   * @type {Map<string, {rel:string, refuse?:string,
   *   preserved:GateReportedCopy[],
   *   candidate?:Buffer, expect?:Buffer|null,
   *   redaction?:RedactionAccounting|null}>}
   */
  const decisions = new Map();

  // ── TABLE Z — the report path: one derivation, one identity, one authority ─
  //
  // ROW Z1 — THE DERIVATION, AND ITS SINGLE OWNER. Derived ONCE per run, here,
  // and by no other surface: `<reports_dir>/<date>.md` with every EMPTY and
  // every `.` segment DROPPED. `date`'s shape is validated above precisely
  // because it is an unsanitized component of this name (Table D's `date` row).
  //
  // ROW Z2 — THE SPLIT OF OBLIGATIONS, and it is stated in BOTH directions
  // because it failed in both, one round each. The PRIMITIVE's row H1 requires
  // four shapes absent from a `rel` — no segment empty, none `.`, none `..`,
  // none containing a separator — and a violation THROWS rather than refusing,
  // so it cannot be reported, dispositioned or survived. `isSafeRelativePath`
  // (`layout.js:65-71`) already guarantees THREE of the four: no `..`, nothing
  // absolute or backslashed, and — since WP-dot-segment-denial's class rule —
  // no segment that IS `.`, a `.` segment being a dot-prefixed one like any
  // other. THE CALLER THEREFORE CLOSES EXACTLY THE REMAINING ONE — empty — and
  // needs no handling for the other three. Stating that absence matters: a
  // reader who re-adds a `..` check writes the duplicated containment rule the
  // spec forbids, and a reader who assumes the layout closes everything writes
  // the defect this row exists to end.
  // Measured, only TWO of the five now returned UNCHANGED by `readVaultLayout`:
  // `reports/dreams/`, `reports//dreams`. The other three — `.`, `./reports`,
  // `reports/./dreams` — each carry a dot-prefixed segment and now fall back to
  // the built-in default (WP-dot-segment-denial).
  //
  // DROPPING, not throwing and not defaulting: a throw would crash every run on
  // a legitimate config and take the whole run's enforcement record with it,
  // and substituting the built-in default would silently move the user's
  // reports. Only no-op segments are removed and `..` cannot be present, so
  // this can never move the report out of the directory the user configured.
  const reportRel = [
    ...String(layout.reports_dir)
      .split('/')
      .filter((seg) => seg !== '' && seg !== '.'),
    `${date}.md`,
  ].join('/');
  /**
   * ROW Z3 — THE IDENTITY, DECIDED ONCE PER RUN. Segment-wise NFC-normalised
   * and case-folded, the same predicate row C9 matches with and for the same
   * measured reasons: the primary filesystem is case-insensitive, and macOS
   * enumerates DECOMPOSED names while accepting composed ones. An identity
   * rule, never a containment rule — containment stays the primitive's.
   *
   * THE MATCHING SET IS DETERMINED ONCE, OVER THE WHOLE DELTA, BEFORE ANY
   * RECORD IS ROUTED. Evaluating the predicate independently at each routing
   * site is how a second match silently overwrote the first, and one evaluation
   * is what makes row Z4 statable at all.
   * @type {string[]}
   */
  const reportKey = foldedSegments(reportRel).join('/');
  const reportMatches = delta.records
    .map((r) => r.rel)
    .filter((rel) => foldedSegments(rel).join('/') === reportKey);
  /**
   * ROW Z4 — MORE THAN ONE MATCH: THE RUN HAS NO BODY. Folding is correct on a
   * case-INsensitive volume and OVER-matches on a case-SENSITIVE one, where two
   * spellings that fold alike are two different files. Both are supported
   * targets, so the collision is reachable and is decided here rather than left
   * to whichever branch runs last.
   *
   * The invariant this protects: EVERY delta record has EXACTLY ONE carrier in
   * the return. Measured before row Z4 existed, two folding matches left BOTH
   * records with NO carrier — the state this module throws for one branch
   * earlier, reached without the throw. Refusal rather than a throw is
   * deliberate: a throw loses the enforcement record for every other path.
   * @type {string|null} the body's own `rel`, or `null` when there is no body
   */
  const bodyRel = reportMatches.length === 1 ? reportMatches[0] : null;
  /** @param {string} rel @returns {boolean} */
  const isReport = (rel) => bodyRel !== null && rel === bodyRel;
  /** The collision reason, composed once so both refusal routes carry it. */
  const collisionReason =
    reportMatches.length > 1
      ? `more than one candidate is the dream report for this date (${reportMatches.length} paths differ only by case or Unicode normalisation); none is promoted as the report`
      : null;

  // ── Phase 1: decide. No vault byte is written in this loop. ───────────────
  for (const record of delta.records) {
    const rel = record.rel;
    /**
     * A refusal. By Table S row S3 it carries no bytes; by row Q9 it DOES carry
     * the preservation record, because the gate may already have written an
     * unredacted copy before anything downstream refused the path — and
     * `state/quarantine/` announces nothing on its own (row Q3).
     *
     * The record is the ONLY carrier. An earlier form named the copy inside the
     * reason string, and that prose form produced its own defect within one
     * review round: the pair refusal quoted its sibling's decorated reason and
     * named the WRONG file's copy first. `remediation` is filled here, at
     * outcome time: nothing was promoted for this path, so the copy is a delete.
     * @param {string} reason
     */
    const refuse = (reason) =>
      decisions.set(rel, { rel, refuse: reason, preserved });
    /** @type {GateReportedCopy[]} what the gate reported preserving, if anything */
    let preserved = [];

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
    // UNSCANNABLE CONTENT IS A REFUSAL, NEVER A PASS — AND THE CLASSIFICATION
    // IS THE GATE'S, NOT THIS MODULE'S (`WP-ep2-unscannable-preserve`, Table U;
    // owner ruling of 2026-08-31). The delta primitive returns no line numbers
    // for a binary record — deliberately, so a consumer "withholds what it
    // cannot scan" (`delta.js:517-520`) — so a gate defined only over added
    // lines would see an empty scan and pass it. The EP2 gate therefore asks
    // "can these bytes be scanned at all?" before it scans, and routes the
    // no-answer to its own withhold arm, which PRESERVES the bytes to
    // `state/quarantine/` and then refuses. This module ran that check itself in
    // an earlier form, and the ordering cost the class its durable artifact and
    // its digest banner while the hard-secret class beside it kept both.
    //
    // What this module still owns is unchanged: the `verdict.refuse` branch
    // below counts the withhold and carries the gate's preservation record.
    // `record` is handed to the gate BECAUSE of this — the `binary` flag is the
    // primitive's answer and only this module holds it.
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
    /** @type {RedactionAccounting|null} */
    let redaction = null;

    if (verdict.refuse) {
      // BOTH EP2 arms preserve (Table D), so the hard withhold reports a
      // record too. Q4, THE ONLY-COPY INVARIANT — this module's share of it,
      // against a gate it does not own (the gate is INJECTED): an empty
      // record on a refusal is the same unsatisfied invariant the redact arm
      // below already refuses, and it is refused the same way — fail-loud
      // rather than trust an obviously-unsatisfied record from a defective
      // gate (`WP-preservation-abort-widening`, Table P row P4).
      preserved = readRecord(verdict.preserved, rel, 'refuse');
      if (preserved.length === 0) {
        throw new WienerdogError(
          `promote: the secret gate's withhold arm reported no preserved copy for \`${rel}\` — ` +
            'the only-copy invariant is unsatisfied and nothing is promoted'
        );
      }
      disposition.withheld += 1;
      refuse(`EP2: ${verdict.reason || 'secret withheld from promotion'}`);
      continue;
    }
    if (verdict.redact) {
      // Table Q, rows Q1, Q9 and Q10. The redact arm carries two structured
      // values besides its bytes: the PER-PATH scrub accounting (`redaction`)
      // and the PER-COPY preservation record (`preserved`).
      //
      // Q4, THE ONLY-COPY INVARIANT, is this module's share of it: refuse to
      // publish when it is unsatisfied. An empty record is an arm whose
      // preservation did not complete, and promoting the sanitized bytes on
      // that evidence would report a recovery route that does not exist. This
      // module cannot verify the copy — it never touches the state directory
      // (Q7) — so it refuses fail-loud rather than weakening the invariant to
      // "a copy was attempted".
      if (!Buffer.isBuffer(verdict.sanitizedBytes)) {
        throw new WienerdogError(
          `promote: the secret gate's redact arm returned no sanitized bytes for \`${rel}\``
        );
      }
      preserved = readRecord(verdict.preserved, rel, 'redact');
      if (preserved.length === 0) {
        throw new WienerdogError(
          `promote: the secret gate's redact arm reported no preserved copy for \`${rel}\` — ` +
            'the only-copy invariant is unsatisfied and nothing is promoted'
        );
      }
      const acc = verdict.redaction;
      if (!acc || typeof acc.lines !== 'number' || typeof acc.labels !== 'string') {
        throw new WienerdogError(
          `promote: the secret gate's redact arm reported no scrub accounting for \`${rel}\``
        );
      }
      candidate = verdict.sanitizedBytes;
      redaction = { lines: acc.lines, labels: acc.labels };
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
      decisions.set(rel, { rel, refuse: reason, preserved: d.preserved });
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
        // Plain: with no artifact clause in either string there is nothing for a
        // quoted sibling reason to drag along, so the raw/decorated split the
        // prose form needed is gone with it.
        refuse: `paired with \`${d.rel}\`, which was refused: ${d.refuse}`,
        preserved: sibling.preserved,
      });
    }
  }

  // ── Phase 1d: Table Z row Z4 — the report-path collision ─────────────────
  //
  // Re-decided HERE rather than refused up front, for the same reason phase 1c
  // re-decides a pair: a colliding path is an ORDINARY refused candidate, so it
  // goes through the gates like any other and keeps whatever preservation
  // record EP2 produced for it. Refusing before the gates ran would silently
  // drop those copies, which is the data-loss shape row Q3 names.
  if (collisionReason !== null) {
    for (const rel of reportMatches) {
      const d = decisions.get(rel);
      if (!d) continue;
      decisions.set(rel, { rel, refuse: collisionReason, preserved: d.preserved });
    }
  }

  // ── Phase 2: write. Every vault byte goes through the primitive. ──────────
  /** @type {Array<{rel:string, bytes:Buffer}>} */
  const promoted = [];
  /** @type {Array<{rel:string, bytes:Buffer, redaction:RedactionAccounting, preserved:PreservedCopy[]}>} */
  const redacted = [];
  /** @type {Array<{rel:string, reason:string, preserved:PreservedCopy[]}>} */
  const refused = [];

  /**
   * The report body's own outcome, kept OUT of the three arrays above: the body
   * is not a member of `refused[]`, and its whole disposition travels on
   * `report`. `null` until the write phase reaches it — and still `null`
   * afterwards when the brain wrote no report at all, which is one member of
   * Table R's trigger class.
   * Carries the DECIDED path as well as the outcome: the second write must
   * target the object the FIRST write published, which on a normalisation- or
   * case-insensitive filesystem can be a different spelling of `reportRel`.
   * @type {{rel:string, published:true, bytes:Buffer,
   *         redaction:RedactionAccounting|null, preserved:PreservedCopy[]}
   *       |{rel:string, published:false, reason:string,
   *         preserved:PreservedCopy[]}|null}
   */
  let reportBody = null;

  for (const record of delta.records) {
    const d = decisions.get(record.rel);
    if (!d) {
      // Every record gets exactly one outcome; a record with no decision is a
      // bug, and saying nothing about it is how it stays one.
      throw new WienerdogError(`promote: no outcome was decided for \`${record.rel}\``);
    }
    if (d.refuse) {
      // Nothing was promoted for this path, so any copy the gate preserved is a
      // delete. The value is filled HERE because only here is the outcome known.
      const outcome = { rel: d.rel, reason: d.refuse, preserved: withRemediation(d.preserved, 'delete') };
      if (isReport(d.rel)) {
        reportBody = { rel: d.rel, published: false, reason: d.refuse, preserved: outcome.preserved };
      } else {
        refused.push(outcome);
      }
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
      const reason = (res && res.reason) || 'the vault write was refused';
      const preserved = withRemediation(d.preserved, 'delete');
      // A PRIMITIVE refusal of the body — its H5 `expect` guard, a symlinked
      // target under H3, any H-rule — is one member of Table R's trigger class,
      // and the class is what this branch routes on rather than a list.
      if (isReport(d.rel)) reportBody = { rel: d.rel, published: false, reason, preserved };
      else refused.push({ rel: d.rel, reason, preserved });
      continue;
    }

    // Table S — the DECIDED bytes are the ones the primitive returned.
    if (isReport(d.rel)) {
      // The body published. Its copy is restorable for the same reason an
      // ordinary redacted note's is: this run promoted its sanitized content.
      reportBody = {
        rel: d.rel,
        published: true,
        bytes: res.bytes,
        redaction: d.redaction || null,
        preserved: withRemediation(d.preserved, 'restore-or-delete'),
      };
      if (d.redaction) disposition.redactions += 1;
      continue;
    }
    if (d.redaction) {
      redacted.push({
        rel: d.rel,
        bytes: res.bytes,
        redaction: d.redaction,
        // This path's sanitized bytes DID publish, so its copy is restorable.
        preserved: withRemediation(d.preserved, 'restore-or-delete'),
      });
      disposition.redactions += 1;
    } else {
      promoted.push({ rel: d.rel, bytes: res.bytes });
    }
  }

  // ── Phase 3: the report's SECOND write, or Table R's fallback ─────────────
  //
  // Composed HERE, after every other path has its outcome, because the record
  // is BUILT FROM those outcomes. One composer feeds all three destinations:
  // the appended section, the fallback's candidate, and `report.record`.
  const bodyPublished = reportBody !== null && reportBody.published === true;
  const reportRedaction = bodyPublished ? reportBody.redaction : null;
  const reportPreserved = reportBody === null ? [] : reportBody.preserved;
  // The path the record NAMES, and the path the second write TARGETS, is the one
  // the body was actually decided and published at — `reportRel` only when there
  // is no body to have a path of its own.
  const effectiveRel = reportBody === null ? reportRel : reportBody.rel;
  const record = composeRecord({
    records: callerRecords,
    refused,
    redacted,
    reportRel: effectiveRel,
    reportRefusal: bodyPublished || reportBody === null ? null : reportBody.reason,
    reportRedaction,
    reportPreserved,
  });
  const section = Buffer.from(`${record.join('\n')}\n`, 'utf8');
  /**
   * Appended form: a blank line, then the section — the shipped separator.
   * The base is normalised to end in a newline first, because on Table R's R3
   * the base is whatever the USER's file holds and a file with no trailing
   * newline would put the heading directly under a paragraph line. The shipped
   * append guaranteed a `\n`-terminated base; this keeps that guarantee.
   */
  const appendedTo = (base) =>
    Buffer.concat([
      base,
      Buffer.from(base.length > 0 && base[base.length - 1] === 0x0a ? '\n' : '\n\n', 'utf8'),
      section,
    ]);

  /** @type {ReturnType<typeof promote>['report']} */
  let report;
  if (bodyPublished) {
    // TABLE Y — THE SECOND WRITE. Through the primitive, never an in-place
    // append, with `expect` set to the bytes the FIRST publish RETURNED (the
    // primitive's rows H5 and H6). The first write published the body; this one
    // publishes body-plus-section, and the two can disagree.
    const second = writeFile({
      vaultDir,
      rel: reportBody.rel,
      bytes: appendedTo(reportBody.bytes),
      admit,
      expect: reportBody.bytes,
    });
    report =
      second && second.written === true
        ? {
            outcome: 'promoted',
            rel: reportBody.rel,
            bytes: second.bytes,
            redaction: reportRedaction,
            preserved: reportPreserved,
            record,
            accounting: { published: true },
          }
        : {
            // Row Y2 — grounded in the PUBLISH EVENT: this run's first write
            // published the body, which is why this is not `fallback` (the body
            // did not publish) and not `refused` (nothing published at all).
            // Row Y3 — the FIRST write's buffer travels, never a fresh read.
            // Row Y5 — what this states positively is that the enforcement
            // section never reached the vault; what the target holds now is
            // refusal-cause-specific and nothing here represents it (row Y4).
            outcome: 'promoted',
            rel: reportBody.rel,
            bytes: reportBody.bytes,
            redaction: reportRedaction,
            preserved: reportPreserved,
            record,
            accounting: {
              published: false,
              // Row Y9 — the reason ORIGINATES WITH THE PRIMITIVE (its row H7)
              // and is carried unchanged; this module composes none of its own.
              reason: (second && second.reason) || 'the vault write was refused',
            },
          };
  } else {
    // TABLE R — PRESERVE-AND-EXTEND. The fallback preserves BOTH values at
    // stake — the report already in the vault AND this run's enforcement record
    // — and never chooses between them. The shape is the second write
    // generalised: read, compose in memory, publish once with `expect` set to
    // what was read. The only difference is what the base bytes are.
    const now = readVaultNow(vaultDir, reportRel);
    if ('error' in now) {
      // Fail closed. An unreadable report path is not evidence the fallback is
      // safe, and R4's outcome is the one that holds: the vault object is left
      // untouched and the complete record goes back to the caller.
      report = { outcome: 'refused', rel: reportRel, reason: now.error, preserved: reportPreserved, record };
    } else {
      /** @type {{vaultDir:string, rel:string, bytes:Buffer, admit:Function, expect?:Buffer}} */
      const call =
        now.bytes === null
          ? // R1 — no report for this date; the code section alone is published,
            // and the OMITTED `expect` is how the primitive is told the target
            // must not exist.
            { vaultDir, rel: reportRel, bytes: section, admit }
          : // R2 and R3 are ONE rule: the base is the bytes ACTUALLY there, and
            // the fallback never reconstructs or "corrects" a diverged file.
            { vaultDir, rel: reportRel, bytes: appendedTo(now.bytes), admit, expect: now.bytes };
      const res = writeFile(call);
      report =
        res && res.written === true
          ? { outcome: 'fallback', rel: reportRel, bytes: res.bytes, preserved: reportPreserved, record }
          : {
              // R4 — the file mutated between the read and the publish, or the
              // primitive refused for any other reason. The vault object is left
              // untouched, the complete record goes to the caller, and the
              // refusal NAMES ITS REASON. In this narrow window an overwrite
              // would be the worse failure: it would clobber the user's edit.
              outcome: 'refused',
              rel: reportRel,
              reason: (res && res.reason) || 'the vault write was refused',
              preserved: reportPreserved,
              record,
            };
    }
  }

  return { promoted, redacted, refused, secretDisposition: disposition, report };
}

module.exports = {
  promote,
  // Exported for the deliverable test file. Row C9's policy and the merge's git
  // seam are each reachable through `promote()`, but a test that could only
  // reach them that way could not tell WHICH barrier fired, and the seam has to
  // be substitutable for the CLAIM 2b assertion to observe every `cwd`.
  makeAdmit,
  spawnGitForMerge,
};
