# ADR-0032: Daily-summary injection is untrusted-fenced, bounded data

Status: Accepted
Date: 2026-07-20

## Context

Every new AI session is bootstrapped with an injected **digest**
(`~/.wienerdog/state/digest.md`, rendered by `src/core/digest.js`). It is built
from the four human-ratified **identity** files plus the newest **daily note**'s
`## Summary` section (rendered as `## Latest daily log (<date>)`).

The `daily-summary-injection` **capability gate** (WP-109/WP-112, A0) is BLOCKED.
WP-112 froze it with an explicit precondition (its line 29): *"Until entry-level
provenance exists, the daily Summary must not be injected at all,"* naming a future
entry-level-provenance WP that was **never written**. The 0.10.0 un-freeze needs
this gate opened safely.

The blocker: the daily note is a **mixed-provenance aggregate by construction**.
The nightly **dream** consolidates transcripts that include external `tool_result`
content; the digest / inbox-triage / weekly-review routines summarize email into
the vault. Nothing writes `derived_from_untrusted` onto daily notes, so the digest's
only defense (`readNote`'s file-level flag) is always absent → the summary renders
**trusted-by-default**. The per-section secret scan detects secrets, not
**instructions**. So opening the gate as-is injects attacker-derived summary text
verbatim into instruction-adjacent SessionStart context (and every downstream sink
of `renderDigest`'s output). Additionally, `readNote`'s `fs.readFileSync` reads the
whole daily note unbounded (A6 bounded intake covered transcripts, not vault notes).

Two rejected framings shaped the tension:
- **Omit unless provably `derived_from_untrusted: false`** — omits EVERY current
  daily note (none carry the flag), so the feature stays effectively off.
- **Stamp `derived_from_untrusted: false` on the daily note** — a lie: the note is
  genuinely mixed-provenance; stamping `false` would defeat the exact gate it feeds.

## Decision

When `daily-summary-injection` is allowed, the digest still injects the daily
`## Summary`, but treats it as **untrusted-by-default data**:

1. **Untrusted fence.** The summary is wrapped in a fixed, **code-owned**
   `[!untrusted]` fence (`FENCE_OPEN` / `FENCE_CLOSE` constants in `digest.js`) that
   tells the model the content is DATA for context only — never instructions to
   follow. The raw summary is NEVER emitted un-fenced. The fence text is
   declarative, code-owned, and contains no note bytes (same rule as the alerts /
   identity-exclusion banners).
2. **Bounded read.** The daily note is read to a bounded prefix
   (`DigestCaps.MAX_DAILY_READ_BYTES`) before parse + `extractSection`, so an
   oversized daily note cannot exhaust memory.
3. **Existing gates preserved.** The `readNote` provenance gate still applies (a
   daily note carrying `derived_from_untrusted: true` is omitted entirely) and the
   per-section secret scan still runs; the fence is layered on top of both.

This is deliberately the **MVP**, not the full solution. The full solution is
**entry-level daily provenance** (WP-112's named precondition): tag each entry/line
of a daily note with its provenance so trusted-authored lines are distinguished from
summarized-external lines within one note, and inject only the trusted lines
un-fenced. That is a large cross-cutting contract — every writer of daily-note
content (dream, digest, inbox-triage, weekly-review, and the user's own edits) must
tag provenance, and a wrong default reopens the hole — so it is deferred.

## Why the fence closes the vector, and the residual

The status quo (once un-gated) injects the summary as a plain `## Latest daily log`
section **indistinguishable from the trusted identity/instructions blocks** it sits
beside — instruction-adjacent trusted context. The fence changes the semantic frame
to explicitly-labeled untrusted data; the content is already a *summary* (filtered
through a summarization step, not raw attacker bytes), bounded, and not a live
`tool_result` the model is mid-action on. This materially reduces injection risk
relative to the status quo, at zero cost to any daily-note writer.

**Accepted residual.** A fence is a **soft** boundary: a sufficiently adversarial
summary could still attempt to steer the model, and SessionStart context is read as
context. The blast radius is bounded (one labeled, byte-capped section). Full
elimination requires the deferred entry-level provenance. This residual is accepted
for the un-freeze; the alternative is keeping `daily-summary-injection` closed.

## Consequences

- `renderDigest` is the single chokepoint for the daily `## Summary`, so every
  consumer of its output (SessionStart injection and any managed-block compile)
  inherits the fence — the fix is made once, at the source.
- The frozen default is unchanged: with the gate blocked, the daily block is still
  omitted entirely (golden-frozen). The fence is visible only under the allowed
  profile (this release and the test code seam).
- Implemented by **WP-daily-summary-untrusted-fence**. Entry-level daily provenance
  remains a named future WP that would let trusted-authored daily lines inject
  un-fenced.

## Alternatives considered

- **Keep the gate closed.** Rejected for the un-freeze goal, but the owner may
  choose it at the Codex gate if the soft-fence residual is unacceptable.
- **Omit-unless-`false` / stamp-`false`.** Both rejected above (feature-off / a lie).
- **Full entry-level provenance now.** Correct end-state, out of scope for a blocker
  fix-pass (large cross-cutting contract; deferred).
- **Secret-scan-only (status quo).** Rejected: a secret scan does not detect
  instructions; it is not an injection defense.
