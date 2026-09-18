---
id: WP-quarantine-only-copy-shelf
title: Decide what the redacted shelf owes a copy that is the only one of a note's pre-scrub content
status: Draft
model: opus
size: S
depends_on: [WP-quarantine-banner-location]
adrs: [ADR-0004, ADR-0031, ADR-0034, ADR-0042]
epic: dream-promotion
---

# WP-quarantine-only-copy-shelf: what the `redacted/` shelf owes an only-copy

> **Matured from a Draft stub 2026-09-18.** Every claim below was re-derived
> against `main` at **`c05a575b`** — construct by construct, with the code read
> and the behaviour measured, not inherited from the stub. The stub's three
> routed questions are **live**: nothing in `docs/specs/done/` and no ADR has
> decided them. The measurement changed the shape of the answer, and the change
> is the point of this revision — see **Table O row O1**.
>
> **`model: opus` is retained deliberately.** The build is small, but two of its
> four deliverables are user-facing sentences about irrecoverable data loss that
> must be exact without overclaiming, and its one new test turns on a
> "these bytes exist nowhere" search that is trivial to write vacuously.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004)** — the product installs and writes files;
nothing is started, and nothing outlives the call that made it. No deliverable
here may add a daemon, a server, a scheduled sweep or telemetry.

The nightly **dream** consolidates recent sessions into the user's **vault** (a
local git repo of markdown notes). Before the dream commits, its **EP2
staged-output secret gate** (ADR-0034, `src/core/dream/validate.js`) scans the
lines this run added to each note and does one of three things:

1. **Promote** — nothing found, the note is committed as written.
2. **Redact in place** — findings, none of them hard/quarantine-severity. The
   gate **preserves the unredacted original first**, then rewrites only the
   added lines to `[REDACTED:<label>]` and commits the sanitized note.
3. **Withhold** — a hard finding, or unscannable (binary / lossy-UTF-8) content,
   or a redact attempt that could not complete. The note is **not** committed;
   the flagged copy is preserved and the vault file is left at its baseline.

Those preserved copies live on **two shelves** under the user's core, both `0700`
directories holding `0600` files with the raw bytes intact, outside the vault and
never committed (`docs/THREAT-MODEL.md:124`, `c05a575b`):

- **`state/quarantine/`** — the **withheld** shelf. **Unbounded**: kept "for as
  long as the owner leaves it there" (`docs/GLOSSARY.md:141-144`). Announced by
  the digest's pending-review banner, which `src/core/digest.js`'s
  `listSecretQuarantine` (`src/core/digest.js:854-865`) feeds from that
  directory's **direct file entries only**.
- **`state/quarantine/redacted/`** — the shelf this package is about. Holds the
  **pre-scrub original** of a note the gate rewrote and committed. **Bounded at
  50** and pruned opportunistically. **No banner announces it** — by design; the
  dream report names each copy instead, in the run that creates it.

The retention contract for the bounded shelf is **Table N** of
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, and it ships as
`pruneRedactedOriginals` (`src/core/dream/validate.js:1176-1201`) reached through
the `pruneRedacted` closure (`src/core/dream/validate.js:1558-1560`), which
`src/cli/dream.js:1102` invokes exactly once per run after `promote()` returns.
Table N's seven rows are reproduced verbatim in **Current state** below, because
this spec's reader must not have to open that package.

**The question this package settles is what that cap owes a copy that is the
ONLY surviving copy of a note's pre-scrub content.** The stub framed four
candidate answers: (a) delete anyway, bounded loss by design; (b) refuse to prune
below a floor of only-copies; (c) mark and warn before deleting; (d) something
the code already implies. **The measurement collapses that space, and Table O is
where the collapse and its consequences are decided.**

## Current state

Everything in this section was read at `c05a575b`. Line numbers are pinned to
that commit and a dispatch must re-derive them (see **Definition of done**).

### The one write into the shelf

There is **exactly one** site in `src/` that creates a file on
`state/quarantine/redacted/` — the redact arm, `src/core/dream/validate.js:1416`:

```js
        redactCopy = quarantinePreserve(stateDir, afterBytes, rel, date, 'redacted');
        if (redactCopy) redactedCreated.add(redactCopy.name);
        const sanitized = redactCopy ? scrubAddedLines(nums, redactCopy.bytes) : null;
```

`quarantinePreserve(stateDir, content, rel, date, kind)`
(`src/core/dream/validate.js:936`) writes to
`<stateDir>/quarantine/redacted/` when `kind === 'redacted'` and to
`<stateDir>/quarantine/` when `kind === 'withheld'`, names the file
`<date>-<sanitized note basename><ext>` with a `-1`, `-2` … suffix on collision,
and returns `{name, bytes}` or `null` on any failure.

The arm's own comment states the design rule it exists for
(`src/core/dream/validate.js:1411-1415`):

```text
── The redact arm. Preserve the unredacted original FIRST, then scrub
   only the lines this run added, against the very bytes that were
   preserved. NEVER REDACT A NOTE WHOSE ORIGINAL COULD NOT BE PRESERVED:
   that is the permanent-corruption outcome this design exists to avoid.
   Anything short of a verified scrub falls through to the withhold.
```

### The two deletes over shelf files

**Delete 1 — the identity-gated delete**, `src/core/dream/validate.js:1489-1504`.
On the refuse fall-through only, and it removes the shelf copy **only when a
byte-identical withheld copy demonstrably exists**:

```js
      let identical = false;
      if (preserved) {
        try {
          identical = Buffer.compare(
            fs.readFileSync(path.join(stateDir, 'quarantine', REDACTED_SUBDIR, redactCopy.name)),
            fs.readFileSync(path.join(stateDir, 'quarantine', preserved.name))
          ) === 0;
        } catch { identical = false; }
      }
      if (identical) {
        try {
          fs.rmSync(path.join(stateDir, 'quarantine', REDACTED_SUBDIR, redactCopy.name), { force: true });
        } catch { /* best-effort: a stale duplicate, not a hazard */ }
      } else {
        record.push({ artifact: redactCopy.name, location: `quarantine/${REDACTED_SUBDIR}` });
      }
```

Its own comment names what the keep branch is protecting
(`src/core/dream/validate.js:1478-1481`): anything other than proven identity
KEEPS the copy, "because it is then **the only copy of a version of the user's
note that exists anywhere**."

**Delete 2 — the retention prune**, `src/core/dream/validate.js:1176-1201`,
reproduced in full because every row of Table O turns on it:

```js
function pruneRedactedOriginals(stateDir, created) {
  if (!stateDir) return;
  try {
    const dir = path.join(stateDir, 'quarantine', REDACTED_SUBDIR);
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
    let total = entries.length;
    if (total <= REDACTED_RETENTION_CAP) return;
    const candidates = entries
      .filter((e) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}-/.test(e.name) && !created.has(e.name))
      .map((e) => { /* … stat for mtimeMs, unreadable → 0 … */ })
      .sort((a, b) => (a.mtimeMs - b.mtimeMs) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const c of candidates) {
      if (total <= REDACTED_RETENTION_CAP) break;
      try { fs.rmSync(path.join(dir, c.name), { force: true }); total -= 1; }
      catch { /* best-effort */ }
    }
  } catch { /* best-effort: a failed prune never fails the arm */ }
}
```

`REDACTED_RETENTION_CAP = 50` (`src/core/dream/validate.js:663`). **It carries no
only-copy predicate of any kind.** Its only exclusion is `created` — the set of
basenames *this* run wrote.

### Table N, verbatim (`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1748-1765`)

Reproduced so the reader need not open that package. **It governs; this is a
registered mirror of it and may not disagree with it.**

| # | fact | value |
|---|------|-------|
| **N1** | **the cap** | **50** files in `state/quarantine/redacted/`. Owner-approved (the second `OWNER-RATIFIED` blockquote names the number and the choice to bound `redacted/` while leaving `quarantine/` unbounded) |
| **N2** | **the trigger** | the prune runs **once per gate run**, **and only if at least one B4 completed**. The **precondition** is the `pruneRedacted` closure `makeGates()` returns, which prunes only when its run-scoped completed-redaction counter is above zero; the **timing** is the pipeline's — `src/cli/dream.js` invokes that closure exactly once per run, unconditionally, after `promote()` returns. A run that completed no redaction does **not** prune. **Never after a bare preserve**, so B5/B5a fall-throughs never prune |
| **N3** | **the candidate set** | regular files in `redacted/` matching `^[0-9]{4}-[0-9]{2}-[0-9]{2}-`, **minus every basename this run created**. The exclusion is the whole set the run wrote, not the last one |
| **N4** | **the ordering** | `(mtimeMs, name)` ascending over N3's candidates. `mtimeMs` first because filenames are `<date>-<basename>` and sort by *basename* within a date; `name` second only to break ties |
| **N5** | **the precedence when N1 and N3 conflict** | **N3 WINS; the cap yields.** Delete oldest candidates until at most N1 remain **or no candidate is left**, whichever comes first. A run creating more than N1 originals therefore ends **above** the cap, holding exactly its own copies |
| **N6** | **the overshoot's lifetime** | **until the next run that completes at least one B4** — not "the next run". A zero-redaction run does not prune (N2), so it cannot clear an overshoot. The bound is therefore *"at most N1, or the size of the most recent redacting run's output"*, and it is not time-bounded |
| **N7** | **failure** | best-effort. A failed prune is ignored and the arm still completes |

### Who else reads the shelf

Measured by `grep -rn "redacted" src bin --include='*.js'` at `c05a575b`:
outside `src/core/dream/validate.js`, the **only** code that touches
`state/quarantine/redacted/` is `src/core/private-fs.js` — it creates the
directory (`:115`) and its read-only insecure-modes scan walks it for **file
modes** (`:670-671`), reading no contents and deciding nothing about which files
are there. `src/core/digest.js:848-856` documents that the withhold banner
**deliberately** excludes the subdirectory. Nothing in `src/` records, counts,
ages, sizes or announces the shelf's contents, and the preservation record the
gate returns is never persisted past the run.

### What the user is already told

`docs/runbooks/secret-incident.md:49-63` already discloses the cap in plain
language — this package must not pretend otherwise:

> **There is no banner for this one:** it is announced in that night's dream
> report (`reports/dreams/<date>.md`, under "Redacted in place (secret
> scan)"), so that is where to look. The folder keeps roughly the 50 most
> recent copies and then deletes the oldest, so review a redaction within
> about two months rather than leaving it indefinitely — right after a run
> that rewrote a great many notes it can briefly hold more, because a run
> never deletes its own copies.

`docs/GLOSSARY.md:141-150` calls the shelf's contents **"disposable"**, scoped in
the same sentence to `wienerdog uninstall` removing them.

### Existing tests over this surface

`tests/unit/dream-validate.test.js`, the **AC-14** block at `:3708-3844`, holds
five retention tests with helpers `seedRedacted(f, n, mtimeBase)`,
`seedNotes(f, n, tag)`, `redactFixture(rel?)`, `RUN(mod, f, opts?)`,
`lsRedacted(f)`, `redactedDir(f)`, and the constant `CAP = 50`:

- `'EP2 retention: the prune evicts by (mtimeMs, name), not by filename alone'`
- `'EP2 retention: a run NEVER evicts its own copies, even when they are the oldest by both keys'`
- `'EP2 retention: above the cap, the cap YIELDS; a zero-redaction run leaves the overshoot'`
- `'EP2 retention: above the cap from a FULL directory, the run keeps exactly its own copies'`
- `'EP2 retention: a B5/B5a fall-through never prunes, and the prune stays inside redacted/'`

Two more tests elsewhere in that file are load-bearing here and are **cited, not
duplicated** (a second copy of an assertion another package owns is how they
drift — `tests/unit/dream-validate.test.js:2039-2041`):

- `'EP2 redact arm R8: preserve, scrub only the added lines, commit, count separately'` (`:1570`) already asserts `listSecretQuarantine(f.stateDir)` is `[]` after a successful redaction (`:1594`) — i.e. **no withheld twin accompanies a redact success**.
- `'dream-validate: EP2 redact arm R0b (untracked|tracked): a durable copy EXISTS, so the run is recoverable and does NOT abort'` (`:2052`) drives the refuse fall-through with `failWithheldPreserveOnly(f)` and asserts the surviving shelf copy is announced on the preservation record while nothing is promoted.

`npm run red-proofs` runs `scripts/red-proofs.js` over declarations in
`tests/red-proofs/*.proofs.json` (ADR-0042). The adjacent
`tests/red-proofs/ep2-prune-once-per-run.proofs.json` proves Table N row N2.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/dream-validate.test.js | add **exactly one** test, `[OC-1]`, at the end of the AC-14 block (after `:3844`). Reuse the existing helpers; add no new helper and change no existing test |
| create | tests/red-proofs/quarantine-only-copy-shelf.proofs.json | **one** RED declaration, `shelf-copy-gains-a-withheld-twin` (Table O row O9) |
| modify | docs/runbooks/secret-incident.md | **one** clause inside the existing bullet at `:57-59` (Table O row O8a). No other edit to this file |
| modify | docs/GLOSSARY.md | **one** clause inside the existing `secret quarantine` entry at `:141-148` (Table O row O8b). No other edit to this file |

**`src/` IS NOT IN THIS TABLE, and that is the package's central decision, not an
omission.** See Table O rows O5, O6 and O7 and the owner items.

### Exact contracts

**The new test.** Its name is a contract — the RED declaration names it as a
string, so a changed name silently unhooks the proof:

```
EP2 retention [OC-1]: the prune destroys an ONLY copy — the shelf holds the sole pre-scrub form, and after the cap fires those bytes exist nowhere (Table O rows O1, O2)
```

Fixture shape, chosen so the evicted file is a **real product of the redact arm**
and not a hand-seeded blob (a seeded blob would prove the eviction but not that
an only-copy was destroyed):

1. Build `redactFixture()`. Drive one redacting run at date `2026-07-01` so the
   shelf holds **one real pre-scrub original**, `R`. Read `R`'s bytes; set its
   mtime to the oldest value in the fixture.
2. `seedRedacted(f, 49, <newer mtime base>)` — 49 date-prefixed dummies, all
   newer than `R` by mtime, so `R` is the unique oldest candidate under Table N
   row N4. Shelf total: **50**. Assert the prune has not fired (Table N row N1).
3. Drive a second redacting run at date `2026-07-02` (`publish: true`), which
   creates its own copy and then prunes. Shelf total before the prune: **51**.

Assertions, each carrying its literal signal substring in the assertion message
so a RED run can attribute the failure:

- `[O1-shelf-holds-the-sole-pre-scrub-form]` — `R`'s bytes equal the note's
  pre-scrub content; the vault holds the **scrubbed** form for that note; and
  `listSecretQuarantine(f.stateDir)` is `[]`, so nothing on the withheld shelf
  holds them either.
- `[O2-the-prune-destroys-an-only-copy]` — after the second run the shelf holds
  exactly `CAP` files, `R`'s basename is **gone**, and a recursive walk of the
  **whole** `f.stateDir` tree finds **no file** whose contents `Buffer.compare`
  equal to `R`'s bytes. The walk must visit every file under `stateDir` (not just
  the two shelves) and must assert a non-empty set of visited files first, so an
  empty walk cannot pass vacuously.

**The RED declaration**, `tests/red-proofs/quarantine-only-copy-shelf.proofs.json`:

```json
{
  "suite": "tests/unit/dream-validate.test.js",
  "proofs": [
    {
      "id": "shelf-copy-gains-a-withheld-twin",
      "wp": "WP-quarantine-only-copy-shelf",
      "criterion": "1",
      "why": "row O1 is the premise every other row rests on: the redact-success arm writes to the redacted/ shelf and to NOTHING else, so the shelf copy is the sole surviving pre-scrub form and the prune's eviction is a total loss. Giving that arm a second, withheld preserve makes the bytes survive the eviction, which reddens [OC-1]'s O2 walk and its O1 empty-withheld-listing assertion, and reddens R8's own empty-listing assertion at the same site",
      "file": "src/core/dream/validate.js",
      "find": "        redactCopy = quarantinePreserve(stateDir, afterBytes, rel, date, 'redacted');",
      "replace": "        redactCopy = quarantinePreserve(stateDir, afterBytes, rel, date, 'redacted'); quarantinePreserve(stateDir, afterBytes, rel, date, 'withheld'); /* RP_MUT_OC_SHELF_GAINS_A_WITHHELD_TWIN */",
      "marker": "RP_MUT_OC_SHELF_GAINS_A_WITHHELD_TWIN",
      "occurrences": 1,
      "expectRed": [
        {
          "test": [
            "EP2 retention [OC-1]: the prune destroys an ONLY copy — the shelf holds the sole pre-scrub form, and after the cap fires those bytes exist nowhere (Table O rows O1, O2)",
            "EP2 redact arm R8: preserve, scrub only the added lines, commit, count separately"
          ],
          "signal": "O1-shelf-holds-the-sole-pre-scrub-form"
        }
      ]
    }
  ]
}
```

**Both declared tests are expected to redden, and the second one is another
package's.** That is deliberate and it is the honest declaration: the mutation
adds a withheld twin on the redact-success path, and
`tests/unit/dream-validate.test.js:1594` asserts there is none. **If the lane
reports any red beyond these two, the mutation is too broad — narrow it and
record the narrowing under "Decisions made"; do not widen `expectRed` to absorb
a surprise.**

**The two doc clauses.** Both are single clauses inside existing sentences. They
state the loss and nothing more; **neither may promise a warning, a banner, a
record or a recovery path**, because this package ships none (Table O rows O5–O7).

- `docs/runbooks/secret-incident.md:57-59`, inside the existing sentence
  beginning "The folder keeps roughly the 50 most recent copies": add that the
  deleted file is **the only copy of that original** — once it is gone the
  pre-scrub text is not recoverable from anywhere, because the note in your vault
  holds only the redacted form.
- `docs/GLOSSARY.md:141-150`, inside the `secret quarantine` entry, beside
  "disposable": say that each file there is the **only** surviving copy of that
  note's pre-scrub text, so the cap's eviction is an irreversible loss rather
  than the removal of a spare.

## Contract reference

**Activation trigger (ADR-0031's 2-of-7): four of seven fire.**
(ii) a **status taxonomy** is introduced — the only-copy class and the three
shelf states it partitions into; (iv) **precedence** behaviour is decided —
whether the cap yields to only-copy status; (v) an **authority boundary** is
crossed — the EP2 gate writes the copy, and a *different* call in a *later* run
owns its lifecycle with no record passing between them; (vi) **multiple
successor specs** inherit the result — three routed questions from three
packages, with owner items in two of them.

**Table letter.** Measured at `c05a575b` with
`grep -rhoE '^### Table [A-Z]+\b' docs/specs/`: **every letter A–Z is in use
except `I`**, and `I` is rejected by the recorded convention
(`docs/specs/done/WP-dream-promote-report.md:356-372` — `I1` misreads as `11` or
`Il` in prose). So this table **takes a documented collision**, as that same
ruling settled. **`O` is chosen** — mnemonic for *only-copy* — and its single
collision tree-wide is
`docs/specs/done/WP-secret-scan-baseline-oracle.md:592` ("Table O — canonical:
what makes the frozen oracle trustworthy"), a Done package about the detector's
frozen oracle with no shelf, retention or quarantine content. **Mitigation:
every citation of either table is path-qualified.**

**A NAMESPACE WARNING, because the collision is easy to make in prose.**
`docs/specs/done/WP-quarantine-disposal-durability.md` has **owner items** named
**O9** and **O10**. Those are owner items, not table rows. This spec's rows are
**O1–O9** and are always written "Table O row O*n*"; that package's items are
always written "owner item O9 / owner item O10". They are unrelated.

### Table O — canonical: what the bounded `redacted/` shelf owes an only-copy

*(`docs/specs/WP-quarantine-only-copy-shelf.md`. Measurements `OC-P1`–`OC-P4`
were taken at `c05a575b` by driving `makeGates({stateDir}).secret(…)` and
`.pruneRedacted()` directly — the same entry points
`tests/unit/dream-validate.test.js:242` uses. They are reproducible from this
spec's fixture description and are re-derived by deliverable `[OC-1]`.)*

| # | Fact / rule | Value |
|---|-------------|-------|
| **O1** | **THE SHELF'S TYPE — the measurement that reshapes the question.** Is "only-copy" a predicate that *partitions* `state/quarantine/redacted/`? | **NO. Every file that survives on the shelf is, by construction, the only surviving copy of the bytes it holds.** Derivation: there is exactly **one** write site (`src/core/dream/validate.js:1416`) and exactly **one** in-gate delete (`:1489-1504`), and that delete fires **only** on proven byte-identity with a surviving withheld copy — i.e. it removes precisely the files that are *not* only-copies. The redact-success arm writes **no** withheld copy at all. Measured (`OC-P1`): after one successful redaction the shelf holds the pre-scrub bytes, `listSecretQuarantine(stateDir)` is `[]`, the withheld directory has no file entries, and the vault gets `ref [REDACTED:high-entropy] …`. **So "only-copy" is not a subset of the shelf; it is the shelf's type.** The code says so in its own words at `:1480-1481`: keeping the copy is right "because it is then the only copy of a version of the user's note that exists anywhere" |
| **O2** | **WHAT THE PRUNE THEREFORE IS.** | `pruneRedactedOriginals` is **the only code path in `src/` that destroys an only-copy.** Every other delete over these bytes is gated on a proven surviving twin. Measured (`OC-P2`), accumulating 50 shelf copies through 50 real runs and then running a 51st: the shelf sits untouched at 50; the 51st run takes it to 51; the prune evicts exactly the oldest; a full walk of the core `state/` tree then finds those bytes **nowhere**, and `listSecretQuarantine` is `[]`. No record, report, banner or file names the artifact that was destroyed |
| **O3** | **DOES THE SHIPPED "never destroy the only copy" RULE ALREADY BIND THE PRUNE?** | **NO — and this was checked against the governing text, not inferred.** The rule is the **only-copy invariant**, `docs/specs/done/WP-dream-promote-module.md:703` Table Q row **Q4**: *"nothing may destroy **the working copy of a note** unless some durable artifact byte-identically holds THE BYTES THAT ARE THERE NOW … **the invariant binds the pipeline's teardown too**"*. Its protected object is the **working copy in the workspace**; a shelf copy is the thing that *satisfies* the invariant, never the thing it protects. `docs/specs/done/WP-preservation-abort-widening.md:107-121` restates the scope as *"every party that could destroy a **working copy**"*, and its Table P enumerates its parties as the gate's arms, `promote()` and pipeline teardown — **`pruneRedactedOriginals` is not among them.** `docs/specs/done/WP-quarantine-preserve-durability.md:944` Table F row **F7(a)** puts *"`pruneRedactedOriginals`' evictions"* **permanently outside** its own scope. `docs/specs/done/WP-quarantine-failed-preserve-disposal-flush.md:499-504` routes the prune's selection and persistence questions **here** by name. **The rule as sited is write-time, single-invocation and scoped to the bytes this run is judging; the prune is a cross-run delete over other runs' bytes that consults no record.** It does not reach it |
| **O4** | **HAS ANY LATER PACKAGE OR ADR DECIDED THE QUESTION?** | **NO.** Swept at `c05a575b` over `docs/specs/`, `docs/specs/done/`, `docs/adr/` and `docs/specs/logbook/`. No ADR mentions an only-copy, the retention cap or `REDACTED_RETENTION_CAP` at all. Three packages measured the loss and each **explicitly reserved the answer to this file**: `docs/specs/done/WP-quarantine-banner-location.md:1415-1426` (naming the three candidate answers — *"moved to the withheld shelf, recorded durably, or exempted from the retention cap"*), `docs/specs/done/WP-quarantine-disposal-durability.md:644-648`, and the owner ruling at `docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md:52-55` (*"Ruled: routed, not absorbed"*). **The question is live** |
| **O5** | **CANDIDATE (b) — refuse to prune below a floor of only-copies.** | **REJECTED, by measurement rather than by taste.** By row **O1** the floor is the entire shelf, so (b) is exactly *"never prune"* — which deletes the cap. The cap's value is owner-approved (Table N row **N1**) and this package is forbidden to re-litigate it. Measured cost of adopting it (`OC-P4`): a single run that redacts 60 notes leaves 60 and no later run ever reduces them; growth is bounded only by how much the user writes. **(b) is not a middle option; it is the cap's repeal wearing a predicate** |
| **O6** | **CANDIDATE (c) — mark and warn before deleting.** | **REJECTED in both halves, for different reasons.** *Mark:* vacuous by row **O1** — a mark every file carries distinguishes nothing. *Warn:* not vacuous, but unbuyable at the price this package may pay. `reports/warnings.md` cannot carry the line: `composeWarnings` is **a pure function of the transcript ledger alone** and that purity is a stated contract (`src/core/dream/warnings.js:21-26`: *"THE RENDER IS A PURE FUNCTION OF THE LEDGER ALONE … no byte a user leaves in the file can be laundered into Wienerdog's own render"*), so a warning line needs a **new durable per-artifact ledger record class**. The digest's pending-review banner cannot carry it either: it is the **withheld** shelf's by design (`src/core/digest.js:848-856`), and pointing it at `redacted/` reverses a shipped decision. Both are new durable state, which the stub required be priced rather than assumed, and both are larger than this package |
| **O7** | **CANDIDATE (d) — what the code already implies, and the limit of it.** | **PARTLY TRUE, and the part that is true is load-bearing.** The dream report **already names every shelf copy in the run that creates it**: the gate returns `preserved: [{artifact, location: 'quarantine/redacted'}]` (`src/core/dream/validate.js:1431`) and `redactionLine` renders it (`src/core/dream/promote.js:733-748`). And the user-facing runbook **already discloses the cap** (`docs/runbooks/secret-incident.md:57-59`: *"keeps roughly the 50 most recent copies and then deletes the oldest, so review a redaction within about two months"*). **What is NOT implied anywhere:** that the deleted file is the *only* copy — the runbook implies loss without naming it as total — and there is no notice **at deletion time**, which by rows **O2** and **O6** cannot be added without new durable state |
| **O8** | **THE DECISION — candidate (a), delete anyway, and say so.** | **(a) IS ALREADY THE OWNER'S DECISION, and row O1 is why:** approving a count cap on a shelf whose every file is an only-copy **is** approving the bounded destruction of only-copies. This package does not re-decide it; it makes the bargain legible and pins the premise. It ships **(O8a)** one clause in `docs/runbooks/secret-incident.md` naming the loss as total, **(O8b)** one clause in `docs/GLOSSARY.md` beside *"disposable"* saying each file is the sole surviving pre-scrub copy, and **(O8c)** the `[OC-1]` test that pins row **O1**. **Why the test is the real deliverable:** rows O3–O7 and both accepted residuals all rest on O1, and O1 is a property of the *design* (one write site, one identity-gated delete) that no current test states. A future second write into `redacted/`, or a second delete, would falsify it **silently** and turn two accepted residuals into wrong ones |
| **O9** | **WHAT DOES NOT SHIP, and why it is an owner item rather than a fold-in.** | The **selection guard** of owner item **O9** in `docs/specs/done/WP-quarantine-disposal-durability.md:90-130` — refusing to prune while the pruning run's own `created` set has reached the cap — is **recommended and NOT taken here**. It changes Table N rows **N3** and **N5**, which are contract rows of a `Done` package, and the stub's own rule is that such a change is an owner item with a recommendation and a cost of overruling, never a fold-in. See **Dispatch precondition — owner items**, item 2 |

### Mirrored Surface Checklist

Every surface in this spec that mirrors **Table O** or **Table N**. A finding
against either table updates the table **and every surface below in the same
commit** (update-all-mirrors); a mirror discovered in review is added here in
the same pass (register-new-mirrors).

Mirrors of **Table N** (canonical source:
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1748-1765`) — this spec owns
none of it and may only reproduce it:

- [ ] **Current state → "Table N, verbatim"** — the seven-row reproduction
- [ ] **Current state → "The two deletes over shelf files"** — the N3/N4/N5 behaviour restated as code
- [ ] **Context** — "bounded at 50 and pruned opportunistically"
- [ ] **Table O rows O5, O9** — the cells that cite N1, N3, N5

Mirrors of **Table O** (canonical source: this file):

- [ ] **Deliverables-table cells** — the `[OC-1]` row (cites O1, O2), the proofs-file row (cites O9), and both doc rows (cite O8a, O8b)
- [ ] **Exact contracts → the new test** — the `[O1-…]` and `[O2-…]` assertion signals and the fixture shape (mirror O1, O2)
- [ ] **Exact contracts → the RED declaration** — its `why` field and `signal` (mirror O1)
- [ ] **Exact contracts → the two doc clauses** — the prohibition on promising a warning, record or recovery (mirrors O5, O6, O7)
- [ ] **Current state → "Who else reads the shelf"** and **"What the user is already told"** (mirror O2, O7)
- [ ] **Acceptance criteria 1–5** (mirror O1, O2, O8a, O8b, O9)
- [ ] **Verification steps** — the two greps and the `[OC-1]` pattern (mirror O8a, O8b, O8c)
- [ ] **Implementation notes** — the vacuous-walk trap (mirrors O2) and the no-`src/` constraint (mirrors O8, O9)
- [ ] **Out of scope** — the (b)/(c) exclusions (mirror O5, O6)
- [ ] **Dispatch precondition — owner items** — items 1, 2 and 3 (mirror O8, O9, and O6/O7 respectively)

## Implementation notes & constraints

- **Do not touch `src/`.** No deliverable changes product behaviour. If the test
  you write fails against `c05a575b`, the spec is wrong and the answer is to say
  so — not to change the gate. Report it under "Discovered issues".
- **THE VACUOUS-WALK TRAP, and it is the specific way this test fails silently.**
  `[OC-1]`'s O2 half asserts the absence of some bytes across a directory tree.
  A walk that throws and is swallowed, that starts at a path that does not exist,
  or that skips subdirectories, finds nothing and **passes**. Assert first that
  the walk visited a **non-empty** set of files, and that it found `R`'s bytes
  **before** the prune, in the same run of the same walk function. An absence
  assertion whose corresponding presence was never demonstrated is not a
  measurement (ADR-0042's own account of the false-green class).
- **No new test helper.** `redactFixture`, `RUN`, `seedRedacted`, `seedNotes`,
  `lsRedacted`, `redactedDir`, `CAP` and `listSecretQuarantine` are all already
  in scope in `tests/unit/dream-validate.test.js`. Adding a sixth helper to a
  block that has five is scope creep; the recursive walk is a local `const`
  inside the test.
- **Distinct mtimes are a precondition, not a detail.** Table N row N4 sorts by
  `(mtimeMs, name)`. `seedRedacted` already writes descending mtimes; the real
  copy `R` must be given an mtime strictly older than all 49 so it is the unique
  oldest candidate. Without that, which file is evicted depends on filesystem
  timestamp granularity and the test is flaky rather than wrong.
- **The two doc clauses are user-facing text for knowledge workers** (CLAUDE.md).
  Plain language, no jargon, no file paths the runbook has not already given.
  Say what is lost; do not say what will warn you, because nothing will.
- **`npm run lint` checks frontmatter schema, markdownlint, shellcheck and
  shfmt.** The new `.proofs.json` is validated by
  `tests/unit/red-proofs.test.js` as part of `npm test`; a malformed declaration
  fails there, before the lane.
- **Ambiguity → choose the simpler option and record it under "Decisions made".**
  Do not expand scope to resolve it.

## Security checklist

- [ ] **No shelf file's CONTENT is read into any user-facing surface.** The two
      doc clauses are fixed English and name no file. `[OC-1]` reads shelf bytes
      only inside the test process, compares them with `Buffer.compare`, and
      **never** puts them in an assertion message — a failing assertion's output
      reaches CI logs, and these bytes are the fixture's simulated secret.
      Compare buffers and assert on booleans and basenames only.
- [ ] **No untrusted identifier flows into a filesystem path here.** The test's
      paths are composed from `path.join` over fixture-owned, code-supplied
      names (`2026-07-01`, `2026-07-02`, `old-NNN`); nothing derives from input.
      The RED declaration's `file` field is a repo-relative constant that the
      runner itself canonicalises and refuses if it escapes its fresh copy
      (ADR-0042, Decision 3) — do not parameterise it.
- [ ] **The recursive walk stays inside the fixture's `stateDir`.** Resolve each
      entry and assert it is still under `path.resolve(f.stateDir)` before
      reading, and do not follow symlinks (`fs.readdirSync(d, {withFileTypes:
      true})` plus `isDirectory()` / `isFile()`, which report on the link itself
      and so never recurse through one).
- [ ] **The doc clauses add no recovery instruction that could send a user to a
      path holding raw secrets** beyond the two the runbook already names.

## Acceptance criteria

- [ ] **1.** `[OC-1]` exists in `tests/unit/dream-validate.test.js` with exactly
      the name given under **Exact contracts**, passes, and asserts both signals
      `O1-shelf-holds-the-sole-pre-scrub-form` and
      `O2-the-prune-destroys-an-only-copy` (Table O rows O1, O2).
- [ ] **2.** `[OC-1]` demonstrates the presence of `R`'s bytes on the shelf
      **before** the prune and their absence from the whole `stateDir` tree
      **after** it, using the same walk, and asserts the walk visited at least
      one file (Table O row O2; the vacuous-walk trap).
- [ ] **3.** `tests/red-proofs/quarantine-only-copy-shelf.proofs.json` exists,
      is byte-for-byte the declaration under **Exact contracts** (modulo a
      narrowed `find`/`replace` recorded under "Decisions made"), and
      `npm run red-proofs` reports this package's criterion `1` as `PROVEN`
      with **no red outside the two declared tests** (Table O row O9's
      neighbouring discipline; ADR-0042).
- [ ] **4.** `docs/runbooks/secret-incident.md` states, inside the existing
      bullet, that the evicted copy is the **only** copy of that pre-scrub
      original and that the vault note holds only the redacted form
      (Table O row O8a). It promises **no** warning, banner or record.
- [ ] **5.** `docs/GLOSSARY.md`'s `secret quarantine` entry states that each
      file on the `redacted/` shelf is the sole surviving copy of that note's
      pre-scrub text (Table O row O8b). It promises **no** warning, banner or
      record.
- [ ] **6.** `git diff --stat` against the base commit touches **only** the four
      Deliverables paths plus this spec file. **`src/` is untouched.**
- [ ] **7.** `npm test` and `npm run lint` pass.
- [ ] **8. Idempotence:** `N/A — this WP ships one test, one RED declaration and
      two documentation clauses; it adds no command and writes nothing outside
      the repo.**

## Verification steps (run these; paste output in the PR)

```bash
# 1 — the new test, by name
npm test -- --test-name-pattern 'OC-1'

# 2 — the two tests the RED declaration names must both exist, spelled exactly
grep -c 'EP2 retention \[OC-1\]: the prune destroys an ONLY copy' tests/unit/dream-validate.test.js
grep -c 'EP2 redact arm R8: preserve, scrub only the added lines, commit, count separately' tests/unit/dream-validate.test.js

# 3 — the declaration is valid JSON and names this WP
node -e "const d=require('./tests/red-proofs/quarantine-only-copy-shelf.proofs.json');console.log(d.suite,d.proofs.length,d.proofs[0].wp,d.proofs[0].expectRed[0].test.length)"

# 4 — the RED lane, BARE and unfiltered (a filtered run is reported as filtered,
#     never as proven — ADR-0042 Decision 1)
npm run red-proofs

# 5 — the two doc clauses landed (Table O rows O8a, O8b)
grep -n 'only copy' docs/runbooks/secret-incident.md
grep -n 'only surviving copy' docs/GLOSSARY.md

# 6 — src/ is untouched; the boundary holds
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD | grep -c '^src/'   # must print 0

# 7 — the whole suite and the lint pipeline
npm test
npm run lint
```

## Out of scope (do NOT do these)

- **Changing `REDACTED_RETENTION_CAP`, or any row of Table N.** Owner-approved
  (row N1) and owned by `WP-secret-fence-ep2-redact-arm`. Table O row O5 rejects
  the floor candidate; do not implement it.
- **Taking the prune's selection guard** (`docs/specs/done/WP-quarantine-disposal-durability.md`
  owner item O9). Table O row O9 recommends it and parks it; it changes Table N
  rows N3 and N5 and is owner item 2 below.
- **Adding a warning line, a banner, a ledger record or any durable per-artifact
  state.** Table O row O6 rejects both carriers with their prices; ADR-0004
  forbids anything that keeps running.
- **Pointing the pending-review banner at `redacted/`, or widening
  `listSecretQuarantine`.** `src/core/digest.js` stays outside this boundary by
  owner ruling (`docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md:52-55`).
  The residual sentence in that banner — *"this notice clears when no withheld
  copies are left"*, false in one measured state — was accepted as a residual by
  `WP-quarantine-banner-location` and stays accepted; Table O row O6 explains why
  fixing it here would require the same new state.
- **Crash-durability of any removal.** Permanently excluded by
  `docs/specs/done/WP-quarantine-preserve-durability.md:944` Table F row F7(a),
  and a crash is not stageable.
- **Re-asserting what `EP2 redact arm R8` and `EP2 redact arm R0b` already
  assert.** Cite them; a second copy drifts.
- **Touching `src/core/dream/validate.js`'s comments**, including the one at
  `:659-663`. It is `src/`, and this package's boundary excludes `src/`.

## Dispatch precondition — owner items

Three items. **None was ruled on directly.** Each is **a recommendation adopted
under standing authorization, not a direct ruling** — the standing process is
recorded in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), carried forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under it,
and **the owner reverses it by dated amendment.** Nothing in this repo records
the owner approving, accepting or ratifying any of them, and this spec asserts no
such acceptance.

1. **Does the retention cap delete an only-copy anyway — candidate (a)?**
   *Recommendation: YES, and the reasoning is that the owner has already decided
   it.* By Table O row **O1** the shelf is a shelf of only-copies, measured; a
   count cap on such a shelf **is** a standing decision to destroy the oldest
   only-copy, and `REDACTED_RETENTION_CAP = 50` is owner-approved (Table N row
   N1). Candidate (b) is that decision's repeal (row O5) and candidate (c) is
   unbuyable without new durable state (row O6). What was genuinely missing is
   that **nothing said the loss was total** (row O7), and this package's two
   clauses say it. *Cost of overruling:* the shelf becomes unbounded (b) or the
   product grows a per-artifact ledger record class plus a second banner
   consumer (c) — in both cases a Table N amendment, an `src/` deliverable, and
   a package larger than `S` that this one would have to be split into.
   *Cost of accepting, stated rather than implied:* a user who does not read the
   dream report within roughly fifty redactions loses the pre-scrub text of the
   oldest note permanently, and nothing tells them at the moment it happens.

2. **Should the prune's selection guard be taken here?**
   *Recommendation: TAKE IT — but not in this package.* The measured defect is
   real and is **not** part of the cap's bargain: a lock-stealing overlapping run
   evicts another still-running invocation's **newest** shelf copy iff the
   pruning run's own `created` set has reached the cap (measured at fourteen
   sweep points in `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
   probes QD-P3/QD-P4: false at 0/10/48/49, true at 50/51/60), and **at 51 and
   above the eviction does not even reach the cap, so it is pure loss** while the
   other run's report names an artifact that is already gone. The smallest guard
   — refuse to prune while the run's own `created` set has reached the cap —
   closes exactly that case, adds no state, and is a strictly larger overshoot of
   a cap Table N row N5 already says yields. **It is parked because it changes
   Table N rows N3 and N5, which are contract rows of a `Done` package**; the
   stub's own rule is that such a change is an owner item, never a fold-in.
   *Cost of overruling (i.e. taking it here):* `src/core/dream/validate.js` and
   the AC-14 retention tests join this boundary, `src/` stops being untouched,
   the package leaves `S`, and Table N is amended by a package that does not own
   it. *Cost of accepting the park:* the measured loss stays open until a
   successor files. **Recommended home:** a new `S` package,
   `WP-ep2-prune-overlap-guard`, `depends_on: [WP-quarantine-only-copy-shelf]`,
   carrying the Table N amendment as its single contract change.

3. **Is an unrecorded shelf copy that no prune will ever remove acceptable?**
   *Recommendation: ACCEPT, and it is now accepted on a firmer basis than when
   it was routed.* Measured (`OC-P3`, `OC-P4`): a shelf of 20 and a shelf of
   exactly 50 are **never** pruned, and an overshoot left by one big run — 60
   copies from a single 60-redaction run — survives every later non-redacting run
   indefinitely, because Table N rows N2 and N6 make the prune conditional on a
   future completed redaction and put no bound on time. So a secret-bearing copy
   that no record names and no banner lists can persist without limit.
   **Why accept:** by row O1 that file is exactly what the shelf exists to hold,
   the shelf is bounded by count and not by age (row N1), and the user-facing
   runbook already tells the owner to review and delete
   (`docs/runbooks/secret-incident.md:49-63`). *Cost of accepting:* a user who
   inspects `state/quarantine/redacted/` can find a copy that no report, banner
   or record accounts for, and nothing tells them which it is. *Cost of
   overruling:* the only mechanism that removes the class is a reconciliation
   pass that enumerates the shelf and deletes whatever no record names — and
   **there is no such record** (`WP-quarantine-banner-location` row L5 measured
   that the preservation record is never persisted), so it needs new durable
   per-artifact state plus a delete pass over a **recovery** directory, which is
   the destructive-by-default shape this family has refused three times.

## Definition of done

1. **DISPATCH PRECONDITION.** (a) The three owner items above travel with this
   package as **recommendations adopted under standing authorization**; a
   reversal is applied by a committed revision of this spec, never by a dispatch
   message, because `scripts/boundary-check.js` reads the Deliverables table in
   this file. (b) **THE DESIGN GATE MUST CLOSE BEFORE THIS SPEC IS `Ready`**
   (`docs/runbooks/codex-review.md`); this revision has not yet been through it.
   **A closed design gate is a review gate, not owner approval** — the owner
   items stay open in the standing form either way. (c) **THE DISPATCHER
   RE-DERIVES EVERY CITATION.** All line numbers here are pinned to `main` at
   **`c05a575b`**; `src/core/dream/validate.js`, `src/core/digest.js`,
   `src/core/dream/promote.js`, `src/core/dream/warnings.js`,
   `tests/unit/dream-validate.test.js`, `docs/GLOSSARY.md` and
   `docs/runbooks/secret-incident.md` are all live files a sibling package could
   shift underneath this spec. Re-derive into a committed revision, not into a
   dispatch message. (d) Branch `wp/quarantine-only-copy-shelf`.
2. All verification steps pass locally; output pasted into the PR body, including
   the **bare unfiltered** `npm run red-proofs`, `npm test` and `npm run lint`.
3. Conventional commits; PR titled
   `test(dream): pin that the redacted shelf holds only-copies and name the cap's loss (WP-quarantine-only-copy-shelf)`.
4. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. **"Discovered issues" states plainly** that the prune's
   overlapping-run selection defect (owner item 2) is measured, untouched and
   still open.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
