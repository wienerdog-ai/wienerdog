---
date: 2026-07-11
title: Automatic skill improvement chain
related_wps: [WP-040, WP-080, WP-081, WP-082, WP-083, WP-084]
---

# Automatic skill improvement chain (2026-07-11)

**Automatic skill improvement chain (2026-07-11, ADR-0020; hardened 2026-07-12).**
Closes the loop on dream-created skills: the dream already *creates* skills from
recurring patterns; this chain lets it *learn from* and *revise* them, under the
same recurrence bar, with transcript-poisoning defended in code. **Six rounds of
adversarial review (Codex; ADR-0020 Revision 2026-07-12) drove the chain to FIVE
WPs** — round 4 rejected an accepted residual and closed the pathway with code
(WP-084); round 5 reworked WP-084 from cited-message evidence to invocation-binding
+ window trust (relevance, not just existence); round 6 fixed the window's own-result
exclusion (positional → id-paired `resultIndex`) and index drift under the message
cap (WP-080 rebases). Split by code region; serial where they share `validate.js`. **Ordering: WP-080 and WP-083 are independent and land
first; WP-081 hard-depends WP-083; WP-084 hard-depends WP-080 + WP-081; WP-082
hard-depends WP-081, WP-083, WP-084.** **WP-080** (M, sonnet) fills the transcript-parser
gap: the Claude parser drops assistant `tool_use` blocks, so a `Skill` invocation
leaves no trace — it now emits a per-extract `skill_invocations`
(`[{skill, index, resultIndex, errored}]`) signal, with the skill name constrained
to a strict grammar `^[a-z0-9][a-z0-9-]{0,63}$` (no `input.command` fallback, no
`"unknown"`; non-conforming/absent → omitted) so a model-authored control-plane
identifier can't spoof or path-traverse downstream (**fix 5**). `index`/`resultIndex`
(the invocation's timeline position and its id-paired result, round-6) are rebased
under the message cap so a padded session can't hide a poisoned window. Codex needs
no change.
**WP-083** (S, opus, independent) is the new foundation: a tamper-proof ownership
registry `state/skill-registry.json`, written by `validateAndCommit` only when it
accepts a NEW dream-created draft (after the commit; ADR-0012 clean, ADR-0019
uninstall-swept, ADR-0004 no-process). Revision eligibility = path in the
registry; `HEAD`-frontmatter `origin: dream` is rejected as **forgeable** because
ADR-0012 commits session edits pre-brain (**fixes 1 underpin + 2**). The brain
sandbox (vault + scratch only) and interactive sessions can't write `state/`.
**WP-081** (M, opus) accumulates per-skill learnings into a sidecar
`<skills_dir>/<name>/LEARNINGS.md` (Pattern-Key dedup, distinct-session
recurrence, per-entry `derived_from_untrusted`, append-only) for registered
skills only. The ledger stays exempt from the Tier-3 numeric floor (it must record
single-session/untrusted observations) but — because it is ALSO WP-082's
authorization input — a **ledger validator** replaces the original blanket
exemption: registered parent, entry schema, append-only vs `HEAD`, raise-only
untrusted, unique well-formed Session-IDs with `Recurrence` == distinct count
(**fix 4**), plus round-3 monotonicity (Session-IDs append-only, Recurrence/
Last-Seen non-decreasing, Status open→resolved only). **WP-084** (M, opus,
depends WP-080 + WP-081) makes trust **mechanical, not asserted, AND relevance-
bound** (round-4/5/6): a counted Claude session must actually have invoked THIS
skill (WP-080's `skill_invocations`, carrying the invocation `index` + its id-paired
`resultIndex`), and `derived_from_untrusted` is DERIVED from the invocation
**window** (any EXTERNAL windowed `tool_result` — excluding exactly the id-paired
own result `messages[resultIndex]`, and failing closed on a null/out-of-range one —
→ untrusted; asserted flag raise-only) — killing the invented-session (round-4),
unrelated-real-session (round-5), and batched-tool / index-drift (round-6) attacks.
Per-message evidence citations were dropped as unnecessary. Codex sessions
accumulate but do not authorize (no structured signal; v1 scope limit — WP-082
counts `claude:` sessions only). **WP-082** (M, opus — the core) lets a later dream revise a
skill BODY only when the skill is registered AND the revised `SKILL.md` names a
`revision_pattern_key` whose learning, **as committed in `HEAD`**, has ≥ 3
orchestrator-recomputed distinct sessions and is not untrusted-derived (**fix 1**;
the trust flag it reads is now WP-084-verified);
patch-over-rewrite, WP-040 preservation code-enforced via `git show HEAD:<path>`.
Its injection defense is two-layered (**fix 3**): an **always-on deterministic**
revert suite in `npm test`/CI (no model — untrusted-authorizing and < 3-session
reverts), plus the EXPENSIVE real-brain canary (new `claude-skill-poison.jsonl`)
whose assertion now requires the injection's stable payload marker under the exact
`## Gated out (and why)` section (no generic-mention false pass). **Settled
(ADR-0020, do not re-litigate):** no pre-approval gate (revisions apply
automatically; report + `git revert` are rollback), no probation state in v1,
dormancy/staleness aging parked, dream-created-only scope. IRON RULE intact —
files plus the existing scheduled dream, no new process (ADR-0004); revisions ride
the single-commit dream lifecycle (ADR-0012).
