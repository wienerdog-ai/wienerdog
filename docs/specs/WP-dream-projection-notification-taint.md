---
id: WP-dream-projection-notification-taint
title: Flag the records Claude Code labels as task notifications as untrusted in the primary dialogue
status: Draft
model: opus
size: S
depends_on: [WP-dream-primary-dialogue-projection, WP-dream-projection-done-spec-errata]
adrs: [ADR-0004, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-projection-notification-taint: Flag the records Claude Code labels as task notifications as untrusted in the primary dialogue

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **DRAFT — IN ITS DESIGN ROUND.** Commissioned by the owner on 2026-09-27
> (`docs/specs/logbook/2026-09-27-owner-ruling-harness-records-option-iii.md`:
> "option 3, and commission the flag-not-decline design"). The round record is
> `docs/specs/logbook/2026-09-27-projection-notification-taint-design-review.md`
> (**the round record**); its §0 STOP CRITERION was committed before this
> file. Only the Codex design gate's outcome and the owner move this spec
> further. **Dispatch additionally waits for the owner's rulings on the three
> owner items at the end.** Written against `main` at `67359a5e`.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process
that outlives its call, and this package adds no process, file, command or
setting. The nightly **dream** reads recent session **transcripts**, writes a
bounded extract of each into a private scratch directory, and asks one
consolidation pass (the dream skill, `skills/wienerdog-dream/SKILL.md`) to
update a private copy of the user's **vault**; code then validates and
promotes what it wrote. The extract holds only **primary dialogue**, produced
by the pure function `createPrimaryProjection` in
`src/core/transcripts/primary-dialogue.js` (Done package
`WP-dream-primary-dialogue-projection`, spec
`docs/specs/done/WP-dream-primary-dialogue-projection.md` — **the Done
spec**). The function sees every record of a transcript in order and emits
messages `{role, text, ts, derived_from_untrusted}`.

**How `derived_from_untrusted` is set today** (the Done spec's row A5,
`:461`, and its ordered procedure, row A5e, `:468`). (a) A user message is
`false`, always, by role. (b) An assistant message carries a **taint state**
that starts `false` and is set `true` permanently by tool output (a Claude
`tool_result` content block) or by a context gap; once set, nothing lowers
it. Row A5e runs, per record: step 2 validates the record's schema (a failure
taints and ends the record); step 3 sets the state on a `tool_result` block
and continues; step 4 asks whether row A2 accepts the record as dialogue;
step 5 emits it — user `false`, assistant the current state. The dream skill
then computes each memory candidate's provenance mechanically: `true` if any
supporting message is `true` (`SKILL.md:109-115`), and code refuses any
identity or skills (Tier-3) write that is not `false`
(`src/core/dream/validate.js:191-216`).

**The gap this package closes.** When a subagent or background task finishes,
Claude Code writes its result into the transcript as a `user` record — a
**task notification** — and labels it: the record's top-level `origin` field
is an object whose `kind` is `"task-notification"` (the person's own prompts
carry `kind: "human"`). Row A2 accepts it as the person's words, so a
subagent's result — which may restate web pages, email or other external
content — reaches the dream flagged `false`, as if the person had said it.
Measured on the owner's whole local corpus (round record §2; 334 Claude files,
Claude Code 2.1.232–2.1.283; counts only, no text read): **1,107 of 1,107**
labelled records are emitted as user messages flagged `false` today.

**What the owner decided, and what this package builds.** A sibling design
tried to *decline* harness-authored records by their source fields
(`docs/specs/done/WP-dream-projection-harness-user-records.md`, now
Superseded). Declining on an undocumented field needs a safety net — a renamed
field would consume every request — and three design rounds could not close
that net. The owner chose (iii), build nothing on the decline rule, and
commissioned this narrower design: **decline nothing; flag the one class
Claude Code positively labels as a task notification `true`, and let that
record taint what follows, as a `tool_result` does** (Table N). Nothing is
removed from the projection: the notification stays, with its text, flagged.

**The central property: fail-open by construction, so there is no net.** The
rule only ever *raises* a flag, and only on a record carrying one exact label.
If Claude Code drops, renames or re-cases that label, the record falls out of
the class and is projected exactly as the Done contract projects it today —
`false` by role, the state untouched (Table N row N4). That degraded state is
the state the owner accepted on 2026-09-27 as option (iii)'s baseline, and
`false` never claimed human authorship (the Done spec's row A5b, `:462`), so
the fallback breaks no promise and loses nothing. No detector, counter,
quarantine, halt or retry exists or is needed; the round record's §0 treats
any finding that asks for one as a refutation of this design, not a patch.

**Why a harness label is not the heuristic the Done spec ruled out.** That
spec ruled, for routine prompts (`:563-567`): *"Do not add a heuristic (a
project-directory name, a prompt prefix) to invent one … a wrong heuristic
would be worse than the known limitation."* A project directory and a prompt
prefix are **inferences** from data that is not about authorship. `origin` is
the harness's own **declaration** of where the record came from, on the
record's top level. Table N compares one of its values for exact equality —
the same kind of rule row A2 already applies to `type`, `isMeta`,
`isSidechain`, `message.role` and `stop_reason`. The decision never reads
`message.content`, so the module's statement *"no heuristic over message
CONTENT — every decision below reads structure only"*
(`primary-dialogue.js:10-11`) stays literally true. The same argument, for
`promptSource` and `origin` together, is in
`docs/specs/logbook/2026-09-26-projection-harness-user-records-design-review.md`
§2 and §5; its §2.3 also shows the label and the `<task-notification>` text
prefix coincide on 1,103 of 1,103 records, so the exact label loses nothing a
prefix test would find.

**The taint decision, on evidence.** A task notification is external content
by definition — a subagent's output — which is exactly what the taint state
exists to follow. The reply after it usually restates it. So the record sets
the state (row N2), not only its own flag. Measured cost: every one of the
1,107 labelled records on the corpus already arrives with the state set (most
likely because the task was launched by a tool call whose `tool_result` set it
first — the cause itself is not measured), and with the rule simulated the
digest over all 1,995 assistant messages and their flags is **identical**
(round record §2). Row N2 therefore changes no
assistant flag today; it closes the case where no earlier tool output set the
state — a continuation file, or a harness change in how tasks are launched.
Owner item 1 carries this with its cost.

**What this does to the dream skill and to the gates** (round record §3).
The skill needs no edit: its "explicit user signal" rule already counts only a
`user` message *never* carrying `derived_from_untrusted: true`
(`SKILL.md:100-101`), so a flagged notification cannot count as the person
asking to remember something; its provenance rule is role-agnostic, so a
candidate supported by a flagged notification is `true` and cannot reach
Tier 3. The learnings-ledger gate (`validate.js:510-527`, `:627-649`) reads only
`gateExtract` — the raw timeline's roles, text-free — which this package never
touches (row N5); the raw parser records a string-content notification as
role `user` (`claude.js:148-152`), so the gate neither gains nor loses a taint
source and **no gate verdict changes**. The only verdict that moves is the
model-asserted provenance of a candidate a notification supports, and it
moves up.

**Where the Done spec's owner item 3 stands.** That item (`:946-966`) priced
*tainting user messages in general* — from the first tool record onward,
nothing the person says could reach identity or skills again — and
recommended against it. This package does not do that. It flags one
positively labelled class: on the corpus, all 1,107 of its records open with
the harness's `<task-notification>` markup and no unlabelled record does, and
the 453 records labelled `kind: "human"` and every record without `origin` are
untouched (round record §2). Erratum 10 records the narrowing
against rows A5(a), A5(b) and A5e.

## Current state

Every citation re-derived at `main` = `67359a5e`, both ends printed (round
record §3). **After `WP-dream-projection-done-spec-errata` lands, every Done
spec line number below `:102` moves down by the length of its errata block (43
lines as drafted); the anchors used by Exact contracts are text, not line
numbers.**

- `src/core/transcripts/primary-dialogue.js` (312 lines).
  - `:10-11` — `// call here and no heuristic over message CONTENT — every
    decision below reads structure only (spec Table A).` (the statement this
    package keeps true).
  - `:51-54` — `isPlainObject(value)`: true for a plain object, never an array
    or null.
  - `:96-117` — `claudeShape(obj)`, row A5c for Claude. `:99-108`: a `user`
    or `assistant` record whose `message` is not a plain object is
    UNCLASSIFIABLE, so after step 2 a `user` record's `message` is a plain
    object.
  - `:179-202` — `acceptClaude(obj)`, rows A2/A4; its user half `:183-193`
    (`:184` `isMeta`, `:185` `message.role`).
  - `:243-307` — `record(obj)`, row A5e steps 2–5. STEP 2 `:264-283`. STEP 3
    `:285-294`; its Claude arm is `:292-294`:

    ```js
        } else if (blocks !== null && blocks.some((block) => block.type === 'tool_result')) {
          tainted = true;
        }
    ```

    STEP 4–5 `:296-306`; the comment `:296-298` says *"a user message is
    `false` BY ROLE, whatever the state is"*, and `:305` is, after six spaces
    of indentation, exactly
    `derived_from_untrusted: accepted.role === 'user' ? false : tainted,`
- `src/core/transcripts/index.js:267-274` builds `gateExtract` from the raw
  capped extract only (roles, no text); the projection's messages never reach
  it. `:221-229` is its typedef.
- `src/core/transcripts/claude.js:141` feeds every parsed record to the
  projection; `:148-152` records a string-content `user` record (no `isMeta`)
  as role `user` in the raw timeline.
- `src/core/dream/validate.js:510-527` (`invocationWindowTainted`) and
  `:627-649` (ledger rule (h)) derive the ledger flag from `tool_result` roles
  in `gateExtract`; `:191-216` (`tier3Decision`) requires
  `derived_from_untrusted === false` on every Tier-3 write.
- `skills/wienerdog-dream/SKILL.md:100-101` (explicit user signal, never a
  `true` message) and `:109-115` (provenance rule).
- The Done spec: `:461` row A5 (its clause (a) "`false`, always", its clause
  (b) listing what sets the state); `:462` row A5b; `:468` row A5e;
  `:563-567` the routine-prompt heuristic ruling; `:946-966` owner item 3.
- **No committed test or fixture carries an `origin` key**, and nothing under
  `src/core/transcripts/` reads one (the first Current-state command below).
  With the rule simulated on `67359a5e` and no fixture changed, `npm test`
  stays at 3,083 tests, 0 fail (round record §4): **no existing test asserts a notification's
  flag or the following reply's flag, and no fixture needs a sweep.** The four
  pipeline tests built by `plantInvokingTranscript`
  (`tests/unit/dream-pipeline.test.js:2801-2818`) carry no `origin` either and
  are unaffected.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/primary-dialogue.js | Table N: `isTaskNotification` (N1), step 3 (N2), step 5 (N3); the step-5 comment |
| create | tests/fixtures/primary-dialogue/claude-task-notification.jsonl | the worked example below, byte for byte |
| create | tests/unit/primary-dialogue-notification.test.js | `[NT-AC1]`–`[NT-AC3]` |
| create | tests/red-proofs/projection-notification-taint.proofs.json | RED proofs P1–P7 |
| modify | docs/specs/done/WP-dream-primary-dialogue-projection.md | Erratum 10: F0–F4 verbatim; no other byte changes |

### Exact contracts

**The predicate (Table N row N1).** A module-level function in
`primary-dialogue.js`, beside `claudeShape`; its body exactly as below (its
JSDoc may say more):

```js
/** Table N row N1 (WP-dream-projection-notification-taint).
 *  @param {Object} obj a parsed Claude record that passed row A5e step 2
 *  @returns {boolean} */
function isTaskNotification(obj) {
  return obj.type === 'user'
    && obj.isMeta !== true
    && obj.isSidechain !== true
    && obj.message.role === 'user'
    && isPlainObject(obj.origin)
    && obj.origin.kind === 'task-notification';
}
```

It reads `type`, `isMeta`, `isSidechain`, `message.role`, `origin` and
`origin.kind`, and nothing else — never `message.content`, never
`promptSource`. `obj.message.role` is safe only because step 2 has already
returned for a `user` record whose `message` is not a plain object
(`claudeShape`, `:99-108`); the function is therefore called **only** from the
Claude arm, after step 2.

**Rows N2 and N3 in `record(obj)`.** Directly after the STEP 3 `if/else`
(`:290-294`), before STEP 4:

```js
    const notification = !codex && isTaskNotification(obj);
    if (notification) tainted = true;
```

and the step-5 flag (`:305`) becomes exactly

```js
      derived_from_untrusted: accepted.role === 'user' ? notification : tainted,
```

with the step-5 comment (`:296-298`) updated to say that a user message is
`false` by role unless it is a task notification (row N3), which is `true`.
Add a comment above the two step-3 lines naming Table N row N2 and why (a
notification is external content, as a `tool_result` is). Apart from the new
function, these lines and their comments, nothing in the file changes.

**Literal worked example.** `tests/fixtures/primary-dialogue/claude-task-notification.jsonl`,
exactly these six lines (synthetic; every value invented):

```jsonl
{"type":"user","sessionId":"nt-demo","cwd":"/w","timestamp":"2026-09-27T09:00:00.000Z","promptSource":"typed","origin":{"kind":"human"},"message":{"role":"user","content":"Start the background check."}}
{"type":"assistant","timestamp":"2026-09-27T09:00:05.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"Started it in the background."}]}}
{"type":"user","timestamp":"2026-09-27T09:01:00.000Z","promptSource":"system","origin":{"kind":"task-notification"},"message":{"role":"user","content":"<task-notification>The background check finished: SYNTHETIC SUBAGENT RESULT</task-notification>"}}
{"type":"assistant","timestamp":"2026-09-27T09:01:05.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"The check finished."}]}}
{"type":"user","timestamp":"2026-09-27T09:02:00.000Z","promptSource":"typed","origin":{"kind":"human"},"message":{"role":"user","content":"Thanks. Summarize it."}}
{"type":"assistant","timestamp":"2026-09-27T09:02:05.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"Summary."}]}}
```

`parsePrimaryWithOutcome` on it returns six messages, texts in file order, and

| | msg 1 user | msg 2 asst | msg 3 user (labelled) | msg 4 asst | msg 5 user | msg 6 asst |
|---|---|---|---|---|---|---|
| flags with this package | `false` | `false` | **`true`** (N3) | **`true`** (N2) | `false` | `true` |
| flags at `67359a5e`, and with `origin` removed from every line on either tree | `false` | `false` | `false` | `false` | `false` | `false` |

No tool output precedes the notification, so msg 4 is `true` through row N2
alone, and msg 6 stays `true` because the state never lowers. The second row
is the Done contract's output, and it is also what this package produces for
the file without its labels (row N4).

**Erratum 10 to the Done spec — copy verbatim.** `<DATE>` is the `YYYY-MM-DD`
date of the implementation commit. F0 **continues the existing errata
blockquote**: directly after its last line — the last line of Erratum 9 as
`WP-dream-projection-done-spec-errata` landed it, exactly
`> shape not observed in the wild.**` — insert one line that is exactly `>`
and then F0's lines, so the blank line and the
`<!-- errata above; the spec as it shipped follows -->` comment follow
unchanged (a blank line between two blockquotes fails markdownlint MD028).
F1–F4 are each inserted directly after the anchor named, with one leading
space, in the same line; each anchor occurs exactly once.

F0:

```text
> **Errata, <DATE> — filed by `WP-dream-projection-notification-taint`,
> whose Table N is canonical for everything this erratum restates.** Numbered
> on from the nine above.
>
> **Erratum 10 — a record Claude Code labels as a task notification is
> external content, and is flagged so.** *What changed:* one class of Claude
> record — top-level `type` `"user"`, no `isMeta: true`, no
> `isSidechain: true`, `message.role` `"user"`, and a top-level `origin`
> object whose `kind` is exactly `"task-notification"` — carries a subagent's
> or background task's result. From <DATE> it sets the taint state at row
> A5e step 3, as a `tool_result` block does, and a user message emitted from
> it carries `derived_from_untrusted: true`. The decision compares that one
> harness-written field for exact equality and never reads the content, so
> the routine-prompt note's ruling against heuristics is not engaged. *What
> did not change:* every other user message is `false` by role, and owner
> item 3's recommendation stands for them; no message is removed, added,
> reordered or re-worded; `gateExtract`, `intakeBytes` and `parse` are
> unchanged. If Claude Code drops or renames the label, those records project
> exactly as before this erratum; `false` never claimed human authorship (row
> A5b), so that fallback breaks no promise. *Why:* before it, 1,107 of 1,107
> labelled records in the owner's local corpus reached the dream flagged
> `false` (`docs/specs/logbook/2026-09-27-projection-notification-taint-design-review.md`
> §2). **Class: a provenance rule narrowed for one positively labelled
> class.**
```

F1 — in row A5, after the anchor
``**(a) A user message accepted under A2 or A3 is `false`, always — regardless of anything earlier in the session, including tool output and context gaps.**``:

```text
(**Except one from a record Claude Code labels as a task notification, which is `true` from <DATE> — see Erratum 10.**)
```

F2 — in row A5, after the anchor
`or a **context gap** as row A5a defines it.`:

```text
(**A labelled task notification sets it too, from <DATE> — see Erratum 10.**)
```

F3 — in row A5e, after the anchor
``for a Codex `response_item`)?``:

```text
(**A labelled task notification also taints here, from <DATE> — see Erratum 10.**)
```

F4 — in row A5e, after the anchor
`whatever the state is (row A5(a)).`:

```text
(**Except a labelled task notification's, which is `true` from <DATE> — see Erratum 10.**)
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 trigger fires on three of seven: **(iii)** structured input
classification changes — a record field is read for provenance; **(vi)**
downstream consumers inherit it — the dream skill's provenance rule, the
Tier-3 gate, and the Done spec's rows A5/A5e; **(vii)** the same facts appear
in the code, the worked example, the acceptance criteria, the RED register,
the measurement script and Erratum 10. **Table N is the single place its
facts are decided**; every other surface cites it.

### Contract table(s)

#### Table N — records Claude Code labels as task notifications (canonical)

| Row | Contract | Rule |
|-----|----------|------|
| N1 | The class — **what we accept, enumerated** | A **Claude** record that passed row A5e step 2 and for which **all** hold: top-level `type` is exactly `"user"`; `isMeta` is not `true`; `isSidechain` is not `true`; `message.role` is exactly `"user"`; top-level `origin` is a plain object; `origin.kind` is exactly the string `"task-notification"`. One label, one value, exact and case-sensitive. Reads no other field and never `message.content`. Never applied to a Codex rollout. |
| N2 | Taint | At row A5e **step 3**, after the existing `tool_result` check and before step 4, a record in N1 sets the monotonic taint state, whether or not step 4 then accepts it. Execution continues. |
| N3 | Emission | At **step 5**, a user message emitted from a record in N1 carries `derived_from_untrusted: true`. Every other user message is `false` by role (the Done spec's row A5(a), unchanged). An assistant message carries the current state (row A5(b), unchanged; N2 may have raised it). |
| N4 | Fail-open — the central property | A record **not** in N1 — `origin` absent, `null`, a string, an array, an object without `kind`, `kind` any other value (including `"human"`, a re-cased or renamed label), or a labelled record with `isMeta`, `isSidechain` or another `message.role` — is projected **exactly** as the Done contract projects it: no flag change and no taint. There is no detector, counter, diagnostic, quarantine, halt or retry, and none may be added under this package. |
| N5 | Raise-only | The rule never removes, adds, reorders or re-words a message, never changes a `ts`, never lowers a flag, and never changes `gateExtract`, `intakeBytes`, `parse` or the extract's metadata. The only values it may change are `derived_from_untrusted` values, and only from `false` to `true`. |

### Mirrored Surface Checklist

Registered mirrors of Table N, each deferring to it; a change to a row updates
every mirror in the same commit:

- [ ] **Deliverables cells:** the `primary-dialogue.js` row (N1–N3) and the
      Done-spec row (Erratum 10).
- [ ] **Exact contracts:** the predicate block (N1), the step-3 and step-5
      blocks (N2, N3), the worked example's two flag rows (N1–N4), F0–F4
      (N1–N5).
- [ ] **Acceptance criteria:** AC1 (N1–N3), AC2 (N1, N4), AC3 (N5), AC4
      (Erratum 10).
- [ ] **RED register:** P1 (N3), P2 (N2), P3–P6 (N1, N4), P7 (N5 and the
      owner's flag-not-decline ruling).
- [ ] **Verification:** the measurement script's class test (its N1 copy:
      `origin` a plain object with `kind` exactly `"task-notification"` on an
      A2-gated `user` record) and its `--strip-origin` device (N4); the
      Current-state `origin` grep.
- [ ] **Current state:** the citations of step 3, step 5 and `claudeShape`.
- [ ] **Operative prose:** Context ("central property", "taint decision",
      "dream skill and gates", "owner item 3"), Implementation notes, the
      Security checklist, owner items 1–3.
- [ ] **Outside this spec, edited by it:** Erratum 10 and its markers F1–F4
      in the Done spec; the JSDoc of `isTaskNotification` and the step-3 and
      step-5 comments in `primary-dialogue.js`.
- [ ] **Outside, deliberately not edited:** `skills/wienerdog-dream/SKILL.md`
      (its rules for `true` are already role-agnostic — Context); the Done
      spec's owner item 3 and its acceptance criteria (records of what
      shipped; Erratum 10 speaks for them); `primary-dialogue.js:8-9`'s
      "harness-authored … instructions are not dialogue at all" (Erratum 7's
      named gap, not this package's).

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, no build step** (CLAUDE.md). Plain
  Node ≥ 18 with JSDoc.
- **Enumerate our own good.** N1 names the one label we accept. Do not
  replace it with a negative ("any `kind` that is not `human`"): that flags
  every future kind by default, and a renamed `human` label would then flag
  every prompt the person types `true` — silently ending Tier-3 learning from
  their words, the cost the Done spec's owner item 3 priced (owner item 3
  below).
- **Do not read the content.** A text-prefix test (`<task-notification`)
  would find the same records today (round record §2) but defeats N4: with the
  label gone, a record whose text merely looks like a notification — including
  one the person typed — would still be flagged. RED proof P4 pins this.
- **Do not decline.** The owner ruled flag, not decline. A notification stays
  in the projection with its text; P7 pins this.
- **Claude only.** Keep `!codex &&` at the call site: a Codex rollout never
  carries the label, and without the guard a Codex record shaped like one is
  read — and one with no `message` object throws, because Codex step 2 does
  not validate a top-level `user` type. P6 pins this.
- **The test file is new**, not an edit to `tests/unit/primary-dialogue.test.js`
  (a Done package's suite). The new fixture file is also picked up by that
  suite's `[AC4]` return-value invariants, which loop over every committed
  `.jsonl` fixture in the directory; they must stay green.
- **RED-proof register (ADR-0042).** One declaration file, suite
  `tests/unit/primary-dialogue-notification.test.js`, every `testNamePattern`
  `\[NT-AC`, every `occurrences` 1. The `find` strings below name the drafted
  code and **the `expectRed` sets are DERIVED** — obtained by running the lane
  against the draft on a simulated tree (round record §4), not predicted. If
  your code differs, keep each mutation's meaning, re-derive `find` and
  `expectRed` by running the lane, and record that under "Decisions made".
  Each `find` is the whole drafted line **including its leading indentation**
  (the Indent column: 4 or 6 spaces, as in the Exact-contracts blocks), shown
  here without it.

  | Id | Pins | Mutation (meaning) | `find` (drafted) | Indent | Derived `expectRed` (test tag → signal substring) |
  |----|------|--------------------|------------------|--------|------------------------------------------------|
  | `nt-p1-notification-flag-removed` | N3 | step 5 back to `false` by role | `derived_from_untrusted: accepted.role === 'user' ? notification : tainted,` | 6 | NT-AC1 → `nt-ac1 :: flags` |
  | `nt-p2-notification-taint-removed` | N2 | the step-3 taint line removed | `if (notification) tainted = true;` | 4 | NT-AC1 → `nt-ac1 :: flags` |
  | `nt-p3-label-not-exact` | N1 | `kind` any string | `&& obj.origin.kind === 'task-notification';` | 4 | NT-AC1 → `nt-ac1 :: flags`; NT-AC2 → `:: equals the unlabelled projection` |
  | `nt-p4-content-heuristic` | N1, N4 | the two `origin` clauses replaced by a `<task-notification` text-prefix test | the two lines `&& isPlainObject(obj.origin)` and `&& obj.origin.kind === 'task-notification';`, with the newline between them | 4 | NT-AC1 → `nt-ac1 :: array flags`; NT-AC2 → `nt-ac2 no label :: the Done contract flags` |
  | `nt-p5-ismeta-gate-dropped` | N1 | the `isMeta` clause made `true` | `&& obj.isMeta !== true` and its newline | 4 | NT-AC2 → `nt-ac2 labelled but isMeta :: equals the unlabelled projection` |
  | `nt-p6-codex-guard-dropped` | N1 | `!codex &&` removed | `const notification = !codex && isTaskNotification(obj);` | 4 | NT-AC2 → `nt-ac2 codex` |
  | `nt-p7-notification-declined` | N5 | row A2's user half declines a labelled record | `if (obj.isMeta === true) return null;` | 6 | NT-AC1 → `nt-ac1 :: texts`; NT-AC3 → `nt-ac3 :: roles, texts and timestamps` |

  Each `expectRed[].test` is the full test title, e.g.
  `primary-dialogue: [NT-AC1] a record Claude Code labels as a task notification is flagged, and taints what follows`;
  the assertion messages carry the signal substrings above.
- **When uncertain:** choose the simpler option and record it under
  "Decisions made". Do not add a diagnostic, counter or fallback to resolve an
  ambiguity — N4 forbids it.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] **Untrusted input:** the transcript record is attacker-influenced JSON.
      The predicate compares values for strict equality and reads a property
      of `obj.origin` only after `isPlainObject(obj.origin)`; it never
      coerces, never iterates, never recurses, and flows nothing into a path
      or a shell. `obj.message` is read only after step 2 guaranteed it is a
      plain object (Claude arm only — the `!codex` guard).
- [ ] **Direction of every change is toward caution:** a forged label can
      only make a record `true`, which only narrows what can reach Tier 3,
      and an erased label returns the record to today's `false`. No input can make any flag `false` that
      is `true` at `67359a5e` (N5, AC3).
- [ ] No identifier from the record flows into a filesystem path or a shell
      command.

## Acceptance criteria

- [ ] **AC1 — the class is flagged and taints** (`[NT-AC1]`): the worked
      example projects to its six texts and the first flag row exactly; the
      same file with the labelled record's content replaced by an array
      holding one `text` block projects to the same flags (content-free).
- [ ] **AC2 — fail-open** (`[NT-AC2]`): the worked example with `origin`
      removed from every line projects to the second flag row (all `false`);
      and for each of the N4 variants of the labelled record — `origin`
      absent, `null`, a string, an array, `{}`; `kind` `"Task-Notification"`,
      `"task_notification"`, `"human"`; the labelled record with
      `isMeta: true`, with `isSidechain: true`, with `message.role`
      `"assistant"` — the projection's extract equals the projection of the
      same lines with `origin` removed from every line (`source_path`
      excluded from the comparison). A Codex rollout containing a top-level
      `{"type":"user","origin":{"kind":"task-notification"},…}` record between
      an accepted user message and a final answer projects without throwing,
      with flags `[false, false]`.
- [ ] **AC3 — raise-only** (`[NT-AC3]`): for the worked example against the
      same lines with `origin` removed: roles, texts and `ts` are equal in
      order; the extract's metadata, `gateExtract` and `parse` are
      deep-equal; and no flag is `false` where the unlabelled projection's is
      `true`.
- [ ] **AC4 — Erratum 10**: F0–F4 are in the Done spec verbatim, `<DATE>`
      replaced; removing them yields the base file byte for byte.
- [ ] **AC5 — nothing else moved:** `npm test` passes with no existing test
      or fixture edited; `npm run red-proofs -- --wp WP-dream-projection-notification-taint`
      reports all seven proofs `PROVEN`; the lane for
      `WP-dream-primary-dialogue-projection` still reports all ten `pdp-*`
      proofs `PROVEN`.
- [ ] Idempotence: `N/A — the package ships a pure projection rule, no command
      and no write outside the repo`.

## Verification steps (run these; paste output in the PR)

### Current-state checks — before implementation

```bash
# No committed test or fixture, and no projection code, reads an `origin` key:
test -d tests && ! grep -rnE '"origin" *:|origin: *\{|\\"origin\\"' tests && ! grep -rnw 'origin' src/core/transcripts && echo "current-state: no origin anywhere"
# On a machine with Claude transcripts holding task notifications, today's tree
# flags them false (exit 1, last line NOT IN EFFECT). Counts only; no text printed.
node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js --days 5; echo "exit $?"
```

### Implementation checks — these must pass before the PR

```bash
npm test
npm test -- --test-name-pattern '\[NT-AC'
npm run red-proofs -- --wp WP-dream-projection-notification-taint 2>&1 | grep -E '^(PROVEN|FAILED) '
npm run red-proofs -- --wp WP-dream-primary-dialogue-projection 2>&1 | grep -E '^(PROVEN|FAILED) '
node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js --days 5; echo "exit $?"
node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js --days 5 --strip-origin | grep -q 'user messages flagged true 0 ' && echo "fail-open: with the label gone, no user message is flagged"
node - <<'EOF'
const fs = require('fs');
const { execSync } = require('child_process');
const F = 'docs/specs/done/WP-dream-primary-dialogue-projection.md';
const base = execSync(`git show "$(git merge-base HEAD main)":${F}`).toString();
let cur = fs.readFileSync(F, 'utf8');
const fail = (m) => { console.error(m); process.exit(1); };
if (cur.includes('<DATE>')) fail('a <DATE> placeholder remains');
const inline = [
  / \(\*\*Except one from a record Claude Code labels as a task notification, which is `true` from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*A labelled task notification sets it too, from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*A labelled task notification also taints here, from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*Except a labelled task notification's, which is `true` from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
];
for (const re of inline) {
  if ((cur.match(re) || []).length !== 1) fail(`inline marker not exactly once: ${re}`);
  cur = cur.replace(re, '');
}
const head = '> shape not observed in the wild.**\n';
if (cur.split(head).length !== 2) fail('the Erratum 9 anchor is not exactly once');
const a = cur.indexOf(head) + head.length;
const b = cur.indexOf('\n\n<!-- errata above; the spec as it shipped follows -->');
const f0 = cur.slice(a, b + 1);
if (!/^>\n> \*\*Errata, \d{4}-\d{2}-\d{2} — filed by `WP-dream-projection-notification-taint`,\n/.test(f0)) fail('F0 not found');
cur = cur.slice(0, a) + cur.slice(b + 1);
if (cur !== base) fail('other bytes changed');
console.log('erratum 10: exact');
EOF
node scripts/boundary-check.js docs/specs/WP-dream-projection-notification-taint.md $(git diff --name-only "$(git merge-base HEAD main)" | grep -v '^docs/specs/logbook/')
npm run lint
```

Expected: `npm test` 0 fail; the two red-proof greps print only `PROVEN`
lines (seven proofs and three criteria for this package; ten proofs and their
criteria for the other), each run ending `RUN: FILTERED`, as a `--wp` run
does; the measurement script exits 0 with the last line
`in effect: N emitted task notifications, none flagged false`; the fail-open
line prints; `erratum 10: exact`; the boundary check exits 0; lint passes.
The measurement lines are **local re-measurements**, not gates: on a machine
with no task notifications they pass vacuously (`in effect: 0 …`), so paste
their output. Each check was observed on both sides at drafting (round record
§4).

## Out of scope (do NOT do these)

- **Declining any record**, and any safety net — superseded by the owner's
  ruling; `docs/specs/done/WP-dream-projection-harness-user-records.md`.
- **Any other harness-authored record** — command echoes, `!`-command records,
  compaction and interruption records keep today's behaviour (Erratum 7's
  named gap, `WP-dream-projection-done-spec-errata`).
- **Any other `origin.kind` value** (owner item 3), and `promptSource`.
- **Codex.** No equivalent label is known; the pre-0.151 rollouts that project
  replies without requests stay routed as their own candidate.
- **`skills/wienerdog-dream/SKILL.md`** — needs no edit (Context).
- **`src/core/dream/validate.js` and `gateExtract`** — the learnings-ledger
  gate reads raw roles; a task notification inside a skill's invocation window
  does not taint that gate's derived flag (it did not before either). Named
  residual, recorded for a later package if wanted; the model-asserted flag
  on that ledger entry is now `true` through the flagged message.
- **Any diagnostic or counter of the label's presence** — owner item 2.

## Dispatch precondition — owner items

**Citations.** Written against `main` at `67359a5e`; re-run every `file:line`
citation, at both ends, before dispatch (`docs/runbooks/codex-review.md`,
"Dispatch-time re-verification"). `WP-dream-projection-done-spec-errata` must
have landed first (F0's anchor is its last line).

Each item is a recommendation with its cost; nothing here records an owner
decision. **Dispatch waits for the owner's rulings on all three; the design
gate and `Ready` do not.**

1. **Should a task notification also taint what follows (row N2), or only be
   flagged itself?** *Recommendation:* taint. A notification is a subagent's
   output — external content — and the reply after it usually restates it;
   the taint state exists to follow exactly that. Measured: all 1,107
   labelled records on the corpus already arrive with the state set, and the
   assistant digest is identical with the rule simulated, so N2 costs nothing
   today and covers a continuation file or a harness change in how tasks are
   launched. *Cost of overruling:* none measured; the reply after an
   untainted notification would stay `false`. Overruling is the round
   record's §0 fallback level 1 (drop N2, P2 and AC1's reply assertion).
2. **No diagnostic for the label disappearing.** If Claude Code drops or
   renames `origin.kind: "task-notification"`, notifications silently return
   to `false`. *Recommendation:* accept that. The degraded state is option
   (iii)'s baseline, which the owner accepted on 2026-09-27; the measurement
   script (`--days N`) shows the class count on demand. *Cost of overruling:*
   a counter or warning is a net — the mechanism three harness-records rounds
   could not close — and would need its own package, a surface
   (`reports/warnings.md` or `doctor`) and a threshold; it would detect a
   return to a state already ruled acceptable.
3. **Flag exactly one label.** On the corpus, the `user` records that pass
   row A2's user-half gates carry exactly three `origin` states: absent (12,219 records),
   `kind: "human"` (453) and `kind: "task-notification"` (1,107).
   *Recommendation:* flag only `"task-notification"`, and let any future kind
   project as today until a later package names it. *Cost of overruling:*
   flagging "any kind that is not `human`" flags unknown future kinds by
   default, but a renamed `human` label would then flag every prompt the
   person types `true` and silently end Tier-3 learning from their words —
   the cost the Done spec's owner item 3 priced, reached through a harness
   change instead of a design choice.

## Definition of done

0. **DISPATCH PRECONDITION.** The design gate has closed under the round
   record's §0; the owner has ruled on owner items 1–3;
   `WP-dream-projection-done-spec-errata` has landed; the citations are
   re-verified.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(transcripts): flag labelled task notifications as untrusted (WP-dream-projection-notification-taint)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
