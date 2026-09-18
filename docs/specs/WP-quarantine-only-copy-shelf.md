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

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **Matured from a Draft stub 2026-09-18.** Every claim below was re-derived
> against `main` at **`c05a575b`** — construct by construct, with the code read
> and the behaviour measured, not inherited from the stub. The stub's three
> routed questions are **live**: nothing in `docs/specs/done/` and no ADR has
> decided them.
>
> **REVISED at design-gate round 1 (Astra, 2026-09-18), all three findings
> ACCEPTED IN FULL, none dispositioned away.** Round 1's HEAVY finding showed
> the first revision's central premise FALSE: the shelf is **not** uniformly
> only-copies. Table O row **O1** now partitions it into three classes and every
> dependent row is re-derived per class; the decision — candidate (a) — survives,
> but the argument and the user-facing clauses are different. Dispositions:
> `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-review.md`.
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
EP2 retention [OC-1]: the prune destroys a SOLE-SURVIVING copy — a class-A original is evicted and its bytes then exist nowhere under the core (Table O rows O1, O2)
```

**Scope, set by design-gate round 1.** `[OC-1]` pins **class A** end to end (Table
O row O1). It does **not** assert a universal over the shelf, because classes B
and C exist and a class-C file is not an only-copy. Classes B and C are
established by code derivation in Table O row O1 and, for B, by the existing test
at `tests/unit/dream-validate.test.js:2052`; **do not add assertions for them
here.**

Fixture shape. **Three properties are load-bearing and each was measured against
`c05a575b`; a fixture missing any one of them cannot demonstrate the loss:**

1. Build `redactFixture()` (its note is `04-Atomic/fp.md`, content `REDACT_NOTE`).
   Drive one redacting run at date `2026-07-01` **with `publish: true`**, so the
   scrubbed bytes actually land in the vault. The shelf now holds **one real
   class-A original**, `R`. Read `R`'s bytes. Assert the run completed **exactly
   one** redaction. **Why `publish` is mandatory (`OC-P7`):** `RUN` defaults to
   `publish: false` (`tests/unit/dream-validate.test.js:235-239` — "OPT-IN: model
   the PUBLISH that follows the decision"), which leaves the note unchanged, so
   the vault never holds the scrubbed form and step 3 would re-judge the same
   secret.
2. `seedRedacted(f, 49, <mtime base NEWER than R>)`, then explicitly `fs.utimesSync`
   `R` to a strictly older time, so `R` is the **unique** oldest candidate under
   Table N row N4. Shelf total: **50**. Assert the prune has **not** fired
   (Table N row N1).
3. Write a **different** secret-bearing note into the vault before the second run
   — a distinct path **and a distinct secret token**, not a second copy of
   `REDACT_NOTE`. Drive the second redacting run at date `2026-07-02` with
   `publish: true`. Assert it completed **exactly one** redaction and that **its
   preserved original differs from `R`** (`Buffer.compare(...) !== 0`) *before*
   any absence assertion. Shelf total before the prune: **51**.
   **Why distinctness is mandatory (`OC-P5`):** the shelf does not deduplicate.
   Two runs over identical secret-bearing content leave **two byte-identical
   shelf files** (measured: `["2026-07-01-same.md","2026-07-02-same.md"]`, both
   byte-equal to `R`), so evicting `R` would leave its bytes on disk and the
   absence assertion could never pass.

Assertions, each carrying its literal signal substring in the assertion message
so a RED run can attribute the failure:

- `[O1-class-A-copy-is-the-sole-pre-scrub-form]` — `R`'s bytes equal the note's
  pre-scrub content; the vault holds the **scrubbed** form for that note; and
  `listSecretQuarantine(f.stateDir)` is `[]`, so no withheld twin exists. (This
  is class A's definition, not a claim about the shelf as a whole.)
- `[O2-the-prune-destroys-a-sole-surviving-copy]` — after the second run the
  shelf holds exactly `CAP` files, `R`'s basename is **gone**, and a recursive
  walk of the **whole** `f.stateDir` tree finds **no file** whose contents
  `Buffer.compare` equal to `R`'s bytes. The walk must visit every file under
  `stateDir` (not just the two shelves), must assert a non-empty set of visited
  files, and must be shown to **find** `R`'s bytes before the prune using the
  same walk function.

**The RED declaration**, `tests/red-proofs/quarantine-only-copy-shelf.proofs.json`.
**Redesigned at round 1 and MEASURED, not reasoned.** Two constraints drove it:
`expectRed[].test` is an **outermost-first identity PATH**, never a list of
independent tests (`scripts/red-proofs.js:693-694`), so two top-level names in one
array resolve to a nested test that does not exist and the BASELINE phase rejects
the proof (`:1599-1602`); and an **undeclared** `testCodeFailure` throws
(`:1668-1670`), so a mutation with collateral reds cannot simply be noted. The
mutation below was applied to `src/core/dream/validate.js` at `c05a575b` and the
**whole suite ran green (2895 pass, 0 fail)** while `[OC-1]`'s absence walk found
the bytes — so `[OC-1]` is the sole red:

```json
{
  "suite": "tests/unit/dream-validate.test.js",
  "proofs": [
    {
      "id": "prune-keeps-a-copy-of-what-it-evicts",
      "wp": "WP-quarantine-only-copy-shelf",
      "criterion": "1",
      "why": "row O2 is that the prune DESTROYS the bytes for classes A and B, not merely that it unlinks a name from redacted/. A prune that copies the file aside before unlinking satisfies every shipped retention assertion — the shelf still returns to the cap, the evicted basename is still gone, and the rmSync deletion still happens, so the AC-14 tests and the Table N row N2 deletion-count spy all stay green — while the secret-bearing bytes remain on disk. [OC-1]'s whole-tree byte-absence walk is the only assertion in the repo that can see it, which is exactly why it exists",
      "file": "src/core/dream/validate.js",
      "find": "        fs.rmSync(path.join(dir, c.name), { force: true });",
      "replace": "        { const aside = path.join(dir, '..', '.pruned'); fs.mkdirSync(aside, { recursive: true, mode: 0o700 }); fs.copyFileSync(path.join(dir, c.name), path.join(aside, c.name)); } /* RP_MUT_OC_PRUNE_KEEPS_A_COPY */\n        fs.rmSync(path.join(dir, c.name), { force: true });",
      "marker": "RP_MUT_OC_PRUNE_KEEPS_A_COPY",
      "occurrences": 1,
      "expectRed": [
        {
          "test": [
            "EP2 retention [OC-1]: the prune destroys a SOLE-SURVIVING copy — a class-A original is evicted and its bytes then exist nowhere under the core (Table O rows O1, O2)"
          ],
          "signal": "O2-the-prune-destroys-a-sole-surviving-copy"
        }
      ]
    }
  ]
}
```

**`expectRed` has exactly one entry with a one-element path, and that is the
contract.** If the lane reports any red beyond `[OC-1]`, the mutation has been
altered or the tree has moved — narrow it and record the narrowing under
"Decisions made"; **never** widen `expectRed` to absorb a surprise, and never put
two top-level test names in one `test` array.

**The two doc clauses.** Both are single clauses inside existing sentences.
**Round 1's HEAVY finding lands here:** the earlier draft would have had them
assert a universal that is false for classes B and C, i.e. it would have told a
user a recovery story that does not hold. They must be written to the corrected
row **O1**:

- They say the deleted file **may be** the only copy of that original — never
  that it always is (false for class C, whose twin is on `state/quarantine/`).
- They must **not** say the vault note holds a redacted version of it (false for
  class B, whose vault note is untouched at its baseline).
- They promise **no** warning, banner, record or recovery path, because this
  package ships none (Table O rows O5, O6, O7).

`docs/runbooks/secret-incident.md:57-59`, inside the existing sentence beginning
"The folder keeps roughly the 50 most recent copies": add that for most files
there this is the **only** copy of that original, so once it is deleted the
original text cannot be recovered — which is why the review window matters.

`docs/GLOSSARY.md:141-150`, inside the `secret quarantine` entry beside
*"disposable"*: say that a file there is usually the **only** surviving copy of
that note's pre-scrub text, so the cap's eviction is generally an irreversible
loss rather than the removal of a spare.

  fails there, before the lane.
- **Ambiguity → choose the simpler option and record it under "Decisions made".**
  Do not expand scope to resolve it.

## Contract reference

**Activation trigger (ADR-0031's 2-of-7): four of seven fire.**
(ii) a **status taxonomy** is introduced — the shelf's three classes (A, B, C)
and which of them a file's bytes survive in, which nothing in the code names
today; (iv) **precedence** behaviour is *adjudicated* — whether the cap yields to
sole-surviving status. Table O row **O8** decides it **NO** and ships **no** Table
N change, so this trigger fires on the decision being recorded here, not on a
contract being edited here; (v) an **authority boundary** is
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
| **O1** | **THE SHELF'S THREE CLASSES — corrected at design-gate round 1, finding HEAVY 1, which showed the earlier universal FALSE.** Is every surviving shelf file the only copy of its bytes? | **NO — a shelf file MAY be the sole surviving copy, and which it is depends on the arm that wrote it.** The earlier draft of this row claimed a universal and every dependent row inherited the error. There is exactly **one** write site (`src/core/dream/validate.js:1416`), reached from three outcomes. **Class A — successful redaction** (`:1419-1432`): the arm writes NO withheld copy, the vault gets the scrubbed note, and the shelf copy is **the sole surviving pre-scrub form**. Measured `OC-P1`. **Class B — refused fall-through with no withheld twin** (`preserved === null`, `redactCopy` non-null, `:1452-1473`): nothing is promoted, the vault note is left at its **baseline** — NOT a redacted form — and the shelf copy is **the sole surviving form of the added content**. Asserted today by `tests/unit/dream-validate.test.js:2052`. **Class C — retained duplicate** (`:1489-1504`): a withheld twin exists but byte-identity was NOT proven — the read threw, or the buffers differ — so the `else` arm KEEPS the shelf copy; and the best-effort `rmSync` at `:1500` can itself throw, leaving both copies with the record naming only the twin. **A class-C file is NOT an only-copy:** its twin sits on `state/quarantine/`, which is unbounded AND banner-announced. **Fourth caveat, also round 1's:** the shelf does not deduplicate — two notes carrying the same secret line yield two byte-identical shelf files under different names (measured `OC-P5`), so byte-level absence is a property of a fixture, never of the shelf |
| **O2** | **WHAT THE PRUNE THEREFORE IS, per class.** | `pruneRedactedOriginals` is **the only code path in `src/` that CAN destroy a sole-surviving copy** — every other delete over these bytes is gated on proven identity with a twin. Its effect is per class: on **A** and **B** it destroys the sole surviving form; on **C** it deletes a duplicate whose twin is on the unbounded, banner-announced withheld shelf, which is **no loss at all**. **The prune cannot tell them apart:** Table N row N3's candidate set is a date-prefix regex minus this run's own basenames, and no class marker is written anywhere — the preservation record that knows the class (`:1431`) is never persisted past the run. Measured (`OC-P2`, class A): 50 sits untouched; a 51st run evicts exactly the oldest; a full walk then finds those bytes nowhere, and no record, report, banner or file names what was destroyed |
| **O3** | **DOES THE SHIPPED "never destroy the only copy" RULE ALREADY BIND THE PRUNE?** | **NO — and this was checked against the governing text, not inferred.** The rule is the **only-copy invariant**, `docs/specs/done/WP-dream-promote-module.md:703` Table Q row **Q4**: *"nothing may destroy **the working copy of a note** unless some durable artifact byte-identically holds THE BYTES THAT ARE THERE NOW … **the invariant binds the pipeline's teardown too**"*. Its protected object is the **working copy in the workspace**; a shelf copy is the thing that *satisfies* the invariant, never the thing it protects. `docs/specs/done/WP-preservation-abort-widening.md:107-121` restates the scope as *"every party that could destroy a **working copy**"*, and its Table P enumerates its parties as the gate's arms, `promote()` and pipeline teardown — **`pruneRedactedOriginals` is not among them.** `docs/specs/done/WP-quarantine-preserve-durability.md:944` Table F row **F7(a)** puts *"`pruneRedactedOriginals`' evictions"* **permanently outside** its own scope. `docs/specs/done/WP-quarantine-failed-preserve-disposal-flush.md:499-504` routes the prune's selection and persistence questions **here** by name. **The rule as sited is write-time, single-invocation and scoped to the bytes this run is judging; the prune is a cross-run delete over other runs' bytes that consults no record.** It does not reach it |
| **O4** | **HAS ANY LATER PACKAGE OR ADR DECIDED THE QUESTION?** | **NO.** Swept at `c05a575b` over `docs/specs/`, `docs/specs/done/`, `docs/adr/` and `docs/specs/logbook/`. No ADR mentions an only-copy, the retention cap or `REDACTED_RETENTION_CAP` at all. Three packages measured the loss and each **explicitly reserved the answer to this file**: `docs/specs/done/WP-quarantine-banner-location.md:1415-1426` (naming the three candidate answers — *"moved to the withheld shelf, recorded durably, or exempted from the retention cap"*), `docs/specs/done/WP-quarantine-disposal-durability.md:644-648`, and the owner ruling at `docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md:52-55` (*"Ruled: routed, not absorbed"*). **The question is live** |
| **O5** | **CANDIDATE (b) — refuse to prune below a floor of only-copies.** | **REJECTED, and the corrected O1 makes the rejection narrower but not weaker.** The floor is now classes **A + B**, not the whole shelf — but nothing bounds how many A/B copies accumulate, so the floor is still unbounded and (b) is still the cap's repeal for every file that matters. Measured cost (`OC-P4`): a single run redacting 60 notes leaves 60, and no later run reduces them. **And (b) is now strictly harder than before:** separating A/B from C at prune time requires knowing the class, which by row **O2** is a fact no durable artifact holds — the same missing record candidate (c) needs. The cap's value is owner-approved (Table N row **N1**) and this package may not re-litigate it |
| **O6** | **CANDIDATE (c) — mark and warn before deleting.** | **REJECTED, on re-derived grounds.** *Mark:* the earlier draft called it vacuous because every file was an only-copy; under the corrected O1 **that argument is withdrawn** — a mark would now genuinely distinguish A/B from C. It is rejected instead because **the mark IS the missing durable record**: the class is known only inside the run that wrote the file (`:1431` builds the record; nothing persists it), so marking means new per-artifact durable state, which is what the stub required be priced. *Warn:* `reports/warnings.md` cannot carry the line — `composeWarnings` is **a pure function of the transcript ledger alone** and that purity is a stated contract (`src/core/dream/warnings.js:21-26`: *"THE RENDER IS A PURE FUNCTION OF THE LEDGER ALONE … no byte a user leaves in the file can be laundered into Wienerdog's own render"*), so it needs the same new record class. The digest's pending-review banner cannot carry it either: it is the **withheld** shelf's by design (`src/core/digest.js:848-856`). Both are new durable state, and both are larger than this package |
| **O7** | **CANDIDATE (d) — what the code already implies, and the limit of it.** | **PARTLY TRUE, and the part that is true is load-bearing.** The dream report **already names every shelf copy in the run that creates it**, for all three classes: the gate returns `preserved: [{artifact, location: 'quarantine/redacted'}]` (`src/core/dream/validate.js:1431`) and `redactionLine` / `preservedLine` render it (`src/core/dream/promote.js:744-760`). The user-facing runbook **already discloses the cap** (`docs/runbooks/secret-incident.md:57-59`). **What is NOT implied anywhere:** that for classes **A** and **B** the deleted file is the only copy — the runbook implies loss without naming it as total — and there is no notice **at deletion time**, which by rows **O2** and **O6** cannot be added without the record that does not exist. **What the runbook must NOT be made to say (round 1, HEAVY 1):** that the deleted file is *always* the only copy (false for **C**), or that the vault note holds a redacted form of it (false for **B**) |
| **O8** | **THE DECISION — candidate (a), delete anyway, argued per class.** | **(a) SURVIVES THE CORRECTION, and the per-class argument is now the argument.** **Class C:** the prune deletes a duplicate whose twin is on the unbounded, banner-announced shelf — pure housekeeping, no loss, (a) is plainly right. **Classes A and B:** the prune destroys the sole surviving form, and that is the bargain the owner already struck — approving a *count* cap on a shelf that holds sole-surviving copies **is** approving their bounded destruction, and `REDACTED_RETENTION_CAP = 50` is owner-approved (Table N row **N1**). Rows **O5** and **O6** show that every alternative needs a durable class record the product does not have. This package therefore re-decides nothing; it makes the bargain legible **without overstating it**, and pins the premise. It ships **(O8a)** one clause in `docs/runbooks/secret-incident.md` saying the deleted file **may be** the only copy of that original and that where it is, the text is unrecoverable — **not** that it always is; **(O8b)** one clause in `docs/GLOSSARY.md` beside *"disposable"* removing the implication of spareness; and **(O8c)** the `[OC-1]` test pinning class **A** end to end. **Why the test is the real deliverable:** every row above rests on the class partition, and that partition is a property of the *design* — one write site, three arms, one identity-gated delete — that no current test states end to end |
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
- [ ] **Exact contracts → "Scope, set by design-gate round 1"** — the class-A
      scoping of `[OC-1]` and the refusal to assert a universal (mirrors O1)
- [ ] **Exact contracts → the fixture's three load-bearing properties** — the
      `publish` and distinct-secret requirements (mirror O1's dedup caveat, O2)
- [ ] **Exact contracts → the two doc clauses** — the "may be" hedge and the two
      prohibitions (mirror O1's classes B and C, and O7's closing sentence)
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
- **TWO FIXTURE TRAPS, both measured; neither is inferable from the code.**
  (1) `RUN` defaults to `publish: false`, so a run whose bytes you need in the
  vault must pass `publish: true` — otherwise run 2 re-judges the same secret and
  the vault never holds the scrubbed form (`OC-P7`: the gate returns `{ok:true}`
  on an already-scrubbed note, so a published run 1 followed by an unchanged
  run 2 completes **no** redaction and never prunes).
  (2) The shelf does **not** deduplicate: two runs over identical secret-bearing
  content leave two byte-identical shelf files (`OC-P5`), so run 2 must carry a
  **different** secret token or the byte-absence assertion is unprovable.
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
      `O1-class-A-copy-is-the-sole-pre-scrub-form` and
      `O2-the-prune-destroys-a-sole-surviving-copy` (Table O rows O1, O2). It
      asserts **class A only** and makes **no universal claim** about the shelf.
- [ ] **2.** `[OC-1]`'s fixture has all three load-bearing properties: run 1 uses
      `publish: true`; `R` is the unique oldest candidate by an explicit
      `utimesSync`; and run 2 judges a **different** note with a **different**
      secret token, asserted to have preserved bytes differing from `R` before
      any absence assertion (Table O row O1's dedup caveat; `OC-P5`, `OC-P7`).
- [ ] **3.** `[OC-1]` demonstrates the presence of `R`'s bytes on the shelf
      **before** the prune and their absence from the whole `stateDir` tree
      **after** it, **using the same walk function**, and asserts the walk
      visited at least one file (Table O row O2; the vacuous-walk trap).
- [ ] **4.** `tests/red-proofs/quarantine-only-copy-shelf.proofs.json` exists and
      is byte-for-byte the declaration under **Exact contracts**, with
      `expectRed` holding **exactly one** entry whose `test` is a **one-element**
      identity path, and `npm run red-proofs` reports this package's criterion
      `1` as `PROVEN` with **`[OC-1]` as the sole red** (ADR-0042;
      `scripts/red-proofs.js:693-694`, `:1599-1602`, `:1668-1670`).
- [ ] **5.** `docs/runbooks/secret-incident.md` states, inside the existing
      bullet, that the deleted file **may be** the only copy of that original and
      that where it is, the text cannot be recovered (Table O row O8a). It does
      **not** claim the file is always the only copy, does **not** say the vault
      note holds a redacted form of it, and promises **no** warning, banner or
      record.
- [ ] **6.** `docs/GLOSSARY.md`'s `secret quarantine` entry states that a file on
      the `redacted/` shelf is **usually** the only surviving copy of that note's
      pre-scrub text, so the eviction is generally irreversible rather than the
      removal of a spare (Table O row O8b). Same three prohibitions as criterion 5.
- [ ] **7.** `git diff --stat` against the base commit touches **only** the four
      Deliverables paths plus this spec file. **`src/` is untouched.**
- [ ] **8.** `npm test` and `npm run lint` pass.
- [ ] **9. Idempotence:** `N/A — this WP ships one test, one RED declaration and
      two documentation clauses; it adds no command and writes nothing outside
      the repo.**

## Verification steps (run these; paste output in the PR)

```bash
# 1 — the new test, by name
npm test -- --test-name-pattern 'OC-1'

# 2 — the ONE test the RED declaration names must exist, spelled exactly
grep -c 'EP2 retention \[OC-1\]: the prune destroys a SOLE-SURVIVING copy' tests/unit/dream-validate.test.js

# 3 — the declaration is valid JSON, names this WP, and holds exactly ONE
#     expectRed entry whose identity path has exactly ONE element
node -e "const d=require('./tests/red-proofs/quarantine-only-copy-shelf.proofs.json');const p=d.proofs[0];console.log(d.suite,d.proofs.length,p.wp,'expectRed='+p.expectRed.length,'pathLen='+p.expectRed[0].test.length)"

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

1. **Does the retention cap delete a sole-surviving copy anyway — candidate (a)?**
   *Recommendation: YES, and the reasoning is that the owner has already decided
   it.* **Restated at design-gate round 1: the shelf is NOT uniformly
   only-copies** (Table O row **O1**), so the item is now answered per class.
   *Class C* — a retained duplicate whose twin sits on the unbounded,
   banner-announced `state/quarantine/` — is deleted at no loss at all, and (a) is
   plainly right for it. *Classes A and B* hold the sole surviving form, and for
   those a **count** cap **is** a standing decision to destroy the oldest of them;
   `REDACTED_RETENTION_CAP = 50` is owner-approved (Table N row N1). Candidate (b)
   is that decision's repeal for every file that matters (row O5) and candidate
   (c) needs the same durable class record the product does not have (row O6).
   What was genuinely missing is that **nothing said the loss was total** where it
   is (row O7), and this package's two clauses say so — **hedged, because saying
   it unconditionally would be false for class C.**
   *Cost of overruling:* the shelf becomes unbounded (b) or the product grows a
   per-artifact durable class record plus a second banner consumer (c) — in both
   cases a Table N amendment, an `src/` deliverable, and a package larger than
   `S` that this one would have to be split into.
   *Cost of accepting, stated rather than implied:* a user who does not read the
   dream report within roughly fifty redactions permanently loses the pre-scrub
   text of the oldest class-A or class-B note, and nothing tells them at the
   moment it happens. **The product cannot even tell them which class a file was**
   — that fact is never persisted (row O2).

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
