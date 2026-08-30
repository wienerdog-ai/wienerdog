---
title: Round zero — template conformance (raw), WP-dream-denied-object-disposal
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim executor output — EVIDENCE, never reformatted. -->

# Round zero — template conformance (raw), HAND

Executor: clean-context general-purpose agent that took no part in drafting. Inputs:
exactly two files — `docs/specs/_TEMPLATE.md` and `docs/specs/WP-dream-denied-object-disposal.md`.
No repository exploration, no external reviewer. Spec read at commit `4221a62`
(the split commit), **before** the round-zero fix landed.

The verbatim report is preserved in the agent transcript; its verdicts are
transcribed below in full, including the one blocking item.

## Verdicts

Every template section PRESENT with real content, except:

- **`### Contract table(s)` — SILENTLY ABSENT (BLOCKING).** The heading does not
  appear anywhere in the spec and no `N/A — <reason>` line stands in its place. Three
  `###`-level tables (Table A/B/C) occupy the slot under different headings, but
  mechanically the template section heading is missing without an N/A marker.

Frontmatter: all eight fields present, `id` matches the filename, `status: Draft` and
`size: M` both in enum, `depends_on: []`, `epic: audit-2026-07-29` (permitted optional
field). No spec-added fields.

Spec-only sections: the three named tables, all under `## Contract reference`.

Mechanical checks: the `spec-authoring.md` bullet under the H1 is PRESENT and
verbatim; the idempotence criterion is ADDRESSED (not `N/A`), naming itself as the
template's criterion and asserting the WP writes outside the repo; the Security
checklist is PRESENT and engages the untrusted-identifier item explicitly; the
Contract reference states its activation as 4 of 7, naming (ii), (iv), (v), (vi).
