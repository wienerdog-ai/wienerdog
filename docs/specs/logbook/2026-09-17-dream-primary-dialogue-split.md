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
is byte-identical to what `src/core/dream/scratch.js:118` computes today.

**Corrected by design review round 1 (see the dispositions below): that closes
the BYTE dimension only.** This entry originally said the admitted session set
was "unchanged by construction". It is not. The collector also stops on the soft
preprocessing deadline, which measures wall-clock time across parsing,
serialization and writes, and projection changes all three — the review executed
the real collector with mocked timing and measured one session admitted under
the baseline against four under projection at identical intake bytes. The
guarantee is **byte-policy equivalence**, and on a deadline-bound install the
admitted set can still move in either direction. Three consequences of the byte
decision stand unchanged:

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
  `WP-dream-report-run-skips`'s rows B4 and B12 stay true untouched — but for a
  weaker reason than this entry first gave, corrected in round 2: its bullets
  count what *this* run classified and never promise a particular count, so they
  are true whatever the arms hold. They are **not** protected by any claim that
  the arms match the base commit's, because a deadline-deferring run can
  populate them differently.

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
human one, and no heuristic is added to pretend otherwise. Row A5b's definition
of `derived_from_untrusted: false` is written to claim only what was observed,
and it is **role-specific** — an earlier version of this paragraph got that
wrong and round 1 caught it. On a **user** message `false` claims exactly that
the harness attributed the record to the user role, and nothing more; a user
message is `false` by role whatever preceded it. On an **assistant** message it
additionally claims that no tool output and no context gap preceded it in that
session. Neither claims "a human typed this".

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

## Round-zero conformance finding: two truncated headings, in all three specs

Two clean-context conformance executors (one per new spec) passed everything
first time except the same two items in both: `## Contract reference` and
`## Security checklist` had been written without the template's parentheticals.
The revised filter spec carried the same two truncations and was fixed with
them. The template's text is restored verbatim in all three:

```text
## Contract reference (optional — mark N/A if this WP is not contract-dense)
## Security checklist (delete only if the WP touches no untrusted input)
```

The lesson is narrow and worth naming: those two parentheticals read like
*instructions about whether to keep the section*, which is exactly why they got
dropped — and the template gives no other way to tell a kept-and-filled section
from a section whose parenthetical was obeyed. The heading text is the contract.

Mechanical sweep afterwards — every `^##`/`^###` line of each spec compared
against `docs/specs/_TEMPLATE.md` with `comm` over sorted heading lists. **No
template heading is missing or altered in any of the three.** Everything below
is an addition, not a divergence:

| Spec | Headings present beyond the template |
|---|---|
| projection | `## Dispatch precondition — owner items`; `### Transcript-format evidence re-derived for this package`; `### Current-state checks — runnable before implementation`; `### Implementation checks — these must pass before the PR` |
| collection | the same four minus the evidence one, plus `## ADR-0020 amendment text` (and the `## Amendment (2026-09-17): …` line the sweep reports from *inside* that section's fenced block, which is amendment content rather than a heading of this spec) |
| filter | `## PARKED — this package is not matured until an evaluation says it is needed`; `## Entry condition — the offline evaluation`; `## Dispatch precondition — owner items` |

The readers separately confirmed present and literal: all five
Mirrored-Surface bullets including "Operative prose steps that apply it", the
`### Contract table(s)` parent heading, the authoring-rules line, the
Deliverables columns, the five Definition-of-done items, and the literal
expected output shown in full — noting that for the projection spec that last
rule is strictly inapplicable, since it ships a pure function and generates no
file, and that both `extract` and `gateExtract` are shown literally anyway.

## Design review round 1 — dispositions

Two parallel adversarial reviews (Codex plugin 1.0.6, `gpt-6-astra`), one per
new spec, tip `5d777b9c`, base `a4d19c0c`. Both `needs-attention`. Every finding
was reproduced by executing the real parsers, collector and validator on
synthetic inputs; no private transcripts were accessed. Raws and metas are
committed at `ebee6fdc`. Confirmed clean by the reviewers and not re-litigated
here: the worked example's 566-byte intake count, the existing goldens, sampled
gate geometry, wrapper equality, caps, budget exhaustion, gate verdicts
surviving text removal, Codex evidence staying non-authorizing, empty
projections remaining processed, the report-skip bullets staying truthful, the
prompt-hash rebinding story, and every inspected cite resolving.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| **P-1** user-role text bypasses the never-resetting flag | A | HEAVY | **keep the rule, fix the contradiction, price the residual** | The reviewer's laundering path is real but it is **today's behavior**: `SKILL.md:101-105` already sets the flag from role alone, so the same quoted sentence is `false` at the base commit. The projection neither creates nor widens it, and the person is the trust root. What was genuinely wrong was the spec: A5 and this logbook defined `false` as "no earlier tool output or gap", which is untrue for user messages. A5 is now split into A5 (the two rules), A5a (the gap enumeration) and A5b (what `false` claims); the worked example gained an asymmetry note; AC3a is the reviewer's fixture as a test of stated behavior; owner item 3 prices the alternative. |
| **P-2** depth-limit drops are silent provenance gaps | B | HEAVY | **fix** | Reproduced: a valid tool record nested past `MAX_JSON_DEPTH` (64) is discarded by both parsers with `outcome: 'ok'`, `oversizedRecords: 0`, `truncated: false`. Row A5a now enumerates every context-losing return and requires observer notification **before** each. AC3b tests all four, and for the depth case also asserts the three fields that stay silent. |
| **P-machinery** no explicit A6 / B1 assertions | C | LIGHT | **fix** | New AC4a: cap, redact-before-cap with a secret straddling character 4,000, message-count cap, and budget-debit equality as the single-read assertion. |
| **C-1** the preprocessing deadline can move the admitted set | A | HEAVY | **fix the claim, keep the mechanism** | "Unchanged by construction" was false and I should have caught it: `scratch.js:50` takes `startedAt` before discovery and `:95-98` compares elapsed wall-clock time spanning parse, serialization and writes — all three of which projection changes. The reviewer measured 1 vs 4 admitted at identical intake bytes. C1 now claims **byte-policy equivalence** only; C1a says when the deadline binds and admits the direction is unpredictable; AC1 is scoped to the non-deadline regime and AC1a tests both directions with a mocked clock; AC7 must name the regime; owner item 3 prices the two redesign routes and neither is built. |
| **C-machinery-1** AC4 said `promote` raises an understated flag | B | LIGHT | **fix** | It refuses. `validate.js:646-648` returns a reason and `promote.js:1386-1394` consumes it as a refusal leaving candidate bytes unchanged. AC4 is rewritten as refuse / accept / control, where the control is a clean invocation window that turns refused if `extractsBySession` is rebuilt from scratch. |
| **C-clarity** D2's enforcement boundary | C | LIGHT | **fix, and state prominently** | New canonical row **D6** splits every provenance guarantee into code and prompt, and the ADR amendment gained the same paragraph. Propagating message flags onto an ordinary note is prompt-only; the invocation gate verifies invocation evidence, never a candidate's supporting messages. |

**One thing the reviewers did not raise and this pass found anyway.** The dream
skill has told the model for a long time that the orchestrator "RAISES your flag
to `true`" (`SKILL.md:324-331`). It does not — an understated flag loses the
whole ledger write. The correction rides along in row D3 because that row
already rewrites the surrounding section, and it matters for behavior, not
tidiness: a model told its mislabel will be corrected for it has no reason to
get the label right.

## Design review round 2 — dispositions

Two parallel adversarial reviews (Codex plugin 1.0.6, `gpt-6-astra`), tip
`35494bb2`, base `a4d19c0c`. Both `needs-attention`. Raws at `cf50b6c0`.
Confirmed closed by the reviewers: P-1 preserves today's prompt rule and prices
its residual; P-2's depth-drop correction is substantive; AC4's
refusal / declared-true / clean-control probes pass executably and rebuilding
evidence from projected scratch rejects the clean control; D6 and its ADR mirror
correctly disclose prompt-only propagation; `SKILL.md:329` does say RAISES while
`validate.js:647` returns a refusal; every cite resolves.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| **P2-1** valid JSON without a type discriminator escapes the gap rule | B | HEAVY | **fix** | Reproduced all three: a Claude record carrying a `tool_result` block but no top-level `type`, a Codex `response_item` whose `payload` has no `type`, and a Codex `payload.type` outside the known set each vanish with `outcome: 'ok'`, `oversizedRecords: 0`, `truncated: false`. Row A5a is rewritten as **classified versus unclassifiable** at record, payload and block level, with both sides enumerated positively. New row **A5a-why** carries the judgment call and new **AC3c** tests it, negative controls included. |
| **P2-m1** round-1 corrections did not reach every mirror | C | LIGHT | **fix, mechanically** | Six operative stale statements found and replaced; the sweep below is the evidence, and it is now part of the record so the next round can re-run it rather than re-read. |
| **P2-m2** budget equality does not prove one bounded read | B | LIGHT | **fix** | Measured: a double-read implementation debits the caller 46 bytes exactly as a single-read one does, while opening the file twice — so AC4a was vacuous on the property it named. It now requires one `streamLines` invocation with the expected byte total **as well as** debit equality, and a second-read mutation must redden it. |
| **C2-1** a filename collision retains authorization for overwritten dialogue | B | HEAVY | **fix, preserving the baseline's surviving-file semantics** | Reproduced: `s_1` and `s.1` both sanitize to `claude-s_1.json`. Today's disk rebuild yields only the surviving session, so a learning counting the overwritten one is refused; a session-keyed in-memory map keeps both and would accept it. Row C4 now **evicts** any earlier entry that wrote the same filename — last-writer-wins, bit-for-bit the disk result — with row **C4a** stating why and **AC1b** testing it against a non-evicting control. |
| **C2-2** owner-facing guarantees still contradict the priced residual, and C1a's condition was wrong | B | LIGHT | **fix** | The reviewer's counterexample is the important half: the projected run admitted all five sessions in 50 ms while the baseline admitted one under the same 60 ms deadline, so "this run finished inside the deadline" is not the condition. C1a now requires **both** runs to avoid deadline deferral; AC1, AC1a and AC7 follow. |
| **C2-citation** the promotion-refusal cite stops at the call site | C | LIGHT | **fix** | Extended to `promote.js:1386-1394` (calls the gate) **and** `:1397-1400` (records the refusal), at all three occurrences. |

**A pre-existing defect surfaced by C2-1 and deliberately not fixed.** The
filename collision itself loses one session's dialogue while marking **both**
sessions processed, so the overwritten session is never consolidated and never
retried. Row C4's eviction only stops this package from weakening the
authorization gate over that collision. It is recorded under the collection
spec's Discovered issues, with the shape a real fix would need.

### The stale-claim sweep, raw

Re-run after the round-3 edits and captured **before** this section was pasted
back in, so a further re-run adds this block's own quotations and shifts the
line numbers below it. Long lines truncated at 165 characters for legibility;
nothing else altered. **Zero operative hits on the claims this sweep is for.**

```text
docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md:42:was "unchanged by construction". It is not. The collector also stops on the soft
docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md:241:| **P-1** user-role text bypasses the never-resetting flag | A | HEAVY | **keep the rule, fix the c
docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md:244:| **C-1** the preprocessing deadline can move the admitted set | A | HEAVY | **fix the claim, keep
docs/specs/WP-dream-primary-dialogue-projection.md:356:| A5b | What `false` does and does not claim | `derived_from_untrusted: false` claims exactly one thing: **the
docs/specs/WP-dream-primary-dialogue-projection.md:547:      the code-supplied `source_path` and `cwd`, bounded unchanged by the
docs/specs/WP-dream-primary-dialogue-projection.md:639:      byte-identical to the base commit's for the same bytes — the precedence
docs/specs/WP-dream-primary-dialogue-collection.md:361:  are populated identically to the base commit's — row C1a says a
docs/specs/WP-dream-primary-dialogue-collection.md:725:   not promise that it cannot worsen F1** — it promises that it does not worsen
```

| Hit | Classification |
|---|---|
| logbook `:42` | **NEGATION-or-WITHDRAWAL** — names the retired "unchanged by construction" claim and retires it |
| logbook `:241`, `:244` | **HISTORY** — round-1 disposition rows quoting the wording that was wrong |
| projection `:356` | **NEGATION-or-WITHDRAWAL** — row A5b restricts the clause to assistant messages and forbids the unrestricted form anywhere |
| projection `:547` | **UNRELATED** — "bounded unchanged by the existing `boundExtractPath`", about metadata-path bounding |
| projection `:639` | **UNRELATED, and flagged** — new this round: AC3d's requirement that `parse`/`parseWithOutcome` output stay byte-identical to the base commit. That is an operative claim, but about **default parser bytes**, not about the admitted session set or provenance; it is AC5's property, it is true, and it is meant to be there. The sweep's `identical to (today\|the base)` alternation over-matches it. Recorded rather than silently reclassified so the next round can decide whether to narrow the pattern |
| collection `:361` | **NEGATION-or-WITHDRAWAL** — "They are **not** protected by any claim that the arms are populated identically to the base commit's" |
| collection `:725` | **NEGATION-or-WITHDRAWAL** — "**this package does not promise that it cannot worsen F1**" |

The six operative hits that existed before round 2 — projection `:364` and
`:647`; collection `:276`, `:349` and `:673-674`; logbook `:62` — remain gone.
No new operative admission, F1 or provenance claim was introduced this round.

**Re-run after round 4: the same set, no new hits.** Line numbers moved with the
edits (projection `:356` and `:565`/`:673`, collection `:361`/`:725`), and the
classifications are unchanged — two HISTORY rows, four negations or
withdrawals, and the two UNRELATED matches, one of which is the over-matching
`identical to (today|the base)` alternation catching AC3d's true parser-output
requirement.

**Why this sweep is in the record rather than just run.** This is the third spec
family this session to lose round-N corrections in its mirrors. A checklist that
names its mirrors is necessary and was not sufficient: every one of the six
survived a walked Mirrored Surface Checklist, because the checklist points at
*sections* while the stale sentences were clauses inside them. A claim-shaped
grep finds clauses. Pasting its output with per-hit classifications is what lets
the next round re-run one command instead of re-reading four documents.

## Design review round 3 — collection APPROVED, projection still open

Two parallel adversarial reviews (Codex plugin 1.0.6, `gpt-6-astra`), tip
`41e667f4`, base `c94e0e66`. Raws at `1c3a72f0`.

### `WP-dream-primary-dialogue-collection` — `approve`, zero findings

> "Both round-2 findings are substantively fixed; no additional material product
> or security blocker was demonstrated."

C2-1 was verified by executing the real parsers, collector, CLI disk-map
rebuild, scratch integrity, validator and ledger with mocked I/O: **48 collision
scenarios and 480 gate-verdict comparisons matched the baseline**, across 2, 3
and 5 colliding ids, both write orders, interleaved harnesses, empty final
projections and clean/tainted invocation windows — and **disabling the eviction
reproduced the authorization defect**, so the fix is not vacuous. Admission,
duplicate `wrote` paths, processed accounting and later ledger selection all
matched. C2-2 was verified with 1→5 and 5→1 deadline shifts including a
projected run with no deadline deferrals at all, and the scoped sweep found no
remaining unconditional admission or F1 guarantee. Cites resolve, including
`promote.js:1397-1400`; the probe block PR `#261` appended to
`tests/unit/dream-collect.test.js` does not invalidate them.

**A survivor detail worth keeping**, because it changes what the AC1b fixture
must look like: `s.1` **fails the existing Session-ID schema** in both the
baseline and the proposed design, so a test that lets `s.1` be the survivor
proves less than it appears to. Reversing the write order gives a valid
surviving `s_1`, including when its primary messages are empty, and the harness
prefix keeps Claude and Codex filenames apart.

**The collection spec stays `Draft`.** It `depends_on`
`WP-dream-primary-dialogue-projection`, which is not closed, so the status flip
waits for the pass that closes the projection spec. This section is the record
of its round-3 approval and of that hold.

### `WP-dream-primary-dialogue-projection` — `needs-attention`, two findings

Confirmed closed by the reviewer: **P2-m1** (mirrors) within both target
documents, and **P2-m2** — the corrected AC4a now rejects the demonstrated
double read, where caller debit stayed 46 bytes while stream invocations and
opens went from one to two and total reads from 46 to 92. The decided Codex list
covers every type `mapCodexItem` handles; goldens and wrapper equality pass.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| **P3-1** normal Codex headers satisfy the new gap rule | B | HEAVY | **fix** | Reproduced against the shipped fixture: `tests/fixtures/transcripts/codex-rollout.jsonl`'s `session_meta` payload has keys exactly `id`, `timestamp`, `cwd` and **no `type`**. Round 2's "a discriminator at all three levels" would therefore have tainted **every Codex session from its own header**, shutting even tool-free assistant evidence out of Tier 3 — a far bigger cliff than the one owner item 4 prices. New row **A5c** scopes each check to its enclosing record schema and walks every recognised top-level type of both harnesses, saying what each owes. AC3c gains the normal-header control. |
| **P3-2** declined Claude envelopes can conceal recognisable tool results | A | HEAVY | **fix** | Reproduced all four: `message.content: [{"type":"tool_result","content":"EXTERNAL"}]` under an `attachment` record, an unfamiliar top-level type, an `assistant` record and an `isMeta: true` user record each vanished with `outcome: 'ok'`, `truncated: false`, leaving the next assistant conclusion `false`. New row **A5d** gives a recognised tool-result block precedence over envelope exclusion, **in the observer only**, bounded to `message.content` at depth one. New AC3d tests all four with byte-identical default parser output, plus benign controls. |
| **P3-structure** three rounds of boundary findings in prose form | C | LIGHT | **fix** | New row **A5e** is the ordered decision procedure, written to be coded from step by step, with taint stated at each step and monotonicity stated once. The other A5 rows become its definitions. |

**Two decisions this round makes that nobody asked a question about.**
**`tool_use` does not taint.** A request to run a tool carries no external
content — only its result does — and every route by which a result reaches the
transcript is now covered: an accepted envelope (A5), a declined envelope (A5d),
or a loss (A5a). Tainting on `tool_use` would also fire on ordinary progress
replies, which carry 1,901 `tool_use` blocks in 3,789 sampled assistant records,
and would taint nearly every session — the same cliff A5c-why exists to avoid.
**Codex gets no envelope scan.** Its tool output has a top-level home, so row
A5c's `response_item` rule already catches it and catches it more strongly than
Claude's block scan, because an unrecognised `payload.type` taints. The residual
— a tool payload nested inside a declined Codex envelope such as `event_msg`,
whose 13,296 `item_completed` events this package did not inspect — is named and
routed to `docs/runbooks/codex-pin-bump.md` rather than guessed at. Both are
owner item 5.

## Design review round 4 — one finding, and an executable check of the prose

Codex plugin 1.0.6 / `gpt-6-astra`, tip `7f97981a`, base `c94e0e66`. Raw at
`9249d8c1`. P3-1 and P3-2 confirmed fixed at the design level; goldens, wrapper
equality and every cite pass; no separate machinery finding.

| Finding | Band | Weight | Disposition | Rationale |
|---|---|---|---|---|
| **P4-1** the canonical procedure silently accepts unclassifiable Claude content blocks | A | HEAVY | **fix the procedure, keep the criterion** | Row A5c validated the `message`/`content` **containers** and never each **block**'s discriminator. Executed: `tool_use` → paired tool-result-shaped block with `type` deleted or set to `7` → `end_turn`; the real parser loses the result silently and a transcription of A5e emits the conclusion `false`. AC3c already demanded those blocks taint, so the canonical row contradicted its own acceptance criterion — the row was wrong, not the test. New canonical row **A5c-blocks**; A5e step 2 now runs both schema checks and **suppresses the record's emission** as well as tainting. |

### The A5e model run — 35 sequences, three readings of the prose

Built as instructed, as a throwaway node transcription of row A5e in a temp
directory (never a repo file), fed the spec's own fixtures, every reviewer
counterexample from rounds 1–4, and twelve adversarial sequences of my own aimed
at getting an assistant message emitted `false` after external content. Three
candidate readings were run: **V0** the round-3 prose, **V1** adding
presence-and-shape checks on content blocks, **V2** adding the decided block
list.

| Reading | Mismatches | What it still lets through |
|---|---:|---|
| V0 — round-3 prose | **8 / 35** | both P4-1 variants; a bare-string block; a `null` block; a Codex block with `type: 7`; a bad block in a Codex `final_answer`; **and ADV-1/ADV-2 below** |
| V1 — + block presence and shape | **2 / 35** | ADV-1 and ADV-2 only |
| V2 — + decided block list | **0 / 35** | — |

**What the model found that no reviewer had.** `ADV-1` places a tool result in a
block typed `"TOOL_RESULT"` (wrong case); `ADV-2` types it
`"web_search_tool_result"`. Both are plain objects with a non-empty string
`type`, so a presence-and-shape check accepts them, and neither is the exact
string `tool_result`, so step 3 does not recognise them — the record declines
silently and the following conclusion is marked `false` **with external content
in the session**. That is the same class of hole as rounds 1–4, one level
further down, and it is why row A5c-blocks carries a decided list rather than a
shape test. It also forced the general statement now in A5c-why: *taint on an
unrecognised value exactly where the harness signals tool output — Codex
`payload.type` and either harness's block `type` — and decline without tainting
everywhere else.* The cost is priced as owner item 6.

**One place the model corrected my expectation rather than the prose.** `ADV-7`
puts a malformed block in the same Codex `final_answer` record that carries the
answer. I expected a tainted assistant message; the model emitted **none**,
because step 2 taints and moves to the next line without reaching emission.
The model was right and A5e already said so — the step now states the
consequence explicitly so no implementer has to infer it.

**The controls matter as much as the catches**, and all of them held in V2: a
`thinking` block, an `image` block, a Codex `input_image`, a bare `tool_use`
with no result, a declined envelope whose content is a number, a declined
`system` record, an unfamiliar top-level type with no tool content, a normal
`session_meta` header, and misaligned `content_item_kinds` — each leaves the
following assistant message `false`. Without those, "taint on anything odd"
would have passed every catch and been useless.

## Design review round 5, and both gates CLOSED

Codex plugin 1.0.6 / `gpt-6-astra`, tip `541e344c`, base `c94e0e66`, raw at
`505c47f1`: **`approve`, zero findings.** "The round-4 flaw is substantively
fixed. No assistant-false counterexample outside the named residuals and owner
items was demonstrated." It executed the real parsers and reader; confirmed both
malformed paired results vanish silently today while the revised procedure
taints; verified step-2 suppression at `:359-362`; **independently reconstructed
a 35-case set and reproduced the V0/V1/V2 counts of 8 / 2 / 0**; ran a further
245 adversarial combinations and 14 real-reader gap probes with no uncovered
bypass.

One non-blocking machinery note, and it was right: the logbook held the
aggregate numbers but not the inputs or the model, so nobody could certify
agreement case by case. **Both are now committed** —
`2026-09-17-dream-primary-dialogue-taint-model.js` and
`…-taint-model-cases.json` in this folder. Re-run from the committed copy:
8 / 2 / 0, exit 0. The script is inert by construction — no dependency, no
network, no write, no spawn — its name matches none of `node --test`'s discovery
patterns and markdownlint globs only `docs/**/*.md`, which was checked rather
than assumed: with it present, `npm test` is 2,787 passing and `npm run lint` is
0 errors, both unchanged.

### Closure

| Spec | Rounds | Findings per round | Closed because |
|---|---:|---|---|
| `WP-dream-primary-dialogue-projection` | 5 | 2, 3, 2, 1, **0** | round 5 `approve` found nothing about the product |
| `WP-dream-primary-dialogue-collection` | 3 | 1 + 2 machinery notes, 2, **0** | round 3 `approve` found nothing about the product |

Every finding in both columns was **reproduced by executing the real parsers,
reader, collector, validator and ledger** on synthetic input — no private
transcript was read into this repository at any round — and every one is
dispositioned above. Each round's raw was committed **before** adjudication, at
`ebee6fdc` (r1), `d92bbf48` (r2), `1c3a72f0` (r3), `9249d8c1` (r4) and
`505c47f1` (r5); those are the post-rebase SHAs on this branch. Both gates are
closed under `docs/runbooks/codex-review.md`, and both specs are `Ready`.
`WP-dream-primary-dialogue-filter` stays `Draft`, parked behind its entry
condition.

### The lesson

**A taint rule written as prose leaked exactly one boundary per round, for four
rounds** — a reset at a user boundary, a silent depth-limit drop, a missing
discriminator and a `session_meta` with no `payload.type`, a tool result hiding
in a declined envelope. Each was a case the prose did not name rather than a
rule anyone disputed, and each cost a full external round to find. **An
executable transcription of the same rule found two more in a single pass that
no reviewer had raised** (`"TOOL_RESULT"`, `"web_search_tool_result"`), and
corrected one of my own expectations besides. For any contract that is a state
machine over someone else's grammar, write the model first, run the fixtures
through it, and treat a disagreement as a bug in the prose. It is cheaper than a
review round and it finds a different class of defect.

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
- WP-dream-primary-dialogue-projection: copy template headings byte-for-byte,
  parentheticals included. A parenthetical that reads as an instruction about
  the section ("optional — mark N/A if…", "delete only if…") is still part of
  the heading, and dropping it is the one conformance miss that survived a
  full self-review of three specs.
- WP-dream-primary-dialogue-projection: a contract carried "because the
  predecessor had it" is how a spec inherits rot. Exchange blocks and three
  legacy fallbacks were all dropped by asking who consumes them and what
  measured the need.
