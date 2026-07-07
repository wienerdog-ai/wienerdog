# ADR-0012: Dream run lifecycle — session-edit pre-commit, crash revert, durable alerts

Status: Accepted
Date: 2026-07-04

## Context

The first production night (2026-07-04) exposed three lifecycle gaps: ordinary
interactive-session vault edits left the tree dirty, so the dream's clean-tree
gate starved it for 10 hours of silent hourly retries; a transiently-crashed
brain left unvalidated writes that the same gate then refused forever
(self-starvation); and the failure surface — a digest banner regenerated away
by the next sync — proved transient exactly when durability was needed.

## Decision

The dream run adopts a three-part lifecycle (WP-039/WP-041):

1. **Pre-commit of session edits.** After acquiring the lock and before the
   brain runs, the orchestrator commits any uncommitted vault changes as its
   own commit (`vault: session edits before dream`). This is versioning of the
   user's OWN working-tree state — no model-authored content — and it
   preserves one-commit-per-dream revertibility for the dream's writes.
2. **Crash revert by construction.** Because of (1), any dirt present after a
   nonzero brain exit is brain-authored by construction; the orchestrator
   reverts it (scoped git restore/clean of the vault) before releasing the
   lock. A crashed dream can no longer starve future dreams.
3. **Durable alerts.** Job failures append to `state/alerts.jsonl`
   (mechanics, not vault); the digest renderer prepends a plain-language alert
   block while unresolved alerts exist; the next successful run of the same
   job clears them. Email stays best-effort; the transient banner is removed.

## Consequences

- Users' vault edits get committed automatically with a fixed, recognizable
  message — a new durable behavior: the vault's git history now interleaves
  `vault: session edits before dream` commits with dream commits. Documented
  in user-facing docs; reversible like any commit.
- Failures stay visible across digest regenerations until resolved (accepted:
  clears one regeneration after success, not instantly).
- Threat model: the pre-commit introduces no model-writable surface (it
  records existing user state); alerts are rendered as plain text with no
  instruction-following framing and live outside the vault. T6 updated.

## Amendment (2026-07-05): input-capacity starvation — WP-048

### Context

A second silent-starvation incident (production dogfooding, 2026-07-05,
clean-env replayed). The 03:30 dream reported "nothing new to dream" and exited
0 while four fresh Claude sessions existed past the watermark. Cause: each
extract alone exceeded the total input budget (`dream_max_input_bytes` default
400 000; per-session caps allow ~8 MB); the newest-first selection loop `break`s
at the first over-budget session, so one oversized session dropped every smaller
one behind it; with nothing selected, `entries.length === 0` was treated as
"nothing new" (exit 0), so no watermark advanced, no report was written, and —
because that early-exit reports *success* — the part-3 durable-alert machinery
never fired. Heavy days therefore starved the dream permanently and invisibly.

### Decision (adds parts 4 and 5 to this ADR)

**Part 4 — input capacity is bounded by truncation, not by dropping whole.** The
dream input assembly fits the fresh set under `dream_max_input_bytes` by
water-filling: sessions that fit their equal share are kept whole; the boundary
sessions are **truncated to fit** (drop oldest messages, keep newest, reuse the
existing `truncated:true` convention). A per-session floor
(`MIN_TRUNCATE_BYTES = 32 768`) bounds truncation: a session that cannot be
granted at least the floor is dropped whole and retried next run. This guarantees
**forward progress** — with `dream_max_input_bytes >= the floor` the newest
session is always fed (whole or truncated), so the watermark always advances and
no session can lead the sort forever. A **truncated** session counts as consumed
(advances the watermark); its dropped-oldest messages are the least-recent
context and re-running would drop them identically. The default
`dream_max_input_bytes` is raised **400 000 → 8 000 000** (provisional,
owner-chosen "for now"; revisitable). Override semantics are unchanged.

**Part 5 — a capacity-wedged dream fails loud, never "nothing new."** Any size
event (truncation or whole-drop) is stated plainly on stdout / in the run log
(counts, session ids, sizes). When fresh sessions existed but none could be fed
(`kept === 0` with drops — only possible when the budget is below the floor, a
misconfiguration), the dream throws instead of reporting success, so the part-3
machinery records a durable `state/alerts.jsonl` entry (via `run-job`'s
fail-loud) that the digest surfaces until the next successful run. "Nothing new
to dream" (exit 0) is now reserved for the genuinely-empty case (no fresh
sessions at all).

### Consequences

- The vault git history may now interleave `dream:` commits that reflect
  truncated input on heavy days; the dream report records what was truncated.
- The scalar per-harness mtime watermark still cannot record partial consumption:
  a whole-dropped session older than a kept session will not be re-discovered
  (pre-existing limitation, unchanged). Acceptable because the raised default
  makes drops effectively never happen, and truncation removes the `kept === 0`
  stall this incident is about.
- No new model-writable surface and no new alert channel: truncation drops
  already-redacted whole messages before the single pristine scratch write, and
  the wedged-dream alert reuses the part-3 durable path (control-plane strings
  only, outside the vault). ADR-0004 (just files) intact.

## Amendment (2026-07-07): overlapping dreams + watermark-consolidation safety — WP-069

### Context

A third silent-loss incident (production dogfooding, 2026-07-07). Two dreams
overlapped — the long 03:30 daily run and the hourly catch-up, which fires
because `last_success` is not yet written while the daily run is still going, so
this is reachable on an ordinary user machine, not just under manual invocation.
Dream **A** had written 5 extracts to the shared `state/dream-scratch`, held the
lock, and its brain was mid-read. Dream **B** started ~26 s later and (1) its
`collectExtracts` ran **before** it tried the lock, rebuilding the shared scratch
dir (`rm -rf` + `mkdir`) — destroying A's live inputs — and then (2), after
failing to acquire A's lock, called `cleanScratch` on the lock-loss backoff path —
a second deletion. Brain A found its scratch gone, wrote only failure-doc notes,
and exited **0**; orchestrator A committed those notes and **advanced its
watermark past all 5 extracts, 3 of which no dream had ever consolidated** — a
silent, permanent drop (the WP-048 capacity-starvation outcome via a new cause).

Two root causes: (1) `state/dream-scratch` is shared mutable state but the lock
was acquired *after* it was written, and the lock-loser deleted it; (2) watermark
advancement was gated only on a successful commit, not on whether the brain
actually consumed the extracts.

### Decision (adds parts 6 and 7 to this ADR)

**Part 6 — the scratch dir is lock-protected shared state; the lock-loser is a
pure no-op.** The single-run lock is acquired **before** any scratch collect or
write, and `state/dream-scratch` is mutated only while the lock is held. A dream
that does not acquire the lock performs **no filesystem mutation whatsoever** — no
collect, no `cleanScratch`, no lock write — it prints "another dream is in
progress" and returns. Therefore a second concurrent dream can **never** delete or
overwrite the inputs of the dream that holds the lock. Teardown (clean scratch +
release lock) runs only when the process **still owns** the lock (`ownsLock`, a
pid check): a process superseded by a legitimate stale-lock *steal* touches
neither the stealer's scratch nor its lock. The lock's steal deadline
(`now + timeoutMs`) equals the brain watchdog timeout, so a stealable lock implies
the prior holder's brain is already dead; the remaining microsecond-scale race
(a superseded holder finishing post-brain git work) is accepted, mirroring the
WP-029 stale-lock tradeoff. Design fork resolved in favour of the **single shared
scratch dir + strict lock ordering** over per-run `dream-scratch-<pid>` isolation:
lock-first ordering already makes the loser never touch scratch, so per-run dirs
would only help the rare steal case (already covered by the pid-guarded teardown)
at the cost of an orphan-sweep and a scratch contract spread across three modules.
Revisitable.

**Part 7 — the watermark advances iff the extracts were actually consumed by a
successful consolidation.** The per-harness watermark advances **iff** (a) the
brain exited 0, (b) every input extract that defines the new watermark was still
present and byte-identical to its pre-brain baseline when the brain finished
(proving the inputs were available and unmodified for the whole run), and (c) the
validating commit succeeded. A run whose brain exits 0 but whose inputs
vanished/changed mid-run is degraded: the orchestrator restores the vault
(discarding the brain's failure-doc writes), advances **no** watermark, and throws
so `run-job` records a durable `state/alerts.jsonl` entry — those sessions are
retried next run. This closes the gap left by part 2 (which handled only the
*nonzero-exit* crash): the "brain exited 0 but consolidated nothing because its
inputs disappeared" path. The check lives in the orchestrator because
`validateAndCommit`'s scratch-integrity scan iterates only files that *exist* and
so is blind to total scratch deletion.

### Consequences

- Overlapping dreams are now safe by construction: the loser is a no-op and the
  winner's inputs are inviolable. The lock is held slightly earlier (across the
  input-selection read), which is strictly more correct.
- No exit-0 path can advance the watermark without the brain's inputs having been
  present and intact — the silent-drop class this and the WP-048 incident share is
  closed structurally, independent of the part-6 concurrency fix.
- The fail-loud `reason` for the vanished-inputs case is a fixed control-plane
  string (no brain stderr, no session content), consistent with part-3 / WP-041
  separation; ADR-0004 (just files) and the brain sandbox are unchanged.
