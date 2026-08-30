---
id: WP-launcher-alert-bound
title: Bound the launcher's alert writer without understating a real failure streak — collapse consecutive identical refusals into a count field
status: Draft
model: opus
size: M
depends_on: [WP-launcher-refusal-banner]
adrs: [ADR-0004, ADR-0024, ADR-0028, ADR-0031, ADR-0039]
epic: digest-delivery
---

# WP-launcher-alert-bound: give the launcher the bound the app-side writer has

## Context (read this, nothing else)

Wienerdog records unresolved job failures as durable **alerts** — one JSON line each
in `~/.wienerdog/state/alerts.jsonl` — which `renderDigest` turns into a warning
banner at the top of every session's **digest**. This is one half of **fail-loud**:
no failure is silent.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP changes how one file is
written and read. It adds no process.

There are **two** writers of that file, and only one of them is bounded.

- `appendAlert` in `src/core/alerts.js` (the app-side writer) compacts to
  `MAX_ALERTS = 200` records and `MAX_FILE_BYTES = 512 KiB` after every append.
- `appendRefuseAlert` in `src/scheduler/launcher.js` (the **independent launcher**'s
  writer) applies **no bound at all**. It is a deliberate hand-written duplicate —
  the launcher verifies the app tree before trusting it, so it must not `require`
  anything from `src/` — and the bound was simply never duplicated with it.

**The defect and its measured cost.** A launcher refusal that recurs writes one
unbounded record per fire, forever.
`docs/specs/logbook/2026-08-01-a-correct-refusal-that-repeats-is-a-different-defect.md`
recorded this on 2026-08-01 at 119 records. By 2026-08-30 the same install's
`alerts.jsonl` was **433 KB** and still growing hourly. Two things then go wrong:
the file grows without limit, and because the *app-side* newest-200 compaction runs
against it whenever another job appends, a repeating refusal **crowds out older
alerts for other jobs** — the failure that shouts loudest erases the ones that did
not.

**Why the obvious fix was withdrawn once already, and what replaces it.** The
2026-08-01 entry drafted "collapse consecutive identical records" as a second work
package and then withdrew it, for a reason worth quoting: *"`formatAlerts` derives its
count from the record count, so collapsing would have made the digest report 'has
failed' for a job that genuinely failed 118 consecutive times. A fix that understates
a real recurring failure is worse than the growth it cures."* That entry names the
correct repairs — *"give the launcher the same bound the app-side writer has, or
extend the record schema with a count"* — and this WP does **both**, because either
alone is still lossy: a bound without a count silently discards streak length, and a
count without a bound still grows.

So: the record schema gains an optional `count`, `formatAlerts` **sums** counts
instead of counting rows, and the launcher collapses a consecutive identical
`(job, reason)` into the previous record's count before applying the same bound the
app-side writer uses. The honest number survives; the file stops growing.

## Current state

`src/core/alerts.js` — the constants and the record shape:

```js
const MAX_ALERTS = 200;              // keep only the most-recent N records
const MAX_FIELD_CHARS = 2000;        // cap each string field (control-plane text, not prose)
const MAX_FILE_BYTES = 512 * 1024;   // hard byte bound on the log file / the read
```

`sanitizeAlert` coerces to exactly four string fields and **drops unknown keys**:

```js
function sanitizeAlert(r) {
  const o = r && typeof r === 'object' && !Array.isArray(r) ? r : {};
  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS));
  return { job: scrub(o.job), at: scrub(o.at), reason: scrub(o.reason), log_hint: scrub(o.log_hint) };
}
```

`appendAlert`'s ordering is load-bearing and its comments explain why: it appends the
new line **atomically first** (so the appending writer never loses its own fail-loud
record to a concurrent compaction), then guards against an empty read-back (`all.length === 0`
means the read failed, not that the log is empty — rewriting from that snapshot would
delete the alert just appended), then compacts count-budget-first, byte-budget-second,
always keeping at least the newest record. Any reimplementation here must preserve all
three properties.

`src/core/digest.js`, `formatAlerts` — **counts rows**:

```js
function formatAlerts(alerts) {
  if (!alerts || alerts.length === 0) return '';
  const byJob = new Map();
  for (const a of alerts) {
    const cur = byJob.get(a.job) || { count: 0, first: a.at, lastReason: a.reason, hint: a.log_hint };
    cur.count += 1;
    if (a.at < cur.first) cur.first = a.at;
    cur.lastReason = a.reason; // alerts are oldest-first → last wins
    cur.hint = a.log_hint;
    byJob.set(a.job, cur);
  }
  const lines = [];
  for (const [job, s] of byJob) {
    const times = s.count === 1 ? 'has failed' : `has failed ${s.count} times since ${s.first}`;
    lines.push(
      `> [!warning] Wienerdog: the "${job}" job ${times}. Latest error: ${s.lastReason}. ` +
        `Details in ${s.hint}. This note clears automatically when the job next succeeds.`
    );
  }
  return lines.join('\n');
}
```

`src/scheduler/launcher.js`, `appendRefuseAlert(p, job, reason)` — the unbounded
writer. Its header comment states the constraint: *"Minimal durable alert append
(code-owned reason — no secrets, so no redaction/compaction machinery from
`src/core/alerts.js` is needed; this must work even when the app tree is the thing
being refused)."* It does the newline-separator guard, one `fs.appendFileSync`, a
best-effort `chmodSync(file, 0o600)` on non-win32, and swallows all errors. The record
it writes is `{ job, at: new Date().toISOString(), reason, log_hint: '' }`.

`readAlerts` returns sanitized records oldest-first and byte-bounds its read to a
`MAX_FILE_BYTES` tail window for oversized files. `clearAlerts(paths, job)` filters out
one job's records and atomically replaces the file.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/alerts.js | `sanitizeAlert` preserves a fail-closed `count`; JSDoc record shape; `appendAlert` + `clearAlerts` take the launcher lock (C8f–C8i); update the stale lines 87–88 residual comment |
| modify | src/core/digest.js | `formatAlerts` sums `count` instead of counting rows |
| modify | src/scheduler/launcher.js | `appendRefuseAlert`: consecutive collapse + the Table C bound |
| modify | tests/unit/alerts.test.js | `count` coercion, bound behaviour, round-trip, lock acquisition + fallback, cross-writer interleaving |
| modify | tests/unit/digest.test.js | `formatAlerts` summing; single-record wording unchanged |
| modify | tests/unit/launcher.test.js | collapse, bound, durability, failure swallowing |

**Golden files:** `tests/golden/digest-default.md` has no alerts, so its bytes must not
change. **You do not have permission to update any golden fixture in this WP.**

### Exact contracts

```js
/** The alert record, after this WP.
 * @typedef {{job:string, at:string, reason:string, log_hint:string, count:number}} Alert
 * `count` — how many consecutive identical (job, reason) refusals this row represents.
 * ALWAYS present after sanitizeAlert; >= 1; an absent/invalid input value becomes 1. */
```

`sanitizeAlert` gains one field, coerced **fail-closed to 1** — never to 0, and never
to an attacker-chosen large number:

```js
const n = Number(o.count);
const count = Number.isSafeInteger(n) && n >= 1 ? Math.min(n, MAX_COUNT) : 1;
```

`formatAlerts` changes exactly one line — `cur.count += 1` becomes
`cur.count += a.count` — and its `first`/`lastReason`/`hint` handling is untouched.
The rendered wording is unchanged, so a job with one failure still reads
"has failed" and a job with N still reads "has failed N times since <first>".

### Table C — the alert-bound contract

The single place these facts are decided. The launcher duplicates the values by
necessity (it cannot import them); the duplication is registered here so the two
copies are updated together.

| Row | Fact | Value |
|-----|------|-------|
| C1 | Record schema | `{job, at, reason, log_hint, count}` — `count` is a positive safe integer, always written |
| C2 | `count` coercion | Anything that is not a safe integer `>= 1` becomes **1** (fail closed). Capped at `MAX_COUNT` |
| C3 | `MAX_COUNT` | `1_000_000`. New exported constant in `src/core/alerts.js`; duplicated as a literal in `launcher.js` with a comment naming its twin |
| C4 | Record bound | `MAX_ALERTS = 200` — duplicated as a literal in `launcher.js` with a comment naming its twin |
| C5 | Byte bound | `MAX_FILE_BYTES = 512 * 1024` — duplicated as a literal in `launcher.js` with a comment naming its twin |
| C6 | Collapse key | The **exact** pair `(job, reason)` of the **last** record in the file. Not a prefix, not a fuzzy match, and never a non-adjacent record |
| C7 | Collapse effect | Increment that last record's `count` by 1 and rewrite it. `at` keeps the **original first** occurrence's timestamp, so the banner's "since \<first\>" stays truthful |
| C8 | Write order | Append the new record atomically FIRST, then collapse-and-bound in a temp+rename rewrite — mirroring `appendAlert`, so the writer never loses its own record to a concurrent compaction |
| C8c | Temp cleanup | The compaction's temp-plus-rename `rmSync`s the temp on a rename failure, so a failed atomic write never leaves an orphan beside `alerts.jsonl` (Codex P2). Retained unchanged from round 2 |
| C8d | Lock | **Pointer row — no algorithm here.** The lock's full contract is `WP-launcher-refusal-banner` **Table L**, which is its single canonical source (ADR-0031). This WP **consumes** it through the exported `acquireLauncherLock` and the opaque handle it returns (`release()`, `stillHeld()`), plus the exported constants; it must not restate the directory name, the staleness threshold, the wait budget, the release mechanism, or the stale-break algorithm, and must not define a second lock. Round 4 left a copy of the *superseded* algorithm in this cell (bare `rmdirSync`, 10 s, 5 × 200 ms) that survived two protocol rewrites — exactly the drift a pointer row prevents (finding T3). The append **and** its compaction run while holding the lock |
| C8e | Fallback | If the lock cannot be acquired, **still append the record atomically** and skip **only** the compaction. Fail-loud is never sacrificed to the lock (Table L, L6) |
| C8f | **Every** writer takes the lock | Round 3 scoped the lock to the launcher, leaving the app side racing it on the **same file** (finding S3). Corrected: `src/core/alerts.js` **requires** `acquireLauncherLock` from `src/scheduler/launcher.js` and takes the same lock around **`appendAlert`**'s append+compaction and **`clearAlerts`**'s filter+rewrite. The direction is app → launcher, which is safe: `launcher.js` is require-safe (its `module.exports` precedes the `if (require.main === module)` guard) and the launcher still requires nothing from `src/`. One implementation, no twin literals (ADR-0031, Table L L11) |
| C8g | App-side fallback | On a failure to acquire, the app side degrades **exactly like the launcher** (C8e): `appendAlert` appends its record atomically and skips compaction; `clearAlerts` skips the rewrite and leaves the file unchanged, so a cleared job's records are removed on the next lock-holding call rather than lost the other way round. Never drop a record to win a race |
| C8h | Not in scope | `alert-ack.js`'s `pruneAcksForJob` writes **`alerts-ack.json`**, a different file, and never rewrites `alerts.jsonl` — so it needs no lock. It is called *from* `clearAlerts`, which already holds the lock for its own rewrite; taking the lock again there would self-deadlock. Stated so the boundary is deliberate rather than an omission |
| C8h1 | **Commit-time fence** | Both destructive rewrites here — `appendAlert`'s compaction and `clearAlerts`'s filter-and-rewrite — call `handle.stillHeld()` (`WP-launcher-refusal-banner` Table L, **L7a**) immediately before `renameSync`, and on false `rmSync` the temp and **abort the rewrite**. `clearAlerts`'s `rmSync` of the whole file when no records remain is a destructive operation too and is fenced identically (U3). An evicted holder that renames anyway replaces `alerts.jsonl` with a **pre-successor snapshot**, destroying every record its successor appended — a fail-loud record lost by the very machinery meant to protect it (finding T1). Aborting is free: the append already landed |
| C8i | Accepted residual | After a C8e/C8g fallback, `alerts.jsonl` may exceed its bound, or retain a cleared job's records, until the next lock-holding call. Both are self-correcting and neither loses a record. The `src/core/alerts.js` lines 87–88 comment describing the old unlocked residual must be **updated**, not left contradicting the new behaviour |
| C9 | Empty-read guard | If the read-back yields zero records, skip the rewrite entirely and leave the atomically-appended file intact |
| C10 | Bound order | Count budget first (keep newest `MAX_ALERTS`), then drop oldest until the serialized bytes fit `MAX_FILE_BYTES`; always keep at least the newest record |
| C11 | Launcher dependencies | Node built-ins only. `appendRefuseAlert` must NOT require `src/core/alerts.js` or any other `src/` module |
| C12 | Counting consumer | `formatAlerts` in `src/core/digest.js` sums `count`. It is the only consumer that counts occurrences |
| C13 | Backward compatibility | A pre-existing record with no `count` reads as `count: 1` (C2), so an existing `alerts.jsonl` needs no migration |

### Mirrored Surface Checklist

Surfaces in this spec that mirror Table C — a review finding updates the table and
every box below in one pass, and any new mirror found in review is registered here:

- [ ] Deliverables-table cells for `alerts.js`, `digest.js` and `launcher.js`
      (mirror C1, C11, C12)
- [ ] The `Alert` typedef and the `sanitizeAlert` snippet in Exact contracts
      (mirror C1, C2, C3)
- [ ] The `formatAlerts` change description in Exact contracts (mirrors C12)
- [ ] Acceptance criteria AC-1 … AC-12 (mirror C1 … C13)
- [ ] Verification greps for the duplicated constants, the lock, and the absence of a
      `src/` require in the launcher (mirror C3, C4, C5, C8d, C11)
- [ ] **`WP-launcher-refusal-banner` Table L** (mirrored by C8d/C8e/C8f) — the lock is
      ONE contract used by two specs and defined in one place; a change to Table L must
      move these three rows in the same pass
- [ ] Current-state quotations of `MAX_ALERTS`/`MAX_FILE_BYTES` and of `appendAlert`'s
      three load-bearing properties (mirror C4, C5, C8, C9, C10)
- [ ] The Implementation-notes paragraph on `at` semantics (mirrors C7)

## Contract reference

Activation trigger (ADR-0031): **(i)** the persisted record shape changes; **(iii)**
parsing and acceptance of that record changes (`sanitizeAlert`'s coercion);
**(v)** the launcher writes records whose interpretation and lifecycle the app tree
owns — an authority boundary; **(vii)** the bound constants and the record schema are
mirrored in two modules that cannot share code. Four of seven — the discipline is on,
and Table C above is the canonical table.

## Implementation notes & constraints

- **C11 is the load-bearing constraint.** The launcher exists to verify the app tree
  before trusting it; importing from `src/` would execute the code under suspicion.
  Every constant it needs is duplicated as a literal with a comment naming its twin in
  `src/core/alerts.js`. That duplication is intentional and registered as C3–C5 — do
  not "fix" it by adding a shared module, which would have to live somewhere both can
  reach and would defeat the isolation.
- **`at` semantics are the subtle part (C7).** `formatAlerts` renders
  "has failed N times since \<first\>", where `first` is the minimum `at` across a
  job's rows. If a collapse overwrote `at` with the newest timestamp, the banner would
  claim a long streak began moments ago. Keep the original `at`; the count carries the
  recurrence, the timestamp carries the onset.
- **Do not collapse across non-adjacent records (C6).** Only the file's last record is
  a collapse candidate. Merging a matching record from further back would reorder the
  log and break `readAlerts`' oldest-first contract, which `formatAlerts` relies on for
  "last wins" on `lastReason`.
- **Preserve `appendAlert`'s three properties in the launcher's version** (C8, C9,
  C10): append-first durability, the empty-read guard, and count-then-bytes budgeting
  keeping at least one record. They are quoted in Current state with the reasoning;
  each exists because of a real prior bug.
- **Why a lock and not compare-and-retry (round-3 R2/R5, owner REVERSED the round-2
  ruling).** Append-first durability protects *this* writer's record. It does **not**
  protect a record another launcher appended between our read and our rename — that one
  is silently discarded by the rewrite. `appendAlert` tolerates this because its writers
  are `run-job` processes that rarely overlap; the launcher's writers are **scheduled**,
  so a catch-up and a nightly firing in the same minute is an ordinary Tuesday. Round 2
  answered with compare-and-retry (`size` + `mtimeMs` captured at read, re-checked before
  rename). Codex round 2 pointed out that it **narrows** the window rather than closing
  it, and that the banner rebuild in the sibling WP has an identical unclosed window —
  so the codebase would carry two differently-shaped half-guards for one problem. The
  owner reversed to a **single launcher-owned lock** covering both. Implement the lock
  **once**, in `launcher.js`, per `WP-launcher-refusal-banner` Table L; this WP consumes
  it (C8d) and does not define a second one.
- **C8e is what keeps the lock from becoming the new failure mode.** An unacquirable
  lock must never cost a fail-loud record: append anyway, skip only the compaction. Test
  the contended path by pre-creating the lock directory.
- **Hold the lock for the shortest span (Table L, L8)** — the append plus the compaction,
  nothing more. Do not hold it across the `stat`, the console output, or the exit.
- **`redactOnly` is app-side only.** `sanitizeAlert` scrubs; the launcher's writer
  deliberately does not, because its reasons are code-owned (its header comment says
  so). Keep it that way — do not add a second scrubber to the launcher, and do not
  remove the app-side one.
- Everything the launcher writes must still be best-effort: an exception anywhere in
  `appendRefuseAlert` must be swallowed, because the refusal stands on its non-zero
  exit and zero spawn, never on the alert landing.
- The app-side `appendAlert` writes `count: 1` for every record it creates; it does
  **not** collapse. Only the launcher collapses, because only the launcher has a
  failure mode that repeats identically on a schedule.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] `count` arrives from a JSON file inside `state/` that is 0600 but is still
      parsed input. `Number.isSafeInteger(n) && n >= 1` with a `MAX_COUNT` clamp (C2,
      C3) prevents `Infinity`, `NaN`, `-1`, `1e309`, `"9".repeat(400)` and object
      coercion from reaching `formatAlerts` and producing a nonsense or
      memory-hostile banner. Coerce **before** any arithmetic.
- [ ] The summed total in `formatAlerts` must itself stay a safe integer: clamp the
      accumulated `cur.count` at `MAX_COUNT` as well, so 200 rows each at `MAX_COUNT`
      cannot overflow the rendered number.
- [ ] `count` is a number, never interpolated as a string into the banner without
      passing through the coercion above; the banner is fixed-template control-plane
      text and must stay so (no untrusted bytes — the same rule `formatAlerts` and the
      quarantine banner already follow).
- [ ] The temp file for the rewrite is created inside `p.state` (mode 0700) with a
      pid-suffixed name; no untrusted identifier flows into the path.
- [ ] The collapse compares `(job, reason)` with `===` on already-parsed strings —
      never a regex built from file content.

## Acceptance criteria

- [ ] AC-1 — `sanitizeAlert` returns `count: 1` for a record with no `count`, and for
      `count` values of `0`, `-1`, `1.5`, `NaN`, `Infinity`, `"3"` → the string case
      coerces to `3` only if `Number("3")` is a safe integer `>= 1`; assert the exact
      chosen behaviour for each (C2).
- [ ] AC-2 — `sanitizeAlert` clamps a `count` above `MAX_COUNT` to `MAX_COUNT` (C3).
- [ ] AC-3 — `formatAlerts` on two rows for one job with `count` 1 and 5 renders
      "has failed 6 times since \<earliest at\>" (C12, C7).
- [ ] AC-4 — `formatAlerts` on one row with `count: 1` renders "has failed" with no
      number — wording unchanged from before this WP (C12).
- [ ] AC-5 — `formatAlerts` with a summed total exceeding `MAX_COUNT` clamps rather
      than rendering an unsafe integer.
- [ ] AC-6 — `tests/golden/digest-default.md` is unchanged, with no golden update.
- [ ] AC-7 — Two `appendRefuseAlert` calls with the **same** `(job, reason)` leave the
      file with exactly **one** record whose `count` is 2 and whose `at` is the
      **first** call's timestamp (C6, C7).
- [ ] AC-8 — Two calls with **different** reasons leave two records, each `count: 1`
      (C6).
- [ ] AC-9 — A call whose `(job, reason)` matches a record that is **not** the last
      one appends a new record rather than collapsing (C6).
- [ ] AC-10 — Appending beyond `MAX_ALERTS` distinct records leaves exactly
      `MAX_ALERTS` records, newest kept (C4, C10).
- [ ] AC-11 — A file already over `MAX_FILE_BYTES` is reduced below it, retaining at
      least the newest record (C5, C10).
- [ ] AC-12 — An `alerts.jsonl` whose records have no `count` field reads correctly and
      renders as before (C13) — no migration step anywhere.
- [ ] AC-13 — With `state/` unwritable, `appendRefuseAlert` throws nothing and the
      refusal still exits non-zero with zero spawn.
- [ ] AC-13a — **Serialised under the lock (round-3 R2/R5).** Two `appendRefuseAlert`
      calls that would interleave are serialised by the launcher lock, and **both**
      records survive (C8d).
- [ ] AC-13b — **Contended fallback.** With `<core>/state/launcher.lock/` pre-created and
      fresh, `appendRefuseAlert` still appends its record atomically, skips compaction,
      throws nothing, and leaves no `*.tmp` behind (C8e, C8f, C8c).
- [ ] AC-13c — The lock is released after a successful append+compact, and also when the
      compaction throws (Table L, L3).
- [ ] AC-13c1 — **Token ownership, via the exported primitives (round-5 T3).** The lock
      taken here is the one `src/scheduler/launcher.js` exports: assert that the
      `<lock>/owner` token written during an app-side call is the one its release
      compares, and that a release with a foreign token is a no-op (Table L, L2a/L3).
- [ ] AC-13c2 — **The wait/staleness inequality holds at the exported constants
      (round-5 T3).** Read the wait budget and staleness threshold **from the launcher's
      exports** — not from literals restated in this spec — and assert
      `waitBudgetMs > stalenessMs` (Table L, L4b/L5).
- [ ] AC-13c3 — **Evicted-holder compaction (round-5 T1).** A holder evicted between its
      read and its rename aborts the compaction: the temp is removed and the
      **successor's appended record survives** in `alerts.jsonl` (C8h1, Table L L7a).
- [ ] AC-13c4 — **Evicted-holder `clearAlerts` (round-5 T1).** Same for the
      filter-and-rewrite path: an evicted `clearAlerts` does not overwrite the file, and
      a record the successor appended after the eviction is still present (C8h1).
- [ ] AC-13c5 — **Evicted-holder `clearAlerts` remove-when-empty (round-6 U3).** When
      `clearAlerts` would `rmSync` the whole file because no records remain, an evicted
      holder aborts that too — a successor's freshly appended record is not deleted
      (C8h1).
- [ ] AC-13c6 — **The lock API is the opaque handle (round-6 U2).** `alerts.js` obtains
      `{release, stillHeld}` from `acquireLauncherLock` and never handles a token; assert
      no token parameter crosses the module boundary (Table L, L2b/L11).
- [ ] AC-13d — **App-side writers take the same lock (round-4 S3).** `appendAlert` and
      `clearAlerts` each acquire the launcher lock; assert by observing
      `<core>/state/launcher.lock/` during the call, and that the release leaves it gone
      (C8f).
- [ ] AC-13e — **Cross-writer interleaving.** A launcher `appendRefuseAlert` and an
      app-side `appendAlert` that would interleave are serialised, and **both** records
      survive with correct `count` values (C8f).
- [ ] AC-13f — **App-side fallback.** With the lock held by someone else for the whole
      bounded wait, `appendAlert` still appends its record and skips compaction, and
      `clearAlerts` leaves the file unchanged rather than rewriting it unlocked. Neither
      throws; no record is lost (C8g).
- [ ] AC-13g — `alert-ack.js` is unchanged and takes no lock; `clearAlerts` calling
      `pruneAcksForJob` while holding the lock does **not** deadlock (C8h).
- [ ] AC-13h — The `src/core/alerts.js` lines 87–88 residual comment no longer describes
      unlocked compaction (C8i).
- [ ] AC-14 — `grep -n "require(.*src" src/scheduler/launcher.js` shows no app-tree
      require (C11).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern alerts
npm test -- --test-name-pattern digest
npm test -- --test-name-pattern launcher
npm test
npm run lint
# C11 — the launcher still requires no app-tree code (expect NO output):
grep -n "require(['\"]\.\./src\|require(['\"]\.\./\.\./src" src/scheduler/launcher.js
# C8d/C8f — the lock is defined once in launcher.js and REQUIRED by alerts.js:
grep -n "acquireLauncherLock\|stillHeld" src/scheduler/launcher.js src/core/alerts.js
# L11/B9 — the dependency runs app -> launcher only (expect NO output):
grep -n "require(['\"]\.\./core\|require(['\"]\.\./\.\./src" src/scheduler/launcher.js
# C3/C4/C5 — the duplicated bounds are present in both places:
grep -n "MAX_ALERTS\|MAX_FILE_BYTES\|MAX_COUNT" src/core/alerts.js
grep -n "200\|512 \* 1024\|1000000\|1_000_000" src/scheduler/launcher.js
# AC-6 — the frozen golden is untouched (expect NO output):
git diff --stat -- tests/golden/digest-default.md
```

## Out of scope (do NOT do these)

- Changing `refusalText`, `REMEDY_TAIL`, the remedy discriminator, or any verification
  logic in the launcher.
- Writing, clearing or displaying the refusal banner — `WP-launcher-refusal-banner`
  and `WP-refusal-banner-delivery`.
- Changing the acknowledgement store (`alerts-ack.json`) or `unacknowledgedAlerts`.
  Acknowledgement keys on `(job, reason)`, which collapsing preserves exactly — no ack
  change is needed or permitted here.
- **`clearAlerts` is NOT out of scope** — round 5 both mandated and forbade changing it
  (finding U5). Exactly **three** changes to it are authorized, and nothing else: (1) it
  takes the shared lock (C8f); (2) it degrades to the C8g fallback when the lock cannot
  be acquired; (3) it calls `handle.stillHeld()` before its rewrite rename (C8h1). Its
  filtering semantics, its `pruneAcksForJob` call, and its remove-when-empty behaviour
  are unchanged.
- Adding a bound or a collapse to the app-side `appendAlert` beyond the ones it
  already has.
- Any change to the managed block, the adapters, or the digest's body sections.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(launcher): bound the refusal alert log (WP-launcher-alert-bound)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1), implementing the repair
  the 2026-08-01 logbook drafted and withdrew.
- **2026-08-30 — Codex round-2 finding F6 (owner: ACCEPTED — compare-and-retry).**
  Round 1's C8 mirrored `appendAlert`: append atomically, then read-compact-rename. That
  protects the appending writer's **own** record but silently discards any record a
  *concurrent* launcher appended between the read and the rename. `appendAlert` tolerates
  that residual because its writers are `run-job` processes that rarely overlap; the
  launcher's writers are **scheduled**, so simultaneous fires are routine rather than
  exceptional — the same residual carries a materially higher probability here. New rows
  **C8a** (capture `size` + `mtimeMs` at read time, re-`stat` before rename, discard and
  retry once, then leave uncompacted), **C8b** (the accepted same-timestamp residual,
  cited to `src/core/alerts.js` lines 87–88), and **C8c** (`rmSync` the temp on rename
  failure — Codex P2). New AC-13a and AC-13b assert the interleaving by mutating the
  file between read and rename.
- **2026-08-30 — Codex round-2 findings R2 + R5 (owner: ACCEPTED, REVERSING the round-2
  Q3 ruling).** Round 2's C8a compare-and-retry **narrowed** the lost-update window
  rather than closing it, and the sibling WP's banner rebuild had an identical unclosed
  window — so the chain would have shipped two differently-shaped half-guards for one
  problem. Replaced by a **single launcher-owned lock** (`WP-launcher-refusal-banner`
  Table L) serialising both launcher-owned state files. **C8a and C8b dropped**; **C8c
  retained** (temp cleanup); new **C8d** (the lock, mirroring Table L), **C8e** (the
  unacquirable-lock fallback: append anyway, skip only compaction — fail-loud is never
  sacrificed to the lock), **C8f** (the residual, plus the explicit note that the
  app-side `appendAlert` does **not** take this lock and its `alerts.js:87–88` residual
  is unchanged and out of scope). AC-13a/13b rewritten and AC-13c added. Table L is
  registered in the Mirrored Surface Checklist so the two specs move together.
  **Also, from the round-3 AC-to-Deliverables consistency pass:** this WP had
  `depends_on: []` while consuming a lock that `WP-launcher-refusal-banner` introduces —
  shipping it first would have meant either a second lock implementation or a broken
  build. `depends_on` now names that WP, and C8d says explicitly that the lock is
  introduced there and only consumed here.
- **2026-08-30 — Codex round-3 finding S3 (owner: ACCEPTED).** Round 3 scoped the lock to
  the launcher and explicitly recorded the app-side `appendAlert` as out of scope — a
  boundary I stated clearly and got wrong. Both sides write **the same file**, so the lock
  closed the launcher-vs-launcher race and left the launcher-vs-app race wide open, which
  is the more likely one (a nightly fire during an attended `sync`). Corrected: **every**
  writer of `alerts.jsonl` takes the same lock. `src/core/alerts.js` **requires**
  `acquireLauncherLock` from `src/scheduler/launcher.js` (release and the fence are methods
  on the handle it returns) — safe
  because `launcher.js` is require-safe (`module.exports` precedes its
  `if (require.main === module)` guard) and the direction is app → launcher only. The
  vendored `<core>/launcher/launch.js` is a byte copy of that same file, so the protocol
  cannot drift: **one implementation, no twin literals** (ADR-0031). C8f replaced;
  new **C8g** (app-side fallback degrades exactly like the launcher's), **C8h**
  (`alert-ack.js` writes a *different* file and must **not** take the lock — it is called
  from inside `clearAlerts`, which already holds it, so locking there would self-deadlock),
  **C8i** (residual, plus the requirement to update the now-false `alerts.js` lines 87–88
  comment). New AC-13d … AC-13h.
- **2026-08-30 — Codex round-4 findings T1 and T3 (owner: ACCEPTED).**
  - **T3 — C8d still carried the superseded algorithm.** The cell restated a bare
    `rmdirSync` release, a 10 s staleness threshold and a 5 × 200 ms wait — the round-2
    protocol, which S1/S2 replaced in round 3 and T1/T5 amended again in round 4. It
    survived **two** rewrites because it was a *copy* of the algorithm rather than a
    reference to it, which is precisely the failure ADR-0031 canonical tables exist to
    prevent, committed inside a spec that cites ADR-0031. C8d is now a **pointer row**:
    it names Table L and the exported primitives and restates no mechanism at all. New
    AC-13c1 and AC-13c2 assert token ownership and the wait/staleness inequality **through
    the launcher's exported constants**, so this spec cannot drift from them again.
  - **T1 — the commit-time fence applies to both app-side rewrites.** New **C8h1**:
    `appendAlert`'s compaction and `clearAlerts`'s filter-and-rewrite both call the fence
    before `renameSync`. Without it an evicted holder replaces `alerts.jsonl` with a
    pre-successor snapshot — a fail-loud record destroyed by the machinery meant to
    protect it. New AC-13c3 and AC-13c4 cover the evicted-holder compaction and
    `clearAlerts` paths.
- **2026-08-30 — Codex round-5 findings U2, U3, U5 (owner: ACCEPTED).**
  - **U5 — this spec both mandated and forbade the same change.** S3 required
    `clearAlerts` to take the shared lock while Out-of-scope still said "Changing
    `clearAlerts` … is not needed or permitted here" — an implementer following the spec
    literally could not satisfy it. The prohibition is replaced with an **exact
    authorization**: the shared lock, the C8g fallback, and the commit-time fence, and
    nothing else; filtering semantics, the `pruneAcksForJob` call and remove-when-empty
    are explicitly unchanged.
  - **U2.** C8d/C8f and the notes now describe the **opaque handle** (`{release,
    stillHeld}`) rather than a `releaseLauncherLock` free function; no token crosses the
    module boundary. New AC-13c6.
  - **U3.** C8h1 extended: `clearAlerts`' `rmSync` of the whole file when no records
    remain is a destructive operation and is fenced identically. New AC-13c5.
