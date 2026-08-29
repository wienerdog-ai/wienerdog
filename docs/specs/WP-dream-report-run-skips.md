---
id: WP-dream-report-run-skips
title: A dream run that skipped sessions says so in its own report
status: Draft
model: opus
size: S
depends_on: [WP-quarantine-warnings-file, WP-dream-promote-in-workspace]
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
> its contract as **what the report must say**, and treats its Deliverables rows
> and every call-site citation as **PROVISIONAL**: at dispatch they are
> re-derived against the tree the implementer will actually find, and the
> re-derivation is recorded in the dispatch message. See Definition of done
> item 0.

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
carries exact counts and a pointer.** Its three siblings all describe **standing
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
home — and this section points there and counts.

## Current state

**PROVISIONAL — re-derive at dispatch (see the notice above).** As of `dcd5777`:

- The report's two code-appended sections are written inside
  `validateAndCommit` (`src/core/dream/validate.js:1374-1409`): the file is created
  with `` `# Dream report — ${date}\n` `` when absent, then
  `## Reverted by orchestrator (policy enforcement)` is appended, then
  `## Redacted in place (secret scan)` conditionally. Both writes are plain
  `fs.writeFileSync` / `fs.appendFileSync`.
- **`validateAndCommit` receives no transcript or quarantine information at all.**
  Its `o` at the call site (`src/cli/dream.js:572-580`) is
  `{vaultDir, scratchDir, date, expectedScratch, scratchBaseline, layout, stateDir}`.
- Everything this package needs is live in `src/cli/dream.js` at that moment,
  produced by `collectExtracts` at `:377` (JSDoc `src/core/dream/scratch.js:81-102`):
  `sel.newlyQuarantined` (`Array<{harness, path, mtimeMs, size, dev, ino, reason}>`),
  `sel.dropped` (`Array<{harness, session_id, bytes}>`), `sel.truncated`, and the
  in-memory `ledger`.
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

**PROVISIONAL — re-derive at dispatch.** The rows below name the surfaces as they
stand at `dcd5777`; the dispatch message replaces them with the post-promotion
equivalents and records the substitution.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/ledger.js | one exported pure formatter for the section, per **Table A**. It belongs beside `secretRevertSummaryLine`, which it mirrors; nothing else in the module changes |
| modify | src/core/dream/validate.js | thread the counts in (**Table B**) and append the section. **At dispatch this row is expected to become `src/core/dream/promote.js`** |
| modify | src/cli/dream.js | pass the counts **Table B** names; nothing else in the run changes |
| modify | tests/unit/ledger.test.js | cover the formatter only |
| modify | tests/unit/dream-validate.test.js | cover the appended section. **At dispatch this row is expected to become `tests/unit/dream-promote.test.js`** |
| modify | tests/integration/dream.test.js | extend the quarantine-run coverage to the report |

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

Which sessions, and why: reports/warnings.md in your vault.
```

A run with all three counts at zero appends nothing at all — no heading, no
"none" line.

## Contract reference

Activation (ADR-0031, 2-of-7): **(i)** the emitted report gains a section shape;
**(v)** an authority boundary is crossed — the orchestrator knows the counts and
the report composer owns the document. Two conditions, so the discipline applies.

### Table A — the emitted section

| Fact / rule | Value |
|---|---|
| Heading | `## Sessions this run could not consolidate` |
| Body | one bullet per **non-zero** count, in the order of the worked example, each byte-exact as shown; then a blank line and the pointer line byte-exact as shown. **One pointer, not two** — `wienerdog doctor` is not named: it reports the same counts this section just gave, and only `reports/warnings.md` answers "which ones" |
| Zero case | all three counts 0 → the function returns `''` and **nothing is appended** — no heading, no "none" line. This section is news; a run with nothing to report says nothing |
| Partial case | a count of 0 omits its bullet; the pointer line still renders whenever the heading does |
| Built from integers alone | every argument that is not a non-negative safe integer renders as `0`. No basename, no path, no reason string, no session id reaches this section — the names live in `reports/warnings.md`, the enumeration's one home |
| Placement in the report | appended by code, after the brain-authored body, alongside the other code-appended sections. Its position relative to them is the implementer's choice; it is appended exactly once per run |
| The brain is not told about it | `skills/wienerdog-dream/SKILL.md` is **not** a deliverable. The model does not author this section, and telling it the section exists invites it to write one |

### Table B — the three counts

| Count | Definition | Source at `dcd5777` (PROVISIONAL) |
|---|---|---|
| `newlyQuarantined` | transcripts this run recorded as `quarantined` for the first time | `sel.newlyQuarantined.length` (`src/cli/dream.js:377`, used `:427`, `:444`) |
| `stillQuarantined` | active quarantines this run did **not** create — i.e. the size of the quarantine set as of the run-start ledger, before this run's own records | derived from the ledger read at `src/cli/dream.js:373-375`, the same run-start snapshot `WP-quarantine-warnings-file` takes |
| `capacityDeferred` | valid transcripts that did not fit `dream_max_input_bytes` and carry **no** ledger record, so they are retried next run (ADR-0023 §2, "no negative record at all") | `sel.dropped.length` (`src/cli/dream.js:416-422`) |

| Fact / rule | Value |
|---|---|
| Truncated sessions are **not** counted | `sel.truncated` sessions **were** consolidated, from their newest bytes. Counting them as "could not consolidate" would be false, and the run already reports them on their own console line (`:410-415`) |
| Overlap is impossible by construction | the three sets are disjoint: a newly-quarantined transcript is not in the run-start set, and a capacity-deferred one has no record at all |
| `secret-revert-exhausted` quarantines minted at `:604` | **not** counted in `newlyQuarantined`. That path runs after the report is composed, and it already has its own dedicated console summary (`secretRevertSummaryLine`) and its own permanent digest banner. Do not reorder the run to reach it |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (each row cites the table that decides it, and each
      carries its PROVISIONAL marker)
- [ ] Acceptance criteria that assert Tables A and B
- [ ] Verification commands (the section gate asserts Table A)
- [ ] Current-state description (the report's current writers, what
      `validateAndCommit` does and does not receive, why `records` is not the channel)
- [ ] The worked example under "Exact contracts" (it is Table A rendered)
- [ ] Implementation notes (the integers-only rule and the named residual)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
- **Integers only.** The moment a session id or a basename enters this section, it
  needs the sanitizer, a length bound, and a review of what a filename can do to a
  markdown document — all of which `reports/warnings.md` already solved for the one
  place that carries names. This section counts and points, like every surface in
  the family except that file.
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
      bullet while the others still render.
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
# Table A gate — the section renders byte-exact, is empty at zero, and is built from
# integers alone. (At dispatch, point the require at whichever module ends up owning
# the formatter; the assertions do not change.)
node -e "const l=require('./src/core/dream/ledger.js');const f=l.runSkipSummarySection;const bad=[];const full=f({newlyQuarantined:3,stillQuarantined:191,capacityDeferred:2});for(const s of ['## Sessions this run could not consolidate','3 session transcript(s) were skipped for the first time this run.','191 session transcript(s) were already being skipped and were skipped again.','2 session transcript(s) did not fit this run','Which sessions, and why: reports/warnings.md in your vault.'])if(!full.includes(s))bad.push('MISSING: '+s);if(/wienerdog doctor/.test(full))bad.push('the section names a second pointer; the enumeration has one home');if(f({newlyQuarantined:0,stillQuarantined:0,capacityDeferred:0})!=='')bad.push('the all-zero case is not empty');const hostile=f({newlyQuarantined:3,stillQuarantined:'../../etc/passwd',capacityDeferred:-1});if(/passwd|1\\.5|-1/.test(hostile))bad.push('a non-integer argument reached the output: '+JSON.stringify(hostile));if(hostile.includes('already being skipped'))bad.push('a non-integer count rendered its bullet instead of being read as 0');const partial=f({newlyQuarantined:3,stillQuarantined:0,capacityDeferred:0});if(partial.includes('already being skipped'))bad.push('a zero count still rendered its bullet');if(!partial.includes('reports/warnings.md'))bad.push('the pointer line is missing from a partial render');if(bad.length){console.error(bad.join(' | '));process.exit(1);}console.log('SKIP SECTION OK');"
# Table A gate — the dream skill is not told about the section.
test -f skills/wienerdog-dream/SKILL.md && ! grep -q 'could not consolidate' skills/wienerdog-dream/SKILL.md
```

- The last two are NEW steps and each is an ASSERTION: it exits non-zero on failure
  rather than printing something a reader must judge. Paste a real green on the
  finished state AND a real red from a deliberately broken state (one bullet
  reworded; the all-zero case made to render a heading; the section added to
  SKILL.md), so a check that cannot fail is caught before anyone believes it. The
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
- Any change to `src/core/dream/scratch.js`, `collectExtracts`'s return shape, or
  the ledger's on-disk schema.
- Re-opening ADR-0023's intake caps, its no-record-for-capacity-deferral rule, or
  Amendment 1.

## Definition of done

0. **DISPATCH PRECONDITION — three parts, all recorded in the dispatch message.**
   (a) ADR-0023's Amendment 2 (2026-08-29) carries the owner's hand-written
   `Status: **ACCEPTED — OWNER-SIGNED <date>.**` line in place of its `PROPOSED`
   line. (b) `WP-quarantine-warnings-file` and `WP-dream-promote-in-workspace` are
   both `Done` on `main`. (c) **Every PROVISIONAL marker in this spec has been
   discharged**: the Deliverables rows, the Current-state citations and Table B's
   source column are re-derived against the tree the implementer will find, and the
   substitutions are written into the dispatch message. A spec dispatched with a
   live PROVISIONAL marker is a spec bug, not an implementer problem.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): account for a run's skipped sessions in its report (WP-dream-report-run-skips)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
