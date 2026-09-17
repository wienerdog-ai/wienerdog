---
date: 2026-09-17
related_wps: [WP-dream-primary-dialogue-filter]
---

# Primary dialogue filter: design review and maintainer handoff

## Scope and hold

The owner requested one bounded work-package specification using the repository
process, followed by feedback from the main developer before implementation.
No implementation, deployment, runtime reconfiguration, or upstream mutation is
authorized by this design exercise. Keep the spec Draft for that feedback and
subsequent owner sign-off; do not dispatch an implementer.

Working scope: primary user/concluding-assistant dialogue, a lightweight Sonnet
relevance filter, and the existing consolidation pipeline. No tool-evidence
access, coverage report, persistent partial sessions, completion-protocol
redesign, or runtime judge. Offline qualitative evaluation is sufficient; no
100% recall/coverage claim. The accepted direction and its evolution are in
[the scope record](2026-09-17-dream-primary-input-scope.md).

## Stop criterion, pinned before adversarial review

- Close the design-review loop when a fresh round has no supported in-scope
  product findings. Keep the spec Draft even when review is clean.
- Band A (silent wrong behavior/data loss/security) and band B (caught
  downstream) product findings require a proposed fix within the selected scope
  or an explicit maintainer/owner decision; do not silently accept residual risk.
- A HEAVY fix changes product behavior/contracts and requires a fresh external
  round. LIGHT verification/wording fixes are checked mechanically; band C
  hygiene alone does not justify another full external round.
- Findings that reintroduce excluded architecture, full-coverage guarantees, or
  a new reporting framework are scope objections, separately routed for owner
  consideration, not requirements silently added to this WP.
- Two consecutive rounds finding the same kind of gap reopen the design
  question for maintainer feedback; do not grow verification machinery or loop
  indefinitely. Draft revisions are proposals, not owner ratification.

## Review procedure

1. wd-architect drafts using the exact template and authoring runbook.
2. A fresh native agent checks template conformance with only the spec and
   template as inputs. A separate coherence pass verifies current-state claims
   and runnable checks against the named source baseline.
3. Independent native Codex design review uses the frozen adversarial prompt,
   scoped to the drafted docs. The owner previously authorized native Codex
   agents in place of the historical gptsol transport.
4. Review an immutable clean checkout. Record status before/after. Raw output
   is written outside it, copied verbatim into this logbook, and committed before
   the orchestrator reads or dispositions it. Each round below must name the
   reviewed SHA, raw artifact, and raw-introduction commit.
5. Record proposed dispositions with consequence bands and fix weights; do not
   label unimplemented behavior tested or an unresolved owner choice approved.

Native transport calibration precedent is retained in the September 15
filtered-input-budget native-calibration red/green raw artifacts in this folder.
This exercise does not change that backend or the frozen reviewer prompt.

## Current progress

- Product source baseline: `1c3790de9f88f40aa28202e6f47748500babd555`.
- wd-architect drafting in a separate worktree; production main remains unchanged.
- Template, coherence, and independent design gates have not yet run.
- Main-developer feedback and owner sign-off remain pending.

## Local format observations used during drafting

Content-free inspection of 35 local Codex transcript files from September 16
found user-record metadata `content_item_kinds` equal to `["user.text"]` in 60
records; 35 other records explicitly identify injected AGENTS/environment or
plugin-recommendation material. Assistant message phases included `commentary`
and `final_answer`. No `event_msg.user_message` appeared in that sample.

A broader 70-file sample found the first `session_meta.id` matched the filename
in all 70 files; 17 files included later metadata with another identity. Choosing
the last metadata record would therefore misidentify those files. These are
sample observations, not a claim of universal harness schema coverage.

The September 17 Claude dream trace has assistant text with `stop_reason:
tool_use` for progress output and `stop_reason: end_turn` for its concluding
reply. This supplies a concrete discriminator to examine in parser design.

Existing source requires an explicit nonempty runtime tool allowlist. Although
the installed CLI help now describes empty `--tools` differently, this WP must
not silently relax the repository's accepted hermetic-profile contract.
