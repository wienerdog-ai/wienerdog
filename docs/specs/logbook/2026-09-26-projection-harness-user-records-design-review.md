---
date: 2026-09-26
related_wps: [WP-dream-projection-harness-user-records, WP-dream-primary-dialogue-projection]
---

# WP-dream-projection-harness-user-records — design round record

The design round that turns the 2026-09-26 backlog stub into a spec. Written
by wd-architect on branch `docs/wp-projection-harness-user-records`, based on
`main` at `8117e221`. **At drafting time no external round had run.** The
rounds table (§8) is filled in by the orchestrator. Each raw file is committed
before it is adjudicated.

## 0. STOP CRITERION — pinned before round 1

Pinned per `docs/runbooks/codex-review.md` ("Finding disposition", the STOP
CRITERION bullet), in the shape of
`docs/specs/logbook/2026-09-26-vault-write-cas-window-design-review.md` §0.
Bands: **A** — silent wrong behaviour with a data-loss or security
consequence (for this package: a person's words silently dropped from the
dream, or harness or external text reaching it flagged `false`); **B** —
caught downstream; **C** — hygiene. **HEAVY** means the fix changes what the
implementer builds: `src/` behaviour, a Table H row's outcome or the fields it
reads, the Deliverables set (including which fixtures are swept), an Erratum
7–9 claim, or an owner item's recommendation. **LIGHT** means the fix touches
only this spec's verification machinery (a test, a check, a RED row, a
citation, the measurement script, wording).

Evaluated in this order; the first rule that matches decides.

0. **Band gate.** A band-A finding is HEAVY, whatever it touches.
1. **ESCALATES to the pre-pinned FALLBACK.** Suppose that at round 3, or at any
   later round, a HEAVY finding still lands on Table H. Then stop patching and
   re-cut the package to **candidate 0**: size S, docs and one test, no `src/`
   change. It files a dated erratum to
   `docs/specs/done/WP-dream-primary-dialogue-projection.md` that narrows its
   `:148-150` sentence to what the shipped code does ("not enforced for Claude
   `user` records the harness writes"), with this record's measured counts; a
   test pins today's acceptance of the task-notification shape as a named
   residual; and the choice of predicate goes to the owner as a decision.
2. **ESCALATES to a DESIGN QUESTION.** Suppose two consecutive rounds land
   findings on Table H — the ADR-0031 circuit-breaker. Then do not patch a
   third time. The next step is a canonical re-extraction or a re-decision of
   the accept-set, recorded here before any edit.
3. **ESCALATES to the OWNER.** This covers (a) a finding whose honest fix needs
   a measurement this repository cannot make — another machine's transcripts, a
   Claude Code build not installed here, Anthropic's intent for the
   `promptSource` and `origin` fields — and (b) a finding that argues against
   an owner item's recommendation. Each becomes an owner item or is recorded as
   input to the existing one, and neither counts as unresolved for closure.
   Nothing in the loop ratifies an owner item.
4. **HEAVY → FRESH ROUND.** Any other HEAVY finding: fix, re-run §4's
   mechanical checks, then one fresh external round, with this criterion
   re-stated at its head.
5. **LIGHT → CLOSES.** A round whose findings are all LIGHT (band B or C): fix
   in place, re-verify mechanically — the §4 simulation (`npm test` on the
   simulated tree, the decline-all dependency run, the three RED lanes, the
   measurement script base against simulated), the sweep and erratum checks
   three-state, the range check, `npm run lint` — and the loop **closes with no
   further external round**. A band-C finding may instead be dropped with a
   one-line reason recorded here.
6. **DONE** when a round finds nothing about the product. Machinery findings at
   that point are fixed or accepted as named residuals and do not extend the
   loop. The verification surface is **frozen** at three new tests
   (`[HUR-AC1]`–`[HUR-AC3]`), four RED proofs (P1–P4) and the commands in the
   spec's Verification steps: a machinery finding is fixed within that surface
   or accepted, never answered with more machinery.

## 1. Template conformance — round zero (architect's self-report)

`docs/runbooks/codex-review.md` requires this conformance read to come from a
**clean-context executor** given only the spec and the template. The table
below is the author's own check, recorded so that executor has something to
confirm or contradict. It does not replace that read.

| `_TEMPLATE.md` section | In the spec | Note |
|---|---|---|
| frontmatter: `id`, `title`, `status`, `model`, `size`, `depends_on`, `adrs`, `epic` | present | `status: Draft`, `size: S`, `epic: dream-primary-dialogue` |
| `# WP-<slug>: <title>` | present | matches the frontmatter title |
| authoring-rules bullet | present | verbatim |
| `## Context (read this, nothing else)` | present | includes the argument against the Done spec's heuristic ruling, the exchange consequence and provenance |
| `## Current state` | present | re-derived at `8117e221`; §3 below |
| `## Deliverables (permission boundary — touch ONLY these)` | present | 16 rows, boundary comment kept |
| `### Exact contracts` | present | predicate behaviour, the JSDoc, sweeps S1–S3, E0–E5 |
| `## Contract reference` | present | the trigger fires on three of seven |
| `### Contract table(s)` | present | Table H (canonical) as H4, plus an evidence table marked non-canonical |
| `### Mirrored Surface Checklist` | present | 7 bullets |
| `## Implementation notes & constraints` | present | includes the RED-proof register P1–P4 |
| `## Security checklist` | present | three bullets |
| `## Acceptance criteria` | present | AC1–AC7 plus the idempotence line as `N/A — …` |
| `## Verification steps` | present | three H3 subsections: current-state, implementation, local re-measurement |
| `## Out of scope (do NOT do these)` | present | |
| `## Definition of done` | present | items 0–5 |
| *(extra)* `## Dispatch precondition — owner items` | present | not a template section; three items; placed before Definition of done as in the cas-window spec |
| *(extra)* package note under the title | present | not a template section |

### Clean-context executor, round zero (orchestrator-run, 2026-09-26)

A fresh general-purpose agent on Sonnet, given exactly `docs/specs/_TEMPLATE.md`
and this spec at `b27edd44`, walked the template's section list and
frontmatter keys: **conformant** — every template section PRESENT verbatim in
order (H1 :12, Context :32, Current state :148, Deliverables :204, Exact
contracts :233, Contract reference :374, Contract table(s) :382, Mirrored
Surface Checklist :415, Implementation notes :452, Security checklist :513,
Acceptance criteria :525, Verification steps :572, Out of scope :630,
Definition of done :704); every frontmatter key present. Extra headings, all
allowed: Table H (H4, :384), three H3 subsections under Verification steps
(:574, :586, :614), `## Dispatch precondition — owner items` (:649). No
heading text inside a fenced block.

## 2. Measurements added by this design round

Run by the architect on the owner's machine (darwin 25.5.0, Node v25.9.0,
installed Claude Code `2.1.283`), against the local Claude transcripts under
`~/.claude/projects` — the one-directory-level layout `discoverClaude` reads.
**Counts, field values that are harness enums, and booleans only. No
transcript text was printed, read into this repository or sent anywhere.**
Record classes are decided by a fixed prefix test inside the scripts and
printed only as fixed labels. The committed re-measurement script is
`docs/specs/logbook/2026-09-26-projection-harness-user-records-measure.js`;
the exploratory probes (scratchpad, not committed) used the same discipline.

### 2.1 The orchestrator's five-day sample, reproduced

`node docs/specs/logbook/2026-09-26-projection-harness-user-records-measure.js --days 5`
at `8117e221` (the transcripts are live, so counts drift upward by the minute;
this is one point in time):

```text
files 55 | user records 3496 | harness versions 2.1.274 .. 2.1.283
ACCEPTED user messages, by class | promptSource | origin | taint state before the record:
    10 msgs      1205 chars  command-echo | promptSource=ABSENT | origin=ABSENT | taintBefore=false
    20 msgs      1851 chars  command-echo | promptSource=ABSENT | origin=ABSENT | taintBefore=true
   204 msgs    186556 chars  notification | promptSource=system | origin=kind=task-notification | taintBefore=true
     3 msgs     32291 chars  untagged | promptSource=ABSENT | origin=ABSENT | taintBefore=true
     1 msgs       348 chars  untagged | promptSource=queued | origin=kind=human | taintBefore=false
     3 msgs       345 chars  untagged | promptSource=queued | origin=kind=human | taintBefore=true
    40 msgs     22137 chars  untagged | promptSource=sdk | origin=ABSENT | taintBefore=false
     4 msgs       166 chars  untagged | promptSource=suggestion_accepted | origin=kind=human | taintBefore=true
    22 msgs     10825 chars  untagged | promptSource=typed | origin=kind=human | taintBefore=false
    61 msgs     16070 chars  untagged | promptSource=typed | origin=kind=human | taintBefore=true
assistant messages 559 | chars 395051 | sha256 a61a19dad1e1cc75
```

This reproduces the orchestrator's table (203 notifications at the time of its
run, 204 here; 30 command echoes; 83 typed; 8 queued/suggestion; 40 `sdk`; 3
marker-less "human by prefix").

### 2.2 The three marker-less records are not human

The orchestrator's table called three records "human by prefix, no marker at
all" and treated them as the cost of a fail-closed rule. Their top-level key
sets and two boolean prefix tests say otherwise:

```text
    1 MARKERLESS-UNTAGGED keys: cwd,entrypoint,gitBranch,interruptedMessageId,isSidechain,message,parentUuid,promptId,sessionId,session_id,timestamp,type,userType,uuid,version
    2 MARKERLESS-UNTAGGED keys: cwd,entrypoint,gitBranch,isCompactSummary,isSidechain,isVisibleInTranscriptOnly,message,parentUuid,promptId,sessionId,session_id,slug,timestamp,type,userType,uuid,version
```

Over the whole corpus (§2.3) all nine such records resolve the same way:

```text
     1 untagged-ABSENT isCompactSummary=false interruptedMessageId=false startsWith[Request interrupted=true startsWith(This session is being continued)=false
     6 untagged-ABSENT isCompactSummary=false interruptedMessageId=true startsWith[Request interrupted=true startsWith(This session is being continued)=false
     2 untagged-ABSENT isCompactSummary=true interruptedMessageId=false startsWith[Request interrupted=false startsWith(This session is being continued)=true
```

Seven are the harness's interruption marker and two are its compaction
summary (together 32,462 characters). The two compaction summaries alone are
32,291 characters on the five-day sample, more than every record in it with
`promptSource: "typed"` put together (26,895). **The fail-closed rule's measured cost in typed human prompts
is zero**, on the five-day sample and on the whole corpus; declining these nine
is a gain, not a cost.

### 2.3 The whole local corpus

`… --days 0` at `8117e221`:

```text
files 334 | user records 14129 | harness versions 2.1.232 .. 2.1.283
ACCEPTED user messages, by class | promptSource | origin | taint state before the record:
     2 msgs       117 chars  bash-mode | promptSource=ABSENT | origin=ABSENT | taintBefore=false
     6 msgs      2662 chars  bash-mode | promptSource=ABSENT | origin=ABSENT | taintBefore=true
    56 msgs      6501 chars  command-echo | promptSource=ABSENT | origin=ABSENT | taintBefore=false
    76 msgs      6980 chars  command-echo | promptSource=ABSENT | origin=ABSENT | taintBefore=true
     2 msgs       220 chars  command-echo | promptSource=ABSENT | origin=kind=human | taintBefore=false
   101 msgs    747334 chars  notification | promptSource=sdk | origin=kind=task-notification | taintBefore=true
  1002 msgs   3935297 chars  notification | promptSource=system | origin=kind=task-notification | taintBefore=true
     1 msgs        29 chars  untagged | promptSource=ABSENT | origin=ABSENT | taintBefore=false
     8 msgs     32462 chars  untagged | promptSource=ABSENT | origin=ABSENT | taintBefore=true
     2 msgs       387 chars  untagged | promptSource=queued | origin=kind=human | taintBefore=false
     6 msgs       926 chars  untagged | promptSource=queued | origin=kind=human | taintBefore=true
   257 msgs    109027 chars  untagged | promptSource=sdk | origin=ABSENT | taintBefore=false
    29 msgs      1161 chars  untagged | promptSource=suggestion_accepted | origin=kind=human | taintBefore=true
    78 msgs     39785 chars  untagged | promptSource=typed | origin=kind=human | taintBefore=false
   333 msgs     88762 chars  untagged | promptSource=typed | origin=kind=human | taintBefore=true
ACCEPTED user messages, by class:
  1103 msgs   4682631 chars  notification
   134 msgs     13701 chars  command-echo
     8 msgs      2779 chars  bash-mode
     0 msgs         0 chars  other-tag
   714 msgs    272539 chars  untagged
assistant messages 1983 | chars 1800574 | sha256 36badd9d165f761a
```

Readings, each used by the spec:

- **`promptSource: "sdk"` is not only a `claude -p` prompt.** 101 task
  notifications inside headless sessions carry `promptSource: "sdk"` beside
  `origin.kind: "task-notification"`. A rule of `promptSource ∈ {typed,
  queued, suggestion_accepted, sdk}` — the stub brief's first candidate —
  would re-admit all 101 (747,334 characters). That is why Table H's `sdk` row
  also requires the absence of `origin`. This is the one thing the five-day
  sample could not show: none of its 204 notifications was in a headless
  session.
- **`origin.kind: "human"` is not only a person's prompt.** Two slash-command
  echoes (`<command-message>` records) carry it with no `promptSource`. A rule
  keyed on `origin.kind` alone for the human arm would accept them. Neither
  carries non-empty `<command-args>` (§2.5), so nothing the person typed after
  the command name is lost by declining them.
- **Every task notification arrived with the taint state already set** —
  1,103 of 1,103 on the corpus, 204 of 204 on the sample. Owner item 3 rests
  on this.
- **Both fields are present on every harness version in the corpus**
  (2.1.232–2.1.283), per version:

  ```text
  2.1.232 {"ps=ABSENT origin=ABSENT":1,"ps=present origin=present":38}
  2.1.245 {"ps=present origin=ABSENT":9,"ps=present origin=present":17,"ps=ABSENT origin=ABSENT":2}
  2.1.252 {"ps=present origin=ABSENT":9,"ps=ABSENT origin=ABSENT":14,"ps=ABSENT origin=present":2,"ps=present origin=present":69}
  2.1.283 {"ps=present origin=present":39,"ps=ABSENT origin=ABSENT":1,"ps=present origin=ABSENT":1}
  ```

  (four of the 25 versions shown). Records carrying `promptSource` occur on
  every one of the 25, and every accepted record without it is in a harness
  class of the table above (command echo, `!`-command, interruption marker,
  compaction summary). No version in the corpus predates `promptSource`, so
  "an older harness" costs nothing that was measured; the oldest version in
  the corpus is 2.1.232.

### 2.4 The array-content shape of the Done spec's worked example

Over every Claude `user` record in the corpus with array-valued content
(11,884 records, not only accepted ones), the number that mixes a
`tool_result` block with a `text` block is **zero**. The accepted array-valued
records are five image prompts (`text` + `image`, all `promptSource: "typed"`)
and the seven interruption markers (`text` only, no `promptSource`). The Done
spec's worked example (a `tool_result` and the person's correction in one
record) is a constructed shape. Erratum 9 rests on this.

### 2.5 Slash-command echoes carry no arguments

Of the 84 accepted `<command-name>`/`<command-message>` echoes on the corpus
(the other 50 command echoes are `<local-command-stdout>`), a boolean test for
a non-empty `<command-args>` value was false on all 84 (82 with no `origin`, 2
with `origin.kind: "human"`).

The eight `!`-command records split by their leading tag (printed only when it
matched `/^<([a-z][a-z-]*)/`, the harness's markup name) into 4 `bash-input`
(the command the person typed) and 4 `bash-stdout` (its output), all with no
`promptSource` and no `origin`.

### 2.6 What the implemented rule does to the corpus (simulated)

A copy of the tree at `8117e221` (scratchpad, `.git` excluded) was given the
Table H predicate at the Exact-contracts site. The same measurement script,
run from that copy over the same 334 files:

```text
files 334 | user records 14129 | harness versions 2.1.232 .. 2.1.283
ACCEPTED user messages, by class | promptSource | origin | taint state before the record:
     2 msgs       387 chars  untagged | promptSource=queued | origin=kind=human | taintBefore=false
     6 msgs       926 chars  untagged | promptSource=queued | origin=kind=human | taintBefore=true
   257 msgs    109027 chars  untagged | promptSource=sdk | origin=ABSENT | taintBefore=false
    29 msgs      1161 chars  untagged | promptSource=suggestion_accepted | origin=kind=human | taintBefore=true
    78 msgs     39785 chars  untagged | promptSource=typed | origin=kind=human | taintBefore=false
   333 msgs     88762 chars  untagged | promptSource=typed | origin=kind=human | taintBefore=true
ACCEPTED user messages, by class:
     0 msgs         0 chars  notification
     0 msgs         0 chars  command-echo
     0 msgs         0 chars  bash-mode
     0 msgs         0 chars  other-tag
   705 msgs    240048 chars  untagged
assistant messages 1983 | chars 1800574 | sha256 36badd9d165f761a
```

**The assistant sequence is identical** — 1,983 messages, 1,800,574
characters, and the same digest over every assistant text and its flag, in
order. Declining the harness records changes no assistant message and no
`derived_from_untrusted` value on the corpus. Every accepted user message is
in Table H row H1 or H2, and every typed, queued, suggestion-accepted and
`sdk` prompt accepted before is still accepted (the counts per state match
§2.3 line for line).

## 3. Current state — citations checked at both ends

Every `file:line` range in the spec was printed at both ends by a scratch
helper (`ranges.js`, not committed), against `8117e221`:

| Citation | First line | Last line | Verdict |
|---|---|---|---|
| Done spec `:146-150` | `**What this package builds.** …` | `Harness-authored … not dialogue. There is` | OK |
| Done spec `:457`, `:458`, `:461`, `:462`, `:468` | rows A1, A2, A5, A5b, A5e | — | OK |
| Done spec `:562-563` | `sides. **There is therefore no field …` | `… from a human one.** Do` | OK |
| Done spec `:563-567` | `… from a human one.** Do` | `be worse than the known limitation. …` | OK (the ruling begins at the line's last word) |
| Done spec `:14-102`, `:102`, `:104` | the 2026-09-18 errata block; its last line; the `errata above` comment | — | OK |
| Done spec `:150`, `:343` | the E1 and E5 anchors | — | OK |
| `primary-dialogue.js:3-11` | `// THE PRIMARY-DIALOGUE PROJECTION …` | `// structure only (spec Table A).` | OK |
| `primary-dialogue.js:10-11` | `// call here and no heuristic over message CONTENT …` | `// structure only (spec Table A).` | **corrected from the stub's `:9-11`**, whose first line is the preceding sentence |
| `primary-dialogue.js:177-178`, `:179-202`, `:183-193`, `:194-200`, `:243-307` | JSDoc; `acceptClaude`; user branch; assistant branch; `record` | each construct's closing line | OK |
| `primary-dialogue.js:184`, `:185`, `:186`, `:187`, `:191-192`, `:305` | `isMeta`; `message.role`; `content`; string return; array join and return; the flag | — | OK |
| `primary-dialogue.js:264-283`, `:285-294`, `:296-306` | the STEP 2, STEP 3, STEP 4 comments | the closing `}` / `});` | OK |
| `claude.js:141` | `if (observer) observer.record(obj);` | — | OK |
| `dream-collect.test.js:37-56`, `:44-50`, `:965-971` | `function writeClaude(…) {`; `JSON.stringify({`; `const line = JSON.stringify({` | `}`; `})`; `});` | OK |
| `dream-collect.test.js:283`, `:957` | the two test titles | — | OK |
| `SKILL.md:53`; ADR-0020 `:404-407` | the primary-dialogue sentence; the amendment's Decision | — | OK |

The five erratum anchors (E1–E5) each occur exactly once in the Done spec
(`grep -c`, and the simulation in §4 refuses any anchor that does not).

## 4. Internal coherence pass — round zero

### 4.1 What was executed (not just read)

All on a copy of the tree at `8117e221` in the session scratchpad (`sim`,
`.git` excluded), Node v25.9.0. The draft predicate was a `Set` of the three
H1 values plus `promptSource === 'sdk' && origin === undefined`, placed
between `:185` and `:186`.

- **Which tests depend on Claude user acceptance.** Predicate in place, no
  fixture change: `npm test` → 3,083 tests, **41 fail** (39
  `primary-dialogue:`, plus `dream-collect: newest complete extract wins; …`
  and `sink-probe: transcripts — …`). Predicate replaced by an unconditional
  decline, fixtures swept: **41 fail, and the failing-identity list is
  byte-identical** to the first run (`diff` of the sorted `✖` lines). So those
  41 are exactly the tests that read Claude user acceptance, and no other test
  in `npm test` does. Baseline at `8117e221`: 3,083 tests, 0 fail.
- **The sweep repairs them without an expectation change.** Sweeps S1 (five
  `claude-*.jsonl`, `taint-cases.json` in its escaped form), S2 (four inline
  records) and S3 (`writeClaude`, the sink-probe record) applied with `sed` and
  one scripted insertion: `npm test` → 3,083 tests, **0 fail**.
- **The existing RED lanes on the swept tree.**
  `npm run red-proofs -- --wp WP-dream-primary-dialogue-projection` → all ten
  `pdp-*` `PROVEN` (run twice: before and after the new fixture file was
  added, because the invariant tests loop over every committed fixture);
  `--wp WP-dream-primary-dialogue-collection` → three `PROVEN`;
  `--wp WP-dream-collect-parse-throw-quarantine` → four `PROVEN`. Each run
  ends `RUN: FILTERED`, as a `--wp` run does.
- **The acceptance criteria are satisfiable and the RED shapes discriminate.**
  Draft tests `[HUR-AC1]`–`[HUR-AC3]` written to the AC text (every case AC1
  and AC2 list, including `"constructor"`), and a draft fixture for AC3 (a
  typed request; an `end_turn` reply; a `"system"`/`task-notification`
  record; an `end_turn` reply that must read `false`; a record with neither
  field; a `tool_use`; a `tool_result`; an `"sdk"`/`task-notification`
  record; an `end_turn` reply that must read `true`): `npm test` → 3,086
  tests, 0 fail. The four draft declarations P1–P4 against the draft code:
  `npm run red-proofs -- --wp WP-dream-projection-harness-user-records` → **P1,
  P2, P3, P4 `PROVEN`; criteria AC1, AC2, AC3 `PROVEN`**. The draft `find`
  strings name the draft code, so the spec marks the sets DERIVED.
- **The erratum, applied from the spec's own text.** `simulate-erratum.js`
  (scratch) extracts E0–E5 from the spec's fenced blocks and their anchors
  from the spec's prose, refuses an anchor that does not occur exactly once,
  and applies them to a copy of the Done spec. `diff -U0` shows exactly six
  hunks: `@@ -102,0 +103,39 @@` (E0), and one each at `:150`, `:343`, `:458`,
  `:462`, `:563`. markdownlint on the result: **0 errors** (after R0-c).
- **The verification lines, three states.** `checks.sh` (scratch) runs the
  spec's erratum, sweep and test-file lines with `git show`/`git diff`
  replaced by the `8117e221` files:

  ```text
  == SIMULATED  → PASS erratum, PASS sweep (all ten files), PASS test files
  == SHIPPED    → FAIL erratum, FAIL sweep (ten mismatches), PASS test files
  == ABSENT     → FAIL erratum, FAIL sweep, FAIL test files
  == VIOLATING  (one expected value edited) → FAIL test files
  ```

  The test-file line is green on the shipped tree by design: it asserts that
  nothing but S2 was removed, which an unchanged file satisfies; the sweep
  line is what detects a missing sweep.
- **The local re-measurement line** (the spec's command, verbatim, `--days 5`):
  on the shipped tree it prints the command-echo, notification and marker-less
  rows and no final line (exit 1); on the simulated tree it prints `every
  accepted user message is in H1 or H2` (exit 0), with the assistant digest
  `a61a19dad1e1cc75` equal on both.
- **The boundary check** over all 16 Deliverables paths plus a logbook path →
  exit 0; over `src/core/transcripts/claude.js` → exit 1.
- **Not executable here:** the real implementation's `find` strings and red
  sets (the code does not exist); the scenario harness (it spends model quota);
  any transcript set but this machine's.

### 4.2 Findings and dispositions

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| R0-a | The brief's first candidate, `promptSource ∈ {typed, queued, suggestion_accepted, sdk}`, re-admits 101 task notifications (747,334 characters) that carry `promptSource: "sdk"` inside headless sessions. The five-day sample has none, so it could not show this | A (harness text reaching the dream flagged `false`) | HEAVY | **Fixed before drafting.** Table H row H2 requires `sdk` **and** no `origin`; the Evidence table carries the 101; RED proof P3 pins the clause |
| R0-b | The alternative human arm, `origin.kind === "human"`, accepts two slash-command echoes | C | HEAVY (a Table H row) | **Decided:** H1 reads `promptSource`; the Evidence table records why |
| R0-c | E0 as first drafted (a separate blockquote before the `errata above` comment) fails markdownlint MD028: a blank line between two blockquotes | B | LIGHT | **Fixed.** E0 continues the existing blockquote after a `>` line; the simulation and lint re-run clean |
| R0-d | The local re-measurement filter as first drafted matched every line containing a pipe, including the header and the assistant summary, so it could never pass | B | LIGHT | **Fixed**, and caught by running it: the filter now reads only `msgs` rows |
| R0-e | The Deliverables had no row for the four scenario fixtures, whose premise is a user-role statement; without the sweep the real-brain harness would project no user text. `npm test` cannot see this | B | HEAVY (the Deliverables) | **Fixed.** Four rows, sweep S1, and the sweep-equality loop covers them |
| R0-f | The fixture sweep, if applied only to records a test expects accepted, would let the `isMeta` and `isSidechain` tests pass because Table H declined the record first | B | HEAVY (the sweep rule) | **Fixed.** S1 sweeps every Claude `user` record in the named files; the Implementation notes say why |
| R0-g | Context first said the fail-closed cost was "zero typed, queued or suggestion records lost" — true by construction and so evidence of nothing | C | LIGHT | **Fixed.** The claim is now that every record accepted today without `promptSource` is a harness kind (§2.2–§2.3) |
| R0-h | Context first counted "2 slash-command invocations" as the person-originated loss; all 84 `<command-name>`/`<command-message>` echoes are commands the person invoked. A clause about slash commands expanding into `isMeta` records was unmeasured | C | LIGHT | **Fixed.** 84 stated with §2.5's no-arguments measurement; the unmeasured clause removed |
| R0-i | Context first said "714 real prompts"; 9 of the 714 untagged records are compaction and interruption records | C | LIGHT | **Fixed:** 705 prompts, 240,048 characters (the simulated total, §2.6) |
| R0-j | Out of scope called the filter "parked"; it is superseded | C | LIGHT | **Fixed** |
| R0-k | Two inline code spans with leading spaces failed MD038 | C | LIGHT | **Fixed** by stating the indentation in words |
| R0-l | The stub's cite `primary-dialogue.js:9-11` for the "no heuristic over message CONTENT" sentence starts one line early | C | LIGHT | **Fixed** to `:10-11` |

## 5. What the round found that the stub did not know

- **The structural discriminator exists** (the stub's formulation C, left
  unmeasured): `promptSource` and `origin` separate every harness class from
  every prompt on 334 files and 25 harness versions. Formulations A and B
  (text-opening tests) are not needed, and the Done spec's heuristic ruling is
  not engaged.
- **The Done spec's A5b premise was measured on field names**, so its "no
  field can tell a routine prompt from a human one" is false by value —
  Erratum 8.
- **The stub's question 2 dissolves into a statement.** Row A2's assistant
  test never looks back at user records, so no "concluding reply" moves; the
  corpus digest confirms it. No positional rule is needed or taken.
- **The stub's question 3 has a measured answer for the corpus** — every
  notification arrives already tainted — and a structural answer for the
  package — declining is taint-neutral. The residual question moves to owner
  item 3 with both costs.
- **The stub's question 4 dissolves**: the test reads no text, so it sits
  before `message.content` is read and covers both returns at one site.
- **41 existing tests and four scenario fixtures depend on a field no fixture
  carried.** The stub sized the package without them.
- **The worked example's mixed record is a constructed shape** (0 of 11,884) —
  Erratum 9.

## 6. Discovered, not fixed (routing)

- **The scenario fixtures' assistant records carry no `stop_reason`**
  (`tests/scenarios/fixtures/claude-day1.jsonl` and siblings), so row A2
  already declines every assistant reply in them and the real-brain scenario
  dream reads user text only. Pre-existing since the projection landed; not
  this package's surface. Routed to the orchestrator as a candidate fix to the
  scenario fixtures.
- **`tests/fixtures/dream/transcripts/*.jsonl`** carry human `user` records
  with no `promptSource`; after this package they project no user text. No
  assertion depends on it (§4.1), so they are left; a later package that
  starts asserting on their dialogue must sweep them.

## 7. Rounds

Filled in by the orchestrator. Each round row cites the raw file's path and the
SHA of the commit that introduced it.

| Round | Tip | Raw file | Raw commit | Product findings | Outcome under §0 |
|---|---|---|---|---|---|
