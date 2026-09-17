---
date: 2026-09-17
title: "Maintainer feedback on WP-dream-primary-dialogue-filter: adopt the direction, split the package"
related_wps: [WP-dream-primary-dialogue-filter, WP-dream-filtered-input-budget, WP-dream-report-run-skips]
---

# Maintainer feedback: WP-dream-primary-dialogue-filter

## Status of this record

The spec arrived upstream with PR #245 as `status: Draft`, held for
maintainer feedback. Its design-review logbook entry
(`2026-09-17-dream-primary-dialogue-filter-design-review.md`, "Maintainer
handoff draft — not sent") asks four questions. This entry answers them.

**Authority.** The analysis below was prepared by the orchestrator session and
reported to the upstream owner, who answered: *"as for the rest of your points,
execute them in your proposed order."* (verbatim record:
`2026-09-17-owner-rulings-felho-integration-3.md`). The proposed order included
the split described here. That adopts the **direction** — split, projection
first, relevance stage gated on evidence. It is **not** a line-by-line
ratification of every sentence below, and nothing here moves the spec to
`Ready`.

## The short answer

The direction is right and the evidence behind it is good. The packaging is
not: the spec builds the expensive, unmeasured half before the evaluation that
would say whether it is needed. Split it.

- **Part 1 — primary-dialogue projection.** Tables A and B. Deterministic, no
  model call, no new authority surface.
- **Part 2 — relevance stage.** Tables C and D. A second supervised model stage.
  Built only if an offline evaluation of Part 1's output shows that the
  remaining low-value volume is a real problem.

## Answers to the four questions

### 1. Is the scope feasible as one M work package?

No. Twenty-one deliverable files, four contract tables and eleven ADRs is not
an M in this repo; `WP-dream-filtered-input-budget` was an M with roughly half
the surface. More important than the size is the order of evidence. The
2026-09-16 assessment measured, on 187 reparsed sessions:

| Measurement | Value |
| --- | ---: |
| Normalized `user` characters | 3,071,245 |
| …of which Codex developer messages (first 4,000 chars each) | 1,653,850 |
| Normalized `tool_result` characters | 221,918 |
| Assistant characters (includes intermediate progress) | 469,970 |

More than half of what the dream is told is "the user speaking" is harness
boilerplate. Table A removes that, the tool results and the intermediate
assistant updates with code alone. What Part 2 adds on top of that is
unmeasured — the scope record says so itself ("Whether filtering is beneficial
remains to be measured: it adds its own model work and can discard important
information"). As written, AC5's offline evaluation runs only after the
runtime profile, the watchdog generalization and the descriptor binding have
all been built. Run the evaluation between the two parts instead.

### 2. Are the source rules acceptable, and is an ADR amendment needed?

The rules are acceptable. A5's conservative, never-resetting taint is the right
call, and the round-1 finding that produced it was a good catch. B2's
code-owned, text-free gate projection is the right separation: the model loses
sight of tool records, the authorization gate does not.

Yes, it needs an ADR amendment before `Ready`. B3 changes what the model sees
when it looks for skill learnings; that is a durable policy under ADR-0020, not
an implementation detail, and it should be signed.

Two consequences should be written down so they are accepted knowingly:

- **Headless routine sessions collapse to prompt plus closing report.** A
  scheduled digest or a routine run is one prompt and one final answer; every
  operational detail between them (refusals, retries, timings, which step
  printed what) lives in tool records and disappears from the dream's view.
  That is probably the right trade, but it is visible: the upstream owner's
  daily notes currently carry exactly that kind of detail.
- **A routine's prompt is code-authored, yet A2 classifies it as verified user
  text.** A `claude -p` prompt is an ordinary non-meta `user` record. The risk
  is low — it is Wienerdog's own text, and A5 still taints the assistant's
  conclusion once tool output is observed — but "verified primary user text"
  should not be read as "a human typed this".

### 3. Are Table C's limits and the keep-original fallback a reasonable first experiment?

Defer them with Part 2. If Part 2 is built, keep-original is the correct
failure direction and the limits are reasonable starting values. Note what C3
implies at the default X: 300 seconds of sequential calls at up to 30 seconds
each filters on the order of one to four megabytes, so a full 8 MB batch is
mostly unfiltered. That is an honest tradeoff, and it is also a reason to
measure before building.

### 4. Is X-before-filter with no backfill the right initial tradeoff?

Yes, and for a reason the spec should state. The assessment's central finding
(F1) is that every admitted session is marked processed whether or not the
consolidation agent read it: on the measured night, 198 were marked processed
and the agent read 20 in full. X is a byte bound and there is no bound on the
number of sessions. Backfill would hand the agent still more files to not
read.

**Part 1 already moves in that direction on its own.** Projection shrinks each
extract, so more sessions fit inside the same X, and all of them are marked
processed. On an install that dreams a dozen sessions a night this is
irrelevant. On an install with a five-figure backlog it means more sessions
retired unread per night than today. Part 1 does not have to fix F1, but it
must not make it silently worse: it should report the admitted session count
before and after projection on a representative backlog, and state what it
does about the difference — a lower default X, a session-count bound, or an
explicit decision to accept it.

## Two smaller points

- **Strike the process sentence in Context.** "Native Codex agents may perform
  the repository's named architect/reviewer roles … the historical external
  `gptsol` transport is not required" amends the review runbook from inside a
  work package. Upstream, `docs/runbooks/codex-review.md` governs which
  backends may run a gate, and a backend counts only after its own
  both-directions validation.
- **Re-pin the baseline late.** The spec pins `1c3790de`. Three packages ahead
  of it in the upstream queue edit `src/cli/dream.js`
  (`WP-dream-digest-omits-own-job-alerts`, `WP-dream-lock-stale-owner-loud`,
  `WP-dream-report-run-skips`), and the last also edits the collector's
  reporting. Re-derive Current state after they land, not before.

## What happens next

1. After the three dream-file packages ahead of it land, wd-architect splits
   the spec: Part 1 keeps Tables A and B and gains the admitted-count
   measurement; Part 2 keeps Tables C and D, depends on Part 1, and carries the
   offline evaluation as its **entry** condition rather than its exit
   criterion.
2. Part 1 goes through the design gate and the ADR-0020 amendment, then
   implementation.
3. The offline evaluation runs on Part 1's output. Part 2 is matured only if
   the evaluation calls for it.
