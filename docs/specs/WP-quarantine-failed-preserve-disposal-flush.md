---
id: WP-quarantine-failed-preserve-disposal-flush
title: Flush the directory after each owned-path removal on a failed preservation, best-effort, and price what a failed flush still leaves
status: Draft
model: sonnet
size: S
depends_on: [WP-quarantine-preserve-durability, WP-preservation-abort-widening]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-failed-preserve-disposal-flush: a best-effort flush after a failed preservation's removal

> **Design gate round zero ran 2026-09-06 against `b1d20ce0`;** the measurements
> (`FP-P1`…`FP-P7`), the pinned STOP CRITERION and the both-directions proof of
> V1 are
> `docs/specs/logbook/2026-09-06-failed-preserve-disposal-flush-design-gate-rounds.md`.
> The value question this stub was filed to ask is answered **YES** — owner item
> **O12** below. This spec is `Draft` until its adversarial rounds close.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004)** — nothing is started and nothing outlives
its call; a flush is a call that has returned. The nightly **dream**'s EP2 secret
gate (ADR-0034) preserves the bytes it is judging into `state/quarantine/` or
`state/quarantine/redacted/` (0700 dirs, 0600 files) before refusing to promote
them, via `quarantinePreserve` in `src/core/dream/validate.js`.

**This package ADDS a durability property; it repairs no broken guarantee.**
`WP-preservation-abort-widening` **Table D row D4** — *"`null` means the owned
path is absent. Every caller already treats `null` as 'no artifact'; this row is
what makes that true"* (`docs/specs/done/WP-preservation-abort-widening.md:417`)
— names the two owned paths: row **D1** names `tmp` before the commit completes,
row **D2** names `dest` after it. **D4 requires no durability of either.** The
paragraph immediately after it
(`docs/specs/done/WP-preservation-abort-widening.md:419-433`) says so in its own
words — *"Neither P0b's read-back nor D1/D2's removal is crash-durable"* — and
`WP-quarantine-preserve-durability` row **F7(a)** already discloses that a
disposed artifact can reappear after a crash.

**`WP-quarantine-preserve-durability` Table F made a SUCCESSFUL preservation
durable and excluded removals (row F7(a)).** Its protocol is POSIX-only (row
**F5**) and runs only on the success path; its helper `flushDir`
(`src/core/dream/validate.js:806-817`) opens a directory, `fsync`s it, closes the
descriptor on every path and returns a boolean. **This package changes no row of
Table F, Table D, Table M, Table N or Table P**, adds no helper, and takes no
position on the success path.

**What this package delivers, stated before any measurement so no later sentence
can inflate it.** A **BEST-EFFORT** directory flush after each of the two
removals. **A COMPLETED POSIX flush means that ON THAT PATH, once the run has
completed and published its record, the removed artifact can no longer come
back** — for row **Z2** an entry that record omits, for row **Z1** a `.tmp-`
leftover no record names at all; the two differ and Table Z keeps them apart.
**A flush that does not complete, and every win32 run, RETAIN the residual** —
the same class `WP-quarantine-disposal-durability`'s owner item **O10** parks.
Nothing here closes that class.

## Current state

Measured at `b1d20ce0`. Two removals in `src/core/dream/validate.js` are D4's
owned paths on `quarantinePreserve`'s FAILURE arms, and Table Z decides what each
one gets:

- **`validate.js:984`** — `if (ownedTmp) removeOwnedQuarantinePath(tmp);` (four
  spaces of indent) in the shared `catch`, after the gate
  `ownedTmp = fd >= 0 && ownsName(tmp, fd)` (`:979`), followed by `return null;`
  at `:985`. Table Z row **Z1**.
- **`validate.js:1020`** — `if (ownedDest) removeOwnedQuarantinePath(dest);` (two
  spaces of indent) on the post-commit failure path, after
  `ownedDest = ownsName(dest, fd)` (`:1014`), followed by `return null;` at
  `:1021`. Table Z row **Z2**.

**Neither is followed by any flush** — measured, `FP-P1` on the pristine tree:
driving the shipped `quarantinePreserve` through the shared catch (the commit
made to throw) issues **zero** `fsync` calls on both arms, and through the
post-commit failure (the artifact flush made to throw) issues only the artifact
`fsync` that threw and **no directory flush**. `flushPreservation` (`:857-864`)
runs only on the success path and returns before every `fsync` on win32
(`DURABILITY_AVAILABLE`, `:696`). **`flushDir` (`:806-817`) carries no platform
gate of its own** — only `flushPreservation` does — which is Table Z row **Z4**.

**Both removed paths sit in `qdir`** — `tmp = path.join(qdir, '.tmp-…')` (`:964`)
and `dest = path.join(qdir, name)` (`:959`) — and `qdir` is
`<stateDir>/quarantine/redacted` on the redact arm and `<stateDir>/quarantine` on
the withheld arm (`:950-952`). Measured, `FP-P2`: every removal on both acts and
both arms has `qdir` as its parent. `qdir` is in scope at both sites and is
non-null wherever the flush fires — `ownedTmp` requires `fd >= 0`, hence the
create-open at `:965`, which follows `qdir`'s assignment.

**Sixty-four RED-proof declarations exist across twelve files in
`tests/red-proofs/`, three of them pinning lines in this function** — `find`
literals for `:995` and `:1020`, all `occurrences: 1`. **This package inserts
lines and edits none.** Measured on a hand-built compliant state: every one of the
64 `find` literals still occurs exactly its declared number of times (`FP-P4`), so
**no declaration is re-targeted and none joins the Deliverables**; and
`node tests/run.js` on that same state reports **2681 pass, 0 fail, 12 skipped**
(`FP-P3`) — **no shipped assertion changes**, `[QPD-3]` and `[QPD-4]` included,
which assert the success path's exact flush chain, so that path gains nothing and
pays nothing.

## Dispatch precondition — owner items

**TWO items, both recommendations recorded with the cost of overruling them,
under the standing process of 2026-09-05
(`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`): the
maturing architect records a recommendation with its overrule cost, the session
proceeds under it, and the owner reverses it by dated amendment. This section is
the ONE place their text and their costs live; the rulings record cites it.**

**O12 — THE VALUE QUESTION: YES, build it. Recommendation: accept.** What it buys
is Table Z rows **Z1** and **Z2**'s sixth column and nothing wider: on the paths
where the flush COMPLETES, the artifact a completed, published run removed can no
longer come back — and each row states its own case, which are not the same. What
it costs is one `flushDir` per failure path — one `fsync` of a directory with a
pending unlink, **single-digit milliseconds on this host and that is the whole of
the claim**: the recorded pass is three runs of 200 samples on darwin/APFS, Node
v25.9.0, with medians **2.65, 2.50, 1.26 ms** against a clean directory's
0.03–0.07 (`FP-P5`), the same order as `QD-P2`'s **2.0–2.7 ms**. **The figure
moves with machine load between passes and the decision does not turn on its
precise value** — it lands on an arm that is already heading for a
preservation failure. The success path pays nothing (`FP-P3`). **Cost of
overruling:** this package is withdrawn; `WP-quarantine-preserve-durability` row
**F7(a)**'s 2026-09-06 clause needs a further dated clause returning rows **M2**
and **M3** to permanent exclusion; and the post-completion residual is accepted
for both owned paths — a disclosure nothing in the product carries today.

**O13 — THE DISPOSITION OF A FLUSH THAT DOES NOT COMPLETE: BEST-EFFORT — flush,
ignore the boolean. Recommendation: accept.** It changes no shipped contract
(Table D row **D3** is about a REMOVAL that cannot be completed, not about a
flush) and is a strict improvement wherever the flush completes. **Measured
indistinguishable at the interface, `FP-P6`:** **12 fault cases** — 2 acts × 2
arms × {the flush's `openSync` forced to throw, its `fsyncSync` forced to throw,
no fault} — **and 4 pristine baselines** (2 acts × 2 arms), 16 rows in all;
`quarantinePreserve` returns `null`, throws nothing and leaves `qdir` empty in
every one, exactly as the pristine tree does. **What the caller then does is that
BRANCH's business and is not generalized here — row Z3 decides it.** **Cost of
overruling** (making an
incomplete flush fail loud): a `WienerdogError` raised here propagates out of
`quarantinePreserve` and straight out of the gate
(`src/core/dream/validate.js:1346-1351`), so a redacted preservation that today
falls through to the withhold arm at `:1429` — shipped behaviour, asserted by
`tests/unit/dream-validate.test.js:1670-1695` — would instead abort the whole
dream run. That adds a new failure class on an arm that is already failing, and
it buys nothing: a flush that did not complete leaves the same residual whether
the run continues or stops.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | **exactly two inserted lines plus their two comments, and nothing else** — Table Z rows **Z1** and **Z2**, byte-exact under "Exact contracts". No helper is added, no existing line is edited, `flushDir` is reused |
| modify | tests/unit/dream-validate.test.js | new assertions only — one per act, per acceptance criteria **2**, **3** and **4**. **No existing assertion changes** (`FP-P3`) |
| create | tests/red-proofs/quarantine-failed-preserve-disposal-flush.proofs.json | two proofs, ids `failed-preserve-tmp-flush-dropped` (row **Z1**) and `failed-preserve-dest-flush-dropped` (row **Z2**) — both measured free against the 64 existing ids |

**`WP-quarantine-preserve-durability` is deliberately NOT in this table:** row
**F7(a)**'s 2026-09-06 clause already states this package's contract for rows
M2/M3, so **O12** and **O13** falsify nothing there — the Mirrored Surface
Checklist registers it and names what would change that.

### Exact contracts

**Each act gains one byte-exact four-line block — three comment lines and the
flush call — inserted after its removal and immediately before its `return
null;`. V1 matches each block byte-for-byte (row **Z5**); the two flush lines
are textually distinct, measured non-overlapping (`FP-P4`).**

Row **Z1**, after `src/core/dream/validate.js:984`:

```js
    // Best-effort (Table Z row Z3): a COMPLETED flush closes this removal's
    // post-completion window. The boolean is IGNORED — it does not change what
    // this function returns, and what the caller then does is its own branch.
    if (ownedTmp && DURABILITY_AVAILABLE) flushDir(qdir);
```

Row **Z2**, after `src/core/dream/validate.js:1020`:

```js
  // Best-effort (Table Z row Z3): a COMPLETED flush closes this removal's
  // post-completion window. The boolean is IGNORED — it does not change what
  // this function returns, and what the caller then does is its own branch.
  if (ownedDest && DURABILITY_AVAILABLE) flushDir(qdir);
```

Both comments are byte-identical apart from their indentation, both are
registered mirrors of row **Z3**, and **V1 owns them** — row **Z5**.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** the disposition of a flush that does not
complete is decided — a fallback behaviour on a failure arm; **(vii)** the same
contract appears in six mirrored surfaces — the comment at each of the two call
sites, the Deliverables cells, the acceptance criteria, the RED declarations, and
Table F row **F7(a)**'s external clause. Two of seven.

**This spec's canonical table is `Z`, a documented collision** of the kind
`docs/specs/done/WP-dream-promote-report.md:356-372` settled; the sweep that
chose it, on row ids rather than headings, is the round-zero record §0.5. **It
collides with `WP-dream-promote-report`'s own Table Z (rows Z1–Z5)** and with the
heading in `WP-dream-promote-in-workspace` and `WP-dot-segment-denial` — none in
this family, none deciding anything this spec relies on — so
`node scripts/mirror-walk.js` reports this spec's row ids AMBIGUOUS and never
fails on them. **The qualification a parser cannot check: every `Z<n>` in this
spec means a row of THIS spec's Table Z unless a path is given.** Table **D** and
Table **P** are `WP-preservation-abort-widening`'s, Table **F** and Table **C**
`WP-quarantine-preserve-durability`'s, Table **M**
`WP-quarantine-disposal-durability`'s, Table **N**
`WP-secret-fence-ep2-redact-arm`'s — all cited, none restated.

### Table Z — canonical: each act, its flush, and exactly what that flush reaches

This table is the single place these facts are decided; every other surface in
this spec cites it. **It decides nothing about the SUCCESS path** (Table F) and
nothing about the other three removal acts (Table M rows **M1**, **M4**, **M6**,
permanently excluded by row **F7(a)**'s dated clause).

| # | The act — the removal it follows | The line inserted after it | The directory flushed | Platform scope | What a COMPLETED flush closes | What a flush that does not complete, and win32, RETAIN | The evidence that reaches this row |
|---|---|---|---|---|---|---|---|
| **Z1** | the shared-`catch` removal of `tmp`, `src/core/dream/validate.js:984` — reached when the create, the write or the commit threw and `tmp` still names this call's inode | `if (ownedTmp && DURABILITY_AVAILABLE) flushDir(qdir);`, gated on the SAME boolean as the removal so a flush is issued only where a removal happened, and placed immediately before `return null;` | **`qdir`** — the removal's own parent: `state/quarantine/redacted/` on the redact arm, `state/quarantine/` on the withheld arm. Measured, `FP-P2` | POSIX only, row **F5**'s posture. On win32 no flush is issued, which is today's behaviour and is never called durable — row **Z4** | the post-completion window for THIS removal on THIS path: after the run has completed and published its record, a resurrected `.tmp-<pid>-<stem>` — secret-bearing bytes that no record, no banner and no cleanup pass names — can no longer appear. **That is all it closes** | the residual, unchanged from today: that same leftover, which the pending-review banner does not list (`listSecretQuarantine` skips dot-prefixed entries) and which makes the NEXT preserve of that name return `null` without removing it (`QD-P12`). Same class as owner item **O10**'s | `FP-P1` (zero flushes on the pristine tree, on both arms; exactly one `fsync` of `qdir` after the insertion, and zero on forced win32) and `FP-P2` (the parent). **The crash itself is not evidence and is not claimed** — see Implementation notes |
| **Z2** | the post-commit failure removal of `dest`, `src/core/dream/validate.js:1020` — reached when the flush set, the read-back or the byte comparison failed and `dest` still names this call's inode | `if (ownedDest && DURABILITY_AVAILABLE) flushDir(qdir);`, same gating and same placement, and TEXTUALLY DISTINCT from **Z1**'s line | **`qdir`**, same two directories, measured the same way. The flush is of the DIRECTORY, so it also covers the `tmp` unlink `:995` performed in that same directory on this path — an incidental consequence this package claims nothing about and which changes no Table M row | as **Z1** | the post-completion window for this removal: the measured case is `WP-quarantine-disposal-durability` row **M3** — the run completes, publishes `[{artifact, location: "quarantine"}]` (the withheld copy alone) and commits it, while a resurrected `<date>-<stem>` sits on a shelf that record does not name | **a RETAINED DATED ARTIFACT, `<date>-<stem>` — and its consequences are NOT row Z1's; measured, `FP-P9`.** On the **withheld** shelf the pending-review banner LISTS it (`listSecretQuarantine`), so *"a name no record reaches"* is false there — the same fact `WP-quarantine-disposal-durability` row **M3** records. On the **`redacted/`** shelf no user-facing surface lists it, and Table **N** bounds that shelf by COUNT and not by age, so it can persist indefinitely. On BOTH shelves the NEXT preservation of that note does not fail: the collision loop (`validate.js:960-963`) commits under the suffixed name — measured `2026-07-02-fp-1.md` — and the leftover is left in place. **Row Z1's `null`-returning collision is the dot-prefixed temp's behaviour and is not imported here.** | as **Z1** for the flush counts, plus `FP-P8` (the recipe that reaches THIS act under forced win32, and its discrimination), `FP-P9` (this cell's residual) and `WP-quarantine-disposal-durability`'s `QD-P11` for the published record this row's window sits after |
| **Z3** | — **the rule, not an act: the disposition of a flush that does not complete** | — the boolean `flushDir` returns is IGNORED at both call sites, and the reason is the comment both sites carry verbatim (row **Z5**) | — | — | — | — | **BEST-EFFORT, owner item O13.** `flushDir` catches its own `open` and `fsync` failures and returns `false`, and that boolean is discarded. **THE OBSERVABLE CONTRACT, and it is exactly this: the flush result does not change what `quarantinePreserve` RETURNS** — `null`, with nothing thrown — on either act, either arm, and whether the flush completed, failed at its `open`, or failed at its `fsync`. Measured, `FP-P6`: 12 fault cases and 4 pristine baselines, every row identical. **DOWNSTREAM BEHAVIOUR IS BRANCH-SPECIFIC AND UNCHANGED BY THIS PACKAGE, and no sentence here may generalize over the branches:** a failed `redacted` preservation can fall through to the withhold arm (`validate.js:1406-1429`), while a failed `withheld` preservation with no surviving redact copy still takes the EXISTING abort (`validate.js:1442-1459`) — that run publishes and commits nothing, before and after this package alike. Fail-loud is priced in **O13** and rejected |
| **Z4** | — **the rule, not an act: WHERE the platform gate lives** | — the `&& DURABILITY_AVAILABLE` conjunct in both inserted lines | — | — | — | — | **AT THE CALL SITE, and it is NOT optional.** `flushDir` has no platform gate; only `flushPreservation` does. Measured, `FP-P1`: with the conjunct dropped, a forced-`win32` run of the shared-catch arm issues **one** directory `fsync` on both arms — row **F5**'s posture violated. With the conjunct, forced `win32` issues **zero** |
| **Z5** | — **the rule, not an act: WHICH CHECK OWNS THE TWO COMMENT MIRRORS** | — the three comment lines above each flush call, byte-exact and identical apart from indentation | — | — | — | — | **V1 OWNS THEM, and nothing else does.** V1 matches each act's whole four-line block — removal line, three comment lines, flush call — byte-for-byte and requires it exactly once in the file. The RED declarations' `find` literals are the flush LINES only, and no behaviour test can read a comment, so without this V1 clause a `// WRONG COMMENT` would pass every other gate — **measured on a hand-built state (round-1 finding R1-D, and V1's eighth direction, `bad-comment` → red)** |

### Mirrored Surface Checklist

Every surface that mirrors **Table Z**, so a review finding updates the table and
all its mirrors in one pass and in the same commit:

- [ ] The three Deliverables rows, each restating a row's target
- [ ] The "Exact contracts" block — rows **Z1** and **Z2**'s byte-exact lines
- [ ] **In `src/core/dream/validate.js`: the comment above Z1's flush** — row
      **Z3**'s reason, copied verbatim. **Owned by V1** (row **Z5**), which
      matches the whole four-line block byte-for-byte; no other gate can see it
- [ ] **In `src/core/dream/validate.js`: the comment above Z2's flush** — the
      same text, a second copy, a second mirror, **owned by V1 the same way**
- [ ] Current state's enumeration of the two removals, the flushed directory,
      and the declaration count
- [ ] Owner item **O12** (the value verdict, citing Z1/Z2's sixth column) and
      owner item **O13** (row **Z3**'s disposition and its priced alternative)
- [ ] Acceptance criterion **1**, which is where row **Z5**'s whole-block match
      is asserted, and criteria **2**–**5**, which assert the rest
- [ ] Verification steps **V1**–**V3** — V1's byte-exact line and placement
      program, V2's two RED declarations, V3's suite assertions
- [ ] Implementation notes' statement of what the evidence reaches, and the
      block/declaration trap Z1's and Z2's line shape rests on
- [ ] The Security checklist's third item, which names the retained residual
- [ ] Out of scope's list of what this package does NOT decide
- [ ] **External, and it needs NO change while O12 is YES and O13 is
      best-effort:** `docs/specs/done/WP-quarantine-preserve-durability.md`
      Table F row **F7(a)**'s 2026-09-06 clause, which already states this
      package's contract for rows M2/M3. **It would need a further dated clause —
      never a rewrite of that one — if O12 were overruled to NO or O13 moved off
      best-effort**, because both are facts that clause asserts
- [ ] **External, cited and never restated:**
      `docs/specs/done/WP-quarantine-disposal-durability.md` Table M rows **M2**,
      **M3** and owner item **O11**, which own the decision that filed this
      package; and
      `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`'s
      **O12**/**O13** entries, which are citation-only

## Implementation notes & constraints

- **What the evidence reaches, and what it cannot.** A crash cannot be staged
  here: `QD-P1` removed a file under a 0700 directory with no directory flush
  400 times, across clean exits and `SIGKILL`s, with zero reappearances — which
  establishes only that a PROCESS crash is not the hazard. Every acceptance
  criterion reaches the flush CALLS, their placement, the directory they name,
  and the boolean being ignored. **None reaches what a power loss leaves, and no
  test may be named for crash survival.**
- **Do not wrap either removal in a block, and repeat the guard instead:** three
  RED declarations pin `:995` and `:1020` byte-for-byte at `occurrences: 1`, so
  bracing either edits a `find` literal out of existence and the runner errors at
  APPLY.
- **Criterion 4's suite assertion needs NO new `src/` seam.** `DURABILITY_AVAILABLE`
  is bound at module load from `process.platform` (`src/core/dream/validate.js:696`),
  and this suite already re-requires `validate.js` after mutating something it
  destructures at load: `stubCollaborators`
  (`tests/unit/dream-validate.test.js:1485-1502`) deletes
  `require.cache[VALIDATE_ID]` and re-requires. Forcing `process.platform` before
  that same delete-and-re-require is the identical mechanism. **Restore the
  platform AND the cache entry in a `finally`** — the file's own seam note says a
  leaked patch *"would silently corrupt every later test in the run"* (`:1414-1415`).
- **THE TWO FAULTS ARE DIFFERENT, and the obvious one is VACUOUS at row Z2.**
  **Z1** is reached by making `fs.linkSync` throw, on any platform. **Z2 is NOT
  reachable by making the artifact `fsyncSync` throw under forced `win32`:**
  `flushPreservation` returns before issuing any flush there, so the preservation
  SUCCEEDS and `:1020` never runs — measured, `FP-P1` returns an object, not
  `null`, on that recipe for the pristine, compliant and ungated trees alike.
  **Use a POST-FLUSH VERIFICATION failure instead:** corrupt the read-back through
  the artifact's own descriptor so `Buffer.compare` differs, `verified` stays
  `null`, `ownedDest` is true and `:1020` removes `dest`. **Assert that the fault
  fired, that `dest` was removed and that the result is `null` BEFORE counting
  flushes** — a count taken without that is a count of a path never entered.
  Measured discriminating on BOTH arms (`FP-P8`): under forced `win32` the
  Z2-ungated variant issues one `qdir` `fsync` and the gated one issues zero.
- **Reuse the existing seams; add no machinery.** `traceFlushes`
  (`tests/unit/dream-validate.test.js:2697-2717`) already resolves every
  `fsyncSync` to the path its descriptor was opened under; `patchFs`
  (`:1433-1438`) patches one `node:fs` method and returns its restorer.
- **`scripts/red-proofs.js` refuses a symlinked `node_modules`**, and refuses a
  `node_modules` on any ancestor of its sandbox. Where the worktree's is a
  symlink, run it against an export — `git archive HEAD | tar -x -C <dir>`, then
  `--root <dir>` — with `TMPDIR` under no `node_modules`.
- **Each `find` literal carries its leading indentation, and the two differ by
  identifier as well** — measured non-overlapping (`FP-P4`), which is what keeps
  each declaration's `occurrences: 1` true.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — this WP constructs no
      path.** `qdir` is already in scope at both sites, code-built from `stateDir`
      and a fixed segment (`:950-952`).
- [ ] **The surface at issue is secret-bearing bytes on a 0700 shelf, and this
      WP makes a removal more likely to stick and never less:** the flush runs
      after `removeOwnedQuarantinePath` has confirmed the path gone (Table D row
      **D3**) and its boolean is discarded, so no branch depends on it (`FP-P6`).
- [ ] **The retained residual is named, not omitted:** rows **Z1** and **Z2**,
      column seven — the class owner item **O10** of
      `docs/specs/done/WP-quarantine-disposal-durability.md` parks and prices.

## Acceptance criteria

- [ ] **1.** Rows **Z1** and **Z2** each carry their WHOLE four-line block —
      removal line, three comment lines, flush call — byte-exact as under "Exact
      contracts", exactly once in the file and immediately before `return null;`;
      and `src/core/dream/validate.js` contains exactly four lines mentioning
      `flushDir(` — the declaration, the one call inside `flushPreservation`, and
      these two (V1). **Matching the whole block is what makes V1 the owner of
      the two comment mirrors (row Z5); a wrong comment passes every other
      gate.**
- [ ] **2.** On POSIX, on each act and on BOTH arms, the removal is followed by an
      `fsync` of `qdir` — `state/quarantine/` on the withheld arm and
      `state/quarantine/redacted/` on the redact arm — asserted in
      `tests/unit/dream-validate.test.js` as a captured call sequence, with the
      `fsync` occurring after the removal (V3).
- [ ] **3.** The boolean is ignored: with the flush's `openSync` forced to throw,
      and separately its `fsyncSync` forced to throw, `quarantinePreserve` returns
      `null` and throws nothing on both acts and both arms — the same observable
      as with the flush working (V3).
- [ ] **4.** When `DURABILITY_AVAILABLE` is false, neither act issues a flush
      (row **Z4**) — asserted TWO ways, both falsifiable. **V1** pins the
      `&& DURABILITY_AVAILABLE` conjunct byte-exact at both call sites. **V3**
      drives a `validate.js` instance re-required with `process.platform` forced
      to `'win32'` and asserts **zero** `fsync` calls on both acts and both arms.
      **Each act needs its OWN fault, and row Z2's is not row Z1's** — see
      Implementation notes for both, and for why the artifact-`fsync` fault
      CANNOT be used at Z2. **Each assertion must establish that it reached its
      act BEFORE it counts flushes: the fault fired, the owned path was removed,
      and the result is `null`.** **What this reaches is the constant's branch,
      not the platform: a run on a real win32 host is not available here and is
      not claimed.**
- [ ] **5.** Two RED declarations, one per act, sharing one `testNamePattern`
      that runs BOTH acts' assertions. Each removes exactly that act's flush call
      and must redden exactly its own assertion, leaving the other green (V2).
- [ ] **6.** `npm test` (V3), `npm run lint` (V4) and the scoped mirror walk
      (V5) pass.
- [ ] **7.** Idempotence — **N/A: this WP ships no command and writes nothing
      outside the repository.**

## Verification steps (run these; paste output in the PR)

```bash
set -e   # REQUIRED, and each assertion is its OWN statement: bash exempts from
         # errexit any command that is not the last in an `&&` list.

# V1 — criteria 1 and 4, and row Z5: it MATCHES EACH ACT'S WHOLE FOUR-LINE BLOCK
#      byte-for-byte — removal line, three comment lines, flush call — so the two
#      comment mirrors have an owner. An earlier form checked only that the lines
#      between began with `//`, and a `// WRONG COMMENT` passed it (round 1,
#      R1-D). It refuses when the file is absent. The program goes through a
#      QUOTED heredoc so no nested quote can change what the gate matched.
cat > /tmp/fpdf-v1.js <<'PROGRAM'
const fs = require('fs');
const P = 'src/core/dream/validate.js';
if (!fs.existsSync(P)) { console.error('V1: ' + P + ' is absent'); process.exit(1); }
const L = fs.readFileSync(P, 'utf8').split('\n');
const die = (m) => { console.error('V1: ' + m); process.exit(1); };
const C = (i) => [
  i + "// Best-effort (Table Z row Z3): a COMPLETED flush closes this removal's",
  i + '// post-completion window. The boolean is IGNORED — it does not change what',
  i + '// this function returns, and what the caller then does is its own branch.',
];
const ACTS = [
  ['Z1', '    if (ownedTmp) removeOwnedQuarantinePath(tmp);', ...C('    '), '    if (ownedTmp && DURABILITY_AVAILABLE) flushDir(qdir);'],
  ['Z2', '  if (ownedDest) removeOwnedQuarantinePath(dest);', ...C('  '), '  if (ownedDest && DURABILITY_AVAILABLE) flushDir(qdir);'],
];
for (const [row, removal, ...block] of ACTS) {
  const whole = [removal, ...block].join('\n');
  const n = (s) => L.join('\n').split(s).length - 1;
  if (n(removal) !== 1) die(row + ': the removal line occurs ' + n(removal) + ' time(s), want 1');
  if (n(whole) !== 1) die(row + ": the removal, its three-line comment and its flush do not appear as one byte-exact block exactly once (found " + n(whole) + ')');
  const i = L.indexOf(removal);
  if ((L[i + block.length + 1] || '').trim() !== 'return null;') die(row + ': the flush is not immediately before `return null;`');
}
const sites = L.filter((l) => l.includes('flushDir(')).length;
if (sites !== 4) die('lines containing "flushDir(": ' + sites + ' (want 4 — the declaration, the call inside flushPreservation, and Z1 and Z2)');
console.log('V1 OK: Z1 and Z2 each carry their byte-exact comment-and-flush block after their removal and immediately before `return null;`');
PROGRAM
node /tmp/fpdf-v1.js

# V2 — criterion 5: each inserted flush is load-bearing, and each mutation
#      reddens ONLY its own act. The runner requires a green BASELINE, enforces
#      SET EQUALITY over own-body failures (so a mutation that also reddens the
#      other act's assertion FAILS here), and runs a fresh green CONTROL after.
#      If node_modules is a symlink here, see Implementation notes.
npm run red-proofs -- --wp WP-quarantine-failed-preserve-disposal-flush

# V3 — criteria 2, 3 and 4's suite half.
npm test

# V4 — lint.
npm run lint

# V5 — this spec's Mirrored Surface Checklist names only surfaces that resolve.
#      SCOPED, and the scope is not decoration: the UNSCOPED `node
#      scripts/mirror-walk.js` exits 1 on `b1d20ce0` ITSELF, from 14 UNRESOLVED
#      entries in unrelated specs that predate this package — measured, and the
#      UNRESOLVED block is byte-identical between the base and this branch (the
#      round-zero record, "the executor passes"). A reviewer who runs the bare
#      command sees that rc 1 and must not attribute it here. The scoped run
#      exits 0, and reports rows Z1–Z3 as AMBIGUOUS against
#      `WP-dream-promote-report`'s Table Z — reported, never failed, and resolved
#      by the qualification paragraph under "Contract reference".
node scripts/mirror-walk.js --scope quarantine-failed-preserve-disposal-flush
```

- **V1 is a NEW step and was proved in EIGHT directions before any adversarial
  round** — the runs are in the record: the deliverable ABSENT → red; the
  untouched tree → red; five violating states → red, each with its own message
  (the conjunct dropped, the flush moved before its removal, a third `flushDir`
  call site, only one act covered, **and one comment mirror replaced by
  `// WRONG COMMENT`**); the hand-built compliant state → green.
- **What V1 does NOT reach:** whether a flush ever completes on a real medium.
  It pins the call sites and their gating; V3 pins the calls that are issued.

## Out of scope (do NOT do these)

- **The success path.** Table F owns the flush protocol, its order, its fixed
  chain, its POSIX-only scope and the guarantee sentence — none changed, none
  reproduced here.
- **The other three removal acts** — `WP-quarantine-disposal-durability` Table M
  rows **M1**, **M4** and **M6**, permanently excluded by row **F7(a)**'s dated
  clause. M1 in particular is already inside row **F2**'s flush wherever that
  flush completes.
- **`pruneRedactedOriginals`' selection rule** (Table M row **M5**, owner item
  **O9**) and **the persistence of an unrecorded `redacted/` artifact** (owner
  item **O10**) — both `docs/specs/WP-quarantine-only-copy-shelf.md`'s.
- **Making an incomplete flush fail loud.** Owner item **O13** decides
  best-effort and prices the alternative; reversing it is a dated owner
  amendment, never an implementer's choice.
- **Editing any existing RED declaration**, any existing assertion, or
  `docs/specs/done/WP-quarantine-preserve-durability.md`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(dream): a best-effort flush after a failed preservation's removal (WP-quarantine-failed-preserve-disposal-flush)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
