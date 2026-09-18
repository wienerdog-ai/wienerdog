---
date: 2026-09-18
title: "WP-ep2-retention-prune-timing-test is architecturally stale at 622ca04b — assessment and successor routing"
related_wps: [WP-ep2-retention-prune-timing-test, WP-ep2-n2-rehome, WP-ep2-prune-once-per-run-test, WP-secret-fence-ep2-redact-arm, WP-dream-promote-in-workspace, WP-dream-gate-inputs-baseline-delta]
---

# The N2 prune-timing package was pinned to an architecture that no longer exists

`docs/specs/WP-ep2-retention-prune-timing-test.md` was last worked in July 2026,
after roughly nineteen review rounds under the old review regime, and was pinned
to `main` at the merge of PR #124 (2026-07-28). This entry records a re-derivation
of the whole package against `main` at **`622ca04b`** and the verdict it produced.

**Verdict: the package is neither done nor dispatchable.** The gap it exists to
close is still genuinely open — nothing in `tests/` constrains the retention
prune's timing or cardinality. But the *locus* of that gap moved out from under
the spec, and three of the spec's load-bearing mechanisms moved with it. The
package cannot be matured to `Ready` by refreshing cites; it is parked
`SUPERSEDED-PENDING` and routed to two successor drafts.

**No rule of the retention contract changed.** Table N rows N1–N7 in
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md` (`:1759-1765`) are stable,
and `pruneRedactedOriginals`'s body is unchanged in substance. What changed is
where the trigger lives and what can observe it.

## Method

Every claim below was produced by running, not by reading. The spec's own
verification step 0 was executed as written against a worktree cut from
`622ca04b`; every Current-state cite was re-derived construct by construct
(locating the construct, not adding a delta to the old line number); and the
grep sweep for an already-existing test was run over the whole of `tests/`.
The main checkout was never written to.

## The spec's own dispatch gate BLOCKS at `622ca04b`

Step 0 is the spec's declared dispatch blocker: *"ANY FAILURE HERE BLOCKS
DISPATCH. Do not start, do not work around it, report it and stop."* Three of
its checks fail.

| step | what it asserts | result at `622ca04b` |
|---|---|---|
| 0b | `^### AC-15 coverage census` is on main | **PASS** — 1 match (`:4381`); PR #124 is on main |
| 0c | the census limb cell for M-48 is `gap` | **PASS** — cell reads `gap` (`:4504`); the work is not already done |
| 0d assertion 1 | the guarded call immediately follows its `Retention, once per run` comment | **BLOCKED** — 0 adjacent occurrences, want exactly 1 |
| 0d assertion 2 | `pruneRedactedOriginals(stateDir, redactedCreated)` occurs exactly once | PASS — 1 |
| 0d assertion 3 | the call's line is after the `scanTokens` loop's matching close | **BLOCKED** — loop header index `-1`; `scanTokens` occurs **zero** times in `src/`, `tests/` and the ep2 spec |
| 0e | the five exact EP2 retention titles, the count of 5, the six helpers | PASS — all present and unmoved |
| 0f | the probe's two mutation anchors exist | **BLOCKED** — `PROBE-ANCHOR-MISS`; both anchor strings occur 0 times |

The spec's literal `CALL` constant —
`if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);` —
does not occur anywhere in `src/core/dream/validate.js`.

## Old → new, construct by construct

`src/core/dream/validate.js` unless stated otherwise.

| the spec's July claim | at `622ca04b` |
|---|---|
| the guarded call, post-loop, `:1333` | `if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);` at **`:1557`**, inside the returned `pruneRedacted: () => {…}` closure |
| the counter `secretRedactions` | **`completedRedactions`** — declared `:1322`, incremented `:1418` |
| `secretRedactions += 1; // increments LAST, only after the scrub is staged` | `completedRedactions += 1; // increments LAST, only after a verified scrub` (`:1418`) |
| `// Retention, once per run and only after a completed redaction.` immediately above the call | a six-line JSDoc block `:1550-1555` reading `Retention, once per run and only after a COMPLETED redaction`, then `pruneRedacted: () => {` at `:1556` — **not adjacent to the call** |
| `for (let i = 0; i < scanTokens.length; i++) {`, loop `:1200-1331` | **removed.** `scanTokens` does not exist; the loop was deleted by `WP-dream-promote-in-workspace` (commit `4115668a`, *"extract the four gates into their Table D input shape"*) |
| `const redactedCreated = new Set();` declared before the loop | `:1320`, now declared in `makeGates()`'s closure scope |
| `if (redactCopy) redactedCreated.add(redactCopy.name);` inside the loop | `:1415`, inside the `secret` gate's body |
| `pruneRedactedOriginals(stateDir, created)` helper | `:1174`; body unchanged in substance (cap return, date-prefix + exclusion filter, `(mtimeMs, name)` sort, best-effort catch) |
| *(did not exist)* | **the production call site is now `src/cli/dream.js:1102` — one `gates.pruneRedacted();` after `promote()` returns.** `makeGates` is imported there by destructuring at `:33-38` and invoked at `:1060` |
| the gate's three `git diff --cached` calls per changed path | **removed** by `WP-dream-gate-inputs-baseline-delta` (that spec's Table row at `:240` records the swap to `addedLineNumbers` over workspace after-bytes). `grep -rn -- '--cached' src/core/dream/` now finds two comment strings and no spawn |

## Does the test already exist — no

`grep -rn 'pruneRedacted' tests/` returns exactly one hit —
`tests/unit/dream-validate.test.js:242` — and that hit is **inside the test
harness**, not inside a test. `RUN` (`:1552`) delegates to `gateFixture`
(`:91`), and `gateFixture` calls `gates.pruneRedacted()` itself at `:242`.

`tests/unit/dream-validate.test.js` holds exactly five `EP2 retention:` tests,
with titles byte-identical to the spec's recorded baseline. None constrains
timing or cardinality. Nothing else in `tests/` — including
`tests/unit/dream-pipeline.test.js`, whose only `prune` match is an unrelated
`'pruned size evidence is written even on idle'` at `:2280` — asserts anything
about the prune's invocation. **The gap is real and open.**

## The three independent breaks

Each of these alone would stop the package. They are independent: closing one
does not close any other.

### 1. The permitted Deliverables boundary can no longer host a non-vacuous test

The spec permits exactly one test file, `tests/unit/dream-validate.test.js`, and
that file's own `gateFixture()` invokes `gates.pruneRedacted()` at `:242`. A test
added there asserting *"the prune's directory read happens exactly once"* would
be asserting a property of **the fixture**, because the fixture is the caller. The
production once-per-run property now belongs to `src/cli/dream.js:1102` and is
only observable from a suite that drives the real pipeline.

The spec forbids editing `src/` and does not list any pipeline suite. So the only
test it permits is one that cannot fail for the reason the spec says it fails —
precisely the vacuous-assertion class ADR-0042 was signed to catch.

### 2. The observational seam is dead

The spec's witness is an ordered event log over per-path git invocations: a
trailing changed path producing no redaction, anchored on its
`git diff --cached -U0 -- <rel>` as the last git event of the final iteration
(assertions a1/a2/a3, and acceptance criterion AC-3b's ordering half). The gate
no longer spawns git per path at all — it receives `addedLineNumbers` from a
workspace delta. There is no per-path event stream to order against, and there is
no loop whose end the prune could be observed to follow.

### 3. The structural half has no anchor

Assertion (b3) — *"the call's line is AFTER the `scanTokens` loop's matching
closing brace"*, with its two-method brace derivation and its REFUSE-on-disagree
cross-check — names a construct that does not exist. AC-3c, the
late-in-final-iteration mutation that (b3) is the sole detector for, has no
referent either: there is no final iteration in the gate.

## Template and ADR conformance gaps (recorded, not closed)

Judged against `docs/specs/_TEMPLATE.md`, ADR-0031 and ADR-0042 as they stand today:

- No **Mirrored Surface Checklist**. `## Contract reference` is present and marked
  `N/A` with a 2-of-7 argument, which is defensible for the original scope, but the
  subsection is not dispositioned.
- No **Security checklist** section.
- **ADR-0042 is unmet throughout.** AC-3, AC-3b, AC-3c and AC-4 are hand-applied
  mutations with pasted output. Under ADR-0042 each must be a declaration in
  `tests/red-proofs/<slug>.proofs.json` carrying `find`/`replace`/`marker`/
  `occurrences`, a `testNamePattern`, and an `expectRed` entry naming the exact
  test titles plus a `signal` substring emitted in the assertion message. The spec
  instead ships a bespoke ~450-line TAP-parsing `assert_run`, a `git worktree`
  probe and a hand mutation protocol — all of which ADR-0042 replaces.
- The verification block calls `node tests/run.js --test-reporter=tap
  --test-name-pattern …` directly; `npm run red-proofs`
  (`node tests/with-temp-root.js scripts/red-proofs.js`) exists and is never
  referenced. Note for the successors: the check is the **unfiltered** run — a
  `--wp`-scoped run reports `RUN: FILTERED` and exits 1 by construction, so it can
  never satisfy a criterion.
- Sizing: nominally S. With the seam gone the real work is a pipeline-level test
  plus a re-homing of N2 across six registered mirrors in a `Done` spec guarded by
  four pinned digests. That is two packages.

## A documentation lag this assessment also found

Table N row N2 (`:1760`) still reads *"the prune runs once per gate run, **after
the loop over changed paths**, and only if at least one B4 completed"*. The rule
holds; the loop it names does not exist. The same stale locus is restated in Table
B row B10 (`:1572`, *"it runs once per gate run after the loop over changed
paths"*) and in mutation row M-48 (`:4708`, which quotes the old
`secretRedactions` call site verbatim and describes the mutation as *"move the
call into the B4 loop"*).

M-48 carries its own enumeration of **six registered mirrors**: AC-14's third case
(AC-14 at `:4193`), the AC-15 census row (`:4504`), Table B row B10 (`:1572`),
Table R consequence 7, the Security checklist's retention-prune bullet (`:3663`),
and row A3 of the proposed ADR-0036
(`docs/adr/0036-mechanism-cell-schema-for-contract-tables.md:106`). Table N's own
mirror checklist (`:2884-2891`) registers a slightly different set, adding Table B
row **B12** (`:1574`) and the **B12/B13 growth story** (`:1811-1812`). Any re-homing
pass must reconcile the two lists and register whatever it finds, in the same pass.

## Routing

The package is parked, not deleted: `status:` stays `Draft`, with a
`SUPERSEDED-PENDING` banner at the top naming this entry. Deleting or moving it to
`done/` is the owner's call.

Two successor drafts are filed, both `status: Draft`, both pinned to `622ca04b`,
**neither of which has had a design round** — they are backlog entries, not
dispatchable:

1. **`WP-ep2-n2-rehome`** (S, docs-only) — re-home Table N row N2 and Table B rows
   B10/B12 onto the real locus (`makeGates` returns `pruneRedacted`; the pipeline
   invokes it once at `src/cli/dream.js:1102`), re-key M-48's mutation to that call
   site, and move all registered mirrors in the same pass.
2. **`WP-ep2-prune-once-per-run-test`** (S, `depends_on: [WP-ep2-n2-rehome]`) — one
   pipeline-suite test asserting `gates.pruneRedacted` is invoked exactly once per
   run and only after a completed redaction, with one ADR-0042 RED declaration whose
   mutation moves or duplicates the `:1102` call.

The ordering is forced rather than preferred: the test's assertion must cite the
contract row it enforces, and today that row describes a call site that is not the
one the test would watch.
