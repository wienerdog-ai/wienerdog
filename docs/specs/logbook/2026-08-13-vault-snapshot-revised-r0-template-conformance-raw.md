# Template conformance (round zero) — spec revised to the ruling

WP: WP-gate-vault-snapshot
Backend: general-purpose executor, clean context | subagent transcript agent-a4f462442b2e65eaf.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
## Template conformance — WP-gate-vault-snapshot.md vs docs/specs/_TEMPLATE.md

### Frontmatter

| Template field | Verdict | Note |
|---|---|---|
| `id` | PRESENT | `WP-gate-vault-snapshot` — matches filename `WP-gate-vault-snapshot.md` |
| `title` | PRESENT | Verb-first ("Gate the vault snapshot — …") |
| `status` | PRESENT | `Draft` — a legal value from the template's enum |
| `model` | PRESENT | `opus` — legal tier |
| `size` | PRESENT | `M` — legal (not L) |
| `depends_on` | PRESENT | `[]` (explicit empty list, not omitted) |
| `adrs` | PRESENT | `[ADR-0004, ADR-0032]` |
| `epic` (optional) | PRESENT | `audit-2026-07-29` — uncommented and set |

No extra frontmatter fields beyond the template's set.

### Sections

| Template section | Verdict | Note |
|---|---|---|
| `# WP-<slug>: <title>` heading | PRESENT | `# WP-gate-vault-snapshot: gate the second path into a model session` |
| Authoring-rules bullet (`docs/runbooks/spec-authoring.md`) | PRESENT | Reproduced verbatim, lines 14-15 |
| `## Context (read this, nothing else)` | PRESENT | Heading byte-identical; 5 paragraphs |
| `## Current state` | PRESENT | Five subsections with file:line citations |
| `## Deliverables (permission boundary — touch ONLY these)` | PRESENT | Heading byte-identical; template's always-allowed HTML comment kept and extended; 6-row table with Action/Path/Notes columns |
| `### Exact contracts` | PRESENT | Signature block + statement that the shape is unchanged |
| `## Contract reference` | PRESENT | Activation test applied explicitly, 3 of 7 named ((iii), (iv), (vii)) → section filled rather than N/A. Heading drops the template's parenthetical `(optional — mark N/A if this WP is not contract-dense)`; the template's own instructions say the scaffold prose is replaced when the trigger fires |
| `### Contract table(s)` | PRESENT | The generic scaffold heading is replaced by four named canonical tables at the same `###` depth: `### Table A — the snapshot's per-file gate chain`, `### Table B — the mount framing line`, `### Table C — the docs/THREAT-MODEL.md T1 bullet`, `### Table D — the ADR-0032 amendment (append-only)`. All four are two-column `Fact / rule | Value` tables; the template's illustrative third `Contract` column is folded into the table titles |
| `### Mirrored Surface Checklist` | PRESENT | Heading byte-identical; 7 checklist entries, covering the template's five suggested surfaces plus "Exact contracts" and "Security checklist" |
| `## Implementation notes & constraints` | PRESENT | 6 bullets, including the template's verbatim "When uncertain: choose the simpler option" clause |
| `## Security checklist` | PRESENT | Not deleted. The template's untrusted-identifier item is itself carried and marked `N/A — this WP adds no path and no command construction`, with reasoning; 7 further items (containment + Residuals 1-6 + the M3 partial-close item) |
| `## Acceptance criteria` | PRESENT | 16 binary checkbox criteria. The template's example idempotency bullet ("Running the command twice is idempotent") has no counterpart — it is an illustrative bullet inside the section, not a section |
| `## Verification steps (run these; paste output in the PR)` | PRESENT | Heading text shortened to `## Verification steps (run these; paste output in the PR)` — identical. One bash block (`npm test`, `npm run lint`, plus 7 new assertion gates) followed by both-directions run instructions |
| `## Out of scope (do NOT do these)` | PRESENT | Heading byte-identical; 9 bullets, WP/decision ids cited |
| `## Definition of done` | PRESENT | Template's 5 numbered items all present and in order (1, 2, 3, 4 map to template 1-4; template's item 5 review-gate item is item 6 here, wording preserved); one extra item inserted as 5 (M3 partial-close statement) |

No template section is silently missing, and no section is deleted without an `N/A` line in its place.

### ROUND HEADER: CONFORMANT
`````
