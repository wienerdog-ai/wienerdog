---
id: WP-dream-live-owner-lock
title: Preserve a live dream owner's lock after its deadline
status: Draft
model: sonnet
size: M
depends_on: [WP-069]
adrs: [ADR-0004, ADR-0012, ADR-0031]
---

# WP-dream-live-owner-lock: Preserve a live dream owner's lock after its deadline

> **Owner-approved scope; Draft pending independent design review.** On
> 2026-09-15 the owner selected a separate prerequisite WP for the narrow
> liveness-aware fix. Automatic takeover of expired, proven-dead local owners
> remains. The existing simultaneous stale-claimant race is an accepted residual,
> not a new guarantee. This does not approve the successor's P1–P4 proposals.

## Context (read this, nothing else)

The dream's collector rebuilds a shared scratch directory. The CLI acquires
`state/dream.lock` before collection and keeps it through preprocessing, the
brain, validation/promotion and cleanup. A contender that observes the established local owner alive must not rebuild
that scratch because of deadline expiry alone (L7). The inherited simultaneous
stale-claimant race remains the L5 exception; this is not a universal exclusion
claim.

Today the lock's deadline is set from the model timeout before preprocessing,
and expiry alone permits takeover. The proposed independent preprocessing
allowance can outlast that deadline; finishing a started session may also
overrun its nominal allowance. Adding nominal durations cannot establish that
the owner has stopped. This prerequisite changes takeover eligibility, not the
soft preprocessing policy or brain watchdog.

Use local process existence when deciding an expired lock. Preserve automatic
recovery for an expired lock whose local owner is demonstrably gone. Do not
automatically replace unverifiable ownership. Wienerdog remains files and
short-lived jobs: no heartbeat, daemon, background monitor or automatic kill.

## Current state

Inspected executable base: `91668da62822c73be6115a3e6d06c6ec51462509`.
Re-verify these claims at dispatch:

| Claim | Current owner and behavior |
|---|---|
| C1 | `src/core/dream/lock.js` exports `acquireLock(stateDir, timeoutMs)`, `ownsLock(stateDir)` and `releaseLock(stateDir)`. Acquisition first uses `wx`; an existing lock is treated as live solely when its numeric deadline has not passed. Expired/unreadable data is overwritten without owner liveness evidence. |
| C2 | `src/cli/dream.js` passes `cfg.timeoutMs` before collection, prints the existing busy message on declined acquisition, and only cleans scratch/releases when `ownsLock` is true. |
| C3 | `tests/unit/dream-lock.test.js` currently expects an expired lock of the calling process and malformed JSON to be stolen. Those expectations change; ordinary acquisition and ownership helpers remain. |
| C4 | ADR-0012's 2026-07-07 part 6 incorrectly infers that a stealable deadline means the prior brain is dead. The lock spans more work than that watchdog. |

A local two-process reproduction observed a live holder's expired lock stolen,
followed by replacement of its scratch. Provenance: committed
`docs/specs/logbook/2026-09-15-dream-filtered-input-budget-design-r2-raw.txt` and
the investigation logbook's reproduction artifacts. This reproduced current
helpers, not the proposed implementation. The simultaneous stale-claimant race
below is a source-based inference, not a reproduced result.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/lock.js | Table L acquisition decision and additive decline reason. |
| modify | src/cli/dream.js | L6 distinction between busy and unverifiable ownership; preserve lock-first lifecycle. |
| modify | tests/unit/dream-lock.test.js | L1–L5 and existing ownership helpers. |
| modify | tests/unit/dream-pipeline.test.js | L6–L7 lifecycle and diagnostics. |
| modify | tests/integration/dream.test.js | Existing busy/stale integration expectations and L6–L7. |
| modify | docs/adr/0012-dream-run-lifecycle.md | L8 narrow part-6 amendment. |

### Exact contracts

Table L owns behavior. Keep signatures and acquired-result objects compatible;
add a reason only to declined acquisition:

```js
acquireLock(stateDir, timeoutMs)
// -> { acquired: true, stolen: false }
//  | { acquired: true, stolen: true }
//  | { acquired: false, stolen: false, reason: 'busy' }
//  | { acquired: false, stolen: false, reason: 'owner-unknown' }
ownsLock(stateDir)   // -> boolean, unchanged
releaseLock(stateDir) // -> undefined, unchanged
```

The existing lock path and payload remain. With process PID 12345, hostname
`example-host`, acquisition time `2026-09-15T10:00:00.000Z` and timeout 60,000 ms,
the complete `<stateDir>/dream.lock` file is the following single line with
**no trailing newline**:

```json
{"pid":12345,"host":"example-host","startedAt":"2026-09-15T10:00:00.000Z","deadline":1789466460000}
```

No new lock fields, state file, CLI flag or configuration setting. L2–L4 govern
which existing fields are decision inputs; `startedAt` remains informational.
New CLI diagnostics use the literal code-owned messages in L6.

## Contract reference

ADR-0031 activates for an additive result taxonomy, changed fallback behavior
and the lock/CLI authority boundary. Table L is canonical.

### Table L — Expired-owner decision and its limits

| ID | Contract | Rule |
|---|---|---|
| L1 | Ordinary acquisition | Preserve the existing `wx` acquisition and payload construction. Success returns the unchanged acquired/not-stolen object. Non-`EEXIST` errors still propagate. Only an already existing lock enters L2. |
| L2 | Read and age ordering | Read/parse the existing record. A read failure, non-object/array record or non-finite/non-number deadline returns `owner-unknown` without overwriting. For a finite deadline, `now <= deadline` returns `busy` without PID probing, preserving the unexpired behavior; equality is not expiry. Only `now > deadline` proceeds to L3. If the file disappears during the read, this attempt declines as unknown; a later invocation can acquire normally. |
| L3 | Local owner identity | An expired record is locally probeable only when its string host equals `os.hostname()` exactly and its PID is a numeric integer in `[1, 2147483647]`. Do not coerce strings, probe PID zero/negative values or interpret another host's PID locally. Other records return `owner-unknown` without replacement. |
| L4 | Process existence | Probe with `process.kill(pid, 0)`, which sends no terminating signal. Success or error code `EPERM` means retain ownership and return `busy` regardless of elapsed time. Only `ESRCH` establishes the local PID is absent and permits L5. Other failures return `owner-unknown`. A reused PID pointing at an unrelated live process conservatively blocks recovery. |
| L5 | Automatic recovery and accepted residual | An expired L3-valid local owner with L4 `ESRCH` retains the existing overwrite takeover and acquired/stolen result. Do not remove automatic recovery for this case. The existing read/probe-to-overwrite sequence is not an atomic compare-and-swap: two contenders can both observe the old dead owner and later overwrite one another. The owner explicitly accepts this inherited race for this narrow WP; no claim of complete concurrent stale-recovery exclusion is made. No reclamation framework is introduced. |
| L6 | Decline diagnostics | `busy` prints `wienerdog: another dream holds the lock.` and returns as before; it does not claim the deadline proves active computation. `owner-unknown` throws `WienerdogError` with `dream lock owner could not be verified; no takeover was attempted. Check whether an earlier dream is still running before arranging lock recovery.` The existing job-failure path can surface this error. Neither branch enters collection, mutates scratch, rewrites/deletes the lock, cleans scratch or releases the lock. Do not suggest blind lock deletion or automatically kill a process. No PID/host/raw error text is interpolated into the new messages. |
| L7 | Coverage and lifecycle | An established local owner observed alive/EPERM at an expired-lock check cannot lose its lock through that check merely because its nominal deadline passed. The protection covers preprocessing and its permitted overrun, brain execution and existing finalization/cleanup without summing phase durations. Existing lock-first ordering, `ownsLock`/`releaseLock` behavior and cleanup-before-release remain. This is process-existence protection, not a health check, lease renewal, child-process reap proof or absolute stale-reclamation guarantee. |
| L8 | ADR amendment | Append a dated amendment to ADR-0012 part 6 retaining historical text, withdrawing the deadline-implies-dead assertion and the associated broad guarantee for stale takeover. State L2–L7, continued shared scratch/lock-first ordering, automatic expired-dead-local recovery, conservative unknown handling and the owner-accepted simultaneous stale-claimant residual. Preserve part 7 and unrelated lifecycle/capacity amendments. Record the actual 2026-09-15 owner decision; do not imply approval of the successor's content/work proposals. |

Examples defer to Table L:

- Expired local lock; the process exists: decline as busy even during a long
  preprocessing session or post-brain cleanup.
- Expired local lock; the probe returns ESRCH: automatic takeover remains.
- Unexpired lock: decline as busy without probing, even if its PID is absent.
- Malformed JSON, missing deadline, expired foreign-host record or expired
  malformed PID: decline as owner-unknown; do not infer safe recovery.

### Mirrored Surface Checklist

This section registers the existing document from frontmatter through completion.
Table L owns operative lock behavior. Historical evidence stays historical;
process metadata and workflow requirements retain their repo-process authority.

- [ ] Frontmatter/title and opening scope notice: the feature boundary and
      approved scope/residual mirror L5–L8. Status/review gates are process facts;
      the existing WP-069 dependency is historical lineage, not a new guarantee.
- [ ] Context: inherited behavior is identified as current state; the intended
      protection, recovery and scope limits defer to L2–L8.
- [ ] Current state, C1–C4 and reproduction provenance: preserve the inspected
      revision and historical/inferred labels; never rewrite them as proof of
      implementation. Any forward-looking expectation defers to L1–L8.
- [ ] Deliverables and Exact contracts, including signatures, lock payload,
      complete file example and diagnostic references: defer to L1–L8.
- [ ] Contract reference activation and this checklist describe ownership;
      Table L is canonical, and the examples immediately below it mirror L2–L7.
- [ ] Implementation notes & constraints and Security checklist: operational
      limits, retained behavior and accepted residuals defer to L1–L8.
- [ ] Acceptance criteria and Verification steps, including explanatory test
      ownership: behavioral assertions defer to L1–L8; red/green evidence and
      verification requirements retain their repo-process authority.
- [ ] Out of scope: recovery, concurrency and lifecycle boundaries defer to
      L2–L8; adjacent work remains outside the Deliverables boundary.
- [ ] Definition of done: approval/scope disposition mirrors L5/L8; status,
      dispatch re-verification, PR and review requirements are process facts.
- [ ] Cross-document mirrors: the ADR amendment defers to L8; the successor
      inherits L7 with the L5 residual, without widening either guarantee.
- [ ] Register newly found mirrors; update affected canonical rows and every
      registered mirror together in the same commit, without an intermediate
      commit containing disagreement.

## Implementation notes & constraints

- Owner decision: retain automatic dead-owner recovery and fix live-owner expiry
  in a separate prerequisite. Do not reopen that choice during implementation.
- A hung but live owner now blocks subsequent dreams. Safe recovery requires
  establishing that it stopped; this WP adds no attended recovery command.
  An unreadable/foreign/invalid lock may similarly require investigation.
- PID reuse, host rename and unverifiable probe errors can delay recovery.
  No boot identifier or cross-host coordination is introduced.
- L5 retains the existing simultaneous-stale-claimant race. An orphaned brain
  after its orchestrator dies is likewise not proved reaped by a PID probe;
  no stronger child-lifecycle guarantee is introduced here.
- The existing timeout remains a not-before threshold for dead-owner takeover,
  not authorization to displace a live owner. Keep the current CLI timeout
  argument; the successor need not invent a combined lease duration.
- Keep this WP independent of transcript selection, memo state and numeric
  preprocessing defaults. Its successor is `WP-dream-filtered-input-budget`.
- No golden fixture changes or runtime dependencies. Local implementation
  choices belong in the PR; new operational policy requires a spec revision.

## Security checklist

- [ ] L3 accepts only a valid local positive PID before a signal-zero probe;
      no shell, PID coercion, negative/process-group probe or terminating signal.
- [ ] L2–L4 unknown ownership cannot authorize overwrite or destructive recovery.
- [ ] L6 declined acquisition mutates neither shared scratch nor the existing lock.
- [ ] L5/L7 residuals remain explicit; process existence is not presented as
      cryptographic identity or proof that child processes were reaped.

## Acceptance criteria

- [ ] AC1 — L1 preserves ordinary atomic acquisition and payload bytes.
- [ ] AC2 — L2–L4 hold for deadline equality/expiry, malformed/unreadable records,
      local/foreign identity, accepted PID domain and each probe outcome.
- [ ] AC3 — L5 retains automatic takeover only for the expired proven-dead local
      case within its stated non-atomic stale-reclamation limit.
- [ ] AC4 — L6 emits the specified busy/unknown distinction and declines without
      scratch/lock mutation; unknown is an actionable error.
- [ ] AC5 — L7 holds when an established owner remains alive beyond the nominal
      deadline, across preprocessing/brain/finalization; existing ownership
      helper and cleanup-order behavior remains.
- [ ] AC6 — Repeating acquisition against the unchanged retained lock yields
      second run: zero changes to its bytes and scratch; ordinary repeat attempts do not
      overwrite an owner. This WP does not add install/sync behavior.
- [ ] AC7 — ADR amendment reflects L8 and actual owner disposition.
- [ ] AC8 — Regression assertions fail against expiry-only takeover and pass
      against implementation; verification below passes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- tests/unit/dream-lock.test.js tests/unit/dream-pipeline.test.js tests/integration/dream.test.js
npm test
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-live-owner-lock.md src/core/dream/lock.js src/cli/dream.js tests/unit/dream-lock.test.js tests/unit/dream-pipeline.test.js tests/integration/dream.test.js docs/adr/0012-dream-run-lifecycle.md
git diff --check
```

Lock tests own AC1–AC3 and retained-lock repeatability; pipeline and dream integration tests own AC4–AC6.
Review ADR wording against L8 for AC7. Retain actual old-implementation red and
implemented green output for AC8; a reproduction asserting unsafe behavior is
not proof of the fix. Test design belongs to the implementer. The investigation
logbook records an existing full-suite executable-pin failure in
`tests/integration/adopt-e2e.test.js`; do not change that unrelated test here.

## Out of scope (do NOT do these)

- Heartbeat, combined duration lease, automatic kill or unattended malformed-lock deletion.
- Atomic stale-claim arbitration, PID generation/boot identity or cross-host lock redesign.
- Child-reaping redesign, transcript filtering, preprocessing configuration or memo state.
- General recovery CLI, installed-app repair and unrelated ADR amendments.

## Definition of done

1. Complete the independent design gate before Ready. The owner-approved narrow
   scope and residual do not require repeated permission; material new policy
   does. Re-verify C1–C4 at the exact dispatch revision.
2. Verification passes, with output and regression red/green evidence in the PR.
3. Use `wp/dream-live-owner-lock` and conventional commits; PR title
   `fix(dream): preserve live lock ownership after expiry (WP-dream-live-owner-lock)`.
4. Fill the PR template, Decisions made, Discovered issues, WP-prefixed lessons
   and `Generated-by:`; flip status to In-Review in the implementation PR.
5. Both PR review gates run on the same tip and are clean or dispositioned.
   Merging remains the maintainer's step.
