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

## Round zero (ran on `612edd2`; fixes landed in `ef4d139`)

- Template conformance: clean-context executors (fresh agents, inputs = spec +
  `_TEMPLATE.md` only, no part in drafting): **both specs CONFORMANT**, no
  silently absent section; two explicit N/A lines each, properly reasoned.
- Internal coherence pass (per spec, every runnable Current-state claim re-run
  on the tree, ranges checked at both ends): **14 findings** — 6
  contradictions (Table B placement window vs its own "On live" row; header-doc
  edit vs "no other change"; WP-B/ADR-0041 describing WP-A as "already merged"
  on a tree where it is Draft; a fabricated "ADR-0028 Table D" citation shared
  by both docs; ADR-0027/0031 used substantively but unregistered in
  frontmatter), 6 stale citations/counts (`:8-10`→`:10-11`; ADR-0018 Decision 2
  `:165-179`→`:166-180` family-wide; `install-smoke.yml:9-10`→`:11`; 61→66
  lines; the 16-attempt figure marked quoted-not-re-measured), 2
  non-discriminating verification arms (`! bash` passing vacuously on a missing
  probe — bash exits 127, negation reads success; the CLEAN arm asserting
  nothing). All 14 dispositioned **fix**; applied by wd-architect in
  `ef4d139`, each corrected citation re-read at both ends. Two soft notes also
  closed (numstat gate for the one-line sandbox-guard edit, red-on-absent
  verified; containerized-CI HOME=passwd-home row). One naming change beyond
  findings, recorded: WP-B's "Table D" renamed "Table R" to keep the phantom
  citation from regenerating.
- Notable substantive correction (finding 10): ADR-0028 §3's real rule is
  narrower than the drafted citation claimed, and `WIENERDOG_ALLOW_REAL_SCHEDULER`
  **is** A7-producible (`0028:502`, `:523-525`). The design argument now rests
  on the variable's ceiling (it can only restore today's unconditional
  behavior), not on its provenance.

## Rounds

| Round | Backend | Raw output file | Raw committed in | Verdict / findings | Dispositions |
|-------|---------|-----------------|------------------|--------------------|--------------|
| 1 (gate) | Codex plugin (`adversarial-review`, branch vs main, on `ef4d139`) | `2026-08-31-issue-169-gate-raw-round1-codex-plugin.txt` | `4faadec` | needs-attention; 4 findings (2 high, 2 medium); all citations spot-checked accurate | all 4 FIX, owner-ratified 2026-08-31 with rulings D1 (coherence+opt-in), D2 (soft refusal + uninstall authority gate), D3 (relocated = named residual); applied in `24047be` |
| 1 (shadow, comparison only) | herdr-spawned codex, hermetic `~/.codex-review-home`, read-only, same target | `2026-08-31-issue-169-gate-raw-round1-herdr-shadow.txt` | `6866c6f` | needs-attention; 7 findings — its 2/3/4/7 match the gate's 1/3/2/4; its 1/5/6 new | S5 FIX (evaluation-failure refusal line), S6 FIX (rc-capture verification arms), S1 FIX as boundary doc + named residual (no detection mechanism); applied in `24047be` |
| 2 (gate) | Codex plugin, branch vs main, on `24047be` | `2026-09-01-issue-169-gate-raw-round2-codex-plugin.txt` | `16b0b1f` | needs-attention; 3 findings (1 high, 2 medium); round-1 fixes confirmed material | all FIX, owner-ratified 2026-09-01; applied in `24e24d2` |
| 2 (shadow, comparison only) | herdr-spawned codex, same target | `2026-09-01-issue-169-gate-raw-round2-herdr-shadow.txt` | `c9a991b` | needs-attention; 6 findings — its 2/3/6 match the gate's 1/2/3; its 1/4/5 new | S1 FIX overclaim + residual R-failed-unload; S4 residual R-probe-race (owner-accepted); S5 FIX (full override matrix); applied in `24e24d2` |
