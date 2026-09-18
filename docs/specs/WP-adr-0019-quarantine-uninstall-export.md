---
id: WP-adr-0019-quarantine-uninstall-export
title: Stop `wienerdog uninstall` destroying the secret quarantine — an ADR-0019 amendment plus a pre-deletion gate
status: Draft
model: opus
size: M
depends_on: [WP-secret-fence-ep2-redact-arm, WP-scheduler-replay-manifest-independent, WP-quarantine-only-copy-shelf]
adrs: [ADR-0004, ADR-0019, ADR-0024, ADR-0031, ADR-0034, ADR-0035, ADR-0038, ADR-0041, ADR-0042]
epic: secret-lifecycle
---

# WP-adr-0019-quarantine-uninstall-export: stop uninstall silently destroying the only copy of the user's own text

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **Matured from a Draft stub on 2026-09-18.** Every code citation below is
> pinned to **`5b77865f`** and was read construct by construct at that commit.
> The stub's four open questions are all answered here: two as owner items with
> recommendations (Table W rows **W1**/**W2**, and owner item 1's amend-vs-supersede
> choice), one as an architect decision with its reasoning (Table X rows
> **X5**–**X7**), and one — *"does the same treatment extend to `secrets/`?"* — as
> a paragraph of the amendment text under owner item 1. **Nothing in this
> repository records the owner approving, accepting, ratifying or signing this
> package**, and this spec asserts no such acceptance.

## Context (read this, nothing else)

**IRON RULE (ADR-0004): Wienerdog is just files.** Nothing in this package
starts a process, opens a socket or outlives its invocation. What it adds is one
read-only directory walk, one refusal message, and one deletion that stops
happening.

The nightly **dream** job consolidates the user's AI-session transcripts into
their **vault** (a local git repo of markdown notes). Before it commits, the
**EP2 staged-output secret gate** (ADR-0024, ADR-0034; `src/core/dream/validate.js`)
scans the lines this run added to each note and either promotes it, redacts the
added lines in place, or withholds the note entirely. In the last two cases it
**preserves the user's own unredacted bytes** on one of two shelves under the
canonical core, and those shelves are what this package is about:

- **`<core>/state/quarantine/`** — the **withheld** shelf. Holds a note the gate
  would not commit at all. Unbounded; announced by a digest banner.
- **`<core>/state/quarantine/redacted/`** — holds the **pre-scrub original** of a
  note whose added lines the gate rewrote and then committed. Bounded at 50 and
  pruned; no banner — the dream report names each copy in the run that creates it.

Both are `0700` directories holding `0600` files **with the raw, unredacted bytes
intact**, outside the vault and never committed (`docs/GLOSSARY.md:141-150`).
Between them they are frequently the **only surviving copy** of a version of the
user's note: `WP-quarantine-only-copy-shelf`'s Table O row **O1** partitions the
shelf into four classes and finds three of them (A, B and C2) sole-surviving
outright, with the fourth (C1) decaying into one as soon as the owner deletes the
twin the product tells them to delete. That package's Table O row **O8** fixes the
honest phrasing for every user-facing sentence about these files: **"may be the
only copy"**, never "is" and never "is a spare". This spec's user-facing text is a
cross-document mirrored summary of that ruling and defers to it.

`wienerdog uninstall` undoes an install by replaying `install-manifest.json` in
reverse and then calling **`disposeCoreMechanics`** (`src/core/manifest.js:1133`),
which removes `state/`, `logs/`, `schedules/` and `secrets/` recursively and then
the emptied core. **It has no carve-out of any kind**: `fs.rmSync(dir, {recursive:
true, force: true})` takes the whole of `state/`, shelves included, with no
warning naming them. **ADR-0019** (`Status: Accepted`, 2026-07-06) is the decision
that installed that behavior, and it rests on an invariant stated at
`docs/adr/0019-uninstall-disposes-core-mechanics.md:52-54`, verbatim:

```text
The invariant this rests on — **nothing user-authored is ever written under the
canonical core; the vault is always outside it** — is binding on all future
code. No WP may write user knowledge under `~/.wienerdog`.
```

**That invariant has been false in the shipped tree since WP-123**, and no
amendment records it. Correcting it is half this package.

**Why this WP exists, and in whose words.** Round 1 of the design gate on
`WP-secret-fence-ep2-redact-arm` raised the conflict and put three options to the
owner. Recorded in the established form, reproduced from
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:378-386`:

> **OWNER-DECIDED IN SESSION — 2026-07-27 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the architect,
> not by him. It records that the decision was taken — it is **not** his
> signature and must never be treated as one, and **no gate keys on it**.
> Verbatim: *"ADR-0019: C now + B as follow-on."*

Option C shipped in that package: the product now *tells* the user that the
copies are disposable and that `wienerdog uninstall` removes them. **This package
is option B** — the part that changes what uninstall actually does, and the ADR
that currently forbids the change.

**Deleting the bytes on uninstall is not obviously wrong.** It is the argument
ADR-0019 itself makes for `secrets/`, and leaving raw credential material on disk
after an uninstall would be its own finding. **What is wrong is deleting them
without offering them first**, and — as Table W row **W1** decides — the offer
that costs the user least is not a copy Wienerdog writes.

**Three neighbouring decisions govern the shape of the answer.**

- **ADR-0038** (owner-signed 2026-08-03) sets the direction every uninstall
  deletion moves in: a field the reverser reads may make uninstall delete
  **less**, never more. Both candidate mechanisms here only narrow — Table X row
  **X5** says so explicitly, which is why ADR-0038 permits both and chooses
  neither.
- **ADR-0035** (owner-signed 2026-07-26) draws the attended-execution boundary:
  the attended CLI invocation is the trust surface, and no mechanism may treat a
  same-user write as a bounded, data-shaped event. It governs Table W row **W2**
  — whether an unattended `--yes` run may proceed past a non-empty shelf.
- **ADR-0041** (owner-signed 2026-08-31) gave `uninstall` its **deletion
  clearance** gate, and `WP-scheduler-replay-manifest-independent` — `Ready`, and
  landing **before** this package — rebuilt the pre-confirm plan around it. This
  package composes with that one in the same two files; Table W row **W7** names
  every row of it that must not be disturbed.

## Current state

Everything below was read at `5b77865f`. `src/core/manifest.js` and
`src/cli/uninstall.js` contain the string `quarantine` **zero** times
(`grep -c quarantine` over both = 0), so nothing in the uninstall path knows the
shelves exist.

1. **The two writes into the shelves.** `quarantinePreserve(stateDir, content,
   rel, date, kind)` — `src/core/dream/validate.js:936` — joins `stateDir` with
   `'quarantine'`, and additionally with `REDACTED_SUBDIR` (`= 'redacted'`,
   `:657`) when `kind === 'redacted'`. It `mkdirSync`s the directory `0700`
   (`:950`), writes the file `0600`, and returns `{name, bytes}` or `null`. Its
   two call sites are the **redact arm** at `:1416` (`kind: 'redacted'`) and the
   **withhold arm** at `:1439` (`kind: 'withheld'`). Filenames are
   `<date>-<sanitized note basename><ext>`, with a `-1`, `-2` … suffix on
   collision.
2. **`disposeCoreMechanics`** — **signature at `src/core/manifest.js:1133`**,
   JSDoc `:1110-1132`, the `mechanics` array `:1136-1141`, **the sweep loop
   `:1142-1150`**, the core removal `:1151-1170`, exported at `:1174`. Signature
   `(paths, {dryRun = false, vaultPath = null} = {})`, returning
   `{removed, skippedForVault}`. It builds
   `mechanics = [paths.state, paths.logs, path.join(paths.core,'schedules'),
   paths.secrets]`, and for each: `if (!isDir(dir)) continue;` (`:1143`) →
   `if (vaultPath && contains(dir, vaultPath)) { skippedForVault.push(dir);
   continue; }` (`:1144-1147`) →
   `if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });` (`:1148`) →
   `removed.push(dir)` (`:1149`). **`paths.state` goes through that one recursive
   `rmSync` like the other three — there is no carve-out for any subpath of it.**
   Then it removes the core if `readdirSync(paths.core)` is empty
   (`rmdirSync`/`unlinkSync`, symlink-aware) in a `try/catch` whose comment reads
   *"never let this final cosmetic step crash the uninstall"* (`:1163`). **Note
   that the core removal is already non-recursive and already uses the
   empty-directory syscall** — Table X row **X1** generalizes exactly that shape
   downward to `state/` and the two shelves. Its JSDoc asserts the shelves do not
   exist — *"state/, logs/, schedules/, secrets/ hold only Wienerdog-authored
   runtime artifacts … none manifest-tracked, none user-authored"*, a sentence
   spanning **`:1112-1116`** — which is **false on this tree** and must be
   corrected by this package (Table X row **X9**).
3. **`contains`** — `src/core/manifest.js:1097-1108`. Realpaths both sides and
   returns `false` on any resolution error. It is the vault guard's helper and
   stays byte-unchanged (Table X row **X7**).
4. **The four `disposeCoreMechanics` call sites**, all in `src/cli/uninstall.js`:
   `:318` (`--dry-run`), `:354` (the pre-confirm plan), `:408` (the live first
   sweep), `:467` (the live second sweep that removes the emptied core).
5. **The uninstall's output surfaces.** The manifest headline prints at `:311-312`.
   `--dry-run` prints its own plan at `:314-342` and returns. The **pre-confirm
   plan** is built at `:353-354` and printed at `:355-358`, then `confirm()` at
   `:359`. **The pre-confirm plan block is inside `if (!yes)`** (`:345`), so a
   `--yes` run prints the manifest headline and nothing else before deleting. The
   comment at `:349-351` fixes `--yes`'s meaning: *"This is disclosure, not a
   gate — `--yes` skips only the prompt, the set of valid actions is identical
   either way."* The closing summary is `:471-501`, whose last three-way branch
   (`:495-501`) prints one of *"fully removed"*, *"Kept `<core>` (your memory
   vault still lives inside it)"*, or *"Kept `<core>` (a customized config.yaml
   remains)"*.
6. **The existing refusal vocabulary.** `uninstall` already aborts with a
   `WienerdogError` and deletes nothing at `:286-288` (no manifest), `:298`/`:305`
   (corrupt manifest), `:386-390` (the manifest changed while the user was
   deciding) and inside `requireDeletionClearance` (`:207-255`, three refusals).
   A retryable refusal that names its remedy is this command's established shape.
7. **`paths.state`** is `path.join(core, 'state')` and `core` is
   `$WIENERDOG_HOME || path.join(home, '.wienerdog')` — `src/core/paths.js:56`,
   `:70`. `getPaths` has **no platform branch of any kind**, which is why the
   Platform-scope section below is one sentence.
8. **No review path exists.** `WP-quarantine-review-cli` is `Superseded`.
   `wienerdog doctor`'s `quarantineReport` (`src/cli/doctor.js:498`) counts
   **transcript-ledger** quarantines by reason — a different object entirely; it
   never reads either shelf directory. Nothing in `src/` counts, ages, sizes or
   announces the shelves' contents outside the digest banner for the withheld one.
9. **What the user is told today**, and both sentences become false when this
   package lands: `docs/runbooks/secret-incident.md:61-63` — *"And `wienerdog
   uninstall` removes this folder along with everything else Wienerdog keeps, so
   copy out anything you want to keep before you uninstall."* —
   and `docs/GLOSSARY.md:146-147` — *"disposable — `wienerdog uninstall` removes
   it with everything else Wienerdog keeps."*
10. **The dream-report line is NOT falsified and is NOT a deliverable.**
    `src/core/dream/promote.js:689` reads *"If the redaction was wrong, restore
    from that copy while it is there; otherwise delete it."* The stub listed it
    for re-derivation. Swept and ruled out: *"while it is there"* is scoped to the
    **retention cap**, which this package does not touch, so the sentence stays
    true. `src/core/dream/promote.js` is therefore out of Deliverables.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | add and export `quarantineInventory` (Table K); add the carve-out inside `disposeCoreMechanics` and its `preservedQuarantine` return field (Table X rows **X1**/**X2**/**X4**), classify every swept path with `lstat` (Table X row **X10**) in the top-down-then-bottom-up order of Table X row **X11**, match the shelf names by ASCII case fold (Table X row **X12**), and correct that function's doc comment (Table X row **X9**). **`isDir` (`:175-181`) is not changed and not removed** — measured at `5b77865f`, it has exactly four call sites (`:587`, `:616`, `:903`, `:1143`), all of which keep it, including `:1143` for `logs`/`schedules`/`secrets`; this package simply does not use it to decide anything about `state/` or the shelves. `contains`, `withinSchedulerRoot`, `withinAllowedRoot`, `validateEntry`, `reverse()` and everything `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged — Table W row **W7**, Table X row **X7** |
| modify | src/cli/uninstall.js | call `quarantineInventory` **once, before anything is printed** (Table K row **K5**); raise the refusal (Table W rows **W2**/**W3**/**W4**); print the `--dry-run` block (**W5**); add the preserved-quarantine branch to the closing summary (**W8**). `requireDeletionClearance`, the byte-exact manifest compare, the `vaultPath` read at `:309`, and every line `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged — Table W row **W7** |
| modify | tests/unit/manifest.test.js | Table K's four outcomes **including the both-shelf-directories-empty fixture** (**K2**/**K3**), the carve-out's `rmdirSync` climb and its `ENOTEMPTY` preservation (**X1**), the return field (**X4**), the deleter's enumeration-failure arm (**K4**), the **interleaving** test of acceptance criterion 9 (**X3**), the **symlinked-`state` and symlinked-`quarantine` regressions** of acceptance criterion 14 (**X10**/**X11**), the **case-fold** arms of acceptance criteria 9 and 15 (**X12**), and the Table Y rows that are unit-observable |
| modify | tests/unit/uninstall.test.js | the refusal with and without `--yes`, the no-filename/no-content assertion (**Y1**), `--dry-run` (**W5**), the empty- and absent-shelf byte-identity (**W6**), the unreadable-shelf abort (**K4**), and the ordering assertion of Table W row **W7** |
| create | tests/red-proofs/adr-0019-quarantine-uninstall-export.proofs.json | the declared RED proofs of Table B (ADR-0042) |
| modify | docs/adr/0019-uninstall-disposes-core-mechanics.md | **owner item 1 only** — the dated amendment appended verbatim, plus the one pointer line inserted after `:54`. `Status: Accepted` (`:3`), `Date: 2026-07-06` (`:4`) and the invariant paragraph (`:52-54`) are **never** touched, moved or reformatted (ADR-0035) |
| modify | docs/runbooks/secret-incident.md | **one sentence** — the `wienerdog uninstall` sentence at `:61-63` (Table W row **W9**). No other edit to this file |
| modify | docs/GLOSSARY.md | **one clause** — the `wienerdog uninstall removes it …` clause inside the `secret quarantine` entry (Table W row **W9**). No other edit to this file |

### Exact contracts

```js
// src/core/manifest.js — NEW export.
/**
 * Inventory the secret quarantine under this core (Table K). READ-ONLY: a
 * non-following walk (`readdirSync({withFileTypes:true})` + `lstatSync`) of
 * <paths.state>/quarantine. It NEVER opens a file and never reads a byte of one
 * (Table K row K6), and it NEVER follows a symlink. It never throws: any
 * enumeration or stat failure is REPORTED in `unreadable` (Table K rows K3/K4).
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{roots: Array<{dir:string, entries:number, bytes:number}>,
 *            entries:number, bytes:number,
 *            unreadable: Array<{dir:string, code:string}>}}
 *   `roots` — the shelf directories that EXIST as directories, in the fixed
 *     order [<state>/quarantine, <state>/quarantine/redacted], each with the
 *     counts of what it holds; an absent root is omitted entirely. **A root
 *     itself is never counted** (Table K row K2).
 *   `entries`/`bytes` — totals over the whole walk. `bytes` sums regular files'
 *     `size` only; every other counted entry adds 1 to `entries` and 0 to
 *     `bytes`. Two empty shelf directories therefore give `entries: 0`.
 *   `unreadable` — non-empty means the shelf's state is UNKNOWN, and at the
 *     gate that ABORTS a non-dry-run uninstall (Table K row K4).
 *
 * The GATE is this function's only consumer. `disposeCoreMechanics` does NOT
 * call it: its safety comes from never recursively deleting a path that can
 * hold user text, not from a snapshot (Table X rows X1/X2).
 */
function quarantineInventory(paths)

// src/core/manifest.js — CHANGED return shape and CHANGED state/ disposal.
/** Disposal of `paths.state` follows Table X row X1 and takes NO inventory.
 *  EVERY path it classifies is classified with `fs.lstatSync`, never `statSync`
 *  and never the `isDir` helper (Table X row X10): a SYMLINKED `paths.state` is
 *  unlinked and NEVER descended, and a shelf root that is not a real directory
 *  is preserved untouched. Because `lstat` classifies only a path's FINAL
 *  component, the shelf levels are VALIDATED top-down (state, quarantine,
 *  redacted) before any descendant is accessed, and only the validated prefix is
 *  then removed bottom-up (Table X row X11). The shelf directories are
 *  identified by ASCII CASE FOLD of their names, never by byte equality, because
 *  two of the three supported platforms are case-insensitive by default; a
 *  fold-equal but not byte-equal child is preserved and reported (Table X row
 *  X12). Otherwise its non-`quarantine` children are removed
 *  recursively as before, no shelf
 *  FILE is ever deleted, and `<state>/quarantine/redacted`, `<state>/quarantine`
 *  and `<state>` come off bottom-up with NON-RECURSIVE `fs.rmdirSync` only —
 *  `ENOTEMPTY` (or any code but `ENOENT`/`ENOTDIR`) preserves that directory and
 *  every ancestor of it, and stops the climb. `paths.logs`, `<core>/schedules`
 *  and `paths.secrets` are untouched by this change.
 *  @returns {{removed: string[], skippedForVault: string[],
 *             preservedQuarantine: string[]}} the third field lists the
 *  directories this call left in place for that reason (`[]` when it preserved
 *  nothing), in the shape the caller already uses for `skippedForVault`
 *  (`uninstall.js:332`, `:480`). `removed` and `skippedForVault` keep their
 *  meaning. The carve-out takes NO option and no caller can disable it
 *  (Table X row X2). */
function disposeCoreMechanics(paths, { dryRun = false, vaultPath = null } = {})
```

**Worked example.** `HOME=/tmp/h`, core `/tmp/h/.wienerdog`, no nested vault. The
withheld shelf holds `2026-07-01-tooling.md` (812 bytes) and the redacted shelf
holds `2026-07-02-fp.md` (1 240 bytes) and `2026-07-03-fp.md` (990 bytes):

```
quarantineInventory(paths)  →  {
  roots: [
    { dir: '/tmp/h/.wienerdog/state/quarantine',          entries: 1, bytes:  812 },
    { dir: '/tmp/h/.wienerdog/state/quarantine/redacted', entries: 2, bytes: 2230 },
  ],
  entries: 3, bytes: 3042, unreadable: [],
}
```

A non-dry-run `wienerdog uninstall` — **with or without `--yes`** — then prints
the refusal of Table W row **W4** and exits non-zero, having removed nothing.
`wienerdog uninstall --dry-run` prints the same block, says a real run stops
there, and then prints the rest of today's plan (Table W row **W5**).

**The emptied-shelf case, which is the state the refusal asks the user to
reach.** With `<state>/quarantine/` and `<state>/quarantine/redacted/` both
present as directories and holding **nothing**, the roots themselves are not
counted (Table K row **K2**):

```
quarantineInventory(paths)  →  {
  roots: [
    { dir: '/tmp/h/.wienerdog/state/quarantine',          entries: 0, bytes: 0 },
    { dir: '/tmp/h/.wienerdog/state/quarantine/redacted', entries: 0, bytes: 0 },
  ],
  entries: 0, bytes: 0, unreadable: [],
}
```

so the outcome is **EMPTY**, the uninstall **proceeds**, and
`disposeCoreMechanics` removes `redacted`, then `quarantine`, then `<state>`
with three successful `rmdirSync` calls, returning `preservedQuarantine: []`.
With both shelves **absent** the same thing happens via `ENOENT`. **In both
cases the run's complete output is byte-identical to `5b77865f`** (Table W row
**W6**).

## Contract reference

**Activation trigger (ADR-0031's 2-of-7 test) — six of seven fire**, so the
discipline is on: (i) `disposeCoreMechanics`'s **return shape** changes; (ii) a
**result taxonomy** is introduced — the inventory's four outcomes, ABSENT /
EMPTY / NON-EMPTY / UNREADABLE, which nothing in the code names today; (iv)
**refusal and precedence** behavior is new — the gate's abort, its ordering
against another package's abort, and what `--yes` does to it; (v) an **authority
boundary** is crossed — the dream gate writes the copies and `uninstall` owns
their lifecycle, with no record passing between them; (vi) **multiple
downstream consumers** inherit it — ADR-0019 is law for every future disposal
step; (vii) the same facts appear in the Deliverables notes, the acceptance
criteria, the verification greps and the operative prose.

**NAMESPACE WARNING, because three of the tables this spec cites live elsewhere.**
This spec's own canonical tables are **K**, **X**, **W**, **Y** and **B**.
Citations to other documents are always package-qualified and never bare:
`WP-secret-fence-ep2-redact-arm`'s **Table Q** and **Table N**;
`WP-quarantine-only-copy-shelf`'s **Table O**;
`WP-scheduler-replay-manifest-independent`'s **Tables D**, **R** and **S**.
A bare "Table D" or "Table S" in this document is a defect.

### Table K — the shelf inventory (canonical)

| Row | Fact | Value |
|---|---|---|
| **K1** | **The two shelves, and how their paths are fixed** | `<state>/quarantine` and `<state>/quarantine/redacted`, where `<state>` is `paths.state` = `path.join(core,'state')` (`src/core/paths.js:70`). The **canonical** paths are literal joins of a path this package already owns: `path.join(paths.state,'quarantine')` and `path.join(that,'redacted')` — those are what `quarantinePreserve` writes and what Table X row **X1** step 3 removes. **The inventory LOCATES them by enumerating `<state>` and selecting the children whose names ASCII-case-fold to `quarantine`, then `redacted` inside each** (Table X row **X12**), because on a case-insensitive volume the stored name may be `Quarantine` while the lowercase path resolves to it; `roots` reports each by its **actual on-disk path**, so the plan names what exists. **No ambient value, env var or manifest field contributes to any of it** — the only names used are ones that already matched a closed, anchored set — which is why no containment or resolution question arises (Table X row **X7**) |
| **K2** | **What is counted — and the TWO SHELF ROOTS THEMSELVES ARE NOT** | *Rewritten at design gate round 1, finding 2.* **The two shelf root directories — `<state>/quarantine` and `<state>/quarantine/redacted` — contribute ZERO entries when each is a real directory.** They are created by `quarantinePreserve`'s `mkdirSync` (`validate.js:950`), not by the user, and they outlive their contents: counting them would make a user who has deleted every quarantined file face a refusal **forever**, which contradicts Table K row **K3**'s EMPTY arm and the worked example, and would turn this package's protection into a permanent block on uninstalling. **Everything else counts, conservatively:** every regular file (contributing its `size` to `bytes`), and **every other entry of any type at any depth — any further directory, any symlink, any socket or fifo — contributing 0 bytes but 1 entry and making the shelf NON-EMPTY.** The exclusion is by **path and type together**: a **symlink, file or any non-directory occupying either root path counts as one entry**, because it is not the product's directory, it is something else sitting where the product's directory should be — **and Table X row X10 gives that same object the matching treatment in the sweep: preserved, never followed, never removed**. An entry at or under `<quarantine>/redacted` counts toward the `redacted` root's row; every other entry counts toward `quarantine`'s. `lstat` throughout: a symlink is counted and **never followed**, so a planted link cannot make the walk descend outside the shelf or loop |
| **K3** | **The four outcomes** | **ABSENT** — `<state>/quarantine` does not exist (`ENOENT`/`ENOTDIR` from `readdir` or `lstat`): contributes nothing, is not an error, produces no block and no refusal. A root Wienerdog never wrote to is genuinely empty. **EMPTY** — it exists and the walk finds zero entries, **which by K2 includes the state in which BOTH shelf directories are present and hold nothing at all**: identical treatment, and this is the state a user reaches by doing exactly what the refusal asked of them. **NON-EMPTY** — at least one entry: Table W applies. **UNREADABLE** — any other error code (`EACCES`, `EPERM`, `EIO`, `ELOOP`, `EMFILE`, …) from any `readdir` or `lstat` in the walk: the shelf's state is **UNKNOWN**, recorded as `{dir, code}` in `unreadable` |
| **K4** | **UNREADABLE is never EMPTY — one rule, two sites, both preserving** | This is the fail-open direction and it is the one that destroys data: an `EACCES` read as "nothing on the shelf" would let the gate pass and `disposeCoreMechanics`'s `rmSync({force:true})` — which reports nothing — take the tree anyway. The rule is therefore stated once and **what it maps to differs by site, always toward preservation**: **at the gate** (Table W row **W3**), a non-empty `unreadable` **ABORTS** a non-dry-run uninstall before any disclosure and before any deletion, naming each directory and its `code`; **inside `disposeCoreMechanics`**, it **PRESERVES** — the shelf is left in place and reported in `preservedQuarantine` — because that function runs mid-uninstall, where an abort leaves a half-reversed install, and its shipped contract is already *"never let this final cosmetic step crash the uninstall"* (`manifest.js:1163`). `--dry-run` does **not** abort at either site; it prints the unreadable directories and continues, because it deletes nothing. **This is `WP-scheduler-replay-manifest-independent`'s Table D rows D9 and D15 applied to this walk**, with the same reason and the same single special case (absence) |
| **K5** | **When the gate's inventory runs** | **Exactly once per `uninstall` invocation, before anything is printed** — before the manifest headline (`uninstall.js:311`), before `WP-scheduler-replay-manifest-independent`'s schedule discovery and therefore before its D9 abort (Table W row **W7**). That single result is the only one the gate ever uses |
| **K6** | **The inventory never reads a file's CONTENTS** | `readdir` + `lstat` only. Nothing opens a shelf file, so no shelf byte can reach stdout, a log, an error message or an argv (Table Y row **Y1**). `bytes` comes from `lstat`'s `size`, which is metadata |
| **K7** | **The deleter takes NO inventory — there is no second number to diverge** | *Rewritten at design gate round 1, finding 1.* An earlier revision had `disposeCoreMechanics` run its own inventory and branch on it; that is a snapshot, and a snapshot narrows the race rather than closing it. **Under Table X row X1 the deleter performs no emptiness test at all**: it never deletes a shelf file, and it removes each shelf directory with a single non-recursive `rmdirSync`, whose own atomic failure on a non-empty directory *is* the test. So the gate's number is the only number, it is purely a **disclosure** figure, and what survives is decided at deletion time by the kernel. Consent integrity holds without a byte-compare and in the strongest form available: **nothing the user was not told about is ever deleted, and the only thing that can change after the disclosure is that more of their text survives** |

### Table X — the carve-out in `disposeCoreMechanics` (canonical)

| Row | Fact | Value |
|---|---|---|
| **X1** | **The rule — NO RECURSIVE DELETE EVER TOUCHES A PATH THAT CAN HOLD USER TEXT** | *Rewritten at design gate round 1, finding 1, which falsified the previous snapshot-conditional form.* **`disposeCoreMechanics` never calls `fs.rmSync(…, {recursive:true})` on `paths.state`, on `<state>/quarantine` or on `<state>/quarantine/redacted`, under any inventory outcome, and it never deletes a shelf file at all.** For `paths.state` it does exactly this, in order: **(0)** classify `paths.state` with **`fs.lstatSync`** (Table X row **X10**) — **if it is a symlink, `fs.unlinkSync` the link and stop: no enumeration, no child removal, nothing below it is touched**, which is byte-for-byte what `5b77865f` does and what this same function already does one level up for a symlinked core (`manifest.js:1164-1165`); if it is not a directory at all, do nothing; **(1)** otherwise enumerate `paths.state`'s direct children; **(2)** for every child whose name does **not ASCII-case-fold to `quarantine`** (Table X row **X12** — **not** byte-equality), `fs.rmSync(child, {recursive:true, force:true})` — unchanged behaviour, and the recursion is permitted there because those are the machine mechanics ADR-0019 governs. **A child that folds equal but is not byte-equal is PRESERVED and reported, never deleted**, because nothing cheap can tell whether it is our shelf under a different spelling or a look-alike the user made; **(3)** **VALIDATE TOP-DOWN, THEN REMOVE BOTTOM-UP — two passes, and the order of the first one is the whole of Table X row X11.** *Validation pass, root to leaf:* `lstat` `<state>`, then `<state>/quarantine`, then `<state>/quarantine/redacted`, **stopping at the first level that is not a real directory** — a symlink, a file, a socket, or an `lstat` failure other than `ENOENT`/`ENOTDIR`. That level and **everything below it is off-limits: not accessed, not `lstat`ed further, not removed**. A level reporting `ENOENT`/`ENOTDIR` is simply absent and validation stops there with nothing below it to consider. *Removal pass, leaf to root, over the validated prefix only:* `fs.rmdirSync` each validated directory in reverse order — `redacted`, then `quarantine`, then `<state>` — each in its own `try/catch`, **non-recursive empty-directory removal only**. Per outcome: success ⇒ push onto `removed`; `ENOENT`/`ENOTDIR` ⇒ already gone, not an error, continue; **`ENOTEMPTY`/`EEXIST` ⇒ PRESERVE, push onto `preservedQuarantine`, and stop climbing** (an ancestor of a preserved directory is preserved by construction); any other code ⇒ preserve and report the same way. **A level the validation pass stopped at is PRESERVED untouched and reported** — never `rmdirSync`'d, never `unlinkSync`'d, never followed — because Table K row **K2** already counts exactly that object as one of the user's entries, and so is every ancestor of it. `paths.logs`, `<core>/schedules` and `paths.secrets` keep their single recursive `rmSync` (`manifest.js:1148`), **unchanged in every case**. **`rmdirSync` is the whole mechanism**: it removes a directory *if and only if* it is empty, atomically, in the kernel — so the emptiness test and the deletion are one syscall and there is no interval between them for anything to arrive in. This is the shape `disposeCoreMechanics` already uses one level up for the core itself (Current state item 2, `:1151-1170`), generalized downward |
| **X2** | **Unconditional AND snapshot-free — there is nothing to turn off** | The carve-out takes no parameter, reads no flag, consults no caller **and consults no inventory**: `disposeCoreMechanics` does **not** call `quarantineInventory`. It is not a check the deleter performs — **it is the absence of a recursive delete**, plus a syscall that fails when it must. That matters twice over. **A preservation property a caller's argument can switch off is a property of the call sequence, not of the deleter** — and this deleter has four call sites in one file today (`uninstall.js:318`, `:354`, `:408`, `:467`) and is exported (`manifest.js:1174`). **And a preservation property that reads a snapshot and then acts is a property of an instant, not of the run** — which is precisely what round 1 falsified |
| **X3** | **Why the carve-out is NOT made redundant by the gate — and why it now CLOSES the window rather than narrowing it** | The gate runs once, before the plan. **The dream job is scheduled and shares no lock with `uninstall`** — Wienerdog has none, and cannot have one (ADR-0004) — so a dream run can complete a preserve **after** the gate has passed and **before**, or **during**, `disposeCoreMechanics`'s work at `uninstall.js:408`. **A second inventory inside the deleter would not have fixed this**, and round 1 is where that was measured: a recursive `rmSync` selected by an emptiness snapshot still traverses afterwards, so a file landing between the snapshot and the traversal is destroyed. **X1's algorithm has no such interval at all**: the shelf's contents are never a deletion target, and the directories come off only through `rmdirSync`, which a single arriving file makes fail with `ENOTEMPTY` whatever the timing. **The guarantee is therefore the kernel's, not our check's** — and that is the difference between "we usually do not destroy your text" and "we do not destroy your text". It is also what makes Table W row **W1** a table cell rather than a code shape: under an overrule to a copying destination, the copy must complete before the sweep and the sweep must not race it |
| **X4** | **The return shape** | `{removed, skippedForVault, preservedQuarantine}`. `preservedQuarantine` is a `string[]` of shelf directories left in place, empty when nothing was preserved. **This reuses the disclose-what-you-preserve shape the function already has**: `skippedForVault` exists precisely so the caller can tell the truth about a directory it did not delete (`manifest.js:1123-1127`), and the caller already renders it (`uninstall.js:332`, `:480`). Callers that ignore the new field are unaffected; the two that print **must** disclose it (Table W rows **W5**, **W8**) |
| **X5** | **Direction against ADR-0038 — both candidate mechanisms only NARROW, and the ADR therefore chooses neither** | A carve-out makes `disposeCoreMechanics` delete **strictly less** than at `5b77865f`; a manifest "preserved kind" would make `reverse()` delete **strictly less** too. ADR-0038's **N** clause permits both and forbids neither. Its **letter** governs neither: N/R/D are scoped to *evidence-field groups added to a pre-existing manifest entry kind*, and neither of these is one (the carve-out is not a manifest field at all; a preserved kind is a new entry kind, which ADR-0038 excludes as "keys born WITH their entry kind"). Its **D** clause does not decide either: a shelf file is a **STANDALONE** artifact — a whole file under a `quarantine/` directory the user can see and `rm` — never EMBEDDED, so D permits leaving it. **So the choice below is made on other grounds, and this row exists so nobody mistakes ADR-0038 for having made it** |
| **X6** | **Why NOT a manifest "preserved kind" — ADR-0019's own alternative, considered and refused** | ADR-0019's Consequences name it (`:65`, *"or be added to the manifest as a preserved kind"*), and `WP-secret-fence-ep2-redact-arm`'s option-A row (`:303`) already weighed a variant of it. Three costs decide against it. **(a) A new manifest writer.** Nothing records a shelf file today; a preserved kind means the **dream gate** — the most attacker-adjacent code in the product, fed by transcripts (ADR-0024, ADR-0034) — writes `install-manifest.json`, the one file that drives every uninstall deletion. **(b) A user-editable file would decide whether the user's text survives.** The manifest is plaintext and attacker-writable, and ADR-0038 states plainly that it does **not** authenticate it; stripping one entry restores today's silent destruction, with nothing to detect it. **(c) A failed write is a silent revert.** `quarantinePreserve` returns `null` on any failure and the arm falls through (`validate.js:936`); a manifest write failing the same way leaves a shelf file that uninstall deletes and no signal anywhere. **The carve-out has no such state: the shelf's presence on disk is its own evidence**, and no file an attacker can edit sits between that evidence and the decision |
| **X7** | **Where `WP-scheduler-replay-manifest-independent`'s D12 pattern IS reused, and where it is not** | **Reused, deliberately:** the disclose-what-you-preserve shape (**X4**) and the error-surfacing rule (Table K rows **K3**/**K4** are that package's Table D rows **D9**/**D15** applied to this walk, with the same absence-is-the-only-special-case structure). **Not reused:** D12's `contains`-style containment over an ambient path. D12 exists because the vault path is a value read from `config.yaml` and can point anywhere; **both shelf paths are literal joins of `paths.state`** (**K1**), so there is no value to resolve and no containment question to get wrong. **`contains` (`manifest.js:1097`) is NOT called by the carve-out and stays byte-unchanged**, as does its existing use in the vault guard |
| **X8** | **The existing vault guard is unchanged and takes precedence** | `disposeCoreMechanics`'s `skippedForVault` check (`manifest.js:1144-1147`) runs **first** and is untouched: a `paths.state` that equals or contains the resolved vault is skipped whole and the carve-out never runs on it. Both rules only ever preserve, so their interaction cannot delete anything either would have kept, and the caller's existing `skippedForVault` message is unaffected |
| **X10** | **THE SWEEP NEVER FOLLOWS A SYMLINK, AT ANY LEVEL IT ENUMERATES — stated once, over every path it classifies** | *Design gate round 2, finding 1, which found a data-loss regression the round-1 child-by-child sweep introduced.* **Every classification this package makes is `fs.lstatSync`-based. `fs.statSync` — and therefore the shipped `isDir` helper (`manifest.js:175-181`, `statSync(p).isDirectory()`) — is NEVER used to decide whether to enumerate a directory or to remove anything.** `isDir` follows links, so it reports a **symlinked `state`** as a directory; **X1** step 1 would then enumerate through it and step 2 would recursively delete the link **target's** children. Astra reproduced it against mocked I/O: with `<core>/state` pointing at an external directory holding the user's own files and no `quarantine/` inside it, the gate passes and the deletion target moves from `state` to `state/personal-notes`. **That is strictly worse than `5b77865f`**, where the single `rmSync(paths.state, {recursive:true})` removes only the link — and the vault guard gives no cover, because the configured vault is somewhere else entirely. **And `lstat` alone is not enough — it classifies only a path's FINAL component, so the ORDER in which the levels are checked is itself part of the rule: Table X row X11.** **Per path, and the two treatments differ for a stated reason:** **`paths.state`** is a machine-mechanics directory ADR-0019 governs, so a symlink there is **unlinked and never descended** (**X1** step 0) — that removes no bytes, reproduces `5b77865f` exactly, and is the treatment this function already gives a symlinked **core** at `:1164-1165`. **Either shelf root** is counted as one of the user's own entries whenever it is not a real directory (Table K row **K2**), so a symlink there is **preserved, reported and never followed, removed or climbed past** (**X1** step 3). **The reviewer's recommendation was to preserve the link at `state` too; that is accepted in substance — never descend — and narrowed in form**, because unlinking a symlink destroys nothing and preserving it would leave `<core>` permanently non-empty for no safety gain. **Why the rule is ours to state even though `rmSync` behaves well:** Node's recursive `rmSync` classifies with `lstat` and unlinks a symlink instead of descending — which is exactly why `5b77865f` is safe here, and the implementer confirms it with a one-line probe rather than taking it on trust — but **the enumeration in X1 step 1 is ours**, and a guarantee inside `rmSync` says nothing about a `readdirSync` we wrote. `paths.logs`, `<core>/schedules` and `paths.secrets` keep the existing `isDir` + recursive `rmSync` path and are **out of scope**: their single `rmSync` removes a symlink without descending, as today |
| **X11** | **VALIDATION RUNS TOP-DOWN; REMOVAL RUNS BOTTOM-UP. They are two passes and they go in opposite directions** | *Design gate round 2 established the per-level `lstat` (**X10**); design gate round 3 found that a per-level `lstat` applied in the REMOVAL order is still unsafe, because it checks the leaf first.* **`lstat` classifies only the path's FINAL component — it does not reject a symlink in an intermediate component.** So `lstat(<state>/quarantine/redacted)` on a `quarantine` that is a **symlink to an external directory** happily reports the *target's* `redacted/` as a real directory, and the round-2 sequence `rmdirSync(redacted)` → *then* check `quarantine` **removes `external/redacted` before it ever discovers the link**. Astra executed X1 in memory and reproduced exactly that removal. **The window is real even with the gate in front:** the gate refuses a **pre-existing** symlinked shelf root (Table K row **K2** counts it), but `disposeCoreMechanics` is **exported** and directly callable, and a link introduced **after** the gate is the same concurrent class as Table X row **X3**'s. **The rule, stated once:** *every ancestor must be proven a real directory before any descendant is accessed at all* — so validation walks root→leaf and stops at the first level that is not one, and removal then walks leaf→root **over the validated prefix only**. Nothing below a stopped level is touched, examined or counted as removable. **Why the two passes cannot be merged:** the safety property is about *ancestors*, which only a downward walk establishes, while `rmdir`'s emptiness requirement is about *descendants*, which only an upward walk satisfies. One pass can serve one of them, never both. This is the same shape as `WP-scheduler-replay-manifest-independent`'s Table D row **D5** — two phases in opposite directions because one order cannot be both "after the evidence" and "before it is destroyed" |
| **X12** | **SHELF IDENTITY IS DECIDED BY CASE-FOLDED NAME, ON EVERY PLATFORM — never by byte-equal name** | *Design gate round 4.* **Two of the three platforms Wienerdog supports have case-insensitive filesystems by default** — APFS on macOS and NTFS as Windows configures it — while ext4 on Linux is case-sensitive. On a case-insensitive volume, a directory listed by `readdirSync` as **`Quarantine`** **is** the object `quarantinePreserve`'s lowercase `path.join(stateDir,'quarantine')` opens and writes into (`validate.js:948-951`), because the kernel resolves the lowercase path to it; enumeration still returns the stored capitalized name. So a byte-equality test `name === 'quarantine'` **fails to recognize our own shelf**, X1 step 2 recursively deletes it, and if a dream completed a preserve between the gate and the sweep the new original goes with it — **before** X1 step 3's protected `rmdir` sequence ever runs, and entirely past X10/X11, which classify types and ancestors rather than names. Astra verified case-insensitive path identity on this workspace and reproduced the deletion by executing the sequence in memory. **The rule:** `quarantine` and `redacted` are matched by an **ASCII case fold** — map only `A`–`Z` to `a`–`z` and compare; any other byte must match exactly. **That set is closed and it is an enumeration of our own good:** our directory names are pure ASCII with no combining marks, so the complete set of names a case-insensitive volume could collide with them is exactly their ASCII case variants — there is no Unicode-normalization variant to miss, and nothing is enumerated as forbidden. Use an explicit ASCII fold rather than `String.prototype.toLowerCase`, whose Unicode mappings are broader than the property being tested. **Conservative on ambiguity:** a name that folds equal but is **not byte-equal** is **preserved and reported**, never deleted and never treated as ours — on a case-sensitive volume it may be a look-alike directory the user created, and we cannot cheaply tell. Preserving it only ever deletes **less**, which is the direction ADR-0038 permits, and it makes `<state>` non-empty so **X1** step 3's climb stops there by its existing `ENOTEMPTY` rule with no extra clause. **The same fold locates the roots for the INVENTORY** (Table K row **K1**), so the plan and the act agree about which directory is the shelf; a fold mismatch between them would disclose one object and delete another. **The byte-exact lowercase path stays the removal target**: X1 step 3 still `rmdirSync`s `path.join(paths.state,'quarantine')` and its `redacted`, because that is what `quarantinePreserve` writes and what a case-insensitive volume resolves to the same inode anyway |
| **X9** | **The doc comment is corrected in the same edit** | `disposeCoreMechanics`'s JSDoc runs `manifest.js:1110-1132`, and the sentence spanning **`:1112-1116`** asserts *"none user-authored"* of `state/`. That sentence is false on this tree and is the shipped form of the invariant owner item 1's amendment narrows. It is corrected to name the shelves as the one exception, to point at ADR-0019's amendment, and to state **X1**'s no-recursive-delete rule where the next reader of that function will meet it. The `@returns` clause at `:1132-1133`'s neighbourhood also gains `preservedQuarantine`. **A comment that contradicts the amended ADR is the drift the repo's errata practice exists to catch** — and it is a comment, not a claim in a table, so it is fixed here rather than carried as a mirror |

### Table W — what the user is shown, and when (canonical)

| Row | Fact | Value |
|---|---|---|
| **W1** | **OWNER ITEM 2a — where the preserved copies go** | **RECOMMENDED VALUE: nowhere. Wienerdog writes no copy of its own.** `uninstall` stops before removing anything and tells the user to move or delete the files themselves. The two alternatives the stub named — a **fixed location in HOME** and a **user-chosen path** — are weighed in full under owner item 2, with the cost of overruling. **The package ships from either answer with the same mechanism**: Table X's carve-out is what a copying destination would need anyway (**X3**), Table K's inventory is the same walk, and the disclosure block of **W4**/**W5** changes only its closing line. What an overrule adds is a copier, and Table Y row **Y3** is that copier's binding contract, written here so an overrule is one ruling rather than one design session |
| **W2** | **OWNER ITEM 2b — may an unattended run proceed?** | **RECOMMENDED VALUE: no.** `--yes` does **not** proceed past a NON-EMPTY or UNREADABLE shelf: the refusal is printed and the process exits non-zero in exactly the same way with and without it. **This does not change what `--yes` means**, and the distinction is the reason: `--yes` skips the **prompt**, and the shipped contract at `uninstall.js:349-351` is that *"the set of valid actions is identical either way"*. A refusal is not a prompt — it removes an action from the valid set for both runs equally. **ADR-0035 governs the direction:** the attended CLI invocation is the trust surface, and the one thing a scripted, unattended run must not be able to do is irreversibly destroy the user's own text with nobody present. Note that a `--yes` run today prints **no plan at all** (**W7** of Current state item 5), so a disclosure-only design would be silent in precisely the configuration that needs it |
| **W3** | **Where the refusal is raised** | In `src/cli/uninstall.js`, immediately after `quarantineInventory` (Table K row **K5**) and **before the first `console.log`** — so before the manifest headline at `:311`, before any plan, and before every deletion. It is a `WienerdogError` in the shape the file's other refusals already use (`:286-288`, `:386-390`): a refusal, not a crash. It fires when `entries > 0` **or** `unreadable.length > 0` (**K3**/**K4**) |
| **W4** | **What the refusal says** | Plain language for knowledge workers (CLAUDE.md), and it carries exactly five things: **(1)** that nothing was removed; **(2)** the total entry count and the **total size in bytes as a plain integer** (a human-readable unit in parentheses is permitted, the integer is not optional); **(3)** one line per shelf directory **that holds at least one entry**, with its own count and byte total — a shelf directory that exists but is empty contributes no line, because by Table K row **K2** it contributes no entry either, and a refusal listing an empty directory would tell the user to deal with nothing; **(4)** the hedged statement of what these files are — *"some or all of these may be the only copy of that text on this computer, and they hold the original, not a blanked-out version"* — which is `WP-quarantine-only-copy-shelf`'s Table O row **O8** "may be" hedge, verified there against all four shelf classes and **never strengthened to "is"**; **(5)** the remedy, as two literal shell lines the user can copy — move the directory somewhere they keep, or delete it — followed by *"then run `wienerdog uninstall` again"*, and a pointer to `docs/runbooks/secret-incident.md`. **When `unreadable` is non-empty the message names each directory and its `code` instead of a count**, and says the state could not be determined. It **never prints a filename and never prints a byte of any file's content** (Table Y row **Y1**) |
| **W5** | **`--dry-run`** | Does **not** abort — it deletes nothing, and aborting would hide the plan it exists to show. It prints the same block as **W4** (same counts, same byte totals, same directories, same hedge), then one line saying that a real `wienerdog uninstall` stops at this point and that the rest of the plan is what it would do once these files are moved or deleted, and then **today's plan unchanged**. Under the carve-out that plan correctly no longer lists `<state>` under *"Machine-generated state (removed recursively, not manifest-tracked)"* (`uninstall.js:337-341`) and instead lists the preserved shelf from `preservedQuarantine` (**X4**). This preserves ADR-0019's own `--dry-run`-exactness consequence (`:68-69`) and M1's *"lists exactly what was created"* gate |
| **W6** | **The ABSENT and EMPTY cases — nothing changes at all** | No block, no extra line, no abort, no new field rendered, and `disposeCoreMechanics` behaves as at `5b77865f`. **The complete stdout of `--dry-run` and of a full `uninstall --yes` on an install with no shelf entries is byte-identical to the same run at `5b77865f`.** This is the row that keeps the package from changing every existing uninstall's output, and it is a declared RED target (Table B) |
| **W7** | **Ordering against `WP-scheduler-replay-manifest-independent`, and what must not be disturbed** | **The shelf gate runs FIRST** — before that package's Table D row **D2** discovery and therefore before its **D9** abort. Both aborts delete nothing and both are retryable, so **either order is safe**; the shelf gate goes first because it is the cheaper check (one walk inside our own core, no ambient roots) and because it reports data we would **destroy**, while D9 reports a deletion we might **fail to perform**. **Rows of that package this package must not disturb — in `uninstall.js`:** its discovery call and D9 abort, its **D3** disclosure block in both `--dry-run` and the pre-confirm plan, the `discoveredSchedules` snapshot passed to both `reverse()` calls (**D4**/**D7**), and the `vaultPath` read at `:309` that its **D12** consumes. **In `manifest.js`:** `discoverSchedulesOnDisk` (**D1**, **D9**–**D12**, **D14**, **D15**), `reverse()`'s phases **D5a**/**D5b**, `recognizeScheduleBasename`'s call site (**R2**), and `withinSchedulerRoot` / `withinAllowedRoot` / `validateEntry` / `contains`. **The two packages touch disjoint parts of `manifest.js` by that package's own declaration**: its Deliverables note fixes `disposeCoreMechanics` as byte-unchanged, and `disposeCoreMechanics` is the only function this package changes there |
| **W8** | **The closing summary when the carve-out preserved something** | The live run's three-way branch at `uninstall.js:495-501` gains a fourth arm: *"Kept `<core>` — your quarantined copies are still in it: `<dir>`"*, in the shape the file already uses for the vault and the customized config. It is **rare but reachable, not dead code**: the gate refuses on a non-empty shelf, so this arm is reached through **X3**'s concurrent-dream window, through an UNREADABLE shelf at deleter time (**K4**), or by any caller of `disposeCoreMechanics` other than `run`. It must never print the plain *"fully removed"* line while a shelf survives — **a false "fully removed" is as bad as the deletion**, which is the reason the adjacent `skippedForVault` branch already exists (`:476-483`) |
| **W9** | **The two user-facing sentences, re-derived** | Both are single edits inside existing sentences and both are written to **W1**'s cell, so an overrule rewrites them and nothing else. **`docs/runbooks/secret-incident.md`** — the sentence at `:61-63` (*"And `wienerdog uninstall` removes this folder along with everything else Wienerdog keeps, so copy out anything you want to keep before you uninstall."*) is replaced by one saying that `wienerdog uninstall` **will not remove this folder**: it stops and asks the user to move or delete these files first, so uninstalling cannot lose them. **`docs/GLOSSARY.md`** — inside the `secret quarantine` entry, the clause *"disposable — `wienerdog uninstall` removes it with everything else Wienerdog keeps"* is replaced by one saying that `wienerdog uninstall` stops while either quarantine directory still holds a file and asks the user to deal with them first. **Neither edit touches the clause `WP-quarantine-only-copy-shelf` adds about the cap and only-copies** — that package lands first (`depends_on`) and owns that clause; this package owns the uninstall clause. **The two GLOSSARY ranges overlap on paper and that is flagged deliberately** (round-zero note): that package's row **O8b** cites `docs/GLOSSARY.md:141-148`, the whole `secret quarantine` entry, which **contains** this package's `:146-147` target. There is **no content collision** — O8b adds a clause beside *"disposable"* about the cap and only-copies, this package replaces the *"`wienerdog uninstall` removes it …"* clause — but the paper overlap is why the ordering is a `depends_on` and not a convention, and why the implementer **re-derives the line numbers after that package has landed** rather than trusting either range. **Neither sentence may promise a copy, an export destination or a recovery path this package does not ship**, and neither may strengthen the "may be the only copy" hedge |

### Table Y — security rows (canonical)

| Row | Threat | What holds |
|---|---|---|
| **Y1** | A shelf byte, or a shelf filename, reaching a surface that persists or displays it | Closed at the source: the inventory reads **metadata only** (Table K row **K6**), so no file is ever opened, and the refusal prints **directory paths, an entry count and a byte total** — never a filename, never a fragment of content. Filenames are `<date>-<sanitized note basename>`, derived from the user's own note paths; the user is about to list the directory themselves, so printing them buys nothing and not printing them is strictly safer. Asserted, not assumed — acceptance criterion 5 |
| **Y2** | **A new sensitive artifact created by the uninstall itself** | Under Table W row **W1**'s recommended cell there is **no export**, so there is no new file, no new directory, no new permission decision and no new thing to leave behind. This is the subtractive form of the answer and it is why the recommendation is what it is: an export would write a fresh, unmanaged pile of **unredacted credentials** into the user's home, outside the core, outside the manifest, unknown to every future Wienerdog run and unremovable by any uninstall — the accidental-persistence outcome ADR-0034 exists to prevent, performed as the last act of a command the user ran to remove the product |
| **Y3** | The same threat **under an overrule of W1 to a copying destination** | Binding contract, written now so an overrule needs no new design. Such an export **must never**: print or log any shelf file's contents; create a destination file more permissive than `0600` or a destination directory more permissive than `0700`, or widen the mode of any path that already exists; follow a symlink out of the shelf (classify every entry with `lstat`, never `dereference`); copy anything that is not a regular file; **leave a copy the user was not told about** — every destination path is named in the pre-consent disclosure **before any byte is written**, and a run that cannot name it writes nothing; overwrite an existing file at the destination; or delete a shelf file whose copy was not verified present at the destination. **And it must not construct a destination path from a shelf-supplied name without an anchored recognizer of what `quarantinePreserve` writes** — an entry whose name is not recognized is **copied nowhere, deleted nowhere, and named in the report as left in place**, so nothing unrecognized is silently destroyed |
| **Y4** | An untrusted identifier reaching a filesystem path or an argv | Under **W1**'s cell the package builds no argv at all, and every path it constructs is either a literal join of `paths.state` (Table K row **K1**) or that join with **one `readdirSync` name that has already matched the closed ASCII-case-fold set of Table X row **X12****. **It enumerates its own good twice over:** the accepted names are exactly the ASCII case variants of `quarantine` and `redacted` — a finite, closed set, because our names are pure ASCII with no combining marks — and **everything under the shelves is treated as the user's regardless of its name**. No entry name is ever classified as bad, matched against a denylist, or used to build a path before it has matched that set; a `readdirSync` name cannot contain a separator in any case. There is no grammar here we do not own, and no name is trusted with anything |
| **Y5** | An unreadable shelf read as an empty one — the **fail-open** direction | Closed by Table K row **K4** at both sites. This is the failure that loses the data: `rmSync({force:true})` succeeds silently on a tree the walk could not see. Chmod-ing one's own `0700` directory is a same-user act and not an adversary this package defends against; what matters is that the **accident** — a permission-damaged shelf, an `EIO`, an `EMFILE` under load — cannot read as "nothing to preserve" while the tree is disposed |
| **Y6** | The manifest used to move this decision in either direction | It cannot. The shelves are not in the manifest, and **this package does not put them there** (Table X row **X6**). No forged, stripped, stale or hand-edited manifest entry changes what is preserved, whether the run refuses, or what the refusal says. ADR-0038's direction is honored twice over: the deletion only narrows, **and the narrowing does not depend on the untrusted file at all** |
| **Y7** | `--yes`, or any scripted invocation, silencing the refusal | Closed by Table W row **W2**: the refusal is raised before the `if (!yes)` branch is reached and is independent of it. Asserted for both runs, with identical text (acceptance criteria 3 and 4) |
| **Y9** | **The sweep escaping the core through a symlink and deleting files nowhere near it** | *Design gate round 2.* Closed by Table X row **X10**: every classification is `lstat`-based, a symlinked `paths.state` is unlinked without being descended, and a shelf root that is not a real directory is preserved untouched. **This is the one threat this package could have created rather than closed** — `5b77865f` is safe here by accident of using a single recursive `rmSync`, and replacing that with our own enumeration is what put it at risk. The blast radius without X10 is arbitrary: the link target is wherever the user pointed it, and neither the vault guard (`manifest.js:1144`) nor ADR-0041's clearance can see an `fs.rmSync` outside the core |
| **Y8** | Anything in this package outliving its invocation | Nothing does. One read-only directory walk, one `console.log`, one thrown `WienerdogError`, and a `fs.rmSync` that does not happen. No process, no socket, no schedule, no telemetry (ADR-0004) |

### Table B — the declared RED proofs (ADR-0042)

One file, `tests/red-proofs/adr-0019-quarantine-uninstall-export.proofs.json`.
**`expectRed` sets are MEASURED at implementation time, never predicted** — hand
-apply each mutation, run the suite under the declaration's own
`testNamePattern`, and confirm against the unfiltered run.

The **anchor** column is what is measurable *before* the implementation exists:
each count is `grep -Fc` over the named file at `5b77865f`, and a count of `1`
means a find-string built around that anchor is unique today. New code authored
by this package carries no pre-measurable anchor and says so. **Every anchor
below is shown without its leading indentation** (a code span may not carry
one); the declaration's own `find` string must include the line's real
indentation, and the measured count is the same either way.

| Proof id | Criterion | File | Mutation | Anchor at `5b77865f` (occurrences) | What it proves |
|---|---|---|---|---|---|
| `quse-carve-out-dropped` | 1, **9** | `src/core/manifest.js` | replace Table X row **X1**'s `rmdirSync` chain with a single recursive `fs.rmSync(paths.state, {recursive:true, force:true})`, restoring the pre-round-1 shape exactly | `if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });` — **1** (the line whose per-dir treatment X1 restructures for `paths.state`) | criteria 1 and 9 each assert a shelf file **survives**, which is the most vacuity-prone shape in the repo's measured catalogue: a file also survives when the fixture never created it, when the sweep ran against a different `paths.state`, when `isDir` short-circuited, and when the function threw before reaching `state/`. Without the declaration nothing separates "the carve-out worked" from "the deletion never ran". **Two `expectRed` entries, each with a ONE-element `test` path** — criterion 9's interleaving test reddens under the same mutation for the same reason, and an **undeclared** `testCodeFailure` throws (`scripts/red-proofs.js`), so it must be declared rather than noted. **MEASURE the red set; never widen `expectRed` to absorb a surprise** |
| `quse-refusal-not-raised` | 3 | `src/cli/uninstall.js` | make the gate treat NON-EMPTY as EMPTY, so the run proceeds and deletes | `const vaultPath = readVaultPath(paths.config) \|\| paths.vault;` — **1** (the adjacent, unchanged pre-plan line the gate is inserted beside) | criterion 3 asserts an **abort**, and an abort assertion goes green whenever the run fails for any reason at all — a bad fixture, a missing manifest, a throw in unrelated setup. Same shape, same reason as `WP-scheduler-replay-manifest-independent`'s `srm-unreadable-root-read-as-empty` |
| `quse-yes-skips-the-refusal` | 4 | `src/cli/uninstall.js` | gate the refusal on `!yes`, so a `--yes` run proceeds | `const yes = argv.includes('--yes');` — **1** | criterion 4 is the one the whole of Table W row **W2** rests on, and it is invisible to any suite that only ever drives the interactive path. A `--yes` suite that asserts "the run refused" passes under the mutation if it never actually passed `--yes` |
| `quse-unreadable-shelf-read-as-empty` | 8 | `src/core/manifest.js` | make the walk's `catch` swallow the error and return `unreadable: []`, restoring the fail-open shape exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the inventory's error classification | criterion 8 asserts an abort **and** zero removals, and both halves go green on a fixture that never made the shelf unreadable. This is Table K row **K4** and Table Y row **Y5**, and it is the one failure that silently destroys the data rather than merely failing to protect it |
| `quse-block-printed-on-an-empty-shelf` | 7 | `src/cli/uninstall.js` | print the block unconditionally, so an install with no shelf gets a `0 file(s), 0 bytes` block | `console.log('wienerdog uninstall — the following will be removed:\n');` — **1** | criterion 7 asserts **byte-identity with `5b77865f`** for an install with no shelf. It is the criterion that keeps this package from changing every existing uninstall's output, and a byte-identity assertion is trivially satisfiable by a fixture that compares the wrong stream or an empty one |
| `quse-symlinked-state-descended` | **14** | `src/core/manifest.js` | replace Table X row **X1** step 0's `lstat` classification of `paths.state` with the shipped `isDir` helper, restoring the round-2 regression exactly | `if (!isDir(dir)) continue;` — **1** (the shipped `statSync`-based gate the mutation reinstates; `function isDir(p) {` at `:175` is also **1** if a wider find-string is needed) | *Round 2, finding 1.* Criterion 14 asserts that an **external directory's files are unchanged** after an uninstall — a survival assertion over files the run never mentions, which goes green whenever the fixture's symlink was never created, pointed somewhere else, or was never reached. **It is also the only criterion in this package whose failure destroys data outside the core**, so it is the last one that may be left resting on a fixture nobody proved bites |
| `quse-shelf-validated-leaf-first` | **14** | `src/core/manifest.js` | reverse Table X row **X11**'s validation direction — check and remove `redacted` before classifying `quarantine`, restoring the round-3 order exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is X1 step 3's validation pass | *Round 3.* Criterion 14's round-3 arm asserts that an **external empty directory still exists** after a direct sweep. That is the weakest kind of survival assertion in the catalogue — an empty directory has no bytes to compare, so the assertion rests entirely on the fixture having built the symlink correctly and the sweep having actually run. Under the mutation `external/redacted` is removed before the link is ever noticed, which is what Astra reproduced by executing X1 in memory |
| `quse-shelf-name-case-sensitive` | **15**, 9 | `src/core/manifest.js` | replace Table X row **X12**'s ASCII fold in X1 step 2's exclusion with byte equality (`name === 'quarantine'`), restoring the round-4 defect exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is step 2's name test | *Round 4.* Criteria 15 and 9's case-fold arm assert that a capitalized shelf and the bytes inside it **survive**. Both are survival assertions, and both go green on any fixture that never created the capitalized directory, created it on the wrong volume, or left it empty when the interleaved preserve was supposed to fill it. **The defect is also invisible to every existing assertion in this package**: X10 and X11 classify types and ancestors, not names, so nothing already declared reddens under this mutation |
| `quse-dry-run-block-suppressed` | 6 | `src/cli/uninstall.js` | drop the block from the `--dry-run` arm while leaving the refusal intact | `item(s) would be removed, ${skipped.length} skipped.` — **1** | criterion 6 observes **disclosure**, not the refusal. Without this declaration a suite can assert the refusal (which is loud) and never notice that `--dry-run` — the surface a user consults precisely to find out what an uninstall will do — says nothing about the shelf at all |

**Nine declarations in one file, over eight criteria — criterion 14 carries two,
because round 2's defect and round 3's are different failures of the same rule.
Six carry a pre-measurable anchor and three mutate code this package authors**
(`quse-unreadable-shelf-read-as-empty`, `quse-shelf-validated-leaf-first`,
`quse-shelf-name-case-sensitive`).
Criterion **9** gained its declaration at round 1: an earlier revision argued it
asserted a positive effect and needed none, which was wrong — it asserts a file
**survives**, the same absence-shaped claim as criterion 1, so it is declared on
`quse-carve-out-dropped` alongside it. Whether this declared set is complete
stays a review judgment (ADR-0042 decision 5).

**Binding:** `scripts/red-proofs.js` refuses any red whose failure `code` is not
`ERR_ASSERTION`, and requires each `expectRed` entry's non-empty `signal` to
appear in the failing assertion message. Each new assertion therefore carries a
literal signal substring in its message.

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
canonical table and a registered mirror disagree (update-all-mirrors) — and any
new mirror found in review is added here on the spot (register-new-mirrors).

- [ ] **Deliverables-table cells that restate a path or rule** — the
      `manifest.js` row → Table K and Table X rows
      **X1**/**X2**/**X4**/**X9**/**X10**/**X11**/**X12**;
      the `uninstall.js` row → Table K row **K5** and Table W rows
      **W2**–**W5**/**W7**/**W8**; the two test rows → the acceptance criteria,
      and the `manifest.test.js` row additionally restates **X1**'s `ENOTEMPTY`
      arm and **K2**'s empty-shelf-directories fixture;
      the proofs row → Table B; the ADR row → owner item 1; the two doc rows →
      Table W row **W9**
- [ ] **Acceptance criteria that assert its facts** — criterion 1 asserts Table X
      rows **X1**/**X4**; criterion 2 asserts Table X row **X1**'s
      ABSENT/EMPTY arm, Table K rows **K2**/**K3** and Table W row **W6**;
      criterion 3 asserts Table W rows
      **W3**/**W4** and Table K row **K3**; criterion 4 asserts Table W row
      **W2** and Table Y row **Y7**; criterion 5 asserts Table K row **K6** and
      Table Y row **Y1**; criterion 6 asserts Table W row **W5**; criterion 7
      asserts Table W row **W6**; criterion 8 asserts Table K row **K4** and
      Table Y row **Y5**; criterion 9 asserts Table X rows **X1**/**X3**, Table
      K row **K7** and Table W row **W8**; criterion 10 asserts Table W row **W7**;
      criterion 11 asserts owner item 1's text; criterion 12 asserts Table W row
      **W9**; criterion 13 asserts the refusal's idempotence; criterion **14**
      asserts Table X rows **X10**/**X11** and Table Y row **Y9**; criterion **15**
      asserts Table X row **X12** and Table K row **K1**; criterion 16
      asserts Table B
- [ ] **Security-checklist bullets that restate a contract** *(registered at
      round 4, when the first bullet was found stating **K1**/**Y4**'s
      superseded "exactly two literal paths" claim)* — the untrusted-identifier
      bullet mirrors **K1**/**Y4**/**X12**; the symlink bullet mirrors
      **X10**/**X11**/**Y9**; the case-fold bullet mirrors **X12**; the
      no-snapshot bullet mirrors **X1**/**X2**/**X3**; the emptying-the-shelf
      bullet mirrors **K2**
- [ ] **Verification commands / greps** — the two `quarantine` greps mirror Table
      K row **K1** and Table W row **W3**; the `preservedQuarantine` grep mirrors
      Table X row **X4**; the two `contains` greps mirror Table X row **X7**; the
      two amendment greps mirror owner item 1; the two ADR-0019 header greps and
      the invariant-paragraph grep mirror ADR-0035's rule that no agent moves or
      reformats an authority line; the two guarded negated greps mirror Table W
      row **W9**
- [ ] **Current-state description** — items 1 and 7 are the measured basis of
      Table K rows **K1**/**K2**; item 2 is the basis of Table X rows
      **X1**/**X4**/**X8**/**X9**; item 5 is the basis of Table W rows
      **W2**/**W5**/**W8**; item 6 is the basis of Table W row **W3**; item 9 is
      the basis of Table W row **W9**; item 10 is the basis of the
      `promote.js`-is-out-of-scope claim
- [ ] **Operative prose steps that apply it** — the Context paragraph quoting
      ADR-0019's invariant mirrors owner item 1's erratum; the Context paragraph
      citing `WP-quarantine-only-copy-shelf`'s Table O row **O8** mirrors Table W
      row **W4**'s hedge clause; the worked example under Exact contracts
      mirrors Table K rows **K2**/**K3** and Table W rows **W4**/**W6**
- [ ] **The amendment text under owner item 1** — its "what uninstall does
      instead" paragraph mirrors Table W rows **W1**/**W2**; its "preserved kind
      is realized in code" paragraph mirrors Table X rows **X5**/**X6**; its M7
      paragraph mirrors Table W row **W6**

## Dispatch precondition — owner items

The items below are **recommendations with the cost of overruling them, not
direct rulings**. The standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the
architect records a recommendation with its overrule cost, the session may
dispatch under it, and **the owner reverses it by dated amendment**, applied by a
committed revision rather than by a dispatch message, because
`scripts/boundary-check.js` reads the Deliverables table in this file and nothing
a message says changes what CI sees. **Nothing in this repository records the
owner approving, accepting, ratifying or signing any of them, and this spec
asserts no such acceptance.**

### 1. Amend ADR-0019, or supersede it?

- *Recommendation:* **amend.**
- *Why it is an owner item at all:* ADR-0019's invariant is declared *"binding on
  all future code"*, which is the strongest form this repository uses short of a
  signature. Narrowing it is a decision about what the canonical core is allowed
  to be, not a local design choice.
- *Why amend rather than supersede:* **(a)** ADR-0019's Decision survives intact
  — `logs/`, `schedules/`, `secrets/` and the rest of `state/` are still removed
  recursively, and the core is still removed once empty. What changes is one
  exception and one sentence. **(b)** ADR-0019's own Consequences already
  anticipate the route (`:65`, *"or be added to the manifest as a preserved
  kind"*), so the amendment answers a question the ADR asked rather than
  replacing it. **(c)** Superseding orphans every citation: a Superseded ADR is
  not law, and ADR-0019 is listed in the `adrs:` frontmatter of live specs —
  including `WP-scheduler-replay-manifest-independent` — which would all need
  re-pointing in a cross-family sweep no single package's Deliverables table can
  perform. **(d)** ADR-0019 carries **no owner-signature line** (its header is
  `Status: Accepted` at `:3` and `Date: 2026-07-06` at `:4`, with a 2026-07-06
  review amendment in a blockquote at `:71-80`), so the amendment touches no
  ratification marker — and that absence is itself why this is an amendment and
  not a re-ratification request.
- *Overrule cost:* a superseding ADR must restate ADR-0019's Decision in full,
  re-derive its containment guard and its symlinked-core subtlety (`:71-80`, a
  load-bearing correction that a fresh ADR is exactly the kind of document to
  lose), and every `adrs: [… ADR-0019 …]` list in the tree becomes wrong in the
  same commit. If overruled, that sweep is its own work package and this one is
  blocked on it.
- *The amendment text, verbatim* — appended at the **end** of
  `docs/adr/0019-uninstall-disposes-core-mechanics.md`; the implementer fills
  `<DATE>` with the date the PR is opened, in both places:

  ```markdown
  ## Amendment (<DATE>) — the secret quarantine is a preserved kind, and the invariant is narrowed to what the core already holds

  Status: **ACCEPTED under standing authorization 2026-09-18 — owner signature pending.**

  **Erratum first, because the invariant above describes an intention rather than
  a property of the tree.** *"Nothing user-authored is ever written under the
  canonical core"* has been **false in the shipped product since WP-123**, and no
  amendment recorded it. `quarantinePreserve` (`src/core/dream/validate.js`)
  writes the user's own note bytes under the core at two paths:
  `state/quarantine/`, for a note the staged-output secret gate withheld, and
  `state/quarantine/redacted/`, for the pre-scrub original of a note the gate
  rewrote and committed (`WP-secret-fence-ep2-redact-arm`). Both hold the raw,
  unredacted text, and `disposeCoreMechanics` has been deleting it recursively
  with no warning naming it.

  **What is narrowed.** The invariant now reads: *nothing user-authored is
  written under the canonical core **except the secret quarantine**, which is the
  one place the product deliberately sets the user's own bytes aside, and which
  no disposal step may remove.* Everything else in the Decision above stands
  unchanged.

  **The preserved kind is realized in code, not in the manifest.** The
  Consequences above offer two routes — write to the vault, "or be added to the
  manifest as a preserved kind". The **vault** route is refused because the vault
  is a git repository that may be synced or backed up, and keeping raw
  secret-bearing bytes out of it is the gate's entire purpose. The **manifest**
  route is refused because it would make the dream gate — the most
  attacker-adjacent code in the product — a writer of `install-manifest.json`,
  the one file that drives every uninstall deletion, and would put the survival
  of the user's text at the mercy of a plaintext, attacker-writable file that
  ADR-0038 explicitly does not authenticate; stripping one entry would restore
  today's silent destruction with nothing to detect it. The preservation is
  therefore a rule inside `disposeCoreMechanics` itself, taking no argument, that
  no caller and no file on disk can switch off. Both routes only ever make
  uninstall delete **less**, so ADR-0038's narrowing rule permits either and
  chooses neither; the grounds above are what chooses.

  **`secrets/` is NOT carved out, and the distinction is the whole criterion.**
  The Decision above deletes the Google OAuth token because it is
  **re-obtainable** — `/wienerdog-google-setup` mints a new one, and leaving the
  old one stranded is its own hazard. A quarantined note is re-obtainable from
  nowhere: the vault holds either the scrubbed form or the pre-gate baseline, and
  the transcript it came from is outside Wienerdog's control and may already be
  gone. **Re-obtainability, not sensitivity, is what decides whether uninstall
  may destroy a thing.** By that test `secrets/`, `logs/`, `schedules/` and the
  rest of `state/` all stay disposable, and this amendment changes none of them.

  **What uninstall does instead.** `wienerdog uninstall` **stops before removing
  anything** while either quarantine directory holds a file, or while their state
  cannot be determined. It prints how many files and how many bytes are there and
  where they are, says that some or all of them may be the only copy of that text
  on the computer, and tells the user to move them somewhere they keep or delete
  them and run the command again. It behaves identically with `--yes`, because
  `--yes` skips the prompt and a refusal is not a prompt. **Wienerdog writes no
  copy of its own:** an export would create a new, unmanaged pile of unredacted
  credentials in the user's home — outside the core, outside the manifest,
  unknown to every future run and removable by no uninstall — which is the
  accidental-persistence outcome ADR-0034 exists to prevent, performed as the
  last act of a command the user ran to remove the product.

  **What this costs the M7 release gate**, stated rather than left to inference.
  *"install → use → uninstall leaves only the vault"* still holds for every
  uninstall that **completes**, because a completing uninstall is one whose
  quarantine was already empty. What changes is that an install holding
  unreviewed quarantined copies now has an uninstall that **refuses** until the
  user deals with them, instead of one that completes by destroying them.

  **ADR-0004 is intact.** This is a deletion that stops happening and a message
  that starts. Nothing is started that outlives the command.
  ```

- *And the pointer line, verbatim* — inserted immediately **after** line 54, so
  the invariant paragraph at `:52-54` stays byte-identical (other documents quote
  it verbatim, including this spec's Context):

  ```markdown
  > **Narrowed by the amendment at the end of this file (<DATE>):** the secret
  > quarantine (`state/quarantine/**`) is an exception to this invariant, and was
  > already one in the shipped tree when the paragraph above was written.
  ```

### 2. Where the preserved copies go, and whether an unattended run may proceed

This is Table W rows **W1** and **W2**. They are one item because they are one
question: what the command does when it finds the shelf non-empty.

- *Recommendation:* **refuse and report. Wienerdog writes no copy anywhere, and
  `--yes` does not proceed.**
- *The three candidates, weighed:*
  - **(c) refuse-and-report — RECOMMENDED.** Wienerdog writes nothing, destroys
    nothing, and hands the decision to the user at the only moment they can make
    it. It uses a refusal shape `uninstall` already has five instances of
    (Current state item 6), it is retryable, and its remedy is one command on the
    user's own files that `docs/runbooks/secret-incident.md` already tells them
    to perform. It also preserves M7 best: a completing uninstall still leaves
    only the vault.
  - **(b) a fixed location in HOME** (e.g. `~/wienerdog-quarantine/`, `0700`).
    Cheap and deterministic, no new input to validate. **Its cost is the reason
    the recommendation is not (b):** the product's last act becomes the creation
    of a permanent, unmanaged directory of **unredacted credentials** in the
    user's home that no uninstall will ever remove and no future Wienerdog run
    knows about — with the uninstalled user left holding it. That is exactly
    ADR-0019's own stated objection to leaving `secrets/` behind, and exactly
    ADR-0034's accidental-persistence class. Under `--yes` it happens with nobody
    watching.
  - **(a) a user-chosen path.** On inspection this is **not an alternative to
    (c) but an increment on top of it**: with no flag given, something must still
    happen, and that something is (c). As an increment it adds a user-supplied
    path flowing into a recursive write — the highest-risk surface the package
    could have — for a convenience the user already has in `mv` and `cp -R`.
    **Recommended as a follow-on if wanted, not as this package's answer.**
- *Overrule cost:* under (a) or (b) the package grows a copier, and Table Y row
  **Y3** becomes binding rather than contingent: every clause there — no content
  printed, `0600`/`0700` and never widened, no symlink followed, no destination
  unnamed before a byte is written, no shelf file deleted whose copy was not
  verified — must ship and be asserted. Table W rows **W4** and **W5** then name
  the destination instead of the remedy, Table W row **W9**'s two sentences say
  where the copy goes, and acceptance criteria 3 and 4 flip from asserting a
  refusal to asserting a verified copy followed by a disclosed deletion. **Table
  X, Table K and the ADR amendment's first four paragraphs are unchanged under
  either answer.**
- *The residual this recommendation accepts, named rather than buried —
  `R-unclearable-shelf`:* a user whose shelf files cannot be read or removed
  (a damaged permission on their own `0700` directory) has an `uninstall` that
  cannot complete until they repair it. The refusal names the directory and its
  error code, and the remedy is an ordinary same-user `chmod`/`rm`. It is the
  price of refusing to guess, and it is strictly better than the alternative the
  same state produces today: a silent `rmSync({force:true})` over a tree nothing
  could see.

### 3. Should the refusal have an explicit "destroy them, I know" flag?

- *Recommendation:* **no. Ship no new flag.**
- *The alternative, stated fully:* a `--discard-quarantine` flag that
  acknowledges the shelf and lets the uninstall proceed to delete it. It is a
  real option — it keeps a one-command uninstall available, and it makes the
  destruction explicitly consented rather than merely disclosed.
- *Why it is not the default:* the user already has that flag, spelled `rm -rf
  <dir>`, on their own files, and the refusal prints it literally. A product flag
  buys nothing the shell does not already offer, while adding a CLI surface whose
  whole purpose is to destroy the user's only copy of their own text — the exact
  thing this package exists to stop happening by accident. It is also the one new
  surface a scripted or agent-driven uninstall would reach for first, which
  reopens Table W row **W2** through the back door.
- *Overrule cost:* one flag, one branch, one acceptance criterion asserting that
  the flag is required and that its absence still refuses — and a permanent
  entry in the CLI's surface that a future reader will assume is safe because it
  is offered.

## Implementation notes & constraints

- **Zero new dependencies**; `node:fs` and `node:path` only.
- **Why this is one package and not a chain.** The obvious cut — the carve-out
  and the ADR amendment as an S, the gate and the disclosure as a second S —
  would ship an uninstall that silently keeps the core with no explanation of
  why, and would put the ADR amendment in one package and the behavior it
  authorizes in another. The two halves are one behavior: *do not destroy, and
  say so before you start.*
- **Why this package must NOT try to review, prune, age or announce the shelf.**
  There is no review path today (`WP-quarantine-review-cli` is `Superseded`) and
  building one here is a different product. The gate reads counts and refuses; it
  makes no judgment about any file.
- **The refusal is a `WienerdogError`**, thrown before the first `console.log`, in
  the shape the file's other refusals already use (`uninstall.js:286-288`,
  `:386-390`). It is a refusal, not a crash: the message names what was found,
  says nothing was removed, and gives the remedy.
- **`disposeCoreMechanics` must never throw.** Its shipped contract is *"never
  let this final cosmetic step crash the uninstall"* (`manifest.js:1163`), and the
  carve-out does not change that: `quarantineInventory` never throws (Exact
  contracts), and UNREADABLE inside the deleter means **preserve**, not abort
  (Table K row **K4**).
- **Do not add a lock.** The concurrent-dream window of Table X row **X3** is
  closed by `rmdirSync`'s own atomicity, not by coordinating. A lock file that
  outlives its writer is the shape ADR-0004 forbids, and the correct answer here
  costs nothing.
- **Do not re-introduce an emptiness snapshot into the deleter.** *(Round 1,
  finding 1.)* The instinct on reading Table X row **X1** is that
  `disposeCoreMechanics` should check whether the shelf is empty and then take
  the fast recursive path if it is. **That is the design round 1 falsified**: any
  interval between the check and the traversal is a window in which a completed
  preserve is destroyed. `rmdirSync` on an empty directory is not slower in any
  way that matters, and it is the only form that has no interval. If the
  implementation finds itself wanting the snapshot back, that is a spec bug — say
  so rather than adding it.
- **Never classify with `isDir`/`statSync` inside this package.** *(Round 2,
  finding 1.)* The shipped helper follows symlinks, which is correct for its
  other callers and catastrophic for an enumeration that then deletes. Use
  `fs.lstatSync` — or the shipped `isSymlink` (`manifest.js:223-229`), which is
  already `lstat`-based and is already used for the core at `:1164`. **Do not
  change `isDir` itself**: its four call sites at `5b77865f` (`:587`, `:616`,
  `:903`, `:1143`) depend on its current meaning, and altering it is a blast
  radius this package has no business taking.
- **Do not collapse X11's two passes into one loop.** *(Round 3.)* The obvious
  shape — one loop from leaf to root doing `lstat` then `rmdirSync` at each level
  — is the defect, because it reaches the leaf before it has classified the leaf's
  ancestors and `lstat` does not see intermediate components. Validate root→leaf
  first, collect the validated prefix, then remove leaf→root over that prefix
  only. Two short loops, opposite directions.
- **Compare shelf names with an explicit ASCII fold, not `toLowerCase()`.**
  *(Round 4.)* `toLowerCase` applies the full Unicode mapping, which is broader
  than the property being tested and is not what a case-insensitive filesystem
  implements. Fold only `A`–`Z` to `a`–`z` and require every other byte to match
  exactly. The set of names this accepts is finite and closed, which is the whole
  reason it is safe to use a `readdirSync` name to build a path at all.
- **The recursion ban is scoped, and the scope is the point.** `paths.logs`,
  `<core>/schedules`, `paths.secrets` and every non-`quarantine` child of
  `<state>` keep their recursive `rmSync`: they hold machine mechanics, which
  ADR-0019 governs and this package does not reopen. The ban applies to
  **`<state>` itself and the two shelves** — the paths that can hold the user's
  own text.
- **Do not reuse `contains`** for the carve-out. It fails closed on an
  unresolvable side, which is correct for its callers and wrong here (Table X row
  **X7**), and there is no containment question to answer anyway.
- **`--dry-run` must not abort**, at either site. It deletes nothing, and a
  `--dry-run` that refuses to show the plan defeats the surface's purpose.
- **Byte-identity for the empty case is a hard constraint, not a nicety.** Every
  existing uninstall test asserts against today's output; Table W row **W6** is
  what keeps them all valid, and criterion 7 is what proves it.
- **The two doc edits are user-facing text for knowledge workers** (CLAUDE.md).
  Plain language, no jargon, no file path the surrounding text has not already
  given, and the *"may be the only copy"* hedge is never strengthened.
- **Re-derive every line number at dispatch.** This spec is pinned to `5b77865f`,
  and `WP-scheduler-replay-manifest-independent` lands in both of these files
  first. Cite what you find, not what this spec predicted.
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Platform scope

**The shelves are inside the canonical core on all three supported platforms, and
this is a property of the code rather than an assumption.** `getPaths`
(`src/core/paths.js:52-77`) has **no platform branch of any kind**: `core` is
`$WIENERDOG_HOME || path.join(home,'.wienerdog')` and `state` is
`path.join(core,'state')` on darwin, linux and win32 alike;
`quarantinePreserve` then joins `stateDir` with `'quarantine'` (and
`REDACTED_SUBDIR`) with no branch either (`validate.js:948-951`). Everything this
package touches is therefore host-agnostic and **fully executable on the
development machine**: the inventory is a directory walk, the carve-out is an
`fs.rmSync` that does not happen, and the refusal is a thrown error.

The one platform-shaped question is the **unreadable** fixture of criterion 8: a
`chmod 0000` directory does not produce `EACCES` for a privileged user, and
Windows permissions do not map onto it. Assert it by **injecting the failure**
(a `readdir`/`lstat` that throws a given `code`), as the repo's other
error-classification tests do, rather than by arranging a real permission —
`quarantineInventory` classifies by `code`, so the injected code is the whole of
what the rule reads.

Nothing in this package contacts a scheduler, a network or an OS service, on any
platform, in any test.

## Security checklist

- [x] **No untrusted identifier reaches a filesystem path or an argv.** The
      package builds no argv at all, and every path it constructs is a literal
      join of `paths.state` or that join with **one `readdirSync` name that has
      already matched the closed ASCII-case-fold set** of Table X row **X12** —
      Table K row **K1**, Table Y row **Y4**. **Our own good is enumerated
      twice:** the accepted names are exactly the ASCII case variants of
      `quarantine` and `redacted` — finite and closed, because our names are pure
      ASCII with no combining marks — and every entry **under** the shelves is
      treated as the user's whatever it is called. **No bad is enumerated
      anywhere**, and no name is used to build a path before it has matched that
      set. *(This bullet claimed "exactly two paths, both literal joins" until
      round 4; it is registered as a mirror of **K1**/**Y4**/**X12** so it moves
      with them.)*
- [x] **No shelf byte and no shelf filename reaches any surface** — the inventory
      opens no file (Table K row **K6**) and the refusal prints directories,
      counts and a byte total only (Table Y row **Y1**). Asserted by criterion 5
      against a fixture whose basename and contents are both distinctive.
- [x] **Symlinks are never followed — by the INVENTORY or by the SWEEP.** The
      walk is `lstat`-based throughout; a link on the shelf is counted as an entry
      and never descended, so a planted link cannot make the walk leave the shelf
      or loop (Table K row **K2**). **The sweep is `lstat`-based too, and that is
      the round-2 finding** (Table X row **X10**, Table Y row **Y9**): `isDir`
      uses `statSync` and follows links, so classifying `paths.state` with it
      would make the new child-by-child enumeration delete a symlink target's
      files — **a regression this package would have introduced over `5b77865f`,
      with a blast radius wherever the user pointed the link.** A symlinked
      `paths.state` is unlinked and never descended; a shelf root that is not a
      real directory is preserved untouched. **And `lstat` alone was not enough**
      (round 3, Table X row **X11**): it classifies only a path's final component,
      so the levels are **validated top-down before any descendant is accessed**
      and only then removed bottom-up — otherwise `rmdirSync(<state>/quarantine/redacted)`
      reaches through a symlinked `quarantine` and removes an external directory
      before the link is ever noticed.
- [x] **The export creates no new sensitive artifact, because there is no
      export** — Table Y row **Y2**. **Under an overrule of Table W row W1, Table
      Y row Y3 is that export's binding contract**: never print contents, never
      exceed `0600`/`0700` and never widen an existing mode, never follow a
      symlink out of the shelf, never copy a non-regular entry, never leave a
      copy that was not named in the disclosure **before** any byte was written,
      never overwrite at the destination, and never delete a shelf file whose
      copy was not verified present.
- [x] **An unreadable shelf can never be mistaken for an empty one**, so the
      safety decision never fails open — Table K row **K4**, Table Y row **Y5**.
      Absence (`ENOENT`/`ENOTDIR`) is the single special case, at both sites.
- [x] **The untrusted manifest cannot move this decision in either direction** —
      the shelves are not in it and this package does not put them there (Table X
      row **X6**, Table Y row **Y6**). The deletion only ever narrows, and the
      narrowing does not depend on the untrusted file.
- [x] **`--yes` cannot silence the refusal** — Table W row **W2**, Table Y row
      **Y7**, asserted by criterion 4 and declared as a RED proof.
- [x] **The preservation cannot be switched off by a caller, and does not rest on
      a snapshot** — the carve-out takes no option and reads no inventory (Table X
      row **X2**). **No recursive delete ever reaches a path that can hold user
      text**: the shelves come off through `rmdirSync` alone, whose atomic
      `ENOTEMPTY` is the emptiness test, so a preserve completing at any instant
      during the uninstall survives it (Table X rows **X1**/**X3**, acceptance
      criterion 9).
- [x] **The shelf is recognized by case-folded name on every platform, so the
      sweep cannot fail to recognize its own directory** — Table X row **X12**.
      Two of the three supported platforms are case-insensitive by default, where
      a stored `Quarantine` **is** the object the lowercase path opens; a
      byte-equality test would have let X1 step 2 recursively delete it, and with
      it a preserve completed after the gate. The accepted set is the **closed**
      set of ASCII case variants of our own names — pure ASCII, no combining
      marks, so nothing is missed and nothing forbidden is enumerated — and an
      ambiguous fold-equal-but-not-byte-equal name is **preserved and reported**,
      never deleted and never assumed to be ours.
- [x] **Emptying the shelf actually lets the user uninstall** — the two
      product-created shelf root directories are excluded from the entry count
      (Table K row **K2**), so the remedy the refusal prints terminates. A
      protection that can never be satisfied is a denial of service on the user's
      own machine, not a safeguard.
- [x] **No process, socket, schedule or telemetry** — Table Y row **Y8**
      (ADR-0004).

## Acceptance criteria

- [ ] **1.** *(Table X rows **X1**/**X4**.)* With at least one entry under
      `<state>/quarantine`, `disposeCoreMechanics(paths, {dryRun:false,
      vaultPath})` leaves **every one of those entries on disk with its bytes
      unchanged** — asserted by reading the bytes back and comparing, not by the
      name existing — leaves `<state>` and both shelf directories in place,
      reports the preserved directories in `preservedQuarantine`, and **still
      removes** `paths.logs`, `<core>/schedules`, `paths.secrets` and every other
      child of `<state>`. Asserted with the entry on **each** shelf in turn, so
      the ancestor-preservation clause of **X1** is exercised at both depths.
- [ ] **2.** *(Table X row **X1** and Table K rows **K2**/**K3**, ABSENT and
      EMPTY arms.)* Three fixtures, each ending with `<state>` **gone** and
      `preservedQuarantine: []`: `<state>/quarantine` **absent**;
      `<state>/quarantine` present and empty; and — **the round-1 fixture** —
      **both** `<state>/quarantine/` and `<state>/quarantine/redacted/` present
      as directories holding **nothing**, for which `quarantineInventory` must
      return `entries: 0` and a full `wienerdog uninstall` must **proceed and
      complete**. That third fixture is the state the refusal asks the user to
      reach, and under the pre-round-1 counting rule it refused forever.
- [ ] **3.** *(Table W rows **W3**/**W4**.)* With at least one entry on either
      shelf, a non-dry-run `wienerdog uninstall` **exits non-zero having removed
      nothing** — the manifest, `config.yaml`, the core, every manifest-recorded
      artifact and every shelf entry are all still present with unchanged bytes —
      and its message contains the total entry count, the **total size in bytes
      as a plain integer**, both existing shelf directory paths with their own
      counts, the "may be the only copy" hedge, and the two-line remedy.
- [ ] **4.** *(Table W row **W2**, Table Y row **Y7**.)* Criterion 3 holds
      identically for `wienerdog uninstall --yes`, and the refusal's text is
      **byte-identical** between the two runs.
- [ ] **5.** *(Table K row **K6**, Table Y row **Y1**.)* Given a shelf file whose
      basename and whose contents are each a distinctive string, the refusal's
      **complete** stdout+stderr contains neither. Asserted over both strings,
      with the fixture first shown to place both on disk.
- [ ] **6.** *(Table W row **W5**.)* With a non-empty shelf, `--dry-run` **exits
      0**, prints the block with the same counts and byte total as criterion 3's
      refusal, prints the line saying a real run stops there, and still prints
      today's plan — in which `<state>` no longer appears under the
      machine-generated-state heading and the preserved shelf does.
- [ ] **7.** *(Table W row **W6**.)* On an install with no shelf entries, the
      **complete stdout of `--dry-run`, and of a full `uninstall --yes`, is
      byte-identical to the same run at `5b77865f`.** Asserted against a captured
      expectation, not by absence of the new strings alone.
- [ ] **8.** *(Table K row **K4**, Table Y row **Y5**.)* A `<state>/quarantine`
      that exists but cannot be enumerated — asserted for at least `EACCES` and
      `EIO`, by injecting the failing `code` (Platform scope) — makes a
      non-dry-run `uninstall` **abort naming that directory and its `code`, with
      the manifest and the core still present and zero files removed**.
      `ENOENT`/`ENOTDIR` on the same path does **not** abort. `--dry-run` against
      the unreadable shelf does **not** abort and reports it. **And at the
      deleter:** `disposeCoreMechanics` given the same injected failure
      **preserves** `<state>` and reports it in `preservedQuarantine` rather than
      throwing or deleting.
- [ ] **9.** *(Round 1, finding 1 — Table X rows **X1**/**X3**, Table K row
      **K7**, Table W row **W8**.)* **The INTERLEAVING case, and it is not the
      same as inserting the file beforehand.** A completed quarantine copy —
      bytes fully written and linked into place, as `quarantinePreserve` leaves
      one — created **after `disposeCoreMechanics` has begun its work on
      `<state>`** and **before** it reaches the shelf, survives the run **with
      its bytes intact**, the core is kept, and the summary prints the
      preserved-quarantine arm rather than *"fully removed"*. Asserted by
      **seaming the deletion itself** — patch `fs` in the test process so the
      file is created between the non-`quarantine` child removals and the
      `rmdirSync` climb — and asserted **for both live sweeps** (`uninstall.js:408`
      and `:467`). **Asserting only the before-the-call insertion does not test
      this**, which is exactly what round 1 measured: that weaker fixture passes
      under a snapshot-plus-recursive-delete implementation, which destroys the
      file. Declared as a RED target on `quse-carve-out-dropped` (Table B).
      **Round 4 adds the CASE-FOLD arm of the same interleaving**, and it is the
      shape Astra reproduced: the shelf exists on disk as **`Quarantine`** and is
      **empty** when the gate's inventory runs, so the gate passes, and a preserve
      completes through the lowercase path between the inventory and the sweep.
      **The original's bytes survive**, asserted by reading them back — under a
      byte-equality exclusion in X1 step 2 they do not, because step 2 runs
      **before** step 3's protected `rmdir` sequence. On a case-sensitive volume
      the fixture creates the capitalized directory directly; on a
      case-insensitive one it is the same object as the lowercase path, which is
      the point (Table X row **X12**).
- [ ] **10.** *(Table W row **W7**.)* `WP-scheduler-replay-manifest-independent`'s
      surfaces are undisturbed: its existing tests pass unchanged, its **D3**
      block still appears in `--dry-run` and in the pre-confirm plan, and its
      **D9** abort still fires on an unreadable scheduler root. Plus one ordering
      assertion: with **both** a non-empty shelf **and** an unreadable scheduler
      root, the **shelf refusal** is the message printed and nothing is removed.
- [ ] **11.** ADR-0019 carries owner item 1's amendment verbatim and the pointer
      line after `:54`; the invariant paragraph at `:52-54` is **byte-unchanged**;
      and the header lines `Status: Accepted` and `Date: 2026-07-06` are
      byte-unchanged and still at `:3` and `:4`.
- [ ] **12.** *(Table W row **W9**.)* Neither `docs/runbooks/secret-incident.md`
      nor `docs/GLOSSARY.md` still says `wienerdog uninstall` removes the
      quarantine; each says what **W1**'s cell decided; neither promises a copy,
      an export destination or a recovery path this package does not ship; and
      neither strengthens the "may be the only copy" hedge. The clause
      `WP-quarantine-only-copy-shelf` added to each file is **unchanged**.
- [ ] **13.** Idempotence. The template's "running the command twice" criterion is
      **`N/A` for `uninstall` itself** for the reason
      `WP-scheduler-replay-manifest-independent`'s criterion 7 gives — the first
      completing run removes the manifest (`uninstall.js:424`) and the second
      refuses with *"no install manifest found"* (`:285-288`) — which this
      package does not change. What it must show instead: **the refusal is
      idempotent.** Running `wienerdog uninstall` twice against an unchanged
      non-empty shelf produces the same exit status and the same message both
      times, and **zero filesystem changes in either run**, asserted by comparing
      a recursive listing with sizes and mtimes taken before and after.
- [ ] **14.** *(Round 2, finding 1 — Table X row **X10**, Table Y row **Y9**.)*
      **A symlinked `state` is never descended.** With `<core>/state` a **symlink**
      to an external directory that holds the user's own files and **no**
      `quarantine/`, a full non-dry-run `wienerdog uninstall` leaves **every file
      in that external directory present with its bytes unchanged** — asserted by
      a recursive listing with contents taken before and after — while the
      **link** at `<core>/state` is removed and the core is emptied, exactly as at
      `5b77865f`. Asserted for the shelf roots too: a **symlink at
      `<state>/quarantine`** is counted as one entry (Table K row **K2**), so the
      run **refuses**; and if the sweep is driven directly past that, the link is
      **preserved untouched and reported**, never followed and never removed.
      **Extended at round 3 — the ancestor case, asserted on the DIRECT sweep**
      (Table X row **X11**): with `<state>/quarantine` a **symlink to an external
      directory that contains an empty `redacted/`**, calling
      `disposeCoreMechanics` directly leaves **that external `redacted/` directory
      still present** — asserted by `fs.existsSync`/`lstatSync` on the external
      path, **not** by file bytes, because an empty directory has none and the
      first half of this criterion would miss its removal entirely. The
      `quarantine` link and `<state>` are both preserved and reported. Assert the
      same for a symlinked `<state>` whose target holds an empty
      `quarantine/redacted/`.
- [ ] **15.** *(Round 4 — Table X row **X12**, Table K row **K1**.)* **Shelf
      identity is case-folded, and the plan and the act agree about it.** Three
      arms. **(a)** With `<state>` holding a directory named **`Quarantine`** that
      contains a file, `quarantineInventory` **counts that file**, the run
      **refuses**, and the refusal names the directory **by its actual on-disk
      name**. **(b)** With `<state>` holding a **non-empty** `Quarantine` and the
      sweep driven directly, X1 step 2 **does not recursively delete it** — every
      byte in it survives — and it is reported in `preservedQuarantine`. **(c)**
      The ambiguity rule: a child whose name folds equal but is **not byte-equal**
      to `quarantine` is **preserved and reported** even when the byte-exact
      lowercase `quarantine` also exists beside it (a case-sensitive-volume
      fixture), and `<state>` is then preserved too by X1 step 3's existing
      `ENOTEMPTY` rule. Every arm asserts against an **explicit ASCII fold**, not
      `toLowerCase`.
- [ ] **16.** The declared RED proofs of Table B are `PROVEN` in an **UNFILTERED**
      `npm run red-proofs` run, with no `FILTERED`, `VACUOUS`, `UNCONTROLLED` or
      `FAILED` verdict.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint

# The shelves are known to the deleter and to the CLI (Table K row K1, Table W row W3).
# Both must print a hit.
test -f src/core/manifest.js && grep -n 'quarantine' src/core/manifest.js
test -f src/cli/uninstall.js && grep -n 'quarantine' src/cli/uninstall.js

# disposeCoreMechanics reports what it preserved (Table X row X4).
test -f src/core/manifest.js && grep -n 'preservedQuarantine' src/core/manifest.js

# contains() is NOT repurposed: it stays the vault guard's helper, byte-unchanged
# (Table X row X7). Both must print, exactly as at 5b77865f.
test -f src/core/manifest.js && grep -Fn 'function contains(outer, inner) {' src/core/manifest.js
test -f src/core/manifest.js && grep -Fn 'contains(dir, vaultPath)' src/core/manifest.js

# ADR-0019: the amendment landed (criterion 11).
test -f docs/adr/0019-uninstall-disposes-core-mechanics.md \
  && grep -n 'the secret quarantine is a preserved kind' docs/adr/0019-uninstall-disposes-core-mechanics.md
test -f docs/adr/0019-uninstall-disposes-core-mechanics.md \
  && grep -n 'ACCEPTED under standing authorization 2026-09-18' docs/adr/0019-uninstall-disposes-core-mechanics.md

# ...and its header and its invariant paragraph did not move or change
# (criterion 11; ADR-0035's rule that no agent moves or reformats an authority line).
# The first two must print at lines 3 and 4 respectively, exactly as at 5b77865f.
grep -n '^Status: Accepted$' docs/adr/0019-uninstall-disposes-core-mechanics.md
grep -n '^Date: 2026-07-06$' docs/adr/0019-uninstall-disposes-core-mechanics.md
grep -Fn 'canonical core; the vault is always outside it** — is binding on all future' \
  docs/adr/0019-uninstall-disposes-core-mechanics.md

# The two stale user-facing sentences are gone (criterion 12). Each command must
# succeed SILENTLY; a printed line means the stale sentence survived. Both are
# guarded with `test -f` so a deleted file reddens instead of passing on grep's exit 2.
test -f docs/GLOSSARY.md && ! grep -Fn 'removes it with everything else Wienerdog keeps' docs/GLOSSARY.md
test -f docs/runbooks/secret-incident.md \
  && ! grep -Fn 'folder along with everything else Wienerdog keeps' docs/runbooks/secret-incident.md

# The declared RED proofs (criterion 16) — UNFILTERED.
npm run red-proofs
```

Every positive `grep` above targeting a file this package edits is guarded with
`test -f`, and both **negated** greps are guarded too — an unguarded `! grep`
passes hardest when the file does not exist, which is exactly where the work was
never done (`docs/runbooks/spec-authoring.md`). Observe each new check in all
three states — **absent → red, compliant → green, violating → red** — and paste
all of them. **"`disposeCoreMechanics`'s other behavior is unchanged" is
deliberately NOT a grep:** a fixed-string count over its sweep loop changes the
moment the carve-out is inserted, so the check would be false on arrival. That
claim is carried by criteria 1, 2 and 7 and by the Out-of-scope list.

## Out of scope (do NOT do these)

- **Any review, listing, ageing, banner or `doctor` surface for the shelves.**
  `WP-quarantine-review-cli` is `Superseded` and `doctor`'s `quarantineReport`
  (`src/cli/doctor.js:498`) counts the **transcript ledger**, a different object;
  neither is touched.
- **The retention cap and the prune.** `REDACTED_RETENTION_CAP` and
  `pruneRedactedOriginals` are `WP-secret-fence-ep2-redact-arm`'s Table N and
  `WP-quarantine-only-copy-shelf`'s Table O. Unchanged here.
- **`src/core/dream/validate.js` and `src/core/dream/promote.js`.** Neither the
  write sites nor the dream-report line changes — Current state item 10 records
  why the *"while it is there"* line is not falsified by this package.
- **Anything that writes user content into the vault.** That was option A of the
  2026-07-27 ruling and the owner did not choose it.
- **Transactional uninstall, `R-failed-unload`, and every row of
  `WP-scheduler-replay-manifest-independent`** — Table W row **W7** lists what
  must stay byte-unchanged.
- **`tests/integration/uninstall-core-e2e.test.js`.** Its install→uninstall path
  has an empty shelf, so Table W row **W6** makes it unchanged by construction;
  adding a shelf fixture there duplicates criteria 1–9 at ten times the runtime.
- **A `--discard-quarantine` flag** — owner item 3, recommended against.
- **Making `secrets/` survive uninstall** — answered NO in the amendment, on the
  re-obtainability criterion.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(uninstall): stop uninstall destroying the secret quarantine (WP-adr-0019-quarantine-uninstall-export)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
6. **DISPATCH PRECONDITION.** (a) **The design gate is OPEN.** This spec was
   matured from its stub on 2026-09-18. **Round 1 (Astra) returned
   `needs-attention` with two findings, both ACCEPTED IN FULL and applied** —
   raw and focus committed **before** adjudication at `5084f7c1`, dispositions in
   `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-review.md`.
   The HEAVY finding falsified the previous Table X row **X1**: a
   snapshot-selected recursive delete narrows the concurrent-preserve window
   rather than closing it, and acceptance criterion 9 could not have detected the
   failure. **X1 is now a no-recursive-delete rule plus an `rmdirSync` climb**,
   **X2** is snapshot-free, **K7** has no second inventory, and criterion 9 is an
   interleaving test with a RED declaration. The second finding corrected Table K
   row **K2**: counting the product-created shelf root directories made an
   emptied shelf refuse forever.
   **Round 2 (Astra) held the `rmdirSync` sweep and the K2 exclusion** (raw at
   `85041d69`) and returned one further band-A HEAVY finding — a **regression
   round 1's own fix introduced**: the new child-by-child enumeration classified
   `paths.state` with the `statSync`-based `isDir`, so a symlinked `state` was
   descended and the link target's files deleted, where `5b77865f`'s single
   recursive `rmSync` removed only the link. Accepted in full and applied as
   **X10**, the never-follow-a-symlink rule stated once over every path this
   package classifies, with acceptance criterion **14** and RED proof
   `quse-symlinked-state-descended`.
   **Round 3 (Astra) held X10 and X1 step 0** (raw at `a0693065`) and returned one
   further band-B finding, weighted **HEAVY** because it changes the deletion
   order the implementer builds: `lstat` classifies only a path's **final**
   component, so validating in the **removal** order reached
   `<state>/quarantine/redacted` through a symlinked `quarantine` and removed an
   external directory before the link was noticed. Accepted in full and applied as
   **X11** — validate top-down, remove bottom-up over the validated prefix only —
   with criterion **14** extended to the direct-sweep, empty-external-directory
   case and a second RED proof, `quse-shelf-validated-leaf-first`.
   **Round 4 (Astra) held X11** (raw at `084142ed`) and returned one further
   band-A HEAVY finding: X1 step 2 excluded the shelf by **byte-equal** name, so
   on a case-insensitive filesystem — APFS and NTFS, two of the three supported
   platforms — a stored `Quarantine` was not recognized as the object the
   lowercase path writes into, and step 2 recursively deleted it together with any
   preserve completed after the gate. Accepted in full and applied as **X12**, the
   case-fold identity rule, with acceptance criterion **15**, the case-fold arm of
   criterion **9**, and RED proof `quse-shelf-name-case-sensitive`.
   **One confirming round remains**; the gate closes on a clean or LIGHT-only
   return (`docs/runbooks/codex-review.md`, "Weighted closure"). **A review gate is not owner approval:**
   nothing in this repository records the owner approving, accepting, ratifying
   or signing this package, and the ADR-0019 amendment it drafts carries
   **"owner signature pending"**. (b) **Owner items 1, 2 and 3 remain OPEN**,
   travelling with this package as recommendations in the standing form; the
   owner reverses any of them by dated amendment, applied by a committed
   revision. (c) **`WP-scheduler-replay-manifest-independent` and
   `WP-quarantine-only-copy-shelf` land first** (`depends_on`): the first
   rewrites both of this package's source files and the second owns the
   neighbouring clause in both of its documentation files.
