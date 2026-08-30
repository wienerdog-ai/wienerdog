---
title: Round zero — template conformance (raw), WP-dream-gate-inputs-baseline-delta
date: 2026-08-21
---

# Round zero — template conformance (raw)

Spec under review: `docs/specs/WP-dream-gate-inputs-baseline-delta.md` at commit
`36d3ac2`. Base tree: `main` @ `e648284`. Run in a clean context per
`docs/runbooks/codex-review.md` → "Template conformance (round zero)": a general
executor that took no part in drafting, given exactly two inputs — the spec and
`docs/specs/_TEMPLATE.md` — and instructed to read nothing else and to judge
conformance only, never design. Raw output below; dispositions live in the round
record. Line numbers are the reviewer's, against `36d3ac2`.

## A. Section diff

| # | Template section | Status |
|---|---|---|
| 1 | Frontmatter block | PRESENT — L1–10 |
| 2 | `# WP-<slug>: <title>` heading | PRESENT — L12 |
| 3 | Authoring-rules bullet | PRESENT — L14–15 |
| 4 | `## Context (read this, nothing else)` | PRESENT — L24 |
| 5 | `## Current state` | PRESENT — L64 |
| 6 | `## Deliverables (permission boundary — touch ONLY these)` | PRESENT — L111 |
| 7 | `### Exact contracts` | PRESENT — L126 |
| 8 | `## Contract reference` | PRESENT — L145 (instruction parenthetical dropped from the heading — non-blocking) |
| 9 | `### Contract table(s)` | RENAMED-PRESENT — L153 / L167 / L185 as `### Table A/B/C …`; no literal `### Contract table(s)` heading. The template asks for one canonical table per dense contract; three exist |
| 10 | `### Mirrored Surface Checklist` | PRESENT — L198 |
| 11 | `## Implementation notes & constraints` | PRESENT — L213 |
| 12 | `## Security checklist` | PRESENT — L238 (instruction parenthetical dropped — non-blocking) |
| 13 | `## Acceptance criteria` | PRESENT — L256 |
| 14 | `## Verification steps (run these; paste output in the PR)` | PRESENT — L296 |
| 15 | `## Out of scope (do NOT do these)` | PRESENT — L318 |
| 16 | `## Definition of done` | PRESENT — L341 |

**Silently absent sections: none.** Nothing blocks the round on absence.

Extra content the template does not define, named: the "Dispatch precondition"
block (L17–22, unheaded bold paragraph) and the post-fence commentary under
Verification steps (L311–316). Both allowed.

## B. Frontmatter

Every declared key present and in range: `id` matches the filename; `title` is
verb-first; `status: Draft`; `model: opus`; `size: M` (**not** the forbidden `L`);
`depends_on: []`; six `adrs`; optional `epic` set. **Zero blocking items.**

## C. Template-driven obligations

1. Deliverables table — HONOURED. Literal "permission boundary — touch ONLY these"
   framing; `Action | Path | Notes` columns exactly as the template.
2. Contract-reference activation — HONOURED. Four of the seven criteria named by
   their template numerals — (i), (iii), (v), (vi) — each with a one-clause
   argument. Exceeds the 2-of-7 bar; correctly not `N/A`'d.
3. Mirrored Surface Checklist — HONOURED. Seven entries, each naming a specific
   mirror in this spec rather than the template's generic placeholder list.
4. Security checklist — PRESENT, not deleted. Item 1 engages the template's
   untrusted-identifier rule and answers both halves.
5. Acceptance criteria — HONOURED. Eleven assertion-shaped items; the template's
   idempotence item is `N/A`'d **with a reason**, in the prescribed form.
   Non-blocking observation: L258 embeds a Ready-gate condition inside a criterion
   — unusual shape, still binary.
6. Verification steps — HONOURED. Four `npm` invocations plus three shell
   assertions; no prose-only step inside the fence.
7. Definition of done — HONOURED. All five template items present, in order, four
   of them verbatim; item 1 extends the template (green **and** deliberately-broken
   red) rather than omitting anything.

## D. Verdict

**CONFORMANT — 0 blocking items, 3 non-blocking observations** (the `Table A/B/C`
heading rename, two dropped instruction parentheticals, two extra unheaded blocks).
