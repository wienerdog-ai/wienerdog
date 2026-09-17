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

## Current state

Every line citation below was re-derived at `b4af715e` (`origin/main` after
PR #245). Follow a citation by grepping its quoted text; the line number
disambiguates, it does not locate.

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
- `src/scheduler/jobs.js`: `findJob(paths, name)` (l.190) is
  `listJobs(paths).find((j) => j.name === name) || null`; `listJobs` (l.199-208)
  wraps its `readConfig` in `try { … } catch { return []; }`. **An unreadable or
  missing `config.yaml` therefore resolves no job by construction**, which is
  Table A's failure direction already built into the lookup.
- Precedent for reading a supervisor-set variable: dream.js already takes one off
  `process.env` at l.827-828 (`WIENERDOG_DREAM_RUN_TOKEN`), strictly validated,
  with *anything else treated as absent (standalone run)*.
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
| modify | src/cli/dream.js | filter the alerts input of `regenerateDigest` per Table A, and add the `require('../scheduler/jobs')` the cross-check needs. No other behavior changes |
| modify | src/core/alert-ack.js | **comment only, zero code lines**: narrow the stale universal in `unacknowledgedAlerts`' JSDoc per Table B |
| modify | tests/unit/dream-pipeline.test.js | cover the dream-layer acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/scheduler-runjob.test.js | cover the run-job-layer acceptance criteria below |
| create | tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json | this WP's two RED declarations (Table C); `suite` is `tests/unit/dream-pipeline.test.js` |

### Exact contracts

One predicate is added to `src/cli/dream.js`. Its name and placement are the
implementer's; its behavior is Table A's, and this is the shape:

```js
/** The job name whose success THIS dream run will establish, or null when the
 *  run is not a scheduled dream job. Env is the supervisor's channel, config is
 *  the authority: `process.env.WIENERDOG_JOB` is accepted ONLY when the job it
 *  names exists in config.yaml with `run: builtin:dream`.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {string|null} */
function supervisingDreamJob(paths)
```

The alerts input at `src/cli/dream.js` l.646 becomes the same expression with
Table A's filter applied to its **result**:

```js
alerts: <filter>(unacknowledgedAlerts(paths, readAlerts(paths))),
```

Worked example. `config.yaml` defines `- name: dream / run: builtin:dream`;
`state/alerts.jsonl` holds

```json
{"job":"dream","at":"2026-09-10T01:30:04.001Z","reason":"job \"dream\" exited 1","log_hint":"~/.wienerdog/logs/dream/"}
{"job":"daily-digest","at":"2026-09-10T05:00:11.900Z","reason":"job \"daily-digest\" exited 1","log_hint":"~/.wienerdog/logs/daily-digest/"}
```

and the dream runs with `WIENERDOG_JOB=dream`. The rendered `state/digest.md`
carries exactly one callout — the `daily-digest` one — and no line naming
`"dream"`. Run the same fixture with `WIENERDOG_JOB` unset (an attended
`wienerdog dream`) and the output is byte-identical to today's: both callouts.

## Contract reference

Activation (ADR-0031, 2-of-7): **(v)** the task crosses an authority boundary —
`run-job` owns the alert lifecycle while `dream.js` owns the render that
displays it; and **(vii)** the same contract appears in mirrored surfaces
(Deliverables cells, acceptance criteria, verification gates, the RED
declarations' `why` fields, the JSDoc in `alert-ack.js`).

### Table A — the alerts the dream's digest render omits

| Fact / rule | Value |
|-------------|-------|
| Where applied | the `regenerateDigest` closure in `src/cli/dream.js` and nowhere else. Both of its call sites (the quarantine-only refresh l.724 and step 19 l.1182) inherit it, because both go through the closure. `src/cli/sync.js` is unchanged; **no third feeder of the digest's alerts array is created** |
| Filter position | applied to the **result** of `unacknowledgedAlerts(paths, readAlerts(paths))`, leaving that expression textually intact. Both orders yield the same set; this order is required so `alert-ack.js`'s standing claim that *both callers pass `readAlerts`* stays true (Table B narrows only the sentence that this WP actually falsifies) |
| Resolved job name | `process.env.WIENERDOG_JOB`, accepted **only when** `jobsLib.findJob(paths, thatValue)` returns a job whose `run` is exactly the string `builtin:dream`. Every other case resolves to **no name**: the variable absent, not a string, empty, naming a job `config.yaml` does not define, or naming one whose `run` is anything else |
| Omitted set | when a name resolves: every record in the array whose `job` **strictly equals** that name — exactly the set `clearAlerts(paths, name)` will remove. When no name resolves: nothing is omitted, and the rendered bytes equal today's |
| Failure direction | **fail-safe toward SHOWING.** Any doubt — unreadable config, a lookup that throws, a name that does not resolve — omits nothing and renders exactly what is rendered today. Nothing in this filter may throw out of `regenerateDigest`. `listJobs`' own `catch { return []; }` (`src/scheduler/jobs.js` l.199-208) already gives the config-read half of this by construction |
| Paths that render nothing | this contract governs **the two render sites and only those**. A run that returns or throws without reaching a render leaves `digest.md` byte-untouched, so the filter has no effect there and the spec claims none: the `owner-unknown` lock throw (l.595-600, new in PR #245), the declined-lock exit-0 return (l.601-602), `nothing new to dream` (l.746-757) and the dry-run return (l.765-768). What the **supervisor** does on those paths is run-job's contract, not this one — the exit-0 declined-lock case is named in Out of scope |
| Render-then-fail | a run **can** render at l.724 and then throw — the widened no-complete-input throw at l.736-743, the containment-probe halt at step 8b, a brain failure, or run-job's B1/B2. On those paths the digest omits the job's records while `alerts.jsonl` gains a fresh one. Bounded and accepted in Implementation notes ("Named residual"); no criterion here asserts anything about the digest on them |
| Why env is trusted here | `WIENERDOG_JOB` is set by `buildCleanEnv` in the very component that owns the lifecycle: the supervisor tells the child which job's alerts its own success will clear. This mirrors `WIENERDOG_DREAM_RUN_TOKEN` (`src/cli/dream.js` l.827-828), which dream.js already reads the same way, with the same absent-on-anything-unexpected rule. The config cross-check makes the claim config-derived rather than merely asserted, and it can never be inert on the scheduled path: `runJob` is only reachable with a job that `findJob`/`listJobs` returned (`src/cli/run-job.js` l.1494, l.1343). **Not yet ruled on by the owner — see "Dispatch precondition — owner items", O1** |
| Never changed | `formatAlerts` and every byte of its template, including the "clears automatically" sentence (byte-frozen, WP-neutralize-alert-callout-rendering); `src/core/digest.js` in any respect; `src/core/alerts.js` and every writer of `alerts.jsonl` (`appendAlert`, `failLoud`, the launcher's `appendRefuseAlert`); `clearAlerts` and where it is called; the acknowledgement store and `addAcks`/`pruneAcksForJob`/`unacknowledgedAlerts`' behavior; `src/cli/sync.js`; `wienerdog alerts`; `schedule.json`; the fail-loud email; the dream's lock handling in every arm. `run-job` still writes no byte of `digest.md` |
| Empty-omission identity | when nothing is omitted the digest is byte-identical to today's, so **no golden fixture moves** |
| Named consequence (managed-policy warning) | `run-job` l.953 appends a *warning* record under the job's own name before the spawn, and the job's success clears it, so today its only lasting surface is the very off-by-one this WP removes — rendered, wrongly, as `the "dream" job has failed`. After this change that banner is gone for the dream. Restoring a standing surface for it is a separate WP (Implementation notes; Out of scope) — it is not a failure and does not belong in the failure-alert log |

### Table B — the `alert-ack.js` comment narrowing

| Fact / rule | Value |
|-------------|-------|
| Anchor | `src/core/alert-ack.js`, the sentence at l.127 whose exact text is `This is the ONLY suppression point (Table B).` It occurs once in the file |
| Replacement | that sentence becomes: `This is the ONLY ACKNOWLEDGEMENT suppression point (Table B) — the only place this store is read. It is NOT the only filter applied to the array a caller hands renderDigest: dream.js drops this result's records for the job whose success the run it belongs to will establish (WP-dream-digest-omits-own-job-alerts, Table A).` Re-wrapped to the file's JSDoc style; the wrapping is the implementer's, the claim is not |
| Diff shape | **every** changed line in this file is a JSDoc continuation line (matches `^[+-] \*`). Zero executable lines change; behavior is identical before and after |
| Why it is in scope at all | the sentence is an ungated universal that this WP falsifies. `docs/runbooks/spec-authoring.md`: a universal either quantifies over a named table or names its exception set in place. Leaving it standing is how the next reader concludes no other filter exists |
| Not touched | the two sentences before it (the programming-error guard and the both-callers-pass-`readAlerts` parenthetical, which Table A's filter position keeps true), and every other comment or line in the file |

### Table C — the RED declarations (ADR-0042)

`id`, `wp` and `criterion` are fixed here so AC10 can name them without a
repo-wide count. The mutation literal, the marker and the `expectRed` identities
are the implementer's, because the filter's own name and shape are.

| id | reintroduces / breaks | must redden | criterion |
|----|-----------------------|-------------|-----------|
| `dream-digest-filter-removed` | the pre-change behavior: the alerts input is handed to `renderDigest` unfiltered | the **AC1** assertion (the dream's own callout is absent) | `1` |
| `dream-digest-filter-unconditional` | the resolution rule: the filter omits records without requiring Table A's `findJob` + `run: builtin:dream` cross-check to resolve a name | the **AC3** assertion (an unsupervised run renders both callouts) | `3` |

`wp` is `WP-dream-digest-omits-own-job-alerts` for both. `scripts/red-proofs.js`
requires the observed own-body failing set to **EQUAL** the declared set, so a
criterion that only *might* redden under a mutation cannot be declared against
it — AC2, AC4 and AC5 are deliberately absent from both `expectRed` sets rather
than forgotten, and an implementer whose test design makes one of them redden
under a declared mutation declares it there and says so in the PR body.

### Mirrored Surface Checklist

Each of these restates a fact decided in Table A, Table B or Table C. A review
finding updates the table **and every mirror below in the same commit** — no
commit exists in which they disagree — and any new mirror found in review is
added here on the spot:

- [ ] Deliverables-table cells (the `dream.js` row cites Table A, the
      `alert-ack.js` row Table B, the `.proofs.json` row Table C)
- [ ] Acceptance criteria that assert Table A's omitted set, its resolution rule,
      its failure direction and its render-nothing / render-then-fail boundary;
      Table B's diff shape; Table C's ids and criteria
- [ ] Verification commands (V3/V4 assert Table B, V5 asserts Table A's frozen
      template, V2/V6 assert Table C)
- [ ] Current-state description (l.646's expression, the two call sites, the
      non-rendering paths, the `WIENERDOG_JOB` channel, the `findJob`
      reachability argument, `listJobs`' catch)
- [ ] The signature sketch and the worked example under "Exact contracts"
- [ ] The `why` field of each declaration in
      `tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json`
- [ ] Implementation notes: the rejected alternatives, the named residual, the
      managed-policy consequence
- [ ] "Dispatch precondition — owner items" O1, which mirrors Table A's
      "Why env is trusted here" row
- [ ] Context: the WP-041 quote and the statement that its accepted lag is
      withdrawn while its prohibition is kept

## Dispatch precondition — owner items

Two decisions in this package are the owner's and have **not** been made. The
spec is drafted to one of them (O1) because a spec cannot be written to an
unresolved fork; drafting it is not deciding it. Neither item is settled by
anything below, and nothing in this file should be read as a ruling on them.

**The one ruling that IS on record** and is cited as such in Out of scope:
*Maintainer ruling (2026-09-10): this WP ships first; the follow-up WP is drafted
later.* It governs the managed-policy-warning follow-up only.

### O1 — is `WIENERDOG_JOB` trustworthy as job identity, under the config cross-check?

**The question.** The filter needs to know which job's success this run will
establish. The only channel carrying that today is the environment variable the
supervisor sets (`buildCleanEnv`, `src/cli/run-job.js` l.150/l.180/l.219). Table
A accepts it **only** when `jobsLib.findJob(paths, value)` returns a job whose
`run` is exactly `builtin:dream`, and resolves no name in every other case, so
every doubt renders the callout. Should the dream trust that channel at all?

**Recommendation: yes, with the cross-check as Table A states it.** The variable
is supervisor-set in the component that owns the alert lifecycle; the same file
already reads `WIENERDOG_DREAM_RUN_TOKEN` off `process.env` under the same
anything-unexpected-is-absent rule (l.827-828); the cross-check makes the
accepted value config-derived rather than asserted; and the only actor who can
set the variable is the process that spawns the dream — `run-job`, which sets
the true value, or the user's own shell. The blast radius of a hostile value is
one render of one callout, with the record itself untouched, `wienerdog alerts`
still printing it and the next render restoring it (Security checklist).

**Overrule cost.** If the owner rules the env channel untrustworthy, the WP does
not shrink — it changes shape. There is no other in-process signal of scheduled
identity today, so the alternative is a new supervisor→child channel (for
example a per-run file under `state/` that run-job writes before the spawn and
the dream reads), which adds a writer to `state/`, an uninstall/cleanup
obligation, and a second lifecycle to keep in step with `clearAlerts`. That is a
different, larger work package: Table A's resolution rule, the predicate sketch
in "Exact contracts", AC3, AC4 and the `dream-digest-filter-unconditional`
declaration are all rewritten, and this spec returns to drafting rather than
being amended in place.

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

**Overrule cost.** If the owner rules the retry in scope of *this* WP: the
Deliverables table gains `src/core/dream/containment-probe.js` and its test file,
the WP crosses from M into a second concern, and per the sizing rule it splits
rather than grows. Nothing in Table A, Table B or Table C changes either way —
the two concerns share no surface.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
  `../scheduler/jobs` is a first-party module already in the tree.
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
- **Named residual — a dream that renders and then fails under-reports until the
  next render** (Table A, "Render-then-fail"). The exposure is any failure
  **after either render site**, not only after step 19: the l.724 quarantine-only
  refresh is followed by the no-complete-input throw (l.736-743, whose trigger
  PR #245 widened from one cause to four), the step-8b containment halt, a brain
  failure, and run-job's B1 (success-marker refused) / B2 (alert-cleanup
  refused). On each, `alerts.jsonl` ends up holding a record for the job that the
  just-written `digest.md` does not show. This is not a new class of hole: only
  `dream.js` and `sync.js` write `digest.md`, so **every** alert appended by
  **any** job is already invisible in the digest until the next dream or `sync` —
  a failing `daily-digest` at 05:00 reaches the digest at the next dream, not
  before. What changes is the narrow case where a *pre-existing* dream alert used
  to remain as a stale directionally-correct banner. In all these paths the
  failure still reaches the user through `alerts.jsonl` itself, `wienerdog
  alerts` and the fail-loud email. `schedule.json` carries the signal only on the
  ordinary failure path (step 7's `last_status: 'error'`): B1 fires *because* the
  marker write threw, so it records neither status, and B2 fires after
  `last_status: 'ok'` was already written. Accepted; do not widen this WP to
  chase it.
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
      No path segment, no shell word, no regex is constructed from it.
- [ ] **The surface this WP touches is what the injected digest tells the model.**
      It can only ever *remove* a callout, never add or alter one: `formatAlerts`,
      its template and every stored record are untouched, so no new bytes reach
      the digest and the neutralizing guarantees of
      WP-neutralize-alert-callout-rendering are unaffected.
- [ ] **Env-trust residual, named.** A user who sets `WIENERDOG_JOB` in their own
      shell before running `wienerdog dream` attended could hide one job's
      callout from one render. The config cross-check narrows this to names that
      `config.yaml` defines as `builtin:dream`; the record itself is never
      touched, `wienerdog alerts` still prints it, and the next render restores
      it. No privilege boundary is crossed — the only actor who can set that
      variable is the process that spawns the dream: `run-job` (which sets the
      true value) or the user's own shell. The decision to accept this channel at
      all is O1, which is unresolved.

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
- [ ] **AC5 — both render sites behave identically**: the quarantine-only refresh
      (l.724) and step 19 (l.1182) produce a digest under the same omission rule.
      **Verified by V1.**
- [ ] **AC6 — nothing throws out of the filter** (Table A, failure direction): a
      run whose config is missing or unreadable still renders a digest, and
      renders it with nothing omitted. **Verified by V1.**
- [ ] **AC7 — a post-render failure still records the failure where run-job owns
      it.** A run that exits non-zero, and a run whose success-marker write is
      refused (B1), each end with a record for that job in `alerts.jsonl`. The
      one named exception is the `alert-cleanup-refused` (B2) outcome, which
      deliberately skips the append because the refused artifact IS
      `alerts.jsonl` — existing contract, unchanged by this WP, and on that path
      the job's earlier records survive because the clear is what failed.
      **Verified by V1.**
- [ ] **AC8 — `src/core/alert-ack.js` changes comments only** and carries Table
      B's narrowed claim; its behavior is unchanged and
      `tests/unit/alert-ack.test.js` passes untouched. **Verified by V1, V3, V4.**
- [ ] **AC9 — the frozen surfaces did not move**: every file under
      `tests/golden/` is byte-identical and none is edited, and
      `src/core/digest.js` is unchanged. **Verified by V1, V5.**
- [ ] **AC10 — the RED declarations exist and prove.** The file named in
      Deliverables declares exactly the two ids of Table C under this WP's `wp`,
      and `scripts/red-proofs.js` reports `RUN: PROVEN` over the whole tree.
      **Verified by V2, V6.**
- [ ] **AC11 — the repo gates pass**: `npm test`, `npm run lint`, and
      `scripts/boundary-check.js` over the changed set. **Verified by V1, V7.**
- [ ] Idempotence: **N/A — this WP ships no command and adds no write to a user
      machine.** It changes one input to a render that already rewrites
      `state/digest.md` in full on every call.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — AC1-AC9, AC11: the whole suite, plus the three focused runs.
npm test
npm test -- --test-name-pattern "dream-pipeline"
npm test -- --test-name-pattern "scheduler-runjob"
npm test -- --test-name-pattern "alert"

# V2 — AC10, THE GATE. Whole tree: exit 0 and `RUN: PROVEN` required. A `--wp`
# SELECTION never exits 0 while any other WP has declarations — the runner's
# design, not a failure — so it is the readable per-proof view, NOT the gate.
node scripts/red-proofs.js
node scripts/red-proofs.js --wp WP-dream-digest-omits-own-job-alerts  # expect: PROVEN lines, rc 1 (FILTERED)

# The three gates below diff against the MERGE BASE, not `main`'s tip: `main`
# moving for unrelated reasons must not colour this branch's diff.
MB=$(git merge-base origin/main HEAD)

# V3 — AC8 / Table B gate 1: every changed line in alert-ack.js is a JSDoc
# continuation line (leading "+"/"-", then " * "). Empty output = pass. The
# `test -f` guard is deliberate: without it a deleted file makes the pipeline
# read greenest.
test -f src/core/alert-ack.js && \
  [ -z "$(git diff "$MB" -- src/core/alert-ack.js | grep -E '^[+-]' \
      | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-] \*')" ]

# V4 — AC8 / Table B gate 2: the narrowed claim is present exactly once…
test "$(grep -Fc 'ONLY ACKNOWLEDGEMENT suppression point' src/core/alert-ack.js)" = 1
# …and the ungated universal it replaces is gone. Guarded for the same reason.
test -f src/core/alert-ack.js && ! grep -Fq 'This is the ONLY suppression point' src/core/alert-ack.js

# V5 — AC9 / Table A gate: digest.js is not a Deliverable, so the frozen template
# cannot have moved. An empty numstat means the file is untouched.
test -z "$(git diff --numstat "$MB" -- src/core/digest.js)"

# V6 — AC10's identity check: this WP's own `wp` field names exactly the two
# declared ids, in the declaration file whose suite is the dream-pipeline suite.
node -e 'const d=require("./tests/red-proofs/dream-digest-omits-own-job-alerts.proofs.json");
if (d.suite !== "tests/unit/dream-pipeline.test.js") { console.log("FAIL: suite is " + d.suite); process.exit(1); }
const ids = d.proofs.filter((p) => p.wp === "WP-dream-digest-omits-own-job-alerts").map((p) => p.id).sort();
const want = ["dream-digest-filter-removed", "dream-digest-filter-unconditional"];
console.log(ids.join(","));
process.exit(JSON.stringify(ids) === JSON.stringify(want) ? 0 : 1)'

# V7 — AC11: the repo gates. boundary-check takes the spec and the changed set as
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

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs for V3-V6.
2. Conventional commits; PR titled
   `fix(dream): the digest render omits the alerts this run's success clears (WP-dream-digest-omits-own-job-alerts)`.
3. PR template filled, including "Decisions made" — which must name the
   managed-policy-warning consequence (Table A, last row) — and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
