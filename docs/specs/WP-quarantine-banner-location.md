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

**Do not dispatch until that is answered.** A "keep an instruction" answer
changes Table L rows **L1**–**L4** and the byte-exact sentence under
Implementation notes; it changes no path in the Deliverables table.

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
package adds none. This package changes **no control flow at all**: it changes
what four sentences say and where their text is decided.

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
| modify | src/cli/doctor.js | Table L row **L4** — the same import inside `quarantineReport`, the same substitution. No other line of this file changes |
| modify | tests/unit/ledger.test.js | the two updated full-string pins, and the three new named tests **T1**, **T2**, **T3** of Table C |
| modify | tests/unit/dream-warnings.test.js | the updated document equality and the updated marker |
| modify | tests/unit/doctor.test.js | the one updated CLI line equality |
| modify | tests/integration/dream.test.js | the one updated substring assertion |
| modify | tests/unit/digest.test.js | **comment only** — the two-line comment claiming byte-identity with the exhausted-transcript banner's parenthetical. That banner no longer has one. The assertion below it is unchanged and still passes |
| create | tests/red-proofs/quarantine-banner-location.proofs.json | Table C's three declarations |
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
types, their gating conditions and their decay behaviour. **No control flow in
any file changes.**

**The rendered results, measured on the rehearsal tree, not predicted:**

```text
> [!warning] Wienerdog: 2 session transcript(s) are no longer being dreamed over — the
notes made from them were withheld by the secret check too many times in a row:
sess-a.jsonl, sess-b.jsonl. Copies of the withheld notes are kept outside your vault;
each dream report names its own copies and the folder each one is in. The session files
themselves are untouched.
```

```text
wienerdog: dream — the secret check withheld 2 note(s); 3 session transcript(s) will be
retried on the next run and 0 were skipped after too many withheld runs in a row. Copies
of the withheld notes are kept outside your vault; each dream report names its own copies
and the folder each one is in.
```

```text
[warn] 1 session transcript(s) are being skipped: the notes made from them were withheld
by the secret check too many times in a row. Copies of the withheld notes are kept
outside your vault; each dream report names its own copies and the folder each one is in.
```

and in `reports/warnings.md`, under its existing heading:

```text
### The notes made from these sessions were withheld by the secret check too many times in a row — 1

Copies of the withheld notes are kept outside your vault; each dream report names its own copies and the folder each one is in.

- spent.jsonl
```

**Why the pointer's target is not a hope.** `src/cli/dream.js` step 20, row
**G11**, states and enforces that *every record this run produced reaches the
user*: when the report is refused, or its body is published without its
enforcement section, the complete record — the preserved-copy lines included —
is printed to the run's own output instead. So the sentence points at a surface
that exists on every arm, whether or not the report reached the vault.

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
this spec cites it. The governing rule is **L0**; L1–L6 apply it per surface.

| # | Surface (construct) | What it can OBSERVE | Shipped behaviour at `8302ce8e` | Required after this WP |
|---|---|---|---|---|
| **L0** | — the rule | — | stated for the surfaces downstream of `promote()`'s return (`WP-dream-promote-module` Table Q row **Q9**: *none re-derives one, and none adds a carrier beside it*) and never applied to these four, which state a shelf while observing no copy | **A surface may name the folder a preserved copy is in ONLY IF it observes that copy — by reading the preservation record, or by listing the folder. A surface that observes neither states the CLASS and POINTS at one that does, and names no folder.** The class sentence has exactly one author: `ledger.js`'s exported `PRESERVED_COPIES_POINTER`, whose text is byte-exact under Implementation notes. It contains no path, no basename, no count and no command |
| **L1** | `ledger.js` `quarantineBannerLine`, the `secret-revert-exhausted` sentence | the transcript ledger: which transcripts are quarantined and why. **No copy** | states `The withheld copies are in state/quarantine/` and instructs a delete, both false on the fall-through arm (Current state) | the shelf clause and the disposal instruction are replaced by `PRESERVED_COPIES_POINTER`. **Everything else in this banner is byte-unchanged**: the count, the sanitized basename list, the closing `The session files themselves are untouched.`, the informational sentence, the freshness gate, and the rule that it names no command |
| **L2** | `ledger.js` `secretRevertSummaryLine`, its closing sentence | three integers | states `The withheld notes are in state/quarantine/.` | replaced by `PRESERVED_COPIES_POINTER`. The three counts and their fail-closed integer coercion are byte-unchanged |
| **L3** | `warnings.js` `SECRET_EXHAUSTED_REMEDIATION` | the transcript ledger. **No copy** | a RETYPED copy of L1's literal, with a doc comment claiming byte-identity with *"the sentence the digest banner uses for the same class"* — **which names the wrong surface**: it is byte-identical to L1, `ledger.js`'s exhausted banner, and not to L5, `digest.js`'s | **imports** `PRESERVED_COPIES_POINTER` and is that constant. The doc comment states the import rather than a byte-identity a reader would have to check. Which group carries the line, and that no other group does, is unchanged |
| **L4** | `doctor.js` `quarantineReport`, the `secret-revert-exhausted` row | the transcript ledger. **No copy** | states `The withheld copies are in state/quarantine/.` | the same import, the same substitution. The row's count, its position in the Table A order, and the four other rows are byte-unchanged |
| **L5** | `digest.js` `secretQuarantineWarn` | **the folder**: `listSecretQuarantine` lists direct file entries of `state/quarantine/` | names `state/quarantine/`, lists the basenames it observed, and keeps the `(not the redacted/ folder inside it)` parenthetical | **UNCHANGED, and this row is why.** It satisfies L0 for every copy it announces. What it cannot announce is a copy on the other shelf — measured, `listSecretQuarantine` returns `[]` in that state — and closing that needs durable state the product does not have. Out of scope owns it; nothing here weakens or widens this banner |
| **L6** | `promote.js` `copyClause` | the record entry: `artifact`, `location`, `remediation` | renders `` unredacted copy at state/<location>/<artifact> `` | **UNCHANGED — the canonical renderer.** It is the surface L1–L4's pointer points at. Its `remediation` VALUE is a separate, owner-ruled contract (`WP-dream-promote-module` Table Q row Q9) and is not touched; Out of scope records the tension it leaves |

Two things this table does **not** change, stated so no one infers them.
**One:** nothing about which copies exist, where the gate writes them, when a
preservation succeeds or fails, or when the run aborts — Table P and Table D of
`WP-preservation-abort-widening` own all of that and this package touches none of
it. **Two:** no gating condition moves. The exhausted sentence still renders
whenever a `secret-revert-exhausted` record exists and still never decays; the
informational sentence still decays on its seven-day window; the summary line is
still printed on exactly the runs it is printed on today.

### Table C — canonical: the machine-run RED proofs, their mutations and their test identities

`scripts/red-proofs.js`'s `evaluateRed` requires the observed **own-body**
failing set to EQUAL the declaration's `expectRed`, so the suite's test
identities are contract and are decided here (ADR-0042; settled practice — the
Done `WP-instruction-basename-currency` and `WP-dot-segment-denial` carry the
same shape). Each proof additionally carries a `testNamePattern` selecting only
its own identity, so an unrelated red in the same file cannot enter the set.

The three identities are **disjoint by carrier**, deliberately: one identity per
mutated carrier means each mutation's failure set is attributable. Every
assertion inside an identity carries the fixed marker in its message, so the
declaration's `signal` is a string the author writes rather than a guess about a
diagnostic nobody has produced yet.

**A proof's `criterion` field is the acceptance criterion it proves**, by
number: proof criterion `1` is acceptance criterion **1** (row L1), `2` is
acceptance criterion **2** (row L2), `3` is acceptance criterion **3** (row L3).
Each proof carries its own value, so `rollUp` emits **three** lines rather than
one — which is what acceptance criterion 7 asserts.

| # | Test identity (top-level, `tests/unit/ledger.test.js`) | Marker | What it asserts | Proof that reddens it | Mutation (`find` → `replace`) |
|---|---|---|---|---|---|
| **T1** | `ledger: [QBL-1] the exhausted banner carries the preserved-copies pointer and names no quarantine folder` | `[QBL-1]` | the rendered exhausted sentence CONTAINS `PRESERVED_COPIES_POINTER` and contains neither `state/quarantine` nor `redacted/`; the rest of the banner is unchanged | `banner-shelf-claim-restored` (criterion **1**) | in `src/core/dream/ledger.js`, the banner's use of the constant → the shipped shelf-and-delete literal |
| **T2** | `ledger: [QBL-2] the secret-revert summary line carries the preserved-copies pointer and names no quarantine folder` | `[QBL-2]` | the rendered summary line CONTAINS the pointer and contains neither `state/quarantine` nor `redacted/`; the three counts are unchanged | `summary-shelf-claim-restored` (criterion **2**) | in `src/core/dream/ledger.js`, the summary line's use of the constant → `` 'row. The withheld notes are in state/quarantine/.' `` |
| **T3** | `ledger: [QBL-3] the vault warnings document carries the preserved-copies pointer and names no quarantine folder` | `[QBL-3]` | `composeWarnings` output CONTAINS the pointer and contains neither `state/quarantine` nor `redacted/`; the remediation line still rides the secret-exhausted group and no other | `warnings-shelf-claim-restored` (criterion **3**) | in `src/core/dream/warnings.js`, `SECRET_EXHAUSTED_REMEDIATION` → the shipped retyped literal |

**What Table C does NOT cover, stated rather than implied.** `doctor.js`'s row
**L4** carries **no** RED proof: `quarantineReport` is not exported and
`tests/unit/doctor.test.js` drives the CLI by spawn, so a proof for it would need
its own declaration file and a spawn-per-phase run. It is guarded instead by
**V1** and **V2** (lexical, both directions observed) and by its own updated
full-line CLI equality. **That is a named residual, not a claim of coverage.**

**And a residual inside the proofs themselves.** No RED proof can catch a
consumer that RETYPES the pointer byte-identically instead of importing it — two
equal strings are indistinguishable at runtime. V2 is the only check that
reaches that, it is lexical, and it is stated as lexical.

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table L or Table C. A review finding
updates the table and all of these in one pass; a new mirror found in review is
added here on the spot.

- [ ] **Deliverables cells** — the three `src/` rows (L0–L4), the five test
      rows, the declaration row (Table C), and the `docs/specs/done/` row
      (`WP-secret-fence-ep2-redact-arm` rows Q1, Q2, Q9), plus the four
      "explicitly NOT in the boundary" bullets, which
      each state a row's disposition (L5, L6).
- [ ] **Acceptance criteria** — every criterion naming a carrier, the pointer
      sentence, the single-author rule, or a Table C identity.
- [ ] **Verification commands** — V1 (the shelf claim is gone from the three
      carriers), V2 (one author, every carrier wired), V5 (each clause in its
      row's `why` cell), V3 (`npm run red-proofs` and its three roll-up lines),
      V4 (`npm test`, `npm run lint`).
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
      acceptance criterion 8 both mirror.
- [ ] **Mirrors outside this document** (all inside the Deliverables boundary) —
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
  Copies of the withheld notes are kept outside your vault; each dream report names its own copies and the folder each one is in.
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
  **acceptance criterion 8 cannot catch it**, because a Table Q row is one line,
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
  because the change has **no control flow**: three source files, one exported
  constant, four substitutions.

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
  Table C fixes only what `evaluateRed`'s equality makes contract: the three
  identities, their markers and their mutations.

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
- [ ] **5.** **One author.** The pointer sentence occurs exactly once in `src/`,
      and each of the three carriers reaches it by importing or referencing
      `PRESERVED_COPIES_POINTER` rather than retyping it. This criterion's
      evidence is **V2 and V2 alone, and it is lexical**: no runtime assertion
      can distinguish a retyped byte-identical copy from the constant.
- [ ] **6.** **L5 and L6 did not move.** `src/core/digest.js` and
      `src/core/dream/promote.js` are absent from
      `git diff --name-only main...HEAD`, and the digest banner's full-string
      pin in `tests/unit/digest.test.js` — parenthetical included — still passes
      with only its comment changed.
- [ ] **7.** **Machine-run RED (ADR-0042).** `npm run red-proofs` reports
      `RUN: PROVEN` and its Criteria roll-up carries three lines reading
      `WP-quarantine-banner-location criterion 1`, `… criterion 2` and
      `… criterion 3`, each `PROVEN` and each naming its Table C proof id.
      Three lines and not one, because each proof carries its own `criterion`.
- [ ] **8.** `WP-secret-fence-ep2-redact-arm` rows **Q1**, **Q2** and **Q9**
      each carry their byte-exact dated clause and no other edit; `git diff`
      shows one changed line per row and no other line in that file; **and each
      clause sits in that row's FOURTH cell, the `why` column** — the cell that
      carries the claim it scopes. The placement half is **V5's**, because a
      Table Q row is one line and the one-changed-line half cannot see a clause
      that landed in the wrong cell.
- [ ] **9.** Idempotence: `N/A — this package ships no command and writes
      nothing outside the repo; it changes the text of four rendered sentences.`
- [ ] **10.** `npm test` and `npm run lint` pass.

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

# V2 — the pointer sentence has exactly ONE author in src/, and every carrier
#      reaches it by name rather than retyping it. `grep -o | wc -l` counts
#      OCCURRENCES; `grep -c` counts matching LINES and would accept two copies
#      on one line.
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

# V5 — each amendment clause lands in the cell that carries the claim it scopes:
#      Table Q's FOURTH cell, the `why` column, measured per row under
#      Implementation notes. This is the ONLY check that can see it: a Table Q
#      row is ONE line, so a clause in the wrong cell is still "one changed
#      line" and acceptance criterion 8 passes on it. Each row id matches
#      exactly one line in that file (measured), and a row whose cell count is
#      not 4 fails loud rather than being read with a shifted index.
Q=docs/specs/done/WP-secret-fence-ep2-redact-arm.md
CLAUSE='Amended 2026-09-05 (`WP-quarantine-banner-location`)'
v5=0
if [ ! -f "$Q" ]; then
  echo "V5 MISSING DELIVERABLE: $Q"; v5=1
else
  for r in Q1 Q2 Q9; do
    hits=$(grep -cF "| **$r** |" "$Q")
    if [ "$hits" != 1 ]; then echo "V5 ROW $r MATCHES $hits LINE(S), expected 1"; v5=1; continue; fi
    row=$(grep -F "| **$r** |" "$Q")
    n=$(printf '%s\n' "$row" | awk -F' \\| ' '{print NF}')
    if [ "$n" != 4 ]; then echo "V5 ROW $r HAS $n CELL(S), expected 4"; v5=1; continue; fi
    if ! printf '%s\n' "$row" | awk -F' \\| ' '{print $4}' | grep -qF "$CLAUSE"; then
      echo "V5 CLAUSE NOT IN THE why CELL OF ROW $r"; v5=1
    fi
  done
fi
[ "$v5" = 0 ] && echo "V5 OK"
[ "$v5" = 0 ] || { echo "V5 RED"; exit 1; }

# V3 — the machine-run RED lane (criterion 7). REGRESSION-kind on the untouched
#      tree: it exits 0 there with the five already-declared proofs PROVEN. What
#      discriminates is the CONTENT — the three roll-up lines naming this WP,
#      which cannot appear until the declarations and the three identities exist.
#      Run it where `node_modules` is a real directory: the lane refuses a
#      symlinked one by design (Implementation notes).
npm run red-proofs

# V4
npm test
npm run lint
```

- **V1 and V2 are lexical guards, and that is all they are.** Neither can
  establish that a sentence is *rendered* rather than merely present; that is
  what criteria 1–4 and the review gates are for. Observe and paste all three
  states for each: **deliverable absent** (a carrier renamed away → red),
  **compliant** (→ green), **violating** (the sentence retyped in a second place
  → V1 green, V2 red). Each was produced by extracting this fenced block from
  this file and piping it to a shell, so the shipped escaping is exercised
  rather than described. Measured, four trees: **untouched `8302ce8e`** → three
  `V1 SHELF CLAIM SURVIVES` lines, `V2 SENTENCE HAS 0 AUTHOR(S)`, three
  `V2 NOT WIRED`, `V1/V2 RED`, `rc=1`; **rehearsal tree carrying the fix** →
  `V1 OK`, `V2 OK`, `rc=0`; **`src/core/dream/warnings.js` removed** → two
  `MISSING DELIVERABLE` lines, `rc=1`; **the sentence retyped once more under
  `src/cli/`** → `V1 OK`, `V2 SENTENCE HAS 2 AUTHOR(S) IN src/, expected 1`,
  `rc=1`.
- **V5 is a PLACEMENT check and nothing else.** It cannot judge whether a clause
  is correct, only that it sits in the cell whose claim it talks about. Extracted
  from this block and run in four trees built from `8302ce8e`: **clause absent**
  → three `V5 CLAUSE NOT IN THE why CELL OF ROW …` lines, `V5 RED`, `rc=1`;
  **each clause appended to its row's cell 4** → `V5 OK`, `rc=0`; **each clause
  appended to its row's cell 2 instead** — the literal reading of the Q18
  precedent, and the exact mistake this step exists to catch — the same three
  lines, `V5 RED`, `rc=1`; **the file renamed away** →
  `V5 MISSING DELIVERABLE: docs/specs/done/WP-secret-fence-ep2-redact-arm.md`,
  `V5 RED`, `rc=1`. On the cell-4 tree `npm run lint` also stays at
  `Linting: 636 file(s)`, `0 error(s)` — appending inside a table cell adds no
  line and trips no rule.
- **The six existing tests that break are the work, not a surprise.** Rehearsed
  on a `git archive` copy of `8302ce8e`: `tests 2618 / pass 2600 / fail 6`, the
  six being the two `ledger.test.js` full-string pins, the two
  `dream-warnings.test.js` assertions, the one `doctor.test.js` CLI line and
  the one `dream.test.js` integration substring. If a seventh breaks, something
  outside Table L moved and it is a finding, not a fixture to update.

## Out of scope (do NOT do these)

- **`src/core/digest.js`'s pending-review banner** — row **L5**. It satisfies
  L0 already. What it cannot do is announce a withheld note whose only copy is
  on the `redacted/` shelf: `listSecretQuarantine` excludes subdirectories by
  design and the preservation record is never persisted, so nothing durable
  knows that file is an only-copy. **Proposed successor, not yet filed:**
  `WP-quarantine-only-copy-shelf`, which would decide whether such a copy is
  moved to the withheld shelf, recorded durably, or exempted from the retention
  cap. It needs a product decision and it is not this package's.
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
- **A RED proof for `doctor.js`'s carrier** — see Table C's residual paragraph.
  Adding one means a second declaration file and a spawn-per-phase run for a
  one-line literal already covered by V1, V2 and its own CLI pin.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including V1's and V2's three states each and V3's three roll-up lines.
2. Conventional commits; PR titled
   `fix(dream): stop the ledger-derived banners naming a quarantine shelf (WP-quarantine-banner-location)`.
3. PR template filled, including "Decisions made" (or "none"), "Discovered
   issues" (the remediation-value defect above), and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
