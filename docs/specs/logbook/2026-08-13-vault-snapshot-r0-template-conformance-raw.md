# Template conformance (round zero) — pre-ruling draft

WP: WP-gate-vault-snapshot
Backend: general-purpose executor, clean context | subagent transcript agent-a818fc4dbad6e0f4a.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
Both files read. Here is the mechanical diff.

## Frontmatter fields

| Template field | Verdict | Note |
|---|---|---|
| `id` | PRESENT | `WP-gate-vault-snapshot` — matches filename `WP-gate-vault-snapshot.md` exactly |
| `title` | PRESENT | "Gate the vault snapshot — secret scan, provenance, a code-computed report stamp, and mount framing". Differs in wording from the H1 (`# WP-gate-vault-snapshot: gate the second path into a model session`); both exist, neither is missing |
| `status` | PRESENT | `Draft` — a valid enum value |
| `model` | PRESENT | `opus` — valid tier |
| `size` | PRESENT | `M` — allowed (not `L`) |
| `depends_on` | PRESENT | `[]` — present as an explicit empty list |
| `adrs` | PRESENT | `[ADR-0004, ADR-0032]` |
| `epic` (optional) | PRESENT | `audit-2026-07-29` — uncommented and set |

## Sections

| Template section | Verdict | Note |
|---|---|---|
| H1 `# WP-<slug>: <title>` | PRESENT | line 12 |
| Authoring-rules bullet (`spec-authoring.md`) | PRESENT | lines 14-15, verbatim |
| `## Context (read this, nothing else)` | PRESENT | 4 paragraphs; states the ADR-0004 invariant inline |
| `## Current state` | PRESENT | five sub-blocks with file paths and line refs |
| `## Deliverables (permission boundary — touch ONLY these)` | PRESENT | HTML comment retained (adapted to cite `scripts/boundary-check.js:48-54`); 8-row Action/Path/Notes table |
| `### Exact contracts` | PRESENT | JSDoc signature block + byte-exact report leading bytes |
| `## Contract reference` | PRESENT | Activation test explicitly worked: claims 4 of 7 fire (iii, iv, v, vii) — ≥2, so the section is correctly filled rather than N/A'd. Heading drops the template's parenthetical instruction text |
| `### Contract table(s)` | PRESENT | The scaffold heading is replaced by five per-contract headings (`### Table A` … `### Table E`), each a canonical `Fact / rule \| Value` table. Content requirement satisfied; the literal placeholder heading string is not used |
| `### Mirrored Surface Checklist` | PRESENT | lines 271-280, 8 checklist entries |
| `## Implementation notes & constraints` | PRESENT | includes the template's "when uncertain → simpler option, record under Decisions made" line |
| `## Security checklist` | PRESENT | Not deleted. The template's untrusted-identifier item is retained and marked `N/A — no untrusted identifier reaches a filesystem path or a shell command here`, with justification; plus 4 residual items |
| `## Acceptance criteria` | PRESENT | 18 binary checkboxes. Note: the template's example idempotency criterion has no counterpart, but that is example content, not a section |
| `## Verification steps (run these; paste output in the PR)` | PRESENT | bash block with `npm test` / `npm run lint` plus 4 assertion gates |
| `## Out of scope (do NOT do these)` | PRESENT | 8 bullets, each naming its owner doc/WP |
| `## Definition of done` | PRESENT | all 5 template items present in order, with one extra (item 5, the measurement) inserted; the review-gate item is item 6 and cites `docs/runbooks/codex-review.md` without restating it |

No template section is silently missing. No section was deleted without an `N/A —` line in its place (the only N/A usage is the intra-checklist item, which carries a reason).

ROUND HEADER: **CONFORMANT**
`````
