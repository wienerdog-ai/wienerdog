---
id: WP-uninstall-shelf-deletion-guards
title: Make every uninstall deletion — the disposer's sweeps and the manifest replay — unable to reach the secret quarantine
status: In-Review
model: opus
size: M
depends_on: [WP-adr-0019-quarantine-uninstall-gate]
adrs: [ADR-0004, ADR-0019, ADR-0027, ADR-0031, ADR-0034, ADR-0035, ADR-0038, ADR-0041, ADR-0042]
epic: secret-lifecycle
---

# WP-uninstall-shelf-deletion-guards: no deletion this uninstall performs can reach the shelf

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **PACKAGE B OF TWO, split on 2026-09-18 after the design gate closed at round 22.**
> The gate ran on one document, `docs/specs/WP-adr-0019-quarantine-uninstall-export.md`,
> now `Superseded`. **Package A** — `docs/specs/WP-adr-0019-quarantine-uninstall-gate.md`,
> in `depends_on` — ships the inventory, the refusal, the ADR-0019 amendment and the
> documentation. **This package is the DELETION SIDE:** the carve-out in
> `disposeCoreMechanics`, the shelf guard in `reverse()`, and the ledger-integrity
> rules that keep a preserving run retryable.
>
> **Row ids are unchanged across the split**, so every disposition from the 22 rounds
> still resolves. This package **cannot be subdivided further without shipping a
> measured defect**: rounds 11–21 each found a path that the *previous* round's
> partial rule left open, so any cut inside **X10**–**X22** ships one of them
> knowingly. That is stated as a constraint, not a preference.
>
> **What this package closes that A cannot:** Table X row **X3**'s concurrent-dream
> window — A's gate runs once, before the plan, and a preserve completing after it
> meets the shipped, unguarded deleter. Everything from row **X1** down exists
> because a review round measured a way for a deletion to reach the shelf anyway.
>
> Every code citation is pinned to **`5b77865f`** and was read construct by
> construct at that commit.

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

## Context (read this, nothing else)

**IRON RULE (ADR-0004): Wienerdog is just files.** Nothing here starts a process,
opens a socket or outlives its invocation. What it adds is a set of containment checks
and a deletion that stops happening.

`wienerdog uninstall` reaches the user's quarantined text through **two** deleters, and
this package governs both. **`disposeCoreMechanics`** (`src/core/manifest.js:1133`)
removes `state/`, `logs/`, `schedules/` and `secrets/` recursively and then the emptied
core; on `5b77865f` it takes the whole of `state/`, shelves included. **`reverse()`**
(`:717`) replays the install manifest, and its `file` handler applies prove-before-delete
**only when the entry carries a hash** (`:894`), so a hash-less entry naming a shelf
path reaches `fs.rmSync` (`:899`). **Package A's gate does not stop either of them** —
it runs once, before the plan, and anything arriving after it meets an unguarded
deleter.

**`WP-adr-0019-quarantine-uninstall-gate` (package A) must land first.** It ships
`quarantineInventory` — which every rule here uses to locate and classify the shelves —
the pre-plan refusal, the ADR-0019 amendment that authorises a carve-out at all, and the
two user-facing sentences. **This package neither restates nor re-decides any of that**;
it cites Table **K** and rows **W1**–**W7**/**W9** of that spec, whose ids are unchanged
across the split.

**Three neighbouring decisions govern the shape of the answer.** **ADR-0038**
(owner-signed 2026-08-03): a field the reverser reads may make uninstall delete
**less**, never more — every rule here only narrows. **ADR-0035** (owner-signed
2026-07-26): the attended CLI invocation is the trust surface, and no mechanism may
treat a same-user write as a bounded, data-shaped event — which is why **X21**'s
residual is accepted rather than guarded. **ADR-0041** (owner-signed 2026-08-31) and
`WP-scheduler-replay-manifest-independent` own the surrounding uninstall plan;
package A's row **W7** names every line of theirs that must stay byte-unchanged, and
that constraint binds this package too.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/manifest.js | the carve-out inside `disposeCoreMechanics` and its `preservedQuarantine` return field (**X1**/**X2**/**X4**); `lstat` classification (**X10**) in the top-down-then-bottom-up order of **X11**; the ASCII fold at the deleters (**X12**, whose inventory half is package A's Table K row **K8**); non-shelf deletion failures still propagating (**X13**); the `dryRun: true` read-only planner (**X15**); the single resolution rule and the two-class protected SET (**X17**, including **(1a)**'s chain closure); the protected set computed **before any mutation** and every recursive deletion gated on it (**X18**, Table **V**); the `<state>`-alias retention rule (**X19**); the resolution-chain rule for `reverse()`'s `symlink` kind (**X20**); the pre-dispatch shelf guard in `reverse()` (**X16**, all three clauses) with its `shelfGuarded` return field and the guard-initialisation abort (**X22**); and that function's doc comment (**X9**). **`quarantineInventory` is package A's and is not re-implemented here.** `contains`, `withinSchedulerRoot`, `withinAllowedRoot`, `validateEntry`, `isDir` and **every reverser body inside `reverse()`** stay byte-unchanged — `reverse()` itself is edited **only** in its pre-dispatch region |
| modify | src/cli/uninstall.js | render the preserved-quarantine arm of the closing summary (**W8**); stop immediately before the manifest delete when any sweep preserved something, a fresh `quarantineInventory` read reports anything, or `reverse()` returned a still-OUTSTANDING `shelfGuarded` entry (**W10**, **X22**); the `--dry-run` planner's half of package A's **W5**. Package A's refusal, its inventory call site, `requireDeletionClearance`, the byte-exact manifest compare and everything `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged |
| modify | tests/unit/manifest.test.js | the carve-out's `rmdirSync` climb and its `ENOTEMPTY` preservation (**X1**), the return field (**X4**), the deleter's enumeration-failure arm, the **interleaving** tests including their **alias** arms (**X3**/**X18**), the symlinked-`state` and symlinked-`quarantine` regressions (**X10**/**X11**/**X19**), the sweep-side case-fold arms (**X12**), the propagation boundary (**X13**), the read-only dry-run planner (**X15**), the forged-manifest-entry interleavings from below **and** from above with the `{kind:'dir'}` negative control (**X16**/**X20**, Table **V**), the two-hop and ancestor alias arms (**X17 (1a)**/**X19**), and the Table Y rows that are unit-observable |
| modify | tests/unit/uninstall.test.js | the manifest-survives-a-preserving-sweep test and its replay-guard, set-level-abort and remedy-terminates arms (**W10**/**W11**/**X22**), and the preserved-quarantine summary arm (**W8**) |
| create | tests/red-proofs/uninstall-shelf-deletion-guards.proofs.json | the declared RED proofs of Table B (ADR-0042) |
| modify | tests/red-proofs/adr-0019-quarantine-uninstall-gate.proofs.json | drop the `[QU-3]` entry from the `expectRed` arrays of `quse-refusal-not-raised` and `quse-yes-skips-the-refusal`, and nothing else — the change must land in the SAME COMMIT as the carve-out, because on the tree before it `[QU-3]` still reddens. Added by the PR-gate round 1 ruling at the end of Contract reference |

### Exact contracts

```js
// src/core/manifest.js — CHANGED return shape and CHANGED state/ disposal.
/** Disposal of `paths.state` follows Table X row X1 and takes NO inventory on the
 *  LIVE arm. EVERY path it classifies is classified with `fs.lstatSync`, never
 *  `statSync` and never the `isDir` helper (X10): a SYMLINKED `paths.state` is
 *  unlinked only when X19 permits it and is NEVER descended, and a shelf root that
 *  is not a real directory is preserved untouched. Because `lstat` classifies only
 *  a path's FINAL component, the shelf levels are VALIDATED top-down before any
 *  descendant is accessed, and only the validated prefix is then removed bottom-up
 *  (X11). The shelf directories are identified by ASCII CASE FOLD (X12; the
 *  inventory half is package A's Table K row K8). The no-throw handling is SCOPED
 *  to the shelf levels and to the pre-existing empty-core step (X13): a failure
 *  enumerating `paths.state`, or removing any non-shelf child, `logs/`,
 *  `schedules/` or `secrets/`, still PROPAGATES exactly as before, so
 *  `uninstall.js` never reaches its manifest and config deletes and the install
 *  stays retryable.
 *
 *  `dryRun: true` is a READ-ONLY PLANNER (X15), not a disposal with the writes
 *  removed: it runs package A's `quarantineInventory` — same fold, same top-down
 *  validation — performs NO mutating filesystem call at all, and returns `removed`
 *  as PREDICTED removals at the same granularity. The live arm stays snapshot-free.
 *  @returns {{removed: string[], skippedForVault: string[],
 *             preservedQuarantine: string[]}} `removed` KEEPS ITS ORIGINAL
 *  MECHANICS-DIRECTORY GRANULARITY (X4): `paths.state` appears at most once and
 *  only when the whole of <state> is gone; the intermediate rmdirs of `quarantine`
 *  and `redacted` are internal and never appear; and when any shelf level was
 *  preserved `paths.state` does not appear at all. The caller sums
 *  `removed.length` and renders it, so this granularity is what keeps an
 *  empty-shelf uninstall byte-identical to before. The third field lists the
 *  directories this call left in place, in the shape the caller already uses for
 *  `skippedForVault`. The carve-out takes NO option and no caller can disable it
 *  (X2). */
function disposeCoreMechanics(paths, { dryRun = false, vaultPath = null } = {})

// src/core/manifest.js — CHANGED return shape.
/** `reverse()` additionally returns `shelfGuarded: string[]` — the entries its
 *  pre-dispatch shelf guard skipped (X16, X22). `skipped` keeps its contents and
 *  its rendering; `shelfGuarded` is a strict subset of it, exposed separately
 *  because Table W row W10 must distinguish a shelf-guard skip from an ordinary
 *  one. Empty on an ordinary install. An UNANSWERABLE protected set at guard
 *  initialisation ABORTS the live replay before any mutation (X22). */
function reverse(paths, manifest, opts)
```

## Contract reference

**Activation trigger (ADR-0031's 2-of-7 test) — six of seven fire.** (i) two return
**shapes** change; (ii) a **result taxonomy** — the protected set's two classes and the
hypothetical/existing distinction; (iv) **error, precedence and abort** behaviour is new
throughout; (v) an **authority boundary** — the dream gate writes the copies, two
different deleters own their lifecycle; (vi) **downstream consumers** — every future
deleter inherits **X16**/**X17**; (vii) the same facts appear in the Deliverables notes,
the acceptance criteria, the verification greps and the operative prose.

**NAMESPACE WARNING.** This spec's canonical tables are **X**, **V**, **B**, and rows
**W8**/**W10**/**W11** and **Y6**/**Y9**/**Y10**. **Table K and rows W1–W7/W9 and
Y1–Y5/Y7/Y8 are canonical in `WP-adr-0019-quarantine-uninstall-gate`** and are cited,
never restated. Citations to other documents are always package-qualified:
`WP-secret-fence-ep2-redact-arm`'s **Table Q**/**Table N**;
`WP-quarantine-only-copy-shelf`'s **Table O**;
`WP-scheduler-replay-manifest-independent`'s **Tables D**, **R** and **S**.

### Table X — the deletion-side contracts (canonical)

*Two deleters reach the shelf and both are governed here: the carve-out in
`disposeCoreMechanics` (rows **X1**–**X15**) and the shelf guard in `reverse()` (rows
**X16**, **X20**, **X22**). A contract that governed only the first would be a
protection with a documented way around it. **Row X14 does not exist** — the numbering
is the unsplit document's and is preserved so the 22 rounds of dispositions resolve.*

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
| **X9** | **The doc comment is corrected in the same edit** | `disposeCoreMechanics`'s JSDoc runs `manifest.js:1110-1132`, and the sentence spanning **`:1112-1116`** asserts *"none user-authored"* of `state/`. That sentence is false on this tree and is the shipped form of the invariant owner item 1's amendment narrows. It is corrected to name the shelves as the one exception, to point at ADR-0019's amendment, and to state **X1**'s no-recursive-delete rule where the next reader of that function will meet it. The `@returns` clause at `:1132-1133`'s neighbourhood also gains `preservedQuarantine`. **A comment that contradicts the amended ADR is the drift the repo's errata practice exists to catch** — and it is a comment, not a claim in a table, so it is fixed here rather than carried as a mirror |
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
| **X22** | **AN UNANSWERABLE PROTECTED SET ABORTS THE LIVE REPLAY; A PER-ENTRY UNANSWERABLE SKIP REACHES W10 — the retry ledger is the thing being protected** | *Design gate round 20, a different family from rounds 11–19: not what gets deleted, but whether the user can finish afterwards. Shaped on the rule this package already uses for the disposer — Table K row **K4** and `WP-scheduler-replay-manifest-independent`'s Table D row **D9**.* **What round 20 measured:** **X16**/**X17** have `reverse()` **skip** an entry when a shelf resolution is unanswerable, recording it in `skipped` only, while **W10** consulted just the disposer's `preservedQuarantine` and a fresh inventory. A **transient `EIO`** during live replay therefore skips `app` and hook entries; later reads succeed and find the shelves **empty**; the disposer reports no preservation; **W10 permits deleting the manifest** — and the installed components remain with the retry refusing *"no install manifest found"*. **No alias change and no late-arriving file is involved, so none of the three named residuals covers it.** **Two rules, and they are deliberately different because the failures are:** **(1) SET-LEVEL — abort.** If the protected set cannot be constructed at **`reverse()`'s guard initialisation** — any resolution failure other than `ENOENT`/`ENOTDIR` while walking the chains (**X17** outcome 4) — the **live replay ABORTS before any mutation**, in the **same shape and message as the disposer's unreadable case**: a `WienerdogError` naming the directory and its `code`, saying nothing was removed. **The manifest and `config.yaml` are untouched**, so the retry is clean. This is the cheap case to get right: nothing has been deleted yet. **`--dry-run` reports instead of aborting**, exactly as Table K row **K4** and **W5** already specify for the inventory. **(2) PER-ENTRY — preserve, report, and PROPAGATE.** An individual entry whose **own path** fails to resolve for a non-`ENOENT` reason is **preserved and reported as today** — it is one entry, and aborting the whole replay over it would be the over-correction round 15 already paid for. **But it must reach W10**, because a preserved-but-undeleted component is exactly what the retry ledger exists for. `reverse()` therefore returns **`shelfGuarded: string[]`** (**X16**'s scope note), and **Table W row W10 consults THREE inputs**: every sweep's `preservedQuarantine`, a fresh `quarantineInventory` read, **and `shelfGuarded` filtered to OUTSTANDING entries** — round 21 added that filter, because this guard deliberately runs **before** `reverse()`'s already-gone check (`manifest.js:865-869`), so a path the user had already cleared would otherwise block **every** retry. Table W row **W10** owns the rule. **Why not simply abort on the per-entry case too:** an unresolvable path is also the ordinary shape of a broken install, and refusing the whole uninstall over one entry would make a damaged tree un-uninstallable — the failure mode owner item 4 is declined for. Preserving one entry and keeping the ledger is strictly better: nothing is lost, and the user can re-run. **W6 is unaffected:** on an ordinary install the set constructs, `shelfGuarded` is empty, and neither rule fires |

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

### Table W — the rows this package owns (W8, W10, W11)

**Rows W1–W7 and W9 are canonical in `WP-adr-0019-quarantine-uninstall-gate`.** The
three below turn on `preservedQuarantine` and `shelfGuarded`, which this package
introduces, so they could not live there. **W5 and W6 each gain a second half here** —
the read-only planner (**X15**) and the `removed` granularity (**X4**) — and those
halves defer to package A's cells rather than re-deciding them.

| Row | Fact | Value |
|---|---|---|
| **W8** | **The closing summary when the carve-out preserved something** | The live run's three-way branch at `uninstall.js:495-501` gains a fourth arm: *"Kept `<core>` — your quarantined copies are still in it: `<dir>`"*, in the shape the file already uses for the vault and the customized config. **The preserved directory is named LITERALLY, not counted** — Table W row **W11**: on `R-post-ledger-preserve` the manifest is gone and `rm -rf <that path>` is the user's only remaining route, so a count would leave them guessing. It is **rare but reachable, not dead code**: the gate refuses on a non-empty shelf, so this arm is reached through **X3**'s concurrent-dream window, through an UNREADABLE shelf at deleter time (**K4**), or by any caller of `disposeCoreMechanics` other than `run`. It must never print the plain *"fully removed"* line while a shelf survives — **a false "fully removed" is as bad as the deletion**, which is the reason the adjacent `skippedForVault` branch already exists (`:476-483`) |
| **W10** | **THE MANIFEST IS NOT DELETED WHILE ANYTHING IS PRESERVED — the retry ledger outlives the thing it would be needed for** | *Design gate round 15 asked whether `uninstall.js:424`'s unconditional manifest delete is already governed by the refusal of **W2**/**W3**. **It is not**, and this row is the answer rather than a confirmation.* **W3**'s refusal is the **pre-plan gate**, and by `:424` it has already passed — so the manifest delete is reached on every path where `disposeCoreMechanics` preserved something **after** the gate: Table X row **X3**'s concurrent-dream window, an UNANSWERABLE shelf level at deleter time (Table K row **K4**), **X19**'s retained `<state>` alias, and **X18**/**X20**'s preserved chain components. In all of those the shipped code deletes `install-manifest.json` (`:424`) and then `config.yaml`, after which a retry refuses with *"no install manifest found"* (`:285-288`) and the preserved artifact is **stranded with no supported way to finish**. **The rule, tightened at round 16 after it was measured to cover only the FIRST sweep:** the check sits **immediately before `:424`**, two statements from the `rmSync`, and it consults **all three** of: the `preservedQuarantine` of **every** live `disposeCoreMechanics` call made so far, **a fresh `quarantineInventory(paths)` read taken at that moment**, **and `reverse()`'s `shelfGuarded` array, filtered to OUTSTANDING entries** (Table X row **X22**, added at round 20; the filter added at round 21). **THE RULE, in one sentence: W10 blocks on what still exists or cannot be checked, never on what is confirmed gone.** Before blocking on `shelfGuarded`, `lstat` each of its entries **at decision time** and classify with **X17**'s own vocabulary — this is that rule at a third site, not a new one: **`ENOENT`/`ENOTDIR` = confirmed ABSENT ⇒ EXCLUDED** from the block; **any other code = UNANSWERABLE ⇒ retained**, it blocks; **an existing file, directory or symlink ⇒ retained**, it blocks. **Why the filter is needed and why it is scoped to `shelfGuarded` alone — round 21's measurement:** **X16** guards literal shelf paths **before** `reverse()`'s existing already-gone check (`manifest.js:865-869`), and **X17** keeps hypothetical anchors even when the shelves are absent — correctly, since they must still protect a late-arriving file. So after the user does exactly what the refusal asked, clearing acceptance criterion 18's preserved file **without editing the manifest**, that entry's now-nonexistent path is **still** added to `shelfGuarded`, and W10 retained the manifest and refused **on every retry**, with an empty inventory and no disposer preservation. **The prescribed move-or-delete remedy could not resolve it, which makes this the second way this package could have blocked an uninstall forever** — Table K row **K2** was the first. **The other two inputs need no filter and that is not an oversight:** `preservedQuarantine` is computed by the sweep in *this* run, so it names only directories that existed moments earlier, and the fresh inventory read *is* the current state by definition. Only `shelfGuarded` can carry a path that never existed, because the guard deliberately runs before the existence check — because a concurrent dream can recreate the shelf *after* the first sweep returned nothing (`quarantinePreserve`'s `mkdirSync(…, {recursive:true})`, `validate.js:953`, rebuilds `<core>/state/quarantine/` even when `<state>` is gone). **When ANY of the three reports anything — `shelfGuarded` counted only after the outstanding filter** — `uninstall` **stops before `:424`** — the manifest and `config.yaml` are **left in place**, nothing further is deleted, and the run ends with a message naming what was preserved, why, and that re-running is safe. **This is not a new shape:** `uninstall.js:428-432` already ends exactly this way when the manifest delete itself fails — *"uninstall partially completed; left config.yaml and `<core>` in place so a retry stays safe"* — and this row reuses that wording and that exit. **It is the same lesson as Table X row X13**, one step later: preserving the user's text must never cost them the ability to finish. **Why the second sweep at `:467` cannot simply move earlier, stated because round 16 asked:** its **only** remaining job is removing the now-empty core, and the shipped comment says so — *"with the manifest + unmodified config deleted the core is now empty, so this removes it"* (`:463-466`). The core is not empty until the manifest and config are gone, so that call **must** stay after them. What moves is not the call but the **check**: the shelf-capable work (**X1** steps 0–3) is idempotent and already runs in both calls; W10 simply refuses to delete the ledger while **any of its three inputs** — either sweep's `preservedQuarantine`, the fresh read, or `reverse()`'s `shelfGuarded` **after the outstanding filter** — reports anything. **W6 is unaffected:** on an ordinary install `preservedQuarantine` is empty, `shelfGuarded` is empty, the fresh read finds nothing, and `:424` runs exactly as today. **And the remedy always terminates:** every route out of a W10 stop — clearing the shelf, removing a preserved file, repairing a permission — moves at least one input toward empty, and a confirmed-absent path never blocks again |
| **W11** | **TWO NAMED RESIDUALS FOR A COPY THAT ARRIVES LATE — both are LEFTOVERS, neither is a loss** | *Design gate round 16. **W10** narrows the window to two statements; it cannot close it, and this row says so rather than implying otherwise.* **`R-post-ledger-preserve`** — a preserve completing **between W10's check and the `rmSync` at `:424`**. The manifest and `config.yaml` are deleted, the `:467` sweep then **preserves** the new copy under **X1**, and the core is kept — so **nothing is lost**, but `wienerdog uninstall` can no longer be re-run (`:285-288` refuses without a manifest). **Recovery is one `rm -rf` on a path the summary names**, which is exactly why Table W row **W8**'s arm must print the preserved directory **literally** rather than a count. **`R-post-uninstall-preserve`** — a preserve completing **after the last sweep**, once the uninstall has finished. `quarantinePreserve`'s `mkdirSync(…, {recursive:true})` (`validate.js:953`) **recreates the whole path**, so the copy succeeds and sits in a freshly recreated `<core>/state/quarantine/`. Again **a leftover, not a loss**, recovered by one `rm -rf`. **Both require a dream already running**: `uninstall` reverses the scheduler entries before it reaches this point, so no *new* dream can be started by the schedule after the replay. **Why neither is closed:** closing them needs the deletion and the check to be atomic with respect to a concurrent writer — the same filesystem transaction Table X row **X21** already records as unavailable — and ADR-0004 forbids the resident process that could hold a lock. **They sit beside `R-alias-outside-closure` and under the same reasoning**, and like it they are **closed by citation in a later round, not by a further revision.** **What must ship because of them:** W8's summary names the preserved path literally; and the message W10 prints on its own stop says re-running is safe, which is true on that path and is why the two cases are named separately here |

### Table Y — the security rows this package owns (Y6, Y9, Y10)

**Rows Y1–Y5, Y7 and Y8 are canonical in `WP-adr-0019-quarantine-uninstall-gate`.**

| Row | Threat | What holds |
|---|---|---|
| **Y6** | The manifest used to move this decision in either direction | **Corrected at design gate round 8, which falsified the earlier absolute form of this row.** The shelves are not in the manifest and **this package does not put them there** (Table X row **X6**) — but *not being in the manifest was never the same as being safe from it*. A forged hash-less `{kind:'file'}` naming a shelf path passes `validateEntry` and `withinAllowedRoot` and reaches `rmSync` in the shipped `reverse()`, measured in round 8. **What actually closes it is Table X row X16's pre-dispatch shelf guard, in BOTH directions** — it skips and reports any entry of any mutating kind whose literal or resolved target is **at or under** a shelf root, **and** any entry of a recursively-deleting kind (Table **V**) whose target **contains** one, preserving whenever a shelf resolution is **unanswerable** — which by Table X row **X17** means a code **other than** `ENOENT`/`ENOTDIR`, since an absent shelf is answered, not failed. **Round 9 is why the second half exists**: a forged `{kind:'vendored-tree', path:'<core>/state'}` with `<core>/app` symlinked to `<core>/state` targets neither shelf subtree, yet its recursive `rmSync` takes both. With that guard in place: no forged, stripped, stale or hand-edited manifest entry changes what is preserved, whether the run refuses, or what the refusal says. ADR-0038's direction is honored twice over — the deletion only narrows, **and the narrowing does not depend on the untrusted file at all** |
| **Y9** | **The sweep escaping the core through a symlink and deleting files nowhere near it** | *Design gate round 2.* Closed by Table X row **X10**: every classification is `lstat`-based, a symlinked `paths.state` is unlinked without being descended, and a shelf root that is not a real directory is preserved untouched. **This is the one threat this package could have created rather than closed** — `5b77865f` is safe here by accident of using a single recursive `rmSync`, and replacing that with our own enumeration is what put it at risk. The blast radius without X10 is arbitrary: the link target is wherever the user pointed it, and neither the vault guard (`manifest.js:1144`) nor ADR-0041's clearance can see an `fs.rmSync` outside the core |
| **Y10** | **This package's own preservation instinct stranding a CREDENTIAL and destroying the retry path** | *Design gate round 5.* Closed by Table X row **X13**. The package exists to stop a deletion, and the failure mode that creates is to stop the wrong one: a blanket no-throw reading of the disposer swallows an `EPERM` removing `paths.secrets`, leaves the **Google OAuth token** on disk, and then lets `uninstall.js` delete the manifest and `config.yaml` (`:423-462`) so the retry refuses with *"no install manifest found"*. **Preserving the user's own text is the safe direction; preserving a secret is the opposite one**, and ADR-0019's Decision (`:47-50`) already says why `secrets/` must go. The no-throw handling is therefore scoped to the shelf levels and the pre-existing empty-core step, and every other deletion failure propagates as at `5b77865f`, which is the shipped recovery contract |

### Table B — the declared RED proofs (ADR-0042)

One file, `tests/red-proofs/uninstall-shelf-deletion-guards.proofs.json`.
**`expectRed` sets are MEASURED at implementation time, never predicted.** Each anchor
is `grep -Fc` over the named file at `5b77865f`; a count of `1` means a find-string
built around it is unique. **Every anchor below is shown without its leading
indentation**; the declaration's own `find` string must include the line's real
indentation, and the count is the same either way.

**Twenty declarations. Nine carry a pre-measurable anchor and eleven mutate code this
package authors** — the ratio is itself a fact about this package: most of its rules did
not exist before a review round measured the hole they close.

| Proof id | Criterion | File | Mutation | Anchor at `5b77865f` (occurrences) | What it proves |
|---|---|---|---|---|---|
| `quse-carve-out-dropped` | 1, **9** | `src/core/manifest.js` | replace Table X row **X1**'s `rmdirSync` chain with a single recursive `fs.rmSync(paths.state, {recursive:true, force:true})`, restoring the pre-round-1 shape exactly | `if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });` — **1** (the line whose per-dir treatment X1 restructures for `paths.state`) | criteria 1 and 9 each assert a shelf file **survives**, which is the most vacuity-prone shape in the repo's measured catalogue: a file also survives when the fixture never created it, when the sweep ran against a different `paths.state`, when `isDir` short-circuited, and when the function threw before reaching `state/`. Without the declaration nothing separates "the carve-out worked" from "the deletion never ran". **Two `expectRed` entries, each with a ONE-element `test` path** — criterion 9's interleaving test reddens under the same mutation for the same reason, and an **undeclared** `testCodeFailure` throws (`scripts/red-proofs.js`), so it must be declared rather than noted. **MEASURE the red set; never widen `expectRed` to absorb a surprise** |
| `quse-symlinked-state-descended` | **14** | `src/core/manifest.js` | replace Table X row **X1** step 0's `lstat` classification of `paths.state` with the shipped `isDir` helper, restoring the round-2 regression exactly | `if (!isDir(dir)) continue;` — **1** (the shipped `statSync`-based gate the mutation reinstates; `function isDir(p) {` at `:175` is also **1** if a wider find-string is needed) | *Round 2, finding 1.* Criterion 14 asserts that an **external directory's files are unchanged** after an uninstall — a survival assertion over files the run never mentions, which goes green whenever the fixture's symlink was never created, pointed somewhere else, or was never reached. **It is also the only criterion in this package whose failure destroys data outside the core**, so it is the last one that may be left resting on a fixture nobody proved bites |
| `quse-shelf-validated-leaf-first` | **14** | `src/core/manifest.js` | reverse Table X row **X11**'s validation direction — check and remove `redacted` before classifying `quarantine`, restoring the round-3 order exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is X1 step 3's validation pass | *Round 3.* Criterion 14's round-3 arm asserts that an **external empty directory still exists** after a direct sweep. That is the weakest kind of survival assertion in the catalogue — an empty directory has no bytes to compare, so the assertion rests entirely on the fixture having built the symlink correctly and the sweep having actually run. Under the mutation `external/redacted` is removed before the link is ever noticed, which is what Astra reproduced by executing X1 in memory |
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
| `quse-w10-blocks-on-absent-guarded-path` | **19** | `src/cli/uninstall.js` | drop Table W row **W10**'s outstanding filter, so every `shelfGuarded` entry blocks whether or not it still exists — the round-21 defect exactly | `fs.rmSync(paths.manifest, { force: true });` — **1** (the statement W10's check sits immediately before) | *Round 21.* Criterion 19's remedy-terminates arm asserts a **second** run **completes**. **Every other W10 fixture in this package asserts that a run STOPS**, so all of them stay green under this mutation — it only ever makes W10 block more. This is the one declaration guarding the direction in which a protection package fails: **refusing forever**, which for the user is indistinguishable from the product being broken |

**Criterion numbers in the table above are the UNSPLIT document's** and are mapped to
this spec's numbering by the closing section of
`docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-review.md`.
The implementer re-derives each `criterion` field against **this** file's numbering when
writing the JSON, and says so in the PR body.

**Binding:** `scripts/red-proofs.js` refuses any red whose failure `code` is not
`ERR_ASSERTION`, and requires each `expectRed` entry's non-empty `signal` to appear in
the failing assertion message.

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the table
and all its mirrors **in the same commit**, and any new mirror found in review is added
here on the spot. **After rewriting any cell, re-read that cell WHOLE** — five
intra-cell drifts were found during this package's gate, four of them by that re-read
rather than by a reviewer.

- [ ] **Deliverables-table cells** — the `manifest.js` row → **X1**–**X22** and Table
      **V**; the `uninstall.js` row → **W8**/**W10**/**X22**; the two test rows → the
      acceptance criteria; the proofs row → Table B
- [ ] **Acceptance criteria** — 1 asserts **X1**/**X4**/**X18**/**X19** and **X17 (1a)**;
      2 asserts **X1** and **X17 (1a)**'s class split; 3 asserts **W6**/**X4**; 4 asserts
      **X1**/**X3**/**X18** and **W8**; 5 asserts **X10**/**X11**/**X19**/**Y9**;
      6 asserts **X12**; 7 asserts **X13**/**Y10**; 8 asserts **X15**; 9 asserts
      **X16**/**X17**/**X20**/**Y6** and Table **V**; 10 asserts **W10**/**W11**/**X22**;
      11 asserts Table B
- [ ] **Verification commands / greps** — the `preservedQuarantine` grep mirrors **X4**;
      the two `contains` greps mirror **X7**; the `recursive: true` grep mirrors Table
      **V**'s completeness requirement
- [ ] **Current-state description** — item 2 is the measured basis of
      **X1**/**X4**/**X8**/**X9**; item 3 is the basis of **X7**
- [ ] **Security-checklist bullets that restate a contract** — the symlink bullet
      mirrors **X10**/**X11**/**Y9**; the case-fold bullet mirrors **X12**; the
      no-snapshot bullet mirrors **X1**/**X2**/**X3**; the propagation bullet mirrors
      **X13**/**Y10**; the manifest bullet mirrors **X16**/**Y6**; the chain-closure
      bullet mirrors **X17 (1a)**/**X21**; the finish bullet mirrors **W10**
- [ ] **Cross-document mirrors of package A** — every citation of Table **K**, of rows
      **W1**–**W7**/**W9** and of **Y1**–**Y5**/**Y7**/**Y8** defers to
      `WP-adr-0019-quarantine-uninstall-gate` and re-decides nothing

### PR-gate round 1 ruling (PR #312 review, 2026-09-21) — a Deliverables row for the predecessor's declarations

<!-- markdownlint-disable MD038 -->
<!-- The ruling's text is reproduced VERBATIM and its Deliverables-row literal
     nests backticks inside a code span, which MD038 reads as three spans with
     spaces at their edges. The rule is scoped off for this one block rather
     than the text being reworded. -->

This package's W10 stop makes the gate-blinding mutations of
`WP-adr-0019-quarantine-uninstall-gate` exit 1 instead of 0, so that package's
declarations `quse-refusal-not-raised` and `quse-yes-skips-the-refusal` lose
`[QU-3]` from their observed red sets. The Deliverables table gains one row:
`modify | tests/red-proofs/adr-0019-quarantine-uninstall-gate.proofs.json | drop the `[QU-3]` entry from those two `expectRed` arrays and nothing else — the change must land in the same commit as the carve-out, because on the tree before it `[QU-3]` still reddens`.
Architect ruling on a review gate; nothing here records the owner approving
anything.

<!-- markdownlint-enable MD038 -->

## Dispatch precondition — owner items

The item below is a **recommendation with the cost of overruling it, not a direct
ruling**, under the standing process recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`. **Nothing in this
repository records the owner approving, accepting, ratifying or signing it, and this
spec asserts no such acceptance.** **Owner items 1, 2 and 3 belong to
`WP-adr-0019-quarantine-uninstall-gate`** and are open there.

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
- **This package cannot be split further.** Rounds 11–21 of the design gate each found a
  path that the *previous* round's partial rule left open, so any cut inside
  **X10**–**X22** ships one of them knowingly. That is a constraint, not a preference.
- **Do not re-implement `quarantineInventory`.** It is package A's export, and every
  rule here calls it. Two implementations of the fold would drift, which is the whole
  reason **X12** and package A's **K8** are stated as one rule with two homes.
- **Compute the protected SET first, before any mutation at all** (**X1** step 0a). The
  order is protected set → step 0b → step 2 → step 3; computing it after step 2 leaves
  the check with nothing to check, and after step 0b lets the unlink erase the evidence
  it would have been derived from.
- **Do not collapse X11's two passes into one loop.** Validate root→leaf, collect the
  validated prefix, then remove leaf→root over that prefix only. Two short loops,
  opposite directions.
- **Never classify with `isDir`/`statSync` inside this package** — it follows symlinks,
  which is correct for its other callers and catastrophic for an enumeration that then
  deletes. Use `fs.lstatSync`, or the shipped `isSymlink` (`manifest.js:223-229`). **Do
  not change `isDir` itself**: its four call sites at `5b77865f` depend on its meaning.
- **A link is not "harmless because it deletes nothing"** — removing one on a protected
  shelf's resolution chain destroys **reachability**, and the next recursive delete
  destroys the bytes (**X19**, **X20**).
- **Absence is not a failure, and one `catch` is how that gets lost** (**X17**).
- **The shelf guard goes in `reverse()`'s PRE-DISPATCH region**, beside the existing
  global deferred-member guard, not in the `file` handler.
- **Do not add a lock.** The concurrent window is closed by `rmdirSync`'s own atomicity
  and by preserving, not by coordinating (ADR-0004).
- **Re-derive every line number at dispatch.** This spec is pinned to `5b77865f`, and
  three packages land in these files first.
- When uncertain: choose the simpler option and note it in the PR description under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

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

- [x] **Symlinks are never followed — by the INVENTORY or by the SWEEP** (**X10**,
      **Y9**). `isDir` uses `statSync` and follows links, so classifying `paths.state`
      with it would make the child-by-child enumeration delete a symlink target's files.
      And `lstat` alone was not enough (**X11**): it classifies only a path's final
      component, so levels are **validated top-down before any descendant is accessed**
      and only then removed bottom-up.
- [x] **The shelf is recognized by case-folded name on every platform** (**X12**), with
      an ambiguous fold-equal-but-not-byte-equal name **preserved and reported**.
- [x] **No recursive delete can reach the shelf through another pathname** (**X18**), and
      **no operation removes a LINK on the resolution chain of a protected shelf**
      (**X19**, **X20**) — deleting reachability is as destructive as deleting bytes, one
      step later.
- [x] **The protected object is a two-class SET, not two anchors** (**X17 (1a)**): a
      **shelf subtree** protects its descendants; a **chain node** protects only itself
      and its ancestors. **A protection that strands a credential has failed in the other
      direction**, and ADR-0019's Decision (`:47-50`) is explicit that `secrets/` must go.
- [x] **The family is BOUNDED** (**X21**): `R-alias-outside-closure` names what is not
      defended, why it is accepted, and its overrule path (owner item 4).
- [x] **The untrusted manifest cannot reach the shelf through `reverse()`** (**X16**,
      **Y6**) — a pre-dispatch guard skips any entry of any kind whose literal or
      resolved target is shelf-resident, preserving when the containment question is
      UNANSWERABLE.
- [x] **Preserving the user's text never becomes preserving a SECRET** (**X13**,
      **Y10**) and **never costs the user the ability to FINISH** (**W10**, **X22**,
      **W11**).
- [x] **Every stop this package can produce has a remedy that TERMINATES** (**W10**'s
      outstanding filter). A protection that can never be satisfied is a denial of
      service on the user's own machine, not a safeguard.
- [x] **The preservation cannot be switched off by a caller, and does not rest on a
      snapshot** (**X1**, **X2**, **X3**).
- [x] **No process, socket, schedule or telemetry** (ADR-0004).

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
- [ ] **3.** *(Table W row **W6**, Table X row **X4**.)* On an install with no
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
- [ ] **4.** *(Round 1, finding 1 — Table X rows **X1**/**X3**, Table K row
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
- [ ] **5.** *(Round 2, finding 1 — Table X row **X10**, Table Y row **Y9**.)*
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
- [ ] **6.** *(Round 4 — Table X row **X12**, Table K row **K1**.)* **Shelf
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
- [ ] **7.** *(Round 5 — Table X row **X13**.)* **An ordinary mechanics-deletion
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
- [ ] **8.** *(Round 7 — Table X row **X15**.)* **`--dry-run` plans by reading,
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
- [ ] **9.** *(Round 8 — Table X row **X16**, Table Y row **Y6**.)* **A forged
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
- [ ] **10.** *(Round 15 — Table W row **W10**.)* **The manifest survives a sweep
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
      **Round 21 adds the REMEDY-TERMINATES arm, and it is the criterion that keeps
      this package from blocking an uninstall forever** (Table W row **W10**'s
      outstanding filter): take acceptance criterion 18's fixture, let the run stop
      with that file preserved, then **clear the file without editing the
      manifest** — exactly the remedy the refusal prints — and **run the whole
      command again**. The second run **completes**: the manifest is deleted, the
      core is gone, and the now-absent path does **not** block. Assert the
      complementary case in the same test: with the file still present, or with its
      `lstat` made to fail for a non-`ENOENT` reason, the run **still stops** — so
      the filter is measured as a filter, not as a removal.
- [ ] **11.** The declared RED proofs of Table B are `PROVEN` in an **UNFILTERED**
      `npm run red-proofs` run, with no `FILTERED`, `VACUOUS`, `UNCONTROLLED` or
      `FAILED` verdict.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint

# The deleter reports what it preserved (X4).
test -f src/core/manifest.js && grep -n 'preservedQuarantine' src/core/manifest.js

# ...and the replay reports what its guard skipped (X22).
test -f src/core/manifest.js && grep -n 'shelfGuarded' src/core/manifest.js

# contains() is NOT repurposed: it stays the vault guard's helper, byte-unchanged
# (X7). Both must print, exactly as at 5b77865f.
test -f src/core/manifest.js && grep -Fn 'function contains(outer, inner) {' src/core/manifest.js
test -f src/core/manifest.js && grep -Fn 'contains(dir, vaultPath)' src/core/manifest.js

# Table V is still the complete set of recursive deleters (X16/X18). EVERY hit must be
# accounted for in Table V. At 5b77865f there are three (reverseVendoredTree,
# reverseCopiedSkill, the mechanics sweep); this package adds step 2's per-child delete,
# so four are expected after implementation. A hit Table V does not name means the table
# is stale — update it in the same PR.
test -f src/core/manifest.js && grep -n 'recursive: true' src/core/manifest.js

# The declared RED proofs (final criterion) — UNFILTERED.
npm run red-proofs
```

Every positive `grep` targeting a file this package edits is guarded with `test -f`, so
the deliverable-absent case reddens rather than passing on grep's exit 2
(`docs/runbooks/spec-authoring.md`). Observe each new check in all three states —
**absent → red, compliant → green, violating → red** — and paste all of them.

## Out of scope (do NOT do these)

- **Everything package A ships** — `quarantineInventory`, the pre-plan refusal, the
  `--dry-run` shelf block, the ADR-0019 amendment and the two documentation clauses, and
  rows **K1**–**K8**, **W1**–**W7**, **W9**, **Y1**–**Y5**, **Y7**, **Y8**. They are
  `docs/specs/WP-adr-0019-quarantine-uninstall-gate.md`, which this package depends on.
- **Any review, listing, ageing, banner or `doctor` surface for the shelves.**
- **The retention cap and the prune** — `WP-secret-fence-ep2-redact-arm`'s Table N and
  `WP-quarantine-only-copy-shelf`'s Table O.
- **`src/core/dream/validate.js` and `src/core/dream/promote.js`.**
- **Transactional uninstall, `R-failed-unload`, and every row of
  `WP-scheduler-replay-manifest-independent`** — package A's **W7** lists what must stay
  byte-unchanged, and that constraint binds here too. **Note that `reverse()` is not
  wholly untouched by this package** (**X16**, **X22**); **W7** states precisely which
  lines are added and why no D-row moves.
- **Guarding the `dir` reverser** — Table **V** records why it is the single, provable
  exemption.
- **Closing `R-alias-outside-closure`, `R-post-ledger-preserve` or
  `R-post-uninstall-preserve`** — **X21** and **W11** record why each is accepted, and
  owner item 4 carries the only overrule.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(uninstall): guard every deletion against the secret quarantine (WP-uninstall-shelf-deletion-guards)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
6. **DISPATCH PRECONDITION.** (a) **The design gate is CLOSED — 2026-09-18, at
   round 22** (`docs/runbooks/codex-review.md`, "Weighted closure"). **The gate
   ran on the UNSPLIT document**, `docs/specs/WP-adr-0019-quarantine-uninstall-export.md`,
   now `Superseded` by this spec and its sibling; **every contract row in this file
   carries its original id so the 22 rounds of dispositions still resolve**.
   Rounds 1–21 produced **17 band-A/HEAVY findings and 4 LIGHT/band-C ones**, every
   one accepted in full; **round 22 returned `approve` with no findings**. Each
   round's raw and focus were committed **before** adjudication, at: `5084f7c1` (r1), `85041d69` (r2), `a0693065` (r3), `084142ed` (r4), `59064c78` (r5), `7cfecf2a` (r6), `86123c72` (r7), `648f225a` (r8), `4bd3ea58` (r9), `878c50bf` (r10), `fe6ab693` (r11), `7cbd4a27` (r12), `52f8be19` (r13), `e33c9666` (r14), `69f49bb4` (r15), `905d8ac3` (r16), `dd500826` (r17), `b80dbb46` (r18), `e6503c6e` (r19), `8be6ce17` (r20), `c32aaea2` (r21), `4c5fd818` (r22).
   The dispositions table is
   `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-review.md`,
   whose closing section maps every row id to its new home. **A review gate is not
   owner approval:** nothing in this repository records the owner approving,
   accepting, ratifying or signing this package, and the ADR-0019 amendment it
   drafts carries **"owner signature pending"**. (b) **Owner item 4 remains OPEN**, travelling with this package
   as a recommendation in the standing form; the owner reverses it by dated amendment,
   applied by a committed revision. **Owner items 1, 2 and 3 are open on package A.**
   (c) **`WP-adr-0019-quarantine-uninstall-gate` lands first** (`depends_on`): it ships
   `quarantineInventory`, which every rule here calls, and the ADR-0019 amendment that
   authorises a carve-out at all.
