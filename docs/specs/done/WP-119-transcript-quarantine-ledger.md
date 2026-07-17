---
id: WP-119
title: Per-file transcript quarantine ledger replaces the scalar watermark (audit A6)
status: Done
model: opus
size: M
depends_on: [WP-118]
adrs: [ADR-0004, ADR-0023]
branch: wp/119-transcript-quarantine-ledger
---

# WP-119: Per-file transcript quarantine ledger replaces the scalar watermark (audit A6)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Plain Node ≥ 18, **zero runtime deps**, JSDoc types only, no build step.

The nightly **dreaming** job (`src/cli/dream.js run()`) reads **transcripts** (Claude JSONL /
Codex rollout files), parses redacted extracts into `state/dream-scratch/`, runs the brain
under a watchdog, validates its writes, makes one git commit, then advances state so those
transcripts are not re-processed. Today that "state" is a **scalar per-harness watermark**
(`state/watermarks.json`): one `mtimeMs` per harness, meaning "everything with `mtime <= wm`
is done", advanced only after a successful brain-exit + scratch-intact + commit.

A 2026-07-15 security audit (action **A6**, deep-dive `07-parsing-dos.md`, ADR-0023) found the
scalar watermark structurally cannot distinguish three outcomes — *processed*,
*deferred-because-it-did-not-fit-this-run's-byte-budget*, and *permanently-unprocessable
(too large / unparseable)* — they are all just "mtime". Real incidents (WP-048 capacity
starvation, WP-069 overlapping-dream scratch destruction) showed the watermark advancing
**past sessions no dream ever consolidated** — silent permanent data loss. And a single
permanently-unprocessable file either wedges the run forever (if it blocks the watermark) or
is silently skipped forever (if the watermark jumps it): there is no "quarantine this one
file, keep dreaming over the rest, tell the human, and retry only if it changes". Separately,
`collectExtracts` parses **all** fresh files into memory at once
(`fresh.map((entry) => ({ …, extract: transcripts.parse(entry) }))`) before the byte budget
is applied — the F1 OOM path (WP-118 made the *parser* streaming; this WP removes the
*collect-all-then-budget* pattern).

This WP replaces the scalar watermark with a **per-file quarantine ledger** and rewrites the
selection/collect/record path end to end — the ledger module, `collectExtracts`
(one-file-at-a-time), the `dream.js` orchestration that records per-file outcomes instead of
advancing a scalar, and a **durable, secret-free quarantine banner** in the digest. It
implements the ledger half of **ADR-0023** and MUST land atomically (the scalar-watermark
swap touches `scratch.js` and `dream.js` together; splitting them would leave the suite red).

**A6 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/core/dream/watermarks.js`** exports `readWatermarks(stateDir)` →
`{claude:number|null, codex:number|null}` (missing/corrupt → all null) and
`writeWatermarks(stateDir, {claude, codex})` (atomic write of `state/watermarks.json`,
`{version:1, claude, codex}`). **This WP does not modify this module** — it imports
`readWatermarks` for the one-time migration and stops *calling* `writeWatermarks` from
`dream.js` (the writer becomes unused; leaving it is a harmless later cleanup).

**`src/core/dream/scratch.js`** exports `collectExtracts(paths, watermarks, maxInputBytes)`,
`cleanScratch(stateDir)`, `MIN_TRUNCATE_BYTES` (32 768). `collectExtracts` today:
`since` = min non-null watermark → `transcripts.discover(paths, {since})`; `fresh` = filter
`mtimeMs > watermarks[harness]`; **`parsed = fresh.map(... transcripts.parse(entry))`**
(parses ALL at once, F1); water-fill `maxInputBytes` newest-first (equal shares), truncating
boundary sessions via `truncateExtractToFit`, dropping sub-`MIN_TRUNCATE_BYTES` shares;
`rm -rf` + recreate `state/dream-scratch/`, write one `<harness>-<id>.json` per kept extract;
compute `maxMtime` per harness among kept entries; return `{ entries, scratchDir, maxMtime,
droppedForSize, dropped, truncated, wrote }`. `truncateExtractToFit`, the water-fill,
`sanitize`, `MIN_TRUNCATE_BYTES` are correct and stay verbatim — only *how files are
selected/parsed and what is returned* changes.

WP-118 changed `transcripts.discover` to return `{harness, path, mtimeMs, size, dev, ino}`,
kept `transcripts.parse(entry)` → `Extract` (back-compat), added
`transcripts.parseWithOutcome(entry, budget)` →
`{extract, parse:{outcome, oversizedRecords, runExhausted}}`
with `outcome ∈ 'ok'|'over-ceiling'|'too-many-lines'|'read-error'` (`runExhausted:true` on a
budget-drained mid-file read; as landed, exact-EOF exhaustion is a normal full read), and
exported `Limits` (incl. `PRE_READ_CEILING_BYTES`) and `newRunBudget()`.

**`src/cli/dream.js run(argv)`** (the flow; keep every step except the state-advance):
acquire lock (WP-069 lock-first) → `const wm = readWatermarks(paths.state)` →
`const sel = collectExtracts(paths, wm, cfg.maxInputBytes)` → capacity console messages from
`sel.truncated`/`sel.dropped` → capacity-wedge throw if `sel.entries.length === 0 &&
sel.dropped.length > 0` → `nothing new` return if `sel.entries.length === 0` → dry-run plan →
`scratchBaseline = hashScratch(sel.wrote)` → precommit + clean-tree → brain under watchdog →
`scratchIntact` gate (restore + throw on mismatch) → `validateAndCommit(...)` →
**`writeWatermarks(paths.state, {claude: sel.maxMtime.claude, codex: sel.maxMtime.codex})`** →
regenerate + atomically write the digest (`renderDigest(vaultDir, layout, {alerts, updateLine,
identityApprovals, schedulerLine, …})`). Imports at top include
`readWatermarks, writeWatermarks` from `../core/dream/watermarks` and `renderDigest` from
`../core/digest`.

**`src/core/digest.js` `renderDigest(vaultDir, layout, opts)`** builds a fixed-template
`prefix` from control-plane banner lines and prepends it to the body:

```js
const prefix = [identityWarn, formatAlerts(opts.alerts || []), opts.schedulerLine || '', opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
```

Each `*Line` opt is a pre-built, code-owned, **secret-free** string the caller passes; empty →
omitted; when all empty the byte output is golden-frozen (`tests/golden/digest-default.md`).
`renderDigest` is pure and total (never throws). Adding a control-plane line is the
established extension pattern (WP-070 `schedulerLine`, WP-046 `updateLine`, WP-116
`identityWarn`). **`src/core/identity-approvals.js`** is the shape to mirror for the ledger's
on-disk file: `foldKey` (case-folded path key), atomic temp+rename+chmod 0600, fail-closed
reader (missing/corrupt → empty). Reuse its approach; do not import identity code.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/ledger.js | the per-file quarantine ledger: read/write (0600), `fingerprint`, `foldKey`, `selectState`, `migrateFromWatermarks`, `recordProcessed`, `recordQuarantined`, `activeQuarantines` |
| modify | src/core/dream/scratch.js | `collectExtracts(paths, ledger, maxInputBytes)`: select from the ledger + discovery metadata, quarantine over-ceiling before parse, allocate from discovery `size`, parse/materialize ONE file at a time (`parseWithOutcome` + shared run budget), return per-file outcomes |
| modify | src/cli/dream.js | read+migrate the ledger; pass it to collectExtracts; record `processed`/`quarantined` outcomes (replace `writeWatermarks`); build + pass the secret-free `quarantineLine`; per-quarantine console line |
| modify | src/core/digest.js | add the `quarantineLine` opt to `renderDigest`'s prefix (one array entry + JSDoc) |
| create | tests/unit/ledger.test.js | fingerprint; selection rule table; unchanged-quarantine skip; changed-file retry; migration seed idempotent; fail-closed read; 0600 write |
| modify | tests/unit/dream-collect.test.js | over-ceiling → quarantined + valid neighbour still processed; deferred file → no negative record; one-file-at-a-time (constrained-heap subprocess); return-shape |
| modify | tests/integration/dream.test.js | over-ceiling transcript → quarantined, valid neighbour consolidated, ledger records both, digest shows the banner; unchanged quarantine not retried; changed quarantine retried; migration seeds baseline; no `watermarks.json` write |
| modify | tests/unit/digest.test.js | `quarantineLine` renders first-after-identity in the prefix (secret-free); absent/empty → golden byte-unchanged |

### Exact contracts

**1. `src/core/dream/ledger.js`.** Pure data + `fs` I/O; no env, no argv, no network, no model.

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { readWatermarks } = require('./watermarks');

const LEDGER_BASENAME = 'transcript-ledger.json';

/** Case-folded absolute-path key (ADR-0021/0023: path identity folded, content exact).
 *  @param {string} absPath @returns {string} */
function foldKey(absPath) { return String(path.resolve(absPath)).toLowerCase(); }

/** Content-independent fingerprint of a discovered file. Any change to size, mtime, device,
 *  or inode ⇒ a different string ⇒ "the file changed" ⇒ reprocess.
 *  @param {{size:number, mtimeMs:number, dev:number, ino:number}} d @returns {string} */
function fingerprint(d) { return `${d.size}:${d.mtimeMs}:${d.dev}:${d.ino}`; }

/** @param {string} stateDir @returns {string} */
function ledgerPath(stateDir) { return path.join(stateDir, LEDGER_BASENAME); }

/**
 * @typedef {{version:1,
 *            baseline_mtime:{claude:number|null, codex:number|null},
 *            files: Record<string, {fingerprint:string, outcome:'processed'|'quarantined',
 *                                   reason?:string, updated_at:string, harness:'claude'|'codex'}>}} Ledger
 */

/** Read the ledger. Missing/corrupt/malformed → a fresh empty ledger
 *  ({version:1, baseline_mtime:{claude:null,codex:null}, files:{}}) — fail closed (nothing
 *  recorded ⇒ everything above baseline eligible). Never throws. @param {string} stateDir @returns {Ledger} */
function readLedger(stateDir) { /* JSON.parse with shape validation, else empty */ }

/** Atomically persist the ledger at 0600 (state dir 0700): temp+rename+chmod, mirroring
 *  identity-approvals.writeRegistry. @param {string} stateDir @param {Ledger} ledger */
function writeLedger(stateDir, ledger) { /* implement */ }

/** ONE-TIME migration: if the ledger has NO baseline yet (a fresh read that never carried a
 *  baseline key) AND state/watermarks.json exists, seed baseline_mtime from readWatermarks()
 *  so every file at/below the old watermark is treated as already-processed. Idempotent: a
 *  ledger already carrying a baseline (even {null,null}) is NOT re-seeded. Returns the
 *  possibly-migrated ledger WITHOUT writing (the caller persists once).
 *  @param {string} stateDir @param {Ledger} ledger @returns {{ledger:Ledger, migrated:boolean}} */
function migrateFromWatermarks(stateDir, ledger) { /* implement */ }

/** Decide what to do with ONE discovered file given the ledger.
 *  @param {Ledger} ledger
 *  @param {{harness:'claude'|'codex', path:string, mtimeMs:number, size:number, dev:number, ino:number}} disc
 *  @returns {'select'|'skip-processed'|'skip-quarantined'}
 *    'skip-quarantined' — quarantine record exists AND its fingerprint == current → no retry.
 *    'skip-processed'   — processed record exists AND fingerprint == current, OR mtime <=
 *                         baseline_mtime[harness] with no record → done.
 *    'select'           — else: above baseline with no record, OR any record whose fingerprint
 *                         DIFFERS from current (the file changed → reprocess). */
function selectState(ledger, disc) { /* implement per ADR-0023 §2 */ }

/** Return a NEW ledger with one file recorded as processed at its current fingerprint (pure;
 *  overwrites any prior quarantine for the same key). @param {Ledger} ledger @param {object} disc @returns {Ledger} */
function recordProcessed(ledger, disc) { /* implement */ }

/** Return a NEW ledger with one file recorded as quarantined (reason ∈
 *  'over-ceiling'|'too-many-lines'|'read-error') at its current fingerprint (pure).
 *  @param {Ledger} ledger @param {object} disc @param {string} reason @returns {Ledger} */
function recordQuarantined(ledger, disc, reason) { /* implement */ }

/** The active quarantines for the durable banner. SANITIZED basenames (whitelist
 *  `[A-Za-z0-9._-]`; other bytes → `_`) + reason only — never a full path, never content.
 *  @param {Ledger} ledger @returns {Array<{file:string, reason:string, harness:string}>} */
function activeQuarantines(ledger) { /* map files with outcome==='quarantined' → basename+reason+harness */ }

module.exports = { LEDGER_BASENAME, foldKey, fingerprint, ledgerPath, readLedger, writeLedger,
  migrateFromWatermarks, selectState, recordProcessed, recordQuarantined, activeQuarantines };
```

Selection table (assert in `ledger.test.js`):

| Ledger state for file F (fp = current fingerprint) | `selectState` |
|-----------------------------------------------------|---------------|
| no record, `mtime > baseline`                        | `select` |
| no record, `mtime <= baseline`                       | `skip-processed` (predates ledger) |
| `processed`, record.fp == fp                         | `skip-processed` |
| `processed`, record.fp != fp (file changed)          | `select` (reprocess) |
| `quarantined`, record.fp == fp                       | `skip-quarantined` (no retry) |
| `quarantined`, record.fp != fp (file changed)        | `select` (retry the changed file) |

**2. `src/core/dream/scratch.js` — `collectExtracts(paths, ledger, maxInputBytes)`.** The
`ledger` object replaces the `watermarks` argument. Algorithm:

1. `const disc = transcripts.discover(paths, { since: null })` — discover all files (the
   ledger, not a coarse `since`, decides eligibility; discovery is cheap `stat`s). Record the
   `since:null` choice under "Decisions made".
2. Partition by `ledger.selectState(ledger, d)`: `select` → candidates; the two `skip-*` →
   ignored.
3. **Pre-read ceiling → quarantine WITHOUT parsing.** For each candidate with
   `d.size > transcripts.Limits.PRE_READ_CEILING_BYTES`: add to `newlyQuarantined` with reason
   `'over-ceiling'`; it never enters the byte budget.
4. **Allocate the byte budget from discovery `size`** across the remaining (under-ceiling)
   candidates newest-first, using the SAME water-fill + `MIN_TRUNCATE_BYTES` logic as today,
   keyed on `d.size` (`size` over-estimates the serialized extract, so the grant is
   conservative; `truncateExtractToFit` still enforces the exact serialized grant after
   parsing). A candidate granted 0 (sub-floor share) is **capacity-deferred** — NOT
   quarantined, NOT recorded, omitted this run (retried next run).
5. **Parse + materialize one file at a time**, newest-first grant order, with ONE
   `budget = transcripts.newRunBudget()` for the whole run. For each granted candidate:
   `const { extract, parse } = transcripts.parseWithOutcome(d, budget);`
   - `parse.outcome` `'over-ceiling'`/`'too-many-lines'`/`'read-error'` → add to
     `newlyQuarantined` with that reason; write no scratch file.
   - `parse.runExhausted === true` (the shared run budget drained mid-file) → **discard the
     partial extract, write no scratch file, and treat the file as capacity-deferred** (add
     to `deferred`, record nothing in the ledger). Per ADR-0023 a partially-read file must
     never be recorded `processed` — its unread tail would be silently lost (the WP-048/069
     class); with no record it is naturally retried next run. Stop granting further
     candidates once the run budget is exhausted (they are likewise deferred). *Amended
     2026-07-17 after the WP-118 review surfaced `runExhausted` on the parse outcome.*
   - else `truncateExtractToFit` if the serialized extract exceeds its grant (unchanged),
     write the scratch file immediately, then **drop the parsed extract object** (keep only its
     metadata entry). At no point is every parsed extract resident (the F1 fix).
6. `rm -rf` + recreate `state/dream-scratch/` before the write loop (unchanged).
7. **Return** (superset of today; `maxMtime` REMOVED):

```js
{
  entries,          // as today: {harness, session_id, mtimeMs, scratchFile, truncatedToFit}
  scratchDir,
  processed,        // NEW: Array<disc> for every session WRITTEN to scratch (dream.js records these on commit)
  newlyQuarantined, // NEW: Array<{...disc, reason}> quarantined this run (dream.js records + banners)
  deferred,         // NEW: Array<{harness, session_id, bytes}> capacity-deferred (retried next run)
  droppedForSize,   // back-compat: === deferred.length
  dropped,          // back-compat alias of deferred (the existing capacity-wedge message reads it)
  truncated,        // as today
  wrote,            // as today
}
```

**3. `src/cli/dream.js run()` — replace the scalar-watermark flow with the ledger flow.** Keep
every other step (lock-first, scratch-intact gate, commit, digest write) intact.

- Imports: drop `readWatermarks, writeWatermarks`; add
  `const ledgerLib = require('../core/dream/ledger');`.
- Read + migrate the ledger before collect (still under the lock):
  ```js
  let ledger = ledgerLib.readLedger(paths.state);
  const mig = ledgerLib.migrateFromWatermarks(paths.state, ledger);
  ledger = mig.ledger;
  if (mig.migrated && !dryRun) ledgerLib.writeLedger(paths.state, ledger);
  const sel = collectExtracts(paths, ledger, cfg.maxInputBytes);
  ```
  *Amended 2026-07-17 (second review round): the one-time migration write is ALSO
  dry-run-guarded — the owner's "a preview run must not permanently mutate state" ruling
  names the file, not a kind of write, and the upgrade path (watermarks.json present, no
  ledger yet) is exactly the first state every existing user dry-runs from. On dry-run the
  migrated ledger is used in-memory only; migration is idempotent, so the next real run
  re-migrates identically. Nothing is lost.*
- Capacity console messages unchanged. ADD a per-newly-quarantined line (secret-free —
  sanitized basename + reason only, derived through the SAME sanitizer as
  `activeQuarantines` for consistency):
  ```js
  for (const q of sel.newlyQuarantined) {
    console.log(`wienerdog: dream — quarantined ${q.harness}/${path.basename(q.path)} (${q.reason}); it will not be retried until it changes.`);
  }
  ```
- **Record + surface quarantines even on an otherwise-idle run.** Persist newly-quarantined
  outcomes and regenerate the digest banner BEFORE the `entries.length === 0` returns, so a
  quarantine-only run records them and shows the banner (a permanently-broken file must not
  fail-loud every night):
  ```js
  if (sel.newlyQuarantined.length > 0) {
    for (const q of sel.newlyQuarantined) ledger = ledgerLib.recordQuarantined(ledger, q, q.reason);
    ledgerLib.writeLedger(paths.state, ledger);
    regenerateDigest(); // factor the existing digest-write block into a local helper; passes quarantineLine (below)
  }
  ```
  *Amended 2026-07-17 (OWNER-APPROVED): this block is dry-run-guarded. On `--dry-run` the
  newly-quarantined files are reported to the console only ("would quarantine …"); the
  ledger write and the digest regeneration are SKIPPED — a preview run must not permanently
  mutate `transcript-ledger.json` or the injected `digest.md`. This matches the existing
  dry-run carve-out of the capacity-wedge diagnostics block.*
  The capacity-wedge throw (`sel.entries.length === 0 && sel.dropped.length > 0`) and the
  `nothing new` return are UNCHANGED (`dropped` aliases `deferred`).
- After the successful `validateAndCommit`, **replace `writeWatermarks(...)`** with:
  ```js
  for (const d of sel.processed) ledger = ledgerLib.recordProcessed(ledger, d);
  ledgerLib.writeLedger(paths.state, ledger);
  ```
  A file is in `sel.processed` only when its extract was written to scratch AND the run reached
  a successful commit with scratch intact (the exact WP-069 watermark-safety property, now
  per-file). A capacity-deferred file is in neither list → no record → retried next run (the
  WP-048/069 starvation fix, structural).
- **Durable quarantine banner** in the digest. Build a fixed, code-owned, secret-free line from
  the CURRENT ledger's active quarantines and pass it as `quarantineLine`:
  ```js
  const q = ledgerLib.activeQuarantines(ledger);
  const quarantineLine = q.length > 0
    ? `> [!warning] Wienerdog: ${q.length} session transcript(s) could not be read and were skipped — ${q.map((e) => `${e.file} (${e.reason})`).join(', ')}. Dreaming continues over your other sessions; a skipped file is retried automatically if it changes.`
    : '';
  const digest = renderDigest(vaultDir, layout, { …existing opts…, quarantineLine });
  ```
  `activeQuarantines` returns **sanitized** basenames (whitelist `[A-Za-z0-9._-]`; any other
  byte, including newlines and markdown control characters, is replaced with `_`) + a
  code-owned reason enum only — never content, never a full path. *Amended 2026-07-17 after
  review (owner ack): a raw basename is attacker-influenceable, unlike `formatAlerts`' fully
  code-owned inputs — the whitelist is what actually enforces the no-untrusted-bytes
  invariant.* The banner is
  durable because it is re-derived from the ledger every render; it disappears the run after the
  file leaves quarantine.

**4. `src/core/digest.js` — add the `quarantineLine` opt.** ONE prefix entry + its JSDoc,
placed after the identity banner and alerts, before scheduler/update (a transcript that could
not be read is more operationally urgent than a scheduler/update notice, less than an active
job failure):

```js
const prefix = [identityWarn, formatAlerts(opts.alerts || []), opts.quarantineLine || '',
  opts.schedulerLine || '', opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
```

Add `quarantineLine?: string` to the `opts` JSDoc ("fixed-template secret-free 'transcripts
skipped' banner from the A6 quarantine ledger; empty/absent → output unchanged"). The golden
digest is byte-unchanged (production render passes no `quarantineLine` when there are no active
quarantines).

> **Region note (implementer + reviewer).** `src/core/digest.js` is ALSO edited by **WP-120**
> (digest line/byte caps) in a DISJOINT region (the post-assembly truncation pass + the
> `<=120 lines` JSDoc claim). This WP touches only the `prefix` array line + the `opts` JSDoc.
> In the fork's sequential-on-`main` flow, **land WP-119 before WP-120** so WP-120's cap pass
> wraps the already-present banner.

## OWNER-APPROVED (2026-07-17) — ledger design calls

The owner walkthrough ratified **all four recommendations as seeded**: the
`size:mtimeMs:dev:ino` fingerprint, the `0600` ledger file (state dir `0700`,
atomic temp+rename), the ledger-derived **digest banner** as the quarantine
surface (Alt A `alerts.jsonl` explicitly rejected — run-job's success path
`clearAlerts` would wipe the alert the same night; Alt B doctor-only rejected
as sole channel), and `since:null` discovery with the ledger as the sole
authority. These calls anchor ADR-0023 §2 (flipped to Accepted with this
approval). The original recommendations + rationale are kept below for the
implementer.

- **Fingerprint components — recommend `size:mtimeMs:dev:ino`.** `dev`+`ino` catch a
  same-size/same-mtime replacement; they differ harmlessly across a restore/cross-device move,
  which correctly reads as "changed → retry" (the safe direction). *Alt:* `size:mtimeMs` only
  (simpler; misses a same-size in-place rewrite at an identical mtime — unlikely for
  append-only transcripts).
- **Ledger file permissions — recommend `0600` (state dir `0700`), atomic temp+rename+chmod,
  mirroring `identity-approvals.js`.** The ledger holds only paths + fingerprints + outcome (no
  secrets), but 0600 is cheap and forward-aligns with A5/A9. *Alt:* match `watermarks.json` (no
  chmod) — not recommended.
- **Quarantine surface channel — recommend the digest banner above** (durable, ledger-backed,
  secret-free, where the user looks — like the identity ADR-0021 and scheduler ADR-0018
  banners; self-clears when the file leaves quarantine). *Alt A — `state/alerts.jsonl` via
  `appendAlert`:* **not recommended** — run-job's success path calls `clearAlerts(paths,
  'dream')`, which would wipe a quarantine alert the same successful night it is recorded, and
  re-appending nightly would violate "unchanged quarantine is not re-alerted". *Alt B — only
  `wienerdog doctor`:* insufficient as the sole channel (the audit wants it in the session
  context); may be ADDED later (out of scope; do not add `doctor.js` here).
- **Discovery `since` — recommend `since:null`** (ledger is authoritative; simplest correct).
  *Alt:* `since = min(baseline_mtime)` as a stat-count optimization once backlogs grow — defer.

## Implementation notes & constraints

- **This implements the ledger half of ADR-0023.** Reference it where the ledger flow is wired.
  It must land atomically — the scalar-watermark swap spans `scratch.js` + `dream.js`.
- **Preserve every existing safety property of `run()`**: lock-first (WP-069), scratch-intact
  gate before commit (WP-069/039), restore-on-brain-failure, dry-run plan, capacity messages.
  Only the *state advance* (scalar watermark → per-file ledger records) and the *digest
  quarantine line* are new. Do not reorder lock/collect/brain/commit.
- **One file at a time is the security property.** After this WP there is **no point** in
  `collectExtracts` where every parsed extract is resident: parse → write → drop, keyed off
  discovery `size` for allocation. A constrained-heap subprocess test must prove a backlog of
  near-limit files collects without OOM.
- **Quarantine is a fail-safe skip, never a deletion.** The ledger records the decision; the
  transcript file on disk is never touched. A quarantine never fails the run; valid files are
  consolidated + committed beside it. Only a genuine capacity wedge still throws (unchanged).
- **Migration is one-time and idempotent.** After the first migrate, `watermarks.json` is
  ignored (nothing calls `writeWatermarks`). Do NOT delete the file or the module.
- **Secret-free banner + console lines: `path.basename` + reason enum only** — never a full
  path (project names), never transcript content.
- Reuse `truncateExtractToFit`, the water-fill, `sanitize`, `MIN_TRUNCATE_BYTES` verbatim. Zero
  deps, JSDoc only. When uncertain, choose simpler + record it under "Decisions made".

## Security checklist

- [ ] Ledger keys are folded absolute paths from `discover` (not content); the banner + console
      lines expose only a **sanitized** `path.basename` (whitelist `[A-Za-z0-9._-]`) + a
      code-owned reason enum, never content or a full path, so no attacker-controlled bytes
      reach the injected digest (a raw basename IS attacker-influenceable, unlike
      `formatAlerts`' code-owned inputs — the whitelist enforces the invariant; amended
      2026-07-17). The pre-read ceiling quarantines an oversized file **before it is
      opened**; parse-time quarantine outcomes write no scratch. State advances per-file only
      for files consolidated into a committed run with scratch intact (no scalar jump past
      unconsolidated sessions). One-file-at-a-time materialization bounds memory on a fully
      attacker-controlled backlog.

## Acceptance criteria

- [ ] `selectState` matches the table (no-record/above-baseline→select; matching-fingerprint
      processed/quarantined→skip; differing-fingerprint→select).
- [ ] Migration seeds `baseline_mtime` from `watermarks.json` once and is idempotent (a second
      `migrateFromWatermarks` returns `migrated:false`); `readLedger` on missing/corrupt →
      empty (fail closed); `writeLedger` produces a `0600` file where the platform supports it.
- [ ] An over-ceiling transcript beside a valid small session: the valid session is
      consolidated + committed + recorded `processed`; the oversized file is recorded
      `quarantined` **without being parsed**; the digest shows the quarantine banner (basename +
      reason); the run exits 0.
- [ ] A run whose ONLY fresh input is a quarantined file records it, writes the banner, exits 0,
      and does NOT re-quarantine on the next unchanged run (`selectState` → `skip-quarantined`).
- [ ] A quarantined file that CHANGES (new fingerprint) is retried next run.
- [ ] `--dry-run` with an over-ceiling candidate reports it to the console ("would
      quarantine") but writes NEITHER `transcript-ledger.json` NOR `digest.md`
      (2026-07-17 amendment) — INCLUDING when `state/watermarks.json` exists and the
      one-time migration fires (the migration write is dry-run-guarded too; a
      watermarks-present dry-run integration test is required, since the fresh-state
      test cannot trigger migration).
- [ ] A hostile basename (newline / markdown control chars) reaches the banner and console
      only in sanitized form (2026-07-17 amendment).
- [ ] A capacity-deferred valid file is recorded in NEITHER `processed` nor `quarantined` and is
      selected on a subsequent larger-budget run (no watermark gap).
- [ ] No code path calls `writeWatermarks` (grep in `dream.js` returns nothing).
- [ ] A constrained-heap subprocess test collects a backlog of near-limit files without OOM.
- [ ] `renderDigest` with no `quarantineLine` is byte-identical to the golden; with one it
      appears first-after-identity.
- [ ] `wienerdog safety` shows all five gates BLOCKED; `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "ledger"
npm test -- --test-name-pattern "collect"
npm test -- --test-name-pattern "dream"
npm test -- --test-name-pattern "digest"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
grep -n "writeWatermarks" src/cli/dream.js || echo "no writeWatermarks call — OK"
```

## Out of scope (do NOT do these)

- The streaming parser + discovery metadata + oversized-record marker — **WP-118** (this WP
  consumes `parseWithOutcome`, `Limits`, `newRunBudget`, and the richer discovery record).
- Digest line/byte caps + bounded note reads — **WP-120** (disjoint `digest.js` region; land
  WP-119 first).
- Hook fail-open — **WP-121**.
- Deleting `watermarks.json`, removing `watermarks.js`, or a `wienerdog doctor` quarantine
  surface — deliberate follow-ups.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/119-transcript-quarantine-ledger`; conventional commits; PR titled
   `feat(dream): per-file quarantine ledger replaces the scalar watermark (WP-119)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
