# Round zero — template conformance, on the drafted read-path spec

WP: WP-snapshot-read-path-hardening
Backend: internal executor in a clean context (no external reviewer — this is a
conformance read, not a design critique), given exactly two inputs: the spec and
`docs/specs/_TEMPLATE.md`.
Tree: `wp/snapshot-read-path-hardening` @ `3b43954` (pre-rebase SHA; the same
content now sits at `348b205` after the rebase onto `79ba77f`).

Raw final output, byte-unchanged inside the fence. **Committed AFTER
adjudication**, not before — see the round record for what that costs.

`````text
## A. Template section conformance

| # | Template section | Spec status | Spec line(s) |
|---|---|---|---|
| 1 | YAML frontmatter block | PRESENT | 1–10 |
| 2 | `# WP-<slug>: <title>` (H1) | PRESENT | 12 |
| 3 | Authoring-rules bullet (`docs/runbooks/spec-authoring.md`) | PRESENT (verbatim) | 14–15 |
| 4 | `## Context (read this, nothing else)` | PRESENT | 17 |
| 5 | `## Current state` | PRESENT | 64 |
| 6 | `## Deliverables (permission boundary — touch ONLY these)` | PRESENT (incl. the always-allowed HTML comment, 143–145; 3-row table) | 141 |
| 7 | `### Exact contracts` | PRESENT | 154 |
| 8 | `## Contract reference` | PRESENT (activated branch — see C) | 167 |
| 9 | `### Contract table(s)` | PRESENT — heading renamed/split into two canonical tables: `### Table A — the snapshot's per-file read path` and `### Table B — platform posture, per flag`. Content obligation met; heading text differs from the template literal | 175, 196 |
| 10 | `### Mirrored Surface Checklist` | PRESENT (verbatim heading, 7 items) | 210 |
| 11 | `## Implementation notes & constraints` | PRESENT | 237 |
| 12 | `## Security checklist` | PRESENT (heading without the template's parenthetical, which is a delete-instruction, not part of the name). The template's one canonical checklist item is N/A-MARKED inline: "The template's untrusted-identifier item is **N/A — no untrusted identifier reaches a filesystem path or a shell command here.**" | 259 (section), 261–264 (N/A) |
| 13 | `## Acceptance criteria` | PRESENT (11 items; includes the template's idempotence-style objectivity requirement as binary criteria) | 280 |
| 14 | `## Verification steps (run these; paste output in the PR)` | PRESENT | 316 |
| 15 | `## Out of scope (do NOT do these)` | PRESENT | 335 |
| 16 | `## Definition of done` | PRESENT (all 5 numbered items, item 5 preserved verbatim) | 351 |

No template section is silently absent.

## B. Frontmatter

| Field | Present | Value | In template's named set? |
|---|---|---|---|
| `id` | yes (2) | `WP-snapshot-read-path-hardening` | matches filename `WP-snapshot-read-path-hardening.md` ✓ |
| `title` | yes (3) | verb-first ("Harden the vault snapshot's read path…") ✓ | ✓ |
| `status` | yes (4) | `Draft` | ✓ (Draft \| Ready \| In-Progress \| In-Review \| Done \| Superseded) |
| `model` | yes (5) | `opus` | ✓ (sonnet \| opus) |
| `size` | yes (6) | `M` | ✓ (S \| M; L forbidden) |
| `depends_on` | yes (7) | `[]` | ✓ |
| `adrs` | yes (8) | `[ADR-0004]` | ✓ |
| `epic` | yes (9) | `audit-2026-07-29` | optional field, template shows it commented out; uncommented use is exactly the documented "uncomment and set when part of a larger stream" case ✓ |

Every field the template shows is present; no field value falls outside the sets the template names. No unknown/extra frontmatter keys.

## C. Contract reference — conditional branch

- **Branch taken:** ACTIVATED (not `N/A —`).
- **Activation reasoning stated:** yes, explicitly at lines 169–173, naming the ADR-0031 2-of-7 test and the two triggers it claims: **(iv)** error/fallback/precedence behavior changes, and **(vii)** the same contract appears in multiple mirrored surfaces ("this spec, three code comments, two rows of a Done spec").
- **Canonical table(s):** yes — two, `Table A` (175–194, 16 rows) and `Table B` (196–208, 6 rows). Operative prose cites them by name rather than restating (e.g. Deliverables row 149, acceptance criteria 303/306/310, out-of-scope 339).
- **Mirrored Surface Checklist:** yes, present at 210–235, covering all five template-suggested surface classes plus registered code-comment mirrors.

Both halves the activated branch requires are carried.

## D. Sections the spec adds beyond the template

At heading level, the spec adds no `##`/`###` section the template lacks. Two structural additions worth naming:

1. **A second canonical contract table** — `### Table B — platform posture, per flag` (196). The template scaffolds a single `### Contract table(s)`; the spec splits the discipline across two named H3 tables (allowed by the template's own "one canonical table per dense contract").
2. **A post-code-block note under Verification steps** (328–333) explaining the two new grep assertions and requiring a GREEN and a RED paste — the template's Verification section is a bare code block.

Non-heading emphasis blocks inside Context (`**Value line.**` 54, `**What this package deliberately does not do.**` 58) are prose, not added sections.

## Verdict

`CONFORMANT`
`````
