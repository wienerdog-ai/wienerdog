---
id: WP-ledger-retry-parse-threw-on-upgrade
title: Give the hardened parser one bounded second look at transcripts quarantined parse-threw before it existed
status: Done
model: opus
size: M
depends_on: [WP-transcript-parsers-harden-text-values]
adrs: [ADR-0004, ADR-0005, ADR-0023, ADR-0031, ADR-0042]
epic: transcript-fault-boundary
---

# WP-ledger-retry-parse-threw-on-upgrade: Give the hardened parser one bounded second look at transcripts quarantined parse-threw before it existed

> **Errata, 2026-09-21 (post-merge) — six spec-prose facts falsified by
> measurement, and one set of mirror-only contract facts folded into the table
> that should own them. None is a defect in what shipped.**
>
> **Landed in PR #307** (merge `c73676bf`, 2026-09-19 00:08:07 UTC), tip
> `eedde8ab`, branch `wp/ledger-retry-parse-threw-on-upgrade`. The implementer
> reports running both gates itself over two rounds — round 1 blocked on three
> sentences of ADR-0023 Amendment 4 that the code in the same commit falsified,
> round 2 clean — and none of that was posted on the PR, so **both gates were
> re-run independently by the orchestrator on the same tip and both are clean.**
> The independent gate (Codex plugin `review` on `gpt-6-astra`, detached
> worktree, porcelain identical) returned *"No actionable regressions found. The
> retry preserves record identity, leaves unrelated quarantines untouched, and
> persists its one-shot marker without changing dry-run state."* wd-reviewer
> (spec fidelity, detached worktree) returned **APPROVE**: `npm test` 2924 /
> 2912 pass / **0 fail** / 12 skipped; `npm run lint` 0; `boundary-check` 0 over
> 7 files (6 Deliverables rows + this spec); the `SELECTSTATE AND
> RECORDQUARANTINED UNCHANGED OK` gate re-diffed by hand; the upgrade gate
> reproduced in all three states (base → `no one-time parse-threw retry`;
> widened reason → `expected exactly 2 conversions, got 8`; head →
> `PARSE-THREW RETRY OK`); **all five** RED declarations hand-applied with
> measured sets identical to the declarations and every red `ERR_ASSERTION`
> with its signal; 21 sibling declarations over `ledger.js` / `dream.js` still
> finding their `find` at declared count; Amendment 4 checked sentence by
> sentence against the code with no false sentence remaining; version-1 ledgers
> serializing byte-identically across six measured shapes; no owner-approval
> claim in the diff. CI on `eedde8ab`: seven checks pass.
>
> **Red-proofs verdict on the merged tip.** The implementer's **UNFILTERED**
> `npm run red-proofs`, exit 0: `RUN: PROVEN`, **186 declarations reported
> `PROVEN`**, and **zero** `FILTERED`, `VACUOUS`, `UNCONTROLLED`, `FAILED` or
> `ERROR` verdicts — including `pointer-derivation-doctor`, the sibling
> declaration whose `file` is the file this package edits, which criterion 6
> names as the concrete risk. All five `expectRed` sets were re-measured after
> the round-1 `Object.create(null)` fix and were unchanged.
>
> **Owner item 1 shipped under the standing process. ADR-0023 Amendment 4 is on
> `main` reading `Status: **ACCEPTED under standing authorization 2026-09-18 —
> owner signature pending.**` (`docs/adr/0023-…:520`).** Nothing in this
> repository records the owner approving, accepting, ratifying or signing it.
>
> **Erratum 1 — acceptance criterion 6 counts three Table B declarations; Table
> B declares five.** *What is wrong:* criterion 6 reads *"reports `RUN: PROVEN`
> for all **three** Table B declarations"*. *What is true:* Table B has **five**
> rows — `rpt-deletion-instead-of-deferral`, `rpt-reason-filter-widened`,
> `rpt-gate-never-set`, `rpt-gate-not-persisted`,
> `rpt-reason-dropped-on-conversion` — and five were written, measured and
> proven; `tests/red-proofs/ledger-retry-parse-threw.proofs.json` on
> `origin/main` at `8b4cbd4c` holds exactly those five ids. *Routing:*
> **corrected in place**, and the criterion now defers to Table B for the count
> rather than restating it, which is what stops the number going stale again.
> **Class: an acceptance criterion pinning a count its canonical table owns.**
>
> **Erratum 2 — Table B's `rpt-deletion-instead-of-deferral` predicts a
> narrower red set than the runner measures.** *What is wrong:* the row says
> *"only the at-or-below-baseline case reddens"*. *What is true:* the prediction
> holds **inside** `[LRP-1]` — its above-baseline assertion stays green and its
> at-or-below-baseline one fails, which is the property the row exists to
> establish — but `[LRP-2]` and `[LRP-3]` redden too, because they observe the
> record's continued **existence** and its written **shape**, both of which a
> deletion destroys. Measured: the shipped declaration's `expectRed` names
> `[LRP-1]`, `[LRP-2]` and `[LRP-3]`, and the declaration's own `why` was
> corrected to say so before merge. This is the **third** package in a row where
> a Table B row predicts per-criterion while the runner measures everything
> `testNamePattern` selects. *Routing:* **corrected in place**, and the row now
> states the intra-test property it owns (`[LRP-1]`'s two arms) and says
> explicitly that the red set is *at least* that, measured in the declaration.
> **Authoring rule recorded with it:** write a Table B prediction as "at least"
> or per-test, never as an exact set a `testNamePattern` will widen.
> **Class: a canonical table predicting a measurement's scope instead of
> deferring to it.**
>
> **Erratum 3 — five `src/core/dream/ledger.js` line cites were stale at
> authoring time and are staler now.** *What is wrong:* Current state and
> Table A cite `readLedger` `:139-157`, `writeLedger` `:160-177`, `selectState`
> `:235-263`, the baseline check `:260-261` and `secretDeferralCount`'s reason
> guard `:288-289`, all pinned to base `08de2bc3`. *What is true:* they were
> already off by one to two lines at that base — the gate measured `readLedger`
> `140-158`, `writeLedger` `162-178`, `selectState` `235-264`, the baseline at
> `:262` — and this package's own 100-odd added lines moved them again.
> Re-derived construct by construct on `origin/main` at `8b4cbd4c`:
> **`readLedger` `:163-182`, `writeLedger` `:186-203`, `selectState`
> `:320-349`, the baseline check `:347`, `secretDeferralCount` `:368-390` with
> its reason guard at `:374`, `recordQuarantined` `:411-419`, and
> `retryParseThrewOnce` itself `:250-287`.** *Routing:* **re-pinned in place to
> the landed tree**, with the construct kept adjacent to every number, because
> the construct is what authenticates the cite and the number will move again
> the next time a sibling lands in this file. **Class: line cites in a file the
> package itself grows.**
>
> **Erratum 4 — the `tests/unit/dream-pipeline.test.js` Deliverables cell
> glosses criterion 5 as the wrong criterion.** *What is wrong:* the cell reads
> *"Whatever acceptance criterion 5 requires — **the sweep observed through a
> real run**"*. *What is true:* criterion 5 is *"**A dry run changes nothing on
> disk**"*, the `--dry-run` criterion; the real-run observation belongs to
> criteria 1, 3 and 4. The Mirrored Surface Checklist has it right (criterion 5
> → Table A row A5, whose dry-run clause it is). *Routing:* **corrected in
> place** — the cell now names the dry-run criterion, which is what the file
> actually carries. **Class: a Deliverables cell paraphrasing a criterion it
> points at.**
>
> **Erratum 5 — the Mirrored Surface Checklist's Amendment-4 bullet mislabels
> the round-1 findings.** *What is wrong:* the bullet says *"two of its
> sentences were measured false against the code in the commit that created them
> (the key's **byte-compatibility** claim, and 'the retry never runs on a
> preview')"*. *What is true:* **three** sentences were corrected, and the first
> one named is the corrected form rather than the false one. Both gates agreed
> on: (1) *"A ledger that has never needed the retry does not gain the key"* —
> **false**, because `retryParseThrewOnce` sets the marker unconditionally, so
> the first later write carries it on every install (the **key-acquisition**
> claim; byte-compatibility is what the FIX says — the key is optional *in the
> serializer*, so a ledger written by code that has not run the retry stays
> byte-identical); (2) *"older code that drops the key causes at most one extra
> reconsideration"* — an **understatement**, since each marker-erasing rewrite
> authorizes another retry, so the bound is **per marker, not global**; and (3)
> *"The retry never runs on a preview"* — **false**, because the sweep runs in
> memory on `--dry-run` (that is how the plan is truthful) and only the write is
> suppressed. *Routing:* **corrected in place**, naming all three. **Class: a
> checklist bullet summarizing findings it does not quote.**
>
> **Erratum 6 — two contract facts existed only in Amendment 4's prose and in
> the code, never in the table that owns them.** *What is wrong:* Table A row
> A4 defines the one-shot gate but says nothing about what a **missing,
> empty or non-string** marker means, and nothing about the **scope of the
> bound**. Both facts were decided at round 1 and written only into the ADR
> amendment — a registered mirror — which is the ADR-0031 failure mode inverted:
> the mirror carrying what the canonical cell does not. *What is true*, measured
> on `origin/main` at `8b4cbd4c`: `optionalParseThrewRetry` (`ledger.js:156`)
> carries the key only when its value is a **non-empty string**, so an absent,
> empty or non-string marker **is no marker** and the retry runs; and the gate
> at `:251` compares against `PARSE_THREW_RETRY_MARKER`
> (`'parse-threw:harden-text-values'`, `:59`), so the bound is **per marker, not
> global** — a different marker value is a different, deliberate retry, and
> older code that drops the key authorizes one more reconsideration each time it
> does. *Routing:* **folded into Table A row A4**, the cell that decides the
> gate, with Amendment 4's prose left as its registered mirror. **Class: a
> canonical cell thinner than its own mirror.**
>
> **Process finding recorded with this filing.** When a spec carries a
> conditional ADR-amendment deliverable, **pin the amendment's byte-exact text
> in the spec**, as sibling packages do, so the implementer copies a block
> instead of authoring a new, unregistered mirror of the spec's own contract
> table. Every blocking finding in round 1 came from that one gap.
>
> **Reviewer notes, non-errata** (recorded rather than dropped). (a)
> `retryParseThrewOnce` rebuilds `ledger.files` on a null prototype, so a future
> test comparing a post-sweep `files` against an object literal with
> `assert.deepStrictEqual` would fail on the prototype; the shipped suite is
> unaffected. (b) `retryParseThrewOnce` overwrites a *foreign* value under
> `parse_threw_retry` with its own marker — bounded and symmetric with erratum
> 6's per-marker bound, and a note for whoever writes the second retry. (c) Row
> A5's `converted > 0 && !dryRun` persistence guard was traced end to end and
> explicitly cleared: a converting run persists the marker and the conversions
> in the same atomic write, and the residual is an idle install paying one
> `Object.entries` pass — zero I/O, zero re-parse.

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog's core function is the **dream**: a nightly, scheduled run that reads
the session transcripts two AI coding harnesses leave on disk — Claude Code's
`~/.claude/projects/<project>/<uuid>.jsonl` and Codex CLI's
`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — and consolidates them into the
user's markdown memory vault. **Wienerdog is just files (ADR-0004):** the dream
runs and exits; there is no daemon, no server and no telemetry, and nothing in
this work package may introduce one. There are no runtime npm dependencies; this
package adds none.

Every transcript read is bounded, and a file the reader cannot handle is
recorded in `~/.wienerdog/state/transcript-ledger.json` as **quarantined** —
skipped on every later run until the file changes (ADR-0023). That "until it
changes" rule is what makes a quarantine a bounded cost rather than a permanent
exclusion: `selectState` compares the record's `fingerprint` against the file's
current `size:mtimeMs:dev:ino`, and a file that differs is reprocessed.

**That rule has a blind spot, and this package closes it once.** The rule
assumes the reason a file could not be read is a property of **the file**. One
reason is not: `parse-threw`, added by `WP-dream-collect-parse-throw-quarantine`
(PR #271), records that *our own parser* threw while preparing the transcript.
When the parser is fixed, the file has not changed — so the fingerprint still
matches, `selectState` still answers `skip-quarantined`, and the fixed parser
**never sees the file again**. The sessions the defect cost stay lost for the
life of the install, and no user action recovers them: a completed transcript is
never rewritten by either harness, and nothing in `src/` ships an un-quarantine
command.

**The population is real.** `v0.14.0` is published on npm
(2026-09-18T12:26:43Z) and carries the `parse-threw` reason with the
*unhardened* parsers, so installs in the field can accumulate exactly these
records. `WP-transcript-parsers-harden-text-values` fixes the parser; this
package is what lets the fix reach the transcripts it was written for. The two
must reach the **same release**, in that order — that spec's owner item 2 and
Table E row E4.

**The recovery is one-shot, not a policy change.** After it has run once on an
install, `parse-threw` goes back to meaning exactly what it means today, with
the ordinary fingerprint-gated retry and nothing else.

## Current state

**Base: `08de2bc335baa4a97bba2f33bca224f2f3a28517`** (`main` after PR #274) plus
`WP-transcript-parsers-harden-text-values` merged. Every citation below was
derived **construct by construct** at `08de2bc3`; that package touches only
`src/core/transcripts/`, `tests/unit/`, `tests/fixtures/` and
`tests/red-proofs/`, so **no citation in this section moves when it lands** —
re-check that claim at dispatch rather than assuming it.

**`src/core/dream/ledger.js`** is the only production file this package edits.
Four of its constructs decide everything here:

**Line cites below were re-pinned at the done-flip (erratum 3) to `origin/main`
at `8b4cbd4c` — the LANDED tree, which includes this package's own additions.
The construct name is what authenticates each cite; the number moves whenever a
sibling lands in this file.**

1. **The quarantine record, `recordQuarantined` (`:411-419`)** writes exactly
   `{fingerprint: fingerprint(disc), outcome: 'quarantined', reason, updated_at, harness}`
   through `withRecord`. **It carries no version and no counter.** `appVersion`
   does exist in this file — but only on `oversizedExtracts` memo entries
   (`normalizeOversizedExtracts`), which are a different map
   with a different lifecycle and are not quarantine records.
2. **`selectState(ledger, disc)` (`:320-349`)**, in order: a present-but-corrupt
   record → `'select'`; a quarantined record whose `reason` is
   `SECRET_REVERT_EXHAUSTED_REASON` → `'skip-quarantined'` **without consulting
   the fingerprint** (the one sticky arm); then
   `if (rec.fingerprint !== fingerprint(disc)) return 'select';`; then a switch
   on `outcome` — `processed` → `'skip-processed'`, `quarantined` →
   `'skip-quarantined'`, `deferred` → `'select'`, default → `'select'`. With
   **no record at all**, it falls through to
   `if (typeof baseline === 'number' && disc.mtimeMs <= baseline) return 'skip-processed';`
   (`:347`) and only then to `'select'`. **The baseline check is reached
   ONLY on the no-record path** — a record that is present and whose fingerprint
   matches never consults it. That asymmetry is the whole of Table A rows A1 and
   A9: a *removed* record is not the same as a retryable one, and `'deferred'`
   is the outcome that already means "retry".
3. **`readLedger(stateDir)` (`:163-182`)** returns a fresh `emptyLedger()` on
   anything missing, corrupt or malformed — fail closed — and otherwise returns
   an object it **hard-pins to `version: 1`**. It never reads `obj.version`.
4. **`writeLedger(stateDir, ledger)` (`:186-203`)** serializes exactly
   `{version: 1, baseline_mtime, files, oversizedExtracts?}` — via
   `optionalOversizedExtracts`, which omits the memo map when empty to keep
   version-1 ledgers byte-compatible. **Any top-level key not in that literal is
   silently dropped on the next write**, which is why a one-shot marker is not
   free (Table A row A4).

**`src/cli/dream.js`** — at base `08de2bc3`, `:708` read the ledger, `:709-711`
applied the existing one-time `migrateFromWatermarks` migration and persisted it
with `if (mig.migrated && !dryRun)`, and `:712` called `collectExtracts`. That
three-line shape is the precedent Table A row A5 tells the implementer to copy,
and its comment already carries the dry-run rule. On the landed tree
(`origin/main` at `8b4cbd4c`) the same three constructs are `readLedger` at
`:717`, `migrateFromWatermarks` at `:718`, this package's
`retryParseThrewOnce` at `:735` and `collectExtracts` at `:744` (done-flip
erratum 3).

**`src/core/dream/scratch.js`** — `collectExtracts` calls `selectState` for each
discovered file and skips before parsing; the `parse-threw` fault boundary
inside its admission loop is unchanged by this package and re-quarantines any
candidate whose preparation still throws, which is what makes row A6's
"re-quarantine what still fails" automatic rather than new code.

**`tests/red-proofs/quarantine-banner-location-doctor.proofs.json`** declares
`pointer-derivation-doctor`, whose `file` is **`src/core/dream/ledger.js`** at
`occurrences: 1` — a declaration this package's file edits could disarm. It is
the reason for the `occurrences` sweep under "Implementation notes".
`tests/red-proofs/quarantine-banner-location.proofs.json`'s `suite` is
`tests/unit/ledger.test.js`, the suite this package adds tests to.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/ledger.js | Table A in full — rows A1–A5. No change to `selectState`, to `recordQuarantined`, or to any record's shape |
| modify | tests/unit/ledger.test.js | Whatever the acceptance criteria require in this file, including the upgrade test (criterion 1) |
| modify | src/cli/dream.js | Table A row A5 only — the one call site that applies the sweep and persists it. Nothing else in this file |
| modify | tests/unit/dream-pipeline.test.js | Whatever acceptance criterion 5 requires — **the DRY-RUN criterion**: a `--dry-run` over a ledger holding `parse-threw` records reports what it would convert and leaves the ledger file byte-identical (done-flip erratum 4) |
| create | tests/red-proofs/ledger-retry-parse-threw.proofs.json | Table B — `suite` is `tests/unit/ledger.test.js` |
| modify | docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md | Table A row A7 — **only if** owner item 1 is resolved in favour of an amendment. Absent that, this file is not touched |

### Exact contracts

```js
/** ONE-TIME, IDEMPOTENT. Convert every `parse-threw` QUARANTINE record into a
 *  retryable DEFERRED record, so the hardened parser gets one more look —
 *  unless this ledger has already had its retry for this marker. Returns a NEW
 *  ledger and the count converted; never mutates its argument, never throws.
 *  The record is CONVERTED, never removed (Table A rows A1, A9).
 *  @param {import('./ledger').Ledger} ledger
 *  @returns {{ledger: import('./ledger').Ledger, converted: number}} */
function retryParseThrewOnce(ledger)
```

## Contract reference

The ADR-0031 activation trigger fires on **four** of the seven tests: (ii) a
status/result taxonomy gains a lifecycle qualifier — one reason becomes
recoverable once; (iv) fallback/precedence behavior changes — a record that
`selectState` would skip is removed before it is consulted; (v) the task crosses
an authority boundary — the ledger owns the record while the parser's revision
decides whether it is still meaningful; (vii) the same contract appears in
multiple mirrored surfaces.

### Contract table(s)

**Table A — the one-time `parse-threw` retry.** The single place its facts are
decided.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| A1 | The mechanism | **CONVERT the record to a deferred one. Do not delete it, and do not add a `selectState` branch.** For each entry in `ledger.files` whose `outcome` is `'quarantined'` **and** whose `reason` is exactly `'parse-threw'`, rewrite that entry to `{fingerprint: <unchanged>, outcome: 'deferred', reason: 'parse-threw', updated_at: <now>, harness: <unchanged>}` — same key, same fingerprint, and **no `deferrals`**. `selectState` then takes the record-present path, matches the fingerprint, and hits `case 'deferred': return 'select'` (`src/core/dream/ledger.js`, `selectState`'s `case 'deferred'` arm — `:340` on the landed tree). **`selectState` is not edited and no new field is introduced**: `outcome: 'deferred'` and `reason: 'parse-threw'` are existing values of existing keys. **Deletion was the round-1 design and it is WRONG — row A9.** |
| A9 | Why deletion is wrong, and why `deferred` is the fix — MEASURED | **Deleting the record does not reliably select the file.** The no-record path consults the baseline first, so a file whose `mtimeMs` is at or below `baseline_mtime[harness]` answers **`skip-processed`**. That is reachable: a path that already carries a record is restored from a backup or a sync with an **older** timestamp; its changed fingerprint lets it be parsed, the unhardened parser throws, and it is quarantined `parse-threw` with an mtime below the baseline. After a deletion it is then **silently treated as already processed** — the hardened parser never runs, **and** removing the record also removes its line from `reports/warnings.md`, so the user loses the session *and* the notice of having lost it. Measured on the base tree with `baseline_mtime.codex = 2000` and a file at `mtimeMs = 1000`: quarantined → `skip-quarantined`; **after deletion → `skip-processed`**; **converted to `deferred` → `select`**. Conversion works because the baseline sits on the no-record path alone, so keeping *any* matching-fingerprint record bypasses it. Found by the design gate, round 2 (Astra, medium, band A). |
| A10 | The converted record does not disturb the secret-revert budget — MEASURED | `secretDeferralCount`'s `deferred` arm (`src/core/dream/ledger.js:373-374` on the landed tree) begins `if (rec.reason !== SECRET_REVERT_REASON) return 0;`, so a `deferred` record carrying `reason: 'parse-threw'` and no `deferrals` counts as **0** deferrals — the full budget, not an invented exhaustion. Measured on the base tree: `secretDeferralCount` returns `0` for exactly the record row A1 writes. **This is why row A1 keeps `reason: 'parse-threw'` on the converted record rather than dropping it:** the reason is what makes the record legible to that guard, and it is what tells the next reader why a deferral exists. |
| A2 | What it must not touch | Every record whose `outcome` is not `'quarantined'`; every quarantined record whose `reason` is anything other than `'parse-threw'` — including `over-ceiling`, `too-many-lines`, `read-error`, `secret-revert`, `secret-revert-exhausted`, a missing `reason`, a non-string `reason` and a reason from a later schema; `baseline_mtime`; and `oversizedExtracts`. The match is a **positive equality test on our own literal**, never a rejection list. |
| A3 | What happens to a file that still fails | **Nothing new.** The dream's existing `parse-threw` fault boundary re-quarantines it under the same reason, with a fresh `updated_at`, exactly as it would a file it had never seen. No code in this package participates. |
| A4 | The one-shot gate, and why it costs new state | The sweep must run **once per install**, not nightly: after `WP-transcript-parsers-harden-text-values`, a `parse-threw` can still arise outside the four hardened joins (the metadata path), and re-reading, re-parsing and re-throwing on such a file every night is the repeated cost ADR-0023's quarantine exists to stop. (Row A1's conversion sharpens this rather than softening it: `selectState` answers `'select'` for a `deferred` record on **every** run, so without the gate the sweep would re-arm that retry nightly.) The gate cannot live on the record (that is Table A row A2's promise and the Done spec's row A2). It cannot reuse the schema version either: `readLedger` hard-pins `version: 1` and never reads `obj.version` (`:163-182`). So it is **one new top-level ledger key**, written once — and because `writeLedger` (`:186-203`) serializes an explicit literal, `writeLedger`, `readLedger` and the `Ledger` typedef must all learn it or it is dropped on the next write. Its value is a **marker for this retry**, not a general app-version field: the package introduces exactly one retry, so a later retry needs a later marker and a deliberate decision, never an automatic re-run. **Two further facts this cell owns, folded in at the done-flip (erratum 6) from where they had been living — Amendment 4's prose and the code — so the cell that decides the gate states them:** (a) **an absent, empty or non-string marker IS NO MARKER and the retry runs.** The serializer carries the key only when its value is a non-empty string (`optionalParseThrewRetry`, `src/core/dream/ledger.js:156`), which is also what keeps a ledger that has never run the retry byte-identical to a version-1 ledger. (b) **The bound is PER MARKER, not global.** The gate compares against `PARSE_THREW_RETRY_MARKER` (`'parse-threw:harden-text-values'`, `:59`), so a different marker value is a different, deliberate retry — and older code that drops the key authorizes one more reconsideration each time it drops it, not one in total. |
| A5 | Where it runs, and when it persists | Once per `wienerdog dream` invocation, in `src/cli/dream.js`, **after `readLedger` and before `collectExtracts`**, so the same run that converts the records also reconsiders the files. **There is an exact precedent to copy, three lines above the insertion point:** `migrateFromWatermarks` at `src/cli/dream.js:709-711` is a one-time, idempotent ledger migration that returns `{ledger, migrated}`, is applied between `readLedger` (`:708`) and `collectExtracts` (`:712`), and persists with `if (mig.migrated && !dryRun) ledgerLib.writeLedger(…)`. Take that shape. Its own comment (`:705-707`) already states the dry-run rule this row inherits: *"a preview run must not permanently mutate state. On dry-run the migrated ledger is used in-memory only; migration is idempotent, so the next real run re-migrates identically."* |
| A6 | Idempotence, and what a crashed run leaves behind | Running `wienerdog dream` twice converts records on the first run and **zero** on the second, because the gate is set. This is the template's idempotence criterion, and it is acceptance criterion 4 rather than `N/A`. **A run that dies between the sweep's write and the collection leaves `deferred` `parse-threw` records, and that state is self-healing rather than stuck:** the gate stops the sweep re-running, but `selectState` answers `'select'` for a deferred record anyway, so the next run reconsiders those files once and writes their real outcome. `reports/warnings.md` may lag by one run in that window, which ADR-0023 Amendment 2 already permits in terms — `src/cli/doctor.js:487-493` states that the vault warnings file *"is derived from it and can legitimately lag by one dream run"*. |
| A7 | ADR status | **Open — owner item 1**, and row A1's conversion strengthens the case rather than weakening it. `WP-dream-collect-parse-throw-quarantine`'s Table A row A12 concluded that `parse-threw` needed no ADR-0023 amendment *because* it introduced "no record field, no counter and no new state". **Two** things now exceed that premise: row A4's ledger-level gate, and row A1's new state transition `quarantined → deferred`, which also produces a record combination the tree has never held — a `deferred` record whose `reason` is not `secret-revert`. That filed spec's row **A2** still holds exactly (no new field, no counter, no stickiness; `recordQuarantined` untouched). Whether this is a lifecycle change ADR-0023 must record is the owner's call. **This package ships the same code either way**; only the ADR file moves, which is why its Deliverables row is conditional. |
| A8 | What is NOT changed | `selectState`, `recordQuarantined`, `fingerprint`, `withRecord`, the sticky `secret-revert-exhausted` arm, `INFORMATIONAL_QUARANTINE_REASONS`, the digest banner, `reports/warnings.md`, `wienerdog doctor`, `src/core/dream/scratch.js` and every file under `src/core/transcripts/`. None is in the Deliverables. |

**Table B — the declared RED proofs (ADR-0042).** One file,
`tests/red-proofs/ledger-retry-parse-threw.proofs.json`, whose `suite` is
`tests/unit/ledger.test.js`.

| Proof id | Criterion | Mutation (exact-substring, in `src/core/dream/ledger.js`) | What it proves |
|----------|-----------|------------------------------------------------------------|----------------|
| `rpt-deletion-instead-of-deferral` | 1 | replace Table A row A1's conversion with a deletion of the entry | **the round-2 defect, declared so it cannot come back.** The property this row owns is INTRA-TEST: inside criterion 1's test, the above-baseline assertion stays green — deletion selects those — and the at-or-below-baseline assertion fails. It is therefore also the proof that criterion 1's corpus contains such a file; a criterion-1 test built only from above-baseline files would observe nothing here. **The red SET is wider than that property and is MEASURED in the declaration, never predicted here** — a deletion also destroys the record's existence and its written shape, which other tests in the same `testNamePattern` selection observe (measured: `[LRP-1]`, `[LRP-2]`, `[LRP-3]`). *Done-flip erratum 2: this cell previously read "only the at-or-below-baseline case reddens", an exact set the runner widened. Write a Table B prediction as "at least", or per-test, never as an exact set.* |
| `rpt-reason-filter-widened` | 2 | widen Table A row A1's reason equality so it matches any quarantined record | the assertion observes **which** records survive, not merely that something was dropped. Under the mutation the retry still "works" for `parse-threw` and silently un-quarantines every sibling reason — including the sticky `secret-revert-exhausted`, which ADR-0023 Amendment 1 made sticky on purpose |
| `rpt-gate-never-set` | 4 | remove the write of Table A row A4's one-shot marker | the assertion observes the **second** run, not just the first. Without the gate the sweep is correct once and then re-runs nightly, which is the bounded-cost property ADR-0023 exists for |
| `rpt-gate-not-persisted` | 4 | remove the marker from `writeLedger`'s serialized literal | the gate is set in memory and lost on write — a defect invisible to any single-process test that does not round-trip through the file. This mutation is declared because Current state item 4 says the drop is silent |
| `rpt-reason-dropped-on-conversion` | 3 | remove `reason: 'parse-threw'` from the record Table A row A1 writes | a `deferred` record with no reason still selects, so a test that only checks "the file was read again" stays green — while `secretDeferralCount`'s guard (`:374`) loses the value it keys on and the record stops saying why it is pending. The assertion observes the written record, not just the selection (Table A row A10) |

**`expectRed` sets are MEASURED, never predicted.** The Criterion column is
authoring intent. Measure each set by hand-applying its mutation and running the
suite under the declaration's own `testNamePattern`, then confirm against the
unfiltered run — `WP-dream-collect-parse-throw-quarantine`'s Erratum 2 is what
happens otherwise, because `testNamePattern` selects a whole tagged suite rather
than one criterion.

**Binding: `scripts/red-proofs.js:1655`** refuses any red whose failure `code`
is not `ERR_ASSERTION`, and `:716-717` / `:1658-1659` require each `expectRed`
entry's non-empty `signal` to appear in the failing **assertion message**.

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
canonical table and a registered mirror disagree (update-all-mirrors) — and any
new mirror found in review is added here on the spot (register-new-mirrors):

- [ ] Deliverables-table cells that restate a path or rule — `ledger.js` → Table
      A rows A1–A5; `ledger.test.js` → the acceptance criteria; `dream.js` →
      Table A row A5; `dream-pipeline.test.js` → criterion 5; the proofs file →
      Table B; the ADR row → Table A row A7 and owner item 1
- [ ] **ADR-0023 Amendment 4's prose** (registered in review, PR #307, round 1):
      the amendment this package writes restates Table A rows A1, A2, A4, A5,
      A6, A9 and A10 in sentences, so it is a mirror and defers to that table.
      Judge it as whole paragraphs, never grep windows — **three** of its
      sentences were corrected against the code in the commit that created
      them, which is the drift owner item 1's overrule cost names: *"A ledger
      that has never needed the retry does not gain the key"* (FALSE — the
      marker is set unconditionally; the **byte-compatibility** claim is what
      replaced it, and it is about the serializer omitting the key, not about
      the ledger never acquiring it), *"older code that drops the key causes at
      most one extra reconsideration"* (an UNDERSTATEMENT — the bound is per
      marker, not global: Table A row A4), and *"The retry never runs on a
      preview"* (FALSE — the sweep runs in memory on `--dry-run`; only the write
      is suppressed). *Corrected at the done-flip, erratum 5.*
- [ ] Acceptance criteria that assert its facts — criterion 1 asserts Table A
      rows A1, A5 and **A9** (its at-or-below-baseline file); criterion 2
      asserts Table A row A2; criterion 3 asserts Table A rows A3, A1 and
      **A10**; criterion 4 asserts Table A rows A4 and A6; criterion 5 asserts
      Table A row A5; criterion 6 asserts Table B; criterion 7 asserts Table A
      row A8
- [ ] Verification commands / greps — the `node -e` upgrade gate asserts Table A
      rows A1, A2, A3, A6, A9 and A10 over a real ledger file round-trip —
      including a file at or below the baseline; `npm test`
      carries every criterion's suite assertions; the **UNFILTERED**
      `npm run red-proofs` asserts Table B and catches a disarmed
      `pointer-derivation-doctor`
- [ ] Current-state description — `recordQuarantined`'s field list and the
      absent version (Table A row A4), `selectState`'s arm order, its
      `deferred` arm, and the baseline check that sits on the no-record path
      ALONE (rows A1, A8, A9), `secretDeferralCount`'s reason guard (row A10),
      **and every line cite in that section, re-pinned at the done-flip to
      `origin/main` at `8b4cbd4c`** (erratum 3), `readLedger`'s pinned `version` and
      `writeLedger`'s explicit literal (row A4), the collector's pre-parse skip
      and its fault boundary (row A3), and the two existing proofs files
      (Implementation notes) — all pinned to base `08de2bc3`
- [ ] Operative prose steps that apply it — **walked, in document order**:
      - Context's "the recovery is one-shot, not a policy change" → Table A rows
        A4 and A6
      - Context's release paragraph → `WP-transcript-parsers-harden-text-values`
        Table E row E3 and its owner item 2
      - "Exact contracts"' `retryParseThrewOnce` JSDoc → Table A rows A1 and A6
      - Implementation notes' `occurrences` sweep → Current state's proofs-file
        paragraph; its "convert, do not delete or branch" bullet → Table A rows
        A1 and A9
      - the Security checklist's bullets → Table A rows A2 and A4
      - Out of scope's entries → Table A row A8; owner item 1 → Table A row A7

## Implementation notes & constraints

- **No new npm dependencies** (CLAUDE.md), no TypeScript, JSDoc annotations
  only, nothing that outlives the process (ADR-0004).
- **Convert the record to `deferred`; do not delete it and do not add a
  `selectState` branch** (Table A rows A1, A9). Deletion is the obvious move and
  it is wrong: the no-record path consults `baseline_mtime` first and answers
  `skip-processed` for any file at or below it, so the retry silently fails for
  exactly the files whose mtime is old — and takes their `reports/warnings.md`
  line with it. Keeping a matching-fingerprint record bypasses the baseline
  entirely. A
  branch would be a permanent change to the skip rule, readable by every future
  run; a conversion is a one-time edit to data that leaves the rule alone. The
  Done spec's Table A row A6 is what makes the conversion sufficient once the
  record is selectable again.
- **The gate must survive a write** (Table A row A4). `writeLedger` serializes an
  explicit object literal, so a new top-level key added only to `readLedger` is
  dropped on the next write and the sweep silently re-runs forever. Table B's
  `rpt-gate-not-persisted` exists because that failure passes an in-memory test.
- **Before committing, grep every `tests/red-proofs/*.proofs.json` whose `file`
  is `src/core/dream/ledger.js` and confirm each `find` still occurs its
  declared number of times.** At base there is one: `pointer-derivation-doctor`
  in `quarantine-banner-location-doctor.proofs.json`, `occurrences: 1`. This is
  `WP-dream-collect-parse-throw-quarantine`'s Erratum 5 — an edit that re-spells
  a pinned line disarms a sibling package's guarantee and surfaces **only** in
  the unfiltered proof run.
- **A corrupt or missing ledger is not this package's problem.** `readLedger`
  already fails closed to an empty ledger; the sweep runs over whatever it
  returns and must not add error handling for a shape `readLedger` cannot
  produce.
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] Any untrusted identifier (version, name, path segment, filename) that flows
      into a filesystem path or a shell command is validated with a **fully
      anchored** pattern that rejects `/`, `\`, and `..`, in **every** language it
      passes through (e.g. JS `isSemver` AND the bash/PowerShell regex). A
      start-anchored-only check accepts `1.2.3/../../x` and becomes an
      arbitrary-write primitive (WP-022, WP-055). **Anchor correctly per engine:**
      in .NET/PowerShell `^…$` still matches *before* a trailing newline — use
      `\A…\z`; in JS `$` without the `m` flag is safe; in POSIX `grep` remember it
      is line-oriented (a multiline value with one valid line matches `^…$`), so
      confirm the value cannot contain a newline (WP-057).
- [ ] **Applied here: no path and no shell.** The sweep reads and removes keys
      from an object `readLedger` returned. Ledger **keys** are case-folded
      absolute paths and are attacker-influenceable, but they are only compared
      and rewritten in place — never opened, never rendered, never
      interpolated, and never removed (Table A row A9).
- [ ] **The un-quarantine is an allowlist of exactly one reason** (Table A row
      A2). It names `parse-threw` and converts nothing else. The failure that
      matters is the widened one: un-quarantining `secret-revert-exhausted`
      would return files the secret check deliberately made sticky, and
      un-quarantining `over-ceiling` would re-read files the ceiling exists to
      refuse. Table B's `rpt-reason-filter-widened` is that mutation.
- [ ] **The sweep is bounded and cannot be re-armed by file content** (Table A
      row A4). A third party who can cause a transcript to be written cannot
      cause the retry to run again: the gate is ledger-level state that no
      transcript byte reaches, and a re-quarantined file is skipped by the
      ordinary rule from then on.

## Acceptance criteria

- [ ] 1. **A transcript quarantined `parse-threw` before the upgrade is read
      again, with the file unchanged — INCLUDING one the baseline would
      otherwise skip.** Starting from a ledger holding a `parse-threw` record
      whose `fingerprint` still matches its file on disk, one `wienerdog dream`
      run admits that session, with no edit to the transcript and no change to
      its `size:mtimeMs:dev:ino`. **The corpus must contain at least one such
      file whose `mtimeMs` is at or below `baseline_mtime[harness]`**, and it
      must be admitted too — that is the case a deletion-based retry fails, and
      it is what `rpt-deletion-instead-of-deferral` is declared against (Table A
      rows A1, A5, A9).
- [ ] 2. **Nothing else is un-quarantined.** In the same run, records with
      `outcome: 'processed'` and `outcome: 'deferred'`, and quarantined records
      whose reason is `over-ceiling`, `too-many-lines`, `read-error`,
      `secret-revert`, `secret-revert-exhausted`, absent, non-string, or from an
      unknown later schema, are all **byte-identical** afterwards; and
      `baseline_mtime` and `oversizedExtracts` are unchanged (Table A row A2).
- [ ] 3. **A transcript that still fails is re-quarantined, not lost and not
      retried forever.** A file whose preparation still throws after the retry
      is recorded `parse-threw` again — as an `outcome: 'quarantined'` record,
      so it returns to `reports/warnings.md` and to `doctor`'s count — in the
      same run, and a second run skips it (Table A row A3). **And the converted
      record itself is well-formed:** it carries `outcome: 'deferred'`,
      `reason: 'parse-threw'`, the unchanged `fingerprint` and no `deferrals`,
      and `secretDeferralCount` returns `0` for it, so no secret-revert budget
      is consumed or invented (Table A rows A1, A10).
- [ ] 4. **Idempotent, and the gate survives a write.** Running `wienerdog dream`
      twice over the same state converts records on the first run and **zero**
      on the second — observed **after** a full `writeLedger` → `readLedger`
      round-trip through the file, not only in memory (Table A rows A4, A6).
- [ ] 5. **A dry run changes nothing on disk.** `wienerdog dream --dry-run` over
      a ledger holding `parse-threw` records reports what it would convert and
      leaves the ledger file byte-identical (Table A row A5).
- [ ] 6. **The declared RED proofs are `PROVEN`.** The **UNFILTERED**
      `npm run red-proofs` reports `RUN: PROVEN` for **every row of Table B** —
      the count is Table B's, not this criterion's; it is five (done-flip
      erratum 1, which corrected "three") — **and** for every declaration this
      package did not write — in
      particular `pointer-derivation-doctor`, whose `file` is the file this
      package edits — with no `FILTERED`, `VACUOUS`, `UNCONTROLLED`, `FAILED` or
      `ERROR` verdict anywhere.
- [ ] 7. **Nothing outside the Deliverables changed** (Table A row A8), and in
      particular `selectState` and `recordQuarantined` are byte-identical.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm run red-proofs   # UNFILTERED.
```

**The red-proofs line is the unfiltered run, and that is not a preference.**
`--wp <id>` leaves every other package's declarations unselected; `rollUp`
(`scripts/red-proofs.js:2152-2154`) marks any pair with a left-out declaration
`FILTERED`, and the exit code is `verdict === 'PROVEN' ? 0 : 1` (`:1893`). So a
scoped run reports `RUN: FILTERED` and exits **1** however green its selected
proofs are. It is also the only run that can show this package disarming
`pointer-derivation-doctor`, which is the concrete risk here.

```bash
# Table A row A8: the two functions this package must NOT change are
# byte-identical to the merge base. Fails loudly; the `test -f` guard matters
# because an unguarded diff over a missing file is not a red.
BASE=$(git merge-base HEAD origin/main)
{ test -f src/core/dream/ledger.js \
  && diff <(git show "$BASE":src/core/dream/ledger.js | sed -n '/^function selectState/,/^}/p') \
          <(sed -n '/^function selectState/,/^}/p' src/core/dream/ledger.js) \
  && diff <(git show "$BASE":src/core/dream/ledger.js | sed -n '/^function recordQuarantined/,/^}/p') \
          <(sed -n '/^function recordQuarantined/,/^}/p' src/core/dream/ledger.js) \
  && echo "SELECTSTATE AND RECORDQUARANTINED UNCHANGED OK"; } \
  || { echo "UNCHANGED-FUNCTION GATE FAILED"; exit 1; }
```

**Before trusting the upgrade gate below, observe it red.** It is a NEW
verification step, so run it in three states and paste all three: (a) on the
merge base, where case 1 must fail because no retry exists; (b) with the reason
equality widened to match any quarantined record, where case 2 must fail; (c) on
the finished change, where it must print `PARSE-THREW RETRY OK`. The
implementer writes this gate against the shape it ships — the cases and their
assertions are fixed by Table A rows A1, A2, A3 and A6, the mechanics are not.

## Out of scope (do NOT do these)

- **Changing `selectState` or `recordQuarantined`** (Table A rows A1, A8). The
  retry is a one-time edit to data, never a new rule. In particular do **not**
  "fix" the baseline check on the no-record path — row A9's hazard is avoided by
  keeping a record, never by changing what a missing record means.
- **A general "retry quarantines" command, flag or policy.** This package ships
  exactly one marker for exactly one parser revision (Table A row A4). A second
  retry later is a second deliberate decision, not a re-run of this one.
- **Un-quarantining any other reason** (Table A row A2), and in particular the
  sticky `secret-revert-exhausted`, whose stickiness is ADR-0023 Amendment 1's.
- **Hardening the metadata fields**, and any change under
  `src/core/transcripts/` — that is
  `WP-transcript-parsers-harden-text-values` and its own further successor.
- **`src/cli/doctor.js`, the digest banner and `reports/warnings.md`** — a
  converted record simply stops being an active quarantine —
  `activeQuarantines` (`src/core/dream/ledger.js:475-484` on the landed tree) selects
  `outcome === 'quarantined'` only — and the run's own outcome then rewrites it,
  so none of the three needs an edit (Table A rows A6, A8).
- **Amending ADR-0023 unless owner item 1 says so** (Table A row A7).

## Dispatch precondition — owner items

The item below is **a recommendation with the cost of overruling it, not a
direct ruling**. The standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the
architect records a recommendation with its overrule cost, the session may
dispatch under it, and **the owner reverses it by dated amendment**, applied by a
committed revision rather than by a dispatch message, because
`scripts/boundary-check.js` reads the Deliverables table in this file and nothing
a message says changes what CI sees. **Nothing in this repository records the
owner approving, accepting, ratifying or signing it, and this spec asserts no
such acceptance.**

**1. Does the ledger-level one-shot marker need an ADR-0023 amendment?**

- *Recommendation:* **yes, a short amendment, and it is docs-only.**
  `WP-dream-collect-parse-throw-quarantine`'s Table A row A12 argued that
  `parse-threw` needed no amendment *precisely because* it introduced "no record
  field, no counter and no new state". Table A row A4 introduces ledger-level
  state, so that argument no longer covers the family, and leaving the ADR
  silent would leave the next reader with a ratified sentence that the tree
  contradicts. The amendment says one thing: a quarantine reason whose cause is
  **our own code rather than the file** may be retried once per fix, gated by
  ledger-level state, and `parse-threw` is the first such reason.
- *Overrule cost:* none to the code — Table A row A7 — and the Deliverables row
  for the ADR file is conditional for that reason. The cost is that ADR-0023
  keeps a sentence that is no longer true of the implementation, which is the
  kind of drift the repo's own errata practice exists to catch. If overruled,
  say so in this spec by dated amendment so the contradiction is at least
  recorded where the next reader meets it.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) **The design gate is CLOSED at round 3**
   (`docs/runbooks/codex-review.md`, "Weighted closure"): rounds 1 and 2 carried
   HEAVY findings and round 3 returned **approve with no findings**. Each
   round's raw and focus were committed **before adjudication** — `8e2c0cef`
   (round 1), `d8bc9a57` (round 2), `0cf82f96` (round 3) — and the dispositions
   table is
   `docs/specs/logbook/2026-09-18-parse-threw-successors-design-review.md`.
   **This is a review gate, not owner approval:** nothing in this repository
   records the owner approving, accepting, ratifying or signing this package. Owner item 1 below stays open in the standing recommendation form. (b) Owner item 1 travels
   with this package as a recommendation; the owner reverses it by dated
   amendment, applied by a committed revision. (c) **Dispatch order:**
   `WP-transcript-parsers-harden-text-values` must be **merged** first — before
   it, this package's retry hands the same transcripts to the same unhardened
   parser and every one of them is simply re-quarantined, so criterion 1 cannot
   pass. (d) Every cite is pinned to base `08de2bc3` and was derived by
   construct; re-run the Current-state reading after the dependency lands, and
   re-derive construct by construct if anything has moved in
   `src/core/dream/ledger.js` or `src/cli/dream.js`. (e) Branch
   `wp/ledger-retry-parse-threw-on-upgrade`.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): give the hardened parser one bounded second look at parse-threw quarantines (WP-ledger-retry-parse-threw-on-upgrade)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
