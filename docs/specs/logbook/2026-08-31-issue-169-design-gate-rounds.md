---
title: Design-gate round record — issue #169 spec family (smoke preflight + scheduler mutation authority + ADR-0041)
date: 2026-08-31
related_wps: [WP-smoke-live-scheduler-preflight, WP-scheduler-mutation-home-authority]
---

# 2026-08-31 — design-gate rounds, issue #169 family

Docs under review: `docs/specs/WP-smoke-live-scheduler-preflight.md`,
`docs/specs/WP-scheduler-mutation-home-authority.md`,
`docs/adr/0041-real-scheduler-mutation-is-opt-in.md` (+ its README row).
Drafted by wd-architect at `612edd2` on `docs/issue-169-specs` (base `a6e0803`).

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no HEAVY finding (nothing that changes what the implementer
builds in `src/` or the ADR contract) and every LIGHT finding is fixed within
the existing surface or accepted as a named residual by the owner. Repeated
same-family findings across two consecutive rounds escalate to a contract
extraction (ADR-0031), never a third patch round. Owner rulings that remain
open (the three parked OWNER DECISIONS in the draft) block `Ready` regardless
of round outcomes.

## Round zero

- Template conformance: clean-context executor per spec, inputs = spec +
  `_TEMPLATE.md` only. Result recorded below when run.
- Internal coherence pass: per spec, includes re-running every runnable
  Current-state claim on the worktree tree and checking cited ranges at both
  ends. Result recorded below when run.

## Rounds

| Round | Backend | Raw output file | Raw committed in | Verdict / findings | Dispositions |
|-------|---------|-----------------|------------------|--------------------|--------------|
