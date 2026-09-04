---
title: W1 wording follow-ups — the seven findings PRs #203/#204/#205 routed out of boundary
date: 2026-09-04
related_wps: [WP-dream-promote-in-workspace, WP-show-slot-own-value-kind, WP-index-guard-residuals, WP-criterion-red-harness, WP-preservation-abort-widening, WP-secret-fence-ep2-redact-arm]
---

# 2026-09-04 — W1 wording follow-ups

Base: `4b06afa0` (= `origin/main` after PRs #201–#206 merged on 2026-09-04).
Branch: `docs/w1-wording-followups-2026-09-04`. Docs-only; nothing under `src/`
or `tests/` was touched, and the one finding that would have required a code
edit is dispositioned as a registered residual rather than smuggled in.

**Why this record exists rather than a PR-body note.** All three PRs' review
gates routed findings to wd-architect as out-of-boundary for their implementers.
The findings all live in `docs/specs/`, they are all mirror-drift of the same
ADR-0031 kind, and two of the three PRs are already merged — so there was no PR
body left to carry the disposition. This is the disposition.

**Note on paths.** At `4b06afa0`, `WP-criterion-red-harness` and
`WP-preservation-abort-widening` still sit at `docs/specs/` with
`status: In-Review`; the parallel PR flipping the four merged specs into `done/`
had not landed in this worktree. Every edit below was made at the path that
existed, and no `status:` was changed.

**Rebase note (orchestrator, 2026-09-04).** The flip landed as PR #207 and this
branch was rebased onto `705ae286` before its PR opened; git carried the item-7
edit across the rename, so on `main` that hunk lives at
`docs/specs/done/WP-criterion-red-harness.md` (same line region). The
`docs/specs/WP-criterion-red-harness.md` paths quoted below are the pre-rebase
paths the commands were actually run against and are left as recorded.

---

## Dispositions, one line each

| # | Finding | Disposition | Where it landed |
|---|---------|-------------|-----------------|
| 1 | Nine positional citations into `tests/unit/dream-pipeline.test.js` rotted | **FIX** — canonical-extraction pass (ADR-0031 remedial move) | `docs/specs/done/WP-show-slot-own-value-kind.md`: a dated Current-state erratum, and a canonical-extraction note heading the Mirrored Surface Checklist that gives every cited construct a NON-POSITIONAL locator |
| 2 | Row C3 states a bare count of FOUR and names the wrong owning surface | **FIX** — dated erratum on the cell, deferring to W1(c) | `docs/specs/done/WP-show-slot-own-value-kind.md`, row C3 |
| 3 | `tests/unit/dream-pipeline.test.js`'s `computed` JSDoc is false twice over | **RESIDUAL, NAMED AND REGISTERED** — no Draft WP stub | `docs/specs/done/WP-dream-promote-in-workspace.md`, a new entry in W1(c)'s Mirrored Surface Checklist |
| 4 | (c)(ii)'s "outside this row's SCOPE" reads as contradicting clause (a) | **FIX** — reframed as VACUITY, asserting the same facts | `docs/specs/done/WP-dream-promote-in-workspace.md`, row W1, clause (c)(ii) |
| 5 | The registry still put the executable copy in `dream-pipeline.test.js` | **FIX** — corrected to `dream-pipeline.known-calls.js`, exemption (i) widened with it | `docs/specs/done/WP-dream-promote-in-workspace.md`, Mirrored Surface Checklist registrations (i) and (1) |
| 6 | B3b's action cell instructs a `secretGateAbortMessage` pair-rule violation | **FIX** — dated amendment withdrawing the instruction only | `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, row B3b |
| 7 | A stale round-5 "provided set" line, plus the shipped runner outgrowing row 2b | **FIX + a named residual** — the line corrected; the missing canonical table recorded as the owner's call | `docs/specs/WP-criterion-red-harness.md:446` |

---

## Item 1 — the rotted pinned-set citations

**Reviewer's finding (PR #203).** Nine positional citations into
`tests/unit/dream-pipeline.test.js` — at `:265`, `:276`, `:350`, `:367`,
`:370`, `:393`, `:708`, `:716`, `:724` of
`docs/specs/done/WP-show-slot-own-value-kind.md` — rotted when #203 grew that
test file. The reviewer verified anchor by anchor that only `:30` still lands,
and recommended a canonical-extraction pass on the pinned-set mirror registry.

**Growth, measured rather than copied.** The reviewer said "~89 lines"; the
measured numbers are different and the record carries the measured ones:

```console
$ git show 5d31a7dc:tests/unit/dream-pipeline.test.js | wc -l   # spec's re-measurement base
    1694
$ git show 1375e6ac:tests/unit/dream-pipeline.test.js | wc -l   # after WP-show-slot (set moved OUT)
    1668
$ git show 622d553e:tests/unit/dream-pipeline.test.js | wc -l   # after WP-index-guard-residuals (#203)
    1759
$ git show 4b06afa0:tests/unit/dream-pipeline.test.js | wc -l   # base of this branch
    1759
$ echo $?
0
```

**Anchor verification BEFORE the edit — every anchor, both ends of every range.**

```console
$ sed -n '30p;179p;181p;194p;230p;282p;283p;284p;292p' tests/unit/dream-pipeline.test.js
const { WARNINGS_REL, composeWarnings } = require('../../src/core/dream/warnings');
 * that is NEITHER the user's index NOR inside their working tree. Both clauses
 * which the previous single-clause form silently permitted. Both clauses apply
  const seen = [];
    const args = o.args || [];
  const home = path.join(root, 'home');
  const core = path.join(root, 'core');
  const vault = path.join(root, 'vault');
    const projDir = path.join(claude, 'projects', 'proj');
$ echo $?
0

$ sed -n '133p;201p;208p;213p;277p;1632p;1658p' tests/unit/dream-pipeline.test.js
/** The pinned call set lives in its own module so the WHOLE FILE is the span.
  /**
   * also depends on the invocation's whole environment. So no frame is modelled
  const UNJUDGED = Symbol('UNJUDGED — non-absolute private GIT_INDEX_FILE, refused rather than judged');
}
    // missed it by ARITY, so it certified a rejection the set did not make:
    assert.equal(
$ echo $?
0
```

**Result: the reviewer is right, and precisely so.** Only `:30` resolves to the
construct it names. Every other anchor still resolves to *a* line — which is
exactly what makes positional citation into a live file dangerous rather than
merely broken: it fails silently, and a reader who follows it lands somewhere
plausible.

**Disposition: FIX, by canonical extraction (ADR-0031's remedial move), not by
rewriting the citations.** The spec is Done, so its measurement record is not
rewritten. Two additive, dated surfaces landed instead:

1. A **Current-state erratum** stating that every `dream-pipeline.test.js` line
   number in that section is a `5d31a7dc` anchor, that only `:30` still lands,
   that the anchors are kept as written because the section is the measurement
   record that justified the change, and that the live registry for the pinned
   set is row W1(c)'s Mirrored Surface Checklist — never that section.
2. A **canonical-extraction note** heading the Mirrored Surface Checklist,
   carrying a seven-row table that gives each cited construct its
   NON-POSITIONAL locator on `4b06afa0`, and stating that the live registry is
   W1(c)'s checklist in `docs/specs/done/WP-dream-promote-in-workspace.md`.

**Anchor verification AFTER the edit — every locator the new table asserts.**

```console
$ grep -c "produces: true" tests/unit/dream-pipeline.known-calls.js
4
$ grep -n "args: \['show', 'HEAD:reports/warnings.md'\]" tests/unit/dream-pipeline.known-calls.js
93:  { env: 'unset',   args: ['show', 'HEAD:reports/warnings.md'] },
$ grep -n "^const RUN_VALUE =" tests/unit/dream-pipeline.known-calls.js
82:const RUN_VALUE = Symbol('a value this run computed, observed at the seam');
$ grep -n "// NON-VACUITY OF THE SEAM:" tests/unit/dream-pipeline.test.js
1611:    // NON-VACUITY OF THE SEAM: a run that invoked no git in the vault at all
$ grep -n "// Learn what the run COMPUTED" tests/unit/dream-pipeline.test.js
257:    // Learn what the run COMPUTED — from the four shapes that produce an object
$ grep -n "const produces = KNOWN_CALLS" tests/unit/dream-pipeline.test.js
269:    const produces = KNOWN_CALLS.some((k) => k.produces && shapeMatches(k.args, args, computed));
$ grep -n "KNOWN_CALLS_SOURCE_DIGEST" tests/unit/dream-pipeline.test.js
136:const KNOWN_CALLS_SOURCE_DIGEST =
146:  assert.equal(got, KNOWN_CALLS_SOURCE_DIGEST,
148:      + 'it re-pins KNOWN_CALLS_SOURCE_DIGEST in the SAME commit as the Table W '
$ grep -c "MINTED" tests/unit/dream-pipeline.test.js
0
$ echo $?
1                       # grep -c exits 1 on a zero count; the ZERO is the claim
```

Every locator the new table asserts resolves to the construct it names, and the
MINTED sentence the old `:277-283` entry pointed at is genuinely gone — which is
why that table row says so rather than pointing at a sentence that no longer
exists.

**One misattribution I made and then caught, recorded because the catch was
mechanical rather than attentive.** The first draft of the extraction note
credited the doctrine *"cited by literal, because this family has already paid
for line citations that rotted"* to this spec's own C1 cell. It is not there:

```console
$ grep -c "citations that rotted" docs/specs/done/WP-show-slot-own-value-kind.md
1                       # and that ONE occurrence was my own new sentence
$ grep -c "citations that rotted" docs/specs/done/WP-dream-promote-in-workspace.md
2
```

The doctrine lives in W1(c) of `WP-dream-promote-in-workspace`. The note now
cites it there, and separately cites this spec's own Exact-contracts rationale
(*"When the whole artifact is the span there is nothing to locate"*, verified
present at `:531`) for the design half. **The reviewer's `:558-560` citation for
"that spec's own checklist condemns positional citations" does not resolve** —
`git show HEAD:…| sed -n '552,566p'` puts the module JSDoc and
`const ANY = Symbol(…)` there, not a checklist and not a condemnation. Recorded
rather than quietly worked around: the finding's substance is right and its
citation is not, which is the same class of defect the finding is about.

## Item 2 — row C3's stale count and stale owning surface

**Finding.** Row C3 at `:690` still states *"The count of own-value sources is
FOUR"* in prose and names *"the `produces` markers"* as the owning surface. Both
are superseded by W1(c), which states no count and points at the list.

**Verified against W1(c) before editing:**

```console
$ grep -c "NEITHER THIS ROW NOR ANY PROSE SURFACE STATES THE COUNT OF SOURCES AGAIN" \
    docs/specs/done/WP-dream-promote-in-workspace.md
1
```

W1(c)'s closure clause names the **PRODUCING** markers in the row as the owning
surface, *"with the module's `produces: true` property as their executable
mirror, and no third surface"*. C3 names the executable mirror — the wrong half
of the pair — and states the count the rule it shipped forbids.

**Disposition: FIX by dated erratum appended to the cell**, never by rewriting a
Done spec's change table. The erratum quotes W1(c)'s clause, separates the two
errors as (i) and (ii), and closes: *"Read W1(c) for both facts. Nothing in this
cell decides either one any more."*

## Item 3 — the `computed` JSDoc, and the vehicle choice

**Finding.** `tests/unit/dream-pipeline.test.js:195-199` — the JSDoc on the
`computed` set inside `watchIndexWrites` — ends *"every object name it passes was
computed by an earlier pinned read."* W1(c)'s ORDERING paragraph, rewritten
in PR #203, retires that twice over.

```console
$ sed -n '195,199p' tests/unit/dream-pipeline.test.js
  /**
   * Values THIS RUN produced, learned by watching it produce them. Recorded
   * AFTER each call returns, which is the order the run itself uses: every
   * object name it passes was computed by an earlier pinned read.
   */
$ echo $?
0
```

False in two independent ways: `rev-parse HEAD` **reads** the head back off the
user's own ref rather than computing anything, and `hash-object -w`,
`write-tree` and `commit-tree` are not reads at all. W1(c) now says exactly
this — *"neither COMPUTED nor READ does any classifying here"*.

**Vehicle: a NAMED RESIDUAL registered in W1(c)'s Mirrored Surface Checklist,
not a Draft WP stub.** Four reasons, in the order they decided it:

1. **The finding is LIGHT.** `docs/runbooks/codex-review.md` draws the line at
   what an implementer builds in the product: this is the verification
   machinery's own prose. Its convergence rule is then explicit — *"A finding
   about the machinery itself never justifies more machinery: it is fixed within
   the existing surface, or accepted as a named residual."*
2. **The value question, asked before the patch rather than after the third
   round.** A stub means a spec, a branch, a PR and two review gates for one
   sentence. ADR-0031's aggregate test — *a new rule, a document, a gate earns
   its place by the value it protects, named at the moment of adding* — does not
   clear that.
3. **No pending package's boundary reaches the file.** The one spec carrying
   `tests/unit/dream-pipeline.test.js` in its Deliverables is
   `WP-index-guard-residuals`, which has already shipped (#203) and is awaiting
   its `done/` flip:

   ```console
   $ grep -ln "^| modify | tests/unit/dream-pipeline.test.js" docs/specs/WP-*.md
   docs/specs/WP-index-guard-residuals.md
   $ grep -c "^status: In-Review" docs/specs/WP-index-guard-residuals.md
   1
   ```

   So a stub would sit in `docs/specs/` as an undispatched Draft and would still
   need the registry line, which is the actual missing piece.
4. **Registration is the fix for the actual cause.** This sentence drifted
   because it was never a registered mirror of the ORDERING clause — the exact
   R11-2 failure ADR-0031 names. The new entry registers it, records that it is
   FALSE TODAY, and binds the obligation: the next package whose Deliverables
   include that file corrects the comment in the same pass, and until then no
   surface may read it to decide a slot kind or a membership question.

**House precedent, and the one difference recorded with it.** The same week,
`src/core/dream/warnings.js:63-66` was registered as a known-stale comment
rather than widening a package to chase it. The difference the new entry states
explicitly: that comment is falsified **by design** and stays falsified; this
one is falsified **by drift** and is owed a correction.

## Item 4 — (c)(ii) reframed from exclusion to vacuity

**Finding (Codex plugin P2 from #203, concurred by the reviewer).** W1(c)'s
clause (c)(ii) said *"It is outside this row's SCOPE by construction rather than
by any classification of the call … so (a) never reaches it."* Clause (a) says
the opposite in as many words: *"a write this package's code performs is in
scope whether or not any surface can see it."* `promote()`'s `merge-file` **is**
this package's own act, so (a)'s AUTHORSHIP boundary does range over it. The
call is harmless because it runs outside any repository — a vacuous case, not an
exclusion.

**Disposition: FIX by reframing, asserting exactly what both clauses already
asserted.** (c)(ii) now says the call IS this package's own act, that (a) ranges
over it, and that it satisfies (a) **vacuously** — there is no index of the
user's within its reach. The second half then names what genuinely *is* outside
something: the **seam**, not the scope. The pipeline forwards no `spawnGit` into
`promote()`, so (c)'s enforcement does not observe the call — which is the LIMIT
the COVERAGE clause already states and (a) already cites. The standing
prohibition on "fixing" this by forwarding the seam is untouched.

## Item 5 — the registry's stale executable-copy location

**Finding (#203 discovered issue 2).**
`docs/specs/done/WP-dream-promote-in-workspace.md:673` registered the executable
copy of the pinned set as living in `tests/unit/dream-pipeline.test.js`. It
moved to `tests/unit/dream-pipeline.known-calls.js` on 2026-09-01, and W1(c)
itself has said so since:

```console
$ grep -c "THE EXECUTABLE COPY LIVES IN" docs/specs/done/WP-dream-promote-in-workspace.md
1
$ grep -c "tests/unit/dream-pipeline.known-calls.js" tests/unit/dream-pipeline.test.js
0
$ ls tests/unit/dream-pipeline.known-calls.js
tests/unit/dream-pipeline.known-calls.js
$ echo $?
0
```

**Disposition: FIX, and the fix is two lines, not one.** Registration (1) now
names `known-calls.js` with a dated correction note. **Exemption (i) moved with
it** — it named only `dream-pipeline.test.js`, so a registration deferring to
"exemption (i)" while pointing at the module would have been incoherent the
moment it was corrected. That is the internal-coherence pass doing its job, and
it is the whole of what "beyond what the fix needs" permitted here.

## Item 6 — B3b stops instructing a pair-rule violation

**Finding.** `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1565`, row B3b's
action cell: *"The error message is the only surface that reaches the user on an
abort, so it is the one that must carry the basename."* After
`WP-preservation-abort-widening` (#205) that pairing is a contract violation.

**Verified in the shipped code:**

```console
$ grep -n "secretGateAbortMessage" src/core/dream/validate.js
986:function secretGateAbortMessage(rel, redactedName, identity, which) {
989:      `secretGateAbortMessage: contract violation — ${JSON.stringify(which)} paired with a ` +
1004:    throw new WienerdogError(`secretGateAbortMessage: unknown which ${JSON.stringify(which)}`);
1198:        secretGateAbortMessage(
1330:  secretGateAbortMessage,
$ echo $?
0
```

The guard at `:987-992` throws on any non-null `redactedName`, and its JSDoc
states THE PAIR RULE in terms: *"under every arm this WP makes reachable, a
surviving `redacted/` copy always recovers (Table P row P3), so no reachable
abort ever carries a non-null `redactedName` — a call pairing one with the other
is a contract violation, not a message to render."*

**Why the retirement costs the user nothing.** B3b's sentence existed to close a
real R0b gap — the `redacted/` copy being the only record of the pre-save
version and otherwise unannounced. Table P row P3 closes that gap upstream: a
copy that P0b verifies **always** recovers and never reaches an abort, and one
P0b rejects never existed as a success and its file is gone. So there is no
surviving basename on any reachable abort to leave unannounced.

**Disposition: FIX by dated amendment, scoped to the instruction alone.** Row
Q18 already retired the basename **field** on 2026-09-02; the new clause retires
the **instruction** that was still standing in B3b, states that it restates no
field of Q18 and no member of Table P, and keeps the sentence's true half (the
error still is the only surface that reaches the user on an abort). G5 and Q18
were not touched.

## Item 7 — the stale round-5 "provided set" line

**Finding.** `docs/specs/WP-criterion-red-harness.md:446` reads *"row 2b's
`OVERRIDE_VARS`-derived provided set …"*. Two things are wrong with it.

**(a) It conflates row 2b's two name sets.** Row 2b REDIRECTS the provided set
(working directory, `TMPDIR`/`TMP`/`TEMP`, `HOME`, the four XDG roots) and
REMOVES the `OVERRIDE_VARS` names. The `OVERRIDE_VARS`-derived set is the
removed one. Registration (ii) at `:460`, added at PR #204 round 1, already
states the removal rule correctly — so the spec carried both a correct and an
incorrect statement of the same fact.

**(b) The shipped runner has outgrown row 2b.** PR #204's fourteen rounds
extended the phase environment after the round-5 line was written, and **none of
the extensions reached the spec**:

```console
# run against the PRE-EDIT file, because this branch's own fix adds these names
$ git show HEAD:docs/specs/WP-criterion-red-harness.md > /tmp/criterion-head.md
$ grep -c "PWD\|NODE_OPTIONS\|NODE_PATH\|INIT_CWD\|npm_config_local_prefix\|NODE_TEST_CONTEXT" \
    /tmp/criterion-head.md
0
$ echo $?
1                       # grep -c exits 1 on a zero count; the ZERO is the claim

$ grep -n "^const REDIRECTED_ENV_VARS\|^const NPM_CWD_VARS\|^const XDG_VARS\|^const NODE_TEST_RUNNER_VARS\|^const INHERITED_NODE_VARS" scripts/red-proofs.js
299:const REDIRECTED_ENV_VARS = [
323:const NPM_CWD_VARS = ['INIT_CWD', 'npm_config_local_prefix', 'npm_package_json'];
326:const XDG_VARS = ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME'];
336:const NODE_TEST_RUNNER_VARS = ['NODE_TEST_CONTEXT', 'NODE_TEST_WORKER_ID'];
365:const INHERITED_NODE_VARS = ['NODE_PATH', 'NODE_OPTIONS'];
$ grep -n "env.PWD = copyDir;\|delete env.OLDPWD;" scripts/red-proofs.js
911:  env.PWD = copyDir;
912:  delete env.OLDPWD;
$ echo $?
0
```

**The first command had to be re-run to be true, and that is worth recording.**
Run against the working tree it returns **4**, not 0 — because this branch's own
fix to `:446` introduces those names. The claim being evidenced is about the
tree BEFORE the fix, so the evidence has to come from `git show HEAD:`. A number
from the wrong tree looks like evidence and is not.

**Disposition: FIX the line, and NAME the residual it exposes.** `:446` now
separates the two sets, points at registration (ii) for the removal rule,
enumerates what the shipped runner actually does (`PWD` set / `OLDPWD` deleted;
npm's checkout-naming variables removed and `PATH` stripped; `NODE_PATH` and
`NODE_OPTIONS` removed whole; Node's own test-runner marks stripped), and names
the surface that decides the phase environment today: the runner's five name
constants plus `phaseEnv()`, with the REACH footer as their user-facing mirror
and criterion 8b as the drift check against `paths.js`.

**The residual, stated rather than fixed.** That leaves the phase-environment
contract with **no canonical table**, which is an ADR-0031 gap. Closing it means
re-deciding the substance of a merged contract row, and per
`docs/runbooks/codex-review.md` — *"Diff size does not measure contract impact …
a contract change is the owner's act"* — that is not a wording pass's to take.
Recorded in the cell and here; the owner rules.

---

## Commands run, with exit statuses

Every claim above was RUN, not read. In addition to the per-item transcripts:

```console
$ node <apply script>              # exact-match, refuses on any count != 1
ok   4a  docs/specs/done/WP-dream-promote-in-workspace.md
ok   4b  docs/specs/done/WP-dream-promote-in-workspace.md
ok   5a  docs/specs/done/WP-dream-promote-in-workspace.md
ok   5b  docs/specs/done/WP-dream-promote-in-workspace.md
ok   3a  docs/specs/done/WP-dream-promote-in-workspace.md
ok   1a  docs/specs/done/WP-show-slot-own-value-kind.md
ok   1b  docs/specs/done/WP-show-slot-own-value-kind.md
ok   2a  docs/specs/done/WP-show-slot-own-value-kind.md
ok   6a  docs/specs/done/WP-secret-fence-ep2-redact-arm.md
ok   7a  docs/specs/WP-criterion-red-harness.md
EXIT=0
```

Every replacement asserted **exactly one** match before writing; a zero or a
two would have aborted the whole script. That is the mechanism that makes "I
edited the right sentence" a measurement instead of a belief.

```console
$ grep -rn '\\`' docs/specs/done/WP-show-slot-own-value-kind.md \
    docs/specs/done/WP-dream-promote-in-workspace.md \
    docs/specs/WP-criterion-red-harness.md
$ echo $?
1                       # no shell-escaping artifacts survived into the prose
```

```console
$ npm run lint
--- markdownlint ---
markdownlint-cli2 v0.23.0 (markdownlint v0.41.0)
Finding: docs/**/*.md skills/**/*.md templates/**/*.md tests/**/*.md *.md
Linting: 632 file(s)
Summary: 0 error(s)
--- shellcheck ---
--- PSScriptAnalyzer ---
--- frontmatter check ---
frontmatter check passed: 267 spec(s), 4 agent(s)

lint passed
$ echo $?
0
```

One markdownlint finding was hit and fixed on the way: **MD018** on this very
file, where a sentence wrapped onto a line beginning `#203` and markdownlint read
it as a malformed ATX heading. Reworded to `PR #203`.

## Lessons

- **`W1-followups:` A citation into a live file rots silently, and the rot is
  invisible to reading.** Eight of nine anchors still resolved to *a* line after
  #203 grew the file; only one resolved to the construct it named. Nothing short
  of running `sed -n` on each end of each range distinguishes the two.
- **`W1-followups:` A finding can be right and its own citation wrong.** The
  reviewer's ":558-560 condemns positional citations" does not resolve, and its
  "~89 lines" is 91 by measurement. Re-derive a routed finding's evidence before
  repeating it in an artifact; the substance survived, the citation did not.
- **`W1-followups:` Correcting a registry line usually costs two edits, not
  one.** Fixing registration (1)'s file path made it defer to an exemption that
  still named the old file. A registry entry and the rule it cites are
  themselves a registered pair.
- **`W1-followups:` "Outside the SCOPE" and "satisfies it vacuously" are the
  same fact and different assertions.** The first reads as a carve-out from a
  total that admits none, and a reader who believes it has a licence. Prefer
  vacuity wording wherever a total is genuinely satisfied by having nothing to
  catch.
- **`W1-followups:` When a shipped mechanism outgrows its canonical table, say
  so in the mirror and stop.** Re-deciding the table is a contract change and
  therefore the owner's; a wording pass that "just updates the row" has taken a
  decision it was not given.
