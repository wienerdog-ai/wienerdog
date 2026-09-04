---
id: WP-quarantine-banner-location
title: Stop the ledger-derived banners naming a quarantine shelf they cannot observe
status: Draft
model: sonnet
size: M
depends_on: [WP-preservation-abort-widening]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-banner-location: Stop the ledger-derived banners naming a quarantine shelf they cannot observe

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Dispatch precondition (one owner confirmation; changes no Deliverables row)

**The question is a product-text question, and it is the only one.** Four
user-facing surfaces today end a sentence with *the withheld copies are in
`state/quarantine/`*, and one of them adds a disposal instruction — *restore
what you meant to keep and delete the rest of the files there (not the
`redacted/` folder inside it)*. Table L replaces all four with **one** code-owned
sentence that names no folder and issues no disposal instruction, and points at
the surface that does name each copy's folder (the dream report). **Confirm that
the ledger-derived surfaces stop naming a folder and stop instructing a delete,
or say they should keep an instruction of some other wording.**

**Recommendation: confirm.** The claim those four surfaces make is measurably
false on a shipped, tested arm — Current state drives it — and it is false in the
one direction that costs the user their bytes: the sentence sends them to
`state/quarantine/`, where the copy is not, while the copy sits in
`state/quarantine/redacted/`, a folder `docs/GLOSSARY.md` calls *disposable* and
`pruneRedactedOriginals` evicts from once it holds more than fifty. Keeping a
folder name that is right most of the time and wrong exactly when it matters is
worse than pointing at the one surface that is right every time. **Nothing about
the digest's own pending-review banner changes** — that banner reads the folder
it names, so its sentence and its parenthetical stay exactly as they are (Table L
row **L5**).

**The second owner item, raised by both round-1 review channels and parked
here rather than absorbed.** Row **L5** — the digest's pending-review banner,
which this package does not change — closes with *"this notice clears when no
withheld copies are left."* **That sentence is false in one measured state:**
`listSecretQuarantine` lists direct file entries of `state/quarantine/` only, so
in a mixed state — one ordinary withheld copy on that shelf, one fall-through
only-copy under `redacted/` — deleting the direct file clears the notice while a
withheld copy is still there. The parenthetical is unaffected and stays correct.

**Recommendation: route the wording to the successor, not to this package — and
the reason is that the wording is DOWNSTREAM of a decision nobody has made.**
If `WP-quarantine-only-copy-shelf` (Out of scope) decides a fall-through
only-copy is moved to the withheld shelf, or recorded durably and listed, then
`listSecretQuarantine` sees it and the shipped sentence becomes true again — and
a narrowing landed now would have to be reverted. Only the "leave it where it
is, unannounced" branch makes the narrowing permanent. **The cost of overruling
this is small and is stated so the owner can:** scoping the clause to what the
banner observed — *clears when none of the copies listed here are left* — is one
more Table L row, `src/core/digest.js` entering the boundary, and one updated
full-string pin in `tests/unit/digest.test.js`, which is already a Deliverables
row for its comment. Nothing else moves.

**Do not dispatch until BOTH are answered.** A "keep an instruction" answer to
the first changes Table L rows **L1**–**L4** and the byte-exact sentence under
Implementation notes; an "absorb it" answer to the second adds the row and the
two files named above. Neither changes any other path in the Deliverables
table.

**One disclosure that is not a question.** The dream report tells the user to
*delete that copy* for every preserved copy on a refused path, including the
copy this work package proves can be the note's only one. That value is
**owner-ruled** (`WP-dream-promote-module` Table Q row Q9, 2026-08-29), so this
package neither changes it nor calls it a defect; what it does is record the
tension with the banner that says *restore what you meant to keep* about the
same file. See Out of scope, where it is quoted and routed.

## Context (read this, nothing else)

The nightly **dream** consolidates recent sessions into the user's **vault**. It
does not let the model write into the vault: the run clones the vault into a
throwaway **workspace**, the model writes there, and only content that passes
four gates is promoted into the real vault. **ADR-0004: Wienerdog is just
files** — nothing here starts a process that outlives its call, and this work
package adds none. **No statement in this package computes anything new**: it
changes what four sentences say, where their text is decided, and — row **L7**,
one relocated block — WHEN one already-existing `console.log` runs relative to
the durable writes that make a claim about it.

One of the four gates is the **EP2 secret gate** (ADR-0034). On a refusing
verdict it **preserves** first — it copies the exact bytes it is judging into
the core's quarantine tree before refusing — because under promotion those bytes
were never in the vault and the workspace is destroyed minutes later, so the
preserved copy is the user's only route back to them. The gate writes to **two
shelves**, and `docs/GLOSSARY.md`'s *secret quarantine* entry states what each is
for:

> `state/quarantine/` holds a **withheld** note — one the gate would not commit
> at all — kept for as long as the owner leaves it there, and announced by a
> digest banner. `state/quarantine/redacted/` holds the pre-scrub original of a
> note **whose added lines the gate rewrote**: no banner, a bounded number of the
> most recent copies, and disposable

Both shelves live under the **core**, `$WIENERDOG_HOME || ~/.wienerdog`
(`src/core/paths.js`, `getPaths`), never in the vault.

**Which shelf a given copy is on is decided in exactly one place: the
preservation record — and that is not a new rule, it is a shipped one.** Every
refusing or redacting verdict carries a `preserved` array whose entries are
`{artifact, location, remediation}`, `location` being the state-relative folder
the gate actually wrote to. `docs/specs/done/WP-dream-promote-module.md`'s
**Table Q row Q9** is that record's canonical source and already states the rule
this package enforces:

> `location` — **FILLED BY THE EP2 GATE, AT GATE TIME.** The state-relative
> DIRECTORY that copy sits in […] composed with `artifact` it is the path the
> user needs […] **Every surface DOWNSTREAM of `promote()`'s return READS a
> field off an entry; none re-derives one, and none adds a carrier beside it.**

The same spec's **Table Q row Q3** says what is at stake when a surface gets it
wrong — *"For a copy on the REDACTED shelf, the report line is the user's ONLY
route back to it […] Losing the line loses the copy in practice, which is why
this is a data-loss row and not a reporting nicety."*

`src/core/dream/promote.js` restates the first rule in the comment above the
refusal it composes — *"`state/quarantine/` announces nothing on its own (row
Q3). […] The record is the ONLY carrier."* — and its report renderer obeys it:
`copyClause` composes `` unredacted copy at state/<location>/<artifact> `` from
the entry's own fields.

**Two different canonical tables in this family are both called Table Q, and
their row numbers collide.** Throughout this spec each is named with its owning
spec, never by row id alone: `WP-dream-promote-module`'s Table Q owns the
preservation record (rows Q3, Q7, Q9 above);
`WP-secret-fence-ep2-redact-arm`'s Table Q owns the surfaces that name the
folder (rows Q1, Q2, Q9, amended below).

**Four other surfaces do not obey that rule.** They are driven by the per-file
**transcript ledger** (`src/core/dream/ledger.js`) or by three integers, neither of which
observes a preserved copy at all, and each of them states the shelf as a
code-owned literal. On the shipped redact-arm fall-through that literal is
wrong. (A sixth surface, the digest's pending-review banner, states the shelf
too — but it gets its list by READING that folder, so its claim is true for
everything it announces and it is untouched here. Table L row **L5**.)
Bringing those four into line with the record — by having them state the
class and point, rather than restate a fact they cannot see — is this work
package. **It is not a new product decision and not a new rule**: it is
`WP-dream-promote-module` Table Q row Q9's own *none re-derives one, and none
adds a carrier beside it*, enforced on four surfaces that were never brought
under it, which is ADR-0031's single-source discipline applied to the one
contract in this family that was left scattered.

## Current state

Every claim below was measured in this tree at `8302ce8e` on 2026-09-05
(`origin/main` after PRs #215/#216). `git diff --stat 8302ce8e HEAD -- src tests
scripts` is empty on the branch that carries this spec, so no measurement here
is owed a re-run for the base.

**Baselines.** `npm test` → `tests 2618 / pass 2606 / fail 0 / skipped 12`,
exit 0. `npm run lint` → `Linting: 635 file(s)`, `0 error(s)`,
`frontmatter check passed: 267 spec(s), 4 agent(s)`, exit 0. `npm run
red-proofs` on a pristine `git archive` copy → `5 declared proof(s), 5
selected`, four `PROVEN` criteria roll-ups, `RUN: PROVEN`, exit 0.

**The census, mechanically.** `grep -rn 'state/quarantine' src/` returns
**thirteen** hits in seven files. **Eight** are JSDoc or code comments
(`src/core/private-fs.js` ×2, `src/core/dream/promote.js` ×2,
`src/core/dream/validate.js` ×4). The **five that reach a user** are:

| Carrier (construct) | The literal it emits | Driven by |
|---|---|---|
| `ledger.js` `quarantineBannerLine`, the `secret-revert-exhausted` sentence | `The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest of the files there (not the redacted/ folder inside it).` | the transcript ledger |
| `ledger.js` `secretRevertSummaryLine`, its closing sentence | `The withheld notes are in state/quarantine/.` | three integers |
| `warnings.js` `SECRET_EXHAUSTED_REMEDIATION` | byte-identical to the first, retyped; its comment claims identity with *"the digest banner"*, which is the wrong surface — the identity is with the first row, not with `digest.js`'s | the transcript ledger |
| `doctor.js` `quarantineReport`, the `secret-revert-exhausted` row | `… too many times in a row. The withheld copies are in state/quarantine/.` | the transcript ledger |
| `digest.js` `secretQuarantineWarn` | `Review the copies in state/quarantine/: restore …` | `listSecretQuarantine`, a **directory listing** of `state/quarantine/` |

The fifth is different in kind and stays: it reads the folder it names.

**The claim the first four make is false on a shipped, tested arm.** Driven
directly against `makeGates({stateDir}).secret(…)` with a soft (redact-severity)
finding, a preservation write into `quarantine/` made to fail while
`quarantine/redacted/` stays writable, and `addedLineNumbers` naming a line the
note does not have — so the gate's own scan still sees the finding while
`scrubAddedLines`'s bounds check refuses, which is the redact-arm fall-through:

```text
THREW = null
VERDICT = { "refuse": true,
            "reason": "content matched a secret pattern (high-entropy); not promoted",
            "preserved": [ { "artifact": "2026-09-05-fp.md",
                             "location": "quarantine/redacted" } ] }
quarantine/          listing = ["redacted"]
quarantine/redacted/ listing = ["2026-09-05-fp.md"]
listSecretQuarantine(stateDir) = []
```

A `{refuse:true}` verdict, a non-empty record, no abort — and the note's only
copy is on the **other** shelf. `promote()` then increments
`secretDisposition.withheld`, `src/cli/dream.js` prints:

```text
wienerdog: dream — the secret check withheld 1 note(s); 1 session transcript(s) will be
retried on the next run and 0 were skipped after too many withheld runs in a row. The
withheld notes are in state/quarantine/.
```

and once that transcript's deferrals are spent the durable banner adds:

```text
> [!warning] Wienerdog: 1 session transcript(s) are no longer being dreamed over — the
notes made from them were withheld by the secret check too many times in a row:
sess-a.jsonl. The withheld copies are in state/quarantine/: restore what you meant to
keep and delete the rest of the files there (not the redacted/ folder inside it). The
session files themselves are untouched.
```

**This is not a state the fixture invented.** It is asserted, in both variants,
by a shipped test — `dream-validate: EP2 redact arm R0b (tracked)` and
`(untracked)`, *a durable copy EXISTS, so the run is recoverable and does NOT
abort*, whose final assertions are that the note is **not** promoted and that
`res.preservedFor(rel)` carries an entry with `location === 'quarantine/redacted'`.
`WP-preservation-abort-widening` Table P row **P3** states the same conclusion as
a contract: a surviving `redacted/` copy always recovers, so the run refuses the
note and reports that copy on the record rather than aborting.

**And the shelf it lands on is the disposable one.**
`pruneRedactedOriginals` keeps `state/quarantine/redacted/` to
`REDACTED_RETENTION_CAP = 50` entries, evicting oldest-first by `(mtimeMs, name)`
and excluding only basenames **this run** created — so a copy left there by an
earlier run's fall-through is an eligible candidate. `state/quarantine/` itself
is unbounded (`validate.js`, the `REDACTED_RETENTION_CAP` doc comment).

**The banner also has no way to announce it.** `listSecretQuarantine` filters
`e.isFile()`, so the `redacted/` subdirectory is excluded by construction — a
deliberate rule with its own shipped test, `listSecretQuarantine: the redacted/
SUBDIRECTORY never enters the withhold banner`. Measured above:
`listSecretQuarantine(stateDir)` is `[]`
in this state, so the digest's pending-review banner does not render at all.
**Making that banner see this copy would need durable state the product does not
have** — the preservation record is per-run and is never persisted — which is
why row **L5** leaves that surface alone and Out of scope routes the gap.

**Three registered mirrors in a `Done` spec are falsified by the correction.**
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md`'s Table Q is canonical for
the surfaces that name this folder, and three of its rows are about the two
`ledger.js` literals or about their relationship to the digest banner:

- **Q2** — the exhausted banner. Its cell records that *"the prefix `The
  withheld copies are in state/quarantine/` is byte-identical on purpose —
  `tests/integration/dream.test.js:1437` asserts it as a substring, which is why
  that file is not in Deliverables."* The stability that reasoning depends on is
  what this package ends, and that integration file IS in this package's
  Deliverables.
- **Q1** — the digest banner, whose TEXT this package does not touch. Its cell
  closes with *"The parenthetical is byte-identical to Q2's, deliberately: two
  banners about the same folder must not warn about it in two different
  phrasings."* After this package Q2's banner has no parenthetical, so there is
  no second phrasing to be identical to. The same sentence is mirrored in a
  two-line comment in `tests/unit/digest.test.js`.
- **Q9** — the summary line, registered as *"the one member of the withhold
  family this WP does not falsify … says only where the withheld notes are —
  which stays true."* That reason is the claim this package measures false, and
  on the arm that same spec introduced.

**Three claims the Draft stub made, measured rather than inherited.** The stub
this spec replaces is quoted and checked here because two of its three claims are
wrong, and a spec that silently drops a stub's claim leaves a reader unable to
tell a correction from an omission.

1. *"Two banner defects were measured in `src/core/dream/ledger.js` (at the
   time: `:449`, `:472`)."* **True, and both line numbers still resolve** —
   `:449` is the exhausted sentence, `:472` the summary line's closing sentence.
   But they are not two defects: they are **one claim stated twice**, and the
   census above shows it stated twice more outside that file.
2. *"…for every entry shape the ledger can hold (including the only-copy abort
   entries introduced by the dependency WP)."* **False. There are no such
   entries.** `WP-preservation-abort-widening` did not touch
   `src/core/dream/ledger.js` at all — `git log -- src/core/dream/ledger.js`
   names `e75620a8` (`WP-quarantine-banner-decay`) as that file's last change —
   and its abort raises a `WienerdogError` out of `promote()`, so the run never
   reaches the transcript advance, `writeLedger`, the summary line or the digest
   regeneration. The ledger's record shapes are exactly what they were.
3. *"The banner is derived from the preservation record — no second
   derivation."* **Not achievable as written**, and the reason is the defect:
   `quarantineBannerLine`, `secretRevertSummaryLine`, `composeWarnings` and
   `quarantineReport` are handed a transcript ledger or three integers and never
   a preservation record, and that record is per-run and is not persisted
   anywhere a durable banner could read it. The satisfiable form of the stub's
   intent is Table L row **L0**: the record stays the single source, and a
   surface that cannot read it stops restating what it decides. The stub's
   title — *pin its slot* — is retired with the same reasoning: nothing about
   the banner's POSITION in the digest prefix was found wrong, and the digest
   prefix is reserved whole by `capDigest` and cannot be squeezed or truncated.

**What the existing tests pin, and how many break.** The four literals are
pinned in **four** test files: `tests/unit/ledger.test.js` (two full-string
equalities), `tests/unit/dream-warnings.test.js` (one document equality, one
marker), `tests/unit/doctor.test.js` (one CLI line equality),
`tests/integration/dream.test.js` (one substring). Rehearsed: the candidate fix
applied to a `git archive` scratch copy of `8302ce8e` gives `npm test` →
`tests 2618 / pass 2600 / fail 6`, and the six failures are exactly those four
files' assertions (`ledger.test.js` and `dream-warnings.test.js` carry two
each). **That is the whole blast radius**, and it matches the Deliverables table
row for row.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/ledger.js | Table L rows **L0** (the canonical constant, exported), **L1**, **L2** |
| modify | src/core/dream/warnings.js | Table L row **L3** — imports L0's constant; the retyped literal goes, and so does the byte-identity claim in its doc comment, which L3 replaces with the import fact |
| modify | src/cli/dream.js | Table L row **L7** — ONE MOVE, no rewritten line: row G11's undelivered-record block is relocated to sit as step **17b**, immediately before step 18, and its comment header gains the byte-exact sentences under Implementation notes. Two hunks, one insertion and one deletion of the same block |
| modify | src/cli/doctor.js | Table L row **L4** — the same import inside `quarantineReport`, the same substitution. No other line of this file changes |
| modify | tests/unit/dream-pipeline.test.js | Table L row **L7**'s failure-injection evidence — one new test. No existing assertion in this file changes |
| modify | tests/unit/ledger.test.js | the two updated full-string pins, and the three new named tests **T1**, **T2**, **T3** of Table C |
| modify | tests/unit/dream-warnings.test.js | the updated document equality and the updated marker |
| modify | tests/unit/doctor.test.js | the one updated CLI line equality, and the new named test **T4** of Table C |
| modify | tests/integration/dream.test.js | the one updated substring assertion |
| modify | tests/unit/digest.test.js | **comment only** — the two-line comment claiming byte-identity with the exhausted-transcript banner's parenthetical. That banner no longer has one. The assertion below it is unchanged and still passes |
| create | tests/red-proofs/quarantine-banner-location.proofs.json | Table C's **File A**, inlined there in full: the four proofs whose suite is `tests/unit/ledger.test.js` |
| create | tests/red-proofs/quarantine-banner-location-doctor.proofs.json | Table C's **File B**, inlined there in full: the two proofs whose suite is `tests/unit/doctor.test.js`. A separate file because `suite` is a top-level field and one declaration names one suite |
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | rows **Q1**, **Q2** and **Q9** only, each gaining its byte-exact clause under Implementation notes. Nothing else in the file — no other row, no assertion, no mutation entry. Q1's TEXT is not changed by this package; its clause scopes one sentence of its reasoning |

**Explicitly NOT in the boundary**, each for a stated reason:

- `src/core/digest.js` — row **L5**. Its banner reads the folder it names and
  lists only files it observed there, so its sentence and its parenthetical are
  true for everything it announces. What it cannot do is announce a copy on the
  other shelf, and closing that needs durable state (Out of scope).
- `src/core/dream/validate.js` and `src/core/dream/promote.js` — the record and
  its renderer are already correct; `copyClause` is row **L6**, registered as the
  canonical renderer and unchanged.
- `docs/runbooks/secret-incident.md`, `docs/GLOSSARY.md`,
  `docs/THREAT-MODEL.md` — none of them states the shelf of a *withheld* copy as
  a universal. The glossary describes each folder's purpose, which stays true;
  the runbook already carries a bullet for each folder
  (`WP-secret-fence-ep2-redact-arm` Table Q rows **Q3** and **Q4**). No sentence
  in any of the three becomes false.
- Every other `done/` spec that quotes one of the four literals
  (`WP-secret-revert-defers-ledger`, `WP-quarantine-warnings-file`,
  `WP-quarantine-banner-decay`, and the **Superseded**
  `WP-quarantine-review-cli`) — those are RECORDS of what shipped, not living
  contracts. Only `WP-secret-fence-ep2-redact-arm`'s Table Q is a canonical
  table with registered mirrors, and it is the only one amended.

### Exact contracts

**One exported constant, and it is the whole mechanism.**

```js
/** src/core/dream/ledger.js — the ONE place the product's answer to "where is
 *  my withheld copy?" is decided for a surface that cannot observe the copy.
 *  Code-owned, no interpolation, no path, no basename, no count. */
const PRESERVED_COPIES_POINTER = '<the byte-exact sentence under Implementation notes>';
```

It is exported from `ledger.js` and imported by `warnings.js` and by
`doctor.js`'s `quarantineReport`. **No consumer retypes it** — V2 is the check,
and a retyped byte-identical copy is exactly what V2 exists to catch, because no
runtime assertion can tell two equal strings apart.

Nothing else changes shape. `quarantineBannerLine(ledger, opts)`,
`secretRevertSummaryLine(counts)`, `composeWarnings(ledger)` and
`quarantineReport(stateDir, vaultPath)` keep their signatures, their return
types, their gating conditions and their decay behaviour. **No branch, no
condition and no computed value changes anywhere in this package.** The one
change that is not textual is row **L7**: an existing block of statements runs
earlier in the same function, unaltered.

**The rendered results, measured on the rehearsal tree, not predicted** (the
line wrapping is this document's; the rendered strings carry none):

```text
> [!warning] Wienerdog: 2 session transcript(s) are no longer being dreamed over — the
notes made from them were withheld by the secret check too many times in a row:
sess-a.jsonl, sess-b.jsonl. Copies of the withheld notes are kept outside your vault; the
dream run that withheld them names each copy and its folder, in its dream report or in
the output it printed. The session files themselves are untouched.
```

```text
wienerdog: dream — the secret check withheld 2 note(s); 3 session transcript(s) will be
retried on the next run and 0 were skipped after too many withheld runs in a row. Copies
of the withheld notes are kept outside your vault; the dream run that withheld them names
each copy and its folder, in its dream report or in the output it printed.
```

```text
[warn] 1 session transcript(s) are being skipped: the notes made from them were withheld
by the secret check too many times in a row. Copies of the withheld notes are kept
outside your vault; the dream run that withheld them names each copy and its folder, in
its dream report or in the output it printed.
```

and in `reports/warnings.md`, under its existing heading:

```text
### The notes made from these sessions were withheld by the secret check too many times in a row — 1

Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed.

- spent.jsonl
```

**WHY THE SENTENCE NAMES TWO CHANNELS AND NOT ONE — measured, and it is what the
first draft got wrong.** An earlier form of this sentence said *"each dream
report names its own copies and the folder each one is in"*, which is false on
two of the report's four outcome arms. `promote()` returns one of:

| `report.outcome` | where the enforcement record ends up | measured in |
|---|---|---|
| `promoted`, `accounting.published === true` | the dream report in the vault, section included | the ordinary arm |
| `promoted`, `accounting.published === false` | body in the vault, **section printed to the run's output** | `src/cli/dream.js`'s `undelivered` branch |
| `fallback` | published to the vault — the section alone, or appended to what was there | `promote.js`'s Table R preserve-and-extend arm |
| `refused` | **nothing in the vault; the record printed to the run's output only** | `src/cli/dream.js`: *"the complete record of this run follows and is not stored anywhere else"*, and the shipped test `dream-pipeline: … row G11` asserts the report path is **not** in the commit |

A durable banner is read weeks after its run. Promising a file that the refused
arm never created would be the same class of false pointer this package exists
to remove — a sentence that is right most of the time and wrong exactly when the
user needs it. **What row G11 actually guarantees is the disjunction**: *every
record this run produced reaches the user*, in the report or in that run's own
output. The sentence says exactly that and no more.

**AND THE DISJUNCTION IS ONLY TRUE IF THE OUTPUT HAPPENS FIRST — which today it
does not.** On the two output-bearing arms the record is printed at step 20,
*after* `writeLedger` (step 18), the summary line, `regenerateDigest()` and the
vault warnings refresh. Every one of those persists or prints a sentence saying
the run named each copy and its folder, so a throw in that window leaves the
claim durable and the record dead in memory. **Measured**, with the run aborted
immediately after `transcript-ledger.json`'s atomic rename on the refused-report
arm: the final ledger is on disk and the output carries no record at all — and a
placement just after `writeLedger` fares no better, which is why the evidence is
three-state (criterion 6). **Row L7 closes the
window by moving the delivery to step 17b** — one relocated block, no rewritten
line — so the sentence is true by construction rather than true on the success
path. The alternative, narrowing the sentence to a directive to look rather than
a claim that the record was printed, was rejected: it would leave the user with
a pointer and no destination on exactly the arm that costs them their bytes, and
the reorder is two hunks.

## Contract reference

Activation trigger (ADR-0031, 2-of-7): **(v)** one component decides where a
preserved copy is — the EP2 gate, on the preservation record — and **six** other
surfaces tell the user about it, four of them without ever reading that record;
**(vi)** `WP-quarantine-preserve-durability` inherits the same record and the
same surfaces; **(vii)** the same fact is stated in four source literals, six
test assertions across four test files, and three rows of a `Done` spec's
canonical table. Three of seven.

### Table L — canonical: who may name a preserved copy's shelf, and from what

This table is the single place these facts are decided. Every other surface in
this spec cites it. The governing rule is **L0**; **L1**–**L6** apply it per
surface, and **L7** is the ordering that makes L1–L4's sentence true on every
arm rather than only on the success path.

| # | Surface (construct) | What it can OBSERVE | Shipped behaviour at `8302ce8e` | Required after this WP |
|---|---|---|---|---|
| **L0** | — the rule | — | stated for the surfaces downstream of `promote()`'s return (`WP-dream-promote-module` Table Q row **Q9**: *none re-derives one, and none adds a carrier beside it*) and never applied to these four, which state a shelf while observing no copy | **A surface may name the folder a preserved copy is in ONLY IF it observes that copy — by reading the preservation record, or by listing the folder. A surface that observes neither states the CLASS and POINTS at one that does, and names no folder.** The class sentence has exactly one author: `ledger.js`'s exported `PRESERVED_COPIES_POINTER`, whose text is byte-exact under Implementation notes. It contains no path, no basename, no count and no command |
| **L1** | `ledger.js` `quarantineBannerLine`, the `secret-revert-exhausted` sentence | the transcript ledger: which transcripts are quarantined and why. **No copy** | states `The withheld copies are in state/quarantine/` and instructs a delete, both false on the fall-through arm (Current state) | the shelf clause and the disposal instruction are replaced by `PRESERVED_COPIES_POINTER`. **Everything else in this banner is byte-unchanged**: the count, the sanitized basename list, the closing `The session files themselves are untouched.`, the informational sentence, the freshness gate, and the rule that it names no command |
| **L2** | `ledger.js` `secretRevertSummaryLine`, its closing sentence | three integers | states `The withheld notes are in state/quarantine/.` | replaced by `PRESERVED_COPIES_POINTER`. The three counts and their fail-closed integer coercion are byte-unchanged |
| **L3** | `warnings.js` `SECRET_EXHAUSTED_REMEDIATION` | the transcript ledger. **No copy** | a RETYPED copy of L1's literal, with a doc comment claiming byte-identity with *"the sentence the digest banner uses for the same class"* — **which names the wrong surface**: it is byte-identical to L1, `ledger.js`'s exhausted banner, and not to L5, `digest.js`'s | **imports** `PRESERVED_COPIES_POINTER` and is that constant. The doc comment states the import rather than a byte-identity a reader would have to check. Which group carries the line, and that no other group does, is unchanged |
| **L4** | `doctor.js` `quarantineReport`, the `secret-revert-exhausted` row | the transcript ledger. **No copy** | states `The withheld copies are in state/quarantine/.` | the same import, the same substitution. The row's count, its position in the Table A order, and the four other rows are byte-unchanged |
| **L5** | `digest.js` `secretQuarantineWarn` | **the folder**: `listSecretQuarantine` lists direct file entries of `state/quarantine/` | names `state/quarantine/`, lists the basenames it observed, and keeps the `(not the redacted/ folder inside it)` parenthetical | **UNCHANGED, and this row is why.** It satisfies L0 for every copy it announces. What it cannot announce is a copy on the other shelf — measured, `listSecretQuarantine` returns `[]` in that state — and closing that needs durable state the product does not have. Out of scope owns it; nothing here weakens or widens this banner. **One sentence of this banner IS false and is PARKED, not overlooked:** *this notice clears when no withheld copies are left* — see the Dispatch precondition's second owner item, which states the measured state, the recommendation and the cost of overruling it |
| **L7** | `src/cli/dream.js`, row G11's undelivered-record delivery | — (it is the ORDER, not a claim) | the record is printed at step **20**, AFTER `writeLedger` (step 18), after the summary line, after `regenerateDigest()` and after the vault warnings refresh | **it runs as step 17b, BEFORE step 18.** Measured at the LEDGER BOUNDARY, which is where the first durable claim is made: with `transcript-ledger.json`'s atomic rename delegated and the run aborted immediately after it, today's order leaves the final ledger on disk and the record never printed — and so does a placement after `writeLedger`. Only the step-17b placement delivers first. L1-L4's sentence says the run named each copy and its folder; printed after those surfaces it is a promise about output a throw can still prevent, and on the refused redacted-only-copy arm that is the user's only route to a bounded-shelf copy. Moving it makes the sentence true by construction on every arm instead of wording around it. **This is a REORDER and nothing else**: no statement changes, no value changes, no durable state is added (so ADR-0004 and the durability successor are both untouched) |
| **L6** | `promote.js` `copyClause` | the record entry: `artifact`, `location`, `remediation` | renders `` unredacted copy at state/<location>/<artifact> `` | **UNCHANGED — the canonical renderer.** It is the surface L1–L4's pointer points at. Its `remediation` VALUE is a separate, owner-ruled contract (`WP-dream-promote-module` Table Q row Q9) and is not touched; Out of scope records the tension it leaves |

Two things this table does **not** change, stated so no one infers them.
**One:** nothing about which copies exist, where the gate writes them, when a
preservation succeeds or fails, or when the run aborts — Table P and Table D of
`WP-preservation-abort-widening` own all of that and this package touches none of
it. **Two:** no gating condition moves. The exhausted sentence still renders
whenever a `secret-revert-exhausted` record exists and still never decays; the
informational sentence still decays on its seven-day window; the summary line is
still printed on exactly the runs it is printed on today.

### Table C — canonical: the machine-run RED proofs — their declarations, their mutations and their test identities

`scripts/red-proofs.js`'s `evaluateRed` requires the observed **own-body**
failing set to EQUAL the declaration's `expectRed`, so the suite's test
identities are contract and are decided here (ADR-0042; settled practice — the
Done `WP-instruction-basename-currency` and `WP-dot-segment-denial` carry the
same shape). **The declarations are INLINED IN FULL below**, because neither
`scripts/red-proofs.js` nor any shipped declaration is in the implementer's
reading set (CLAUDE.md: this spec plus the Deliverables files), so a semantic
description of a mutation is not something an implementer can turn into a valid
declaration. Copy the objects; do not re-derive them.

**Four identities, one per carrier, and each is a FULL-STRING equality against a
HAND-WRITTEN expected literal — never against the imported constant.** That is
the load-bearing decision in this table and it is the opposite of the obvious
one. A test that builds its expectation as `` `… ${PRESERVED_COPIES_POINTER} …` ``
moves with the constant, so the derivation mutation below would leave it GREEN
and prove nothing. Against a hand-written literal the mutation reddens every
carrier that actually derives from the constant — and leaves a carrier that
composed its own copy GREEN, which `evaluateRed` reports as
*"the declared identity … did not fail under the mutation"*. **That failure IS
the detection**: the derivation proof cannot be PROVEN while any carrier has a
second author. Measured — see the Verification-steps commentary.

Every assertion inside an identity carries that identity's **band marker** in
its assertion MESSAGE, so each declaration's `signal` is a short string the
author writes rather than a guess about a diagnostic nobody has produced yet —
and short deliberately, because a 390-character banner inside a diagnostic is
not something to depend on.

| # | Test identity — the exact top-level test name | Suite | Band marker | What it asserts |
|---|---|---|---|---|
| **T1** | `ledger: [QBL-1] the exhausted banner renders the preserved-copies pointer verbatim` | `tests/unit/ledger.test.js` | `[QBL-1]` | `quarantineBannerLine` over two `secret-revert-exhausted` records equals the FULL hand-written banner string of "Exact contracts", and contains neither `state/quarantine` nor `redacted/` |
| **T2** | `ledger: [QBL-2] the secret-revert summary line renders the preserved-copies pointer verbatim` | `tests/unit/ledger.test.js` | `[QBL-2]` | `secretRevertSummaryLine({withheld:2, deferred:3, quarantined:0})` equals the FULL hand-written line of "Exact contracts", and contains neither `state/quarantine` nor `redacted/` |
| **T3** | `ledger: [QBL-3] the vault warnings document renders the preserved-copies pointer verbatim` | `tests/unit/ledger.test.js` | `[QBL-3]` | `composeWarnings` over one `secret-revert-exhausted` record carries the FULL hand-written pointer sentence as its own line, and the document contains neither `state/quarantine` nor `redacted/` |
| **T4** | `doctor: [QBL-4] the secret-exhausted line renders the preserved-copies pointer verbatim` | `tests/unit/doctor.test.js` | `[QBL-4]` | the `[warn]` line `wienerdog doctor` prints for one `secret-revert-exhausted` record equals the FULL hand-written line of "Exact contracts" |

T3 lives in `ledger.test.js` and drives `warnings.js` in-process, which keeps
three of the four identities in one suite; T4 cannot join them because
`quarantineReport` is not exported and its evidence is a CLI spawn.

**Six proofs in two declaration files** — one file per suite, which is what
`suite` being a top-level field means. A proof's `criterion` field is the
acceptance criterion it proves, so `rollUp` emits **five** lines for this WP:
one each for criteria 1-4, and one for criterion **5** naming BOTH derivation
proofs, which share the `(wp, criterion)` pair.

#### File A — `tests/red-proofs/quarantine-banner-location.proofs.json`

```json
{
  "suite": "tests/unit/ledger.test.js",
  "proofs": [
    {
      "id": "banner-shelf-claim-restored",
      "wp": "WP-quarantine-banner-location",
      "criterion": "1",
      "why": "reverting the exhausted banner's use of the constant to the shipped shelf-and-delete literal must redden the banner's own full-string pin and nothing else in this suite",
      "file": "src/core/dream/ledger.js",
      "find": "        `${PRESERVED_COPIES_POINTER} ` +\n        'The session files themselves are untouched.'",
      "replace": "        'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest ' +\n        'of the files there (not the redacted/ folder inside it). ' + /* RP_MUT_QBL_BANNER_SHELF */\n        'The session files themselves are untouched.'",
      "marker": "RP_MUT_QBL_BANNER_SHELF",
      "occurrences": 1,
      "testNamePattern": "\\[QBL-1\\]",
      "expectRed": [
        { "test": ["ledger: [QBL-1] the exhausted banner renders the preserved-copies pointer verbatim"], "signal": "[QBL-1]" }
      ]
    },
    {
      "id": "summary-shelf-claim-restored",
      "wp": "WP-quarantine-banner-location",
      "criterion": "2",
      "why": "reverting the summary line's use of the constant to the shipped shelf sentence must redden the summary line's own full-string pin; the three counts are untouched, so a pin that only checked the integers would stay green here",
      "file": "src/core/dream/ledger.js",
      "find": "    `row. ${PRESERVED_COPIES_POINTER}`",
      "replace": "    'row. The withheld notes are in state/quarantine/.' /* RP_MUT_QBL_SUMMARY_SHELF */",
      "marker": "RP_MUT_QBL_SUMMARY_SHELF",
      "occurrences": 1,
      "testNamePattern": "\\[QBL-2\\]",
      "expectRed": [
        { "test": ["ledger: [QBL-2] the secret-revert summary line renders the preserved-copies pointer verbatim"], "signal": "[QBL-2]" }
      ]
    },
    {
      "id": "warnings-shelf-claim-restored",
      "wp": "WP-quarantine-banner-location",
      "criterion": "3",
      "why": "restoring warnings.js's own retyped shelf literal must redden the warnings document's pin — that carrier is the one this WP converts from a retyped copy into an import",
      "file": "src/core/dream/warnings.js",
      "find": "const SECRET_EXHAUSTED_REMEDIATION = PRESERVED_COPIES_POINTER;",
      "replace": "const SECRET_EXHAUSTED_REMEDIATION = /* RP_MUT_QBL_WARNINGS_SHELF */\n  'The withheld copies are in state/quarantine/: restore what you meant to keep and delete the rest of the files there (not the redacted/ folder inside it).';",
      "marker": "RP_MUT_QBL_WARNINGS_SHELF",
      "occurrences": 1,
      "testNamePattern": "\\[QBL-3\\]",
      "expectRed": [
        { "test": ["ledger: [QBL-3] the vault warnings document renders the preserved-copies pointer verbatim"], "signal": "[QBL-3]" }
      ]
    },
    {
      "id": "pointer-derivation-ledger-suite",
      "wp": "WP-quarantine-banner-location",
      "criterion": "5",
      "why": "THE DERIVATION PROOF. Appending a marker inside the canonical constant's own literal must move EVERY carrier that derives from it, so all three identities in this suite go red together. A carrier that imported the constant and then composed a byte-identical copy of its own does not move, its identity stays green, and this proof cannot be PROVEN — which is the only observable difference between one author and two",
      "file": "src/core/dream/ledger.js",
      "find": "  'Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed.';",
      "replace": "  'Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed. RP_MUT_QBL_DERIVATION_LEDGER';",
      "marker": "RP_MUT_QBL_DERIVATION_LEDGER",
      "occurrences": 1,
      "testNamePattern": "\\[QBL-[123]\\]",
      "expectRed": [
        { "test": ["ledger: [QBL-1] the exhausted banner renders the preserved-copies pointer verbatim"], "signal": "[QBL-1]" },
        { "test": ["ledger: [QBL-2] the secret-revert summary line renders the preserved-copies pointer verbatim"], "signal": "[QBL-2]" },
        { "test": ["ledger: [QBL-3] the vault warnings document renders the preserved-copies pointer verbatim"], "signal": "[QBL-3]" }
      ]
    }
  ]
}
```

#### File B — `tests/red-proofs/quarantine-banner-location-doctor.proofs.json`

```json
{
  "suite": "tests/unit/doctor.test.js",
  "proofs": [
    {
      "id": "doctor-shelf-claim-restored",
      "wp": "WP-quarantine-banner-location",
      "criterion": "4",
      "why": "reverting doctor's interpolation to the shipped shelf sentence must redden the doctor line's own full-line pin; the four other Table A rows are untouched, so a pin that only checked row order would stay green here",
      "file": "src/cli/doctor.js",
      "find": "too many times in a row. ${PRESERVED_COPIES_POINTER}`,",
      "replace": "too many times in a row. The withheld copies are in state/quarantine/.`, /* RP_MUT_QBL_DOCTOR_SHELF */",
      "marker": "RP_MUT_QBL_DOCTOR_SHELF",
      "occurrences": 1,
      "testNamePattern": "\\[QBL-4\\]",
      "expectRed": [
        { "test": ["doctor: [QBL-4] the secret-exhausted line renders the preserved-copies pointer verbatim"], "signal": "[QBL-4]" }
      ]
    },
    {
      "id": "pointer-derivation-doctor",
      "wp": "WP-quarantine-banner-location",
      "criterion": "5",
      "why": "the derivation proof for the FOURTH carrier, which cannot join File A because its evidence is a CLI spawn and a declaration names one suite. Same mutation, different marker, different suite: the doctor line must move with the constant, or doctor has a second author",
      "file": "src/core/dream/ledger.js",
      "find": "  'Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed.';",
      "replace": "  'Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed. RP_MUT_QBL_DERIVATION_DOCTOR';",
      "marker": "RP_MUT_QBL_DERIVATION_DOCTOR",
      "occurrences": 1,
      "testNamePattern": "\\[QBL-4\\]",
      "expectRed": [
        { "test": ["doctor: [QBL-4] the secret-exhausted line renders the preserved-copies pointer verbatim"], "signal": "[QBL-4]" }
      ]
    }
  ]
}
```

**Every `find` above is a substring of the byte-exact source forms under
Implementation notes, and all six were measured on the rehearsal tree**: each
`find` occurs exactly once in its file, each `marker` is in its own `replace`
and absent from the pristine file, and each mutated file passes `node --check`
— a mutation that does not parse is a proof that can never run. If a `find` does
not match, the source form was not written as prescribed: fix the source, never
the declaration.

**What the derivation proof does NOT establish, stated rather than implied.**
It catches a carrier whose rendered value does not move with the constant — a
composed duplicate, a retyped literal, a dead import. It does not catch a FIFTH
carrier nobody added to Table L, and it does not catch a carrier that derives
from the constant and then post-processes it. Those are Table L's job and the
review gates'.

**V2 shrinks to what it can honestly claim.** After this table V2 no longer
carries criterion 5. It is a cheap lexical guard that catches a **contiguous**
retyped copy of the sentence and a carrier that never names the identifier at
all. It cannot see a copy composed from split literals — measured: the exact
state both round-1 channels built (`warnings.js` imports the constant, never
uses it, and rebuilds the sentence from `'Copies of the withheld ' +` and the
rest) scores `V1 OK / V2 OK`, `rc=0`. V2 is kept because it is free and fires at
review time; **the derivation proof is what establishes criterion 5.**

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table L or Table C. A review finding
updates the table and all of these in one pass; a new mirror found in review is
added here on the spot.

- [ ] **Deliverables cells** — the four `src/` rows (L0–L4 and L7), the six test
      rows, the **two** declaration rows (Table C, Files A and B), and the
      `docs/specs/done/` row (`WP-secret-fence-ep2-redact-arm` rows Q1, Q2, Q9),
      plus the four "explicitly NOT in the boundary" bullets, which each state a
      row's disposition (L5, L6).
- [ ] **Acceptance criteria** — every criterion naming a carrier, the pointer
      sentence, the single-author rule, a Table C identity, or the roll-up
      line count.
- [ ] **Verification commands** — V1 (the shelf claim is gone from the three
      carriers), V2 (the contiguous-retype guard, and no longer criterion 5's
      evidence), V5 (each clause present in full, in its row's `why` cell, and
      the Done-spec diff shape), V3 (`npm run red-proofs` and its five roll-up
      lines), V4 (`npm test`, `npm run lint`).
- [ ] **The five byte-exact source forms** under Implementation notes, which
      Table C's six `find` strings quote: a change to any of them changes the
      declaration that quotes it, in the same pass.
- [ ] **Current state** — the five-carrier census table, the driven
      fall-through measurement, the `listSecretQuarantine` result, the
      `pruneRedactedOriginals` cap claim, the three-falsified-mirrors
      paragraph, and the
      six-tests-break blast-radius claim.
- [ ] **Operative prose** — the Dispatch precondition's statement of what
      changes and what does not; "Exact contracts" and its four measured
      renderings; the two "does not change" paragraphs under Table L; Table C's
      two residual paragraphs.
- [ ] **Operative prose, second entry** — the amendment-placement rule under
      Implementation notes and its per-row target table, which V5 and
      acceptance criterion 9 both mirror.
- [ ] **Mirrors outside this document** (all inside the Deliverables boundary) —
      row **L7**'s eleven-line comment header in `src/cli/dream.js`, byte-exact
      under Implementation notes and the one place the ordering guarantee is
      stated in the product;
      `warnings.js`'s doc comment on `SECRET_EXHAUSTED_REMEDIATION` (L3), the
      two-line comment in `tests/unit/digest.test.js` claiming byte-identity
      with the exhausted banner's parenthetical, and rows **Q1**, **Q2** and
      **Q9** of `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`.
- [ ] **NAMED RESIDUAL, not a mirror** — `scripts/boundary-check.js` is
      file-level, so once this spec file is touched for the `status:` flip any
      further edit to it is admitted. The diff to this spec file should be
      exactly the one-line `status:` change; a second hunk in it is anomalous
      and is a contract change to be judged as one.

## Implementation notes & constraints

- **THE SENTENCE IS SPEC-OWNED, and this is its text.** Everything else about
  code and test design is the implementer's; this one string is a contract
  surface, because it is the value of a canonical constant four surfaces render
  and because V2 compares it. Byte-exact, one line, no trailing space:

  ```text
  Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed.
  ```

  It is joined into each carrier with a single space where the shipped literal
  was, so the surrounding sentences keep their spacing.

- **Three constraints on that sentence that already have tests, and they still
  hold.** It names **no command** — `tests/unit/ledger.test.js` asserts
  `!/wienerdog\s+[a-z]/i` over the banner, and nothing ships a way to un-skip
  these sessions. It states **no deferral count** — a file can also reach the
  exhausted state through an unreadable counter. It carries **no basename, no
  path and no stored reason** — the summary line's whole design is that it is
  built from integers alone.

- **Amending a `Done` spec's canonical row is an established move here, and it
  has a shape.** `WP-preservation-abort-widening` amended this same file's rows
  Q18 and B3b: the row keeps its original text and gains a **bolded, dated,
  successor-naming clause**, appended inside one cell. Append only. Do not
  re-author a row, do not restate Table L's members inside one, and do not touch
  any other row or assertion in that file.

- **WHERE THE CLAUSE GOES — the rule is the CLAIM's cell, not a fixed column
  number, and this is the one place a literal reading goes wrong.** A clause
  whose own sentence says *"this cell's closing reason"* has to sit in the cell
  that holds that reason, or it describes something it is not next to — and
  **acceptance criterion 9 cannot catch it**, because a Table Q row is one line,
  so a clause in the wrong cell is still "one changed line". So: **append each
  clause to the cell that carries the claim it scopes**, measured, not assumed.
  Measured for these three at `8302ce8e` by splitting each row on `' | '`:

  | Row | cells | the claim being scoped | target cell |
  |---|---|---|---|
  | **Q1** | 4 | *"The parenthetical is byte-identical to Q2's, deliberately"* | **4** (the `why` column), at its end |
  | **Q2** | 4 | *"The prefix … is byte-identical on purpose"* | **4** (the `why` column), at its end |
  | **Q9** | 4 | *"…which stays true"* | **4** (the `why` column), at its end |

  **V5 checks this mechanically**, and it is the only check that can.

  **The Q18/B3b precedent is a precedent for the clause's SHAPE, not for its
  placement, and saying so prevents the wrong inference.** Measured: Q18's row
  has 4 cells and its 2026-09-02 clause sits in cell **2**, while the universals
  it scopes live in cells 3 and 4; B3b's row has 3 cells and its clause sits in
  cell **2** while its *"stays true"* claim is in cell 3. Copying that placement
  here would put a clause about a `why` cell inside a `surface` cell.

  All three clauses carry universals an append would otherwise silently leave
  standing, so all three are byte-exact. **Q1 first** — its decided TEXT does
  not change and only one sentence of its reasoning is scoped:

  ```text
  **Amended 2026-09-05 (`WP-quarantine-banner-location`): this row's TEXT is UNCHANGED — the digest banner keeps its sentence and its parenthetical, because it lists the folder it names. What is scoped is this cell's closing reason: the parenthetical is no longer byte-identical to row Q2's, because after that spec Q2's banner carries no parenthetical at all. There is no second phrasing left to disagree with, so the rule that sentence protected is satisfied by there being one banner that names the folder rather than by two agreeing. The same sentence is mirrored in a two-line comment in `tests/unit/digest.test.js`, which that spec corrects in the same pass. This clause changes no value in this row.**
  ```

  ```text
  **Amended 2026-09-05 (`WP-quarantine-banner-location`): this row's sentence is RETIRED and its prefix no longer appears in `src/core/dream/ledger.js`, in `src/core/dream/warnings.js` or in `tests/integration/dream.test.js`. The byte-identity this row records is of the PREFIX ACROSS THIS ROW'S OWN CHANGE — kept stable so that the integration substring assertion would survive, which is why that test file was outside this spec's Deliverables. That stability ends here: the assertion is updated and that file IS inside `WP-quarantine-banner-location`'s Deliverables. The reason is measured, not stylistic: which folder a preserved copy is in is decided per copy by the preservation record's `location` field, and on the redact-arm fall-through that record's only entry is `quarantine/redacted`, so a sentence naming one folder from the transcript ledger — which observes no copy at all — states a fact it cannot observe. Row Q14 is unchanged, and Row Q1's text is unchanged; see Q1's own clause. This clause restates no sentence.**
  ```

  ```text
  **Amended 2026-09-05 (`WP-quarantine-banner-location`): this row's disposition is WITHDRAWN and its sentence is RETIRED. The reason it gave — that the sentence "says only where the withheld notes are — which stays true" — is false, and was false when it was written, on an arm this very spec introduced: when the redact arm's copy survives and the withheld preserve fails, the note is REFUSED and its only preserved copy is on the `redacted/` shelf, which is what `tests/unit/dream-validate.test.js`'s R0b tests assert in both their tracked and untracked variants. `secretRevertSummaryLine` now carries the code-owned pointer that spec's Table L makes canonical, names no folder, and is still built from integers alone. Rows Q7 and Q8 are unaffected by that spec: Q7's dream-report line already names each copy's own folder, and Q8's reason suffix is not a surface it touches. This clause restates no sentence.**
  ```

  Then re-read each amended cell WHOLE and report, in the PR body, any sentence
  the clause leaves false — the clause scopes the universals it names, and a
  cell can hold one it does not.

- **The stub said `size: S` and this spec says `M`; the reason is measured.**
  The stub measured the claim in two places, in one file. The census measured it
  in **four**, across three source files, pinned by six assertions in four test
  files. Splitting the four carriers into a chain was considered and rejected:
  every seam runs through the same sentence, so half a chain would leave one
  surface stating the corrected fact and another stating the false one — the
  drift ADR-0031 exists to prevent, deliberately created. The package stays one
  because the change computes nothing new: four source files, one exported
  constant, four substitutions and one relocated block (row **L7**).

- **THE FIVE SOURCE FORMS TABLE C's `find` STRINGS QUOTE, and they are contract
  only for that reason.** Everything else about code structure is the
  implementer's; these five are byte-exact because a RED-proof declaration
  cannot be written against a shape nobody fixed. Write them exactly, and if a
  `find` then fails to match, the source form is what is wrong.

  **(a) `src/core/dream/ledger.js`, immediately after the
  `QUARANTINE_BANNER_WINDOW_MS` declaration** (the JSDoc wording is yours; the
  two code lines are not):

  ```js
  const PRESERVED_COPIES_POINTER =
    'Copies of the withheld notes are kept outside your vault; the dream run that withheld them names each copy and its folder, in its dream report or in the output it printed.';
  ```

  plus `PRESERVED_COPIES_POINTER,` in that file's `module.exports`.

  **(b) the exhausted banner's last two lines**, replacing the three shipped
  ones, at their existing eight-space indent:

  ```js
        `${PRESERVED_COPIES_POINTER} ` +
        'The session files themselves are untouched.'
  ```

  **(c) `secretRevertSummaryLine`'s closing expression**, at its existing
  four-space indent:

  ```js
      `row. ${PRESERVED_COPIES_POINTER}`
  ```

  **(d) `src/core/dream/warnings.js`** — one line, and
  `PRESERVED_COPIES_POINTER` added to the existing `require('./ledger')`
  destructuring:

  ```js
  const SECRET_EXHAUSTED_REMEDIATION = PRESERVED_COPIES_POINTER;
  ```

  **(e) `src/cli/doctor.js`**, inside `quarantineReport`, the tail of the
  `secret-revert-exhausted` row's `msg` template — the rest of the template is
  byte-unchanged:

  ```js
  too many times in a row. ${PRESERVED_COPIES_POINTER}`,
  ```

- **ROW L7's MOVE, EXACTLY — and the comment header is spec-owned prose.**
  Relocate the whole `// 20. ROW G11 …` block — its comment and its
  `const undelivered = …` / `if (undelivered) { … }` statements — so that it sits
  immediately BEFORE the `// 18. ROW G4 …` comment. **Move it; do not retype
  it.** Nothing inside the block changes except its two-line header, which
  becomes these eleven lines, byte-exactly (the step id follows this file's own
  `5b.` precedent, so the numbering stays monotonic and steps 18-20 keep their
  ids):

  ```text
        // 17b. ROW G11 — EVERY RECORD THIS RUN PRODUCED REACHES THE USER.
        //     Returning is not delivering, and this is the delivery.
        //
        //     IT RUNS BEFORE STEP 18, AND THE ORDER IS THE GUARANTEE. Every
        //     durable surface this run writes from step 18 onwards — the
        //     ledger, the digest banner it drives, the vault warnings file —
        //     carries a sentence saying the run named each preserved copy and
        //     its folder. Printed after them, that sentence would be a promise
        //     about output a crash or a throw could still prevent. Printed
        //     here it is a statement about output that has already happened.
  ```

  Measured on the rehearsal tree: the move is **two hunks** — one insertion, one
  deletion of the same block — and **no line is rewritten** apart from that
  header. `src/cli/dream.js` passes `node --check`, and the full suite is
  unchanged by the move.

- **`doctor.js` requires its ledger names inside `quarantineReport`**, not at
  module top level (`const { readLedger, SECRET_REVERT_EXHAUSTED_REASON } =
  require('../core/dream/ledger');`). Add the constant to that same
  destructuring; do not hoist the require.

- **The `npm run red-proofs` lane refuses in a git worktree whose
  `node_modules` is a symlink**, with `ERROR: SNAPSHOT — unsupported entry type:
  symbolic link at node_modules`. That is the lane's containment rule, not a
  failure of the work: run V3 in a checkout with a real `node_modules`, or on a
  `git archive` copy. Recorded so the refusal is not read as a red.

- Test design, fixture shapes and the mechanics of each RED are the
  implementer's beyond what Table C fixes (`docs/runbooks/spec-authoring.md`).
  Table C fixes only what `evaluateRed`'s equality makes contract: the **four**
  identities, their markers, their mutations and the two declaration files that
  carry them.

- No new npm dependencies; no `.ts` under `src/`; ADR-0004 — nothing started
  that outlives its call, and this package adds no call at all.

- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] **No new value enters any of the four surfaces.** The replacement is a
      code-owned constant with no interpolation: no basename, no path, no
      count, no stored `reason` string, no matched byte. The one surface that
      renders attacker-influenceable text — the exhausted banner's basename
      list, already passed through `ledger.displayName`'s
      `[A-Za-z0-9._-]` whitelist — is byte-unchanged, and the substitution
      happens after it. Required property, evidence required, mechanism left
      open: with a hostile transcript basename in the ledger, the rendered
      banner still carries no raw newline, no ESC byte and no character outside
      that whitelist in the name it prints.
- [ ] **The injection surface is not widened while the location is fixed**
      (`docs/THREAT-MODEL.md`, the digest bounding bullet: a value carried into
      a banner is either code-owned or passes a named neutralizer). Every value
      in every changed sentence is code-owned; nothing new is carried in.
- [ ] **Nothing is disclosed that was not disclosed before.** The pointer names
      a surface, not a folder, and the surface it names — the dream report —
      already renders each copy's folder and basename today.

## Acceptance criteria

- [ ] **1.** The exhausted banner (**L1**) renders `PRESERVED_COPIES_POINTER`
      and contains neither `state/quarantine` nor `redacted/`; its count, its
      sanitized basename list, its closing sentence and its names-no-command
      rule are unchanged, it still never decays, and the informational sentence
      beside it — text and seven-day freshness gate — is byte-unchanged.
- [ ] **2.** The secret-revert summary line (**L2**) renders the pointer,
      contains neither `state/quarantine` nor `redacted/`, and is still built
      from integers alone — every argument that is not a non-negative safe
      integer still renders as `0`.
- [ ] **3.** The vault warnings document (**L3**) renders the pointer, contains
      neither `state/quarantine` nor `redacted/`, and the remediation line still
      rides the `secret-revert-exhausted` group and no other.
- [ ] **4.** `wienerdog doctor`'s `secret-revert-exhausted` line (**L4**)
      renders the pointer, contains neither `state/quarantine` nor `redacted/`,
      and its position in the Table A row order and the four other rows'
      exact text are unchanged.
- [ ] **5.** **One author, established at RUNTIME.** Appending a marker inside
      `PRESERVED_COPIES_POINTER`'s own literal moves **every** carrier's rendered
      output — the exhausted banner, the summary line, the warnings document and
      the doctor line — so all four hand-written pins go red together. This
      criterion's evidence is **Table C's two derivation proofs**, not V2: a
      carrier that imported the constant and then composed a byte-identical copy
      of its own does not move, its declared identity stays green, and
      `evaluateRed` refuses the proof. V2 remains as a cheap lexical guard over
      the **contiguous** retyped case and claims nothing more.
- [ ] **6.** **L7 — the record is delivered before the FIRST thing that can
      claim it was, and that thing is the transcript ledger.** On the
      refused-report arm, at the instant `transcript-ledger.json` becomes
      durable — its atomic rename delegated so the final ledger IS on disk, and
      the run then aborted immediately — the output already carries the complete
      enforcement record: the announcing line **and** the record's own lines.
      **The discrimination is three-state and is the criterion, not the
      mechanism:** the shipped ordering must FAIL, a placement AFTER
      `writeLedger` but before the digest must ALSO FAIL, and only the step-17b
      placement may pass. The seam, the fixture and the assertion shape are the
      implementer's; the three states are not. **Why the ledger and not the
      digest:** `writeLedger` renames the temp onto the destination and only
      then chmods it, so a crash, a termination or a chmod failure in that gap
      leaves the final ledger durable — and every pointer-bearing surface is a
      function of that ledger. A detector at the digest write is a whole step
      too late and accepts the wrong placement; measured, it does.
      Nothing else about the block changes: same statements, same condition,
      same two arms, same neutralisation.
- [ ] **7.** **L5 and L6 did not move.** `src/core/digest.js` and
      `src/core/dream/promote.js` are absent from
      `git diff --name-only main...HEAD`, and the digest banner's full-string
      pin in `tests/unit/digest.test.js` — parenthetical included — still passes
      with only its comment changed.
- [ ] **8.** **Machine-run RED (ADR-0042).** `npm run red-proofs` reports
      `RUN: PROVEN` and its Criteria roll-up carries **five** lines for this WP —
      `criterion 1`, `2`, `3`, `4` and `5` — each `PROVEN` and each naming its
      Table C proof id(s). Five and not six, because the two derivation proofs
      share the `(wp, criterion)` pair and `rollUp` emits one line per pair,
      naming both ids.
- [ ] **9.** `WP-secret-fence-ep2-redact-arm` rows **Q1**, **Q2** and **Q9**
      each carry their byte-exact dated clause and no other edit; `git diff`
      shows one changed line per row and no other line in that file; **and each
      clause sits in that row's FOURTH cell, the `why` column** — the cell that
      carries the claim it scopes. The placement half is **V5's**, because a
      Table Q row is one line and the one-changed-line half cannot see a clause
      that landed in the wrong cell.
- [ ] **10.** Idempotence: `N/A`, and the reason is stated for what the package
      now actually is. Four of its five changes are text substitutions. The
      fifth, row **L7**, adds no write, no persistent state and no retry: it
      moves an existing output block so that it runs before writes that already
      happen, in the order they already happen. No new command ships and nothing
      outside the repo is written.
- [ ] **11.** `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the three ledger-derived carriers name no quarantine folder. The `test -f`
#      guard is REQUIRED: a negated grep on a missing file exits 2 and the
#      negation turns that into a pass, so the check would read greenest exactly
#      where the work was never done.
CARRIERS="src/core/dream/ledger.js src/core/dream/warnings.js src/cli/doctor.js"
v1=0
for f in $CARRIERS; do
  if [ ! -f "$f" ]; then echo "V1 MISSING DELIVERABLE: $f"; v1=1; continue; fi
  n=$(grep -oF 'state/quarantine' "$f" | wc -l | tr -d ' ')
  if [ "$n" != 0 ]; then echo "V1 SHELF CLAIM SURVIVES: $f ($n occurrence(s))"; v1=1; fi
done
[ "$v1" = 0 ] && echo "V1 OK"

# V2 — a CHEAP LEXICAL GUARD, and no more than that (Table C): no CONTIGUOUS
#      second copy of the sentence in src/, and every carrier names the
#      identifier. It does NOT establish criterion 5 — a copy composed from
#      split literals passes it, measured — and criterion 5's evidence is the
#      derivation proofs. `grep -o | wc -l` counts OCCURRENCES; `grep -c` counts
#      matching LINES and would accept two copies on one line.
v2=0
lit=$(grep -rhoF 'Copies of the withheld notes are kept outside your vault' src/ | wc -l | tr -d ' ')
if [ "$lit" != 1 ]; then echo "V2 SENTENCE HAS $lit AUTHOR(S) IN src/, expected 1"; v2=1; fi
for f in $CARRIERS; do
  if [ ! -f "$f" ]; then echo "V2 MISSING DELIVERABLE: $f"; v2=1; continue; fi
  grep -q 'PRESERVED_COPIES_POINTER' "$f" || { echo "V2 NOT WIRED: $f"; v2=1; }
done
[ "$v2" = 0 ] && echo "V2 OK"

# V1/V2 VERDICT. Without this line the block prints its findings and still exits
# 0 — a check that can never fail. Found by extracting this block and running it,
# not by reading it.
[ "$v1" = 0 ] && [ "$v2" = 0 ] || { echo "V1/V2 RED"; exit 1; }

# V5 — each amended row must be its BASE row plus exactly its clause, and
#      nothing else in that file may move. The base row is read with
#      `git show main:<file>`, the clause is EXTRACTED FROM THIS SPEC by a
#      structural key, and the candidate row is compared BYTE FOR BYTE against
#      the reconstruction. That single comparison is the decision: it subsumes
#      presence-in-full, placement at the end of cell 4, and — the thing a
#      line-counting check cannot see — any edit ELSEWHERE ON THE SAME LINE.
#      Criterion 9's "no other edit" has no other enforcement: a Table Q row is
#      ONE line, so a reauthored cell is still "one changed line".
Q=docs/specs/done/WP-secret-fence-ep2-redact-arm.md
SPEC=docs/specs/WP-quarantine-banner-location.md
v5=0
if [ ! -f "$Q" ] || [ ! -f "$SPEC" ]; then
  echo "V5 MISSING DELIVERABLE: $Q or $SPEC"; v5=1
else
  # Rows keyed STRUCTURALLY, by the claim each clause scopes — never by the
  # order the clauses appear in this spec.
  for pair in "Q1|this row's TEXT is UNCHANGED" "Q2|this row's sentence is RETIRED" "Q9|this row's disposition is WITHDRAWN"; do
    r=${pair%%|*}
    key=${pair#*|}
    clause=$(grep -F "$key" "$SPEC" | grep -F 'Amended 2026-09-05 (`WP-quarantine-banner-location`)' | sed 's/^ *//')
    if [ "$(printf '%s\n' "$clause" | grep -c .)" != 1 ]; then
      echo "V5 THIS SPEC DOES NOT CARRY EXACTLY ONE CLAUSE FOR $r"; v5=1; continue
    fi
    base=$(git show "main:$Q" | grep -F "| **$r** |")
    cand=$(grep -F "| **$r** |" "$Q")
    if [ "$(printf '%s\n' "$base" | grep -c .)" != 1 ] || [ "$(printf '%s\n' "$cand" | grep -c .)" != 1 ]; then
      echo "V5 ROW $r IS NOT EXACTLY ONE LINE AT BASE AND IN THE CANDIDATE"; v5=1; continue
    fi
    case "$base" in
      *" |") ;;
      *) echo "V5 ROW $r AT BASE DOES NOT END IN A CELL SEPARATOR"; v5=1; continue ;;
    esac
    # THE DECISION.
    if [ "$cand" != "${base% |} $clause |" ]; then
      echo "V5 ROW $r IS NOT ITS BASE ROW PLUS ITS CLAUSE — the clause is missing, truncated, in another cell, or something else on that line changed"; v5=1
    fi
  done
  # And no FOURTH line of that file moved.
  ns=$(git diff --numstat main -- "$Q" | awk '{print $1"/"$2}')
  if [ "$ns" != "3/3" ]; then echo "V5 DONE-SPEC DIFF IS ${ns:-empty}, expected 3/3"; v5=1; fi
fi
[ "$v5" = 0 ] && echo "V5 OK"
[ "$v5" = 0 ] || { echo "V5 RED"; exit 1; }

# V3 — the machine-run RED lane (criteria 5 and 8). REGRESSION-kind on the
#      untouched tree: it exits 0 there with the five already-declared proofs
#      PROVEN. What discriminates is the CONTENT — the FIVE roll-up lines naming
#      this WP, which cannot appear until the two declaration files and the four
#      identities exist, and which cannot all read PROVEN while any carrier has
#      a second author. Run it where `node_modules` is a real directory: the
#      lane refuses a symlinked one by design (Implementation notes).
npm run red-proofs

# V4
npm test
npm run lint
```

- **V1 and V2 are lexical guards, and that is all they are.** Neither can
  establish that a sentence is *rendered* rather than merely present; that is
  what criteria 1–4 and the review gates are for, and **V2 does not establish
  criterion 5** — the derivation proofs do (Table C). Observe and paste all
  three states for each: **deliverable absent** (a carrier renamed away → red),
  **compliant** (→ green), **violating** (the sentence retyped contiguously in a
  second place → V1 green, V2 red). Each was produced by extracting this fenced
  block from this file and piping it to a shell, so the shipped escaping is
  exercised rather than described. Measured, five trees: **untouched
  `8302ce8e`** → three `V1 SHELF CLAIM SURVIVES` lines, `V2 SENTENCE HAS 0
  AUTHOR(S)`, three `V2 NOT WIRED`, `V1/V2 RED`, `rc=1`; **rehearsal tree
  carrying the fix** → `V1 OK`, `V2 OK`, `rc=0`; **`src/core/dream/warnings.js`
  removed** → two `MISSING DELIVERABLE` lines, `rc=1`; **the sentence retyped
  contiguously once more under `src/cli/`** → `V1 OK`, `V2 SENTENCE HAS 2
  AUTHOR(S) IN src/, expected 1`, `rc=1`; and — **the state this step does NOT
  catch, run and recorded rather than reasoned about** — `warnings.js` importing
  the constant, never using it, and rebuilding the sentence from
  `'Copies of the withheld ' +` and the rest → `V1 OK`, `V2 OK`, `rc=0`.
- **The derivation proof catches exactly that state, and it was measured on both
  trees.** Appending a space and `RP_MUT_QBL_DERIVATION_LEDGER` inside the constant's own
  literal and re-rendering every carrier: on the **correct** tree the banner,
  the summary line and the warnings document all carry the marker
  (`MOVED / MOVED / MOVED`); on the **composed-defeat** tree the banner and the
  summary line move and the warnings document does **not**
  (`MOVED / MOVED / unmoved`). A full-string pin against a hand-written literal
  therefore goes red for every deriving carrier and stays green for the composed
  one — which is the failure `evaluateRed` reports as *the declared identity did
  not fail under the mutation*, and it is why criterion 5 has runtime evidence
  at all. The **doctor** carrier was measured the same way, through a real CLI
  spawn: under the mutation its `[warn]` line comes back carrying the marker.
- **V5 makes ONE decision: each amended row is its base row plus its clause.**
  Everything it used to check separately — presence in full, placement at the
  end of cell 4 — is a consequence of that byte comparison, and so is the thing
  a line-counting check cannot see: an edit ELSEWHERE ON THE SAME LINE. It
  cannot judge whether a clause is *correct*, only that nothing but the clause
  moved. Extracted from this block and run in **seven** trees, each a scratch
  git repo whose `main` is the pristine `8302ce8e`:

  | tree | V5 says | rc |
  |---|---|---|
  | untouched | 3 × `IS NOT ITS BASE ROW PLUS ITS CLAUSE` + `DIFF IS empty, expected 3/3` | 1 |
  | each clause at the end of cell 4 | `V5 OK` | 0 |
  | marker-only (round 1's defeat) | 3 × `IS NOT ITS BASE ROW PLUS ITS CLAUSE` | 1 |
  | each clause in cell 2 | 3 × `IS NOT ITS BASE ROW PLUS ITS CLAUSE` | 1 |
  | compliant + one unrelated edited line | `DIFF IS 4/4, expected 3/3` | 1 |
  | **compliant + Q1 reauthored BEFORE its clause** (round 2's defeat) | `V5 ROW Q1 IS NOT ITS BASE ROW PLUS ITS CLAUSE` | 1 |
  | **compliant + Q1's middle cell reauthored** | `V5 ROW Q1 IS NOT ITS BASE ROW PLUS ITS CLAUSE` | 1 |

  Six RED states, each failing for its own reason. **The last two are why the
  numstat check alone was not enough:** both keep the file at three changed
  lines, and both passed the round-1 form of this step. On the compliant tree
  `npm run lint` also stays at `0 error(s)`.

- **The six existing tests that break are the work, not a surprise, and row L7
  adds none.** Rehearsed on `git archive` copies of `8302ce8e`: the four-carrier
  fix alone gives `tests 2618 / pass 2600 / fail 6`; the same tree **with row
  L7's move applied** gives the identical `2618 / 2600 / 6`; and with L7's
  failure-injection test added, `tests 2619 / pass 2601 / fail 6`. The six are
  the two `ledger.test.js` full-string pins, the two `dream-warnings.test.js`
  assertions, the one `doctor.test.js` CLI line and the one `dream.test.js`
  integration substring. **No test in the suite asserts the ORDER of the run's
  output**, which is what makes L7's move free — measured, not assumed. If a
  seventh breaks, something outside Table L moved and it is a finding, not a
  fixture to update.
- **Row L7's evidence is THREE-state, and the third state is why the seam
  moved.** The rehearsal patches `fs.renameSync` for the destination ending in
  `transcript-ledger.json`, **delegates that rename first** so the final ledger
  is genuinely durable, and throws immediately after it. Measured on three
  scratch copies of `8302ce8e`, all carrying the four-carrier fix:

  | placement of the record print | detector at the LEDGER rename |
  |---|---|
  | shipped ordering (step 20) | `tests 1 / pass 0 / fail 1` |
  | **after `writeLedger`, before the digest** | `tests 1 / pass 0 / fail 1` |
  | **step 17b (specified)** | `tests 1 / pass 1 / fail 0` |

  **And the round-2 seam is measured failing to discriminate**, which is why it
  was replaced rather than merely improved: the same wrong placement, checked by
  a fault at the DIGEST rename, scores `tests 1 / pass 1 / fail 0`. A detector a
  whole step downstream of the first durable claim cannot see a print that
  landed between them.
- **Two seam traps, both found by running the seam rather than reasoning about
  it.** (i) `fs.writeFileSync` never fires for these destinations —
  `writeFilePrivate` writes through `openSync`/`writeSync` on a randomly named
  temp and only then renames, so the destination name appears at the RENAME.
  (ii) The ledger patch must **delegate** the rename before throwing; a patch
  that throws instead of renaming tests a ledger that never became durable,
  which is a different and much weaker claim. The fixture must also carry no
  `state/watermarks.json`, or step 4's one-time migration writes the ledger
  first and the fault lands before `promote()` has run — assert that
  precondition rather than assuming it.

## Out of scope (do NOT do these)

- **`src/core/digest.js`'s pending-review banner** — row **L5**. It satisfies
  L0 already. What it cannot do is announce a withheld note whose only copy is
  on the `redacted/` shelf: `listSecretQuarantine` excludes subdirectories by
  design and the preservation record is never persisted, so nothing durable
  knows that file is an only-copy. **Proposed successor, not yet filed:**
  `WP-quarantine-only-copy-shelf`, which would decide whether such a copy is
  moved to the withheld shelf, recorded durably, or exempted from the retention
  cap. It needs a product decision and it is not this package's. **Its closing
  sentence — *this notice clears when no withheld copies are left* — is false in
  one measured state and is an OWNER item, not an oversight:** Dispatch
  precondition, second item, with the recommendation and the cost of overruling
  it.
- **The `remediation` value on a refused path — a tension between two ratified
  surfaces, not a defect this package may call one.** `promote.js`'s
  `withRemediation(d.preserved, 'delete')` on the refusal arms gives every
  preserved copy `remediation: 'delete'`, which `REMEDIATION_GUIDANCE` renders
  as *Nothing was promoted for this path; delete that copy.* That value is
  **deliberate and owner-ruled**: `WP-dream-promote-module` Table Q row **Q9**
  states `delete` is *"every refusing arm's value on both shelves — the note
  never entered the vault, the workspace is destroyed with the run, and what the
  copy holds is brain-authored text the product refused"* (owner ruling,
  2026-08-29, round 3). What is unresolved is that the digest's own banner, in
  the same digest, says *restore what you meant to keep* about the same file, and
  Q9's reasoning does not consider the arm this spec measures, where the copy is
  the note's ONLY one and sits on the bounded shelf. **Report the tension under
  "Discovered issues" in the PR body; change nothing.** It is a question about a
  ratified value, and it belongs to the owner and to Q9's own spec.
- **`pruneRedactedOriginals`' retention cap** evicting an only-copy. Measured
  above as reachable; owned by the same proposed successor.
- **Making preservation crash-durable** — `WP-quarantine-preserve-durability`
  (Draft), owner-sequenced immediately after this package.
- **Anything about which copies exist, where the gate writes them, when a
  preservation fails, or when the run aborts** — `WP-preservation-abort-widening`
  Tables P and D, both shipped. This package cites them and restates neither.
- **Any change to `WP-secret-fence-ep2-redact-arm`'s Table Q other than rows
  Q1, Q2 and Q9**, any change at all to `WP-dream-promote-module`'s Table Q,
  and any change to any other `done/` spec
  other than `WP-secret-fence-ep2-redact-arm`.
## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including V1's and V2's four states each (the composed-duplicate state
   included, where they are green), V5's seven states, V3's five roll-up lines,
   and row L7's failure-injection test run in all THREE states — the shipped
   ordering, a placement after `writeLedger`, and step 17b — with only the last
   green.
2. Conventional commits; PR titled
   `fix(dream): stop the ledger-derived banners naming a quarantine shelf (WP-quarantine-banner-location)`.
3. PR template filled, including "Decisions made" (or "none"), "Discovered
   issues" (the remediation-value defect above), and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
