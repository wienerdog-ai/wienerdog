---
id: WP-dream-primary-dialogue-collection
title: Collect primary dialogue into scratch and keep the code-owned gates on the original timeline
status: Draft
model: opus
size: M
depends_on: [WP-dream-primary-dialogue-projection]
adrs: [ADR-0004, ADR-0005, ADR-0012, ADR-0020, ADR-0023, ADR-0024, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-primary-dialogue-collection: Collect primary dialogue into scratch and keep the code-owned gates on the original timeline

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **It is just files (ADR-0004): no
daemons, no servers, no telemetry, no background process that outlives its
job.** This package adds no process.

The **dream** is the nightly consolidation job. `collectExtracts` discovers
harness session **transcripts**, parses each into a normalized **extract**,
admits them newest-first under the byte bound `dream_max_input_bytes`, and
writes the admitted extracts as private JSON files into a scratch directory.
`src/cli/dream.js` then gives one Claude session that directory plus a private
copy of the vault; that session proposes memory notes, and code validates and
promotes them.

**What this package does.** Its predecessor,
`WP-dream-primary-dialogue-projection`, added a parser entry point
`parsePrimaryWithOutcome` that no caller uses. This package switches the
collector onto it, so the scratch files the consolidation agent reads contain
**primary dialogue** — the person's requests and corrections plus the
concluding assistant reply of each exchange — instead of the current mixture of
dialogue, tool results, intermediate progress replies and harness-authored
control text. On a 2026-09-16 measurement of 187 sessions, more than half of
what the dream was told was "the user speaking" was Codex developer messages
(1,653,850 of 3,071,245 characters)
(`docs/specs/logbook/2026-09-16-dream-process-assessment.md`). There is **no
model call** in this package: the projection is deterministic code.

**The two things that must not move, and why they are the hard part.**

1. *The admitted session set.* `dream_max_input_bytes` bounds bytes, not
   sessions, and every admitted session is marked `processed` whether or not the
   consolidation agent read it — on the measured night, 198 were marked
   processed and the agent read 20 in full (the assessment's finding F1). A
   smaller extract means more sessions fit the same byte bound, so a careless
   change here would retire *more* sessions unread every night. This package
   therefore measures the bound against the **transcript intake**, exactly as
   today, and writes the smaller projection — see Table C row C1 and owner
   item 1. It does not fix F1; it is built so it cannot worsen it.
2. *The code-owned gates.* `src/core/dream/validate.js` decides whether a
   claimed skill learning is authorized, and derives `derived_from_untrusted`
   from whether an external `tool_result` appears inside the skill's invocation
   window. It reads the *original* message timeline. If the projection simply
   removed those messages, that gate would silently weaken — a gate must never
   gain permission because its evidence was deleted. The projection therefore
   also produces a **text-free** projection of the original timeline, which this
   package routes to the gate instead of re-reading it out of scratch.

Because (2) changes what the consolidation agent can see when it looks for
skill learnings, it changes a durable policy under **ADR-0020** (skill revision
lifecycle: dream-created-only, recurrence-gated, quarantined learnings). The
amendment text is in this spec, below, to be appended byte-for-byte.

## Current state

**Base commit: `05f1f55d6fde601976ed2da1247a4e3b9604f4c8`** (upstream `main`).
Every file:line below was re-derived against that commit by locating the
construct, reading the whole enclosing function and checking both ends of each
range.

**The dispatcher must re-derive every `src/cli/dream.js` and
`src/core/dream/scratch.js` cite at dispatch.** Both files are edited by
`WP-dream-report-run-skips`, which was `Ready` and in flight when this spec was
written; `#245`, `#253` and `#257` already moved them since the predecessor
draft's fork baseline. Run
`git log --oneline 05f1f55d..HEAD -- src/cli/dream.js src/core/dream/scratch.js`
first and re-read anything that moved.

- `src/core/dream/scratch.js:46-157` is `collectExtracts(paths, ledger,
  maxInputBytes, {preprocessTimeoutMs = 60_000, now})`. It discovers, filters
  to `selectState(...) === 'select'` (`:54`), splits off files over the pre-read
  ceiling (`:57-60`), sorts newest-mtime-first (`:61`), prunes the ledger's
  oversized memos to those whose `fingerprint` **and** `appVersion` still match
  (`:66-74`), then recreates the scratch dir (`:76-78`) and runs one admission
  loop (`:88-140`) with **five** exclusion arms:
  `deferred` (capacity: `remaining === 0` at `:91-94`, or
  `extractBytes > remaining` at `:124-127`), `deadlineDeferred` (`:95-98`),
  `oversized` (memo hit `:102-105`, or fresh measurement `:119-123`),
  `readDeferred` (`parse.runExhausted`, `:114-117`) and `newlyQuarantined`
  (non-`ok` parse outcome, `:110-113`).
- The two lines this package changes are `scratch.js:118`
  (`const extractBytes = Buffer.byteLength(JSON.stringify(extract));`) and
  `:129` (`writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2));`
  — 0600, **no trailing newline**). `:128` builds the filename as
  `${d.harness}-${sanitize(extract.session_id)}.json`, where `sanitize` (`:18-20`)
  replaces every character outside `[A-Za-z0-9_-]` with `_`.
- `:109` calls `transcripts.parseWithOutcome(d, transcripts.newRunBudget())` —
  a **fresh** read allowance per session. `:120` writes the oversized memo
  `{fingerprint, appVersion, extractBytes}`.
- `src/core/dream/ledger.js:112-120` (`normalizeOversizedExtracts`) accepts a
  memo only with a string `fingerprint`, a string `appVersion` and a safe
  positive integer `extractBytes`; `:88-97` documents the per-file record
  (`{fingerprint, outcome, reason?, deferrals?, updated_at, harness}`) — **no
  record carries an extractor or parser version.**
- `src/cli/dream.js:1042-1049` builds `extractsBySession` by **re-reading each
  file in `sel.wrote` off disk** and keying it `<harness>:<session_id>`; an
  unreadable file is swallowed so its sessions fail the ledger gate closed. It
  runs after the integrity check at `:995-1000` (`scratchIntact`) and the
  stray-file sweep at `:1003-1009`. `:1050-1064` passes the map into `promote`.
- `src/core/dream/validate.js:510-527` (`invocationWindowTainted`) reads only
  `extract.messages[i].role` and `extract.skill_invocations`; it needs **no
  message text**. `:631-649` requires each newly counted `claude:` session to be
  present in `extractsBySession` and to carry a matching `skill_invocations`
  entry, and raises `derived_from_untrusted` when the window is tainted.
- `src/cli/dream.js:136-159` is `printPlan`. `:141-147` sums the **on-disk**
  sizes of `sel.wrote`, and `:154` prints, at a two-space indent, the line
  `total input bytes: ${totalBytes}`. `tests/integration/dream.test.js:587`
  asserts `/total input bytes: [1-9][0-9]+/`.
- `src/cli/dream.js:708-716` calls the collector and persists changed memos;
  `:781-797` renders one console line per non-empty exclusion arm, including
  `capacity stop: … retry on the next run or raise dream_max_input_bytes in
  config.yaml.` (`:782-783`); `:1328` calls `cleanScratch(paths.state)` in the
  run's `finally`.
- `skills/wienerdog-dream/SKILL.md` — the dream skill. `:22-29` tells the model
  every extract line is data and singles out `role: tool_result`. `:47-70`
  documents the extract shape, naming the three roles and giving a `jsonc`
  example whose messages are `{role, text, ts}`. `:72-81` (Phase 1) tells it to
  track *what role each supporting message has*. `:101-105` (Phase 2) is the
  provenance rule: `derived_from_untrusted: true` if any supporting message has
  role `tool_result`. `:212-222` tells it a Claude session used a skill when the
  extract's **`skill_invocations` array** names it and that `errored: true` means
  the invocation's tool result failed. `:317-322` repeats the
  `skill_invocations` requirement under "Which sessions count, and trust".
  **Three further sites restate the same role-based rule and are easy to miss:**
  `:93` ("explicit user signal … in a `user` message (never a `tool_result`
  message)"), `:185-188` (the raise-only rule when updating an existing note,
  phrased as "your new supporting text includes any `tool_result`-derived
  content"), and `:291-297` (the learnings ledger's per-entry
  `derived_from_untrusted`, phrased as "set `true` if ANY message … has role
  `tool_result`"). Measured at the base commit: `tool_result` occurs **8 times
  on 8 lines** — `:24`, `:27`, `:51`, `:67`, `:93`, `:102`, `:187`, `:292`;
  `skill_invocations` on `:216`, `:222`, `:320`; and `errored` on `:217`,
  `:218` and `:229` (`:229` is the "a **failure** (the invocation errored, or
  the person had to retry it)" bullet under "What to record", whose second
  clause survives row D3 and whose first does not).
- `src/core/runtime-skill-digests.json` pins the shipped skills' body digests;
  `tests/unit/dream-skill-structure.test.js` asserts the dream skill's prose
  contract.

**After `WP-dream-primary-dialogue-projection` lands**, `src/core/transcripts`
exports `parsePrimaryWithOutcome(entry, budget)` →
`{extract, gateExtract, intakeBytes, parse}`: the model-visible primary extract
(no `skill_invocations`, a `derived_from_untrusted` boolean on every message), a
text-free `{harness, session_id, messages:[{role}], skill_invocations}`
projection of the original timeline, and the compact JSON byte length of the raw
capped extract — the number `scratch.js:118` computes today. **Read that module
and its spec's Tables A and B before starting; they are this package's input
contract and are not restated here beyond what Tables C and D need.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | Table C rows C1–C4: opt into `parsePrimaryWithOutcome`, measure on `intakeBytes`, write the projection, return the gate projections and the intake total |
| modify | src/cli/dream.js | Table D row D1 (feed `extractsBySession` from the collector) and Table C row C5 (the two dry-run byte lines) |
| modify | skills/wienerdog-dream/SKILL.md | Table D rows D2–D4: extract shape, provenance rule, learning discovery |
| modify | src/core/runtime-skill-digests.json | regenerate the dream skill's digest only — no other entry changes |
| modify | docs/adr/0020-skill-revision-lifecycle.md | Table D row D5: append the block in "ADR-0020 amendment text" below, byte-for-byte |
| modify | tests/unit/dream-collect.test.js | Table C |
| modify | tests/unit/dream-pipeline.test.js | Table D row D1's gate wiring, and the unchanged publication path |
| modify | tests/unit/dream-skill-structure.test.js | Table D rows D2–D4's prose contract |
| modify | tests/integration/dream.test.js | whole-run behavior; `:587`'s dry-run assertion under row C5 |
| create | tests/red-proofs/dream-primary-collection.proofs.json | ADR-0042 declarations whose `suite` is `tests/unit/dream-collect.test.js` |
| create | tests/red-proofs/dream-primary-collection-pipeline.proofs.json | ADR-0042 declarations whose `suite` is `tests/unit/dream-pipeline.test.js` — a second file because `suite` is a top-level field and one file names one suite |

### Exact contracts

The canonical facts are **Table C** (collection) and **Table D** (what the model
sees, and what code keeps to itself). Everything here mirrors them.

```js
/** Unchanged signature; two added return fields (Table C rows C4, C5).
 *  @returns {{entries, scratchDir, processed, newlyQuarantined, deferred,
 *             droppedForSize, dropped, truncated, wrote, deadlineDeferred,
 *             readDeferred, oversized, oversizedExtracts,
 *             gateExtracts: Map<string, {harness, session_id, messages:[{role:string}], skill_invocations?:Array}>,
 *             intakeBytesTotal: number}} */
function collectExtracts(paths, ledger, maxInputBytes, options)
```

#### Literal expected scratch file

Source file `/samples/rollout-demo.jsonl`, two records:

```jsonl
{"type":"session_meta","payload":{"id":"demo","thread_source":"user"}}
{"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Keep explanations concise."}],"internal_chat_message_metadata_passthrough":{"content_item_kinds":["user.text"]}}}
```

The collector writes `<scratchDir>/codex-demo.json` whose complete contents are
exactly the following — 0600, and **the existing writer adds no trailing
newline**:

```json
{
  "harness": "codex",
  "session_id": "demo",
  "started": null,
  "cwd": null,
  "source_path": "/samples/rollout-demo.jsonl",
  "truncated": false,
  "messages": [
    {
      "role": "user",
      "text": "Keep explanations concise.",
      "ts": null,
      "derived_from_untrusted": false
    }
  ]
}
```

The key order above is the emitted order and was confirmed by running the real
parser at the base commit on this exact input; only the per-message
`derived_from_untrusted` key is new. **The byte count this admission was
measured against is not the size of that file.** For this input the file is 307
bytes on disk, its compact form is 233 bytes, and `intakeBytes` — the compact
JSON length of the raw capped extract, which is what X is measured against
(row C1) — is **202**. It is smaller than the projection here because this
source has nothing to remove and the projection *adds* a `derived_from_untrusted`
key per message: **projection shrinks extracts in aggregate, not on every
session**, and a session that is already pure dialogue grows by 30 bytes per
message. Row C1 is what makes that harmless — admission is decided on the
intake number, so neither direction of the difference moves the admitted set.

## Contract reference

The ADR-0031 activation trigger fires on four of seven: (iii) structured
parsing and what is persisted change; (iv) the exclusion-arm and fallback
behavior around admission must be shown *unchanged*, which is itself a claim
about failure behavior; (v) authority boundary — the collector emits the
evidence `validate.js` owns the interpretation of; (vii) the same facts appear
in the Deliverables notes, the literal scratch file, the skill prose, the ADR
amendment, the acceptance criteria and the verification greps.

### Contract table(s)

#### Table C — collection and persistence

| ID | Contract | Rule |
|----|----------|------|
| C1 | **What `dream_max_input_bytes` measures — CANONICAL.** | X is measured against `parsePrimaryWithOutcome(...).intakeBytes`, which is byte-identical to the `Buffer.byteLength(JSON.stringify(extract))` that `scratch.js:118` computes today from `parseWithOutcome`. **Consequence, and it is the point of the row: for any given ledger and corpus, this package admits exactly the session set the base commit admits, in the same order, with the same five exclusion arms populated identically.** Projection can therefore never admit a session today's collector would have deferred, and can never retire one unread that today's would have left for the next run. Every other admission policy is untouched and keeps its numbers: newest-first, whole-extract admission, exact-full stop, omit-and-stop on remainder overflow, individually-oversized skip, the 60-second soft preprocessing deadline, and the fresh per-session read allowance. There is no backfill: no session is admitted because projection freed space. |
| C2 | What is written | The file written at `scratch.js:129` is `JSON.stringify(<the primary extract>, null, 2)` — the projection, never the raw extract — at the existing 0600 with no trailing newline, under the existing filename rule `${harness}-${sanitize(session_id)}.json`. An extract whose projection retains **zero** messages is still written, with its identity and an empty `messages` array: the consolidation agent may legitimately decide a session holds nothing worth remembering, and that is a different state from the session being absent. `sel.entries` and `sel.wrote` keep their existing meanings and membership. |
| C3 | The oversized memo is unchanged | Because C1 keeps the measured quantity byte-identical, `oversizedExtracts` memos keep their exact current meaning and remain valid across this change. **No `extractFormat` field, no format discriminator, and no new invalidation rule is added**; `ledger.js` is not a deliverable of this package. The memo's three existing release conditions are untouched (the source file's fingerprint changes, `package.json.version` changes, or X rises to or past the measured size). Nothing resets processed outcomes, migration baselines, quarantine records or secret-revert counters. |
| C4 | `gateExtracts` | The collector returns the text-free gate projection of every session it wrote, as a `Map` keyed `<harness>:<session_id>` and populated in write order, so a session-id collision resolves last-wins exactly as `src/cli/dream.js:1042-1049` resolves it today. It lives in memory for the run only: it is never written to any file, never placed under the scratch directory or any other directory a model can read, and never handed to a model. It carries no message text (its shape is the predecessor package's Table B row B2). Nothing else about privacy or cleanup changes — the run's `finally` still calls `cleanScratch`, and no durable evidence archive, selection checkpoint or transcript-content log is introduced. |
| C5 | The dry-run preview names both numbers | After this package the bytes given to the model and the bytes X bounds are different quantities, so `printPlan` must not print one label over the other. `src/cli/dream.js:154` is replaced by exactly these two lines, in this order, each at the same two-space indent the surrounding preview lines use: `session text given to the memory pass: ${totalBytes} bytes`, then `transcript text measured against the ${cfg.maxInputBytes}-byte limit: ${sel.intakeBytesTotal} bytes`. `totalBytes` keeps its existing derivation (the summed on-disk sizes of `sel.wrote`, `:141-147`); `intakeBytesTotal` is the sum of the `intakeBytes` of the admitted sessions. Everything else `printPlan` prints is unchanged, and `--dry-run` still performs no model call and writes nothing. |

#### Table D — what the model sees, and what code keeps to itself

| ID | Contract | Rule |
|----|----------|------|
| D1 | The gate reads the original timeline | `src/cli/dream.js:1042-1049`'s re-read of `sel.wrote` is replaced by `sel.gateExtracts`: the map handed to `promote` is the collector's, not one rebuilt from the scratch files. A session absent from the map fails the ledger gate closed, exactly as an unreadable extract does today, and `validate.js` is **not** a deliverable — its code, its verdicts and its fail-closed behavior on malformed geometry are unchanged. The integrity check at `:995-1000` and the stray-file sweep at `:1003-1009` stay where they are and keep their current effect. This is strictly stronger than today: the gate's evidence now never reaches a directory the model can write to, so nothing the model does during the run can reach it. |
| D2 | The model sees dialogue and a provenance flag | The dream skill's documented extract shape (`SKILL.md:47-70`) becomes the projection's: messages carry `role` (`user` or `assistant` only), `text`, `ts` and `derived_from_untrusted`; there is no `tool_result` role and no `skill_invocations` array. The Phase 2 provenance rule (`:101-105`) becomes: set a candidate's `derived_from_untrusted` to `true` if **any** supporting message carries `derived_from_untrusted: true`; set it `false` only when every supporting message carries `derived_from_untrusted: false`; **never infer `false` from a message's role**. Phase 1 (`:72-81`) tracks each supporting message's flag rather than its role. The quoted-data warning (`:22-29`) keeps its force and stops singling out `tool_result`: an assistant message may restate material that came from outside the conversation, and `derived_from_untrusted: true` is exactly what marks it. The same substitution is made at the three further sites Current state names — `:93`'s explicit-user-signal clause, `:185-188`'s raise-only rule for an existing note, and `:291-297`'s per-entry ledger rule. **Checkable consequence: the string `tool_result` occurs zero times in the file afterwards.** That is deliberate and it is the whole point of the row — the role no longer exists in anything the model reads, so any surviving sentence about it is a rule the model cannot apply, and a count of zero is the only cheap way to prove none was left behind. |
| D3 | Learning discovery is dialogue-only | The skill identifies a possible skill usage from retained dialogue alone, for both harnesses (`SKILL.md:212-222`, `:317-322`). It no longer reads a `skill_invocations` array, no longer reads `errored`, and **must not infer that an invocation succeeded or failed from the absence of evidence** — an outcome it cannot see is an outcome it does not report. The code-owned checks are unchanged and are now fed evidence the model never sees: a Claude session counted in a ledger entry is still independently verified to have invoked that skill, `derived_from_untrusted` is still derived from the invocation window and can still only be raised, and a Codex session still never authorizes a skill-body revision. Filtering cannot create an invocation, lower the gate's taint, or turn Codex evidence into qualifying Claude evidence. |
| D4 | The shipped digest is regenerated | `src/core/runtime-skill-digests.json` is regenerated so the dream skill's entry matches its new body, and **no other entry in that file changes**. `tests/unit/dream-skill-structure.test.js` is updated to assert rows D2–D3's prose contract rather than the superseded sentences. |
| D5 | The ADR amendment | Rows D2–D3 change a durable policy under ADR-0020, so the block in "ADR-0020 amendment text" below is appended to `docs/adr/0020-skill-revision-lifecycle.md` byte-for-byte, after the existing `## Amendment (2026-09-05): ledger-parser correctness …` section and before `## Future work (parked, not specced)`. Nothing above it is edited. Its `Status:` line is written exactly as given and nothing stronger: the owner adds his own signature line himself, and no work package writes `OWNER-SIGNED`, `OWNER-RATIFIED`, or any sentence saying the owner approved, accepted, ratified or signed it. |

### Mirrored Surface Checklist

For each canonical table above, every surface in this spec that mirrors it. A
review finding updates the table **and every mirror below in the same commit**;
a newly found mirror is registered here on the spot.

- [ ] **Deliverables-table cells that restate a path or rule** — walked: the
      `scratch.js` cell names C1–C4; the `dream.js` cell names D1 and C5; the
      `SKILL.md` cell names D2–D4; the digests cell names D4's no-other-entry
      clause; the ADR cell names D5's byte-for-byte clause; the two proofs cells
      name their suites per ADR-0042.
- [ ] **Acceptance criteria that assert its facts** — walked: AC1 asserts C1;
      AC2 asserts C2 and C3; AC3 asserts C5; AC4 asserts D1; AC5 asserts
      D2–D4; AC6 asserts D5; AC7 is the C1 measurement; the idempotency
      criterion asserts C2's determinism.
- [ ] **Verification commands / greps** — walked: the `rg` over
      `scratch.js`/`dream.js` in Current-state checks mirrors the C1/C5/D1
      cites; the three-token absent grep over `SKILL.md`
      (`skill_invocations|tool_result|errored`) mirrors D2's zero-occurrence
      clause and D3; the ADR `Status:` grep and the owner-phrase prohibition
      grep mirror D5; `npm run red-proofs` mirrors AC1 and AC4.
- [ ] **Current-state description** — walked: `scratch.js:118`/`:129` back C1
      and C2; `scratch.js:66-74`/`:102-105`/`:120` and `ledger.js:112-120` back
      C3; `dream.js:136-159` and `tests/integration/dream.test.js:587` back C5;
      `dream.js:1042-1049` and `validate.js:510-527`/`:631-649` back D1; the
      `SKILL.md` cites — `:22-29`, `:47-70`, `:72-81`, `:93`, `:101-105`,
      `:185-188`, `:212-222`, `:291-297`, `:317-322`, and the eight-site
      `tool_result` occurrence list — back D2–D4; `ledger.js:88-97`'s "no record carries an
      extractor version" backs the replay decision in Implementation notes.
- [ ] **Operative prose steps that apply it** — walked: Context's two
      "must not move" numbered paragraphs apply C1 and D1; the
      `collectExtracts` JSDoc block applies C4 and C5; the literal scratch file
      and the paragraph after it apply C1 and C2; Implementation notes' replay,
      F1, digest-regeneration and derived-proof bullets apply C1, C3, D4 and the
      RED-proof register; the ADR-0020 amendment text applies D2, D3 and D5;
      Out of scope's `ledger.js` and relevance-stage bullets apply C3; owner
      item 1 applies C1 and C3.

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, no build step** (CLAUDE.md). Plain
  Node ≥ 18 with JSDoc annotations.
- **Re-derive the `dream.js` and `scratch.js` cites first.** See Current state.
  If `WP-dream-report-run-skips` has landed, the exclusion-arm console block
  around `dream.js:781-797` will have moved and gained a rendered report
  section; row C1's "the same five exclusion arms populated identically"
  guarantee is what makes that package's counts and bullets stay true without
  either package changing the other's text. Check that claim rather than
  assuming it, and if it is false, stop and say so rather than editing that
  package's surface from inside this boundary.
- **No automatic historical replay, and nothing is offered.** A processed
  ledger record is `{fingerprint, outcome, reason?, deferrals?, updated_at,
  harness}` (`src/core/dream/ledger.js:88-97`) and carries **no extractor or
  parser version**, so changing the projection does not re-dream anything
  already marked processed: those sessions keep whatever the old parser gave
  the old dream, and the improvement reaches only sessions dreamed from here on.
  This package adds no replay command, no `--reprocess` flag and no migration.
  **The only existing mechanisms that would re-select a processed file are its
  fingerprint changing (size, mtime, device or inode) and the ledger being
  absent or unreadable** — neither is documented to users here and neither is
  invoked by this package. Size memos are a separate matter and are *not*
  invalidated by this change either (row C3); shipping a release does bump
  `package.json.version`, which invalidates them as it always has, causing a
  fresh size **measurement** — not a re-dream.
- **This package does not fix F1, and must not be described as fixing it.**
  Admission still marks every admitted session `processed` when the run's
  secret gate allows it, without any per-session examination result. Row C1
  guarantees only that the count of sessions retired that way is unchanged.
- **Regenerate the skill digest with the repo's own tooling**, not by hand, and
  check the diff touches exactly one entry (row D4).
- **The RED proofs' `expectRed` sets are DERIVED, not measured** — the code they
  mutate does not exist yet. The implementer measures each set by running
  `npm run red-proofs` and **corrects the declaration**. Correcting a set may
  falsify prose, so these are the sentences that depend on it and must be
  re-read in the same pass: both `tests/red-proofs/…` Deliverables notes; this
  bullet; the Mirrored Surface Checklist's verification bullet clause naming
  `npm run red-proofs`; and the clause in each of AC1 and AC4 naming which
  behavior its proof reddens. If a measured set proves a criterion needs more
  than one mutation, add it and update those clauses — do not leave a criterion
  `PROVEN` by a proof that reddens for another criterion's reason.

## ADR-0020 amendment text

Append this block verbatim to `docs/adr/0020-skill-revision-lifecycle.md`,
after the existing `## Amendment (2026-09-05): ledger-parser correctness
(WP-audit-e-ledger-parser-corpus)` section and before `## Future work (parked,
not specced)`. Do not edit it; do not reword its `Status:` line. That line
records a proposal, **not** an owner decision: the owner adds his own signature
line to this amendment himself, and no work package may write `OWNER-SIGNED` or
`OWNER-RATIFIED` on his behalf or state that he approved it.

```markdown
## Amendment (2026-09-17): the model looks for skill learnings in dialogue only — WP-dream-primary-dialogue-collection

Status: **PROPOSED — awaiting owner signature.**

**Decision.** The dream's model-visible input becomes primary dialogue: the
person's requests and corrections, and the concluding assistant reply of each
exchange. Tool calls, tool results, reasoning text, intermediate progress
replies and harness-authored instructions are not in it. Table D in
`docs/specs/WP-dream-primary-dialogue-collection.md` is canonical for the
change; this amendment records the policy it implies for this ADR.

**What the model may use as evidence of a skill learning.** Retained dialogue,
and nothing else. The `skill_invocations` array is no longer carried on the
extract the model reads, and neither is any other detail extracted from a tool
record — an invocation name, an index, an error state. The model identifies a
possible skill usage from what the person and the assistant said, for both
harnesses alike, and **may not infer that an invocation succeeded or failed
from the absence of evidence**: an outcome it cannot see is an outcome it does
not report.

**What does not change, and this is the whole safety argument.** Every
code-owned check in this ADR keeps its current authority and its current
inputs. The learnings-ledger validator still requires each newly counted
`claude:` session to be present among the run's processed sessions and to carry
a real invocation of that skill; it still derives `derived_from_untrusted` from
the invocation window and still raises, never lowers, the value the model
wrote; a repeated `##` heading is still a refusal at all three reads; and a
Codex session still never authorizes a skill-body revision. Those checks now
read a **text-free projection of the original message timeline** — session
identity, message roles in their original positions, and the unchanged
invocation geometry — produced by code before anything is removed, kept in
memory for the run, and never written where a model can read it. A gate must
never gain permission because its evidence was deleted, and this is the
mechanism that keeps that true.

**The accepted cost.** A skill usage, or a skill failure, that appears only in
tool records is now invisible to the model, so it will not become a learning.
Fewer learnings will be proposed, and some real ones will be missed. That is
accepted in exchange for input the model can actually read: on a 2026-09-16
measurement of 187 sessions, more than half of what the dream was told was "the
user speaking" was harness-authored control text. The ≥ 3-session recurrence
gate on skill-body revision is unchanged, so a learning that is genuinely
recurrent still has to recur in dialogue three times before it can touch a
skill body.

**A second cost, stated so it is not discovered later.** A headless routine
session — a scheduled digest, a routine run — is one prompt and one closing
report, so its entire operational middle lives in tool records and is now
outside the dream's view. And a routine's prompt is code-authored, yet it is an
ordinary user record: a measurement across 7 headless and 53 interactive local
transcripts found **no** top-level field distinguishing the two. The extract's
`derived_from_untrusted: false` therefore means exactly "code observed this
text in a source record the harness attributes to the user, with no tool output
or context gap before it" — never "a human typed this", never "this is true",
and never "this is safe to obey".
```

## Security checklist

- [ ] No untrusted identifier gains a new path into a filesystem path or a shell
      command: the scratch filename is still built by the existing
      `sanitize(session_id)` at `src/core/dream/scratch.js:128`, and this
      package neither changes that function nor adds another use of a
      transcript-derived value in a path.
- [ ] Redaction still runs on every message that reaches scratch, before the
      character cap, through the one shared detector (ADR-0024) — the
      projection reuses the existing `capMessage` path and adds no second
      serialization route to disk.
- [ ] Row D1 narrows rather than widens the gate's trust surface: its evidence
      is produced before the model runs and never leaves memory, so the
      model cannot influence it even by writing into scratch. The existing
      integrity check and stray-file sweep still run.
- [ ] Row C4's gate projection carries no message text, so routing it through
      the pipeline cannot expose transcript content to any new surface.
- [ ] Transcript content stays quoted data: row D2 keeps the skill's
      treat-everything-as-data instruction and strengthens it with a per-message
      provenance flag the model cannot edit.

## Acceptance criteria

- [ ] **AC1 — the admitted set is unchanged (Table C row C1).** For a fixture
      corpus exercising all five exclusion arms, `collectExtracts` returns
      `entries`, `processed`, `deferred`, `deadlineDeferred`, `readDeferred`,
      `oversized`, `newlyQuarantined` and `oversizedExtracts` that deep-equal
      what the base commit returns for the same corpus, ledger and
      `maxInputBytes` — including a case where the projected extracts would have
      let another session fit and it is **not** admitted. Its RED proof reddens
      on measuring admission against the projected extract.
- [ ] **AC2 — what is written, and the memo (Table C rows C2, C3).** Each
      scratch file is the projection, byte-identical to the literal above for
      the literal input; a session whose projection retains no messages is still
      written with an empty `messages` array and appears in `entries` and
      `wrote`; an oversized memo written by the base commit is still honoured
      unchanged after this package, and no memo record gains a field.
- [ ] **AC3 — the dry-run names both numbers (Table C row C5).** `dream --dry-run`
      prints both lines of row C5 byte-exactly, with the second naming the
      configured limit, performs no model call and writes nothing.
- [ ] **AC4 — the gate reads the original timeline (Table D row D1).** With a
      Claude session whose primary dialogue contains no tool record but whose
      original timeline has an external `tool_result` inside the skill's
      invocation window, `promote` still raises that ledger entry's
      `derived_from_untrusted`; a ledger entry counting a Claude session that
      did not invoke the skill is still reverted; and a run in which the brain
      writes a file into the scratch directory still reaches the same gate
      verdicts. Its RED proof reddens on rebuilding `extractsBySession` from the
      scratch files.
- [ ] **AC5 — the skill's contract (Table D rows D2–D4).** `SKILL.md` documents
      the projection's message shape including `derived_from_untrusted`, states
      the Phase 2 rule in terms of that flag rather than of a role, instructs
      the model not to infer an invocation outcome from absent evidence, and
      contains **zero** occurrences of `skill_invocations` (3 today), of
      `errored` (3 today), and of `tool_result` (8 today, including the three
      easily missed sites `:93`, `:187` and `:292`).
      `src/core/runtime-skill-digests.json` changes exactly one entry.
- [ ] **AC6 — the ADR amendment (Table D row D5).** `docs/adr/0020-skill-revision-lifecycle.md`
      ends with the block above appended byte-for-byte in the stated position,
      its `Status:` line reads exactly
      `Status: **PROPOSED — awaiting owner signature.**`, and the file contains
      no sentence stating that the owner approved, accepted, ratified or signed
      it.
- [ ] **AC7 — the admitted-count measurement (Table C row C1).** Manual
      evidence, recorded in a dated `docs/specs/logbook/` entry: run the base
      commit's collector and this package's collector over the **same**
      representative backlog, against a **disposable copy** of the transcript
      ledger and a temporary state directory — never `~/.wienerdog/state`, never
      the live ledger, never a scheduled run — and record (i) the admitted
      session count and the admitted session-id list from each, which row C1
      requires to be identical, and (ii) the total scratch bytes from each,
      which is this package's value claim. If the two admitted lists differ, row
      C1 is violated: stop and report it rather than adjusting the claim. Record
      the corpus size, the configured `maxInputBytes` and both totals; copy no
      transcript content into the repo.
- [ ] **Idempotency:** running `wienerdog dream --dry-run` twice writes nothing
      either time, and running the collector twice over an unchanged corpus and
      ledger writes byte-identical scratch files. A transcript already marked
      processed and unchanged is not reprocessed by this package.

## Verification steps (run these; paste output in the PR)

### Current-state checks — runnable before implementation

```bash
git rev-parse HEAD
git log --oneline 05f1f55d..HEAD -- src/cli/dream.js src/core/dream/scratch.js
rg -n "Buffer.byteLength\(JSON.stringify\(extract\)\)|writeFilePrivate\(scratchFile|total input bytes" src/core/dream/scratch.js src/cli/dream.js
rg -n "extractsBySession" src/cli/dream.js src/core/dream/validate.js
rg -n "skill_invocations|tool_result" skills/wienerdog-dream/SKILL.md
npm test -- tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/dream-skill-structure.test.js
```

### Implementation checks — these must pass before the PR

```bash
node -e "const t=require('./src/core/transcripts'); if (typeof t.parsePrimaryWithOutcome !== 'function') { console.error('predecessor WP has not landed'); process.exit(1); } console.log('predecessor present');"
test -f skills/wienerdog-dream/SKILL.md && ! rg -q "skill_invocations|tool_result|errored" skills/wienerdog-dream/SKILL.md
test -f docs/adr/0020-skill-revision-lifecycle.md && rg -qF 'Status: **PROPOSED — awaiting owner signature.**' docs/adr/0020-skill-revision-lifecycle.md
test -f docs/adr/0020-skill-revision-lifecycle.md && ! rg -qi "owner (approved|accepted|ratified|signed)" docs/adr/0020-skill-revision-lifecycle.md
npm test -- tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/dream-skill-structure.test.js tests/unit/dream-validate.test.js tests/integration/dream.test.js
npm test
npm run lint
npm run red-proofs -- --wp WP-dream-primary-dialogue-collection
node scripts/boundary-check.js docs/specs/WP-dream-primary-dialogue-collection.md src/core/dream/scratch.js src/cli/dream.js skills/wienerdog-dream/SKILL.md src/core/runtime-skill-digests.json docs/adr/0020-skill-revision-lifecycle.md tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/dream-skill-structure.test.js tests/integration/dream.test.js tests/red-proofs/dream-primary-collection.proofs.json tests/red-proofs/dream-primary-collection-pipeline.proofs.json
git diff --check
```

The second, third and fourth commands are **guarded** on purpose: a bare
negated `rg` exits 0 when the file is missing, so the check would read greenest
exactly where the work was never done. `test -f` runs first, and each line fails
if its file is absent.

## Out of scope (do NOT do these)

- Any model call, relevance selection, new runtime profile, descriptor binding
  or supervision change — `WP-dream-primary-dialogue-filter`, parked behind an
  offline evaluation of this package's output.
- Editing `src/core/dream/validate.js`, `src/core/dream/ledger.js` or
  `src/core/dream/promote.js`. Row C3 is the reason `ledger.js` needs no change;
  row D1 is the reason `validate.js` needs none. If either turns out to be
  false, stop and say so — do not widen the boundary.
- Fixing the assessment's finding F1 (admission is marked processed without
  examination), adding a per-session completion result, a session-count bound, a
  lower default `dream_max_input_bytes`, a coverage report, or an access report.
- Any replay, migration or `--reprocess` of already-processed transcripts, and
  any edit to `~/.wienerdog/state/transcript-ledger.json` outside a test's
  temporary directory.
- Editing `docs/runbooks/codex-review.md` or any other runbook. A work package
  does not amend the review process.
- Restoring tool text to any surface, changing `MAX_MSG_CHARS`/`MAX_MESSAGES`,
  or changing the exclusion-arm console lines owned by
  `WP-dream-report-run-skips`.

## Dispatch precondition — owner items

Neither item blocks drafting. Both must be answered before this spec moves to
`Ready`. Nothing here records an owner decision; these are questions.

1. **Does `dream_max_input_bytes` bound transcript INTAKE or model-visible
   OUTPUT?** *Recommendation:* intake (row C1). The scope record
   (`docs/specs/logbook/2026-09-17-dream-primary-input-scope.md`) reads
   "Preserve the existing X as an admission bound on the resulting normalized
   primary extracts", which can be read the other way; the recommendation
   follows that same record's own principle one level up — "without admitting
   more sessions simply because filtering freed space" — applied to the
   projection rather than only to the later model filter. Measuring intake makes
   the admitted session set provably identical to today's, which is what lets
   this package promise it cannot worsen F1. *Cost of overruling,* priced: (a)
   the measured quantity changes, so every existing `oversizedExtracts` memo
   becomes wrong and row C3 is replaced by a format discriminator — an optional
   `extractFormat` field the collector accepts only as the literal
   `primary-dialogue-v1`, which puts `src/core/dream/ledger.js` and
   `tests/unit/ledger*.test.js` back into the boundary; (b) more sessions fit
   the same bound and are marked processed unread, so F1 gets worse by whatever
   factor AC7's measurement reports — the maintainer feedback requires this be
   answered with a lower default X, a session-count bound, or an explicit
   acceptance; (c) a session-count bound would classify its remainder through
   the existing capacity arm, whose console line at `src/cli/dream.js:782-783`
   tells the user to "raise `dream_max_input_bytes`" — advice that would no
   longer release those sessions — so it also requires rewording that line and
   re-checking `WP-dream-report-run-skips`'s row B4 and B12 bullets, which are
   that package's surface, not this one's. Recommending intake is what keeps all
   three of those out of this package.
2. **Is the ADR-0020 consequence accepted?** *Recommendation:* yes — the
   amendment text above states it plainly: a skill usage or failure visible only
   in tool records will no longer become a learning, so fewer learnings are
   proposed and some real ones are missed, in exchange for input the model can
   actually read. *Cost of overruling:* the only way to keep those observations
   is to put tool-derived metadata back in front of the model, which the owner's
   own scope record excludes for this iteration, or to build a separate
   tool-evidence surface, which it also excludes. There is no middle option
   inside this boundary.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. AC7's
   measurement is recorded in a dated `docs/specs/logbook/` entry and linked
   from the PR.
2. Conventional commits; PR titled
   `feat(dream): collect primary dialogue into scratch (WP-dream-primary-dialogue-collection)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
