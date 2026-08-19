---
date: 2026-08-19
title: "WP-validator-decided-bytes round 0a — template conformance, raw output"
related_wps: [WP-validator-decided-bytes]
---

# Round 0a — template conformance (raw)

**Backend:** internal, clean context. The executor took no part in drafting and
was given exactly two inputs — `docs/specs/WP-validator-decided-bytes.md` and
`docs/specs/_TEMPLATE.md` — and instructed to read nothing else.
**Revision reviewed:** `5e90d31`, branch `wp/validator-decided-bytes`.
**Scope instruction given:** structural conformance only, explicitly NOT a
design critique; a silently absent template section blocks the round, a
present-but-shallow section does not.
**Read-only:** the executor was instructed to create, modify and delete
nothing. `git status --porcelain` was empty before and after.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

## Verdict
PASS

## Section-by-section table
| Template section | Status | Note |
|---|---|---|
| Frontmatter block | PRESENT | All 8 base fields + optional `epic` (uncommented, as template permits) |
| `# WP-<slug>: <title>` heading | PRESENT | `# WP-validator-decided-bytes: decide once, on the bytes that get committed` |
| Authoring-rules bullet (pointer to `docs/runbooks/spec-authoring.md`) | SILENTLY ABSENT (non-blocking) | Template scaffolding/instructional line, not a `##` section — see NB-1 |
| `## Context (read this, nothing else)` | PRESENT | 5 paragraphs + runnable repro |
| `## Current state` | PRESENT | File paths, line refs, six parse sites, existing test state |
| `## Deliverables (permission boundary — touch ONLY these)` | PRESENT | 3-row table + always-allowed comment retained |
| `### Exact contracts` | PRESENT | C1–C3, cite Tables A–C |
| `## Contract reference` | PRESENT | Activation shown (3-of-7); template's "(optional — mark N/A…)" suffix dropped from the heading, which is the intended behavior when filled |
| `### Contract table(s)` | PRESENT (renamed) | Realized as `### Table A`, `### Table B`, `### Table C` — three canonical tables, no literal `### Contract table(s)` heading |
| `### Mirrored Surface Checklist` | PRESENT | 6 checklist items, spec-specific rather than the template's generic five |
| `## Implementation notes & constraints` | PRESENT | 5 bullets incl. the template's "when uncertain" bullet verbatim in substance |
| `## Security checklist` | PRESENT | Not deleted; 4 items, first explicitly marks the template's untrusted-identifier item N/A with reason |
| `## Acceptance criteria` | PRESENT | AC1–AC9; AC9 carries the template's idempotence item |
| `## Verification steps (run these; paste output in the PR)` | PRESENT | bash block + a closing paragraph on green/red runs |
| `## Out of scope (do NOT do these)` | PRESENT | 5 bullets, each naming the owning WP/successor |
| `## Definition of done` | PRESENT | 5 numbered items, 1:1 with the template's five |

No template `##`/`###` section is silently absent.

## Structural property checks
- **Frontmatter completeness/ranges:** PASS. `id: WP-validator-decided-bytes` (kebab slug matching the filename `WP-validator-decided-bytes.md`); `title` is verb-first ("Reject a malformed…"); `status: Draft` ∈ {Draft, Ready, In-Progress, In-Review, Done, Superseded}; `model: opus` ∈ {sonnet, opus}; `size: M` ∈ {S, M} and not the forbidden L; `depends_on: []` list form; `adrs: [ADR-0004, ADR-0020, ADR-0022, ADR-0024, ADR-0031]` list form matching the `ADR-NNNN` shape; optional `epic: audit-2026-07-29` present and uncommented, which the template explicitly allows. No extra or missing keys.
- **Deliverables table shape:** PASS. Exactly the three template columns `| Action | Path | Notes |` with the same separator row. All three Actions are `modify`, drawn from create/modify/delete. The template's always-allowed HTML comment is retained (with an added `per scripts/boundary-check.js` attribution).
- **Contract reference filled vs N/A:** PASS — filled, not N/A. At least one contract table (three: Tables A, B, C) AND a `### Mirrored Surface Checklist` are both present. Activation is stated against ADR-0031's 2-of-7 with three criteria named ((iv), (v), (vi)), clearing the two-of-seven threshold.
- **Security checklist present vs deleted:** PASS — present, not deleted. It is not merely retained but adapted: the template's untrusted-identifier item is explicitly kept as an item and marked `N/A — this WP constructs no new filesystem path and no shell command`, with the reason given inline (paths come from `changedPaths`, sanitized in the unchanged `quarantinePreserve`). Because the section is present, the "deletion must be justified" flag does not apply.
- **Extra sections not in the template:** three, all informational (see NB-2).

## Blocking findings
none

## Non-blocking observations
1. The template's instructional bullet directly under the H1 — "Authoring rules live in `docs/runbooks/spec-authoring.md` — the template gives the skeleton, the runbook the rules. Read both." — does not appear in the spec. This is template scaffolding (a bullet, not a `##` section) and the template shows no other spec-visible content at that position, so it is not counted as a silently-absent section. Flagged only so the caller can decide whether that pointer is meant to survive into authored specs.
2. Sections/headings present in the spec that the template does not name literally: `### Table A — where a malformed block is rejected`, `### Table B — the read/decide/commit ordering`, `### Table C — the reason-string vocabulary`. These occupy the template's `### Contract table(s)` slot (one canonical table per dense contract, exactly as that slot instructs) and sit correctly between `### Exact contracts` and `### Mirrored Surface Checklist`. Informational only.
3. Heading-text divergences from the template, all cosmetic: `## Contract reference` drops the template's parenthetical `(optional — mark N/A if this WP is not contract-dense)`, which reads as intended once the section is filled; the H1 subtitle is a restatement rather than a copy of the frontmatter `title`, which the template's `# WP-<slug>: <title>` placeholder does not strictly permit but does not forbid either.
4. The template's `### Mirrored Surface Checklist` ships five generic bullet categories (Deliverables cells, acceptance criteria, verification greps, current-state description, operative prose). The spec replaces them with six spec-specific mirrors that map onto the same categories plus one extra (Security checklist). Substitution, not omission — the section is present with content.
5. The spec's Deliverables preamble comment adds `per scripts/boundary-check.js` to the template's wording. The listed always-allowed paths (this spec file, `package-lock.json`, `memory/lessons/inbox.md`, `docs/specs/logbook/`) match the template's list exactly. Not verified against the script itself — out of this check's two-file input scope.
