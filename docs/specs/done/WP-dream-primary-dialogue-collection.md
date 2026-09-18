---
id: WP-dream-primary-dialogue-collection
title: Collect primary dialogue into scratch and keep the code-owned gates on the original timeline
status: Done
model: opus
size: M
depends_on: [WP-dream-primary-dialogue-projection]
adrs: [ADR-0004, ADR-0005, ADR-0012, ADR-0020, ADR-0023, ADR-0024, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-primary-dialogue-collection: Collect primary dialogue into scratch and keep the code-owned gates on the original timeline

> **Errata, 2026-09-18 (post-merge) — nine stale, contradictory or unregistered
> spec-prose facts. None is a defect in what shipped.**
>
> *(A tenth erratum was appended later the same day, by the filing pass for
> `WP-dream-collect-parse-throw-quarantine` (PR #271). The "nine" above is the
> count this package's own filing pass found and is left as the record of it;
> Erratum 10 sits below the "Recorded, not errata" list.)*
>
> Implemented in PR #269 (merge `297ef1df`, 2026-09-18), tip `119137d2`. **Both
> PR gates are clean on that tip:** wd-reviewer returned APPROVE with executed
> evidence, and the independent gate (Codex plugin `review` on `gpt-6-astra`)
> returned *"No actionable regressions found"*; CI seven checks pass. Final
> numbers on `119137d2`: `npm test` 2895 tests / 2883 pass / **0 fail** / 12
> skipped; `npm run lint` clean; the **UNFILTERED** `npm run red-proofs` →
> `RUN: PROVEN`, **157 PROVEN**, zero `FAILED`, `VACUOUS`, `UNCONTROLLED`,
> `FILTERED` or `ERROR`, including this package's three declarations
> (`admission-measured-on-intake-not-projection`,
> `filename-collision-evicts-the-overwritten-session`,
> `ledger-gate-reads-the-original-timeline-not-scratch`). The reviewer's own
> `--wp`-scoped run selected 3 of 3 and proved all 3, and reported
> `RUN: FILTERED` with exit 1 **by construction** — see Erratum 7.
>
> **Every erratum below was measured by the fidelity gate on `119137d2`**, not
> inferred, and each cites the spec line as it stood at merge.
>
> **Erratum 1 — AC1b (`:591-605`) is internally contradictory: the write order
> it fixes makes its own non-vacuity control impossible.** *What is wrong:* AC1b
> demands **both** that the survivor be `s_1` **and** that "the same test run
> against a map built without the eviction **accepts** it, so the assertion is
> not vacuous". *What is true:* `src/core/dream/validate.js:474` is
> `SID_RE = /^[a-z0-9]+:[A-Za-z0-9_-]+$/`, which is **exactly** `sanitize`'s
> alphabet (`src/core/dream/scratch.js:18-20`,
> `String(id).replace(/[^A-Za-z0-9_-]/g, '_')`). So any id that collides with
> `s_1` without *being* `s_1` necessarily contains a character outside that
> alphabet and is therefore **also** a malformed Session-ID — refused whatever
> the gate map holds. In the order AC1b names, the overwritten session's refusal
> is **over-determined** and the no-eviction control cannot accept it; the
> control is impossible, not merely weak. The round-3 review's reasoning ("`s.1`
> fails the schema in both designs, so a fixture in which `s.1` survives proves
> less than it looks like") is correct about the *survivor* and was carried into
> the criterion as a constraint on the *overwritten* id, which inverts it.
> *What shipped:* **both orders, as two named cases** —
> `tests/unit/dream-collect.test.js:1470-1525` keeps AC1b's order (survivor
> `s_1`) for the survivor / empty-projection / nothing-else-moved assertions and
> asserts the over-determination explicitly at `:1523-1524`, and
> `:1527-1565` runs the **other** order (survivor `s.1`, overwritten `s_1`
> schema-clean) to carry AC1b's actual authorization claim: refused as *not
> among this run's processed extracts* at `:1545-1550`, and **accepted** at
> `:1562-1564` against a session-keyed map built without the eviction.
> *Found:* the implementer, under Decisions made. *Routing:* AC1b is rewritten
> below as **two named cases with the reason each exists**, so no later reader
> "fixes" the order back. **Class: an acceptance criterion whose two clauses
> cannot both hold, caught only by executing it.**
>
> **Erratum 2 — the Mirrored Surface Checklist (`:348`) names two proof-backed
> criteria where three shipped.** *What is wrong:* "`npm run red-proofs` mirrors
> AC1 and AC4". *What is true:* the implementer declared a **third** proof,
> `filename-collision-evicts-the-overwritten-session`, criterion `1b`, in
> `tests/red-proofs/dream-primary-collection.proofs.json` — row C4's eviction is
> the one line with an authorization consequence, so it earns a declaration.
> The unfiltered run proves all three. *Found:* the implementer, Decision 2.
> *Routing:* **ratified** — the checklist clause now reads AC1, **AC1b** and
> AC4, corrected in place below. **Class: a registered mirror the implementation
> legitimately grew past; the register is updated rather than the code narrowed.**
>
> **Erratum 3 — Implementation notes (`:441`) still says the `expectRed` sets
> are derived.** *What is wrong:* "**The RED proofs' `expectRed` sets are
> DERIVED, not measured** — the code they mutate does not exist yet." *What is
> true:* the code exists; each set was **measured by hand-applying its mutation
> and corrected** before the declaration was written, then confirmed by the
> unfiltered run at `119137d2`. *Found:* the architect, filing. *Routing:*
> corrected in place below to record the measurement and the tip it was taken
> at; the instruction that a correction here is a **prose** change routed back to
> the architect is kept, because it is what produced this errata block.
> **Class: a to-be-measured marker left standing after the measurement.**
>
> **Erratum 4 — AC4 (`:632`) names one reddening case where three redden.**
> *What is wrong:* "Its RED proof reddens on rebuilding `extractsBySession` from
> the scratch files, which is case (c) turning red." *What is true:* the
> measured `expectRed` set of
> `ledger-gate-reads-the-original-timeline-not-scratch` is **three** tests —
> cases (a), (b) and (c) all redden under that mutation, and the declaration
> names all three. *Found:* the implementer, Discovered issues. *Routing:*
> corrected in place below. **Class: prose that a measured `expectRed` set
> falsified — the same class as Erratum 3.**
>
> **Erratum 5 — the byte arithmetic after the literal scratch file (`:284`) says
> 30 where the spec's own literals say 31.** *What is wrong:* "a session that is
> already pure dialogue grows by **30** bytes per message". *What is true:*
> `,"derived_from_untrusted":false` is **31** compact bytes, and the spec's own
> figures on the two lines above — compact projection **233**, `intakeBytes`
> **202** — already differ by exactly 31. The shipped test asserts 31 with a
> comment. Nothing downstream depended on the wrong number: row C1 is what makes
> the direction harmless, not the magnitude. *Found:* the implementer,
> Discovered issues. *Routing:* corrected in place below. **Class: an
> arithmetic slip a measured assertion falsified.**
>
> **Erratum 6 — AC2's literal file (`:243-273`, asserted at `:606-611`) cannot
> be reproduced byte-for-byte under a temp home.** *What is wrong:* AC2 asks
> that each scratch file be "byte-identical to the literal above for the literal
> input", and the literal carries
> `"source_path": "/samples/rollout-demo.jsonl"`. *What is true:* the test must
> build its corpus under a disposable temporary home, so the discovered file's
> real path — and therefore `source_path`, which the parser bounds through
> `boundExtractPath` — can never be `/samples/rollout-demo.jsonl`. *What
> shipped:* the test compares the written file with the literal **byte-for-byte
> with only `source_path` substituted**, so key order, the added per-message
> `derived_from_untrusted` key, the `null`s and the absence of a trailing
> newline are all still pinned exactly. *Found:* the implementer, Decision 6.
> *Routing:* recorded at the literal and in AC2 below, as the one substitution
> the comparison is allowed. **Class: a byte-exact fixture stated without its
> one environment-dependent field.**
>
> **Erratum 7 — the `--wp`-scoped `npm run red-proofs` at `:699` is listed under
> "must pass before the PR" and can never exit 0.** *What is wrong:*
> `npm run red-proofs -- --wp WP-dream-primary-dialogue-collection` appears in
> the block headed "Implementation checks — these must pass before the PR".
> *What is true:* scoping by `--wp` leaves every other work package's
> declarations **unselected**, and `scripts/red-proofs.js`'s roll-up
> (`rollUp`, `:2152-2154`) marks any pair with a left-out declaration
> `FILTERED`; the run verdict is the worst pair verdict, and the exit code is
> `verdict === 'PROVEN' ? 0 : 1` (`:1893`). So a scoped run reports
> `RUN: FILTERED` and exits **1** by construction, however green the selected
> proofs are — which is exactly what the reviewer's scoped run did (3 selected,
> 3 PROVEN, `RUN: FILTERED`, exit 1). **The gating check is the UNFILTERED
> run**; the `--wp` form is a fast non-gating reading. *Found:* the architect,
> filing. *Routing:* corrected in place below. **This is the second recorded
> occurrence of this exact defect** — the first was erratum 1 of
> `WP-quarantine-failed-preserve-disposal-flush`, landed on its branch before
> merge (`3cd68a85`), recorded in HANDOVER status pass #10. **Class: a
> verification command whose documented success condition the runner cannot
> produce — recurring, and now carried by another spec (see the PR's Discovered
> issues).**
>
> **Erratum 8 — the `SKILL.md` sentences `tests/unit/dream-skill-structure.test.js`
> pins are an unregistered mirror of rows D2/D3/D6.** *What is wrong:* the
> Mirrored Surface Checklist registers the three-token absent `rg` over
> `SKILL.md` but not the structure suite, although row D4 puts that suite in the
> Deliverables to "assert rows D2–D3's prose contract". A later reviewer
> correcting a row would have no register entry telling them those sentences
> must move with it. *What is true, measured at `119137d2`:* the five test cases
> at `tests/unit/dream-skill-structure.test.js:80-141` pin **seventeen**
> verbatim `SKILL.md` strings positively, forbid **two** superseded formulations
> by name (`RAISES your flag`, `it never accepts a value LOWER than the derived
> one`), and require the three superseded tokens (`tool_result`,
> `skill_invocations`, `errored`) to occur **zero** times. *Found:* the
> architect, filing; the count is measured, not the "nine" the filing brief
> carried. *Routing:* **registered** as a mirror in the checklist below.
> **Class: register-new-mirrors applied late — the mirror existed at merge and
> was not in the register.**
>
> **Erratum 9 — the `collectExtracts` JSDoc block (`:237`) lists
> `skippedQuarantined` twice.** *What is wrong:* the `@returns` line reads
> `…, skippedQuarantined, skippedQuarantined, gateExtracts: …`. *What is true:*
> the field occurs once; the shipped JSDoc
> (`src/core/dream/scratch.js:55-62`) writes it once. *Found:* the implementer,
> Decision 5. *Routing:* corrected in place below. **Class: a transcription
> duplicate in a spec literal, not copied into the code.**
>
> **Recorded, not errata:**
> (i) **The two `tests/red-proofs/…` Deliverables cells are NOT stale**, although
> PR #269's body listed them as prose the measured sets falsified. Their notes
> name only each file's `suite` — `tests/unit/dream-collect.test.js` and
> `tests/unit/dream-pipeline.test.js` — which is what shipped; nothing in either
> cell speaks about `expectRed`. They are left exactly as written.
> (ii) **ADR-0042 runner contract, worth knowing before declaring a proof:**
> `signal` is searched in the failing test's TAP **diagnostic**
> (`scripts/red-proofs.js:1658`), so a bare `assert.deepEqual`/`assert.ok`
> cannot carry it. The first unfiltered run reported `FAILED` on all three
> declarations for missing signals — not for a wrong red set; `119137d2` puts
> the tag in each reddening assertion's message.
> (iii) **The `sanitize` collision is still a live, pre-existing defect.** Row
> C4's eviction only stops the authorization gate weakening over it; one
> session's dialogue is still silently lost while both sessions are marked
> processed. It stays under Discovered issues below, unfixed and routed.
> (iv) **AC7's logbook entry has its own dated correction.** The Regime-1
> admitted list in
> `docs/specs/logbook/2026-09-18-dream-primary-dialogue-collection-ac7-measurement.md`
> was rendered as a range spanning 67 ids against a measured count of 81; the
> entry does not record the corpus composition needed to reconstruct the list, so
> the correction says so rather than inventing ids. The counts, the arms and the
> byte figures are unaffected.
>
> ---
>
> **Erratum 10 — added 2026-09-18 by the filing pass for
> `WP-dream-collect-parse-throw-quarantine` (PR #271, merge `900dd6d4`): every
> cite placing `sanitize` at `src/core/dream/scratch.js:18-20` is now stale, and
> the function itself has changed.** *What this spec says:* the Deliverables cell
> for `src/core/dream/scratch.js` states that "`sanitize` at `:18-20` is **not**
> changed", and five more places cite `:18-20` as its definition — Current
> state's filename paragraph, Table C row C4a, the Mirrored Surface Checklist,
> AC1b's `SID_RE`-alphabet argument, and the Discovered-issues entry on the
> filename collision (plus one inside Erratum 1 above).
> *What is true on `main` at `900dd6d4`:* `sanitize` is at **`:28-30`**,
> it carries a **width bound** — `.slice(0, SCRATCH_ID_MAX_CHARS)` applied after
> the character replace — and `SCRATCH_ID_MAX_CHARS = 128` is declared at
> **`:23`**. PR #271's Table B row B6 made that change, and the same PR's spec
> says so explicitly: it names this spec's "`sanitize` … is not changed" sentence
> as one it falsifies.
>
> **The cites are NOT rewritten in place, deliberately.** A `Done` spec is the
> record of what was true at **its** pin — base `b46a3843`, re-derived construct
> by construct — not a live index into `main`. Rewriting its line numbers would
> destroy the one thing the cites are for: letting a reader reconstruct the tree
> this package was designed against. Anyone reading a cite here must therefore
> re-derive it by construct against whatever `main` currently is — which is what
> the repo's re-pin discipline already requires of a *live* spec, and what this
> erratum makes explicit for a filed one. **This is the first time a done-flip
> has recorded moved cites this way**; it is the pattern to reuse.
>
> **What changed in substance, not only in line number:** the character allowlist
> is untouched (`[^A-Za-z0-9_-]` → `_`, globally), so every argument in this spec
> that rests on the **alphabet** — including AC1b's over-determination reasoning
> and Table C row C4a's `s_1` / `s.1` collision — still holds exactly. What is
> added is a **length** bound, which widens the pre-existing collision set by ids
> sharing a 128-character allowlisted prefix. PR #271 records that widening under
> its own Out of scope and routes it here, to this spec's Discovered issues,
> where the underlying defect already sits: **unfixed, and still unspecced.**

<!-- errata above; the spec as it shipped follows -->

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **2026-09-17 — DESIGN GATE CLOSED; `Ready`.** Three adversarial rounds ran on
> `gpt-6-astra` through the Codex plugin against base `c94e0e66`, finding 1
> product finding plus 2 machinery notes, then 2, then 0. Round 3 returned
> `approve` after executing 48 filename-collision scenarios and 480 gate-verdict
> comparisons against the baseline, which is what closes the gate under
> `docs/runbooks/codex-review.md`. Dispositions and raws are in
> `docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md`.
>
> **2026-09-18 — BOTH PREREQUISITES HAVE LANDED AND THE CITES ARE RE-DERIVED.**
> `WP-dream-report-run-skips` merged as PR #264 and
> `WP-dream-primary-dialogue-projection` as PR #266 (merge `b46a3843`, now
> `docs/specs/done/`). Every cite into `src/core/dream/scratch.js`,
> `src/core/dream/promote.js`, `src/cli/dream.js` and
> `tests/unit/dream-collect.test.js` was re-derived **by construct** at
> `b46a3843` — the before/after table is
> `docs/specs/logbook/2026-09-18-dream-primary-dialogue-collection-repin.md`.
> No row's facts moved, so this stays `Ready`. **This package is now dispatchable.**

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
`parsePrimaryWithOutcome` (shipped in PR #266) that no caller uses yet. This
package switches the
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
   item 1. **That closes the byte dimension and only the byte dimension.** The
   collector also stops on a soft preprocessing deadline, and projection changes
   how long preprocessing takes, so on a deadline-bound install the admitted set
   can still move — in either direction. Row C1a says when that is, and owner
   item 3 prices it. This package does not fix F1 and does not claim to be
   unable to worsen it; it claims byte-policy equivalence, which is a smaller
   and true statement.
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

**Base commit: `b46a384398a6ff3fa44a463ceb7773b3fd986179`** (upstream `main`
after PR #264 and PR #266). **Every cite below was re-derived by construct at
that commit on 2026-09-18**, both ends checked, with the before/after table in
`docs/specs/logbook/2026-09-18-dream-primary-dialogue-collection-repin.md`.
Nothing in this package's contract changed: the five exclusion arms, the byte
measurement and the write are the same constructs at new line numbers, and the
sibling entry point ships exactly the shape Table C consumes.

**The dispatcher must re-derive every `src/cli/dream.js` and
`src/core/dream/scratch.js` cite at dispatch.** Both files are edited by
`WP-dream-report-run-skips`, which was `Ready` and in flight when this spec was
written; `#245`, `#253` and `#257` already moved them since the predecessor
draft's fork baseline. Run
`git log --oneline c94e0e66..HEAD -- src/cli/dream.js src/core/dream/scratch.js src/core/dream/promote.js tests/unit/dream-collect.test.js`
first and re-read anything that moved. Read the tail of `tests/unit/dream-collect.test.js` before editing it — it is a
deliverable of this package and PR `#261` appended a probe block to it.

- `src/core/dream/scratch.js:46-173` is `collectExtracts(paths, ledger,
  maxInputBytes, {preprocessTimeoutMs = 60_000, now})`. It discovers, filters
  to `selectState(...) === 'select'` (`:56-64`, now one loop that also counts
  files skipped for an existing quarantine), splits off files over the pre-read
  ceiling (`:67-70`), sorts newest-mtime-first (`:71`), prunes the ledger's
  oversized memos to those whose `fingerprint` **and** `appVersion` still match
  (`:76-84`), then recreates the scratch dir (`:87-88`) and runs one admission
  loop (`:98-150`) with **five** exclusion arms:
  `deferred` (capacity: `remaining === 0` at `:101-104`, or
  `extractBytes > remaining` at `:134-137`), `deadlineDeferred` (`:105-108`),
  `oversized` (memo hit `:112-115`, or fresh measurement `:129-133`),
  `readDeferred` (`parse.runExhausted`, `:124-127`) and `newlyQuarantined`
  (non-`ok` parse outcome, `:120-123`).
- The two lines this package changes are `scratch.js:128`
  (`const extractBytes = Buffer.byteLength(JSON.stringify(extract));`) and
  `:139` (`writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2));`
  — 0600, **no trailing newline**). `:138` builds the filename as
  `${d.harness}-${sanitize(extract.session_id)}.json`, where `sanitize` (`:18-20`)
  replaces every character outside `[A-Za-z0-9_-]` with `_`.
- `:119` calls `transcripts.parseWithOutcome(d, transcripts.newRunBudget())` —
  a **fresh** read allowance per session. `:130` writes the oversized memo
  `{fingerprint, appVersion, extractBytes}`.
- `src/core/dream/ledger.js:112-120` (`normalizeOversizedExtracts`) accepts a
  memo only with a string `fingerprint`, a string `appVersion` and a safe
  positive integer `extractBytes`; `:88-97` documents the per-file record
  (`{fingerprint, outcome, reason?, deferrals?, updated_at, harness}`) — **no
  record carries an extractor or parser version.**
- `src/cli/dream.js:1043-1049` builds `extractsBySession` by **re-reading each
  file in `sel.wrote` off disk** and keying it `<harness>:<session_id>`; an
  unreadable file is swallowed so its sessions fail the ledger gate closed. It
  runs after the integrity check at `:995-1000` (`scratchIntact`) and the
  stray-file sweep at `:1003-1009`. `:1050-1064` passes the map into `promote`.
- `src/core/dream/validate.js:510-527` (`invocationWindowTainted`) reads only
  `extract.messages[i].role` and `extract.skill_invocations`; it needs **no
  message text**. `:631-649` requires each newly counted `claude:` session to be
  present in `extractsBySession` and to carry a matching `skill_invocations`
  entry. **It does NOT raise an understated `derived_from_untrusted` — it
  refuses:** `:646-648` returns the reason string `derived_from_untrusted
  asserted lower than derived (an invocation window contains a tool_result)`,
  and `src/core/dream/promote.js:1386-1394` calls that gate while `:1397-1400`
  records any non-null reason as a refusal, leaving the candidate bytes
  unchanged. The dream skill says
  "RAISES" at `SKILL.md:324-331`; the skill is wrong and row D3 corrects it.
- `src/core/dream/validate.js:191-216` (`tier3Decision`) requires
  `fm.derived_from_untrusted === false` for **every** Tier-3 write — identity
  and skills — which is what row D6's code/prompt split turns on.
- `src/cli/dream.js:136-159` is `printPlan`. `:141-147` sums the **on-disk**
  sizes of `sel.wrote`, and `:154` prints, at a two-space indent, the line
  `total input bytes: ${totalBytes}`. `tests/integration/dream.test.js:587`
  asserts `/total input bytes: [1-9][0-9]+/`.
- `src/cli/dream.js:708-716` calls the collector and persists changed memos;
  `:781-797` renders one console line per non-empty exclusion arm, including
  `capacity stop: … retry on the next run or raise dream_max_input_bytes in
  config.yaml.` (`:782-783`); `:1339` calls `cleanScratch(paths.state)` in the
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

**`WP-dream-primary-dialogue-projection` HAS LANDED** (PR #266, merge
`b46a3843`). `src/core/transcripts` exports `parsePrimaryWithOutcome(entry, budget)` →
`{extract, gateExtract, intakeBytes, parse}` (`src/core/transcripts/index.js:253`):
the model-visible primary extract
(no `skill_invocations`, a `derived_from_untrusted` boolean on every message), a
text-free `{harness, session_id, messages:[{role}], skill_invocations}`
projection of the original timeline, and the compact JSON byte length of the raw
capped extract — the number `scratch.js:128` computes today.
`src/core/transcripts/primary-dialogue.js` is the projection itself and exports
exactly one thing, `createPrimaryProjection(harness)`. **Read that module and
`docs/specs/done/WP-dream-primary-dialogue-projection.md` — including its six
post-merge errata — before starting; they are this package's input contract and
are not restated here beyond what Tables C and D need.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/scratch.js | Table C rows C1, C1a, C2–C4, C4a: opt into `parsePrimaryWithOutcome`, measure on `intakeBytes`, write the projection, return the gate projections (with row C4's filename eviction) and the intake total. The deadline check at `:105-108` and `sanitize` at `:18-20` are **not** changed |
| modify | src/cli/dream.js | Table D row D1 (feed `extractsBySession` from the collector) and Table C row C5 (the two dry-run byte lines) |
| modify | skills/wienerdog-dream/SKILL.md | Table D rows D2–D4 and D6: extract shape, provenance rule, learning discovery, and D3's correction of the "RAISES" sentence at `:324-331` |
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
 *             readDeferred, oversized, oversizedExtracts, skippedQuarantined,
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
`derived_from_untrusted` key is new. **One field of this literal is
environment-dependent and is the single substitution the byte comparison
allows (Erratum 6):** `source_path` is derived from the discovered file's real
path through `boundExtractPath`, and a test building its corpus under a
disposable temporary home can never produce `/samples/rollout-demo.jsonl`. The
comparison substitutes `source_path` with the corpus's actual bounded path and
is byte-for-byte on everything else — key order, the added per-message key, the
`null`s and the absence of a trailing newline.

**The byte count this admission was measured against is not the size of that
file.** For this input the file is 307 bytes on disk, its compact form is 233
bytes, and `intakeBytes` — the compact JSON length of the raw capped extract,
which is what X is measured against (row C1) — is **202**. It is smaller than
the projection here because this source has nothing to remove and the projection
*adds* a `derived_from_untrusted` key per message: **projection shrinks extracts
in aggregate, not on every session**, and a session that is already pure dialogue
grows by **31** bytes per message — `,"derived_from_untrusted":false` is 31
compact bytes, and the two figures above already differ by exactly that
(233 − 202 = 31; corrected by Erratum 5). Row C1 is what makes that harmless —
admission is decided on the intake number, so neither direction of the
difference moves the admitted set.

## Contract reference (optional — mark N/A if this WP is not contract-dense)

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
| C1 | **What `dream_max_input_bytes` measures, and exactly what that guarantees — CANONICAL.** | X is measured against `parsePrimaryWithOutcome(...).intakeBytes`, which is byte-identical to the `Buffer.byteLength(JSON.stringify(extract))` that `scratch.js:128` computes today from `parseWithOutcome`. **The guarantee is BYTE-POLICY EQUIVALENCE, not admitted-set identity.** For every session the admission loop **visits**, every byte-based decision is the one the base commit would make on the same input: the capacity stop (`remaining === 0` at `scratch.js:101-104` and `extractBytes > remaining` at `:134-137`), the individually-oversized skip and the memo it writes (`:112-115`, `:129-133`), and the newest-first order. Projection cannot change any of them, because it changes neither the measured number nor the order. **What it can change is which sessions the loop visits.** The soft preprocessing deadline at `:105-108` compares `now() - startedAt` against `preprocessTimeoutMs`, and `startedAt` is taken at `:50` before discovery, so the elapsed clock spans discovery, ledger pruning, scratch recreation, and every prior session's parse, measurement and write. Projection changes those costs in both directions: classifying two policies in one pass costs more, serializing a smaller extract to disk costs less. **So when the deadline is the binding constraint, the admitted set can differ from the base commit's in either direction.** The design review executed the real collector with mocked timing and measured one session admitted under the baseline against four under projection at identical intake bytes and the same limit. See row C1a for when the deadline binds, and owner item 3 for the F1 consequence. There is still no backfill in the byte dimension: no session is admitted because projection freed X. |
| C1a | The exact condition under which the admitted sets are equal | Admitted-set equality holds **only when BOTH the baseline run and the projected run avoid deadline deferral** — that is, when `deadlineDeferred` is empty in both. It is **not** enough that one of them finished in time: the round-2 review executed a counterexample in which the projected run admitted all five sessions in 50 ms while the baseline, under the same 60 ms deadline, admitted one. Whenever either run defers on the deadline, the admitted sets may differ **in either direction**, and the direction is not predictable from this document, because it is the sign of (added projection classification cost − saved write-serialization cost) on that machine. The deadline is not binding, and the sets are therefore equal, when both runs finish visiting the candidate list or fill X inside `dream_preprocess_timeout_seconds` (default 60) — the ordinary nightly shape of a handful to a few dozen new sessions. It **is** binding on a large backlog, where preprocessing runs out of time before X fills: the shape the 2026-09-16 assessment measured, with 10,338 files deferred in one night. **That is the uncomfortable part and it is stated rather than buried: the installs where finding F1 matters most are exactly the installs where this package's admitted set can move.** AC7's measurement must report the regime of **both** runs, not one. |
| C2 | What is written | The file written at `scratch.js:139` is `JSON.stringify(<the primary extract>, null, 2)` — the projection, never the raw extract — at the existing 0600 with no trailing newline, under the existing filename rule `${harness}-${sanitize(session_id)}.json`. An extract whose projection retains **zero** messages is still written, with its identity and an empty `messages` array: the consolidation agent may legitimately decide a session holds nothing worth remembering, and that is a different state from the session being absent. `sel.entries` and `sel.wrote` keep their existing meanings and membership. |
| C3 | The oversized memo is unchanged | Because C1 keeps the measured quantity byte-identical, `oversizedExtracts` memos keep their exact current meaning and remain valid across this change. This survives row C1a: a memo records a **byte** measurement, and byte-policy equivalence holds whether or not the deadline binds. **No `extractFormat` field, no format discriminator, and no new invalidation rule is added**; `ledger.js` is not a deliverable of this package. The memo's three existing release conditions are untouched (the source file's fingerprint changes, `package.json.version` changes, or X rises to or past the measured size). Nothing resets processed outcomes, migration baselines, quarantine records or secret-revert counters. |
| C4 | `gateExtracts`, and the **filename eviction** that keeps it equal to the disk rebuild | The collector returns the text-free gate projection of every session it wrote, as a `Map` keyed `<harness>:<session_id>` and populated in write order. **A later write to a scratch filename an earlier entry already wrote EVICTS that earlier entry**: before setting a key, delete any key whose recorded filename equals the one about to be written. The map therefore holds exactly one session per distinct filename — the last one written — which is bit-for-bit what `src/cli/dream.js:1043-1049` produces today by re-reading the surviving file. Row C4a says why this is not theoretical. It lives in memory for the run only: it is never written to any file, never placed under the scratch directory or any other directory a model can read, and never handed to a model. It carries no message text (its shape is the predecessor package's Table B row B2). Nothing else about privacy or cleanup changes — the run's `finally` still calls `cleanScratch`, and no durable evidence archive, selection checkpoint or transcript-content log is introduced. |
| C4a | Why row C4 evicts: two session ids can share one scratch filename | `sanitize` (`scratch.js:18-20`) replaces every character outside `[A-Za-z0-9_-]` with `_`, so the session ids `s_1` and `s.1` both produce `claude-s_1.json` — executed and confirmed. Today both sessions are parsed, both are appended to `entries`, both to `processed`, and **the same path is appended to `wrote` twice**, so the second `writeFilePrivate` overwrites the first and one session's dialogue is gone. The gate map, being rebuilt by re-reading `wrote`, then contains **only the surviving session**, and a learning counting the overwritten one is refused as "not among this run's processed extracts". A session-keyed in-memory map without row C4's eviction would contain **both**, so that learning would be accepted although the model never saw a byte of its dialogue — measured by the round-2 review as an authorization difference, not a theory. Row C4 exists to reproduce the refusal. **Nothing else about this case changes**: both sessions stay in `entries`, `wrote` and `processed`, both are still marked processed on a clean run, and `hashScratch` still hashes the duplicate path twice. That the overwritten session's dialogue is silently lost and never retried is a **pre-existing defect of the base commit**, recorded under Discovered issues and deliberately not fixed here. |
| C5 | The dry-run preview names both numbers | After this package the bytes given to the model and the bytes X bounds are different quantities, so `printPlan` must not print one label over the other. `src/cli/dream.js:154` is replaced by exactly these two lines, in this order, each at the same two-space indent the surrounding preview lines use: `session text given to the memory pass: ${totalBytes} bytes`, then `transcript text measured against the ${cfg.maxInputBytes}-byte limit: ${sel.intakeBytesTotal} bytes`. `totalBytes` keeps its existing derivation (the summed on-disk sizes of `sel.wrote`, `:141-147`); `intakeBytesTotal` is the sum of the `intakeBytes` of the admitted sessions. Everything else `printPlan` prints is unchanged, and `--dry-run` still performs no model call and writes nothing. |

#### Table D — what the model sees, and what code keeps to itself

| ID | Contract | Rule |
|----|----------|------|
| D1 | The gate reads the original timeline | `src/cli/dream.js:1043-1049`'s re-read of `sel.wrote` is replaced by `sel.gateExtracts`: the map handed to `promote` is the collector's, not one rebuilt from the scratch files. A session absent from the map fails the ledger gate closed, exactly as an unreadable extract does today, and `validate.js` is **not** a deliverable — its code, its verdicts and its fail-closed behavior on malformed geometry are unchanged. The integrity check at `:995-1000` and the stray-file sweep at `:1003-1009` stay where they are and keep their current effect. This is strictly stronger than today: the gate's evidence now never reaches a directory the model can write to, so nothing the model does during the run can reach it. |
| D2 | The model sees dialogue and a provenance flag | The dream skill's documented extract shape (`SKILL.md:47-70`) becomes the projection's: messages carry `role` (`user` or `assistant` only), `text`, `ts` and `derived_from_untrusted`; there is no `tool_result` role and no `skill_invocations` array. The Phase 2 provenance rule (`:101-105`) becomes: set a candidate's `derived_from_untrusted` to `true` if **any** supporting message carries `derived_from_untrusted: true`; set it `false` only when every supporting message carries `derived_from_untrusted: false`; **never infer `false` from a message's role**. Phase 1 (`:72-81`) tracks each supporting message's flag rather than its role. The quoted-data warning (`:22-29`) keeps its force and stops singling out `tool_result`: an assistant message may restate material that came from outside the conversation, and `derived_from_untrusted: true` is exactly what marks it. The same substitution is made at the three further sites Current state names — `:93`'s explicit-user-signal clause, `:185-188`'s raise-only rule for an existing note, and `:291-297`'s per-entry ledger rule. **Checkable consequence: the string `tool_result` occurs zero times in the file afterwards.** That is deliberate and it is the whole point of the row — the role no longer exists in anything the model reads, so any surviving sentence about it is a rule the model cannot apply, and a count of zero is the only cheap way to prove none was left behind. |
| D3 | Learning discovery is dialogue-only | The skill identifies a possible skill usage from retained dialogue alone, for both harnesses (`SKILL.md:212-222`, `:317-322`). It no longer reads a `skill_invocations` array, no longer reads `errored`, and **must not infer that an invocation succeeded or failed from the absence of evidence** — an outcome it cannot see is an outcome it does not report. The code-owned checks are unchanged and are now fed evidence the model never sees: a Claude session counted in a ledger entry is still independently verified to have invoked that skill, `derived_from_untrusted` is still derived from the invocation window, and a Codex session still never authorizes a skill-body revision. Nothing here can create an invocation, lower the gate's verdict, or turn Codex evidence into qualifying Claude evidence. **One correction rides along, because this row rewrites the section that states it:** `SKILL.md:324-331` tells the model the orchestrator "RAISES your flag to `true`". It does not. `src/core/dream/validate.js:646-648` returns a refusal reason, and `src/core/dream/promote.js:1386-1394` calls that gate and `:1397-1400` records the refusal, leaving the candidate bytes unchanged — an understated flag **loses the whole ledger write**, it is not silently corrected. The rewritten section says that, because a model told its mislabel will be fixed for it has no reason to get it right. |
| D4 | The shipped digest is regenerated | `src/core/runtime-skill-digests.json` is regenerated so the dream skill's entry matches its new body, and **no other entry in that file changes**. `tests/unit/dream-skill-structure.test.js` is updated to assert rows D2–D3's prose contract rather than the superseded sentences. |
| D5 | The ADR amendment | Rows D2–D3 change a durable policy under ADR-0020, so the block in "ADR-0020 amendment text" below is appended to `docs/adr/0020-skill-revision-lifecycle.md` byte-for-byte, after the existing `## Amendment (2026-09-05): ledger-parser correctness …` section and before `## Future work (parked, not specced)`. Nothing above it is edited. Its `Status:` line is written exactly as given and nothing stronger: the owner adds his own signature line himself, and no work package writes `OWNER-SIGNED`, `OWNER-RATIFIED`, or any sentence saying the owner approved, accepted, ratified or signed it. |
| D6 | **Which provenance guarantees are CODE and which are PROMPT — CANONICAL.** | This row is the honest boundary of the package and every other surface defers to it. **Code**: the per-message `derived_from_untrusted` on every scratch message is computed by the predecessor's parser and no model can edit it; the learnings ledger's per-entry flag for a **newly counted Claude session** is derived from the original invocation window (`validate.js:510-527`, `:631-649`) and an understated value is refused (row D3); a ledger value that is not the exact literal `true` or `false` is a schema violation and is treated as untrusted on the authorization path (ADR-0020's 2026-09-05 amendment (b)); every Tier-3 write requires `derived_from_untrusted === false` (`validate.js:191-216`). **Prompt only**: propagating message flags to an **ordinary** note's frontmatter. No code checks which messages supported an ordinary candidate, so the flag on a non-skill-learning note is the model's assertion, gated afterwards by the Tier-3 floor rather than verified against its sources. The invocation gate verifies invocation evidence for counted Claude sessions; **it does not verify any candidate's supporting messages.** This is not a regression — today's role-based rule (`SKILL.md:101-105`) is prompt-only in exactly the same way, and this package replaces one prompt rule with another while adding a code-produced input it can cite. **Unknown or missing provenance is `true`**: the skill retains that instruction for a message whose flag it cannot read, and the ledger schema already fails closed on a non-literal value. |

### Mirrored Surface Checklist

For each canonical table above, every surface in this spec that mirrors it. A
review finding updates the table **and every mirror below in the same commit**;
a newly found mirror is registered here on the spot.

- [ ] **Deliverables-table cells that restate a path or rule** — walked: the
      `scratch.js` cell names C1–C4 **and C1a, C4a**; the `dream.js` cell names D1 and
      C5; the `SKILL.md` cell names D2–D4 **and D6**; the digests cell names D4's
      no-other-entry clause; the ADR cell names D5's byte-for-byte clause; the
      two proofs cells name their suites per ADR-0042.
- [ ] **Acceptance criteria that assert its facts** — walked: **AC1 asserts C1
      with both runs inside the deadline, AC1a asserts C1a in the deadline
      regime including the projected-defers-nothing shape, and AC1b asserts C4
      and C4a**; AC2 asserts C2 and C3; AC3 asserts C5; **AC4 asserts D1 and
      D3's refusal correction**; AC5 asserts D2–D4; AC6 asserts D5; **AC7 is the
      C1/C1a measurement and must name BOTH runs' regimes**; the idempotency
      criterion asserts C2's determinism. **D6 is asserted by none of them by
      design** — it states which guarantees are prompt-only, and a prompt rule
      is not a thing a unit test can pin; AC5 checks only that the prose says it.
- [ ] **Verification commands / greps** — walked: the `rg` over
      `scratch.js`/`dream.js` in Current-state checks mirrors the C1/C5/D1
      cites; the three-token absent grep over `SKILL.md`
      (`skill_invocations|tool_result|errored`) mirrors D2's zero-occurrence
      clause and D3; the ADR `Status:` grep and the owner-phrase prohibition
      grep mirror D5; the **UNFILTERED** `npm run red-proofs` mirrors AC1,
      **AC1b** and AC4 (three declarations; corrected by Erratum 2, and the
      unfiltered form by Erratum 7 — a `--wp`-scoped run is `RUN: FILTERED`,
      exit 1, by construction); **the `rg` over `scratch.js`'s deadline check
      mirrors C1a**.
- [ ] **`tests/unit/dream-skill-structure.test.js` — the `SKILL.md` prose
      contract, registered by Erratum 8.** Rows D2, D3 and D6 are mirrored not
      only by the three-token `rg` above but by the five test cases at
      `:80-141`, which pin **seventeen** verbatim `SKILL.md` strings positively
      (the two documented roles, the per-message-flag sentence, both example
      flag values, both arms of the Phase 2 rule, the never-infer-from-role
      clause, the unknown-provenance clause, the three code/prompt-boundary
      sentences of D6, the one-rule-for-both-harnesses clause, the
      absence-of-evidence rule and its rationale, the REFUSES sentence and the
      reverted-unchanged cost), forbid **two** superseded formulations by name
      (`RAISES your flag`; `it never accepts a value LOWER than the derived
      one`), and require `tool_result`, `skill_invocations` and `errored` to
      occur **zero** times. **A correction to D2, D3 or D6 must move those
      strings in the same commit**, or the suite pins prose the table no longer
      says.
- [ ] **Current-state description** — walked: `scratch.js:128`/`:139` back C1
      and C2; **`scratch.js:50` and `:105-108` back C1a's elapsed-clock argument**;
      `scratch.js:76-84`/`:112-115`/`:130` and `ledger.js:112-120` back
      C3; `dream.js:136-159` and `tests/integration/dream.test.js:587` back C5;
      `dream.js:1043-1049` and `validate.js:510-527`/`:631-649` back D1;
      **`validate.js:646-648` with `promote.js:1386-1394` and `:1397-1400` back
      D3's refusal correction and AC4; `validate.js:191-216` backs D6's Tier-3
      clause; and `scratch.js:18-20`'s `sanitize` backs C4a**;
      the `SKILL.md` cites — `:22-29`, `:47-70`, `:72-81`, `:93`, `:101-105`,
      `:185-188`, `:212-222`, `:291-297`, `:317-322`, **`:324-331`**, and the
      eight-site `tool_result` occurrence list — back D2–D4 and D6;
      `ledger.js:88-97`'s "no record carries an
      extractor version" backs the replay decision in Implementation notes.
- [ ] **Operative prose steps that apply it** — walked: Context's two
      "must not move" numbered paragraphs apply C1, **C1a** and D1; **Discovered
      issues' collision bullet applies C4a and states what C4 does NOT fix**; the
      `collectExtracts` JSDoc block applies C4 and C5; the literal scratch file
      and the paragraph after it apply C1 and C2; Implementation notes' replay,
      F1, **deadline-regime**, digest-regeneration, **compatibility** and
      derived-proof bullets apply C1, C1a, C3, D4, D5 and the
      RED-proof register; the ADR-0020 amendment text applies D2, D3 and D5;
      Out of scope's `ledger.js`, **admission-redesign** and relevance-stage
      bullets apply C1a and C3; owner item 1 applies C1 and C3, and **owner
      item 3 applies C1a**.

## Implementation notes & constraints

- **No new npm dependency, no TypeScript, no build step** (CLAUDE.md). Plain
  Node ≥ 18 with JSDoc annotations.
- **Re-derive the `dream.js` and `scratch.js` cites first.** See Current state.
  If `WP-dream-report-run-skips` has landed, the exclusion-arm console block
  around `dream.js:781-797` will have moved and gained a rendered report
  section. **Its bullets stay truthful for a reason weaker than the one an
  earlier draft of this spec gave, and the difference matters:** they count what
  *this* run classified and never promise a particular count, so they are true
  whatever the arms hold. They are **not** protected by any claim that the arms
  are populated identically to the base commit's — row C1a says a
  deadline-deferring run can populate them differently. Check that reading
  rather than assuming it, and if it is false, stop and say so rather than
  editing that package's surface from inside this boundary.
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
- **Cross-check your implementation against the preserved reference model.**
  `docs/specs/logbook/2026-09-17-dream-primary-dialogue-taint-model.js` is an
  executable transcription of the predecessor package’s row A5e with the 35
  sequences that closed its design gate; run it with
  `node docs/specs/logbook/2026-09-17-dream-primary-dialogue-taint-model.js`
  and compare its per-message flags with the ones reaching your scratch files.
  **It is a reference model, not the contract** — the predecessor’s Table A is
  the contract, and where the two disagree the model is the bug. It is inert:
  no dependency, no network, no write, collected by neither `npm test` nor
  `npm run lint`.
- **This package does not fix F1, and must not be described as fixing it.**
  Admission still marks every admitted session `processed` when the run's
  secret gate allows it, without any per-session examination result. Row C1
  guarantees only that no **byte** decision moves; row C1a says the count
  retired that way can still move when the deadline binds.
- **Do not redesign admission to close row C1a.** Making the admitted set
  deterministic means bounding the loop by something other than wall-clock time
  — a session-count bound, or moving the deadline check to exclude write cost —
  and both are policy changes with their own consequences, priced in owner
  item 3 and out of scope here. What this package owes is an honest statement of
  the limit and tests that make it falsifiable, not a fix.
- **Verified compatibility notes from the round-1 design review**, stated as
  facts so a later reader does not re-derive them: an extract whose projection
  is empty still reaches the ledger as `processed` under the run-level gate, and
  that is row C2's intent rather than an accident;
  `WP-dream-report-run-skips`'s bullets stay truthful, because they count this
  run's classifications and never promise a particular count — though row C1a
  means those counts themselves can differ from what the base commit would have
  produced on a deadline-bound run; changing the dream skill changes the
  scheduler's `promptHash`, so a normal `wienerdog update` / `wienerdog sync`
  rebinds the authorization while a stale binding fails closed at fire time, and
  **no part of this package may modify a live installation to work around that**;
  and the final filtered digest render (`WP-dream-digest-omits-own-job-alerts`)
  must remain the last statement of the locked body, with the existing
  ownership-checked cleanup order untouched.
- **Regenerate the skill digest with the repo's own tooling**, not by hand, and
  check the diff touches exactly one entry (row D4).
- **The RED proofs' `expectRed` sets were MEASURED AND CORRECTED at `119137d2`**
  (Erratum 3; this bullet read "DERIVED, not measured" when the spec was
  written, because the code they mutate did not exist yet). Each set was
  measured by hand-applying its mutation before its declaration was written,
  then confirmed by the **unfiltered** `npm run red-proofs`. Three declarations
  shipped, not two: AC1, **AC1b** and AC4 (Erratum 2). The instruction that
  produced this errata block stands for the next package:
  the implementer measures each set by running
  `npm run red-proofs` and **corrects the declaration**. Correcting a set may
  falsify prose, so these are the sentences that depend on it and must be
  re-read in the same pass: both `tests/red-proofs/…` Deliverables notes; this
  bullet; the Mirrored Surface Checklist's verification bullet clause naming
  `npm run red-proofs`; and the clause in each of AC1 and AC4 naming which
  behavior its proof reddens. If a measured set proves a criterion needs more
  than one mutation, add it and update those clauses — do not leave a criterion
  `PROVEN` by a proof that reddens for another criterion's reason.
  **A correction here is a PROSE change, so it does not belong to the
  implementer alone:** measure the set, correct the declaration, and report the
  affected sentences in the PR body — the orchestrator routes prose corrections
  back to the architect rather than letting a spec drift inside an
  implementation branch.

## ADR-0020 amendment text

Append this block verbatim to `docs/adr/0020-skill-revision-lifecycle.md`,
after the existing `## Amendment (2026-09-05): ledger-parser correctness
(WP-audit-e-ledger-parser-corpus)` section and before `## Future work (parked,
not specced)`. Do not edit it; do not reword its `Status:` line. That line
records adoption under the standing authorization, **not** an owner signature:
the owner adds his own signature line to this amendment himself, and no work
package may write `OWNER-SIGNED` or `OWNER-RATIFIED` on his behalf or state that
he approved, accepted or ratified it.

```markdown
## Amendment (2026-09-17): the model looks for skill learnings in dialogue only — WP-dream-primary-dialogue-collection

Status: **ACCEPTED under standing authorization 2026-09-17 — owner signature pending.**

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
the invocation window and still **refuses the whole ledger write** when the
model declared a value lower than the derived one; a repeated `##` heading is
still a refusal at all three reads; and a
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

**Which of this is enforced by code, and which is only asked of the model.**
Code produces the per-message provenance flag and no model can edit it; code
derives and refuses the skill-learnings ledger's flag for a newly counted Claude
session; code treats a ledger value that is not the exact literal `true` or
`false` as untrusted; and code requires `derived_from_untrusted` to be exactly
`false` for every Tier-3 write. What is **prompt only** is the step in between:
propagating those message flags onto an ordinary note's frontmatter. No code
checks which messages supported an ordinary candidate. That was equally true
before this amendment — the rule it replaces read message roles out of the same
prompt — and it is written down here because the new rule's code-produced input
makes it easy to mistake the whole chain for code. Unknown or missing
provenance remains `true`.

**A second cost, stated so it is not discovered later.** A headless routine
session — a scheduled digest, a routine run — is one prompt and one closing
report, so its entire operational middle lives in tool records and is now
outside the dream's view. And a routine's prompt is code-authored, yet it is an
ordinary user record: a measurement across 7 headless and 53 interactive local
transcripts found **no** top-level field distinguishing the two. So on a user
message the extract's `derived_from_untrusted: false` means exactly "the harness
attributed this record to the user role" — never "a human typed this", never
"this is true", and never "this is safe to obey". On an assistant message it
additionally means that no tool output and no context gap preceded it in that
session, and that state, once set, is never cleared. **A user message is `false`
by role regardless of what preceded it**, which is the rule this amendment
carries forward from the role-based one it replaces rather than a new one.
```

## Security checklist (delete only if the WP touches no untrusted input)

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

- [ ] **AC1 — byte-policy equivalence (Table C row C1).** With a mocked `now`
      that keeps **both** the baseline run and the projected run inside the
      preprocessing deadline — assert `deadlineDeferred` is empty in each, since
      one run finishing in time is not the condition (row C1a) — a fixture corpus
      exercising all five exclusion arms makes `collectExtracts` return
      `entries`, `processed`, `deferred`, `deadlineDeferred`, `readDeferred`,
      `oversized`, `newlyQuarantined` and `oversizedExtracts` that deep-equal
      what the base commit returns for the same corpus, ledger and
      `maxInputBytes` — including a case where the projected extracts would have
      let another session fit and it is **not** admitted. Its RED proof reddens
      on measuring admission against the projected extract.
- [ ] **AC1a — the deadline moves the boundary, in both directions (Table C row
      C1a).** With a mocked `now` that makes the preprocessing deadline the
      binding constraint, two tests: one in which the projection path admits
      **more** sessions than the base commit at identical intake bytes and the
      same `maxInputBytes`, and one in which it admits **fewer**. Both assert
      that every session the loop actually visited got the base commit's
      byte verdict, so the test distinguishes "the visited set moved" from "a
      byte decision changed". This criterion exists to make row C1's limited
      guarantee falsifiable rather than to defend a behavior: if the mocked
      clock cannot produce both directions, say so in the PR instead of
      weakening the assertion. Include the round-2 reviewer's shape as one of
      them: the projected run deferring **nothing** while the baseline defers
      under the same limit, which is the case that shows one run finishing in
      time is not the condition.
- [ ] **AC1b — a filename collision evicts the overwritten session's gate
      evidence (Table C rows C4, C4a).** **Rewritten by Erratum 1: TWO named
      cases, in BOTH write orders. Do not collapse them back into one.** A
      collector-to-validator test with two Claude sessions whose ids sanitize to
      one filename (`s_1` and `s.1` both give `claude-s_1.json`).
      **Why two cases, and why neither order alone is enough — read this before
      changing either.** `src/core/dream/validate.js:474` is
      `SID_RE = /^[a-z0-9]+:[A-Za-z0-9_-]+$/`, which is **exactly** `sanitize`'s
      alphabet (`scratch.js:18-20`). So any id colliding with `s_1` without
      *being* `s_1` must contain a character outside that alphabet and is
      therefore **also** a malformed Session-ID, refused whatever the gate map
      holds. That cuts both ways: with `s_1` surviving (the order the spec
      originally fixed, on the round-3 reasoning that `s.1` fails the schema in
      both designs) the **overwritten** id is `s.1`, its refusal is
      **over-determined**, and a no-eviction control cannot accept it — the
      control is impossible, not merely weak. With `s.1` surviving, the
      overwritten id is the schema-clean `s_1` and the map is the **only** thing
      that can refuse it, which is what makes the control real; but then the
      survivor is a session the schema would refuse anyway, so that order proves
      less about the survivor. Each order proves what the other cannot.
      **Case 1 — survivor `s_1` (the shape and the over-determination).** Write
      `s.1` first, `s_1` last. Assert: `sel.gateExtracts` holds **exactly one**
      entry for that filename, the last-written session; the survivor still
      authorizes a learning; the survivor's empty-primary-messages case is
      covered; and **the over-determination is asserted explicitly** — a ledger
      counting `claude:s.1` is refused as a *malformed Session-ID*, so a later
      reader cannot mistake this case for evidence about the eviction. Assert
      also that nothing else moved: both sessions remain in `entries` and
      `processed`, and the colliding path appears in `wrote` twice.
      **Case 2 — survivor `s.1` (the authorization claim and its control).**
      Write `s_1` first, `s.1` last, so the **overwritten** id is schema-clean.
      Assert: the gate map's only key is `claude:s.1`; a learnings-ledger entry
      counting the overwritten `claude:s_1` is refused as **not among this run's
      processed extracts**, which is bit-for-bit what the base commit does by
      re-reading the surviving file; and the same gate and ledger run against a
      session-keyed map built **without** the eviction **accepts** it — the
      non-vacuity control, which is possible only in this order.
      Shipped as `tests/unit/dream-collect.test.js:1470-1525` (case 1) and
      `:1527-1565` (case 2).
- [ ] **AC2 — what is written, and the memo (Table C rows C2, C3).** Each
      scratch file is the projection, byte-identical to the literal above for
      the literal input **with `source_path` substituted — the one field a temp
      home makes unreproducible, and the only substitution allowed (Erratum 6)**;
      a session whose projection retains no messages is still
      written with an empty `messages` array and appears in `entries` and
      `wrote`; an oversized memo written by the base commit is still honoured
      unchanged after this package, and no memo record gains a field.
- [ ] **AC3 — the dry-run names both numbers (Table C row C5).** `dream --dry-run`
      prints both lines of row C5 byte-exactly, with the second naming the
      configured limit, performs no model call and writes nothing.
- [ ] **AC4 — the gate reads the original timeline (Table D rows D1, D3).**
      Three cases, written against what the validator actually does — it
      **refuses**, it does not raise. Take a Claude session whose *primary
      dialogue* contains no tool record but whose *original* timeline has an
      external `tool_result` inside the skill's invocation window. (a) A ledger
      entry declaring `derived_from_untrusted: false` for that session is
      **refused**, with the reason naming `asserted lower than derived`, and the
      candidate bytes are left unchanged rather than rewritten. (b) The same
      entry declaring `true` is **accepted**. (c) **The control that proves the
      wiring, not just the gate:** a session with a clean invocation window and a
      correctly declared `false` is accepted — and becomes **refused**, with the
      reason naming that the session did not invoke the skill, when
      `extractsBySession` is incorrectly rebuilt from the projected scratch
      files, because those carry no `skill_invocations`. Also: a ledger entry
      counting a Claude session that did not invoke the skill is still refused,
      and a run in which the brain writes a file into the scratch directory
      still reaches the same verdicts. Its RED proof reddens on rebuilding
      `extractsBySession` from the scratch files; the measured `expectRed` set is
      **three** tests — cases **(a), (b) and (c) all redden**, and the
      declaration names all three (corrected by Erratum 4; the spec as written
      named case (c) alone).
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
      `Status: **ACCEPTED under standing authorization 2026-09-17 — owner signature pending.**`, and the file contains
      no sentence stating that the owner approved, accepted, ratified or signed
      it.
- [ ] **AC7 — the admitted-count measurement (Table C rows C1, C1a).** Manual
      evidence, recorded in a dated `docs/specs/logbook/` entry: run the base
      commit's collector and this package's collector over the **same**
      representative backlog, against a **disposable copy** of the transcript
      ledger and a temporary state directory — never `~/.wienerdog/state`, never
      the live ledger, never a scheduled run. Record: (i) **which regime EACH of
      the two runs was in** — whether it ended on the capacity stop, on the
      preprocessing deadline, or by exhausting its candidates — reported for
      **both**, because equality is claimed only when **neither** deferred on
      the deadline and one run's regime says nothing about the other's;
      (ii) the admitted
      session count and the admitted session-id list from each; (iii) the total
      scratch bytes from each, which is this package's value claim; (iv) the
      corpus size and the configured `maxInputBytes` and
      `dream_preprocess_timeout_seconds`. **How to read the result:** if both
      runs ended on the capacity stop or on exhausted candidates, the two
      admitted lists must be identical and a difference means row C1 is violated
      — stop and report it. If either run ended on the **deadline**, a
      difference is row C1a's expected behavior, not a violation, and what must
      be reported is its size and direction. Copy no transcript content into the
      repo. If the available backlog cannot reach the deadline regime, say so
      rather than reporting the byte-bound result as if it covered both.
- [ ] **Idempotency:** running `wienerdog dream --dry-run` twice writes nothing
      either time, and running the collector twice over an unchanged corpus and
      ledger writes byte-identical scratch files. A transcript already marked
      processed and unchanged is not reprocessed by this package.

## Verification steps (run these; paste output in the PR)

### Current-state checks — runnable before implementation

```bash
git rev-parse HEAD
git log --oneline c94e0e66..HEAD -- src/cli/dream.js src/core/dream/scratch.js src/core/dream/promote.js tests/unit/dream-collect.test.js
rg -n "Buffer.byteLength\(JSON.stringify\(extract\)\)|writeFilePrivate\(scratchFile|total input bytes" src/core/dream/scratch.js src/cli/dream.js
rg -n "extractsBySession" src/cli/dream.js src/core/dream/validate.js
rg -n "const startedAt = now\(\)|preprocessTimeoutMs" src/core/dream/scratch.js
rg -n "asserted lower than derived" src/core/dream/validate.js
rg -n "skill_invocations|tool_result|RAISES" skills/wienerdog-dream/SKILL.md
npm test -- tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/dream-skill-structure.test.js
```

### Implementation checks — these must pass before the PR

```bash
node -e "const t=require('./src/core/transcripts'); if (typeof t.parsePrimaryWithOutcome !== 'function') { console.error('predecessor WP has not landed'); process.exit(1); } console.log('predecessor present');"
test -f skills/wienerdog-dream/SKILL.md && ! rg -q "skill_invocations|tool_result|errored" skills/wienerdog-dream/SKILL.md
test -f docs/adr/0020-skill-revision-lifecycle.md && rg -qF 'Status: **ACCEPTED under standing authorization 2026-09-17 — owner signature pending.**' docs/adr/0020-skill-revision-lifecycle.md
test -f docs/adr/0020-skill-revision-lifecycle.md && ! rg -qi "owner (approved|accepted|ratified|signed)" docs/adr/0020-skill-revision-lifecycle.md
npm test -- tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/dream-skill-structure.test.js tests/unit/dream-validate.test.js tests/integration/dream.test.js
npm test
npm run lint
npm run red-proofs   # UNFILTERED — see the note below; redirect to a file, read the verdict
node scripts/boundary-check.js docs/specs/WP-dream-primary-dialogue-collection.md src/core/dream/scratch.js src/cli/dream.js skills/wienerdog-dream/SKILL.md src/core/runtime-skill-digests.json docs/adr/0020-skill-revision-lifecycle.md tests/unit/dream-collect.test.js tests/unit/dream-pipeline.test.js tests/unit/dream-skill-structure.test.js tests/integration/dream.test.js tests/red-proofs/dream-primary-collection.proofs.json tests/red-proofs/dream-primary-collection-pipeline.proofs.json
git diff --check
```

The second, third and fourth commands are **guarded** on purpose: a bare
negated `rg` exits 0 when the file is missing, so the check would read greenest
exactly where the work was never done. `test -f` runs first, and each line fails
if its file is absent.

**The red-proofs line is the UNFILTERED run, and that is not a preference
(Erratum 7).** This spec originally listed
`npm run red-proofs -- --wp WP-dream-primary-dialogue-collection` here, which
**cannot exit 0**: `--wp` leaves every other package's declarations unselected,
`rollUp` (`scripts/red-proofs.js:2152-2154`) marks any pair with a left-out
declaration `FILTERED`, the run verdict is the worst pair verdict, and the exit
code is `verdict === 'PROVEN' ? 0 : 1` (`:1893`). A scoped run therefore reports
`RUN: FILTERED` and exits 1 however green its selected proofs are. The
`--wp` form is a **fast non-gating reading** while iterating; the check that
must pass before the PR is the unfiltered run, which takes 15–20 minutes — so
redirect its whole output to a file, wait on its own PID, and read the
`RUN:` line from the file.

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
- **Redesigning admission so the admitted set is deterministic under the
  preprocessing deadline** — changing what the deadline measures, when it is
  checked, or replacing it. Row C1a states the limit; owner item 3 prices the
  fixes; neither is built here.
- Any replay, migration or `--reprocess` of already-processed transcripts, and
  any edit to `~/.wienerdog/state/transcript-ledger.json` outside a test's
  temporary directory.
- Editing `docs/runbooks/codex-review.md` or any other runbook. A work package
  does not amend the review process.
- Restoring tool text to any surface, changing `MAX_MSG_CHARS`/`MAX_MESSAGES`,
  or changing the exclusion-arm console lines owned by
  `WP-dream-report-run-skips`.

## Discovered issues (routed, not this WP's work)

- **Two session ids that sanitize to one scratch filename silently lose one
  session's dialogue, and both are still marked processed.** `sanitize`
  (`src/core/dream/scratch.js:18-20`) maps every character outside
  `[A-Za-z0-9_-]` to `_`, so `s_1` and `s.1` both write `claude-s_1.json`;
  executed and confirmed at the base commit. The second write overwrites the
  first, the same path is appended to `wrote` twice, and **both** sessions reach
  `processed`, so the overwritten session's content is never consolidated and
  never retried. This predates this package. Row C4's eviction only stops the
  package from *weakening the authorization gate* over that collision — it does
  not fix the loss, and **must not be described as fixing it**. A real fix needs
  a collision-free scratch filename (a fingerprint or an index suffix) plus a
  decision about the ledger outcome for the loser, which is a separate work
  package.

## Dispatch precondition — owner items

Every item below is **a recommendation adopted under standing authorization, not
a direct ruling** — the standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the architect
records a recommendation with the cost of overruling it, the session may dispatch
under that recommendation, and **the owner reverses any of them by dated
amendment**, applied to this spec by a committed revision rather than by a
dispatch message, because `scripts/boundary-check.js` reads the Deliverables
table in this file and nothing a message says changes what CI sees. **Nothing in
this repository records the owner approving, accepting or ratifying any of them,
and this spec asserts no such acceptance.** Each was raised by the architect or by
a numbered design-review round and carries its round in the logbook entry
`docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md`.

1. **Does `dream_max_input_bytes` bound transcript INTAKE or model-visible
   OUTPUT?** *Recommendation:* intake (row C1). The scope record
   (`docs/specs/logbook/2026-09-17-dream-primary-input-scope.md`) reads
   "Preserve the existing X as an admission bound on the resulting normalized
   primary extracts", which can be read the other way; the recommendation
   follows that same record's own principle one level up — "without admitting
   more sessions simply because filtering freed space" — applied to the
   projection rather than only to the later model filter. Measuring intake gives
   **byte-policy equivalence**: every byte-based admission decision stays the
   base commit's. The admitted session set is equal to the base commit's only
   when **both** runs avoid deadline deferral (row C1a), so **this package does
   not promise that it cannot worsen F1** — it promises that it does not worsen
   it through the byte bound, and owner item 3 prices the deadline residual
   separately. *Cost of overruling,* priced: (a)
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
3. **Is a deadline-dependent admitted set acceptable?** Row C1a: when the soft
   preprocessing deadline is the binding constraint, this package's admitted
   session set can differ from the base commit's in either direction, because
   the deadline measures wall-clock time across parsing, serialization and
   scratch writes and projection changes all three. The design review executed
   the real collector with mocked timing and measured **one** session admitted
   under the baseline against **four** under projection, at identical intake
   bytes and the same limit. *Recommendation:* accept it, and keep the
   measurement (AC7) rather than a fix. The byte dimension — the one the owner's
   scope record speaks about — is closed; the deadline is a pre-existing soft
   bound whose behavior was already load-dependent, and every change to
   preprocessing cost this repo has ever made moved it. *The F1 consequence,
   stated plainly:* on a deadline-bound install, cheaper writes admit **more**
   sessions per night, and every one of them is marked processed whether or not
   the consolidation agent read it. *Cost of overruling,* two priced routes:
   (a) bound the loop by session count as well — deterministic, but it is the
   new policy knob owner item 1 exists to avoid, and its remainder lands in the
   capacity arm whose console line names the wrong setting; (b) make the
   deadline measure only parse time, excluding serialization and writes —
   smaller, but it changes what the documented
   `dream_preprocess_timeout_seconds` means to a user, and it does not make the
   set identical, only less sensitive. Both are admission redesigns and belong
   in their own work package. Nothing here records an owner decision.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) The design gate is **closed at round 3
   (`approve`)**, which is what makes this spec `Ready`
   (`docs/runbooks/codex-review.md`); the three findings and two machinery notes
   are dispositioned in
   `docs/specs/logbook/2026-09-17-dream-primary-dialogue-split.md`, raws
   preserved before adjudication. (b) The owner items travel with this package
   as **recommendations adopted under standing authorization**; any the owner
   reverses by dated amendment is applied by a committed revision, never by a
   dispatch message. (c) **Both prerequisites are satisfied:**
   `WP-dream-primary-dialogue-projection` is `Done` (PR #266) and
   `WP-dream-report-run-skips` has merged (PR #264).
   (d) **Every cite is pinned to base `b46a3843` and was re-derived by
   construct on 2026-09-18.** If anything lands in
   `src/core/dream/scratch.js`, `src/core/dream/promote.js`, `src/cli/dream.js`
   or `tests/unit/dream-collect.test.js` after that day, re-derive those cites
   again, construct by construct — that file set is the one sibling packages
   keep moving.
   (e) Branch `wp/dream-primary-dialogue-collection`.
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
6. **Closed 2026-09-18.** Implementation PR **#269**, merge `297ef1df`, tip
   `119137d2`. Both gates clean on that tip: wd-reviewer **APPROVE** with
   executed evidence; the independent gate (Codex plugin `review`,
   `gpt-6-astra`) *"No actionable regressions found"*; CI seven checks pass.
   Item 1's evidence as measured on `119137d2`: `npm test` 2895 / 2883 pass /
   **0 fail** / 12 skipped; `npm run lint` clean; the **UNFILTERED**
   `npm run red-proofs` → `RUN: PROVEN`, **157 PROVEN**, zero `FAILED`,
   `VACUOUS`, `UNCONTROLLED`, `FILTERED` or `ERROR` — including this package's
   three declarations, at criteria 1, **1b** and 4. The reviewer's
   `--wp`-scoped run selected 3 of 3 and proved all 3 while reporting
   `RUN: FILTERED` with exit 1, which is the scoped form's construction and not
   a finding (Erratum 7). AC7's measurement is
   `docs/specs/logbook/2026-09-18-dream-primary-dialogue-collection-ac7-measurement.md`
   (with its own dated correction of the Regime-1 admitted-list notation).
   Nine errata are recorded at the head of this file; none is a defect in what
   shipped.
