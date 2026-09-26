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
It holds **no transcript text, no note text and no paraphrase of what any
session or note is about** — the repository is public. The evidence with
substance stays in the owner-only evaluation root.

## Status

Evaluation **done** (two judge rounds; the second was owed to the Codex gate on
this record, `…-eval-record-r1-astra-raw.json`). Disposition **proposed, not
applied**: the spec stays `Draft` until the owner rules. The recommended ruling
is one line: *supersede the filter; file the deterministic strip as a fix
against the projection's Done contract*.

## Setup (privacy properties, measured)

- **Disposable root:** `~/wd-eval/` (mode 0700), on the owner's machine only,
  not synced, not attached to the PR, not committed. It holds a copy of the
  Wienerdog core (`home/`, with an **empty transcript ledger** and no logs,
  secrets or run records), copies of the nine sample transcripts under
  `claude/projects/` and `codex/sessions/`, a `git clone --no-hardlinks` of
  the live vault checked out at **`b817b12`** (the 2026-09-24 03:34 dream
  commit), the projected extracts, the judge packet and both verdicts. The
  live vault, the live ledger and the scheduled dream were not touched.
- **Redirection:** `WIENERDOG_HOME`, `WIENERDOG_CLAUDE_DIR` and `CODEX_HOME`
  pointed at the disposable root; `CLAUDE_CONFIG_DIR` was left alone so the
  brain and the judge ran under the owner's own subscription credentials
  (ADR-0009). The brain harness is Claude, so the `CODEX_HOME` override only
  redirected discovery.
- **Shipped code:** the installed app, `~/.wienerdog/app/current` = 0.15.0
  (`src/` on `main` at `c58869bb` is byte-identical to tag `v0.15.0`), run as
  `wienerdog dream --dry-run` then `wienerdog dream`.
- **A design flaw of this setup, found by the judge's second round and
  confirmed against the live ledger:** rows 1 and 5 below had already been
  consolidated by the live 2026-09-24 dream — at exactly their present sizes,
  so they never grew — and the baseline `b817b12` is that dream's commit. With
  an empty ledger the disposable run fed them in again against a vault that
  already held their first pass. Whatever the run did with those two rows
  measures *how the dream treats a session whose earlier pass is on record*,
  not a production re-feed. The other seven rows post-date the baseline.
- **Two by-products the live install must not see:** the brain's and the
  judge's own harness transcripts were written under `~/.claude/projects/` (as
  every `claude -p` run's are) and would have been discovered by tonight's live
  dream. Both directories were moved to `~/wd-eval/harness-transcripts/`. The
  live ledger was not edited.

## Inputs (identities and sizes)

Nine sessions, chosen by the spec's coverage list — decisions with rationale,
corrections, an unresolved request, repetitive low-value dialogue, both
harnesses — from the owner's own 2026-09-23 → 09-26 sessions. Sizes as the
shipped code measured them (`intake` = the raw capped extract the 8 MB budget
is charged against; `projected` = the primary-dialogue file the brain read).
The "shape" column describes dialogue structure only.

| # | harness:session_id | shape | raw bytes | intake bytes | projected bytes | msgs (user/assistant) |
|---|---|---|---:|---:|---:|---|
| 1 | `claude:08f9001f-b26d-4881-a3ca-5a8d39c7a276` | long project session: rulings with reasons, a correction after an error the person hit, subagent fan-out; **already consolidated at the baseline** | 2,740,697 | 243,004 | 39,274 | 50 (22/28) |
| 2 | `claude:244e27e3-2c4c-4879-b469-fe7af3258cfe` | long project session: rulings with reasons, parked options, subagent fan-out | 2,620,571 | 213,453 | 46,636 | 53 (25/28) |
| 3 | `claude:42e1c6b4-696c-496b-9bf7-70074817b335` | short project session: drafts sent, open threads | 1,794,474 | 128,722 | 13,216 | 14 (9/5) |
| 4 | `claude:c1b03b99-c82e-4977-bc21-47efc89623fb` | scheduled routine run: one machine prompt, one concluding reply | 1,145,338 | 90,591 | 3,527 | 2 (1/1) |
| 5 | `claude:95d5fe87-a704-465b-b679-f0279e17b48b` | one-request analysis with a verdict and an open check; **already consolidated at the baseline** | 1,292,492 | 103,514 | 4,844 | 5 (3/2) |
| 6 | `claude:47e95686-3592-4787-ae1c-0220d1b02f61` | scheduled routine run: one machine prompt, one structured reply | 446,095 | 4,676 | 4,831 | 2 (1/1) |
| 7 | `codex:01a0d2d3-8c26-7872-b559-d484f420c6c0` | Codex session started by a parent Claude session, header `thread_source: "user"` | 2,709,800 | 29,896 | 4,941 | 4 (2/2) |
| 8 | `codex:01a0d332-04a7-7ea3-a44c-77aeafae95cf` | Codex session started by a parent Claude session, header `thread_source: "subagent"` | 788,772 | 23,329 | 388 | **0** |
| 9 | `codex:01a0d8c4-91fe-7e40-893c-001a3d307193` | one-off analysis the person asked Codex for directly, header `thread_source: "user"` | 415,168 | 20,260 | 2,995 | 2 (1/1) |
| | **total** | | 13,953,407 | 857,445 | 120,652 | 132 (64/68) |

The dry run reported exactly these: *claude sessions: 6, codex sessions: 3,
session text given to the memory pass: 120,652 bytes, transcript text measured
against the 8,000,000-byte limit: 857,445 bytes*. Projected message text is
**98,121 characters** — the denominator for every exact percentage below. The
nine sessions are one plausible night: the live ledger shows the real dreams of
09-24/25/26 processed 19, 38 and 12 sessions.

**Most Codex sessions started by another agent project to nothing, by design.**
The projection accepts a Codex rollout only when its first `session_meta`
header carries `thread_source: "user"` or none (row A4 of
`docs/specs/done/WP-dream-primary-dialogue-projection.md`;
`src/core/transcripts/primary-dialogue.js:254-261`); within an eligible rollout
it keeps `user` messages from `user.text` input blocks and `final_answer`
assistant messages, and drops `developer` (`:238`). Of seven Codex rollouts
whose headers were read while choosing samples (no content read), three carry
`thread_source: "user"` (rows 7 and 9 plus one unused) and four do not (row 8
and three unused: `subagent` ×3, `guardian_review` ×1) — those four projected
to zero messages, exactly as row A4 intends. The live ledger shows nights where
Codex sessions dominate (215 on 09-20); for the ineligible ones a filter would
have nothing to filter.

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

| item | round 1 | round 2 |
|---|---|---|
| model | `claude-opus-5-5`, `--effort high`, through the pinned `claude` 2.1.283 (`claude -p`), the owner's subscription | same |
| isolation | cwd = the packet directory; tools `Read,Glob,Grep` only; `--setting-sources ''`, the dream's hook-free `settings.json`, `--strict-mcp-config`; no vault, no live transcript root | same |
| inputs | the nine projected extracts (byte-identical to what the brain read); `notes-before/` = the pre-run text of the five notes the run changed; `vault-diff.patch` = `git diff b817b12 a5bb589` (39,434 bytes) | round 1's packet and verdict plus the baseline 09-23 and 09-24 daily logs and the 09-24 dream report, which round 1 had lacked (Codex gate finding 1 on this record) |
| prompt | `~/wd-eval/judge/JUDGE.md`: A losses, B unsupported claims, C a KEEP/LOW-VALUE verdict on every block, D a verdict; quoting capped at twelve words | `~/wd-eval/judge/JUDGE-R2.md`: re-examine each of round 1's twenty losses against the baseline; no private specifics |
| work | 22 turns, 383 s; 858,343 cache-read + 176,295 cache-creation input tokens, 42,560 output tokens (32,456 thinking); list-price equivalent USD 2.43 | 15 turns, 96 s; 268,227 + 61,301 input, 9,520 output |
| output | `~/wd-eval/judge/verdict.md`, 17,540 bytes — not committed | `~/wd-eval/judge/verdict-r2.md` — not committed |

Round 1 stated two limits itself: its character counts are estimates (no code
tool; ±10 %), and it could not see the baseline 09-24 daily log. Round 2 closed
the second.

## Findings

**A. Important losses.** Round 1 listed 20 (3 high, 12 medium, 5 low). Round 2,
with the baseline visible, revised them to **0 high, 9 medium, 7 low, 4 none**
(already held by the baseline). Of the 16 that remain, 12 come from rows 1 and 5
— the two sessions the baseline had already consolidated — and 4 from sessions
new to the baseline. **None of the 16 sits in a block the judge marked
LOW-VALUE.** Round 2's stated cause, in its own words in substance: the earlier
pass — the **live** 2026-09-24 dream, whose commit is the baseline — had kept
totals and to-dos and scored the rest near-zero novelty on the assumption that
the sessions had written their own entries; the notes it pointed to did not
contain them; and this run accepted that claim without checking. So the 12 are
the live first pass's own omissions, re-exposed by the empty-ledger setup, and
the 4 are first-pass omissions on new sessions: both groups are production
behaviour of a first pass.

**B. Unsupported claims — 8 listed: 0 high, 1 medium, 7 low.** The medium one is
a date attached to an event the dialogue leaves undated. The rest are inferences
written as facts and one session cited for the wrong task. Round 1: *"the notes
the dream wrote are otherwise faithful to the dialogue."*

**C. Not worth remembering — the measured quantity.** Judge's verdict: **41 of
71 blocks** LOW-VALUE; the judge's own estimate 35,013 of 101,391 characters
(34.5 %, ±10 %); recomputed exactly from its block indices over the real
extracts, **33,941 of 98,121 characters = 34.6 %**. Per session: the two long
project sessions about a third each; the short project session and the
one-request analysis under 5 %; the two scheduled runs and row 7 100 % (row 8
has no blocks); row 9 0 %. **Harm in the diff, stated once here and referenced everywhere else:** five
instances in four notes. Four are dilution — an entry in an already long
project note, another addendum to a recurring-pattern note, two daily-log
sections recording the scheduled runs. One is an **error**: the sentence
citing a session for the wrong task, which Findings B lists as a
low-severity unsupported claim and which low-value input caused. So the
low-value material's measured harm is *mild dilution plus one low-severity
error*, no medium or high consequence. The interim-status and notification
blocks of the long sessions *left no trace in the notes*.

**D. Verdict, quoted in substance.** Faithful: *partly* in round 1 (three high
losses); after round 2 no high loss and no high unsupported claim remain.
Mostly worth reading: the judge said *no* at 34.5 %, which is a 65 % majority
worth reading — the record notes the arithmetic. Would a block-selection stage
removing exactly the LOW-VALUE blocks have improved the memory: **MARGINAL** —
it would have removed the harm in Findings C and about 34 k characters of reading,
lost nothing from A, and *not fixed the losses, whose causes are how an
already-recorded session was handled and what a first pass chose to omit*.

## What the low-value volume is made of (code-derived, exact)

Measured on the nine projected extracts by prefix class of each `user` message
and cross-tabbed against the judge's block verdicts (indices only; no content
read):

| class of projected text | characters | share of 98,121 |
|---|---:|---:|
| `user` records that are **harness task notifications** (`<task-notification>` blocks reporting a subagent's completion) | 15,090 | 15.4 % |
| `user` records that are **local-command echoes** (`<command-name>`/`<local-command-stdout>`) | 1,009 | 1.0 % |
| `user` records that are scheduled-routine prompts (rows 4 and 6) | 612 | 0.6 % |
| `user` text the person, or a parent session, actually wrote | 8,779 | 8.9 % |
| `assistant` text | 72,631 | 74.0 % |

The projection drops Claude records with `isMeta` or `isSidechain`
(`primary-dialogue.js:180,184`); task notifications and local-command echoes
carry neither flag, so they pass through as `user` messages, each one opening a
new "exchange" whose concluding reply is the brain's interim status line. The
projection's Done contract says harness-authored instructions are not dialogue
(`docs/specs/done/WP-dream-primary-dialogue-projection.md:148-150`;
`primary-dialogue.js:8-9`), so this is a gap against a shipped contract.

**The safe rule, measured:** strip exactly those two classes of `user` record.
It removes **16,099 characters (16.4 %) and 35 of 132 messages**; 13,544 of
those characters sit in LOW-VALUE blocks and 2,555 in KEEP blocks — the latter
being notifications the judge had grouped with a kept reply, so nothing kept is
lost. It closes 39.9 % of the low-value characters with no model call.

**What it leaves:** 20,397 low-value characters — **20.8 % of the original
input, 24.9 % of what remains** — in two distinct kinds. **(a)** The three
machine-authored sessions (rows 4, 6, 7) whole: 4 prompts (2,657 characters)
and their 4 concluding replies (8,273), 10,930 characters = 11.1 % — the
material behind two of the four dilutions and the one error in Findings C.
**(b)** Inside
the human-driven sessions: 34 interim assistant replies (8,947 characters) and
3 short user lines (520), 9,467 characters = 9.6 % — the material the judge
found *left no trace in the notes*.
Two positional rules for the interim replies were tried and are **unsafe**:
"keep only the last reply before the next real user message" removes 27,509
characters but 6,441 of them from KEEP blocks, including replies that carry a
ruling; "drop every reply whose nearest preceding user record is a
notification" removes 43,840 with 23,430 from KEEP blocks, because the reply
after a notification is often the synthesis. The interim replies are therefore
the filter's genuine target — and the judge found the interim replies *left no
trace in the notes*; the dilution it did find came from the machine-authored
sessions in kind (a).

## Applying the decision rule

The spec's rule: *not material* (output faithful, surviving input mostly worth
reading) → `Superseded`; *material* → the number justifies the filter. Read
against the measurements:

1. **Faithful, with gaps — the judge's own phrase.** Assessed against all
   16 production first-pass omissions described in Findings A (0 high,
   9 medium, 7 low; 12 made by the live 09-24 dream, 4 by this run): no
   high-severity loss and no high-severity unsupported claim. None of the 16
   sits in a low-value block, so a filter cannot touch them; they are one
   consolidation-quality observation, not an input one.
2. **Mostly worth reading:** 65 % by the judge's own count; harm from the rest
   is as Findings C states it — mild dilution plus one low-severity error —
   none of it from the interim replies.
3. **The filter's real target** after the safe deterministic strip is 20.8 % of
   the input, the judge rates removing it MARGINAL, and the runtime it needs
   (a second supervised model call, a new profile, a supervision generalisation,
   a descriptor binding, up to 300 s of sequential calls per night) is the cost
   the spec itself lists.

The evidence leans to the *not material* branch; what keeps this from being a
mechanical flip is that the number is not negligible and the ruling that parked
this package was the owner's.

**Proposed disposition (orchestrator; the owner rules):**

- **Do not build the Sonnet filter.** File `WP-dream-primary-dialogue-filter`
  `Superseded`, citing this entry.
- **File the deterministic strip as a fix against the projection's Done
  contract** (wd-architect to name and mature it): exclude Claude `user`
  records that are task notifications or local-command echoes. The measured
  numbers above are its justification: −16.4 % characters, −27 % messages on
  this sample, nothing kept lost. Whether the interim replies those records
  created should also go is a design question for that package, with the two
  failed positional rules above as its first evidence.
- **Register one consolidation finding** for the architect, the production
  defect round 2 named: **a first pass records totals and to-dos and scores
  the rest near-zero novelty on an unchecked assumption that the material is
  already written elsewhere.** All 16 remaining losses are instances of it —
  12 made by the live 09-24 dream on rows 1 and 5 (re-exposed here because the
  empty ledger fed those sessions in again against that dream's own commit;
  production never re-feeds an unchanged session) and 4 made by this run on
  rows 2 and 3. Not a filter question: none sits in a low-value block.
- Owner items 1–2 of the spec stay as written; item 2 is moot if the first
  bullet is accepted.

## Observations for a designer (from the judge and the measurements)

- Rulings sit in one-line user messages that only make sense beside a long
  assistant message; whole request/reply blocks are the right selection unit
  (the spec's C0 already says so).
- Every extract carries `truncated: true` because the raw capped extract had
  a cut somewhere, usually in tool output the projection then removed; the flag
  says nothing about the projected dialogue.
- Codex extracts have `ts: null` on every message.
- One scheduled reply (row 6) is cut mid-structure by the 4,000-character
  message cap.
- One assistant message embedded the person's own email address inside a link;
  the diff did not reproduce it.

## What was not done, deliberately

No transcript, projected extract, note text, judge paraphrase or description of
any session's subject is committed. The disposable root is left in place for
the owner to inspect (`~/wd-eval/judge/verdict.md` and `verdict-r2.md` are the
full verdicts); deleting `~/wd-eval` is the owner's act. No spec status changed.
No new judge framework, no nightly judge.
