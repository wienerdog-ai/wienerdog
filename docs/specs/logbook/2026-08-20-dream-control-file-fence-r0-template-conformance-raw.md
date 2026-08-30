---
title: Round zero — template conformance (raw), WP-dream-control-file-fence
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- Verbatim executor output — EVIDENCE, never reformatted. -->

# Round zero — template conformance (raw), C1

Executor: clean-context general-purpose agent that took no part in drafting.
Inputs: exactly two files — `docs/specs/_TEMPLATE.md` and
`docs/specs/WP-dream-control-file-fence.md`. No repository exploration, no external
reviewer. Spec under review at commit `e33d34e`.

## Verbatim output

---

# Template conformance check — WP-dream-control-file-fence.md

## Section table

| Template section | Verdict | Evidence (spec line) |
|---|---|---|
| H1 `# WP-<slug>: <title>` | PRESENT | 16 |
| Bullet pointing at `docs/runbooks/spec-authoring.md` (immediately under H1) | PRESENT | 18–19 |
| `## Context (read this, nothing else)` | PRESENT | 21 |
| `## Current state` | PRESENT | 68 |
| `## Deliverables (permission boundary — touch ONLY these)` | PRESENT | 100 |
| `### Exact contracts` | PRESENT | 112 |
| `## Contract reference (optional — mark N/A if this WP is not contract-dense)` | PRESENT (heading shortened to `## Contract reference`) | 130 |
| `### Contract table(s)` | ADDITION/RENAME — no heading with this literal text; replaced by three named `###` tables (Table A / B / C) | 137, 161, 174 |
| `### Mirrored Surface Checklist` | PRESENT | 187 |
| `## Implementation notes & constraints` | PRESENT | 198 |
| `## Security checklist (delete only if the WP touches no untrusted input)` | PRESENT (heading shortened to `## Security checklist`) | 224 |
| `## Acceptance criteria` | PRESENT | 263 |
| `## Verification steps (run these; paste output in the PR)` | PRESENT | 303 |
| `## Out of scope (do NOT do these)` | PRESENT | 323 |
| `## Definition of done` | PRESENT | 338 |

Note on `### Contract table(s)`: the template's comment says "One canonical table per dense contract"; the spec supplies three, each under its own `###` heading with a descriptive name instead of the literal template heading. Recorded as a heading-text deviation, not a missing section — the content the heading is a container for is present.

## Frontmatter table

| Template field | In spec? | Value | Check |
|---|---|---|---|
| `id` | yes (line 2) | `WP-dream-control-file-fence` | matches filename `WP-dream-control-file-fence.md` — OK |
| `title` | yes (3) | "Deny the dream every control-file write, over the set the run actually commits" | verb-first — OK |
| `status` | yes (4) | `Draft` | in enum (Draft/Ready/In-Progress/In-Review/Done/Superseded) — OK |
| `model` | yes (5) | `opus` | in enum (sonnet/opus) — OK |
| `size` | yes (6) | `M` | in enum (S/M; L forbidden) — OK |
| `depends_on` | yes (7) | `[]` | present |
| `adrs` | yes (8) | `[ADR-0004, ADR-0025]` | present |
| `epic` (optional, commented in template) | yes (9) | `audit-2026-07-29` | optional field, legitimately uncommented |

Spec-only frontmatter fields not in the template: none.

## Spec-only sections (additions, unjudged)

- `### Table A — the fence` (137)
- `### Table B — preservation before destruction` (161)
- `### Table C — residue, and the between-runs gate` (174)
- Two unbulleted prose notes appended after the Verification-steps code fence (315–321), explaining the new assertion. Not a heading; noted as content the template does not scaffold.

## Mechanical rule checks

1. **Runbook bullet under H1** — PRESENT, lines 18–19, byte-equivalent to the template's wording.
2. **Idempotence criterion** — ADDRESSED, not omitted and not `N/A`-marked. Line 298–300 asserts it applies ("this package changes a command that writes outside the repo") and restates the criterion in package-specific terms, with an explicit carve-out for the report's per-run append.
3. **Security checklist "delete only if the WP touches no untrusted input"** — section PRESENT (224) and retained. The template's untrusted-identifier item is not deleted; it is restated in adapted form at 226–234 and explicitly declared applicable ("applies and is satisfied by the surrounding code"). The template's literal checkbox text is replaced by spec-specific prose.
4. **Contract reference activation count** — STATED. Line 132–135: "Four of seven," naming conditions **(ii)** taxonomy, **(iv)** reason-code/revert/failure behavior, **(v)** authority boundary (next run's CLI owns the residue state), **(vi)** multiple downstream consumers (report, CLI summary, C2/C3 successors). ≥2, so the section is correctly filled rather than `N/A`-marked.

## BLOCKING

No blocking items. No template section is silently absent.
