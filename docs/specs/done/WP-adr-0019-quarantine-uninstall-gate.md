---
id: WP-adr-0019-quarantine-uninstall-gate
title: Stop `wienerdog uninstall` destroying the secret quarantine — the ADR-0019 amendment and the pre-deletion gate
status: Done
model: opus
size: M
depends_on: [WP-secret-fence-ep2-redact-arm, WP-scheduler-replay-manifest-independent, WP-quarantine-only-copy-shelf]
adrs: [ADR-0004, ADR-0019, ADR-0024, ADR-0031, ADR-0034, ADR-0035, ADR-0038, ADR-0041, ADR-0042]
epic: secret-lifecycle
---

# WP-adr-0019-quarantine-uninstall-gate: stop uninstall destroying the only copy of the user's own text

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **PACKAGE A OF TWO, split on 2026-09-18 after the design gate closed at round 22.**
> The gate ran on one document, `docs/specs/WP-adr-0019-quarantine-uninstall-export.md`,
> which reached ~1,950 lines, six canonical tables and 26 RED declarations — past
> what CLAUDE.md sizes as one implementer session. **This package is the GATE:** it
> adds `quarantineInventory`, makes `wienerdog uninstall` **refuse** instead of
> destroying, amends ADR-0019, and re-derives the two user-facing sentences.
> **It changes no deleter** — `disposeCoreMechanics` and `reverse()` are untouched —
> which is why it is safe on its own and **strictly better than `main`**, where the
> shelf is destroyed unconditionally and silently.
>
> **Its sibling is `docs/specs/WP-uninstall-shelf-deletion-guards.md` (package B)**,
> which carries the deletion-side contracts (Tables **X** and **V**, rows **W8**,
> **W10**, **W11**, **Y6**, **Y9**, **Y10**, owner item 4 and the three named
> residuals) and `depends_on` this package. **Row ids are unchanged across the
> split**, so every disposition from the 22 rounds still resolves.
>
> **The one residual this package accepts on its own** is Table X row **X3**'s
> concurrent-dream window, recorded in package B: the gate runs once, before the
> plan, and a dream completing a preserve after it still meets the shipped,
> unguarded `disposeCoreMechanics`. **That is not a regression** — it is today's
> behaviour, narrowed — and closing it is exactly what B does.
>
> **Errata, 2026-09-21 (post-merge) — ONE SPLIT-ERRATA PASS. None is a defect
> in what shipped.**
>
> **Landed in PR #309** (merge `8b4cbd4c`, 2026-09-21 09:12:37 UTC), tip
> `0458b6a9`, branch `wp/adr-0019-quarantine-uninstall-gate`, base `1d8d4743`.
> **THREE gate rounds plus a LIGHT round 3b.** Round 3 on `3cbb611c`:
> wd-reviewer (spec fidelity) **APPROVE** — ruling R-Y1 executed over **30
> scenarios** (depth 1–3 under both roots, file and directory, `readdir` and
> `lstat` faults) plus a **24-shape Y1 leak fuzz** with tokens in basenames and
> contents, **zero leaks**, only shelf roots named, de-duplicated; R-K's file,
> symlink and fifo blockers each yielding the actual path, with the printed
> remedy **executed** and the re-run completing; R-W4-win32 verified against
> **PowerShell's own `[Parser]::ParseInput`** for both lines over a path
> carrying `'`, `$x`, backticks and `"`, and the POSIX lines round-tripped
> through `/bin/sh`; R-QU7 with **no skip** and ubuntu CI green; all eleven
> `scheduler-replay` declarations swept against the `[QU-*]` suite with none
> reddening; `gateStrings()` proven product-derived by mutation; six RED sets
> observed = declared; W6 byte-identical to the **real** base on four surfaces;
> the ADR-0019 amendment byte-exact; `src/` removing exactly two
> `module.exports` lines; no owner claim. The independent gate raised three
> Windows-portability P2s, one of them a **real defect for a valid Windows
> path**: `psQuote` doubled only U+0027, while PowerShell also closes a
> single-quoted string on U+2018, U+2019, U+201A and U+201B, so an ordinary
> folder name like `O’Connor` ended the quoting early and left the rest of the
> path as bare code inside `Remove-Item -Recurse -Force`. Closed in round 3b by
> ruling **R-QU7′**'s quoting clause (`PS_QUOTE_CHARS`, all five doubled), with
> the orchestrator re-rendering the win32 line for a shelf path under a
> Windows home directory carrying all five PowerShell single-quote delimiters
> plus `$x`, a backtick-substitution and a double quote, and parsing it
> with PowerShell's own parser: **0 parse errors, `-LiteralPath` `-ceq` the
> literal target: True.** CI on `0458b6a9`: seven checks pass.
>
> **Red-proofs verdict, and exactly what it covers.** The implementer's
> **UNFILTERED** `npm run red-proofs` on the round-3 tip `3cbb611c`:
> `RUN: PROVEN`, **all six declarations PROVEN**, and **no** `FAILED`,
> `VACUOUS`, `UNCONTROLLED` or `FILTERED` verdict anywhere in the run. It was
> **not re-run for round 3b**, and the PR body says so: **none of the six RED
> `find` anchors moved** — `psQuote` is not an anchor and no declaration mutates
> it — so the six declared sets stand as measured at round 3. That is the
> verdict this record claims. Round 3b's own verification on the tip:
> `npm test` 3023 tests / **0 fail** / 12 skipped, `npm run lint` passed,
> `boundary-check` exit 0, `git status --porcelain tests/golden/` empty, all 12
> commands of this spec's literal verification block exit 0.
>
> **Owner item 1 shipped under the standing process. The ADR-0019 amendment is
> on `main` reading `Status: **ACCEPTED under standing authorization 2026-09-18
> — owner signature pending.**` (`docs/adr/0019-…:88`).** Nothing in this
> repository records the owner approving, accepting, ratifying or signing it.
> Owner items 2 and 3 remain open in the standing form.
>
> ---
>
> **THE SPLIT-ERRATA PASS — what this is, and why it is one pass.**
>
> This spec is one half of a design-gate document that was split in two; the
> other half is `WP-uninstall-shelf-deletion-guards`, which owns every **deleter**
> (`disposeCoreMechanics`, `reverse()`'s guard, the sweep) and the return fields
> `preservedQuarantine` and `shelfGuarded`. **The acceptance criteria are the
> surface the split leaked through.** Contract rows were re-homed with their ids
> intact, but four criteria and one table cell still describe the sibling's
> return fields — and **this package's own verification block contains a
> `! grep preservedQuarantine` step that exists precisely to reject them**, so
> the criteria as filed could not all be satisfied at once. On top of that, the
> split renumbered the acceptance criteria from the unsplit document and **every
> cross-reference to a criterion number stayed at its old value**, including
> Table B's entire `Criterion` column. All of it is corrected here in one pass
> (update-all-mirrors), and the two surfaces that carried criterion numbers
> without being registered are added to the Mirrored Surface Checklist in the
> same pass (register-new-mirrors). Nothing shipped wrong: the implementer read
> the gate-side-only reading, which the fidelity gate ruled the only consistent
> one, and re-derived every `criterion` field against this file's numbering
> before writing the JSON — as Table B told it to.
>
> **Erratum 1 — four acceptance criteria carry deletion-side clauses that
> belong to `WP-uninstall-shelf-deletion-guards`.** *What is wrong, clause by
> clause:* **criterion 4**'s final clause (*"still prints today's plan — in
> which `<state>` no longer appears under the machine-generated-state heading
> and the preserved shelf does"*) asserts the sibling's carve-out and its
> `preservedQuarantine` rendering; **criterion 5**'s Table **X4** attribution
> and its `Removed N item(s)` granularity clause are the sibling's row and the
> sibling's deleter; **criterion 6**'s final sentence (*"**And at the deleter:**
> `disposeCoreMechanics` given the same injected failure **preserves** `<state>`
> and reports it in `preservedQuarantine`"*) names a return field this package
> does not introduce; **criterion 11**'s arms **(b)** and **(c)** drive *"X1
> step 2"* — the sibling's sweep — and assert `preservedQuarantine` and the
> `ENOTEMPTY` rule. *What is true:* this package's Deliverables row for
> `src/core/manifest.js` says *"add and export **`quarantineInventory` ONLY**"*
> and that `disposeCoreMechanics`, `reverse()` and every other deleter *"stay
> byte-unchanged"*; the gate-side reading is the only one consistent with that
> boundary and with the `! grep preservedQuarantine` step. *Routing:* **the
> deletion-side clauses are struck from all four criteria and re-pointed at the
> sibling by name**, so the criterion states what this package can observe and
> the reader is told where the other half lives. **Class: a split that moved
> the contract rows and left the criteria behind.**
>
> **Erratum 2 — Table W row W5's cell asserts, for this package alone, a plan
> change this package does not make.** *What is wrong:* W5 says the plan
> *"correctly no longer lists `<state>` under 'Machine-generated state …' and
> instead lists the preserved shelf from `preservedQuarantine` (**X4**)"*. *What
> is true:* `preservedQuarantine` is the sibling's field and the carve-out is
> the sibling's change; **for this package alone the `--dry-run` plan below the
> block is today's plan, unchanged, `<state>` line included.** *Routing:* **the
> cell is split** — its first half (the block, the "a real run stops here" line,
> the "then today's plan" statement) stays canonical here; its second half (what
> the plan then says about `<state>`) is marked as the sibling's and deferred to,
> exactly as the note under Table W already does for rows W8, W10 and W11.
> **Class: a canonical cell describing the joint document's end state rather
> than this package's.**
>
> **Erratum 3 — every criterion cross-reference in this spec is still in the
> UNSPLIT document's numbering.** *What is wrong, and what is true* — all
> re-derived against this file's own list: criterion **2**'s *"Criterion 3 holds
> identically"* → **criterion 1**; criterion **4**'s *"the same counts and byte
> total as criterion 3's refusal"* → **criterion 1's**; Table Y row **Y1**'s
> *"Asserted, not assumed — acceptance criterion 5"* → **criterion 3**; Table Y
> row **Y7**'s *"(acceptance criteria 3 and 4)"* → **criteria 1 and 2**; owner
> item 2's *"acceptance criteria 3 and 4 flip"* → **criteria 1 and 2**; the
> **Platform scope** section's *"the **unreadable** fixture of criterion 8"* →
> **criterion 6**. *Routing:* **corrected in place, all six.** **Class: a split
> that renumbered a list and left its citers pointing at the old numbers.**
>
> **Erratum 4 — Table B's `Criterion` column is wrong in every row, and its
> own footnote says so without fixing it.** *What is wrong:* the column reads
> 3, 4, 8, 7, 6 and "**15**, 9", followed by a note that *"Criterion numbers in
> the table above are the UNSPLIT document's"* and that the implementer
> re-derives them. *What is true:* the implementer did, and the shipped
> `tests/red-proofs/adr-0019-quarantine-uninstall-gate.proofs.json` on
> `origin/main` at `8b4cbd4c` carries **1, 2, 6, 5, 4 and 11** for
> `quse-refusal-not-raised`, `quse-yes-skips-the-refusal`,
> `quse-unreadable-shelf-read-as-empty`, `quse-block-printed-on-an-empty-shelf`,
> `quse-dry-run-block-suppressed` and `quse-shelf-name-case-sensitive`
> respectively. Leaving a canonical column wrong and delegating the fix to the
> implementer is the failure mode ADR-0031 exists to stop: the table stopped
> being the place the fact is decided. *Routing:* **the column is corrected to
> the shipped values and the delegating footnote is withdrawn**; the
> `What it proves` cells' criterion references are re-derived with it.
> **Class: a canonical column knowingly left stale.**
>
> **Erratum 5 — Table B's prose miscounts its own anchor classes, and one
> anchor cell is falsified by what shipped.** *What is wrong:* *"Six
> declarations over six criteria: **five** carry a pre-measurable anchor and
> **one** mutates code this package authors"*, and
> `quse-dry-run-block-suppressed`'s anchor cell names
> `` `item(s) would be removed, ${skipped.length} skipped.` — **1** ``. *What is
> true, measured against the base `1d8d4743` and the shipped declarations:*
> **three and three.** Pre-measurable at the base (`grep -Fc` = 1 each):
> `const vaultPath = readVaultPath(paths.config) || paths.vault;`,
> `const yes = argv.includes('--yes');`, and
> `console.log('wienerdog uninstall — the following will be removed:\n');`.
> **New, authored by this package** (`grep -Fc` = 0 at the base):
> `if (unreadable.some((u) => u.dir === reportAs)) return;` +
> `unreadable.push({ dir: reportAs, code });`,
> `console.log(quarantineBlock(quarantine, paths));`, and
> `if (asciiFold(name) !== QUARANTINE_DIRNAME) continue;`.
> `quse-dry-run-block-suppressed` could not use the headline line as its anchor:
> W5 puts the block **before** the headline, so a `find` built around the
> headline cannot suppress the block — the declaration mutates the `--dry-run`
> arm of the gate **this package authors**, which is why it proves. *Routing:*
> **the prose is corrected to three-and-three and that anchor cell to "new —
> authored by this package"**, matching the two cells that already read that
> way. **Class: a canonical table's prose counting rows the table itself
> contradicts.**
>
> **Erratum 6 — the base pin is `1d8d4743`, not `5b77865f`.** *What is wrong:*
> twelve places pin citations, byte-identity and anchor counts to `5b77865f` —
> including Table W row **W6** (*"`disposeCoreMechanics` behaves as at
> `5b77865f`"* and the byte-identity sentence), acceptance criterion **5**, and
> Table B's *"Each anchor is `grep -Fc` over the named file at `5b77865f`"*.
> *What is true:* the package was dispatched onto `1d8d4743` (PR #306's merge)
> and rebased onto it during round 1, and the round-2 fidelity gate established
> W6's byte-identity **against that real base** on four surfaces. *Routing:*
> **re-pinned in place to `1d8d4743` everywhere the pin is a claim about this
> package's base.** **Class: a base pin that moved under the package during
> dispatch.**
>
> **Erratum 7 — Current-state item 2 assigns this package a JSDoc correction
> its Deliverables forbid.** *What is wrong:* item 2 says
> `disposeCoreMechanics`'s JSDoc sentence at `manifest.js:1112-1116` is *"false
> on this tree and must be corrected by this package (Table X row **X9**)"*.
> *What is true:* Table X is `WP-uninstall-shelf-deletion-guards`'s table, and
> this package's Deliverables row says `disposeCoreMechanics` stays
> **byte-unchanged**. *Routing:* **corrected in place** — the sentence is still
> false, and the correction is the sibling's, by name. **Class: a split leaking
> through a Current-state observation as well as through the criteria.**
>
> **Erratum 8 — Table W row W9's prescribed runbook sentence is unscoped, and
> the shipped one is scoped.** *What is wrong:* W9 says the sentence is replaced
> by one saying `wienerdog uninstall` *"**will not remove this folder**: it
> stops and asks the user to move or delete these files first"*. *What is true:*
> unqualified, that is false — an **empty** shelf is removed exactly as before
> (Table W row W6, Table K row K3's EMPTY arm). The shipped sentence carries the
> scope: measured on `origin/main` at `8b4cbd4c`,
> `docs/runbooks/secret-incident.md` reads *"And `wienerdog uninstall` will not
> remove this folder: **while either quarantine folder still holds a file**, it
> stops and asks you to move those files somewhere you keep, or delete them,
> first — so uninstalling cannot lose them."* *Routing:* **W9's cell is
> corrected to the scoped wording that shipped.** The two user-facing files are
> **not** edited by this filing — the text that shipped is right; only the
> spec's account of it was. **Class: a canonical cell stating a universal its
> own sibling row excepts.**
>
> **Erratum 9 — Table K row K2 does not decide a root-position non-directory's
> BYTE contribution, and ruling R-K′ needs it to.** *What is wrong:* K2 says a
> *"symlink, file or any non-directory occupying either root path counts as one
> entry"* and stops there; ruling **R-K** then says a blocker contributes **0
> bytes**, and ruling **R-K′** says a non-directory at the
> `<quarantine>/redacted` position is instead *"an ordinary entry under
> `quarantine` … one entry; a regular file contributes its size"*. The two rules
> are different and K2 carried neither. *What is true, and now stated in K2:*
> at the **`<state>/quarantine`** position a non-directory is a **blocker** — one
> entry, **0 bytes**, its actual path reported in `blockers`; at the
> **`<quarantine>/redacted`** position it is an ordinary entry under
> `quarantine` — one entry, and a regular file **contributes its size**. The
> asymmetry is deliberate and R-K′ gives the reason: at the outer position there
> is no shelf root for the remedy to name, at the inner one there is.
> *Routing:* **folded into Table K row K2, with R-K and R-K′ as its registered
> mirrors.** **Class: a canonical cell thinner than the rulings that amend it.**
>
> **Erratum 10 — Table W row W4's remedy destination is easy to confuse with a
> declined owner-item candidate, and the spec never separates them.** *What is
> wrong:* ruling R-W4-win32 fixes the remedy's first line as
> `mv '<p>' ~/wienerdog-quarantine` (POSIX) / `Move-Item -LiteralPath '<p>'
> -Destination "$HOME\wienerdog-quarantine"` (win32), while **owner item 2
> candidate (b)** — *a fixed location in HOME* — was weighed and **not taken**.
> *What is true, and now said in one clause:* these are different things. The
> remedy line is a **copyable suggestion the USER executes**; **Wienerdog writes
> nothing there and creates nothing there** (Table W row W1: *"nowhere.
> Wienerdog writes no copy of its own"*, and Table Y row **Y2**: under W1's cell
> there is *"no export, no new file, no new directory, no new permission
> decision"*). Owner item 2 candidate (b) was about **the product** copying the
> shelf to a fixed HOME location, which would engage Table Y row **Y3**'s whole
> binding contract. *Routing:* **the clause is added to W4 beside the remedy.**
> **Class: two surfaces naming the same path for opposite reasons, with nothing
> saying they are different.**
>
> **Routed to the sibling, not done here.** The gate also flagged
> `docs/GLOSSARY.md`'s *"disposable"* clause: `WP-quarantine-only-copy-shelf`
> (row O8b) and this package both edit the `secret quarantine` entry, and their
> ranges overlap on paper — W9's own cell flags this. Both clauses landed and
> neither collided. `docs/GLOSSARY.md` and `docs/runbooks/secret-incident.md`
> are **not** touched by this filing.
>
> **Reviewer notes, non-errata** (recorded rather than dropped). (a)
> `countShelfTree` has no depth bound; unreachable under `PATH_MAX`. (b) One of
> five `GATE_STRINGS` was a string the product never emits, making that arm of
> `[QU-5]` vacuous — fixed in round 3 by rendering the product through
> `gateStrings()` instead of transcribing it, and proven product-derived by
> mutation. (c) `[QU-7]` ships **no control arm**, recorded in the PR body
> rather than left as a silent deletion: the boundary forbids the sibling
> package's cell that would have been its control. (d) For `quarantine` and
> `redacted` specifically, an explicit ASCII fold and
> `String.prototype.toLowerCase` are **observationally identical** — the
> implementer swept U+0080–U+10FFFF for a code point whose `toLowerCase()` is a
> single ASCII character occurring in either name and found **zero hits**, and
> the fidelity gate reproduced the sweep. K8's rule is a correct defensive
> constraint rather than an observable behaviour, and its reddening evidence is
> the byte-equality mutation. (e) `tests/unit/uninstall.test.js` cannot be run
> with a bare `node --test`: `tests/run.js` sets
> `WIENERDOG_TEST_NO_REAL_SCHEDULER`, and a direct run fails a pre-existing
> guard test unrelated to this package — reproduced on `origin/main`.
>
> **Line numbers in this spec's PR body are stale** against the landed tree and
> were not swept; the spec's own cites are re-pinned by erratum 6 and by the
> construct-adjacent form the Definition of done already requires.

<!-- the errata block ends above; the spec as it shipped follows -->

> Every code citation is pinned to **`1d8d4743`** — the real dispatch base,
> re-pinned at the done-flip (erratum 6; the spec as filed said `5b77865f`) — and
> was read construct by
> construct at that commit.

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

Everything below was read at `1d8d4743`. `src/core/manifest.js` and
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
   spanning **`:1112-1116`** — which is **false on this tree**. *(Done-flip
   erratum 7: this read "must be corrected by this package (Table X row
   **X9**)". Table X is `WP-uninstall-shelf-deletion-guards`' table and this
   package's Deliverables row keeps `disposeCoreMechanics` byte-unchanged — the
   sentence is still false, and the correction is the sibling's.)*
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
| modify | src/core/manifest.js | add and export **`quarantineInventory` ONLY** (Table K, including Table K row **K8**'s ASCII fold). **`disposeCoreMechanics`, `reverse()`, `contains`, `withinSchedulerRoot`, `withinAllowedRoot`, `validateEntry`, `isDir` and everything `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged** — every deleter belongs to `WP-uninstall-shelf-deletion-guards` |
| modify | src/cli/uninstall.js | call `quarantineInventory` **once, before anything is printed** (**K5**); raise the refusal (**W2**/**W3**/**W4**); print the `--dry-run` block (**W5**). `requireDeletionClearance`, the byte-exact manifest compare, the `vaultPath` read at `:309`, the closing summary and every line `WP-scheduler-replay-manifest-independent` adds stay byte-unchanged (**W7**) |
| modify | tests/unit/uninstall.test.js | the refusal with and without `--yes`, the no-filename/no-content assertion (**Y1**), `--dry-run` (**W5**), the empty- and absent-shelf byte-identity (**W6**), the unreadable-shelf abort (**K4**), the case-folded shelf name (**K8**), and the ordering assertion of **W7** |
| modify | tests/unit/manifest.test.js | `quarantineInventory`'s four outcomes (**K3**) **including the both-shelf-directories-empty fixture** (**K2**), the fold (**K8**), and the Table Y rows that are unit-observable |
| create | tests/red-proofs/adr-0019-quarantine-uninstall-gate.proofs.json | the declared RED proofs of Table B (ADR-0042) |
| modify | docs/adr/0019-uninstall-disposes-core-mechanics.md | **owner item 1 only** — the dated amendment appended verbatim, plus the one pointer line inserted after `:54`. `Status: Accepted` (`:3`), `Date: 2026-07-06` (`:4`) and the invariant paragraph (`:52-54`) are **never** touched, moved or reformatted (ADR-0035) |
| modify | docs/runbooks/secret-incident.md | **one sentence** — the `wienerdog uninstall` sentence at `:61-63` (**W9**). No other edit to this file |
| modify | docs/GLOSSARY.md | **one clause** — the `wienerdog uninstall removes it …` clause inside the `secret quarantine` entry (**W9**). No other edit to this file |

### Exact contracts

```js
// src/core/manifest.js — NEW export. THE ONLY change this package makes there.
/**
 * Inventory the secret quarantine under this core (Table K). READ-ONLY: a
 * non-following walk (`readdirSync({withFileTypes:true})` + `lstatSync`) of
 * <paths.state>/quarantine. It NEVER opens a file and never reads a byte of one
 * (K6), and it NEVER follows a symlink. It never throws: any enumeration or stat
 * failure is REPORTED in `unreadable` (K3/K4). The shelf directories are located
 * by ASCII CASE FOLD of their names (K8), never by byte equality.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{roots: Array<{dir:string, entries:number, bytes:number}>,
 *            entries:number, bytes:number,
 *            unreadable: Array<{dir:string, code:string}>, blockers: string[]}}
 *   `roots` — the shelf directories that EXIST as directories, in the fixed
 *     order [<state>/quarantine, <state>/quarantine/redacted], each with the
 *     counts of what it holds; an absent root is omitted. **A root itself is
 *     never counted** (K2).
 *   `entries`/`bytes` — totals over the whole walk; `bytes` sums regular files'
 *     `size` only. Two empty shelf directories give `entries: 0`.
 *   `unreadable` — non-empty means the shelf's state is UNKNOWN, and at the gate
 *     that ABORTS a non-dry-run uninstall (K4). Every `dir` is a SHELF ROOT or
 *     `<state>` itself, de-duplicated (ruling **R-Y1**).
 *   `blockers` — the actual on-disk path of every non-directory found at a
 *     shelf-root position; one entry each, 0 bytes, no `roots` row
 *     (ruling **R-K**).
 */
function quarantineInventory(paths)
```

**Worked example.** `HOME=/tmp/h`, core `/tmp/h/.wienerdog`. The withheld shelf
holds `2026-07-01-tooling.md` (812 bytes) and the redacted shelf holds
`2026-07-02-fp.md` (1 240 bytes) and `2026-07-03-fp.md` (990 bytes):

```
quarantineInventory(paths)  ->  {
  roots: [
    { dir: '/tmp/h/.wienerdog/state/quarantine',          entries: 1, bytes:  812 },
    { dir: '/tmp/h/.wienerdog/state/quarantine/redacted', entries: 2, bytes: 2230 },
  ],
  entries: 3, bytes: 3042, unreadable: [],
}
```

A non-dry-run `wienerdog uninstall` — **with or without `--yes`** — then prints the
refusal of **W4** and exits non-zero, having removed nothing. `--dry-run` prints the
same block, says a real run stops there, and then prints the rest of today's plan
(**W5**).

**The emptied-shelf case, which is the state the refusal asks the user to reach.**
With both shelf directories present and holding **nothing**, the roots themselves are
not counted (**K2**), so `entries: 0`, the outcome is **EMPTY**, the uninstall
**proceeds**, and **the run's complete output is byte-identical to `1d8d4743`**
(**W6**).

## Contract reference

**Activation trigger (ADR-0031's 2-of-7 test) — six of seven fire.** (i) a new
interface **shape**; (ii) a **result taxonomy** — the inventory's four outcomes;
(iv) **refusal and precedence** behaviour; (v) an **authority boundary** — the dream
gate writes the copies, `uninstall` owns their lifecycle; (vi) **downstream
consumers** — `WP-uninstall-shelf-deletion-guards` inherits every row here; (vii) the
same facts appear in the Deliverables notes, the acceptance criteria, the
verification greps and the operative prose.

**NAMESPACE WARNING.** This spec's canonical tables are **K**, **W**, **Y** and
**B**. Tables **X** and **V**, and rows **W8**/**W10**/**W11**/**Y6**/**Y9**/**Y10**,
are canonical in `docs/specs/WP-uninstall-shelf-deletion-guards.md` and are **cited,
never restated, here**. Citations to other documents are always package-qualified:
`WP-secret-fence-ep2-redact-arm`'s **Table Q**/**Table N**;
`WP-quarantine-only-copy-shelf`'s **Table O**;
`WP-scheduler-replay-manifest-independent`'s **Tables D**, **R** and **S**.

### Table K — the shelf inventory (canonical)

| Row | Fact | Value |
|---|---|---|
| **K1** | **The two shelves, and how their paths are fixed** | `<state>/quarantine` and `<state>/quarantine/redacted`, where `<state>` is `paths.state` = `path.join(core,'state')` (`src/core/paths.js:70`). The **canonical** paths are literal joins of a path this package already owns: `path.join(paths.state,'quarantine')` and `path.join(that,'redacted')` — those are what `quarantinePreserve` writes and what Table X row **X1** step 3 removes. **The inventory LOCATES them by enumerating `<state>` and selecting the children whose names ASCII-case-fold to `quarantine`, then `redacted` inside each** (Table X row **X12**), because on a case-insensitive volume the stored name may be `Quarantine` while the lowercase path resolves to it; `roots` reports each by its **actual on-disk path**, so the plan names what exists. **No ambient value, env var or manifest field contributes to any of it** — the only names used are ones that already matched a closed, anchored set — which is why no containment or resolution question arises (Table X row **X7**) |
| **K2** | **What is counted — and the TWO SHELF ROOTS THEMSELVES ARE NOT** | *Amended at PR-gate round 3 — see the end of this section.* *Rewritten at design gate round 1, finding 2.* **The two shelf root directories — `<state>/quarantine` and `<state>/quarantine/redacted` — contribute ZERO entries when each is a real directory.** They are created by `quarantinePreserve`'s `mkdirSync` (`validate.js:950`), not by the user, and they outlive their contents: counting them would make a user who has deleted every quarantined file face a refusal **forever**, which contradicts Table K row **K3**'s EMPTY arm and the worked example, and would turn this package's protection into a permanent block on uninstalling. **Everything else counts, conservatively:** every regular file (contributing its `size` to `bytes`), and **every other entry of any type at any depth — any further directory, any symlink, any socket or fifo — contributing 0 bytes but 1 entry and making the shelf NON-EMPTY.** The exclusion is by **path and type together**: a **symlink, file or any non-directory occupying either root path counts as one entry**, because it is not the product's directory, it is something else sitting where the product's directory should be. **Its BYTE contribution differs by which root position it occupies, and the two rulings below decide it (folded in at the done-flip, erratum 9, because this cell carried neither):** at the **`<state>/quarantine`** position it is a **blocker** — one entry, **0 bytes**, its actual on-disk path reported in `blockers` (ruling **R-K**); at the **`<quarantine>/redacted`** position it is an ordinary entry under `quarantine` — one entry, and a **regular file contributes its size** (ruling **R-K′**). The asymmetry is deliberate and R-K′ gives the reason: at the outer position there is no shelf root left for the remedy to name, at the inner one the quarantine root exists and removing it removes the blocker — **and Table X row X10 gives that same object the matching treatment in the sweep: preserved, never followed, never removed**. An entry at or under `<quarantine>/redacted` counts toward the `redacted` root's row; every other entry counts toward `quarantine`'s. `lstat` throughout: a symlink is counted and **never followed**, so a planted link cannot make the walk descend outside the shelf or loop |
| **K3** | **The four outcomes** | **ABSENT** — `<state>/quarantine` does not exist (`ENOENT`/`ENOTDIR` from `readdir` or `lstat`): contributes nothing, is not an error, produces no block and no refusal. A root Wienerdog never wrote to is genuinely empty. **EMPTY** — it exists and the walk finds zero entries, **which by K2 includes the state in which BOTH shelf directories are present and hold nothing at all**: identical treatment, and this is the state a user reaches by doing exactly what the refusal asked of them. **NON-EMPTY** — at least one entry: Table W applies. **UNREADABLE** — any other error code (`EACCES`, `EPERM`, `EIO`, `ELOOP`, `EMFILE`, …) from any `readdir` or `lstat` in the walk: the shelf's state is **UNKNOWN**, recorded as `{dir, code}` in `unreadable` |
| **K4** | **UNREADABLE is never EMPTY — one rule, two sites, both preserving** | This is the fail-open direction and it is the one that destroys data: an `EACCES` read as "nothing on the shelf" would let the gate pass and `disposeCoreMechanics`'s `rmSync({force:true})` — which reports nothing — take the tree anyway. The rule is therefore stated once and **what it maps to differs by site, always toward preservation**: **at the gate** (Table W row **W3**), a non-empty `unreadable` **ABORTS** a non-dry-run uninstall before any disclosure and before any deletion, naming each directory and its `code`; **inside `disposeCoreMechanics`, AT A SHELF LEVEL ONLY** (an `lstat` failure in **X11**'s validation pass, or an `rmdirSync` failure in its removal pass), it **PRESERVES** — the level and its ancestors are left in place and reported in `preservedQuarantine` — because that function runs mid-uninstall, where an abort leaves a half-reversed install, and because the only outcome of preserving is that more of the user's text survives. **This arm is scoped to the shelf and it is Table X row X13 that scopes it:** a failure enumerating `<state>` itself, or removing any non-shelf child, `logs/`, `schedules/` or `secrets/`, **still throws out of the function exactly as at `1d8d4743`** — round 5 found that a blanket no-throw reading would swallow an `EPERM` on `secrets/`, strand a credential, and then let the manifest be deleted so the retry could not run. `--dry-run` does **not** abort at either site; it prints the unreadable directories and continues, because it deletes nothing. **This is `WP-scheduler-replay-manifest-independent`'s Table D rows D9 and D15 applied to this walk**, with the same reason and the same single special case (absence) |
| **K5** | **When the gate's inventory runs** | **Exactly once per `uninstall` invocation, before anything is printed** — before the manifest headline (`uninstall.js:311`), before `WP-scheduler-replay-manifest-independent`'s schedule discovery and therefore before its D9 abort (Table W row **W7**). That single result is the only one the **gate** ever uses. **The `dryRun: true` planner of Table X row X15 calls the same function again, read-only**, and its result is a **prediction**, never a consent figure; nothing is deleted on that path, so a second read cannot widen anything |
| **K6** | **The inventory never reads a file's CONTENTS** | `readdir` + `lstat` only. Nothing opens a shelf file, so no shelf byte can reach stdout, a log, an error message or an argv (Table Y row **Y1**). `bytes` comes from `lstat`'s `size`, which is metadata |
| **K7** | **The LIVE deleter takes NO inventory — there is no second number to diverge** | *Rewritten at design gate round 1, finding 1.* An earlier revision had `disposeCoreMechanics` run its own inventory and branch on it; that is a snapshot, and a snapshot narrows the race rather than closing it. **Under Table X row X1 the LIVE deleter performs no emptiness test at all** (the `dryRun: true` planner is Table X row **X15** and deletes nothing, so it is exempt): it never deletes a shelf file, and it removes each shelf directory with a single non-recursive `rmdirSync`, whose own atomic failure on a non-empty directory *is* the test. So the gate's number is the only number **that anything acts on**, it is purely a **disclosure** figure, and what survives is decided at deletion time by the kernel. *(Table X row **X15**'s `dryRun: true` planner reads the inventory again, but it deletes nothing and produces a prediction, not a second consent figure.)* Consent integrity holds without a byte-compare and in the strongest form available: **nothing the user was not told about is ever deleted, and the only thing that can change after the disclosure is that more of their text survives** |
| **K8** | **SHELF IDENTITY IS DECIDED BY CASE-FOLDED NAME, ON EVERY PLATFORM — never by byte-equal name** | *Carried into this package at the 2026-09-18 split; it is the inventory half of Table X row **X12**, which is canonical in `WP-uninstall-shelf-deletion-guards` for the deleters and cites this row for the inventory.* **Two of the three supported platforms have case-insensitive filesystems by default** — APFS on macOS, NTFS as Windows configures it — while ext4 is case-sensitive. On a case-insensitive volume a directory listed by `readdirSync` as **`Quarantine`** **is** the object `quarantinePreserve`'s lowercase `path.join(stateDir,'quarantine')` opens and writes into (`validate.js:948-951`), because the kernel resolves the lowercase path to it, while enumeration still returns the stored capitalized name. A byte-equality test therefore **fails to recognize our own shelf** and the inventory reports it EMPTY. **The rule:** `quarantine` and `redacted` are matched by an **ASCII case fold** — map only `A`–`Z` to `a`–`z`, every other byte matching exactly. **That set is closed and it is an enumeration of our own good:** our directory names are pure ASCII with no combining marks, so their ASCII case variants are exactly the set a case-insensitive volume could collide with. Use an explicit fold, **not `String.prototype.toLowerCase`**, whose Unicode mappings are broader than the property being tested. `roots` reports each shelf by its **actual on-disk path**, so the refusal names what exists |

### Table W — what the user is shown, and when (canonical here for W1–W7 and W9)

| Row | Fact | Value |
|---|---|---|
| **W1** | **OWNER ITEM 2a — where the preserved copies go** | **RECOMMENDED VALUE: nowhere. Wienerdog writes no copy of its own.** `uninstall` stops before removing anything and tells the user to move or delete the files themselves. The two alternatives the stub named — a **fixed location in HOME** and a **user-chosen path** — are weighed in full under owner item 2, with the cost of overruling. **The package ships from either answer with the same mechanism**: Table X's carve-out is what a copying destination would need anyway (**X3**), Table K's inventory is the same walk, and the disclosure block of **W4**/**W5** changes only its closing line. What an overrule adds is a copier, and Table Y row **Y3** is that copier's binding contract, written here so an overrule is one ruling rather than one design session |
| **W2** | **OWNER ITEM 2b — may an unattended run proceed?** | **RECOMMENDED VALUE: no.** `--yes` does **not** proceed past a NON-EMPTY or UNREADABLE shelf: the refusal is printed and the process exits non-zero in exactly the same way with and without it. **This does not change what `--yes` means**, and the distinction is the reason: `--yes` skips the **prompt**, and the shipped contract at `uninstall.js:349-351` is that *"the set of valid actions is identical either way"*. A refusal is not a prompt — it removes an action from the valid set for both runs equally. **ADR-0035 governs the direction:** the attended CLI invocation is the trust surface, and the one thing a scripted, unattended run must not be able to do is irreversibly destroy the user's own text with nobody present. Note that a `--yes` run today prints **no plan at all** (**W7** of Current state item 5), so a disclosure-only design would be silent in precisely the configuration that needs it |
| **W3** | **Where the refusal is raised** | In `src/cli/uninstall.js`, immediately after `quarantineInventory` (Table K row **K5**) and **before the first `console.log`** — so before the manifest headline at `:311`, before any plan, and before every deletion. It is a `WienerdogError` in the shape the file's other refusals already use (`:286-288`, `:386-390`): a refusal, not a crash. It fires when `entries > 0` **or** `unreadable.length > 0` (**K3**/**K4**) |
| **W4** | **What the refusal says** | *Amended at PR-gate round 3 — see the end of this section.* Plain language for knowledge workers (CLAUDE.md), and it carries exactly five things (plus item (3b) when a blocker is present — see the round-3 rulings): **(1)** that nothing was removed; **(2)** the total entry count and the **total size in bytes as a plain integer** (a human-readable unit in parentheses is permitted, the integer is not optional); **(3)** one line per shelf directory **that holds at least one entry**, with its own count and byte total — a shelf directory that exists but is empty contributes no line, because by Table K row **K2** it contributes no entry either, and a refusal listing an empty directory would tell the user to deal with nothing; **(4)** the hedged statement of what these files are — *"some or all of these may be the only copy of that text on this computer, and they hold the original, not a blanked-out version"* — which is `WP-quarantine-only-copy-shelf`'s Table O row **O8** "may be" hedge, verified there against all four shelf classes and **never strengthened to "is"**; **(5)** the remedy, as two literal shell lines the user can copy — move the directory somewhere they keep, or delete it — followed by *"then run `wienerdog uninstall` again"*, and a pointer to `docs/runbooks/secret-incident.md`. **What the move line's destination is, and what it is NOT (added at the done-flip, erratum 10):** ruling **R-W4-win32** fixes that destination as `~/wienerdog-quarantine` (POSIX) / `"$HOME\wienerdog-quarantine"` (win32), and it is **a suggestion printed for the USER to execute**. **Wienerdog creates nothing there, writes nothing there and never verifies it** — row **W1**'s cell is *"nowhere. Wienerdog writes no copy of its own"* and Table Y row **Y2** is why. This is NOT owner item 2's declined candidate **(b)**, "a fixed location in HOME", which was about **the product** copying the shelf and would engage Table Y row **Y3**'s whole binding contract. The two name a similar path for opposite reasons. **When `unreadable` is non-empty the message names each directory and its `code` instead of a count**, and says the state could not be determined. It **never prints a filename and never prints a byte of any file's content** (Table Y row **Y1**) |
| **W5** | **`--dry-run`** | Does **not** abort — it deletes nothing, and aborting would hide the plan it exists to show. It prints the same block as **W4** (same counts, same byte totals, same directories, same hedge), then one line saying that a real `wienerdog uninstall` stops at this point and that the rest of the plan is what it would do once these files are moved or deleted, and then **today's plan unchanged**. In the SIBLING package that plan gains a carve-out — it no longer lists `<state>` under *"Machine-generated state (removed recursively, not manifest-tracked)"* and instead lists the preserved shelf from `preservedQuarantine` (**X4**), decided by Table X row X15's read-only planner rather than by a syscall, with `R-dry-run-prediction-drift` named in X15. **That is `WP-uninstall-shelf-deletion-guards`' half and is reproduced here only so the joint end state is legible; it is NOT this package's behaviour** (done-flip erratum 2). **On an install whose shelf directories exist but are empty the plan is unchanged and still lists `<state>` once** — the round-6 case. This preserves ADR-0019's own `--dry-run`-exactness consequence (`:68-69`) and M1's *"lists exactly what was created"* gate. **SPLIT AT THE DONE-FLIP (erratum 2): everything above about what the plan says BELOW the block — the `<state>` carve-out line, the `preservedQuarantine` line and `removed`'s granularity (Table X row X4) — is `WP-uninstall-shelf-deletion-guards`' half and this cell DEFERS to it, exactly as the note under this table already does for rows W8, W10 and W11. FOR THIS PACKAGE ALONE the plan below the block is today's plan, unchanged, `<state>` line included** — this package edits no deleter and introduces no `preservedQuarantine`. What stays canonical here is the first half: `--dry-run` does not abort, it prints W4's block with the same counts, byte totals, directories and hedge, then the one line saying a real `wienerdog uninstall` stops at this point, then the plan |
| **W6** | **The ABSENT and EMPTY cases — nothing changes at all** | No block, no extra line, no abort, no new field rendered, and `disposeCoreMechanics` behaves as at `1d8d4743`. **The complete stdout of `--dry-run` and of a full `uninstall --yes` on an install with no shelf entries is byte-identical to the same run at `1d8d4743`.** This is the row that keeps the package from changing every existing uninstall's output, and it is a declared RED target (Table B) |
| **W7** | **Ordering against `WP-scheduler-replay-manifest-independent`, and what must not be disturbed** | **The shelf gate runs FIRST** — before that package's Table D row **D2** discovery and therefore before its **D9** abort. Both aborts delete nothing and both are retryable, so **either order is safe**; the shelf gate goes first because it is the cheaper check (one walk inside our own core, no ambient roots) and because it reports data we would **destroy**, while D9 reports a deletion we might **fail to perform**. **Rows of that package this package must not disturb — in `uninstall.js`:** its discovery call and D9 abort, its **D3** disclosure block in both `--dry-run` and the pre-confirm plan, the `discoveredSchedules` snapshot passed to both `reverse()` calls (**D4**/**D7**), and the `vaultPath` read at `:309` that its **D12** consumes. **In `manifest.js`:** `discoverSchedulesOnDisk` (**D1**, **D9**–**D12**, **D14**, **D15**), `reverse()`'s phases **D5a**/**D5b**, `recognizeScheduleBasename`'s call site (**R2**), and `withinSchedulerRoot` / `withinAllowedRoot` / `validateEntry` / `contains`. **Round 8 changed this row, and the change is stated exactly rather than waved at.** This package now edits `reverse()` too (Table X row **X16**), so "disjoint functions" is no longer the argument; **disjoint regions and disjoint targets are.** *Lines added:* the `quarantineRoots` computation beside `schedulerOpts` (`manifest.js:751-758`), and one skip-and-report guard immediately after the global deferred-member guard (`:781`) and still **before kind dispatch** (`:790` region). *Nothing else in `reverse()`.* **No D-row changes:** **D5a** runs **before** the entry loop and **D5b** **after** it, while the guard lives **inside** the loop before dispatch — three disjoint regions. **And the targets cannot overlap either, by construction, which is the stronger claim:** D5b acts only on items `discoverSchedulesOnDisk` yielded, and every such item must sit under a **scheduler root** — `<home>/Library/LaunchAgents`, the systemd user dir, or `<core>/schedules` — while the shelf is `<core>/state/quarantine/**`; `<core>/schedules` and `<core>/state` are **sibling subtrees of `<core>`** and neither contains the other, and the other two roots are outside `<core>` entirely. **Even under a contrived `<core>/schedules` → shelf symlink no overlap is reachable**, because a discovered candidate must also carry a basename matching **R2** (`^wienerdog-[a-z0-9][a-z0-9-]*\.xml$`), whereas `quarantinePreserve` names every shelf file `<date>-<stem><ext>` (`validate.js:958`) — always date-prefixed, so never R2-matching. **Landing order:** that package is in `depends_on` and lands **first**, so its "`reverse()` untouched" claim is true when it ships and this package amends `reverse()` afterwards. **If the order is ever reversed, that claim must be re-pinned by its implementer** — it is a statement about the tree, not about this package |
| **W9** | **The two user-facing sentences, re-derived** | Both are single edits inside existing sentences and both are written to **W1**'s cell, so an overrule rewrites them and nothing else. **`docs/runbooks/secret-incident.md`** — the sentence at `:61-63` (*"And `wienerdog uninstall` removes this folder along with everything else Wienerdog keeps, so copy out anything you want to keep before you uninstall."*) is replaced by one saying that `wienerdog uninstall` **will not remove this folder** — **scoped: *while either quarantine folder still holds a file*** — it stops and asks the user to move those files somewhere they keep, or delete them, first, so uninstalling cannot lose them. *(Done-flip erratum 8: the unscoped form is false, because an EMPTY shelf is removed exactly as before — row **W6**, Table K row **K3**'s EMPTY arm. The scope is what shipped.)* **`docs/GLOSSARY.md`** — inside the `secret quarantine` entry, the clause *"disposable — `wienerdog uninstall` removes it with everything else Wienerdog keeps"* is replaced by one saying that `wienerdog uninstall` stops while either quarantine directory still holds a file and asks the user to deal with them first. **Neither edit touches the clause `WP-quarantine-only-copy-shelf` adds about the cap and only-copies** — that package lands first (`depends_on`) and owns that clause; this package owns the uninstall clause. **The two GLOSSARY ranges overlap on paper and that is flagged deliberately** (round-zero note): that package's row **O8b** cites `docs/GLOSSARY.md:141-148`, the whole `secret quarantine` entry, which **contains** this package's `:146-147` target. There is **no content collision** — O8b adds a clause beside *"disposable"* about the cap and only-copies, this package replaces the *"`wienerdog uninstall` removes it …"* clause — but the paper overlap is why the ordering is a `depends_on` and not a convention, and why the implementer **re-derives the line numbers after that package has landed** rather than trusting either range. **Neither sentence may promise a copy, an export destination or a recovery path this package does not ship**, and neither may strengthen the "may be the only copy" hedge |

**Rows W8, W10 and W11 are canonical in `WP-uninstall-shelf-deletion-guards`** and
are not reproduced here: all three turn on `preservedQuarantine` and `shelfGuarded`,
return fields this package does not introduce. **W5 and W6 gain a second half there**
— the read-only planner and the `removed` granularity — and that half defers to these
cells rather than re-deciding them.

### Table Y — security rows (canonical here for Y1–Y5, Y7, Y8)

| Row | Threat | What holds |
|---|---|---|
| **Y1** | A shelf byte, or a shelf filename, reaching a surface that persists or displays it | *Amended at PR-gate round 3 — see the end of this section.* Closed at the source: the inventory reads **metadata only** (Table K row **K6**), so no file is ever opened, and the refusal prints **directory paths, an entry count and a byte total** — never a filename, never a fragment of content. Filenames are `<date>-<sanitized note basename>`, derived from the user's own note paths; the user is about to list the directory themselves, so printing them buys nothing and not printing them is strictly safer. Asserted, not assumed — acceptance criterion **3** (renumbered at the done-flip, erratum 3) |
| **Y2** | **A new sensitive artifact created by the uninstall itself** | Under Table W row **W1**'s recommended cell there is **no export**, so there is no new file, no new directory, no new permission decision and no new thing to leave behind. This is the subtractive form of the answer and it is why the recommendation is what it is: an export would write a fresh, unmanaged pile of **unredacted credentials** into the user's home, outside the core, outside the manifest, unknown to every future Wienerdog run and unremovable by any uninstall — the accidental-persistence outcome ADR-0034 exists to prevent, performed as the last act of a command the user ran to remove the product |
| **Y3** | The same threat **under an overrule of W1 to a copying destination** | Binding contract, written now so an overrule needs no new design. Such an export **must never**: print or log any shelf file's contents; create a destination file more permissive than `0600` or a destination directory more permissive than `0700`, or widen the mode of any path that already exists; follow a symlink out of the shelf (classify every entry with `lstat`, never `dereference`); copy anything that is not a regular file; **leave a copy the user was not told about** — every destination path is named in the pre-consent disclosure **before any byte is written**, and a run that cannot name it writes nothing; overwrite an existing file at the destination; or delete a shelf file whose copy was not verified present at the destination. **And it must not construct a destination path from a shelf-supplied name without an anchored recognizer of what `quarantinePreserve` writes** — an entry whose name is not recognized is **copied nowhere, deleted nowhere, and named in the report as left in place**, so nothing unrecognized is silently destroyed |
| **Y4** | An untrusted identifier reaching a filesystem path or an argv | Under **W1**'s cell the package builds no argv at all, and every path it constructs is either a literal join of `paths.state` (Table K row **K1**) or that join with **one `readdirSync` name that has already matched the closed ASCII-case-fold set of Table X row **X12****. **It enumerates its own good twice over:** the accepted names are exactly the ASCII case variants of `quarantine` and `redacted` — a finite, closed set, because our names are pure ASCII with no combining marks — and **everything under the shelves is treated as the user's regardless of its name**. No entry name is ever classified as bad, matched against a denylist, or used to build a path before it has matched that set; a `readdirSync` name cannot contain a separator in any case. There is no grammar here we do not own, and no name is trusted with anything |
| **Y5** | An unreadable shelf read as an empty one — the **fail-open** direction | Closed by Table K row **K4** at both sites. This is the failure that loses the data: `rmSync({force:true})` succeeds silently on a tree the walk could not see. Chmod-ing one's own `0700` directory is a same-user act and not an adversary this package defends against; what matters is that the **accident** — a permission-damaged shelf, an `EIO`, an `EMFILE` under load — cannot read as "nothing to preserve" while the tree is disposed |
| **Y7** | `--yes`, or any scripted invocation, silencing the refusal | Closed by Table W row **W2**: the refusal is raised before the `if (!yes)` branch is reached and is independent of it. Asserted for both runs, with identical text (acceptance criteria **1 and 2** — renumbered at the done-flip, erratum 3) |
| **Y8** | Anything in this package outliving its invocation | Nothing does. One read-only directory walk, one `console.log`, one thrown `WienerdogError`, and a `fs.rmSync` that does not happen. No process, no socket, no schedule, no telemetry (ADR-0004) |

**Rows Y6, Y9 and Y10 are canonical in `WP-uninstall-shelf-deletion-guards`** — they
govern the manifest replay, the sweep's symlink handling and the credential-stranding
direction, none of which this package changes.

### Table B — the declared RED proofs (ADR-0042)

One file, `tests/red-proofs/adr-0019-quarantine-uninstall-gate.proofs.json`.
**`expectRed` sets are MEASURED at implementation time, never predicted.** Each
anchor is `grep -Fc` over the named file at `1d8d4743`; a count of `1` means a
find-string built around it is unique. **Every anchor below is shown without its
leading indentation** (a code span may not carry one); the declaration's own `find`
string must include the line's real indentation, and the count is the same either way.

**Six declarations over six criteria: THREE carry a pre-measurable anchor and THREE
mutate code this package authors** (`quse-unreadable-shelf-read-as-empty`,
`quse-dry-run-block-suppressed`, `quse-shelf-name-case-sensitive`). *(Done-flip
erratum 5: this read "five … and one", which the table's own cells already
contradicted.)* The remaining twenty declarations of the unsplit document belong to
`WP-uninstall-shelf-deletion-guards`, which mutates the deleters this package leaves
byte-unchanged.

**The `Criterion` column below is THIS file's numbering, re-derived at the done-flip
(erratum 4) and byte-checked against the shipped
`tests/red-proofs/adr-0019-quarantine-uninstall-gate.proofs.json` on `origin/main`
at `8b4cbd4c`.** It is a canonical column, not a placeholder.

| Proof id | Criterion | File | Mutation | Anchor at `1d8d4743` (occurrences) | What it proves |
|---|---|---|---|---|---|
| `quse-refusal-not-raised` | **1** | `src/cli/uninstall.js` | make the gate treat NON-EMPTY as EMPTY, so the run proceeds and deletes | `const vaultPath = readVaultPath(paths.config) \|\| paths.vault;` — **1** (the adjacent, unchanged pre-plan line the gate is inserted beside) | criterion **1** asserts an **abort**, and an abort assertion goes green whenever the run fails for any reason at all — a bad fixture, a missing manifest, a throw in unrelated setup. Same shape, same reason as `WP-scheduler-replay-manifest-independent`'s `srm-unreadable-root-read-as-empty` |
| `quse-yes-skips-the-refusal` | **2** | `src/cli/uninstall.js` | gate the refusal on `!yes`, so a `--yes` run proceeds | `const yes = argv.includes('--yes');` — **1** | criterion **2** is the one the whole of Table W row **W2** rests on, and it is invisible to any suite that only ever drives the interactive path. A `--yes` suite that asserts "the run refused" passes under the mutation if it never actually passed `--yes` |
| `quse-unreadable-shelf-read-as-empty` | **6** | `src/core/manifest.js` | make the walk's `catch` swallow the error and return `unreadable: []`, restoring the fail-open shape exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the inventory's error classification | criterion **6** asserts an abort **and** zero removals, and both halves go green on a fixture that never made the shelf unreadable. This is Table K row **K4** and Table Y row **Y5**, and it is the one failure that silently destroys the data rather than merely failing to protect it |
| `quse-block-printed-on-an-empty-shelf` | **5** | `src/cli/uninstall.js` | print the block unconditionally, so an install with no shelf gets a `0 file(s), 0 bytes` block | `console.log('wienerdog uninstall — the following will be removed:\n');` — **1** | criterion **5** asserts **byte-identity with `1d8d4743`** for an install with no shelf. It is the criterion that keeps this package from changing every existing uninstall's output, and a byte-identity assertion is trivially satisfiable by a fixture that compares the wrong stream or an empty one |
| `quse-dry-run-block-suppressed` | **4** | `src/cli/uninstall.js` | drop the block from the `--dry-run` arm while leaving the refusal intact | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is the `--dry-run` arm's own `quarantineBlock` call. *(Done-flip erratum 5: this cell named the headline line `item(s) would be removed, ${skipped.length} skipped.`; W5 puts the block BEFORE the headline, so no find-string built around that line can suppress the block.)* | criterion **4** observes **disclosure**, not the refusal. Without this declaration a suite can assert the refusal (which is loud) and never notice that `--dry-run` — the surface a user consults precisely to find out what an uninstall will do — says nothing about the shelf at all |
| `quse-shelf-name-case-sensitive` | **11** | `src/core/manifest.js` | replace Table X row **X12**'s ASCII fold in X1 step 2's exclusion with byte equality (`name === 'quarantine'`), restoring the round-4 defect exactly | *new — authored by this package*, so no pre-measurable anchor exists; the mutation site is step 2's name test | *Round 4.* Criterion **11**'s case-fold arm asserts that a capitalized shelf and the bytes inside it **survive**. Both are survival assertions, and both go green on any fixture that never created the capitalized directory, created it on the wrong volume, or left it empty when the interleaved preserve was supposed to fill it. **The defect is also invisible to every existing assertion in this package**: X10 and X11 classify types and ancestors, not names, so nothing already declared reddens under this mutation |

*(Done-flip erratum 4: this paragraph used to read "Criterion numbers in the table
above are the UNSPLIT document's", mapped elsewhere, with the implementer asked to
re-derive them when writing the JSON. Delegating a canonical column's values is
exactly what ADR-0031 exists to stop; the column above is now this file's numbering.
The unsplit document's mapping is still recorded in the closing section of
`docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-review.md`
for anyone reading that document.)*

**Binding:** `scripts/red-proofs.js` refuses any red whose failure `code` is not
`ERR_ASSERTION`, and requires each `expectRed` entry's non-empty `signal` to appear in
the failing assertion message.

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the table
and all its mirrors **in the same commit** — no commit exists in which the canonical
table and a registered mirror disagree — and any new mirror found in review is added
here on the spot.

- [ ] **Deliverables-table cells** — the `manifest.js` row → Table K and **K8**; the
      `uninstall.js` row → **K5**, **W2**–**W5**, **W7**; the two test rows → the
      acceptance criteria; the proofs row → Table B; the ADR row → owner item 1; the
      two doc rows → **W9**
- [ ] **Acceptance criteria** — 1 asserts **W3**/**W4**/**K3**; 2 asserts **W2**/**Y7**;
      3 asserts **K6**/**Y1**; 4 asserts **W5**; 5 asserts **W6**; 6 asserts
      **K4**/**Y5**; 7 asserts **W7**; 8 asserts owner item 1's text; 9 asserts **W9**;
      10 asserts the refusal's idempotence; 11 asserts **K8**/**K1**; 12 asserts Table B
- [ ] **Verification commands / greps** — the `quarantine` greps mirror **K1** and
      **W3**; the two `contains` greps mirror this package's byte-unchanged promise;
      the amendment greps mirror owner item 1; the ADR-0019 header and
      invariant-paragraph greps mirror ADR-0035's rule that no agent moves or
      reformats an authority line; the two guarded negated greps mirror **W9**
- [ ] **Current-state description** — items 1 and 7 are the measured basis of **K1**,
      **K2** and **K8**; item 5 is the basis of **W2**/**W5**; item 6 is the basis of
      **W3**; item 9 is the basis of **W9**; item 10 is the basis of the
      `promote.js`-is-out-of-scope claim
- [ ] **Security-checklist bullets that restate a contract** — the
      untrusted-identifier bullet mirrors **K1**/**Y4**/**K8**; the symlink bullet
      mirrors **K2**/**K6**; the case-fold bullet mirrors **K8**; the
      emptying-the-shelf bullet mirrors **K2**
- [ ] **Operative prose steps** — the Context paragraph quoting ADR-0019's invariant
      mirrors owner item 1's erratum; the paragraph citing
      `WP-quarantine-only-copy-shelf`'s Table O row **O8** mirrors **W4**'s hedge; the
      worked example mirrors **K2**/**K3** and **W4**/**W6**
- [ ] **Cross-document mirrors of the sibling package** — every mention of **X3**'s
      window, of **W8**/**W10**/**W11**, and of Tables **X**/**V** defers to
      `WP-uninstall-shelf-deletion-guards` and re-decides nothing
- [ ] **The Exact-contracts `@returns` block** — its five fields mirror Table K
      (`roots`/`entries`/`bytes` → **K2**/**K3**, `unreadable` → **K3**/**K4** and
      ruling **R-Y1**, `blockers` → **K2** and ruling **R-K**). A field added,
      renamed or re-described there and not in Table K is a mirror break
- [ ] **The acceptance-criteria list itself, as a CROSS-REFERENCE surface**
      *(registered at the done-flip, erratum 3)* — every criterion number cited
      anywhere in this spec mirrors that list's numbering: criterion 2's and
      criterion 4's internal references, Table Y rows **Y1** and **Y7**, owner
      item 2's flip sentence, the Platform-scope section's unreadable fixture,
      and Table B's `What it proves` cells. A renumbering updates all of them in
      the same commit
- [ ] **Table B's `Criterion` and `Anchor` columns** *(registered at the
      done-flip, errata 4 and 5)* — the `Criterion` column mirrors the
      acceptance-criteria list and the shipped declaration file's `criterion`
      fields; the `Anchor` column mirrors each declaration's `find` string and
      its pre-measurability at the base `1d8d4743`. Neither may be left for the
      implementer to re-derive
- [ ] **The "PR-gate round 3 rulings" section** — it is a registered mirror of
      Tables **K**, **W** and **Y**, not a separate contract: **R-Y1** amends
      **Y1**, **R-K**/**R-K′** amend **K2** and **W4**, **R-W4-win32** amends
      **W4** item (5), **R-QU7**/**R-QU7′** amend the Platform-scope section's
      reach. Each amended cell carries the pointer line, and a change to a
      ruling updates its cell in the same commit

### PR-gate round 3 rulings (PR #309 review, 2026-09-19) — amendments to Tables K, W and Y

**These are ARCHITECT rulings, recorded in the standing form.** Nothing in this
repository records the owner approving, accepting, ratifying or signing any of
them. They arose from the independent and fidelity gates on PR #309 and amend the
cells named above; each cell carries a pointer to this section.

- **R-Y1** *(amends Table Y row **Y1**)* — "An unreadable object BELOW a shelf
  root (a nested directory whose `readdir` or `lstat` fails, at any depth) is
  reported by the shelf root it sits under and the error code — never by its own
  path. `unreadable[].dir` is therefore always a shelf root or `<state>` itself,
  de-duplicated."
- **R-K** *(amends Table K row **K2** and Table W row **W4**)* —
  "`quarantineInventory` returns `{roots, entries, bytes, unreadable, blockers}`.
  `blockers: string[]` lists the actual on-disk path of every non-directory found
  at a shelf-root position (Table K row K2: it counts as one entry and
  contributes 0 bytes). Table W row W4 gains item (3b): one line per blocker,
  `<path> — not a folder; something else is sitting where the quarantine folder
  goes`; the remedy targets the first shelf root, else the first blocker, else
  the canonical `<state>/quarantine`."
  **R-K′ (round 3b, narrows R-K).** The blocker rule applies to the
  `<state>/<quarantine>` position only. A non-directory at the
  `<quarantine>/redacted` position is an ordinary entry under `quarantine` per
  K2 as written — one entry; a regular file contributes its size. The refusal
  fires and the remedy names the quarantine root, which exists and whose removal
  removes the blocker.
- **R-W4-win32** *(amends Table W row **W4** item (5))* — "The two remedy lines
  of W4 item (5) are the host shell's, chosen by `process.platform`: on
  darwin/linux `mv '<p>' ~/wienerdog-quarantine` and `rm -rf '<p>'` with POSIX
  single-quote escaping (`'` → `'\''`); on win32
  `Move-Item -LiteralPath '<p>' -Destination "$HOME\wienerdog-quarantine"` and
  `Remove-Item -LiteralPath '<p>' -Recurse -Force` with PowerShell single-quote
  escaping (`'` → `''`). Both branches are unit-tested by injecting the platform
  into the block builder; no test requires a Windows host."
- **R-QU7** *(amends the Platform-scope section's reach over this package's own
  tests)* — "Every test in this package is platform-independent, as the
  Platform-scope section requires: the ordering fixture of criterion 7 (QU-7)
  injects the scheduler-root failure code rather than arranging a real unreadable
  root, so it runs on every host and the two RED declarations that cite it are
  provable on linux."
  **R-QU7′ (round 3b, narrows R-QU7).** Every test runs unguarded on the CI
  matrix (darwin, linux). A test whose fixture needs a POSIX filename or a POSIX
  shell is guarded on win32 by an explicit skip, and every expected remedy line
  in a CLI-level assertion is selected by `process.platform`. R-W4-win32's
  PowerShell quoting escapes every code point PowerShell treats as a
  single-quote delimiter — U+0027, U+2018, U+2019, U+201A, U+201B — each
  doubled.

## Dispatch precondition — owner items

The items below are **recommendations with the cost of overruling them, not direct
rulings**. The standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`: the architect
records a recommendation with its overrule cost, the session may dispatch under it,
and **the owner reverses it by dated amendment**, applied by a committed revision
rather than by a dispatch message, because `scripts/boundary-check.js` reads the
Deliverables table in this file and nothing a message says changes what CI sees.
**Nothing in this repository records the owner approving, accepting, ratifying or
signing any of them, and this spec asserts no such acceptance.**

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
  where the copy goes, and acceptance criteria **1 and 2** flip from asserting a
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

**Owner item 4** — whether `uninstall` should refuse whenever any symlink exists under
`<core>` — belongs to `WP-uninstall-shelf-deletion-guards`, because it is the overrule
path for that package's `R-alias-outside-closure`. It is **open** there.

## Implementation notes & constraints

- **Zero new dependencies**; `node:fs` and `node:path` only.
- **This package changes NO deleter.** `disposeCoreMechanics`, `reverse()`, `contains`,
  `withinAllowedRoot`, `withinSchedulerRoot`, `validateEntry` and `isDir` stay
  byte-unchanged. Every carve-out, guard and protected-set rule belongs to
  `WP-uninstall-shelf-deletion-guards`. If the implementation finds itself editing a
  deleter, that is a spec bug — say so.
- **The refusal is a `WienerdogError`**, thrown before the first `console.log`, in the
  shape the file's other refusals already use (`uninstall.js:286-288`, `:386-390`). It
  is a refusal, not a crash: it names what was found, says nothing was removed, and
  gives the remedy.
- **Compare shelf names with an explicit ASCII fold, not `toLowerCase()`** (**K8**).
  `toLowerCase` applies the full Unicode mapping, which is broader than the property
  being tested and is not what a case-insensitive filesystem implements.
- **`--dry-run` must not abort.** It deletes nothing, and a `--dry-run` that refuses to
  show the plan defeats the surface's purpose.
- **Byte-identity for the empty case is a hard constraint, not a nicety.** Every
  existing uninstall test asserts against today's output; **W6** is what keeps them all
  valid, and criterion 5 is what proves it.
- **The two doc edits are user-facing text for knowledge workers** (CLAUDE.md). Plain
  language, no jargon, no file path the surrounding text has not already given, and the
  *"may be the only copy"* hedge is never strengthened.
- **Re-derive every line number at dispatch.** This spec is pinned to `1d8d4743`, and
  `WP-scheduler-replay-manifest-independent` and `WP-quarantine-only-copy-shelf` land
  in these files first. Cite what you find, not what this spec predicted.
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

The one platform-shaped question is the **unreadable** fixture of criterion **6**
(renumbered at the done-flip, erratum 3): a
`chmod 0000` directory does not produce `EACCES` for a privileged user, and
Windows permissions do not map onto it. Assert it by **injecting the failure**
(a `readdir`/`lstat` that throws a given `code`), as the repo's other
error-classification tests do, rather than by arranging a real permission —
`quarantineInventory` classifies by `code`, so the injected code is the whole of
what the rule reads.

Nothing in this package contacts a scheduler, a network or an OS service, on any
platform, in any test.

## Security checklist

- [x] **No untrusted identifier reaches a filesystem path or an argv.** The package
      builds no argv at all, and every path it constructs is a literal join of
      `paths.state` or that join with **one `readdirSync` name that has already matched
      the closed ASCII-case-fold set** of **K8** — Table K row **K1**, Table Y row
      **Y4**. **Our own good is enumerated twice:** the accepted names are exactly the
      ASCII case variants of `quarantine` and `redacted` — finite and closed, because
      our names are pure ASCII with no combining marks — and every entry **under** the
      shelves is treated as the user's whatever it is called. **No bad is enumerated
      anywhere.**
- [x] **No shelf byte and no shelf filename reaches any surface** — the inventory opens
      no file (**K6**) and the refusal prints directories, counts and a byte total only
      (**Y1**). Asserted by criterion 3 against a fixture whose basename and contents
      are both distinctive.
- [x] **Symlinks are never followed by the inventory.** The walk is `lstat`-based
      throughout; a link on the shelf is counted as an entry and never descended, so a
      planted link cannot make the walk leave the shelf or loop (**K2**).
- [x] **The uninstall creates no new sensitive artifact, because there is no export** —
      **Y2**. **Under an overrule of W1, Table Y row Y3 is that export's binding
      contract.**
- [x] **An unreadable shelf can never be mistaken for an empty one**, so the safety
      decision never fails open — **K4**, **Y5**. Absence (`ENOENT`/`ENOTDIR`) is the
      single special case.
- [x] **The shelf is recognized by case-folded name on every platform** — **K8**. Two of
      the three supported platforms are case-insensitive by default, where a stored
      `Quarantine` **is** the object the lowercase path opens; a byte-equality test
      would report a populated shelf as EMPTY and let the run proceed.
- [x] **`--yes` cannot silence the refusal** — **W2**, **Y7**, asserted by criterion 2
      and declared as a RED proof.
- [x] **Emptying the shelf actually lets the user uninstall** — the two product-created
      shelf root directories are excluded from the entry count (**K2**), so the remedy
      the refusal prints terminates. **A protection that can never be satisfied is a
      denial of service on the user's own machine, not a safeguard** — the third failure
      direction this family has, beside destroying the user's text and stranding a
      credential, and the one round 1 and round 21 both landed on.
- [x] **No process, socket, schedule or telemetry** — **Y8** (ADR-0004).

## Acceptance criteria

- [ ] **1.** *(Table W rows **W3**/**W4**.)* With at least one entry on either
      shelf, a non-dry-run `wienerdog uninstall` **exits non-zero having removed
      nothing** — the manifest, `config.yaml`, the core, every manifest-recorded
      artifact and every shelf entry are all still present with unchanged bytes —
      and its message contains the total entry count, the **total size in bytes
      as a plain integer**, both existing shelf directory paths with their own
      counts, the "may be the only copy" hedge, and the two-line remedy.
- [ ] **2.** *(Table W row **W2**, Table Y row **Y7**.)* Criterion **1** holds
      identically for `wienerdog uninstall --yes`, and the refusal's text is
      **byte-identical** between the two runs.
- [ ] **3.** *(Table K row **K6**, Table Y row **Y1**.)* Given a shelf file whose
      basename and whose contents are each a distinctive string, the refusal's
      **complete** stdout+stderr contains neither. Asserted over both strings,
      with the fixture first shown to place both on disk.
- [ ] **4.** *(Table W row **W5**, first half.)* With a non-empty shelf,
      `--dry-run` **exits 0**, prints the block with the same counts and byte
      total as criterion **1**'s refusal, prints the line saying a real run stops
      there, and still prints **today's plan, unchanged**. *(Done-flip erratum 1:
      this criterion also required that the plan "no longer lists `<state>` under
      the machine-generated-state heading and the preserved shelf does" — the
      carve-out and the `preservedQuarantine` rendering, both of which belong to
      `WP-uninstall-shelf-deletion-guards`. This package changes no deleter, and
      its own verification block's `! grep preservedQuarantine` step forbids that
      field appearing in its diff.)*
- [ ] **5.** *(Table W row **W6**.)* On an install with no
      shelf entries, the **complete stdout of `--dry-run`, and of a full
      `uninstall --yes`, is byte-identical to the same run at `1d8d4743`.**
      Asserted against a captured expectation, not by absence of the new strings
      alone. **Two fixtures, and the second is the round-6 one that the first
      cannot catch:** (a) **no shelf directory at all**; (b) **both
      `<state>/quarantine/` and `<state>/quarantine/redacted/` present as
      directories and empty** — the state the refusal asks the user to reach.
      **Both the `Removed N item(s)` line and the `--dry-run` mechanics plan are
      compared in full**, because byte-identity is the whole claim and each
      stream can hide a change the other shows. *(Done-flip erratum 1: this
      criterion was attributed to Table **X4** and explained by that row's
      `removed` granularity — "a naive implementation reports three removed paths
      where the baseline reports one". X4 is
      `WP-uninstall-shelf-deletion-guards`' row and describes its deleter; here
      the claim is simply byte-identity with the base, which needs no deleter
      behaviour to state.)*
- [ ] **6.** *(Table K row **K4**, Table Y row **Y5**.)* A `<state>/quarantine`
      that exists but cannot be enumerated — asserted for at least `EACCES` and
      `EIO`, by injecting the failing `code` (Platform scope) — makes a
      non-dry-run `uninstall` **abort naming that directory and its `code`, with
      the manifest and the core still present and zero files removed**.
      `ENOENT`/`ENOTDIR` on the same path does **not** abort. `--dry-run` against
      the unreadable shelf does **not** abort and reports it. *(Done-flip
      erratum 1: this criterion also asserted "**And at the deleter:**
      `disposeCoreMechanics` … preserves `<state>` and reports it in
      `preservedQuarantine`". `preservedQuarantine` is a return field this
      package does not introduce and `disposeCoreMechanics` stays byte-unchanged
      here; that half is `WP-uninstall-shelf-deletion-guards`' — Table Y row
      **Y5** already says the rule is "closed by Table K row **K4** at both
      sites", and the second site is the sibling's.)*
- [ ] **7.** *(Table W row **W7**.)* `WP-scheduler-replay-manifest-independent`'s
      surfaces are undisturbed: its existing tests pass unchanged, its **D3**
      block still appears in `--dry-run` and in the pre-confirm plan, and its
      **D9** abort still fires on an unreadable scheduler root. Plus one ordering
      assertion: with **both** a non-empty shelf **and** an unreadable scheduler
      root, the **shelf refusal** is the message printed and nothing is removed.
- [ ] **8.** ADR-0019 carries owner item 1's amendment verbatim and the pointer
      line after `:54`; the invariant paragraph at `:52-54` is **byte-unchanged**;
      and the header lines `Status: Accepted` and `Date: 2026-07-06` are
      byte-unchanged and still at `:3` and `:4`.
- [ ] **9.** *(Table W row **W9**.)* Neither `docs/runbooks/secret-incident.md`
      nor `docs/GLOSSARY.md` still says `wienerdog uninstall` removes the
      quarantine; each says what **W1**'s cell decided; neither promises a copy,
      an export destination or a recovery path this package does not ship; and
      neither strengthens the "may be the only copy" hedge. The clause
      `WP-quarantine-only-copy-shelf` added to each file is **unchanged**.
- [ ] **10.** Idempotence. The template's "running the command twice" criterion is
      **`N/A` for `uninstall` itself** for the reason
      `WP-scheduler-replay-manifest-independent`'s criterion 7 gives — the first
      completing run removes the manifest (`uninstall.js:424`) and the second
      refuses with *"no install manifest found"* (`:285-288`) — which this
      package does not change. What it must show instead: **the refusal is
      idempotent.** Running `wienerdog uninstall` twice against an unchanged
      non-empty shelf produces the same exit status and the same message both
      times, and **zero filesystem changes in either run**, asserted by comparing
      a recursive listing with sizes and mtimes taken before and after.
- [ ] **11.** *(Round 4 — Table X row **X12**, Table K row **K1**.)* **Shelf
      identity is case-folded, and the plan and the act agree about it.** Three
      arms. **(a)** With `<state>` holding a directory named **`Quarantine`** that
      contains a file, `quarantineInventory` **counts that file**, the run
      **refuses**, and the refusal names the directory **by its actual on-disk
      name**. **(b)** The ambiguity rule, on the INVENTORY side: a child of
      `<state>` whose name folds equal to `quarantine` but is **not byte-equal**
      to it is still located and counted **even when the byte-exact lowercase
      `quarantine` also exists beside it** (a case-sensitive-volume fixture), and
      each is reported in `roots` by its actual on-disk path. Both arms assert
      against an **explicit ASCII fold**, not `toLowerCase`. *(Done-flip erratum
      1: the criterion's arms (b) and (c) drove "X1 step 2" — the sibling's sweep
      — and asserted `preservedQuarantine` and X1 step 3's `ENOTEMPTY` rule. The
      sweep half of both arms is
      `WP-uninstall-shelf-deletion-guards`'; what survives here is the inventory
      half, which is what `quarantineInventory` can be asked. **Note also that
      K8's fold-versus-`toLowerCase` rule is not observable for these two names**
      — see reviewer note (d) at the top of this file — so the reddening evidence
      is the byte-equality mutation `quse-shelf-name-case-sensitive`.)*
- [ ] **12.** The declared RED proofs of Table B are `PROVEN` in an **UNFILTERED**
      `npm run red-proofs` run, with no `FILTERED`, `VACUOUS`, `UNCONTROLLED` or
      `FAILED` verdict.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint

# The shelves are known to the inventory and to the CLI (Table K row K1, W3).
test -f src/core/manifest.js && grep -n 'quarantine' src/core/manifest.js
test -f src/cli/uninstall.js && grep -n 'quarantine' src/cli/uninstall.js

# This package changes NO deleter: disposeCoreMechanics keeps its single recursive
# sweep and contains() keeps its one vault-guard call site, exactly as at 1d8d4743.
# Both must print, unchanged.
test -f src/core/manifest.js && grep -Fn 'if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });' src/core/manifest.js
test -f src/core/manifest.js && grep -Fn 'contains(dir, vaultPath)' src/core/manifest.js

# ...and it introduces no preservation field (that is the sibling package).
# This command must succeed SILENTLY; a hit means package B's work leaked in here.
test -f src/core/manifest.js && ! grep -Fn 'preservedQuarantine' src/core/manifest.js

# ADR-0019: the amendment landed (criterion 8).
test -f docs/adr/0019-uninstall-disposes-core-mechanics.md \
  && grep -n 'the secret quarantine is a preserved kind' docs/adr/0019-uninstall-disposes-core-mechanics.md
test -f docs/adr/0019-uninstall-disposes-core-mechanics.md \
  && grep -n 'ACCEPTED under standing authorization 2026-09-18' docs/adr/0019-uninstall-disposes-core-mechanics.md

# ...and its header and its invariant paragraph did not move or change
# (criterion 8; ADR-0035's rule that no agent moves or reformats an authority line).
grep -n '^Status: Accepted$' docs/adr/0019-uninstall-disposes-core-mechanics.md
grep -n '^Date: 2026-07-06$' docs/adr/0019-uninstall-disposes-core-mechanics.md
grep -Fn 'canonical core; the vault is always outside it** — is binding on all future' \
  docs/adr/0019-uninstall-disposes-core-mechanics.md

# The two stale user-facing sentences are gone (criterion 9). Each must succeed
# SILENTLY; a printed line means the stale sentence survived. Both are guarded with
# `test -f` so a deleted file reddens instead of passing on grep's exit 2.
test -f docs/GLOSSARY.md && ! grep -Fn 'removes it with everything else Wienerdog keeps' docs/GLOSSARY.md
test -f docs/runbooks/secret-incident.md \
  && ! grep -Fn 'folder along with everything else Wienerdog keeps' docs/runbooks/secret-incident.md

# The declared RED proofs (criterion 12) — UNFILTERED.
npm run red-proofs
```

Every positive `grep` targeting a file this package edits is guarded with `test -f`,
and every **negated** grep is guarded too — an unguarded `! grep` passes hardest when
the file does not exist, which is exactly where the work was never done
(`docs/runbooks/spec-authoring.md`). Observe each new check in all three states —
**absent → red, compliant → green, violating → red** — and paste all of them.

## Out of scope (do NOT do these)

- **Every deletion-side contract** — the carve-out in `disposeCoreMechanics`, the shelf
  guard in `reverse()`, the protected set, the alias rules, `preservedQuarantine`,
  `shelfGuarded`, and rows **W8**/**W10**/**W11**/**Y6**/**Y9**/**Y10**. They are
  `docs/specs/WP-uninstall-shelf-deletion-guards.md`, which depends on this package.
- **Any review, listing, ageing, banner or `doctor` surface for the shelves.**
  `WP-quarantine-review-cli` is `Superseded` and `doctor`'s `quarantineReport`
  (`src/cli/doctor.js:498`) counts the **transcript ledger**, a different object.
- **The retention cap and the prune** — `WP-secret-fence-ep2-redact-arm`'s Table N and
  `WP-quarantine-only-copy-shelf`'s Table O.
- **`src/core/dream/validate.js` and `src/core/dream/promote.js`** — Current state item
  10 records why the *"while it is there"* line is not falsified.
- **Anything that writes user content into the vault** — option A of the 2026-07-27
  ruling, which the owner did not choose.
- **Every row of `WP-scheduler-replay-manifest-independent`** — **W7** lists what must
  stay byte-unchanged.
- **`tests/integration/uninstall-core-e2e.test.js`** — its install→uninstall path has an
  empty shelf, so **W6** makes it unchanged by construction.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(uninstall): refuse to destroy the secret quarantine (WP-adr-0019-quarantine-uninstall-gate)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
   `In-Review` marks the START of review: this list is complete only when review is.
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
   drafts carries **"owner signature pending"**. (b) **Owner items 1, 2 and 3 remain OPEN**, travelling with
   this package as recommendations in the standing form; the owner reverses any of them
   by dated amendment, applied by a committed revision. (c)
   **`WP-scheduler-replay-manifest-independent` and `WP-quarantine-only-copy-shelf` land
   first** (`depends_on`): the first rewrites both of this package's source files and
   the second owns the neighbouring clause in both of its documentation files.
