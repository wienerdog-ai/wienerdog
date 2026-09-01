'use strict';
/**
 * THE PINNED CALL SET, IN A FILE OF ITS OWN — and that is the whole design.
 *
 * Its source form is pinned by a SHA-256 over THIS ENTIRE FILE, held by the
 * digest constant in its consumer, `dream-pipeline.test.js`. When the whole
 * artifact is the span there is nothing to locate, so the class of evasions
 * that live in JavaScript's grammar — decoys in comments or strings, block
 * scoping, destructuring, look-alike identifiers — cannot arise: a decoy
 * placed anywhere in this file is inside the hashed bytes.
 *
 * EVERY BYTE COUNTS, COMMENTS INCLUDED (whitespace runs are collapsed first, so
 * re-indentation is free). Editing anything here — a shape, a slot kind, a
 * sentence of this comment — means re-pinning the digest in the SAME commit as
 * the Table W row W1(c) change. That two-file adjacency is deliberate.
 */

/**
 * THE RUN'S OWN CALL SET — PINNED, and everything else is a violation.
 *
 * WHY THE DIRECTION IS THIS WAY ROUND (owner ruling, 2026-08-31). Enumerating
 * the BAD is unclosable, because git's grammar is not ours and it grows.
 * Enumerating our OWN GOOD is closable, because the run's call set is ours.
 * Two independent refutations two rounds apart retired the other direction:
 *
 *   1. THE GRAMMAR GROWS. `git --attr-source log update-index --chmod=+x f`
 *      writes the user's index (measured: mode 100644 -> 100755). The verb
 *      resolver did not know `--attr-source` consumes a value — it arrived in
 *      git 2.40 — so it read the verb as `log`, which was ALLOWLISTED, and the
 *      write went unflagged. The round before had patched `--namespace` for the
 *      identical shape.
 *   2. THE TARGET IS NOT A PROPERTY OF THE CONFIGURATION.
 *      `GIT_INDEX_FILE=<private> git read-tree --index-output=<user> HEAD`
 *      DESTROYED the user's staged content (measured: a staged entry reverted
 *      to its committed blob) while an index-identity probe reported the
 *      private index. `--index-output` is a SUBCOMMAND flag, so no replay of
 *      global options can reach it.
 *
 * MATCHING IS STRICT SHAPE-EQUALITY, NEVER RE-CLASSIFICATION: same argument
 * count, every literal equal, and `ANY` accepts one token WITHOUT INSPECTING
 * IT. Nothing here parses git's grammar or judges what a call means — a fuzzy
 * matcher would smuggle the retired direction back in. Both exploits above fail
 * against this set rather than by being understood — refutation 1 as an unknown
 * shape, refutation 2 by the RUN_VALUE slot below, which is the narrower claim
 * and the true one.
 *
 * OWNER-VISIBILITY RESTS ON W1(c)'s CANONICITY, not on row W6. W6's standing
 * clause is keyed on index-derived INPUTS and independently reaches only that
 * subset; the two are NOT co-extensive, and a new shape that feeds nothing
 * index-derived is still an owner-visible change to the canonical table.
 */
const ANY = Symbol('any single token, never inspected');
/**
 * A slot holding A VALUE THIS RUN ITSELF COMPUTED, observed at the seam.
 *
 * `ANY` was too wide for the object-name slots, and measurably so: `read-tree`
 * accepts `--index-output=<path>` as its sole argument, so
 * `['read-tree', '--index-output=<user index>']` matched `['read-tree', ANY]`
 * on arity and EMPTIED the user's index — with a legitimate private
 * `GIT_INDEX_FILE` set and every disposition clause satisfied. A data slot that
 * cannot tell data from an option is not pinned at all.
 *
 * The repair does NOT inspect the token, because inspecting tokens is the
 * retired direction. It compares the token to the run's OWN-VALUE SET, whose
 * membership rule is exactly this: a value joins only if it is an OBJECT NAME
 * GIT ITSELF EMITTED as the whole stdout of one of this run's pinned PRODUCING
 * shapes — never bytes read back out of a file in the user's vault, and never
 * a composite line carrying user-supplied data. Its four members are the head
 * from `rev-parse HEAD`, blobs from `hash-object`, the tree from `write-tree`
 * and the commit from `commit-tree`, and ALL FOUR satisfy the rule as stated:
 * `rev-parse HEAD` returns git's own name for the user's current commit, not
 * content from a file the user authored. Two shapes are excluded and each has
 * its reason — `show HEAD:<path>` returns FILE CONTENT out of the user's vault
 * history, and `ls-tree` returns a composite line embedding a user-controlled
 * path. (An earlier form of this rule was stated with a word that claimed the
 * run had made these values itself; that was false for the head, which is read
 * back from the user's ref, and the wording was retired at `b19121bb`.)
 * Identity to an emitted value is available without any grammar. That is the
 * same structural ground the pinned set stands on: our own values are ours to
 * enumerate; git's grammar is not.
 */
const RUN_VALUE = Symbol('a value this run computed, observed at the seam');

/** @type {{env:'unset'|'private', args:(string|symbol)[]}[]} */
const KNOWN_CALLS = [
  { env: 'unset',   args: ['ls-tree', RUN_VALUE, '--', ANY] },
  { env: 'unset',   args: ['hash-object', '-w', '--stdin'], produces: true },
  { env: 'private', args: ['update-index', '--add', '--cacheinfo', ANY, RUN_VALUE, ANY] },
  // SPELLED LITERALLY ON PURPOSE — do not import WARNINGS_REL and do not
  // interpolate it. The run's own argument is a constant built at
  // `cli/dream.js:1004` from `core/dream/warnings.js:72`; retyping it here is
  // the tripwire that makes a relocation LOUD instead of silent.
  { env: 'unset',   args: ['show', 'HEAD:reports/warnings.md'] },
  { env: 'unset',   args: ['rev-parse', 'HEAD'], produces: true },
  { env: 'private', args: ['read-tree', RUN_VALUE] },
  { env: 'private', args: ['write-tree'], produces: true },
  { env: 'unset',   args: ['-c', 'user.name=wienerdog', '-c', 'user.email=wienerdog@localhost',
    'commit-tree', RUN_VALUE, '-p', RUN_VALUE, '-m', ANY], produces: true },
  { env: 'unset',   args: ['update-ref', '-m', ANY, 'HEAD', RUN_VALUE, RUN_VALUE] },
];

module.exports = { ANY, RUN_VALUE, KNOWN_CALLS };
