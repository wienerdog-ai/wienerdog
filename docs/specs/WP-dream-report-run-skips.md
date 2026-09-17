---
id: WP-dream-report-run-skips
title: Make the dream report account for the sessions a run could not consume
status: Ready
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
> re-derived against `main` at `a47f2546` (2026-09-17). The previous revision's
> PROVISIONAL mechanism is **discharged and removed**: the promotion rewrite it
> was waiting for has landed, so the Deliverables table below names real files at
> a real SHA and carries no markers. Five design questions that this
> re-derivation could not settle alone are parked under **Dispatch precondition —
> owner items**; three measured gaps are routed under **Discovered issues**.
>
> **2026-09-17 — RE-PINNED TO `a47f2546`. MECHANICAL RE-PIN, NO CONTRACT CHANGE.**
> The two sibling packages queued into `src/cli/dream.js` ahead of this one have
> landed (PR #253, PR #257), so the one re-pin Definition of done item 0(d) required
> before dispatch has been done: **29 `src/cli/dream.js` citations were re-located
> by finding each construct, never by applying an offset, and both ends of every
> range were checked against the code.** Nothing else moved — no Deliverables row,
> no contract table, no acceptance criterion, no byte-exact text, no verification
> command, no RED declaration. Every construct this spec names still exists and
> still behaves as the spec says; the files the other citations point into are
> byte-identical. The method, the before/after table and the interaction check are
> in `docs/specs/logbook/2026-09-17-report-run-skips-repin.md`. **`status` stays
> `Ready` on exactly that basis.**
>
> **2026-09-17 — DESIGN GATE CLOSED AT ROUND 4; `Ready`.** Five review passes ran
> on this spec: round zero (template conformance, 2 findings), rounds 1 and 2
> (`gpt-5.6-sol` via `codex exec`, 6 and 2), and rounds 3 and 4 (`gpt-6-astra` via
> the Codex plugin, 2 and **0 — approve**). **Twelve findings, all dispositioned,
> none dropped.** Every raw result was committed **before** adjudication —
> `07b29692`, `38307bef`, `95a968d1`, `e54b30dc` — and the dispositions are
> recorded finding by finding in
> `docs/specs/logbook/2026-09-17-report-run-skips-design-review.md`. Round 3 is
> worth knowing about before you build: a second model, **executing** the collector
> rather than reading it, found two user-visible sentences that two prior rounds had
> passed — a deferral bullet promising a retry for a session the collector will pass
> over from its memo, and a quarantine bullet claiming a first-ever skip for a
> session quarantined before. Round 4 re-ran those same cases and approved. **Nothing
> in this spec records the owner approving, accepting or ratifying anything** — the
> five owner items below are recommendations adopted under standing authorization,
> each with its overrule cost, each reversible by dated amendment.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** This package adds counted lines to a
markdown file the dream already writes **on the runs that write one**. No process,
no state, no new command, and no write on a run that writes nothing today.

The nightly **dreaming** job consolidates the user's **transcripts** into the
**vault**. A run that **admits at least one session** writes a **dream report** at
`<reports_dir>/<YYYY-MM-DD>.md` (`reports/dreams/` by default) — the
human-readable account of what the run did. **Not every run writes one, and that
bound is load-bearing for this whole package:** the report exists only on a real,
non-dry run that admitted at least one session and reached `promote()`. A run that
admitted nothing writes no report at all — it either throws or returns idle — and
Table A's coverage row is where that is decided and stated path by path. Its body
is authored by the brain (the model); `promote()` then appends the run's own
code-owned accounting beneath it, in one composed block
(`src/core/dream/promote.js:706-777`). The brain is told, in
`skills/wienerdog-dream/SKILL.md:410-424`, that it writes the candidate-level
accounting and that the orchestrator appends the rest.

**What the report does not say: what the run could not read.** A **mixed** run —
one that consolidated some sessions and so wrote a report, while skipping 191
others — produces a report that does not mention the 191. (A run that skipped
those 191 and admitted *nothing* writes no report at all; that is the harder case,
and it stays out of scope here — Table A's coverage row, owner item 4.) Since
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
`dream_max_input_bytes` — is passed over on **every** run for as long as the
ledger's memo of its measurement stays valid, and that memo is invalidated only by
a change to the source file or to the running package version; a raised
`dream_max_input_bytes` releases it only if the new limit reaches the measured
size, and any of those three merely earns it a fresh measurement, which may find
it oversized again (**Table B row B3**, from ADR-0023 Amendment 3). Its only
surface today is a console count on `stdout` of a scheduled job. That is the gap
the integration review recorded, and Table A's oversized bullet is what closes it
— in the report, and only for runs that write one (Table A's coverage row).

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
describes **one run**: what *that night* could not see — **on the nights that
wrote a report**. The dream reports are the vault's build history, and a permanent
gap in coverage should be discoverable a month later from the report of a night
that had one. A night that consolidated nothing left no page of that history to
write on, which is the residual this package names rather than closes.

**The section is code-owned and built from integers alone.** No basename, no
path, no reason string, no session id. The precedent is `secretRevertSummaryLine`
(`src/core/dream/ledger.js:498-509`), whose comment states the property directly:
every argument that is not a non-negative safe integer renders as `0`, "which is
what makes it STRUCTURALLY impossible for a basename, a path or a matched value
to enter this line". The names live in `reports/warnings.md` — the enumeration's
one home — and this section counts, and points there for the sessions that file
actually holds (Table A's pointer row).

## Current state

**Re-derived against `main` at `a47f2546` (2026-09-17), and every `src/cli/dream.js`
citation below was RE-LOCATED at that SHA, not offset.** The two sibling packages
this spec was waiting on have landed in that file — `WP-dream-lock-stale-owner-loud`
(PR #253) and `WP-dream-digest-omits-own-job-alerts` (PR #257) — so the precondition
that they land first is **discharged**. Twenty-nine citations moved; the constructs
themselves did not, and both ends of every range were checked against the code
(`docs/specs/logbook/2026-09-17-report-run-skips-repin.md` carries the before/after
table and the method). `src/core/dream/promote.js`, `scratch.js`, `ledger.js`,
`warnings.js`, `src/core/transcripts/*` and `skills/wienerdog-dream/SKILL.md` are
**byte-identical** across that range, so every citation into them is unchanged.

**What the two siblings added to `src/cli/dream.js`, and why none of it reaches
this package.** #253 added a `STALE_LOCK_ALERT_MS` constant, rewrote the exit-code
doc comment and added a throw in the lock-acquisition block — all before the
collector runs. #257 added `supervisingDreamJob`, `withoutOwnJobAlerts`, a
`startedAt` first statement, a per-call flag on `regenerateDigest`, and **one new
final statement, `regenerateDigest({ omitOwnJobAlerts: true })` at `:1320`**, which
runs after the commit and after the workspace teardown, writes
`<state>/digest.md` and nothing else, and closes over `ledger` — never `sel`, never
`res`. It cannot affect the report this package writes. `sel` is still declared at
`:708` and still in scope at the `promote()` call at `:1053`, so every count Table B
names is available where the section is composed.

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
  extract onto `readDeferred` and continues to older candidates. **`runExhausted`
  is the collector's only evidence here, and the reader under-reports it:**
  `streamLines` declares exhaustion only when `bytesConsumed < sizeBytes` and
  `sizeBytes` is the DISCOVERY size (`src/core/transcripts/stream.js:71`,
  `:129-138`), so a file that grew past the allowance mid-read comes back as a
  complete read. Row B6 defines the count accordingly and claims no coverage; the
  reader defect is routed under Discovered issues and is not this package's work.
- **Oversized.** `:102-105` (a matching ledger memo, `cached: true`) and
  `:119-123` (a fresh measurement, `cached: false`) push onto `oversized` and
  continue. The fresh arm also writes the memo into the returned
  `oversizedExtracts` map, which `src/cli/dream.js:713-716` folds into the ledger
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

- `src/cli/dream.js:708-710` calls the collector; `sel` stays in scope through the
  whole run, including the `promote()` call at `:956-967`.
- `:780-797` builds `exclusions[]` — one console line each for `sel.deferred`,
  `sel.deadlineDeferred`, `sel.oversized` and `sel.readDeferred`, printed only
  when non-zero, counts only. **`exclusions` carries no quarantine count**, and
  that one fact decides which branch a quarantine-only run takes below.
  `sel.newlyQuarantined` gets its own per-file console line at `:802-809`.
  **Nothing prints a still-quarantined count anywhere.**
- `:818-829` — a run with new quarantines records them, rewrites the digest and
  calls **refresh point 1** for `reports/warnings.md` (`:826`). This is the **only**
  refresh that happens before `promote()`, and it happens only when
  `sel.newlyQuarantined.length > 0`; refresh point 3 (`:852`) is on the idle path
  that returns, and refresh point 2 (`:1284`) runs after the commit. That ordering
  is what Table A's pointer row and its residual are measured against.
- `:833-840` — **if `sel.entries.length === 0` and any exclusion fired, a real run
  THROWS** `WienerdogError('dream: no complete session was admitted. …')` carrying
  every exclusion line. No brain, no `promote()`, **no dream report at all** on
  that path.
- `:843-854` — if `sel.entries.length === 0` with no exclusions, the run prints
  `wienerdog: nothing new to dream.`, refreshes `reports/warnings.md` and returns.
  **This is also where the adopt-with-history first run now returns, and where
  EVERY quarantine-only run returns** — however many sessions it quarantined or
  skipped — because the branch above it tests `exclusions`, which holds no
  quarantine count. It writes no report either.
- **Therefore the report section this package adds only ever renders on a run that
  admitted at least one session, and the quarantine counts are exactly what the
  other paths lose.** Table A's coverage row owns that boundary and states, per
  path, what is carried and what is not.

### The report's code-appended accounting

- `promote()` composes the run's accounting **once**, in `composeRecord`
  (`src/core/dream/promote.js:706-777`): `## Refused by policy (promotion
  enforcement)` always, then `## Redacted in place (secret scan)` and
  `## Preserved copies (secret quarantine)` when non-empty (headings at `:584-591`).
  The composed lines become one buffer at `:1563` and reach the vault through
  exactly one write — the second write on the published-body arm (`:1585-1591`) or
  Table R's fallback (`:1637-1647`).
- The same lines travel back to the caller as `report.record` on **every** arm, and
  `src/cli/dream.js:1216-1228` prints them when the vault did not get them. **A
  section composed inside `composeRecord` inherits that delivery for free.**
- `composeRecord` ends with a fail-closed neutralisation check over the whole
  composed text (`:769-775`). An integers-only section is a fixed point of it.
- `promote()` already takes `records?: Array<{path, reason}>` for "code-owned
  accounting the CALLER produced before promotion" (`:855-860`, validated at
  `:1027-1035`). **That field is not this package's channel**: its members land
  under the enforcement heading, whose subject is a policy violation. A skipped
  transcript is not a violation, and filing it there would misreport a correct
  fail-safe skip as an enforcement event.
- **Nothing reserves those headings.** `ENFORCEMENT_HEADING`, `REDACTION_HEADING`
  and `PRESERVED_HEADING` appear only where they are emitted (`:708`, `:737`,
  `:751`); no code scans the candidate body for them, strips a previous code-owned
  block or dedupes one. So a brain-authored copy of any of them survives into the
  published body, and a second run on the same date appends a second accounting
  block (`:1571-1576` appends to this run's published bytes; `:1637-1647` appends to
  whatever is on disk). Table A's ownership row applies the same (absent) rule to
  the new heading.
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
| modify | src/cli/dream.js | build the six integers **Table B** names from `sel` and pass them to `promote()`; nothing else in the run changes. **Its `:NNN` citations are pinned to `a47f2546` and were re-located there on 2026-09-17**, after both queued siblings landed (Current state); re-derive them again only if something else lands in this file first |
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

- 3 session transcript(s) were set aside by this run and will be skipped from now on, until they change.
- 191 session transcript(s) were already being skipped and were skipped again.
- 1 session transcript(s) are too big to dream over on their own. Wienerdog will keep passing over them until the session changes, until Wienerdog is updated, or until dream_max_input_bytes in config.yaml is raised past their size; after any of those it measures them again, and may still find them too big.
- 2 session transcript(s) were not reached, because this run had already taken in as much as it could. Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.
- 5 session transcript(s) were not reached, because this run ran out of time to prepare them. Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.
- 4 session transcript(s) were still being written while this run read them. Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.

Which sessions are being skipped, and why: reports/warnings.md in your vault.
```

Second worked example — a run with **no quarantine counts** (`newlyQuarantined` 0,
`stillQuarantined` 0, `oversized` 1, `capacityDeferred` 2, `deadlineDeferred` 5,
`readDeferred` 4) renders exactly:

```markdown
## Sessions this run could not consolidate

- 1 session transcript(s) are too big to dream over on their own. Wienerdog will keep passing over them until the session changes, until Wienerdog is updated, or until dream_max_input_bytes in config.yaml is raised past their size; after any of those it measures them again, and may still find them too big.
- 2 session transcript(s) were not reached, because this run had already taken in as much as it could. Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.
- 5 session transcript(s) were not reached, because this run ran out of time to prepare them. Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.
- 4 session transcript(s) were still being written while this run read them. Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.
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

### Contract table(s)

Three dense contracts, one canonical table each, named rather than left unnamed so
a row is addressable by letter across this package's surfaces: **Table A** (the
emitted section), **Table B** (the six counts) and **Table C** (the RED proofs).
Operative prose cites the table and row rather than restating it.

#### Table A — canonical: the emitted section

| Fact / rule | Value |
|---|---|
| Heading | `## Sessions this run could not consolidate` |
| Body | one bullet per **non-zero** count, in Table B's row order, each byte-exact as the first worked example shows; then, **only when the pointer row below says it renders**, a blank line and that pointer line byte-exact |
| **Pointer line — the text, and the ONLY condition under which it renders** | The text is byte-exact `Which sessions are being skipped, and why: reports/warnings.md in your vault.` It renders **if and only if `newlyQuarantined` or `stillQuarantined` is non-zero** — it rides the two QUARANTINE counts and nothing else. **Why no other count may carry it:** `reports/warnings.md` is a render of the ledger's *active quarantines* (`src/core/dream/warnings.js:138-189`), and none of the other four arms produces a quarantine record — ADR-0023 Amendment 3 states outright that the new exclusion causes introduce "no new quarantine reason", and Amendment 2 already rules that a count the file cannot name "travels without a pointer". Pointing a quarantine-free report there sends the user to a file containing none of the events the report just counted. **One pointer, not two** — `wienerdog doctor` is never named here: it reports the same counts this section just gave, and only `reports/warnings.md` answers "which ones". **The condition is the two counts and nothing else, and what that costs is stated rather than hidden:** the run cannot confirm from here that the file it points at is current, so the pointer can name a file that is missing or one run stale. Named residual under Implementation notes; owner item 5. **No surface may add a further condition to this row without moving the row** |
| **Lexical scoping of the pointer's promise** | The word **skipped** appears in the two quarantine bullets and in the pointer line, **and nowhere else in the section** — the other four bullets say *pass over*, *did not fit*, *were not reached* and *were still being written*. That is what makes the pointer readable as a promise about exactly the bullets it rides on, in a section where the four other conditions are also, in plain English, "skips". It is asserted directly: a section rendered with the two quarantine counts at 0 contains no occurrence of `skipped` |
| Zero case | all six counts 0 → the function returns `''` and **nothing is appended** — no heading, no "none" line. This section is news; a run with nothing to report says nothing |
| Partial case | a count of 0 omits its bullet and the remaining bullets render unchanged, in Table B's row order. The pointer line does **not** follow the heading — it follows the pointer row's condition |
| Built from integers alone | every property of `counts` that is not a non-negative safe integer renders as `0`; `counts` itself may be `undefined` or any non-object and the result is then `''`. No basename, no path, no reason string, no session id reaches this section — the names live in `reports/warnings.md`, the enumeration's one home. **`promote()` performs NO validation of `runSkips`** and never throws for it: this input arrives after the brain has run and after the body has published, and a caller bug must cost the section, never the run's consolidation. That is the opposite of the `records` input's fail-loud rule (`promote.js:1027-1035`), deliberately; Implementation notes price the alternative. **The guard is ONE rule in two formatters, byte-identical:** the reduction is written exactly as `secretRevertSummaryLine` writes it (`src/core/dream/ledger.js:500`) — `` `const int = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);` `` — so the two cannot drift, and so Table C's third proof has a literal to mutate. `Number.isSafeInteger` is the predicate and no coercion precedes it: a float, a numeric string and a value above `Number.MAX_SAFE_INTEGER` each reduce to `0`, never to a floor or a parse |
| No apostrophe | no `'` appears anywhere in the section's text, so the whole of it can be pinned in single-quoted JavaScript inside a double-quoted shell string. That is a property of the shipped wording, and the verification gate depends on it |
| Placement in the report | composed inside `composeRecord` and appended **last** — after the enforcement block, which always renders, and after the redaction and preserved-copy blocks when they render — separated from whichever precedes it by exactly one blank line, exactly once per run. Last because the other blocks are about what the run refused to WRITE and this one is about what it could not READ |
| **Coverage boundary — which runs carry the section, and what the others carry instead** | **A report exists only when `promote()` runs, and `promote()` runs only on a real run that admitted at least one session** (`sel.entries.length > 0`, past the dry-run return). This row states the other paths TRUTHFULLY rather than claiming they are covered elsewhere. **(a) The idle path** (`entries.length === 0`, no exclusion — `src/cli/dream.js:843-854`) prints one line, `wienerdog: nothing new to dream.`, refreshes `reports/warnings.md`, and returns. **Every quarantine-only run takes this path**, because `exclusions` never contains a quarantine count (`:780-797` builds it from B3–B6 alone): so on a run whose only event was quarantine, **B1 is observable only as the number of per-file console lines at `:802-809`, and B2 is not emitted anywhere at all**. **(b) The throw path** (`entries.length === 0`, some exclusion — `:833-840`) raises a `WienerdogError` whose message carries the **B3–B6 counts and no quarantine count**; the scheduled path records that failure in `alerts.jsonl` for the digest banner. **(c) Dry runs** (`:862-865`) and **(d) runs whose brain or gates fail before `promote()`** write no report either. **What the standing surfaces do and do not replace:** `reports/warnings.md`, `wienerdog doctor` and the digest banner carry the ledger's quarantine set **as it stands**, which is not this run's B1/B2 and cannot be read as them. **This package adds nothing to paths (a)–(d)** — closing them needs a report on a path that writes none, or a change to the failure message, each its own package. Named residual under Implementation notes; owner item 4 |
| **Ownership of the heading — none, and that is the existing rule, not a new one** | **`composeRecord` reserves nothing.** Its three shipped headings (`promote.js:584-591`) are only ever EMITTED: nothing scans the brain's candidate body for them, nothing strips a prior code-owned block, and nothing dedupes. So a candidate body that itself contains `## Refused by policy (promotion enforcement)` publishes unchanged and the code section is appended under it, and a **second run on the same date** appends a second copy of the whole accounting block beneath the first (the second write appends to `reportBody.bytes`; Table R's fallback appends to whatever is on disk — `promote.js:1571-1576`, `:1637-1647`). **This package applies the SAME rule to `## Sessions this run could not consolidate`: no reservation, no marker, no dedupe, no new mechanism.** Introducing ownership for this heading alone would leave the three shipped ones unowned and put two rules in one composer. The behaviour is pinned by fixtures rather than changed (acceptance criterion 11); the shared gap is a named residual under Implementation notes and is routed under Discovered issues |
| Delivery when the vault refuses the write | none of the above changes. The section is part of `report.record`, so on `report.outcome === 'refused'` and on `promoted` with `accounting.published === false` it reaches the user through `src/cli/dream.js:1216-1228` exactly like the enforcement record |
| The brain is not told about it | `skills/wienerdog-dream/SKILL.md` is **not** a deliverable. The model does not author this section, and telling it the section exists invites it to write one |

#### Table B — canonical: the six counts, their sources and their order

Row order is render order.

| # | Count | Definition | Source in `src/cli/dream.js` at `a47f2546` |
|---|---|---|---|
| B1 | `newlyQuarantined` | **transcripts THIS RUN decided to quarantine** — those whose `selectState` answered `'select'` and which then went over the pre-read ceiling (`scratch.js:58`) or came back with a non-`ok` parse outcome (`:111`). **NOT "for the first time ever", and no surface may say so:** a prior quarantine whose fingerprint changed is re-selected (`ledger.js:242`, `// the file changed → reprocess`) and, if it fails again, lands here again — measured and reproduced by the confirming design round. The bullet therefore states this run's decision and its consequence, never the session's history | `sel.newlyQuarantined.length` |
| B2 | `stillQuarantined` | **the transcripts this run ACTUALLY skipped for an existing quarantine** — the discovered files for which `selectState` returned `'skip-quarantined'`, counted at selection time. **Not** the run-start ledger's active-quarantine count; row B7 says why that is a different number | `sel.skippedQuarantined` — **a new integer `collectExtracts` returns**, computed from the same `discovered` array and the same `selectState` call that already partitions candidates (`src/core/dream/scratch.js:54`) |
| B3 | `oversized` | transcripts whose own filtered extract exceeds `dream_max_input_bytes`, measured this run or read from the ledger's `oversizedExtracts` memo. **CANONICAL for what the bullet may promise (ADR-0023 Amendment 3):** the memo is consulted only after ledger eligibility and the discovery ceiling pass, and it permits skipping the parse **only while the measured size exceeds the CURRENT X** — so exactly three things release the session, and none of them is a retry next run: **(i)** the source file's fingerprint changes, **(ii)** the running `package.json.version` changes, **(iii)** X is raised **to or past the measured size** (a smaller rise changes nothing). Each of the three earns a **fresh parse and measurement**, whose outcome may be oversized again. A parser change therefore only helps by riding (ii) | `sel.oversized.length` |
| B4 | `capacityDeferred` | the capacity stop's unvisited remainder — candidates never visited because the run had taken in as much as it could. **No QUARANTINE record is written, so ordinary eligibility lets the next run consider them again — but "considered" is ALL the bullet may promise** (row B12 says why) | `sel.deferred.length` (`sel.dropped` is the same array; `sel.droppedForSize` its length) |
| B5 | `deadlineDeferred` | the preprocessing deadline's unvisited remainder. Same rule as B4 in every respect: no quarantine record, no promise beyond being considered again (row B12) | `sel.deadlineDeferred.length` |
| B6 | `readDeferred` | **the number of transcripts THIS RUN'S COLLECTOR CLASSIFIED as read-deferred** — those for which `parseWithOutcome` reported `runExhausted`, whose partial extract is discarded. No QUARANTINE record; the next run considers it again and re-parses it, which may then measure it oversized — so its bullet carries row **B12**'s promise, not a retry guarantee. **This is a count of a classification, not a claim of coverage, and the direction of the error is stated:** the reader declares exhaustion only when `bytesConsumed < sizeBytes`, and `sizeBytes` is the DISCOVERY size (`src/core/transcripts/stream.js:71`, `:129-138`), so a file that grew past the per-session allowance after discovery reads partially with `runExhausted` **false** and is never classified here. B6 can therefore **UNDER-count, and cannot over-count**: every transcript it counts really was an incomplete read with unread bytes, so a non-zero B6 never states something false. That reader behaviour is a pre-existing collector defect, routed under Discovered issues; **this package must not claim exact coverage for B6 and must not depend on a fix**. **The byte-exact bullet is UNCHANGED and stays true under this reading** — checked in round 2: it speaks only of the transcripts it counts ("N session transcript(s) were still being written while this run read them"), never of all of them, so an under-count makes it say less, never something false | `sel.readDeferred.length` |

| Fact / rule | Value |
|---|---|
| **B12 — CANONICAL: what a deferral bullet may promise, and why it is not a retry** | **A stop classifies the WHOLE unvisited remainder before any oversized memo is consulted, and the memos survive.** `collectExtracts` prunes the prior memos into `oversizedExtracts` before the admission loop (`scratch.js:66-74`, whose comment states it: "Valid unvisited records survive either admission stop"), and inside the loop the capacity check (`:91-94`) and the deadline check (`:95-98`) both `deferRemaining(...)` and `break` **before** the memo is read at `:101-105`. So a session that is memoised as individually oversized, sitting behind either stop, is counted in B4 or B5 this run — and on the next run is passed over from its memo without ever being parsed. Reproduced by the confirming design round with read-only probes against the real collector. **Consequences, and they bind every surface:** (a) **no bullet for B4, B5 or B6 may say "will be retried on the next run"** or otherwise promise the session gets dreamed over — the honest promise is that Wienerdog will *consider* it again, with the oversized outcome named as possible; (b) **"no ledger record" is FALSE for these counts and must not be written** — what is true is "no QUARANTINE record"; an `oversizedExtracts` memo may exist for any of them, and for a memoised one it does. B6 carries the same rule: a read-deferred session is re-parsed next run and may then measure oversized |
| **B7 — why `stillQuarantined` is NOT the run-start set's size** | because a prior quarantine whose file CHANGED is re-selected: `selectState` compares the record's fingerprint and answers `'select'` when it differs (`src/core/dream/ledger.js:242`), and the sticky `secret-revert-exhausted` arm (`:239-241`) is the only quarantine that ignores the fingerprint. Three miscounts follow from the run-start reading and all three are gone under the selection reading: **(a) double-counting** — a changed prior quarantine re-quarantined this run lands in B1 AND in the run-start set; **(b) a false skip** — a changed prior quarantine consolidated successfully this run is still reported as skipped again; **(c) a phantom** — a prior quarantine whose file was deleted is no longer discovered, was skipped by nothing, and is still counted. The report is durable, so each preserves a false coverage story for as long as the vault lives |
| **B8 — disjointness, and the construction that gives it** | every discovered file takes exactly one `selectState` outcome (`ledger.js:228-257`, a total function over three values). `'skip-quarantined'` → B2. `'skip-processed'` → counted nowhere, by design: a consolidated transcript is not a skip. `'select'` → exactly one collector arm, because every arm either `continue`s or `break`s (Current state, "The collector"), and a `deferRemaining` stop is followed immediately by `break` so a file cannot be both visited and part of a remainder. Over-ceiling candidates never enter the admission loop at all. ADR-0023 Amendment 3 states the same partition normatively: "These categories and quarantine are disjoint; ledger-skipped files are outside them." **Consequence, asserted directly:** `entries.length` plus the six counts never exceeds the number of discovered files, and no file contributes to two |
| **B9 — there is no truncation count, and there cannot be one** | budget-induced suffix truncation is retired. `sel.truncated` is the literal `[]` and every entry's `truncatedToFit` is the literal `false` (`src/core/dream/scratch.js:150`, `:135`). The parser's own `Extract.truncated` still means "a per-message or message-count cap applied", which is a property of every large session and not a coverage event — it is not counted here, and no bullet mentions it |
| **B10 — `secret-revert-exhausted` quarantines minted after the commit** | **not** counted in B1. That path runs at `src/cli/dream.js:1247-1260`, after `promote()` has composed the report, and it already has its own dedicated console summary (`secretRevertSummaryLine`) and its own permanent digest banner. Do not reorder the run to reach it |
| **B11 — the input's name and shape** | `promote({… , runSkips})`, optional, consumed only by Table A's formatter. Absent, `undefined`, or malformed ⇒ no section (Table A's integers-only row). It is **not** `records`, for the reason Current state gives |

#### Table C — canonical: the machine-run RED proofs (ADR-0042)

`scripts/red-proofs.js` requires the observed **own-body** failing set to EQUAL
the declaration's `expectRed`, so the suite's test identities are contract and are
decided here. **The declaration is INLINED IN FULL below**, because neither
`scripts/red-proofs.js` nor any shipped declaration is in the implementer's
reading set (CLAUDE.md: this spec plus the Deliverables files), so a semantic
description of a mutation is not something an implementer can turn into a valid
declaration. Copy the objects; do not re-derive them.

**Every identity pins its render by FULL-STRING equality against a hand-written
literal, never against the exported formatter's own output and never by a
substring `includes` — T3 included.** That is the load-bearing decision here: an
`includes` assertion stays green under a reworded bullet, and a
forbidden-token scan stays green under a formatter that FLOORS `1.5` to a
plausible `1` — the exact vacuity round 1 measured in the previous revision's
inline gate. Enumerate the expected output, never the outputs you would object
to. Each identity carries its band marker in every assertion message it makes.

| # | Test identity — the exact top-level test name | Suite | Band marker | What it asserts |
|---|---|---|---|---|
| **T1** | `dream-promote: [RS-1] the six-count run-skip section renders byte-exact with its pointer` | `tests/unit/dream-promote.test.js` | `[RS-1]` | `runSkipSummarySection` over Table B's six counts set to 3, 191, 1, 2, 5, 4 equals the FULL hand-written string of the first worked example |
| **T2** | `dream-promote: [RS-2] a run-skip section with no quarantine count renders no pointer and no skipped` | `tests/unit/dream-promote.test.js` | `[RS-2]` | the same function over 0, 0, 1, 2, 5, 4 equals the FULL hand-written string of the second worked example, and the result contains neither `reports/warnings.md` nor `skipped` |
| **T3** | `dream-promote: [RS-3] the run-skip section reads every non-integer count as zero` | `tests/unit/dream-promote.test.js` | `[RS-3]` | Table A's integers-only row, **by full-string equality on each render, never by scanning for forbidden tokens**: a string, a float, `NaN`, `-1`, `undefined`, a crafted object with a numeric `toString`, and an integer **above `Number.MAX_SAFE_INTEGER`** each render as `0`; an all-zero call and a non-object argument each return `''`. **Every call in T3 leaves `oversized`, `newlyQuarantined` and `stillQuarantined` at 0 or non-integer** — `capacityDeferred` is the carrier that keeps a render non-empty — so T3 renders neither the oversized bullet nor the pointer, and is outside the first two proofs' `expectRed`; **the third proof is T3's own** |
| **T4** | `dream-promote: [RS-4] promote appends the run-skip section beneath the enforcement record` | `tests/unit/dream-promote.test.js` | `[RS-4]` | a `promote()` call carrying `runSkips` publishes a report whose accounting ends with the section, after the enforcement block, separated by one blank line. **Its fixture sets `capacityDeferred` alone**, so T4 renders neither the oversized bullet nor the pointer, and its counts are plain safe integers, so it is outside all three proofs' `expectRed` |

**Three proofs, one declaration file** — one file per suite, which is what `suite`
being a top-level field means. Each proof's `criterion` is the acceptance
criterion it proves, so `rollUp` emits three lines for this WP.

*Provenance: on 2026-09-17 the author parsed this declaration and checked each
`find` against both worked examples rendered from a stub formatter — proof 1's
literal appears in the six-count render only, proof 2's in both — which is exactly
the `expectRed` set each declares. Proof 3's mutation was APPLIED to that stub and
measured: `oversized: 1.5` rendered as a plausible `1` and
`Number.MAX_SAFE_INTEGER + 1` rendered in full, so the render T3 pins changes and
T3 reddens, while T1's and T2's plain integers are untouched by a floor.*

**Each proof's `find` string must occur EXACTLY ONCE in `src/core/dream/promote.js`**
(`occurrences: 1` is checked): the pointer sentence, the oversized bullet's second
sentence and the integer-guard line appear in the formatter and nowhere else — do
not repeat any of them in a comment or a JSDoc example.

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
      "find": "Wienerdog will keep passing over them until the session changes, until Wienerdog is updated, or until dream_max_input_bytes in config.yaml is raised past their size; after any of those it measures them again, and may still find them too big.",
      "replace": "They will be retried on the next run. RP_MUT_RS_OVERSIZED",
      "marker": "RP_MUT_RS_OVERSIZED",
      "occurrences": 1,
      "testNamePattern": "\\[RS-",
      "expectRed": [
        { "test": ["dream-promote: [RS-1] the six-count run-skip section renders byte-exact with its pointer"], "signal": "[RS-1]" },
        { "test": ["dream-promote: [RS-2] a run-skip section with no quarantine count renders no pointer and no skipped"], "signal": "[RS-2]" }
      ]
    },
    {
      "id": "run-skip-integer-guard-rejects-coercion",
      "wp": "WP-dream-report-run-skips",
      "criterion": "7",
      "why": "round 1 measured the vacuity this closes: a guard that coerces and floors renders 1.5 as a plausible 1, which a forbidden-token scan cannot see. Under this mutation T3's hostile render gains an oversized bullet and a 9, and its unsafe-integer render prints 9007199254740992, so a T3 that pins full strings reddens and a T3 that scans for tokens does not. T1 and T2 pass plain safe integers, which a floor leaves unchanged",
      "file": "src/core/dream/promote.js",
      "find": "const int = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);",
      "replace": "const int = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0); /* RP_MUT_RS_COERCE */",
      "marker": "RP_MUT_RS_COERCE",
      "occurrences": 1,
      "testNamePattern": "\\[RS-",
      "expectRed": [
        { "test": ["dream-promote: [RS-3] the run-skip section reads every non-integer count as zero"], "signal": "[RS-3]" }
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

**The first five bullets are the template's, in its wording, and they register the
SURFACES — every surface is registered under exactly one of them.** The four
bullets after them are **claim registers**: they cross-index which of those
already-registered surfaces carry one contested claim, so a finding against that
claim has a single place to enumerate from. A claim register introduces no new
surface; if a walk ever finds one there that is not under the five, it moves up.

- [ ] Deliverables-table cells that restate a path or rule — each row cites the
      table that decides it (`scratch.js` → Table B; `promote.js` → Tables A and B;
      `dream.js` → Table B; `dream-collect.test.js` → Table B;
      `dream-promote.test.js` → Tables A and C; `tests/integration/dream.test.js` →
      Table A; the proofs file → Table C)
- [ ] Acceptance criteria that assert its facts — criteria 1–3 and 6–9 assert
      Table A, criteria 4–5 assert Table B (row B7's four cases, row B8's
      two-run partition), criterion 11 pins Table A's **ownership** row, criterion
      12 pins Table A's **coverage** row, criterion 13 asserts Table C
- [ ] Verification commands / greps — the `node -e` section gate asserts Table A
      (heading, both renders, the pointer condition, the lexical-scoping row, the
      zero case, and the integers-only row **by full-string equality on the hostile
      and unsafe-integer renders**); the `SKILL.md` grep asserts Table A's
      brain-is-not-told row; `npm run red-proofs` asserts Table C's three proofs
- [ ] Current-state description — the five collector arms and the discarded
      `skip-quarantined` count (Table B rows B1–B6, B8), the single composed
      accounting block and its one write (Table A's placement and delivery rows),
      the three shipped headings and that nothing scans for them (Table A's
      **ownership** row), why `records` is not the channel (row B11), and the
      return paths that compose no report and what `exclusions` does and does not
      contain (Table A's **coverage** row) — plus the `a47f2546` pin and the two
      sibling packages queued into `src/cli/dream.js`, which mirrors the
      `dream.js` Deliverables cell and Definition of done item 0(d)
- [ ] Operative prose steps that apply it — **walked, in document order**:
      - the opening ADR-0004 paragraph and the report-definition paragraph →
        Table A's **coverage** row (only a report-writing run carries the section);
      - the 191-session paragraph, framed as a MIXED run → Table A's **coverage**
        row;
      - the Context paragraph naming the oversized gap → Table B row **B3** and
        Table A's oversized bullet;
      - the Context paragraph quoting ADR-0023 Amendment 2 → Table A's **pointer**
        row;
      - the Context paragraph "built from integers alone" → Table A's
        **integers-only** row;
      - the "Exact contracts" JSDoc and the `promote()`/`composeRecord` sentence
        under it → Table A's **integers-only** and **placement** rows and Table B
        row **B11**;
      - **the two worked examples, whose bullet wordings ARE Table A rendered** →
        Table A's **heading**, **body**, **pointer**, **lexical-scoping**,
        **partial-case** and **no-apostrophe** rows, plus Table B's row order;
      - the "No pointer line" paragraph beneath the second worked example → Table
        A's **pointer** row;
      - Implementation notes, bullet by bullet: integers-only → Table A's
        **integers-only** row; formatter home → Table A's **placement** row and the
        `promote.js` Deliverables cell; `runSkips` validation → Table A's
        **integers-only** row and row **B11**; residual 1 → row **B10**; residual 2
        (zero-admission) → Table A's **coverage** row; residual 3 → Table A's
        **lexical-scoping** row; residual 4 (the pointer cannot confirm its file,
        with the measured refresh ordering) → Table A's **pointer** row; residual 5
        (no heading is reserved) → Table A's **ownership** row; the
        moved-`dream.js` bullet → Table B's Source column and Definition of done
        item 0(d);
      - Security checklist items 2 and 3 → Table A's **integers-only** and
        **placement** rows and the five residuals they name;
      - the Verification-steps commentary (the three-state paragraph and the two
        provenance lines) → Table A's gate rows and Table C;
      - Out of scope, item by item: no naming → Table A's **integers-only** row;
        no `reports/warnings.md` change → Table A's **pointer** row; `records` not
        reused → row **B11**; nothing on the throw path → Table A's **coverage**
        row; the `scratch.js` bound → row **B2**;
      - Discovered issues, entry by entry: the default-X gap → Table B row **B3**;
        the zero-admission gap → Table A's **coverage** row; the negative
        first-ever-claim check over the shipped surfaces → row **B1**; the
        stale-discovery-size reader defect → Table B row **B6**; the unreserved
        headings → Table A's **ownership** row;
      - Dispatch-precondition owner items 4 and 5 → Table A's **coverage** row and
        Table A's **pointer** row (with residual 4's measured ordering);
      - Dispatch-precondition owner items 1, 2 and 3 → row **B3** with Table A's
        oversized bullet, Table A's **pointer** and **lexical-scoping** rows, and
        Table A's **pointer** row respectively;
      - Definition of done item 0 → the Deliverables table and Table C.
- [ ] **CLAIM REGISTER — when the pointer line renders.** Table A's pointer row decides it — if and
      only if `newlyQuarantined` or `stillQuarantined` is non-zero — and its mirrors
      are Table A's Body, Lexical-scoping and Partial-case rows, the second worked
      example, the Context paragraph quoting ADR-0023 Amendment 2, the pointer
      acceptance criterion, the section gate's quarantine-free assertion, and Table
      C's T2. **No surface may tie the pointer to the heading, to "any non-zero
      count", or to any of B3–B6** — none of those arms produces a quarantine
      record, so `reports/warnings.md` cannot name them
- [ ] **CLAIM REGISTER — what an oversized session is promised.** Table B row B3 and Table A's
      oversized bullet decide it — passed over on every run until the source file
      changes, the package version changes, or `dream_max_input_bytes` is raised
      **to or past the measured size**, each of which earns a fresh measurement
      that may find it oversized again — and its mirrors are the Context paragraph
      naming the gap, both worked examples, the inline gate's `B3` literal, the
      oversized acceptance criterion, Table C's second proof, and owner item 1.
      **No surface may promise that an oversized session is retried next run, that
      a source change alone is the only release, or that any rise in the limit
      helps**
- [ ] **CLAIM REGISTER — where `stillQuarantined` comes from.** Table B row B2 decides it — the
      discovered files whose `selectState` answered `'skip-quarantined'` — and its
      mirrors are the `scratch.js` and `dream-collect.test.js` Deliverables rows,
      the Current-state bullet naming the discarded count, row B7, row B8, the
      four-case acceptance criterion, and the Out-of-scope bullet bounding the
      `scratch.js` change. **No surface may define it from the run-start ledger's
      active set**
- [ ] **CLAIM REGISTER — which runs carry the section.** Table A's **coverage** row
      decides it — only a real, non-dry run that admitted at least one session and
      reached `promote()` — and its mirrors are the **opening product paragraph**
      and the **191-session paragraph** (both qualified in round 2), the
      build-history sentence, the ADR-0004 sentence, the Current-state
      "orchestrator" subsection, residual 2, acceptance criterion 12, the
      idempotence criterion, the zero-admission Discovered entry, owner item 4, and
      the Out-of-scope bullet on the paths that write no report. **No surface may
      say or imply that every run writes a report** (design round 2, finding 1),
      and **no surface may say that `reports/warnings.md`, `doctor` or the digest
      banner carries this run's B1/B2** — they carry the ledger's standing set,
      which is a different fact (design round 1, finding 1)
- [ ] **CLAIM REGISTER — what a deferral bullet may promise.** Table B row **B12**
      decides it — a stop classifies the whole unvisited remainder before any memo
      is consulted, and the memos survive, so B4, B5 and B6 may promise only that
      Wienerdog will CONSIDER the session again, naming the oversized outcome as
      possible — and its mirrors are rows B4, B5 and B6, both worked examples, the
      inline gate's `AGAIN` literal and its no-retry-promise assertion, acceptance
      criterion 5's memo-behind-a-stop fixtures, and owner item 1's merged-bullet
      alternative. **No surface may say those sessions "will be retried on the next
      run", and no surface may say they carry "no ledger record"** — what is true is
      *no quarantine record*; an `oversizedExtracts` memo may exist (confirming
      design round, finding 1)
- [ ] **CLAIM REGISTER — what `newlyQuarantined` says about history.** Table B row
      **B1** decides it — this run's quarantine decision and its consequence, never
      the session's past — and its mirrors are the B1 bullet in both worked
      examples, the inline gate's `B1` literal and its no-first-time assertion,
      acceptance criterion 4(c)'s rendered-wording assertion, and row B7's case (c).
      **No surface may claim a counted session was skipped for the first time**: a
      prior quarantine whose fingerprint changed is re-selected (`ledger.js:242`)
      and can land in B1 again (confirming design round, finding 2)
- [ ] **CLAIM REGISTER — what `readDeferred` counts.** Table B row **B6** decides
      it — the number of transcripts THIS RUN'S COLLECTOR CLASSIFIED as
      read-deferred, which can under-count and cannot over-count — and its mirrors
      are the Current-state read-deferred bullet, acceptance criterion 4's
      B1–B5/B6 split, criterion 5's "partition of what the collector classified"
      clause, and the routed reader defect under Discovered issues. **No surface
      may call B6 exact, complete, or a measure of how many incomplete reads
      occurred**, and no acceptance criterion may depend on the reader defect being
      fixed (design round 2, finding 2)
- [ ] **CLAIM REGISTER — who owns the heading.** Table A's **ownership** row decides
      it — nobody, for this heading and for the three shipped ones alike — and its
      mirrors are the Current-state "report's code-appended accounting" subsection,
      residual 5, acceptance criterion 11's two fixtures, and the unreserved-heading
      Discovered entry. **No surface may claim the new heading is reserved,
      deduped or protected**, and no surface may describe a rule for it that the
      shipped headings do not also have (design round 1, finding 5)
- [ ] **CLAIM REGISTER — what validates `runSkips`.** Table A's integers-only row decides it —
      nothing in `promote()` does, and the formatter reduces every non-integer to 0
      — and its mirrors are the Exact-contracts JSDoc, Table B row B11, the
      Implementation note pricing the alternative, and the integers-only acceptance
      criterion. **No surface may say `promote()` throws for a malformed `runSkips`**

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
  published; a throw there is caught at `src/cli/dream.js:1065-1078`, retains the
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
- **Named residual — a run that composes no report has nothing to append to, and
  the quarantine counts are what that loses.** Table A's coverage row is canonical
  and enumerates the four paths. The part worth stating twice, because it is the
  one a reader would otherwise assume away: **a quarantine-only run takes the idle
  path**, so `stillQuarantined` is emitted **nowhere** on it and `newlyQuarantined`
  survives only as a number of console lines. The standing surfaces
  (`reports/warnings.md`, `wienerdog doctor`, the digest banner) show the ledger's
  quarantine set as it stands **now** — which is not "what this run skipped", and
  must not be read as a substitute for it. Closing this needs a report on a path
  that writes none, or a change to the failure message: separate packages, owner
  item 4, also routed under Discovered issues.
- **Named residual — the pointer's neighbours.** With the oversized bullet present,
  a reader could take the pointer to cover it. The lexical-scoping row is the
  mitigation chosen over rewording the pointer; owner item 2 prices the alternative.
- **Named residual — the pointer cannot confirm the file it points at is current,
  and the ordering is why.** `refreshWarnings` never throws: a refused publish, an
  unreadable file or a non-regular object at `reports/warnings.md` comes back as
  `{written:false, reason}` and the run continues (`src/core/dream/warnings.js:230-311`).
  So the pointer can name a file that is absent or one or more runs stale, while
  the counts beside it are exact. **Measured ordering — the result is only HALF
  available before `promote()`:** refresh point 1 (`src/cli/dream.js:826`) runs
  before the promotion, but **only when `sel.newlyQuarantined.length > 0`**; refresh
  point 3 (`:852`) is on the idle path, which returns before `promote()`; refresh
  point 2 (`:1284`) runs **after** it. A `stillQuarantined`-only run — the 191-session
  case this package exists for — therefore has no refresh result at all at the
  moment the section is composed. A boolean on `runSkips` would be honest only for
  the newly-quarantined sub-path and would delete the pointer from the main one, so
  **it is not added**; making it right needs a fourth refresh call site
  (`WP-quarantine-warnings-file`'s surface) or moving refresh point 2 ahead of the
  commit (ADR-0012), each its own package. Bounds of the residual: the ledger stays
  ground truth, every refresh point re-reads and re-decides, and the counts in the
  section are unaffected. Owner item 5.
- **Named residual — nothing reserves a code-owned heading, and that is true of the
  three shipped ones too.** Table A's ownership row is canonical. Applying a rule
  to the new heading alone would leave `## Refused by policy (promotion
  enforcement)`, `## Redacted in place (secret scan)` and `## Preserved copies
  (secret quarantine)` unowned and put two rules in one composer, so this package
  applies none and pins the behaviour with criterion 11's two fixtures instead.
  Routed under Discovered issues.
- **Every `src/cli/dream.js:NNN` citation in this spec is pinned to the base it was
  verified against — `main` at `a47f2546`.** The two siblings that were queued into
  that file ahead of this package have landed (PR #253 and PR #257, Current state),
  so the citations are current as of that SHA. They will drift again if anything
  else lands in `dream.js` first: **if a `:NNN` citation does not land on what it
  names, the fact is still right and the number is stale** — find the named
  construct, say so under "Discovered issues" in the PR body, and do not widen the
  change to compensate. A re-pin is a committed revision of this spec, never a
  dispatch message (Definition of done item 0(d)).
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
- [ ] Five residuals, all named under Implementation notes: the post-commit
      exhausted class, the runs that compose no report, the pointer's neighbours,
      the pointer that cannot confirm its file is current, and the code-owned
      headings that nothing reserves.

## Acceptance criteria

Numbered, because Table C's `criterion` fields reference them.

1. **All six bullets.** A run with every count in Table B non-zero appends exactly
   Table A's section, byte-exact as the first worked example, with the pointer line.
2. **The pointer's condition.** A section rendered with `newlyQuarantined` and
   `stillQuarantined` both 0 and any of B3–B6 non-zero is byte-exact as the second
   worked example: it contains no `reports/warnings.md` and no occurrence of
   `skipped`. Every combination with at least one quarantine count non-zero carries
   the pointer. *(Proved by Table C's first proof.)*
3. **The oversized promise is TRUE against row B3.** The oversized bullet names all
   three releases — the session changing, Wienerdog being updated, and
   `dream_max_input_bytes` being raised **past the measured size** — says that each
   earns a fresh measurement that may find the session too big again, and names the
   setting. It never promises a retry next run, and never implies that any smaller
   rise in the limit helps. *(Proved by Table C's second proof.)*
4. **Each count equals what Table B's row defines**, and a count of 0 omits its
   bullet while the others render unchanged in row order. B1–B5 are exact against
   their sources; **B6 is exact against the collector's own classification and is
   not a coverage claim** (row B6 states the under-count direction and routes the
   reader defect). **`stillQuarantined` is asserted on
   these four cases, which are what separate the selection reading from the
   run-start-ledger reading (row B7):** (a) an UNCHANGED prior quarantine is counted
   once, in `stillQuarantined` only; (b) a prior quarantine whose FINGERPRINT
   CHANGED and which this run consolidated successfully is counted in none of the
   six; (c) a prior quarantine whose fingerprint changed and which this run
   RE-QUARANTINED is counted in `newlyQuarantined` only, never in both; (d) a prior
   quarantine whose file no longer exists is discovered by nothing and is counted in
   none of the six. **Case (c) goes green under both readings for the wrong reason
   unless the double-count itself is asserted** — assert the sum, not only the
   individual counts. **Case (c) additionally asserts the RENDERED WORDING**, because
   it is the case that made the old wording untrue: the section produced for a
   re-quarantined session says it was *set aside by this run and will be skipped
   from now on*, and **contains no claim that it was skipped for the first time**
   (row B1; confirming design round, finding 2).
5. **Disjointness (row B8), over TWO runs, because one run cannot show it.** The
   capacity stop (`scratch.js:91-94`, `:124-127`) and the deadline stop (`:95-98`)
   each `break` the single admission loop, so whichever fires first prevents the
   other: **a run exercising all five collector arms at once does not exist.** The
   partition is asserted on **two** runs instead, each carrying at least one
   already-quarantined file and exercising the CONTINUING arms — quarantine,
   oversized, read-deferred — before its stop: **(a)** a run ending in a capacity
   stop (`capacityDeferred` non-zero, `deadlineDeferred` 0); **(b)** a run ending in
   a deadline stop (`deadlineDeferred` non-zero, `capacityDeferred` 0). For **each**
   run: `entries.length` plus the six counts does not exceed the number of
   discovered files, and no discovered file contributes to two counts.
   **What this criterion asserts, exactly: the partition of what the collector
   CLASSIFIED.** It is unaffected by row B6's under-count, because a transcript the
   reader failed to classify as read-deferred is classified as something else in the
   same pass and still contributes exactly once. **Whether a REAL production run can
   reach a non-zero `readDeferred` is a separate question, and this criterion does
   not answer it** — the routed reader defect is why, and closing it is not this
   package's work. Exercise the arm through the parse outcome the collector reads,
   and do not read a green here as evidence that production coverage is complete.
   **Each of the two runs additionally carries a session that is already memoised as
   individually oversized, sitting BEHIND the stop** (row B12): it must be counted
   in that run's deferral count and **not** in `oversized`, its memo must survive in
   the returned `oversizedExtracts`, and the rendered section must carry no promise
   that it will be dreamed over on the next run. That is the state the confirming
   design round reproduced, and it is the one a deferral bullet must not lie about.
6. **The zero case.** A run with all six counts at 0 appends nothing: the report has
   no `## Sessions this run could not consolidate` heading and its other
   code-appended sections are byte-identical to before this change.
7. **Integers only, asserted by full-string equality on the render.** The formatter
   renders `0` for every property that is not a non-negative safe integer — a
   string, a float, `NaN`, `-1`, `undefined`, a crafted object with a numeric
   `toString`, and an integer **above `Number.MAX_SAFE_INTEGER`** — returns `''`
   when every property reduces to 0, and returns `''` for a non-object argument.
   `promote()` does not throw for any of them. **The assertion compares the whole
   render to a hand-written expected string; a check that merely looks for the
   rejected values passes a formatter that floors `1.5` to a plausible `1`.**
   *(Proved by Table C's third proof.)*
8. **No identifier, ever.** No basename, path, session id or reason string appears
   anywhere in the appended section, for any input.
9. **Placement and delivery** — Table A's placement and delivery rows. The section
   is appended exactly once per run, last, one blank line after whichever
   accounting block precedes it; and on a run whose report write is refused it
   reaches the user through `report.record` and `src/cli/dream.js:1216-1228`, one
   line per element.
10. **The brain is untouched.** `skills/wienerdog-dream/SKILL.md` is not modified
    and is not told about the section.
11. **Heading ownership is PINNED, not changed** (Table A's ownership row). Two
    fixtures record what happens, and the recorded behaviour is whatever the
    shipped composer already does for its own three headings — this WP adds no
    reservation: **(a) a same-day second run** that admits new sessions, and
    **(b) a candidate body that itself contains the exact line
    `## Sessions this run could not consolidate`.** Each asserts the resulting
    report's full accounting region, so a later change to ownership — for this
    heading or for `## Refused by policy (promotion enforcement)` — has to move
    these fixtures and cannot land silently.
12. **Zero-admission runs, asserted as they are** (Table A's coverage row): a run
    whose only event is a quarantine writes **no report**, prints
    `wienerdog: nothing new to dream.`, and this WP adds nothing to it; a run with
    exclusions but no admission throws, and its message carries the B3–B6 counts
    and no quarantine count. Both are asserted so the boundary is a pinned fact
    rather than a sentence in this spec.
13. **Machine-run RED (ADR-0042).** `npm run red-proofs` reports `RUN: PROVEN` and
    its criteria roll-up carries three lines for this WP — `criterion 2`,
    `criterion 3` and `criterion 7` — each `PROVEN` and each naming its Table C
    proof id.
14. `npm test` and `npm run lint` pass. Every file under `tests/golden/` is
    byte-identical and none is edited.
15. Idempotence: **N/A — this WP ships no command and adds no write to a user
    machine.** It adds lines to a block that a report-writing run already composes
    and writes once.
    Re-running the dream over an unchanged corpus reaches the idle return and
    writes no report at all; a same-day run that DOES admit sessions is criterion
    11(a), not an idempotence claim.

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
node -e "const {runSkipSummarySection:f}=require('./src/core/dream/promote.js');const bad=[];const HEAD='## Sessions this run could not consolidate';const PTR='Which sessions are being skipped, and why: reports/warnings.md in your vault.';const AGAIN='Wienerdog will consider them again on the next run, though some may turn out to be too big to dream over on their own.';const B1='- 3 session transcript(s) were set aside by this run and will be skipped from now on, until they change.';const B2='- 191 session transcript(s) were already being skipped and were skipped again.';const B3='- 1 session transcript(s) are too big to dream over on their own. Wienerdog will keep passing over them until the session changes, until Wienerdog is updated, or until dream_max_input_bytes in config.yaml is raised past their size; after any of those it measures them again, and may still find them too big.';const B4='- 2 session transcript(s) were not reached, because this run had already taken in as much as it could. '+AGAIN;const B5='- 5 session transcript(s) were not reached, because this run ran out of time to prepare them. '+AGAIN;const B6='- 4 session transcript(s) were still being written while this run read them. '+AGAIN;const eq=(got,want,what)=>{if(got!==want)bad.push(what+' is not byte-exact: '+JSON.stringify(got));};const full=f({newlyQuarantined:3,stillQuarantined:191,oversized:1,capacityDeferred:2,deadlineDeferred:5,readDeferred:4});eq(full,[HEAD,'',B1,B2,B3,B4,B5,B6,'',PTR].join('\n'),'the six-count section');const noq=f({newlyQuarantined:0,stillQuarantined:0,oversized:1,capacityDeferred:2,deadlineDeferred:5,readDeferred:4});eq(noq,[HEAD,'',B3,B4,B5,B6].join('\n'),'the quarantine-free section');if(noq.indexOf('reports/warnings.md')!==-1)bad.push('a quarantine-free section emitted the warnings pointer; none of those arms leaves a ledger quarantine, so that file cannot name them');if(noq.indexOf('skipped')!==-1)bad.push('the word skipped leaked outside the two quarantine bullets, so the pointer promise is no longer lexically scoped');if(/first time|will be retried/.test(full))bad.push('a bullet promises more than the collector can deliver: no first-ever claim and no next-run retry guarantee may appear');if(/wienerdog doctor/.test(full))bad.push('the section names a second pointer; the enumeration has one home');eq(f({newlyQuarantined:0,stillQuarantined:0,oversized:0,capacityDeferred:0,deadlineDeferred:0,readDeferred:0}),'','the all-zero case');eq(f(undefined),'','a non-object argument');eq(f({newlyQuarantined:3,stillQuarantined:'../../etc/passwd',oversized:1.5,capacityDeferred:-1,deadlineDeferred:NaN,readDeferred:{toString(){return '9';}}}),[HEAD,'',B1,'',PTR].join('\n'),'the hostile render (every non-integer must read as 0; a floor or any coercion FAILS here)');eq(f({newlyQuarantined:Number.MAX_SAFE_INTEGER+1,stillQuarantined:0,oversized:0,capacityDeferred:2,deadlineDeferred:0,readDeferred:0}),[HEAD,'',B4].join('\n'),'the unsafe-integer render (a count above Number.MAX_SAFE_INTEGER must read as 0)');const partial=f({newlyQuarantined:3,stillQuarantined:0,oversized:0,capacityDeferred:0,deadlineDeferred:0,readDeferred:0});if(partial.indexOf('already being skipped')!==-1)bad.push('a zero count still rendered its bullet');if(partial.indexOf(PTR)===-1)bad.push('the pointer line is missing from a quarantine-bearing partial render');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('SKIP SECTION OK');"

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
  `skipped` into a non-quarantine bullet; **replace the integer guard with one that
  coerces and floors**; add the section to SKILL.md), and the compliant state — so
  a check that cannot fail is caught before anyone believes it.
- `npm run red-proofs` is the machine-run half (ADR-0042) and it is not a
  substitute for the three-state observation above: it proves three identities are
  non-vacuous, not that the gates can fail.
- **The `node -e` gate's own three states were observed by the author** against a
  stub exporting Table A's formatter, on 2026-09-17, before this spec was
  committed: compliant → `SKIP SECTION OK` exit 0; module absent → exit 1; and four
  separate mutations (the pointer tied to the heading, the all-zero case rendering
  a heading, one count read raw instead of as an integer, and **the coerce-and-floor
  guard of Table C's third proof**) → exit 1 with the naming diagnostic. The floor
  mutation is the one worth stating: it is invisible to a forbidden-token scan and
  is caught only because the gate now compares the hostile and unsafe-integer
  renders to hand-written expected strings. That establishes only that **the gate
  can fail**; the implementer still owes the three states against the real
  deliverable.

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
- **Anything on a path that writes no report** — the no-admission throw
  (`src/cli/dream.js:833-840`), the idle return (`:843-854`) and the dry-run return
  (`:862-865`): no new message, no new record, no report written where none is
  written today. The throw's text is ADR-0012's 2026-09-15 amendment and
  `WP-dream-filtered-input-budget`'s row A9; the idle path makes no commit at all,
  so writing a report there is an ADR-0012 lifecycle question. Owner item 4.
- **Reserving, deduping or marking any code-owned report heading**, including this
  package's own. Nothing reserves the three shipped ones either (Table A's
  ownership row); a rule for one heading is a rule the other three lack. Criterion
  11 pins the behaviour instead.
- **Adding a further condition to the pointer**, including a
  warnings-file-is-current flag on `runSkips`. Measured under Implementation notes:
  the refresh result exists before `promote()` only on the newly-quarantined
  sub-path, so such a flag would suppress the pointer on the very case the package
  exists for. Owner item 5.
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

**A run that admits nothing writes no report, so per-run skip accounting has no
carrier on those paths.** Routed from design round 1, finding 1. A quarantine-only
run — including the one that quarantines 191 historical sessions on first
contact — reaches the idle return at `src/cli/dream.js:843-854`, because
`exclusions` is built from the four collector counts alone (`:780-797`) and never
from a quarantine count. It prints `wienerdog: nothing new to dream.` and returns:
`stillQuarantined` is emitted nowhere, and `newlyQuarantined` survives only as the
number of per-file console lines. A zero-admission run that DOES throw (`:833-840`)
puts B3–B6 in its failure message and still no quarantine count. Fixing this is not
a report change: it is either **a report written on a path that writes none today**
— which reopens ADR-0012's one-run-one-commit boundary, since the idle path makes
no commit — or **a change to the failure message**, which is `WP-dream-filtered-
input-budget`'s owner-ratified row A9 text. Each is its own work package; nothing
is filed here. Owner item 4 states the recommendation.

**Checked and clean: no shipped surface carries the first-ever claim.** The
confirming round's finding 2 was about this spec's proposed wording, and the
obvious worry is that it came from a sibling sentence already in the product. It
did not. Measured at `a47f2546`: `grep -n "first time" src/core/dream/warnings.js
src/core/dream/ledger.js src/cli/dream.js src/cli/doctor.js` returns nothing. The
warnings renderer groups by reason and never dates a record; the digest banner says
"are being skipped and will not be dreamed over"; the per-file console line says
"quarantined <name>; it will not be retried until it changes". All three describe
standing state or this run's decision, which is exactly what row B1 now does.
**Nothing to file, and nothing here changes any of them.**

**The reader decides "were there unread bytes?" from the DISCOVERY size, so a file
that grows during the read is treated as fully read.** Routed from design round 2,
finding 2. `streamLines` takes `sizeBytes` as "the discovery-recorded fs size
(avoids a second stat)" (`src/core/transcripts/stream.js:71`) and, when the
per-session allowance runs out, declares exhaustion only if
`bytesConsumed < sizeBytes` (`:129-138`). **Trigger:** a transcript at or below the
50 MiB discovery ceiling (`PRE_READ_CEILING_BYTES`) that grows past the 200 MiB
per-session allowance (`MAX_RUN_BYTES`) while the run is reading it — the live
append case ADR-0023 Amendment 3 already names as an accepted race, now with a
second consequence. At that point `bytesConsumed` is 209,715,200 and `sizeBytes` is
at most 52,428,800, so the comparison is false, `runExhausted` stays false, and the
loop `break`s down the **file fully read** path. **Consequence:** the partial
extract is treated as complete — admitted and marked processed, or classified by a
later arm — instead of being discarded and retried, and the session is never
counted in B6. **Fix direction:** decide unread-bytes from the current
file-descriptor state at the moment the budget runs out (an `fstat` on the open
`fd`, or a probe read for one further byte) rather than from the stale discovery
size, with an integration fixture that grows a file past the allowance mid-read.
**This arrived with the fresh-per-session allowance in
`WP-dream-filtered-input-budget` and is not this package's to fix**; row B6 states
the resulting under-count and claims no coverage, so nothing here depends on the
fix. It needs its own work package; nothing is filed here.

**No code-owned report heading is reserved from brain-authored content, and this
predates the new section.** Routed from design round 1, finding 5. Measured at
`a47f2546`: `ENFORCEMENT_HEADING`, `REDACTION_HEADING` and `PRESERVED_HEADING`
(`src/core/dream/promote.js:584-591`) appear only in emission (`:708`, `:737`,
`:751`); nothing scans the candidate body, strips a prior code-owned block or
dedupes. Two consequences already ship: a brain that writes `## Refused by policy
(promotion enforcement)` into its report body gets a second, identical-looking
section appended under it, and a **second run on the same date** appends a second
copy of the whole accounting block. The fix — a delimited code-owned block, or a
marker, or a rejection in the skill-body gate — belongs to whichever package owns
`composeRecord`'s document model, and must cover all four headings at once. This
package adds the same (absent) rule for its own heading and pins the behaviour with
criterion 11 so a future fix has to move a fixture. Nothing is filed here.

## Dispatch precondition — owner items

Five items. **None was ruled on directly.** Each is **a recommendation adopted
under standing authorization, not a direct ruling** — the standing process is
recorded in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), which carries it forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under
that recommendation, and **the owner reverses any of them by dated amendment.**
Nothing in this repo records the owner approving, accepting or ratifying any of
the five, and this spec asserts no such acceptance. Items 4 and 5 were raised by
design review round 1 (2026-09-17) and are recorded with their dispositions in
`docs/specs/logbook/2026-09-17-report-run-skips-design-review.md`.

1. **Which arms does the report count, and what may each bullet promise?**
   *Recommendation: all six of Table B, one bullet each, and the oversized bullet
   states all three releases row B3 allows — the session changing, Wienerdog being
   updated, a sufficiently raised limit — and that each earns a fresh measurement
   that may find the session too big again* (its exact wording is Table A's; the
   word *skipped* is reserved to the two quarantine bullets, per Table A's
   lexical-scoping row). **Two further promises were removed after a reviewer
   executed the collector and reproduced them as false** (rounds 3 and 4): **no
   bullet claims a session was skipped for the first time** — a re-quarantine lands
   in B1 again, so B1 states this run's decision and its consequence — and **no
   deferral bullet promises a retry**; B4, B5 and B6 say Wienerdog will *consider*
   the session again and name the oversized outcome as possible, because a session
   memoised as oversized behind a capacity or deadline stop is counted there and is
   then passed over from its memo without being parsed. The alternative shapes are
   (a) four bullets, merging
   B4–B6 into one "considered again next run" line — the promise row B12 allows is
   identical for all three, but the user loses the cause, and with it which
   setting, if any, is the knob; and (b) leaving oversized out, which keeps the
   section at five
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
4. **Should a run that admits nothing get durable per-run accounting?** Today it
   does not: a quarantine-only run writes no report and emits no
   `stillQuarantined` anywhere, and a zero-admission run that throws carries the
   four collector counts and no quarantine count (Table A's coverage row, and
   Discovered issues).
   *Recommendation: yes it should, and NOT in this package.* Every available
   carrier is outside this boundary: a report on the idle path would be the first
   vault write by a run that makes no commit (ADR-0012, one run one commit); a
   quarantine count in the failure message edits text ADR-0012's 2026-09-15
   amendment and `WP-dream-filtered-input-budget` row A9 fixed; a fifth durable
   surface reopens ADR-0023 Amendment 2's one-home principle. Each is a package
   with its own ADR question, and folding any of them in here would turn a report
   section into a lifecycle change mid-review.
   *Cost of overruling:* this package grows a second subject and a second write
   path, its Deliverables gain the idle and throw branches, and the surface the
   design loop is converging on moves again. The cost of ACCEPTING is that the
   gap stays open until its own package lands, with the quarantine-only first-run
   case — the 191-session one — the most visible instance of it.
5. **Should the `reports/warnings.md` pointer be suppressed when this run cannot
   confirm the file is current?** *Recommendation: no, not by a boolean in this
   package.* Measured (Implementation notes): the refresh result exists before
   `promote()` **only** when the run minted a new quarantine, so a
   confirmed-current flag would be false on every `stillQuarantined`-only run and
   would delete the pointer from exactly the case the package exists for. Honest
   alternatives both restructure someone else's surface — a fourth refresh call
   site, or moving refresh point 2 ahead of the commit.
   *Cost of overruling:* either the pointer disappears from the main case, or this
   package takes an edit to `WP-quarantine-warnings-file`'s refresh points and an
   ADR-0012 ordering question with it. The cost of ACCEPTING is a pointer that can
   name an absent or stale file while its counts are exact — bounded, because the
   next successful refresh point repairs the file and the ledger was never wrong.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) The five owner items above travel with this
   package as **recommendations adopted under standing authorization**; any the
   owner reverses by dated amendment is applied to this spec by a committed
   revision — never by a dispatch message, because `scripts/boundary-check.js`
   reads the Deliverables table in this file and nothing a message says changes
   what CI sees. (b) **All twelve findings from rounds zero, 1, 2 and the
   confirming round are dispositioned** — raws preserved before adjudication at
   `b7f45600`, `37ac751a` and `9db06cca`, the record in
   `docs/specs/logbook/2026-09-17-report-run-skips-design-review.md` — **and the
   design gate is CLOSED at round 4 (approve)**, which is what makes this spec
   `Ready` (`docs/runbooks/codex-review.md`). (c) `WP-dream-filtered-input-budget`
   is `Done` at `docs/specs/done/WP-dream-filtered-input-budget.md` (merged in
   PR #245; flipped in PR #246), so this spec's `depends_on` entry is satisfied.
   (d) **THE `src/cli/dream.js:NNN` CITATIONS ARE PINNED TO `a47f2546` AND ARE
   CURRENT AS OF IT.** The two siblings that were queued into that file ahead of
   this package have landed — PR #253 (`WP-dream-lock-stale-owner-loud`) and PR #257
   (`WP-dream-digest-omits-own-job-alerts`) — and the citations were re-located
   against the result, construct by construct, on 2026-09-17
   (`docs/specs/logbook/2026-09-17-report-run-skips-repin.md`). **This precondition
   is therefore discharged**, and it re-arms only if something else lands in
   `src/cli/dream.js` (or in the collector) before dispatch: then the citations are
   re-derived by a committed revision of this spec, never by a dispatch message,
   because `scripts/boundary-check.js` reads this file's Deliverables table and not
   the message. Line numbers move; the tables do not.
1. All verification steps pass locally; output pasted into the PR body, including
   the three-state evidence for each new gate and the `red-proofs` roll-up.
2. Branch `wp/dream-report-run-skips`; conventional commits; PR titled
   `feat(dream): account for a run's skipped sessions in its report (WP-dream-report-run-skips)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
