---
id: WP-ep2-n2-rehome
title: Re-home Table N row N2 and its registered mirrors onto the real prune call site
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0005, ADR-0031]
epic: secret-lifecycle
---

> # ⚠️ BACKLOG ENTRY — NOT DISPATCHABLE
>
> **This draft has had no design round.** It was written on 2026-09-18 as the
> routing target of a staleness assessment
> (`docs/specs/logbook/2026-09-18-ep2-retention-prune-timing-test-stale.md`), not
> as a matured package. It is pinned to `main` at **`622ca04b`** and every cite
> below was re-derived construct by construct at that sha. Before it may be
> dispatched it needs the design gate (round zero plus an adversarial round,
> `docs/runbooks/codex-review.md`), a re-pin if `main` has moved, and an
> architect's `status: Ready`. Do not implement it as it stands.
>
> **Two open questions the design round must settle**, both recorded rather than
> silently decided — see "Open design questions" near the end.

# WP-ep2-n2-rehome: re-home N2 onto the call site that exists

## Context (read this, nothing else)

Wienerdog is an open-source "AI upgrade stack" that writes configuration files
into a user's Claude Code / Codex CLI setup. **IRON RULE (ADR-0004): Wienerdog is
just files.** No daemons, no servers, no telemetry. This work package edits
markdown only. It starts nothing, writes nothing to a user machine, adds no
dependency, and changes no behaviour.

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

**Pinned to `main` at `622ca04b`. Every cite below was located by finding the
construct, never by adding a delta to an older line number. Re-derive them before
you start — if the content has moved but is present, that is drift and you report
it; if the content is absent, stop and say so.**

### The code, as it is today

**`src/core/dream/validate.js`:**

- `pruneRedactedOriginals(stateDir, created)` — the helper, module-private,
  declared at **`:1174`**. It reads `<stateDir>/quarantine/redacted/`, returns
  immediately when the file count is at or below the cap, filters to
  date-prefixed regular files **not** in `created`, sorts by `(mtimeMs, name)`
  ascending, and deletes from the front until the count is back at the cap. Every
  failure is swallowed — *"best-effort: a failed prune never fails the arm"*.
  **Unchanged in substance since Table N was written.**
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
  old N2 prose calls `secretRedactions`; that name no longer exists.**
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

- `makeGates` is imported by **destructuring at require time**, `:33-38`.
- `const gates = makeGates({ stateDir: paths.state });` — **`:1060`**.
- **The one invocation, `:1100-1102`:**

  ```js
      // Retention, once per run and only after a completed redaction — the
      // point the gate's per-path loop used to be followed by.
      gates.pruneRedacted();
  ```

  It is unconditional, it sits after the `try`/`catch` around `promote()`, and it
  is the only call to `pruneRedacted` in `src/`. Confirmed by
  `grep -rn 'pruneRedacted' src/`, which returns three hits: the `@returns` JSDoc
  line, the closure's own declaration, and this call.

### The document, as it is today

All line numbers are in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`
(6941 lines) unless stated otherwise. **That spec is `Done`** — it may be edited
only at the cells this spec names, and four pinned digests guard regions you must
not enter.

| construct | line | what it says today that is now false or stale |
|---|---|---|
| **Table N**, heading | `:1748` | — |
| **Table N row N2** | `:1760` | *"after the loop over changed paths"* — no such loop |
| Table N rows N1, N3, N4, N5, N6, N7 | `:1759`, `:1761-1765` | **nothing stale; do not touch them** |
| **Table B row B10** | `:1572` | *"it runs once per gate run after the loop over changed paths, which is Table N row N2; reading it into this chain is a per-call prune, i.e. exactly what mutation M-48 does"* |
| **Table B row B12** | `:1574` | a pointer cell: *"N2 the trigger (once per run, only after a completed B4)"* — the summary is still true, but it is a mirror and must be checked |
| **Table N's own Mirrored Surface Checklist** | `:2884-2891` | registers Table B **B12**, Table R **consequence 7**, the **B12/B13 growth story**, **AC-14**, the **Security checklist** prune bullet, and mutation **M-48** |
| **the B12/B13 growth story** | `:1811-1812` | names its mirrors as B12, Table R consequence 7, AC-14, the Security checklist prune bullet |
| **AC-14** | `:4193` | its third case states what N2's absence means and names the routed WP |
| **Security checklist**, section | `:3633` | — |
| **Security checklist**, retention-prune bullet | `:3663-3682` | *"…the prune's CALL SITE and passes the accumulated set **unchanged**…"* |
| **AC-15 coverage census**, heading | `:4381` | — |
| **AC-15 census row for M-48** | `:4504` | limb cell is `gap`; body is dated `EXECUTED 2026-07-28` and routes to `WP-ep2-retention-prune-timing-test` |
| **mutation row M-48** | `:4708` | quotes the dead call site verbatim: *"the post-loop `if (secretRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);` under the comment "Retention, once per run""*, and states the mutation as *"move the call into the B4 loop"*. Carries its own six-mirror enumeration |
| `docs/adr/0036-…md` **row A3** | `:106` | cites M-48 as its worked example, bidirectionally |

### The two mirror lists do not agree, and reconciling them is part of this WP

M-48's own enumeration at `:4708` names **six** surfaces: (1) AC-14's third case,
(2) the AC-15 census row, (3) Table B row **B10**, (4) Table R consequence 7,
(5) the Security checklist's retention-prune bullet, (6) ADR-0036 row A3.

Table N's checklist at `:2884` names: Table B row **B12**, Table R consequence 7,
the B12/B13 growth story, AC-14, the Security checklist prune bullet, and M-48.

**B10 is in M-48's list and not in Table N's; B12 and the growth story are in
Table N's list and not in M-48's.** Both lists carry a meta-rule saying any
sentence that calls a surface a mirror moves in the same pass as the enumeration.
The union is what this WP must move, and the union is what both lists must end up
registering. **This is the register-new-mirrors move applied to a pair of lists
that each already missed what the other caught.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | **Only the cells enumerated in the Mirrored Surface Checklist below — the union of the two mirror lists, plus Table N row N2 itself, plus both mirror-list cells.** Every value written comes from **Table N2R**; restate nothing. **Touch nothing else in this file** — it is `Done`, and V-11/V-18/V-20/V-33 pin regions you must not enter |
| modify | docs/specs/WP-ep2-n2-rehome.md | **This spec file — the `status:` transition ONLY** (`Ready` → `In-Review`, per Definition of done item 4). No other line of this file may change. *Listed explicitly rather than relied on as a convention: `_TEMPLATE.md` carries the self-file exception in a comment above its Deliverables table, and a reader who never opens the template would otherwise have a Definition-of-done item the permission boundary forbids* |

**`src/` is NOT in this table, and neither is `tests/`.** The behaviour is correct
as shipped; only its description is stale. If you find yourself editing
`validate.js` or `dream.js`, stop — you are in the wrong package.

**`docs/adr/0036-mechanism-cell-schema-for-contract-tables.md` is NOT in this
table either, and that is a decision rather than an omission.** See Out of scope.

### Exact contracts

**Nothing executable changes.** The contract this WP ships is the wording of a
table row and the set of surfaces that must agree with it, both given in
Table N2R below.

**The old spelling, so you can find every instance of it.** These strings are what
the document says today and what must not survive this pass as a description of
the present:

```text
after the loop over changed paths
secretRedactions
the post-loop
the B4 loop
scanTokens
```

*Last two caveats, and they are load-bearing:* **`scanTokens` may legitimately
survive inside a DATED historical sentence** (M-48's 2026-07-28 measurement is
stated in the past and must stay true), and **`the B4 loop` may survive wherever
it names the loop `promote()` runs rather than one inside the gate** — check each
hit rather than replacing blind.

## Contract reference

**The ADR-0031 activation trigger fires — two of seven conditions are true**, so
this WP carries a canonical table and a Mirrored Surface Checklist:

- **(v) the task crosses an authority boundary.** `makeGates()` records the run
  state (`redactedCreated`, `completedRedactions`) and decides the *precondition*;
  `src/cli/dream.js` owns the *timing* by choosing when to invoke the closure. One
  component records, another decides the lifecycle. **This boundary is the whole
  content of the change** — it did not exist when N2 was written.
- **(vii) the same contract must appear in multiple mirrored surfaces.** The union
  of the two registered mirror lists is eight surfaces inside one `Done` document,
  and each of those lists is itself a mirror that must move with the row.

*(Condition (vi) arguably fires too — `WP-ep2-prune-once-per-run-test` is a
successor spec that inherits this contract. Two is already enough; it is noted so
a reviewer does not have to re-derive it.)*

### Contract table(s)

#### Table N2R — canonical: where N2's trigger lives after the gate extraction

**This table is the single place these facts are decided. Every cell in the
Deliverables row above, every acceptance criterion, every verification grep and
every sentence of operative prose in this spec defers to it and restates
nothing.** Values were measured at `622ca04b`.

| id | fact | value |
|----|------|-------|
| **N2R-1** | **what the rule is** | **unchanged from Table N row N2's present rule:** the prune runs **once per run**, and **only if at least one redaction completed**. A run that completed no redaction does not prune; a bare preserve never prunes. **This WP changes no rule and no acceptance behaviour** |
| **N2R-2** | **who holds the run state** | `makeGates()` in `src/core/dream/validate.js` (`:1316`). Two closure-scoped values: `redactedCreated` (`:1320`), the set of basenames this run wrote into `redacted/`, and `completedRedactions` (`:1322`), incremented at `:1418` **last**, only after a verified scrub |
| **N2R-3** | **who holds the precondition** | the `pruneRedacted` closure, `validate.js:1556-1558`: `if (completedRedactions > 0) pruneRedactedOriginals(stateDir, redactedCreated);`. It is a member of the object `makeGates` returns, declared in its `@returns` at `:1314` |
| **N2R-4** | **who decides WHEN — the timing authority** | `src/cli/dream.js:1102`, `gates.pruneRedacted();` — unconditional, after the `try`/`catch` around `promote()` returns. **This is the authority boundary: the gate cannot prune itself, and the pipeline cannot see the counter** |
| **N2R-5** | **the cardinality** | **exactly one** reachable `gates.pruneRedacted()` call per run. It is the only call in `src/` (three `pruneRedacted` hits total: the `@returns` JSDoc, the declaration, the call) |
| **N2R-6** | **the counter's name** | **`completedRedactions`.** `secretRedactions` does not exist in `src/`; it survives only as a fixture-facing field name in `tests/unit/dream-validate.test.js` |
| **N2R-7** | **the construct N2's old wording named** | the per-path loop `for (let i = 0; i < scanTokens.length; i++)` — **removed** by `WP-dream-promote-in-workspace` (`4115668a`). `scanTokens` occurs zero times in `src/` and `tests/`. The gate also no longer spawns per-path git (`WP-dream-gate-inputs-baseline-delta`) |
| **N2R-8** | **what did NOT change** | Table N rows **N1, N3, N4, N5, N6, N7**; the body of `pruneRedactedOriginals` (`:1174`); every acceptance behaviour of the retention prune. **A pass that edits any of these has exceeded this WP** |
| **N2R-9** | **the re-keyed M-48 mutation** | *move or duplicate `gates.pruneRedacted();` at `src/cli/dream.js:1102` into a position that makes it run more than once per run, or before `promote()` returns* — replacing *"move the call from its post-loop site into the B4 loop"*. **The accumulated set stays unchanged, so it remains an N2-only mutation that preserves N3** |
| **N2R-10** | **M-48's dated measurement** | **stays exactly as written and is not re-run.** *"EXECUTED 2026-07-28, AND REDDENED NOTHING AT THAT DATE"* is a claim about a day, and it is still true of that day. **Do not restate it in the present tense and do not delete it** — its dated form is what lets this WP edit the row without re-establishing the measurement |

### Mirrored Surface Checklist

**Every surface below mirrors Table N2R. All of them move in the SAME COMMIT as
the table's values — no commit may exist in which a registered mirror and
Table N2R disagree.** Any further mirror found during review is added to this
list on the spot, in the same pass that fixes it.

**A. Mirrors inside this spec:**

- [ ] **Deliverables-table cells that restate a path or rule** — the single
      `modify` row for the ep2 spec, which names the permitted cells by deferring
      to this checklist rather than by listing them again.
- [ ] **Acceptance criteria that assert its facts** — AC-1 … AC-8 below. Each
      cites an N2R id and asserts nothing this table does not decide.
- [ ] **Verification commands / greps** — V-1 … V-6 below. Every literal string
      they grep for is a value from Table N2R.
- [ ] **Current-state description** — the "The code, as it is today" bullets and
      "The document, as it is today" table. Every line number and every quoted
      construct there is an N2R value; if a re-pin moves one, both move.
- [ ] **Operative prose steps that apply it** — the Context section's account of
      what moved, and "The two mirror lists do not agree".

**B. Mirrors inside `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — the
UNION of the two registered lists, which is what this WP must move. Each is a
Deliverables-permitted cell.**

- [ ] **Table N row N2** (`:1760`) — the canonical row itself. Re-word the locus
      to N2R-3 and N2R-4; **leave the rule (N2R-1) byte-identical in meaning**.
- [ ] **Table B row B10** (`:1572`) — in M-48's list, not in Table N's. Its
      *"runs once per gate run after the loop over changed paths"* clause and its
      *"reading it into this chain is a per-call prune, i.e. exactly what mutation
      M-48 does"* clause both carry the stale locus.
- [ ] **Table B row B12** (`:1574`) — in Table N's list, not in M-48's. A pointer
      cell; verify its one-line summary of N2 still holds under N2R-1 and leave it
      alone if it does. **Record the verdict either way.**
- [ ] **Table R consequence 7** — in both lists. Names the per-call prune as a
      design a falsified arithmetic claim once argued for.
- [ ] **the B12/B13 growth story** (`:1811-1812`) — in Table N's list only. Its
      own mirror sentence names four surfaces and must be reconciled.
- [ ] **AC-14's third case** (AC-14 at `:4193`) — in both lists. States what N2's
      absence means and names the routed WP; the routing target is now
      `WP-ep2-prune-once-per-run-test`.
- [ ] **the Security checklist's retention-prune bullet** (`:3663-3682`) — in both
      lists. Its *"the prune's CALL SITE"* clause is the stale one.
- [ ] **the AC-15 census row for M-48** (`:4504`) — in both lists. **Its limb cell
      stays `gap`** (N2R-8: no detector is added by this WP), and its routing
      target moves to `WP-ep2-prune-once-per-run-test`.
- [ ] **mutation row M-48** (`:4708`) — the row itself. Re-key the mutation to
      N2R-9, keep the dated measurement per N2R-10, and **update its own six-mirror
      enumeration to the union**.
- [ ] **Table N's Mirrored Surface Checklist** (`:2884-2891`) — a mirror list is
      itself a mirror. Update it to the same union.

**C. The cross-document mirror, checked and dispositioned rather than moved:**

- [ ] **ADR-0036 row A3**
      (`docs/adr/0036-mechanism-cell-schema-for-contract-tables.md:106`) — cites
      M-48 bidirectionally. **Checked, not edited** (see Out of scope): its claim
      is that M-48 was *divisible*, stated in the dated past, and divisibility is
      locus-independent. **Assert it, record the verdict in the PR, and if the
      check fails, STOP and report rather than editing an ADR from a spec PR.**

## Implementation notes & constraints

- **`model: opus` is deliberate.** This is docs-only and small, but it edits ten
  cells of a 6941-line `Done` document guarded by four pinned digests and two
  mechanized gates (V-30, V-31), where the failure mode is a silently stale mirror
  rather than a red test. The judgment load is high and the code load is zero.
- **Never restate a value.** Every number, name and path you write into the ep2
  spec comes from Table N2R. If you find yourself deriving one from the code
  instead, you have found a table gap — add the row, then use it.
- **The four pinned digests must not move.** V-11 (`:5981`) counts the
  `OWNER-SIGNED` line; V-18 (`:5639`) checksums the ratified threat model against
  the detector leg's copy; V-20 (`:5703`) checksums the split provenance including
  the `OWNER-APPROVED` block; V-33 (`:5664`) checksums the shared-check-contracts
  section against the sibling leg's copy. **None of the cells this WP edits is
  inside any of those four regions** — that is the reason the cell list is what it
  is. Recompute all four anyway and paste the output.
- **V-30 and V-31 are mechanized gates that run over this file.** V-30 (`:6212`)
  is the Mirrored Surface Checklist registration step; V-31 (`:6635`) is the
  terminology sweep. Both must stay green. Extract and run them from the ep2
  spec's own Verification steps; do not re-implement them.
- **Enumerate your own good.** Where you write a check over the ep2 spec's prose,
  state the sentences we intend to accept, not the ones we intend to forbid. A
  bare-word ban on `gap` or on `loop` would reject honest dated history — the
  earlier package in this family shipped exactly that defect and had to remove it.
- **Do not re-run M-48's 2026-07-28 measurement** (N2R-10). It is dated and it is
  still true of its date.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

**N/A — this work package edits markdown only.** It introduces no identifier that
flows into a filesystem path or a shell command, ships no code, changes no
validation, and touches no untrusted input. The one shell exposure is the
verification block's own greps over files in this repository, whose inputs are
literals from Table N2R.

## Acceptance criteria

- [ ] **AC-1 (N2R-1, N2R-8)** Table N rows **N1, N3, N4, N5, N6, N7** are
      **byte-identical** to `622ca04b`, and row N2's *rule* — once per run, only
      after a completed redaction, never after a bare preserve — is unchanged in
      meaning. Verified by diff and by V-1.
- [ ] **AC-2 (N2R-3, N2R-4)** Table N row N2 names the real locus: the
      `pruneRedacted` closure and `src/cli/dream.js`'s single invocation. The
      phrase `after the loop over changed paths` no longer appears in it.
- [ ] **AC-3 (N2R-7)** No cell this WP edits describes the present tense using
      `scanTokens`, `secretRedactions`, `the post-loop` or `after the loop over
      changed paths`. **Dated historical sentences are exempt and are expected to
      survive** — the check is per-cell and reviewed, never a whole-file ban.
- [ ] **AC-4 (N2R-9, N2R-10)** M-48's mutation cell states the re-keyed mutation
      over `src/cli/dream.js:1102`, **and** still carries its dated
      `EXECUTED 2026-07-28` measurement verbatim.
- [ ] **AC-5 (N2R-8)** The **AC-15 census limb cell for M-48 still equals `gap`.**
      This WP adds no detector, so a limb that moved is a false claim of coverage.
      Asserted as a cell equality, not a substring.
- [ ] **AC-6** **Every surface in section B of the Mirrored Surface Checklist is
      either edited or explicitly dispositioned in the PR body**, and **both**
      mirror lists — M-48's enumeration and Table N's checklist — end the pass
      registering the same union. Extracted and asserted **per surface**, never by
      a whole-file grep: the routed slug already occurs in several cells, so
      counting it proves nothing.
- [ ] **AC-7** The routing target in AC-14's third case and in the AC-15 census row
      is `WP-ep2-prune-once-per-run-test`.
- [ ] **AC-8 (Checklist C)** ADR-0036 row A3 is **unedited** and its claim is
      asserted still true; the verdict is recorded in the PR body.
- [ ] **AC-9** `npm run lint` passes. The ep2 spec's own **V-30** and **V-31**
      pass, and its four pinned digests **V-11, V-18, V-20, V-33** are unmoved.
- [ ] **AC-10 Idempotence** `N/A — this WP ships no command and writes nothing
      outside the repository; it edits markdown in place.`
- [ ] **AC-11 RED proofs** `N/A — this WP adds no test and no assertion, so there
      is nothing for an ADR-0042 declaration to redden.` The unfiltered
      `npm run red-proofs` is **not** a must-pass here; the successor package
      `WP-ep2-prune-once-per-run-test` owns that obligation. *Stated explicitly
      rather than omitted, so a reviewer does not read the absence as an oversight.*

## Verification steps (run these; paste output in the PR)

> **Design-round note.** These steps are sketched at the right shape but have
> **not** been executed, and no negative control has been run on any of them. The
> design round must run each one both directions — green on the intended
> post-work state, red on the untouched tree — before this spec may go `Ready`.
> A step that has only ever been read is not a check.

```bash
set -euo pipefail
SPEC=docs/specs/done/WP-secret-fence-ep2-redact-arm.md

# V-1  AC-1 — the six untouched Table N rows are byte-identical to 622ca04b.
#      Cell-level, not file-level: N2 is expected to differ and the others are not.
git diff 622ca04b -- "$SPEC" | grep -E '^[-+]\| \*\*N[13-7]\*\*' && {
  echo "FAIL V-1: a Table N row other than N2 moved."; exit 1; }
echo "ok V-1: N1, N3-N7 unmoved"

# V-2  AC-2 — row N2 names the real locus and not the dead one.
n2=$(grep -n '^| \*\*N2\*\* |' "$SPEC" | head -1 | cut -d: -f1)
test -n "$n2" || { echo "FAIL V-2: Table N row N2 not found"; exit 1; }
sed -n "${n2}p" "$SPEC" > /tmp/n2-row.txt
grep -qF 'src/cli/dream.js' /tmp/n2-row.txt || { echo "FAIL V-2: N2 does not name the timing authority"; exit 1; }
grep -qF 'pruneRedacted' /tmp/n2-row.txt    || { echo "FAIL V-2: N2 does not name the closure"; exit 1; }
if grep -qF 'after the loop over changed paths' /tmp/n2-row.txt; then
  echo "FAIL V-2: N2 still names the removed loop"; exit 1; fi
echo "ok V-2: N2 re-homed"

# V-3  AC-4/AC-10 — M-48 carries the re-keyed mutation AND the dated measurement.
mrow=$(grep -n '^| \*\*M-48\*\* |' "$SPEC" | tail -1 | cut -d: -f1)
test -n "$mrow" || { echo "FAIL V-3: no M-48 mutation row"; exit 1; }
sed -n "${mrow}p" "$SPEC" > /tmp/m48-mut.txt
grep -qF 'src/cli/dream.js' /tmp/m48-mut.txt || { echo "FAIL V-3: mutation not re-keyed"; exit 1; }
grep -qF 'EXECUTED 2026-07-28, AND REDDENED NOTHING AT THAT DATE' /tmp/m48-mut.txt || {
  echo "FAIL V-3: the dated measurement was dropped or reworded"; exit 1; }
echo "ok V-3: M-48 re-keyed, measurement intact"

# V-4  AC-5 — the census limb is still 'gap'. CELL EQUALITY, case-folded.
crow=$(grep -n '^| \*\*M-48\*\* |' "$SPEC" | head -1 | cut -d: -f1)
limb=$(sed -n "${crow}p" "$SPEC" | awk -F'|' '{gsub(/[* ]/,"",$3); print tolower($3)}')
test "$limb" = "gap" || { echo "FAIL V-4: census limb is '$limb', want 'gap'"; exit 1; }
echo "ok V-4: census limb still gap"

# V-5  AC-8 — ADR-0036 is untouched by this PR.
git diff --name-only 622ca04b | grep -qx 'docs/adr/0036-mechanism-cell-schema-for-contract-tables.md' && {
  echo "FAIL V-5: this PR edited ADR-0036, which is out of scope."; exit 1; }
echo "ok V-5: ADR-0036 unedited"

# V-6  AC-9 — the Done spec's own gates and digests.
#      Extract and run V-30 and V-31 from "$SPEC"'s Verification steps, and
#      recompute V-11, V-18, V-20 and V-33. None may move. THE EXTRACTION
#      COMMAND MUST BE PINNED HERE by the design round rather than described.

npm run lint
```

## Out of scope (do NOT do these)

- **Do not edit `src/` or `tests/`.** The behaviour is correct as shipped and no
  test changes here. Giving N2 a detector is `WP-ep2-prune-once-per-run-test`.
- **Do not edit
  `docs/adr/0036-mechanism-cell-schema-for-contract-tables.md`.** A3's worked
  example claims M-48 was **divisible** — that the prune's timing is a call site
  while the exclusion is a run-scoped set merely passed in — and states its
  measurement in the dated past. **Both halves survive the re-home:** the call
  site moved, but it is still a call site, the set is still merely passed in, and
  2026-07-28 is still 2026-07-28. A3 itself says dating the claim is what keeps an
  implementation spec from having to edit an ADR. **Assert it (AC-8); if the
  assertion fails, STOP and report** — an ADR amendment is its own change with its
  own signature path, not a cell in this WP's table.
- **Do not flip `docs/specs/WP-ep2-retention-prune-timing-test.md` to
  `Superseded`, and do not move it to `docs/specs/done/`.** It is parked with a
  `SUPERSEDED-PENDING` banner; retiring it is the owner's call.
- **Do not re-run or re-record any other mutation row.** The AC-15 census marks
  the other rows `swept` with verdicts inherited from PR #122 and is explicit that
  this is not a claim they would redden today. Re-establishing them is a separate
  sweep and a separate WP.
- **Do not move M-48's census limb off `gap`** (AC-5). No detector lands here.

## Open design questions

**Both must be settled by the design round. Neither is left for an implementer to
decide silently.**

1. **Does Table B row B12 (`:1574`) need an edit at all?** Its summary — *"N2 the
   trigger (once per run, only after a completed B4)"* — is locus-free and
   therefore arguably still correct, and B12's whole design is to be a pointer
   that cannot drift. The checklist currently says "verify and leave it alone if it
   holds"; a reviewer may reasonably want the edit forced instead, so that B12's
   `completed B4` wording is re-keyed to `completedRedactions`. **Decide and pin
   it in the checklist.**
2. **How is Table R consequence 7 located?** It is named in both mirror lists but
   has no stable anchor string this spec could pin at `622ca04b` — the
   enumeration's items are not individually greppable. Current state cites it by
   name only, which is exactly the "reference without an inline locator" defect the
   One-Document Rule exists to stop. **The design round must pin its line range,
   or pin a literal anchor substring, before dispatch.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   the four recomputed digests and the V-30 / V-31 runs.
2. Conventional commits; PR titled `docs(specs): … (WP-ep2-n2-rehome)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
