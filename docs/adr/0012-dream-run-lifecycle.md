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
