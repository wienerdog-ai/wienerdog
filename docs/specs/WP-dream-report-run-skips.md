---
id: WP-dream-report-run-skips
title: Make the dream report account for the sessions a run could not consume
status: Draft
model: opus
size: M
depends_on: [WP-quarantine-warnings-file, WP-quarantine-banner-decay, WP-dream-promote-in-workspace, WP-dream-filtered-input-budget]
adrs: [ADR-0004, ADR-0012, ADR-0023, ADR-0031, ADR-0042]
epic: quarantine-surface
---

# WP-dream-report-run-skips: the run accounts for what it could not consume

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **2026-09-17 — RETURNED TO `Draft` AND RE-DERIVED.** This package was `Ready`
> against a collector that no longer exists. PR #245 merged
> `WP-dream-filtered-input-budget`, which retired equal shares and suffix
> truncation and split the collector's exclusions into **five** arms. A `Ready`
> spec whose Current state is false is not `Ready` — every `file:line` citation,
> the count table, two acceptance criteria and the long `node -e` gate were
> describing code that had been deleted, so the package could not be dispatched
> and is not `Ready` until the design-review loop says so. Everything below is
> re-derived against `main` at `b4af715e` (2026-09-17). The previous revision's
> PROVISIONAL mechanism is **discharged and removed**: the promotion rewrite it
> was waiting for has landed, so the Deliverables table below names real files at
> a real SHA and carries no markers. Three design questions that this
> re-derivation could not settle alone are parked under **Dispatch precondition —
> owner items**; one measured gap is routed under **Discovered issues**.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** This package adds counted lines to a
markdown file the dream already writes. No process, no state, no new command.

The nightly **dreaming** job consolidates the user's **transcripts** into the
**vault**. Each run writes a **dream report** at `<reports_dir>/<YYYY-MM-DD>.md`
(`reports/dreams/` by default) — the human-readable account of what the run did.
Its body is authored by the brain (the model); `promote()` then appends the run's
own code-owned accounting beneath it, in one composed block
(`src/core/dream/promote.js:706-777`). The brain is told, in
`skills/wienerdog-dream/SKILL.md:410-424`, that it writes the candidate-level
accounting and that the orchestrator appends the rest.

**What the report does not say: what the run could not read.** A run that skipped
191 sessions produces a report that does not mention them. Since
`WP-dream-filtered-input-budget` landed there are **six** distinct facts about
coverage that no durable surface carries, and they are not interchangeable —
three of them persist until something changes, three of them resolve themselves
on the next run. **Table B is the one place they are defined**; this paragraph names
them only so the problem is legible: transcripts newly quarantined, transcripts
quarantined earlier and skipped again, transcripts individually too big to dream
over, and the three kinds of deferral (capacity, preprocessing deadline,
incomplete read).

**One of the six has no durable surface at all today.** An *individually
oversized* transcript — one whose filtered extract alone exceeds
`dream_max_input_bytes` — is skipped **every night** until the session file
changes or that setting is raised (ADR-0023 Amendment 3, "Oversized measurements
are independent optional ledger metadata"). Its only surface today is a console
count on `stdout` of a scheduled job. That is the gap the integration review
recorded, and Table A's oversized bullet is what closes it.

ADR-0023 Amendment 2 (2026-08-29) makes this the fourth of the four surfaces the
quarantine record has, and it obeys the same one-home principle they do: **the
full enumeration lives in `reports/warnings.md` and nowhere else, so this section
carries exact counts and a pointer to it.** That amendment already anticipates
this package by name, and already rules what the pointer may promise: "**The
pointer promises only what that file can deliver:** it accompanies counts of
QUARANTINED sessions, which the file names. The dream report additionally counts
capacity-deferred transcripts, for which §2 keeps no record at all, so the file
cannot name them and that count travels without a pointer
(`WP-dream-report-run-skips`)." Table A's pointer row is where that rule is
decided for this package, generalised to the five exclusion arms that exist now.
This section's three siblings all describe **standing state** — what is
quarantined *now* (`reports/warnings.md` lists it; `wienerdog doctor` and the
digest banner count it and point there). This one is the only surface that
describes **one run**: what *that night* could not see. The dream reports are the
vault's build history, and a permanent gap in coverage should be discoverable a
month later from the report of the night it happened.

**The section is code-owned and built from integers alone.** No basename, no
path, no reason string, no session id. The precedent is `secretRevertSummaryLine`
(`src/core/dream/ledger.js:498-509`), whose comment states the property directly:
every argument that is not a non-negative safe integer renders as `0`, "which is
what makes it STRUCTURALLY impossible for a basename, a path or a matched value
to enter this line". The names live in `reports/warnings.md` — the enumeration's
one home — and this section counts, and points there for the sessions that file
actually holds (Table A's pointer row).

## Current state

Re-derived against `main` at `b4af715e` (2026-09-17). Every citation below was
read whole at that SHA.

### The collector, after `WP-dream-filtered-input-budget`

`collectExtracts` (`src/core/dream/scratch.js:46-157`) discovers every transcript
and partitions it. **Its exclusion arms are FIVE and disjoint** — Table B is the
canonical statement; the code facts are:

- **Ledger-skipped.** `src/core/dream/scratch.js:54` is
  `const candidates = discovered.filter((d) => ledgerLib.selectState(ledger, d) === 'select');`.
  `selectState` returns exactly one of `'select'`, `'skip-processed'`,
  `'skip-quarantined'` per file (`src/core/dream/ledger.js:228-257`). **The
  function keeps only the `'select'` files and discards how many answered
  `'skip-quarantined'`** — nothing outside that filter can learn it. That count is
  the one addition this package makes to the collector (Table B, `stillQuarantined`).
- **Newly quarantined.** `:58` (over the pre-read ceiling) and `:111` (a
  non-`ok` parse outcome) push onto `newlyQuarantined`; each arm `continue`s.
- **Read-deferred.** `:114-117` — a `runExhausted` parse discards the partial
  extract onto `readDeferred` and continues to older candidates.
- **Oversized.** `:102-105` (a matching ledger memo, `cached: true`) and
  `:119-123` (a fresh measurement, `cached: false`) push onto `oversized` and
  continue. The fresh arm also writes the memo into the returned
  `oversizedExtracts` map, which `src/cli/dream.js:627-630` folds into the ledger
  and persists. **An oversized session is therefore the one exclusion that leaves
  a ledger-side trace and is still not retried** until the file's fingerprint, the
  running package version, or `dream_max_input_bytes` changes.
- **Capacity-deferred.** `:91-94` (the budget was filled exactly) and `:124-127`
  (the next extract fits X but not the remainder) call `deferRemaining` over the
  **unvisited remainder** and `break`.
- **Deadline-deferred.** `:95-98` — the soft preprocessing deadline expired;
  `deferRemaining` over the unvisited remainder, then `break`.

The return (`:142-156`) carries `entries`, `processed`, `newlyQuarantined`,
`deferred`, `droppedForSize`, `dropped` (**the same array as `deferred`**),
`truncated`, `wrote`, `deadlineDeferred`, `readDeferred`, `oversized` and
`oversizedExtracts`. **`truncated` is the literal `[]` (`:150`) and every entry's
`truncatedToFit` is the literal `false` (`:135`)** — budget-induced suffix
truncation is retired (ADR-0012, amendment of 2026-09-15; ADR-0023 Amendment 3).

### The orchestrator

- `src/cli/dream.js:622-624` calls the collector; `sel` stays in scope through the
  whole run, including the `promote()` call at `:956-967`.
- `:683-700` builds `exclusions[]` — one console line each for `sel.deferred`,
  `sel.deadlineDeferred`, `sel.oversized` and `sel.readDeferred`, printed only
  when non-zero, counts only. `sel.newlyQuarantined` gets its own per-file console
  line at `:705-712`. **Nothing prints a still-quarantined count anywhere.**
- `:736-743` — **if `sel.entries.length === 0` and any exclusion fired, a real run
  THROWS** `WienerdogError('dream: no complete session was admitted. …')` carrying
  every exclusion line. No brain, no `promote()`, **no dream report at all** on
  that path.
- `:746-757` — if `sel.entries.length === 0` with no exclusions, the run prints
  `wienerdog: nothing new to dream.`, refreshes `reports/warnings.md` and returns.
  **This is also where the adopt-with-history first run now returns**; it writes no
  report either.
- **Therefore the report section this package adds only ever renders on a run that
  admitted at least one session.** Table A's coverage row owns that boundary.

### The report's code-appended accounting

- `promote()` composes the run's accounting **once**, in `composeRecord`
  (`src/core/dream/promote.js:706-777`): `## Refused by policy (promotion
  enforcement)` always, then `## Redacted in place (secret scan)` and
  `## Preserved copies (secret quarantine)` when non-empty (headings at `:584-591`).
  The composed lines become one buffer at `:1563` and reach the vault through
  exactly one write — the second write on the published-body arm (`:1585-1591`) or
  Table R's fallback (`:1637-1647`).
- The same lines travel back to the caller as `report.record` on **every** arm, and
  `src/cli/dream.js:1119-1131` prints them when the vault did not get them. **A
  section composed inside `composeRecord` inherits that delivery for free.**
- `composeRecord` ends with a fail-closed neutralisation check over the whole
  composed text (`:769-775`). An integers-only section is a fixed point of it.
- `promote()` already takes `records?: Array<{path, reason}>` for "code-owned
  accounting the CALLER produced before promotion" (`:855-860`, validated at
  `:1027-1035`). **That field is not this package's channel**: its members land
  under the enforcement heading, whose subject is a policy violation. A skipped
  transcript is not a violation, and filing it there would misreport a correct
  fail-safe skip as an enforcement event.
- `promote()` exports `promote`, `makeAdmit` and `spawnGitForMerge` (`:1669-1677`)
  — the precedent for exporting an internal for the deliverable test file.
- `WP-quarantine-warnings-file` created the durable list this section points at, at
  the fixed vault-relative path `reports/warnings.md`. Its renderer
  (`src/core/dream/warnings.js:138-189`) reads `ledger.files` records whose
  `outcome === 'quarantined'` and **nothing else** — it cannot see
  `oversizedExtracts`, and an oversized session is not a quarantine (ADR-0023
  Amendment 3: "no new quarantine reason"). See Out of scope.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | **One addition only:** `collectExtracts` also returns the count **Table B**'s `stillQuarantined` row names. No other returned field changes shape and no selection behaviour changes |
| modify | src/core/dream/promote.js | the exported formatter of **Table A**, the one optional input of **Table B**, and `composeRecord` emitting the section last. Nothing else in the module changes |
| modify | src/cli/dream.js | build the six integers **Table B** names from `sel` and pass them to `promote()`; nothing else in the run changes |
| modify | tests/unit/dream-collect.test.js | cover the new count only (**Table B**); no existing assertion on `collectExtracts`'s return shape is weakened. This is `scratch.js`'s test file (its test names are prefixed `dream-collect:`) |
| modify | tests/unit/dream-promote.test.js | the four test identities of **Table C**, plus the appended-section coverage. Test names are prefixed `dream-promote:` |
| modify | tests/integration/dream.test.js | one end-to-end run whose committed report carries the section (`dream-integration:` prefix) |
| create | tests/red-proofs/dream-report-run-skips.proofs.json | **Table C**'s declaration, inlined there in full. Copy it; do not re-derive it |

If a further file appears necessary, that is a finding, not a fix: record it under
"Discovered issues" in the PR body.

### Exact contracts

```js
/** The code-owned per-run skip accounting for the dream report. Built from
 *  integers alone: every property that is not a non-negative safe integer
 *  renders as 0, exactly like secretRevertSummaryLine.
 *  @param {{newlyQuarantined:number, stillQuarantined:number, oversized:number,
 *           capacityDeferred:number, deadlineDeferred:number,
 *           readDeferred:number}} counts
 *  @returns {string} the section, no trailing newline; '' when every count is 0 */
function runSkipSummarySection(counts)
```

Exported from `src/core/dream/promote.js`. `promote()` gains one optional input,
`runSkips`, passed straight to that function; `composeRecord` appends the result
**last**, as `lines.push('', ...section.split('\n'))` when it is non-empty, so
every element of `report.record` stays exactly one line.

Worked example — a run that newly quarantined 3, skipped 191 already-quarantined,
found 1 individually oversized, capacity-deferred 2, deadline-deferred 5 and
read-deferred 4 renders exactly:

```markdown
## Sessions this run could not consolidate

- 3 session transcript(s) were skipped for the first time this run.
- 191 session transcript(s) were already being skipped and were skipped again.
- 1 session transcript(s) are too big to dream over on their own. Wienerdog will pass over them every night until the session file changes or you raise dream_max_input_bytes in config.yaml.
- 2 session transcript(s) did not fit in what this run could take in, and will be retried on the next run.
- 5 session transcript(s) were not reached before the time this run had to prepare them ran out, and will be retried on the next run.
- 4 session transcript(s) were still being written while this run read them, and will be retried on the next run.

Which sessions are being skipped, and why: reports/warnings.md in your vault.
```

Second worked example — a run with **no quarantine counts** (`newlyQuarantined` 0,
`stillQuarantined` 0, `oversized` 1, `capacityDeferred` 2, `deadlineDeferred` 5,
`readDeferred` 4) renders exactly:

```markdown
## Sessions this run could not consolidate

- 1 session transcript(s) are too big to dream over on their own. Wienerdog will pass over them every night until the session file changes or you raise dream_max_input_bytes in config.yaml.
- 2 session transcript(s) did not fit in what this run could take in, and will be retried on the next run.
- 5 session transcript(s) were not reached before the time this run had to prepare them ran out, and will be retried on the next run.
- 4 session transcript(s) were still being written while this run read them, and will be retried on the next run.
```

**No pointer line** — `reports/warnings.md` renders the ledger's active
quarantines and nothing else, and none of those four counts is a quarantine, so
that file is structurally incapable of naming any of them. Table A's pointer row
decides this. A run with all six counts at zero appends nothing at all — no
heading, no "none" line.

## Contract reference

Activation (ADR-0031, 2-of-7): **(i)** the emitted report gains a section shape
and `promote()` gains an input; **(ii)** a result taxonomy — the collector's five
exclusion arms — becomes user-visible for the first time; **(v)** an authority
boundary is crossed: the collector observes the exclusions, the orchestrator
counts them, and the report composer owns the document. Three conditions, so the
discipline applies.

### Table A — canonical: the emitted section

| Fact / rule | Value |
|---|---|
| Heading | `## Sessions this run could not consolidate` |
| Body | one bullet per **non-zero** count, in Table B's row order, each byte-exact as the first worked example shows; then, **only when the pointer row below says it renders**, a blank line and that pointer line byte-exact |
| **Pointer line — the text, and the ONLY condition under which it renders** | The text is byte-exact `Which sessions are being skipped, and why: reports/warnings.md in your vault.` It renders **if and only if `newlyQuarantined` or `stillQuarantined` is non-zero** — it rides the two QUARANTINE counts and nothing else. **Why no other count may carry it:** `reports/warnings.md` is a render of the ledger's *active quarantines* (`src/core/dream/warnings.js:138-189`), and none of the other four arms produces a quarantine record — ADR-0023 Amendment 3 states outright that the new exclusion causes introduce "no new quarantine reason", and Amendment 2 already rules that a count the file cannot name "travels without a pointer". Pointing a quarantine-free report there sends the user to a file containing none of the events the report just counted. **One pointer, not two** — `wienerdog doctor` is never named here: it reports the same counts this section just gave, and only `reports/warnings.md` answers "which ones" |
| **Lexical scoping of the pointer's promise** | The word **skipped** appears in the two quarantine bullets and in the pointer line, **and nowhere else in the section** — the other four bullets say *pass over*, *did not fit*, *were not reached* and *were still being written*. That is what makes the pointer readable as a promise about exactly the bullets it rides on, in a section where the four other conditions are also, in plain English, "skips". It is asserted directly: a section rendered with the two quarantine counts at 0 contains no occurrence of `skipped` |
| Zero case | all six counts 0 → the function returns `''` and **nothing is appended** — no heading, no "none" line. This section is news; a run with nothing to report says nothing |
| Partial case | a count of 0 omits its bullet and the remaining bullets render unchanged, in Table B's row order. The pointer line does **not** follow the heading — it follows the pointer row's condition |
| Built from integers alone | every property of `counts` that is not a non-negative safe integer renders as `0`; `counts` itself may be `undefined` or any non-object and the result is then `''`. No basename, no path, no reason string, no session id reaches this section — the names live in `reports/warnings.md`, the enumeration's one home. **`promote()` performs NO validation of `runSkips`** and never throws for it: this input arrives after the brain has run and after the body has published, and a caller bug must cost the section, never the run's consolidation. That is the opposite of the `records` input's fail-loud rule (`promote.js:1027-1035`), deliberately; Implementation notes price the alternative |
| No apostrophe | no `'` appears anywhere in the section's text, so the whole of it can be pinned in single-quoted JavaScript inside a double-quoted shell string. That is a property of the shipped wording, and the verification gate depends on it |
| Placement in the report | composed inside `composeRecord` and appended **last** — after the enforcement block, which always renders, and after the redaction and preserved-copy blocks when they render — separated from whichever precedes it by exactly one blank line, exactly once per run. Last because the other blocks are about what the run refused to WRITE and this one is about what it could not READ |
| Coverage boundary | the section renders **only on a run that admitted at least one session**, because no other run composes a report (Current state, "The orchestrator"). A run that admitted nothing but excluded something THROWS at `src/cli/dream.js:736-743`; on that path the run's failure message carries every exclusion count, and the scheduled path records that failure in `alerts.jsonl` for the digest banner. **This package adds nothing to that path and makes no claim about it** |
| Delivery when the vault refuses the write | none of the above changes. The section is part of `report.record`, so on `report.outcome === 'refused'` and on `promoted` with `accounting.published === false` it reaches the user through `src/cli/dream.js:1119-1131` exactly like the enforcement record |
| The brain is not told about it | `skills/wienerdog-dream/SKILL.md` is **not** a deliverable. The model does not author this section, and telling it the section exists invites it to write one |

### Table B — canonical: the six counts, their sources and their order

Row order is render order.

| # | Count | Definition | Source in `src/cli/dream.js` at `b4af715e` |
|---|---|---|---|
| B1 | `newlyQuarantined` | transcripts this run recorded as `quarantined` for the first time — over the pre-read ceiling, or a non-`ok` parse outcome | `sel.newlyQuarantined.length` |
| B2 | `stillQuarantined` | **the transcripts this run ACTUALLY skipped for an existing quarantine** — the discovered files for which `selectState` returned `'skip-quarantined'`, counted at selection time. **Not** the run-start ledger's active-quarantine count; row B7 says why that is a different number | `sel.skippedQuarantined` — **a new integer `collectExtracts` returns**, computed from the same `discovered` array and the same `selectState` call that already partitions candidates (`src/core/dream/scratch.js:54`) |
| B3 | `oversized` | transcripts whose own filtered extract exceeds `dream_max_input_bytes`, measured this run or read from the ledger's `oversizedExtracts` memo. **Not retried** until the file's fingerprint, the package version or X changes (ADR-0023 Amendment 3) | `sel.oversized.length` |
| B4 | `capacityDeferred` | the capacity stop's unvisited remainder — valid transcripts left over when the run's input budget was spent. No ledger record, so ordinary eligibility retries them next run | `sel.deferred.length` (`sel.dropped` is the same array; `sel.droppedForSize` its length) |
| B5 | `deadlineDeferred` | the preprocessing deadline's unvisited remainder. No ledger record; retried next run | `sel.deadlineDeferred.length` |
| B6 | `readDeferred` | transcripts whose read did not complete within the per-session work allowance; the partial extract is discarded. No ledger record; retried next run | `sel.readDeferred.length` |

| Fact / rule | Value |
|---|---|
| **B7 — why `stillQuarantined` is NOT the run-start set's size** | because a prior quarantine whose file CHANGED is re-selected: `selectState` compares the record's fingerprint and answers `'select'` when it differs (`src/core/dream/ledger.js:242`), and the sticky `secret-revert-exhausted` arm (`:239-241`) is the only quarantine that ignores the fingerprint. Three miscounts follow from the run-start reading and all three are gone under the selection reading: **(a) double-counting** — a changed prior quarantine re-quarantined this run lands in B1 AND in the run-start set; **(b) a false skip** — a changed prior quarantine consolidated successfully this run is still reported as skipped again; **(c) a phantom** — a prior quarantine whose file was deleted is no longer discovered, was skipped by nothing, and is still counted. The report is durable, so each preserves a false coverage story for as long as the vault lives |
| **B8 — disjointness, and the construction that gives it** | every discovered file takes exactly one `selectState` outcome (`ledger.js:228-257`, a total function over three values). `'skip-quarantined'` → B2. `'skip-processed'` → counted nowhere, by design: a consolidated transcript is not a skip. `'select'` → exactly one collector arm, because every arm either `continue`s or `break`s (Current state, "The collector"), and a `deferRemaining` stop is followed immediately by `break` so a file cannot be both visited and part of a remainder. Over-ceiling candidates never enter the admission loop at all. ADR-0023 Amendment 3 states the same partition normatively: "These categories and quarantine are disjoint; ledger-skipped files are outside them." **Consequence, asserted directly:** `entries.length` plus the six counts never exceeds the number of discovered files, and no file contributes to two |
| **B9 — there is no truncation count, and there cannot be one** | budget-induced suffix truncation is retired. `sel.truncated` is the literal `[]` and every entry's `truncatedToFit` is the literal `false` (`src/core/dream/scratch.js:150`, `:135`). The parser's own `Extract.truncated` still means "a per-message or message-count cap applied", which is a property of every large session and not a coverage event — it is not counted here, and no bullet mentions it |
| **B10 — `secret-revert-exhausted` quarantines minted after the commit** | **not** counted in B1. That path runs at `src/cli/dream.js:1150-1163`, after `promote()` has composed the report, and it already has its own dedicated console summary (`secretRevertSummaryLine`) and its own permanent digest banner. Do not reorder the run to reach it |
| **B11 — the input's name and shape** | `promote({… , runSkips})`, optional, consumed only by Table A's formatter. Absent, `undefined`, or malformed ⇒ no section (Table A's integers-only row). It is **not** `records`, for the reason Current state gives |

### Table C — canonical: the machine-run RED proofs (ADR-0042)

`scripts/red-proofs.js` requires the observed **own-body** failing set to EQUAL
the declaration's `expectRed`, so the suite's test identities are contract and are
decided here. **The declaration is INLINED IN FULL below**, because neither
`scripts/red-proofs.js` nor any shipped declaration is in the implementer's
reading set (CLAUDE.md: this spec plus the Deliverables files), so a semantic
description of a mutation is not something an implementer can turn into a valid
declaration. Copy the objects; do not re-derive them.

**Both identities pin the section by FULL-STRING equality against a hand-written
literal, never against the exported formatter's own output or a substring
`includes`.** That is the load-bearing decision here: an `includes` assertion
stays green under a reworded bullet, which is precisely the class of vacuity
ADR-0042 exists to catch. Each identity carries its band marker in every assertion
message it makes.

| # | Test identity — the exact top-level test name | Suite | Band marker | What it asserts |
|---|---|---|---|---|
| **T1** | `dream-promote: [RS-1] the six-count run-skip section renders byte-exact with its pointer` | `tests/unit/dream-promote.test.js` | `[RS-1]` | `runSkipSummarySection` over Table B's six counts set to 3, 191, 1, 2, 5, 4 equals the FULL hand-written string of the first worked example |
| **T2** | `dream-promote: [RS-2] a run-skip section with no quarantine count renders no pointer and no skipped` | `tests/unit/dream-promote.test.js` | `[RS-2]` | the same function over 0, 0, 1, 2, 5, 4 equals the FULL hand-written string of the second worked example, and the result contains neither `reports/warnings.md` nor `skipped` |
| **T3** | `dream-promote: [RS-3] the run-skip section reads every non-integer count as zero` | `tests/unit/dream-promote.test.js` | `[RS-3]` | Table A's integers-only row: a string, a float, `NaN`, `-1`, `undefined` and a crafted object each render as `0`; an all-zero call and a non-object argument each return `''`. **Every call in T3 leaves `oversized`, `newlyQuarantined` and `stillQuarantined` at 0 or non-integer** — `capacityDeferred` is the carrier that keeps a render non-empty — so T3 renders neither the oversized bullet nor the pointer, and is outside both proofs' `expectRed` |
| **T4** | `dream-promote: [RS-4] promote appends the run-skip section beneath the enforcement record` | `tests/unit/dream-promote.test.js` | `[RS-4]` | a `promote()` call carrying `runSkips` publishes a report whose accounting ends with the section, after the enforcement block, separated by one blank line. **Its fixture sets `capacityDeferred` alone**, so T4 renders neither the oversized bullet nor the pointer and is outside both proofs' `expectRed` |

**Two proofs, one declaration file** — one file per suite, which is what `suite`
being a top-level field means. Each proof's `criterion` is the acceptance
criterion it proves, so `rollUp` emits two lines for this WP.

*Provenance: on 2026-09-17 the author parsed this declaration and checked each
`find` against both worked examples rendered from a stub formatter — proof 1's
literal appears in the six-count render only, proof 2's in both — which is exactly
the `expectRed` set each declares.*

**Each proof's `find` string must occur EXACTLY ONCE in `src/core/dream/promote.js`**
(`occurrences: 1` is checked): the pointer sentence and the oversized bullet's
second sentence appear in the formatter's literals and nowhere else — do not
repeat either of them in a comment or a JSDoc example.

`tests/red-proofs/dream-report-run-skips.proofs.json`:

```json
{
  "suite": "tests/unit/dream-promote.test.js",
  "proofs": [
    {
      "id": "run-skip-pointer-pinned",
      "wp": "WP-dream-report-run-skips",
      "criterion": "2",
      "why": "the pointer sentence is the one line that promises a destination; an includes-style assertion would stay green under a reworded pointer, and only T1 renders it",
      "file": "src/core/dream/promote.js",
      "find": "Which sessions are being skipped, and why: reports/warnings.md in your vault.",
      "replace": "Which sessions are being skipped: see your vault. RP_MUT_RS_POINTER",
      "marker": "RP_MUT_RS_POINTER",
      "occurrences": 1,
      "testNamePattern": "\\[RS-",
      "expectRed": [
        { "test": ["dream-promote: [RS-1] the six-count run-skip section renders byte-exact with its pointer"], "signal": "[RS-1]" }
      ]
    },
    {
      "id": "run-skip-oversized-names-the-setting",
      "wp": "WP-dream-report-run-skips",
      "criterion": "3",
      "why": "the oversized bullet is the only place a permanently skipped session is named as permanent and the setting that unblocks it is named; both full-string identities render that bullet, so a mutation of it must redden both or one of them is not the pin it claims to be",
      "file": "src/core/dream/promote.js",
      "find": "Wienerdog will pass over them every night until the session file changes or you raise dream_max_input_bytes in config.yaml.",
      "replace": "They will be retried on the next run. RP_MUT_RS_OVERSIZED",
      "marker": "RP_MUT_RS_OVERSIZED",
      "occurrences": 1,
      "testNamePattern": "\\[RS-",
      "expectRed": [
        { "test": ["dream-promote: [RS-1] the six-count run-skip section renders byte-exact with its pointer"], "signal": "[RS-1]" },
        { "test": ["dream-promote: [RS-2] a run-skip section with no quarantine count renders no pointer and no skipped"], "signal": "[RS-2]" }
      ]
    }
  ]
}
```

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
table and a registered mirror disagree. A new mirror found in review is added here
on the spot.

- [ ] **Deliverables-table cells** — each row cites the table that decides it
      (`scratch.js` → Table B; `promote.js` → Tables A and B; `dream.js` → Table B;
      `dream-collect.test.js` → Table B; `dream-promote.test.js` → Tables A and C;
      `tests/integration/dream.test.js` → Table A; the proofs file → Table C)
- [ ] **Acceptance criteria** that assert Tables A, B and C, including criterion
      4's four `stillQuarantined` cases (row B7) and criterion 5's sum (row B8)
- [ ] **Verification commands** — the `node -e` section gate asserts Table A; the
      SKILL.md grep asserts Table A's last row; `npm run red-proofs` asserts Table C
- [ ] **Current-state description** — the five arms, the discarded
      `skip-quarantined` count, the single composed accounting block, why `records`
      is not the channel, and the two return paths that compose no report
- [ ] **The two worked examples under "Exact contracts"** — they are Table A
      rendered: the all-six case, and the quarantine-free case that carries no
      pointer
- [ ] **When the pointer line renders.** Table A's pointer row decides it — if and
      only if `newlyQuarantined` or `stillQuarantined` is non-zero — and its mirrors
      are Table A's Body, Lexical-scoping and Partial-case rows, the second worked
      example, the Context paragraph quoting ADR-0023 Amendment 2, the pointer
      acceptance criterion, the section gate's quarantine-free assertion, and Table
      C's T2. **No surface may tie the pointer to the heading, to "any non-zero
      count", or to any of B3–B6** — none of those arms produces a quarantine
      record, so `reports/warnings.md` cannot name them
- [ ] **What an oversized session is promised.** Table B row B3 and Table A's
      oversized bullet decide it — skipped again every night until the file, the
      package version or `dream_max_input_bytes` changes — and its mirrors are the
      Context paragraph naming the gap, both worked examples, the oversized
      acceptance criterion, Table C's second proof, and owner item 1. **No surface
      may promise that an oversized session is retried next run**
- [ ] **Where `stillQuarantined` comes from.** Table B row B2 decides it — the
      discovered files whose `selectState` answered `'skip-quarantined'` — and its
      mirrors are the `scratch.js` and `dream-collect.test.js` Deliverables rows,
      the Current-state bullet naming the discarded count, row B7, row B8, the
      four-case acceptance criterion, and the Out-of-scope bullet bounding the
      `scratch.js` change. **No surface may define it from the run-start ledger's
      active set**
- [ ] **What validates `runSkips`.** Table A's integers-only row decides it —
      nothing in `promote()` does, and the formatter reduces every non-integer to 0
      — and its mirrors are the Exact-contracts JSDoc, Table B row B11, the
      Implementation note pricing the alternative, and the integers-only acceptance
      criterion. **No surface may say `promote()` throws for a malformed `runSkips`**
- [ ] **Implementation notes** — the integers-only rule, the named residuals and
      the priced alternatives
- [ ] **Out of scope** — the `reports/warnings.md` renderer, the no-admission throw
      path, and the bound on the `scratch.js` change

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **Integers only.** The moment a session id or a basename enters this section, it
  needs the sanitizer, a length bound, and a review of what a filename can do to a
  markdown document — all of which `reports/warnings.md` already solved for the one
  place that carries names. This section counts, and points at that file for the
  sessions it can name.
- **Why the formatter lives in `promote.js` and not beside `secretRevertSummaryLine`
  in `ledger.js`.** Five of the six counts are collector outcomes and the sixth is a
  collector-computed reading of the ledger, so none of them is a fact the ledger
  module owns; and the report's other code-appended blocks are all composed by one
  composer in `promote.js`, which is what makes "the complete record cannot drift"
  a property rather than a hope. *Alternative priced:* `ledger.js` would put the
  formatter beside its precedent and make the `node -e` gate's `require` cheaper,
  at the cost of splitting the report's authorship across two modules and of giving
  `promote.js` a dependency on `ledger.js` that it does not have today (its gates
  are injected precisely so the module depends on nothing of the sort).
- **Why `promote()` does not validate `runSkips`.** Table A's integers-only row is
  the rule; the reason is the call site. `runSkips` arrives at `promote()` *after*
  the brain has run and, on the second-write arm, after the body has already been
  published; a throw there is caught at `src/cli/dream.js:968-981`, retains the
  workspace and fails the whole run. *Alternative priced:* fail loud like `records`
  does, which would catch a caller bug immediately at the cost of turning a
  mis-shaped accounting object into the loss of a night's consolidation. The
  accepted cost of the chosen rule is that a caller bug silently drops the section;
  the integration test is what catches it.
- **Named residual — the section describes the run up to the point the report is
  composed.** A `secret-revert-exhausted` quarantine minted after the commit is not
  in it (Table B row B10). That class has two dedicated surfaces of its own, and
  moving the report's composition to reach it would reorder the commit (ADR-0012:
  one dream run, one commit).
- **Named residual — a run that composes no report has nothing to append to.**
  Three such runs exist: the throw at `src/cli/dream.js:736-743`, the idle return at
  `:746-757` (which is also the adopt-with-history first run), and any run whose
  brain or gates fail before `promote()`. Table A's coverage row bounds the claim;
  their skips reach the user through `reports/warnings.md`, `wienerdog doctor`, the
  digest banner and — on the throw path — the run's own failure message and
  `alerts.jsonl` record.
- **Named residual — the pointer's neighbours.** With the oversized bullet present,
  a reader could take the pointer to cover it. The lexical-scoping row is the
  mitigation chosen over rewording the pointer; owner item 2 prices the alternative.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no identifier from this
      package reaches a filesystem path or a shell command.** The report's path is
      built from `layout.reports_dir` and the run's date exactly as it is today
      (`src/core/dream/promote.js:1082-1087`); this package adds no path construction.
- [ ] The surface this package touches is **a vault file that later feeds model
      context** (dream reports are snapshotted into routine staging directories by
      `src/core/vault-snapshot.js`). Containment: Table A's integers-only rule makes
      it structurally impossible for a filename, a path or a transcript byte to
      enter the appended section, mirroring `secretRevertSummaryLine`'s stated
      property. `composeRecord`'s fail-closed neutralisation check
      (`promote.js:769-775`) runs over the composed text including this section, so
      the containment has a second, independent enforcement.
- [ ] Three residuals, all named under Implementation notes: the post-commit
      exhausted class, the runs that compose no report, and the pointer's neighbours.

## Acceptance criteria

Numbered, because Table C's `criterion` fields reference them.

1. **All six bullets.** A run with every count in Table B non-zero appends exactly
   Table A's section, byte-exact as the first worked example, with the pointer line.
2. **The pointer's condition.** A section rendered with `newlyQuarantined` and
   `stillQuarantined` both 0 and any of B3–B6 non-zero is byte-exact as the second
   worked example: it contains no `reports/warnings.md` and no occurrence of
   `skipped`. Every combination with at least one quarantine count non-zero carries
   the pointer. *(Proved by Table C's first proof.)*
3. **The oversized promise.** The oversized bullet states that those sessions will
   be passed over every night until the session file changes or
   `dream_max_input_bytes` is raised, and names that setting. It never promises a
   retry next run. *(Proved by Table C's second proof.)*
4. **Each count is exact against Table B**, and a count of 0 omits its bullet while
   the others render unchanged in row order. **`stillQuarantined` is asserted on
   these four cases, which are what separate the selection reading from the
   run-start-ledger reading (row B7):** (a) an UNCHANGED prior quarantine is counted
   once, in `stillQuarantined` only; (b) a prior quarantine whose FINGERPRINT
   CHANGED and which this run consolidated successfully is counted in none of the
   six; (c) a prior quarantine whose fingerprint changed and which this run
   RE-QUARANTINED is counted in `newlyQuarantined` only, never in both; (d) a prior
   quarantine whose file no longer exists is discovered by nothing and is counted in
   none of the six. **Case (c) goes green under both readings for the wrong reason
   unless the double-count itself is asserted** — assert the sum, not only the
   individual counts.
5. **Disjointness (row B8).** On a run exercising all five collector exclusion arms
   at once **and** carrying at least one already-quarantined file,
   `entries.length` plus the six counts does not exceed the number of discovered
   files, and no discovered file contributes to two counts.
6. **The zero case.** A run with all six counts at 0 appends nothing: the report has
   no `## Sessions this run could not consolidate` heading and its other
   code-appended sections are byte-identical to before this change.
7. **Integers only.** The formatter renders `0` for every property that is not a
   non-negative safe integer (a string, a float, `NaN`, `-1`, `undefined`, a crafted
   object), returns `''` when every property reduces to 0, and returns `''` for a
   non-object argument. `promote()` does not throw for any of them.
8. **No identifier, ever.** No basename, path, session id or reason string appears
   anywhere in the appended section, for any input.
9. **Placement and delivery** — Table A's placement and delivery rows. The section
   is appended exactly once per run, last, one blank line after whichever
   accounting block precedes it; and on a run whose report write is refused it
   reaches the user through `report.record` and `src/cli/dream.js:1119-1131`, one
   line per element.
10. **The brain is untouched.** `skills/wienerdog-dream/SKILL.md` is not modified
    and is not told about the section.
11. **Re-running the dream** over an unchanged corpus does not duplicate the section
    in an existing day's report.
12. **Machine-run RED (ADR-0042).** `npm run red-proofs` reports `RUN: PROVEN` and
    its criteria roll-up carries two lines for this WP — `criterion 2` and
    `criterion 3` — each `PROVEN` and each naming its Table C proof id.
13. `npm test` and `npm run lint` pass. Every file under `tests/golden/` is
    byte-identical and none is edited.
14. Idempotence: **N/A — this WP ships no command and adds no write to a user
    machine.** It adds lines to a block the run already composes and writes once.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream-promote"
npm test -- --test-name-pattern "dream-collect"
npm test -- --test-name-pattern "dream-integration"
npm test
npm run lint
npm run red-proofs

# Table A gate — the section is byte-exact in both renders, empty at zero, carries
# no pointer and no "skipped" on a quarantine-free run, and is built from integers
# alone. Single-quoted JS literals throughout, which Table A's no-apostrophe row
# is what makes possible.
node -e "const {runSkipSummarySection:f}=require('./src/core/dream/promote.js');const bad=[];const B3='- 1 session transcript(s) are too big to dream over on their own. Wienerdog will pass over them every night until the session file changes or you raise dream_max_input_bytes in config.yaml.';const B4='- 2 session transcript(s) did not fit in what this run could take in, and will be retried on the next run.';const B5='- 5 session transcript(s) were not reached before the time this run had to prepare them ran out, and will be retried on the next run.';const B6='- 4 session transcript(s) were still being written while this run read them, and will be retried on the next run.';const HEAD='## Sessions this run could not consolidate';const PTR='Which sessions are being skipped, and why: reports/warnings.md in your vault.';const ALL=[HEAD,'','- 3 session transcript(s) were skipped for the first time this run.','- 191 session transcript(s) were already being skipped and were skipped again.',B3,B4,B5,B6,'',PTR].join('\n');const NOQ=[HEAD,'',B3,B4,B5,B6].join('\n');const full=f({newlyQuarantined:3,stillQuarantined:191,oversized:1,capacityDeferred:2,deadlineDeferred:5,readDeferred:4});if(full!==ALL)bad.push('the six-count section is not byte-exact: '+JSON.stringify(full));const noq=f({newlyQuarantined:0,stillQuarantined:0,oversized:1,capacityDeferred:2,deadlineDeferred:5,readDeferred:4});if(noq!==NOQ)bad.push('the quarantine-free section is not byte-exact: '+JSON.stringify(noq));if(noq.indexOf('reports/warnings.md')!==-1)bad.push('a quarantine-free section emitted the warnings pointer; none of those arms leaves a ledger quarantine, so that file cannot name them');if(noq.indexOf('skipped')!==-1)bad.push('the word skipped leaked outside the two quarantine bullets, so the pointer promise is no longer lexically scoped');if(/wienerdog doctor/.test(full))bad.push('the section names a second pointer; the enumeration has one home');if(f({newlyQuarantined:0,stillQuarantined:0,oversized:0,capacityDeferred:0,deadlineDeferred:0,readDeferred:0})!=='')bad.push('the all-zero case is not empty');if(f(undefined)!=='')bad.push('a non-object argument did not render empty');const hostile=f({newlyQuarantined:3,stillQuarantined:'../../etc/passwd',oversized:1.5,capacityDeferred:-1,deadlineDeferred:NaN,readDeferred:{toString(){return '9';}}});if(/passwd|1\.5|-1|NaN|9 session/.test(hostile))bad.push('a non-integer argument reached the output: '+JSON.stringify(hostile));if(hostile.indexOf('already being skipped')!==-1)bad.push('a non-integer count rendered its bullet instead of being read as 0');const partial=f({newlyQuarantined:3,stillQuarantined:0,oversized:0,capacityDeferred:0,deadlineDeferred:0,readDeferred:0});if(partial.indexOf('already being skipped')!==-1)bad.push('a zero count still rendered its bullet');if(partial.indexOf(PTR)===-1)bad.push('the pointer line is missing from a quarantine-bearing partial render');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('SKIP SECTION OK');"

# Table A gate — the dream skill is not told about the section. The `test -f`
# guard is required: a negated grep on a missing file exits 2 and the negation
# reads that error as success.
test -f skills/wienerdog-dream/SKILL.md && ! grep -q 'could not consolidate' skills/wienerdog-dream/SKILL.md
```

- The last two are NEW steps and each is an ASSERTION: it exits non-zero on
  failure rather than printing something a reader must judge. Observe and paste
  **all three states** for each — the deliverable ABSENT (delete
  `src/core/dream/promote.js`; delete `skills/wienerdog-dream/SKILL.md`), the
  deliverable VIOLATING (reword one bullet; make the all-zero case render a
  heading; tie the pointer to the heading so a quarantine-free run emits it; let
  `skipped` into a non-quarantine bullet; add the section to SKILL.md), and the
  compliant state — so a check that cannot fail is caught before anyone believes
  it.
- `npm run red-proofs` is the machine-run half (ADR-0042) and it is not a
  substitute for the three-state observation above: it proves two identities are
  non-vacuous, not that the gates can fail.
- **The `node -e` gate's own three states were observed by the author** against a
  stub exporting Table A's formatter, on 2026-09-17, before this spec was
  committed: compliant → `SKIP SECTION OK` exit 0; module absent → exit 1; and
  three separate mutations (the pointer tied to the heading, the all-zero case
  rendering a heading, one count read raw instead of as an integer) → exit 1 with
  the naming diagnostic. That establishes only that **the gate can fail**; the
  implementer still owes the three states against the real deliverable.

## Out of scope (do NOT do these)

- Naming any transcript in the report, in any form, including a truncated sample.
  The enumeration has exactly one home, `reports/warnings.md` (ADR-0023 Amendment 2).
- **Listing oversized sessions in `reports/warnings.md`.** That file is a pure
  render of the ledger's `files` records whose `outcome === 'quarantined'`
  (`src/core/dream/warnings.js:138-189`), and an oversized measurement is not a
  quarantine — ADR-0023 Amendment 3 introduces "no new quarantine reason" for it on
  purpose. Listing them would change `WP-quarantine-warnings-file`'s renderer, its
  rewrite trigger and its group table, and would need an ADR amendment first.
  **Nothing is filed for it**; owner item 3 states the recommendation.
- Changing the digest banner (`WP-quarantine-banner-decay`) or `doctor`'s output
  (`WP-doctor-quarantine-counts`).
- Reusing `promote()`'s `records` input for these counts — its members land in the
  enforcement section, and a fail-safe skip is not an enforcement event.
- **Anything on the no-admission throw path** (`src/cli/dream.js:736-743`): no new
  message, no new record, no attempt to write a report there. That path is
  ADR-0012's 2026-09-15 amendment and `WP-dream-filtered-input-budget`'s row A9.
- Reordering the run, moving the run's single commit, or adding a second one
  (ADR-0012).
- Any change to `skills/wienerdog-dream/SKILL.md` or to any prompt.
- Any change to `src/core/dream/scratch.js` **beyond the single added return field
  Table B row B2 names**: no change to `selectState`, to which files are selected,
  parsed, quarantined, deferred or skipped as oversized, to any existing returned
  field's shape, or to the ledger's on-disk schema. The addition is a count the
  function already has the information to produce and currently throws away.
- Re-opening ADR-0023's intake caps, Amendment 1, or Amendment 3's memo,
  admission, deadline or accounting rules.
- Changing the default value of `dream_max_input_bytes`. See Discovered issues.

## Discovered issues (routed, not this WP's work)

**The default `dream_max_input_bytes` is below the parser's worst-case single
extract, so the oversized arm can fire on a session that broke no rule.** The
default X is 8,000,000 bytes (ADR-0023 Amendment 3). The filtered extract the
collector measures is capped by `MAX_MESSAGES = 2000` and `MAX_MSG_CHARS = 4000`
(`src/core/transcripts/index.js:31-32`), so a maximally-capped session carries up
to 8,000,000 characters of message text **before** anything else: each message
also carries its JSON object scaffolding (`role`, `text`, `ts` keys and quoting,
tens of bytes each, so of the order of 10⁵ bytes over 2000 messages), a capped
message carries an appended `…[truncated N chars]` marker
(`src/core/transcripts/index.js:107-108`), the extract carries its own metadata
and optional `skill_invocations`, JSON escaping expands quotes and newlines, and
the measurement is `Buffer.byteLength` — **UTF-8 bytes, not characters**, so any
non-ASCII content multiplies its share. A long, dense session can therefore exceed
X while every individual cap held, and the outcome is that it is skipped every
night until the user raises a setting they were never told about. This package
makes that visible (Table A's oversized bullet) but does not fix it. **The fix is
a config-default and ADR question, not a report question** — either the default X
rises above the parser's worst case, or the caps fall below it, or the collector
admits a single oversized extract alone rather than skipping it — and each
re-opens ADR-0023 Amendment 3's A1–A4, which are owner-ratified. It needs its own
work package and its own ADR amendment; nothing is filed here.

## Dispatch precondition — owner items

Three items. Each carries a recommendation and the cost of overruling it. **None
of them is decided**: nothing in this repo records the owner accepting any of
them, and this spec asserts no such acceptance.

1. **Which arms does the report count, and how honest is the oversized bullet?**
   *Recommendation: all six of Table B, one bullet each, and the oversized bullet
   says plainly that those sessions will keep being passed over every night and
   names `dream_max_input_bytes`* (its exact wording is Table A's; the word
   *skipped* is reserved to the two quarantine bullets, per Table A's
   lexical-scoping row). The alternative shapes are (a) four bullets, merging
   B4–B6 into one "will be retried next run" line — the promise is identical for
   all three, but the user loses the cause, and with it which setting, if any, is
   the knob; and (b) leaving oversized out, which keeps the section at five
   bullets and leaves the one permanently-skipped class with no durable surface at
   all, which is the gap the integration review recorded.
   *Cost of overruling toward (a):* two counts become invisible at exactly the
   moment the run tells the user something is missing; the console lines that
   distinguish them go to a job log. *Cost of overruling toward (b):* this package
   ships without closing the recorded gap and a follow-up WP re-opens the same
   formatter, the same tests and the same proofs file.
   **Identifiers: checked, and the rule is not where it was cited.** ADR-0023
   Amendment 3 does **not** contain the "no session IDs or paths" prohibition; the
   sentence is in **ADR-0012's 2026-09-15 amendment** — "The CLI reports separate
   nonzero counts … New diagnostics contain no transcript text, session IDs or
   paths" — and its subject there is the **CLI**, mirroring
   `WP-dream-filtered-input-budget` row A9. **So the letter of that rule does not
   reach a vault report.** What does reach it is ADR-0023 Amendment 2's one-home
   principle ("the full enumeration has exactly ONE home — the vault warnings
   file. Every other surface … carries exact counts plus a pointer to it, and never
   a list"), which this package obeys, plus Table A's own integers-only rule. The
   net effect is the same — no id, no path, no basename — but the authority is
   Amendment 2, and this spec cites it rather than the CLI rule.
2. **Does the pointer line need rewording now that it has non-quarantine
   neighbours?** *Recommendation: no — keep it byte-identical to the shipped text
   and scope its promise lexically instead* (Table A's lexical-scoping row: only
   the two quarantine bullets and the pointer use the word *skipped*). The text is
   already shared with the digest banner's "Which ones, and why: reports/warnings.md
   in your vault", so changing it here would give one promise two wordings.
   *Cost of overruling:* the pointer's text changes in this package only, the banner
   and the report then say the same thing differently, and Table C's first proof and
   both full-string identities are rewritten against the new literal.
3. **Should `reports/warnings.md` list oversized sessions now that they leave a
   ledger-side memo?** *Recommendation: no — out of scope, and nothing is filed.*
   The memo is deliberately *not* a quarantine (ADR-0023 Amendment 3, "no new
   quarantine reason"); the file's contract is "a pure, stateless render of the
   ledger … one section, *Current conditions* (what is in quarantine now, grouped
   by reason)" (Amendment 2). Listing a non-quarantine there would change that
   file's subject, its group table, its rewrite trigger and `doctor`'s counts, and
   would need an ADR amendment before a WP.
   *Cost of overruling:* a new work package against `src/core/dream/warnings.js`
   and an ADR-0023 amendment, and this package's pointer row must then be
   re-decided, because the pointer would newly be able to promise the oversized
   bullet's sessions too.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) The three owner items above are answered, and the
   answers are applied to this spec by a committed revision — never by a dispatch
   message, because `scripts/boundary-check.js` reads the Deliverables table in this
   file and nothing a message says changes what CI sees. (b) This spec is `Ready`,
   which only the design-review loop or the owner may make it
   (`docs/runbooks/codex-review.md`). (c) `WP-dream-filtered-input-budget` is merged
   on `main` — PR #245, this spec's base `b4af715e` — though its own spec still
   reads `In-Review` pending a done-flip; every citation below is against that SHA
   and is re-checked if this package is dispatched after further collector work.
1. All verification steps pass locally; output pasted into the PR body, including
   the three-state evidence for each new gate and the `red-proofs` roll-up.
2. Conventional commits; PR titled
   `feat(dream): account for a run's skipped sessions in its report (WP-dream-report-run-skips)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
