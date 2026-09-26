---
date: 2026-09-27
related_wps: [WP-dream-projection-notification-taint, WP-dream-primary-dialogue-projection, WP-dream-projection-harness-user-records, WP-dream-projection-done-spec-errata]
---

# WP-dream-projection-notification-taint — design round record

The design round for the package the owner commissioned on 2026-09-27
(`2026-09-27-owner-ruling-harness-records-option-iii.md`: "option 3, and
commission the flag-not-decline design"). Written by wd-architect on branch
`docs/wp-projection-notification-taint`, based on `main` at `67359a5e`. This
section — the STOP CRITERION — is committed **before the spec exists**. Each
external round's raw file is committed before it is adjudicated; the rounds
table is filled in by the orchestrator.

## 0. STOP CRITERION — pinned before the spec and before round 1

Pinned per `docs/runbooks/codex-review.md` ("Finding disposition", the STOP
CRITERION bullet), in the shape of
`2026-09-26-projection-harness-user-records-design-review.md` §0, and written
after reading that round's §7.

**What that round teaches, and why this criterion is shaped the way it is.**
The harness-records round ended by circuit-breaker because its rule
*declined* records on an undocumented field: a renamed field would silently
consume every request, so the rule needed a safety net, and each net opened
the next hole (a run-level halt defeated by one recognised session; a
per-session quarantine blind to array-content requests). The design
commissioned here has **no net, because it needs none**: it only ever
*raises* a flag on records the harness positively labels, so an absent or
renamed field degrades it to exactly today's projection. That property is
the design's premise. This criterion therefore treats any finding that asks
for a net as a refutation of the premise, not as a patch to apply.

**Bands.** **A** — silent wrong behaviour with a security or data
consequence. For this package: (1) a record the design claims to flag
reaching the dream flagged `false`; (2) any projected message removed, added,
reordered or re-worded, any `ts` changed, any flag lowered, or `gateExtract`,
`intakeBytes` or `parse` changed; (3) a learnings-ledger or Tier-3 gate
verdict lowered; (4) an absent, malformed or renamed field producing anything
other than today's projection — the fail-open property falsified. **B** —
wrong behaviour caught downstream or costing quality rather than safety: a
person's own words flagged `true` (barred from Tier 3), a mirror that
disagrees with the canonical table. **C** — hygiene.

**HEAVY** means the fix changes what the implementer builds: `src/`
behaviour, a Table N row's outcome or the fields it reads, the Deliverables
set, Erratum 10's claims, or an owner item's recommendation. **LIGHT** means
the fix touches only this spec's verification machinery (a test, a check, a
RED row, a citation, the measurement script, wording).

Evaluated in this order; the first rule that matches decides.

0. **Band gate.** A band-A finding is HEAVY, whatever it touches.
1. **ESCALATES to the pre-pinned FALLBACK — the no-net rule.** Two triggers:
   (a) any finding, at any round, whose honest fix is a **net** — a detector,
   counter, diagnostic, quarantine, halt, set-aside, retry, version check or
   any other mechanism that watches for the label disappearing; (b) a HEAVY
   finding on Table N at round 3 or later. Either stops patching, and the
   package re-cuts to the fallback:
   - **Fallback level 1 — flag the message only.** Applies when every
     finding that fired the rule lands on row N2 (the taint raise) alone.
     Drop N2: the labelled record's own user message is flagged `true` and
     the taint state is untouched. Measured basis (to be recorded in §2
     before round 1): if every labelled record on the owner's corpus already
     arrives with the taint state set, dropping N2 changes no assistant flag
     there. Its RED proof and its acceptance assertion go with it.
   - **Fallback level 0 — build nothing.** Applies in every other case. No
     `src/` change. The provenance path is recorded as a named residual: a
     dated erratum to `docs/specs/done/WP-dream-primary-dialogue-projection.md`
     stating that a record Claude Code labels as a task notification reaches
     the dream flagged `false`, with the measured count — carried by
     `WP-dream-projection-done-spec-errata` if it has not landed, or as its
     own S docs package otherwise — and the owner is told that the
     commissioned design did not close, and why.
2. **ESCALATES to a DESIGN QUESTION.** Two consecutive rounds land findings
   on Table N — the ADR-0031 circuit-breaker. Do not patch a third time; the
   next step is a re-decision of the class or the taint rule, recorded here
   before any edit.
3. **ESCALATES to the OWNER.** (a) A finding whose honest fix needs a
   measurement this repository cannot make — another machine's transcripts,
   a Claude Code build not installed here, Anthropic's intent for the
   `origin` field — or (b) a finding that argues against an owner item's
   recommendation. Each becomes an owner item or input to an existing one,
   and neither counts as unresolved for closure. Nothing in the loop ratifies
   an owner item.
4. **HEAVY → FRESH ROUND.** Any other HEAVY finding: fix, re-run the
   mechanical checks, then one fresh external round, with this criterion
   re-stated at its head.
5. **LIGHT → CLOSES.** A round whose findings are all LIGHT (band B or C):
   fix in place, re-verify mechanically — `npm test` on the simulated tree,
   the package's RED lane and `WP-dream-primary-dialogue-projection`'s lane,
   the measurement script on the shipped tree, the simulated tree and the
   simulated tree with `--strip-origin`, the erratum applied from the spec's
   own text and linted, the boundary check, `npm run lint` — and the loop
   **closes with no further external round**. A band-C finding may instead
   be dropped with a one-line reason recorded here.
6. **DONE** when a round finds nothing about the product. Machinery findings
   at that point are fixed or accepted as named residuals and do not extend
   the loop. The verification surface is **frozen** at three new tests
   (`[NT-AC1]`–`[NT-AC3]`), seven RED proofs (P1–P7) in one declaration file,
   and the commands in the spec's Verification steps: a machinery finding is
   fixed within that surface or accepted, never answered with more
   machinery.

## 1. Template conformance — round zero (architect's self-report)

`docs/runbooks/codex-review.md` requires this read to come from a
**clean-context executor** given only the spec and the template; the table
below is the author's own check, recorded so that executor has something to
confirm or contradict.

| `_TEMPLATE.md` section | In the spec | Note |
|---|---|---|
| frontmatter: `id`, `title`, `status`, `model`, `size`, `depends_on`, `adrs`, `epic` | present | `status: Draft`, `size: S`, `depends_on` names the errata package |
| `# WP-<slug>: <title>` | present | matches the frontmatter title |
| authoring-rules bullet | present | verbatim |
| `## Context (read this, nothing else)` | present | the gap, the ruling, the central property, the heuristic argument, the taint decision, the consumers, owner item 3 |
| `## Current state` | present | re-derived at `67359a5e`; §3 below |
| `## Deliverables (permission boundary — touch ONLY these)` | present | 5 rows, boundary comment kept |
| `### Exact contracts` | present | the predicate, the two step edits, the literal worked example, F0–F4 |
| `## Contract reference` | present | the trigger fires on three of seven |
| `### Contract table(s)` | present | Table N (canonical) as H4 |
| `### Mirrored Surface Checklist` | present | 9 bullets |
| `## Implementation notes & constraints` | present | includes the RED-proof register P1–P7 |
| `## Security checklist` | present | three bullets |
| `## Acceptance criteria` | present | AC1–AC5 plus the idempotence line as `N/A — …` |
| `## Verification steps` | present | two H3 subsections: current-state, implementation |
| `## Out of scope (do NOT do these)` | present | |
| `## Definition of done` | present | items 0–5 |
| *(extra)* `## Dispatch precondition — owner items` | present | three items, placed before Definition of done |
| *(extra)* status banner under the title | present | not a template section |

## 2. Measurements added by this design round

Run by the architect on the owner's machine (darwin 25.5.0, Node v25.9.0),
over the local Claude transcripts under `~/.claude/projects`, with the
committed script
`docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js`.
**Counts, harness enum values, booleans and digests only. No transcript
text was printed, read into this repository or sent anywhere.** The
transcripts are live; the runs below were made back to back and the
shipped-tree run was repeated after them with byte-identical output, so they
are one consistent point in time.

The simulated tree is a copy of this branch's tree (`git archive`) with the
drafted `primary-dialogue.js` change of the spec's Exact contracts.

```text
== shipped tree (67359a5e's src/), --days 0                                   exit 1
files 334 | user records 14161 | harness versions 2.1.232 .. 2.1.283
  12219  A2-gated user records | origin=ABSENT
    453  A2-gated user records | origin=kind=human
   1107  A2-gated user records | origin=kind=task-notification
   1107  N1 task notifications | content=string | text starts <task-notification=true | taintBefore=true | emitted flag=false
assistant messages 1995 | chars 1808072 | flagged true 1893 | sha256 0231228d62d01423
all projected messages 3961 | chars 6781807 | user messages flagged true 0 | sha256 b5b3c6ab606e7006
NOT IN EFFECT: 1107 of 1107 emitted task notifications read derived_from_untrusted false

== simulated tree (Table N), --days 0                                         exit 0
   (the same four class rows, the last one reading "emitted flag=true")
assistant messages 1995 | chars 1808072 | flagged true 1893 | sha256 0231228d62d01423
all projected messages 3961 | chars 6781807 | user messages flagged true 1107 | sha256 be3e73b4d59f0f18
in effect: 1107 emitted task notifications, none flagged false

== simulated tree, --days 0 --strip-origin                                    exit 0
  13779  A2-gated user records | origin=ABSENT
   1107  UNLABELLED, text starts <task-notification
assistant messages 1995 | chars 1808072 | flagged true 1893 | sha256 0231228d62d01423
all projected messages 3961 | chars 6781807 | user messages flagged true 0 | sha256 b5b3c6ab606e7006
```

Readings, each used by the spec:

- **The class, and its edge.** The `user` records that pass row A2's
  user-half gates carry exactly three `origin` states: absent, `kind:
  "human"`, `kind: "task-notification"`. No other `kind` value occurs; no
  labelled record sits outside those gates (an `isMeta`, `isSidechain` or
  other-role labelled record would print as a `LABELLED, outside N1` row, and
  none does); every labelled record has string content.
- **Label and text agree both ways.** All 1,107 labelled records open with
  the `<task-notification` markup, and no unlabelled A2-gated record does (no
  `UNLABELLED, text starts <task-notification` row in the normal runs; with
  the label stripped, exactly the 1,107 appear there). The harness-records
  round found the same on 1,103 records (its §2.3).
- **The taint decision (row N2) is inert on the corpus.** Every labelled
  record arrives with the taint state already set (`taintBefore=true`, 1,107
  of 1,107; 1,103 of 1,103 in the harness-records round). With the rule
  simulated the assistant digest is unchanged (`0231228d62d01423`): no
  assistant flag moves. Why the state is already set is **not measured**; the
  plausible cause is the `tool_result` of the tool call that launched the
  task.
- **The rule changes exactly those 1,107 flags.** The whole-projection digest
  changes (`b5b3…` → `be3e…`) only through `user messages flagged true`
  0 → 1,107; message and character counts are equal.
- **Fail-open, on real data.** The simulated tree with `origin` stripped from
  every record reproduces the shipped tree's whole-projection digest
  (`b5b3c6ab606e7006`): with the label gone the rule's output is today's,
  byte for byte, over 3,961 messages.

## 3. The consumers, and the citations at both ends

**The dream skill** (`skills/wienerdog-dream/SKILL.md`). Its "explicit user
signal" (`:100-101`) counts only a `user` message "never a message carrying
`derived_from_untrusted: true`", so a flagged notification cannot count as the
person asking to remember. Its provenance rule (`:109-115`) is `true` if ANY
supporting message is `true` and says "never infer `false` from a message's
role" — role-agnostic, so it already handles a `true` user message. Tier 3
requires `false` (`:139-143`, enforced in code by `validate.js:191-216`). **No
edit is needed**; the spec lists the skill as deliberately not edited.

**The learnings-ledger gate** (`src/core/dream/validate.js`). Rule (h)
(`:627-649`) derives an entry's flag with `invocationWindowTainted`
(`:510-527`) over `extractsBySession`, which `src/cli/dream.js:1091` sets to
the collector's `gateExtracts` — the raw timeline's roles, text-free
(`src/core/transcripts/index.js:267-274`). The rule never touches that value
(Table N row N5; AC3 asserts `gateExtract` deep-equal). The raw parser records
a string-content notification as role `user`
(`src/core/transcripts/claude.js:148-152`), not `tool_result`, so the gate
neither gains nor loses a taint source: **no gate verdict changes, in either
direction.** The residual — a notification inside a skill's invocation window
does not taint the ledger's code-derived flag — predates this package and is
named in the spec's Out of scope.

Every `file:line` citation in the spec was printed at both ends by a scratch
helper (`ranges.js`, not committed) against the files at `67359a5e`:

| Citation | First line | Last line | Verdict |
|---|---|---|---|
| `primary-dialogue.js:8-9` | `// intermediate progress replies are not primary dialogue; harness-authored and` | `// developer-authored instructions are not dialogue at all. There is no model` | OK |
| `primary-dialogue.js:10-11` | `// call here and no heuristic over message CONTENT — every decision below reads` | `// structure only (spec Table A).` | OK |
| `primary-dialogue.js:51-54` | the `isPlainObject` JSDoc | `}` | OK |
| `primary-dialogue.js:96-117` | `function claudeShape(obj) {` | `}` | OK |
| `primary-dialogue.js:99-108` | the `user`/`assistant` branch's `if` | `}` | **corrected from `:99-107`**, which ended inside the branch |
| `primary-dialogue.js:179-202`, `:183-193`, `:184`, `:185` | `const acceptClaude`; `if (obj.type === 'user') {`; the `isMeta` line; the `message.role` line | `};`; `}` | OK |
| `primary-dialogue.js:243-307`, `:264-283`, `:285-294`, `:290-294`, `:292-294` | `const record`; the STEP 2 comment; the STEP 3 comment; `if (codex) {`; the `tool_result` `else if` | `};` and `}` | OK |
| `primary-dialogue.js:296-306`, `:296-298`, `:305` | the STEP 4 comment (both); the flag line | `});`; `// is; an assistant message carries the current state.` | OK |
| `index.js:221-229`, `:267-274` | the `GateExtract` typedef; `const gateExtract = {` | the typedef comment's closing `was deleted. */`; the `skill_invocations` copy | OK |
| `claude.js:141`, `:148-152` | `if (observer) observer.record(obj);`; `if (obj.type === 'user') {` | the `messages.push({ role: 'user', …` line | OK |
| `validate.js:191-216`, `:510-527`, `:627-649` | `function tier3Decision`; `function invocationWindowTainted`; the `(h)` comment | `}`; `}`; the rule's closing `}` | **`:627-649` corrected from `:627-648`**, which ended one brace early |
| `SKILL.md:100-101`, `:109-115` | the explicit-user-signal bullet; `**Provenance rule.**` | its second line; `fact about where the content came from.` | OK |
| Done spec `:102`, `:461`, `:462`, `:468` | `> the more complete reference.`; rows A5, A5b, A5e | — | OK |
| Done spec `:563-567` | `this projection can tell a …routine prompt from a human one.** Do` | `be worse than the known limitation. …` | OK (the ruling begins at the line's last word) |
| Done spec `:946-966` | `3. **Should the monotonic taint state apply to user messages too?**` | `for. Nothing here records an owner decision.` | OK |
| `dream-pipeline.test.js:2801-2818` | `function plantInvokingTranscript(…) {` | `}` | OK |

The four erratum anchors F1–F4 each occur exactly once in the Done spec, both
at `67359a5e` and after the errata package's E0–E4 are applied (§4).

## 4. Internal coherence pass — round zero

All on the simulated tree (§2) in the session scratchpad, Node v25.9.0.

- **Which existing tests depend on the rule.** Rule in place, no fixture and
  no test changed: `npm test` → 3,083 tests, **0 fail** (baseline at
  `67359a5e`: 3,083, 0 fail). No committed fixture or inline record carries
  an `origin` key (the spec's Current-state grep), so no existing test sees
  the rule: **no one-key sweep is needed**, unlike the harness-records design
  (41 tests, four scenario fixtures). The four `plantInvokingTranscript`
  pipeline tests the brief named are among the unaffected.
- **The acceptance criteria are satisfiable.** Draft fixture (the spec's
  worked example, byte-equal) and draft tests `[NT-AC1]`–`[NT-AC3]` written to
  the AC text: `npm test` → 3,086 tests, 0 fail; the Done suite
  `tests/unit/primary-dialogue.test.js` (65 tests, whose `[AC4]` invariants
  now also loop over the new fixture) → 0 fail.
- **RED proofs, derived.** Draft declarations P1–P7: `validateProof`
  (exported by `scripts/red-proofs.js`) accepts all seven; every `find`
  occurs exactly once; `npm run red-proofs -- --wp
  WP-dream-projection-notification-taint` → **P1–P7 `PROVEN`; criteria
  NT-AC1, NT-AC2, NT-AC3 `PROVEN`**; `RUN: FILTERED`. The `expectRed` sets
  were derived by running, and first guesses were wrong twice, which is why
  the spec marks them DERIVED: P4 (content heuristic) first left `[NT-AC2]`
  green, because a comparison against the tree's own unlabelled projection
  moves with the mutation — fixed by adding the literal all-`false`
  expectation for the unlabelled example, a real AC gap; and P4 and P7 each
  also redden `[NT-AC1]` (`:: array flags`, `:: texts`), now declared.
- **Every RED lane whose suite or mutated file this package touches:**
  `WP-dream-primary-dialogue-projection` 10 of 10 `PROVEN`;
  `WP-dream-primary-dialogue-collection` 3 of 3 `PROVEN`. All 189 declared
  `find` strings in the repository occur exactly as declared on the simulated
  tree.
- **The spec's texts are the draft's texts** (`coherence.js`, scratch, 42
  checks, all PASS): the fixture is byte-equal to the spec's `jsonl` block;
  the predicate's body occurs verbatim in the draft; the step-3 and step-5
  blocks occur verbatim; every register row names its proof id, its trimmed
  `find` and each derived test tag and signal; every AC tag and the quoted
  test title exist in the draft suite.
- **The measurement lines, three states** (`--days 5`): shipped → exit 1
  (`NOT IN EFFECT: 208 of 208`); simulated → exit 0 (`in effect: 208`);
  simulated with P1 applied → exit 1. The fail-open line
  (`--strip-origin | grep -q 'user messages flagged true 0 '`): simulated →
  prints; simulated with P4 applied → `user messages flagged true 208`, does
  not print; shipped → prints, by design (it checks N4, which today's tree
  satisfies trivially).
- **The Current-state grep, three states:** `67359a5e` → prints
  `current-state: no origin anywhere`; the simulated tree → exit 1; a
  directory with no `tests/` → exit 1.
- **Erratum 10, applied from the spec's own text.** A scratch applier
  (`apply2.js`) extracts E0–E4 from the errata package's spec and F0–F4 from
  this spec, refuses any anchor not occurring exactly once, and applies E then
  F to a copy of the Done spec at `67359a5e`: E adds `@@ -102,0 +103,43 @@`
  and four inline hunks; F adds `@@ -145,0 +146,25 @@` and inline markers on
  two lines (row A5: F1, F2; row A5e: F3, F4). `npm run lint` over the result:
  0 errors. The spec's erratum check (its `node - <<'EOF'` block, with the base
  read from a file instead of from git, its only change) → compliant
  `erratum 10: exact`; base without F (deliverable absent) → exit 1 (`inline
  marker not exactly once`); F applied plus one byte changed elsewhere →
  exit 1 (`other bytes changed`).
- **The boundary check** over the five Deliverables paths plus the spec →
  exit 0; over `src/core/dream/validate.js` and
  `skills/wienerdog-dream/SKILL.md` → exit 1.
- **Not executable here:** a Claude Code build whose label differs (the
  `--strip-origin` device stands in for it); any transcript set but this
  machine's.

## 5. What the code changed in the design

- **No sweep.** The brief expected the harness-records round's one-key
  fixture sweeps. They are not needed: that rule accepted only records
  carrying a field no fixture had, so every fixture broke; this rule acts only
  on records carrying a label no fixture has, so none does.
- **Step 5 reads `notification`, not `tainted`, for a user message.** Written
  as `accepted.role === 'user' ? notification : tainted`, rows N2 and N3 are
  independent — each has its own RED proof (P2, P1) that reddens without the
  other. Giving the notification the current state instead would have made N3
  depend on N2.
- **The `!codex` guard is load-bearing, not tidy.** Codex step 2 declines an
  unfamiliar top-level type without validating it, so a Codex line
  `{"type":"user","origin":{…}}` with no `message` would make the predicate
  throw; with a `message` it would taint the rollout. P6 pins it.
- **A comparison against the tree's own output is not a fail-open test.** The
  first `[NT-AC2]` compared each variant with the same tree's unlabelled
  projection, which a content heuristic moves in lockstep; the literal
  all-`false` row is what pins "today's behaviour". Found by P4, not by
  reading.
- **The ledger gate needs nothing, and is not strengthened.** It reads raw
  roles only; the notification is role `user` there.

## 6. Discovered, not fixed (routing)

- **The ledger gate's code-derived flag does not see a notification inside a
  skill's invocation window** (§3). Pre-existing; the model-asserted flag now
  sees it through the flagged message. Routed in the spec's Out of scope as a
  named residual for a later package, if the owner wants one.
- **`primary-dialogue.js:8-9`** still says harness-authored instructions "are
  not dialogue at all" — the same false sentence as the Done spec's `:150`,
  which `WP-dream-projection-done-spec-errata` records as a named gap. A code
  comment is outside that docs package's boundary; it is routed to whichever
  package next edits the header.

## 7. Rounds

Filled in by the orchestrator. Each round row cites the raw file's path and
the SHA of the commit that introduced it.

| Round | Tip | Raw file | Raw commit | Product findings | Outcome under §0 |
|---|---|---|---|---|---|
