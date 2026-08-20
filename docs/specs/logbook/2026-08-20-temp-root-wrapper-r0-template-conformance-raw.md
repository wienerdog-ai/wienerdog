# Round-zero template conformance — WP-temp-root-wrapper (raw)

- **What this is:** a round-zero **template conformance** check, not a design
  critique. The checker took no part in drafting the spec and judged only what
  is written in the two input files.
- **Clean context:** yes — exactly two files were read, no other repo file, no
  git command, no external reference was consulted.
- **Inputs:**
  1. `docs/specs/WP-temp-root-wrapper.md` (the spec under review)
  2. `docs/specs/_TEMPLATE.md` (the template it is measured against)
- **Spec commit:** `7f051be`
- **Date:** 2026-08-20
- **Method:** every section and frontmatter field of the template is looked up
  in the spec and reported as PRESENT (with the spec's line number), explicitly
  marked N/A (with the spec's own quoted reason), or ABSENT (silently missing —
  blocking). Spec sections with no template counterpart are listed separately;
  extra sections are not violations.

## Frontmatter fields

| Template field (line) | Spec status | Spec line | Note |
|---|---|---|---|
| `id` (2) | PRESENT | 2 | `WP-temp-root-wrapper` — matches the filename `WP-temp-root-wrapper.md` as the template requires |
| `title` (3) | PRESENT | 3 | Verb-first ("Front every test entry point…") per the template's `<verb-first, …>` placeholder |
| `status` (4) | PRESENT | 4 | `Draft` — a value from the template's allowed set |
| `model` (5) | PRESENT | 5 | `sonnet` — allowed value |
| `size` (6) | PRESENT | 6 | `S` — allowed value; `L` correctly not used |
| `depends_on` (7) | PRESENT | 7 | `[]` |
| `adrs` (8) | PRESENT | 8 | `[ADR-0004]` |
| `epic` (9, commented out / optional) | absent | — | Not a violation: the template ships this field commented out and labels it "optional — uncomment and set when part of a larger stream" |

Field **order** in the spec matches the template's order exactly. No unknown
frontmatter key is present. No frontmatter value falls outside the template's
enumerated sets.

## Body sections

| Template section (line) | Spec status | Spec line | Note |
|---|---|---|---|
| `# WP-<slug>: <title>` H1 (12) | PRESENT | 11 | Heading exists and uses the `WP-<slug>: <text>` shape. The text after the colon is a rewording, not the frontmatter `title` — see finding 3 |
| Authoring-rules bullet ("Authoring rules live in `docs/runbooks/spec-authoring.md`…", 14–15) | absent | — | Instructional scaffolding addressed to the spec author, not spec content; treated as non-blocking — see finding 1 |
| `## Context (read this, nothing else)` (17) | PRESENT | 13 | Five paragraphs; carries the ADR-0004 product invariant the template's guidance asks for |
| `## Current state` (25) | PRESENT | 56 | |
| `## Deliverables (permission boundary — touch ONLY these)` (31) | PRESENT | 193 | |
| Deliverables always-allowed HTML comment (33–35) | PRESENT | 195–196 | Adapted wording ("per scripts/boundary-check.js"), same four always-allowed paths |
| Deliverables table `\| Action \| Path \| Notes \|` (37–41) | PRESENT | 198–202 | Same three columns; three rows |
| `### Exact contracts` (43) | PRESENT | 210 | |
| `## Contract reference (optional — mark N/A if this WP is not contract-dense)` (55) | PRESENT | 219 | Heading carries no parenthetical; the parenthetical is authoring guidance, and the section is filled in rather than N/A'd |
| Activation justification against the 2-of-7 test (57–72) | PRESENT | 221–227 | Names criteria **(iv)** and **(vii)** explicitly — two, so the discipline is correctly ON |
| `### Contract table(s)` (78) | PRESENT (renamed) | 229, 252 | Realized as two per-contract H3s, `### Table A — …` and `### Table B — …`, instead of one container heading — see finding 2 |
| `### Mirrored Surface Checklist` (86) | PRESENT | 265 | Eight checklist items covering all five template-suggested surface classes |
| `## Implementation notes & constraints` (99) | PRESENT | 283 | Includes the template's own "when uncertain: choose the simpler option" item at 321–322 |
| `## Security checklist (delete only if the WP touches no untrusted input)` (106) | PRESENT | 324 | Not deleted; three items |
| Security checklist untrusted-identifier item (108–117) | explicitly N/A | 326–331 | Quoted: "The template's untrusted-identifier item is **N/A — no untrusted identifier reaches a filesystem path or a shell command here.**" |
| `## Acceptance criteria` (119) | PRESENT | 340 | 16 checkbox criteria, each binary |
| Idempotence criterion (122–124) | PRESENT | 383–384 | "Idempotence: two consecutive `npm test` runs each leave that same isolated temp root's `wd-*` count unchanged." — the WP ships a command surface, so the conditional N/A escape does not apply and is correctly not used |
| `## Verification steps (run these; paste output in the PR)` (126) | PRESENT | 387 | |
| `## Out of scope (do NOT do these)` (133) | PRESENT | 509 | |
| `## Definition of done` (137) | PRESENT | 550 | |
| DoD item 1 — verification steps pass, output pasted (139) | PRESENT | 552–553 | Extended with "including the required deliberate-red runs" |
| DoD item 2 — conventional commits, PR title (140) | PRESENT | 554–555 | Concrete title supplied |
| DoD item 3 — PR template, "Decisions made", `Generated-by:` (141) | PRESENT | 556–557 | |
| DoD item 4 — `status:` flipped to `In-Review` (142) | PRESENT | 558 | |
| DoD item 5 — both PR review gates clean or dispositioned (143–146) | PRESENT | 559–562 | Verbatim in substance, including the "`In-Review` marks the START of review" sentence |

**ABSENT (blocking) count: 0.** No template section or required field is
silently missing.

## Spec sections with no template counterpart

| Spec section | Spec line | Note |
|---|---|---|
| `### Discovered issues (pointer only — another session owns this)` | 534 | Nested under "Out of scope". Extra sections are not violations; recorded here for completeness only |
| Verification preamble prose ("Run the whole block in ONE shell session…") and the post-block deliberate-red list | 389–390, 492–507 | Prose surrounding the template's fenced verification block, not a separate heading; listed for completeness |

## Findings

1. **(non-blocking, scaffolding)** The template's post-H1 bullet pointing at
   `docs/runbooks/spec-authoring.md` (template lines 14–15) does not appear in
   the spec. This bullet is instruction addressed to the spec's author rather
   than content the finished spec carries, and the template gives no explicit
   "delete this line" marker for it — unlike, say, the Security checklist's
   "delete only if…". Recorded as a deviation from the literal template section
   list, not as a blocking omission. If the maintainer wants the line to be
   mandatory boilerplate, the template should say so.
2. **(non-blocking, heading rename)** The template's `### Contract table(s)`
   heading (line 78) is not present under that name. The spec instead uses two
   per-contract H3 headings, `### Table A — tests/with-temp-root.js` (229) and
   `### Table B — the package.json wiring` (252). The template's own guidance
   ("One canonical table per dense contract", line 80; "give each dense contract
   **one canonical reference table**", 74–76) is satisfied in substance. Two
   sub-deviations come with it: (a) the container heading name is gone, so a
   purely structural heading diff shows a miss; (b) the tables use the columns
   `| Fact / rule | Value |` rather than the template's three-column example
   `| Contract | Fact / rule | Value |`, the contract identity having moved into
   each heading. Both are consistent and readable; flagged only because a
   conformance read must report the literal difference.
3. **(non-blocking, consistency)** The H1 text and the frontmatter `title` are
   different sentences. Frontmatter (line 3): "Front every test entry point with
   a run-scoped temp root, so test runs stop leaking directories". H1 (line 11):
   "a run-scoped temp root in front of every test entry point". The template's
   H1 placeholder is `# WP-<slug>: <title>`, which reads as "repeat the title".
   The two agree in meaning, and the H1's is not verb-first; if the template
   intends byte-equality, this is a mismatch.

**Blocking findings: 0. Non-blocking findings: 3.**

## Verdict

**PASS** — every template section and required frontmatter field is either
present or explicitly marked N/A with a reason; nothing is silently missing.
Three non-blocking deviations are recorded above for the maintainer's judgment.
