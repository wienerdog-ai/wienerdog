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

**One confirming round remains.** The gate closes on a clean or LIGHT-only return
(`docs/runbooks/codex-review.md`, "Weighted closure").
