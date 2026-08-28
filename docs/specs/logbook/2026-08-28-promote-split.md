---
title: Split executed — WP-dream-promote-in-workspace becomes a stacked pair
date: 2026-08-28
related_wps: [WP-dream-promote-in-workspace, WP-dream-promote-module]
---

# Split executed — WP-dream-promote-in-workspace becomes a stacked pair

Spec before the split: `docs/specs/WP-dream-promote-in-workspace.md` at
`7f1a708` (732 lines, `status: Draft`, returned to Draft by the PR-review gate
for a sizing violation — 36 acceptance criteria and 8 deliverables against 13
and 14 for its two siblings). The seam was ruled in principle at that gate so
that this step would be an execution, not a fresh debate; this entry records
the execution and the decisions made inside it.

## The inputs this split ran on

1. **The seam ruling** — `2026-08-21-dream-promote-pair-review-rounds.md`,
   "Owner ruling on the verdicts": *Tables C, D, E and R become a `promote.js`
   package, shipped consumed by nothing; Table G becomes the pipeline package.*
2. **The split's input record** — `2026-08-28-promote-split-inputs.md`: the
   containment-by-citation dispatch precondition, the Part i implementer's
   routed spec-modification requests, the C1-row bound defect, and the
   re-pinning obligation.
3. **The C1-row defect** — `2026-08-28-vault-write-spec-amendment.md`,
   "Discovered, NOT fixed".

## Resulting specs

- `docs/specs/WP-dream-promote-module.md` — **NEW**, the module half: Tables C,
  D, E and R, creating `src/core/dream/promote.js` and its test plus the
  glossary name. Ships consumed by nothing. `depends_on` the three `Done`
  packages.
- `docs/specs/WP-dream-promote-in-workspace.md` — **REWRITTEN in place**, the
  pipeline half: Table G, plus the two handoff rows the module half names.
  `depends_on` adds `WP-dream-promote-module`.

**Both remain `Draft`.** This is new text; it has inherited no review round. The
pre-split spec's ten adversarial rounds were dispositioned against the unsplit
text, and anything still applying must be re-found against these two. Moving
either to `Ready` is the owner's or the architect agent's move.

## Which half keeps the parent id, and why

The pipeline half. Precedent: both earlier splits in this family kept the parent
id on the LATER, dependent half and gave the extracted-first module a new name
(`WP-dream-workspace-retarget`, then `WP-dream-vault-write-primitive`, were both
the new files). Semantics agree: "promote in workspace" names the design
inversion — promotion replacing filtering — which becomes true of the product
only at the pipeline. The module alone is inert.

**Measured, so it is not discovered later: this choice leaves two citations in
`done/` records pointing at the half that no longer owns their subject.**
`done/WP-dream-vault-write-primitive.md:88` cites
`WP-dream-promote-in-workspace`, "Tables D and E" — those tables are now the
module half's; `:30`, `:149` and `:511` call it "its first consumer", which is
also now the module half. The mirror choice would have broken a symmetric set
(`done/WP-dream-workspace-retarget.md:508` routes the abort paths and the dream
commit to the parent id, which the pipeline half owns), so no assignment leaves
zero dangling references. Those files are `Done` RECORDS and outside both new
specs' Deliverables; **not fixed here, recorded here.**

## Decisions made while executing the split

- **The module half owns Table D, and touches `validate.js` not at all.** The
  ruling put Table D with the promote package, and the ruling also required that
  package to ship consumed by nothing — which changing the live gates' inputs
  would violate. Resolved by reading Table D as what `promote()` does with the
  gates it is HANDED: the order, the per-gate input routing and the ADR-0034
  taxonomy are all provable against injected fakes. Extracting the four real
  gates into that shape, and deleting the EP2 enforcement half, is stated in the
  module's Table D as a **named handoff** and discharged in the pipeline's row
  G7. This is the same device Part i used for the reap precondition.
- **`promote()`'s options gain `delta` and `date`; the module does not call
  `computeDelta` itself.** The pre-split signature took `workspaceDir` and
  `baseline` and no delta, while Table G's non-vacuity abort keys off "an empty
  `computeDelta` result" — so the pipeline needs that result for a decision
  `promote()` is not making. Two independent calls would let the two answers
  disagree; the pipeline computes it once and passes it. `date` was simply
  missing: Table R names the report `<reports_dir>/<date>.md` and the pre-split
  signature gave the module no way to know it. **Rejected: deriving the date
  inside the module** (it would read a clock, which nothing else in this family
  does) and **two `computeDelta` calls** (cheaper to write, and it manufactures
  a disagreement).
- **Preserving the unredacted copy to quarantine is the EP2 GATE's act, not
  `promote()`'s.** Table D's remedy column never said whose it was. Assigning it
  to the gate keeps the module free of any state-directory knowledge and keeps
  the signature to the options above — the simpler of the two available shapes.
- **Table E stays whole in the module half, with its commit rule marked as a
  handoff.** The commit is a pipeline act, but the rule that governs it (the
  committed content must be the bytes the primitive returned, not a fresh read)
  belongs with the write it constrains. Splitting the table to follow the act
  would have put half a contract in each spec. The pipeline's row G8 discharges
  it and its acceptance criteria assert it.
- **`tests/unit/dream-pipeline.test.js` is a new deliverable.** The pre-split
  spec put pipeline-level CLAIM 1 and CLAIM 2b in `dream-promote.test.js`, which
  is now the module half's file. The pipeline half needs its own, and the
  verification steps' named test patterns move with it
  (`claim-1-pipeline`, `claim-2b-pipeline`).
- **CLAIM 2b is asserted twice, at two scopes, because it means two things.**
  The module asserts that its merge — the only git it runs — is never invoked
  with a workspace cwd (`claim-2b-merge-cwd`). The pipeline asserts the
  product-wide form the sibling explicitly deferred to the successor
  (`claim-2b-pipeline`). Neither subsumes the other.
- **M7 goes to the module half, M10 to the pipeline half.** M7 closes with the
  promotion allowlist (row C9); M10 closes with the git-free classification the
  pipeline runs. Each spec's Mirrored Surface Checklist forbids the other from
  claiming it.
- **The C1-row defect is fixed in the split text, not patched in the parent.**
  C1 now cites BOTH bounds — H9's directory side and H7's staging-object side —
  states no count (the primitive's own H7 acceptance criterion is the single
  counting surface), and drops the "No CONTENT is written to the vault"
  absolute for "no content is PUBLISHED". The consequence a refused staging
  object creates — it sits where a wholesale `git add -A` would sweep it into
  the commit — is carried into Table E's staged-bytes row and the pipeline's
  row G8.
- **The Part i implementer's two routed requests are discharged by citation.**
  Request 1 (the containment semantics were stated as a security property but
  never as a rule) is answered by the owner-ruled Dispatch precondition in both
  specs: the rule is Table H's, the implementation is `vault-write.js` and
  `workspace.js`, and no surface in either spec paraphrases it. Request 2 (the
  pre-split spec froze `spawnBrain`'s option set, and the shipped `vaultDir`
  input — required, explicitly NOT a write target — was undocumented) is
  answered in the pipeline's Current state, which cites the shipped JSDoc at
  `brain.js:352-383` as canonical instead of restating an option set. Request 3
  was Part i's own and was fixed in PR #22.
- **Every `file:line` citation was re-pinned to `main` @ `36c2ce5` and verified
  at both ends.** `validate.js` is byte-identical to the pre-split pin (1469
  lines; every step, gate and range citation still resolves exactly).
  `src/cli/dream.js` gained 14 lines: `precommitSessionEdits` `:493`→`:507`, its
  paired `assertCleanTree` `:494`→`:508`, the non-vacuity `assertCleanTree`
  `:237`→`:251`, `restoreVaultToHead` `:535`→`:549` and `:550`→`:564`, the reap
  verdict `:272`→`:286` inside `if (pidfile)` `:256`→`:270`, the tokenless
  `pidfile` `:149-152`→`:163-166`, the transcript-advance `:568-596`→`:582-610`;
  `runBrainWithWatchdog` moved `:137`→`:139` and the transitional `spawnBrain`
  call site is `:153`. `reap.js`'s win32 branch is cited as `:505-519` (the
  pre-split `:503-519` began two lines above the branch). `delta.js:517-520`,
  `layout.js:21-29` and `:32-42`, `digest.js:414-418` and `:867`, and
  `SKILL.md:409-425` all still resolve.

## The new verification steps, checked for vacuity at authoring time

The spec-authoring runbook trusts a NEW verification step only after it has been
seen to fail. The implementer still pastes both sides per each spec's Definition
of done; these are the author-side checks that none of them is a step that
cannot fail:

- **`! grep -rqn "require(.*promote" src/ --include='*.js' --exclude='promote.js'`**
  (module half, consumed-by-nothing) — measured on `36c2ce5`: exit 0 on the
  tree as it stands, exit 1 with `require('./promote')` appended to
  `src/core/dream/validate.js` in a scratch copy. It discriminates. **The globs
  are quoted deliberately**: unquoted, `zsh` expands `--include=*.js` before
  `grep` sees it and the command dies with "no matches found", which the `!`
  turns into a false green — measured, both sides returned 0 that way.
- **`grep -q "\*\*promotion\*\*" docs/GLOSSARY.md`** (module half) — RED on
  `36c2ce5` (the glossary has **workspace** and **vault write**, not
  **promotion**), so it is not vacuously green before the work is done.
- **`grep -qi "promot" docs/adr/0012-dream-run-lifecycle.md`** (pipeline half) —
  RED on `36c2ce5`: the ADR contains neither "promot" nor "workspace" today.
- **`! grep -q "precommitSessionEdits" src/cli/dream.js`** (pipeline half) — RED
  on `36c2ce5`, as it must be until row G6 is done.
- **`grep -q "assertCleanTree" src/cli/dream.js`** (pipeline half, NEW in the
  split) — green today and green on a correct implementation; it catches only
  the delete-both mistake row G6 warns about. The spec says so in as many words
  rather than letting it read as a proof, and the discrimination lives in the
  non-vacuity acceptance criterion instead.

## Sizing — measured, and one honest counterweight

Counted the same way on every spec — Deliverables-table `create`/`modify` rows,
and `- [ ]` items under `## Acceptance criteria`, the template's idempotence and
`npm test` lines included. **That counting yields 14 and 16 for the two shipped
siblings where the PR-review gate said 13 and 14; the gate excluded those two
template lines. The ranking is identical either way**, and the numbers below are
internally consistent.

| | Pre-split | Module half | Pipeline half | Part i | The primitive |
|---|---|---|---|---|---|
| Deliverables | 8 | 3 | 6 | 12 | 3 |
| Acceptance criteria | 36 | 24 | 15 | 14 | 16 |

Both halves are inside `docs/specs/README.md`'s ceilings and both are materially
smaller than the spec the gate rejected. **The counterweight, stated rather than
absorbed: the module half is the larger of the two and sits at the top of M, not
comfortably inside it** — 24 criteria against 14 and 16 for its two shipped
siblings, and an estimated 450–600 lines of new non-test content against
`vault-write.js`'s 481. Six of its criteria are the report's (Table R); the natural further
seam, if the owner ever wants one, is the report (Table R plus Table D's report
row) as a third package. **That is not proposed and not acted on here: the seam
was ruled, and re-cutting a ruled seam is owner authority, not the split
author's.** It is recorded so the measurement is in front of the owner before
either half dispatches, rather than discovered at the next gate.

## What did NOT change

No contract was redesigned. Tables C, D, E, R and G carry the pre-split text
with four classes of edit and nothing else: the C1-row fix named above, the
re-pinned citations, the cross-package citations that replace what used to be
same-document references, and **one C-band prose correction the pre-split
closing sweep deliberately deferred to the implementer**. That last one:
Table D's report row said the promoted body is judged by "all four gates",
where in practice three of the four do not match a path under `reports_dir` and
pass it through. The sweep left it because a closing gate is the wrong moment
for a cosmetic edit; a split is the right one, since the row is being rewritten
anyway. It now says "the gates that match it judge it" and points the reader at
the gate rows, which is what the sweep's own note asked the implementer to do
by hand. Round numbers and finding ids from the pre-split
review loop (F-numbers, R-numbers) were dropped from the tables where they named
rounds of a loop these specs did not run; the RULINGS they carried are kept
verbatim with their dates, because those are owner decisions and survive the
split. The pre-split logbook keeps the full round history.
