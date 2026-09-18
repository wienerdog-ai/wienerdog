---
id: WP-ledger-retry-parse-threw-on-upgrade
title: Give the hardened parser one bounded second look at transcripts quarantined parse-threw before it existed
status: In-Review
model: opus
size: M
depends_on: [WP-transcript-parsers-harden-text-values]
adrs: [ADR-0004, ADR-0005, ADR-0023, ADR-0031, ADR-0042]
epic: transcript-fault-boundary
---

# WP-ledger-retry-parse-threw-on-upgrade: Give the hardened parser one bounded second look at transcripts quarantined parse-threw before it existed

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

1. **The quarantine record, `recordQuarantined` (`:326-334`)** writes exactly
   `{fingerprint: fingerprint(disc), outcome: 'quarantined', reason, updated_at, harness}`
   through `withRecord`. **It carries no version and no counter.** `appVersion`
   does exist in this file — but only on `oversizedExtracts` memo entries
   (`:103`, `:118-125`, `normalizeOversizedExtracts`), which are a different map
   with a different lifecycle and are not quarantine records.
2. **`selectState(ledger, disc)` (`:235-263`)**, in order: a present-but-corrupt
   record → `'select'`; a quarantined record whose `reason` is
   `SECRET_REVERT_EXHAUSTED_REASON` → `'skip-quarantined'` **without consulting
   the fingerprint** (the one sticky arm); then
   `if (rec.fingerprint !== fingerprint(disc)) return 'select';`; then a switch
   on `outcome` — `processed` → `'skip-processed'`, `quarantined` →
   `'skip-quarantined'`, `deferred` → `'select'`, default → `'select'`. With
   **no record at all**, it falls through to
   `if (typeof baseline === 'number' && disc.mtimeMs <= baseline) return 'skip-processed';`
   (`:260-261`) and only then to `'select'`. **The baseline check is reached
   ONLY on the no-record path** — a record that is present and whose fingerprint
   matches never consults it. That asymmetry is the whole of Table A rows A1 and
   A9: a *removed* record is not the same as a retryable one, and `'deferred'`
   is the outcome that already means "retry".
3. **`readLedger(stateDir)` (`:139-157`)** returns a fresh `emptyLedger()` on
   anything missing, corrupt or malformed — fail closed — and otherwise returns
   an object it **hard-pins to `version: 1`**. It never reads `obj.version`.
4. **`writeLedger(stateDir, ledger)` (`:160-177`)** serializes exactly
   `{version: 1, baseline_mtime, files, oversizedExtracts?}` — via
   `optionalOversizedExtracts`, which omits the memo map when empty to keep
   version-1 ledgers byte-compatible. **Any top-level key not in that literal is
   silently dropped on the next write**, which is why a one-shot marker is not
   free (Table A row A4).

**`src/cli/dream.js`** — `:708` reads the ledger, `:709-711` applies the
existing one-time `migrateFromWatermarks` migration and persists it with
`if (mig.migrated && !dryRun)`, and `:712` calls `collectExtracts`. That
three-line shape is the precedent Table A row A5 tells the implementer to copy,
and its comment at `:705-707` already carries the dry-run rule.

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
| modify | tests/unit/dream-pipeline.test.js | Whatever acceptance criterion 5 requires — the sweep observed through a real run |
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
| A1 | The mechanism | **CONVERT the record to a deferred one. Do not delete it, and do not add a `selectState` branch.** For each entry in `ledger.files` whose `outcome` is `'quarantined'` **and** whose `reason` is exactly `'parse-threw'`, rewrite that entry to `{fingerprint: <unchanged>, outcome: 'deferred', reason: 'parse-threw', updated_at: <now>, harness: <unchanged>}` — same key, same fingerprint, and **no `deferrals`**. `selectState` then takes the record-present path, matches the fingerprint, and hits `case 'deferred': return 'select'` (`src/core/dream/ledger.js:255-256`). **`selectState` is not edited and no new field is introduced**: `outcome: 'deferred'` and `reason: 'parse-threw'` are existing values of existing keys. **Deletion was the round-1 design and it is WRONG — row A9.** |
| A9 | Why deletion is wrong, and why `deferred` is the fix — MEASURED | **Deleting the record does not reliably select the file.** The no-record path consults the baseline first, so a file whose `mtimeMs` is at or below `baseline_mtime[harness]` answers **`skip-processed`**. That is reachable: a path that already carries a record is restored from a backup or a sync with an **older** timestamp; its changed fingerprint lets it be parsed, the unhardened parser throws, and it is quarantined `parse-threw` with an mtime below the baseline. After a deletion it is then **silently treated as already processed** — the hardened parser never runs, **and** removing the record also removes its line from `reports/warnings.md`, so the user loses the session *and* the notice of having lost it. Measured on the base tree with `baseline_mtime.codex = 2000` and a file at `mtimeMs = 1000`: quarantined → `skip-quarantined`; **after deletion → `skip-processed`**; **converted to `deferred` → `select`**. Conversion works because the baseline sits on the no-record path alone, so keeping *any* matching-fingerprint record bypasses it. Found by the design gate, round 2 (Astra, medium, band A). |
| A10 | The converted record does not disturb the secret-revert budget — MEASURED | `secretDeferralCount`'s `deferred` arm (`src/core/dream/ledger.js:288-289`) begins `if (rec.reason !== SECRET_REVERT_REASON) return 0;`, so a `deferred` record carrying `reason: 'parse-threw'` and no `deferrals` counts as **0** deferrals — the full budget, not an invented exhaustion. Measured on the base tree: `secretDeferralCount` returns `0` for exactly the record row A1 writes. **This is why row A1 keeps `reason: 'parse-threw'` on the converted record rather than dropping it:** the reason is what makes the record legible to that guard, and it is what tells the next reader why a deferral exists. |
| A2 | What it must not touch | Every record whose `outcome` is not `'quarantined'`; every quarantined record whose `reason` is anything other than `'parse-threw'` — including `over-ceiling`, `too-many-lines`, `read-error`, `secret-revert`, `secret-revert-exhausted`, a missing `reason`, a non-string `reason` and a reason from a later schema; `baseline_mtime`; and `oversizedExtracts`. The match is a **positive equality test on our own literal**, never a rejection list. |
| A3 | What happens to a file that still fails | **Nothing new.** The dream's existing `parse-threw` fault boundary re-quarantines it under the same reason, with a fresh `updated_at`, exactly as it would a file it had never seen. No code in this package participates. |
| A4 | The one-shot gate, and why it costs new state | The sweep must run **once per install**, not nightly: after `WP-transcript-parsers-harden-text-values`, a `parse-threw` can still arise outside the four hardened joins (the metadata path), and re-reading, re-parsing and re-throwing on such a file every night is the repeated cost ADR-0023's quarantine exists to stop. (Row A1's conversion sharpens this rather than softening it: `selectState` answers `'select'` for a `deferred` record on **every** run, so without the gate the sweep would re-arm that retry nightly.) The gate cannot live on the record (that is Table A row A2's promise and the Done spec's row A2). It cannot reuse the schema version either: `readLedger` hard-pins `version: 1` and never reads `obj.version` (`:139-157`). So it is **one new top-level ledger key**, written once — and because `writeLedger` (`:160-177`) serializes an explicit literal, `writeLedger`, `readLedger` and the `Ledger` typedef must all learn it or it is dropped on the next write. Its value is a **marker for this retry**, not a general app-version field: the package introduces exactly one retry, so a later retry needs a later marker and a deliberate decision, never an automatic re-run. |
| A5 | Where it runs, and when it persists | Once per `wienerdog dream` invocation, in `src/cli/dream.js`, **after `readLedger` and before `collectExtracts`**, so the same run that converts the records also reconsiders the files. **There is an exact precedent to copy, three lines above the insertion point:** `migrateFromWatermarks` at `src/cli/dream.js:709-711` is a one-time, idempotent ledger migration that returns `{ledger, migrated}`, is applied between `readLedger` (`:708`) and `collectExtracts` (`:712`), and persists with `if (mig.migrated && !dryRun) ledgerLib.writeLedger(…)`. Take that shape. Its own comment (`:705-707`) already states the dry-run rule this row inherits: *"a preview run must not permanently mutate state. On dry-run the migrated ledger is used in-memory only; migration is idempotent, so the next real run re-migrates identically."* |
| A6 | Idempotence, and what a crashed run leaves behind | Running `wienerdog dream` twice converts records on the first run and **zero** on the second, because the gate is set. This is the template's idempotence criterion, and it is acceptance criterion 4 rather than `N/A`. **A run that dies between the sweep's write and the collection leaves `deferred` `parse-threw` records, and that state is self-healing rather than stuck:** the gate stops the sweep re-running, but `selectState` answers `'select'` for a deferred record anyway, so the next run reconsiders those files once and writes their real outcome. `reports/warnings.md` may lag by one run in that window, which ADR-0023 Amendment 2 already permits in terms — `src/cli/doctor.js:487-493` states that the vault warnings file *"is derived from it and can legitimately lag by one dream run"*. |
| A7 | ADR status | **Open — owner item 1**, and row A1's conversion strengthens the case rather than weakening it. `WP-dream-collect-parse-throw-quarantine`'s Table A row A12 concluded that `parse-threw` needed no ADR-0023 amendment *because* it introduced "no record field, no counter and no new state". **Two** things now exceed that premise: row A4's ledger-level gate, and row A1's new state transition `quarantined → deferred`, which also produces a record combination the tree has never held — a `deferred` record whose `reason` is not `secret-revert`. That filed spec's row **A2** still holds exactly (no new field, no counter, no stickiness; `recordQuarantined` untouched). Whether this is a lifecycle change ADR-0023 must record is the owner's call. **This package ships the same code either way**; only the ADR file moves, which is why its Deliverables row is conditional. |
| A8 | What is NOT changed | `selectState`, `recordQuarantined`, `fingerprint`, `withRecord`, the sticky `secret-revert-exhausted` arm, `INFORMATIONAL_QUARANTINE_REASONS`, the digest banner, `reports/warnings.md`, `wienerdog doctor`, `src/core/dream/scratch.js` and every file under `src/core/transcripts/`. None is in the Deliverables. |

**Table B — the declared RED proofs (ADR-0042).** One file,
`tests/red-proofs/ledger-retry-parse-threw.proofs.json`, whose `suite` is
`tests/unit/ledger.test.js`.

| Proof id | Criterion | Mutation (exact-substring, in `src/core/dream/ledger.js`) | What it proves |
|----------|-----------|------------------------------------------------------------|----------------|
| `rpt-deletion-instead-of-deferral` | 1 | replace Table A row A1's conversion with a deletion of the entry | **the round-2 defect, declared so it cannot come back.** Under the mutation every retry test whose file's `mtimeMs` is ABOVE `baseline_mtime` stays green — deletion selects those — and only the at-or-below-baseline case reddens. It is therefore also the proof that criterion 1's corpus contains such a file; a criterion-1 test built only from above-baseline files would observe nothing here |
| `rpt-reason-filter-widened` | 2 | widen Table A row A1's reason equality so it matches any quarantined record | the assertion observes **which** records survive, not merely that something was dropped. Under the mutation the retry still "works" for `parse-threw` and silently un-quarantines every sibling reason — including the sticky `secret-revert-exhausted`, which ADR-0023 Amendment 1 made sticky on purpose |
| `rpt-gate-never-set` | 4 | remove the write of Table A row A4's one-shot marker | the assertion observes the **second** run, not just the first. Without the gate the sweep is correct once and then re-runs nightly, which is the bounded-cost property ADR-0023 exists for |
| `rpt-gate-not-persisted` | 4 | remove the marker from `writeLedger`'s serialized literal | the gate is set in memory and lost on write — a defect invisible to any single-process test that does not round-trip through the file. This mutation is declared because Current state item 4 says the drop is silent |
| `rpt-reason-dropped-on-conversion` | 3 | remove `reason: 'parse-threw'` from the record Table A row A1 writes | a `deferred` record with no reason still selects, so a test that only checks "the file was read again" stays green — while `secretDeferralCount`'s guard (`:288-289`) loses the value it keys on and the record stops saying why it is pending. The assertion observes the written record, not just the selection (Table A row A10) |

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
      ALONE (rows A1, A8, A9), `secretDeferralCount`'s reason guard (row A10), `readLedger`'s pinned `version` and
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
      `npm run red-proofs` reports `RUN: PROVEN` for all three Table B
      declarations **and** for every declaration this package did not write — in
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
  `activeQuarantines` (`src/core/dream/ledger.js:390-399`) selects
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
