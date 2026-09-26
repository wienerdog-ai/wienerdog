---
id: WP-dream-projection-notification-taint
title: Flag the records Claude Code labels as task notifications as untrusted, in the primary dialogue and the learnings-ledger gate
status: Draft
model: opus
size: M
depends_on: [WP-dream-primary-dialogue-projection, WP-dream-projection-done-spec-errata]
adrs: [ADR-0004, ADR-0020, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-projection-notification-taint: Flag the records Claude Code labels as task notifications as untrusted, in the primary dialogue and the learnings-ledger gate

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **DRAFT — IN ITS DESIGN ROUND (revision 1, after round 1).** Commissioned
> by the owner on 2026-09-27
> (`docs/specs/logbook/2026-09-27-owner-ruling-harness-records-option-iii.md`:
> "option 3, and commission the flag-not-decline design"). The round record is
> `docs/specs/logbook/2026-09-27-projection-notification-taint-design-review.md`
> (**the round record**); its §0 STOP CRITERION was committed before this
> file. Round 1 found that the learnings-ledger gate could still count a
> notification-bearing session as trusted; revision 1 closes that path in code
> (Table N rows N6–N7). Only the Codex design gate's outcome and the owner move
> this spec further. **Dispatch additionally waits for the owner's rulings on
> the four owner items at the end.** Written against `main` at `67359a5e`.

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
messages `{role, text, ts, derived_from_untrusted}`. The same single read
(`parsePrimaryWithOutcome` in `src/core/transcripts/index.js`) also returns a
**gate extract** — a text-free copy of the original timeline's message roles
and skill-invocation geometry — which the collector hands, in memory only, to
the code-owned learnings-ledger gate.

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

**How the learnings-ledger gate derives trust today** (ADR-0020's Decision,
`docs/adr/0020-skill-revision-lifecycle.md:88-100`). Each synthesized skill has
a `LEARNINGS.md` ledger; an entry that reaches three distinct Claude sessions
can authorize a revision of the skill's body. For every Claude session an
entry newly counts, code checks that the session really invoked the skill and
**derives** the entry's `derived_from_untrusted` from the session's gate
extract: if any message inside the skill's **invocation window** (from the
invocation to the next invocation or the end) has role `tool_result`, other
than the skill's own paired result, the session contributes untrusted, and a
ledger write that declares a lower value is refused whole
(`validate.js:510-527`, rule (h) `:627-649`).

**The gap this package closes.** When a subagent or background task finishes,
Claude Code writes its result into the transcript as a `user` record — a
**task notification** — and labels it: the record's top-level `origin` field
is an object whose `kind` is `"task-notification"` (the person's own prompts
carry `kind: "human"`). Row A2 accepts it as the person's words, so a
subagent's result — which may restate web pages, email or other external
content — reaches the dream flagged `false`, as if the person had said it.
Measured on the owner's whole local corpus (round record §2; 334 Claude files,
Claude Code 2.1.232–2.1.283; counts only, no text read): **1,107 of 1,107**
labelled records are emitted as user messages flagged `false` today. The
raw timeline records the same notification as an ordinary `user` role
(`src/core/transcripts/claude.js:148-152`), so the ledger gate cannot see it
either: a notification inside a skill's invocation window leaves the window
clean, and a model that credits a learning to that session and declares it
`false` is not refused — three such sessions could authorize a skill-body
revision (round 1's finding, round record §7).

**What the owner decided, and what this package builds.** A sibling design
tried to *decline* harness-authored records by their source fields
(`docs/specs/done/WP-dream-projection-harness-user-records.md`, now
Superseded). Declining on an undocumented field needs a safety net — a renamed
field would consume every request — and three design rounds could not close
that net. The owner chose (iii), build nothing on the decline rule, and
commissioned this narrower design: **decline nothing; flag the one class
Claude Code positively labels as a task notification `true`, let it taint
what follows as a `tool_result` does, and tell the ledger gate the session
held one** (Table N). Nothing is removed from the projection: the
notification stays, with its text, flagged.

**The central property: fail-open by construction, so there is no net.** Every
rule here only ever *raises* a flag or a taint, and only because of a record
carrying one exact label. If Claude Code drops, renames or re-cases that label,
the record falls out of the class: the projection emits exactly what the Done
contract emits today, the gate extract carries no new key, and the ledger gate
decides exactly as today (Table N row N4). That degraded state is the state
the owner accepted on 2026-09-27 as option (iii)'s baseline, and `false` never
claimed human authorship (the Done spec's row A5b, `:462`), so the fallback
breaks no promise and loses nothing. No detector, counter, quarantine, halt or
retry exists or is needed; the round record's §0 treats any finding that asks
for one as a refutation of this design, not a patch.

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
(round record §2). Row N2 therefore changes no assistant flag today; it closes
the case where no earlier tool output set the state — a continuation file, or
a harness change in how tasks are launched. Owner item 1 carries this.

**The ledger decision, on evidence** (rows N6–N7). The gate extract gains one
text-free key, `task_notification: true`, present exactly when the session
held a labelled record; the ledger's window derivation treats every invocation
window of such a session as tainted, as an external `tool_result` taints its
own window. It is **session-level**, not positional: a positional marker would
need the raw parser to report positions and those positions rebased under the
message cap — the index geometry ADR-0020's round 6 found exploitable — for a
precision that buys nothing measured. On the corpus, 42 (session, invoked
skill) pairs exist; 32 are in sessions holding a notification, and **0 of the
42** are clean today — every window already holds an external `tool_result`
(round record §8.1). So the rule moves no ledger verdict today; it closes the
path for a tool-free skill window in a session that also ran a background
task. Owner item 4 carries the choice and its cost.

**What this does to the dream skill and to the gates** (round record §3,
as revised in §8).
The skill needs no edit: its "explicit user signal" rule already counts only a
`user` message *never* carrying `derived_from_untrusted: true`
(`SKILL.md:100-101`), so a flagged notification cannot count as the person
asking to remember something; its provenance rule is role-agnostic, so an
ordinary candidate supported by a flagged notification is `true` and cannot
reach Tier 3. For a skill-learnings ledger entry the skill already tells the
model that code derives the flag "from evidence you never see" and refuses a
lower declaration (`SKILL.md:119-121`); rows N6–N7 add that evidence. The
Tier-3 gate on notes (`validate.js:191-216`) is unchanged. **The only verdicts
that move are refusals of a `false` declaration, and they move toward
refusal.**

**Where the Done spec's owner item 3 stands.** That item (`:946-966`) priced
*tainting user messages in general* — from the first tool record onward,
nothing the person says could reach identity or skills again — and
recommended against it. This package does not do that. It flags one
positively labelled class: on the corpus, all 1,107 of its records open with
the harness's `<task-notification>` markup and no unlabelled record does, and
the 453 records labelled `kind: "human"` and every record without `origin` are
untouched (round record §2). Erratum 10 records the narrowing against rows
A5(a), A5(b), A5e and B2, and an ADR-0020 amendment records it against that
ADR's ledger rule and its 2026-09-17 sentence "A user message is `false` by
role regardless of what preceded it".

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
  - `:96-117` — `claudeShape(obj)`, row A5c for Claude.
  - `:142-154` — `createPrimaryProjection`'s JSDoc; `:153` ends its return
    type with `tainted:()=>boolean}}`, and `:309` is the return statement
    `return { lost, record, messages, tainted: () => tainted };`
  - `:168` — `let codexHeaderSeen = false;`, the last state variable.
  - `:179-202` — `acceptClaude(obj)`, rows A2/A4; its user half `:183-193`
    (`:184` `isMeta`, `:185` `message.role`).
  - `:243-307` — `record(obj)`, row A5e steps 2–5. `:254-262` is row A4's
    Codex header latch, which runs before step 2. STEP 2 `:264-283`. STEP 3
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
- `src/core/transcripts/index.js` — `parsePrimaryWithOutcome`. `:267-274`
  builds `gateExtract` from the raw capped extract only (roles, no text);
  `:274` is its last line,
  `if (Array.isArray(rawCapped.skill_invocations)) gateExtract.skill_invocations = rawCapped.skill_invocations;`.
  `:221-229` is the `GateExtract` typedef; `:223` ends it with
  `…errored:boolean}>}} GateExtract`. The projection object is in scope there
  as `projection`.
- `src/core/transcripts/claude.js:141` feeds every parsed record to the
  projection; `:148-152` records a string-content `user` record (no `isMeta`)
  as role `user` in the raw timeline.
- `src/core/dream/validate.js`.
  - `:497-509` — `invocationWindowTainted`'s JSDoc; `:506` is its
    `@param {{messages?:Array, skill_invocations?:Array}} extract` line.
  - `:510-527` — `invocationWindowTainted(extract, parentSkill)`. Per
    invocation of the skill: `:516` fails closed on an out-of-range `index`;
    `:520` fails closed on a bad own-result index; `:521-524` scans the
    window for any other `tool_result`.
  - `:627-649` — ledger rule (h); `:647` is the refusal text
    `` `learnings ledger entry ${key}: derived_from_untrusted asserted lower than derived (an invocation window contains a tool_result)` ``.
  - `:191-216` — `tier3Decision`, requiring `derived_from_untrusted === false`
    on every Tier-3 write.
- `skills/wienerdog-dream/SKILL.md:100-101` (explicit user signal, never a
  `true` message), `:109-115` (provenance rule), `:119-121` (the ledger flag is
  derived by code from evidence the model never sees).
- `docs/adr/0020-skill-revision-lifecycle.md` (478 lines): `:88-100` the
  window-trust rule (it begins at `:88`'s last words); `:400-471` the 2026-09-17 amendment, whose `:469-471`
  says a user message is `false` by role regardless of what preceded it;
  `:473` is exactly `## Future work (parked, not specced)`. Its amendments
  never edit text above them.
- The Done spec: `:461` row A5 (its clause (a) "`false`, always", its clause
  (b) listing what sets the state); `:462` row A5b; `:468` row A5e; `:476` row
  B2 (the gate extract's shape: `{harness, session_id, messages,
  skill_invocations}`, "No `text` key occurs anywhere in the value");
  `:563-567` the routine-prompt heuristic ruling; `:946-966` owner item 3.
- **No committed test or fixture carries an `origin` key**, and nothing under
  `src/core/transcripts/` reads one (the first Current-state command below).
  With the rule simulated on `67359a5e` and no fixture changed, `npm test`
  stays at 3,083 tests, 0 fail (round record §4 and §8): **no existing test
  asserts a notification's flag, the following reply's flag or a
  notification's effect on the ledger, and no fixture needs a sweep.** No existing test asserts a
  gate extract's full key set except the Done suite's worked example, which
  holds no label and so is unchanged.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/primary-dialogue.js | Table N: `isTaskNotification` (N1), the decision before step 2 (N1, N6), step 3 (N2), step 5 (N3), `notified()` (N6); the step-5 comment and the JSDoc return type |
| modify | src/core/transcripts/index.js | Table N row N6: the `task_notification` key on `gateExtract`; the `GateExtract` typedef |
| modify | src/core/dream/validate.js | Table N row N7: `invocationWindowTainted` reads the key; its JSDoc; the rule (h) refusal text |
| create | tests/fixtures/primary-dialogue/claude-task-notification.jsonl | the worked example below, byte for byte |
| create | tests/unit/primary-dialogue-notification.test.js | `[NT-AC1]`–`[NT-AC5]` |
| create | tests/red-proofs/projection-notification-taint.proofs.json | RED proofs P1–P11 |
| modify | docs/specs/done/WP-dream-primary-dialogue-projection.md | Erratum 10: F0–F5 verbatim; no other byte changes |
| modify | docs/adr/0020-skill-revision-lifecycle.md | the amendment below, verbatim; no other byte changes |

### Exact contracts

**The predicate (Table N row N1).** A module-level function in
`primary-dialogue.js`, beside `claudeShape`; its body exactly as below (its
JSDoc may say more):

```js
/** Table N row N1 (WP-dream-projection-notification-taint).
 *  @param {*} obj any parsed JSON value
 *  @returns {boolean} */
function isTaskNotification(obj) {
  return isPlainObject(obj)
    && obj.type === 'user'
    && obj.isMeta !== true
    && obj.isSidechain !== true
    && isPlainObject(obj.message)
    && obj.message.role === 'user'
    && isPlainObject(obj.origin)
    && obj.origin.kind === 'task-notification';
}
```

It reads `type`, `isMeta`, `isSidechain`, `message`, `message.role`, `origin`
and `origin.kind`, and nothing else — never `message.content`, never
`promptSource`. It is safe on any parsed JSON value (`null`, a number, an
array), because it runs **before** step 2.

**Rows N1, N2, N3 and N6 in `createPrimaryProjection`.**

- A new state variable after `let codexHeaderSeen = false;` (`:168`):
  `let notified = false;`
- In `record(obj)`, after row A4's latch (`:254-262`) and before the STEP 2
  comment (`:264`):

  ```js
      const notification = !codex && isTaskNotification(obj);
      if (notification) notified = true;
  ```

- Directly after the STEP 3 `if/else` (`:290-294`), before STEP 4, with a
  comment naming row N2 and why (a notification is external content, as a
  `tool_result` is):

  ```js
      if (notification) tainted = true;
  ```

- The step-5 flag (`:305`) becomes exactly

  ```js
        derived_from_untrusted: accepted.role === 'user' ? notification : tainted,
  ```

  with the step-5 comment (`:296-298`) updated to say that a user message is
  `false` by role unless it is a task notification (row N3), which is `true`.
- The returned object (`:309`) gains `notified: () => notified`, and the
  JSDoc return type (`:153`) gains `notified:()=>boolean`.

**Row N6 in `parsePrimaryWithOutcome`** (`index.js`), directly after `:274`:

```js
  if (projection.notified()) gateExtract.task_notification = true;
```

with a comment naming Table N row N6, and the `GateExtract` typedef (`:223`)
gaining `task_notification?:true`. The key is **absent** when no labelled
record was seen; nothing else on `gateExtract` changes. It is set whatever
the read's outcome and whether or not the labelled record survives the
message cap — a notification the cap drops still says the session held one.

**Row N7 in `invocationWindowTainted`** (`validate.js`), directly after the
own-result check (`:520`), inside the per-invocation loop:

```js
    if (extract.task_notification !== undefined) return true;
```

with a comment naming Table N row N7; the JSDoc's `@param` (`:506`) gains
`task_notification?:true`; and rule (h)'s refusal text (`:647`) becomes
exactly

```text
learnings ledger entry ${key}: derived_from_untrusted asserted lower than derived (an invocation window contains a tool_result, or the session a task notification)
```

(the template literal is otherwise unchanged; existing tests match only
`asserted lower than derived`). Apart from these lines and their comments,
nothing in the three files changes.

**Literal worked example — the projection.**
`tests/fixtures/primary-dialogue/claude-task-notification.jsonl`, exactly
these six lines (synthetic; every value invented):

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

**Literal worked example — the gate and the ledger** (inline in the test
file; synthetic). Five records:

```jsonl
{"type":"user","sessionId":"nt-gate","cwd":"/w","timestamp":"2026-09-27T10:00:00.000Z","promptSource":"typed","origin":{"kind":"human"},"message":{"role":"user","content":"Run the packing-list skill."}}
{"type":"assistant","timestamp":"2026-09-27T10:00:05.000Z","message":{"role":"assistant","stop_reason":"tool_use","content":[{"type":"text","text":"Running it."},{"type":"tool_use","id":"tu1","name":"Skill","input":{"skill":"packing-list"}}]}}
{"type":"user","timestamp":"2026-09-27T10:00:09.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","is_error":false,"content":"ok"}]}}
{"type":"user","timestamp":"2026-09-27T10:01:00.000Z","promptSource":"system","origin":{"kind":"task-notification"},"message":{"role":"user","content":"<task-notification>SYNTHETIC SUBAGENT RESULT</task-notification>"}}
{"type":"assistant","timestamp":"2026-09-27T10:01:05.000Z","message":{"role":"assistant","stop_reason":"end_turn","content":[{"type":"text","text":"Done."}]}}
```

Its `gateExtract` deep-equals

```js
{ harness: 'claude', session_id: 'nt-gate',
  messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'tool_result' }, { role: 'user' }, { role: 'assistant' }],
  skill_invocations: [{ skill: 'packing-list', index: 2, resultIndex: 2, errored: false }],
  task_notification: true }
```

and, with `origin` removed from every line, the same value without
`task_notification`. The skill's window is messages 2–4 and holds only its
own paired result, so it was clean before this package. A `LEARNINGS.md`
entry beside a registered `packing-list` skill that newly counts
`claude:nt-gate` and declares `derived_from_untrusted: false` is **refused**
(`asserted lower than derived`); declaring `true` is kept; without the label,
`false` is kept, as at `67359a5e`.

**Erratum 10 to the Done spec — copy verbatim.** `<DATE>` is the `YYYY-MM-DD`
date of the implementation commit. F0 **continues the existing errata
blockquote**: directly after its last line — the last line of Erratum 9 as
`WP-dream-projection-done-spec-errata` landed it, exactly
`> shape not observed in the wild.**` — insert one line that is exactly `>`
and then F0's lines, so the blank line and the
`<!-- errata above; the spec as it shipped follows -->` comment follow
unchanged (a blank line between two blockquotes fails markdownlint MD028).
F1–F5 are each inserted directly after the anchor named, with one leading
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
> it carries `derived_from_untrusted: true`. When a session holds one, its
> `gateExtract` also carries the text-free key `task_notification: true`,
> and the learnings-ledger validator treats every invocation window of that
> session as tainted. The decision compares that one harness-written field
> for exact equality and never reads the content, so the routine-prompt
> note's ruling against heuristics is not engaged. *What did not change:*
> every other user message is `false` by role, and owner item 3's
> recommendation stands for them; no message is removed, added, reordered or
> re-worded; `intakeBytes` and `parse` are unchanged, and `gateExtract` gains
> only that key. If Claude Code drops or renames the label, those records
> project exactly as before this erratum; `false` never claimed human
> authorship (row A5b), so that fallback breaks no promise. *Why:* before it,
> 1,107 of 1,107 labelled records in the owner's local corpus reached the
> dream flagged `false`
> (`docs/specs/logbook/2026-09-27-projection-notification-taint-design-review.md`
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

F5 — in row B2, after the anchor
``No `text` key occurs anywhere in the value.``:

```text
(**From <DATE> it also carries `task_notification: true` when the session holds a labelled task notification — see Erratum 10.**)
```

**The ADR-0020 amendment — copy verbatim.** Insert it directly before the
line `## Future work (parked, not specced)` (`:473`), followed by one blank
line. `<DATE>` is as above; `<RULING-DATE>` is the date of the owner's
rulings on this package's owner items, from their logbook record.

```text
## Amendment (<DATE>): a task notification Claude Code labels is untrusted — WP-dream-projection-notification-taint

Status: **ACCEPTED by the owner's rulings of <RULING-DATE> on that package's owner items.**

**Decision.** A `user` record that Claude Code labels as a task notification — its top-level `origin.kind` is exactly `"task-notification"` — carries a subagent's or background task's result, which is external content. From <DATE>: (1) the primary-dialogue message projected from it carries `derived_from_untrusted: true`, and it sets the session's taint state as an external `tool_result` does; the 2026-09-17 amendment's "A user message is `false` by role regardless of what preceded it" holds for every other user message. (2) The text-free gate projection carries `task_notification: true` when the session holds such a record, and the learnings-ledger validator derives every invocation window of that session as untrusted, exactly as it derives a window holding an external `tool_result`; only an absent key reads clean. So a notification can no longer help a session count as a trusted confirmation of a skill learning, and the "Accepted residual after round-5" above now also requires that none of the three sessions held a labelled task notification.

**Why session-level.** A positional marker would have needed the raw parser to report positions, rebased under the message cap — the index geometry round 6 of this ADR's review found exploitable — for a precision that moved no verdict on the owner's corpus: 0 of 42 (session, invoked skill) pairs were clean before this amendment, and 32 of the 42 were in sessions holding a notification.

**Fail-open by construction.** Every effect above is triggered only by the exact label. If Claude Code drops or renames it, the projection, the gate projection and the ledger's derivation are exactly what they were before this amendment; nothing is lost and nothing needs a detector. No command, flag, runtime dependency or daemon is introduced. ADR-0004 remains intact.
```

## Contract reference (optional — mark N/A if this WP is not contract-dense)

The ADR-0031 trigger fires on five of seven: **(i)** a result shape changes —
the gate extract gains a key; **(iii)** structured input classification
changes — a record field is read for provenance; **(v)** an authority boundary
is crossed — the projection emits evidence the ledger validator owns the
interpretation of; **(vi)** downstream consumers inherit it — the dream skill's
provenance rule, the ledger gate, the Done spec's rows A5/A5e/B2 and ADR-0020;
**(vii)** the same facts appear in the code, the worked examples, the
acceptance criteria, the RED register, the measurement scripts, Erratum 10 and
the ADR amendment. **Table N is the single place its facts are decided**;
every other surface cites it.

### Contract table(s)

#### Table N — records Claude Code labels as task notifications (canonical)

| Row | Contract | Rule |
|-----|----------|------|
| N1 | The class — **what we accept, enumerated** | A **Claude** record (any parsed JSON value is tested) for which **all** hold: it is a plain object; top-level `type` is exactly `"user"`; `isMeta` is not `true`; `isSidechain` is not `true`; `message` is a plain object whose `role` is exactly `"user"`; top-level `origin` is a plain object; `origin.kind` is exactly the string `"task-notification"`. One label, one value, exact and case-sensitive. Reads no other field and never `message.content`. Decided once per record, **before** row A5e step 2. Never applied to a Codex rollout. |
| N2 | Taint | At row A5e **step 3**, after the existing `tool_result` check and before step 4, a record in N1 that passed step 2 sets the monotonic taint state, whether or not step 4 then accepts it. (A record step 2 rejects has already tainted.) Execution continues. |
| N3 | Emission | At **step 5**, a user message emitted from a record in N1 carries `derived_from_untrusted: true`. Every other user message is `false` by role (the Done spec's row A5(a), unchanged). An assistant message carries the current state (row A5(b), unchanged; N2 may have raised it). |
| N4 | Fail-open — the central property | A record **not** in N1 — `origin` absent, `null`, a string, an array, an object without `kind`, `kind` any other value (including `"human"`, a re-cased or renamed label), or a labelled record with `isMeta`, `isSidechain` or another `message.role` — is projected **exactly** as the Done contract projects it, adds nothing to the gate extract, and changes no ledger verdict. There is no detector, counter, diagnostic, quarantine, halt or retry, and none may be added under this package. |
| N5 | Raise-only | The rule never removes, adds, reorders or re-words a message, never changes a `ts`, never lowers a flag, and never changes `intakeBytes`, `parse` or the extract's metadata. The only values it may change are `derived_from_untrusted` values, only from `false` to `true`, and the gate extract, only by row N6's key. |
| N6 | The gate projection | `parsePrimaryWithOutcome`'s `gateExtract` carries `task_notification: true` exactly when at least one record of the read was in N1 — including one step 2 rejected and one the message cap dropped — and the key is **absent** otherwise. Text-free: it records that a labelled record was seen, never where or what. |
| N7 | The ledger | `invocationWindowTainted` returns `true` for every invocation of the skill in a gate extract on which the key `task_notification` is **present with any value**; only its absence reads clean. Rule (h) then refuses a newly counted Claude session's `false` declaration exactly as for an external `tool_result`. The Codex path and every other ledger rule are unchanged. |

### Mirrored Surface Checklist

Registered mirrors of Table N, each deferring to it; a change to a row updates
every mirror in the same commit:

- [ ] **Deliverables cells:** the `primary-dialogue.js` row (N1–N3, N6), the
      `index.js` row (N6), the `validate.js` row (N7), the Done-spec row
      (Erratum 10) and the ADR row (the amendment).
- [ ] **Exact contracts:** the predicate block (N1), the four
      `createPrimaryProjection` edits (N1–N3, N6), the `index.js` line (N6),
      the `validate.js` line and refusal text (N7), both worked examples
      (N1–N4, N6–N7), F0–F5 (N1–N7), the ADR amendment (N1–N4, N6–N7).
- [ ] **Acceptance criteria:** AC1 (N1–N3), AC2 (N1, N4), AC3 (N5), AC4 (N6),
      AC5 (N7, N4), AC6 (Erratum 10 and the amendment).
- [ ] **RED register:** P1 (N3), P2 (N2), P3–P6 (N1, N4), P7 (N5 and the
      owner's flag-not-decline ruling), P8 and P11 (N6), P9 and P10 (N7).
- [ ] **Verification:** the projection measurement script's class test (its
      N1 copy) and its `--strip-origin` device (N4); the ledger measurement
      script's reading of the key (N6, N7); the Current-state `origin` grep.
- [ ] **Current state:** the citations of steps 2–5, `claudeShape`,
      `gateExtract`, `invocationWindowTainted`, rule (h) and ADR-0020.
- [ ] **Operative prose:** Context ("gap", "central property", "taint
      decision", "ledger decision", "dream skill and gates", "owner item 3"),
      Implementation notes, the Security checklist, owner items 1–4.
- [ ] **Outside this spec, edited by it:** Erratum 10 and its markers F1–F5
      in the Done spec; the ADR-0020 amendment; the JSDoc of
      `isTaskNotification`, the step-3 and step-5 comments, the JSDoc return
      type in `primary-dialogue.js`; the `GateExtract` typedef; the
      `invocationWindowTainted` JSDoc and rule (h)'s refusal text.
- [ ] **Outside, deliberately not edited:** `skills/wienerdog-dream/SKILL.md`
      (its rules for `true` are already role-agnostic, and it already tells
      the model the ledger flag is derived from evidence it never sees —
      Context); the Done spec's owner item 3 and its acceptance criteria
      (records of what shipped; Erratum 10 speaks for them); ADR-0020's text
      above the new amendment (its amendments never edit earlier text; the
      amendment narrows the 2026-09-17 sentence in its own words);
      `docs/specs/done/WP-dream-primary-dialogue-collection.md` row D1 (it
      records that *that* package left `validate.js` unchanged, which stays
      true; the gate extract's shape is the projection Done spec's row B2,
      which F5 marks); `primary-dialogue.js:8-9`'s "harness-authored …
      instructions are not dialogue at all" (Erratum 7's named gap, not this
      package's). **Registered in revision 1:** ADR-0020's 2026-09-17
      sentence and Done spec row B2 were mirrors round zero missed.

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, no build step** (CLAUDE.md). Plain
  Node ≥ 18 with JSDoc.
- **Enumerate our own good.** N1 names the one label we accept, and N7 names
  the one clean gate state (the key absent). Do not replace N1 with a
  negative ("any `kind` that is not `human`"): that flags every future kind
  by default, and a renamed `human` label would then flag every prompt the
  person types `true` — silently ending Tier-3 learning from their words, the
  cost the Done spec's owner item 3 priced (owner item 3 below). Do not
  replace N7's `!== undefined` with `=== true`: a malformed value would then
  read clean, against the validator's fail-closed posture (P10).
- **Do not read the content.** A text-prefix test (`<task-notification`)
  would find the same records today (round record §2) but defeats N4: with the
  label gone, a record whose text merely looks like a notification — including
  one the person typed — would still be flagged. RED proof P4 pins this.
- **Do not decline.** The owner ruled flag, not decline. A notification stays
  in the projection with its text; P7 pins this.
- **Decide before step 2.** The class is decided once, before step 2, so a
  labelled record whose schema step 2 rejects still reaches the gate (N6); its
  projection effect is unchanged because step 2 already taints and ends it.
  P11 pins this.
- **Claude only.** Keep `!codex &&` at the call site: a Codex rollout never
  carries the label, and without the guard a Codex record shaped like one
  would taint the rollout's final answer. P6 pins this.
- **Session-level, not positional.** Do not add positions, a raw-parser
  callback or any index to the gate key; `src/core/transcripts/claude.js` is
  not a deliverable (owner item 4 prices the alternative).
- **The test file is new**, not an edit to `tests/unit/primary-dialogue.test.js`
  or `tests/unit/dream-validate.test.js` (Done packages' suites). The new
  fixture file is also picked up by `primary-dialogue.test.js`'s `[AC4]`
  return-value invariants, which loop over every committed `.jsonl` fixture
  in the directory; they must stay green. The ledger test calls
  `makeGates().ledger({...})` directly on values (no git repository), with a
  registry entry and paired `SKILL.md` for `05-Skills/packing-list/`, exactly
  as `dream-validate.test.js`'s ledger-corpus tests do.
- **RED-proof register (ADR-0042).** One declaration file, suite
  `tests/unit/primary-dialogue-notification.test.js`, every `testNamePattern`
  `\[NT-AC`, every `occurrences` 1. The `find` strings below name the drafted
  code and **the `expectRed` sets are DERIVED** — obtained by running the lane
  against the draft on a simulated tree (round record §4 and §8), not
  predicted. If
  your code differs, keep each mutation's meaning, re-derive `find` and
  `expectRed` by running the lane, and record that under "Decisions made".
  Each `find` is the whole drafted line **including its leading indentation**
  (the Indent column, as in the Exact-contracts blocks), shown here without
  it.

  | Id | Pins | Mutation (meaning) | `find` (drafted) | Indent | Derived `expectRed` (test tag → signal substring) |
  |----|------|--------------------|------------------|--------|------------------------------------------------|
  | `nt-p1-notification-flag-removed` | N3 | step 5 back to `false` by role | `derived_from_untrusted: accepted.role === 'user' ? notification : tainted,` | 6 | NT-AC1 → `nt-ac1 :: flags` |
  | `nt-p2-notification-taint-removed` | N2 | the step-3 taint line removed | `if (notification) tainted = true;` | 4 | NT-AC1 → `nt-ac1 :: flags` |
  | `nt-p3-label-not-exact` | N1 | `kind` any string | `&& obj.origin.kind === 'task-notification';` | 4 | NT-AC1 → `nt-ac1 :: flags`; NT-AC2 → `:: equals the unlabelled projection` |
  | `nt-p4-content-heuristic` | N1, N4 | the two `origin` clauses replaced by a `<task-notification` text-prefix test | the two lines `&& isPlainObject(obj.origin)` and `&& obj.origin.kind === 'task-notification';`, with the newline between them | 4 | NT-AC1 → `nt-ac1 :: array flags`; NT-AC2 → `nt-ac2 no label :: the Done contract flags`; NT-AC3 → `nt-ac3 :: gate extract, apart from row N6`; NT-AC4 → `nt-ac4 no label :: key absent`; NT-AC5 → `nt-ac5 no label :: false kept` |
  | `nt-p5-ismeta-gate-dropped` | N1 | the `isMeta` clause made `true` | `&& obj.isMeta !== true` and its newline | 4 | NT-AC2 → `nt-ac2 labelled but isMeta :: equals the unlabelled projection` |
  | `nt-p6-codex-guard-dropped` | N1 | `!codex &&` removed | `const notification = !codex && isTaskNotification(obj);` | 4 | NT-AC2 → `nt-ac2 codex` |
  | `nt-p7-notification-declined` | N5 | row A2's user half declines a labelled record | `if (obj.isMeta === true) return null;` | 6 | NT-AC1 → `nt-ac1 :: texts`; NT-AC3 → `nt-ac3 :: roles, texts and timestamps` |
  | `nt-p8-gate-key-dropped` | N6 | the `index.js` line removed | `if (projection.notified()) gateExtract.task_notification = true;` | 2 | NT-AC4 → `nt-ac4 :: gate example`; NT-AC5 → `nt-ac5 labelled false :: refused` |
  | `nt-p9-ledger-ignores-notification` | N7 | the `validate.js` line removed | `if (extract.task_notification !== undefined) return true;` | 4 | NT-AC5 → `nt-ac5 labelled false :: refused` |
  | `nt-p10-ledger-reads-truthiness` | N7 | the key read as `=== true` | the same line | 4 | NT-AC5 → `nt-ac5 malformed` |
  | `nt-p11-notified-after-step-2` | N6 | `notified` set only for a record step 2's schema check accepts (`claudeShape(obj).classified`) | `if (notification) notified = true;` | 4 | NT-AC4 → `nt-ac4 step-2 reject (schema)` |

  Each `expectRed[].test` is the full test title, e.g.
  `primary-dialogue: [NT-AC1] a record Claude Code labels as a task notification is flagged, and taints what follows`;
  the assertion messages carry the signal substrings above.
- **When uncertain:** choose the simpler option and record it under
  "Decisions made". Do not add a diagnostic, counter or fallback to resolve an
  ambiguity — N4 forbids it.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] **Untrusted input:** the transcript record is attacker-influenced JSON.
      The predicate compares values for strict equality, reads a property of
      `obj`, `obj.message` or `obj.origin` only after `isPlainObject` on it,
      never coerces, never iterates, never recurses, and flows nothing into a
      path or a shell.
- [ ] **Direction of every change is toward caution:** a forged label can
      only make a record `true` and a session's ledger windows untrusted,
      which only narrows what can reach Tier 3 or authorize a skill revision;
      an erased label returns everything to its `67359a5e` value. No input can
      make any flag `false`, or any window clean, that is `true` or tainted at
      `67359a5e` (N5, N7, AC3, AC5).
- [ ] **The gate stays text-free and model-invisible:** the new key is a
      constant boolean on the in-memory gate extract, which is never written
      where a model can read it (the collection Done spec's row D1); no text
      and no position is added.
- [ ] No identifier from the record flows into a filesystem path or a shell
      command.

## Acceptance criteria

- [ ] **AC1 — the class is flagged and taints** (`[NT-AC1]`): the projection
      worked example projects to its six texts and the first flag row exactly;
      the same file with the labelled record's content replaced by an array
      holding one `text` block projects to the same flags (content-free).
- [ ] **AC2 — fail-open in the projection** (`[NT-AC2]`): the worked example
      with `origin` removed from every line projects to the second flag row
      (all `false`); and for each of the N4 variants of the labelled record —
      `origin` absent, `null`, a string, an array, `{}`; `kind`
      `"Task-Notification"`, `"task_notification"`, `"human"`; the labelled
      record with `isMeta: true`, with `isSidechain: true`, with
      `message.role` `"assistant"` — the projection's extract equals the
      projection of the same lines with `origin` removed from every line
      (`source_path` excluded from the comparison). A Codex rollout
      containing a top-level
      `{"type":"user","origin":{"kind":"task-notification"},…}` record
      between an accepted user message and a final answer projects without
      throwing, with flags `[false, false]`.
- [ ] **AC3 — raise-only** (`[NT-AC3]`): for the worked example against the
      same lines with `origin` removed: roles, texts and `ts` are equal in
      order; the extract's metadata and `parse` are deep-equal; the gate
      extracts are deep-equal once `task_notification` is removed from the
      labelled one; and no flag is `false` where the unlabelled projection's
      is `true`.
- [ ] **AC4 — the gate key** (`[NT-AC4]`): the gate worked example's
      `gateExtract` deep-equals the literal above; without the label it has
      no `task_notification` key; with the labelled record's content replaced
      by `7` (a schema step 2 rejects) or by `[{"type":"mystery"}]` (a block
      type step 2 rejects), the key is still `true`.
- [ ] **AC5 — the ledger** (`[NT-AC5]`): with the gate worked example's
      `gateExtract` as the session's evidence, the ledger gate refuses the
      entry declaring `false` (the refusal matches `asserted lower than
      derived`) and keeps the one declaring `true`; with the unlabelled gate
      extract it keeps `false`; and with `task_notification` set to `false`,
      `"yes"`, `0` or `null` it refuses `false`.
- [ ] **AC6 — Erratum 10 and the amendment:** F0–F5 are in the Done spec
      verbatim, and the amendment is in ADR-0020 directly before `## Future
      work (parked, not specced)`, with `<DATE>` and `<RULING-DATE>`
      replaced; removing them yields each base file byte for byte.
- [ ] **AC7 — nothing else moved:** `npm test` passes with no existing test
      or fixture edited; `npm run red-proofs -- --wp WP-dream-projection-notification-taint`
      reports all eleven proofs `PROVEN`; and the lanes of every work package
      whose proofs mutate a file this package edits still report only
      `PROVEN` (the list is in Verification steps).
- [ ] Idempotence: `N/A — the package ships a pure projection rule and a gate
      check, no command and no write outside the repo`.

## Verification steps (run these; paste output in the PR)

### Current-state checks — before implementation

```bash
# No committed test or fixture, and no projection code, reads an `origin` key:
test -d tests && ! grep -rnE '"origin" *:|origin: *\{|\\"origin\\"' tests && ! grep -rnw 'origin' src/core/transcripts && echo "current-state: no origin anywhere"
# Nothing reads a task_notification key yet:
test -d src && test -d tests && ! grep -rn 'task_notification' src tests && echo "current-state: no gate key yet"
# On a machine with Claude transcripts holding task notifications, today's tree
# flags them false (exit 1, last line NOT IN EFFECT). Counts only; no text printed.
node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js --days 5; echo "exit $?"
```

### Implementation checks — these must pass before the PR

```bash
npm test
npm test -- --test-name-pattern '\[NT-AC'
npm run red-proofs -- --wp WP-dream-projection-notification-taint 2>&1 | grep -E '^(PROVEN|FAILED) '
for wp in WP-dream-primary-dialogue-projection WP-dream-primary-dialogue-collection WP-dream-collect-parse-throw-quarantine WP-transcript-parsers-harden-text-values WP-audit-e-ledger-parser-corpus WP-dream-git-env-validate-seam WP-ep2-prune-once-per-run-test WP-quarantine-failed-preserve-disposal-flush WP-quarantine-only-copy-shelf WP-quarantine-preserve-durability; do echo "== $wp"; npm run red-proofs -- --wp "$wp" 2>&1 | grep -E '^(PROVEN|FAILED) ' | grep -c '^FAILED'; done
node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js --days 5; echo "exit $?"
node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js --days 5 --strip-origin | grep -q 'user messages flagged true 0 ' && echo "fail-open: with the label gone, no user message is flagged"
node docs/specs/logbook/2026-09-27-projection-notification-taint-ledger-measure.js --days 0
node - <<'EOF'
const fs = require('fs');
const { execSync } = require('child_process');
const base = (f) => execSync(`git show "$(git merge-base HEAD main)":${f}`).toString();
const fail = (m) => { console.error(m); process.exit(1); };
const F = 'docs/specs/done/WP-dream-primary-dialogue-projection.md';
let cur = fs.readFileSync(F, 'utf8');
if (cur.includes('<DATE>')) fail('a <DATE> placeholder remains in the Done spec');
const inline = [
  / \(\*\*Except one from a record Claude Code labels as a task notification, which is `true` from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*A labelled task notification sets it too, from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*A labelled task notification also taints here, from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*Except a labelled task notification's, which is `true` from \d{4}-\d{2}-\d{2} — see Erratum 10\.\*\*\)/g,
  / \(\*\*From \d{4}-\d{2}-\d{2} it also carries `task_notification: true` when the session holds a labelled task notification — see Erratum 10\.\*\*\)/g,
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
if (cur !== base(F)) fail('other bytes changed in the Done spec');
const A = 'docs/adr/0020-skill-revision-lifecycle.md';
let adr = fs.readFileSync(A, 'utf8');
if (/<DATE>|<RULING-DATE>/.test(adr)) fail('a placeholder remains in ADR-0020');
const am = /\n## Amendment \(\d{4}-\d{2}-\d{2}\): a task notification Claude Code labels is untrusted — WP-dream-projection-notification-taint\n[\s\S]*?\n(?=## Future work \(parked, not specced\)\n)/.exec(adr);
if (!am) fail('the ADR-0020 amendment is not directly before Future work');
adr = adr.slice(0, am.index + 1) + adr.slice(am.index + am[0].length);
if (adr !== base(A)) fail('other bytes changed in ADR-0020');
console.log('erratum 10 and the ADR-0020 amendment: exact');
EOF
node scripts/boundary-check.js docs/specs/WP-dream-projection-notification-taint.md $(git diff --name-only "$(git merge-base HEAD main)" | grep -v '^docs/specs/logbook/')
npm run lint
```

Expected: `npm test` 0 fail; the package's red-proof grep prints only
`PROVEN` lines (eleven proofs and five criteria), the run ending
`RUN: FILTERED`, as a `--wp` run does; each other lane prints `0` (no
`FAILED` line); the projection measurement exits 0 with the last line
`in effect: N emitted task notifications, none flagged false`; the fail-open
line prints; the ledger measurement prints its four lines (paste them —
it is a count, not a gate); `erratum 10 and the ADR-0020 amendment: exact`;
the boundary check exits 0; lint passes. The measurement lines are **local
re-measurements**, not gates: on a machine with no task notifications they
pass vacuously, so paste their output. Each check was observed on both sides
at drafting (round record §4 and §8).

## Out of scope (do NOT do these)

- **Declining any record**, and any safety net — superseded by the owner's
  ruling; `docs/specs/done/WP-dream-projection-harness-user-records.md`.
- **Any other harness-authored record** — command echoes, `!`-command records,
  compaction and interruption records keep today's behaviour (Erratum 7's
  named gap, `WP-dream-projection-done-spec-errata`).
- **Any other `origin.kind` value** (owner item 3), and `promptSource`.
- **Positions for the gate key**, and any change to
  `src/core/transcripts/claude.js` (owner item 4).
- **Codex.** No equivalent label is known; the pre-0.151 rollouts that project
  replies without requests stay routed as their own candidate.
- **`skills/wienerdog-dream/SKILL.md`** — needs no edit (Context).
- **Any other ledger or Tier-3 rule**, and the collection Done spec
  (Mirrored Surface Checklist, "deliberately not edited").
- **Any diagnostic or counter of the label's presence** — owner item 2.

## Dispatch precondition — owner items

**Citations.** Written against `main` at `67359a5e`; re-run every `file:line`
citation, at both ends, before dispatch (`docs/runbooks/codex-review.md`,
"Dispatch-time re-verification"). `WP-dream-projection-done-spec-errata` must
have landed first (F0's anchor is its last line).

Each item is a recommendation with its cost; nothing here records an owner
decision. **Dispatch waits for the owner's rulings on all four — item 4's
ruling date is the ADR amendment's `<RULING-DATE>`; the design gate and
`Ready` do not.**

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
   to `false` and the ledger to today's derivation. *Recommendation:* accept
   that. The degraded state is option (iii)'s baseline, which the owner
   accepted on 2026-09-27; the measurement scripts show the class count on
   demand. *Cost of overruling:* a counter or warning is a net — the
   mechanism three harness-records rounds could not close — and would need
   its own package, a surface (`reports/warnings.md` or `doctor`) and a
   threshold; it would detect a return to a state already ruled acceptable.
3. **Flag exactly one label.** On the corpus, the `user` records that pass
   row A2's user-half gates carry exactly three `origin` states: absent
   (12,219 records), `kind: "human"` (453) and `kind: "task-notification"`
   (1,107). *Recommendation:* flag only `"task-notification"`, and let any
   future kind project as today until a later package names it. *Cost of
   overruling:* flagging "any kind that is not `human`" flags unknown future
   kinds by default, but a renamed `human` label would then flag every
   prompt the person types `true` and silently end Tier-3 learning from
   their words — the cost the Done spec's owner item 3 priced, reached
   through a harness change instead of a design choice.
4. **Accept the ADR-0020 amendment: a session holding a labelled
   notification never counts as a trusted confirmation of a skill learning
   (session-level, rows N6–N7).** *Recommendation:* accept. It closes round
   1's path — a notification inside a tool-free skill window let a `false`
   ledger declaration stand — with one text-free boolean and one line in the
   validator, and it moved no verdict on the corpus (0 of 42 pairs were clean
   before it). *The cost, stated:* a tool-free skill used in a session that
   also ran any background task can no longer help authorize that skill's
   revision, even when the task finished outside the skill's window; 32 of
   the corpus's 42 skill pairs are in such sessions (all 42 are already
   tainted by external tool output today). *Cost of overruling to the
   positional variant:* the raw parser (`claude.js`) must report each
   notification's position, the positions must be rebased under the
   2,000-message cap exactly as invocation indices are, and window
   boundaries need a tie rule — about one more source file, two more RED
   proofs and the index-geometry class of bug ADR-0020's round 6 found; size
   M either way. *Cost of rejecting both:* the package must narrow its
   Tier-3 claim, and the path round 1 found stays open by ruling.

## Definition of done

0. **DISPATCH PRECONDITION.** The design gate has closed under the round
   record's §0; the owner has ruled on owner items 1–4;
   `WP-dream-projection-done-spec-errata` has landed; the citations are
   re-verified.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): flag labelled task notifications as untrusted in the projection and the ledger gate (WP-dream-projection-notification-taint)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
