---
id: WP-048
title: Fix dream input-capacity starvation (truncate-to-fit + loud capacity alert)
status: Ready
model: opus
size: M
depends_on: [WP-039, WP-041]
adrs: [ADR-0012, ADR-0004]
branch: wp/048-dream-input-capacity-starvation
---

# WP-048: Fix dream input-capacity starvation (truncate-to-fit + loud capacity alert)

## Context (read this, nothing else)

Wienerdog's **dream** is the nightly consolidation job: an orchestrator (code)
selects recent Claude/Codex transcript sessions, writes redacted **extracts**
to a scratch dir, launches a model **brain** to fold them into the user's vault,
and makes exactly **one git commit** per run. A per-harness **watermark**
(`state/watermarks.json`, epoch-ms of the newest session already dreamed) marks
what has been processed so the next run only sees newer sessions. **IRON RULE
(ADR-0004): Wienerdog is just files** — this WP adds no process, daemon, server,
or telemetry; it only changes selection math, one config default, and CLI
output.

The dream input assembly applies a **total input-byte budget**
(`dream_max_input_bytes`, default in `src/core/dream/config.js`) so a heavy
Claude day cannot hand the brain an unbounded prompt. `collectExtracts`
(`src/core/dream/scratch.js`) parses each fresh session (already redacted and
per-message capped by `src/core/transcripts/index.js`: `MAX_MSG_CHARS=4000`,
`MAX_MESSAGES=2000` — so a single session can still be ~8 MB), then must fit the
set under that budget. When nothing is selected, `dream.js` prints "nothing new
to dream" and exits **0**.

**Second production-dogfooding starvation incident (2026-07-05), root-caused by
the owner session (clean-env replay confirmed every step).** The 03:30 dream
exited 0 with "nothing new to dream" while **four** fresh Claude sessions
existed past the watermark:

1. `collectExtracts` discovered all four correctly.
2. The old default `dream_max_input_bytes` was **400 000**, but each extract
   alone exceeded it (`MAX_MSG_CHARS × MAX_MESSAGES` allows ~8 MB). Live: kept 0,
   droppedForSize 4.
3. The old size loop sorts newest-first and **`break`s at the first extract that
   does not fit** — one oversized newest session therefore drops *everything*,
   including smaller older sessions that would have fit.
4. `dream.js` treats `entries.length === 0` as "nothing new to dream" → exit 0 →
   **no alert** (the WP-041 durable-alert machinery is unreachable), no watermark
   advance, no report. Because this early-exit precedes the lock, WP-039's
   pre-commit of session edits also never runs.
5. Non-advance means the same giant session leads the sort again every night:
   **heavy Claude days permanently and silently starve the dream.**

This is the *second* silent-starvation incident (the first — dirty-vault — was
fixed by WP-039). WP-041 already makes a *failing* dream visible in the digest
via `state/alerts.jsonl` (a wedged job appends a durable alert that the digest
renders until the job next succeeds). The gap here is that a capacity-wedged
dream reports **success** ("nothing new"), so that machinery never fires.

This WP freezes the owner's decisions: raise the default budget; make truncation
guarantee forward progress; make a wedged (nothing-fed) dream fail loud.

## Current state

**`src/core/dream/config.js`** — `readDreamConfig(configFile)` returns
`{vault, timeoutMs, maxInputBytes, model}`. The default when `dream_max_input_bytes`
is absent/invalid:

```js
maxInputBytes: Number.isFinite(maxInput) && maxInput > 0 ? maxInput : 400_000,
```

Override semantics (a positive finite `dream_max_input_bytes:` scalar wins) are
correct and stay unchanged.

**`src/core/dream/scratch.js`** — `collectExtracts(paths, watermarks, maxInputBytes)`
discovers fresh sessions, parses each into an **Extract**, then step 4 applies
the budget with the buggy break loop, writes one JSON file per kept extract to
`state/dream-scratch/`, and returns:

```js
{ entries:   Array<{harness, session_id, mtimeMs, scratchFile}>,
  scratchDir: string,
  maxMtime:  {claude:number|null, codex:number|null},  // max mtime among KEPT
  droppedForSize: number,
  wrote:     string[] }                                  // scratch file paths
```

The current step 4 (the bug):

```js
parsed.sort((a, b) => b.mtimeMs - a.mtimeMs);
const kept = [];
let droppedForSize = 0;
let total = 0;
for (let i = 0; i < parsed.length; i++) {
  const size = Buffer.byteLength(JSON.stringify(parsed[i].extract));
  if (total + size > maxInputBytes) {
    droppedForSize = parsed.length - i; // the oldest remaining are all dropped
    break;                              // <-- one oversized session shadows the rest
  }
  total += size;
  kept.push(parsed[i]);
}
```

An **Extract** (from `src/core/transcripts/index.js`) is
`{harness, session_id, started, cwd, source_path, truncated, messages[]}` where
`messages[]` is chronological (oldest first) and `truncated:boolean` is already
set true when a per-message char cap or the `MAX_MESSAGES` slice fired. That
`MAX_MESSAGES` slice — `messages.slice(messages.length - MAX_MESSAGES)` (keep
newest, drop oldest, set `truncated=true`, **no marker message**) — is the
"existing truncation marker convention" this WP reuses at the session level.

**`src/cli/dream.js`** — `run(argv)`. The buggy branch:

```js
const sel = collectExtracts(paths, wm, cfg.maxInputBytes);

// 4. Nothing new → no brain, no commit, no watermark change.
if (sel.entries.length === 0) {
  cleanScratch(paths.state);
  console.log('wienerdog: nothing new to dream.');
  return;                              // <-- capacity-wedge masquerades as success
}

// 5. Dry-run → print the plan and stop.
if (dryRun) { printPlan(sel, cfg, vaultDir, date, layout); cleanScratch(paths.state); return; }
```

`printPlan(sel, ...)` already prints `dropped for size: ${sel.droppedForSize}`.
`dream.js` already imports `WienerdogError`, `collectExtracts`, `cleanScratch`.

**The alert path already exists — do NOT rebuild it.** `dream.js run()` throws
`WienerdogError` on expected failure; `bin/wienerdog.js` maps a thrown
`WienerdogError` to **exit 1**. The scheduled dream runs as
`wienerdog dream --yes` spawned by `run-job.js`; a non-zero child exit drives
`run-job.js`'s `failLoud`, which appends a durable record to `state/alerts.jsonl`
(rendered into the digest until the job next succeeds — WP-041). So making the
wedged case **throw** is all that is needed to reach the durable alert; this WP
does **not** call `appendAlert` directly.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/config.js | default `maxInputBytes` `400_000` → `8_000_000`; update the JSDoc |
| modify | src/core/dream/scratch.js | replace step-4 break loop with water-fill + truncate-to-fit; add `truncateExtractToFit` + `MIN_TRUNCATE_BYTES`; enrich the return; export `MIN_TRUNCATE_BYTES` |
| modify | src/cli/dream.js | split "nothing new" from the capacity-wedge (throw); log truncation/drops plainly; add truncated count to the dry-run plan |
| modify | tests/unit/dream-collect.test.js | update the default assertion; add water-fill / truncate-to-fit / floor / incident-replay cases |
| modify | tests/integration/dream.test.js | add capacity-wedge-throws + capacity-logging cases; extend `setup()`/`runDream` to plant oversized transcripts and override the budget |
| modify | docs/adr/0012-dream-run-lifecycle.md | append the dated capacity-starvation amendment (part 4) |

### Exact contracts

#### 1. `src/core/dream/config.js` — default bump only

Change the one literal and its JSDoc; override semantics unchanged.

```js
// before: ... ? maxInput : 400_000,
maxInputBytes: Number.isFinite(maxInput) && maxInput > 0 ? maxInput : 8_000_000,
```

Rationale (owner, binding): *"400_000 → 8_000_000 — for now, I want to see how
dreaming works with that; we can always scale back."* Provisional and
revisitable; record in the ADR amendment.

#### 2. `src/core/dream/scratch.js` — water-fill selection + truncate-to-fit

Add a fixed floor constant (frozen — do not tune):

```js
/** Minimum bytes a *truncated* extract must be granted to be worth feeding. A
 *  session that cannot be given at least this much is dropped whole (and retried
 *  next run) rather than fed a sub-useful sliver. FIXED. Whole-fit sessions
 *  smaller than this are unaffected — the floor gates truncation size, not
 *  whole-session size. With the 8 MB default budget the newest session is always
 *  either kept whole or truncated to >= this floor, so the dream never wedges. */
const MIN_TRUNCATE_BYTES = 32_768;
```

Replace the step-4 break loop with **water-filling**. Iterate the fresh extracts
newest-first; give every session that fits its equal share its true size (kept
whole); when the remaining active sessions all exceed their equal share, either
truncate them all to that share (if the share is at least the floor) or drop the
**oldest** active session and retry (fewer sharers → a bigger share for the
survivors). This guarantees: **every session that fits is kept (no oversized
session shadows a smaller one behind it), and the newest session is always kept —
whole or truncated — whenever `maxInputBytes >= MIN_TRUNCATE_BYTES`.**

```js
// 4. TOTAL byte budget via water-filling (replaces the newest-first break).
parsed.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
const sizeOf = (extract) => Buffer.byteLength(JSON.stringify(extract));
const sizes = parsed.map((p) => sizeOf(p.extract));

let active = parsed.map((_, i) => i);   // indices, newest-first
let remaining = maxInputBytes;
/** @type {Map<number, number>} idx -> bytes granted (absent = dropped whole) */
const alloc = new Map();
/** @type {number[]} indices dropped whole (oldest-first shed order) */
const droppedIdx = [];

while (active.length > 0) {
  const share = Math.floor(remaining / active.length);
  const satisfied = active.filter((i) => sizes[i] <= share);
  if (satisfied.length > 0) {
    const set = new Set(satisfied);
    for (const i of satisfied) { alloc.set(i, sizes[i]); remaining -= sizes[i]; }
    active = active.filter((i) => !set.has(i));
    continue;
  }
  if (share >= MIN_TRUNCATE_BYTES) {
    for (const i of active) alloc.set(i, share);   // all get an equal, useful share
    active = [];
    break;
  }
  // Share too small to be useful → drop the OLDEST active session, retry.
  droppedIdx.push(active[active.length - 1]);       // active preserves newest-first
  active = active.slice(0, -1);
}

// Materialize kept extracts in newest-first order; truncate where under-granted.
const kept = [];
/** @type {Array<{harness, session_id, originalBytes, keptBytes}>} */
const truncated = [];
for (let i = 0; i < parsed.length; i++) {
  if (!alloc.has(i)) continue;
  const grant = alloc.get(i);
  let extract = parsed[i].extract;
  let truncatedToFit = false;
  if (grant < sizes[i]) {
    extract = truncateExtractToFit(extract, grant);
    truncatedToFit = true;
    truncated.push({
      harness: parsed[i].harness,
      session_id: extract.session_id,
      originalBytes: sizes[i],
      keptBytes: sizeOf(extract),
    });
  }
  kept.push({ harness: parsed[i].harness, mtimeMs: parsed[i].mtimeMs, extract, truncatedToFit });
}

const dropped = droppedIdx.map((i) => ({
  harness: parsed[i].harness,
  session_id: parsed[i].extract.session_id,
  bytes: sizes[i],
}));
const droppedForSize = dropped.length;
```

`truncateExtractToFit` — keep the newest messages that fit, drop oldest, reuse
the boolean `truncated` convention (no marker message, mirroring `MAX_MESSAGES`):

```js
/** Keep the NEWEST messages of `extract` whose serialized form fits `targetBytes`
 *  (drop oldest). Sets truncated=true and recomputes `started` to the new first
 *  (oldest-remaining) message. Binary-searches the largest newest-message suffix
 *  that fits — byteLength is monotonic in suffix length. Redaction already ran in
 *  parse(), so no re-redaction is needed here.
 *  @param {import('../transcripts').Extract} extract
 *  @param {number} targetBytes  guaranteed >= MIN_TRUNCATE_BYTES by the caller
 *  @returns {import('../transcripts').Extract} */
function truncateExtractToFit(extract, targetBytes) {
  const msgs = extract.messages;
  const build = (k) => {
    const keptMsgs = k === 0 ? [] : msgs.slice(msgs.length - k);
    return { ...extract, truncated: true, started: keptMsgs.length ? keptMsgs[0].ts : null, messages: keptMsgs };
  };
  let lo = 0, hi = msgs.length, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Buffer.byteLength(JSON.stringify(build(mid))) <= targetBytes) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return build(best);
}
```

Steps 5 (write scratch), 6 (`maxMtime` = max mtime among `kept`), and the scratch
(re)creation are unchanged in structure. Because `kept` now includes truncated
sessions, **`maxMtime` advances over a truncated session** — see the watermark
decision below. Add `truncatedToFit` to each `entries[]` item and add the
`truncated` and `dropped` arrays to the return. Export `MIN_TRUNCATE_BYTES`.

New `collectExtracts` return (additive — existing consumers keep working):

```js
{ entries:   Array<{harness, session_id, mtimeMs, scratchFile, truncatedToFit:boolean}>,
  scratchDir: string,
  maxMtime:  {claude:number|null, codex:number|null},
  droppedForSize: number,                                        // == dropped.length
  dropped:   Array<{harness, session_id, bytes}>,                // whole-dropped, newest-first
  truncated: Array<{harness, session_id, originalBytes, keptBytes}>,
  wrote:     string[] }
```

**Watermark decision (owner "preserve" bullet — record this).** `maxMtime` is the
max mtime among **kept** entries, *including truncated ones* — a truncated session
counts as **consumed**. This is deliberately simple and correct: the watermark is
a per-harness mtime scalar, so it cannot record partial (message-granular)
consumption; a truncated session's dropped-*oldest* messages are the least-recent
context and re-running would drop the identical messages, so re-processing wastes
budget and re-invites the stall. A **whole-dropped** session (the sub-floor case)
does **not** advance the watermark, so it is retried next run — *except* that the
scalar watermark advances over any newer *kept* session, so a dropped session
older than a kept one will not be re-discovered. This scalar limitation is
**pre-existing and unchanged** (today's break loop already advances past
dropped-oldest sessions); it is acceptable because with the 8 MB default no drops
occur, and truncation now guarantees `kept >= 1` so the watermark always advances —
ending the `kept === 0` permanent stall that is this incident.

#### 3. `src/cli/dream.js` — surface capacity, fail loud when wedged

Import `MIN_TRUNCATE_BYTES` from `../core/dream/scratch`. Replace the current
step-4 block (and keep step-5 dry-run after it) with:

```js
const sel = collectExtracts(paths, wm, cfg.maxInputBytes);

// 4. Surface capacity events plainly — a size event must NEVER be silent.
for (const t of sel.truncated) {
  console.log(
    `wienerdog: dream — truncated ${t.harness}/${t.session_id} to fit the input budget ` +
      `(kept the newest ${t.keptBytes} of ${t.originalBytes} bytes).`
  );
}
if (sel.dropped.length > 0) {
  const names = sel.dropped.map((d) => `${d.harness}/${d.session_id} (${d.bytes}B)`).join(', ');
  console.log(
    `wienerdog: dream — capacity: dropped ${sel.dropped.length} session(s) over ` +
      `dream_max_input_bytes (${cfg.maxInputBytes}): ${names}.`
  );
}

// 5. Fresh sessions existed but NONE could be fed → the dream is WEDGED. This is
//    a capacity FAILURE, never "nothing new": fail loud so run-job records a
//    durable alert (state/alerts.jsonl → digest). Dry-run only diagnoses.
if (sel.entries.length === 0 && sel.dropped.length > 0) {
  cleanScratch(paths.state);
  if (dryRun) {
    console.log(
      'wienerdog: dream plan (dry-run) — capacity exhausted: no fresh session fits ' +
        `dream_max_input_bytes (${cfg.maxInputBytes}); raise it in config.yaml.`
    );
    return;
  }
  throw new WienerdogError(
    `dream capacity exhausted: ${sel.dropped.length} fresh session(s) exceed ` +
      `dream_max_input_bytes (${cfg.maxInputBytes}) and none fit even after truncation ` +
      `(per-session floor ${MIN_TRUNCATE_BYTES} bytes) — raise dream_max_input_bytes in config.yaml.`
  );
}

// 6. Genuinely nothing new (no fresh sessions at all) → no brain, no commit.
if (sel.entries.length === 0) {
  cleanScratch(paths.state);
  console.log('wienerdog: nothing new to dream.');
  return;
}

// 7. Dry-run → print the plan and stop.
if (dryRun) {
  printPlan(sel, cfg, vaultDir, date, layout);
  cleanScratch(paths.state);
  return;
}
```

In `printPlan`, after the `dropped for size` line add:

```js
console.log(`  truncated to fit: ${sel.truncated.length}`);
```

**Ordering note (record as a decision).** The capacity-wedge throw stays *before*
the lock/pre-commit, exactly where "nothing new" was. A wedged night therefore
does not pre-commit the user's session edits (there is no brain run to protect);
those edits are pre-committed by the next dream that actually runs. Moving the
throw after the lock to force a pre-commit is rejected as needless complexity — a
sub-floor budget is a misconfiguration that now fires a loud, actionable alert.

### Example I/O

Let the fresh set be four Claude sessions, newest→oldest `c4,c3,c2,c1`, serialized
extract sizes 900 000 B each; `dream_max_input_bytes = 800_000`; floor 32 768.

- **Old behaviour:** newest-first, `c4` (900 000) > 800 000 at `i=0` → `break` →
  `droppedForSize=4`, kept **0**. `dream.js` prints "nothing new to dream", exits
  0. Silent stall.
- **New behaviour:** water-fill — first `share = floor(800000/4) = 200000`; none
  of the four fit whole; `share (200000) >= 32768` → all four granted 200 000 and
  truncated to fit. kept **4** (all `truncatedToFit:true`), `dropped=[]`,
  `truncated` has 4 entries. `dream.js` prints four
  `truncated c/<id> …` lines and proceeds to the brain; `maxMtime.claude` = `c4`'s
  mtime, so the watermark advances and the set never leads the sort again.

Mixed set `s1=100 000 (newest), s2=5 000 000, s3=3 000 000`; budget 8 000 000:
`s1` kept whole (share 2 666 666 ≥ 100 000), then `s3` kept whole (share ≥ 3 000 000),
then `s2` truncated to the ~4.9 MB remainder. kept 3, one truncated, no drops —
the big `s2` never shadows `s1`/`s3`.

Wedged (misconfig) set: one 900 000 B session, `dream_max_input_bytes = 1000`
(below floor): `share=1000 < 32768`, drop the only session → kept 0, `dropped`
length 1. Non-dry-run: `dream.js` **throws** `WienerdogError` (message begins
`dream capacity exhausted:`) → exit 1 → `run-job` `failLoud` → durable alert →
digest. Dry-run: prints the `capacity exhausted` plan line, exits 0.

## Implementation notes & constraints

- No new npm deps (zero-runtime-dep rule). Plain Node ≥ 18, JSDoc types only.
- **Do not** call `appendAlert` from `dream.js` — throwing reaches the durable
  alert through the existing `run-job` → `failLoud` path (see Current state). The
  interactive `wienerdog dream` path (no `run-job`) still surfaces the failure as
  exit 1 + stderr; that is correct.
- The scratch **layout contract with WP-017's `validate.js` is unchanged**: still
  one JSON file per kept extract named `${harness}-${sanitize(session_id)}.json`,
  the `wrote` array is still the exact list `validateAndCommit` treats as the
  read-only baseline. Truncation changes an extract's *content* before it is
  written — it is written once, pristine, before the brain runs; the WP-017
  scratch-integrity check is unaffected.
- Redaction runs in `transcripts.parse()` **before** `collectExtracts` sees the
  extract, so truncation (dropping already-redacted whole messages) never exposes
  unredacted text. Do not re-redact.
- `truncateExtractToFit`'s binary search relies on serialized byteLength being
  monotonic in suffix length (more newest messages = more bytes). The caller
  guarantees `targetBytes >= MIN_TRUNCATE_BYTES (32 768)`, and a single message is
  `<= MAX_MSG_CHARS (4000)` chars plus envelope (< 32 768), so `best >= 1` whenever
  the session has messages — truncation never yields an empty-message extract in
  practice.
- The existing unit test `dream-collect: drops the oldest sessions past the size
  cap` (budget 2000, small codex + ~20 KB claude) still passes unchanged under
  water-fill: codex fits whole, claude's share (1700 B) is below the floor → claude
  dropped whole, `droppedForSize=1`, codex kept, `maxMtime.claude=null`. You may
  keep it as-is or clarify its comment; do not weaken its assertions.
- `tests/unit/codex-adapter.test.js` calls `collectExtracts(..., 400000)` with an
  explicit budget and only reads `entries` — additive return fields keep it
  green; it is **not** in the Deliverables table, do not touch it.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR. Do NOT expand scope (e.g. no message-granular watermark, no
  chunk-and-summarize — that is a separately-deferred WP).

## Acceptance criteria

- [ ] `readDreamConfig` default `maxInputBytes` is `8_000_000`; a positive
      `dream_max_input_bytes:` scalar still overrides it.
- [ ] Incident replay (unit): four fresh sessions each larger than a budget that
      still admits four truncated shares → `collectExtracts` keeps **4** (all
      `truncatedToFit:true`), `droppedForSize===0`, `truncated.length===4`; the old
      break loop would have kept 0.
- [ ] A session that fits its equal share is kept whole even when an oversized
      newer session precedes it (no shadowing).
- [ ] Sub-floor budget: a fresh session with `dream_max_input_bytes < MIN_TRUNCATE_BYTES`
      → `collectExtracts` keeps 0 and reports it in `dropped`; `dream.js run()`
      **throws** a `WienerdogError` whose message starts `dream capacity exhausted:`
      (exit 1), and does **not** print "nothing new to dream".
- [ ] A truncated session advances `maxMtime`; a whole-dropped session does not.
- [ ] `dream.js` prints a `truncated …` line per truncated session and a
      `capacity: dropped …` line when `dropped.length > 0`; genuinely-empty runs
      (no fresh sessions) still print "nothing new to dream" and exit 0.
- [ ] Truncated extracts carry `truncated:true` and keep the **newest** messages
      (oldest dropped); no marker message is injected.
- [ ] All existing dream unit + integration tests still pass unchanged (except the
      one default-budget assertion updated in this WP).

## Verification steps (run these; paste output in the PR)

```bash
# Full suite (unit + integration) — everything green.
npm test

# The incident-replay + capacity cases specifically (name them with "capacity"
# so this selector is non-vacuous — see the WP-016 --test-name-pattern lesson).
node --test --test-name-pattern capacity

npm run lint
```

## Out of scope (do NOT do these)

- Message-granular or partial-consumption watermarks (the scalar mtime watermark
  stays; documented above).
- Chunk-and-summarize / multi-pass dreaming of oversized input (explicitly
  deferred by the original `scratch.js` comment; a future WP).
- Directly appending to `state/alerts.jsonl` from `dream.js` or any change to
  `run-job.js` / `alerts.js` / the digest renderer (WP-041 already carries the
  wedged-dream failure to the digest once `dream.js` throws).
- Changing per-message caps `MAX_MSG_CHARS` / `MAX_MESSAGES` in
  `src/core/transcripts/index.js`.
- Documenting `dream_max_input_bytes` in any user-facing template/README (no such
  template exists today; leave doc surfacing to a wd-docs task).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/048-dream-input-capacity-starvation`; conventional commits;
   PR titled `fix(dream): input-capacity starvation — truncate-to-fit + loud capacity alert (WP-048)`.
3. PR template filled, including "Decisions made" (watermark-counts-truncated,
   throw-before-lock, floor value) and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
