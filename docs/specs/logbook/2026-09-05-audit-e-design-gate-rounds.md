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
example's shape. `npm run lint` passes with the spec in the tree (640 files,
0 errors; 268 specs).

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
| F6 | Spec length 470, over the pre-pinned ~400 ceiling | **fixed in part, residual accepted** — pruned to 462; the surplus is Table C (47 lines, and it *is* the deliverable) and the pipeline-required 40-line Dispatch precondition |
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

## The stop criterion (pinned BEFORE round 1)

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
  finding**. It is already open as F6 at 462 lines, with a recorded residual.
