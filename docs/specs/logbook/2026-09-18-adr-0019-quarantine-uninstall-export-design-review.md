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

## Round 4 — Astra, 2026-09-18

- **Reviewed tip:** `6fcd68b2`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r4-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r4-astra-focus.txt`
- **Committed before adjudication at:** `084142ed`
- **Verdict:** `needs-attention` — *"The proposed sweep still permits deletion of
  quarantined originals on case-insensitive filesystems."*
- **Held from round 3:** **X11** was **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R4-1** | **Protect case variants of the quarantine directory before recursive deletion.** Table X row **X1** step 2 (`:348`) recursively deleted every child **not named exactly `quarantine`**. On a case-insensitive filesystem an existing **`Quarantine`** directory **is** the destination of `quarantinePreserve`'s lowercase path, while enumeration returns the capitalized name — so if it is empty at the gate and a dream completes a preserve before the sweep, **step 2 destroys the new original before step 3's protected `rmdir` sequence ever runs**. Case-insensitive path identity verified on this workspace (APFS default); an in-memory execution of the specified sequence reproduced the deletion. **X10 and X11 do not cover it** — they classify *types* and *ancestors*, not *names* | A | HEAVY (high, conf. 0.98) | **ACCEPTED IN FULL.** New canonical **Table X row X12**: *shelf identity is decided by case-folded name, on every platform, never by byte-equal name.* X1 step 2 now excludes every child whose name **ASCII-case-folds** to `quarantine`; **a child that folds equal but is not byte-equal is preserved and reported**, never deleted and never assumed to be ours, which only ever deletes *less* (ADR-0038's direction) and makes `<state>` non-empty so X1 step 3's existing `ENOTEMPTY` rule stops the climb with no new clause. **The same fold locates the roots for the inventory** (Table K row **K1** rewritten), so the plan and the act agree about which directory is the shelf. The **byte-exact lowercase path stays the removal target**, because that is what `quarantinePreserve` writes and what a case-insensitive volume resolves to the same inode. **Closed-set argument recorded:** our names are pure ASCII with no combining marks, so their ASCII case variants are *exactly* the set a case-insensitive volume could collide with — an enumeration of our own good, with nothing enumerated as forbidden — and an explicit ASCII fold is required rather than `toLowerCase`, whose Unicode mappings are broader than the property being tested. **Acceptance criterion 15** (three arms: inventory counts a capitalized shelf and the refusal names it by its on-disk name; the direct sweep does not delete it; the ambiguity rule preserves a fold-equal non-byte-equal sibling), **criterion 9 gains the case-fold interleaving arm** — empty `Quarantine` at inventory, preserve completed before the sweep, bytes survive — and the RED-proof criterion moved **15 → 16** with both references. **New RED proof `quse-shelf-name-case-sensitive`** (mutation: restore byte equality; new code, disclosed). **Table Y row Y4 was rewritten rather than left standing**: its claim that the package *"constructs exactly two paths, both literal joins"* stopped being true the moment a `readdirSync` name is joined, and it now rests on that name having first matched the closed fold set |

**One unregistered mirror found and registered in the same pass (ADR-0031's
register-new-mirrors).** The Security checklist's untrusted-identifier bullet was
still asserting **K1**/**Y4**'s superseded *"exactly two paths, both literal
joins"* claim after those rows were rewritten. It was corrected in the same commit
and a **new mirror class — "Security-checklist bullets that restate a contract" —
was added to the Mirrored Surface Checklist**, naming all five bullets and the
rows each defers to, so the class cannot go unregistered again.

**Declaration count after round 4:** nine declarations over eight criteria; six
carry a pre-measurable anchor, three mutate code this package authors.

## Round 5 — Astra, 2026-09-18

- **Reviewed tip:** `9a8dd2ea`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r5-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r5-astra-focus.txt`
- **Committed before adjudication at:** `59064c78`
- **Verdict:** `needs-attention` — *"the blanket no-throw requirement breaks
  uninstall recovery after cleanup failures."*
- **Held from round 4:** **X12** was **not** re-opened.
- **Notable:** the first finding of this gate to land on the spec's **Implementation
  notes** rather than on a contract table — which is itself the lesson, because a
  table row gets swept for mirrors and a prose bullet did not.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R5-1** | **Preserve error propagation for failed mechanics deletion.** The Implementation note *"`disposeCoreMechanics` must never throw"* (`:709-713`), implemented literally, **swallows an `EPERM` removing `secrets/`**. The cited guarantee — *"never let this final cosmetic step crash the uninstall"* (`manifest.js:1163`) — applies **only** to the empty-core removal; the ordinary recursive deletion at `:1148` is **not** wrapped and propagates today. After the disposer returns, `uninstall.js` deletes the manifest and then `config.yaml` (`:423-462`), so a swallowed failure **leaves a live OAuth credential on disk** *and* makes the retry refuse with *"no install manifest found"*. The shipped mid-sweep recovery test relies on propagation, and the note also contradicted this spec's own requirement that non-quarantine disposal be unchanged | A | HEAVY (high, conf. 0.99) | **ACCEPTED IN FULL, and the blanket claim is WITHDRAWN rather than softened.** New canonical **Table X row X13**: *the disposer's no-throw promise covers the shelf and the empty-core step only.* **Caught and reported:** every shelf-specific outcome of **X1** step 3 — an `lstat` failure or non-directory level (**X10**/**X11**), an `ENOTEMPTY`/`EEXIST`, **X12**'s fold ambiguity — each preserved and reported in `preservedQuarantine`; plus the **pre-existing** empty-core `try/catch`, unchanged. **Still throws, byte-for-byte as at `5b77865f`:** a failure enumerating `paths.state`, any **X1** step 2 `fs.rmSync` on a non-shelf child, and the recursive `rmSync` over `logs/`, `schedules/` and `secrets/`. **The asymmetry is stated as the reason, not left implicit:** preserving at a shelf level can only leave *more of the user's own text* alive, disclosed via `preservedQuarantine` and **W8**; swallowing a mechanics failure leaves a *credential* alive and destroys the retry — and ADR-0019's Decision (`:47-50`) already says why `secrets/` must go. **Table K row K4's deleter arm was narrowed in the same pass** to "at a shelf level only", since it was the row the blanket note leaned on. New **Table Y row Y10**; new **acceptance criterion 16** (injected `EPERM` on `secrets/` ⇒ throws, manifest **and** config still present by existence *and* content, retry succeeds once cleared; plus the `paths.state` enumeration arm and, in the same run, a shelf-level `ENOTEMPTY` that does **not** throw, so the criterion measures the **boundary** rather than one side of it); RED-proof criterion moved **16 → 17**; new RED proof **`quse-mechanics-failure-swallowed`** anchored on `const mechanics = [` (**1** at `5b77865f`), whose mutation is exactly what a literal reading of the withdrawn note would have produced |

**Blanket-phrase re-scan, run as instructed.** `never throw` / `no-throw` /
`never throws` / `crash the uninstall` across the whole spec: four remaining
occurrences, all correct — `quarantineInventory`'s own never-throws contract (it
reports into `unreadable` instead), the Current-state quotation of the shipped
`:1163` comment, and the two scoped statements in **X13** and the corrected
Implementation note. A new **Security-checklist propagation bullet** was added and
registered in the mirror class created at round 4.

**Declaration count after round 5:** ten declarations over nine criteria; seven
carry a pre-measurable anchor, three mutate code this package authors.

## Round 6 — Astra, 2026-09-18

- **Reviewed tip:** `bbfc4a1d`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r6-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r6-astra-focus.txt`
- **Committed before adjudication at:** `7cfecf2a`
- **Verdict:** `needs-attention` — *"the prescribed removal accounting contradicts
  the required empty-shelf compatibility."*
- **Held from round 5:** **X13** was **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R6-1** | **Preserve removal accounting when empty shelf directories are deleted.** Table X row **X1** (`:356`) required pushing **every** successful `rmdir` onto the public `removed` array. With both shelf directories present and **empty**, that reports `redacted`, `quarantine` **and** `state` where the baseline reports **`state` only** — a two-item difference Astra confirmed by mocked execution. `uninstall.js` sums `removed.length` into the user-facing *"Removed N item(s)"* line (`:471-473`) **and** renders the same array as the `--dry-run` mechanics plan (`:337-341`), so both change. **The specified algorithm and Table W row W6 / acceptance criterion 7's byte-identical requirement could not both hold** | B | **HEAVY** — reclassified from the reviewer's `medium` because the user-visible count and plan change, and because it is a direct self-contradiction between two of this spec's own contracts | **ACCEPTED IN FULL.** The `rmdir` bookkeeping is now **internal**: **X1** step 3 pushes nothing onto `removed`, and **Table X row X4** is rewritten to fix the public contract — **`removed` keeps its original MECHANICS-DIRECTORY granularity: `paths.state` appears at most once, and only when the whole of `<state>` is gone** (the final `rmdirSync(<state>)` succeeded, or step 0 unlinked a symlinked `<state>` per **X10**); **the intermediate `rmdir`s never appear**; and **when any shelf level was preserved `paths.state` does not appear at all**, with `preservedQuarantine` carrying the detail. X4 now also records *why* this is a contract rather than a formatting choice, citing the caller's two consumers by line. **Acceptance criterion 7 gains the round-6 fixture** — both shelf directories present and **empty** — and requires the *"Removed N item(s)"* line **and** the `--dry-run` mechanics plan to be compared **in full**, because the granularity is visible in each and in neither alone. **Criterion 2** now also asserts `removed` contains `paths.state` exactly once and neither shelf path, in all three of its fixtures. **Table W row W5** gained the empty-shelf clause, and an Implementation note names the natural-but-wrong shape (push as you climb) so the implementer does not re-derive it |

**Declaration count after round 6:** unchanged — ten declarations over nine
criteria; seven carry a pre-measurable anchor, three mutate code this package
authors. `quse-carve-out-dropped` already covers criterion 1's side of X1, and
criterion 7 already carries `quse-block-printed-on-an-empty-shelf`, whose mutation
makes the empty-shelf output differ — the same assertion this finding strengthens.

## Round 7 — Astra, 2026-09-18

- **Reviewed tip:** `53624f18`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r7-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r7-astra-focus.txt`
- **Committed before adjudication at:** `86123c72`
- **Verdict:** `needs-attention` — *"the prescribed algorithm cannot satisfy the
  dry-run contract."*
- **Held from round 6:** **X4** was **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R7-1** | **Define a read-only planning path for dry-run.** Table X row **X4** (`:364`) permits reporting `<state>` removed only after a **successful** `rmdir`/`unlink`, while **X1**/**X2**/**K7** prohibit any inventory or emptiness test in the disposer. **In dry-run those syscalls cannot execute**, so the prescribed algorithm cannot distinguish an empty shelf from a populated one as **W5** requires: skipping them leaves an empty install's plan **incomplete**, and assuming they would succeed **mis-reports a populated shelf as removable**. Affects `--dry-run` (`uninstall.js:318`) **and** the interactive pre-confirm plan (`:354`) | B | **HEAVY** — it changes what the implementer builds for two user-facing surfaces, and it was a third self-contradiction among this spec's own contracts | **ACCEPTED IN FULL.** New canonical **Table X row X15**: *`dryRun: true` is a **read-only planner**, and it is the one place an emptiness test belongs.* It runs **`quarantineInventory`** — **the same function**, the same **X12** ASCII fold, the same **X11** three-level top-down validation — performs **no mutating filesystem call of any kind**, and returns `removed` as **PREDICTED** removals at **X4**'s unchanged granularity. **The no-emptiness-test rule is explicitly exempted, with its reason:** X2/K7 exist because a snapshot followed by a *deletion* has a raceable interval; **a planner performs no deletion**, so being wrong costs a line of output, never a byte. The **live arm is untouched and stays snapshot-free**. **One implementation, not two** — reusing `quarantineInventory` means the plan and the gate's disclosure cannot drift apart by construction. **X2**, **K5**, **K7**, **X4** and **W5** were all re-scoped in the same pass to say "live arm" where they said "the disposer". **Named residual `R-dry-run-prediction-drift`**, with its direction stated: the live `rmdirSync` fails closed on anything non-empty, so a run can only ever **preserve more than predicted, never delete something the plan did not name**; and within one `--dry-run` the block and the plan are two reads of the same tree, cosmetically divergent at worst since nothing is mutated. **The alternative — passing the gate's snapshot into the disposer — was weighed and NOT taken**, because a caller-controlled input to that function is exactly what **X2** exists to prevent and the coherence it buys is cosmetic on a command that deletes nothing. New **acceptance criterion 17**: three shelf states (empty/absent, populated, unreadable) asserted on **both** surfaces, **plus zero mutating `fs` calls counted through the seam** rather than inferred from the tree afterwards — which would pass vacuously whenever the fixture had nothing to delete. RED-proof criterion moved **17 → 18**; new RED proof **`quse-dry-run-plans-by-assuming`** covering the "assume success" horn, with the note that the other horn is already caught by criterion 7's byte-identity and `quse-block-printed-on-an-empty-shelf` |

**One intra-cell drift found by my own post-edit sweep and fixed in the same
round.** **K7**'s body was re-scoped to the live arm, but its **row title** and
closing sentence still read as universal — exactly the failure
`docs/runbooks/spec-authoring.md` names: *"the new sentence goes in, the old one
stays, and no mirror checklist can see inside one cell."* Both corrected at
`c08f9c0a`.

**Declaration count after round 7:** eleven declarations over ten criteria; seven
carry a pre-measurable anchor, four mutate code this package authors.

## Round 8 — Astra, 2026-09-18

- **Reviewed tip:** `9a26b1c4`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r8-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r8-astra-focus.txt`
- **Committed before adjudication at:** `648f225a`
- **Verdict:** `needs-attention` — *"manifest replay can bypass the proposed
  quarantine protection."*
- **Held from round 7:** **X15** was **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R8-1** | **Protect quarantine paths during manifest replay too.** Table Y row **Y6** (`:406`) promised immunity to forged manifest entries while the spec kept `reverse()` unchanged. Its `file` handler applies prove-before-delete **only when the entry carries a hash** (`manifest.js:894`), so a **hash-less** `{kind:'file', path:'<state>/quarantine/<name>'}` passes `validateEntry`, passes `withinAllowedRoot` (the shelf is inside `paths.core`), and reaches `fs.rmSync` (`:899`). With the shelf **empty at the gate** and a dream completing a preserve before the replay, `reverse()` destroys the new copy **before** the protected disposer runs — and **the manifest bytes never change**, so `uninstall.js`'s byte-compare does not help. Astra probed the shipped `reverse()` in memory and confirmed the entry validates and invokes `rmSync` | A | HEAVY (high, conf. 0.98) | **ACCEPTED IN FULL.** New canonical **Table X row X16**: `reverse()` gets a **shelf guard before kind dispatch**, placed immediately after the existing **global deferred-member guard** (`:781`) whose precedent it follows — that guard blocks every path-based route for every kind at once, and patching the `file` handler alone would close the measured instance and leave the others. **Shelf-resident means any of three, all preserving:** the **literal** path is at or under either shelf root; the **resolved** path is (catching `.`/`..` and symlink aliases); or **the containment question cannot be answered**. Roots located by **X12**'s fold and validated by **X11**'s top-down rule, computed once beside `schedulerOpts`. **`contains` is deliberately not used** — its bare boolean fails closed to *not contained*, which here means *delete* (**X7**). **Only narrows** (ADR-0038 **N**): every input now preserved was previously deleted. Table X's heading was broadened to "the deletion-side contracts", because a table governing only one of the two deleters is a protection with a documented way around it. **Table Y row Y6 was rewritten, not patched**: *not being in the manifest was never the same as being safe from it.* **Table W row W7 was rewritten** to state exactly which lines this package adds to `reverse()` (the `quarantineRoots` computation at `:751-758`, one guard at the `:781` region) and to establish that **no D-row moves** — D5a runs before the entry loop, D5b after it, the guard inside it before dispatch — **and that the two packages' deletion targets are disjoint by construction**: every D5b target sits under a scheduler root, `<core>/schedules` and `<core>/state` are sibling subtrees, and **even under a contrived symlink no shelf file can match R2**, because `quarantinePreserve` date-prefixes every name (`validate.js:958`) while R2 requires `^wienerdog-…\.xml$`. Landing order stated both ways: that package is in `depends_on` and lands first, so its "`reverse()` untouched" claim is true when it ships; **if the order is ever reversed, its implementer must re-pin that claim**. New **acceptance criterion 18** (pre-existing forged hash-less entry + empty initial inventory + preserve completed before replay ⇒ bytes survive, entry in `skipped`, manifest bytes unchanged throughout — plus the `.`/`..` and symlink-alias shapes and the unanswerable-resolution case); RED-proof criterion moved **18 → 19**; new RED proof **`quse-reverse-shelf-guard-dropped`** anchored on the global deferred-member guard line (**1** at `5b77865f`), and it is **the one mutation in this package that restores shipped `main` behaviour** — a suite green under it asserts nothing this package adds |

**Declaration count after round 8:** twelve declarations over eleven criteria;
eight carry a pre-measurable anchor, four mutate code this package authors.

## Round 9 — Astra, 2026-09-18

- **Reviewed tip:** `45fe40cf`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r9-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r9-astra-focus.txt`
- **Committed before adjudication at:** `4bd3ea58`
- **Verdict:** `needs-attention` — *"the replay guard still permits recursive
  deletion of a shelf ancestor."*
- **Held from round 8:** **X16**'s placement was **not** re-opened — the finding is
  about its *coverage*, and it is the same family one level up.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R9-1** | **Protect shelf ancestors from recursive manifest replay.** Table X row **X16** (`:386`) guarded targets **at or below** a shelf but not a **recursive deletion of a shelf ANCESTOR**. With `<core>/app` a symlink to `<core>/state`, a forged `{kind:'vendored-tree', path:'<core>/state'}` satisfies `reverseVendoredTree`'s only ownership test — `sameResolvedDir(entry.path, appRoot)` (`manifest.js:588`) — **its target lies outside both shelf subtrees, so X16 permitted it**, and `fs.rmSync(entry.path, {recursive:true, force:true})` (`:593`) destroys a preserve completed after the empty-shelf gate. Astra probed the shipped `reverse()`: the entry validates and invokes the recursive `rmSync`, every resolution succeeding | A | HEAVY (high, conf. 0.98) | **ACCEPTED IN FULL.** **X16 is now SYMMETRIC**, and the rule is stated once: *no manifest-driven deletion may cover a shelf path **from below** or **from above**.* **From below** (round 8) — any mutating kind whose literal or resolved target is **at or under** a shelf root. **From above** (round 9) — any kind **whose reverser deletes recursively** whose target **contains** one, by the same three cases, with an unanswerable resolution preserving in both halves. **New canonical Table V enumerates the recursive deleters from the shipped code**, every arm read rather than assumed: `vendored-tree` (`:586`, recursive `rmSync` at `:593`, gated only by `sameResolvedDir`) and `copied-skill` (`:615`, `:645`, gated by a parent-equals-skills-root test and a `hashDir` match) — **and nothing else**; `file` is non-recursive, `dir` removes only a **virtually empty** directory, `symlink` unlinks one link, `managed-block`/`settings-entry` rewrite one file, `scheduler-entry` removes one file. `copied-skill` is included **although it is far harder to forge than `vendored-tree`**, because **the rule is over the deletion SHAPE, not over how hard an arm is to reach**. **`dir` is excluded deliberately and the reason is load-bearing, not tidiness:** `init` can record `{kind:'dir', path:'<state>'}`, and guarding it would emit a `skipped` line on an **ordinary** uninstall, breaking Table W row **W6** and acceptance criterion 7's byte-identity. **Table V is closed only while it is re-measured**, so a **new verification step** re-runs `grep -n 'recursive: true' src/core/manifest.js` and requires exactly the three known hits (`:593`, `:645`, and `:1148`, which is `disposeCoreMechanics`, governed by **X1**); a fourth hit means a kind was added and Table V is stale. **Acceptance criterion 18** gains the from-above arm as a **different entry shape**, asserting the recursive `fs.rmSync` is **not invoked** — counted through the seam, because a skip and a successful-but-empty delete both leave the file present — plus the same shape for `copied-skill` **and a `{kind:'dir'}` negative control** proving the exclusion holds. **Second RED proof `quse-reverse-guard-from-below-only`** (keep the from-below half, delete only the from-above half), anchored on `if (!sameResolvedDir(entry.path, appRoot)) {` (**1** at `5b77865f`): without it the new half is **invisible**, since `quse-reverse-shelf-guard-dropped` removes both at once and a suite fixturing only at-or-below targets stays green on a from-below-only implementation |

**Declaration count after round 9:** thirteen declarations over eleven criteria —
criterion 14 carries two and criterion 18 now carries two; nine have a
pre-measurable anchor, four mutate code this package authors.

## Round 10 — Astra, 2026-09-18

- **Reviewed tip:** `21b8c636`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r10-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r10-astra-focus.txt`
- **Committed before adjudication at:** `878c50bf`
- **Verdict:** `needs-attention` — *"the new manifest guard lacks a safe
  absent-shelf contract and can strand an ordinary installation."*
- **Held from round 9:** **Table V** and the **symmetric X16** were **not** re-opened.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R10-1** | **Distinguish absent shelves from failed shelf resolution.** Table X row **X16** (`:386`) preserved an entry whenever a shelf resolution failed, **without exempting `ENOENT`/`ENOTDIR`** — but `quarantinePreserve` creates the shelves **lazily** (`validate.js:950`), so on an install that has never quarantined anything **absence is normal**. Astra probed the shipped `reverse()` with that guard: **an ordinary app-tree removal became a skip**, and `uninstall.js` then deleted the manifest (`:424`), leaving the skipped component **with no retry ledger**. **And the naive repair is also wrong** — omitting absent roots from the guard leaves a shelf created *during* replay unprotected, which is Table X row **X3**'s window one deleter over | A | HEAVY (high, conf. 0.94) | **ACCEPTED IN FULL.** New canonical **Table X row X17 — one resolution rule over every path this package resolves, explicitly modelled on `WP-scheduler-replay-manifest-independent`'s Table D row D15**, which states one rule over that package's roots, candidates, vault path and act-time site rather than one per site. **(1)** **Lexical** anchors — `path.join(paths.state,'quarantine')`, its `redacted`, and every **X12** fold-equal name found at that level — are **always retained, present or not**, so the guard does not depend on the shelf existing. **(2)** **Resolved** anchors are derived through the **nearest validated existing ancestor** (`<state>`, else `<core>`) with the missing suffix appended **lexically**, so a shelf created **after guard initialisation** is still covered. **(3)** `ENOENT`/`ENOTDIR` at a shelf level is **ABSENCE**: no resolved anchor, nothing reported, **no entry skipped** — the clause whose absence stranded the ordinary install. **(4)** Any other code is **UNANSWERABLE**: the entry is **preserved and reported**, failing closed toward preservation as X16 already said. **(3) and (4) must be distinguishable in the implementation and in the tests**, not merged into one `catch` — they are the same syscall failing for opposite reasons, and collapsing them is exactly what this round caught. **X11**, **K3** and **K4** already carried absence-as-the-single-special-case and are **unchanged**: X17 generalises their rule rather than adding a second one, and **X16 was the site that lacked it**. **Acceptance criterion 18** gains three arms — (a) neither shelf exists ⇒ byte-identical output and **nothing newly skipped**, asserted over the whole `skipped` array *and* the complete stdout; (b) a shelf created after guard init but before replay is still protected; (c) a non-`ENOENT` failure **does** preserve while `ENOENT` on the same level preserves nothing. New RED proof **`quse-absent-shelf-read-as-unanswerable`** (collapse outcomes 3 and 4 into one `catch`) — **the mutation that turns this package's protection into a denial of service on every install that never quarantined anything**, i.e. the majority case |

**Two registered mirrors updated in the same pass (ADR-0031 update-all-mirrors).**
**Table Y row Y6** and the Security checklist's manifest bullet both still read
*"preserves when the question cannot be answered"* — not false under X17, since an
absent shelf is *answered*, but it is the exact phrasing that invites the collapse
round 10 caught. Both now say **unanswerable means a code other than
`ENOENT`/`ENOTDIR`**, explicitly.

**Convergence note (requested, and it is the point of this round).** The
resolution semantics of this package are now **uniform across X11, X12 and X16
under X17** — the same consolidation the scheduler package reached with **D15**
after rounds 5, 6 and 7 kept finding the identical defect at a new site.
**A further finding of this family is closed by pointing at X17 and adding the
site to it, not by writing a fourth rule.** That is ADR-0031's circuit-breaker
applied to a resolution contract rather than to a prose contract.

**Declaration count after round 10:** fourteen declarations over eleven criteria —
criterion 14 carries two and criterion 18 now carries three; nine have a
pre-measurable anchor, five mutate code this package authors.

## Round 11 — Astra, 2026-09-18

- **Reviewed tip:** `a2bc5c7a`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r11-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r11-astra-focus.txt`
- **Committed before adjudication at:** `fe6ab693`
- **Verdict:** `needs-attention` — *"the prescribed sweep can delete quarantined
  originals through a sibling-directory alias."*
- **Held from round 10:** **X17** was **not** re-opened. The finding is **X16's own
  rule applied to a site the spec had exempted**.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R11-1** | **Protect shelf targets before recursively deleting sibling directories.** With `<state>/quarantine` a **symlink to `<state>/cache`**, Table X row **X1** step 2 recursively deletes `cache` — a non-shelf sibling *by name* — **before** step 3 preserves the `quarantine` link. `quarantinePreserve` writes **through** the alias, so the deleted sibling can hold **the sole original**. Reachable through the exported direct sweep, and through the link-and-preserve appearing after the CLI gate — the interleaving **X3** already covers. Astra executed the prescribed sequence in memory: **the original was deleted and the surviving, now-dangling link was reported as *preserved*.** **Top-down `lstat` validation does not protect data deleted through another pathname** | A | HEAVY (high, conf. 0.97) | **ACCEPTED IN FULL, and fixed by pointing at the rule rather than adding one.** New **Table X row X18** applies **X16**'s symmetric containment check, over **X17**'s anchors, to the recursive deletion the spec had been treating as ordinary mechanics. **Order, which is the whole fix:** protected shelf **targets** (lexical **and** resolved-through-the-nearest-validated-existing-ancestor, alias-aware) → step 2 → step 3; computing them after step 2 leaves the check with nothing to check. A target that **contains, equals or is contained by** a protected resolved target is **preserved and reported**; unanswerable preserves (**X17** outcome 4), absent does not (outcome 3). **Extended beyond the measured site, because it is the same shape:** the `mechanics` loop's `fs.rmSync(dir, {recursive:true, force:true})` (`:1148`) over `logs`/`schedules`/`secrets` is gated too — `<core>/logs` can be a real directory a shelf symlink resolves into. **Table V amended:** `:1148` is listed as **governed by X16 via X1/X18**, not as an exemption, and step 2's new per-child delete is listed as a fourth entry; the verification step now requires **every** `grep -n 'recursive: true'` hit to be **accounted for** in Table V rather than expecting a fixed count, since this package adds one. **W6 is unaffected** and the row says why: on an ordinary install nothing overlaps the shelf, so nothing new is preserved or reported. **Acceptance criteria 1 and 9** gain alias arms — direct sweep and post-gate interleaving, with a `<core>/logs` alias target as well — and **assert the alias TARGET's survival before anything about the link**, because round 11's measured outcome was a **loss reported as a save**. New RED proof **`quse-step2-deletes-through-alias`** (compute the protected targets *after* step 2): **the only mutation in this package that produces a dangling link listed in `preservedQuarantine`** — the shape a reviewer reading the output would be least likely to question |

**Convergence note, extended as requested.** Two rules now cover this package's
whole deletion surface, and both are single rows rather than per-site clauses:
**X17** for resolution semantics (uniform across X11, X12, X16) and **X16** for
containment — and after round 11, **every recursive delete in this package, the
replay kinds of Table V *and* the disposer's own two sweeps, is one X16 rule over
X17 anchors. No site is exempt, and Table V no longer lists one.** **A further
finding of either family is closed by pointing at the rule and adding the site to
it, not by writing a new rule.**

**Declaration count after round 11:** fifteen declarations over eleven criteria;
nine have a pre-measurable anchor, six mutate code this package authors.

## Round 12 — Astra, 2026-09-18

- **Reviewed tip:** `934b69f2`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r12-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r12-astra-focus.txt`
- **Committed before adjudication at:** `7cbd4a27`
- **Verdict:** `needs-attention` — *"unlinking a symlinked state directory can
  erase the evidence needed to protect quarantined originals."*
- **Held from round 11:** **X18** was **not** re-opened. The finding lands on
  **step 0 — the last mutating operation still outside X16.**

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R12-1** | **Preserve shelf aliases across both disposal sweeps.** Table X row **X1** step 0 unlinked a symlinked `<state>` **before** step 1 computed the protected targets. With `<core>/state` → `<core>/logs` and an original at `logs/quarantine/…`, the alias is removed **and the original is not**; **X17** then derives its anchors under the now-**absent** `<state>` path, so **X18** sees no overlap and permits the recursive delete of `logs`, taking the original. Reachable through the exported direct sweep or a link-and-preserve introduced after the CLI gate. **And computing the anchors earlier only protects the FIRST sweep:** `uninstall.js` calls the disposer **again at `:467`**, when the alias is already gone. An in-memory model of **both** orderings confirmed the loss | A | HEAVY (high, conf. 0.97) | **ACCEPTED IN FULL.** New **Table X row X19**, and it is a **retention** rule, not merely an ordering one — the distinction the finding's second half forces. **Order corrected to begin with the targets:** **0a** compute protected shelf targets (before any mutation at all) → **0b** classify `<state>` → **2** per-child recursive removal → **3** the `rmdirSync` climb. **Retention:** a `<state>` symlink whose resolved target **overlaps** a protected shelf target — contains, equals or is contained by, per **X16** — is **preserved and reported in `preservedQuarantine`**, never unlinked, so the evidence survives for the second disposer call and for any retry, which starts from whatever the last process left. **A `<state>` symlink covering no shelf is unlinked exactly as at `5b77865f`** — the ordinary alias case, which acceptance criterion **14** already pinned; X19 is what makes those two arms consistent rather than contradictory, and criterion 14 now says so. Unanswerable preserves (**X17** outcome 4); absent does not (outcome 3). **Consequence stated rather than discovered later:** a retained link leaves `<core>` non-empty, so the core is kept and Table W row **W8**'s arm prints — correct, because the text is still reachable through that name. **W6 unaffected:** on an ordinary install `<state>` is a real directory and step 0b's symlink arms are never reached. **The "step 0 is outside X16" language is gone from X10, X18 and the security checklist**, so the convergence note's *no site is exempt* is now literally true. Acceptance criteria **1** and **14** gain the arm, asserted across **both** live disposer calls; new RED proof **`quse-state-alias-unlinked`**, whose point is that **a suite exercising only the first call stays green** — the loss happens on the second — so the declaration is what forces the two-call fixture to exist |

## Convergence — the deletion surface is CLOSED (recorded at round 12)

Twelve rounds in, this package's mutating operations are **enumerated**, and the
enumeration is the contract rather than a summary:

1. step **0b**'s `unlinkSync` of a `<state>` symlink;
2. step **2**'s per-child recursive `fs.rmSync` over `<state>`'s non-shelf children;
3. step **3**'s non-recursive `rmdirSync` climb over the validated prefix;
4. the `mechanics` loop's recursive `fs.rmSync` at `manifest.js:1148` over
   `logs`/`schedules`/`secrets`;
5. the two Table **V** replay kinds, `vendored-tree` and `copied-skill`;
6. the core removal at `:1151-1170` — pre-existing, non-recursive, unchanged.

**Every one of (1)–(5) is gated by Table X row X16's symmetric containment check
over Table X row X17's anchors. No site is exempt, and no table lists one.**
Resolution semantics are uniform across **X11**, **X12**, **X16** and **X19**
under **X17**, which is the shape `WP-scheduler-replay-manifest-independent`
reached with **D15** after the same recurring family.

**A further alias finding is closed by adding the site to that enumeration, never
by writing a new rule.** An implementer who finds a mutating operation not on the
list has found a spec bug and should say so rather than guess.

**Declaration count after round 12:** sixteen declarations over eleven criteria;
nine have a pre-measurable anchor, seven mutate code this package authors.

## Round 13 — Astra, 2026-09-18

- **Reviewed tip:** `ce1ab255`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r13-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r13-astra-focus.txt`
- **Committed before adjudication at:** `52f8be19`
- **Verdict:** `needs-attention` — *"manifest replay can still erase a shelf alias
  and expose the retained originals to recursive cleanup."*
- **Held from round 12:** **X19** was **not** re-opened.
- **Notable:** this is the first finding the previous round's convergence note
  **predicted its own handling for** — *"a further alias finding is closed by
  adding the site to that enumeration, never by writing a new rule"* — and that is
  exactly how it was closed.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R13-1** | **Preserve ancestor aliases during symlink replay too.** Table **V** exempted the `symlink` replay kind from the ancestor guard, on the reasoning that unlinking a link deletes no bytes. With `<state>` → `<claude>/skills/wienerdog-test` → `<core>/logs` and an original at `logs/quarantine/…`, a `symlink` manifest entry naming the **intermediate** alias resolves **above** the protected shelf, so **X16** permitted it. Astra probed the shipped `reverse()`: it unlinks that entry. The disposer then meets a **dangling** `<state>`, **X17** rebuilds its anchors under the lexical path, **X18** no longer sees `<core>/logs` overlapping anything, and the recursive delete takes the original. Reachable with the alias introduced after the gate too, inside **X3**'s existing interleaving model | A | HEAVY (high, conf. 0.98) | **ACCEPTED IN FULL, and closed by the rule rather than by a new one** — the case round 12's convergence note reserved. **The site is added to the enumeration as item (7):** `reverse()`'s `symlink` reverser's `unlinkSync` (`manifest.js:314`). New **Table X row X20** states the unified sentence: ***no operation of this uninstall removes a link on the resolution chain of a protected shelf*** — the disposer's step 0b by **X19**, `reverse()`'s `symlink` kind by X20, **one rule seen from two sides**. A `symlink` entry is **preserved and reported** when **its own target, or any intermediate alias on the chain from a lexical anchor (X17 (1)) to its resolved anchor (X17 (2)), overlaps a protected target**; unanswerable preserves, absent does not. **The conceptual correction this round forces, recorded because it is the reusable part:** Table V's YES column meant *"deletes bytes recursively"*, and the `symlink` kind is governed for a **different** reason — **it deletes REACHABILITY, not bytes**, and the bytes go one step later when the now-lexical anchors stop gating the recursive delete. The column is re-read as *"the pre-dispatch guard applies"*, each row naming its clause. **The `dir` exemption is KEPT and is now a provable one**: its reverser removes only a virtually-empty directory and **can remove neither a file nor a link**, so it can neither destroy an original nor break a chain — and guarding it would add a `skipped` line to an ordinary uninstall, breaking **W6**. **Acceptance criterion 18** gains the resolution-chain arm — **the only arm in this package spanning `reverse()` *and* both disposer calls *and* a retry** — asserting the **alias's** survival before the original's, because the alias is what makes the original protectable on the next pass, and asserted for the outermost alias as well. New RED proof **`quse-symlink-entry-breaks-chain`**, anchored on the `reverseSymlink` dispatch line (**1** at `5b77865f`): **every other declaration here mutates a deleter, this one mutates an exemption**, and the loss it restores happens **two steps downstream** of the mutated line, so a suite checking the shelf immediately after `reverse()` stays green |

**Enumeration after round 13 — still closed, now with seven items.** (1) step 0b's
`unlinkSync`; (2) step 2's per-child recursive `rmSync`; (3) step 3's `rmdirSync`
climb; (4) the `mechanics` loop at `:1148`; (5) the two Table **V** recursive replay
kinds; (6) the pre-existing core removal at `:1151-1170`; **(7) `reverse()`'s
`symlink` reverser's `unlinkSync` at `:314`**. Every one of (1)–(5) and (7) is gated
by **X16** over **X17**'s anchors. **Items (1) and (7) are one sentence** — *no
operation of this uninstall removes a link on the resolution chain of a protected
shelf* — **because deleting reachability is as destructive as deleting bytes, one
step later.** The `dir` kind is the single exemption and it is provable.

**Declaration count after round 13:** seventeen declarations over eleven criteria;
ten have a pre-measurable anchor, seven mutate code this package authors.

## Round 14 — Astra, 2026-09-18

- **Reviewed tip:** `6ddae885`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r14-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r14-astra-focus.txt`
- **Committed before adjudication at:** `e33c9666`
- **Verdict:** `needs-attention` — *"recursive cleanup can still break a shelf's
  resolution chain and destroy its originals on the second sweep."*
- **Held from round 13:** **X20** was **not** re-opened. The finding is a
  **definition gap**, not a new site.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R14-1** | **Protect intermediate links from recursive ancestor deletion.** Table X row **X18** checked deletion targets against the shelf **anchors**, but not against the **LOCATIONS** of intermediate links on the chain. With `<state>/quarantine` → `<state>/cache/link` → `<core>/logs/recovery` holding an original, step 2 may recursively delete `<state>/cache`: it overlaps **neither** the lexical shelf **nor** its resolved target. That removes the intermediate link. The **first** sweep still protects `logs` from its cached anchors; the **second** rebuilds anchors through the now-dangling shelf, no longer protects `logs`, and deletes the original. Reproduced against a model of the prescribed checks. **X20**'s symlink-entry guard does not cover recursive deletion of the link's *parent* | A | HEAVY (high, conf. 0.98) | **ACCEPTED IN FULL, and fixed ONCE as a definition rather than per site** — **X17 (1a)**: the **PROTECTED SET is the closure of each shelf's resolution chain**, walked **component by component** with `lstat`/`readlink`, comprising **each link's own LOCATION**, **each intermediate target**, and **the final resolved target**. **X16**, **X18**, **X19** and **X20** all test against that **set**, so a recursive deleter preserves any directory that **contains a chain link**, not merely one that overlaps an anchor. **Acceptance criterion 1** gains the two-hop arm across **both** disposer calls **and a retry**, asserting the **intermediate link first**, then `cache`, then the bytes — the order in which the failure cascades, and the reason asserting only the bytes on the first call passes against the defect. New RED proof **`quse-protected-set-is-anchors-only`**: **under it the first call still passes**, so the declaration is what forces the two-call fixture and is the only one that distinguishes *"the anchors were right"* from *"the closure was computed"* |

## Bounding the alias family (round 14) — the surface is frozen

Rounds 11, 12, 13 and 14 each produced **one more alias shape**, and
`docs/runbooks/codex-review.md`'s convergence rule is that the loop converges
**by freezing surface, not by patience**. New **Table X row X21** does that:

- **IN SCOPE:** links, at any depth, inside the **resolved chain closure of a
  shelf as computed at protected-set-computation time** (**X17 (1a)**).
- **OUT OF SCOPE — named residual `R-alias-outside-closure`:** any alias shape not
  on a shelf's chain at that moment — concretely, **a link created after the
  protected set is computed that redirects a chain component**.
- **Why accepted:** the shelves are `0700` under a `0700` core owned by the user
  running the uninstall, so such a link is **the same user's own act on their own
  files** — the boundary ADR-0035 and ADR-0034 already draw. **Closing it needs a
  filesystem transaction no platform offers** (atomicity of the protected-set
  computation with respect to concurrent renames and symlink creation), and the
  resident process that could hold a lock is forbidden by ADR-0004. Every
  alternative enumerates the adversary's options, which this repo has twice paid
  for.
- **Overrule path — owner item 4**, drafted with its cost: refuse the uninstall
  whenever **any** symlink exists anywhere under `<core>`. **An ordinary install
  with a symlinked vault or app directory — a supported layout — could then not
  uninstall at all.** Recommendation: **no**.

**Binding on later rounds: a further alias finding that falls inside the
residual's definition is CLOSED BY CITING THE RESIDUAL, not by a fifteenth
revision of the deletion contracts.**

**Declaration count after round 14:** eighteen declarations over eleven criteria;
ten have a pre-measurable anchor, eight mutate code this package authors.

## Round 15 — Astra, 2026-09-18

- **Reviewed tip:** `89b2d919`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r15-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r15-astra-focus.txt`
- **Committed before adjudication at:** `69f49bb4`
- **Verdict:** `needs-attention` — *"the expanded protection set breaks supported
  symlinked-core uninstalls and strands credentials."*
- **`R-alias-outside-closure` HELD:** round 14's residual bounded the family as
  intended — **nothing was reported inside it**. The finding is the opposite
  failure, and that is the round's significance.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R15-1** | **Distinguish chain-link protection from shelf-subtree protection.** For the supported layout `<core>` → `/data/wienerdog`, **X17 (1a)**'s single-class closure put `/data/wienerdog` into the protected set, after which **X18** preserved **every** deletion target beneath it — `app`, `logs`, **`secrets`** — **even with both shelves absent**. A read-only model of the prescribed checks confirmed it, and the shipped symlinked-core tests require those contents removed. Meanwhile `uninstall.js:424` still deletes the manifest **unconditionally** after the sweep, so credentials and installed files are **stranded with no usable retry**. **Requires no concurrent mutation** and falls **inside** the declared chain-closure scope — i.e. it is a defect in the rule, not an instance of the residual | A | HEAVY (high, conf. 0.99) | **ACCEPTED IN FULL, as a two-class definition in X17 (1a).** **Class (i) — SHELF SUBTREES:** the two shelf roots' resolved targets, protecting **the node and every descendant**; X16/X18 apply containment **both ways**. **Class (ii) — CHAIN NODES:** every link **location** and intermediate target, protecting **the node and its ANCESTORS** but **not their unrelated descendants**; the check is *"the deletion target must not EQUAL or CONTAIN the node"*, with no containment the other way. Under the split `/data/wienerdog/secrets` is a **descendant** of a class (ii) node and is removed exactly as today, while a recursive delete of `/data/wienerdog` **itself** is still refused. **Verified against rounds 11–14's measured cases in the row itself**, because a rule that regresses one of them is not a fix: round 11's `cache` is a class (i) resolved target; round 12's `<core>/logs` is a class (ii) node the mechanics target **equals**; round 13's intermediate `skills/…` link is a class (ii) location `reverse()` targets **exactly**; round 14's `<state>/cache` **contains** a class (ii) location. **Acceptance criterion 2** gains the symlinked-core arms — absent **and** empty shelves, asserting `app`, `logs` and **`secrets`** are gone and the manifest removed **only** after that clean sweep. New RED proof **`quse-chain-node-over-protects`**: **every other declaration in this package proves something SURVIVES; this one proves something is still REMOVED** — the direction a protection package stops testing once it starts preserving |

### The second half of round 15's question, answered rather than confirmed

The round asked whether `uninstall.js:424`'s unconditional manifest delete after a
**preserving** sweep is already governed by **W2**/**W3**'s refusal. **It is not.**
W3's refusal is the **pre-plan gate**, and by `:424` it has already passed — so the
manifest delete is reached on every path where the live `disposeCoreMechanics`
preserved something **after** the gate: **X3**'s concurrent-dream window, an
UNANSWERABLE shelf level (**K4**), **X19**'s retained `<state>` alias, and
**X18**/**X20**'s preserved chain components. New **Table W row W10**: when the live
sweep returns a **non-empty `preservedQuarantine`**, the run **stops before `:424`**,
leaving the manifest and `config.yaml` in place and ending in the shape
`uninstall.js:428-432` already ships — *"uninstall partially completed; left
config.yaml and `<core>` in place so a retry stays safe"*. **Same lesson as X13, one
step later: preserving the user's text must never cost them the ability to finish.**
New acceptance criterion **19** measures the boundary from both sides, with RED proof
**`quse-manifest-deleted-after-preserve`** anchored on
`fs.rmSync(paths.manifest, { force: true });` (**1** at `5b77865f`).

**What round 15 says about the bound.** The residual held: no finding landed inside
it. What landed was the **mirror-image** failure — over-protection stranding a
credential — which is why **X21**'s in-scope statement now has a counterweight in
the security checklist: *a protection that strands a credential has failed in the
other direction.*

**Declaration count after round 15:** twenty declarations over thirteen criteria;
eleven have a pre-measurable anchor, nine mutate code this package authors.

## Round 16 — Astra, 2026-09-18

- **Reviewed tip:** `039d0483`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r16-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r16-astra-focus.txt`
- **Committed before adjudication at:** `905d8ac3`
- **Verdict:** `needs-attention` — *"late quarantine arrivals lose the retry ledger,
  and absent shelves can permanently block symlinked-state uninstall."*
- **Held from round 15:** the **two-class rule** was not re-opened, and **nothing
  inside `R-alias-outside-closure` was reported** for the second round running.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R16-1** | **Preserve retryability when the SECOND sweep keeps a quarantine.** Table W row **W10** (`:407`) checked only the **first** live sweep at `uninstall.js:408`. That sweep can return nothing, a concurrent dream then recreates the shelf through `quarantinePreserve`'s recursive `mkdirSync`, the manifest and `config.yaml` are deleted at `:424`, and the **second** sweep at `:467` preserves the new copy — after which a retry fails with *"no install manifest found"* **even once the user clears the shelf**. Acceptance criterion 9 explicitly covers arrivals during **either** sweep; W10 did not | B | **HEAVY** — it changes the ordering the implementer builds and leaves a user with no supported way to finish | **ACCEPTED IN FULL.** W10's check now sits **immediately before `:424`**, two statements from the `rmSync`, and consults **both** the `preservedQuarantine` of **every** live sweep so far **and a fresh `quarantineInventory(paths)` read taken at that moment**. **The `:467` call is NOT moved, and the row says precisely why** — round 16 asked: its only remaining job is removing the **now-empty core**, and the shipped comment states it (*"with the manifest + unmodified config deleted the core is now empty, so this removes it"*, `:463-466`), so it must stay after them. What moves is the **check**, not the call; the shelf-capable work of **X1** steps 0–3 is idempotent and already runs in both. **The window is narrowed, not closed, and both remainders are NAMED in new Table W row W11:** `R-post-ledger-preserve` (a preserve landing between the check and the `rmSync` — manifest gone, copy **preserved** by the `:467` sweep, core kept) and `R-post-uninstall-preserve` (a preserve landing after the last sweep — `mkdirSync(…, {recursive:true})`, `validate.js:953`, recreates the whole path, so the copy **succeeds** into a recreated core). **Both are LEFTOVERS, neither is a loss**, recovery is one `rm -rf`, and both require a dream **already running**, since the scheduler entries are reversed earlier in the same command. **Because recovery is a manual `rm -rf`, Table W row W8 must now name the preserved directory LITERALLY rather than count it** — a count would leave the user guessing at the one path they still need. Acceptance criterion **9** gains the after-the-first-sweep arm, driven through the seam **between** the sweeps; new RED proof **`quse-w10-checks-first-sweep-only`**, whose point is that **every earlier interleaving fixture stays green under it** because they all seed before the first sweep |
| **R16-2** | **Resolve the absent-shelf contradiction for a symlinked `state`.** For `<state>` → `/data/personal` with **no** `quarantine/`, **X17** still derived the anchors `/data/personal/quarantine` and its `redacted` child; **X19** then retained `<state>` because its target *contained* them, class (ii) protected the link as well, **the unlink branch became unreachable**, and with **W10** the uninstall **stopped repeatedly with nothing to clear** — contradicting acceptance criterion 14's required successful removal. Confirmed by a read-only containment model, with no concurrent mutation | B | **HEAVY** — it is a self-contradiction between two of this spec's own rows, and its effect is an uninstall that can never complete | **ACCEPTED IN FULL.** **X17 (1a)** gains its third distinction: an anchor derived through the nearest existing ancestor for a shelf that **does not exist** is **HYPOTHETICAL**, carries **class (ii) semantics only** — it stops a later recursive sweep from *covering* that location — and **never makes an alias "contain a shelf"** for **X19**'s retention test. An **EXISTING** chain keeps class (i) for its resolved target and class (ii) for its links. **So X19 retains a `<state>` alias only when an EXISTING shelf's chain passes through it; an absent-shelf alias is unlinked exactly as at `5b77865f`.** **And the shelf created after that unlink is still protected — established rather than asserted, and it is therefore NOT residual territory:** `quarantinePreserve` calls `fs.mkdirSync(qdir, {recursive: true, mode: 0o700})` (`validate.js:953`), which **recreates `<core>/state/quarantine/` as a real directory** even with `<state>` gone, and because the live disposer holds **no snapshot across calls** (**X2**) the next sweep computes its set afresh, sees a real non-empty shelf, and preserves it under **X1**. What remains in that case is **W11**'s `R-post-uninstall-preserve`. **Acceptance criterion 14 is reconciled and strengthened**: it now asserts the whole command **completes** on that layout — exit 0, link gone, core gone, manifest gone — and that a **second** run refuses with *"no install manifest found"* rather than with a preservation stop |

**On the bound.** For the second consecutive round **nothing landed inside
`R-alias-outside-closure`**. Round 15's finding was over-protection; round 16's were
an ordering gap and a self-contradiction. **W11's two residuals are recorded beside
X21's and under the same reasoning** — closing them needs an atomicity the platform
does not offer and a resident process ADR-0004 forbids — **and like it they are
closed by citation in a later round, not by a further revision.**

**Declaration count after round 16:** twenty-one declarations over thirteen
criteria; twelve have a pre-measurable anchor, nine mutate code this package authors.

## Round 17 — Astra, 2026-09-18

- **Reviewed tip:** `c45fd13f`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r17-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r17-astra-focus.txt`
- **Committed before adjudication at:** `dd500826`
- **Verdict:** `needs-attention` — *"the latest hypothetical-anchor rule reopens a
  path to deleting newly quarantined originals."*
- **Held from round 16:** **W10** and **W11** were not re-opened, and **nothing
  inside the three named residuals was reported** — the third consecutive round in
  which the bound held.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R17-1** | **Hypothetical shelf anchors must also protect future descendants — round 16's fix went one notch too far.** **X17** gave absent shelves **class (ii)** protection, which excludes descendants, while **X16** computes its anchors **once per `reverse()` call**. With a **stable** `<core>` → `/data/wienerdog` symlink and initially absent shelves, a pre-existing **hash-less** `{kind:'file'}` entry naming the **physical** path `/data/wienerdog/state/quarantine/2026-09-18-note.md` bypasses the lexical anchors **and**, once the dream creates that file **after anchor computation and before replay**, the hypothetical resolved ones too — the file neither equals nor contains them. A read-only mocked probe confirmed the predicate permits the entry and the shipped `reverse()` validates it and calls `rmSync`, destroying the sole original before the disposer runs. **No alias is created or redirected after computation, so `R-alias-outside-closure` does NOT cover it** | A | HEAVY (high, conf. 0.98) | **ACCEPTED IN FULL, and the correction is a narrowing of round 16's narrowing rather than a new rule.** **A hypothetical shelf ROOT keeps FULL class (i) SUBTREE protection — descendants included — in every deletion guard (X16, X18, X20).** **The ONLY thing conditioned on an EXISTING shelf is X19's alias-retention decision**, and **X19** now says so in its own cell, so the distinction lives in exactly one row. **Both neighbouring findings were re-checked in the same pass, because this is the third consecutive round to move this definition:** round 15 stays closed — on `<core>` → `/data/wienerdog` the hypothetical class (i) root is `/data/wienerdog/state/quarantine`, and `secrets`, `logs` and `app` neither equal it, contain it, nor sit inside it, so they are **still removed**; and round 16's contradiction stays removed, because it lived entirely in **X19** — with `<state>` → `/data/personal` and no `quarantine/`, no *existing* shelf's chain passes through the alias, so it is unlinked as at `5b77865f`, and the hypothetical root `/data/personal/quarantine` prevents nothing there since none of `<state>`'s children is inside it. **Acceptance criterion 14 was re-checked explicitly and holds unchanged.** Criterion **18(b)** gains the round-17 arm: **stable** symlinked core, shelves initially **absent**, a hash-less entry naming the **PHYSICAL** path, and the preserve completing **after `reverse()` initialises its anchors** — with the fixture required to use the physical path, because a `<core>`-relative one is caught by the lexical anchors and would make the arm vacuous. New RED proof **`quse-hypothetical-root-not-subtree`**: **nothing else in this package reddens under it**, since the lexical anchors still catch every `<core>`-relative path, so the declaration is what forces both fixture properties — physical path *and* late shelf creation — to exist |

**On the bound, third round running.** Rounds 15, 16 and 17 each landed on the
**rule**, not on the residuals: over-protection, a self-contradiction, and
over-narrowing. `R-alias-outside-closure`, `R-post-ledger-preserve` and
`R-post-uninstall-preserve` have drawn no findings. **What has moved three times is
the hypothetical/existing definition**, which is now confined to a single row
(**X19**) precisely so that a fourth move has one place to happen.

**Declaration count after round 17:** twenty-two declarations over thirteen
criteria; twelve have a pre-measurable anchor, ten mutate code this package authors.

## Round 18 — Astra, 2026-09-18

- **Reviewed tip:** `a6874cfa`, against base `5b77865f`.
- **Raw:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r18-astra-raw.json`
- **Focus:** `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-r18-astra-focus.txt`
- **Committed before adjudication at:** `b80dbb46`
- **Verdict:** `needs-attention` — *"alias removal can make a retry destroy a
  completed quarantine copy, and X17 still contains contradictory protection
  rules."*
- **Residuals:** nothing inside them for the fourth consecutive round.

| # | Finding | Band | Weight | Disposition |
|---|---|---|---|---|
| **R18-1** | **Absent-shelf alias removal loses protection across retries.** With a **pre-existing** `<state>` → `<core>/logs` alias and initially **absent** shelves, **X19** permitted the unlink. A concurrent dream completes `logs/quarantine/note` **after the absence decision and before that unlink**: the first sweep preserves `logs` from its **cached** protected set and **W10** correctly retains the manifest — but **on the retry `<state>` is gone**, the inventory misses the copy, the recomputed anchors no longer protect `logs`, and its recursive deletion destroys the original. Reproduced in an in-memory model. **No concurrent alias creation or redirection is required, so `R-alias-outside-closure` does not cover it**, and X17's own explanation covered only copies arriving *after* the unlink, missing this **before-unlink** window | A | HEAVY (high, conf. 0.97) | **ACCEPTED IN FULL, with the precise rule rather than the blanket one.** **X19 gains clause (b):** a `<state>` alias is **retained** when **either** an existing shelf's chain passes through it **(a)** **or its resolved target lies INSIDE any directory this uninstall sweeps (b)**. **The swept set is enumerated in the row** — `<core>/logs`, `<core>/schedules`, `<core>/secrets`, every child of `<state>` that **X1** step 2 removes, every **Table V** replay target, and **`<core>` itself**, the last included whole and deliberately conservatively because `reverse()` can delete a manifest-recorded path anywhere beneath it. **The blanket alternative — "never unlink an absent-shelf alias" — was refused and the refusal is recorded**: it re-opens round 16's contradiction and acceptance criterion 14 with it. **Why (b) is sufficient, as a by-construction argument rather than a timing one:** an alias whose target is outside every swept directory, with no existing chain, is unlinked as at `5b77865f`, and **nothing this uninstall will ever sweep lives there**, so a copy arriving late through that name is unreachable by any deletion this command performs, on this run or a retry. **Acceptance criterion 9** gains the before-the-unlink arm — **the only arm in this package that spans a full RETRY** — and **criterion 14**'s fixture must now place its target **outside every swept directory**, because that, not the shelf's absence, is what licenses its unlink. New RED proof **`quse-alias-into-swept-dir-unlinked`**: **under it the FIRST run still passes** and the loss appears only on the second command, so the declaration is what forces the fixture to re-run the whole uninstall |
| **R18-2** | **Remove the contradictory hypothetical-anchor classification.** **X17 (1a)** requires hypothetical shelf roots to keep full class (i) subtree protection, but its **concluding operative sentence in the same cell** still read *"treating a hypothetical anchor as class (ii) only"* — round 16's withdrawn clause. Following it restores the round-17 data-loss case **documented in that same row**, so the canonical contract pointed at both the repaired and the vulnerable predicate | C | LIGHT | **ACCEPTED IN FULL, and it is mine to own: I introduced it at round 17** by rewriting the cell around its ending and leaving the ending in place. That is exactly the failure `docs/runbooks/spec-authoring.md` names — *"the new sentence goes in, the old one stays, and no mirror checklist can see inside one cell"* — and the remedy it prescribes is the intra-cell **re-read**, which I did not perform. The clause is replaced with the class (i) rule, **existence is now stated to matter to Table X row X19 alone**, the cell carries a short note recording that it drifted, and **acceptance criterion 18(b) was re-verified against the single definition**. A whole-file re-scan for `class (ii) only` returns zero |

**Two further X19 mirrors found by my own post-edit sweep and updated in the same
commit.** **X10**'s step-0b clause and the Security checklist's symlink bullet both
still said the alias is unlinked *"when its target overlaps no protected shelf"* —
true before clause (b), wrong after it. Both now state the two-part test. A whole-file
re-scan for that phrasing returns zero.

**Process note worth keeping.** Round 18's LIGHT finding is the second intra-cell
drift in this gate (the first was **K7**'s title at round 7). Both were introduced by
*my own* revision of a cell, not by a reviewer's miss, and both were invisible to the
Mirrored Surface Checklist by construction. **The counter-measure is the re-read of
the whole cell after every rewrite**, and after round 18 that re-read is performed on
every cell this package touches in a round, not only on the clause being changed.

**Declaration count after round 18:** twenty-three declarations over thirteen
criteria; twelve have a pre-measurable anchor, eleven mutate code this package
authors.

**One confirming round remains.** The gate closes on a clean return, a LIGHT-only
return, **or a finding that falls inside `R-alias-outside-closure`,
`R-post-ledger-preserve` or `R-post-uninstall-preserve`**
(`docs/runbooks/codex-review.md`, "Weighted closure").
