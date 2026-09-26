---
date: 2026-09-26
title: "WP-dream-primary-dialogue-filter: the offline evaluation — measured, judged, disposition proposed"
related_wps: [WP-dream-primary-dialogue-filter, WP-dream-primary-dialogue-projection, WP-dream-primary-dialogue-collection]
---

# The filter's offline evaluation (2026-09-26)

This is the entry condition of `docs/specs/WP-dream-primary-dialogue-filter.md`
("Entry condition — the offline evaluation"), run under the owner's ruling of
2026-09-26 (`2026-09-26-owner-rulings-queue.md`, sentence 5): real transcripts
may be projected into a disposable vault and judged, on the condition that the
disposable vault lives only on the user's machine and is accessible to no one
else. This record holds identities, counts, verdicts and a proposed disposition.
It holds **no transcript text and no projected note**.

## Status

Evaluation **done**. Disposition **proposed, not applied**: the spec's decision
rule has two branches and the measured result fits neither cleanly (see "Applying
the decision rule"), so the spec stays `Draft` until the owner rules. The
recommended ruling is one line: *supersede the filter; file the deterministic
strip as a projection follow-up*.

## Setup (privacy properties, measured)

- **Disposable root:** `~/wd-eval/` (mode 0700), on the owner's machine only,
  not synced, not attached to the PR, not committed. It holds a copy of the
  Wienerdog core (`home/`, with an empty transcript ledger and no logs, secrets
  or run records), copies of the nine sample transcripts under `claude/projects/`
  and `codex/sessions/`, a `git clone --no-hardlinks` of the live vault checked
  out at **`b817b12`** (the 2026-09-24 03:34 dream commit, the last state before
  any of the samples was consolidated), the projected extracts, the judge packet
  and the judge's verdict. The live vault, the live ledger and the scheduled
  dream were not touched.
- **Redirection:** `WIENERDOG_HOME`, `WIENERDOG_CLAUDE_DIR` and `CODEX_HOME`
  pointed at the disposable root; `CLAUDE_CONFIG_DIR` was left alone so the
  brain and the judge ran under the owner's own subscription credentials
  (ADR-0009). The brain harness is Claude (the run never spawns Codex, so the
  `CODEX_HOME` override only redirected discovery).
- **Shipped code:** the installed app, `~/.wienerdog/app/current` = 0.15.0
  (`src/` on `main` at `c58869bb` is byte-identical to tag `v0.15.0`), run as
  `wienerdog dream --dry-run` then `wienerdog dream`.
- **Two by-products the live install must not see:** the brain's and the
  judge's own harness transcripts were written under `~/.claude/projects/` (as
  every `claude -p` run's are) and would have been discovered by tonight's live
  dream as new sessions. Both directories were moved to
  `~/wd-eval/harness-transcripts/`. The live ledger was not edited.

## Inputs (identities and sizes)

Nine sessions, chosen by the spec's coverage list — decisions with rationale,
corrections, an unresolved request, repetitive low-value dialogue, both
harnesses — from the owner's own 2026-09-23 → 09-26 sessions. Sizes as the
shipped code measured them (`intake` = the raw capped extract the 8 MB budget
is charged against; `projected` = the primary-dialogue file the brain read).

| # | harness:session_id | kind | raw bytes | intake bytes | projected bytes | msgs (user/assistant) |
|---|---|---|---:|---:|---:|---|
| 1 | `claude:08f9001f-b26d-4881-a3ca-5a8d39c7a276` | long project session (interior package): decisions, corrections, an error the person hit, subagent fan-out; **spans the 09-24 dream boundary** | 2,740,697 | 243,004 | 39,274 | 50 (22/28) |
| 2 | `claude:244e27e3-2c4c-4879-b469-fe7af3258cfe` | long project session (taps, worktops): rulings with reasons, parked options | 2,620,571 | 213,453 | 46,636 | 53 (25/28) |
| 3 | `claude:42e1c6b4-696c-496b-9bf7-70074817b335` | short project session (filing): drafts sent, open threads | 1,794,474 | 128,722 | 13,216 | 14 (9/5) |
| 4 | `claude:c1b03b99-c82e-4977-bc21-47efc89623fb` | scheduled daily-digest run: one machine prompt, one concluding reply | 1,145,338 | 90,591 | 3,527 | 2 (1/1) |
| 5 | `claude:95d5fe87-a704-465b-b679-f0279e17b48b` | one-request analysis (trading-set vetting) with a verdict and an open check; **also spans the 09-24 boundary** | 1,292,492 | 103,514 | 4,844 | 5 (3/2) |
| 6 | `claude:47e95686-3592-4787-ae1c-0220d1b02f61` | scheduled forecast lock: one machine prompt, one JSON reply | 446,095 | 4,676 | 4,831 | 2 (1/1) |
| 7 | `codex:01a0d2d3-8c26-7872-b559-d484f420c6c0` | Codex worker started by a parent Claude session | 2,709,800 | 29,896 | 4,941 | 4 (2/2) |
| 8 | `codex:01a0d332-04a7-7ea3-a44c-77aeafae95cf` | Codex worker started by a parent Claude session | 788,772 | 23,329 | 388 | **0** |
| 9 | `codex:01a0d8c4-91fe-7e40-893c-001a3d307193` | one-off analysis the person asked Codex for directly | 415,168 | 20,260 | 2,995 | 2 (1/1) |
| | **total** | | 13,953,407 | 857,445 | 120,652 | 132 |

The dry run reported exactly these: *claude sessions: 6, codex sessions: 3,
session text given to the memory pass: 120,652 bytes, transcript text measured
against the 8,000,000-byte limit: 857,445 bytes*. Projected message text is
98,121 characters. The nine sessions are one plausible night: the live ledger
shows the real dreams of 09-24/25/26 processed 19, 38 and 12 sessions.

**Codex workers project to nothing.** Five of nine Codex sessions measured while
choosing samples (rows 8 plus four not used) projected to zero messages: the
projection keeps `user` and `developer` roles only, and a worker's task arrives
in neither. The live ledger shows nights where Codex sessions dominate (215 on
09-20). For those the filter would have nothing to filter — the projection
already removes everything.

## The dream run

| item | value |
|---|---|
| command | `wienerdog dream` (installed 0.15.0), disposable root |
| brain model | `claude-opus-5-5` (read from the brain's own transcript; `dream_model` unset → the owner's default) |
| wall clock | 204 s (13:14:49 → 13:18:13 UTC) |
| brain work | 55 assistant records; tools Glob 6, Read 17, Grep 4, Write 2, Edit 9; 58,383 output tokens; 5.16 M cache-read tokens |
| result | commit `a5bb589` in the disposable vault — *5 notes, 0 skills; 0 refused, 0 out-of-vault*; 7 files, +339/−16 (two inbox notes and two project notes updated, the daily log created, the dream report, `reports/warnings.md`) |
| containment probe | pass; `run-evidence.jsonl` records the pinned `claude` 2.1.283, hook-free settings, no MCP |

## The judge

| item | value |
|---|---|
| model | `claude-opus-5-5`, `--effort high`, through the pinned `claude` 2.1.283 (`claude -p`), the owner's subscription |
| isolation | cwd = the packet directory; tools `Read,Glob,Grep` only; `--setting-sources ''`, the dream's hook-free `settings.json`, `--strict-mcp-config`; no vault, no live transcript root |
| inputs | the nine projected extracts (byte-identical to what the brain read); `notes-before/` = the pre-run text of the five changed notes; `vault-diff.patch` = `git diff b817b12 a5bb589` (39,434 bytes) |
| prompt | `~/wd-eval/judge/JUDGE.md` (in the disposable root; asks for A losses, B unsupported claims, C a KEEP/LOW-VALUE verdict on every block, D a verdict; forbids quoting more than twelve words) |
| work | 22 turns, 383 s; 858,343 cache-read + 176,295 cache-creation input tokens, 42,560 output tokens (32,456 thinking); list-price equivalent USD 2.43 |
| output | `~/wd-eval/judge/verdict.md`, 17,540 bytes — kept in the disposable root, not committed (it paraphrases the dialogue) |

The judge stated two limits itself: its character counts are estimates (it had
no code tool; ±10 %), and it could not see the baseline 09-24 daily log, which
`notes-before/` omits because the run did not change it.

## Findings

**A. Important losses — 20 listed: 3 high, 12 medium, 5 low.** All three high
ones and eight of the medium ones come from row 1, a session the 09-24 dream had
already partly consolidated (it grew past the boundary, its fingerprint
changed, the collector re-selected it whole). The brain judged the whole session
*already recorded* on the strength of the 09-24 daily log; a keyword check of
that log at `b817b12` shows it holds some of the material (the unbudgeted
category, the 110 V fixtures, the open trading-set check) and not the rest (the
door-schedule change, the joiner quote, the missing structural package, the
switch-brand conflict, the supplier-order preference). So the losses are real,
and their cause is **consolidation of a re-fed session**, not input noise. None
of the twenty sits in a block the judge marked LOW-VALUE.

**B. Unsupported claims — 8 listed: 0 high, 1 medium, 7 low.** The medium one is
a date attached to a contract signature the dialogue does not date. The rest are
inferences written as facts and one worker rollout cited for the wrong task.
*"The notes the dream wrote are otherwise faithful to the dialogue."*

**C. Not worth remembering — the measured quantity.** Judge's estimate: **41 of
71 blocks, 35,013 of 101,391 characters, 34.5 %**. Per session: the two long
project sessions 33.6 % and 29.2 %; the filing session 1.6 %; the vetting
session 4.0 %; the two scheduled runs and the two Codex workers 100 %; the
direct Codex analysis 0 %. Harm in the diff: *mild dilution, not errors* — a
per-lock entry in an already long project note, a 33rd addendum to a recurring
pattern note, two daily-log sections recording the scheduled runs, one sentence
that cites a worker rollout for the wrong task. The interim-status and
notification blocks of the long sessions *left no trace in the notes*.

**D. Verdict, quoted in substance.** Faithful: *partly* — no high-severity
unsupported claim; the high losses are the re-fed session. Mostly worth reading:
*no*, 34.5 % is low-value. Would a block-selection stage removing exactly the
LOW-VALUE blocks have improved the memory: **MARGINAL** — it would have removed
the four dilutions and 35 k characters of reading, lost nothing from A, and
*not fixed the high-severity losses, which came from a misjudgement about what
was already recorded*.

## What the low-value volume is made of (code-derived, exact)

Measured on the nine projected extracts by prefix class of each `user` message
(no content read):

| class of projected text | characters | share of 98,121 |
|---|---:|---:|
| `user` records that are **harness task notifications** (`<task-notification>` blocks reporting a subagent's completion) | 15,090 | 15.4 % |
| `user` records that are **local-command echoes** (`<command-name>`/`<local-command-stdout>`, e.g. `/exit`, `/clear`) | 1,009 | 1.0 % |
| `user` records that are scheduled-routine prompts (rows 4 and 6) | 612 | 0.6 % |
| `user` text the person actually wrote | 8,779 | 8.9 % |
| `assistant` text | 72,631 | 74.0 % |

The projection drops `isMeta` and `isSidechain` records; task notifications
and local-command echoes carry neither flag, so they pass through as `user`
messages, each one opening a new "exchange" whose concluding reply is the
brain's interim status line. A rule-based simulation over the same extracts —
drop those two classes, then keep only the last assistant message before the
next real user message — removes **27,509 characters (28.0 %) and 74 of 132
messages** (rows 1 and 2 go from 50 and 53 messages to 22 and 14), with no
model call. That is roughly four fifths of the judge's 34.5 %. What remains
low-value after the rule is the scheduled runs, the Codex worker prompts and the
forecast reply: about 12 k characters, whose only effect was two entries in
trend logs the owner may even want.

## Applying the decision rule

The spec's rule: *not material* (output faithful, surviving input mostly worth
reading) → `Superseded`; *material* → the number justifies the filter. The
result is a third case:

1. The volume is material by share (34.5 %) but not by effect: mild dilution,
   no loss inside it, and the judge rates the filter's benefit MARGINAL.
2. Four fifths of the volume is harness-authored `user` records that the
   deterministic projection's own contract already promises to remove ("with
   … harness-authored instructions removed by deterministic code"). That is a
   projection gap with a fixed-rule closure, not a judgement a model must make.
3. The real quality defect found — a session re-fed after growing across a
   dream boundary is scored as zero novelty — is in consolidation, and a filter
   stage cannot touch it.

**Proposed disposition (orchestrator; the owner rules):**

- **Do not build the Sonnet filter.** File `WP-dream-primary-dialogue-filter`
  `Superseded`, citing this entry. The second supervised model call, the
  runtime profile, the supervision generalisation and the descriptor binding
  would buy, at best, the residual 12 k characters per night.
- **File a Draft stub for the deterministic strip** (a projection follow-up,
  wd-architect to name and mature it): exclude Claude `user` records that are
  task notifications or local-command echoes, and re-derive the concluding
  reply across the removed records. The measured numbers above are its
  justification: −28 % characters, −56 % messages on this sample.
- **Register the re-fed-session finding** for the architect as a candidate
  package on the dream skill or the collector: when a session already recorded
  in the ledger is re-selected because it grew, the brain must consolidate what
  is new, not re-judge the whole session against the earlier log.
- Owner items 1–2 of the spec stay as written; item 2 is moot if the first
  bullet is accepted.

## Observations for a designer (from the judge and the measurements)

- Decisions sit in one-line user messages that only make sense beside a long
  assistant message; whole request/reply blocks are the right selection unit
  (the spec's C0 already says so).
- Every extract carries `truncated: true` because the raw capped extract had
  a cut somewhere, usually in tool output the projection then removed; the flag
  says nothing about the projected dialogue.
- Codex extracts have `ts: null` on every message.
- The scheduled forecast reply (row 6) is cut mid-JSON by the 4,000-character
  message cap.
- One assistant message embedded the person's own email address inside a link;
  the diff did not reproduce it.

## What was not done, deliberately

No transcript, projected extract, note text or judge paraphrase is committed.
The disposable root is left in place for the owner to inspect
(`~/wd-eval/judge/verdict.md` is the full verdict); deleting `~/wd-eval` is the
owner's act. No spec status changed. No new judge framework, no nightly judge.
