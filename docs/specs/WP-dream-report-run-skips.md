---
id: WP-dream-report-run-skips
title: Make the dream report account for the sessions a run could not consume
status: Ready
model: opus
size: S
depends_on: [WP-quarantine-warnings-file, WP-quarantine-banner-decay, WP-dream-promote-in-workspace]
adrs: [ADR-0004, ADR-0012, ADR-0023]
epic: quarantine-surface
---

# WP-dream-report-run-skips: the run accounts for what it could not consume

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **READ THIS BEFORE ANYTHING ELSE.** Every `file:line` citation and every
> mechanism sentence below is written against `main` at `dcd5777` (2026-08-29),
> **and the surface this package edits is being rewritten under it.** The
> `audit-2026-07-29` promotion family — `WP-dream-promote-module`,
> `WP-dream-promote-report`, `WP-dream-promote-in-workspace` — moves the dream
> report's composition out of `src/core/dream/validate.js` and into
> `promote()`, and explicitly retires "today's report handling"
> (`WP-dream-promote-report`, Deliverables note). This package therefore states
> its contract as **what the report must say**, and marks the Deliverables rows
> and call-site citations that the rewrite moves as **PROVISIONAL**. **A
> PROVISIONAL marker is discharged by revising THIS SPEC before dispatch — never
> by a dispatch message.** `scripts/boundary-check.js` enforces the permission
> boundary from the Deliverables table in this file, so a message that "replaces"
> a row changes nothing a CI job can see. wd-architect re-derives the marked rows
> and citations against the then-current tree, deletes the markers, and commits
> that revision; the dispatch message then records only that revision's SHA and a
> one-line summary of what moved. See Definition of done item 0.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** This package adds counted lines to a
markdown file the dream already writes. No process, no state, no new command.

The nightly **dreaming** job consolidates the user's **transcripts** into the
**vault**. Each run writes a **dream report** at `<reports_dir>/<YYYY-MM-DD>.md`
(`reports/dreams/` by default) — the human-readable account of what the run did.
Its body is authored by the brain (the model), and code appends its own accounting
sections afterwards; the brain is told, in `skills/wienerdog-dream/SKILL.md:409-425`,
that it writes the candidate-level accounting and the orchestrator appends the rest.

**What the report does not say: what the run could not read.** A run that skipped
191 sessions produces a report that does not mention them. Three distinct things
are invisible there today, and each is a different fact about coverage:

1. **Newly quarantined** — transcripts this run decided it will not read (ADR-0023
   intake reasons: over the pre-read ceiling, too many lines, unreadable).
2. **Still quarantined** — transcripts skipped by an earlier run and skipped again,
   silently, by this one.
3. **Capacity-deferred** — valid transcripts that did not fit this run's
   `dream_max_input_bytes` budget and are retried next run. ADR-0023 §2 keeps *no
   record at all* for these on purpose, which is exactly why the report is the only
   place they can ever be counted.

ADR-0023 Amendment 2 (2026-08-29) makes this the fourth of the four surfaces the
quarantine record now has, and it obeys the same one-home principle they do: **the
full enumeration lives in `reports/warnings.md` and nowhere else, so this section
carries exact counts and a pointer to it.** This section is the only one of the
four that also counts something that file cannot name — the capacity-deferred
transcripts, which ADR-0023 §2 keeps no record of — so the pointer here rides the
two quarantine counts alone, and Table A's pointer row is the one place that is
decided. Its three siblings all describe **standing
state** — what is quarantined *now* (`reports/warnings.md` lists it;
`wienerdog doctor` and the digest banner count it and point there). This one is
the only surface that describes **one run**: what *that night* could not see. The dream reports are the vault's build history,
and a permanent gap in coverage should be discoverable a month later from the
report of the night it happened.

**The section is code-owned and built from integers alone.** No basename, no path,
no reason string. The precedent is `secretRevertSummaryLine`
(`src/core/dream/ledger.js:382-393`), whose comment states the property directly:
every argument that is not a non-negative safe integer renders as `0`, "which is
what makes it STRUCTURALLY impossible for a basename, a path or a matched value to
enter this line". The names live in `reports/warnings.md` — the enumeration's one
home — and this section counts, and points there for the sessions that file
actually holds (Table A's pointer row).

## Current state

**PROVISIONAL — re-derived INTO this section at dispatch (see the notice above).**
As of `dcd5777`:

- The report's two code-appended sections are written inside
  `validateAndCommit` (`src/core/dream/validate.js:1374-1409`): the file is created
  with `` `# Dream report — ${date}\n` `` when absent, then
  `## Reverted by orchestrator (policy enforcement)` is appended, then
  `## Redacted in place (secret scan)` conditionally. Both writes are plain
  `fs.writeFileSync` / `fs.appendFileSync`.
- **`validateAndCommit` receives no transcript or quarantine information at all.**
  Its `o` at the call site (`src/cli/dream.js:572-580`) is
  `{vaultDir, scratchDir, date, expectedScratch, scratchBaseline, layout, stateDir}`.
- Two of the three counts are live in `src/cli/dream.js` at that moment, produced
  by `collectExtracts` at `:377` (JSDoc `src/core/dream/scratch.js:81-102`):
  `sel.newlyQuarantined` (`Array<{harness, path, mtimeMs, size, dev, ino, reason}>`)
  and `sel.dropped` (`Array<{harness, session_id, bytes}>`); `sel.truncated` and the
  in-memory `ledger` are there too.
- **The third is not, and that is the one addition this package makes to
  `collectExtracts`.** Today the function discards which discovered files it
  skipped: it computes `selectState` for every discovered file and keeps only the
  `'select'` ones (`src/core/dream/scratch.js:106` and `:110`), so nothing outside
  that filter ever learns how many files answered `'skip-quarantined'`. Table B's
  `stillQuarantined` row adds that count to the return. **The in-memory ledger
  cannot substitute for it** — the run-start ledger's active-quarantine set is a
  different number, for the three reasons Table B's "why not the run-start set"
  row enumerates.
- `WP-dream-promote-report` adds a `records?: Array<{path:string, reason:string}>`
  input to `promote()` for "code-owned accounting the CALLER produced before
  promotion". **That field is not this package's channel**: its members land in the
  enforcement section, whose subject is a policy violation. A skipped transcript is
  not a violation, and filing it there would misreport a correct fail-safe skip as
  an enforcement event.
- `WP-quarantine-warnings-file` created the durable list this section points at,
  at the fixed vault-relative path `reports/warnings.md`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

**PROVISIONAL rows are re-derived INTO THIS TABLE before dispatch (see the notice
above), because this table — not a dispatch message — is what
`scripts/boundary-check.js` enforces.** The marked rows name the surfaces as they
stand at `dcd5777`; the rows marked **stable** are not moved by the promotion
rewrite and are not re-derived.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/ledger.js | **STABLE** — one exported pure formatter for the section, per **Table A**. It belongs beside `secretRevertSummaryLine`, which it mirrors; nothing else in the module changes. Stable because no spec of the promotion family lists this module: `WP-dream-promote-module` and `WP-dream-promote-report` deliver `src/core/dream/promote.js` and its test, and `WP-dream-promote-in-workspace` delivers `src/cli/dream.js`, `src/core/dream/validate.js`, `docs/adr/0012` and three test files. (`WP-quarantine-banner-decay`, this package's dependency, edits `quarantineBannerLine` in this module first — a different function, and the reason for the ordering edge in Definition of done item 0(b)) |
| modify | src/core/dream/scratch.js | **STABLE — one addition only:** `collectExtracts` also returns the count **Table B**'s `stillQuarantined` row names. No other returned field changes shape and no selection behaviour changes. Stable because `WP-dream-promote-in-workspace`'s Out of scope states that `src/core/dream/scratch.js` is not modified by the rewrite |
| modify | src/core/dream/validate.js | thread the counts in (**Table B**) and append the section. **PROVISIONAL — at dispatch this row is expected to become `src/core/dream/promote.js`** |
| modify | src/cli/dream.js | pass the counts **Table B** names; nothing else in the run changes. **PROVISIONAL — the path is expected to stand, but the site does not:** `WP-dream-promote-in-workspace` rewrites this whole file (its Deliverables note reads "the whole of Table G"), and `WP-quarantine-warnings-file` adds three refresh call sites to it, so every `:NNN` citation in Table B's Source column and Current state is re-derived at dispatch |
| modify | tests/unit/ledger.test.js | **STABLE** — cover the formatter only. Stable for the same reason as the module it tests: no promotion-family spec lists this file |
| modify | tests/unit/dream-collect.test.js | **STABLE** — cover the new count only (**Table B**); no existing assertion on `collectExtracts`'s return shape is weakened. This is `scratch.js`'s test file (its test names are prefixed `dream-collect:`) |
| modify | tests/unit/dream-validate.test.js | cover the appended section. **PROVISIONAL — at dispatch this row is expected to become `tests/unit/dream-promote.test.js`** |
| modify | tests/integration/dream.test.js | extend the quarantine-run coverage to the report. **PROVISIONAL — the path is expected to stand, but its fixtures do not:** `WP-dream-promote-in-workspace` lists this file for "pipeline wiring and abort behaviour", so the run shape this coverage extends is re-derived at dispatch |

If a further file appears necessary, that is a finding, not a fix: record it under
"Discovered issues" in the PR body.

### Exact contracts

```js
/** The code-owned per-run skip accounting for the dream report. Built from
 *  integers alone: every argument that is not a non-negative safe integer
 *  renders as 0, exactly like secretRevertSummaryLine.
 *  @param {{newlyQuarantined:number, stillQuarantined:number, capacityDeferred:number}} counts
 *  @returns {string} '' when all three are 0 */
function runSkipSummarySection(counts)
```

Worked example — a run that newly quarantined 3, skipped 191 already-quarantined,
and deferred 2 for capacity renders exactly:

```markdown
## Sessions this run could not consolidate

- 3 session transcript(s) were skipped for the first time this run.
- 191 session transcript(s) were already being skipped and were skipped again.
- 2 session transcript(s) did not fit this run's input budget and will be retried next run.

Which sessions are being skipped, and why: reports/warnings.md in your vault.
```

A run with all three counts at zero appends nothing at all — no heading, no
"none" line.

Second worked example — a **capacity-only** run (`newlyQuarantined` 0,
`stillQuarantined` 0, `capacityDeferred` 2) renders exactly:

```markdown
## Sessions this run could not consolidate

- 2 session transcript(s) did not fit this run's input budget and will be retried next run.
```

**No pointer line** — `reports/warnings.md` lists the sessions being skipped, and
a capacity-deferred transcript is not one of them: it carries no ledger record at
all, so that file is structurally incapable of naming it. Table A's pointer row
decides this.

## Contract reference

Activation (ADR-0031, 2-of-7): **(i)** the emitted report gains a section shape;
**(v)** an authority boundary is crossed — the orchestrator knows the counts and
the report composer owns the document. Two conditions, so the discipline applies.

### Table A — the emitted section

| Fact / rule | Value |
|---|---|
| Heading | `## Sessions this run could not consolidate` |
| Body | one bullet per **non-zero** count, in the order of the worked example, each byte-exact as shown; then, **only when the pointer row below says it renders**, a blank line and that pointer line byte-exact |
| **Pointer line — the text, and the ONLY condition under which it renders** | The text is byte-exact `Which sessions are being skipped, and why: reports/warnings.md in your vault.` It renders **if and only if `newlyQuarantined` or `stillQuarantined` is non-zero** — it rides the two QUARANTINE counts and nothing else. **Why `capacityDeferred` cannot carry it:** `reports/warnings.md` is a render of the ledger's active quarantines (`WP-quarantine-warnings-file`), and a capacity-deferred transcript carries **no ledger record at all** (ADR-0023 §2, Table B's `capacityDeferred` row), so that file is structurally incapable of naming it — pointing a capacity-only report there sends the user to a file containing none of the events the report just counted. Hence the wording: the sessions the pointer promises are the ones **being skipped**, which is the warnings file's own term for its contents (its empty form reads `No session transcripts are being skipped.`), and which is the vocabulary of exactly the two bullets the pointer rides on. The capacity bullet makes its own honest promise instead — retried next run — and needs no destination, because no record is kept. **One pointer, not two** — `wienerdog doctor` is never named here: it reports the same counts this section just gave, and only `reports/warnings.md` answers "which ones" |
| Zero case | all three counts 0 → the function returns `''` and **nothing is appended** — no heading, no "none" line. This section is news; a run with nothing to report says nothing |
| Partial case | a count of 0 omits its bullet, and the remaining bullets render unchanged. The pointer line does **not** follow the heading — it follows the pointer row's condition: **a capacity-only section (the only non-zero count is `capacityDeferred`) has the heading, its one bullet, and no pointer line at all**. Every other non-empty combination carries the pointer, because at least one quarantine count is non-zero |
| Built from integers alone | every argument that is not a non-negative safe integer renders as `0`. No basename, no path, no reason string, no session id reaches this section — the names live in `reports/warnings.md`, the enumeration's one home |
| Placement in the report | appended by code, after the brain-authored body, alongside the other code-appended sections. Its position relative to them is the implementer's choice; it is appended exactly once per run |
| The brain is not told about it | `skills/wienerdog-dream/SKILL.md` is **not** a deliverable. The model does not author this section, and telling it the section exists invites it to write one |

### Table B — the three counts

| Count | Definition | Source at `dcd5777` — PROVISIONAL unless the cell says STABLE |
|---|---|---|
| `newlyQuarantined` | transcripts this run recorded as `quarantined` for the first time | `sel.newlyQuarantined.length` (`src/cli/dream.js:377`, used `:427`, `:444`) |
| `stillQuarantined` | **the transcripts this run ACTUALLY skipped for an existing quarantine** — the discovered files for which `selectState` returned `'skip-quarantined'`, counted at selection time. **Not** the run-start ledger's active-quarantine count; the next row says why that number is a different one | **STABLE** — a new count `collectExtracts` returns, computed from the same `discovered` array and the same `selectState` call that already partitions candidates (`src/core/dream/scratch.js:106` and `:110`). `sel.skippedQuarantined`, read at `src/cli/dream.js:377` beside the fields the run already uses |
| `capacityDeferred` | valid transcripts that did not fit `dream_max_input_bytes` and carry **no** ledger record, so they are retried next run (ADR-0023 §2, "no negative record at all") | `sel.dropped.length` (`src/cli/dream.js:416-422`) |

| Fact / rule | Value |
|---|---|
| **Why `stillQuarantined` is NOT the run-start set's size (round 1, finding 2)** | because a prior quarantine whose file CHANGED is re-selected: `selectState` compares the record's fingerprint and answers `'select'` when it differs (`src/core/dream/ledger.js:187`), and the sticky `secret-revert-exhausted` arm at `:184` is the only quarantine that ignores the fingerprint. Three demonstrated miscounts follow from the run-start reading, and all three are gone under the selection reading: **(a) double-counting** — a changed prior quarantine re-quarantined this run lands in `newlyQuarantined` AND in the run-start set, which the overlap row below claimed impossible; **(b) a false skip** — a changed prior quarantine consolidated successfully this run is still reported as skipped again; **(c) a phantom** — a prior quarantine whose file was deleted is no longer discovered, was skipped by nothing, and is still counted. The report is durable, so each of these preserves a false coverage story for as long as the vault lives |
| Truncated sessions are **not** counted | `sel.truncated` sessions **were** consolidated, from their newest bytes. Counting them as "could not consolidate" would be false, and the run already reports them on their own console line (`:410-415`) |
| Overlap is impossible by construction | **and the construction is now the reason, not a hope**: all three counts are drawn from ONE discovery pass and are keyed on that pass's `selectState` outcome, which returns exactly one value per file. `stillQuarantined` counts the `'skip-quarantined'` files; `newlyQuarantined` and `capacityDeferred` are both drawn from the `'select'` files, and are disjoint from each other because every `'select'` file takes exactly one exclusive arm — the pre-read ceiling quarantines it before the byte budget is allocated (`scratch.js:119`), or the allocation loop quarantines it on a parse outcome (`:191`), or defers it (`:185`, `:194`), and each arm `continue`s. A file counted twice would need two selection outcomes in one discovery pass, which the function does not produce |
| `secret-revert-exhausted` quarantines minted at `:604` | **not** counted in `newlyQuarantined`. That path runs after the report is composed, and it already has its own dedicated console summary (`secretRevertSummaryLine`) and its own permanent digest banner. Do not reorder the run to reach it |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it, and each
      carries its **PROVISIONAL** or **STABLE** marker)
- [ ] Acceptance criteria that assert Tables A and B, including the five
      `stillQuarantined` cases
- [ ] Verification commands (the section gate asserts Table A)
- [ ] Current-state description (the report's current writers, what
      `validateAndCommit` does and does not receive, why `records` is not the
      channel, and the count `collectExtracts` discards today)
- [ ] The two worked examples under "Exact contracts" (they are Table A rendered:
      the all-three case, and the capacity-only case that carries no pointer)
- [ ] **When the pointer line renders.** Table A's pointer row decides it — if and
      only if `newlyQuarantined` or `stillQuarantined` is non-zero — and its
      mirrors are Table A's Body and Partial-case rows, the capacity-only worked
      example, the Context paragraph's rides-the-two-quarantine-counts sentence,
      the integers-only paragraph under Context, the capacity-only acceptance
      criterion, and the section gate's capacity-only assertion. **No surface may
      tie the pointer to the heading, to "any non-zero count", or to
      `capacityDeferred`** — those transcripts have no ledger record (ADR-0023 §2),
      so `reports/warnings.md` cannot name them (round 5, finding 2)
- [ ] Implementation notes (the integers-only rule and the named residual)
- [ ] **Where `stillQuarantined` comes from.** Table B's row decides it — the
      discovered files whose `selectState` answered `'skip-quarantined'` — and its
      mirrors are the `scratch.js` and `dream-collect.test.js` Deliverables rows,
      the Current-state bullet naming the discarded count, the disjointness row,
      the five acceptance cases, and the Out-of-scope bullet that bounds the
      `scratch.js` change. **No surface may define it from the run-start ledger's
      active set** — that is the round-1 reading, and it double-counts, false-skips
      and phantom-counts
- [ ] **The PROVISIONAL mechanism.** The READ-THIS notice, the Deliverables
      preamble and Definition of done item 0(c) all say the same thing: the marker
      is discharged by a committed revision of THIS SPEC, and the dispatch message
      records only that revision's SHA. **No surface may say a dispatch message
      substitutes a Deliverables row** — `scripts/boundary-check.js` reads the
      table, not the message

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **Integers only.** The moment a session id or a basename enters this section, it
  needs the sanitizer, a length bound, and a review of what a filename can do to a
  markdown document — all of which `reports/warnings.md` already solved for the one
  place that carries names. This section counts, and points at that file for the
  sessions it can name — like every surface in the family except that file, with
  the capacity-only exception Table A's pointer row owns.
- **Named residual — the section describes the run up to the point the report is
  composed.** A `secret-revert-exhausted` quarantine minted after the commit is not
  in it. That class has two dedicated surfaces of its own, and moving the report's
  composition to reach it would reorder the commit (ADR-0012: one dream run, one
  commit).
- **Named residual — a run that never composes a report has nothing to append to.**
  The adopt-with-history first run returns at `src/cli/dream.js:467-470` with
  nothing fresh and no commit, so it writes no report. Its skips reach the user
  through `reports/warnings.md` (the list), and through `wienerdog doctor` and the
  digest banner (the counts) — three surfaces, which is why this package is last
  and not first.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no identifier from this
      package reaches a filesystem path or a shell command.** The report's path is
      built from `layout.reports_dir` and the run's date exactly as it is today;
      this package adds no path construction.
- [ ] The surface this package touches is **a vault file that later feeds model
      context** (dream reports are snapshotted into routine staging directories by
      `src/core/vault-snapshot.js`). Containment: Table A's integers-only rule makes
      it structurally impossible for a filename, a path or a transcript byte to
      enter the appended section, mirroring `secretRevertSummaryLine`'s stated
      property.
- [ ] Two residuals, both named under Implementation notes: the post-commit
      exhausted class, and the run that composes no report at all.

## Acceptance criteria

- [ ] A run that newly quarantines transcripts, skips already-quarantined ones, and
      drops others for capacity appends exactly Table A's section with all three
      bullets and the pointer line, byte-exact.
- [ ] Each count is exact against Table B's definitions, and a count of 0 omits its
      bullet while the others still render. **`stillQuarantined` is asserted on
      these five cases, which are what separate the selection reading from the
      run-start-ledger reading (round 1, finding 2):** (a) an UNCHANGED prior
      quarantine is counted once, in `stillQuarantined` only; (b) a prior
      quarantine whose FINGERPRINT CHANGED and which this run consolidated
      successfully is counted in NONE of the three; (c) a prior quarantine whose
      fingerprint changed and which this run RE-QUARANTINED is counted in
      `newlyQuarantined` only, never in both; (d) a capacity-deferred transcript is
      counted in `capacityDeferred` only; (e) a prior quarantine whose file no
      longer exists is discovered by nothing and is counted in NONE of the three.
      The disjointness Table B claims is asserted directly: the three counts sum to
      no more than the number of discovered files, and no file contributes twice.
      **Case (c) is the one that goes green under both readings for the wrong
      reason unless the double-count itself is asserted** — assert the sum, not
      only the individual counts.
- [ ] **A capacity-only run — `capacityDeferred` non-zero, both quarantine counts
      0 — appends the heading and its one bullet and NO pointer line**: the
      rendered section contains no `reports/warnings.md` anywhere, byte-exact as
      the second worked example. The file cannot name a capacity-deferred
      transcript, because ADR-0023 §2 keeps no record of one.
- [ ] A run with all three counts at 0 appends nothing: the report has no
      `## Sessions this run could not consolidate` heading and is otherwise
      byte-identical to before this change.
- [ ] A truncated-but-consolidated session is counted in none of the three.
- [ ] The formatter renders `0` for every argument that is not a non-negative safe
      integer (a string, a float, `NaN`, `-1`, `undefined`, a crafted object), and
      returns `''` when every argument reduces to 0.
- [ ] No basename, path, session id or reason string appears anywhere in the
      appended section, for any input.
- [ ] The section is appended exactly once per run, and the report's existing
      code-appended sections are byte-identical to before this change.
- [ ] `skills/wienerdog-dream/SKILL.md` is not modified and the brain is not told
      about the section.
- [ ] Re-running the dream over an unchanged corpus does not duplicate the section
      in an existing day's report.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "^ledger: "
npm test -- --test-name-pattern "dream-validate"
npm test -- --test-name-pattern "dream-integration"
npm test
npm run lint
# Table A gate — the section renders byte-exact, is empty at zero, emits no pointer
# on a capacity-only run, and is built from integers alone. (The dispatch-time
# re-derivation points this require at whichever
# module ends up owning the formatter, in this file; the assertions do not change.)
node -e "const l=require('./src/core/dream/ledger.js');const f=l.runSkipSummarySection;const bad=[];const full=f({newlyQuarantined:3,stillQuarantined:191,capacityDeferred:2});for(const s of ['## Sessions this run could not consolidate','3 session transcript(s) were skipped for the first time this run.','191 session transcript(s) were already being skipped and were skipped again.','2 session transcript(s) did not fit this run','Which sessions are being skipped, and why: reports/warnings.md in your vault.'])if(!full.includes(s))bad.push('MISSING: '+s);if(/wienerdog doctor/.test(full))bad.push('the section names a second pointer; the enumeration has one home');if(f({newlyQuarantined:0,stillQuarantined:0,capacityDeferred:0})!=='')bad.push('the all-zero case is not empty');const hostile=f({newlyQuarantined:3,stillQuarantined:'../../etc/passwd',capacityDeferred:-1});if(/passwd|1\\.5|-1/.test(hostile))bad.push('a non-integer argument reached the output: '+JSON.stringify(hostile));if(hostile.includes('already being skipped'))bad.push('a non-integer count rendered its bullet instead of being read as 0');const partial=f({newlyQuarantined:3,stillQuarantined:0,capacityDeferred:0});if(partial.includes('already being skipped'))bad.push('a zero count still rendered its bullet');if(!partial.includes('reports/warnings.md'))bad.push('the pointer line is missing from a partial render');const capOnly=f({newlyQuarantined:0,stillQuarantined:0,capacityDeferred:2});if(capOnly.includes('reports/warnings.md'))bad.push('a capacity-only section emitted the warnings pointer; capacity-deferred transcripts have no ledger record, so that file cannot name them');if(!capOnly.includes('did not fit this run'))bad.push('the capacity-only section lost its own bullet');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('SKIP SECTION OK');"
# Table A gate — the dream skill is not told about the section.
test -f skills/wienerdog-dream/SKILL.md && ! grep -q 'could not consolidate' skills/wienerdog-dream/SKILL.md
```

- The last two are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing something a reader must judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state (one bullet
  reworded; the all-zero case made to render a heading; the pointer line tied to
  the heading so a capacity-only run emits it; the section added to SKILL.md), so
  a check that cannot fail is caught before anyone believes it. The
  deliverable-absent case is covered: the node gate throws when the formatter is
  missing, and the negated grep is preceded by `test -f`.

## Out of scope (do NOT do these)

- Naming any transcript in the report, in any form, including a truncated sample.
  The enumeration has exactly one home, `reports/warnings.md` (ADR-0023 Amendment 2).
- Changing `reports/warnings.md` (`WP-quarantine-warnings-file`), the digest banner
  (`WP-quarantine-banner-decay`), or `doctor`'s output
  (`WP-doctor-quarantine-counts`).
- Reusing `promote()`'s `records` input for these counts — its members land in the
  enforcement section, and a fail-safe skip is not an enforcement event.
- Reordering the run, moving `validateAndCommit`'s single commit, or adding a
  second one (ADR-0012).
- Any change to `skills/wienerdog-dream/SKILL.md` or to any prompt.
- Any change to `src/core/dream/scratch.js` **beyond the single added return field
  Table B's `stillQuarantined` row names**: no change to `selectState`, to which
  files are selected, parsed, quarantined, deferred or truncated, to any existing
  returned field's shape, or to the ledger's on-disk schema. The addition is a
  count the function already has the information to produce and currently throws
  away.
- Re-opening ADR-0023's intake caps, its no-record-for-capacity-deferral rule, or
  Amendment 1.

## Definition of done

0. **DISPATCH PRECONDITION — three parts.** (a) ADR-0023's Amendment 2
   (2026-08-29) carries the owner's hand-written
   `Status: **ACCEPTED — OWNER-SIGNED <date>.**` line in place of its `PROPOSED`
   line. (b) `WP-quarantine-warnings-file`, `WP-quarantine-banner-decay` and
   `WP-dream-promote-in-workspace` are all `Done` on `main`. **The banner package
   is a dependency for an ORDERING reason, not a contract one** (PR review gate,
   2026-08-30): it and this package both modify `src/core/dream/ledger.js`,
   `tests/unit/ledger.test.js` and `tests/integration/dream.test.js`, so
   dispatching them in parallel guarantees a three-file merge conflict. The
   charter's tier order already put the banner first
   (`docs/specs/logbook/2026-08-29-quarantine-surface-split.md`); this edge is that
   order encoded where a dispatcher can see it, and it delays nothing, because
   `WP-dream-promote-in-workspace` gates this package anyway. Nothing in this
   spec's contract depends on the banner's. (c) **Every PROVISIONAL marker in this spec has been
   discharged BY A COMMITTED REVISION OF THIS SPEC.** wd-architect re-derives the
   marked Deliverables rows, the Current-state citations, Table B's Source column
   and the verification commands against the tree the implementer will find,
   deletes every PROVISIONAL marker, and commits that revision on `main`. **The
   dispatch message records that revision's SHA and a one-line summary of what
   moved, and nothing else** — it cannot substitute a Deliverables row, because
   `scripts/boundary-check.js` enforces the table in this file and a PR touching a
   file the table does not list is rejected whatever the message said. A spec
   dispatched with a live PROVISIONAL marker is a spec bug, not an implementer
   problem.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): account for a run's skipped sessions in its report (WP-dream-report-run-skips)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
