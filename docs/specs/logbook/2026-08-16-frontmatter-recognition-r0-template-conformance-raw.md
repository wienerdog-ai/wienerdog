---
date: 2026-08-16
title: "WP-frontmatter-recognition-failopen round 0a — template conformance, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 0a — template conformance (raw)

**Backend:** internal, clean context — a fresh executor that took no part in
drafting, given exactly two inputs (the spec and `docs/specs/_TEMPLATE.md`) and
instructed to read nothing else.
**Spec revision read:** `c07753c`.
**Committed BEFORE adjudication.** Nothing below was judged, paraphrased or
shaped before this file's commit existed.

Everything below the line is the executor's final message, verbatim.

---

ROUND ZERO — TEMPLATE CONFORMANCE
Verdict: PASS

| Template section | In spec? | Note |
|---|---|---|
| YAML frontmatter block | present | all template fields present; `epic` used (uncommented) |
| `# WP-<slug>: <title>` heading | present | slug matches filename; heading text after the colon differs from the frontmatter `title` value (see NB-1) |
| "Authoring rules live in `docs/runbooks/spec-authoring.md`" bullet | present | verbatim, two lines, immediately under the H1 |
| `## Context (read this, nothing else)` | present | heading verbatim; 4 paragraphs |
| `## Current state` | present | heading verbatim |
| `## Deliverables (permission boundary — touch ONLY these)` | present | heading verbatim; template's "Always allowed without listing" HTML comment retained (all four allowed paths named) |
| `### Exact contracts` | present | heading verbatim; contains a fenced code block |
| `## Contract reference` (optional) | present | heading present without the template's parenthetical hint (see NB-2); states activation as ADR-0031 2-of-7 with criteria (iii), (iv), (vi) named |
| `### Contract table(s)` | present | renamed to two headings, `### Table A — per-shape disposition (the ruling)` and `### Table B — measured per-path exposure, and what changes`; both are real markdown tables (see NB-3) |
| `### Mirrored Surface Checklist` | present | heading verbatim; checklist items for Table A and Table B |
| `## Implementation notes & constraints` | present | heading verbatim; keeps the template's "When uncertain / do NOT expand scope" bullet |
| `## Security checklist (delete only if …)` | present — ADAPTED | kept as `## Security checklist` (parenthetical instruction dropped); the template's single anchored-pattern checkbox is replaced by two spec-specific checkboxes, the first of which explicitly states the anchored-pattern rule "has no subject here — stated rather than deleted so the absence is checkable". Not deleted, not verbatim: adapted. |
| `## Acceptance criteria` | present | heading verbatim; AC1–AC8. Template's illustrative idempotence checkbox has no counterpart (see NB-4) |
| `## Verification steps (run these; paste output in the PR)` | present | heading verbatim; one bash block, V1–V3 |
| `## Out of scope (do NOT do these)` | present | heading verbatim; items carry WP ids where applicable |
| `## Definition of done` | present | heading verbatim; all 5 template numbered items present, item 2 specialized with the literal PR title, item 5 verbatim |

SILENTLY ABSENT sections: none.

Frontmatter check:

- `id: WP-frontmatter-recognition-failopen` — PASS (matches filename `WP-frontmatter-recognition-failopen.md`)
- `title:` — PASS (present, verb-first: "Close the frontmatter parser's recognition fail-open…")
- `status: Draft` — PASS (member of the template enum)
- `model: opus` — PASS (sonnet | opus)
- `size: M` — PASS (S or M; not L)
- `depends_on: []` — PASS (list shape)
- `adrs: [ADR-0022, ADR-0004, ADR-0031]` — PASS (list of ADR ids)
- `epic: audit-2026-07-29` — PASS (optional field, used, scalar slug)

Other mechanical checks:

- "Authoring rules live in …" bullet near the top — PASS
- Deliverables table columns `Action | Path | Notes` — PASS (exactly three, in template order, 7 rows)
- Contract reference fill-in requirements (criteria named + ≥1 contract table + Mirrored Surface Checklist) — PASS on all three
- Security checklist disposition — KEPT AND ADAPTED (not deleted)

Blocking findings: none.

Non-blocking observations:

1. NB-1 — The H1's post-colon text ("honour the untrusted flag through a BOM or a CRLF opener") is not the same string as the frontmatter `title` ("Close the frontmatter parser's recognition fail-open for the two encoding-artifact openers"). The template's `# WP-<slug>: <title>` placeholder implies the same title in both places.
2. NB-2 — Two template headings dropped their parenthetical authoring hints: `## Contract reference (optional — mark N/A if this WP is not contract-dense)` → `## Contract reference`, and `## Security checklist (delete only if the WP touches no untrusted input)` → `## Security checklist`. The hints are template scaffolding, so the sections themselves are still identifiable.
3. NB-3 — The template's literal `### Contract table(s)` heading does not appear; it is replaced by two named subsections (Table A, Table B). Content requirement is satisfied; only the heading string differs.
4. NB-4 — The template's second Acceptance-criteria checkbox ("Running the command twice is idempotent") has no counterpart in AC1–AC8 and is not marked N/A. Recorded as a checkbox-level, not section-level, gap.
5. NB-5 — The template's Deliverables HTML comment is reproduced with a minor wording trim (the template's trailing "Everything else must be listed." sentence is not carried over); all four always-allowed paths are still named.
