---
date: 2026-09-06
title: "Design gate: WP-quarantine-disposal-durability — round zero, the measurements, and the value verdict"
related_wps: [WP-quarantine-disposal-durability, WP-quarantine-preserve-durability, WP-preservation-abort-widening, WP-secret-fence-ep2-redact-arm, WP-quarantine-banner-location]
---

# Design gate: `WP-quarantine-disposal-durability`

## Base statement

- **Base:** `origin/main` at `66b2b1f8040b93a9af4f1cda25c3ac307da64f6d`.
- **Branch:** `docs/wp-quarantine-disposal-durability`, in the worktree
  `/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/qdd-design`.
- **What the maturing pass produced.** The Draft stub asked a value question
  first and allowed it to answer "no". It did. The spec takes `Superseded`,
  moves to `docs/specs/done/` per `docs/specs/README.md`, and
  `WP-quarantine-preserve-durability`'s **Table F row F7(a)** gains one dated
  clause making its exclusion permanent. The second question the stub routed
  here — the retention prune's SELECTION rule — is not a durability question, is
  measured reachable, and is parked as owner item **O9**.
- **Owner items O8, O9 and O10** (O10 added by round 1) are recorded citation-only in
  `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`; their
  text and their enumerated overrule costs live in the spec's
  `## Dispatch precondition — owner items`, which governs.
- **Where the measurements ran: SCRATCH ONLY.** Every probe below ran under
  `/private/tmp/claude-501/.../scratchpad/architect4/`. `QD-P3`–`QD-P10` execute the SHIPPED `src/core/dream/validate.js` from a
  `git archive HEAD | tar -x` copy of the tree whose ONLY edit is one added
  export line (`pruneRedactedOriginals`, needed because the module does not
  export it); that edit is in the scratch copy and never in the worktree.
  `git status --porcelain` in the worktree was empty before and after every
  probe run.

## STOP CRITERION — pinned BEFORE any external round

**Step 0 — THE BAND GATE.** Every finding carries a materiality band (A / B / C)
beside its disposition, and the band decides whether the round can close at all:

- **Any band A finding** → the round does not close; the ladder below routes it.
- **A round whose findings are all B or C, and none of which the ladder classes
  as OWNER, DESIGN, EXTRACTION or HEAVY** → the fixes land, are verified
  mechanically, and the loop closes without a fresh external round.
- **A round that finds nothing about the product** → DONE.

**Then the per-finding ladder, first match wins.**

1. **OWNER** — a finding arguing to FLIP a call site's answer in **Table M**'s
   "Decided" column, or to change a shipped posture (Table D row **D3**'s
   fail-loud removal, Table N row **N7**'s best-effort prune, the identity-gated
   delete's "a stale duplicate, not a hazard"). → **PARKED as an owner item with
   a recommendation and its enumerated overrule cost. NOT blocking, and it does
   not extend the loop** — the standing process of 2026-09-05 is what lets the
   session proceed under a recommendation. Both **O8** and **O9** are already of
   this kind; a third becomes **O10**.
2. **DESIGN** — a MEASURED claim falsified: a crash window, a platform
   behaviour, `QD-P4`'s predicate, or `QD-P5`'s observed call order. → **RE-MEASURE
   from files, in the scratch tree; the re-measurement decides, never the
   argument.** HEAVY if the re-measurement moves a Table M "Decided" cell.
3. **EXTRACTION (ADR-0031)** — two consecutive rounds landing a finding on the
   same contract family, which here is **Table M and its registered mirrors**. →
   stop fixing finding-by-finding, do a contract-extraction pass over Table M,
   update every mirror in the Mirrored Surface Checklist in the same commit, then
   resume.
4. **HEAVY** — a finding that changes the Deliverables row, the byte-exact clause
   between the `f7a-clause` markers, or what an acceptance criterion asserts. →
   fixes land, then a FULL fresh external round.
5. **LIGHT** — a mirror, a citation, a verification-machinery or a wording
   finding. → fixes land and are verified mechanically (`mirror-walk`, the V
   block re-run green, the range check re-run); the loop closes without another
   external round.
6. **CLOSE** — as step 0's third bullet. Machinery findings at that point are
   fixed within the existing surface or accepted as named residuals.

**THE ROUND RULE (convergence by freezing surface).** This package ships no
product behaviour, so its verification surface is **FROZEN at V1–V4 plus the two
`f7a-clause` markers**. No round may add a fifth verification step: a finding
about the machinery is fixed inside that surface or accepted as a named residual.

**FALLBACK.** If two external rounds run and the loop has not closed — or if a
round lands a band A finding against the value verdict itself (**O8**) that a
re-measurement does not settle — the package does **not** keep iterating. The
fallback is to **withdraw the clause's "PERMANENT" wording back to a deferral,
re-file the spec as `Draft` at `docs/specs/`, and put the value question to the
owner as a direct question rather than a recommendation.** That is one revert
plus one move, it is cheaper than a third round, and the measurements below
survive either way.

## The measurements — run FROM FILES, in scratch

Each probe is a checked-in-nowhere script under the scratch `probes/` directory
and was run with `node` v25.9.0 on darwin 26.5, `/private/tmp` on APFS
(`/dev/disk3s5`, `apfs`). The probe files are named beside each result.

### QD-P1 — what a non-durable removal actually does on this host (`qd-p1.js`)

A child process creates a 0600 file under a 0700 directory, `rmSync`s it with
**no directory flush anywhere**, and then either exits cleanly (`process.exit(0)`)
or `SIGKILL`s itself immediately after the unlink. The parent re-reads the
directory.

```json
{ "platform": "darwin", "iterations": 200,
  "reappeared_after_clean_exit": 0, "reappeared_after_SIGKILL": 0,
  "entries_left_in_qdir": 0,
  "F_FULLFSYNC_exposed": false, "fsyncSync_returns": "undefined" }
```

**What it establishes:** a *process* crash is not the hazard — 400 unflushed
unlinks, zero reappearances. **What it CANNOT reach, and this is the load-bearing
half:** the hazard is a kernel panic or a power loss, and neither can be staged
on this host. So every "crash window" statement in the spec's Table M is DERIVED
FROM THE CODE and is labelled as such; none of them is dressed as a measurement.
The probe also re-confirms that the product can neither request nor observe a
stronger barrier, which is the ground Table F row **F7(c)** already stands on.

### QD-P2 — what a durable removal would cost (`qd-p2.js`, `qd-p2b.js`)

`qd-p2.js`, 200 iterations each: `write+unlink+dirflush` **3.1487 ms**;
`write+unlink` alone **0.3079 ms**; `dir open+fsync+close` over an **unmodified**
directory **0.0341 ms**. The 2.84 ms gap between the first two is the real
figure, and `qd-p2b.js` isolates it by timing the `fsync` call itself:

| | run 1 | run 2 |
|---|---|---|
| `fsync` of a DIRTY directory (an unlink just landed) | **2.0684 ms** | **2.6700 ms** |
| `fsync` of a CLEAN directory (nothing pending) | 0.0046 ms | 0.0016 ms |

**Why the distinction matters and is not pedantry:** a flush after a removal is
always the dirty case, so the cost of a disposal-durability protocol on this host
is **2.0–2.7 ms per removal**, roughly 500× the clean-directory figure. **Routed,
not folded in:** `WP-quarantine-preserve-durability`'s "*one directory
`open`+`fsync`+`close` is 0.018 ms*" is the CLEAN-directory shape, while its own
row **F3** chain flushes a `qdir` that a `link(2)` just dirtied — so that
package's cost line is likely an understatement. That is a finding about a `Done`
spec outside this package's Deliverables; it is disclosed here and changed
nowhere.

### QD-P3 — is the prune's live-run selection reachable at all? (`qd-p3.js`)

Runs the **shipped** `pruneRedactedOriginals` against a scratch `redacted/` shelf
holding: N old originals, M copies in the pruning run's own `created` set, and
one copy written by ANOTHER still-running invocation (newest mtime, absent from
`created`).

| case | before | after | run A's fresh copy evicted |
|---|---|---|---|
| B created 0, 60 old | 61 | 50 | no |
| B created 20, 40 old | 61 | 50 | no |
| B created 50, 5 old | 56 | 50 | **yes** |
| B created 60, 0 old | 61 | 60 | **yes** |

The fourth row is the one that decides the shape of the answer: the pass evicted
the other run's artifact and **still ended ten over the cap** — the eviction
achieved nothing at all.

### QD-P4 — the exact precondition (`qd-p4.js`)

The same driver, sweeping the pruning run's own `created` size across the cap at
0, 10, 48, 49, 50, 51 and 60, each against both 5 and 60 old entries — fourteen
points.

```text
predicate: "the other run's NEWEST copy is evicted"  ==  "created.size >= REDACTED_RETENTION_CAP"
holds for every row: true
```

Evicted: no at 0/10/48/49; **yes** at 50/51/60. At 51 and 60 the shelf ends at 51
and 60 — above the cap — so the eviction is pure loss. **This is the predicate
owner item O9's recommended guard is built on, and it is measured rather than
reasoned.**

### QD-P5 — is the post-commit temp removal already durable? (`qd-p5.js`)

A RUN, not a reading: a real `quarantinePreserve` on both arms, with `fs.rmSync`,
`fs.openSync` and `fs.fsyncSync` traced and each directory descriptor resolved
back to its path.

```text
withheld: rm .tmp-<pid>-n.md → fsync artifact fd → fsync dir quarantine → fsync dir state → fsync dir core
redacted: rm .tmp-<pid>-n.md → fsync artifact fd → fsync dir redacted → fsync dir quarantine → fsync dir state → fsync dir core
temp_removal_is_followed_by_a_flush_of_its_own_directory: true (both arms)
```

**NARROWED BY ROUND 1 — read R1-A before this paragraph.** As written below it is
true only of the no-fault POSIX path, which is all this probe exercised: the
post-commit removal of `tmp` is inside Table F row F2's flushed set **when the
whole flush set completes, on POSIX**, because `tmp` lives in `qdir` and `qdir` is
the chain's first member. That
is Table M row **M1**, and it is why the value question's cost side is smaller
than the stub assumed: the one removal whose leftover has a functional
consequence (a later same-pid run hitting `EEXIST`) needs nothing from a disposal
package.

## Every cited range, checked at BOTH ends (`ranges.sh`)

Run mechanically, not read. **Four citations were wrong at one end on the first
pass and were corrected before the first commit:**

| citation | first draft | corrected | why |
|---|---|---|---|
| `removeOwnedQuarantinePath` | l.674-688 | **l.674-687** | 688 is the blank line after the function |
| `acquireLock` | `lock.js:24-53` | **`lock.js:23-54`** | 24 is the first body line, 53 the last statement — both ends inside the construct |
| the prune-eviction routing | `WP-quarantine-banner-location.md:255-260` | **:250-263** | both ends landed mid-sentence; the construct is the whole paragraph |
| the only-copy-shelf routing | `WP-quarantine-banner-location.md:1415-1422` | **:1415-1426** | the end landed mid-sentence inside the bullet |
| the table-letter ruling | `WP-dream-promote-report.md:356-366` | **:356-372** | same shape |
| the private-mode scan | `private-fs.js:667-671` | **:667-672** | 671 is inside the second `if`; the block closes at 672 |

All other cited ranges resolved at both ends unchanged:
`validate.js` l.663, l.772-783, l.984, l.995, l.1006, l.1020, l.1166-1191,
l.1186, l.1488-1491, l.1549; `digest.js` l.854-864; `THREAT-MODEL.md` l.107,
l.124, l.128.

## Both-directions proof for the four NEW verification steps

The gate is run from a **script** that EXTRACTS the spec's own ```` ```bash ````
block and runs it under `set -e` (`run-v.sh`), so what is proved is what the spec
says and not a retyping. Reds are built in fresh `git clone --no-hardlinks`
copies with `origin/main` pinned to the base SHA (`reds.sh`).

| state | want | got | what fired |
|---|---|---|---|
| the finished worktree | GREEN | **GREEN** | `V2 OK: line 944 is its base row plus exactly the clause` |
| an untouched clone (control) | GREEN | **GREEN** | — |
| the clause deleted | RED | **RED** | V1's counted grep |
| the clause duplicated in the row | RED | **RED** | `the clause occurs 2 times in the changed line` |
| a SECOND line of the amended file edited | RED | **RED** | `lines changed: [11,944]` |
| a byte changed ELSEWHERE ON THE AMENDED LINE | RED | **RED** | `the changed line is NOT its base row plus exactly the clause` |
| the status left `Draft` | RED | **RED** | V3's `grep -qx` |
| the spec ALSO left in `docs/specs/` | RED | **RED** | V3's `test ! -e` |
| a stray edit under `src/` | RED | **RED** | V4 |
| **the amended file ABSENT entirely** | RED | **RED** | V1's `test -f` guard |
| the `f7a-clause` markers removed from the spec | RED | **RED** | `f7a-clause blocks: 0 (want 1)` |

**Two findings came out of running this rather than reading it, and both were
false GREENS:**

- **Z1 (band A, LIGHT fix).** V3 was written as
  `test -f … && grep -qx … && ! test -f …`. Under `set -e` bash exempts from
  errexit **any command whose return status is inverted with `!`**, so an
  AND-list ENDING in one cannot fail the script: the "status left `Draft`" and
  "spec not moved" trees both read **GREEN**. → **FIXED** by making each
  assertion its own statement and using `test ! -e` (where the `!` is `test`'s
  operand, not the shell's). Both trees then went RED.
- **Z2 (band A, HEAVY-adjacent, caught before the first commit's proof run).**
  The first draft's V1 asserted *"zero deletions in the amended file"*, copied
  from the ADR-amendment precedent. **That criterion is UNSATISFIABLE for this
  act**: the clause is inserted INSIDE an existing line, which git counts as one
  deletion plus one addition, so the gate could never pass. → **REPLACED** by
  V2's reconstruction check (exactly one line differs, and it is the base row
  plus exactly the clause), which is strictly stronger — it also sees an edit
  elsewhere on the same line, which no count can.
- **Z3 (band C, LIGHT).** The first `f7a`-marker mutation removed the marker text
  everywhere in the spec, including from V2's own regex literal — a self-defeating
  mutation that reddened for the wrong reason. Re-run removing only the two
  standalone marker LINES; it then reddened at the extractor, `blocks: 0`. Noted
  as a fragility rather than fixed: the gate's pattern lives in the file it
  guards, so a spec-wide search-and-replace can disable it. **Accepted residual**
  — the alternative is a checked-in script, which is machinery this package's
  frozen-surface rule forbids.

## Internal coherence pass

Read end to end, then re-run. Nine substantive findings, all FIXED in the same
commit:

| # | finding | disposition |
|---|---|---|
| **C1** | The table-letter paragraph said the three colliding specs are "none of which this spec cites, and none of which is therefore in this spec's mirror-walk resolution scope" — **naming them is exactly what puts them in scope**, and `mirror-walk` reports AMBIGUOUS references because of it. **[STALE — round 2's finding R2-E: this cell said "one", the tool said nine, and the count moved again with round 2's own checklist edits. The count is no longer written in the spec at all; the run's output is pasted under "Round 2" below.]** | FIX: the paragraph now states the mirror-walk verdict, that the tool reports ambiguity and never fails on it, and that every row id in the spec means a row of THIS spec's Table M unless a path is given |
| **C2** | The Deliverables cell still said "Zero deletions in that file" — the Z2 criterion | FIX: the cell now cites V2's reconstruction and says outright that it is never a deletion count |
| **C3** | Current state said "Five removal acts exist"; the spec elsewhere says "three call sites" | FIX: **three call sites performing five removal ACTS**, with the five Table M rows named |
| **C4** | Context's "two of the three sites" left the granularity implicit | FIX: "two of the three CALL SITES (Current state counts the five removal ACTS they perform)" |
| **C5** | O8's overrule cost said "three removal sites", which double-counts against C3 | FIX: "the three call sites … four removal acts, since row **M1** already needs none" |
| **C6** | Table M's title named only "the five removals" while the table carries **M0** (the act) and **M5** (a selection question that is not a removal) | FIX: the title now names all three kinds |
| **C7** | The Mirrored Surface Checklist said "Acceptance criteria 1–3" after the criteria were renumbered to six | FIX: names criteria 1–4 and V1–V4 |
| **C8** | The same checklist said "the five removal sites" | FIX: "the three call sites, their five removal acts and their line ranges" |
| **C9** | Definition of done cited V1/V2/V3 after the V steps were renumbered to V1–V4 | FIX |

**Runnable criteria, RUN.** Criteria 1–4 map to V1–V4 and all four exit 0 on the
finished tree (green above); criterion 5 is `npm run lint`, which passes;
criterion 6 is marked `N/A` with its reason. **One lint failure was found and
fixed by running rather than reading:** `MD056/table-column-count` on Table M row
**M2**, because a literal `|` inside `` `O_CREAT|O_EXCL` `` split the cell —
rewritten as `` `O_CREAT` with `O_EXCL` ``.

`node scripts/mirror-walk.js --scope quarantine-disposal` → **RESOLVED**, exit 0,
AMBIGUOUS references reported and resolved by prose qualification — **the COUNT
this line originally carried is withdrawn as stale (round 2, R2-E); the run's own
output is under "Round 2" below**.
`scripts/check-frontmatter.js` → passed, 269 specs.

## The size count (the stub's "measure the surface before sizing")

Counted before writing `size:`, and it is the reason the answer being "no"
matters more than it looks:

- **3 call sites, 5 removal acts** (Table M rows M1–M4, M6).
- **`tests/unit/dream-validate.test.js`: 168 top-level tests**, of which **45**
  name quarantine / redaction / preservation / prune / tmp / dedup surfaces and
  **5** are the retention-prune tests specifically.
- **3 RED-proof declarations pin a removal call-site line byte-for-byte**
  (`destination-removal-not-gated`, `tmp-removal-dropped`,
  `tmp-removal-not-gated`), all with `occurrences: 1`, and **two of them share
  one `find` string** — so an edit to `validate.js:995` breaks two declarations
  at once. That is a hidden dependency an implementer would have hit.
- **Verdict:** had the value question answered yes, the package would have been
  **M at best, not S** — four removal acts to flush, a NEW failure disposition at
  one of them, two shipped `best-effort` postures in front of the owner at the
  others, at least three new RED identities with their mutations, and the five
  retention tests to extend. The frontmatter's `size: S` is now a historical
  field on a `Superseded` record, not a plan.
- **Spec length: 466 lines.** Above the 400 aimed for and far below the 900 and
  650 recorded as residuals on the two preceding packages. The bulk that resisted
  trimming is the fully-commented V block (~60 lines, and the Z1/Z2 findings are
  why its comments are load-bearing) and Table M's seven rows.

## What round zero did NOT change

- **The success path.** No row of Table F, Table D, Table P or Table N is
  amended. The only edit outside this package's own files is the single dated
  clause inside Table F row **F7(a)**'s cell.
- **Any shipped posture.** Table D row D3's fail-loud removal, Table N row N7's
  best-effort prune and the identity-gated delete's "a stale duplicate, not a
  hazard" are unchanged, and O8's whole point is that they are measured correct
  as written.
- **The guarantee sentence**, which is `WP-quarantine-preserve-durability`'s,
  pinned by that package's V1, cited here and copied nowhere.
- **`WP-quarantine-preserve-durability`'s Dispatch precondition item 4**, which
  cites the spec at its old path. Named residual under the spec's Deliverables:
  that section is a point-in-time dispatch record whose gate has already run, and
  the amendment lives in the canonical row that owns the fact.

## External rounds

| round | verdict | raw files (commit SHA) | findings and dispositions |
|---|---|---|---|
| 0 | — (internal) | this record | Z1–Z3 and C1–C9, all fixed or accepted above; one lint failure fixed by running |
| 1 (`7f489d15`) | needs-attention / needs-attention | `docs/specs/logbook/2026-09-06-quarantine-disposal-gate-raw-round1-codex-plugin.txt` (`0f73cf4f`), `docs/specs/logbook/2026-09-06-quarantine-disposal-gate-raw-round1-herdr-shadow.txt` (`03ba7d57`); both committed pre-adjudication, porcelain identical before and after | Plugin 1 A; shadow 2 A + 1 B; no scope objections. **Three findings, all routed DESIGN or record by the pinned ladder — none argued to BUILD the package.** R1-A, R1-B, R1-C below, plus **R1-D self-found** during the round's coherence re-run |
| 3 (`40504f64`) | needs-attention / needs-attention | `docs/specs/logbook/2026-09-06-quarantine-disposal-gate-raw-round3-codex-plugin.txt` (`1148b69c`), `docs/specs/logbook/2026-09-06-quarantine-disposal-gate-raw-round3-herdr-shadow.txt` (`3731803d`); both committed pre-adjudication, porcelain identical before and after | Plugin 2; shadow 2 A + 2 B; no scope objections. **No finding reverses O8–O11** — all four are decision SUPPORT, two of them about sentences that argued where the rows already decide. R3-A…R3-E below |
| 2 (`03c56ed1`) | needs-attention / needs-attention | `docs/specs/logbook/2026-09-06-quarantine-disposal-gate-raw-round2-codex-plugin.txt` (`efdab74d`), `docs/specs/logbook/2026-09-06-quarantine-disposal-gate-raw-round2-herdr-shadow.txt` (`61f211f1`); both committed pre-adjudication, porcelain identical before and after | Plugin 3; shadow 1 A + 1 B; no scope objections. **THIRD consecutive round on O8's supporting sentence → the repeat-kind rule fires and the answer is a DESIGN change: O8 loses its universal sentence and the disposition becomes Table M's per-act column.** R2-A…R2-E below |

## Round 1

**Branch:** `docs/wp-quarantine-disposal-durability`. **Tip reviewed:**
`7f489d15f2b36ce5a1711c1f2112d8020d451168`, base `main` `66b2b1f8`. Both channels
executed rather than read; both reported the same environment limits (`npm test`
and the red-proofs entrypoint blocked by a read-only sandbox / TMPDIR `EPERM`, no
crash staged), which is exactly what `QD-P1` already says no evidence can reach.

**The band gate (step 0) does not close this round:** three band A findings. **The
ladder routes none of them to OWNER-blocks-nothing and none to HEAVY-builds-the-WP.**
Two are DESIGN — a measured claim falsified, so the answer is a RE-MEASUREMENT and
not an argument — and one is a record defect. **The verdict O8 records was
re-derived from the new measurements, not defended:** it stands, narrowed, and the
two sentences that were falsified are withdrawn in place.

### R1-A — M1 treats the post-commit unlink as unconditionally flushed (plugin F1, band A; shadow F2, band B; CONVERGED). Classification: measured-claim → **DESIGN**

**What the reviewers executed and what it showed, reproduced here independently
before anything was rewritten.**

- **`QD-P6` (new).** `flushPreservation` (`src/core/dream/validate.js:857-864`)
  SHORT-CIRCUITS: `if (!flushFd(fd)) return false;` precedes the chain, and the
  chain itself returns on the first `flushDir` that fails. Fault-injecting the
  artifact `fsync` and then the `qdir` `fsync`, on BOTH arms, reproduces the
  reviewers' trace exactly — `rm .tmp-<pid>-n.md` → `fsync … -> THROWS (injected)`
  → `rm 2026-09-06-n.md` → `null`, with **`completed_qdir_flush_index: -1`** and
  `temp_unlink_covered_by_a_COMPLETED_flush_of_its_own_dir: false` in all four
  fault cases. The two no-fault rows still show `true`, so `QD-P5` was not wrong —
  it was NARROW, and the cell built an unconditional claim on it.
- **`QD-P7` (new).** With `process.platform` forced to `win32` before the module
  loads, a SUCCESSFUL preservation issues **`fsync_calls: 0`** and its trace is the
  single line `rm .tmp-<pid>-n.md`. `DURABILITY_AVAILABLE` (`validate.js:696`) is
  false there, so no removal in Table M is ever covered by a flush on win32.
  `QD-P5` had run only on darwin.
- **`QD-P8` (new), because the shadow asked for the `O_EXCL` claim to be verified
  rather than asserted.** Planting a leftover at the deterministic
  `.tmp-<pid>-<stem>` name this process owns and calling the shipped
  `quarantinePreserve`: it returns **`null`** — an ordinary preservation FAILURE —
  and `leftover_still_present: true`, `leftover_bytes_unchanged: true`. So the
  designed response is the FAILURE ROUTE (Table P's, for a `null` preserve), never
  a cleanup: the leftover is not removed, because row F8 and Table D row D1 forbid
  removing a name this call did not create.
- **`QD-P10` (new), the re-pricing.** Median over 60 iterations per shape: the
  window from the unlink to `qdir`'s COMPLETED flush is **4.079 ms** (withheld, 4 KB),
  **3.9217 ms** (withheld, 256 KB) and **3.5032 ms** (redacted, 4 KB), against a
  PRE-removal window — the temp's whole existence, create to unlink — of
  **0.661 / 0.8685 / 1.0321 ms**. The post window is 3–6× the pre window, which is
  the opposite of what the round-zero draft implicitly assumed.

**Disposition: FIX, and the fix is a scoping, not a reversal.** Row **M1**'s
*"not reachable"* is withdrawn in place; the row now says the window is OPEN from
the unlink until `qdir`'s flush COMPLETES, gives its measured width, names the
three paths on which it does not close (artifact-`fsync` failure, `qdir`-`fsync`
failure, win32), and routes those paths to row **M2** — whose leftover, name and
disposition are identical. **A platform-scope paragraph now sits under Table M and
applies F5 to every row**, and **the F7(a) clause was rewritten** to carry the
scope and to drop the coverage sentence entirely. O8's supporting sentence (a) is
withdrawn there too. **HEAVY by the ladder** (an acceptance-relevant assertion and
the clause bytes moved) → a full fresh external round is owed.

### R1-B — Table M treats retention as time-bounded cleanup (shadow F3, band A). Classification: contract → **DESIGN**

**Re-measured before restating.** `QD-P9` (new) drives the shipped
`pruneRedactedOriginals` over four shelves, each holding a "resurrected" artifact:

| shelf | before → after | resurrected artifact survives |
|---|---|---|
| 20 entries (below the cap), artifact OLDEST | 20 → 20 | **yes** |
| 50 entries (exactly at the cap), artifact OLDEST | 50 → 50 | **yes** |
| 61 entries (above the cap), artifact OLDEST | 61 → 50 | no |
| 61 entries (above the cap), artifact NEWEST | 61 → 50 | **yes** |

That matches Table N as written — row **N2** (a prune happens only when a future
run completes at least one redaction), row **N5** (the cap YIELDS), row **N6** (the
overshoot's lifetime is *the next redacting run*, explicitly not time-bounded) —
and the guard `if (total <= REDACTED_RETENTION_CAP) return;`
(`src/core/dream/validate.js:1172`). **So a resurrected `redacted/` copy may
persist indefinitely, and the round-zero cells were wrong.**

**Disposition: FIX in the rows, and PARK the product question.** *"evicts it in
time"* (M3), *"self-healing"* (M4) and *"evicted in time"* (M6) are withdrawn in
place and replaced by Table N's actual eligibility rule. **The equivalence O8
rests on is untouched** — the artifact is present under the same name on the same
shelf whichever entrance reached it — and the re-measurement makes O8's case
STRONGER, because the pre-removal entrance is now known to lead to a state with no
clearing mechanism at all. **Whether the product should ACCEPT that persistence is
a statement about Table N's shipped posture and therefore the owner's:** parked as
owner item **O10** with a recommendation (accept and name) and its enumerated
cost, per the ladder's OWNER rung. **HEAVY** → the fresh round R1-A already owes
covers it.

### R1-C — O9 routes a measured data-loss class to a work package that does not exist (shadow F1, band A). Classification: record → **LIGHT fix, but the fix is a new file**

`git ls-tree` and a filename sweep confirm the shadow: `WP-quarantine-only-copy-shelf`
appeared only in `done/` specs and logbooks, never as a file under `docs/specs/`.
**A `Superseded` package cannot be the carrier for a live data-loss class, and a
name is not a carrier at all.**

**Disposition: FIX by FILING the stub** — `docs/specs/WP-quarantine-only-copy-shelf.md`,
`status: Draft`, `depends_on: [WP-quarantine-banner-location]`, carrying the banner
question that package had already routed to it, O9's selection question with
`QD-P3`/`QD-P4` cited, O10's persistence question with `QD-P9`, the three candidate
answers, "What done means" items and a "Watch out" — and **no Deliverables table**,
because a boundary drawn around three unanswered product questions would be a
guess. The precedent is this session's own: the git-env-pinning loop filed
`WP-dream-git-env-validate-seam` the same way. **The verification surface did NOT
grow:** the existence assertion is folded into V3, because the round rule freezes
the surface and a routing that names a file is a record property, not a product
behaviour.

### R1-D — the move broke a Mirrored Surface Checklist entry in the predecessor (SELF-FOUND during round 1's coherence re-run; band A; record → **LIGHT**)

**Neither channel found this, and the reason it was missable is the lesson.**
Round zero ran `node scripts/mirror-walk.js --scope quarantine-disposal`, which
walks the checklists **of** the scoped specs. **A scoped walk cannot see an
INBOUND reference** — an entry in ANOTHER spec's checklist naming the file that
moved. Run unscoped, the tool said:

```text
UNRESOLVED — 1:
  docs/specs/done/WP-quarantine-preserve-durability.md:1791 names spec path
  docs/specs/WP-quarantine-disposal-durability.md, which does not exist
```

That entry is the predecessor's registration of THIS spec's Context paragraph as
an external mirror, and the file had moved to `done/` in the same commit. The
unscoped walk **exits 1**.

**Disposition: FIX, and it widens the Deliverables from one line to three.** Both
live pointers to this spec inside the predecessor are repathed — the checklist
entry (line 1793) and Dispatch precondition item 4 (line 356) — so the earlier
draft's *"named residual"* for item 4's path is **withdrawn**: once a second edit
to that file is mandatory, carrying a knowingly rotted path for the sake of a
one-line diff buys nothing. **V2 was rewritten to assert exactly three edits and
no fourth**, each by reconstruction from its base line: one line is the base row
plus the clause, two are the base line with the path substituted, and any other
change to any of them fails. That is a fix INSIDE the frozen surface — V2 already
existed and already reconstructed; it did not become a fifth step.

**Measured, so the fix is not confused with the pre-existing state:** the unscoped
walk reports **14** unresolved entries on `origin/main` itself, all of the same
shape, and diffing its UNRESOLVED block between `66b2b1f8` and this tip returns
**empty** — this branch removed the one it introduced and touched none of the
other fourteen. Those fourteen are **disclosed and not repaired**: they are
outside this package, they predate it, and CLAUDE.md's rule is to note what else
is broken rather than fix it.

**Both-directions re-proved after the rewrite**, now eleven broken states, all
RED, control and finished tree GREEN — including two new ones this finding
requires: **r10**, one of the two repaths left stale (`lines changed: [356,944]
(want exactly 3)`), and **r11**, the only-copy stub deleted so O9 routes to a name
again (`FAILED at: test -f docs/specs/WP-quarantine-only-copy-shelf.md`).

### What round 1 did NOT change

- **The verdict.** O8 stands. It was re-derived from `QD-P6`–`QD-P10`, not
  defended: what decides it is the EQUIVALENCE between the crash-before and
  crash-after states, and no finding touched that. The two supporting sentences
  that WERE falsified are withdrawn in place rather than reworded.
- **Any shipped posture.** D3, N7 and the identity-gated delete's comment are
  unchanged; O10 is parked precisely so that N7's posture is not changed by side
  effect.
- **The Superseded outcome, and the ladder is why.** Neither DESIGN finding argued
  that a removal must be made durable; both argued that sentences ABOUT the
  removals were false. **Had the re-measurement shown the equivalence failing for
  any removal act, this record would say so and recommend a narrower `Ready` WP for
  that act — it does not, and `QD-P6`'s fault rows are the reason: on every
  non-closing path the leftover is the same object M2 already owns.**
- **The stop criterion**, which is unchanged and governed round 1 as written.
- **Two citations in `Done` specs that R1-C's fix makes stale, disclosed and NOT
  repaired:** `docs/specs/done/WP-quarantine-preserve-durability.md`'s Out of
  scope calls `WP-quarantine-only-copy-shelf` *"proposed and not filed"*, and
  `docs/specs/done/WP-quarantine-banner-location.md:1419` calls it *"Proposed
  successor, not yet filed"*. Both are point-in-time prose, neither is a
  registered mirror, and **neither makes any tool red** — which is exactly what
  separates them from R1-D, whose entry did. The stub's frontmatter and header are
  the governing statement of its existence.
- **The fourteen pre-existing `mirror-walk` UNRESOLVED entries**, measured
  identical at `66b2b1f8` and at this tip (R1-D). Noted, not fixed.

### Round 2 is owed

R1-A and R1-B are both HEAVY, so a **full fresh external round runs on the revised
tip**, with the prior findings listed and the reviewer asked to verify each is
genuinely fixed rather than re-worded, and to attack the new mechanisms: the
platform-scope paragraph, M1's conditional coverage, M2's widened role, the
restated M3/M4/M6 cells, O10, and the filed stub.

## Round 2

**Branch:** `docs/wp-quarantine-disposal-durability`. **Tip reviewed:**
`03c56ed118414049383db5bbf7eaa5a31fc4c849`, base `main` `66b2b1f8`. Both channels
executed; porcelain identical before and after. Plugin: 3 findings (1 A + 2
graded A in the body, reported medium). Shadow: 1 A + 1 B. No scope objections.
Both again reported the environment limits `QD-P1` already covers — no crash was
staged, and the shadow additionally could not re-run `QD-P6`–`QD-P10` because the
probe scripts are deliberately uncommitted and its sandbox is read-only.

**THE BAND GATE DOES NOT CLOSE THIS ROUND, AND THE LADDER'S TOP RUNG IS NOT WHAT
FIRES.** Three band-A findings. But the decisive fact is not any one of them: it
is that **this is the THIRD consecutive round landing a finding on O8's supporting
SENTENCE** — round zero's draft, round 1 (coverage, "designed response"), round 2
(pricing, lifetime, and the temporal equivalence itself). The runbook's repeat-kind
rule is explicit: when two consecutive rounds land findings of the same kind, the
next step is a **design question, never another textual patch**.

### THE DESIGN ANSWER — O8 loses its universal sentence

**The design question:** can a single claim about "every removal act" be true here
at all? **Round 2 answered no by measurement** (R2-A), and the answer is
structural rather than a wording fix: the five acts sit at different points in the
run — two inside a preservation that then FAILS and is followed by a fallback, a
report and a commit; one inside a preservation that SUCCEEDS; one after
`promote()` has already returned; one inside the gate's own refusal arm. **Their
crash-before and crash-after states therefore differ in different ways, and no
sentence spans them.**

So: **the universal sentence is WITHDRAWN, not reworded, and the disposition of
this package becomes exactly Table M's last column** — each act decided on its own
comparison of the two states. The F7(a) clause and the spec's header now cite that
column, and the clause itself is split per act. **Two acts fall out of the
exclusion entirely** (below).

### R2-A — the equivalence is FALSE at M3 (and at M2). Shadow F1, band A; classification measured-claim → **DESIGN**

**Re-measured before anything was rewritten, with a new probe.** `QD-P11` drives
the SHIPPED `makeGates({stateDir}).secret(…)` through the redact-arm fall-through:
a soft (redact-severity) note, the FIRST artifact `fsync` fault-injected so the
`redacted/` preservation fails while the withheld one still works. The whole trace
of that one gate call:

```text
rm quarantine/redacted/.tmp-<pid>-fp.md
fsync artifact #1 -> THROWS (injected: the redacted preserve fails)
rm quarantine/redacted/2026-07-02-fp.md
rm quarantine/.tmp-<pid>-fp.md
fsync artifact #2
fsync dir quarantine
fsync dir <stateDir>
fsync dir <core>
```

```text
fsyncs_of_redacted_dir_ANYWHERE: 0
published_preservation_record: [{ "artifact": "2026-07-02-fp.md", "location": "quarantine" }]
files_left_in_redacted: []
files_left_in_quarantine: ["2026-07-02-fp.md"]
```

**Three facts follow, and the third is the finding.** (1) `redacted/` is never
`fsync`ed anywhere in the call, so M3's window does NOT end at the function return
— the earlier cell's bound was wrong. (2) The run continues: the withheld fallback
at `validate.js:1429` succeeds, `validate.js:1463` records only that copy, and the
report is published and committed. The control flow is a shipped, tested behaviour
(`tests/unit/dream-validate.test.js:1670`) and is cited rather than re-derived.
(3) **Therefore the two states differ**: a crash BEFORE `:1020` ends the run before
any fallback or report; a crash AFTER it can follow a run that COMPLETED and
published a record omitting the artifact.

**Why that is a contract violation and not an untidy leftover.**
`WP-preservation-abort-widening` Table D row **D4**
(`docs/specs/done/WP-preservation-abort-widening.md:417`) says *"**`null` means the
owned path is absent.**"* A resurrection makes D4 FALSE for a finished run. **[WITHDRAWN — round 3's finding
R3-B: D4 requires no durability. The paragraph immediately after it
(`docs/specs/done/WP-preservation-abort-widening.md:419-433`) says neither D1/D2
removal is crash-durable, so what a resurrection leaves is an unpriced
POST-COMPLETION residual, and O11 ADDS a property rather than enforcing one. See
"Round 3" below.]** Rows
**D1** and **D2** name that owned path as `tmp` before the commit and `dest` after
it — **so the same reasoning covers M2**, and `QD-P11` shows both leftovers in the
same trace. **[CORRECTED — round 3's finding R3-C: `QD-P11`'s two removals are `:995` (M1) and `:1020` (M3); the shared catch at `:984` returns before any `fsync` and is not in that trace. M2 is measured by `QD-P12`, added in round 3. See "Round 3" below.]**

**Disposition: DECIDE M3 (and M2) ON THEIR OWN, under the standing process, with
BOTH options priced — and the decision is (b), CLOSE THEM.** Both prices are in
the spec's owner item **O11** and are not restated here. **(a) accept and name**
costs a shipped contract becoming untrue after the product reported success, with
nothing enumerating the shelf to find out. **(b)** — re-labelled by round 3 as a BEST-EFFORT flush rather than a closure — costs one best-effort
directory flush per failure path, `2.0–2.7 ms` (`QD-P2`) on an arm that is already
failing, reusing the existing `flushDir` helper, best-effort so no shipped
disposition changes, and no `fsync` at all on win32 per row **F5**.

**THE SUPERSEDED OUTCOME THEREFORE NARROWS — say it loudly.** This package stays
`Superseded` for **three** acts (M1, M4, M6). **Two acts (M2, M3) leave it** and
are filed as `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md`
(`Draft` — it has not run its own design gate, so it is not `Ready`).

**Scope note, stated because it widens the coordinator's framing by one act.** The
finding was raised against M3. The scope taken is *the owned paths D4 names on the
failure arms*, which is M2 as well — an acceptance predicate over the contract
rather than a list of the leftovers a review happened to notice. Enforcing D4 for
`dest` and not for `tmp` leaves the contract half-true; O11 prices the narrower
alternative too.

### R2-B — the ~1.6× ratio is M1's and no other row's. Plugin F1, band A; measured-claim

Correct, and the correction is a scoping. `QD-P10` measured an interval that an
application flush ENDS — the unlink at `:995` followed by `qdir`'s flush at
`:1006`. **M4 and M6 have no subsequent application flush at all, and M3's did not
end at the return either**, so no width and no narrowing ratio can be derived for
them from M1's figures. **FIX:** the ratio now lives in M1's cell alone and says
outright that it is that row's; M2, M3, M4 and M6 each say **"unbounded by any
application flush"**, with the honest addition that such an interval ends only at
the platform's own writeback, which this product neither requests nor observes and
which is not measured here. Every generalising pricing sentence in O8 is gone with
the universal sentence.

### R2-C — an uncapped withheld twin is not retained forever. Plugin F2, band A; contract

Correct, and both citations check out. `docs/GLOSSARY.md:141-144` says
`state/quarantine/` holds a withheld note *"kept for as long as the owner leaves it
there"* and calls `redacted/` *"disposable"*; `src/core/dream/promote.js:600-603`
renders `REMEDIATION_GUIDANCE`, whose `delete` value is *"Nothing was promoted for
this path; delete that copy."* **FIX:** row **M6** and owner item **O10** now say
the twin exists **at the identity check** and has no automatic cap — which is not
permanence — and that once the owner deletes it a resurrected `redacted/` copy is
no longer a duplicate of retained bytes. **No lifetime or disclosure equivalence is
claimed anywhere**, and the F7(a) clause carries none either.

### R2-D — the shelf stub reversed the only-copy distinction. Plugin F3, band B; contract

Correct. **FIX**, in `docs/specs/WP-quarantine-only-copy-shelf.md`: both shelves
are now described as potentially holding sole surviving bytes — a withheld copy can
be the only surviving form of the run's ADDITIONS, since nothing was promoted and
the workspace is destroyed; a `redacted/` copy is the only surviving form of the
unscrubbed content. **The refused-note/redacted-only fall-through is carried
explicitly** alongside successful redaction, citing
`WP-quarantine-banner-location:410-455`'s measured verdict and
`WP-preservation-abort-widening` **Table P row P3**. The shelves are now
distinguished by **retention and visibility**, not by replaceability.

### R2-E — the mirror registry asserted facts the tool disproves. Shadow F2, band B; mirror

Correct on both halves. **FIX, and the durable half is a deletion.** (i) The spec
no longer states an ambiguity COUNT at all: the earlier draft said "exactly one",
the tool said nine, and this round's own checklist edits moved it again — a number
beside a list is a number waiting to be falsified, so the count now lives only
where it is produced, beside the tip it ran on. Round zero's two stale statements
(this record's C1 cell and its coherence-pass line) carry forward pointers rather
than rewrites. (ii) The stub is registered honestly as a **cross-document mirrored
SUMMARY** rather than a citation — it repeats M4's and M6's persistence result and
M5's `QD-P3`/`QD-P4` predicate locally, because a stub opened cold cannot be a bare
pointer — and it now **cites row M5 explicitly**. `WP-quarantine-failed-preserve-disposal-flush`
is registered the same way.

**The scoped walk, re-run after every fix in this round, pasted rather than
described:**

```text
mirror-walk (scope: quarantine-disposal): 14 checklist entries across 1 specs (1 scanned)
  row references: 18   table references: 2   spec-path references: 3
  skipped: 4 ids whose letter names no table in scope (another addressing scheme, not a mirror) — --skipped lists them

AMBIGUOUS — 11 references. Reported, NEVER failed: the canonical table-letter map records these collisions as resolved by prose qualification, which no parser can check. Distinct colliding surfaces:
  Table M → WP-147-managed-block-separator-roundtrip.md | WP-launcher-no-self-resync-republish.md | WP-quarantine-disposal-durability.md | WP-refusal-remedy-discriminator.md   (1 entry)
  row M2 → WP-dream-promote-module.md | WP-launcher-no-self-resync-republish.md | WP-quarantine-disposal-durability.md | WP-refusal-remedy-discriminator.md   (2 entries)
  row M3 → WP-dream-promote-module.md | WP-launcher-no-self-resync-republish.md | WP-quarantine-disposal-durability.md   (2 entries)
  row M4 → WP-launcher-no-self-resync-republish.md | WP-quarantine-disposal-durability.md   (2 entries)
  row M5 → WP-launcher-no-self-resync-republish.md | WP-quarantine-disposal-durability.md   (2 entries)
  row M6 → WP-launcher-no-self-resync-republish.md | WP-quarantine-disposal-durability.md   (2 entries)
  (--ambiguous lists every site)

RESOLVED — every table letter, table-row id and spec path this run EXTRACTED from these
```

`node scripts/mirror-walk.js` unscoped: **UNRESOLVED block byte-identical to the
base's fourteen pre-existing entries**, verified by diff.

**Both-directions re-proved after every fix in this round: twelve deliberately
broken states, all RED, control and finished tree GREEN.** The new one this round
requires is **r12**, the failed-preserve successor stub deleted so O11 routes to a
name again (`FAILED at: test -f docs/specs/WP-quarantine-failed-preserve-disposal-flush.md`).

### What round 2 did NOT change

- **Any shipped contract or posture.** Table D, F, N and P are cited and
  unamended; O11's answer changes `src/`, but inside a successor package with its
  own design gate, not here.
- **The three permanent exclusions.** M1, M4 and M6 keep their decisions; what
  changed at M1 and M6 is the REASON stated, not the decision.
- **The verification surface.** No fifth step. V1's key literal and V3's file list
  were re-scoped because the fixes moved their targets, which the round rule
  permits; V2's three-edit reconstruction is unchanged in shape.
- **The stop criterion**, which is unchanged and governed round 2 as written.

### Round 3 is owed

R2-A is HEAVY and the design answer rewrote the disposition's shape, so a **full
fresh external round runs on the revised tip**, with the prior findings listed and
the reviewer asked to verify each is genuinely fixed rather than re-worded, and to
attack the new mechanisms: the per-act column and the absence of any spanning
claim, the split F7(a) clause, O11's pricing, the two-act scope, the corrected M6
and O10 lifetime statements, and both filed stubs.

## Round 3

**Branch:** `docs/wp-quarantine-disposal-durability`. **Tip reviewed:**
`40504f64d3e12577ef2f5f313138564683bf6a8b`, base `main` `66b2b1f8`. Both channels
executed; porcelain identical before and after. Plugin: 2 findings, both graded
band A in their bodies. Shadow: 2 A + 2 B. **No scope objections, and no finding
reverses O8–O11** — both channels said so in their own words. Both again reported
the environment limits `QD-P1` already covers; no crash was staged.

**THE BAND GATE DOES NOT CLOSE THIS ROUND** (four band-A findings), **and the
ladder routes every one of them below the OWNER rung.** None argues to build the
package or to flip a decision; all are DECISION SUPPORT — two of them about
sentences that argue where the rows already decide. **The repeat-kind rule does not
fire a second design change:** round 2's design answer stands, and what round 3
found is that three sentences had not yet been brought into line with it. Every
fix below is a deletion, a re-label, a priced residual or a measurement — no new
argument paragraph, and the verification surface did not grow.

### R3-A — option (b) was labelled CLOSE but is best-effort. Plugin F1 + shadow F1, band A, CONVERGED; contract, M2/M3's decision SUPPORT

Both channels executed the shipped code with O11's proposed calls added and found
the same thing, and it checks out on inspection: `flushDir`
(`src/core/dream/validate.js`) catches its own open and `fsync` failures and
returns `false`; O11's proposal ignores that boolean; so on a failed flush the
caller carries on, publishes and commits — **the exact R2-A state option (b)
claimed to remove**. On win32 the same outcome is deterministic, because
`DURABILITY_AVAILABLE` is false and no flush is issued at all (`QD-P7`).

**Disposition: RE-LABEL, not more machinery — and the re-label is the honest
contract.** Option (b) is now stated everywhere as **a BEST-EFFORT directory flush
after each failure-path removal: a COMPLETED POSIX flush closes that removal's
post-completion window; a failed flush, and every win32 run, RETAIN the residual**,
which is the same class owner item **O10** parks and is priced in O11 rather than
hidden by the word "close". **The fail-loud alternative is NOT decided here** —
it would add a new failure class on an arm that is already failing, and its cost is
a preservation that today falls through to the withhold arm (`validate.js:1429`)
instead aborting the whole run. It is named as **the successor's own gate's
question**, with that cost, so it is not lost. **Aligned in one pass:** the
successor's `title:` and `#` heading, its Context, its new acceptance-predicate
paragraph, O11, rows **M2** and **M3**, the Security checklist and the F7(a)
clause.

### R3-B — O11 priced (a) as leaving an existing contract false. Plugin F2, band A; contract

Correct, and the citation is decisive. Table D row **D4** says *"`null` means the
owned path is absent"* — but the paragraph immediately after it
(`docs/specs/done/WP-preservation-abort-widening.md:419-433`) says in its own
words: *"Neither P0b's read-back nor D1/D2's removal is crash-durable … an unlink
is not durable until the containing directory is flushed."* And
`WP-quarantine-preserve-durability` row **F7(a)** already discloses resurrection
after a failure-path removal.

**So D4 carries no durability requirement, and every sentence saying a
resurrection makes it FALSE is withdrawn.** **Disposition: RE-PRICE.** (b) **ADDS**
a durability property; it enforces none. (a) ACCEPT is now priced as **keeping
today's disclosed non-durability**, whose cost is that the POST-COMPLETION
residual — a run that finished and published a record omitting an artifact a crash
can restore — **stays, and was unpriced anywhere until this package measured it**.
D1 and D2 still justify treating both owned paths alike; they justify nothing
about an existing guarantee. Corrected in O11, in rows **M2** and **M3**, in O8's
"what does not survive" paragraph, in the spec header, in the Security checklist,
in the F7(a) clause and in the successor stub; round 2's own sentence is marked
`[WITHDRAWN]` in place, this record being append-only.

### R3-C — `QD-P11` was cited as measurement of M2. Shadow F2 (band B) + plugin; measured-claim

Correct: `QD-P11` injects the artifact-`fsync` failure AFTER the commit, so its two
removals are `validate.js:995` (M1) and `:1020` (M3). The shared catch at `:984`
returns before any `fsync` and cannot appear in it.

**Disposition: option (i) — a dedicated probe, taken, and it was one driver run.**
**`QD-P12`** makes the FIRST `linkSync` throw, so the redacted COMMIT fails and the
shared catch executes; it then follows the outer redact fallback through record
publication and exercises the resurrected temp's later `O_EXCL` collision:

```text
linkSync #1 -> THROWS (injected: the redacted COMMIT fails, so the shared catch at :984 runs)
rm quarantine/redacted/.tmp-<pid>-fp.md
linkSync #2
rm quarantine/.tmp-<pid>-fp.md
fsync artifact
fsync dir quarantine
fsync dir <stateDir>
fsync dir ..
```

```text
reached_M2_shared_catch_at_984: true
dest_removal_index_should_be_minus_1: -1
fsyncs_of_redacted_dir_ANYWHERE: 0
verdict_kind: "refuse"
published_preservation_record: [{ "artifact": "2026-07-02-fp.md", "location": "quarantine" }]
later_preserve_returned: "null"
resurrected_temp_still_present: true
resurrected_temp_bytes_unchanged: true
```

**M2 is therefore MEASURED, not a contract inference**, and its cell now cites its
own probe. Every "`QD-P11` shows both leftovers" sentence is corrected — in O11, in
the successor stub, and in place in the round-2 section.

### R3-D — M6 still rested on an equivalence. Shadow F3, band A; contract, M6's decision SUPPORT

Correct. The row admitted the owner may delete the twin and then concluded the
states were identical "because the record omits it either way". They are not.
**Re-modelled with M3's three-state distinction, code-derived and labelled as
such:** **PRE-RETURN** — a crash before `validate.js:1490` stops the gate returning
at `:1497`, so nothing is published and nothing instructed the owner to delete
anything; **POST-COMPLETION** — the gate returns, the run publishes and commits a
record naming the withheld copy alone; **POST-OWNER-DELETION** — the owner follows
`src/core/dream/promote.js:600-603`'s *"delete that copy"*, and a later power loss
restores the `redacted/` entry as the **SOLE surviving form of those bytes**, on a
shelf no banner announces.

**DECISION, under the standing process: M6's no-flush STANDS, and it now stands as
an explicitly priced ACCEPTANCE inside owner item O10 — never on an equivalence,
which is exactly the condition the finding set.** O10's cell names that exact
state and prices the alternative: one `flushDir` of `state/quarantine/redacted/`
after `validate.js:1491`, at `QD-P2`'s **2.0–2.7 ms**. **The decision did NOT
move, so there is no O12**; the asymmetry with M2/M3 is stated where a reader will
challenge it, on two measured differences — M6's hazard needs a LATER, SEPARATE
user action before it is sole-surviving, and M6's flush would land on a path that
SUCCEEDED (every refusal that dedups pays it) where M2's and M3's land on an arm
already failing. O10's overrule cost is M6 joining the successor as a third act.

### R3-E — two spanning sentences survived outside Table M. Shadow F4, band B; record

Correct, and both are **DELETED**. Context's *"this package's answer is that none
of them needs one"* is replaced by exactly **"Only Table M's decision column
governs; no rule spans the acts."** The platform paragraph's *"the same equivalence
that carries every other row"* is replaced by the same pointer, scoped to win32.
**Grep count for both sentences: 0.** The claim sweep was then re-run across all
five documents for any other universal over the acts, for the withdrawn D4
falsification and for the "close it" label; the only surviving hits are inside
explicit `[WITHDRAWN]` / `[CORRECTED]` markers, which is what an append-only record
should look like.

**Both-directions re-proved after every fix in this round: twelve deliberately
broken states, all RED, control and finished tree GREEN — unchanged in shape,
because nothing this round touched a verification target.**

### What round 3 did NOT change

- **Any decision.** O8, O9, O10 and O11 all stand; O11 is re-labelled and
  re-priced, O10 is extended to price M6's exact state, and neither reverses.
- **Any shipped contract or posture.** Table D, F, N and P remain cited and
  unamended.
- **The verification surface.** No fifth step, no new argument paragraph. Every
  fix was a deletion, a re-label, a priced residual or a measurement.
- **The stop criterion**, which is unchanged and governed round 3 as written.

### Round 4

Runs on the revised tip as the **closing confirmation**, unless a measurement
changes a decision. Attack surface: the best-effort labelling and its retained
residual, (a)'s re-priced cost, `QD-P12`'s reach, M6's priced acceptance and its
asymmetry with M2/M3, and the absence of any rule spanning the acts.
