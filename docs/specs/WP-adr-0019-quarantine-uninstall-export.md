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
| modify | src/core/manifest.js | add and export `quarantineInventory` (Table K); add the carve-out inside `disposeCoreMechanics` and its `preservedQuarantine` return field (Table X rows **X1**/**X2**/**X4**), classify every swept path with `lstat` (Table X row **X10**) in the top-down-then-bottom-up order of Table X row **X11**, match the shelf names by ASCII case fold (Table X row **X12**), keep every non-shelf deletion failure propagating (Table X row **X13**), make the `dryRun: true` arm a read-only planner (Table X row **X15**), resolve every path by Table X row **X17**'s single rule (absence is not a failure), compute the protected **SET** — the chain closure of Table X row **X17 (1a)** — **before any mutation at all** and gate **every** mutating operation in the disposer on them — step 0b's unlink included (Table X rows **X18**/**X19**, Table **V**), abort the live replay when the protected set cannot be constructed and return `shelfGuarded` (Table X row **X22**), add the pre-dispatch shelf guard to `reverse()` (Table X row **X16**, **all three clauses** — including **X20**'s resolution-chain clause for the `symlink` kind — **both halves** — from below for every mutating kind, from above for the recursively-deleting kinds Table **V** enumerates; its pre-dispatch region **only**; no reverser body, signature or return shape changes), and correct that function's doc comment (Table X row **X9**). **`isDir` (`:175-181`) is not changed and not removed** — measured at `5b77865f`, it has exactly four call sites (`:587`, `:616`, `:903`, `:1143`), all of which keep it, including `:1143` for `logs`/`schedules`/`secrets`; this package simply does not use it to decide anything about `state/` or the shelves. `contains`, `withinSchedulerRoot`, `withinAllowedRoot`, `validateEntry`, **every reverser body inside `reverse()`** and everything `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged — `reverse()` itself is edited **only** in its pre-dispatch region, per **X16** — Table W row **W7**, Table X row **X7** |
| modify | src/cli/uninstall.js | call `quarantineInventory` **once, before anything is printed** (Table K row **K5**); raise the refusal (Table W rows **W2**/**W3**/**W4**); print the `--dry-run` block (**W5**); add the preserved-quarantine branch to the closing summary (**W8**); **stop immediately before the manifest delete when any sweep preserved something, a fresh `quarantineInventory` read reports anything, or `reverse()` returned a non-empty `shelfGuarded`** (Table W row **W10**, Table X row **X22**), and name the preserved directory literally in the summary (**W8**, Table W row **W11**). `requireDeletionClearance`, the byte-exact manifest compare, the `vaultPath` read at `:309`, and every line `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged — Table W row **W7** |
| modify | tests/unit/manifest.test.js | Table K's four outcomes **including the both-shelf-directories-empty fixture** (**K2**/**K3**), the carve-out's `rmdirSync` climb and its `ENOTEMPTY` preservation (**X1**), the return field (**X4**), the deleter's enumeration-failure arm (**K4**), the **interleaving** tests of acceptance criterion 9 (**X3**) including its **alias** arm (**X18**), the **direct-sweep alias** arms of acceptance criterion 1 (**X18**/**X19**/**X17 (1a)**, including the `<state>` → `<core>/logs` case and the **two-hop** `<state>/quarantine` → `<state>/cache/link` → `<core>/logs/recovery` case, each across **both** live disposer calls **and** a retry), the **symlinked-`state` and symlinked-`quarantine` regressions** of acceptance criterion 14 (**X10**/**X11**), the **case-fold** arms of acceptance criteria 9 and 15 (**X12**), the **propagation boundary** of acceptance criterion 16 (**X13**), the **symlinked-core** arms of acceptance criterion 2 (**X17 (1a)** class (ii)), the **read-only dry-run planner** of acceptance criterion 17 (**X15**), the **forged-manifest-entry interleavings** of acceptance criterion 18, from below **and** from above, with the `{kind:'dir'}` negative control and the **absent-shelf** and **created-after-guard-init** arms, and the **resolution-chain** arm of acceptance criterion 18 (**X16**, **X17**, **X20**, Table **V**), and the Table Y rows that are unit-observable |
| modify | tests/unit/uninstall.test.js | the refusal with and without `--yes`, the no-filename/no-content assertion (**Y1**), `--dry-run` (**W5**), the empty- and absent-shelf byte-identity (**W6**), the unreadable-shelf abort (**K4**), and the ordering assertion of Table W row **W7**, the **manifest-survives-a-preserving-sweep** test of acceptance criterion 19 (**W10**) and its **replay-guard** and **set-level abort** arms (**X22**), the **after-the-first-sweep** arm of acceptance criterion 9 (**W10**/**W11**), and the **symlinked-`state`-with-no-shelf completion and retry** arm of acceptance criterion 14 (**X17 (1a)**/**X19**), the **stable-symlinked-core physical-path** arm of acceptance criterion 18(b) (**X17 (1a)**), the **before-the-unlink + full-retry** arm of acceptance criterion 9 (**X19** clause (b)), and its **ancestor-of-a-replay-target** arm with an injected `secrets` failure (**X19** clause (b) as round 19 restated it) |
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
 *  X12). The no-throw handling is SCOPED to the shelf levels and to the
 *  pre-existing empty-core step (Table X row X13): a failure enumerating
 *  `paths.state`, or removing any non-shelf child, `logs/`, `schedules/` or
 *  `secrets/`, still PROPAGATES exactly as before, so `uninstall.js` never
 *  reaches its manifest and config deletes and the install stays retryable.
 *
 *  `reverse()` additionally returns `shelfGuarded: string[]` — the entries its
 *  pre-dispatch shelf guard skipped (Table X rows X16, X22). `skipped` keeps its
 *  contents and its rendering; `shelfGuarded` is a strict subset of it, exposed
 *  separately because Table W row W10 must distinguish a shelf-guard skip from an
 *  ordinary one. Empty on an ordinary install.
 *
 *  `dryRun: true` is a READ-ONLY PLANNER (Table X row X15), not a disposal with
 *  the writes removed: it runs `quarantineInventory` — same fold, same top-down
 *  validation — performs NO mutating filesystem call at all, and returns
 *  `removed` as PREDICTED removals at the same granularity. The live arm stays
 *  snapshot-free; only the planner is exempt, because it deletes nothing and so
 *  has no interval to race. Otherwise its non-`quarantine` children are removed
 *  recursively as before, no shelf
 *  FILE is ever deleted, and `<state>/quarantine/redacted`, `<state>/quarantine`
 *  and `<state>` come off bottom-up with NON-RECURSIVE `fs.rmdirSync` only —
 *  `ENOTEMPTY` (or any code but `ENOENT`/`ENOTDIR`) preserves that directory and
 *  every ancestor of it, and stops the climb. `paths.logs`, `<core>/schedules`
 *  and `paths.secrets` are untouched by this change.
 *  @returns {{removed: string[], skippedForVault: string[],
 *             preservedQuarantine: string[]}} `removed` KEEPS ITS ORIGINAL
 *  MECHANICS-DIRECTORY GRANULARITY (Table X row X4): `paths.state` appears in it
 *  at most once and only when the whole of <state> is gone; the intermediate
 *  rmdirs of `quarantine` and `redacted` are internal and never appear, and when
 *  any shelf level was preserved `paths.state` does not appear at all. The
 *  caller sums `removed.length` and renders it, so this granularity is what keeps
 *  an empty-shelf uninstall byte-identical to before. The third field lists the
 *  directories this call left in place (`[]` when it preserved nothing), in the shape the caller already uses for `skippedForVault`
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
This spec's own canonical tables are **K**, **X**, **V**, **W**, **Y** and **B**.
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
| **K4** | **UNREADABLE is never EMPTY — one rule, two sites, both preserving** | This is the fail-open direction and it is the one that destroys data: an `EACCES` read as "nothing on the shelf" would let the gate pass and `disposeCoreMechanics`'s `rmSync({force:true})` — which reports nothing — take the tree anyway. The rule is therefore stated once and **what it maps to differs by site, always toward preservation**: **at the gate** (Table W row **W3**), a non-empty `unreadable` **ABORTS** a non-dry-run uninstall before any disclosure and before any deletion, naming each directory and its `code`; **inside `disposeCoreMechanics`, AT A SHELF LEVEL ONLY** (an `lstat` failure in **X11**'s validation pass, or an `rmdirSync` failure in its removal pass), it **PRESERVES** — the level and its ancestors are left in place and reported in `preservedQuarantine` — because that function runs mid-uninstall, where an abort leaves a half-reversed install, and because the only outcome of preserving is that more of the user's text survives. **This arm is scoped to the shelf and it is Table X row X13 that scopes it:** a failure enumerating `<state>` itself, or removing any non-shelf child, `logs/`, `schedules/` or `secrets/`, **still throws out of the function exactly as at `5b77865f`** — round 5 found that a blanket no-throw reading would swallow an `EPERM` on `secrets/`, strand a credential, and then let the manifest be deleted so the retry could not run. `--dry-run` does **not** abort at either site; it prints the unreadable directories and continues, because it deletes nothing. **This is `WP-scheduler-replay-manifest-independent`'s Table D rows D9 and D15 applied to this walk**, with the same reason and the same single special case (absence) |
| **K5** | **When the gate's inventory runs** | **Exactly once per `uninstall` invocation, before anything is printed** — before the manifest headline (`uninstall.js:311`), before `WP-scheduler-replay-manifest-independent`'s schedule discovery and therefore before its D9 abort (Table W row **W7**). That single result is the only one the **gate** ever uses. **The `dryRun: true` planner of Table X row X15 calls the same function again, read-only**, and its result is a **prediction**, never a consent figure; nothing is deleted on that path, so a second read cannot widen anything |
| **K6** | **The inventory never reads a file's CONTENTS** | `readdir` + `lstat` only. Nothing opens a shelf file, so no shelf byte can reach stdout, a log, an error message or an argv (Table Y row **Y1**). `bytes` comes from `lstat`'s `size`, which is metadata |
| **K7** | **The LIVE deleter takes NO inventory — there is no second number to diverge** | *Rewritten at design gate round 1, finding 1.* An earlier revision had `disposeCoreMechanics` run its own inventory and branch on it; that is a snapshot, and a snapshot narrows the race rather than closing it. **Under Table X row X1 the LIVE deleter performs no emptiness test at all** (the `dryRun: true` planner is Table X row **X15** and deletes nothing, so it is exempt): it never deletes a shelf file, and it removes each shelf directory with a single non-recursive `rmdirSync`, whose own atomic failure on a non-empty directory *is* the test. So the gate's number is the only number **that anything acts on**, it is purely a **disclosure** figure, and what survives is decided at deletion time by the kernel. *(Table X row **X15**'s `dryRun: true` planner reads the inventory again, but it deletes nothing and produces a prediction, not a second consent figure.)* Consent integrity holds without a byte-compare and in the strongest form available: **nothing the user was not told about is ever deleted, and the only thing that can change after the disclosure is that more of their text survives** |

### Table X — the deletion-side contracts (canonical)

*Two deleters reach the shelf and both are governed here: the carve-out in
`disposeCoreMechanics` (rows **X1**–**X15**) and the shelf guard in `reverse()`
(row **X16**, added at design gate round 8). A contract that governed only the
first would be a protection with a documented way around it.*

| Row | Fact | Value |
|---|---|---|
| **X1** | **The rule — NO RECURSIVE DELETE EVER TOUCHES A PATH THAT CAN HOLD USER TEXT** | *Rewritten at design gate round 1, finding 1, which falsified the previous snapshot-conditional form.* **`disposeCoreMechanics` never calls `fs.rmSync(…, {recursive:true})` on `paths.state`, on `<state>/quarantine` or on `<state>/quarantine/redacted`, under any inventory outcome, and it never deletes a shelf file at all.** For `paths.state` it does exactly this, in order — **and the order begins with the protected targets, which is round 12's correction**: **(0a)** **compute the PROTECTED SHELF TARGETS FIRST, before any mutation at all**, including before step 0b — Table X row **X17**'s anchors, lexical **and** resolved-through-the-nearest-validated-existing-ancestor, alias-aware; **(0b)** classify `paths.state` with **`fs.lstatSync`** (Table X row **X10**) — **if it is a symlink whose resolved target contains, equals or is contained by a protected shelf target, PRESERVE the link and report it, and stop** (Table X row **X19**); **if it is a symlink whose target overlaps no shelf, `fs.unlinkSync` the link and stop**: no enumeration, no child removal, nothing below it is touched, which is byte-for-byte what `5b77865f` does and what this same function already does one level up for a symlinked core (`manifest.js:1164-1165`); if it is not a directory at all, do nothing; **(1)** with the targets already in hand from step 0a, — Table X row **X17**'s anchors, lexical **and** resolved-through-the-nearest-validated-existing-ancestor, alias-aware — and then enumerate `paths.state`'s direct children; **(2)** for every child whose name does **not ASCII-case-fold to `quarantine`** (Table X row **X12** — **not** byte-equality) **and which passes Table X row X16's symmetric containment check against those protected targets**, `fs.rmSync(child, {recursive:true, force:true})` — otherwise behaviour is unchanged, and the recursion is permitted there because those are the machine mechanics ADR-0019 governs. **A child that folds equal but is not byte-equal is PRESERVED and reported, never deleted**, because nothing cheap can tell whether it is our shelf under a different spelling or a look-alike the user made. **And a child whose resolved target CONTAINS, EQUALS or IS CONTAINED BY a protected shelf target is PRESERVED and reported too** — Table X row **X18**, the round-11 clause — with an unanswerable resolution preserving, per **X17** outcome (4); **(3)** **VALIDATE TOP-DOWN, THEN REMOVE BOTTOM-UP — two passes, and the order of the first one is the whole of Table X row X11.** *Validation pass, root to leaf:* `lstat` `<state>`, then `<state>/quarantine`, then `<state>/quarantine/redacted`, **stopping at the first level that is not a real directory** — a symlink, a file, a socket, or an `lstat` failure other than `ENOENT`/`ENOTDIR`. That level and **everything below it is off-limits: not accessed, not `lstat`ed further, not removed**. A level reporting `ENOENT`/`ENOTDIR` is simply absent and validation stops there with nothing below it to consider. *Removal pass, leaf to root, over the validated prefix only:* `fs.rmdirSync` each validated directory in reverse order — `redacted`, then `quarantine`, then `<state>` — each in its own `try/catch`, **non-recursive empty-directory removal only**. Per outcome: success ⇒ **internal bookkeeping only — nothing is pushed onto the public `removed` array here** (Table X row **X4**); `ENOENT`/`ENOTDIR` ⇒ already gone, not an error, continue; **`ENOTEMPTY`/`EEXIST` ⇒ PRESERVE, push onto `preservedQuarantine`, and stop climbing** (an ancestor of a preserved directory is preserved by construction); any other code ⇒ preserve and report the same way. **A level the validation pass stopped at is PRESERVED untouched and reported** — never `rmdirSync`'d, never `unlinkSync`'d, never followed — because Table K row **K2** already counts exactly that object as one of the user's entries, and so is every ancestor of it. `paths.logs`, `<core>/schedules` and `paths.secrets` keep their single recursive `rmSync` (`manifest.js:1148`), **unchanged in every case**. **`rmdirSync` is the whole mechanism**: it removes a directory *if and only if* it is empty, atomically, in the kernel — so the emptiness test and the deletion are one syscall and there is no interval between them for anything to arrive in. This is the shape `disposeCoreMechanics` already uses one level up for the core itself (Current state item 2, `:1151-1170`), generalized downward |
| **X2** | **Unconditional AND snapshot-free ON THE LIVE ARM — there is nothing to turn off** | *Scoped to the live arm at design gate round 7; the `dryRun: true` planner is Table X row **X15** and is deliberately exempt, because a planner deletes nothing and so has no interval to race.* The carve-out takes no parameter, reads no flag, consults no caller **and, when actually deleting, consults no inventory**: `disposeCoreMechanics` does **not** call `quarantineInventory` on the live arm. It is not a check the deleter performs — **it is the absence of a recursive delete**, plus a syscall that fails when it must. That matters twice over. **A preservation property a caller's argument can switch off is a property of the call sequence, not of the deleter** — and this deleter has four call sites in one file today (`uninstall.js:318`, `:354`, `:408`, `:467`) and is exported (`manifest.js:1174`). **And a preservation property that reads a snapshot and then acts is a property of an instant, not of the run** — which is precisely what round 1 falsified |
| **X3** | **Why the carve-out is NOT made redundant by the gate — and why it now CLOSES the window rather than narrowing it** | The gate runs once, before the plan. **The dream job is scheduled and shares no lock with `uninstall`** — Wienerdog has none, and cannot have one (ADR-0004) — so a dream run can complete a preserve **after** the gate has passed and **before**, or **during**, `disposeCoreMechanics`'s work at `uninstall.js:408`. **A second inventory inside the deleter would not have fixed this**, and round 1 is where that was measured: a recursive `rmSync` selected by an emptiness snapshot still traverses afterwards, so a file landing between the snapshot and the traversal is destroyed. **X1's algorithm has no such interval at all**: the shelf's contents are never a deletion target, and the directories come off only through `rmdirSync`, which a single arriving file makes fail with `ENOTEMPTY` whatever the timing. **The guarantee is therefore the kernel's, not our check's** — and that is the difference between "we usually do not destroy your text" and "we do not destroy your text". It is also what makes Table W row **W1** a table cell rather than a code shape: under an overrule to a copying destination, the copy must complete before the sweep and the sweep must not race it |
| **X4** | **The return shape — and `removed` KEEPS ITS ORIGINAL GRANULARITY** | *Granularity clause added at design gate round 6, which found the earlier wording contradicting Table W row **W6**.* The shape is `{removed, skippedForVault, preservedQuarantine}`. **`removed` reports at MECHANICS-DIRECTORY granularity, exactly as at `5b77865f`: `paths.state` appears in it AT MOST ONCE.** On the **live** arm that means *only when the whole of `<state>` is gone* — when **X1** step 3's final `fs.rmdirSync(<state>)` succeeded, or when step 0 unlinked a symlinked `<state>` (**X10**). On the **`dryRun: true`** arm it means *predicted gone* — Table X row **X15**'s read-only planner decides it, and the granularity rule is identical in both. **The intermediate `rmdirSync`s of `redacted` and `quarantine` are INTERNAL bookkeeping and never appear in it**, and **when any shelf level was preserved, `paths.state` does not appear at all** — `preservedQuarantine` carries the detail instead. **Why this is a contract and not a formatting choice:** `uninstall.js` sums `removed.length` into the user-facing *"Removed N item(s)"* line (`:471-473`) and renders the same array as the `--dry-run` mechanics plan (`:337-341`), so pushing three paths where the baseline pushes one changes both the count and the plan on an install with two **empty** shelf directories — which is precisely the state Table W row **W6** and acceptance criterion 7 require to be byte-identical to `5b77865f`. Astra's mocked execution measured the two-item difference. `preservedQuarantine` is a `string[]` of shelf directories left in place, empty when nothing was preserved. **This reuses the disclose-what-you-preserve shape the function already has**: `skippedForVault` exists precisely so the caller can tell the truth about a directory it did not delete (`manifest.js:1123-1127`), and the caller already renders it (`uninstall.js:332`, `:480`). Callers that ignore the new field are unaffected; the two that print **must** disclose it (Table W rows **W5**, **W8**) |
| **X5** | **Direction against ADR-0038 — both candidate mechanisms only NARROW, and the ADR therefore chooses neither** | A carve-out makes `disposeCoreMechanics` delete **strictly less** than at `5b77865f`; a manifest "preserved kind" would make `reverse()` delete **strictly less** too. ADR-0038's **N** clause permits both and forbids neither. Its **letter** governs neither: N/R/D are scoped to *evidence-field groups added to a pre-existing manifest entry kind*, and neither of these is one (the carve-out is not a manifest field at all; a preserved kind is a new entry kind, which ADR-0038 excludes as "keys born WITH their entry kind"). Its **D** clause does not decide either: a shelf file is a **STANDALONE** artifact — a whole file under a `quarantine/` directory the user can see and `rm` — never EMBEDDED, so D permits leaving it. **So the choice below is made on other grounds, and this row exists so nobody mistakes ADR-0038 for having made it** |
| **X6** | **Why NOT a manifest "preserved kind" — ADR-0019's own alternative, considered and refused** | ADR-0019's Consequences name it (`:65`, *"or be added to the manifest as a preserved kind"*), and `WP-secret-fence-ep2-redact-arm`'s option-A row (`:303`) already weighed a variant of it. Three costs decide against it. **(a) A new manifest writer.** Nothing records a shelf file today; a preserved kind means the **dream gate** — the most attacker-adjacent code in the product, fed by transcripts (ADR-0024, ADR-0034) — writes `install-manifest.json`, the one file that drives every uninstall deletion. **(b) A user-editable file would decide whether the user's text survives.** The manifest is plaintext and attacker-writable, and ADR-0038 states plainly that it does **not** authenticate it; stripping one entry restores today's silent destruction, with nothing to detect it. **(c) A failed write is a silent revert.** `quarantinePreserve` returns `null` on any failure and the arm falls through (`validate.js:936`); a manifest write failing the same way leaves a shelf file that uninstall deletes and no signal anywhere. **The carve-out has no such state: the shelf's presence on disk is its own evidence**, and no file an attacker can edit sits between that evidence and the decision |
| **X7** | **Where `WP-scheduler-replay-manifest-independent`'s D12 pattern IS reused, and where it is not** | **Reused, deliberately:** the disclose-what-you-preserve shape (**X4**) and the error-surfacing rule (Table K rows **K3**/**K4** are that package's Table D rows **D9**/**D15** applied to this walk, with the same absence-is-the-only-special-case structure). **Not reused:** D12's `contains`-style containment over an ambient path. D12 exists because the vault path is a value read from `config.yaml` and can point anywhere; **both shelf paths are literal joins of `paths.state`** (**K1**), so there is no value to resolve and no containment question to get wrong. **`contains` (`manifest.js:1097`) is NOT called by the carve-out and stays byte-unchanged**, as does its existing use in the vault guard |
| **X8** | **The existing vault guard is unchanged and takes precedence** | `disposeCoreMechanics`'s `skippedForVault` check (`manifest.js:1144-1147`) runs **first** and is untouched: a `paths.state` that equals or contains the resolved vault is skipped whole and the carve-out never runs on it. Both rules only ever preserve, so their interaction cannot delete anything either would have kept, and the caller's existing `skippedForVault` message is unaffected |
| **X10** | **THE SWEEP NEVER FOLLOWS A SYMLINK, AT ANY LEVEL IT ENUMERATES — stated once, over every path it classifies** | *Design gate round 2, finding 1, which found a data-loss regression the round-1 child-by-child sweep introduced.* **Every classification this package makes is `fs.lstatSync`-based. `fs.statSync` — and therefore the shipped `isDir` helper (`manifest.js:175-181`, `statSync(p).isDirectory()`) — is NEVER used to decide whether to enumerate a directory or to remove anything.** `isDir` follows links, so it reports a **symlinked `state`** as a directory; **X1** step 1 would then enumerate through it and step 2 would recursively delete the link **target's** children. Astra reproduced it against mocked I/O: with `<core>/state` pointing at an external directory holding the user's own files and no `quarantine/` inside it, the gate passes and the deletion target moves from `state` to `state/personal-notes`. **That is strictly worse than `5b77865f`**, where the single `rmSync(paths.state, {recursive:true})` removes only the link — and the vault guard gives no cover, because the configured vault is somewhere else entirely. **And `lstat` alone is not enough — it classifies only a path's FINAL component, so the ORDER in which the levels are checked is itself part of the rule: Table X row X11.** **Per path, and the two treatments differ for a stated reason:** **`paths.state`** is a machine-mechanics directory ADR-0019 governs, so a symlink there is **never descended** — and, **since round 12, unlinked only when Table X row X19 permits it — which after round 19 means its target overlaps no EXISTING shelf chain AND is disjoint from all four of `withinAllowedRoot`'s roots (`manifest.js:742`)** (**X1** step 0b); in that ordinary case the unlink removes no bytes, reproduces `5b77865f` exactly, and is the treatment this function already gives a symlinked **core** at `:1164-1165`. **A `<state>` symlink that does cover a shelf is retained**, because unlinking it erases the evidence the second disposer call (`uninstall.js:467`) and any retry would need. **Either shelf root** is counted as one of the user's own entries whenever it is not a real directory (Table K row **K2**), so a symlink there is **preserved, reported and never followed, removed or climbed past** (**X1** step 3). **The reviewer's recommendation was to preserve the link at `state` too; that is accepted in substance — never descend — and narrowed in form**, because unlinking a symlink destroys nothing and preserving it would leave `<core>` permanently non-empty for no safety gain. **Why the rule is ours to state even though `rmSync` behaves well:** Node's recursive `rmSync` classifies with `lstat` and unlinks a symlink instead of descending — which is exactly why `5b77865f` is safe here, and the implementer confirms it with a one-line probe rather than taking it on trust — but **the enumeration in X1 step 1 is ours**, and a guarantee inside `rmSync` says nothing about a `readdirSync` we wrote. `paths.logs`, `<core>/schedules` and `paths.secrets` keep the existing `isDir` + recursive `rmSync` path and are **out of scope**: their single `rmSync` removes a symlink without descending, as today |
| **X11** | **VALIDATION RUNS TOP-DOWN; REMOVAL RUNS BOTTOM-UP. They are two passes and they go in opposite directions** | *Design gate round 2 established the per-level `lstat` (**X10**); design gate round 3 found that a per-level `lstat` applied in the REMOVAL order is still unsafe, because it checks the leaf first.* **`lstat` classifies only the path's FINAL component — it does not reject a symlink in an intermediate component.** So `lstat(<state>/quarantine/redacted)` on a `quarantine` that is a **symlink to an external directory** happily reports the *target's* `redacted/` as a real directory, and the round-2 sequence `rmdirSync(redacted)` → *then* check `quarantine` **removes `external/redacted` before it ever discovers the link**. Astra executed X1 in memory and reproduced exactly that removal. **The window is real even with the gate in front:** the gate refuses a **pre-existing** symlinked shelf root (Table K row **K2** counts it), but `disposeCoreMechanics` is **exported** and directly callable, and a link introduced **after** the gate is the same concurrent class as Table X row **X3**'s. **The rule, stated once:** *every ancestor must be proven a real directory before any descendant is accessed at all* — so validation walks root→leaf and stops at the first level that is not one, and removal then walks leaf→root **over the validated prefix only**. Nothing below a stopped level is touched, examined or counted as removable. **Why the two passes cannot be merged:** the safety property is about *ancestors*, which only a downward walk establishes, while `rmdir`'s emptiness requirement is about *descendants*, which only an upward walk satisfies. One pass can serve one of them, never both. This is the same shape as `WP-scheduler-replay-manifest-independent`'s Table D row **D5** — two phases in opposite directions because one order cannot be both "after the evidence" and "before it is destroyed" |
| **X12** | **SHELF IDENTITY IS DECIDED BY CASE-FOLDED NAME, ON EVERY PLATFORM — never by byte-equal name** | *Design gate round 4.* **Two of the three platforms Wienerdog supports have case-insensitive filesystems by default** — APFS on macOS and NTFS as Windows configures it — while ext4 on Linux is case-sensitive. On a case-insensitive volume, a directory listed by `readdirSync` as **`Quarantine`** **is** the object `quarantinePreserve`'s lowercase `path.join(stateDir,'quarantine')` opens and writes into (`validate.js:948-951`), because the kernel resolves the lowercase path to it; enumeration still returns the stored capitalized name. So a byte-equality test `name === 'quarantine'` **fails to recognize our own shelf**, X1 step 2 recursively deletes it, and if a dream completed a preserve between the gate and the sweep the new original goes with it — **before** X1 step 3's protected `rmdir` sequence ever runs, and entirely past X10/X11, which classify types and ancestors rather than names. Astra verified case-insensitive path identity on this workspace and reproduced the deletion by executing the sequence in memory. **The rule:** `quarantine` and `redacted` are matched by an **ASCII case fold** — map only `A`–`Z` to `a`–`z` and compare; any other byte must match exactly. **That set is closed and it is an enumeration of our own good:** our directory names are pure ASCII with no combining marks, so the complete set of names a case-insensitive volume could collide with them is exactly their ASCII case variants — there is no Unicode-normalization variant to miss, and nothing is enumerated as forbidden. Use an explicit ASCII fold rather than `String.prototype.toLowerCase`, whose Unicode mappings are broader than the property being tested. **Conservative on ambiguity:** a name that folds equal but is **not byte-equal** is **preserved and reported**, never deleted and never treated as ours — on a case-sensitive volume it may be a look-alike directory the user created, and we cannot cheaply tell. Preserving it only ever deletes **less**, which is the direction ADR-0038 permits, and it makes `<state>` non-empty so **X1** step 3's climb stops there by its existing `ENOTEMPTY` rule with no extra clause. **The same fold locates the roots for the INVENTORY** (Table K row **K1**), so the plan and the act agree about which directory is the shelf; a fold mismatch between them would disclose one object and delete another. **The byte-exact lowercase path stays the removal target**: X1 step 3 still `rmdirSync`s `path.join(paths.state,'quarantine')` and its `redacted`, because that is what `quarantinePreserve` writes and what a case-insensitive volume resolves to the same inode anyway |
| **X13** | **THE DISPOSER'S NO-THROW PROMISE COVERS THE SHELF AND THE EMPTY-CORE STEP ONLY — every other deletion failure still propagates** | *Design gate round 5, which falsified a blanket "`disposeCoreMechanics` must never throw" this spec had carried in its Implementation notes.* **What is caught and reported, never thrown:** (a) every shelf-specific outcome of **X1** step 3 — an `lstat` failure or non-directory at a validated level (**X10**, **X11**), an `ENOTEMPTY`/`EEXIST` from `rmdirSync`, and **X12**'s fold-equal-but-not-byte-equal ambiguity — each **preserved and reported in `preservedQuarantine`**; and (b) the **pre-existing** empty-core cleanup (`manifest.js:1151-1170`), whose `try/catch` and comment — *"never let this final cosmetic step crash the uninstall"* (`:1163`) — are **unchanged and are the only place that guarantee was ever made**. **What still throws, byte-for-byte as at `5b77865f`:** a failure enumerating `paths.state` (**X1** step 1), a failure of any **X1** step 2 `fs.rmSync` on a non-shelf child, and the existing recursive `rmSync` over `paths.logs`, `<core>/schedules` and `paths.secrets` (`:1148`) — none of which is wrapped today. **Why the distinction is load-bearing and not stylistic:** `uninstall.js` deletes the **manifest** and then `config.yaml` *after* the disposer returns (`:423-462`), under a comment that says in the shipped code *"Every crash-prone step above has completed"* (`:414`). A swallowed `EPERM` on `secrets/` therefore leaves a **live OAuth credential on disk** *and* removes the manifest, after which the retry refuses with *"no install manifest found"* (`:285-288`) and the user has no supported way back. **Propagation is the existing recovery contract**, relied on by the shipped mid-sweep recovery test, and this package does not touch it. **The two directions differ for a stated reason:** preserving at a shelf level can only ever leave **more of the user's own text** alive, disclosed through `preservedQuarantine` and Table W row **W8**; swallowing a mechanics failure leaves a **credential** alive and destroys the ability to retry. Preserving data is the safe direction; preserving a secret is not |
| **X15** | **`dryRun: true` IS A READ-ONLY PLANNER, and it is the ONE place an emptiness test belongs** | *Design gate round 7, which found that X1, X4 and W5 could not all hold in dry-run.* **The problem, exactly:** **X4** lets `<state>` be reported removed only once a `rmdirSync`/`unlinkSync` has actually **succeeded**, while **X1**/**X2**/**K7** forbid the disposer any inventory or emptiness test — and in dry-run the syscalls cannot run at all. Skipping them leaves an empty install's plan **incomplete** (it never predicts `<state>`), and assuming they would succeed **mis-reports a populated shelf as removable**. Both `--dry-run` (`uninstall.js:318`) and the interactive pre-confirm plan (`:354`) are affected. **The rule:** on the `dryRun: true` arm, `disposeCoreMechanics` runs a **planner** — `quarantineInventory(paths)` (Table K), **the same function, the same ASCII fold of Table X row X12, the same three-level top-down `lstat` validation of Table X row X11** — and performs **no mutating filesystem call of any kind**. It then returns `removed` as **PREDICTED** removals at **X4**'s unchanged mechanics granularity: `paths.state` predicted **iff** the shelf is ABSENT or EMPTY and every level validated; nothing predicted otherwise, with the levels that would be preserved reported in `preservedQuarantine` instead. **The no-emptiness-test rule is explicitly EXEMPTED here, and the exemption is safe for a reason, not by fiat:** **X2**/**K7** exist because a snapshot followed by a *deletion* has an interval in which the tree can change. **A planner performs no deletion**, so its snapshot has nothing to race; being wrong costs a wrong line of output, never a byte. **The live arm is untouched and stays snapshot-free.** **One implementation, not two**: the planner reuses `quarantineInventory` rather than re-deriving emptiness, so the plan and the gate's disclosure cannot drift apart by construction. **Named residual — `R-dry-run-prediction-drift`, stated once:** a prediction and the later live outcome can differ, because the tree can change between the plan and the act (the prompt window of Table X row **X3**). **The drift has a direction, and it is the safe one:** the live deleter's `rmdirSync` fails closed on anything non-empty, so a run can only ever **preserve more than was predicted**, never delete something the plan did not name. Within a single `--dry-run` invocation the block (Table W row **W5**) and this plan are **two reads of the same tree** and can likewise disagree if it changes between them; both are predictions and the command mutates nothing, so the disagreement is cosmetic. **Passing the gate's snapshot into the disposer instead was weighed and NOT taken:** a caller-controlled input to this function is exactly what **X2** exists to prevent, and the coherence it would buy is cosmetic on a command that deletes nothing |
| **X16** | **`reverse()` GETS A SHELF GUARD, BEFORE KIND DISPATCH — the manifest replay is the second deleter that reaches the shelf** | *Design gate round 8, which falsified Table Y row **Y6**'s immunity claim by probing the real `reverse()`.* **The hole, measured:** `reverse()`'s `file` handler applies its prove-before-delete only when the entry carries a hash — `if (entry.hash && sha256File(resolved) !== entry.hash)` (`manifest.js:894`) — so a **hash-less** `{kind:'file', path:'<state>/quarantine/<name>'}` passes `validateEntry`, passes `withinAllowedRoot` (the shelf is inside `paths.core`, `:742`), and reaches `fs.rmSync(resolved, {force:true})` (`:899`). With the shelf **empty at the gate** and a dream completing a preserve before the replay, `reverse()` destroys the new copy **before** the protected disposer ever runs — and the manifest bytes never change, so `uninstall.js`'s byte-compare (`:379-391`) does not help. Astra probed the shipped `reverse()` in memory: the entry validates and invokes `rmSync`. **The guard:** immediately **after** the existing GLOBAL DEFERRED-MEMBER GUARD (`manifest.js:781`, `if (resolvesTo(entry.path, paths.manifest) \|\| resolvesTo(entry.path, paths.core))`) and still **before kind dispatch**, `reverse()` skips-and-reports any entry — of **any** kind, exactly as that guard does — whose target is shelf-resident. **Shelf-resident means either of two, and both preserve:** its **literal** path is at or under a **lexical** shelf anchor; or its **resolved** path is caught by Table X row **X17 (1a)**'s two-class test — **contained by, equal to or containing** a **class (i)** shelf subtree, or **equal to or containing** a **class (ii)** chain node (catching `.`/`..` and multi-hop aliases). **Both anchor sets exist whether or not the shelves do, and a third outcome — the entry is preserved because a shelf resolution was UNANSWERABLE — is separated from mere absence by Table X row X17, which round 10 added after the earlier "any resolution failure preserves" wording was measured to strand an ordinary install.** The anchors are located by Table X row **X12**'s ASCII fold and validated by Table X row **X11**'s top-down rule, computed once per call beside `schedulerOpts` (`:751-758`). **Fail-closed here means PRESERVE**, which is the opposite of `contains`'s bare boolean — so the guard does **not** use `contains`, for the same reason Table X row **X7** gives. **This only NARROWS deletion** (ADR-0038's **N**): every input it now preserves was previously deleted, and no input it preserves was previously kept. **It is not needed for `{kind:'dir'}` and is applied anyway:** the `dir` handler already removes only a virtually-empty directory (`:909-916`), so a preserved shelf keeps `<state>` alive on its own — one rule over every kind is still cheaper to verify than an argument per kind. **THE RULE IS SYMMETRIC, and round 9 is why it has to be:** *no manifest-driven deletion may cover a shelf path **from below** or **from above**.* **From below** — an entry of any mutating kind whose target is **at or under** a shelf root (the three cases above). **From above** — an entry **whose reverser deletes RECURSIVELY** whose target **CONTAINS** a shelf anchor, by the same anchor sets and the same Table X row **X17** outcomes. **And, since round 13, a third clause that is neither: a `symlink` entry whose removal would break a protected shelf's resolution chain is preserved too — Table X row X20.** *Round 9 measured the gap:* with `<core>/app` a symlink to `<core>/state`, a forged `{kind:'vendored-tree', path:'<core>/state'}` satisfies `reverseVendoredTree`'s only ownership test — `sameResolvedDir(entry.path, appRoot)` (`manifest.js:588`) — its target is **outside** both shelf subtrees so the from-below half permits it, and `fs.rmSync(entry.path, {recursive:true, force:true})` (`:593`) takes the shelf with it. Astra probed the shipped `reverse()`: the entry validates and invokes the recursive `rmSync`, every resolution succeeding. **The from-above half applies to the recursively-deleting kinds and ONLY those — Table V enumerates them, and the restriction is required, not tidiness:** `init` can record `{kind:'dir', path:'<state>'}`, whose reverser removes only a virtually-empty directory (`:909-916`) and therefore cannot destroy a preserved shelf; guarding it anyway would emit a `skipped` line on an **ordinary** uninstall and break Table W row **W6**'s and acceptance criterion 7's byte-identity. **Scope:** `reverse()`'s pre-dispatch region **only** — no reverser body changes and no signature change. **The return shape DOES gain one field, added at round 20** (Table X row **X22**): guard-skipped entries land in the existing `skipped` array, which `uninstall.js:490-494` already renders, **and additionally in a new `shelfGuarded: string[]`**, because Table W row **W10** must be able to tell a shelf-guard skip from an ordinary one. `skipped`'s contents and rendering are unchanged, and `shelfGuarded` is empty on an ordinary install, so Table W row **W6** holds |
| **X17** | **ONE RESOLUTION RULE, over every path this package resolves — and ABSENCE IS NOT A FAILURE** | *Design gate round 10. Modelled directly on `WP-scheduler-replay-manifest-independent`'s Table D row **D15**, which states one resolution rule over that package's roots, candidates, vault path and act-time site rather than one per site; this row is the same move for **X11**, **X12** and **X16**.* **What round 10 measured:** **X16**'s earlier wording preserved an entry whenever a shelf resolution *failed*, with **no exemption for `ENOENT`/`ENOTDIR`** — but `quarantinePreserve` creates the shelves **lazily** (`validate.js:950`), so on an install that has never quarantined anything **absence is the ordinary case**. Astra probed the shipped `reverse()` with that guard: an **ordinary app-tree removal became a skip**, and `uninstall.js` then deleted the manifest (`:424`), leaving the skipped component behind **with no retry ledger to remove it**. **And the naive repair is also wrong:** simply omitting absent roots from the guard leaves a shelf created *during* replay unprotected — which is Table X row **X3**'s window, one deleter over. **The rule, stated once and applied at every resolution X11, X12 and X16 perform:** **(1) LEXICAL anchors are ALWAYS retained, present or not.** `path.join(paths.state,'quarantine')` and its `redacted`, plus every **X12** fold-equal name actually found at that level, are computed **lexically** and are guard anchors **whether or not the shelves exist**. Nothing about the guard's existence depends on the shelf's. **(1a) THE PROTECTED SET IS THE CLOSURE OF EACH SHELF'S RESOLUTION CHAIN, IN TWO CLASSES WITH DIFFERENT REACH — round 14 established the closure, round 15 split it, and the split is the whole of the definition.** Walk each shelf path **component by component** with `lstat`/`readlink` and classify what you find. **CLASS (i) — SHELF SUBTREES:** the two shelf roots' **resolved targets**. These protect **the node AND every descendant of it** — **X16**/**X18** apply containment **both ways**, so a deletion target that **contains, equals or is contained by** a class (i) node is preserved. That is what keeps the originals safe wherever the shelf actually resolves to. **CLASS (ii) — CHAIN NODES:** every **link LOCATION** and every **intermediate target** on a chain. These protect **the node itself and its ANCESTORS** — *no recursive delete may cover them* — and **NOT their unrelated descendants**: the check is **"the deletion target must not EQUAL or CONTAIN the node"**, with no containment in the other direction. **Why the split is required, and it is round 15's measurement:** on the supported layout `<core>` → `/data/wienerdog`, the single-class closure put `/data/wienerdog` in the protected set, after which **X18** preserved *every* deletion target beneath it — `app`, `logs`, **`secrets`** — **even with both shelves absent**. The shipped symlinked-core tests require those removed, and `uninstall.js:424` would delete the manifest anyway, **stranding credentials and installed files with no usable retry**. Under the split `/data/wienerdog` is class (ii), so `/data/wienerdog/secrets` is a *descendant* and is removed exactly as today, while a recursive delete of `/data/wienerdog` **itself** is still refused. **Why class (ii) still closes round 14's case:** with `<state>/quarantine` → `<state>/cache/link` → `<core>/logs/recovery`, the intermediate link **lives at `<state>/cache/link`** — a class (ii) node — and step 2's target `<state>/cache` **contains** it, so it is preserved. Anchors alone did not catch that, because `<state>/cache` overlaps **neither** the lexical shelf path **nor** its resolved target. **Verified against every earlier round's case, because a rule that regresses one is not a fix:** round 11 (`quarantine` → `<state>/cache`) — `cache` is the **resolved target**, class (i), preserved with its descendants; round 12 (`<state>` → `<core>/logs`) — `<core>/logs` is an intermediate target, class (ii), and the mechanics loop's target **equals** it, preserved; round 13 (the intermediate `skills/wienerdog-test` link) — a class (ii) location that `reverse()`'s unlink targets **exactly**, preserved; round 14 as above. **HYPOTHETICAL vs EXISTING — added at round 16, CORRECTED at round 17, and the correction is precise about what the distinction reaches.** An anchor derived through the nearest existing ancestor for a shelf that **does not exist** (**X17 (2)**) is **HYPOTHETICAL**. **A hypothetical shelf ROOT keeps FULL CLASS (i) SUBTREE protection — descendants included — in every deletion guard (X16, X18, X20).** **The ONLY thing conditioned on an EXISTING shelf is X19's alias-retention decision.** **Why round 16's narrower version was wrong, measured at round 17:** giving hypothetical roots class (ii) semantics excluded descendants, so with a stable `<core>` → `/data/wienerdog` and initially absent shelves, a pre-existing **hash-less** `{kind:'file'}` entry targeting the **physical** path `/data/wienerdog/state/quarantine/2026-09-18-note.md` bypassed the lexical anchors **and** the hypothetical resolved ones — the file neither equals nor contains them — and a dream creating that file **after X16 computed its anchors and before the replay** had it destroyed by `reverse()`. Astra's mocked probe confirmed the predicate permits the entry and the shipped `reverse()` validates it and calls `rmSync`. **No alias is created or redirected after computation, so `R-alias-outside-closure` does NOT cover it** — it was a rule defect, not residual territory. **Why the split is still safe in the direction round 15 cared about:** on `<core>` → `/data/wienerdog` the hypothetical class (i) root is `/data/wienerdog/state/quarantine`, and `/data/wienerdog/secrets`, `…/logs`, `…/app` neither equal it, contain it, nor sit inside it — so they are **still removed**, and round 15's finding stays closed. The chain node `/data/wienerdog` remains class (ii), protecting itself and its ancestors only. **And the contradiction round 16 removed stays removed**, because it lived entirely in **X19**: with `<state>` → `/data/personal` and no `quarantine/`, **no existing shelf's chain passes through the alias**, so it is unlinked exactly as at `5b77865f`; the hypothetical class (i) root `/data/personal/quarantine` prevents nothing on that layout, since none of `<state>`'s children is inside it. **Re-checked against acceptance criterion 14 at round 17 and it holds unchanged.** **A shelf created after such an unlink is still protected, and this is established rather than asserted:** `quarantinePreserve` calls `fs.mkdirSync(qdir, {recursive: true, mode: 0o700})` (`validate.js:953`), which **recreates `<core>/state/quarantine/` as a real directory** even with `<state>` gone, and because the live disposer holds **no snapshot across calls** (**X2**) the next sweep computes its set afresh and preserves it under **X1**. What remains in that case is Table W row **W11**'s `R-post-uninstall-preserve`, not a loss. **Every check in this package — X16, X18, X19, X20 — tests against this two-class SET**, applying class (i) as containment both ways and class (ii) as equal-or-contains — **and a HYPOTHETICAL shelf root as full class (i), descendants included.** **Existence is relevant to exactly one decision in this package, Table X row X19's alias retention, and to nothing else.** *(This sentence carried round 16's now-withdrawn "class (ii) only" clause until round 18 caught it: the cell had been rewritten around it and the old ending survived — the intra-cell drift `docs/runbooks/spec-authoring.md` names, and the one no mirror checklist can see.)* **(2) RESOLVED anchors are derived through the NEAREST VALIDATED EXISTING ANCESTOR.** Resolve the deepest ancestor that exists — `<state>`, else `<core>` — and **append the missing suffix lexically**. So a resolved anchor exists even when the shelf does not, and **a shelf created after the guard was initialised is still covered by both anchor sets**. **(3) `ENOENT`/`ENOTDIR` at a shelf level is ABSENCE, not an error.** It contributes no resolved anchor of its own, it is **not** reported, and it **never causes an entry to be skipped**. This is the clause whose absence stranded the ordinary install. **(4) ANY OTHER code at a shelf level is UNANSWERABLE** — `EACCES`, `EPERM`, `EIO`, `ELOOP`, `EMFILE`, … — and the entry is **preserved and reported**, failing closed toward preservation exactly as **X16** already said. **(3) and (4) must be distinguishable in the implementation and in the tests**, not merged into one `catch`: they are the same syscall failing for opposite reasons, and collapsing them is precisely what round 10 caught. **Where each site lands:** **X11**'s validation pass and **K3**/**K4** already carried absence-as-the-single-special-case and are unchanged by this row — it generalises their rule rather than adding a second one. **X16** is the site that lacked it. `disposeCoreMechanics` is governed by **X1**/**X13** and is untouched. **Convergence note.** The resolution semantics of this package are now **uniform across X11, X12 and X16**, in the same shape ADR-0031's circuit-breaker and the scheduler package's D15 produced for the same recurring family. **A further finding of this family is fixed by pointing at this row and adding the site to it, not by writing a fourth rule.** |
| **X18** | **STEP 2 IS ITSELF A RECURSIVE DELETER, so it obeys X16 — no site in this package is exempt** | *Design gate round 11. This row adds no new rule: it applies **X16**'s symmetric containment check, over **X17**'s anchors, to the one recursive deletion the spec had been treating as ordinary mechanics.* **What round 11 measured:** with `<state>/quarantine` a **symlink to `<state>/cache`**, step 2 recursively deletes `cache` — a non-shelf sibling by name — **before** step 3 ever looks at the link. `quarantinePreserve` writes **through** the alias (`validate.js:948-951` joins the lexical path and the kernel follows it), so the deleted sibling can hold **the sole original**. Astra executed the prescribed sequence: the original was deleted and the surviving, now-**dangling** link was reported as *preserved* — the worst possible pairing, a loss reported as a save. **Top-down `lstat` validation cannot help**, and that is the general lesson: **X11** protects a path from being deleted *as itself*; it says nothing about the same bytes being deleted *through another pathname*. **The rule, by pointing rather than by adding:** the protected shelf **targets** are computed **first** — **X17**'s anchors, lexical and resolved-through-the-nearest-validated-existing-ancestor, alias-aware — and **every recursive deletion in `disposeCoreMechanics` is then gated by X16's symmetric check against them**: a target that **contains, equals or is contained by** a **class (i)** shelf subtree, **or equals or contains** a **class (ii)** chain node — Table X row **X17 (1a)** — is **preserved and reported**, never deleted. **The asymmetry is load-bearing:** a chain node's unrelated **descendants** are *not* protected, which is what keeps `secrets/` removable on a symlinked-core install. **Round 14 is why the object is a set:** an intermediate link's own *location* overlaps neither anchor, so checking anchors alone left a recursive deleter free to remove the directory holding it; an unanswerable resolution preserves (**X17** outcome 4); an absent one does not (**X17** outcome 3). **Round 12 extended the same check to step 0b's unlink, and round 13 to `reverse()`'s `symlink` kind** — neither is a recursive delete, but both can *erase the evidence* the others depend on (Table X rows **X19**, **X20**). **That covers both recursive deletions in the disposer, not just step 2:** the `mechanics` loop's `fs.rmSync(dir, {recursive:true, force:true})` (`manifest.js:1148`) over `logs`/`schedules`/`secrets` is the same shape — `<core>/logs` could be a real directory a shelf symlink resolves into — so it is gated by the same check. **Table V is amended accordingly**: `:1148` is listed as **governed by X16 via X1**, not as an exemption. **Order, stated because it is the whole fix, and corrected at round 12 to start earlier still:** protected targets → step 0b → step 2 → step 3. Computing the targets after step 2 is the round-11 defect; computing them after step 0b is the round-12 one. **W6 is unaffected**: on an ordinary install the shelf is absent or is a real directory under `<state>`, so no `logs`/`schedules`/`secrets` target and no non-`quarantine` child of `<state>` contains, equals or is contained by it, and nothing new is preserved or reported |
| **X19** | **A `<state>` SYMLINK THAT COVERS A SHELF IS RETAINED, because unlinking it erases the evidence the NEXT sweep needs** | *Design gate round 12, which closed the last exemption: step 0 was the one mutating operation still outside **X16**.* **What round 12 measured:** step 0 unlinked a symlinked `<state>` **before** the protected targets were computed. With `<core>/state` → `<core>/logs` and an original at `logs/quarantine/…`, the alias is removed **and the original is not**; **X17** then derives its anchors under the now-**absent** `<state>` path, so **X18** sees no overlap and permits the recursive delete of `logs` — taking the original. **And computing the targets earlier is NOT sufficient on its own, which is the part that makes this a retention rule rather than an ordering one:** `uninstall.js` calls the disposer **again** at **`:467`**, and by then the alias is already gone, so the second call rediscovers nothing. **The evidence has to survive the first sweep for the second one to find it** — and the same is true across a retry, where a fresh process starts with whatever the last one left. **The rule — and since round 13 it is one half of a single sentence that also covers `reverse()`'s `symlink` kind (Table X row X20): *no operation of this uninstall removes a link on the resolution chain of a protected shelf*.** **A `<state>` symlink is RETAINED when EITHER** (a) **an EXISTING shelf's resolution chain passes through it**, **or** (b) **its resolved target OVERLAPS — equals, contains, or is contained by — ANY of `withinAllowedRoot`'s roots**. **The roots, from the shipped code:** `[paths.core, paths.claudeDir, paths.codexDir, <home>/.local/bin]` (`manifest.js:742`). **Why that set and not an enumeration of swept directories — round 19's correction, and it is a CLOSURE move rather than a third list.** Round 18's clause (b) asked whether the alias target lay **inside** something this uninstall sweeps, and missed **the opposite direction**: with `<state>` → `~/.claude`, initially absent shelves, and a sparse manifest holding a **hash-less** `{kind:'file'}` entry for `~/.claude/quarantine/2026-09-18-note.md`, the target is **outside `<core>`** and is an **ANCESTOR** of the replay target, so the alias was unlinked. A dream completes that copy **after the absence decision and before the unlink**; a later `secrets` `EPERM` then retains the manifest under **X13**; and **on the retry** `<state>` is absent, the rebuilt anchors miss the original, and the `file` entry deletes it. Astra confirmed the predicate gap and that the shipped `reverse()` accepts and deletes that file. **No concurrent alias creation or redirection is required, so no named residual covers it.** **Why the allowed-root set is CLOSED where an enumeration is not:** `withinAllowedRoot` gates **every mutating replay kind** (`manifest.js:742`, gate `:872-883`), so **every replay mutation target lies under one of those four roots by construction**, and the disposer's own sweeps all lie under `<core>`. Testing **overlap in both directions** against those four therefore covers every path this command can ever delete — including an individual file beneath the alias target, which is what round 19 measured — without this spec having to enumerate targets it does not own. **The round-18 swept-directory list is KEPT only as the DERIVATION** of why the roots are the right object: `<core>/logs`, `<core>/schedules`, `<core>/secrets`, the children of `<state>` that **X1** step 2 removes and every **Table V** replay target all sit inside one of the four. **It is no longer the test.** **Why a blanket "never unlink an absent-shelf alias" is still refused:** it re-opens round 16's contradiction and acceptance criterion **14** with it. **Why (b) is sufficient rather than merely narrower — the by-construction argument, restated against the new object:** an alias whose target is **disjoint from all four allowed roots**, with no existing chain, is unlinked exactly as at `5b77865f`, and **no deletion this command can perform — replay or sweep — reaches outside those roots**, so a copy arriving late through that name is unreachable on this run or on any retry. That is the whole of the safety claim, and it is now a property of a **closed, code-derived root set** rather than of a list this spec maintains. **This row remains the ONE place the hypothetical-vs-existing distinction of Table X row X17 (1a) applies** (round 16 introduced it, round 17 confined it here): a **hypothetical** anchor for an absent shelf never satisfies clause **(a)** — though clause **(b)** may still retain the alias on its own — while **every deletion guard still treats a hypothetical shelf root as full class (i) with its descendants**. So clause (a) is satisfied by an alias whose **resolved target is caught by X17 (1a)'s two-class test on an EXISTING chain** — contains, equals, or is contained by, per **X16**'s symmetric check — and such an alias is **preserved and reported in `preservedQuarantine`**, never unlinked. **The unlink happens only when BOTH clauses fail: no existing chain passes through the alias AND its target is disjoint from all four allowed roots** — which is the ordinary alias case, and the one acceptance criterion 14 pins with `/data/personal`. An unanswerable resolution preserves (**X17** outcome 4); an absent target does not (outcome 3). **Consequence, stated rather than discovered later:** a retained link leaves `<core>` non-empty, so the core is kept and Table W row **W8**'s arm prints — which is correct, because the user's text is still reachable through that name and removing the name would hide it. **W6 is unaffected:** on an ordinary install `<state>` is a real directory, so step 0b's symlink arms are not reached at all |
| **X20** | **NO OPERATION OF THIS UNINSTALL REMOVES A LINK ON THE RESOLUTION CHAIN OF A PROTECTED SHELF — one sentence covering `reverse()` and the disposer alike** | *Design gate round 13, and it is exactly the case the round-12 convergence note reserved: **the site is added to the enumeration, no new rule is written**.* **What round 13 measured:** Table **V** exempted the `symlink` replay kind from the ancestor guard, because unlinking a link deletes no bytes. But with `<state>` → `<claude>/skills/wienerdog-test` → `<core>/logs` and an original at `logs/quarantine/…`, a matching `symlink` manifest entry names the **intermediate** alias, which resolves **above** the protected shelf, so **X16** permitted it. Astra probed the shipped `reverse()`: it unlinks that entry. The following disposer then meets a **dangling** `<state>` alias, **X17** rebuilds its anchors under the **lexical** `<state>` path, **X18** no longer sees `<core>/logs` overlapping anything, and the recursive delete takes the original. **Reachable through an alias introduced after the gate too**, inside the interleaving model **X3** already carries. **The unified rule, and it is the round-12 enumeration's item (7):** a **`symlink` entry is preserved and reported** when its removal would break the resolution of a protected shelf — that is, when **its own target, or any intermediate alias on the chain from a lexical anchor (X17 (1)) to its resolved anchor (X17 (2)), is caught by **X17 (1a)**'s two-class test** under **X16**'s check. Unanswerable preserves (**X17** outcome 4); absent does not (outcome 3). **X19 is the same rule seen from the disposer's side**, and the two are now one sentence: ***no operation of this uninstall removes a link on the resolution chain of a protected shelf*** — `reverse()`'s `symlink` reverser by this row, `disposeCoreMechanics`'s step 0b by **X19**. **The `dir` exemption is KEPT and is not the same case:** the `dir` reverser removes only a **virtually empty** directory (`manifest.js:909-916`) and **cannot remove a file or a link**, so it can neither destroy an original nor break a chain; guarding it would add a `skipped` line to an ordinary uninstall and break Table W row **W6**. **The distinction this row draws is deletion of BYTES versus deletion of REACHABILITY** — the `symlink` kind is exempt from the first and governed by the second |
| **X21** | **THE THREAT MODEL THIS PACKAGE DEFENDS AGAINST, AND THE NAMED RESIDUAL THAT BOUNDS IT — `R-alias-outside-closure`** | *Design gate round 14. Four consecutive rounds each produced one more alias shape (**X18** sibling, **X19** `<state>` link, **X20** replay `symlink`, **X21**'s predecessor **X17 (1a)** intermediate-link location), and `docs/runbooks/codex-review.md`'s convergence rule is that the loop converges **by freezing surface, not by patience**. This row freezes it.* **IN SCOPE — what the deletion-side contracts defend:** links, of any depth, that lie **inside the resolved chain closure of a shelf as computed at protected-set-computation time** (**X17 (1a)**). Every operation this package performs is enumerated in the convergence note and gated against that set; an alias anywhere on a shelf's chain, at any hop, is protected, whether it was created before the run or between the gate and the sweep. **OUT OF SCOPE — named residual `R-alias-outside-closure`:** **any alias shape that is not on a shelf's resolution chain at the moment the protected set is computed** — most concretely, **a link created after that computation which redirects a component of the chain**. Such a shape can make a later deletion reach bytes the set did not name. **Why it is accepted rather than closed, stated in full:** the shelves are `0700` directories under a `0700` core owned by the user running the uninstall (`validate.js:950`), so every such link is **the same user's own act on their own files** — the same boundary ADR-0035 draws for attended execution and ADR-0034 draws for the secret fence. **Closing it would require a filesystem transaction the platform does not offer**: the protected set and every subsequent deletion would have to be atomic with respect to concurrent renames and symlink creation, which POSIX and Win32 provide no primitive for, and ADR-0004 forbids the resident process that could otherwise hold a lock. **Every alternative is an enumeration of the adversary's options**, which this repository has twice paid for (ADR-0035's six relocations; ADR-0042's race-window enumeration). **What still holds inside the residual:** nothing is deleted **without being disclosed**, the manifest cannot widen anything (**Y6**), and the failure requires the user to have created an alias into their own quarantine and then redirected it mid-uninstall. **The overrule path is owner item 4**, drafted with its cost: refuse the uninstall whenever **any** symlink exists anywhere under `<core>`. **Cost:** an ordinary install whose vault or app directory is symlinked — a supported layout — **cannot uninstall at all** until the user rearranges their own filesystem. **Convergence consequence, binding on later rounds:** a further alias finding that falls **inside this residual's definition** is **CLOSED BY CITING THE RESIDUAL**, not by a fifteenth revision of the deletion contracts |
| **X22** | **AN UNANSWERABLE PROTECTED SET ABORTS THE LIVE REPLAY; A PER-ENTRY UNANSWERABLE SKIP REACHES W10 — the retry ledger is the thing being protected** | *Design gate round 20, a different family from rounds 11–19: not what gets deleted, but whether the user can finish afterwards. Shaped on the rule this package already uses for the disposer — Table K row **K4** and `WP-scheduler-replay-manifest-independent`'s Table D row **D9**.* **What round 20 measured:** **X16**/**X17** have `reverse()` **skip** an entry when a shelf resolution is unanswerable, recording it in `skipped` only, while **W10** consulted just the disposer's `preservedQuarantine` and a fresh inventory. A **transient `EIO`** during live replay therefore skips `app` and hook entries; later reads succeed and find the shelves **empty**; the disposer reports no preservation; **W10 permits deleting the manifest** — and the installed components remain with the retry refusing *"no install manifest found"*. **No alias change and no late-arriving file is involved, so none of the three named residuals covers it.** **Two rules, and they are deliberately different because the failures are:** **(1) SET-LEVEL — abort.** If the protected set cannot be constructed at **`reverse()`'s guard initialisation** — any resolution failure other than `ENOENT`/`ENOTDIR` while walking the chains (**X17** outcome 4) — the **live replay ABORTS before any mutation**, in the **same shape and message as the disposer's unreadable case**: a `WienerdogError` naming the directory and its `code`, saying nothing was removed. **The manifest and `config.yaml` are untouched**, so the retry is clean. This is the cheap case to get right: nothing has been deleted yet. **`--dry-run` reports instead of aborting**, exactly as Table K row **K4** and **W5** already specify for the inventory. **(2) PER-ENTRY — preserve, report, and PROPAGATE.** An individual entry whose **own path** fails to resolve for a non-`ENOENT` reason is **preserved and reported as today** — it is one entry, and aborting the whole replay over it would be the over-correction round 15 already paid for. **But it must reach W10**, because a preserved-but-undeleted component is exactly what the retry ledger exists for. `reverse()` therefore returns **`shelfGuarded: string[]`** (**X16**'s scope note), and **Table W row W10 consults THREE inputs**: every sweep's `preservedQuarantine`, a fresh `quarantineInventory` read, **and a non-empty `shelfGuarded`**. **Why not simply abort on the per-entry case too:** an unresolvable path is also the ordinary shape of a broken install, and refusing the whole uninstall over one entry would make a damaged tree un-uninstallable — the failure mode owner item 4 is declined for. Preserving one entry and keeping the ledger is strictly better: nothing is lost, and the user can re-run. **W6 is unaffected:** on an ordinary install the set constructs, `shelfGuarded` is empty, and neither rule fires |
| **X9** | **The doc comment is corrected in the same edit** | `disposeCoreMechanics`'s JSDoc runs `manifest.js:1110-1132`, and the sentence spanning **`:1112-1116`** asserts *"none user-authored"* of `state/`. That sentence is false on this tree and is the shipped form of the invariant owner item 1's amendment narrows. It is corrected to name the shelves as the one exception, to point at ADR-0019's amendment, and to state **X1**'s no-recursive-delete rule where the next reader of that function will meet it. The `@returns` clause at `:1132-1133`'s neighbourhood also gains `preservedQuarantine`. **A comment that contradicts the amended ADR is the drift the repo's errata practice exists to catch** — and it is a comment, not a claim in a table, so it is fixed here rather than carried as a mirror |

### Table W — what the user is shown, and when (canonical)

| Row | Fact | Value |
|---|---|---|
| **W1** | **OWNER ITEM 2a — where the preserved copies go** | **RECOMMENDED VALUE: nowhere. Wienerdog writes no copy of its own.** `uninstall` stops before removing anything and tells the user to move or delete the files themselves. The two alternatives the stub named — a **fixed location in HOME** and a **user-chosen path** — are weighed in full under owner item 2, with the cost of overruling. **The package ships from either answer with the same mechanism**: Table X's carve-out is what a copying destination would need anyway (**X3**), Table K's inventory is the same walk, and the disclosure block of **W4**/**W5** changes only its closing line. What an overrule adds is a copier, and Table Y row **Y3** is that copier's binding contract, written here so an overrule is one ruling rather than one design session |
| **W2** | **OWNER ITEM 2b — may an unattended run proceed?** | **RECOMMENDED VALUE: no.** `--yes` does **not** proceed past a NON-EMPTY or UNREADABLE shelf: the refusal is printed and the process exits non-zero in exactly the same way with and without it. **This does not change what `--yes` means**, and the distinction is the reason: `--yes` skips the **prompt**, and the shipped contract at `uninstall.js:349-351` is that *"the set of valid actions is identical either way"*. A refusal is not a prompt — it removes an action from the valid set for both runs equally. **ADR-0035 governs the direction:** the attended CLI invocation is the trust surface, and the one thing a scripted, unattended run must not be able to do is irreversibly destroy the user's own text with nobody present. Note that a `--yes` run today prints **no plan at all** (**W7** of Current state item 5), so a disclosure-only design would be silent in precisely the configuration that needs it |
| **W3** | **Where the refusal is raised** | In `src/cli/uninstall.js`, immediately after `quarantineInventory` (Table K row **K5**) and **before the first `console.log`** — so before the manifest headline at `:311`, before any plan, and before every deletion. It is a `WienerdogError` in the shape the file's other refusals already use (`:286-288`, `:386-390`): a refusal, not a crash. It fires when `entries > 0` **or** `unreadable.length > 0` (**K3**/**K4**) |
| **W4** | **What the refusal says** | Plain language for knowledge workers (CLAUDE.md), and it carries exactly five things: **(1)** that nothing was removed; **(2)** the total entry count and the **total size in bytes as a plain integer** (a human-readable unit in parentheses is permitted, the integer is not optional); **(3)** one line per shelf directory **that holds at least one entry**, with its own count and byte total — a shelf directory that exists but is empty contributes no line, because by Table K row **K2** it contributes no entry either, and a refusal listing an empty directory would tell the user to deal with nothing; **(4)** the hedged statement of what these files are — *"some or all of these may be the only copy of that text on this computer, and they hold the original, not a blanked-out version"* — which is `WP-quarantine-only-copy-shelf`'s Table O row **O8** "may be" hedge, verified there against all four shelf classes and **never strengthened to "is"**; **(5)** the remedy, as two literal shell lines the user can copy — move the directory somewhere they keep, or delete it — followed by *"then run `wienerdog uninstall` again"*, and a pointer to `docs/runbooks/secret-incident.md`. **When `unreadable` is non-empty the message names each directory and its `code` instead of a count**, and says the state could not be determined. It **never prints a filename and never prints a byte of any file's content** (Table Y row **Y1**) |
| **W5** | **`--dry-run`** | Does **not** abort — it deletes nothing, and aborting would hide the plan it exists to show. It prints the same block as **W4** (same counts, same byte totals, same directories, same hedge), then one line saying that a real `wienerdog uninstall` stops at this point and that the rest of the plan is what it would do once these files are moved or deleted, and then **today's plan unchanged**. Under the carve-out that plan correctly no longer lists `<state>` under *"Machine-generated state (removed recursively, not manifest-tracked)"* (`uninstall.js:337-341`) and instead lists the preserved shelf from `preservedQuarantine` (**X4**). **What decides which of the two it prints is Table X row X15's read-only planner**, not a syscall — `--dry-run` performs no mutating filesystem call at all — and both lines are therefore **predictions**, with `R-dry-run-prediction-drift` named in X15. **On an install whose shelf directories exist but are empty the plan is unchanged and still lists `<state>` once**, because `removed` keeps its mechanics-directory granularity (**X4**) — the round-6 case. This preserves ADR-0019's own `--dry-run`-exactness consequence (`:68-69`) and M1's *"lists exactly what was created"* gate |
| **W6** | **The ABSENT and EMPTY cases — nothing changes at all** | No block, no extra line, no abort, no new field rendered, and `disposeCoreMechanics` behaves as at `5b77865f`. **The complete stdout of `--dry-run` and of a full `uninstall --yes` on an install with no shelf entries is byte-identical to the same run at `5b77865f`.** This is the row that keeps the package from changing every existing uninstall's output, and it is a declared RED target (Table B) |
| **W7** | **Ordering against `WP-scheduler-replay-manifest-independent`, and what must not be disturbed** | **The shelf gate runs FIRST** — before that package's Table D row **D2** discovery and therefore before its **D9** abort. Both aborts delete nothing and both are retryable, so **either order is safe**; the shelf gate goes first because it is the cheaper check (one walk inside our own core, no ambient roots) and because it reports data we would **destroy**, while D9 reports a deletion we might **fail to perform**. **Rows of that package this package must not disturb — in `uninstall.js`:** its discovery call and D9 abort, its **D3** disclosure block in both `--dry-run` and the pre-confirm plan, the `discoveredSchedules` snapshot passed to both `reverse()` calls (**D4**/**D7**), and the `vaultPath` read at `:309` that its **D12** consumes. **In `manifest.js`:** `discoverSchedulesOnDisk` (**D1**, **D9**–**D12**, **D14**, **D15**), `reverse()`'s phases **D5a**/**D5b**, `recognizeScheduleBasename`'s call site (**R2**), and `withinSchedulerRoot` / `withinAllowedRoot` / `validateEntry` / `contains`. **Round 8 changed this row, and the change is stated exactly rather than waved at.** This package now edits `reverse()` too (Table X row **X16**), so "disjoint functions" is no longer the argument; **disjoint regions and disjoint targets are.** *Lines added:* the `quarantineRoots` computation beside `schedulerOpts` (`manifest.js:751-758`), and one skip-and-report guard immediately after the global deferred-member guard (`:781`) and still **before kind dispatch** (`:790` region). *Nothing else in `reverse()`.* **No D-row changes:** **D5a** runs **before** the entry loop and **D5b** **after** it, while the guard lives **inside** the loop before dispatch — three disjoint regions. **And the targets cannot overlap either, by construction, which is the stronger claim:** D5b acts only on items `discoverSchedulesOnDisk` yielded, and every such item must sit under a **scheduler root** — `<home>/Library/LaunchAgents`, the systemd user dir, or `<core>/schedules` — while the shelf is `<core>/state/quarantine/**`; `<core>/schedules` and `<core>/state` are **sibling subtrees of `<core>`** and neither contains the other, and the other two roots are outside `<core>` entirely. **Even under a contrived `<core>/schedules` → shelf symlink no overlap is reachable**, because a discovered candidate must also carry a basename matching **R2** (`^wienerdog-[a-z0-9][a-z0-9-]*\.xml$`), whereas `quarantinePreserve` names every shelf file `<date>-<stem><ext>` (`validate.js:958`) — always date-prefixed, so never R2-matching. **Landing order:** that package is in `depends_on` and lands **first**, so its "`reverse()` untouched" claim is true when it ships and this package amends `reverse()` afterwards. **If the order is ever reversed, that claim must be re-pinned by its implementer** — it is a statement about the tree, not about this package |
| **W8** | **The closing summary when the carve-out preserved something** | The live run's three-way branch at `uninstall.js:495-501` gains a fourth arm: *"Kept `<core>` — your quarantined copies are still in it: `<dir>`"*, in the shape the file already uses for the vault and the customized config. **The preserved directory is named LITERALLY, not counted** — Table W row **W11**: on `R-post-ledger-preserve` the manifest is gone and `rm -rf <that path>` is the user's only remaining route, so a count would leave them guessing. It is **rare but reachable, not dead code**: the gate refuses on a non-empty shelf, so this arm is reached through **X3**'s concurrent-dream window, through an UNREADABLE shelf at deleter time (**K4**), or by any caller of `disposeCoreMechanics` other than `run`. It must never print the plain *"fully removed"* line while a shelf survives — **a false "fully removed" is as bad as the deletion**, which is the reason the adjacent `skippedForVault` branch already exists (`:476-483`) |
| **W10** | **THE MANIFEST IS NOT DELETED WHILE ANYTHING IS PRESERVED — the retry ledger outlives the thing it would be needed for** | *Design gate round 15 asked whether `uninstall.js:424`'s unconditional manifest delete is already governed by the refusal of **W2**/**W3**. **It is not**, and this row is the answer rather than a confirmation.* **W3**'s refusal is the **pre-plan gate**, and by `:424` it has already passed — so the manifest delete is reached on every path where `disposeCoreMechanics` preserved something **after** the gate: Table X row **X3**'s concurrent-dream window, an UNANSWERABLE shelf level at deleter time (Table K row **K4**), **X19**'s retained `<state>` alias, and **X18**/**X20**'s preserved chain components. In all of those the shipped code deletes `install-manifest.json` (`:424`) and then `config.yaml`, after which a retry refuses with *"no install manifest found"* (`:285-288`) and the preserved artifact is **stranded with no supported way to finish**. **The rule, tightened at round 16 after it was measured to cover only the FIRST sweep:** the check sits **immediately before `:424`**, two statements from the `rmSync`, and it consults **all three** of: the `preservedQuarantine` of **every** live `disposeCoreMechanics` call made so far, **a fresh `quarantineInventory(paths)` read taken at that moment**, **and `reverse()`'s `shelfGuarded` array** (Table X row **X22**, added at round 20 — a replay entry the shelf guard skipped is an installed component still on disk, and the ledger is precisely what a retry needs to remove it) — because a concurrent dream can recreate the shelf *after* the first sweep returned nothing (`quarantinePreserve`'s `mkdirSync(…, {recursive:true})`, `validate.js:953`, rebuilds `<core>/state/quarantine/` even when `<state>` is gone). **When ANY of the three reports anything**, `uninstall` **stops before `:424`** — the manifest and `config.yaml` are **left in place**, nothing further is deleted, and the run ends with a message naming what was preserved, why, and that re-running is safe. **This is not a new shape:** `uninstall.js:428-432` already ends exactly this way when the manifest delete itself fails — *"uninstall partially completed; left config.yaml and `<core>` in place so a retry stays safe"* — and this row reuses that wording and that exit. **It is the same lesson as Table X row X13**, one step later: preserving the user's text must never cost them the ability to finish. **Why the second sweep at `:467` cannot simply move earlier, stated because round 16 asked:** its **only** remaining job is removing the now-empty core, and the shipped comment says so — *"with the manifest + unmodified config deleted the core is now empty, so this removes it"* (`:463-466`). The core is not empty until the manifest and config are gone, so that call **must** stay after them. What moves is not the call but the **check**: the shelf-capable work (**X1** steps 0–3) is idempotent and already runs in both calls; W10 simply refuses to delete the ledger while **any of its three inputs** — either sweep's `preservedQuarantine`, the fresh read, or `reverse()`'s `shelfGuarded` — reports anything. **W6 is unaffected:** on an ordinary install `preservedQuarantine` is empty, `shelfGuarded` is empty, the fresh read finds nothing, and `:424` runs exactly as today |
| **W11** | **TWO NAMED RESIDUALS FOR A COPY THAT ARRIVES LATE — both are LEFTOVERS, neither is a loss** | *Design gate round 16. **W10** narrows the window to two statements; it cannot close it, and this row says so rather than implying otherwise.* **`R-post-ledger-preserve`** — a preserve completing **between W10's check and the `rmSync` at `:424`**. The manifest and `config.yaml` are deleted, the `:467` sweep then **preserves** the new copy under **X1**, and the core is kept — so **nothing is lost**, but `wienerdog uninstall` can no longer be re-run (`:285-288` refuses without a manifest). **Recovery is one `rm -rf` on a path the summary names**, which is exactly why Table W row **W8**'s arm must print the preserved directory **literally** rather than a count. **`R-post-uninstall-preserve`** — a preserve completing **after the last sweep**, once the uninstall has finished. `quarantinePreserve`'s `mkdirSync(…, {recursive:true})` (`validate.js:953`) **recreates the whole path**, so the copy succeeds and sits in a freshly recreated `<core>/state/quarantine/`. Again **a leftover, not a loss**, recovered by one `rm -rf`. **Both require a dream already running**: `uninstall` reverses the scheduler entries before it reaches this point, so no *new* dream can be started by the schedule after the replay. **Why neither is closed:** closing them needs the deletion and the check to be atomic with respect to a concurrent writer — the same filesystem transaction Table X row **X21** already records as unavailable — and ADR-0004 forbids the resident process that could hold a lock. **They sit beside `R-alias-outside-closure` and under the same reasoning**, and like it they are **closed by citation in a later round, not by a further revision.** **What must ship because of them:** W8's summary names the preserved path literally; and the message W10 prints on its own stop says re-running is safe, which is true on that path and is why the two cases are named separately here |
| **W9** | **The two user-facing sentences, re-derived** | Both are single edits inside existing sentences and both are written to **W1**'s cell, so an overrule rewrites them and nothing else. **`docs/runbooks/secret-incident.md`** — the sentence at `:61-63` (*"And `wienerdog uninstall` removes this folder along with everything else Wienerdog keeps, so copy out anything you want to keep before you uninstall."*) is replaced by one saying that `wienerdog uninstall` **will not remove this folder**: it stops and asks the user to move or delete these files first, so uninstalling cannot lose them. **`docs/GLOSSARY.md`** — inside the `secret quarantine` entry, the clause *"disposable — `wienerdog uninstall` removes it with everything else Wienerdog keeps"* is replaced by one saying that `wienerdog uninstall` stops while either quarantine directory still holds a file and asks the user to deal with them first. **Neither edit touches the clause `WP-quarantine-only-copy-shelf` adds about the cap and only-copies** — that package lands first (`depends_on`) and owns that clause; this package owns the uninstall clause. **The two GLOSSARY ranges overlap on paper and that is flagged deliberately** (round-zero note): that package's row **O8b** cites `docs/GLOSSARY.md:141-148`, the whole `secret quarantine` entry, which **contains** this package's `:146-147` target. There is **no content collision** — O8b adds a clause beside *"disposable"* about the cap and only-copies, this package replaces the *"`wienerdog uninstall` removes it …"* clause — but the paper overlap is why the ordering is a `depends_on` and not a convention, and why the implementer **re-derives the line numbers after that package has landed** rather than trusting either range. **Neither sentence may promise a copy, an export destination or a recovery path this package does not ship**, and neither may strengthen the "may be the only copy" hedge |

### Table V — which reversers delete RECURSIVELY (canonical)

*Table X row **X16**'s from-above half applies to **exactly** the kinds marked
YES, and to nothing else. Measured at `5b77865f` with
`grep -n 'recursive: true' src/core/manifest.js`, which returns **three** hits:
`:593`, `:645` and `:1148`. **Amended at round 11: `:1148` is NOT an exemption.**
`disposeCoreMechanics`'s own recursive sweep is **governed by Table X row X16 via
Table X row X1**, through the protected-shelf-target check of Table X row **X18** —
as is **step 2's new per-child recursive delete**, which this package adds and which
the same grep will report once implemented. **Every recursive delete in this
package is one X16 rule over X17 anchors; no site is exempt.** **Amended again at
round 13:** this table's YES column originally meant *"deletes bytes
recursively"*, and the `symlink` kind is governed for a **different** reason —
it deletes **reachability**, not bytes (Table X row **X20**). Read the column as
*"the pre-dispatch guard applies"*, with each row saying which clause applies and
why. **This is an
enumeration of our own recursive deleters, and it is closed only as long as it is
re-measured**: an implementer adding a kind whose reverser deletes recursively must
add it here in the same change, and the verification step below re-runs that grep
and requires **every** hit to be accounted for in this table.*

| Kind | Reverser | Deletion shape at `5b77865f` | From-above half applies? |
|---|---|---|---|
| `file` | inline, `manifest.js:880-901` | `fs.rmSync(resolved, {force:true})` on a path `isFile` has already accepted — **not recursive** | no |
| `dir` | inline, `:901-919` | `fs.rmdirSync(resolved)`, and only when the directory is **virtually empty** (`:909-916`) | **no — and deliberately so**: guarding it would add a `skipped` line to an ordinary uninstall and break Table W row **W6** |
| **`symlink`** | `reverseSymlink`, `:241` | `unlinkSync` of one link (`:314`) — **not recursive**, so the *from-above* half does not apply | **YES, by Table X row X20 — a different clause, and round 13 is why.** Removing a link deletes no bytes, but it can **break the resolution chain** of a protected shelf, after which a later recursive delete is no longer gated. The guard preserves such an entry |
| `managed-block` | `reverseManagedBlock`, `:340` | rewrites/truncates one file in place | no |
| `settings-entry` | `reverseSettingsEntry`, `:451` | rewrites one JSON file in place | no |
| `scheduler-entry` | `reverseSchedulerEntry`, `:501` | `fs.rmSync(entry.path, {force:true})` on one file (`:543`) | no |
| **`vendored-tree`** | `reverseVendoredTree`, `:586` | **`fs.rmSync(entry.path, {recursive:true, force:true})` (`:593`)**, gated only by `sameResolvedDir(entry.path, appRoot)` (`:588`) | **YES** — the instance round 9 measured |
| *(not a kind)* **the mechanics sweep** | `disposeCoreMechanics`, `:1148` | `fs.rmSync(dir, {recursive:true, force:true})` over `logs`/`schedules`/`secrets` | **Governed by X16 via X1/X18** — not exempt. `<core>/logs` can be a real directory a shelf symlink resolves into |
| *(not a kind)* **step 2's per-child delete** | `disposeCoreMechanics`, **new in this package** | `fs.rmSync(child, {recursive:true, force:true})` over `<state>`'s non-shelf children | **Governed by X16 via X18** — the site round 11 measured |
| **`copied-skill`** | `reverseCopiedSkill`, `:615` | **`fs.rmSync(entry.path, {recursive:true, force:true})` (`:645`)**, gated by a parent-equals-skills-root test and a `hashDir` match (`:640`) | **YES** — harder to forge than `vendored-tree`, and included anyway: **the rule is over the deletion SHAPE, not over how hard each arm is to reach** |

### Table Y — security rows (canonical)

| Row | Threat | What holds |
|---|---|---|
| **Y1** | A shelf byte, or a shelf filename, reaching a surface that persists or displays it | Closed at the source: the inventory reads **metadata only** (Table K row **K6**), so no file is ever opened, and the refusal prints **directory paths, an entry count and a byte total** — never a filename, never a fragment of content. Filenames are `<date>-<sanitized note basename>`, derived from the user's own note paths; the user is about to list the directory themselves, so printing them buys nothing and not printing them is strictly safer. Asserted, not assumed — acceptance criterion 5 |
| **Y2** | **A new sensitive artifact created by the uninstall itself** | Under Table W row **W1**'s recommended cell there is **no export**, so there is no new file, no new directory, no new permission decision and no new thing to leave behind. This is the subtractive form of the answer and it is why the recommendation is what it is: an export would write a fresh, unmanaged pile of **unredacted credentials** into the user's home, outside the core, outside the manifest, unknown to every future Wienerdog run and unremovable by any uninstall — the accidental-persistence outcome ADR-0034 exists to prevent, performed as the last act of a command the user ran to remove the product |
| **Y3** | The same threat **under an overrule of W1 to a copying destination** | Binding contract, written now so an overrule needs no new design. Such an export **must never**: print or log any shelf file's contents; create a destination file more permissive than `0600` or a destination directory more permissive than `0700`, or widen the mode of any path that already exists; follow a symlink out of the shelf (classify every entry with `lstat`, never `dereference`); copy anything that is not a regular file; **leave a copy the user was not told about** — every destination path is named in the pre-consent disclosure **before any byte is written**, and a run that cannot name it writes nothing; overwrite an existing file at the destination; or delete a shelf file whose copy was not verified present at the destination. **And it must not construct a destination path from a shelf-supplied name without an anchored recognizer of what `quarantinePreserve` writes** — an entry whose name is not recognized is **copied nowhere, deleted nowhere, and named in the report as left in place**, so nothing unrecognized is silently destroyed |
| **Y4** | An untrusted identifier reaching a filesystem path or an argv | Under **W1**'s cell the package builds no argv at all, and every path it constructs is either a literal join of `paths.state` (Table K row **K1**) or that join with **one `readdirSync` name that has already matched the closed ASCII-case-fold set of Table X row **X12****. **It enumerates its own good twice over:** the accepted names are exactly the ASCII case variants of `quarantine` and `redacted` — a finite, closed set, because our names are pure ASCII with no combining marks — and **everything under the shelves is treated as the user's regardless of its name**. No entry name is ever classified as bad, matched against a denylist, or used to build a path before it has matched that set; a `readdirSync` name cannot contain a separator in any case. There is no grammar here we do not own, and no name is trusted with anything |
| **Y5** | An unreadable shelf read as an empty one — the **fail-open** direction | Closed by Table K row **K4** at both sites. This is the failure that loses the data: `rmSync({force:true})` succeeds silently on a tree the walk could not see. Chmod-ing one's own `0700` directory is a same-user act and not an adversary this package defends against; what matters is that the **accident** — a permission-damaged shelf, an `EIO`, an `EMFILE` under load — cannot read as "nothing to preserve" while the tree is disposed |
| **Y6** | The manifest used to move this decision in either direction | **Corrected at design gate round 8, which falsified the earlier absolute form of this row.** The shelves are not in the manifest and **this package does not put them there** (Table X row **X6**) — but *not being in the manifest was never the same as being safe from it*. A forged hash-less `{kind:'file'}` naming a shelf path passes `validateEntry` and `withinAllowedRoot` and reaches `rmSync` in the shipped `reverse()`, measured in round 8. **What actually closes it is Table X row X16's pre-dispatch shelf guard, in BOTH directions** — it skips and reports any entry of any mutating kind whose literal or resolved target is **at or under** a shelf root, **and** any entry of a recursively-deleting kind (Table **V**) whose target **contains** one, preserving whenever a shelf resolution is **unanswerable** — which by Table X row **X17** means a code **other than** `ENOENT`/`ENOTDIR`, since an absent shelf is answered, not failed. **Round 9 is why the second half exists**: a forged `{kind:'vendored-tree', path:'<core>/state'}` with `<core>/app` symlinked to `<core>/state` targets neither shelf subtree, yet its recursive `rmSync` takes both. With that guard in place: no forged, stripped, stale or hand-edited manifest entry changes what is preserved, whether the run refuses, or what the refusal says. ADR-0038's direction is honored twice over — the deletion only narrows, **and the narrowing does not depend on the untrusted file at all** |
| **Y7** | `--yes`, or any scripted invocation, silencing the refusal | Closed by Table W row **W2**: the refusal is raised before the `if (!yes)` branch is reached and is independent of it. Asserted for both runs, with identical text (acceptance criteria 3 and 4) |
| **Y9** | **The sweep escaping the core through a symlink and deleting files nowhere near it** | *Design gate round 2.* Closed by Table X row **X10**: every classification is `lstat`-based, a symlinked `paths.state` is unlinked without being descended, and a shelf root that is not a real directory is preserved untouched. **This is the one threat this package could have created rather than closed** — `5b77865f` is safe here by accident of using a single recursive `rmSync`, and replacing that with our own enumeration is what put it at risk. The blast radius without X10 is arbitrary: the link target is wherever the user pointed it, and neither the vault guard (`manifest.js:1144`) nor ADR-0041's clearance can see an `fs.rmSync` outside the core |
| **Y10** | **This package's own preservation instinct stranding a CREDENTIAL and destroying the retry path** | *Design gate round 5.* Closed by Table X row **X13**. The package exists to stop a deletion, and the failure mode that creates is to stop the wrong one: a blanket no-throw reading of the disposer swallows an `EPERM` removing `paths.secrets`, leaves the **Google OAuth token** on disk, and then lets `uninstall.js` delete the manifest and `config.yaml` (`:423-462`) so the retry refuses with *"no install manifest found"*. **Preserving the user's own text is the safe direction; preserving a secret is the opposite one**, and ADR-0019's Decision (`:47-50`) already says why `secrets/` must go. The no-throw handling is therefore scoped to the shelf levels and the pre-existing empty-core step, and every other deletion failure propagates as at `5b77865f`, which is the shipped recovery contract |
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
| `quse-mechanics-failure-swallowed` | **16** | `src/core/manifest.js` | wrap the mechanics sweep's recursive `fs.rmSync` in a swallowing `try/catch`, i.e. implement the withdrawn blanket "never throw" literally | `const mechanics = [` — **1** | *Round 5.* Criterion 16 asserts that an error **propagates** and that two files **still exist**. Both halves go green on a fixture whose injected `EPERM` never fired, and the existence half goes green on any run that failed for an unrelated reason before reaching the manifest delete. **The mutation is the exact shape a literal reading of the old Implementation note would have produced**, which is why it is declared rather than argued |
| `quse-dry-run-plans-by-assuming` | **17** | `src/core/manifest.js` | make the `dryRun: true` arm predict `<state>` removed **unconditionally** instead of running Table X row **X15**'s planner — the "assume the syscalls would succeed" horn of the round-7 finding | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the planner's prediction | *Round 7.* Criterion 17's populated arm asserts that the plan **does not** predict removal — an absence assertion over one line of output, which goes green whenever the fixture's shelf was empty, the wrong stream was captured, or the plan was never printed. The **other** horn (skip the syscalls, never predict `<state>`) is caught by criterion 7's byte-identity and `quse-block-printed-on-an-empty-shelf`; this declaration covers the horn nothing else reaches |
| `quse-reverse-shelf-guard-dropped` | **18** | `src/core/manifest.js` | remove Table X row **X16**'s pre-dispatch shelf guard **entirely — both halves**, restoring the shipped `reverse()` behaviour exactly | `if (resolvesTo(entry.path, paths.manifest) \|\| resolvesTo(entry.path, paths.core)) {` — **1** (the global deferred-member guard the new one sits immediately after; `const MUTATING_KINDS = new Set([` is also **1** if a wider find-string is needed) | *Round 8.* Criterion 18 asserts that a shelf file's **bytes survive** a replay that was trying to delete them — a survival assertion, and the most easily faked one in this package: it also passes when the forged entry was never added, when the fixture's path did not actually land under the shelf, when the preserve never completed before the replay, and when `reverse()` was never reached at all. **This is the one mutation that restores shipped `main` behaviour**, so a suite that stays green under it is asserting nothing this package adds |
| `quse-reverse-guard-from-below-only` | **18** | `src/core/manifest.js` | keep Table X row **X16**'s **from-below** half and delete only its **from-above** half, restoring the round-9 gap exactly | `if (!sameResolvedDir(entry.path, appRoot)) {` — **1** (`reverseVendoredTree`'s only ownership test, the gate the forged entry passes) | *Round 9.* Without this declaration the from-above half is **invisible to every assertion in this package**: `quse-reverse-shelf-guard-dropped` removes both halves at once, so a suite that only ever fixtures an at-or-below target stays green under a from-below-only implementation. This is the narrower mutation that isolates the half round 9 added |
| `quse-absent-shelf-read-as-unanswerable` | **18** | `src/core/manifest.js` | collapse Table X row **X17**'s outcomes (3) and (4) into one `catch`, so an `ENOENT` at a shelf level preserves the entry — the round-10 defect, restored exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is X17's error classification inside the guard's anchor construction | *Round 10.* Criterion 18's arm (a) asserts that an ordinary uninstall **skips nothing new** and its output is byte-identical. Both halves go green on a fixture whose install had a shelf (so absence was never exercised), and the byte-identity half goes green whenever the wrong stream was compared. **This is the mutation that turns the package's protection into a denial of service on every install that never quarantined anything** — the majority case — which is why it is declared rather than argued |
| `quse-step2-deletes-through-alias` | **1**, 9 | `src/core/manifest.js` | compute Table X row **X18**'s protected shelf targets **after** step 2 instead of before it — the exact order round 11 measured — leaving step 2's containment check with nothing to check | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the ordering of X1 step 1 against step 2 | *Round 11.* Criteria 1 and 9's alias arms assert that bytes **inside a sibling directory** survive. That is a survival assertion two indirections away from anything the fixture names directly, and it goes green whenever the alias was never created, the preserve never went through it, or the sweep never ran. **It is also the only mutation in this package that produces a loss REPORTED AS A SAVE** — a dangling link listed in `preservedQuarantine` — which is the shape a reviewer reading the output would be least likely to question |
| `quse-state-alias-unlinked` | **1**, 14 | `src/core/manifest.js` | restore the unconditional step-0 unlink — a symlinked `paths.state` is `unlinkSync`'d whatever its target covers (Table X row **X19** removed, **X1** step 0b's first arm deleted) | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is step 0b's symlink classification | *Round 12.* Criterion 1's `<state>`-alias arm asserts that an original under the alias target survives **both** live disposer calls. **A suite that exercises only the FIRST call stays green under this mutation**, because the first sweep's targets were computed before the unlink — the loss happens on the second, when the alias is gone and the anchors resolve to nothing. This declaration is what forces the two-call fixture to exist |
| `quse-symlink-entry-breaks-chain` | **18** | `src/core/manifest.js` | exempt the `symlink` kind from the pre-dispatch guard, restoring Table **V**'s pre-round-13 row exactly | `reverseSymlink(entry, dryRun, removed, skipped, removedSet, skillsRoots);` — **1** (the dispatch line the guard must run before; `if (!dryRun) fs.unlinkSync(L);` at `:314` is also **1** if a narrower site is wanted) | *Round 13.* Criterion 18's resolution-chain arm asserts that an **alias and an original both survive** a `reverse()` plus two disposer calls plus a retry. **Every other declaration in this package mutates a deleter; this one mutates an exemption**, and the loss it restores happens **two steps downstream** of the mutated line — the unlink is harmless in itself, and only the later recursive delete destroys anything. A suite that checks the shelf immediately after `reverse()` stays green |
| `quse-protected-set-is-anchors-only` | **1** | `src/core/manifest.js` | build the protected set from Table X row **X17**'s two **anchors** alone, dropping **(1a)**'s chain-closure walk — the round-14 defect exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the protected-set construction | *Round 14.* Criterion 1's two-hop arm asserts an intermediate link and an original survive **two disposer calls and a retry**. **Under the mutation the first call still passes** — it protects `logs` from its cached anchors — and the loss appears only on the second, after the chain has been broken. So the declaration is what forces the fixture to run the sequence twice rather than once, and it is the only one that distinguishes *"the anchors were right"* from *"the closure was computed"* |
| `quse-chain-node-over-protects` | **2** | `src/core/manifest.js` | collapse Table X row **X17 (1a)**'s two classes into one, so a **class (ii)** chain node protects its descendants as well — the round-15 defect exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the protected-set classification | *Round 15.* Criterion 2's symlinked-core arm asserts that `secrets`, `logs` and `app` are **gone**. **Every other declaration in this package proves something SURVIVES; this one proves something is still REMOVED**, which is the direction a protection package stops testing once it starts preserving. Under the mutation the credentials are stranded and the manifest is deleted anyway — a fail-safe that fails unsafe |
| `quse-manifest-deleted-after-preserve` | **19** | `src/cli/uninstall.js` | delete the manifest unconditionally after the live sweep, ignoring `preservedQuarantine` — the shipped `:424` behaviour, restored | `fs.rmSync(paths.manifest, { force: true });` — **1** | *Round 15.* Criterion 19 asserts two files **still exist** after a run that preserved something. The existence half goes green on any run that failed earlier for an unrelated reason, and the fixture only reaches the mutated line through **X3**'s window — so without the declaration nothing distinguishes *"the gate held the manifest"* from *"the window never opened"* |
| `quse-w10-checks-first-sweep-only` | **9** | `src/cli/uninstall.js` | make Table W row **W10**'s check consult only the **first** sweep's returned `preservedQuarantine`, dropping the fresh `quarantineInventory` read — the round-16 defect exactly | `fs.rmSync(paths.manifest, { force: true });` — **1** (the statement the check sits immediately before) | *Round 16.* Criterion 9's after-the-first-sweep arm asserts the manifest and config **still exist** and that a retry **completes**. **Under the mutation the first sweep legitimately returns nothing**, so the check passes on stale evidence and the ledger is deleted — and every earlier interleaving fixture, which seeds before the first sweep, **stays green**. This declaration is what forces the seam to fire between the two sweeps rather than before them |
| `quse-hypothetical-root-not-subtree` | **18** | `src/core/manifest.js` | give a **hypothetical** shelf root class (ii) semantics — node and ancestors only, no descendants — restoring round 16's over-narrowing exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is X17 (1a)'s hypothetical classification | *Round 17.* Criterion 18(b)'s round-17 arm asserts bytes **survive** a replay on a stable symlinked core with initially **absent** shelves. **Nothing else in this package reddens under it:** the lexical anchors still catch every `<core>`-relative path, so only a fixture that names the **physical** path *and* lets the shelf appear after anchor computation can see the hole. The declaration is what forces both of those fixture properties to exist |
| `quse-alias-into-swept-dir-unlinked` | **9** | `src/core/manifest.js` | drop clause **(b)** from Table X row **X19**, so a `<state>` alias is unlinked whenever no **existing** shelf's chain passes through it — the round-18 defect exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is X19's retention predicate | *Round 18.* Criterion 9's before-the-unlink arm asserts an original survives **a full retry**. **Under the mutation the FIRST run still passes** — the first sweep preserves `logs` from its cached set and W10 keeps the manifest — and the loss appears only on the **second** command. So this declaration is what forces the fixture to re-run the whole uninstall rather than stopping at a green first pass, and it is the second declaration in this package whose defect is invisible to a single-pass suite |
| `quse-alias-ancestor-of-target-unlinked` | **9** | `src/core/manifest.js` | test Table X row **X19** clause (b) **one way only** — retain when the alias target lies *inside* a swept directory — instead of overlapping `withinAllowedRoot`'s roots in **both** directions; the round-19 defect exactly | `const allowedRoots = [paths.core, paths.claudeDir, paths.codexDir, localBin];` — **1** (the shipped root set clause (b) now tests against) | *Round 19.* Criterion 9's ancestor arm asserts an original survives a mechanics failure **and a full retry**. **Under the mutation the first run still passes and the retry destroys the file**, and no earlier fixture reaches it: every one of them puts the alias target **inside** `<core>`, where the one-way test already retains. This declaration is what forces a fixture whose alias target is an **ancestor** of a replay target and lies **outside** `<core>` |
| `quse-shelf-guard-skip-not-propagated` | **19** | `src/cli/uninstall.js` | have Table W row **W10** consult only `preservedQuarantine` and the fresh inventory, ignoring `reverse()`'s `shelfGuarded` — the round-20 defect exactly | `fs.rmSync(paths.manifest, { force: true });` — **1** (the statement W10's check sits immediately before) | *Round 20.* Criterion 19's replay-guard arm asserts the manifest and config **survive** a run in which the disposer preserved **nothing** — the stop comes from `shelfGuarded` alone. **Every other W10 fixture in this package makes the disposer preserve something**, so all of them stay green under this mutation; only a fixture whose resolution failure is confined to the replay window can see it. The declaration is what forces that confinement to be built |
| `quse-dry-run-block-suppressed` | 6 | `src/cli/uninstall.js` | drop the block from the `--dry-run` arm while leaving the refusal intact | `item(s) would be removed, ${skipped.length} skipped.` — **1** | criterion 6 observes **disclosure**, not the refusal. Without this declaration a suite can assert the refusal (which is loud) and never notice that `--dry-run` — the surface a user consults precisely to find out what an uninstall will do — says nothing about the shelf at all |

**Twenty-five declarations in one file, over thirteen criteria — criterion 1 carries
four, criterion 18 four, criterion 14 three; criteria 1 and 9 share round 11's
alias declaration and criteria 1 and 14 share round 12's. Fourteen carry a
pre-measurable anchor and eleven mutate code this package authors**
(`quse-unreadable-shelf-read-as-empty`, `quse-shelf-validated-leaf-first`,
`quse-shelf-name-case-sensitive`, `quse-dry-run-plans-by-assuming`).
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
      **X1**/**X2**/**X4**/**X9**/**X10**/**X11**/**X12**/**X13**/**X15**/**X16**/**X17**/**X18**/**X19**/**X20**/**X21**/**X22**
      and Table **V**;
      the `uninstall.js` row → Table K row **K5** and Table W rows
      **W2**–**W5**/**W7**/**W8**/**W10**/**W11**; the two test rows → the acceptance criteria,
      and the `manifest.test.js` row additionally restates **X1**'s `ENOTEMPTY`
      arm and **K2**'s empty-shelf-directories fixture;
      the proofs row → Table B; the ADR row → owner item 1; the two doc rows →
      Table W row **W9**
- [ ] **Acceptance criteria that assert its facts** — criterion 1 asserts Table X
      rows **X1**/**X4**/**X18**/**X19** and **X17 (1a)**; criterion 2 asserts Table X row **X1**'s
      ABSENT/EMPTY arm, Table K rows **K2**/**K3** and Table W row **W6**;
      criterion 3 asserts Table W rows
      **W3**/**W4** and Table K row **K3**; criterion 4 asserts Table W row
      **W2** and Table Y row **Y7**; criterion 5 asserts Table K row **K6** and
      Table Y row **Y1**; criterion 6 asserts Table W row **W5**; criterion 7
      asserts Table W row **W6** and Table X row **X4**'s granularity; criterion 8 asserts Table K row **K4** and
      Table Y row **Y5**; criterion 9 asserts Table X rows **X1**/**X3**/**X18**, Table
      K row **K7** and Table W row **W8**; criterion 10 asserts Table W row **W7**;
      criterion 11 asserts owner item 1's text; criterion 12 asserts Table W row
      **W9**; criterion 13 asserts the refusal's idempotence; criterion **14**
      asserts Table X rows **X10**/**X11**/**X19** and Table Y row **Y9**; criterion **15**
      asserts Table X row **X12** and Table K row **K1**; criterion **16**
      asserts Table X row **X13** and Table K row **K4**'s scoping; criterion **17**
      asserts Table X row **X15** and Table W row **W5**; criterion **18**
      asserts Table X row **X16**'s three clauses, Table X rows **X17**'s four
      outcomes and **X20**, Table **V** and Table Y row **Y6**; criterion **19** asserts Table W
      row **W10**; criterion 19
      asserts Table B
- [ ] **Security-checklist bullets that restate a contract** *(registered at
      round 4, when the first bullet was found stating **K1**/**Y4**'s
      superseded "exactly two literal paths" claim)* — the untrusted-identifier
      bullet mirrors **K1**/**Y4**/**X12**; the symlink bullet mirrors
      **X10**/**X11**/**Y9**; the case-fold bullet mirrors **X12**; the
      no-snapshot bullet mirrors **X1**/**X2**/**X3**; the emptying-the-shelf
      bullet mirrors **K2**; the propagation bullet mirrors **X13**/**Y10**
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

### 4. Should `uninstall` refuse whenever ANY symlink exists under `<core>`?

- *Recommendation:* **no — accept the named residual `R-alias-outside-closure`
  (Table X row **X21**) with its stated reason, and add no such refusal.**
- *Why it is an owner item at all:* it is the only design that would close the
  residual, and refusing to build it is therefore a decision about accepted risk,
  not a local choice. Four consecutive review rounds each produced one further
  alias shape, which is exactly the evidence that would justify an owner looking
  at the blunt instrument.
- *The alternative, stated fully:* before any deletion, walk `<core>` and refuse
  the uninstall if **any** symlink exists anywhere beneath it, naming each one.
  It is genuinely closed — no chain can be redirected if no link may exist — and
  it uses the same retryable refusal shape Table W row **W3** already ships.
- *Why it is not the default:* **a symlinked vault or app directory is a
  supported layout**, and an ordinary install using one **could not uninstall at
  all** until the user rearranged their own filesystem. That is a certain cost to
  every such user, paid against a residual that requires the same user to have
  created an alias into their own `0700` quarantine and then redirected it
  **during** the uninstall.
- *Overrule cost:* the refusal becomes reachable on ordinary installs, `W6`'s
  byte-identity claim narrows to installs with no symlink under `<core>`, and
  acceptance criterion 7 needs a second fixture establishing that. If overruled,
  Table X row **X21**'s residual is struck and the refusal joins Table W.

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
- **`disposeCoreMechanics`'s no-throw promise is NARROW — Table X row X13, and
  do not widen it.** *(Round 5.)* An earlier revision of this bullet said the
  function *"must never throw"*, full stop. **Read literally that swallows an
  `EPERM` removing `secrets/`, leaves a live credential on disk, and lets
  `uninstall.js` go on to delete the manifest and `config.yaml` — after which the
  retry refuses with "no install manifest found" and the user has no way back.**
  The claim is withdrawn. The promise covers **only** the shelf-specific outcomes
  and the pre-existing empty-core step; **every other deletion failure propagates
  exactly as at `5b77865f`**, which is what keeps the manifest and config alive
  for a safe retry (`uninstall.js:412-422` says so in the shipped code).
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
- **`dryRun: true` is not "the live path with the writes skipped".** *(Round 7.)*
  Written that way it cannot tell an empty shelf from a populated one, because the
  syscalls that would have told it are the ones being skipped — so it either never
  predicts `<state>` (incomplete plan on an empty install) or always does
  (mis-reports a populated shelf as removable). Write it as a separate read-only
  planner over `quarantineInventory` (Table X row **X15**), and let the live arm
  stay exactly as X1 specifies.
- **The shelf guard goes in `reverse()`'s PRE-DISPATCH region, not in the `file`
  handler.** *(Round 8.)* Patching the `file` handler closes the measured
  instance and leaves every other kind open — and `reverse()` already has the
  right precedent one line above: the global deferred-member guard blocks every
  path-based route for every kind at once, for exactly this reason. Put the shelf
  guard beside it. **Do not use `contains`**: its bare boolean fails closed to
  *not contained*, which here means *delete* (Table X rows **X7**, **X16**).
- **The protected set has two classes and they are NOT interchangeable.**
  *(Round 15.)* A **shelf subtree** (class (i)) protects its descendants; a
  **chain node** (class (ii)) protects only **itself and its ancestors**. Writing
  one check for both over-protects: `<core>` → `/data/wienerdog` then makes
  `secrets/` undeletable, which strands a live credential — the opposite failure
  from the one this package exists to stop. Implement the two comparisons
  separately and test both directions.
- **A link is not "harmless because it deletes nothing".** *(Round 13.)* Removing
  a link on a protected shelf's resolution chain destroys **reachability**, and the
  next recursive delete — no longer gated, because the anchors now resolve
  lexically — destroys the bytes. Treat `reverse()`'s `symlink` kind and the
  disposer's step 0b as the same rule: **no operation of this uninstall removes a
  link on the resolution chain of a protected shelf.** The `dir` kind stays exempt
  because it can remove neither a file nor a link.
- **Compute the protected shelf targets FIRST, before any mutation at all.**
  *(Rounds 11 and 12.)* The order in Table X row **X1** is load-bearing: protected
  targets → step 0b → step 2 → step 3. Computing them after step 2 leaves the
  check with nothing to check (round 11); computing them after step 0b lets the
  unlink erase the evidence they would have been derived from (round 12).
  **And earlier ordering alone is not enough** — the link must be *retained* when
  it covers a shelf, because the disposer runs **twice** (`uninstall.js:408`,
  `:467`) and a retry starts from whatever the last run left. And apply the check to the
  `logs`/`schedules`/`secrets` sweep too, not only to step 2 — it is the same
  recursive shape and the same alias reaches it.
- **Absence is not a failure, and one `catch` is how that gets lost.**
  *(Round 10.)* The shelves are created lazily, so on most installs they simply do
  not exist. Classify `ENOENT`/`ENOTDIR` separately from every other code at every
  shelf resolution (Table X row **X17**): the first contributes no resolved anchor
  and skips nothing, the second preserves the entry and is reported. Build the
  guard's anchors **lexically first** so it works before the shelves exist, and
  derive the resolved anchors through the nearest existing ancestor rather than
  requiring the shelf itself to resolve.
- **The shelf guard has TWO halves and the second one is easy to forget.**
  *(Round 9.)* Guarding only targets *at or under* a shelf leaves a recursive
  delete of an **ancestor** wide open — that is how a forged `vendored-tree`
  entry reaches the shelf without naming it. Apply the from-above half to exactly
  the kinds Table **V** marks YES, and **re-run `grep -n 'recursive: true'
  src/core/manifest.js` before you finish**: if it returns a hit outside
  `:593`, `:645` and `:1148`, a kind has been added and Table V is stale — say so
  rather than guessing.
- **Keep the `rmdir` bookkeeping internal.** *(Round 6.)* The natural shape is to
  push each successful `rmdirSync` onto `removed` as the loop goes. **That is the
  defect**: `removed` is public, the caller sums its length into *"Removed N
  item(s)"* and renders it as the `--dry-run` mechanics plan, so an install with
  two **empty** shelf directories would report three paths where `5b77865f`
  reports one. Track the climb in a local, and push `paths.state` **once** at the
  end, only if the whole of `<state>` is gone (Table X row **X4**).
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
      `paths.state` is never descended, and — since round 12, refined at round
      18 — is unlinked **only when Table X row X19 permits it: no EXISTING shelf
      chain passes through it AND its target is disjoint from all four of
      `withinAllowedRoot`'s roots** — `<core>`, `claudeDir`, `codexDir`,
      `~/.local/bin` (`manifest.js:742`). A `<state>` symlink that fails either
      test is **retained and reported**, because unlinking it erases the evidence
      the second disposer call (`uninstall.js:467`) **and any retry** would need —
      round 18 measured the retry half, where the first run looked correct and the
      second destroyed the original, and **round 19 replaced the swept-directory
      enumeration with the allowed-root set, which is CLOSED by construction**:
      `withinAllowedRoot` gates every mutating replay kind, so no deletion this
      command performs can reach outside those four roots. A shelf root that is not a
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
- [x] **The untrusted manifest cannot reach the shelf through `reverse()` either**
      — Table X row **X16**, Table Y row **Y6**. *Round 8 falsified the earlier
      form of the bullet below:* a hash-less `{kind:'file'}` naming a shelf path
      passes `validateEntry` and `withinAllowedRoot` and reaches `rmSync` in the
      shipped replay, and the manifest's bytes never change, so the byte-compare
      does not help. A pre-dispatch guard now skips and reports any entry of any
      kind whose **literal** or **resolved** target is shelf-resident, and
      **preserves when the containment question is UNANSWERABLE** — a code other
      than `ENOENT`/`ENOTDIR`, per Table X row **X17**; an absent shelf is
      answered, not failed — the opposite of `contains`'s bare boolean, and the
      direction ADR-0038 permits.
      **And the guard is symmetric** (round 9): *no manifest-driven deletion may
      cover a shelf path from below **or** from above.* A forged
      `{kind:'vendored-tree', path:'<core>/state'}`, reachable whenever
      `<core>/app` resolves to `<core>/state`, targets neither shelf subtree yet
      its recursive `rmSync` takes both — so an entry of a **recursively-deleting**
      kind whose target **contains** a shelf root is skipped too. Table **V**
      enumerates those kinds (`vendored-tree`, `copied-skill`) from the shipped
      code, and the verification step re-runs the grep that produced it.
      **And the guard never fires on ABSENCE** (round 10, Table X row **X17**):
      the shelves are created lazily, so an install that never quarantined
      anything has none, and an earlier "any resolution failure preserves" reading
      turned every ordinary app-tree removal into a skip — after which
      `uninstall.js` deleted the manifest and left the skipped component with no
      retry ledger. `ENOENT`/`ENOTDIR` is **absence** and skips nothing; every
      other code is **unanswerable** and preserves; the two are kept
      distinguishable in the implementation and in the tests.
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
- [x] **No operation of this uninstall removes a LINK on the resolution chain of
      a protected shelf** — Table X rows **X19** (the disposer's step 0b) and
      **X20** (`reverse()`'s `symlink` kind), which are one rule seen from two
      sides. *Round 13 measured the second half:* with `<state>` →
      `<claude>/skills/wienerdog-test` → `<core>/logs` and an original in
      `logs/quarantine/`, a `symlink` manifest entry naming the **intermediate**
      alias resolves **above** the shelf, so the containment check permitted it;
      `reverse()` unlinked it, the disposer then met a dangling `<state>`, X17
      rebuilt its anchors lexically, and the recursive delete of `logs` was no
      longer gated. **Deleting reachability is as destructive as deleting bytes,
      one step later**, which is why the `symlink` kind is governed although it
      removes nothing. The `dir` exemption is kept: it can remove neither a file
      nor a link.
- [x] **No recursive delete in this package can reach the shelf through another
      pathname** — Table X row **X18**, Table **V**. *Round 11 measured the gap
      X11 could not close:* with `<state>/quarantine` symlinked to
      `<state>/cache`, step 2 recursively deleted `cache` — a non-shelf sibling by
      name — **before** step 3 preserved the link, and since `quarantinePreserve`
      writes **through** the alias, the sole original went with it while the
      dangling link was reported as *preserved*. **Top-down `lstat` validation
      protects a path from being deleted as itself; it says nothing about the same
      bytes being deleted through another name.** The protected shelf **targets**
      are therefore computed **first**, and **every** recursive deletion in the
      disposer — step 2's per-child removal **and** the `logs`/`schedules`/`secrets`
      sweep at `:1148` — is gated on them by X16's symmetric check, preserving on
      an unanswerable resolution. **No site is exempt**, and Table V no longer
      lists one.
- [x] **Preserving the user's text never becomes preserving a SECRET, and never
      destroys the retry path** — Table X row **X13**, Table Y row **Y10**. The
      no-throw handling is scoped to the shelf levels and the pre-existing
      empty-core step; a failure removing `paths.secrets`, `paths.logs`,
      `<core>/schedules` or any non-shelf child of `<state>` **propagates exactly
      as at `5b77865f`**, so `uninstall.js` never reaches its manifest and config
      deletes and the install stays reversible. Asserted by criterion 16 with an
      injected `EPERM` on `secrets/`.
- [x] **The protected object is a SET, not two anchors, and the family is BOUNDED**
      — Table X rows **X17 (1a)** and **X21**. The set is the **closure of each
      shelf's resolution chain**: every link's own **location**, every intermediate
      target, and the final resolved target, walked component by component. Round
      14 measured why the location matters: `<state>/quarantine` →
      `<state>/cache/link` → `<core>/logs/recovery` puts the intermediate link at a
      path overlapping **neither** anchor, so `cache` was recursively deletable and
      the **second** sweep — rebuilding anchors through the now-dangling shelf —
      deleted the original. **And the family is bounded rather than left open:**
      **`R-alias-outside-closure`** names what is *not* defended — an alias created
      **after** the protected set is computed that redirects a chain component —
      accepted because every such link is the **same user's own act** on their own
      `0700` files and closing it needs a filesystem transaction no platform
      offers and a resident process ADR-0004 forbids. **Owner item 4** carries the
      overrule, with its cost. **And the set has TWO classes, because one
      over-protected** (round 15): a **shelf subtree** protects its descendants, a
      **chain node** protects only itself and its ancestors — otherwise a supported
      `<core>` → `/data/wienerdog` layout made `app`, `logs` and **`secrets`**
      undeletable while the manifest was deleted anyway, stranding **credentials**
      with no retry. **A protection that strands a credential has failed in the
      other direction**, and ADR-0019's Decision (`:47-50`) is explicit that
      `secrets/` must go.
- [x] **Preserving the user's text never costs the user the ability to FINISH** —
      Table W row **W10**, extended at round 20 by Table X row **X22**. **A replay
      entry the shelf guard skipped is an installed component still on disk**, and
      a transient `EIO` during replay could otherwise skip `app` and hook entries,
      let a later successful read find empty shelves, and permit the manifest
      delete — leaving those components with the retry refusing *"no install
      manifest found"*. W10 now consults **three** inputs, and an **unanswerable
      protected set at `reverse()`'s guard initialisation ABORTS the live replay
      before any mutation**, in the disposer's own unreadable-case shape (`K4`).
      **And the original half of W10 still holds:** **W3**'s refusal is the
      pre-plan gate and has already passed by `uninstall.js:424`, so a sweep that
      preserved something would otherwise have its manifest and `config.yaml`
      deleted underneath it and the retry refused with *"no install manifest
      found"*. When the live sweep returns
      a non-empty `preservedQuarantine` the run **stops before the manifest
      delete**, in the shape `:428-432` already ships. Same lesson as Table X row
      **X13**, one step later.
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
      **Round 11 adds the ALIAS arm, on the direct sweep** (Table X row **X18**):
      with `<state>/quarantine` a **symlink to `<state>/cache`** and the original
      written through the alias into `cache`, `disposeCoreMechanics` leaves the
      **original's bytes intact** — asserted by reading them back from
      `<state>/cache` — leaves the `cache` **directory itself** in place and
      **reported in `preservedQuarantine`**, and leaves the `quarantine` link.
      **The link must NOT be reported as preserved while its target is gone:**
      round 11 measured exactly that pairing — a loss reported as a save — so this
      criterion asserts the **target's survival first** and only then anything
      about the link. Asserted for a `<core>/logs` alias target as well, so the
      `:1148` mechanics sweep is exercised and not only step 2.
      **Round 12 adds the `<state>`-alias arm, asserted across BOTH live disposer
      calls** (Table X row **X19**): with `<core>/state` a **symlink to
      `<core>/logs`** and the original at `logs/quarantine/…`, the original's
      **bytes survive** `disposeCoreMechanics` called **twice** — the sequence
      `uninstall.js` actually performs (`:408`, then `:467`) — the `<state>` link
      is **retained and reported**, and `<core>/logs` is **not** recursively
      deleted, counted through the seam. **The second call is the whole point:**
      an implementation that computes the targets early but still unlinks the
      alias passes on the first call and loses the original on the second.
      **Round 14 adds the TWO-HOP arm, and it is the one the anchors alone could
      not catch** (Table X row **X17 (1a)**): with `<state>/quarantine` →
      `<state>/cache/link` → `<core>/logs/recovery` and the original inside
      `recovery`, run `disposeCoreMechanics` **twice** and then the **whole
      sequence again as a retry**. After all of it the **intermediate link at
      `<state>/cache/link` still exists**, `<state>/cache` was **not** recursively
      deleted, and the **original's bytes are unchanged**. **Assert the
      intermediate link first**, then `cache`, then the bytes — the failure
      cascades in that order, and asserting only the bytes on the first call
      passes against the defect.
- [ ] **2.** *(Table X row **X1** and Table K rows **K2**/**K3**, ABSENT and
      EMPTY arms.)* Three fixtures, each ending with `<state>` **gone** and
      `preservedQuarantine: []`: `<state>/quarantine` **absent**;
      `<state>/quarantine` present and empty; and — **the round-1 fixture** —
      **both** `<state>/quarantine/` and `<state>/quarantine/redacted/` present
      as directories holding **nothing**, for which `quarantineInventory` must
      return `entries: 0` and a full `wienerdog uninstall` must **proceed and
      complete**. That third fixture is the state the refusal asks the user to
      reach, and under the pre-round-1 counting rule it refused forever.
      **In every one of the three, `removed` contains `paths.state` exactly once
      and contains neither shelf path** (Table X row **X4**) — the granularity the
      caller's count and plan depend on.
      **Round 15 adds the SYMLINKED-CORE arms, on the supported layout** (Table X
      row **X17 (1a)**, class (ii)): with `<core>` a **symlink to
      `/data/wienerdog`**, and run **twice — once with both shelves absent and
      once with both present and empty** — the ordinary mechanics **and the
      credentials are removed**: `/data/wienerdog/app`, `/data/wienerdog/logs`
      and **`/data/wienerdog/secrets`** are all **gone** afterwards, asserted by
      existence, and `install-manifest.json` is removed **only** after that clean
      sweep. **This is the arm the single-class closure failed**: it preserved
      every descendant of the chain node and stranded the credentials. The
      existing symlinked-core tests must continue to pass unchanged.
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
- [ ] **7.** *(Table W row **W6**, Table X row **X4**.)* On an install with no
      shelf entries, the **complete stdout of `--dry-run`, and of a full
      `uninstall --yes`, is byte-identical to the same run at `5b77865f`.**
      Asserted against a captured expectation, not by absence of the new strings
      alone. **Two fixtures, and the second is the round-6 one that the first
      cannot catch:** (a) **no shelf directory at all**; (b) **both
      `<state>/quarantine/` and `<state>/quarantine/redacted/` present as
      directories and empty** — the state the refusal asks the user to reach, and
      the state in which a naive implementation reports three removed paths where
      the baseline reports one. **Both the `Removed N item(s)` line and the
      `--dry-run` mechanics plan are compared in full**, because X4's granularity
      is visible in each of them and in neither alone.
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
      **Round 11 adds the post-gate ALIAS interleaving** (Table X row **X18**):
      the `quarantine` → `<state>/cache` symlink and a preserve through it both
      appear **after** the gate's inventory returned EMPTY and before the sweep;
      the original's bytes survive, `cache` is preserved and reported, and the
      recursive `fs.rmSync` over `cache` is **not** invoked — counted through the
      seam, because a skip and a delete of an empty directory both leave nothing
      to read.
      **Round 16 adds the AFTER-THE-FIRST-SWEEP arm, which is the one W10 missed**
      (Table W rows **W10**/**W11**): the copy is created **after the first live
      sweep at `uninstall.js:408` returned nothing** and **before** the manifest
      delete. The run **stops before `:424`**; `install-manifest.json` and
      `config.yaml` are **both still present**; the preservation is **reported with
      the directory named literally**; and **re-running the command after the user
      clears the shelf completes**. Asserted by driving the copy in through the
      seam at that exact point, not by pre-seeding the shelf — pre-seeding is
      criterion 3's fixture and the gate would refuse it.
      **Round 18 adds the BEFORE-THE-UNLINK arm, and it is the only arm that
      spans a full RETRY** (Table X row **X19** clause (b)): a **pre-existing**
      `<state>` → `<core>/logs` alias, both shelves **absent** at the retention
      decision, and the copy completing at `logs/quarantine/note` **after that
      decision and before the unlink**. Assert that the alias is **retained**, the
      copy is preserved and reported, **W10** keeps the manifest, and then **run
      the whole command again**: after the retry the **original's bytes are
      unchanged** and `<core>/logs` still exists. **The retry is the point** —
      under the pre-round-18 rule the first run passes and the second destroys the
      original, so an arm that stops at the first run asserts nothing.
      **Round 19 adds the ANCESTOR shape of the same arm, which round 18's rule
      missed**: `<state>` → **`~/.claude`** (an allowed root that is **outside
      `<core>`** and an **ANCESTOR** of a replay target), both shelves absent, and a
      sparse manifest holding a **hash-less** `{kind:'file'}` entry for
      `~/.claude/quarantine/2026-09-18-note.md`. The copy completes **before the
      unlink**; a **`secrets` `EPERM` is then injected** so **X13** retains the
      manifest; and the **whole command is re-run**. The alias is **retained**, and
      after the retry the **original's bytes are unchanged** and the `file` entry
      appears in `skipped`. **All three properties are load-bearing** — without the
      mechanics failure there is no retry, and without the retry the first run
      passes.
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
      `5b77865f`. **That arm is the no-shelf case by construction** — its external
      directory holds **no** `quarantine/` — and Table X rows **X19** and **X17
      (1a)**'s hypothetical-vs-existing distinction are what make the two arms
      consistent rather than contradictory: a `<state>` symlink is retained **only
      when an EXISTING shelf's chain passes through it**, and the merely
      **hypothetical** anchors derived for an absent shelf never trigger that
      retention. **Round 16 measured the contradiction this removes:** without the
      distinction, `<state>` → `/data/personal` with no `quarantine/` made the
      unlink branch unreachable and, with **W10**, made the uninstall stop forever
      with nothing to clear. **So this criterion also asserts the whole command
      COMPLETES on that layout**: `wienerdog uninstall` exits 0, the link is gone,
      the core is gone, the manifest is gone, and **a second run refuses with "no
      install manifest found"** rather than with a preservation stop. **And the
      fixture must place the target DISJOINT FROM ALL FOUR of `withinAllowedRoot`'s
      roots** (Table X row **X19** clause (b), as round 19 restated it) —
      `/data/personal` is outside `<core>`, `claudeDir`, `codexDir` and
      `~/.local/bin` alike — because that, not the shelf's absence alone, is what
      licenses the unlink. Asserted for
      the shelf roots too: a **symlink at
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
- [ ] **16.** *(Round 5 — Table X row **X13**.)* **An ordinary mechanics-deletion
      failure still propagates, and the retry still works.** With an `EPERM`
      injected on the removal of `paths.secrets`, `disposeCoreMechanics`
      **throws**, `wienerdog uninstall` exits non-zero, and **`install-manifest.json`
      and `config.yaml` are both still present** — asserted by existence **and**
      by content — so the install is still reversible. Clearing the injected
      failure and re-running then **completes**. Asserted for **`paths.secrets`**
      specifically, because that is the directory whose leftovers are live
      credentials. The same propagation is asserted for a failure enumerating
      `paths.state` (**X1** step 1). Conversely, a shelf-level `ENOTEMPTY` in the
      same run **does not** throw and is reported in `preservedQuarantine`, so the
      criterion measures the boundary rather than one side of it.
- [ ] **17.** *(Round 7 — Table X row **X15**.)* **`--dry-run` plans by reading,
      and reads only.** Three shelf states, each asserted on **both** the
      `--dry-run` output and the interactive pre-confirm plan: **empty or absent**
      ⇒ the plan predicts `<state>` removed, once, at X4's granularity;
      **populated** ⇒ the plan predicts `<state>` **not** removed and names the
      preserved shelf instead (and, for the interactive path, the refusal of
      Table W row **W3** has already fired, so this arm is asserted by calling
      `disposeCoreMechanics(paths, {dryRun:true})` directly); **unreadable** ⇒ the
      plan reports it and does not predict removal (Table K row **K4**). **And in
      every one of the three: ZERO mutating filesystem calls** — asserted through
      the test seam by counting `rmSync`, `rmdirSync`, `unlinkSync`, `writeFileSync`,
      `renameSync`, `mkdirSync` and `chmodSync` invocations and requiring **0**,
      not by inspecting the tree afterwards, which passes vacuously whenever the
      fixture had nothing to delete.
- [ ] **18.** *(Round 8 — Table X row **X16**, Table Y row **Y6**.)* **A forged
      manifest entry cannot reach the shelf, and the interleaving is what proves
      it.** With a **pre-existing** hash-less `{kind:'file', path:
      '<state>/quarantine/<name>'}` entry in the manifest, the shelf **empty**
      when the gate's inventory runs (so the run proceeds), and a preserve
      completing under exactly that name **before `reverse()` replays the
      entry**, the original's **bytes survive** — asserted by reading them back —
      the entry appears in `skipped`, and the manifest bytes are unchanged
      throughout, so the byte-compare is not what saved it. **Asserted for the
      alias shapes too**: the same path written with a `.` or `..` segment, and a
      symlink elsewhere in the allowed roots resolving into the shelf. **And for
      the unanswerable case**: with the shelf root's resolution made to fail, the
      entry is still **preserved**, never deleted.
      **Round 9 adds the FROM-ABOVE arm, and it is a different entry shape, not a
      variant of the same one** (Table X row **X16**, Table V): with
      `<core>/app` a **symlink to `<core>/state`** and a forged
      `{kind:'vendored-tree', path:'<core>/state'}` in the manifest — which
      satisfies `reverseVendoredTree`'s only ownership test — the shelf **empty**
      at the gate and a preserve completing before the replay, the original's
      **bytes survive**, `<state>` appears in `skipped`, and the recursive
      `fs.rmSync` is **not** invoked (asserted by counting it through the seam,
      not by the file's presence, which a skip and a successful-but-empty delete
      both produce). Asserted for **`copied-skill`** on the same shape. **And the
      negative control:** an ordinary `{kind:'dir', path:'<state>'}` entry is
      **not** guarded — Table V — so it still behaves exactly as at `5b77865f`
      and adds no `skipped` line, which is what keeps criterion 7 true.
      **Round 10 adds the three absence arms** (Table X row **X17**): **(a)** on
      an install that has **never quarantined anything**, so **neither shelf
      directory exists**, an ordinary `wienerdog uninstall` produces
      **byte-identical** output to `5b77865f` and **skips nothing it did not skip
      before** — asserted over the whole `skipped` array **and** the complete
      stdout, because this is the ordinary install and the round-10 defect turned
      every app-tree removal on it into a skip; **(b)** a shelf created **after
      the guard was initialised and before the entry is replayed** is still
      protected — the forged entry is skipped and the bytes survive — so absence
      at guard-build time never becomes a hole. **Round 17 extends (b) to the
      layout that broke it:** a **stable** `<core>` → `/data/wienerdog` symlink
      (created before the run, not during it), **both shelves initially absent**, a
      **pre-existing hash-less `{kind:'file'}` entry naming the PHYSICAL path**
      `/data/wienerdog/state/quarantine/2026-09-18-note.md`, and the preserve
      completing **after `reverse()` has initialised its anchors and before that
      entry is replayed**. The **bytes survive**, the entry lands in `skipped`, and
      the fixture asserts the entry uses the **physical** path — not the
      `<core>`-relative one — because routing through `<core>` is what the lexical
      anchors already catch and would make the arm vacuous; **(c)** the two are kept
      distinguishable: a shelf level made to fail with a **non-`ENOENT`** code
      **does** preserve the entry and report it, while `ENOENT` on the same level
      preserves nothing and reports nothing.
      **Round 13 adds the RESOLUTION-CHAIN arm, and it is the only one that spans
      `reverse()` AND both disposer calls AND a retry** (Table X row **X20**):
      with `<state>` → `<claude>/skills/wienerdog-test` → `<core>/logs` and the
      original at `logs/quarantine/…`, a `symlink` manifest entry naming the
      **intermediate** alias is **preserved and reported** by `reverse()`; then
      `disposeCoreMechanics` is called **twice** as `uninstall.js` calls it
      (`:408`, `:467`); then the whole sequence is **re-run as a retry**. After
      all of it the **intermediate alias still exists** and the **original's bytes
      are unchanged**, asserted by reading them back. **Assert the alias's survival
      before the original's**, because the alias is what makes the original
      protectable on the next pass. Also asserted with the entry naming the
      **outermost** alias (`<state>` itself).
- [ ] **19.** *(Round 15 — Table W row **W10**.)* **The manifest survives a sweep
      that preserved something.** Drive a full `wienerdog uninstall` whose live
      `disposeCoreMechanics` returns a **non-empty `preservedQuarantine`** — use
      Table X row **X3**'s window, the fixture criterion 9 already builds — and
      assert that **`install-manifest.json` and `config.yaml` are both still
      present** with unchanged bytes, that **nothing was deleted after the sweep**,
      that the run's message names what was preserved and says re-running is safe,
      and that **re-running it then completes** once the shelf is cleared.
      **Conversely**, on an ordinary install where `preservedQuarantine` is empty,
      the manifest is deleted exactly as at `5b77865f` — so the criterion measures
      the **boundary**, not one side of it.
      **Round 20 adds the REPLAY-GUARD arm, a different family from every arm above
      it** (Table X row **X22**): make a shelf resolution fail with a **transient
      `EIO` that occurs ONLY during the live replay** and succeeds on every later
      read, so `reverse()` skips the `app` and hook entries while the subsequent
      inventory finds the shelves **empty** and the disposer reports **no**
      preservation. Assert that **`install-manifest.json` and `config.yaml` both
      survive** — the stop comes from `shelfGuarded` alone, which is the point —
      that the skipped entries are named, and that **re-running the whole command
      then completes and removes them**. **And the set-level arm:** with the
      protected set unconstructable at `reverse()`'s guard initialisation, the
      live run **aborts before any mutation**, naming the directory and its `code`,
      with the manifest, `config.yaml` and every recorded artifact still present;
      **`--dry-run` against the same failure does not abort and reports it.**
- [ ] **20.** The declared RED proofs of Table B are `PROVEN` in an **UNFILTERED**
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

# Table V is still the complete set of recursive deleters (Table X rows X16/X18).
# EVERY hit must be accounted for in Table V. At 5b77865f there are three
# (reverseVendoredTree, reverseCopiedSkill, the mechanics sweep); this package adds
# step 2's per-child delete, so four are expected after implementation. A hit that
# Table V does not name means the table is stale — update it in the same PR.
test -f src/core/manifest.js && grep -n 'recursive: true' src/core/manifest.js

# The declared RED proofs (criterion 20) — UNFILTERED.
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
  must stay byte-unchanged. **Note that `reverse()` is no longer wholly untouched
  by this package** (Table X row **X16**); W7 states precisely which lines are
  added and why no D-row moves.
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
   **Round 5 (Astra) held X12** (raw at `59064c78`) and returned one further
   band-A HEAVY finding, against this spec's own Implementation notes rather than
   its tables: a blanket *"`disposeCoreMechanics` must never throw"* would swallow
   an `EPERM` removing `secrets/`, strand a live credential, and then let the
   manifest be deleted so the retry could not run. Accepted in full and applied as
   **X13**, which scopes the no-throw promise to the shelf levels and the
   pre-existing empty-core step, with Table Y row **Y10**, acceptance criterion
   **16** and RED proof `quse-mechanics-failure-swallowed`.
   **Round 6 (Astra) held X13** (raw at `7cfecf2a`) and returned one band-B
   finding, weighted **HEAVY** because the user-visible count changes: **X1**
   pushed every successful `rmdir` onto the public `removed` array, so an install
   with two **empty** shelf directories reported three paths where the baseline
   reports one — changing both the *"Removed N item(s)"* line and the `--dry-run`
   plan, and contradicting **W6** and acceptance criterion 7. Accepted in full:
   the `rmdir` bookkeeping is now internal and **Table X row X4** fixes `removed`
   at its original mechanics-directory granularity, with acceptance criterion 7
   gaining the both-shelves-present-but-empty fixture and comparing the count line
   and the dry-run plan in full.
   **Round 7 (Astra) held X4** (raw at `86123c72`) and returned one band-B
   finding, weighted **HEAVY** because it changes what the implementer builds for
   `--dry-run` and the pre-confirm plan: **X4** reports `<state>` removed only
   after a successful `rmdir`/`unlink`, while **X1**/**X2**/**K7** forbid the
   disposer any emptiness test — and in dry-run those syscalls cannot run, so the
   algorithm could not tell an empty shelf from a populated one as **W5**
   requires. Accepted in full and applied as **X15**: the `dryRun: true` arm is a
   **read-only planner** over the same `quarantineInventory`, explicitly exempt
   from the no-emptiness-test rule (which is about the **live** deleter), with
   `removed` defined as **predicted** removals at X4's unchanged granularity, the
   live arm untouched, acceptance criterion **17** (three shelf states, on both
   surfaces, plus zero mutating `fs` calls through the seam), RED proof
   `quse-dry-run-plans-by-assuming`, and the named residual
   `R-dry-run-prediction-drift`.
   **Round 8 (Astra) held X15** (raw at `648f225a`) and returned one band-A
   HEAVY finding: **Table Y row Y6 promised immunity to forged manifest entries
   while this spec left `reverse()` unchanged**, and the shipped `file` handler
   deletes a **hash-less** `{kind:'file'}` naming a shelf path — probed in memory,
   the entry validates and invokes `rmSync`. Accepted in full and applied as
   **X16**, a pre-dispatch shelf guard in `reverse()` covering every kind,
   literal and resolved paths, and the unanswerable case; **Y6** rewritten to
   name the guard as what closes it rather than "the shelf is not in the
   manifest"; **W7** rewritten to state exactly which lines are added and to
   establish that no D-row moves and that the two packages' deletion targets are
   disjoint by construction; acceptance criterion **18** and RED proof
   `quse-reverse-shelf-guard-dropped`.
   **Round 9 (Astra) held X16's placement** (raw at `4bd3ea58`) and returned one
   further band-A HEAVY finding — **the same family one level up**: the guard
   covered targets at or below a shelf but not a **recursive deletion of a shelf
   ANCESTOR**. With `<core>/app` symlinked to `<core>/state`, a forged
   `{kind:'vendored-tree', path:'<core>/state'}` satisfies `reverseVendoredTree`'s
   only ownership test, targets neither shelf subtree, and its recursive `rmSync`
   takes both. Accepted in full: **X16** is now **symmetric** — *no
   manifest-driven deletion may cover a shelf path from below or from above* —
   with new canonical **Table V** enumerating, from the shipped code, exactly
   which reversers delete recursively (`vendored-tree`, `copied-skill`) and why
   `dir` is deliberately excluded; acceptance criterion **18** gains the
   from-above arm and a `{kind:'dir'}` negative control; and a second RED proof,
   `quse-reverse-guard-from-below-only`, isolates the half round 9 added.
   **Round 10 (Astra) held Table V and the symmetric X16** (raw at `878c50bf`)
   and returned one further band-A HEAVY finding: **X16** preserved an entry
   whenever a shelf resolution *failed*, with **no exemption for
   `ENOENT`/`ENOTDIR`** — but the shelves are created lazily, so on an install
   that never quarantined anything **absence is the ordinary case**, and the
   guard turned every ordinary app-tree removal into a skip, after which
   `uninstall.js` deleted the manifest and left the skipped component with no
   retry ledger. Accepted in full and applied as **X17**, one resolution rule for
   this package modelled on the scheduler package's **D15**: lexical anchors are
   always retained, resolved anchors are derived through the nearest validated
   existing ancestor, `ENOENT`/`ENOTDIR` is **absence** and skips nothing, every
   other code is **unanswerable** and preserves, and the two must stay
   distinguishable. Acceptance criterion **18** gains three absence arms and RED
   proof `quse-absent-shelf-read-as-unanswerable` was added.
   **Round 11 (Astra) held X17** (raw at `fe6ab693`) and returned one further
   band-A HEAVY finding, and it was **X16's rule applied to a site this spec had
   exempted**: with `<state>/quarantine` symlinked to `<state>/cache`, **X1** step
   2 recursively deletes `cache` — a non-shelf sibling *by name* — before step 3
   preserves the link, and because `quarantinePreserve` writes **through** the
   alias the sole original goes with it, while the dangling link is reported as
   *preserved*. Accepted in full and applied as **X18**, which adds no rule: the
   protected shelf **targets** are computed **before any recursive deletion**, and
   **every** recursive deletion in the disposer — step 2's per-child removal and
   the `logs`/`schedules`/`secrets` sweep at `:1148` — is gated by **X16**'s
   symmetric check over **X17**'s anchors. **Table V was amended**: `:1148` is
   governed by X16 via X1/X18, **not exempt**. Acceptance criteria **1** and **9**
   gain alias arms and share the RED proof `quse-step2-deletes-through-alias`.
   **Round 12 (Astra) held X18** (raw at `7cbd4a27`) and returned one further
   band-A HEAVY finding, against **the last site still outside X16 — step 0**:
   the symlinked-`<state>` unlink ran **before** the protected targets were
   computed, so with `<core>/state` → `<core>/logs` and an original at
   `logs/quarantine/…` the alias was removed, the anchors then resolved under an
   absent `<state>`, and **X18** permitted the recursive delete of `logs`.
   **Computing the targets earlier is not sufficient on its own**, because
   `uninstall.js` calls the disposer **again** at `:467`, by which time the alias
   is gone. Accepted in full as **X19**: the order now begins with the targets
   (**0a** → **0b** → **2** → **3**), and a `<state>` symlink whose target
   overlaps a protected shelf is **retained and reported** rather than unlinked,
   so the protection stays discoverable across both sweeps and across a retry;
   a `<state>` symlink covering no shelf is unlinked exactly as at `5b77865f`.
   Acceptance criteria **1** and **14** gain the arm, asserted across **both** live
   disposer calls, with RED proof `quse-state-alias-unlinked`.

   **Round 13 (Astra) held X20's predecessor** and added item (7) to the
   enumeration; **round 14 (Astra) held X20** (raw at `e33c9666`) and returned a
   **definition gap rather than a new site**: **X18** checked deletion targets
   against the two shelf **anchors** but not against the **locations** of
   intermediate links on the chain, so `<state>/quarantine` →
   `<state>/cache/link` → `<core>/logs/recovery` left `<state>/cache` recursively
   deletable and the **second** sweep, rebuilding anchors through the now-dangling
   shelf, destroyed the original. Accepted in full and fixed **once, as a
   definition**, in **X17 (1a)**: the **protected SET is the closure of each
   shelf's resolution chain** — every link's own **location**, every intermediate
   target and the final resolved target, walked component by component — and
   **X16**, **X18**, **X19** and **X20** all test against that set.

   **AND THE FAMILY IS NOW BOUNDED (round 14).** Four consecutive rounds each
   produced one more alias shape, and `docs/runbooks/codex-review.md`'s rule is
   that the loop converges **by freezing surface, not by patience**. **Table X row
   X21** states the threat model — links inside the resolved chain closure as
   computed at protected-set time — and names the residual
   **`R-alias-outside-closure`** for everything else, with its reason (same-user
   `0700` files; closing it needs a filesystem transaction no platform offers and
   a resident process ADR-0004 forbids) and its overrule path (**owner item 4**:
   refuse whenever any symlink exists under `<core>`, at the cost of making an
   ordinary symlinked-vault install un-uninstallable). **After this round, a
   further alias finding that falls inside the residual's definition is CLOSED BY
   CITING THE RESIDUAL, not by a fifteenth revision of the deletion contracts.**

   **Round 15 (Astra) held X21's residual** — nothing was reported inside it —
   **and returned one band-A HEAVY finding in the opposite direction**: round 14's
   single-class closure **OVER-protected**. On the supported layout `<core>` →
   `/data/wienerdog` it put that node in the protected set, after which **X18**
   preserved every target beneath it — `app`, `logs`, **`secrets`** — **with both
   shelves absent**, while `uninstall.js:424` deleted the manifest anyway,
   **stranding credentials with no retry**. Accepted in full and fixed as a
   **two-class definition** in **X17 (1a)**: **class (i) shelf subtrees** protect
   the node **and its descendants**; **class (ii) chain nodes** protect the node
   **and its ancestors** but **not their unrelated descendants**. Verified against
   rounds 11–14's cases so the split regresses none of them. The round also
   surfaced that `:424`'s manifest delete is **not** governed by **W3**'s pre-plan
   refusal, which is now **Table W row W10**: the run stops before the manifest
   delete whenever the live sweep preserved anything. Acceptance criteria **2** and
   **19**, and RED proofs `quse-chain-node-over-protects` and
   `quse-manifest-deleted-after-preserve`.

   **Round 16 (Astra) held the two-class rule and reported nothing inside the
   residual**, returning two band-B findings weighted **HEAVY** (raw at
   `905d8ac3`), both accepted in full. **(1)** **W10** checked only the **first**
   live sweep, so a dream recreating the shelf between `:408` and `:424` — through
   `quarantinePreserve`'s recursive `mkdirSync` — lost the retry ledger while the
   `:467` sweep preserved the new copy. W10's check now sits **immediately before
   `:424`** and consults **every** sweep's `preservedQuarantine` **plus a fresh
   `quarantineInventory` read**; the `:467` call cannot move earlier because its
   only remaining job is removing the now-empty core, which the manifest and
   config must be gone for (`:463-466`), and the row says so. The irreducible
   two-statement window and the after-the-last-sweep case are **named** in new
   Table W row **W11** as `R-post-ledger-preserve` and `R-post-uninstall-preserve`
   — **both leftovers, neither a loss** — which is why W8 must name the preserved
   directory literally. **(2)** **X17** and **X19** contradicted each other on a
   symlinked `<state>` with **no** shelf: hypothetical anchors made the alias look
   like it contained a shelf, the unlink branch became unreachable, and the
   uninstall stopped forever with nothing to clear. **X17 (1a)** now distinguishes
   **HYPOTHETICAL** anchors (class (ii) semantics only, never triggering X19's
   retention) from **EXISTING** chains, and acceptance criterion 14 asserts the
   command **completes** on that layout. A shelf created after such an unlink is
   still protected — `mkdirSync(…, {recursive:true})` recreates the path and the
   next sweep's freshly computed set finds it — so it is **not** residual
   territory, and the row says how that was established.

   **Round 17 (Astra) held W10/W11 and reported nothing inside the three
   residuals**, returning one band-A HEAVY finding: **round 16's fix went one notch
   too far** (raw at `dd500826`). Giving **hypothetical** shelf anchors class (ii)
   semantics excluded their descendants, so on a **stable** `<core>` →
   `/data/wienerdog` with absent shelves a pre-existing hash-less `{kind:'file'}`
   entry naming the **physical** path `/data/wienerdog/state/quarantine/…`
   bypassed the lexical anchors **and** the hypothetical resolved ones, and a
   preserve completing after **X16** computed its anchors was destroyed by
   `reverse()`. **No alias is created or redirected after computation, so
   `R-alias-outside-closure` did not cover it** — a rule defect, not residual
   territory. Accepted in full: **a hypothetical shelf ROOT keeps full class (i)
   SUBTREE protection in every deletion guard (X16/X18/X20)**, and **the ONLY
   thing conditioned on an EXISTING shelf is X19's alias-retention decision**.
   Round 15's finding stays closed (`secrets`/`logs`/`app` sit outside the
   hypothetical root, so they are still removed) and **acceptance criterion 14 was
   re-checked and holds unchanged**. Criterion **18(b)** gains the stable
   symlinked-core, physical-path arm, with RED proof
   `quse-hypothetical-root-not-subtree`.

   **Round 18 (Astra)** returned one band-A HEAVY finding and one band-C LIGHT
   one (raw at `b80dbb46`), both accepted in full. **HEAVY:** with a
   **pre-existing** `<state>` → `<core>/logs` alias and **absent** shelves, **X19**
   permitted the unlink; a dream completing `logs/quarantine/note` **after the
   absence decision and before the unlink** was preserved on the first run, but on
   the **retry** `<state>` was gone, the inventory missed the copy, the recomputed
   anchors no longer protected `logs`, and its recursive deletion destroyed the
   original. **X19 gains clause (b):** a `<state>` alias is retained when its
   resolved target lies **inside any directory this uninstall sweeps** — the set is
   enumerated in the row — and only an alias **outside every swept directory** with
   no existing chain is unlinked, which is safe **by construction** because nothing
   this command sweeps lives there — **that formulation was SUPERSEDED one round
   later: round 19 replaced the swept-directory enumeration with overlap against
   `withinAllowedRoot`'s roots, and Table X row X19 is the current rule.** A blanket
   "never unlink an absent-shelf alias" was refused because it re-opens round 16's
   contradiction and criterion 14.
   **LIGHT:** **X17 (1a)**'s concluding sentence still carried round 16's withdrawn
   *"class (ii) only"* clause, contradicting the round-17 rule **in the same cell** —
   the intra-cell drift `docs/runbooks/spec-authoring.md` names; replaced, with
   existence now stated to matter to **X19 alone**, and criterion 18(b) re-verified
   against the single definition.

   **Round 19 (Astra)** reported nothing inside the residuals and returned one
   band-A HEAVY finding (raw at `e6503c6e`): **X19 clause (b) tested only one
   direction.** With `<state>` → `~/.claude` — an allowed root **outside `<core>`**
   and an **ANCESTOR** of a replay target — a hash-less `{kind:'file'}` entry for
   `~/.claude/quarantine/2026-09-18-note.md` left the alias unlinkable; a copy
   completing before the unlink, then a `secrets` `EPERM` retaining the manifest
   under **X13**, then a retry, and the `file` entry deleted the original.
   Accepted in full, and closed as a **closure move rather than a third
   enumeration**: clause (b) now retains whenever the alias target **OVERLAPS —
   equals, contains or is contained by — ANY of `withinAllowedRoot`'s roots**
   (`manifest.js:742`), **because that gate covers every mutating replay kind, so
   every deletion this command can perform lies under one of those four roots by
   construction**. The round-18 swept-directory list is kept **only as the
   derivation** and is no longer the test. Acceptance criterion **9** gains the
   ancestor arm with its injected mechanics failure and full retry; **criterion
   14**'s fixture must be disjoint from all four roots. RED proof
   `quse-alias-ancestor-of-target-unlinked`.

   **Round 20 (Astra)** held **X19 (b)**, reported nothing inside the residuals,
   and returned one band-A HEAVY finding in **a different family — the retry
   ledger rather than the deletion surface** (raw at `8be6ce17`). **X16**/**X17**
   have `reverse()` **skip** an entry when a shelf resolution is unanswerable,
   recording it only in `skipped`, while **W10** consulted just the disposer's
   preservation and a fresh inventory: a **transient `EIO`** during live replay
   skips `app` and hook entries, later reads succeed and find the shelves empty,
   and the manifest is deleted — leaving those components with the retry refusing
   *"no install manifest found"*. **No alias change and no late file is involved,
   so no named residual covered it.** Accepted in full as **X22**, shaped on the
   rule this package already uses for the disposer (**K4**, and the scheduler
   package's **D9**): an **unanswerable protected set at `reverse()`'s guard
   initialisation ABORTS the live replay before any mutation** — same shape and
   message as the disposer's unreadable case, manifest and config untouched,
   `--dry-run` reporting instead — while a **per-entry** unanswerable containment
   is still **preserved and reported** *and* now **propagates into W10** through a
   new `shelfGuarded` return field. **W10 consults three inputs.** The
   deliberate asymmetry is recorded in the row: aborting on the per-entry case
   would make a damaged tree un-uninstallable, which is the failure owner item 4
   is declined for. Acceptance criterion **19** gains both arms; RED proof
   `quse-shelf-guard-skip-not-propagated`.

   **CONVERGENCE NOTE — THE DELETION SURFACE IS CLOSED (round 12). Twelve rounds
   in, the package's mutating operations are **enumerated**, and the list is the
   contract rather than a summary: **(1)** step 0b's `unlinkSync` of a `<state>`
   symlink; **(2)** step 2's per-child recursive `fs.rmSync` over `<state>`'s
   non-shelf children; **(3)** step 3's non-recursive `rmdirSync` climb over the
   validated prefix; **(4)** the `mechanics` loop's recursive `fs.rmSync` at
   `manifest.js:1148` over `logs`/`schedules`/`secrets`; **(5)** the two Table **V**
   recursive replay kinds, `vendored-tree` and `copied-skill`; **(6)** the core
   removal at `:1151-1170`, which is pre-existing, non-recursive and unchanged; and
   — **added at round 13, by the rule this note reserved** — **(7)** `reverse()`'s
   **`symlink`** reverser's `unlinkSync` (`:314`). **Every one of (1)–(5) and (7)
   is gated by Table X row X16's symmetric containment check over Table X row
   X17's anchors. No site is exempt, and no table lists one.** **Items (1) and (7)
   are governed by one sentence — *no operation of this uninstall removes a link on
   the resolution chain of a protected shelf* (Table X rows X19 and X20)** — because
   deleting **reachability** is as destructive as deleting **bytes**, one step later.
   The `dir` kind remains the single exemption and it is a **provable** one: its
   reverser removes only a virtually-empty directory and can remove neither a file
   nor a link. Resolution
   semantics are uniform across **X11**, **X12**, **X16** and **X19** under
   **X17** — the shape the scheduler package reached with **D15** after the same
   recurring family. **A further alias finding is closed by adding the site to that
   enumeration, never by writing a new rule**, and an implementer who finds a
   mutating operation not on the list has found a spec bug and should say so.
   **One confirming round remains**; the gate closes on a clean or LIGHT-only
   return (`docs/runbooks/codex-review.md`, "Weighted closure"). **A review gate is not owner approval:**
   nothing in this repository records the owner approving, accepting, ratifying
   or signing this package, and the ADR-0019 amendment it drafts carries
   **"owner signature pending"**. (b) **Owner items 1, 2, 3 and 4 remain OPEN**,
   travelling with this package as recommendations in the standing form; the
   owner reverses any of them by dated amendment, applied by a committed
   revision. (c) **`WP-scheduler-replay-manifest-independent` and
   `WP-quarantine-only-copy-shelf` land first** (`depends_on`): the first
   rewrites both of this package's source files and the second owns the
   neighbouring clause in both of its documentation files.
