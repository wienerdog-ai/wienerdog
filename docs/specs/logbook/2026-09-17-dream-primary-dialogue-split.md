---
date: 2026-09-17
title: "Splitting WP-dream-primary-dialogue-filter: round zero"
related_wps: [WP-dream-primary-dialogue-projection, WP-dream-primary-dialogue-collection, WP-dream-primary-dialogue-filter, WP-dream-report-run-skips]
---

# Splitting the primary-dialogue family: round zero

## What was done

The maintainer feedback
([2026-09-17](2026-09-17-primary-dialogue-filter-maintainer-feedback.md)) asked
for one split: Tables A and B into a projection-first package, Tables C and D
parked behind an offline evaluation. Sizing the first half honestly made it
**two** packages rather than one — 16 files, two contract tables, an ADR
amendment and a measurement is an L, and the template forbids L. The cut is the
one the brief named: parsers plus projection versus collector plus gate plus
skill.

| Spec | Size | Model | Status | What it carries |
|---|---|---|---|---|
| `WP-dream-primary-dialogue-projection` | M | opus | Draft | Tables A and B: the deterministic projection, the text-free gate projection, `intakeBytes` |
| `WP-dream-primary-dialogue-collection` | M | opus | Draft | Tables C and D: the collector, the gate wiring, the dream skill, the ADR-0020 amendment, the admitted-count measurement |
| `WP-dream-primary-dialogue-filter` | M | opus | Draft (**parked**) | Tables C and D of the predecessor draft, renamed C and D here; the offline evaluation moved from AC5 to the entry condition |

All three carry `epic: dream-primary-dialogue`. The filter's id is unchanged so
the fork's references still resolve.

## The design decision behind the split

The predecessor draft's B1 measured `dream_max_input_bytes` against the
**projected** extract. That is what makes the assessment's F1 worse: a smaller
extract means more sessions fit the same byte bound, and every admitted session
is marked processed whether the consolidation agent read it or not (198 marked,
20 read on the measured night).

The split instead measures the bound against the **raw capped extract**, which
is byte-identical to what `src/core/dream/scratch.js:118` computes today. The
admitted session set is then unchanged by construction. Three consequences:

- The maintainer's three options — a lower default X, a session-count bound, an
  explicit acceptance — are all avoided rather than chosen between, and the
  measurement becomes a confirmation rather than a sizing exercise.
- The predecessor's B4 size-memo format discriminator is **unnecessary and was
  dropped**: the measured quantity does not change, so existing
  `oversizedExtracts` memos stay valid. `src/core/dream/ledger.js` left the
  Deliverables boundary entirely, verified by `scripts/boundary-check.js`.
- A session-count bound would have had to classify its remainder through the
  existing capacity arm, whose console line tells the user to raise
  `dream_max_input_bytes` — advice that would no longer release those sessions.
  `WP-dream-report-run-skips`'s rows B4 and B12 stay true untouched because the
  five arms are populated identically.

This reading of the scope record differs from its literal wording, so it is
routed as owner item 1 in both new specs with its overrule cost priced.

Two further predecessor contracts were dropped rather than carried: **exchange
blocks (A6)**, because their only consumer is the parked relevance stage and a
persisted field with no consumer is a contract that can only rot — the filter
now derives them internally (its row C0); and the **legacy fallbacks** for a
Claude assistant record without `stop_reason`, a Codex assistant message without
`phase`, and a JSON-string form of the Codex metadata object, because none of
the three appears anywhere in the local corpus and each would have been an
unclosable acceptance rule written from no evidence.

## Transcript-format re-derivation

Structure only — record types, field names, enum values and counts. No message
content was read into the repo. Sample: 50 newest Claude files (16,218 records)
and 50 newest Codex rollouts, plus a full-corpus pass for one question.

**Reproduced.** The Claude parser ignores ordinary `text` blocks in
array-valued user content (14 blocks in 12 records; reproduced live against the
real parser, which drops the block). Codex developer messages map to
`role: 'user'` (165 sampled). `custom_tool_call_output` normalizes to empty
text — sharpened: the payload is under `output` (array 4,175, string 247) and
`content`, which `codex.js:91` tests, occurs in **0** of 4,422 records.

**Did NOT reproduce, and no rule rests on either.** The predecessor draft
reported 17 of 70 Codex files carrying a later `session_meta` with another
identity; this sample found **no** file with more than one `session_meta`
(0/50). Its design-review entry reported no `event_msg.user_message`; this
sample found **80**.

**New, and load-bearing.** `content_item_kinds` is index-parallel to
`payload.content` in 177/177 messages with 0 length mismatches, and
`kind == "user.text"` co-occurs with `content[i].type == "input_text"` 2,954
times and with any other block type 0 times — so A3 may index the two arrays,
and must fail closed on unequal lengths. The other four kinds
(`agents_md.instructions`, `environments.environment_context`,
`plugins.recommendations`, `goal.internal_context`, 145 occurrences) **also ride
`input_text` blocks**, which is why the rule keys on the kind rather than the
block type. `thread_source == "subagent"` (32/50) is the one field-and-value
that marks a Codex subagent's own rollout; `parent_thread_id` presence
over-matches, catching 5 `guardian_review` forks too. `isSidechain: true`
occurs **0 times in 72,841 records across the full 236-file corpus**, so A4's
Claude clause has no observed positive and needs a constructed fixture.

## The headless-prompt question, measured

Across 7 genuine headless dream-job transcripts and 53 interactive ones, the
first `user` record carries the **identical** top-level field set — `cwd`,
`entrypoint`, `gitBranch`, `isSidechain`, `message`, `parentUuid`,
`permissionMode`, `promptId`, `promptSource`, `sessionId`, `timestamp`, `type`,
`userType`, `uuid`, `version` — with `isMeta` absent and `userType` `"external"`
on both. `entrypoint` looks like a discriminator and is not: its `cli`/`sdk-cli`
split follows client version and mixes headless and interactive files on both
sides.

So the projection **cannot** distinguish a `claude -p` routine prompt from a
human one, and no heuristic is added to pretend otherwise. A5's definition of
`derived_from_untrusted: false` is written to claim only what was observed:
code saw this text in a record the harness attributes to the user, with no tool
output or context gap before it — never "a human typed this".

## Round zero — internal coherence and executable checks

Base: `05f1f55d6fde601976ed2da1247a4e3b9604f4c8`, worktree clean at start.
Documentation only; no product code, ADR, runtime, ledger, vault or scheduler
was changed.

| Check | Direction | Exit |
|---|---|---|
| `git log --oneline 05f1f55d..HEAD -- src/core/transcripts/` | current state | 0, empty — no upstream change to this package's surface |
| `rg` over `index.js` (`parseWithOutcome`, both caps) | current state | 0 — `:31`, `:32`, `:135` |
| `rg` over `claude.js` (`tool_result`/`text` block filters) | current state | 0 — `:61`, `:139`, `:160` |
| `rg` over `codex.js` + `validate.js` | current state | 0 — `codex.js:61`, `:116`, `validate.js:510` |
| `rg` over `scratch.js` + `dream.js` (measure, write, dry-run line) | current state | 0 — `scratch.js:118`, `:129`, `dream.js:154` |
| `rg -n extractsBySession` | current state | 0 — `dream.js:1043`, `:1047`, `:1055` |
| `rg` over the dream skill | current state | 0 — `tool_result` ×8, `skill_invocations` ×3, `errored` ×3 |
| `npm test -- transcripts + transcript-stream` | current state | 0 — 53/53 |
| `npm test -- dream-collect + dream-pipeline + dream-skill-structure` | current state | 0 — 123/123 |
| `npm test` (whole suite) | current state | 0 — 2,783 tests, 2,771 pass, 0 fail, 12 skipped |
| `test -f src/core/transcripts/primary-dialogue.js` | deliverable absent | **1 (red, correct)** |
| `node -e … parsePrimaryWithOutcome` export probe | deliverable absent | **1 (red, correct)** |
| fixture-boundary guard, dir present and untouched | compliant | 0 |
| fixture-boundary guard, dir absent | absent | **1 (red, correct — the `test -d` guard works)** |
| skill-token guard (`skill_invocations\|tool_result\|errored`) | violating (today) | **1 (red, correct)** |
| ADR `Status:` line grep, real ADR | absent | **1 (red, correct)** |
| ADR `Status:` line grep, a file carrying the exact line | compliant | 0 |
| owner-phrase prohibition, real ADR | compliant | 0 |
| owner-phrase prohibition, a file saying "The owner approved this" | violating | inner `rg` matched → negation red, correct |
| owner-phrase prohibition, file absent | absent | **1 (red, correct)** |
| `boundary-check` on each spec's own deliverable list | compliant | 0 for both |
| `boundary-check` with `tests/fixtures/transcripts/…` | forbidden | **1 (red, correct)** |
| `boundary-check` with `ledger.js`, `validate.js` | forbidden | **1 (red, correct)** |
| `npm run lint` | — | 0 (markdownlint 0 errors over 683 files; frontmatter 278 specs, 4 agents) |
| `git diff --check` | — | 0 |

**One verification command in the first draft was wrong and was corrected.**
`npm run red-proofs -- --suite <path>` is not a supported invocation:
`scripts/red-proofs.js` accepts `[--root <dir>] [--wp <WP-id>] [--proof <proof-id>]`
and exits 1 with `unknown argument "--suite"`. All three specs now use
`--wp <WP-id>`. This is exactly the failure the both-directions rule exists to
catch: the command would have been pasted into a PR body as evidence and its
non-zero exit read as "the proofs are not written yet".

**Literals validated against the real writer.** Both worked examples were
produced by running the real parser at the base commit.
`WP-dream-primary-dialogue-projection`'s Claude example: four raw messages,
`skill_invocations: [{skill:"packing-list", index:2, resultIndex:2,
errored:false}]`, `intakeBytes` 566, projected compact 511 — and the run
confirmed live that the third record's `text` block is dropped today.
`WP-dream-primary-dialogue-collection`'s Codex example: the pretty file is 307
bytes, its compact form 233, and `intakeBytes` **202**. The projection is
*larger* there, because that source has nothing to remove and the projection
adds a `derived_from_untrusted` key per message. Worth recording as a corrected
assumption: **projection shrinks extracts in aggregate, not on every session**,
and the spec now says so where a reader would otherwise infer the universal.

## What round zero does not establish

This is the architect's own pass. It is not the clean-context template
conformance read, not an independent adversarial design review, and not
evidence that any acceptance criterion holds — every implementation check above
is red because the code does not exist. The RED-proof `expectRed` sets in all
three specs are **derived, not measured**, and each spec names the prose
sentences that must be re-read when the implementer corrects them.

## Lessons

- WP-dream-primary-dialogue-projection: run a spec's own verification commands
  before committing it. `npm run red-proofs -- --suite …` reads like a
  plausible flag and exits 1 on an unknown argument, which is indistinguishable
  from "not implemented yet" in a pasted PR body.
- WP-dream-primary-dialogue-collection: when a change makes two quantities
  diverge that used to be one, find the surface that prints the old label. The
  dry-run's `total input bytes` was the byte bound and the model's input at the
  same time; after projection it is only the second, and left alone it would
  have told users they had headroom they did not have.
- WP-dream-primary-dialogue-projection: a contract carried "because the
  predecessor had it" is how a spec inherits rot. Exchange blocks and three
  legacy fallbacks were all dropped by asking who consumes them and what
  measured the need.
