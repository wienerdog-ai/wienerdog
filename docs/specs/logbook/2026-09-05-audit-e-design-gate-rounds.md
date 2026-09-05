---
date: 2026-09-05
title: "Design-gate rounds: WP-audit-e-ledger-parser-corpus"
related_wps: [WP-audit-e-ledger-parser-corpus, WP-audit-d-code-derived-recipients]
---

# Design-gate rounds — WP-audit-e-ledger-parser-corpus

Round zero is the architect's own internal coherence pass
(`docs/runbooks/codex-review.md`, "Internal coherence pass") plus a mechanical
template-conformance diff. The orchestrator's clean-context executors and the
external double-channel rounds are appended below it.

## Round zero — architect, 2026-09-05, tree at `8c52808f`

`8c52808f` is `origin/main`. The worktree
`/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/audit-e-design`
(branch `docs/wp-audit-e-ledger-parser-corpus`) was created from it and holds
**docs only** — this record and the spec, plus the `node_modules` symlink lint
needs. `git diff --stat 8c52808f HEAD -- src tests scripts` is empty. Every
measurement below is against `8c52808f`.

**No measurement mutated the worktree.** All runs are on `git archive 8c52808f`
scratch copies with a COPIED `node_modules`, under the session scratchpad:
`base/` (pristine), `he/` (one-token differential), `fixed/` (the ruled design).

**Every regex and complexity measurement was run FROM A FILE**, never through a
shell `node -e` with nested quotes — a sibling loop today published a false
result because nested quoting doubled backslashes and built a different regex.
The driver files are `drive-defects.js`, `drive-siblings.js`, `drive-rest.js`,
`drive-gaps.js`, `measure-citations.js` and `apply-ruled-design.py`.

### 0.1 Baselines, actually run

```text
node tests/with-temp-root.js tests/run.js
    tests 2630 / suites 0 / pass 2618 / fail 0 / skipped 12 / duration 53392ms   exit 0
npm run lint
    markdownlint  Linting: 640 file(s) | Summary: 0 error(s)
    shellcheck / PSScriptAnalyzer  clean
    frontmatter check passed: 268 spec(s), 4 agent(s)                            exit 0
npm run red-proofs  (scratch copy, real node_modules — it refuses a symlinked one)
    37 declared proof(s), 37 selected
    every declaration PROVEN;  RUN: PROVEN                                       exit 0
```

### 0.2 BOTH defects DRIVEN, not argued

Both gates were called directly with hand-built values (`makeGates(…).ledger`
and `.skillBody`), so every verdict is an observable of running the shipped
validator. Shipped tree, abridged from `drive-defects-out.txt`:

```text
=== DEFECT 1: trust washing (cur.untrusted = val === 'true') ===
-- keep/revert path: gates.ledger on a candidate ledger --
  derived_from_untrusted: [False]     -> KEPT / AUTHORIZED (no reason)
  derived_from_untrusted: [FALSE]     -> KEPT / AUTHORIZED (no reason)
  derived_from_untrusted: [TRUE]      -> KEPT / AUTHORIZED (no reason)
  derived_from_untrusted: ["false"]   -> KEPT / AUTHORIZED (no reason)
  derived_from_untrusted: [yes]       -> KEPT / AUTHORIZED (no reason)
  derived_from_untrusted: []          -> KEPT / AUTHORIZED (no reason)
  bullet ABSENT entirely              -> "learnings ledger entry a.b: missing/invalid derived_from_untrusted"
-- authorization path: gates.skillBody, Tier-3 skill BODY revision --
  authorizing ledger says [False]     -> KEPT / AUTHORIZED (no reason)
  authorizing ledger says [TRUE]      -> KEPT / AUTHORIZED (no reason)
  authorizing ledger says [1]         -> KEPT / AUTHORIZED (no reason)
  authorizing ledger bullet ABSENT    -> "authorizing learning a.b is untrusted-derived (never promotable)"

=== DEFECT 2: prototype pollution (collector is a plain {}) ===
  ledger with a `## __proto__` heading + a valid entry  -> KEPT / AUTHORIZED (no reason)
  ledger with ONLY a `## __proto__` heading            -> "learnings ledger has no valid entries"
  candidate deleted the `## constructor` entry         -> "learnings ledger changed First-Seen of constructor (immutable)"
  control: candidate deleted a NORMAL entry `c.d`      -> "learnings ledger deleted an existing entry (c.d); ledger is append-only"

=== DEFECT 3: non-adjacent duplicate heading (## a.b, ## c.d, ## a.b) ===
  candidate: a.b(true), c.d, a.b(false) — new ledger    -> KEPT / AUTHORIZED (no reason)
  committed baseline carries it, AUTH path             -> KEPT / AUTHORIZED (no reason)
```

The washed `false` is visible in the first block: `False`, `FALSE`, `TRUE`,
`"false"`, `yes`, `1` and the empty value all read as `false` = trusted, on both
paths, and a ledger that literally says `TRUE` authorizes a Tier-3 skill-body
revision. The prototype set is visible in the second: `## __proto__` beside a
valid entry is **kept**, because the assignment invokes the `__proto__` setter
and `Object.entries` never yields the result — so ADR-0020's "every `##` entry
validates against the schema" is a live false claim. The `constructor` row shows
the coincidence the stub predicted: `cur['constructor']` resolves through
`Object.prototype`, the append-only deletion check is skipped, and the NEXT
comparison refuses by accident with a wrong reason.

**Defect 3 was not in the stub's defect list and is the sharpest of the three:**
a *committed* ledger with a repeated heading authorizes a Tier-3 body revision,
because the authorization read takes the last-wins collapse and never runs the
schema loop.

### 0.3 The ruled design applied to a scratch copy, so no "after" is a prediction

`apply-ruled-design.py` applies exactly what the Deliverables table names, to
`fixed/`. Every REQUIRED cell in the spec's Table C was then produced by running
the same drivers against it. Abridged:

```text
  derived_from_untrusted: [False]  K -> "learnings ledger entry a.b: missing/invalid derived_from_untrusted"
  derived_from_untrusted: [ false ]K -> KEPT              (the bullet's own trim, still exact)
  derived_from_untrusted: [False]  A -> "authorizing learning a.b is untrusted-derived (never promotable)"
  `## __proto__` + a valid entry   K -> "learnings ledger entry __proto__: Pattern-Key heading is not a valid area.symptom slug"
  candidate deleted `constructor`  K -> "learnings ledger deleted an existing entry (constructor); ledger is append-only"
  non-adjacent duplicate, candidate K -> "learnings ledger has a repeated entry heading (a.b); each ## heading must appear once"
  duplicate in the committed base  K -> "learnings ledger's committed version has a repeated entry heading (a.b); …(fail closed)"
  duplicate in the committed base  A -> "skill change needs a qualifying learning but the committed ledger has a repeated entry heading (fail closed)"
  baseline `False`, candidate false K -> "learnings ledger lowered derived_from_untrusted of a.b (raise-only)"
  baseline `False`, candidate true  K -> KEPT             (green control)
  baseline bullet ABSENT, cand false K -> KEPT            (unchanged, owner item 2)
  promotion + `__proto__: injected` A -> "skill change needs a qualifying learning but has no valid revision_pattern_key"
```

**The full suite under the ruled design: `tests 2630 / pass 2615 / fail 3`,
exit 1.** All three failures are the same shape and are Deliverables rows:

```text
✖ dream-validate: parseFrontmatter returns {} without a leading block
✖ a no-separator-space line agrees with the spaced form on both consumers
✖ validator semantics preserved: quoted booleans stay strings, absent block is {}
  AssertionError: + [Object: null prototype] {}  -  {}   operator: deepStrictEqual
```

`npm run red-proofs` on the same copy: `37 declared, 37 selected`, `RUN: PROVEN`,
exit 0 — no shipped declaration's `find` string collides with these edits.

### 0.4 Citations re-measured, ranges checked at BOTH ends

The stub's citations date from 2026-08-05. Re-measured by construct
(`measure-citations.js`):

| Stub | Construct | At `8c52808f` |
|------|-----------|---------------|
| `:415` | `cur.untrusted = val === 'true'` | line 434 |
| `:372` | `learning.untrusted !== false` | line 391 |
| `:432` | `typeof e.untrusted !== 'boolean'` | line 451 |
| `frontmatter.js:115-121` | `readBool` | **holds** — 115 = `function readBool(fields, key) {`, 121 = `}`, 114 = the JSDoc close, 122 = blank |
| `ADR-0020:78` | "every `##` entry validates against the schema" | the sentence spans **78-79**, not 78 |
| — | collector `const entries = {};` | 413 |
| — | `let headEntries = {};` | 546 |
| — | `const data = {};` | 136 |
| — | `PATTERN_KEY_RE` decl / inline literal | 441 / 383 |
| — | the three `Object.entries` loops | 539, 549, 582 |

Two universals the stub asserted, now gated by measurement rather than asserted:

- The two pattern-key regexes are **byte-identical**: the literal
  `/^[a-z0-9][a-z0-9.-]{0,63}$/` occurs exactly **2** times in `validate.js`.
- `constructor` is the **only** name in `Object.getOwnPropertyNames(Object.prototype)`
  that the pattern-key regex admits; `__proto__` does **not** match it.
- `parseLedgerEntries` appears in **one** file in the repository
  (`src/core/dream/validate.js`) — a full `.js` tree sweep.

### 0.5 The sibling sweep, re-measured — the stub's reason was wrong

- **`parseFrontmatter`'s `data = {}` is OBSERVABLE.** A `__proto__` frontmatter
  key is silently dropped from the record (`Object.keys` → `["id","constructor"]`
  for a block declaring `id`, `__proto__`, `constructor`), so the promotion
  allowlist's union-of-keys loop never sees it. Driven: a promotion adding
  `tags: injected` is refused; the same promotion adding `__proto__: injected` is
  **allowed with no qualifying learning**. Ruled IN.
- **`headEntries = {}` is unobservable — but NOT for the stub's stated reason.**
  The stub says "overwritten on the next line"; it is not, and it survives
  whenever `baselineLedgerBytes` is absent. What actually neutralises it is
  `new Set(he ? he.sessionIds : [])` at its single read: a truthy inherited `he`
  yields `new Set(undefined)`, which is the same empty set as the falsy branch.
  Differential (`he/`, that one token changed and nothing else):
  `tests 2630 / pass 2618 / fail 0 / skipped 12`, exit 0, and every driver line
  byte-identical to the shipped run. Ruled **IN anyway** as a one-token
  uniformity change with zero measured risk — parked as owner item 5 because a
  reviewer may reasonably call it unearned.

### 0.6 Every runnable criterion and verification step, RUN

Verification steps, on the pinned base — all three are **shipped commands; this
work package introduces no new gate, script or grep**, so there is no new
verification step to observe in three states, and the absent/compliant/violating
requirement is vacuous here rather than skipped.

```text
V1 node tests/with-temp-root.js tests/run.js   exit 0   (§0.1)
V2 npm run lint                                exit 0   (§0.1)
V3 npm run red-proofs                          exit 0   (§0.1)
```

| Criterion | Runnable? | Result at round zero |
|-----------|-----------|----------------------|
| 1 — every Table C row's REQUIRED verdict | yes | all 30 rows run on `base/` AND `fixed/`; §0.2, §0.3 |
| 2 — `{entries, duplicateKeys}` + three refusals | yes | the three reasons observed on `fixed/`; §0.3 |
| 3 — `boolFromRaw` exported, `readBool` tests green | yes | `fixed/` suite: 3 failures, none in `frontmatter.test.js` |
| 4 — three null-prototype records, no by-name check, no `Object.hasOwn` | yes | `fixed/` carries none of either |
| 5 — the pattern-key literal occurs once | yes | **2** on `base/`, **1** on `fixed/` — discriminates |
| 6 — ADR amendment verbatim, nothing above changed | partly | the target sentence and insertion point measured (§0.4, §0.7) |
| 7 — six declarations, red-proofs all PROVEN, 37 → 43 | partly | `fixed/` re-runs 37/37 PROVEN; 43 is 37 + Table D's six |
| 8 — idempotence | n/a | `N/A` in the spec — no command, no write outside the repo |

### 0.7 Template conformance — mechanical

Top-level-heading diff of the spec against `docs/specs/_TEMPLATE.md`: every template
section present, none silently absent; one addition, `## Dispatch precondition`,
which the pipeline requires. `### Contract table(s)` is realised as the four
named canonical tables, which is the template's own instruction and the worked
example's shape. `npm run lint` passes with the spec in the tree — exit 0,
`0 error(s)`. The FILE COUNT is deliberately not pinned here (executor finding
X2): it grows with every markdown file added, this record included.

ADR-0020's structure was measured before the amendment text was written: it has
**no** `## Amendments` section but does carry
`## Revision (2026-07-12): adversarial-review hardening` at line 206 and
`## Future work (parked, not specced)` at line 381. The spec therefore specifies
insertion between those two, in the file's own house style, rather than
inventing a section.

**The ADR amendment is NOT applied on this branch.** It ships in the
implementation PR, because an ADR asserting that `__proto__` headings validate
would be false until the code makes it so.

### 0.8 Findings this pass raised against its own draft, and their dispositions

| # | Finding | Disposition |
|---|---------|-------------|
| F1 | The stub's reason for excluding `headEntries = {}` ("overwritten on the next line") is false | **fix** — corrected reason recorded (§0.5); the change ruled IN with a differential, parked as owner item 5 |
| F2 | Three stub line citations had drifted (`:415`, `:372`, `:432`) | **fix** — the spec cites constructs and quotes lines, never numbers |
| F3 | `ADR-0020:78` is a two-line sentence (78-79) | **fix** — the spec quotes the sentence |
| F4 | The first C28 draft claimed the two pattern-key sites "agree"; measured, they disagree on `__proto__` today, and an empty key cannot reach the heading check at all | **fix** — row restated over a heading-shaped 19-key sample with measured counts (1 disagreement today, 0 under the design) |
| F5 | The draft added a distinct authorization-path INVALID message and a 7th RED proof | **fix by removal** — one rule (INVALID ≡ `true` at every consumer, `frontmatter.js`'s own shipped stance) beats a special case; recorded in Table B as a dropped alternative so a re-proposal routes as a scope objection |
| F6 | Spec length 470, over the pre-pinned ~400 ceiling | **fixed in part, residual accepted** — pruned to 458, then back to **488** as F9/F10 corrected Table D and the executor fix pass rewrote the dispatch basis; the surplus is Table C (47 lines, and it *is* the deliverable), Table D's measured reddening sets, and the pipeline-required 40-line Dispatch precondition |
| F7 | The stub declared `size: S`; the deliverable is six files across two source modules, two test files, a proofs JSON and an ADR | **fix** — `size: M`, parked as owner item 4 with the reason a split is the archive's failure mode |
| F8 | A third live defect exists that the stub does not list: a duplicate heading in the *committed* ledger authorizes a Tier-3 revision | **fix** — driven (§0.2), Table C row C18, and the duplicate rule now covers all three reads (owner item 1) |
| F9 | Table D's first draft PREDICTED each mutation's reddening set instead of measuring it, and two predictions were wrong | **fix** — both mutations applied to scratch copies and run (§0.11). LPC-A also reaches C21; LPC-B also reaches C26. Table D now carries the measured sets, plus the identity-separation note LPC-A/LPC-F force |
| F10 | Nothing in the draft required a corpus row to assert its EXACT refusal string | **fix** — measured: under LPC-B, rows C24/C25/C27 still *refuse*, with a different reason, so a row asserting only "refused" stays green and red-proofs rejects the declaration. Table D now states the rule |

### 0.9 Design decisions taken at round zero, with their reasons

1. **The shared helper is `boolFromRaw(raw)` in `src/core/frontmatter.js`**, and
   `readBool(fields, key)` becomes a one-line wrapper over it. Value-level
   because the ledger handles bullet lines, not a Map; in `frontmatter.js`
   because ADR-0022 makes that the one place a scalar acquires meaning.
2. **INVALID is surfaced by storing the sentinel**, and needs no new code at two
   of its three consumers: `typeof INVALID !== 'boolean'` already refuses on the
   keep/revert path, `INVALID !== false` already refuses on the authorization
   path. Only the raise-only comparison needs a clause.
3. **The authorization path's INVALID refusal keeps the shipped message**
   (`authorizing learning <key> is untrusted-derived (never promotable)`) — see
   F5.
4. **No `Object.hasOwn` guards.** `Object.create(null)` removes the chain those
   lookups traverse; a guard would be redundant machinery.
5. **The pattern-key regex is unified, not pinned.** The two occurrences are
   byte-identical today, so unification changes no verdict; row C28 is what stops
   them diverging later, and it is behavioural.
6. **Duplicate headings REJECT, never warn.** The gates' whole vocabulary is one
   refusal string, so a warn channel would be new machinery — and a silent
   last-wins overwrite destroys the data the append-only and raise-only
   comparisons depend on.
7. **Behavioural gates only.** No grep sentinel, no new script. The archive
   predecessor's twelve rounds ended when its gates stopped checking source
   shape; this package starts there.

### 0.10 Table D's reddening sets, MEASURED not predicted

Two of Table D's six mutations were applied on top of the ruled design and run,
because their reach was not obvious from reading. Both predictions were wrong in
the same direction — too narrow.

```text
LPC-A (trust predicate reverted) — the raise-only block:
  baseline INVALID (False), candidate false  -> KEPT   (under the ruled design: raise-only refusal)
  control: baseline true, candidate false    -> raise-only refusal (unchanged)
  => LPC-A reaches C21 as well as C6-C14: with no INVALID, the clause has nothing to fire on.

LPC-B (ledger collector reverted to {}) — the heading block:
  `## constructor`, first and ONLY occurrence -> "learnings ledger has a repeated entry heading (constructor); …"
  `## __proto__` + a valid entry              -> "learnings ledger has a repeated entry heading (__proto__); …"
  candidate deleted `constructor`             -> "…committed version has a repeated entry heading (constructor)…"
  => LPC-B reaches C26 as well as C24/C25/C27, because `entries['constructor']`
     and `entries['__proto__']` are already non-undefined on a plain object, so
     the new duplicate check misfires on a first-and-only heading.
```

The second run also produced **F10**: under LPC-B the `__proto__` rows still
*refuse*, with a different reason. A corpus row asserting only "refused" would
stay green and `evaluateRed` would then reject LPC-B as non-discriminating — so
every row must assert its exact string. And because LPC-A and LPC-F both reach
C21, the trust-value rows and the raise-only rows must live under separate test
identities, or LPC-F is indistinguishable from LPC-A.

### 0.11 What round zero did NOT establish

- That Table D's six declarations are COMPLETE, or that their `expectRed` sets
  are what the spec assumes. They are measured after implementation, by rule.
- That the three repaired assertions are the only test-side cost on a tree that
  has moved past `8c52808f`. Re-run at dispatch.
- Anything about the archive predecessor's branch beyond its spec and its
  round-1 log, both read read-only at `b07d4bc`. Nothing was built on it.

## Round zero — orchestrator executors, 2026-09-05, on `269903d7`

Two clean-context executors that took no part in drafting: a
template-conformance read (spec + template only) and a coherence pass that
**ran** rather than read.

**Template conformance: CONFORMS**, with one non-blocking omission — the
template's boilerplate line under the H1 (*"Authoring rules live in
`docs/runbooks/spec-authoring.md` …"*) was absent. Restored in the fix pass
below. Every top-level section is present or explicitly `N/A`;
`## Dispatch precondition` is the one pipeline-required addition. (A fence-blind
`grep -o '^## '` also reports a `## Amendment` heading; it is inside the
```markdown fence holding the verbatim ADR-0020 amendment text, not a section of
the spec. The executor's read, which is not fence-blind, did not report it.)

**Coherence: behaviourally clean.** The executor reproduced **~25 of Table C's
30 "Today" verdicts** against the shipped `makeGates` with exact refusal strings,
verified every citation at both ends, and found every runnable criterion
correctly **RED before the work** — so no criterion in this spec is vacuous.

**V3 is not runnable in this worktree.** `npm run red-proofs` refuses a symlinked
`node_modules`, which is what a docs worktree has; the executor skipped it by
instruction. Round zero's own V3 number (§0.1) came from a `git archive` scratch
copy with a COPIED `node_modules`, and **the implementer's dispatch will carry a
real checkout**. Recorded so a reader can tell a skip-by-construction from a
skipped gate.

### Executor findings and dispositions — both LIGHT

| # | Finding | Disposition |
|---|---------|-------------|
| X1 | The Dispatch precondition cited `2026-09-05-owner-rulings-durability-queue.md` as what lets the session dispatch under these recommendations. That record rules eight items of a **different** work package and never names this one | **fix** — the basis is the PROCESS ruling, not a queue's item list: the owner's standing instruction of 2026-09-05, quoted verbatim in `2026-09-05-owner-rulings-banner-queue.md` (its §3 generalises it) and restated in `docs/HANDOVER.md` status pass #3. The sentence now cites that, and adds the obligation that this package's **own** rulings record (`2026-09-05-owner-rulings-audit-e-queue.md`) is written at the `Ready` flip, before dispatch, naming these five items — so no implementer is dispatched without a record naming this WP. That record is deliberately **not** written yet: the loop is open and the item list may still move |
| X2 | Current state pinned `Linting: 640 file(s)`, already stale at 641 on this branch — the rounds logbook is itself a markdown file | **fix** — stop predicting the count. The baseline now states exit 0 and `0 error(s)`, and says the file count is not pinned because it grows with every markdown file added, this spec and its rounds record included |

Neither finding touches `src/` behaviour, the ADR contract, or anything a user or
a consuming model observes, so both are LIGHT under "Weighted closure": the fixes
land and are verified mechanically, and the loop proceeds to round 1 without a
fresh external round for them.

## Round 1 — external double channel, 2026-09-05, on `87b51216`

Raws committed BEFORE adjudication, each with the SHA of the commit that
introduced it:

| Channel | Raw | Introduced by |
|---------|-----|---------------|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-e-gate-raw-round1-codex-plugin.txt` | `0dea0727` |
| Hermetic shadow | `docs/specs/logbook/2026-09-05-audit-e-gate-raw-round1-herdr-shadow.txt` | `eb3ebf1d` |

Both channels: needs-attention. **Zero scope objections counted** — three were
routed, all of them already-recorded residuals or alternatives Table A/B/D had
rejected with reasons. **Every finding is a corpus ROW or a proof-set defect, not
gate machinery: the archive's lesson held.** Two are HEAVY (they move the
contract's accepted/refused set), so round 2 is a full external round.

### Findings, dispositions, and what changed

| # | Channel | Band | Disposition — and what changed |
|---|---------|------|-------------------------------|
| **R1-A** | plugin A | **HEAVY** | **fix.** A bullet that NAMES the field could read as ABSENT: the parser splits on LF, but the bullet regex anchors `(.*)$`, and `.` matches neither CR nor U+2028/U+2029 — so the line is skipped, `untrusted` stays `null`, and A4 exempts `null`. New Table A row **A7** (match the key prefix; the raw value is the remainder of the LF-delimited line), Table B's INVALID reach widened, rows **C36–C39** added |
| **R1-B** | shadow A | **HEAVY** | **fix.** The spec permitted a raw-line duplicate detector, which passes C17 yet keeps `## a.b`, `## c.d`, `## a.b␠␠␠`. Table A row **A3** now states the observable — detection is on the NORMALISED heading key — and rows **C40–C42** pin it on all three reads. The detector's shape stays the implementer's. **Superseded by R2-A:** four hand-picked witnesses were not enough, and C40 became a generated matrix while C41/C42 were repurposed |
| **R1-C** | plugin B + shadow B | LIGHT | **fix.** Table D's `LPC-B` omitted C28 and included C26, which is algorithm-dependent. Set restated to **C24, C25, C27, C28**; C26 excluded with its reason; a second governing rule added to Table D (a declared set may contain only rows stable across conforming implementations); C28 now requires exact per-key verdicts rather than an agreement count |
| **R1-D** | shadow A | LIGHT | **fix.** The permitted "compare keys" repair would let `{k:'wrong'}` pass at `frontmatter-unify.test.js:61`. Implementation notes now state three OBSERVABLES instead of a technique, Current state carries the measured six-calls/five-failures/three-identities split, and criterion **3b** asserts them |
| **R1-E** | plugin | LIGHT | **fix.** Table C now opens with a **class rule** that closes it against the contract — after the trim, the value is `true`, `false`, or INVALID, with no case folding, quote stripping, comment stripping, YAML coercion, Unicode normalisation or homoglyph folding — and the rows are witnesses of its classes. Missing classes added as rows **C31–C35** (YAML-ish word, YAML null, YAML tag, homoglyph, interior invisible) and **C43** (`## prototype`); C5 and C11 widened to name their whole class |

Two findings this pass raised against **itself**, both fixed:

| # | Finding | Disposition |
|---|---------|-------------|
| **S1** | C19's fixture did not ISOLATE the property: its clean candidate also dropped `c.d`, so the shipped tree refused with `deleted an existing entry (c.d)` and the row proved nothing about the baseline duplicate | **fix** — the candidate now carries both entries. Re-measured, the shipped tree **KEEPS** it, which is a truer and sharper "Today": a committed ledger whose shadowed first section is invisible passes the append-only comparison unnoticed |
| **S3** | Dispatch-precondition item 3 restated R1-D's fact ("three shipped assertions … comparing keys") and went stale the moment R1-D landed | **fix** — item 3 now cites Current state's measurement and Implementation notes' observables. The reason it went stale is the finding: the Dispatch precondition was an **unregistered mirror**. The Mirrored Surface Checklist now carries the three `parseFrontmatter` observables as their own entry, naming that item explicitly (ADR-0031 register-new-mirrors, applied in the same pass) |
| **S2** | Two round-1 drivers written through a shell heredoc silently LOST their U+2028 literals and measured a plain space instead, producing a verdict that contradicted the other driver | **fix** — exotic characters are now written as JS escapes (`\u2028`), which survive any transport, and every driver self-checks its codepoints at startup. This is the same defect class the round-zero brief warned about, arriving through a different door: the file was fine, the transport was not. The four affected rows were re-measured; the corrected results are what Table C carries |

### Measurements this round

```text
R1-A  shipped + round-ZERO design, baseline U+2028 / U+2029 / CR, candidate false
        -> KEEP on both  (the hole; the round-zero design did not close it)
      under A7           -> "learnings ledger lowered derived_from_untrusted of a.b (raise-only)" for all three
      candidate side     -> already refuses on both trees (regression pin, not a proof)
      committed side (A) -> already refuses on both trees (regression pin, not a proof)
      A7's widening, measured and bounded: the ONLY lines the anchored form
      rejects and the prefix form accepts are those whose value contains CR,
      U+2028 or U+2029. One visible consequence: an otherwise-valid CRLF ledger
      goes from "Pattern-Key bullet does not match the heading" to KEEP (C39).
      Full suite under A7: 2630 / 2615 / fail 3 — the same three Deliverables
      repairs as round zero, and every round-zero corpus row byte-identical.

R1-B  heading normalisation, measured: trailing ASCII space, TAB, NBSP (U+00A0)
      and BOM (U+FEFF) all map "## a.b<suffix>" to the key "a.b".
      The round-zero design already refuses all of them on all three reads —
      the defect was the SPEC permitting a detector that would not.

R1-C  LPC-B across two conforming detectors:
        row   lookup-based      Set-based        stable?
        C24   RED (wrong str)   RED (wrong str)  yes
        C25   RED               RED              yes
        C26   RED               GREEN            NO -> excluded
        C27   RED               RED              yes
        C28   RED (2 disagr.)   RED (1 disagr.)  yes
      LPC-D -> C17, C40.   LPC-E -> C18, C19, C41, C42.   LPC-G -> C37, C39.

R1-D  six deepEqual calls on parseFrontmatter, five fail under the design;
      the sixth (frontmatter-unify.test.js:62) survives because both sides are
      null-prototype. A keys-only repair at :61 accepts {k:'wrong'} — measured.

R1-E  every class in the plugin's list has a row; the classes with none were
      YAML-ish word, YAML null, YAML tag, homoglyph, interior invisible, and
      `prototype`. NBSP/BOM padding is NOT a new class: it normalises to the
      exact literal under the trim, so it joins C5.
      Heading universal re-measured: `constructor` remains the ONLY name in
      Object.getOwnPropertyNames(Object.prototype) the pattern-key regex admits.
```

`npm run lint` passes with both documents in the tree, exit 0, `0 error(s)`.

### Size ceiling, re-measured (F6 stays open)

Spec **488 → 575 lines**, against the pre-pinned ~400. **The entire growth is
contract and corpus** — thirteen new rows, the class rule that closes Table C,
Table D's two governing rules and its seventh proof, and the A7 contract. **No
gate, script or grep was added this round**, which is the half of the ceiling
rule that actually guards against the archive's failure mode. F6's residual is
therefore re-accepted rather than re-opened: Table C alone is now ~60 lines and
it *is* the deliverable.

## Round 2 — external double channel, 2026-09-05, on `a1b69cc1` — THE LOOP CLOSES

Raws committed BEFORE adjudication, each with the SHA of the commit that
introduced it:

| Channel | Raw | Introduced by |
|---------|-----|---------------|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-e-gate-raw-round2-codex-plugin.txt` | `803e43a3` |
| Hermetic shadow | `docs/specs/logbook/2026-09-05-audit-e-gate-raw-round2-herdr-shadow.txt` | `a9a586c2` |

### The closure decision

Both channels returned needs-attention, and **neither established a
product-verdict defect.** The plugin reproduced C31–C43's Today and REQUIRED
verdicts, swept every Unicode code point in three value positions and confirmed
A7's widening is exactly CR/U+2028/U+2029 with nothing newly refused, ran three
conforming duplicate detectors, checked the three `parseFrontmatter` observables
against the six original assertions, and judged C39 a consequence of A7's stated
LF-remainder-plus-trim contract rather than an owner item. The shadow's finding is
a corpus-**witness** gap that a wrong detector slips through — not a wrong verdict.

**Under "Weighted closure" the loop is DONE at round 2:** the round found nothing
about the product. The remaining findings are machinery, they are fixed inside the
existing surface, and an orchestrator executor verifies them mechanically before
the `Ready` flip rather than a third external round extending the loop.

### The circuit breaker fired TWICE, and both were answered by EXTRACTION

Per ADR-0031, two consecutive rounds landing on the same contract family stop
being patched and become an extraction. Both remaining findings qualified:

| Family | R1 | R2 | Extraction |
|--------|----|----|-----------|
| duplicate-heading normalisation | R1-B | R2-A | The contract is **"detection on the key the parser CAPTURED"** (A3 already said so); its witnesses become a **generated matrix** quantifying over ECMAScript `\s` itself, so the corpus can no longer be satisfied by hand-picked members |
| RED-proof sets | R1-C | R2-B | Table D gains a **proof-SELECTION contract**: TOTAL REACH (measured, may vary) is recorded separately from SELECTED WITNESSES (declared, stable), and the selection is carried by the shipped `testNamePattern` facility rather than by hoping an undeclared row stays quiet |

### Findings, bands, dispositions

| # | Channel | Band | Disposition — and what changed |
|---|---------|------|-------------------------------|
| **R2-A** | shadow A | LIGHT (machinery) | **fix, as EXTRACTION.** Round 1's four hand-picked suffixes covered **4 of 24** code points the capture strips; an adversarial detector stripping exactly those four passed every witness and authorized for the other twenty (executed). Row **C40** is redefined as a generated matrix — every non-LF code point matched by `\s`, on all three reads, asserted under three identities so LPC-D and LPC-E stay distinguishable. **C41** and **C42** are repurposed to the two cases that genuinely remain: interior (not trailing) whitespace, and a non-whitespace Unicode heading. No source-shape constraint on the detector |
| **R2-B** | plugin A | LIGHT (machinery) | **fix, as EXTRACTION.** Excluding an algorithm-dependent row from `expectRed` does not stop the runner seeing it fail — `evaluateRed` rejects "failed in its OWN BODY but is not declared". `scripts/red-proofs.js` was read before the rule was written: `testNamePattern` is passed to BASELINE, RED **and** CONTROL, so an unselected identity never runs in any phase. Table D now carries both columns and the selection contract, plus the two constraints it imposes (every declared identity must be selected by its own pattern; every corpus row needs an individually selectable identity) |
| **R2-C** | shadow B | LIGHT | **fix.** Table D listed C39 among the green controls "nothing reddens" thirteen lines after declaring LPC-G reddens it. C39 is now stated as green on the compliant design and intentionally red under LPC-G, and the green-control list is registered as a mirror of acceptance criterion 1 |
| **R2-D** | plugin | LIGHT, non-blocking | **fix, at zero row cost.** Unicode-bearing hostile headings had no witness though the regex decides them; they became row **C42**, which the R2-A extraction had freed |

### Measurements this round

```text
R2-A  `\s` minus LF enumerates 24 code points, measured:
        U+0009 U+000B U+000C U+000D U+0020 U+00A0 U+1680 U+2000-U+200A
        U+2028 U+2029 U+202F U+205F U+3000 U+FEFF
      Round 1 rowed 4 of those 24.
      C40's matrix under the ruled design: all 24 x all three reads give the
      exact refusal for that read. Zero exceptions.
      C41 `## a<U+00A0>b` (interior) -> key "a b" -> Pattern-Key refusal, not a duplicate.
      C42 `## <fullwidth a.b>` and `## a<U+200B>b` -> Pattern-Key refusal (U+200B is not \s).

R2-B  TOTAL REACH, measured per mutation:
        LPC-A -> C6-C14, C31-C35, C21, C36, C37, C38      (selected: C6-C14, C31-C35)
        LPC-F -> C21, C37                                  (selected: C21)
        LPC-B -> C24, C25, C27, C28  under all three detectors
                 + C26 under the lookup detector ONLY      (selected: C24, C25, C27, C28)
        LPC-G -> C37, C39                                  (selected: both)
      The three conforming detectors (lookup / Set / array indexOf) agree on
      every corpus row when the collector is null-prototype — run, not assumed.
```

`npm run lint` passes with every document in the tree, exit 0, `0 error(s)`.

### Size ceiling, re-measured (F6, final)

Spec **575 → 594 lines**. The growth is one extraction that made a row stronger
without adding rows (C40 replaced four hand-picked members with a generated
matrix over 24), one extraction that added a contract Table D was missing, and
two repurposed rows. **Corpus row count is unchanged at 43** and **no gate,
script or grep was added in any round.** F6 closes as a **named residual**: the
spec is 594 lines against a ~400 ceiling, the surplus is Table C (43 rows) and
Table D's selection contract, and both are the deliverable rather than machinery
around it.

## The stop criterion (pinned BEFORE round 1; RESTATED after round 1's HEAVY fixes)

**Restatement, 2026-09-05 after round 1.** The criterion below is unchanged in
substance and is re-stated because round 1 landed two HEAVY fixes, which under
"Weighted closure" trigger a full fresh external round rather than a mechanical
verification. Round 2 is that round. Two things it inherits: R1-A and R1-B both
moved the accepted/refused set, so round 2 must verify each round-1 fix is closed
**by execution** rather than by re-reading; and both HEAVY findings were corpus
rows, not machinery, so the size ceiling continues to fire as a finding on line
count while explicitly not firing on this round's growth.

- **Closes** on a round with no product finding on either channel. Machinery
  findings at that point are fixed inside the existing surface or accepted as
  named residuals; they do not extend the loop.
- **Escalation (i):** two consecutive rounds landing a finding on the same
  contract family → an ADR-0031 contract-**extraction** pass (pull the contract
  into one canonical table, register its mirrors), never a third textual patch.
- **Escalation (ii):** a finding whose only honest fix changes an owner-ruled
  value or reopens an alternative this record already rejected → **parked** with
  a recommendation and an overrule cost, not folded in.
- **Size ceiling (learned from the archive):** if the spec passes ~400 lines, or
  a round adds gate machinery rather than a corpus row, **that is itself a
  finding**. It is open as F6, closed at 594 lines as a named residual after round 2 — the surplus is
  Table C's 43 rows and Table D's selection contract, and no round added a gate.
