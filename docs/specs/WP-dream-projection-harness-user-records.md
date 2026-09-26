---
id: WP-dream-projection-harness-user-records
title: Decline Claude user records the harness wrote, and halt the dream when no request survives
status: Draft
model: opus
size: M
depends_on: [WP-dream-primary-dialogue-projection]
adrs: [ADR-0004, ADR-0023, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-projection-harness-user-records: Decline Claude user records the harness wrote, and halt the dream when no request survives

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **Package note.** A FIX against the Done contract of
> `WP-dream-primary-dialogue-projection` (PR #266, merge `b46a3843`), filed
> under the owner's ruling of 2026-09-26
> (`docs/specs/logbook/2026-09-26-owner-rulings-cas-window-and-filter.md`,
> item 2). The design round, its pinned stop criterion and every measurement
> this spec cites are in
> `docs/specs/logbook/2026-09-26-projection-harness-user-records-design-review.md`
> (**the round record**). Written against `main` at `8117e221`. **Three owner
> items gate DISPATCH, not `Ready`** (see the section of that name).
>
> **Size M** (re-derived in revision 1). Two product changes: one predicate at
> one site in the projection (Table H), and a guard in the collector and the
> dream command that stops the run when no Claude session with a reply keeps a
> request (Table G) — the design gate's round-1 finding that a harness field
> change would otherwise erase every Claude request silently. Everything else
> is mechanical and specified literally: a one-key fixture sweep checked
> byte-for-byte, a verbatim erratum, tests under five tags and seven RED proofs whose
> shapes were run on a simulated tree.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process or
outlives its call, and this package adds no process at all. The nightly
**dream** reads recent session **transcripts**, writes a bounded extract of
each into a private scratch directory, and asks one consolidation pass (the
dream skill) to update a private copy of the user's **vault**; code then
validates and promotes what it wrote. Since `WP-dream-primary-dialogue-projection`
the extract holds only **primary dialogue**, produced by a pure function,
`createPrimaryProjection` in `src/core/transcripts/primary-dialogue.js`,
which sees every record of the transcript in order and emits messages
`{role, text, ts, derived_from_untrusted}`.

**The Done contract this package makes true.** The projection spec says, at
`docs/specs/done/WP-dream-primary-dialogue-projection.md:146-150`: *"genuine
user requests and corrections, plus the concluding assistant reply of each
exchange. Tool calls, tool results, reasoning text and intermediate progress
replies are not primary dialogue. Harness-authored and developer-authored
instructions are not dialogue."* Its row **A2** (`:458`) accepts a Claude
record as a user message when its top-level `type` is exactly `"user"`, it has
no `isMeta: true` and no `isSidechain: true`, and its `message.role` is
exactly `"user"`; it then takes a string `message.content` whole, or joins the
`text` blocks of an array content with `"\n\n"`, dropping an empty join. Row
A2's assistant half accepts an assistant record only when its own
`message.stop_reason` is exactly `"end_turn"` — that per-record test is what
"the concluding reply of each exchange" (row A1, `:457`) means in code.

**The gap.** Claude Code writes several kinds of `user` record that no person
typed and that carry neither flag: a subagent's or background task's
completion report (`<task-notification>…`), a slash command's echo and its
local output (`<command-name>…`, `<local-command-stdout>…`), a `!` shell
command's input and output (`<bash-input>…`, `<bash-stdout>…`), the summary
written after a compaction, and the interruption marker. Row A2 accepts all of
them as the person's words, with `derived_from_untrusted: false`. On the
owner's whole local corpus (334 files, Claude Code 2.1.232–2.1.283; the round
record §2.3) that is 1,103 task notifications (4,682,631 characters), 134
command echoes, 8 shell-mode records and 9 compaction or interruption records,
beside 705 prompts (240,048 characters). The filter's offline evaluation
measured the same gap as 16.4 % of a night's projected text
(`docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`,
"What the low-value volume is made of").

**What this package does — one predicate, and one guard.** Every Claude
`user` record also carries two top-level fields the harness writes about where
the record came from: `promptSource` (a string) and `origin` (an object with a
`kind`). Row A2's user half gains one more acceptance condition, decided in
**Table H**: the record is dialogue only when those fields name a person's
prompt or a `claude -p` prompt. Everything else is declined at row A5e step 4,
the decline adds no taint of its own, and the rule never lists what it
declines. Because that rule depends on fields the harness may change,
**Table G** adds a guard in the collector and the dream command (see "The
residual of a structural rule").

**Why a source field is not the heuristic the Done spec ruled out.** That
spec ruled, for routine prompts (`:563-567`): *"Do not add a heuristic (a
project-directory name, a prompt prefix) to invent one … a wrong heuristic
would be worse than the known limitation."* A project directory and a prompt
prefix are **inferences** from data that is not about authorship — where a
session ran, and the first words of the text itself. `promptSource` and
`origin` are the harness's own **declaration** of a record's source, on the
record's top level. Table H compares them for exact equality against a
closed, code-owned accept-set, which is the same kind of rule row A2 already
applies to `type`, `isMeta`, `isSidechain`, `message.role` and `stop_reason`,
and that row A3 applies to Codex `content_item_kinds` and row A4 to
`thread_source`. The predicate never reads `message.content`: it runs before
`acceptClaude` reads the content (steps 2–3 of row A5e still validate and
scan the record's blocks, as for every record), so the module's statement *"no heuristic over message
CONTENT — every decision below reads structure only"*
(`primary-dialogue.js:10-11`) stays literally true. The Done spec's premise for
its ruling — *"There is therefore no field in the Claude transcript schema by
which this projection can tell a `claude -p` routine prompt from a human
one"* (`:562-563`) — was measured by comparing field **names**; the
`promptSource` **value** does separate them (`"sdk"` against `"typed"`,
`"queued"`, `"suggestion_accepted"`). Erratum 8 records that; this package
reads the value only to accept both.

**The residual of a structural rule.** The two fields are undocumented
harness internals, and Wienerdog does not pin Claude Code
(`src/core/supported-claude.js` is an advisory record, not a gate). A record
whose fields are absent or carry a value not in Table H **fails closed**: it
is declined. Measured on the whole corpus, every record row A2 accepts today
that lacks `promptSource` is one of the harness's own kinds — command echoes,
`!`-command records, compaction summaries, interruption markers — so no prompt
a person typed is lost; the three records the orchestrator's five-day sample
called "human by prefix, no marker" are two compaction summaries and one
interruption marker (round record §2.2). What a person did originate and is
lost: the echoes of the 84 slash commands they invoked (none carries
arguments, so what is lost is the command's name, §2.5) and 4 `!`-command
inputs — commands the person gave the harness, which Table H does not treat as
dialogue. The price paid later is a cliff: a Claude Code release that renames
or drops either field declines every Claude user record until Table H is
updated. **That state is not silent: Table G's guard counts, per run, the
Claude sessions that gave the dream a reply but no request, prints the count,
and — when that is every Claude session with a reply — stops the run before
the model runs, so nothing is marked as dreamed over and the scheduler's
failure alert reaches the next session's digest banner.** On the whole corpus
that state occurs in 0 of 321 Claude files with a reply today, and in 321 of
321 when every user record is declined (round record §2.7); the halt is owner
item 2.

**The concluding reply of each exchange does not move.** Row A2's assistant
test reads only the assistant record and the taint state
(`primary-dialogue.js:194-200`, `:305`); it never looks at a preceding user
record. Declining a user record at step 4 therefore changes no assistant
message, no `ts` and no flag. The exact consequence: the projected `messages`
array equals the array the Done rule produces **with the declined user
messages removed and nothing else changed**, so where a declined record sat
between two accepted replies, those two replies become adjacent. The interim
replies a notification used to precede — 34 of them, 8,947 characters, in the
evaluation's sample — all stay. The evaluation measured both positional rules
for them as unsafe, and this package takes no positional rule (Out of scope).
Measured on the corpus: the assistant sequence before and after, 1,983
messages, has the same SHA-256 over every text and flag (round record §2.6).

**Provenance.** A task notification carries a subagent's result, which may
restate external content. Today it enters the extract as a user message,
`false` by role (row A5(a), `:461`). After this package it does not enter the
extract at all, so this package **removes** a path by which subagent output
reached the dream flagged `false`. **Declining is taint-neutral, and that is a
statement about the decline only:** row A5e runs steps 2 and 3 on every parsed
record before step 4 (`primary-dialogue.js:264-294`) — step 2 validates the
record's content blocks and step 3 sets the taint state on any `tool_result`
block — so a declined record that carries a `tool_result` block **still
taints**, exactly as today, and the decline neither adds taint nor removes
what steps 2–3 set (the round-1 gate probed exactly this, and AC3 now pins
it). Only the Table H predicate is content-free; the record's blocks are still
read by steps 2–3. Whether a notification should itself set the taint state is a separate
provenance question this package does not change — owner item 3, whose
measured basis is that 1,103 of 1,103 notifications on the corpus arrived with
the state already set.

## Current state

Every citation below was re-derived at `main` = `8117e221`, and each range
was checked at both ends (the round record §3).

- `src/core/transcripts/primary-dialogue.js:179-202` is `acceptClaude`, the
  closure that implements rows A2 and A4 for one parsed Claude record; its
  JSDoc is `:177-178` (*"Rows A2 and A4 — what a parsed Claude record
  supplies, if anything."*). The user half is `:183-193`: `:184` declines
  `isMeta === true`, `:185` declines `message.role !== 'user'`, `:186` reads
  `message.content`, `:187` returns a string content whole, `:191-192` joins
  array `text` blocks and drops an empty join. `:180` has already declined
  `isSidechain === true` for every record type. **This package's one site is
  between `:185` and `:186`.**
- `:243-307` is `record(obj)`, row A5e's procedure: step 2 (`:264-283`)
  guarantees that a `user` record reaching `acceptClaude` is a plain object
  with a plain-object `message` whose `content` is a string or an array of
  decided blocks; step 3 (`:285-294`) sets the taint state on a `tool_result`
  block; step 4/5 (`:296-306`) calls `acceptClaude` and emits a user message
  with `derived_from_untrusted: false` (`:305`).
- The module header `:3-11` already states the contract this package makes
  true, and **needs no edit**.
- The raw parser `src/core/transcripts/claude.js` is **not** a deliverable:
  the projection is its observer (`:141`), and the default parse must stay
  byte-identical (the Done spec's AC5).
- Tests: `tests/unit/primary-dialogue.test.js` (tests tagged `[WE]`, `[AC1]`–
  `[AC4a]`; a loop runs the invariant tests over every committed `.jsonl` under
  `tests/fixtures/primary-dialogue/`, so a new fixture there is covered by them
  automatically). RED declarations for the module:
  `tests/red-proofs/primary-dialogue.proofs.json` (ten proofs, `criterion`
  strings like `"AC1"`, `testNamePattern` like `"\\[AC1\\]"`).
- **No committed fixture carries `promptSource`.** Run on a simulated tree with
  Table H in place and no fixture change, **41 existing tests redden**: 39 in
  `tests/unit/primary-dialogue.test.js` and 2 in `tests/unit/dream-collect.test.js`
  (`newest complete extract wins; …` at `:283`, which uses the helper
  `writeClaude` at `:37-56`, and `sink-probe: transcripts — …` at `:957`, whose
  record is built at `:965-971`). With a rule that declines **every** Claude
  user record, exactly the same 41 redden and nothing else in `npm test` does —
  so these are the whole set of tests that depend on Claude user acceptance
  (round record §4). The other Claude `user` records in the suite
  (`tests/fixtures/dream/transcripts/*.jsonl`, other inline records in
  `dream-collect.test.js`, `dream-pipeline.test.js`, the integration tests) are
  asserted on by nothing that this rule changes, and are left as they are.
- **The real-brain scenario fixtures** `tests/scenarios/fixtures/claude-day1.jsonl`,
  `claude-day2.jsonl`, `claude-day3-injection.jsonl` and
  `tests/scenarios/negative/fixtures/hostile-day1.jsonl` are not run by
  `npm test` (their harness spends model quota and runs by hand,
  `tests/scenarios/README.md`), but their premise is the person's recurring
  statement in role `user`. Without the sweep they would project no user text.
- `skills/wienerdog-dream/SKILL.md:53` (*"the person's requests and
  corrections"*) stays true and is **not** edited — an edit would change the
  dream job's `promptHash`.
- **The collector and the dream command (Table G's sites).**
  `src/core/dream/scratch.js:77-264` is `collectExtracts`; its JSDoc `@returns`
  is `:65-75`; each admitted session is written and pushed at `:227-243`, and
  the result object is returned at `:246-263`. `src/cli/dream.js:744-746` calls
  it; step 6 (`:867-876`) throws when nothing was admitted, step 7
  (`:878-890`) returns when nothing is new, and step 8 (from `:892`) is the
  dry-run plan. A `WienerdogError` thrown before the model runs leaves every
  session unmarked (sessions are marked processed only after a successful
  consolidation), and the `finally` at `:1374-1383` still cleans the scratch
  directory and releases the lock. On a scheduled run a thrown dream is a
  failed job, which the scheduler records in `alerts.jsonl` for the digest
  banner — the path step 6's own throw already takes
  (`docs/specs/done/WP-dream-report-run-skips.md`, Table A, the coverage row's
  case (b)).
- **Four existing pipeline tests reach Table G.** With the guard in place and
  no fixture change, `[PDC-AC4]`, `[PDC-AC4a]`, `[PDC-AC4b]` and `[PDC-AC4c]`
  in `tests/unit/dream-pipeline.test.js` halt, because their helper
  `plantInvokingTranscript` (`:2801-2818`) plants a Claude session whose user
  records (`:2807`, `:2809`, `:2813`) carry no `promptSource` and whose reply is
  `end_turn`. Sweep S4 repairs them; nothing else in `npm test` depends on the
  guard (round record §4.3).
- The Done spec's errata block runs `:14-102` and ends before the comment
  `<!-- errata above; the spec as it shipped follows -->` at `:104`; its
  in-place corrections carry `(**corrected post-merge, see Erratum N**)`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/primary-dialogue.js | the Table H test between `:185` and `:186`, as a code-owned predicate with its accept-set; the `acceptClaude` JSDoc `:177-178` replaced per Exact contracts; nothing else |
| modify | tests/unit/primary-dialogue.test.js | new tests tagged `[HUR-AC1]`, `[HUR-AC2]`, `[HUR-AC3]`; sweep S2 on the four inline Claude `user` records; no other existing line changes |
| create | tests/fixtures/primary-dialogue/claude-harness-user-records.jsonl | the `[HUR-AC3]` fixture (Acceptance criteria) |
| modify | tests/fixtures/primary-dialogue/claude-acceptance.jsonl | sweep S1 only |
| modify | tests/fixtures/primary-dialogue/claude-demo.jsonl | sweep S1 only |
| modify | tests/fixtures/primary-dialogue/claude-oversized-line.jsonl | sweep S1 only |
| modify | tests/fixtures/primary-dialogue/claude-taint-persists.jsonl | sweep S1 only |
| modify | tests/fixtures/primary-dialogue/claude-user-quotes-tool.jsonl | sweep S1 only |
| modify | tests/fixtures/primary-dialogue/taint-cases.json | sweep S1 in its escaped form only |
| modify | tests/unit/dream-collect.test.js | sweep S3; a new test tagged `[HUR-AC8]`; no other existing line changes |
| modify | tests/unit/dream-pipeline.test.js | sweep S4; new tests tagged `[HUR-AC9]`; no other existing line changes |
| modify | src/core/dream/scratch.js | Table G rows G1–G2: two integers counted over the sessions written and returned by `collectExtracts`, and its JSDoc `@returns` (`:65-75`) naming them; nothing else |
| modify | src/cli/dream.js | Table G rows G3–G5: the console line and the halt, as step 7b between step 7 and step 8; nothing else |
| modify | tests/scenarios/fixtures/claude-day1.jsonl | sweep S1 only |
| modify | tests/scenarios/fixtures/claude-day2.jsonl | sweep S1 only |
| modify | tests/scenarios/fixtures/claude-day3-injection.jsonl | sweep S1 only |
| modify | tests/scenarios/negative/fixtures/hostile-day1.jsonl | sweep S1 only |
| create | tests/red-proofs/projection-harness-user-records.proofs.json | ADR-0042 declarations P1–P4 and P7, `suite` `tests/unit/primary-dialogue.test.js` |
| create | tests/red-proofs/projection-harness-user-records-collect.proofs.json | P5, `suite` `tests/unit/dream-collect.test.js` |
| create | tests/red-proofs/projection-harness-user-records-guard.proofs.json | P6, `suite` `tests/unit/dream-pipeline.test.js` |
| modify | docs/specs/done/WP-dream-primary-dialogue-projection.md | Errata 7–9: E0–E5, verbatim from Exact contracts; no other byte changes |

Nothing else — in particular not `src/core/transcripts/claude.js`,
`src/core/transcripts/index.js`, `src/core/dream/promote.js` (the dream
report), `src/core/dream/warnings.js`, `src/core/dream/ledger.js`,
`skills/wienerdog-dream/SKILL.md`, `docs/GLOSSARY.md`, any file under
`tests/fixtures/transcripts/` or `tests/golden/`, and not
`tests/red-proofs/primary-dialogue.proofs.json`.

### Exact contracts

**The predicate.** Its name and shape are the implementer's. Its behaviour:

- It is evaluated inside `acceptClaude`, on a record whose `type` is `"user"`,
  **after** the `isMeta` and `message.role` declines (`:184-185`) and
  **before** `message.content` is read (`:186`), so one site covers both user
  returns (`:187` and `:192`) and the rule is visibly content-free.
- It reads exactly two properties of the record, `obj.promptSource` and
  `obj.origin`, and nothing else — not `message`, not `origin.kind`, no text.
- It returns "accept" exactly in the states of Table H rows H1 and H2 and
  "decline" otherwise. A decline makes `acceptClaude` return `null`, which is
  row A5e step 4: no message, and no taint **added** by the decline. Steps 2
  and 3 have already run on the record and are not moved or skipped: any taint
  they set stays (AC3).
- It never throws and never coerces: string equality with `===` against a
  code-owned constant. **Trap:** do not look a value up in a plain object
  (`ACCEPT[obj.promptSource]`, `obj.promptSource in ACCEPT`) — `"constructor"`
  and `"toString"` are then found on the prototype. Use a `Set` or explicit
  comparisons.
- "No `origin` key" is tested as `obj.origin === undefined`. JSON cannot
  encode `undefined`, so on a record `JSON.parse` produced this is exactly the
  absence of the key; `origin: null` is present and is not H2.

Its JSDoc (or the constant's) states, in any words: that it is Table H of this
work package; that it reads two top-level harness fields and never message
content; that the accept-set was measured on Claude Code 2.1.232–2.1.283; and
that a harness change to either field declines every Claude user record until
the set is updated (owner item 2). It contains the literal `Table H` and the
literal `2.1.232`.

**The `acceptClaude` JSDoc** — `primary-dialogue.js:177-178` becomes, verbatim:

```text
  /** Rows A2 and A4, with row A2's user half narrowed by Table H of
   *  WP-dream-projection-harness-user-records — what a parsed Claude record
   *  supplies, if anything.
   *  @param {Object} obj @returns {{role:'user'|'assistant', text:string, ts:string|null}|null} */
```

**The fixture sweeps.** Each adds one key and changes nothing else; each
swept file is checked byte-for-byte against its `origin/main` version with the
sweep applied (Verification steps).

- **S1** (JSON Lines): every line that begins `{"type":"user",` begins
  `{"type":"user","promptSource":"typed",` instead. In `taint-cases.json`,
  where the records are JSON strings, every occurrence of
  `{\"type\":\"user\",` becomes `{\"type\":\"user\",\"promptSource\":\"typed\",`.
  Every Claude `user` record in those files is swept — including the ones a
  test expects declined for another reason (`isMeta`, `isSidechain`, a
  malformed shape) and the `tool_result`-only ones — so every existing decline
  is still caused by its own rule and not by Table H.
- **S2** (`tests/unit/primary-dialogue.test.js`): each of the four inline
  records written as `JSON.stringify({ type: 'user', timestamp: …` becomes
  `JSON.stringify({ type: 'user', promptSource: 'typed', timestamp: …`.
- **S3** (`tests/unit/dream-collect.test.js`): the record object in
  `writeClaude` (`:44-50`) and the sink-probe record (`:965-971`) each gain the
  line `promptSource: 'typed',` directly after `type: 'user',`, at that
  object's indentation.
- **S4** (`tests/unit/dream-pipeline.test.js`): each of the three records in
  `plantInvokingTranscript` written as `rec({ type: 'user', message: …` becomes
  `rec({ type: 'user', promptSource: 'typed', message: …`.

**Table G's texts — copy verbatim** (`N` and `M` are the two integers of rows
G1–G2, interpolated as decimal numbers):

```text
wienerdog: dream — N of M Claude session(s) with a reply gave this run none of the person's own messages.
```

```text
dream: stopped before consolidating — none of the M Claude session(s) with a reply gave this run any of the person's own messages, most likely because Claude Code changed how it labels them. Nothing was marked as dreamed over; update Wienerdog, then run the dream again.
```

A dry run prints the second text prefixed with `wienerdog: dream plan (dry-run) —`
and one space, and returns, exactly as step 6 does for its own message.

**Errata 7–9 to `docs/specs/done/WP-dream-primary-dialogue-projection.md` —
copy verbatim.** `<DATE>` is the `YYYY-MM-DD` date of the implementation commit
that adds them. E0 **continues the existing errata blockquote**: directly after
its last line, `> the more complete reference.` (`:102`), insert one line that
is exactly `>` and then E0's lines, so the blank line `:103` and the comment
`<!-- errata above; the spec as it shipped follows -->` (`:104`) follow it
unchanged (a blank line between two blockquotes fails markdownlint MD028).
E1–E5 are appended in place, each directly after the anchor text named, which
occurs exactly once in that file.

E0:

```text
> **Errata, <DATE> — filed by `WP-dream-projection-harness-user-records`,
> whose Table H is canonical for everything these three restate.** Numbered on
> from the six above.
>
> **Erratum 7 — "Harness-authored and developer-authored instructions are not
> dialogue" was not true of Claude `user` records the harness writes.** *What
> was wrong:* row A2 accepted every `user` record with no `isMeta` or
> `isSidechain` flag and `message.role` `"user"`, so a subagent's
> `<task-notification>` report, a slash-command echo, a `!` command's input and
> output, a compaction summary and an interruption marker all reached the dream
> as the person's words, flagged `false`. *What is true from <DATE>:* row A2's
> user half also requires the record's own `promptSource` and `origin` fields
> to be in Table H's accept-set; any other `user` record is declined at row
> A5e step 4. The decline adds no taint of its own, and steps 2 and 3 still run
> on the declined record exactly as before, so a `tool_result` block inside it
> still taints. That also removes a path by which a subagent's result reached
> the dream flagged `false`. *Found:* the filter's offline evaluation,
> `docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`.
> **Class: a contract sentence the shipped rule did not implement.**
>
> **Erratum 8 — "no field … can tell a `claude -p` routine prompt from a human
> one" was measured on field NAMES.** *What was wrong:* the routine-prompt
> Implementation note and row A5b compared top-level field sets, which are
> identical. *What is true:* the VALUE of `promptSource` differs — `"sdk"` on
> a `claude -p` prompt, `"typed"`, `"queued"` or `"suggestion_accepted"` on a
> person's — on Claude Code 2.1.232–2.1.283 in the local corpus. Table H reads
> it only to accept both, so row A5b's claim stands: `false` does not mean a
> human wrote the words. **Class: a measurement that answered a narrower
> question than the sentence built on it.**
>
> **Erratum 9 — the literal worked example's `user` records carry no
> `promptSource`.** As printed, its first and third records are declined from
> <DATE>, and the projection returns only its assistant message. The fixture
> `tests/fixtures/primary-dialogue/claude-demo.jsonl` carries
> `"promptSource":"typed"` on both, and with it the three documented values are
> unchanged. The third record's shape — a `tool_result` block and the person's
> `text` block in one record — occurs in 0 of 11,884 array-valued `user`
> records in the local corpus. **Class: an example whose records predate the
> field that now decides them.**
```

E1 — after the anchor `Harness-authored and developer-authored instructions are not dialogue.` (`:150`), insert, with one leading space:

```text
(**For Claude `user` records, true from <DATE> — see Erratum 7.**)
```

E2 — in row A2 (`:458`), after the anchor `in source order, as one user message.`, insert, with one leading space:

```text
**The record must also be in the accept-set of Table H in `WP-dream-projection-harness-user-records`; any other `user` record is declined at row A5e step 4, and the decline adds no taint beyond what steps 2 and 3 already set (corrected <DATE>, see Erratum 7).**
```

E3 — in row A5b (`:462`), after the anchor `is indistinguishable from a person's (see Implementation notes).`, insert, with one leading space:

```text
(**By field set; the `promptSource` value distinguishes them — corrected <DATE>, see Erratum 8.**)
```

E4 — in the routine-prompt Implementation note, after the anchor `routine prompt from a human one.**` (`:563`), insert, with one leading space:

```text
(**By field NAMES only — corrected <DATE>, see Erratum 8.**)
```

E5 — after the anchor `` Source file `/samples/claude-demo.jsonl`, four records: `` (`:343`), insert, with one leading space:

```text
(**As printed, its two `user` records are declined from <DATE> — see Erratum 9.**)
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 trigger fires on four of seven: **(iii)** structured input
acceptance changes — row A2's user half narrows; **(iv)** a failure behaviour
is introduced — Table G's halt; **(vi)** a downstream consumer inherits it —
`WP-dream-primary-dialogue-collection` feeds this projection's output to the
dream; **(vii)** the same contracts appear on mirrored surfaces (listed
below). Two canonical tables: **Table H** (which records are dialogue) and
**Table G** (the guard).

### Contract table(s)

#### Table H — which Claude `user` records are dialogue (canonical)

Applies to a Claude record that row A2's existing user-half gates already
accept — top-level `type` exactly `"user"`, no `isMeta: true`, no
`isSidechain: true`, `message.role` exactly `"user"`. **The predicate** reads
no content; the record's content blocks are still validated and scanned by
row A5e steps 2–3, which run on every parsed record before this table is
consulted. It enumerates what is **accepted**; there is no list of what is
declined, because a forbidden list over the harness's own grammar cannot be
closed.

| Row | The record's own top-level fields | Outcome |
|-----|-----------------------------------|---------|
| H1 | `promptSource` is exactly `"typed"`, `"queued"` or `"suggestion_accepted"` (`origin` is not read) | **ACCEPT** — the person's prompt: typed, queued while a turn ran, or a harness suggestion the person accepted. Row A2's content rule then applies unchanged |
| H2 | `promptSource` is exactly `"sdk"` **and** the record has no `origin` key | **ACCEPT** — a `claude -p` prompt: a routine's, a judge's, any headless call's (owner item 1). Row A2's content rule then applies unchanged |
| H3 | every other state | **DECLINE** at row A5e step 4: no message, and **no taint added by the decline** — any taint steps 2–3 set on this record (a `tool_result` block in it, an unclassifiable block) stays set |

The Codex half (rows A3/A4) and the Claude assistant half of row A2 are
unchanged.

**Evidence, not contract** (the round record §2.3; the whole local corpus,
334 files, Claude Code 2.1.232–2.1.283, counts of records row A2 accepts
today). It decides nothing; Table H does.

| State | Records | Class by leading text (a measurement label only) |
|---|---:|---|
| `typed` / `queued` / `suggestion_accepted`, `origin.kind: "human"` | 411 / 8 / 29 | the person's prompts → H1 |
| `sdk`, no `origin` | 257 | `claude -p` prompts → H2 |
| `system`, `origin.kind: "task-notification"` | 1,002 | task notifications → H3 |
| `sdk`, `origin.kind: "task-notification"` | 101 | task notifications in headless sessions → H3; the reason H2 requires no `origin` |
| no `promptSource`, no `origin` | 132 + 8 + 9 | command echoes, `!`-command records, compaction summaries and interruption markers → H3 |
| no `promptSource`, `origin.kind: "human"` | 2 | slash-command echoes with no arguments → H3; the reason H1 reads `promptSource`, not `origin.kind` |

#### Table G — the guard against losing every request (canonical)

The collector and the dream command. Harness scope: **Claude sessions only**
(the Codex projection is outside this package; Out of scope says why a Codex
count would fire today).

| Row | Fact | Rule |
|-----|------|------|
| G1 | `claudeWithReplies` | the number of **Claude** sessions this run **wrote to scratch** whose written extract holds at least one message with `role` `"assistant"`. Counted in `collectExtracts` at the point the session is written; sessions deferred, oversized, read-deferred or quarantined are not counted. Returned as an integer field of the result |
| G2 | `claudeRepliesWithoutRequests` | of the sessions G1 counts, the number whose written extract holds **no** message with `role` `"user"`. Returned as an integer field of the result |
| G3 | The console line | when G2 ≥ 1, `src/cli/dream.js` prints the first text of Exact contracts' "Table G's texts" with `N` = G2 and `M` = G1, on a real run and on a dry run alike, as step 7b — after step 7 (so at least one session was admitted) and before step 8 |
| G4 | The halt | when G2 ≥ 1 **and** G2 = G1, step 7b then throws a `WienerdogError` whose message is the second text with `M` = G1 — before the model runs, so no session is marked as dreamed over, and after step 5b, so this run's quarantines and size memos are still recorded. A dry run prints that message with the dry-run prefix and returns instead of throwing |
| G5 | What neither text carries | integers only: no path, no session id, no basename, no transcript text |
| G6 | What the guard does not do | it does not set a file aside, quarantine it, or write a ledger record; a partial state (G2 < G1) prints G3's line and the run continues. Owner item 2 |

The trigger is measured, not assumed (round record §2.7): on the whole local
corpus, 0 of 321 Claude files with a reply fall in G2 under Table H; with
every user record declined — what a renamed field would do — 321 of 321 do.

### Mirrored Surface Checklist

Tables H and G are canonical. Every surface below restates part of one of
them; a review finding updates the table and every mirror in the same commit
(update-all-mirrors), and a newly found mirror is added here on the spot
(register-new-mirrors):

- [ ] **Deliverables-table cells** — the `primary-dialogue.js` cell (the site
      and "nothing else"); the fixture cells (sweeps S1–S4 exist because every
      Claude user fixture a test depends on must now be in H1 to stay
      accepted, and a session whose only request is declined now halts the
      run under G4); the `scratch.js` cell (G1–G2); the `dream.js` cell
      (G3–G5); the three RED declaration cells (P1–P7).
- [ ] **Exact contracts** — the predicate's behaviour bullets (H1/H2/H3, the
      two fields, the `origin === undefined` reading, the no-added-taint
      clause); the `acceptClaude` JSDoc; Table G's two texts; E0's Erratum 7
      and E2 (they defer to Table H by name, restate none of its values, and
      state the decline's taint rule); E0's Erratum 8 (restates the H1/H2
      values as a measurement).
- [ ] **Acceptance criteria** — AC1 asserts H1 and H2; AC2 asserts H3 and the
      content-independence; AC3 asserts H3's taint rule both ways and the
      unchanged assistant sequence; AC4 asserts that the sweeps are the only
      change to pre-existing tests; AC8 asserts G1–G2; AC9 asserts G3–G5.
- [ ] **Verification commands** — the predicate grep (`Table H`, `2.1.232`),
      the sweep-equality loop, the test-file removed-lines check (S2 and S4),
      the erratum marker counts, and the local re-measurement (its accept-set
      filter lists H1 and H2's states; its exit status is G2's state over the
      local corpus).
- [ ] **Current-state description** — the site `:185`/`:186`; the collector
      and dream-command sites; the 41 dependent tests and the four pipeline
      tests; the scenario fixtures' premise.
- [ ] **Operative prose** — Context's "What this package does", "Why a
      source field is not the heuristic", "The residual", "The concluding
      reply" and "Provenance" paragraphs; the Evidence table; the Table G
      measurement sentence; owner items 1–3; the Security checklist.
- [ ] **Outside this spec, edited by it:** the Done spec's row A2 (via E2) and
      its `:150` sentence (via E1). **Outside, deliberately not edited:**
      `primary-dialogue.js:3-11` (already states the contract);
      `skills/wienerdog-dream/SKILL.md:53` (stays true; an edit changes the
      dream job's `promptHash`); the ADR-0020 amendment's "harness-authored
      instructions are not in it" (`docs/adr/0020-skill-revision-lifecycle.md:404-407`,
      stays true).

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, no build step** (CLAUDE.md).
- **The fixture sweep is the reason most of the diff exists, and it must not
  hide a regression.** It adds one key per record and nothing else, and AC4
  checks that byte-for-byte. Do not adjust any expected value in an existing
  test to make it pass: if an existing test still reddens after the sweep, the
  predicate is wrong, and that is a finding to report, not to fix in the test.
  The design round ran exactly these sweeps on a simulated tree: with Table H
  alone `npm test` went from 41 failures to 0, and with Table G added from 4
  (the pipeline tests Current state names) to 0, with no expectation changed.
  Every RED lane whose suite this package edits stayed `PROVEN` — the ten
  `pdp-*` proofs and those of `WP-dream-primary-dialogue-collection`,
  `WP-dream-collect-parse-throw-quarantine`, `WP-dream-digest-omits-own-job-alerts`,
  `WP-dream-git-env-pinning`, `WP-dream-lock-stale-owner-loud`,
  `WP-show-slot-own-value-kind` and `WP-ep2-prune-once-per-run-test` — and
  every one of the repository's `find` strings still occurred exactly as often
  as declared (round record §4.3).
- **Why every swept record gets `"typed"`, including ones that are declined
  anyway.** Without the key, an `isMeta: true` fixture would be declined by
  Table H before `:184` could decline it, and the existing test for `isMeta`
  would pass for the wrong reason. The sweep keeps each existing decline's
  cause.
- **The `[HUR-AC3]` fixture** has to show both directions of the taint rule:
  a declined record **before** any tool output, followed by an accepted
  assistant reply that must read `false` (the decline adds no taint), and a
  declined record that **itself carries a `tool_result` block**, followed by a
  reply that must read `true` (steps 2–3 still run on it). It uses the record
  shapes measured in the round record — a `"system"`/`task-notification`
  record, an `"sdk"`/`task-notification` record, and a record with neither
  field — with synthetic text only. No transcript content from any real
  machine goes into the repository.
- **Table G sits in the collector and the dream command, not in the
  projection**, because the harm is a property of a whole session (replies
  with no request), and the projection sees one record at a time. The counts
  read only the extract the collector already holds for each written session;
  no new field crosses `parsePrimaryWithOutcome`'s return shape.
- **Why the guard halts rather than only reporting, and why only on "every".**
  A session the dream consumes is marked as dreamed over and never read again,
  so a report alone would record the loss while making it permanent; stopping
  before the model runs leaves every session unmarked, and the next run after
  an update reads them in full. The halt fires only when **every** Claude
  session with a reply lost its request — the signature of a harness change —
  so one odd session (measured: none among 321) cannot block the dream; if
  one did, the next run with any ordinary Claude session clears it. Owner
  item 2 is the choice.
- **Why Claude only.** The same count over Codex would fire on the first run:
  240 of the owner's 408 local Codex rollouts, all written by Codex
  0.144.1–0.147.0, project to replies with no request today, because their
  user messages carry no `content_item_kinds` and row A3 declines them (round
  record §2.8). That is a separate, pre-existing Codex finding, routed rather
  than folded in here.
- **RED proofs (ADR-0042) — the register. `expectRed` sets and `find` strings
  are DERIVED:** most of the code they mutate does not exist yet. The seven
  shapes below were run on a simulated tree with a draft predicate, a draft
  guard and draft tests, and each came back `PROVEN` (round record §4.3). The implementer writes
  the real `find`/`replace` against the real code, measures each set with
  `npm run red-proofs -- --wp WP-dream-projection-harness-user-records`, and
  corrects the declaration.

  | Id | Criterion | Mutation | Must redden |
  |---|---|---|---|
  | P1 `hur-accept-set-disabled` | AC2 | the predicate accepts every record (Table H removed) | `[HUR-AC2]`, and `[HUR-AC3]` (its roles gain the declined records) |
  | P2 `hur-accept-set-emptied` | AC1 | the predicate declines every record (an exclusion widened to a deletion) | `[HUR-AC1]`, and `[HUR-AC3]` (its first user message goes) |
  | P3 `hur-sdk-origin-clause-dropped` | AC2 | H2 without its no-`origin` condition | `[HUR-AC2]` (the `"sdk"` + `origin` cases), `[HUR-AC3]` |
  | P4 `hur-declined-record-taints` | AC3 | a declined record sets the taint state | `[HUR-AC3]` flags only |
  | P7 `hur-declined-record-skips-step3-scan` | AC3 | step 3's `tool_result` scan (`primary-dialogue.js:292`) runs only for records Table H would accept | `[HUR-AC3]` flags only |
  | P5 `hur-guard-count-disabled` | AC8 | G2 is never incremented (`scratch.js`) | `[HUR-AC8]` |
  | P6 `hur-guard-halt-removed` | AC9 | G4's condition never holds (`dream.js`) | the `[HUR-AC9]` halt test only |

  P1–P4 and P7 live in `projection-harness-user-records.proofs.json` (suite
  `primary-dialogue.test.js`), P5 in `…-collect.proofs.json` (suite
  `dream-collect.test.js`), P6 in `…-guard.proofs.json` (suite
  `dream-pipeline.test.js`), each with `testNamePattern` `"\\[HUR-"`. P7's
  `find` is shipped code — the step-3 line at `:292`, which occurs once; the
  other six are DERIVED. P1 and P2 together are what separate an exclusion
  from a deletion; P4 and P7 are the two directions of the decline's taint
  rule.
  **A correction to a measured set may falsify prose**, so the sentences to
  re-read in the same pass are: this table, the three Deliverables proofs
  cells and AC5. Report any correction in the PR body; a prose change is routed back to
  the architect.
- **Do not touch** `tests/red-proofs/primary-dialogue.proofs.json`. None of
  its ten `find` strings is at this site (the nearest is `:191-192`), and the
  simulated run confirmed each still occurs exactly once. **Trap:** the runner
  requires exactly that, so no new line may repeat one of those strings
  verbatim, leading indentation included — for example
  `if (payload.role === 'user') {` at four spaces, or
  `.filter((block) => block.type === 'text' && typeof block.text === 'string')`
  at four spaces.
- **Out of reach, stated.** The projection streams one record at a time; it
  cannot know whether a file will ever carry `promptSource`, so a "legacy file"
  fallback (accept everything when no record carries the field) would need to
  buffer every user message to end of file. This package does not build it;
  Table G is the answer to a field change instead.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] Transcript records are untrusted input. The predicate reads two
      properties of a plain object that step 2 already validated, compares
      them with `===` against code-owned strings, never throws, never coerces,
      and never consults the prototype chain (the Exact-contracts trap).
- [ ] Provenance: declining a notification removes subagent output that
      previously reached the dream flagged `false`. The decline adds no taint
      and removes none: steps 2–3 still run on the declined record (Context,
      "Provenance"; AC3). Whether a notification should set the taint state by
      itself is owner item 3; this package does not change the rule.
- [ ] Table G's console line and halt message carry two integers and fixed
      text only (row G5): no path, session id or transcript text reaches the
      console, the alert or the digest banner.
- [ ] No untrusted value flows into a path or a shell command; no new write.

## Acceptance criteria

- [ ] **AC1 — the accept-set (Table H rows H1, H2).** A Claude `user` record
      with `promptSource` `"typed"`, `"queued"` or `"suggestion_accepted"`
      (each with and without `origin: {kind: "human"}`), and one with
      `promptSource` `"sdk"` and no `origin`, each supply their user message
      unchanged; an H1 record whose content is an array of a `text` and an
      `image` block supplies the text. **Content-independence control:** an H1 record whose text
      begins `<task-notification>` is accepted. Tested under `[HUR-AC1]`; RED
      proof P2.
- [ ] **AC2 — everything else is declined (row H3).** Each of these supplies
      no user message and does not throw: `promptSource` `"system"` with
      `origin: {kind: "task-notification"}`; `promptSource` `"sdk"` with
      `origin: {kind: "task-notification"}` and with `origin: {kind: "human"}`;
      no `promptSource` and no `origin`; no `promptSource` with
      `origin: {kind: "human"}`; `promptSource` `null`, a number, an object,
      `"Typed"`, `""` and `"constructor"`. **Content-independence control:** a
      declined record's text is an ordinary sentence. Tested under
      `[HUR-AC2]`; RED proofs P1 and P3.
- [ ] **AC3 — a decline is neutral (row H3, row A5e step 4).** On
      `tests/fixtures/primary-dialogue/claude-harness-user-records.jsonl`: the
      projected messages are exactly the accepted user messages and every
      `end_turn` assistant reply, in order, with the declined records absent;
      the assistant reply after a declined record that precedes all tool
      output is `false`; the reply after a declined record **that itself
      carries a `tool_result` block** is `true`; and `gateExtract.messages`
      equals the raw timeline's roles, declined records included (the Done
      spec's row B2 — the gate still sees them). Tested under `[HUR-AC3]`; RED
      proofs P4 and P7.
- [ ] **AC4 — the sweeps are the only change to pre-existing tests.** Every
      swept fixture equals its `origin/main` version with sweep S1 applied,
      byte for byte; the only lines removed from
      `tests/unit/primary-dialogue.test.js`, `tests/unit/dream-collect.test.js`
      and `tests/unit/dream-pipeline.test.js` are the four S2 records and the
      three S4 records; and every pre-existing test passes with its expected
      values unchanged.
- [ ] **AC5 — RED proofs.** The three declaration files declare P1–P7, and
      `npm run red-proofs` (unfiltered) reports `RUN: PROVEN`: each of P1–P7
      `PROVEN`, criteria AC1, AC2, AC3, AC8 and AC9 `PROVEN`, and every other
      declared proof in the repository still `PROVEN`.
- [ ] **AC6 — the erratum.** E0–E5 are in the Done spec verbatim, with
      `<DATE>` filled in, and no other byte of that file changes.
- [ ] **AC7 — nothing outside the boundary moves.** The default parse is
      unchanged (`tests/unit/transcripts.test.js` passes unmodified; nothing
      under `tests/fixtures/transcripts/` changes), `skills/` is unchanged, and
      the boundary check passes.
- [ ] **AC8 — the guard's counts (Table G rows G1, G2).** For one collector
      run over: a Claude session with an H1 request and an `end_turn` reply; a
      Claude session whose only request is declined and which has an `end_turn`
      reply; a Claude session with no reply; and a Codex rollout with a
      `final_answer` and no accepted user message — `collectExtracts` returns
      `claudeWithReplies` 2 and `claudeRepliesWithoutRequests` 1. Tested under
      `[HUR-AC8]` in `tests/unit/dream-collect.test.js`; RED proof P5.
- [ ] **AC9 — the console line and the halt (rows G3–G5).** In
      `tests/unit/dream-pipeline.test.js`: (a) a run whose admitted Claude
      sessions all have a reply and no accepted request throws a
      `WienerdogError` whose message is G4's text, prints G3's line with the
      right `N of M`, and leaves the transcript ledger without a record for any
      of those sessions; (b) the same input as a dry run does not throw and
      prints G4's text with the dry-run prefix; (c) a run in which one Claude
      session with a reply keeps its request and one does not prints G3's line
      (`1 of 2`) and completes without throwing. Tested under `[HUR-AC9]`; RED
      proof P6 reddens (a).
- [ ] Idempotence: `N/A` — this package changes what a dream run reads and
      when it stops; it adds no command and no write outside the repository.

## Verification steps (run these; paste output in the PR)

### Current-state checks — before implementation

```bash
git rev-parse HEAD
git log --oneline 8117e221..HEAD -- src/core/transcripts/primary-dialogue.js src/core/dream/scratch.js src/cli/dream.js tests/unit/primary-dialogue.test.js tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/fixtures/primary-dialogue/ tests/scenarios/ docs/specs/done/WP-dream-primary-dialogue-projection.md
grep -n "if (message.role !== 'user') return null;" src/core/transcripts/primary-dialogue.js
grep -c 'promptSource' tests/fixtures/primary-dialogue/claude-acceptance.jsonl
```

The log must print nothing (else re-derive every citation first), the grep
must print one line numbered `185`, and the count must print `0`.

### Implementation checks — these must pass before the PR

```bash
grep -c 'Table H' src/core/transcripts/primary-dialogue.js
grep -c '2\.1\.232' src/core/transcripts/primary-dialogue.js
test -f tests/fixtures/primary-dialogue/claude-harness-user-records.jsonl
test -f tests/red-proofs/projection-harness-user-records.proofs.json
test -f tests/red-proofs/projection-harness-user-records-collect.proofs.json
test -f tests/red-proofs/projection-harness-user-records-guard.proofs.json
grep -c 'claudeRepliesWithoutRequests' src/core/dream/scratch.js src/cli/dream.js
bad=0; for f in tests/fixtures/primary-dialogue/claude-acceptance.jsonl tests/fixtures/primary-dialogue/claude-demo.jsonl tests/fixtures/primary-dialogue/claude-oversized-line.jsonl tests/fixtures/primary-dialogue/claude-taint-persists.jsonl tests/fixtures/primary-dialogue/claude-user-quotes-tool.jsonl tests/scenarios/fixtures/claude-day1.jsonl tests/scenarios/fixtures/claude-day2.jsonl tests/scenarios/fixtures/claude-day3-injection.jsonl tests/scenarios/negative/fixtures/hostile-day1.jsonl; do git show "origin/main:$f" | sed 's/^{"type":"user",/{"type":"user","promptSource":"typed",/' | cmp -s - "$f" || { echo "SWEEP MISMATCH $f"; bad=1; }; done; git show origin/main:tests/fixtures/primary-dialogue/taint-cases.json | sed 's/{\\"type\\":\\"user\\",/{\\"type\\":\\"user\\",\\"promptSource\\":\\"typed\\",/g' | cmp -s - tests/fixtures/primary-dialogue/taint-cases.json || { echo "SWEEP MISMATCH taint-cases.json"; bad=1; }; test "$bad" -eq 0 && echo "sweep: all ten files exact"
test -f tests/unit/primary-dialogue.test.js && test -f tests/unit/dream-collect.test.js && test -f tests/unit/dream-pipeline.test.js && test "$(git diff -U0 origin/main...HEAD -- tests/unit/primary-dialogue.test.js tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js | grep -E '^-[^-]' | grep -c -v -F -e "JSON.stringify({ type: 'user', timestamp: '2026-09-17T09:00:00.000Z', message: { role: 'user', content:" -e "rec({ type: 'user', message: { role: 'user', content:")" = 0 && echo "test files: only S2 and S4 lines removed"
test "$(grep -c 'see Erratum 7' docs/specs/done/WP-dream-primary-dialogue-projection.md)" = 2 && test "$(grep -c 'see Erratum 8' docs/specs/done/WP-dream-primary-dialogue-projection.md)" = 2 && test "$(grep -c 'see Erratum 9' docs/specs/done/WP-dream-primary-dialogue-projection.md)" = 1 && test "$(grep -c 'filed by `WP-dream-projection-harness-user-records`' docs/specs/done/WP-dream-primary-dialogue-projection.md)" = 1 && ! grep -q '<DATE>' docs/specs/done/WP-dream-primary-dialogue-projection.md && echo "erratum: markers exact"
test -d tests/fixtures/transcripts && [ -z "$(git diff --name-only origin/main...HEAD -- tests/fixtures/transcripts/ tests/golden/ skills/ src/core/transcripts/claude.js)" ] && echo "outside the boundary: unchanged"
npm test -- tests/unit/primary-dialogue.test.js tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/transcripts.test.js
npm test
npm run lint
npm run red-proofs -- --wp WP-dream-projection-harness-user-records
npm run red-proofs
node scripts/boundary-check.js docs/specs/WP-dream-projection-harness-user-records.md $(git diff --name-only origin/main...HEAD)
git diff --check
```

The first two greps and the `claudeRepliesWithoutRequests` grep must print a
number of at least `1` for each file. The filtered `red-proofs` command exits
non-zero with `RUN: FILTERED` because `--wp` filters the run (that is the
runner's contract); what counts there is each selected proof's and
criterion's `PROVEN` line. The unfiltered run must end `RUN: PROVEN`. The sweep, test-file and erratum lines
each print their final `echo` only when every part holds, and each fails when
its file is absent (`cmp` and `grep` on a missing file, and the `test -f`
guards).

### Local re-measurement — counts only (paste the output)

On a machine with Claude transcripts, this runs the tree's own parser and
projection over them and prints counts, harness enum values and booleans — no
text, no path, no session id:

```bash
out="$(node docs/specs/logbook/2026-09-26-projection-harness-user-records-measure.js --days 5)"; st=$?; printf '%s\n' "$out"; test "$st" -eq 0 && printf '%s\n' "$out" | grep -q '^files ' && ! printf '%s\n' "$out" | grep -E ' msgs .* \| ' | grep -v -E 'promptSource=(typed|queued|suggestion_accepted) \||promptSource=sdk \| origin=ABSENT \|' && echo "every accepted user message is in H1 or H2, and no file gives replies without a request"
```

It prints its final line only when every accepted user message row is an H1
or H2 state **and** the script exited 0. The script exits 1 when any file
projects an assistant reply and no user message — Table G's G2 state, the
state a harness field change produces. On the shipped tree the command prints
the offending accepted rows instead; with every user record declined the
script exits 1 (the round record §4.3 ran all three). On a machine with no transcripts it prints
`files 0` and passes vacuously; say so in the PR rather than presenting it as
evidence.

## Out of scope (do NOT do these)

- **The interim assistant replies.** Both positional rules the evaluation
  tried were measured unsafe (6,441 and 23,430 characters of kept material
  lost), and no structural rule for them is known; the model-call route was
  the superseded `docs/specs/done/WP-dream-primary-dialogue-filter.md`.
- **Whether a task notification should set the taint state** — owner item 3;
  no step-3 rule is added here.
- **Excluding `claude -p` sessions as a whole** — owner item 1's alternative,
  a package of its own.
- **Codex rollouts, and a Codex arm of Table G.** 240 of 408 local Codex
  rollouts (Codex 0.144.1–0.147.0) already project to replies with no request,
  because row A3 declines user messages that carry no `content_item_kinds`; a
  Codex count would fire on the first run. That pre-existing finding is
  routed as its own candidate package (round record §6), which is where a
  Codex guard belongs.
- **A dream-report section or a `reports/warnings.md` entry for Table G.** The
  report's run-skips section is about sessions a run could NOT consolidate and
  its six counts are disjoint from the admitted set
  (`docs/specs/done/WP-dream-report-run-skips.md`, Table B row B8), so a
  consumed-but-degraded session does not belong in it; `reports/warnings.md`
  renders ledger quarantines, and Table G writes none. Owner item 2 prices a
  report line.
- **The first-pass novelty finding** — `docs/specs/WP-dream-first-pass-novelty.md`.
- **Sweeping the other Claude `user` fixtures** (`tests/fixtures/dream/transcripts/`,
  the other inline records in `dream-collect.test.js` and
  `dream-pipeline.test.js`): nothing asserted on them changes (Current state).

## Dispatch precondition — owner items

**Citations.** Written against `main` at `8117e221`. Before dispatch, re-run every
`file:line` citation, checked at both ends
(`docs/runbooks/codex-review.md`, "Dispatch-time re-verification"). A citation
that does not resolve blocks the dispatch.

**Owner items** — each a recommendation with the cost of overruling it. None is
ratified by this document. **They gate DISPATCH, not `Ready`** (repo precedent,
stated in `docs/specs/done/WP-vault-write-cas-window.md`, "Dispatch
precondition — owner items").

1. **Accept `claude -p` prompts (row H2).** *Recommendation:* accept, for this
   package. They are real requests — a routine's instructions are what its
   concluding report answers — and this package's scope is records the
   **harness** wrote, which a `claude -p` prompt is not: Wienerdog's code, a
   judge or the person wrote it. The Done spec's A5b already says a `user`
   message's `false` is not a claim of human authorship. *Cost of overruling:*
   the evaluation traced all five instances of harm it found to the three
   machine-authored sessions of its sample, so the owner may want them gone.
   But declining only the prompt (drop H2) leaves each headless session's
   concluding reply with no request before it — 257 prompts, 109,027
   characters on the corpus, removed while their answers stay. Removing
   headless sessions whole needs a session-level rule this package does not
   have, and it would also remove the daily digest and other routines from the
   dream's view; that is a separate package and a separate ruling.
2. **What Table G does when a harness change erases every request.**
   *Recommendation:* halt (row G4) — stop the run before the model runs, so
   no session is marked as dreamed over and the scheduler's failure alert
   reaches the next digest banner; for a partial state print the count and
   continue (rows G3, G6); set no file aside. The trigger is measured: 0 of
   321 Claude files with a reply today, 321 of 321 under a simulated field
   change. *The cost, stated:* after such a change the dream does nothing
   every night until Wienerdog is updated, and each night's alert says so;
   Codex sessions admitted alongside are deferred with it. *Cost of the
   alternatives:* **report-only** (print, consolidate, continue) marks every
   affected session as dreamed over, so their requests are lost for good
   even after the update, and the only durable surface for it would be a new
   dream-report section in `src/core/dream/promote.js` — one more
   deliverable, and a section outside the run-skips contract (Out of scope).
   **Setting each affected file aside** (a new quarantine reason) keeps it
   out of the dream until the file changes — which for a finished session is
   never — so an update would not bring its requests back, and it would add
   a ledger reason, a `reports/warnings.md` rendering and ADR-0023's
   "no new quarantine reason" to amend.
3. **Should a declined task notification set the taint state?**
   *Recommendation:* no, not in this package. Declining is taint-neutral by
   construction (Context, "Provenance"), and on the corpus 1,103 of 1,103
   notifications arrived with the state already set by something earlier in
   the same file, so a rule would change no flag that was measured; a
   notification that carries a `tool_result` block already taints through
   step 3 (AC3). *Cost of this answer:* a string-content notification arriving
   before any tool result or context gap in its file (not observed) would
   leave the synthesis after it `false`,
   and that synthesis may restate external content the subagent read. *Cost
   of the other answer:* a step-3 clause that taints on
   `origin.kind === "task-notification"` — one clause, one fixture, one RED id,
   size unchanged — but it amends the Done spec's CANONICAL row A5d by erratum,
   and it too depends on an undocumented value whose rename would silently
   turn the protection off.

## Definition of done

0. **DISPATCH PRECONDITION.** The design gate has closed
   (`docs/runbooks/codex-review.md`) and owner items 1–3 are ruled or
   explicitly left at their recommendations by the owner. Branch
   `wp/dream-projection-harness-user-records`.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(transcripts): decline Claude user records the harness wrote (WP-dream-projection-harness-user-records)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
