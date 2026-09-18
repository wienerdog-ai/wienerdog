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

### What round 1 did **not** re-open

Owner items 1, 2 and 3 were not challenged, and neither was the amend-vs-supersede
recommendation, the refuse-and-report cell, the code-carve-out-vs-manifest-kind
choice, or the composition rules of Table W row **W7**. All stand as written.

**A further round is required**, on the rewritten Table X row **X1** above.
