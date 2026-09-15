---
id: WP-dream-filtered-input-budget
title: Allocate dream input capacity from filtered extracts
status: Draft
model: opus
size: M
depends_on: [WP-119, WP-087]
adrs: [ADR-0004, ADR-0012, ADR-0023, ADR-0031]
---

# WP-dream-filtered-input-budget: Allocate dream input capacity from filtered extracts

## Context (read this, nothing else)

The dream consolidates Claude Code and Codex transcripts into the user's vault.
`collectExtracts` selects eligible transcript files, produces redacted JSON
extracts in private scratch storage, and returns the selected files to the dream
orchestrator. Wienerdog is just files (ADR-0004): this work adds no daemon,
service, schedule, or runtime dependency.

The configured `dream_max_input_bytes` is intended to bound extracted session
content. Today its allocation uses raw transcript file sizes before parsing.
Records the parser omits and text it shortens therefore reserve capacity that
other sessions cannot use. A session can lose older messages even when the
complete filtered input would fit. A successfully consumed truncated session is
later recorded as processed, so this unnecessary loss is not retried for an
unchanged file.

The separate raw intake limits protect availability: a 50 MiB file ceiling,
1 MiB line cap, 500,000 lines per file, a shared 200 MiB read budget per run,
64 KiB read chunks, and JSON depth 64. ADR-0023 also requires one parsed file at
a time, with only per-file metadata retained across the corpus. Its Decision §3
explicitly mandates raw-size allocation. This WP proposes replacing that part
of the decision while preserving bounded intake and materialization. Approval
of this draft must include that architectural change before implementation.

## Current state

Inspected base: `91668da62822c73be6115a3e6d06c6ec51462509`.
These are the executable claims to re-verify at dispatch:

| Claim | Current owner and observable behavior |
|---|---|
| C1 | `src/core/dream/scratch.js`, `collectExtracts(paths, ledger, maxInputBytes)`: obtains eligible files through `transcripts.discover(paths, { since: null })` and `ledgerLib.selectState`; quarantines files above the pre-read ceiling; allocates from `underCeiling.map((d) => d.size)` before calling `parseWithOutcome`. |
| C2 | The same function measures a parsed extract with `Buffer.byteLength(JSON.stringify(extract))`, but truncates only when `grant < d.size && serialized > grant`; it does not redistribute unused grants after parsing. |
| C3 | `src/core/transcripts/index.js`, `parseWithOutcome(entry, budget)`: applies the harness parser, shared secret redaction, a 4,000-character per-message cap and a 2,000-message newest-tail cap. `src/core/transcripts/stream.js`, `Limits` and `newRunBudget()`, own the separate raw intake bounds summarized above. |
| C4 | `scratch.js` writes extracts with `JSON.stringify(extract, null, 2)` and includes truncated selected files in `processed`. `src/cli/dream.js` records them through `recordProcessed` only after the existing successful-run and secret-disposition gates. |
| C5 | `tests/unit/dream-collect.test.js` already covers equal-share allocation, sub-floor deferral, quarantine exclusion, constrained-heap collection, and skill-invocation index rebasing. ADR-0023 Decision §3 expressly allocates from discovery `size`. |

A synthetic reproduction on this base used a 400,000-byte content budget.
The full filtered extracts occupied 212,674 compact JSON bytes, but collection
kept only 41,796; the substantial session retained 37 of 200 messages.
Provenance: the 2026-09-15 local `collectExtracts` reproduction recorded in
`docs/specs/logbook/2026-09-15-dream-filtered-input-budget.md`. These are
synthetic results, not a measurement of the owner's historical dream runs.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | Implement Table A within the existing collector and cleanup exports. |
| modify | tests/unit/dream-collect.test.js | Verify Table A and preserve relevant existing coverage. |
| modify | docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md | After owner approval, append the Table A A8 amendment; retain the historical decision text. |

### Exact contracts

Keep `collectExtracts(paths, ledger, maxInputBytes)`, `cleanScratch(stateDir)`,
and `MIN_TRUNCATE_BYTES` exported with their existing signatures. The collector
still returns `entries`, `scratchDir`, `processed`, `newlyQuarantined`, `deferred`,
`droppedForSize`, `dropped`, `truncated`, and `wrote`, with the existing member
shapes. Table A owns the changed allocation behavior and preserved boundaries.

No new CLI flag, configuration key, extract field, or ledger schema is added.
Scratch extracts keep their current JSON structure and pretty-printed encoding;
this WP changes selection and truncation, not that file format.

## Contract reference

Activated by ADR-0031 criteria (iv), (v), and (vii): capacity-deferral decisions
change, the collector emits selections whose persistence the orchestrator owns,
and the decision is mirrored in ADR-0023. Table A is canonical for this WP.

### Table A — Content allocation and its boundaries

| ID | Contract | Rule |
|----|----------|------|
| A1 | Allocation input | Use the complete extract returned by a successful, non-`runExhausted` `parseWithOutcome`, after its existing filtering, redaction and caps. Charge `Buffer.byteLength(JSON.stringify(extract))`, including extract metadata. Raw discovery `size` is not a content demand or grant. |
| A2 | Admission set | The ledger remains the eligibility authority. Inspect eligible under-ceiling files in the existing newest-first order within the shared raw read budget. Only completed successful parses participate in content allocation. A quarantined or raw-budget-deferred file reserves no content grant. A file cannot be content-deferred solely on a raw-size estimate. |
| A3 | Allocation policy | Apply the existing equal-share policy to A1 demands: satisfy whole extracts that fit their share and return the excess to the remaining demands; divide the remainder equally. Whole extracts can fit below `MIN_TRUNCATE_BYTES` (32,768). If unresolved equal shares are below that floor, defer the oldest unresolved session and recompute. Preserve newest-first output order. If the sum of demands fits the budget, keep that admission set whole. |
| A4 | Output bound and truncation | The sum of A1 sizes of emitted extracts must not exceed `maxInputBytes`, including when JSON metadata makes an extract larger than its source. For an over-grant extract, keep the largest newest-message suffix that fits, with the existing `truncated`, `started`, and skill-invocation rebasing semantics. If even a zero-message extract cannot fit its grant, defer the file whole. Unused bytes caused by indivisible messages or integer division need not be redistributed. |
| A5 | Intake and memory | Preserve the raw limits in `transcripts/stream.js` and charge transcript reads across the whole collection to one shared run budget. Discard a partial parse on run exhaustion and defer it and remaining unread candidates; do not record them as processed or quarantine them for capacity. Keep parsed content resident for at most one session at a time, plus corpus metadata; do not restore a whole-corpus array of extracts. The admission guarantee is limited to A2, not to files excluded by raw intake bounds. |
| A6 | Storage and lifecycle | Any temporary extracted content is redacted before persistence, confined to the existing run scratch lifecycle, and uses the current private directory/file protections (0700/0600). Before return, scratch exposes only selected extracts to its consumers; a deferred or quarantined extract must not be discoverable there by the brain. `wrote`, `entries`, and `processed` describe only final selected extracts. Preserve collector scratch reset, `cleanScratch`, failure propagation, and orchestrator cleanup. No new durable state or transcript mutation. |
| A7 | Results and accounting | Preserve quarantine reason codes and discovery fingerprints. Capacity deferral records no ledger state; `dropped` remains the `deferred` alias and `droppedForSize` its length. Deferred `bytes` remains raw discovery size for compatibility; it is not an allocation input. Truncation `originalBytes` and `keptBytes` use A1's metric; report each actual content-budget truncation exactly once. A parser-capped extract does not alone set `truncatedToFit`. Preserve the existing processed semantics for genuinely budget-truncated selected sessions and the downstream successful-run/secret gates. |
| A8 | ADR amendment | Append a dated amendment to ADR-0023 that explicitly supersedes Decision §3's allocation-from-discovery-size requirement with A1–A3, retaining its one-file-at-a-time memory constraint. State that the raw intake limits and ledger outcome semantics remain unchanged. Amend no historical owner signature and do not claim approval before it is given. |

**Examples (illustrations of Table A).** With a 400,000-byte budget and completed
extract demands of 210,000 and 3,000 bytes, both are kept whole even if each raw
file is several megabytes. With demands of 300,000 and 100,000 against a
300,000-byte budget, their grants are 200,000 and 100,000; the first is truncated
as A4 prescribes. A large raw file whose filtered extract fits a sub-floor grant
is admitted whole under A3.

### Mirrored Surface Checklist

- [ ] Deliverables and Exact contracts defer to Table A.
- [ ] Acceptance criteria reference Table A rather than deciding separate rules.
- [ ] The ADR amendment reflects A8 and cites this WP for its scope.
- [ ] Examples remain consistent with A1–A4.
- [ ] Current-state C1–C5 remain explicitly historical; implementation updates
      neither their base revision nor the reproduction to pretend they were fixed earlier.
- [ ] Any additional mirror found during review is registered and updated with
      its canonical row in the same commit.

## Implementation notes & constraints

- This is one collector bugfix, not a parser redesign. `transcripts/index.js`
  owns the meaning of filtered content; the collector must not invent a second
  filtering or secret-redaction path. Algorithm and temporary representation
  choices belong to the implementer, subject to Table A.
- Preserve the existing 64 MiB constrained-heap regression's resource bound.
  Increasing the heap or reducing its corpus is not a fix for A5.
- The budget retains the existing compact-JSON metric. Pretty-print whitespace
  contributes to the CLI dry-run's on-disk byte count, so that number may exceed
  the content budget. This WP does not redefine it as a model-token budget or
  promise to bound the brain's entire context.
- Genuine content overload still permits truncation and later marks selected
  sessions processed. This WP prevents raw-size-driven avoidable loss; it does
  not add partial-session checkpoints or recover prior omitted history.
- ADR-0023 amendments concerning secret reverts and quarantine reporting remain
  in force. `WP-dream-report-run-skips` owns report presentation; consume the
  unchanged collector result shape without adding that work here.
- No golden fixture changes. Record remaining local implementation choices in
  the PR's "Decisions made"; do not expand the permission boundary.
- Baseline verification found one unrelated full-suite failure:
  `tests/integration/adopt-e2e.test.js` rejects a resolved Claude command path
  that differs from its pin. The logbook records the run. This WP does not
  authorize changing executable identity checks or that test; a still-failing
  baseline must be resolved or dispositioned through the repo's review process,
  not reported as a passing full suite.

## Security checklist

- [ ] A5 preserves bounded raw reads, quarantine behavior and bounded resident
      memory while content allocation moves after filtering.
- [ ] A6 preserves private storage and cleanup; raw or unredacted transcript
      content is not newly persisted or logged.
- [ ] Existing session-id filename sanitization stays in effect. Any new
      temporary filename is code-owned, not a raw transcript identifier.
- [ ] Provenance roles, secret redaction, skill-invocation index validity, ledger
      fingerprints, and post-dream validation retain their existing meanings.

## Acceptance criteria

- [ ] AC1 — A1–A3 hold for Claude and Codex extracts: removed records and shortened
      content cannot reserve unusable content capacity; a fully fitting admission
      set has no content-budget truncations or content-capacity deferrals.
- [ ] AC2 — A3–A4 hold under real filtered-content overload, below the truncation
      floor, and when output metadata is larger than the source. The emitted
      compact-JSON sum respects the configured budget.
- [ ] AC3 — A5 holds with quarantine and raw-budget exhaustion alongside valid
      sessions, and the constrained-heap regression remains green.
- [ ] AC4 — A6–A7 hold for scratch contents, cleanup, result membership, deferral
      retry eligibility, truncation accounting and skill-invocation indices.
- [ ] AC5 — A8 is reflected in the ADR with the owner's approval recorded.
- [ ] AC6 — Repeating collection with identical inputs and ledger produces the
      same selected content and accounting and leaves no extra scratch artifacts.
      Collector scratch replacement is intentional; no install/sync idempotency
      claim is introduced.
- [ ] AC7 — Verification below passes; the regression assertions distinguish
      the previous raw-allocation behavior from the corrected contract.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- tests/unit/dream-collect.test.js tests/unit/transcript-stream.test.js tests/unit/transcripts.test.js
npm test
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-filtered-input-budget.md src/core/dream/scratch.js tests/unit/dream-collect.test.js docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md
git diff --check
```

The collector tests own AC1–AC4 and AC6. Parser/stream tests protect inherited
boundaries; full tests and lint cover integration and document validity. Review
the ADR amendment against A8 for AC5. For AC7, retain the new regression
assertions' actual failing output against the old collector and passing output
against the implementation. No fixture design or new verification tool is
prescribed by this spec. Existing-suite green on the base alone is not proof
that the defect is covered.

## Out of scope (do NOT do these)

- Raising or removing raw input caps; bypassing the shared reader; changing
  parser roles, message caps, secret detection, or provenance handling.
- Partial-session continuation, ledger reset/migration, replay of previously
  processed sessions, or changes to genuinely truncated-session retry semantics.
- Dream report changes (`WP-dream-report-run-skips`), installed-app integrity
  repair, scheduler changes, and personal vault edits.
- Token-based context sizing, config-default changes, new telemetry or metrics,
  and rewriting historical completed specs to describe the new implementation.

## Definition of done

0. Before dispatch, complete the design gate in
   `docs/runbooks/codex-review.md`, obtain owner sign-off including A8, and move
   the spec to `Ready`. Re-verify C1–C5 against the dispatch revision and record
   that SHA. Until then this document is a draft, not implementation approval.
1. Verification steps pass; attach their output and AC7 evidence to the PR.
2. Conventional commits on `wp/dream-filtered-input-budget`; PR title:
   `fix(dream): allocate capacity from filtered extracts (WP-dream-filtered-input-budget)`.
3. Fill the PR template, including "Decisions made", "Discovered issues", a
   WP-prefixed lesson, and `Generated-by:`.
4. Flip this spec to `In-Review` in the implementation PR.
5. Complete both PR review gates on the same tip, as defined in
   `docs/runbooks/codex-review.md`; findings must be clean or dispositioned.
   Merging remains the maintainer's step.
