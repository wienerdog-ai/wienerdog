---
id: WP-dream-primary-dialogue-projection
title: Project each transcript to its primary dialogue, deterministically
status: Draft
model: opus
size: M
depends_on: [WP-dream-filtered-input-budget]
adrs: [ADR-0004, ADR-0005, ADR-0023, ADR-0024, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-primary-dialogue-projection: Project each transcript to its primary dialogue, deterministically

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **It is just files (ADR-0004): no
daemons, no servers, no telemetry, no background process that outlives its
job.** This work package adds one pure parsing function and no process at all.

The **dream** is the nightly consolidation job. It discovers harness session
**transcripts** (Claude JSONL files, Codex rollout files), parses each into a
normalized **extract**, writes the admitted extracts as private JSON files into
a scratch directory, and gives one Claude session that directory plus a private
copy of the vault. That session proposes memory notes; code then validates and
promotes them. Nothing in this work package touches that pipeline: it ships the
projection as a new, opt-in parser entry point that no caller uses yet. The
collector is switched over to it by the successor package
`WP-dream-primary-dialogue-collection`.

**What is wrong today.** The normalized extract is a poor model of a
conversation. A measurement on 2026-09-16 reparsed 187 sessions whose ledger
fingerprints still matched (`docs/specs/logbook/2026-09-16-dream-process-assessment.md`)
and found 3,071,245 normalized `user` characters — of which **1,653,850 were
Codex developer messages**, harness-authored control text the parser maps to
`role: 'user'`. Add 221,918 `tool_result` characters and 469,970 assistant
characters that include every intermediate progress reply. More than half of
what the dream is told is "the user speaking" is harness boilerplate, and the
model cannot tell which half.

**What this package builds.** A deterministic, code-only projection of each
transcript to its **primary dialogue**: genuine user requests and corrections,
plus the concluding assistant reply of each exchange. Tool calls, tool results,
reasoning text and intermediate progress replies are not primary dialogue.
Harness-authored and developer-authored instructions are not dialogue. There is
**no model call** in this work package and no new authority surface. The
owner's scope for this direction is recorded in
`docs/specs/logbook/2026-09-17-dream-primary-input-scope.md`; the maintainer
feedback that produced this split is
`docs/specs/logbook/2026-09-17-primary-dialogue-filter-maintainer-feedback.md`.

**The one invariant that constrains every choice below.** Two code-owned safety
gates read the extract's *original* message timeline, not its dialogue: the
learnings-ledger gate in `src/core/dream/validate.js` decides whether a claimed
skill learning is authorized, and derives `derived_from_untrusted` from whether
an external `tool_result` appears inside the skill's invocation window. If the
projection simply removed those messages, those gates would silently weaken —
a gate must never gain permission because its evidence was deleted. So this
package returns **three** things from one bounded read: the model-visible
primary extract, a **text-free** projection of the original timeline for those
gates, and the byte count the collector's capacity bound is measured against.

## Current state

**Base commit: `05f1f55d6fde601976ed2da1247a4e3b9604f4c8`** (upstream `main`).
Every file:line below was re-derived against that commit. The predecessor draft
of this work package pinned a fork commit (`1c3790de`); three packages have
landed in the dream path since (#245, #253, #257) and two more are in flight
(`WP-dream-report-run-skips`, `WP-secret-sink-wiring-probes`). **None of them
edits `src/core/transcripts/`**, which is this package's whole surface, so no
re-derivation of the cites below is expected at dispatch; confirm that with
`git log --oneline 05f1f55d..HEAD -- src/core/transcripts/` before starting.

- `src/core/transcripts/index.js:135-189` exports `parseWithOutcome(entry,
  budget)` → `{extract, parse}`. It redacts each message (`capMessage`,
  `:102-110`) **before** applying `MAX_MSG_CHARS = 4000` (`:31`), then retains
  the newest `MAX_MESSAGES = 2000` messages (`:32`, `:165-179`), setting
  `truncated` when either fires. `:186-187` bounds `source_path` and `cwd`
  through `boundExtractPath` (`:44-55`: home prefix → `~`, then 160 chars + `…`).
  `:198-200` exports the wrapper `parse(entry)`.
- The extract shape is documented at `src/core/transcripts/index.js:11-24`:
  `{harness, session_id, started, cwd, source_path, truncated, messages[],
  skill_invocations?[]}`. Key order in the emitted object is exactly that
  (`:181`, `{...raw, truncated, messages}`), with `skill_invocations` present
  on Claude extracts only.
- `src/core/transcripts/claude.js:101-217` parses one Claude JSONL file.
  `:127` keeps only `type` `'user'` and `'assistant'`. `:133` drops
  `isMeta === true`. **`isSidechain` is never read.** For a `user` record it
  accepts a string `message.content` whole (`:135-137`) and, for an array
  (`:138-155`), emits a `tool_result` message for each `tool_result` block —
  **ordinary `text` blocks in array-valued user content are ignored**. For an
  `assistant` record (`:156-183`) it joins the `text` blocks with `\n\n` and
  emits one `assistant` message **without ever reading `stop_reason`**;
  `thinking` blocks are not `text` blocks and so contribute nothing. `:166-181`
  records each `Skill` `tool_use` as `{skill, index, resultIndex, errored}`
  where `index` is `messages.length` at that moment and `resultIndex` is filled
  in by id-pairing when the matching `tool_result` is pushed (`:145-152`).
- `src/core/transcripts/codex.js:110-125` (`mapCodexItem`) maps one
  `response_item` payload. `:112-120`: a `message` payload with
  `role === 'assistant'` becomes an `assistant` message **without reading
  `payload.phase`**; a payload whose role is in
  `TRUSTED_MESSAGE_ROLES = new Set(['user','developer'])` (`:61`) becomes a
  `user` message — **so a Codex developer message is indistinguishable from the
  user's own text in the extract**; every other role is dropped. `:121-123`
  maps the five `TOOL_OUTPUT_TYPES` (`:68-74`) to `tool_result`. Codex messages
  always carry `ts: null`. `:176-182` takes `session_id`, `started` and `cwd`
  from the **first** `session_meta` record only.
- `src/core/transcripts/stream.js` owns the bounded read: `streamLines(filePath,
  sizeBytes, budget, onLine)` hands one line at a time, emits
  `OVERSIZED_RECORD_MARKER` for a dropped over-long record (`:113-118`), stops
  with `runExhausted` when the caller-owned `budget` runs out with unread bytes
  left (`:129-138`), and returns a non-`ok` outcome for `over-ceiling` (`:79-82`),
  `read-error` (`:87-90`, `:143-146`) and `too-many-lines` (`:172-175`,
  `:182-184`). Both parsers call it exactly once per file. `Limits.MAX_JSON_DEPTH`
  is `64` (`:23`), and `maxJsonDepth` (`:202-223`) is a pre-parse scan.
- **Two of the parsers' drops are completely silent today**, which row A5a
  turns on: `claude.js:119` and `codex.js:168` `return` when
  `maxJsonDepth(line) > Limits.MAX_JSON_DEPTH`, and `claude.js:121-125` /
  `codex.js:170-174` `return` when `JSON.parse` throws. Neither sets
  `truncated`, increments `oversizedRecords` or changes `outcome` — the design
  review executed both parsers on a valid but deeply nested tool record and
  measured `outcome: 'ok'`, `oversizedRecords: 0`, `truncated: false` with the
  record gone and the following assistant message retained.
- `src/core/dream/validate.js:510-527` (`invocationWindowTainted`) reads
  `extract.messages[i].role` and `extract.skill_invocations`; it needs **no
  message text at all**, and fails closed (returns tainted) on any malformed
  geometry. `:638-644` looks the extract up by `<harness>:<session_id>`.
  `:191-216` (`tier3Decision`) requires `fm.derived_from_untrusted === false`
  for **every** Tier-3 write — identity and skills — which is what prices owner
  item 3.
- **Today's provenance rule is role-based and lives only in the prompt.**
  `skills/wienerdog-dream/SKILL.md:101-105`: set `derived_from_untrusted: true`
  if **any** supporting message has role `tool_result`; set it `false` only when
  every supporting message has role `user` or `assistant`. So at the base commit
  a user message is trusted because of its role, whatever preceded it. Row
  A5(a) preserves exactly that; row A5(b) is what this package adds on top, for
  assistant messages, which today's rule does not distinguish at all.
- `src/core/dream/scratch.js:118` measures admission as
  `Buffer.byteLength(JSON.stringify(extract))` of the extract
  `transcripts.parseWithOutcome` returned, and `:129` writes
  `JSON.stringify(extract, null, 2)` (0600, no trailing newline). **This
  package changes neither line**; its successor does.
- Golden parser fixtures live in `tests/fixtures/transcripts/`
  (`claude-session{,.expected}.json(l)`, `claude-skill-invocation…`,
  `codex-rollout…`, `claude-oversized-record.jsonl`) and are exercised by
  `tests/unit/transcripts.test.js`. **They are deliberately outside this
  package's Deliverables boundary** — see AC5.

### Transcript-format evidence re-derived for this package

Observed read-only on 2026-09-17 against local transcripts, reporting record
types, field names, enum values and counts only — never message content.
Sample: 50 newest Claude files (16,218 records) and 50 newest Codex rollout
files. These are **local-sample observations, not a claim about every release
of either harness**; every rule in Table A is written as an acceptance
allowlist so an unobserved shape yields no dialogue rather than wrong dialogue.

| Observation | Measurement | What it decides |
|---|---|---|
| Claude array-valued `user` content block types | `tool_result` 1901, `text` 14 (in 12 records), `image` 4 | A2 accepts `text`; the 14 blocks are the evidence the ignore at `claude.js:138-155` loses real user text |
| Claude `assistant` `stop_reason` | `tool_use` 3321, `end_turn` 467, `stop_sequence` 1, **absent/null 0** | A2 accepts `end_turn` only, and drops the predecessor draft's "legacy record without a stop reason" fallback as unevidenced |
| Claude `assistant` content block types | `tool_use` 1901, `thinking` 1337, `text` 551 | reasoning text is already excluded by the existing `text`-only filter |
| Claude `isSidechain` | present on 2290/2290 sampled `user` records; **`true` in 0 of 72,841 records across the full local corpus of 236 files** | A4 keys on a field that is always present; no positive case exists locally, so its fixture must be constructed |
| Codex `response_item` `payload.type` | `reasoning` 5998, `custom_tool_call_output` 4422, `custom_tool_call` 4284, `message` 1394, `function_call` 1148, `function_call_output` 1148, `agent_message` 713 | A3 accepts `message` only |
| Codex `message` roles | `assistant` 1052, `user` 177, `developer` 165 | A3 accepts neither `developer` nor any unlisted role |
| Codex `internal_chat_message_metadata_passthrough` on user messages | present 177/177, always an **object**, never a JSON string | A3 accepts the object form only; the predecessor draft's "parseable JSON-string form" is unevidenced and is dropped |
| Codex `content_item_kinds` alignment | equal length to `payload.content` in **177/177** messages, 0 mismatches; per-block (array lengths 1–58); `kind == "user.text"` co-occurred with `content[i].type == "input_text"` 2954 times and with any other block type **0** times | A3 may index the two arrays in parallel, and must fail closed on unequal lengths |
| Codex `content_item_kinds` values | `user.text` (2954), `agents_md.instructions`, `environments.environment_context`, `plugins.recommendations`, `goal.internal_context` (145 combined, **all riding `input_text` blocks**), `user.image` (1) | A3 accepts `user.text` only — the other five are harness-injected material that is *shaped* exactly like user text, which is why the kind, not the block type, decides |
| Codex `session_meta.payload.thread_source` | `codex-tui`-originated `user` 13, `subagent` 32, `guardian_review` 5; present in 50/50 | A4's Codex clause; `subagent` co-occurs exactly with `multi_agent_version: "v2"`, a `{subagent:{thread_spawn:…}}`-shaped `source`, and a present `agent_path`/`agent_nickname` |
| Codex assistant `payload.phase` | `commentary` 807, `final_answer` 245, **absent 0** | A3 accepts `final_answer` only, and drops the predecessor draft's "assistant message with no phase" fallback as unevidenced |
| Codex `custom_tool_call_output` payload shape | `output` array 4175, `output` string 247, `content` **0/4422** | confirms the assessment's F2 defect: `codex.js:91` tests `payload.content`, which never occurs, so all 4,175 array-valued outputs normalize to `''` |
| Codex `session_meta` per file | exactly one in 50/50; first `payload.id` matched the filename in 50/50 | taking the first header (`codex.js:176-182`) is already correct |

**Two predecessor-draft observations did not reproduce on this sample and are
not relied on by any rule below.** The draft reported that 17 of 70 Codex files
carried a later `session_meta` naming another identity; this sample found no
file with more than one `session_meta`. The draft's design-review entry
reported that no `event_msg.user_message` appeared; this sample found 80. The
parsers read only `session_meta` and `response_item`, so neither observation
changes any rule — but neither may be repeated as fact.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/claude.js | additive record observer for Table A rows A2/A4/A5, notified at every taint point of row A5e's procedure (rows A5a, A5c, A5c-blocks, A5d); default output byte-identical (AC5) |
| modify | src/core/transcripts/codex.js | additive record observer for Table A rows A3/A4/A5, notified at every taint point of row A5e's procedure (rows A5a, A5c, A5c-blocks, A5d); default output byte-identical (AC5) |
| modify | src/core/transcripts/index.js | export `parsePrimaryWithOutcome` (Table B); reuse the existing redaction and caps (Table A row A6) |
| create | src/core/transcripts/primary-dialogue.js | Table A's acceptance policy and Table B's assembly |
| create | tests/unit/primary-dialogue.test.js | Tables A and B |
| create | tests/fixtures/primary-dialogue/ | new fixtures only — `tests/fixtures/transcripts/` is outside this boundary on purpose (AC5) |
| create | tests/red-proofs/primary-dialogue.proofs.json | ADR-0042 RED proofs for AC1–AC4 |

### Exact contracts

The canonical facts are **Table A** (what primary dialogue is) and **Table B**
(what the new entry point returns). Everything here mirrors them.

```js
/** One bounded read per transcript, three derived values plus the existing
 *  parse outcome (Table B).
 *  @param {{harness:'claude'|'codex', path:string, size?:number}} entry
 *  @param {{remaining:number}} budget  caller-owned, from newRunBudget()
 *  @returns {{extract: Extract, gateExtract: GateExtract,
 *             intakeBytes: number,
 *             parse: {outcome: ParseOutcome, oversizedRecords: number, runExhausted: boolean}}} */
function parsePrimaryWithOutcome(entry, budget)
```

`Extract` here is the existing shape (`src/core/transcripts/index.js:11-24`)
with one added per-message key, `derived_from_untrusted` (Table A row A5), and
**no `skill_invocations` key on either harness** (row B3). `GateExtract` is
`{harness, session_id, messages: [{role}], skill_invocations: [...]}` and
carries no `text` key anywhere (row B2).

The per-harness parsers gain **one additive optional parameter**: a record
observer that sees exactly the same record stream the default policy sees, in
the same order, including the oversized-record signal. Called without it, each
parser behaves byte-for-byte as it does at the base commit (AC5). The
implementer chooses the parameter's exact name and shape.

`src/core/transcripts/stream.js` is deliberately **not** a deliverable and needs
no change: each parser's existing `onLine` closure already receives every line
and the `OVERSIZED_RECORD_MARKER`, so the observer is invoked from inside that
closure and the bounded read stays one call to `streamLines` per file (row B1).
If that turns out to be false, stop and say so rather than widening the
boundary.

#### Literal worked example

Source file `/samples/claude-demo.jsonl`, four records:

```jsonl
{"type":"user","sessionId":"demo","cwd":"/w","timestamp":"2026-09-17T09:00:00.000Z","message":{"role":"user","content":"Use the packing-list skill."}}
{"type":"assistant","timestamp":"2026-09-17T09:00:05.000Z","message":{"role":"assistant","stop_reason":"tool_use","content":[{"type":"text","text":"Running it now."},{"type":"tool_use","id":"tu1","name":"Skill","input":{"skill":"packing-list"}}]}}
{"type":"user","timestamp":"2026-09-17T09:00:09.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","is_error":false,"content":"ok"},{"type":"text","text":"No, sort them alphabetically."}]}}
{"type":"assistant","timestamp":"2026-09-17T09:00:20.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"Sorted alphabetically."}]}}
```

At the base commit `parse()` returns four messages
(`user`, `assistant "Running it now."`, `tool_result "ok"`,
`assistant "Sorted alphabetically."`) and
`skill_invocations: [{skill:"packing-list", index:2, resultIndex:2,
errored:false}]` — **measured by running the real parser at `05f1f55d`, which
also confirms the third record's `text` block is dropped today.** After this
package, `parsePrimaryWithOutcome` returns the three values below for the same
file. `JSON.stringify(result.extract, null, 2)` is exactly:

```json
{
  "harness": "claude",
  "session_id": "demo",
  "started": "2026-09-17T09:00:00.000Z",
  "cwd": "/w",
  "source_path": "/samples/claude-demo.jsonl",
  "truncated": false,
  "messages": [
    {
      "role": "user",
      "text": "Use the packing-list skill.",
      "ts": "2026-09-17T09:00:00.000Z",
      "derived_from_untrusted": false
    },
    {
      "role": "user",
      "text": "No, sort them alphabetically.",
      "ts": "2026-09-17T09:00:09.000Z",
      "derived_from_untrusted": false
    },
    {
      "role": "assistant",
      "text": "Sorted alphabetically.",
      "ts": "2026-09-17T09:00:20.000Z",
      "derived_from_untrusted": true
    }
  ]
}
```

Read that output against Table A: the second record is an intermediate progress
reply (`stop_reason: "tool_use"`) and supplies nothing (A2); the third record's
`tool_result` block supplies no user text while its `text` block does (A2 — the
defect this package fixes); the final assistant reply is retained but its
`derived_from_untrusted` is **true**, because tool output was observed earlier
in this session and A5's assistant taint state never resets (A5(b)).

**Note the asymmetry deliberately shown here.** The second retained message is
the user's correction, which arrives in the same record as the `tool_result` and
is nevertheless `false` — a user message is `false` by role, regardless of any
tool output before it (A5(a)). The assistant reply four seconds later is `true`.
That is today's behavior preserved, not a new one; its residual is owner item 3.
The third record is also row A5e step 3's worked case: **one record both taints
and supplies dialogue**, because its `tool_result` block sets the state while its
`text` block is accepted.

`JSON.stringify(result.gateExtract, null, 2)` is exactly:

```json
{
  "harness": "claude",
  "session_id": "demo",
  "messages": [
    { "role": "user" },
    { "role": "assistant" },
    { "role": "tool_result" },
    { "role": "assistant" }
  ],
  "skill_invocations": [
    {
      "skill": "packing-list",
      "index": 2,
      "resultIndex": 2,
      "errored": false
    }
  ]
}
```

and `result.intakeBytes` is `566` — the compact JSON byte length of the raw
capped extract `parseWithOutcome` returns for this same file, measured against
the real parser at the base commit. The projected extract is 511 compact bytes;
**the byte count the collector will bound is the 566, not the 511** (row B4).

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 activation trigger fires on five of seven: (i) the parser's result
shape changes; (iii) structured input parsing and schema acceptance change;
(v) authority boundary — this module emits the evidence `validate.js` owns the
interpretation of; (vi) `WP-dream-primary-dialogue-collection` and
`WP-dream-primary-dialogue-filter` both inherit these contracts; (vii) the same
facts appear in the Deliverables notes, the worked example, the acceptance
criteria and the verification greps.

### Contract table(s)

#### Table A — what primary dialogue is

Each acceptance rule **enumerates what is accepted**. Any record, role, block
type, phase or metadata value not named here supplies **no** primary dialogue;
there is no forbidden list, because a forbidden list over someone else's
grammar cannot be closed.

| ID | Contract | Rule |
|----|----------|------|
| A1 | Scope of retention | Within the existing bounded read, redaction and caps (row A6), retain genuine user requests and corrections plus the concluding assistant reply of each exchange. The unit is the exchange, not the session: a user request that never received a concluding reply is retained on its own. Original order and timestamps are preserved. Nothing is summarized, merged, reordered or rewritten; no text that was not in the source appears in the result. |
| A2 | Claude acceptance | From a record whose top-level `type` is exactly `"user"`, which has no `isMeta: true` and no `isSidechain: true` (row A4), and whose `message.role` is exactly `"user"`: accept the whole of `message.content` when it is a string; when it is an array, accept the `text` value of each block whose `type` is exactly `"text"`, joined with `"\n\n"` in source order, as one user message. From a record whose top-level `type` is exactly `"assistant"` and whose `message.stop_reason` is exactly `"end_turn"`: accept the `text` value of each block whose `type` is exactly `"text"`, joined with `"\n\n"`, as one assistant message, dropping the message if that join is empty. Nothing else — no other `type`, no other `stop_reason` (including an absent one), no `tool_result`, `tool_use`, `thinking` or `image` block — supplies primary dialogue. |
| A3 | Codex acceptance | Use the **first** `session_meta` record for `session_id`, `started` and `cwd`, exactly as `codex.js:176-182` does today. From a record whose top-level `type` is exactly `"response_item"` and whose `payload.type` is exactly `"message"`: when `payload.role` is exactly `"user"`, accept the `text` of each `payload.content[i]` whose `type` is exactly `"input_text"` **and** whose parallel metadata entry `payload.internal_chat_message_metadata_passthrough.content_item_kinds[i]` is exactly the string `"user.text"`, joined with `"\n"` in source order, as one user message; the metadata must be a plain object and `content_item_kinds` an array of exactly the same length as `payload.content`, or the record supplies nothing. **The kind, not the block type, is what decides**: the harness's injected `agents_md.instructions`, `environments.environment_context`, `plugins.recommendations` and `goal.internal_context` material rides `input_text` blocks too (145 measured occurrences), so a rule keyed on the block type alone would readmit exactly the boilerplate this package exists to remove. When `payload.role` is exactly `"assistant"` **and** `payload.phase` is exactly `"final_answer"`, accept the `text` of each `payload.content[i]` whose `type` is exactly `"output_text"`, joined with `"\n"`, as one assistant message. Nothing else supplies primary dialogue: not `role: "developer"` or any other role, not `phase: "commentary"` or an absent phase, not any other `payload.type` (`reasoning`, `custom_tool_call`, `custom_tool_call_output`, `function_call`, `function_call_output`, `agent_message`), not any other top-level `type` (`event_msg`, `token_usage_record`, `turn_context`, `world_state`, `compacted`, `inter_agent_communication_metadata`). Codex messages keep `ts: null`, as today. |
| A4 | Copied context | A **Claude** record carrying `isSidechain: true` supplies no primary dialogue: a subagent's turns are a copy of instructions its parent already issued, and counting them would invent a second human. No `true` value exists anywhere in the local 236-file corpus, so this rule is written from the field's presence rather than an observed positive and must be exercised by a constructed fixture. A **Codex** rollout supplies primary dialogue only when its first `session_meta` record's `payload.thread_source` is exactly the string `"user"`, **or** when that key is absent from the payload — those two states, and no others. `"subagent"` (32 of 50 sampled files) is the agent's own rollout, whose user-role records are the parent's instructions to it; `"guardian_review"` (5 of 50) is a second fork mechanism; any other or malformed value is unrecognized and yields nothing. The absent case is accepted because the field is present in 50/50 sampled rollouts and co-occurs with `multi_agent_version`, so its absence indicates a harness build with no subagent concept — **that inference is not itself measured**, and this list is one of the lists `docs/runbooks/codex-pin-bump.md` requires re-verifying at every Codex pin bump. Beyond these two exclusions this package does not deduplicate, reads no ordinal or lineage field, and makes no claim that independent recurrence is solved: an ordinary resumed or forked session retains today's duplication limitation. |
| A5 | **Provenance — CANONICAL.** | Each retained message carries a code-derived boolean `derived_from_untrusted`, computed over the **original record stream**, before projection and before the caps of row A6. Nothing but this code writes the field. Two different rules apply, and conflating them is the error this row exists to prevent. **(a) A user message accepted under A2 or A3 is `false`, always — regardless of anything earlier in the session, including tool output and context gaps.** That is exactly today's rule (`skills/wienerdog-dream/SKILL.md:101-105`: `true` when any supporting message has role `tool_result`, `false` when every supporting message has role `user` or `assistant`), and this package does not change it. The person is the trust root: someone who repeats external text into the conversation has chosen to say it. The residual this leaves is real and is priced in owner item 3. **(b) An assistant message** is governed by a monotonic taint state over the same stream. The state starts `false` and is set `true` **permanently** by either a record the raw policy classifies as tool output (a Claude `tool_result` block; any Codex payload in `TOOL_OUTPUT_TYPES`) or a **context gap** as row A5a defines it. An assistant message is `false` only while the state is `false`, and `true` from the first such event through the end of the session. A new user request, a dropped exchange, a cap, or any later boundary **never** lowers the state. |
| A5b | What `false` does and does not claim | `derived_from_untrusted: false` claims exactly one thing: **the harness attributed this record to the user role** (or, for an assistant message, that no tool output and no gap preceded it). It is **not** a claim that a human authored the words. It cannot be: across 7 headless and 53 interactive local transcripts the first `user` record carries an identical top-level field set, so a `claude -p` routine prompt — Wienerdog's own code-authored text — is indistinguishable from a person's (see Implementation notes). Nor does `false` claim the content is true, that it was independently verified, or that it is safe to obey. Every surface that states this definition states it in these terms; no surface may say `false` means "no earlier tool output or gap" without restricting that clause to assistant messages. |
| A5a | Stream-level context gaps | A **context gap** is a point at which code could not determine what a record was. Four of them come from the reader itself, derived by reading `src/core/transcripts/stream.js`, `claude.js` and `codex.js` end to end: **(G1)** an over-long line the reader replaced with `OVERSIZED_RECORD_MARKER` (`stream.js:113-118`); **(G2)** a line rejected by the `maxJsonDepth(line) > Limits.MAX_JSON_DEPTH` guard before `JSON.parse` (`claude.js:119`, `codex.js:168`); **(G3)** a line whose `JSON.parse` threw (`claude.js:121-125`, `codex.js:170-174`); **(G4)** a read cut short by the exhausted budget (`stream.js:129-138`, surfaced as `runExhausted`), which loses the file’s tail. G2 and G3 are **silent today** — outcome stays `ok`, `oversizedRecords` stays `0`, `truncated` stays `false` (measured). **(G5)** a `streamLines` outcome other than `ok` (`over-ceiling`, `read-error`, `too-many-lines`) is total rather than partial: the parser returns an empty extract with no message to carry a value. The fifth source of gaps is a record that parsed but whose schema could not be read — row A5c. |
| A5c | **Schema discriminators, BY ENCLOSING RECORD TYPE — CANONICAL.** | A discriminator is only ever required where the enclosing record’s own schema has one. A record is **unclassifiable** — and therefore a gap that taints — only when the check its own schema owes cannot be made. **Every recognised top-level type and what it owes:** *Codex* — the top-level `type` must be a non-empty string, else unclassifiable. `session_meta` owes **no `payload.type` at all**: `codex.js:176-182` consumes `payload.id`, `payload.timestamp` and `payload.cwd`, and row A4 consumes `payload.thread_source`, so it is well-formed when `payload` is a plain object and unclassifiable when `payload` is absent or is not one. (Row A4’s "`thread_source` absent" acceptance requires that well-formed payload; a `session_meta` whose payload cannot be read supplies no dialogue rather than defaulting to accepted.) `response_item` owes a `payload` that is a plain object **and** a `payload.type` that is a non-empty string in the decided list — `message`, the five `TOOL_OUTPUT_TYPES` (`custom_tool_call_output`, `function_call_output`, `local_shell_call`, `web_search_call`, `tool_search_output`), and the observed non-tool item types `reasoning`, `custom_tool_call`, `function_call`, `agent_message`; anything else there is unclassifiable. Every **other** Codex top-level type — `event_msg`, `token_usage_record`, `turn_context`, `world_state`, `compacted`, `inter_agent_communication_metadata`, and any future one — is declined whole at the record level, is never looked inside, and owes **no** sub-discriminator. *Claude* — the top-level `type` must be a non-empty string, else unclassifiable. `user` and `assistant` owe a `message` that is a plain object; a `user` record additionally owes a `message.content` that is a string or an array, and an `assistant` record a `message.content` that is an array — anything else is unclassifiable, because code cannot then tell whether the envelope carried blocks. Every other top-level type owes nothing at the record level and is declined whole, subject to row A5d. **Declining a record whose schema WAS readable is never a gap.** |
| A5c-blocks | **Content-block discriminators — every block, in every envelope — CANONICAL.** | Validating the *container* is not validating its *contents*, and round 4 measured the gap: a paired tool-result block with its `type` deleted, or set to `7`, is silently lost by the real parser (`outcome: ‘ok’`, `oversizedRecords: 0`, `truncated: false`) and an executable transcription of row A5e emitted the following conclusion `false`. So: **for every record the observer can parse, in EVERY envelope — accepted or declined — each element of an array-valued content must be a plain object whose `type` is a non-empty string AND one of the decided block types below.** Any element that is not makes the record unclassifiable: it **taints permanently, and the record supplies no dialogue at all** — step 2 of row A5e stops there rather than falling through to emission. *Decided Claude block types:* `text`, `tool_result`, `tool_use`, `thinking`, `image` — every one observed locally, in `message.content`. *Decided Codex block types:* `input_text`, `output_text`, `input_image`, in a `message` payload’s `content`. **A block whose type is decided but which A2/A3 decline never taints** — `image`, `thinking` and `input_image` are the controls, and row A5d already settles `tool_use`. **A content value that is not an array taints only where its own record schema owed one** (row A5c: a Claude `user` record owes a string or an array, an `assistant` record owes an array, a Codex `message` payload owes an array); in a **declined** envelope a non-array content carries no blocks to hide anything in and does **not** taint. **Codex `content_item_kinds` that is present but misaligned with `payload.content` is caught at a different step**: the blocks themselves are valid, so step 2 passes and **A3 declines the record at step 4 — no taint**, because a Codex `message` payload is never tool output. |
| A5c-why | Why an unfamiliar Claude top-level type is not, by itself, a gap | Row A5c declines an unrecognised Claude top-level type whole instead of tainting on it, and that is the judgment call of this package. **Claude does not signal tool output by top-level type** — tool results arrive as a `tool_result` block, which row A5d catches wherever the block appears — so an unfamiliar envelope with no tool content is not evidence that anything was lost. Tainting on it would also be a cliff: the local corpus carries seventeen top-level types and the auxiliary ones are constant (`attachment` alone appeared 3,992 times in 16,218 records), so the first type a future Claude Code release introduces would appear early in nearly every session and taint every assistant message after it — silently ending Tier-3 learning from assistant text across the whole install. **The principle, stated once because round 4 made it general:** taint on an unrecognised value exactly where the harness signals tool output — the Codex `payload.type` of a `response_item` (row A5c) and the content-block `type` of either harness (row A5c-blocks) — and decline without tainting everywhere else, which is the top-level record type of both harnesses. **That buys two more cliffs deliberately**: a new Codex item type, and a new content block type such as a future `redacted_thinking` or a `web_search_tool_result`, each taints every session containing it until its decided list is updated. The block-level one is worth it because that is precisely where a renamed or case-shifted tool result would hide — measured as ADV-1 and ADV-2 of the round-4 model run, which a presence-and-shape check alone let through. **No counter or diagnostic tells a maintainer either cliff is firing, and this package adds none** — the owner’s scope record excludes new reporting infrastructure. What is visible is the taint itself in the scratch extracts; a per-run unclassified-record count is routed to `WP-dream-report-run-skips` as a candidate, not built here. Owner item 4 puts the choice on the record. |
| A5d | **A recognised tool-result block outranks envelope exclusion — CANONICAL.** | Inside the observer, and **never** in the default parser output, every record that parsed is inspected for tool content before its envelope is declined. **Claude:** if `message.content` is an array, any block whose `type` is exactly `"tool_result"` sets the taint state, whatever the enclosing record’s top-level `type` is and whatever `isMeta` says. This was measured: a `tool_result` block placed under an `attachment` record, under an unfamiliar top-level type, under an `assistant` record and under an `isMeta: true` user record each vanished from the real parser with `outcome: ‘ok’` and `truncated: false`, leaving the following assistant conclusion untainted. **The scan is bounded to that one array** — `message.content` at depth one — and is not a recursive search of attacker-controlled JSON; a `tool_result` hidden anywhere else is a named residual, not a covered case. **A `tool_use` block does NOT taint**, and that is a decision rather than an omission: a request to run a tool carries no external content, only its result does, and every route by which a result reaches the transcript is already covered — an accepted envelope (row A5), a declined envelope (this row), or a loss (row A5a). Tainting on `tool_use` would also fire on ordinary progress replies, which carry 1,901 `tool_use` blocks in 3,789 sampled assistant records, and would taint nearly every session. **Codex needs no equivalent scan and does not get one:** its tool output has a top-level home, so it is caught by row A5c’s `response_item` rule, and an unrecognised `payload.type` there already taints — a stronger protection than Claude has, because Codex signals tool output by type and Claude by block. The residual is a tool payload nested inside a declined Codex envelope such as `event_msg`, whose internal shape this package did not inspect and does not guess about; it is routed to the list `docs/runbooks/codex-pin-bump.md` re-verifies. |
| A5e | **The ordered decision procedure — code from THIS.** | For each line of the transcript, in order, do exactly this. The taint state starts `false` and is **monotonic**: any step that sets it leaves it set for the rest of the session, and no later step lowers it. **1.** The line did not reach the parser intact (G1–G4 of row A5a) → **taint**; there is no record to examine; next line. **2.** The record parsed. Are **both** schema checks satisfied — the one its own record type owes (row A5c) **and** a decided-type discriminator on every element of any array-valued content, in this envelope whether the envelope is accepted or declined (row A5c-blocks)? If either fails → **taint**, and **this record supplies no dialogue**: go to the next line without reaching steps 3–5. **3.** Does the record contain a recognised tool-result block or payload (row A5d for a Claude `message.content` block; row A5c’s `TOOL_OUTPUT_TYPES` for a Codex `response_item`)? If yes → **taint**, and continue to step 4: **one record can both taint and supply dialogue**, which the worked example’s third record does — its `tool_result` block taints while its `text` block is accepted. Because this step runs before step 5 emits, a message emitted from a record that itself carries tool content is judged against the already-set state, so an assistant reply sharing a record with a `tool_result` block is `true`. **4.** Does A2 or A3 accept the record as primary dialogue? If no → it is classified-and-declined; **no taint**; next line. **5.** It is accepted. A **user** message is emitted with `derived_from_untrusted: false` — always, by role, whatever the state is (row A5(a)). An **assistant** message is emitted with `derived_from_untrusted` equal to the current taint state (row A5(b)). **6.** At end of file, a `streamLines` outcome other than `ok` (G5) means the extract is empty and carries no flags at all. Row A6’s caps and redaction then apply to whatever was emitted, and they never change a flag. |
| A6 | Existing caps | Apply the **existing** limits to the projected messages, in the existing order: redact through `capMessage` (`index.js:102-110`) and then cap at `MAX_MSG_CHARS` 4,000 characters, then retain the newest `MAX_MESSAGES` 2,000 messages. `truncated` is `true` when the raw extract's `truncated` is true or either projected cap fired. Metadata (`harness`, `session_id`, `started`, `cwd`, `source_path`) is copied unchanged from the raw extract, including `boundExtractPath`'s treatment of the two paths. This package adds no new cap, restores nothing lost to the existing ones, and never truncates to fit a model. |

#### Table B — what `parsePrimaryWithOutcome` returns

| ID | Contract | Rule |
|----|----------|------|
| B1 | One bounded read | The three values come from **one** call to `streamLines` per transcript, debiting the caller-owned `budget` exactly once, so intake I/O accounting is unchanged. `parse` carries the existing `{outcome, oversizedRecords, runExhausted}` fields with their existing meanings. The raw capped extract used to derive `gateExtract` and `intakeBytes` is **not returned**: no caller can write tool text it never received. |
| B2 | `gateExtract` | `{harness, session_id, messages, skill_invocations}`. `messages` has **exactly the same length and positions** as the raw capped extract's, and each element is an object whose only key is `role`, carrying the raw message's role verbatim. `skill_invocations` is the raw capped extract's array verbatim — same `skill`, `index`, `resultIndex`, `errored`, already rebased by the existing `rebaseInvocations` path — or absent for Codex, exactly as today. No `text` key occurs anywhere in the value. This is the input `src/core/dream/validate.js:510-527` needs and the only input it needs; producing it from the raw timeline rather than the projection is what keeps the gate's verdicts identical. |
| B3 | No invocation metadata in the extract | `extract` carries **no** `skill_invocations` key, on either harness. Invocation names, indices and error states are tool-record detail and belong to `gateExtract` alone. A consumer that wants to know whether a skill ran asks the gate, not the model. |
| B4 | `intakeBytes` | `Buffer.byteLength(JSON.stringify(<the raw capped extract>))` — byte-identical to what `src/core/dream/scratch.js:118` computes today from `parseWithOutcome(...).extract`. It is the number the collector's capacity bound will be measured against, which is what gives the successor package **byte-policy equivalence**: every byte-based admission decision is the one the base commit would make. **It does not make the admitted session set identical.** The collector also stops on a soft wall-clock preprocessing deadline, which projection changes the cost of, so a deadline-deferring run can admit a different set in either direction; the successor's rows C1 and C1a own that statement and this package neither makes nor weakens it. This package only returns the number. |

### Mirrored Surface Checklist

For each canonical table above, every surface in this spec that mirrors it. A
review finding updates the table **and every mirror below in the same commit**;
a newly found mirror is registered here on the spot.

- [ ] **Deliverables-table cells that restate a path or rule** — walked: the
      `claude.js` cell names A2/A4/A5–A5a; the `codex.js` cell names A3/A4/A5–A5a;
      the `index.js` cell names Table B and A6; the `primary-dialogue.js` cell
      names Tables A and B; the fixtures cell names AC5; the proofs cell names
      AC1–AC4.
- [ ] **Acceptance criteria that assert its facts** — walked: AC1 asserts A2 and
      A4 (Claude); AC2 asserts A3; **AC3 asserts A5(b), AC3a asserts A5(a) and
      A5b, AC3b asserts A5a, AC3c asserts A5c **and A5c-blocks**, AC3d asserts A5d,
      and their
      negative controls assert A5c-why; **AC3–AC3d together walk row A5e's
      procedure step by step**; AC4 asserts B1–B4; AC4a asserts A6 and B1's
      one-`streamLines`-invocation clause; AC5 asserts the unchanged-default
      half of B1 and the Deliverables boundary.
- [ ] **Verification commands / greps** — walked: the `parsePrimaryWithOutcome`
      existence probe mirrors Table B's signature; the `tests/fixtures/transcripts/`
      untouched check mirrors AC5; the `rg` in Current-state verification
      mirrors the Current-state cites A2/A3/B2 rest on; the `rg` over
      `maxJsonDepth` mirrors row A5a's G2; the `rg` over the codex fixture's
      first line mirrors A5c's `session_meta` clause.
- [ ] **Current-state description** — walked: the `claude.js:138-155` ignore
      backs A2's array-`text` clause; `codex.js:61`/`:110-125` backs A3's
      developer and phase clauses; `codex.js:176-182` backs A3's first-header
      clause and A4's Codex clause; `validate.js:510-527` backs B2;
      `scratch.js:118` backs B4; **the four context-losing-return cites
      (`stream.js:113-118`, `:129-138`; `claude.js:119`, `:121-125`;
      `codex.js:168`, `:170-174`) back row A5a, **the silent-discriminator
      cites (`claude.js:127`, `codex.js:184`, `:110-125`'s `mapCodexItem`
      fall-through) back A5c, `codex.js:176-182` backs its `session_meta` clause,
      `claude.js:132-183` backs row A5d's `message.content` scan, and
      `codex.js:61`/`:68-74` back A5c's decided
      list**; `SKILL.md:101-105` backs
      A5(a), and `validate.js:191-216` backs owner item 3's overrule cost.** In
      the format-evidence table specifically: the `stop_reason` and array-block
      rows back A2, the `content_item_kinds` alignment and values rows back A3,
      the `isSidechain` and `thread_source` rows back A4, and the
      `custom_tool_call_output` row backs the F2 disposition in Implementation
      notes.
- [ ] **Operative prose steps that apply it** — walked: Context's "three things
      from one bounded read" paragraph applies B1–B4; the Exact-contracts
      `parsePrimaryWithOutcome` block and both `GateExtract`/`Extract` sentences
      apply B2/B3; the literal worked example, the paragraph reading it back and
      **the asymmetry note after it** apply A2, A5(a), A5(b), **A5e step 3**
      and B2/B4;
      Implementation notes' headless-collapse, verified-text,
      **observer-placement, declined-envelope, read-A5e-as-the-spec**,
      `thread_source`, F2-defect, default-parse and
      derived-proof bullets apply A2, A3, A4, A5, A5a, A5b, B1 and the RED-proof
      register; Out of scope's block-grouping bullet applies A1; owner item 1
      applies B4, owner item 2 applies A4, **owner item 3 applies A5(a) and
      owner item 4 applies A5c and A5c-why, owner item 5 applies A5d, and **owner
      item 6 applies A5c-blocks**.
- [ ] **Registered in round 4:** the model-transcription bullet in Implementation
      notes applies A5e as a whole, and the logbook's round-4 results table is
      the evidence for rows A5c-blocks and A5c-why; a change to either must
      re-run that model rather than reason about it.

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, no build step** (CLAUDE.md). Plain
  Node ≥ 18 with JSDoc annotations.
- **Two consequences of Table A, stated so they are accepted knowingly.**
  (1) *A headless routine session collapses to its prompt and its closing
  report.* A scheduled digest or routine run is one `claude -p` prompt
  (`src/core/runtime-profile.js:190`) and one final answer; every operational
  detail between them — refusals, retries, timings, which step printed what —
  lives in tool records and disappears from the dream's view. That is the
  intended trade, and it is visible: exactly that kind of detail currently
  reaches the owner's daily notes. (2) *A routine's prompt is code-authored,
  yet A2 classifies it as an ordinary user record.* **This was measured, not
  assumed:** across 7 genuine headless dream-job transcripts and 53 interactive
  ones, the first `user` record carries the identical top-level field set
  (`cwd, entrypoint, gitBranch, isSidechain, message, parentUuid,
  permissionMode, promptId, promptSource, sessionId, timestamp, type, userType,
  uuid, version`), with `isMeta` absent and `userType` `"external"` on both.
  `entrypoint` looks like a discriminator and is not — its `cli`/`sdk-cli`
  split follows client version and mixes headless and interactive files on both
  sides. **There is therefore no field in the Claude transcript schema by which
  this projection can tell a `claude -p` routine prompt from a human one.** Do
  not add a heuristic (a project-directory name, a prompt prefix) to invent one:
  the risk is low — it is Wienerdog's own text, and A5(b) still taints the
  assistant's conclusion once tool output appears — and a wrong heuristic would
  be worse than the known limitation. Row **A5b** is where this consequence is
  stated as a contract; this bullet is its measurement, and the two must not
  drift apart.
- **The silent-discriminator paths, measured.** `claude.js:127`
  (`if (obj.type !== 'user' && obj.type !== 'assistant') return;`),
  `codex.js:184` (`if (obj.type !== 'response_item') return;`) and
  `mapCodexItem`'s final `return null` (`codex.js:110-125`) all treat a
  **missing** discriminator exactly like a declined one. Executed at the base
  commit: a Claude record carrying a `tool_result` block but no top-level
  `type`, and a Codex `response_item` whose `payload` has no `type`, each
  vanished with `outcome: 'ok'`, `oversizedRecords: 0`, `truncated: false` and
  the following assistant message retained. Row A5c is what separates those
  from a real decline; the observer needs the distinction, and the default
  parser output must not change in either case.
- **A declined envelope is not an empty envelope.** Measured on the real parser:
  `message.content: [{"type":"tool_result","content":"EXTERNAL"}]` placed under
  an `attachment` record, under an unfamiliar top-level type, under an
  `assistant` record and under an `isMeta: true` user record each vanished with
  `outcome: 'ok'` and `truncated: false`, leaving the following assistant
  conclusion untainted. Row A5d is the fix and its shape matters: the block scan
  belongs in the **observer**, reached before the envelope decision, and it is
  bounded to `message.content` at depth one. Do not make it recursive — an
  unbounded walk of attacker-controlled JSON is a new surface, and the residual
  of the bounded scan is named in the row rather than papered over.
- **Transcribe row A5e into a throwaway model before writing production code,
  and run the fixtures through it.** That is how P4-1 was confirmed and how two
  further holes were found that no review round had raised: a block whose `type`
  is a valid string but an unrecognised one (`"TOOL_RESULT"`,
  `"web_search_tool_result"`) passed a presence-and-shape check and left the
  conclusion `false`. The round-4 run is tabulated in
  `docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md`: 35 sequences
  against three candidate readings of the prose, ending at 0 mismatches only
  once the decided block list was in. **Where a model and this prose disagree,
  the prose is wrong** — that rule found the fifth boundary and it is cheaper
  than a review round.
- **Read row A5e as the specification and the other A5 rows as its definitions.**
  Three consecutive review rounds found boundary cases in the prose form of this
  contract — a reset at a user boundary, a silent depth-limit drop, a missing
  discriminator, a `session_meta` with no `payload.type`, a tool result hiding
  in a declined envelope. Each was a case the prose did not name rather than a
  rule anyone disagreed with. A5e is the ordered procedure those rounds
  converged on; implement it step by step and use A5, A5a, A5b, A5c and A5d to
  resolve its terms.
- **The observer must be wired BEFORE each context-losing return, not after the
  existing guards.** Row A5a's four cases are where a policy that reads only
  the retained records is blind, and the design review measured the worst of them:
  with a tool record made of valid JSON nested deeper than
  `Limits.MAX_JSON_DEPTH` (64), **both** parsers discard it, retain the
  concluding assistant message, and report `outcome: 'ok'`,
  `oversizedRecords: 0`, `truncated: false`. Nothing downstream of the guard can
  discover that the record existed. The same is true of a `JSON.parse` failure.
  An implementation that notifies the observer from inside the classification
  branches only — after `JSON.parse` has succeeded — satisfies no part of A5a.
- **Why `thread_source` and not `parent_thread_id` (row A4).** A
  `parent_thread_id` is present in 37 of 50 sampled rollouts, but 5 of those are
  `thread_source: "guardian_review"` — a different fork mechanism, with a
  differently shaped `source` and no `agent_path`. Keying the exclusion on the
  presence of `parent_thread_id` would therefore over-match, and keying it on
  `agent_path` or `agent_nickname` would couple the rule to fields whose values
  this spec deliberately never inspected. `thread_source` is one field with one
  accepted value, which is what makes A4 a closed acceptance rule rather than a
  list of shapes to reject. This exclusion is the single largest reduction the
  package makes on a Codex-heavy install — 32 of 50 sampled rollouts — so it is
  routed as owner item 2.
- **The assessment's F2 parser defects, dispositioned.** (a) *Codex
  `custom_tool_call_output` arrays normalize to empty text* — `codex.js:91`
  tests `payload.content`, which occurs in 0 of 4,422 sampled records, while
  the payload is under `output` (array 4,175, string 247). **This is moot for
  this package and is not fixed here:** no tool record supplies primary
  dialogue (A3), and `gateExtract` carries roles without text (B2), so the lost
  text reaches neither surface. It remains a historical finding about the raw
  extract. (b) *Codex developer messages become `role: 'user'`* — exactly what
  A3 fixes, by accepting `role: "user"` alone. (c) *Ordinary `text` blocks in
  array-valued Claude user content are ignored* — A2 accepts them, and the
  literal worked example is the fixture for it.
- **Keep the default parse byte-identical.** The observer parameter is additive
  and the projection never mutates the raw message objects it observes. This is
  what lets `tests/fixtures/transcripts/` stay outside the Deliverables
  boundary, which is the mechanical enforcement of AC5.
- **Do not add exchange-block identifiers.** The predecessor draft grouped
  consecutive user messages through their concluding reply into blocks `b0`,
  `b1`, … Those identifiers exist only so a relevance model can name a
  selection unit, and that model is `WP-dream-primary-dialogue-filter`, which
  is parked. Shipping the field now would put a contract with no consumer into
  the model-visible extract and into the dream skill's documented shape. **A1's**
  order and timestamp guarantees are what make the grouping derivable later
  from the projected messages alone.
- **The RED proofs' `expectRed` sets are DERIVED, not measured** — the code they
  mutate does not exist yet. The implementer measures each set by running
  `npm run red-proofs` and **corrects the declaration**. Correcting a set may
  falsify prose, so these are the sentences that depend on it and must be
  re-read in the same pass: the `tests/red-proofs/primary-dialogue.proofs.json`
  Deliverables note ("RED proofs for AC1–AC4"); this bullet; and each of AC1,
  AC2, AC3 and AC4's clause naming which behavior its proof reddens. If a
  measured set proves a criterion needs more than one mutation, add it and
  update those four clauses — do not leave a criterion `PROVEN` by a proof that
  reddens for another criterion's reason.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] No untrusted identifier from a transcript flows into a filesystem path or
      a shell command in this package: `session_id` is not used to build a path
      here (`src/core/dream/scratch.js:128` sanitizes it, and that line is
      outside this boundary), and the two paths that do appear in the result are
      the code-supplied `source_path` and `cwd`, bounded unchanged by the
      existing `boundExtractPath` (row A6).
- [ ] Redaction still runs **before** the character cap, on every projected
      message, through the one shared detector (row A6, ADR-0024). No projected
      message reaches a caller un-redacted.
- [ ] `gateExtract` carries no message text (row B2), so widening the gate's
      input cannot widen what any consumer can read.
- [ ] Transcript text is data, never instruction: this package classifies
      records by structure only and never branches on message content.

## Acceptance criteria

- [ ] **AC1 — Claude acceptance (Table A rows A2, A4).** For fixtures under
      `tests/fixtures/primary-dialogue/`: a string `message.content` is retained
      whole; `text` blocks in array-valued user content are retained and
      `tool_result` blocks in the same array contribute no user text; assistant
      text is retained when `stop_reason` is `"end_turn"` and not when it is
      `"tool_use"`, `"stop_sequence"`, or absent; `thinking` and `image` blocks
      contribute nothing; a record with `isMeta: true` and a record with
      `isSidechain: true` each contribute nothing. Its RED proof reddens on
      removing the array-`text` acceptance.
- [ ] **AC2 — Codex acceptance (Table A row A3).** A `message` payload with
      `role: "developer"` contributes nothing; an `input_text` block is retained
      only when the parallel `content_item_kinds` entry is exactly `"user.text"`,
      and a message whose metadata is absent, is not a plain object, or whose
      `content_item_kinds` length differs from `payload.content` length
      contributes nothing; assistant `output_text` is retained on
      `phase: "final_answer"` and not on `"commentary"` or an absent phase; a
      `custom_tool_call_output`, a `reasoning` and an `agent_message` payload
      each contribute nothing; and a rollout whose first `session_meta` has
      `thread_source: "subagent"` or `"guardian_review"` yields an extract with
      no messages, while `"user"` and an absent `thread_source` each yield the
      rollout's dialogue. Its RED proof reddens on accepting
      `role: "developer"`.
- [ ] **AC3 — assistant taint never resets (Table A row A5(b)).** In a fixture
      where a tool record precedes two later exchanges, every assistant message
      from that point on carries `derived_from_untrusted: true`, including the
      one whose own exchange contains no tool record. Its RED proof reddens on
      resetting the state at a user-message boundary.
- [ ] **AC3a — user text is `false` by role (Table A row A5(a)).** The
      reviewer's fixture is the test of stated behavior: a session in which a
      tool record is followed by a user message quoting that tool output. Its
      retained user message carries `derived_from_untrusted: false`, and the
      assistant reply after it carries `true`. This asserts the rule the package
      preserves from `SKILL.md:101-105`, not a rule it introduces; owner item 3
      prices the residual. The fixture must also show that a user message
      arriving in the *same* Claude record as a `tool_result` block is `false`.
- [ ] **AC3b — every stream-level loss taints (Table A row A5a).** One
      fixture per case, each asserting that every retained assistant message
      after the loss carries `true`: **(G1)** an over-long line replaced with
      `OVERSIZED_RECORD_MARKER`; **(G2)** a Claude fixture *and* a Codex fixture
      whose tool record is valid JSON nested deeper than `MAX_JSON_DEPTH` —
      these must also assert the reviewer's measured baseline, that
      `parse.outcome` is `"ok"`, `parse.oversizedRecords` is `0` and the raw
      extract's `truncated` is `false`, so the fixture proves the observer sees
      what those three fields do not; **(G3)** a line that is not valid JSON;
      **(G4)** a budget exhausted mid-file. Its RED proof reddens on removing
      the depth-limit notification.
- [ ] **AC3c — an unclassifiable record, payload or block taints (Table A row
      A5c).** Every fixture here is valid JSON that passes `JSON.parse`, and
      each asserts the same silent triple as AC3b (`outcome` `"ok"`,
      `oversizedRecords` `0`, raw `truncated` `false`) **and** that every
      retained assistant message after it carries `true`. *Record level:* a
      Claude record carrying a `tool_result` block but **no top-level `type`**,
      and a Codex `response_item` record with no top-level `type` — both
      measured to vanish silently at the base commit. *Payload level:* a Codex
      `response_item` whose `payload` has **no `type`**, one whose `payload` is
      not a plain object, and one whose `payload.type` is a **string outside the
      decided list** (for example `"brand_new_tool_output"`). *Block level*
      (row A5c-blocks, and each of these must also assert the record supplies
      **no** dialogue, not merely that it taints): the round-4 counterexample in
      both variants — a `tool_use` record followed by its paired result block
      with the block's `type` **deleted**, and with it set to the number `7` —
      plus its **valid-result control**, which must still taint through row A5d;
      a block that is a bare string; a block that is `null`; a block whose
      `type` is a valid non-empty string **outside the decided list**
      (`"TOOL_RESULT"` and `"web_search_tool_result"` — the two the round-4
      model run caught that a presence-and-shape check alone let through); the
      same for a Codex `message` payload's `content`; and a Claude `user` or
      `assistant` record whose `message` is not a plain object, an `assistant`
      record whose `message.content` is not an array, and a `user` record whose
      `message.content` is `null`. **And the
      negative controls, which are what stop this criterion from tainting
      everything:** a Claude record whose top-level `type` is a recognised-shape
      string the policy declines (`"system"`, `"attachment"`) **and one whose
      type is a string this repository has never seen** each leave the following
      assistant message `false`; a Codex `payload.type` of `"reasoning"` leaves
      it `false`; and — the control the round-3 review's first finding turns on —
      **a normal `session_meta` header followed by a tool-free `final_answer`
      leaves that assistant message `false`.** That case is not hypothetical:
      the shipped fixture `tests/fixtures/transcripts/codex-rollout.jsonl` has a
      `session_meta` whose payload keys are exactly `id`, `timestamp`, `cwd`
      with **no `type`**, so a rule that demanded `payload.type` everywhere
      would taint every Codex session from its own header. **Three more
      non-tainting controls, one per decided-but-declined block type:** a
      `thinking` block, an `image` block beside a `text` block, and a Codex
      `input_image` each leave the following assistant message `false`; and a
      Codex `message` whose `content_item_kinds` is present but **misaligned**
      with `payload.content` leaves it `false` too — row A5c-blocks routes that
      to A3's decline at step 4, not to a taint. Its RED proof reddens
      on treating a missing `payload.type` as a positive decline.
- [ ] **AC3d — a recognised tool-result block outranks its envelope (Table A row
      A5d).** Four Claude fixtures, one per measured shape, each placing
      `message.content: [{"type":"tool_result", …}]` inside a declined envelope:
      **(a)** an `attachment` record, **(b)** a record whose top-level `type` is
      unfamiliar, **(c)** an `assistant` record, **(d)** an `isMeta: true` user
      record. Each asserts that every retained assistant message from that point
      on carries `true`, **and** that `parse`/`parseWithOutcome` output is
      byte-identical to the base commit's for the same bytes — the precedence
      lives in the observer and changes nothing the default parser emits.
      **Negative controls, which are the whole reason row A5c-why exists:** the
      same `attachment` and unfamiliar-type records carrying only a `text` block
      leave the following assistant message `false`. One more: a `tool_use`
      block with no paired result, in an `assistant` record, leaves it `false` —
      row A5d decides that deliberately. Its RED proof reddens on restoring
      envelope exclusion ahead of the block scan.
- [ ] **AC4 — return-value invariants (Table B).** For every fixture:
      `result.intakeBytes === Buffer.byteLength(JSON.stringify(parseWithOutcome(entry, freshBudget).extract))`;
      `result.gateExtract.messages` has the same length as that raw extract's
      `messages` and each element's roles match positionally;
      `result.gateExtract.skill_invocations` deep-equals the raw extract's (or
      both are absent); `JSON.stringify(result.gateExtract)` contains no
      `"text"` key; `result.extract` has no `skill_invocations` key. Its RED
      proof reddens on measuring `intakeBytes` from the projected extract.
- [ ] **AC4a — caps, redaction and the single read (Table A row A6, Table B
      row B1).** A projected message longer than `MAX_MSG_CHARS` carries the
      existing 4,000-character prefix plus the existing
      `…[truncated N chars]` suffix and sets `truncated`; a secret-shaped string
      in a projected message is redacted, and the redaction happens **before**
      the character cap (assert with a secret that straddles character 4,000);
      a projection of more than `MAX_MESSAGES` messages retains the newest 2,000
      and sets `truncated`. **The single bounded read needs two assertions, not
      one:** `parsePrimaryWithOutcome` debits `budget.remaining` by exactly the
      byte count one `parseWithOutcome` call debits for the same file, **and**
      `streamLines` is invoked exactly **once** for that call, with that same
      byte total. Debit equality alone is vacuous here and was measured to be:
      a double-read implementation that obtains the raw and projected extracts
      independently debits the caller's budget identically — 46 bytes in the
      reviewer's executed probe — while opening the transcript twice, which also
      lets the two reads observe different file contents. A RED proof declares a
      deliberate second-read mutation that must redden this criterion.
- [ ] **AC5 — the default parse is unchanged.** `parse` and `parseWithOutcome`
      return byte-identical results to the base commit for the whole existing
      fixture corpus, `tests/unit/transcripts.test.js` passes unmodified, and
      the diff touches no file under `tests/fixtures/transcripts/`.
- [ ] **Idempotency:** `N/A` — this package ships a pure parsing function, no
      command and no write outside the repo. Determinism is asserted instead by
      AC4 and AC5: the same input bytes yield the same result bytes.

## Verification steps (run these; paste output in the PR)

### Current-state checks — runnable before implementation

These inspect the baseline. They are **not** evidence the projection exists.

```bash
git rev-parse HEAD
git log --oneline 05f1f55d..HEAD -- src/core/transcripts/
rg -n "function parseWithOutcome|MAX_MSG_CHARS = |MAX_MESSAGES = " src/core/transcripts/index.js
rg -n "block.type === 'tool_result'|block.type === 'text'" src/core/transcripts/claude.js
rg -n "TRUSTED_MESSAGE_ROLES|function invocationWindowTainted" src/core/transcripts/codex.js src/core/dream/validate.js
rg -n "MAX_JSON_DEPTH|OVERSIZED_RECORD_MARKER|runExhausted" src/core/transcripts/stream.js src/core/transcripts/claude.js src/core/transcripts/codex.js
rg -n "derived_from_untrusted === false" src/core/dream/validate.js
head -1 tests/fixtures/transcripts/codex-rollout.jsonl | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).payload||{};console.log('session_meta payload keys:',Object.keys(p).join(','),'| payload.type:',String(p.type));});"
npm test -- tests/unit/transcripts.test.js tests/unit/transcript-stream.test.js
```

### Implementation checks — these must pass before the PR

```bash
test -f src/core/transcripts/primary-dialogue.js
test -f tests/unit/primary-dialogue.test.js
test -f tests/red-proofs/primary-dialogue.proofs.json
node -e "const t=require('./src/core/transcripts'); if (typeof t.parsePrimaryWithOutcome !== 'function') { console.error('parsePrimaryWithOutcome absent'); process.exit(1); } console.log('parsePrimaryWithOutcome present');"
test -d tests/fixtures/transcripts && [ -z "$(git diff --name-only origin/main...HEAD -- tests/fixtures/transcripts/)" ]
npm test -- tests/unit/primary-dialogue.test.js tests/unit/transcripts.test.js tests/unit/dream-validate.test.js
npm test
npm run lint
npm run red-proofs -- --wp WP-dream-primary-dialogue-projection
node scripts/boundary-check.js docs/specs/WP-dream-primary-dialogue-projection.md src/core/transcripts/claude.js src/core/transcripts/codex.js src/core/transcripts/index.js src/core/transcripts/primary-dialogue.js tests/unit/primary-dialogue.test.js tests/fixtures/primary-dialogue/claude-demo.jsonl tests/red-proofs/primary-dialogue.proofs.json
git diff --check
```

The fifth command is the AC5 boundary check and is deliberately **guarded**: a
bare `[ -z "$(git diff …)" ]` would also pass if the fixture directory were
deleted, so `test -d` runs first and the whole line fails when it is absent.

## Out of scope (do NOT do these)

- Wiring the projection into the collector, the scratch writer, the ledger, the
  dream skill or the gate — all of that is
  `WP-dream-primary-dialogue-collection`, which depends on this package.
- Any model call, relevance filtering, runtime profile, descriptor binding or
  supervision change — `WP-dream-primary-dialogue-filter`, parked behind an
  offline evaluation.
- Exchange-block identifiers (`b0`, `b1`, …) and any grouping field in the
  extract — see Implementation notes.
- Fixing the Codex `custom_tool_call_output` text loss, restoring tool text to
  any surface, adding lineage or deduplication machinery, or changing
  `MAX_MSG_CHARS` / `MAX_MESSAGES`.
- Editing `docs/adr/` — the ADR-0020 amendment this direction needs belongs to
  `WP-dream-primary-dialogue-collection`, which is where the dream skill's
  learning-discovery instructions change.
- Editing any file under `tests/fixtures/transcripts/` or
  `tests/golden/` (AC5).

## Dispatch precondition — owner items

Neither item blocks drafting. Both must be answered before this spec moves to
`Ready`. Nothing here records an owner decision; these are questions.

1. **Does `dream_max_input_bytes` bound transcript INTAKE or model-visible
   OUTPUT?** *Recommendation:* intake — row B4 measures the capacity bound
   against the raw capped extract, exactly as `scratch.js:118` does today, so
   every **byte-based** admission decision stays the base commit's. That is
   byte-policy equivalence, and it is the whole of the claim: the admitted
   session set is equal to the base commit's only when **both** the baseline run
   and the projected run avoid deadline deferral, because the collector's soft
   preprocessing deadline is wall-clock and projection changes what fits inside
   it. The successor package's rows C1 and C1a own that qualification. The scope
   record
   (`docs/specs/logbook/2026-09-17-dream-primary-input-scope.md`) reads
   "Preserve the existing X as an admission bound on the resulting normalized
   primary extracts", which can be read the other way. The recommendation
   follows that same record's own principle one level up — "without admitting
   more sessions simply because filtering freed space". *Cost of overruling:*
   the projection shrinks each extract, so more sessions fit the same bound and
   more are marked processed whether or not the consolidation agent read them
   (the assessment's F1: 198 marked processed, 20 read in full). Overruling
   therefore re-opens three things this split removed — a size-memo format
   discriminator in `src/core/dream/ledger.js`, a session-count bound or a
   lowered default, and the report wording that names which knob to raise. The
   full pricing is in `WP-dream-primary-dialogue-collection`'s owner items;
   this package is affected only through row B4.
2. **Should a Codex subagent rollout supply primary dialogue?**
   *Recommendation:* no — row A4 accepts a rollout only when its first
   `session_meta` has `thread_source: "user"` or no `thread_source` at all. A
   subagent rollout's user-role records are the parent agent's instructions to
   it, not the person's words, and treating them as dialogue is how one decision
   becomes two apparent confirmations. *Cost of overruling:* this is the
   package's largest single reduction — 32 of 50 sampled local rollouts are
   `thread_source: "subagent"` — so on a Codex-heavy install, admitting them
   keeps considerably more material at the price of that double-counting, and
   the dream's recurrence counts would continue to be inflated by it. A middle
   position (admit subagent rollouts but mark them) is **not** available in this
   package: the extract has no field for it and adding one is a contract with no
   consumer until `WP-dream-primary-dialogue-filter` exists.
3. **Should the monotonic taint state apply to user messages too?** The design
   review built the path: tool output arrives, and the person then quotes that
   output back. Row A5(a) marks that quoted text `false`. *Recommendation:* no
   — keep `false`. **This is today's behavior, not a new exposure.**
   `skills/wienerdog-dream/SKILL.md:101-105` already sets the flag from role
   alone: `true` when a supporting message has role `tool_result`, `false` when
   every supporting message has role `user` or `assistant`. The same quoted
   sentence is `false` at the base commit; the projection neither creates the
   path nor widens it. The person is the trust root, and someone who repeats
   external text has chosen to say it — a different act from a tool depositing
   it in the transcript. *Cost of overruling,* measured against the real gate:
   `src/core/dream/validate.js:191-216` requires `derived_from_untrusted` to be
   exactly `false` for **every** Tier-3 write, and Tier 3 is identity and
   skills. Tainting user messages from the first tool record onward would mean
   that in any session with an early tool call — which is nearly every agentic
   session — **nothing the person says in it could ever reach identity or
   skills again**, effectively ending Tier-3 learning from user statements. The
   intermediate position, tainting user text only when it demonstrably quotes
   prior tool output, needs a similarity test over message bodies that this
   package has no mechanism for and that the owner's scope record does not ask
   for. Nothing here records an owner decision.
4. **Should an unrecognised Codex `payload.type` taint the rest of the
   session?** Row A5c says yes; row A5c-why explains why the Claude
   top-level `type` is treated the other way. *Recommendation:* yes, taint.
   A Codex `payload.type` is where Codex signals tool output, the decided list
   is small, and `docs/runbooks/codex-pin-bump.md` already exists to refresh it.
   *The cost, stated:* when Codex ships a new item type, every session
   containing it taints every later assistant message until the list is updated,
   which bars that text from Tier 3. **No counter or diagnostic tells a
   maintainer this is happening, and this package adds none** — the owner's
   scope record excludes new reporting infrastructure, and a per-run
   unclassified-record count is routed to `WP-dream-report-run-skips` as a
   candidate rather than built here. So the failure mode is a quiet reduction in
   Tier-3 assistant learning on Codex, visible only by reading scratch extracts.
   *Cost of overruling:* accepting unrecognised `payload.type` values as
   positive declines removes that cliff and reopens exactly the hole round 2
   measured — a renamed tool-output type would pass silently and leave the
   following assistant conclusion `false`. Note that the cliff is **narrower
   than round 2 left it**: row A5c scopes the requirement to `response_item`
   records only, so a `session_meta` header — which carries no `payload.type`
   at all in the shipped fixture — no longer taints. Nothing here records an
   owner decision.
5. **Is the bounded tool-result scan of row A5d bounded in the right place?**
   It inspects `message.content` at depth one of every parseable Claude record,
   including declined envelopes, and nothing deeper. *Recommendation:* yes.
   All four shapes the review executed put the block exactly there, a recursive
   walk of attacker-controlled JSON is a new surface this package does not want,
   and the residual — a `tool_result` nested somewhere else entirely — is named
   in the row. **The Codex side gets no scan at all**, because Codex signals
   tool output by `payload.type` on a top-level `response_item` rather than by a
   block, so row A5c already covers it and covers it more strongly. *Cost of
   overruling:* a recursive scan closes the residual at the price of an
   unbounded traversal on every record, and a Codex envelope scan would need
   `event_msg`'s internal shape, which this package did not inspect and will not
   guess at — it is routed to `docs/runbooks/codex-pin-bump.md` instead.
   Nothing here records an owner decision.
6. **Should an unrecognised CONTENT-BLOCK type taint?** Row A5c-blocks says yes,
   for both harnesses, against a decided list of five Claude types (`text`,
   `tool_result`, `tool_use`, `thinking`, `image`) and three Codex ones
   (`input_text`, `output_text`, `input_image`). *Recommendation:* yes. This is
   the same trade as owner item 4 at the level where it pays most: the block
   `type` is exactly where Claude signals tool output, so a renamed or
   case-shifted tool result is the realistic failure, and the round-4 model run
   confirmed a presence-and-shape check alone lets `"TOOL_RESULT"` and
   `"web_search_tool_result"` through with the conclusion marked `false`. *The
   cost, stated:* Anthropic adds block types — `thinking` itself is a recent
   one — and the first new benign type, `redacted_thinking` being the obvious
   candidate, will taint every session containing it until the list is updated.
   Local evidence bounds but does not remove the risk: across 16,218 sampled
   records only those five Claude types occurred. **There is no diagnostic, and
   none is added**, for the reasons in owner item 4. *Cost of overruling:*
   dropping to presence-and-shape keeps benign new block types quiet and
   reopens ADV-1 and ADV-2. Nothing here records an owner decision.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(transcripts): project each transcript to its primary dialogue (WP-dream-primary-dialogue-projection)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
