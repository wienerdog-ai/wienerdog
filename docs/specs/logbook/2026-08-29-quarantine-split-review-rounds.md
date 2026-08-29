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
| 0 | `77a41f9` | `2026-08-29-quarantine-split-round-zero-raw.md` @ (this commit — SHA cited in round 1's row once it exists, since a record cannot cite its own hash) | 16 findings: 15 LIGHT, 1 HEAVY; dispositions proposed, owner ruling pending |
