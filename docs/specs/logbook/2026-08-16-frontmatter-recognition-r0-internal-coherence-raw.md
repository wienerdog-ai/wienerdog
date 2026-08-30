---
date: 2026-08-16
title: "WP-frontmatter-recognition-failopen round 0b — internal coherence pass, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 0b — internal coherence pass (raw)

**Backend:** internal, same session as drafting.
**Spec revision read:** `3222648` (the draft commit).
**Committed AFTER adjudication** — see the honesty note at the end.

The pass reads the spec end to end for contradictions: a claim made in one
place and unmade in another, a count that no longer matches its list, an
assertion citing an input that is not there.

## Findings

**C1 — `epic: audit-a4` is an invented value.** The spec's frontmatter carried
`epic: audit-a4`. A count of `^epic:` values across `docs/specs/` and
`docs/specs/done/` showed `audit-a4` with exactly one user — this spec itself.
CLAUDE.md binds canonical naming and forbids inventing synonyms; a new epic is
a stream decision, not an authoring choice. The two sibling specs this package
follows (`WP-gate-vault-snapshot`, `WP-snapshot-read-path-hardening`) both carry
`epic: audit-2026-07-29`.
*Disposition: fix.* Changed to `audit-2026-07-29`.

**C2 — three listed ADRs are cited nowhere in the body.** The frontmatter listed
`[ADR-0022, ADR-0021, ADR-0032, ADR-0004, ADR-0005, ADR-0031]`. Counting
`ADR-[0-9]{4}` occurrences in the body only (excluding the `adrs:` line itself)
returned ADR-0022 ×9, ADR-0004 ×1, ADR-0031 ×1, and **zero** for ADR-0005,
ADR-0021 and ADR-0032. `docs/specs/README.md` states "Cited ADRs are binding",
so listing an ADR the spec never applies is both noise and a false binding.
*Disposition: fix.* List narrowed to `[ADR-0022, ADR-0004, ADR-0031]`.

## Checks that passed

- "three direct `src/` consumers" matches the three rows that follow it.
- The six validator call sites named in Deliverables (`195, 317, 325, 343, 500,
  1170`) are six, and split correctly into five `parseFrontmatter` sites plus
  one `skillBody` site, which is what the surrounding sentence claims.
- Table A carries six rows (baseline + the five measured shapes); Table B carries
  six rows; the AC list maps AC3→B1/B2, AC4→B3, AC5→B4, AC6→B5.
- "Residual 8 named three shapes; the measurement finds five" — consistent with
  both the Current-state table and the cited Done spec.
- The `WP-gate-vault-snapshot` citations (`:430` Residual 8, `:259` Table A
  Gate-2 row) resolve on this tree.
- V1's sentinel (`grep -rn "'---'" src/core/`) returns only
  `src/core/frontmatter.js`, as the spec claims.

## Known gap, not raised as a finding

Table B row B6 (the `wienerdog memory approve` evidence display) has no
acceptance criterion and no test file in Deliverables. This is deliberate: B6 is
a display consumer, not a gate, and the row exists to discharge the disclosure
duty, not to add verification surface. Recorded here so a later round does not
have to rediscover whether it was an oversight.

## Honesty note — the ordering property was not in force

`docs/runbooks/codex-review.md` ("Rules") requires the raw output to be
committed BEFORE anyone reads or judges it. This pass ran inline during
drafting and both findings were fixed in the same breath, so this file was
written after adjudication. The text above is verbatim as to what was found and
decided, but the property the rule buys — that the adjudicator cannot have
shaped the evidence — did not hold for round 0b. The same defect is on record
for the two predecessor packages
(`2026-08-15-snapshot-read-path-review-rounds.md`,
`2026-08-14-vault-snapshot-review-rounds.md`); this is the third occurrence, and
all three are round zero, which is the signal worth acting on.
