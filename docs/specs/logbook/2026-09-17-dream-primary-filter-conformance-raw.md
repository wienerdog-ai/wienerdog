# Raw template-conformance report

## Scope and verdict

- Work package: `WP-dream-primary-dialogue-filter`.
- Review type: template conformance only; no design or implementation review.
- Verdict: **NEEDS REVISION — all required sections are present, but two explicit template requirements are not fully satisfied.**
- This is the raw reviewer report, written before author adjudication.

## Inputs and checkout evidence

Exactly two document inputs were read:

1. `/Users/felho/dev/repos-to-learn-from/wienerdog-worktrees/dream-primary-filter-review/docs/specs/WP-dream-primary-dialogue-filter.md`
2. `/Users/felho/dev/repos-to-learn-from/wienerdog-worktrees/dream-primary-filter-review/docs/specs/_TEMPLATE.md`

Revision before and after review: `ff78e2f024db99724754f52415fd14f23c55b9d5`.
Work-package frontmatter status: `Draft`.
`git status --porcelain` before review: empty output (clean).
`git status --porcelain` after review: empty output (clean).
The before/after status outputs are identical. No checkout files were edited and no commits were made. This report is outside the checkout.

The template refers to the authoring runbook, and the spec refers to other documents. Those documents were not opened because this review was explicitly restricted to the two inputs above. This report therefore makes no claim about separate runbook requirements.

## Executed checks

All commands ran from the review checkout and exited successfully:

1. `git status --porcelain` — initial clean-state capture.
2. `git rev-parse HEAD` — initial revision capture.
3. `cat docs/specs/_TEMPLATE.md docs/specs/WP-dream-primary-dialogue-filter.md` — full reading of both inputs.
4. `rg -n` over the same two files — indexed headings and targeted contract/template wording for line references.
5. `git status --porcelain` — final clean-state capture.
6. `git rev-parse HEAD` — final unchanged revision capture.

Manual checks covered every section, frontmatter fields and allowed values, the contract-density trigger, canonical tables and mirrors, examples/file-output requirements, acceptance/verification structure, and definition-of-done requirements. No product tests or proposed implementation verification commands were run; they are outside a document template-conformance review.

## Section inventory

| Template requirement | Spec location | Result |
|---|---|---|
| Frontmatter: id, title, status, model, size, depends_on, adrs | Lines 1–9 | Present; id/filename agree, verb-first title, allowed Draft/opus/M values. Optional epic omitted legitimately. |
| WP heading | Line 11 | Present and consistent with id/title. |
| Context | Line 13 | Present; three paragraphs and relevant invariants. |
| Current state | Line 38 | Present; baseline, concrete paths, and existing function/interface references. Accuracy against code is outside this review. |
| Deliverables permission table | Line 81 | Present with Action/Path/Notes columns and explicit file paths. |
| Exact contracts | Line 107 | Present; parser signature/result shape and example filter result. See TC-01. |
| Contract reference or explicit N/A | Line 132 | Present; multiple activation conditions expressly identified, so N/A is unnecessary. |
| Canonical contract tables | Lines 137, 149, 161, 173 | Present as Tables A–D with addressable row IDs. A literal heading named “Contract table(s)” is unnecessary because these are the filled tables. |
| Mirrored Surface Checklist | Line 184 | Present; lists section surfaces, but misses explicit maintenance requirements. See TC-02. |
| Implementation notes & constraints | Line 193 | Present with scope constraints and ambiguity/split handling. |
| Security checklist | Line 221 | Present; untrusted-input handling is addressed, including preventing model values from becoming paths or commands. |
| Acceptance criteria | Line 228 | Present; table-linked AC1–AC4, offline AC5, and an applicable idempotency criterion. |
| Verification steps | Line 237 | Present; literal commands distinguish baseline checks from future implementation checks, and a manual procedure covers AC5. |
| Out of scope | Line 286 | Present; adjacent exclusions and a named separate WP. |
| Definition of done | Line 299 | Present; verification evidence, conventional PR title, filled PR template and Generated-by, In-Review transition, and both review gates. Adds an explicit Draft authorization hold. |

No mandatory section is missing. Findings below concern instructions within existing sections.

## Findings

### TC-01 — Missing literal expected generated-file example

- Template source: `_TEMPLATE.md:45–47` requires input/output examples and, for file-generating code, a literal expected output file in full.
- Spec location: `WP-dream-primary-dialogue-filter.md:107–130`, particularly the scratch-format paragraph beginning at line 128.
- Evidence: The Exact contracts section supplies the new parser signature and a literal filter response, but does not show a complete generated primary scratch extract or request packet. Tables B5–B7 and D3 explicitly involve writing those private ephemeral files. Declaring scratch internal and allowing existing formatting does not provide the template's requested full output example; the template states no exemption for ephemeral/internal files.
- Required adjustment: Add a small synthetic input-to-output example with the complete expected generated file, referring to the canonical tables for governing facts and registering the example as a mirror. If the maintainer intends an exemption for existing internal serialization, record that explicit template exception rather than treating the public/internal distinction as an existing exemption.
- Scope note: This finding requests the template's example artifact; it does not request a new public format or propose a design change.

### TC-02 — Mirror checklist omits mandatory update discipline

- Template source: `_TEMPLATE.md:88–93` requires every mirror to be named per canonical table, all mirrors to be updated in the same commit, and newly discovered mirrors to be registered immediately.
- Spec location: `WP-dream-primary-dialogue-filter.md:184–191`.
- Evidence: The checklist names the document's major sections and says they should remain consistent, but does not explicitly require same-commit updates or immediate registration of newly discovered mirrors. Its aggregate section list also leaves the per-table mirror inventory implicit.
- Required adjustment: State that the registered section surfaces apply to each relevant canonical table (or provide a short A/B/C/D mapping), require updating a changed table and all affected mirrors in the same commit, and require immediate registration of any additional mirror discovered in review.
- Scope note: This is conformance to explicit template maintenance rules, not a claim that any particular contract value currently disagrees with a mirror.

## Limits

No assessment was made of runtime correctness, security sufficiency, proposed model behavior, work-package feasibility, factual baseline accuracy, or test completeness against production code. The Draft hold is preserved. The two findings require author/maintainer disposition before claiming full template conformance; this report itself authorizes no implementation.
