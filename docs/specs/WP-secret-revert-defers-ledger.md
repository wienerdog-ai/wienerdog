---
id: WP-secret-revert-defers-ledger
title: A secret-reverted dream must not mark its source transcripts processed — defer them and bound the retry
status: In-Review
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0023, ADR-0024, ADR-0031]
epic: secret-lifecycle
---

# WP-secret-revert-defers-ledger: a reverted dream defers its inputs instead of consuming them

## Context (read this, nothing else)

Wienerdog's nightly **dream** reads the user's Claude Code / Codex CLI
**transcripts**, feeds them to a `claude -p` "brain", and commits the notes the
brain wrote into the user's markdown **vault** — one git commit per run. Which
transcripts a run may read is decided by the **transcript ledger**
(`~/.wienerdog/state/transcript-ledger.json`, ADR-0023): one record per
transcript file, keyed by case-folded absolute path, carrying a
content-independent fingerprint (`size:mtimeMs:dev:ino`) and an outcome.

ADR-0023 states the governing principle **verbatim**:

> *capacity-deferred* → **no negative record at all.** A valid file that did not
> fit this run's byte budget simply has no `processed` entry, so it is naturally
> retried next run. This is the structural fix for the WP-048/WP-069 starvation
> class: only a file actually consumed is marked `processed`.

Before the commit, every staged note passes ADR-0024's **EP2 staged-output secret
gate** (`src/core/dream/validate.js`): the shared detector `scanAndRedact` runs
over the git-computed staged **added** lines, and **any** finding of **either**
severity reverts that whole note. The note is not committed; a byte-identical
copy is preserved in `state/quarantine/`; a warning is surfaced.

**The bug.** When EP2 reverts, the run still records every transcript it read as
`processed`. Nothing was consumed — the derived output was thrown away — so the
content never regenerates. On the maintainer's machine this happened twice,
**2026-07-24** and **2026-07-25**, three notes reverted each night with the
source transcripts marked `processed` both times: the 07-24 daily rollup is
**gone for good**, the 07-25 notes had to be restored by hand out of
`state/quarantine/`. A detector false positive became permanent memory loss — the
WP-048/WP-069 starvation class ADR-0023 was written to make impossible.

This WP restores the stated principle: **a transcript whose derived output was
reverted by the secret gate is not `processed`.** It is deferred and naturally
retried next run, exactly like a capacity-deferred file, so the system becomes
self-healing: revert → no ledger advance → the cause is fixed → the next dream
retries the same transcripts and succeeds. The retry is **bounded**, and the
bound is built so that appending to a transcript cannot reset it (Table E).

**This package ships first, and it ships alone.** It is the only change that
stops the live harm: after it lands, a detector false positive costs a *deferral*
instead of a *note*. It has **no dependency** on the secret-fence rewrite
(`WP-secret-fence-shape-and-context`), the allowlist
(`WP-secret-allowlist-exact-value-store`) or the review CLI
(`WP-quarantine-review-cli`) — none is referenced by any code path here. Do not
wait for them and do not assume they will land in their current shape.

**There is deliberately no reset command here** (Table E row E6). An earlier
draft cleared the bound from `wienerdog sync`, which makes ordinary command
execution stand in for human intent — `src/cli/update.js` spawns `sync`, so a
script or an unrelated sync would re-arm the offender. Clearing an exhausted
transcript belongs to `WP-quarantine-review-cli`, behind a typed confirmation.
**Until that ships an exhausted transcript stays exhausted, and that is not data
loss:** the transcript file is untouched on disk, the withheld note is
byte-identical in `state/quarantine/`, and only its *consolidation* waits — where
today's behaviour loses the note **and** marks the transcript `processed` so it
can never regenerate. The one reset that does exist is automatic: a clean run
records what it consumed as `processed` and those counters are gone (E1).

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP starts no process,
adds no dependency and no telemetry; it changes which record a JSON state file
gets, adds two fixed banner sentences and one fixed console line.

### Bug fix or ADR amendment? Both, split precisely

The behaviour change is a straight **bug fix**: ADR-0023 already says only a file
*actually consumed* is marked `processed`, and the current code contradicts the
ADR it implements. The **bounded retry is new architecture** and needs a dated
amendment: a fourth record kind (`deferred`, carrying a counter), a fifth
quarantine reason class and a narrow exception to the retry-on-fingerprint-change
rule are durable facts that must not live only in code. The amendment text below is
verbatim and is a deliverable. Amending in place follows this repo's practice for
a living ADR — ADR-0021 carries "Amendment 1 (2026-07-20)" in the same shape —
despite `docs/adr/README.md`'s "supersede, never edit", which is about reversing
a decision, not extending one.

## Current state

### `src/core/dream/ledger.js` (203 lines, pure data + fs, zero deps)

Exports today: `LEDGER_BASENAME`, `foldKey`, `fingerprint`, `displayName`,
`ledgerPath`, `readLedger`, `writeLedger`, `migrateFromWatermarks`,
`selectState`, `recordProcessed`, `recordQuarantined`, `activeQuarantines`.

```js
/** @typedef {{version:1,
 *            baseline_mtime:{claude:number|null, codex:number|null},
 *            files: Record<string, {fingerprint:string, outcome:'processed'|'quarantined',
 *                                   reason?:string, updated_at:string, harness:'claude'|'codex'}>}} Ledger */

function selectState(ledger, disc) {          // 'select'|'skip-processed'|'skip-quarantined'
  const files = (ledger && ledger.files) || {};
  const rec = files[foldKey(disc.path)];
  if (rec) {
    if (rec.fingerprint !== fingerprint(disc)) return 'select'; // the file changed → reprocess
    return rec.outcome === 'quarantined' ? 'skip-quarantined' : 'skip-processed';
  }
  const baseline = ((ledger && ledger.baseline_mtime) || {})[disc.harness];
  if (typeof baseline === 'number' && disc.mtimeMs <= baseline) return 'skip-processed';
  return 'select';
}

function recordQuarantined(ledger, disc, reason) { /* reason ∈ 'over-ceiling'|'too-many-lines'|'read-error' */ }
function activeQuarantines(ledger) { /* [{file: displayName(key), reason, harness}], sorted by file */ }
```

`readLedger` is deliberately **total** (missing/corrupt/mis-shaped → an empty
ledger, never a throw) and deliberately does **not** validate individual file
records: it returns `files: obj.files` as-is. Every consumer must therefore treat
a record as untyped input. That is the reason Table B and Table F below are
specified as exhaustive switches with an explicit default.

`displayName(absPath)` is the shared attacker-safe basename sanitizer: case-folds,
takes the basename, and replaces every byte outside `[A-Za-z0-9._-]` with `_`. A
raw basename is attacker-influenceable, so **only** `displayName` output and the
code-owned reason enum may reach a banner.

### `src/cli/dream.js`

Step 14, immediately after `validateAndCommit` returns, is the whole ledger write
path for consumed files:

```js
    // 14. Record the per-file outcomes — only now: brain 0 + inputs intact +
    //     commit ok (the exact WP-069 watermark-safety property, per-file). A
    //     capacity-deferred file is in NEITHER processed nor newlyQuarantined →
    //     no record → naturally retried next run (the WP-048/069 starvation
    //     fix, structural — no scalar can jump past an unconsolidated session).
    for (const d of sel.processed) ledger = ledgerLib.recordProcessed(ledger, d);
    ledgerLib.writeLedger(paths.state, ledger);
```

`sel.processed` is `Array<{harness:'claude'|'codex', path:string, mtimeMs:number,
size:number, dev:number, ino:number}>` — every session actually written to
scratch this run (`src/core/dream/scratch.js`). `res` is `validateAndCommit`'s
return value and already carries **`res.secretReverts`** — the count of files the
EP2 gate reverted this run (both the finding case and the binary-unscannable
case). Nothing consumes it today.

Earlier in the same file, `regenerateDigest()` builds the transcript-quarantine
banner **inline**: `const q = ledgerLib.activeQuarantines(ledger);` followed by a
ternary that renders the Table D row D1 string when `q.length > 0` and `''`
otherwise. Both lines are deleted by this WP.

### `src/cli/sync.js`

`sync` re-renders the same `state/digest.md` (line ~275, `renderDigest(vaultPath,
layout, {...})`) and passes `secretQuarantine: listSecretQuarantine(paths.state)`
but **does not pass `quarantineLine` at all**. So today any `wienerdog sync`
silently erases the transcript-quarantine banner from the injected digest
until the next dream re-renders it. ADR-0023 requires that banner to be
"re-rendered every digest as long as the quarantine is active"; this WP closes
that hole with an executable regression (a grep proving a call site exists does
not prove the banner survives). That one argument is the **only** change this WP
makes to `sync.js`: sync reads the ledger and never writes it.

### `src/core/dream/scratch.js` — why an actively-appended transcript starves everything else

`collectExtracts` filters discovery through `selectState(...) === 'select'`, then
water-fills `dream_max_input_bytes` over the candidates **sorted newest-mtime
first**; when the remaining equal share drops below `MIN_TRUNCATE_BYTES` (32 768)
the **oldest** active candidate is capacity-deferred whole. An actively-appended
transcript therefore has the newest mtime and wins the budget every night. Two
consequences drive this WP's design:

- a bound that resets when the fingerprint changes is **not a bound** for exactly
  the file that most needs one (Table E row E2);
- a quarantine that re-opens on a fingerprint change lets that same file keep
  eating the budget nightly, starving new sessions — the WP-048 class in a new
  dress (Table B row B1).

### `src/core/dream/validate.js` — what `secretReverts` counts

`validateAndCommit` returns `{committed, reverted[], outOfVault[], sha, counts,
secretReverts}`. `secretReverts` is incremented **only** inside the EP2 staged-output
gate (Step 3), once per file, for both the finding case and the binary-unscannable
case. `reverted[]` is a superset: it also holds tier-3 floor, identity-freeze,
skill-body and out-of-vault reverts, which are *policy* rejections of correctly-refused
content (Table C row C6).

### Already correct — do not weaken

- **WP-069 watermark safety.** State advances only after the brain exited 0
  (`runBrainWithWatchdog` did not throw), the inputs were intact
  (`scratchIntact(sel.wrote, scratchBaseline)`) **and** the commit succeeded
  (`validateAndCommit` returned). All three guards precede step 14 and stay
  exactly as they are; this WP only adds a **fourth** condition on recording
  `processed`, never a weaker one.
- **Capacity deferral (WP-048/WP-069).** A file dropped for capacity is in
  neither `sel.processed` nor `sel.newlyQuarantined`, so it gets **no record**
  and is retried. Unchanged, and asserted by existing tests this WP must not edit.
- **Intake quarantines.** `sel.newlyQuarantined` (`over-ceiling`,
  `too-many-lines`, `read-error`) is recorded and bannered at step 5b, before the
  brain runs. Unchanged, including its retry-on-change behaviour.

### Tests that already cover this path

- `tests/unit/ledger.test.js` — pure unit tests over the ledger module.
- `tests/unit/dream-collect.test.js` — drives `collectExtracts` against a temp
  home with helpers `tempPaths()`, `emptyLedger()`,
  `writeClaude(paths, id, msgCount, msgLen, when)`, `writeCodex(paths, id, when)`
  and an explicit `maxInputBytes` argument. Existing capacity tests at ~line 205
  and ~line 329 are the shape to copy.
- `tests/integration/dream.test.js` — drives `src/cli/dream.js` `run()` against a
  temp HOME with a fake brain (`tests/fixtures/dream/fake-brain.js`, selected by
  `WIENERDOG_FAKE_BRAIN_MODE`) and asserts ledger records via `readLedgerFile` /
  `ledgerRecord(ledger, 'inj.jsonl')`. `setup({maxInputBytes})` writes
  `config.yaml`; `runDream(ctx, argv, extraEnv)` returns `{output, thrown}`.
  Existing modes: `hang`, `crash`, `unknown-command`, `unknown-command-stderr`,
  `bare-marker-break-git`, `near-marker`, `vanish-scratch`, `bare-marker-after-writes`.
- `tests/unit/sync-repoint.test.js` — the hermetic harness for `sync.run()`: temp
  HOME + `WIENERDOG_HOME`, `WIENERDOG_LOADER_NOOP=1`, harness dirs pointed at
  absent paths, a saved manifest, stdout silenced. Copy its `setup()`/`runSync()`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/ledger.js | extend the `Ledger` typedef (Table A); add `SECRET_REVERT_REASON`, `SECRET_REVERT_EXHAUSTED_REASON`, `SECRET_REVERT_MAX_DEFERRALS`, `secretDeferralCount`, `recordSecretDeferred`, `recordSecretExhausted`, `quarantineBannerLine`, `secretRevertSummaryLine` and export all eight; rewrite `selectState` per Table B. `recordProcessed`, `recordQuarantined` and the internal `withRecord` keep their current signatures, record shapes and path key |
| modify | src/cli/dream.js | step 14 branches per Table C; the run summary comes from `ledgerLib.secretRevertSummaryLine` (Table D row D3); `regenerateDigest` uses `ledgerLib.quarantineBannerLine(ledger)` instead of the inline template |
| modify | src/cli/sync.js | add the `ledger` require and pass `quarantineLine` into `renderDigest`. Nothing else — sync must not write the ledger |
| modify | docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md | append ONE dated amendment section, verbatim from "The ADR-0023 amendment" below. Change nothing else in that file |
| modify | tests/unit/ledger.test.js | unit tests for Tables A, B, D and F |
| modify | tests/unit/dream-collect.test.js | the two capacity-fairness cases and the rename-residual fixture in Acceptance criteria. Change no existing test |
| create | tests/unit/sync-digest-quarantine.test.js | the sync regression: the banner survives a sync (Table D row D6) and sync writes no ledger |
| modify | tests/fixtures/dream/fake-brain.js | ONE new mode, `secret-note` (contract below). Change no existing mode |
| modify | tests/integration/dream.test.js | the end-to-end tests listed in Acceptance criteria. Change no existing test |

### Exact contracts

#### `src/core/dream/ledger.js` — new constants and functions

```js
/** The `reason` on a record DEFERRED because this run's derived output was
 *  reverted by the EP2 staged-output secret gate (ADR-0024). Code-owned. */
const SECRET_REVERT_REASON = 'secret-revert';

/** The `reason` on a QUARANTINE record written once a file has accumulated
 *  SECRET_REVERT_MAX_DEFERRALS deferrals. Code-owned. */
const SECRET_REVERT_EXHAUSTED_REASON = 'secret-revert-exhausted';

/** How many secret-revert DEFERRALS one transcript may accumulate: three are
 *  recorded (1, 2, 3) and the FOURTH consecutive secret-reverted run that
 *  consumes the file quarantines it instead. Table A row A6 says why 3. */
const SECRET_REVERT_MAX_DEFERRALS = 3;

/**
 * How many secret-revert deferrals this file has ALREADY accumulated. An
 * exhaustive switch per Table F over the record at foldKey(disc.path) — the same
 * path key every other record kind uses (ADR-0023 §2). Deliberately INDEPENDENT
 * of the fingerprint — an appended transcript is the same episode, and resetting
 * on append is what would make the bound unbounded (Table E row E2).
 * @param {Ledger} ledger
 * @param {{path:string}} disc
 * @returns {number} an integer in [0, SECRET_REVERT_MAX_DEFERRALS]
 */
function secretDeferralCount(ledger, disc)

/**
 * Return a NEW ledger with one file recorded as secret-revert deferred (pure).
 * A `deferred` record is NOT a negative record: selectState returns 'select' for
 * it (Table B row B5). It exists only to carry the bounded counter. Record shape
 * and the out-of-range clamp: Table A row A4.
 * @param {Ledger} ledger @param {object} disc @param {number} deferrals
 * @returns {Ledger}
 */
function recordSecretDeferred(ledger, disc, deferrals)

/**
 * Return a NEW ledger with one file QUARANTINED because its deferrals are spent
 * (pure). Same shape minus `deferrals`, reason SECRET_REVERT_EXHAUSTED_REASON.
 * Separate from recordQuarantined so the three intake reasons keep their exact
 * shape and their retry-on-fingerprint-change behaviour (Table E row E7).
 * @param {Ledger} ledger @param {object} disc @returns {Ledger}
 */
function recordSecretExhausted(ledger, disc)

/**
 * The code-owned transcript-quarantine banner, derived from the ledger alone:
 * displayName output + the code-owned reason enum ONLY — never a path, never
 * content, never a matched value. Table D is canonical for the text.
 * @param {Ledger} ledger @returns {string} '' when no quarantine is active
 */
function quarantineBannerLine(ledger)

/**
 * The code-owned console summary for a secret-reverted run. Renders any argument
 * that is not a non-negative safe integer as 0, which is what makes it
 * structurally impossible for a basename, a path or a matched value to enter
 * this line. Table D row D3 is canonical.
 * @param {{withheld:number, deferred:number, quarantined:number}} counts
 * @returns {string}
 */
function secretRevertSummaryLine(counts)
```

The record written by `recordSecretDeferred` (Table A is canonical):

```json
{
  "fingerprint": "4096:1753400000000:16777232:8412345",
  "outcome": "deferred",
  "reason": "secret-revert",
  "deferrals": 2,
  "updated_at": "2026-07-25T02:11:04.881Z",
  "harness": "claude"
}
```

The `fingerprint` on a `deferred` record is diagnostic only: **no decision reads
it** — not `selectState` (B5), not `secretDeferralCount` (Table F). The record
carries no other new field: it is keyed and looked up by folded absolute path,
exactly like every other record kind (ADR-0023 §2, `src/core/dream/ledger.js`
lines 125 and 137). Do **not** add a file-identity field of any kind (see
residual R4 for why an inode identity was considered and rejected).

#### `src/cli/dream.js` — step 14

Replace the single `for` loop with the Table C branch. `res.secretReverts` is
already in scope.

```js
    // 14. Record the per-file outcomes — only now: brain 0 + inputs intact +
    //     commit ok (the WP-069 watermark-safety property, per-file), AND the
    //     EP2 secret gate reverted nothing. A secret-reverted run consumed
    //     nothing: the reverted note is not committed and will not regenerate,
    //     so marking its sources `processed` is the 2026-07-24/25
    //     permanent-memory-loss bug. Those files are DEFERRED (retried next run,
    //     like capacity-deferred) up to SECRET_REVERT_MAX_DEFERRALS, then fall
    //     through to ADR-0023's quarantined outcome. Table C. Fail closed on the
    //     counter: anything that is not a non-negative safe integer counts as
    //     "this run reverted", never as zero.
    const reverts = res.secretReverts;
    const revertsKnown = Number.isSafeInteger(reverts) && reverts >= 0;
    const cleanRun = revertsKnown && reverts === 0;
    let deferredCount = 0;
    let quarantinedCount = 0;
    for (const d of sel.processed) {
      if (cleanRun) {
        ledger = ledgerLib.recordProcessed(ledger, d);
        continue;
      }
      const prior = ledgerLib.secretDeferralCount(ledger, d);
      if (prior >= ledgerLib.SECRET_REVERT_MAX_DEFERRALS) {
        ledger = ledgerLib.recordSecretExhausted(ledger, d);
        quarantinedCount += 1;
      } else {
        ledger = ledgerLib.recordSecretDeferred(ledger, d, prior + 1);
        deferredCount += 1;
      }
    }
    ledgerLib.writeLedger(paths.state, ledger);
    if (!cleanRun) {
      console.log(
        ledgerLib.secretRevertSummaryLine({
          withheld: revertsKnown ? reverts : 0,
          deferred: deferredCount,
          quarantined: quarantinedCount,
        })
      );
    }
```

Counts only — no basenames, no paths, no content, no matched value.

#### `src/cli/dream.js` — `regenerateDigest`

Delete the inline template and its `const q = ...` line; use
`const quarantineLine = ledgerLib.quarantineBannerLine(ledger);`. Everything else
there is unchanged. For a ledger with no `secret-revert-exhausted` record the
rendered bytes are **identical** to today (Table D row D1), so no golden fixture
may change. If one does, stop and report it: this spec does not authorize a
golden update.

#### `src/cli/sync.js`

Add `const ledgerLib = require('../core/dream/ledger');` alongside the existing
requires, and add **one** option to the existing `renderDigest` call (leave
`secretQuarantine: listSecretQuarantine(paths.state)` and everything else exactly
as it is):

```js
      // ADR-0023: the transcript-quarantine banner is re-rendered in EVERY
      // digest while a quarantine is active — sync dropping it was the
      // 2026-07-25 hole. Read-only: sync never writes the ledger and never
      // clears the secret-revert bound (Table E row E6).
      quarantineLine: ledgerLib.quarantineBannerLine(ledgerLib.readLedger(paths.state)),
```

`readLedger` never throws (missing/corrupt → an empty ledger → `''`, which
`renderDigest`'s `.filter((s) => s !== '')` drops). No other line of `sync.js`
changes; in particular `writeLedger` must not appear in this file.

#### `tests/fixtures/dream/fake-brain.js` — new mode `secret-note`

Follow the shape of the existing `if (process.env.WIENERDOG_FAKE_BRAIN_MODE ===
'...')` blocks. Place it **after** the numbered writes (so the normal writes and
the dream report still happen and the run still commits) and **fall through** to
`process.exit(0)`. It writes **one** extra note whose added content trips the
shipped detector on a labelled rule — not on entropy, which the concurrent
`WP-secret-fence-shape-and-context` rewrites:

```js
// Secret-revert mode (WP-secret-revert-defers-ledger): one ordinary Tier-1
// note whose body carries a labelled-rule match (`AKIA[0-9A-Z]{12,}` →
// 'aws-key'), so validateAndCommit's EP2 gate reverts exactly this note and
// increments secretReverts, while the rest of the run commits normally.
if (process.env.WIENERDOG_FAKE_BRAIN_MODE === 'secret-note') {
  write(
    '00-Inbox/session-rollup.md',
    ['---', 'type: note', 'derived_from_untrusted: false', '---', '', 'Ada rotated the key AKIAQQQQQQQQQQQQQQQQ during the session.', ''].join('\n')
  );
}
```

Do not use a real credential, and do not reuse a high-entropy blob. The note is
re-created identically on every run (the previous run's revert removed it), so
each run of this mode produces exactly one secret revert.

### The ADR-0023 amendment (exact text and target)

Append this as the LAST content of
`docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md`, after
"Alternatives considered", introduced by a new `## Amendments` heading. Change
nothing else in that file.

```markdown
## Amendments

### Amendment 1 (2026-07-25) — a secret-reverted run defers its inputs, with a bounded, fingerprint-independent retry

Decision §2's "Three outcomes, distinctly" did not anticipate a run in which the
brain exited 0, the inputs were intact and the commit succeeded, but ADR-0024's
EP2 staged-output secret gate **reverted** the derived note. Such a run consumed
nothing — the reverted note is not committed and will not regenerate — yet the
implementation recorded every transcript it read as `processed`. Observed twice
on the maintainer's machine (2026-07-24 and 2026-07-25, three notes reverted each
night): a detector false positive became **permanent memory loss**, precisely the
WP-048/WP-069 starvation class this ADR exists to make impossible.

**Resolution, in four parts.**

1. **A transcript whose derived output was secret-reverted is not `processed`.**
   This is a restatement of the principle already in §2 ("only a file actually
   consumed is marked `processed`"), not a new one.
2. **A fourth record kind, `deferred`, carries a bounded deferral counter.**
   Capacity deferral keeps its "no negative record at all" semantics, unchanged.
   A secret-revert deferral instead writes a record `{outcome:'deferred',
   reason:'secret-revert', deferrals:n}`. It is **not** a negative record: the
   selection rule returns *select* for it, exactly as if no record existed. Its
   only purpose is to bound the retry.
3. **The counter ignores the fingerprint, and an exhausted quarantine is
   sticky.** §2's general rule — a record whose fingerprint differs is retried —
   resets on any `size:mtimeMs:dev:ino` change. A transcript that is still being
   appended to changes every night, so a fingerprint-keyed counter would reset
   every night and bound nothing; and because the byte budget is water-filled
   newest-mtime-first, that same file would win the budget every night and
   starve genuinely new sessions — the WP-048 class in a new dress. Therefore
   the deferral counter is computed **independently of the fingerprint**, and a
   `quarantined` record whose reason is `secret-revert-exhausted` is skipped
   **regardless of** the fingerprint. This is a narrow, reason-scoped exception:
   the intake reasons (`over-ceiling`, `too-many-lines`, `read-error`) keep §2's
   retry-on-change behaviour unchanged.
4. **Exactly one thing resets the bound, and it is evidence that the world
   changed.** A run that commits with **zero** secret reverts records the files
   it consumed as `processed`, which erases their counters — the system heals
   itself the moment the cause is gone. Nothing else resets it: no timer, no
   automatic clear on a later run, no daemon (ADR-0004), and deliberately **no
   side effect of any other command** — a reset an unattended `wienerdog update`
   or a scripted `wienerdog sync` can trigger is not a human decision. Clearing
   an *exhausted* transcript is a separate, explicitly authorized recovery action
   specified in `WP-quarantine-review-cli`; until that ships an exhausted
   transcript stays skipped, which is not data loss — the transcript file is
   untouched and the withheld note is byte-identical in `state/quarantine/`, so
   only its consolidation waits.

**The bound.** A file may accumulate **three** deferrals; the **fourth**
consecutive secret-reverted run that consumes it quarantines it instead, with the
code-owned reason `secret-revert-exhausted`. The human is warned on the first
night and every night after, so the quarantine lands roughly 72 hours after the
first warning.

**Consequences.** Deferral is run-scoped: there is no trustworthy mapping from a
reverted vault note back to the transcripts it derived from, so a run with any
secret revert defers **all** of that run's consumed transcripts. Reprocessing
them re-commits content that run already committed, which the dream's note-update
path tolerates. A transcript merely co-consumed with the offender across three
consecutive reverted runs is quarantined alongside it — accepted, because
attribution is impossible and the alternative is an unbounded nightly retry.
Unlike the pre-amendment behaviour this is loud (a durable digest banner names
the files and says where the withheld copies are), non-destructive (the
transcript file is untouched and the withheld note's bytes are byte-identical in
`state/quarantine/`) and self-healing while the deferrals last (part 4). Records
stay keyed by case-folded absolute path (§2, unchanged), so a rename or rotation
hands the file a fresh budget and a file appearing at a reused path inherits the
record left there; neither harness renames or rotates a transcript, so both are
named residuals in the work package rather than claims of impossibility.

**What is unchanged.** The WP-069 state-advance safety gate — brain exited 0 AND
inputs intact AND commit succeeded — is untouched; this amendment only adds a
fourth condition before recording `processed`, never a weaker one. Capacity
deferral still records nothing at all.
```

## Contract reference

The ADR-0031 activation trigger fires on five of seven: **(ii)** a result
taxonomy changes; **(iii)** an untyped persisted record must be validated on read
(`readLedger` returns file records unvalidated); **(iv)** reason-code, retry and
exhaustion behaviour changes; **(v)** the task crosses an authority boundary
(`validate.js` emits `secretReverts`, `dream.js` owns the ledger lifecycle,
`sync.js` renders the banner read-only, `ledger.js` owns the taxonomy);
**(vii)** the same contract appears in mirrored surfaces.

### Table A — the ledger record taxonomy (canonical)

| Row | Fact | Value |
|-----|------|-------|
| A1 | `outcome` domain | `'processed'` \| `'quarantined'` \| `'deferred'` (new) |
| A2 | `reason` present on | every `quarantined` record and every `deferred` record; never on `processed` |
| A3 | `reason` domain | `'over-ceiling'` \| `'too-many-lines'` \| `'read-error'` (intake, unchanged) \| `'secret-revert'` (on `deferred`, new) \| `'secret-revert-exhausted'` (on `quarantined`, new) |
| A4 | `deferrals` | integer in [1, `SECRET_REVERT_MAX_DEFERRALS`]. Present **only** on `outcome:'deferred'`. Absent everywhere else. `recordSecretDeferred` clamps any other value to `SECRET_REVERT_MAX_DEFERRALS`, so an out-of-range counter is never written |
| A5 | `fingerprint` on a `deferred` record | written for diagnostics; **read by no decision** — neither Table B row B5 nor Table F consults it |
| A5b | record key | `foldKey(absPath)` for **every** record kind including the two new ones — ADR-0023 §2's case-folded absolute path, unchanged. No record carries a file-identity field (`dev`, `ino`, a content hash, a file id); the rename and reused-path consequences are residual R4, not bugs to fix here |
| A6 | `SECRET_REVERT_MAX_DEFERRALS` | **3** — three deferrals recorded (nights 1, 2, 3), quarantine on the **fourth** consecutive secret-reverted run that consumes the file. Chosen for four reasons: (1) the human is warned on night 1 and every night after, so the quarantine lands ~72 h after the first warning — one working day plus slack, and this package ships no reset (Table E row E6), so a too-short window costs the user real work; (2) each deferral re-runs the brain over the same corpus and the deferred transcripts keep occupying `dream_max_input_bytes`, competing with genuinely new sessions, so the backlog must be bounded to a few nights; (3) after three consecutive reverts the cause is a stable property of the content (a permanent id in a note), not a transient, so a fourth deferral buys nothing; (4) exhaustion is loud and non-destructive — the transcript file and the withheld bytes both survive it (Table D row D2, residual R1). **5 was considered and rejected**: it nearly doubles the worst-case backlog for two extra days of latency, and a user away for a week is not saved by 5 either. **2 was considered and rejected**: 48 h spans a single weekend badly |
| A7 | counter reset | **only** Table E row E1 — a `processed` record from a clean consolidation. A fingerprint change resets **nothing** (that is the whole bound). A rename does leave the record behind at the old path, which is residual R4 (Table E row E4), not a reset path this WP provides. No command in this WP clears the counter |
| A8 | what is NOT recorded | a capacity-deferred file still gets **no record at all** (ADR-0023 §2, unchanged) |

### Table B — `selectState` (canonical)

Evaluated **in this order**; the first matching row wins.

| Row | Condition | Result |
|-----|-----------|--------|
| B1 | the record at `foldKey(disc.path)` is `quarantined` with reason `secret-revert-exhausted` | `skip-quarantined`, **whatever the fingerprint** (new; the sticky exception) |
| B2 | a record exists at this path whose `fingerprint` differs from the file's current fingerprint — including a record that is not an object, or has no `fingerprint` | `select` (unchanged rule; the malformed case is new and deliberate) |
| B3 | record `outcome === 'processed'`, fingerprint matches | `skip-processed` (unchanged) |
| B4 | record `outcome === 'quarantined'` (any other reason), fingerprint matches | `skip-quarantined` (unchanged rule, new reason flows through it) |
| B5 | record `outcome === 'deferred'`, fingerprint matches | **`select`** (new) |
| B6 | record present, `outcome` is anything else (unknown, missing, corrupt, forward-schema) | **`select`** — the `default:` arm of an exhaustive `switch` |
| B7 | no record, `mtimeMs <= baseline_mtime[harness]` | `skip-processed` (unchanged) |
| B8 | no record, above baseline or no baseline | `select` (unchanged) |

Every row reads the record at `foldKey(disc.path)` exactly as today — the only
change is which answers that record produces. B1 is the sticky exception and must
be tested **before** B2, because B2's fingerprint comparison is precisely what B1
overrides; an exhausted file that is still being appended to has a differing
fingerprint every night and would otherwise be re-selected forever.

B5 is why the deferral is not a negative record. B6 must be a real `switch`
`default`, not a ternary: the current
`rec.outcome === 'quarantined' ? ... : 'skip-processed'` maps **every** unknown
outcome to `skip-processed` and would silently re-create the bug this WP fixes.

**Fail-safe direction, stated once.** In `selectState` the safe default is
`select`, and that is not in tension with WP-149's "a security guard must fail
closed": selecting a transcript grants **no** trust — the file is still bounded
by the intake ceiling and line caps at read time (they are computed from
`fs.Stats`, never from the ledger), still redacted at parse, still provenance-
gated, and its derived output still passes the EP2 gate. The only cost of an
unnecessary select is re-processing. `skip-processed`, by contrast, destroys
content silently. Availability is therefore the closed direction here. The
opposite call is made in Table F row F3, where the fail-closed direction *is*
restrictive, and the reason is spelled out there.

### Table C — run outcome → ledger action for every `d` in `sel.processed` (canonical)

| Row | Run outcome | Action |
|-----|-------------|--------|
| C1 | brain non-zero, or inputs changed mid-run, or no commit | **no record at all** (the code never reaches step 14) — unchanged |
| C2 | commit made, `res.secretReverts === 0` (and it is a non-negative safe integer) | `recordProcessed(ledger, d)` — unchanged |
| C3 | commit made, reverts present, `secretDeferralCount(ledger, d) < SECRET_REVERT_MAX_DEFERRALS` | `recordSecretDeferred(ledger, d, prior + 1)` |
| C4 | commit made, reverts present, `secretDeferralCount(ledger, d) >= SECRET_REVERT_MAX_DEFERRALS` | `recordSecretExhausted(ledger, d)` |
| C5 | `res.secretReverts` is **not** a non-negative safe integer (undefined, `NaN`, negative, fractional, a string) | treated as **reverts present** → the C3/C4 path. A garbled counter must never be read as "clean" — that is the memory-loss path |
| C6 | scope of C3/C4 | **every** file in `sel.processed`, not a subset. There is no trustworthy transcript→note mapping: a note may derive from many transcripts and vice versa, and the only candidate mapping — the brain-authored `source_sessions` frontmatter on a note the gate just refused to trust — is untrusted model output. Deriving a security-relevant retry decision from it is rejected |
| C7 | which reverts count | `res.secretReverts` — the EP2 gate's own counter, covering both the finding case and the binary-unscannable case. **Not** `res.reverted.length`: tier-3 floor, skill-body, identity-freeze and out-of-vault reverts are *policy* rejections where the content was correctly refused, and deferring on those would retry forever |
| C8 | `sel.newlyQuarantined` | unchanged — recorded at step 5b before the brain runs, never affected by C3/C4 |
| C9 | dry-run | never reaches step 14; writes no ledger record of any kind — unchanged |

### Table D — the code-owned user-facing strings (canonical)

The table decides **when** each string is emitted; the code block below decides
its **exact bytes**. Both together are Table D, and they are the only place these
strings are decided. `quarantineBannerLine(ledger)` partitions
`activeQuarantines(ledger)` into "reason is `secret-revert-exhausted`" and
"everything else" — an unrecognized reason falls into D1 and is always surfaced;
a quarantine is never silently dropped from the banner.

| Row | Surface | Condition |
|-----|---------|-----------|
| D1 | digest banner | one or more active quarantines whose reason is **not** `secret-revert-exhausted` (count `n`, entries `e`). **Byte-identical to today's inline template** |
| D2 | digest banner | one or more active quarantines whose reason **is** `secret-revert-exhausted` (count `n`, entries `e`) |
| D3 | dream console | printed once per run whenever step 14 took the not-clean path (Table C rows C3/C4/C5), after the ledger write |
| D4 | digest banner | no active quarantine → `''`, so `renderDigest`'s `.filter((s) => s !== '')` drops it — unchanged behaviour |
| D5 | digest banner | when both D1 and D2 apply: D1 first, then D2, joined by `'\n\n'` |
| D6 | callers of `quarantineBannerLine` | `src/cli/dream.js` `regenerateDigest` **and** `src/cli/sync.js` — both, so the banner survives a sync (ADR-0023: re-rendered every digest while active). Proven by executable tests, not by a grep for a call site |

```js
// D1 — unchanged bytes.
`> [!warning] Wienerdog: ${n} session transcript(s) could not be read and were skipped — ` +
  `${e.map((x) => `${x.file} (${x.reason})`).join(', ')}. Dreaming continues over your other sessions; ` +
  'a skipped file is retried automatically if it changes.'

// D2 — new. Names NO command: this WP ships no way to un-skip these sessions
// (that is WP-quarantine-review-cli, which replaces this sentence when it
// lands), and a banner must not tell the user to run something that does not
// exist. It states no deferral count either — a file can also reach this state
// through Table F row F3, and a banner must not assert what the ledger cannot
// prove.
`> [!warning] Wienerdog: ${n} session transcript(s) are no longer being dreamed over — the notes made ` +
  `from them were withheld by the secret check too many times in a row: ${e.map((x) => x.file).join(', ')}. ` +
  'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest. ' +
  'The session files themselves are untouched.'

// D3 — numbers only, by construction: the body renders any argument that is not
// a non-negative safe integer as 0, so no string can reach this line.
`wienerdog: dream — the secret check withheld ${withheld} note(s); ${deferred} session transcript(s) ` +
  `will be retried on the next run and ${quarantined} were skipped after too many withheld runs in a ` +
  'row. The withheld notes are in state/quarantine/.'
```

The notification requirement is met end to end: the existing EP4
`secretQuarantine` banner (`src/core/digest.js`, untouched here) says notes were
withheld and what to do; D3 says at the console that the sessions will be
retried; and if the deferrals exhaust, D2 keeps saying so in every rendered
digest for as long as the record exists.

### Table E — what resets the bound, and what does not (canonical)

| Row | Event | Effect on the secret-revert state |
|-----|-------|-----------------------------------|
| E1 | a run commits with **zero** secret reverts and consumes the file | the file's record becomes `processed`; its counter is gone. The self-healing path |
| E2 | the transcript is **appended to** — same path, new `size:mtimeMs` | **no effect.** Not on the counter (Table F never reads the fingerprint), not on an exhausted quarantine (Table B row B1). This is the whole point: an active transcript changes nightly, and a bound a nightly change can reset is not a bound |
| E3 | a later run does not consume the file (capacity-deferred, or its harness dir is gone) | counter unchanged; the file keeps whatever it had |
| E4 | the transcript is **renamed or rotated** to another discoverable path — `P.jsonl` → `P.1.jsonl` | **a fresh budget — the documented residual R4.** The ledger is keyed by folded absolute path, so the record stays at `P.jsonl` and the file now at `P.1.jsonl` has none: counter 0, and an exhausted quarantine no longer reaches it. The rotated name must keep the `.jsonl` suffix (and, under Codex, the `rollout-` prefix) or the file leaves the tracked population entirely instead of getting a budget. Theoretical for the tracked population: neither harness renames or rotates a transcript — Claude Code writes one append-only file per session named by its session UUID (`0050691b-….jsonl`), Codex writes `rollout-<timestamp>-<uuid>.jsonl`. The one case that does occur is renaming a **project directory**, which changes every transcript path under it and resets those counters — bounded (a deliberate human act costing at most one fresh three-night budget) and arguably correct |
| E5 | a **different** file appears at the **old** path — same name | **it inherits the record — the other half of residual R4.** A path key cannot distinguish it from its predecessor: at an exhausted path it is skipped (B1), at a deferred path it continues that counter. Same population argument as E4 — a transcript filename carries a session UUID, so in practice a reused path means the same session file |
| E6 | any command — `wienerdog sync`, `update`, `doctor`, or a re-run of anything | **no effect.** This WP ships no clearing code path at all: `sync` opens the ledger read-only, and `ledger.js` exports no clear function. Clearing an exhausted transcript is `WP-quarantine-review-cli`'s explicitly-confirmed action; until it ships, an exhausted transcript stays skipped (Implementation notes, R1) |
| E7 | intake quarantines (`over-ceiling`, `too-many-lines`, `read-error`) | untouched by all of the above; they keep ADR-0023's retry-on-fingerprint-change behaviour. The sticky exception is scoped to the reason `secret-revert-exhausted` alone (B1) |
| E8 | anything else — the passage of time, a later clean run for *other* files, a restart | **no effect.** There is no timer and no automatic clear. An automatic clear on a later clean run was considered and rejected: it produces a 4-to-6-night ping-pong (clear → reselect → revert ×3 → quarantine → clear …) that spends most nights re-consuming the offender |

### Table F — `secretDeferralCount` (canonical)

An exhaustive `switch` on `rec.outcome`, where `rec` is
`ledger.files[foldKey(disc.path)]` — the same path key every other record kind
uses. The fingerprint is never consulted.

| Row | Record | Returns |
|-----|--------|---------|
| F1 | absent, `null`, or not an object | `0` |
| F2 | `outcome:'deferred'`, `reason:'secret-revert'`, `deferrals` an integer in [1, MAX] | `deferrals` |
| F3 | `outcome:'deferred'`, `reason:'secret-revert'`, `deferrals` anything else — missing, `null`, a string, `NaN`, `Infinity`, `2.5`, `0`, `-1`, `99` | `SECRET_REVERT_MAX_DEFERRALS`. Use `Number.isInteger` plus explicit range bounds; **never** `Number(x) \|\| 0` |
| F4 | `outcome:'deferred'`, any other `reason` | `0` |
| F5 | `outcome:'quarantined'`, `reason:'secret-revert-exhausted'` | `SECRET_REVERT_MAX_DEFERRALS` (defensive: Table B row B1 means such a file is not selectable, so this arm is unreachable through the dream today. It exists so the bound cannot be laundered by any future caller) |
| F6 | `outcome:'quarantined'`, any other reason | `0` |
| F7 | `outcome:'processed'` | `0` |
| F8 | `outcome` anything else (unknown, missing, forward-schema) | `0` — the `default:` arm |

**Fail-safe direction, stated once.** F3 is restrictive (an unreadable counter is
read as *exhausted*) while F8 is permissive (an unrecognized record grants a full
budget). That is deliberate and consistent: read the evidence conservatively
*where evidence exists*. F3's record positively asserts "this file has already
been deferred", and only the count is unreadable — the conservative reading of an
unreadable bound is "spent"; the alternative, resetting to 1, is exactly the
laundering path L1 flagged. F8's record asserts nothing about deferrals, so
inventing three of them would quarantine a file that has never been deferred.
Neither direction is a trust decision: the ledger is an availability mechanism,
not a trust anchor (ADR-0023, "Boundary statement"), it is 0600, and an attacker
who can rewrite it can already write `processed`, which suppresses a transcript
strictly harder than any counter game.

### Mirrored Surface Checklist

Mirrors of **Table A** (record taxonomy):

- [ ] the `Ledger` typedef; the three `SECRET_REVERT_*` declarations and their JSDoc
- [ ] `recordSecretDeferred`'s written object and clamp; `recordSecretExhausted`'s;
      the unchanged path key in `withRecord` (A5b — no identity field is added)
- [ ] the ADR amendment's part 2 and "The bound"; the example record JSON
- [ ] the Acceptance criteria naming an outcome, a reason, or the number 3, and
      the verification greps for the three constant names

Mirrors of **Table B** (`selectState`):

- [ ] `selectState`'s body and JSDoc; the "Current state" reproduction of today's
- [ ] the ADR amendment's part 2 "not a negative record" and part 3 "sticky"
- [ ] the unit tests asserting one row each; the Table F row F5 reference to B1
- [ ] the `dream-collect.test.js` fairness pair (B1 is what frees the budget)

Mirrors of **Table C** (run outcome → action):

- [ ] the step-14 block and the Deliverables cell for `src/cli/dream.js`
- [ ] the integration tests for C2, C3, C4 and C5
- [ ] the "Out of scope" bullet on non-EP2 revert classes (C7); the amendment's
      "Consequences" paragraph on run-scoped deferral (C6)

Mirrors of **Table D** (user-facing strings):

- [ ] `quarantineBannerLine`'s and `secretRevertSummaryLine`'s bodies
- [ ] the `regenerateDigest` call site (a call, never a re-inlined template), the
      step-14 summary call, and the `renderDigest` option in `src/cli/sync.js`
- [ ] the D1 byte-identity claim and the "no golden fixture changes" criterion
- [ ] the unit tests asserting D1–D5, and the integration assertion that D3
      carries no basename and no `AKIA`

Mirrors of **Table E** (reset model):

- [ ] the absence of any clear function in `ledger.js` and of any `writeLedger`
      in `src/cli/sync.js` (verification greps)
- [ ] the ADR amendment's part 4; the Table A row A7 summary
- [ ] the D2 banner sentence, which names no recovery command
- [ ] the Context paragraph "There is deliberately no reset command in this WP"
- [ ] residual R1 and the "Out of scope" no-clearing bullet
- [ ] rows E4/E5 only: residual R4, the amendment's "Consequences" sentence on
      path keys, the "Out of scope" no-identity-mechanism bullet, and the
      `dream-collect.test.js` rename-residual fixture

Mirrors of **Table F** (`secretDeferralCount`):

- [ ] the function body and JSDoc; the step-14
      `prior >= SECRET_REVERT_MAX_DEFERRALS` comparison
- [ ] the unit tests asserting one row each (F1–F8)
- [ ] the ADR amendment's part 3 (fingerprint independence)

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, JSDoc types only** (CLAUDE.md). The
  ledger module stays pure data + `fs`: no env, no argv, no network, no model.
- **Idempotence.** Running `wienerdog dream` twice with nothing new must still
  produce zero changes: the second run returns at step 7 ("nothing new to
  dream") and writes no ledger. `wienerdog sync` never writes the ledger at all.
- **Reversibility.** No new file, no new manifest entry: everything added lives
  inside the existing `state/transcript-ledger.json`, which `wienerdog uninstall`
  already disposes of with the rest of `state/`.
- **`activeQuarantines` is unchanged** — it already returns every `quarantined`
  record with its reason. Do not add filtering there; the partition belongs to
  `quarantineBannerLine` (Table D).
- **Do not attempt per-note attribution.** Table C row C6 is a decision, not a
  simplification to improve on. If you find yourself reading a quarantined copy's
  frontmatter, stop.
- **Do not add a clear of any kind** — no automatic clear on a later clean run,
  no timer, no run count, no flag or subcommand (Table E rows E6/E8). A reset any
  command can perform is not a human decision.
- **Console output is counts only**: `secretRevertSummaryLine` renders any
  argument that is not a non-negative safe integer as `0`. Only `displayName`
  output may enter a banner.
- **Named residuals** (things this WP does not make impossible; do not "fix" them
  here):
  - **R1 — an exhausted transcript stays exhausted until
    `WP-quarantine-review-cli` ships its clearing command.** Not data loss: the
    transcript file is untouched on disk, the withheld note's bytes are
    byte-identical in `state/quarantine/`, and only *consolidation* waits — where
    the behaviour it replaces loses the note and marks the transcript
    `processed`. The state is loud (D2 in every rendered digest); the ledger is
    also a plain JSON file the owner can delete, which is a fact, not a supported
    recovery procedure.
  - **R2 — an innocent transcript co-consumed with the offender across three
    consecutive reverted runs is quarantined with it.** Attribution is
    impossible (C6); the quarantine is loud and non-destructive (R1).
    Newly-appearing sessions are never collaterally quarantined: they start at 0
    deferrals and get the full budget of three.
  - **R3 — each deferred night writes another byte-identical copy of the
    withheld note into `state/quarantine/`** (`quarantinePreserve` suffixes
    `-1`, `-2`, …). Bounded by the deferral bound; not deduplicated here.
  - **R4 — the bound is path-keyed: a rename hands the file a fresh budget, and a
    file at a reused path inherits the record left there.** Table E rows E4/E5
    are canonical for both, for why they are theoretical for this file population
    and for the one real case (renaming a project directory). An inode identity
    was considered and **rejected**: a positive-but-unstable inode (some
    SMB/NFS/FUSE mounts) matches no record, is read as a replacement file, and
    restarts at deferral 1 every night — an unbounded nightly retry, the exact
    failure this bound exists to prevent — while inode reuse after deletion makes
    an unrelated file inherit an exhausted record indefinitely and silently. A
    path key fails visibly, and only for files this ledger never sees.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Why this is one WP and not two

Defer-instead-of-consume and bound-the-deferral are not independently shippable:
deferral without a bound is an unbounded nightly retry that starves new sessions
(the WP-048 class), so splitting them would leave a strictly-worse system on
`main` between merges. The *reset* is the one piece that genuinely is separable —
an exhausted transcript costs latency, not data (R1), and a reset only earns its
place behind an explicit human confirmation, which is CLI work this package must
not take on. The package is at the top of size M; if any part of it grows beyond
the contracts above, stop and report rather than expanding scope.

## Security checklist

- [ ] No untrusted identifier reaches a filesystem path or a shell command: the
      only strings leaving the module are `displayName` output (case-folded
      basename, `[A-Za-z0-9._-]` whitelist, other bytes → `_`) and code-owned
      constants. Path keys stay `foldKey`-folded and are never rendered.
- [ ] No transcript content, no vault note content, no matched secret value, and
      no full path enters either digest banner, the console line, or the ledger's
      `reason` field. Both banners are built from the ledger alone; the console
      line is built from integers alone.
- [ ] The new state written is a JSON field in an existing 0600 file created by
      the existing `writeLedger` (temp + rename + chmod, `state/` at 0700). No
      new file, no new mode, no new manifest entry.
- [ ] `readLedger` stays total and still does not validate individual records, so
      every consumer is exhaustive over `outcome` with an explicit default:
      `selectState` → `select` (B6), `secretDeferralCount` → `0` (F8). Neither
      may reach `skip-processed` through a default, and neither may use numeric
      coercion (`Number(x) || 0`) on `deferrals`.
- [ ] Select-by-default cannot re-open an availability hole: the intake ceiling
      and line caps come from `fs.Stats` and the read itself, not the ledger, so
      a re-selected oversized file is re-quarantined at intake as before.
- [ ] Nothing clears the bound as a side effect of another command — structural,
      not a convention: `ledger.js` exports no clearing function, `sync.js`
      contains no `writeLedger`, and the only automatic reset (E1) requires the
      full WP-069 gate plus zero secret reverts.
- [ ] No new lookup surface: both new decisions read
      `ledger.files[foldKey(disc.path)]` and nothing else, so no ledger-supplied
      string is scanned, compared across keys, or turned into a path.

## Acceptance criteria

Unit — `tests/unit/ledger.test.js`:

- [ ] `selectState` returns `select` for a `deferred` record at a matching
      fingerprint (B5), `skip-processed`/`skip-quarantined` for B3/B4, `select`
      for a record whose `outcome` is an unknown string and for one that is the
      string `'nope'` or `null`-shaped garbage (B2/B6), and `skip-quarantined`
      for a `secret-revert-exhausted` record **at a deliberately different
      fingerprint** (B1).
- [ ] `secretDeferralCount` returns one asserted value per Table F row F1–F8,
      including `SECRET_REVERT_MAX_DEFERRALS` for each of `undefined`, `'2'`,
      `NaN`, `Infinity`, `2.5`, `0`, `-1` and `99` as `deferrals` (F3), plus the
      fingerprint-independence case: a `deferred` record whose fingerprint
      differs still returns its stored count.
- [ ] `recordSecretDeferred` writes exactly `{fingerprint, outcome:'deferred',
      reason:'secret-revert', deferrals, updated_at, harness}` — **no other
      key**, in particular no `dev` and no `ino` (Table A row A5b) — is pure,
      leaves other files' records untouched, and clamps `0`, `-1`, `4` and `1.5`
      to 3. `recordSecretExhausted` writes the same shape with
      `outcome:'quarantined'`, the exhausted reason, and no `deferrals`.
- [ ] Both writers key the record at `foldKey(disc.path)` and touch **no other
      key**: given a ledger already holding a secret-revert record at some other
      path, writing one for this path leaves that other record byte-identical
      (no migration, no sweep — Table A row A5b).
- [ ] `quarantineBannerLine` returns `''` for an empty ledger (D4); reproduces
      today's template **byte for byte** for intake reasons only (D1); returns
      the D2 sentence for a `secret-revert-exhausted` record; returns both, D1
      first, separated by a blank line, when both apply (D5); and places a record
      with an unrecognized reason in D1 rather than dropping it.
- [ ] `secretRevertSummaryLine` renders D3 exactly for `{withheld:2, deferred:3,
      quarantined:0}`, and `0` for each of `undefined`, `-1`, `NaN` and `'3'`.

Unit — `tests/unit/dream-collect.test.js` (capacity fairness, the A/B pair; both
cases use the SAME two transcripts and the SAME budget, so only the ledger
differs):

- [ ] Fixture: `writeClaude(paths, 'offender', 25, 4000, new Date('2026-01-03T00:00:00Z'))`
      and `writeClaude(paths, 'fresh', 25, 4000, new Date('2026-01-02T00:00:00Z'))`
      — ~103 KB each, and the offender is the **newer** one, as an
      actively-appended transcript always is. Budget `40_000`: too small for
      either whole, and with both in play the equal share (20 000) is below
      `MIN_TRUNCATE_BYTES`, so the water-fill defers the oldest.
- [ ] **B (the starvation this WP prevents):** with a ledger holding a
      `deferred`/`secret-revert` record for `offender` at its **current**
      fingerprint, `collectExtracts` puts `offender` in `processed` (truncated to
      its 40 000 grant) and `fresh` in `deferred` with **no** record — the new
      session is starved. This also proves Table B row B5: before the fix a
      `deferred` record was `skip-processed`, so the offender would not even be a
      candidate.
- [ ] **A (the fix):** with a ledger holding a
      `quarantined`/`secret-revert-exhausted` record at the offender's own path
      key and a deliberately **stale** fingerprint (e.g. `'1:1:1:1'` — the
      appended-file case, the whole point of Table B row B1),
      `collectExtracts` puts `fresh` in `processed` and `offender` in **neither**
      `processed`, `deferred` nor `newlyQuarantined` — not a candidate at all, so
      its bytes never enter the budget. Stickiness is what makes A differ from B:
      the file has not moved, and B1 ignores the stale fingerprint.
- [ ] **The rename-residual fixture (real `fs.renameSync`) — it pins residual R4,
      it does not defend against it.** Comment it as such: *"documents Table E
      rows E4/E5 — a rotation gives the rotated file a fresh budget under path
      keys, and the replacement at the old path inherits the record. Neither
      harness rotates transcripts, so this characterises behaviour rather than
      requiring it."* From case A's ledger, rotate **keeping the `.jsonl`
      suffix**: `const rotated = offender.replace(/\.jsonl$/, '.1.jsonl');
      fs.renameSync(offender, rotated);`. Claude discovery skips any entry whose
      name does not end in `.jsonl` (`src/core/transcripts/claude.js`), so an
      `offender + '.1'` target would drop out of discovery and pin nothing. Then
      write a **new** transcript at the offender's original path and re-run
      `collectExtracts` with a budget large enough for both live files. Assert
      `rotated` **is** in `processed` (a fresh budget — E4) and the replacement
      at the old path is in **none** of `processed`, `deferred` or
      `newlyQuarantined` (it inherited the sticky exhausted record — E5).

The A/B pair above was run against the real water-fill at spec time with the
Table B rules in place and produced exactly these results; if yours differ, the
implementation of `selectState` is wrong, not the numbers.

Unit — `tests/unit/sync-digest-quarantine.test.js` (the sync half of D6):

- [ ] With a ledger holding one intake quarantine and one
      `secret-revert-exhausted` record, `sync.run([])` writes a
      `state/digest.md` that contains the D1 sentence **and** the D2 sentence.
      Pre-write a `digest.md` without either banner first, so the assertion
      proves sync *regenerated* it rather than left it alone — this is the direct
      regression for the erased-banner bug.
- [ ] That same run leaves `state/transcript-ledger.json` **byte-identical**
      (Table E row E6: sync reads the ledger, never writes it).

Integration — `tests/integration/dream.test.js` (`WIENERDOG_FAKE_BRAIN_MODE=secret-note`):

- [ ] **The 2026-07-24/25 regression test.** One dream run commits (the report
      still lands), EP2 reverts the planted note, and the consumed transcript is
      recorded `{outcome:'deferred', reason:'secret-revert', deferrals:1}` —
      **not** `processed` (C3).
- [ ] That run prints the D3 summary line, and the printed output contains
      neither `AKIA` nor the string `inj.jsonl`.
- [ ] **The bounded-episode test (the L1 test; `inj.jsonl` is appended to before
      every run, so its fingerprint changes every time).** Runs 2 and 3 record
      `deferrals:2` then `deferrals:3`; run 4 records
      `{outcome:'quarantined', reason:'secret-revert-exhausted'}`. Assert
      explicitly at run 4 that the record is **not** `deferred` with
      `deferrals:1` — the exact failure a fingerprint reset produces.
- [ ] **Stickiness.** Run 5, again after an append, prints `nothing new to
      dream`, makes no commit, and leaves the run-4 record byte-identical (same
      `updated_at`) — however much the file changes (B1).
- [ ] **Fair capacity after exhaustion.** Plant a second transcript, append to
      `inj.jsonl` once more so it is still the newest, and run again: the new
      transcript gets its own `deferrals:1` record — a full fresh budget, never a
      collateral quarantine — while `inj.jsonl` stays the exhausted quarantine.
- [ ] After the exhaustion run, the regenerated `state/digest.md` contains the D2
      sentence (the dream half of D6).
- [ ] A clean run (default fake-brain mode, whose tier-3 and skill reverts are
      **not** EP2 reverts) still records `processed` — the existing assertion at
      ~line 320 keeps passing unmodified (C2, C7).
- [ ] The existing capacity-deferral test still asserts **no** ledger record for
      a dropped session (A8), and the existing crashed-brain / vanished-inputs /
      unknown-command tests still assert `readLedgerFile(...) === null` (C1).
      None of those tests is edited.

Repo-wide:

- [ ] No file under `tests/golden/` changes.
- [ ] `npm test` and `npm run lint` pass.
- [ ] Running `wienerdog dream` twice with nothing new is idempotent: no commit,
      no ledger change.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint

# Table A: the three constants exist and are exported, and the bound is 3.
grep -n "SECRET_REVERT_MAX_DEFERRALS = 3" src/core/dream/ledger.js
grep -c "SECRET_REVERT_REASON\|SECRET_REVERT_EXHAUSTED_REASON\|SECRET_REVERT_MAX_DEFERRALS" src/core/dream/ledger.js

# Table D: each banner string lives in exactly ONE place, and dream.js no longer
# builds one itself.
test "$(grep -c 'could not be read and were skipped' src/cli/dream.js)" = 0
test "$(grep -c 'could not be read and were skipped' src/core/dream/ledger.js)" = 1
test "$(grep -c 'are no longer being dreamed over' src/core/dream/ledger.js)" = 1
test "$(grep -c 'activeQuarantines' src/cli/dream.js)" = 0
grep -n "quarantineBannerLine" src/cli/dream.js src/cli/sync.js src/core/dream/ledger.js

# Table C rows C5/C7: STEP 14's ledger branch keys on the validated
# secretReverts counter and never on reverted.length. Scoped to the step-14
# region ONLY: step 16's run summary legitimately reads res.reverted.length and
# res.outOfVault.length to report every revert class, is not a ledger decision,
# and is NOT changed by this WP — so a whole-file grep would be wrong and would
# push you to contort that summary line. Leave it exactly as it is.
grep -n "secretReverts" src/cli/dream.js
step14="$(awk '/^ *\/\/ 14\. Record the per-file outcomes/{n=1} /^ *\/\/ 15\. Regenerate the injected session digest/{n=0} n' src/cli/dream.js)"
# Non-vacuity guard FIRST — an empty range makes the assertion below pass while
# proving nothing. The range must exist and must be the branch we mean (the
# anchor is the pinned step-14 snippet in "Implementation notes").
test -n "$step14"
test "$(printf '%s\n' "$step14" | grep -c 'const reverts = res.secretReverts;')" = 1
# The assertion itself.
test "$(printf '%s\n' "$step14" | grep -c 'res.reverted.length')" = 0

# Table F row F3: no numeric coercion on the counter.
test "$(grep -c 'Number(.*deferrals' src/core/dream/ledger.js)" = 0
grep -n "Number.isInteger" src/core/dream/ledger.js

# Table E row E6 — ABSENCE proofs (the strong form: they fail if a reset ever
# comes back). sync never writes the ledger; nothing anywhere clears the bound.
test "$(grep -c 'writeLedger' src/cli/sync.js)" = 0
test "$(grep -rl 'clearSecretRevert' src/ | wc -l | tr -d ' ')" = 0

# Focused suites — these, not the greps, are the proof of behaviour.
node --test tests/unit/ledger.test.js
node --test tests/unit/dream-collect.test.js
node --test tests/unit/sync-digest-quarantine.test.js
node --test tests/integration/dream.test.js
```

## Out of scope (do NOT do these)

- Changing the EP2 gate itself, its `findings.length > 0` policy, the detector,
  or any entropy threshold. That is `WP-secret-fence-shape-and-context`, and
  nothing here depends on it landing, in any shape.
- Any allowlist, exemption, or per-value suppression
  (`WP-secret-allowlist-exact-value-store`).
- **Any way to clear the secret-revert bound** — no flag, no subcommand, no side
  effect of `sync`, `update` or `doctor`, no automatic clear (Table E rows
  E6/E8). Clearing is `WP-quarantine-review-cli`'s, behind its confirmation flow;
  this package must not pre-empt it with a blunter reset, and is not blocked on
  it (R1).
- **Any file-identity mechanism at all** — `dev`/`ino` matching, a content hash, a
  stored file id, a rename journal, a migration sweep across keys. The ledger
  stays path-keyed (ADR-0023 §2, Table A row A5b); the rename and reused-path
  consequences are named residuals (Table E rows E4/E5, R4), not a gap to close.
- Deferring on any revert class other than EP2 (`res.secretReverts`): the tier-3
  numeric floor, the ADR-0020 skill-body guard, the identity freeze and the
  out-of-vault reverts are policy rejections and must keep marking their inputs
  processed (Table C row C7).
- Per-note or per-session attribution of a revert to a transcript (Table C row
  C6).
- Touching `state/quarantine/` contents, the EP4 `secretQuarantine` banner in
  `src/core/digest.js`, or `listSecretQuarantine` (this WP only *calls* it).
- Changing `collectExtracts`, the water-fill, `MIN_TRUNCATE_BYTES`, or any intake
  cap. The capacity behaviour changes only because `selectState` stops offering
  an exhausted file as a candidate.
- Restoring the maintainer's lost 2026-07-24 notes, or replaying those
  transcripts — maintainer recovery, tracked separately.
- Updating any file under `tests/golden/`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): a secret-reverted run defers its transcripts instead of consuming them (WP-secret-revert-defers-ledger)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
