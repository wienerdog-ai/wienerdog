---
id: WP-dream-filtered-input-budget
title: Allocate dream input capacity from filtered extracts
status: Done
model: opus
size: M
depends_on: [WP-119, WP-087, WP-dream-live-owner-lock]
adrs: [ADR-0004, ADR-0012, ADR-0023, ADR-0031]
---

# WP-dream-filtered-input-budget: Allocate dream input capacity from filtered extracts

> **Record, 2026-09-17 (post-merge, upstream integration) — no defect in what
> shipped.**
>
> Implemented on the fork (felho/wienerdog) and integrated upstream by PR #245
> (merge `b4af715e`, 2026-09-17). Fork gates: spec gate (wd-reviewer) APPROVE
> and independent gate (native Codex) "patch is correct", one round, no
> findings. Upstream re-review on the merged tree: boundary clean,
> implementation matches the canonical table, verdict INTEGRATE WITH
> FOLLOW-UPS. Merged tree: tests 2754 / pass 2742 / fail 0 / skipped 12; lint
> passed.
>
> **Recorded, not errata:** (i) default X 8,000,000 is below the parser's
> worst-case extract (`MAX_MESSAGES` 2000 × `MAX_MSG_CHARS` 4000,
> `src/core/transcripts/index.js`), so such a session is skipped as oversized
> indefinitely and, if alone, makes the run throw; remote in practice (largest
> measured extract 176,050 bytes); the spec does not reconcile the two
> constants. (ii) Oversized sessions are reported by console count only — no
> entry in `reports/warnings.md`, the digest, or `doctor`. (iii) No-backfill
> plus a nightly-growing large session can starve an older backlog item;
> accepted on the fork as "defaults cannot guarantee it"; the comment at
> `src/core/dream/ledger.js:203-205` now describes a hazard the code no
> longer mitigates. (iv) `WP-dream-report-run-skips` (Ready) is stale against
> the new collector and is routed to wd-architect for re-derivation. (v)
> capacity-vs-deadline tie-break at `remaining === 0`
> (`src/core/dream/scratch.js:91-97`) is implementer-chosen; Table A does not
> specify it.

<!-- errata above; the spec as it shipped follows -->

> **In-Review: implemented under the owner-ratified 2026-09-15 design.** The owner
> accepted P1–P4, including A10, and authorized continuation with implementation.
> The lock prerequisite landed in PR #66 at `81e09414`; this branch includes it.
>
> Joint design R3 approved revision
> `350050cfb71a25f1fb6b25980f561688c96c9f82` with no findings or scope objections.
> [Raw review](logbook/2026-09-15-dream-preprocessing-design-r3-raw.txt)
> was committed as `cfb15861` before inspection. This supersedes the pending
> gate notice; the earlier equal-share verdict still does not cover this design.

## Context (read this, nothing else)

The dream consolidates Claude Code and Codex transcripts into the user's vault.
The collector produces redacted JSON extracts in private scratch storage and
returns selected files to the orchestrator. Wienerdog is just files (ADR-0004):
no daemon, service, schedule or runtime dependency is introduced.

Today the collector allocates `dream_max_input_bytes` from raw transcript size
before parsing. Records omitted or shortened by filtering therefore reserve
capacity that useful content cannot use. A selected session may lose older
messages despite the full filtered input fitting. Successful truncated sessions
are recorded as processed, so the lost portion is not retried unchanged.

Separate useful content, resident memory and preprocessing work. The content
budget applies after filtering. Individual intake guards and one-session
memory remain. The existing 200 MiB aggregate raw-read cap bounds I/O/work,
not peak memory. Changing allocation and that cap requires ADR-0023 amendment;
retiring the old truncation/floor policy also amends ADR-0012. The separate
owner-approved live-owner lock prerequisite has landed in PR #66; A11 inlines
its relevant guarantee and residual, which this WP inherits.

## Current state

Original investigation base: `91668da62822c73be6115a3e6d06c6ec51462509`.
Author source re-check after merging the landed prerequisite:
`cb4ab182f19b5894f0e6135444b37a672a4e0a22`. C1–C5 remain true; the
collector, config, ledger, stream/parser and collector tests are unchanged from
the original base. The CLI change retains lock-first ordering and implements
A11; its capacity and processed-record behavior is unchanged. Re-verify these
executable claims at the exact implementation dispatch SHA:

| Claim | Current owner and observable behavior |
|---|---|
| C1 | `src/core/dream/scratch.js`, `collectExtracts(paths, ledger, maxInputBytes)`: obtains eligible files through `transcripts.discover(paths, { since: null })` and `ledgerLib.selectState`; quarantines files above the pre-read ceiling; allocates from `underCeiling.map((d) => d.size)` before calling `parseWithOutcome`. |
| C2 | The same function measures a parsed extract with `Buffer.byteLength(JSON.stringify(extract))`, but truncates only when `grant < d.size && serialized > grant`; it does not redistribute unused grants after parsing. |
| C3 | `src/core/transcripts/index.js`, `parseWithOutcome(entry, budget)`: applies the harness parser, shared secret redaction, a 4,000-character per-message cap and a 2,000-message newest-tail cap. `src/core/transcripts/stream.js`, `Limits` and `newRunBudget()`, own the separate raw intake bounds described in A6. |
| C4 | `scratch.js` writes extracts with `JSON.stringify(extract, null, 2)` and includes truncated selected files in `processed`. `src/cli/dream.js` records them through `recordProcessed` only after the existing successful-run and secret-disposition gates. |
| C5 | `tests/unit/dream-collect.test.js` already covers equal-share allocation, sub-floor deferral, quarantine exclusion, constrained-heap collection, and skill-invocation index rebasing. ADR-0023 Decision section 3 expressly allocates from discovery `size`. |

A synthetic reproduction on the original investigation base used a 400,000-byte
content budget.
The full filtered extracts occupied 212,674 compact JSON bytes, but collection
kept only 41,796; the substantial session retained 37 of 200 messages.
Provenance: the 2026-09-15 local `collectExtracts` reproduction recorded in
`docs/specs/logbook/2026-09-15-dream-filtered-input-budget.md`. These are
synthetic results, not a measurement of the owner's historical dream runs.

## Deliverables (permission boundary — touch ONLY these)

The boundary covers the ratified contract; the design gate and owner sign-off
are complete. Dispatch re-verification remains in Definition of done.

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | Table A admission, clock, memo consultation and classified results. |
| modify | src/core/dream/config.js | A5 configuration scalar and returned duration. |
| modify | src/core/dream/ledger.js | A7 optional memo round-trip without changing existing outcomes/counters. |
| modify | src/core/transcripts/stream.js | Budget-lifetime documentation only; preserve executable reader and constants. |
| modify | src/core/transcripts/index.js | Budget-lifetime documentation only; preserve executable filtering/parser behavior. |
| modify | src/cli/dream.js | A7–A9 wiring, memo persistence, diagnostics and zero-input outcomes. |
| modify | tests/unit/dream-collect.test.js | Collector and configuration contracts. |
| modify | tests/unit/ledger.test.js | Memo compatibility and existing outcomes. |
| modify | tests/unit/dream-pipeline.test.js | Persistence, dry-run and diagnostics. |
| modify | tests/integration/dream.test.js | Replace retired capacity/floor expectations and verify CLI outcomes. |
| modify | docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md | A10 owner-ratified amendment. |
| modify | docs/adr/0012-dream-run-lifecycle.md | A10 owner-ratified retirement of old capacity semantics. |

### Exact contracts

Table A owns semantics; the pseudotypes below name interface fields, not new
runtime schema files. Existing three-argument collector calls remain valid.

```js
collectExtracts(paths, ledger, maxInputBytes, {
  preprocessTimeoutMs = 60_000,
  now = () => performance.now(),
} = {})
// Synchronous; runtime clock is node:perf_hooks performance.now().
// readDreamConfig(configFile) adds preprocessTimeoutMs to its existing result.
// cleanScratch(stateDir) remains unchanged and returns undefined.
```

The optional clock is an internal verification seam, not a CLI flag. Retain
existing positive-finite X configuration behavior. Remove the obsolete
`MIN_TRUNCATE_BYTES` export and its CLI/test imports.

```text
Harness = 'claude' | 'codex'
Discovery = {
  harness: Harness, path: string, mtimeMs: number,
  size: number, dev: number, ino: number
}
Deferred = { harness: Harness, session_id: string, bytes: number }
OversizedMemo = {
  fingerprint: string, appVersion: string, extractBytes: number
}
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
  deferred: Deferred[], droppedForSize: number, dropped: Deferred[],
  truncated: Array<{
    harness: Harness, session_id: string,
    originalBytes: number, keptBytes: number
  }>,
  wrote: string[],
  deadlineDeferred: Deferred[], readDeferred: Deferred[],
  oversized: Array<Discovery & { extractBytes: number, cached: boolean }>,
  oversizedExtracts: Record<string, OversizedMemo>
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

Ledger version 1 gains optional top-level `oversizedExtracts` with the above map
shape; existing `files` records and baselines retain their current formats.
A minimal complete ledger with one memo is:

```json
{
  "version": 1,
  "baseline_mtime": { "claude": null, "codex": null },
  "files": {},
  "oversizedExtracts": {
    "/tmp/example.jsonl": {
      "fingerprint": "100:200:3:4",
      "appVersion": "0.13.0",
      "extractBytes": 9000000
    }
  }
}
```

Persist with existing pretty JSON, newline, atomic replacement and private
modes. A7 determines validity, omission and write timing. No transcript text
is in this memo. New read-only source dependency: running `package.json.version`.

Scratch remains `<paths.state>/dream-scratch/<harness>-<sanitized-session_id>.json`,
replacing session-ID characters outside `[A-Za-z0-9_-]` with `_`. Write
`JSON.stringify(extract, null, 2)` with no trailing newline. Preserve the parser's
home-prefix pseudonymization and path cap (160 characters plus marker), Claude's
optional skill-invocation indices and Codex's omission of that field. The
collector neither shortens nor rebases admitted extracts.

**Complete file example (unchanged format, illustrating A1 and A6–A8).** With
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
`deferred`, `dropped`, `truncated`, `deadlineDeferred`, `readDeferred` and
`oversized` are empty; `droppedForSize` is zero and `oversizedExtracts` is `{}`.

## Contract reference

ADR-0031 activates for changed interfaces, outcome taxonomy, time behavior and
collector/ledger/orchestrator authority boundaries. Table A is canonical.

### Table A — Content admission, work and outcomes

| ID | Contract | Rule |
|----|----------|------|
| A1 | Measurement — ACCEPTED | X is existing `maxInputBytes` from `dream_max_input_bytes` (default 8,000,000). Charge `Buffer.byteLength(JSON.stringify(extract))` after successful complete parsing, existing redaction and message caps, including metadata. Raw discovery size is never content demand. |
| A2 | Admission — ACCEPTED | Preserve ledger eligibility and existing newest-first order, including discovery order on equal mtimes. Process one eligible under-ceiling session at a time. Admit its complete filtered extract if it fits remaining X. At exact X, stop before another session. |
| A3 | Overflow — ACCEPTED | An extract at most X that exceeds remaining space is omitted and stops preprocessing; do not search older sessions for a smaller fit. An extract greater than X is instead reported, skipped, reserves no capacity and permits older candidates if time remains. Neither omission marks a session processed. A7 specifies skipping repeated parsing of known oversized sessions. |
| A4 | Completeness — ACCEPTED | Selected A1 sizes sum to at most X. No equal shares, minimum grants or budget-induced suffix truncation. Whole means the existing filtered extract, not every original transcript message. Spare capacity after A3 is intentional. |
| A5 | Deadline — ACCEPTED | Measure monotonic elapsed time from collector entry, including discovery, eligibility and scratch setup. Before each session parse require elapsed time strictly below `preprocessTimeoutMs`. Finish a started session through redaction, measurement and A2–A3 even after expiry. Optional top-level `dream_preprocess_timeout_seconds` accepts a positive finite number whose millisecond conversion is also finite; missing/invalid/nonpositive or overflowing conversion means 60 seconds. `readDreamConfig` returns milliseconds as `preprocessTimeoutMs`; CLI passes it to collection. The model timeout remains independent; A11 supplies the prerequisite lock assumption. This is no hard interruption/checkpoint. The default is an initial policy judgment, not measured throughput. |
| A6 | Work and storage — ACCEPTED | Remove the shared 200 MiB aggregate collector budget. Each session receives a fresh existing `newRunBudget()`: 200 MiB remains a finite emergency per-session read-work bound, not a peak-memory claim. Preserve executable reader/parser behavior, the 50 MiB discovery ceiling, 1 MiB line cap, 500,000-line cap, 64 KiB chunks and depth 64. A reported `runExhausted` discards the partial extract into A8 read deferral and permits later candidates subject to A5. Retain one session's parsed content plus corpus metadata; selected extracts live in private 0700/0600 scratch. No corpus staging or new raw/unredacted copies. Before brain access, scratch contains selected final pretty JSON only. Preserve reset, cleanup, write-error propagation and untouched sources. |
| A7 | Oversized memo — ACCEPTED | Add optional top-level `oversizedExtracts` to ledger version 1, separate from `files` outcomes. Store complete oversized measurements as the specified memo keyed by existing `foldKey(path)`; use existing size/mtime/dev/ino fingerprint and running `package.json.version`. Consult only after `selectState` permits selection and the discovery ceiling passes. Matching fingerprint/version with measured bytes greater than current X permits skip without parsing (`cached: true`). Changed fingerprint/version or X sufficient to fit the measurement requires fresh parsing; smaller/insufficient X changes do not. Missing/malformed memo means parse. Accept only object records with string fingerprint/version and positive safe-integer bytes; no coercion. Return a replacement map without mutating the input ledger. Missing and empty maps are semantically equivalent; invalid memo data does not invalidate existing files records or baselines. Prune absent paths, invalid/changed records, ledger-ineligible paths and freshly measured non-oversized records; retain valid unvisited records behind stops. Real CLI runs atomically persist a changed map via the existing ledger writer before idle/brain branches, preserving files/baselines/counters; dry-run never persists it. Later brain failure does not invalidate size evidence. Older code may drop the optional map, causing extra retries. |
| A8 | Accounting — ACCEPTED | Only selected full extracts enter `entries`, `wrote` and `processed`. Quarantine reasons remain unchanged. `deferred` includes the remainder-overflow session and unvisited candidates excluded by that capacity stop, or candidates after exact X. `dropped` remains the same-array alias; `droppedForSize` equals its length. `deadlineDeferred` contains unvisited candidates excluded by A5; `readDeferred` contains reported incomplete reads. `oversized` contains fresh or matching-memo oversized exclusions encountered before stopping, with discovery metadata, measured bytes and cache flag. Each eligible under-ceiling candidate belongs to one selected/quarantined/deferred/deadlineDeferred/readDeferred/oversized category. A stop labels unvisited candidates by its cause without asserting unknown filtered sizes. Previously ledger-skipped files are outside these categories. `truncatedToFit` is false, `truncated` empty; parser `Extract.truncated` can remain true. Deferred `bytes` stays raw discovery size. |
| A9 | CLI — ACCEPTED | Replace old truncation/floor/wedge narration with separate nonzero counts for capacity-stop exclusions, deadline exclusions, individually oversized sessions and incomplete reads. Oversized output names X and suggests `dream_max_input_bytes`; deadline output names `dream_preprocess_timeout_seconds`. New messages interpolate no transcript text, IDs or paths. Dry-run shows the same separate counts and no truncation/floor line; existing physical-byte total stays physical. With selected inputs, continue normal dream. With none and any oversized/deadline/read exclusion, real run throws actionable `WienerdogError` after memo/quarantine persistence; dry-run diagnoses and returns. For mixed causes report each and summarize that no complete session was admitted, rather than blaming X alone. With no selections/exclusions preserve idle behavior, including quarantine-only handling. Existing successful-run/secret gates remain unchanged. |
| A10 | ADRs — OWNER-RATIFIED 2026-09-15 | Append dated amendments retaining historical text. ADR-0023 supersedes section 3 raw allocation and section 1 aggregate read-work policy with A1–A8, including independent memo and no new quarantine reason. ADR-0012 capacity amendments lose equal-share, floor, truncated-processed and old wedge semantics in favor of A2–A4/A9. Preserve unrelated lifecycle, secret-revert and quarantine-surface amendments, including the prerequisite lock amendment in A11; this WP does not revise its recovery policy. Record owner approval only when given. |
| A11 | Lock prerequisite — LANDED, owner-approved separate WP | Dispatch only after `WP-dream-live-owner-lock` lands. An expired established same-host owner observed alive or EPERM retains its lock; unknown ownership is not automatically replaced. Expired proven-dead local ownership remains automatically recoverable. This covers authorized preprocessing overrun, brain and cleanup without summing nominal durations. It retains the owner-accepted existing read/probe-to-overwrite race between simultaneous stale claimants; it is not a universal stale-recovery exclusion guarantee or a proof of child reaping. The prerequisite owns lock implementation and ADR-0012 part-6 changes; this WP inherits them without changing lock payload, acquisition ordering or recovery policy. |

Examples defer to A1–A4, newest to oldest, decimal compact JSON bytes:

- X=400,000; extracts 210,000 and 3,000: admit both even if raw files are megabytes.
- X=8,000,000; selected 7,000,000; next 2,000,000: omit it and stop with 7,000,000.
- X=8,000,000; next 9,000,000 then 2,000,000: skip the first; admit the second if time remains.
- X=8,000,000; selected 7,000,000; next 1,000,000: admit it and stop exactly at X.

### Mirrored Surface Checklist

This section registers the existing document from frontmatter through completion.
Table A owns operative content/work behavior and the inherited lock assumption.
Historical evidence stays historical; process requirements keep their repo owner.

- [x] Frontmatter/title and opening notice: content scope and owner-ratified
      labels mirror A1–A10; the landed lock dependency mirrors A11. Other dependency
      lineage and lifecycle status are historical/process metadata.
- [x] Context: ratified behavior and amendment/dependency boundaries defer to
      A1–A11; descriptions of the existing defect remain historical.
- [x] Current state, C1–C5 and synthetic reproduction provenance: retain their
      inspected revision and historical labels; never recast them as fixed-state
      evidence. Referenced future behavior defers to Table A.
- [x] Deliverables and Exact contracts, including signatures, pseudotypes,
      configuration, memo/file examples and accompanying prose: defer to A1–A11.
- [x] Contract reference activation and this checklist describe ownership;
      Table A is canonical, and the stopping examples mirror A1–A4.
- [x] Implementation notes & constraints, including Owner-ratified choices, and
      Security checklist: defer to A1–A11 for their operative facts.
      Inherited code limitations and baseline failure evidence remain historical.
- [x] Acceptance criteria and Verification steps, including explanatory test
      ownership: behavioral assertions defer to A1–A10; red/green evidence and
      verification requirements retain their repo-process authority.
- [x] Out of scope: retained guard/filtering, state/reporting and lock boundaries
      defer to A6–A11; adjacent work remains outside the Deliverables boundary.
- [x] Definition of done: owner ratification and prerequisite dispatch mirror
      A5–A11; PR, status and independent review requirements are process facts.
- [x] Cross-document mirrors: ADR amendments defer to A10, the design package
      summarizes Table A, and the pending report WP re-verifies A8 before its
      dispatch. A11 inherits the prerequisite's full lock contract and residual.
- [x] Register newly found mirrors; update affected canonical rows and every
      registered mirror together in the same commit, without an intermediate
      commit containing disagreement.

## Implementation notes & constraints

### Owner-ratified choices

| Accepted choice | Choice and trade-off |
|---|---|
| P1 — A5 | Configurable 60-second soft admission allowance. Adjustable and unmeasured; neither catch-up nor maximum total runtime is promised. |
| P2 — A6 | Remove aggregate raw cap; retain existing finite mechanism per session. Avoid a second work knob or new reader behavior. |
| P3 — A7 | Persist only oversized-size metadata in the ledger. Avoid repeated futile parsing at the cost of optional state. Source/package changes or sufficiently raised X trigger retry. Same-version development/runtime changes are not detected; releases must change package version. No expiry or content cache. |
| P4 — A8–A10 | Separate CLI counts and actionable failure when no complete input can be admitted; capacity-only legacy aliases and two narrow ADR amendments. Report extensions stay in their existing WP. |

- The owner accepted all P1–P4 on 2026-09-15, including A10 ratification,
  and authorized implementation after landing the lock prerequisite. These are
  the unchanged choices approved by joint design R3; no new design is introduced.
- A11 landed separately in PR #66 at `81e09414`. Its accepted residual remains
  unchanged; this WP does not broaden the lock guarantee.
- `selectState` remains authoritative for processed records, intake quarantine,
  sticky secret-revert exhaustion and baselines. The memo never replaces those
  outcomes or resets secret counters.
- Preserve the existing 64 MiB constrained-heap regression's resource bound;
  increasing its heap or reducing its corpus is not a fix.
- The 50 MiB ceiling uses discovery size. The existing reader can observe live
  appends and uses discovery size when deciding budget exhaustion versus EOF.
  A6 preserves this inherited race; it does not promise 50 MiB of read bytes
  for a growing source. Snapshot reads/new stability gates are separate hardening.
- Compact JSON, pretty disk bytes and model tokens are different measures.
  Selected disk output plus bounded current-session/finalization overhead replaces
  any need to stage a complete corpus.
- Newest-first priority and unused remainder are deliberate. Backlog drains only
  when capacity exceeds new/changed demand on average; defaults cannot guarantee it.
- `WP-dream-report-run-skips` is Ready but unimplemented on the inspected base.
  Its `sel.dropped.length` remains capacity-only under A8. Its own dispatch
  re-verification must distinguish new deadline/oversized/read exclusions before
  claiming complete run-skip coverage. This WP changes CLI output only; do not
  edit that sibling spec or implement report work under this boundary.
- No golden fixture changes. Local implementation choices go in the PR.
- Historical baseline failure: `tests/integration/adopt-e2e.test.js` rejected a
  resolved Claude executable path differing from its pin when Node and Claude
  shared a binary directory. A byte-identical Node in a private runtime-only
  PATH resolved that environment conflict; the unchanged-source full baseline
  and both lock PR gates passed with that setup. The lock execution logbook
  records the setup and output. Preserve identity checks and tests; use and
  disclose that runtime-only PATH for local verification. The original command
  environment was not repaired or waived.

## Security checklist

- [x] A6 preserves individual guards, private storage, cleanup and bounded
      one-session memory; no new raw/unredacted storage or logging.
- [x] Session-ID filename sanitization remains; new temporary names are code-owned.
- [x] A7 memo validation defaults to fresh parsing and never overrides ledger
      eligibility, counters or successful-dream authorization.
- [x] Existing provenance roles, redaction and skill indices retain their meaning.

## Acceptance criteria

- [x] AC1 — A1–A4 hold for both harnesses, exact fit, remaining-space stop,
      individually oversized skip and metadata larger than source. No budget truncation.
- [x] AC2 — A5 holds for default/override/fallback and monotonic admission,
      including expiry during parsing and post-parse work.
- [x] AC3 — A6 preserves individual guards/constrained heap; collection can cross
      the old aggregate 200 MiB when time and X permit. Reported partial reads
      never become processed or persisted extracts.
- [x] AC4 — A7 holds for cache hits, fingerprint/version/X changes, malformed
      memo, pruning and ledger round-trips; existing outcomes/counters are preserved.
- [x] AC5 — A8–A9 hold for disjoint counts, selected-only scratch/results, ordinary
      retry, mixed zero-input causes, real persistence and dry-run non-persistence.
- [x] AC6 — Repeating collection with identical inputs, ledger, settings and
      admission clock decisions yields second run: zero changes to selected
      content, accounting, final scratch bytes or artifacts. An unchanged memo
      is not rewritten by real runs. Real timed runs can admit different sets;
      scratch recreation/mtime changes remain permitted.
- [x] AC7 — A10 appears in both ADRs with actual owner approval.
- [x] AC8 — Regression assertions fail against the old raw-budget collector and
      pass against implementation; verification below passes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- tests/unit/dream-collect.test.js tests/unit/ledger.test.js tests/unit/dream-pipeline.test.js tests/integration/dream.test.js tests/unit/transcript-stream.test.js tests/unit/transcripts.test.js
npm test
npm run lint
node scripts/boundary-check.js docs/specs/WP-dream-filtered-input-budget.md src/core/dream/scratch.js src/core/dream/config.js src/core/dream/ledger.js src/core/transcripts/stream.js src/core/transcripts/index.js src/cli/dream.js tests/unit/dream-collect.test.js tests/unit/ledger.test.js tests/unit/dream-pipeline.test.js tests/integration/dream.test.js docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md docs/adr/0012-dream-run-lifecycle.md
git diff --check
```

Collector/config tests own AC1–AC3 and collection repeatability. Ledger tests own
AC4; pipeline and dream integration tests own AC5 and durable non-churn. Stream/parser tests protect
inherited behavior. Review ADRs against A10 for AC7. Retain actual old-collector
red and implemented green output for AC8; existing-suite green alone proves no
regression assertion. Test construction belongs to the implementer.

## Out of scope (do NOT do these)

- Lock implementation/recovery policy — `WP-dream-live-owner-lock` owns A11.
- Raising/removing individual intake guards, executable reader/parser changes,
  new filtering, secret detection or provenance handling.
- Partial checkpoints, ledger reset, replay of previously processed sessions,
  durable extract cache, new source-stability guarantees.
- Dream reports (`WP-dream-report-run-skips`), installed-app integrity repair,
  scheduler changes and personal vault edits.
- Token-based sizing, unrelated configuration, telemetry, rewriting historical
  completed specs or unrelated ADR clauses.

## Definition of done

0. The design gate and owner decisions P1–P4, including A10 ratification, are
   complete; A11 landed in PR #66. Before implementation, re-verify current
   executable claims against the exact dispatch SHA, including the inherited
   lock behavior and accepted residual, and record that SHA in the logbook.
1. Verification passes; attach output and AC8 evidence to the PR.
2. Conventional commits on `wp/dream-filtered-input-budget`; PR title:
   `fix(dream): allocate capacity from filtered extracts (WP-dream-filtered-input-budget)`.
3. Fill the PR template, including Decisions made, Discovered issues,
   WP-prefixed lessons and `Generated-by:`.
4. Flip this spec to In-Review in the implementation PR.
5. Both PR review gates run on the same tip per `docs/runbooks/codex-review.md`;
   findings are clean or dispositioned. Merging remains the maintainer's step.
