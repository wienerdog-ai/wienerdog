---
title: Round zero — template conformance (raw), WP-dream-write-fence-control-files
date: 2026-08-20
---

# Round zero — template conformance (raw)

Executor: clean-context general-purpose agent. Inputs: exactly two files —
`docs/specs/_TEMPLATE.md` and `docs/specs/WP-dream-write-fence-control-files.md`.
No repository exploration, no external reviewer. Spec under review at commit
`b009e34`. Output below is verbatim.

---

# Template conformance check — WP-dream-write-fence-control-files

## Section verdicts

| Template section | Verdict | Evidence (spec line) |
|---|---|---|
| `# WP-<slug>: <title>` (H1) | PRESENT | 12 |
| Authoring-rules bullet (template line 14-15, sub-H1 note) | SILENTLY ABSENT | — |
| `## Context (read this, nothing else)` | PRESENT | 14 |
| `## Current state` | PRESENT | 60 |
| `## Deliverables (permission boundary — touch ONLY these)` | PRESENT | 128 |
| `### Exact contracts` | PRESENT | 142 |
| `## Contract reference (optional — mark N/A if this WP is not contract-dense)` | PRESENT (heading shortened to `## Contract reference`; activation stated, 3-of-7) | 165, 167-170 |
| `### Contract table(s)` | PRESENT (renamed/split into three: `### Table A — the control-file fence (rules 1 and 2)`, `### Table B — the git seam`, `### Table C — the layout dot rule`) | 172, 191, 204 |
| `### Mirrored Surface Checklist` | PRESENT | 216 |
| `## Implementation notes & constraints` | PRESENT | 226 |
| `## Security checklist (delete only if the WP touches no untrusted input)` | PRESENT (heading shortened to `## Security checklist`) | 251 |
| `## Acceptance criteria` | PRESENT | 306 |
| `## Verification steps (run these; paste output in the PR)` | PRESENT | 340 |
| `## Out of scope (do NOT do these)` | PRESENT | 362 |
| `## Definition of done` | PRESENT | 380 |

Notes on the two renamed headings: `## Contract reference` and `## Security checklist` drop the template's parenthetical, which is instructional text rather than part of the section name. `### Contract table(s)` appears as three named per-contract tables (the template says "One canonical table per dense contract").

## Frontmatter

| Template field | In spec? | Spec value | Note |
|---|---|---|---|
| `id` | yes | `WP-dream-write-fence-control-files` | matches filename |
| `title` | yes | verb-first ("Deny the dream…") | |
| `status` | yes | `Draft` | in enum (Draft \| Ready \| In-Progress \| In-Review \| Done \| Superseded) |
| `model` | yes | `opus` | in enum (sonnet \| opus) |
| `size` | yes | `M` | in enum (S \| M); L not used |
| `depends_on` | yes | `[]` | |
| `adrs` | yes | `[ADR-0004, ADR-0025]` | |
| `epic` (optional, commented in template) | yes | `audit-2026-07-29` | allowed optional field, uncommented |

No spec-added fields beyond the template's list. No template field missing.

## Spec-only sections (additions, not judged)

- None at `##` level.
- At `###` level: `Table A — the control-file fence (rules 1 and 2)`, `Table B — the git seam`, `Table C — the layout dot rule` — these occupy the template's `### Contract table(s)` slot rather than adding a new section.
- Non-heading additions: prose bullets appended after the "Verification steps" code block (lines 354-360) and after the Deliverables HTML comment; these sit inside template sections.

## Rule E1 — idempotence criterion

Addressed, in the positive form (not `N/A`). Line 335-337: "Running the dream twice is idempotent with respect to this WP: a second run over the same denied write produces the same denial and the same report line, with no accumulated state." The criterion is scoped ("with respect to this WP") rather than the template's literal wording, but it is present as a criterion and not omitted.

## Rule E2 — Security checklist

Present, lines 251-304, six checklist items with real content. Not deleted, not `N/A`.

## BLOCKING

- **Authoring-rules bullet SILENTLY ABSENT.** The template places, immediately under the H1 (template lines 14-15), the bullet: "Authoring rules live in `docs/runbooks/spec-authoring.md` — the template gives the skeleton, the runbook the rules. Read both." The spec goes from H1 (line 12) straight to `## Context` (line 14) with no such bullet and no `N/A` line. (The runbook is cited later, at line 356, inside Verification steps — but not in the template's slot.)

If that bullet is judged boilerplate rather than a section, then: **No blocking items** among the `##`/`###` sections — every template section is PRESENT with real content; none is `N/A`-marked and none is silently absent.
