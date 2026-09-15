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

> **Draft: accepted selection policy, remaining details open.** The owner
> accepted newest-first whole-session admission and the soft deadline below.
> Oversized-session retry rules, work-budget defaults/configuration, and the
> final permission boundary still need resolution before implementation.
> [The design package](logbook/2026-09-15-dream-preprocessing-design-package.md)
> records these decisions. The earlier design verdict applies only to its
> recorded revision, not to this replacement of equal-share allocation.

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

The current intake guards include a 50 MiB file ceiling, 1 MiB line cap,
500,000 lines per file, a shared 200 MiB read budget per run, 64 KiB read chunks,
and JSON depth 64. The aggregate read budget bounds I/O/work, not peak memory.
Keep the individual guards and one-session-at-a-time memory constraint while
revisiting that aggregate limit separately. ADR-0023 Decision §3 currently
mandates raw-size allocation; the final amendment must cover the selected
content and work policies. Architectural approval remains a pre-dispatch gate.

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

**Provisional boundary, not dispatchable.** The paths below cover the original
collector change. Finalize additional stream, CLI/configuration, reporting,
ledger and test paths after resolving A5 and A7. They are not implicitly
editable. Resolve the exact new interfaces and verification commands before
Ready; unresolved behavior must not be left to implementation discretion.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | Implement Table A within the existing collector and cleanup exports. |
| modify | tests/unit/dream-collect.test.js | Verify Table A and preserve relevant existing coverage. |
| modify | docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md | After owner approval, append the Table A A8 amendment; retain the historical decision text. |

### Exact contracts

The current synchronous `collectExtracts(paths, ledger, maxInputBytes)` result
and scratch-file structure are inlined below as documentation pseudotypes,
not new runtime validation. Preserve the extract format and `cleanScratch`.
Finalize any collector argument/result changes for the deadline and oversized
reporting before Ready. `MIN_TRUNCATE_BYTES` is a legacy export, not an admission
threshold in this policy; resolve its callers and diagnostics in the final
boundary. Table A owns selection, storage and accounting semantics.

```text
Harness = 'claude' | 'codex'
Discovery = {
  harness: Harness, path: string, mtimeMs: number,
  size: number, dev: number, ino: number
}
Deferred = { harness: Harness, session_id: string, bytes: number }
CollectorResult = {
  entries: Array<{
    harness: Harness, session_id: string, mtimeMs: number,
    scratchFile: string, truncatedToFit: boolean
  }>,
  scratchDir: string,
  processed: Discovery[],
  newlyQuarantined: Array<Discovery & {
    reason: 'over-ceiling' | 'too-many-lines' | 'read-error'
  }>,
  deferred: Deferred[],
  droppedForSize: number,
  dropped: Deferred[],
  truncated: Array<{
    harness: Harness, session_id: string,
    originalBytes: number, keptBytes: number
  }>,
  wrote: string[]
}
Extract = {
  harness: Harness, session_id: string, started: string | null,
  cwd: string | null, source_path: string, truncated: boolean,
  messages: Array<{
    role: 'user' | 'assistant' | 'tool_result', text: string, ts: string | null
  }>,
  skill_invocations?: Array<{
    skill: string, index: number, resultIndex: number | null, errored: boolean
  }>
}
```

`collectExtracts` returns `CollectorResult`; `cleanScratch` returns `undefined`.
Scratch lives at `<paths.state>/dream-scratch`. Each selected extract is written
as `<harness>-<sanitized-session_id>.json`, replacing each session-id character
outside `[A-Za-z0-9_-]` with `_`. `scratchDir`, `scratchFile` and `wrote` carry
those filesystem paths. `Discovery.path` is the source transcript path; its
`size`, `dev` and `ino` remain discovery metadata and are not extract fields.
In extract metadata, the parser replaces the user's home prefix with `~` and
caps paths at 160 characters plus a `…` marker. Claude includes
`skill_invocations` (possibly empty); Codex omits it. Its indices are zero-based
positions in `messages`, with `resultIndex: null` when no paired result was
captured. Preserve the parser's existing values and valid indices; the collector
does not shorten or rebase whole admitted extracts.

No extract-field change is proposed. The configuration surface, oversized
reporting and retry metadata remain open; the current result schema above does
not prescribe new outcome fields or authorize a ledger schema change.
Scratch files use `JSON.stringify(extract, null, 2)`, with no trailing newline.

**Complete file example (unchanged format, illustrating A1 and A6–A7).** With
an empty ledger, only this source file, `maxInputBytes = 400000`,
`paths.claudeDir = /tmp/wd-example/claude` and
`paths.state = /tmp/wd-example/state`, the source
`/tmp/wd-example/claude/projects/demo/example.jsonl` contains this one JSONL
record followed by a newline (the example paths are outside the user's home):

```jsonl
{"type":"user","sessionId":"example","cwd":"/work/demo","timestamp":"2026-09-15T10:00:00.000Z","message":{"role":"user","content":"Remember the release checklist."}}
```

The complete `/tmp/wd-example/state/dream-scratch/claude-example.json` is:

```json
{
  "harness": "claude",
  "session_id": "example",
  "started": "2026-09-15T10:00:00.000Z",
  "cwd": "/work/demo",
  "source_path": "/tmp/wd-example/claude/projects/demo/example.jsonl",
  "truncated": false,
  "messages": [
    {
      "role": "user",
      "text": "Remember the release checklist.",
      "ts": "2026-09-15T10:00:00.000Z"
    }
  ],
  "skill_invocations": []
}
```

The result has one entry with `truncatedToFit: false`, one matching discovery
record in `processed`, and that scratch path in `wrote`. `newlyQuarantined`,
`deferred`, `dropped` and `truncated` are empty; `droppedForSize` is zero.

## Contract reference

Activated by ADR-0031 criteria (iv), (v), and (vii): capacity-deferral decisions
change, the collector emits selections whose persistence the orchestrator owns,
and the decision is mirrored in ADR-0023. Table A is canonical for this WP.

### Table A — Content allocation and its boundaries

| ID | Contract | Rule |
|----|----------|------|
| A1 | Content measurement | Use the complete extract returned by a successful parse after existing filtering, redaction and caps. Charge `Buffer.byteLength(JSON.stringify(extract))`, including metadata. Raw discovery `size` is not a content demand. X is the existing `maxInputBytes` setting. |
| A2 | Admission order and stopping | The ledger remains the eligibility authority. Process eligible under-ceiling files one at a time in existing newest-first order. Admit a complete extract if it fits the remaining X budget. Stop immediately when selected content equals X. If an extract is at most X but exceeds the remaining space, omit that session from this run and stop; do not search older sessions for a smaller fit. Check the A5 deadline before starting each session. |
| A3 | Individually oversized sessions | If a completed extract exceeds X even with an empty selection, report and skip it, then continue older candidates subject to A2 and A5. It reserves no content capacity and is never recorded as processed. Distinguish this outcome from an ordinary remaining-space deferral. Retry/invalidation triggers and reporting surface are unresolved: prevent repeatedly reparsing an unchanged impossible-to-fit session without making it permanently ineligible after relevant input or budget changes. Finalize this contract before Ready. |
| A4 | Output bound and completeness | The sum of A1 sizes of emitted extracts must not exceed X. Admit whole filtered extracts or omit them; no equal shares, minimum truncation grants, or collector-induced message truncation. Existing parser caps remain in force: a whole filtered extract is not a promise to preserve every source message. An extract exactly equal to the remaining space fits. Unused capacity after the A2 stop is acceptable. |
| A5 | Intake, memory and work | Preserve individual file, line, line-count, chunk and depth guards and one-session-at-a-time parsed-content memory plus corpus metadata. Use a soft preprocessing admission deadline measured by monotonic elapsed time: after expiry start no new session, but finish the current session including post-parse redaction and apply A2–A4. Finalize the selected output. This is not a hard completion timeout. The duration, exact clock boundary/interface and optional aggregate raw-byte guard remain open; the current 200 MiB is not mandated as a memory guard. Any additional guard must have explicit exhaustion/progress semantics consistent with this contract before Ready. |
| A6 | Storage and lifecycle | Retain selected extracts in private run scratch, not a corpus-wide array or a staging set of every measured candidate. Temporary extracted content must already be redacted and use existing 0700/0600 protections. Remove unselected/intermediate files before the brain can inspect scratch. `wrote`, `entries`, and `processed` describe only final selected extracts. Preserve reset, cleanup and failure propagation; do not mutate transcripts. Storage must account for selected pretty JSON plus bounded current-session/finalization overhead; no corpus-wide staging budget is assumed. |
| A7 | Results and persistence | Preserve existing quarantine reasons, discovery fingerprints and downstream successful-run/secret gates. Ordinary remaining-space deferral and deadline exclusion create no processed record or partial-session progress; they remain retryable. Only selected whole extracts enter `processed`. If legacy result fields are retained, `truncatedToFit` is false and `truncated` is empty; parser `Extract.truncated` may still be true. Deferred `bytes` remains raw discovery size for compatibility, never an admission input. Finalize oversized skip reporting/retry metadata and deadline accounting, including implications for `dropped`/`droppedForSize`, before Ready. |
| A8 | ADR amendment | Append a dated amendment explicitly superseding Decision §3's raw-size allocation with A1–A4's whole-extract admission policy. Retain the one-session-at-a-time memory constraint. Describe the finalized A5 work policy and A7 outcome/retry semantics, identifying changes to the old aggregate limit. Preserve historical signatures and unrelated amendments; record owner approval only after it is given. |

**Examples (newest to oldest; compact JSON bytes).** With X = 400,000 and
filtered demands of 210,000 and 3,000, keep both whole even if each raw file is
several megabytes. With X = 8,000,000 and 7,000,000 already selected, the next
2,000,000-byte extract is omitted from this run and collection stops with
7,000,000; it is eligible for a later run. With an empty selection and
X = 8,000,000, a 9,000,000-byte extract is reported and skipped; a following
2,000,000-byte extract can still be admitted if time remains. A 3,000-byte
extract fits a 3,000-byte remainder and stops further preprocessing. There is
no 32,768-byte admission floor.

### Mirrored Surface Checklist

- [ ] Deliverables and Exact contracts defer to Table A.
- [ ] Exact contracts' result/extract schema and complete scratch-file example
      preserve the existing format and defer to A1 and A4–A7 for behavior.
- [ ] Acceptance criteria reference Table A rather than deciding separate rules.
- [ ] The ADR amendment reflects A8 and cites this WP for its scope.
- [ ] Examples remain consistent with A1–A4.
- [ ] Current-state C1–C5 remain explicitly historical; implementation updates
      neither their base revision nor the reproduction to pretend they were fixed earlier.
- [ ] Any additional mirror found during review is registered and updated with
      its canonical row in the same commit.

## Implementation notes & constraints

- This changes collector selection and preprocessing work limits, not filtering.
  `transcripts/index.js` owns the meaning of filtered content; the collector must not invent a second
  filtering or secret-redaction path. Algorithm and temporary representation
  choices belong to the implementer, subject to Table A.
- Preserve the existing 64 MiB constrained-heap regression's resource bound.
  Increasing the heap or reducing its corpus is not a fix for A5.
- The budget retains the existing compact-JSON metric. Pretty-print whitespace
  contributes to the CLI dry-run's on-disk byte count, so that number may exceed
  the content budget. This WP does not redefine it as a model-token budget or
  promise to bound the brain's entire context.
- Whole-session admission deliberately trades utilization for simpler progress:
  stop at the first ordinary remainder overflow and retry it later. Newest-first
  priority is intentional. Older backlog drains only if available capacity
  exceeds new/changed eligible demand on average; defaults cannot guarantee
  catch-up under sustained overload.
- No partial-session checkpoints or recovery of previously omitted history.
  Oversized retry metadata, if chosen, records eligibility rather than partial
  transcript progress; its exact scope is still unresolved.
- ADR-0023 amendments concerning secret reverts and quarantine reporting remain
  in force. Coordinate the required oversized-session diagnostic with
  `WP-dream-report-run-skips`; finalize ownership and paths before Ready.
- No golden fixture changes. Record remaining local implementation choices in
  the PR's "Decisions made"; do not expand the permission boundary.
- Baseline verification found one unrelated full-suite failure:
  `tests/integration/adopt-e2e.test.js` rejects a resolved Claude command path
  that differs from its pin. The logbook records the run. This WP does not
  authorize changing executable identity checks or that test; a still-failing
  baseline must be resolved or dispositioned through the repo's review process,
  not reported as a passing full suite.

## Security checklist

- [ ] A5 preserves individual intake guards, quarantine behavior and bounded resident
      memory while content allocation moves after filtering.
- [ ] A6 preserves private storage and cleanup; raw or unredacted transcript
      content is not newly persisted or logged.
- [ ] Existing session-id filename sanitization stays in effect. Any new
      temporary filename is code-owned, not a raw transcript identifier.
- [ ] Provenance roles, secret redaction, skill-invocation index validity, ledger
      fingerprints, and post-dream validation retain their existing meanings.

## Acceptance criteria

- [ ] AC1 — A1–A2 hold for Claude and Codex: omitted records and shortened text
      consume no content capacity; full fitting extracts are admitted whole.
- [ ] AC2 — A2–A4 hold for exact fits, remaining-space overflow, individually
      oversized sessions and metadata larger than source. Overflow stops;
      individually oversized sessions allow later candidates. No minimum-grant
      rule or content-budget truncation remains. The compact sum stays at most X.
- [ ] AC3 — A5 holds: deadline expiry starts no new session, completes the current
      session including redaction and applies the content bound. Preserve the
      constrained-heap and individual intake-guard coverage. Finalized additional
      work guards must have corresponding exhaustion/progress coverage.
- [ ] AC4 — A6–A7 hold for private scratch contents, cleanup, selected-only result
      membership and ledger processing, ordinary deferral retry and parser skill
      indices. Cover oversized diagnostics and retry/invalidation once specified.
- [ ] AC5 — A8 is reflected in the ADR with the owner's approval recorded.
- [ ] AC6 — Repeating collection with identical inputs, ledger, settings and the
      same session-admission clock decisions yields second run: zero changes to
      selected content, accounting or final scratch bytes, and no extra artifacts.
      Real timed runs can admit different sets under different machine load.
      Scratch replacement and mtime changes remain permitted; no install/sync
      idempotency claim is introduced.
- [ ] AC7 — Finalized verification below passes; regression assertions distinguish
      the previous raw/equal-share behavior from whole-extract admission.

## Verification steps (run these; paste output in the PR)

The commands below are the existing baseline set. Extend test ownership and the
literal boundary-check paths after resolving the provisional Deliverables;
this list is not yet sufficient to dispatch the revised work package.

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

- Raising or removing individual intake guards; bypassing the shared reader;
  changing parser roles, message caps, secret detection or provenance handling.
  The aggregate run-work limit is explicitly under revision in A5.
- Partial-session continuation, ledger reset, replay of previously processed
  sessions or a durable extract cache. Any oversized eligibility metadata needs
  an explicit contract and permission boundary before implementation.
- Dream report changes (`WP-dream-report-run-skips`), installed-app integrity
  repair, scheduler changes, and personal vault edits.
- Token-based context sizing, unrelated config changes, new production telemetry,
  and rewriting historical completed specs to describe the new implementation.

## Definition of done

0. Resolve A3/A5/A7, finalize exact interfaces, Deliverables and verification,
   then complete a fresh design gate in `docs/runbooks/codex-review.md`.
   Obtain owner sign-off including A8, and move
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
