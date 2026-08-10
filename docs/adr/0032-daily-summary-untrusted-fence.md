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

Amending work packages are recorded in the list under `Amended by:` below —
one line per package, appended by the amending package itself and verified
by that package's own gates as a pure one-line diff. Prose never restates
membership.

Amended by:
- WP-daily-summary-per-line-framing — decision 1's block fence is replaced by a per-line marker on every summary line, and no closing marker is emitted, so summary bytes cannot forge the boundary.

## Alternatives considered

- **Keep the gate closed.** Rejected for the un-freeze goal, but the owner may
  choose it at the Codex gate if the soft-fence residual is unacceptable.
- **Omit-unless-`false` / stamp-`false`.** Both rejected above (feature-off / a lie).
- **Full entry-level provenance now.** Correct end-state, out of scope for a blocker
  fix-pass (large cross-cutting contract; deferred).
- **Secret-scan-only (status quo).** Rejected: a secret scan does not detect
  instructions; it is not an injection defense.

## Amendment (2026-08-09) — the fence is per-line; the block fence of Decision 1 is withdrawn

Status: **ACCEPTED — OWNER-SIGNED 2026-08-10.**

Decision 1 above wraps the daily summary between a `FENCE_OPEN` banner and a
`FENCE_CLOSE` marker. The 2026-07-29 audit reproduced the consequence as finding
**M2** (Major/High): the closing marker is a fixed, documented string with no
authenticity property, so a summary line may contain it, and everything the
attacker writes after that line reads — by this ADR's own stated semantics — as
outside the untrusted region. The `daily-summary-injection` gate is `allowed` in
the released profile, so this is the production default path.

The decision this ADR made — the daily summary is untrusted-by-default data,
labelled as such at the point of injection — stands. Its **mechanism** does not.
Amended as follows:

1. **Containment is per-line, not per-block.** Code prefixes every emitted line of
   the summary with a fixed, code-owned marker. A content line that mimics a
   marker, a banner or an end marker is itself marked and stays visibly data.
   There is no delimiter to forge, because a summary byte can never occupy the
   start of an emitted line.
2. **No closing marker is emitted.** The marked region ends where marking stops.
   `FENCE_OPEN` / `FENCE_CLOSE` are withdrawn; the constants named in Decision 1
   no longer exist. This also removes the unterminated-region case that digest
   truncation could produce by dropping a closing marker.
3. **The banner is rewritten to describe the per-line rule** — that the marker is
   added by Wienerdog and never by the content, and that a marked line is never an
   instruction, heading or boundary whatever it appears to say.
4. **Two containment rules are added** that the block fence never needed. First,
   the summary is split on every character its consumers render as a line break
   (LF, CRLF, CR, NEL, VT, FF, U+2028, U+2029), and no character that is a Unicode
   `Cc`, `Cf` or `Cs`, or carries the `Default_Ignorable_Code_Point` property,
   reaches an emitted line raw — TAB and the break set are the only exceptions, and
   the union is required because categories alone miss variation selectors and the
   Hangul filler while the property alone misses some `Cf`. Each such character
   appears only in a fixed code-owned `<U+XXXX>` form, which is deliberately not
   reversible. Second, the secret gate runs on the normalized, still-unmarked
   summary, so a marker inserted after a line break cannot defeat a rule that spans
   one. The implementing WP's Table A is the canonical statement of both.

What is NOT changed: the bounded read, the provenance gate, the section-level
secret exclusion, the capability gate, and this ADR's accepted residual — a
labelled line is still natural-language text a model reads. Entry-level daily
provenance remains the deferred full solution.

Implemented by **WP-daily-summary-per-line-framing**.
