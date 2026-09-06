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
- **Owner items O8 and O9** are recorded citation-only in
  `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`; their
  text and their enumerated overrule costs live in the spec's
  `## Dispatch precondition — owner items`, which governs.
- **Where the measurements ran: SCRATCH ONLY.** Every probe below ran under
  `/private/tmp/claude-501/.../scratchpad/architect4/`. `QD-P3`, `QD-P4` and
  `QD-P5` execute the SHIPPED `src/core/dream/validate.js` from a
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

**The post-commit removal of `tmp` is already inside Table F row F2's flushed
set**, because `tmp` lives in `qdir` and `qdir` is the chain's first member. That
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
| **C1** | The table-letter paragraph said the three colliding specs are "none of which this spec cites, and none of which is therefore in this spec's mirror-walk resolution scope" — **naming them is exactly what puts them in scope**, and `mirror-walk` reports one AMBIGUOUS reference (row **M5** against `WP-launcher-no-self-resync-republish`'s Table M) because of it | FIX: the paragraph now states the mirror-walk verdict, that the tool reports ambiguity and never fails on it, and that every row id in the spec means a row of THIS spec's Table M unless a path is given |
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
one AMBIGUOUS reference reported (C1's, resolved by prose qualification).
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

None yet. This record is round zero; the double-channel external rounds run next
under the STOP CRITERION above, and each round's row records the raw file's path
AND the SHA of the commit that introduced it.

| round | verdict | raw files (commit SHA) | findings and dispositions |
|---|---|---|---|
| 0 | — (internal) | this record | Z1–Z3 and C1–C9, all fixed or accepted above; one lint failure fixed by running |
