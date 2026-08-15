---
id: WP-snapshot-read-path-hardening
title: Harden the vault snapshot's read path — open once, decide on the descriptor, bound the read
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004]
epic: audit-2026-07-29
---

# WP-snapshot-read-path-hardening: open once, decide on the descriptor, bound the read

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): nothing here starts anything, and every
change is synchronous work inside a call that already runs.

Two scheduled **routines** — `daily-digest` and `weekly-review` — are
capability-holding model sessions, and neither ever sees the live vault. Before
a routine starts, `makeVaultSnapshot` (`src/core/vault-snapshot.js`) copies a
**bounded, fixed per-routine slice** of the vault into that run's staging
directory, and the routine reads only the copy. Three caps bound the copy — 32
files, 2 MiB total, 256 KiB per file (`:29-31`) — and since
`WP-gate-vault-snapshot` a per-file **content gate chain** (decodability →
provenance on the notes slice → secret scan) decides whether a file may be
copied at all. An over-cap or gated-out file is skipped **visibly**, through the
returned `skipped[]`, never silently.

Both the caps and the gates rest on an assumption the code does not enforce:
**that the file whose properties were checked is the file that is then read.**
It is not. `makeVaultSnapshot` `lstat`s a path (`:156`) and later re-opens **that
path** (`fs.readFileSync(src)`, `:184`), so every decision taken in between — is
it a regular file, is it under the caps — is a decision about whatever the
FIRST resolution returned, while the copied bytes come from whatever the SECOND
one returns. And that second read is unbounded: the caps are enforced against
`st.size`, the size `lstat` reported, so a file that grows after its size check
is read whole before anything notices.

This work package is the read-path half of the owner's 2026-08-14 split ruling
(`docs/specs/logbook/2026-08-14-snapshot-read-hardening-scope-question.md`,
Resolution). The gate half shipped and is Done; its spec states in its own words
what it deliberately reserved for here — "nothing about HOW the path is checked
or opened" (`docs/specs/done/WP-gate-vault-snapshot.md:270`), the known-imperfect
row at `:271`, and Residual 7 at `:412`. The ruling's point 2 names four subjects: the
`lstat`→open race, the bounded read, `O_NOFOLLOW` Windows semantics, and the
descriptor lifecycle; its point 4 additionally routes the
symlinked-source-directory behaviour here as this package's open product
question, which the owner has since ruled
(`docs/specs/logbook/2026-08-15-snapshot-symlinked-source-directory-ruling.md`).
Sequencing, not dependency: this package needed the file
free, and it is (`e3c7474`).

**Value line.** The caps and the gates become properties of *the bytes that are
actually copied*, instead of properties of a filesystem observation taken a
moment earlier. A user gets the bound the product promises them — and the
promise stops being conditional on nothing having changed on disk in between.

**What this package deliberately does not do.** It does not touch the gates
(they took zero findings across both external rounds and are Done), does not
change any cap VALUE, and — by the owner's 2026-08-15 ruling, recorded in
`docs/specs/logbook/2026-08-15-snapshot-symlinked-source-directory-ruling.md`
and applied in Table A — does not refuse a symlinked source DIRECTORY.

## Current state

`src/core/vault-snapshot.js` (205 lines). `makeVaultSnapshot(paths, routineId,
stagingDir)` walks each plan slice, `readdirSync`s the source dir (`:141`),
picks `.md` names filename-descending (`:145-149`), and for each candidate does,
in order: `lstatSync` → `unreadable` on failure (`:154-160`); `!st.isFile()` →
`not a regular file (symlinks are never followed)` (`:161-164`); three cap
checks on `st.size` and the counters (`:165-176`); `readFileSync(src)` →
`unreadable` on failure (`:182-188`); the gate chain (`:189-193`); the write of
the original Buffer plus `fileCount += 1` and `totalBytes += st.size`
(`:194-198`).

Four measurements on this tree. The first three are re-runnable as written; the
race cases are staged deterministically by monkeypatching `fs.lstatSync` for the
one candidate path, which reproduces the window's OUTCOME (the checked file is
not the read file) without depending on timing.

1. **The `lstat`→open window, grow case — the symptom has MOVED since the gates
   landed** (measured 2026-08-15, and the reason this had to be re-run rather
   than copied): with `lstat` reporting 100 bytes for a 262145-byte file, the
   file is no longer copied past the cap. It is withheld with the reason
   **`appears to contain a secret`** — the secret scanner's oversized bail
   (`src/core/secret-scan.js:283`) firing on a text over `SCAN_MAX_BYTES`. The
   defect did not go away; its symptom changed from "262145 bytes copied past a
   262144-byte cap with an empty `skipped[]`" (round 1's reproduction, recorded
   at `docs/specs/done/WP-gate-vault-snapshot.md:271`) to a visible skip whose
   stated reason does not describe what happened.
2. **The `lstat`→open window, swap case — unchanged by the gates** (measured
   2026-08-15): with the candidate replaced by a symlink to an out-of-vault file
   inside the window, the out-of-vault file's content is copied into the
   snapshot and `skipped[]` is `[]`.
3. **A symlinked source DIRECTORY is followed — unchanged by the gates**
   (measured 2026-08-15): with `reports/dreams` a symlink to a directory outside
   the vault, its file is copied and `skipped[]` is `[]`. `readdirSync` resolves
   the symlink (`:141`), and a leaf refusal cannot see a directory-level one.
4. **The read is unbounded**: `readFileSync(src)` (`:184`) reads whatever the
   file is at read time. The gate WP measured the far end of that class — a file
   grown past `buffer.constants.MAX_STRING_LENGTH` (536,870,888) makes
   `toString('utf8')` throw `ERR_STRING_TOO_LONG` **out of `makeVaultSnapshot`**,
   uncovered by the read-error catch because the read itself succeeded
   (`docs/specs/done/WP-gate-vault-snapshot.md:267`). Not re-derived here, per
   the ruling's point 2.

Two more facts the contract below depends on, both measured on this tree
(darwin, node v24.18.0):

- `fs.constants.O_NOFOLLOW` is present and an open of a symlink with it fails
  (`ELOOP`); without it the same open succeeds and follows the link.
  `fs.constants.O_NONBLOCK` is present, and opening a FIFO **without** it blocks
  indefinitely (killed after 3 s), while with it the open returns at once and
  `fstat` reports `isFile() === false`. The repo's `|| 0` idiom degrades a
  missing constant to `0`, and `O_RDONLY | 0 === O_RDONLY` — a silent "follow".
- `MAX_FILE_BYTES` (`:31`) and `ScanLimits.SCAN_MAX_BYTES`
  (`src/core/secret-scan.js:22`, exported) are both `256 * 1024`: equal by
  coincidence, coupled in behaviour, documented nowhere. Surfaced by the gate
  WP's implementer, 2026-08-15.

**Two surfaces describe the snapshot's symlink posture, and both read as a
whole-path claim.** One is documentation: the `makeVaultSnapshot` JSDoc,
`Symlink-safe: every source is lstat-checked and only regular files are copied
(a symlink is skipped visibly, never followed)` (`:107-109`). The other is
user-visible at runtime: the skip reason `not a regular file (symlinks are never
followed)` (`:162`), which `src/core/routine-runtime.js:142` writes to stderr for
every skipped file. Nothing else in the repo describes it — `docs/THREAT-MODEL.md`
mentions the snapshot only as "bounded snapshots" (`:97`) and says nothing about
symlinks, `docs/ARCHITECTURE.md` does not mention the snapshot at all, and the two
routine skills describe `vault-snapshot/` as a read-only copy without naming
symlinks. Both surfaces are inside this WP's reach; Table A decides what happens
to each, and they are not decided the same way.

**Existing coverage.** `tests/unit/vault-snapshot.test.js` (411 lines) covers the
gates; `:390-411` covers the pre-existing skip reasons and records the property
"the over-cap file is rejected on its lstat size — it is never read, so no
content gate can have decided it" (`:407-408`).
`tests/unit/broker-wiring.test.js` holds `makeVaultSnapshot`'s older coverage —
six call sites from `:140`, including the over-cap and leaf-symlink skips at
`:176-200` and `assert.deepEqual(skipped, [])` at `:147`, `:173`, `:207`.

**CI runs ubuntu-latest and macos-latest only** (`.github/workflows/ci.yml:33`).
There is no win32 runner, so a win32-only behaviour is a stated posture and a
named residual, never a tested claim.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js:44-54: this
     spec file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/vault-snapshot.js | the read path per **Table A**, refusing in the order **Table C** fixes, with the open flags composed per **Table B**; the coupling statement at `MAX_FILE_BYTES`; and the four registered comment mirrors brought back into agreement with what the code then does |
| modify | tests/unit/vault-snapshot.test.js | cover the acceptance criteria below (the implementer designs the cases), and update the registered mirror at `:407-408` per the Mirrored Surface Checklist |
| modify | tests/unit/broker-wiring.test.js | `makeVaultSnapshot`'s older coverage lives here (Current state). Table A changes no observable behaviour these tests assert, so they are expected to pass UNCHANGED; listed so the boundary check permits a repair if one of them turns out to depend on an ordering this WP moves — a repair, if one is made, is recorded under "Decisions made" in the PR. Do not otherwise edit it |

### Exact contracts

`makeVaultSnapshot`'s signature, return shape, and **every skip reason string**
are UNCHANGED. This WP adds no reason and removes none; it changes only how the
file behind a candidate path is checked, opened and read.

```js
/** @param {import('./paths').WienerdogPaths} paths
 *  @param {string} routineId  a code-owned profile id (never config-supplied)
 *  @param {string} stagingDir the run's staging dir (the only writable root)
 *  @returns {{snapshotDir: string|null, skipped: Array<{file:string, reason:string}>}} */
function makeVaultSnapshot(paths, routineId, stagingDir)
```

## Contract reference

Activation (ADR-0031, 2-of-7) — two fire: **(iv)** the error, fallback and
precedence behaviour of every failure on this path changes (which check refuses
a file, and what a failed open or a failed close does); **(vii)** the same
contract appears in this spec, in four code comments, in a test comment, and in
several rows of a Done spec — the mirrors are registered below. Three canonical
tables, not two: **Table C** was extracted after two consecutive external rounds
landed a finding on the refusal-order contract, per ADR-0031's circuit-breaker.

### Table A — the snapshot's per-file read path

| Fact / rule | Value |
|---|---|
| SOURCE-path resolutions per candidate | Exactly TWO: the existing `lstat` (`:156`) and ONE `open`. After the open, every decision about the source is made on the **descriptor** — `fstat`, and the bytes read from it — and never by re-resolving the source path. Today's second resolution (`readFileSync(src)`, `:184`) IS the `lstat`→open window; it goes away. The DESTINATION side (`mkdirPrivate` and `writeFileSync`, `:194-196`) is unchanged and outside this count |
| What the pre-open `lstat` still decides | ONE thing: the non-regular-file refusal and its reason `not a regular file (symlinks are never followed)` (`:161-164`), unchanged, and on win32 it is the only symlink refusal there is (Table B). It decides NO cap — `st.size` stops being read. It stays for that ONE reason and cannot be dropped: on POSIX a symlink refused at the open reports only `unreadable`, and the reason string above is a preserved contract. It is advisory by construction — anything swapped in after it is caught at the open (POSIX) or at the `fstat`, with the single exception Table B names as the win32 residual |
| The open | `fs.openSync(src, FLAGS)` with FLAGS composed per **Table B** |
| Open failure | → the existing `unreadable` skip, whatever the errno, and the run continues. Deliberately NOT split per errno: the design must not depend on which errno a platform reports for a refused symlink, and `unreadable` is true of every case. Its position in the order, and what that position changes: **Table C, row 3** |
| `fstat` on the descriptor | The authoritative type check for anything that OPENS: `st.isFile()` false → the `not a regular file (symlinks are never followed)` skip. WHICH objects reach it, and with what precedence: **Table C, rows 2-5** |
| The read | BOUNDED: at most `MAX_FILE_BYTES + 1` bytes, read from that descriptor to EOF. No whole-file read of a path or a descriptor anywhere in the module. The `+ 1` is what makes "it grew past the cap" observable instead of silently truncated. WHAT exactly is bounded is three quantities, not one — see the row below |
| What is BOUNDED — three distinct quantities, and (c) is not implied by (a) and (b) | **(a) bytes requested** from the read primitive: never more than `MAX_FILE_BYTES + 1` for one candidate. **(b) bytes accumulated** across the reads for that candidate: the same bound. **(c) allocated capacity** held for that candidate's source content: the same bound, REGARDLESS of what `fstat` reported or how large the source is. (c) is listed separately because (a) and (b) do not give it — measured 2026-08-15: a Buffer sized to a 120,965,360-byte source and filled with only `MAX_FILE_BYTES + 1` bytes satisfies (a) and (b), produces the required cap skip, and still holds 461× the cap in memory. The resource-exhaustion class this WP closes is (c) as much as (a) |
| Read failure | → `unreadable`, the same reason as today (`:185-187`); its position in the order: **Table C, row 6** |
| Cap decisions — all three, ONE surface | The bytes ACTUALLY READ, evaluated after the read, with today's reason strings: per-file (`bytesRead > MAX_FILE_BYTES`) → file count (`fileCount + 1 > MAX_FILES`) → total (`totalBytes + bytesRead > MAX_TOTAL_BYTES`) — **Table C, rows 7-9**. Neither `lstat` nor `fstat` size decides a cap. This is the fix for Current state measurements 1 and 4: a file that grows in the window is refused by the cap it exceeds rather than copied past it, and a partially-read file is never copied as if it were whole |
| Byte accounting | `totalBytes += bytesRead` (was `st.size`, `:198`). The bytes charged are the bytes copied |
| What deciding after the read costs | An over-cap file is now opened and read up to the bound before it is refused, where today it is refused on `lstat` size and never opened. Two consequences, both stated rather than smoothed over: the reason-assignment crossover (**Table C**'s two closing rows), and the memory question, which is why boundedness is pinned as THREE separate quantities in the row below. What does NOT change: the caps still precede the gate chain, so no content gate can decide an over-cap file. Note what it does to the comment at `tests/unit/vault-snapshot.test.js:407-408`: only its derived half survives ("no content gate can have decided it"), while its first clause ("rejected on its lstat size — it is never read") is exactly what this row inverts — which is why that comment is a registered mirror below |
| Descriptor lifecycle — the scope BEGINS AT THE OPEN and ends with the read | ONE descriptor per candidate, inside a `try`/`finally` that opens IMMEDIATELY after a successful `open` — before the `fstat`, not around the read alone — and closes when the bounded read returns or fails, ahead of the cap decisions, the gate chain and the write. Every skip decided inside that scope leaves through the `finally`. A narrower scope leaks, measured 2026-08-15: a directory OPENS successfully under these flags and is then refused by the `fstat` type check having read nothing, so a `finally` around the read alone never runs. An `fstat` failure maps to the existing `unreadable` skip. Because the descriptor is gone before the write, the write side stays outside this question: `mkdirPrivate`, called at `:195`, THROWS `WienerdogError` "on a symlinked ancestor OR a symlink/non-dir at the final component" (its own documented contract, `src/core/private-fs.js:237-238`, thrown at `:244`) — pre-existing behaviour this WP does not change, and it now has nothing open to leak |
| Close posture — what is promised, and what is not | PROMISED: every successful `open` is paired with EXACTLY ONE `close`, on every path. That is the promise because it is what code can guarantee and a test can assert. NOT promised: that the kernel never retains a descriptor — darwin documents `EINTR` on `close(2)` (measured 2026-08-15, `man 2 close`). A `close` that fails is SWALLOWED: it never throws out of `makeVaultSnapshot` and never turns a completed copy into a skip. Retrying a failed `close` is deliberately not required — the value of a retry is not established here, and this WP does not add a mechanism on that basis |
| The single-read invariant, inherited and unchanged | ONE read whose bytes feed BOTH the gate decision and the copy (`docs/specs/done/WP-gate-vault-snapshot.md:255`). Hardening the read must not reintroduce a gate→copy window: the bytes gated, the bytes written and the bytes charged are the same bytes, from the same read |
| The `MAX_FILE_BYTES` / `SCAN_MAX_BYTES` coupling, made explicit | The scan runs on `buf.toString('utf8')`, and gate 1 has already established that this text re-encodes to exactly `buf`, so the scanner sees exactly `bytesRead` bytes. While `MAX_FILE_BYTES <= ScanLimits.SCAN_MAX_BYTES`, the scanner's oversized bail (`secret-scan.js:283`) is therefore unreachable from this path; today it IS reachable, through the grow case (Current state, measurement 1). Raise `MAX_FILE_BYTES` above `SCAN_MAX_BYTES` and legitimately-sized files start being withheld WHOLE under a reason that does not describe what happened. REQUIRED: state the relation where `MAX_FILE_BYTES` is declared, and ASSERT it, so raising one without the other fails a test instead of silently degrading the product |
| ACCEPTED, not changed — a symlinked source DIRECTORY is FOLLOWED | Ruled by the owner on 2026-08-15 and recorded in `docs/specs/logbook/2026-08-15-snapshot-symlinked-source-directory-ruling.md`, which carries the ruling, its grounds and its rejected alternatives; this row applies it: a symlinked source directory is the user's own configuration choice and is followed. `readdirSync` resolves it (`:141`) and `O_NOFOLLOW` refuses only the FINAL path component, so files enumerated through a symlinked `07-Daily` or `reports/dreams` are copied (measured — Current state, measurement 3). Considered and rejected: **refuse** — breaks an ordinary layout, e.g. a user who symlinks their daily-notes folder in from a cloud-synced directory loses their routine's input overnight; and **resolve-and-bound** — a new mechanism and a new error class (mount points, case sensitivity, path normalization) that still breaks that same user, whose target is outside the vault root by definition. Grounds: planting the symlink needs write access to the vault directory on the user's machine, which is outside the threat model's remote attacker, who reaches Wienerdog through content. The file-LEVEL refusal is unchanged and not in question. **The obligation this carries:** the JSDoc claim at `:107-109` currently reads as a whole-path property and must instead state that the refusal is file-level and that a symlinked source directory is followed by design |
| Reason vocabulary | UNCHANGED and complete: `unreadable`, `not a regular file (symlinks are never followed)`, the three cap strings, and the three gate reasons. Nothing is added and nothing is removed. WHICH of them a candidate failing several checks takes is decided by **Table C**, not here, and Table C names the single assignment that changes. **The symlink phrasing inside `not a regular file (symlinks are never followed)` is preserved verbatim, deliberately**: it is printed only when a LEAF refusal fires, so in the only context it ever reaches a user it is accurate, and rewording it would break the vocabulary this row freezes. The whole-path reading is corrected in the documentation prose instead — see the accepted-directory row's JSDoc obligation |
| Preserved unchanged | The three cap VALUES, `SNAPSHOT_PLANS` and its `dir`/`newest`/`provenanceGated` values, the filename-descending pick, the gate chain and its order, the write of the ORIGINAL bytes, the budget rule that a skipped file consumes neither count nor bytes, the visible-skip contract, 0700 dirs / 0600 files, the mirrored layout, the empty-plan path, the everything-gated-out shape, and the function's signature and return shape |

### Table B — platform posture, per flag

The whole point of this table is that a flag which does not exist on a platform
is a **stated posture**, never an inherited one. The silent-degrade measurement
that makes this necessary is in Current state and is not restated here.

| Flag | POSIX | win32 | Consumer |
|---|---|---|---|
| `O_RDONLY` | present | present | the open is read-only; the snapshot never writes through this descriptor |
| `O_NOFOLLOW` | present; an open whose final path component is a symlink FAILS — **measured here on darwin**; ubuntu-latest is the other CI leg | **documented by Node as absent — NOT measured here**, and the contract below is written so nothing rests on that | closes the swap case (Current state, measurement 2) at the open, on the platform that can. Read the value from `fs.constants`; never hardcode a number — it is platform-specific |
| `O_NONBLOCK` | present; a FIFO opens at once instead of blocking (measured here on darwin — Current state) | **documented as absent — NOT measured here**; the hazard it guards is the POSIX FIFO one | turns "a FIFO swapped in after the `lstat` hangs the routine forever" into an ordinary visible skip, via the `fstat` type check |
| Composition rule | an EXPLICIT branch whose fallback names, in a comment, what is absent and what is lost by its absence | same | Whether that branch keys on `process.platform === 'win32'` or on whether the constant is present is the implementer's call, recorded under "Decisions made" — the contract deliberately does not rest on the win32 claim this table could not measure. What IS forbidden is the bare `\|\| 0` idiom: it makes a missing flag look like a present one |
| win32 posture, stated | — | The leaf-symlink refusal on win32 is the pre-open `lstat` ALONE, so the `lstat`→open window stays open there for a symlink swap. Every OTHER defect this WP fixes is closed on win32 too: the caps move to the bytes read, the read is bounded, and the descriptor lifecycle is defined | a **named residual**, on the same grounds as the source-directory ruling above — planting the symlink needs local write access to the vault directory, which the threat model's remote attacker does not have. Not CI-testable (Current state: there is no win32 runner) |

### Table C — the refusal ladder

Every per-candidate refusal, in evaluation order. This table is the single place
the ORDER and the REASON ASSIGNMENT are decided; Table A's rows cite it instead
of restating it. It exists because two consecutive external rounds landed a
finding on this contract family, which is the ADR-0031 circuit-breaker's
condition for extracting a contract rather than patching it again.

| # | The check | Reason it produces | Same assignment as today? |
|---|---|---|---|
| 1 | `lstat` fails | `unreadable` | yes |
| 2 | `lstat` reports a non-regular file — symlink, socket, FIFO, directory, device | `not a regular file (symlinks are never followed)` | yes; the candidate is never opened |
| 3 | `open` fails, ANY errno — `ELOOP` for a symlink swapped in under `O_NOFOLLOW`, `EACCES` for an unreadable file, and a socket, whose open fails before a descriptor exists (measured 2026-08-15) | `unreadable` | **NO — this is the crossover.** Today the per-file cap is decided on `lstat` size before any open, so a candidate that is BOTH over-cap and unopenable reports the cap reason: measured 2026-08-15, a 300 KiB mode-`000` file yields `exceeds the 262144-byte per-file cap`. Under this ladder it yields `unreadable`. **Owner-ruled 2026-08-16:** accepted and stated, rather than preserved by restoring an `lstat`-size pre-check — the contract this WP preserves is the reason VOCABULARY and the visible-skip property, not every assignment produced by the `lstat`-size-first order this WP exists to replace, and a second cap surface is the duplication the original defect came from |
| 4 | `fstat` fails | `unreadable` | new position; the reason class is unchanged |
| 5 | `fstat` reports a non-regular file — a directory, or on POSIX a FIFO under `O_NONBLOCK`; measured, a character device too | `not a regular file (symlinks are never followed)` | **NO** — today nothing checks the type after the open, so a post-`lstat` swap goes undetected. This row is the fix |
| 6 | the bounded read fails | `unreadable` | reason unchanged; **new position** — it now precedes every cap reason, the same crossover as row 3 |
| 7 | `bytesRead > MAX_FILE_BYTES` | `exceeds the ${MAX_FILE_BYTES}-byte per-file cap` | reason unchanged; decided on the bytes READ, not on `lstat` size |
| 8 | `fileCount + 1 > MAX_FILES` | `exceeds the ${MAX_FILES}-file cap` | yes |
| 9 | `totalBytes + bytesRead > MAX_TOTAL_BYTES` | `exceeds the ${MAX_TOTAL_BYTES}-byte total cap` | reason unchanged; decided on the bytes read |
| 10 | the gate chain — decodability → provenance (notes slice) → secret scan, first gate that fires | its three reasons, verbatim | yes — Done work (`WP-gate-vault-snapshot` Table A), called and not changed |

| What the ladder preserves | What it changes |
|---|---|
| The eight reason STRINGS exactly — none added, none removed; the visible-skip contract; caps before gates; one refusal per candidate | Access, type and read failures (rows 3-6) now precede every cap reason (rows 7-9), so a candidate failing BOTH an access/type check and a cap reports the access/type failure. That is the direct consequence of deciding caps on the bytes actually read, and rows 3 and 5 are the ONLY reason-assignment changes in this WP |

### Mirrored Surface Checklist

- [ ] Deliverables-table cells (the `vault-snapshot.js` row cites Tables A, B and C)
- [ ] **Table C is canonical for refusal order and reason assignment.** Its
      mirrors are Table A's open-failure, `fstat`, read-failure, cap-decision,
      cost and reason-vocabulary rows — each cites it and none restates it — plus
      the acceptance criteria on type refusals and on the reason set. A finding
      about the order is fixed in Table C first, then walked through those
- [ ] Acceptance criteria that assert Table A, and Table B's three flag rows.
      Table B's COMPOSITION RULE is review-checked, not test-checked — with no
      win32 runner there is nothing a test can assert about it, and the
      round-zero pass that dropped the two candidate greps is why no
      verification command mirrors this table either (Implementation notes)
- [ ] Current-state description — the four measurements and the coupling
- [ ] Implementation notes: the descriptor lifecycle and the named residuals
- [ ] Security checklist: the accepted symlinked source directory and the win32
      residual
- [ ] **The accepted-directory fact appears in five places in this spec and they
      move together:** the Context paragraph ("What this package deliberately
      does not do"), Table A's accepted-directory row (canonical here), the
      security checklist, the Out-of-scope bullet, and the acceptance criterion
      on the JSDoc statement. Its own record —
      `docs/specs/logbook/2026-08-15-snapshot-symlinked-source-directory-ruling.md`
      — is the RULING, not a mirror: a later round updates this spec to it,
      never it to this spec
- [ ] **Three comment mirrors inside `src/core/vault-snapshot.js`**, registered
      here on the recommendation carried over from PR #7's spec-fidelity review,
      finding 5. Each restates a contract fact this WP touches, so each moves
      with Table A: (1) the `makeVaultSnapshot` JSDoc block `:104-124` — the
      `Symlink-safe` claim `:107-109` (Table A's accepted-directory row makes it
      file-level), plus "consumes NEITHER budget" `:111-112` and the no-fallback
      paragraph `:116-118`, both preserved and to be left saying so; (2) the
      read-site comment `:177-181` — "Read ONCE, AFTER the caps" is exactly the
      ordering Table A inverts, so it must be rewritten to the new one; (3) the
      write-site comment `:196` — "the ORIGINAL bytes; no gate rewrites a copy",
      preserved verbatim in meaning
- [ ] **A fourth mirror, measured while registering the three:** the module
      header's exceed-behaviour paragraph `:9-11` ("an over-cap file is skipped
      VISIBLY … never silently, and never failing the whole run for one
      oversized file"). Table A preserves it exactly; it is registered so a later
      round that changes the cap contract cannot leave it behind
- [ ] **A fifth mirror, and the only one outside `src/`:** the comment at
      `tests/unit/vault-snapshot.test.js:407-408` — "The over-cap file is
      rejected on its lstat size — it is never read, so no content gate can have
      decided it." Table A's cost row keeps the second clause and abolishes the
      first, so the comment is rewritten with this change. It sits in a
      Deliverables file, so no boundary stands in the way

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types; no build step
  (CLAUDE.md). Everything Table A needs is in `node:fs`.
- ADR-0004: nothing here starts anything.
- **Reuse, do not reimplement.** The gate chain, `parseNoteResult` and
  `scanAndRedact` are called exactly as they are today; this WP touches what is
  handed to `gateReason`, never what `gateReason` does.
- The bounded read is a read loop, not a single call: `readSync` may return
  fewer bytes than asked for. Reading `MAX_FILE_BYTES + 1` and stopping at EOF
  is the contract; the loop's shape is the implementer's.
- **Addendum to a Done spec, recorded here rather than by editing it.**
  `docs/specs/done/WP-gate-vault-snapshot.md:267` enumerates the three failure
  classes covered by "no gate throws" and states that a RESOURCE failure is not
  among them, naming the bounded read in this WP as what would close it. With
  Table A's bound, no Buffer on this path can exceed `MAX_FILE_BYTES + 1` bytes,
  so `ERR_STRING_TOO_LONG` and the large-allocation class are closed here. That
  row is a mirror of this contract; it is not edited, because a Done spec is a
  record of what shipped.
- **Named residual (round zero) — no mechanical guard against reintroducing
  either idiom.** Two verification greps were drafted and dropped:
  `! grep -q 'readFileSync' …` did not guard what it claimed (a `readSync` loop
  to EOF passes it while violating Table A's bound) and would go RED on a
  correct implementation, because this spec itself orders the read-site comment
  rewritten and the natural rewrite names `readFileSync`; `! grep -q '|| 0' …`
  collides head-on with Table B, which requires a comment NAMING the absent
  flag. A check that punishes the correct answer is worse than no check
  (`docs/runbooks/codex-review.md`, "Prove a new gate in BOTH directions"), and
  machinery may grow only in the smallest form that guards a product behaviour.
  What guards these instead: the acceptance criteria below, and review.
  **External round 1 then showed the criterion as first written did not guard it
  either** — an unbounded read of a 120 MB source succeeds in milliseconds
  (measured), so slurp-then-compare yields the same per-file cap reason. The
  criterion is now stated at the READ PRIMITIVE rather than at the outcome,
  which is the guard the grep never was. The greps stay dropped; what replaced
  them is a criterion, not machinery.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — no untrusted
      identifier reaches a filesystem path or a shell command here.** Candidate
      names come from `readdirSync` of a code-built directory and are joined to
      it with `path.join`; this WP adds no path or command construction.
- [ ] The surface this WP actually touches is **the boundary between what the
      snapshot checked and what it copies.** Containment after Table A: the file
      opened is the file read (one descriptor, no re-resolution), the caps are
      enforced against the bytes read, the read is bounded, and every failure
      degrades to a visible skip.
- [ ] **Named residual — a symlinked source DIRECTORY is followed** (Table A,
      owner ruling 2026-08-15), with its rationale and its rejected
      alternatives recorded there and the claim stated in the code's own prose.
- [ ] **Named residual — the win32 leaf-symlink window** (Table B): on win32 the
      refusal is the pre-open `lstat` alone and the swap case stays open there.
- [ ] **Named residual — nothing here bounds a source the user's own machine
      writes.** Both residuals above, and the accepted directory case, share one
      boundary: they need local write access to the vault, which is outside the
      threat model's remote attacker.

## Acceptance criteria

- [ ] A candidate that is under the per-file cap when its type is checked but
      over it by the time it is read is SKIPPED with the per-file cap reason,
      is not copied, and is not copied truncated — and specifically not with the
      `appears to contain a secret` reason it produces today (Current state,
      measurement 1).
- [ ] A candidate replaced by a symlink after its type check is never copied
      (POSIX), and its skip is visible in `skipped[]` (Current state,
      measurement 2).
- [ ] The type refusals land where **Table C** puts them: a pre-existing
      non-regular candidate at row 2; a post-`lstat` swap whose open fails at
      row 3; a non-regular object that opens successfully — a directory, or a
      FIFO on POSIX — at row 5. In no case does the run hang or throw.
- [ ] A candidate that cannot be OPENED is skipped with `unreadable`, whatever
      the failure was, and the run continues — the failure class whose producer
      this WP moves from the read to the open. The existing mode-000 case
      (`tests/unit/vault-snapshot.test.js:310-321`) now fails at the open rather
      than at the read and must still report exactly that reason.
- [ ] Every copied file is byte-identical to the bytes read from its descriptor,
      and the byte budget is charged those same bytes.
- [ ] The reason set is exactly today's eight strings: none added, none missing.
      A candidate failing several checks reports the one **Table C** assigns —
      including the crossover it names: a candidate that is BOTH over the
      per-file cap and unopenable reports `unreadable`, where today it reports
      the cap reason.
- [ ] All THREE bounded quantities in Table A's boundedness row hold for one
      candidate, each asserted separately because none implies the next:
      **(a)** no read request exceeds `MAX_FILE_BYTES + 1` bytes; **(b)** the
      bytes accumulated never exceed it; **(c)** the source-content capacity
      allocated or retained never exceeds it, whatever `fstat` reported and
      however large the source is. Neither an outcome check nor (a)+(b) gives
      (c) — measured 2026-08-15: a whole-file read of a 120,965,360-byte source
      succeeds in milliseconds, and a Buffer sized to that source but filled
      with only `MAX_FILE_BYTES + 1` bytes satisfies (a) and (b) while holding
      461× the cap. Alongside all three, and not instead of them: such a source
      is skipped with the per-file cap reason and nothing is copied.
- [ ] Every successful open is paired with exactly one close, on every path —
      including the `fstat` type refusal, which reads nothing; an open-time
      refusal; a read failure; a cap skip; a gate skip; a successful copy; and a
      run in which the write side throws (Table A's close-posture row states
      what is deliberately NOT promised beyond this).
- [ ] `MAX_FILE_BYTES <= ScanLimits.SCAN_MAX_BYTES` is asserted, and the
      relation and its consequence are stated where `MAX_FILE_BYTES` is
      declared (Table A's coupling row).
- [ ] The JSDoc states that the symlink refusal is file-level and that a
      symlinked source directory is followed by design (Table A's
      accepted-directory row); the other three registered mirrors agree with
      what the code does.
- [ ] Everything in Table A's preserved-unchanged row is unchanged, including
      the gate chain and its order, the caps' values, the empty-plan path and
      the everything-gated-out shape.
- [ ] `npm test` and `npm run lint` pass. `tests/unit/broker-wiring.test.js` is
      expected to pass UNCHANGED; if a case there turns out to depend on an
      ordering this WP moves, its Deliverables row permits the repair and the
      repair is recorded under "Decisions made".

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "vault-snapshot"
npm test
npm run lint
```

- This WP adds NO new verification step, deliberately: the two greps drafted for
  it were dropped in round zero (Implementation notes), so there is nothing here
  that needs a both-directions proof. Every acceptance criterion above is
  asserted by the test suite the first command runs.

## Out of scope (do NOT do these)

- The gates themselves — Table A's chain, its order and its reasons are Done
  work (`WP-gate-vault-snapshot`) and are called, not changed.
- Refusing or resolving a symlinked source DIRECTORY — ruled ACCEPTED by the
  owner on 2026-08-15
  (`docs/specs/logbook/2026-08-15-snapshot-symlinked-source-directory-ruling.md`,
  applied in Table A). Note the resolution here; do not edit the Done spec whose
  Residual 7 predates the ruling.
- The frontmatter parser's fail-open on five opener shapes (BOM, blank line,
  space, CRLF, tab) — its own queued item, and digest-owned.
- The two named-but-unwritten follow-ups — a secret-scan limit guard, and
  `WP-alert-producer-freeform-residual` (whose non-existence
  `docs/specs/done/WP-neutralize-alert-callout-rendering.md:167` records).
  Neither has a spec file, so neither is a dependency of this one and neither is
  "queued" by anything enforceable.
- The `state/` read-back robustness boundary (scheduler job name, dream ledger)
  — a named candidate, not queued, and not a live path.
- Widening or narrowing any cap VALUE, plan `dir`/`newest`, or the
  filename-descending pick.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including both directions for the two new assertions.
2. Conventional commits; PR titled
   `fix(snapshot): open once, decide on the descriptor, bound the read (WP-snapshot-read-path-hardening)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
