---
id: WP-ep2-n2-rehome
title: Re-home Table N row N2 and every registered mirror onto the real prune call site
status: Done
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0005, ADR-0031, ADR-0036]
epic: secret-lifecycle
---

# WP-ep2-n2-rehome: re-home N2 onto the call site that exists

> **Filed Done, 2026-09-18 (post-merge), with ERRATUM 3 below — four stale or
> under-specified spec-prose facts. None is a defect in what shipped.**
>
> **Landed in PR #285** (merge `862f8277`, 2026-09-18 14:22:17 UTC), tip
> `0b3d768c`. **Two gate rounds.** Round 1 (tip `8a24ebff`) found the mechanical
> evidence green and **one family stale on THIS SPEC's side**, not in the diff:
> Table M registered N2's trigger-locus mirrors but **not M-48's
> mutation-identity mirrors**, so B10, the M-13 errata sentence and M-6
> contradicted the re-keyed M-48, and this spec's "add mirrors on the spot" rule
> collided with its own Deliverables restriction. **Errata 1 and 2 (#287, #290)**
> — both already above — specified the family (row **N2R-13**), split **N2R-11**
> into old-slug = 0 / new-slug = 10 after the mandated literals raised the count,
> and recorded the implementer's precedence call (a mandated literal outranks a
> verification count) as correct. **Round 2 on `0b3d768c`: both gates clean, CI
> seven checks pass.** wd-reviewer returned APPROVE; the independent gate (Codex
> plugin `review` on `gpt-6-astra`) returned *"consistently update the retention-
> prune documentation and mutation references without changing executable code …
> no actionable defects."*
>
> **Numbers on `0b3d768c`.** `npm test` 2906 tests / 2894 pass / **0 fail**;
> `npm run lint` clean; `boundary-check` exit 0 with **exactly eleven hunk
> regions** in the 6962-line Done spec, one per Table M `EDIT` row. **No
> red-proofs run applies to this package — it ships no test and no executable
> line**, so there is no `RUN:` verdict to record and none is claimed. V-1…V-8
> green (V-5 old slug 0 / new slug 10 across nine lines; V-8's four digest slices
> each extracted non-empty); N2R-13's six clauses byte-exact at their anchors;
> every `CHECK` row re-read whole-cell with the cleared claim named; the
> `src/core/dream/validate.js` diff is **JSDoc-only** (`5 3`, zero non-comment
> lines); the successor's nine re-pinned `validate.js` cites verified against the
> landed constructs; the ADR-0036 word-diff is **exactly one slug**, with
> `OWNER-SIGNED` byte-identical.
>
> **Owner item O-1 was TAKEN UNDER THE STANDING PROCESS on 2026-09-18** and
> recorded on `main` in **#283**. Nothing in this repository records the owner
> approving, accepting, ratifying or signing it; the gate confirmed no approval
> language anywhere in the diff.
>
> **ERRATUM 3 — 2026-09-18, after PR-gate round 2 (PR #285, tip `0b3d768c`).
> Four items, all measured by the fidelity gate, none a finding against the
> diff.** Each cites the spec line as it stood at merge.
>
> **(a) N2R-14's pin sentence was too broad.** *What was wrong:* the row said
> *"so **`src/` stays pinned at `08de2bc3`**"*. That claims a pin over the whole
> of `src/`, which this WP never touched and cannot speak for — a later package
> moving an unrelated file would falsify a sentence this row had no business
> making. *What is true:* the only `src/` file in this WP's Deliverables is
> `src/core/dream/validate.js`, and the claim that holds is about **that file's
> executable constructs**, which are byte-identical at `08de2bc3` because the
> edit is comment text only (**AC-8**, **V-6**); only line numbers move, by `+2`.
> *Routing:* **corrected in place** in row N2R-14 above. The `+2` sweep itself is
> unaffected and was verified by the gate.
>
> **(b) This spec's own Current-state cites shift `+2` in the landed tree — one
> sentence, recorded, NOT a re-pin sweep.** *What is wrong:* the `validate.js`
> cites in this spec's own **Current state** section were written against
> `08de2bc3` **before** the JSDoc grew from three lines to five. In the landed
> tree every `validate.js` construct below `:1159-1175` sits **two lines lower**
> than this spec prints it. *What is true, and why nothing is rewritten:* N2R-14
> already contracts the `+2` shift and already sweeps it into
> `WP-ep2-prune-once-per-run-test`, which is the spec that has to *use* those
> cites. This spec's Current state is the record of what was true **at its own
> pin**, not a live index into `main` — the same rule that governed erratum 10 of
> `WP-dream-primary-dialogue-collection`. *Routing:* **recorded, not corrected.**
> Add `+2` to any `validate.js` line number this spec's Current state prints
> below the JSDoc block; the constructs, their order and every argument resting
> on them are unchanged.
>
> **(c) M-12's "the two surfaces that pass added" stated a count where it owed a
> list.** *What is wrong:* the N2 mirror bullet (d) in
> `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:~3011` closed with *"this
> list had omitted the growth story as well as the two surfaces that pass
> added"*. **A count is checkable only beside the list it counts** — which is the
> standing rule N2R-12 already binds for the other enumerations in that document,
> and the exact defect that falsified M-48's own mirror count three rounds
> running. *What is true:* the two surfaces are **Table B row B10** and **the
> JSDoc above `pruneRedactedOriginals` in `src/core/dream/validate.js`**.
> *Routing:* **a real edit, made in this PR**, in the Done spec at that anchor —
> naming only, nothing else in the bullet changes.
>
> **(d) The AC-14 dated sentence lacked the qualifier its siblings carry.**
> *What is wrong:* at
> `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:~4250`, AC-14's third case
> describes the 2026-07-28 run as *"the isolated N2-only mutation — move the
> `pruneRedactedOriginals` call into the B4 loop …"* with **no date qualifier**,
> while its two siblings — the M-48 census row at `:4525` and mutation row M-48
> at `:4729` — both carry **"as it was spelled at that date"**. After the
> re-key (N2R-9), an unqualified sentence reads as a description of M-48's
> *current* mutation, which it is not. *What is true:* the sentence is a claim
> about **2026-07-28** and is still true of that day (N2R-10); only its
> qualification was missing. *Routing:* **a real edit, made in this PR** —
> routing-only, the four words inserted, identical to the treatment `:4525`
> already carries. Table M row **M-7** should have caught this: it marked AC-14's
> third case `EDIT, ROUTING ONLY` and pinned the dated sentence at `:4229`
> without noticing that the *same* case carries a second dated sentence at
> `:4250`. **A row that names one instance of a pattern inside a range does not
> cover the range.**
>
> **ERRATUM 1 — 2026-09-18, after PR-gate round 1 on the implementation
> (PR #285).** Both gates landed on one family: **Table M registered only N2's
> trigger-LOCUS mirrors, while N2R-9 re-keys a SECOND contract — M-48's mutation
> IDENTITY — whose mirror family Table M never enumerated.** Three surfaces
> identify M-48 with the per-call form and were therefore bounded to `CHECK` or
> to the locus clause alone. **Row N2R-13 now enumerates them with a literal
> replacement clause each**, and rows **M-2**, **M-6**, **M-8** and **M-13** are
> widened to that axis. The erratum also repairs a contradiction the gate found
> between the Mirrored Surface Checklist and the Deliverables boundary, fixes an
> ordinal, reconciles AC-8's JSDoc range, and pins the block's landed shape
> (**N2R-14**) so `WP-ep2-prune-once-per-run-test`'s `validate.js` cites can be
> re-pinned in the same pass. **`status:` does not change.** This is an
> architect's erratum on a `Ready` spec, which is why it lands as its own docs PR
> rather than from the implementation branch — see the Checklist's routing rule.
>
> **ERRATUM 2 — 2026-09-18, after PR-gate round 2 on the implementation
> (PR #285, tip `b78d3cb2`).** **Erratum 1's own literals broke erratum 1's own
> gate.** N2R-13(a) and N2R-13(c) each spell `WP-ep2-prune-once-per-run-test`
> inside a mandated replacement clause, so applying them byte-exactly takes the
> new slug from eight occurrences to **ten** — while N2R-11's count sentence,
> **AC-6** and **V-5** still said eight. The implementer applied the canonical
> rows and left V-5 failing rather than reword a mandated literal, which is the
> correct precedence and is recorded as such. **N2R-11 now states the two facts
> separately** — the eight OLD occurrences are re-routed and the old slug ends at
> zero; the new slug ends at exactly ten — and **AC-6 and V-5 assert both
> counts**. **M-9**'s verdict also picks up the ordinal obligation N2R-12 already
> carried for the other lists. **`status:` does not change.**

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **IRON RULE (ADR-0004): Wienerdog is
just files.** No daemons, no servers, no telemetry. This work package edits
markdown and one block of JSDoc. It starts nothing, writes nothing to a user
machine, adds no dependency, and changes no executable line.

The **dream** job is the nightly consolidation run. Before it commits anything it
runs a **secret gate** (called EP2) over the notes it is about to write. On a
finding whose severity is `redact`, the gate takes a **redact arm**: it preserves
the unredacted original into `state/quarantine/redacted/`, rewrites only the lines
that run added to their sanitized form, stages the scrub, and commits the note.
That `redacted/` folder is capped, and a **retention prune** deletes the oldest
copies when it grows past the cap.

The retention contract is seven facts, decided in one canonical table —
**Table N** in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` (`:1748-1765`)
— which was extracted precisely because three consecutive review rounds kept
landing findings on prose that restated it. **Row N2 is the trigger**, and it
currently reads:

> **N2** | **the trigger** | the prune runs **once per gate run**, after the loop
> over changed paths, **and only if at least one B4 completed** (Table R row
> **R8**). A run that completed no redaction does **not** prune. **Never after a
> bare preserve**, so B5/B5a fall-throughs never prune

**The rule that sentence states is still exactly right. The architecture it
describes is gone.** Two later packages moved it:

- **`WP-dream-promote-in-workspace`** (commit `4115668a`) extracted the four
  gates into their Table D input shape. The per-path loop the gate used to run —
  `for (let i = 0; i < scanTokens.length; i++)` — no longer exists. `scanTokens`
  occurs **zero** times anywhere in `src/` or `tests/`.
- **`WP-dream-gate-inputs-baseline-delta`** replaced the gate's three
  `git diff --cached` calls with a workspace delta, so the gate no longer spawns
  git per changed path at all.

Today the prune's run state and its guard live in a closure that `makeGates()`
returns, and the **pipeline** decides when to invoke it. So N2 — a contract about
*when* something runs — now spans an authority boundary it did not span when it
was written: the gate owns the state, the caller owns the timing.

**This work package moves the contract's wording onto the real locus and moves
every registered mirror in the same pass. It changes no rule.** It is the
precondition for `WP-ep2-prune-once-per-run-test`, which gives N2 the detector it
has never had: that test must cite the row it enforces, and today the row
describes a call site the test would not be watching.

## Current state

**Pinned to `main` at `08de2bc3`. Every cite below was located by finding the
construct, never by adding a delta to an older line number. Re-derive them before
you start — if the content has moved but is present, that is drift and you report
it; if the content is absent, stop and say so.** *(Provenance: the drafts this
package supersedes were pinned at `622ca04b`; `git diff --stat 622ca04b 08de2bc3`
touches only `docs/HANDOVER.md` and five spec/logbook files, so every code and
ep2-spec cite is unchanged across that range.)*

### The code, as it is today

**`src/core/dream/validate.js`:**

- `pruneRedactedOriginals(stateDir, created)` — the helper, module-private,
  declared at **`:1174`**. It reads `<stateDir>/quarantine/redacted/`, returns
  immediately when the file count is at or below the cap, filters to
  date-prefixed regular files **not** in `created`, sorts by `(mtimeMs, name)`
  ascending, and deletes from the front until the count is back at the cap. Every
  failure is swallowed — *"best-effort: a failed prune never fails the arm"*.
  **Unchanged in substance since Table N was written.**
- **Its JSDoc, `:1159-1173`**, opens — at `:1160-1161`, hard-wrapped mid-phrase —
  *"Keep `state/quarantine/redacted/` bounded. Runs ONCE per gate run, after the
  loop over changed paths, and only when at least one redaction completed"* —
  **the same stale locus as Table N row N2, inside `src/`.** This mirror is
  registered for the first time by this work package; none of the five mirror
  lists in the ep2 spec named it.
- `makeGates(o = {})` — declared at **`:1316`**. Its JSDoc (`:1300-1315`) already
  states the re-homed fact in prose: *"They are built together because the EP2
  gate is the only one with RUN state — the basenames it wrote into `redacted/`
  and whether any redaction completed — and that state is what the once-per-run
  retention prune is a function of."* Its `@returns` names five members:
  `{secret, skillBody, tier3, ledger, pruneRedacted}`.
- `const redactedCreated = new Set();` — **`:1320`**, closure-scoped, with the
  comment *"every basename this run wrote into `redacted/`"*.
- `let completedRedactions = 0;` — **`:1322`**, with the comment *"how many
  redactions COMPLETED — the prune's precondition"*. **This is the counter the
  old N2 prose calls `secretRedactions`; that name no longer exists in `src/`.**
- `completedRedactions += 1; // increments LAST, only after a verified scrub` —
  **`:1418`**, inside the `secret` gate's redact arm, immediately after the scrub
  is verified.
- `if (redactCopy) redactedCreated.add(redactCopy.name);` — **`:1415`**,
  immediately after each successful redact-preserve.
- **The guard, `:1550-1558`**, the last member of `makeGates`'s returned object:

  ```js
      /**
       * Retention, once per run and only after a COMPLETED redaction — a run that
       * redacted nothing never runs a delete path over the recovery directory.
       * Called by the pipeline after `promote()` returns, which is the point the
       * per-path loop it used to follow has finished.
       */
      pruneRedacted: () => {
        if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);
      },
  ```

**`src/cli/dream.js`:**

- `makeGates` is imported by **destructuring at require time**, `:34-39` — `const {`
  on `:34`, `} = require('../core/dream/validate');` on `:39`.
- `const gates = makeGates({ stateDir: paths.state });` — **`:1060`**.
- **The one invocation, `:1100-1102`:**

  ```js
      // Retention, once per run and only after a completed redaction — the
      // point the gate's per-path loop used to be followed by.
      gates.pruneRedacted();
  ```

  It is unconditional, it sits after the `try`/`catch` around `promote()`, and it
  is the only **call** to `pruneRedacted` in `src/`. Confirmed by
  `grep -rn 'pruneRedacted' src/`, which returns **five** hits: four in
  `validate.js` — `:1174`, which matches only because `pruneRedactedOriginals`
  contains the string; the `@returns` JSDoc line `:1314`; the closure `:1556`; the
  guarded call `:1557` — and this one in `dream.js`. **Exactly one of the five is
  an invocation of the closure**, which is the claim N2R-5 makes.

### The document, as it is today

All line numbers are in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`
(6941 lines) unless stated otherwise. **That spec is `Done`** — it may be edited
only at the cells Table M below names, and four pinned digests guard regions you
must not enter (V-11, V-18, V-20, V-33; see Implementation notes).

**Five separate mirror lists in that document register this contract, and no two
of them agree.** The drafts this package supersedes described two. All five are
enumerated in Table M's `registered by` column, and **reconciling all five onto
one union is half the work of this package**.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | **Only the cells Table M marks `EDIT`.** Every value written comes from **Table N2R**; restate nothing. **Touch nothing else in this file** |
| modify | src/core/dream/validate.js | **COMMENT TEXT ONLY — the JSDoc block at `:1159-1173` above `pruneRedactedOriginals`, and no other line of the file.** Table M row **M-15**. No executable line may change; asserted by **V-6**. *Precedent: the ep2 spec's own **V-28** (`:6181`) edits and then checks a `validate.js` header comment as a contract mirror, so a code comment carrying a canonical fact is already treated here as a mirror rather than as code* |
| modify | docs/adr/0036-mechanism-cell-schema-for-contract-tables.md | **Exercised — owner item O-1 was taken under the standing process on 2026-09-18 (see that section) — and then only the routed-WP slug inside row A3 (`:106`).** Table M row **M-16**. Every other byte of that ADR — including its `OWNER-SIGNED` line, A3's divisibility claim and A3's dated 2026-07-28 measurement — is unchanged. *The earlier conditional form — "only if O-1 is granted … if declined, this row is not exercised" — is superseded by the ruling; erratum 1* |
| modify | docs/specs/WP-ep2-n2-rehome.md | **This spec file — the `status:` transition ONLY** (`Ready` → `In-Review`, per Definition of done item 4). No other line of this file may change. *Listed explicitly rather than relied on as a convention: `_TEMPLATE.md` carries the self-file exception in a comment above its Deliverables table, and a reader who never opens the template would otherwise have a Definition-of-done item the permission boundary forbids* |

**`tests/` is NOT in this table, and neither is any executable line of `src/`.**
The behaviour is correct as shipped; only its description is stale. If you find
yourself changing what `validate.js` or `dream.js` *does*, stop — you are in the
wrong package.

### Exact contracts

**Nothing executable changes.** The contract this WP ships is the wording of a
table row, the set of surfaces that must agree with it, and one re-keyed mutation
statement — all given in Table N2R and Table M below.

**The old spelling, so you can find every instance of it.** These strings are what
the document says today and what must not survive this pass **as a description of
the present**:

```text
after the loop over changed paths
secretRedactions
the post-loop
scanTokens
```

*Two caveats, and they are load-bearing:* **`scanTokens` and `secretRedactions`
may legitimately survive inside a DATED historical sentence** (M-48's 2026-07-28
measurement is stated in the past and must stay true, per N2R-10), and **`the B4
loop` is NOT on this list** — it names a real loop that `promote()` runs, so a
blanket replacement of it would falsify correct text. Check each hit rather than
replacing blind.

## Contract reference

**The ADR-0031 activation trigger fires — two of seven conditions are true**, so
this WP carries canonical tables and a Mirrored Surface Checklist:

- **(v) the task crosses an authority boundary.** `makeGates()` records the run
  state (`redactedCreated`, `completedRedactions`) and decides the *precondition*;
  `src/cli/dream.js` owns the *timing* by choosing when to invoke the closure. One
  component records, another decides the lifecycle. **This boundary is the whole
  content of the change** — it did not exist when N2 was written.
- **(vii) the same contract must appear in multiple mirrored surfaces.** Sixteen
  registered surfaces across three documents, five of which are themselves mirror
  *lists* that must move with the row.

*(Condition (vi) fires too — `WP-ep2-prune-once-per-run-test` is a successor spec
that inherits this contract. Noted so a reviewer need not re-derive it.)*

### Contract table(s)

#### Table N2R — canonical: where N2's trigger lives after the gate extraction

**This table is the single place these facts are decided. Every Deliverables cell,
every acceptance criterion, every verification grep and every sentence of operative
prose in this spec defers to it and restates nothing.** Measured at `08de2bc3`.

| id | fact | value |
|----|------|-------|
| **N2R-1** | **what the rule is** | **unchanged from Table N row N2's present rule:** the prune runs **once per run**, and **only if at least one redaction completed**. A run that completed no redaction does not prune; a bare preserve never prunes. **This WP changes no rule and no acceptance behaviour** |
| **N2R-2** | **who holds the run state** | `makeGates()` in `src/core/dream/validate.js` (`:1316`). Two closure-scoped values: `redactedCreated` (`:1320`), the set of basenames this run wrote into `redacted/`, and `completedRedactions` (`:1322`), incremented at `:1418` **last**, only after a verified scrub |
| **N2R-3** | **who holds the precondition** | the `pruneRedacted` closure, `validate.js:1556-1558`: `if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);`. It is a member of the object `makeGates` returns, declared in its `@returns` at `:1314` |
| **N2R-4** | **who decides WHEN — the timing authority** | `src/cli/dream.js:1102`, `gates.pruneRedacted();` — unconditional, after the `try`/`catch` around `promote()` returns. **This is the authority boundary: the gate cannot prune itself, and the pipeline cannot see the counter** |
| **N2R-5** | **the cardinality** | **exactly one** reachable `gates.pruneRedacted()` call per run. It is the only call in `src/` |
| **N2R-6** | **the counter's name** | **`completedRedactions`.** `secretRedactions` does not exist in `src/`; it survives only as a fixture-facing result field in `tests/unit/dream-validate.test.js` |
| **N2R-7** | **the construct N2's old wording named** | the per-path loop `for (let i = 0; i < scanTokens.length; i++)` — **removed** by `WP-dream-promote-in-workspace` (`4115668a`). `scanTokens` occurs zero times in `src/` and `tests/`. The gate also no longer spawns per-path git (`WP-dream-gate-inputs-baseline-delta`) |
| **N2R-8** | **what did NOT change** | Table N rows **N1, N3, N4, N5, N6, N7**; the body of `pruneRedactedOriginals` (`:1174`); every acceptance behaviour of the retention prune; M-48's census limb. **A pass that edits any of these has exceeded this WP** |
| **N2R-9** | **the re-keyed M-48 mutation** | *duplicate the single `gates.pruneRedacted();` invocation at `src/cli/dream.js:1102`, passing the accumulated `redactedCreated` set unchanged, so the prune runs twice in one run* — replacing *"move the `pruneRedactedOriginals` call from its post-loop site into the B4 loop"*. **It stays an N2-only mutation that preserves N3**, and it is **byte-identical to the `find`/`replace` of proof (a) in the declaration `WP-ep2-prune-once-per-run-test` ships**, so the row and the machine-run proof state one mutation. **M-48 states exactly one mutation (ADR-0036 row A3), so the per-redaction schedules that successor also proves get NO row here** — adding one would be a second mutation row in a `Done` spec and is out of scope |
| **N2R-10** | **M-48's dated measurements** | **stay exactly as written and are not re-run.** *"EXECUTED 2026-07-28, AND REDDENED NOTHING AT THAT DATE"*, the `tests 1807, pass 1802, fail 0` counts, and the sentences describing the 2026-07-28 mutation as a move into the B4 loop are claims about a day, and are still true of that day. **Do not restate them in the present tense and do not delete them** — their dated form is what lets this WP edit the row without re-establishing the measurement |
| **N2R-11** | **the routed-WP slug** | **Two facts, counted separately — *restated by erratum 2, which found them conflated into one number that N2R-13 then falsified*.** <br>**(i) THE RE-ROUTING.** `WP-ep2-prune-once-per-run-test` replaces `WP-ep2-retention-prune-timing-test` at **all eight** of the old slug's occurrences in the ep2 spec — lines `2317`, `2322`, `4240`, `4246`, `4247`, `4504` (twice) and `4708` — so **the old slug ends at ZERO**. Also at its single occurrence in `docs/adr/0036-…:106`, which **owner item O-1's ruling makes an exercised surface** rather than a conditional one. The path string at `:2322` becomes `docs/specs/WP-ep2-prune-once-per-run-test.md`, which exists. <br>**(ii) THE RESULTING COUNT.** The new slug ends at **exactly TEN** occurrences in the ep2 spec: **(i)'s eight re-routings, plus one each from the mandated replacement literals in N2R-13(a) and N2R-13(c)**, which name the successor package as the owner of the per-redaction schedule. **Ten is the contracted number, and a pass that lands any other count has either missed a re-routing or added a mention this table does not decide.** *Measured on the implementation at `b78d3cb2`: old 0, new 10, across nine lines (`4504`'s successor line carries two).* |
| **N2R-12** | **the union every mirror list must end up registering** | **Table M rows M-1 … M-16**, which is the union of the five lists named in Table M's `registered by` column, plus M-15 and the routed-slug surfaces. **Every list in Table M marked `EDIT` ends the pass registering exactly that union restricted to its own subject** (the N2-trigger lists register the trigger's mirrors; the routed-slug registration registers the slug's). **Each list names the surfaces it adds BY NAME, never by list position** — ADR-0036 row **A2** forbids an ordinal where a structural anchor is available, and here the ordinal is also false: **`Table B row B10` is FIRST in M-48's six-surface enumeration**, so a phrase like *"the last two"* names the wrong pair. The accepted form is M-12's — *"the two surfaces that pass added"*, followed by their names |

| **N2R-13** | **the surfaces that IDENTIFY M-48 with the per-call form** — *erratum 1* | **Three cells assert what M-48's mutation IS, not where the prune runs, and N2R-9 falsifies all three.** Each is given with its anchor and its literal replacement; **nothing else in any of the three cells is touched.** <br>**(a) Table B row B10** (`:1572`) — anchor `reading it into this chain is a per-call prune, i.e. exactly what mutation M-48 does` → the literal **“reading it into this chain is a per-redaction prune — the schedule `WP-ep2-prune-once-per-run-test`'s proof (b) covers; M-48 is the duplicate-invocation form”** (the quotation marks are this table's delimiters and are not written) <br>**(b-i) the M-13 errata sentence** (`:2355`) — anchor `correctly and cites M-48 more accurately after the split than before it` → **`correctly; its M-48 citation was RE-KEYED on 2026-09-18, when M-48 became the duplicate-invocation form and B10's clause named the per-redaction schedule instead`** <br>**(b-ii) the same sentence's closing clause** (`:2357-2358`) — anchor `Both are registered as M-48 mirrors by this sentence, checked, and left byte-unchanged.` → **`Both are registered as M-48 mirrors by this sentence. Consequence 7 was checked and left byte-unchanged; B10 was left byte-unchanged on 2026-07-28 and RE-KEYED on 2026-09-18, so "two that did not" counts that pass and not today's.`** <br>**(c) the Security checklist's per-call-half clause** (`:3675`) — anchor `and only the per-call half now has a row` → the literal **“and on 2026-07-28 only the per-call half had a row. Since 2026-09-18 M-48 states the duplicate-invocation form, so neither half has a mutation row here; the per-call (per-redaction) schedule is covered by `WP-ep2-prune-once-per-run-test`'s proof (b)”** (delimiters not written) <br>**(d) that bullet's provenance date** (`:3670`) — anchor `**Re-keyed 2026-07-28, round 7 of the post-Done errata**` → the same with **`, and again on 2026-09-18`** appended inside the bold, **exactly as M-9's row already does**. Without it the bullet dates a 2026-09-18 statement to 2026-07-28 <br>**(e) the AC-15 census cell's dated mutation description** (`:4504`) — anchor `The isolated N2-only mutation — move the prune call into the B4 loop` → the same with **`as it was spelled at that date`** inserted after `mutation`, again matching M-9. The cell stays dated-past and its limb stays `gap` |
| **N2R-14** | **the re-homed JSDoc's landed shape, and the shift it forces** — *erratum 1* | The re-homed opening paragraph of `pruneRedactedOriginals`'s JSDoc is **five lines where it was three**, so the block runs `:1159-1175` where it ran `:1159-1173` and **every construct below it in `src/core/dream/validate.js` shifts by `+2`**. The file's executable content is unchanged — the edit is comment text only (**AC-8**, **V-6**) — so **`src/core/dream/validate.js` stays pinned at `08de2bc3` for every executable construct in it** — *narrowed by erratum 3; the earlier wording said "`src/` stays pinned at `08de2bc3`", which claims a pin over files this WP never touched and over changes it cannot speak for*; only line numbers move. **`WP-ep2-prune-once-per-run-test` is re-pinned by `+2` in the same PR as this erratum**, across every `validate.js` cite below the block: `:1174 → :1176`, `:1178 → :1180`, `:1180 → :1182`, `:1192 → :1194`, `:1320 → :1322`, `:1322 → :1324`, `:1415 → :1417`, `:1418 → :1420`, `:1556-1558 → :1558-1560`. `:663` and every `dream.js`, `private-fs.js` and test-file cite are unaffected. **The sweep is the whole set, not the three the gate named** — a count that moved is wrong wherever any sentence states it |

### Mirrored Surface Checklist

**Every surface below mirrors Table N2R. All of them move in the SAME COMMIT as
the table's values — no commit may exist in which a registered mirror and
Table N2R disagree.** **Any further mirror found during review is registered in
`docs/specs/logbook/2026-09-18-ep2-successors-design-review.md`, in the same pass
that fixes it — NOT in Table M.** *Corrected by erratum 1: the earlier wording
said "added to Table M on the spot", which the Deliverables row for this file
forbids, since an implementer may change only its `status:`. `docs/specs/logbook/`
needs no Deliverables row (CLAUDE.md; `scripts/boundary-check.js` decides the
set), so the logbook is the one surface an implementation branch can always
write. The architect folds the registration back into Table M by erratum, which
is what this one does.*

**A. Mirrors inside this spec:**

- [ ] **Deliverables-table cells that restate a path or rule** — all four rows.
      Each names its path and defers to a Table M row for its permitted cells.
- [ ] **Acceptance criteria that assert its facts** — AC-1 … AC-11 below. Each
      cites an N2R id or a Table M row and asserts nothing those do not decide.
- [ ] **Verification commands / greps** — V-1 … V-9 below. Every literal string
      they grep for is a value from Table N2R or Table M.
- [ ] **Current-state description** — the "The code, as it is today" bullets. Every
      line number and every quoted construct there is an N2R value; if a re-pin
      moves one, both move.
- [ ] **Operative prose steps that apply it** — the Context section's account of
      what moved, and the "Exact contracts" old-spelling list.

**B. Mirrors outside this spec — Table M is the canonical register.** One
checkbox per row, by id; the facts stay in the table and are not restated here:

- [ ] M-1 · M-2 · M-3 · M-4 · M-5 · M-6 · M-7 · M-8 · M-9 (the content surfaces)
- [ ] M-10 · M-11 · M-12 · M-13 · M-14 (the five mirror lists, which are
      themselves mirrors)
- [ ] M-15 (the `src/` JSDoc) · M-16 (the cross-document ADR row)

#### Table M — canonical: every registered mirror, its locus, and its verdict

**Located by construct at `08de2bc3`.** `registered by` names which pre-existing
list already claimed the surface: **[N-inline]** = Table N's in-place enumeration
(`:1811-1813`); **[N-checklist]** = Table N's Mirrored Surface Checklist bullet
(`:2884-2891`); **[H-d]** = the *"(d) the per-run retention prune"* list
(`:2990-2992`); **[M48]** = M-48's own six-surface enumeration (`:4708`);
**[slug5]** = the routed-slug five-surface registration (`:2317-2327`).
**`—` means no list named it, and this WP registers it.**

| id | surface | locus (ep2 spec unless stated) | registered by | verdict |
|----|---------|-------------------------------|---------------|---------|
| **M-1** | **Table N row N2**, the canonical row | `:1760` | the table itself | **EDIT** — re-word the locus to N2R-3 and N2R-4; leave the rule (N2R-1) unchanged in meaning |
| **M-2** | **Table B row B10** | `:1572` | [M48], and the sentence at `:2353-2358` | **EDIT, TWO CLAUSES — it mirrors BOTH contracts.** *(i) the LOCUS clause*, *"it runs once per gate run after the loop over changed paths"*, which carries the stale locus (N2R-7); *(ii) the IDENTITY clause*, *"exactly what mutation M-48 does"*, re-keyed per **N2R-13(a)**. *Widened by erratum 1: bounding this row to (i) is what left a registered mirror contradicting its canonical row after N2R-9* |
| **M-3** | **Table B row B12** | `:1574` | [N-inline], [N-checklist], [H-d] | **CHECK, NO EDIT** — measured locus-free: *"N2 the trigger (once per run, only after a completed B4)"*. B12 is a pointer cell by design. Record the verdict in the PR body |
| **M-4** | **Table R consequence 7** | `:2181-2215`; anchor the literal `The retention contract is TABLE N's` | [N-inline], [N-checklist], [H-d], [M48], and `:2303`, `:3073` | **CHECK, NO EDIT** — measured: it opens *"and this consequence restates none of it"* and names no locus. Its two dated corrections stay (N2R-10) |
| **M-5** | **the B12/B13 growth story** | `:2488-2501`; anchor the literal `B12/B13 — the growth story` | [N-inline], [N-checklist] | **CHECK, NO EDIT** — measured: cites Table N rows N1/N3/N5 and D2 only; states no trigger locus |
| **M-6** | **the Security checklist's retention-prune bullet** | `:3663-3680` | [N-inline], [N-checklist], [H-d], [M48] | **EDIT, THREE CLAUSES.** *(i)* *"post-split M-48 moves the prune's CALL SITE and passes the accumulated set unchanged"* is falsified by N2R-9, which duplicates rather than moves — re-key it. *(ii)* *"only the per-call half now has a row"* is falsified by the same row — **N2R-13(c)**. *(iii)* the bullet's provenance date — **N2R-13(d)**, the four words `, and again on 2026-09-18`, without which the bullet dates a 2026-09-18 statement to 2026-07-28. **Nothing else in the bullet.** *Widened by erratum 1 from "one clause"* |
| **M-7** | **AC-14's third case** | `:4193-4259`; the routed slug at `:4240`, `:4246`, `:4247` | [N-inline], [N-checklist], [H-d], [M48], [slug5] | **EDIT, ROUTING ONLY** — N2R-11. The dated sentence at `:4229` describing the 2026-07-28 mutation as a move into the B4 loop **stays** (N2R-10) |
| **M-8** | **the AC-15 census row for M-48** | `:4504` | [M48], [slug5], and `:2303`, `:3073` | **EDIT, ROUTING PLUS ONE QUALIFIER.** N2R-11, twice on that line; **and N2R-13(e)** — the four words `as it was spelled at that date` on the dated mutation description, so the cell cannot be read as naming M-48's *current* mutation. **The limb cell stays `gap`** (N2R-8); the dated measurement stays (N2R-10). *The qualifier is added by erratum 1, matching what M-9's row already carries* |
| **M-9** | **mutation row M-48** | `:4708` | the row itself; [N-inline], [N-checklist], [H-d], [slug5] | **EDIT** — re-home the present-tense implementation description to N2R-3/N2R-4, re-key the mutation cell to N2R-9, apply N2R-11, and update this row's own six-surface enumeration to N2R-12 — **including N2R-12's naming rule, which binds THIS enumeration as well as M-10/M-11/M-12**: the surfaces the pass adds are named, never given as an ordinal. *Registered by erratum 2 because the implementer applied it here on their own initiative, replacing "The seventh was added" with the named form; a rule a spec relies on but does not state is not a contract.* Every dated measurement stays (N2R-10) |
| **M-10** | **Table N's in-place mirror enumeration** | `:1811-1813` | itself | **EDIT** — register N2R-12 |
| **M-11** | **Table N's Mirrored Surface Checklist bullet** | `:2884-2891` | itself | **EDIT** — register N2R-12. This is the bullet **V-30** mechanically enforces; see Implementation notes |
| **M-12** | **the *"(d) the per-run retention prune"* mirror list** | `:2990-2992` | itself — **NOT named by any draft of this WP** | **EDIT** — register N2R-12 |
| **M-13** | **the sentence registering B10 and consequence 7 as M-48 mirrors** | `:2353-2358` | itself — **NOT named by any draft of this WP** | **EDIT, TWO CLAUSES — N2R-13(b-i) and N2R-13(b-ii).** *Widened by erratum 1 from `CHECK, NO EDIT`. The earlier verdict cleared it because "it states no locus", which is true and beside the point: it asserts B10 "cites M-48 more accurately after the split" and that both surfaces were "left byte-unchanged", and N2R-9 plus N2R-13(a) falsify both. A verdict scoped to one contract cannot clear a cell that mirrors the other* |
| **M-14** | **the routed-slug five-surface registration** | `:2313-2327`; the slug at `:2317` and the spec path at `:2322` | itself — **NOT named by any draft of this WP** | **EDIT** — N2R-11 at both occurrences. Its enumeration of five surfaces is unchanged in membership; only the slug and the path move |
| **M-15** | **`pruneRedactedOriginals`'s JSDoc** | `src/core/dream/validate.js:1159-1173`; the stale sentence at `:1160-1161`, hard-wrapped mid-phrase | — **no list named it; this WP registers it** | **EDIT, COMMENT TEXT ONLY** — *"Runs ONCE per gate run, after the loop over changed paths"* carries the stale locus. Re-word to N2R-3/N2R-4. **No executable line changes** (V-6) |
| **M-16** | **ADR-0036 row A3** | `docs/adr/0036-mechanism-cell-schema-for-contract-tables.md:106` | [M48], bidirectionally (`:169-171` cites back) | **SPLIT VERDICT.** Its *divisibility* claim and its dated 2026-07-28 measurement survive the re-home unedited — the call site moved but is still a call site, the set is still merely passed in, and 2026-07-28 is still 2026-07-28. **Assert that, record the verdict.** Its **routed-WP slug** is stale; **owner item O-1, taken under the standing process on 2026-09-18, permits that one slug and nothing else** (N2R-11) |

## Dispatch precondition — owner items

**O-1 was TAKEN under the standing process on 2026-09-18** and recorded on `main`
in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`, under
*"Items dispatched under the standing process, 2026-09-18 (continued)"* (PR #283):
**the recommendation below was adopted** — grant, bounded to that one slug.
**Nothing in that record is the owner approving, accepting, ratifying or signing
the change**; it is a dispatch under the standing process, reversible by dated
amendment. **It is no longer a dispatch blocker**, and the item is kept below in
full because an adopted recommendation is only auditable beside the cost of
overruling it. *Recorded 2026-09-18 by erratum 1; this section previously said the
item had to be answered before dispatch.*

- **O-1 — may this WP change the routed-WP slug inside ADR-0036 row A3?**
  ADR-0036 is `Accepted (amends ADR-0031)`, **OWNER-SIGNED 2026-07-28**. Row A3
  (`:106`) ends with the parenthetical *"`WP-ep2-retention-prune-timing-test` is
  routed to close that gap"*. This WP re-routes that gap to
  `WP-ep2-prune-once-per-run-test` at all eight of the old slug's ep2-spec
  occurrences (**N2R-11(i)**; the resulting total is N2R-11(ii)'s ten), which
  leaves A3 naming a different WP from the row it cites bidirectionally.
  **Recommendation: grant it, bounded to that one slug.** Nothing the owner signed
  changes: the `OWNER-SIGNED` line is untouched, A3's clause, its forbidden set,
  its exemption and its dated measurement are byte-identical, and no signature is
  re-spent. **Overrule cost:** A3 keeps routing its reader to
  `docs/specs/WP-ep2-retention-prune-timing-test.md`, whose own banner reads
  `SUPERSEDED-PENDING — DO NOT DISPATCH`, while the document A3 cites routes
  elsewhere — a registered bidirectional mirror left in permanent disagreement,
  which is the exact failure ADR-0036's own mirror list exists to prevent. If
  overruled, drop the ADR row from Deliverables, mark **M-16** `CHECK, NO EDIT`,
  and record the standing disagreement in the PR body.

## Implementation notes & constraints

- **`model: opus` is deliberate.** This is docs-only in effect and small, but it
  edits sixteen registered surfaces across three documents, one of which is a
  6941-line `Done` spec guarded by four pinned digests and two mechanized gates,
  where the failure mode is a silently stale mirror rather than a red test. The
  judgment load is high and the code load is zero.
- **Never restate a value.** Every number, name and path you write comes from
  Table N2R or Table M. If you find yourself deriving one from the code instead,
  you have found a table gap — add the row, then use it.
- **The four pinned digests must not move.** V-11 counts the `OWNER-SIGNED` line;
  V-18 checksums the ratified threat model against the detector leg's copy; V-20
  checksums the split provenance including the `OWNER-APPROVED` block; V-33
  checksums the shared-check-contracts section against the sibling leg's copy.
  **None of the cells Table M marks `EDIT` is inside any of those four regions** —
  that is why the cell list is what it is. **V-8 recomputes all four anyway**, and
  its recipe is pinned rather than described.
- **V-30 and V-31 are mechanized gates that run over the ep2 spec.** V-30 is the
  Mirrored Surface Checklist registration step — it derives every canonical id in
  the document and fails if one is neither registered in the Checklist nor on the
  dated backlog, so **M-11 is not optional**. V-31 is the terminology sweep. Both
  must stay green; **V-7 pins their extraction command** rather than describing
  it. Do not re-implement either.
- **The ep2 spec's verification block sets `SPEC=docs/specs/WP-secret-fence-ep2-redact-arm.md`,
  which is no longer where that file lives.** V-7 and V-8 override `SPEC` to the
  `done/` path; that override is why they run at all. Do not "fix" the literal
  inside the `Done` spec — it is not in Table M.
- **Enumerate your own good.** Where you write a check over the ep2 spec's prose,
  state the sentences we intend to accept, not the ones we intend to forbid. A
  bare-word ban on `gap` or on `loop` would reject honest dated history — the
  earlier package in this family shipped exactly that defect and had to remove it.
  The one negative check this spec does carry (V-5's zero-count of the old slug)
  is closed because the slug is **our own** string in **one named file**, not a
  pattern over a grammar we do not own.
- **Do not re-run M-48's 2026-07-28 measurements** (N2R-10). They are dated and
  still true of their date.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

**N/A — this work package edits markdown and one JSDoc block.** It introduces no
identifier that flows into a filesystem path or a shell command, ships no
executable change, changes no validation, and touches no untrusted input. The one
shell exposure is the verification block's own greps over files in this
repository, whose inputs are literals from Table N2R and Table M.

## Acceptance criteria

- [ ] **AC-1 (N2R-1, N2R-8)** Table N rows **N1, N3, N4, N5, N6, N7** are
      **byte-identical** to `08de2bc3`, and row N2's *rule* — once per run, only
      after a completed redaction, never after a bare preserve — is unchanged in
      meaning. Verified by V-1.
- [ ] **AC-2 (N2R-3, N2R-4)** Table N row N2 names the real locus: the
      `pruneRedacted` closure and `src/cli/dream.js`'s single invocation. The
      phrase `after the loop over changed paths` no longer appears in it. (V-2)
- [ ] **AC-3 (N2R-7, N2R-10)** No cell Table M marks `EDIT` describes the present
      tense using `scanTokens`, `secretRedactions`, `the post-loop` or `after the
      loop over changed paths`. **Dated historical sentences are exempt and are
      expected to survive** — the check is per-cell and reviewed, never a
      whole-file ban.
- [ ] **AC-4 (N2R-9, N2R-10)** M-48's mutation cell states the re-keyed mutation
      over `src/cli/dream.js:1102`, **and** the row still carries its dated
      `EXECUTED 2026-07-28, AND REDDENED NOTHING AT THAT DATE` measurement. (V-3)
- [ ] **AC-5 (N2R-8)** The **AC-15 census limb cell for M-48 still equals `gap`.**
      This WP adds no detector, so a limb that moved is a false claim of coverage.
      Asserted as a cell equality, not a substring. (V-4)
- [ ] **AC-6 (N2R-11, N2R-13)** **Both counts hold, and they are two assertions,
      not one:** `WP-ep2-retention-prune-timing-test` occurs **zero** times in the
      ep2 spec (N2R-11(i) — every one of the eight old occurrences was re-routed),
      **and** `WP-ep2-prune-once-per-run-test` occurs **exactly ten** times
      (N2R-11(ii) — those eight plus N2R-13(a) and N2R-13(c)). (V-5) *Erratum 2
      replaced "exactly eight, across the seven lines N2R-11 names": the line list
      belongs to the OLD slug's occurrences and stopped describing the new one the
      moment N2R-13 added two mentions of its own.*
- [ ] **AC-7 (N2R-12, Table M)** **Every row of Table M is either edited or
      explicitly dispositioned in the PR body**, and **all five** mirror lists —
      M-10, M-11, M-12, M-13, M-14 — end the pass registering the union N2R-12
      names, each restricted to its own subject. Asserted **per surface**, never by
      a whole-file grep.
- [ ] **AC-8 (M-15, N2R-14)** The change to `src/core/dream/validate.js` is
      **comment text only**: every added and removed line of that file's diff lies
      inside **the JSDoc block immediately above `function
      pruneRedactedOriginals(`** and begins with a JSDoc continuation marker.
      (V-6) *Erratum 1 replaced a line range with the construct: this criterion
      said `:1159-1171` where Deliverables and M-15 said `:1159-1173`, and the
      block's own length changes under this WP (N2R-14), so a numeric range here
      is wrong before the work starts and wrong again after it. V-6 already
      locates the block by that construct.*
- [ ] **AC-9 (M-16, O-1)** `docs/adr/0036-…md`'s diff changes the **routed slug
      and nothing else** — O-1 was taken under the standing process, so this row
      is exercised rather than conditional. A3's divisibility claim, its dated
      measurement and the `OWNER-SIGNED` line are byte-identical, and the verdict
      is recorded in the PR body.
- [ ] **AC-10** The ep2 spec's **V-30** and **V-31** pass, its four pinned digests
      **V-11, V-18, V-20, V-33** are unmoved, and `npm test` and `npm run lint`
      pass. (V-7, V-8, V-9)
- [ ] **AC-11 Idempotence** `N/A — this WP ships no command and writes nothing
      outside the repository; it edits markdown and one comment block in place.`
- [ ] **AC-12 RED proofs** `N/A — this WP adds no test and no assertion, so there
      is nothing for an ADR-0042 declaration to redden.` The unfiltered
      `npm run red-proofs` is **not** a must-pass here; the successor package
      `WP-ep2-prune-once-per-run-test` owns that obligation. *Stated explicitly
      rather than omitted, so a reviewer does not read the absence as an oversight.*

## Verification steps (run these; paste output in the PR)

> **Both directions were observed while this spec was written, at `08de2bc3`.**
> V-7 and V-8 were run green on the untouched tree, and V-8 was run red against a
> deliberately perturbed threat-model heading (it printed `FAIL V-18:` with both
> digests). V-1 … V-6 and V-9 are run by the implementer on the post-work state;
> each one's red side is the untouched tree, where the edit has not been made.

```bash
set -euo pipefail
SPEC=docs/specs/done/WP-secret-fence-ep2-redact-arm.md
BASE=08de2bc335baa4a97bba2f33bca224f2f3a28517

# V-1  AC-1 — the six untouched Table N rows are byte-identical to $BASE.
#      Cell-level, not file-level: N2 is expected to differ and the others are not.
if git diff "$BASE" -- "$SPEC" | grep -qE '^[-+]\| \*\*N[13-7]\*\* \|'; then
  echo "FAIL V-1: a Table N row other than N2 moved."; exit 1; fi
echo "ok V-1: N1, N3-N7 unmoved"

# V-2  AC-2 — row N2 names the real locus and not the dead one.
n2=$(grep -n '^| \*\*N2\*\* |' "$SPEC" | head -1 | cut -d: -f1)
test -n "$n2" || { echo "FAIL V-2: Table N row N2 not found"; exit 1; }
row=$(sed -n "${n2}p" "$SPEC")
case "$row" in *'src/cli/dream.js'*) ;; *) echo "FAIL V-2: N2 does not name the timing authority"; exit 1;; esac
case "$row" in *'pruneRedacted'*)    ;; *) echo "FAIL V-2: N2 does not name the closure"; exit 1;; esac
case "$row" in *'after the loop over changed paths'*) echo "FAIL V-2: N2 still names the removed loop"; exit 1;; esac
echo "ok V-2: N2 re-homed"

# V-3  AC-4 — M-48 carries the re-keyed mutation AND the dated measurement.
mrow=$(grep -n '^| \*\*M-48\*\* |' "$SPEC" | tail -1 | cut -d: -f1)
test -n "$mrow" || { echo "FAIL V-3: no M-48 mutation row"; exit 1; }
row=$(sed -n "${mrow}p" "$SPEC")
case "$row" in *'src/cli/dream.js:1102'*) ;; *) echo "FAIL V-3: mutation not re-keyed"; exit 1;; esac
case "$row" in *'EXECUTED, 2026-07-28'*|*'Executed, 2026-07-28'*) ;; *) echo "FAIL V-3: the dated execution record was dropped or reworded"; exit 1;; esac
echo "ok V-3: M-48 re-keyed, measurement intact"

# V-4  AC-5 — the census limb is still 'gap'. CELL EQUALITY, case-folded.
crow=$(grep -n '^| \*\*M-48\*\* |' "$SPEC" | head -1 | cut -d: -f1)
limb=$(sed -n "${crow}p" "$SPEC" | awk -F'|' '{gsub(/[* ]/,"",$3); print tolower($3)}')
test "$limb" = "gap" || { echo "FAIL V-4: census limb is '$limb', want 'gap'"; exit 1; }
echo "ok V-4: census limb still gap"

# V-5  AC-6 — BOTH slug counts: the re-routing is complete and the total is the
#      contracted one. No other step in this block counts either slug — V-2 reads
#      Table N row N2, V-3 reads M-48's mutation cell, and neither greps a slug
#      (checked under erratum 2).
#      OCCURRENCES, not lines: line 4504 carries two, so `grep -c` reads 7 where
#      the contract says 8. EACH GREP IS GUARDED: a no-match grep exits 1, and
#      under `set -e` with `pipefail` that kills the step SILENTLY — the zero
#      count, which is the whole point of the first assertion, never reaches it.
old=$({ grep -o 'WP-ep2-retention-prune-timing-test' "$SPEC" || true; } | wc -l | tr -d ' ')
new=$({ grep -o 'WP-ep2-prune-once-per-run-test' "$SPEC" || true; } | wc -l | tr -d ' ')
#      TWO COUNTS, not one. N2R-11(i) is the re-routing (old -> 0); N2R-11(ii) is
#      the resulting total (new -> 10: the eight re-routings plus the slug inside
#      N2R-13(a)'s and N2R-13(c)'s mandated replacement literals). Erratum 2: a
#      single "new = 8" conflated the two and was falsified by erratum 1's own
#      literals, which a byte-exact application cannot avoid.
test "$old" = "0" || { echo "FAIL V-5: N2R-11(i) — the old slug still occurs $old time(s), want 0"; exit 1; }
test "$new" = "10" || { echo "FAIL V-5: N2R-11(ii) — the new slug occurs $new time(s), want 10 (8 re-routings + N2R-13(a) + N2R-13(c))"; exit 1; }
test -f docs/specs/WP-ep2-prune-once-per-run-test.md || { echo "FAIL V-5: the routed spec does not exist"; exit 1; }
echo "ok V-5: old slug at 0, new slug at 10, and the spec it names exists"

# V-6  AC-8 — the JSDoc was re-homed, and NOTHING BUT COMMENT TEXT changed.
#      Two halves, because the bound alone reads greenest when the work was never
#      done. WHITESPACE-FLATTENED: the stale phrase is hard-wrapped in the source
#      ("after the" / "loop over changed paths"), so a grep for the flat phrase
#      over raw lines cannot see it.
doc=$(awk '/^\/\*\*$/{buf=""} {buf=buf $0 "\n"} /^function pruneRedactedOriginals\(/{printf "%s", buf; exit}' \
      src/core/dream/validate.js | tr '\n' ' ' | tr -s ' ')
test -n "$doc" || { echo "FAIL V-6: pruneRedactedOriginals's JSDoc was not found"; exit 1; }
case "$doc" in *'src/cli/dream.js'*) ;; *) echo "FAIL V-6: the JSDoc does not name the timing authority"; exit 1;; esac
case "$doc" in *'after the loop over changed paths'*) echo "FAIL V-6: the JSDoc still names the removed loop"; exit 1;; esac
bad=$(git diff -U0 "$BASE" -- src/core/dream/validate.js \
      | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' \
      | grep -cvE '^[-+] \* ' || true)
test "$bad" = "0" || { echo "FAIL V-6: $bad non-comment line(s) changed in validate.js"; exit 1; }
echo "ok V-6: JSDoc re-homed, and the diff is comment text only"

# V-7  AC-10 — the Done spec's two mechanized gates, EXTRACTED, not re-implemented.
#      The verification block is the SECOND ```bash fence in that file; its own
#      SPEC literal still points at the pre-`done/` path, so it is overridden here.
awk '/^```bash$/{n++; if(n==2){inb=1; next}} inb && /^```$/{exit} inb' "$SPEC" > /tmp/ep2-block.sh
slice() { awk -v id="$1" 'index($0, "# " id " ")==1 {f=1} f && /^# V-[0-9]/ && index($0, "# " id " ")!=1 {exit} f' /tmp/ep2-block.sh; }
{ printf 'set -euo pipefail\nSPEC=%s\n' "$SPEC"; tail -n +"$(grep -n '^# V-30 ' /tmp/ep2-block.sh | cut -d: -f1)" /tmp/ep2-block.sh; } > /tmp/ep2-v30-v31.sh
bash /tmp/ep2-v30-v31.sh
echo "ok V-7: V-30 and V-31 green"

# V-8  AC-10 — the four pinned digests, recomputed from the Done spec's own steps.
{ printf 'set -euo pipefail\nSPEC=%s\nADR=docs/adr/0034-accidental-persistence-threat-model.md\n' "$SPEC"
  for id in V-18 V-33 V-20 V-11; do slice "$id"; echo; done; } > /tmp/ep2-digests.sh
bash /tmp/ep2-digests.sh
echo "ok V-8: V-11, V-18, V-20 and V-33 all unmoved"

# V-9  AC-10 — the suite and the linter.
npm test
npm run lint
```

## Out of scope (do NOT do these)

- **Do not edit `tests/`, and do not change an executable line of `src/`.** The
  behaviour is correct as shipped. Giving N2 a detector is
  `WP-ep2-prune-once-per-run-test`.
- **Do not edit ADR-0036 beyond the one slug owner item O-1's ruling permits**, and if the
  assertion in Table M row **M-16** fails — if A3's divisibility claim or its
  dated measurement turns out NOT to survive the re-home — **STOP and report**.
  An ADR amendment is its own change with its own signature path, not a cell in
  this WP's table.
- **Do not flip `docs/specs/WP-ep2-retention-prune-timing-test.md` to
  `Superseded`, do not move it to `docs/specs/done/`, and do not edit its
  `SUPERSEDED-PENDING` banner** — including the line that calls this package
  "docs-only", which Table M row **M-15** has since narrowed. That spec's
  Deliverables table here is authoritative; retiring the parked spec is the
  owner's call.
- **Do not update `docs/HANDOVER.md`.** Its line 51 restates this routing; the
  handover document is maintained in its own pass and is not a registered mirror
  of Table N (ADR-0029: views are generated, never hand-maintained inside a WP).
- **Do not re-run or re-record any other mutation row.** The AC-15 census marks
  the other rows `swept` with verdicts inherited from PR #122 and is explicit that
  this is not a claim they would redden today. Re-establishing them is a separate
  sweep and a separate WP.
- **Do not move M-48's census limb off `gap`** (AC-5). No detector lands here.

## Definition of done

**Dispatch precondition — the design gate is CLOSED.** Closed **2026-09-18 at
round 2**: round 1 (Astra, medium, adversarial) returned one band-B finding, fixed
on the same branch; round 2 (Astra) returned **approve, no findings**, having
executed the real prune helper against mocked entries to confirm the revised
counts and the zero-redaction guard. Raws: `6b9e515d` (round 1) and `5ced42cd`
(round 2), under `docs/specs/logbook/`; dispositions in
`docs/specs/logbook/2026-09-18-ep2-successors-design-review.md`. **This is a
REVIEW GATE, not owner approval**, and it grants nothing the owner has not been
asked for. **Owner item O-1 is separate and was taken under the standing process
on 2026-09-18** — see "Dispatch precondition — owner items"; the gate neither
granted nor could grant it.

1. All verification steps pass locally; output pasted into the PR body, including
   the V-7 and V-8 runs.
2. Conventional commits; PR titled `docs(specs): … (WP-ep2-n2-rehome)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
