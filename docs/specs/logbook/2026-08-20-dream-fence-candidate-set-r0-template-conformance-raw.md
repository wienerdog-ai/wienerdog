---
title: Round zero — template conformance (raw), WP-dream-fence-candidate-set
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim executor output — EVIDENCE, never reformatted. -->

# Round zero — template conformance (raw), EYE

Executor: clean-context general-purpose agent that took no part in drafting. Inputs:
exactly two files — `docs/specs/_TEMPLATE.md` and `docs/specs/WP-dream-fence-candidate-set.md`.
No repository exploration, no external reviewer. Spec read at commit `4221a62`
(the split commit), **before** the round-zero fix landed.

The verbatim report is preserved in the agent transcript; its verdicts are
transcribed below in full, including the one blocking item.

## Verdicts

**BLOCKING: none. No template section is silently absent.**

`### Contract table(s)` was reported as a heading-text deviation only — three named
`###` tables occupy the slot, at the same level and in the same position, between the
activation prose and the Mirrored Surface Checklist. Reported without judgment.

Frontmatter: all eight fields present, `id` matches the filename, `status: Draft` and
`size: M` both in enum, `depends_on: [WP-dream-denied-object-disposal]` — the single
dependency on the HAND package — and `epic: audit-2026-07-29`. No spec-added fields.

Mechanical checks: the `spec-authoring.md` bullet under the H1 is PRESENT and
byte-identical; the idempotence criterion is ADDRESSED with a stated carve-out for the
report's per-run append; the Security checklist is PRESENT with seven items; the
Contract reference states its activation as 4 of 7, naming (ii), (iv), (v), (vi).

Also noted without judgment: two prose bullets after the Verification-steps code block,
and a sixth Definition-of-done item (the stacked-merge discipline).
