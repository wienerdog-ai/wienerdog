# Template conformance check — WP-daily-summary-per-line-framing (round zero)

Checked: /Users/felho/dev/repos-to-learn-from/wienerdog-framing/docs/specs/WP-daily-summary-per-line-framing.md against /Users/felho/dev/repos-to-learn-from/wienerdog-framing/docs/specs/_TEMPLATE.md

VERDICT: PASS — no silently absent section

## 1. Section presence

### Frontmatter fields (template order)

| Field | Status | Spec line | Notes |
|---|---|---|---|
| `id` | PRESENT | 2 | `WP-daily-summary-per-line-framing`, matches filename |
| `title` | PRESENT | 3 | |
| `status` | PRESENT | 4 | `Draft` — one of the template's allowed values (Draft \| Ready \| In-Progress \| In-Review \| Done \| Superseded) |
| `model` | PRESENT | 5 | `opus` — one of the template's allowed values (sonnet \| opus) |
| `size` | PRESENT | 6 | `S` — allowed value; not `L` (no defect) |
| `depends_on` | PRESENT | 7 | `[]` |
| `adrs` | PRESENT | 8 | `[ADR-0004, ADR-0032]` |
| `epic` | PRESENT | 9 | `audit-2026-07-29` — this field is optional/commented-out in the template; the spec uncommented and set it, which the template explicitly permits |

No frontmatter defects.

### `##` sections (template order)

| Template heading | Status | Spec line |
|---|---|---|
| `## Context (read this, nothing else)` | PRESENT | 14 |
| `## Current state` | PRESENT | 57 |
| `## Deliverables (permission boundary — touch ONLY these)` | PRESENT | 87 |
| `## Contract reference (optional — mark N/A if this WP is not contract-dense)` | PRESENT | 123 (spec's own heading text is `## Contract reference`, dropping the template's parenthetical annotation — that parenthetical is instructional guidance to the spec author, not literal heading text to reproduce; the section body states the 2-of-7 activation trigger fired, so filling it in rather than N/A-marking it is the template-sanctioned path) |
| `## Implementation notes & constraints` | PRESENT | 159 |
| `## Security checklist (delete only if the WP touches no untrusted input)` | PRESENT | 173 (heading text is `## Security checklist`, same parenthetical-drop as above; the section itself is kept, with its first checklist item N/A-marked rather than the whole section deleted — see Part 3, Rule 1) |
| `## Acceptance criteria` | PRESENT | 186 |
| `## Verification steps (run these; paste output in the PR)` | PRESENT | 209 |
| `## Out of scope (do NOT do these)` | PRESENT | 225 |
| `## Definition of done` | PRESENT | 237 |

All 10 template-defined `##` sections are present. Zero silently absent. The spec adds no `##` section beyond the template's set.

### Added structure below `##` level (not a defect, reported per instructions)

- Under `## Deliverables`, the spec carries `### Exact contracts` (line 97), matching the template's own subsection at that position.
- Under `## Contract reference`, the template shows a single generic `### Contract table(s)` subsection (template line 96) plus `### Mirrored Surface Checklist` (template line 104). The spec instead splits the tables into two specifically-named subsections, `### Table A — the emitted daily-log section` (line 129) and `### Table B — the ADR-0032 amendment` (line 143), followed by `### Mirrored Surface Checklist` (line 151). This is a naming variation on the template's generic placeholder heading, not an addition of new template-undefined content — the template's own text allows "one canonical table per dense contract" (plural), and two dense contracts are in fact present (Table A for the module's emitted shape, Table B for the ADR amendment).

## 2. Frontmatter value conformance

- `status: Draft` — valid enumerated value.
- `model: opus` — valid enumerated value.
- `size: S` — valid value, and specifically NOT `L`. No blocking defect on this axis.

## 3. Template's authoring rules

**Rule 1 — no silent section deletion; N/A line in its place.**
Conforms. The `## Security checklist` section is conditional per the template ("delete only if the WP touches no untrusted input"); the spec keeps the section (correctly, since untrusted note bytes flowing into model context is exactly the surface it touches) and, within it, N/A-marks only the one checklist item that doesn't apply, in the template's exact format: line 175–177, `- [ ] The template's untrusted-identifier item is **N/A — no untrusted identifier reaches a filesystem path or a shell command here**: ...`. The `## Contract reference` section, also conditional, is not N/A-marked but filled in with a stated activation reason (line 125–127: "Activation (ADR-0031, 2-of-7): (i) ... and (iii) ..."), which is the template's alternative sanctioned path when the trigger fires rather than a silent drop.

**Rule 2 — universal statements quantify over a named, checkable set.**
Conforms, on the two clearest instances. Line 191–195 states a "No summary content produces an emitted line ... without the marker" universal, and immediately narrows/anchors it with a concrete enumerated list plus an explicit tie to a named table ("including content carrying any member of Table A's break set"). Line 140 (Table A, "Content fidelity" row) states "no escaping, dropping, reordering or truncation by the framing step," which has a named consumer — the acceptance criterion at line 196–197 checks exactly this fact. Both universals are gated to a named, checkable artifact rather than left as an ungated hope.

**Rule 3 — every detail has a named consumer.**
Conforms, on the two instances checked. Current-state line 68–69 notes `extractSection` "splits on `\n` only ... a `\r` inside a line survives as an ordinary character" — this detail's consumer is named explicitly at Implementation notes line 167 ("the framing step is responsible for the rest of Table A's break set"), which is itself tied to Table A's break-set row (line 139). Current-state line 76–77 notes `capDigest` "can drop the closing marker while keeping summary lines" — its consumer is the acceptance criterion at line 198–199 ("Truncation cannot leave content unmarked ..."). Both are checkable from the text alone; no detail was spot-checked that lacked an identifiable consumer.

**Rule 4 — spec states the contract, not tests/fixtures/code structure.**
Conforms. The Deliverables row for the test file explicitly defers test design to the implementer: line 94, "modify | tests/unit/digest.test.js | cover the acceptance criteria below (**the implementer designs the cases**)." Table A's "Module exports" row (line 136) states that the marker/banner constants must be exported but that "their identifiers are the implementer's choice" — the contract fixes the observable shape, not the code structure. Acceptance criteria throughout (lines 186–207) are phrased as WHAT must hold (section shape, no-unmarked-line, content fidelity, truncation safety) rather than as prescribed test cases or fixture shapes.
