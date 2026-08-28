---
title: Review rounds — WP-dream-write-fence-control-files
date: 2026-08-20
---

# Review rounds — WP-dream-write-fence-control-files

Spec: `docs/specs/WP-dream-write-fence-control-files.md`. Base: `main` @
`1d4c092`. Closes audit findings M7, M9, M10 of `2026-07-29` under the owner's
2026-08-05 structural-denial ruling.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes the loop:** one external adversarial round returns no finding about the
  PRODUCT — nothing that changes what the implementer builds in `src/`: the two
  denial rules, their precedence and their reason strings (Table A); the git-seam
  neutralization and its measured filter residual (Table B); the dot rule and its
  two sites (Table C); or the named residuals and their single named successor.
  Machinery findings at that point are fixed inside the existing verification
  surface or accepted as named residuals; they do not extend the loop.
- **Escalates, does not iterate:** two consecutive rounds landing on the same
  contract family → contract-extraction pass (ADR-0031 circuit-breaker), not
  another textual patch. Two consecutive rounds landing on the **ruled shape
  itself** — any of the five points of the 2026-08-05 ruling — is a design
  question, and goes to the owner as a ruling request rather than into a
  revision.
- **Surface is frozen:** verification machinery may grow only to guard a product
  behavior, in the smallest form that guards it. Round zero already shrank it from
  four assertions to two.

## Rounds

| Round | Kind | Raw record | Commit that introduced the raw | Verdict |
|---|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-20-dream-write-fence-control-files-r0-template-conformance-raw.md` | `587f6b5` | 1 blocking item |
| 0b | Internal coherence + runnable criteria | `docs/specs/logbook/2026-08-20-dream-write-fence-control-files-r0-internal-coherence-raw.md` | `63dcbfb` | 6 findings |
| 1 | External adversarial (design), gptsol | `docs/specs/logbook/2026-08-20-dream-write-fence-control-files-round-1-raw.md` | `f8221f6` | NO-SHIP — 4 Major + 1 spec-blocking |
| 2 | External adversarial (design), gptsol, fresh round after HEAVY fixes | `docs/specs/logbook/2026-08-20-dream-write-fence-control-files-round-2-raw.md` | `f224c71` | NO-SHIP — 3 partially fixed, 2 not fixed, 4 new |

## Round 0 dispositions

Every finding gets exactly one disposition. All six are LIGHT — each is about the
spec's own record or its verification machinery, none changes what the implementer
builds — so they were fixed and verified mechanically without opening a round.

| # | Finding | Weight | Disposition |
|---|---|---|---|
| R0-1 | The template's authoring-rules bullet under the H1 was silently absent (conformance BLOCKING) | LIGHT | **fix** — bullet added verbatim in the template's slot |
| R0-2 | `git()` cited as `:68-75`; it is `:67-84` (two mirrored surfaces: Current state and Table B) | LIGHT | **fix** — both corrected in one pass, per the Mirrored Surface Checklist |
| R0-3 | `topLevelDirs` cited `:21-30`; it is `:21-31` | LIGHT | **fix** |
| R0-4 | Verification assertion V3 was VACUOUS: unquoted `.` is a grep wildcard, so it matched the pre-existing `startsWith('#')` at `layout.js:108` and passed on the untouched tree | LIGHT | **fix** — V3/V4 deleted; the two survivors use `grep -qF` and pin literals this spec itself decides, never a code shape |
| R0-5 | V2 (`--no-verify` count == 2) and V4 were OVER-STRICT: both went red against a hand-built, equally correct implementation shape | LIGHT | **fix** — same as R0-4; Tables A and C are asserted by the acceptance criteria and the implementer's tests, which are shape-independent |
| R0-6 | The idempotence criterion stated no binary outcome ("no accumulated state"); the two `isSafeRelativePath` copies were listed as Deliverables but not registered as a mirror, and the declined de-duplication was unrecorded | LIGHT | **fix** — criterion restated in binary form; the copy pair registered in the Mirrored Surface Checklist; the declined de-duplication recorded under Implementation notes with its reason |

**Not a finding, recorded for the next reader.** Two facts surfaced during the
mandatory citation re-run that the intent brief's (explicitly non-exhaustive) fact
table did not carry, and both are now spec content rather than corrections to it:
`src/core/layout-infer.js:40-46` holds a second copy of `isSafeRelativePath` and
today proposes `.skills` for a vault containing that directory (measured); and the
filter residual is wider than the audit recorded — the same locally-defined filter
also executes on `git hash-object -w --path` and, as `smudge`, on
`git checkout HEAD -- <rel>`, which is the validator's own revert path (measured).

## Owner decisions carried in the spec, not decided by the author

- The ruled-**optional** `--ignored` detection (ruling point 5) is **declined**;
  reason under Implementation notes. Flagged to the owner at the round-zero report.
- The de-duplication of `isSafeRelativePath` is **declined**; reason under
  Implementation notes. Flagged at the same point.

Both are reversible by an owner instruction without touching any other contract.

## Round 1 dispositions

Backend: `gptsol`. Read-only verified (`git status --porcelain` zero bytes on both
sides). The reviewer RAN its reproductions; the orchestrator then re-ran each
load-bearing claim independently before anything was acted on, per
`docs/runbooks/codex-review.md` ("the orchestrator spot-checks citations"). **All
five reproduced.** The owner accepted all five and ruled on the three that touched
design.

| # | Finding | Weight | Disposition |
|---|---|---|---|
| R1-1 | Same-run ignore bypass: reverting the dream's `.gitignore` un-hides a file the loop already passed over, and the later `git add -A` commits it | HEAVY | **fix**, owner-ruled path (A) — see below |
| R1-2 | "Safe against user data" false: a file created mid-run, or one un-hidden by a revert, is permanently deleted | HEAVY | **fix** — preservation before destruction (Table D) |
| R1-3 | The git seam still runs repository-controlled programs; the residual named only filters | HEAVY | **fix** — one residual class, widened (Table E) |
| R1-4 | Table C silently repoints a previously valid layout on upgrade | HEAVY | **fix** — notice on an existing surface (Table C) |
| R1-5 | The idempotence criterion is unsatisfiable against the report's per-run append | LIGHT | **fix** — criterion narrowed |

### The owner's rulings (2026-08-20), as landed

1. **R1-1 → path (A)**: the fence runs over the actually-staged set, to fixpoint,
   with three binding constraints — (a) `.gitignore`-affecting reverts run FIRST and
   visibility is recomputed only after them, or a user's until-now-ignored file
   reaches the fence in the same pass that un-hid it; (b) paths that became ignored
   again are `git rm --cached`'d BEFORE the fence recomputes (measured: restoring the
   ignore rule does not unstage, and neither does a further `add -A`; `--cached`
   leaves the file on disk); (c) the spec must NOT argue "it would land in the tree
   today anyway" — measured on the baseline, today the hostile file does NOT enter
   the tree, so the naive fix is actively worse, not at parity. Path (B), a
   git-independent filesystem inventory, goes to the successor as M10's real
   closure. Path (C), aborting the run, rejected: it discards a night's work over one
   path and hands an attacker an off-switch. **Stated limit:** (A) closes tree-based
   hiding only — `.git/info/exclude` and `core.excludesFile` hide identically and are
   not stageable (measured), so they belong to the residual class and to the
   successor's charter.
2. **R1-2 → preservation, not deletion**, via the existing `state/quarantine/`
   machinery, with the original path recorded. House rule: rule 1 turns a former
   "keep" into a "destroy" on a path class that can hold user data, so every such
   destruction is paired with a preservation. With 1(a)+1(b) this is the safety net,
   not the main path.
3. **R1-3 → one residual class**, wider than proposed: repo-local state outside the
   tree that the validator cannot see but git obeys — filters, `core.fsmonitor`,
   `gpg.program`, `.git/info/exclude`, `core.excludesFile`. Two measured additions:
   the exposure starts before the brain does (`core.fsmonitor` fires on the first
   `git status`, inside precommit), and every channel needs a `.git/` write that
   only the borrowed harness refusal prevents today. The successor's charter gains a
   pre-flight config check with a loud halt; not built here, because the legitimate
   case (commit signing) opens a permissions question. Measured and consistent:
   reading the config does not itself trigger `core.fsmonitor`.
4. **R1-4 → not silent for the NEW dot class.** The pre-existing rejection classes
   (empty, absolute, backslash, `..`) keep their silence — that is what ruling point
   3 of 2026-08-05 protected. The surface had to come from the EXISTING ones, or the
   fallback stays as a named residual carried by the successor's doctor detector;
   a new channel was excluded outright. Measured choice: `src/cli/sync.js` already
   calls `readVaultLayout` at `:270` and already owns a `summary.notices` surface;
   `doctor` deliberately does not parse config content yet
   (`src/cli/doctor.js:337-338`). Precedent: the frontmatter package pushed to an
   existing warning banner rather than staying silent.
5. **R1-5 → narrowed** to the denied paths and the enforcement line; the report's
   per-run append is pre-existing behaviour and explicitly outside the criterion.

### Stop criterion — RE-STATED for round 2 (HEAVY fixes landed)

Unchanged in substance, restated because the runbook requires it whenever a HEAVY
fix triggers a fresh round:

- **Closes:** one external round returns no finding about the PRODUCT — the fence's
  definition over the committed set and its ordering/un-staging/termination rules
  (Table A), the git seam (Table B), the layout rule and its notice (Table C),
  preservation before destruction (Table D), or the residual class and its successor
  (Table E).
- **Escalates:** two consecutive rounds on the same contract family → contract
  extraction, not another patch. **Two consecutive rounds on the 2026-08-05 ruling's
  five points, or on the 2026-08-20 rulings above, go to the owner as a ruling
  request, never into a revision.**
- **Surface frozen:** verification machinery grows only to guard a product behavior.
  It stands at two assertions and does not grow in round 2.

### Size note, carried into round 2

The package now stands at **8 deliverable files** — exactly the `docs/specs/README.md`
ceiling — with an estimated ~110 lines of new non-test content, well inside the
~400 heuristic. It fits, but it fits at the limit, and `validate.js` carries
materially more than the first draft (fixpoint, ordering, un-staging, preservation).
Round 2 is explicitly invited to attack the size, and a split along the natural seam
(the fence in `validate.js` vs. the layout rule + its notice) is the fallback if it
lands.

## Round 2 — verdicts, and the STOP CRITERION FIRING

Backend: `gptsol`, output language pinned to English (the round-1 leak, fixed).
Read-only verified. The reviewer ran two throwaway-repository reproductions plus
the full suite; the orchestrator then re-ran the three load-bearing new claims
independently. **All three reproduced:**

- `diff.external` from repo-local config executes on the validator's exact
  `git diff --cached -U0 -- <rel>` shape (`validate.js:1257`) with
  `-c core.hooksPath=/dev/null` set.
- `git rm --cached <p>` followed by a later `git add -A` **re-stages** `<p>`. The
  validator runs `git add -A` again at `:1223` and `:1412`, after the classification
  loop where Table A puts the fixpoint.
- A forbidden file left on disk by Table D's preservation-failure branch is
  committed by the NEXT run's `precommitSessionEdits` — as
  `vault: session edits before dream`, before the brain and before the fence.

| Round-1 finding | Round-2 verdict |
|---|---|
| R1-1 same-run ignore bypass | PARTIALLY FIXED — fixpoint sits in the classification loop; no final pass after the last `git add -A` |
| R1-2 denial destroyed user data | PARTIALLY FIXED — mid-run save after preserve, symlinks, and the containment branch remain |
| R1-3 git seam runs repo-controlled programs | PARTIALLY FIXED — Table E claims completeness but omits `diff.external` and attribute-selected diff drivers |
| R1-4 layout silently repointed | **NOT FIXED** — `sync` is 1 of 4 `readVaultLayout` callers; the dream path stays silent |
| R1-5 idempotence criterion | **NOT FIXED** — the reason string embeds the quarantine basename, and `quarantinePreserve` appends `-1`, `-2` on collision (`:721-730`), so a repeated denial cannot produce a byte-identical line |

New findings: (1) preservation failure becomes a next-run precommit bypass;
(2) `diff.external` missing from Table E — and hardenable at the call site, not
merely disclosable; (3) the migration notice is absent from the path that applies
the migration; (4) the package exceeds the one-session sizing contract and should
split three ways.

### The stop criterion fires — this does NOT go into another revision

Pinned before round 1 and re-stated before round 2: *"Two consecutive rounds on the
2026-08-05 ruling's five points, or on the 2026-08-20 rulings, go to the owner as a
ruling request, never into a revision."* That condition is met, and not narrowly —
**every one of the five 2026-08-20 rulings took a second-round hit**: ruling 1
(Table A's fixpoint placement), ruling 2 (Table D's failure branch, now shown to be
an escalation path rather than a safety net), ruling 3 (Table E's completeness),
ruling 4 (the notice surface), ruling 5 (the narrowed criterion).

The runbook's own reading of this pattern is that the next step is a design
question, never another textual patch — and round 2's finding 4 names the design
answer independently: the package holds three mechanisms, each of which got partial
attention in both rounds. **No further revision is made until the owner rules on the
split.** The orchestrator's recommendation, matching the reviewer's seam and the
contract-table boundaries already in the spec:

1. **Fence package** — Tables A + D. Adds `src/cli/dream.js` to deliverables (the
   cross-run precommit contract that finding 1 requires); owns the final-pass
   ordering after the last `git add -A`; owns an idempotence criterion that does not
   embed a collision-suffixed basename.
2. **Git-seam package** — Tables B + E. Owns the complete class AND the hardening
   round 2 put within reach: `--no-ext-diff` / `--no-textconv` on validator-owned
   diff invocations closes `diff.external` at the call site rather than disclosing
   it.
3. **Layout package** — Table C. Owns both `isSafeRelativePath` copies and the
   rejection diagnostic at the shared `readVaultLayout` boundary, so every
   behaviour-changing consumer gets it — not `sync` alone.

Each is independently reviewable, each closes a nameable part of M7/M9/M10, and the
three share no file except `validate.js`, which sequences them rather than
parallelises them.

## Owner ruling on the escalation (2026-08-20) — the package splits

The escalation was accepted as correct use of the stop criterion, and the round
closed cleanly on it. All four round-2 findings accepted; the advisor replayed the
three substantive measurements in a sandbox and all three stand.

1. **Split approved**, into the three proposed packages along the contract-table
   seams. This spec goes **Superseded** and moves to `done/`, which stays the
   project's true changelog. Three new specs are born, each running the full repo
   process with a **round counter starting from zero** — no round history is
   inherited from this one.
2. **Order ruled, strictly serialised (WIP = 1): C1 fence → C2 git seam → C3
   layout.** Rationale: the cross-run promotion is the only finding that leaves an
   ACTIVE attack chain open; the other two are, respectively, a disclosed but
   refusal-protected gap and a migration UX defect.
3. **C1 (fence — Tables A + D).** `src/cli/dream.js` joins the deliverables, because
   the between-runs gate lives there. Mandatory: a final fence pass after the LAST
   `git add -A`, at the real commit boundary; and an idempotence criterion that does
   not embed a collision-suffixed basename. The cross-run gate is designed in C1's
   spec phase under a **dual constraint — no user data is destroyed AND the attacker
   gets no cheap dream off-switch.** First direction to measure: atomic, rename-based
   preservation plus a durable residue marker that the next run's precommit skips
   with a targeted `:(exclude)` pathspec and retries. **The reviewer's
   halt-before-precommit proposal is suspect under round 1's own reasons for
   rejecting path (C) — measure it, do not adopt it by default.** Preservation edge
   cases (symlink preserved AS a symlink, directories, unreadable paths, the
   preserve→destroy race window) are C1 spec-phase items: measure, propose, and bring
   open decisions to the owner.
4. **C2 (git seam — Tables B + E).** Hardening, not disclosure alone. Measurement
   facts handed over by the advisor: `--no-ext-diff` demonstrably silences
   `diff.external` on the `-U0` shape; of the validator's three staged-diff shapes
   **only** `validate.js:1257`'s `-U0` fires (`--numstat -z` and `--name-status -z`
   are silent), so the hardening has a single call site; `textconv` needs its own
   measurement (`--no-textconv`). Table E gains the external-diff family. The class
   stays **managed, not closed**: the disclosure WP remains queued behind group C and
   may never be cited as closing M9 or M10.
5. **C3 (layout — Table C).** The diagnostic moves to the shared `readVaultLayout`
   boundary (a companion API if the signature cannot be broken), and **all four**
   consumers receive it, on EXISTING surfaces — on the dream path the existing
   self-alert/banner surface is the candidate. The no-new-channel prohibition from
   the 2026-08-20 ruling 4 is unchanged.

**Next act, and only this:** record the ruling, flip this spec to Superseded, draft
C1. C2 and C3 do not start before C1 closes.

> **Pointer:** this spec now lives at
> `docs/specs/done/WP-dream-write-fence-control-files.md`. The round records above
> cite its former path; they are point-in-time records and are not rewritten.
