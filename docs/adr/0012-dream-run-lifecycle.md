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

> **WITHDRAWN IN PART — read this BEFORE parts 1 and 2.** The 2026-08-30
> amendment at the end of this ADR **RETIRES part 1 and REPLACES part 2**. They
> are kept below verbatim as the record of what was decided on 2026-07-04, not
> as a description of current behaviour, and this note exists because a
> top-down reader otherwise meets them ~180 lines before meeting their
> retirement. **Three specific claims below are withdrawn:**
>
> 1. **Part 1's pre-commit no longer happens**, so the vault's history no longer
>    interleaves `vault: session edits before dream` commits, and the run now
>    leaves the user's uncommitted vault edits untouched in BOTH directions.
> 2. **Part 1's "preserves one-commit-per-dream revertibility" is superseded.**
>    One commit per run still holds and is unchanged. What changed is the undo:
>    it is now `git reset` then `git revert <sha>` — two commands, because
>    the run no longer touches the user's git index — a statement about the
>    run's own actions, since a hook the user has set to fire on ref updates is
>    their own code rather than the run's — so that index still
>    describes the pre-run HEAD until the reset re-syncs it. Skipping the reset
>    makes the revert **refuse** (exit 128) rather than apply in part. **The
>    guarantee is unchanged in substance — a run is deterministically and loudly
>    undoable — and only the "one command" phrasing stopped being accurate.**
> 3. **Part 2's crash revert is replaced by workspace teardown**, and a
>    `reset --hard` on the vault would now be a data-loss regression rather than
>    a recovery.
>
> **Part 3 (durable alerts) stands unchanged.**

1. **[RETIRED — see the 2026-08-30 amendment]**
   **Pre-commit of session edits.** After acquiring the lock and before the
   brain runs, the orchestrator commits any uncommitted vault changes as its
   own commit (`vault: session edits before dream`). This is versioning of the
   user's OWN working-tree state — no model-authored content — and it
   preserves one-commit-per-dream revertibility for the dream's writes.
2. **[REPLACED — see the 2026-08-30 amendment]**
   **Crash revert by construction.** Because of (1), any dirt present after a
   nonzero brain exit is brain-authored by construction; the orchestrator
   reverts it (scoped git restore/clean of the vault) before releasing the
   lock. A crashed dream can no longer starve future dreams.
3. **Durable alerts.** Job failures append to `state/alerts.jsonl`
   (mechanics, not vault); the digest renderer prepends a plain-language alert
   block while unresolved alerts exist; the next successful run of the same
   job clears them. Email stays best-effort; the transient banner is removed.

## Consequences

- **[WITHDRAWN by the 2026-08-30 amendment — this consequence no longer
  occurs.]** Users' vault edits get committed automatically with a fixed, recognizable
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

## Amendment (2026-08-30): the run writes a workspace and PROMOTES out of it — WP-dream-promote-in-workspace

### Context

Parts 1 and 2 above rest on one premise: **the brain writes into the vault.**
The pre-commit existed so the post-brain diff would be exactly the brain's
writes, and the crash revert existed to discard those writes when the run
failed. Both are correct only while the vault is the brain's write target.

It no longer is. Three shipped packages built the replacement and none was
wired in: `WP-dream-workspace-retarget` builds a **workspace** (a private copy
of the vault's readable content plus a constructed baseline of the exact bytes
it just wrote) and re-targets the brain at it;
`WP-dream-vault-write-primitive` built the one sanctioned way to put a content
file into the vault; `WP-dream-promote-module` and
`WP-dream-promote-report` built **promotion**, which decides per path what
happens and publishes what survives. This amendment is the run adopting them.

The direction inverts. The old lifecycle let the brain write the user's
namespace and then took writes BACK; the new one never lets them in until they
have passed. Everything the old direction needed in the vault — pre-committing
the user's edits so the diff would be clean, reverting the brain's unvalidated
writes on failure, deriving gate evidence from git — either has no subject any
more or becomes a data-loss regression if left in place.

### Decision (replaces parts 1 and 2; adds parts 8 and 9)

1. **~~Pre-commit of session edits.~~ RETIRED.** There is no dream diff in the
   vault to keep clean, and promotion's three-way compare reads the vault's
   current bytes from the filesystem rather than from git. What remained was
   only the cost: it committed the user's in-flight edits under the
   `wienerdog` identity without asking. **The consequence recorded below — that
   the vault's history interleaves `vault: session edits before dream` commits
   — no longer holds for runs after this amendment.**
2. **~~Crash revert by construction.~~ REPLACED BY WORKSPACE TEARDOWN.** The
   brain wrote nothing in the vault, so there is nothing to discard; and with
   the pre-commit gone, a `reset --hard` on that path would destroy **all** of
   the user's uncommitted work for a failure that never touched the vault. The
   failure paths remove the WORKSPACE instead. The vault is left byte-identical,
   uncommitted user edits included.
3. **Durable alerts.** Unchanged.

Two parts are ADDED, numbered from where the WP-069 amendment left off and
written in that amendment's own `**Part N —**` form.

**Part 8 — the run's shape.** Build the workspace → spawn the brain at it → require a
**verifiably empty** brain process group before reading the workspace →
classify what the brain wrote against the constructed baseline with a git-free
walk → promote what policy admits → commit exactly that → tear the workspace
down. `wienerdog dream` still makes **one git commit in the vault per run**,
which this amendment does not change.
**Part 9 — what the commit contains.** A NAMED set of paths, each carrying its
class's decided bytes, and nothing else: the promoted paths (redacted ones
included), the dream report, and the code-owned quarantine warnings file
whenever its canonical render differs from `HEAD`. The bytes committed are the
ones promotion approved — not a re-read of the working tree, so a user save
landing between the publish and the commit is neither committed nor discarded;
it stays as an ordinary uncommitted modification.

### Consequences

- **The user's uncommitted vault edits are never touched by a dream** — not
  committed on the way in, not reverted on the way out. This removes the
  automatic-commit behaviour part 1 introduced, and the interleaved
  `vault: session edits before dream` commits stop appearing.
- **Two run states deliberately leave the workspace on disk**, because removing
  a tree is the wrong act in both: a run refused because the brain's process
  group could not be verified empty (a surviving process may still be writing
  it), and a run that failed because a note's redaction AND its withheld
  preservation both failed (the workspace then holds the sole surviving copy).
  The lifecycle of a workspace left behind is a successor's subject, not this
  ADR's.
- **Undoing a run takes TWO commands, and this ADR is where that fact is
  decided.** The index behaviour it rests on is NOT decided here: Table W row
  W1 in `WP-dream-promote-in-workspace` is canonical for that, and this bullet
  states it rather than deciding it. The run assembles its commit in a private
  index outside the vault's `.git` and publishes it with `commit-tree` +
  `update-ref`, and it **never writes, refreshes, resets or otherwise touches
  the user's own git index — in any run state** — a statement about the run's
  OWN acts, its own git invocations and its own file writes (row W1(a) defines
  the scope); a hook the user has set to fire on ref updates is their own code,
  not the run's. So
  after a run HEAD has advanced and the index has not: `git status` reports the
  committed paths as staged deletions or reverse modifications and `git diff
  HEAD` shows phantom deletions, while the committed history is correct
  throughout. **`git reset` in the vault (no `--hard`, no paths) clears all of
  it**, and it is safe precisely because the run wrote nothing there — the only
  state it drops is the user's own pre-run staging. **Until that reset,
  `git revert <sha>` REFUSES** (`your local changes would be overwritten by
  revert`, exit 128) rather than applying in part. **The property this ADR
  guarantees is therefore that a run is deterministically and loudly undoable,
  which is unchanged; the "one command" phrasing is what stopped being
  accurate, and the conditional form is not a weakening of the guarantee but
  the guarantee stated accurately.** An earlier mechanism did refresh the user's
  index so the second command would be unnecessary; it was **withdrawn** after
  silently destroying staged content, a staged deletion, a staged mode change
  and an unresolved merge's stages in four successive review rounds, each patch
  fixing the shape it had just been shown. **Having the run perform the reset
  itself is REJECTED for the same reason** — it reimports exactly that
  destruction as designed behaviour. The full record is
  `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md`.
- **A refused run changes no vault note and advances no transcript ledger.**
  A dream run is not idempotent — it consumes a moving watermark and writes a
  date-stamped report — so this, not repeatability, is the property that makes
  a failed night safe.
- Threat model: the brain's write target is no longer inside the user's
  namespace, so a write that policy refuses never existed in the vault to be
  taken back. Classification consults git nowhere, so a brain-written
  `.gitignore` has no gate to blind. ADR-0004 (just files) is unchanged: the
  workspace is removed on every ordinary exit path and outlives no job.
