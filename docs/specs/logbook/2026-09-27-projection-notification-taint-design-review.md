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

### Clean-context executor, round zero (orchestrator-run, 2026-09-27)

A fresh general-purpose agent on Sonnet, given exactly `docs/specs/_TEMPLATE.md`
and the two specs at `89b77eb3`, walked the template's section list and
frontmatter keys. **`WP-dream-projection-notification-taint`: conformant** —
every template section PRESENT verbatim in order (H1 :12, Context :26, Current
state :144, Deliverables :201, Exact contracts :214, Contract reference :353,
Contract table(s) :363, Mirrored Surface Checklist :375, Implementation notes
:407, Security checklist :459, Acceptance criteria :474, Verification steps
:507, Out of scope :571, Definition of done :630); frontmatter complete; extra
headings all allowed (Table N :365, two H3s under Verification steps, the
Dispatch precondition :589). **`WP-dream-projection-done-spec-errata`:
conformant under the template's own rule** — the executor reported the two
H3s under Contract reference ABSENT, and the template (`_TEMPLATE.md:68`)
instructs "replace this whole section with `N/A — …`" when fewer than two
triggers fire, which is what the spec did (:197-199); Security checklist is
N/A-marked (:216-218); frontmatter complete; no extra headings.

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

> **Revision 1 (after round 1).** The paragraph above is round zero's reading,
> kept as history. Round 1 (§7, R1-1) showed the "named residual" is a path
> this package's own Tier-3 claim depends on; revision 1 closes it in code
> (Table N rows N6–N7) and the spec's Context now states the ledger gate's
> new input. See §8.

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

- ~~**The ledger gate's code-derived flag does not see a notification inside a
  skill's invocation window** (§3). Pre-existing; the model-asserted flag now
  sees it through the flagged message. Routed in the spec's Out of scope as a
  named residual for a later package, if the owner wants one.~~ **Withdrawn in
  revision 1**: round 1 made it this package's finding R1-1, closed by Table N
  rows N6–N7 (§7, §8).
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
| 1 | `89b77eb3` | `docs/specs/logbook/2026-09-27-projection-notification-taint-design-r1-astra-raw.json` | `722b2282` | 1 (R1-1 A/HEAVY, on Table N and the spec's Tier-3 claim) | rule 0 (band A) → rule 4: fixed in revision 1 (§8); one fresh round owed. Rule 1 did not fire (the fix is not a net, and this is round 1); rule 2 not yet (first round on Table N) |

Round zero's clean-context conformance read (`1b83e78d`) found both specs
conformant. The raw was committed before adjudication (`722b2282`).

### Round 1 — adjudication (the orchestrator proposed the disposition; the architect applied it)

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| R1-1 | The spec claimed a candidate supported by a flagged notification cannot reach Tier 3, but its named residual left a path open: the learnings-ledger validator derives trust from raw `tool_result` roles and never sees the notification's projection flag, so a notification inside a skill's invocation window can support a ledger entry declared `false` without refusal, and three such sessions can authorize a skill-body revision | A | HEAVY | **Fixed in code (route 1 of the reviewer's two).** New Table N rows N6–N7: the gate extract carries the text-free key `task_notification: true` when the session held a labelled record, and `invocationWindowTainted` treats every window of such a session as tainted; only the key's absence reads clean. Session-level rather than positional (§8.2). New deliverables `src/core/transcripts/index.js`, `src/core/dream/validate.js`, ADR-0020 (an amendment); Erratum 10 gains F5 on row B2; AC4–AC5 and RED proofs P8–P11 added; **size re-derived: M**; owner item 4 added (accept the amendment, and the session-level choice with its cost) |

**How §0 applies, stated.** Rule 0: the finding is band A — a trust decision
the design claimed to protect could be made on content flagged as external —
so it is HEAVY. Rule 1 (the no-net rule) does not fire: the fix adds no
detector, counter, quarantine, halt or retry — it carries the same exact label
one step further, raises only, and degrades exactly as N4 does (no label → the
key is absent → today's ledger verdict). Rule 1(b) needs round 3. Rule 2 needs
two consecutive rounds on Table N; this is the first. Rule 3 does not apply:
the honest fix needed no measurement this repository cannot make and argues
against no owner recommendation — the narrow-the-claim route would have been
an owner question, and the code route made it unnecessary. Rule 4: fix,
re-run the mechanical checks (§8), one fresh round.

**Mirrors found while applying it, registered in the same pass:** ADR-0020's
2026-09-17 amendment sentence "A user message is `false` by role regardless
of what preceded it" (now narrowed by the new amendment, not edited in place)
and the Done spec's row B2 (the gate extract's shape, marked by F5). Round
zero missed both.

**ADR-0031 circuit-breaker, noted for round 2:** round 1 landed on Table N.
If round 2 lands on Table N again, §0 rule 2 fires: no third patch; a
re-decision is recorded here first.

### STOP CRITERION — restated at the head of round 2

§0 unchanged in order and outcomes, with these updates. **Band A** also
covers a learnings-ledger window read clean for a session whose gate extract
carries the key, and a ledger verdict moved toward acceptance. **HEAVY** also
covers Table N rows N6–N7, the gate key's name, presence or value, the
validator line and its refusal text, and the ADR-0020 amendment's claims.
**The no-net rule (rule 1(a)) is unchanged and binds the ledger half too:** a
finding whose fix is a detector, counter or retry on the ledger path re-cuts
to the fallback. **Fallback level 1** (flag the message only) still applies
only when every firing finding lands on row N2 alone, and it leaves rows N6–N7
in place. A HEAVY finding on N6–N7 whose honest fix is positional is not
patched: it becomes input to owner item 4 (rule 3(b)), whose positional
variant is already priced. **The
frozen verification surface** (rule 6) is now: tests under the five tags
`[NT-AC1]`–`[NT-AC5]`, the eleven RED proofs P1–P11 in one declaration file,
and the commands in the spec's Verification steps. LIGHT closure (rule 5)
re-verifies with §8.3's checks.

### Round 2 — the finding, and the rule-2 re-decision (recorded before any spec edit)

The raw was committed before adjudication (`8a399c61`). The reviewer verified
R1-1 closed.

| Round | Tip | Raw file | Raw commit | Product findings | Outcome under §0 |
|---|---|---|---|---|---|
| 2 | `d36ee3da` | `docs/specs/logbook/2026-09-27-projection-notification-taint-design-r2-astra-raw.json` | `8a399c61` | 1 (R2-1 A/HEAVY, Table N row N7's predicate); R1-1 verified closed | rule 0 (band A) → **rule 2 fires as written** (second consecutive round on Table N) → re-decision below, recorded before the edit → then rule 4: one fresh round owed |

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| R2-1 | Row N7 says only an ABSENT `task_notification` key reads clean, but the prescribed `extract.task_notification !== undefined` reads a key PRESENT with the value `undefined` as clean. The producer writes only `true`; a malformed or version-skewed in-memory gate extract could carry it, and the ledger would then keep a `false` declaration for a notification-bearing session. AC5 tests `false`, `"yes"`, `0` and `null` but not `undefined` | A | HEAVY (changes `src/` behaviour) | **Re-decided (below), then fixed in revision 2** |

**Which rule, and why the coordinator's reading is not the one applied.** The
coordinator read rule 2 as not firing, on the ground that R2-1 is a predicate
defect on the new row while R1-1 was a missing path — different kinds. §0
rule 2 as pinned does not distinguish kinds: "Two consecutive rounds land
findings on Table N". Round 1 landed on Table N (the claim N5/N7 were then
written to close) and round 2 lands on row N7. So rule 2 fires, and its
prescribed step is this: **do not patch a third time; record a re-decision of
the class or the rule before any edit.** Rule 1 does not fire first: the fix
is not a net, and this is round 2, not round 3. The outcome is the one the
coordinator described either way — N7's predicate restated — but it is
reached by the rule as written.

**The re-decision — N7's clean state, enumerated.** The defect is that N7
enumerated its good state in words ("absent") and then tested a *value*.
Re-decided: **the one clean state is that no property named
`task_notification` is reachable on the gate extract at all — neither its own
nor inherited.** Every other state taints: an own property with any value
(`true`, `false`, `undefined`, `null`, anything), and an inherited one. The
test is `'task_notification' in Object(extract)`:

- `in` asks the question N7 states — is the name there — and never reads a
  value, so no value can read clean;
- it is stricter than the reviewer's `Object.hasOwn(extract, …)`, which would
  read an **inherited** property clean — the same class of hole one level up;
  an inherited key can only come from a polluted prototype, which then taints
  every session: the fail-closed direction;
- `Object(extract)` boxes a primitive instead of throwing, so a malformed
  extract that is a truthy primitive (rule (h) already refuses `null` and
  `undefined` before this point) reads as having no such property — exactly
  what `Object.hasOwn` and today's property reads do for a primitive, so no
  new throw is introduced.

**What changes with it, all within the frozen surface (rule 6).** Row N7's
text; the Exact-contracts validator line; the ADR-0020 amendment's wording of
the clean state; AC5 gains the `undefined` value and an inherited-property
case; RED proof P9's `find` follows the new line; RED proof P10 is re-pointed
from the truthiness mutation (`=== true`) to **the round-2 defect itself**
(`extract.task_notification !== undefined`), so the proof that reddens is the
one that reads a present-`undefined` key clean — its `expectRed` names
`nt-ac5 malformed undefined`. The `=== true` mutant is still caught by the
same AC5 loop (it reads `false`, `"yes"`, `0`, `null` and `undefined` clean),
but no longer has a proof of its own; the inherited-property case is asserted
in AC5 and has no proof of its own. Both are within rule 6: a machinery
change inside the frozen surface, not new machinery. Tags stay `[NT-AC1]`–
`[NT-AC5]`, proofs stay eleven.

### STOP CRITERION — restated at the head of round 3

§0 unchanged in order and outcomes, with round 1's and round 2's updates.
**Round 3 is the pinned boundary: rule 1(b) now binds.** A HEAVY finding on
Table N at round 3 or later re-cuts the package to the fallback — **level 1**
(flag the message only, dropping N2 and its proof and assertion) when every
firing finding lands on row N2 alone; **level 0** (build nothing; the
provenance path recorded as a named residual in a dated Done-spec erratum;
the owner told the commissioned design did not close) otherwise. A HEAVY
finding on rows N6–N7 whose honest fix is positional goes to owner item 4 as
input (rule 3(b)), as restated for round 2. A round of LIGHT findings closes
under rule 5 with §8.3's and §9's checks. The frozen verification surface is
unchanged: tags `[NT-AC1]`–`[NT-AC5]`, RED proofs P1–P11 in one declaration
file, and the spec's Verification steps.

### Round 3 — adjudication and closure

The raw was committed before adjudication (`300046f4`). The reviewer verified
R2-1 closed.

| Round | Tip | Raw file | Raw commit | Product findings | Outcome under §0 |
|---|---|---|---|---|---|
| 3 | `1fecd230` | `docs/specs/logbook/2026-09-27-projection-notification-taint-design-r3-astra-raw.json` | `300046f4` | 1 (R3-1; reviewer A/HEAVY, adjudicated **B/LIGHT**); R2-1 verified closed | **rule 5: all findings LIGHT → the loop closes with no further external round** |

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| R3-1 | Row N7's presence test (`'task_notification' in Object(extract)`) reads an inherited property too, so if `Object.prototype` ever acquires `task_notification`, every gate extract reads tainted, unlabelled sessions included — in tension with N4's promise that an unlabelled record changes no ledger verdict. The reviewer called it a conditional in-process prototype-pollution scenario and established no pollution source; it recommended a null-prototype gate extract and a test of an unlabelled session under a polluted prototype | reviewer **A**; adjudicated **B** | reviewer HEAVY; adjudicated **LIGHT** | **Accepted residual, named, plus LIGHT wording.** Row N4 is scoped to the harness label ("an absent, malformed or renamed label projects as today"; runtime prototype state is outside its scope); row N7 gains one sentence stating the fail-closed behaviour under a polluted prototype as intended, citing AC5's inherited case as its pin. Mirrors: the Context's "central property" paragraph, the "Enumerate our own good" implementation note (and "do not give the gate extract a null prototype"), the ADR-0020 amendment's "Fail-open by construction" paragraph. No `src/` contract changes; the surface stays at five tags and eleven proofs |

**Who adjudicated, and on what authority.** The band and weight above are the
**orchestrator's**, made under the owner's standing authority for the night of
2026-09-27 and recorded here so that **the owner can reverse them**. The
architect applied them and records that they agree with §0 as pinned:

- **Band B by §0's own definitions.** §0's band A names four consequences —
  a flagged record reaching the dream `false`; a message removed, re-worded
  or a flag lowered; a ledger or Tier-3 verdict **lowered**; and an absent,
  malformed or renamed *field* producing anything but today's projection. A
  polluted prototype is none of them: it makes the ledger *refuse* more
  (every window tainted, `false` declarations refused loudly and reported),
  lowers nothing, promotes nothing untrusted and loses no note. What it costs
  is skill-revision availability, under a precondition — in-process prototype
  pollution — that already compromises the whole process. That is §0's band
  B, "costing quality rather than safety".
- **The direction was chosen on purpose.** Round 2's re-decision (above)
  took `in` over `Object.hasOwn` precisely so an inherited property cannot
  read clean; the two predicates are mirror images — `in` fails closed under
  pollution, `hasOwn` fails open — and AC5's inherited-only case already pins
  the closed direction. The repository's stated preference on an unanswerable
  question is the same (ADR-0023's direction).
- **N4's promise is about the harness label, not process state**, so scoping
  its wording is the honest fix, not a behaviour change.
- **The reviewer's fix would be HEAVY for no measured benefit.** A
  null-prototype gate extract changes the value's shape for every consumer
  (`assert.deepStrictEqual` compares prototypes), which would re-open Table N
  at the pinned round-3 boundary.
- **LIGHT by §0's definition:** the change touches wording only — no `src/`
  behaviour, no Table N outcome, no field read, no Deliverables row.

**Mechanical re-verification (rule 5)**, after the wording edits:
`coherence.js` → 74 checks, all PASS (no code block changed); Erratum 10 and
the ADR-0020 amendment re-applied from the spec's own text → the spec's check
prints `erratum 10 and the ADR-0020 amendment: exact`, and `npm run lint` over
both results → 0 errors; `npm run lint` on the branch → passes. No code,
test or declaration changed since §9, so §9's `npm test` and RED-lane results
stand.

**CLOSED — the design gate closes at round 3 under §0 rule 5.** Three external
rounds: R1-1 (A/HEAVY, a missing ledger path — fixed in code), R2-1 (A/HEAVY,
N7 tested a value — re-decided under rule 2, fixed), R3-1 (B/LIGHT, accepted
residual and wording). The frozen verification surface is final: tags
`[NT-AC1]`–`[NT-AC5]`, RED proofs P1–P11, the spec's Verification steps.
**`status:` stays `Draft`**: the second gate (wd-reviewer) runs on the PR
next, and the architect flips the spec to `Ready` after it. Dispatch then
still waits for the owner's rulings on owner items 1–4.

## 8. Revision 1 — after round 1

### 8.1 Measurements

The committed script
`docs/specs/logbook/2026-09-27-projection-notification-taint-ledger-measure.js`
(counts only; it reads only the text-free gate extract) runs the tree's
`parsePrimaryWithOutcome` over the local Claude transcripts and, for every
(session, invoked skill) pair — the unit rule (h) derives trust for — reports
whether the pair's invocation windows hold an external `tool_result` and
whether the session's gate extract carries the key. `--days 0`, back to back:

```text
== shipped tree (67359a5e's src/)
sessions 334 | carrying task_notification in the gate value 0
(session, invoked skill) pairs 42 | in sessions carrying it 0
pairs clean before this package (no external tool_result in any window) 0
  of them tainted by row N7 0

== simulated tree (revision 1)
sessions 334 | carrying task_notification in the gate value 54
(session, invoked skill) pairs 42 | in sessions carrying it 32
pairs clean before this package (no external tool_result in any window) 0
  of them tainted by row N7 0
```

Readings: 54 of 334 sessions hold a labelled notification; 32 of the 42
(session, skill) pairs are in such sessions; **none of the 42 is clean today**
— every skill window on the corpus already holds an external `tool_result` —
so rows N6–N7 move no ledger verdict on the owner's data. They close the path
round 1 found for a tool-free skill window, which ADR-0020 calls "genuinely
revisable". The same numbers price owner item 4: if tool-free skills come
into use, a session-level rule bars 32 of 42 pair-shaped opportunities where a
positional one would bar only those whose window holds the notification.

The projection measurement re-run on the revision-1 tree (the predicate is now
decided before step 2) reproduces §2's properties at a later point in time
(the corpus grew by two assistant messages): shipped exit 1 (1,107 of 1,107
`false`); simulated exit 0 (1,107 flagged); the assistant digest equal on
both (`7af53fdb95323bda`, 1,997 messages); the simulated tree with
`--strip-origin` reproduces the shipped whole-projection digest
(`414bfee659bd66eb`, 3,963 messages). The shipped-tree run was repeated after
the others with identical output.

### 8.2 The route, and why session-level

The reviewer offered two routes: carry notification provenance into the
ledger's code-derived check, or narrow the Tier-3 claim and put the path to
the owner. The code route was taken: it closes the path without reading
content and without a net, and a package parked on a ruling does not ship.

Two shapes of the code route were drafted on the simulated tree:

- **Positional** (drafted first, then set aside): the raw parser passes its
  message count to the observer (`claude.js:141`), the projection records the
  raw position of each labelled record, `parsePrimaryWithOutcome` rebases the
  positions under the 2,000-message cap as `capExtract` rebases invocation
  indices, and the validator taints a window whose `[index, end]` holds a
  position. It needs a fourth source file, a rebase, and a tie rule for a
  position on a window boundary (a notification with no raw message of its
  own — an array-content record — sits at the next message's position); it
  measured the same 0 moved verdicts.
- **Session-level** (taken): one constant key on the gate extract, one line
  in the validator. No positions, no rebase, no ties; a notification the cap
  drops still counts. Its cost — over-tainting a tool-free window elsewhere in
  a session that ran a background task — is stated in owner item 4 with the
  32-of-42 number.

The simpler shape was taken because the precision it gives up moved nothing
measured, and the geometry it avoids is the class of bug ADR-0020's round 6
found exploitable.

### 8.3 Mechanical checks re-run

All on the simulated tree, rebuilt from `89b77eb3` plus the revision-1 draft
(`primary-dialogue.js`, `index.js`, `validate.js`, the fixture, the test file,
the declaration file), Node v25.9.0.

- **`npm test`** → 3,088 tests (3,083 + the five `[NT-AC*]`), **0 fail**, with
  no existing test or fixture edited. The Done suite's worked example, which
  deep-equals a gate extract, holds no label and is unchanged.
- **The new ACs, reproducing the finding.** `[NT-AC5]`'s "no label" case keeps
  a `false` declaration for the gate worked example — the round-1 path, which
  is still what an unlabelled session does — and the labelled case refuses it.
- **RED proofs, derived.** `validateProof` accepts all eleven; every `find`
  occurs exactly once; `npm run red-proofs -- --wp
  WP-dream-projection-notification-taint` → **P1–P11 `PROVEN`; criteria
  NT-AC1–NT-AC5 `PROVEN`**, `RUN: FILTERED`. Derivation corrected three first
  guesses: P4 (content heuristic) now also reddens `[NT-AC3]`, `[NT-AC4]` and
  `[NT-AC5]` (with the label stripped, a text-prefix rule still sets the gate
  key); P8 (gate key dropped) also reddens `[NT-AC5]`; P11's first mutation
  (`notified` gated on `claudeShape(obj).classified`) left a block-type reject
  green because `claudeShape` does not check block types — `[NT-AC4]` now
  tests a schema reject (content `7`) and a block reject separately, and P11
  reddens the schema one.
- **Every RED lane whose proofs mutate a file this package edits** (the
  spec's Verification list): `WP-dream-primary-dialogue-projection`,
  `WP-dream-primary-dialogue-collection`,
  `WP-dream-collect-parse-throw-quarantine`,
  `WP-transcript-parsers-harden-text-values`,
  `WP-audit-e-ledger-parser-corpus`, `WP-dream-git-env-validate-seam`,
  `WP-ep2-prune-once-per-run-test`,
  `WP-quarantine-failed-preserve-disposal-flush`,
  `WP-quarantine-only-copy-shelf`, `WP-quarantine-preserve-durability` — every
  one only `PROVEN` lines, no `FAILED`. All 193 declared `find` strings in the
  repository occur exactly as declared.
- **The spec's texts are the draft's texts** (`coherence.js`, scratch, 74
  checks, all PASS): the projection fixture byte-equal; the gate example's
  five lines verbatim in the test; the predicate body, the four
  `createPrimaryProjection` edits, the `index.js` line and the `validate.js`
  line verbatim; the refusal text verbatim; the gate literal equal to the
  test's expectation; every register row's id, trimmed `find`, derived tags
  and signals.
- **Erratum 10 and the amendment, applied from the spec's own text.** E0–E4
  (the errata package) then F0–F5 on the Done spec at `67359a5e`: F adds
  `@@ -145,0 +146,29 @@` and inline markers on three lines (row A5: F1, F2;
  row A5e: F3, F4; row B2: F5). The amendment inserted before `## Future work
  (parked, not specced)` in ADR-0020. `npm run lint` over both results: 0
  errors. The spec's check (its `node - <<'EOF'` block with `base(f)` reading
  files instead of git, its only change): compliant → `erratum 10 and the
  ADR-0020 amendment: exact`; Done spec without F → exit 1 (`inline marker not
  exactly once`); ADR without the amendment → exit 1 (`the ADR-0020 amendment
  is not directly before Future work`); ADR with the amendment and one byte
  changed elsewhere → exit 1 (`other bytes changed in ADR-0020`).
- **The Current-state greps, three states each:** the `origin` grep as in §4;
  the new `task_notification` grep → `67359a5e` prints `current-state: no gate
  key yet`; the simulated tree → exit 1; no `src/`/`tests/` → exit 1.
- **The boundary check** over the eight Deliverables paths plus the spec →
  exit 0; over `src/core/transcripts/claude.js` and
  `docs/specs/done/WP-dream-primary-dialogue-collection.md` → exit 1.
- **Citations added in revision 1**, both ends: `primary-dialogue.js:142-154`,
  `:153`, `:168`, `:254-262`, `:309`; `index.js:223`, `:274`;
  `validate.js:497-509`, `:506`, `:516`, `:520`, `:521-524`, `:647`;
  `SKILL.md:119-121` (**corrected from a first-drafted `:117-122`**, which
  began two lines early); ADR-0020 `:88-100` (the rule begins at `:88`'s last
  words), `:400-471`, `:469-471`, `:473`; Done spec `:476`.

## 9. Revision 2 — after round 2

Applied after the re-decision in §7 was committed (`a36b3b78`).

**Edits, every registered mirror of row N7 walked.** Table N row N7 (the
clean state enumerated as "no property of that name reachable"); the
Exact-contracts validator line, now `if ('task_notification' in
Object(extract)) return true;`, with the reason no value test and no
`Object.hasOwn` is used; the Implementation note "Enumerate our own good"; AC5
(`undefined` added to the malformed values, and an inherited-property case);
the RED register rows P9 (`find` follows the line) and P10 (re-pointed to the
round-2 defect, renamed `nt-p10-ledger-reads-value-not-presence`); the ADR-0020
amendment's wording of the clean state; the status banner. **Not changed,
checked:** F0 and F5 of Erratum 10 state no predicate (F0 says the validator
"treats every invocation window of that session as tainted"), so neither
moves; rows N4 and N6 and the Context's ledger paragraph describe the key's
producer and effect, not the predicate.

**Mechanical checks re-run on the simulated tree** (the revision-1 tree with
the N7 line, the AC5 assertions and the two declarations changed):

- `npm test` → 3,088 tests, **0 fail**.
- `npm run red-proofs -- --wp WP-dream-projection-notification-taint` →
  **P1–P11 `PROVEN`; criteria NT-AC1–NT-AC5 `PROVEN`**, `RUN: FILTERED`. P10
  (the round-2 defect as a mutation) reddens exactly `nt-ac5 malformed
  undefined`. `validateProof` accepts all 193 declarations in the repository,
  and every `find` occurs exactly as declared.
- The two rejected predicates, run against the new AC5 by hand:
  `Object.hasOwn(extract, 'task_notification')` fails exactly `nt-ac5
  inherited :: refused`; `extract.task_notification === true` fails at `nt-ac5
  malformed undefined :: refused` (the loop's first case). The presence test
  passes all.
- The ten lanes whose proofs mutate a file this package edits (§8.3's list)
  → only `PROVEN` lines, no `FAILED`.
- `coherence.js` → 74 checks, all PASS (the validator block now verbatim).
- Erratum 10 and the amendment re-applied from the spec's own text → the
  spec's check prints `erratum 10 and the ADR-0020 amendment: exact`; `npm
  run lint` over both results → 0 errors. The check's body is unchanged since
  §8.3, whose absent and violating states stand.
- `npm run lint` on the branch → passes.
