---
title: Design-review rounds — the quarantine surface split
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Design-review rounds — the quarantine surface split

Docs under review: the four `quarantine-surface` specs plus ADR-0023
Amendment 2 (only). Round zero (template conformance + internal coherence):
`2026-08-29-quarantine-split-round-zero.md`. Backend: gptsol agent, vendored
prompt `docs/runbooks/review-prompts/adversarial.md`, per the runbook contract.

## Stop criterion (pinned before round 1)

- **The loop CLOSES** when an external round returns zero findings about the
  product — the contracts an implementer builds from: surface texts, refresh
  triggers, the decay mechanism, the ADR invariant. Machinery findings
  (gates, test wording, citations) at that point are fixed within the existing
  verification surface or accepted as named residuals; they do not extend the
  loop.
- **A HEAVY fix** (changes what the implementer builds) triggers one fresh
  external round on the revised text, and this criterion is re-stated in that
  round's row.
- **The loop ESCALATES to the owner as a design question** — never another
  textual patch — when two consecutive rounds land findings of the same kind,
  or when a finding's only honest fix re-imports a property the ratified
  design deliberately excluded (enumeration outside the vault file, a
  permanent informational banner, an ack mechanism, partial reads of oversized
  files). Those four exclusions are owner rulings from the 2026-08-29
  walkthrough; a reviewer disagreeing with one files a scope objection, which
  routes to the owner and does not count toward the verdict.
- The verification surface is FROZEN per the runbook: machinery may grow only
  to guard a product behavior, in the smallest form that guards it.

## Round table

| Round | Input tip | Raw output (path, introducing commit) | Verdict |
|---|---|---|---|
| 0 | `77a41f9` | `2026-08-29-quarantine-split-round-zero-raw.md` @ `9fb4b63` | 16 findings: 15 LIGHT, 1 HEAVY; owner ruled all 16 **fix**, finding 14 → write-if-absent (option 1) |
| revision | `c284e8d` → `1d402ae` | (wd-architect pass; per-finding edits in its report, relayed in-session) | all 16 applied. Mirror walk by the orchestrator on `1d402ae`: corrected citations resolve (doctor.test.js:45, doctor.js:345, ledger.js:293, vault-write.js:169, validate.js:1211/:1223/:1411/:1427-1429), zero stale remnants by grep, ADR signature line byte-identical, retype gate proven GREEN today / RED on a planted backtick. NOTE for the owner: the signed Amendment 2 body changed post-signature (§1 write-if-absent clause; invariant re-worded to per-record `updated_at`) — re-affirmation required before dispatch |
| 1 | `8c09a5e` | `2026-08-29-quarantine-split-round-1-raw.md` @ `496044c` | needs-attention, 4 findings (orchestrator verified all four against the cited passages; two carried executed probes): (1) warnings rewrite trigger blind to same-key reason/size change — HEAVY, **fix** (content-snapshot trigger; run log stays membership-delta); (2) `stillQuarantined` from run-start set size double-counts / miscounts — HEAVY, **fix** (derive from actual `skip-quarantined` selections; scratch.js enters deliverables); (3) warnings commit path relies on `precommitSessionEdits`, which Ready `WP-dream-promote-in-workspace` removes and whose G8 excludes the file — HEAVY, **fix, owner ruled direction 1**: promote-in-workspace gains `depends_on: WP-quarantine-warnings-file` and G8 explicitly inherits committing the code-owned warnings file (scoped reopen of that Ready spec; re-verified in round 2's focus text); (4) PROVISIONAL dispatch-substitution cannot override the CI permission boundary — LIGHT, **fix** (the spec itself is re-derived at dispatch by wd-architect; markers removed then). Zero scope objections. All four ruled by the owner 2026-08-29, this session |
| revision 2 | `af542fb` → `b2e78c0` | (wd-architect pass; per-finding edits in its report, relayed in-session) | all 4 applied. Finding 1: Table C gains a content row — membership decides the Run log, a byte-compare of the rendered Current-conditions block (`renderConditions`, new pure export) decides the rewrite. Finding 2: `stillQuarantined` = the files `selectState` actually returned `'skip-quarantined'` for (`sel.skippedQuarantined`); scratch.js + dream-collect tests enter Deliverables, rows marked STABLE vs the promote rewrite. Finding 3 (direction 1): promote-in-workspace touched at exactly six sites (frontmatter dep, dispatch precondition incl. one adjacent falsified claim, G8 clause-one contradiction fix, G8 third clause inheriting the code-owned warnings file, checklist bullet, acceptance criterion). Finding 4: PROVISIONAL mechanism now re-derives THE SPEC at dispatch; the message records only the SHA. ADR Amendment 2 §1 re-worded to rendered-content trigger — SECOND post-signature change, owner re-affirmation required. Orchestrator mirror walk on `b2e78c0`: all key edits verified by grep, signature line intact, tree clean. Named residual carried into round 2's focus: `WP-dream-promote-module.md:353` Table E's "only promoted paths" shorthand vs G8's three-item commit |
