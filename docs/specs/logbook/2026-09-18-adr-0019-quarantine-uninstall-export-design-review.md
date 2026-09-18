---
date: 2026-09-18
title: "Design gate: WP-adr-0019-quarantine-uninstall-export — round dispositions"
related_wps: [WP-adr-0019-quarantine-uninstall-export]
---

# Design gate — WP-adr-0019-quarantine-uninstall-export

Adversarial design review of the spec matured from its Draft stub on 2026-09-18
(PR #299). Each round's raw and focus are committed **before** adjudication, so
the finding text cannot be edited to match the fix.

**A review gate is not owner approval.** Nothing in this repository records the
owner approving, accepting, ratifying or signing this package, and the ADR-0019
amendment it drafts carries *"owner signature pending"*.

## Round 1 — Astra, 2026-09-18

- **Reviewed tip:** `0182ad21`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r1-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r1-astra-focus.txt`
- **Committed before adjudication at:** `5084f7c1`
- **Verdict:** `needs-attention` — *"its deletion algorithm still permits loss of
  quarantined text, and its counting contract blocks uninstall after the shelves
  are emptied."*
- **Round zero:** template conformant; every citation exact except two range
  imprecisions (below).

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R1-1** | **The deleter's second inventory does not close the deletion race.** Table X row **X1** (`:305-307`) still required a recursive removal of `state/` after an ABSENT/EMPTY inventory. A concurrent dream can complete a preserve after that inventory returns but before `rmSync`'s traversal reaches the shelf, destroying the newly preserved original. Moving the check inside the deleter **narrows** the window without closing it. Acceptance criterion 9 inserted the file only *before* `disposeCoreMechanics` starts, so it could not detect the failure | A | HEAVY (high, conf. 0.99) | **ACCEPTED IN FULL.** Table X row **X1** rewritten: **no recursive delete ever touches `<state>` or either shelf**, no shelf file is ever deleted, and the shelves and their ancestors come off bottom-up through **non-recursive `fs.rmdirSync` only** — `ENOTEMPTY` (or any code but `ENOENT`/`ENOTDIR`) preserves that directory and every ancestor and stops the climb. The emptiness test and the deletion become **one syscall**, so there is no interval. **X2** is now snapshot-free (the deleter does not call `quarantineInventory` at all), **X3** claims the window *closed* rather than narrowed and records why a second inventory would not have fixed it, **K7** is rewritten (no second number to diverge), and **acceptance criterion 9 is an interleaving test** — the copy is created *during* the deleter's work, by seaming `fs` in the test process, asserted for **both** live sweeps. Criterion 9 gained a **RED declaration** on `quse-carve-out-dropped` (it asserts a survival, the vacuity-prone shape); the earlier "positive effect, no declaration needed" note was wrong and is withdrawn. `quse-carve-out-dropped`'s mutation is now "replace the `rmdirSync` chain with a recursive `rmSync`", i.e. it restores this exact defect |
| **R1-2** | **Counting the `redacted/` root itself makes an emptied shelf non-empty.** Table K row **K2** (`:294-295`) counted every entry "at or under" `quarantine/redacted`, so the product-created `redacted/` directory still contributed one entry after the user had removed every file — **uninstall refuses forever**, contradicting K3's promised EMPTY behaviour and this spec's own worked example, which excluded it | B | **HEAVY** — reclassified from the reviewer's `medium` because it changes what the user sees and makes the package's remedy non-terminating | **ACCEPTED IN FULL.** Table K row **K2** rewritten: **the two shelf ROOT directories contribute zero entries when each is a real directory**, with conservative counting retained for every other entry at any depth **and** for a symlink, file or any non-directory occupying either root path (it is not the product's directory, it is something else sitting where it should be). **K3**'s EMPTY arm now names the both-directories-present-and-empty state explicitly as the state the refusal asks the user to reach. **W4** prints a line only for a shelf directory holding at least one entry. A third fixture is added to acceptance criterion 2 — both shelf directories present and empty ⇒ `entries: 0`, uninstall proceeds and completes — and the worked example gains that case |

### Round-zero LIGHT notes, all applied

| Note | Disposition |
|---|---|
| `manifest.js:1133-1148` was labelled *"the sweep loop"*; `:1133` is the **signature** and the loop is `:1142-1150` | Current state item 2 now gives each range separately: JSDoc `:1110-1132`, signature `:1133`, `mechanics` array `:1136-1141`, loop `:1142-1150`, core removal `:1151-1170` |
| `:1110-1116` was labelled *"its own doc comment"*; the JSDoc runs `:1110-1132` | Corrected in Current state item 2 and Table X row **X9**. The false *"none user-authored"* sentence spans **`:1112-1116`** — re-measured directly rather than relayed; it begins mid-line `:1112` with *"state/, logs/,"* |
| Table B was described in the PR body as 4 anchored + 2 new-code | It is **5 anchored + 1 new-code**. The spec now states the split in Table B's own preamble; the PR body is corrected in the same push |
| `WP-quarantine-only-copy-shelf`'s row **O8b** cites `docs/GLOSSARY.md:141-148`, which **contains** this package's `:146-147` target — the ranges overlap on paper | Table W row **W9** now annotates the overlap explicitly: no content collision (O8b adds a clause beside *"disposable"*, this package replaces the *"`wienerdog uninstall` removes it …"* clause), which is why the ordering is a `depends_on` rather than a convention, and why the implementer re-derives both line numbers after that package lands |

### What round 1 did **not** re-open (unchanged after round 2)

Owner items 1, 2 and 3 were not challenged, and neither was the amend-vs-supersede
recommendation, the refuse-and-report cell, the code-carve-out-vs-manifest-kind
choice, or the composition rules of Table W row **W7**. All stand as written.

## Round 2 — Astra, 2026-09-18

- **Reviewed tip:** `f6f27d3e`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r2-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r2-astra-focus.txt`
- **Committed before adjudication at:** `85041d69`
- **Verdict:** `needs-attention` — *"the proposed sweep introduces a
  symlink-related data-loss regression."*
- **Held from round 1:** the `rmdirSync` bottom-up sweep (**X1** step 3) and the
  **K2** shelf-root exclusion were **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R2-1** | **The child-by-child sweep follows a symlinked `state` directory.** Table X row **X1** (`:341`) enumerated `paths.state` and recursively deleted every non-`quarantine` child **without first rejecting a symlink at `state`**. The shipped `isDir` (`manifest.js:175-181`) uses `statSync`, so it accepts a directory symlink: with `<core>/state` pointing at an external directory holding user files and no `quarantine/`, the gate passes and the sweep deletes **that target's** children. Mocked execution confirmed the deletion target moving from `state` to `state/personal-notes`. At `5b77865f` the single `rmSync(paths.state, {recursive:true})` removes only the link, so **this is a regression round 1's own fix introduced**, and the vault guard gives no cover when the configured vault is elsewhere | A | HEAVY (high, conf. 0.99) | **ACCEPTED IN FULL.** New canonical row **Table X row X10** states the rule once over every path this package classifies: **every classification is `fs.lstatSync`-based; `statSync`/`isDir` is never used to decide whether to enumerate or delete.** **X1 gains a step 0**: `lstat` `paths.state` first — a **symlink is `unlinkSync`'d and never descended**, no enumeration, nothing below it touched. **X1 step 3** gains the matching shelf clause: a shelf root `lstat` reports as anything but a directory is **preserved untouched, reported, never followed, never removed, never climbed past** — consistent with **K2**, which already counts that object as one of the user's entries. New **Table Y row Y9**; new **acceptance criterion 14** (external directory's files byte-unchanged after a full uninstall, link removed, core emptied — plus the shelf-root arms); new RED proof **`quse-symlinked-state-descended`**, anchored on `if (!isDir(dir)) continue;` (**1** at `5b77865f`), whose mutation reinstates `isDir` and restores this exact defect. The old criterion 14 (RED proofs) became **15**, and its two references were moved with it |

**One narrowing of the recommendation, stated rather than silently taken.** The
reviewer recommended *"preserve/report a symlink"* at `state`. **Never descend**
is accepted in full. **Preserving the link itself is narrowed to unlinking it**,
because unlinking a symlink destroys **no bytes**, it reproduces `5b77865f`
exactly, and it is already the treatment `disposeCoreMechanics` gives a symlinked
**core** at `manifest.js:1164-1165`; preserving it would leave `<core>` permanently
non-empty for no safety gain. The shelf roots keep the reviewer's wording in full,
because **K2** classifies a non-directory there as user content.

**Also recorded:** `isDir` is **not** changed and **not** removed — it has four
call sites at `5b77865f` (`:587`, `:616`, `:903`, `:1143`), all retained,
including `:1143` for `logs`/`schedules`/`secrets`, which keep the existing
`isDir` + recursive `rmSync` path and are out of scope. The general rule's
Node-behaviour half (recursive `rmSync` `lstat`s and unlinks rather than
descending) is stated as **the contrast this finding measured**, with a one-line
implementer probe required rather than taken on trust — because the enumeration
in X1 step 1 is ours, and a guarantee inside `rmSync` says nothing about a
`readdirSync` we wrote.

## Round 3 — Astra, 2026-09-18

- **Reviewed tip:** `9e48cde4`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r3-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r3-astra-focus.txt`
- **Committed before adjudication at:** `a0693065`
- **Verdict:** `needs-attention` — *"the specified cleanup order can follow a
  quarantine symlink and remove an external directory."*
- **Held from round 2:** **X10** and **X1** step 0 were **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R3-1** | **Validate shelf ancestors before the bottom-up cleanup.** Table X row **X1** (`:345`) `lstat`-checked and removed `<state>/quarantine/redacted` **before** classifying `<state>/quarantine` itself. **`lstat` does not reject a symlink in an intermediate path component** — it classifies only the final one — so with `quarantine` pointing at an external directory containing an empty `redacted/`, the sequence removes `external/redacted` **before** it detects and preserves the `quarantine` link. Astra verified the filesystem semantics read-only and then executed X1 in memory, reproducing the external removal. **The gate does not cover it**: it refuses a *pre-existing* symlinked root (K2 counts it), but `disposeCoreMechanics` is exported and directly callable, and a link introduced *after* the gate is Table X row **X3**'s concurrent class. Criterion 14 checked surviving **file bytes** and the link, so it **misses the deletion of an empty external directory** | B | **HEAVY** — reclassified from the reviewer's `medium` because it changes the deletion order the implementer builds, and its failure removes a directory outside the core | **ACCEPTED IN FULL.** New canonical **Table X row X11**: *validation runs top-down, removal runs bottom-up, and they are two passes in opposite directions.* **X1 step 3** is rewritten accordingly — `lstat` `<state>`, then `quarantine`, then `redacted`, **stopping at the first level that is not a real directory**, with that level **and everything below it** off-limits (not accessed, not `lstat`ed further, not removed); then `rmdirSync` leaf→root **over the validated prefix only**. X11 also records **why the passes cannot be merged**: the safety property is about *ancestors* (downward), `rmdir`'s emptiness requirement is about *descendants* (upward), and one order serves one of them — the same shape as `WP-scheduler-replay-manifest-independent`'s Table D row **D5**. **Criterion 14 is extended** with the direct-sweep regression: a symlinked `quarantine` whose external target holds an **empty** `redacted/` leaves that directory present, asserted with `existsSync`/`lstatSync` **and explicitly not by file bytes**, because an empty directory has none — which is precisely the gap the reviewer named. Same assertion for a symlinked `<state>`. **Second RED proof** `quse-shelf-validated-leaf-first` (mutation: reverse X11's validation direction; new code, so no pre-measurable anchor), giving criterion 14 two declarations — round 2's defect and round 3's are different failures of the same rule |

**Declaration count after round 3:** eight declarations over seven criteria; six
carry a pre-measurable anchor, two mutate code this package authors.

**One confirming round remains.** The gate closes on a clean or LIGHT-only return
(`docs/runbooks/codex-review.md`, "Weighted closure").
