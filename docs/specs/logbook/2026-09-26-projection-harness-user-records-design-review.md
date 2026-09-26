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
