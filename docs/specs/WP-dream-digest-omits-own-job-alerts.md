---
id: WP-dream-digest-omits-own-job-alerts
title: Stop the dream's own digest render from re-showing the alerts its success clears
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0031, ADR-0042]
---

# WP-dream-digest-omits-own-job-alerts: the dream's digest render shows the state the run establishes

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the template gives
  the skeleton, the runbook the rules. Read both.

> **RE-OPENED 2026-09-17 — the design gate is NOT closed, and this spec is back
> to `Draft`.** After round 3 closed the loop and this spec went `Ready` (merged
> as PR #248) **a confirming round by a DIFFERENT reviewer — round 4, Codex
> plugin adversarial-review, model `gpt-6-astra`, on tip `ebcdda00` — returned
> `needs-attention` with two product findings and one machinery finding**, each
> backed by in-memory execution of the production function bodies rather than by
> reading them. **An implementation had already been dispatched against the
> `Ready` spec; it is PAUSED, and the implementer must be RE-DISPATCHED against
> this revised spec** — work done against the previous text is not to be resumed,
> because two of that text's load-bearing assumptions were false:
>
> - **A-1 (HEAVY):** *"run-job appends a failure only after the child exits"* —
>   **false.** The watchdog rejects independently of the child's close event
>   (`src/cli/run-job.js` l.1086, raced at l.1090), so `failLoud` (l.1257) can
>   append **while the dream child is still alive**. That survivor holds a
>   legitimately minted run token and can reach step 19 and hide the supervisor's
>   already-recorded failure, which that supervisor will never clear.
> - **A-2 (HEAVY):** *"a failed recovery render leaves the previous filtered bytes
>   intact"* — **false.** `writeFilePrivate` renames at `src/core/private-fs.js`
>   l.360 and only then verifies destination identity, throwing
>   `WD_F10_POST_RENAME` (l.372) **after publication**.
> - **A-3 (LIGHT, machinery):** AC7 established neither finalizer coverage nor
>   exactly-once recovery.
>
> **The lesson, recorded because it is about the process and not this package:**
> three rounds of one model approved a design whose two load-bearing assumptions
> a second model falsified by **executing** the production function bodies.
> Reading is not evidence. Rounds 1-3 are still on the record and their fixes
> still stand; what they could not do is find these.
>
> Rounds 1-3 (3 findings, then 2, then 0) and round 4's dispositions are
> `docs/specs/logbook/2026-09-17-dream-digest-omits-design-review.md`; each
> round's raw output was committed before adjudication (`d86e1616`, `2eeba955`,
> `6c96471c`, `31bd9377`). Owner items **O1, O2, O3** remain recorded under the
> standing process in
> `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`; **O3's
> premise was overstated and is corrected below** — that record is not edited by
> this pass, so read O3 here for the current wording.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): a scheduled job is an OS schedule entry that
runs `wienerdog run-job <name>`, and every durable fact it produces is a file
under `~/.wienerdog/`. Two of those files matter here.

**`state/alerts.jsonl` is the durable failure record.** When a scheduled job
fails, `src/cli/run-job.js` "fails loud": it appends one JSON line
(`{job, at, reason, log_hint}`) via `appendAlert` and best-effort emails the
user. When that job next *succeeds*, `run-job` calls `clearAlerts(paths, name)`
and removes every line for that job. Appending and clearing are **run-job's**,
never the job body's (WP-041). There is no expiry, no age-out: only a successful
run retires a record.

**`state/digest.md` is a derived view of it.** `renderDigest`
(`src/core/digest.js`) prepends one `> [!warning]` callout per failing job,
rendered by `formatAlerts`, whose closing sentence is byte-frozen code-owned
text (WP-neutralize-alert-callout-rendering):
`This note clears automatically when the job next succeeds.` The digest is
injected into every new Claude Code / Codex session by the SessionStart hook, so
whatever it says is what every session believes. **Exactly two places write
`digest.md`: `src/cli/dream.js` and `src/cli/sync.js`** — WP-041 deleted
run-job's own `writeDigestBanner` and made its absence an acceptance criterion.
`sync` is attended-only, so on an unattended machine the nightly dream is the
*only* thing that refreshes the digest.

**The promise is off by one for the `dream` job, and it lasts 24 hours.** The
dream regenerates `digest.md` as its own step 19, from inside the job body —
before `run-job` can observe that the job succeeded and clear its alerts.
Verified in production on 2026-09-10 (0.13.0): the 01:30 UTC dream failed and a
record landed in `alerts.jsonl`; the 02:00 catch-up dream **succeeded**, and at
its step 19 that record was still on file, so the fresh `digest.md` was written
with `> [!warning] Wienerdog: the "dream" job has failed …`; only afterwards did
run-job clear `alerts.jsonl`. Result: `alerts.jsonl` clean, `schedule.json`
`last_status: ok`, and every session for the next 24 hours told the model the
dream job had failed. All three files carried the same mtime.

WP-041 saw this and accepted it: *"**Known one-regeneration lag (accept it,
record it):** when a dream succeeds, `dream.js` regenerates `digest.md` before
`run-job` clears the alert (the clear happens after the child exits). So the
just-written digest may still show a stale block; the next `sync`/dream
regeneration drops it. … Do NOT couple `run-job` to the digest renderer to shave
this lag."* **This WP withdraws that acceptance and keeps the prohibition.** The
acceptance rested on "the next regeneration drops it"; in the field the next
regeneration is the next nightly dream — 24 hours of a false failure claim in
every session — or an attended `wienerdog sync` that an unattended machine never
gets. The prohibition stands untouched: run-job still renders no byte of
`digest.md`, and nothing new calls `renderDigest`.

The fix is the mechanism the alert-acknowledgement WP already established —
**hand `renderDigest` a filtered array; never touch `formatAlerts`** — applied
at the dream's own call site. It is also the consistent application of the rule
the dream's step-19 comment already states in the same breath (*"THE ORDER IS
THE CONTENT (row G4, Table V row V10): `state/digest.md` is the next session's
context, so regenerating it BEFORE the ledger is persisted would show that
session a state this run has already changed"*): by step 19 the dream's work has
succeeded, so rendering "the dream job has failed" shows the next session a
state this run has already changed.

**And the same sentence bounds the fix.** Step 19 is the FIRST point at which
that is true, so it is the ONLY render this WP filters: the dream's earlier
quarantine-only refresh runs before the run's outcome is known and keeps showing
every record, and a failure after step 19 renders again, unfiltered. Design
round 1 found the first draft filtered both sites and could therefore hide a
genuine unresolved failure; Table A's principle row is the rule that replaced
it — *when in doubt the stale callout is shown; a genuine one is never hidden*.

## Current state

Every line citation below was re-derived at `b4af715e` (`origin/main` after
PR #245) and re-verified by the design gate at **`545df8bd`**, the base this spec
was approved against; `src/` is byte-identical between the two. Follow a citation
by grepping its quoted text; the line number disambiguates, it does not locate.

**Round 4 added executable claims to this section and they carry the same
obligation**: the watchdog race, the rename-then-verify order, the alert record's
shape and ordering, and the `try`/`finally` topology are all runnable and all
re-run at dispatch. **The dispatcher re-runs these claims before handing this WP
to an implementer** and records the SHA it ran them against, per
`docs/runbooks/codex-review.md`, "Dispatch-time re-verification". `Ready` is not the same as "still true": any
merge landing between this approval and dispatch can falsify a line number here
without anyone editing this file. A stale claim routes back to wd-architect, not
to the implementer, whose Deliverables boundary usually excludes the file that
would fix it.

- `src/cli/dream.js` (1233 lines). Inside `run()`, the closure
  `regenerateDigest` (l.641 `const regenerateDigest = () => {` through l.660
  `};`) assembles every digest input and writes the file. Its alerts input is,
  verbatim, l.646:
  `alerts: unacknowledgedAlerts(paths, readAlerts(paths)),`. The closure is
  called from exactly **two** sites: l.724 (the quarantine-only refresh, after
  `writeLedger`, dry-run-guarded) and l.1182 (step 19, after `writeLedger`).
  Both are inside the same `run()` and both see the same closure.
- **`dream.js` does not currently require the scheduler's jobs module.** Its
  require block is l.3-39 and carries no `require('../scheduler/jobs')`; the
  cross-check in "Exact contracts" adds one. It is a first-party module — zero
  new package dependencies (CLAUDE.md).
- **The paths out of `run()` that reach no render**, measured in call order from
  the lock:
  - l.593 `const lock = acquireLock(paths.state, cfg.timeoutMs);`
  - l.595-600: `lock.reason === 'owner-unknown'` → `throw new WienerdogError(…)`.
    **New in PR #245.** Non-zero exit, nothing rendered.
  - l.601-602: any other declined acquisition (the lock module's `busy`, see
    `src/core/dream/lock.js` l.20 and l.40) →
    `console.log('wienerdog: another dream holds the lock.'); return;`
    **Exit 0, nothing rendered.** Pre-existing; PR #245 changed only the message
    string. See Table A row "Paths that render nothing" and Out of scope.
  - l.736-743: `sel.entries.length === 0 && exclusions.length > 0` →
    `throw new WienerdogError('dream: no complete session was admitted. …')`.
    The throw is pre-existing (it was the capacity wedge); PR #245 widened its
    trigger from one cause to four (`sel.deferred`, `sel.deadlineDeferred`,
    `sel.oversized`, `sel.readDeferred`, assembled at l.683-700). **It sits
    AFTER the l.724 render site**, so a run can render and then fail.
  - l.746-757 (`nothing new to dream`, exit 0) and l.765-768 (dry-run) also
    return without reaching step 19; the l.724 site is dry-run-guarded at l.721.
- `src/cli/sync.js` l.278 carries the identical alerts expression. It is **not**
  edited by this WP.
- `src/core/alerts.js`: `appendAlert` (append-only, self-compacting),
  `readAlerts` (oldest-first, sanitized, byte-bounded), `clearAlerts(paths, job)`
  (removes every record whose `job === job`, deletes the file when none remain,
  and first calls `pruneAcksForJob`).
- `src/core/alert-ack.js` (146 lines) `unacknowledgedAlerts(paths, alerts)`
  (l.131) returns `alerts` minus the acknowledged pairs. Its JSDoc ends, at
  l.125-127, with these three lines verbatim:

  ```text
   *  A non-array `alerts` returns [] — an upstream PROGRAMMING-ERROR guard, not a
   *  suppression path (both callers pass readAlerts, which always returns an
   *  array). This is the ONLY suppression point (Table B).
  ```

  Those two callers are `dream.js` l.646 and `sync.js` l.278 — the complete set
  in `src/` and `bin/`.
- `src/core/digest.js` l.486-513 `formatAlerts` (l.486 `function formatAlerts(alerts) {`
  through l.513 `}`), whose template ends at l.509 with the "clears
  automatically" sentence. **Not a Deliverable — byte-frozen.**
- `src/cli/run-job.js` (1514 lines): `failLoud` (l.692) appends + emails; the
  policy-hook warning appends at l.953 *before* the spawn (l.1036); the success
  path writes the success marker (B1, l.1188 `jobsLib.writeScheduleState(paths,
  name, { last_success: nowIso(), last_status: 'ok' });`) and then
  `clearAlerts(paths, name)` (B2, l.1204). `runJob` is only ever reached with a
  `job` object obtained from `jobsLib.findJob` / `jobsLib.listJobs` (l.1494 and
  l.1343), i.e. a job that is present in the managed `jobs:` section of
  `config.yaml` at spawn time.
- `buildCleanEnv` (l.150) sets `WIENERDOG_JOB: name` in the child environment on
  **both** platform branches (l.180 win32, l.219 POSIX), and that env object is
  what `spawn` (l.1036) hands the child. `resolveCommand` (l.433) runs
  `builtin:dream` as `node <bin> dream --yes` at l.439, so the dream is a child
  process that reads that variable through `process.env`.
- **`run-job`'s ORDINARY failure path, and when the record appears relative to
  any render** (design round 2): on a failed job `runJob` writes the error
  watermark at l.1251 (`jobsLib.writeScheduleState(paths, name, { last_status:
  'error', last_error_at: nowIso() })`), calls `failLoud` at l.1257
  (`const alertPersisted = await failLoud(paths, name, reason,
  ordinaryFailLoudOpts(opts));`) whose `appendAlert` runs at l.715, and throws at
  l.1269. **Every one of those is after the child has exited**, so the failing
  dream made no render that could have shown the new record; the only render it
  could have made at all is the conditional l.724 refresh, which ran earlier.
- **`wienerdog doctor` does not surface alerts.** Measured on this tree:
  `grep -ci alert src/cli/doctor.js` returns **0**, and the only `readAlerts` /
  `unacknowledgedAlerts` consumers in `src/` and `bin/` are `src/cli/alerts.js`
  (the `wienerdog alerts` command), `src/cli/dream.js` and `src/cli/sync.js`. So
  the channels that carry a dream failure are the fail-loud email and
  `alerts.jsonl` itself — `doctor` is not one and must not be cited as one.
- `src/scheduler/jobs.js`: `findJob(paths, name)` (l.190) is
  `listJobs(paths).find((j) => j.name === name) || null`; `listJobs` (l.199-208)
  wraps its `readConfig` in `try { … } catch { return []; }`. **An unreadable or
  missing `config.yaml` therefore resolves no job by construction**, which is
  Table A's failure direction already built into the lookup.
- **The per-run token channel, both ends, read in full** (round 1's F1 correlate):
  - **Minted** at `src/cli/run-job.js` l.934-938 (the `if` block, both ends
    checked), inside `runJob`, immediately after
    `const env = buildCleanEnv(paths, name, platform);` (l.917) and onto
    that same object: `if (job.run === 'builtin:dream' && platform !== 'win32')
    { const runToken = crypto.randomBytes(8).toString('hex');
    env.WIENERDOG_DREAM_RUN_TOKEN = runToken; … }`. That `env` is what `spawn`
    (l.1036) hands the child, so `WIENERDOG_JOB` and the token arrive together.
  - **Also set under `--catch-up`**: `catchUp` (l.1340) runs its due jobs through
    `const doRun = opts.runJob || runJob;` (l.1398) → `await doRun(paths, job,
    opts)` (l.1411), i.e. the same `runJob` and the same mint. There is no
    catch-up-only path that skips it.
  - **NOT set on win32**: l.934's guard is `platform !== 'win32'`, a deliberate
    A10 scope limit (its own comment names `WP-a10-windows-reap`). Consequence
    for this WP in Table A, "Supervisor correlate".
  - **Consumed** at `src/cli/dream.js` l.827-828, inside the brain-spawn block:
    `const rawToken = process.env.WIENERDOG_DREAM_RUN_TOKEN; const runToken =
    typeof rawToken === 'string' && /^[a-f0-9]{16}$/.test(rawToken) ? rawToken
    : null;` — *anything else treated as absent (standalone run)*. That is the
    validation Table A reuses; it is re-applied at the render, not re-invented,
    and the existing read at l.827-828 is not moved or altered.
  - What it does **not** establish: dream holds no prior copy of the token and
    the hand-up pidfile named after it does not exist yet at render time, so the
    check is shape-and-presence only — possession, not parentage (Table A,
    "Supervisor correlate", limit (b)).
- Tests: `tests/unit/dream-pipeline.test.js` (2220 lines) drives whole in-process
  dream runs through a `runDream(ctx, argv, opts)` harness — see its existing
  case *"the digest is regenerated AFTER the ledger is persisted (row G4, Table V
  row V10)"* (l.829). `tests/unit/scheduler-runjob.test.js` (3026 lines) drives
  `run-job` with fake commands (`opts.resolveCommand`, `opts.skipContainmentProbe`,
  `opts.sendAlert`) and already covers B1/B2 and the policy-hook warning.
  `tests/unit/dream-pipeline.known-calls.js` is SHA-pinned but pins only the git
  call set — nothing in this WP touches it.
  `tests/red-proofs/dream-pipeline.proofs.json` already exists and declares
  `"suite": "tests/unit/dream-pipeline.test.js"`; a declaration file is per WORK
  PACKAGE, not per suite, so this WP adds a file of its own rather than editing
  that one.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | per Table A: give `regenerateDigest` a per-call flag defaulting to UNFILTERED; filter its alerts input at the step-19 site ONLY, under all THREE conjuncts including the per-record date test; capture the process start instant at the top of `run()`; **arm the recovery BEFORE the filtered render call** and add the second recovery site wrapping `finally A`'s body (l.1213-1222), plus the `catch A` that does not exist today; and add the `require('../scheduler/jobs')` the cross-check needs. The existing `WIENERDOG_DREAM_RUN_TOKEN` read at l.827-828 is re-used, not moved. No other behavior changes |
| modify | src/core/alert-ack.js | **comment only, zero code lines**: narrow the stale universal in `unacknowledgedAlerts`' JSDoc per Table B |
| modify | tests/unit/dream-pipeline.test.js | cover the dream-layer acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/scheduler-runjob.test.js | cover the run-job-layer acceptance criteria below |
| create | tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json | this WP's seven RED declarations (Table C); `suite` is `tests/unit/dream-pipeline.test.js` |

### Exact contracts

One predicate is added to `src/cli/dream.js`. Its name and placement are the
implementer's; its behavior is Table A's, and this is the shape:

```js
/** The job name whose success THIS dream run will establish, or null when this
 *  process is not a supervised dream job. Env is the supervisor's channel,
 *  config is the authority, and the per-run token is the correlate — ALL THREE
 *  are required (Table A, "Resolved job name"): `process.env.WIENERDOG_JOB`
 *  names a job that config.yaml defines with `run: builtin:dream`, AND
 *  `process.env.WIENERDOG_DREAM_RUN_TOKEN` matches /^[a-f0-9]{16}$/ — the same
 *  validation this file already applies to that variable. Anything else → null.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {string|null} */
function supervisingDreamJob(paths)
```

**The closure gains an explicit per-call flag and its default is UNFILTERED**
(Table A, "Where applied"), so the filtering behaviour exists only where a call
site asks for it by name. The alerts input at `src/cli/dream.js` l.646 becomes
the same expression with Table A's filter applied to its **result**, conditioned
on that flag:

```js
alerts: <filter>(unacknowledgedAlerts(paths, readAlerts(paths))),
```

The three call sites, and the whole of the placement contract:

| Call site | Flag | Why |
|-----------|------|-----|
| l.724, the quarantine-only refresh | **unfiltered** | this run may still fail; a record hidden here would be a genuine unresolved failure (Table A, "When it may omit") |
| l.1182, step 19 | **filtered** | the only point at which this process's dream work has succeeded |
| the late-failure recovery render (new; Table A, "Late in-process failure") | **unfiltered** | the run failed after step 19, so every omitted callout is restored |

Worked example. `config.yaml` defines `- name: dream / run: builtin:dream`;
`state/alerts.jsonl` holds

```json
{"job":"dream","at":"2026-09-10T01:30:04.001Z","reason":"job \"dream\" exited 1","log_hint":"~/.wienerdog/logs/dream/"}
{"job":"daily-digest","at":"2026-09-10T05:00:11.900Z","reason":"job \"daily-digest\" exited 1","log_hint":"~/.wienerdog/logs/daily-digest/"}
```

and the dream runs with `WIENERDOG_JOB=dream`.

**The literal `state/digest.md` this writes, in full.** Both files below were
produced by running the real renderer — `renderDigest` from `src/core/digest.js`
at this spec's pinned base — over an empty `mktemp -d` vault directory with
`opts.identityApprovals` left undefined, so no identity section exists and the
alert callouts are the entire file. That is the smallest fixture that still
demonstrates the contract: the own-job callout omitted, another job's kept.
(How it was produced is recorded in
`docs/specs/logbook/2026-09-17-dream-digest-omits-own-job-alerts-round-zero.md`.)

Supervised (`WIENERDOG_JOB=dream`) — **207 bytes**, the whole file:

```markdown
> [!warning] Wienerdog: the "daily-digest" job has failed. Latest error: job "daily-digest" exited 1. Details in ~/.wienerdog/logs/daily-digest/. This note clears automatically when the job next succeeds.


```

Unsupervised (`WIENERDOG_JOB` absent — an attended `wienerdog dream`; these are
today's bytes, unchanged by this WP) — **391 bytes**, the whole file:

```markdown
> [!warning] Wienerdog: the "dream" job has failed. Latest error: job "dream" exited 1. Details in ~/.wienerdog/logs/dream/. This note clears automatically when the job next succeeds.
> [!warning] Wienerdog: the "daily-digest" job has failed. Latest error: job "daily-digest" exited 1. Details in ~/.wienerdog/logs/daily-digest/. This note clears automatically when the job next succeeds.


```

**The trailing bytes are part of the expected output and a fenced block cannot
show them unambiguously**, so they are stated: each file ends with the last
callout line's `\n` followed by **exactly two more** `\n` — the rendered string
ends `succeeds.\n\n\n`, which is 3 lines by `wc -l` for the supervised file and
4 for the unsupervised one. The two callout lines are **not** wrapped: each is
one long line. The difference between the two files is exactly the 184 bytes of
the `"dream"` callout line, and nothing else — which is Table A's
empty-omission identity in bytes.

## Contract reference

Activation (ADR-0031, 2-of-7): **(v)** the task crosses an authority boundary —
`run-job` owns the alert lifecycle while `dream.js` owns the render that
displays it; and **(vii)** the same contract appears in mirrored surfaces
(Deliverables cells, acceptance criteria, verification gates, the RED
declarations' `why` fields, the JSDoc in `alert-ack.js`).

### Table A — the alerts the dream's digest render omits

| Fact / rule | Value |
|-------------|-------|
| **THE PRINCIPLE** | **when in doubt the stale callout is SHOWN; a genuine one is never hidden.** Every unresolved question resolves to rendering the record: an unresolved name, an absent or malformed run token, an unreadable config, a lookup that throws, a render reached before this run's success is established, a failure after that render. The principle governs what **this process's own renders** show, which is all a render in `dream.js` can govern. It does **not** promise that a failure recorded after this process exits reaches the digest at all — that is a separate, pre-existing property of the product, stated in the "What reaches the digest for the dream's OWN failures" row and unresolved as owner item O3. Every other row of this table is an application of one of those two |
| Where applied | the `regenerateDigest` closure in `src/cli/dream.js` and nowhere else. The closure takes an **explicit per-call flag whose default is UNFILTERED**, so a call site added later is safe by construction and a filtering call must say so at the call. **Exactly ONE call site passes the filtering value: step 19 (l.1182).** The quarantine-only refresh (l.724) and the late-failure re-render (below) render **unfiltered**. `src/cli/sync.js` is unchanged; **no third feeder of the digest's alerts array is created** |
| When it may omit | **only at the final render**, which is the first point in `run()` at which THIS process's dream work has succeeded: the ledger is persisted (l.1164) and every step that can fail the run's own body is behind it. Before that point nothing is omitted, because the run may still fail and leave the record genuine. This row is what makes the l.724 site unfiltered — not an oversight to be tidied later |
| Filter position | applied to the **result** of `unacknowledgedAlerts(paths, readAlerts(paths))`, leaving that expression textually intact. Both orders yield the same set; this order is required so `alert-ack.js`'s standing claim that *both callers pass `readAlerts`* stays true (Table B narrows only the sentence that this WP actually falsifies) |
| Resolved job name | **two conjuncts about the RUN, both required** (a third conjunct about each RECORD is the next row). (1) `process.env.WIENERDOG_JOB` names a job that `jobsLib.findJob(paths, thatValue)` returns with `run` exactly the string `builtin:dream`; AND (2) `process.env.WIENERDOG_DREAM_RUN_TOKEN` is present and passes **the same validation dream.js already applies to it** — `typeof === 'string'` and `/^[a-f0-9]{16}$/` (l.827-828), re-applied, not re-invented. Every other case resolves to **no name**: either variable absent, not a string, empty or malformed; a name `config.yaml` does not define; a job whose `run` is anything else |
| **Record date — the THIRD conjunct, and it is per-RECORD not per-run** | Even with a resolved name, a record is omitted **only if its `at` is STRICTLY EARLIER than this dream process's start instant.** The start instant is captured **once, at the top of `run()`** — `src/cli/dream.js` l.557 `async function run(argv, opts = {}) {`, before l.558's first statement — as a wall-clock millisecond value, and it is **not** taken from the `opts.now` seam: that seam exists to resolve the dream's DATE STRING, and letting a test's date injection move this boundary would make a safety property depend on a test seam. Parsing is **strict**: the record is omitted only when `at` is a non-empty string that parses to a finite timestamp AND that timestamp is `< start`. **A missing, empty or unparseable `at` means the record is SHOWN**, as does a timestamp equal to the start instant. Why this conjunct exists: `run-job`'s watchdog rejects independently of the child's close event (`src/cli/run-job.js` l.1086, raced at l.1090), so `failLoud` at l.1257 can append a record **while this dream child is still alive** — a record dated AFTER this process started, describing a failure this run is already being blamed for and which that supervisor will never clear. The run-level conjuncts cannot see that case; the record's own date can |
| Clock movement, and which way the error falls | the comparison is wall-clock on both sides by construction — `at` is an ISO timestamp written by `nowIso()` and the start instant is the same clock — because a monotonic reading cannot be compared to a stored ISO string. **A clock that moves FORWARD is safe**: an older record can only end up dated later than the start instant, and a record not strictly earlier is SHOWN. **A clock that steps BACKWARD between this process's start and a supervisor append is the unsafe direction**: that append can be stamped earlier than the start instant and would then be omitted. Named, not chased — it needs a backward wall-clock step inside that specific window, and closing it would need a record field (a run token or a monotonic stamp) that `{job, at, reason, log_hint}` does not have (`src/core/alerts.js` `sanitizeAlert` l.46-50 drops unknown keys). Adding one is a change to the alert record's schema and is out of scope |
| **Every writer that can append under the dream's own name, and what the date rule does to each** | Enumerated because the date rule's effect differs per writer, and a rule stated without its writers is a rule nobody can check. **(a) `src/scheduler/launcher.js` l.509** `appendRefuseAlert(p, jobName, reason)` — a **separate process**; the record is built at l.192 as `{ job, at: new Date().toISOString(), reason, log_hint: '' }`. A fire refused while a dream is running is therefore dated AFTER that dream's start → **SHOWN**. Correct and intended. **(b) `src/cli/run-job.js` l.953** — the managed-policy warning, appended under the job's name **before the spawn**, so it is dated **before** this run's start → **OMITTED** by the date rule. That is the same loss Table A's last row already prices, and the **Maintainer ruling (2026-09-10) — "this WP ships first; the follow-up WP is drafted later"** — already defers it. **Do not fix it here.** **(c) `src/cli/run-job.js` l.1257** on the reap-failure path — the dream child has exited but its brain group is alive by construction; the record is dated after this process's start → **SHOWN**. **(d)** the same l.1257 on the watchdog-timeout path, with the child still alive → **SHOWN** (the case the conjunct exists for) |
| **Where recovery is armed, stated so it cannot be read the other way** | The arming statement **precedes** the filtered render call in program order. Measured on the paused implementation (`wp/dream-digest-omits-own-job-alerts` @ `9d1282cf`), the current code is `regenerateDigest({omitOwnJobAlerts:true}); restoreAfterStepNineteen = regenerateDigest;` — armed **after** the render returned, which is exactly the shape A-2 falsifies: a render that publishes and then throws `WD_F10_POST_RENAME` never reaches the arming line. **The two statements swap.** **Topology, measured on this tree** (`src/cli/dream.js`): `try A` opens at **l.608** and its `finally A` is at **l.1213-1222**; `try B` opens at **l.815** and its `finally B` at **l.1206-1212**. There is **no `catch A` today** — the implementer adds one. A throw raised inside `finally A` is **invisible to `catch A`** by JS semantics, so the recovery needs **two sites** — one in `catch A`, one wrapping `finally A`'s body — and **at most one of them may run**: "exactly one attempt" is a property of the pair, not of either site |
| Supervisor correlate (the run token) | the token is minted per `runJob` invocation in the `if` block at `src/cli/run-job.js` **l.934-938** (both ends checked: l.934 `if (job.run === 'builtin:dream' && platform !== 'win32') {`, l.938 its closing `}`) — `crypto.randomBytes(8).toString('hex')` at **l.935**, the export at **l.936** — onto the same `env` object `buildCleanEnv` returned at **l.917**, which `spawn` (l.1036) hands the child — so on the supervised path both variables arrive together, **including under `--catch-up`**, which calls the same `runJob` (l.1398 `const doRun = opts.runJob \|\| runJob`). **Two limits, stated rather than implied.** (a) The mint is guarded by `job.run === 'builtin:dream' && platform !== 'win32'` (l.934), so **no token is minted on win32** and the omission therefore never engages on Windows — the stale callout stays, which is the safe direction, but this WP's fix does not reach that platform. (b) The token proves **possession of a supervisor-minted per-run value, not parentage**: dream has nothing to compare it against, so a process inheriting both variables still passes. It strictly narrows the accidental-inheritance vector; it does not close it. See O1's residual |
| Why this channel at all | the supervisor owns the alert lifecycle, so the supervisor is the only party that can say which job's alerts this run's success will clear; both variables are set by it in the child env. The config cross-check makes the accepted value config-derived rather than merely asserted, and it can never be inert on the scheduled path, because `runJob` is only reachable with a job that `findJob`/`listJobs` returned (`src/cli/run-job.js` l.1494, l.1343). **Not ruled on by the owner — see "Dispatch precondition — owner items", O1, which also carries the residual this channel leaves open** |
| Omitted set | when a name resolves **and** the call site is the filtering one: every record in the array whose `job` **strictly equals** that name **and whose `at` is strictly earlier than this process's start instant** (row above) — exactly the set `clearAlerts(paths, name)` will remove. Otherwise nothing is omitted, and the rendered bytes equal today's |
| Failure direction | **fail-safe toward SHOWING** (the principle row). Nothing in this filter may throw out of `regenerateDigest`. `listJobs`' own `catch { return []; }` (`src/scheduler/jobs.js` l.199-208) already gives the config-read half by construction |
| Paths that render nothing | a run that returns or throws without reaching a render leaves `digest.md` byte-untouched, so the filter has no effect there and the spec claims none: the `owner-unknown` lock throw (l.595-600, new in PR #245), the declined-lock exit-0 return (l.601-602), `nothing new to dream` (l.746-757) and the dry-run return (l.765-768). What the **supervisor** does on those paths is run-job's contract, not this one — the exit-0 declined-lock case is named in Out of scope |
| Early render then failure | a run can render at l.724 and then throw — the widened no-complete-input throw at l.736-743, the step-8b containment halt, a brain failure. **Because l.724 is unfiltered, the genuine callout is still on screen on every one of those paths**, and AC6a-AC6b assert the digest's content there, not only `alerts.jsonl`'s |
| Late in-process failure — **recovery is ARMED BEFORE the filtered render is attempted** | The recovery path covers **the filtered render attempt itself and everything after it**, up to and including `run()`'s return. Arming it only *after* `regenerateDigest()` returns is WRONG and is named as such: `writeFilePrivate` renames at `src/core/private-fs.js` l.360 and only then verifies the destination's identity, throwing `WD_F10_POST_RENAME` (l.372) **after the filtered bytes are already published**, so a throw out of the filtered render is exactly a case where recovery is needed. The covered region therefore begins at the step-19 call and ends at `run()`'s return, and it **must include both existing finalizers** — the workspace teardown `finally` (`src/cli/dream.js` l.1206-1212, `destroyWorkspace(workspaceDir)` at l.1211) and the outer scratch/lock `finally` (l.1213-1222, `cleanScratch` at l.1220, `releaseLock` at l.1221) — because a throw from either is a late in-process failure like any other. On any such throw: **exactly ONE unfiltered `regenerateDigest()` attempt** is made — one, whether the throw came from the render, the body or a finalizer, and one even if that attempt itself fails — the **ORIGINAL error still propagates**, and the recovery exception, if any, is reported as **exactly ONE fixed-text stderr line** carrying no interpolated bytes from the exception, the record, the config or any path (plain language, CLAUDE.md). The placement and wrapping are the implementer's; "armed before the filtered render", "exactly one attempt", "covers both finalizers", "unfiltered", "original error wins" and "one fixed-text line, no interpolation" are not |
| What a failed recovery leaves on disk — **the preservation guarantee is WITHDRAWN** | Round 2 stated that a failed recovery leaves the previous filtered bytes intact. **That is false and is withdrawn.** Two boundaries, and the spec distinguishes them instead of generalising: **(i) pre-publication failure** — the recovery render throws before its `renameSync` — the destination is **unchanged** and still holds whatever the filtered render left; **(ii) post-rename verification failure** — the recovery render's rename succeeded and the identity check then threw (`private-fs.js` l.360 → l.372) — the destination **may already hold the new, unfiltered bytes**, or bytes a concurrent writer substituted. So the honest statement is: **after a failed recovery the destination's contents are not guaranteed by this WP either way**, and the single stderr line is the whole of the remedy. No criterion may assert preservation |
| **What reaches the digest for the dream's OWN failures** | **A pre-existing property of the product, measured in design round 2, which this WP does not create and does not fix.** A failed dream never reaches step 19, and on the ORDINARY failure path `run-job` appends the failure record after the child has exited (**not always — see the next row; round 4 falsified the "only after exit" universal**) (`src/cli/run-job.js` l.1251 error watermark → l.1257 `failLoud` → the append inside it at l.715 → l.1269 throw). The only render the failing run could have made is the **conditional** early quarantine refresh at `dream.js` l.724, and that ran *before* the record existed. So **today, before this WP**, a dream-job failure's callout enters `digest.md` only at a LATER render — an attended `wienerdog sync`, or a later dream's render — which means the run that typically displays it is the successful one whose success is about to clear it: the user sees the warning **after the failure has already been resolved**. That after-the-fact display is precisely the off-by-one this WP removes. **After this WP** a dream-job failure's callout reaches the digest only via (a) an attended `sync` render or (b) a later dream's l.724 early quarantine render, which is conditional on `sel.newlyQuarantined`. **There is no finite bound on that and this spec claims none.** The durable, timely channels for a dream failure are unchanged: the fail-loud **email** and `alerts.jsonl` itself, read by `wienerdog alerts`. **Measured: `wienerdog doctor` surfaces alerts not at all** — `src/cli/doctor.js` contains **zero** occurrences of the string `alert` — so it is not one of those channels and must not be cited as one. Whether this is acceptable is owner item **O3**, which is unresolved |
| Out-of-process failures, and **the "post-exit-only" claim is WITHDRAWN** | `run-job`'s B1 (success-marker refused, l.1188) and B2 (alert-cleanup refused, l.1204) are **instances of the row above, not separate narrowings**. Round 1's claim that B1/B2 were the SOLE narrowing, and round 1's claim that the exposure was finitely bounded by "the next unfiltered render", were withdrawn in round 2. **Round 4 withdraws one more: the claim that `run-job` records a failure only AFTER the child exits.** It does not. The watchdog's `reject` (`src/cli/run-job.js` l.1086) is raced against the child's close event at l.1090, so on a **timeout** the flow reaches the error watermark (l.1251) and `failLoud` (l.1257) **while the dream child may still be running** — confirmed by round 4's in-memory execution of those bodies, not by reading them. That surviving child holds a legitimately minted run token and can go on to reach step 19. **The record-date conjunct is what covers it**: the supervisor's record is dated after this process started, so it is shown. The surviving general rule, stated without the false universal: **anything `run-job` appends or leaves that this process cannot re-render is invisible in the digest until some later unfiltered render happens, and nothing guarantees one.** Coupling `run-job` to the renderer is rejected alternative A (WP-041 forbids it), so any real fix is supervisor-side and outside this WP |
| **What this run's success actually establishes — and what it does NOT** | It establishes exactly one thing: **this dream process's own body ran to step 19 without throwing.** It does **not** establish that every record it omits describes a resolved condition. The measured counter-case is a **prior run's surviving process group**: `settleReaps` (`src/cli/run-job.js` l.362) examines only **the current run's** groups and token pidfile, so a later run's success proves nothing about a group an earlier run failed to reap — yet that earlier run's reap-failure record predates this process's start and is therefore omitted by the record-date conjunct. **This is not fixable with the record shape we have.** `{job, at, reason, log_hint}` carries no reason class and no run token (`src/core/alerts.js` l.46-50), and discriminating on the free-text `reason` would be brittle string-matching against a message this WP does not own — explicitly out of bounds. **Priced in O3, not fixed here**, and every claim of the form "an omitted callout describes a failure that has been resolved" is **WITHDRAWN** from this spec |
| Never changed | `formatAlerts` and every byte of its template, including the "clears automatically" sentence (byte-frozen, WP-neutralize-alert-callout-rendering); `src/core/digest.js` in any respect; `src/core/alerts.js` and every writer of `alerts.jsonl` (`appendAlert`, `failLoud`, the launcher's `appendRefuseAlert`); `clearAlerts` and where it is called; the acknowledgement store and `addAcks`/`pruneAcksForJob`/`unacknowledgedAlerts`' behavior; `src/cli/sync.js`; `wienerdog alerts`; `schedule.json`; the fail-loud email; the dream's lock handling in every arm. `run-job` still writes no byte of `digest.md` |
| Empty-omission identity | when nothing is omitted the digest is byte-identical to today's, so **no golden fixture moves** |
| Named consequence (managed-policy warning) | `run-job` l.953 appends a *warning* record under the job's own name before the spawn, and the job's success clears it, so today its only lasting surface is the very off-by-one this WP removes — rendered, wrongly, as `the "dream" job has failed`. After this change that banner is gone for the dream. Restoring a standing surface for it is a separate WP (Implementation notes; Out of scope) — it is not a failure and does not belong in the failure-alert log |

### Table B — the `alert-ack.js` comment narrowing

| Fact / rule | Value |
|-------------|-------|
| Anchor | `src/core/alert-ack.js`, the sentence at l.127 whose exact text is `This is the ONLY suppression point (Table B).` It occurs once in the file |
| Replacement | that sentence becomes: `This is the ONLY ACKNOWLEDGEMENT suppression point (Table B) — the only place this store is read. It is NOT the only filter applied to the array a caller hands renderDigest: at its FINAL render only, dream.js drops this result's records for the job whose success that run has just established (WP-dream-digest-omits-own-job-alerts, Table A).` Re-wrapped to the file's JSDoc style; the wrapping is the implementer's, the claim is not |
| Diff shape | **every** changed line in this file is a JSDoc continuation line (matches `^[+-] \*`). Zero executable lines change; behavior is identical before and after |
| Why it is in scope at all | the sentence is an ungated universal that this WP falsifies. `docs/runbooks/spec-authoring.md`: a universal either quantifies over a named table or names its exception set in place. Leaving it standing is how the next reader concludes no other filter exists |
| Not touched | the two sentences before it (the programming-error guard and the both-callers-pass-`readAlerts` parenthetical, which Table A's filter position keeps true), and every other comment or line in the file |

### Table C — the RED declarations (ADR-0042)

`id`, `wp` and `criterion` are fixed here so AC11 can name them without a
repo-wide count. The mutation literal, the marker and the `expectRed` identities
are the implementer's, because the filter's own name and shape are. **Each
declaration breaks exactly ONE conjunct or placement rule and no other**, so the
criterion it reddens is the one that owns that rule — round 1 found the previous
pairing proved a different property than it claimed, and one-rule-per-mutation is
what stops that recurring.

| id | breaks exactly | must redden — the MEASURED set | criterion |
|----|----------------|--------------------------------|-----------|
| `dream-digest-filter-removed` | the filter itself: the alerts input reaches `renderDigest` unfiltered at every site | **AC1** | `1` |
| `dream-digest-filter-ignores-config` | **only** the `findJob` + `run: builtin:dream` conjunct; the env conditional, the token conjunct and the date conjunct are retained | **AC4 AND AC8** — measured. AC8 reddens necessarily, not incidentally: it asserts that an unreadable config omits nothing, which is precisely what removing the config conjunct changes. Round 4 found the previous text claiming AC8 was in no set; that claim was **wrong** and is corrected here rather than papered over with a `testNamePattern` | `4` |
| `dream-digest-filter-always-on` | **both** environment conditionals: the filter omits the configured dream job's records whether or not either variable is set | **AC3 AND AC5** — measured | `3` |
| `dream-digest-filter-ignores-run-token` | **only** the `WIENERDOG_DREAM_RUN_TOKEN` conjunct | **AC5** — measured | `5` |
| `dream-digest-filter-ignores-record-date` | **only** the record-date conjunct: records are omitted by name alone, without comparing `at` to this process's start instant | **AC6f** (the timeout survivor's record is hidden, and the missing/unparseable/equal-`at` edges stop being shown) | `6f` |
| `dream-digest-filter-at-early-render` | **only** the placement rule: the quarantine-only refresh at l.724 passes the filtering value too | **AC6a AND AC6b** — measured | `6a` |
| `dream-digest-no-recovery-render` | **only** the late-failure recovery: the post-step-19 throw path propagates without the unfiltered `regenerateDigest()` | **AC7a AND AC7b** — measured. The implementer extends this to whichever of AC7c-AC7e the mutation actually reddens, since AC7 now counts writes and covers both finalizers; the declared set must EQUAL the observed set | `7a` |

`wp` is `WP-dream-digest-omits-own-job-alerts` for all seven.
`scripts/red-proofs.js` requires the observed own-body failing set to **EQUAL**
the declared set. **The sets above are the ones the paused implementer measured by
hand-applying each mutation** (branch `wp/dream-digest-omits-own-job-alerts` @
`9d1282cf`, suite 2767 pass / 2755 / 0 fail / 12 skipped, lint clean) — they are
measurements, not predictions, and where a measurement contradicted the earlier
text the measurement won. AC2 and AC6e remain in no `expectRed` set: AC2 observes
nothing any mutation changes, and **AC6e pins a PRE-EXISTING product property
that no mutation of this WP's code can alter**. AC9-AC12 are gate criteria the
verification steps establish.

### Mirrored Surface Checklist

Each of these restates a fact decided in Table A, Table B or Table C. A review
finding updates the table **and every mirror below in the same commit** — no
commit exists in which they disagree — and any new mirror found in review is
added here on the spot:

- [ ] Deliverables-table cells (the `dream.js` row cites Table A's flag default,
      filtering site and recovery render, the `alert-ack.js` row Table B, the
      `.proofs.json` row Table C's count)
- [ ] Acceptance criteria that assert Table A's principle, its omitted set, ALL
      THREE conjuncts of its resolution rule (the two run-level ones and the
      per-record date test, AC5/AC6f), its failure direction, its per-site
      placement (AC6), the out-of-process class including the ordinary failure
      (AC6c/AC6d/AC6e), and the recovery contract — armed early, both finalizers,
      exactly once, no preservation claim (AC7a-AC7e); Table B's diff shape;
      Table C's ids, MEASURED expectRed sets, criteria and count
- [ ] Verification commands (V3/V4 assert Table B, V5 asserts Table A's frozen
      template, V2/V6 assert Table C — V6's `want` array is the literal mirror of
      Table C's id column, **seven ids as of round 4**, and must be re-sorted
      whenever that column changes)
- [ ] Current-state description (l.646's expression, the two call sites, the
      non-rendering paths, the `WIENERDOG_JOB` channel, **both ends of the
      run-token channel including its win32 and catch-up facts**, the `findJob`
      reachability argument, `listJobs`' catch, **run-job's ordinary failure path
      l.1251/l.1257/l.1269 and the measured fact that `doctor` reads no alerts**,
      **the watchdog race l.1086/l.1090 that falsifies "post-exit only", the
      `writeFilePrivate` rename-then-verify order (`private-fs.js` l.360/l.372),
      the record shape and ordering facts in `alerts.js` l.46/l.151/l.222, and the
      try/finally topology at `dream.js` l.608/l.815/l.1206/l.1213**)
- [ ] The `why` field of each declaration in
      `tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json`
- [ ] Operative prose steps that apply it — there are **twelve**, and they are
      enumerated rather than gestured at, because this is the class no gate
      reaches:
      (a) the predicate sketch's JSDoc under "Exact contracts" (Table A,
      *Resolved job name*, both conjuncts);
      (b) the sentence replacing l.646's expression, the `alerts:` code line
      under it, and **the three-row call-site table beneath it** (Table A,
      *Filter position* and *Where applied*);
      (c) the worked example and the two literal `digest.md` files with their
      byte counts and trailing-byte note (Table A, *Omitted set* and
      *Empty-omission identity*);
      (d) Implementation notes' first bullet, that `../scheduler/jobs` is
      first-party (the Deliverables `dream.js` row's added require);
      (e) Implementation notes' TWO "Named residual" bullets — the
      out-of-process one (Table A, *What reaches the digest for the dream's OWN
      failures* and *Out-of-process failures are ONE class*, including its
      explicit withdrawal of round 1's sole-narrowing and finite-bound claims)
      and the failed-recovery-render one (Table A, *Late in-process failure*);
      (f) Implementation notes' "Named consequence" and Definition of done item
      3, which requires it in "Decisions made" (Table A, last row);
      (g) Implementation notes' "Config edited mid-run" and the
      attended-`wienerdog dream` bullet (Table A, *Failure direction* and
      *Resolved job name*);
      (h) Out of scope's declined-lock bullet (Table A, *Paths that render
      nothing*) and its `sync.js` bullet (Table A, *Where applied*);
      (i) Security checklist items 1 and 3 (Table A, *Resolved job name* and
      *Supervisor correlate*);
      (j) Table B's *Replacement* text, whose narrowed sentence describes when
      dream.js drops records and must stay true to Table A's *When it may omit*
      and to the record-date conjunct;
      (l) Implementation notes' **RESUME-from-`9d1282cf`** bullet, whose numbered
      list 1-5 is a delta against what Table A said at `2d5e2465` and must be
      re-derived whenever Table A changes again;
      (k) the Context section's closing paragraph, which argues the fix from the
      step-19 comment and therefore asserts Table A's *When it may omit*.
      The rejected alternatives A and C are NOT in this set: they apply no table
      fact, they record why two designs outside every table were refused.
- [ ] "Dispatch precondition — owner items" O1, which mirrors Table A's
      *Supervisor correlate* and *Why this channel at all* rows, and whose
      residual (a)/(b)/(c) mirror that row's two limits; and **O3, which mirrors
      the whole of *What reaches the digest for the dream's OWN failures*,
      including the `doctor` measurement and the no-finite-bound statement**
- [ ] Context: the WP-041 quote and the statement that its accepted lag is
      withdrawn while its prohibition is kept

## Dispatch precondition — owner items

Three decisions in this package are the owner's. **The owner has ruled on none
of them directly.** Each is dispatched under this repo's standing process — *the
maturing architect records a recommendation with the cost of overruling it, the
session may dispatch under that recommendation, and the owner reverses any of
them by dated amendment* — settled in
`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md` and
carried into this session by
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, whose
"Items dispatched under the standing process" section lists all three with their
overrule costs. Nothing in this file is a ruling, an approval or an acceptance,
and nothing below should be read as one.

**The one ruling that IS on record** and is cited as such in Out of scope:
*Maintainer ruling (2026-09-10): this WP ships first; the follow-up WP is drafted
later.* It governs the managed-policy-warning follow-up only.

### O1 — is the env-plus-config-plus-token channel trustworthy as job identity?

**The question.** The filter needs to know which job's success this run will
establish. Design round 1 found that `WIENERDOG_JOB` plus the `findJob`
cross-check establishes *that a job name is plausible*, not *that this process is
the child whose success will resolve the alert*: an attended or wrapper-launched
`wienerdog dream` that merely inherits `WIENERDOG_JOB=dream` passes it whenever
the normal dream job exists. Table A's rule was **narrowed in response** and now
requires a second conjunct, the supervisor's per-run
`WIENERDOG_DREAM_RUN_TOKEN` (Table A, "Supervisor correlate"). Should the dream
trust the narrowed channel?

**Recommendation: yes, with all three conjuncts, and with the residual below
stated in the spec rather than left to a reader.** The narrowing costs **zero new
surface**: the token already exists, is already minted per `runJob` invocation
including under `--catch-up`, already travels in the same `env` object as
`WIENERDOG_JOB`, and is already validated in this very file at l.827-828 by the
regex this rule re-applies. It is strictly better than the round-1 design and
cannot be inert on the supervised POSIX path.

**The residual, stated honestly.** Two parts, and neither is closed.
(a) **Possession is not parentage.** A process that inherits *both* variables —
a wrapper script, an exported shell environment, a re-exec — still passes. The
token narrows the accidental-inheritance vector from "a guessable job name" to
"a live 16-hex value the supervisor minted", which is a large narrowing and not
a closure; dream holds no prior copy to compare against, and the hand-up pidfile
named after the token does not exist yet at render time.
(b) **What is actually at risk after the F2 fix is smaller than it was.** The
filter now applies only at the final render, i.e. only after THIS process's dream
run has succeeded, so the callout a spoofed or inherited environment can hide is
*"the dream job has failed"* shown immediately after a dream in fact succeeded.
The record is never touched: it stays in `alerts.jsonl`, `wienerdog alerts`
still prints it, and the callout returns at the next **unfiltered** render — any
`wienerdog sync`, or the next dream's l.724 refresh — and stays gone from
`alerts.jsonl` only once a genuinely supervised success clears it.
(c) **On win32 the omission never engages at all**, because no token is minted
there (Table A, "Supervisor correlate", limit (a)). The Windows behaviour after
this WP is today's behaviour.

**Standing-process status.** O1's recommendation is **adopted under standing
authorization, not by a direct ruling** — recorded 2026-09-17 in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` and
reversible by dated amendment at any time, at the cost below.

**Overrule cost.** If the owner rules this channel still untrustworthy, the WP
does not shrink — it changes shape. The remaining alternative is a supervisor→
child channel that proves parentage, for example a per-run file under `state/`
that `run-job` writes before the spawn and whose content the dream must match:
that adds a writer to `state/`, an uninstall/cleanup obligation, a lifecycle to
keep in step with `clearAlerts`, and a new failure mode of its own. It is a
different, larger work package. Concretely rewritten in that case: Table A's
"Resolved job name" and "Supervisor correlate" rows, the predicate sketch in
"Exact contracts", AC3, AC4, AC5, and the `dream-digest-filter-ignores-config`,
`dream-digest-filter-always-on` and `dream-digest-filter-ignores-run-token`
declarations — after which this spec returns to drafting rather than being
amended in place.

### O2 — should the pre-dream containment probe get a single retry?

**The question.** The run that exposed this defect failed for an unrelated
reason: the pre-dream containment probe
(`src/core/dream/containment-probe.js`, `PROBE_TIMEOUT_MS = 120_000`) received
no assistant message within its 120 s budget and returned ETIMEDOUT — a
transient upstream API stall, not a containment regression. The probe has no
retry: one stall halts the dream fail-closed for that fire, which is the correct
default for a containment check but converts a transient network event into a
nightly miss. Should it retry once before halting?

**Recommendation: decide it separately, and not here.** It is a change to a
fail-closed security check's semantics, on a file this WP does not touch, with
its own threat-model argument to make (a retry doubles the window in which a
genuinely broken runtime is re-probed rather than refused). It is listed under
Out of scope and stays there whichever way it goes.

**Standing-process status.** O2's recommendation is **adopted under standing
authorization, not by a direct ruling** — recorded 2026-09-17 in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` and
reversible by dated amendment at any time, at the cost below.

**Overrule cost.** If the owner rules the retry in scope of *this* WP: the
Deliverables table gains `src/core/dream/containment-probe.js` and its test file,
the WP crosses from M into a second concern, and per the sizing rule it splits
rather than grows. Nothing in Table A, Table B or Table C changes either way —
the two concerns share no surface.

### O3 — is it acceptable that the dream's own failures lose their after-the-fact digest callout, given what success does and does not prove?

**Round 4 rewrote this item's premise. The earlier wording overstated what a
successful run establishes, and that overstatement is withdrawn here.**

**The question.** Two parts, and the second is new.

*(a) The after-the-fact display.* A failed dream does not reach step 19, so its
record's callout is displayed by a LATER render — typically the next *successful*
dream, i.e. after that failure has been resolved by the very run that shows it.
After this WP that later successful render filters the job out, so a dream-job
failure's callout reaches the digest only via an attended `wienerdog sync` or a
later dream's conditional l.724 quarantine render, with **no finite bound**. The
failure still reaches the user through the fail-loud **email** and through
`alerts.jsonl` / `wienerdog alerts`; **`doctor` does not show alerts at all**
(measured: zero occurrences of `alert` in `src/cli/doctor.js`, re-run
independently by the round-3 reviewer).

*(b) What success proves — the part that was overstated.* The earlier wording of
this item said that every callout the filter removes describes a failure that has
already been resolved. **That is not true, and it is withdrawn.** What a
successful run establishes is only that **this dream process's own body ran to
step 19 without throwing** (Table A, "What this run's success actually
establishes"). Round 4 measured two cases where a record the filter would remove
is *not* resolved:

- **A timeout survivor.** `run-job`'s watchdog rejects independently of the
  child's close event (l.1086, raced at l.1090), so the supervisor can record a
  failure **while this dream child is still running**. **This case is FIXED, not
  priced**: the record-date conjunct (Table A) shows any record dated at or after
  this process's start, so the supervisor's record survives the filter.
- **A prior run's surviving process group.** `settleReaps` (l.362) examines only
  the current run's groups and token, so this run's success proves nothing about a
  group an earlier run failed to reap — and that earlier record predates this
  process's start, so the filter *does* remove it. **This case is PRICED, not
  fixed.** It cannot be fixed with the record shape we have: `{job, at, reason,
  log_hint}` carries no reason class and no run token, and discriminating on the
  free-text `reason` would be brittle matching against a message this WP does not
  own. So: after this WP, a live process group left behind by an earlier run can
  have its callout removed from the digest by a later successful dream, while the
  group is still alive. The record stays in `alerts.jsonl`, `wienerdog alerts`
  still prints it, and the original fail-loud email was already sent.

So the question is: **is (a) acceptable given the email channel, and is (b)
acceptable as a priced residual?**

**Recommendation: yes to both, and (b) is the one to look at hardest.** On (a):
that display *is* the bug this WP was filed for — the 2026-09-10 report is a
session being told the dream job had failed when it had just succeeded — and
keeping it means keeping a warning that is wrong at the moment it is shown. On
(b): the exposure is a pre-existing ADR-0030 residual (a group wedged beyond a
bounded escalation) whose own alert text says so, the loud channels already fired
when it happened, and the alternatives are all worse than the problem — a reason
class on the alert record is a schema change to a durable file, and matching free
text is exactly the brittleness this repo has paid for before. The only fix that
would make either case visible in the digest *while unresolved* is a render
performed by the supervisor, which is rejected alternative A, prohibited by name
in WP-041.

**Standing-process status.** O3's recommendation was **adopted under standing
authorization, not by a direct ruling** — recorded 2026-09-17 in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, where it is
listed FIRST as the item most likely to want the owner's eye. **That record
carries the pre-round-4 premise and is not edited by this pass**, so this section
is the current wording and the two differ: the record says every omitted callout
describes a resolved failure; **this section withdraws that**. The recommendation
remains reversible by dated amendment at any time, at the cost below, and the
widened premise is itself a reason the owner may want to revisit it.

**Overrule cost.** If the owner rules the loss unacceptable, this WP does not
ship as drafted: the fix has to be a supervisor-side notification surface, which
means re-opening WP-041's prohibition (an ADR-level decision, not a spec edit) or
designing a standing warning channel that is not the failure log — the same shape
the managed-policy-warning follow-up needs, and plausibly the same WP. Table A's
principle row survives, but "When it may omit", the whole filtering design and
AC1 are then moot, and this spec is superseded rather than amended. Two smaller
overrules exist and neither blocks this WP: "ship the filter, and also give
`doctor` an unacknowledged-alerts section", and "ship the filter, and add a reason
class to the alert record so survivor alerts can be excluded from omission" — the
second is the honest fix for (b) and is a schema change to `alerts.jsonl` with its
own migration question.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
  `../scheduler/jobs` is a first-party module already in the tree.
- **RESUME from `9d1282cf`, do not start over** (branch
  `wp/dream-digest-omits-own-job-alerts`, on `origin`; suite 2767 pass / 2755 /
  0 fail / 12 skipped, lint clean). That work was dispatched against the spec as
  it stood at `2d5e2465` and most of it survives. **What CHANGED relative to that
  text, and nothing else has:**
  1. **The filter gains a third conjunct, per RECORD** (Table A, "Record date").
     At `2d5e2465` a resolved job name omitted every record with that `job`. Now
     it omits only those whose `at` is **strictly earlier** than the process start
     instant, with missing/unparseable/equal-`at` all **shown**. No schema change
     is needed: `sanitizeAlert` (`src/core/alerts.js` l.46) coerces every record
     to exactly `{job, at, reason, log_hint}` as strings and drops unknown keys,
     `at` is `run-job`'s `nowIso()`, `readAlerts` (l.151) returns **file order,
     not parsed order**, and `clearAlerts` (l.222) matches on `job` alone. That
     also settles what is NOT implementable here: anything keyed on a run token or
     a reason class, because neither is in the record.
  2. **The arming order flips.** The current
     `regenerateDigest({omitOwnJobAlerts:true}); restoreAfterStepNineteen = regenerateDigest;`
     becomes the arming first, the render second — a render that publishes and
     then throws must be covered (Table A, "Where recovery is armed").
  3. **Recovery covers both finalizers**, which needs a second site, because a
     throw from `finally A` never reaches `catch A` (same row).
  4. **AC7 counts digest WRITES** rather than only asserting final content, and
     **asserts nothing about the destination's contents after a failed recovery**
     — the preservation guarantee is withdrawn.
  5. **Table C's `expectRed` sets are now the measured ones**, including the
     AC4+AC8 pair the implementation surfaced, plus one new declaration.
- **Test seams that bracket the render exactly**, measured on the paused branch:
  `identityApprovals.readRegistry` (called before the alerts array is built) and
  `identityApprovals.approvalsMap` (called after it, before the atomic write),
  both reached through the module object so `t.mock.method` can patch them. **Trap
  the implementer already hit:** `createWorkspace` calls `destroyWorkspace` on its
  own failure arms, so an `fs.rmSync` probe keyed on the workspace dirname fires
  **before** step 19 unless it is gated on "a render has already happened".
- **Rejected alternative A — have `run-job` re-render `digest.md` after a
  successful `clearAlerts`.** Rejected twice over: WP-041 states *"Do NOT couple
  `run-job` to the digest renderer"* and made the deletion of run-job's
  `writeDigestBanner` an acceptance criterion; and run-job would have to
  reassemble every digest input the dream assembles (identity approvals
  registry, quarantine banner line, scheduler status line, secret quarantine,
  insecure-modes count), creating a third feeder where WP-attended-alert-
  acknowledgement records that there are exactly two and *"there is no third
  feeder"*.
- **Rejected alternative C — clear the job's alerts before the job body runs.**
  It destroys WP-041's durability invariant: a run that fails mid-way would have
  spent part of its life with no record on file, and a crash between the clear
  and the failure would erase a real, unresolved failure. Only success may
  retire a record.
- **Not considered: changing what `formatAlerts` says.** The sentence is
  code-owned, byte-frozen text with two live tests asserting its bytes
  (`tests/unit/digest-alert-callout-neutralize.test.js`, `tests/unit/alerts.test.js`).
  This WP makes the sentence true; it does not renegotiate it.
- **Named residual — anything `run-job` records after the child exits is
  invisible in the digest until some later unfiltered render, and nothing
  guarantees one** (Table A, "What reaches the digest for the dream's OWN
  failures" and "Out-of-process failures are ONE class"). Round 1's version of
  this bullet claimed the exposure was B1/B2 only and finitely bounded; design
  round 2 measured **both claims false** and they are withdrawn. What is true:
  round 1's in-process half really was fixed — l.724 is unfiltered and a late
  in-process throw re-renders unfiltered, so the quarantine-then-no-complete-input
  path, the step-8b containment halt, a brain failure and every post-step-19
  in-process throw leave the genuine callout on screen. What remains is the
  out-of-process half, and it is **wider than B1/B2**: an ordinary dream-body
  failure is recorded the same way, after the child has exited
  (`src/cli/run-job.js` l.1251 → l.1257 → l.1269), and the failing run made no
  render after that record existed. `schedule.json` carries the signal only on
  that ordinary path (`last_status: 'error'`): B1 fires *because* the marker
  write threw, so it records neither status, and B2 fires after
  `last_status: 'ok'` was already written. **This is a pre-existing property of
  the product, not something this WP introduces** — what this WP changes is that
  a later successful dream no longer displays the record after the fact, which is
  the misleading display the WP exists to remove. The channels that do carry it
  are the fail-loud **email** and `alerts.jsonl` / `wienerdog alerts`; `doctor`
  does not (measured, Table A). AC6c, AC6d and AC6e pin the behaviour. Do not
  widen this WP to chase it — the honest fix is supervisor-side, rejected
  alternative A forbids the obvious one, and whether the change is acceptable at
  all is owner item **O3**.
- **Named residual — after a failed recovery render the digest's contents are
  not guaranteed either way** (Table A, "What a failed recovery leaves on disk").
  Round 2's version of this bullet said the previous filtered bytes survive whole
  because `writeFilePrivate` is atomic; **round 4 falsified that and it is
  withdrawn.** `writeFilePrivate` renames at `src/core/private-fs.js` l.360 and
  verifies destination identity afterwards, throwing `WD_F10_POST_RENAME` at
  l.372, so a recovery render can fail **after publishing**. The two boundaries
  are named in Table A and neither is promised: a pre-publication failure leaves
  the destination unchanged, a post-rename verification failure may leave it
  holding the new bytes or a concurrent writer's. This WP attempts no second
  restore — retrying would be a mechanism guarding a mechanism, and the run is
  already failing for its own reason — so the one fixed-text stderr line is the
  entire remedy. AC7e pins the behaviour **without asserting any destination
  state**.
- **Named consequence — the managed-policy hook warning loses its banner**
  (Table A, last row). Today `run-job` l.953 appends it under the job's own name
  before the spawn and the job's success clears it, so on a managed machine its
  only lasting surface is the dream's stale render — displayed as `the "dream"
  job has failed`, which it is not. This WP removes that. The honest fix is a
  standing warning surface of its own, not a record in the failure log that
  every success erases; that is a separate WP and is named in Out of scope. Flag
  it in the PR body under "Decisions made" so the maintainer sees it land.
- **Config edited mid-run.** A dream brain can run for tens of minutes; if the
  `dream` job is renamed or removed from `config.yaml` in that window the
  cross-check resolves no name and the render falls back to today's behavior
  (a stale banner until the next render). Fail-safe direction, accepted.
- The filter must not change what `wienerdog dream` does when run attended with
  no `WIENERDOG_JOB` set: nothing clears alerts on that path, so nothing may be
  hidden on it either.
- **`scripts/red-proofs.js` refuses a `node_modules` SYMLINK** at snapshot
  (`ERROR: SNAPSHOT — unsupported entry type: symbolic link at node_modules`) —
  which is what a git worktree sharing the main checkout's dependencies has. If
  yours does, run V2 with `--root` pointed at a
  `git archive HEAD | tar -x -C <dir>` copy. A normal clone is unaffected.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no identifier this WP
      reads reaches a filesystem path or a shell command.** `WIENERDOG_JOB` is
      used for exactly two things: an in-memory key lookup
      (`jobsLib.findJob` → `listJobs().find(j => j.name === name)`, which builds
      no path from it) and a string equality against each record's `job` field.
      `WIENERDOG_DREAM_RUN_TOKEN` is used for exactly one: a shape test against
      `/^[a-f0-9]{16}$/`, whose result is a boolean — this WP never uses the
      token's VALUE for anything, and in particular never builds the hand-up
      pidfile name from it (that remains l.827-828's existing job). No path
      segment, no shell word, no regex is constructed from either.
- [ ] **The surface this WP touches is what the injected digest tells the model.**
      It can only ever *remove* a callout, never add or alter one: `formatAlerts`,
      its template and every stored record are untouched, so no new bytes reach
      the digest and the neutralizing guarantees of
      WP-neutralize-alert-callout-rendering are unaffected.
- [ ] **Env-trust residual, named — and narrowed once by design round 1.** An
      environment that carries BOTH `WIENERDOG_JOB` naming the configured dream
      job AND a valid-shaped `WIENERDOG_DREAM_RUN_TOKEN` could hide that job's
      callout from one render of an unsupervised run. Both conjuncts are now
      required (Table A, "Resolved job name"); possession of the token is not
      parentage, and O1's residual says so rather than claiming closure. The
      record itself is never touched, `wienerdog alerts` still prints it, and the
      next unfiltered render restores it. No privilege boundary is crossed — the
      only actor who can set either variable is the process that spawns the
      dream: `run-job` (which sets the true values) or the user's own shell. The
      decision to accept this channel at all is O1, which is unresolved.

## Acceptance criteria

Numbered so Table C's declarations and the verification steps can name them.

- [ ] **AC1 — the reproduction.** With `config.yaml` defining `dream` as
      `run: builtin:dream`, one unresolved `dream` record on file, and the dream
      run under `WIENERDOG_JOB=dream`: the `state/digest.md` the run writes
      contains no `> [!warning]` line naming `"dream"`. The other half of the
      sequence is asserted at the layer that owns it — a successful `run-job`
      leaves no record for that job in `alerts.jsonl`. **Verified by V1.**
- [ ] **AC2 — other jobs are never omitted.** With records for `dream` and for a
      second job on file and the run supervised as `dream`, the second job's
      callout renders unchanged. **Verified by V1.**
- [ ] **AC3 — unsupervised runs are unchanged.** With `WIENERDOG_JOB` absent from
      the environment, the same fixture renders both callouts, byte-identical to
      the pre-change output. **Verified by V1.**
- [ ] **AC4 — the resolution rule holds in both refusing directions** (Table A):
      a `WIENERDOG_JOB` naming a job absent from `config.yaml`, and one naming a
      job whose `run` is not `builtin:dream`, each omit nothing — including when
      an alert for that very name is on file. **Verified by V1.**
- [ ] **AC5 — a valid job name without a valid run token omits nothing** (Table
      A, "Resolved job name", second conjunct): a direct `wienerdog dream`
      carrying `WIENERDOG_JOB=dream` that `config.yaml` really does define as
      `builtin:dream`, but with `WIENERDOG_DREAM_RUN_TOKEN` absent, empty, of the
      wrong length or containing a non-hex character, renders the `dream` callout
      in every one of those cases. **Verified by V1.**
- [ ] **AC6 — the two render sites behave DIFFERENTLY, and that is the
      contract** (Table A, "Where applied" / "When it may omit"). Each of the
      FIVE sub-criteria asserts the CONTENT of the `state/digest.md` on disk at
      the end of the run **together with** the `alerts.jsonl` state, so neither
      surface is ever checked alone — round 1's finding was precisely a criterion
      that checked the record and not the view. (`alerts.jsonl` on B2 is the one
      place a new record is NOT expected: the `alert-cleanup-refused` outcome
      deliberately skips the append because the refused artifact IS that file —
      existing contract, unchanged by this WP.) The five:
      **(AC6a)** quarantine-only refresh at l.724, then the no-complete-input
      throw at l.736-743: the digest shows the `dream` callout, because l.724 is
      unfiltered.
      **(AC6b)** a supervised run that renders at l.724 and then fails later —
      the step-8b containment halt and a brain failure: same, the callout is
      shown.
      **(AC6c)** B1, success-marker refused: the digest written at step 19 omits
      the callout and `alerts.jsonl` holds the new `success-marker-refused`
      record — an instance of Table A's "Out-of-process failures are ONE class"
      row, PINNED so a future change to it is visible, not claimed as safe.
      **(AC6d)** B2, alert-cleanup refused: the digest omits the callout and the
      job's earlier records survive in `alerts.jsonl` — same row, same reason.
      **Verified by V1.**
- [ ] **AC6e — the ordinary dream failure, end to end, PINNING the stated
      behaviour** (Table A, "What reaches the digest for the dream's OWN
      failures"). Starting from a digest with no `dream` callout in it, make the
      dream child fail so `run-job` takes its ordinary failure path (l.1251
      watermark → l.1257 `failLoud` → l.1269 throw): assert the new record IS
      appended to `alerts.jsonl`, and assert the digest content is exactly what
      that Table A row says it is — **the callout is NOT there**, because the
      failing run made no render after the record existed. This criterion exists
      to pin a pre-existing product property so that a later change to it cannot
      pass unnoticed; it asserts no improvement and must not be read as one.
      **Verified by V1.**
- [ ] **AC6f — the timeout survivor, which the record-date conjunct exists for**
      (Table A, "Record date"). A supervised run in which `run-job` appends an
      own-job record **while this dream child is still alive** — the watchdog
      path at `src/cli/run-job.js` l.1086/l.1090 reaching `failLoud` at l.1257 —
      and the child then goes on to reach step 19 with a valid `WIENERDOG_JOB`
      and a validly-shaped run token: **the digest still shows the `dream`
      callout**, because that record's `at` is not strictly earlier than this
      process's start instant. Assert digest CONTENT, with `alerts.jsonl`
      alongside. Also assert the two parsing edges from the same Table A row: a
      record whose `at` is missing or unparseable is **shown**, and a record whose
      `at` equals the start instant is **shown**.

- [ ] **AC7 — late-failure recovery: armed early, covering the finalizers,
      exactly once, and asserting no preservation** (Table A, "Late in-process
      failure" and "What a failed recovery leaves on disk"). Every sub-criterion
      observes the actual **digest WRITES** the run performs — not only the final
      file content — because two successful recovery renders satisfy a
      content-only assertion and a catch that skips a finalizer also does.
      **(AC7a)** a throw injected in the **post-render body** (steps 20-21):
      exactly ONE unfiltered recovery write is observed, the digest on disk shows
      the `dream` callout, and the ORIGINAL error propagates.
      **(AC7b)** a throw injected in **workspace teardown** —
      `destroyWorkspace` at `src/cli/dream.js` l.1211, inside the `finally` at
      l.1206-1212: same three assertions. A catch that covers only steps 20-21
      must fail this.
      **(AC7c)** a throw injected in **scratch cleanup** — `cleanScratch` at
      l.1220, inside the outer `finally` at l.1213-1222: same three assertions.
      **(AC7d)** a throw injected in **the filtered step-19 render itself**,
      including the post-publication shape (`writeFilePrivate` renamed at
      `private-fs.js` l.360, then threw `WD_F10_POST_RENAME` at l.372): recovery
      is still attempted exactly once, proving it was **armed before** the
      filtered render rather than after it returned.
      **(AC7e)** a throw injected in the **recovery render itself**, at BOTH
      boundaries — pre-publication (before its rename) and post-rename
      verification: in each, the ORIGINAL error is the one that propagates, the
      single fixed-text stderr diagnostic is printed exactly once, and **exactly
      one** recovery attempt was made (no retry). **This criterion asserts
      NOTHING about the destination's contents** — round 2's preservation
      guarantee is withdrawn (Table A) and no criterion may re-encode it.
      **Verified by V1.**
- [ ] **AC8 — nothing throws out of the filter** (Table A, failure direction): a
      run whose config is missing or unreadable still renders a digest, and
      renders it with nothing omitted. **Verified by V1.**
- [ ] **AC9 — `src/core/alert-ack.js` changes comments only** and carries Table
      B's narrowed claim; its behavior is unchanged and
      `tests/unit/alert-ack.test.js` passes untouched. **Verified by V1, V3, V4.**
- [ ] **AC10 — the frozen surfaces did not move**: every file under
      `tests/golden/` is byte-identical and none is edited, and
      `src/core/digest.js` is unchanged. **Verified by V1, V5.**
- [ ] **AC11 — the RED declarations exist and prove.** The file named in
      Deliverables declares exactly the seven ids of Table C under this WP's `wp`,
      and `scripts/red-proofs.js` reports `RUN: PROVEN` over the whole tree.
      **Verified by V2, V6.**
- [ ] **AC12 — the repo gates pass**: `npm test`, `npm run lint`, and
      `scripts/boundary-check.js` over the changed set. **Verified by V1, V7.**
- [ ] Idempotence: **N/A — this WP ships no command and adds no write to a user
      machine.** It changes one input to a render that already rewrites
      `state/digest.md` in full on every call.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — AC1-AC10 and AC12: the whole suite, plus the three focused runs.
npm test
npm test -- --test-name-pattern "dream-pipeline"
npm test -- --test-name-pattern "scheduler-runjob"
npm test -- --test-name-pattern "alert"

# V2 — AC11, THE GATE. Whole tree: exit 0 and `RUN: PROVEN` required. A `--wp`
# SELECTION never exits 0 while any other WP has declarations — the runner's
# design, not a failure — so it is the readable per-proof view, NOT the gate.
node scripts/red-proofs.js
node scripts/red-proofs.js --wp WP-dream-digest-omits-own-job-alerts  # expect: PROVEN lines, rc 1 (FILTERED)

# The three gates below diff against the MERGE BASE, not `main`'s tip: `main`
# moving for unrelated reasons must not colour this branch's diff.
MB=$(git merge-base origin/main HEAD)

# V3 — AC9 / Table B gate 1: every changed line in alert-ack.js is a JSDoc
# continuation line (leading "+"/"-", then " * "). Empty output = pass. The
# `test -f` guard is deliberate: without it a deleted file makes the pipeline
# read greenest.
test -f src/core/alert-ack.js && \
  [ -z "$(git diff "$MB" -- src/core/alert-ack.js | grep -E '^[+-]' \
      | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-] \*')" ]

# V4 — AC9 / Table B gate 2: the narrowed claim is present exactly once…
test "$(grep -Fc 'ONLY ACKNOWLEDGEMENT suppression point' src/core/alert-ack.js)" = 1
# …and the ungated universal it replaces is gone. Guarded for the same reason.
test -f src/core/alert-ack.js && ! grep -Fq 'This is the ONLY suppression point' src/core/alert-ack.js

# V5 — AC10 / Table A gate: digest.js is not a Deliverable, so the frozen template
# cannot have moved. An empty numstat means the file is untouched.
test -z "$(git diff --numstat "$MB" -- src/core/digest.js)"

# V6 — AC11's identity check: this WP's own `wp` field names exactly the seven
# declared ids, in the declaration file whose suite is the dream-pipeline suite.
node -e 'const d=require("./tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json");
if (d.suite !== "tests/unit/dream-pipeline.test.js") { console.log("FAIL: suite is " + d.suite); process.exit(1); }
const ids = d.proofs.filter((p) => p.wp === "WP-dream-digest-omits-own-job-alerts").map((p) => p.id).sort();
const want = ["dream-digest-filter-always-on", "dream-digest-filter-at-early-render", "dream-digest-filter-ignores-config", "dream-digest-filter-ignores-record-date", "dream-digest-filter-ignores-run-token", "dream-digest-filter-removed", "dream-digest-no-recovery-render"];
console.log(ids.join(","));
process.exit(JSON.stringify(ids) === JSON.stringify(want) ? 0 : 1)'

# V7 — AC12: the repo gates. boundary-check takes the spec and the changed set as
# .github/workflows/ci.yml invokes it, but WITHOUT `mapfile` (absent from macOS
# /bin/bash 3.2.57). No tracked path in this repo carries a space.
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-digest-omits-own-job-alerts.md $(git diff --name-only origin/main...HEAD)
```

- **V3, V4, V5 and V6 are NEW steps, and each is an ASSERTION**: it exits
  non-zero on failure rather than printing something a reader has to judge. Paste
  a real green on the finished state **and** a real red from each of three
  deliberately broken states — the deliverable ABSENT (delete
  `src/core/alert-ack.js`; delete the `.proofs.json`), the deliverable VIOLATING
  (change one executable line in `alert-ack.js`; reword the narrowed sentence
  past its prefix; touch `src/core/digest.js`; rename a declared proof id), and
  the compliant state — so a check that cannot fail is caught before anyone
  believes it. V2's own both-directions evidence is the runner's, which reports
  each phase.

## Out of scope (do NOT do these)

- **Changing `formatAlerts`, its template, or any digest text** — including
  adding a "some alerts are hidden" line. Frozen by
  WP-neutralize-alert-callout-rendering; `src/core/digest.js` is not a
  Deliverable.
- **Making `run-job` render or re-render `digest.md`** (rejected alternative A),
  and **making `sync.js` filter anything** — an attended sync establishes no
  job's success, so it must keep showing every unresolved record.
- **Moving, adding or removing any call to `clearAlerts`/`appendAlert`**, and any
  change to `src/core/alerts.js` or the launcher's `appendRefuseAlert`.
- **The declined-lock exit-0 path, and what the supervisor does with it.** When
  `acquireLock` declines as `busy`, `dream.js` prints and returns **exit 0**
  (l.601-602), so `run-job` certifies the run as a success, writes the success
  marker (l.1188) and calls `clearAlerts(paths, 'dream')` (l.1204) although no
  dream body ran — and because that path renders nothing, a pre-existing callout
  can outlive the record it derives from. That is a lock/supervisor-semantics
  defect, present identically before and after this WP, and it belongs to
  **`WP-dream-lock-stale-owner-loud`**, being drafted in parallel. Do not change
  any lock arm, the exit code, or run-job's success handling here.
- **Giving the managed-policy hook warning a standing surface.** Named in Table
  A and Implementation notes; it needs its own WP, because the correct fix is a
  channel that a successful run does not erase, not a record in the failure log.
  **Maintainer ruling (2026-09-10): this WP ships first; the follow-up WP is
  drafted later.** Losing the warning's only (mislabelled) surface in the
  interim is accepted.
- **Retrying the pre-dream containment probe** — owner item O2, unresolved.
  Nothing in this WP touches `src/core/dream/containment-probe.js`.
- The `--catch-up` pseudo-job's records, which nothing ever clears
  (WP-attended-alert-acknowledgement), and bounding the launcher's unbounded
  writer (WP-launcher-alert-bound, Superseded — never implemented).
- Editing `docs/specs/done/WP-041-persistent-failure-alerts.md`. Its accepted
  lag is withdrawn by *this* spec's Context; a Done spec is a point-in-time
  record and is not rewritten.

## Discovered (not this WP's work — recorded so it is not lost)

- The containment-probe stall that produced the observed failure, and the
  question of whether the probe should retry once: stated in full as owner item
  **O2** above, and listed in Out of scope. Not restated here.

## Definition of done

0. This spec is `Draft` (re-opened at round 4). It returns to `Ready` only when
   the re-opened gate closes; **only the architect or the owner moves it there**,
   and no implementation PR may be opened before that. Branch
   `wp/dream-digest-omits-own-job-alerts` — the paused branch, resumed from
   `9d1282cf`, not re-cut — rebased onto the SHA the dispatcher's
   re-verification names (Current state). Never commit to `main`.
1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs for V3-V6.
2. Conventional commits (`fix|test|docs(dream): … (WP-dream-digest-omits-own-job-alerts)`);
   ONE PR, titled exactly
   `fix(dream): the digest render omits the alerts this run's success clears (WP-dream-digest-omits-own-job-alerts)`.
3. PR template filled, including "Decisions made" — which must name the
   managed-policy-warning consequence (Table A, last row) — and `Generated-by:`.
   Keep the body well under ~30 KB; put long round dispositions in a PR comment
   (`docs/runbooks/codex-review.md`, Rules).
4. This spec's `status:` flipped from `Ready` to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
