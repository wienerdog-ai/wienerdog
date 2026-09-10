---
id: WP-dream-digest-omits-own-job-alerts
title: Stop the dream's own digest render from re-showing the alerts its success clears
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0012]
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

- `src/cli/dream.js` (1218 lines). Inside `run()`, the closure
  `regenerateDigest` (l.628-647) assembles every digest input and writes the
  file. Its alerts input is, verbatim, l.633:
  `alerts: unacknowledgedAlerts(paths, readAlerts(paths)),`. The closure is
  called from exactly **two** sites: l.705 (the quarantine-only refresh, after
  `writeLedger`, dry-run-guarded) and l.1167 (step 19, after `writeLedger`).
  Both are inside the same `run()` and both see the same closure.
- `src/cli/sync.js` l.278 carries the identical alerts expression. It is **not**
  edited by this WP.
- `src/core/alerts.js`: `appendAlert` (append-only, self-compacting),
  `readAlerts` (oldest-first, sanitized, byte-bounded), `clearAlerts(paths, job)`
  (removes every record whose `job === job`, deletes the file when none remain,
  and first calls `pruneAcksForJob`).
- `src/core/alert-ack.js` `unacknowledgedAlerts(paths, alerts)` (l.131) returns
  `alerts` minus the acknowledged pairs. Its JSDoc ends, at l.125-127, with these
  three lines verbatim:

  ```text
   *  A non-array `alerts` returns [] — an upstream PROGRAMMING-ERROR guard, not a
   *  suppression path (both callers pass readAlerts, which always returns an
   *  array). This is the ONLY suppression point (Table B).
  ```
- `src/core/digest.js` l.486-513 `formatAlerts`, whose template ends at l.509
  with the "clears automatically" sentence. **Not a Deliverable — byte-frozen.**
- `src/cli/run-job.js`: `failLoud` (l.692) appends + emails; the policy-hook
  warning appends at l.953 *before* the spawn; the success path writes the
  success marker (B1, l.1187) and then `clearAlerts(paths, name)` (B2, l.1204).
  `runJob` is only ever reached with a `job` object obtained from
  `jobsLib.findJob` / `jobsLib.listJobs` (l.1494 and l.1343), i.e. a job that is
  present in the managed `jobs:` section of `config.yaml` at spawn time.
- `buildCleanEnv` (l.150) sets `WIENERDOG_JOB: name` in the child environment on
  **both** platform branches (l.180 win32, l.219 POSIX), and that env object is
  what `spawn` (l.1036) hands the child. `resolveCommand` (l.439) runs
  `builtin:dream` as `node <bin> dream --yes`, so the dream is a child process
  that reads that variable through `process.env`.
- Precedent for reading it: dream.js already takes a supervisor-set variable off
  `process.env` at l.812 (`WIENERDOG_DREAM_RUN_TOKEN`), strictly validated, with
  *anything else treated as absent (standalone run)*.
- Tests: `tests/unit/dream-pipeline.test.js` (2039 lines) drives whole in-process
  dream runs through a `runDream(ctx, argv, opts)` harness — see its existing
  case *"the digest is regenerated AFTER the ledger is persisted (row G4, Table V
  row V10)"* (l.829). `tests/unit/scheduler-runjob.test.js` (3026 lines) drives
  `run-job` with fake commands (`opts.resolveCommand`, `opts.skipContainmentProbe`,
  `opts.sendAlert`) and already covers B1/B2 and the policy-hook warning.
  `tests/unit/dream-pipeline.known-calls.js` is SHA-pinned but pins only the git
  call set — nothing in this WP touches it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/dream.js | filter the alerts input of `regenerateDigest` per Table A. No other behavior changes |
| modify | src/core/alert-ack.js | **comment only, zero code lines**: narrow the stale universal in `unacknowledgedAlerts`' JSDoc per Table B |
| modify | tests/unit/dream-pipeline.test.js | cover the dream-layer acceptance criteria below (the implementer designs the cases) |
| modify | tests/unit/scheduler-runjob.test.js | cover the run-job-layer acceptance criteria below |

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

The alerts input at `src/cli/dream.js` l.633 becomes the same expression with
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
(Deliverables cells, acceptance criteria, verification gates, the JSDoc in
`alert-ack.js`).

### Table A — the alerts the dream's digest render omits

| Fact / rule | Value |
|-------------|-------|
| Where applied | the `regenerateDigest` closure in `src/cli/dream.js` and nowhere else. Both of its call sites (the quarantine-only refresh and step 19) inherit it, because both go through the closure. `src/cli/sync.js` is unchanged; **no third feeder of the digest's alerts array is created** |
| Filter position | applied to the **result** of `unacknowledgedAlerts(paths, readAlerts(paths))`, leaving that expression textually intact. Both orders yield the same set; this order is required so `alert-ack.js`'s standing claim that *both callers pass `readAlerts`* stays true (Table B narrows only the sentence that this WP actually falsifies) |
| Resolved job name | `process.env.WIENERDOG_JOB`, accepted **only when** `jobsLib.findJob(paths, thatValue)` returns a job whose `run` is exactly the string `builtin:dream`. Every other case resolves to **no name**: the variable absent, not a string, empty, naming a job `config.yaml` does not define, or naming one whose `run` is anything else |
| Omitted set | when a name resolves: every record in the array whose `job` **strictly equals** that name — exactly the set `clearAlerts(paths, name)` will remove. When no name resolves: nothing is omitted, and the rendered bytes equal today's |
| Failure direction | **fail-safe toward SHOWING.** Any doubt — unreadable config, a lookup that throws, a name that does not resolve — omits nothing and renders exactly what is rendered today. Nothing in this filter may throw out of `regenerateDigest` |
| Why env is trusted here | `WIENERDOG_JOB` is set by `buildCleanEnv` in the very component that owns the lifecycle: the supervisor tells the child which job's alerts its own success will clear. This mirrors `WIENERDOG_DREAM_RUN_TOKEN` (`src/cli/dream.js` l.812), which dream.js already reads the same way, with the same absent-on-anything-unexpected rule. The config cross-check makes the claim config-derived rather than merely asserted, and it can never be inert on the scheduled path: `runJob` is only reachable with a job that `findJob`/`listJobs` returned (`src/cli/run-job.js` l.1494, l.1343) |
| Never changed | `formatAlerts` and every byte of its template, including the "clears automatically" sentence (byte-frozen, WP-neutralize-alert-callout-rendering); `src/core/digest.js` in any respect; `src/core/alerts.js` and every writer of `alerts.jsonl` (`appendAlert`, `failLoud`, the launcher's `appendRefuseAlert`); `clearAlerts` and where it is called; the acknowledgement store and `addAcks`/`pruneAcksForJob`/`unacknowledgedAlerts`' behavior; `src/cli/sync.js`; `wienerdog alerts`; `schedule.json`; the fail-loud email. `run-job` still writes no byte of `digest.md` |
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

### Mirrored Surface Checklist

Each of these restates a fact decided in Table A or Table B. A review finding
updates the table **and every mirror below in the same commit** — no commit
exists in which they disagree — and any new mirror found in review is added here
on the spot:

- [ ] Deliverables-table cells (the `dream.js` row cites Table A, the
      `alert-ack.js` row Table B)
- [ ] Acceptance criteria that assert Table A's omitted set, its resolution rule
      and its failure direction, and Table B's diff shape
- [ ] Verification commands (the two `alert-ack.js` gates assert Table B)
- [ ] Current-state description (l.633's expression, the two call sites, the
      `WIENERDOG_JOB` channel, the `findJob` reachability argument)
- [ ] The signature sketch and the worked example under "Exact contracts"
- [ ] Implementation notes: the rejected alternatives, the named residual, the
      managed-policy consequence
- [ ] Context: the WP-041 quote and the statement that its accepted lag is
      withdrawn while its prohibition is kept

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step (CLAUDE.md).
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
- **Named residual — a dream that fails AFTER its own render under-reports until
  the next render.** If the run throws after step 19, or run-job's B1
  (success-marker refused) or B2 (alert-cleanup refused) fires, `alerts.jsonl`
  ends up holding a record for the job that the just-written `digest.md` does not
  show. This is not a new class of hole: only `dream.js` and `sync.js` write
  `digest.md`, so **every** alert appended by **any** job is already invisible in
  the digest until the next dream or `sync` — a failing `daily-digest` at 05:00
  reaches the digest at the next dream, not before. What changes is the narrow
  case where a *pre-existing* dream alert used to remain as a stale
  directionally-correct banner. In all these paths the failure still reaches the
  user through `alerts.jsonl` itself, `wienerdog alerts` and the fail-loud email.
  `schedule.json` carries the signal only on the ordinary failure path (step 7's
  `last_status: 'error'`): B1 fires *because* the marker write threw, so it
  records neither status, and B2 fires after `last_status: 'ok'` was already
  written. Accepted; do not widen this WP to chase it.
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
      true value) or the user's own shell.

## Acceptance criteria

- [ ] **The reproduction.** With `config.yaml` defining `dream` as
      `run: builtin:dream`, one unresolved `dream` record on file, and the dream
      run under `WIENERDOG_JOB=dream`: the `state/digest.md` the run writes
      contains no `> [!warning]` line naming `"dream"`. The other half of the
      sequence is asserted at the layer that owns it — a successful `run-job`
      leaves no record for that job in `alerts.jsonl`.
- [ ] **Other jobs are never omitted.** With records for `dream` and for a second
      job on file and the run supervised as `dream`, the second job's callout
      renders unchanged.
- [ ] **Unsupervised runs are unchanged.** With `WIENERDOG_JOB` absent from the
      environment, the same fixture renders both callouts, byte-identical to the
      pre-change output.
- [ ] **The resolution rule holds in both refusing directions** (Table A): a
      `WIENERDOG_JOB` naming a job absent from `config.yaml`, and one naming a
      job whose `run` is not `builtin:dream`, each omit nothing — including when
      an alert for that very name is on file.
- [ ] **Both render sites behave identically**: the quarantine-only refresh and
      step 19 produce a digest under the same omission rule.
- [ ] **Nothing throws out of the filter** (Table A, failure direction): a run
      whose config is missing or unreadable still renders a digest, and renders
      it with nothing omitted.
- [ ] **A post-render failure still records the failure where run-job owns it.**
      A run that exits non-zero, and a run whose success-marker write is refused
      (B1), each end with a record for that job in `alerts.jsonl`. The one named
      exception is the `alert-cleanup-refused` (B2) outcome, which deliberately
      skips the append because the refused artifact IS `alerts.jsonl` — existing
      contract, unchanged by this WP, and on that path the job's earlier records
      survive because the clear is what failed.
- [ ] **`src/core/alert-ack.js` changes comments only** and carries Table B's
      narrowed claim; its behavior is unchanged and `tests/unit/alert-ack.test.js`
      passes untouched.
- [ ] Every file under `tests/golden/` is byte-identical and none is edited.
- [ ] `npm test` and `npm run lint` pass.
- [ ] Idempotence: **N/A — this WP ships no command and adds no write to a user
      machine.** It changes one input to a render that already rewrites
      `state/digest.md` in full on every call.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm test -- --test-name-pattern "dream-pipeline"
npm test -- --test-name-pattern "scheduler-runjob"
npm test -- --test-name-pattern "alert"

# Table B gate 1 — every changed line in alert-ack.js is a JSDoc continuation
# line (leading "+"/"-", then " * "). Empty output = pass. The `test -f` guard
# is deliberate: without it a deleted file makes the pipeline read greenest.
test -f src/core/alert-ack.js && \
  [ -z "$(git diff main -- src/core/alert-ack.js | grep -E '^[+-]' \
      | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-] \*')" ]

# Table B gate 2 — the narrowed claim is present exactly once…
test "$(grep -Fc 'ONLY ACKNOWLEDGEMENT suppression point' src/core/alert-ack.js)" = 1
# …and the ungated universal it replaces is gone. Guarded for the same reason.
test -f src/core/alert-ack.js && ! grep -Fq 'This is the ONLY suppression point' src/core/alert-ack.js

# Table A gate — digest.js is not a Deliverable, so the frozen template cannot
# have moved. Second numstat field (deletions) must be 0 and the file unchanged.
test -z "$(git diff --numstat main -- src/core/digest.js)"
```

- The four gates after the test runs are NEW steps, and each is an ASSERTION:
  it exits non-zero on failure rather than printing something a reader has to
  judge. Paste a real green on the finished state **and** a real red from each
  of three deliberately broken states — the deliverable ABSENT (delete
  `src/core/alert-ack.js`), the deliverable VIOLATING (change one executable
  line in it; reword the narrowed sentence past its prefix; touch
  `src/core/digest.js`), and the compliant state — so a check that cannot fail
  is caught before anyone believes it.

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
- **Giving the managed-policy hook warning a standing surface.** Named in Table
  A and Implementation notes; it needs its own WP, because the correct fix is a
  channel that a successful run does not erase, not a record in the failure log.
  **Maintainer ruling (2026-09-10): this WP ships first; the follow-up WP is
  drafted later.** Losing the warning's only (mislabelled) surface in the
  interim is accepted.
- **Retrying the pre-dream containment probe.** See "Discovered" below.
- The `--catch-up` pseudo-job's records, which nothing ever clears
  (WP-attended-alert-acknowledgement), and bounding the launcher's unbounded
  writer (WP-launcher-alert-bound, Superseded — never implemented).
- Editing `docs/specs/done/WP-041-persistent-failure-alerts.md`. Its accepted
  lag is withdrawn by *this* spec's Context; a Done spec is a point-in-time
  record and is not rewritten.

## Discovered (not this WP's work — recorded so it is not lost)

The run that exposed the defect failed for an unrelated reason: the pre-dream
containment probe (`src/core/dream/containment-probe.js`, `PROBE_TIMEOUT_MS =
120_000`) received no assistant message within its 120 s budget and returned
ETIMEDOUT — a transient upstream API stall, not a containment regression. The
probe has no retry: one stall halts the dream fail-closed for that fire, which is
the correct default for a containment check but converts a transient network
event into a nightly miss. Whether the probe should retry once before halting is
a separate decision for the maintainer; nothing in this WP touches the probe.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs for the four new gates.
2. Conventional commits; PR titled
   `fix(dream): the digest render omits the alerts this run's success clears (WP-dream-digest-omits-own-job-alerts)`.
3. PR template filled, including "Decisions made" — which must name the
   managed-policy-warning consequence (Table A, last row) — and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
